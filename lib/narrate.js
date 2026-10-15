// 星盤解析 → 口語講稿（語音解說用）
// 規格：docs/astro-contract.md 第 8.1 節。輸出結構與紫微 ../ziwei-desk/lib/narrate.mjs 一字不差。
// 原則：不是把報告照念，而是「阿良在跟一個人說話」：第一人稱、短句、台灣口語。
// 分數、年齡都從結構化欄位來，交給 toSpeakable 轉成中文念法；度數不念；ASC／MC 先用 SPEAK_REPLACE 換成上升點／天頂。
// 不用亂數、不看現在時間：同樣的輸入一定產生同樣的講稿（「今年」用 analysis.year）。
import { splitSentences, toSpeakable, estimateSeconds } from './speech-text.js?v=8be9bc87';
import { SIGN_BY_NAME } from '../kb/signs.js?v=8be9bc87';
import { PLANETS } from '../kb/planets.js?v=8be9bc87';
import { HOUSES, houseName } from '../kb/houses.js?v=8be9bc87';
import { PLANET_SIGN_A } from '../kb/planet-sign-a.js?v=8be9bc87';
import { PLANET_SIGN_B } from '../kb/planet-sign-b.js?v=8be9bc87';
import { PLANET_HOUSE_A } from '../kb/planet-house-a.js?v=8be9bc87';
import { PLANET_HOUSE_B } from '../kb/planet-house-b.js?v=8be9bc87';
import { SPEAK_REPLACE } from '../kb/pronounce.js?v=8be9bc87';

export const NARRATION_VERSION = 1;
export const CHAPTER_ORDER = ['intro', 'overview', 'career', 'wealth', 'family', 'love', 'health', 'work', 'cycles', 'year', 'outro'];

export const CHAPTER_TITLES = Object.freeze({
  intro: '開場', overview: '你的三大主星', career: '事業', wealth: '財運', family: '家庭',
  love: '感情', health: '健康', work: '適合的工作', cycles: '人生週期', year: '今年行運', outro: '結語',
});

const DOMAIN_OF = { career: '事業', wealth: '財運', family: '家庭', love: '感情', health: '健康' };
const DOMAIN_IDS = ['career', 'wealth', 'family', 'love', 'health'];
const CALL_SUFFIX = ['先生', '小姐', '太太', '大哥', '大姐', '哥', '姐', '老師', '醫師', '董', '總'];
const MAIN_TEN = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/* ───────── 口語對照表 ───────── */

const LEVEL_SPOKEN = { 極佳: '非常好', 良好: '不錯', 平順: '平順', 起伏: '有些起伏', 辛苦: '比較辛苦' };

const DIGNITY_SPOKEN = {
  domicile: '入廟，本事發揮得很自然',
  exaltation: '擢升，優點會被放大',
  detriment: '失勢，用起來比較彆扭，要刻意練習',
  fall: '落陷，優點不太容易發揮，可以找擅長的人補位',
};

// 行星落在主宮：優勢的說法（正面本質分的行星）
const PLANET_GOOD_SPOKEN = {
  jupiter: '機會和資源比較容易自己出現',
  venus: '這一塊比較討喜，容易有好感和人緣',
  sun: '你的重心和精力很自然就放在這裡',
  moon: '你在這裡特別有感覺，也特別投入',
  mercury: '你在這裡腦筋動得快，也講得清楚',
  northnode: '這是你這輩子要往前走的方向，越走越有收穫',
};
// 行星落在主宮：要留意的說法（負面本質分的行星）
const PLANET_RISK_SPOKEN = {
  mars: '這裡容易急、容易起衝突，但也是你最有衝勁的地方',
  saturn: '這裡會比較有壓力、走得慢，但練出來的東西最扎實',
  uranus: '這裡變動比較多，你不太喜歡照規矩來',
  neptune: '這裡容易看不清楚、想得太美，要多確認',
  pluto: '這裡你會很投入，但也容易控制過頭',
};
// 健康章講身體，不講做人做事
const HEALTH_GOOD_SPOKEN = {
  jupiter: '身體的恢復力不錯，底子算好',
  venus: '你懂得享受，也懂得放鬆，這對身體是好事',
  sun: '你的精力很自然放在日常和身體上，肯照顧自己',
  moon: '你對身體的訊號很敏感，不舒服會比較早察覺',
  mercury: '你會用腦袋管理作息，適合用清單和記錄照顧身體',
  northnode: '作息是你這輩子要學的功課，學起來會很有感',
};
const HEALTH_RISK_SPOKEN = {
  mars: '容易硬撐、過勞，小傷和發炎要早點處理',
  saturn: '身體傾向累積型的緊繃，肩頸和睡眠要固定顧',
  uranus: '作息容易不規律，要自己訂一個底線',
  neptune: '身體狀況跟情緒連在一起，睡不好就是警訊',
  pluto: '容易把身體逼到極限，記得把停下來當成正事',
};

// 找不到具體優勢／風險時，各章自己的說法
const GENERIC = {
  career: { both: '成果主要看你自己怎麼累積', good: '這方面外力加持不多，成果要靠你自己一步一步累積', risk: '這方面沒有明顯的緊張配置' },
  wealth: { both: '錢主要靠你自己一點一滴存下來', good: '錢要靠你自己一點一滴累積，外力幫忙不多', risk: '沒有明顯的破財訊號' },
  family: { both: '家裡大致平穩，用心經營就好', good: '家裡的事比較要靠你自己用心經營', risk: '家裡沒有明顯的緊張配置' },
  love: { both: '關係大致平穩，用心經營就好', good: '感情要靠你自己用心經營，外力幫忙不多', risk: '感情上沒有明顯的緊張配置' },
  health: { both: '只要作息正常，底子不差', good: '', risk: '沒有明顯的緊張配置，只要作息正常，底子不差' },
};

