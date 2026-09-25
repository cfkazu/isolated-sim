// 集団遺伝学の統計：対立遺伝子頻度、ヘテロ接合度、ハーディー・ワインベルグ期待値など。

import { LOCI, INDEX, LOCUS, isXLinked, genotypeString } from './genes.js';

export function alleleFrequencies(creatures) {
  const out = {};
  for (const locus of LOCI) {
    const i = INDEX[locus.key];
    const counts = Object.fromEntries(locus.alleles.map((a) => [a, 0]));
    let total = 0;
    for (const c of creatures) {
      counts[c.genome.m[i]]++;
      total++;
      const p = c.genome.p[i];
      if (p !== null) {
        counts[p]++;
        total++;
      }
    }
    const freq = Object.fromEntries(locus.alleles.map((a) => [a, total ? counts[a] / total : 0]));
    out[locus.key] = { counts, total, freq };
  }
  return out;
}

// Ho: 観測ヘテロ接合度、He: 期待ヘテロ接合度（1 - Σp²）。X 連鎖座はメスのみで Ho を数える。
export function heterozygosity(creatures, freqs = alleleFrequencies(creatures)) {
  let hoSum = 0;
  let heSum = 0;
  let n = 0;
  for (const locus of LOCI) {
    const i = INDEX[locus.key];
    let het = 0;
    let dip = 0;
    for (const c of creatures) {
      const p = c.genome.p[i];
      if (p === null) continue;
      dip++;
      if (c.genome.m[i] !== p) het++;
    }
    const f = freqs[locus.key].freq;
    let sq = 0;
    for (const a of locus.alleles) sq += f[a] * f[a];
    hoSum += dip ? het / dip : 0;
    heSum += freqs[locus.key].total ? 1 - sq : 0;
    n++;
  }
  return { Ho: hoSum / n, He: heSum / n };
}

// 遺伝子型ごとの観測数とハーディー・ワインベルグ期待数（二倍体の個体のみ）
export function genotypeTable(creatures, key, freqs) {
  const locus = LOCUS[key];
  const i = INDEX[key];
  const observed = new Map();
  let diploids = 0;
  const hemi = new Map();
  for (const c of creatures) {
    const g = genotypeString(c.genome, key);
    if (c.genome.p[i] === null) {
      hemi.set(g, (hemi.get(g) || 0) + 1);
      continue;
    }
    diploids++;
    observed.set(g, (observed.get(g) || 0) + 1);
  }
  const f = freqs[key].freq;
  const rows = [];
  const al = locus.alleles;
  for (let a = 0; a < al.length; a++) {
    for (let b = a; b < al.length; b++) {
      const g = `${al[a]}/${al[b]}`;
      const expFreq = a === b ? f[al[a]] ** 2 : 2 * f[al[a]] * f[al[b]];
      rows.push({ genotype: g, observed: observed.get(g) || 0, expected: expFreq * diploids });
    }
  }
  if (isXLinked(locus)) {
    for (const a of al) {
      const g = `${a}/Y`;
      rows.push({ genotype: g, observed: hemi.get(g) || 0, expected: f[a] * [...hemi.values()].reduce((s, v) => s + v, 0), hemizygous: true });
    }
  }
  return { rows, diploids };
}

export function phenotypeSummary(creatures) {
  const color = { black: 0, green: 0, white: 0 };
  const pattern = { spots: 0, stripes: 0, both: 0, plain: 0 };
  const tail = [0, 0, 0];
  let glowM = 0;
  let glowF = 0;
  let size = 0;
  let fur = 0;
  let resistant = 0;
  let sick = 0;
  for (const c of creatures) {
    const ph = c.pheno;
    color[ph.color]++;
    pattern[ph.pattern]++;
    tail[ph.tail]++;
    if (ph.glow) c.sex === 'M' ? glowM++ : glowF++;
    size += ph.size;
    fur += ph.fur;
    if (ph.resistance > 0.8) resistant++;
    if (ph.load > 0) sick++;
  }
  const n = Math.max(1, creatures.length);
  return { color, pattern, tail, glowM, glowF, meanSize: size / n, meanFur: fur / n, resistant, sick };
}
