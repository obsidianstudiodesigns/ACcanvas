import { WORK } from './data.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const PHONE_INTL = '27714564561';

/* ---------- nav ---------- */
const nav = $('#nav'), menuBtn = $('.menu-btn');
if (menuBtn) {
  const setOpen = open => {
    nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) nav.querySelector('a')?.focus();
  };
  menuBtn.addEventListener('click', () => setOpen(true));
  $('.nav .close')?.addEventListener('click', () => { setOpen(false); menuBtn.focus(); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); menuBtn.focus(); } });
}
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > innerHeight * 0.6), { passive: true });

/* ---------- 3D cloth ---------- */
function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const stages = $$('[data-cloth]');
if (stages.length && webgl()) {
  document.documentElement.classList.add('has-webgl');
  (async () => {
    const { createCloth, FABRICS } = await import('./cloth.js');
    await Promise.all([
      document.fonts.load('800 200px "Big Shoulders Stencil Display"'),
      document.fonts.ready,
    ]).catch(() => {});
    for (const el of stages) {
      const cfg = JSON.parse(el.dataset.cloth || '{}');
      if (cfg.logo) {
        const img = new Image(); img.src = cfg.logo; await img.decode().catch(() => {});
        cfg.print = { image: img, scale: 0.7, y: 0.3 };
      }
      if (cfg.text) cfg.print = { text: cfg.text, size: cfg.size ?? 0.44, y: 0.56, color: cfg.ink };
      const cloth = await createCloth(el, cfg);
      el.dispatchEvent(new CustomEvent('cloth:ready', { detail: cloth }));
      const picker = $('#swatches');
      if (picker && el.id === 'hero-stage') {
        const row = $('.swatch-row', picker), label = $('.swatch-name', picker);
        for (const [key, f] of Object.entries(FABRICS)) {
          const b = document.createElement('button');
          b.className = 'swatch'; b.type = 'button'; b.style.setProperty('--c', f.hex);
          b.setAttribute('aria-label', f.name); b.setAttribute('aria-pressed', key === cfg.fabric);
          b.title = f.name;
          b.addEventListener('click', () => {
            $$('.swatch', row).forEach(s => s.setAttribute('aria-pressed', s === b));
            label.textContent = f.pvc ? f.name : f.name + ' canvas';
            cloth.setFabric(key);
          });
          row.append(b);
        }
        label.textContent = FABRICS[cfg.fabric].name + ' canvas';
        picker.hidden = false;
      }
    }
  })();
}

