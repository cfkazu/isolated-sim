// シナリオ編集画面（設定タブの中で切り替える）。
// 下書き（draft）を画面で書き換え、変わるたびに onChange で島のプレビューを作り直してもらう。
// 群れの置き場所は地図で決める（main.js が地図の操作を placeGroup に渡す）。

import { LOCUS, LOCI } from '../genes.js';
import { GEOLOGY, ISLAND_SHAPES } from '../island.js';
import { SCENARIOS, EVENTS, CLIMATE_STARTS, TRAIT_DEFS, SIMPLE_LOCI, scenarioWarnings, groupCounts, draftFrom } from '../scenarios.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TRAIT = Object.fromEntries(TRAIT_DEFS.map((t) => [t.key, t]));
// 群れの色（地図の円と、編集画面の印）
export const GROUP_COLORS = ['#e8590c', '#1c7ed6', '#2b8a3e', '#ae3ec9', '#f59f00', '#0ca678', '#d6336c', '#495057', '#74b816', '#1098ad', '#f76707', '#7048e8'];

export class ScenarioEditor {
  // hooks: { onChange(draft), onSave(draft), onStart(draft), onClose(), customs() → 自作シナリオの一覧, fromWorld() → 今の島からの下書き, defaultCount }
  constructor(el, hooks) {
    this.el = el;
    this.hooks = hooks;
    this.draft = null;
    this.placing = null; // 地図で置き場所を決めている群れの番号
    el.addEventListener('input', (e) => this._onInput(e));
    el.addEventListener('change', (e) => this._onInput(e, true));
    el.addEventListener('click', (e) => this._onClick(e));
  }

  open(draft) {
    this.draft = draft;
    this.placing = draft.groups.length ? 0 : null;
    this.render();
    this.hooks.onChange(this.draft);
  }

  // 地図から：群れの中心と半径を決める
  placeGroup(x, y, r) {
    const g = this.draft?.groups[this.placing];
    if (!g) return false;
    g.place = { x: +x.toFixed(3), y: +y.toFixed(3), r: +Math.max(0.03, Math.min(0.5, r ?? g.place?.r ?? 0.1)).toFixed(3) };
    const cell = this.el.querySelector(`[data-place-text="${this.placing}"]`);
    if (cell) cell.textContent = placeText(g.place);
    return true;
  }

  circles() {
    if (!this.draft) return [];
    return this.draft.groups
      .map((g, i) => (g.place ? { ...g.place, label: g.name, color: GROUP_COLORS[i % GROUP_COLORS.length], active: i === this.placing } : null))
      .filter(Boolean);
  }

