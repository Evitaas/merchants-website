document.getElementById('year').textContent = new Date().getFullYear();

const navToggle = document.getElementById('navToggle');
const primaryNav = document.getElementById('primaryNav');

navToggle.addEventListener('click', () => {
  const isOpen = primaryNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

primaryNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    primaryNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// After the contact form is sent, FormSubmit brings the visitor back to #contact-thanks: show the confirmation there.
function showThanks() {
  const thanks = document.getElementById('contact-thanks');
  if (thanks && location.hash === '#contact-thanks') {
    thanks.hidden = false;
    thanks.scrollIntoView({ block: 'center' });
  }
}
showThanks();
window.addEventListener('hashchange', showThanks);
