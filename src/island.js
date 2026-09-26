// 島の地形生成（バリューノイズ＋中心からの距離による減衰）と、海面・陸地のつながり・地形の編集。
// 生成直後は最大の陸地だけが島で、ほかの陸地は浅瀬として海面下に沈めてある。

export const TERRAIN = { SEA: 0, BEACH: 1, GRASS: 2, FOREST: 3, ROCK: 4 };
export const TERRAIN_LABEL = ['海', '砂浜', '草原', '森', '岩場'];

function makeNoise(rng, W, H, cell) {
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rng.next());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const v = (i, j) => g[j * gw + i];
    const a = v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx;
    const b = v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

// 標高（height）は本島の最高点を 1、海面を 0 とした値。海の中は負（深さ）。
// 地形（砂浜・草原・森・岩場・海）は、標高と海面（seaLevel）と湿り気から毎回決め直せるので、
// 海面の上下（寒冷期の陸橋）や、プレイヤーによる地形の編集に対応できる。
// 地質：地面の色と、砂浜・岩場の広さ、そこに生える草の量を島ごとに変える。
// 背景の色が変われば、目立たない体色も変わる（火山島なら黒、サンゴ礁の島なら白が有利になりうる）。
export const GEOLOGY = {
  lush: {
    label: '緑の島',
    desc: '草原と森が広がる。緑が目立たない。',
    sand: [226, 210, 160],
    rock: [138, 134, 126],
    soil: [96, 74, 52],
    beachBand: 0.07,
    rockAbove: 0.78,
    forestBias: 0,
    beachCap: 0.12,
    rockCap: 0.08,
  },
  volcanic: {
    label: '火山島',
    desc: '黒い砂浜と、まばらに草の生えた黒い溶岩台地が広い。黒が目立たない。',
    sand: [62, 60, 58],
    rock: [52, 50, 50],
    soil: [70, 56, 44],
    beachBand: 0.08,
    rockAbove: 0.5,
    forestBias: 0.04,
    beachCap: 0.15,
    rockCap: 0.4,
  },
  coral: {
    label: 'サンゴ礁の島',
    desc: '白い砂浜と白い石灰岩が広く、乾いて白っぽい草が生える。森は少ない。白が目立たない。',
    sand: [240, 236, 222],
    rock: [214, 208, 192],
    soil: [214, 204, 176],
    // 乾いて日に焼けた、白っぽい草
    grass: [196, 196, 150],
    forest: [150, 160, 112],
    beachBand: 0.16,
    rockAbove: 0.7,
    forestBias: -0.12,
    beachCap: 0.4,
    rockCap: 0.2,
  },
};

export const ISLAND_SHAPES = {
  single: { label: 'ひとつの島', desc: '大きな島がひとつ。' },
  islets: { label: '離島のある島', desc: '本島の沖に小島が 2〜3 個。最初は無人で、流木や氷期の陸橋で渡るのを待つ。' },
  archipelago: { label: '群島', desc: '中くらいの島が 4〜6 個。最初の個体は島の広さに応じて散らばる。浅い海峡は氷期に陸橋になる。' },
};

export function generateIsland(rng, { W = 160, H = 120, shape = 'single', namer = null, geology = 'lush' } = {}) {
  if (shape === 'archipelago') {
    const isl = generateArchipelago(rng, W, H, namer, geology);
    if (geology === 'mixed') isl.assignMixedGeology(rng);
    return isl;
  }
  const island = generateSingle(rng, W, H, shape === 'islets' ? 1.05 : 0.75, namer, geology);
  if (shape === 'islets') {
    const n = 2 + rng.int(2);
    for (let k = 0; k < n; k++) {
      island.addIslet(rng, { minDist: 10, maxDist: 22, r: 7 + rng.int(4), height: 0.3 + rng.next() * 0.2 });
      island.reclassify();
    }
  }
  if (geology === 'mixed') island.assignMixedGeology(rng);
  return island;
}

// 地質の番号（マスごとの地質の地図 geoMap に入れる）
export const GEO_KEYS = Object.keys(GEOLOGY);

