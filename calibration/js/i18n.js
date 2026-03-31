const I18n = (() => {
    const STORAGE_KEY = 'cal_lang';
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
            translations[lang] = await res.json();
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

    function t(key, vars) {
        const keys = key.split('.');
        let val = translations[currentLang];
        for (const k of keys) {
            if (val && typeof val === 'object') val = val[k];
            else { val = undefined; break; }
        }
        if (val === undefined || val === null) {
            // fallback to vi then en
            for (const fb of ['vi', 'en']) {
                let fbVal = translations[fb];
                if (!fbVal) continue;
                for (const k of keys) {
                    if (fbVal && typeof fbVal === 'object') fbVal = fbVal[k];
                    else { fbVal = undefined; break; }
                }
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
        // Update page title
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

    return { init, setLang, t, apply, onChange, getLang };
})();
