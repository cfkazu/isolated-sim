// 島の地形生成（バリューノイズ＋中心からの距離による減衰）。
// 最大の陸地だけを残すので、生物が海で分断されることはない。

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

export function generateIsland(rng, W = 160, H = 120) {
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
      raw[y * W + x] = n * 0.9 + 0.6 - d * d * 0.75;
    }
  }
  const SEA_LEVEL = 0.5;

  // 最大の連結成分だけを陸地にする
  const label = new Int32Array(W * H).fill(-1);
  let best = -1;
  let bestSize = 0;
  let comp = 0;
  for (let s = 0; s < W * H; s++) {
    if (raw[s] <= SEA_LEVEL || label[s] !== -1) continue;
    const stack = [s];
    label[s] = comp;
    let size = 0;
    while (stack.length) {
      const c = stack.pop();
      size++;
      const cx = c % W;
      const cy = (c - cx) / W;
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (raw[ni] > SEA_LEVEL && label[ni] === -1) {
          label[ni] = comp;
          stack.push(ni);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = comp;
    }
    comp++;
  }

  let maxLand = SEA_LEVEL + 1e-6;
  for (let i = 0; i < W * H; i++) if (label[i] === best) maxLand = Math.max(maxLand, raw[i]);

  const elevation = new Float32Array(W * H); // 陸: 0..1、海: 負
  const terrain = new Uint8Array(W * H);
  const landCells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (label[i] !== best) {
        elevation[i] = raw[i] - SEA_LEVEL - 0.01;
        terrain[i] = TERRAIN.SEA;
        continue;
      }
      const e = (raw[i] - SEA_LEVEL) / (maxLand - SEA_LEVEL);
      elevation[i] = e;
      landCells.push(i);
      if (e < 0.07) terrain[i] = TERRAIN.BEACH;
      else if (e > 0.78) terrain[i] = TERRAIN.ROCK;
      else if (moistNoise(x, y) + e * 0.35 > 0.72) terrain[i] = TERRAIN.FOREST;
      else terrain[i] = TERRAIN.GRASS;
    }
  }

  const cellAt = (x, y) => {
    const cx = Math.min(W - 1, Math.max(0, Math.floor(x * W)));
    const cy = Math.min(H - 1, Math.max(0, Math.floor(y * H)));
    return cy * W + cx;
  };

  return {
    W,
    H,
    elevation,
    terrain,
    landCells,
    area: landCells.length,
    cellAt,
    terrainAt: (x, y) => terrain[cellAt(x, y)],
    elevationAt: (x, y) => elevation[cellAt(x, y)],
    isLand: (x, y) => x >= 0 && y >= 0 && x < 1 && y < 1 && terrain[cellAt(x, y)] !== TERRAIN.SEA,
    randomLand(rng, filter) {
      for (let t = 0; t < 1000; t++) {
        const c = landCells[rng.int(landCells.length)];
        if (filter && !filter(terrain[c])) continue;
        return { x: ((c % W) + rng.next()) / W, y: (Math.floor(c / W) + rng.next()) / H };
      }
      const c = landCells[0];
      return { x: ((c % W) + 0.5) / W, y: (Math.floor(c / W) + 0.5) / H };
    },
  };
}
