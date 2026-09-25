// 右側のタブパネル群。

import {
  LOCI,
  LOCUS,
  CHROMOSOMES,
  INHERITANCE,
  genotypeString,
  locusEffect,
  isCarrier,
  predictOffspring,
  COLOR_LABEL,
  POLYGENIC_TRAITS,
  polygenicSummary,
  PATTERN_LABEL,
  EAR_LABEL,
  tailLabel,
  DMI_PAIRS,
} from '../genes.js';
import {
  alleleFrequencies,
  islandStats,
  genotypeTable,
  SELECTION_TRAITS,
  mergeSelection,
  survivalRows,
  selectionSummary,
  mendelianSummary,
  SELECTION_T,
} from '../stats.js';
import { DEATH_CAUSES, DEFAULTS, CLIMATE_AMPLITUDE, tailDisplay, glowDisplay } from '../world.js';
import { TERRAIN_LABEL, ISLAND_SHAPES, GEOLOGY } from '../island.js';
import { createRng } from '../rng.js';
import { Chart, resolveColor } from './charts.js';
import { bodyColor } from './map.js';
import { drawCreature } from './creatureArt.js';

const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
// 家系の記録が残っていればリンク、古すぎて消えていれば文字だけ
const idLink = (world, id, text = `#${id}`) =>
  world.pedigree.get(Number(id)) ? `<button type="button" class="link" data-select="${id}">${text}</button>` : text;
const sexMark = (s) => (s === 'F' ? '♀' : '♂');
const sexLabel = (s) => (s === 'F' ? 'メス' : 'オス');
const ageLabel = (m) => `${Math.floor(m / 12)}歳${m % 12}か月`;

// 対立遺伝子の色：体色は実際の色、それ以外はカテゴリ色を固定順で
export function alleleColor(locus, allele) {
  if (locus.key === 'COL') return bodyColor({ K: 'black', G: 'green', w: 'white' }[allele]);
  const slots = ['--series-1', '--series-2', '--series-3'];
  return resolveColor(slots[locus.alleles.indexOf(allele)]);
}

function alleleLabel(locus, a) {
  return locus.labels?.[a] ? `${a}（${locus.labels[a]}）` : a;
}

// ───────────────────────── 個体 ─────────────────────────

export function renderCreaturePanel(el, world, c, pinned) {
  if (!c) {
    el.innerHTML = renderNotables(world);
    return;
  }
  const ped = world.pedigree;
  const father = ped.get(c.fatherId);
  const mother = ped.get(c.motherId);
  const status = c.alive
    ? '<span class="badge">生存中</span>'
    : `<span class="badge warn">死亡：${DEATH_CAUSES[c.cause] ?? c.cause}（${Math.floor(c.deathTick / 12)}年目）</span>`;
  const ph = c.pheno;

  const children = c.children.map((id) => ped.get(id)).filter(Boolean);
  const aliveChildren = children.filter((x) => x.alive);
  const who = (r) => (r ? `<button type="button" class="link" data-select="${r.id}">${sexMark(r.sex)} ${r.clan}の${r.name}</button>${r.alive ? '' : '（故）'}` : '—');

  let terrainInfo = '';
  if (c.alive) {
    const snow = world.isSnowAt(c.x, c.y);
    const tname = snow ? '雪原' : TERRAIN_LABEL[world.island.terrainAt(c.x, c.y)];
    terrainInfo = `<dt>いる場所</dt><dd>${tname}（目立ちやすさ ${world.visibility(c).toFixed(2)}）</dd>`;
  }

  const rows = [];
  // 古い個体はゲノムの記録を捨てている（家系図のための軽い記録だけが残る）
  for (const chr of c.genome ? CHROMOSOMES : []) {
    rows.push(`<tr class="chr-row"><td colspan="3">${chr.name}</td></tr>`);
    for (const l of LOCI.filter((x) => x.chr === chr.id).sort((a, b) => a.pos - b.pos)) {
      const carrier = isCarrier(l.key, c.genome) ? ' <span class="badge gene">保因者</span>' : '';
      rows.push(
        `<tr><td>${l.name}<div class="muted small">${INHERITANCE[l.mode].short}・${l.pos}cM</div></td><td class="genotype">${genotypeString(c.genome, l.key)}</td><td>${locusEffect(l.key, c.genome, ph)}${carrier}</td></tr>`,
      );
    }
  }

  let pinUi = '';
  if (pinned && pinned.id !== c.id) {
    if (!pinned.genome || !c.genome) {
      pinUi = '<div class="predict muted small">📌 古い個体は遺伝子の記録が残っていないため、交配予測できません。</div>';
    } else if (pinned.sex === c.sex) {
      pinUi = `<div class="predict muted small">📌 固定中の #${pinned.id}（${sexLabel(pinned.sex)}）とは同性のため、交配予測できません。</div>`;
    } else {
      const mother = c.sex === 'F' ? c : pinned;
      const father = c.sex === 'M' ? c : pinned;
      pinUi = renderPrediction(world, mother, father);
    }
  }
  const pinBtn =
    pinned?.id === c.id
      ? '<button type="button" data-action="unpin">📌 固定を解除</button>'
      : '<button type="button" data-action="pin">📌 交配予測の相手として固定</button>';

  el.innerHTML = `
    <div class="creature-head">
      <canvas id="portrait" class="portrait-big" width="160" height="104" aria-hidden="true"></canvas>
      <div>
        <h2>${c.name} <span class="muted small">${c.clan}・#${c.id}・${sexMark(c.sex)}${sexLabel(c.sex)}</span></h2>
        <div>${status} ${c.founder ? '<span class="badge">創始者</span>' : ''}</div>
      </div>
    </div>
    <dl class="kv">
      <dt>年齢</dt><dd>${ageLabel(c.age)}（寿命 ${world.opts.maxAgeYears} 歳）</dd>
      <dt>世代</dt><dd>第 ${c.gen} 世代</dd>
      <dt>近交係数 F</dt><dd>${c.F.toFixed(4)} ${c.F >= 0.125 ? '<span class="badge warn">近親交配の子</span>' : ''}</dd>
      <dt>見た目</dt><dd>${COLOR_LABEL[ph.color]}・${PATTERN_LABEL[ph.pattern]}・${EAR_LABEL[ph.ear]}${ph.glow ? '・<strong>発光</strong>' : ''}</dd>
      ${
        c.sex === 'M'
          ? `<dt>飾り</dt><dd>尾の長さ ${pct(ph.tail)}（見栄え ${pct(tailDisplay(c))}）${ph.glow ? `・光の強さ ${pct(glowDisplay(c))}` : ''}</dd>`
          : `<dt>好み</dt><dd>長い尾 ${pct(ph.prefTail)}・発光 ${pct(ph.prefGlow)}</dd>`
      }
      <dt>体格 / 毛皮</dt><dd>${ph.size.toFixed(2)} / ${pct(ph.fur)}</dd>
      <dt>代謝</dt><dd>${ph.metabolism < 0.93 ? '遅い（燃費がいい）' : ph.metabolism > 1.07 ? '速い（多産・寒さに強い）' : 'ふつう'}（${ph.metabolism.toFixed(2)}）</dd>
      <dt>栄養状態</dt><dd>${pct(c.condition)}${c.alive && c.hunger > 0.2 ? ' <span class="badge warn">空腹</span>' : ''}</dd>
      <dt>免疫力</dt><dd>${pct(ph.resistance)}${ph.load ? ` <span class="badge warn">遺伝病 ×${ph.load}</span>` : ''}</dd>
      ${
        c.lineage
          ? `<dt>創始者由来</dt><dd>${Object.entries(c.lineage)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([id, v]) => `${idLink(world, id, world.pedigree.get(Number(id))?.name ?? `#${id}`)} ${pct(v, 1)}`)
              .join('、')}${Object.keys(c.lineage).length > 3 ? ` ほか ${Object.keys(c.lineage).length - 3} 匹` : ''}</dd>`
          : ''
      }
      <dt>子の数</dt><dd>${children.length} 匹（生存 ${aliveChildren.length}）</dd>
      ${terrainInfo}
    </dl>
    <div class="btn-row"><button type="button" data-tab="family">🌳 家系図で見る</button>${pinBtn}</div>
    ${pinUi}
    <dl class="kv">
      <dt>父</dt><dd>${c.founder ? '（創始者）' : who(father)}</dd>
      <dt>母</dt><dd>${c.founder ? '（創始者）' : who(mother)}</dd>
    </dl>
    <h3>遺伝子の要約</h3>
    ${
      c.genome
        ? `${geneCards(c)}
    <details class="full-genes"><summary>全遺伝子座の一覧（染色体順・${LOCI.length} 座）</summary>
    <table>
      <thead><tr><th>遺伝子座</th><th>遺伝子型</th><th>効果</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <p class="muted small">遺伝子型は「母由来/父由来」ではなく、優性の対立遺伝子を先に表記しています。オスの X 連鎖遺伝子は「/Y」。</p>
    </details>`
        : `<p class="muted small">${world.opts.pedigreeYears} 年以上前の個体なので、遺伝子の記録は残っていません（見た目と家系だけが残っています）。</p>`
    }
  `;
  drawCreature(el.querySelector('#portrait'), c, 160, 104);
}