// 格局 → 一句白話（對你有什麼意義）
const PATTERN_SPOKEN = {
  'grand-trine-fire': '熱情、行動力和自信在你身上轉得很順，做事容易一鼓作氣',
  'grand-trine-earth': '你天生有把事情落實的手感，理財和工作流程都能穩穩推進',
  'grand-trine-air': '你的思路、表達和人脈常常一氣呵成，很適合靠溝通吃飯',
  'grand-trine-water': '你的直覺和同理心運作得很自然，很能接住別人沒說出口的需求',
  't-square': '你的人生常在某個主題上感到卡關和拉扯，但也因此練出比別人強的韌性',
  'grand-cross': '你常覺得每件事都很急、每個角色都要顧，好處是抗壓力很強',
  'stellium-sign': '某一個星座的特質在你身上非常鮮明，辨識度很高，但也容易偏',
  'stellium-house': '你的人生能量大量投入某一個領域，容易在那裡做出成績，也最耗心力',
  yod: '有一個主題一直推著你去調整，年輕時可能覺得不順，後來會變成專長',
  kite: '你比一般人更知道優勢要往哪裡用，順手的事有出口也有方向',
  'mutual-reception': '有兩顆行星互相支援，它們管的主題常常一起變好',
  'new-moon': '你想要的和你需要的很一致，行動起來乾脆有力，只是比較難從外面看自己',
  'full-moon': '理智想要的和情感需要的常常拉扯，但你很懂得站在對方的角度',
  'multi-retro': '你的節奏比外界慢半拍，很多事要想清楚才會動，反省能力比一般人強',
  'mercury-retro': '你思考時習慣在心裡先繞幾圈，寫下來會比當場說清楚得多',
  'element-missing': '有一種元素你天生比較少，那種能力要靠後天練習或找人補位',
  'element-dominant': '你的個性明顯偏向某一種元素，優勢很集中，別的面向容易不耐煩',
  'venus-mars-tight': '你的魅力和慾望是連在一起的，在感情裡態度直接、有熱度',
  'saturn-pressure': '你對自己要求高，常覺得做得不夠，但三十歲以後通常會越來越穩',
  'jupiter-trine-sun': '你天生比較樂觀，貴人和機會常常自己出現',
  'asc-sun-same': '你給人的印象跟真正的自己很一致，表裡如一，別人容易信任你',
  'sun-moon-harmony': '你想做的和心裡舒服的方向很一致，做決定不太內耗',
  'mars-saturn-hard': '你常感覺想衝卻被卡住，努力很久才看到成果，但練出來的是耐力',
  'venus-jupiter-soft': '你在人際和金錢上常有好運氣，人緣好，也懂得享受生活',
};

// 各章用不同的起頭與轉折，避免每章都一樣（empty：宮裡沒有行星時的說法，每章不同，聽起來才不像在念表格）
const DOMAIN_STYLE = {
  career: {
    score: (sl) => `先從事業開始，${sl}。`,
    good: '你的優勢是，', warn: '要留意的是，', act: '我的建議是，', act2: '另外，',
    empty: '這一宮裡面沒有行星，主要看守護星的狀態。',
  },
  wealth: {
    score: (sl) => `財運的部分，${sl}。`,
    good: '加分的地方是，', warn: '比較要小心的是，', act: '具體的做法，', act2: '還有，',
    empty: '宮裡沒有行星，錢的事要看守護星怎麼樣。',
  },
  family: {
    score: (sl) => `再來聊家庭，${sl}。`,
    good: '好的一面是，', warn: '需要注意的是，', act: '在家裡，你可以這樣做，', act2: '另外，',
    empty: '這一宮是空的，家的事主要由守護星決定。',
  },
  love: {
    score: (sl) => `接下來是感情，${sl}。`,
    good: '幫你加分的是，', warn: '容易卡住的地方是，', act: '給你一個建議，', act2: '也提醒你，',
    empty: '宮裡沒有行星，感情的重點在守護星身上。',
  },
  health: {
    score: (sl) => `最後一個面向是健康，${sl}。`,
    good: '比較好的是，', warn: '要多注意的是，', act: '保養上，', act2: '還有，',
    empty: '這一宮沒有行星，體質的線索要看守護星。',
  },
};

/* ───────── 小工具 ───────── */

const joinAnd = (arr) => (arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join('、')}和${arr[arr.length - 1]}`);
const levelLabel = (lv) => (lv && typeof lv === 'object' ? lv.label : lv) || '';
const pName = (id) => PLANETS[id]?.name ?? (id === 'asc' ? '上升點' : id === 'mc' ? '天頂' : id === 'fortune' ? '福點' : String(id ?? ''));
const themeOf = (n) => HOUSES[n - 1]?.theme ?? '';
const signShort = (name) => SIGN_BY_NAME[name]?.short ?? String(name || '').replace(/座$/, '');

function scoreLine(score, label, prevLabel) {
  if (!Number.isFinite(score)) return '';
  const w = LEVEL_SPOKEN[label] || '平順';
  return `分數大概${score}分，${label && label === prevLabel ? '跟前面一樣，' : ''}屬於${w}的範圍`;
}

function endSentence(s) {
  const t = String(s || '').trim().replace(/[，、：；,]+$/, '');
  if (!t) return '';
  return /[。！？]$/.test(t) ? t : t + '。';
}

function stripEnd(s) {
  return String(s || '').trim().replace(/[。！？，、：；]+$/, '');
}

// 書面標記清掉：引號、冒號、括號、破折號、英文
function cleanWritten(s) {
  return String(s || '')
    .replace(/[「」『』“”]/g, '')
    .replace(/[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*/g, '')
    .replace(/——|—|–/g, '，')
    .replace(/：/g, '，')
    .replace(/用制度（記帳、自動扣款）補上/g, '用制度補上，例如記帳、自動扣款')
    .replace(/[（(]([^）)]*)[）)]/g, '，$1，')
    .replace(/務必/g, '記得要')
    .replace(/，，+/g, '，')
    .replace(/，([。！？；])/g, '$1')
    .replace(/。{2,}/g, '。');
}

function sentencesOf(text) {
  return cleanWritten(text).split(/(?<=[。！？])/).map((x) => x.trim()).filter((x) => x && x.length >= 4);
}

/**
 * 從知識庫的解說裡抽出「可以直接念」的重點句
 * @param {string} text 原文
 * @param {number} maxSent 最多幾句
 * @param {number} maxChars 最多幾個字（至少保留一句）
 * @param {object} o { keepAdvice: 保留「建議」句 }
 */
function gist(text, maxSent = 2, maxChars = 90, o = {}) {
  const out = [];
  let len = 0;
  for (const s0 of sentencesOf(text)) {
    let s = s0;
    if (!o.keepAdvice && /^(建議|要留意的是|要留意|缺點是)/.test(s)) continue;
    s = s.replace(/^建議，/, '建議').replace(/^但/, '');
    const sentence = endSentence(s);
    if (out.length && len + sentence.length > maxChars) break;
    out.push(sentence);
    len += sentence.length;
    if (out.length >= maxSent) break;
  }
  return out.join('');
}

// 行星落宮文的第一個子句常是「你的太陽落在工作與健康習慣的領域，」「伴侶與合作這一宮有木星，」，前面已經講過，拿掉
function dropLeadClause(text, planetName) {
  const t = cleanWritten(text);
  const i = t.indexOf('，');
  if (i < 0) return t;
  const head = t.slice(0, i);
  if ((planetName && head.includes(planetName)) || /這一宮|的領域|落在/.test(head)) {
    const rest = t.slice(i + 1);
    return rest.length >= 4 ? rest : t;
  }
  return t;
}

function planetSignText(id, signName) {
  return PLANET_SIGN_A[id]?.[signName] ?? PLANET_SIGN_B[id]?.[signName] ?? '';
}
function planetHouseText(id, n) {
  return PLANET_HOUSE_A[id]?.[n] ?? PLANET_HOUSE_B[id]?.[n] ?? '';
}

function patternMeaning(p) {
  if (p && PATTERN_SPOKEN[p.id]) return PATTERN_SPOKEN[p.id];
  const s = sentencesOf(p?.desc || '')[0] || '';
  return stripEnd(s);
}

function ageOf(analysis) {
  const a = Number.isFinite(analysis?.age) ? analysis.age : analysis?.year?.age;
  return Number.isFinite(a) ? a : null;
}

function houseInfo(analysis, chart, n) {
  const ah = Array.isArray(analysis.houses) ? analysis.houses.find((h) => h && h.index === n) : null;
  const ch = Array.isArray(chart.houses) ? chart.houses.find((h) => h && h.index === n) : null;
  return {
    index: n,
    cuspSign: ah?.cuspSign ?? ch?.sign?.name ?? '',
    ruler: ah?.ruler ?? ch?.ruler ?? '',
    rulerHouse: ah?.rulerHouse ?? ch?.rulerHouse ?? null,
    planets: (ah?.planets ?? ch?.planets ?? []).filter((id) => MAIN_TEN.includes(id) || id === 'northnode'),
    score: Number.isFinite(ah?.score) ? ah.score : null,
    level: levelLabel(ah?.level),
  };
}

/* ───────── 稱呼 ───────── */

function sanitizeName(s) {
  return String(s ?? '')
    .replace(/[\s<>{}[\]\\/"'`&;|$]/g, '')
    .slice(0, 12);
}

