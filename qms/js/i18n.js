const I18n = (() => {
    const STORAGE_KEY = 'qms_lang';
    const SUPPORTED = ['vi', 'ko', 'en'];
    const DEFAULT_LANG = 'vi';

    let currentLang = DEFAULT_LANG;
    let translations = {};
    let onChangeCallbacks = [];

    async function init() {
        const stored = localStorage.getItem(STORAGE_KEY);
        const browser = navigator.language.slice(0, 2);
        if (stored && SUPPORTED.includes(stored)) {
            currentLang = stored;
        } else if (SUPPORTED.includes(browser)) {
            currentLang = browser;
        } else {
            currentLang = DEFAULT_LANG;
        }
        await load(currentLang);
        apply();
        updateButtons();
    }

    async function load(lang) {
        if (translations[lang]) return;
        try {
            const res = await fetch(`lang/${lang}.json`);
            // lang JSON 에 BOM 이 섞이면 JSON.parse 가 터진다. 저장 규칙과 별개로 방어한다.
            const text = (await res.text()).replace(/^﻿/, '');
            translations[lang] = JSON.parse(text);
        } catch (e) {
            console.warn('[I18n] Failed to load:', lang, e);
            translations[lang] = {};
        }
    }

    async function setLang(lang) {
        if (!SUPPORTED.includes(lang)) return;
        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.lang = lang;
        await load(lang);
        apply();
        updateButtons();
        onChangeCallbacks.forEach(fn => fn(lang));
    }

    function lookup(dict, keys) {
        let val = dict;
        for (const k of keys) {
            if (val && typeof val === 'object') val = val[k];
            else return undefined;
        }
        return val;
    }

    function t(key, vars) {
        const keys = key.split('.');
        let val = lookup(translations[currentLang], keys);
        if (val === undefined || val === null) {
            for (const fb of ['vi', 'en']) {
                const fbVal = lookup(translations[fb], keys);
                if (fbVal !== undefined && fbVal !== null) { val = fbVal; break; }
            }
        }
        if (typeof val !== 'string') return key;
        if (vars) {
            Object.keys(vars).forEach(k => {
                val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
            });
        }
        return val;
    }

    /** 부서명은 DB 에 한국어로 들어있다. 번역이 있으면 바꾸고 없으면 원문 그대로. */
    function dept(name) {
        if (!name) return '';
        const v = t(`dept.${name}`);
        return v === `dept.${name}` ? name : v;
    }

    function apply() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const val = t(key);
            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'email')) {
                el.placeholder = val;
            } else {
                el.textContent = val;
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
        const titleKey = t('title');
        if (titleKey && titleKey !== 'title') document.title = titleKey;
    }

    function updateButtons() {
        document.querySelectorAll('[data-lang-btn]').forEach(btn => {
            const lang = btn.getAttribute('data-lang-btn');
            btn.classList.toggle('active', lang === currentLang);
        });
    }

    function onChange(fn) {
        onChangeCallbacks.push(fn);
    }

    function getLang() { return currentLang; }

    return { init, setLang, t, dept, apply, onChange, getLang };
})();
