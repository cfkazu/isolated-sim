// 家系図タブ。選んだ個体を中心に、上に親と祖父母、下に子（相手ごと）を並べる。
// 親族をクリックするとその個体を中心に描き直すので、創始者までさかのぼることも、今の子孫まで下ることもできる。

import { drawCreature } from './creatureArt.js';

const DUP_COLORS = ['#e0457b', '#2a9d8f', '#e9a23b', '#6c63d9', '#3a86ff', '#d1495b'];
const DEPTH_FOR_DUPLICATES = 8;

const yearOf = (tick) => Math.floor(tick / 12);
const sexSym = (s) => (s === 'F' ? '♀' : '♂');

export class FamilyTree {
  constructor(el, onSelect) {
    this.el = el;
    this.onSelect = onSelect;
    this.history = [];
    this.focusId = null;
    this.showAllChildren = false;
    el.addEventListener('click', (e) => {
      const node = e.target.closest('[data-focus]');
      if (node) {
        this.go(Number(node.dataset.focus));
        return;
      }
      const act = e.target.closest('[data-tree]')?.dataset.tree;
      if (act === 'back' && this.history.length) {
        this.focusId = this.history.pop();
        this.onSelect(this.focusId);
        this.render(this.world);
      } else if (act === 'founders') {
        if (this.focusId != null) this.history.push(this.focusId);
        this.focusId = null;
        this.render(this.world);
      } else if (act === 'more') {
        this.showAllChildren = true;
        this.render(this.world);
      }
    });
    window.addEventListener('resize', () => this._drawLines());
  }

  reset() {
    this.history = [];
    this.focusId = null;
    this.world = null;
  }

  go(id) {
    if (id === this.focusId) return;
    if (this.focusId != null) this.history.push(this.focusId);
    if (this.history.length > 50) this.history.shift();
    this.focusId = id;
    this.showAllChildren = false;
    this.onSelect(id);
    this.render(this.world);
  }

  // 地図などで別の個体が選ばれたとき
  setFocus(id) {
    if (id === this.focusId) return false;
    if (this.focusId != null && id != null) this.history.push(this.focusId);
    this.focusId = id;
    this.showAllChildren = false;
    return true;
  }

  _node(r, role, { big = false, dup = null } = {}) {
    if (!r) {
      return `<div class="tnode empty"><div class="trole">${role}</div><div class="muted small">${role === '父' || role === '母' ? '創始者' : '—'}</div></div>`;
    }
    const life = r.alive ? `${yearOf(r.birthTick)}年生・存命` : `${yearOf(r.birthTick)}〜${yearOf(r.deathTick)}年`;
    const ring = dup ? ` style="--dup:${dup.color}"` : '';
    const up = r.fatherId != null || r.motherId != null ? '▲' : '';
    return `<button type="button" class="tnode${big ? ' big' : ''}${r.alive ? '' : ' dead'}${dup ? ' dup' : ''}" data-focus="${r.id}" data-node="${r.id}"${ring}>
      <div class="trole">${role}${dup ? ` <span class="dupmark">×${dup.count}</span>` : ''}</div>
      <canvas class="tart" data-art="${r.id}" width="${big ? 120 : 64}" height="${big ? 80 : 42}"></canvas>
      <div class="tname">${sexSym(r.sex)} ${r.name}</div>
      <div class="tsub">${r.clan}家</div>
      <div class="tsub">${life}</div>
      <div class="tsub">${up ? '▲ 親あり・' : '創始者・'}子 ${r.children.length}</div>
    </button>`;
  }

  // 祖先を DEPTH 世代さかのぼり、2 回以上現れる個体（家系の重なり）を数える
  _duplicates(ped, id) {
    const count = new Map();
    const walk = (x, d) => {
      const r = ped.get(x);
      if (!r || d > DEPTH_FOR_DUPLICATES) return;
      for (const p of [r.fatherId, r.motherId]) {
        if (p == null) continue;
        count.set(p, (count.get(p) || 0) + 1);
        walk(p, d + 1);
      }
    };
    walk(id, 1);
    const dups = [...count.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    const out = new Map();
    dups.forEach(([pid, n], i) => out.set(pid, { count: n, color: DUP_COLORS[i % DUP_COLORS.length] }));
    return out;
  }

  _livingDescendants(ped, id) {
    const seen = new Set();
    let alive = 0;
    const stack = [...(ped.get(id)?.children ?? [])];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      const r = ped.get(x);
      if (!r) continue;
      if (r.alive) alive++;
      stack.push(...r.children);
    }
    return { total: seen.size, alive };
  }