// 群島：いくつかの高まりを散らし、ある程度の大きさ（150 マス以上）の陸地をすべて島として残す
function generateArchipelago(rng, W, H, namer, geology) {
  const octaves = [
    [makeNoise(rng, W, H, 30), 0.55],
    [makeNoise(rng, W, H, 12), 0.3],
    [makeNoise(rng, W, H, 6), 0.15],
  ];
  const moistNoise = makeNoise(rng, W, H, 16);
  const k = 4 + rng.int(3);
  const centers = [];
  for (let t = 0; centers.length < k && t < 500; t++) {
    const c = { x: 0.14 + rng.next() * 0.72, y: 0.14 + rng.next() * 0.72, s: 0.06 + rng.next() * 0.035 };
    // 中心どうしは少し離す（くっつきすぎると 1 つの島になる）
    if (centers.every((o) => Math.hypot(o.x - c.x, (o.y - c.y) * 0.75) > 0.24)) centers.push(c);
  }
  const raw = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (const [f, w] of octaves) n += f(x, y) * w;
      let bump = 0;
      for (const c of centers) {
        const d2 = (x / W - c.x) ** 2 + ((y / H - c.y) * 0.75) ** 2;
        bump = Math.max(bump, Math.exp(-d2 / (2 * c.s * c.s)));
      }
      raw[y * W + x] = n * 0.45 + bump * 0.62 + 0.02;
    }
  }
  const SEA_LEVEL = 0.5;
  const comps = labelComponents(W, H, (i) => raw[i] > SEA_LEVEL);
  const keep = new Set([...comps.sizes.entries()].filter(([, n]) => n >= 150).map(([c]) => c));
  let maxLand = SEA_LEVEL + 1e-6;
  for (let i = 0; i < W * H; i++) if (keep.has(comps.label[i])) maxLand = Math.max(maxLand, raw[i]);
  const height = new Float32Array(W * H);
  const moisture = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let h = (raw[i] - SEA_LEVEL) / (maxLand - SEA_LEVEL);
      if (h > 0 && !keep.has(comps.label[i])) h = -0.02 - rng.next() * 0.04;
      height[i] = h;
      moisture[i] = moistNoise(x, y);
    }
  }
  return new Island(W, H, height, moisture, namer, geology);
}

// ひとつの島。falloff が大きいほど島は小さくなる（離島の島では本島を少し小さくして沖を空ける）
function generateSingle(rng, W, H, falloff, namer, geology) {
  const octaves = [
    [makeNoise(rng, W, H, 40), 0.55],
    [makeNoise(rng, W, H, 18), 0.3],
    [makeNoise(rng, W, H, 7), 0.15],
  ];
  const moistNoise = makeNoise(rng, W, H, 16);
  const raw = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (const [f, w] of octaves) n += f(x, y) * w;
      const dx = (x / W - 0.5) * 2;
      const dy = (y / H - 0.5) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      raw[y * W + x] = n * 0.9 + 0.6 - d * d * falloff;
    }
  }
  const SEA_LEVEL = 0.5;

  // 最大の陸地だけを島として残す。ほかの小さな陸地は海面すれすれの浅瀬にする
  // （寒冷期に海面が下がると、浅瀬が陸になって小島や陸橋が現れる）
  const comps = labelComponents(W, H, (i) => raw[i] > SEA_LEVEL);
  let best = -1;
  for (const c of comps.sizes.keys()) if (best < 0 || comps.sizes.get(c) > comps.sizes.get(best)) best = c;
  let maxLand = SEA_LEVEL + 1e-6;
  for (let i = 0; i < W * H; i++) if (comps.label[i] === best) maxLand = Math.max(maxLand, raw[i]);

  const height = new Float32Array(W * H);
  const moisture = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let h = (raw[i] - SEA_LEVEL) / (maxLand - SEA_LEVEL);
      if (h > 0 && comps.label[i] !== best) h = -0.02 - rng.next() * 0.04;
      height[i] = h;
      moisture[i] = moistNoise(x, y);
    }
  }
  return new Island(W, H, height, moisture, namer, geology);
}

