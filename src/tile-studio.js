import {comparison, faceImage, faces, practiceRound, tileGroups} from './tile-recognition.js';
import {TileStudioViewer} from './tile-studio-viewer.js';
import {ImmersiveMode} from './solitaire-immersive.js';

const translations = {
  brand: ['麻将数学工坊', 'Mahjong Math Workshop'],
  workshop: ['数学桌', 'Math workshop'],
  solitaire: ['对对碰', 'Solitaire'],
  title: ['认牌馆', 'Tile Gallery'],
  lead: ['认识 42 种麻将牌，转动牌面细看花纹。', 'Learn the 42 tile faces and turn them to see the carving.'],
  modes: ['查看方式', 'Activity'],
  learn: ['认识牌面', 'Explore tiles'],
  practice: ['认牌练习', 'Practice'],
  viewer: ['立体鉴赏', '3D display'],
  display: ['三维麻将牌。可用方向键旋转，用加号和减号缩放。', '3D mahjong tiles. Use arrow keys to rotate and plus or minus to zoom.'],
  choices: ['候选牌', 'Tile choices'],
  angles: ['角度和缩放', 'View and zoom'],
  front: ['正面', 'Front'],
  back: ['牌背', 'Back'],
  relief: ['掠光近看', 'Raking light'],
  reset: ['复位', 'Reset'],
  zoomIn: ['放大', 'Zoom in'],
  zoomOut: ['缩小', 'Zoom out'],
  immersive: ['沉浸鉴赏', 'Full screen'],
  exit: ['返回菜单 · Esc', 'Exit full screen · Esc'],
  controls: ['拖动旋转 · 滚轮或双指缩放', 'Drag to rotate · Scroll or pinch to zoom'],
  engraving: ['侧光照出凹槽边缘 · 槽底深约 0.52 毫米', 'Light from the side reveals the edges · Grooves are about 0.52 mm deep'],
  browse: ['按花色看牌', 'Browse by group'],
  count: ['42 种牌面', '42 faces'],
  groupFilters: ['花色', 'Tile groups'],
  tileFaces: ['当前花色的牌', 'Tiles in this group'],
  compare: ['对照万、条、筒', 'Compare the three suits'],
  compareName: ['九万 · 幺鸡 · 一筒', '9 Characters · 1 Bamboo · 1 Dot'],
  compareTip: ['万看汉字，条数竹节，筒数圆圈。左、中、右三张牌分别属于这三门。', 'Read characters, count bamboo sticks, or count circles. These tiles show the three numbered suits.'],
  practiceTip: ['看名字找牌。答错会给一条辨认线索，可以接着试。', 'Pick the tile that matches its name. A wrong guess gives you a clue and another try.'],
  material: ['牌的材质', 'Tile material'],
  ivory: ['暖象牙', 'Warm ivory'],
  bamboo: ['竹制', 'Bamboo'],
  porcelain: ['白瓷', 'Porcelain'],
  retry: ['重试立体画面', 'Retry 3D'],
  loading: ['准备立体牌面…', 'Loading 3D tiles…'],
  unavailable: ['正在使用牌面图', 'Showing tile images'],
  next: ['下一题 →', 'Next tile →'],
  finish: ['查看结果 →', 'See results →'],
  again: ['再练一轮', 'Play again'],
  completed: ['这一轮认完啦！', 'Round complete!'],
};

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const allIds = [...faces.keys()];
const themes = ['ivory', 'bamboo', 'porcelain'];
const compareButton = $('#compare');
const busyControls = [...document.querySelectorAll('[data-view], [data-zoom]')];
let theme = themes.includes(params.get('material')) ? params.get('material') : 'ivory';
let selected = faces.get(params.get('face')) || faces.get('bamboo_01');
let comparisonActive = params.get('view') === 'compare' && !faces.has(params.get('face'));
let language = params.get('lang') === 'en' ? 1 : 0;
let page = 'learn';
let inspection = 'reset';
let viewer;
let modelState = 'idle';
let modelProgress;
let round = [];
let questionIndex = 0;
let misses = new Set();
let answered = false;
let firstTry = 0;

