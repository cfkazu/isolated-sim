// 島の地図と生物の描画。

import { TERRAIN } from '../island.js';
import { cssVar } from './charts.js';
import { groundOfCell } from '../ecology.js';


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
    if (this.drawnTick === world.tick) return;
    this.drawnTick = world.tick;
    const { W, H, terrain, elevation } = this.island;
    const data = this.image.data;
    for (let i = 0; i < W * H; i++) {
      let rgb;
      if (terrain[i] === TERRAIN.SEA) {
        const k = 1 + Math.max(-0.4, elevation[i]) * 1.2;
        rgb = elevation[i] > -0.03 ? [96, 160, 200] : [43 * k, 108 * k, 163 * k];
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
      case 'age':
        return c.age < 84 ? lerpColor('#fff3c4', '#f0a04b', c.age / 84) : lerpColor('#f0a04b', '#8c2d19', (c.age - 84) / 96);
      default:
        return bodyColor(c.pheno.color);
    }
  }

  render(world, { selected, related, frac = 1 }) {
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
      if (natural && r > 2.5) {
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