// 4 近傍でつながった領域に番号をふる
function labelComponents(W, H, isIn) {
  const label = new Int32Array(W * H).fill(-1);
  const sizes = new Map();
  let comp = 0;
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (label[s] !== -1 || !isIn(s)) continue;
    label[s] = comp;
    stack.push(s);
    let size = 0;
    while (stack.length) {
      const c = stack.pop();
      size++;
      const cx = c % W;
      const cy = (c - cx) / W;
      if (cx + 1 < W && label[c + 1] === -1 && isIn(c + 1)) (label[c + 1] = comp), stack.push(c + 1);
      if (cx > 0 && label[c - 1] === -1 && isIn(c - 1)) (label[c - 1] = comp), stack.push(c - 1);
      if (cy + 1 < H && label[c + W] === -1 && isIn(c + W)) (label[c + W] = comp), stack.push(c + W);
      if (cy > 0 && label[c - W] === -1 && isIn(c - W)) (label[c - W] = comp), stack.push(c - W);
    }
    sizes.set(comp, size);
    comp++;
  }
  return { label, sizes };
}

export class Island {
  constructor(W, H, height, moisture, namer = null, geology = 'lush') {
    this.W = W;
    this.H = H;
    this.elevation = height; // 名前は昔のまま（標高）。海は負
    this.moisture = moisture;
    this.seaLevel = 0;
    // 地質はマスごとに持つ（geoMap）。'mixed' なら島ごとに違う地質になる（assignMixedGeology で決める）。
    // 陸橋でつながっても、それぞれの土地の色や草の生え方は元のまま
    this.geologyKey = geology;
    const base = GEOLOGY[geology] ? geology : 'lush';
    this.geology = GEOLOGY[base]; // いちばん大きい島の地質（名前の表示用）
    this.geoMap = new Uint8Array(W * H).fill(GEO_KEYS.indexOf(base));
    this.terrain = new Uint8Array(W * H);
    this.landmass = new Int32Array(W * H).fill(-1); // 陸地のつながりの番号（海は -1）
    this.landmasses = []; // { id, size, name, cx, cy }
    this.nextLandmassId = 1;
    this.namer = namer; // (id) => 島の名前
    // 各マスが「これまでに属したことのある、いちばん小さい島」。陸橋でつながった小島が
    // また切り離されたとき、元の名前で呼べるようにする
    this.homeId = new Int32Array(W * H).fill(-1);
    this.homeSize = new Int32Array(W * H).fill(0);
    this.archive = new Map(); // id → 名前
    this.reclassify();
  }

  geologyAt(i) {
    return GEOLOGY[GEO_KEYS[this.geoMap[i]]];
  }

  get geologyLabel() {
    return this.geologyKey === 'mixed' ? '島ごとに地質の違う島々' : this.geology.label;
  }

