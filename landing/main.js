// Landing page behaviour. The numbers come from the app's own logic (frontend/lib/invoice-logic.js),
// so the page shows exactly what a pilot restaurant would get. Everything here only adds to markup
// that already reads correctly without JavaScript.
import { money, num, fmtPct, sampleInvoices, summaryText } from '../frontend/lib/invoice-logic.js';

const $ = s => document.querySelector(s);
const REPORT_DATE = '2026-10-22';

// ---------- hero: one invoice line, priced ----------
function updateCalc() {
  const qty = num($('#c-qty').value), was = num($('#c-old').value), now = num($('#c-new').value);
  const chg = $('#c-chg');
  if (!(qty > 0) || !(was > 0) || !(now >= 0)) {
    chg.className = 'chg';
    chg.textContent = 'Enter a quantity and both prices';
    $('#c-extra').textContent = $('#c-year').textContent = '–';
    return;
  }
  const pct = (now - was) / was * 100, perLb = now - was, extra = Math.round(perLb * qty * 100) / 100;
  chg.className = 'chg ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : '');
  chg.innerHTML = pct === 0 ? 'No change' : `${pct > 0 ? '▲' : '▼'} ${fmtPct(pct)} <small>${pct > 0 ? '+' : '−'}${money(Math.abs(perLb))}/lb</small>`;
  $('#c-extra').textContent = (extra < 0 ? '−' : '') + money(Math.abs(extra));
  $('#c-year').textContent = (extra < 0 ? '−' : '') + money(Math.abs(extra * 52)) + ' a year';
}
['#c-qty', '#c-old', '#c-new'].forEach(id => $(id).addEventListener('input', updateCalc));
$('.calc .is-focus')?.addEventListener('focusin', e => e.currentTarget.classList.remove('is-focus'), { once: true });

// ---------- the week the "Try it" report is written from ----------
const state = { alertPct: 2, qty: 40, dup: false, cream: 3.15, restaurant: 'Bistro on 9th' };

function week() {
  return sampleInvoices()
    .filter(inv => state.dup || inv.id !== 'sample-5')
    .map(inv => inv.invoiceNo !== 'VF-10588' ? inv : {
      ...inv,
      lines: inv.lines.map(l =>
        l.item.startsWith('Chicken') ? { ...l, qty: state.qty } :
        l.item === 'Heavy cream' && state.cream >= 0 ? { ...l, price: state.cream } : l),
    });
}

function renderReport() {
  const out = $('#summary');
  out.textContent = summaryText(week(), { restaurant: state.restaurant.trim() || 'Your restaurant', alertPct: state.alertPct }, REPORT_DATE);
  out.classList.remove('flash'); void out.offsetWidth; out.classList.add('flash');
}

$('#t-qty').addEventListener('input', e => { state.qty = Number(e.target.value); $('#qty-out').textContent = `${state.qty} lb`; renderReport(); });
$('#t-dup').addEventListener('change', e => { state.dup = e.target.checked; renderReport(); });
$('#t-cream').addEventListener('input', e => { const v = num(e.target.value); if (v >= 0) { state.cream = v; renderReport(); } });
$('#t-name').addEventListener('input', e => { state.restaurant = e.target.value; renderReport(); });

// ---------- showcase: the alert threshold, at poster size ----------
const field = $('#flag');
document.querySelectorAll('.seg-big [data-pct]').forEach(btn => btn.addEventListener('click', () => {
  if (btn.getAttribute('aria-checked') === 'true') return;
  document.querySelectorAll('.seg-big [data-pct]').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
  state.alertPct = Number(btn.dataset.pct);
  $('#flag-word').textContent = btn.dataset.pct + '%';
  field.dataset.field = field.dataset.field === 'ink' ? 'green' : 'ink';
  renderReport();
}));
// arrow keys move the choice, as in any radio group
$('.seg-big').addEventListener('keydown', e => {
  const btns = [...document.querySelectorAll('.seg-big [data-pct]')], i = btns.indexOf(document.activeElement);
  if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
  next.focus(); next.click(); e.preventDefault();
});

// ---------- questions: the answer follows the pointer, the keyboard and taps ----------
const pane = $('#faq-answer');
const qas = [...document.querySelectorAll('.qa')];
const wide = matchMedia('(min-width: 60.01rem)');
function select(qa) {
  qas.forEach(x => { x.classList.toggle('open', x === qa); x.querySelector('.q').setAttribute('aria-expanded', String(x === qa)); });
  if (!wide.matches) return;
  const text = qa.querySelector('.a').textContent.trim();
  if (pane.textContent === text) return;
  pane.classList.add('fading');
  setTimeout(() => { pane.textContent = text; pane.classList.remove('fading'); }, 150);
}
qas.forEach(qa => {
  const q = qa.querySelector('.q');
  q.addEventListener('click', () => select(qa));
  q.addEventListener('focus', () => select(qa));
  q.addEventListener('mouseenter', () => { if (wide.matches) select(qa); });
});
pane.textContent = qas[0].querySelector('.a').textContent.trim();
$('.faq-pane').removeAttribute('aria-hidden');
qas[0].classList.add('open');

// ---------- join: carry the choices into the email ----------
let by = 'text';
document.querySelectorAll('.dialog [data-by]').forEach(btn => btn.addEventListener('click', () => {
  by = btn.dataset.by;
  document.querySelectorAll('.dialog [data-by]').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
  updateMail();
}));
function updateMail() {
  const name = $('#j-name').value.trim();
  const subject = `InvoicePlate pilot${name ? ': ' + name : ''}`;
  const body = `Hi,\n\nI'd like to join the InvoicePlate pilot.\n\nRestaurant: ${name || ''}\nI'll send invoices by: ${by}\nBest way to reach me: \n`;
  $('#j-go').href = `mailto:hello@invoiceplate.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
$('#j-name').addEventListener('input', updateMail);
// Enter in the field sends the same email the button does
$('#join-form').addEventListener('submit', e => { e.preventDefault(); location.href = $('#j-go').href; });
updateMail();

// ---------- footer clock: Salt Lake City time ----------
const clock = $('#clock');
const tick = () => { clock.textContent = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' }) + ' here now'; };
tick(); setInterval(tick, 30000);

// ---------- reveal each part once as it enters ----------
const targets = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
  targets.forEach(el => io.observe(el));
  addEventListener('load', () => setTimeout(() => targets.forEach(el => {
    const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
  }), 2500));
} else targets.forEach(el => el.classList.add('is-in'));
