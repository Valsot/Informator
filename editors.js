/* Информатор — редакторы: маршруты, линии, служебные, нарезка */
'use strict';

/* ================= Вкладка «Маршруты» ================= */
function viewRoutes() {
  const root = h('div');
  root.append(h('h1', null, 'Маршруты'));
  root.append(h('div', { class: 'btns' }, h('button', { class: 'btn pri', onclick: newRoute }, ic('add'), 'Маршрут'), h('button', { class: 'btn', onclick: newLine }, ic('add'), 'Линия'), h('button', { class: 'btn', onclick: () => editService(null) }, ic('add'), 'Служебное')));
  root.append(h('h2', null, 'Маршруты'));
  if (!S.routes.length) root.append(h('div', { class: 'card dim small' }, 'Пока нет. Импортируй пакеты во вкладке «Звуки» или создай маршрут по линии.'));
  else root.append(h('div', { class: 'list' }, S.routes.map(r => h('div', { class: 'li tap', onclick: () => { PL.setRoute(r.id); UI.scrollCur = true; UI.go('player'); } },
    h('div', { class: 'swatch', style: { background: routeColor(r), width: '14px', height: '14px' } }),
    h('div', { class: 'grow' }, h('div', { class: 'ell', style: { fontWeight: 600 } }, r.name), h('div', { class: 'tiny dim ell' }, (r.mode === 'build' ? 'кольцо по линии · ' : 'список · ') + routeMeta(r))),
    ib('edit', () => editRoute(r), 'Редактировать')))));
  root.append(h('h2', null, 'Линии — справочники остановок'));
  if (!S.lines.length) root.append(h('div', { class: 'card dim small' }, 'Линия — это остановки по порядку со звуками названий, плюс фразы и шаблоны объявлений. Из одной линии можно собрать сколько угодно маршрутов. Ещё линию можно получить из импортированного маршрута: ✎ → ⋯ → «Сделать линию».'));
  else root.append(h('div', { class: 'list' }, S.lines.map(l => h('div', { class: 'li tap', onclick: () => editLine(l) },
    h('div', { class: 'swatch', style: { background: l.color, width: '14px', height: '14px' } }),
    h('div', { class: 'grow' }, h('div', { class: 'ell', style: { fontWeight: 600 } }, l.name), h('div', { class: 'tiny dim' }, l.stations.length + ' остановок' + (l.type ? ' · ' + l.type : '')))))));
  root.append(h('h2', null, 'Служебные сообщения'));
  if (!S.service.length) root.append(h('div', { class: 'card dim small' }, '«Поезд дальше не пойдёт», «Просьба освободить вагоны»… Появятся кнопками в пульте, их можно привязать «после объявления» с паузой.'));
  else root.append(h('div', { class: 'list' }, S.service.map(sv => h('div', { class: 'li tap', onclick: () => editService(sv) },
    ib('play', () => AE.preview(INF.expand(sv.items, { dir: 0 })), 'Слушать'),
    h('div', { class: 'grow ell' }, sv.label)))));
  return root;
}
function newRoute() {
  menu('Новый маршрут', [
    { label: '◎ По линии — кольцо остановок (конструктор)', do: () => {
      const mk = l => { const r = { id: INF.uid(), mode: 'build', name: 'Новый маршрут', line: l.id, path: [], rules: [], inserts: [] }; S.routes.push(r); save(); editRoute(r); };
      if (!S.lines.length) { toast('Сначала нужна линия — создаю'); newLine(l => mk(l)); return; }
      if (S.lines.length === 1) return mk(S.lines[0]);
      menu('Какая линия?', S.lines.map(l => ({ label: l.name, do: () => mk(l) })));
    } },
    { label: '☰ Списком, как в старом Информаторе', do: () => { const r = { id: INF.uid(), mode: 'list', name: 'Новый маршрут', city: '', type: '', line: '', color: '#d6083b', dirs: [[], []], rules: [], inserts: [] }; S.routes.push(r); save(); editRoute(r); } }
  ]);
}
function newLine(after) {
  menu('Какой транспорт? (задаёт шаблоны объявлений)', Object.entries(INF.presets).map(([k, p]) => ({
    label: p.title, do: () => {
      const l = { id: INF.uid(), name: 'Новая линия', city: '', type: p.title, color: k === 'train' ? '#1f8f8f' : k === 'tram' ? '#c2185b' : '#d6083b', stations: [], phrases: {}, tpl: {} };
      applyPreset(l, k); S.lines.push(l); save();
      editLine(l);
      if (after) after(l);
    }
  })));
}
function applyPreset(l, k) {
  const p = INF.presets[k];
  for (const key in p.phrases) if (!l.phrases[key]) l.phrases[key] = { label: p.phrases[key], clip: null };
  l.tpl = INF.clone(p.tpl);
  l.passAt = p.passAt || 'arr';
}

/* ================= Выбор звука / фразы / станции ================= */
function pickClip(cb, title) {
  openSheet(title || 'Выбери звук', b => {
    const q = h('input', { type: 'search', placeholder: 'Поиск…' });
    const box = h('div', { style: { marginTop: '8px' } });
    const draw = () => {
      box.innerHTML = '';
      const qq = q.value.trim().toLowerCase();
      let n = 0;
      for (const p of S.packs) {
        const cl = Object.values(S.clips).filter(c => c.pack === p.id && (!qq || c.name.toLowerCase().includes(qq) || p.name.toLowerCase().includes(qq)));
        if (!cl.length) continue;
        box.append(h('h2', null, p.name));
        box.append(h('div', { class: 'list' }, cl.slice(0, 300).map(c => clipRow(c, c => { UI.pop(); cb(c.id); }))));
        n += cl.length;
      }
      if (!n) box.append(h('div', { class: 'empty' }, S.packs.length ? 'Ничего не найдено' : 'Банк звуков пуст — импортируй пакет или нарежь запись'));
    };
    q.oninput = draw;
    b.append(q, box, h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { UI.pop(); openSlicer(); } }, ic('cut'), 'Нарезать новую запись')));
    draw();
  });
}
function pickPhrase(line, cb) {
  openSheet('Фраза линии', b => {
    b.append(h('div', { class: 'list' }, Object.entries(line.phrases || {}).map(([k, p]) => h('div', { class: 'li tap', onclick: () => { UI.pop(); cb(k); } },
      p.clip ? ib('play', () => AE.preview([{ c: p.clip }])) : h('span', { class: 'badge w' }, 'нет звука'),
      h('div', { class: 'grow' }, h('div', null, p.label), h('div', { class: 'tiny dim ell' }, p.clip ? clipLabel(p.clip) : ''))))));
    b.append(h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { UI.pop(); prompt2('Новая фраза — как подписать?', '', v => { if (!v.trim()) return; const k = 'ph' + INF.uid(); line.phrases[k] = { label: v.trim(), clip: null }; save(); pickClip(id => { line.phrases[k].clip = id; save(); cb(k); }, 'Звук для «' + v.trim() + '»'); }); } }, ic('add'), 'Новая фраза')));
  });
}
function pickStation(line, cb, title) {
  openSheet(title || 'Остановка из справочника', b => {
    const q = h('input', { type: 'search', placeholder: 'Поиск…' });
    const box = h('div', { class: 'list', style: { marginTop: '8px' } });
    const draw = () => {
      box.innerHTML = '';
      const qq = q.value.trim().toLowerCase();
      line.stations.forEach((s, i) => { if (qq && !s.name.toLowerCase().includes(qq)) return; box.append(h('div', { class: 'li tap', onclick: () => { UI.pop(); cb(s.id); } }, h('span', { class: 'stnum' }, i + 1), h('div', { class: 'grow ell' }, s.name), s.clips.name ? null : h('span', { class: 'badge w' }, 'без звука'))); });
    };
    q.oninput = draw;
    b.append(q, box, h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { UI.pop(); prompt2('Название новой остановки', q.value, v => { if (!v.trim()) return; const s = { id: INF.uid(), name: v.trim(), clips: {} }; line.stations.push(s); save(); cb(s.id); toast('Добавлено в справочник. Звук назначь в линии'); }); } }, ic('add'), 'Новая остановка')));
    draw();
  });
}