// 回傳念出來的稱呼，或 ''（代表只說「你好」）
// useChartName 為 false：呼叫端（面板的稱呼欄）已經決定好稱呼，空白就是「不要叫名字」，不再退回排盤姓名
export function resolveCallName(callName, chartName, { useChartName = true } = {}) {
  const c = sanitizeName(callName);
  if (c) return c;
  if (useChartName === false) return '';
  const n = sanitizeName(chartName);
  if (!n || n.length > 8) return '';
  for (const suf of CALL_SUFFIX) {
    if (n.endsWith(suf) && n.length > suf.length) return n;
  }
  return '';
}

/* ───────── 優勢／風險 字串轉口語 ───────── */
// analyze.mjs 產生的優勢、風險是固定句型的字串，這裡依句型轉成口語，並排優先順序。

function planetIdByName(name) {
  for (const [id, p] of Object.entries(PLANETS)) if (p.name === name) return id;
  return null;
}

function strengthSpoken(str, ctx) {
  const s = String(str || '');
  const health = ctx.chapterId === 'health';
  let m;
  if ((m = /^(.+?)坐在第.+?宮：/.exec(s))) {
    const id = planetIdByName(m[1]);
    const line = (health ? HEALTH_GOOD_SPOKEN : PLANET_GOOD_SPOKEN)[id] || '這一塊容易有資源和好感';
    return { rank: 0, key: id, text: `${m[1]}就坐在這裡，${line}` };
  }
  if ((m = /^(.+?)在(.+?座)(入廟|擢升)：/.exec(s))) {
    return { rank: 1, key: planetIdByName(m[1]), text: `${m[1]}在${m[2]}${DIGNITY_SPOKEN[m[3] === '入廟' ? 'domicile' : 'exaltation']}` };
  }
  if ((m = /^守護星(.+?)狀態好/.exec(s))) {
    return { rank: 2, key: planetIdByName(m[1]), text: `守護星${m[1]}的狀態很好，${health ? '體質有一個穩的主心骨' : '這一塊有穩的主心骨，撐得住狀況'}` };
  }
  if ((m = /^守護星(.+?)與(.+?)(合相|六分相|四分相|三分相|對分相)：/.exec(s))) {
    const aid = planetIdByName(m[1]) || m[1];
    const bid = planetIdByName(m[2]) || m[2];
    return { rank: 3, key: `aspect:${aid}-${bid}`, text: `守護星${m[1]}跟${m[2]}${m[3]}，${m[2]}${health ? '的能量對身體是加分的' : '的資源會順手流進來'}` };
  }
  if ((m = /^格局「(.+?)」對/.exec(s))) {
    if (health) return null;
    const p = ctx.patternsByName[m[1]];
    if (ctx.said.has(m[1])) return { rank: 6, pattern: m[1], text: `前面提到的${m[1]}，在這方面也是加分的` };
    return { rank: 4, pattern: m[1], text: `你有${m[1]}這個格局，${patternMeaning(p || { id: '', desc: '' }) || '對這一塊是加分的'}` };
  }
  if (/^這個領域沒有特別突出的助力/.test(s)) return { rank: 9, generic: true, text: GENERIC[ctx.chapterId].good };
  return null;
}

function riskSpoken(str, ctx) {
  const s = String(str || '');
  const health = ctx.chapterId === 'health';
  let m;
  if ((m = /^(.+?)坐在第.+?宮：/.exec(s))) {
    const id = planetIdByName(m[1]);
    const line = (health ? HEALTH_RISK_SPOKEN : PLANET_RISK_SPOKEN)[id] || '這一塊需要多一點耐心';
    return { rank: 0, key: id, text: `${m[1]}就在這裡，${line}` };
  }
  if ((m = /^(.+?)在(.+?座)(失勢|落陷)：/.exec(s))) {
    return { rank: 1, key: planetIdByName(m[1]), text: `${m[1]}在${m[2]}${DIGNITY_SPOKEN[m[3] === '失勢' ? 'detriment' : 'fall']}` };
  }
  if ((m = /^(.+?)逆行：/.exec(s))) {
    if (/交點/.test(m[1])) return null; // 交點大部分時間都在逆行，念出來沒有意義
    return { rank: 2, key: planetIdByName(m[1]), text: `${m[1]}逆行，${health ? '身體的節奏偏慢，別拿別人的速度逼自己' : '這一塊的節奏會慢半拍、比較往內想，別拿別人的速度逼自己'}` };
  }
  if ((m = /^守護星(.+?)狀態弱/.exec(s))) {
    return { rank: 2, key: planetIdByName(m[1]), text: `守護星${m[1]}的狀態比較弱，${health ? '身體的底子要靠後天多顧' : '重大決定多留一點時間確認'}` };
  }
  if ((m = /^守護星(.+?)與(.+?)(合相|六分相|四分相|三分相|對分相)：/.exec(s))) {
    const aid = planetIdByName(m[1]) || m[1];
    const bid = planetIdByName(m[2]) || m[2];
    return { rank: 3, key: `aspect:${aid}-${bid}`, text: `守護星${m[1]}跟${m[2]}${m[3]}，${m[2]}${health ? '的能量容易拉扯到身體，要記得安排休息' : '的事容易跟這一塊互相拉扯'}` };
  }
  if ((m = /^格局「(.+?)」對/.exec(s))) {
    if (health) return null;
    const p = ctx.patternsByName[m[1]];
    if (ctx.said.has(m[1])) return { rank: 6, pattern: m[1], text: `前面提到的${m[1]}，在這方面也要留意` };
    return { rank: 4, pattern: m[1], text: `你有${m[1]}這個格局，${patternMeaning(p || { id: '', desc: '' }) || '在這方面要留意'}` };
  }
  if (/^這個領域沒有明顯的緊張配置/.test(s)) return { rank: 9, generic: true, text: GENERIC[ctx.chapterId].risk };
  return null;
}

