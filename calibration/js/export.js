const Exporter = (() => {
    function toExcel(items, filename) {
        if (!items || !items.length) { alert('내보낼 데이터가 없습니다.'); return; }

        const rows = items.map(e => ({
            'No': e.item_no,
            'Sanico Control Number': e.control_number,
            'Equipment name': e.equipment_name,
            'Manufacturer': e.manufacturer,
            'Model Number': e.model_number,
            'Serial Number': e.serial_number,
            'Calibration frequency': e.calibration_frequency,
            'Calibration date': e.calibration_date ? e.calibration_date.substring(0,10) : '',
            'Due Date': e.due_date ? e.due_date.substring(0,10) : '',
            'Calibration result': e.calibration_result,
            'Next calibration plan': e.next_calibration_plan ? e.next_calibration_plan.substring(0,10) : '',
            'Location': e.location,
            'Calibration place': e.calibration_place,
            'Remain next calibration days': e.remain_days
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Calibration');

        // Auto column widths
        const colWidths = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 15) }));
        ws['!cols'] = colWidths;

        XLSX.writeFile(wb, filename || `SNCV_검교정_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    return { toExcel };
})();
