import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { LOCI, INDEX, makeGamete, fertilize, express, genotypeString, randomGenome } from '../src/genes.js';

// 全遺伝子座を指定アレルで埋めたゲノムを作る（オスは X 座の p が null）
function genome(sex, overrides = {}) {
  const m = LOCI.map((l) => l.alleles[0]);
  const p = LOCI.map((l) => (sex === 'M' && l.chr === 'X' ? null : l.alleles[0]));
  for (const [key, [a, b]] of Object.entries(overrides)) {
    m[INDEX[key]] = a;
    p[INDEX[key]] = b;
  }
  return { m, p };
}

function cross(mother, father, n, rng, fn) {
  const counts = {};
  for (let i = 0; i < n; i++) {
    const z = fertilize(makeGamete(mother, 'F', rng), makeGamete(father, 'M', rng));
    const k = fn(z);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

const near = (actual, expected, tol) => assert.ok(Math.abs(actual - expected) < tol, `${actual} ≉ ${expected}`);

test('メンデルの分離の法則: ヘテロ同士の交配で 1:2:1', () => {
  const rng = createRng(1);
  const mom = genome('F', { EAR: ['U', 'F'] });
  const dad = genome('M', { EAR: ['U', 'F'] });
  const n = 20000;
  const c = cross(mom, dad, n, rng, (z) => genotypeString(z.genome, 'EAR'));
  near(c['U/U'] / n, 0.25, 0.02);
  near(c['U/F'] / n, 0.5, 0.02);
  near(c['F/F'] / n, 0.25, 0.02);
});

test('複対立遺伝子の優劣序列 K > G > w', () => {
  assert.equal(express(genome('F', { COL: ['K', 'w'] })).color, 'black');
  assert.equal(express(genome('F', { COL: ['G', 'K'] })).color, 'black');
  assert.equal(express(genome('F', { COL: ['G', 'w'] })).color, 'green');
  assert.equal(express(genome('F', { COL: ['w', 'w'] })).color, 'white');
});

test('共優性: S/T は斑点と縞の両方', () => {
  assert.equal(express(genome('F', { PAT: ['S', 'T'] })).pattern, 'both');
  assert.equal(express(genome('F', { PAT: ['S', 'o'] })).pattern, 'spots');
  assert.equal(express(genome('F', { PAT: ['o', 'T'] })).pattern, 'stripes');
  assert.equal(express(genome('F', { PAT: ['o', 'o'] })).pattern, 'plain');
});

test('不完全優性: ヘテロは中間', () => {
  assert.equal(express(genome('F', { EAR: ['U', 'U'] })).ear, 2);
  assert.equal(express(genome('F', { EAR: ['U', 'F'] })).ear, 1);
  assert.equal(express(genome('F', { EAR: ['F', 'F'] })).ear, 0);
});

test('超優性: ヘテロ接合体の免疫力が最も高い', () => {
  const ab = express(genome('F', { VIT: ['A', 'B'] })).resistance;
  assert.ok(ab > express(genome('F', { VIT: ['A', 'A'] })).resistance);
  assert.ok(ab > express(genome('F', { VIT: ['B', 'B'] })).resistance);
});

test('劣性致死: 保因者同士の子の約 1/4 が致死', () => {
  const rng = createRng(2);
  const mom = genome('F', { LET: ['L', 'l'] });
  const dad = genome('M', { LET: ['l', 'L'] });
  const n = 20000;
  const c = cross(mom, dad, n, rng, (z) => express(z.genome).lethal);
  near(c.true / n, 0.25, 0.02);
});

test('伴性遺伝: オスは 1 本で発光、父の X は必ず娘へ', () => {
  assert.equal(express(genome('M', { GLW: ['g', null] })).glow, true);
  assert.equal(express(genome('F', { GLW: ['g', 'N'] })).glow, false);
  assert.equal(express(genome('F', { GLW: ['g', 'g'] })).glow, true);
  assert.equal(genotypeString(genome('M', { GLW: ['g', null] }), 'GLW'), 'g/Y');

  // 保因者の母 × 発光する父 → 娘は全員 g を持ち半分が発光、息子の半分が発光
  const rng = createRng(3);
  const mom = genome('F', { GLW: ['N', 'g'] });
  const dad = genome('M', { GLW: ['g', null] });
  const n = 20000;
  let daughters = 0;
  let daughtersWithG = 0;
  let sons = 0;
  let glowingSons = 0;
  for (let i = 0; i < n; i++) {
    const z = fertilize(makeGamete(mom, 'F', rng), makeGamete(dad, 'M', rng));
    if (z.sex === 'F') {
      daughters++;
      if (z.genome.p[INDEX.GLW] === 'g') daughtersWithG++;
    } else {
      sons++;
      assert.equal(z.genome.p[INDEX.GLW], null);
      if (express(z.genome).glow) glowingSons++;
    }
  }
  assert.equal(daughtersWithG, daughters);
  near(sons / n, 0.5, 0.02);
  near(glowingSons / sons, 0.5, 0.03);
});

test('連鎖: 4cM 離れた体色と致死因子の組換え率は約 4%', () => {
  const rng = createRng(4);
  // 母は K-L / w-l の相（シス配置）
  const mom = genome('F', { COL: ['K', 'w'], LET: ['L', 'l'] });
  const n = 40000;
  let recomb = 0;
  for (let i = 0; i < n; i++) {
    const g = makeGamete(mom, 'F', rng).alleles;
    const col = g[INDEX.COL];
    const let_ = g[INDEX.LET];
    if ((col === 'K' && let_ === 'l') || (col === 'w' && let_ === 'L')) recomb++;
  }
  const expected = (1 - Math.exp((-2 * 4) / 100)) / 2; // Haldane
  near(recomb / n, expected, 0.006);
});

test('独立の法則: 別の染色体上の遺伝子座は 50% で組換わる', () => {
  const rng = createRng(5);
  const mom = genome('F', { COL: ['K', 'w'], VIT: ['A', 'B'] });
  const n = 20000;
  let recomb = 0;
  for (let i = 0; i < n; i++) {
    const g = makeGamete(mom, 'F', rng).alleles;
    if ((g[INDEX.COL] === 'K') !== (g[INDEX.VIT] === 'A')) recomb++;
  }
  near(recomb / n, 0.5, 0.02);
});

test('突然変異率 0 なら親にない対立遺伝子は生じない', () => {
  const rng = createRng(6);
  const mom = randomGenome('F', rng);
  for (let i = 0; i < 2000; i++) {
    const egg = makeGamete(mom, 'F', rng, 0).alleles;
    for (let k = 0; k < LOCI.length; k++) assert.ok(egg[k] === mom.m[k] || egg[k] === mom.p[k]);
  }
});

test('性比はおよそ 1:1', () => {
  const rng = createRng(7);
  const c = cross(genome('F'), genome('M'), 20000, rng, (z) => z.sex);
  near(c.M / 20000, 0.5, 0.02);
});

test('限性遺伝: 尾はオスだけ、好みはメスだけに現れるが、遺伝子は雌雄とも子に伝わる', () => {
  const allPlus = { TL1: ['+', '+'], TL2: ['+', '+'], TL3: ['+', '+'], PT1: ['+', '+'], PT2: ['+', '+'], PT3: ['+', '+'] };
  const f = express(genome('F', { ...allPlus, TL4: ['+', '+'] }));
  const m = express(genome('M', { ...allPlus, TL4: ['+', null] }));
  assert.equal(f.tailGene, 1);
  assert.equal(f.tail, 0);
  assert.equal(f.prefTail, 1);
  assert.equal(m.tail, 1);
  assert.equal(m.prefTailGene, 1);
  assert.equal(m.prefTail, 0);

  // 長い尾の遺伝子を持つ母 × 尾の短い父 → 息子の尾は中間くらい
  const rng = createRng(8);
  const mom = genome('F', { TL1: ['+', '+'], TL2: ['+', '+'], TL3: ['+', '+'], TL4: ['+', '+'] });
  const dad = genome('M', { TL1: ['-', '-'], TL2: ['-', '-'], TL3: ['-', '-'], TL4: ['-', null] });
  let sum = 0;
  let sons = 0;
  for (let i = 0; i < 4000; i++) {
    const z = fertilize(makeGamete(mom, 'F', rng), makeGamete(dad, 'M', rng));
    if (z.sex !== 'M') continue;
    sons++;
    sum += express(z.genome).tail;
  }
  // 常染色体 3 座は各 1/2、X 連鎖座は母由来の + が 1 本だけ → (3 + 1) / 7
  near(sum / sons, 4 / 7, 0.02);
});
