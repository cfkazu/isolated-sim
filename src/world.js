// 島のシミュレーション本体。1 ステップ = 1 か月。

import { createRng } from './rng.js';
import { LOCI, randomGenome, makeGamete, fertilize, express } from './genes.js';
import { generateIsland, TERRAIN } from './island.js';
import { Pedigree } from './pedigree.js';
import { alleleFrequencies, heterozygosity, phenotypeSummary } from './stats.js';

export const DEFAULTS = {
  seed: 'island',
  initialCount: 100,
  carryingCapacity: 250, // 島の食料で養える体格合計の目安
  maxAgeYears: 15, // この年齢で必ず死ぬ
  maturityMonths: 24,
  mutationRate: 0.0005, // 1 配偶子・1 遺伝子座あたり
  predation: 1.0,
  glowPreference: 1.0, // メスが発光オスを好む強さ（性選択）
  inbreedingAvoidance: false,
  randomEvents: true,
  pedigreeYears: 40,
};

export const DEATH_CAUSES = {
  age: '寿命（15歳）',
  starvation: '飢え',
  predation: '捕食',
  climate: '寒さ・暑さ',
  disease: '病気',
  genetic: '遺伝病',
  accident: '事故など',
  storm: '災害',
};

export const MONTH_LABEL = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const BREEDING_MONTHS = new Set([2, 3, 4, 5]);
const SEASON_FOOD = [0.6, 0.6, 0.8, 1.1, 1.3, 1.35, 1.25, 1.2, 1.1, 1.0, 0.8, 0.7];

// 背景に対する目立ちやすさ（捕食のされやすさ）
export const VISIBILITY = {
  [TERRAIN.BEACH]: { black: 0.9, green: 0.7, white: 0.35 },
  [TERRAIN.GRASS]: { black: 0.75, green: 0.3, white: 0.9 },
  [TERRAIN.FOREST]: { black: 0.4, green: 0.3, white: 1.0 },
  [TERRAIN.ROCK]: { black: 0.45, green: 0.8, white: 0.7 },
  snow: { black: 1.0, green: 0.9, white: 0.15 },
};

export class World {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.rng = createRng(this.opts.seed);
    this.island = generateIsland(this.rng);
    this.pedigree = new Pedigree();
    this.tick = 0;
    this.nextId = 1;
    this.creatures = [];
    this.history = [];
    this.log = [];
    this.climateOffset = 0;
    this.climateTarget = 0;
    this.coldEraYears = 0;
    this.epidemicMonths = 0;
    this.famineMonths = 0;
    this.yearNoise = 0;
    this.extinct = false;
    this.warnedOneSex = false;
    this._resetCounters();

