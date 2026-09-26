import { World, MONTH_LABEL, DEFAULTS } from './world.js';
import { MapView, DISPLAY_LEGENDS } from './ui/map.js';
import { FamilyTree } from './ui/familyTree.js';
import { restore, saveToBrowser, loadFromBrowser, listScenarios, saveScenario, deleteScenario } from './save.js';
import { SCENARIOS, normalizeScenario, draftFrom, TRAIT_DEFS, SIMPLE_LOCI } from './scenarios.js';
import { ScenarioEditor } from './ui/scenarioEditor.js';
import { renderCreaturePanel } from './ui/creaturePanel.js';
import { StatsPanel } from './ui/statsPanel.js';
import { GenesPanel } from './ui/genesPanel.js';
import { SelectionPanel } from './ui/selectionPanel.js';
import { renderGuide, renderSettings } from './ui/guidePanel.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  opts: { ...DEFAULTS },
  world: null,
  playing: false,
  speed: 12, // か月/秒
  acc: 0,
  selectedId: null,
  pinnedId: null,
  tab: 'creature',
  lastYear: -1,
  lastPanelUpdate: 0,
  logCount: 0,
};

const mapView = new MapView($('#map'));
const statsPanel = new StatsPanel($('#tab-stats'));
const genesPanel = new GenesPanel($('#tab-genes'));
const selectionPanel = new SelectionPanel($('#tab-selection'));
const familyTree = new FamilyTree($('#tab-family'), (id) => {
  state.selectedId = id;
});
renderGuide($('#tab-guide'));
// 設定タブは「ふだんの設定」と「シナリオ編集画面」を切り替える
$('#tab-settings').innerHTML = '<div id="settings-main"></div><div id="scenario-editor" hidden></div>';
const customs = { list: [] };
const findCustom = (id) => customs.list.find((c) => c.id === id);

// シナリオの選択肢の値（'villages' や 'custom:<id>'）を島の設定に写す
function chooseScenario(value) {
  if (value?.startsWith('custom:')) {
    const sc = findCustom(value.slice(7));
    state.opts.scenario = sc ? 'custom' : 'free';
    state.opts.scenarioData = sc ?? null;
  } else {
    state.opts.scenario = SCENARIOS[value] ? value : 'free';
    state.opts.scenarioData = null;
  }
}

const settingsArgs = [
  $('#settings-main'),
  state.opts,
  (name, value) => {
    if (name === 'scenario') {
      chooseScenario(value);
      return;
    }
    state.opts[name] = value;
    // 実行中の島にすぐ反映できるもの
    if (['mutationRate', 'searchImage', 'inbreedingAvoidance', 'randomEvents', 'climateCycleYears', 'climateAmplitude'].includes(name)) {
      state.world.opts[name] = value;
    }
  },
  (randomSeed) => {
    if (randomSeed) {
      state.opts.seed = Math.random().toString(36).slice(2, 8);
      $('#tab-settings input[name="seed"]').value = state.opts.seed;
    }
    newWorld();
  },
  {
    customs: () => customs.list,
    onEdit: (value) => {
      const custom = value.startsWith('custom:') ? findCustom(value.slice(7)) : null;
      openEditor(custom ? draftFrom(null, custom) : draftFrom(value));
    },
    onDelete: async (id) => {
      await deleteScenario(id);
      if (state.opts.scenarioData?.id === id) chooseScenario('free');
      await refreshCustoms();
    },
    onImport: async (text) => {
      let sc;
      try {
        sc = normalizeScenario(JSON.parse(text));
      } catch {
        return '読み込めませんでした（シナリオの JSON ではないようです）。';
      }
      const ok = await saveScenario(sc);
      await refreshCustoms();
      if (!ok) return 'このブラウザには保存できませんでした。';
      chooseScenario(`custom:${sc.id}`);
      renderSettings(...settingsArgs);
      return `「${sc.label}」を読み込みました。「この設定で新しい島を始める」で遊べます。`;
    },
  },
];
renderSettings(...settingsArgs);

