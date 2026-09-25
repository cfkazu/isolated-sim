// 集団遺伝学の統計：対立遺伝子頻度、ヘテロ接合度、ハーディー・ワインベルグ期待値など。

import { LOCI, INDEX, LOCUS, isXLinked, genotypeString } from './genes.js';

export function alleleFrequencies(creatures) {
  const out = {};
  for (const locus of LOCI) {
    const i = INDEX[locus.key];
    const counts = Object.fromEntries(locus.alleles.map((a) => [a, 0]));
    let total = 0;
    for (const c of creatures) {
      counts[c.genome.m[i]]++;
      total++;
      const p = c.genome.p[i];
      if (p !== null) {
        counts[p]++;
        total++;
      }
    }
    const freq = Object.fromEntries(locus.alleles.map((a) => [a, total ? counts[a] / total : 0]));
    out[locus.key] = { counts, total, freq };
  }
  return out;
}

// Ho: 観測ヘテロ接合度、He: 期待ヘテロ接合度（1 - Σp²）。X 連鎖座はメスのみで Ho を数える。
export function heterozygosity(creatures, freqs = alleleFrequencies(creatures)) {
  let hoSum = 0;
  let heSum = 0;
  let n = 0;
  for (const locus of LOCI) {
    const i = INDEX[locus.key];
    let het = 0;
    let dip = 0;
    for (const c of creatures) {
      const p = c.genome.p[i];
      if (p === null) continue;
      dip++;
      if (c.genome.m[i] !== p) het++;
    }
    const f = freqs[locus.key].freq;
    let sq = 0;
    for (const a of locus.alleles) sq += f[a] * f[a];
    hoSum += dip ? het / dip : 0;
    heSum += freqs[locus.key].total ? 1 - sq : 0;
    n++;
  }
  return { Ho: hoSum / n, He: heSum / n };
}

// 遺伝子型ごとの観測数とハーディー・ワインベルグ期待数（二倍体の個体のみ）
export function genotypeTable(creatures, key, freqs) {
  const locus = LOCUS[key];
  const i = INDEX[key];
  const observed = new Map();
  let diploids = 0;
  const hemi = new Map();
  for (const c of creatures) {
    const g = genotypeString(c.genome, key);
    if (c.genome.p[i] === null) {
      hemi.set(g, (hemi.get(g) || 0) + 1);
      continue;
    }
    diploids++;
    observed.set(g, (observed.get(g) || 0) + 1);
  }
  const f = freqs[key].freq;
  const rows = [];
  const al = locus.alleles;
  for (let a = 0; a < al.length; a++) {
    for (let b = a; b < al.length; b++) {
      const g = `${al[a]}/${al[b]}`;
      const expFreq = a === b ? f[al[a]] ** 2 : 2 * f[al[a]] * f[al[b]];
      rows.push({ genotype: g, observed: observed.get(g) || 0, expected: expFreq * diploids });
    }
  }
  if (isXLinked(locus)) {
    for (const a of al) {
      const g = `${a}/Y`;
      rows.push({ genotype: g, observed: hemi.get(g) || 0, expected: f[a] * [...hemi.values()].reduce((s, v) => s + v, 0), hemizygous: true });
    }
  }
  return { rows, diploids };
}

export function phenotypeSummary(creatures) {
  const color = { black: 0, green: 0, white: 0 };
  const pattern = { spots: 0, stripes: 0, both: 0, plain: 0 };
  const ear = [0, 0, 0];
  let glowM = 0;
  let glowF = 0;
  let size = 0;
  let fur = 0;
  let resistant = 0;
  let sick = 0;
  for (const c of creatures) {
    const ph = c.pheno;
    color[ph.color]++;
    pattern[ph.pattern]++;
    ear[ph.ear]++;
    if (ph.glow) c.sex === 'M' ? glowM++ : glowF++;
    size += ph.size;
    fur += ph.fur;
    if (ph.resistance > 0.8) resistant++;
    if (ph.load > 0) sick++;
  }
  const n = Math.max(1, creatures.length);
  return { color, pattern, ear, glowM, glowF, meanSize: size / n, meanFur: fur / n, resistant, sick };
}