const phrase = key => translations[key][language];
const localizedName = item => language ? item.en : item.zh;
const setText = (selector, value) => { $(selector).textContent = value; };

function button(value, label, dataKey) {
  const element = document.createElement('button');
  element.type = 'button';
  element.dataset[dataKey] = value;
  element.textContent = label;
  return element;
}

function tileImage(face, label = '') {
  const image = document.createElement('img');
  image.src = faceImage(face, theme);
  image.alt = label;
  image.draggable = false;
  return image;
}

function currentIds() {
  return comparisonActive ? comparison : [selected.id];
}

function syncModelStatus() {
  const ready = modelState === 'ready';
  const failed = ['error', 'lost'].includes(modelState);
  busyControls.forEach(control => { control.disabled = !ready; });
  $('#retry-load').hidden = !failed || page !== 'learn';
  $('#preview').hidden = page !== 'learn' || ready;
  const title = comparisonActive ? phrase('compareName') : localizedName(selected);
  setText('#model-status', ready ? title : failed
    ? phrase('unavailable')
    : phrase('loading') + (modelProgress === undefined ? '' : ' ' + modelProgress + '%'));
}

function renderInfo() {
  const {group} = selected;
  const bonus = ['flower', 'season'].includes(group.id);
  const suffix = ['characters', 'bamboo', 'dots'].includes(group.id) ? '子' : '牌';
  const groupLabel = language
    ? group.en + (bonus ? ' · Bonus tiles' : '')
    : group.zh + suffix + (bonus ? ' · 奖励牌' : '');
  setText('#group-name', comparisonActive ? (language ? 'Numbered suits' : '三门数牌') : groupLabel);
  setText('#group-position', comparisonActive ? '' : (group.faces.indexOf(selected) + 1) + ' / ' + group.faces.length);
  setText('#face-name', comparisonActive ? phrase('compareName') : localizedName(selected));
  setText('#face-pinyin', comparisonActive ? '' : selected.pinyin);
  setText('#face-translation', comparisonActive ? '' : language ? selected.zh : selected.en);
  $('#face-translation').lang = language ? 'zh-CN' : 'en';
  setText('#face-tip', comparisonActive ? phrase('compareTip') : group.tip[language]);

  $('#group-buttons').replaceChildren(...tileGroups.map(item => {
    const control = button(item.id, localizedName(item), 'group');
    control.setAttribute('aria-pressed', String(!comparisonActive && item === group));
    return control;
  }));
  $('#face-buttons').replaceChildren(...group.faces.map(face => {
    const control = button(face.id, '', 'face');
    control.append(tileImage(face.id));
    control.title = localizedName(face);
    control.setAttribute('aria-label', localizedName(face));
    control.setAttribute('aria-pressed', String(!comparisonActive && face === selected));
    return control;
  }));
  compareButton.setAttribute('aria-pressed', String(comparisonActive));
}

function renderExplore() {
  renderInfo();
  const preview = currentIds().map(id => tileImage(id, localizedName(faces.get(id))));
  $('#preview').replaceChildren(...preview);
  const canvasLabel = currentIds().map(id => localizedName(faces.get(id))).join(language ? ', ' : '、');
  $('#studio-canvas').setAttribute('aria-label', canvasLabel + (language ? '. ' : '。') + phrase('display'));
  viewer?.setFaces(currentIds());
  syncModelStatus();
}

function changeView(view) {
  inspection = view;
  document.querySelectorAll('[data-view]').forEach(control => {
    control.setAttribute('aria-pressed', String(control.dataset.view === inspection));
  });
  setText('#display-caption', inspection === 'relief' ? phrase('engraving') : phrase('controls'));
  if (view) viewer?.setView(view);
}

function selectFace(face, focusSelector) {
  selected = face;
  comparisonActive = false;
  changeView(inspection || 'reset');
  renderExplore();
  if (focusSelector) $(focusSelector)?.focus({preventScroll: true});
}

