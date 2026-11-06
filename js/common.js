/**
 * Common JS - Header, Navigation, Language, Animations
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize i18n
  I18n.init();

  // Header scroll effect
  initHeader();

  // Mobile navigation
  initMobileNav();

  // Language selector
  initLangSelector();

  // Scroll animations (for sub pages)
  initScrollAnimations();
});

/* ===== Header ===== */
function initHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const handleScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  };

  window.addEventListener('scroll', handleScroll);
  handleScroll();
}

/* ===== Mobile Navigation ===== */
function initMobileNav() {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav');
  const overlay = document.querySelector('.nav-overlay');

  if (!toggle || !nav) return;

  // 모바일/태블릿: 헤더의 PORTAL 버튼은 숨겨지므로 메뉴 맨 아래에 동일 링크를 추가
  const portalBtn = document.querySelector('.portal-btn');
  if (portalBtn && !nav.querySelector('.nav-portal-link')) {
    const a = document.createElement('a');
    a.className = 'nav-portal-link';
    a.href = portalBtn.getAttribute('href');
    a.innerHTML = '<span class="portal-icon">⊞</span> Portal';
    nav.appendChild(a);
  }

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    nav.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      toggle.classList.remove('active');
      nav.classList.remove('open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  // Mobile dropdown toggle
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const link = item.querySelector('.nav-link');
    const dropdown = item.querySelector('.dropdown');
    if (!dropdown) return;

    link.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024) {
        e.preventDefault();
        item.classList.toggle('open');
      }
    });
  });
}

/* ===== Language Selector ===== */
function initLangSelector() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      I18n.setLanguage(lang);
    });
  });
}

/* ===== Scroll Animations ===== */
function initScrollAnimations() {
  const elements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right');
  if (elements.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(el => observer.observe(el));
}

/* ===== Counter Animation ===== */
function animateCounters() {
  const counters = document.querySelectorAll('.counter');
  counters.forEach(counter => {
    const target = parseInt(counter.dataset.target);
    const duration = 2000;
    const start = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);
      counter.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        counter.textContent = target.toLocaleString();
      }
    }

    requestAnimationFrame(update);
  });
}
