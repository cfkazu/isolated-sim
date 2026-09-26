// 集団タブ：個体数・気候・多様性などの推移、島ごと、家の一覧、創始者の系統。

import { islandStats, clanProfiles } from '../stats.js';
import { DEATH_CAUSES } from '../world.js';
import { Chart } from './charts.js';
import { pct, idLink, stackBar } from './panelUtil.js';

export class StatsPanel {
  constructor(el) {
    this.el = el;
    el.innerHTML = `<div id="stats-tiles" class="quick-stats"></div><div id="stats-charts"></div>
      <h3>昨年の死因</h3><div id="stats-deaths" class="bars"></div>
      <h3>島ごと</h3>
      <div id="islands"></div>
      <h3>いまの家（母系）</h3>
      <p class="small muted">家は母から子へ受け継がれ、まれにミトコンドリアの突然変異で分家が生まれます（生きている子孫が 10 匹に育つと家として独立）。字下げは分かれた元の家。家の下の小さな字は、島全体と比べてはっきり違う遺伝子（8 匹以上の家）。遺伝子の半分はよその家の父から来るので、家の特徴はふつう薄まっていきますが、縄張りで近所どうしが結ばれると残りやすくなります。</p>
      <div id="clan-tree" class="bars clan-tree"></div>
      <h3>創始者の系統</h3><div id="founders-chart"></div><div id="founders" class="bars"></div>`;
    const host = el.querySelector('#stats-charts');
    this.climate = new Chart(host, {
      title: '気温（今との差）',
      desc: '氷期と間氷期の大きな波に、数十年〜百年の揺らぎと出来事が重なる。寒いほど海面が下がり、浅瀬が陸になる。',
      yMin: -15,
      yMax: 5,
      format: (v, tip) => `${v > 0 ? '+' : ''}${tip ? v.toFixed(1) : Math.round(v)}℃`,
      series: [{ label: '気温', color: '--series-1' }],
    });
    this.pop = new Chart(host, {
      title: '個体数',
      series: [
        { label: '全体', color: '--series-1' },
        { label: 'メス', color: '--series-2' },
        { label: 'オス', color: '--series-3' },
      ],
    });
    this.div = new Chart(host, {
      title: '遺伝的多様性と近親交配',
      desc: '期待ヘテロ接合度 He が下がるほど多様性が失われている。平均 F は家系から計算した近交係数。',
      yMax: 0.5,
      format: (v) => v.toFixed(2),
      series: [
        { label: '期待ヘテロ接合度 He', color: '--series-1' },
        { label: '観測ヘテロ接合度 Ho', color: '--series-3', dash: true },
        { label: '平均近交係数 F', color: '--series-2' },
      ],
    });
    this.color = new Chart(host, {
      title: '体色の割合',
      kind: 'stack',
      format: (v, tip) => (tip ? pct(v) : pct(v)),
      series: [
        { label: '黒', color: '--body-black' },
        { label: '緑', color: '--body-green' },
        { label: '白', color: '--body-white' },
      ],
    });
    this.traits = new Chart(host, {
      title: '形質の平均と割合',
      desc: '体格は 0.7〜1.3、代謝は 0.8〜1.2 の値。毛皮と発光・免疫ヘテロは割合。',
      yMax: 1.4,
      format: (v) => v.toFixed(2),
      series: [
        { label: '平均体格', color: '--series-1' },
        { label: '平均毛皮', color: '--series-2' },
        { label: '発光の割合', color: '--series-4' },
        { label: '免疫ヘテロの割合', color: '--series-3' },
        { label: '平均代謝', color: '--series-5' },
      ],
    });
    this.sexsel = new Chart(host, {
      title: '性選択：飾りと好み',
      desc: '尾はオスだけ、好みはメスだけに現れるが、遺伝子は雌雄とも持っている（全個体の遺伝子の値の平均）。',
      yMax: 1,
      format: (v) => pct(v),
      series: [
        { label: '尾の長さ', color: '--series-1' },
        { label: '尾への好み', color: '--series-1', dash: true },
        { label: '発光遺伝子の頻度', color: '--series-4' },
        { label: '発光への好み', color: '--series-4', dash: true },
      ],
    });
    this.corr = new Chart(host, {
      title: '飾りと好みの遺伝的相関',
      desc: '正の相関は、好むメスと飾りのあるオスの子が両方の遺伝子を受け継いでいるしるし。これが強まると飾りと好みが一緒に暴走する（ランナウェイ）。',
      yMin: -0.5,
      yMax: 1,
      format: (v) => v.toFixed(2),
      series: [
        { label: '尾 × 尾への好み', color: '--series-1' },
        { label: '発光 × 発光への好み', color: '--series-4' },
      ],
    });
    this.disp = new Chart(host, {
      title: '旅立ちの距離',
      desc: '大人になるときに生まれた場所から離れる距離の遺伝子（島の幅に対する割合）。遠くへ行くと疲れるが、きょうだいとの餌の奪い合いと近親との交配を避けられる。オスとメスで別々に進化する。',
      format: (v) => pct(v),
      series: [
        { label: 'オス', color: '--series-1' },
        { label: 'メス', color: '--series-2' },
      ],
    });
    this.pred = new Chart(host, {
      title: '捕食者の数',
      desc: '獲物が増えると捕食者が増え、食べ尽くすと飢えて減る。0 になると島から消える（まれに海を越えて渡ってくる）。',
      format: (v, tip) => (tip ? v.toFixed(1) : String(Math.round(v))),
      series: [{ label: '捕食者', color: '--series-5' }],
    });
    this.founders = new Chart(el.querySelector('#founders-chart'), {
      title: '子孫が残っている創始者の数',
      desc: '最初の百匹（と漂着者）のうち、今いる個体の家系をさかのぼると行き着く創始者の数。系統は途絶えると二度と戻らない。',
      series: [{ label: '創始者の系統', color: '--series-3' }],
    });
    this.births = new Chart(host, {
      title: '年間の出生',
      series: [
        { label: '出生', color: '--series-1' },
        { label: '死産（劣性致死）', color: '--series-2' },
        { label: '近親交配（F≥0.125）の子', color: '--series-5' },
      ],
    });
  }

