/* Информатор — ядро: хранилище, звук, пульт, импорт, банк звуков */
'use strict';
const APP_VERSION = '11 · 28.11.2026';

/* ================= DOM-помощники ================= */
// append(null) в DOM печатает «null» — в этом приложении пустые значения просто пропускаем
{ const ap = Element.prototype.append; Element.prototype.append = function (...a) { return ap.apply(this, a.filter(x => x != null && x !== false)); }; }
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const ICONS = {
  play: 'M8 5v14l11-7z', stop: 'M6 6h12v12H6z', prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z', next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z', more: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  edit: 'M3 17.2V21h3.8L17.8 10 14 6.2zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8L19 8.8z', add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z', del: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
  up: 'M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z', down: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z', repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  swap: 'M6.99 11 3 15l3.99 4v-3H14v-2H6.99zM21 9l-3.99-4v3H10v2h7.01v3z', cut: 'M9.6 7.6A4 4 0 1 0 8 9.2l2.4 2.4-2.4 2.4a4 4 0 1 0 1.6 1.6l2.4-2.4 7 7H22v-1zM6 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6-7.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zM19 3l-6 6 2 2 7-7V3z',
  upload: 'M5 20h14v-2H5zm0-10h4v6h6v-6h4l-7-7z', bell: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.9V4a1 1 0 0 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z'
};
const ic = (n, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); if (cls) s.setAttribute('class', cls); s.innerHTML = '<path d="' + ICONS[n] + '"/>'; return s; };
const ib = (n, on, title, cls) => h('button', { class: 'ib ' + (cls || ''), onclick: e => { e.stopPropagation(); on(e); }, 'aria-label': title || n, title }, ic(n));
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms || 2200); }
const fmtT = s => s == null ? '' : (s < 60 ? s.toFixed(1) + ' с' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));
const esc = s => String(s);

/* ================= Хранилище (IndexedDB) ================= */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('informator', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('blobs'); };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), st = t.objectStore(store);
      const q = fn(st);
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Транзакция прервана'));
    });
  },
  get(s, k) { return this.tx(s, 'readonly', st => st.get(k)); },
  put(s, k, v) { return this.tx(s, 'readwrite', st => st.put(v, k)); },
  del(s, k) { return this.tx(s, 'readwrite', st => st.delete(k)); },
  keys(s) { return this.tx(s, 'readonly', st => st.getAllKeys()); }
};

let S = null;
const DEF = () => ({ v: 1, packs: [], clips: {}, lines: [], routes: [], service: [], set: { vol: 1, gap: 0, route: null, dir: 0, pos: {} } });
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => DB.put('kv', 'state', S).catch(e => toast('Не сохранилось: ' + e.message)), 250); }
const clip = id => S.clips[id];
const clipLabel = id => { const c = clip(id); return c ? INF.stem(c.name) : '???'; };
const lineById = id => S.lines.find(l => l.id === id);
const routeById = id => S.routes.find(r => r.id === id);
const svcById = id => S.service.find(s => s.id === id);

