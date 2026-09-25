import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pedigree } from '../src/pedigree.js';
import { World } from '../src/world.js';

function ped(entries) {
  const p = new Pedigree();
  for (const [id, fatherId, motherId] of entries) p.add({ id, fatherId, motherId, F: 0, birthTick: 0, alive: true });
  return p;
}

test('血縁係数: 親子・全きょうだい 0.25、半きょうだい 0.125、いとこ 0.0625', () => {
  // 1,2 = 祖父母、3,4 = その子（全きょうだい）、5,6 = 別の親、7 = 3×5 の子、8 = 4×6 の子
  // 9 = 1×5 の子（3 とは半きょうだい）
  const p = ped([
    [1, null, null],
    [2, null, null],
    [3, 1, 2],
    [4, 1, 2],
    [5, null, null],
    [6, null, null],
    [7, 3, 5],
    [8, 4, 6],
    [9, 1, 5],
  ]);
  assert.equal(p.kinship(1, 3), 0.25);
  assert.equal(p.kinship(3, 4), 0.25);
  assert.equal(p.kinship(3, 9), 0.125);
  assert.equal(p.kinship(7, 8), 0.0625);
  assert.equal(p.kinship(1, 2), 0);
  assert.equal(p.kinship(3, 3), 0.5);
});

test('World: 同じシードなら同じ歴史になる', () => {
  const a = new World({ seed: 'repro' });
  const b = new World({ seed: 'repro' });
  for (let i = 0; i < 12 * 20; i++) {
    a.step();
    b.step();
  }
  assert.deepEqual(
    a.history.map((h) => h.pop),
    b.history.map((h) => h.pop),
  );
});

test('World: 100 匹から始まり、15 歳を超えて生きる個体はいない', () => {
  const w = new World({ seed: 'lifespan', initialCount: 100 });
  assert.equal(w.creatures.length, 100);
  assert.equal(w.creatures.filter((c) => c.sex === 'M').length, 50);
  for (let i = 0; i < 12 * 40; i++) {
    w.step();
    for (const c of w.creatures) assert.ok(c.age < 180, `age ${c.age}`);
  }
  assert.equal(w.history.length, 41);
  assert.ok(w.history.some((h) => h.births > 0));
});

test('World: 近親交配を避けると近親間の出産が減る', () => {
  const run = (avoid) => {
    const w = new World({ seed: 'inbreed', inbreedingAvoidance: avoid, randomEvents: false, fertility: 0.3, initialCount: 30 });
    for (let i = 0; i < 12 * 60 && !w.extinct; i++) w.step();
    return w.history.reduce((s, h) => s + h.inbredBirths, 0);
  };
  assert.ok(run(true) < run(false));
});

test('World: 自然選択の実測は年はじめの全個体を数え、生存数が合う', () => {
  const w = new World({ seed: 'selection' });
  for (let i = 0; i < 12 * 5; i++) w.step();
  const cohort = w.history.at(-2).pop; // 前の年末（= この年のはじめ）の個体数
  const rows = w.history.at(-1).selection.color;
  const n = Object.values(rows).reduce((a, r) => a + r.n, 0);
  const survived = Object.values(rows).reduce((a, r) => a + r.survived, 0);
  const deaths = Object.values(rows).reduce((a, r) => a + Object.values(r.deaths).reduce((x, y) => x + y, 0), 0);
  assert.equal(n, cohort);
  assert.equal(survived + deaths, n);
});

test('World: 創始者由来の割合は各個体で合計 1', () => {
  const w = new World({ seed: 'lineage' });
  for (let i = 0; i < 12 * 30; i++) w.step();
  for (const c of w.creatures) {
    const total = Object.values(c.lineage).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `#${c.id}: ${total}`);
  }
  const shares = w.founderSnapshot.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9);
});

test('自然選択の判定: 遺伝病（d/d）は差が出て、中立な耳の形はほとんど出ない', async () => {
  const { selectionSummary, SELECTION_T } = await import('../src/stats.js');
  let earHits = 0;
  let loadHits = 0;
  let earN = 0;
  let loadN = 0;
  for (let s = 0; s < 3; s++) {
    const w = new World({ seed: `calib${s}`, randomEvents: false });
    for (let y = 0; y < 100; y++) {
      for (let m = 0; m < 12; m++) w.step();
      if (y % 10 !== 9) continue;
      const recs = w.history.map((h) => h.selection).filter(Boolean).slice(-10);
      for (const r of selectionSummary(recs)) {
        if (r.t === null) continue;
        if (r.key === 'ear') {
          earN++;
          if (r.t > SELECTION_T) earHits++;
        }
        if (r.key === 'load') {
          loadN++;
          if (r.t > SELECTION_T) loadHits++;
        }
      }
    }
  }
  assert.ok(earHits / earN < 0.15, `ear ${earHits}/${earN}`);
  assert.ok(loadN === 0 || loadHits / loadN > earHits / earN, `load ${loadHits}/${loadN}`);
});