function correlation(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// 性選択の指標。遺伝子の値は雌雄とも持っているので、全個体で平均と相関をとる。
// 飾りの遺伝子と好みの遺伝子の正の相関は、ランナウェイ（両者が一緒に広まる）の手がかり。
export function sexualSelectionStats(creatures) {
  const tail = [];
  const prefT = [];
  const glowAllele = [];
  const prefG = [];
  const gi = INDEX.GLW;
  for (const c of creatures) {
    tail.push(c.pheno.tailGene);
    prefT.push(c.pheno.prefTailGene);
    prefG.push(c.pheno.prefGlowGene);
    const copies = [c.genome.m[gi], c.genome.p[gi]].filter((a) => a !== null);
    glowAllele.push(copies.filter((a) => a === 'g').length / copies.length);
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    tail: mean(tail),
    prefTail: mean(prefT),
    prefGlow: mean(prefG),
    corrTail: correlation(tail, prefT),
    corrGlow: correlation(glowAllele, prefG),
  };
}

// ───── 自然選択の実測 ─────
// 年のはじめに生きていた個体（コホート）を形質で分け、1 年後の生存率と、成体が残した子の数を数える。
// 「設定した係数」ではなく「実際に起きた結果」から選択の強さを見るためのもの。

const SIZE_CUT = [0.93, 1.07];
const THIRDS = [1 / 3, 2 / 3];
const bin3 = (v, cut, names) => (v < cut[0] ? names[0] : v < cut[1] ? names[1] : names[2]);

export const SELECTION_TRAITS = {
  color: {
    label: '体色',
    classes: ['black', 'green', 'white'],
    names: { black: '黒', green: '緑', white: '白' },
    of: (c) => c.pheno.color,
  },
  glow: {
    label: '発光（オス）',
    male: true,
    classes: ['yes', 'no'],
    names: { yes: '発光する', no: '発光しない' },
    of: (c) => (c.pheno.glow ? 'yes' : 'no'),
  },
  tail: {
    label: '尾の長さ（オス）',
    male: true,
    classes: ['short', 'mid', 'long'],
    names: { short: '短い', mid: '中くらい', long: '長い' },
    of: (c) => bin3(c.pheno.tail, THIRDS, ['short', 'mid', 'long']),
  },
  immunity: {
    label: '免疫型',
    classes: ['het', 'hom'],
    names: { het: 'ヘテロ（A/B）', hom: 'ホモ（A/A・B/B）' },
    of: (c) => (c.pheno.resistance > 0.8 ? 'het' : 'hom'),
  },
  size: {
    label: '体格',
    classes: ['small', 'mid', 'large'],
    names: { small: '小さい', mid: 'ふつう', large: '大きい' },
    of: (c) => bin3(c.pheno.size, SIZE_CUT, ['small', 'mid', 'large']),
  },
  fur: {
    label: '毛皮',
    classes: ['thin', 'mid', 'thick'],
    names: { thin: '薄い', mid: 'ふつう', thick: '厚い' },
    of: (c) => bin3(c.pheno.fur, THIRDS, ['thin', 'mid', 'thick']),
  },
  metabolism: {
    label: '代謝',
    classes: ['slow', 'mid', 'fast'],
    names: { slow: '遅い（燃費型）', mid: 'ふつう', fast: '速い' },
    of: (c) => bin3(c.pheno.metabolism, [0.93, 1.07], ['slow', 'mid', 'fast']),
  },
  load: {
    label: '遺伝病',
    classes: ['healthy', 'sick'],
    names: { healthy: 'なし', sick: 'あり（d/d）' },
    of: (c) => (c.pheno.load > 0 ? 'sick' : 'healthy'),
  },
  ear: {
    label: '耳の形（中立・対照群）',
    classes: ['2', '1', '0'],
    names: { 2: '立ち耳', 1: '半立ち耳', 0: '垂れ耳' },
    of: (c) => String(c.pheno.ear),
  },
};

// cohort: 年はじめの個体。各個体の yearOffspring はその年に生まれた子の数。
export function selectionStats(cohort, startTick, maturityMonths) {
  const out = {};
  for (const [key, t] of Object.entries(SELECTION_TRAITS)) {
    const rows = Object.fromEntries(t.classes.map((k) => [k, { n: 0, survived: 0, adults: 0, offspring: 0, deaths: {} }]));
    for (const c of cohort) {
      if (t.male && c.sex !== 'M') continue;
      const r = rows[t.of(c)];
      r.n++;
      if (c.alive) r.survived++;
      else r.deaths[c.cause] = (r.deaths[c.cause] || 0) + 1;
      // 年はじめに成体だった個体の子の数（幼体は子を残せないので分母から外す）
      if (startTick - c.birthTick >= maturityMonths) {
        r.adults++;
        r.offspring += c.yearOffspring;
      }
    }
    out[key] = rows;
  }
  return out;
}

// 複数年分を合算する
export function mergeSelection(records, key) {
  const t = SELECTION_TRAITS[key];
  const rows = Object.fromEntries(t.classes.map((k) => [k, { n: 0, survived: 0, adults: 0, offspring: 0, deaths: {} }]));
  for (const rec of records) {
    const src = rec?.[key];
    if (!src) continue;
    for (const k of t.classes) {
      const a = rows[k];
      const b = src[k];
      a.n += b.n;
      a.survived += b.survived;
      a.adults += b.adults;
      a.offspring += b.offspring;
      for (const [cause, v] of Object.entries(b.deaths)) a.deaths[cause] = (a.deaths[cause] || 0) + v;
    }
  }
  return rows;
}

// ───── 創始者の系統 ─────
// 各個体の lineage は「どの創始者から何割の遺伝子を受け継いでいるか」の期待値（家系から計算）。
export function founderShares(creatures) {
  const sum = new Map();
  for (const c of creatures) {
    if (!c.lineage) continue;
    for (const [id, v] of Object.entries(c.lineage)) sum.set(Number(id), (sum.get(Number(id)) || 0) + v);
  }
  const n = creatures.length || 1;
  return [...sum.entries()].map(([id, v]) => ({ id, share: v / n })).sort((a, b) => b.share - a.share);
}

export function survivalRows(rows, classes) {
  return classes.map((k) => {
    const r = rows[k];
    const p = r.n ? r.survived / r.n : 0;
    const off = r.adults ? r.offspring / r.adults : 0;
    return {
      k,
      ...r,
      p,
      pErr: r.n ? 2 * Math.sqrt((p * (1 - p)) / r.n) : 0,
      off,
      offErr: r.adults ? 2 * Math.sqrt(Math.max(off, 0.25) / r.adults) : 0,
    };
  });
}

// 「毎年安定して差がある」と判定する t 値。中立な耳の形で誤判定が 10 年窓の 3% ほどになるよう較正した。
export const SELECTION_T = 3.5;

// 年ごとの差の平均 ÷ 標準誤差（t 値）で、差が毎年安定して出ているかを判定する材料を返す
export function selectionSummary(recs) {
  // 形質ごとに、全期間を合わせて生存率が最も高い区分と低い区分を決め、その差が「毎年」安定して出ているかを見る。
  // 年ごとの差のばらつきを使うので、家族がまとまって生き死にする効果（1 匹ずつが独立でないこと）も含めて判断できる。
  return Object.entries(SELECTION_TRAITS)
    .map(([key, tr]) => {
      const rs = survivalRows(mergeSelection(recs, key), tr.classes).filter((r) => r.n >= 10);
      if (rs.length < 2) return null;
      const best = rs.reduce((a, b) => (b.p > a.p ? b : a));
      const worst = rs.reduce((a, b) => (b.p < a.p ? b : a));
      const diffs = [];
      for (const rec of recs) {
        const a = rec[key][best.k];
        const b = rec[key][worst.k];
        if (a.n >= 3 && b.n >= 3) diffs.push(a.survived / a.n - b.survived / b.n);
      }
      let t = null;
      if (diffs.length >= 3) {
        const m = diffs.reduce((x, y) => x + y, 0) / diffs.length;
        const sd = Math.sqrt(diffs.reduce((x, y) => x + (y - m) ** 2, 0) / (diffs.length - 1));
        t = sd > 0 ? m / (sd / Math.sqrt(diffs.length)) : m > 0 ? Infinity : 0;
      }
      return { key, tr, best, worst, t, years: diffs.length };
    })
    .filter(Boolean)
    .sort((a, b) => (b.t ?? -1) - (a.t ?? -1));
}

// ───── 遺伝子のサマリー（量的でない遺伝子） ─────
// 見た目の分布と対立遺伝子の頻度、それに「見た目に出ていない遺伝子」をひと目で見るためのカード用データ。
// segments の color は CSS 変数名。

const pctText = (v) => `${Math.round(v * 100)}%`;

export function mendelianSummary(creatures, freqs = alleleFrequencies(creatures)) {
  const n = Math.max(1, creatures.length);
  const count = (pred) => creatures.filter(pred).length;
  const has = (c, key, a) => allelesOf(c, key).includes(a);
  const alleles = (key, colors) =>
    LOCUS[key].alleles.map((a, i) => ({ label: `${a}${LOCUS[key].labels?.[a] ? `（${LOCUS[key].labels[a]}）` : ''}`, value: freqs[key].freq[a], color: colors[i] }));
  const cards = [];

  const col = { black: 0, green: 0, white: 0 };
  for (const c of creatures) col[c.pheno.color]++;
  const wCarrier = count((c) => c.pheno.color !== 'white' && has(c, 'COL', 'w'));
  cards.push({
    key: 'COL',
    title: '体色',
    segments: [
      { label: '黒', value: col.black / n, color: '--body-black' },
      { label: '緑', value: col.green / n, color: '--body-green' },
      { label: '白', value: col.white / n, color: '--body-white' },
    ],
    alleles: alleles('COL', ['--body-black', '--body-green', '--body-white']),
    note: `見た目が白は ${pctText(col.white / n)}。ほかに ${pctText(wCarrier / n)} が白の遺伝子 w を隠し持つ。`,
  });

  const pat = { spots: 0, stripes: 0, both: 0, plain: 0 };
  for (const c of creatures) pat[c.pheno.pattern]++;
  cards.push({
    key: 'PAT',
    title: '模様',
    segments: [
      { label: '斑点', value: pat.spots / n, color: '--series-1' },
      { label: '縞', value: pat.stripes / n, color: '--series-2' },
      { label: '斑点＋縞', value: pat.both / n, color: '--series-5' },
      { label: '無地', value: pat.plain / n, color: '--grid' },
    ],
    alleles: alleles('PAT', ['--series-1', '--series-2', '--grid']),
    note: `斑点＋縞（S と T の共優性）は ${pctText(pat.both / n)}。`,
  });

  const ear = [0, 0, 0];
  for (const c of creatures) ear[c.pheno.ear]++;
  cards.push({
    key: 'EAR',
    title: '耳の形',
    segments: [
      { label: '立ち耳', value: ear[2] / n, color: '--series-1' },
      { label: '半立ち', value: ear[1] / n, color: '--series-3' },
      { label: '垂れ耳', value: ear[0] / n, color: '--series-2' },
    ],
    alleles: alleles('EAR', ['--series-1', '--series-2']),
    note: '生死にも好みにも関わらない中立な形質。割合は偶然だけで揺れる（遺伝的浮動）。',
  });

  const males = creatures.filter((c) => c.sex === 'M');
  const females = creatures.filter((c) => c.sex === 'F');
  const glowM = males.filter((c) => c.pheno.glow).length;
  const glowF = females.filter((c) => c.pheno.glow).length;
  const carrierF = females.filter((c) => !c.pheno.glow && has(c, 'GLW', 'g')).length;
  cards.push({
    key: 'GLW',
    title: '発光',
    segments: [
      { label: '発光する', value: (glowM + glowF) / n, color: '--series-4' },
      { label: '発光しない', value: 1 - (glowM + glowF) / n, color: '--grid' },
    ],
    alleles: alleles('GLW', ['--grid', '--series-4']),
    note: `オスの ${pctText(glowM / Math.max(1, males.length))}、メスの ${pctText(glowF / Math.max(1, females.length))} が発光（X 連鎖劣性なのでオスに出やすい）。発光しないメスの保因者 ${pctText(carrierF / Math.max(1, females.length))}。`,
  });

  const het = count((c) => c.pheno.resistance > 0.8);
  const aa = count((c) => c.pheno.resistance > 0.5 && c.pheno.resistance <= 0.8);
  cards.push({
    key: 'VIT',
    title: '免疫型',
    segments: [
      { label: 'A/B（強い）', value: het / n, color: '--series-3' },
      { label: 'A/A', value: aa / n, color: '--series-1' },
      { label: 'B/B', value: (n - het - aa) / n, color: '--series-2' },
    ],
    alleles: alleles('VIT', ['--series-1', '--series-2']),
    note: `ヘテロ（最も病気に強い）は ${pctText(het / n)}。超優性なので A も B も消えにくい。`,
  });

  const letCarrier = count((c) => has(c, 'LET', 'l'));
  cards.push({
    key: 'LET',
    title: '致死因子',
    segments: [
      { label: '保因者（L/l）', value: letCarrier / n, color: '--series-2' },
      { label: 'なし', value: 1 - letCarrier / n, color: '--grid' },
    ],
    alleles: alleles('LET', ['--grid', '--series-2']),
    note: `l/l の子は生まれてこない。保因者は健康なまま ${pctText(letCarrier / n)} いる。`,
  });

  const dl = ['DL1', 'DL2', 'DL3'];
  const sick = count((c) => c.pheno.load > 0);
  const dCarrier = count((c) => c.pheno.load === 0 && dl.some((k) => has(c, k, 'd')));
  const dFreq = dl.reduce((a, k) => a + freqs[k].freq.d, 0) / dl.length;
  cards.push({
    key: 'DL1',
    title: '有害因子（3 座）',
    segments: [
      { label: '発症（d/d）', value: sick / n, color: '--bad' },
      { label: '保因者', value: dCarrier / n, color: '--series-2' },
      { label: 'なし', value: (n - sick - dCarrier) / n, color: '--grid' },
    ],
    alleles: [
      { label: 'D（正常）', value: 1 - dFreq, color: '--grid' },
      { label: 'd（有害・3 座平均）', value: dFreq, color: '--series-2' },
    ],
    note: `発症 ${pctText(sick / n)}、保因者 ${pctText(dCarrier / n)}。近親交配が進むと発症が増える（近交弱勢）。`,
  });
  return cards;
}

function allelesOf(c, key) {
  const i = INDEX[key];
  return [c.genome.m[i], c.genome.p[i]].filter((a) => a !== null);
}

// ───── 島ごと ─────
// 陸地（島）ごとの個体数と見た目、島どうしの遺伝的な違い（F_ST）。
// F_ST = (H_T − H_S) / H_T。H_T は全体をひとつの集団とみたときの期待ヘテロ接合度、H_S は島ごとの値の（個体数で重みをつけた）平均。
// 0 なら島の間で遺伝子の割合が同じ、大きいほど島ごとに別々の道を歩んでいる。
export function islandStats(creatures, island) {
  const groups = new Map();
  for (const c of creatures) {
    const id = island.landmassAt(c.x, c.y);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(c);
  }
  const rows = island.landmasses
    .map((m) => {
      const cs = groups.get(m.id) ?? [];
      const color = { black: 0, green: 0, white: 0 };
      for (const c of cs) color[c.pheno.color]++;
      return { id: m.id, name: m.name, size: m.size, pop: cs.length, color, creatures: cs };
    })
    .filter((r) => r.pop > 0 || r.size >= 15);
  const peopled = rows.filter((r) => r.pop >= 2);
  let fst = null;
  if (peopled.length >= 2) {
    const all = peopled.flatMap((r) => r.creatures);
    const HT = heterozygosity(all).He;
    let HS = 0;
    for (const r of peopled) HS += heterozygosity(r.creatures).He * r.pop;
    HS /= all.length;
    fst = HT > 0 ? Math.max(0, (HT - HS) / HT) : 0;
  }
  return { rows: rows.map(({ creatures: _, ...r }) => r), fst };
}
