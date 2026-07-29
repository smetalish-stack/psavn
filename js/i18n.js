/**
 * i18n - Internationalization Module
 * Supports: ko (Korean), en (English), vi (Vietnamese)
 */
const I18n = {
  currentLang: 'vi',
  translations: {},
  supportedLangs: ['vi', 'en', 'ko'],
  _manuallySet: false,  // setLanguage() 호출 여부 추적 (race condition 방지)

  async init() {
    // Check URL param > localStorage > browser language > default (vi)
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const storedLang = localStorage.getItem('psavn_lang');
    const browserLang = navigator.language.slice(0, 2);

    if (urlLang && this.supportedLangs.includes(urlLang)) {
      this.currentLang = urlLang;
    } else if (storedLang && this.supportedLangs.includes(storedLang)) {
      this.currentLang = storedLang;
    } else if (this.supportedLangs.includes(browserLang)) {
      this.currentLang = browserLang;
    } else {
      this.currentLang = 'vi';
    }

    await this.loadLanguage(this.currentLang);

    // 로딩 중 사용자가 언어를 직접 선택했으면 init()의 applyTranslations 생략
    if (!this._manuallySet) {
      this.applyTranslations();
      this.updateLangButtons();
      document.documentElement.lang = this.currentLang;
    }
  },

  async loadLanguage(lang) {
    if (this.translations[lang]) return;
    try {
      const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
      const response = await fetch(`${basePath}/lang/${lang}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.translations[lang] = await response.json();
    } catch (e) {
      console.warn(`Failed to load language: ${lang}`, e);
    }
  },

  async setLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) return;
    this._manuallySet = true;
    this.currentLang = lang;
    localStorage.setItem('psavn_lang', lang);
    await this.loadLanguage(lang);
    this.applyTranslations();
    this.updateLangButtons();
    document.documentElement.lang = lang;
  },

  t(key) {
    const keys = key.split('.');
    let value = this.translations[this.currentLang];
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key;
      }
    }
    return value || key;
  },

  applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (text !== key) {
        if (text.includes('\n')) {
          el.innerHTML = text.replace(/\n/g, '<br>');
        } else if (/<[a-z][\s\S]*>/i.test(text)) {
          el.innerHTML = text;
        } else {
          el.textContent = text;
        }
      }
    });

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = this.t(key);
      if (text !== key) el.placeholder = text;
    });

    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const text = this.t(key);
      if (text !== key) el.title = text;
    });
  },

  updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
    });
  }
};