/* ================= Редактор элементов объявления ================= */
const CONDS = { '': 'всегда', hasSkips: 'если есть пропуски', noSkips: 'если нет пропусков', fewSkips: 'если пропусков не больше половины', manySkips: 'если пропусков больше половины', notManySkips: 'если пропусков нет или не больше половины', trimmed: 'если рейс укороченный', notTrimmed: 'если рейс до обычной конечной', hasPasses: 'если до следующей проезд без остановки', noPasses: 'если до следующей проезда нет' };
function itemLabel(it, line) {
  if (it.pause) return '⏸ ' + (it.pause / 1000) + ' с';
  if (it.c) return '♪ ' + clipLabel(it.c);
  if (it.miss) return '✕ ' + it.miss;
  if (it.p) { const p = line && line.phrases && line.phrases[it.p]; return '«' + (p ? p.label : it.p) + '»'; }
  if (it.t) return '{' + INF.WHO[it.t] + ((it.s && it.s !== 'name') ? ': ' + (INF.SLOTS[it.s] || it.s) : '') + '}';
  return '?';
}
function itemsEditor(items, opt) {
  opt = opt || {};
  const box = h('div', { class: 'items' });
  const changed = () => { save(); draw(); opt.onChange && opt.onChange(); };
  const draw = () => {
    box.innerHTML = '';
    items.forEach((it, i) => {
      const cls = 'it ' + (it.pause ? 'pz' : it.p ? 'ph' : it.t ? 'tok' : it.miss ? 'miss' : '');
      box.append(h('button', { class: cls, onclick: () => itemMenu(i) }, h('span', { class: 'ell' }, itemLabel(it, opt.line)), it.cond ? h('span', { class: 'cd' }, CONDS[it.cond]) : null));
    });
    box.append(h('button', { class: 'it add', onclick: addItem }, '+ добавить'));
  };
  const segOf = it => INF.expand([it], opt.ctx || { line: opt.line, dir: 0 }, null);
  const itemMenu = i => {
    const it = items[i];
    const m = [];
    if (it.c || it.p) m.push({ label: '▶ Прослушать', do: () => AE.preview(segOf(it)) });
    if (i > 0) m.push({ label: '← Левее', do: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); changed(); } });
    if (i < items.length - 1) m.push({ label: '→ Правее', do: () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); changed(); } });
    if (it.c || it.miss) m.push({ label: '⇄ Другой звук', do: () => pickClip(id => { delete it.miss; it.c = id; changed(); }) });
    if (it.p) m.push({ label: '⇄ Звук этой фразы в линии', do: () => pickClip(id => { opt.line.phrases[it.p].clip = id; changed(); }) });
    if (it.t && it.t !== 'skips') m.push({ label: 'Какой звук остановки: ' + (INF.SLOTS[it.s || 'name'] || it.s), do: () => menu('Звук остановки', Object.entries(INF.SLOTS).map(([k, v]) => ({ label: v + (k !== 'name' ? ' (если нет — название)' : ''), do: () => { it.s = k; it.fb = k === 'perehod' || k === 'vyhod' ? 0 : 1; changed(); } }))) });
    if (it.pause) m.push({ label: 'Длительность…', do: () => prompt2('Пауза, секунд', String(it.pause / 1000), v => { const x = parseFloat(String(v).replace(',', '.')); if (x > 0) { it.pause = Math.round(x * 1000); changed(); } }) });
    if (opt.tokens) m.push({ label: 'Условие: ' + CONDS[it.cond || ''], do: () => menu('Когда звучит', Object.entries(CONDS).map(([k, v]) => ({ label: v, do: () => { if (k) it.cond = k; else delete it.cond; changed(); } }))) });
    m.push({ label: '✕ Убрать', danger: 1, do: () => { items.splice(i, 1); changed(); } });
    menu(itemLabel(it, opt.line), m);
  };
  const addItem = () => {
    const m = [{ label: '♪ Звук из банка', do: () => pickClip(id => { items.push({ c: id }); changed(); }) }];
    if (opt.line) m.push({ label: '« » Фраза линии', do: () => pickPhrase(opt.line, k => { items.push({ p: k }); changed(); }) });
    if (opt.tokens) m.push({ label: '{ } Название остановки…', do: () => menu('Какой остановки', Object.entries(INF.WHO).map(([k, v]) => ({ label: v + (k === 'skips' ? ' (все пропускаемые подряд)' : ''), do: () => { items.push({ t: k, s: 'name' }); changed(); } }))) });
    m.push({ label: '⏸ Пауза', do: () => { items.push({ pause: 500 }); changed(); } });
    menu('Добавить', m);
  };
  draw();
  return box;
}

