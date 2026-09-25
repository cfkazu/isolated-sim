// 遺伝子システム：染色体・遺伝子座・減数分裂（組換え）・突然変異・表現型の発現。
//
// ゲノムは { m: [...], p: [...] } の 2 本（母由来 / 父由来）の配列で、
// 添字は LOCI の並び順。オスの X 連鎖遺伝子座では父由来側（= Y 染色体）が null。

export const INHERITANCE = {
  series: {
    label: '複対立遺伝子（優劣の序列）',
    short: '優劣序列',
    desc: '3 つ以上の対立遺伝子があり、黒 K ＞ 緑 G ＞ 白 w の順に優性。白は w/w のときだけ現れる。ウサギの毛色などと同じしくみ。',
  },
  codominant: {
    label: '共優性',
    short: '共優性',
    desc: '斑点 S と縞 T はどちらも優性で、S/T なら両方の模様が同時に出る。無地 o は劣性。ヒトの ABO 式血液型と同じしくみ。',
  },
  incomplete: {
    label: '不完全優性（中間遺伝）',
    short: '不完全優性',
    desc: '立ち耳 U と垂れ耳 F に優劣がなく、U/F は半立ちの中間になる。マルバアサガオの花色（赤×白→桃）と同じ。生死にも好みにも関わらない「中立」な形質なので、遺伝的浮動だけで頻度が揺れる様子を観察できる。',
  },
  sexlimited: {
    label: '限性遺伝（ポリジーン）',
    short: '限性',
    desc: '両方の性が遺伝子を持ち子に伝えるが、片方の性にしか現れない。尾の長さ（4 座）はオスだけに、好みの強さはメスだけに現れる。メスは長い尾の遺伝子を、オスは好みの遺伝子を、表に出さずに運んでいる。',
  },
  polygenic: {
    label: '量的形質（ポリジーン）',
    short: 'ポリジーン',
    desc: '複数の遺伝子座の「＋」の数を足し合わせて連続的な値になる。体格は 4 座、毛皮の厚さは 3 座。体格には環境によるばらつきも加わる。',
  },
  xlinked: {
    label: '伴性遺伝（X 連鎖劣性）',
    short: '伴性',
    desc: '発光遺伝子 g は X 染色体上にある劣性遺伝子。オス（XY）は 1 本で発光するが、メスは g/g でないと発光しない。g/N のメスは「保因者」。オスの X は必ず母親由来。発光は捕食者に目立つが、発光を好むメスには魅力的に映る。',
  },
  overdominant: {
    label: '超優性（ヘテロ接合体優位）',
    short: '超優性',
    desc: '免疫型 A/B のヘテロ接合体が最も病気に強い。どちらかの対立遺伝子が消えると不利になるため、平衡選択で両方が維持されやすい（鎌状赤血球とマラリアの関係に似る）。',
  },
  lethal: {
    label: '劣性致死',
    short: '劣性致死',
    desc: 'l/l になると生まれる前に死ぬ。保因者（L/l）は健康なので集団に潜み続ける。近親交配で表に出やすい。体色遺伝子のすぐ近く（4cM）にあり、連鎖している。',
  },
  deleterious: {
    label: '劣性有害（遺伝的荷重）',
    short: '劣性有害',
    desc: 'd/d になると体が弱り、死亡率が上がる。3 つの遺伝子座に散らばる。近親交配が進むとホモ接合が増え「近交弱勢」が起きる。',
  },
};

export const CHROMOSOMES = [
  { id: 'C1', name: '第1染色体', length: 120 },
  { id: 'C2', name: '第2染色体', length: 100 },
  { id: 'C3', name: '第3染色体', length: 90 },
  { id: 'X', name: 'X染色体', length: 80, sex: true },
];

const poly = (key, chr, pos, trait, n) => ({
  key,
  chr,
  pos,
  name: `${trait === 'size' ? '体格' : '毛皮'}${n}`,
  mode: 'polygenic',
  trait,
  alleles: ['+', '-'],
  freq: [0.5, 0.5],
  labels: { '+': '増', '-': '減' },
});

// 限性のポリジーン：尾の長さ（オスに現れる）と好みの強さ（メスに現れる）
const limited = (key, chr, pos, trait, name, freq) => ({
  key,
  chr,
  pos,
  name,
  mode: 'sexlimited',
  trait,
  alleles: ['+', '-'],
  freq: [freq, 1 - freq],
  labels: { '+': '増', '-': '減' },
});

const del = (key, chr, pos, n) => ({
  key,
  chr,
  pos,
  name: `有害因子${n}`,
  mode: 'deleterious',
  alleles: ['D', 'd'],
  freq: [0.88, 0.12],
  labels: { D: '正常', d: '有害' },
  lof: true,
});