/* ---------- feature parallax ---------- */
const feat = $('.feature > img');
if (feat && !reduced) {
  let ticking = false;
  const upd = () => {
    const r = feat.parentElement.getBoundingClientRect();
    const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    feat.style.transform = `translate3d(0, ${p * -6}%, 0) scale(1.02)`;
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  upd();
}

/* ---------- 3D tilt tiles (products) ---------- */
if (!reduced && matchMedia('(hover: hover)').matches) {
  for (const t of $$('.tile')) {
    t.addEventListener('pointermove', e => {
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.style.transform = `rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 10}deg) translateZ(14px)`;
      t.style.setProperty('--gx', x * 100 + '%'); t.style.setProperty('--gy', y * 100 + '%');
    });
    t.addEventListener('pointerleave', () => { t.style.transform = ''; });
  }
}

/* ---------- lightbox ---------- */
let lb, lbList = [], lbIdx = 0, lbReturn;
function ensureLightbox() {
  if (lb) return lb;
  lb = document.createElement('div');
  lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photo viewer');
  lb.innerHTML = `
    <img alt="">
    <p class="lb-cap"><span></span><small></small></p>
    <button class="lb-btn lb-close" type="button" aria-label="Close"><svg><use href="#i-close"/></svg></button>
    <button class="lb-btn lb-prev" type="button" aria-label="Previous photo"><svg><use href="#i-left"/></svg></button>
    <button class="lb-btn lb-next" type="button" aria-label="Next photo"><svg><use href="#i-right"/></svg></button>`;
  document.body.append(lb);
  $('.lb-close', lb).onclick = closeLb;
  $('.lb-prev', lb).onclick = () => showLb(lbIdx - 1, -1);
  $('.lb-next', lb).onclick = () => showLb(lbIdx + 1, 1);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') showLb(lbIdx - 1, -1);
    if (e.key === 'ArrowRight') showLb(lbIdx + 1, 1);
    if (e.key === 'Tab') { // keep focus inside
      const f = $$('button', lb); const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let sx = 0;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) showLb(lbIdx + (d < 0 ? 1 : -1), d < 0 ? 1 : -1); });
  return lb;
}
const ALBUMS = { canvas: 'Canvas', covers: 'Covers', nets: 'Tarps and pool nets', custom: 'Custom made', dams: 'Dam liners' };
function showLb(i, dir = 0) {
  lbIdx = (i + lbList.length) % lbList.length;
  const w = lbList[lbIdx], img = $('img', lb);
  const swap = () => {
    // Show the cached thumbnail at once, then sharpen to the full-size photo.
    const full = `assets/img/work/${w.s}.jpg`;
    img.src = `assets/img/thumb/${w.s}.jpg`; img.alt = w.t;
    const hi = new Image(); hi.src = full;
    hi.decode().then(() => { if (lbList[lbIdx] === w) img.src = full; }).catch(() => {});
    for (const n of [1, -1]) new Image().src = `assets/img/work/${lbList[(lbIdx + n + lbList.length) % lbList.length].s}.jpg`;
    $('.lb-cap span', lb).textContent = w.t;
    $('.lb-cap small', lb).textContent = `${ALBUMS[w.a] ?? ''}, ${lbIdx + 1} of ${lbList.length}`;
  };
  if (dir && !reduced && img.animate) {
    img.animate([{ transform: 'rotateY(0) translateX(0)', opacity: 1 }, { transform: `rotateY(${-dir * 35}deg) translateX(${-dir * 8}%)`, opacity: 0 }], { duration: 180, easing: 'ease-in' })
      .finished.then(() => { swap(); img.animate([{ transform: `rotateY(${dir * 35}deg) translateX(${dir * 8}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
  } else swap();
}
function openLb(list, i, from) {
  ensureLightbox(); lbList = list; lbReturn = document.activeElement;
  showLb(i);
  lb.classList.add('open'); document.body.style.overflow = 'hidden';
  // Fly the photo out of its thumbnail.
  const img = $('img', lb);
  if (from && !reduced && img.animate) {
    const r = from.getBoundingClientRect();
    requestAnimationFrame(() => {
      const t = img.getBoundingClientRect();
      if (!t.width) return;
      img.animate([
        { transform: `translate(${r.left + r.width / 2 - (t.left + t.width / 2)}px, ${r.top + r.height / 2 - (t.top + t.height / 2)}px) scale(${r.width / t.width}) rotateX(8deg)`, opacity: .6 },
        { transform: 'none', opacity: 1 },
      ], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  $('.lb-close', lb).focus();
}
function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; lbReturn?.focus(); }

/* ---------- gallery page ---------- */
const masonry = $('#masonry');
if (masonry) {
  const order = ['canvas', 'covers', 'nets', 'custom', 'dams'];
  const items = [...WORK].sort((a, b) => order.indexOf(a.a) - order.indexOf(b.a));
  masonry.innerHTML = items.map((w, i) => `
    <figure data-album="${w.a}">
      <button type="button" data-i="${i}" aria-label="View larger: ${w.t}">
        <img src="assets/img/thumb/${w.s}.jpg" alt="${w.t}" width="${w.w}" height="${w.h}" loading="lazy" decoding="async">
      </button>
      <figcaption>${w.t}</figcaption>
    </figure>`).join('');
  let visible = items;
  const filters = $('#filters');
  const counts = items.reduce((m, w) => (m[w.a] = (m[w.a] || 0) + 1, m), {});
  $$('.chip', filters).forEach(ch => {
    const k = ch.dataset.album; ch.insertAdjacentHTML('beforeend', `<span>${k === 'all' ? items.length : counts[k]}</span>`);
    ch.addEventListener('click', () => {
      $$('.chip', filters).forEach(c => c.setAttribute('aria-pressed', c === ch));
      visible = k === 'all' ? items : items.filter(w => w.a === k);
      $$('figure', masonry).forEach(f => { f.hidden = k !== 'all' && f.dataset.album !== k; });
      history.replaceState(null, '', k === 'all' ? location.pathname : `#${k}`);
    });
  });
  const start = location.hash.slice(1);
  if (start && counts[start]) $(`.chip[data-album="${start}"]`, filters)?.click();
  masonry.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const w = items[+b.dataset.i];
    openLb(visible, visible.indexOf(w), b);
  });
}

/* ---------- mosaic on home opens lightbox too ---------- */
const mosaic = $('.mosaic');
if (mosaic) {
  const links = $$('a', mosaic);
  const list = links.map(a => WORK.find(w => w.s === a.dataset.s) ?? { s: a.dataset.s, t: a.textContent.trim(), a: '' });
  links.forEach((a, i) => a.addEventListener('click', e => { e.preventDefault(); openLb(list, i, a); }));
}

/* ---------- products: active category ---------- */
const catLinks = $$('.cat-nav a');
if (catLinks.length) {
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) catLinks.forEach(l => l.classList.toggle('active', l.hash === '#' + en.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  catLinks.forEach(l => { const s = $(l.hash); if (s) io.observe(s); });
}

/* ---------- contact form: compose via WhatsApp or email ---------- */
const form = $('#quote');
if (form) {
  const q = new URLSearchParams(location.search).get('product');
  if (q) { const sel = $('#need', form); if ([...sel.options].some(o => o.value === q)) sel.value = q; }
  const compose = () => {
    const d = Object.fromEntries(new FormData(form));
    return `Hi AC Canvas, I'd like a quote.\n\nName: ${d.name}\nPhone: ${d.phone}\nI need: ${d.need}\n\n${d.message}`.trim();
  };
  const valid = () => {
    let ok = true;
    for (const f of $$('[required]', form)) {
      const err = $(`#${f.id}-err`);
      const bad = !f.value.trim() || (f.type === 'tel' && f.value.replace(/\D/g, '').length < 9);
      f.setAttribute('aria-invalid', bad);
      if (err) err.textContent = bad ? (f.type === 'tel' ? 'Enter a phone number so we can call you back.' : `Enter your ${f.labels[0].textContent.toLowerCase()}.`) : '';
      if (bad && ok) { f.focus(); ok = false; }
    }
    return ok;
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!valid()) return;
    const via = e.submitter?.value;
    const text = compose();
    if (via === 'email') location.href = `mailto:info@accanvas.co.za?subject=${encodeURIComponent('Quote request: ' + new FormData(form).get('need'))}&body=${encodeURIComponent(text)}`;
    else window.open(`https://wa.me/${PHONE_INTL}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
}

/* ---------- year ---------- */
$$('[data-year]').forEach(n => (n.textContent = new Date().getFullYear()));