/* ================= Редактор линии ================= */
function editLine(l) {
  openPage(l.name, (b, api, right) => {
    right.append(ib('more', () => menu(l.name, [
      { label: 'Дублировать линию (для ответвления)', do: () => { const c = INF.clone(l); c.id = INF.uid(); c.name = l.name + ' (копия)'; S.lines.push(c); save(); editLine(c); } },
      { label: 'Удалить линию', danger: 1, do: () => { const used = S.routes.filter(r => r.line === l.id); confirmBox(used.length ? 'Линию используют маршруты: ' + used.map(r => r.name).join(', ') + '. Они тоже будут удалены.' : 'Удалить линию «' + l.name + '»?', () => { S.routes = S.routes.filter(r => r.line !== l.id); S.lines = S.lines.filter(x => x !== l); save(); PL.load(); UI.pop(); }); } }
    ])));
    const fld = (label, key, ph) => h('label', { class: 'f' }, h('span', null, label), h('input', { type: 'text', value: l[key] || '', placeholder: ph || '', onchange: e => { l[key] = e.target.value.trim(); save(); if (key === 'name') api.title(l.name); } }));
    b.append(fld('Название', 'name'), h('div', { class: 'row' }, h('div', { class: 'grow' }, fld('Город', 'city')), h('div', { class: 'grow' }, fld('Вид транспорта', 'type'))));
    b.append(colorRow(l.color, c => { l.color = c; save(); api.re(); }));

    // остановки
    b.append(h('h2', null, 'Остановки по порядку (' + l.stations.length + ')'));
    const list = h('div', { class: 'list' });
    l.stations.forEach((s, i) => {
      const extra = Object.keys(s.clips).filter(k => k !== 'name');
      list.append(h('div', { class: 'li tap', onclick: () => editStation(l, s, api) },
        h('span', { class: 'stnum' }, i + 1),
        h('div', { class: 'grow' }, h('div', { class: 'ell' }, s.name), h('div', { class: 'tiny dim ell' }, s.clips.name ? '♪ ' + clipLabel(s.clips.name) : h('span', { style: { color: 'var(--warn)' } }, 'нет звука названия'), extra.length ? ' · +' + extra.length : '')),
        s.clips.name ? ib('play', () => AE.preview([{ c: s.clips.name }])) : null,
        i > 0 ? ib('up', () => { l.stations.splice(i - 1, 0, l.stations.splice(i, 1)[0]); save(); api.re(); }) : null));
    });
    b.append(list);
    b.append(h('div', { class: 'btns' },
      h('button', { class: 'btn sm', onclick: () => prompt2('Название остановки', '', v => { if (v.trim()) { l.stations.push({ id: INF.uid(), name: v.trim(), clips: {} }); save(); api.re(); } }) }, ic('add'), 'Остановка'),
      h('button', { class: 'btn sm', onclick: () => prompt2('Остановки — по одной в строке', '', v => { v.split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach(n => l.stations.push({ id: INF.uid(), name: n, clips: {} })); save(); api.re(); }, { multi: 1, ph: 'Боровая\nКупчино\nШушары' }) }, 'Списком…'),
      h('button', { class: 'btn sm', onclick: () => autoMatch(l, api) }, 'Подобрать звуки станций и фраз')));

    // фразы
    b.append(h('h2', null, 'Фразы'));
    const ph = h('div', { class: 'list' });
    Object.entries(l.phrases || {}).forEach(([k, p]) => ph.append(h('div', { class: 'li tap', onclick: () => menu(p.label, [
      { label: '♪ Выбрать звук', do: () => pickClip(id => { p.clip = id; save(); api.re(); }, 'Звук для «' + p.label + '»') },
      { label: 'Переименовать', do: () => prompt2('Подпись фразы', p.label, v => { if (v.trim()) { p.label = v.trim(); save(); api.re(); } }) },
      { label: 'Удалить фразу', danger: 1, do: () => { delete l.phrases[k]; save(); api.re(); } }]) },
      p.clip ? ib('play', () => AE.preview([{ c: p.clip }])) : h('span', { class: 'badge w' }, 'нет звука'),
      h('div', { class: 'grow' }, h('div', null, p.label), h('div', { class: 'tiny dim ell' }, p.clip ? clipLabel(p.clip) : 'нажми, чтобы выбрать звук')))));
    b.append(ph, h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => prompt2('Подпись новой фразы', '', v => { if (v.trim()) { l.phrases['ph' + INF.uid()] = { label: v.trim(), clip: null }; save(); api.re(); } }) }, ic('add'), 'Фраза')));

    // шаблоны
    b.append(h('h2', null, 'Шаблоны объявлений'));
    b.append(h('div', { class: 'dim small' }, 'Из чего собирается объявление. {следующая} и т.п. подставляют звук остановки; «фразы» — звуки выше. Можно поставить условие «если есть пропуски» — например, «со всеми остановками, кроме {без остановок}».'));
    b.append(h('div', { class: 'btns' }, Object.entries(INF.presets).map(([k, p]) => h('button', { class: 'btn sm ghost', onclick: () => confirmBox('Заменить шаблоны на стандартные «' + p.title + '»? Фразы останутся.', () => { applyPreset(l, k); save(); api.re(); }, 'Заменить') }, '↺ ' + p.title))));
    l.tpl = l.tpl || {};
    const T = [['start', 'Начальное — до отправления с конечной', 'Например: «Поезд следует до» {конечная} + «со всеми остановками» (если пропусков нет или не больше половины) + «кроме» {все без остановок} (если пропуски есть, но не больше половины) / «с остановками» {все остановки} (если пропусков больше половины). Пусто — не объявляется.'], ['dep', 'Отправление (двери закрываются)', ''], ['arr', 'Прибытие на остановку', ''], ['last', 'Прибытие на конечную', 'Пусто — как обычное прибытие.'], ['pass', 'Проезд без остановки — на каждую проезжаемую', 'Добавляется сам, когда до следующей остановки есть станции без остановки. {проезжаемая} — та, которую проезжаем. Если у станции записан звук «проезд без остановки (целой фразой)», вместо шаблона звучит он. Для электричек оставь пустым — там пропуски объявляются только в начальном.']];
    for (const [k, t, d] of T) {
      l.tpl[k] = l.tpl[k] || [];
      b.append(...[h('div', { class: 'tplname' }, t), d ? h('div', { class: 'tiny dim', style: { margin: '-4px 2px 6px' } }, d) : null].filter(Boolean), itemsEditor(l.tpl[k], { line: l, tokens: true, onChange: () => PL.rebuild() }));
      if (k === 'arr') b.append(h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => addTrimmedDest(l, api) }, ic('add'), '«Поезд следует до…» при укороченном рейсе')));
      if (k === 'start') b.append(h('div', { class: 'tiny dim', style: { margin: '8px 2px 4px' } }, 'Когда звучит начальное'), h('div', { class: 'seg' }, [['sep', 'отдельным объявлением'], ['dep', 'вместе с первым отправлением']].map(([v, t2]) => h('button', { class: (l.startWith || 'sep') === v ? 'on' : '', onclick: () => { l.startWith = v; save(); PL.rebuild(); api.re(); } }, t2))));
      if (k === 'pass') b.append(h('div', { class: 'tiny dim', style: { margin: '8px 2px 4px' } }, 'Когда объявлять проезд'), h('div', { class: 'seg' }, [['arr', 'при прибытии на предыдущую'], ['dep', 'при отправлении'], ['both', 'оба раза']].map(([v, t2]) => h('button', { class: (l.passAt || 'arr') === v ? 'on' : '', onclick: () => { l.passAt = v; save(); PL.rebuild(); api.re(); } }, t2))));
    }
  });
}
/** Метро: на каждой станции «Поезд следует до станции X», только если рейс укороченный */
function addTrimmedDest(l, api) {
  const done = () => { save(); PL.rebuild(); api.re(); };
  menu('Как записано «до станции…»', [
    { label: 'Фраза «Поезд следует до станции» + название конечной отдельно', do: () => pickClip(id => {
      l.phrases.dostm = { label: 'Поезд следует до станции', clip: id };
      l.tpl.arr.push({ pause: 400, cond: 'trimmed' }, { p: 'dostm', cond: 'trimmed' }, { t: 'dest', s: 'imya', cond: 'trimmed' });
      done();
      openSheet('Добавлено', b => b.append(h('p', null, 'В конец «Прибытия» добавлено: «Поезд следует до станции» + {конечная}. Звучит, только когда рейс укороченный.'), h('p', null, 'Название конечной берётся из звука «имя без „следующая“», а если его нет — из звука «при прибытии» (в пакетах метро это и есть просто название). Где нет ни того, ни другого — в пульте будет ⚠.'), h('button', { class: 'btn pri wide', onclick: () => UI.pop() }, 'Понятно')));
    }, 'Звук «Поезд следует до станции»') },
    { label: 'У каждой конечной своя запись целиком («Поезд следует до станции Автово»)', do: () => {
      l.tpl.arr.push({ pause: 400, cond: 'trimmed' }, { t: 'dest', s: 'dost', cond: 'trimmed' });
      done();
      openSheet('Добавлено', b => b.append(h('p', null, 'В конец «Прибытия» добавлено: {конечная: «до станции…» целой фразой}. Звучит, только когда рейс укороченный.'), h('p', null, 'Назначь запись станциям, где поезд может оборачиваться: Остановки → станция → «Другой звук» → «„до станции …“ целой фразой».'), h('button', { class: 'btn pri wide', onclick: () => UI.pop() }, 'Понятно')));
    } }
  ]);
}
function colorRow(cur, set) {
  return h('div', { class: 'colorrow', style: { margin: '6px 0' } }, LINE_COLORS.map(c => h('button', { class: 'swatch' + (c === cur ? ' on' : ''), style: { background: c }, onclick: () => set(c) })), h('input', { type: 'color', value: cur || '#d6083b', onchange: e => set(e.target.value) }));
}
function editStation(l, s, api) {
  openSheet('Остановка', b => {
    b.append(h('label', { class: 'f' }, h('span', null, 'Название'), h('input', { type: 'text', value: s.name, onchange: e => { s.name = e.target.value.trim() || s.name; save(); } })));
    b.append(h('div', { class: 'tplname' }, 'Звуки'));
    const keys = Object.keys(s.clips);
    if (!keys.length) b.append(h('div', { class: 'dim small' }, 'Пока нет ни одного. Главный — «название».'));
    b.append(h('div', { class: 'list' }, keys.map(k => { const [slot, d] = k.split('@'); return h('div', { class: 'li tap', onclick: () => pickClip(id => { s.clips[k] = id; save(); api.re(); }) },
      ib('play', () => AE.preview([{ c: s.clips[k] }])),
      h('div', { class: 'grow' }, h('div', null, (INF.SLOTS[slot] || slot) + (d ? ' · только направление ' + ['I', 'II', 'III', 'IV'][d - 1] : '')), h('div', { class: 'tiny dim ell' }, clipLabel(s.clips[k]))),
      ib('close', () => { delete s.clips[k]; save(); api.re(); UI.pop(); editStation(l, s, api); }, 'Убрать')); })));
    b.append(h('div', { class: 'btns' },
      h('button', { class: 'btn sm pri', onclick: () => pickClip(id => { s.clips.name = id; save(); api.re(); }, 'Звук названия «' + s.name + '»') }, '♪ Название'),
      h('button', { class: 'btn sm', onclick: () => menu('Какой звук', Object.entries(INF.SLOTS).map(([k, v]) => ({ label: v, do: () => menu('Для какого направления', [['', 'для всех'], ['@1', 'только I'], ['@2', 'только II']].map(([d, t]) => ({ label: t, do: () => pickClip(id => { s.clips[k + d] = id; save(); api.re(); }) }))) })).concat([{ label: 'свой…', do: () => prompt2('Ключ звука (латиницей), его можно вставить в шаблон', '', v => { const k = v.trim().replace(/[^a-z0-9_]/gi, ''); if (k) { INF.SLOTS[k] = INF.SLOTS[k] || k; pickClip(id => { s.clips[k] = id; save(); api.re(); }); } }) }])) }, ic('add'), 'Другой звук')));
    b.append(h('div', { class: 'tiny dim' }, '«При отправлении», «при прибытии», «конечная» — для метро, где на каждую станцию записана целая фраза. «Переход», «выход к…» звучат, только если вставлены в шаблон.'));
    b.append(h('div', { class: 'btns', style: { marginTop: '18px' } }, h('button', { class: 'btn danger sm', onclick: () => {
      const used = S.routes.filter(r => r.mode === 'build' && (r.path || []).some(e => e.st === s.id));
      confirmBox((used.length ? 'Остановка стоит в маршрутах: ' + used.map(r => r.name).join(', ') + ' — оттуда она тоже уйдёт. ' : '') + 'Удалить «' + s.name + '»?', () => {
        used.forEach(r => r.path = r.path.filter(e => e.st !== s.id)); l.stations = l.stations.filter(x => x !== s); save(); UI.pop(); api.re(); PL.rebuild();
      });
    } }, 'Удалить остановку')));
  });
}
/* подбор звуков названий по транслиту имени файла */
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const normName = s => s.toLowerCase().split('').map(ch => TR[ch] != null ? TR[ch] : ch).join('').replace(/kh/g, 'h').replace(/[^a-z0-9]/g, '');
function autoMatch(l, api) {
  const cands = Object.values(S.clips).map(c => ({ c, n: normName(INF.stem(c.name).replace(/^\d+[_\- ]*/, '')), raw: INF.stem(c.name).toLowerCase() }));
  let n = 0;
  for (const s of l.stations) {
    if (s.clips.name) continue;
    const key = normName(s.name), low = s.name.toLowerCase();
    const hit = cands.find(x => x.raw === low || x.raw.replace(/^\d+[_\- ]*/, '') === low) || cands.find(x => x.n && x.n === key) || cands.find(x => x.n.length >= 5 && key.length >= 5 && (x.n.startsWith(key) || key.startsWith(x.n)));
    if (hit) { s.clips.name = hit.c.id; n++; }
  }
  // фразы без звука: ключ фразы ↔ имя файла без номера (krome ↔ 00_krome.mp3)
  const PH = { krome: /krom/i, sost: /^(s_?ost|sostanov.*)$/i };
  for (const [k, p] of Object.entries(l.phrases || {})) {
    if (p.clip) continue;
    const re = PH[k] || new RegExp('^' + k.replace(/[^a-z0-9_]/gi, '') + '$', 'i');
    const hit = cands.find(x => re.test(INF.stem(x.c.name).replace(/^\d+[_\- ]*/, '')));
    if (hit) { p.clip = hit.c.id; n++; }
  }
  save(); api.re(); toast(n ? 'Назначено звуков: ' + n + '. Проверь на слух ▶' : 'Совпадений не нашлось');
}