function pickSpoken(list, fn, n, ctx) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((x, i) => {
    const r = fn(x, ctx);
    if (r && r.text) out.push({ ...r, i });
  });
  // 別的章已經講過同一顆行星或同一條相位，就往後排，聽起來才不會一直重複
  if (!ctx.full) for (const r of out) if (r.key && ctx.said.has('k:' + r.key)) r.rank += 5;
  out.sort((a, b) => a.rank - b.rank || a.i - b.i);
  const seen = new Set();
  const uniq = [];
  for (const r of out) {
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    uniq.push(r);
  }
  return uniq.slice(0, n);
}

// 建議句：書面標記轉口語；「找阿良」在第一人稱講稿裡是「找我」
function actionSpoken(a) {
  let t = String(a || '');
  t = t.replace(/^體質提醒（依太陽星座）：/, '從你的太陽星座來看體質，');
  t = t.replace(/每週固定一個「不談事情只相處」的時段，家的問題多半不是事情本身，是相處密度不夠。/, '每週固定安排一個不談事情、只相處的時段。家裡的問題，多半不是事情本身，而是相處的時間不夠。');
  t = t.replace(/找阿良/g, '找我');
  return cleanWritten(t);
}

/* ───────── 各章內容 ───────── */

function buildOverview(chart, analysis, full, said) {
  const ov = analysis.overview || {};
  const byId = Object.fromEntries((chart.planets || []).map((p) => [p.id, p]));
  const sun = byId.sun;
  const moon = byId.moon;
  const big3 = ov.big3 || chart.big3 || {};
  const sunSign = big3.sun || sun?.sign?.name || '';
  const moonSign = big3.moon || moon?.sign?.name || '';
  const ascSign = big3.asc || (chart.angles ? chart.angles.asc?.sign?.name : null) || null;
  const lines = [];

  if (ascSign) lines.push(`先講結論。你是太陽${sunSign}、月亮${moonSign}、上升${ascSign}。`);
  else lines.push(`先講結論。你是太陽${sunSign}、月亮${moonSign}。因為沒有出生時間，所以先不講上升。`);
  if (Number.isFinite(ov.score)) lines.push(`整體${scoreLine(ov.score, levelLabel(ov.level))}。`);

  // 太陽：核心
  const sunKb = SIGN_BY_NAME[sunSign];
  if (sunKb) {
    const g = gist(sunKb.core, full ? 4 : 1, full ? 200 : 60, { keepAdvice: full });
    lines.push(`太陽在${sunSign}，這是你最核心的自己。${g}`);
  }
  // 月亮：情緒
  const moonTxt = planetSignText('moon', moonSign);
  if (moonTxt) {
    const g = gist(moonTxt, full ? 4 : 1, full ? 200 : 60, { keepAdvice: full });
    lines.push(`月亮在${moonSign}，講的是你的情緒和安全感。${g}`);
  }
  // 上升：第一印象
  if (ascSign && SIGN_BY_NAME[ascSign]) {
    const g = gist(SIGN_BY_NAME[ascSign].asc, full ? 4 : 1, full ? 200 : 60, { keepAdvice: full });
    lines.push(`上升在${ascSign}，這是別人一開始看到你的樣子。${g.replace(/^上升在.+?座的你，/, '')}`);
  } else if (!ascSign) {
    lines.push(full ? '上升星座和宮位都要有出生時間才算得出來，所以下面講到宮位的部分，是用太陽盤估算的，只看大方向。' : '下面講到宮位的部分，是用太陽盤估算的，只看大方向。');
    if (chart.moonAmbiguous && chart.moonAmbiguous.from && chart.moonAmbiguous.to) {
      const ma = chart.moonAmbiguous;
      lines.push(full
        ? `另外，你出生那天月亮剛好在換星座，從${ma.from}走進${ma.to}，這裡先用中午的位置算；如果你覺得自己比較像另一個星座的描述，很可能是出生在另一段時間。`
        : `另外，你出生那天月亮剛好在換星座，從${ma.from}走進${ma.to}，這裡先用中午的位置算。`);
    }
  }

  // 關鍵字
  const kws = (ov.keywords || []).filter(Boolean).slice(0, 3);
  if (full && kws.length >= 2) lines.push(`如果用幾個詞來形容你，就是${joinAnd(kws)}。`);

  // 元素與模式
  const el = ov.dominant?.element;
  const md = ov.dominant?.mode;
  let m;
  if (el && ov.elementText && !full) {
    const first = sentencesOf(ov.elementText)[0] || '';
    const body = ((m = /最強，(.+)$/.exec(stripEnd(first))) ? m[1] : '').split('，')[0];
    lines.push(`從元素來看，你的${el}最強${body ? `，${body}` : ''}${md ? `；做事的模式偏${md}` : ''}。`);
    const lack = sentencesOf(ov.elementText).filter((x) => /沒有行星/.test(x));
    if (lack.length) lines.push(lack[0]);
  } else if (el && ov.elementText) {
    const first = sentencesOf(ov.elementText)[0] || '';
    const body = (m = /最強，(.+)$/.exec(stripEnd(first))) ? m[1] : '';
    lines.push(`從元素來看，你的${el}最強${body ? `，${body}` : ''}。`);
    const lack = sentencesOf(ov.elementText).filter((x) => /沒有行星/.test(x));
    for (const x of full ? lack : lack.slice(0, 1)) lines.push(x);
    if (full) {
      const rest = sentencesOf(ov.elementText).slice(1).filter((x) => !/沒有行星/.test(x));
      for (const x of rest) lines.push(x);
    }
  }
  if (md && ov.modeText && full) {
    const first = sentencesOf(ov.modeText)[0] || '';
    const body = (m = /為主，(.+)$/.exec(stripEnd(first))) ? m[1] : '';
    lines.push(`做事的模式偏${md}${body ? `，${body}` : ''}。`);
    if (full) for (const x of sentencesOf(ov.modeText).slice(1)) lines.push(x);
  }

  // 完整版：十顆行星逐顆念
  if (full) {
    lines.push('接下來把十顆行星逐一講一遍。');
    for (const id of [...MAIN_TEN.slice(2), 'northnode']) {
      const p = byId[id];
      if (!p || !p.sign) continue;
      const name = pName(id);
      const sName = p.sign.name;
      const parts = [`${name}在${sName}`];
      if (p.house) parts.push(`${chart.solarChart ? '以太陽盤來看' : ''}落在${houseName(p.house)}，也就是${themeOf(p.house)}`);
      if (p.dignity && DIGNITY_SPOKEN[p.dignity]) parts.push(`在這裡${DIGNITY_SPOKEN[p.dignity]}`);
      lines.push(parts.join('，') + '。');
      const st = gist(planetSignText(id, sName), 2, 110);
      if (st) lines.push(st);
      if (p.house) {
        const ht = gist(dropLeadClause(planetHouseText(id, p.house), name), 2, 110);
        if (ht) lines.push(ht);
      }
      if (p.retro && PLANETS[id]?.retroText) lines.push(`而且出生時${name}逆行，${stripEnd(gist(PLANETS[id].retroText, 1, 80).replace(/^出生時.+?逆行，/, ''))}。`);
    }
  }

  // 格局
  const pats = Array.isArray(analysis.patterns) ? analysis.patterns : [];
  const good = pats.filter((p) => ['great', 'good'].includes(p.level));
  const mixed = pats.filter((p) => p.level === 'mixed');
  const bad = pats.filter((p) => ['warn', 'bad'].includes(p.level));
  const goodShow = full ? good : good.slice(0, 1);
  if (goodShow.length) {
    const first = goodShow[0];
    if (good.length === 1) lines.push(`你的星盤有一個加分的格局，叫做${first.name}，意思是${patternMeaning(first)}。`);
    else lines.push(`你的星盤有${good.length}個加分的格局，最值得一提的是${first.name}，意思是${patternMeaning(first)}。`);
    for (const p of goodShow.slice(1)) lines.push(`還有${p.name}，${patternMeaning(p)}。`);
  }
  const mixedShow = full ? mixed : (goodShow.length || bad.length ? [] : mixed.slice(0, 1));
  for (const p of mixedShow) lines.push(goodShow.length ? `另外還有${p.name}的格局，${patternMeaning(p)}。` : `你的星盤有${p.name}的格局，${patternMeaning(p)}。`);
  const badShow = full ? bad : (goodShow.length ? [] : bad.slice(0, 1));
  badShow.forEach((p, i) => {
    lines.push(`${i === 0 ? '另外有一個要留意的格局，' : '還有，'}叫做${p.name}，${patternMeaning(p)}。`);
  });
  for (const p of [...goodShow, ...mixedShow, ...badShow]) said.add(p.name);
  if (badShow.length) lines.push('這不是宿命，是提醒你哪裡容易卡關，知道了就能提早準備。');
  if (!pats.length) lines.push('你的星盤沒有成立特別的大格局，代表沒有哪一股力量特別突出或特別卡，人生的走向會比較取決於你把心力放在哪裡。');

  return lines.join('');
}

