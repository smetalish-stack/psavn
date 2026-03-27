/**
 * Excel 내보내기 모듈
 */

const AttendanceExport = (() => {

    /**
     * 일자별 데이터를 Excel로 내보내기
     */
    function exportDailyToExcel(records, dateStr) {
        const data = records.map((r, idx) => ({
            'No': idx + 1,
            '사번': r.empId,
            '이름': r.empName,
            '부서': r.dept,
            '날짜': r.dateStr,
            '요일': r.dayOfWeek,
            '출근': r.checkInStr,
            '퇴근': r.checkOutStr,
            '정상근무(h)': r.regularHours,
            '잔업구분': r.overtimeClassLabel || '-',
            '잔업시간(h)': r.overtimeClass || 0,
            '지각(분)': r.lateMin || 0,
            '조퇴(분)': r.earlyMin || 0,
            '비고': r.note || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);

        // 컬럼 너비 설정
        ws['!cols'] = [
            { wch: 5 },   // No
            { wch: 12 },  // 사번
            { wch: 20 },  // 이름
            { wch: 15 },  // 부서
            { wch: 12 },  // 날짜
            { wch: 5 },   // 요일
            { wch: 8 },   // 출근
            { wch: 8 },   // 퇴근
            { wch: 10 },  // 정상근무
            { wch: 10 },  // 잔업구분
            { wch: 10 },  // 잔업시간
            { wch: 8 },   // 지각
            { wch: 8 },   // 조퇴
            { wch: 20 }   // 비고
        ];

        const wb = XLSX.utils.book_new();
        const sheetName = dateStr ? `일자별_${dateStr}` : '일자별_전체';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const filename = dateStr
            ? `근태_일자별_${dateStr}.xlsx`
            : `근태_일자별_전체.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    /**
     * 부서별 집계를 Excel로 내보내기
     */
    function exportDeptToExcel(deptSummary, dateStr) {
        const data = deptSummary.map((d, idx) => ({
            'No': idx + 1,
            '부서명': d.dept,
            '인원수': d.employeeCount,
            '출근': d.attendees,
            '휴가': d.leaves,
            '정상근무(h)': d.totalRegularHours,
            '잔업2h(명)': d.ot2Count,
            '잔업3h(명)': d.ot3Count,
            '잔업4h(명)': d.ot4Count,
            '총 잔업(h)': d.totalOvertimeHours,
            '지각': d.lateCount,
            '조퇴': d.earlyCount
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [
            { wch: 5 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
            { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '부서별집계');

        const filename = dateStr
            ? `근태_부서별_${dateStr}.xlsx`
            : `근태_부서별_전체.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    /**
     * CHỐT CÔNG 양식 Excel 내보내기
     * 원본 CHỐT CÔNG 파일과 동일한 구조:
     *   - 시트 = 부서
     *   - 열: NO | 사번 | 이름 | CMTND | 입사일 | 직위 | 수당 | 라벨 | 1~31일 | Total | 지각 | 조퇴 | 유급휴가 | 무단결근 | 계좌 | 은행명 | 서명
     *   - 직원당 9개 서브행
     */
    function exportChotCong(allRecords, hrRecords) {
        if (!allRecords || allRecords.length === 0) return;
        hrRecords = hrRecords || {};

        // ── dominant month 결정 (가장 많이 등장하는 연-월) ──
        const allDateStrs = [...new Set(allRecords.map(r => r.dateStr))].sort();
        if (allDateStrs.length === 0) return;
        const monthCount = {};
        allDateStrs.forEach(d => { const ym = d.slice(0, 7); monthCount[ym] = (monthCount[ym] || 0) + 1; });
        const dominantYM = Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0][0];
        const [year, month] = dominantYM.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate(); // 해당 월의 실제 일수

        // 날짜 문자열 헬퍼: day(1~31) → "YYYY-MM-DD"
        const toDateStr = day =>
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // 일요일 여부 (Chủ Nhật 행에서 0 표시용)
        const isSunday = day => new Date(year, month - 1, day).getDay() === 0;

        // ── 부서 → 직원 그룹핑 (dominant month 데이터만) ──
        const deptMap = {};
        allRecords.forEach(r => {
            if (!r.dateStr.startsWith(dominantYM)) return;
            const hr = hrRecords[r.empId];
            if (!deptMap[r.dept]) deptMap[r.dept] = {};
            if (!deptMap[r.dept][r.empId]) {
                deptMap[r.dept][r.empId] = {
                    empId:          r.empId,
                    empName:        (hr && hr.empName)        || r.empName,
                    position:       (hr && hr.process)        || r.position,
                    idNumber:       (hr && hr.idNumber)        || '',
                    hireDate:       (hr && hr.hireDate)        || '',
                    allowanceTotal: (hr && hr.allowanceTotal)  || '',
                    bankAccount:    (hr && hr.bankAccount)     || '',
                    bankName:       (hr && hr.bankName)        || '',
                    byDate: {}
                };
            }
            deptMap[r.dept][r.empId].byDate[r.dateStr] = r;
        });

        const wb = XLSX.utils.book_new();
        const NCOLS = 47; // 총 열 수

        Object.entries(deptMap).forEach(([deptName, empMap]) => {
            const empList = Object.values(empMap).sort((a, b) => a.empId.localeCompare(b.empId));
            const rows = [];

            // ── 행 0: 빈 행 ──
            rows.push(new Array(NCOLS).fill(''));

            // ── 행 1: TOTAL 행 ──
            const r1 = new Array(NCOLS).fill('');
            r1[2] = 'TOTAL';
            r1[3] = empList.length;
            rows.push(r1);

            // ── 행 2~7: 빈 행 ──
            for (let i = 0; i < 6; i++) rows.push(new Array(NCOLS).fill(''));

            // ── 행 8: 타이틀 ──
            const r8 = new Array(NCOLS).fill('');
            r8[0] = ` BẢNG CHẤM CÔNG BỘ PHẬN ${deptName} - THÁNG ${month} NĂM ${year}`;
            rows.push(r8);

            // ── 행 9: 빈 행 ──
            rows.push(new Array(NCOLS).fill(''));

            // ── 행 10: 헤더 ──
            const headerRow = [
                'NO', 'Mã nhân viên', 'Họ & Tên\n성명', 'CMTND', 'Ngày Vào ',
                'Chức Vụ\n', 'Phụ cấp', 'Tình Hình Công Việc\n근무현황',
                ...Array.from({ length: 31 }, (_, i) => i + 1),  // 1 ~ 31
                'Total',
                'Go To late (Đi Muộn)',
                'Leaving Early (Về Sớm)',
                'Absence with reason (Nghỉ có phép)',
                'Absent without Notice (Nghỉ Không Phép)',
                'Số TK', 'TÊN NH', 'Ký Tên'
            ];
            rows.push(headerRow);

            // ── 행 11: Shift-Day 일별 인원 ──
            const sdRow = new Array(NCOLS).fill('');
            sdRow[0] = 'Total Staff';
            sdRow[7] = 'Shift -Day';
            for (let day = 1; day <= 31; day++) {
                sdRow[7 + day] = day <= daysInMonth
                    ? empList.filter(e => { const r = e.byDate[toDateStr(day)]; return r && !r.isAbsent && !r.isLeave && !r.isNightShift; }).length
                    : '';
            }
            rows.push(sdRow);

            // ── 행 12: Shift-Night 일별 인원 ──
            const snRow = new Array(NCOLS).fill('');
            snRow[7] = 'Shift-Night';
            for (let day = 1; day <= 31; day++) {
                snRow[7 + day] = day <= daysInMonth
                    ? empList.filter(e => { const r = e.byDate[toDateStr(day)]; return r && r.isNightShift; }).length
                    : '';
            }
            rows.push(snRow);

            // ── 직원별 9개 서브행 ──
            empList.forEach((emp, idx) => {
                // 집계
                let dayWork = 0, nightWork = 0, sunDay = 0, sunNight = 0;
                let lateCount = 0, earlyCount = 0, absentDays = 0, leaveDays = 0;
                let otDay = 0, otNight = 0;
                for (let day = 1; day <= daysInMonth; day++) {
                    const r = emp.byDate[toDateStr(day)];
                    if (!r) continue;
                    if (r.isLeave)  { leaveDays++;  continue; }
                    if (r.isAbsent) { absentDays++; continue; }
                    if (r.lateMin  > 0) lateCount++;
                    if (r.earlyMin > 0) earlyCount++;
                    if      (r.isHoliday && r.isNightShift) { sunNight++; otNight += r.overtimeClass || 0; }
                    else if (r.isHoliday)                   { sunDay++;   otDay   += r.overtimeClass || 0; }
                    else if (r.isNightShift)                { nightWork++; otNight += r.overtimeClass || 0; }
                    else                                    { dayWork++;  otDay   += r.overtimeClass || 0; }
                }

                // 일별 셀 값 반환 (rowType별)
                const cellVal = (day, type) => {
                    if (day > daysInMonth) return '';
                    const r = emp.byDate[toDateStr(day)];
                    switch (type) {
                        case 'cangay':
                            if (!r) return '';
                            if (r.isLeave) return 'PN';
                            if (r.isAbsent) return 'D';
                            if (!r.isNightShift && !r.isHoliday) return r.dayCode || 'N';
                            return '';
                        case 'danhgia':
                            if (!r) return '';
                            if (r.isLeave) return 'CP';
                            if (r.evalCode) return r.evalCode;
                            if (r.checkIn !== null || r.checkOut !== null) return 'A';
                            return '';
                        case 'otday':
                            if (!r || r.isNightShift || r.isHoliday) return '';
                            return (r.overtimeClass > 0) ? r.overtimeClass : '';
                        case 'cadem':
                            return (r && r.isNightShift && !r.isHoliday) ? 'T' : '';
                        case 'otnight':
                            if (!r || !r.isNightShift || r.isHoliday) return '';
                            return (r.overtimeClass > 0) ? r.overtimeClass : '';
                        case 'chunhat':
                            if (r && r.isHoliday && !r.isNightShift && !r.isAbsent && !r.isLeave) return 'N';
                            return isSunday(day) ? 0 : '';
                        case 'demcn':
                            return (r && r.isHoliday && r.isNightShift && !r.isAbsent && !r.isLeave) ? 'T' : '';
                        default: return '';
                    }
                };

                // 서브행 생성 헬퍼
                const makeSubRow = (label, type, totalVal, summaryArr, isFirst) => {
                    const row = new Array(NCOLS).fill('');
                    if (isFirst) {
                        row[0] = idx + 1;
                        row[1] = emp.empId;
                        row[2] = emp.empName;
                        row[3] = emp.idNumber;
                        row[4] = emp.hireDate;
                        row[5] = emp.position;
                        row[6] = emp.allowanceTotal;
                        row[44] = emp.bankAccount;
                        row[45] = emp.bankName;
                        row[46] = '';
                    }
                    row[7] = label;
                    for (let day = 1; day <= 31; day++) row[7 + day] = cellVal(day, type);
                    row[39] = totalVal !== '' ? totalVal : '';
                    if (summaryArr) {
                        row[40] = summaryArr[0] !== undefined ? summaryArr[0] : '';
                        row[41] = summaryArr[1] !== undefined ? summaryArr[1] : '';
                        row[42] = summaryArr[2] !== undefined ? summaryArr[2] : '';
                        row[43] = summaryArr[3] !== undefined ? summaryArr[3] : '';
                    }
                    return row;
                };

                rows.push(makeSubRow('Ca ngày (Day)',                                          'cangay',  dayWork,   null,                                        true));
                rows.push(makeSubRow('Đánh Giá thời gian làm việc\n  (comment about time work)', 'danhgia', '',        [lateCount, earlyCount, leaveDays, absentDays], false));
                rows.push(makeSubRow('Overtime (Day)',                                          'otday',   otDay || 0, null,                                       false));
                rows.push(makeSubRow('Ca Đêm(Night)',                                          'cadem',   nightWork || 0, null,                                   false));
                rows.push(makeSubRow('Overtime (Night)',                                        'otnight', otNight || 0, null,                                    false));
                rows.push(makeSubRow('Chủ Nhật (Sunday)',                                      'chunhat', sunDay || 0, null,                                      false));
                rows.push(makeSubRow('Đêm Chủ Nhật \n(Night Sunday)',                          'demcn',   sunNight || 0, null,                                   false));
                rows.push(makeSubRow('Ngày Lễ Ngày  (Holiday)',                               'ngayle',  0,         null,                                        false));
                rows.push(makeSubRow('Đêm Nghỉ Lẽ\n(Night Holiday)',                          'demnl',   0,         null,                                        false));
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);

            // 열 너비 설정
            ws['!cols'] = [
                { wch: 5  },  // NO
                { wch: 12 },  // Mã nhân viên
                { wch: 22 },  // Họ & Tên
                { wch: 13 },  // CMTND
                { wch: 12 },  // Ngày Vào
                { wch: 13 },  // Chức Vụ
                { wch: 10 },  // Phụ cấp
                { wch: 22 },  // 근무현황 label
                ...Array(31).fill({ wch: 4.5 }), // 일 1~31
                { wch: 7  },  // Total
                { wch: 9  },  // Go To late
                { wch: 9  },  // Leaving Early
                { wch: 11 },  // Absence (có phép)
                { wch: 11 },  // Absent (không phép)
                { wch: 14 },  // Số TK
                { wch: 20 },  // TÊN NH
                { wch: 8  }   // Ký Tên
            ];

            const safeName = deptName.replace(/[\\/?*[\]]/g, '_').substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, safeName);
        });

        XLSX.writeFile(wb, `CHỐT CÔNG THÁNG ${month}-${year}.xlsx`);
    }

    // 하위 호환성 별칭
    const exportHorizontalByDept = exportChotCong;

    /**
     * 월간 직원별 요약을 Excel로 내보내기
     */
    function exportMonthlyToExcel(empSummaries) {
        const data = empSummaries.map((e, idx) => ({
            'No': idx + 1,
            '사번': e.empId,
            '이름': e.empName,
            '부서': e.dept,
            '직위': e.position,
            '근무일수': e.totalWorkDays,
            '정상근무(h)': e.totalRegularHours,
            '잔업2h(회)': e.ot2Count,
            '잔업2h(h)': e.ot2Hours,
            '잔업3h(회)': e.ot3Count,
            '잔업3h(h)': e.ot3Hours,
            '잔업4h(회)': e.ot4Count,
            '잔업4h(h)': e.ot4Hours,
            '총 잔업(h)': e.totalOvertimeHours,
            '휴가일수': e.leaveDays,
            '결근일수': e.absentDays,
            '지각횟수': e.lateCount,
            '조퇴횟수': e.earlyCount,
            '야간근무': e.nightShiftCount
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [
            { wch: 5 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 10 },
            { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '월간요약');

        XLSX.writeFile(wb, '근태_월간요약.xlsx');
    }

    /**
     * 월간 일자별 집계를 Excel로 내보내기
     */
    function exportMonthlyByDateToExcel(dateSummaries) {
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

        const data = dateSummaries.map((d, idx) => {
            const dateObj = new Date(d.date + 'T00:00:00');
            const dayName = dayNames[dateObj.getDay()];
            return {
                'No': idx + 1,
                '날짜': d.date,
                '요일': dayName,
                '출근인원': d.attendees,
                '휴가': d.leaves,
                '미출근': d.absents,
                '정상근무(h)': d.totalRegularHours,
                '잔업2h(명)': d.ot2Count,
                '잔업3h(명)': d.ot3Count,
                '잔업4h(명)': d.ot4Count,
                '총잔업(h)': d.totalOvertimeHours,
                '지각': d.lateCount
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [
            { wch: 5 },   // No
            { wch: 12 },  // 날짜
            { wch: 5 },   // 요일
            { wch: 10 },  // 출근인원
            { wch: 8 },   // 휴가
            { wch: 8 },   // 미출근
            { wch: 12 },  // 정상근무
            { wch: 10 },  // 잔업2h
            { wch: 10 },  // 잔업3h
            { wch: 10 },  // 잔업4h
            { wch: 10 },  // 총잔업
            { wch: 8 }    // 지각
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '월간일자별집계');

        XLSX.writeFile(wb, '근태_월간일자별집계.xlsx');
    }

    /**
     * 원본 T2 Excel 형식 그대로 유지하면서 수정된 값만 반영하여 내보내기
     * @param {Object} originalFileBuffers - { fileName: Uint8Array }
     * @param {Object} rowMap             - { _uid: {fileName, sheetName, rowIndex} }
     * @param {Array}  rawRecords         - 현재 in-memory rawRecords (수정값 포함)
     * @param {Object} deletedRowMap      - 삭제된 행 { _uid: {fileName, sheetName, rowIndex} }
     */
    function exportOriginalFormat(originalFileBuffers, rowMap, rawRecords, deletedRowMap) {
        // T2 원본 컬럼 인덱스 (parser.js COL 상수와 동일, 0-based)
        const COL = {
            DATE:         4,   // E: Ngày (날짜)
            DAY_OF_WEEK:  5,   // F: Thứ (요일)
            CHECK_IN:     6,   // G: Vào (출근)
            CHECK_OUT:    7,   // H: Ra (퇴근)
            WORK_DAYS:    8,   // I: Công (근무일수)
            WORK_HOURS:   9,   // J: Giờ (정상근무시간)
            OT_DAYS:      10,  // K: Công+ (잔업일수)
            OT_HOURS:     11,  // L: Giờ+ (잔업시간)
            LATE_MIN:     12,  // M: Vào Trễ (지각분)
            EARLY_MIN:    13,  // N: Ra sớm (조퇴분)
            SHIFT:        17,  // R: Tên ca (근무유형)
            SYMBOL:       18,  // S: Kí hiệu (기호)
            SYMBOL_PLUS:  19,  // T: Kí hiệu+ (잔업기호)
            TOTAL_HOURS:  20   // U: Tổng giờ (총시간)
        };

        const fileNames = Object.keys(originalFileBuffers);
        if (fileNames.length === 0) return;

        // rawRecords를 _uid 기준으로 인덱싱 (중복 레코드 각각 구분)
        const rawMap = {};
        rawRecords.forEach(r => { rawMap[r._uid] = r; });

        /**
         * Workbook 내에서 rowMap에 해당하는 행의 모든 수정 컬럼을 rawRecord 현재값으로 업데이트
         * 기존 셀의 스타일/서식은 보존하고 값(v)만 교체
         */
        function applyEditsToWorkbook(wb, targetFileName) {
            Object.entries(rowMap).forEach(([uid, entry]) => {
                if (entry.fileName !== targetFileName) return;

                const raw = rawMap[uid];
                if (!raw) return;

                const ws = wb.Sheets[entry.sheetName];
                if (!ws) return;

                const r = entry.rowIndex;

                // 셀 업데이트 헬퍼: 원본 스타일(s)/포맷(z) 보존, 값(v)만 교체
                // defaultFmt: 원본 셀에 숫자 포맷이 없을 경우 적용할 기본 포맷 문자열 (예: 'hh:mm')
                function setCell(c, type, value, defaultFmt) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    const orig = ws[addr];
                    if (type === 'blank') {
                        ws[addr] = orig ? { t: 'z', s: orig.s } : { t: 'z' };
                    } else {
                        const cell = orig
                            ? { ...orig, t: type, v: value, w: undefined }
                            : { t: type, v: value };
                        // 원본이 없거나 포맷 정보가 없을 때 기본 포맷 적용 (시간 표시 깨짐 방지)
                        if (defaultFmt && !cell.z) {
                            cell.z = defaultFmt;
                        }
                        ws[addr] = cell;
                    }
                }

                // ── G: Vào (출근시간) minutes → Excel 소수(1440분=1.0) ──
                if (raw.checkIn !== null && raw.checkIn !== undefined) {
                    setCell(COL.CHECK_IN, 'n', raw.checkIn / 1440, 'hh:mm');
                } else {
                    setCell(COL.CHECK_IN, 'blank');
                }

                // ── H: Ra (퇴근시간) ──
                if (raw.checkOut !== null && raw.checkOut !== undefined) {
                    setCell(COL.CHECK_OUT, 'n', raw.checkOut / 1440, 'hh:mm');
                } else {
                    setCell(COL.CHECK_OUT, 'blank');
                }

                // ── I: Công (근무일수) ──
                setCell(COL.WORK_DAYS, 'n', raw.workDays ?? 0);

                // ── J: Giờ (정상근무시간) ──
                setCell(COL.WORK_HOURS, 'n', raw.workHours ?? 0);

                // ── K: Công+ (잔업일수) ──
                setCell(COL.OT_DAYS, 'n', raw.otDays ?? 0);

                // ── L: Giờ+ (잔업시간) ──
                setCell(COL.OT_HOURS, 'n', raw.otHours ?? 0);

                // ── M: Vào Trễ (지각분) ──
                setCell(COL.LATE_MIN, 'n', raw.lateMin ?? 0);

                // ── N: Ra sớm (조퇴분) ──
                setCell(COL.EARLY_MIN, 'n', raw.earlyMin ?? 0);

                // ── R: Tên ca (근무유형: N/T/--) ──
                setCell(COL.SHIFT, 's', raw.shift ?? '');

                // ── S: Kí hiệu (출근기호: X/V/--/KR/Đ) ──
                setCell(COL.SYMBOL, 's', raw.symbol ?? '');

                // ── T: Kí hiệu+ (잔업기호: V/Đ/빈값) ──
                if (raw.symbolPlus && raw.symbolPlus !== '') {
                    setCell(COL.SYMBOL_PLUS, 's', raw.symbolPlus);
                } else {
                    setCell(COL.SYMBOL_PLUS, 'blank');
                }

                // ── U: Tổng giờ (총 근무시간) ──
                setCell(COL.TOTAL_HOURS, 'n', raw.totalHours ?? 0);

                // ── E: Ngày (날짜) → yyyy-mm-dd 형식 강제 적용 ──
                // raw.dateStr = 'YYYY-MM-DD' → Excel 시리얼 숫자로 변환
                if (raw.dateStr) {
                    const [sy, sm, sd] = raw.dateStr.split('-').map(Number);
                    const dateSerial = Date.UTC(sy, sm - 1, sd) / 86400000 + 25569;
                    const dateAddr = XLSX.utils.encode_cell({ r, c: COL.DATE });
                    const dateOrig = ws[dateAddr];
                    ws[dateAddr] = dateOrig
                        ? { ...dateOrig, t: 'n', v: dateSerial, z: 'yyyy-mm-dd', w: undefined }
                        : { t: 'n', v: dateSerial, z: 'yyyy-mm-dd' };
                }

                // ── F: Thứ (요일 VN — dayCode=NL 등으로 변경된 경우) ──
                if (raw.dayOfWeekVN !== undefined) {
                    setCell(COL.DAY_OF_WEEK, 's', raw.dayOfWeekVN || '');
                }
            });
        }

        /**
         * 시트에서 특정 행을 실제로 삭제하고 이후 행을 한 행씩 위로 당김
         * (머지, !ref, !rows 모두 업데이트)
         */
        function deleteRowFromSheet(ws, rowToDelete) {
            if (!ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);

            // 삭제 행 셀 제거 + 이후 행 셀을 한 행 위로 이동
            const shifted = {};
            Object.keys(ws).forEach(addr => {
                if (addr[0] === '!') return;
                const cell = XLSX.utils.decode_cell(addr);
                if (cell.r === rowToDelete) {
                    delete ws[addr];          // 삭제할 행의 셀 제거
                } else if (cell.r > rowToDelete) {
                    shifted[XLSX.utils.encode_cell({ r: cell.r - 1, c: cell.c })] = ws[addr];
                    delete ws[addr];          // 원래 주소는 제거
                }
            });
            Object.assign(ws, shifted);       // 한 행 위로 이동한 셀들 반영

            // !ref 범위 업데이트
            if (range.e.r >= rowToDelete) {
                range.e.r = Math.max(range.s.r, range.e.r - 1);
                ws['!ref'] = XLSX.utils.encode_range(range);
            }

            // !merges 업데이트
            if (ws['!merges']) {
                ws['!merges'] = ws['!merges'].map(m => {
                    if (m.e.r < rowToDelete) return m;                              // 삭제 행 위: 그대로
                    if (m.s.r === rowToDelete && m.e.r === rowToDelete) return null; // 삭제 행에만 속한 머지: 제거
                    if (m.s.r > rowToDelete)                                         // 삭제 행 아래: 한 행 위로
                        return { s: { r: m.s.r - 1, c: m.s.c }, e: { r: m.e.r - 1, c: m.e.c } };
                    return { s: m.s, e: { r: m.e.r - 1, c: m.e.c } };              // 삭제 행 걸친 머지: 끝 행 줄임
                }).filter(Boolean);
            }

            // !rows 업데이트
            if (ws['!rows'] && ws['!rows'].length > rowToDelete) {
                ws['!rows'].splice(rowToDelete, 1);
            }
        }

        /**
         * 웹에서 삭제된 행들을 엑셀에서 실제로 제거하고 이후 행을 위로 당김
         * 같은 시트 내 여러 행 삭제 시 인덱스 오프셋 오류를 막기 위해 내림차순으로 처리
         */
        function deleteDeletedRows(wb, targetFileName) {
            if (!deletedRowMap) return;

            // 삭제할 행들을 시트별로 그룹핑
            const sheetRowsMap = {};
            Object.entries(deletedRowMap).forEach(([uid, entry]) => {
                if (entry.fileName !== targetFileName) return;
                if (!sheetRowsMap[entry.sheetName]) sheetRowsMap[entry.sheetName] = [];
                sheetRowsMap[entry.sheetName].push(entry.rowIndex);
            });

            // 각 시트: 내림차순으로 정렬 후 순서대로 행 삭제
            Object.entries(sheetRowsMap).forEach(([sheetName, rowIndices]) => {
                const ws = wb.Sheets[sheetName];
                if (!ws) return;
                rowIndices.sort((a, b) => b - a);   // 내림차순
                rowIndices.forEach(rowIdx => deleteRowFromSheet(ws, rowIdx));
            });
        }

        if (fileNames.length === 1) {
            // ── 단일 파일: 원본 workbook 재파싱 → 수정 → 다운로드 ──
            const fileName = fileNames[0];
            const wb = XLSX.read(originalFileBuffers[fileName], {
                type: 'array', cellDates: false
            });
            applyEditsToWorkbook(wb, fileName);
            deleteDeletedRows(wb, fileName);
            XLSX.writeFile(wb, '수정_' + fileName);

        } else {
            // ── 다중 파일: 각 파일 수정 후 시트를 하나의 workbook으로 합치기 ──
            const outWb = XLSX.utils.book_new();
            const usedSheetNames = new Set();

            fileNames.forEach((fileName) => {
                const wb = XLSX.read(originalFileBuffers[fileName], {
                    type: 'array', cellDates: false
                });
                applyEditsToWorkbook(wb, fileName);
                deleteDeletedRows(wb, fileName);

                wb.SheetNames.forEach(sheetName => {
                    // 시트명 중복 방지
                    let candidate = sheetName.substring(0, 31).replace(/[\\/?*[\]]/g, '_');
                    let suffix = 2;
                    while (usedSheetNames.has(candidate)) {
                        candidate = sheetName.substring(0, 28) + '_' + suffix++;
                    }
                    usedSheetNames.add(candidate);
                    XLSX.utils.book_append_sheet(outWb, wb.Sheets[sheetName], candidate);
                });
            });

            XLSX.writeFile(outWb, '수정_T2_통합.xlsx');
        }
    }

    return {
        exportDailyToExcel,
        exportDeptToExcel,
        exportMonthlyToExcel,
        exportMonthlyByDateToExcel,
        exportHorizontalByDept,
        exportChotCong,
        exportOriginalFormat
    };
})();