// cM（センチモルガン）で染色体上の位置を表す。
export const LOCI = [
  {
    key: 'COL',
    chr: 'C1',
    pos: 10,
    name: '体色',
    mode: 'series',
    alleles: ['K', 'G', 'w'],
    freq: [0.2, 0.5, 0.3],
    labels: { K: '黒', G: '緑', w: '白' },
  },
  {
    key: 'LET',
    chr: 'C1',
    pos: 14,
    name: '致死因子',
    mode: 'lethal',
    alleles: ['L', 'l'],
    freq: [0.92, 0.08],
    labels: { L: '正常', l: '致死' },
    lof: true,
  },
  limited('TL1', 'C1', 30, 'tail', '尾の長さ1', 0.4),
  poly('SZ1', 'C1', 45, 'size', 1),
  limited('PT1', 'C1', 60, 'prefTail', '尾への好み1', 0.3),
  poly('FR1', 'C1', 80, 'fur', 1),
  del('DL1', 'C1', 110, 1),
  {
    key: 'PAT',
    chr: 'C2',
    pos: 12,
    name: '模様',
    mode: 'codominant',
    alleles: ['S', 'T', 'o'],
    freq: [0.25, 0.25, 0.5],
    labels: { S: '斑点', T: '縞', o: '無地' },
  },
  limited('PG1', 'C2', 25, 'prefGlow', '発光への好み1', 0.3),
  {
    key: 'EAR',
    chr: 'C2',
    pos: 40,
    name: '耳の形',
    mode: 'incomplete',
    alleles: ['U', 'F'],
    freq: [0.5, 0.5],
    labels: { U: '立ち', F: '垂れ' },
  },
  limited('TL2', 'C2', 55, 'tail', '尾の長さ2', 0.4),
  poly('SZ2', 'C2', 65, 'size', 2),
  limited('PT2', 'C2', 80, 'prefTail', '尾への好み2', 0.3),
  del('DL2', 'C2', 92, 2),
  {
    key: 'VIT',
    chr: 'C3',
    pos: 15,
    name: '免疫型',
    mode: 'overdominant',
    alleles: ['A', 'B'],
    freq: [0.6, 0.4],
    labels: { A: 'A型', B: 'B型' },
  },
  limited('TL3', 'C3', 25, 'tail', '尾の長さ3', 0.4),
  poly('SZ3', 'C3', 35, 'size', 3),
  limited('PT3', 'C3', 45, 'prefTail', '尾への好み3', 0.3),
  poly('FR2', 'C3', 50, 'fur', 2),
  poly('FR3', 'C3', 62, 'fur', 3),
  limited('PG2', 'C3', 68, 'prefGlow', '発光への好み2', 0.3),
  poly('SZ4', 'C3', 75, 'size', 4),
  del('DL3', 'C3', 85, 3),
  limited('TL4', 'X', 60, 'tail', '尾の長さ4', 0.4),
  {
    key: 'GLW',
    chr: 'X',
    pos: 30,
    name: '発光',
    mode: 'xlinked',
    alleles: ['N', 'g'],
    freq: [0.8, 0.2],
    labels: { N: '非発光', g: '発光' },
  },
];

export const INDEX = Object.fromEntries(LOCI.map((l, i) => [l.key, i]));
export const LOCUS = Object.fromEntries(LOCI.map((l) => [l.key, l]));
const CHR_OF = Object.fromEntries(CHROMOSOMES.map((c) => [c.id, c]));
export const isXLinked = (locus) => CHR_OF[locus.chr].sex === true;

// 染色体ごとの遺伝子座（位置順）
export const CHR_LOCI = Object.fromEntries(
  CHROMOSOMES.map((c) => [
    c.id,
    LOCI.map((l, i) => ({ l, i }))
      .filter(({ l }) => l.chr === c.id)
      .sort((a, b) => a.l.pos - b.l.pos)
      .map(({ i }) => i),
  ]),
);

const SIZE_KEYS = LOCI.filter((l) => l.trait === 'size').map((l) => INDEX[l.key]);
const FUR_KEYS = LOCI.filter((l) => l.trait === 'fur').map((l) => INDEX[l.key]);
const DEL_KEYS = LOCI.filter((l) => l.mode === 'deleterious').map((l) => INDEX[l.key]);
const TAIL_KEYS = LOCI.filter((l) => l.trait === 'tail').map((l) => INDEX[l.key]);
const PREF_TAIL_KEYS = LOCI.filter((l) => l.trait === 'prefTail').map((l) => INDEX[l.key]);
const PREF_GLOW_KEYS = LOCI.filter((l) => l.trait === 'prefGlow').map((l) => INDEX[l.key]);

