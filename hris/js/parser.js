/**
 * Excel 파싱 모듈 - 지문인식 출퇴근 데이터 파싱
 *
 * 지원 형식:
 * 1. 단일 시트 (전체 월 데이터 연속 나열)
 * 2. 다중 시트 (일자별 시트)
 */

const AttendanceParser = (() => {
    // 기본 컬럼 매핑 (0-indexed) — 헤더 자동 감지로 오버라이드됨
    const DEFAULT_COL = {
        EMP_ID: 0,      // A: Mã N.Viên (사번)
        EMP_NAME: 1,    // B: Tên nhân viên (직원명)
        DEPT: 2,        // C: Phòng ban (부서)
        POSITION: 3,    // D: Chức vụ (직위)
        DATE: 4,        // E: Ngày (날짜)
        DAY_OF_WEEK: 5, // F: Thứ (요일)
        CHECK_IN: 6,    // G: Vào (출근시간)
        CHECK_OUT: 7,   // H: Ra (퇴근시간)
        WORK_DAYS: 8,   // I: Công (근무일수)
        WORK_HOURS: 9,  // J: Giờ (정상근무시간)
        OT_DAYS: 10,    // K: Công+ (추가근무일수)
        OT_HOURS: 11,   // L: Giờ+ (추가근무시간)
        LATE_MIN: 12,   // M: Vào Trễ (지각 분)
        EARLY_MIN: 13,  // N: Ra sớm (조퇴 분)
        TC1: 14,        // O: TC1
        TC2: 15,        // P: TC2
        TC3: 16,        // Q: TC3
        SHIFT: 17,      // R: Tên ca (교대)
        SYMBOL: 18,     // S: Kí hiệu (기호)
        SYMBOL_PLUS: 19,// T: Kí hiệu+
        TOTAL_HOURS: 20 // U: Tổng giờ (총 근무시간)
    };

    // 요일 매핑 (베트남어 → 한국어)
    const DAY_MAP = {
        'CN': '일', 'Hai': '월', 'Ba': '화', 'Tư': '수',
        'Năm': '목', 'Sáu': '금', 'Bảy': '토'
    };

    // 기호 매핑
    const SYMBOL_MAP = {
        'X': '출근', 'V': '휴가', 'KR': '퇴근누락',
        'Đ': '야간', '**': '기타', '--': '미지정'
    };

    /**
     * 파일 이름에서 날짜를 추출
     * 베트남 파일명 표준은 항상 DD-MM-YYYY (예: "07-03-2026.xlsx" = 3월 7일)
     * MM-DD fallback 없음 — 07을 month로 잘못 해석하는 문제 방지
     */
    function parseDateFromFileName(fileName) {
        if (!fileName) return null;
        const base = fileName.replace(/\.[^.]+$/, '');
        const today = new Date();
        // DD-MM-YYYY 와 MM-DD-YYYY 둘 다 시도 → 오늘과 가장 가까운 날짜 선택
        let m = base.match(/^(\d{1,2})[-_](\d{1,2})[-_](\d{4})$/);
        if (m) {
            const a = parseInt(m[1]), b = parseInt(m[2]), yyyy = parseInt(m[3]);
            const candidates = [];
            // DD-MM-YYYY: a=day, b=month
            if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
                const d = new Date(yyyy, b - 1, a);
                if (!isNaN(d.getTime())) candidates.push(d);
            }
            // MM-DD-YYYY: a=month, b=day (동일 날짜면 중복 추가 안 함)
            if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
                const d = new Date(yyyy, a - 1, b);
                if (!isNaN(d.getTime()) && candidates.every(c => c.getTime() !== d.getTime()))
                    candidates.push(d);
            }
            if (candidates.length === 1) return candidates[0];
            if (candidates.length > 1) {
                // 오늘과 가장 가까운 날짜 선택 (최근 근태 파일일 가능성 높음)
                return candidates.reduce((best, d) =>
                    Math.abs(d - today) < Math.abs(best - today) ? d : best
                );
            }
        }
        // YYYY-MM-DD
        m = base.match(/^(\d{4})[-_](\d{2})[-_](\d{2})$/);
        if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        return null;
    }

    /**
     * 시트 이름에서 날짜를 추출 ("03-02", "02-03", "03/02" 등 다양한 형식 지원)
     * 연도는 현재 연도를 사용
     */
    function parseDateFromSheetName(sheetName) {
        const today = new Date();
        const year = today.getFullYear();
        // "MM-DD" 또는 "DD-MM" 형식 → 둘 다 시도 후 오늘과 가장 가까운 날짜 선택
        let m = sheetName.match(/^(\d{1,2})[-/](\d{1,2})$/);
        if (m) {
            const a = parseInt(m[1]), b = parseInt(m[2]);
            const candidates = [];
            // MM-DD: a=month, b=day
            if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
                const d = new Date(year, a - 1, b);
                if (!isNaN(d.getTime())) candidates.push(d);
            }
            // DD-MM: a=day, b=month (동일 날짜 중복 제외)
            if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
                const d = new Date(year, b - 1, a);
                if (!isNaN(d.getTime()) && candidates.every(c => c.getTime() !== d.getTime()))
                    candidates.push(d);
            }
            if (candidates.length === 1) return candidates[0];
            if (candidates.length > 1) {
                return candidates.reduce((best, d) =>
                    Math.abs(d - today) < Math.abs(best - today) ? d : best
                );
            }
        }
        // "YYYY-MM-DD" 또는 "DD-MM-YYYY"
        m = sheetName.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
        if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        m = sheetName.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
        if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
        return null;
    }

    /**
     * 헤더 행을 분석하여 컬럼 위치를 자동 감지
     * 파일마다 컬럼 순서가 다를 수 있으므로 베트남어 헤더 텍스트로 위치를 찾음
     * @returns {{ col: Object, dateDetected: boolean }}
     */
    function detectColumns(headerRow) {
        let dateDetected = false;
        if (!headerRow) return { col: { ...DEFAULT_COL }, dateDetected };

        // 헤더 전체 텍스트 로그 (디버그)
        console.log('[Parser] 헤더 컬럼:', headerRow.map((v, i) => `[${i}]${v ?? ''}`).join(' | '));

        // explicitly 감지된 컬럼만 수집 (기본값과 별도)
        const detected = {};

        headerRow.forEach((cell, idx) => {
            if (cell == null) return;
            const h = String(cell).trim();
            const hl = h.toLowerCase();

            // 사번
            if (hl.startsWith('mã n') || hl === 'mã nv' || hl === 'ma nv')
                detected.EMP_ID = idx;
            // 직원명
            else if (hl.includes('tên nh') || hl.includes('ten nh') || hl === 'tên nv' || hl === 'ten nv')
                detected.EMP_NAME = idx;
            // 부서
            else if (hl.includes('phòng') || hl.includes('phong ban'))
                detected.DEPT = idx;
            // 직위
            else if (hl.includes('chức') || hl.includes('chuc vu') || hl.includes('chức vụ'))
                detected.POSITION = idx;
            // 날짜 (Ngày)
            else if (hl === 'ngày' || hl === 'ngay') {
                detected.DATE = idx;
                dateDetected = true;
            }
            // 요일 (Thứ)
            else if (hl === 'thứ' || hl === 'thu')
                detected.DAY_OF_WEEK = idx;
            // 출근시간 (Vào) — 'Vào Trễ'와 구분
            else if ((hl === 'vào' || hl === 'vao') && !hl.includes('tr'))
                detected.CHECK_IN = idx;
            // 퇴근시간 (Ra) — 'Ra sớm'과 구분
            else if (hl === 'ra' && !hl.includes('s'))
                detected.CHECK_OUT = idx;
            // 근무일수 (Công) — 'Công+'와 구분
            else if ((hl === 'công' || hl === 'cong') && !hl.includes('+'))
                detected.WORK_DAYS = idx;
            // 정상근무시간 (Giờ) — 'Giờ+'와 구분
            else if ((hl === 'giờ' || hl === 'gio') && !hl.includes('+'))
                detected.WORK_HOURS = idx;
            // 추가근무일수 (Công+)
            else if (hl === 'công+' || hl === 'cong+')
                detected.OT_DAYS = idx;
            // 추가근무시간 (Giờ+)
            else if (hl === 'giờ+' || hl === 'gio+')
                detected.OT_HOURS = idx;
            // 지각 (Vào Trễ)
            else if (hl.includes('vào trễ') || hl.includes('vao tre'))
                detected.LATE_MIN = idx;
            // 조퇴 (Ra sớm)
            else if (hl.includes('ra sớm') || hl.includes('ra som'))
                detected.EARLY_MIN = idx;
            // TC1 / TC2 / TC3
            else if (hl === 'tc1') detected.TC1 = idx;
            else if (hl === 'tc2') detected.TC2 = idx;
            else if (hl === 'tc3') detected.TC3 = idx;
            // 교대명 (Tên ca)
            else if (hl.includes('tên ca') || hl.includes('ten ca'))
                detected.SHIFT = idx;
            // 기호 (Kí hiệu) — 'Kí hiệu+'와 구분
            else if ((hl.includes('kí hiệu') || hl.includes('ki hieu')) && !hl.includes('+'))
                detected.SYMBOL = idx;
            // 기호+ (Kí hiệu+)
            else if (hl.includes('kí hiệu+') || hl.includes('ki hieu+'))
                detected.SYMBOL_PLUS = idx;
            // 총 근무시간 (Tổng giờ)
            else if (hl.includes('tổng') || hl.includes('tong gio'))
                detected.TOTAL_HOURS = idx;
        });

        // 감지된 컬럼 인덱스 집합
        const detectedIdxSet = new Set(Object.values(detected));

        // 기본값에서 시작하되, 감지된 컬럼 인덱스와 충돌하는 기본값은 -1로 설정
        // (충돌 방지: e.g. 기본 POSITION=3인데 실제 col3=Vào이면 position 필드에 엉뚱한 값 방지)
        const col = {};
        Object.keys(DEFAULT_COL).forEach(key => {
            if (detected.hasOwnProperty(key)) {
                col[key] = detected[key]; // 감지된 값 우선
            } else if (detectedIdxSet.has(DEFAULT_COL[key])) {
                col[key] = -1; // 기본값이 다른 감지 컬럼과 충돌 → 없음으로 표시
            } else {
                col[key] = DEFAULT_COL[key]; // 충돌 없는 기본값 유지
            }
        });

        console.log('[Parser] 최종 컬럼 위치:', JSON.stringify(col));
        return { col, dateDetected };
    }

    /**
     * 시간 문자열을 분 단위로 변환
     * @param {string|number} timeStr - "HH:MM" 또는 숫자
     * @returns {number|null} 분 단위 시간 또는 null
     */
    function parseTime(timeStr) {
        if (!timeStr || timeStr === 0 || timeStr === '0') return null;

        if (typeof timeStr === 'string') {
            const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
            if (match) {
                return parseInt(match[1]) * 60 + parseInt(match[2]);
            }
        }

        // 엑셀 시간 형식 (소수점) 처리
        if (typeof timeStr === 'number' && timeStr > 0 && timeStr < 1) {
            const totalMinutes = Math.round(timeStr * 24 * 60);
            return totalMinutes;
        }

        return null;
    }

    /**
     * 분 단위를 "HH:MM" 형식으로 변환
     * @param {number} minutes
     * @returns {string}
     */
    function minutesToTimeStr(minutes) {
        if (minutes === null || minutes === undefined) return '-';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * 엑셀 날짜를 JS Date로 변환
     * cellDates: false 사용 → 시리얼 넘버로 직접 변환 (시간대 문제 방지)
     * @param {*} dateVal
     * @returns {Date|null}
     */
    function parseDate(dateVal) {
        if (!dateVal) return null;

        // Date 객체 (만약 cellDates: true인 경우)
        if (dateVal instanceof Date) {
            return new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
        }

        // 엑셀 시리얼 날짜 (숫자) — 주요 경로
        if (typeof dateVal === 'number' && dateVal > 40000) {
            // Excel serial → UTC milliseconds → 정오(noon)로 보정하여 시간대 안전
            const utcMs = (dateVal - 25569) * 86400000;
            const d = new Date(utcMs + 12 * 3600000);
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }

        // 문자열 날짜 처리
        if (typeof dateVal === 'string') {
            // "D/M/YY" 또는 "M/D/YY" 형식 → 오늘과 가장 가까운 해석 선택
            let match = dateVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
            if (match) {
                let yr = parseInt(match[3]);
                if (yr < 100) yr += 2000;
                const a = parseInt(match[1]), b = parseInt(match[2]);
                const today = new Date();
                const candidates = [];
                if (a >= 1 && a <= 12 && b >= 1 && b <= 31)
                    candidates.push(new Date(yr, a - 1, b)); // M/D
                if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
                    const d = new Date(yr, b - 1, a); // D/M
                    if (candidates.every(c => c.getTime() !== d.getTime())) candidates.push(d);
                }
                if (candidates.length === 1) return candidates[0];
                if (candidates.length > 1)
                    return candidates.reduce((best, d) =>
                        Math.abs(d - today) < Math.abs(best - today) ? d : best);
            }

            // "YYYY-MM-DD" 형식
            match = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }

            // "DD-MM-YYYY" 형식
            match = dateVal.match(/^(\d{2})-(\d{2})-(\d{4})$/);
            if (match) {
                return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            }

            // 일반 Date 파싱 시도
            const d = new Date(dateVal);
            if (!isNaN(d.getTime())) return d;
        }

        return null;
    }

    /**
     * 날짜를 "YYYY-MM-DD" 형식으로 변환
     */
    function formatDate(date) {
        if (!date) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 날짜를 "MM-DD" 형식으로 변환
     */
    function formatDateShort(date) {
        if (!date) return '';
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${m}-${d}`;
    }

    /**
     * 행 데이터를 직원 근태 레코드로 변환
     * @param {Array} row - 엑셀 행 데이터
     * @param {Object} col - 감지된 컬럼 위치 맵
     * @returns {Object|null} 근태 레코드
     */
    function parseRow(row, col, dateOverride) {
        col = col || DEFAULT_COL;
        if (!row || !row[col.EMP_ID]) return null;

        const empId = String(row[col.EMP_ID]).trim();
        if (!empId || empId === 'Mã N.Viên') return null; // 헤더 스킵

        // DATE 컬럼이 없는 형식(시트 이름=날짜)은 dateOverride 사용
        const date = dateOverride || parseDate(row[col.DATE]);
        if (!date) return null;

        const checkIn = parseTime(row[col.CHECK_IN]);
        const checkOut = parseTime(row[col.CHECK_OUT]);
        const symbol = row[col.SYMBOL] || '';
        const shift = row[col.SHIFT] || '';

        return {
            empId: empId,
            empName: row[col.EMP_NAME] || '',
            dept: row[col.DEPT] || '',
            position: row[col.POSITION] || '',
            date: date,
            dateStr: formatDate(date),
            dateShort: formatDateShort(date),
            dayOfWeek: DAY_MAP[row[col.DAY_OF_WEEK]] || row[col.DAY_OF_WEEK] || '',
            dayOfWeekVN: row[col.DAY_OF_WEEK] || '',
            checkIn: checkIn,
            checkInStr: minutesToTimeStr(checkIn),
            checkOut: checkOut,
            checkOutStr: minutesToTimeStr(checkOut),
            workDays: parseFloat(row[col.WORK_DAYS]) || 0,
            workHours: parseFloat(row[col.WORK_HOURS]) || 0,
            otDays: parseFloat(row[col.OT_DAYS]) || 0,
            otHours: parseFloat(row[col.OT_HOURS]) || 0,
            lateMin: parseInt(row[col.LATE_MIN]) || 0,
            earlyMin: parseInt(row[col.EARLY_MIN]) || 0,
            tc1: parseFloat(row[col.TC1]) || 0,
            tc2: parseFloat(row[col.TC2]) || 0,
            tc3: parseFloat(row[col.TC3]) || 0,
            shift: shift,
            symbol: symbol,
            symbolDesc: SYMBOL_MAP[symbol] || symbol,
            symbolPlus: row[col.SYMBOL_PLUS] || '',
            totalHours: parseFloat(row[col.TOTAL_HOURS]) || 0
        };
    }

    /**
     * 엑셀 파일 파싱
     * @param {ArrayBuffer} data - 파일 데이터
     * @returns {Object} 파싱 결과 { records, dates, departments, employees }
     */
    function parseExcel(data, fileName) {
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        // 파일 이름에서 날짜 추출 (시트 이름보다 우선순위 높음)
        const fileDate = parseDateFromFileName(fileName);
        if (fileDate) {
            console.log(`[Parser] 파일명 "${fileName}"에서 날짜 추출: ${formatDate(fileDate)}`);
        }
        const allRecords = [];
        const rowMap = {}; // recordIndex → { sheetName, rowIndex(0-based 절대행) }
                           // 동일 사번+날짜 중복 허용: empId|dateStr 대신 레코드 순번 사용

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];

            // 시트의 실제 시작 행 오프셋 (절대 셀 주소 계산에 필요)
            const ref = worksheet['!ref']
                ? XLSX.utils.decode_range(worksheet['!ref'])
                : { s: { r: 0 } };
            const firstRow = ref.s.r;

            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: null,
                raw: true
            });

            // 데이터 행 시작점 찾기: 최대 20행 내에서 헤더 행('Mã N.Viên' 포함) 탐색
            let startRow = -1;
            for (let i = 0; i < Math.min(20, jsonData.length); i++) {
                const row = jsonData[i];
                if (!row) continue;
                const cell0 = String(row[0] ?? '').trim().toLowerCase();
                if (cell0.startsWith('mã n') || cell0 === 'mã nv' || cell0 === 'ma nv' ||
                    cell0.includes('mã nhân') || cell0.includes('ma nhan')) {
                    startRow = i + 1;
                    console.log(`[Parser] 헤더 행 발견: 시트="${sheetName}", 행=${i}, 텍스트="${row[0]}"`);
                    break;
                }
            }

            // 헤더를 못 찾은 경우: fallback
            if (startRow < 0) {
                console.warn(`[Parser] 헤더 미발견 — 시트="${sheetName}", 기본값 startRow=3 사용`);
                startRow = 3;
            }

            // ★ 헤더 행에서 컬럼 위치 자동 감지
            const { col: sheetCOL, dateDetected } = detectColumns(jsonData[startRow - 1]);

            // DATE 컬럼 미감지 시: 파일명 날짜 우선, 없으면 시트 이름에서 추출
            let sheetDateOverride = null;
            if (!dateDetected) {
                if (fileDate) {
                    sheetDateOverride = fileDate;
                    console.log(`[Parser] DATE 컬럼 없음 → 파일명 날짜 사용: ${formatDate(fileDate)}`);
                } else {
                    sheetDateOverride = parseDateFromSheetName(sheetName);
                    if (sheetDateOverride) {
                        console.log(`[Parser] DATE 컬럼 없음 → 시트명 "${sheetName}"에서 날짜 추출: ${formatDate(sheetDateOverride)}`);
                    } else {
                        console.warn(`[Parser] DATE 컬럼 없음 + 날짜 파싱 실패 — 파일="${fileName}", 시트="${sheetName}"`);
                    }
                }
            }
            console.log(`[Parser] 시트="${sheetName}", startRow=${startRow}, 총 ${jsonData.length}행`);

            for (let i = startRow; i < jsonData.length; i++) {
                const record = parseRow(jsonData[i], sheetCOL, sheetDateOverride);
                if (record) {
                    const recIdx = allRecords.length;  // 레코드 순번 (0-based)
                    allRecords.push(record);
                    // rowIndex = 워크시트 내 0-based 절대 행 번호
                    rowMap[recIdx] = { sheetName, rowIndex: firstRow + i };
                }
            }
        }

        // 메타데이터 추출
        const dates = [...new Set(allRecords.map(r => r.dateStr))].sort();
        const departments = [...new Set(allRecords.map(r => r.dept))].sort();
        const employees = {};

        allRecords.forEach(r => {
            if (!employees[r.empId]) {
                employees[r.empId] = {
                    empId: r.empId,
                    empName: r.empName,
                    dept: r.dept,
                    position: r.position
                };
            }
        });

        return {
            records: allRecords,
            dates: dates,
            departments: departments,
            employees: employees,
            totalRecords: allRecords.length,
            rowMap: rowMap
        };
    }

    // Public API
    return {
        parseExcel,
        parseTime,
        minutesToTimeStr,
        formatDate,
        formatDateShort,
        DAY_MAP,
        SYMBOL_MAP
    };
})();
