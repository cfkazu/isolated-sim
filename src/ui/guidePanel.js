// 遺伝図鑑タブと設定タブ。

import { LOCI, CHROMOSOMES, INHERITANCE } from '../genes.js';
import { DEFAULTS, CLIMATE_AMPLITUDE } from '../world.js';
import { ISLAND_SHAPES, GEOLOGY } from '../island.js';
import { alleleLabel } from './panelUtil.js';
import { SCENARIOS } from '../scenarios.js';

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
      <li><strong>捕食</strong>：島には捕食者がいる（数だけで表現）。体色と足元の地面の色の差が大きいほど見つかりやすい。地図に見えている地面の色がそのまま使われる。発光すると目立つ。捕食者は<strong>よく見かける色を重点的に探す</strong>（探索像）ので、多数派の色ほど狙われやすい。捕食者の数は獲物の量に応じて増減する。</li>
      <li><strong>気候</strong>：毛皮が厚く体が大きく代謝が速いほど寒さに強く、暑さに弱い。山の上は寒く海辺は暖かい。気候は地球の氷期と間氷期のように、約 600 年の周期でゆっくり冷えて急に暖まる。</li>
      <li><strong>飢え</strong>：草はマスごとに育ち、食べられて減る。同じマスの個体で頭数割りに分け合うので、たくさん食べる大きな個体ほど足りなくなりやすい。草は寒いと育たず、干ばつの年はほとんど育たない。食べ尽くされた地面は土の色になる（そこでは黒が目立たない）。</li>
      <li><strong>海</strong>：生き物は泳げない。砂浜にいる個体がまれに流木に乗って沖へ流され、たどり着いた島に上陸する（多くは海で死ぬ）。寒冷期には海面が下がり、浅瀬が陸橋になって島どうしが陸続きになる。「✏️ 地形を編集」で陸を盛ったり海を掘ったり、沖に小島をつくったりできる。</li>
      <li><strong>病気</strong>：免疫型 A/B のヘテロが強い。疫病の年は差が大きく出る。</li>
      <li><strong>遺伝病</strong>：劣性有害遺伝子をホモでもつと弱る。劣性致死 l/l は生まれてこない。</li>
      <li><strong>性選択</strong>：大きいオスは他のオスに競り勝つ。そのうえでメスは、自分の<strong>好みの遺伝子</strong>に従って長い尾や発光のオスを選ぶ。
      飾りの見栄えは栄養状態しだいなので、健康なオスほど長い尾・強い光を示せる（正直なシグナル）。
      長い尾は捕食者から逃げにくく、維持に多く食べる。選り好みの強いメスは相手探しに時間がかかり、繁殖の機会を逃しやすい。</li>
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

function scenarioHint(key, customs = []) {
  const sc = key?.startsWith('custom:') ? (customs.find((c) => `custom:${c.id}` === key) ?? SCENARIOS.free) : (SCENARIOS[key] ?? SCENARIOS.free);
  const fixed = Object.keys(sc.opts ?? {}).length ? '（このシナリオでは、島の形・地質・個体数などの一部をシナリオが決めます）' : '';
  return `${sc.desc}${fixed}`;
}

