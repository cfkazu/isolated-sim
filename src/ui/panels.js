// 右側のタブパネル群。

import {
  LOCI,
  LOCUS,
  CHROMOSOMES,
  INHERITANCE,
  genotypeString,
  locusEffect,
  isCarrier,
  predictOffspring,
  COLOR_LABEL,
  PATTERN_LABEL,
  TAIL_LABEL,
} from '../genes.js';
import { alleleFrequencies, genotypeTable } from '../stats.js';
import { DEATH_CAUSES, DEFAULTS } from '../world.js';
import { TERRAIN_LABEL } from '../island.js';
import { createRng } from '../rng.js';
import { Chart, resolveColor } from './charts.js';
import { drawPortrait, bodyColor } from './map.js';

const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const sexMark = (s) => (s === 'F' ? '♀' : '♂');
const sexLabel = (s) => (s === 'F' ? 'メス' : 'オス');
const ageLabel = (m) => `${Math.floor(m / 12)}歳${m % 12}か月`;

// 対立遺伝子の色：体色は実際の色、それ以外はカテゴリ色を固定順で
export function alleleColor(locus, allele) {
  if (locus.key === 'COL') return bodyColor({ K: 'black', G: 'green', w: 'white' }[allele]);
  const slots = ['--series-1', '--series-2', '--series-3'];
  return resolveColor(slots[locus.alleles.indexOf(allele)]);
}

function alleleLabel(locus, a) {
  return locus.labels?.[a] ? `${a}（${locus.labels[a]}）` : a;
}

// ───────────────────────── 個体 ─────────────────────────

export function renderCreaturePanel(el, world, c, pinned) {
  if (!c) {
    el.innerHTML = renderNotables(world);
    return;
  }
  const ped = world.pedigree;
  const father = ped.get(c.fatherId);
  const mother = ped.get(c.motherId);
  const status = c.alive
    ? '<span class="badge">生存中</span>'
    : `<span class="badge warn">死亡：${DEATH_CAUSES[c.cause] ?? c.cause}（${Math.floor(c.deathTick / 12)}年目）</span>`;
  const ph = c.pheno;

  const children = [];
  for (const r of ped.records.values()) if (r.fatherId === c.id || r.motherId === c.id) children.push(r);
  const aliveChildren = children.filter((x) => x.alive);

  const gp = (p) => (p ? [ped.get(p.fatherId), ped.get(p.motherId)] : [undefined, undefined]);
  const [ff, fm] = gp(father);
  const [mf, mm] = gp(mother);

  const person = (r, role) => {
    if (!r) return `<div class="person dead"><div class="role">${role}</div><span class="muted">${c.founder && role.length <= 1 ? '創始者' : '記録なし'}</span></div>`;
    return `<button type="button" class="person${r.alive ? '' : ' dead'}" data-select="${r.id}"><div class="role">${role}</div>#${r.id} ${sexMark(r.sex)} ${COLOR_LABEL[r.pheno.color]}${r.alive ? '' : '（故）'}</button>`;
  };

  let terrainInfo = '';
  if (c.alive) {
    const snow = world.isSnowAt(c.x, c.y);
    const tname = snow ? '雪原' : TERRAIN_LABEL[world.island.terrainAt(c.x, c.y)];
    terrainInfo = `<dt>いる場所</dt><dd>${tname}（目立ちやすさ ${world.visibility(c).toFixed(2)}）</dd>`;
  }

  const rows = [];
  for (const chr of CHROMOSOMES) {
    rows.push(`<tr class="chr-row"><td colspan="3">${chr.name}</td></tr>`);
    for (const l of LOCI.filter((x) => x.chr === chr.id).sort((a, b) => a.pos - b.pos)) {
      const carrier = isCarrier(l.key, c.genome) ? ' <span class="badge gene">保因者</span>' : '';
      rows.push(
        `<tr><td>${l.name}<div class="muted small">${INHERITANCE[l.mode].short}・${l.pos}cM</div></td><td class="genotype">${genotypeString(c.genome, l.key)}</td><td>${locusEffect(l.key, c.genome, ph)}${carrier}</td></tr>`,
      );
    }
  }

  let pinUi = '';
  if (pinned && pinned.id !== c.id) {
    if (pinned.sex === c.sex) {
      pinUi = `<div class="predict muted small">📌 固定中の #${pinned.id}（${sexLabel(pinned.sex)}）とは同性のため、交配予測できません。</div>`;
    } else {
      const mother = c.sex === 'F' ? c : pinned;
      const father = c.sex === 'M' ? c : pinned;
      pinUi = renderPrediction(world, mother, father);
    }
  }
  const pinBtn =
    pinned?.id === c.id
      ? '<button type="button" data-action="unpin">📌 固定を解除</button>'
      : '<button type="button" data-action="pin">📌 交配予測の相手として固定</button>';

  el.innerHTML = `
    <div class="creature-head">
      <canvas id="portrait" width="64" height="64" aria-hidden="true"></canvas>
      <div>
        <h2>#${c.id} ${sexMark(c.sex)} ${sexLabel(c.sex)}</h2>
        <div>${status} ${c.founder ? '<span class="badge">創始者</span>' : ''}</div>
      </div>
    </div>
    <dl class="kv">
      <dt>年齢</dt><dd>${ageLabel(c.age)}（寿命 ${world.opts.maxAgeYears} 歳）</dd>
      <dt>世代</dt><dd>第 ${c.gen} 世代</dd>
      <dt>近交係数 F</dt><dd>${c.F.toFixed(4)} ${c.F >= 0.125 ? '<span class="badge warn">近親交配の子</span>' : ''}</dd>
      <dt>見た目</dt><dd>${COLOR_LABEL[ph.color]}・${PATTERN_LABEL[ph.pattern]}・尾が${TAIL_LABEL[ph.tail]}${ph.glow ? '・<strong>発光</strong>' : ''}</dd>
      <dt>体格 / 毛皮</dt><dd>${ph.size.toFixed(2)} / ${pct(ph.fur)}</dd>
      <dt>免疫力</dt><dd>${pct(ph.resistance)}${ph.load ? ` <span class="badge warn">遺伝病 ×${ph.load}</span>` : ''}</dd>
      <dt>子の数</dt><dd>${children.length} 匹（生存 ${aliveChildren.length}）</dd>
      ${terrainInfo}
    </dl>
    <div class="btn-row">${pinBtn}</div>
    ${pinUi}
    <h3>家系</h3>
    <div class="family">
      ${person(father, '父')}${person(mother, '母')}
      ${person(ff, '父方の祖父')}${person(fm, '父方の祖母')}${person(mf, '母方の祖父')}${person(mm, '母方の祖母')}
    </div>
    ${
      children.length
        ? `<h3>子ども（${children.length}）</h3><div class="family">${children
            .slice(-24)
            .map((k) => person(k, `${Math.floor(k.birthTick / 12)}年生`))
            .join('')}</div>`
        : ''
    }
    <h3>遺伝子型</h3>
    <table>
      <thead><tr><th>遺伝子座</th><th>遺伝子型</th><th>効果</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <p class="muted small">遺伝子型は「母由来/父由来」ではなく、優性の対立遺伝子を先に表記しています。オスの X 連鎖遺伝子は「/Y」。</p>
  `;
  drawPortrait(el.querySelector('#portrait'), c);
}