// 完整版：把參考宮位逐宮念一遍（每一宮只念一次）
function refHouseLines(chart, analysis, key, houses, saidHouses) {
  const lines = [];
  const list = houses.filter((n) => !saidHouses.has(n));
  if (!list.length) return lines;
  const heads = list.map((n) => houseName(n));
  lines.push(`跟${key}有關的，還有${joinAnd(heads)}。`);
  for (const n of list) {
    saidHouses.add(n);
    const h = houseInfo(analysis, chart, n);
    const parts = [`${houseName(n)}，也就是${themeOf(n)}`];
    if (h.score !== null) parts.push(scoreLine(h.score, h.level));
    if (h.cuspSign) parts.push(`宮頭在${h.cuspSign}`);
    parts.push(h.planets.length ? `裡面有${joinAnd(h.planets.map(pName))}` : '裡面沒有行星');
    lines.push(parts.join('，') + '。');
    const role = HOUSES[n - 1]?.spokenRole;
    if (role) lines.push(role);
    for (const id of h.planets.slice(0, 2)) {
      const g = gist(dropLeadClause(planetHouseText(id, n), pName(id)), 1, 70);
      if (g) lines.push(`${pName(id)}在這裡，${g}`);
    }
  }
  return lines;
}

function buildDomain(chapterId, chart, analysis, full, prevLabel, said, saidHouses) {
  const key = DOMAIN_OF[chapterId];
  const d = analysis.domains?.[key];
  if (!d || typeof d !== 'object') return { text: '', label: prevLabel };
  const st = DOMAIN_STYLE[chapterId];
  const lines = [];
  const label = levelLabel(d.level);
  const n = Number.isInteger(d.mainIndex) ? d.mainIndex : Number(String(d.mainHouse || '').replace(/[^0-9]/g, '')) || 0;
  const health = chapterId === 'health';

  lines.push(st.score(scoreLine(d.score, label, prevLabel)));
  if (d.estimated && chapterId === 'career' && full) lines.push('提醒一下，因為沒有出生時間，五個面向的分數都是用太陽盤估算的。');

  const h = n ? houseInfo(analysis, chart, n) : null;
  if (h && n) {
    saidHouses.add(n);
    const kw = (SIGN_BY_NAME[h.cuspSign]?.keywords || []).slice(0, 2);
    if (full) lines.push(`你的${houseName(n)}，也就是${key}這一塊，是從${h.cuspSign}開始的，所以你在${key}上會帶著${h.cuspSign}的味道${kw.length ? `，關鍵字是${joinAnd(kw)}` : ''}。`);
    else lines.push(`你的${houseName(n)}，也就是${key}這一塊，宮頭在${h.cuspSign}。`);
    const rulerName = pName(h.ruler);
    const rh = h.rulerHouse;
    const ids = h.planets;
    if (rh === n) {
      lines.push(full ? `這一宮的守護星${rulerName}就在這一宮裡面，代表${key}是你的主場，重心會很自然放在這裡。` : `守護星${rulerName}就在這一宮裡面，${key}是你的主場。`);
    } else if (rh) {
      // 同一顆守護星管兩宮（例如金星同時守護第二宮與第七宮）：第二次講到要換說法，不然整句重複
      const rk = `ruler:${h.ruler}-${rh}`;
      if (full) lines.push(said.has(rk) ? `這一宮的守護星一樣是${rulerName}，前面提過它落在${houseName(rh)}，所以${key}的發展也常常要透過${themeOf(rh)}來推進。` : `這一宮的守護星是${rulerName}，落在${houseName(rh)}，也就是${themeOf(rh)}，代表${key}的發展常常要透過${themeOf(rh)}來推進。`);
      else lines.push(said.has(rk) ? `守護星一樣是${rulerName}，前面提過它落在${houseName(rh)}，${key}也會跟${themeOf(rh)}綁在一起。` : `守護星是${rulerName}，落在${houseName(rh)}，也就是${themeOf(rh)}。`);
      said.add(rk);
      // 精華版一宮只念一段知識庫：宮裡有行星就講行星，沒有才講守護星；同一顆星同一宮前面念過就不重複
      const gk = `gist:${h.ruler}-${rh}`;
      if (full || (!ids.length && !said.has(gk))) {
        const g = gist(dropLeadClause(planetHouseText(h.ruler, rh), rulerName), full ? 3 : 1, full ? 160 : 50, { keepAdvice: full });
        if (g) { lines.push(g); said.add(gk); }
      }
    }
    if (!ids.length) {
      lines.push(full ? `這一宮裡面沒有行星，不代表不好，意思是${key}主要看守護星的狀態，還有它跟別的行星的關係。` : st.empty);
    } else {
      const names = ids.map(pName);
      lines.push(`這一宮裡面有${joinAnd(names)}。`);
      const show = full ? ids : ids.slice(0, 1);
      show.forEach((id) => {
        const gk = `gist:${id}-${n}`;
        if (!full && said.has(gk)) return;
        const g = gist(dropLeadClause(planetHouseText(id, n), pName(id)), full ? 3 : 1, full ? 160 : 50, { keepAdvice: full });
        if (!g) return;
        said.add(gk);
        lines.push(`${names.length > 1 ? `${pName(id)}在這裡，` : ''}${g}`);
      });
    }
  }

  // 優勢、風險
  const patternsByName = {};
  for (const p of analysis.patterns || []) patternsByName[p.name] = p;
  const ctx = { chapterId, patternsByName, said, full };
  const goodsAll = pickSpoken(d.strengths, strengthSpoken, 6, ctx);
  const risksAll = pickSpoken(d.risks, riskSpoken, 6, ctx);
  const specificGood = goodsAll.filter((g) => !g.generic);
  let specificRisk = risksAll.filter((r) => !r.generic);
  // 精華版：優勢和風險都只是「守護星跟誰有相位」這種間接影響時，只講優勢那一句，講稿才不會拖
  if (!full && specificGood.length && specificRisk.length && specificGood[0].rank >= 3 && specificRisk[0].rank >= 3) specificRisk = [];
  const nShow = full ? 3 : 1;
  if (!specificGood.length && !specificRisk.length) {
    lines.push(`這方面沒有特別突出的助力，也沒有明顯的緊張配置，${GENERIC[chapterId].both}。`);
  } else {
    if (specificGood.length) lines.push(`${st.good}${specificGood.slice(0, nShow).map((g) => g.text).join('；')}。`);
    else if (full && GENERIC[chapterId].good) lines.push(`${GENERIC[chapterId].good}。`);
    if (specificRisk.length) lines.push(`${st.warn}${specificRisk.slice(0, nShow).map((r) => r.text).join('；')}。`);
    else if (full || !specificGood.length) lines.push(`${specificGood.length ? '而且' : ''}${GENERIC[chapterId].risk}。`);
    for (const r of [...specificGood.slice(0, nShow), ...specificRisk.slice(0, nShow)]) {
      if (r.key) said.add('k:' + r.key);
      if (r.pattern) said.add(r.pattern);
    }
  }

  // 完整版：參考宮位逐宮念
  if (full && Array.isArray(d.refs)) {
    const refIdx = d.refs.map((r) => (Number.isInteger(r.index) ? r.index : Number(String(r.house || '').replace(/[^0-9]/g, '')))).filter((x) => x >= 1 && x <= 12);
    if (chapterId === 'career' && !refIdx.includes(9)) refIdx.push(9);
    lines.push(...refHouseLines(chart, analysis, key, refIdx, saidHouses));
  }

  // 建議
  const acts = Array.isArray(d.actions) ? d.actions.filter(Boolean) : [];
  const connectors = [st.act2, '還有，', '最後，'];
  acts.slice(0, full ? acts.length : 1).forEach((x, i) => {
    const lead = i === 0 ? st.act : connectors[Math.min(i - 1, connectors.length - 1)];
    lines.push(`${lead}${endSentence(actionSpoken(x))}`);
  });

  if (health) lines.push('提醒你，這只是體質傾向，不能取代醫生的診斷。');
  return { text: lines.join(''), label };
}

