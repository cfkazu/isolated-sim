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