async function refreshCustoms() {
  customs.list = await listScenarios();
  renderSettings(...settingsArgs);
  renderStartScreen();
}

// ───── シナリオ編集 ─────
// 編集中は、左の地図に「この下書きで始めた 0 年目の島」を出す（遊んでいた島は取っておき、やめたら戻す）
const editor = { active: false, backup: null, timer: 0, drag: null };
const scenarioEditor = new ScenarioEditor($('#scenario-editor'), {
  get defaultCount() {
    return state.opts.initialCount;
  },
  customs: () => customs.list,
  fromWorld: () => draftFromWorld(editor.backup ?? state.world),
  onChange: (d) => {
    mapView.circles = scenarioEditor.circles();
    clearTimeout(editor.timer);
    editor.timer = setTimeout(() => previewDraft(d), 150);
  },
  onSave: async (d) => {
    const ok = await saveScenario(normalizeScenario(d));
    await refreshCustoms();
    return ok;
  },
  onStart: async (d) => {
    const sc = normalizeScenario(d);
    await saveScenario(sc);
    closeEditor(false);
    await refreshCustoms();
    chooseScenario(`custom:${sc.id}`);
    if (!state.opts.scenarioData) state.opts.scenarioData = sc; // 保存できない環境でも遊べるように
    state.opts.scenario = 'custom';
    renderSettings(...settingsArgs);
    newWorld();
    selectTab('creature');
  },
  onClose: () => closeEditor(true),
});

function openEditor(draft) {
  if (!editor.active) {
    editor.active = true;
    editor.backup = state.world;
  }
  setPlaying(false);
  hideStartScreen();
  $('#settings-main').hidden = true;
  $('#scenario-editor').hidden = false;
  $('.map-wrap').classList.add('placing');
  selectTab('settings');
  scenarioEditor.open(draft);
}

function closeEditor(restoreWorld) {
  editor.active = false;
  clearTimeout(editor.timer);
  $('#settings-main').hidden = false;
  $('#scenario-editor').hidden = true;
  $('.map-wrap').classList.remove('placing');
  mapView.circles = null;
  if (restoreWorld && editor.backup) showWorld(editor.backup, false);
  editor.backup = null;
}

function previewDraft(d) {
  if (!editor.active) return;
  let w;
  try {
    w = new World({ ...state.opts, scenario: 'custom', scenarioData: d });
  } catch {
    return;
  }
  showWorld(w, false);
  mapView.circles = scenarioEditor.circles();
}

// 今の島から：地質・形・シードと、今の遺伝子の割合を写す
function draftFromWorld(w) {
  const d = draftFrom('free');
  d.label = `${w.island.geology.label}の続き`;
  d.desc = `${w.year} 年目の島の遺伝子の割合から始める。`;
  d.opts = { islandShape: w.opts.islandShape, geology: w.island.geologyKey, seed: String(w.opts.seed) };
  const f = w.history.at(-1)?.freqs;
  if (!f || !w.creatures.length) return d;
  for (const t of TRAIT_DEFS) d.traits[t.key] = +(t.loci.reduce((sum, k) => sum + (f[k]?.[t.allele] ?? 0), 0) / t.loci.length).toFixed(3);
  for (const k of SIMPLE_LOCI) d.freqs[k] = Object.fromEntries(Object.entries(f[k]).map(([a, v]) => [a, +v.toFixed(3)]));
  for (const k of ['HA1', 'HA2', 'HB1', 'HB2', 'HC1', 'HC2']) d.freqs[k] = Object.fromEntries(Object.entries(f[k]).map(([a, v]) => [a, +v.toFixed(3)]));
  return d;
}

// ───── 開始画面（最初に遊び始める前だけ、地図の上に出す） ─────
const start = { shown: false };