function buildWork(analysis, full) {
  const c = analysis.careers;
  if (!c || !Array.isArray(c.top) || !c.top.length) return '';
  const ord = ['排在最前面的是', '第二類是', '第三類是', '第四類是', '第五類是'];
  const top = c.top.slice(0, full ? 5 : 3);
  const lines = [`再來講適合你的工作，我依照你的星盤排了前${top.length}類。`];
  const parts = top.map((r, i) => {
    const jobs = (r.jobs || []).filter((j) => j && !/[A-Za-z]/.test(j)).slice(0, full ? 5 : 2);
    const scorePart = full && Number.isFinite(r.score) ? `，${r.score}分` : '';
    return `${ord[i]}${r.category}${scorePart}${jobs.length ? `，像${joinAnd(jobs)}` : ''}`;
  });
  lines.push(parts.join('；') + '。');
  const matched = [...new Set(top.flatMap((r) => r.matched || []))].filter(Boolean).map((x) => cleanWritten(x)).slice(0, 3);
  if (matched.length && full) lines.push(`這是依照你星盤裡的${joinAnd(matched)}排出來的。`);
  const avoid = (c.avoid || []).filter(Boolean);
  if (avoid.length && full) {
    if (/^沒有特別要避開/.test(avoid[0])) {
      lines.push('至於要避開的類型，你倒是沒有特別的禁忌，重點是選一個能長期累積的領域。');
    } else {
      const shown = avoid.slice(0, full ? avoid.length : 1).map((x) => stripEnd(cleanWritten(x)));
      lines.push(`比較不建議的，是${shown.join('；還有')}。`);
    }
  }
  return lines.join('');
}

