// シナリオ：島の始まり方のテンプレート。
// 自然のままでは起きにくい状況（家ごとに固まって住む、東と西が両端から出会う…）から始めて、その後を観察する。
// 始まり方だけを決め、その後の規則は変えない。
//
// あとで自分でもシナリオを書けるように、すべてデータ（JSON にできる形）で書く。
//   opts      : 島の設定（DEFAULTS のうち上書きしたいもの）
//   climateStart : 気候の波のどこから始めるか（0 = 間氷期の始まり、0.8 = 氷期の底、1 の手前 = 急な温暖化）
//   freqs     : 最初の個体全員の遺伝子の割合 { 遺伝子座: { 対立遺伝子: 重み } }
//   groups    : 最初の個体をいくつかの群れに分ける [{ name, share, place: { x, y, r }, clan, origin, freqs }]
//               place は島全体を 0〜1 とした位置と半径。clan: true なら群れのメスは全員同じ家（母系）
//   events    : [{ year, event }]。event は「神の介入」と同じ名前（epidemic, famine, cold, warm, supercold, storm, castaway, predators）
//   watch     : 見どころの案内（文章）

import { LOCI, LOCUS, POLYGENIC_TRAITS } from './genes.js';
import { GEOLOGY, ISLAND_SHAPES } from './island.js';

export const SCENARIO_FORMAT = 1;

// 予定に書ける出来事（「神の介入」と同じ）
export const EVENTS = {
  epidemic: '疫病',
  famine: '干ばつ',
  cold: '寒冷期',
  warm: '温暖期',
  supercold: '超寒冷期',
  storm: '大嵐',
  castaway: '漂着者',
  predators: '捕食者の上陸',
};

// 気候の波のどこから始めるか（画面の選択肢）
export const CLIMATE_STARTS = [
  [null, 'おまかせ（間氷期〜寒冷化のどこか）'],
  [0.05, '間氷期の始まり'],
  [0.4, '寒冷化の途中'],
  [0.62, '寒冷化の終わり（氷期の手前）'],
  [0.78, '氷期の底'],
  [0.9, '急な温暖化の途中'],
];

// 画面で指定する「形質」の単位。量的形質はその形質の全遺伝子座に同じ割合を入れる。
// value は allele の割合（2 対立遺伝子の座では、残りがもう一方になる）
export const TRAIT_DEFS = [
  ...POLYGENIC_TRAITS.map((t) => ({ key: t.trait, label: `${t.label}（＋の割合）`, loci: t.loci, allele: '+' })),
  { key: 'del', label: '有害因子（3 座の d の割合）', loci: LOCI.filter((l) => l.mode === 'deleterious').map((l) => l.key), allele: 'd' },
];
const TRAIT_BY_KEY = Object.fromEntries(TRAIT_DEFS.map((t) => [t.key, t]));

// 画面の「形質」の一覧に 1 つの遺伝子座のまま出すもの（それ以外は「詳しく」で遺伝子座ごとに）
export const SIMPLE_LOCI = LOCI.filter((l) => ['series', 'codominant', 'incomplete', 'xlinked', 'overdominant', 'lethal', 'epistasis', 'plastic', 'social'].includes(l.mode)).map((l) => l.key);

const LOW_DISPERSAL = { DM1: { '+': 0.05 }, DM2: { '+': 0.05 }, DF1: { '+': 0.05 }, DF2: { '+': 0.05 } };