function renderStartScreen() {
  const el = $('#start-screen');
  if (!el || !start.shown) return;
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cards = [
    ...Object.entries(SCENARIOS).map(([k, v]) => ({ value: k, label: v.label, desc: v.desc })),
    ...customs.list.map((c) => ({ value: `custom:${c.id}`, label: `自作：${c.label}`, desc: c.desc })),
  ];
  el.innerHTML = `<div class="start-inner">
    <h2>どんな島で始める？</h2>
    <div class="start-cards">${cards
      .map((c) => `<button type="button" class="start-card" data-start="${esc(c.value)}"><strong>${esc(c.label)}</strong><span>${esc(c.desc)}</span></button>`)
      .join('')}</div>
    <div class="btn-row" style="justify-content:center">
      <button type="button" data-start-edit>✏️ 自分でシナリオを作る</button>
      <button type="button" data-start-close>閉じる（このまま眺める）</button>
    </div></div>`;
}

function showStartScreen() {
  start.shown = true;
  $('#start-screen').hidden = false;
  renderStartScreen();
}

function hideStartScreen() {
  start.shown = false;
  $('#start-screen').hidden = true;
}

$('#start-screen').addEventListener('click', (e) => {
  const card = e.target.closest('[data-start]');
  if (card) {
    chooseScenario(card.dataset.start);
    renderSettings(...settingsArgs);
    hideStartScreen();
    // 始めるのは一時停止から（▶ 再生で動き出す）
    newWorld();
    selectTab('creature');
    return;
  }
  if (e.target.closest('[data-start-edit]')) openEditor(draftFrom('free'));
  if (e.target.closest('[data-start-close]')) hideStartScreen();
});

function newWorld() {
  save.tick = -1;
  showWorld(new World(state.opts));
}

function showWorld(world, fresh = true) {
  state.world = world;
  if (fresh) hideResume();
  state.selectedId = null;
  state.pinnedId = null;
  state.lastYear = -1;
  state.logCount = 0;
  state.acc = 0;
  $('#log').innerHTML = '';
  familyTree.reset();
  mapView.setIsland(state.world.island);
  setPlaying(false);
  refresh(true);
}

function setPlaying(p) {
  state.playing = p && !state.world.extinct;
  const b = $('#btn-play');
  b.textContent = state.playing ? '⏸ 一時停止' : '▶ 再生';
  b.setAttribute('aria-pressed', String(state.playing));
}

function findCreature(id) {
  if (id == null) return null;
  return state.world.pedigree.get(id) ?? null;
}

function relatedOf(c) {
  if (!c) return [];
  const ped = state.world.pedigree;
  const out = [];
  for (const id of [c.fatherId, c.motherId]) {
    const r = ped.get(id);
    if (r) out.push(r);
  }
  for (const r of state.world.creatures) if (r.fatherId === c.id || r.motherId === c.id) out.push(r);
  return out;
}

function renderClock() {
  const w = state.world;
  $('#clock-year').textContent = `${w.year}年目`;
  $('#clock-month').textContent = MONTH_LABEL[w.month];
  $('#clock-temp').textContent = `${w.temperature.toFixed(1)}℃`;
  const st = [];
  st.push(w.climateLabel);
  if (w.push.kind) st.push({ cold: '❄️寒冷期', warm: '🔥温暖期', super: '🧊超寒冷期' }[w.push.kind]);
  if (w.snowCover >= 0.01) st.push(`雪 ${Math.round(w.snowCover * 100)}%`);
  if (w.epidemicMonths > 0) st.push('🦠疫病');
  if (w.famineMonths > 0) st.push('🥀干ばつ');
  $('#clock-status').textContent = st.join(' ');
}

