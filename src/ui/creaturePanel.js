// 個体タブ：個体の詳細（遺伝子のカード・家族・交配予測）と、選んでいないときの見どころ・注目の個体。

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
  polygenicSummary,
  PATTERN_LABEL,
  EAR_LABEL,
  DMI_PAIRS,
} from '../genes.js';
import { DEATH_CAUSES, tailDisplay, glowDisplay } from '../world.js';
import { TERRAIN_LABEL } from '../island.js';
import { createRng } from '../rng.js';
import { drawCreature } from './creatureArt.js';
import { pct, idLink, sexMark, sexLabel, ageLabel } from './panelUtil.js';

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

  const children = c.children.map((id) => ped.get(id)).filter(Boolean);
  const aliveChildren = children.filter((x) => x.alive);
  const who = (r) => (r ? `<button type="button" class="link" data-select="${r.id}">${sexMark(r.sex)} ${r.clan}の${r.name}</button>${r.alive ? '' : '（故）'}` : '—');

  let terrainInfo = '';
  if (c.alive) {
    const snow = world.isSnowAt(c.x, c.y);
    const tname = snow ? '雪原' : TERRAIN_LABEL[world.island.terrainAt(c.x, c.y)];
    terrainInfo = `<dt>いる場所</dt><dd>${tname}（目立ちやすさ ${world.visibility(c).toFixed(2)}）</dd>`;
  }

  const rows = [];
  // 古い個体はゲノムの記録を捨てている（家系図のための軽い記録だけが残る）
  for (const chr of c.genome ? CHROMOSOMES : []) {
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
    if (!pinned.genome || !c.genome) {
      pinUi = '<div class="predict muted small">📌 古い個体は遺伝子の記録が残っていないため、交配予測できません。</div>';
    } else if (pinned.sex === c.sex) {
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
      <canvas id="portrait" class="portrait-big" width="160" height="104" aria-hidden="true"></canvas>
      <div>
        <h2>${c.name} <span class="muted small">${c.clan}・#${c.id}・${sexMark(c.sex)}${sexLabel(c.sex)}</span></h2>
        <div>${status} ${c.founder ? '<span class="badge">創始者</span>' : ''}</div>
      </div>
    </div>
    <dl class="kv">
      <dt>年齢</dt><dd>${ageLabel(c.age)}（寿命 ${world.opts.maxAgeYears} 歳）</dd>
      <dt>世代</dt><dd>第 ${c.gen} 世代</dd>
      <dt>近交係数 F</dt><dd>${c.F.toFixed(4)} ${c.F >= 0.125 ? '<span class="badge warn">近親交配の子</span>' : ''}</dd>
      <dt>見た目</dt><dd>${COLOR_LABEL[ph.color]}・${PATTERN_LABEL[ph.pattern]}・${EAR_LABEL[ph.ear]}${ph.glow ? '・<strong>発光</strong>' : ''}</dd>
      ${
        c.sex === 'M'
          ? `<dt>飾り</dt><dd>尾の長さ ${pct(ph.tail)}（見栄え ${pct(tailDisplay(c))}）${ph.glow ? `・光の強さ ${pct(glowDisplay(c))}` : ''}</dd>`
          : `<dt>好み</dt><dd>長い尾 ${pct(ph.prefTail)}・発光 ${pct(ph.prefGlow)}</dd>`
      }
      <dt>体格 / 毛皮</dt><dd>${ph.size.toFixed(2)} / ${pct(ph.fur)}</dd>
      <dt>代謝</dt><dd>${ph.metabolism < 0.93 ? '遅い（燃費がいい）' : ph.metabolism > 1.07 ? '速い（多産・寒さに強い）' : 'ふつう'}（${ph.metabolism.toFixed(2)}）</dd>
      <dt>栄養状態</dt><dd>${pct(c.condition)}${c.alive && c.hunger > 0.2 ? ' <span class="badge warn">空腹</span>' : ''}</dd>
      <dt>免疫力</dt><dd>${pct(ph.resistance)}${ph.load ? ` <span class="badge warn">遺伝病 ×${ph.load}</span>` : ''}</dd>
      ${
        c.lineage
          ? `<dt>創始者由来</dt><dd>${Object.entries(c.lineage)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([id, v]) => `${idLink(world, id, world.pedigree.get(Number(id))?.name ?? `#${id}`)} ${pct(v, 1)}`)
              .join('、')}${Object.keys(c.lineage).length > 3 ? ` ほか ${Object.keys(c.lineage).length - 3} 匹` : ''}</dd>`
          : ''
      }
      <dt>子の数</dt><dd>${children.length} 匹（生存 ${aliveChildren.length}）</dd>
      ${terrainInfo}
    </dl>
    <div class="btn-row"><button type="button" data-tab="family">🌳 家系図で見る</button>${pinBtn}</div>
    ${pinUi}
    <dl class="kv">
      <dt>父</dt><dd>${c.founder ? '（創始者）' : who(father)}</dd>
      <dt>母</dt><dd>${c.founder ? '（創始者）' : who(mother)}</dd>
    </dl>
    <h3>遺伝子の要約</h3>
    ${
      c.genome
        ? `${geneCards(c)}
    <details class="full-genes"><summary>全遺伝子座の一覧（染色体順・${LOCI.length} 座）</summary>
    <table>
      <thead><tr><th>遺伝子座</th><th>遺伝子型</th><th>効果</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <p class="muted small">遺伝子型は「母由来/父由来」ではなく、優性の対立遺伝子を先に表記しています。オスの X 連鎖遺伝子は「/Y」。</p>
    </details>`
        : `<p class="muted small">${world.opts.pedigreeYears} 年以上前の個体なので、遺伝子の記録は残っていません（見た目と家系だけが残っています）。</p>`
    }
  `;
  drawCreature(el.querySelector('#portrait'), c, 160, 104);
}

// 個体の遺伝子を、見た目・健康・量的形質のカードにまとめる。
// 対立遺伝子のチップは、表に出ていない（隠れている）ものを点線で示す。
function geneCards(c) {
  const g = c.genome;
  const ph = c.pheno;
  const male = c.sex === 'M';
  const al = (key) => {
    const i = LOCI.findIndex((l) => l.key === key);
    return [g.m[i], g.p[i]];
  };
  const chip = (a, hidden, label) => `<span class="gchip${hidden ? ' hidden' : ''}" title="${hidden ? '表に出ていない' : '表に出ている'}">${a ?? 'Y'}${label ? ` ${label}` : ''}</span>`;
  const chips = (key, isHidden) => {
    const locus = LOCI.find((l) => l.key === key);
    return `<div class="gchips">${al(key)
      .map((a) => chip(a, a != null && isHidden(a), a == null ? '' : locus.labels?.[a]))
      .join('')}</div>`;
  };
  const card = (title, value, chipHtml, note = '', tag = '') =>
    `<div class="gcard"><div class="gtitle">${title}${tag ? `<span class="gtag">${tag}</span>` : ''}</div><div class="gvalue">${value}</div>${chipHtml}${
      note ? `<div class="gnote">${note}</div>` : ''
    }</div>`;

  const colorLetter = { black: 'K', green: 'G', white: 'w' }[ph.color];
  const [p1, p2] = al('PAT');
  const glowAl = al('GLW');
  const hetVit = ph.resistance > 0.8;
  const dl = ['DL1', 'DL2', 'DL3'];
  const dCount = dl.filter((k) => al(k).includes('d')).length;

  const looks = [
    card(
      '体色',
      ph.albino ? `${COLOR_LABEL[ph.color]}（隠れている）` : COLOR_LABEL[ph.color],
      chips('COL', (a) => ph.albino || a !== colorLetter),
      ph.albino ? 'アルビノなので体色の遺伝子は表に出ない（子には伝わる）' : ph.color !== 'white' && al('COL').includes('w') ? '白の遺伝子 w を隠し持つ' : '',
      '優劣序列',
    ),
    card('模様', PATTERN_LABEL[ph.pattern], chips('PAT', (a) => a === 'o' && (p1 !== 'o' || p2 !== 'o')), ph.pattern === 'both' ? '斑点と縞の両方が出る（共優性）' : '', '共優性'),
    card(
      '色素',
      ph.albino ? 'アルビノ' : '色あり',
      chips('ALB', (a) => !ph.albino && a === 'c'),
      ph.albino ? '体色の遺伝子を覆い隠す。目が弱い' : al('ALB').includes('c') ? 'アルビノの遺伝子 c を隠し持つ' : '',
      '上位',
    ),
    card(
      '換毛',
      ph.molt ? '冬は白い毛' : '一年中同じ',
      chips('MLT', (a) => ph.molt && a === 'b'),
      ph.albino ? 'アルビノなので冬毛も色なし' : ph.molt ? '12〜2 月は白くなる（雪がなくても）' : '',
      '可塑性',
    ),
    card('耳の形', EAR_LABEL[ph.ear], chips('EAR', () => false), '中立な形質', '不完全優性'),
    card(
      '発光',
      ph.glow ? '発光する' : '発光しない',
      chips('GLW', (a) => !ph.glow && a === 'g'),
      !male && !ph.glow && glowAl.includes('g') ? '保因者：息子の半分が発光する' : male ? 'オスの X は母から。息子には伝わらない' : '',
      '伴性',
    ),
  ];
  const dmiChips = DMI_PAIRS.map(
    (pair, i) =>
      `<span class="muted small">${'ABC'[i]}</span>${pair.map((k) => al(k).map((a) => chip(a == null ? null : a === 'n' ? (LOCUS[k].side === 0 ? '東' : '西') : 'o')).join('')).join('')}`,
  ).join('<span class="muted"> · </span>');
  const fert = ph.fertility ?? 1;
  const health = [
    card('免疫型', hetVit ? 'A/B（強い）' : ph.resistance > 0.5 ? 'A/A' : 'B/B', chips('VIT', () => false), hetVit ? 'ヘテロなので病気に最も強い' : '', '超優性'),
    card('致死因子', '健康', chips('LET', (a) => a === 'l'), al('LET').includes('l') ? '保因者：同じ保因者との子の 1/4 は生まれない' : '', '劣性致死'),
    card(
      '有害因子（3 座）',
      ph.load ? `発症 ×${ph.load}` : dCount ? '健康（保因者）' : '健康',
      `<div class="gchips">${dl.map((k) => al(k).map((a) => chip(a, a === 'd' && !(al(k)[0] === 'd' && al(k)[1] === 'd'))).join('')).join('<span class="muted"> · </span>')}</div>`,
      ph.load ? 'd/d の座があり体が弱い' : dCount ? `${dCount} 座で d を隠し持つ` : '',
      '劣性有害',
    ),
    card(
      '子のできやすさ',
      pct(fert),
      `<div class="gchips">${dmiChips}</div>`,
      fert < 0.999 ? '同じ組の東と西の新型を両方持つ雑種。子ができにくい' : '組ごとに東か西の片方しか持たない',
      '不和合',
    ),
  ];
  const expressedValue = {
    size: () => `体格 ${ph.size.toFixed(2)}`,
    fur: (t) => `毛皮 ${pct(t.value)}`,
    metab: () => `代謝 ${ph.metabolism.toFixed(2)}`,
    tail: (t) => `尾 ${pct(t.value)}・見栄え ${pct(tailDisplay(c))}`,
    prefTail: (t) => `強さ ${pct(t.value)}`,
    prefGlow: (t) => `強さ ${pct(t.value)}`,
    dispM: (t) => `島の幅の ${pct(t.value * 0.3)} ほど旅立つ`,
    dispF: (t) => `島の幅の ${pct(t.value * 0.3)} ほど旅立つ`,
  };
  const poly = polygenicSummary(g).map((t) => {
    const silent = t.sex && t.sex !== c.sex;
    return `<div class="gcard"><div class="gtitle">${t.label}<span class="gtag">＋${t.plus}/${t.copies}</span></div>
      <div class="sbar thin"><span style="flex-grow:${t.value};background:var(--series-1)"></span><span style="flex-grow:${1 - t.value};background:var(--grid)"></span></div>
      <div class="gnote">${silent ? `<span class="muted">${t.sex === 'M' ? 'オス' : 'メス'}だけに現れる（遺伝子 ${pct(t.value)} を運ぶだけ）</span>` : expressedValue[t.trait](t)}</div></div>`;
  });
  return `<div class="gsum">${looks.join('')}</div>
    <div class="gsum">${health.join('')}</div>
    <div class="gsum">${poly.join('')}</div>`;
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
        <dt>耳</dt><dd>${dist({ 0: p.ear[0], 1: p.ear[1], 2: p.ear[2] }, EAR_LABEL)}</dd>
        <dt>息子の尾 / 娘の尾への好み</dt><dd>${pct(p.tailM)} / ${pct(p.prefTailF)}</dd>
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
  const hl = world.highlights;
  const digest = hl
    ? `<h3>見どころ（${hl.year - 5}〜${hl.year}年目）</h3>
    <ul class="highlights">${hl.items
      .map((it) => `<li><span>${it.icon}</span>${it.id != null ? `<button type="button" class="link" data-select="${it.id}">${it.text}</button>` : it.text}</li>`)
      .join('')}</ul>`
    : '<p class="muted small">5 年ごとに、この島で起きた目立つ変化を「見どころ」としてここと年代記にまとめます。</p>';
  return `
    ${digest}
    <p>地図上の個体をクリック（タップ）すると、遺伝子型・家系・交配予測が見られます。</p>
    <h3>注目の個体</h3>
    <div class="family">
      ${items
        .map(
          ([t, c, f]) =>
            `<button type="button" class="person" data-select="${c.id}"><div class="role">${t}</div>${sexMark(c.sex)} ${c.clan}の${c.name}<div class="muted small">${f(c)}</div></button>`,
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
