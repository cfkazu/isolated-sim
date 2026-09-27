// タブパネルで共通に使う小さな道具。

import { resolveColor } from './charts.js';
import { bodyColor } from './map.js';

export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
// 家系の記録が残っていればリンク、古すぎて消えていれば文字だけ
export const idLink = (world, id, text = `#${id}`) =>
  world.pedigree.get(Number(id)) ? `<button type="button" class="link" data-select="${id}">${text}</button>` : text;
export const sexMark = (s) => (s === 'F' ? '♀' : '♂');
export const sexLabel = (s) => (s === 'F' ? 'メス' : 'オス');
export const ageLabel = (m) => `${Math.floor(m / 12)}歳${m % 12}か月`;

// 対立遺伝子の色：体色は実際の色、それ以外はカテゴリ色を固定順で
export function alleleColor(locus, allele) {
  if (locus.key === 'COL') return bodyColor({ K: 'black', G: 'green', w: 'white' }[allele]);
  const slots = ['--series-1', '--series-2', '--series-3'];
  return resolveColor(slots[locus.alleles.indexOf(allele)]);
}

export function alleleLabel(locus, a) {
  return locus.labels?.[a] ? `${a}（${locus.labels[a]}）` : a;
}

// 割合の帯グラフ。segments: [{ label, value(0〜1), color(CSS 変数名) }]。凡例は常に文字で添える
export function stackBar(segments, big) {
  const shown = segments.filter((x) => x.value > 0.0005);
  return `<div class="sbar${big ? '' : ' thin'}">${shown
    .map((x) => `<span style="flex-grow:${x.value};background:var(${x.color})" title="${x.label} ${pct(x.value)}"></span>`)
    .join('')}</div>
    <div class="slegend">${segments
      .map((x) => `<span class="${x.value > 0.0005 ? '' : 'zero'}"><i style="background:var(${x.color})"></i>${x.label} ${pct(x.value)}</span>`)
      .join('')}</div>`;
}

// 「かんたん／くわしく」の切り替え。くわしい部分には class="detail" を付けておく。
// どちらを選んだかは見ている人のブラウザにだけ覚えておく（使えなければ毎回「かんたん」）
export function detailToggle(el, key, onChange) {
  const storeKey = `isolated-sim:detail:${key}`;
  let detailed = false;
  try {
    detailed = localStorage.getItem(storeKey) === '1';
  } catch {
    // 覚えられない環境では「かんたん」から
  }
  const bar = document.createElement('div');
  bar.className = 'seg detail-toggle';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '表示の細かさ');
  bar.innerHTML = '<button type="button" data-detail="0">かんたん</button><button type="button" data-detail="1">くわしく</button>';
  el.prepend(bar);
  const apply = (v) => {
    detailed = v;
    el.classList.toggle('simple', !detailed);
    for (const b of bar.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.detail === '1') === detailed));
    try {
      localStorage.setItem(storeKey, detailed ? '1' : '0');
    } catch {
      // 覚えられなくても表示は切り替わる
    }
    onChange?.(detailed);
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-detail]');
    if (b) apply(b.dataset.detail === '1');
  });
  apply(detailed);
  return { set: apply, get detailed() { return detailed; } };
}
