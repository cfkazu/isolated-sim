// 5 年ごとの「見どころ」：この 5 年に島で起きた目立つ変化を、データから数行の文章にする。
// 原因を書くのは、自然選択の実測（stats.js の selectionSummary）で差が毎年安定して出ているときだけ。
// そうでなければ「偶然（遺伝的浮動）かもしれない」と書き、データの裏付けのないことは言わない。

import { LOCI, LOCUS, INDEX } from './genes.js';
import { selectionSummary, SELECTION_T } from './stats.js';

export const DIGEST_YEARS = 5;
const MAX_ITEMS = 4;

// 1 遺伝子座で決まる形質と、自然選択の実測の区分との対応（対立遺伝子 → その遺伝子が増やす見た目）
const TRAIT_OF = {
  COL: { trait: 'color', cls: { K: 'black', G: 'green', w: 'white' } },
  MLT: { trait: 'molt', cls: { W: 'yes', b: 'no' } },
  GLW: { trait: 'glow', cls: { g: 'yes', N: 'no' } },
  ALM: { trait: 'alarm', cls: { V: 'always', v: 'never' } },
};
const SINGLE_MODES = new Set(['series', 'codominant', 'incomplete', 'xlinked', 'overdominant', 'lethal', 'epistasis', 'plastic', 'social']);

const pctOf = (v) => `${Math.round(v * 100)}%`;
const whoOf = (c) => `${c.clan}の${c.name}（${c.sex === 'F' ? '♀' : '♂'}）`;

function alleleCopies(creatures) {
  const out = {};
  for (const l of LOCI) {
    if (!SINGLE_MODES.has(l.mode)) continue;
    const i = INDEX[l.key];
    const k = Object.fromEntries(l.alleles.map((a) => [a, 0]));
    for (const c of creatures) {
      for (const a of [c.genome.m[i], c.genome.p[i]]) if (a !== null) k[a]++;
    }
    out[l.key] = k;
  }
  return out;
}

