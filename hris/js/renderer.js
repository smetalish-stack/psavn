/**
 * UI 렌더링 모듈
 */

const AttendanceRenderer = (() => {

    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

    // 인사DB 테이블 컬럼 정의 (renderHrTable + addNewHrRow 공유)
    // 너비 합계 ~1280px → 1400px 이상 화면에서 전체 표시
    const HR_COLS = [
        { key: 'empName',            label: '이름',      w: 128 },
        { key: 'hireDate',           label: '입사일',    w: 88  },
        { key: 'dept',               label: '부서',      w: 78  },
        { key: 'process',            label: '공정',      w: 108 },
        { key: 'allowanceProcess',   label: '공정수당',  w: 70, type: 'number' },
        { key: 'allowanceSeniority', label: '근속수당',  w: 70, type: 'number' },
        { key: 'allowanceChild',     label: '자녀수당',  w: 70, type: 'number' },
        { key: 'allowanceOther',     label: '기타수당',  w: 64, type: 'number' },
        { key: 'allowanceTotal',     label: '총수당',    w: 64, type: 'number', readonly: true },
        { key: 'idNumber',           label: '주민번호',  w: 108 },
        { key: 'bankAccount',        label: '계좌번호',  w: 130 },
        { key: 'bankName',           label: '은행명',    w: 155 },
    ];

    // HTML 이스케이프
    function esc(str) {
        return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /**
     * CHỐT CÔNG 스타일 테이블 렌더링
     */
    function renderChotCongTable(records, allDates, searchQuery, containerId, hrRecords, processFilter) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML = '<div class="empty-state">선택한 부서의 데이터가 없습니다.</div>';
            return;
        }

        hrRecords = hrRecords || {};

        // 직원별 그룹핑 (인사DB 우선 적용)
        const empMap = {};
        records.forEach(r => {
            if (!empMap[r.empId]) {
                const hr = hrRecords[r.empId];
                empMap[r.empId] = {
                    empId:    r.empId,
                    empName:  (hr && hr.empName)  || r.empName,
                    dept:     r.dept,
                    position: (hr && hr.process)  || r.position,
                    byDate:   {}
                };
            }
            empMap[r.empId].byDate[r.dateStr] = r;
        });

        let empList = Object.values(empMap).sort((a, b) => a.empId.localeCompare(b.empId));

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            empList = empList.filter(e =>
                e.empId.toLowerCase().includes(q) || e.empName.toLowerCase().includes(q)
            );
        }

        if (processFilter) {
            empList = empList.filter(e => (e.position || '') === processFilter);
        }

        if (empList.length === 0) {
            container.innerHTML = '<div class="empty-state">검색 결과가 없습니다.</div>';
            return;
        }

        // 해당 월 1일부터 마지막 날짜까지 연속 범위 확장 (빈 날짜도 컬럼으로 표시)
        // ★ 가장 많이 나타나는 연-월(dominant month) 기준으로 범위 결정
        //   → 잘못 파싱된 소수 날짜(다른 달)가 섞여도 올바른 달이 표시됨
        // ★ toISOString() 금지: UTC 변환으로 한국(UTC+9)에서 날짜 하루 밀림 → 로컬 날짜 문자열 사용
        const extDates = (() => {
            if (!allDates || allDates.length === 0) return allDates;
            const toLocalStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            // 가장 많이 나타나는 연-월 찾기
            const monthCount = {};
            allDates.forEach(d => {
                const ym = d.slice(0, 7);
                monthCount[ym] = (monthCount[ym] || 0) + 1;
            });
            const dominantYM = Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0][0];
            // dominant month 내 날짜만 필터링 → 그 중 마지막 날짜까지 범위 생성
            const monthDates = allDates.filter(d => d.startsWith(dominantYM));
            const last  = new Date(monthDates[monthDates.length - 1] + 'T00:00:00');
            const start = new Date(last.getFullYear(), last.getMonth(), 1);
            const result = [];
            for (let cur = new Date(start); cur <= last; cur.setDate(cur.getDate() + 1)) {
                result.push(toLocalStr(cur));
            }
            return result;
        })();

        const dateInfos = extDates.map(d => {
            const dt = new Date(d + 'T00:00:00');
            const dow = dt.getDay();
            return { dateStr: d, month: dt.getMonth() + 1, dayNum: dt.getDate(), dayName: DAY_NAMES[dow], isWeekend: dow === 0 || dow === 6 };
        });

        let html = `<div class="chotcong-wrapper"><table class="chotcong-table">`;

        html += `<thead><tr>
            <th class="sticky-col sc-0">NO</th>
            <th class="sticky-col sc-1">사번</th>
            <th class="sticky-col sc-2">이름</th>
            <th class="sticky-col sc-3">직위</th>
            <th class="sticky-col sc-4 sep-right">근무유형</th>`;

        dateInfos.forEach(di => {
            html += `<th class="th-date${di.isWeekend ? ' th-weekend' : ''}">
                <div class="date-num">${di.month}/${di.dayNum}</div>
                <div class="date-dow">${di.dayName}</div>
            </th>`;
        });

        html += `<th class="th-summary sep-left">합계</th>
            <th class="th-summary">지각</th>
            <th class="th-summary">조퇴</th>
            <th class="th-summary">결근</th>
            <th class="th-summary">연차</th>
        </tr></thead><tbody>`;

        const dayShift   = extDates.map(d => empList.filter(e => { const r = e.byDate[d]; return r && !r.isAbsent && !r.isLeave && !r.isNightShift; }).length);
        const nightShift = extDates.map(d => empList.filter(e => { const r = e.byDate[d]; return r && r.isNightShift; }).length);

        html += `<tr class="total-staff-row">
            <td class="sticky-col sc-0" colspan="4"><strong>Total: ${empList.length}명</strong></td>
            <td class="sticky-col sc-4 sep-right shift-label">Shift-Day</td>`;
        dayShift.forEach((c, i) => html += `<td class="td-date center${dateInfos[i].isWeekend ? ' td-weekend' : ''}">${c || ''}</td>`);
        html += `<td colspan="5" class="sep-left"></td></tr>`;

        html += `<tr class="total-night-row">
            <td class="sticky-col sc-0" colspan="4"></td>
            <td class="sticky-col sc-4 sep-right shift-label">Shift-Night</td>`;
        nightShift.forEach((c, i) => html += `<td class="td-date center${dateInfos[i].isWeekend ? ' td-weekend' : ''}">${c || ''}</td>`);
        html += `<td colspan="5" class="sep-left"></td></tr>`;

        empList.forEach((emp, idx) => {
            const bgCls = idx % 2 === 0 ? 'emp-even' : 'emp-odd';

            // ── 집계 계산 ──
            let dayWork = 0, nightWork = 0, sunDay = 0, sunNight = 0;
            let lateCount = 0, earlyCount = 0, absentDays = 0, leaveDays = 0;
            let otDay = 0, otNight = 0;
            extDates.forEach(d => {
                const r = emp.byDate[d];
                if (!r) return;
                if (r.isLeave)  { leaveDays++;  return; }
                if (r.isAbsent) { absentDays++; return; }
                if (r.lateMin  > 0) lateCount++;
                if (r.earlyMin > 0) earlyCount++;
                if (r.isHoliday && r.isNightShift)  { sunNight++; otNight += r.overtimeClass || 0; }
                else if (r.isHoliday)               { sunDay++;   otDay   += r.overtimeClass || 0; }
                else if (r.isNightShift)            { nightWork++; otNight += r.overtimeClass || 0; }
                else                                { dayWork++;  otDay   += r.overtimeClass || 0; }
            });

            // ── Row 1: Ca ngày (주간근무) ──
            html += `<tr class="subrow-cangay ${bgCls} emp-group-start">
                <td class="sticky-col sc-0 center emp-no" rowspan="9">${idx + 1}</td>
                <td class="sticky-col sc-1 emp-id" rowspan="9">${esc(emp.empId)}</td>
                <td class="sticky-col sc-2 emp-name" rowspan="9">${esc(emp.empName)}</td>
                <td class="sticky-col sc-3 emp-pos" rowspan="9">${esc(emp.position || '-')}</td>
                <td class="sticky-col sc-4 sep-right type-label">Ca ngày</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                if (r && r.isLeave) {
                    html += `<td class="td-date center status-PN${wk}">PN</td>`;
                } else if (r && r.isAbsent) {
                    html += `<td class="td-date center status-D${wk}">D</td>`;
                } else if (r && !r.isNightShift && !r.isHoliday) {
                    const code = r.dayCode || 'N';
                    html += `<td class="td-date center status-${code}${wk}">${code}</td>`;
                } else {
                    html += `<td class="td-date${wk}"></td>`;
                }
            });
            html += `<td class="sep-left center total-work-days">${dayWork || '-'}</td>
                <td class="center ${lateCount > 0 ? 'late-count' : ''}">${lateCount || '-'}</td>
                <td class="center">${earlyCount || '-'}</td>
                <td class="center ${absentDays > 0 ? 'absent-count' : ''}">${absentDays || '-'}</td>
                <td class="center">${leaveDays || '-'}</td>
            </tr>`;

            // ── Row 2: Đánh Giá (평가/출퇴근시간) ──
            html += `<tr class="subrow-danhgia ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label type-sub">Đánh Giá</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                if (!r || (r.checkIn === null && r.checkOut === null && !r.evalCode)) {
                    html += `<td class="td-date${wk}"></td>`;
                } else {
                    const eb = r.evalCode ? `<span class="eval-badge eval-${r.evalCode}">${r.evalCode}</span>` : '';
                    const ts = (r.checkIn !== null || r.checkOut !== null)
                        ? `${r.checkInStr}<br>${r.checkOutStr}` : '';
                    html += `<td class="td-date center time-cell${wk}">${eb}${ts}</td>`;
                }
            });
            html += `<td colspan="5" class="sep-left"></td></tr>`;

            // ── Row 3: OT (Day) (주간잔업) ──
            html += `<tr class="subrow-otday ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label type-sub">OT (Day)</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                const ot = (r && !r.isNightShift && !r.isHoliday) ? (r.overtimeClass || 0) : 0;
                html += `<td class="td-date center${ot > 0 ? ` ot-${ot}` : ''}${wk}">${ot > 0 ? ot : ''}</td>`;
            });
            html += `<td class="sep-left center ${otDay > 0 ? 'total-ot' : ''}">${otDay || ''}</td>
                <td colspan="4"></td></tr>`;

            // ── Row 4: Ca Đêm (야간근무) ──
            html += `<tr class="subrow-cadem ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label">Ca Đêm</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                if (r && r.isNightShift && !r.isHoliday) {
                    html += `<td class="td-date center status-T${wk}">T</td>`;
                } else {
                    html += `<td class="td-date${wk}"></td>`;
                }
            });
            html += `<td class="sep-left center">${nightWork || '-'}</td>
                <td colspan="4"></td></tr>`;

            // ── Row 5: OT (Night) (야간잔업) ──
            html += `<tr class="subrow-otnight ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label type-sub">OT (Night)</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                const ot = (r && r.isNightShift && !r.isHoliday) ? (r.overtimeClass || 0) : 0;
                html += `<td class="td-date center${ot > 0 ? ` ot-${ot}` : ''}${wk}">${ot > 0 ? ot : ''}</td>`;
            });
            html += `<td class="sep-left center ${otNight > 0 ? 'total-ot' : ''}">${otNight || ''}</td>
                <td colspan="4"></td></tr>`;

            // ── Row 6: Chủ Nhật (일요일 주간) ──
            html += `<tr class="subrow-chunhat ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label">Chủ Nhật</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                if (r && r.isHoliday && !r.isNightShift && !r.isAbsent && !r.isLeave) {
                    html += `<td class="td-date center status-NL${wk}">N</td>`;
                } else {
                    html += `<td class="td-date${wk}"></td>`;
                }
            });
            html += `<td class="sep-left center">${sunDay || '-'}</td>
                <td colspan="4"></td></tr>`;

            // ── Row 7: Đêm Chủ Nhật (일요일 야간) ──
            html += `<tr class="subrow-demcn ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label type-sub">Đêm CN</td>`;
            dateInfos.forEach(di => {
                const r = emp.byDate[di.dateStr];
                const wk = di.isWeekend ? ' td-weekend' : '';
                if (r && r.isHoliday && r.isNightShift && !r.isAbsent && !r.isLeave) {
                    html += `<td class="td-date center status-T${wk}">T</td>`;
                } else {
                    html += `<td class="td-date${wk}"></td>`;
                }
            });
            html += `<td class="sep-left center">${sunNight || '-'}</td>
                <td colspan="4"></td></tr>`;

            // ── Row 8: Ngày Lễ (공휴일 주간 — 추후 확장) ──
            html += `<tr class="subrow-ngayle ${bgCls}">
                <td class="sticky-col sc-4 sep-right type-label">Ngày Lễ</td>`;
            dateInfos.forEach(di => {
                html += `<td class="td-date${di.isWeekend ? ' td-weekend' : ''}"></td>`;
            });
            html += `<td class="sep-left center">-</td>
                <td colspan="4"></td></tr>`;

            // ── Row 9: Đêm Nghỉ Lễ (공휴일 야간 — 추후 확장) ──
            html += `<tr class="subrow-demnl ${bgCls} emp-group-end">
                <td class="sticky-col sc-4 sep-right type-label type-sub">Đêm NL</td>`;
            dateInfos.forEach(di => {
                html += `<td class="td-date${di.isWeekend ? ' td-weekend' : ''}"></td>`;
            });
            html += `<td class="sep-left center">-</td>
                <td colspan="4"></td></tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    /**
     * 인사DB 관리 테이블 렌더링
     * - 전체 행 표시 (max-height 없음, 페이지 스크롤)
     * - 직원 추가 버튼 포함
     */
    function renderHrTable(hrRecords, containerId, searchQuery) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let records = Object.values(hrRecords).sort((a, b) => a.empId.localeCompare(b.empId));

        if (records.length === 0) {
            container.innerHTML = `
                <div class="hr-toolbar">
                    <span class="hr-total-count">0명</span>
                    <button class="btn btn-add-emp" id="btn-add-employee">➕ 직원 추가</button>
                </div>
                <div class="empty-state">인사DB 파일을 업로드하세요.<br><small>위의 인사DB 업로드 영역에 파일을 드래그하거나 클릭하세요.</small></div>`;
            document.getElementById('btn-add-employee')?.addEventListener('click', () => addNewHrRow(containerId));
            return;
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            records = records.filter(r =>
                r.empId.toLowerCase().includes(q) || r.empName.toLowerCase().includes(q)
            );
        }

        const displayCount = records.length;
        const totalCount   = Object.keys(hrRecords).length;
        const countLabel   = searchQuery ? `${displayCount} / ${totalCount}명` : `${totalCount}명`;

        let html = `
            <div class="hr-toolbar">
                <span class="hr-total-count">${countLabel}</span>
                <button class="btn btn-add-emp" id="btn-add-employee">➕ 직원 추가</button>
            </div>
            <div class="hr-table-wrapper">
            <table class="hr-table">
            <thead><tr>
                <th class="hr-th-no">NO</th>
                <th class="hr-th-id">사번</th>`;

        HR_COLS.forEach(c => {
            html += `<th class="hr-th" style="min-width:${c.w}px">${c.label}${c.readonly ? ' <span class="hr-auto-badge">자동</span>' : ''}</th>`;
        });

        html += `</tr></thead><tbody>`;

        if (records.length === 0) {
            html += `<tr><td colspan="${HR_COLS.length + 2}" class="center" style="padding:24px;color:var(--gray-400);">검색 결과가 없습니다.</td></tr>`;
        } else {
            records.forEach((rec, idx) => {
                html += `<tr class="${idx % 2 === 0 ? 'hr-even' : 'hr-odd'}" data-empid="${esc(rec.empId)}">
                    <td class="hr-td center">${idx + 1}</td>
                    <td class="hr-td hr-id-cell">${esc(rec.empId)}</td>`;

                HR_COLS.forEach(c => {
                    const val = rec[c.key] !== undefined ? rec[c.key] : '';
                    const display = c.type === 'number' ? Number(val).toLocaleString() : String(val);
                    if (c.readonly) {
                        html += `<td class="hr-td hr-readonly" data-field="${c.key}">${esc(display)}</td>`;
                    } else {
                        html += `<td class="hr-td hr-editable" data-field="${c.key}" data-type="${c.type || 'text'}" title="클릭하여 수정">${esc(display)}</td>`;
                    }
                });

                html += `</tr>`;
            });
        }

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        // 기존 직원 편집 이벤트
        container.querySelectorAll('.hr-editable').forEach(cell => {
            cell.addEventListener('click', handleHrCellEdit);
        });

        // 직원 추가 버튼
        document.getElementById('btn-add-employee')?.addEventListener('click', () => addNewHrRow(containerId));
    }

    /**
     * 새 직원 행 추가 (tbody 맨 위에 삽입)
     */
    function addNewHrRow(containerId) {
        const container = document.getElementById(containerId);

        // 테이블이 없으면 먼저 렌더링 (업로드 전 상태)
        if (!container.querySelector('.hr-table')) {
            document.dispatchEvent(new CustomEvent('hr:requestrender'));
            return;
        }

        const tbody = container.querySelector('.hr-table tbody');
        if (!tbody) return;

        // 이미 NEW 행이 있으면 해당 행의 사번 셀 포커스
        const existing = tbody.querySelector('.hr-new-row');
        if (existing) {
            const idCell = existing.querySelector('.hr-id-editable');
            if (idCell && !idCell.classList.contains('editing')) idCell.click();
            existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const tr = document.createElement('tr');
        tr.className = 'hr-new-row';
        tr.dataset.empid = '';
        tr.dataset.isnew = 'true';

        // NO 셀
        const tdNo = document.createElement('td');
        tdNo.className = 'hr-td center hr-new-badge';
        tdNo.textContent = 'NEW';
        tr.appendChild(tdNo);

        // 사번 셀 (편집 가능)
        const tdId = document.createElement('td');
        tdId.className = 'hr-td hr-id-cell hr-editable hr-id-editable';
        tdId.dataset.field = 'empId';
        tdId.dataset.type  = 'text';
        tdId.title = '사번을 입력하세요';
        tdId.innerHTML = '<span class="hr-placeholder">사번 입력...</span>';
        tr.appendChild(tdId);

        // 나머지 컬럼 셀
        HR_COLS.forEach(c => {
            const td = document.createElement('td');
            if (c.readonly) {
                td.className = 'hr-td hr-readonly';
                td.dataset.field = c.key;
                td.textContent = '0';
            } else {
                td.className = 'hr-td hr-editable';
                td.dataset.field = c.key;
                td.dataset.type  = c.type || 'text';
                td.title = '클릭하여 입력';
            }
            tr.appendChild(td);
        });

        // tbody 맨 앞에 삽입
        tbody.insertBefore(tr, tbody.firstChild);

        // 사번 셀 특별 핸들러
        tdId.addEventListener('click', handleNewEmpIdEdit);

        // 나머지 셀은 일반 편집 핸들러 (사번 저장 후 활성화)
        tr.querySelectorAll('.hr-editable:not(.hr-id-editable)').forEach(cell => {
            cell.addEventListener('click', handleHrCellEdit);
        });

        // 자동으로 사번 입력 시작
        tdId.click();
        tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * 새 행 사번(empId) 편집 핸들러
     */
    function handleNewEmpIdEdit(e) {
        const cell = e.currentTarget;
        if (cell.classList.contains('editing')) return;

        const currentVal = cell.dataset.savedEmpId || '';
        cell.classList.add('editing');
        cell.innerHTML = `<input class="hr-cell-input" type="text" placeholder="예: SV-S00999" value="${esc(currentVal)}">`;

        const input = cell.querySelector('input');
        input.focus();
        input.select();

        let committed = false;

        function commit() {
            if (committed) return;
            committed = true;
            const newEmpId = input.value.trim();
            cell.classList.remove('editing');

            if (!newEmpId) {
                cell.innerHTML = '<span class="hr-placeholder">사번 입력...</span>';
                return;
            }

            cell.textContent = newEmpId;
            cell.dataset.savedEmpId = newEmpId;

            const tr = cell.closest('tr');
            tr.dataset.empid = newEmpId;

            // 앱에 신규 직원 등록 요청
            document.dispatchEvent(new CustomEvent('hr:addrecord', {
                detail: { empId: newEmpId }
            }));
        }

        function cancel() {
            if (committed) return;
            committed = true;
            cell.classList.remove('editing');
            const saved = cell.dataset.savedEmpId;
            if (saved) {
                cell.textContent = saved;
            } else {
                cell.innerHTML = '<span class="hr-placeholder">사번 입력...</span>';
            }
        }

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', evt => {
            if (evt.key === 'Enter') { evt.preventDefault(); input.blur(); }
            if (evt.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
        });
    }

    /**
     * 기존 직원 셀 인라인 편집 핸들러
     */
    function handleHrCellEdit(e) {
        const cell = e.currentTarget;
        if (cell.classList.contains('editing')) return;

        // 신규 행인 경우 사번이 확정되지 않으면 편집 막기
        const tr = cell.closest('tr');
        if (tr && tr.dataset.isnew && !tr.dataset.empid) {
            const idCell = tr.querySelector('.hr-id-editable');
            if (idCell) idCell.click();
            return;
        }

        const origVal = cell.textContent;
        const type    = cell.dataset.type || 'text';
        const inputVal = type === 'number' ? origVal.replace(/,/g, '') : origVal;

        cell.classList.add('editing');
        cell.innerHTML = `<input class="hr-cell-input" type="${type === 'number' ? 'number' : 'text'}" value="${inputVal.replace(/"/g, '&quot;')}">`;

        const input = cell.querySelector('input');
        input.focus();
        input.select();

        let committed = false;

        function commit() {
            if (committed) return;
            committed = true;
            const newVal  = type === 'number' ? (Number(input.value) || 0) : input.value.trim();
            const empId   = cell.closest('tr').dataset.empid;
            const field   = cell.dataset.field;
            cell.classList.remove('editing');
            cell.textContent = type === 'number' ? newVal.toLocaleString() : newVal;
            document.dispatchEvent(new CustomEvent('hr:fieldupdate', {
                detail: { empId, field, value: newVal }
            }));
        }

        function cancel() {
            if (committed) return;
            committed = true;
            cell.classList.remove('editing');
            cell.textContent = origVal;
        }

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', evt => {
            if (evt.key === 'Enter') { evt.preventDefault(); input.blur(); }
            if (evt.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
        });
    }

    /**
     * 일별 수정 테이블 렌더링
     * @param {string} dateStr - 선택된 날짜 (YYYY-MM-DD)
     * @param {Array} records - 해당 날짜의 계산된 레코드 배열
     * @param {Object} hrRecords - 인사DB 레코드
     * @param {string} containerId - 컨테이너 element ID
     */
    function renderDailyEditTable(dateStr, records, hrRecords, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        hrRecords = hrRecords || {};

        if (!records || records.length === 0) {
            container.innerHTML = '<div class="empty-state">선택한 날짜의 데이터가 없습니다.</div>';
            return;
        }

        const DAY_CODE_OPTS = [
            { v: 'N',  l: 'N  — 주간 정상' },
            { v: 'T',  l: 'T  — 야간' },
            { v: 'PN', l: 'PN — 연차' },
            { v: 'NL', l: 'NL — 공휴일' },
            { v: 'NC', l: 'NC — 결혼휴가' },
            { v: 'D',  l: 'D  — 결근' },
        ];

        const sorted = [...records].sort((a, b) => a.empId.localeCompare(b.empId));

        let html = `<div class="dailyedit-wrapper">
        <table class="dailyedit-table">
        <thead><tr>
            <th class="de-th de-th-no">NO</th>
            <th class="de-th">사번</th>
            <th class="de-th">이름</th>
            <th class="de-th">공정</th>
            <th class="de-th">근무유형</th>
            <th class="de-th">출근</th>
            <th class="de-th">퇴근</th>
            <th class="de-th">잔업</th>
            <th class="de-th">지각(분)</th>
            <th class="de-th">조퇴(분)</th>
            <th class="de-th de-th-note">비고</th>
            <th class="de-th de-th-del">삭제</th>
        </tr></thead><tbody>`;

        // 중복 감지: 같은 empId + dateStr 조합이 2개 이상인 행에 de-duplicate 클래스 부여
        const dupCountMap = {};
        sorted.forEach(r => {
            const k = r.empId + '|' + r.dateStr;
            dupCountMap[k] = (dupCountMap[k] || 0) + 1;
        });

        sorted.forEach((r, idx) => {
            const hr = hrRecords[r.empId] || {};
            const position = hr.process || r.position || '-';
            const empName  = hr.empName  || r.empName;
            const isDup  = dupCountMap[r.empId + '|' + r.dateStr] > 1;
            const rowCls = (idx % 2 === 0 ? 'de-even' : 'de-odd') + (isDup ? ' de-duplicate' : '');

            const dayCodeOpts = DAY_CODE_OPTS.map(o =>
                `<option value="${o.v}"${r.dayCode === o.v ? ' selected' : ''}>${o.l}</option>`
            ).join('');

            const checkInVal  = r.checkIn  !== null ? r.checkInStr  : '';
            const checkOutVal = r.checkOut !== null ? r.checkOutStr : '';
            const [hhIn,  mmIn]  = checkInVal  ? checkInVal.split(':')  : ['', ''];
            const [hhOut, mmOut] = checkOutVal ? checkOutVal.split(':') : ['', ''];

            html += `<tr class="${rowCls}" data-uid="${esc(r._uid)}" data-empid="${esc(r.empId)}" data-date="${esc(dateStr)}">
                <td class="de-td center de-no">${idx + 1}</td>
                <td class="de-td de-empid">${esc(r.empId)}</td>
                <td class="de-td de-empname">${esc(empName)}</td>
                <td class="de-td de-pos">${esc(position)}</td>
                <td class="de-td center">
                    <select class="de-select de-daycode" data-field="dayCode">${dayCodeOpts}</select>
                </td>
                <td class="de-td center">
                    <span class="de-time-wrap" data-field="checkIn">
                        <input class="de-input de-hh" type="text" inputmode="numeric"
                               value="${esc(hhIn)}" placeholder="HH" maxlength="2">
                        <span class="de-sep">:</span>
                        <input class="de-input de-mm" type="text" inputmode="numeric"
                               value="${esc(mmIn)}" placeholder="MM" maxlength="2">
                    </span>
                </td>
                <td class="de-td center">
                    <span class="de-time-wrap" data-field="checkOut">
                        <input class="de-input de-hh" type="text" inputmode="numeric"
                               value="${esc(hhOut)}" placeholder="HH" maxlength="2">
                        <span class="de-sep">:</span>
                        <input class="de-input de-mm" type="text" inputmode="numeric"
                               value="${esc(mmOut)}" placeholder="MM" maxlength="2">
                    </span>
                </td>
                <td class="de-td center${r.overtimeClass > 0 ? ' ot-' + r.overtimeClass : ''}" data-computed="ot">
                    ${r.overtimeClass > 0 ? r.overtimeClass + 'h' : '-'}
                </td>
                <td class="de-td center${r.lateMin > 0 ? ' de-late' : ''}" data-computed="late">
                    ${r.lateMin > 0 ? r.lateMin : '-'}
                </td>
                <td class="de-td center${r.earlyMin > 0 ? ' de-early' : ''}" data-computed="early">
                    ${r.earlyMin > 0 ? r.earlyMin : '-'}
                </td>
                <td class="de-td de-note" data-computed="note">${esc(r.note || '-')}</td>
                <td class="de-td center">
                    <button class="de-del-btn" title="행 삭제">✕</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        // ── 이벤트 바인딩 ──
        container.querySelectorAll('.de-daycode').forEach(sel => {
            sel.addEventListener('change', e => {
                const tr = e.target.closest('tr');
                document.dispatchEvent(new CustomEvent('dailyedit:update', {
                    detail: { uid: tr.dataset.uid, field: 'dayCode', value: e.target.value }
                }));
            });
        });

        // ── 시간 입력 (HH : MM 분리) ──
        container.querySelectorAll('.de-time-wrap').forEach(wrap => {
            const hhInp = wrap.querySelector('.de-hh');
            const mmInp = wrap.querySelector('.de-mm');
            const field = wrap.dataset.field;

            // HH:MM 값 조합 (둘 다 비면 빈 문자열 반환)
            function getTimeValue() {
                const hh = hhInp.value.trim();
                const mm = mmInp.value.trim();
                if (!hh && !mm) return '';
                return `${(hh || '00').padStart(2, '0')}:${(mm || '00').padStart(2, '0')}`;
            }

            [hhInp, mmInp].forEach(inp => {
                // 숫자키 + 제어키만 허용, 2자리 초과 차단
                inp.addEventListener('keydown', e => {
                    const ctrl = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
                                   'Tab', 'Home', 'End'];
                    if (ctrl.includes(e.key)) return;
                    if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
                    if (inp.value.replace(/\D/g, '').length >= 2) e.preventDefault();
                });
                // 숫자 외 문자 제거, HH 2자리 완성 시 MM으로 포커스 이동
                inp.addEventListener('input', e => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    if (inp === hhInp && e.target.value.length === 2) {
                        mmInp.focus();
                        mmInp.select();
                    }
                });
            });

            // wrap에서 포커스가 완전히 벗어날 때만 dailyedit:update 발송
            wrap.addEventListener('focusout', e => {
                if (wrap.contains(e.relatedTarget)) return;
                const tr = wrap.closest('tr');
                document.dispatchEvent(new CustomEvent('dailyedit:update', {
                    detail: { uid: tr.dataset.uid, field, value: getTimeValue() }
                }));
            });
        });

        // ── 행 삭제 버튼 ──
        container.querySelectorAll('.de-del-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const tr = e.target.closest('tr');
                document.dispatchEvent(new CustomEvent('dailyedit:delete', {
                    detail: { uid: tr.dataset.uid }
                }));
            });
        });
    }

    /**
     * 부서 탭 렌더링
     */
    function renderDeptTabs(departments, currentDept, tabsContainerId) {
        const container = document.getElementById(tabsContainerId);
        if (!container) return;
        container.innerHTML = departments.map(dept => {
            const active = dept === currentDept ? ' active' : '';
            return `<button class="dept-tab-btn${active}" data-dept="${esc(dept)}">${esc(dept)}</button>`;
        }).join('');
    }

    /**
     * 통계 카드 업데이트
     */
    function updateStats(calculatedRecords) {
        const totalEmp   = new Set(calculatedRecords.map(r => r.empId)).size;
        const totalDates = new Set(calculatedRecords.map(r => r.dateStr)).size;
        const totalOT    = calculatedRecords.filter(r => r.overtimeClass > 0).length;

        setTextContent('stat-employees', totalEmp);
        setTextContent('stat-dates', totalDates + '일');
        setTextContent('stat-records', calculatedRecords.length.toLocaleString());
        setTextContent('stat-overtime', totalOT.toLocaleString() + '건');
    }

    function setTextContent(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    return {
        renderChotCongTable,
        renderDailyEditTable,
        renderHrTable,
        addNewHrRow,
        renderDeptTabs,
        updateStats
    };
})();
