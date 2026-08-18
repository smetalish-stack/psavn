const App = (() => {
    const TYPES = ['manual', 'process', 'guideline'];

    let state = { type: '', dept: '', status: '', q: '', doc_no: '' };
    let hist = { doc_no: '', username: '', action: '', from: '', to: '', offset: 0, limit: 100 };
    let detail = null;      // 상세 페이지에서 재조회를 피하려고 보관
    let blobUrl = null;     // 언어 전환마다 갈아끼우므로 이전 것은 해제한다
    let searchTimer = null;

    /* ------------------------------------------------------------ helpers */
    function esc(s) {
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    /** 문서명·양식명: 요청 언어본이 없으면 다른 언어로 채운다 (PSAV-COP-04-10 등) */
    function pick(ko, vi) {
        return I18n.getLang() === 'ko' ? (ko || vi || '') : (vi || ko || '');
    }

    function docName(d) { return pick(d.name_ko || d.doc_name_ko, d.name_vi || d.doc_name_vi); }

    function badge(kind, text) { return `<span class="badge ${esc(kind)}">${esc(text)}</span>`; }

    function el(id) { return document.getElementById(id); }

    /* --------------------------------------------------------------- init */
    async function init(page) {
        if (!API.getToken()) { window.location.replace('login.html'); return; }

        await I18n.init();
        I18n.onChange(() => render(page));

        const user = API.getUser();
        if (user) el('header-user').textContent = user.name || user.username;

        document.querySelectorAll('[data-nav]').forEach(a => {
            a.classList.toggle('active', a.getAttribute('data-nav') === page);
        });

        // 열람 이력은 관리자·관리책임자만 본다. viewer 에게는 탭 자체를 감춘다.
        const mayAudit = user && (user.role === 'admin' || user.role === 'manager');
        const auditTab = document.querySelector('[data-nav="history"]');
        if (auditTab) auditTab.hidden = !mayAudit;
        const batchTab = document.querySelector('[data-nav="batch"]');
        if (batchTab) batchTab.hidden = !mayAudit;

        // forms.html?doc=PSAV-COP-01 로 들어오면 해당 문서의 양식만 보여준다
        if (page === 'forms') {
            state.doc_no = new URLSearchParams(window.location.search).get('doc') || '';
        }

        bind(page);
        await render(page);
    }

    function bind(page) {
        if (page === 'documents') {
            el('chips').addEventListener('click', e => {
                const b = e.target.closest('[data-type]');
                if (!b) return;
                state.type = b.getAttribute('data-type');
                renderChips();
                loadDocuments();
            });
            el('f-status').addEventListener('change', e => { state.status = e.target.value; loadDocuments(); });
        }
        if (page === 'documents' || page === 'forms') {
            el('f-dept').addEventListener('change', e => { state.dept = e.target.value; reload(page); });
            el('f-q').addEventListener('input', e => {
                clearTimeout(searchTimer);
                const v = e.target.value.trim();
                searchTimer = setTimeout(() => { state.q = v; reload(page); }, 300);
            });
            el('f-reset').addEventListener('click', () => {
                state = { type: '', dept: '', status: '', q: '', doc_no: '' };
                el('f-dept').value = '';
                el('f-q').value = '';
                if (el('f-status')) el('f-status').value = '';
                if (page === 'documents') renderChips();
                reload(page);
            });
        }
        if (page === 'history') {
            ['f-doc', 'f-user', 'f-action', 'f-from', 'f-to'].forEach(id => {
                el(id).addEventListener('change', () => { readHistFilters(); loadHistory(); });
            });
            el('f-reset').addEventListener('click', () => {
                ['f-doc', 'f-user', 'f-action', 'f-from', 'f-to'].forEach(id => { el(id).value = ''; });
                readHistFilters();
                loadHistory();
            });
            el('btn-csv').addEventListener('click', exportCsv);
            el('prev').addEventListener('click', () => {
                hist.offset = Math.max(0, hist.offset - hist.limit);
                loadHistory();
            });
            el('next').addEventListener('click', () => {
                hist.offset += hist.limit;
                loadHistory();
            });
        }
    }

    function reload(page) {
        return page === 'forms' ? loadForms() : loadDocuments();
    }

    async function render(page) {
        if (page === 'documents') {
            renderChips();
            await loadDepts();
            await loadDocuments();
        } else if (page === 'forms') {
            await loadDepts();
            await loadForms();
        } else if (page === 'document') {
            await renderDetail();
        } else if (page === 'drawings') {
            await renderDrawings();
        } else if (page === 'drawing') {
            await renderDrawingDetail();
        } else if (page === 'batch') {
            renderBatch();
        } else if (page === 'revise') {
            await renderReviseForm();
        } else if (page === 'history') {
            await loadSummary();
            await loadHistory();
        }
    }

    /* ------------------------------------------------------------ filters */
    function renderChips() {
        el('chips').innerHTML =
            `<button class="chip${state.type === '' ? ' active' : ''}" data-type="">${esc(I18n.t('filter.all'))}</button>` +
            TYPES.map(x => `<button class="chip${state.type === x ? ' active' : ''}" data-type="${x}">${esc(I18n.t('type.' + x))}</button>`).join('');
    }

    async function loadDepts() {
        const sel = el('f-dept');
        const keep = sel.value;
        const { depts } = await API.getDepts();
        sel.innerHTML = `<option value="">${esc(I18n.t('filter.dept'))}</option>` +
            depts.map(d => `<option value="${esc(d.dept)}">${esc(I18n.dept(d.dept))} (${d.count})</option>`).join('');
        sel.value = keep;
    }

    /* ---------------------------------------------------------- documents */
    async function loadDocuments() {
        const params = {};
        if (state.type) params.type = state.type;
        if (state.dept) params.dept = state.dept;
        if (state.status) params.status = state.status;
        if (state.q) params.q = state.q;

        const tbody = el('rows');
        tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${esc(I18n.t('msg.loading'))}</td></tr>`;

        const { count, documents } = await API.getDocuments(params);
        el('count').textContent = I18n.t('msg.count_documents', { n: count });

        if (!count) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${esc(I18n.t('msg.empty'))}</td></tr>`;
            return;
        }
        tbody.innerHTML = documents.map(d => `<tr>
            <td class="cell-no"><a href="document.html?doc=${encodeURIComponent(d.doc_no)}">${esc(d.doc_no)}</a></td>
            <td>${badge('type', I18n.t('type.' + d.type))}</td>
            <td>${esc(docName(d))}</td>
            <td>${esc(I18n.dept(d.dept))}</td>
            <td class="cell-num">Rev.${d.current_rev === null ? '' : d.current_rev}</td>
            <td class="cell-num">${esc(d.rev_date || '')}</td>
            <td class="cell-num">${d.form_count || ''}</td>
            <td>${badge(d.status, I18n.t('status.' + d.status))}</td>
        </tr>`).join('');
    }

    /* -------------------------------------------------------------- forms */
    async function loadForms() {
        const params = {};
        if (state.dept) params.dept = state.dept;
        if (state.q) params.q = state.q;
        if (state.doc_no) params.doc_no = state.doc_no;

        const tbody = el('rows');
        tbody.innerHTML = `<tr><td colspan="5" class="table-msg">${esc(I18n.t('msg.loading'))}</td></tr>`;

        const { count, forms } = await API.getForms(params);
        el('count').textContent = I18n.t('msg.count_forms', { n: count });

        if (!count) {
            tbody.innerHTML = `<tr><td colspan="5" class="table-msg">${esc(I18n.t('msg.empty'))}</td></tr>`;
            return;
        }
        tbody.innerHTML = forms.map(f => `<tr>
            <td class="cell-no">${esc(f.form_no)}</td>
            <td>${esc(pick(f.name_ko, f.name_vi))}</td>
            <td class="cell-no">${f.doc_no
                ? `<a href="document.html?doc=${encodeURIComponent(f.doc_no)}" title="${esc(docName(f))}">${esc(f.doc_no)}</a>`
                : ''}</td>
            <td>${esc(I18n.dept(f.dept))}</td>
            <td>${esc(f.retention || '')}</td>
        </tr>`).join('');
    }

    /* ------------------------------------------------------------- detail */
    function docNoFromQuery() {
        return new URLSearchParams(window.location.search).get('doc') || '';
    }

    async function renderDetail() {
        const docNo = docNoFromQuery();
        if (!docNo) { el('doc-name').textContent = I18n.t('doc.not_found'); return; }

        if (!detail) detail = await API.getDocument(docNo);
        const d = detail.document;
        const cur = detail.revisions.find(r => r.status === 'valid');

        document.title = `${d.doc_no} — ${docName(d)}`;
        el('doc-name').textContent = docName(d);
        el('doc-meta').innerHTML = [
            `<span class="meta-no">${esc(d.doc_no)}</span>`,
            badge('type', I18n.t('type.' + d.type)),
            d.dept ? `<span>${esc(I18n.t('doc.dept'))}: ${esc(I18n.dept(d.dept))}</span>` : '',
            `<span>${esc(I18n.t('doc.rev'))}: Rev.${d.current_rev}</span>`,
            cur && cur.rev_date ? `<span>${esc(I18n.t('doc.rev_date'))}: ${esc(cur.rev_date)}</span>` : '',
            badge(d.status, I18n.t('status.' + d.status))
        ].join('');

        // 개정 등록은 admin·manager 만
        const u = API.getUser();
        const btnRevise = el('btn-revise');
        if (btnRevise) {
            const mayRevise = u && (u.role === 'admin' || u.role === 'manager');
            btnRevise.hidden = !mayRevise;
            btnRevise.href = `revise.html?doc=${encodeURIComponent(d.doc_no)}`;
        }

        renderRevisions();
        renderRelatedForms();
        await loadPdf();
    }

    /** 개정이력 타임라인. 최신이 위, 현행본은 강조. */
    function renderRevisions() {
        el('rev-timeline').innerHTML = detail.revisions.slice().reverse().map(r => {
            const current = r.status === 'valid';
            const period = r.outdated_date
                ? `${esc(r.rev_date || '')} ~ ${esc(r.outdated_date)}`
                : `${esc(r.rev_date || '')} ~`;
            return `<li class="tl-item${current ? ' tl-current' : ''}">
                <div class="tl-dot"></div>
                <div class="tl-body">
                    <div class="tl-head">
                        <strong>Rev.${r.rev_no}</strong>
                        ${badge(r.status, current ? I18n.t('doc.current') : I18n.t('status.' + r.status))}
                        <span class="tl-period">${period}</span>
                    </div>
                    <div class="tl-content">${esc(pick(r.content_ko, r.content_vi))}</div>
                </div>
            </li>`;
        }).join('');
        // 과거 개정본은 파일이 없다 — 링크를 걸지 않는 이유를 밝혀둔다
        el('rev-note').hidden = detail.revisions.length < 2;
    }

    function renderRelatedForms() {
        if (!detail.forms.length) { el('forms-panel').hidden = true; return; }
        el('forms-panel').hidden = false;
        el('form-rows').innerHTML = detail.forms.map(f => `<tr>
            <td class="cell-no">${esc(f.form_no)}</td>
            <td>${esc(pick(f.name_ko, f.name_vi))}</td>
            <td>${esc(f.retention || '')}</td>
        </tr>`).join('');
    }

    /** 언어 전환 시 pdf_ko ↔ pdf_vi 교체 */
    async function loadPdf() {
        const docNo = docNoFromQuery();
        const want = I18n.getLang() === 'ko' ? 'ko' : 'vi';
        const viewer = el('viewer');

        el('fallback').hidden = true;
        el('error').hidden = true;
        viewer.innerHTML = `<div class="viewer-msg">${esc(I18n.t('file.loading'))}</div>`;
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }

        try {
            const f = await API.fetchFile(docNo, { lang: want, type: 'pdf' });
            blobUrl = f.url;
            viewer.innerHTML = `<iframe src="${f.url}#toolbar=1" title="${esc(docNo)}"></iframe>`;

            if (f.servedLang !== want) {
                el('fallback').textContent = I18n.t(want === 'ko' ? 'file.fallback_vi' : 'file.fallback_ko');
                el('fallback').hidden = false;
            }
            // 지금 보고 있는 화면이 몇 번 배포본인지 알려준다 (IATF 배포 통제)
            const badgeEl = el('copy-no');
            if (badgeEl) {
                badgeEl.textContent = f.copyNo
                    ? `${I18n.t('history.copy_no')} ${f.copyNo}` : '';
                badgeEl.hidden = !f.copyNo;
            }
            el('btn-newtab').hidden = false;
            el('btn-newtab').onclick = () => window.open(f.url, '_blank');
        } catch (e) {
            viewer.innerHTML = `<div class="viewer-msg">${esc(I18n.t('file.failed'))}</div>`;
            el('btn-newtab').hidden = true;
            if (e.body && e.body.detail) {
                el('error').textContent = e.body.detail;
                el('error').hidden = false;
            }
        }

        // 원본 다운로드는 권한자에게만 노출
        const user = API.getUser();
        const may = user && (user.role === 'admin' || user.can_download);
        el('btn-download').hidden = !may;
        el('btn-download').onclick = may ? () => downloadSource(want) : null;
    }

    async function downloadSource(lang) {
        const btn = el('btn-download');
        btn.disabled = true;
        try {
            const f = await API.fetchFile(docNoFromQuery(), { lang, type: 'src' });
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(f.url), 30000);
        } catch (e) {
            el('error').textContent = e.status === 403
                ? I18n.t('file.no_permission')
                : I18n.t('file.failed');
            el('error').hidden = false;
        } finally {
            btn.disabled = false;
        }
    }

    /* ------------------------------------------------------------ history */
    function readHistFilters() {
        hist.doc_no = el('f-doc').value.trim();
        hist.username = el('f-user').value.trim();
        hist.action = el('f-action').value;
        hist.from = el('f-from').value;
        hist.to = el('f-to').value;
        hist.offset = 0;
    }

    function histParams() {
        const p = { limit: hist.limit, offset: hist.offset };
        ['doc_no', 'username', 'action', 'from', 'to'].forEach(k => {
            if (hist[k]) p[k] = hist[k];
        });
        return p;
    }

    /** UTC 로 저장된 시각을 브라우저 로컬 시간대로 보여준다. */
    function fmtAt(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return esc(iso);
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
               `${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    async function loadSummary() {
        const s = await API.getHistorySummary(30);
        const counts = {};
        s.by_action.forEach(a => { counts[a.action] = a.n; });
        el('stats').innerHTML = ['view', 'download', 'login', 'search'].map(a => `
            <div class="stat">
                <div class="stat-n">${counts[a] || 0}</div>
                <div class="stat-l">${esc(I18n.t('history.action_' + a))}</div>
            </div>`).join('');
    }

    async function loadHistory() {
        const tbody = el('rows');
        tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${esc(I18n.t('msg.loading'))}</td></tr>`;

        let data;
        try {
            data = await API.getHistory(histParams());
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${
                esc(e.status === 403 ? I18n.t('history.no_permission') : I18n.t('file.failed'))}</td></tr>`;
            return;
        }

        el('count').textContent = I18n.t('history.count', { n: data.total });
        const from = data.total ? hist.offset + 1 : 0;
        const to = Math.min(hist.offset + hist.limit, data.total);
        el('page-info').textContent = `${from}–${to} / ${data.total}`;
        el('prev').disabled = hist.offset === 0;
        el('next').disabled = to >= data.total;

        if (!data.total) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${esc(I18n.t('msg.empty'))}</td></tr>`;
            return;
        }
        tbody.innerHTML = data.entries.map(e => `<tr>
            <td class="cell-num"><strong>${e.copy_no}</strong></td>
            <td class="cell-num">${fmtAt(e.at)}</td>
            <td>${esc(e.username || '')}</td>
            <td>${badge('act-' + e.action, I18n.t('history.action_' + e.action))}</td>
            <td class="cell-no">${e.doc_no
                ? `<a href="document.html?doc=${encodeURIComponent(e.doc_no)}">${esc(e.doc_no)}</a>`
                : ''}</td>
            <td class="cell-num">${e.rev_no === null ? '' : 'Rev.' + e.rev_no}</td>
            <td class="cell-num">${esc((e.lang || '').toUpperCase())}</td>
            <td class="cell-num">${esc(e.ip || '')}</td>
        </tr>`).join('');
    }

    /** 현재 필터 그대로 최대 500건을 CSV 로 내려받는다 (감사 제출용). */
    async function exportCsv() {
        const btn = el('btn-csv');
        btn.disabled = true;
        try {
            const data = await API.getHistory({ ...histParams(), limit: 500, offset: 0 });
            const head = ['copy_no', 'at', 'username', 'action', 'doc_no', 'rev_no', 'lang', 'ip'];
            const esc4csv = v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
            const csv = [head.join(',')]
                .concat(data.entries.map(e => head.map(k => esc4csv(e[k])).join(',')))
                .join('\r\n');
            // BOM 을 붙여야 엑셀이 UTF-8 로 연다
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `qms_access_log_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        } finally {
            btn.disabled = false;
        }
    }

    /* ------------------------------------------------------------ drawings */
    // PSAV-SP-03 도면관리 프로세스 기준. 개정번호는 고객 체계라 문자열이다.
    let dwState = { kind: '', customer: '', q: '' };
    let dwDetail = null;
    let dwBlobUrl = null;
    const DW_KINDS = ['customer', 'internal', 'production'];

    function dwKindLabel(k) { return I18n.t('drawing.kind_' + k); }

    async function renderDrawings() {
        if (!el('dw-chips').dataset.bound) {
            el('dw-chips').dataset.bound = '1';
            el('dw-chips').addEventListener('click', e => {
                const b = e.target.closest('[data-kind]');
                if (!b) return;
                dwState.kind = b.getAttribute('data-kind');
                drawDwChips(); loadDrawings();
            });
            el('dw-customer').addEventListener('change', e => {
                dwState.customer = e.target.value; loadDrawings();
            });
            let t;
            el('dw-q').addEventListener('input', e => {
                clearTimeout(t);
                const v = e.target.value.trim();
                t = setTimeout(() => { dwState.q = v; loadDrawings(); }, 300);
            });
            el('dw-reset').addEventListener('click', () => {
                dwState = { kind: '', customer: '', q: '' };
                el('dw-customer').value = ''; el('dw-q').value = '';
                drawDwChips(); loadDrawings();
            });
            el('dw-new-btn').addEventListener('click', () => {
                el('dw-form').hidden = !el('dw-form').hidden;
            });
            el('dw-cancel').addEventListener('click', () => { el('dw-form').hidden = true; });
            el('dw-form').addEventListener('submit', submitDrawing);
            el('f-kind').addEventListener('change', syncCustomerRequired);
        }

        const u = API.getUser();
        const mayEdit = u && (u.role === 'admin' || u.role === 'manager');
        el('dw-new-btn').hidden = !mayEdit;

        drawDwChips();
        await loadCustomers();
        await loadDrawings();
    }

    function drawDwChips() {
        el('dw-chips').innerHTML =
            `<button class="chip${dwState.kind === '' ? ' active' : ''}" data-kind="">` +
            `${esc(I18n.t('filter.all'))}</button>` +
            DW_KINDS.map(k => `<button class="chip${dwState.kind === k ? ' active' : ''}"` +
                `data-kind="${k}">${esc(dwKindLabel(k))}</button>`).join('');
    }

    async function loadCustomers() {
        const { customers, unrestricted } = await API.getCustomers();
        const opts = customers.map(c =>
            `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join('');
        const keep = el('dw-customer').value;
        el('dw-customer').innerHTML =
            `<option value="">${esc(I18n.t('drawing.customer'))}</option>` + opts;
        el('dw-customer').value = keep;
        if (el('f-cust')) {
            el('f-cust').innerHTML = `<option value="">—</option>` + opts;
        }
        // 고객사 권한이 제한된 계정에게는 그 사실을 알려준다
        el('dw-scope').textContent = unrestricted
            ? '' : I18n.t('drawing.scope_limited', { n: customers.length });
    }

    function syncCustomerRequired() {
        const need = el('f-kind').value === 'customer';
        el('f-cust').required = need;
    }

    async function loadDrawings() {
        const params = {};
        if (dwState.kind) params.kind = dwState.kind;
        if (dwState.customer) params.customer = dwState.customer;
        if (dwState.q) params.q = dwState.q;

        const tbody = el('dw-rows');
        tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${esc(I18n.t('msg.loading'))}</td></tr>`;
        const { count, drawings } = await API.getDrawings(params);
        el('dw-count').textContent = I18n.t('drawing.count', { n: count });

        if (!count) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-msg">${esc(I18n.t('msg.empty'))}</td></tr>`;
            return;
        }
        tbody.innerHTML = drawings.map(d => `<tr>
            <td class="cell-no"><a href="drawing.html?id=${d.id}">${esc(d.drawing_no)}</a></td>
            <td>${badge('type', dwKindLabel(d.kind))}</td>
            <td>${esc(d.name)}${d.nda_required ? ' <span class="badge obsolete">NDA</span>' : ''}</td>
            <td>${esc(d.customer_code || '')}</td>
            <td class="cell-no">${esc(d.part_no || '')}</td>
            <td class="cell-num">Rev.${esc(d.current_rev || '')}</td>
            <td class="cell-num">${esc(d.rev_date || '')}</td>
            <td>${badge(d.status, I18n.t('status.' + d.status))}</td>
        </tr>`).join('');
    }

    async function submitDrawing(ev) {
        ev.preventDefault();
        const btn = el('dw-submit');
        el('dw-error').hidden = true; el('dw-ok').hidden = true;

        const fd = new FormData();
        fd.append('drawing_no', el('f-no').value.trim());
        fd.append('name', el('f-name').value.trim());
        fd.append('part_no', el('f-part').value.trim());
        fd.append('kind', el('f-kind').value);
        fd.append('customer_code', el('f-cust').value);
        fd.append('rev', el('f-rev').value.trim());
        fd.append('rev_date', el('f-date').value);
        fd.append('nda_required', el('f-nda').value);
        fd.append('content', el('f-content').value.trim());
        if (el('f-pdf').files[0]) fd.append('pdf', el('f-pdf').files[0]);
        if (el('f-src').files[0]) fd.append('src', el('f-src').files[0]);

        btn.disabled = true;
        try {
            const r = await API.createDrawing(fd);
            el('dw-ok').textContent = I18n.t('drawing.created', { no: r.drawing_no, rev: r.rev });
            el('dw-ok').hidden = false;
            el('dw-form').reset();
            await loadDrawings();
        } catch (e) {
            el('dw-error').textContent = (e.body && e.body.detail) ||
                (e.body && e.body.error) || I18n.t('revise.failed');
            el('dw-error').hidden = false;
        } finally {
            btn.disabled = false;
        }
    }

    /* --------------------------------------------------------- 도면 상세 */
    function dwIdFromQuery() {
        return new URLSearchParams(window.location.search).get('id') || '';
    }

    async function renderDrawingDetail() {
        const id = dwIdFromQuery();
        if (!id) { el('d-name').textContent = I18n.t('doc.not_found'); return; }
        if (!dwDetail) {
            try {
                dwDetail = await API.getDrawing(id);
            } catch (e) {
                // 권한이 없으면 서버가 404 로 답한다 (존재 여부를 흘리지 않으려고)
                el('d-name').textContent = I18n.t('drawing.not_found_or_denied');
                return;
            }
        }
        const d = dwDetail.drawing;
        document.title = `${d.drawing_no} — ${d.name}`;
        el('d-name').textContent = d.name;
        el('d-meta').innerHTML = [
            `<span class="meta-no">${esc(d.drawing_no)}</span>`,
            badge('type', dwKindLabel(d.kind)),
            d.customer_code ? `<span>${esc(I18n.t('drawing.customer'))}: ${esc(d.customer_code)}</span>` : '',
            d.part_no ? `<span>${esc(I18n.t('drawing.part_no'))}: ${esc(d.part_no)}</span>` : '',
            `<span>${esc(I18n.t('drawing.rev'))}: Rev.${esc(d.current_rev || '')}</span>`,
            badge(d.status, I18n.t('status.' + d.status)),
        ].join('');
        el('d-nda').hidden = !d.nda_required;

        const u = API.getUser();
        const mayEdit = u && (u.role === 'admin' || u.role === 'manager');
        el('d-revise-btn').hidden = !mayEdit;
        el('d-download').hidden = !(u && (u.role === 'admin' || u.can_download));

        if (!el('d-rev-form').dataset.bound) {
            el('d-rev-form').dataset.bound = '1';
            el('d-revise-btn').addEventListener('click', () => {
                el('d-rev-form').hidden = !el('d-rev-form').hidden;
            });
            el('r-cancel').addEventListener('click', () => { el('d-rev-form').hidden = true; });
            el('d-rev-form').addEventListener('submit', submitDrawingRevision);
            el('d-download').addEventListener('click', downloadDrawingSrc);
        }

        drawDwTimeline();
        await loadDrawingPdf();
    }

    function drawDwTimeline() {
        el('d-timeline').innerHTML = dwDetail.revisions.slice().reverse().map(r => {
            const cur = r.status === 'valid';
            const period = r.outdated_date
                ? `${esc(r.rev_date || '')} ~ ${esc(r.outdated_date)}`
                : `${esc(r.rev_date || '')} ~`;
            return `<li class="tl-item${cur ? ' tl-current' : ''}">
                <div class="tl-dot"></div>
                <div class="tl-body">
                    <div class="tl-head">
                        <strong>Rev.${esc(r.rev)}</strong>
                        ${badge(r.status, cur ? I18n.t('doc.current') : I18n.t('drawing.reference'))}
                        <span class="tl-period">${period}</span>
                    </div>
                    <div class="tl-content">${esc(r.content || '')}</div>
                </div>
            </li>`;
        }).join('');
    }

    async function loadDrawingPdf() {
        const viewer = el('d-viewer');
        viewer.innerHTML = `<div class="viewer-msg">${esc(I18n.t('file.loading'))}</div>`;
        if (dwBlobUrl) { URL.revokeObjectURL(dwBlobUrl); dwBlobUrl = null; }
        try {
            const f = await API.fetchDrawingFile(dwIdFromQuery(), { type: 'pdf' });
            dwBlobUrl = f.url;
            viewer.innerHTML = `<iframe src="${f.url}#toolbar=1"></iframe>`;
            el('d-copy').textContent = f.copyNo
                ? `${I18n.t('history.copy_no')} ${f.copyNo}` : '';
            el('d-copy').hidden = !f.copyNo;
        } catch (e) {
            viewer.innerHTML = `<div class="viewer-msg">${esc(I18n.t('file.failed'))}</div>`;
            if (e.body && e.body.detail) {
                el('d-error').textContent = e.body.detail;
                el('d-error').hidden = false;
            }
        }
    }

    async function submitDrawingRevision(ev) {
        ev.preventDefault();
        const btn = el('r-submit');
        el('r-error').hidden = true;
        const fd = new FormData();
        fd.append('rev', el('r-rev').value.trim());
        fd.append('rev_date', el('r-date').value);
        fd.append('content', el('r-content').value.trim());
        if (el('r-pdf').files[0]) fd.append('pdf', el('r-pdf').files[0]);
        if (el('r-src').files[0]) fd.append('src', el('r-src').files[0]);

        btn.disabled = true;
        try {
            await API.createDrawingRevision(dwIdFromQuery(), fd);
            dwDetail = null;
            el('d-rev-form').hidden = true;
            el('d-rev-form').reset();
            await renderDrawingDetail();
        } catch (e) {
            el('r-error').textContent = (e.body && e.body.detail) ||
                (e.body && e.body.error) || I18n.t('revise.failed');
            el('r-error').hidden = false;
        } finally {
            btn.disabled = false;
        }
    }

    async function downloadDrawingSrc() {
        try {
            const f = await API.fetchDrawingFile(dwIdFromQuery(), { type: 'src' });
            const a = document.createElement('a');
            a.href = f.url; a.download = f.filename;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(f.url), 30000);
        } catch (e) {
            el('d-error').textContent = e.status === 403
                ? I18n.t('file.no_permission')
                : ((e.body && e.body.detail) || I18n.t('file.failed'));
            el('d-error').hidden = false;
        }
    }

    /* -------------------------------------------------------------- batch */
    let batchPlan = null;      // 서버가 계산한 개정 계획
    let batchFiles = null;     // 파일명 → File 객체

    function renderBatch() {
        if (!el('b-date').value) el('b-date').value = new Date().toISOString().slice(0, 10);
        if (el('b-files').dataset.bound) {
            if (batchPlan) drawPlan();   // 언어 전환 시 표를 다시 그린다
            return;
        }
        el('b-files').dataset.bound = '1';
        el('b-files').addEventListener('change', planBatch);
        el('b-run').addEventListener('click', runBatch);
        el('b-all').addEventListener('change', e => {
            document.querySelectorAll('#b-rows input[data-doc]:not(:disabled)')
                .forEach(c => { c.checked = e.target.checked; });
        });
    }

    async function planBatch() {
        const files = [...el('b-files').files];
        el('b-error').hidden = true;
        el('b-result-panel').hidden = true;
        if (!files.length) { el('b-plan-panel').hidden = true; return; }

        batchFiles = new Map(files.map(f => [f.name, f]));
        try {
            batchPlan = await API.planBatch(files.map(f => ({ name: f.name, size: f.size })));
        } catch (e) {
            el('b-error').textContent = (e.body && e.body.detail) || I18n.t('revise.failed');
            el('b-error').hidden = false;
            return;
        }
        drawPlan();
    }

    function drawPlan() {
        const p = batchPlan;
        el('b-plan-panel').hidden = false;
        el('b-stats').innerHTML = [
            [p.total_files, I18n.t('batch.stat_files')],
            [p.documents, I18n.t('batch.stat_docs')],
            [p.ready, I18n.t('batch.stat_ready')],
            [p.blocked, I18n.t('batch.stat_blocked')],
        ].map(([n, l]) => `<div class="stat"><div class="stat-n">${n}</div>` +
                          `<div class="stat-l">${esc(l)}</div></div>`).join('');

        el('b-rows').innerHTML = p.plan.map(r => `<tr class="${r.ok ? '' : 'row-blocked'}">
            <td><input type="checkbox" data-doc="${esc(r.doc_no)}"
                 ${r.ok ? 'checked' : 'disabled'}></td>
            <td class="cell-no">${esc(r.doc_no)}</td>
            <td>${esc(pick(r.name_ko, r.name_vi))}</td>
            <td class="cell-num">Rev.${r.current_rev} → <strong>Rev.${r.rev_no}</strong></td>
            <td>${Object.keys(r.files).sort().join(', ')}</td>
            <td>${r.ok ? badge('valid', I18n.t('batch.ready'))
                       : `<span class="err-text">${esc(r.errors.join(' / '))}</span>`}</td>
        </tr>`).join('');

        el('b-skipped').textContent = p.skipped.length
            ? I18n.t('batch.skipped', { n: p.skipped.length }) + ' ' +
              p.skipped.map(x => x.name).join(', ')
            : '';
        el('b-run').disabled = p.ready === 0;
        el('b-progress').textContent = '';
    }

    /**
     * 문서별로 순차 등록한다.
     * 41개 문서 152 MB 를 한 요청에 담으면 프록시에서 끊기므로 나눠 보낸다.
     * 대신 원자성이 없어 중간 실패 시 앞부분은 등록된 채로 남는다 — 결과표로 보여준다.
     */
    async function runBatch() {
        const chosen = [...document.querySelectorAll('#b-rows input[data-doc]:checked')]
            .map(c => c.getAttribute('data-doc'));
        if (!chosen.length) return;

        const date = el('b-date').value;
        if (!date) { el('b-error').textContent = I18n.t('batch.need_date'); el('b-error').hidden = false; return; }

        el('b-run').disabled = true;
        el('b-error').hidden = true;
        el('b-result-panel').hidden = false;
        el('b-result-rows').innerHTML = '';

        const targets = batchPlan.plan.filter(r => chosen.includes(r.doc_no));
        let done = 0, failed = 0;

        for (const r of targets) {
            el('b-progress').textContent = I18n.t('batch.progress',
                { done: done + 1, total: targets.length, doc: r.doc_no });

            const fd = new FormData();
            fd.append('rev_no', String(r.rev_no));
            fd.append('rev_date', date);
            fd.append('content_ko', el('b-content-ko').value);
            fd.append('content_vi', el('b-content-vi').value);
            for (const [slot, info] of Object.entries(r.files)) {
                const file = batchFiles.get(info.name);
                if (file) fd.append(slot, file);
            }

            let status, cls;
            try {
                await API.createRevision(r.doc_no, fd);
                status = I18n.t('batch.done_one');
                cls = 'valid';
            } catch (e) {
                status = (e.body && e.body.detail) || (e.body && e.body.error) || 'error';
                cls = 'obsolete';
                failed += 1;
            }
            done += 1;
            el('b-result-rows').insertAdjacentHTML('beforeend', `<tr>
                <td class="cell-no">${esc(r.doc_no)}</td>
                <td class="cell-num">Rev.${r.current_rev} → Rev.${r.rev_no}</td>
                <td>${badge(cls, status)}</td>
            </tr>`);
        }

        el('b-progress').textContent = I18n.t('batch.finished',
            { ok: done - failed, fail: failed });
        el('b-run').disabled = false;
    }

    /* ------------------------------------------------------------- revise */
    async function renderReviseForm() {
        const docNo = docNoFromQuery();
        if (!docNo) { el('rev-title').textContent = I18n.t('doc.not_found'); return; }

        if (!detail) detail = await API.getDocument(docNo);
        const d = detail.document;
        const next = (d.current_rev === null ? 0 : d.current_rev + 1);

        el('rev-title').textContent = `${d.doc_no}  ${docName(d)}`;
        el('rev-meta').innerHTML = [
            badge('type', I18n.t('type.' + d.type)),
            `<span>${esc(I18n.t('doc.rev'))}: Rev.${d.current_rev}</span>`,
            d.dept ? `<span>${esc(I18n.t('doc.dept'))}: ${esc(I18n.dept(d.dept))}</span>` : ''
        ].join('');
        el('back-link').href = `document.html?doc=${encodeURIComponent(docNo)}`;
        el('cancel-link').href = `document.html?doc=${encodeURIComponent(docNo)}`;
        el('rev-no-hint').textContent = I18n.t('revise.rev_hint', { cur: d.current_rev, next: next });

        // 값은 처음 그릴 때만 채운다. 언어 전환으로 다시 그려도 입력을 날리지 않는다.
        if (!el('rev-no').value) el('rev-no').value = next;
        if (!el('rev-date').value) el('rev-date').value = new Date().toISOString().slice(0, 10);

        if (!el('rev-form').dataset.bound) {
            el('rev-form').dataset.bound = '1';
            el('rev-form').addEventListener('submit', submitRevision);
        }
    }

    async function submitRevision(ev) {
        ev.preventDefault();
        const docNo = docNoFromQuery();
        const btn = el('rev-submit');
        const errBox = el('rev-error');
        const okBox = el('rev-ok');
        errBox.hidden = true;
        okBox.hidden = true;

        const fd = new FormData();
        fd.append('rev_no', el('rev-no').value);
        fd.append('rev_date', el('rev-date').value);
        fd.append('content_ko', el('content-ko').value);
        fd.append('content_vi', el('content-vi').value);
        [['ko-src', 'ko_src'], ['ko-pdf', 'ko_pdf'],
         ['vi-src', 'vi_src'], ['vi-pdf', 'vi_pdf']].forEach(([id, field]) => {
            const f = el(id).files[0];
            if (f) fd.append(field, f);
        });

        btn.disabled = true;
        btn.textContent = I18n.t('revise.submitting');
        try {
            const r = await API.createRevision(docNo, fd);
            okBox.textContent = I18n.t('revise.done', {
                rev: r.rev_no,
                old: r.obsoleted ? r.obsoleted.rev_no : '-'
            });
            okBox.hidden = false;
            detail = null;   // 상세를 다시 받아야 새 개정이 보인다
            setTimeout(() => {
                window.location.href = `document.html?doc=${encodeURIComponent(docNo)}`;
            }, 1500);
        } catch (e) {
            // 서버가 내려주는 detail 이 사용자에게 가장 정확한 안내다
            errBox.textContent = (e.body && e.body.detail) || I18n.t('revise.failed');
            errBox.hidden = false;
            btn.disabled = false;
            btn.textContent = I18n.t('revise.submit');
        }
    }

    /* ------------------------------------------------------------- logout */
    async function logout() {
        await API.logout();
        API.clearSession();
        window.location.replace('login.html');
    }

    return { init, logout };
})();