function renderPrediction(world, mother, father) {
  const rng = createRng(mother.id * 7919 + father.id);
  const p = predictOffspring(mother, father, rng, 3000);
  const kin = world.pedigree.kinship(mother.id, father.id);
  const born = Math.max(1, p.born);
  const dist = (obj, labels) =>
    Object.entries(obj)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${labels[k]} ${pct(v / born)}`)
      .join('、');
  return `
    <div class="predict">
      <strong>🔮 交配予測：母 #${mother.id} × 父 #${father.id}</strong>
      <dl class="kv small" style="margin-top:6px">
        <dt>子の近交係数 F</dt><dd>${kin.toFixed(4)}</dd>
        <dt>致死（l/l）</dt><dd>${pct(p.lethal / p.n, 1)}</dd>
        <dt>体色</dt><dd>${dist(p.color, COLOR_LABEL)}</dd>
        <dt>模様</dt><dd>${dist(p.pattern, PATTERN_LABEL)}</dd>
        <dt>尾</dt><dd>${dist({ 0: p.tail[0], 1: p.tail[1], 2: p.tail[2] }, TAIL_LABEL)}</dd>
        <dt>発光</dt><dd>息子 ${pct(p.glowM / Math.max(1, p.males))}・娘 ${pct(p.glowF / Math.max(1, p.females))}</dd>
        <dt>免疫ヘテロ</dt><dd>${pct(p.resistant / born)}</dd>
        <dt>遺伝病</dt><dd>${pct(p.sick / born, 1)}</dd>
        <dt>平均体格/毛皮</dt><dd>${p.size.toFixed(2)} / ${pct(p.fur)}</dd>
      </dl>
      <p class="muted small">減数分裂を ${p.n} 回シミュレーションした結果（組換えも考慮）。</p>
    </div>`;
}

function renderNotables(world) {
  const cs = world.creatures;
  if (cs.length === 0) return '<p class="muted">生き残っている個体はいません。</p>';
  const by = (f) => cs.reduce((a, b) => (f(b) > f(a) ? b : a));
  const items = [
    ['最年長', by((c) => c.age), (c) => ageLabel(c.age)],
    ['子だくさん', by((c) => c.offspring), (c) => `子 ${c.offspring} 匹`],
    ['最も近交係数が高い', by((c) => c.F), (c) => `F = ${c.F.toFixed(3)}`],
    ['最も大きい', by((c) => c.pheno.size), (c) => `体格 ${c.pheno.size.toFixed(2)}`],
    ['最も毛深い', by((c) => c.pheno.fur), (c) => `毛皮 ${pct(c.pheno.fur)}`],
  ];
  const glowing = cs.filter((c) => c.pheno.glow);
  if (glowing.length) items.push(['発光する個体', glowing[0], () => `ほか ${glowing.length - 1} 匹`]);
  return `
    <p>地図上の個体をクリック（タップ）すると、遺伝子型・家系・交配予測が見られます。</p>
    <h3>注目の個体</h3>
    <div class="family">
      ${items
        .map(
          ([t, c, f]) =>
            `<button type="button" class="person" data-select="${c.id}"><div class="role">${t}</div>#${c.id} ${sexMark(c.sex)} ${f(c)}</button>`,
        )
        .join('')}
    </div>
    <h3>遊び方のヒント</h3>
    <ul class="small">
      <li>ある個体を「📌 固定」してから異性を選ぶと、2匹の子どもの表現型を予測できます。</li>
      <li>「表示」を <strong>近交係数 F</strong> にすると、近親交配が島のどこで進んでいるか分かります。</li>
      <li>「❄️ 寒冷期」を起こすと島が雪に覆われ、白い個体や毛深い個体が有利になります。</li>
      <li>「🌀 大嵐」で個体数を減らすと（ボトルネック）、遺伝的多様性が一気に失われます。</li>
    </ul>`;
}

// ───────────────────────── 集団 ─────────────────────────

export class StatsPanel {
  constructor(el) {
    this.el = el;
    el.innerHTML = `<div id="stats-tiles" class="quick-stats"></div><div id="stats-charts"></div>
      <h3>昨年の死因</h3><div id="stats-deaths" class="bars"></div>`;
    const host = el.querySelector('#stats-charts');
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
      desc: '体格は 0.7〜1.3 の値。毛皮と発光・免疫ヘテロは割合。',
      yMax: 1.4,
      format: (v) => v.toFixed(2),
      series: [
        { label: '平均体格', color: '--series-1' },
        { label: '平均毛皮', color: '--series-2' },
        { label: '発光の割合', color: '--series-4' },
        { label: '免疫ヘテロの割合', color: '--series-3' },
      ],
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
    ]);
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
    for (const c of [this.pop, this.div, this.color, this.traits, this.births]) c.draw();
  }
}

// ───────────────────────── 遺伝子頻度 ─────────────────────────

export class GenesPanel {
  constructor(el) {
    this.el = el;
    this.key = 'COL';
    el.innerHTML = `
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
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ───────────────────────── 遺伝図鑑 ─────────────────────────

export function renderGuide(el) {
  const byMode = {};
  for (const l of LOCI) (byMode[l.mode] ||= []).push(l);
  el.innerHTML = `<div class="guide">
    <h2>この島の生物について</h2>
    <p>雌雄のある架空の生物。<strong>2歳で成熟</strong>し、春（3〜6月）に年1回まで出産、<strong>15歳で必ず死ぬ</strong>。
    体細胞は 4 対の染色体（第1〜3染色体と性染色体）をもち、メスは XX、オスは XY。</p>
    <p>子は父母から染色体を1本ずつ受け継ぐ。配偶子がつくられるとき<strong>減数分裂で交叉（組換え）</strong>が起こるので、
    同じ染色体上で近い遺伝子ほど一緒に遺伝しやすい（連鎖）。まれに<strong>突然変異</strong>も起きる。</p>
    <h3>生死を分けるもの（自然選択）</h3>
    <ul class="small">
      <li><strong>捕食</strong>：背景に溶け込む体色ほど見つかりにくい（草原・森では緑、砂浜・雪では白、岩場では黒）。発光すると目立つ。</li>
      <li><strong>気候</strong>：毛皮が厚く体が大きいほど寒さに強く、暑さに弱い。</li>
      <li><strong>飢え</strong>：島の食料は限られ、大きい個体ほど多く食べる。冬と不作の年は食料が減る。</li>
      <li><strong>病気</strong>：免疫型 A/B のヘテロが強い。疫病の年は差が大きく出る。</li>
      <li><strong>遺伝病</strong>：劣性有害遺伝子をホモでもつと弱る。劣性致死 l/l は生まれてこない。</li>
      <li><strong>性選択</strong>：メスは大きいオスと発光するオスを好む。</li>
    </ul>
    <h3>遺伝子一覧</h3>
    ${Object.entries(byMode)
      .map(
        ([mode, loci]) => `<div class="locus-card">
          <h3>${INHERITANCE[mode].label}</h3>
          <p class="small">${INHERITANCE[mode].desc}</p>
          <p class="small muted">${loci
            .map((l) => `${l.name}（${CHROMOSOMES.find((c) => c.id === l.chr).name} ${l.pos}cM）：${l.alleles.map((a) => alleleLabel(l, a)).join(' / ')}`)
            .join('<br>')}</p>
        </div>`,
      )
      .join('')}
    <h3>孤島で起きること</h3>
    <ul class="small">
      <li><strong>創始者効果</strong>：最初の百匹がたまたま持っていた遺伝子だけが島の遺伝子のすべてになる。</li>
      <li><strong>遺伝的浮動</strong>：小さな集団では、有利でも不利でもない遺伝子（尾の長さなど）の頻度が偶然だけで大きく揺れ、やがて消失か固定に至る。</li>
      <li><strong>ボトルネック</strong>：災害で数が激減すると多様性が一気に失われる。</li>
      <li><strong>近交弱勢</strong>：閉じた集団では全員が次第に親戚になり、隠れていた劣性有害遺伝子がホモになって現れる。</li>
      <li><strong>平衡選択</strong>：超優性の免疫型は、浮動に逆らって両方の対立遺伝子が残りやすい。</li>
    </ul>
  </div>`;
}

// ───────────────────────── 設定 ─────────────────────────

export function renderSettings(el, opts, onChange, onRestart) {
  const o = { ...DEFAULTS, ...opts };
  el.innerHTML = `<div class="settings">
    <h2>新しい島の条件</h2>
    <p class="hint">これらは「この設定で新しい島を始める」を押したときに反映されます。</p>
    <label class="field">シード（同じシードなら同じ島・同じ歴史）<input type="text" name="seed" value="${String(o.seed).replace(/"/g, '&quot;')}"></label>
    <label class="field">最初の個体数<input type="number" name="initialCount" min="2" max="1000" value="${o.initialCount}"></label>
    <label class="field">島の豊かさ（環境収容力）<input type="number" name="carryingCapacity" min="10" max="2000" value="${o.carryingCapacity}"></label>
    <div class="btn-row"><button type="button" class="primary" data-action="restart">この設定で新しい島を始める</button>
    <button type="button" data-action="random-seed">ランダムなシードで始める</button></div>
    <h2 style="margin-top:18px">今すぐ反映される設定</h2>
    <label class="field">突然変異率（1遺伝子座・1配偶子あたり）<input type="number" name="mutationRate" step="0.0001" min="0" max="0.05" value="${o.mutationRate}"></label>
    <label class="field">捕食の強さ<input type="number" name="predation" step="0.1" min="0" max="5" value="${o.predation}"></label>
    <label class="field">発光オスへの好み（性選択）<input type="number" name="glowPreference" step="0.1" min="0" max="5" value="${o.glowPreference}"></label>
    <label class="check"><input type="checkbox" name="inbreedingAvoidance" ${o.inbreedingAvoidance ? 'checked' : ''}> 近親交配を避ける（半きょうだい以上の近親とは交配しない）</label>
    <label class="check"><input type="checkbox" name="randomEvents" ${o.randomEvents ? 'checked' : ''}> ランダムな出来事（疫病・不作・寒冷期・大嵐）</label>
    <p class="hint">寿命は 15 歳で固定です。</p>
  </div>`;
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.name) return;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
    if (t.type === 'number' && !Number.isFinite(v)) return;
    onChange(t.name, v);
  });
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'restart') onRestart(false);
    if (a === 'random-seed') onRestart(true);
  });
}
