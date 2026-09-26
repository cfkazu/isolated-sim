// 島のシミュレーション本体。1 ステップ = 1 か月。

import { createRng } from './rng.js';
import { LOCI, randomGenome, makeGamete, fertilize, express, setFreqs } from './genes.js';
import { generateIsland, TERRAIN } from './island.js';
import { Pedigree } from './pedigree.js';
import { makeName } from './names.js';
import {
  alleleFrequencies,
  heterozygosity,
  phenotypeSummary,
  sexualSelectionStats,
  selectionStats,
  founderShares,
  islandStats,
} from './stats.js';
import { makeHighlights, DIGEST_YEARS } from './highlights.js';
import { SCENARIOS, groupOf, scenarioOf, expandFreqs } from './scenarios.js';
import { Vegetation, BODY_RGB, contrast, groundAt, predationHazards, PREDATOR } from './ecology.js';

export const DEFAULTS = {
  scenario: 'free',
  scenarioData: null, // 自作シナリオの中身（scenario は 'custom'）
  seed: 'island',
  initialCount: 100,
  fertility: 1.0, // 草の育ちやすさ（島の豊かさ）
  islandShape: 'single', // 島の形：'single'（ひとつの島）・'islets'（離島のある島）・'archipelago'（群島）
  geology: 'auto', // 地質：'auto'（シードで決まる）・'lush'・'volcanic'・'coral'
  maxAgeYears: 15, // この年齢で必ず死ぬ
  maturityMonths: 24,
  mutationRate: 0.0005, // 1 配偶子・1 遺伝子座あたり
  initialPredators: 6,
  searchImage: 2, // 探索像の強さ k（1 なら色の多さに関係なく見つけやすさだけで狙う）
  inbreedingAvoidance: false,
  randomEvents: true,
  climateCycleYears: 600, // 氷期から次の氷期までの年数
  climateAmplitude: 'realistic', // 気候の振れ幅：'realistic'（現実寄り）か 'dramatic'（ドラマ寄り）
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
  sea: '海（漂流・水没）',
};

export const MONTH_LABEL = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const BREEDING_MONTHS = new Set([2, 3, 4, 5]);
// 換毛する個体が白い冬毛になる月（12〜2 月）
const WINTER_COAT_MONTHS = new Set([11, 0, 1]);
// アルビノは目が弱く、相手と出会う距離がこの割合に縮む
const ALBINO_SIGHT = 0.6;
// 相手と出会う距離のめやす（島の幅に対する割合）。ふだん歩き回る範囲（縄張り）と同じくらい
const MATE_REACH = 0.05;
// 近くで相手に出会えなかったメスが、遠くまで探しに行く確率（1 か月あたり）
const FAR_SEARCH = 0.35;
// 警戒声：鳴いた本人は目立つ（見つけやすさ × (1 + ALARM_COST)）。知らされた周りの個体は隠れる（× (1 − ALARM_BENEFIT)）。
// 声が届くのは、同じ草のマスとその隣のマス（おおよそ島の幅の 2.5〜6%）
const ALARM_COST = 0.3;
const ALARM_BENEFIT = 0.5;
// ミトコンドリアの突然変異率（1 回の出生あたり）。母系の新しい系統（分家）の芽になる
const MT_MUTATION_RATE = 1 / 40;
// 分家の芽が、生きている個体がこの数に育ったら家として名前を付ける
const BRANCH_NAMED_AT = 10;
// 家の断絶を年代記に書くのは、最盛期にこの数以上いた家だけ
const CLAN_LOG_PEAK = 40;

// 気候の大きな波（氷期と間氷期）の振れ幅（今の気温との差、℃）。
// 地球と同じく寒い側に大きく、暖かい側に小さく振れる（最終氷期は今より 4〜7℃ 低く、前の間氷期は 1〜2℃ 高かった）
export const CLIMATE_AMPLITUDE = {
  realistic: { cold: -6, warm: 1.5, label: '現実寄り' },
  dramatic: { cold: -8, warm: 3, label: 'ドラマ寄り' },
};
// 1 周期のうち、ゆっくり冷えていく割合（残りで急に暖まる。のこぎり形）
const COOLING_SHARE = 0.8;
// これより寒い気温には、どの出来事が重なってもならない
const COLDEST = -16;

// 超寒冷期の気温の下がり幅（℃）。冬は島じゅうが、夏でも山の上は雪に閉ざされる（これ以上寒いとほぼ確実に絶滅する）
const SUPER_COLD_OFFSET = -14;

// 海面の高さ：気温 1℃ の低下で標高 0.01 ぶん海面が下がる（氷床に水が取られる）
const SEA_PER_DEGREE = 0.01;
// 砂浜にいる個体が 1 年のうちに流木で沖へ流される確率
const RAFT_CHANCE_PER_YEAR = 0.05;
// 流木が陸に着かずに漂える距離（マス）
const RAFT_RANGE = 70;

// 1 か月に必要な草の量（体格 1 あたり。幼体は半分）
const FOOD_NEED = 0.11;
// 性選択：好みが最大（1）のメスにとって、飾りが最大のオスは飾りのないオスの何倍魅力的か、から 1 を引いた値
const PREFERENCE_SCALE = 6;
// 旅立ち：遺伝子の値 1 のとき、島の幅のこの割合くらい離れた場所へ移る
const DISPERSAL_RANGE = 0.3;
// 旅の疲れ：島の幅の DISPERSAL_RANGE 分を歩くと、栄養状態がこれだけ下がる
const DISPERSAL_COST = 0.4;
// 満ち足りているときの散歩は、ねぐら（ホームレンジの中心）へこの割合ずつ引き戻される
const HOME_PULL = 0.12;
// ねぐらは今いる場所へ少しずつ移っていく（1 か月あたり）
const HOME_DRIFT = 0.02;
// 好みが最大のメスが相手探しに費やす時間のせいで、その月に繁殖できる確率が何割減るか
const CHOOSINESS_COST = 0.2;

// 正直なシグナル：飾りの見栄えは栄養状態しだい。やせたオスは長い尾を保てず、弱くしか光れない。
export const tailDisplay = (c) => c.pheno.tail * c.condition;
export const glowDisplay = (c) => (c.pheno.glow ? c.condition : 0);

export class World {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    // シナリオの島の設定は、ふだんの設定より優先する
    const sc = scenarioOf(this.opts);
    this.scenario = sc;
    if (sc.opts) Object.assign(this.opts, sc.opts);
    this.rng = createRng(this.opts.seed);
    const geology = this.opts.geology === 'auto' ? this.rng.pick(['lush', 'volcanic', 'coral']) : this.opts.geology;
    this.island = generateIsland(this.rng, {
      shape: this.opts.islandShape,
      geology,
      namer: (id) => `${makeName(this.opts.seed, `isle${id}`)}島`,
    });
    this.pedigree = new Pedigree();
    this.clanNames = new Set();
    // 母系の系統（ミトコンドリアのハプログループ）。id → { id, name, parent, root, founderId, tick, established }
    this.haplos = new Map();
    this.nextHaplo = 1;
    this.clanPeak = new Map(); // 系統 id → { peak, year, gone }
    // 気候 = 大きな波（氷期と間氷期）＋ 数十〜百年の揺らぎ ＋ 出来事（寒冷期・温暖期・超寒冷期）による押し。
    // 島は波の前半（間氷期〜寒冷化）のどこかから始まる
    this.cycleStart = Math.floor(this.rng.next() * 0.5 * this.opts.climateCycleYears);
    if (sc?.climateStart != null) this.cycleStart = Math.floor(sc.climateStart * this.opts.climateCycleYears);
    this.climateWobble = 0;
    this.push = { kind: null, offset: 0, target: 0, years: 0, rate: 1.5 };
    this.climateOffset = this.cycleTemp(0);
    this.climatePhase = this.phaseOf(0);
    this.island.seaLevel = SEA_PER_DEGREE * this.climateOffset;
    this.island.reclassify();
    this.vegetation = new Vegetation(this.island, this.opts.fertility);
    this.predators = this.opts.initialPredators;
    this.hunger = 0;
    this.tick = 0;
    this.nextId = 1;
    this.creatures = [];
    this.history = [];
    this.log = [];
    // 別の種になった島の組 → その年
    this.speciation = {};
    this.epidemicMonths = 0;
    this.famineMonths = 0;
    this.yearNoise = 0;
    this.extinct = false;
    this.warnedOneSex = false;
    this._resetCounters();

