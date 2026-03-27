/**
 * i18n - Internationalization Module
 * Supports: ko (Korean), en (English), vi (Vietnamese)
 */
const I18n = {
  currentLang: 'vi',
  translations: {},
  supportedLangs: ['vi', 'en', 'ko'],

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
      this.currentLang = 'vi'; // Default to Vietnamese for Vietnam subsidiary
    }

    await this.loadLanguage(this.currentLang);
    this.applyTranslations();
    this.updateLangButtons();
  },

  async loadLanguage(lang) {
    if (this.translations[lang]) return;
    try {
      const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
      const response = await fetch(`${basePath}/lang/${lang}.json`);
      this.translations[lang] = await response.json();
    } catch (e) {
      console.warn(`Failed to load language: ${lang}`, e);
    }
  },

  async setLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) return;
    this.currentLang = lang;
    localStorage.setItem('psavn_lang', lang);
    await this.loadLanguage(lang);
    this.applyTranslations();
    this.updateLangButtons();

    // Update HTML lang attribute
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
        // Handle newlines in translations
        if (text.includes('\n')) {
          el.innerHTML = text.replace(/\n/g, '<br>');
        } else {
          el.textContent = text;
        }
      }
    });

    // Handle placeholder attributes
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = this.t(key);
      if (text !== key) el.placeholder = text;
    });

    // Handle title attributes
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