function cycleName(c) {
  return String(c.name || '').replace(/[（(].*?[）)]/g, '').trim() || '這個週期';
}
function cycleRange(c) {
  return `大約${c.ageFrom}到${c.ageTo}歲`;
}

function buildCycles(analysis, full) {
  const all = Array.isArray(analysis.cycles) ? analysis.cycles.filter((c) => c && Number.isFinite(c.ageFrom) && Number.isFinite(c.ageTo)) : [];
  if (!all.length) return '';
  const age = ageOf(analysis);
  const sorted = all.slice().sort((x, y) => x.ageFrom - y.ageFrom || x.ageTo - y.ageTo);
  const lines = [full ? '接下來看人生週期，也就是木星、土星這些行星走到特定角度的時候，通常會發生的事。' : '接下來看人生週期。'];

  const nowList = sorted.filter((c) => c.status === 'now');
  const futureList = sorted.filter((c) => c.status === 'future');
  const pastList = sorted.filter((c) => c.status === 'past');
  const picked = [];
  if (age !== null) {
    if (nowList.length) {
      nowList.slice(0, 2).forEach((c, i) => {
        const g = gist(c.text, full ? 4 : 1, full ? 200 : 70);
        const adv = full ? gist(c.advice, 2, 120, { keepAdvice: true }) : (i === 0 ? gist(c.advice, 1, 60, { keepAdvice: true }) : '');
        const head = i === 0 ? `你現在${age}歲，正在走${cycleName(c)}，${cycleRange(c)}。` : `同一段時間也在走${cycleName(c)}，${cycleRange(c)}。`;
        lines.push(`${head}${g}${adv}`);
        picked.push(c);
      });
    } else {
      const last = pastList[pastList.length - 1];
      if (last) {
        lines.push(`你現在${age}歲，剛走過${cycleName(last)}，${cycleRange(last)}，那一段的重點是${stripEnd(gist(last.text, 1, 60))}。`);
        picked.push(last);
      } else {
        lines.push(`你現在${age}歲，還沒進入需要特別留意的週期。`);
      }
    }
  } else {
    lines.push('因為不知道你的年齡，這裡先講接下來會遇到的幾個週期。');
  }
  // 「下一個週期」一定要講；精華版最多 3 個（現在的 1～2 個＋下一個），完整版也是 3 個
  const nextN = Math.max(1, 3 - picked.length);
  futureList.slice(0, nextN).forEach((c, i) => {
    const g = full ? gist(c.text, 4, 200) : (i === 0 ? gist(c.text, 1, 70) : '');
    const adv = full ? gist(c.advice, 2, 120, { keepAdvice: true }) : '';
    const head = i === 0 ? `下一個週期是${cycleName(c)}，${cycleRange(c)}。` : `再往後是${cycleName(c)}，${cycleRange(c)}。`;
    lines.push(`${head}${g}${adv}`);
    picked.push(c);
  });
  if (picked.length && full) lines.push('這些週期不是好壞，是提醒你那幾年把心力放在哪裡比較不吃力。');
  return lines.join('');
}

function buildYear(analysis, full) {
  const y = analysis.year;
  if (!y || typeof y !== 'object') return '';
  const transits = Array.isArray(y.transits) ? y.transits.filter((t) => t && t.text) : [];
  if (!transits.length) return '';
  const lines = [];
  lines.push(Number.isFinite(y.year) ? `再來看今年，也就是${y.year}年的行運。` : '再來看今年的行運。');
  let aspectSaid = 0;
  for (const planet of ['jupiter', 'saturn']) {
    const mine = transits.filter((t) => t.planet === planet);
    if (!mine.length) continue;
    const pn = pName(planet);
    const houseT = mine.find((t) => t.kind === 'house');
    if (houseT) {
      const hn = Number.isInteger(houseT.target) ? houseT.target : null;
      const body = stripEnd(gist(houseT.text, full ? 4 : 1, full ? 220 : 70, { keepAdvice: full }).replace(/^今年.+?宮，/, ''));
      const lead = planet === 'jupiter' ? '' : '再看土星，';
      if (hn) lines.push(`${lead}今年${pn}走到你的${houseName(hn)}，也就是${themeOf(hn)}這一塊${body ? `，${body}` : ''}。`);
      else lines.push(`${lead}${endSentence(body)}`);
    }
    const asp = mine.filter((t) => t.kind === 'aspect');
    for (const t of full ? asp : asp.slice(0, aspectSaid ? 0 : 1)) {
      const g = gist(t.text, full ? 3 : 1, full ? 160 : 70, { keepAdvice: full });
      if (g) { lines.push(`而且${g}`); aspectSaid++; }
    }
  }
  if (y.estimated) lines.push('因為沒有出生時間，今年的落宮是用太陽盤估算的，看大方向就好。');
  const opp = (y.notes || []).filter((x) => x && x.type === '機會').length;
  const task = (y.notes || []).filter((x) => x && x.type === '課題').length;
  if (!full) { /* 精華版不加總結句，字數才壓得住 */ }
  else if (opp && task) lines.push('整體來說，今年有機會也有功課，機會來的時候主動一點，功課來的時候不要硬碰硬。');
  else if (opp) lines.push('整體來說，今年機會比功課多，適合主動一點。');
  else if (task) lines.push('整體來說，今年功課比機會多，適合把基礎打穩，不用急著擴張。');
  return lines.join('');
}

function buildOutro(analysis, ctx) {
  const lines = ['好，最後幫你總結一下。'];
  const doms = ['事業', '財運', '家庭', '感情', '健康']
    .map((k) => ({ k, s: analysis.domains?.[k]?.score }))
    .filter((x) => Number.isFinite(x.s));
  const big3 = analysis.overview?.big3 || {};
  const who = big3.sun && big3.moon ? `你是太陽${signShort(big3.sun)}、月亮${signShort(big3.moon)}的人，` : '';
  if (doms.length >= 2) {
    const max = Math.max(...doms.map((x) => x.s));
    const min = Math.min(...doms.map((x) => x.s));
    const hi = doms.filter((x) => x.s === max).map((x) => x.k);
    const lo = doms.filter((x) => x.s === min).map((x) => x.k);
    if (max - min < 5) lines.push(`${who}五個面向的分數很接近，沒有特別的短板，重點是把你的優勢用出來。`);
    else lines.push(`${who}五個面向裡，${joinAnd(hi)}相對最好，${joinAnd(lo)}比較需要多花一點心思。`);
  } else if (who) {
    lines.push(`${who}把你的優勢用出來就對了。`);
  }
  lines.push('星盤是幫你看清楚自己的一個角度，不是保證，重大決定還是要配合實際狀況、跟家人商量。');
  if (ctx.cta) lines.push(endSentence(ctx.cta));
  lines.push(`${ctx.callName ? `${ctx.callName}，` : ''}謝謝你聽到這裡，我是${ctx.speaker}，祝你一切順利，我們下次再聊。`);
  return lines.join('');
}

