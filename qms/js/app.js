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

    /* ------------------------------------------------------------- logout */
    async function logout() {
        await API.logout();
        API.clearSession();
        window.location.replace('login.html');
    }

    return { init, logout };
})();
