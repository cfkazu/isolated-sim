import { World, MONTH_LABEL, DEFAULTS } from './world.js';
import { MapView, DISPLAY_LEGENDS } from './ui/map.js';
import { FamilyTree } from './ui/familyTree.js';
import { renderCreaturePanel, StatsPanel, GenesPanel, SelectionPanel, renderGuide, renderSettings } from './ui/panels.js';

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
renderSettings(
  $('#tab-settings'),
  state.opts,
  (name, value) => {
    state.opts[name] = value;
    // 実行中の島にすぐ反映できるもの
    if (['mutationRate', 'searchImage', 'inbreedingAvoidance', 'randomEvents'].includes(name)) {
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
);

function newWorld() {
  state.world = new World(state.opts);
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
  if (w.coldEraYears > 0) st.push('❄️寒冷期');
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

// ───── イベント ─────

$('#btn-play').addEventListener('click', () => setPlaying(!state.playing));
$('#btn-step').addEventListener('click', () => {
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

$('#map').addEventListener('click', (e) => {
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
  switch (t.dataset.event) {
    case 'epidemic':
      w.triggerEpidemic();
      break;
    case 'famine':
      w.triggerFamine();
      break;
    case 'cold':
      if (w.coldEraYears > 0) {
        w.coldEraYears = 1;
        w.addLog('（寒冷期はまもなく終わる）', 'event');
      } else w.triggerColdEra();
      break;
    case 'storm':
      w.triggerStorm();
      break;
    case 'castaway':
      w.addCastaways(6);
      break;
    case 'predators':
      w.releasePredators(4);
      break;
  }
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
requestAnimationFrame(frame);
