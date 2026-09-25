// 島の保存と復元。
// snapshot() は World の状態をそのまま（構造化複製できる形で）取り出し、restore() で同じ World に戻す。
// 乱数の状態も含めて戻すので、復元した島は保存しなかった場合とまったく同じ歴史をたどる。

import { World } from './world.js';
import { createRng } from './rng.js';
import { Island } from './island.js';
import { Vegetation } from './ecology.js';
import { Pedigree } from './pedigree.js';
import { makeName } from './names.js';

export const SAVE_VERSION = 3;

const COLORS = ['black', 'green', 'white'];
const PATTERNS = ['spots', 'stripes', 'both', 'plain'];
const CAUSES = ['age', 'starvation', 'predation', 'climate', 'disease', 'genetic', 'accident', 'storm', 'sea'];
const ALLELE_NULL = '_';

// 死んだ個体の記録は数が多い（600 年で十数万）ので、列ごとの型付き配列に詰める。
// 名前（創始者以外）・家名・子の一覧は、シードと親子関係から復元できるので保存しない。
function packDead(records, seed) {
  const n = records.length;
  const i32 = (f) => Int32Array.from(records, f);
  const f32 = (f) => Float32Array.from(records, f);
  const u8 = (f) => Uint8Array.from(records, f);
  const nul = (v) => (v == null ? -1 : v);
  const names = {};
  for (const r of records) if (r.name !== makeName(seed, r.id)) names[r.id] = r.name;
  return {
    n,
    names,
    id: i32((r) => r.id),
    sex: u8((r) => (r.sex === 'M' ? 1 : 0)),
    mt: i32((r) => nul(r.mt)),
    branchOf: i32((r) => nul(r.branchOf)),
    fatherId: i32((r) => nul(r.fatherId)),
    motherId: i32((r) => nul(r.motherId)),
    birthTick: i32((r) => r.birthTick),
    deathTick: i32((r) => nul(r.deathTick)),
    cause: u8((r) => CAUSES.indexOf(r.cause) + 1),
    age: i32((r) => r.age),
    offspring: i32((r) => r.offspring),
    yearOffspring: i32((r) => r.yearOffspring),
    gen: i32((r) => r.gen),
    founder: u8((r) => (r.founder ? 1 : 0)),
    F: f32((r) => r.F),
    color: u8((r) => COLORS.indexOf(r.pheno.color)),
    pattern: u8((r) => PATTERNS.indexOf(r.pheno.pattern)),
    ear: u8((r) => r.pheno.ear),
    glow: u8((r) => (r.pheno.glow ? 1 : 0)),
    load: u8((r) => r.pheno.load),
    tailGene: f32((r) => r.pheno.tailGene),
    prefTailGene: f32((r) => r.pheno.prefTailGene),
    prefGlowGene: f32((r) => r.pheno.prefGlowGene),
    size: f32((r) => r.pheno.size),
    fur: f32((r) => r.pheno.fur),
    resistance: f32((r) => r.pheno.resistance),
    metabolism: f32((r) => r.pheno.metabolism),
    fertility: f32((r) => r.pheno.fertility),
    // 新しい死亡個体（血縁係数の計算に使う期間内）だけゲノムが残っている
    genome: records.map((r) => (r.genome ? r.genome.m.map((a) => a ?? ALLELE_NULL).join('') + r.genome.p.map((a) => a ?? ALLELE_NULL).join('') : null)),
  };
}

function unpackDead(d, seed) {
  const out = [];
  const opt = (v) => (v < 0 ? null : v);
  for (let i = 0; i < d.n; i++) {
    const male = d.sex[i] === 1;
    const g = d.genome[i];
    let genome = null;
    if (g) {
      const half = g.length / 2;
      const dec = (str) => [...str].map((a) => (a === ALLELE_NULL ? null : a));
      genome = { m: dec(g.slice(0, half)), p: dec(g.slice(half)) };
    }
    out.push({
      id: d.id[i],
      name: d.names[d.id[i]] ?? makeName(seed, d.id[i]),
      mt: opt(d.mt[i]),
      branchOf: opt(d.branchOf[i]),
      children: [],
      sex: male ? 'M' : 'F',
      genome,
      pheno: {
        color: COLORS[d.color[i]],
        pattern: PATTERNS[d.pattern[i]],
        ear: d.ear[i],
        tailGene: d.tailGene[i],
        tail: male ? d.tailGene[i] : 0,
        prefTailGene: d.prefTailGene[i],
        prefGlowGene: d.prefGlowGene[i],
        prefTail: male ? 0 : d.prefTailGene[i],
        prefGlow: male ? 0 : d.prefGlowGene[i],
        size: d.size[i],
        fur: d.fur[i],
        glow: d.glow[i] === 1,
        resistance: d.resistance[i],
        lethal: false,
        load: d.load[i],
        metabolism: d.metabolism[i],
        fertility: d.fertility[i],
      },
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      age: d.age[i],
      birthTick: d.birthTick[i],
      fatherId: opt(d.fatherId[i]),
      motherId: opt(d.motherId[i]),
      F: d.F[i],
      gen: d.gen[i],
      founder: d.founder[i] === 1,
      alive: false,
      lastBredYear: -1,
      offspring: d.offspring[i],
      yearOffspring: d.yearOffspring[i],
      lineage: null,
      hunger: 0,
      condition: 1,
      deathTick: opt(d.deathTick[i]),
      cause: CAUSES[d.cause[i] - 1] ?? null,
    });
  }
  return out;
}