// ポリジーンの値：「＋」の割合（0〜1）。オスの X 連鎖座は 1 本だけ数える。
function polyValue(genome, idxs) {
  let plus = 0;
  let copies = 0;
  for (const i of idxs) {
    for (const a of [genome.m[i], genome.p[i]]) {
      if (a === null) continue;
      copies++;
      if (a === '+') plus++;
    }
  }
  return copies ? plus / copies : 0;
}

// オスは X 連鎖座の父由来側が null（Y 染色体）
export const isMaleGenome = (genome) => genome.p[INDEX.GLW] === null;

function sampleAllele(locus, rng) {
  const i = rng.weightedIndex(locus.freq);
  return locus.alleles[i];
}

export function randomGenome(sex, rng) {
  const m = [];
  const p = [];
  for (const locus of LOCI) {
    m.push(sampleAllele(locus, rng));
    p.push(sex === 'M' && isXLinked(locus) ? null : sampleAllele(locus, rng));
  }
  return { m, p };
}

export function mutate(locus, allele, rng) {
  if (locus.lof) {
    // 機能喪失型：正常→壊れた、は起きやすいが、逆向きの復帰突然変異はまれ
    if (allele === locus.alleles[0]) return locus.alleles[1];
    return rng.next() < 0.1 ? locus.alleles[0] : allele;
  }
  const others = locus.alleles.filter((a) => a !== allele);
  return rng.pick(others);
}

// 減数分裂で配偶子（精子・卵）をつくる。
// 各染色体で交叉回数 ~ Poisson(長さ/100cM)、交叉位置は一様（Haldane の地図関数に対応）。
export function makeGamete(genome, sex, rng, mutationRate = 0) {
  const alleles = new Array(LOCI.length);
  let hasY = false;
  for (const chr of CHROMOSOMES) {
    const idxs = CHR_LOCI[chr.id];
    if (chr.sex && sex === 'M') {
      hasY = rng.next() < 0.5;
      for (const i of idxs) alleles[i] = hasY ? null : genome.m[i];
      continue;
    }
    const n = rng.poisson(chr.length / 100);
    const cross = [];
    for (let k = 0; k < n; k++) cross.push(rng.next() * chr.length);
    cross.sort((a, b) => a - b);
    let strand = rng.next() < 0.5 ? 0 : 1;
    let ci = 0;
    for (const i of idxs) {
      const pos = LOCI[i].pos;
      while (ci < cross.length && cross[ci] < pos) {
        strand ^= 1;
        ci++;
      }
      alleles[i] = strand === 0 ? genome.m[i] : genome.p[i];
    }
  }
  if (mutationRate > 0) {
    for (let i = 0; i < alleles.length; i++) {
      if (alleles[i] !== null && rng.next() < mutationRate) {
        alleles[i] = mutate(LOCI[i], alleles[i], rng);
      }
    }
  }
  return { alleles, hasY };
}

export function fertilize(egg, sperm) {
  return {
    sex: sperm.hasY ? 'M' : 'F',
    genome: { m: egg.alleles.slice(), p: sperm.alleles.slice() },
  };
}

export function allelesAt(genome, key) {
  const i = INDEX[key];
  const out = [genome.m[i]];
  if (genome.p[i] !== null) out.push(genome.p[i]);
  return out;
}

function countOf(genome, i, allele) {
  return (genome.m[i] === allele ? 1 : 0) + (genome.p[i] === allele ? 1 : 0);
}

export function express(genome) {
  const col = allelesAt(genome, 'COL');
  const color = col.includes('K') ? 'black' : col.includes('G') ? 'green' : 'white';

  const pat = allelesAt(genome, 'PAT');
  const hasS = pat.includes('S');
  const hasT = pat.includes('T');
  const pattern = hasS && hasT ? 'both' : hasS ? 'spots' : hasT ? 'stripes' : 'plain';

  const ear = countOf(genome, INDEX.EAR, 'U');
  const male = isMaleGenome(genome);
  // 限性遺伝：遺伝子の値（tailGene など）は雌雄とも持つが、表に出るのは片方の性だけ
  const tailGene = polyValue(genome, TAIL_KEYS);
  const prefTailGene = polyValue(genome, PREF_TAIL_KEYS);
  const prefGlowGene = polyValue(genome, PREF_GLOW_KEYS);

  let sizePlus = 0;
  for (const i of SIZE_KEYS) sizePlus += countOf(genome, i, '+');
  const size = 0.7 + (0.6 * sizePlus) / (SIZE_KEYS.length * 2);

  let furPlus = 0;
  for (const i of FUR_KEYS) furPlus += countOf(genome, i, '+');
  const fur = furPlus / (FUR_KEYS.length * 2);

  const glow = allelesAt(genome, 'GLW').every((a) => a === 'g');

  const vit = allelesAt(genome, 'VIT');
  const resistance = vit[0] !== vit[1] ? 0.9 : vit[0] === 'A' ? 0.55 : 0.45;

  const lethal = allelesAt(genome, 'LET').every((a) => a === 'l');

  let load = 0;
  for (const i of DEL_KEYS) if (genome.m[i] === 'd' && genome.p[i] === 'd') load++;

  return {
    color,
    pattern,
    ear,
    tailGene,
    tail: male ? tailGene : 0, // メスの尾は常に短い
    prefTailGene,
    prefGlowGene,
    prefTail: male ? 0 : prefTailGene,
    prefGlow: male ? 0 : prefGlowGene,
    size,
    fur,
    glow,
    resistance,
    lethal,
    load,
  };
}

