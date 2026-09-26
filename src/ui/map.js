// 島の地図と生物の描画。

import { TERRAIN } from '../island.js';
import { cssVar } from './charts.js';
import { groundOfCell } from '../ecology.js';
import { eastShare } from '../genes.js';


// 近交係数用の単色（青）の連続スケール
const F_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function bodyColor(color) {
  return cssVar(`--body-${color}`);
}

export const DISPLAY_LEGENDS = {
  natural: () => [
    ['黒', bodyColor('black')],
    ['緑', bodyColor('green')],
    ['白', bodyColor('white')],
    ['アルビノ', bodyColor('albino')],
    ['発光（黄色い光）', '#ffe45c'],
  ],
  sex: () => [
    ['メス ♀', cssVar('--series-2')],
    ['オス ♂', cssVar('--series-1')],
  ],
  inbreeding: () => [
    ['F=0', F_RAMP[0]],
    ['0.0625（いとこ婚）', F_RAMP[2]],
    ['0.125', F_RAMP[4]],
    ['0.25以上（親子・きょうだい婚）', F_RAMP[6]],
  ],
  immunity: () => [
    ['A/A', cssVar('--series-2')],
    ['A/B（強い）', cssVar('--series-3')],
    ['B/B', cssVar('--series-5')],
  ],
  origin: () => [
    ['東の新型', '#2f7fd8'],
    ['西の新型', '#e0892e'],
    ['雑種（子ができにくい）', '#c0307a'],
    ['祖先型のみ', '#9a9a9a'],
  ],
  clan: () => [['家（母系）ごとの色。分家は大本の家と同じ色合いで明るさ違い', 'conic-gradient(#e0892e, #2f7fd8, #3aa655, #c0307a, #e0892e)']],
  alarm: () => [
    ['いつも鳴く（V/V）', '#d9480f'],
    ['ときどき鳴く（V/v）', '#f59f00'],
    ['鳴かない', '#9a9a9a'],
  ],
  age: () => [
    ['0歳', '#fff3c4'],
    ['7歳', '#f0a04b'],
    ['14歳', '#8c2d19'],
  ],
};

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const c = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// 家の色：色合いは大本の家（創始者の系統）で決め、分家は同じ色合いで明るさを変える
export function clanColor(world, mt, alpha = 1) {
  const h = world?.establishedHaplo(mt);
  const root = h?.root ?? h?.id ?? 0;
  const branch = h && h.id !== root ? 1 + ((h.id * 7) % 3) : 0;
  return `hsla(${(root * 137.508) % 360}, 65%, ${45 + [0, -12, 12, 22][branch]}%, ${alpha})`;
}

const rootHue = (root) => (root * 137.508) % 360;
// 選んだ個体の、ふだん歩き回る範囲のめやす（島の幅に対する半径）
const HOME_RANGE = 0.035;

