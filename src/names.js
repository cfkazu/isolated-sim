// 個体の名前。シミュレーションの乱数を消費しないよう、シードと ID から決定的に作る。

import { hashSeed, createRng } from './rng.js';

const SYLLABLES = [
  'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ',
  'マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ワ',
  'ガ', 'ギ', 'グ', 'ゴ', 'ザ', 'ジ', 'ズ', 'ダ', 'ド', 'バ', 'ビ', 'ブ', 'ボ', 'パ', 'ピ', 'プ', 'ポ',
];

export function makeName(seed, id, salt = 0) {
  const r = createRng(hashSeed(`${seed}/${id}/${salt}`));
  let name = r.pick(SYLLABLES) + r.pick(SYLLABLES);
  const x = r.next();
  if (x < 0.25) name += r.pick(SYLLABLES);
  else if (x < 0.4) name += 'ン';
  else if (x < 0.48) name += 'ー';
  return name;
}