/* ================= Редактор маршрута ================= */
function editRoute(r) {
  const ed = { cursor: null, mir: null, dirTab: 0 };
  openPage(r.name, (b, api, right) => {
    right.append(ib('play', () => previewRoute(r), 'Предпросмотр'), ib('more', () => routeMenu(r, api), 'Ещё'));
    b.append(h('label', { class: 'f' }, h('span', null, 'Название маршрута'), h('input', { type: 'text', value: r.name, onchange: e => { r.name = e.target.value.trim() || r.name; save(); api.title(r.name); } })));
    if (r.mode === 'build') buildSection(r, b, api, ed); else listSection(r, b, api, ed);
    rulesSection(r, b, api);
    insertsSection(r, b, api);
    b.append(h('div', { class: 'btns', style: { marginTop: '22px' } }, h('button', { class: 'btn pri wide', onclick: () => { PL.setRoute(r.id); UI.stack.splice(0).forEach(e => e.close()); UI.go('player'); } }, ic('play'), 'В пульт')));
  });
}
function routeMenu(r, api) {
  const m = [
    { label: '⇪ Поделиться маршрутом (zip со звуками)', do: () => exportRoute(r) },
    { label: '⧉ Дублировать', do: () => { const c = INF.clone(r); c.id = INF.uid(); c.name = r.name + ' (копия)'; S.routes.push(c); save(); toast('Копия создана'); } }];
  if (r.mode === 'list') m.push({ label: '◎ Сделать линию и маршрут-кольцо из этого списка', do: () => listToBuild(r) });
  else m.push({ label: '☰ Превратить в список для ручной правки (копия)', do: () => buildToList(r) });
  m.push({ label: 'Удалить маршрут', danger: 1, do: () => confirmBox('Удалить маршрут «' + r.name + '»? Звуки останутся.', () => { S.routes = S.routes.filter(x => x !== r); save(); PL.load(); UI.pop(); }) });
  menu(r.name, m);
}
/** Маршрут-список → линия + маршрут по станциям. Возвращает новый маршрут или null */
function makeBuildFromList(r) {
  const res = INF.lineFromList(r, clip, Object.values(S.clips));
  if (res.line.stations.length < 2) { toast('Не получилось распознать станции (нужны подписи «Отпр. …» / «Приб. …»)'); return null; }
  res.line.color = r.color || res.line.color;
  S.lines.push(res.line);
  const nr = { id: INF.uid(), mode: 'build', name: r.name + ' (по станциям)', line: res.line.id, path: res.path, rules: res.rules.concat(INF.clone(r.rules || [])), inserts: [], from: r.id };
  S.routes.push(nr); save();
  return nr;
}
function listToBuild(r) {
  const nr = makeBuildFromList(r); if (!nr) return;
  const res = { line: lineById(nr.line) };
  UI.pop(); editRoute(nr);
  openSheet('Готово', b => b.append(h('p', null, 'Создана линия «' + res.line.name + '» (' + res.line.stations.length + ' остановок) и маршрут-кольцо. Перевод приблизительный: послушай предпросмотр ▶ и поправь шаблоны в линии.'), h('p', { class: 'dim small' }, 'Исходный маршрут-список остался как был.'), h('button', { class: 'btn pri wide', onclick: () => UI.pop() }, 'Понятно')));
}
function buildToList(r) {
  const dn = INF.dirNames(r, S.lines);
  const bare = Object.assign({}, r, { rules: [], inserts: [] });
  const dirs = dn.map(d => INF.buildAnnouncements(bare, S.lines, d.id).map(a => ({ id: INF.uid(), name: a.label, off: false, items: a.segs.map(s => s.pause ? { pause: s.pause } : { c: s.c }) })));
  const l = lineById(r.line);
  const nr = { id: INF.uid(), mode: 'list', name: r.name + ' (список)', city: l ? l.city : '', type: l ? l.type : '', line: l ? l.name : '', color: routeColor(r), circle: dn.length === 1 && dn[0].ring, dirs, rules: INF.clone(r.rules || []), inserts: [] };
  S.routes.push(nr); save(); UI.pop(); editRoute(nr);
}
function previewRoute(r) {
  openSheet('Предпросмотр', b => {
    const dn = INF.dirNames(r, S.lines);
    if (!dn.length) { b.append(h('div', { class: 'empty' }, 'Пока нечего показывать: нужно минимум две остановки в пути.')); return; }
    for (const d of dn) {
      const anns = INF.buildAnnouncements(r, S.lines, d.id, S.service);
      b.append(h('h2', null, d.short + ' → ' + d.title + ' · ' + anns.length));
      b.append(h('div', { class: 'list' }, anns.map(a => h('div', { class: 'li' }, ib('play', () => AE.preview(a.segs.concat(...(a.then || []).map(t => [{ pause: t.delay || 300 }].concat(t.segs))))),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, a.label), h('div', { class: 'tiny dim' }, a.segs.map(s => s.pause ? '⏸' : clipLabel(s.c)).join(' + ')),
          a.warn.length ? h('div', { class: 'warnbox' }, a.warn.join('; ')) : null)))));
    }
  });
}

