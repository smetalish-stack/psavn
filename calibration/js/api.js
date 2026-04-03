const API = (() => {
    const BASE = 'https://calibration-server-production.up.railway.app';
    const API_KEY = 'cal-server-key-change-me';

    function getToken() {
        return sessionStorage.getItem('cal_token') || '';
    }

    async function request(method, path, body, isFormData) {
        const token = getToken();
        const opts = {
            method,
            headers: {
                'X-Auth-Token': token,
                ...(method !== 'GET' ? { 'X-API-Key': API_KEY } : {})
            }
        };
        if (body && !isFormData) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        } else if (isFormData) {
            opts.body = body;
        }
        const res = await fetch(BASE + path, opts);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    }

    return {
        getEquipment: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return request('GET', `/api/equipment${q ? '?' + q : ''}`);
        },
        getYears: () => request('GET', '/api/equipment/years'),
        getLocations: () => request('GET', '/api/equipment/locations'),
        getDashboard: (year) => request('GET', `/api/alerts/dashboard${year ? '?year=' + year : ''}`),
        uploadFile: (formData) => request('POST', '/api/upload', formData, true),
        getAlertConfig: () => request('GET', '/api/alerts/config'),
        saveAlertConfig: (configs) => request('PUT', '/api/alerts/config', { configs }),
        getAlertLog: () => request('GET', '/api/alerts/log'),
        sendTestEmail: (recipients) => request('POST', '/api/alerts/test', { recipients }),
        createEquipment: (data) => request('POST', '/api/equipment', data),
        updateEquipment: (id, data) => request('PUT', `/api/equipment/${id}`, data),
        deleteEquipment: (id) => request('DELETE', `/api/equipment/${id}`),
        disposeEquipment: (id, reason) => request('PUT', `/api/equipment/${id}/dispose`, { disposal_reason: reason }),
        restoreEquipment: (id) => request('PUT', `/api/equipment/${id}/restore`, {}),
        // Certificates
        getCertificates: (equipId) => request('GET', `/api/certificates/${equipId}`),
        uploadCertificate: (equipId, formData) => request('POST', `/api/certificates/${equipId}`, formData, true),
        deleteCertificate: (certId) => request('DELETE', `/api/certificates/item/${certId}`),
        getCertFileUrl: (filename) => `${BASE}/api/certificates/file/${filename}`
    };
})();