/* ================= Звук ================= */
const AE = {
  ctx: null, cache: new Map(), urls: new Map(), prev: null,
  ac() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
  async buffer(blobId) {
    if (this.cache.has(blobId)) { const b = this.cache.get(blobId); this.cache.delete(blobId); this.cache.set(blobId, b); return b; }
    const blob = await DB.get('blobs', blobId);
    if (!blob) throw new Error('Звук не найден в хранилище');
    const buf = await this.ac().decodeAudioData(await blob.arrayBuffer());
    this.cache.set(blobId, buf);
    while (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
    return buf;
  },
  async clipPart(c) {
    const buf = await this.buffer(c.blob), r = buf.sampleRate;
    const a = Math.max(0, Math.floor((c.start || 0) * r)), b = Math.min(buf.length, c.end != null ? Math.floor(c.end * r) : buf.length);
    if (c.dur == null) { c.dur = (b - a) / r; save(); }
    return { buf, a, b };
  },
  /** segs → {chans, rate} */
  async mix(segs) {
    const rate = this.ac().sampleRate, parts = [];
    let nch = 1, total = 0;
    const gap = Math.round((S.set.gap || 0) / 1000 * rate);
    for (const s of segs) {
      if (s.pause) { const n = Math.round(s.pause / 1000 * rate); parts.push({ n }); total += n; continue; }
      const c = clip(s.c); if (!c) continue;
      const p = await this.clipPart(c);
      if (gap && parts.length && !parts[parts.length - 1].n) { parts.push({ n: gap }); total += gap; }
      nch = Math.max(nch, Math.min(2, p.buf.numberOfChannels));
      parts.push(p); total += p.b - p.a;
    }
    const chans = Array.from({ length: nch }, () => new Float32Array(Math.max(1, total)));
    let o = 0;
    for (const p of parts) {
      if (p.n != null) { o += p.n; continue; }
      for (let c = 0; c < nch; c++) chans[c].set(p.buf.getChannelData(Math.min(c, p.buf.numberOfChannels - 1)).subarray(p.a, p.b), o);
      o += p.b - p.a;
    }
    return { chans, rate };
  },
  async url(segs) {
    const key = JSON.stringify(segs) + '|' + (S.set.gap || 0);
    if (this.urls.has(key)) return this.urls.get(key);
    const m = await this.mix(segs);
    const u = URL.createObjectURL(INF.encodeWav(m.chans, m.rate));
    this.urls.set(key, u);
    while (this.urls.size > 24) { const k = this.urls.keys().next().value; URL.revokeObjectURL(this.urls.get(k)); this.urls.delete(k); }
    return u;
  },
  /** Быстрое прослушивание (не через основной плеер) */
  async preview(segs) {
    this.stopPreview();
    try {
      const m = await this.mix(segs), ac = this.ac();
      const b = ac.createBuffer(m.chans.length, m.chans[0].length, m.rate);
      m.chans.forEach((d, i) => b.copyToChannel(d, i));
      const src = ac.createBufferSource(), g = ac.createGain(); g.gain.value = S.set.vol;
      src.buffer = b; src.connect(g).connect(ac.destination); src.start(); this.prev = src;
    } catch (e) { toast(e.message); }
  },
  stopPreview() { if (this.prev) { try { this.prev.stop(); } catch (e) { } this.prev = null; } }
};

/* ================= Плеер ================= */
const au = $('#au');
const PL = {
  route: null, dir: 0, anns: [], idx: 0, playing: null, queue: [], timer: 0, nowLabel: '',
  load() {
    this.lastKey = null;
    this.route = routeById(S.set.route) || S.routes[0] || null;
    if (!this.route) { this.anns = []; return; }
    S.set.route = this.route.id;
    const dn = INF.dirNames(this.route, S.lines);
    if (S.set.dir !== 'ring' && !(S.set.dir < dn.length)) S.set.dir = 0;
    if (S.set.dir === 'ring' && dn.length < 2) S.set.dir = 0;
    this.dir = S.set.dir;
    this.rebuild();
    this.idx = Math.min(S.set.pos[this.posKey()] || 0, Math.max(0, this.anns.length - 1));
  },
  posKey() { return this.route.id + '|' + this.dir; },
  rebuild() { this.anns = this.route ? INF.buildAnnouncements(this.route, S.lines, this.dir, S.service) : []; if (this.idx >= this.anns.length) this.idx = 0; },
  isRing() { if (!this.route) return false; if (this.dir === 'ring') return true; const d = INF.dirNames(this.route, S.lines)[this.dir]; return !!(d && d.ring) || !!this.route.circle; },
  setRoute(id) { S.set.route = id; S.set.dir = 0; this.stop(); this.load(); save(); },
  setDir(d) { S.set.dir = d; this.stop(); this.load(); save(); },
  savePos() { if (this.route) { S.set.pos[this.posKey()] = this.idx; save(); } },
  nextPlayable(from) {
    const n = this.anns.length;
    for (let k = 0; k < n; k++) {
      let i = from + k;
      if (i >= n) { if (!this.isRing()) return -1; i %= n; }
      if (!this.anns[i].off) return i;
    }
    return -1;
  },
  async go() {
    const i = this.nextPlayable(this.idx);
    if (i < 0) { toast('Маршрут окончен. ⏮ — назад, или смени направление'); return; }
    this.idx = i + 1;
    if (this.idx >= this.anns.length && this.isRing()) this.idx = 0;
    this.savePos();
    await this.playAnn(i);
  },
  step(d) {
    const n = this.anns.length; if (!n) return;
    let i = this.idx + d;
    if (this.isRing()) i = (i + n) % n; else i = Math.max(0, Math.min(n, i));
    this.idx = i; this.savePos(); UI.refreshPlayer();
  },
  async playAnn(i) {
    const a = this.anns[i]; if (!a) return;
    this.stop(true);
    this.playing = a.key; this.lastKey = a.key;
    (a.then || []).forEach(t => this.queue.push({ segs: t.segs, label: t.label, delay: t.delay }));
    await this.playSegs(a.segs, a.label);
  },
  async playSegs(segs, label) {
    if (!segs.length) { toast('У объявления нет звуков'); this.onEnded(); return; }
    try {
      AE.ac();
      const u = await AE.url(segs);
      au.src = u; au.volume = S.set.vol; this.nowLabel = label;
      await au.play();
      this.media(label);
    } catch (e) { toast('Ошибка звука: ' + e.message); this.nowLabel = ''; }
    UI.refreshPlayer();
  },
  /** служебное: если что-то играет — после него, иначе сразу */
  svc(sv, delay) {
    const segs = INF.expand(sv.items, { dir: typeof this.dir === 'number' ? this.dir : 0 }, null);
    if (!au.paused && !au.ended && au.src) { this.queue.push({ segs, label: sv.label, delay: delay || 300 }); toast('«' + sv.label + '» — после текущего'); }
    else { this.stop(true); this.playing = 'svc:' + sv.id; this.playSegs(segs, sv.label); }
  },
  onEnded() {
    if (this.queue.length) {
      const q = this.queue.shift();
      this.nowLabel = '⏳ ' + q.label; UI.refreshPlayer();
      this.timer = setTimeout(() => this.playSegs(q.segs, q.label), q.delay || 0);
      return;
    }
    this.playing = null; this.nowLabel = ''; UI.refreshPlayer();
  },
  stop(keep) { clearTimeout(this.timer); this.queue = []; au.pause(); au.removeAttribute('src'); try { au.load(); } catch (e) { } if (!keep) { this.playing = null; this.nowLabel = ''; UI.refreshPlayer(); } },
  replay() { const k = this.playing; const i = this.anns.findIndex(a => a.key === k); if (i >= 0) this.playAnn(i); else if (this.idx > 0) this.playAnn(this.idx - 1); },
  media(label) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: label, artist: this.route ? this.route.name : 'Информатор', album: this.route ? (this.route.line && lineById(this.route.line) ? lineById(this.route.line).name : this.route.lineName || '') : '', artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
    } catch (e) { }
  }
};
au.addEventListener('ended', () => PL.onEnded());
au.addEventListener('timeupdate', () => { const p = $('#prog'); if (p && au.duration) p.style.width = (au.currentTime / au.duration * 100) + '%'; });
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession, set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { } };
  set('play', () => { if (au.src && au.paused && au.currentTime > 0 && !au.ended) au.play(); else PL.go(); });
  set('pause', () => au.pause());
  set('nexttrack', () => PL.go());
  set('previoustrack', () => PL.step(-1));
  set('stop', () => PL.stop());
}
document.addEventListener('keydown', e => {
  if (UI.tab !== 'player' || UI.stack.length || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); PL.go(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') PL.step(1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') PL.step(-1);
  else if (e.key === 'Escape') PL.stop();
});

/* ================= Навигация: вкладки, страницы, листы ================= */
const UI = {
  tab: 'player', stack: [],
  go(tab) { this.tab = tab; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); this.render(); $('#view').scrollTop = 0; },
  render() {
    document.documentElement.style.setProperty('--rc', (PL.route && routeColor(PL.route)) || '#d6083b');
    const v = $('#view'); v.innerHTML = '';
    v.append(({ player: viewPlayer, routes: viewRoutes, bank: viewBank, more: viewMore })[this.tab]());
  },
  refreshPlayer() { if (this.tab === 'player' && !this.stack.length) { const y = $('#view').scrollTop; this.render(); $('#view').scrollTop = y; } else if (this.tab === 'player') this.dirty = true; },
  guard: false,
  push(entry) { this.stack.push(entry); if (!this.guard) { history.pushState({ g: 1 }, ''); this.guard = true; } },
  pop() { const e = this.stack.pop(); if (e) e.close(); this.after(); },
  after() {
    if (!this.stack.length) { const y = $('#view').scrollTop; this.render(); $('#view').scrollTop = y; }
    else { const t = this.stack[this.stack.length - 1]; if (t.reveal) t.reveal(); }
  }
};
// аппаратная кнопка «Назад» на Android закрывает верхний лист/страницу
window.addEventListener('popstate', () => {
  UI.guard = false;
  const e = UI.stack.pop();
  if (e) { e.close(); if (UI.stack.length) { history.pushState({ g: 1 }, ''); UI.guard = true; } UI.after(); }
});
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => UI.go(b.dataset.tab));