// 島の地面を 1 マス 1 ピクセルで塗る（地図と、開始画面の島の絵で共通）
export function paintTerrain(world, image) {
  const island = world.island;
  const { W, H, terrain, elevation } = island;
  const data = image.data;
  for (let i = 0; i < W * H; i++) {
    let rgb;
    if (terrain[i] === TERRAIN.SEA) {
      // 海面からの深さで塗り分ける。浅瀬（寒冷期に陸橋になりうる所）は明るく
      const d = elevation[i] - island.seaLevel;
      const k = 1 + Math.max(-0.4, d) * 1.2;
      rgb = d > -0.07 ? [104, 170, 206] : d > -0.14 ? [74, 138, 188] : [43 * k, 108 * k, 163 * k];
    } else {
      const shade = 0.9 + elevation[i] * 0.2;
      const g = groundOfCell(world, i);
      rgb = [g[0] * shade, g[1] * shade, g[2] * shade];
    }
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
}

// 開始画面の島の絵
export function drawThumbnail(canvas, world) {
  const { W, H } = world.island;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(W, H);
  paintTerrain(world, image);
  ctx.putImageData(image, 0, 0);
}

export class MapView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrainCanvas = document.createElement('canvas');
    this.island = null;
    this.mode = 'natural';
  }

  setIsland(island) {
    this.island = island;
    this.terrainCanvas.width = island.W;
    this.terrainCanvas.height = island.H;
    this.image = this.terrainCanvas.getContext('2d').createImageData(island.W, island.H);
    this.drawnTick = null;
  }

  // 地面の色は植生と雪で毎月変わる。捕食者が見ている色（ecology.js の groundOfCell）をそのまま描く。
  _updateTerrain(world) {
    // 地形が編集されたり海面が動いたりしたら、すぐに塗り直す
    if (this.drawnVersion !== world.island.version) {
      this.drawnVersion = world.island.version;
      this.drawnTick = null;
    }
    if (this.drawnTick === world.tick) return;
    // 草や雪はゆっくりしか変わらないので、塗り直しは 1 秒に 4 回まで（全マスの計算で数 ms かかる）
    const now = performance.now();
    if (this.drawnTick != null && world.tick - this.drawnTick < 12 && now - (this.drawnAt ?? 0) < 250) return;
    this.drawnAt = now;
    this.drawnTick = world.tick;
    paintTerrain(world, this.image);
    this.terrainCanvas.getContext('2d').putImageData(this.image, 0, 0);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    return { w, h, dpr };
  }

  fillFor(c) {
    switch (this.mode) {
      case 'sex':
        return c.sex === 'F' ? cssVar('--series-2') : cssVar('--series-1');
      case 'inbreeding':
        return F_RAMP[Math.min(6, Math.round((c.F / 0.25) * 6))];
      case 'immunity': {
        const r = c.pheno.resistance;
        return r > 0.8 ? cssVar('--series-3') : r > 0.5 ? cssVar('--series-2') : cssVar('--series-5');
      }
      case 'origin': {
        if ((c.pheno.fertility ?? 1) < 0.999) return '#c0307a';
        const e = c.genome ? eastShare(c.genome) : null;
        return e == null ? '#9a9a9a' : lerpColor('#e0892e', '#2f7fd8', e);
      }
      case 'clan':
        return clanColor(this.world, c.mt);
      case 'alarm':
        return c.pheno.alarm === 1 ? '#d9480f' : c.pheno.alarm > 0 ? '#f59f00' : '#9a9a9a';
      case 'age':
        return c.age < 84 ? lerpColor('#fff3c4', '#f0a04b', c.age / 84) : lerpColor('#f0a04b', '#8c2d19', (c.age - 84) / 96);
      default:
        return bodyColor(c.coat ?? c.pheno.color);
    }
  }

  render(world, { selected, related, frac = 1 }) {
    this.world = world;
    const { w, h, dpr } = this.resize();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    this._updateTerrain(world);
    ctx.drawImage(this.terrainCanvas, 0, 0, w, h);

    const scale = w / 640;
    const t = Math.max(0, Math.min(1, frac));
    const pos = (c) => [(c.px + (c.x - c.px) * t) * w, (c.py + (c.y - c.py) * t) * h];
    const natural = this.mode === 'natural';
    if (this.showTerritory) this._drawTerritories(world, w, h, scale);

    // 発光のハロー（先に描いて体の下に敷く）
    if (natural) {
      for (const c of world.creatures) {
        if (!c.pheno.glow) continue;
        const [x, y] = pos(c);
        const r = 9 * scale * c.pheno.size;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,236,90,0.95)');
        g.addColorStop(1, 'rgba(255,236,90,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const outline = 'rgba(0,0,0,0.55)';
    for (const c of world.creatures) {
      const [x, y] = pos(c);
      const r = (c.age < 12 ? 2.2 : 3.4) * scale * c.pheno.size;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.fillFor(c);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = outline;
      ctx.stroke();
      // 色の抜けたアルビノと白い冬毛には模様が出ない
      if (natural && r > 2.5 && (c.coat ?? c.pheno.color) === c.pheno.color) {
        const mark = c.pheno.color === 'black' ? 'rgba(255,255,255,0.8)' : 'rgba(20,20,20,0.75)';
        if (c.pheno.pattern === 'stripes' || c.pheno.pattern === 'both') {
          ctx.strokeStyle = mark;
          ctx.lineWidth = Math.max(1, r * 0.28);
          ctx.beginPath();
          ctx.moveTo(x - r * 0.7, y);
          ctx.lineTo(x + r * 0.7, y);
          ctx.stroke();
        }
        if (c.pheno.pattern === 'spots' || c.pheno.pattern === 'both') {
          ctx.fillStyle = mark;
          const d = r * 0.42;
          for (const [ox, oy] of [
            [-d, -d],
            [d, -d],
            [0, d],
          ]) {
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, Math.max(0.8, r * 0.17), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 島が 2 つ以上あれば名前を書く
    const lands = world.island.landmasses.filter((m) => m.size >= 15);
    if (lands.length > 1) {
      ctx.font = `600 ${Math.max(11, 13 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const m of lands) {
        const x = m.cx * w;
        const y = m.cy * h;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(20,30,40,0.75)';
        ctx.strokeText(m.name, x, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(m.name, x, y);
      }
    }

    // 地形編集の筆
    // シナリオ編集：群れの置き場所（半径 r は横幅に対する割合。縦は 3:4 の比で同じ長さになる）
    if (this.circles?.length) {
      ctx.save();
      ctx.font = `bold ${Math.round(12 * scale + 2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      for (const c of this.circles) {
        ctx.beginPath();
        ctx.arc(c.x * w, c.y * h, c.r * w, 0, Math.PI * 2);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = c.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = c.active ? 3 : 1.5;
        ctx.setLineDash(c.active ? [] : [5, 4]);
        ctx.strokeStyle = c.color;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeText(c.label, c.x * w, c.y * h - c.r * w - 6);
        ctx.fillStyle = c.color;
        ctx.fillText(c.label, c.x * w, c.y * h - c.r * w - 6);
      }
      ctx.restore();
    }
    if (this.brush) {
      ctx.beginPath();
      ctx.ellipse(this.brush.x * w, this.brush.y * h, (this.brush.r / world.island.W) * w, (this.brush.r / world.island.H) * h, 0, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.brush.raise ? 'rgba(255,255,255,0.9)' : 'rgba(20,60,120,0.9)';
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 選択個体と家族
    const accent = cssVar('--accent');
    if (related?.length) {
      for (const c of related) {
        if (!c.alive) continue;
        const [x, y] = pos(c);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(x, y, 8 * scale + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (selected?.alive && selected.hx != null) {
      // 選んだ個体のねぐら（縄張りの中心）と、ふだん歩き回る範囲のめやす
      const [x, y] = pos(selected);
      const hx = selected.hx * w;
      const hy = selected.hy * h;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(hx, hy, HOME_RANGE * w, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${Math.round(11 * scale + 4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏠', hx, hy);
      ctx.restore();
    }
    if (selected?.alive) {
      const [x, y] = pos(selected);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 10 * scale + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
  }

  // 縄張り：各個体のねぐら（hx, hy）を草のマス（島の幅の 1/40）に落とし、まわりに少しにじませて、
  // マスごとにいちばん多い家（大本の家）をその土地の主とする。主のいるマスを家の色で塗り、境目に線を引く。
  _territoryMap(world) {
    const key = `${world.tick}:${world.creatures.length}:${world.island.version}`;
    if (this._terrKey === key) return this._terr;
    const veg = world.vegetation;
    const { FW, FH } = veg;
    const n = FW * FH;
    const byRoot = new Map();
    const K = [
      [0, 0, 1],
      [1, 0, 0.6],
      [-1, 0, 0.6],
      [0, 1, 0.6],
      [0, -1, 0.6],
      [1, 1, 0.35],
      [-1, 1, 0.35],
      [1, -1, 0.35],
      [-1, -1, 0.35],
    ];
    for (const c of world.creatures) {
      if (c.hx == null) continue;
      const root = world.establishedHaplo(c.mt)?.root ?? 0;
      let a = byRoot.get(root);
      if (!a) byRoot.set(root, (a = new Float32Array(n)));
      const f = veg.cellAt(c.hx, c.hy);
      const fx = f % FW;
      const fy = (f - fx) / FW;
      for (const [dx, dy, wt] of K) {
        const x = fx + dx;
        const y = fy + dy;
        if (x < 0 || y < 0 || x >= FW || y >= FH) continue;
        a[y * FW + x] += wt;
      }
    }
    const owner = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (veg.cap[i] <= 0) continue;
      let best = -1;
      let bestW = 0.9; // これより薄い（ほとんど誰も住んでいない）マスは主なし
      for (const [root, a] of byRoot) {
        if (a[i] > bestW) {
          bestW = a[i];
          best = root;
        }
      }
      owner[i] = best;
    }
    // 家ごとのマスの数と重心（名前を書く場所）
    const stats = new Map();
    for (let i = 0; i < n; i++) {
      const r = owner[i];
      if (r < 0) continue;
      const st = stats.get(r) ?? { cells: 0, sx: 0, sy: 0 };
      st.cells++;
      st.sx += (i % FW) + 0.5;
      st.sy += Math.floor(i / FW) + 0.5;
      stats.set(r, st);
    }
    this._terrKey = key;
    this._terr = { owner, FW, FH, stats };
    return this._terr;
  }

  _drawTerritories(world, w, h, scale) {
    const { owner, FW, FH, stats } = this._territoryMap(world);
    const ctx = this.ctx;
    const cw = w / FW;
    const ch = h / FH;
    ctx.save();
    for (let i = 0; i < owner.length; i++) {
      const r = owner[i];
      if (r < 0) continue;
      ctx.fillStyle = `hsla(${rootHue(r)}, 70%, 50%, 0.32)`;
      ctx.fillRect((i % FW) * cw, Math.floor(i / FW) * ch, cw + 0.5, ch + 0.5);
    }
    // 境目：隣のマスと主が違うところに線
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const o = owner[y * FW + x];
        if (x + 1 < FW && o !== owner[y * FW + x + 1] && (o >= 0 || owner[y * FW + x + 1] >= 0)) {
          ctx.moveTo((x + 1) * cw, y * ch);
          ctx.lineTo((x + 1) * cw, (y + 1) * ch);
        }
        if (y + 1 < FH && o !== owner[(y + 1) * FW + x] && (o >= 0 || owner[(y + 1) * FW + x] >= 0)) {
          ctx.moveTo(x * cw, (y + 1) * ch);
          ctx.lineTo((x + 1) * cw, (y + 1) * ch);
        }
      }
    }
    ctx.stroke();
    // 大きな縄張りには家の名前
    ctx.font = `bold ${Math.round(12 * scale + 2)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const [r, st] of stats) {
      if (st.cells < 8) continue;
      const x = (st.sx / st.cells) * cw;
      const y = (st.sy / st.cells) * ch;
      const name = world.clanOf(r);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(name, x, y);
      ctx.fillStyle = `hsl(${rootHue(r)}, 70%, 30%)`;
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  }

  pick(world, clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    let best = null;
    let bestD = 14 * 14;
    for (const c of world.creatures) {
      const dx = c.x * r.width - x;
      const dy = c.y * r.height - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
}