    const n = this.opts.initialCount;
    const groupMt = new Map();
    const allFreqs = expandFreqs(sc);
    const groupFreqs = (sc.groups ?? []).map((g) => expandFreqs(g));
    for (let k = 0; k < n; k++) {
      const sex = k % 2 === 0 ? 'F' : 'M';
      const gi = groupOf(sc, k, n);
      const g = gi == null ? null : sc.groups[gi];
      let pos;
      if (g?.place) pos = this._placeNear(g.place);
      else {
        // 離島のある島では、最初の個体は本島だけに置く（小島は無人から始まる）。群島では広さに応じて散らばる
        const main = this.island.landmasses[0]?.id;
        pos = this.opts.islandShape === 'islets' ? this.island.randomLand(this.rng, (t, c) => this.island.landmass[c] === main) : this.island.randomLand(this.rng);
      }
      const genome = randomGenome(sex, this.rng, g?.origin ?? this.rng.int(2));
      setFreqs(genome, allFreqs, this.rng);
      setFreqs(genome, groupFreqs[gi], this.rng);
      const c = this._spawn({
        sex,
        genome,
        ...pos,
        age: 12 + this.rng.int(84),
        fatherId: null,
        motherId: null,
        F: 0,
        gen: 0,
        founder: true,
        mt: g?.clan ? groupMt.get(gi) : undefined,
      });
      if (g?.clan && !groupMt.has(gi)) groupMt.set(gi, c.mt);
    }
    this._updateEnvironment();
    this.alleleStatus = {};
    this.cohort = [];
    this._recordYear();
    this._startCohort();
    this.addLog(`🏝️ ${n} 匹の生物が${this.island.geology.label}に閉じ込められた。いまは${this.climateLabel}の時代（氷期から次の氷期まで約 ${this.opts.climateCycleYears} 年）。`);
    if (sc !== SCENARIOS.free) this.addLog(`📖 シナリオ「${sc.label}」${sc.desc ? `：${sc.desc}` : ''}`, 'event');
    this.addLog('🧭 百匹は東と西の二つの土地から来た。東と西の間の子は、子ができにくいことがある（雑種の不和合）。', 'gene');
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

  addLog(text, kind = 'info', id = null) {
    this.log.push({ tick: this.tick, text, kind, id });
    if (this.log.length > 400) this.log.shift();
  }

  _resetCounters() {
    this.counters = {
      births: 0,
      stillborn: 0,
      infertile: 0,
      dispersals: 0,
      calls: 0,
      warned: 0,
      alarmR: 0,
      alarmPairs: 0,
      dispersers: { M: 0, F: 0 },
      dispersalDist: { M: 0, F: 0 },
      deaths: Object.fromEntries(Object.keys(DEATH_CAUSES).map((k) => [k, 0])),
      matings: 0,
      inbredBirths: 0,
    };
  }

  // シナリオの群れの置き場所：中心 (x, y)・半径 r（島全体を 0〜1 として）の中の陸地。なければ近くの陸地
  _placeNear({ x, y, r }) {
    const isl = this.island;
    const inside = (t, c) => Math.hypot(((c % isl.W) + 0.5) / isl.W - x, ((Math.floor(c / isl.W) + 0.5) / isl.H - y) * 0.75) < r;
    if (isl.landCells.some((c) => inside(null, c))) return isl.randomLand(this.rng, inside);
    return isl.nearestLand(x, y, 40) ?? isl.randomLand(this.rng);
  }

  // 「神の介入」と同じ出来事を起こす（シナリオの出来事にも使う）
  applyEvent(event) {
    switch (event) {
      case 'epidemic':
        return this.triggerEpidemic();
      case 'famine':
        return this.triggerFamine();
      case 'cold':
        return this.push.kind === 'cold' ? this.endClimatePush() : this.triggerColdEra();
      case 'warm':
        return this.push.kind === 'warm' ? this.endClimatePush() : this.triggerWarmEra();
      case 'supercold':
        return this.push.kind === 'super' ? this.endClimatePush() : this.triggerSuperColdEra();
      case 'storm':
        return this.triggerStorm();
      case 'castaway':
        return this.addCastaways(6);
      case 'predators':
        return this.releasePredators(4);
    }
  }

  _spawn({ sex, genome, x, y, age, fatherId, motherId, F, gen, founder = false, mt: mtOverride }) {
    const pheno = express(genome);
    // 体格は遺伝だけでなく環境（栄養状態など）でもばらつく
    pheno.size = Math.max(0.6, Math.min(1.4, pheno.size * (1 + 0.04 * this.rng.normal())));
    const id = this.nextId++;
    const mother = this.pedigree.get(motherId);
    let name = makeName(this.opts.seed, id);
    if (founder) {
      // 創始者の名前はそのまま家名になるので重ならないようにする
      for (let salt = 1; this.clanNames.has(name); salt++) name = makeName(this.opts.seed, id, salt);
      this.clanNames.add(name);
    }
    // 母系の系統は母から子へ（ミトコンドリアと同じ流れ）。創始者は自分の系統を始める。
    // まれにミトコンドリアの突然変異が起き、その子から新しい系統（分家）が始まる。
    let mt = mother?.mt;
    let branchOf = null;
    if (mtOverride != null) {
      // シナリオで同じ家として始める群れ
      mt = mtOverride;
    } else if (founder || mt == null) {
      mt = this._newHaplo({ name, parent: null, founderId: id, established: true });
    } else if (this.rng.next() < MT_MUTATION_RATE) {
      mt = this._newHaplo({ name, parent: mt, founderId: id, established: false });
      branchOf = mt;
    }
    const world = this;
    const c = {
      id,
      name,
      mt,
      branchOf,
      // 表示用の家名。分家がまだ小さいうちは、親の家の名前で呼ばれる
      get clan() {
        return world.clanOf(this.mt);
      },
      children: [],
      sex,
      genome,
      pheno,
      x,
      y,
      px: x,
      py: y,
      // ねぐら（ホームレンジの中心）。生まれた場所から始まり、大人になるときの旅立ちで移る
      hx: x,
      hy: y,
      coat: null,
      dispersed: founder,
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
      yearOffspring: 0,
      lineage: founder ? { [id]: 1 } : this._inheritLineage(fatherId, motherId),
      hunger: 0,
      condition: 1, // 栄養状態（最近の満腹度の移動平均）
      deathTick: null,
      cause: null,
    };
    c.coat = this.coatOf(c);
    this.creatures.push(c);
    this.pedigree.add(c);
    mother?.children.push(id);
    this.pedigree.get(fatherId)?.children.push(id);
    return c;
  }

  // 子の創始者由来の割合 = 父と母の割合の平均（期待値）
  _inheritLineage(fatherId, motherId) {
    const out = {};
    for (const id of [fatherId, motherId]) {
      const p = this.pedigree.get(id);
      if (!p?.lineage) continue;
      for (const [k, v] of Object.entries(p.lineage)) out[k] = (out[k] || 0) + v / 2;
    }
    return out;
  }