  render() {
    const d = this.draft;
    const o = d.opts;
    const n = o.initialCount ?? this.hooks.defaultCount;
    const counts = groupCounts(d, n);
    const customs = this.hooks.customs();
    const warnings = scenarioWarnings(d, this.hooks.defaultCount);
    const sel = (name, options, value) =>
      `<select data-f="${name}">${options.map(([v, l]) => `<option value="${esc(v ?? '')}" ${String(v ?? '') === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

    this.el.innerHTML = `<div class="settings sc-editor">
      <h2>シナリオを作る</h2>
      <p class="hint">決めるのは島の始まり方だけです。始まったあとの規則はいつもと同じ。上から順に埋めてください。左の地図は、この設定で始めたときの 0 年目です。</p>

      <h3>① 土台</h3>
      <div class="btn-row">
        <select data-base>
          ${Object.entries(SCENARIOS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}
          ${customs.map((c) => `<option value="custom:${esc(c.id)}">自作：${esc(c.label)}</option>`).join('')}
        </select>
        <button type="button" data-sc="base">を複製してやり直す</button>
        <button type="button" data-sc="from-world" title="いま遊んでいる島の地質・形と、今の遺伝子の割合を写す">今の島から</button>
      </div>

      <h3>② 島</h3>
      <div class="sc-grid">
        <label class="field">島の形${sel('opts.islandShape', [[null, '設定のまま'], ...Object.entries(ISLAND_SHAPES).map(([k, v]) => [k, v.label])], o.islandShape)}</label>
        <label class="field">地質${sel('opts.geology', [[null, '設定のまま'], ['auto', 'おまかせ'], ...Object.entries(GEOLOGY).map(([k, v]) => [k, v.label])], o.geology)}</label>
        <label class="field">気候の始まり${sel('climateStart', CLIMATE_STARTS, d.climateStart)}</label>
        <label class="field">シード（空欄なら設定のまま）<input type="text" data-f="opts.seed" value="${esc(o.seed ?? '')}"></label>
        <label class="field">最初の個体数<input type="number" min="2" max="1000" data-f="opts.initialCount" data-num value="${o.initialCount ?? ''}" placeholder="${this.hooks.defaultCount}"></label>
        <label class="field">島の豊かさ<input type="number" min="0.1" max="5" step="0.1" data-f="opts.fertility" data-num value="${o.fertility ?? ''}" placeholder="設定のまま"></label>
        <label class="field">最初の捕食者の数<input type="number" min="0" max="100" data-f="opts.initialPredators" data-num value="${o.initialPredators ?? ''}" placeholder="設定のまま"></label>
      </div>

      <h3>③ 群れ</h3>
      <p class="hint">群れがなければ、島じゅうに散らばって始まります。群れを選んで地図をクリックすると置き場所、ドラッグすると広さが決まります。</p>
      ${d.groups
        .map(
          (g, i) => `<div class="sc-group ${i === this.placing ? 'placing' : ''}">
        <div class="sc-group-head">
          <span class="sc-dot" style="background:${GROUP_COLORS[i % GROUP_COLORS.length]}"></span>
          <input type="text" data-g="${i}" data-gf="name" value="${esc(g.name)}" aria-label="群れの名前">
          <span class="muted small">${counts[i]} 匹</span>
          <button type="button" data-sc="place" data-i="${i}" aria-pressed="${i === this.placing}">📍 地図で置く</button>
          <button type="button" data-sc="del-group" data-i="${i}" title="この群れを消す">✕</button>
        </div>
        <div class="sc-grid">
          <label class="field">割合（比）<input type="number" min="0.001" step="any" data-g="${i}" data-gf="share" data-num value="${g.share}"></label>
          <label class="field">出身（種分化の遺伝子）<select data-g="${i}" data-gf="origin">
            <option value="" ${g.origin == null ? 'selected' : ''}>まぜる</option>
            <option value="0" ${g.origin === 0 ? 'selected' : ''}>東の土地</option>
            <option value="1" ${g.origin === 1 ? 'selected' : ''}>西の土地</option></select></label>
          <label class="check"><input type="checkbox" data-g="${i}" data-gf="clan" ${g.clan ? 'checked' : ''}> 群れ全員を同じ家にする</label>
          <div class="small">場所：<span data-place-text="${i}">${placeText(g.place)}</span> ${g.place ? `<button type="button" class="link" data-sc="unplace" data-i="${i}">島じゅうに散らす</button>` : ''}</div>
        </div>
        ${this._genes(g, `g${i}`)}
      </div>`,
        )
        .join('')}
      <button type="button" data-sc="add-group">＋ 群れを足す</button>

      <h3>④ 全員の遺伝子</h3>
      <p class="hint">指定したいものだけ足してください。書かなかったものはいつもの割合です。群れの遺伝子は、ここより優先されます。</p>
      ${this._genes(d, 'all')}

      <h3>⑤ 予定の出来事</h3>
      ${d.events
        .map(
          (e, i) => `<div class="sc-row"><input type="number" min="1" max="5000" data-ev="${i}" data-evf="year" data-num value="${e.year}"> 年目に
          ${`<select data-ev="${i}" data-evf="event">${Object.entries(EVENTS).map(([k, l]) => `<option value="${k}" ${k === e.event ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
          <button type="button" data-sc="del-event" data-i="${i}">✕</button></div>`,
        )
        .join('')}
      <button type="button" data-sc="add-event">＋ 出来事を足す</button>

      <h3>⑥ 名前・説明・見どころ</h3>
      <label class="field">名前<input type="text" maxlength="40" data-f="label" value="${esc(d.label)}"></label>
      <label class="field">説明<textarea rows="2" maxlength="300" data-f="desc">${esc(d.desc)}</textarea></label>
      <label class="field">見どころ（1 行に 1 つ）<textarea rows="3" data-f="watch">${esc(d.watch.join('\n'))}</textarea></label>

      ${warnings.length ? `<div class="sc-warn"><strong>確認</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <div class="btn-row sc-actions">
        <button type="button" class="primary" data-sc="start">保存して始める</button>
        <button type="button" data-sc="save">保存</button>
        <button type="button" data-sc="export-file">ファイルに書き出す</button>
        <button type="button" data-sc="export-copy">文字列をコピー</button>
        <button type="button" data-sc="close">やめる</button>
      </div>
      <p class="muted small" data-sc-status></p>
      <textarea class="sc-export" rows="6" readonly data-sc-export hidden></textarea>
    </div>`;
  }

  // 遺伝子の指定（形質の単位＋「詳しく」で遺伝子座ごと）。scope は 'all' か 'g<番号>'
  _genes(target, scope) {
    const rows = [];
    for (const [k, v] of Object.entries(target.traits ?? {})) {
      rows.push(`<div class="sc-row"><span class="sc-label">${esc(TRAIT[k].label)}</span>
        <input type="range" min="0" max="100" data-scope="${scope}" data-trait="${k}" value="${Math.round(v * 100)}"><span class="num">${Math.round(v * 100)}%</span>
        <button type="button" data-sc="del-trait" data-scope="${scope}" data-k="${k}">✕</button></div>`);
    }
    const simple = [];
    const detail = [];
    for (const key of Object.keys(target.freqs ?? {})) (SIMPLE_LOCI.includes(key) ? simple : detail).push(this._locusRow(target, scope, key));
    const usedTraits = new Set(Object.keys(target.traits ?? {}));
    const usedLoci = new Set(Object.keys(target.freqs ?? {}));
    const addSimple = [
      ...SIMPLE_LOCI.filter((k) => !usedLoci.has(k)).map((k) => [`L:${k}`, LOCUS[k].name]),
      ...TRAIT_DEFS.filter((t) => !usedTraits.has(t.key)).map((t) => [`T:${t.key}`, t.label]),
    ];
    const addDetail = LOCI.filter((l) => !SIMPLE_LOCI.includes(l.key) && !usedLoci.has(l.key)).map((l) => [`L:${l.key}`, `${l.name}（${l.key}）`]);
    return `<div class="sc-genes">
      ${simple.join('')}${rows.join('')}
      <div class="sc-row"><select data-add-gene="${scope}"><option value="">＋ 遺伝子を指定する…</option>${addSimple.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <details ${detail.length ? 'open' : ''}><summary class="small">詳しく（遺伝子座ごと）</summary>
        ${detail.join('')}
        <div class="sc-row"><select data-add-gene="${scope}"><option value="">＋ 遺伝子座を指定する…</option>${addDetail.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      </details>
    </div>`;
  }

  _locusRow(target, scope, key) {
    const l = LOCUS[key];
    const d = target.freqs[key];
    const total = l.alleles.reduce((t, a) => t + (d[a] ?? 0), 0) || 1;
    const inputs = l.alleles
      .map(
        (a) =>
          `<label class="sc-allele">${esc(a)}${l.labels?.[a] ? `<span class="muted">（${esc(l.labels[a])}）</span>` : ''}<input type="number" min="0" max="100" data-scope="${scope}" data-locus="${key}" data-allele="${a}" data-num value="${Math.round(((d[a] ?? 0) / total) * 100)}">%</label>`,
      )
      .join('');
    return `<div class="sc-row"><span class="sc-label">${esc(l.name)}</span>${inputs}<button type="button" data-sc="del-locus" data-scope="${scope}" data-k="${key}">✕</button></div>`;
  }

  _target(scope) {
    return scope === 'all' ? this.draft : this.draft.groups[Number(scope.slice(1))];
  }

  _onInput(e, committed = false) {
    const t = e.target;
    const d = this.draft;
    if (!d) return;
    const val = t.type === 'checkbox' ? t.checked : 'num' in t.dataset ? (t.value === '' ? null : Number(t.value)) : t.value;
    let structural = false;
    if (t.dataset.f) {
      const f = t.dataset.f;
      if (f.startsWith('opts.')) {
        const k = f.slice(5);
        if (val === null || val === '') delete d.opts[k];
        else d.opts[k] = val;
        structural = k === 'initialCount';
      } else if (f === 'climateStart') d.climateStart = val === '' ? null : Number(val);
      else if (f === 'watch') d.watch = String(val).split('\n').filter((x) => x.trim());
      else d[f] = val;
    } else if (t.dataset.g != null) {
      const g = d.groups[Number(t.dataset.g)];
      const f = t.dataset.gf;
      if (f === 'origin') {
        if (val === '') delete g.origin;
        else g.origin = Number(val);
      } else if (f === 'share') {
        g.share = Math.max(0.001, val ?? 1);
        structural = true;
      } else g[f] = val;
    } else if (t.dataset.ev != null) {
      const ev = d.events[Number(t.dataset.ev)];
      ev[t.dataset.evf] = t.dataset.evf === 'year' ? Math.max(1, Math.round(val ?? 1)) : val;
    } else if (t.dataset.trait) {
      this._target(t.dataset.scope).traits[t.dataset.trait] = Number(t.value) / 100;
      t.nextElementSibling.textContent = `${t.value}%`;
    } else if (t.dataset.locus) {
      this._target(t.dataset.scope).freqs[t.dataset.locus][t.dataset.allele] = Math.max(0, (val ?? 0) / 100);
    } else if (t.dataset.addGene != null && committed) {
      const target = this._target(t.dataset.addGene);
      const [kind, k] = t.value.split(':');
      if (kind === 'T') target.traits[k] = 0.5;
      if (kind === 'L') target.freqs[k] = Object.fromEntries(LOCUS[k].alleles.map((a, i) => [a, LOCUS[k].freq[i]]));
      structural = true;
    } else if (t.dataset.base != null) {
      return;
    } else return;
    // 数を打っている途中は描き直さない（確定したとき、または量の変化だけのとき）
    if (structural && committed) this.render();
    if (committed || t.type === 'range' || t.type === 'checkbox' || t.tagName === 'SELECT') this.hooks.onChange(d);
  }

  _onClick(e) {
    const b = e.target.closest('[data-sc]');
    if (!b || !this.draft) return;
    const d = this.draft;
    const i = Number(b.dataset.i);
    switch (b.dataset.sc) {
      case 'base': {
        const v = this.el.querySelector('[data-base]').value;
        const custom = v.startsWith('custom:') ? this.hooks.customs().find((c) => c.id === v.slice(7)) : null;
        const next = draftFrom(v, custom);
        if (custom) next.id = `my-${Date.now().toString(36)}`;
        this.open(next);
        return;
      }
      case 'from-world':
        this.open(this.hooks.fromWorld());
        return;
      case 'add-group': {
        d.groups.push({ name: `群れ${d.groups.length + 1}`, share: 1, clan: false, freqs: {}, traits: {} });
        this.placing = d.groups.length - 1;
        break;
      }
      case 'del-group':
        d.groups.splice(i, 1);
        this.placing = d.groups.length ? Math.min(this.placing ?? 0, d.groups.length - 1) : null;
        break;
      case 'place':
        this.placing = i;
        break;
      case 'unplace':
        delete d.groups[i].place;
        break;
      case 'add-event':
        d.events.push({ year: 30, event: 'supercold' });
        break;
      case 'del-event':
        d.events.splice(i, 1);
        break;
      case 'del-trait':
        delete this._target(b.dataset.scope).traits[b.dataset.k];
        break;
      case 'del-locus':
        delete this._target(b.dataset.scope).freqs[b.dataset.k];
        break;
      case 'save':
        this.hooks.onSave(d).then((ok) => this.status(ok ? `「${d.label}」を保存しました。` : 'このブラウザでは保存できませんでした（書き出しは使えます）。'));
        return;
      case 'start':
        this.hooks.onStart(d);
        return;
      case 'export-file':
        this._showExport();
        try {
          downloadJson(d);
          this.status('ファイルに書き出しました（うまく保存されないときは、下の文字列をコピーしてください）。');
        } catch {
          this.status('ファイルに書き出せませんでした。下の文字列をコピーしてください。');
        }
        return;
      case 'export-copy': {
        const box = this._showExport();
        const done = () => this.status('文字列をコピーしました。');
        const fail = () => {
          box.select();
          this.status('自動でコピーできませんでした。下の文字列を選んでコピーしてください。');
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(box.value).then(done, fail);
        else fail();
        return;
      }
      case 'close':
        this.hooks.onClose();
        return;
      default:
        return;
    }
    this.render();
    this.hooks.onChange(d);
  }

  // 書き出した JSON を画面にも出す（ダウンロードやコピーが使えない環境のため）
  _showExport() {
    const box = this.el.querySelector('[data-sc-export]');
    box.value = JSON.stringify(this.draft, null, 2);
    box.hidden = false;
    return box;
  }

  status(text) {
    const s = this.el.querySelector('[data-sc-status]');
    if (s) s.textContent = text;
  }
}

function placeText(p) {
  return p ? `中心 (${Math.round(p.x * 100)}, ${Math.round(p.y * 100)})・半径 ${Math.round(p.r * 100)}` : '未定（島じゅう）';
}

export function downloadJson(sc) {
  const blob = new Blob([JSON.stringify(sc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sc.label.replace(/[\\/:*?"<>|]/g, '_') || 'scenario'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