// World のうち、別扱いするもの（それ以外のフィールドはそのまま保存する）
const SPECIAL = new Set(['rng', 'island', 'vegetation', 'pedigree', 'creatures', 'cohort', '_cellCount']);

export function snapshot(world) {
  const state = {};
  for (const [k, v] of Object.entries(world)) if (!SPECIAL.has(k)) state[k] = v;
  const isl = world.island;
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    summary: { year: world.year, pop: world.creatures.length, seed: world.opts.seed, geology: isl.geology.label },
    state,
    rng: world.rng.getState(),
    island: {
      W: isl.W,
      H: isl.H,
      elevation: isl.elevation,
      moisture: isl.moisture,
      seaLevel: isl.seaLevel,
      geologyKey: isl.geologyKey,
      landmass: isl.landmass,
      landmasses: isl.landmasses,
      homeId: isl.homeId,
      homeSize: isl.homeSize,
      archive: isl.archive,
      nextLandmassId: isl.nextLandmassId,
      version: isl.version,
    },
    veg: world.vegetation.veg,
    cutoffTick: world.pedigree.cutoffTick,
    // 生きている個体はそのまま、死んだ個体は列ごとに詰めて保存する
    living: world.creatures.map(({ clan: _, children: __, ...r }) => r),
    dead: packDead(
      [...world.pedigree.records.values()].filter((r) => !r.alive),
      world.opts.seed,
    ),
    alive: world.creatures.map((c) => c.id),
    cohort: (world.cohort ?? []).map((c) => c.id),
  };
}

export function restore(snap) {
  if (snap?.version !== SAVE_VERSION) throw new Error('保存データの形式が違います');
  const w = Object.create(World.prototype);
  Object.assign(w, snap.state);
  w.rng = createRng(0);
  w.rng.setState(snap.rng);

  const s = snap.island;
  const namer = (id) => `${makeName(w.opts.seed, `isle${id}`)}島`;
  const island = new Island(s.W, s.H, new Float32Array(s.elevation), new Float32Array(s.moisture), namer, s.geologyKey);
  // 島の番号と名前を保存時のものにそろえてから地形を決め直す（重なりで番号を引き継ぐので同じになる）
  island.seaLevel = s.seaLevel;
  island.landmass = new Int32Array(s.landmass);
  island.landmasses = s.landmasses;
  island.homeId = new Int32Array(s.homeId);
  island.homeSize = new Int32Array(s.homeSize);
  island.archive = new Map(s.archive);
  island.nextLandmassId = s.nextLandmassId;
  island.reclassify();
  island.version = s.version;
  w.island = island;

  w.vegetation = new Vegetation(island, w.opts.fertility);
  w.vegetation.veg.set(snap.veg);

  w.pedigree = new Pedigree();
  w.pedigree.cutoffTick = snap.cutoffTick;
  const records = [...unpackDead(snap.dead, w.opts.seed), ...snap.living.map((r) => ({ ...r, children: [] }))].sort((a, b) => a.id - b.id);
  for (const r of records) {
    // 家名は系統から毎回計算する（保存時の文字列ではなく）
    Object.defineProperty(r, 'clan', {
      get() {
        return w.clanOf(this.mt);
      },
      enumerable: true,
      configurable: true,
    });
    w.pedigree.records.set(r.id, r);
  }
  // 子の一覧は親子関係から作り直す（ID 順＝生まれた順なので保存時と同じ並びになる）
  for (const r of records) {
    w.pedigree.records.get(r.fatherId)?.children.push(r.id);
    w.pedigree.records.get(r.motherId)?.children.push(r.id);
  }
  w.creatures = snap.alive.map((id) => w.pedigree.records.get(id));
  w.cohort = snap.cohort.map((id) => w.pedigree.records.get(id));
  return w;
}

// ───── ブラウザでの保存先（IndexedDB） ─────
// 保存できない環境（プライベートウィンドウなど）では何もしない。

const DB = 'isolated-sim';
const STORE = 'saves';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB がありません'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveToBrowser(world, key = 'autosave') {
  try {
    await withStore('readwrite', (st) => st.put(snapshot(world), key));
    return true;
  } catch {
    return false;
  }
}

export async function loadFromBrowser(key = 'autosave') {
  try {
    return (await withStore('readonly', (st) => st.get(key))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteFromBrowser(key = 'autosave') {
  try {
    await withStore('readwrite', (st) => st.delete(key));
  } catch {
    // 保存できない環境では何もしない
  }
}