/** Полноэкранная страница. build(body, api) — api.re() перерисовывает */
function openPage(title, build, actions) {
  const body = h('div', { class: 'pb' });
  const tt = h('div', { class: 'tt ell' }, title);
  const right = h('div', { class: 'row' });
  const pg = h('div', { class: 'page' }, h('div', { class: 'ph' }, ib('back', () => UI.pop(), 'Назад'), tt, right), body);
  const api = {
    el: pg, body, title: t => tt.textContent = t,
    re() { const y = body.scrollTop; body.innerHTML = ''; right.innerHTML = ''; build(body, api, right); body.scrollTop = y; },
    close: () => UI.pop()
  };
  $('#pages').append(pg);
  UI.push({ close: () => { pg.remove(); if (api.onclose) api.onclose(); }, reveal: () => api.re() });
  api.re();
  return api;
}
/** Нижний лист */
function openSheet(title, build) {
  const body = h('div', { class: 'sbody' });
  const bd = h('div', { class: 'bd', onclick: () => UI.pop() });
  const sh = h('div', { class: 'sheet' }, h('div', { class: 'grab' }), h('div', { class: 'sh' }, h('div', { class: 'tt' }, title), ib('close', () => UI.pop(), 'Закрыть')), body);
  const api = { body, re() { const y = body.scrollTop; body.innerHTML = ''; build(body, api); body.scrollTop = y; }, close: () => UI.pop() };
  $('#sheetwrap').append(bd, sh);
  UI.push({ close: () => { bd.remove(); sh.remove(); if (api.onclose) api.onclose(); } });
  api.re();
  return api;
}
function menu(title, items) {
  openSheet(title, b => {
    b.append(h('div', { class: 'list menu' }, items.filter(Boolean).map(it => h('div', { class: 'li tap', style: it.danger ? { color: '#ff8b8b' } : null, onclick: () => { UI.pop(); setTimeout(it.do, 30); } }, it.label))));
  });
}
function confirmBox(text, yes, label) {
  openSheet('Точно?', b => {
    b.append(h('p', null, text), h('div', { class: 'btns' }, h('button', { class: 'btn danger', onclick: () => { UI.pop(); setTimeout(yes, 30); } }, label || 'Удалить'), h('button', { class: 'btn', onclick: () => UI.pop() }, 'Отмена')));
  });
}
function prompt2(title, value, ok, opts) {
  openSheet(title, b => {
    const inp = h(opts && opts.multi ? 'textarea' : 'input', { type: 'text', value: value || '', placeholder: (opts && opts.ph) || '' });
    if (opts && opts.multi) inp.value = value || '';
    b.append(inp, h('div', { class: 'btns' }, h('button', { class: 'btn pri', onclick: () => { const v = inp.value; UI.pop(); setTimeout(() => ok(v), 30); } }, 'Готово')));
    setTimeout(() => inp.focus(), 250);
  });
}
const sw = (checked, on) => h('label', { class: 'sw', onclick: e => e.stopPropagation() }, h('input', { type: 'checkbox', checked, onchange: e => on(e.target.checked) }), h('i'));

/* ================= Цвета ================= */
const LINE_COLORS = ['#d6083b', '#0078c9', '#009a49', '#ea7125', '#702785', '#1f8f8f', '#8b5a2b', '#5c6bc0', '#c2185b', '#6d8a12', '#7a7f87'];
function guessColor(line, type) {
  const m = /\((\d)\)/.exec(line || '');
  if (m && /метро/i.test(type || '')) return LINE_COLORS[(+m[1] - 1) % 5];
  if (m) return LINE_COLORS[(+m[1] - 1) % 5];
  if (/электрич|пригород|ж\/д/i.test(type || '')) return '#1f8f8f';
  if (/трамв/i.test(type || '')) return '#c2185b';
  if (/троллейб/i.test(type || '')) return '#0078c9';
  if (/автоб/i.test(type || '')) return '#6d8a12';
  return '#d6083b';
}
function routeColor(r) { if (r.mode === 'build') { const l = lineById(r.line); return r.color || (l && l.color) || '#d6083b'; } return r.color || '#d6083b'; }
function routeMeta(r) {
  if (r.mode === 'build') { const l = lineById(r.line); return [r.city || (l && l.city), r.type || (l && l.type), l && l.name].filter(Boolean).join(' · '); }
  return [r.city, r.type, r.line].filter(Boolean).join(' · ');
}

