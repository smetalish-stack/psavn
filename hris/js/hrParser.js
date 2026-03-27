/**
 * 인사DB Excel 파서
 * 형식: 인사 DB 시트, 행 0-4는 제목/헤더, 데이터는 행 5부터
 */

const HrParser = (() => {

    function parseHrExcel(data) {
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

        // 데이터 시작 행 찾기 (사번/Mã nhân viên 헤더 다음 행)
        let dataStart = 5;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const v = String(rows[i]?.[0] || '').trim();
            if (v === '사번' || v === 'Mã nhân viên') {
                // 다음 비헤더 행을 찾음
                for (let j = i + 1; j < rows.length; j++) {
                    const v2 = String(rows[j]?.[0] || '').trim();
                    if (v2 && v2 !== '사번' && !v2.startsWith('Mã')) {
                        dataStart = j;
                        break;
                    }
                }
                break;
            }
        }

        const records = {};
        for (let i = dataStart; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0]) continue;
            const empId = String(row[0]).trim();
            if (!empId) continue;

            records[empId] = {
                empId,
                empName:            String(row[1] || '').trim(),
                hireDate:           parseHireDate(row[2]),
                dept:               String(row[3] || '').trim(),
                process:            String(row[4] || '').trim(),
                allowanceProcess:   toNum(row[5]),
                allowanceSeniority: toNum(row[6]),
                allowanceChild:     toNum(row[7]),
                allowanceOther:     toNum(row[8]),
                allowanceTotal:     toNum(row[9]),
                idNumber:           String(row[10] || '').trim(),
                bankAccount:        String(row[11] || '').trim(),
                bankName:           String(row[12] || '').trim()
            };
        }

        return records;
    }

    function parseHireDate(val) {
        if (!val && val !== 0) return '';
        if (typeof val === 'number') {
            // Excel 직렬 날짜 → YYYY-MM-DD
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        // 이미 문자열인 경우 (예: "2014-10-01")
        return String(val).trim();
    }

    function toNum(v) {
        const n = Number(v);
        return isNaN(n) ? 0 : n;
    }

    return { parseHrExcel };
})();