// extra: { customs: () => 自作シナリオの一覧, onEdit(選んでいるシナリオ), onImport(文字列) → Promise<メッセージ>, onDelete(id) }
export function renderSettings(el, opts, onChange, onRestart, extra = {}) {
  const o = { ...DEFAULTS, ...opts };
  const customs = extra.customs?.() ?? [];
  const current = o.scenario === 'custom' && o.scenarioData ? `custom:${o.scenarioData.id}` : o.scenario;
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  el.innerHTML = `<div class="settings">
    <h2>新しい島の条件</h2>
    <p class="hint">これらは「この設定で新しい島を始める」を押したときに反映されます。</p>
    <label class="field">シナリオ（島の始まり方）<select name="scenario">
      <optgroup label="組み込み">${Object.entries(SCENARIOS)
        .map(([k, v]) => `<option value="${k}" ${current === k ? 'selected' : ''}>${v.label}</option>`)
        .join('')}</optgroup>
      ${customs.length ? `<optgroup label="自作">${customs.map((c) => `<option value="custom:${esc(c.id)}" ${current === `custom:${c.id}` ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup>` : ''}
    </select></label>
    <p class="hint" id="scenario-desc">${esc(scenarioHint(current, customs))}</p>
    <div class="btn-row">
      <button type="button" data-action="edit-scenario">✏️ シナリオを作る・直す</button>
      ${current.startsWith('custom:') ? '<button type="button" data-action="delete-scenario">この自作シナリオを消す</button>' : ''}
    </div>
    <details class="sc-import"><summary class="small">📥 シナリオを読み込む（人からもらったファイル・文字列）</summary>
      <input type="file" accept="application/json,.json" data-import-file>
      <textarea rows="3" placeholder="ここに文字列を貼り付け" data-import-text></textarea>
      <div class="btn-row"><button type="button" data-action="import-scenario">読み込む</button><span class="muted small" data-import-status></span></div>
    </details>
    <label class="field">シード（同じシードなら同じ島・同じ歴史）<input type="text" name="seed" value="${String(o.seed).replace(/"/g, '&quot;')}"></label>
    <label class="field">島の形<select name="islandShape">${Object.entries(ISLAND_SHAPES)
      .map(([k, v]) => `<option value="${k}" ${o.islandShape === k ? 'selected' : ''}>${v.label}</option>`)
      .join('')}</select></label>
    <p class="hint">${Object.values(ISLAND_SHAPES)
      .map((v) => `<strong>${v.label}</strong>：${v.desc}`)
      .join('<br>')}</p>
    <label class="field">地質<select name="geology">
      <option value="auto" ${o.geology === 'auto' ? 'selected' : ''}>おまかせ（シードで決まる）</option>
      ${Object.entries(GEOLOGY)
        .map(([k, v]) => `<option value="${k}" ${o.geology === k ? 'selected' : ''}>${v.label}</option>`)
        .join('')}</select></label>
    <p class="hint">${Object.values(GEOLOGY)
      .map((v) => `<strong>${v.label}</strong>：${v.desc}`)
      .join('<br>')}</p>
    <label class="field">最初の個体数<input type="number" name="initialCount" min="2" max="1000" value="${o.initialCount}"></label>
    <label class="field">島の豊かさ（草の育ちやすさ）<input type="number" name="fertility" step="0.1" min="0.1" max="5" value="${o.fertility}"></label>
    <label class="field">最初の捕食者の数<input type="number" name="initialPredators" min="0" max="100" value="${o.initialPredators}"></label>
    <div class="btn-row"><button type="button" class="primary" data-action="restart">この設定で新しい島を始める</button>
    <button type="button" data-action="random-seed">ランダムなシードで始める</button></div>
    <h2 style="margin-top:18px">今すぐ反映される設定</h2>
    <label class="field">突然変異率（1遺伝子座・1配偶子あたり）<input type="number" name="mutationRate" step="0.0001" min="0" max="0.05" value="${o.mutationRate}"></label>
    <label class="field">捕食者の探索像の強さ k<input type="number" name="searchImage" step="0.1" min="1" max="4" value="${o.searchImage}"></label>
    <p class="hint">k = 1 なら捕食者は目立つ獲物を狙うだけ。k が大きいほど「よく見かける色」を重点的に探すので、少数派の色が有利になる。</p>
    <label class="check"><input type="checkbox" name="inbreedingAvoidance" ${o.inbreedingAvoidance ? 'checked' : ''}> 近親交配を避ける（半きょうだい以上の近親とは交配しない）</label>
    <label class="check"><input type="checkbox" name="randomEvents" ${o.randomEvents ? 'checked' : ''}> ランダムな出来事（疫病・干ばつ・大嵐・超寒冷期）</label>
    <label class="field">気候の周期（氷期から次の氷期まで）<select name="climateCycleYears" data-num="1">${[300, 600, 1000]
      .map((y) => `<option value="${y}" ${o.climateCycleYears === y ? 'selected' : ''}>${y} 年</option>`)
      .join('')}</select></label>
    <label class="field">気候の振れ幅<select name="climateAmplitude">${Object.entries(CLIMATE_AMPLITUDE)
      .map(([k, a]) => `<option value="${k}" ${o.climateAmplitude === k ? 'selected' : ''}>${a.label}（${a.cold}℃〜+${a.warm}℃）</option>`)
      .join('')}</select></label>
    <p class="hint">地球の氷期と間氷期のように、ゆっくり冷えて急に暖まる。寒い側に大きく、暖かい側に小さく振れる。寒い時代は海面が下がって浅瀬が陸橋になり、暖かい時代は海面が上がる。</p>
    <p class="hint">寿命は 15 歳で固定です。</p>
  </div>`;
  // 保存した島を読み込んだときに描き直すので、イベントは最初の 1 回だけ登録する
  if (el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.importFile != null) t.files?.[0]?.text().then((text) => (el.querySelector('[data-import-text]').value = text));
  });
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.name) return;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.dataset.num ? Number(t.value) : t.value;
    if (t.type === 'number' && !Number.isFinite(v)) return;
    onChange(t.name, v);
    if (t.name === 'scenario') {
      el.querySelector('#scenario-desc').textContent = scenarioHint(v, extra.customs?.() ?? []);
      extra.onSelect?.(v);
    }
  });
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'restart') onRestart(false);
    if (a === 'random-seed') onRestart(true);
    if (a === 'edit-scenario') extra.onEdit?.(el.querySelector('select[name="scenario"]').value);
    if (a === 'delete-scenario') extra.onDelete?.(el.querySelector('select[name="scenario"]').value.slice(7));
    if (a === 'import-scenario') {
      const text = el.querySelector('[data-import-text]').value;
      extra.onImport?.(text).then((msg) => {
        const st = el.querySelector('[data-import-status]');
        if (st) st.textContent = msg;
      });
    }
  });
}