function renderPractice() {
  const question = round[questionIndex];
  const finished = !question;
  const prompt = finished ? phrase('completed')
    : language ? 'Find ' + question.target.en : '哪张是' + question.target.zh + '？';
  setText('#practice-step', finished ? '' : language
    ? 'Tile ' + (questionIndex + 1) + ' of ' + round.length
    : '第 ' + (questionIndex + 1) + ' 张 · 共 ' + round.length + ' 张');
  setText('#question', prompt);
  setText('#question-reading', finished ? '' : question.target.pinyin);
  const choices = finished ? [] : question.options.map((face, i) => {
    const control = button(face.id, '', 'option');
    control.setAttribute('aria-label', language ? 'Tile ' + (i + 1) : '第 ' + (i + 1) + ' 张候选牌');
    control.append(tileImage(face.id));
    return control;
  });
  $('#choices').replaceChildren(...choices);
  $('#choices').hidden = finished;
  syncAnswer();
}

function syncAnswer() {
  const question = round[questionIndex];
  const finished = !question;
  const target = question?.target;
  const feedback = finished ? (language ? 'Correct on the first try: ' + firstTry + ' of ' + round.length : '一次认对了 ' + firstTry + ' / ' + round.length + ' 张。')
    : answered ? (language ? 'Correct! This is ' + target.en + '.' : '找对了！这是' + target.zh + '。')
    : misses.size ? (language ? 'Take another look and try again.' : '再看一眼，试试另一张。') : '';
  setText('#answer-feedback', feedback);
  $('#practice-hint').hidden = finished || !misses.size || answered;
  if (target) setText('#practice-hint', target.group.tip[language]);
  const next = $('#next-question');
  next.hidden = !finished && !answered;
  next.textContent = phrase(finished ? 'again' : questionIndex === round.length - 1 ? 'finish' : 'next');
  document.querySelectorAll('[data-option]').forEach(control => {
    const id = control.dataset.option;
    control.dataset.result = answered && id === target.id ? 'correct' : misses.has(id) ? 'wrong' : '';
    control.disabled = (answered && id !== target.id) || misses.has(id);
    if (answered && id === target.id) {
      control.setAttribute('aria-label', localizedName(target));
      control.setAttribute('aria-disabled', 'true');
    }
  });
}

function startPractice() {
  round = practiceRound(round.map(question => question.target.id));
  questionIndex = 0;
  firstTry = 0;
  misses = new Set();
  answered = false;
  renderPractice();
}

function setPage(nextPage) {
  if (page === nextPage) return;
  page = nextPage;
  const practice = page === 'practice';
  document.documentElement.classList.toggle('is-practice', practice);
  $('#learn-mode').setAttribute('aria-pressed', String(!practice));
  $('#practice-mode').setAttribute('aria-pressed', String(practice));
  $('#practice-board').hidden = !practice;
  $('#practice-details').hidden = !practice;
  $('#learn-details').hidden = practice;
  $('.display-card').setAttribute('aria-labelledby', practice ? 'question' : 'display-title');
  $('.material-row').hidden = practice;
  viewer?.setVisible(!practice);
  if (!practice) viewer?.loadTheme(theme, allIds);
  if (practice && !round.length) startPractice();
  syncModelStatus();
}

function renderLanguage() {
  document.documentElement.lang = language ? 'en' : 'zh-CN';
  document.title = phrase('title') + ' · ' + phrase('brand');
  document.querySelectorAll('[data-word]').forEach(element => { element.textContent = phrase(element.dataset.word); });
  document.querySelectorAll('[data-label]').forEach(element => { element.setAttribute('aria-label', phrase(element.dataset.label)); });
  $('.museum-brand').setAttribute('aria-label', phrase('brand'));
  const control = $('#language-button');
  control.textContent = language ? '中文' : 'English';
  control.lang = language ? 'zh-CN' : 'en';
  renderExplore();
  if (round.length) renderPractice();
  setText('#display-caption', inspection === 'relief' ? phrase('engraving') : phrase('controls'));
}