function clanCounts(world) {
  const out = {};
  for (const c of world.creatures) {
    const id = world.establishedHaplo(c.mt).id;
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}

// 変化の原因の説明（自然選択の実測があればそれ、なければ偶然の可能性）
function cause(world, key, allele, rising, sel) {
  if (LOCUS[key].mode === 'incomplete') return '耳の形は生死に関わらないので、これは偶然（遺伝的浮動）による変化。';
  if (key === 'ALM') {
    const recent = world.history.slice(-DIGEST_YEARS).map((h) => h.alarm).filter((a) => a?.r != null && a.rRandom != null);
    if (recent.length) {
      const r = recent.reduce((t, a) => t + a.r, 0) / recent.length;
      const r0 = recent.reduce((t, a) => t + a.rRandom, 0) / recent.length;
      return `鳴いた個体と、声を聞いて隠れた個体の血縁度は平均 ${r.toFixed(2)}（島の無作為な 2 匹は ${r0.toFixed(2)}）。${r > 2 * r0 ? '声は主に親族を助けている。' : '声を聞くのは親族とは限らない。'}`;
    }
  }
  const map = TRAIT_OF[key];
  const s = map && sel.find((x) => x.key === map.trait);
  if (s && s.t != null && s.t >= SELECTION_T) {
    const favored = s.best.k === map.cls[allele];
    const names = s.tr.names;
    if (favored === rising) {
      return `自然選択：${names[s.best.k]}の個体は 1 年後の生存率 ${pctOf(s.best.p)}、${names[s.worst.k]}は ${pctOf(s.worst.p)}（ここ 10 年、毎年安定した差）。`;
    }
    return `生き残りでは${rising ? '不利' : '有利'}なのに${rising ? '増えた' : '減った'}。子の数の差か、偶然かもしれない。`;
  }
  const pop = world.creatures.length;
  return pop < 120 ? `個体数が ${pop} 匹と少ないので、偶然（遺伝的浮動）の影響が大きい。` : '生き残りの差ははっきりしない（偶然かもしれない）。';
}

export function makeHighlights(world, prev) {
  const H = world.history;
  const now = H.at(-1);
  const then = H[Math.max(0, H.length - 1 - DIGEST_YEARS)];
  const cs = world.creatures;
  const items = [];
  // key は話題の種類。前回と同じ話題は後回しにする（毎回同じことを言わない）
  const add = (key, score, icon, text, id = null) => items.push({ key, score: prev?.keys?.includes(key) ? score * 0.4 : score, icon, text, id });
  // 中立な耳の形は対照群なので、選択の話題には使わない。8 年分以上のデータがあるときだけ
  const sel = selectionSummary(H.slice(-10).map((h) => h.selection).filter(Boolean)).filter((x) => x.key !== 'ear' && x.years >= 8);

  // 個体数の大きな増減
  if (then.pop > 0 && (now.pop / then.pop >= 1.8 || now.pop / then.pop <= 0.55)) {
    const deaths = {};
    for (const h of H.slice(-DIGEST_YEARS)) for (const [k, v] of Object.entries(h.deaths)) deaths[k] = (deaths[k] || 0) + v;
    const top = Object.entries(deaths).sort((a, b) => b[1] - a[1])[0];
    const label = { age: '寿命', starvation: '飢え', predation: '捕食', climate: '寒さ・暑さ', disease: '病気', genetic: '遺伝病', accident: '事故', storm: '嵐', sea: '海' };
    const up = now.pop > then.pop;
    add(up ? 'pop-up' : 'pop-down', up ? 3 : 5, up ? '📈' : '📉', `個体数が ${then.pop} → ${now.pop} 匹に${up ? '増えた' : '減った'}。${up ? '' : `いちばんの死因は${label[top[0]] ?? top[0]}（${top[1]} 匹）。`}`);
  }

  // 1 遺伝子座の遺伝子の割合の変化
  for (const l of LOCI) {
    if (!SINGLE_MODES.has(l.mode) || l.mode === 'lethal') continue;
    for (const a of l.alleles) {
      const f0 = then.freqs[l.key]?.[a];
      const f1 = now.freqs[l.key]?.[a];
      if (f0 == null || f1 == null) continue;
      const d = f1 - f0;
      if (Math.abs(d) < 0.1) continue;
      // 対立遺伝子が 2 つなら、増えた側だけ書く
      if (l.alleles.length === 2 && d < 0) continue;
      const lab = l.labels?.[a] ? `（${l.labels[a]}）` : '';
      add(`allele-${l.key}-${a}`, Math.abs(d) * 20, '🧬', `${l.name}の遺伝子 ${a}${lab}が ${pctOf(f0)} → ${pctOf(f1)} に${d > 0 ? '増えた' : '減った'}。${cause(world, l.key, a, d > 0, sel)}`);
    }
  }

  // 量的形質の平均の変化
  const climate = now.climate <= -2 ? `（寒い時代：平年より ${(-now.climate).toFixed(1)}℃ 低い）` : now.climate >= 1.5 ? `（暖かい時代：平年より ${now.climate.toFixed(1)}℃ 高い）` : '';
  const traits = [
    ['毛皮の厚さ', (h) => h.pheno.meanFur, 0.05, (v) => pctOf(v), climate],
    ['体格', (h) => h.pheno.meanSize, 0.03, (v) => v.toFixed(2), climate],
    ['代謝の速さ', (h) => h.metabolism, 0.03, (v) => v.toFixed(2), climate],
    ['オスの尾の長さの遺伝子', (h) => h.sexsel?.tail, 0.05, (v) => pctOf(v), ''],
    ['オスの旅立ちの遺伝子', (h) => h.dispersal?.geneM, 0.05, (v) => pctOf(v), ''],
    ['メスの旅立ちの遺伝子', (h) => h.dispersal?.geneF, 0.05, (v) => pctOf(v), ''],
  ];
  for (const [label, get, th, fmt, note] of traits) {
    const v0 = get(then);
    const v1 = get(now);
    if (v0 == null || v1 == null || Math.abs(v1 - v0) < th) continue;
    add(`trait-${label}`, (Math.abs(v1 - v0) / th) * 1.2, '📏', `${label}の平均が ${fmt(v0)} → ${fmt(v1)} に${v1 > v0 ? '上がった' : '下がった'}${note}。`);
  }

  // 家の勢い
  const clans = clanCounts(world);
  if (prev?.clans) {
    let best = null;
    for (const [id, n] of Object.entries(clans)) {
      const g = n - (prev.clans[id] || 0);
      if (!best || g > best.g) best = { id: Number(id), n, g };
    }
    // 5 年で 20 匹以上、かつ倍近くに増えた家だけ
    if (best && best.g >= 20 && best.n >= 1.8 * (prev.clans[best.id] || 0)) {
      const h = world.haplos.get(best.id);
      add('clan', 2 + best.g / 20, '🏠', `この 5 年でいちばん伸びた家は${world.clanOf(best.id)}（${prev.clans[best.id] || 0} → ${best.n} 匹、島の ${pctOf(best.n / cs.length)}）。`, h.founderId);
    }
  }

  // 遺伝子の最後の持ち主
  const copies = alleleCopies(cs);
  if (prev?.copies) {
    for (const l of LOCI) {
      const k = copies[l.key];
      if (!k) continue;
      for (const a of l.alleles) {
        if (k[a] < 1 || k[a] > 2 || (prev.copies[l.key]?.[a] ?? 0) < k[a] * 3) continue;
        const i = INDEX[l.key];
        const holder = cs.find((c) => c.genome.m[i] === a || c.genome.p[i] === a);
        const lab = l.labels?.[a] ? `（${l.labels[a]}）` : '';
        add(`last-${l.key}-${a}`, 4, '🕯️', `${whoOf(holder)}は、${l.name}の遺伝子 ${a}${lab}を持つ${k[a] === 1 ? '最後の 1 匹' : '最後の数匹のひとり'}。この遺伝子は島から消えかけている。`, holder.id);
      }
    }
  }

  // めずらしい個体：アルビノの子
  const albinos = cs.filter((c) => c.pheno.albino && c.age < DIGEST_YEARS * 12);
  if (albinos.length && albinos.length <= 3) {
    const c = albinos.reduce((a, b) => (b.age < a.age ? b : a));
    add('albino', 3, '🤍', `アルビノの${whoOf(c)}が生まれた。色素の遺伝子 c を、両親がどちらも隠し持っていた。`, c.id);
  }

  // いま自然選択がかかっている形質（上で書いていないもの）
  const strong = sel.find((s) => s.t != null && s.t >= SELECTION_T);
  if (strong && !items.some((x) => x.text.includes('自然選択：'))) {
    const n = strong.tr.names;
    add(`sel-${strong.key}`, 2.5, '⚖️', `いま${strong.tr.label}に自然選択がかかっている。${n[strong.best.k]}の 1 年後の生存率 ${pctOf(strong.best.p)}、${n[strong.worst.k]}は ${pctOf(strong.worst.p)}（ここ 10 年、毎年安定した差）。`);
  }

  items.sort((a, b) => b.score - a.score);
  const picked = items.slice(0, MAX_ITEMS);
  if (!picked.length) picked.push({ score: 0, icon: '🌤️', text: `大きな変化のない 5 年だった（${now.pop} 匹）。` });
  return { items: picked, snapshot: { year: world.year, clans, copies, keys: picked.map((x) => x.key).filter(Boolean) } };
}