/* ---- путь-кольцо ---- */
function suggest(r, line, ed) {
  const P = r.path, c = ed.cursor == null ? P.length : ed.cursor;
  const byId = id => line.stations.find(s => s.id === id);
  let t = -1; for (let i = c - 1; i >= 1; i--) if (P[i].term) { t = i; break; }
  if (t > 0) {
    let tp = 0; for (let i = t - 1; i >= 0; i--) if (P[i].term) { tp = i; break; }
    const m = (ed.mir && ed.mir.t === P[t].id && ed.mir.c === c) ? ed.mir.m : t - (c - 1 - t);
    if (m - 1 > tp) return { mode: 'mirror', st: byId(P[m - 1].st), src: P[m - 1], m, tId: P[t].id, c };
    return { mode: 'mirror', st: null, closing: byId(P[tp].st), c };
  }
  const last = c > 0 ? P[c - 1] : null;
  if (!last) return { mode: 'fwd', st: line.stations[0] || null, c };
  const k = line.stations.findIndex(s => s.id === last.st);
  return { mode: 'fwd', st: line.stations[k + 1] || null, c, last };
}
function buildSection(r, b, api, ed) {
  const line = lineById(r.line);
  b.append(h('label', { class: 'f' }, h('span', null, 'Линия (справочник остановок)'), h('div', { class: 'row' },
    h('select', { onchange: e => { r.line = e.target.value; r.path = []; save(); api.re(); } }, S.lines.map(l => h('option', { value: l.id, selected: l.id === r.line }, l.name))),
    line ? h('button', { class: 'btn sm', onclick: () => editLine(line) }, 'Открыть') : null)));
  if (!line) { b.append(h('div', { class: 'warnbox' }, 'Линия не найдена')); return; }
  r.path = r.path || [];
  const dn = INF.dirNames(r, S.lines);
  b.append(h('h2', null, 'Путь маршрута — по кругу'));
  b.append(h('div', { class: 'dim small', style: { marginBottom: '8px' } }, dn.length ? 'Направления: ' + dn.map(d => d.short + (d.ring ? ' кольцевой' : ' → ' + d.title)).join(', ') : 'Добавляй остановки по порядку «туда», на развороте отметь конечную — и продолжай «обратно»: программа будет подсказывать остановки в обратном порядке.'));
  const P = r.path, byId = id => line.stations.find(s => s.id === id);
  const list = h('div', { class: 'diag' });
  const cur = ed.cursor == null ? P.length : ed.cursor;
  const cursorRow = () => h('div', { class: 'pass', style: { color: 'var(--rc)', fontWeight: 600 } }, h('div', { class: 'rail' }), '▸ сюда добавляются остановки', ed.cursor != null ? h('button', { class: 'btn sm ghost', onclick: () => { ed.cursor = null; api.re(); } }, 'в конец') : null);
  P.forEach((e, i) => {
    if (i === cur && ed.cursor != null) list.append(cursorRow());
    const st = byId(e.st);
    const row = h('div', { class: 'an ' + (e.term ? 'last' : 'arr') + (e.skip ? ' off' : '') },
      h('div', { class: 'rail' }, h('div', { class: 'mk' })),
      h('div', { class: 'body', onclick: () => pathMenu(r, line, ed, i, api) },
        h('span', { class: 'stnum' }, i + 1),
        h('div', { class: 'tt' }, h('div', { class: 'lb ell' }, st ? st.name : '???'),
          (e.term || e.skip) ? h('div', { class: 'sb' }, e.term ? '⟲ конечная' : '', e.skip ? 'без остановки' : '') : null),
        e.term ? null : h('label', { class: 'row tiny dim', onclick: ev => ev.stopPropagation() }, 'ост.', sw(!e.skip, v => { e.skip = !v; save(); api.re(); PL.rebuild(); }))));
    list.append(row);
  });
  if (cur === P.length && P.length) list.append(cursorRow());
  b.append(list);
  // панель добавления
  const sg = suggest(r, line, ed);
  const insert = (stId, fromSug) => {
    const c = sg.c;
    P.splice(c, 0, { id: INF.uid(), st: stId, term: P.length === 0 });
    if (ed.cursor != null) ed.cursor = c + 1;
    if (sg.mode === 'mirror' && sg.st) ed.mir = { t: sg.tId, c: c + 1, m: sg.m - 1 };
    save(); PL.rebuild(); api.re();
  };
  const panel = h('div', { class: 'card', style: { marginTop: '10px' } });
  panel.append(h('div', { class: 'tiny dim', style: { marginBottom: '6px' } }, sg.mode === 'mirror' ? '↩ Обратное направление — подсказка по прямому' : P.length ? '→ Прямое направление — по справочнику' : 'Начни с первой конечной'));
  if (sg.st) panel.append(h('button', { class: 'btn pri wide', onclick: () => insert(sg.st.id, true) }, ic('add'), sg.st.name));
  else if (sg.closing) panel.append(h('div', { class: 'small', style: { margin: '4px 0 8px' } }, '✓ Дальше кольцо замыкается на «' + sg.closing.name + '». Остановок не осталось.'));
  else panel.append(h('div', { class: 'small dim', style: { margin: '4px 0 8px' } }, line.stations.length ? 'Справочник закончился — выбери остановку вручную или отметь разворот.' : 'В линии нет остановок — добавь их в справочник.'));
  const row2 = h('div', { class: 'btns', style: { margin: '8px 0 0' } });
  if (sg.mode === 'mirror' && sg.st) {
    row2.append(h('button', { class: 'btn sm', onclick: () => { ed.mir = { t: sg.tId, c: sg.c, m: sg.m - 1 }; api.re(); } }, 'Пропустить «' + sg.st.name + '»'));
    row2.append(h('button', { class: 'btn sm', onclick: () => {
      let g = suggest(r, line, ed), n = 0;
      while (g.mode === 'mirror' && g.st && n < 500) { P.splice(g.c, 0, { id: INF.uid(), st: g.st.id }); if (ed.cursor != null) ed.cursor = g.c + 1; ed.mir = { t: g.tId, c: g.c + 1, m: g.m - 1 }; g = suggest(r, line, ed); n++; }
      save(); PL.rebuild(); api.re(); toast('Добавлено: ' + n);
    } }, 'Зеркально до конца'));
  }
  row2.append(h('button', { class: 'btn sm', onclick: () => pickStation(line, id => insert(id)) }, sg.st ? 'Другая…' : 'Выбрать…'));
  if (sg.mode === 'fwd' && sg.st) row2.append(h('button', { class: 'btn sm', onclick: () => pickStation(line, id => {
    const k0 = line.stations.indexOf(sg.st), k1 = line.stations.findIndex(s => s.id === id);
    if (k1 < k0) { toast('Эта остановка раньше по справочнику'); return; }
    let c = sg.c; for (let k = k0; k <= k1; k++) { P.splice(c, 0, { id: INF.uid(), st: line.stations[k].id, term: P.length === 0 }); c++; }
    if (ed.cursor != null) ed.cursor = c;
    save(); PL.rebuild(); api.re();
  }, 'Добавить подряд до…') }, 'Подряд до…'));
  if (sg.mode === 'fwd' && sg.last && !sg.last.term && P.length > 1) row2.append(h('button', { class: 'btn sm', onclick: () => { sg.last.term = true; ed.mir = null; save(); PL.rebuild(); api.re(); } }, '⟲ Разворот на «' + (byId(sg.last.st) || {}).name + '»'));
  panel.append(row2);
  b.append(panel);
}
function pathMenu(r, line, ed, i, api) {
  const P = r.path, e = P[i], st = line.stations.find(s => s.id === e.st) || { name: '???' };
  const done = () => { save(); PL.rebuild(); api.re(); };
  menu((i + 1) + '. ' + st.name, [
    { label: e.term ? '⟲ Убрать отметку «конечная»' : '⟲ Конечная (разворот / смена направления)', do: () => { e.term = !e.term; if (e.term) e.skip = false; ed.mir = null; done(); } },
    e.term ? null : { label: e.skip ? '✓ Останавливаться' : '⊘ Без остановки', do: () => { e.skip = !e.skip; done(); } },
    { label: '▸ Добавлять остановки после неё', do: () => { ed.cursor = i + 1; ed.mir = null; api.re(); } },
    { label: '⇄ Заменить на другую…', do: () => pickStation(line, id => { e.st = id; done(); }) },
    st.clips && st.clips.name ? { label: '▶ Звук названия', do: () => AE.preview([{ c: st.clips.name }]) } : null,
    i > 0 ? { label: '↑ Выше', do: () => { P.splice(i - 1, 0, P.splice(i, 1)[0]); done(); } } : null,
    i < P.length - 1 ? { label: '↓ Ниже', do: () => { P.splice(i + 1, 0, P.splice(i, 1)[0]); done(); } } : null,
    { label: P.some(x => x.term) ? '↻ Сделать кольцевым (снять все конечные)' : '', do: () => { P.forEach(x => x.term = false); done(); } },
    { label: '✕ Убрать из пути', danger: 1, do: () => { P.splice(i, 1); if (ed.cursor != null && ed.cursor > i) ed.cursor--; ed.mir = null; done(); } }
  ].filter(x => x && x.label));
}

