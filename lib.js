/* Информатор — библиотека без интерфейса: zip, cfg, сборка объявлений, звук.
   Работает и в браузере, и в Node (для тестов). */
(function (G) {
  'use strict';
  const INF = {};

  /* ---------- мелочи ---------- */
  INF.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const AUDIO_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;
  INF.isAudio = n => AUDIO_RE.test(n);
  INF.baseName = p => p.split(/[\\/]/).pop();
  INF.dirName = p => { const i = p.replace(/\\/g, '/').lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  INF.stem = n => INF.baseName(n).replace(/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|cfg|zip|txt)$/i, '');

  INF.decodeText = function (u8) {
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
    catch (e) { return new TextDecoder('windows-1251').decode(u8); }
  };

  /* ---------- CRC32 ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  INF.crc32 = function (u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  /* ---------- чтение zip ---------- */
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  function zipName(bytes, flags, extra) {
    if (flags & 0x800) return new TextDecoder('utf-8').decode(bytes);
    // поле Info-ZIP Unicode Path
    for (let p = 0; p + 4 <= extra.length;) {
      const id = extra[p] | extra[p + 1] << 8, len = extra[p + 2] | extra[p + 3] << 8;
      if (id === 0x7075 && len > 5) return new TextDecoder('utf-8').decode(extra.subarray(p + 9, p + 4 + len));
      p += 4 + len;
    }
    let ascii = true; for (const b of bytes) if (b > 127) { ascii = false; break; }
    if (ascii) return new TextDecoder('utf-8').decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('ibm866').decode(bytes); }
  }
  /** buf: ArrayBuffer|Uint8Array → [{name, size, dir, read(): Promise<Uint8Array>}] */
  INF.readZip = function (buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Это не zip-архив');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Повреждённый zip');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const loc = dv.getUint32(p + 42, true);
      const name = zipName(u8.subarray(p + 46, p + 46 + nlen), flags, u8.subarray(p + 46 + nlen, p + 46 + nlen + elen)).replace(/\\/g, '/');
      p += 46 + nlen + elen + clen;
      out.push({
        name, size: usize, dir: name.endsWith('/'), encrypted: !!(flags & 1),
        read: async () => {
          if (flags & 1) throw new Error('Файл в архиве зашифрован: ' + name);
          const ln = dv.getUint16(loc + 26, true), le = dv.getUint16(loc + 28, true);
          const data = u8.subarray(loc + 30 + ln + le, loc + 30 + ln + le + csize);
          if (method === 0) return data.slice();
          if (method === 8) return inflateRaw(data);
          throw new Error('Неподдерживаемое сжатие в ' + name);
        }
      });
    }
    return out;
  };

  /* ---------- запись zip (без сжатия) ---------- */
  /** files: [{name, data: Uint8Array}] → Blob */
  INF.writeZip = function (files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    for (const f of files) {
      const nb = enc.encode(f.name), crc = INF.crc32(f.data), n = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
      h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
      c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nb.length, true);
      c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nb);
      off += 30 + nb.length + n;
    }
    const csz = central.reduce((s, a) => s + a.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csz, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  };

  /* ---------- формат .cfg оригинального Информатора ---------- */
  INF.parseCfg = function (text) {
    const r = { city: '', type: '', line: '', ziel: '', circle: false, dirs: [[], []] };
    let sec = '';
    for (let raw of text.split(/\r?\n/)) {
      const s = raw.trim();
      if (!s || s.startsWith(';')) continue;
      if (s.startsWith('[') && s.endsWith(']')) { sec = s.slice(1, -1).trim().toLowerCase(); continue; }
      if (sec === '1' || sec === '2') {
        let name = '', files = s;
        const b = s.lastIndexOf('[');
        if (b > 0 && s.endsWith(']')) { name = s.slice(b + 1, -1).trim(); files = s.slice(0, b); }
        const list = files.split('+').map(x => x.trim()).filter(Boolean);
        if (!list.length) continue;
        r.dirs[+sec - 1].push({ name: name || list.map(INF.stem).join(' + '), files: list });
        continue;
      }
      const eq = s.indexOf('=');
      if (eq < 0) continue;
      const k = s.slice(0, eq).trim().toLowerCase(), v = s.slice(eq + 1).trim();
      if (sec === 'city' && k === 'name') r.city = v;
      else if (sec === 'type' && k === 'type') r.type = v;
      else if (sec === 'linie' && k === 'name') r.line = v;
      else if (sec === 'ziel' && k === 'name') r.ziel = v;
      else if (sec === 'iscircle' && k === 'value') r.circle = v === '1';
    }
    return r;
  };

  /* Экспорт маршрута-списка обратно в .cfg (имена файлов клипов) */
  INF.toCfg = function (route, clipName) {
    const L = ['[city]', 'name=' + (route.city || ''), '', '[type]', 'type=' + (route.type || ''), '', '[linie]', 'name=' + (route.line || ''), '', '[ziel]', 'name=' + route.name, '', '[IsCircle]', 'Value=' + (route.circle ? 1 : 0), ''];
    route.dirs.forEach((d, i) => {
      L.push('[' + (i + 1) + ']');
      for (const a of d) {
        const f = a.items.filter(x => x.c).map(x => clipName(x.c));
        if (f.length) L.push(f.join(' + ') + ' [' + a.name + ']');
      }
      L.push('');
    });
    return '﻿' + L.join('\r\n');
  };

  /* ---------- модель ----------
     Элемент объявления (item):
       {c: clipId}                — конкретный звук
       {p: 'key'}                 — фраза линии (line.phrases[key].clip)
       {t: 'next', s: 'name', fb} — подстановка станции: cur|next|dest|first|prev|skips; s — слот звука
       {pause: 400}               — тишина, мс
       + необязательно cond: ключ из INF.COND
  */
  INF.WHO = { cur: 'текущая', next: 'следующая', dest: 'конечная', first: 'начальная', prev: 'предыдущая', end: 'обычная конечная (при укороченном рейсе)', pass: 'проезжаемая (в объявлении о проезде)', skips: 'все без остановок (список)', stops: 'все остановки (список)', passes: 'проезжаемые до следующей (список)' };

  INF.presets = {
    train: {
      title: 'Электричка',
      phrases: { dost: 'Поезд следует до станции', sovsemi: 'со всеми остановками', krome: 'кроме', sost: 'с остановками', sled: 'Следующая станция', dver: 'Осторожно, двери закрываются', prib: 'Поезд прибыл на станцию', privyhode: 'При выходе не забывайте свои вещи' },
      tpl: {
        start: [{ p: 'dost' }, { t: 'dest', s: 'name' }, { p: 'sovsemi', cond: 'notManySkips' }, { p: 'krome', cond: 'fewSkips' }, { t: 'skips', s: 'name', cond: 'fewSkips' }, { p: 'sost', cond: 'manySkips' }, { t: 'stops', s: 'name', cond: 'manySkips' }],
        dep: [{ p: 'sled' }, { t: 'next', s: 'name' }, { p: 'dver' }],
        arr: [{ t: 'cur', s: 'name' }, { pause: 400 }, { p: 'sled' }, { t: 'next', s: 'name' }],
        last: [{ p: 'prib' }, { t: 'cur', s: 'name' }, { p: 'privyhode' }],
        pass: []
      }
    },
    metro: {
      title: 'Метро',
      passAt: 'arr',
      phrases: { gong: 'Гонг', dver: 'Осторожно, двери закрываются', paus: 'Пауза', uvst: 'Уважаемые пассажиры! Станцию', bezost: 'поезд проследует без остановки', nedalshe: 'Поезд дальше не идёт, просьба освободить вагоны', vstoronu: 'В сторону станции', sledpoezd: 'поедет следующий поезд' },
      tpl: {
        start: [],
        dep: [{ p: 'gong' }, { p: 'dver', cond: 'notAtLineEnd' }, { t: 'next', s: 'otpr', fb: 1 }],
        arr: [{ p: 'gong' }, { t: 'cur', s: 'prib', fb: 1 }, { p: 'paus' }, { t: 'next', s: 'name' }],
        last: [{ p: 'gong' }, { t: 'cur', s: 'last', fb: 1 }],
        pass: [{ p: 'uvst' }, { t: 'pass', s: 'imya' }, { p: 'bezost' }],
        lastTrim: [{ p: 'gong' }, { t: 'cur', s: 'imya' }, { pause: 400 }, { p: 'nedalshe' }, { pause: 400, cond: 'nextFull' }, { p: 'vstoronu', cond: 'nextFull' }, { t: 'end', s: 'imya', cond: 'nextFull' }, { p: 'sledpoezd', cond: 'nextFull' }]
      }
    },
    tram: {
      title: 'Трамвай / троллейбус / автобус',
      passAt: 'dep',
      phrases: { ost: 'Остановка', sled: 'Следующая остановка', dver: 'Осторожно, двери закрываются', konech: 'Конечная. Просьба освободить вагон', uvost: 'Остановку', bezost: 'трамвай проследует без остановки' },
      tpl: {
        start: [],
        dep: [{ p: 'dver' }, { p: 'sled' }, { t: 'next', s: 'name' }],
        arr: [{ p: 'ost' }, { t: 'cur', s: 'name' }],
        last: [{ p: 'ost' }, { t: 'cur', s: 'name' }, { p: 'konech' }],
        pass: [{ p: 'uvost' }, { t: 'pass', s: 'name' }, { p: 'bezost' }]
      }
    }
  };
  INF.SLOTS = { name: 'название', imya: 'имя без «следующая»', otpr: 'при отправлении', prib: 'при прибытии', last: 'конечная', dost: '«до станции …» целой фразой', proezd: 'проезд без остановки (целой фразой)', perehod: 'переход', vyhod: 'выход к…' };

  INF.clone = o => JSON.parse(JSON.stringify(o));
  /** Старые линии: «со всеми остановками» звучит и перед «кроме» (в пакетах «кроме» — отдельное слово) */
  INF.migrateLine = function (l) {
    let ch2 = false;
    // метро: от конечных линии «двери закрываются» уже вшито в запись отправления — не повторять
    if ((l.migr || 0) < 2) {
      l.migr = 2; ch2 = true;
      if (l.phrases && l.phrases.gong && l.tpl && l.tpl.dep) l.tpl.dep.forEach(x => { if (x.p && /^dve/.test(x.p) && !x.cond) x.cond = 'notAtLineEnd'; });
    }
    return migrateStart(l) || ch2;
  };
  function migrateStart(l) {
    const st = l.tpl && l.tpl.start; if (!st) return false;
    if (!st.some(x => x.p === 'krome' && x.cond === 'fewSkips')) return false;
    let ch = false;
    st.forEach(x => { if (x.p && x.p !== 'krome' && x.cond === 'noSkips') { x.cond = 'notManySkips'; ch = true; } });
    if (l.phrases && l.phrases.krome && l.phrases.krome.label === 'со всеми остановками, кроме') { l.phrases.krome.label = 'кроме'; ch = true; }
    return ch;
  }

  /** Направления маршрута по его пути-кольцу. Путь: [{id, st, skip, term}];
      отметки term делят кольцо на направления; без отметок маршрут кольцевой.
      → [{idx, ring, seq:[{st, e, stop}]}] */
  INF.routeDirs = function (route, line) {
    const byId = new Map(line.stations.map(s => [s.id, s]));
    const P = (route.path || []).map(e => ({ e, st: byId.get(e.st) })).filter(x => x.st);
    const n = P.length; if (n < 2) return [];
    const T = []; P.forEach((x, i) => { if (x.e.term) T.push(i); });
    const mkSeq = (arr, ring) => arr.map((x, i) => ({ st: x.st, e: x.e, stop: ring ? !x.e.skip : (i === 0 || i === arr.length - 1 || !x.e.skip) }));
    if (!T.length) return [{ idx: 0, ring: true, seq: mkSeq(P, true) }];
    const dirs = [];
    for (let k = 0; k < T.length; k++) {
      const a = T[k], b = T[(k + 1) % T.length], arr = [];
      for (let i = a; arr.length <= n; i = (i + 1) % n) { arr.push(P[i]); if (i === b && arr.length > 1) break; }
      // укороченный рейс: своя начальная/конечная внутри направления
      const tr = (route.trim || {})[k];
      let part = arr, trimmed = false;
      if (tr) {
        let a0 = tr.from ? arr.findIndex(x => x.e.id === tr.from) : 0, b0 = tr.to ? arr.findIndex(x => x.e.id === tr.to) : arr.length - 1;
        if (a0 < 0) a0 = 0; if (b0 < 0) b0 = arr.length - 1;
        if (b0 > a0 && (a0 > 0 || b0 < arr.length - 1)) { part = arr.slice(a0, b0 + 1); trimmed = true; }
      }
      dirs.push({ idx: k, ring: false, trimmed, full: arr, seq: mkSeq(part, false) });
    }
    return dirs;
  };

  function slotClip(st, slot, dir, fb) {
    if (!st) return null;
    const c = st.clips || {};
    const d = '@' + (dir + 1);
    // «имя без „следующая“»: если отдельно не записано — звук прибытия («Удельная»)
    if (slot === 'imya' && !c['imya' + d] && !c.imya && (c['prib' + d] || c.prib)) return c['prib' + d] || c.prib;
    // конечная без своей записи: лучше «Станция X» (prib), чем «Следующая станция X» (name)
    if (fb && slot === 'last' && !c[slot + d] && !c[slot] && (c['prib' + d] || c.prib)) return c['prib' + d] || c.prib;
    return c[slot + d] || c[slot] || (fb && slot !== 'name' ? (c['name' + d] || c.name) : null) || null;
  }

  /** Раскрыть элементы в сегменты звука.
      ctx: {cur,next,dest,first,prev,pass, skips,stops,passes:[st], inter, dir, line} */
  // текущая станция — крайняя в линии (не маршрута)
  const lineEnd = c => { const L = c.line && c.line.stations; return !!(L && L.length && c.cur && (L[0].id === c.cur.id || L[L.length - 1].id === c.cur.id)); };
  INF.COND = {
    hasSkips: c => (c.skips || []).length > 0,
    noSkips: c => !(c.skips || []).length,
    fewSkips: c => (c.skips || []).length > 0 && (c.skips || []).length <= (c.inter || 0) / 2,
    manySkips: c => (c.skips || []).length > (c.inter || 0) / 2,
    notManySkips: c => (c.skips || []).length <= (c.inter || 0) / 2,
    trimmed: c => !!c.trimmed,
    atLineEnd: c => lineEnd(c),
    notAtLineEnd: c => !lineEnd(c),
    notTrimmed: c => !c.trimmed,
    nextFull: c => !!c.trimmed && c.nextFull !== false,
    noNextFull: c => !!c.trimmed && c.nextFull === false,
    hasPasses: c => (c.passes || []).length > 0,
    noPasses: c => !(c.passes || []).length
  };
  INF.LISTS = { skips: 1, stops: 1, passes: 1 };
  INF.expand = function (items, ctx, warn) {
    const out = [];
    for (const it of items || []) {
      if (it.cond && INF.COND[it.cond] && !INF.COND[it.cond](ctx)) continue;
      if (it.pause) { out.push({ pause: it.pause }); continue; }
      if (it.c) { out.push({ c: it.c }); continue; }
      if (it.miss) { warn && warn('нет файла ' + it.miss); continue; }
      if (it.p) {
        const ph = ctx.line && ctx.line.phrases && ctx.line.phrases[it.p];
        if (ph && ph.clip) out.push({ c: ph.clip }); else warn && warn('фраза «' + ((ph && ph.label) || it.p) + '» без звука');
        continue;
      }
      if (INF.LISTS[it.t]) {
        (ctx[it.t] || []).forEach((st, i) => {
          if (i) out.push({ pause: 250 });
          const c = slotClip(st, it.s || 'name', ctx.dir, 1);
          if (c) out.push({ c }); else warn && warn('у «' + st.name + '» нет звука');
        });
        continue;
      }
      if (it.t) {
        const st = ctx[it.t];
        if (!st) continue;
        const c = slotClip(st, it.s || 'name', ctx.dir, it.fb);
        if (c) out.push({ c });
        else if (!['perehod', 'vyhod', 'proezd'].includes(it.s)) warn && warn('у «' + st.name + '» нет звука (' + (INF.SLOTS[it.s] || it.s) + ')');
      }
    }
    return out;
  };

  /** Применить регулярные объявления к списку */
  INF.applyRules = function (anns, rules, ctxOf) {
    for (const r of rules || []) {
      if (!r.enabled || !r.variants || !r.variants.length) continue;
      const every = Math.max(1, r.every | 0 || 1);
      let n = 0, v = 0;
      anns.forEach((a, idx) => {
        if (a.kind !== 'dep' && a.kind !== 'arr') return;
        if (r.at !== 'both' && r.at !== a.kind) return;
        const k = n++;
        if ((k - (r.offset | 0)) % every !== 0 || k < (r.offset | 0)) return;
        const variant = r.mode === 'random' ? r.variants[Math.floor(Math.random() * r.variants.length)] : r.variants[v++ % r.variants.length];
        const segs = INF.expand(variant, ctxOf(a, idx), null);
        if (!segs.length) return;
        if (r.pos === 'before') a.segs = segs.concat([{ pause: 300 }], a.segs);
        else a.segs = a.segs.concat([{ pause: 300 }], segs);
        (a.extra = a.extra || []).push(r.name);
      });
    }
    return anns;
  };

  /** Собрать объявления для последовательности остановок одного направления */
  function annsForSeq(seq, ring, dir, line, tag, opt) {
    opt = opt || {};
    const trimmed = !!opt.trimmed;
    const stopIdx = []; seq.forEach((x, i) => { if (x.stop) stopIdx.push(i); });
    const stops = stopIdx.map(i => seq[i].st);
    const skips = seq.filter(x => !x.stop).map(x => x.st);
    const T = line.tpl || {};
    const n = stops.length, circ = ring;
    if (n < 2) return [];
    // проезжаемые без остановки после i-й остановки (до следующей)
    const passesAfter = stops.map((s, i) => { const out = []; const b1 = i + 1 < n ? stopIdx[i + 1] : seq.length; for (let k = stopIdx[i] + 1; k < b1; k++) out.push(seq[k].st); return out; });
    const inter = Math.max(0, seq.length - 2);
    const base = { line, dir, skips, inter, stops: circ ? stops : stops.slice(1, -1), first: stops[0], dest: circ ? null : stops[n - 1], passes: [], trimmed, end: opt.end || null, nextFull: opt.nextFull };
    const passAt = line.passAt || 'arr';
    const anns = [];
    const mk = (kind, label, sub, items, ctx, eid) => {
      const warn = [], c = Object.assign({}, base, ctx);
      const segs = INF.expand(items, c, m => warn.push(m));
      const k = kind + ':' + eid;
      const a = { k, key: tag + k, label, sub, kind, segs, off: false, warn, ctx: c, dir };
      anns.push(a);
      return a;
    };
    // «Станцию X поезд проследует без остановки» — по шаблону pass, на каждую проезжаемую
    const addPass = (a, list) => {
      if (!list.length) return;
      if ((!T.pass || !T.pass.length) && !list.some(st => slotClip(st, 'proezd', dir, 0))) return;
      for (const st of list) {
        // своя запись целой фразой у станции важнее шаблона
        const whole = slotClip(st, 'proezd', dir, 0);
        const segs = whole ? [{ c: whole }] : INF.expand(T.pass, Object.assign({}, a.ctx, { pass: st }), m => a.warn.push(m));
        if (segs.length) a.segs = a.segs.concat([{ pause: 300 }], segs);
      }
      (a.extra = a.extra || []).push('проезд: ' + list.map(s => s.name).join(', '));
    };
    const eid = i => seq[stopIdx[i]].e.id;
    let startAnn = null;
    if (T.start && T.start.length && !circ) {
      const many = skips.length > inter / 2;
      startAnn = mk('start', 'До ' + stops[n - 1].name, !skips.length ? 'со всеми остановками' : many ? 'с остановками: ' + base.stops.map(s => s.name).join(', ') : 'кроме: ' + skips.map(s => s.name).join(', '), T.start, { cur: stops[0], next: stops[1], passes: passesAfter[0] }, eid(0));
    }
    const nx = i => circ ? stops[(i + 1) % n] : stops[i + 1];
    const pv = i => circ ? stops[(i - 1 + n) % n] : stops[i - 1];
    const steps = circ ? n : n - 1;
    for (let i = 0; i < steps; i++) {
      const cur = stops[i], next = nx(i);
      const d = mk('dep', 'Отпр. → ' + next.name, 'от ' + cur.name, T.dep, { cur, next, prev: pv(i), passes: passesAfter[i] }, eid(i));
      d.passes = passesAfter[i].map(s => s.name);
      // объявление о проезде: при прибытии на предыдущую остановку, а с начальной — при отправлении
      if (passAt !== 'arr' || (i === 0 && !circ)) addPass(d, passesAfter[i]);
      // начальное «вместе с первым отправлением» — одной записью
      if (i === 0 && startAnn && line.startWith === 'dep') {
        anns.splice(anns.indexOf(startAnn), 1);
        d.segs = startAnn.segs.concat([{ pause: 400 }], d.segs);
        d.warn = startAnn.warn.concat(d.warn);
        (d.extra = d.extra || []).unshift(startAnn.label.toLowerCase() + ', ' + startAnn.sub);
      }
      const j = circ ? (i + 1) % n : i + 1;
      const at = stops[j];
      if (!circ && j === n - 1) {
        // укороченный рейс: своя «конечная» — «поезд дальше не идёт…», если шаблон задан
        const lt = trimmed && T.lastTrim && T.lastTrim.length ? T.lastTrim : T.last && T.last.length ? T.last : T.arr;
        mk('last', 'Приб. ' + at.name, trimmed ? 'конечная укороченного рейса' : 'конечная', lt, { cur: at, next: null, prev: cur }, eid(j));
      }
      else {
        const a = mk('arr', 'Приб. ' + at.name, 'далее ' + nx(j).name, T.arr, { cur: at, next: nx(j), prev: cur, passes: passesAfter[j] }, eid(j));
        if (passAt !== 'dep') addPass(a, passesAfter[j]);
      }
    }
    // кольцо: проезд перед первой остановкой объявляется при прибытии на последнюю
    return anns;
  }

  /** Названия направлений маршрута */
  INF.dirNames = function (route, lines) {
    const R = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    if (route.mode === 'list') return route.dirs.map((d, i) => ({ id: i, short: R[i], title: (d.length ? d[d.length - 1].name.replace(/^(Приб|Отпр)\.?\s*/i, '') : '') }));
    const line = lines.find(l => l.id === route.line);
    if (!line) return [];
    return INF.routeDirs(route, line).map((d, i) => ({ id: i, short: d.ring ? '↻' : R[i], title: d.ring ? 'кольцевой' : d.seq[d.seq.length - 1].st.name, ring: d.ring }));
  };

  /** Собрать список объявлений маршрута на направление (число) или 'ring' — все направления подряд по кругу.
      → [{key, label, sub, kind: start|dep|arr|last|other, segs, off, warn:[], stId, passes}] */
  INF.buildAnnouncements = function (route, lines, dir, service) {
    return INF.applyInserts(buildAnns(route, lines, dir), route, service || []);
  };
  /** Служебные сообщения, привязанные «после объявления»: auto — звучат сами через паузу; step — отдельный пункт списка */
  INF.applyInserts = function (anns, route, service) {
    const ins = route.inserts || [];
    if (!ins.length) return anns;
    const out = [];
    for (const a of anns) {
      out.push(a);
      for (const x of ins) {
        if (x.after !== a.k) continue;
        const sv = service.find(s => s.id === x.svc);
        if (!sv) continue;
        const warn = [], segs = INF.expand(sv.items, a.ctx || { dir: a.dir }, m => warn.push(m));
        if (x.mode === 'step') out.push({ k: 'svc:' + x.id, key: a.key + '+svc:' + x.id, label: sv.label, sub: 'служебное', kind: 'svc', segs, off: false, warn, dir: a.dir, ins: x });
        else (a.then = a.then || []).push({ label: sv.label, segs, delay: x.delay || 0, ins: x });
      }
    }
    return out;
  };
  function buildAnns(route, lines, dir) {
    if (route.mode === 'list') {
      const mkList = d => (route.dirs[d] || []).map((a, i) => {
        const warn = [];
        const segs = INF.expand(a.items, { dir: d }, m => warn.push(m));
        const kind = /^отпр/i.test(a.name) ? 'dep' : /^приб/i.test(a.name) ? (i === route.dirs[d].length - 1 ? 'last' : 'arr') : (i === route.dirs[d].length - 1 ? 'last' : 'other');
        return { k: 'l:' + (a.id || d + '.' + i), key: d + ':' + (a.id || i), label: a.name, sub: '', kind, segs, off: !!a.off, warn, src: a, dir: d };
      });
      const anns = dir === 'ring' ? route.dirs.flatMap((x, d) => mkList(d)) : mkList(dir);
      return INF.applyRules(anns, route.rules, a => ({ dir: a.dir }));
    }
    const line = lines.find(l => l.id === route.line);
    if (!line) return [];
    const dirs = INF.routeDirs(route, line);
    const dirOpt = d => ({ trimmed: d.trimmed, end: d.full ? d.full[d.full.length - 1].st : null, nextFull: route.nextFull !== false });
    let anns;
    if (dir === 'ring') anns = dirs.flatMap(d => annsForSeq(d.seq, d.ring, d.idx, line, d.idx + '/', dirOpt(d)));
    else { const d = dirs[dir]; anns = d ? annsForSeq(d.seq, d.ring, d.idx, line, '', dirOpt(d)) : []; }
    return INF.applyRules(anns, route.rules, a => a.ctx || { line, dir: a.dir });
  }

  /** Сделать линию из маршрута-списка (импортированного .cfg). Эвристика по подписям «Отпр. X» / «Приб. X». */
  INF.lineFromList = function (route, clipById, allClips) {
    const isPh = id => { const c = clipById(id); return c && /^00_/.test(c.name); };
    const phKey = id => { const c = clipById(id); return c ? INF.stem(c.name).replace(/^00_/, '') : 'ph'; };
    const stations = [], byName = new Map();
    const get = name => { let s = byName.get(name); if (!s) { s = { id: INF.uid(), name, clips: {} }; byName.set(name, s); } return s; };
    const nameOf = lbl => lbl.replace(/^(Отпр|Приб)\.?\s*/i, '').trim();
    const setSlot = (st, slot, dir, clip) => {
      const k = slot + '@' + (dir + 1);
      st._s = st._s || {}; (st._s[slot] = st._s[slot] || [null, null])[dir] = st._s[slot][dir] || clip;
    };
    const order = [[], []];
    route.dirs.forEach((list, dir) => {
      list.forEach((a, i) => {
        const clips = a.items.filter(x => x.c).map(x => x.c);
        const nonPh = clips.filter(c => !isPh(c));
        if (/^отпр/i.test(a.name)) {
          const st = get(nameOf(a.name)); order[dir].push(st);
          if (nonPh[0]) setSlot(st, 'otpr', dir, nonPh[0]);
        } else if (/^приб/i.test(a.name)) {
          const st = get(nameOf(a.name));
          if (i === list.length - 1) { if (nonPh.length === 1) setSlot(st, 'last', dir, nonPh[0]); else if (nonPh[0]) setSlot(st, 'name', dir, nonPh[0]); }
          else { if (nonPh[0]) setSlot(st, 'prib', dir, nonPh[0]); }
        } else if (i === list.length - 1 && list.length > 1) {
          const st = get(a.name); if (order[dir][order[dir].length - 1] !== st) order[dir].push(st);
          if (nonPh[0]) setSlot(st, 'last', dir, nonPh[0]);
        }
      });
    });
    // «Приб. X» обычно содержит название следующей станции вторым звуком → слот name
    route.dirs.forEach((list, dir) => {
      list.forEach(a => {
        if (!/^приб/i.test(a.name)) return;
        const nonPh = a.items.filter(x => x.c && !isPh(x.c)).map(x => x.c);
        if (nonPh.length < 2) return;
        // следующая станция — та, чей otpr совпадает, иначе следующая по порядку
        const idx = order[dir].findIndex(s => s.name === nameOf(a.name));
        const nxt = idx >= 0 ? order[dir][idx + 1] : null;
        if (nxt) setSlot(nxt, 'name', dir, nonPh[1]);
      });
    });
    // порядок: начальная направления 1 — последняя станция направления 2
    const seq = [];
    const o2 = order[1].slice().reverse();
    if (o2.length && !order[0].includes(o2[0])) seq.push(o2[0]);
    for (const s of order[0]) if (!seq.includes(s)) seq.push(s);
    for (const s of o2) if (!seq.includes(s)) seq.push(s);
    for (const s of byName.values()) if (!seq.includes(s)) seq.push(s);
    for (const st of seq) {
      for (const slot in st._s) {
        const [a, b] = st._s[slot];
        if (a && b && a !== b) { st.clips[slot] = a; st.clips[slot + '@2'] = b; }
        else st.clips[slot] = a || b;
      }
      // для электричек: prib совпадает с name/otpr → убрать лишнее
      if (st.clips.prib && (st.clips.prib === st.clips.name || st.clips.prib === st.clips.otpr)) { if (!st.clips.name) st.clips.name = st.clips.prib; delete st.clips.prib; }
      if (st.clips.otpr && !st.clips.name) { st.clips.name = st.clips.otpr; delete st.clips.otpr; }
      if (st.clips.otpr && st.clips.otpr === st.clips.name) delete st.clips.otpr;
      if (st.clips.last && st.clips.last === st.clips.name) delete st.clips.last;
      delete st._s;
      stations.push(st);
    }
    // шаблоны: самый частый «скелет» объявлений
    const phrases = {};
    const resolveTpl = (a, dir, kind) => {
      const st = byName.get(kind === 'other' ? a.name : nameOf(a.name));
      const list = route.dirs[dir], idx = order[dir].indexOf(st);
      const nxt = order[dir][idx + 1];
      const lastSt = order[dir][order[dir].length - 1];
      const has = (s, c) => s && Object.entries(s.clips).some(([k, v]) => v === c);
      const slotOf = (s, c) => s && (Object.entries(s.clips).find(([k, v]) => v === c) || [])[0];
      return a.items.map(x => {
        if (x.pause) return x;
        if (!x.c) return null;
        if (isPh(x.c)) { const k = phKey(x.c); phrases[k] = phrases[k] || { label: INF.stem((clipById(x.c) || {}).name || k), clip: x.c }; return { p: k }; }
        if (kind === 'dep') { const s = slotOf(st, x.c); return s ? { t: 'next', s: 'otpr', fb: 1 } : null; }
        if (kind === 'arr') { if (has(st, x.c)) return { t: 'cur', s: slotOf(st, x.c).split('@')[0], fb: 1 }; if (has(nxt, x.c)) return { t: 'next', s: slotOf(nxt, x.c).split('@')[0] }; return null; }
        if (kind === 'last') { if (has(st, x.c)) return { t: 'cur', s: slotOf(st, x.c).split('@')[0], fb: 1 }; return null; }
        if (kind === 'start') { if (has(lastSt, x.c)) return { t: 'dest', s: 'name' }; return null; }
        return null;
      }).filter(Boolean);
    };
    const trailing = []; let arrN = 0;
    const pick = (kind, test) => {
      const cnt = new Map();
      route.dirs.forEach((list, dir) => list.forEach((a, i) => {
        if (!test(a, i, list)) return;
        let t = resolveTpl(a, dir, kind);
        if (kind === 'arr') {
          arrN++;
          let li = -1; t.forEach((x, k) => { if (x.t) li = k; });
          if (li >= 0 && li < t.length - 1) { trailing.push(t.slice(li + 1)); t = t.slice(0, li + 1); }
        }
        const k = JSON.stringify(t); cnt.set(k, (cnt.get(k) || 0) + 1);
      }));
      let best = null, bn = 0; for (const [k, v] of cnt) if (v > bn) { best = k; bn = v; }
      return best ? JSON.parse(best) : [];
    };
    const tpl = {
      start: pick('start', (a, i, l) => i === 0 && !/^(отпр|приб)/i.test(a.name)),
      dep: pick('dep', a => /^отпр/i.test(a.name)),
      arr: pick('arr', (a, i, l) => /^приб/i.test(a.name) && i < l.length - 1),
      last: pick('last', (a, i, l) => i === l.length - 1 && l.length > 1)
    };
    // хвосты вроде «держитесь за поручни» / «не оставляйте вещи» → регулярное объявление
    const rules = [];
    if (trailing.length) {
      const uniq = [...new Map(trailing.map(t => [JSON.stringify(t), t])).values()];
      rules.push({ id: INF.uid(), name: 'Вежливые объявления', enabled: true, at: 'arr', pos: 'after', every: Math.max(1, Math.round(arrN / trailing.length)), offset: 0, mode: 'rotate', variants: uniq });
    }
    // путь-кольцо: направление I, затем II (без повтора начальной)
    const d1 = order[0], d2 = order[1];
    const t1 = d2[d2.length - 1], t2 = d1[d1.length - 1];
    const seq1 = (t1 && d1[0] !== t1 ? [t1] : []).concat(d1);
    const seq2 = (t2 && d2[0] !== t2 ? [t2] : []).concat(d2);
    const path = seq1.map((st, i) => ({ id: INF.uid(), st: st.id, term: i === 0 || i === seq1.length - 1 }));
    if (seq2.length > 2) {
      const tail = seq2.slice(1, seq2[seq2.length - 1] === seq1[0] ? -1 : undefined);
      for (const st of tail) path.push({ id: INF.uid(), st: st.id });
    }
    // проезд без остановки и «кроме» / «с остановками» в начальном
    let passAt = 'arr';
    if (phrases.gong) {
      phrases.uvst = phrases.uvst || { label: INF.presets.metro.phrases.uvst, clip: null };
      phrases.bezost = phrases.bezost || { label: INF.presets.metro.phrases.bezost, clip: null };
      tpl.pass = INF.clone(INF.presets.metro.tpl.pass);
      tpl.dep.forEach(x => { if (x.p && /^dve/.test(x.p) && !x.cond) x.cond = 'notAtLineEnd'; });
    } else tpl.pass = [];
    // звуки «кроме» / «с остановками» могут лежать в пакете, хотя старый .cfg их не использует
    const packs = new Set(); route.dirs.forEach(d => d.forEach(a => a.items.forEach(x => { const c = x.c && clipById(x.c); if (c && c.pack) packs.add(c.pack); })));
    const findPh = re => { const c = (allClips || []).find(c => packs.has(c.pack) && re.test(INF.stem(c.name).replace(/^\d+_/, ''))); return c ? c.id : null; };
    const di = tpl.start.findIndex(x => x.t === 'dest');
    if (di >= 0 && !tpl.start.some(x => x.cond)) {
      tpl.start = tpl.start.slice(0, di + 1).concat(tpl.start.slice(di + 1).map(x => Object.assign({}, x, { cond: 'notManySkips' })),
        [{ p: 'krome', cond: 'fewSkips' }, { t: 'skips', s: 'name', cond: 'fewSkips' }, { p: 'sost', cond: 'manySkips' }, { t: 'stops', s: 'name', cond: 'manySkips' }]);
      phrases.krome = phrases.krome || { label: INF.presets.train.phrases.krome, clip: findPh(/krom/i) };
      phrases.sost = phrases.sost || { label: INF.presets.train.phrases.sost, clip: findPh(/^(s_?ost|sostanov.*)$/i) };
    }
    return { line: { id: INF.uid(), name: route.line || route.name, city: route.city || '', type: route.type || '', color: route.color || '#d6083b', stations, phrases, tpl, passAt, migr: 2 }, rules, path };
  };

  /* ---------- WAV ---------- */
  INF.encodeWav = function (chans, rate) {
    const nc = chans.length, len = chans[0].length;
    const buf = new ArrayBuffer(44 + len * nc * 2), dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + len * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, len * nc * 2, true);
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { let v = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true); o += 2; }
    return new Blob([buf], { type: 'audio/wav' });
  };

  /** «Следующая станция Ладожская» → участок «Ладожская»: первая пауза после minHead секунд.
      data — моно, rate. → {start, end} или null */
  INF.cutAfterHead = function (data, rate, opt) {
    opt = opt || {};
    const segs = INF.splitBySilence(data, rate, { db: opt.db || -36, minSil: opt.minSil || 70, minSeg: 0.05 * 1000 });
    if (segs.length < 2) return null;
    const head = opt.minHead != null ? opt.minHead : 0.6;
    const k = segs.findIndex((s, i) => i > 0 && s.start >= head);
    if (k < 1) return null;
    return { start: segs[k].start, end: segs[segs.length - 1].end };
  };
  /** Поиск пауз: data — Float32 моно, rate. → [{start,end}] в секундах */
  INF.splitBySilence = function (data, rate, opt) {
    const thr = Math.pow(10, (opt.db || -40) / 20), minSil = (opt.minSil || 400) / 1000, minSeg = (opt.minSeg || 250) / 1000;
    const win = Math.max(1, Math.floor(rate * 0.01)), nW = Math.floor(data.length / win);
    const loud = new Uint8Array(nW);
    for (let w = 0; w < nW; w++) { let s = 0; for (let i = w * win; i < (w + 1) * win; i++) s += data[i] * data[i]; loud[w] = Math.sqrt(s / win) > thr ? 1 : 0; }
    const segs = []; let st = -1, quiet = 0; const minQ = Math.ceil(minSil / 0.01);
    for (let w = 0; w < nW; w++) {
      if (loud[w]) { if (st < 0) st = w; quiet = 0; }
      else if (st >= 0 && ++quiet >= minQ) { segs.push([st, w - quiet + 1]); st = -1; quiet = 0; }
    }
    if (st >= 0) segs.push([st, nW]);
    const pad = 0.06, dur = data.length / rate;
    return segs.map(([a, b]) => ({ start: Math.max(0, a * 0.01 - pad), end: Math.min(dur, b * 0.01 + pad) })).filter(s => s.end - s.start >= minSeg);
  };

  G.INF = INF;
})(typeof window !== 'undefined' ? window : globalThis);