  update(world) {
    const H = world.history;
    const last = H.at(-1);
    const xs = H.map((h) => h.year);
    this.pop.setData(xs, [H.map((h) => h.pop), H.map((h) => h.females), H.map((h) => h.males)]);
    this.climate.setData(xs, [H.map((h) => h.climate ?? 0)]);
    this.div.setData(xs, [H.map((h) => h.He), H.map((h) => h.Ho), H.map((h) => h.meanF)]);
    const n = (h) => Math.max(1, h.pop);
    this.color.setData(xs, [
      H.map((h) => (h.pop ? h.pheno.color.black / n(h) : 0)),
      H.map((h) => (h.pop ? h.pheno.color.green / n(h) : 0)),
      H.map((h) => (h.pop ? h.pheno.color.white / n(h) : 0)),
    ]);
    this.traits.setData(xs, [
      H.map((h) => (h.pop ? h.pheno.meanSize : 0)),
      H.map((h) => (h.pop ? h.pheno.meanFur : 0)),
      H.map((h) => (h.pheno.glowM + h.pheno.glowF) / n(h)),
      H.map((h) => h.pheno.resistant / n(h)),
      H.map((h) => h.metabolism ?? 1),
    ]);
    this.pred.setData(xs, [H.map((h) => h.predators ?? 0)]);
    this.disp.setData(xs, [H.map((h) => (h.dispersal?.geneM ?? 0) * 0.3), H.map((h) => (h.dispersal?.geneF ?? 0) * 0.3)]);
    this.founders.setData(xs, [H.map((h) => h.founderLines ?? 0)]);
    const isl = islandStats(world.creatures, world.island);
    const total = Math.max(1, world.island.area);
    this.el.querySelector('#islands').innerHTML =
      isl.rows
        .map(
          (r) => `<div class="island-row"><span><strong>${r.name}</strong><div class="muted small">面積 ${pct(r.size / total)}</div></span>
          <span class="num">${r.pop} 匹</span>
          <span>${r.pop ? stackBar([{ label: '黒', value: r.color.black / r.pop, color: '--body-black' }, { label: '緑', value: r.color.green / r.pop, color: '--body-green' }, { label: '白', value: r.color.white / r.pop, color: '--body-white' }], false) : '<span class="muted">無人</span>'}</span></div>`,
        )
        .join('') +
      (isl.fst != null
        ? `<p class="small">島どうしの遺伝的な違い F<sub>ST</sub> = <strong>${isl.fst.toFixed(3)}</strong> <span class="muted">（0 なら同じ集団、0.05 を超えると島ごとに違いが目立ち、0.25 を超えると大きく分かれている）</span></p>`
        : world.island.landmasses.length > 1
          ? '<p class="muted small">人が住む島が 2 つ以上になると、島どうしの遺伝的な違いを表示します。流木でまれに海を渡り、寒冷期に海面が下がると浅瀬が陸橋になります。</p>'
          : '<p class="muted small">いまは島が 1 つだけです。「✏️ 地形を編集」で小島をつくれます。</p>') +
      (isl.barriers.length
        ? `<p class="small"><strong>種の壁</strong> <span class="muted">（島の間の雑種が、島の中どうしの子と比べてどれだけ子を残せるか。50% を下回ると別の種とみなす）</span></p>${isl.barriers
            .slice()
            .sort((a, b) => a.hybrid - b.hybrid)
            .slice(0, 6)
            .map((b) => {
              const nm = (id) => world.island.landmasses.find((m) => m.id === id)?.name ?? '?';
              const tag = b.hybrid < 0.5 ? '<span class="badge gene">別の種</span>' : b.hybrid < 0.8 ? '<span class="badge">壁あり</span>' : '';
              return `<div class="bar-row"><span>${nm(b.a)} × ${nm(b.b)} ${tag}</span><div class="track"><div class="fill" style="width:${b.hybrid * 100}%"></div></div><span class="num">${pct(b.hybrid)}</span></div>`;
            })
            .join('')}`
        : '');
    const clans = world.clanTree();
    const clanMax = Math.max(1, ...clans.map((c) => c.n));
    const groups = new Map();
    for (const c of world.creatures) {
      const id = world.establishedHaplo(c.mt).id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(c);
    }
    const profiles = clanProfiles(groups, world.creatures);
    this.el.querySelector('#clan-tree').innerHTML = clans
      .map((c) => {
        const traits = profiles.get(c.id) ?? [];
        const chips = traits.length
          ? `<div class="clan-traits" style="padding-left:${c.depth + 0.6}em">${traits
              .map((t) => `<span class="ctrait ${t.up ? 'up' : 'down'}" title="${t.detail}">${t.text}<span class="muted">（${t.detail}）</span></span>`)
              .join('')}</div>`
          : '';
        return `<div class="bar-row"><span style="padding-left:${c.depth}em">${idLink(world, c.founderId, c.name)}</span><div class="track"><div class="fill" style="width:${(c.n / clanMax) * 100}%"></div></div><span class="num">${c.n}</span></div>${chips}`;
      })
      .join('');
    const top = (world.founderSnapshot ?? []).slice(0, 8);
    const topMax = Math.max(0.01, ...top.map((f) => f.share));
    this.el.querySelector('#founders').innerHTML = top.length
      ? `<p class="small muted">今の島の遺伝子のうち、各創始者に由来する割合（家系からの期待値）。上位 8 匹。</p>${top
          .map(
            (f) =>
              `<div class="bar-row"><span>${idLink(world, f.id, world.pedigree.get(f.id)?.name ?? `#${f.id}`)}</span><div class="track"><div class="fill" style="width:${(f.share / topMax) * 100}%"></div></div><span class="num">${pct(f.share, 1)}</span></div>`,
          )
          .join('')}`
      : '';
    const ss = (h, k) => h.sexsel?.[k] ?? 0;
    const glowFreq = (h) => h.freqs.GLW.g;
    this.sexsel.setData(xs, [H.map((h) => ss(h, 'tail')), H.map((h) => ss(h, 'prefTail')), H.map(glowFreq), H.map((h) => ss(h, 'prefGlow'))]);
    this.corr.setData(xs, [H.map((h) => ss(h, 'corrTail')), H.map((h) => ss(h, 'corrGlow'))]);
    const hb = H.slice(1);
    this.births.setData(
      hb.map((h) => h.year),
      [hb.map((h) => h.births), hb.map((h) => h.stillborn), hb.map((h) => h.inbredBirths)],
    );

    const he0 = H[0].He || 1;
    this.el.querySelector('#stats-tiles').innerHTML = [
      ['個体数', last.pop, `♀${last.females} ♂${last.males}`],
      ['多様性の残存率', pct(last.He / he0), '最初の He に対する割合'],
      ['平均近交係数', last.meanF.toFixed(3), 'いとこ婚の子 = 0.0625'],
      ['最大個体数', Math.max(...H.map((h) => h.pop)), `${H.reduce((a, b) => (b.pop > a.pop ? b : a)).year}年目`],
    ]
      .map(([l, v, s]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`)
      .join('');

    const d = H.length > 1 ? last.deaths : null;
    const deathsEl = this.el.querySelector('#stats-deaths');
    if (!d) {
      deathsEl.innerHTML = '<p class="muted small">1年経つと表示されます。</p>';
      return;
    }
    const max = Math.max(1, ...Object.values(d));
    deathsEl.innerHTML = Object.entries(DEATH_CAUSES)
      .map(
        ([k, label]) =>
          `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="width:${(d[k] / max) * 100}%"></div></div><span class="num">${d[k]}</span></div>`,
      )
      .join('');
  }

  redraw() {
    for (const c of [this.climate, this.pop, this.div, this.color, this.traits, this.sexsel, this.corr, this.pred, this.disp, this.founders, this.births]) c.draw();
  }
}