/* ---- маршрут-список ---- */
function listSection(r, b, api, ed) {
  const fld = (label, key) => h('label', { class: 'f' }, h('span', null, label), h('input', { type: 'text', value: r[key] || '', onchange: e => { r[key] = e.target.value.trim(); save(); } }));
  b.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, fld('Город', 'city')), h('div', { class: 'grow' }, fld('Вид', 'type'))), fld('Линия', 'line'));
  b.append(colorRow(r.color, c => { r.color = c; save(); api.re(); UI.render(); }));
  b.append(h('div', { class: 'li', style: { padding: '8px 2px' } }, h('div', { class: 'grow' }, 'Кольцевой (после последнего — снова первое)'), sw(!!r.circle, v => { r.circle = v; save(); PL.rebuild(); })));
  const R = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  if (ed.dirTab >= r.dirs.length) ed.dirTab = 0;
  b.append(h('h2', null, 'Объявления'));
  const seg = h('div', { class: 'seg' });
  r.dirs.forEach((d, i) => seg.append(h('button', { class: ed.dirTab === i ? 'on' : '', onclick: () => { ed.dirTab = i; api.re(); } }, R[i] + ' · ' + d.length)));
  if (r.dirs.length < 6) seg.append(h('button', { style: { flex: '0 0 auto', padding: '9px 12px' }, onclick: () => { r.dirs.push([]); ed.dirTab = r.dirs.length - 1; save(); api.re(); } }, '+'));
  b.append(seg);
  const D = r.dirs[ed.dirTab] || [];
  const list = h('div', { class: 'list', style: { marginTop: '10px' } });
  D.forEach((a, i) => list.append(h('div', { class: 'li tap' + (a.off ? ' dim' : ''), onclick: () => editListItem(r, D, i, api) },
    ib('play', () => AE.preview(INF.expand(a.items, { dir: ed.dirTab }))),
    h('div', { class: 'grow' }, h('div', { class: 'ell', style: { fontWeight: 600, textDecoration: a.off ? 'line-through' : '' } }, a.name), h('div', { class: 'tiny dim ell' }, a.items.map(x => itemLabel(x)).join(' + '))),
    a.items.some(x => x.miss) ? h('span', { class: 'badge w' }, '⚠') : null,
    i > 0 ? ib('up', () => { D.splice(i - 1, 0, D.splice(i, 1)[0]); save(); api.re(); }) : null)));
  b.append(list);
  b.append(h('div', { class: 'btns' },
    h('button', { class: 'btn sm', onclick: () => { D.push({ id: INF.uid(), name: 'Новое объявление', off: false, items: [] }); save(); editListItem(r, D, D.length - 1, api); } }, ic('add'), 'Объявление'),
    r.dirs.length > 1 ? h('button', { class: 'btn sm ghost', onclick: () => confirmBox('Удалить направление ' + R[ed.dirTab] + ' со всеми объявлениями?', () => { r.dirs.splice(ed.dirTab, 1); ed.dirTab = 0; save(); api.re(); }) }, 'Удалить направление') : null));
}
function editListItem(r, D, i, api) {
  const a = D[i];
  openSheet('Объявление', b => {
    b.append(h('label', { class: 'f' }, h('span', null, 'Подпись (начни с «Отпр.» или «Приб.» — так работают регулярные)'), h('input', { type: 'text', value: a.name, onchange: e => { a.name = e.target.value.trim() || a.name; save(); api.re(); } })));
    b.append(itemsEditor(a.items, { onChange: () => { api.re(); PL.rebuild(); } }));
    b.append(h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => AE.preview(INF.expand(a.items, { dir: 0 })) }, ic('play'), 'Слушать'),
      h('button', { class: 'btn', onclick: () => { a.off = !a.off; save(); api.re(); PL.rebuild(); UI.pop(); } }, a.off ? 'Включить' : 'Пропускать'),
      h('button', { class: 'btn', onclick: () => { D.splice(i + 1, 0, Object.assign(INF.clone(a), { id: INF.uid() })); save(); api.re(); UI.pop(); } }, 'Дублировать'),
      h('button', { class: 'btn danger', onclick: () => { D.splice(i, 1); save(); api.re(); PL.rebuild(); UI.pop(); } }, 'Удалить')));
  });
}

/* ---- регулярные ---- */
const AT = { dep: 'при отправлении', arr: 'при прибытии', both: 'и там, и там' };
function rulesSection(r, b, api) {
  r.rules = r.rules || [];
  b.append(h('h2', null, 'Регулярные объявления'));
  b.append(h('div', { class: 'dim small', style: { marginBottom: '8px' } }, 'Добавляются к объявлениям сами: «Трамвай следует в парк», «Держитесь за поручни»… Включаются и выключаются прямо в пульте.'));
  if (r.rules.length) b.append(h('div', { class: 'list' }, r.rules.map(x => h('div', { class: 'li tap', onclick: () => editRule(r, x, api) },
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, x.name), h('div', { class: 'tiny dim' }, AT[x.at] + ', ' + (x.pos === 'before' ? 'перед' : 'после') + ', ' + ((x.every | 0) > 1 ? 'каждая ' + x.every + '-я' : 'каждая') + ', вариантов: ' + x.variants.length)),
    sw(x.enabled, v => { x.enabled = v; save(); PL.rebuild(); })))));
  b.append(h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => { const x = { id: INF.uid(), name: 'В парк', enabled: true, at: 'dep', pos: 'after', every: 1, offset: 0, mode: 'rotate', variants: [[]] }; r.rules.push(x); save(); editRule(r, x, api); } }, ic('add'), 'Регулярное')));
}
function editRule(r, x, api) {
  const line = r.mode === 'build' ? lineById(r.line) : null;
  openSheet('Регулярное объявление', b => {
    const re = () => { save(); PL.rebuild(); };
    const segb = (opts, val, set) => h('div', { class: 'seg', style: { margin: '6px 0' } }, Object.entries(opts).map(([k, v]) => h('button', { class: val === k ? 'on' : '', onclick: e => { set(k); re(); [...e.target.parentNode.children].forEach(c => c.classList.toggle('on', c === e.target)); } }, v)));
    b.append(h('label', { class: 'f' }, h('span', null, 'Название (кнопка в пульте)'), h('input', { type: 'text', value: x.name, onchange: e => { x.name = e.target.value.trim() || x.name; re(); } })));
    b.append(h('div', { class: 'tiny dim' }, 'Когда'), segb(AT, x.at, v => x.at = v), segb({ after: 'после объявления', before: 'перед ним' }, x.pos, v => x.pos = v));
    b.append(h('div', { class: 'row' },
      h('label', { class: 'f grow' }, h('span', null, 'Каждое N-е'), h('input', { type: 'number', min: 1, value: x.every || 1, onchange: e => { x.every = Math.max(1, +e.target.value | 0); re(); } })),
      h('label', { class: 'f grow' }, h('span', null, 'Начиная с №'), h('input', { type: 'number', min: 0, value: x.offset || 0, onchange: e => { x.offset = Math.max(0, +e.target.value | 0); re(); } }))));
    b.append(h('div', { class: 'tiny dim' }, 'Если вариантов несколько'), segb({ rotate: 'по очереди', random: 'случайно' }, x.mode || 'rotate', v => x.mode = v));
    x.variants.forEach((v, i) => b.append(h('div', { class: 'tplname' }, 'Вариант ' + (i + 1), x.variants.length > 1 ? h('button', { class: 'btn sm ghost', onclick: () => { x.variants.splice(i, 1); re(); UI.pop(); editRule(r, x, api); } }, 'убрать') : null), itemsEditor(v, { line, tokens: !!line, onChange: () => { PL.rebuild(); api.re(); } })));
    b.append(h('div', { class: 'btns' },
      h('button', { class: 'btn sm', onclick: () => { x.variants.push([]); re(); UI.pop(); editRule(r, x, api); } }, ic('add'), 'Вариант'),
      h('button', { class: 'btn sm danger', onclick: () => { r.rules = r.rules.filter(y => y !== x); re(); UI.pop(); api.re(); } }, 'Удалить')));
    api.onclose = null;
  });
}