  // 島ごとにばらばらの地質：生まれたときの陸地のつながりごとに、大きい順に地質を順番に割り当てる
  // （3 つ以上の島があれば 3 種類とも現れる）。海のマスは、いちばん近い島の地質にする（浅瀬が陸になったとき用）
  assignMixedGeology(rng) {
    const { W, H } = this;
    const comps = labelComponents(W, H, (i) => this.elevation[i] > this.seaLevel);
    const order = [...comps.sizes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const keys = [...GEO_KEYS];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const geoOfComp = new Map(order.map((c, k) => [c, GEO_KEYS.indexOf(keys[k % keys.length])]));
    const done = new Uint8Array(W * H);
    const queue = [];
    for (let i = 0; i < W * H; i++) {
      const c = comps.label[i];
      if (c < 0) continue;
      this.geoMap[i] = geoOfComp.get(c);
      done[i] = 1;
      queue.push(i);
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= W * H || done[j]) continue;
        done[j] = 1;
        this.geoMap[j] = this.geoMap[i];
        queue.push(j);
      }
    }
    if (order.length) this.geology = GEOLOGY[keys[0]];
    this.reclassify();
  }

  cellAt(x, y) {
    const cx = Math.min(this.W - 1, Math.max(0, Math.floor(x * this.W)));
    const cy = Math.min(this.H - 1, Math.max(0, Math.floor(y * this.H)));
    return cy * this.W + cx;
  }

  terrainAt(x, y) {
    return this.terrain[this.cellAt(x, y)];
  }

  elevationAt(x, y) {
    return this.elevation[this.cellAt(x, y)];
  }

  landmassAt(x, y) {
    return this.landmass[this.cellAt(x, y)];
  }

  isLand(x, y) {
    return x >= 0 && y >= 0 && x < 1 && y < 1 && this.terrain[this.cellAt(x, y)] !== TERRAIN.SEA;
  }

  // 標高・海面・湿り気から地形を決め直し、陸地のつながりに番号と名前をふり直す
  reclassify() {
    const { W, H, elevation: h, moisture, terrain, seaLevel } = this;
    this.landCells = [];
    for (let i = 0; i < W * H; i++) {
      const { beachBand, rockAbove, forestBias } = this.geologyAt(i);
      const e = h[i] - seaLevel;
      let t;
      if (e <= 0) t = TERRAIN.SEA;
      else if (e < beachBand) t = TERRAIN.BEACH;
      else if (h[i] > rockAbove) t = TERRAIN.ROCK;
      else if (moisture[i] + forestBias + h[i] * 0.35 > 0.72) t = TERRAIN.FOREST;
      else t = TERRAIN.GRASS;
      terrain[i] = t;
      if (t !== TERRAIN.SEA) this.landCells.push(i);
    }
    this.area = this.landCells.length;

    // 新しいつながりは、前のつながりと最も重なるものの番号と名前を引き継ぐ
    const old = this.landmass.slice();
    const oldById = new Map(this.landmasses.map((m) => [m.id, m]));
    const comps = labelComponents(W, H, (i) => terrain[i] !== TERRAIN.SEA);
    const overlap = new Map();
    const sumX = new Map();
    const sumY = new Map();
    for (let i = 0; i < W * H; i++) {
      const c = comps.label[i];
      if (c < 0) continue;
      sumX.set(c, (sumX.get(c) || 0) + (i % W));
      sumY.set(c, (sumY.get(c) || 0) + Math.floor(i / W));
      if (old[i] >= 0) {
        const key = `${c}:${old[i]}`;
        overlap.set(key, (overlap.get(key) || 0) + 1);
      }
    }
    const inherit = new Map();
    const taken = new Set();
    const pairs = [...overlap.entries()].map(([k, n]) => [...k.split(':').map(Number), n]).sort((a, b) => b[2] - a[2]);
    for (const [c, o] of pairs) {
      if (inherit.has(c) || taken.has(o)) continue;
      inherit.set(c, o);
      taken.add(o);
    }
    const idOf = new Map();
    const list = [];
    const bySize = [...comps.sizes.entries()].sort((a, b) => b[1] - a[1]);
    const used = new Set();
    for (const [c] of bySize) {
      const prev = oldById.get(inherit.get(c));
      if (prev) used.add(prev.id);
    }
    for (const [c, size] of bySize) {
      const prev = oldById.get(inherit.get(c));
      let id = prev?.id;
      if (id == null) {
        // 以前その場所にあった島（いまは使われていない名前）があれば、その名前で呼ぶ
        const votes = new Map();
        for (let i = 0; i < W * H; i++) {
          if (comps.label[i] !== c) continue;
          const h = this.homeId[i];
          if (h >= 0 && !used.has(h) && this.archive.has(h)) votes.set(h, (votes.get(h) || 0) + 1);
        }
        let bestVote = 0;
        for (const [h, v] of votes) if (v > bestVote) (bestVote = v), (id = h);
        if (id == null) id = this.nextLandmassId++;
        used.add(id);
      }
      const name = prev
        ? prev.name
        : (this.archive.get(id) ?? (this.landmasses.length === 0 && list.length === 0 ? '本島' : this.namer ? this.namer(id) : `島${id}`));
      this.archive.set(id, name);
      idOf.set(c, id);
      list.push({ id, size, name, cx: (sumX.get(c) / size + 0.5) / W, cy: (sumY.get(c) / size + 0.5) / H });
    }
    const sizeOf = new Map(list.map((m) => [m.id, m.size]));
    for (let i = 0; i < W * H; i++) {
      const id = comps.label[i] < 0 ? -1 : idOf.get(comps.label[i]);
      this.landmass[i] = id;
      if (id >= 0 && (this.homeId[i] < 0 || sizeOf.get(id) <= this.homeSize[i])) {
        this.homeId[i] = id;
        this.homeSize[i] = sizeOf.get(id);
      }
    }
    this.landmasses = list;
    this.version = (this.version ?? 0) + 1;
  }

  landmassById(id) {
    return this.landmasses.find((m) => m.id === id);
  }

  randomLand(rng, filter) {
    const { landCells, terrain, W, H } = this;
    for (let t = 0; t < 1000; t++) {
      const c = landCells[rng.int(landCells.length)];
      if (filter && !filter(terrain[c], c)) continue;
      return { x: ((c % W) + rng.next()) / W, y: (Math.floor(c / W) + rng.next()) / H };
    }
    const c = landCells[0];
    return { x: ((c % W) + 0.5) / W, y: (Math.floor(c / W) + 0.5) / H };
  }

  // (x, y) から半径 r マス以内でいちばん近い、同じ陸地（landmass 指定時）の陸のマスの中心
  nearestLand(x, y, r = 6, landmass = null) {
    const { W, H, terrain } = this;
    const cx = Math.floor(x * W);
    const cy = Math.floor(y * H);
    let best = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx;
        if (terrain[i] === TERRAIN.SEA) continue;
        if (landmass != null && this.landmass[i] !== landmass) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: (nx + 0.5) / W, y: (ny + 0.5) / H };
        }
      }
    }
    return best;
  }

  // 陸から minDist〜maxDist マス沖に半径 r の小島をつくり、いちばん近い岸までの海底を浅瀬にする。
  // 浅瀬（標高 −0.05）は、寒冷期に海面が下がると陸橋になる。変更後は reclassify() が必要
  addIslet(rng, { minDist = 14, maxDist = 26, r = 8, height = 0.35 } = {}) {
    const { W, H, elevation, terrain } = this;
    for (let t = 0; t < 400; t++) {
      const i = rng.int(W * H);
      const x = (i % W) + 0.5;
      const y = Math.floor(i / W) + 0.5;
      if (terrain[i] !== TERRAIN.SEA || x < r || y < r || x > W - r || y > H - r) continue;
      let near = Infinity;
      let nearCell = -1;
      for (const c of this.landCells) {
        const d = Math.hypot((c % W) + 0.5 - x, Math.floor(c / W) + 0.5 - y);
        if (d < near) {
          near = d;
          nearCell = c;
        }
        if (near < minDist) break;
      }
      if (near < minDist || near > maxDist) continue;
      this.sculpt(x / W, y / H, r, height - elevation[i]);
      const tx = (nearCell % W) + 0.5;
      const ty = Math.floor(nearCell / W) + 0.5;
      for (let k = 0; k <= near; k++) {
        const px = x + ((tx - x) * k) / near;
        const py = y + ((ty - y) * k) / near;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const j = Math.floor(py + oy) * W + Math.floor(px + ox);
            if (j >= 0 && j < W * H && elevation[j] < -0.05) elevation[j] = -0.05;
          }
        }
      }
      return true;
    }
    return false;
  }

  // 地形の編集：中心 (x, y)・半径 r（マス）の範囲の標高を delta だけ上げ下げする（中心ほど強く）
  sculpt(x, y, r, delta) {
    const { W, H, elevation } = this;
    const cx = x * W;
    const cy = y * H;
    for (let py = Math.max(0, Math.floor(cy - r)); py <= Math.min(H - 1, Math.ceil(cy + r)); py++) {
      for (let px = Math.max(0, Math.floor(cx - r)); px <= Math.min(W - 1, Math.ceil(cx + r)); px++) {
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) / r;
        if (d > 1) continue;
        const i = py * W + px;
        elevation[i] = Math.max(-1, Math.min(1.1, elevation[i] + delta * (1 - d * d)));
      }
    }
  }
}