// "G/w" のような表記。優性側を先に、オスの X 連鎖座は "g/Y"。
export function genotypeString(genome, key) {
  const locus = LOCUS[key];
  const i = INDEX[key];
  const a = genome.m[i];
  const b = genome.p[i];
  if (b === null) return `${a}/Y`;
  const [x, y] = locus.alleles.indexOf(a) <= locus.alleles.indexOf(b) ? [a, b] : [b, a];
  return `${x}/${y}`;
}

export const COLOR_LABEL = { black: '黒', green: '緑', white: '白' };
export const PATTERN_LABEL = { spots: '斑点', stripes: '縞', both: '斑点＋縞', plain: '無地' };
export const EAR_LABEL = ['垂れ耳', '半立ち耳', '立ち耳'];

export function tailLabel(pheno) {
  if (pheno.tail === 0) return '短い（メス）';
  return `長さ ${Math.round(pheno.tail * 100)}`;
}

// 遺伝子座ごとの表現型（効果）の説明
export function locusEffect(key, genome, pheno) {
  const locus = LOCUS[key];
  const al = allelesAt(genome, key);
  const het = al.length === 2 && al[0] !== al[1];
  switch (locus.mode) {
    case 'series':
      return COLOR_LABEL[pheno.color];
    case 'codominant':
      return PATTERN_LABEL[pheno.pattern];
    case 'incomplete':
      return EAR_LABEL[pheno.ear];
    case 'sexlimited': {
      const plus = al.filter((a) => a === '+').length;
      const male = isMaleGenome(genome);
      const shows = (locus.trait === 'tail') === male;
      return shows ? `＋${plus}` : `＋${plus}（${male ? 'オス' : 'メス'}には現れない）`;
    }
    case 'polygenic': {
      const plus = al.filter((a) => a === '+').length;
      return `＋${plus}`;
    }
    case 'xlinked':
      return pheno.glow ? '発光する' : het ? '発光しない（保因者）' : '発光しない';
    case 'overdominant':
      return het ? '免疫力：強（ヘテロ）' : '免疫力：弱';
    case 'lethal':
      return het ? '健康（保因者）' : '健康';
    case 'deleterious':
      return al.every((a) => a === 'd') ? '発症（虚弱）' : het ? '健康（保因者）' : '健康';
    default:
      return '';
  }
}

export function isCarrier(key, genome) {
  const locus = LOCUS[key];
  if (!['lethal', 'deleterious', 'xlinked'].includes(locus.mode)) return false;
  const al = allelesAt(genome, key);
  return al.length === 2 && al[0] !== al[1];
}

// 2 個体から生まれる子の表現型分布をモンテカルロで予測する
export function predictOffspring(mother, father, rng, n = 4000) {
  const out = {
    n,
    lethal: 0,
    color: { black: 0, green: 0, white: 0 },
    pattern: { spots: 0, stripes: 0, both: 0, plain: 0 },
    ear: [0, 0, 0],
    tailM: 0,
    prefTailF: 0,
    glowM: 0,
    males: 0,
    glowF: 0,
    females: 0,
    resistant: 0,
    sick: 0,
    size: 0,
    fur: 0,
  };
  for (let k = 0; k < n; k++) {
    const egg = makeGamete(mother.genome, 'F', rng);
    const sperm = makeGamete(father.genome, 'M', rng);
    const z = fertilize(egg, sperm);
    const ph = express(z.genome);
    if (ph.lethal) {
      out.lethal++;
      continue;
    }
    out.color[ph.color]++;
    out.pattern[ph.pattern]++;
    out.ear[ph.ear]++;
    if (z.sex === 'M') {
      out.males++;
      out.tailM += ph.tail;
      if (ph.glow) out.glowM++;
    } else {
      out.females++;
      out.prefTailF += ph.prefTail;
      if (ph.glow) out.glowF++;
    }
    if (ph.resistance > 0.8) out.resistant++;
    if (ph.load > 0) out.sick++;
    out.size += ph.size;
    out.fur += ph.fur;
  }
  const born = n - out.lethal;
  out.size /= Math.max(1, born);
  out.fur /= Math.max(1, born);
  out.tailM /= Math.max(1, out.males);
  out.prefTailF /= Math.max(1, out.females);
  out.born = born;
  return out;
}
