/**
 * 메인 앱 로직 - 출퇴근 관리 시스템
 */

const App = (() => {
    let state = {
        rawRecords: [],
        calculatedRecords: [],
        dates: [],
        departments: [],
        employees: {},
        hrRecords: {},           // 인사DB 데이터 (empId → hr record)
        uploadedFiles: [],       // 업로드된 파일 목록 (누적)
        originalFileBuffers: {}, // 원본 파일 버퍼 (fileName → Uint8Array)
        rowMap: {},              // _uid → {fileName, sheetName, rowIndex}
        deletedRowMap: {},       // 삭제된 행 _uid → {fileName, sheetName, rowIndex} (내보내기 시 공백 처리용)
        currentDept: '',
        currentProcess: '',
        currentView: 'chotcong', // 'chotcong' | 'hrdb' | 'dailyedit'
        currentDate: '',         // 일별 수정 선택 날짜
        searchQuery: ''
    };

    function init() {
        setupFileUpload();
        setupHrFileUpload();
        setupFilterBar();
        setupHrUpdateListener();
        setupDailyEditListener();
    }

    // ─── 뷰 전환 헬퍼 ───
    function setView(viewName) {
        state.currentView = viewName;
        document.getElementById('btn-hr-db')?.classList.toggle('active', viewName === 'hrdb');
        document.getElementById('btn-daily-edit')?.classList.toggle('active', viewName === 'dailyedit');

        const showDate = viewName === 'dailyedit';
        const dateLabel  = document.getElementById('daily-date-label');
        const dateSelect = document.getElementById('filter-date');
        if (dateLabel)  dateLabel.style.display  = showDate ? '' : 'none';
        if (dateSelect) dateSelect.style.display = showDate ? '' : 'none';
    }

    // ─── T2 출퇴근 파일 업로드 ───
    function setupFileUpload() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
    }

    function handleFile(file) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            showMessage('xlsx 또는 xls 파일만 업로드 가능합니다.', 'error');
            return;
        }
        showLoading(true);
        const statusEl = document.getElementById('upload-status');
        if (statusEl) statusEl.textContent = `${file.name} 로딩 중...`;

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const uint8Data = new Uint8Array(e.target.result);
                state.originalFileBuffers[file.name] = uint8Data; // 원본 버퍼 보관
                processData(uint8Data, file.name);
            } catch (err) {
                showMessage('파일 처리 중 오류: ' + err.message, 'error');
                console.error('[T2 파일 오류]', err);
                const sEl = document.getElementById('upload-status');
                if (sEl) sEl.textContent = '';
            } finally {
                showLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function processData(data, fileName) {
        const parsed = AttendanceParser.parseExcel(data, fileName);

        // _uid 할당: 'fileName::recordIndex' 형태로 레코드마다 고유 ID 부여
        parsed.records.forEach((r, i) => { r._uid = fileName + '::' + i; });

        // rowMap 재구성: _uid 기반으로 저장 (parser의 key = recordIndex)
        Object.entries(parsed.rowMap).forEach(([idx, entry]) => {
            const uid = fileName + '::' + idx;
            state.rowMap[uid] = { ...entry, fileName };
        });

        // rawRecords 병합: 같은 파일 재업로드 시 해당 파일 레코드만 교체 (중복 제거 없음)
        state.rawRecords = state.rawRecords.filter(r => !r._uid.startsWith(fileName + '::'));
        parsed.records.forEach(r => state.rawRecords.push(r));

        // 같은 파일 재업로드 시 해당 파일의 deletedRowMap 항목도 초기화
        Object.keys(state.deletedRowMap).forEach(uid => {
            if (uid.startsWith(fileName + '::')) delete state.deletedRowMap[uid];
        });

        // 메타데이터 재산출
        state.dates       = [...new Set(state.rawRecords.map(r => r.dateStr))].sort();
        state.departments = [...new Set(state.rawRecords.map(r => r.dept))].sort();
        state.rawRecords.forEach(r => {
            if (!state.employees[r.empId])
                state.employees[r.empId] = { empId: r.empId, empName: r.empName, dept: r.dept, position: r.position };
        });

        state.calculatedRecords = AttendanceCalculator.calculateAll(state.rawRecords);

        // 일별 수정용 현재 날짜 초기화 (가장 첫 날짜)
        if (state.dates.length > 0 && !state.currentDate) {
            state.currentDate = state.dates[0];
        }

        // 파일 목록 누적
        if (!state.uploadedFiles.includes(fileName)) state.uploadedFiles.push(fileName);

        AttendanceRenderer.updateStats(state.calculatedRecords);
        populateDeptSelect(state.departments);
        populateProcessFilter(state.currentDept);
        renderView();
        updateUploadFileList();

        const statusEl = document.getElementById('upload-status');
        if (statusEl) statusEl.textContent = '';

        document.getElementById('dashboard-section').style.display = 'block';
        document.getElementById('welcome-section').style.display = 'none';
        showMessage(`${fileName} 추가 완료! (누적 ${state.rawRecords.length.toLocaleString()}건 / ${state.dates.length}일)`, 'success');
    }

    // 업로드 파일 목록 및 초기화 버튼 갱신
    function updateUploadFileList() {
        const dropZone = document.getElementById('drop-zone');
        if (!dropZone) return;
        dropZone.classList.add('uploaded');
        const fileCount = state.uploadedFiles.length;
        const empCount  = Object.keys(state.employees).length;
        dropZone.querySelector('.drop-text').innerHTML =
            `<strong>${fileCount}개 파일 누적</strong> (${state.dates.length}일 / ${empCount}명 / ${state.rawRecords.length.toLocaleString()}건)<br>
             <small style="color:#6b7280;">${state.uploadedFiles.slice(-3).join(', ')}${fileCount > 3 ? ' 외 ' + (fileCount - 3) + '개' : ''}</small><br>
             <small style="color:#9ca3af;">클릭하여 파일 추가</small>`;

        // 초기화 버튼 표시
        let resetBtn = document.getElementById('btn-reset-data');
        if (!resetBtn) {
            resetBtn = document.createElement('button');
            resetBtn.id = 'btn-reset-data';
            resetBtn.className = 'btn btn-reset';
            resetBtn.textContent = '초기화';
            resetBtn.addEventListener('click', resetAllData);
            const filterActions = document.querySelector('.filter-actions');
            if (filterActions) filterActions.prepend(resetBtn);
        }
    }

    // 전체 데이터 초기화
    function resetAllData() {
        if (!confirm('누적된 모든 데이터를 초기화하시겠습니까?')) return;
        state.rawRecords          = [];
        state.calculatedRecords   = [];
        state.dates               = [];
        state.departments         = [];
        state.employees           = {};
        state.uploadedFiles       = [];
        state.originalFileBuffers = {};
        state.rowMap              = {};
        state.deletedRowMap       = {};
        state.currentDept         = '';
        state.currentProcess      = '';
        state.currentDate         = '';

        const dropZone = document.getElementById('drop-zone');
        if (dropZone) {
            dropZone.classList.remove('uploaded');
            dropZone.querySelector('.drop-text').innerHTML =
                `<span class="drop-icon">📂</span>파일 드래그 또는 클릭하여 선택<br><small>Chi Tiết Chấm Công / T2.xlsx</small>`;
        }
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('welcome-section').style.display   = 'block';
        document.getElementById('btn-reset-data')?.remove();
        setView('chotcong');
        populateDeptSelect([]);
        populateProcessFilter('');
        showMessage('데이터가 초기화되었습니다.', 'success');
    }

    // ─── 인사DB 파일 업로드 ───
    function setupHrFileUpload() {
        const dropZone = document.getElementById('hr-drop-zone');
        const fileInput = document.getElementById('hr-file-input');
        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleHrFile(file);
        });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => { if (e.target.files[0]) handleHrFile(e.target.files[0]); });
    }

    function handleHrFile(file) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            showMessage('xlsx 또는 xls 파일만 업로드 가능합니다.', 'error');
            return;
        }
        showLoading(true);
        const statusEl = document.getElementById('hr-upload-status');
        if (statusEl) statusEl.textContent = `${file.name} 로딩 중...`;

        const reader = new FileReader();
        reader.onload = e => {
            try {
                processHrData(new Uint8Array(e.target.result), file.name);
            } catch (err) {
                showMessage('인사DB 파일 처리 중 오류: ' + err.message, 'error');
            } finally {
                showLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function processHrData(data, fileName) {
        state.hrRecords = HrParser.parseHrExcel(data);
        const count = Object.keys(state.hrRecords).length;

        const dropZone = document.getElementById('hr-drop-zone');
        if (dropZone) {
            dropZone.classList.add('uploaded');
            dropZone.querySelector('.drop-text').innerHTML =
                `<strong>${fileName}</strong> 로드 완료<br>
                 <small>${count.toLocaleString()}명</small>
                 <br><small style="color:#9ca3af;">클릭하여 다른 파일 선택</small>`;
        }

        if (state.calculatedRecords.length > 0) {
            populateDeptSelect(state.departments);
            populateProcessFilter(state.currentDept);
            renderView();
        }

        const hrStatusEl = document.getElementById('hr-upload-status');
        if (hrStatusEl) hrStatusEl.textContent = '';

        showMessage(`인사DB 로드 완료! (${count}명)`, 'success');
    }

    // ─── 인사DB HR 필드 수정 / 신규 추가 이벤트 리스너 ───
    function setupHrUpdateListener() {
        document.addEventListener('hr:fieldupdate', e => {
            const { empId, field, value } = e.detail;
            if (!state.hrRecords[empId]) return;

            state.hrRecords[empId][field] = value;

            if (['allowanceProcess', 'allowanceSeniority', 'allowanceChild', 'allowanceOther'].includes(field)) {
                const hr = state.hrRecords[empId];
                hr.allowanceTotal = (hr.allowanceProcess || 0) + (hr.allowanceSeniority || 0)
                                  + (hr.allowanceChild || 0) + (hr.allowanceOther || 0);
                const row = document.querySelector(`tr[data-empid="${CSS.escape(empId)}"]`);
                if (row) {
                    const totalCell = row.querySelector('[data-field="allowanceTotal"]');
                    if (totalCell && !totalCell.classList.contains('editing')) {
                        totalCell.textContent = hr.allowanceTotal.toLocaleString();
                    }
                }
            }

            if (state.currentView === 'chotcong' && ['empName', 'process'].includes(field)) {
                renderView();
            }
        });

        document.addEventListener('hr:addrecord', e => {
            const { empId } = e.detail;
            if (!empId) return;

            if (state.hrRecords[empId]) {
                showMessage(`사번 "${empId}"는 이미 존재합니다.`, 'error');
                return;
            }

            state.hrRecords[empId] = {
                empId,
                empName: '', hireDate: '', dept: '', process: '',
                allowanceProcess: 0, allowanceSeniority: 0,
                allowanceChild: 0, allowanceOther: 0, allowanceTotal: 0,
                idNumber: '', bankAccount: '', bankName: ''
            };

            const countEl = document.getElementById('filter-count');
            if (countEl && state.currentView === 'hrdb') {
                countEl.textContent = `${Object.keys(state.hrRecords).length}명`;
            }

            showMessage(`${empId} 직원이 추가되었습니다. 나머지 정보를 입력하세요.`, 'success');
        });

        document.addEventListener('hr:requestrender', () => {
            renderView();
            setTimeout(() => AttendanceRenderer.addNewHrRow('hr-container'), 100);
        });
    }

    // ─── 일별 수정 이벤트 리스너 ───
    function setupDailyEditListener() {
        // ── 행 삭제 ──
        document.addEventListener('dailyedit:delete', e => {
            const { uid } = e.detail;
            // rowMap 항목을 삭제 전에 deletedRowMap에 보관 (내보내기 시 해당 Excel 행을 공백 처리)
            if (state.rowMap[uid]) {
                state.deletedRowMap[uid] = state.rowMap[uid];
            }
            state.rawRecords = state.rawRecords.filter(r => r._uid !== uid);
            delete state.rowMap[uid];
            state.calculatedRecords = AttendanceCalculator.calculateAll(state.rawRecords);
            renderDailyEditView();
        });

        document.addEventListener('dailyedit:update', e => {
            const { uid, field, value } = e.detail;

            // _uid로 정확한 레코드 찾기 (동일 사번+날짜 중복 레코드도 구분 가능)
            const raw = state.rawRecords.find(r => r._uid === uid);
            if (!raw) return;

            if (field === 'dayCode') {
                applyDayCodeToRaw(raw, value);
            } else if (field === 'checkIn' || field === 'checkOut') {
                const mins = parseHHMM(value);
                raw[field]         = mins;
                raw[field + 'Str'] = mins !== null ? formatMins(mins) : '-';

                // 주간 정상근무에서만 지각/조퇴 재산출
                const isRegular = raw.symbol !== 'V' && raw.symbol !== '--' && raw.shift !== 'T';
                if (isRegular) {
                    const WORK_START = 7 * 60 + 30;  // 07:30
                    const WORK_END   = 16 * 60 + 30; // 16:30
                    if (field === 'checkIn') {
                        raw.lateMin = (raw.checkIn !== null)
                            ? Math.max(0, raw.checkIn - WORK_START)
                            : 0;
                    } else {
                        raw.earlyMin = (raw.checkOut !== null && raw.checkOut < WORK_END)
                            ? Math.max(0, WORK_END - raw.checkOut)
                            : 0;
                    }
                }
            }

            // 전체 재계산
            state.calculatedRecords = AttendanceCalculator.calculateAll(state.rawRecords);

            // 해당 행의 computed 셀만 업데이트 (전체 재렌더링 없이)
            updateDailyEditRow(uid);
        });
    }

    // 근무유형 코드 변경 → raw 레코드 전체 필드 동기화
    // (내보내기 시 원본 Excel 컬럼과 1:1 매핑되므로 모든 관련 필드 갱신)
    function applyDayCodeToRaw(raw, code) {
        switch (code) {
            case 'N':   // 주간 정상근무
                raw.symbol      = 'X';
                raw.shift       = '';
                raw.symbolPlus  = raw.symbolPlus || '';  // OT 상태 유지
                raw.lateMin     = 0;  // checkIn 편집 시 리스너가 재산출
                raw.earlyMin    = 0;
                if (raw.dayOfWeekVN === 'CN' && raw.dayOfWeek !== '일') raw.dayOfWeekVN = '';
                break;

            case 'T':   // 야간근무
                raw.symbol      = 'X';
                raw.shift       = 'T';
                raw.symbolPlus  = raw.symbolPlus || '';
                raw.lateMin     = 0;
                raw.earlyMin    = 0;
                break;

            case 'PN':  // 연차/유급휴가 → Công+=1, Giờ+=8, Kí hiệu+=V
                raw.symbol      = 'V';
                raw.shift       = '';
                raw.checkIn     = null;  raw.checkInStr  = '-';
                raw.checkOut    = null;  raw.checkOutStr = '-';
                raw.workDays    = 0;
                raw.workHours   = 0;
                raw.otDays      = 1;
                raw.otHours     = 8;
                raw.symbolPlus  = 'V';
                raw.totalHours  = 0;
                raw.lateMin     = 0;
                raw.earlyMin    = 0;
                break;

            case 'NL':  // 공휴일 근무
                raw.symbol      = 'X';
                raw.shift       = '';
                raw.dayOfWeekVN = 'CN';
                raw.lateMin     = 0;
                raw.earlyMin    = 0;
                break;

            case 'NC':  // 특별휴가/보상휴무 → Công+=1, Giờ+=8
                raw.symbol      = 'V';
                raw.shift       = '';
                raw.checkIn     = null;  raw.checkInStr  = '-';
                raw.checkOut    = null;  raw.checkOutStr = '-';
                raw.workDays    = 0;
                raw.workHours   = 0;
                raw.otDays      = 1;
                raw.otHours     = 8;
                raw.symbolPlus  = 'V';
                raw.totalHours  = 0;
                raw.lateMin     = 0;
                raw.earlyMin    = 0;
                break;

            case 'D':   // 무단결근/미출근
                raw.symbol      = '--';
                raw.shift       = '';
                raw.checkIn     = null;  raw.checkInStr  = '-';
                raw.checkOut    = null;  raw.checkOutStr = '-';
                raw.workDays    = 0;
                raw.workHours   = 0;
                raw.otDays      = 0;
                raw.otHours     = 0;
                raw.symbolPlus  = '';
                raw.totalHours  = 0;
                raw.lateMin     = 0;
                raw.earlyMin    = 0;
                break;
        }
    }

    // HH:MM 문자열 → 분 단위 정수
    function parseHHMM(str) {
        if (!str || str.trim() === '' || str === '-') return null;
        const m = str.match(/^(\d{1,2}):(\d{2})$/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
    }

    // 분 → HH:MM 문자열
    function formatMins(mins) {
        if (mins === null || mins === undefined) return '-';
        return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    }

    // 일별 수정 뷰에서 단일 행의 computed 셀 업데이트 (재렌더링 없이)
    function updateDailyEditRow(uid) {
        const container = document.getElementById('dailyedit-container');
        if (!container) return;

        const tr = container.querySelector(`tr[data-uid="${CSS.escape(uid)}"]`);
        if (!tr) return;

        const calc = state.calculatedRecords.find(r => r._uid === uid);
        if (!calc) return;

        // 잔업
        const otCell = tr.querySelector('[data-computed="ot"]');
        if (otCell) {
            otCell.className = `de-td center${calc.overtimeClass > 0 ? ' ot-' + calc.overtimeClass : ''}`;
            otCell.textContent = calc.overtimeClass > 0 ? calc.overtimeClass + 'h' : '-';
        }
        // 지각
        const lateCell = tr.querySelector('[data-computed="late"]');
        if (lateCell) {
            lateCell.className = `de-td center${calc.lateMin > 0 ? ' de-late' : ''}`;
            lateCell.textContent = calc.lateMin > 0 ? calc.lateMin : '-';
        }
        // 조퇴
        const earlyCell = tr.querySelector('[data-computed="early"]');
        if (earlyCell) {
            earlyCell.className = `de-td center${calc.earlyMin > 0 ? ' de-early' : ''}`;
            earlyCell.textContent = calc.earlyMin > 0 ? calc.earlyMin : '-';
        }
        // 비고
        const noteCell = tr.querySelector('[data-computed="note"]');
        if (noteCell) noteCell.textContent = calc.note || '-';

        // 근무유형 select가 dayCode와 일치하지 않으면 동기화
        const dayCodeSel = tr.querySelector('.de-daycode');
        if (dayCodeSel && dayCodeSel.value !== calc.dayCode) {
            dayCodeSel.value = calc.dayCode;
        }
    }

    // ─── 통합 필터 바 이벤트 ───
    function setupFilterBar() {
        // 부서 select
        document.getElementById('filter-dept')?.addEventListener('change', e => {
            state.currentDept    = e.target.value;
            state.currentProcess = '';
            populateProcessFilter(state.currentDept);
            renderView();
        });

        // 공정 select
        document.getElementById('filter-process')?.addEventListener('change', e => {
            state.currentProcess = e.target.value;
            renderView();
        });

        // 날짜 select (일별 수정 모드)
        document.getElementById('filter-date')?.addEventListener('change', e => {
            state.currentDate = e.target.value;
            renderDailyEditView();
        });

        // 검색 input
        const searchInput = document.getElementById('filter-search');
        let searchTimer;
        searchInput?.addEventListener('input', e => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.searchQuery = e.target.value.trim();
                renderView();
            }, 250);
        });

        // 일별 수정 버튼
        document.getElementById('btn-daily-edit')?.addEventListener('click', () => {
            setView('dailyedit');
            renderView();
        });

        // 인사DB 관리 버튼
        document.getElementById('btn-hr-db')?.addEventListener('click', () => {
            setView('hrdb');
            renderView();
        });

        // Excel 내보내기 버튼
        document.getElementById('btn-export-chotcong')?.addEventListener('click', () => {
            if (state.calculatedRecords.length === 0) {
                showMessage('먼저 T2 파일을 업로드하세요.', 'error');
                return;
            }
            // 원본 파일이 있으면 원본 형식 유지 내보내기, 없으면 CHỐT CÔNG 형식
            if (Object.keys(state.originalFileBuffers).length > 0) {
                AttendanceExport.exportOriginalFormat(
                    state.originalFileBuffers,
                    state.rowMap,
                    state.rawRecords,
                    state.deletedRowMap
                );
            } else {
                AttendanceExport.exportChotCong(state.calculatedRecords, state.hrRecords);
            }
        });

        // 월 종합 내보내기 버튼 (CHỐT CÔNG 구조로 항상 내보내기)
        document.getElementById('btn-export-monthly')?.addEventListener('click', () => {
            if (state.calculatedRecords.length === 0) {
                showMessage('먼저 T2 파일을 업로드하세요.', 'error');
                return;
            }
            AttendanceExport.exportChotCong(state.calculatedRecords, state.hrRecords);
        });
    }

    // 부서 select 채우기 (인사DB 우선, T2 데이터 보완)
    function populateDeptSelect(departments) {
        const select = document.getElementById('filter-dept');
        if (!select) return;

        const hrDepts  = Object.values(state.hrRecords).map(r => r.dept).filter(Boolean);
        const allDepts = [...new Set([...departments, ...hrDepts])].sort();

        select.innerHTML = '<option value="">전체</option>' +
            allDepts.map(d =>
                `<option value="${d}"${d === state.currentDept ? ' selected' : ''}>${d}</option>`
            ).join('');
        select.value = state.currentDept;
    }

    // 공정 select 채우기 (인사DB 우선)
    function populateProcessFilter(dept) {
        const select = document.getElementById('filter-process');
        if (!select) return;

        const processes = new Set();

        if (Object.keys(state.hrRecords).length > 0) {
            Object.values(state.hrRecords).forEach(hr => {
                if ((!dept || hr.dept === dept) && hr.process) {
                    processes.add(hr.process);
                }
            });
        } else {
            const deptRecords = dept
                ? state.calculatedRecords.filter(r => r.dept === dept)
                : state.calculatedRecords;
            deptRecords.forEach(r => {
                if (r.position) processes.add(r.position);
            });
        }

        select.innerHTML = '<option value="">전체</option>' +
            [...processes].sort().map(p => `<option value="${p}">${p}</option>`).join('');
        select.value = state.currentProcess;
    }

    // 날짜 select 채우기 (일별 수정 모드)
    function populateDateSelect() {
        const select = document.getElementById('filter-date');
        if (!select) return;

        // 첫 날짜를 기본값으로
        if (!state.currentDate && state.dates.length > 0) {
            state.currentDate = state.dates[0];
        }

        select.innerHTML = state.dates.map(d =>
            `<option value="${d}"${d === state.currentDate ? ' selected' : ''}>${d}</option>`
        ).join('');
        select.value = state.currentDate;
    }

    // ─── 일별 수정 뷰 렌더링 ───
    function renderDailyEditView() {
        if (!state.currentDate && state.dates.length > 0) {
            state.currentDate = state.dates[0];
        }

        // 해당 날짜 레코드 필터링
        let dateRecords = state.calculatedRecords.filter(r => r.dateStr === state.currentDate);

        // 부서 필터
        if (state.currentDept) {
            dateRecords = dateRecords.filter(r => r.dept === state.currentDept);
        }

        // 공정 필터
        if (state.currentProcess) {
            dateRecords = dateRecords.filter(r => {
                const hr  = state.hrRecords[r.empId];
                const pos = (hr && hr.process) || r.position;
                return pos === state.currentProcess;
            });
        }

        // 검색 필터
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            dateRecords = dateRecords.filter(r =>
                r.empId.toLowerCase().includes(q) || r.empName.toLowerCase().includes(q)
            );
        }

        AttendanceRenderer.renderDailyEditTable(
            state.currentDate, dateRecords, state.hrRecords, 'dailyedit-container'
        );

        const countEl = document.getElementById('filter-count');
        if (countEl) countEl.textContent = `${dateRecords.length}명`;
    }

    // ─── 뷰 렌더링 ───
    function renderView() {
        const chotcongEl   = document.getElementById('chotcong-container');
        const hrEl         = document.getElementById('hr-container');
        const dailyeditEl  = document.getElementById('dailyedit-container');
        const countEl      = document.getElementById('filter-count');

        // 패널 표시/숨김
        if (chotcongEl)  chotcongEl.style.display  = state.currentView === 'chotcong'  ? 'block' : 'none';
        if (hrEl)        hrEl.style.display         = state.currentView === 'hrdb'      ? 'block' : 'none';
        if (dailyeditEl) dailyeditEl.style.display  = state.currentView === 'dailyedit' ? 'block' : 'none';

        if (state.currentView === 'hrdb') {
            const hrCount = Object.keys(state.hrRecords).length;
            if (countEl) countEl.textContent = `${hrCount}명`;
            AttendanceRenderer.renderHrTable(state.hrRecords, 'hr-container', state.searchQuery);
            return;
        }

        if (state.currentView === 'dailyedit') {
            populateDateSelect();
            renderDailyEditView();
            return;
        }

        // CHOT CONG (기본)
        if (state.calculatedRecords.length === 0) return;

        const deptRecords = state.currentDept
            ? state.calculatedRecords.filter(r => r.dept === state.currentDept)
            : state.calculatedRecords;

        AttendanceRenderer.renderChotCongTable(
            deptRecords,
            state.dates,
            state.searchQuery,
            'chotcong-container',
            state.hrRecords,
            state.currentProcess
        );

        if (countEl) {
            const empCount = new Set(deptRecords.map(r => r.empId)).size;
            countEl.textContent = `${empCount}명`;
        }
    }

    // ─── 유틸리티 ───
    function showLoading(show) {
        const loader = document.getElementById('loading-overlay');
        if (loader) loader.style.display = show ? 'flex' : 'none';
    }

    function showMessage(text, type = 'info') {
        const msgEl = document.getElementById('message-bar');
        if (!msgEl) return;
        msgEl.textContent = text;
        msgEl.className = `message-bar ${type}`;
        msgEl.style.display = 'block';
        setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
