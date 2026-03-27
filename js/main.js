/**
 * Main Page JS - Fullpage.js + Swiper
 */
document.addEventListener('DOMContentLoaded', () => {
  initHeroSlider();
  initFullpage();
});

/* ===== Hero Slider (Swiper) ===== */
function initHeroSlider() {
  new Swiper('.hero-slider', {
    loop: true,
    speed: 1000,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
    },
    effect: 'fade',
    fadeEffect: {
      crossFade: true,
    },
    pagination: {
      el: '.hero-slider .swiper-pagination',
      clickable: true,
    },
  });
}

/* ===== Fullpage.js ===== */
function initFullpage() {
  new fullpage('#fullpage', {
    licenseKey: 'gplv3-license',
    autoScrolling: true,
    scrollOverflow: true,
    scrollingSpeed: 800,
    css3: true,
    navigation: true,
    navigationPosition: 'right',
    navigationTooltips: ['Home', 'About', 'Business', 'Products', 'Global', 'Contact'],

    // Section colors/backgrounds handled by CSS
    afterLoad: function(origin, destination) {
      const section = destination.item;

      // Trigger counter animation when about section is loaded
      if (destination.index === 1) {
        animateCounters();
      }

      // Add visible class to animated elements
      section.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right').forEach(el => {
        el.classList.add('visible');
      });

      // Header transparency
      const header = document.querySelector('.header');
      if (destination.index === 0) {
        header.classList.remove('scrolled');
      } else {
        header.classList.add('scrolled');
      }
    },

    onLeave: function(origin, destination) {
      // Reset animations when leaving
      const nextSection = destination.item;
      nextSection.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right').forEach(el => {
        el.classList.remove('visible');
      });
    }
  });
}
