// 家系図と血縁係数（kinship）。
// 近交係数 F(子) = 血縁係数 φ(父, 母)。
// 古すぎる祖先（cutoffTick より前に生まれた個体）は無関係な創始者として扱い、計算量を抑える。

export class Pedigree {
  constructor() {
    this.records = new Map();
    this.memo = new Map();
    this.cutoffTick = -Infinity;
  }

  add(individual) {
    this.records.set(individual.id, individual);
  }

  get(id) {
    return id == null ? undefined : this.records.get(id);
  }

  _rec(id) {
    const r = this.records.get(id);
    if (!r || r.birthTick < this.cutoffTick) return null;
    return r;
  }

  kinship(a, b) {
    if (a == null || b == null) return 0;
    if (a === b) {
      const r = this._rec(a);
      return 0.5 * (1 + (r ? r.F : 0));
    }
    // 親の ID は必ず子より小さいので、大きい方（若い方）を親へさかのぼる
    const x = a > b ? a : b;
    const y = a > b ? b : a;
    const key = `${x},${y}`;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const r = this._rec(x);
    let v = 0;
    if (r && r.fatherId != null && r.motherId != null) {
      v = 0.5 * (this.kinship(r.fatherId, y) + this.kinship(r.motherId, y));
    }
    this.memo.set(key, v);
    return v;
  }

  // 家系図のために記録はすべて残すが、cutoffTick より前に生まれた死亡個体はゲノムを捨てて軽くする。
  // 血縁係数の計算では、それより古い祖先は無関係な創始者として扱う。
  prune(cutoffTick) {
    this.cutoffTick = cutoffTick;
    for (const r of this.records.values()) {
      if (!r.alive && r.birthTick < cutoffTick && r.genome) r.genome = null;
    }
    this.memo.clear();
  }
}