export const SCENARIOS = {
  free: {
    label: '自由（標準）',
    desc: '百匹を島じゅうに散らして始める。いつもの島。',
    watch: [],
  },
  villages: {
    label: '四つの村',
    desc: '四つの家が島の四隅に分かれて暮らしている。家ごとに体色が違い、みんなあまり旅立たない。',
    opts: { islandShape: 'single' },
    freqs: LOW_DISPERSAL,
    groups: [
      { name: '北西の村', share: 0.25, place: { x: 0.26, y: 0.3, r: 0.09 }, clan: true, freqs: { COL: { K: 0.8, G: 0.2 } } },
      { name: '北東の村', share: 0.25, place: { x: 0.74, y: 0.3, r: 0.09 }, clan: true, freqs: { COL: { G: 1 } } },
      { name: '南西の村', share: 0.25, place: { x: 0.26, y: 0.7, r: 0.09 }, clan: true, freqs: { COL: { w: 1 }, PAT: { T: 0.8, o: 0.2 } } },
      { name: '南東の村', share: 0.25, place: { x: 0.74, y: 0.7, r: 0.09 }, clan: true, freqs: { COL: { G: 0.5, w: 0.5 }, PAT: { S: 0.8, o: 0.2 } } },
    ],
    watch: [
      '地図の表示を「家（母系）」にして、村の境目がいつ崩れるか。',
      '旅立ちの遺伝子（集団タブ）：あまり旅立たない群れから、遠くへ行く個体は現れるか。',
      '「集団」タブの家ごとの特徴：村ごとの体色の違いは何年残るか。',
    ],
  },
  eastwest: {
    label: '東と西の出会い',
    desc: '東の土地の群れが島の東端に、西の土地の群れが西端に着いた。両者の間の子は子ができにくい。',
    opts: { islandShape: 'single' },
    groups: [
      { name: '東の群れ', share: 0.5, place: { x: 0.72, y: 0.5, r: 0.12 }, origin: 0 },
      { name: '西の群れ', share: 0.5, place: { x: 0.28, y: 0.5, r: 0.12 }, origin: 1 },
    ],
    watch: [
      '地図の表示を「東西の由来」にして、島の真ん中にできる交雑帯（赤紫の雑種）を見る。',
      '交雑帯は動くか、消えるか。最後に島は東型・西型・祖先型のどれに染まるか。',
    ],
  },
  whiteisland: {
    label: '白い島の緑の群れ',
    desc: '白い砂と石灰岩のサンゴ礁の島に、緑の群れがたどり着いた。白の遺伝子 w はわずか。',
    opts: { geology: 'coral', initialPredators: 10 },
    freqs: { COL: { G: 0.95, w: 0.05 } },
    watch: ['隠れていた白の遺伝子 w（劣性）は、捕食者に選ばれて増えるか。遺伝子頻度タブの体色と、自然選択タブの体色の生存率。'],
  },
  iceage: {
    label: '氷河期の入口',
    desc: '寒冷化の途中から始まり、30 年目に超寒冷期が来る。冬に白くなる換毛の遺伝子がわずかにある。',
    climateStart: 0.62,
    freqs: { MLT: { W: 0.08, b: 0.92 } },
    events: [{ year: 30, event: 'supercold' }],
    watch: ['超寒冷期のあと、換毛の遺伝子 W と毛皮の厚さはどう変わるか。暖かくなったら白い冬毛はどうなるか。'],
  },
  bottleneck: {
    label: '十匹からの出発',
    desc: '島に着いたのは 10 匹だけ。近親交配は避けられない。',
    opts: { initialCount: 10, initialPredators: 2 },
    watch: [
      '近交係数と遺伝的多様性（集団タブ）。有害因子や致死因子は表に出て、浄化されるか。',
      '創始者の系統：最後まで子孫を残すのは何匹か。',
    ],
  },
  paradise: {
    label: '捕食者のいない楽園',
    desc: '捕食者のいない島。60 年目に捕食者が海を渡ってくる。',
    opts: { initialPredators: 0 },
    events: [{ year: 60, event: 'predators' }],
    watch: ['捕食者がいない間、目立つ体色・長い尾・発光はどこまで広まるか。捕食者が来てから、何が真っ先に減るか。'],
  },
};

// 最初の個体 k（全 n 匹のうち）が属する群れ
export function groupOf(sc, k, n) {
  const gs = sc?.groups;
  if (!gs?.length) return null;
  const total = gs.reduce((t, g) => t + (g.share ?? 1), 0);
  let acc = 0;
  for (let i = 0; i < gs.length; i++) {
    acc += (gs[i].share ?? 1) / total;
    if (k < Math.round(acc * n)) return i;
  }
  return gs.length - 1;
}

// ───── 自作シナリオ：検査と展開 ─────

const num = (v, lo, hi, def) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
};
const str = (v, max, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);

function cleanFreqs(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, dist] of Object.entries(raw)) {
    const locus = LOCUS[key];
    if (!locus || !dist || typeof dist !== 'object') continue;
    const d = {};
    for (const a of locus.alleles) if (dist[a] != null) d[a] = num(dist[a], 0, 1000, 0);
    if (Object.keys(d).length) out[key] = d;
  }
  return out;
}

function cleanTraits(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) if (TRAIT_BY_KEY[k]) out[k] = num(v, 0, 1, 0.5);
  return out;
}

function cleanOpts(raw) {
  const o = {};
  if (!raw || typeof raw !== 'object') return o;
  if (ISLAND_SHAPES[raw.islandShape]) o.islandShape = raw.islandShape;
  if (raw.geology === 'auto' || GEOLOGY[raw.geology]) o.geology = raw.geology;
  if (raw.initialCount != null) o.initialCount = Math.round(num(raw.initialCount, 2, 1000, 100));
  if (raw.fertility != null) o.fertility = num(raw.fertility, 0.1, 5, 1);
  if (raw.initialPredators != null) o.initialPredators = Math.round(num(raw.initialPredators, 0, 100, 6));
  if (typeof raw.seed === 'string' && raw.seed.trim()) o.seed = raw.seed.trim().slice(0, 40);
  return o;
}

