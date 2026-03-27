/**
 * Sub Page JS - Common functionality for sub pages
 */
document.addEventListener('DOMContentLoaded', () => {
  // Mark header as sub-page style
  const header = document.querySelector('.header');
  if (header) header.classList.add('sub-page');

  // Active sub-nav link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.sub-nav a').forEach(link => {
    if (link.getAttribute('href') && currentPath.includes(link.getAttribute('href').replace('../', ''))) {
      link.classList.add('active');
    }
  });

  // Active main nav link
  document.querySelectorAll('.nav-item').forEach(item => {
    const links = item.querySelectorAll('.dropdown a');
    links.forEach(link => {
      if (link.getAttribute('href') && currentPath.includes(link.getAttribute('href').replace('../', ''))) {
        item.classList.add('active');
      }
    });
  });
});
