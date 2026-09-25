// 生態系：植生（マスごとの草）、保護色（背景色との色差）、捕食者の個体群。
//
// 手決めの「有利・不利の表」を持たず、次の物理的な量だけから選択が生まれるようにしている。
//   - 草の量は育ち、食べられて減る。草が減ると地面は土の色になる。
//   - 目立ちやすさ = 体色と、いる場所の地面の色との差。
//   - 捕食者は目立つ獲物ほど見つけやすく、よく見かける色を重点的に探す（探索像）。

import { TERRAIN } from './island.js';

export const FOOD_CELL = 4;
const ROOT = 0.1; // 島のマス 4×4 を 1 つの草のマスにまとめる

// 地面の色（RGB）。地図の描画にもこの色を使うので、画面で見える色 = 捕食者が見る色。
export const GROUND_RGB = {
  sand: [226, 210, 160],
  soil: [96, 74, 52],
  grass: [112, 172, 72],
  forest: [48, 104, 46],
  rock: [138, 134, 126],
  snow: [245, 247, 250],
};

export const BODY_RGB = {
  black: [44, 43, 40],
  green: [66, 150, 70],
  white: [236, 232, 220],
};

// 草が育つ上限（草原を 1 とする）
const TERRAIN_CAP = {
  [TERRAIN.SEA]: 0,
  [TERRAIN.BEACH]: 0.12,
  [TERRAIN.GRASS]: 1.0,
  [TERRAIN.FOREST]: 0.75,
  [TERRAIN.ROCK]: 0.08,
};

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 目立ちやすさ：RGB の色差を 0.1〜1 に。完全に溶け込んでも、動けば少しは見つかる。
export function contrast(body, ground) {
  const d = Math.hypot(body[0] - ground[0], body[1] - ground[1], body[2] - ground[2]);
  return Math.max(0.1, Math.min(1, d / 200));
}

export class Vegetation {
  constructor(island, fertility = 1) {
    this.island = island;
    this.FW = Math.ceil(island.W / FOOD_CELL);
    this.FH = Math.ceil(island.H / FOOD_CELL);
    const n = this.FW * this.FH;
    this.cap = new Float32Array(n);
    this.veg = new Float32Array(n);
    const count = new Float32Array(n);
    for (let y = 0; y < island.H; y++) {
      for (let x = 0; x < island.W; x++) {
        const f = Math.floor(y / FOOD_CELL) * this.FW + Math.floor(x / FOOD_CELL);
        this.cap[f] += TERRAIN_CAP[island.terrain[y * island.W + x]];
        count[f]++;
      }
    }
    for (let i = 0; i < n; i++) {
      this.cap[i] = (this.cap[i] / count[i]) * fertility;
      this.veg[i] = this.cap[i] * 0.8;
    }
  }

  cellAt(x, y) {
    const fx = Math.min(this.FW - 1, Math.max(0, Math.floor(x * this.FW)));
    const fy = Math.min(this.FH - 1, Math.max(0, Math.floor(y * this.FH)));
    return fy * this.FW + fx;
  }

  // 島の細かいマス i が属する草のマス
  cellOfIslandCell(i) {
    const W = this.island.W;
    const x = i % W;
    const y = (i - x) / W;
    return Math.floor(y / FOOD_CELL) * this.FW + Math.floor(x / FOOD_CELL);
  }

  // 地下の根や株元は食べられないので、上限の ROOT の割合は常に残り、そこから再生する
  edible(f) {
    return Math.max(0, this.veg[f] - ROOT * this.cap[f]);
  }

  fraction(f) {
    return this.cap[f] > 0 ? this.veg[f] / this.cap[f] : 0;
  }

