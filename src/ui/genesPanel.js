// 遺伝子頻度タブ：遺伝子のサマリーと、遺伝子座ごとの頻度の推移・ハーディー・ワインベルグ平衡。

import {
  LOCI,
  LOCUS,
  INHERITANCE,
  POLYGENIC_TRAITS,
  polygenicSummary,
} from '../genes.js';
import { alleleFrequencies, genotypeTable, mendelianSummary } from '../stats.js';
import { Chart } from './charts.js';
import { pct, alleleColor, alleleLabel, stackBar } from './panelUtil.js';

export class GenesPanel {
  constructor(el) {
    this.el = el;
    this.key = 'COL';
    el.innerHTML = `
      <h2>いまの島の遺伝子</h2>
      <p class="small muted">上の帯は見た目の割合、下の細い帯は対立遺伝子の割合。カードを押すと、その遺伝子の歴史が下に出ます。</p>
      <div id="gene-summary" class="gsum"></div>
      <h3>量的形質（複数の遺伝子座の合計）</h3>
      <p class="small muted">全遺伝子座を合わせた「＋」の数ごとの個体数。左端が＋0（最も小さい・短い・弱い）、右端がすべて＋。</p>
      <div id="poly-traits" class="gsum"></div>
      <h2 id="gene-detail" style="margin-top:22px">遺伝子座ごとの詳細</h2>
      <label>遺伝子座 <select id="locus-select">${LOCI.map((l) => `<option value="${l.key}">${l.name}（${INHERITANCE[l.mode].short}）</option>`).join('')}</select></label>
      <p id="locus-desc" class="small muted"></p>
      <div id="locus-chart"></div>
      <h3>遺伝子型：観測数とハーディー・ワインベルグ期待数</h3>
      <div id="hw-table"></div>
      <h3>全遺伝子座の対立遺伝子頻度（現在）</h3>
      <div id="all-loci"></div>`;
    this.chart = new Chart(el.querySelector('#locus-chart'), {
      title: '対立遺伝子頻度の推移',
      kind: 'stack',
      format: (v) => pct(v),
      series: [],
    });
    el.querySelector('#locus-select').addEventListener('change', (e) => {
      this.key = e.target.value;
      this.update(this.world);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-locus]');
      if (!b) return;
      this.key = b.dataset.locus;
      el.querySelector('#locus-select').value = this.key;
      this.update(this.world);
      el.querySelector('#gene-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  update(world) {
    this.world = world;
    const locus = LOCUS[this.key];
    const H = world.history;
    this.el.querySelector('#locus-desc').textContent = `${INHERITANCE[locus.mode].label}：${INHERITANCE[locus.mode].desc}`;
    this.chart.setSeries(locus.alleles.map((a) => ({ label: alleleLabel(locus, a), color: alleleColor(locus, a) })));
    this.chart.setData(
      H.map((h) => h.year),
      locus.alleles.map((a) => H.map((h) => h.freqs[locus.key][a])),
    );

    const freqs = alleleFrequencies(world.creatures);
    const { rows, diploids } = genotypeTable(world.creatures, this.key, freqs);
    this.el.querySelector('#hw-table').innerHTML = world.creatures.length
      ? `<table><thead><tr><th>遺伝子型</th><th class="num">観測</th><th class="num">期待</th><th>差</th></tr></thead><tbody>${rows
          .map((r) => {
            const diff = r.observed - r.expected;
            return `<tr><td class="genotype">${r.genotype}${r.hemizygous ? ' <span class="muted small">(オス)</span>' : ''}</td><td class="num">${r.observed}</td><td class="num">${r.expected.toFixed(1)}</td><td class="small ${Math.abs(diff) > Math.max(3, r.expected * 0.3) ? '' : 'muted'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</td></tr>`;
          })
          .join('')}</tbody></table>
        <p class="muted small">二倍体 ${diploids} 匹。ヘテロ接合体が期待より少ないのは、近親交配や島内の地域的な分断（ワーランド効果）のサイン。</p>`
      : '';

    // 量的形質の分布：「＋」の数ごと（0〜遺伝子座数×2）に個体を数える
    const alive = world.creatures.filter((c) => c.genome);
    const sums = alive.map((c) => polygenicSummary(c.genome));
    this.el.querySelector('#gene-summary').innerHTML = alive.length
      ? mendelianSummary(alive, freqs)
          .map(
            (card) => `<button type="button" class="gcard" data-locus="${card.key}">
              <div class="gtitle">${card.title}</div>
              ${stackBar(card.segments, true)}
              <div class="gallele">${stackBar(card.alleles, false)}</div>
              <div class="gnote">${card.note}</div>
            </button>`,
          )
          .join('')
      : '<p class="muted small">生きている個体がいません。</p>';

    this.el.querySelector('#poly-traits').innerHTML = alive.length
      ? `${POLYGENIC_TRAITS.map((t, ti) => {
          const bins = t.loci.length * 2 + 1;
          const hist = new Array(bins).fill(0);
          let sum = 0;
          for (const row of sums) {
            const v = row[ti].value;
            sum += v;
            hist[Math.round(v * (bins - 1))]++;
          }
          const max = Math.max(1, ...hist);
          const who = t.sex ? `（${t.sex === 'M' ? 'オス' : 'メス'}に現れる）` : '';
          return `<button type="button" class="gcard" data-locus="${t.loci[0]}">
            <div class="gtitle">${t.label} <span class="gmean">平均 ${pct(sum / alive.length)}</span></div>
            <div class="hist">${hist.map((n, k) => `<span style="height:${(n / max) * 100}%" title="＋${k}：${n} 匹"></span>`).join('')}</div>
            <div class="gnote">${t.loci.length} 座の合計${who}</div>
          </button>`;
        }).join('')}`
      : '';

    this.el.querySelector('#all-loci').innerHTML = `<table><thead><tr><th>遺伝子座</th><th>頻度</th><th></th></tr></thead><tbody>${LOCI.map((l) => {
      const f = freqs[l.key].freq;
      const bar = l.alleles
        .filter((a) => f[a] > 0)
        .map((a) => `<span style="width:${f[a] * 100}%;background:${alleleColor(l, a)}" title="${alleleLabel(l, a)} ${pct(f[a], 1)}"></span>`)
        .join('');
      const txt = l.alleles.map((a) => `${a} ${pct(f[a])}`).join(' / ');
      const fixed = l.alleles.some((a) => f[a] === 1) ? '<span class="badge gene">固定</span>' : '';
      const lost = l.alleles.some((a) => f[a] === 0) && !fixed ? '<span class="badge">一部消失</span>' : '';
      return `<tr><td><button type="button" class="link" data-locus="${l.key}">${l.name}</button></td><td><div class="freqbar">${bar}</div><div class="muted small">${txt}</div></td><td>${fixed}${lost}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  redraw() {
    this.chart.draw();
  }
}
