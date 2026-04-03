const Renderer = (() => {
    function getStatusInfo(remainDays) {
        if (remainDays === null || remainDays === undefined) return { cls: 'badge-info', label: '-' };
        const n = Math.abs(remainDays);
        if (remainDays < 0)  return { cls: 'badge-overdue',  label: I18n.t('status.overdue_days', { n }) };
        if (remainDays <= 7) return { cls: 'badge-critical', label: I18n.t('status.remain_days',  { n: remainDays }) };
        if (remainDays <= 30) return { cls: 'badge-urgent',  label: I18n.t('status.remain_days',  { n: remainDays }) };
        if (remainDays <= 60) return { cls: 'badge-warning', label: I18n.t('status.remain_days',  { n: remainDays }) };
        if (remainDays <= 90) return { cls: 'badge-info',    label: I18n.t('status.remain_days',  { n: remainDays }) };
        return { cls: 'badge-ok', label: I18n.t('status.remain_days', { n: remainDays }) };
    }

    function renderStats(stats) {
        document.getElementById('stat-total').textContent = stats.total ?? '-';
        document.getElementById('stat-ok').textContent = stats.ok ?? '-';
        document.getElementById('stat-critical').textContent = stats.critical ?? '-';
        document.getElementById('stat-overdue').textContent = stats.overdue ?? '-';
    }

    function renderLocationTable(byLocation) {
        const wrap = document.getElementById('location-table-wrap');
        if (!byLocation || !byLocation.length) {
            wrap.innerHTML = `<p class="empty-msg">${I18n.t('dashboard.no_data')}</p>`;
            return;
        }
        const max = Math.max(...byLocation.map(l => l.count));
        const rows = byLocation.map(l => `
            <tr>
                <td><strong>${l.location || '-'}</strong></td>
                <td>${l.count}</td>
                <td>
                    <div class="loc-bar"><div class="loc-bar-fill" style="width:${Math.round(l.count/max*100)}%"></div></div>
                </td>
                <td>${l.due_soon > 0 ? `<span class="status-badge badge-urgent">${l.due_soon}</span>` : '-'}</td>
                <td>${l.overdue > 0 ? `<span class="status-badge badge-overdue">${l.overdue}</span>` : '-'}</td>
            </tr>
        `).join('');
        wrap.innerHTML = `
            <div class="table-wrap">
            <table class="loc-table">
                <thead><tr>
                    <th>${I18n.t('table.col_dept')}</th>
                    <th>${I18n.t('table.col_total')}</th>
                    <th>${I18n.t('table.col_chart')}</th>
                    <th>${I18n.t('table.col_due_30')}</th>
                    <th>${I18n.t('table.col_overdue')}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
        `;
    }

    function renderEquipmentTable(items, certMap = {}) {
        const wrap = document.getElementById('list-table-wrap');
        if (!items || !items.length) {
            wrap.innerHTML = `<p class="empty-msg">${I18n.t('table.no_data')}</p>`;
            return;
        }

        const isDisposedView = items.length > 0 && items[0].eq_status === 'disposed';

        const rows = items.map(e => {
            const isDisposed = e.eq_status === 'disposed';
            const s = isDisposed
                ? { cls: 'badge-disposed', label: I18n.t('dispose.status_label') }
                : getStatusInfo(e.remain_days);

            const certs = certMap[e.id] || [];
            const certCell = certs.length > 0
                ? certs.map(c => `
                    <a href="${API.getCertFileUrl(c.file_path)}" target="_blank"
                       class="cert-link" title="${c.original_filename || c.cert_number || 'Certificate'}">
                       &#128196; ${c.cert_number || c.original_filename || 'cert'}
                    </a>`).join('<br>')
                : '';

            const certUploadBtn = isDisposed ? '' :
                `<button class="btn-cert-upload" onclick="App.openCertUpload(${e.id},'${(e.control_number||'').replace(/'/g,"\\'")}')">&#8679; ${I18n.t('table.cert_upload')}</button>`;

            const disposeBtn = isDisposed
                ? `<button class="btn-restore" onclick="App.restoreEquipment(${e.id},'${(e.equipment_name||'').replace(/'/g,"\\'")}')">&#8635; ${I18n.t('dispose.restore_btn')}</button>`
                : `<button class="btn-dispose" onclick="App.openDisposeModal(${e.id},'${(e.equipment_name||'').replace(/'/g,"\\'")}')">&#128465; ${I18n.t('dispose.dispose_btn')}</button>`;

            const disposedInfo = isDisposed
                ? `<td>${e.disposed_at || '-'}</td><td>${e.disposal_reason || '-'}</td>`
                : `<td>${e.calibration_date ? e.calibration_date.substring(0,10) : '-'}</td>
                   <td>${e.due_date ? e.due_date.substring(0,10) : '-'}</td>`;

            return `<tr class="${isDisposed ? 'row-disposed' : ''}">
                <td>${e.item_no ?? '-'}</td>
                <td><small>${e.control_number || '-'}</small></td>
                <td><strong>${e.equipment_name || '-'}</strong></td>
                <td>${e.manufacturer || '-'}</td>
                <td><small>${e.model_number || '-'}</small></td>
                <td>${e.location || '-'}</td>
                ${disposedInfo}
                <td><span class="status-badge ${s.cls}">${s.label}</span></td>
                <td>${isDisposed ? '' : (e.calibration_result || '-')}</td>
                <td class="cert-cell">${isDisposed ? '' : certCell}${certUploadBtn}</td>
                <td class="action-cell">${disposeBtn}</td>
            </tr>`;
        }).join('');

        const disposedHeader = isDisposedView
            ? `<th>${I18n.t('dispose.col_disposed_at')}</th><th>${I18n.t('dispose.col_reason')}</th>`
            : `<th>${I18n.t('table.col_cal_date')}</th><th>${I18n.t('table.col_due_date')}</th>`;

        wrap.innerHTML = `
            <div class="table-wrap">
            <p style="color:var(--gray-500);font-size:12px;margin-bottom:8px">${I18n.t('list.total_count', { n: items.length })}</p>
            <table class="data-table">
                <thead><tr>
                    <th>${I18n.t('table.col_no')}</th>
                    <th>${I18n.t('table.col_control')}</th>
                    <th>${I18n.t('table.col_name')}</th>
                    <th>${I18n.t('table.col_maker')}</th>
                    <th>${I18n.t('table.col_model')}</th>
                    <th>${I18n.t('table.col_location')}</th>
                    ${disposedHeader}
                    <th>${I18n.t('table.col_remain')}</th>
                    <th>${I18n.t('table.col_result')}</th>
                    <th>${I18n.t('table.col_cert')}</th>
                    <th>${I18n.t('table.col_action')}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
        `;
    }

    function renderAlertConfig(configs) {
        const wrap = document.getElementById('alert-config-wrap');
        if (!configs || !configs.length) {
            wrap.innerHTML = `<p class="empty-msg">${I18n.t('alerts.no_config')}</p>`;
            return;
        }
        const levelKeys = { 90: 'alerts.level_90', 60: 'alerts.level_60', 30: 'alerts.level_30', 7: 'alerts.level_7' };
        const levelColors = { 90: '#0096D6', 60: '#d97706', 30: '#ea580c', 7: '#dc2626' };

        const rows = configs.map(c => `
            <tr data-id="${c.id}">
                <td><span style="color:${levelColors[c.threshold_days] || '#666'};font-weight:600">${I18n.t('alerts.threshold_label', { n: c.threshold_days })}</span></td>
                <td>${I18n.t(levelKeys[c.threshold_days] || 'alerts.col_level')}</td>
                <td>
                    <label class="toggle-switch">
                        <input type="checkbox" class="cfg-enabled" ${c.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td><input type="text" class="input-recipients cfg-recipients" value="${c.email_recipients || ''}" placeholder="${I18n.t('alerts.recipients_placeholder')}"></td>
            </tr>
        `).join('');

        wrap.innerHTML = `
            <table class="alert-table">
                <thead><tr>
                    <th>${I18n.t('alerts.col_threshold')}</th>
                    <th>${I18n.t('alerts.col_level')}</th>
                    <th>${I18n.t('alerts.col_enabled')}</th>
                    <th>${I18n.t('alerts.col_recipients')}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function renderAlertLog(logs) {
        const wrap = document.getElementById('alert-log-wrap');
        if (!logs || !logs.length) {
            wrap.innerHTML = `<p class="empty-msg">${I18n.t('alerts.history_empty')}</p>`;
            return;
        }
        const rows = logs.map(l => `
            <tr>
                <td>${l.sent_at ? new Date(l.sent_at.replace(' ','T')+'Z').toLocaleString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).substring(0,16) : '-'}</td>
                <td>${I18n.t('alerts.threshold_label', { n: l.threshold_days })}</td>
                <td>${l.equipment_name || '-'}</td>
                <td>${l.control_number || '-'}</td>
                <td>${l.recipients || '-'}</td>
                <td><span class="status-badge ${l.status === 'sent' ? 'badge-ok' : 'badge-critical'}">${l.status}</span></td>
            </tr>
        `).join('');
        wrap.innerHTML = `
            <div class="table-wrap">
            <table class="log-table">
                <thead><tr>
                    <th>${I18n.t('alerts.col_sent_at')}</th>
                    <th>${I18n.t('alerts.col_threshold')}</th>
                    <th>${I18n.t('alerts.col_equipment')}</th>
                    <th>${I18n.t('alerts.col_control')}</th>
                    <th>${I18n.t('alerts.col_recipients')}</th>
                    <th>${I18n.t('alerts.col_status')}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
        `;
    }

    function renderPreview(items, headers) {
        const wrap = document.getElementById('preview-wrap');
        if (!items.length) { wrap.innerHTML = ''; return; }
        const previewRows = items.slice(0, 10).map(item =>
            `<tr>${headers.map(h => `<td>${item[h] || '-'}</td>`).join('')}</tr>`
        ).join('');
        wrap.innerHTML = `
            <p class="preview-label">${I18n.t('list.total_count', { n: items.length })} (max 10)</p>
            <div class="table-wrap">
            <table class="preview-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>${previewRows}</tbody>
            </table>
            </div>
        `;
    }

    return {
        getStatusInfo,
        renderStats,
        renderLocationTable,
        renderEquipmentTable,
        renderAlertConfig,
        renderAlertLog,
        renderPreview
    };
})();
