const API = (() => {
    const BASE = 'https://qms-server-production-a4d6.up.railway.app';

    function getToken() {
        return sessionStorage.getItem('qms_token') || '';
    }

    function getUser() {
        try { return JSON.parse(sessionStorage.getItem('qms_user') || 'null'); }
        catch (e) { return null; }
    }

    function clearSession() {
        sessionStorage.removeItem('qms_token');
        sessionStorage.removeItem('qms_user');
    }

    function expired() {
        clearSession();
        sessionStorage.setItem('qms_notice', 'login.session_expired');
        window.location.replace('login.html');
        throw new Error('Session expired');
    }

    async function request(method, path, body) {
        const opts = {
            method,
            headers: { 'X-Auth-Token': getToken() }
        };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(BASE + path, opts);

        // 토큰 만료 또는 미인증 → 자동 로그아웃
        if (res.status === 401) expired();

        const json = await res.json();
        if (!res.ok) {
            const err = new Error(json.error || 'Request failed');
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    /** multipart 전송. Content-Type 을 직접 지정하면 boundary 가 깨진다. */
    async function sendForm(path, formData) {
        const res = await fetch(BASE + path, {
            method: 'POST',
            headers: { 'X-Auth-Token': getToken() },
            body: formData,
        });
        if (res.status === 401) expired();
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(json.error || 'Request failed');
            err.status = res.status; err.body = json; throw err;
        }
        return json;
    }

    /**
     * 파일을 blob 으로 받는다.
     * 토큰이 헤더로만 가야 해서 iframe/<a> 에 API URL 을 직접 물릴 수 없다.
     * 현재 PDF 최대 1.9 MB, 원본 최대 37 MB 라 메모리로 받아도 무리 없다.
     */
    async function fetchFile(docNo, opts) {
        const { lang, type = 'pdf', rev } = opts || {};
        const q = new URLSearchParams({ lang, type });
        if (rev !== undefined && rev !== null) q.set('rev', rev);

        const res = await fetch(`${BASE}/api/documents/${encodeURIComponent(docNo)}/file?${q}`, {
            headers: { 'X-Auth-Token': getToken() }
        });
        if (res.status === 401) expired();
        if (!res.ok) {
            let body = null;
            try { body = await res.json(); } catch (e) { /* 파일 응답이 아닐 수 있다 */ }
            const err = new Error((body && body.error) || 'File request failed');
            err.status = res.status;
            err.body = body;
            throw err;
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
        return {
            url: URL.createObjectURL(blob),
            // 요청 언어본이 없으면 서버가 다른 언어로 대체하고 이 헤더로 알려준다
            servedLang: res.headers.get('X-Served-Lang') || lang,
            // 워터마크에 찍힌 배포본번호. 열람이력의 id 와 같다.
            copyNo: res.headers.get('X-Copy-No') || null,
            filename: m ? decodeURIComponent(m[1]) : `${docNo}.pdf`
        };
    }

    return {
        getToken,
        getUser,
        clearSession,
        fetchFile,
        getDocuments: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return request('GET', `/api/documents${q ? '?' + q : ''}`);
        },
        getDepts: () => request('GET', '/api/documents/depts'),
        getDocument: (docNo) => request('GET', `/api/documents/${encodeURIComponent(docNo)}`),
        getForms: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return request('GET', `/api/forms${q ? '?' + q : ''}`);
        },
        logAccess: (data) => request('POST', '/api/access-log', data).catch(() => {}),
        getHistory: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return request('GET', `/api/access-log${q ? '?' + q : ''}`);
        },
        getHistorySummary: (days) => request('GET', `/api/access-log/summary?days=${days || 30}`),
        // ---- 도면 (PSAV-SP-03 도면관리 프로세스) ----
        getDrawings: (params = {}) => {
            const p = new URLSearchParams(params).toString();
            return request('GET', `/api/drawings${p ? '?' + p : ''}`);
        },
        getDrawing: (id) => request('GET', `/api/drawings/${id}`),
        getCustomers: () => request('GET', '/api/drawings/customers'),
        /** 도면 파일. 문서와 경로가 달라 fetchFile 을 그대로 못 쓴다. */
        fetchDrawingFile: async (id, opts) => {
            const { type = 'pdf', rev } = opts || {};
            const p = new URLSearchParams({ type });
            if (rev) p.set('rev', rev);
            const res = await fetch(`${BASE}/api/drawings/${id}/file?${p}`,
                { headers: { 'X-Auth-Token': getToken() } });
            if (res.status === 401) expired();
            if (!res.ok) {
                let body = null;
                try { body = await res.json(); } catch (e) { /* 파일 응답이 아닐 수 있다 */ }
                const err = new Error((body && body.error) || 'File request failed');
                err.status = res.status; err.body = body; throw err;
            }
            const cd = res.headers.get('Content-Disposition') || '';
            const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
            return {
                url: URL.createObjectURL(await res.blob()),
                copyNo: res.headers.get('X-Copy-No') || null,
                filename: m ? decodeURIComponent(m[1]) : `drawing-${id}.pdf`,
            };
        },
        createDrawing: (formData) => sendForm('/api/drawings', formData),
        createDrawingRevision: (id, formData) =>
            sendForm(`/api/drawings/${id}/revisions`, formData),

        /** 파일을 올리기 전에 어느 문서의 몇 번 개정이 될지 계산만 받는다. */
        planBatch: (files) => request('POST', '/api/documents/batch/plan', { files }),

        /** 개정 등록. multipart 라 request() 를 쓰지 않고 직접 보낸다. */
        createRevision: async (docNo, formData) => {
            const res = await fetch(
                `${BASE}/api/documents/${encodeURIComponent(docNo)}/revisions`,
                { method: 'POST', headers: { 'X-Auth-Token': getToken() }, body: formData }
            );
            if (res.status === 401) expired();
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = new Error(json.error || 'Revision failed');
                err.status = res.status;
                err.body = json;
                throw err;
            }
            return json;
        },
        logout: () => fetch(BASE + '/api/logout', {
            method: 'POST',
            headers: { 'X-Auth-Token': getToken() }
        }).catch(() => {})
    };
})();
