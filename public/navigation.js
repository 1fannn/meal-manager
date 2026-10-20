(() => {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const activePath = path.startsWith('/meals/edit/') ? '/meals' : path;
  document.querySelectorAll('.meal-nav-link').forEach((link) => {
    if (link.getAttribute('href') === activePath) link.setAttribute('aria-current', 'page');
  });
})();