    const n = this.opts.initialCount;
    for (let k = 0; k < n; k++) {
      const sex = k % 2 === 0 ? 'F' : 'M';
      const pos = this.island.randomLand(this.rng);
      this._spawn({
        sex,
        genome: randomGenome(sex, this.rng),
        ...pos,
        age: 12 + this.rng.int(84),
        fatherId: null,
        motherId: null,
        F: 0,
        gen: 0,
        founder: true,
      });
    }
    this._updateEnvironment();
    this.alleleStatus = {};
    this._recordYear();
    this.addLog(`🏝️ ${n} 匹の生物が島に閉じ込められた。`);
  }

  get year() {
    return Math.floor(this.tick / 12);
  }

  get month() {
    return this.tick % 12;
  }

  get temperature() {
    return this.currentTemp;
  }

  addLog(text, kind = 'info') {
    this.log.push({ tick: this.tick, text, kind });
    if (this.log.length > 400) this.log.shift();
  }

  _resetCounters() {
    this.counters = {
      births: 0,
      stillborn: 0,
      deaths: Object.fromEntries(Object.keys(DEATH_CAUSES).map((k) => [k, 0])),
      matings: 0,
      inbredBirths: 0,
    };
  }

  _spawn({ sex, genome, x, y, age, fatherId, motherId, F, gen, founder = false }) {
    const pheno = express(genome);
    // 体格は遺伝だけでなく環境（栄養状態など）でもばらつく
    pheno.size = Math.max(0.6, Math.min(1.4, pheno.size * (1 + 0.04 * this.rng.normal())));
    const c = {
      id: this.nextId++,
      sex,
      genome,
      pheno,
      x,
      y,
      px: x,
      py: y,
      age,
      birthTick: this.tick - age,
      fatherId,
      motherId,
      F,
      gen,
      founder,
      alive: true,
      lastBredYear: -1,
      offspring: 0,
      deathTick: null,
      cause: null,
    };
    this.creatures.push(c);
    this.pedigree.add(c);
    return c;
  }

  _kill(c, cause) {
    c.alive = false;
    c.deathTick = this.tick;
    c.cause = cause;
    this.counters.deaths[cause]++;
  }

  _updateEnvironment() {
    const m = this.month;
    this.currentTemp = 14 + this.climateOffset + this.yearNoise - 10 * Math.cos((2 * Math.PI * m) / 12);
    // 雪線：これより標高が高い場所は雪に覆われる
    this.snowLine = 0.35 + this.currentTemp / 20;
  }

  isSnowAt(x, y) {
    const t = this.island.terrainAt(x, y);
    return t !== TERRAIN.BEACH && this.island.elevationAt(x, y) > this.snowLine;
  }

  visibility(c) {
    const t = this.isSnowAt(c.x, c.y) ? 'snow' : this.island.terrainAt(c.x, c.y);
    const table = VISIBILITY[t] || VISIBILITY[TERRAIN.GRASS];
    let v = table[c.pheno.color];
    if (c.pheno.glow) v += 0.45;
    return v;
  }

  // 1 か月進める
  step() {
    if (this.extinct) return;
    this._updateEnvironment();
    const T = this.currentTemp;
    const rng = this.rng;
    const o = this.opts;
    const maxAge = o.maxAgeYears * 12;

    let demand = 0;
    for (const c of this.creatures) demand += c.age < 12 ? c.pheno.size * 0.5 : c.pheno.size;
    const food = o.carryingCapacity * SEASON_FOOD[this.month] * (this.famineMonths > 0 ? 0.45 : 1);
    const hunger = demand > 0 ? Math.max(0, 1 - food / demand) : 0;
    this.hunger = hunger;
    const epidemic = this.epidemicMonths > 0;

    const causes = ['starvation', 'predation', 'climate', 'disease', 'genetic', 'accident'];
    const h = new Array(causes.length);
    for (const c of this.creatures) {
      c.px = c.x;
      c.py = c.y;
      c.age++;
      if (c.age >= maxAge) {
        this._kill(c, 'age');
        continue;
      }
      const ph = c.pheno;
      // 飢え：体が大きいほど多く食べる必要がある
      h[0] = 0.45 * hunger * ph.size * ph.size;
      // 捕食：目立つほど、小さいほど狙われる
      h[1] = 0.009 * o.predation * this.visibility(c) * (1.35 - 0.35 * ph.size) * (c.age < 12 ? 1.6 : 1);
      // 気候：毛皮と体格で最適温度が変わる（ベルクマンの法則）
      const topt = 22 - 22 * ph.fur - 8 * (ph.size - 1);
      const excess = Math.max(0, Math.abs(T - topt) - 9);
      h[2] = 0.0022 * Math.pow(excess, 1.4);
      // 病気：免疫型（超優性）
      const vuln = 1 - ph.resistance;
      h[3] = epidemic ? 0.16 * vuln * vuln : 0.004 * vuln;
      // 遺伝病：劣性有害遺伝子のホモ接合
      h[4] = 0.014 * ph.load;
      // その他（幼体・老体ほど高い）
      h[5] = 0.003 + (c.age < 12 ? 0.012 : 0) + (c.age > 120 ? 0.004 : 0);

      let total = 0;
      for (const v of h) total += v;
      if (rng.next() < total) {
        this._kill(c, causes[rng.weightedIndex(h)]);
        continue;
      }
      this._move(c);
    }

    if (BREEDING_MONTHS.has(this.month)) this._breed(demand);

    this.creatures = this.creatures.filter((c) => c.alive);
    if (this.epidemicMonths > 0) this.epidemicMonths--;
    if (this.famineMonths > 0) this.famineMonths--;

    this.tick++;
    if (this.tick % 12 === 0) this._endYear();
    this._checkExtinction();
  }

  _move(c) {
    const step = c.age < 6 ? 0.004 : 0.009;
    for (let t = 0; t < 4; t++) {
      const a = this.rng.next() * Math.PI * 2;
      const nx = c.x + Math.cos(a) * step;
      const ny = c.y + Math.sin(a) * step * (4 / 3);
      if (this.island.isLand(nx, ny)) {
        c.x = nx;
        c.y = ny;
        return;
      }
    }
  }

  _breed(demand) {
    const o = this.opts;
    const rng = this.rng;
    const males = this.creatures.filter((c) => c.alive && c.sex === 'M' && c.age >= o.maturityMonths);
    if (males.length === 0) return;
    const density = demand / o.carryingCapacity;
    const lambda = 1.5 * Math.max(0, 1.2 - density);
    const females = this.creatures.filter(
      (c) => c.alive && c.sex === 'F' && c.age >= o.maturityMonths && c.lastBredYear !== this.year,
    );
    for (const f of females) {
      if (rng.next() > 0.45) continue;
      const mate = this._chooseMate(f, males);
      if (!mate) continue;
      f.lastBredYear = this.year;
      this.counters.matings++;
      const F = this.pedigree.kinship(f.id, mate.id);
      const litter = Math.min(4, 1 + rng.poisson(lambda));
      let born = 0;
      for (let k = 0; k < litter; k++) {
        const egg = makeGamete(f.genome, 'F', rng, o.mutationRate);
        const sperm = makeGamete(mate.genome, 'M', rng, o.mutationRate);
        const z = fertilize(egg, sperm);
        if (express(z.genome).lethal) {
          this.counters.stillborn++;
          continue;
        }
        let x = f.x + (rng.next() - 0.5) * 0.01;
        let y = f.y + (rng.next() - 0.5) * 0.01;
        if (!this.island.isLand(x, y)) {
          x = f.x;
          y = f.y;
        }
        this._spawn({
          sex: z.sex,
          genome: z.genome,
          x,
          y,
          age: 0,
          fatherId: mate.id,
          motherId: f.id,
          F,
          gen: Math.max(f.gen, mate.gen) + 1,
        });
        born++;
      }
      f.offspring += born;
      mate.offspring += born;
      this.counters.births += born;
      if (F >= 0.125) this.counters.inbredBirths += born;
    }
  }

  _chooseMate(f, males) {
    const o = this.opts;
    const R2 = 0.14 * 0.14;
    let candidates = males.filter((m) => {
      const dx = m.x - f.x;
      const dy = (m.y - f.y) * 0.75;
      return dx * dx + dy * dy < R2;
    });
    if (candidates.length === 0) {
      // 近くに相手がいない：遠くまで探しに行けるのはたまに（低密度での繁殖の難しさ＝アリー効果）
      if (this.rng.next() > 0.35) return null;
      candidates = males;
    }
    const weights = candidates.map((m) => {
      if (o.inbreedingAvoidance && this.pedigree.kinship(f.id, m.id) >= 0.125) return 0;
      let w = m.pheno.size * m.pheno.size;
      if (m.pheno.glow) w *= 1 + 0.8 * o.glowPreference;
      return w;
    });
    const i = this.rng.weightedIndex(weights);
    return i < 0 ? null : candidates[i];
  }

  _endYear() {
    this._recordYear();
    this._milestones();
    this._resetCounters();
    if (this.opts.randomEvents) this._randomEvents();

    // 気候：寒冷期に向けてゆっくり変化
    if (this.coldEraYears > 0) {
      this.coldEraYears--;
      if (this.coldEraYears === 0) {
        this.climateTarget = 0;
        this.addLog('☀️ 寒冷期が終わり、気候が戻りはじめた。', 'event');
      }
    }
    const d = this.climateTarget - this.climateOffset;
    this.climateOffset += Math.sign(d) * Math.min(Math.abs(d), 1.5);
    this.yearNoise = this.rng.normal() * 1.2;

    this.pedigree.prune(this.tick - this.opts.pedigreeYears * 12);
  }

  _milestones() {
    const h = this.history.at(-1);
    const he0 = this.history[0].He || 1;
    if (h.year % 50 === 0 && h.pop > 0) {
      this.addLog(`📜 ${h.year}年目の記録：${h.pop} 匹、遺伝的多様性 ${Math.round((h.He / he0) * 100)}%、平均近交係数 ${h.meanF.toFixed(3)}。`);
    }
    const prev = this.history.at(-2);
    if (prev && prev.pop >= 30 && h.pop > 0 && h.pop < 30) this.addLog(`⚠️ 個体数が ${h.pop} 匹まで減った。絶滅の危機！`, 'bad');
  }

  _randomEvents() {
    const r = this.rng;
    if (r.chance(0.06)) this.triggerEpidemic();
    if (r.chance(0.05)) this.triggerFamine();
    if (this.coldEraYears === 0 && r.chance(0.012)) this.triggerColdEra();
    if (r.chance(0.015)) this.triggerStorm();
  }

  triggerEpidemic() {
    this.epidemicMonths = 5;
    this.addLog('🦠 疫病が流行しはじめた（免疫型ヘテロ A/B が有利）。', 'event');
  }

  triggerFamine() {
    this.famineMonths = 12;
    this.addLog('🥀 不作の年。食料が半分以下に（大きな個体ほど苦しい）。', 'event');
  }

  triggerColdEra() {
    this.coldEraYears = 25 + this.rng.int(40);
    this.climateTarget = -12;
    this.addLog(`❄️ 寒冷期に突入（約${this.coldEraYears}年）。島が雪に覆われていく…`, 'event');
  }

  triggerStorm() {
    let killed = 0;
    const rate = 0.25 + this.rng.next() * 0.2;
    for (const c of this.creatures) {
      if (this.rng.next() < rate) {
        this._kill(c, 'storm');
        killed++;
      }
    }
    this.creatures = this.creatures.filter((c) => c.alive);
    this.addLog(`🌀 大嵐が島を襲い、${killed} 匹が死んだ（ボトルネック）。`, 'event');
    this._checkExtinction();
  }

  addCastaways(n = 6) {
    for (let k = 0; k < n; k++) {
      const sex = k % 2 === 0 ? 'F' : 'M';
      const pos = this.island.randomLand(this.rng, (t) => t === TERRAIN.BEACH);
      this._spawn({
        sex,
        genome: randomGenome(sex, this.rng),
        ...pos,
        age: 24 + this.rng.int(36),
        fatherId: null,
        motherId: null,
        F: 0,
        gen: 0,
        founder: true,
      });
    }
    this.extinct = false;
    this.warnedOneSex = false;
    this.addLog(`🛶 ${n} 匹の漂着者が流れ着いた（遺伝子流入）。`, 'event');
  }

  _checkExtinction() {
    if (this.creatures.length === 0 && !this.extinct) {
      this.extinct = true;
      this.addLog(`💀 ${this.year}年目、最後の1匹が死に、島の生物は絶滅した。`, 'bad');
      return;
    }
    const hasM = this.creatures.some((c) => c.sex === 'M');
    const hasF = this.creatures.some((c) => c.sex === 'F');
    if (this.creatures.length > 0 && (!hasM || !hasF) && !this.warnedOneSex) {
      this.warnedOneSex = true;
      this.addLog(`⚠️ ${hasM ? 'オス' : 'メス'}しか残っていない。このままでは絶滅する…`, 'bad');
    }
  }

  _recordYear() {
    const cs = this.creatures;
    const freqs = alleleFrequencies(cs);
    const { Ho, He } = heterozygosity(cs, freqs);
    const pheno = phenotypeSummary(cs);
    let sumF = 0;
    let males = 0;
    for (const c of cs) {
      sumF += c.F;
      if (c.sex === 'M') males++;
    }
    const rec = {
      year: this.year,
      pop: cs.length,
      males,
      females: cs.length - males,
      births: this.counters.births,
      stillborn: this.counters.stillborn,
      inbredBirths: this.counters.inbredBirths,
      deaths: { ...this.counters.deaths },
      meanF: cs.length ? sumF / cs.length : 0,
      Ho,
      He,
      freqs: Object.fromEntries(Object.entries(freqs).map(([k, v]) => [k, v.freq])),
      pheno,
      climate: this.climateOffset,
    };
    this.history.push(rec);
    if (this.history.length === 1) {
      for (const l of LOCI) for (const a of l.alleles) this.alleleStatus[`${l.key}:${a}`] = rec.freqs[l.key][a] > 0 ? 'present' : 'lost';
    } else if (cs.length > 0) this._detectFixation(rec.freqs);
  }

  // 対立遺伝子の消失・固定・復活をログに残す。突然変異で一瞬だけ現れたものは数えず、5% を超えたら「復活」とする。
  _detectFixation(freqs) {
    for (const l of LOCI) {
      for (const a of l.alleles) {
        const k = `${l.key}:${a}`;
        const f = freqs[l.key][a];
        const label = l.labels?.[a] ? `${a}（${l.labels[a]}）` : a;
        const status = this.alleleStatus[k];
        if (f === 0 && status === 'present') {
          this.alleleStatus[k] = 'lost';
          const rest = l.alleles.filter((b) => freqs[l.key][b] > 0);
          const tail = rest.length === 1 ? `残る ${rest[0]} が固定された。` : '';
          this.addLog(`🧬 ${l.name}の対立遺伝子 ${label} が島から消えた。${tail}`, 'gene');
        } else if (f >= 0.05 && status === 'lost') {
          this.alleleStatus[k] = 'present';
          this.addLog(`🧬 一度消えた ${l.name}の ${label} が突然変異や漂着で復活し、5% を超えた。`, 'gene');
        }
      }
    }
  }
}