/* ---- служебные ---- */
function editService(sv) {
  const isNew = !sv;
  if (isNew) { sv = { id: INF.uid(), label: 'Служебное', items: [] }; S.service.push(sv); save(); }
  const sheet = openSheet(isNew ? 'Новое служебное' : 'Служебное сообщение', b => {
    b.append(h('label', { class: 'f' }, h('span', null, 'Подпись кнопки'), h('input', { type: 'text', value: sv.label, onchange: e => { sv.label = e.target.value.trim() || sv.label; save(); } })));
    b.append(h('div', { class: 'tiny dim', style: { margin: '6px 2px' } }, 'Из каких звуков собрано'), itemsEditor(sv.items, { onChange: () => PL.rebuild() }));
    b.append(h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => AE.preview(INF.expand(sv.items, { dir: 0 })) }, ic('play'), 'Слушать'),
      h('button', { class: 'btn danger', onclick: () => confirmBox('Удалить «' + sv.label + '»? Привязки к маршрутам тоже уйдут.', () => { S.service = S.service.filter(x => x !== sv); S.routes.forEach(r => r.inserts = (r.inserts || []).filter(x => x.svc !== sv.id)); save(); PL.rebuild(); UI.pop(); }) }, 'Удалить')));
  });
  sheet.onclose = () => { if (isNew && !sv.items.length && sv.label === 'Служебное') { S.service = S.service.filter(x => x !== sv); save(); } };
}
function annLabelByKey(r, k) {
  const dn = INF.dirNames(r, S.lines);
  for (const d of dn) { const a = INF.buildAnnouncements(Object.assign({}, r, { inserts: [] }), S.lines, d.id).find(a => a.k === k); if (a) return d.short + ': ' + a.label; }
  return '(объявление не найдено)';
}
function insertsSection(r, b, api) {
  r.inserts = r.inserts || [];
  b.append(h('h2', null, 'Служебные после объявлений'));
  if (r.inserts.length) b.append(h('div', { class: 'list' }, r.inserts.map(x => { const sv = svcById(x.svc); return h('div', { class: 'li tap', onclick: () => editInsert(r, x, api) },
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, sv ? sv.label : '?'), h('div', { class: 'tiny dim ell' }, 'после «' + annLabelByKey(r, x.after) + '» · ' + (x.mode === 'step' ? 'отдельным шагом' : 'само через ' + ((x.delay || 0) / 1000) + ' с')))); })));
  else b.append(h('div', { class: 'dim small' }, 'Например: после прибытия на конечную через 3 с — «Поезд дальше не идёт». Быстрее всего: долгое нажатие на объявление в пульте.'));
  b.append(h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => pickAnn(r, a => editInsert(r, { after: a.k, dir: a.dir }, api)) }, ic('add'), 'Привязать')));
}
function pickAnn(r, cb) {
  openSheet('После какого объявления', b => {
    for (const d of INF.dirNames(r, S.lines)) {
      b.append(h('h2', null, d.short + (d.ring ? '' : ' → ' + d.title)));
      b.append(h('div', { class: 'list' }, INF.buildAnnouncements(Object.assign({}, r, { inserts: [] }), S.lines, d.id).map(a => h('div', { class: 'li tap', onclick: () => { UI.pop(); cb(a); } }, h('div', { class: 'grow' }, h('div', null, a.label), a.sub ? h('div', { class: 'tiny dim' }, a.sub) : null)))));
    }
  });
}
function editInsert(r, x, api) {
  const isNew = !x.id;
  if (isNew) Object.assign(x, { id: INF.uid(), svc: S.service[0] ? S.service[0].id : null, mode: 'auto', delay: 2000 });
  const refresh = () => { save(); PL.rebuild(); if (api) api.re(); UI.refreshPlayer(); };
  openSheet('Служебное после объявления', b => {
    b.append(h('div', { class: 'small dim' }, 'После: ', h('b', { style: { color: 'var(--tx)' } }, annLabelByKey(r, x.after))));
    b.append(h('div', { class: 'tplname' }, 'Что объявить'));
    b.append(h('div', { class: 'list' }, S.service.map(sv => h('div', { class: 'li tap', onclick: () => { x.svc = sv.id; b.querySelectorAll('.svcr').forEach(n => n.textContent = ''); b.querySelector('#sv' + sv.id).textContent = '✓'; } },
      h('span', { class: 'svcr', id: 'sv' + sv.id, style: { width: '18px', color: 'var(--rc)', fontWeight: 700 } }, x.svc === sv.id ? '✓' : ''),
      h('div', { class: 'grow' }, sv.label), ib('play', () => AE.preview(INF.expand(sv.items, { dir: 0 })))))));
    b.append(h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => { UI.pop(); editService(null); } }, ic('add'), 'Новое служебное')));
    b.append(h('div', { class: 'tplname' }, 'Как'));
    const seg = h('div', { class: 'seg' }, [['auto', 'само после паузы'], ['step', 'отдельным шагом']].map(([k, v]) => h('button', { class: x.mode === k ? 'on' : '', onclick: e => { x.mode = k; [...seg.children].forEach(c => c.classList.toggle('on', c === e.target)); dl.style.display = k === 'auto' ? '' : 'none'; } }, v)));
    const val = h('b', null, ((x.delay || 0) / 1000) + ' с');
    const dl = h('label', { class: 'f', style: { display: x.mode === 'auto' ? '' : 'none' } }, h('span', null, 'Пауза перед ним: ', val), h('input', { type: 'range', min: 0, max: 30000, step: 500, value: x.delay || 0, oninput: e => { x.delay = +e.target.value; val.textContent = (x.delay / 1000) + ' с'; } }));
    b.append(seg, dl);
    b.append(h('div', { class: 'btns' },
      h('button', { class: 'btn pri', onclick: () => { if (!x.svc) { toast('Выбери или создай служебное'); return; } if (!r.inserts.includes(x)) r.inserts.push(x); UI.pop(); refresh(); } }, 'Сохранить'),
      !isNew ? h('button', { class: 'btn danger', onclick: () => { r.inserts = r.inserts.filter(y => y !== x); UI.pop(); refresh(); } }, 'Удалить привязку') : null));
  });
}