// 個体の遺伝子を、見た目・健康・量的形質のカードにまとめる。
// 対立遺伝子のチップは、表に出ていない（隠れている）ものを点線で示す。
function geneCards(c) {
  const g = c.genome;
  const ph = c.pheno;
  const male = c.sex === 'M';
  const al = (key) => {
    const i = LOCI.findIndex((l) => l.key === key);
    return [g.m[i], g.p[i]];
  };
  const chip = (a, hidden, label) => `<span class="gchip${hidden ? ' hidden' : ''}" title="${hidden ? '表に出ていない' : '表に出ている'}">${a ?? 'Y'}${label ? ` ${label}` : ''}</span>`;
  const chips = (key, isHidden) => {
    const locus = LOCI.find((l) => l.key === key);
    return `<div class="gchips">${al(key)
      .map((a) => chip(a, a != null && isHidden(a), a == null ? '' : locus.labels?.[a]))
      .join('')}</div>`;
  };
  const card = (title, value, chipHtml, note = '', tag = '') =>
    `<div class="gcard"><div class="gtitle">${title}${tag ? `<span class="gtag">${tag}</span>` : ''}</div><div class="gvalue">${value}</div>${chipHtml}${
      note ? `<div class="gnote">${note}</div>` : ''
    }</div>`;

  const colorLetter = { black: 'K', green: 'G', white: 'w' }[ph.color];
  const [p1, p2] = al('PAT');
  const glowAl = al('GLW');
  const hetVit = ph.resistance > 0.8;
  const dl = ['DL1', 'DL2', 'DL3'];
  const dCount = dl.filter((k) => al(k).includes('d')).length;

  const looks = [
    card('体色', COLOR_LABEL[ph.color], chips('COL', (a) => a !== colorLetter), ph.color !== 'white' && al('COL').includes('w') ? '白の遺伝子 w を隠し持つ' : '', '優劣序列'),
    card('模様', PATTERN_LABEL[ph.pattern], chips('PAT', (a) => a === 'o' && (p1 !== 'o' || p2 !== 'o')), ph.pattern === 'both' ? '斑点と縞の両方が出る（共優性）' : '', '共優性'),
    card('耳の形', EAR_LABEL[ph.ear], chips('EAR', () => false), '中立な形質', '不完全優性'),
    card(
      '発光',
      ph.glow ? '発光する' : '発光しない',
      chips('GLW', (a) => !ph.glow && a === 'g'),
      !male && !ph.glow && glowAl.includes('g') ? '保因者：息子の半分が発光する' : male ? 'オスの X は母から。息子には伝わらない' : '',
      '伴性',
    ),
  ];
  const dmiChips = DMI_PAIRS.map(
    (pair, i) =>
      `<span class="muted small">${'ABC'[i]}</span>${pair.map((k) => al(k).map((a) => chip(a == null ? null : a === 'n' ? (LOCUS[k].side === 0 ? '東' : '西') : 'o')).join('')).join('')}`,
  ).join('<span class="muted"> · </span>');
  const fert = ph.fertility ?? 1;
  const health = [
    card('免疫型', hetVit ? 'A/B（強い）' : ph.resistance > 0.5 ? 'A/A' : 'B/B', chips('VIT', () => false), hetVit ? 'ヘテロなので病気に最も強い' : '', '超優性'),
    card('致死因子', '健康', chips('LET', (a) => a === 'l'), al('LET').includes('l') ? '保因者：同じ保因者との子の 1/4 は生まれない' : '', '劣性致死'),
    card(
      '有害因子（3 座）',
      ph.load ? `発症 ×${ph.load}` : dCount ? '健康（保因者）' : '健康',
      `<div class="gchips">${dl.map((k) => al(k).map((a) => chip(a, a === 'd' && !(al(k)[0] === 'd' && al(k)[1] === 'd'))).join('')).join('<span class="muted"> · </span>')}</div>`,
      ph.load ? 'd/d の座があり体が弱い' : dCount ? `${dCount} 座で d を隠し持つ` : '',
      '劣性有害',
    ),
    card(
      '子のできやすさ',
      pct(fert),
      `<div class="gchips">${dmiChips}</div>`,
      fert < 0.999 ? '同じ組の東と西の新型を両方持つ雑種。子ができにくい' : '組ごとに東か西の片方しか持たない',
      '不和合',
    ),
  ];
  const expressedValue = {
    size: () => `体格 ${ph.size.toFixed(2)}`,
    fur: (t) => `毛皮 ${pct(t.value)}`,
    metab: () => `代謝 ${ph.metabolism.toFixed(2)}`,
    tail: (t) => `尾 ${pct(t.value)}・見栄え ${pct(tailDisplay(c))}`,
    prefTail: (t) => `強さ ${pct(t.value)}`,
    prefGlow: (t) => `強さ ${pct(t.value)}`,
  };
  const poly = polygenicSummary(g).map((t) => {
    const silent = t.sex && t.sex !== c.sex;
    return `<div class="gcard"><div class="gtitle">${t.label}<span class="gtag">＋${t.plus}/${t.copies}</span></div>
      <div class="sbar thin"><span style="flex-grow:${t.value};background:var(--series-1)"></span><span style="flex-grow:${1 - t.value};background:var(--grid)"></span></div>
      <div class="gnote">${silent ? `<span class="muted">${t.sex === 'M' ? 'オス' : 'メス'}だけに現れる（遺伝子 ${pct(t.value)} を運ぶだけ）</span>` : expressedValue[t.trait](t)}</div></div>`;
  });
  return `<div class="gsum">${looks.join('')}</div>
    <div class="gsum">${health.join('')}</div>
    <div class="gsum">${poly.join('')}</div>`;
}

