// ブラウザなしでシミュレーションを走らせ、年ごとの概要を表示する。
// 使い方: node tools/headless.js [年数] [シード]
import { World } from '../src/world.js';

const years = Number(process.argv[2] ?? 200);
const seed = process.argv[3] ?? 'island';
const w = new World({ seed });
const t0 = Date.now();
for (let y = 0; y < years && !w.extinct; y++) {
  for (let m = 0; m < 12; m++) w.step();
  const h = w.history.at(-1);
  if (h.year % 10 === 0 || w.extinct) {
    const d = Object.entries(h.deaths).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(' ');
    const c = h.pheno.color;
    console.log(
      `y${String(h.year).padStart(4)} pop ${String(h.pop).padStart(4)} ♂${h.males} ♀${h.females} births ${h.births} still ${h.stillborn} ` +
        `F ${h.meanF.toFixed(3)} He ${h.He.toFixed(3)} col K${c.black}/G${c.green}/w${c.white} glow ${h.pheno.glowM + h.pheno.glowF} ` +
        `size ${h.pheno.meanSize.toFixed(2)} fur ${h.pheno.meanFur.toFixed(2)} pred ${h.predators.toFixed(1)} veg ${(h.vegetation * 100).toFixed(0)}% hun ${h.hunger.toFixed(2)} | ${d}`,
    );
  }
}
for (const l of w.log.filter((e) => e.kind !== 'info')) console.log(`[${Math.floor(l.tick / 12)}] ${l.text}`);
console.log(`${Date.now() - t0}ms`);