  // 島の細かいマス i での草の割合を、周りの草のマスから双線形補間する（地面の色の境目をなめらかに）
  smoothFraction(i) {
    const W = this.island.W;
    const x = i % W;
    const y = (i - x) / W;
    const gx = Math.max(0, Math.min(this.FW - 1.001, (x + 0.5) / FOOD_CELL - 0.5));
    const gy = Math.max(0, Math.min(this.FH - 1.001, (y + 0.5) / FOOD_CELL - 0.5));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    // 草の生えない（上限 0 の）マスは補間に入れない
    let sum = 0;
    let wsum = 0;
    for (const [dx, dy, w] of [
      [0, 0, (1 - tx) * (1 - ty)],
      [1, 0, tx * (1 - ty)],
      [0, 1, (1 - tx) * ty],
      [1, 1, tx * ty],
    ]) {
      const f = (y0 + dy) * this.FW + x0 + dx;
      if (this.cap[f] <= 0) continue;
      sum += this.fraction(f) * w;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : this.fraction(this.cellOfIslandCell(i));
  }

  setFertility(ratio) {
    for (let i = 0; i < this.cap.length; i++) {
      this.cap[i] *= ratio;
      this.veg[i] = Math.min(this.veg[i], this.cap[i]);
    }
  }

  // 気温で成長速度が決まる（ロジスティック成長）。0℃ 以下では育たない。
  grow(temperature, drought) {
    const r = 0.45 * Math.max(0, Math.min(1, temperature / 16)) * (drought ? 0.25 : 1);
    if (r === 0) return;
    for (let i = 0; i < this.veg.length; i++) {
      const K = this.cap[i];
      if (K <= 0) continue;
      const v = this.veg[i];
      this.veg[i] = Math.min(K, v + r * v * (1 - v / K));
    }
  }

  meanFraction() {
    let v = 0;
    let k = 0;
    for (let i = 0; i < this.veg.length; i++) {
      v += this.veg[i];
      k += this.cap[i];
    }
    return k > 0 ? v / k : 0;
  }
}

// ある地点の地面の色
export function groundAt(world, x, y) {
  const island = world.island;
  const i = island.cellAt(x, y);
  return groundOfCell(world, i);
}

export function groundOfCell(world, i) {
  const island = world.island;
  const t = island.terrain[i];
  if (t !== TERRAIN.BEACH && t !== TERRAIN.SEA && island.elevation[i] > world.snowLine) return GROUND_RGB.snow;
  if (t === TERRAIN.BEACH) return GROUND_RGB.sand;
  if (t === TERRAIN.ROCK) return GROUND_RGB.rock;
  const frac = world.vegetation.smoothFraction(i);
  return lerp3(GROUND_RGB.soil, t === TERRAIN.FOREST ? GROUND_RGB.forest : GROUND_RGB.grass, Math.min(1, frac * 1.15));
}

// 捕食者の個体群。個体としては動かさず、数だけを持つ。
export const PREDATOR = {
  maxKillsPerMonth: 0.7, // 1 匹が 1 か月に捕まえられる上限
  halfSaturation: 100, // 見つけやすさの合計がこの値のとき、上限の半分を捕まえる
  killsPerBirth: 12, // これだけ食べると 1 匹増える
  mortality: 0.033, // 1 か月あたりの自然死亡率
  immigrationChance: 0.04, // 島にいないとき、1 年あたりに渡ってくる確率
};

// 各獲物の 1 か月の被食確率を計算する。
// detect[i] は見つけやすさ、colors[i] は体色。探索像：色ごとの注目度 ∝ (その色の見つけやすさの合計)^k
export function predationHazards(predators, detect, colors, k) {
  const n = detect.length;
  const hazards = new Float64Array(n);
  if (predators <= 0 || n === 0) return { hazards, expectedKills: 0 };
  const byColor = {};
  let D = 0;
  for (let i = 0; i < n; i++) {
    byColor[colors[i]] = (byColor[colors[i]] || 0) + detect[i];
    D += detect[i];
  }
  const expectedKills = Math.min(n * 0.5, (predators * PREDATOR.maxKillsPerMonth * D) / (D + PREDATOR.halfSaturation));
  let norm = 0;
  for (const c in byColor) norm += Math.pow(byColor[c], k);
  for (let i = 0; i < n; i++) {
    const Dc = byColor[colors[i]];
    const attention = Math.pow(Dc, k) / norm;
    hazards[i] = Math.min(0.95, (expectedKills * attention * detect[i]) / Dc);
  }
  return { hazards, expectedKills };
}