  render(world) {
    this.world = world;
    if (!world) return;
    const ped = world.pedigree;
    const f = ped.get(this.focusId);
    const back = this.history.length ? '<button type="button" data-tree="back">◀ 戻る</button>' : '';
    if (!f) {
      this._renderFounders(world, back);
      return;
    }
    const father = ped.get(f.fatherId);
    const mother = ped.get(f.motherId);
    const gp = (p) => (p ? [ped.get(p.fatherId), ped.get(p.motherId)] : [null, null]);
    const [ff, fm] = gp(father);
    const [mf, mm] = gp(mother);
    const dups = this._duplicates(ped, f.id);
    const nodeOf = (r, role, opts = {}) => this._node(r, role, { ...opts, dup: r ? dups.get(r.id) : null });

    // 子を相手ごとにまとめる
    const groups = new Map();
    for (const cid of f.children) {
      const ch = ped.get(cid);
      if (!ch) continue;
      const mate = f.sex === 'F' ? ch.fatherId : ch.motherId;
      if (!groups.has(mate)) groups.set(mate, []);
      groups.get(mate).push(ch);
    }
    const LIMIT = 24;
    let shown = 0;
    const groupHtml = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([mateId, kids]) => {
        const mate = ped.get(mateId);
        const visible = this.showAllChildren ? kids : kids.slice(0, Math.max(0, LIMIT - shown));
        shown += visible.length;
        if (visible.length === 0) return '';
        return `<div class="tgroup">
          <div class="tmate">× ${mate ? `<button type="button" class="link" data-focus="${mate.id}">${sexSym(mate.sex)} ${mate.clan}家の${mate.name}</button>` : '不明'}（子 ${kids.length}）</div>
          <div class="trow wrap" data-row="children">${visible.map((k) => nodeOf(k, `${yearOf(k.birthTick)}年生`)).join('')}</div>
        </div>`;
      })
      .join('');
    const hidden = f.children.length - shown;
    const desc = this._livingDescendants(ped, f.id);
    const dupList = [...dups.entries()]
      .slice(0, 6)
      .map(([pid, d]) => {
        const r = ped.get(pid);
        return `<button type="button" class="dupchip" style="--dup:${d.color}" data-focus="${pid}">${r ? `${r.clan}家の${r.name}` : `#${pid}`} ×${d.count}</button>`;
      })
      .join('');

