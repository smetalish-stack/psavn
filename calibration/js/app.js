const App = (() => {
    let state = {
        currentEquipment: [],
        currentTab: 'dashboard'
    };

    // ── Init ──
    async function init() {
        // Init i18n first, then render everything
        await I18n.init();

        document.getElementById('header-date').textContent =
            new Date().toLocaleDateString(I18n.getLang() === 'ko' ? 'ko-KR' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric' });

        setupTabs();
        setupUpload();

        await loadYears();
        loadDashboard();

        // Re-render dynamic content when language changes
        I18n.onChange(() => {
            loadYears();
            if (state.currentTab === 'dashboard') loadDashboard();
            if (state.currentTab === 'list' && state.currentEquipment.length) {
                // re-render current list with new lang
                Renderer.renderEquipmentTable(state.currentEquipment);
            }
            if (state.currentTab === 'alerts') {
                loadAlertConfig();
                loadAlertLog();
            }
        });
    }

    // ── Tabs ──
    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('tab-' + tab).classList.add('active');
                state.currentTab = tab;

                if (tab === 'alerts') {
                    loadAlertConfig();
                    loadAlertLog();
                }
            });
        });
    }

    // ── Year Selectors ──
    async function loadYears() {
        try {
            const years = await API.getYears();
            const dashSel = document.getElementById('dash-year');
            const listSel = document.getElementById('filter-year');
            const prevDash = dashSel.value;

            dashSel.innerHTML = `<option value="">${I18n.t('dashboard.year_all')}</option>`;
            listSel.innerHTML = `<option value="">${I18n.t('list.all_years')}</option>`;

            years.forEach(y => {
                dashSel.innerHTML += `<option value="${y}">${y}</option>`;
                listSel.innerHTML += `<option value="${y}">${y}</option>`;
            });

            // Restore previous selection or default to latest year
            if (prevDash && years.includes(parseInt(prevDash))) dashSel.value = prevDash;
            else if (years.length) dashSel.value = years[0];
        } catch (e) {
            console.warn('[App] Could not load years:', e.message);
        }

        // Load locations
        try {
            const locs = await API.getLocations();
            const locSel = document.getElementById('filter-location');
            const prevLoc = locSel.value;
            locSel.innerHTML = `<option value="">${I18n.t('list.all_depts')}</option>`;
            locs.forEach(l => locSel.innerHTML += `<option value="${l}">${l}</option>`);
            if (prevLoc) locSel.value = prevLoc;
        } catch (e) {
            console.warn('[App] Could not load locations:', e.message);
        }
    }

    // ── Dashboard ──
    async function loadDashboard() {
        const year = document.getElementById('dash-year')?.value;
        showLoading(true);
        try {
            const stats = await API.getDashboard(year);
            Renderer.renderStats(stats);
            Renderer.renderLocationTable(stats.byLocation);
        } catch (e) {
            console.error('[App] Dashboard load failed:', e.message);
        } finally {
            showLoading(false);
        }
    }

    // ── Equipment List ──
    async function loadList() {
        const params = {
            year: document.getElementById('filter-year').value,
            location: document.getElementById('filter-location').value,
            status: document.getElementById('filter-status').value,
            search: document.getElementById('filter-search').value
        };
        Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

        showLoading(true);
        try {
            const items = await API.getEquipment(params);
            state.currentEquipment = items;

            const certMap = {};
            await Promise.all(items.map(async e => {
                try {
                    const certs = await API.getCertificates(e.id);
                    if (certs.length) certMap[e.id] = certs;
                } catch (_) {}
            }));

            Renderer.renderEquipmentTable(items, certMap);
        } catch (e) {
            document.getElementById('list-table-wrap').innerHTML =
                `<p class="empty-msg" style="color:var(--status-critical)">${I18n.t('upload.error_prefix')}${e.message}</p>`;
        } finally {
            showLoading(false);
        }
    }

    function exportToExcel() {
        Exporter.toExcel(state.currentEquipment);
    }

    // ── File Upload ──
    function setupUpload() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

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

    async function handleFile(file) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            setUploadStatus(I18n.t('upload.error_format'), 'error');
            return;
        }

        setUploadStatus(I18n.t('upload.validating'), 'loading');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const { year, items, headers } = Parser.parseExcel(e.target.result);
                Renderer.renderPreview(items, headers);
                setUploadStatus(I18n.t('upload.uploading', { n: items.length, year }), 'loading');

                const mode = document.querySelector('input[name="upload-mode"]:checked').value;
                const fd = new FormData();
                fd.append('file', file);
                fd.append('mode', mode);

                const result = await API.uploadFile(fd);
                setUploadStatus(I18n.t('upload.success', { n: result.count, year: result.year }), 'success');

                await loadYears();
            } catch (err) {
                setUploadStatus(I18n.t('upload.error_prefix') + err.message, 'error');
                console.error('[Upload]', err);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function setUploadStatus(msg, type) {
        const el = document.getElementById('upload-status');
        el.textContent = msg;
        el.className = 'upload-status ' + (type || '');
    }

    // ── Alert Config ──
    async function loadAlertConfig() {
        try {
            const configs = await API.getAlertConfig();
            Renderer.renderAlertConfig(configs);
        } catch (e) {
            document.getElementById('alert-config-wrap').innerHTML =
                `<p class="empty-msg" style="color:var(--status-critical)">${I18n.t('upload.error_prefix')}${e.message}</p>`;
        }
    }

    async function saveAlertConfig() {
        const rows = document.querySelectorAll('#alert-config-wrap tr[data-id]');
        const configs = Array.from(rows).map(row => ({
            id: parseInt(row.dataset.id),
            enabled: row.querySelector('.cfg-enabled').checked,
            email_recipients: row.querySelector('.cfg-recipients').value.trim()
        }));

        showLoading(true);
        try {
            await API.saveAlertConfig(configs);
            alert(I18n.t('alerts.save') + ' ✓');
        } catch (e) {
            alert(I18n.t('upload.error_prefix') + e.message);
        } finally {
            showLoading(false);
        }
    }

    async function sendTestEmail() {
        const rows = document.querySelectorAll('#alert-config-wrap tr[data-id]');
        const firstRecipients = Array.from(rows).map(r => r.querySelector('.cfg-recipients').value.trim()).find(v => v);
        const input = prompt(I18n.t('alerts.test_prompt'), firstRecipients || '');
        if (!input) return;

        showLoading(true);
        try {
            await API.sendTestEmail(input);
            alert(I18n.t('alerts.send_test') + ' ✓');
        } catch (e) {
            alert(I18n.t('upload.error_prefix') + e.message);
        } finally {
            showLoading(false);
        }
    }

    async function loadAlertLog() {
        try {
            const logs = await API.getAlertLog();
            Renderer.renderAlertLog(logs);
        } catch (e) {
            document.getElementById('alert-log-wrap').innerHTML =
                `<p class="empty-msg" style="color:var(--status-critical)">${I18n.t('upload.error_prefix')}${e.message}</p>`;
        }
    }

    // ── Add Equipment Modal ──
    function openAddEquipmentModal() {
        document.getElementById('add-equip-modal')?.remove();

        const currentYear = new Date().getFullYear();
        const modal = document.createElement('div');
        modal.id = 'add-equip-modal';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="document.getElementById('add-equip-modal').remove()"></div>
            <div class="modal-box modal-box-wide">
                <div class="modal-header">
                    <h3>&#43; ${I18n.t('add_modal.title')}</h3>
                    <button class="modal-close" onclick="document.getElementById('add-equip-modal').remove()">&#10005;</button>
                </div>
                <div class="modal-body">
                    <div class="modal-grid">
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.year')} <span style="color:var(--status-critical)">*</span></label>
                            <input type="number" id="ae-year" value="${currentYear}" class="input-sm" min="2020" max="2099">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.item_no')}</label>
                            <input type="number" id="ae-item-no" class="input-sm" placeholder="1">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.control_number')}</label>
                            <input type="text" id="ae-control" class="input-sm" placeholder="SNCV-EMS-12-05">
                        </div>
                        <div class="modal-field modal-field-wide">
                            <label>${I18n.t('add_modal.equipment_name')} <span style="color:var(--status-critical)">*</span></label>
                            <input type="text" id="ae-name" class="input-sm" placeholder="Micrometer">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.manufacturer')}</label>
                            <input type="text" id="ae-maker" class="input-sm" placeholder="MITUTOYO">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.model_number')}</label>
                            <input type="text" id="ae-model" class="input-sm" placeholder="342-371-30">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.serial_number')}</label>
                            <input type="text" id="ae-serial" class="input-sm">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.location')}</label>
                            <input type="text" id="ae-location" class="input-sm" placeholder="IQC-EMS">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.calibration_date')}</label>
                            <input type="date" id="ae-cal-date" class="input-sm">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.due_date')}</label>
                            <input type="date" id="ae-due-date" class="input-sm">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.calibration_frequency')}</label>
                            <input type="text" id="ae-freq" class="input-sm" value="1 year">
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.calibration_result')}</label>
                            <select id="ae-result" class="input-sm">
                                <option value="">-</option>
                                <option value="PASSED">PASSED</option>
                                <option value="FAILED">FAILED</option>
                            </select>
                        </div>
                        <div class="modal-field">
                            <label>${I18n.t('add_modal.calibration_place')}</label>
                            <select id="ae-place" class="input-sm">
                                <option value="External">External</option>
                                <option value="Internal">Internal</option>
                            </select>
                        </div>
                    </div>
                    <div id="ae-msg" style="font-size:13px;margin-top:8px"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="App.submitAddEquipment()">${I18n.t('add_modal.submit')}</button>
                    <button class="btn-secondary" onclick="document.getElementById('add-equip-modal').remove()">${I18n.t('add_modal.cancel')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function submitAddEquipment() {
        const msgEl = document.getElementById('ae-msg');
        const year = document.getElementById('ae-year').value;
        const name = document.getElementById('ae-name').value.trim();

        if (!year || !name) {
            msgEl.style.color = 'var(--status-critical)';
            msgEl.textContent = I18n.t('add_modal.error_required');
            return;
        }

        msgEl.style.color = 'var(--accent)';
        msgEl.textContent = I18n.t('add_modal.saving');

        const data = {
            year: parseInt(year),
            item_no: document.getElementById('ae-item-no').value || null,
            control_number: document.getElementById('ae-control').value.trim() || null,
            equipment_name: name,
            manufacturer: document.getElementById('ae-maker').value.trim() || null,
            model_number: document.getElementById('ae-model').value.trim() || null,
            serial_number: document.getElementById('ae-serial').value.trim() || null,
            location: document.getElementById('ae-location').value.trim() || null,
            calibration_date: document.getElementById('ae-cal-date').value || null,
            due_date: document.getElementById('ae-due-date').value || null,
            calibration_frequency: document.getElementById('ae-freq').value.trim() || '1 year',
            calibration_result: document.getElementById('ae-result').value || null,
            calibration_place: document.getElementById('ae-place').value || 'External'
        };

        try {
            await API.createEquipment(data);
            msgEl.style.color = 'var(--status-ok)';
            msgEl.textContent = I18n.t('add_modal.success');
            await loadYears();
            setTimeout(() => {
                document.getElementById('add-equip-modal')?.remove();
                // Switch to list tab and load the new year
                document.querySelector('[data-tab="list"]')?.click();
                document.getElementById('filter-year').value = year;
                loadList();
            }, 700);
        } catch (err) {
            msgEl.style.color = 'var(--status-critical)';
            msgEl.textContent = I18n.t('upload.error_prefix') + err.message;
        }
    }

    // ── Certificate Upload Modal ──
    function openCertUpload(equipId, controlNumber) {
        document.getElementById('cert-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'cert-modal';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="document.getElementById('cert-modal').remove()"></div>
            <div class="modal-box">
                <div class="modal-header">
                    <h3>&#128196; ${I18n.t('cert_modal.title')}</h3>
                    <button class="modal-close" onclick="document.getElementById('cert-modal').remove()">&#10005;</button>
                </div>
                <div class="modal-body">
                    <p class="modal-equip">${controlNumber}</p>
                    <div class="modal-field">
                        <label>${I18n.t('cert_modal.cert_no')}</label>
                        <input type="text" id="cert-number-input" placeholder="TL2026-00117" class="input-sm">
                    </div>
                    <div class="modal-field">
                        <label>${I18n.t('cert_modal.cal_date')}</label>
                        <input type="date" id="cert-date-input" class="input-sm">
                    </div>
                    <div class="modal-field">
                        <label>${I18n.t('cert_modal.file')}</label>
                        <input type="file" id="cert-file-input" accept=".pdf" class="input-sm">
                    </div>
                    <div id="cert-upload-msg" style="font-size:13px;margin-top:8px"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="App.submitCertUpload(${equipId})">${I18n.t('cert_modal.submit')}</button>
                    <button class="btn-secondary" onclick="document.getElementById('cert-modal').remove()">${I18n.t('cert_modal.cancel')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function submitCertUpload(equipId) {
        const fileInput = document.getElementById('cert-file-input');
        const certNumber = document.getElementById('cert-number-input').value.trim();
        const certDate = document.getElementById('cert-date-input').value;
        const msgEl = document.getElementById('cert-upload-msg');

        if (!fileInput.files[0]) { msgEl.textContent = I18n.t('cert_modal.file') + '?'; return; }

        msgEl.style.color = 'var(--accent)';
        msgEl.textContent = I18n.t('cert_modal.uploading');

        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        if (certNumber) fd.append('cert_number', certNumber);
        if (certDate) fd.append('cert_date', certDate);

        try {
            await API.uploadCertificate(equipId, fd);
            msgEl.style.color = 'var(--status-ok)';
            msgEl.textContent = I18n.t('cert_modal.success');
            setTimeout(() => {
                document.getElementById('cert-modal')?.remove();
                loadList();
            }, 800);
        } catch (err) {
            msgEl.style.color = 'var(--status-critical)';
            msgEl.textContent = I18n.t('upload.error_prefix') + err.message;
        }
    }

    // ── Logout ──
    async function logout() {
        try {
            await fetch('http://localhost:4000/api/logout', {
                method: 'POST',
                headers: { 'X-Auth-Token': sessionStorage.getItem('cal_token') || '' }
            });
        } catch (_) {}
        sessionStorage.removeItem('cal_token');
        window.location.replace('login.html');
    }

    // ── Helpers ──
    function showLoading(on) {
        document.getElementById('loading').style.display = on ? 'flex' : 'none';
    }

    // ── Public ──
    document.addEventListener('DOMContentLoaded', init);

    return { loadDashboard, loadList, exportToExcel, saveAlertConfig, sendTestEmail, openCertUpload, submitCertUpload, openAddEquipmentModal, submitAddEquipment, logout };
})();
