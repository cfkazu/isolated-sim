// 面白さの指標（docs/DESIGN.md §8）を多数のシードで集計する。
// 使い方: node tools/metrics.js [シード数=30] [年数=300] [key=value ...（World のオプション）]
import { World } from '../src/world.js';

const n = Number(process.argv[2] ?? 30);
const years = Number(process.argv[3] ?? 300);
const extra = Object.fromEntries(
  process.argv.slice(4).map((kv) => {
    const [k, v] = kv.split('=');
    return [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v)];
  }),
);

const COLORS = ['black', 'green', 'white'];
const res = [];
const t0 = Date.now();
for (let s = 0; s < n; s++) {
  const w = new World({ seed: `m${s}`, ...extra });
  for (let m = 0; m < years * 12 && !w.extinct; m++) w.step();
  const H = w.history;
  const last = H.at(-1);
  // 優勢な体色の入れ替わり（10 年移動平均で最多の色が変わった回数）
  let flips = 0;
  let prev = null;
  for (let i = 10; i < H.length; i++) {
    const sum = { black: 0, green: 0, white: 0 };
    for (let j = i - 10; j < i; j++) for (const c of COLORS) sum[c] += H[j].pheno.color[c];
    const top = COLORS.reduce((a, b) => (sum[b] > sum[a] ? b : a));
    if (prev && top !== prev) flips++;
    prev = top;
  }
  const pops = H.map((h) => h.pop);
  const mean = pops.reduce((a, b) => a + b, 0) / pops.length;
  const cv = Math.sqrt(pops.reduce((a, b) => a + (b - mean) ** 2, 0) / pops.length) / mean;
  const total = last.pop || 1;
  const shares = COLORS.map((c) => last.pheno.color[c] / total);
  res.push({
    extinct: w.extinct,
    years: last.year,
    top: last.pop ? COLORS[shares.indexOf(Math.max(...shares))] : '-',
    poly: last.pop > 0 && shares.filter((x) => x >= 0.05).length >= 2,
    flips,
    cv,
    meanPop: mean,
    minPop: Math.min(...pops),
    predYears: H.filter((h) => h.predators > 0).length / H.length,
    he: last.He / (H[0].He || 1),
  });
}
const pct = (x) => `${Math.round(x * 100)}%`;
const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
const alive = res.filter((r) => !r.extinct);
const tops = {};
for (const r of alive) tops[r.top] = (tops[r.top] || 0) + 1;
console.log(`シード ${n} 個 × ${years} 年  ${JSON.stringify(extra)}  (${((Date.now() - t0) / 1000).toFixed(1)}秒)`);
console.log(`絶滅                     ${pct(res.filter((r) => r.extinct).length / n)}   （目安 5〜20%）`);
console.log(`最後に最も多い体色       ${Object.entries(tops).map(([k, v]) => `${k} ${v}`).join(' / ')}   （1 色に偏らない）`);
console.log(`2 色以上が 5% 以上残る   ${pct(alive.filter((r) => r.poly).length / Math.max(1, alive.length))}   （半分以上）`);
console.log(`優勢な体色の入れ替わり   平均 ${avg((r) => r.flips).toFixed(1)} 回   （1 回以上）`);
console.log(`個体数の変動係数         ${avg((r) => r.cv).toFixed(2)}   平均個体数 ${avg((r) => r.meanPop).toFixed(0)}  最少の平均 ${avg((r) => r.minPop).toFixed(0)}`);
console.log(`捕食者がいた期間         ${pct(avg((r) => r.predYears))}`);
console.log(`多様性の残存率（生存）   ${pct(alive.reduce((a, r) => a + r.he, 0) / Math.max(1, alive.length))}`);