  _startCohort() {
    this.cohort = this.creatures.slice();
    this.cohortTick = this.tick;
    for (const c of this.cohort) c.yearOffspring = 0;
  }

  _kill(c, cause) {
    // 歴代でいちばん子を残した個体が死んだときだけ記録する
    if (c.offspring > (this.recordOffspring ?? 20)) {
      this.recordOffspring = c.offspring;
      const how = cause === 'age' ? '15 歳で大往生した' : `${DEATH_CAUSES[cause]}で死んだ`;
      this.addLog(`👑 歴代最多の子だくさん、${c.clan}の${c.name}（${c.sex === 'F' ? '♀' : '♂'}）が${how}。子は ${c.offspring} 匹。`, 'info', c.id);
    }
    c.alive = false;
    c.lineage = null; // 死んだ個体はもう子を残さないので系統の記録は不要
    c.deathTick = this.tick;
    c.cause = cause;
    this.counters.deaths[cause]++;
  }

  _updateEnvironment() {
    const m = this.month;
    this.currentTemp = 14 + this.climateOffset + this.yearNoise - 10 * Math.cos((2 * Math.PI * m) / 12);
    // 雪線：これより標高が高い場所は雪に覆われる（localTemp が 0℃ 未満になる標高）
    this.snowLine = 0.35 + this.currentTemp / 20;
    this.snowCover = this._snowCover();
  }

  // その場所の気温：海沿いは暖かく、山の上ほど寒い（標高 0 で +7℃、標高 1 で -13℃）
  localTemp(elevation) {
    return this.currentTemp + 7 - 20 * elevation;
  }

  // 砂浜以外の陸地のうち、雪に覆われている割合
  _snowCover() {
    const { terrain, elevation } = this.island;
    let snow = 0;
    let land = 0;
    for (let i = 0; i < terrain.length; i++) {
      const t = terrain[i];
      if (t === TERRAIN.SEA || t === TERRAIN.BEACH) continue;
      land++;
      if (elevation[i] > this.snowLine) snow++;
    }
    return land ? snow / land : 0;
  }

  isSnowAt(x, y) {
    const t = this.island.terrainAt(x, y);
    return t !== TERRAIN.BEACH && this.island.elevationAt(x, y) > this.snowLine;
  }

  // いまの毛色：アルビノは一年中色なし。換毛の遺伝子を持つと冬（12〜2 月、日の長さで決まる）は白い毛になる
  coatOf(c) {
    if (c.pheno.albino) return 'albino';
    if (c.pheno.molt && WINTER_COAT_MONTHS.has(this.month)) return 'white';
    return c.pheno.color;
  }

  // 目立ちやすさ = いまの毛色と足元の地面の色の差（発光していれば、光の強さに応じてさらに目立つ）
  visibility(c) {
    let v = contrast(BODY_RGB[c.coat], groundAt(this, c.x, c.y));
    v += 0.3 * glowDisplay(c);
    return v;
  }