    this.el.innerHTML = `
      <div class="btn-row">${back}<button type="button" data-tree="founders">最初の百匹へ</button></div>
      <p class="small">${f.clan}家の${f.name}（${sexSym(f.sex)}）の子孫は、これまでに ${desc.total} 匹、いま ${desc.alive} 匹が生きています。
      親族をクリックすると、その個体を中心に描き直します（▲ は親がいる印）。</p>
      ${
        dups.size
          ? `<p class="small">家系の重なり：${DEPTH_FOR_DUPLICATES} 世代以内に同じ祖先が何度も現れます（近親婚のしるし）。同じ色の枠が同じ個体です。</p><div class="duplist">${dupList}</div>`
          : ''
      }
      <div class="tree" id="tree">
        <svg class="tlines" aria-hidden="true"></svg>
        <div class="tgen-label">祖父母</div>
        <div class="trow gp">
          <div class="tpair" data-pair="fp">${nodeOf(ff, '父方の祖父')}${nodeOf(fm, '父方の祖母')}</div>
          <div class="tpair" data-pair="mp">${nodeOf(mf, '母方の祖父')}${nodeOf(mm, '母方の祖母')}</div>
        </div>
        <div class="tgen-label">親</div>
        <div class="trow" data-row="parents"><div class="tpair" data-pair="p">${nodeOf(father, '父')}${nodeOf(mother, '母')}</div></div>
        <div class="tgen-label">本人</div>
        <div class="trow" data-row="self">${this._node(f, '本人', { big: true })}</div>
        ${groups.size ? `<div class="tgen-label">子（相手ごと）</div>${groupHtml}` : '<p class="muted small center">子はいません。</p>'}
        ${hidden > 0 ? `<div class="center"><button type="button" data-tree="more">残り ${hidden} 匹の子も表示</button></div>` : ''}
      </div>`;
    this._paint(ped);
    requestAnimationFrame(() => this._drawLines());
  }

  _renderFounders(world, back) {
    const ped = world.pedigree;
    // 生きている個体の「創始者由来の割合」に名前が載っていれば、その創始者の子孫。
    // 何十年も経つと、ほぼ全員がほぼ全創始者の子孫になる（家系上の祖先）。
    // そこで並びは「今の島の遺伝子のうち、その創始者に由来する割合」（遺伝上の寄与）で決める。
    const aliveDesc = new Map();
    const share = new Map();
    for (const c of world.creatures) {
      for (const [id, v] of Object.entries(c.lineage ?? {})) {
        aliveDesc.set(Number(id), (aliveDesc.get(Number(id)) || 0) + 1);
        share.set(Number(id), (share.get(Number(id)) || 0) + v);
      }
    }
    const n = Math.max(1, world.creatures.length);
    const founders = [...ped.records.values()].filter((r) => r.founder);
    const rows = founders
      .map((r) => ({
        r,
        alive: r.alive ? (aliveDesc.get(r.id) || 1) - 1 : aliveDesc.get(r.id) || 0,
        share: (share.get(r.id) || 0) / n,
      }))
      .sort((a, b) => b.share - a.share || b.r.children.length - a.r.children.length);
    this.el.innerHTML = `
      <div class="btn-row">${back}</div>
      <p class="small">島に閉じ込められた最初の個体たち（と漂着者）。今の島の遺伝子のうち、その個体に由来する割合が大きい順です。クリックすると家系を下っていけます。</p>
      <p class="muted small">何十年も経つと、ほとんどの創始者が島のほぼ全員の祖先になります。それでも受け継がれた遺伝子の量には大きな差があります。</p>
      <div class="trow wrap">${rows
        .map(
          ({ r, alive, share }) => `<button type="button" class="tnode${alive ? '' : ' dead'}" data-focus="${r.id}">
            <canvas class="tart" data-art="${r.id}" width="64" height="42"></canvas>
            <div class="tname">${sexSym(r.sex)} ${r.name}</div>
            <div class="tsub">${alive ? `遺伝子 ${(share * 100).toFixed(1)}%` : '系統は途絶えた'}</div>
            <div class="tsub">${alive ? `子孫 ${alive} 匹` : ''}</div>
          </button>`,
        )
        .join('')}</div>`;
    this._paint(ped);
  }

  _paint(ped) {
    for (const cv of this.el.querySelectorAll('canvas[data-art]')) {
      const r = ped.get(Number(cv.dataset.art));
      if (r) drawCreature(cv, r, Number(cv.getAttribute('width')), Number(cv.getAttribute('height')));
    }
  }

  // 世代のあいだを線でつなぐ（親の組の中点 → 子）
  _drawLines() {
    const tree = this.el.querySelector('#tree');
    const svg = tree?.querySelector('.tlines');
    if (!tree || !svg || tree.offsetParent === null) return;
    const box = tree.getBoundingClientRect();
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', tree.scrollHeight);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, top: r.top - box.top, bottom: r.bottom - box.top };
    };
    const lines = [];
    const link = (fromEls, toEl) => {
      const from = fromEls.filter(Boolean).map(rect);
      if (!from.length || !toEl) return;
      const to = rect(toEl);
      const x = from.reduce((a, b) => a + b.x, 0) / from.length;
      const y0 = Math.max(...from.map((f) => f.bottom));
      const mid = (y0 + to.top) / 2;
      if (from.length === 2) lines.push(`M${from[0].x},${y0}V${mid - 6}H${from[1].x}V${y0}`);
      lines.push(`M${x},${from.length === 2 ? mid - 6 : y0}V${mid}H${to.x}V${to.top}`);
    };
    const pairEls = (name) => [...tree.querySelectorAll(`[data-pair="${name}"] > .tnode`)];
    const parents = pairEls('p');
    link(pairEls('fp'), parents[0]);
    link(pairEls('mp'), parents[1]);
    const self = tree.querySelector('[data-row="self"] > .tnode');
    link(parents, self);
    for (const row of tree.querySelectorAll('[data-row="children"]')) {
      const header = row.previousElementSibling;
      link([self], header);
    }
    svg.innerHTML = `<path d="${lines.join('')}" fill="none" stroke="var(--text-3)" stroke-width="1.5" />`;
  }
}