// 人からもらったシナリオでも安全に使えるよう、知らない項目は捨て、数値は範囲に収める
export function normalizeScenario(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('シナリオの形になっていません');
  const groups = (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 12).map((g, i) => {
    const out = {
      name: str(g?.name, 30, `群れ${i + 1}`) || `群れ${i + 1}`,
      share: num(g?.share, 0.001, 1000, 1),
      clan: g?.clan === true,
      freqs: cleanFreqs(g?.freqs),
      traits: cleanTraits(g?.traits),
    };
    if (g?.place && typeof g.place === 'object') out.place = { x: num(g.place.x, 0, 1, 0.5), y: num(g.place.y, 0, 1, 0.5), r: num(g.place.r, 0.02, 0.5, 0.1) };
    if (g?.origin === 0 || g?.origin === 1) out.origin = g.origin;
    return out;
  });
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .slice(0, 50)
    .filter((e) => e && EVENTS[e.event])
    .map((e) => ({ year: Math.round(num(e.year, 1, 5000, 10)), event: e.event }));
  const id = typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : `my-${Date.now().toString(36)}`;
  return {
    format: SCENARIO_FORMAT,
    id,
    label: str(raw.label, 40).trim() || '名前のないシナリオ',
    desc: str(raw.desc, 300),
    watch: (Array.isArray(raw.watch) ? raw.watch : []).filter((w) => typeof w === 'string' && w.trim()).slice(0, 10).map((w) => w.slice(0, 200)),
    opts: cleanOpts(raw.opts),
    climateStart: raw.climateStart == null ? null : num(raw.climateStart, 0, 0.999, null),
    freqs: cleanFreqs(raw.freqs),
    traits: cleanTraits(raw.traits),
    groups,
    events,
  };
}

// 形質の指定（traits）を遺伝子座ごとの割合（freqs）に展開し、遺伝子座ごとの指定（freqs）で上書きする
export function expandFreqs(target) {
  if (!target) return null;
  const out = {};
  for (const [k, v] of Object.entries(target.traits ?? {})) {
    const t = TRAIT_BY_KEY[k];
    if (!t) continue;
    for (const key of t.loci) {
      const other = LOCUS[key].alleles.find((a) => a !== t.allele);
      out[key] = { [t.allele]: v, [other]: 1 - v };
    }
  }
  return Object.assign(out, target.freqs ?? {});
}

// World が使うシナリオの中身：自作（opts.scenarioData）か、組み込みの名前から
export function scenarioOf(opts) {
  if (opts.scenarioData) {
    try {
      return normalizeScenario(opts.scenarioData);
    } catch {
      return SCENARIOS.free;
    }
  }
  return SCENARIOS[opts.scenario] ?? SCENARIOS.free;
}

// 組み込みシナリオを、編集できる自作シナリオの下書きにする
export function draftFrom(key, custom = null) {
  const src = custom ?? SCENARIOS[key] ?? SCENARIOS.free;
  const d = normalizeScenario(JSON.parse(JSON.stringify(src)));
  if (!custom) {
    d.id = `my-${Date.now().toString(36)}`;
    d.label = key === 'free' ? '新しいシナリオ' : `${d.label}（改）`;
    if (key === 'free') d.desc = '';
  }
  return d;
}

// 保存の前の確認
export function scenarioWarnings(sc, defaultCount = 100) {
  const out = [];
  const n = sc.opts?.initialCount ?? defaultCount;
  if (sc.groups.length) {
    const counts = sc.groups.map(() => 0);
    const sexes = sc.groups.map(() => new Set());
    for (let k = 0; k < n; k++) {
      const g = groupOf(sc, k, n);
      counts[g]++;
      sexes[g].add(k % 2);
    }
    sc.groups.forEach((g, i) => {
      if (counts[i] < 2) out.push(`「${g.name}」は ${counts[i]} 匹しかいません（2 匹以上にしないと子が生まれません）。`);
      else if (sexes[i].size < 2) out.push(`「${g.name}」は片方の性だけです。`);
      if (!g.place) out.push(`「${g.name}」は置き場所が決まっていないので、島じゅうに散らばります。`);
    });
  }
  for (const [key, d] of Object.entries(expandFreqs(sc))) {
    if (Object.values(d).every((v) => v <= 0)) out.push(`${LOCUS[key].name}の割合がすべて 0 です（指定は無視されます）。`);
  }
  return out;
}

// 最初の個体の、群れごとの数
export function groupCounts(sc, n) {
  const counts = sc.groups.map(() => 0);
  for (let k = 0; k < n; k++) {
    const g = groupOf(sc, k, n);
    if (g != null) counts[g]++;
  }
  return counts;
}
