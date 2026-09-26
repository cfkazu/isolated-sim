// シナリオ：島の始まり方のテンプレート。
// 自然のままでは起きにくい状況（家ごとに固まって住む、東と西が両端から出会う…）から始めて、その後を観察する。
// 始まり方だけを決め、その後の規則は変えない。
//
// あとで自分でもシナリオを書けるように、すべてデータ（JSON にできる形）で書く。
//   opts      : 島の設定（DEFAULTS のうち上書きしたいもの）
//   climateStart : 気候の波のどこから始めるか（0 = 間氷期の始まり、0.8 = 氷期の底、1 の手前 = 急な温暖化）
//   freqs     : 最初の個体全員の遺伝子の割合 { 遺伝子座: { 対立遺伝子: 重み } }
//   groups    : 最初の個体をいくつかの群れに分ける [{ name, share, place: { x, y, r }, clan, origin, freqs }]
//               place は島全体を 0〜1 とした位置と半径。clan: true なら群れのメスは全員同じ家（母系）
//   events    : [{ year, event }]。event は「神の介入」と同じ名前（epidemic, famine, cold, warm, supercold, storm, castaway, predators）
//   watch     : 見どころの案内（文章）

const LOW_DISPERSAL = { DM1: { '+': 0.05 }, DM2: { '+': 0.05 }, DF1: { '+': 0.05 }, DF2: { '+': 0.05 } };

export const SCENARIOS = {
  free: {
    label: '自由（標準）',
    desc: '百匹を島じゅうに散らして始める。いつもの島。',
    watch: [],
  },
  villages: {
    label: '四つの村',
    desc: '四つの家が島の四隅に分かれて暮らしている。家ごとに体色が違い、みんなあまり旅立たない。',
    opts: { islandShape: 'single' },
    freqs: LOW_DISPERSAL,
    groups: [
      { name: '北西の村', share: 0.25, place: { x: 0.26, y: 0.3, r: 0.09 }, clan: true, freqs: { COL: { K: 0.8, G: 0.2 } } },
      { name: '北東の村', share: 0.25, place: { x: 0.74, y: 0.3, r: 0.09 }, clan: true, freqs: { COL: { G: 1 } } },
      { name: '南西の村', share: 0.25, place: { x: 0.26, y: 0.7, r: 0.09 }, clan: true, freqs: { COL: { w: 1 }, PAT: { T: 0.8, o: 0.2 } } },
      { name: '南東の村', share: 0.25, place: { x: 0.74, y: 0.7, r: 0.09 }, clan: true, freqs: { COL: { G: 0.5, w: 0.5 }, PAT: { S: 0.8, o: 0.2 } } },
    ],
    watch: [
      '地図の表示を「家（母系）」にして、村の境目がいつ崩れるか。',
      '旅立ちの遺伝子（集団タブ）：あまり旅立たない群れから、遠くへ行く個体は現れるか。',
      '「集団」タブの家ごとの特徴：村ごとの体色の違いは何年残るか。',
    ],
  },
  eastwest: {
    label: '東と西の出会い',
    desc: '東の土地の群れが島の東端に、西の土地の群れが西端に着いた。両者の間の子は子ができにくい。',
    opts: { islandShape: 'single' },
    groups: [
      { name: '東の群れ', share: 0.5, place: { x: 0.72, y: 0.5, r: 0.12 }, origin: 0 },
      { name: '西の群れ', share: 0.5, place: { x: 0.28, y: 0.5, r: 0.12 }, origin: 1 },
    ],
    watch: [
      '地図の表示を「東西の由来」にして、島の真ん中にできる交雑帯（赤紫の雑種）を見る。',
      '交雑帯は動くか、消えるか。最後に島は東型・西型・祖先型のどれに染まるか。',
    ],
  },
  whiteisland: {
    label: '白い島の緑の群れ',
    desc: '白い砂と石灰岩のサンゴ礁の島に、緑の群れがたどり着いた。白の遺伝子 w はわずか。',
    opts: { geology: 'coral', initialPredators: 10 },
    freqs: { COL: { G: 0.95, w: 0.05 } },
    watch: ['隠れていた白の遺伝子 w（劣性）は、捕食者に選ばれて増えるか。遺伝子頻度タブの体色と、自然選択タブの体色の生存率。'],
  },
  iceage: {
    label: '氷河期の入口',
    desc: '寒冷化の途中から始まり、30 年目に超寒冷期が来る。冬に白くなる換毛の遺伝子がわずかにある。',
    climateStart: 0.62,
    freqs: { MLT: { W: 0.08, b: 0.92 } },
    events: [{ year: 30, event: 'supercold' }],
    watch: ['超寒冷期のあと、換毛の遺伝子 W と毛皮の厚さはどう変わるか。暖かくなったら白い冬毛はどうなるか。'],
  },
  bottleneck: {
    label: '十匹からの出発',
    desc: '島に着いたのは 10 匹だけ。近親交配は避けられない。',
    opts: { initialCount: 10, initialPredators: 2 },
    watch: [
      '近交係数と遺伝的多様性（集団タブ）。有害因子や致死因子は表に出て、浄化されるか。',
      '創始者の系統：最後まで子孫を残すのは何匹か。',
    ],
  },
  paradise: {
    label: '捕食者のいない楽園',
    desc: '捕食者のいない島。60 年目に捕食者が海を渡ってくる。',
    opts: { initialPredators: 0 },
    events: [{ year: 60, event: 'predators' }],
    watch: ['捕食者がいない間、目立つ体色・長い尾・発光はどこまで広まるか。捕食者が来てから、何が真っ先に減るか。'],
  },
};

// 最初の個体 k（全 n 匹のうち）が属する群れ
export function groupOf(sc, k, n) {
  const gs = sc?.groups;
  if (!gs?.length) return null;
  const total = gs.reduce((t, g) => t + (g.share ?? 1), 0);
  let acc = 0;
  for (let i = 0; i < gs.length; i++) {
    acc += (gs[i].share ?? 1) / total;
    if (k < Math.round(acc * n)) return i;
  }
  return gs.length - 1;
}