function setTheme(nextTheme) {
  theme = nextTheme;
  document.querySelectorAll('[data-theme]').forEach(control => {
    control.setAttribute('aria-pressed', String(control.dataset.theme === theme));
  });
  if (page === 'learn') viewer?.loadTheme(theme, allIds);
  renderExplore();
  if (page === 'practice') renderPractice();
}

$('#language-button').addEventListener('click', () => {
  language = 1 - language;
  renderLanguage();
});
$('#learn-mode').addEventListener('click', () => setPage('learn'));
$('#practice-mode').addEventListener('click', () => setPage('practice'));
$('#group-buttons').addEventListener('click', event => {
  const control = event.target.closest('[data-group]');
  if (!control) return;
  const group = tileGroups.find(item => item.id === control.dataset.group);
  selectFace(group === selected.group ? selected : group.faces[0], '[data-group="' + group.id + '"]');
});
$('#face-buttons').addEventListener('click', event => {
  const control = event.target.closest('[data-face]');
  if (control) selectFace(faces.get(control.dataset.face), '[data-face="' + control.dataset.face + '"]');
});
compareButton.addEventListener('click', () => {
  comparisonActive = !comparisonActive;
  renderExplore();
  changeView('reset');
});
$('.material-row').addEventListener('click', event => {
  const control = event.target.closest('[data-theme]');
  if (control && control.dataset.theme !== theme) setTheme(control.dataset.theme);
});
$('.viewer-bar').addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control || control.disabled) return;
  if (control.dataset.view) changeView(control.dataset.view);
  if (control.dataset.zoom) viewer?.zoom(Number(control.dataset.zoom));
});
$('#studio-canvas').addEventListener('keydown', event => {
  const angles = {ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, .09], ArrowDown: [0, -.09]};
  if (angles[event.key]) viewer?.rotate(...angles[event.key]);
  else if (['+', '=', '-'].includes(event.key)) viewer?.zoom(event.key === '-' ? 1.22 : .82);
  else return;
  event.preventDefault();
});
$('#choices').addEventListener('click', event => {
  const control = event.target.closest('[data-option]');
  const question = round[questionIndex];
  if (answered || !question || !control) return;
  const id = control.dataset.option;
  answered = id === question.target.id;
  if (answered && !misses.size) firstTry++;
  if (!answered) misses.add(id);
  syncAnswer();
  if (answered) $('#next-question').focus();
  else $('#choices button:not(:disabled)')?.focus();
});
$('#next-question').addEventListener('click', () => {
  if (!round[questionIndex]) startPractice();
  else if (answered) {
    questionIndex++;
    misses = new Set();
    answered = false;
    renderPractice();
  }
  const focus = $('#choices button') || $('#next-question');
  focus.focus();
});
$('#retry-load').addEventListener('click', () => {
  if (viewer && modelState !== 'lost') viewer.loadTheme(theme, allIds);
  else location.reload();
});

renderLanguage();
try {
  viewer = new TileStudioViewer({
    canvas: $('#studio-canvas'),
    stage: $('#stage'),
    onState(state, progress) {
      modelState = state;
      modelProgress = progress;
      syncModelStatus();
    },
    onCustomView() {
      document.querySelectorAll('[data-view]').forEach(control => control.setAttribute('aria-pressed', 'false'));
    },
  });
  viewer.setVisible(true);
  setTheme(theme);
} catch (error) {
  modelState = 'error';
  syncModelStatus();
  console.error('Tile gallery renderer:', error);
}

document.addEventListener('keydown', event => {
  if (page === 'practice' && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'i') event.stopImmediatePropagation();
}, true);
const immersive = new ImmersiveMode({
  button: $('#immersive-enter'),
  exitButton: $('#immersive-exit'),
  onResize: () => viewer?.resize(),
  onChange: () => $('#immersive-enter').setAttribute('aria-label', phrase('immersive')),
});
$('#immersive-enter').setAttribute('aria-label', phrase('immersive'));
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  viewer?.dispose();
  immersive.dispose();
});