function buildIntro(ctx, chapterIds, minutes) {
  const lines = [];
  lines.push(`${ctx.callName ? `${ctx.callName}，你好` : '你好'}，我是${ctx.speaker}。`);
  if (ctx.disclosure) {
    if (ctx.voiceKind === 'clone') lines.push('先跟你說明，這段是用人工智慧模擬我的聲音念的，內容是我用西洋占星幫你整理的星盤重點。');
    else lines.push('這段先用電腦語音幫我念，內容是我用西洋占星幫你整理的星盤重點。');
  } else {
    lines.push('今天我用西洋占星，幫你把星盤的重點整理了一下。');
  }

  const has = (id) => chapterIds.includes(id);
  const parts = [];
  if (has('overview')) parts.push('你的三大主星');
  const nDom = DOMAIN_IDS.filter(has).length;
  if (nDom === 5) parts.push('事業、財運、家庭、感情、健康五個面向');
  else if (nDom) parts.push(DOMAIN_IDS.filter(has).map((id) => DOMAIN_OF[id]).join('、'));
  if (has('work')) parts.push('適合的工作');
  if (has('cycles')) parts.push('人生週期');
  if (has('year')) parts.push('今年的行運');
  const len = minutes >= 1 ? `全部聽完大約${minutes}分鐘` : '全部聽完不到一分鐘';
  if (parts.length === 5 && nDom === 5) lines.push(`${len}，從三大主星、五大面向，一路講到適合的工作、人生週期和今年行運。`.replace(/，從三大主星.+$/, (x) => (ctx.full ? x : '，會從三大主星一路講到今年行運。')));
  else if (parts.length > 1) lines.push(`${len}，會依序講${parts.slice(0, -1).join('、')}，還有${parts[parts.length - 1]}。`);
  else if (parts.length === 1) lines.push(`${len}，會講${parts[0]}。`);
  else lines.push(`${len}。`);
  return lines.join('');
}

/* ───────── 組裝 ───────── */

// ASC／MC 這類縮寫先換成中文，再交給讀音字典
function applySpeakReplace(text) {
  let t = String(text || '');
  for (const [from, to] of SPEAK_REPLACE) t = t.split(from).join(to);
  return t;
}

function makeChapter(id, text, dict) {
  const segments = [];
  let chars = 0;
  let secs = 0;
  for (const piece of splitSentences(applySpeakReplace(text))) {
    const speak = toSpeakable(piece, dict ? { dict } : {});
    if (!speak || !/[\p{L}\p{N}]/u.test(speak)) continue;
    segments.push({ id: `${id}-${String(segments.length + 1).padStart(3, '0')}`, text: piece, speak });
    chars += speak.replace(/\s/g, '').length;
    secs += estimateSeconds(speak);
  }
  if (!segments.length) return null;
  return { id, index: 0, title: CHAPTER_TITLES[id], segments, chars, estSeconds: Math.round(secs), _secs: secs };
}

/**
 * 產生講稿
 * @param {object} chart buildChart() 的結果
 * @param {object} analysis analyze(chart) 的結果
 * @param {object} opts { mode, callName, useChartName, speaker, voiceKind, disclosure, cta, pronounceDict }
 */
export function buildNarration(chart, analysis, opts = {}) {
  if (!chart || typeof chart !== 'object' || !Array.isArray(chart.planets)) throw new Error('缺少星盤資料，無法產生講稿');
  if (!analysis || typeof analysis !== 'object') throw new Error('缺少星盤分析資料，無法產生講稿');
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode === 'full' ? 'full' : 'brief';
  const full = mode === 'full';
  const speakerRaw = sanitizeName(o.speaker);
  const speaker = speakerRaw && speakerRaw.length <= 10 ? speakerRaw : '阿良';
  const voiceKind = o.voiceKind === 'clone' ? 'clone' : 'generic';
  const disclosure = o.disclosure !== false;
  const callName = resolveCallName(o.callName, chart.input?.name ?? chart.name, { useChartName: o.useChartName !== false });
  const cta = typeof o.cta === 'string' ? o.cta.replace(/[\r\n<>]+/g, ' ').trim().slice(0, 200) : '';
  const dict = Array.isArray(o.pronounceDict) ? o.pronounceDict : undefined;
  const ctx = { speaker, voiceKind, disclosure, callName, cta, full };

  const said = new Set(); // 已經講過的格局、行星、相位
  const saidHouses = new Set(); // 完整版已經逐宮念過的宮位
  const texts = { overview: buildOverview(chart, analysis, full, said) };
  let prevLabel = '';
  for (const id of DOMAIN_IDS) {
    const r = buildDomain(id, chart, analysis, full, prevLabel, said, saidHouses);
    texts[id] = r.text;
    if (r.text) prevLabel = r.label;
  }
  texts.work = buildWork(analysis, full);
  texts.cycles = buildCycles(analysis, full);
  texts.year = buildYear(analysis, full);
  texts.outro = buildOutro(analysis, ctx);

  const body = {};
  for (const id of CHAPTER_ORDER) {
    if (id === 'intro' || !texts[id]) continue;
    const ch = makeChapter(id, texts[id], dict);
    if (ch) body[id] = ch;
  }
  const bodyIds = Object.keys(body);
  const bodySecs = bodyIds.reduce((s, id) => s + body[id]._secs, 0);

  // 開場要講「大約幾分鐘」：先用暫定長度算一次，再用實際長度定案
  let intro = makeChapter('intro', buildIntro(ctx, bodyIds, Math.round((bodySecs + 30) / 60)), dict);
  const minutes = Math.round((bodySecs + (intro ? intro._secs : 0)) / 60);
  intro = makeChapter('intro', buildIntro(ctx, bodyIds, minutes), dict);

  const chapters = [];
  let totalSecs = 0;
  for (const id of CHAPTER_ORDER) {
    const ch = id === 'intro' ? intro : body[id];
    if (!ch) continue;
    const { _secs, ...clean } = ch;
    totalSecs += _secs;
    clean.index = chapters.length;
    chapters.push(clean);
  }

  return {
    version: NARRATION_VERSION,
    mode,
    speaker,
    callName,
    voiceKind,
    chapters,
    totalChars: chapters.reduce((s, c) => s + c.chars, 0),
    estSeconds: Math.round(totalSecs),
  };
}