  // 同じ草のマスにいる個体で草を分け合う。取り分は体格に関係なく頭数で等分なので、大きい体ほど足りなくなりやすい。
  _feed() {
    const veg = this.vegetation;
    const cs = this.creatures;
    const n = veg.veg.length;
    const count = new Uint16Array(n);
    const cells = new Int32Array(cs.length);
    const need = new Float64Array(cs.length);
    const got = new Float64Array(cs.length);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      cells[i] = veg.cellAt(c.x, c.y);
      // 長い尾を保つにはそのぶん多く食べる必要がある
      need[i] = FOOD_NEED * c.pheno.size * c.pheno.metabolism * (c.age < 12 ? 0.5 : 1) * (1 + 0.25 * c.pheno.tail);
      count[cells[i]]++;
    }
    const eaten = new Float64Array(n);
    for (let i = 0; i < cs.length; i++) {
      const f = cells[i];
      got[i] = Math.min(need[i], veg.edible(f) / count[f]);
      eaten[f] += got[i];
    }
    // 食べきれずに余った分を、まだ足りない個体で分ける
    const unsat = new Uint16Array(n);
    for (let i = 0; i < cs.length; i++) if (got[i] < need[i]) unsat[cells[i]]++;
    let hungerSum = 0;
    for (let i = 0; i < cs.length; i++) {
      const f = cells[i];
      if (got[i] < need[i] && unsat[f] > 0) {
        const extra = Math.min(need[i] - got[i], (veg.edible(f) - eaten[f]) / unsat[f]);
        if (extra > 0) {
          got[i] += extra;
          eaten[f] += extra;
        }
      }
      const c = cs[i];
      c.hunger = 1 - got[i] / need[i];
      // 栄養状態は食べた量だけでなく、遺伝病や（疫病の最中なら）免疫の弱さでも下がる
      let target = (1 - c.hunger) * (1 - 0.2 * c.pheno.load);
      if (this.epidemicMonths > 0) target *= 0.5 + 0.5 * c.pheno.resistance;
      c.condition = 0.75 * c.condition + 0.25 * target;
      hungerSum += c.hunger;
    }
    for (let f = 0; f < n; f++) veg.veg[f] = Math.max(0, veg.veg[f] - eaten[f]);
    this._cellCount = count;
    this.hunger = cs.length ? hungerSum / cs.length : 0;
  }

  // 1 か月進める
  step() {
    if (this.extinct) return;
    this._updateEnvironment();
    const T = this.currentTemp;
    const rng = this.rng;
    const o = this.opts;
    const maxAge = o.maxAgeYears * 12;

    this.vegetation.grow((e) => this.localTemp(e), this.famineMonths > 0);
    this._feed();
    const epidemic = this.epidemicMonths > 0;

    // 捕食：見つけやすさ（目立ちやすさ・小ささ・幼さ）と探索像から、個体ごとの被食確率を出す
    const cs = this.creatures;
    const detect = new Float64Array(cs.length);
    const colors = new Array(cs.length);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      c.coat = this.coatOf(c);
      // 長い尾は逃げるときの邪魔になる
      detect[i] = this.visibility(c) * (1.35 - 0.35 * c.pheno.size) * (c.age < 12 ? 1.6 : 1) * (1 + 0.5 * c.pheno.tail);
      // 捕食者は見た目の色で探す。色の抜けたアルビノは白い毛と見分けがつかない
      colors[i] = c.coat === 'albino' ? 'white' : c.coat;
    }
    if (this.predators > 0) this._alarmCalls(cs, detect);
    const { hazards: predHazard } = predationHazards(this.predators, detect, colors, o.searchImage);

    let kills = 0;
    const causes = ['starvation', 'predation', 'climate', 'disease', 'genetic', 'accident'];
    const h = new Array(causes.length);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      c.px = c.x;
      c.py = c.y;
      c.age++;
      if (c.age >= maxAge) {
        this._kill(c, 'age');
        continue;
      }
      const ph = c.pheno;
      // 飢え：栄養状態（ここ数か月の満腹度）が悪いほど危ない。1 か月食べ損ねただけではまず死なない
      const starving = 1 - c.condition;
      h[0] = 0.6 * starving * starving * (c.age < 12 ? 1.5 : 1);
      h[1] = predHazard[i];
      // 気候：毛皮と体格で最適温度が変わる（ベルクマンの法則）
      // いる場所の気温で寒さ・暑さを感じる（山の上は寒く、海辺は暖かい）
      const excess = this._thermalStress(ph, this.island.elevationAt(c.x, c.y));
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
        const cause = causes[rng.weightedIndex(h)];
        this._kill(c, cause);
        if (cause === 'predation') kills++;
        continue;
      }
      this._move(c);
    }
    this._updatePredators(kills);
    this._raft();
    this.snowSum = (this.snowSum ?? 0) + this.snowCover;

    if (BREEDING_MONTHS.has(this.month)) this._breed();

    this.creatures = this.creatures.filter((c) => c.alive);
    if (this.epidemicMonths > 0) this.epidemicMonths--;
    if (this.famineMonths > 0) this.famineMonths--;

    this.tick++;
    if (this.tick % 12 === 0) this._endYear();
    this._checkExtinction();
  }

  // 捕食者は食べた数に応じて増え、一定の割合で死ぬ（ロトカ＝ヴォルテラ型）
  _updatePredators(kills) {
    const P = this.predators;
    if (P <= 0) return;
    const next = P + kills / PREDATOR.killsPerBirth - PREDATOR.mortality * P;
    if (next < 0.5) {
      this.predators = 0;
      this.addLog('🦅 捕食者が島から姿を消した。保護色はもう意味を持たない。', 'event');
    } else {
      this.predators = next;
    }
  }

  // 快適な気温：毛皮が厚く、体が大きく、代謝が速いほど寒さに強い（最適温度が下がる）
  _optimalTemp(ph) {
    return 22 - 22 * ph.fur - 8 * (ph.size - 1) - 15 * (ph.metabolism - 1);
  }

  // 標高 elevation の場所での寒さ・暑さのつらさ（快適な範囲 ±9℃ を超えた分）
  _thermalStress(ph, elevation) {
    return Math.max(0, Math.abs(this.localTemp(elevation) - this._optimalTemp(ph)) - 9);
  }

  // 歩いて行けるのは同じ陸地の中だけ（海は泳いで渡れない）
  _sameLand(c, nx, ny) {
    return this.island.isLand(nx, ny) && this.island.landmassAt(nx, ny) === this.island.landmassAt(c.x, c.y);
  }

  // 警戒声：鳴く遺伝子を持つ大人は確率 pheno.alarm で鳴き、声の届く範囲の個体を隠れさせる。
  // 親族を助けるという規則は書かない。誰が近くにいるかは、縄張りと旅立ちで決まる。
  // 観察のため、鳴いた個体と知らされた個体の血縁度 r（= 2 × 血縁係数）を一部だけ測っておく。
  _alarmCalls(cs, detect) {
    const veg = this.vegetation;
    const cells = new Map();
    const cellOf = new Int32Array(cs.length);
    for (let i = 0; i < cs.length; i++) {
      const f = veg.cellAt(cs[i].x, cs[i].y);
      cellOf[i] = f;
      if (!cells.has(f)) cells.set(f, []);
      cells.get(f).push(i);
    }
    const warned = new Uint8Array(cs.length);
    const calling = new Uint8Array(cs.length);
    let sampled = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.age < 12 || c.pheno.alarm === 0 || this.rng.next() >= c.pheno.alarm) continue;
      calling[i] = 1;
      this.counters.calls++;
      const fx = cellOf[i] % veg.FW;
      const fy = (cellOf[i] - fx) / veg.FW;
      const land = this.island.landmassAt(c.x, c.y);
      let heard = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = fx + dx;
          const y = fy + dy;
          if (x < 0 || y < 0 || x >= veg.FW || y >= veg.FH) continue;
          for (const j of cells.get(y * veg.FW + x) ?? []) {
            if (j === i || this.island.landmassAt(cs[j].x, cs[j].y) !== land) continue;
            warned[j] = 1;
            this.counters.warned++;
            if (sampled < 60 && heard < 3) {
              this.counters.alarmR += 2 * this.pedigree.kinship(c.id, cs[j].id);
              this.counters.alarmPairs++;
              sampled++;
              heard++;
            }
          }
        }
      }
    }
    for (let i = 0; i < cs.length; i++) {
      if (warned[i]) detect[i] *= 1 - ALARM_BENEFIT;
      if (calling[i]) detect[i] *= 1 + ALARM_COST;
    }
  }

  // 島の中から無作為に選んだ 2 匹の血縁度の平均（観察用。乱数は島の歴史と別のものを使う）
  _randomRelatedness(cs, pairs) {
    if (cs.length < 2) return null;
    let sum = 0;
    let s = (this.tick * 2654435761) >>> 0;
    const pick = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return cs[s % cs.length];
    };
    for (let k = 0; k < pairs; k++) {
      const a = pick();
      let b = pick();
      if (a === b) b = cs[(cs.indexOf(a) + 1) % cs.length];
      sum += 2 * this.pedigree.kinship(a.id, b.id);
    }
    return sum / pairs;
  }

  // 大人になったとき一度だけ、遺伝子で決まる距離だけ離れた場所へ旅立つ（同じ陸地の中）。
  // 遠くへ行くほど疲れるが、きょうだいとの餌の奪い合いや近親との交配を避けられ、空いた土地も見つけられる
  _disperse(c) {
    c.dispersed = true;
    const want = DISPERSAL_RANGE * c.pheno.dispersal * (0.5 + this.rng.next());
    if (want < 0.01) return;
    for (let t = 0, d = want; t < 6; t++, d *= 0.8) {
      const a = this.rng.next() * Math.PI * 2;
      const nx = c.x + Math.cos(a) * d;
      const ny = c.y + Math.sin(a) * d * (4 / 3);
      if (nx < 0 || ny < 0 || nx >= 1 || ny >= 1 || !this._sameLand(c, nx, ny)) continue;
      const occ = this._cellCount;
      if (occ) {
        occ[this.vegetation.cellAt(c.x, c.y)]--;
        occ[this.vegetation.cellAt(nx, ny)]++;
      }
      c.x = c.hx = nx;
      c.y = c.hy = ny;
      c.condition = Math.max(0.05, c.condition - (DISPERSAL_COST * d) / DISPERSAL_RANGE);
      this.counters.dispersals++;
      this.counters.dispersalDist[c.sex] += d;
      this.counters.dispersers[c.sex]++;
      return;
    }
  }

  _move(c) {
    if (!c.dispersed && c.age >= this.maturityOf(c)) {
      this._disperse(c);
      return;
    }
    // ねぐらは今いる場所へ少しずつ移る（餌を追って移り住む）
    c.hx += (c.x - c.hx) * HOME_DRIFT;
    c.hy += (c.y - c.hy) * HOME_DRIFT;
    // お腹が空いている・寒すぎる（暑すぎる）ときは、隣の草のマスの中から
    // 「草の量 ÷ (先客 + 1)」を「気温のつらさ」で割り引いた値が一番よい方へ移る（採餌と、山を下りる／登る）
    const stressHere = this._thermalStress(c.pheno, this.island.elevationAt(c.x, c.y));
    if ((c.hunger > 0.05 || stressHere > 0) && c.age >= 6) {
      const veg = this.vegetation;
      const here = veg.cellAt(c.x, c.y);
      const hx = here % veg.FW;
      const hy = (here - hx) / veg.FW;
      const occ = this._cellCount;
      const score = (food, stress) => food / (1 + 0.25 * stress);
      let best = null;
      let bestScore = score(veg.edible(here) / (occ ? occ[here] : 1), stressHere);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const fx = hx + dx;
          const fy = hy + dy;
          if (fx < 0 || fy < 0 || fx >= veg.FW || fy >= veg.FH) continue;
          const f = fy * veg.FW + fx;
          const nx = (fx + this.rng.next()) / veg.FW;
          const ny = (fy + this.rng.next()) / veg.FH;
          if (!this._sameLand(c, nx, ny)) continue;
          const sc = score(veg.edible(f) / ((occ ? occ[f] : 0) + 1), this._thermalStress(c.pheno, this.island.elevationAt(nx, ny)));
          if (sc <= bestScore) continue;
          bestScore = sc;
          best = [nx, ny, f];
        }
      }
      if (best) {
        c.x = best[0];
        c.y = best[1];
        if (occ) {
          occ[here]--;
          occ[best[2]]++;
        }
        return;
      }
    }
    // 満ち足りているときは、ねぐらのまわりを歩き回る
    const step = c.age < 6 ? 0.004 : 0.009;
    for (let t = 0; t < 4; t++) {
      const a = this.rng.next() * Math.PI * 2;
      const nx = c.x + Math.cos(a) * step + (c.hx - c.x) * HOME_PULL;
      const ny = c.y + Math.sin(a) * step * (4 / 3) + (c.hy - c.y) * HOME_PULL;
      if (this._sameLand(c, nx, ny)) {
        c.x = nx;
        c.y = ny;
        return;
      }
    }
  }

  _breed() {
    const o = this.opts;
    const rng = this.rng;
    const males = this.creatures.filter((c) => c.alive && c.sex === 'M' && c.age >= this.maturityOf(c));
    if (males.length === 0) return;
    const females = this.creatures.filter(
      (c) => c.alive && c.sex === 'F' && c.age >= this.maturityOf(c) && c.lastBredYear !== this.year,
    );
    for (const f of females) {
      // やせ細ったメスは繁殖しない。選り好みの強いメスほど相手探しに時間がかかる
      const choosiness = Math.max(f.pheno.prefTail, f.pheno.prefGlow);
      if (f.condition < 0.35 || rng.next() > 0.45 * (1 - CHOOSINESS_COST * choosiness)) continue;
      const mate = this._chooseMate(f, males);
      if (!mate) continue;
      f.lastBredYear = this.year;
      this.counters.matings++;
      const F = this.pedigree.kinship(f.id, mate.id);
      // 栄養状態がよいほど多く産む
      // 代謝が速い母ほど子に回せるエネルギーが多い
      const litter = Math.min(4, 1 + rng.poisson(1.8 * f.condition * f.condition * f.pheno.metabolism));
      // 雑種の不和合：両親の稔性が低いほど、卵や精子がうまく働かず子ができない
      const fertile = f.pheno.fertility * mate.pheno.fertility;
      let born = 0;
      for (let k = 0; k < litter; k++) {
        if (fertile < 1 && rng.next() > fertile) {
          this.counters.infertile++;
          continue;
        }
        const egg = makeGamete(f.genome, 'F', rng, o.mutationRate);
        const sperm = makeGamete(mate.genome, 'M', rng, o.mutationRate);
        const z = fertilize(egg, sperm);
        if (express(z.genome).lethal) {
          this.counters.stillborn++;
          continue;
        }
        let x = f.x + (rng.next() - 0.5) * 0.01;
        let y = f.y + (rng.next() - 0.5) * 0.01;
        if (!this._sameLand(f, x, y)) {
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
      f.yearOffspring += born;
      mate.yearOffspring += born;
      this.counters.births += born;
      if (F >= 0.125) this.counters.inbredBirths += born;
    }
  }

  // 成熟する年齢：代謝が遅い（燃費のいい）体ほど育つのに時間がかかる
  maturityOf(c) {
    return Math.round(this.opts.maturityMonths / c.pheno.metabolism);
  }

  // 相手選び：メスは同じ陸地のオスと、近いほど出会いやすい（出会いやすさ = exp(−距離² / 2σ²)、σ = MATE_REACH）。
  // 相手が見つかる確率は出会いやすさの合計で決まる（1 − exp(−合計)）。近くにオスがいなければ、たまに遠くまで探しに行く。
  // 見つかったら、出会いやすさ × 魅力（体格² × 好みの飾り）に比例して選ぶ。
  _chooseMate(f, males) {
    const o = this.opts;
    const reach = f.pheno.albino ? MATE_REACH * ALBINO_SIGHT : MATE_REACH;
    const inv = 1 / (2 * reach * reach);
    const far2 = 16 * reach * reach; // 4σ より遠いオスとはほとんど出会わないので数えない
    // 相手は同じ陸地にいるオスだけ（海の向こうには行けない）
    const land = this.island.landmassAt(f.x, f.y);
    const candidates = [];
    const meet = [];
    let total = 0;
    for (const m of males) {
      const dx = m.x - f.x;
      const dy = (m.y - f.y) * 0.75;
      const d2 = dx * dx + dy * dy;
      if (d2 > far2 || this.island.landmassAt(m.x, m.y) !== land) continue;
      const e = Math.exp(-d2 * inv);
      candidates.push(m);
      meet.push(e);
      total += e;
    }
    if (total === 0 || this.rng.next() > 1 - Math.exp(-total)) {
      // 近くで出会えなかった：遠くまで探しに行けるのはたまに。行けば同じ陸地のどのオスとも出会える
      // （まばらなときに遠くまで歩き回る行動。これがないと、個体数が減ったとき誰も番えずに絶滅した）
      if (this.rng.next() > FAR_SEARCH) return null;
      candidates.length = 0;
      meet.length = 0;
      for (const m of males) {
        if (this.island.landmassAt(m.x, m.y) !== land) continue;
        candidates.push(m);
        meet.push(1);
      }
      if (!candidates.length) return null;
    }
    const weights = candidates.map((m, i) => {
      if (o.inbreedingAvoidance && this.pedigree.kinship(f.id, m.id) >= 0.125) return 0;
      // 大きいオスほど他のオスに競り勝つ（体格²）。そのうえでメス自身の好みの遺伝子で飾りを評価する
      return (
        meet[i] *
        m.pheno.size *
        m.pheno.size *
        (1 + PREFERENCE_SCALE * f.pheno.prefTail * tailDisplay(m)) *
        (1 + PREFERENCE_SCALE * f.pheno.prefGlow * glowDisplay(m))
      );
    });
    const i = this.rng.weightedIndex(weights);
    return i < 0 ? null : candidates[i];
  }

  _endYear() {
    this._recordYear();
    this.snowSum = 0;
    this._startCohort();
    this._milestones();
    this._clanEvents();
    if (this.year > 0 && this.year % DIGEST_YEARS === 0) this._digest();
    for (const e of this.scenario?.events ?? []) if (e.year === this.year) this.applyEvent(e.event);
    this._resetCounters();
    if (this.opts.randomEvents) this._randomEvents();

    this._updateClimate();
    // 寒くなると海面が下がり、浅瀬が陸になる（陸橋・小島の出現）。暖かくなると海面が上がり、低い海辺が沈む
    const sea = SEA_PER_DEGREE * this.climateOffset;
    if (Math.abs(sea - this.island.seaLevel) > 0.004) {
      const falling = sea < this.island.seaLevel;
      this.island.seaLevel = sea;
      this.terrainChanged(falling ? 'sea-fall' : 'sea-rise');
    }
    this.yearNoise = this.rng.normal() * 1.2;

    this.pedigree.prune(this.tick - this.opts.pedigreeYears * 12);
  }

  // 大きな波（氷期と間氷期）の気温：周期の 8 割をかけてゆっくり冷え、残り 2 割で急に暖まる（のこぎり形）
  cycleTemp(year) {
    const P = this.opts.climateCycleYears;
    const { cold, warm } = CLIMATE_AMPLITUDE[this.opts.climateAmplitude] ?? CLIMATE_AMPLITUDE.realistic;
    const ph = (((year + this.cycleStart) % P) + P) % P / P;
    if (ph < COOLING_SHARE) return warm + (cold - warm) * Math.pow(ph / COOLING_SHARE, 1.3);
    return cold + (warm - cold) * ((ph - COOLING_SHARE) / (1 - COOLING_SHARE));
  }

  cyclePhase(year) {
    const P = this.opts.climateCycleYears;
    return (((year + this.cycleStart) % P) + P) % P / P;
  }

  _updateClimate() {
    const year = this.year;
    const base = this.cycleTemp(year);
    // 数十〜百年単位の揺らぎ（小氷期や中世温暖期のようなもの）
    this.climateWobble = 0.97 * this.climateWobble + 0.35 * this.rng.normal();
    const p = this.push;
    if (p.kind) {
      if (p.kind === 'super') p.target = SUPER_COLD_OFFSET - (base + this.climateWobble);
      p.years--;
      if (p.years <= 0) {
        const msg = { cold: '☀️ 寒冷期が終わり、気候が戻りはじめた。', warm: '🍃 温暖期が終わり、気候が戻りはじめた。', super: '☀️ 超寒冷期が終わり、雪がゆっくり退きはじめた。' }[p.kind];
        this.addLog(msg, 'event');
        p.kind = null;
        p.target = 0;
        p.rate = 1.5;
      }
    }
    const d = p.target - p.offset;
    p.offset += Math.sign(d) * Math.min(Math.abs(d), p.rate);
    this.climateOffset = Math.max(COLDEST, base + this.climateWobble + p.offset);

    // 大きな波のどこにいるかを年代記に残す
    const phase = this.phaseOf(year);
    if (phase !== this.climatePhase) {
      const msg = {
        inter: '🌞 間氷期に入った。今より少し暖かく、海面が高い時代。',
        cooling: '🍂 気候がゆっくり寒くなりはじめた（次の氷期へ）。',
        glacial: '❄️ 氷期に入った。雪が増え、海面が下がっていく。浅瀬が陸橋になるかもしれない。',
        warming: '☀️ 氷期が終わり、急速に暖かくなっていく。海面が上がり、陸橋が沈んでいく。',
      }[phase];
      this.addLog(msg, 'event');
      this.climatePhase = phase;
    }
  }

  phaseOf(year) {
    const { cold } = CLIMATE_AMPLITUDE[this.opts.climateAmplitude] ?? CLIMATE_AMPLITUDE.realistic;
    const base = this.cycleTemp(year);
    if (this.cyclePhase(year) >= COOLING_SHARE) return 'warming';
    return base > 0 ? 'inter' : base > cold / 2 ? 'cooling' : 'glacial';
  }

  get climateLabel() {
    return { inter: '間氷期', cooling: '寒冷化', glacial: '氷期', warming: '温暖化' }[this.climatePhase] ?? '';
  }

  _newHaplo({ name, parent, founderId, established }) {
    const id = this.nextHaplo++;
    const p = parent == null ? null : this.haplos.get(parent);
    this.haplos.set(id, { id, name, parent, root: p ? p.root : id, founderId, tick: this.tick, established });
    return id;
  }

  // 名前のついている（十分に育った）いちばん近い系統
  establishedHaplo(mt) {
    let h = this.haplos.get(mt);
    while (h && !h.established) h = this.haplos.get(h.parent);
    return h;
  }

  clanOf(mt) {
    const h = this.establishedHaplo(mt);
    if (!h) return '?';
    if (h.parent == null) return `${h.name}家`;
    return `${this.haplos.get(h.root).name}家${h.name}流`;
  }

  // 家（母系）の栄枯盛衰。分家の独立、大きくなったことのある家が途絶えたとき、最大の家が入れ替わったときに記録する
  _clanEvents() {
    // 分家の芽：まだ名前のない系統が生きている個体 BRANCH_NAMED_AT 匹に育ったら、家として名前を付ける（年代記には書かない）
    const raw = new Map();
    for (const c of this.creatures) raw.set(c.mt, (raw.get(c.mt) || 0) + 1);
    for (const [mt, n] of raw) {
      const h = this.haplos.get(mt);
      if (h.established || n < BRANCH_NAMED_AT) continue;
      h.established = true;
    }

    const count = new Map();
    for (const c of this.creatures) {
      const h = this.establishedHaplo(c.mt);
      count.set(h.id, (count.get(h.id) || 0) + 1);
    }
    // 分家まで含めた血筋の数（分家が生きていれば、その家の血筋は途絶えていない）
    const lineage = new Map();
    for (const [id, n] of count) {
      for (let h = this.haplos.get(id); h; h = this.haplos.get(h.parent)) lineage.set(h.id, (lineage.get(h.id) || 0) + n);
    }
    // 分家が本家（分かれた元の家）を数で上回ったら記す（家ごとに 1 回）
    for (const [id, n] of count) {
      const h = this.haplos.get(id);
      if (!h.parent || h.overtook) continue;
      const parent = this.establishedHaplo(h.parent).id;
      const pn = count.get(parent) || 0;
      if (n >= 30 && n > pn && pn > 0) {
        h.overtook = true;
        const f = this.pedigree.get(h.founderId);
        this.addLog(
          `🌿 分家の${this.clanOf(id)}（${n} 匹）が本家の${this.clanOf(parent)}（${pn} 匹）を上回った。祖は ${Math.floor(h.tick / 12)} 年目生まれの${h.name}（${f?.sex === 'F' ? '♀' : '♂'}）。`,
          'gene',
          h.founderId,
        );
      }
    }
    for (const [id, n] of count) {
      const p = this.clanPeak.get(id);
      if (!p) this.clanPeak.set(id, { peak: n, year: this.year });
      else if (n > p.peak) Object.assign(p, { peak: n, year: this.year });
    }
    for (const [id, p] of this.clanPeak) {
      if (count.has(id)) continue;
      const rest = lineage.get(id) || 0;
      if (rest > 0) {
        // 本家筋（分家していない者）はいなくなったが、分家が血筋をつないでいる
        if (!p.mainGone) {
          p.mainGone = true;
          if (p.peak >= CLAN_LOG_PEAK) {
            const heirs = [...count.keys()]
              .filter((c) => {
                for (let h = this.haplos.get(c); h; h = this.haplos.get(h.parent)) if (h.parent === id) return true;
                return false;
              })
              .sort((x, y) => count.get(y) - count.get(x))
              .slice(0, 2)
              .map((c) => this.clanOf(c));
            this.addLog(`🍂 ${this.clanOf(id)}の本家筋が絶えた。血筋は分家の${heirs.join('・')}に続いている（最盛期は ${p.year} 年目の ${p.peak} 匹）。`, 'gene');
          }
        }
        continue;
      }
      if (p.gone) continue;
      p.gone = true;
      if (p.peak >= CLAN_LOG_PEAK) {
        const hadBranch = p.mainGone || [...this.haplos.values()].some((h) => h.established && h.parent === id);
        this.addLog(`🕯️ ${this.clanOf(id)}が${hadBranch ? '分家も含めて' : ''}途絶えた（最盛期は ${p.year} 年目の ${p.peak} 匹）。`, 'gene');
      }
    }
    // 大本の家（創始者の系統）が 1 つだけになったら、その創始者がこの島の「ミトコンドリア・イブ」
    const roots = new Set([...count.keys()].map((id) => this.haplos.get(id).root));
    if (roots.size === 1 && this.rootCount > 1) {
      const root = this.haplos.get([...roots][0]);
      this.addLog(`🧬 母から母へとたどると、島の全員が創始者${root.name}に行き着くようになった。${root.name}がこの島の「ミトコンドリア・イブ」。`, 'gene', root.founderId);
    }
    this.rootCount = roots.size;
    let top = null;
    for (const [id, n] of count) if (!top || n > top.n) top = { id, n };
    if (top && top.id !== this.topClan && this.year - (this.topClanSince ?? -99) >= 15) {
      if (this.topClan) this.addLog(`🏯 ${this.clanOf(top.id)}が${this.clanOf(this.topClan)}を抜き、島いちばんの一族になった（${top.n} 匹）。`, 'gene');
      this.topClan = top.id;
      this.topClanSince = this.year;
    }
  }

  // いま生きている家の一覧（系統樹の順）
  clanTree() {
    const count = new Map();
    for (const c of this.creatures) {
      const h = this.establishedHaplo(c.mt);
      count.set(h.id, (count.get(h.id) || 0) + 1);
    }
    // 子孫に生きている家がある系統も、枝として残す
    const keep = new Set();
    for (const id of count.keys()) {
      for (let h = this.haplos.get(id); h; h = this.haplos.get(h.parent)) keep.add(h.id);
    }
    const kids = new Map();
    for (const id of keep) {
      const h = this.haplos.get(id);
      if (!kids.has(h.parent)) kids.set(h.parent, []);
      kids.get(h.parent).push(h);
    }
    const out = [];
    const walk = (parent, depth) => {
      const list = (kids.get(parent) ?? []).filter((h) => h.established);
      list.sort((a, b) => (count.get(b.id) || 0) - (count.get(a.id) || 0));
      for (const h of list) {
        out.push({ id: h.id, name: this.clanOf(h.id), depth, n: count.get(h.id) || 0, founderId: h.founderId, year: Math.floor(h.tick / 12) });
        walk(h.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  // 島どうしの雑種の稔性（島の中どうしの子と比べた割合）から、種分化を年代記に記す。
  // 境目は表示のためだけのもの：半分を下回ったら「別の種」、9 割を超えたら壁が消えたとみなす
  _speciationEvents(barriers) {
    const name = (id) => this.island.landmasses.find((m) => m.id === id)?.name ?? '?';
    for (const { a, b, hybrid } of barriers) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      const pair = `${name(a)}と${name(b)}`;
      if (hybrid < 0.5 && !this.speciation[key]) {
        this.speciation[key] = this.year;
        this.addLog(`🧬 ${pair}の集団は別の種になった。間の雑種は、ふつうの子の ${Math.round(hybrid * 100)}% しか子を残せない。`, 'gene');
      } else if (hybrid > 0.9 && this.speciation[key]) {
        this.addLog(`🤝 ${pair}の集団が再び交わり、種の壁が消えた（${this.year - this.speciation[key]} 年ぶり）。`, 'gene');
        delete this.speciation[key];
      }
    }
  }

  // 5 年ごとの見どころ。年代記には見出しと各行を、個体タブには最新のものを出す
  _digest() {
    const { items, snapshot } = makeHighlights(this, this.digestPrev);
    this.digestPrev = snapshot;
    this.highlights = { year: this.year, items };
    // 年代記には一番の見どころだけを 1 行で（全部は個体タブ）
    const top = items[0];
    // 目立つ変化がなければ年代記には書かない
    if (top.score < 2) return;
    const more = items.length > 1 ? `（ほか ${items.length - 1} 件は「個体」タブ）` : '';
    this.addLog(`🔭 ${top.icon} ${top.text}${more}`, 'digest', top.id);
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
    // 寒冷期・温暖期は気候の波として自然に来るので、ランダムには起こさない。超寒冷期だけがまれな出来事
    if (!this.push.kind && r.chance(0.0015)) this.triggerSuperColdEra();
    if (r.chance(0.015)) this.triggerStorm();
    if (this.predators === 0 && r.chance(PREDATOR.immigrationChance)) {
      this.predators = 2;
      this.addLog('🦅 海を越えて捕食者のつがいが島に渡ってきた。', 'event');
    }
  }

  // 地形（海面・編集）が変わったあとの後始末：地形の分類、草の上限、海に沈んだ個体、島の出現・消失の記録
  terrainChanged(reason = 'edit') {
    const island = this.island;
    const before = new Map(island.landmasses.map((m) => [m.id, m]));
    const oldLand = island.landmass.slice();
    const oldArea = island.area;
    island.reclassify();
    this.vegetation.recomputeCaps();

    // 足元が海になった個体は近くの岸まで泳ぐ。岸が遠ければおぼれる
    for (const c of this.creatures) {
      if (island.isLand(c.x, c.y)) continue;
      const shore = island.nearestLand(c.x, c.y, 6);
      if (shore) {
        c.x = c.px = c.hx = shore.x;
        c.y = c.py = c.hy = shore.y;
      } else this._kill(c, 'sea');
    }
    this.creatures = this.creatures.filter((c) => c.alive);

    const after = new Map(island.landmasses.map((m) => [m.id, m]));
    const why = reason === 'sea-fall' ? '海面が下がり、' : reason === 'sea-rise' ? '海面が上がり、' : '';
    for (const [id, m] of before) {
      if (after.has(id) || m.size < 15) continue;
      // その陸地だったマスがいまどこかの陸地に入っていれば「陸続きになった」
      let into = null;
      for (let i = 0; i < oldLand.length && !into; i++) if (oldLand[i] === id && island.landmass[i] >= 0) into = after.get(island.landmass[i]);
      if (into) this.addLog(`🌉 ${why}${m.name}が${into.name}と陸続きになった（陸橋）。`, 'event');
      else this.addLog(`🌊 ${why}${m.name}が海に沈んだ。`, 'event');
    }
    for (const [id, m] of after) {
      if (before.has(id) || m.size < 15) continue;
      let from = null;
      for (let i = 0; i < oldLand.length && !from; i++) if (island.landmass[i] === id && oldLand[i] >= 0) from = before.get(oldLand[i]);
      if (from) this.addLog(`🌊 ${why}${m.name}が${from.name}から海で切り離された。`, 'event');
      else this.addLog(`🏝️ ${why}海から${m.name}が姿を現した。`, 'event');
    }
    // 海面の上下で陸の広さが大きく変わったとき
    if (reason.startsWith('sea')) {
      const change = (island.area - (this.areaAtLastLog ?? oldArea)) / oldArea;
      if (Math.abs(change) >= 0.05) {
        this.addLog(change > 0 ? `🏖️ 海面が下がり、陸地が ${Math.round(change * 100)}% 広がった。浅瀬が陸になっていく。` : `🌊 海面が上がり、陸地が ${Math.round(-change * 100)}% 狭くなった。`, 'event');
        this.areaAtLastLog = island.area;
      }
    }
    this.terrainVersion = island.version;
  }

  // 地形の編集（盛る・掘る）
  sculpt(x, y, r, delta) {
    this.island.sculpt(x, y, r, delta);
  }

  // 本島から少し離れた沖に小島をつくる
  createIslet() {
    if (!this.island.addIslet(this.rng)) return false;
    this.terrainChanged('edit');
    return true;
  }

  // 流木による漂流：砂浜の個体がまれに、近くの仲間といっしょに沖へ流される。
  // 流れた先で別の陸地に着けば上陸、同じ陸地の岸に戻ることもあり、どこにも着かなければ海で死ぬ。
  _raft() {
    const island = this.island;
    const p = RAFT_CHANCE_PER_YEAR / 12;
    for (const c of this.creatures) {
      if (!c.alive || island.terrainAt(c.x, c.y) !== TERRAIN.BEACH || this.rng.next() > p) continue;
      const home = island.landmassAt(c.x, c.y);
      const group = [c];
      for (const o of this.creatures) {
        if (group.length >= 4) break;
        if (o === c || !o.alive || Math.abs(o.x - c.x) > 0.012 || Math.abs(o.y - c.y) > 0.016) continue;
        if (island.landmassAt(o.x, o.y) === home && this.rng.next() < 0.8) group.push(o);
      }
      const a = this.rng.next() * Math.PI * 2;
      const dx = Math.cos(a) / island.W;
      const dy = Math.sin(a) / island.H;
      let x = c.x;
      let y = c.y;
      let landed = null;
      let atSea = false;
      for (let k = 0; k < RAFT_RANGE; k++) {
        x += dx;
        y += dy;
        if (x < 0 || y < 0 || x >= 1 || y >= 1) break;
        if (!island.isLand(x, y)) {
          atSea = true;
          continue;
        }
        if (atSea) {
          landed = { x, y, land: island.landmassAt(x, y) };
          break;
        }
      }
      if (!atSea) continue; // 陸のほうへ流れた：何も起きない
      if (!landed) {
        for (const g of group) this._kill(g, 'sea');
        continue;
      }
      for (const g of group) {
        g.x = g.px = landed.x + (this.rng.next() - 0.5) * 0.004;
        g.y = g.py = landed.y + (this.rng.next() - 0.5) * 0.004;
        if (!island.isLand(g.x, g.y) || island.landmassAt(g.x, g.y) !== landed.land) {
          g.x = g.px = landed.x;
          g.y = g.py = landed.y;
        }
        g.hx = g.x;
        g.hy = g.y;
      }
      if (landed.land !== home) {
        const to = island.landmassById(landed.land);
        const from = island.landmassById(home);
        const first = !this.creatures.some((o) => o.alive && !group.includes(o) && island.landmassAt(o.x, o.y) === landed.land);
        const bothSexes = group.some((g) => g.sex === 'F') && group.some((g) => g.sex === 'M');
        const who = group.length === 1 ? `${c.clan}の${c.name}` : `${c.clan}の${c.name}ら ${group.length} 匹`;
        this.raftLogged ??= new Map();
        // 無人の島へは、オスとメスがそろっていて新しい集団を始められるときだけ記録する。
        // すでに住んでいる島へ渡ったとき（遺伝子の流入）は、同じ島について 10 年に 1 回まで
        if (first && bothSexes) {
          this.addLog(`🪵 ${who}が流木に乗って${from?.name ?? '?'}から無人の${to?.name ?? '?'}に流れ着いた。オスとメスがそろっている。`, 'event', c.id);
        } else if (!first && this.year - (this.raftLogged.get(landed.land) ?? -99) >= 10) {
          this.raftLogged.set(landed.land, this.year);
          this.addLog(`🪵 ${who}が流木に乗って${from?.name ?? '?'}から${to?.name ?? '?'}に渡った（島どうしの遺伝子の行き来）。`, 'event', c.id);
        }
      }
    }
    this.creatures = this.creatures.filter((c) => c.alive);
  }

  releasePredators(n = 4) {
    this.predators += n;
    this.addLog(`🦅 捕食者を ${n} 匹放った（いま約 ${Math.round(this.predators)} 匹）。`, 'event');
  }

  triggerEpidemic() {
    this.epidemicMonths = 5;
    this.addLog('🦠 疫病が流行しはじめた（免疫型ヘテロ A/B が有利）。', 'event');
  }

  triggerFamine() {
    this.famineMonths = 12;
    this.addLog('🥀 干ばつの年。草がほとんど育たない（大きな個体ほど苦しい）。', 'event');
  }

  // 超寒冷期：夏でも島の大半が雪に覆われる。暖かい海辺だけがわずかに残る避難所になる
  triggerSuperColdEra() {
    const years = 15 + this.rng.int(20);
    Object.assign(this.push, { kind: 'super', years, rate: 4 });
    this.addLog(`🧊 超寒冷期に突入（約${years}年）。夏でも島の大半が雪に閉ざされる。生き延びられるのは海辺の暖かい場所だけ…`, 'bad');
  }

  // 寒冷期・温暖期のボタン：気候の波をしばらく押し下げる・押し上げる
  triggerColdEra() {
    const years = 25 + this.rng.int(40);
    Object.assign(this.push, { kind: 'cold', years, target: -5, rate: 1.5 });
    this.addLog(`❄️ 寒冷期に突入（約${years}年）。島が雪に覆われていく…`, 'event');
  }

  triggerWarmEra() {
    const years = 20 + this.rng.int(25);
    Object.assign(this.push, { kind: 'warm', years, target: 3, rate: 1.5 });
    this.addLog(`🔥 温暖期に突入（約${years}年）。雪が消え、海面が上がって低い海辺が沈んでいく。`, 'event');
  }

  // 出来事による押しを早めに終わらせる
  endClimatePush() {
    if (this.push.kind) this.push.years = 1;
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
    // 漂着者は同じ土地（東か西）から一緒に流れてくる
    const origin = this.rng.int(2);
    for (let k = 0; k < n; k++) {
      const sex = k % 2 === 0 ? 'F' : 'M';
      const pos = this.island.randomLand(this.rng, (t) => t === TERRAIN.BEACH);
      this._spawn({
        sex,
        genome: randomGenome(sex, this.rng, origin),
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
      infertile: this.counters.infertile,
      // 警戒声：鳴いた回数、知らされた延べ数、鳴いた個体と知らされた個体の血縁度の平均
      alarm: {
        calls: this.counters.calls,
        warned: this.counters.warned,
        r: this.counters.alarmPairs ? this.counters.alarmR / this.counters.alarmPairs : null,
        // 比べるための、島の中の無作為な 2 匹の血縁度
        rRandom: this._randomRelatedness(cs, 40),
      },
      // 昨年旅立った個体の平均の距離（島の幅に対する割合）と、旅立ちの遺伝子の平均
      dispersal: {
        M: this.counters.dispersers.M ? this.counters.dispersalDist.M / this.counters.dispersers.M : null,
        F: this.counters.dispersers.F ? this.counters.dispersalDist.F / this.counters.dispersers.F : null,
        geneM: cs.length ? cs.reduce((a, c) => a + c.pheno.dispMGene, 0) / cs.length : 0,
        geneF: cs.length ? cs.reduce((a, c) => a + c.pheno.dispFGene, 0) / cs.length : 0,
      },
      inbredBirths: this.counters.inbredBirths,
      deaths: { ...this.counters.deaths },
      meanF: cs.length ? sumF / cs.length : 0,
      Ho,
      He,
      freqs: Object.fromEntries(Object.entries(freqs).map(([k, v]) => [k, v.freq])),
      pheno,
      climate: this.climateOffset,
      seaLevel: this.island.seaLevel,
      snow: this.snowSum != null ? this.snowSum / 12 : this.snowCover,
      sexsel: sexualSelectionStats(cs),
      islands: (() => {
        const st = islandStats(cs, this.island);
        this._speciationEvents(st.barriers);
        return {
          fst: st.fst,
          pops: Object.fromEntries(st.rows.filter((r) => r.pop > 0).map((r) => [r.name, r.pop])),
          hybrid: st.barriers.length ? Math.min(...st.barriers.map((b) => b.hybrid)) : null,
        };
      })(),
      selection: this.history.length ? selectionStats(this.cohort, this.cohortTick, this.opts.maturityMonths) : null,
      ...this._founderRecord(cs),
      clans: new Set(cs.map((c) => this.establishedHaplo(c.mt).id)).size,
      metabolism: cs.length ? cs.reduce((a, c) => a + c.pheno.metabolism, 0) / cs.length : 0,
      predators: this.predators,
      kills: this.counters.deaths.predation,
      vegetation: this.vegetation.meanFraction(),
      hunger: this.hunger,
    };
    this.history.push(rec);
    if (this.history.length === 1) {
      for (const l of LOCI) for (const a of l.alleles) this.alleleStatus[`${l.key}:${a}`] = rec.freqs[l.key][a] > 0 ? 'present' : 'lost';
    } else if (cs.length > 0) this._detectFixation(rec.freqs);
  }

  _founderRecord(cs) {
    const shares = founderShares(cs);
    this.founderSnapshot = shares;
    const lines = shares.filter((s) => s.share > 0).length;
    const prev = this.history.at(-1)?.founderLines;
    for (const k of [50, 20, 10, 5, 1]) {
      if (prev > k && lines <= k && cs.length > 0) {
        this.addLog(`🌳 子孫が残っている創始者が ${lines} 匹になった。`, 'gene');
        break;
      }
    }
    return { founderLines: lines, topFounderShare: shares[0]?.share ?? 0 };
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