test('World: 名前は決定的で、創始者の家名は重ならず、母系の系統は母から子へ（まれに分かれて）受け継がれる', () => {
  const a = new World({ seed: 'names' });
  const b = new World({ seed: 'names' });
  assert.deepEqual(
    a.creatures.map((c) => c.name),
    b.creatures.map((c) => c.name),
  );
  assert.equal(new Set(a.creatures.map((c) => c.clan)).size, a.creatures.length);
  for (let i = 0; i < 12 * 20; i++) a.step();
  let branches = 0;
  for (const r of a.pedigree.records.values()) {
    if (r.founder) continue;
    const mom = a.pedigree.get(r.motherId);
    // 母系の系統は母と同じか、ミトコンドリアの突然変異で母の系統から分かれたもの
    if (r.mt !== mom.mt) {
      branches++;
      assert.equal(a.haplos.get(r.mt).parent, mom.mt);
      assert.equal(r.branchOf, r.mt);
    }
    assert.ok(a.pedigree.get(r.motherId).children.includes(r.id));
    assert.ok(a.pedigree.get(r.fatherId).children.includes(r.id));
  }
  assert.ok(branches > 0, '20 年あれば分家の芽は生まれている');
});

test('World: 家系の記録は古くなっても消えず、ゲノムだけが捨てられる', () => {
  const w = new World({ seed: 'archive', pedigreeYears: 10 });
  for (let i = 0; i < 12 * 25; i++) w.step();
  for (let id = 1; id <= 100; id++) {
    const r = w.pedigree.get(id);
    assert.ok(r, `創始者 #${id} の記録が残っている`);
    if (!r.alive) assert.equal(r.genome, null);
  }
});

test('島: 海面が下がると陸が広がり、上げると戻る。小島は名前を保つ', () => {
  const w = new World({ seed: 'sea' });
  // 気候の波の途中から始まるので、海面を今と同じ高さにそろえてから試す
  w.island.seaLevel = 0;
  w.terrainChanged('edit');
  const area0 = w.island.area;
  const before = new Set(w.island.landmasses.map((m) => m.id));
  assert.ok(w.createIslet());
  const islet = w.island.landmasses.find((m) => !before.has(m.id));
  assert.ok(islet, '小島ができる');
  w.island.seaLevel = -0.12;
  w.terrainChanged('sea-fall');
  assert.ok(w.island.area > area0);
  assert.ok(!w.island.landmasses.some((m) => m.id === islet.id), '浅瀬が陸橋になり小島と陸続きになる');
  w.island.seaLevel = 0;
  w.terrainChanged('sea-rise');
  assert.ok(w.island.landmasses.some((m) => m.name === islet.name), '切り離された小島は元の名前で呼ばれる');
});

test('World: 個体は海の上にいない。交配は同じ島の中だけ', () => {
  const w = new World({ seed: 'raft' });
  w.createIslet();
  const isletId = w.island.landmasses[1].id;
  // 小島にメスだけを 3 匹送る。本島のオスとは交配できないので、小島では子が生まれない
  const females = w.creatures.filter((c) => c.sex === 'F' && c.age >= 24).slice(0, 3);
  const m = w.island.landmasses[1];
  for (const f of females) {
    const p = w.island.nearestLand(m.cx, m.cy, 10, isletId);
    f.x = f.px = p.x;
    f.y = f.py = p.y;
  }
  for (let i = 0; i < 12 * 5; i++) {
    w.step();
    for (const c of w.creatures) assert.ok(w.island.isLand(c.x, c.y));
  }
  const bornOnIslet = [...w.pedigree.records.values()].filter((r) => females.some((f) => f.id === r.motherId));
  for (const r of bornOnIslet) {
    const father = w.pedigree.get(r.fatherId);
    assert.fail(`小島のメス #${r.motherId} に本島のオス #${father.id} の子が生まれた`);
  }
});

test('気候: 氷期から次の氷期まで約 600 年ののこぎり形。寒い側に大きく、暖かい側に小さく振れる', () => {
  const w = new World({ seed: 'climate' });
  const temps = Array.from({ length: 600 }, (_, y) => w.cycleTemp(y));
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  assert.ok(Math.abs(min - -6) < 0.2, `min ${min}`);
  assert.ok(Math.abs(max - 1.5) < 0.2, `max ${max}`);
  // ゆっくり冷えて急に暖まる：気温が下がっている年のほうがずっと多い
  let falling = 0;
  for (let y = 1; y < 600; y++) if (temps[y] < temps[y - 1]) falling++;
  assert.ok(falling > 400, `下がる年 ${falling}`);
  assert.equal(w.cycleTemp(0), w.cycleTemp(600));
});
