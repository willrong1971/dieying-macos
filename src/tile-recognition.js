const numerals = [...'一二三四五六七八九'];
const pinyin = ['yī', 'èr', 'sān', 'sì', 'wǔ', 'liù', 'qī', 'bā', 'jiǔ'];

export const tileGroups = [
  {id: 'characters', zh: '万', en: 'Characters', tip: ['看红色「萬」上方的数字。萬是万的繁体字。', 'Read the Chinese numeral above the red 萬, the traditional form of 万.']},
  {id: 'bamboo', zh: '条', en: 'Bamboo', tip: ['数一数有几节竹子，记住一条是幺鸡。', 'Count the bamboo sticks. The bird is the special design for one bamboo.']},
  {id: 'dots', zh: '筒', en: 'Dots', tip: ['数整组圆圈。同一个圆圈里的几道纹路，只算一筒。', 'Count the circles. The rings inside each circle are part of a single dot.']},
  {id: 'wind', zh: '风', en: 'Winds', tip: ['东、南、西、北是四个方向。「東」就是「东」。', 'The four winds are East, South, West and North. 東 is the traditional form of 东.']},
  {id: 'dragon', zh: '三元', en: 'Dragons', tip: ['认红色的「中」、绿色的「發」，还有蓝框白板。', 'Look for the red 中, the green 發 and the blue frame of the White Dragon in this set.']},
  {id: 'flower', zh: '花', en: 'Flowers', tip: ['这套牌用梅、兰、菊、竹作花牌。先认图，再找角上的小字。', 'This set uses plum, orchid, chrysanthemum and bamboo. Look at the drawing and the small character in the corner.']},
  {id: 'season', zh: '季节', en: 'Seasons', tip: ['这套季节牌角上写着春、夏、秋、冬。用小字来确认图案。', 'Read 春, 夏, 秋 and 冬 in the corner to identify the four seasons.']},
];

const reading = {
  characters: ['万', 'wàn', 'characters'],
  bamboo: ['条', 'tiáo', 'bamboo'],
  dots: ['筒', 'tǒng', 'dot'],
};
const honors = {
  wind: [
    ['east', '东风', 'dōng fēng', 'East Wind'],
    ['south', '南风', 'nán fēng', 'South Wind'],
    ['west', '西风', 'xī fēng', 'West Wind'],
    ['north', '北风', 'běi fēng', 'North Wind'],
  ],
  dragon: [
    ['red', '红中', 'hóng zhōng', 'Red Dragon'],
    ['green', '发财', 'fā cái', 'Green Dragon'],
    ['white', '白板', 'bái bǎn', 'White Dragon'],
  ],
  flower: [
    ['plum', '梅', 'méi', 'Plum Blossom'],
    ['orchid', '兰', 'lán', 'Orchid'],
    ['chrysanthemum', '菊', 'jú', 'Chrysanthemum'],
    ['bamboo', '竹', 'zhú', 'Bamboo Flower Tile'],
  ],
  season: [
    ['spring', '春', 'chūn', 'Spring'],
    ['summer', '夏', 'xià', 'Summer'],
    ['autumn', '秋', 'qiū', 'Autumn'],
    ['winter', '冬', 'dōng', 'Winter'],
  ],
};

export const faces = new Map();
for (const group of tileGroups) {
  const numbers = reading[group.id];
  const rows = numbers ? numerals.map((numeral, index) => {
    const number = index + 1;
    const [zh, sound, en] = numbers;
    const bird = group.id === 'bamboo' && number === 1;
    return [
      String(number).padStart(2, '0'),
      bird ? '一条（幺鸡）' : numeral + zh,
      pinyin[index] + ' ' + sound + (bird ? ' · yāo jī' : ''),
      number + ' ' + en + (group.id === 'dots' && number > 1 ? 's' : ''),
    ];
  }) : honors[group.id];
  group.faces = rows.map(([key, zh, pinyin, en]) => {
    const face = {id: group.id + '_' + key, group, zh, en, pinyin};
    faces.set(face.id, face);
    return face;
  });
}

export const comparison = ['characters_09', 'bamboo_01', 'dots_01'];

export function faceImage(face, theme) {
  const folder = theme === 'ivory' ? 'ivory-warm' : 'v2';
  return new URL('../public/tiles/' + folder + '/' + face + '.png', import.meta.url).href;
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function practiceRound(previous = []) {
  const tiles = [...faces.values()];
  // A round spans all seven groups, with no repeated answers.
  const pick = group => shuffled(group.faces.filter(face => !previous.includes(face.id)))[0];
  const targets = shuffled(tileGroups.map(pick));
  return targets.map((target, index) => {
    const candidates = index < 3
      ? shuffled(tiles.filter(face => face.group !== target.group))
      : shuffled(target.group.faces.filter(face => face !== target));
    return {target, options: shuffled([target, ...candidates.slice(0, 2)])};
  });
}