/* ================= Нарезка записи ================= */
function openSlicer() {
  const st = { buf: null, mono: null, file: null, name: '', segs: [], sel: -1, zoom: 1, cursor: 0, db: -42, minSil: 450, pack: '', peaks: null, pw: 0, src: null };
  const playRegion = (a, b2) => {
    AE.stopPreview();
    const ac = AE.ac(), s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = S.set.vol;
    s.buffer = st.buf; s.connect(g).connect(ac.destination); s.start(0, a, Math.max(0.05, b2 - a)); AE.prev = s;
  };
  const split = () => { st.segs = INF.splitBySilence(st.mono, st.buf.sampleRate, { db: st.db, minSil: st.minSil }).map((s, i) => Object.assign(s, { name: '' })); st.sel = st.segs.length ? 0 : -1; };
  openPage('Нарезка записи', (b, api) => {
    if (!st.buf) {
      b.append(h('div', { class: 'card help' },
        h('p', null, 'Загрузи длинную запись (mp3, wav, m4a…) — например, все объявления подряд. Программа разрежет её по паузам, ты поправишь границы, подпишешь кусочки и сохранишь их в банк звуков.'),
        h('button', { class: 'btn pri wide', onclick: () => {
          const f = $('#fileIn'); f.accept = 'audio/*,.mp3,.wav,.ogg,.m4a'; f.multiple = false;
          f.onchange = async () => {
            const file = f.files[0]; f.value = ''; f.multiple = true; if (!file) return;
            toast('Декодирую…', 5000);
            try {
              const buf = await AE.ac().decodeAudioData(await file.arrayBuffer());
              const mono = new Float32Array(buf.length);
              for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
              Object.assign(st, { buf, mono, file, name: INF.stem(file.name), pack: '' });
              split(); api.re(); toast('Нашлось кусочков: ' + st.segs.length);
            } catch (e) { toast('Не удалось прочитать файл: ' + e.message, 4000); }
          };
          f.click();
        } }, ic('upload'), 'Выбрать запись')));
      return;
    }
    const dur = st.buf.duration;
    b.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, st.name), h('div', { class: 'tiny dim' }, fmtT(dur) + ' · кусочков: ' + st.segs.length)),
      h('button', { class: 'btn sm ghost', onclick: () => { st.buf = null; api.re(); } }, 'Другой файл')));
    // волна
    const box = h('div', { class: 'wavebox' });
    const cv = h('canvas', { style: { touchAction: 'none' } });
    box.append(cv); b.append(box);
    const draw = () => {
      const W = Math.max(300, Math.floor((box.clientWidth || 340) * st.zoom)), H = 150;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, 16000 / W);
      cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (st.pw !== W) {
        const spp = st.mono.length / W; st.peaks = new Float32Array(W * 2);
        for (let x = 0; x < W; x++) { let mn = 0, mx = 0; const a = Math.floor(x * spp), e = Math.min(st.mono.length, Math.floor((x + 1) * spp)); for (let i = a; i < e; i++) { const v = st.mono[i]; if (v < mn) mn = v; else if (v > mx) mx = v; } st.peaks[x * 2] = mn; st.peaks[x * 2 + 1] = mx; }
        st.pw = W;
      }
      const rc = getComputedStyle(document.documentElement).getPropertyValue('--rc').trim() || '#d6083b';
      g.clearRect(0, 0, W, H);
      st.segs.forEach((s, i) => { const x0 = s.start / dur * W, x1 = s.end / dur * W; g.fillStyle = i === st.sel ? rc + '55' : (i % 2 ? '#3b82f622' : '#22c55e22'); g.fillRect(x0, 0, x1 - x0, H); });
      g.fillStyle = '#9aa3b2';
      for (let x = 0; x < W; x++) { const mn = st.peaks[x * 2], mx = st.peaks[x * 2 + 1]; g.fillRect(x, H / 2 - mx * H * 0.48, 1, Math.max(1, (mx - mn) * H * 0.48)); }
      st.segs.forEach((s, i) => { for (const t of [s.start, s.end]) { const x = t / dur * W; g.fillStyle = i === st.sel ? rc : '#e5e7eb99'; g.fillRect(x - 1, 0, 2, H); if (i === st.sel) { g.beginPath(); g.arc(x, H - 10, 7, 0, 7); g.fill(); } } g.fillStyle = '#e5e7ebcc'; g.font = '11px system-ui'; g.fillText(String(i + 1), s.start / dur * W + 3, 12); });
      const cx = st.cursor / dur * W; g.fillStyle = '#ffd400'; g.fillRect(cx - 0.5, 0, 1, H);
    };
    // жесты: перетаскивание границы / прокрутка / тап
    let drag = null;
    cv.addEventListener('pointerdown', e => {
      const W = st.pw, x = e.offsetX, t = x / W * dur;
      let best = null, bd = 16;
      st.segs.forEach((s, i) => ['start', 'end'].forEach(edge => { const d = Math.abs(s[edge] / dur * W - x); if (d < bd) { bd = d; best = { i, edge }; } }));
      drag = best ? { kind: 'edge', ...best } : { kind: 'pan', x0: e.clientX, sl: box.scrollLeft, moved: false, t };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      if (drag.kind === 'edge') {
        const s = st.segs[drag.i], t = Math.max(0, Math.min(dur, e.offsetX / st.pw * dur));
        const prev = st.segs[drag.i - 1], next = st.segs[drag.i + 1];
        if (drag.edge === 'start') s.start = Math.min(Math.max(t, prev ? prev.end : 0), s.end - 0.05);
        else s.end = Math.max(Math.min(t, next ? next.start : dur), s.start + 0.05);
        st.sel = drag.i; draw();
      } else { const dx = e.clientX - drag.x0; if (Math.abs(dx) > 6) drag.moved = true; box.scrollLeft = drag.sl - dx; }
    });
    cv.addEventListener('pointerup', () => {
      if (!drag) return;
      if (drag.kind === 'pan' && !drag.moved) { st.cursor = drag.t; const i = st.segs.findIndex(s => drag.t >= s.start && drag.t <= s.end); st.sel = i; drag = null; draw(); drawList(); if (i >= 0) playRegion(st.segs[i].start, st.segs[i].end); return; }
      drag = null; drawList();
    });
    setTimeout(draw, 0);
    b.append(h('label', { class: 'f' }, h('span', null, 'Масштаб'), h('input', { type: 'range', min: 1, max: 40, step: 1, value: st.zoom, oninput: e => { const c = (box.scrollLeft + box.clientWidth / 2) / st.pw; st.zoom = +e.target.value; draw(); box.scrollLeft = c * st.pw - box.clientWidth / 2; } })));
    // точная подстройка выбранного
    const fine = h('div');
    b.append(fine);
    const nud = (edge, d) => { const s = st.segs[st.sel]; if (!s) return; s[edge] = Math.max(0, Math.min(dur, s[edge] + d)); if (s.end - s.start < 0.05) s[edge] -= d; draw(); drawList(); };
    const drawFine = () => {
      fine.innerHTML = '';
      const s = st.segs[st.sel];
      fine.append(h('div', { class: 'btns' },
        s ? h('button', { class: 'btn sm', onclick: () => playRegion(s.start, s.end) }, ic('play'), '№' + (st.sel + 1)) : null,
        h('button', { class: 'btn sm', onclick: () => playRegion(st.cursor, Math.min(dur, st.cursor + 3)) }, '▶ с жёлтой'),
        h('button', { class: 'btn sm', onclick: () => {
          const i = st.segs.findIndex(x => st.cursor > x.start + 0.05 && st.cursor < x.end - 0.05);
          if (i >= 0) { const x = st.segs[i]; st.segs.splice(i + 1, 0, { start: st.cursor, end: x.end, name: '' }); x.end = st.cursor; st.sel = i; }
          else { const after = st.segs.filter(x => x.end <= st.cursor).length; st.segs.splice(after, 0, { start: st.cursor, end: Math.min(dur, st.cursor + 1), name: '' }); st.sel = after; }
          draw(); drawList();
        } }, ic('cut'), 'Разрезать / добавить у жёлтой')));
      if (s) fine.append(h('div', { class: 'row tiny dim', style: { gap: '6px', flexWrap: 'wrap' } }, 'Начало', h('button', { class: 'btn sm', onclick: () => nud('start', -0.02) }, '−20мс'), h('button', { class: 'btn sm', onclick: () => nud('start', 0.02) }, '+20мс'), ' Конец', h('button', { class: 'btn sm', onclick: () => nud('end', -0.02) }, '−20мс'), h('button', { class: 'btn sm', onclick: () => nud('end', 0.02) }, '+20мс')));
    };
    // параметры автонарезки
    b.append(h('details', { class: 'card', style: { marginTop: '10px' } }, h('summary', { class: 'small' }, 'Автонарезка по паузам'),
      h('label', { class: 'f' }, h('span', null, 'Порог тишины: ', h('b', { id: 'dbv' }, st.db + ' дБ')), h('input', { type: 'range', min: -70, max: -15, step: 1, value: st.db, oninput: e => { st.db = +e.target.value; $('#dbv').textContent = st.db + ' дБ'; } })),
      h('label', { class: 'f' }, h('span', null, 'Минимальная пауза: ', h('b', { id: 'msv' }, st.minSil + ' мс')), h('input', { type: 'range', min: 120, max: 2000, step: 10, value: st.minSil, oninput: e => { st.minSil = +e.target.value; $('#msv').textContent = st.minSil + ' мс'; } })),
      h('button', { class: 'btn sm', onclick: () => { split(); draw(); drawList(); toast('Кусочков: ' + st.segs.length); } }, 'Разрезать заново (подписи сбросятся)')));
    // список кусочков
    b.append(h('h2', null, 'Кусочки — подпиши их'));
    const lst = h('div', { class: 'list segl' });
    b.append(lst);
    const drawList = () => {
      drawFine();
      lst.innerHTML = '';
      st.segs.forEach((s, i) => lst.append(h('div', { class: 'li' + (i === st.sel ? ' sel' : '') },
        h('span', { class: 'stnum' }, i + 1),
        ib('play', () => { st.sel = i; st.cursor = s.start; draw(); drawList(); playRegion(s.start, s.end); }),
        h('div', { class: 'grow' }, h('input', { type: 'text', value: s.name, placeholder: st.name + '_' + (i + 1), onfocus: () => { if (st.sel !== i) { st.sel = i; draw(); } }, oninput: e => { s.name = e.target.value; } }), h('div', { class: 'tiny dim' }, fmtT(s.start) + ' – ' + fmtT(s.end) + ' · ' + (s.end - s.start).toFixed(2) + ' с')),
        ib('more', () => menu('Кусочек ' + (i + 1), [
          i < st.segs.length - 1 ? { label: 'Склеить со следующим', do: () => { s.end = st.segs[i + 1].end; s.name = s.name || st.segs[i + 1].name; st.segs.splice(i + 1, 1); draw(); drawList(); } } : null,
          { label: 'Удалить', danger: 1, do: () => { st.segs.splice(i, 1); st.sel = -1; draw(); drawList(); } }].filter(Boolean))))));
      if (!st.segs.length) lst.append(h('div', { class: 'li dim small' }, 'Пусто. Поменяй порог или добавь вручную у жёлтой отметки.'));
    };
    drawList();
    // сохранение
    const packSel = h('select', null, h('option', { value: '' }, 'Новый пакет «' + st.name + '»'), S.packs.map(p => h('option', { value: p.id, selected: p.id === st.pack }, p.name)));
    packSel.onchange = e => st.pack = e.target.value;
    b.append(h('h2', null, 'Сохранить в банк'), packSel, h('div', { class: 'btns' }, h('button', { class: 'btn pri wide', onclick: async () => {
      if (!st.segs.length) { toast('Нечего сохранять'); return; }
      let pack = S.packs.find(p => p.id === st.pack);
      if (!pack) { pack = { id: INF.uid(), name: st.name }; S.packs.push(pack); }
      const blobId = INF.uid();
      await DB.put('blobs', blobId, st.file);
      st.segs.forEach((s, i) => { const id = INF.uid(); S.clips[id] = { id, name: (s.name.trim() || st.name + '_' + (i + 1)), pack: pack.id, blob: blobId, start: +s.start.toFixed(3), end: +s.end.toFixed(3), dur: s.end - s.start }; });
      await DB.put('kv', 'state', S);
      bankUI.open.add(pack.id);
      toast('Сохранено звуков: ' + st.segs.length + ' в «' + pack.name + '»');
      UI.pop();
    } }, 'Сохранить ' + st.segs.length + ' звуков')));
  });
}