function renderQuickStats() {
  const w = state.world;
  const cs = w.creatures;
  const males = cs.filter((c) => c.sex === 'M').length;
  const h = w.history.at(-1);
  const he0 = w.history[0].He || 1;
  const grass = Math.round(w.vegetation.meanFraction() * 100);
  $('#quick-stats').innerHTML = [
    ['個体数', cs.length, `♀${cs.length - males} ♂${males}`],
    ['遺伝的多様性', `${Math.round((h.He / he0) * 100)}%`, '最初を100%として'],
    ['平均近交係数', h.meanF.toFixed(3), '昨年末'],
    ['捕食者', Math.round(w.predators), w.predators > 0 ? `昨年 ${h.kills ?? 0} 匹を捕食` : '島にいない'],
    ['草の量', `${grass}%`, `空腹の個体 ${cs.filter((c) => c.hunger > 0.2).length} 匹`],
  ]
    .map(([l, v, s]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`)
    .join('');
}

function renderLog() {
  const log = state.world.log;
  if (log.length === state.logCount && state.logCount > 0) return;
  const el = $('#log');
  const html = log
    .slice(-150)
    .reverse()
    .map(
      (e) =>
        `<li class="${e.kind}"><span class="when">${Math.floor(e.tick / 12)}年目</span><span>${e.id != null ? `<button type="button" class="link" data-select="${e.id}">${e.text}</button>` : e.text}</span></li>`,
    )
    .join('');
  el.innerHTML = html;
  state.logCount = log.length;
}

function renderLegend() {
  $('#map-legend').innerHTML = DISPLAY_LEGENDS[mapView.mode]()
    .map(([label, color]) => `<span><span class="swatch" style="background:${color}"></span>${label}</span>`)
    .join('');
}

function renderOverlay() {
  const w = state.world;
  const o = $('#overlay');
  if (!w.extinct) {
    o.hidden = true;
    return;
  }
  const peak = w.history.reduce((a, b) => (b.pop > a.pop ? b : a));
  o.hidden = false;
  o.innerHTML = `<div><h2>絶滅</h2><p>${w.year}年目、島の生物は絶滅しました。<br>最大 ${peak.pop} 匹（${peak.year}年目）まで増えました。</p>
    <div class="btn-row" style="justify-content:center"><button type="button" data-event="castaway">🛶 漂着者を送る</button>
    <button type="button" class="primary" data-action="new-island">新しい島を始める</button></div></div>`;
}

function renderSidePanel(force = false) {
  const w = state.world;
  const now = performance.now();
  if (state.tab === 'creature') {
    // 再生中は 0.5 秒ごとに更新（交配予測などが重いので）
    if (!force && now - state.lastPanelUpdate < 500) return;
    state.lastPanelUpdate = now;
    renderCreaturePanel($('#tab-creature'), w, findCreature(state.selectedId), findCreature(state.pinnedId));
  } else if (state.tab === 'stats' && (force || w.year !== state.lastYear)) {
    statsPanel.update(w);
  } else if (state.tab === 'genes' && (force || w.year !== state.lastYear)) {
    genesPanel.update(w);
  } else if (state.tab === 'selection' && (force || w.year !== state.lastYear)) {
    selectionPanel.update(w);
  } else if (state.tab === 'family') {
    // 家系図は重いので、中心の個体が変わったときと年が変わったときだけ描き直す
    const changed = familyTree.setFocus(state.selectedId) || familyTree.world !== w;
    if (changed || force || (!state.playing && w.year !== state.lastYear)) familyTree.render(w);
  }
}

function refresh(force = false) {
  renderClock();
  renderQuickStats();
  renderLog();
  renderOverlay();
  renderSidePanel(force || state.world.year !== state.lastYear);
  state.lastYear = state.world.year;
}

function draw() {
  const sel = findCreature(state.selectedId);
  mapView.render(state.world, {
    selected: sel,
    related: relatedOf(sel),
    frac: state.playing ? state.acc : 1,
  });
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(250, now - last);
  last = now;
  if (state.playing) {
    state.acc += (dt / 1000) * state.speed;
    let steps = 0;
    while (state.acc >= 1 && steps < 40) {
      state.world.step();
      state.acc -= 1;
      steps++;
      if (state.world.extinct) {
        setPlaying(false);
        break;
      }
    }
    if (steps > 0) refresh();
  }
  draw();
  requestAnimationFrame(frame);
}

// ───── 保存と読み込み ─────
// 島はブラウザ（IndexedDB）に 1 つだけ保存する。2 分ごと・タブを離れたとき・保存ボタンで上書き。
// 起動時に保存があれば「続きから」を選べる。答えるまでは自動保存しない（前の島を消さないため）。

const AUTOSAVE_MS = 120000;
const save = { tick: -1, busy: false, pending: null, timer: 0 };

function setSaveStatus(text) {
  $('#save-status').textContent = text;
}

async function saveNow(manual = false) {
  const w = state.world;
  // シナリオ編集中の地図は下書きのプレビューなので保存しない
  if (save.pending || save.busy || w.extinct || editor.active) return;
  if (!manual && w.tick === save.tick) return;
  save.busy = true;
  const ok = await saveToBrowser(w);
  save.busy = false;
  if (ok) {
    save.tick = w.tick;
    setSaveStatus(`${w.year}年目を保存済み`);
  } else if (manual) {
    setSaveStatus('このブラウザでは保存できません');
  }
}

function hideResume() {
  save.pending = null;
  $('#resume-bar').hidden = true;
}

async function offerResume() {
  const snap = await loadFromBrowser();
  if (!snap?.summary) return;
  const s = snap.summary;
  const when = new Date(snap.savedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  save.pending = snap;
  const bar = $('#resume-bar');
  bar.innerHTML = `<span>前回の島が保存されています：<strong>${s.year}年目・${s.pop}匹</strong>（${s.geology}、シード ${s.seed}、${when}）</span>
    <span class="btn-row"><button type="button" class="primary" data-resume="load">続きから</button>
    <button type="button" data-resume="new">新しい島のまま（保存は次の自動保存で上書き）</button></span>`;
  bar.hidden = false;
}

$('#resume-bar').addEventListener('click', (e) => {
  const a = e.target.closest('[data-resume]')?.dataset.resume;
  if (!a) return;
  if (a === 'load') {
    try {
      const w = restore(save.pending);
      Object.assign(state.opts, w.opts);
      renderSettings(...settingsArgs);
      save.tick = w.tick;
      hideStartScreen();
      showWorld(w);
      setSaveStatus(`${w.year}年目から再開`);
    } catch {
      hideResume();
      setSaveStatus('保存データを読み込めませんでした');
    }
  } else {
    hideResume();
  }
});

$('#btn-save').addEventListener('click', () => saveNow(true));
setInterval(() => saveNow(), AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

// ───── イベント ─────

$('#btn-play').addEventListener('click', () => {
  if (editor.active) closeEditor(true);
  hideStartScreen();
  setPlaying(!state.playing);
});
$('#btn-step').addEventListener('click', () => {
  if (editor.active) closeEditor(true);
  hideStartScreen();
  const w = state.world;
  for (let i = 0; i < 12 && !w.extinct; i++) w.step();
  state.acc = 0;
  refresh(true);
});
$('#speed').addEventListener('change', (e) => {
  state.speed = Number(e.target.value);
});
$('#display-mode').addEventListener('change', (e) => {
  mapView.mode = e.target.value;
  renderLegend();
});

// ───── 地形編集 ─────
const edit = { on: false, raise: true, painting: false, last: 0 };

function mapPoint(e) {
  const r = $('#map').getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

function sculptAt(e) {
  const p = mapPoint(e);
  const r = Number($('#brush-size').value);
  mapView.brush = { ...p, r, raise: edit.raise };
  if (!edit.painting) return;
  const now = performance.now();
  // 1 回のなぞりで少しずつ変える（50ms ごと）
  if (now - edit.last < 50) return;
  edit.last = now;
  state.world.sculpt(p.x, p.y, r, edit.raise ? 0.06 : -0.06);
  state.world.terrainChanged('edit');
}

$('#btn-edit').addEventListener('click', () => {
  edit.on = !edit.on;
  $('#btn-edit').setAttribute('aria-pressed', String(edit.on));
  $('#edit-bar').hidden = !edit.on;
  $('.map-wrap').classList.toggle('editing', edit.on);
  if (!edit.on) mapView.brush = null;
});
for (const b of document.querySelectorAll('[data-brush]')) {
  b.addEventListener('click', () => {
    edit.raise = b.dataset.brush === 'raise';
    for (const x of document.querySelectorAll('[data-brush]')) x.setAttribute('aria-pressed', String(x === b));
  });
}
$('#btn-islet').addEventListener('click', () => {
  if (!state.world.createIslet()) state.world.addLog('（小島をつくれる沖が見つからなかった）');
  refresh(true);
});
// シナリオ編集中：クリックで群れの中心、ドラッグで広さ
$('#map').addEventListener('pointerdown', (e) => {
  if (!editor.active || scenarioEditor.placing == null) return;
  const p = mapPoint(e);
  editor.drag = p;
  $('#map').setPointerCapture(e.pointerId);
  scenarioEditor.placeGroup(p.x, p.y);
  mapView.circles = scenarioEditor.circles();
});
$('#map').addEventListener('pointermove', (e) => {
  if (!editor.drag) return;
  const p = mapPoint(e);
  const r = Math.hypot(p.x - editor.drag.x, (p.y - editor.drag.y) * 0.75);
  if (r > 0.02) scenarioEditor.placeGroup(editor.drag.x, editor.drag.y, r);
  mapView.circles = scenarioEditor.circles();
});
const endPlace = () => {
  if (!editor.drag) return;
  editor.drag = null;
  scenarioEditor.hooks.onChange(scenarioEditor.draft);
};
$('#map').addEventListener('pointerup', endPlace);
$('#map').addEventListener('pointercancel', endPlace);

$('#map').addEventListener('pointerdown', (e) => {
  if (!edit.on || editor.active) return;
  edit.painting = true;
  edit.last = 0;
  $('#map').setPointerCapture(e.pointerId);
  sculptAt(e);
});
$('#map').addEventListener('pointermove', (e) => {
  if (edit.on) sculptAt(e);
});
const endPaint = () => {
  if (!edit.painting) return;
  edit.painting = false;
  refresh(true);
};
$('#map').addEventListener('pointerup', endPaint);
$('#map').addEventListener('pointercancel', endPaint);
$('#map').addEventListener('pointerleave', () => {
  if (!edit.painting) mapView.brush = null;
});

$('#map').addEventListener('click', (e) => {
  if (edit.on || editor.active) return;
  const c = mapView.pick(state.world, e.clientX, e.clientY);
  state.selectedId = c ? c.id : null;
  // 家系図を見ているときは、選んだ個体を中心に家系図を描き直す
  if (state.tab === 'family' && c) renderSidePanel(true);
  else selectTab('creature');
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-select], [data-event], [data-action], [data-tab]');
  if (!t) return;
  if (t.dataset.select) {
    state.selectedId = Number(t.dataset.select);
    if (state.tab === 'family' || state.tab === 'creature') renderSidePanel(true);
    else selectTab('creature');
    return;
  }
  if (t.dataset.tab) {
    selectTab(t.dataset.tab);
    return;
  }
  const w = state.world;
  if (t.dataset.event) w.applyEvent(t.dataset.event);
  switch (t.dataset.action) {
    case 'pin':
      state.pinnedId = state.selectedId;
      break;
    case 'unpin':
      state.pinnedId = null;
      break;
    case 'new-island':
      state.opts.seed = Math.random().toString(36).slice(2, 8);
      $('#tab-settings input[name="seed"]').value = state.opts.seed;
      newWorld();
      return;
  }
  refresh(true);
});

function selectTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.id !== `tab-${tab}`;
  renderSidePanel(true);
}

window.addEventListener('resize', () => {
  if (state.tab === 'stats') statsPanel.redraw();
  if (state.tab === 'genes') genesPanel.redraw();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  mapView.drawnTick = null;
  renderLegend();
  refresh(true);
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    setPlaying(!state.playing);
  }
});

renderLegend();
newWorld();
showStartScreen();
refreshCustoms();
offerResume();
requestAnimationFrame(frame);