function renderPrediction(world, mother, father) {
  const rng = createRng(mother.id * 7919 + father.id);
  const p = predictOffspring(mother, father, rng, 3000);
  const kin = world.pedigree.kinship(mother.id, father.id);
  const born = Math.max(1, p.born);
  const dist = (obj, labels) =>
    Object.entries(obj)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${labels[k]} ${pct(v / born)}`)
      .join('、');
  return `
    <div class="predict">
      <strong>🔮 交配予測：母 #${mother.id} × 父 #${father.id}</strong>
      <dl class="kv small" style="margin-top:6px">
        <dt>子の近交係数 F</dt><dd>${kin.toFixed(4)}</dd>
        <dt>致死（l/l）</dt><dd>${pct(p.lethal / p.n, 1)}</dd>
        <dt>体色</dt><dd>${dist(p.color, COLOR_LABEL)}</dd>
        <dt>模様</dt><dd>${dist(p.pattern, PATTERN_LABEL)}</dd>
        <dt>耳</dt><dd>${dist({ 0: p.ear[0], 1: p.ear[1], 2: p.ear[2] }, EAR_LABEL)}</dd>
        <dt>息子の尾 / 娘の尾への好み</dt><dd>${pct(p.tailM)} / ${pct(p.prefTailF)}</dd>
        <dt>発光</dt><dd>息子 ${pct(p.glowM / Math.max(1, p.males))}・娘 ${pct(p.glowF / Math.max(1, p.females))}</dd>
        <dt>免疫ヘテロ</dt><dd>${pct(p.resistant / born)}</dd>
        <dt>遺伝病</dt><dd>${pct(p.sick / born, 1)}</dd>
        <dt>平均体格/毛皮</dt><dd>${p.size.toFixed(2)} / ${pct(p.fur)}</dd>
      </dl>
      <p class="muted small">減数分裂を ${p.n} 回シミュレーションした結果（組換えも考慮）。</p>
    </div>`;
}

function renderNotables(world) {
  const cs = world.creatures;
  if (cs.length === 0) return '<p class="muted">生き残っている個体はいません。</p>';
  const by = (f) => cs.reduce((a, b) => (f(b) > f(a) ? b : a));
  const items = [
    ['最年長', by((c) => c.age), (c) => ageLabel(c.age)],
    ['子だくさん', by((c) => c.offspring), (c) => `子 ${c.offspring} 匹`],
    ['最も近交係数が高い', by((c) => c.F), (c) => `F = ${c.F.toFixed(3)}`],
    ['最も大きい', by((c) => c.pheno.size), (c) => `体格 ${c.pheno.size.toFixed(2)}`],
    ['最も毛深い', by((c) => c.pheno.fur), (c) => `毛皮 ${pct(c.pheno.fur)}`],
  ];
  const glowing = cs.filter((c) => c.pheno.glow);
  if (glowing.length) items.push(['発光する個体', glowing[0], () => `ほか ${glowing.length - 1} 匹`]);
  return `
    <p>地図上の個体をクリック（タップ）すると、遺伝子型・家系・交配予測が見られます。</p>
    <h3>注目の個体</h3>
    <div class="family">
      ${items
        .map(
          ([t, c, f]) =>
            `<button type="button" class="person" data-select="${c.id}"><div class="role">${t}</div>${sexMark(c.sex)} ${c.clan}の${c.name}<div class="muted small">${f(c)}</div></button>`,
        )
        .join('')}
    </div>
    <h3>遊び方のヒント</h3>
    <ul class="small">
      <li>ある個体を「📌 固定」してから異性を選ぶと、2匹の子どもの表現型を予測できます。</li>
      <li>「表示」を <strong>近交係数 F</strong> にすると、近親交配が島のどこで進んでいるか分かります。</li>
      <li>「❄️ 寒冷期」を起こすと島が雪に覆われ、白い個体や毛深い個体が有利になります。</li>
      <li>「🌀 大嵐」で個体数を減らすと（ボトルネック）、遺伝的多様性が一気に失われます。</li>
    </ul>`;
}

// ───────────────────────── 集団 ─────────────────────────

export class StatsPanel {
  constructor(el) {
    this.el = el;
    el.innerHTML = `<div id="stats-tiles" class="quick-stats"></div><div id="stats-charts"></div>
      <h3>昨年の死因</h3><div id="stats-deaths" class="bars"></div>
      <h3>島ごと</h3>
      <div id="islands"></div>
      <h3>いまの家（母系）</h3>
      <p class="small muted">家は母から子へ受け継がれ、まれにミトコンドリアの突然変異で分家が生まれます（生きている子孫が 10 匹に育つと家として独立）。字下げは分かれた元の家。</p>
      <div id="clan-tree" class="bars clan-tree"></div>
      <h3>創始者の系統</h3><div id="founders-chart"></div><div id="founders" class="bars"></div>`;
    const host = el.querySelector('#stats-charts');
    this.climate = new Chart(host, {
      title: '気温（今との差）',
      desc: '氷期と間氷期の大きな波に、数十年〜百年の揺らぎと出来事が重なる。寒いほど海面が下がり、浅瀬が陸になる。',
      yMin: -15,
      yMax: 5,
      format: (v, tip) => `${v > 0 ? '+' : ''}${tip ? v.toFixed(1) : Math.round(v)}℃`,
      series: [{ label: '気温', color: '--series-1' }],
    });
    this.pop = new Chart(host, {
      title: '個体数',
      series: [
        { label: '全体', color: '--series-1' },
        { label: 'メス', color: '--series-2' },
        { label: 'オス', color: '--series-3' },
      ],
    });
    this.div = new Chart(host, {
      title: '遺伝的多様性と近親交配',
      desc: '期待ヘテロ接合度 He が下がるほど多様性が失われている。平均 F は家系から計算した近交係数。',
      yMax: 0.5,
      format: (v) => v.toFixed(2),
      series: [
        { label: '期待ヘテロ接合度 He', color: '--series-1' },
        { label: '観測ヘテロ接合度 Ho', color: '--series-3', dash: true },
        { label: '平均近交係数 F', color: '--series-2' },
      ],
    });
    this.color = new Chart(host, {
      title: '体色の割合',
      kind: 'stack',
      format: (v, tip) => (tip ? pct(v) : pct(v)),
      series: [
        { label: '黒', color: '--body-black' },
        { label: '緑', color: '--body-green' },
        { label: '白', color: '--body-white' },
      ],
    });
    this.traits = new Chart(host, {
      title: '形質の平均と割合',
      desc: '体格は 0.7〜1.3、代謝は 0.8〜1.2 の値。毛皮と発光・免疫ヘテロは割合。',
      yMax: 1.4,
      format: (v) => v.toFixed(2),
      series: [
        { label: '平均体格', color: '--series-1' },
        { label: '平均毛皮', color: '--series-2' },
        { label: '発光の割合', color: '--series-4' },
        { label: '免疫ヘテロの割合', color: '--series-3' },
        { label: '平均代謝', color: '--series-5' },
      ],
    });
    this.sexsel = new Chart(host, {
      title: '性選択：飾りと好み',
      desc: '尾はオスだけ、好みはメスだけに現れるが、遺伝子は雌雄とも持っている（全個体の遺伝子の値の平均）。',
      yMax: 1,
      format: (v) => pct(v),
      series: [
        { label: '尾の長さ', color: '--series-1' },
        { label: '尾への好み', color: '--series-1', dash: true },
        { label: '発光遺伝子の頻度', color: '--series-4' },
        { label: '発光への好み', color: '--series-4', dash: true },
      ],
    });
    this.corr = new Chart(host, {
      title: '飾りと好みの遺伝的相関',
      desc: '正の相関は、好むメスと飾りのあるオスの子が両方の遺伝子を受け継いでいるしるし。これが強まると飾りと好みが一緒に暴走する（ランナウェイ）。',
      yMin: -0.5,
      yMax: 1,
      format: (v) => v.toFixed(2),
      series: [
        { label: '尾 × 尾への好み', color: '--series-1' },
        { label: '発光 × 発光への好み', color: '--series-4' },
      ],
    });
    this.pred = new Chart(host, {
      title: '捕食者の数',
      desc: '獲物が増えると捕食者が増え、食べ尽くすと飢えて減る。0 になると島から消える（まれに海を越えて渡ってくる）。',
      format: (v, tip) => (tip ? v.toFixed(1) : String(Math.round(v))),
      series: [{ label: '捕食者', color: '--series-5' }],
    });
    this.founders = new Chart(el.querySelector('#founders-chart'), {
      title: '子孫が残っている創始者の数',
      desc: '最初の百匹（と漂着者）のうち、今いる個体の家系をさかのぼると行き着く創始者の数。系統は途絶えると二度と戻らない。',
      series: [{ label: '創始者の系統', color: '--series-3' }],
    });
    this.births = new Chart(host, {
      title: '年間の出生',
      series: [
        { label: '出生', color: '--series-1' },
        { label: '死産（劣性致死）', color: '--series-2' },
        { label: '近親交配（F≥0.125）の子', color: '--series-5' },
      ],
    });
  }

  update(world) {
    const H = world.history;
    const last = H.at(-1);
    const xs = H.map((h) => h.year);
    this.pop.setData(xs, [H.map((h) => h.pop), H.map((h) => h.females), H.map((h) => h.males)]);
    this.climate.setData(xs, [H.map((h) => h.climate ?? 0)]);
    this.div.setData(xs, [H.map((h) => h.He), H.map((h) => h.Ho), H.map((h) => h.meanF)]);
    const n = (h) => Math.max(1, h.pop);
    this.color.setData(xs, [
      H.map((h) => (h.pop ? h.pheno.color.black / n(h) : 0)),
      H.map((h) => (h.pop ? h.pheno.color.green / n(h) : 0)),
      H.map((h) => (h.pop ? h.pheno.color.white / n(h) : 0)),
    ]);
    this.traits.setData(xs, [
      H.map((h) => (h.pop ? h.pheno.meanSize : 0)),
      H.map((h) => (h.pop ? h.pheno.meanFur : 0)),
      H.map((h) => (h.pheno.glowM + h.pheno.glowF) / n(h)),
      H.map((h) => h.pheno.resistant / n(h)),
      H.map((h) => h.metabolism ?? 1),
    ]);
    this.pred.setData(xs, [H.map((h) => h.predators ?? 0)]);
    this.founders.setData(xs, [H.map((h) => h.founderLines ?? 0)]);
    const isl = islandStats(world.creatures, world.island);
    const total = Math.max(1, world.island.area);
    this.el.querySelector('#islands').innerHTML =
      isl.rows
        .map(
          (r) => `<div class="island-row"><span><strong>${r.name}</strong><div class="muted small">面積 ${pct(r.size / total)}</div></span>
          <span class="num">${r.pop} 匹</span>
          <span>${r.pop ? stackBar([{ label: '黒', value: r.color.black / r.pop, color: '--body-black' }, { label: '緑', value: r.color.green / r.pop, color: '--body-green' }, { label: '白', value: r.color.white / r.pop, color: '--body-white' }], false) : '<span class="muted">無人</span>'}</span></div>`,
        )
        .join('') +
      (isl.fst != null
        ? `<p class="small">島どうしの遺伝的な違い F<sub>ST</sub> = <strong>${isl.fst.toFixed(3)}</strong> <span class="muted">（0 なら同じ集団、0.05 を超えると島ごとに違いが目立ち、0.25 を超えると大きく分かれている）</span></p>`
        : world.island.landmasses.length > 1
          ? '<p class="muted small">人が住む島が 2 つ以上になると、島どうしの遺伝的な違いを表示します。流木でまれに海を渡り、寒冷期に海面が下がると浅瀬が陸橋になります。</p>'
          : '<p class="muted small">いまは島が 1 つだけです。「✏️ 地形を編集」で小島をつくれます。</p>') +
      (isl.barriers.length
        ? `<p class="small"><strong>種の壁</strong> <span class="muted">（島の間の雑種が、島の中どうしの子と比べてどれだけ子を残せるか。50% を下回ると別の種とみなす）</span></p>${isl.barriers
            .slice()
            .sort((a, b) => a.hybrid - b.hybrid)
            .slice(0, 6)
            .map((b) => {
              const nm = (id) => world.island.landmasses.find((m) => m.id === id)?.name ?? '?';
              const tag = b.hybrid < 0.5 ? '<span class="badge gene">別の種</span>' : b.hybrid < 0.8 ? '<span class="badge">壁あり</span>' : '';
              return `<div class="bar-row"><span>${nm(b.a)} × ${nm(b.b)} ${tag}</span><div class="track"><div class="fill" style="width:${b.hybrid * 100}%"></div></div><span class="num">${pct(b.hybrid)}</span></div>`;
            })
            .join('')}`
        : '');
    const clans = world.clanTree();
    const clanMax = Math.max(1, ...clans.map((c) => c.n));
    this.el.querySelector('#clan-tree').innerHTML = clans
      .map(
        (c) =>
          `<div class="bar-row"><span style="padding-left:${c.depth}em">${idLink(world, c.founderId, c.name)}</span><div class="track"><div class="fill" style="width:${(c.n / clanMax) * 100}%"></div></div><span class="num">${c.n}</span></div>`,
      )
      .join('');
    const top = (world.founderSnapshot ?? []).slice(0, 8);
    const topMax = Math.max(0.01, ...top.map((f) => f.share));
    this.el.querySelector('#founders').innerHTML = top.length
      ? `<p class="small muted">今の島の遺伝子のうち、各創始者に由来する割合（家系からの期待値）。上位 8 匹。</p>${top
          .map(
            (f) =>
              `<div class="bar-row"><span>${idLink(world, f.id, world.pedigree.get(f.id)?.name ?? `#${f.id}`)}</span><div class="track"><div class="fill" style="width:${(f.share / topMax) * 100}%"></div></div><span class="num">${pct(f.share, 1)}</span></div>`,
          )
          .join('')}`
      : '';
    const ss = (h, k) => h.sexsel?.[k] ?? 0;
    const glowFreq = (h) => h.freqs.GLW.g;
    this.sexsel.setData(xs, [H.map((h) => ss(h, 'tail')), H.map((h) => ss(h, 'prefTail')), H.map(glowFreq), H.map((h) => ss(h, 'prefGlow'))]);
    this.corr.setData(xs, [H.map((h) => ss(h, 'corrTail')), H.map((h) => ss(h, 'corrGlow'))]);
    const hb = H.slice(1);
    this.births.setData(
      hb.map((h) => h.year),
      [hb.map((h) => h.births), hb.map((h) => h.stillborn), hb.map((h) => h.inbredBirths)],
    );

    const he0 = H[0].He || 1;
    this.el.querySelector('#stats-tiles').innerHTML = [
      ['個体数', last.pop, `♀${last.females} ♂${last.males}`],
      ['多様性の残存率', pct(last.He / he0), '最初の He に対する割合'],
      ['平均近交係数', last.meanF.toFixed(3), 'いとこ婚の子 = 0.0625'],
      ['最大個体数', Math.max(...H.map((h) => h.pop)), `${H.reduce((a, b) => (b.pop > a.pop ? b : a)).year}年目`],
    ]
      .map(([l, v, s]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`)
      .join('');

    const d = H.length > 1 ? last.deaths : null;
    const deathsEl = this.el.querySelector('#stats-deaths');
    if (!d) {
      deathsEl.innerHTML = '<p class="muted small">1年経つと表示されます。</p>';
      return;
    }
    const max = Math.max(1, ...Object.values(d));
    deathsEl.innerHTML = Object.entries(DEATH_CAUSES)
      .map(
        ([k, label]) =>
          `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="width:${(d[k] / max) * 100}%"></div></div><span class="num">${d[k]}</span></div>`,
      )
      .join('');
  }

  redraw() {
    for (const c of [this.climate, this.pop, this.div, this.color, this.traits, this.sexsel, this.corr, this.pred, this.founders, this.births]) c.draw();
  }
}

