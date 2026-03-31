const Parser = (() => {
    // Parse uploaded Excel for client-side preview
    function parseExcel(arrayBuffer) {
        const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

        // Find header row (row with "No" in col 0)
        let headerIdx = -1;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            if (rows[i] && String(rows[i][0]).toLowerCase().includes('no')) {
                headerIdx = i;
                break;
            }
        }
        if (headerIdx === -1) throw new Error('헤더 행을 찾을 수 없습니다');

        const headers = rows[headerIdx].map(h => h ? String(h).trim() : '');
        const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] != null && r[0] !== '');

        const yearMatch = sheetName.match(/\d{4}/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

        const items = dataRows.map(row => {
            const obj = { year };
            headers.forEach((h, i) => {
                if (h) obj[h] = row[i] instanceof Date
                    ? row[i].toISOString().split('T')[0]
                    : (row[i] != null ? String(row[i]).trim() : null);
            });
            return obj;
        });

        return { year, items, headers };
    }

    return { parseExcel };
})();