/* ================= Пульт ================= */
function viewPlayer() {
  if (UI.dirty) UI.dirty = false;
  const R = PL.route;
  const root = h('div');
  if (!R) {
    root.append(h('h1', null, 'Информатор'), h('div', { class: 'card empty' }, h('b', null, 'Маршрутов пока нет'),
      'Импортируй пакеты старого Информатора (.zip) или собери свой маршрут.',
      h('div', { class: 'btns', style: { justifyContent: 'center', marginTop: '16px' } },
        h('button', { class: 'btn pri', onclick: () => pickImport() }, ic('upload'), 'Импорт пакетов'),
        h('button', { class: 'btn', onclick: () => UI.go('routes') }, 'Собрать маршрут'))));
    return root;
  }
  const dn = INF.dirNames(R, S.lines);
  root.append(h('div', { class: 'rhead' }, h('div', { class: 'stripe' }),
    h('button', { class: 'rsel', onclick: chooseRoute }, h('div', { class: 't' }, R.name, ' ▾'), h('div', { class: 's' }, routeMeta(R) || 'маршрут')),
    ib('edit', () => editRoute(R), 'Редактировать')));
  if (dn.length) {
    const seg = h('div', { class: 'seg' });
    dn.forEach(d => seg.append(h('button', { class: PL.dir === d.id ? 'on' : '', onclick: () => PL.setDir(d.id) }, d.short + (d.ring ? '' : ' → ' + d.title))));
    if (dn.length > 1) seg.append(h('button', { class: PL.dir === 'ring' ? 'on' : '', onclick: () => PL.setDir('ring'), style: { flex: '0 0 auto', padding: '9px 12px' } }, '↻ Кольцом'));
    root.append(seg);
  }
  const nextI = PL.nextPlayable(PL.idx);
  const na = PL.anns[nextI];
  const now = h('div', { class: 'now' },
    h('div', { class: 'k' }, na ? 'Следующее объявление' : (PL.anns.length ? 'Маршрут окончен' : 'Нет объявлений')),
    h('div', { class: 'lbl' }, na ? na.label : (PL.anns.length ? '—' : 'Проверь маршрут в редакторе')),
    na && na.sub ? h('div', { class: 'sub' }, na.sub, na.extra ? ' · + ' + na.extra.join(', ') : '') : null,
    PL.nowLabel ? h('div', { class: 'playing' }, h('span', { class: 'eq' }, h('i'), h('i'), h('i')), h('span', { class: 'ell' }, PL.nowLabel)) : null,
    h('div', { class: 'prog', id: 'prog' }));
  root.append(now);
  root.append(h('div', { class: 'ctrl' },
    h('button', { onclick: () => PL.step(-1), 'aria-label': 'Назад' }, ic('prev')),
    h('button', { class: 'go', onclick: () => PL.go(), 'aria-label': 'Объявить' }, ic('play')),
    h('button', { onclick: () => PL.step(1), 'aria-label': 'Пропустить' }, ic('next'))));
  root.append(h('div', { class: 'ctrl2' },
    h('button', { onclick: () => PL.stop() }, ic('stop'), 'Стоп'),
    h('button', { onclick: () => PL.replay() }, ic('repeat'), 'Повтор'),
    h('button', { onclick: () => { PL.idx = 0; PL.savePos(); UI.refreshPlayer(); } }, ic('swap'), 'В начало')));
  // регулярные: переключатели на ходу (+ «про следующий поезд» на укороченном рейсе)
  const trimmedNow = R.mode === 'build' && R.trim && Object.keys(R.trim).length;
  if ((R.rules && R.rules.length) || trimmedNow) {
    root.append(h('div', { class: 'chips' }, trimmedNow ? h('button', { class: 'chip' + (R.nextFull !== false ? ' on' : ''), onclick: () => { R.nextFull = R.nextFull === false; save(); PL.rebuild(); UI.refreshPlayer(); } }, h('span', { class: 'dot' }), 'Про следующий поезд') : null, (R.rules || []).map(r => h('button', { class: 'chip' + (r.enabled ? ' on' : ''), onclick: () => { r.enabled = !r.enabled; save(); PL.rebuild(); UI.refreshPlayer(); } }, h('span', { class: 'dot' }), r.name))));
  }
  // служебные кнопки
  if (S.service.length) {
    root.append(h('h2', null, 'Служебные'), h('div', { class: 'qgrid' }, S.service.map(sv => {
      const b = h('button', { class: 'qbtn', onclick: () => PL.svc(sv) }, sv.label);
      longPress(b, () => menu(sv.label, [{ label: '▶ Сейчас (прервать)', do: () => { PL.stop(true); PL.playing = 'svc'; PL.playSegs(INF.expand(sv.items, { dir: 0 }), sv.label); } }, { label: '✎ Изменить', do: () => editService(sv) }]));
      return b;
    })));
  }
  // схема
  root.append(h('h2', { class: 'row' }, h('span', { class: 'grow' }, 'Объявления'), h('button', { class: 'btn sm', onclick: () => stopsSheet(R) }, '⊘ Станции и конечные')));
  const diag = h('div', { class: 'diag' });
  PL.anns.forEach((a, i) => {
    if (a.passes && a.passes.length) {
      // проезжаемые без остановки — после объявления об отправлении
    }
    // уже объявленные — бледнее; текущее (звучит или прозвучало последним) — рамка; следующее — рамка с уголком ▶
    const curKey = PL.playing || PL.lastKey;
    const isCur = a.key === curKey, isNext = i === nextI && !isCur;
    const past = !isCur && !isNext && nextI >= 0 && i < nextI;
    const cls = ['an', a.kind, a.off ? 'off' : '', isCur ? 'cur' : '', isNext ? 'nxt' : '', past ? 'past' : '', PL.playing === a.key ? 'play' : ''].join(' ');
    const row = h('div', { class: cls },
      h('div', { class: 'rail' }, h('div', { class: 'mk' })),
      h('div', { class: 'body', onclick: () => { PL.idx = i; PL.savePos(); UI.refreshPlayer(); } },
        h('div', { class: 'tt' }, h('div', { class: 'lb ell' }, a.label),
          (a.sub || a.extra || a.then || a.warn.length) ? h('div', { class: 'sb ell' }, [a.sub, a.extra ? '+ ' + a.extra.join(', ') : '', a.then ? '→ ' + a.then.map(t => t.label).join(', ') : ''].filter(Boolean).join(' · '), a.warn.length ? h('span', { class: 'badge w', style: { marginLeft: '6px' } }, '⚠ ' + a.warn.length) : null) : null),
        h('button', { class: 'ib', onclick: e => { e.stopPropagation(); PL.idx = i + 1; if (PL.idx >= PL.anns.length && PL.isRing()) PL.idx = 0; PL.savePos(); PL.playAnn(i); }, 'aria-label': 'Играть' }, ic('play'))));
    longPress(row, () => annMenu(a, i));
    diag.append(row);
    if (a.passes && a.passes.length) a.passes.forEach(p => diag.append(h('div', { class: 'pass' }, h('div', { class: 'rail' }, h('i')), h('span', null, p, ' — без остановки'))));
  });
  root.append(diag);
  if (!PL.anns.length) root.append(h('div', { class: 'card empty' }, 'В этом направлении нет объявлений. Открой редактор маршрута (✎).'));
  setTimeout(() => { const c = $('.an.nxt') || $('.an.cur'); if (c && UI.scrollCur) { c.scrollIntoView({ block: 'center' }); UI.scrollCur = false; } }, 0);
  return root;
}
function longPress(el, fn) {
  let t = 0, x = 0, y = 0;
  el.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; t = setTimeout(() => { t = 0; el._lp = true; fn(); }, 520); });
  const cancel = () => { clearTimeout(t); t = 0; };
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 10) cancel(); });
  el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel);
  el.addEventListener('click', e => { if (el._lp) { el._lp = false; e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
function annMenu(a, i) {
  const R = PL.route;
  const items = [
    { label: '▶ Объявить сейчас', do: () => { PL.idx = i + 1; PL.savePos(); PL.playAnn(i); } },
    { label: '⇥ Сделать следующим', do: () => { PL.idx = i; PL.savePos(); UI.refreshPlayer(); } },
    a.kind !== 'svc' ? { label: '＋ Служебное после этого объявления…', do: () => editInsert(R, { after: a.k, dir: a.dir }) } : null,
  ];
  (R.inserts || []).filter(x => x.after === a.k).forEach(x => { const sv = svcById(x.svc); items.push({ label: '✎ Привязка: ' + (sv ? sv.label : '?'), do: () => editInsert(R, x) }); });
  if (a.ins) items.push({ label: '✎ Привязка служебного', do: () => editInsert(R, a.ins) });
  if (R.mode === 'list' && a.src) items.push({ label: a.src.off ? '✓ Включить объявление' : '⊘ Пропускать это объявление', do: () => { a.src.off = !a.src.off; save(); PL.rebuild(); UI.refreshPlayer(); } });
  if (R.mode === 'build' && (a.kind === 'arr') && a.k) {
    const eid = a.k.split(':')[1], e = (R.path || []).find(x => x.id === eid);
    if (e && !e.term) items.push({ label: '⊘ Проезжать «' + a.ctx.cur.name + '» без остановки', do: () => { e.skip = true; save(); PL.rebuild(); UI.refreshPlayer(); toast('Теперь без остановки'); } });
  }
  if (a.warn.length) items.push({ label: '⚠ Что не так: ' + a.warn.slice(0, 3).join('; '), do: () => editRoute(R) });
  menu(a.label, items);
}
/** Быстрая настройка: какие станции проезжаем без остановки. Объявления перестраиваются сами. */
function stopsSheet(R) {
  if (R.mode === 'list') {
    const done = S.routes.find(x => x.from === R.id);
    openSheet('Станции и конечные', b => {
      b.append(h('p', null, 'Этот маршрут импортирован списком готовых объявлений, в нём можно только выключать отдельные записи.'),
        h('p', null, 'Чтобы исключать именно станции, а объявления перестраивались сами («следующая станция» перескакивает через пропуск, добавляется «…проследует без остановки», в электричке — «кроме…»), нужен маршрут по станциям. Программа соберёт его из этого списка: распознает станции и шаблоны объявлений.'),
        h('p', { class: 'dim small' }, 'Исходный маршрут-список останется как был.'),
        done ? h('button', { class: 'btn wide', style: { marginBottom: '8px' }, onclick: () => { UI.pop(); PL.setRoute(done.id); UI.render(); setTimeout(() => stopsSheet(done), 50); } }, 'Открыть уже собранный «' + done.name + '»') : null,
        h('button', { class: 'btn pri wide', onclick: () => { const nr = makeBuildFromList(R); if (!nr) return; UI.pop(); PL.setRoute(nr.id); UI.render(); toast('Собран маршрут по станциям'); setTimeout(() => stopsSheet(nr), 50); } }, 'Собрать маршрут по станциям'));
    });
    return;
  }
  const line = lineById(R.line); if (!line) return;
  const ui = stopsSheet.ui || (stopsSheet.ui = { both: true });
  const R2 = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  // укороченный рейс: kind 'from' | 'to'; в обе стороны — зеркально в других направлениях
  const setTrim = (di, kind, x) => {
    const dirs = INF.routeDirs(Object.assign({}, R, { trim: {} }), line);
    R.trim = R.trim || {};
    const put = (k, kd, e) => {
      const full = dirs[k].full, i = full.findIndex(y => y.e === e);
      const t = R.trim[k] = R.trim[k] || {};
      if (i < 0) return;
      if ((kd === 'from' && i === 0) || (kd === 'to' && i === full.length - 1)) delete t[kd]; else t[kd] = e.id;
      if (!t.from && !t.to) delete R.trim[k];
    };
    put(di, kind, x.e);
    if (ui.both) dirs.forEach((d, k) => {
      if (k === di) return;
      const m = d.full.find(y => y.e.st === x.e.st);
      if (m) put(k, kind === 'to' ? 'from' : 'to', m.e);
    });
    save(); PL.rebuild(); UI.refreshPlayer();
  };
  openSheet('Станции и конечные', (b, api) => {
    b.append(h('div', { class: 'seg', style: { marginBottom: '6px' } }, [[true, 'в обе стороны'], [false, 'только в этом направлении']].map(([v, t]) => h('button', { class: ui.both === v ? 'on' : '', onclick: () => { ui.both = v; api.re(); } }, t))));
    b.append(h('div', { class: 'tiny dim', style: { margin: '0 2px 4px' } }, 'Тумблер — останавливаться или проезжать. Тап по названию — сделать конечной или начальной (укороченный рейс).'));
    const dirs = INF.routeDirs(R, line);
    dirs.forEach((d, di) => {
      const inSeq = new Map(d.seq.map((x, i) => [x.e, i]));
      const full = d.ring ? d.seq : d.full;
      b.append(h('h2', { class: 'row' }, h('span', { class: 'grow' }, d.ring ? '↻ Кольцевой' : R2[di] + ' → ' + d.seq[d.seq.length - 1].st.name),
        d.trimmed ? h('button', { class: 'btn sm ghost', onclick: () => { delete R.trim[di]; if (ui.both) R.trim = {}; save(); PL.rebuild(); api.re(); } }, '✕ весь маршрут') : null));
      b.append(h('div', { class: 'list' }, full.map(x => {
        const i = inSeq.has(x.e) ? inSeq.get(x.e) : -1;
        const out = !d.ring && i < 0;
        const end = !d.ring && (i === 0 || i === d.seq.length - 1);
        const skip = !out && !end && x.e.skip;
        return h('div', { class: 'li', style: { minHeight: '46px', padding: '6px 14px', opacity: out ? .38 : 1 } },
          h('div', { class: 'grow', style: { cursor: d.ring ? 'default' : 'pointer' }, onclick: d.ring ? null : () => menu(x.st.name, [
            { label: '⤓ Конечная здесь — рейс до «' + x.st.name + '»', do: () => { setTrim(di, 'to', x); api.re(); } },
            { label: '⤒ Начало рейса здесь', do: () => { setTrim(di, 'from', x); api.re(); } }]) },
            h('div', { class: 'ell', style: { textDecoration: skip ? 'line-through' : '', opacity: skip ? .5 : 1 } }, x.st.name),
            out ? h('div', { class: 'tiny dim' }, 'рейс сюда не идёт') : end ? h('div', { class: 'tiny', style: { color: 'var(--rc)' } }, i === 0 ? 'начальная' : 'конечная') : null),
          out || end ? null : sw(!x.e.skip, v => {
            const targets = ui.both ? (R.path || []).filter(e => e.st === x.e.st && !e.term) : [x.e];
            targets.forEach(e => e.skip = !v);
            save(); PL.rebuild(); api.re();
          }));
      })));
    });
    b.append(h('div', { class: 'dim tiny', style: { marginTop: '10px' } }, 'Объявления перестраиваются сами: «следующая станция», «до станции …», «кроме…», проезд без остановки. Шаблоны — в линии.'));
  });
}
function chooseRoute() {
  openSheet('Маршрут', b => {
    const groups = new Map();
    S.routes.forEach(r => { const g = routeMeta(r).split(' · ').slice(0, 2).join(' · ') || 'Без группы'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
    for (const [g, rs] of groups) {
      b.append(h('h2', null, g), h('div', { class: 'list' }, rs.map(r => h('div', { class: 'li tap', onclick: () => { UI.pop(); PL.setRoute(r.id); UI.scrollCur = true; UI.render(); } },
        h('div', { class: 'swatch', style: { background: routeColor(r), width: '14px', height: '14px' } }),
        h('div', { class: 'grow' }, h('div', { class: 'ell', style: { fontWeight: r.id === S.set.route ? 700 : 500 } }, r.name), h('div', { class: 'tiny dim ell' }, routeMeta(r)))))));
    }
  });
}

/* ================= Импорт ================= */
function pickImport() { const f = $('#fileIn'); f.accept = '.zip,.cfg,audio/*,.mp3,.wav,.ogg'; f.onchange = () => { const fl = [...f.files]; f.value = ''; if (fl.length) importFiles(fl); }; f.click(); }
const mimeOf = n => /\.mp3$/i.test(n) ? 'audio/mpeg' : /\.wav$/i.test(n) ? 'audio/wav' : /\.og[ga]$/i.test(n) ? 'audio/ogg' : /\.m4a$/i.test(n) ? 'audio/mp4' : 'application/octet-stream';
async function addClipBlob(packId, name, blob, extra) {
  const id = INF.uid();
  await DB.put('blobs', id, blob);
  S.clips[id] = Object.assign({ id, name, pack: packId, blob: id }, extra || {});
  return id;
}
async function importFiles(files) {
  const job = { packs: 0, clips: 0, routes: 0, skipped: 0, pending: [], errors: [] };
  const busy = openBusy('Импорт…');
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    const loose = [], cfgs = [];
    for (const f of files) {
      busy.set(f.name);
      if (/\.zip$/i.test(f.name)) await importZip(INF.stem(f.name), new Uint8Array(await f.arrayBuffer()), job, 0, busy);
      else if (INF.isAudio(f.name)) loose.push(f);
      else if (/\.cfg$/i.test(f.name)) cfgs.push(f);
    }
    const local = new Map();
    if (loose.length) {
      const pack = { id: INF.uid(), name: 'Файлы ' + new Date().toLocaleDateString('ru') };
      S.packs.push(pack); job.packs++;
      for (const f of loose) { const id = await addClipBlob(pack.id, f.name, f.slice(0, f.size, f.type || mimeOf(f.name))); local.set(f.name.toLowerCase(), id); job.clips++; }
    }
    for (const f of cfgs) job.pending.push({ cfg: INF.parseCfg(INF.decodeText(new Uint8Array(await f.arrayBuffer()))), file: f.name, local });
    finishCfgs(job);
    await DB.put('kv', 'state', S);
  } catch (e) { job.errors.push(e.message); }
  UI.pop();
  PL.load(); UI.render();
  openSheet('Импорт завершён', b => {
    b.append(h('div', { class: 'card' },
      h('div', null, 'Новых пакетов звуков: ', h('b', null, job.packs), ' (звуков: ', job.clips, ')'),
      h('div', null, 'Новых маршрутов: ', h('b', null, job.routes)),
      job.skipped ? h('div', { class: 'dim small' }, 'Уже были и пропущены: ', job.skipped) : null,
      job.errors.length ? h('div', { class: 'warnbox' }, job.errors.slice(0, 5).join('\n')) : null),
      h('button', { class: 'btn pri wide', onclick: () => { UI.pop(); UI.go('player'); } }, 'К пульту'));
  });
}
async function importZip(name, u8, job, depth, busy) {
  const ents = INF.readZip(u8);
  if (ents.some(e => e.name === 'informator.json')) return importBackup(ents, job);
  const groups = new Map(), local = new Map();
  for (const e of ents) if (!e.dir && INF.isAudio(e.name)) { const d = INF.dirName(e.name); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(e); }
  for (const [d, list] of groups) {
    const pname = name + (d ? ' / ' + d.split('/').slice(-2).join(' / ') : '');
    const sig = list.map(e => INF.baseName(e.name).toLowerCase() + ':' + e.size).sort().join('|');
    let pack = S.packs.find(p => p.name === pname || p.sig === sig);
    if (pack) { Object.values(S.clips).filter(c => c.pack === pack.id).forEach(c => local.set(c.name.toLowerCase(), c.id)); job.skipped++; continue; }
    pack = { id: INF.uid(), name: pname, sig }; S.packs.push(pack); job.packs++;
    for (const e of list) {
      busy && busy.set(pname + ': ' + INF.baseName(e.name));
      const data = await e.read();
      const id = await addClipBlob(pack.id, INF.baseName(e.name), new Blob([data], { type: mimeOf(e.name) }));
      local.set(INF.baseName(e.name).toLowerCase(), id); job.clips++;
    }
  }
  for (const e of ents) if (!e.dir && /\.cfg$/i.test(e.name)) job.pending.push({ cfg: INF.parseCfg(INF.decodeText(await e.read())), file: INF.baseName(e.name), local });
  if (depth < 3) for (const e of ents) if (!e.dir && /\.zip$/i.test(e.name)) {
    try { await importZip(INF.stem(e.name), await e.read(), job, depth + 1, busy); } catch (er) { job.errors.push(e.name + ': ' + er.message); }
  }
}
function finishCfgs(job) {
  const global = new Map();
  Object.values(S.clips).forEach(c => { const k = c.name.toLowerCase(); if (!global.has(k)) global.set(k, c.id); });
  for (const p of job.pending) {
    const c = p.cfg;
    if (!c.dirs[0].length || c.dirs.flat().some(a => a.files.some(f => f.includes('*')))) continue; // Config.cfg, Example.cfg
    let name = c.ziel || INF.stem(p.file);
    if (S.routes.some(r => r.mode === 'list' && r.src === p.file && (r.ziel || r.name) === name)) { job.skipped++; continue; }
    const ziel = name;
    if (S.routes.some(r => r.name === name)) name += ' (' + INF.stem(p.file) + ')';
    const dirs = c.dirs.filter((d, i) => i === 0 || d.length).map(d => d.map(a => ({ id: INF.uid(), name: a.name, off: false, items: a.files.map(f => { const k = INF.baseName(f).toLowerCase(); const id = p.local.get(k) || global.get(k); return id ? { c: id } : { miss: f }; }) })));
    S.routes.push({ id: INF.uid(), mode: 'list', name, city: c.city, type: c.type, line: c.line, color: guessColor(c.line, c.type), circle: c.circle, dirs, rules: [], inserts: [], src: p.file, ziel });
    job.routes++;
  }
}
function openBusy(title) {
  let msg;
  openSheet(title, b => { msg = h('div', { class: 'dim small ell' }, '…'); b.append(h('div', { class: 'prog2' }, h('i', { style: { width: '100%', opacity: .5 } })), msg); });
  return { set: t => { if (msg) msg.textContent = t; } };
}

/* ================= Резервная копия и обмен ================= */
async function exportData(filter, fname) {
  const busy = openBusy('Упаковка…');
  try {
    const st = filter ? filter() : JSON.parse(JSON.stringify(S));
    const blobIds = new Set(Object.values(st.clips).map(c => c.blob));
    const files = [{ name: 'informator.json', data: new TextEncoder().encode(JSON.stringify({ format: 'informator-pwa', version: 1, ...st })) }];
    for (const id of blobIds) { const b = await DB.get('blobs', id); if (b) files.push({ name: 'blobs/' + id, data: new Uint8Array(await b.arrayBuffer()) }); busy.set(files.length + ' / ' + (blobIds.size + 1)); }
    const z = INF.writeZip(files);
    UI.pop();
    const a = h('a', { href: URL.createObjectURL(z), download: fname || 'informator-backup.zip' }); document.body.append(a); a.click(); a.remove();
    toast('Файл сохранён в «Загрузки»');
  } catch (e) { UI.pop(); toast('Ошибка: ' + e.message); }
}
function exportRoute(r) {
  exportData(() => {
    const st = { packs: [], clips: {}, lines: [], routes: [JSON.parse(JSON.stringify(r))], service: [] };
    const used = new Set();
    const walk = items => (items || []).forEach(it => { if (it.c) used.add(it.c); });
    if (r.mode === 'list') r.dirs.forEach(d => d.forEach(a => walk(a.items)));
    else { const l = lineById(r.line); if (l) { st.lines.push(JSON.parse(JSON.stringify(l))); l.stations.forEach(s => Object.values(s.clips || {}).forEach(c => used.add(c))); Object.values(l.phrases || {}).forEach(p => p.clip && used.add(p.clip)); } }
    (r.rules || []).forEach(x => x.variants.forEach(walk));
    (r.inserts || []).forEach(x => { const sv = svcById(x.svc); if (sv && !st.service.includes(sv)) { st.service.push(JSON.parse(JSON.stringify(sv))); walk(sv.items); } });
    for (const id of used) if (S.clips[id]) st.clips[id] = S.clips[id];
    const pk = new Set(Object.values(st.clips).map(c => c.pack));
    st.packs = S.packs.filter(p => pk.has(p.id));
    return st;
  }, (r.name.replace(/[\\/:*?"<>|]+/g, '_')) + '.informator.zip');
}
async function importBackup(ents, job) {
  const j = JSON.parse(INF.decodeText(await ents.find(e => e.name === 'informator.json').read()));
  const blobs = new Map(ents.filter(e => e.name.startsWith('blobs/')).map(e => [e.name.slice(6), e]));
  for (const p of j.packs || []) if (!S.packs.some(x => x.id === p.id)) { S.packs.push(p); job.packs++; }
  for (const id in j.clips || {}) if (!S.clips[id]) {
    const c = j.clips[id];
    if (!(await DB.get('blobs', c.blob)) && blobs.has(c.blob)) await DB.put('blobs', c.blob, new Blob([await blobs.get(c.blob).read()], { type: mimeOf(c.name) }));
    S.clips[id] = c; job.clips++;
  }
  for (const l of j.lines || []) if (!S.lines.some(x => x.id === l.id)) S.lines.push(l);
  for (const s of j.service || []) if (!S.service.some(x => x.id === s.id)) S.service.push(s);
  for (const r of j.routes || []) if (!S.routes.some(x => x.id === r.id)) { S.routes.push(r); job.routes++; } else job.skipped++;
  if (j.set && !S.routes.length) Object.assign(S.set, j.set);
}

/* ================= Вкладка «Звуки» ================= */
const bankUI = { q: '', open: new Set() };
function viewBank() {
  const root = h('div');
  root.append(h('h1', null, 'Звуки'));
  root.append(h('div', { class: 'btns' },
    h('button', { class: 'btn pri', onclick: pickImport }, ic('upload'), 'Импорт'),
    h('button', { class: 'btn', onclick: () => openSlicer() }, ic('cut'), 'Нарезать запись')));
  root.append(h('div', { class: 'dim small', style: { margin: '0 2px 10px' } }, 'Импорт понимает пакеты старого Информатора (.zip с .cfg внутри, даже вложенные), отдельные .cfg, аудиофайлы и резервные копии этой программы.'));
  const q = h('input', { type: 'search', placeholder: 'Поиск звука…', value: bankUI.q, oninput: e => { bankUI.q = e.target.value; draw(); } });
  root.append(q);
  const box = h('div');
  root.append(box);
  const draw = () => {
    box.innerHTML = '';
    const qq = bankUI.q.trim().toLowerCase();
    if (!S.packs.length) { box.append(h('div', { class: 'card empty', style: { marginTop: '12px' } }, h('b', null, 'Пусто'), 'Импортируй пакеты или нарежь свою запись.')); return; }
    for (const p of S.packs) {
      const clips = Object.values(S.clips).filter(c => c.pack === p.id && (!qq || c.name.toLowerCase().includes(qq)));
      if (qq && !clips.length) continue;
      const open = bankUI.open.has(p.id) || !!qq;
      box.append(h('h2', { class: 'row', style: { cursor: 'pointer' }, onclick: () => { open ? bankUI.open.delete(p.id) : bankUI.open.add(p.id); draw(); } },
        h('span', { class: 'grow ell' }, (open ? '▾ ' : '▸ ') + p.name), h('span', { class: 'badge' }, clips.length),
        ib('more', () => menu(p.name, [{ label: 'Переименовать', do: () => prompt2('Название пакета', p.name, v => { if (v.trim()) { p.name = v.trim(); save(); UI.render(); } }) }, { label: 'Удалить пакет со звуками', danger: 1, do: () => confirmBox('Удалить «' + p.name + '» и все его звуки? Маршруты, где они используются, станут без звука.', () => deletePack(p)) }]))));
      if (open) box.append(h('div', { class: 'list' }, clips.map(c => clipRow(c))));
    }
  };
  draw();
  return root;
}
function clipRow(c, onPick) {
  return h('div', { class: 'li' + (onPick ? ' tap' : ''), onclick: onPick ? () => onPick(c) : null },
    ib('play', () => AE.preview([{ c: c.id }]), 'Слушать'),
    h('div', { class: 'grow' }, h('div', { class: 'ell' }, INF.stem(c.name)), h('div', { class: 'tiny dim' }, [c.start != null ? 'нарезка' : '', c.dur ? fmtT(c.dur) : ''].filter(Boolean).join(' · '))),
    onPick ? null : ib('more', () => menu(INF.stem(c.name), [
      { label: '✂ Нарезать на кусочки', do: () => openSlicer(c.id) },
      { label: 'Переименовать', do: () => prompt2('Название звука', INF.stem(c.name), v => { if (v.trim()) { c.name = v.trim() + (/\.[a-z0-9]+$/i.exec(c.name) || [''])[0]; save(); UI.render(); } }) },
      { label: 'Удалить', danger: 1, do: () => confirmBox('Удалить звук «' + INF.stem(c.name) + '»?', () => { delete S.clips[c.id]; gcBlobs(); save(); UI.render(); }) }])));
}
async function deletePack(p) {
  for (const c of Object.values(S.clips)) if (c.pack === p.id) delete S.clips[c.id];
  S.packs = S.packs.filter(x => x !== p);
  await gcBlobs(); save(); UI.render();
}
async function gcBlobs() {
  const used = new Set(Object.values(S.clips).map(c => c.blob));
  for (const k of await DB.keys('blobs')) if (!used.has(k)) { await DB.del('blobs', k); AE.cache.delete(k); }
}

/* ================= Вкладка «Ещё» ================= */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function viewMore() {
  const root = h('div');
  root.append(h('h1', null, 'Ещё'));
  root.append(h('div', { class: 'card' },
    h('label', { class: 'f' }, h('span', null, 'Громкость'), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: S.set.vol, oninput: e => { S.set.vol = +e.target.value; au.volume = S.set.vol; save(); } })),
    h('label', { class: 'f' }, h('span', null, 'Пауза между звуками внутри объявления: ', h('b', { id: 'gapv' }, (S.set.gap || 0) + ' мс')),
      h('input', { type: 'range', min: 0, max: 600, step: 20, value: S.set.gap || 0, oninput: e => { S.set.gap = +e.target.value; $('#gapv').textContent = S.set.gap + ' мс'; save(); } }))));
  if (installEvt) root.append(h('button', { class: 'btn pri wide', onclick: async () => { installEvt.prompt(); installEvt = null; } }, 'Установить как приложение'));
  root.append(h('h2', null, 'Данные'));
  const est = h('div', { class: 'dim small' }, '…');
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(x => { est.textContent = 'Занято: ' + (x.usage / 1048576).toFixed(1) + ' МБ из доступных ' + (x.quota / 1073741824).toFixed(1) + ' ГБ'; });
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => est.append(p ? ' · защищено от автоочистки' : ' · браузер может очистить при нехватке места'));
  root.append(h('div', { class: 'card' }, est,
    h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => exportData(null, 'informator-backup-' + new Date().toISOString().slice(0, 10) + '.zip') }, 'Резервная копия'),
      h('button', { class: 'btn', onclick: pickImport }, 'Восстановить / импорт')),
    h('div', { class: 'dim tiny' }, 'Всё хранится только на этом устройстве. Резервная копия — zip, который можно открыть импортом на другом телефоне.')));
  root.append(h('h2', null, 'Как пользоваться'));
  root.append(h('div', { class: 'card help' },
    h('p', null, h('b', null, 'Пульт. '), 'Большая кнопка ▶ объявляет следующее и сдвигает указатель — как «>» в старом Информаторе. ⏮ ⏭ двигают указатель без звука. Тап по строке — сделать её следующей, ▶ справа — объявить сразу, долгое нажатие — меню (служебное после, без остановки…).'),
    h('p', null, h('b', null, 'Экран блокировки и гарнитура. '), 'Кнопка «следующий трек» объявляет следующее, «предыдущий» — шаг назад.'),
    h('p', null, h('b', null, 'Линия '), '— справочник остановок со звуками названий, фразами и шаблонами объявлений. ', h('b', null, 'Маршрут '), '— кольцо остановок по линии: отметки «конечная» делят его на направления. ', h('b', null, 'Регулярные '), '— добавки к каждой N-й остановке (их можно включать на ходу). ', h('b', null, 'Служебные '), '— отдельные сообщения: кнопкой в пульте или с привязкой «после объявления».'),
    h('p', { class: 'dim small' }, 'Версия ' + APP_VERSION + '. Основано на «Информаторе» (ista011, 2015; alTerr, 2018) — формат пакетов .zip/.cfg поддерживается как есть.')));
  root.append(h('button', { class: 'btn danger wide', style: { marginTop: '20px' }, onclick: () => confirmBox('Стереть все маршруты, линии и звуки с этого устройства?', async () => { for (const k of await DB.keys('blobs')) await DB.del('blobs', k); S = DEF(); await DB.put('kv', 'state', S); PL.load(); UI.go('player'); }, 'Стереть всё') }, 'Стереть всё'));
  return root;
}

/* ================= Старт ================= */
(async function start() {
  try { await DB.open(); S = (await DB.get('kv', 'state')) || DEF(); }
  catch (e) { S = DEF(); toast('Хранилище недоступно: ' + e.message, 5000); }
  S = Object.assign(DEF(), S); S.set = Object.assign(DEF().set, S.set);
  if (S.lines.map(l => INF.migrateLine(l)).some(Boolean)) save();
  PL.load(); UI.scrollCur = true; UI.render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // новая версия приложения → один раз перезагрузить страницу
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
  }
})();
