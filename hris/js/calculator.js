/**
 * 근무시간 계산 모듈
 *
 * 비즈니스 규칙:
 * - 정상근무: 07:30~16:30 (8시간, 점심 1시간 포함)
 * - 잔업 분류: 16:30 이후 초과근무를 2/3/4시간 단위로 분류
 *   - 초과근무 < 1h → 잔업 없음
 *   - 초과근무 ≤ 2.5h → 잔업 2시간
 *   - 초과근무 2.5h ~ 3.5h → 잔업 3시간
 *   - 초과근무 > 3.5h → 잔업 4시간
 */

const AttendanceCalculator = (() => {
    // 근무시간 상수
    const WORK_START = 7 * 60 + 30;   // 07:30 = 450분
    const WORK_END = 16 * 60 + 30;     // 16:30 = 990분
    const REGULAR_HOURS = 8;            // 정상근무 8시간
    const LUNCH_BREAK = 60;             // 점심시간 1시간

    /**
     * 잔업 시간 분류
     * @param {number} overtimeMinutes - 초과근무 분
     * @returns {number} 잔업 분류 (0, 2, 3, 4)
     */
    function classifyOvertime(overtimeMinutes) {
        const hours = overtimeMinutes / 60;
        if (hours < 1) return 0;        // 잔업 없음
        if (hours <= 2.5) return 2;     // 잔업 2시간
        if (hours <= 3.5) return 3;     // 잔업 3시간
        return 4;                        // 잔업 4시간
    }

    /**
     * 개별 근태 레코드의 근무시간 계산
     * @param {Object} record - 파싱된 근태 레코드
     * @returns {Object} 계산된 근무 정보
     */
    function calculateRecord(record) {
        const result = {
            _uid: record._uid,        // 레코드 고유 식별자 (중복 레코드 구분용)
            empId: record.empId,
            empName: record.empName,
            dept: record.dept,
            position: record.position,
            date: record.date,
            dateStr: record.dateStr,
            dateShort: record.dateShort,
            dayOfWeek: record.dayOfWeek,
            checkIn: record.checkIn,
            checkInStr: record.checkInStr,
            checkOut: record.checkOut,
            checkOutStr: record.checkOutStr,
            shift: record.shift,
            symbol: record.symbol,
            symbolDesc: record.symbolDesc,
            // 계산 결과
            regularHours: 0,          // 정상근무시간
            overtimeMinutes: 0,       // 실제 초과근무 분
            overtimeClass: 0,         // 잔업 분류 (0/2/3/4)
            overtimeClassLabel: '',   // 잔업 라벨
            totalActualMinutes: 0,    // 실제 총 근무 분
            lateMin: record.lateMin,
            earlyMin: record.earlyMin,
            isAbsent: false,          // 결근 여부
            isLeave: false,           // 휴가 여부
            isHoliday: false,         // 공휴일/일요일 여부
            isNightShift: false,      // 야간근무 여부
            note: '',                 // 비고
            dayCode: 'N',            // 근무 유형: N/T/PN/NL/NC/D
            evalCode: ''             // 출퇴근 평가: A/B/C/D
        };

        // 휴가 처리
        if (record.symbol === 'V') {
            result.isLeave = true;
            result.dayCode  = 'PN';
            result.evalCode = '';
            result.note = '휴가';
            result.regularHours = record.otHours || 0;
            return result;
        }

        // 일요일 체크
        if (record.dayOfWeekVN === 'CN' || record.dayOfWeek === '일') {
            result.isHoliday = true;
        }

        // 야간근무 처리
        if (record.shift === 'T') {
            result.isNightShift = true;
            result.note = '야간';
        }

        // 퇴근 누락 처리
        if (record.symbol === 'KR') {
            result.note = '퇴근누락';
            if (record.checkIn !== null) {
                result.regularHours = 0;
            }
            return result;
        }

        // 출퇴근 시간이 없는 경우
        if (record.checkIn === null && record.checkOut === null) {
            // Công+ 값이 있으면 (휴가로 8시간 인정)
            if (record.otDays > 0) {
                result.regularHours = record.otHours || 8;
                result.note = '대체휴무/보상';
            } else {
                result.isAbsent = true;
                result.note = record.symbolDesc || '미출근';
            }
            return result;
        }

        // 출근만 있고 퇴근 없는 경우
        if (record.checkIn !== null && record.checkOut === null) {
            result.note = '퇴근누락';
            return result;
        }

        // 정상 출퇴근 계산
        let checkIn = record.checkIn;
        let checkOut = record.checkOut;

        // 야간근무: 퇴근시간 < 출근시간이면 다음날
        if (result.isNightShift || checkOut < checkIn) {
            checkOut += 24 * 60; // 다음날로 계산
            result.isNightShift = true;
            if (!result.note) result.note = '야간';
        }

        // 실제 근무시간 계산 (분)
        let actualMinutes = checkOut - checkIn;

        // 점심시간 제외 (주간근무이고 출근이 12시 전, 퇴근이 13시 이후인 경우)
        if (!result.isNightShift) {
            const lunchStart = 12 * 60; // 12:00
            const lunchEnd = 13 * 60;   // 13:00
            if (checkIn < lunchEnd && checkOut > lunchStart) {
                const lunchOverlap = Math.min(checkOut, lunchEnd) - Math.max(checkIn, lunchStart);
                if (lunchOverlap > 0) {
                    actualMinutes -= lunchOverlap;
                }
            }
        }

        result.totalActualMinutes = Math.max(0, actualMinutes);

        // 정상근무시간 산출 (최대 8시간)
        const regularMinutes = Math.min(result.totalActualMinutes, REGULAR_HOURS * 60);
        result.regularHours = Math.round(regularMinutes / 60 * 100) / 100;

        // 초과근무 계산
        if (!result.isNightShift) {
            // 주간근무: 16:30 이후가 잔업
            if (checkOut > WORK_END) {
                // 저녁시간 (17:30~18:00 또는 18:00~18:30) 30분 휴식 제외
                let overtimeMin = checkOut - WORK_END;
                // 잔업이 1시간30분 이상이면 저녁 휴식 30분 제외
                if (overtimeMin >= 90) {
                    overtimeMin -= 30;
                }
                result.overtimeMinutes = Math.max(0, overtimeMin);
            }
        } else {
            // 야간근무: 8시간 초과분이 잔업
            if (result.totalActualMinutes > REGULAR_HOURS * 60) {
                result.overtimeMinutes = result.totalActualMinutes - REGULAR_HOURS * 60;
            }
        }

        // 잔업 분류
        result.overtimeClass = classifyOvertime(result.overtimeMinutes);

        // 잔업 라벨
        if (result.overtimeClass > 0) {
            result.overtimeClassLabel = `${result.overtimeClass}시간`;
        }

        // 엑셀 정상근무시간 우선 사용 (신뢰도 높음)
        if (record.workHours > 0) {
            result.regularHours = record.workHours;
        }

        // 엑셀 잔업시간(Giờ+) 우선 사용 (신뢰도 높음)
        if (record.otHours > 0) {
            result.overtimeMinutes = Math.round(record.otHours * 60);
            result.overtimeClass = classifyOvertime(result.overtimeMinutes);
            result.overtimeClassLabel = result.overtimeClass > 0 ? `${result.overtimeClass}시간` : '';
        }

        // 지각/조퇴 비고
        if (record.lateMin > 0) {
            result.note += result.note ? ', ' : '';
            result.note += `지각 ${record.lateMin}분`;
        }
        if (record.earlyMin > 0) {
            result.note += result.note ? ', ' : '';
            result.note += `조퇴 ${record.earlyMin}분`;
        }

        // ── 근무 유형 코드 (dayCode) ──────────────────────────
        if (result.isLeave) {
            result.dayCode = 'PN';   // 기본 연차 (T2에서 V → PN)
        } else if (result.isAbsent) {
            result.dayCode = 'D';    // 무단결근
        } else if (result.isNightShift) {
            result.dayCode = 'T';    // 야간근무
        } else if (result.isHoliday) {
            result.dayCode = 'NL';   // 공휴일
        } else {
            result.dayCode = 'N';    // 정상 주간근무
        }

        // ── 출퇴근 평가 코드 (evalCode) ──────────────────────
        if (!result.isLeave && !result.isAbsent) {
            if (result.lateMin > 0 && result.earlyMin > 0) result.evalCode = 'BC';
            else if (result.lateMin > 0)                   result.evalCode = 'B';
            else if (result.earlyMin > 0)                  result.evalCode = 'C';
            else                                           result.evalCode = 'A';
        }

        return result;
    }

    /**
     * 전체 레코드 계산
     * @param {Array} records - 파싱된 근태 레코드 배열
     * @returns {Array} 계산된 근태 레코드 배열
     */
    function calculateAll(records) {
        return records.map(r => calculateRecord(r));
    }

    /**
     * 일자별 합계 계산
     * @param {Array} calculatedRecords - 계산된 레코드
     * @param {string} dateStr - 날짜 (YYYY-MM-DD)
     * @returns {Object} 일자별 합계
     */
    function getDailySummary(calculatedRecords, dateStr) {
        const dayRecords = calculatedRecords.filter(r => r.dateStr === dateStr);

        const summary = {
            date: dateStr,
            totalEmployees: dayRecords.length,
            attendees: dayRecords.filter(r => !r.isAbsent && !r.isLeave).length,
            leaves: dayRecords.filter(r => r.isLeave).length,
            absents: dayRecords.filter(r => r.isAbsent).length,
            totalRegularHours: 0,
            totalOvertimeHours: 0,
            ot2Count: 0,  // 잔업 2시간 인원
            ot3Count: 0,  // 잔업 3시간 인원
            ot4Count: 0,  // 잔업 4시간 인원
            ot2Hours: 0,
            ot3Hours: 0,
            ot4Hours: 0,
            lateCount: dayRecords.filter(r => r.lateMin > 0).length,
            earlyCount: dayRecords.filter(r => r.earlyMin > 0).length
        };

        dayRecords.forEach(r => {
            summary.totalRegularHours += r.regularHours;
            if (r.overtimeClass === 2) {
                summary.ot2Count++;
                summary.ot2Hours += 2;
            } else if (r.overtimeClass === 3) {
                summary.ot3Count++;
                summary.ot3Hours += 3;
            } else if (r.overtimeClass === 4) {
                summary.ot4Count++;
                summary.ot4Hours += 4;
            }
        });

        summary.totalOvertimeHours = summary.ot2Hours + summary.ot3Hours + summary.ot4Hours;
        summary.totalRegularHours = Math.round(summary.totalRegularHours * 100) / 100;

        return summary;
    }

    /**
     * 부서별 집계
     * @param {Array} calculatedRecords - 계산된 레코드 배열
     * @param {string} [dateStr] - 특정 날짜 (없으면 전체)
     * @returns {Array} 부서별 집계
     */
    function getDeptSummary(calculatedRecords, dateStr) {
        let records = calculatedRecords;
        if (dateStr) {
            records = records.filter(r => r.dateStr === dateStr);
        }

        const deptMap = {};

        records.forEach(r => {
            if (!deptMap[r.dept]) {
                deptMap[r.dept] = {
                    dept: r.dept,
                    totalRecords: 0,
                    uniqueEmployees: new Set(),
                    attendees: 0,
                    leaves: 0,
                    absents: 0,
                    totalRegularHours: 0,
                    ot2Count: 0,
                    ot3Count: 0,
                    ot4Count: 0,
                    ot2Hours: 0,
                    ot3Hours: 0,
                    ot4Hours: 0,
                    totalOvertimeHours: 0,
                    lateCount: 0,
                    earlyCount: 0
                };
            }

            const dept = deptMap[r.dept];
            dept.totalRecords++;
            dept.uniqueEmployees.add(r.empId);

            if (r.isLeave) dept.leaves++;
            else if (r.isAbsent) dept.absents++;
            else dept.attendees++;

            dept.totalRegularHours += r.regularHours;

            if (r.overtimeClass === 2) { dept.ot2Count++; dept.ot2Hours += 2; }
            else if (r.overtimeClass === 3) { dept.ot3Count++; dept.ot3Hours += 3; }
            else if (r.overtimeClass === 4) { dept.ot4Count++; dept.ot4Hours += 4; }

            if (r.lateMin > 0) dept.lateCount++;
            if (r.earlyMin > 0) dept.earlyCount++;
        });

        return Object.values(deptMap).map(d => {
            d.employeeCount = d.uniqueEmployees.size;
            d.totalOvertimeHours = d.ot2Hours + d.ot3Hours + d.ot4Hours;
            d.totalRegularHours = Math.round(d.totalRegularHours * 100) / 100;
            delete d.uniqueEmployees;
            return d;
        }).sort((a, b) => a.dept.localeCompare(b.dept));
    }

    /**
     * 직원별 월간 요약
     * @param {Array} calculatedRecords - 계산된 레코드
     * @returns {Array} 직원별 월간 요약
     */
    function getEmployeeMonthlySummary(calculatedRecords) {
        const empMap = {};

        calculatedRecords.forEach(r => {
            if (!empMap[r.empId]) {
                empMap[r.empId] = {
                    empId: r.empId,
                    empName: r.empName,
                    dept: r.dept,
                    position: r.position,
                    totalWorkDays: 0,
                    totalRegularHours: 0,
                    ot2Count: 0,
                    ot3Count: 0,
                    ot4Count: 0,
                    ot2Hours: 0,
                    ot3Hours: 0,
                    ot4Hours: 0,
                    totalOvertimeHours: 0,
                    leaveDays: 0,
                    absentDays: 0,
                    lateCount: 0,
                    earlyCount: 0,
                    nightShiftCount: 0,
                    records: []
                };
            }

            const emp = empMap[r.empId];

            if (!r.isAbsent && !r.isLeave) {
                emp.totalWorkDays++;
            }
            if (r.isLeave) emp.leaveDays++;
            if (r.isAbsent) emp.absentDays++;

            emp.totalRegularHours += r.regularHours;

            if (r.overtimeClass === 2) { emp.ot2Count++; emp.ot2Hours += 2; }
            else if (r.overtimeClass === 3) { emp.ot3Count++; emp.ot3Hours += 3; }
            else if (r.overtimeClass === 4) { emp.ot4Count++; emp.ot4Hours += 4; }

            if (r.lateMin > 0) emp.lateCount++;
            if (r.earlyMin > 0) emp.earlyCount++;
            if (r.isNightShift) emp.nightShiftCount++;

            emp.records.push(r);
        });

        return Object.values(empMap).map(e => {
            e.totalOvertimeHours = e.ot2Hours + e.ot3Hours + e.ot4Hours;
            e.totalRegularHours = Math.round(e.totalRegularHours * 100) / 100;
            return e;
        }).sort((a, b) => a.empId.localeCompare(b.empId));
    }

    /**
     * 월간 일자별 집계 (모든 날짜에 대한 getDailySummary 배열)
     * @param {Array} calculatedRecords - 계산된 레코드
     * @returns {Array} 날짜별 요약 배열 (정렬된)
     */
    function getMonthlyDateSummary(calculatedRecords) {
        const dates = [...new Set(calculatedRecords.map(r => r.dateStr))].sort();
        return dates.map(dateStr => getDailySummary(calculatedRecords, dateStr));
    }

    // Public API
    return {
        calculateRecord,
        calculateAll,
        getDailySummary,
        getDeptSummary,
        getEmployeeMonthlySummary,
        getMonthlyDateSummary,
        classifyOvertime,
        WORK_START,
        WORK_END,
        REGULAR_HOURS
    };
})();
