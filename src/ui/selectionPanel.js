// 自然選択タブ：形質ごとの実際の生存率と子の数。

import {
  SELECTION_TRAITS,
  mergeSelection,
  survivalRows,
  selectionSummary,
  SELECTION_T,
  SELECTION_HINT_T,
} from '../stats.js';
import { DEATH_CAUSES } from '../world.js';
import { pct } from './panelUtil.js';

const PERIODS = { 1: '昨年', 10: '直近10年', 0: '全期間' };

export class SelectionPanel {
  constructor(el) {
    this.el = el;
    this.trait = 'color';
    this.period = 10;
    el.innerHTML = `
      <p class="small">年のはじめに生きていた個体を形質で分け、<strong>1 年後に生き残った割合</strong>と<strong>成体 1 匹が残した子の数</strong>を、実際の結果から数えています。
      設定した係数ではなく、起きたことそのものです。</p>
      <div class="btn-row">
        <label>形質 <select id="sel-trait">${Object.entries(SELECTION_TRAITS)
          .map(([k, t]) => `<option value="${k}">${t.label}</option>`)
          .join('')}</select></label>
        <label>期間 <select id="sel-period">${Object.entries(PERIODS)
          .map(([k, v]) => `<option value="${k}" ${Number(k) === this.period ? 'selected' : ''}>${v}</option>`)
          .join('')}</select></label>
      </div>
      <div id="sel-table"></div>
      <p class="muted small">± は、1 匹ずつの運命が独立だと仮定したときに偶然でも生じうる幅（95%）。
      実際には家族は同じ場所に住み、同じ運命をたどりやすいので、偶然の幅はこれより広い。
      下の一覧では、差が<strong>毎年くり返し同じ向きに出ているか</strong>で判定しています（期間は 3 年以上必要）。
      <strong>耳の形</strong>は生死にも好みにも関わらない中立な形質なので、判定が正しく働いているかを確かめる「対照群」です（中立でも 10 年窓の 3% ほどは誤って「差がある」と出ます）。</p>
      <p class="muted small">体色に差が出にくいのは、捕食者が多数派の色を狙う（探索像）せいで、各色の割合が「生存率がつり合う点」に落ち着くから。つり合いが崩れるのは、雪や草の食べ尽くしで地面の色が変わったとき。</p>
      <h3>いま効いている選択（強い順）</h3>
      <div id="sel-summary"></div>`;
    el.querySelector('#sel-trait').addEventListener('change', (e) => {
      this.trait = e.target.value;
      this.update(this.world);
    });
    el.querySelector('#sel-period').addEventListener('change', (e) => {
      this.period = Number(e.target.value);
      this.update(this.world);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-trait]');
      if (!b) return;
      this.trait = b.dataset.trait;
      el.querySelector('#sel-trait').value = this.trait;
      this.update(this.world);
    });
  }

  _records(world) {
    const recs = world.history.map((h) => h.selection).filter(Boolean);
    return this.period ? recs.slice(-this.period) : recs;
  }

  update(world) {
    this.world = world;
    const recs = this._records(world);
    const tableEl = this.el.querySelector('#sel-table');
    if (recs.length === 0) {
      tableEl.innerHTML = '<p class="muted small">1 年経つと表示されます。</p>';
      this.el.querySelector('#sel-summary').innerHTML = '';
      return;
    }
    const t = SELECTION_TRAITS[this.trait];
    const rows = survivalRows(mergeSelection(recs, this.trait), t.classes);
    const maxOff = Math.max(0.01, ...rows.map((r) => r.off));
    tableEl.innerHTML = `<table>
      <thead><tr><th>区分</th><th class="num">のべ個体数</th><th>1 年後の生存率</th><th>成体 1 匹あたりの子</th><th>主な死因</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const causes = Object.entries(r.deaths)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([c, v]) => `${DEATH_CAUSES[c] ?? c} ${pct(v / Math.max(1, r.n))}`)
            .join('、');
          return `<tr>
            <td>${t.names[r.k]}</td>
            <td class="num">${r.n}</td>
            <td>${r.n ? `<div class="bars"><div class="track"><div class="fill" style="width:${r.p * 100}%"></div></div></div>${pct(r.p)} <span class="muted small">±${pct(r.pErr)}</span>` : '<span class="muted">—</span>'}</td>
            <td>${r.adults ? `<div class="bars"><div class="track"><div class="fill alt" style="width:${(r.off / maxOff) * 100}%"></div></div></div>${r.off.toFixed(2)} <span class="muted small">±${r.offErr.toFixed(2)}</span>` : '<span class="muted">—</span>'}</td>
            <td class="small">${causes || '<span class="muted">—</span>'}</td>
          </tr>`;
        })
        .join('')}</tbody></table>`;

    const summary = selectionSummary(recs);
    const badge = (s) => {
      if (s.key === 'ear') return '<span class="badge">対照（中立）</span>';
      if (s.t === null) return '<span class="badge">期間を長くして判定</span>';
      if (s.t > SELECTION_T) return '<span class="badge gene">毎年安定して差がある</span>';
      if (s.t > SELECTION_HINT_T) return '<span class="badge">弱い傾向（偶然かもしれない）</span>';
      return '<span class="badge">偶然の範囲</span>';
    };
    this.el.querySelector('#sel-summary').innerHTML = summary.length
      ? `<table><tbody>${summary
          .map(
            (s) => `<tr><td><button type="button" class="link" data-trait="${s.key}">${s.tr.label}</button></td>
            <td class="small">${s.tr.names[s.best.k]} ${pct(s.best.p)} ＞ ${s.tr.names[s.worst.k]} ${pct(s.worst.p)}</td>
            <td>${badge(s)}</td></tr>`,
          )
          .join('')}</tbody></table>
        <p class="muted small">生存率の差はたいてい数ポイントで、年によって向きも変わる（捕食者が多い色を狙う、寒い時代と暖かい時代で有利な毛皮が逆になる…）。10 年では見分けにくい小さな差も、期間を「全期間」にすると見えてくることが多い。現実の野外研究でも、自然選択を確かめるには何十年分もの記録がいる。</p>`
      : '<p class="muted small">個体数が少なく、まだ比べられません。</p>';
  }
}