// ───────────────────────── 遺伝子頻度 ─────────────────────────

// 割合の帯グラフ。segments: [{ label, value(0〜1), color(CSS 変数名) }]。凡例は常に文字で添える
function stackBar(segments, big) {
  const shown = segments.filter((x) => x.value > 0.0005);
  return `<div class="sbar${big ? '' : ' thin'}">${shown
    .map((x) => `<span style="flex-grow:${x.value};background:var(${x.color})" title="${x.label} ${pct(x.value)}"></span>`)
    .join('')}</div>
    <div class="slegend">${segments
      .map((x) => `<span class="${x.value > 0.0005 ? '' : 'zero'}"><i style="background:var(${x.color})"></i>${x.label} ${pct(x.value)}</span>`)
      .join('')}</div>`;
}

export class GenesPanel {
  constructor(el) {
    this.el = el;
    this.key = 'COL';
    el.innerHTML = `
      <h2>いまの島の遺伝子</h2>
      <p class="small muted">上の帯は見た目の割合、下の細い帯は対立遺伝子の割合。カードを押すと、その遺伝子の歴史が下に出ます。</p>
      <div id="gene-summary" class="gsum"></div>
      <h3>量的形質（複数の遺伝子座の合計）</h3>
      <p class="small muted">全遺伝子座を合わせた「＋」の数ごとの個体数。左端が＋0（最も小さい・短い・弱い）、右端がすべて＋。</p>
      <div id="poly-traits" class="gsum"></div>
      <h2 id="gene-detail" style="margin-top:22px">遺伝子座ごとの詳細</h2>
      <label>遺伝子座 <select id="locus-select">${LOCI.map((l) => `<option value="${l.key}">${l.name}（${INHERITANCE[l.mode].short}）</option>`).join('')}</select></label>
      <p id="locus-desc" class="small muted"></p>
      <div id="locus-chart"></div>
      <h3>遺伝子型：観測数とハーディー・ワインベルグ期待数</h3>
      <div id="hw-table"></div>
      <h3>全遺伝子座の対立遺伝子頻度（現在）</h3>
      <div id="all-loci"></div>`;
    this.chart = new Chart(el.querySelector('#locus-chart'), {
      title: '対立遺伝子頻度の推移',
      kind: 'stack',
      format: (v) => pct(v),
      series: [],
    });
    el.querySelector('#locus-select').addEventListener('change', (e) => {
      this.key = e.target.value;
      this.update(this.world);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-locus]');
      if (!b) return;
      this.key = b.dataset.locus;
      el.querySelector('#locus-select').value = this.key;
      this.update(this.world);
      el.querySelector('#gene-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  update(world) {
    this.world = world;
    const locus = LOCUS[this.key];
    const H = world.history;
    this.el.querySelector('#locus-desc').textContent = `${INHERITANCE[locus.mode].label}：${INHERITANCE[locus.mode].desc}`;
    this.chart.setSeries(locus.alleles.map((a) => ({ label: alleleLabel(locus, a), color: alleleColor(locus, a) })));
    this.chart.setData(
      H.map((h) => h.year),
      locus.alleles.map((a) => H.map((h) => h.freqs[locus.key][a])),
    );

    const freqs = alleleFrequencies(world.creatures);
    const { rows, diploids } = genotypeTable(world.creatures, this.key, freqs);
    this.el.querySelector('#hw-table').innerHTML = world.creatures.length
      ? `<table><thead><tr><th>遺伝子型</th><th class="num">観測</th><th class="num">期待</th><th>差</th></tr></thead><tbody>${rows
          .map((r) => {
            const diff = r.observed - r.expected;
            return `<tr><td class="genotype">${r.genotype}${r.hemizygous ? ' <span class="muted small">(オス)</span>' : ''}</td><td class="num">${r.observed}</td><td class="num">${r.expected.toFixed(1)}</td><td class="small ${Math.abs(diff) > Math.max(3, r.expected * 0.3) ? '' : 'muted'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</td></tr>`;
          })
          .join('')}</tbody></table>
        <p class="muted small">二倍体 ${diploids} 匹。ヘテロ接合体が期待より少ないのは、近親交配や島内の地域的な分断（ワーランド効果）のサイン。</p>`
      : '';

    // 量的形質の分布：「＋」の数ごと（0〜遺伝子座数×2）に個体を数える
    const alive = world.creatures.filter((c) => c.genome);
    const sums = alive.map((c) => polygenicSummary(c.genome));
    this.el.querySelector('#gene-summary').innerHTML = alive.length
      ? mendelianSummary(alive, freqs)
          .map(
            (card) => `<button type="button" class="gcard" data-locus="${card.key}">
              <div class="gtitle">${card.title}</div>
              ${stackBar(card.segments, true)}
              <div class="gallele">${stackBar(card.alleles, false)}</div>
              <div class="gnote">${card.note}</div>
            </button>`,
          )
          .join('')
      : '<p class="muted small">生きている個体がいません。</p>';

    this.el.querySelector('#poly-traits').innerHTML = alive.length
      ? `${POLYGENIC_TRAITS.map((t, ti) => {
          const bins = t.loci.length * 2 + 1;
          const hist = new Array(bins).fill(0);
          let sum = 0;
          for (const row of sums) {
            const v = row[ti].value;
            sum += v;
            hist[Math.round(v * (bins - 1))]++;
          }
          const max = Math.max(1, ...hist);
          const who = t.sex ? `（${t.sex === 'M' ? 'オス' : 'メス'}に現れる）` : '';
          return `<button type="button" class="gcard" data-locus="${t.loci[0]}">
            <div class="gtitle">${t.label} <span class="gmean">平均 ${pct(sum / alive.length)}</span></div>
            <div class="hist">${hist.map((n, k) => `<span style="height:${(n / max) * 100}%" title="＋${k}：${n} 匹"></span>`).join('')}</div>
            <div class="gnote">${t.loci.length} 座の合計${who}</div>
          </button>`;
        }).join('')}`
      : '';

    this.el.querySelector('#all-loci').innerHTML = `<table><thead><tr><th>遺伝子座</th><th>頻度</th><th></th></tr></thead><tbody>${LOCI.map((l) => {
      const f = freqs[l.key].freq;
      const bar = l.alleles
        .filter((a) => f[a] > 0)
        .map((a) => `<span style="width:${f[a] * 100}%;background:${alleleColor(l, a)}" title="${alleleLabel(l, a)} ${pct(f[a], 1)}"></span>`)
        .join('');
      const txt = l.alleles.map((a) => `${a} ${pct(f[a])}`).join(' / ');
      const fixed = l.alleles.some((a) => f[a] === 1) ? '<span class="badge gene">固定</span>' : '';
      const lost = l.alleles.some((a) => f[a] === 0) && !fixed ? '<span class="badge">一部消失</span>' : '';
      return `<tr><td><button type="button" class="link" data-locus="${l.key}">${l.name}</button></td><td><div class="freqbar">${bar}</div><div class="muted small">${txt}</div></td><td>${fixed}${lost}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  redraw() {
    this.chart.draw();
  }
}

// ───────────────────────── 遺伝図鑑 ─────────────────────────

export function renderGuide(el) {
  const byMode = {};
  for (const l of LOCI) (byMode[l.mode] ||= []).push(l);
  el.innerHTML = `<div class="guide">
    <h2>この島の生物について</h2>
    <p>雌雄のある架空の生物。<strong>2歳で成熟</strong>し、春（3〜6月）に年1回まで出産、<strong>15歳で必ず死ぬ</strong>。
    体細胞は 4 対の染色体（第1〜3染色体と性染色体）をもち、メスは XX、オスは XY。</p>
    <p>子は父母から染色体を1本ずつ受け継ぐ。配偶子がつくられるとき<strong>減数分裂で交叉（組換え）</strong>が起こるので、
    同じ染色体上で近い遺伝子ほど一緒に遺伝しやすい（連鎖）。まれに<strong>突然変異</strong>も起きる。</p>
    <h3>生死を分けるもの（自然選択）</h3>
    <ul class="small">
      <li><strong>捕食</strong>：島には捕食者がいる（数だけで表現）。体色と足元の地面の色の差が大きいほど見つかりやすい。地図に見えている地面の色がそのまま使われる。発光すると目立つ。捕食者は<strong>よく見かける色を重点的に探す</strong>（探索像）ので、多数派の色ほど狙われやすい。捕食者の数は獲物の量に応じて増減する。</li>
      <li><strong>気候</strong>：毛皮が厚く体が大きく代謝が速いほど寒さに強く、暑さに弱い。山の上は寒く海辺は暖かい。気候は地球の氷期と間氷期のように、約 600 年の周期でゆっくり冷えて急に暖まる。</li>
      <li><strong>飢え</strong>：草はマスごとに育ち、食べられて減る。同じマスの個体で頭数割りに分け合うので、たくさん食べる大きな個体ほど足りなくなりやすい。草は寒いと育たず、干ばつの年はほとんど育たない。食べ尽くされた地面は土の色になる（そこでは黒が目立たない）。</li>
      <li><strong>海</strong>：生き物は泳げない。砂浜にいる個体がまれに流木に乗って沖へ流され、たどり着いた島に上陸する（多くは海で死ぬ）。寒冷期には海面が下がり、浅瀬が陸橋になって島どうしが陸続きになる。「✏️ 地形を編集」で陸を盛ったり海を掘ったり、沖に小島をつくったりできる。</li>
      <li><strong>病気</strong>：免疫型 A/B のヘテロが強い。疫病の年は差が大きく出る。</li>
      <li><strong>遺伝病</strong>：劣性有害遺伝子をホモでもつと弱る。劣性致死 l/l は生まれてこない。</li>
      <li><strong>性選択</strong>：大きいオスは他のオスに競り勝つ。そのうえでメスは、自分の<strong>好みの遺伝子</strong>に従って長い尾や発光のオスを選ぶ。
      飾りの見栄えは栄養状態しだいなので、健康なオスほど長い尾・強い光を示せる（正直なシグナル）。
      長い尾は捕食者から逃げにくく、維持に多く食べる。選り好みの強いメスは相手探しに時間がかかり、繁殖の機会を逃しやすい。</li>
    </ul>
    <h3>遺伝子一覧</h3>
    ${Object.entries(byMode)
      .map(
        ([mode, loci]) => `<div class="locus-card">
          <h3>${INHERITANCE[mode].label}</h3>
          <p class="small">${INHERITANCE[mode].desc}</p>
          <p class="small muted">${loci
            .map((l) => `${l.name}（${CHROMOSOMES.find((c) => c.id === l.chr).name} ${l.pos}cM）：${l.alleles.map((a) => alleleLabel(l, a)).join(' / ')}`)
            .join('<br>')}</p>
        </div>`,
      )
      .join('')}
    <h3>孤島で起きること</h3>
    <ul class="small">
      <li><strong>創始者効果</strong>：最初の百匹がたまたま持っていた遺伝子だけが島の遺伝子のすべてになる。</li>
      <li><strong>遺伝的浮動</strong>：小さな集団では、有利でも不利でもない遺伝子（尾の長さなど）の頻度が偶然だけで大きく揺れ、やがて消失か固定に至る。</li>
      <li><strong>ボトルネック</strong>：災害で数が激減すると多様性が一気に失われる。</li>
      <li><strong>近交弱勢</strong>：閉じた集団では全員が次第に親戚になり、隠れていた劣性有害遺伝子がホモになって現れる。</li>
      <li><strong>平衡選択</strong>：超優性の免疫型は、浮動に逆らって両方の対立遺伝子が残りやすい。</li>
    </ul>
  </div>`;
}

// ───────────────────────── 設定 ─────────────────────────

export function renderSettings(el, opts, onChange, onRestart) {
  const o = { ...DEFAULTS, ...opts };
  el.innerHTML = `<div class="settings">
    <h2>新しい島の条件</h2>
    <p class="hint">これらは「この設定で新しい島を始める」を押したときに反映されます。</p>
    <label class="field">シード（同じシードなら同じ島・同じ歴史）<input type="text" name="seed" value="${String(o.seed).replace(/"/g, '&quot;')}"></label>
    <label class="field">島の形<select name="islandShape">${Object.entries(ISLAND_SHAPES)
      .map(([k, v]) => `<option value="${k}" ${o.islandShape === k ? 'selected' : ''}>${v.label}</option>`)
      .join('')}</select></label>
    <p class="hint">${Object.values(ISLAND_SHAPES)
      .map((v) => `<strong>${v.label}</strong>：${v.desc}`)
      .join('<br>')}</p>
    <label class="field">地質<select name="geology">
      <option value="auto" ${o.geology === 'auto' ? 'selected' : ''}>おまかせ（シードで決まる）</option>
      ${Object.entries(GEOLOGY)
        .map(([k, v]) => `<option value="${k}" ${o.geology === k ? 'selected' : ''}>${v.label}</option>`)
        .join('')}</select></label>
    <p class="hint">${Object.values(GEOLOGY)
      .map((v) => `<strong>${v.label}</strong>：${v.desc}`)
      .join('<br>')}</p>
    <label class="field">最初の個体数<input type="number" name="initialCount" min="2" max="1000" value="${o.initialCount}"></label>
    <label class="field">島の豊かさ（草の育ちやすさ）<input type="number" name="fertility" step="0.1" min="0.1" max="5" value="${o.fertility}"></label>
    <label class="field">最初の捕食者の数<input type="number" name="initialPredators" min="0" max="100" value="${o.initialPredators}"></label>
    <div class="btn-row"><button type="button" class="primary" data-action="restart">この設定で新しい島を始める</button>
    <button type="button" data-action="random-seed">ランダムなシードで始める</button></div>
    <h2 style="margin-top:18px">今すぐ反映される設定</h2>
    <label class="field">突然変異率（1遺伝子座・1配偶子あたり）<input type="number" name="mutationRate" step="0.0001" min="0" max="0.05" value="${o.mutationRate}"></label>
    <label class="field">捕食者の探索像の強さ k<input type="number" name="searchImage" step="0.1" min="1" max="4" value="${o.searchImage}"></label>
    <p class="hint">k = 1 なら捕食者は目立つ獲物を狙うだけ。k が大きいほど「よく見かける色」を重点的に探すので、少数派の色が有利になる。</p>
    <label class="check"><input type="checkbox" name="inbreedingAvoidance" ${o.inbreedingAvoidance ? 'checked' : ''}> 近親交配を避ける（半きょうだい以上の近親とは交配しない）</label>
    <label class="check"><input type="checkbox" name="randomEvents" ${o.randomEvents ? 'checked' : ''}> ランダムな出来事（疫病・干ばつ・大嵐・超寒冷期）</label>
    <label class="field">気候の周期（氷期から次の氷期まで）<select name="climateCycleYears" data-num="1">${[300, 600, 1000]
      .map((y) => `<option value="${y}" ${o.climateCycleYears === y ? 'selected' : ''}>${y} 年</option>`)
      .join('')}</select></label>
    <label class="field">気候の振れ幅<select name="climateAmplitude">${Object.entries(CLIMATE_AMPLITUDE)
      .map(([k, a]) => `<option value="${k}" ${o.climateAmplitude === k ? 'selected' : ''}>${a.label}（${a.cold}℃〜+${a.warm}℃）</option>`)
      .join('')}</select></label>
    <p class="hint">地球の氷期と間氷期のように、ゆっくり冷えて急に暖まる。寒い側に大きく、暖かい側に小さく振れる。寒い時代は海面が下がって浅瀬が陸橋になり、暖かい時代は海面が上がる。</p>
    <p class="hint">寿命は 15 歳で固定です。</p>
  </div>`;
  // 保存した島を読み込んだときに描き直すので、イベントは最初の 1 回だけ登録する
  if (el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.name) return;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.dataset.num ? Number(t.value) : t.value;
    if (t.type === 'number' && !Number.isFinite(v)) return;
    onChange(t.name, v);
  });
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'restart') onRestart(false);
    if (a === 'random-seed') onRestart(true);
  });
}

// ───────────────────────── 自然選択（実測） ─────────────────────────

const PERIODS = { 1: '昨年', 10: '直近10年', 0: '全期間' };

export class SelectionPanel {
  constructor(el) {
    this.el = el;
    this.trait = 'color';
    this.period = 10;
    el.innerHTML = `
      <p class="small">年のはじめに生きていた個体を形質で分け、<strong>1 年後に生き残った割合</strong>と<strong>成体 1 匹が残した子の数</strong>を、実際の結果から数えています。
      設定した係数ではなく、起きたことそのものです。</p>
      <div class="btn-row">
        <label>形質 <select id="sel-trait">${Object.entries(SELECTION_TRAITS)
          .map(([k, t]) => `<option value="${k}">${t.label}</option>`)
          .join('')}</select></label>
        <label>期間 <select id="sel-period">${Object.entries(PERIODS)
          .map(([k, v]) => `<option value="${k}" ${Number(k) === this.period ? 'selected' : ''}>${v}</option>`)
          .join('')}</select></label>
      </div>
      <div id="sel-table"></div>
      <p class="muted small">± は、1 匹ずつの運命が独立だと仮定したときに偶然でも生じうる幅（95%）。
      実際には家族は同じ場所に住み、同じ運命をたどりやすいので、偶然の幅はこれより広い。
      下の一覧では、差が<strong>毎年くり返し同じ向きに出ているか</strong>で判定しています（期間は 3 年以上必要）。
      <strong>耳の形</strong>は生死にも好みにも関わらない中立な形質なので、判定が正しく働いているかを確かめる「対照群」です（中立でも 10 年窓の 3% ほどは誤って「差がある」と出ます）。</p>
      <p class="muted small">体色に差が出にくいのは、捕食者が多数派の色を狙う（探索像）せいで、各色の割合が「生存率がつり合う点」に落ち着くから。つり合いが崩れるのは、雪や草の食べ尽くしで地面の色が変わったとき。</p>
      <h3>いま効いている選択（強い順）</h3>
      <div id="sel-summary"></div>`;
    el.querySelector('#sel-trait').addEventListener('change', (e) => {
      this.trait = e.target.value;
      this.update(this.world);
    });
    el.querySelector('#sel-period').addEventListener('change', (e) => {
      this.period = Number(e.target.value);
      this.update(this.world);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-trait]');
      if (!b) return;
      this.trait = b.dataset.trait;
      el.querySelector('#sel-trait').value = this.trait;
      this.update(this.world);
    });
  }

  _records(world) {
    const recs = world.history.map((h) => h.selection).filter(Boolean);
    return this.period ? recs.slice(-this.period) : recs;
  }

  update(world) {
    this.world = world;
    const recs = this._records(world);
    const tableEl = this.el.querySelector('#sel-table');
    if (recs.length === 0) {
      tableEl.innerHTML = '<p class="muted small">1 年経つと表示されます。</p>';
      this.el.querySelector('#sel-summary').innerHTML = '';
      return;
    }
    const t = SELECTION_TRAITS[this.trait];
    const rows = survivalRows(mergeSelection(recs, this.trait), t.classes);
    const maxOff = Math.max(0.01, ...rows.map((r) => r.off));
    tableEl.innerHTML = `<table>
      <thead><tr><th>区分</th><th class="num">のべ個体数</th><th>1 年後の生存率</th><th>成体 1 匹あたりの子</th><th>主な死因</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const causes = Object.entries(r.deaths)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([c, v]) => `${DEATH_CAUSES[c] ?? c} ${pct(v / Math.max(1, r.n))}`)
            .join('、');
          return `<tr>
            <td>${t.names[r.k]}</td>
            <td class="num">${r.n}</td>
            <td>${r.n ? `<div class="bars"><div class="track"><div class="fill" style="width:${r.p * 100}%"></div></div></div>${pct(r.p)} <span class="muted small">±${pct(r.pErr)}</span>` : '<span class="muted">—</span>'}</td>
            <td>${r.adults ? `<div class="bars"><div class="track"><div class="fill alt" style="width:${(r.off / maxOff) * 100}%"></div></div></div>${r.off.toFixed(2)} <span class="muted small">±${r.offErr.toFixed(2)}</span>` : '<span class="muted">—</span>'}</td>
            <td class="small">${causes || '<span class="muted">—</span>'}</td>
          </tr>`;
        })
        .join('')}</tbody></table>`;

    const summary = selectionSummary(recs);
    const badge = (s) => {
      if (s.key === 'ear') return '<span class="badge">対照（中立）</span>';
      if (s.t === null) return '<span class="badge">期間を長くして判定</span>';
      return s.t > SELECTION_T ? '<span class="badge gene">毎年安定して差がある</span>' : '<span class="badge">偶然の範囲</span>';
    };
    this.el.querySelector('#sel-summary').innerHTML = summary.length
      ? `<table><tbody>${summary
          .map(
            (s) => `<tr><td><button type="button" class="link" data-trait="${s.key}">${s.tr.label}</button></td>
            <td class="small">${s.tr.names[s.best.k]} ${pct(s.best.p)} ＞ ${s.tr.names[s.worst.k]} ${pct(s.worst.p)}</td>
            <td>${badge(s)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="muted small">個体数が少なく、まだ比べられません。</p>';
  }
}
