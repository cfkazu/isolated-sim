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
