// 個体の姿を遺伝子どおりに描く（横向きの四つ足の小さな獣）。
// 体色・模様・耳の形・毛皮・体格・尾（オスのみ、栄養状態で見栄えが変わる）・発光・栄養状態・幼さを反映する。

import { cssVar } from './charts.js';

function shade(color, k) {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// 最大の個体（体格 1.3・長い尾）がちょうど収まる描画範囲
const BOX_W = 205;
const BOX_H = 158;

export function drawCreature(canvas, c, cssW = canvas.clientWidth || 120, cssH = canvas.clientHeight || 80) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  const k = Math.min(cssW / BOX_W, cssH / BOX_H);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ((cssW - BOX_W * k) / 2), dpr * ((cssH - BOX_H * k) / 2));
  ctx.clearRect(0, 0, BOX_W, BOX_H);

  const p = c.pheno;
  const cond = c.alive === false ? 1 : c.condition ?? 1;
  const juv = c.age < 12;
  const body = cssVar(`--body-${p.color}`);
  const dark = shade(body, 0.72);
  const line = 'rgba(0,0,0,0.55)';
  const s = (juv ? 0.62 : 1) * p.size;
  const cx = 82;
  const cy = 100;
  // やせると胴が細くなる
  const bw = 44 * s * (0.8 + 0.2 * cond);
  const bh = 27 * s * (0.85 + 0.15 * cond);
  const hr = (juv ? 22 : 17) * p.size;
  const hx = cx - bw * 0.95;
  const hy = cy - bh * 0.55;

  if (p.glow) {
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, 85);
    g.addColorStop(0, `rgba(255,232,90,${0.8 * cond})`);
    g.addColorStop(1, 'rgba(255,232,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BOX_W, BOX_H);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy + bh + 13, bw * 1.3, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 脚
  ctx.strokeStyle = dark;
  ctx.lineWidth = 6 * s;
  ctx.lineCap = 'round';
  for (const lx of [-0.55, -0.2, 0.3, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(cx + lx * bw, cy + bh * 0.5);
    ctx.lineTo(cx + lx * bw + 2, cy + bh + 11);
    ctx.stroke();
  }

  // 尾：オスは遺伝子 × 栄養状態で長くなり、先が羽根のように広がる
  const male = c.sex === 'M';
  const tl = male ? 12 + 70 * p.tail * cond : 12;
  ctx.strokeStyle = body;
  ctx.lineWidth = (male ? 5 + 5 * p.tail : 5) * s;
  ctx.beginPath();
  ctx.moveTo(cx + bw * 0.85, cy - 2);
  ctx.bezierCurveTo(cx + bw + tl * 0.4, cy - 4, cx + bw + tl * 0.7, cy - tl * 0.7, cx + bw + tl * 0.55, cy - tl * 1.05);
  ctx.stroke();
  if (male && p.tail * cond > 0.35) {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx + bw + tl * 0.55, cy - tl * 1.05, 6 + 10 * p.tail, 4 + 5 * p.tail, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 胴体：毛皮が厚いほど輪郭がふさふさ
  const bodyPath = () => {
    ctx.beginPath();
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const fluff = 1 + p.fur * 0.09 * Math.sin(a * 14);
      ctx.lineTo(cx + Math.cos(a) * bw * fluff, cy + Math.sin(a) * bh * fluff);
    }
    ctx.closePath();
  };
  bodyPath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  bodyPath();
  ctx.clip();
  const mark = p.color === 'black' ? 'rgba(255,255,255,0.7)' : 'rgba(25,25,25,0.55)';
  if (p.pattern === 'stripes' || p.pattern === 'both') {
    ctx.strokeStyle = mark;
    ctx.lineWidth = 5 * s;
    for (let i = -2; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 15 * s, cy - bh);
      ctx.lineTo(cx + i * 15 * s - 8, cy + bh);
      ctx.stroke();
    }
  }
  if (p.pattern === 'spots' || p.pattern === 'both') {
    ctx.fillStyle = mark;
    for (const [ox, oy, r] of [
      [-20, -8, 5],
      [0, -14, 4],
      [16, 0, 6],
      [-4, 8, 4],
      [28, -12, 3.5],
      [-28, 6, 3.5],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + ox * s, cy + oy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + bh * 0.7, bw * 0.8, bh * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 耳：立ち耳は上に、半立ちは後ろに傾き、垂れ耳は後ろへ垂れる（顔は左向き）
  const earAngle = [2.3, 0.95, 0.2][p.ear];
  const ear = (dx, back) => {
    ctx.save();
    ctx.translate(hx + dx, hy - hr * 0.55);
    ctx.rotate(earAngle + (back ? 0.2 : 0));
    ctx.beginPath();
    ctx.ellipse(0, -hr * 0.45, hr * 0.28, hr * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = back ? dark : body;
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -hr * 0.45, hr * 0.13, hr * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(230,140,140,0.6)';
    ctx.fill();
    ctx.restore();
  };
  ear(hr * 0.35, true);

  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ear(-hr * 0.05, false);

  // 顔：目・鼻。やせていれば口がへの字
  const eye = p.color === 'black' ? '#ffffff' : '#161616';
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(hx - hr * 0.35, hy - hr * 0.1, (juv ? 3.4 : 2.6) * p.size, 0, Math.PI * 2);
  ctx.fill();
  if (c.alive === false) {
    // 故個体は目を閉じた線で
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = eye;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.5, hy - hr * 0.08);
    ctx.lineTo(hx - hr * 0.2, hy - hr * 0.08);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(hx - hr * 0.38, hy - hr * 0.16, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = shade(body, 0.5);
  ctx.beginPath();
  ctx.arc(hx - hr * 0.92, hy + hr * 0.1, 2.2, 0, Math.PI * 2);
  ctx.fill();
  if (cond < 0.5 && c.alive !== false) {
    ctx.strokeStyle = eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.6, hy + hr * 0.45);
    ctx.quadraticCurveTo(hx - hr * 0.45, hy + hr * 0.3, hx - hr * 0.3, hy + hr * 0.45);
    ctx.stroke();
  }
}
