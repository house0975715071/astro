// 星盤解析引擎（規格書第 4 節）
// analyze(chart, { today:'YYYY-MM-DD' }) → 五大面向、行星逐顆、宮位逐宮、相位、格局、職業、人生週期、今年行運
// 文字全部從 kb/ 取；本檔只寫「組合句」與規則式建議（原創、台灣口語）。
// 不用 Date.now()／new Date()：「今天」由呼叫端傳入；沒給就用出生日當今天，並在 year.note 說明。
//
// 評分校準（K）：用 sampleInputs(300, 20260927) 的 300 組固定種子隨機生日跑 scoreHouse，
// 目標「五大面向平均 50～60、標準差 10～16、分數種類 >15」。
// 2026-09-27 實測（宮位 raw：平均 1.3、標準差 3.3）：
//   K=5   合併 平均 57.8／標準差 11.3／種類 67
//   K=6   合併 平均 58.9／標準差 13.1／種類 71 ← 採用（事業 62.3/12.7、財運 60.3/13.4、家庭 58.9/12.9、感情 56.7/12.6、健康 56.1/12.7）
//   K=7   合併 平均 59.7／標準差 14.6／種類 76
//   K=8   合併 平均 60.4／標準差 15.9／種類 79（平均超過 60，不採）
// 2026-09-27 稽核 #38 後（交點不再扣逆行分）重跑 K=6：合併 平均 59.1／標準差 13.0／種類 72，仍在目標內，K 不變。
// 重跑：node tests/analyze.test.mjs（校準區塊會印出實際數字）。

import { A } from './engine-adapter.js?v=8be9bc87';
import {
  makeContext, houseName, houseOf, signOf, norm, bodyLon,
  PLANET_NAMES, MAIN_PLANETS, SIGN_NAMES, ELEMENT_NAMES, MODE_NAMES, HOUSE_THEMES,
  ASPECT_TYPES as ASPECT_DEFS,
} from './astro.js?v=8be9bc87';
import { SIGNS, SIGN_BY_NAME } from '../kb/signs.js?v=8be9bc87';
import { PLANETS } from '../kb/planets.js?v=8be9bc87';
import { HOUSES } from '../kb/houses.js?v=8be9bc87';
import { PLANET_SIGN_A } from '../kb/planet-sign-a.js?v=8be9bc87';
import { PLANET_SIGN_B } from '../kb/planet-sign-b.js?v=8be9bc87';
import { PLANET_HOUSE_A } from '../kb/planet-house-a.js?v=8be9bc87';
import { PLANET_HOUSE_B } from '../kb/planet-house-b.js?v=8be9bc87';
import { ASPECT_TEXT, ASPECT_GENERIC } from '../kb/aspects.js?v=8be9bc87';
import { PATTERNS, INDUSTRY_MAP, PATTERN_LEVEL_LABEL } from '../kb/patterns.js?v=8be9bc87';
import { CYCLES, cycleStatus } from '../kb/cycles.js?v=8be9bc87';
import { TRANSIT_HOUSE, TRANSIT_ASPECT, TRANSIT_INTRO } from '../kb/transits.js?v=8be9bc87';

/* ---------- 設定表 ---------- */

/** 評分係數（校準方法見檔頭） */
export const K = 6;

/** 五大面向：主宮＋參考宮權重（規格書 4.1） */
export const DOMAINS = Object.freeze({
  事業: Object.freeze({ key: '事業', main: 10, refs: Object.freeze([[6, 0.25], [1, 0.2], [2, 0.15]]) }),
  財運: Object.freeze({ key: '財運', main: 2, refs: Object.freeze([[8, 0.3], [11, 0.15], [10, 0.15]]) }),
  家庭: Object.freeze({ key: '家庭', main: 4, refs: Object.freeze([[10, 0.15], [3, 0.15], [5, 0.15]]) }),
  感情: Object.freeze({ key: '感情', main: 7, refs: Object.freeze([[5, 0.3], [8, 0.15], [1, 0.1]]) }),
  健康: Object.freeze({ key: '健康', main: 6, refs: Object.freeze([[1, 0.3], [12, 0.2], [8, 0.1]]) }),
});
export const DOMAIN_KEYS = Object.freeze(Object.keys(DOMAINS));

/** 行星本質分（規格書 4.1）；asc／mc 只用在「宮主星合相四軸」的正負判斷 */
const ESSENCE = Object.freeze({
  jupiter: 3, venus: 2.5, sun: 1.5, moon: 1, mercury: 1, northnode: 1,
  mars: -1, saturn: -1.5, uranus: -0.5, neptune: -0.5, pluto: -0.5,
  asc: 1, mc: 1,
});
const DIGNITY_PTS = Object.freeze({ domicile: 2, exaltation: 1.5, detriment: -1, fall: -1.5 });
const ANGULAR = new Set([1, 4, 7, 10]);
const SCORED_BODIES = new Set(MAIN_PLANETS.concat(['northnode']));
/** 逆行只對十大行星有意義；交點的「逆行」是平均運動方向（chart 照實標，解析層不扣分、不出風險句） */
const RETRO_BODIES = new Set(MAIN_PLANETS);
const SEVEN = Object.freeze(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
const HARMONIOUS = new Set(['trine', 'sextile']);
const TENSE = new Set(['square', 'opposition']);
const LEVEL_RANK = Object.freeze({ great: 0, good: 1, mixed: 2, warn: 3, bad: 4 });
const ASPECT_NAME = Object.freeze(Object.fromEntries(ASPECT_DEFS.map((t) => [t.id, t.name])));

const ELEMENT_TEXT = Object.freeze({
  fire: '火象最強，你的能量傾向往外衝：先行動、再修正，熱情來得快，也帶得動身邊的人。要留意的是耐性與收尾。建議把衝勁綁在一個可以累積的長期目標上。',
  earth: '土象最強，你的能量傾向落實：重視看得到、摸得到的成果，做事穩、存得住，別人常覺得你可靠。要留意的是太安於現狀。建議每年給自己一個新的嘗試。',
  air: '風象最強，你的能量傾向思考與交流：學得快、講得清楚、人脈廣，靠資訊與溝通吃飯很自然。要留意的是想得多做得少。建議每個點子都配三個可以動手的小步驟。',
  water: '水象最強，你的能量傾向感受：直覺敏銳、同理心強，很能接住別人沒說出口的需求。要留意的是情緒容易被環境牽動。建議固定留獨處時間把感受整理掉。',
});
const ELEMENT_LACK = Object.freeze({
  fire: '火象沒有行星，衝勁與主動性不是你天生擅長的，需要靠目標或夥伴推一把。',
  earth: '土象沒有行星，落實與理財不是你天生擅長的，建議用制度（記帳、自動扣款）補上。',
  air: '風象沒有行星，表達與客觀分析不是你天生擅長的，重要的事先寫下來再說。',
  water: '水象沒有行星，感受與同理不是你天生擅長的，多問一句「你現在感覺怎樣」會有幫助。',
});
const MODE_TEXT = Object.freeze({
  cardinal: '模式以本位（開創）為主，你習慣當起頭的人：想到就開始、遇到問題就出手，很適合開新局。要留意的是開了頭常常不想守。建議把後續交給可靠的人，或給自己設收尾的期限。',
  fixed: '模式以固定為主，你習慣把一件事做到底：專注、有耐力、不容易被動搖，長期經營的事在你手上留得住。要留意的是固執與轉彎慢。建議定期問自己「這個堅持還合時宜嗎」。',
  mutable: '模式以變動為主，你習慣隨狀況調整：適應力強、學得快、能同時顧好幾件事。要留意的是方向容易散。建議一次只認真推進兩件事，其餘當補給。',
});

/* ---------- 小工具 ---------- */

export function levelOf(score) {
  if (score >= 82) return { label: '極佳', tone: 'great' };
  if (score >= 70) return { label: '良好', tone: 'good' };
  if (score >= 55) return { label: '平順', tone: 'ok' };
  if (score >= 42) return { label: '起伏', tone: 'warn' };
  return { label: '辛苦', tone: 'bad' };
}

const clamp = (lo, hi, x) => Math.max(lo, Math.min(hi, x));
const pName = (id) => PLANET_NAMES[id] ?? id;
const themeOf = (n) => HOUSE_THEMES[n].theme;
const firstSentence = (s) => { const i = String(s).indexOf('。'); return i > 0 ? s.slice(0, i + 1) : String(s); };

function parseToday(str) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}
function parseBirth(chart) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(chart?.input?.date ?? ''));
  if (!m) throw new Error('星盤缺少出生日期，沒辦法解析');
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** 實歲（今天減出生日，未過生日減一） */
export function ageAt(chart, today) {
  const b = parseBirth(chart);
  const t = typeof today === 'string' ? parseToday(today) : today;
  if (!t) throw new Error('today 格式不對，請用 YYYY-MM-DD');
  let age = t.y - b.y;
  if (t.mo < b.mo || (t.mo === b.mo && t.d < b.d)) age -= 1;
  return age;
}

/** 固定種子的線性同餘亂數（校準與測試共用） */
export function lcg(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const CAL_PLACES = Object.freeze([
  Object.freeze({ id: 'TW-TAO', name: '桃園市', lat: 24.9937, lon: 121.3010, tz: 'Asia/Taipei' }),
  Object.freeze({ id: 'TW-TPE', name: '台北市', lat: 25.0330, lon: 121.5654, tz: 'Asia/Taipei' }),
  Object.freeze({ id: 'TW-KHH', name: '高雄市', lat: 22.6273, lon: 120.3014, tz: 'Asia/Taipei' }),
  Object.freeze({ id: 'JP-TYO', name: '東京', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' }),
  Object.freeze({ id: 'US-LAX', name: '洛杉磯', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles' }),
]);
/** 300 組固定種子隨機生日（1950～2010 年、任意時分、五個地點；每 6 筆有 1 筆不知道時間） */
export function sampleInputs(n = 300, seed = 20260927) {
  const rnd = lcg(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1950 + Math.floor(rnd() * 61);
    const mo = 1 + Math.floor(rnd() * 12);
    const d = 1 + Math.floor(rnd() * 28);
    const h = Math.floor(rnd() * 24);
    const mi = Math.floor(rnd() * 60);
    const place = CAL_PLACES[Math.floor(rnd() * CAL_PLACES.length)];
    const timeUnknown = i % 6 === 5;
    out.push({
      name: `樣本${i + 1}`, date: `${y}-${mo}-${d}`,
      time: timeUnknown ? null : `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
      timeUnknown, place: { ...place }, houseSystem: 'placidus',
    });
  }
  return out;
}

/* ---------- 評分 ---------- */

/** 宮位原始分（未乘 K），細項一起回 */
export function rawHouse(chart, n) {
  const h = chart.houses[n - 1];
  if (!h) throw new Error(`宮位編號不對：${n}`);
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const detail = [];
  let raw = 0;
  const angular = ANGULAR.has(n) ? 1.2 : 1;
  for (const id of h.planets) {
    if (!SCORED_BODIES.has(id)) continue;
    const p = byId[id];
    let s = (ESSENCE[id] ?? 0) + (DIGNITY_PTS[p.dignity] ?? 0) + (p.retro && RETRO_BODIES.has(id) ? -0.5 : 0);
    s *= angular;
    raw += s;
    detail.push({ kind: 'planet', id, value: Math.round(s * 100) / 100 });
  }
  const ruler = h.ruler;
  const rp = byId[ruler];
  if (rp) {
    const dg = (DIGNITY_PTS[rp.dignity] ?? 0) * 1.5;
    if (dg) { raw += dg; detail.push({ kind: 'ruler-dignity', id: ruler, value: dg }); }
    for (const a of chart.aspects) {
      if (a.a !== ruler && a.b !== ruler) continue;
      const other = a.a === ruler ? a.b : a.a;
      let base = 0;
      if (HARMONIOUS.has(a.type)) base = 1.5;
      else if (TENSE.has(a.type)) base = -1.5;
      else if (a.type === 'conjunction') { const e = ESSENCE[other] ?? 0; base = e > 0 ? 1.5 : e < 0 ? -1.5 : 0; }
      if (!base) continue;
      const tight = 1 - (a.orb / (a.maxOrb || 7)) * 0.5;
      const v = base * tight;
      raw += v;
      detail.push({ kind: 'ruler-aspect', id: ruler, other, type: a.type, value: Math.round(v * 100) / 100 });
    }
  }
  return { raw: Math.round(raw * 1000) / 1000, detail, ruler, rulerHouse: h.rulerHouse, planets: h.planets.filter((id) => SCORED_BODIES.has(id)) };
}

/** 宮位分數 0～100（規格書 4.1） */
export function scoreHouse(chart, n) {
  const r = rawHouse(chart, n);
  const score = clamp(5, 98, Math.round(50 + r.raw * K));
  return { score, level: levelOf(score), raw: r.raw, detail: r.detail };
}

function scoreDomain(chart, cfg, patterns) {
  const main = scoreHouse(chart, cfg.main);
  let total = main.score;
  let w = 1;
  for (const [h, weight] of cfg.refs) { total += scoreHouse(chart, h).score * weight; w += weight; }
  let s = total / w;
  for (const p of patterns) { const e = p.effect?.[cfg.key]; if (e) s += e * 0.35; }
  return clamp(8, 97, Math.round(s));
}

/* ---------- 文字查表 ---------- */

function planetSignText(id, signName) {
  return PLANET_SIGN_A[id]?.[signName] ?? PLANET_SIGN_B[id]?.[signName] ?? null;
}
function planetHouseText(id, n) {
  return PLANET_HOUSE_A[id]?.[n] ?? PLANET_HOUSE_B[id]?.[n] ?? null;
}
/** 相位文字：兩顆都在 7 顆內查 ASPECT_TEXT；否則查另一方的 ASPECT_GENERIC；都不在就沒有文字 */
export function aspectText(a, b, type) {
  const ia = SEVEN.indexOf(a); const ib = SEVEN.indexOf(b);
  if (ia >= 0 && ib >= 0) {
    const key = ia < ib ? `${a}-${b}` : `${b}-${a}`;
    return ASPECT_TEXT[key]?.[type] ?? null;
  }
  if (ia >= 0) return ASPECT_GENERIC[b]?.[type] ?? null;
  if (ib >= 0) return ASPECT_GENERIC[a]?.[type] ?? null;
  return null;
}
function aspectTitle(a) { return `【${pName(a.a)}與${pName(a.b)}${a.name ?? ASPECT_NAME[a.type]}】`; }

/* ---------- 格局 ---------- */

function detectPatterns(ctx) {
  const hits = [];
  for (const p of PATTERNS) {
    let ok = false;
    try { ok = !!p.test(ctx); } catch { ok = false; }
    if (!ok) continue;
    let planets = [];
    try { planets = p.planetsOf ? p.planetsOf(ctx) : []; } catch { planets = []; }
    hits.push({
      id: p.id, name: p.name, level: p.level, levelLabel: PATTERN_LEVEL_LABEL[p.level] ?? p.level,
      desc: p.desc, effect: { ...p.effect }, careerHint: p.careerHint ?? null, planets: [...planets],
    });
  }
  return hits.sort((x, y) => (LEVEL_RANK[x.level] ?? 9) - (LEVEL_RANK[y.level] ?? 9));
}

/* ---------- 總覽 ---------- */

function dominantOf(counts, names) {
  let best = null;
  for (const [k, v] of Object.entries(counts)) if (best == null || v > counts[best]) best = k;
  return { key: best, name: names[best], value: counts[best] };
}

function buildOverview(chart, ctx, patterns, domainScores) {
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const sun = byId.sun; const moon = byId.moon;
  const ascSign = chart.angles ? chart.angles.asc.sign : null;
  const sunKb = SIGN_BY_NAME[sun.sign.name];
  const moonKb = SIGN_BY_NAME[moon.sign.name];
  const paras = [];

  paras.push(`【太陽在${sun.sign.name}】${sunKb.core}`);
  paras.push(`【月亮在${moon.sign.name}】${planetSignText('moon', moon.sign.name)}`);
  if (ascSign) {
    paras.push(`【上升在${ascSign.name}】${SIGN_BY_NAME[ascSign.name].asc}`);
  } else {
    paras.push('【不知道出生時間】上升星座、天頂與宮位都要有出生時間才算得出來，這份解析的宮位改用太陽盤（太陽星座當第一宮）估算，跟正式排盤會有出入。若之後查到出生時間，重新排一次會準得多。');
    if (chart.moonAmbiguous) {
      paras.push(`【月亮可能跨座】你出生那天月亮在 ${chart.moonAmbiguous.switchLocal} 從${chart.moonAmbiguous.from}走進${chart.moonAmbiguous.to}，這裡用中午的位置計算；如果你的個性比較像另一個星座的描述，很可能是出生在另一段時間。`);
    }
  }

  const el = dominantOf(chart.elements, ELEMENT_NAMES);
  const md = dominantOf(chart.modes, MODE_NAMES);
  const lacking = Object.entries(chart.elements).filter(([, v]) => v === 0).map(([k]) => k);
  const elementText = ELEMENT_TEXT[el.key] + (lacking.length ? lacking.map((k) => ELEMENT_LACK[k]).join('') : '');
  const modeText = MODE_TEXT[md.key];
  paras.push(`【元素與模式】${elementText}${modeText}`);

  if (patterns.length) {
    const good = patterns.filter((p) => ['great', 'good'].includes(p.level));
    const bad = patterns.filter((p) => ['warn', 'bad'].includes(p.level));
    const mixed = patterns.filter((p) => p.level === 'mixed');
    const bits = [];
    if (good.length) bits.push(`加分的有：${good.map((p) => p.name).join('、')}，這是你先天的底子，要主動用出來。`);
    if (mixed.length) bits.push(`雙面的有：${mixed.map((p) => p.name).join('、')}，用對地方是優勢，放錯地方會耗損。`);
    if (bad.length) bits.push(`要留意的有：${bad.map((p) => p.name).join('、')}，這不是宿命，是提醒你哪裡容易卡關，知道了就能提早準備。`);
    paras.push(`【格局摘要】你的星盤成立 ${patterns.length} 個格局。${bits.join('')}`);
  } else {
    paras.push('【格局摘要】你的星盤沒有成立特別的大格局，代表沒有哪一股力量特別突出或特別卡，人生的走向會比較取決於你把心力放在哪裡，可塑性高。');
  }

  const score = Math.round(DOMAIN_KEYS.reduce((s, k) => s + domainScores[k], 0) / DOMAIN_KEYS.length);
  const shortOf = (name) => SIGN_BY_NAME[name]?.short ?? name.replace(/座$/, '');
  const title = ascSign
    ? `太陽${shortOf(sun.sign.name)}・月亮${shortOf(moon.sign.name)}・上升${shortOf(ascSign.name)}`
    : `太陽${shortOf(sun.sign.name)}・月亮${shortOf(moon.sign.name)}`;
  return {
    title,
    big3: { ...chart.big3 },
    score, level: levelOf(score),
    paragraphs: paras,
    keywords: [...sunKb.keywords.slice(0, 4), ...moonKb.keywords.slice(0, 2), ...(ascSign ? SIGN_BY_NAME[ascSign.name].keywords.slice(0, 2) : [])],
    dominant: { element: el.name, mode: md.name },
    elementText, modeText,
    elements: { ...chart.elements }, modes: { ...chart.modes },
  };
}

/* ---------- 宮位、行星、相位 ---------- */

function cuspParagraph(chart, n) {
  const h = chart.houses[n - 1];
  const sk = SIGN_BY_NAME[h.sign.name];
  const rulerName = pName(h.ruler);
  const rh = h.rulerHouse;
  return `【${houseName(n)}的宮頭在${h.sign.name}】這一宮從${h.sign.name}開始，你在「${themeOf(n)}」上的態度會帶著${h.sign.name}的味道：${sk.keywords.slice(0, 4).join('、')}。這一宮的守護星是${rulerName}，落在${houseName(rh)}（${themeOf(rh)}），代表這個領域的發展常常要透過「${themeOf(rh)}」來推進。`;
}
function rulerParagraph(chart, n) {
  const h = chart.houses[n - 1];
  const txt = planetHouseText(h.ruler, h.rulerHouse);
  return txt ? `【${houseName(n)}的守護星${pName(h.ruler)}落在${houseName(h.rulerHouse)}】${txt}` : null;
}
function planetInHouseParagraph(id, n) {
  const txt = planetHouseText(id, n);
  return txt ? `【${pName(id)}落在你的${houseName(n)}】${txt}` : null;
}

function buildHouses(chart) {
  return chart.houses.map((h) => {
    const n = h.index;
    const sc = scoreHouse(chart, n);
    const paras = [`【${houseName(n)}・${themeOf(n)}】${HOUSES[n - 1].desc}`, cuspParagraph(chart, n)];
    const rp = rulerParagraph(chart, n);
    if (rp) paras.push(rp);
    for (const id of h.planets) {
      if (id === 'southnode') { paras.push(`【南交點落在你的${houseName(n)}】南交點永遠在北交點對面，代表你熟悉、順手、但容易停留的地方：「${themeOf(n)}」是你不用學就會的領域，北交點的功課則是往對面走。建議把這裡的本事當底氣，不要當終點。`); continue; }
      if (id === 'fortune') { paras.push(`【福點落在你的${houseName(n)}】福點是太陽、月亮、上升三者的合成點，落在「${themeOf(n)}」代表這個領域最容易讓你覺得順手、有收穫。建議把它當成充電站，累的時候回到這裡。`); continue; }
      const p = planetInHouseParagraph(id, n);
      if (p) paras.push(p);
    }
    return {
      index: n, name: houseName(n), theme: themeOf(n), alias: HOUSE_THEMES[n].alias,
      cuspSign: h.sign.name, cuspDms: h.sign.dms,
      ruler: h.ruler, rulerName: pName(h.ruler), rulerHouse: h.rulerHouse,
      planets: [...h.planets], planetNames: h.planets.map(pName),
      score: sc.score, level: sc.level, raw: sc.raw, detail: sc.detail,
      paragraphs: paras,
    };
  });
}

function buildPlanets(chart) {
  return chart.planets.map((p) => {
    const paras = [];
    if (p.id === 'southnode') {
      paras.push(`【南交點在${p.sign.name}】南交點永遠在北交點對面，${p.sign.name}的特質是你天生熟悉、不用學就會的部分，也是壓力大時最容易退回去的地方。建議把它當成資源，但方向要看北交點。`);
    } else if (p.id === 'fortune') {
      paras.push(`【福點在${p.sign.name}】福點落在${p.sign.name}，代表用${p.sign.name}的方式做事時，你最容易感覺順手、有收穫。建議在需要補充能量時，多做一點這個星座擅長的事。`);
    } else {
      const st = planetSignText(p.id, p.sign.name);
      if (st) paras.push(`【${p.name}在${p.sign.name}】${st}`);
    }
    if (p.house) {
      const ph = planetInHouseParagraph(p.id, p.house);
      if (ph) paras.push(ph);
    }
    if (p.retro && PLANETS[p.id]?.retroText) paras.push(`【${p.name}逆行】${PLANETS[p.id].retroText}`);
    return {
      id: p.id, name: p.name, sign: p.sign.name, dms: p.sign.dms, house: p.house,
      retro: p.retro, dignity: p.dignity ?? null,
      theme: PLANETS[p.id]?.theme ?? null,
      paragraphs: paras,
    };
  });
}

function buildAspects(chart) {
  let withText = 0;
  return chart.aspects.map((a) => {
    let text = null;
    if (withText < 12) { text = aspectText(a.a, a.b, a.type); if (text) withText++; }
    return { a: a.a, b: a.b, aName: pName(a.a), bName: pName(a.b), type: a.type, name: a.name, orb: a.orb, applying: a.applying, text };
  });
}

/* ---------- 五大面向 ---------- */

function planetsInHouse(chart, n) { return chart.houses[n - 1].planets.filter((id) => SCORED_BODIES.has(id)); }

function collectStrengths(chart, cfg, patterns) {
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const n = cfg.main; const h = chart.houses[n - 1];
  const out = [];
  for (const id of planetsInHouse(chart, n)) {
    const p = byId[id];
    if ((ESSENCE[id] ?? 0) > 0) out.push(`${p.name}坐在${houseName(n)}：${PLANETS[id]?.theme ?? p.name}的能量直接投入「${themeOf(n)}」，這裡容易有資源與好感。`);
    if (p.dignity === 'domicile') out.push(`${p.name}在${p.sign.name}入廟：它的本事在這裡發揮得最自然，是你不用勉強就做得好的部分。`);
    else if (p.dignity === 'exaltation') out.push(`${p.name}在${p.sign.name}擢升：這顆行星的優點被放大，用起來比一般人順手。`);
  }
  const rp = byId[h.ruler];
  if (rp && (rp.dignity === 'domicile' || rp.dignity === 'exaltation')) out.push(`守護星${rp.name}狀態好（${rp.dignity === 'domicile' ? '入廟' : '擢升'}）：這個領域有一個穩的主心骨，遇到狀況比較撐得住。`);
  for (const a of chart.aspects) {
    if (a.a !== h.ruler && a.b !== h.ruler) continue;
    if (!HARMONIOUS.has(a.type)) continue;
    const other = a.a === h.ruler ? a.b : a.a;
    out.push(`守護星${rp.name}與${pName(other)}${ASPECT_NAME[a.type]}：${pName(other)}代表的資源會順手流進這個領域，是可以主動去拿的助力。`);
  }
  for (const p of patterns) { const e = p.effect?.[cfg.key]; if (e >= 4) out.push(`格局「${p.name}」對${cfg.key}加分（+${e}）：${firstSentence(p.desc)}`); }
  if (!out.length) out.push('這個領域沒有特別突出的助力，代表成果要靠自己一步一步累積，好處是沒有外力干擾，穩穩做就會有。');
  return out.slice(0, 6);
}

function collectRisks(chart, cfg, patterns) {
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const n = cfg.main; const h = chart.houses[n - 1];
  const out = [];
  for (const id of planetsInHouse(chart, n)) {
    const p = byId[id];
    if ((ESSENCE[id] ?? 0) < 0) out.push(`${p.name}坐在${houseName(n)}：「${themeOf(n)}」容易感覺壓力、變動或需要更多耐心，但也是你練出本事的地方。`);
    if (p.dignity === 'detriment') out.push(`${p.name}在${p.sign.name}失勢：這顆行星在這裡用起來比較彆扭，需要刻意練習才會順。`);
    else if (p.dignity === 'fall') out.push(`${p.name}在${p.sign.name}落陷：它的優點在這裡不太容易發揮，建議找擅長的人補位。`);
    if (p.retro && RETRO_BODIES.has(id)) out.push(`${p.name}逆行：這個領域的節奏傾向慢半拍、往內想，別拿別人的速度逼自己。`);
  }
  const rp = byId[h.ruler];
  if (rp && (rp.dignity === 'detriment' || rp.dignity === 'fall')) out.push(`守護星${rp.name}狀態弱（${rp.dignity === 'detriment' ? '失勢' : '落陷'}）：這個領域的主心骨比較不穩，重大決定多留一點時間確認。`);
  for (const a of chart.aspects) {
    if (a.a !== h.ruler && a.b !== h.ruler) continue;
    if (!TENSE.has(a.type)) continue;
    const other = a.a === h.ruler ? a.b : a.a;
    out.push(`守護星${rp.name}與${pName(other)}${ASPECT_NAME[a.type]}：${pName(other)}代表的事容易跟這個領域互相拉扯，要有意識地安排，別讓它自己發生。`);
  }
  for (const p of patterns) { const e = p.effect?.[cfg.key]; if (e <= -3) out.push(`格局「${p.name}」對${cfg.key}減分（${e}）：${firstSentence(p.desc)}`); }
  if (!out.length) out.push('這個領域沒有明顯的緊張配置，走勢相對平穩，主要的風險來自你自己的選擇與執行，不是外在的阻力。');
  return out.slice(0, 6);
}

/** 可執行建議：依面向、宮內行星、宮主星落宮、分數（語氣照紫微 buildActions，原創） */
function buildActions(chart, cfg, score) {
  const n = cfg.main; const h = chart.houses[n - 1];
  const ids = planetsInHouse(chart, n);
  const has = (...xs) => xs.some((id) => ids.includes(id));
  const rh = h.rulerHouse;
  const A = [];

  if (cfg.key === '事業') {
    if (has('sun', 'jupiter')) A.push('往「被看見、能拍板」的位置走：帶專案、對外簡報、經營專業形象，你在幕後會被埋沒。');
    if (has('saturn', 'pluto')) A.push('選一個可以累積十年的專業，把證照、口碑、案例一件一件疊上去，你的優勢在長跑不在短衝。');
    if (has('mars', 'uranus')) A.push('找有業績、有開拓空間的舞台，設定三年內要打下的具體目標；守成型的工作會壓抑你的衝勁。');
    if (has('mercury', 'venus')) A.push('把你的專業做成可以複製的東西：方法、課程、內容、人脈，用腦力與人緣換錢，不是用工時。');
    if (has('moon', 'neptune')) A.push('挑氣氛好、能照顧人的環境，你的表現跟心情綁在一起；別為了頭銜進一個讓你每天緊繃的地方。');
    if (has('northnode')) A.push('事業是你這輩子要主動走過去的方向，不熟、不習慣都正常，每年給自己一個比現在大一號的目標。');
    if (rh === 6) A.push('你的事業高度是靠日常工作的品質堆出來的，先把手上每一件小事做到讓人放心，升遷自然會來。');
    if (rh === 2) A.push('把事業目標換算成收入目標來管理，你在「看得到錢」的時候最有動力，也最不會走偏。');
    if (rh === 7 || rh === 11) A.push('你的機會多半從人來：合夥人、客戶、朋友圈。每週固定安排一次跟人見面的時間，不要只埋頭做事。');
    if (rh === 9) A.push('你的事業要靠視野撐高：進修、出國、跨領域的學習都值得投資，待在原地會覺得越做越小。');
    if (rh === 4) A.push('把事業跟家、跟不動產綁在一起想：在家工作、家族事業、地方深耕，都比往外飄更適合你。');
    if (rh === 12) A.push('你適合幕後與專業型的位置，不必勉強站到台前；把功夫練到別人非找你不可，比曝光更有用。');
    if (rh === 1) A.push('你的事業跟你這個人綁在一起：形象、信用、個人品牌就是產品，把自己經營好，工作會自己來。');
    if (rh === 3) A.push('你的事業靠說、寫、教與人脈往來推進，把溝通能力當主力技能練，比拚工時有效。');
    if (rh === 5) A.push('把興趣與創意做成事業對你最順，選你玩得起勁的領域，成果會比硬撐的工作好。');
    if (rh === 8) A.push('你的事業常跟別人的資源、危機處理、深度專業有關，敢接別人不敢碰的事，是你的優勢。');
    if (rh === 10) A.push('守護星就在本宮：事業是你人生的主場，目標放大一點沒關係，但要配上家庭與體力的節奏。');
    if (score < 55) A.push('未來十二個月不要頻繁換工作，先在現職做出一個可以量化的成績，履歷才有籌碼。');
    A.push('每季問自己一次：這份工作有沒有讓「可以帶走的能力」變強？沒有就該調整。');
  }

  if (cfg.key === '財運') {
    if (has('venus', 'jupiter')) A.push('你的錢容易進也容易出，把收入先切固定比例存起來再花，讓大方有底線，好運才存得住。');
    if (has('saturn')) A.push('你對錢謹慎，適合走長期累積路線：設十年目標、定期定額，不必羨慕別人的快。');
    if (has('mars', 'uranus')) A.push('收入起伏會比較大，保留至少六個月生活費的現金，這是你所有決定的地基。');
    if (has('moon', 'neptune')) A.push('別用花錢安撫情緒，設一個「想買先等三天」的規則，衝動的支出會少一大半。');
    if (has('pluto')) A.push('所有跟別人牽扯的錢（合夥、借貸、分潤）都白紙黑字寫清楚，你的財務課題多半來自信任與界線。');
    if (has('sun', 'mercury')) A.push('你的收入跟專業與表達綁在一起，把本事練精、把價格講清楚，比找副業更有效。');
    if (has('northnode')) A.push('理財是你這輩子要主動學的功課，從記帳開始，每個月固定看一次數字，慢慢就會有感覺。');
    if (rh === 8) A.push('你的財富常跟別人的資源有關：貸款、合資、家族、伴侶的收入，把規則談清楚，資源才進得來。');
    if (rh === 10) A.push('你的錢主要從事業位置來，投資自己的專業與名聲，是報酬率最穩的一筆。');
    if (rh === 5) A.push('你容易在興趣與投機上花錢，也可能在這裡賺到，給自己一個「玩的錢」上限，超過就停。');
    if (rh === 4) A.push('不動產對你來說是很自然的資產形式，先把自住的家安排好，再談其他；預算與行情這部分可以找阿良一起算。');
    if (rh === 11) A.push('你的財路常靠朋友與圈子打開，經營幾個真正同頻的社群，機會會自己出現。');
    if (rh === 1) A.push('你的財富跟個人能力與形象直接掛鉤，投資自己是最划算的一筆。');
    if (rh === 2) A.push('守護星就在本宮：你天生對錢有感覺，把這份感覺變成固定的存錢與每月檢視的習慣。');
    if (rh === 3) A.push('你的錢從溝通、教學、資訊與往來中來，把說與寫練成能收費的專業。');
    if (rh === 6) A.push('收入靠日常工作的穩定累積，把工作品質顧好，加薪比跳槽實在。');
    if (rh === 7) A.push('合作對象與伴侶會直接影響你的財務，找對人比找對商品重要，條件先講清楚。');
    if (rh === 9) A.push('遠方與進修會帶來收入：外地市場、外語、專業證照都是你的財路。');
    if (rh === 12) A.push('你的錢容易在不知不覺中流掉，每月記帳、關掉沒在用的訂閱，是最直接的止漏。');
    if (score < 55) A.push('先做一次完整的現金流盤點：收入、固定支出、負債、可動用現金，把最大的破口先堵起來。');
    A.push('把每一筆投入分成「能承受全部損失」與「不能」兩類，後者只放在穩的地方，不追熱門。');
  }

  if (cfg.key === '家庭') {
    A.push('每週固定一個「不談事情只相處」的時段，家的問題多半不是事情本身，是相處密度不夠。');
    if (has('sun', 'saturn')) A.push('你在家裡常是扛責任的那個人，主動把事情分出去，讓家人也有機會付出，你才不會累到沒耐心。');
    if (has('moon', 'venus')) A.push('你需要一個真的能放鬆的空間，家裡的布置、光線、安靜程度值得多花一點心思。');
    if (has('mars', 'uranus', 'pluto')) A.push('家裡的溝通要「先處理情緒，再處理事情」，你的直接容易被家人解讀成不在乎。');
    if (has('jupiter')) A.push('你對家的想像比較大，先想清楚哪一種家對你最重要，再照現實預算找，家的溫度不靠坪數決定。');
    if (has('neptune')) A.push('對家人的期待講出來，不要放在心裡等對方猜，猜錯了兩邊都受傷。');
    if (has('northnode')) A.push('家是你這輩子要主動經營的方向，別把它排在工作後面，固定回家吃飯就是很好的開始。');
    if (rh === 10) A.push('你的家跟事業互相影響很深，換工作、搬家這類決定要一起看，不要分開想。');
    if (rh === 7) A.push('伴侶對你的家庭感受影響很大，重大的居住決定先跟另一半取得共識再行動。');
    if (rh === 9 || rh === 3) A.push('你可能會離家發展或搬到不同的環境，把「家」定義成人而不是地點，走到哪都能安心。');
    if (rh === 1) A.push('你的家跟你的自我認同綁得很緊，先把自己照顧好，家人自然感受得到。');
    if (rh === 2) A.push('家對你來說跟安全感與資產分不開，先把居住的財務安排穩，心才會定。');
    if (rh === 4) A.push('守護星就在本宮：家是你的根，投資在家的品質上（空間、關係）回報最直接。');
    if (rh === 5) A.push('家裡的快樂來自一起玩、一起做喜歡的事，安排家庭活動比講道理有用。');
    if (rh === 6) A.push('家事分工與作息是家庭和諧的關鍵，把家務排成固定制度，會少很多摩擦。');
    if (rh === 8) A.push('家庭常牽涉共同財務與上一代的資產，提早把權責、繼承、貸款講清楚。');
    if (rh === 11) A.push('你的家像一個開放的社群，朋友常來、家人像夥伴，維持這種開放感對你很重要。');
    if (rh === 12) A.push('家對你來說是療癒與獨處的地方，給自己一個誰都不能打擾的角落。');
    if (score < 55) A.push('列出目前家裡最讓你耗能的一件事，先處理那一件，不要五件一起扛。');
    A.push('想釐清心中理想的家長什麼樣，可以找阿良聊聊，從你的需求倒推該看什麼樣的房子。');
  }

  if (cfg.key === '感情') {
    if (has('mars', 'uranus', 'pluto')) A.push('你在關係裡熱度高、也容易急，吵架時先離開現場十分鐘再談，效果比當場講贏好很多。');
    if (has('saturn')) A.push('你談感情慢熱、看重承諾，不用勉強自己跟上別人的速度，但要讓對方知道你在認真，不是在猶豫。');
    if (has('venus', 'jupiter')) A.push('你人緣好、選擇多，把「條件」跟「相處起來舒不舒服」分開看，後者才是長久的關鍵。');
    if (has('moon', 'neptune')) A.push('別把不滿悶著，你習慣默默付出、默默記帳，對方其實不知道你在意什麼，每週至少講一次。');
    if (has('sun', 'mercury')) A.push('你在關係裡需要被理解、被聽見，找一個願意聊的人，比找一個條件好的人重要。');
    if (has('northnode')) A.push('一對一的關係是你這輩子要學的功課，不熟悉是正常的，允許自己在關係裡練習依賴別人。');
    if (rh === 5) A.push('你的感情從玩樂與共同興趣開始最自然，多安排一起做喜歡的事，關係會自己升溫。');
    if (rh === 8) A.push('你要的是深度的信任與親密，慢慢來沒關係，但界線與財務要提早談清楚。');
    if (rh === 10 || rh === 6) A.push('你容易在工作場合遇到對象，也容易把關係當成責任在經營，記得留一點只是相處的時間。');
    if (rh === 11) A.push('你的另一半常常先是朋友，從圈子裡認識的人成功率高，不用急著設定目的。');
    if (rh === 1) A.push('先把自己過好，你的關係品質跟你的狀態同步，別在低潮時做關係的重大決定。');
    if (rh === 2) A.push('感情裡的價值觀與金錢觀要早點對齊，這是你的關係穩不穩的關鍵。');
    if (rh === 3) A.push('你的關係是聊出來的，跟能聊得來的人在一起，溝通斷了關係就會淡。');
    if (rh === 4) A.push('你要的是有家的感覺的關係，見家人、一起布置空間會讓你安心。');
    if (rh === 7) A.push('守護星就在本宮：一對一關係是你的天賦與主場，但別把全部重心壓在對方身上。');
    if (rh === 9) A.push('你容易遇到遠方或不同背景的對象，差異是吸引力也是功課，保持好奇別急著改變對方。');
    if (rh === 12) A.push('你的感情容易走進暗戀、犧牲或說不清的關係，把需求講明白，不要自己默默付出。');
    if (score < 55) A.push('如果目前的關係有結，兩個人各自把「最想要對方改的一件事」寫下來交換，比爭論誰對誰錯有效。');
    A.push('伴侶是重大決策的關鍵人，投資、置產、換工作都先取得共識再行動。');
  }

  if (cfg.key === '健康') {
    const body = SIGN_BY_NAME[chart.planets[0].sign.name]?.body;
    if (body) A.push(`體質提醒（依太陽星座）：${firstSentence(body)}`);
    A.push('固定運動是最划算的保養，建議每週三次、每次三十分鐘當起點。');
    if (has('mars', 'sun')) A.push('你的風險是硬撐與過勞，身體發出訊號就去看醫生，不要等到撐不住。');
    if (has('saturn', 'pluto')) A.push('你的身體傾向累積型的緊繃，肩頸、胃口、睡眠是要固定留意的三個地方。');
    if (has('moon', 'neptune')) A.push('你的身體狀況跟情緒連在一起，睡眠品質是你的警訊，睡不好就代表該調整了。');
    if (has('venus', 'jupiter')) A.push('應酬、甜食、晚睡是你最容易鬆掉的三件事，設每週上限並確實做到。');
    if (has('mercury', 'uranus')) A.push('你容易想太多、神經緊繃，睡前一小時遠離螢幕，給大腦真正關機的時間。');
    if (has('northnode')) A.push('把作息當成這輩子要學的功課，固定時間睡覺、吃飯，先做到一個月再說。');
    if (rh === 12) A.push('你的健康跟休息品質關係最大，每天留一段不被打擾的時間，比吃補品實在。');
    if (rh === 1) A.push('你的作息直接寫在臉上與體態上，把運動排進行程表當成正事，不要靠意志力。');
    if (rh === 2) A.push('你的健康跟飲食與生活品質綁在一起，花在好食材與好床墊的錢值得。');
    if (rh === 3) A.push('你的身體跟神經、呼吸與作息連動，走路、深呼吸、少滑手機比補品有用。');
    if (rh === 4) A.push('家的環境影響你的健康最多，通風、光線、睡眠空間先顧好。');
    if (rh === 5) A.push('你在玩樂與運動中最容易維持健康，找一項你覺得好玩的運動，不要靠硬撐。');
    if (rh === 6) A.push('守護星就在本宮：日常習慣就是你的體質，固定作息是你最實在的保養。');
    if (rh === 7) A.push('伴侶與合作的壓力會直接反映在身體上，關係有結先處理，身體會跟著好。');
    if (rh === 8) A.push('你的身體傾向累積後一次爆發，定期健檢與提早處理小問題最重要。');
    if (rh === 9) A.push('你的身體需要出去走：旅行、戶外、換環境對你的健康幫助很大。');
    if (rh === 10) A.push('工作壓力是你健康最大的變數，把下班時間當成邊界，不要一直在線上。');
    if (rh === 11) A.push('朋友與社群活動是你維持身心健康的方式，固定跟朋友運動或聚會。');
    if (score < 55) A.push('今年之內安排一次完整的健康檢查，把自己的基準線建立起來。');
  }

  // 保底：至少 3 句
  const fill = {
    事業: ['把今年最想做出的一件成績寫下來貼在看得到的地方，每個月檢查一次進度。', '每半年更新一次履歷與作品集，就算不換工作也要知道自己的市場價值。'],
    財運: ['每個月固定看一次收支數字，先知道錢去哪裡，再談怎麼變多。', '把緊急預備金放在隨時能動用的地方，其他的錢才敢放長期。'],
    家庭: ['主動安排一次家人聚餐或出遊，用相處代替解釋。', '每年跟家人一起做一次大整理，順便把想改變的空間講出來。'],
    感情: ['每天留十分鐘認真聽對方講話，不要邊滑手機邊回。', '每個月安排一次只有兩個人的約會，不談家事、不談工作。'],
    健康: ['固定時間睡覺與起床，先做到一個月，很多小毛病會自己好。', '每年做一次基本健檢，把數字記下來，跟去年比比看。'],
  };
  for (const s of fill[cfg.key]) if (A.length < 3) A.push(s);
  return A.slice(0, 5);
}

function buildDomain(chart, cfg, patterns, score) {
  const n = cfg.main; const h = chart.houses[n - 1];
  const ids = planetsInHouse(chart, n);
  const paras = [];
  paras.push(`【${houseName(n)}・${themeOf(n)}】${HOUSES[n - 1].desc}`);
  paras.push(cuspParagraph(chart, n));
  const rp = rulerParagraph(chart, n);
  if (rp) paras.push(rp);
  for (const id of ids) { const p = planetInHouseParagraph(id, n); if (p) paras.push(p); }

  // 主要相位：涉及宮內行星或宮主星，最多 3 條
  const watch = new Set([...ids, h.ruler]);
  let cnt = 0;
  for (const a of chart.aspects) {
    if (cnt >= 3) break;
    if (!watch.has(a.a) && !watch.has(a.b)) continue;
    const txt = aspectText(a.a, a.b, a.type);
    if (!txt) continue;
    paras.push(`${aspectTitle(a)}${txt}`);
    cnt++;
  }
  for (const p of patterns) {
    const e = p.effect?.[cfg.key];
    if (e && Math.abs(e) >= 4) paras.push(`【格局：${p.name}】${p.desc}對${cfg.key}的影響為${e > 0 ? `加分（+${e}）` : `減分（${e}）`}。`);
  }

  const refs = cfg.refs.map(([rn, weight]) => {
    const rs = scoreHouse(chart, rn);
    return { house: houseName(rn), index: rn, theme: themeOf(rn), weight, planets: planetsInHouse(chart, rn), planetNames: planetsInHouse(chart, rn).map(pName), score: rs.score, level: rs.level };
  });

  return {
    key: cfg.key, score, level: levelOf(score), estimated: Boolean(chart.solarChart),
    mainHouse: houseName(n), mainIndex: n, mainTheme: themeOf(n),
    planetsIn: ids, planetNames: ids.map(pName),
    ruler: h.ruler, rulerName: pName(h.ruler), rulerHouse: h.rulerHouse,
    paragraphs: paras,
    strengths: collectStrengths(chart, cfg, patterns),
    risks: collectRisks(chart, cfg, patterns),
    actions: buildActions(chart, cfg, score),
    refs,
  };
}

/* ---------- 職業 ---------- */

function buildCareers(chart, patterns) {
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const sunSign = byId.sun.sign.name;
  const mcSign = chart.angles ? chart.angles.mc.sign.name : null;
  const inH = (n) => chart.houses[n - 1].planets.filter((id) => MAIN_PLANETS.includes(id));
  const rows = [];
  for (const [cat, cfg] of Object.entries(INDUSTRY_MAP)) {
    let raw = 0;
    const matched = [];
    if (cfg.signs.includes(sunSign)) { raw += 3; matched.push(`太陽${sunSign}`); }
    if (mcSign && cfg.signs.includes(mcSign)) { raw += 2.5; matched.push(`天頂${mcSign}`); }
    for (const [hn, w] of [[10, 3], [6, 2], [2, 1.5]]) {
      for (const id of inH(hn)) if (cfg.planets.includes(id)) { raw += w; matched.push(`${houseName(hn)}${pName(id)}`); }
    }
    for (const id of ['mercury', 'mars', 'saturn']) {
      const s = byId[id].sign.name;
      if (cfg.signs.includes(s)) { raw += 1.2; matched.push(`${pName(id)}${s}`); }
    }
    for (const hn of cfg.houses) {
      if (inH(hn).length) { raw += 1; matched.push(`${houseName(hn)}有行星`); }
    }
    for (const p of patterns) {
      if (!p.careerHint) continue;
      if (p.careerHint.split('、').some((hint) => cfg.jobs.some((j) => j.includes(hint)) || cat.includes(hint))) { raw += 2.5; matched.push(`格局「${p.name}」`); }
    }
    if (raw > 0) rows.push({ category: cat, raw, matched, jobs: [...cfg.jobs] });
  }
  rows.sort((x, y) => y.raw - x.raw || x.category.localeCompare(y.category, 'zh-Hant'));
  const max = rows.length ? rows[0].raw : 1;
  const all = rows.map((r, i) => ({
    rank: i + 1, category: r.category,
    score: clamp(45, 98, Math.round(55 + (r.raw / max) * 40)),
    matched: r.matched, jobs: r.jobs,
    reason: `你的${r.matched.slice(0, 3).join('、')}對應這類工作需要的特質。`,
  }));
  return { top: all.slice(0, 5), all, avoid: buildAvoid(chart) };
}

function buildAvoid(chart) {
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const sun = byId.sun.sign.name;
  const inH = (n) => chart.houses[n - 1].planets;
  const at = (id, ...hs) => hs.includes(byId[id]?.house);
  const out = [];
  if (at('mars', 10, 6) || at('uranus', 10) || ['牡羊座', '獅子座', '射手座', '水瓶座'].includes(sun)) out.push('高度重複、沒有變化、學不到新東西的例行工作，會磨掉你的衝勁。');
  if (at('saturn', 10, 6) || ['摩羯座', '處女座', '金牛座'].includes(sun)) out.push('朝令夕改、沒有制度可以依循的環境，你的可靠會被浪費。');
  if (at('moon', 6, 10) || at('venus', 6) || at('neptune', 6, 10) || ['巨蟹座', '雙魚座', '天秤座'].includes(sun)) out.push('每天要跟人硬碰硬、互相踩線的高壓淘汰制，會壓掉你的優點。');
  if (at('pluto', 10, 6) || ['天蠍座'].includes(sun)) out.push('權責講不清、要靠關係與人情運作的位置，你會被消耗。');
  if (byId.mercury.retro || at('mercury', 12)) out.push('需要當場即時反應、沒有時間思考的談判型角色。');
  if (inH(10).length === 0 && inH(6).length === 0 && !out.length) out.push('沒有特別要避開的類型，重點是選一個能長期累積的領域。');
  if (!out.length) out.push('沒有特別要避開的類型，重點是選一個能長期累積的領域。');
  return out.slice(0, 4);
}

/* ---------- 人生週期 ---------- */

function buildCycles(chart, age) {
  const b = parseBirth(chart);
  return CYCLES.map((c) => ({
    id: c.id, name: c.name, planet: c.planet, planetName: pName(c.planet),
    ageFrom: c.ageFrom, ageTo: c.ageTo,
    yearFrom: b.y + c.ageFrom, yearTo: b.y + c.ageTo,
    status: cycleStatus(c, age),
    text: c.text, advice: c.advice,
  })).sort((x, y) => x.ageFrom - y.ageFrom || x.ageTo - y.ageTo);
}

/* ---------- 今年行運 ---------- */

/** 某年某月某日（UTC 中午）的木星／土星黃經；日期是傳進來的，不是現在時間 */
function lonAt(id, y, mo, d) {
  return bodyLon(id, A.MakeTime(new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))));
}
function angleSep(a, b) { let d = Math.abs(norm(a) - norm(b)); if (d > 180) d = 360 - d; return d; }

function buildYear(chart, today, todayNote) {
  const year = today.y;
  const cusps = [0, ...chart.houses.map((h) => h.cusp)];
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const targets = [['sun', byId.sun.lon], ['moon', byId.moon.lon]];
  if (chart.angles) targets.push(['asc', chart.angles.asc.lon]);
  const transits = [];
  const paragraphs = [];
  const notes = [];
  const houseByPlanet = {};
  const signByPlanet = {};

  for (const planet of ['jupiter', 'saturn']) {
    const lons = [lonAt(planet, year, 1, 1), lonAt(planet, year, 7, 1), lonAt(planet, year, 12, 31)];
    const houses = lons.map((l) => houseOf(l, cusps));
    const count = {};
    for (const h of houses) count[h] = (count[h] ?? 0) + 1;
    let house = houses[1];
    for (const [h, c] of Object.entries(count)) if (c > (count[house] ?? 0)) house = Number(h);
    houseByPlanet[planet] = house;
    signByPlanet[planet] = signOf(lons[1]).name;
    const htext = TRANSIT_HOUSE[planet][house];
    transits.push({ planet, planetName: pName(planet), kind: 'house', target: house, targetName: houseName(house), type: null, text: htext, lons: lons.map((l) => Math.round(l * 100) / 100), houses });
    paragraphs.push(`【今年${pName(planet)}在你的${houseName(house)}・${themeOf(house)}】${TRANSIT_INTRO[planet]}${htext}`);
    notes.push({ type: planet === 'jupiter' ? '機會' : '課題', text: firstSentence(htext) });

    for (const [tid, tlon] of targets) {
      let best = null;
      for (const type of ASPECT_DEFS) {
        for (const l of lons) {
          const orb = Math.abs(angleSep(l, tlon) - type.angle);
          if (orb <= 3 && (!best || orb < best.orb)) best = { type: type.id, name: type.name, orb: Math.round(orb * 100) / 100 };
        }
      }
      if (!best) continue;
      const atext = TRANSIT_ASPECT[planet]?.[tid]?.[best.type];
      if (!atext) continue;
      transits.push({ planet, planetName: pName(planet), kind: 'aspect', target: tid, targetName: tid === 'asc' ? '上升點' : pName(tid), type: best.type, typeName: best.name, orb: best.orb, text: atext });
      paragraphs.push(`【今年${pName(planet)}${best.name}本命${tid === 'asc' ? '上升點' : pName(tid)}】${atext}`);
      const good = planet === 'jupiter' ? !TENSE.has(best.type) : HARMONIOUS.has(best.type);
      notes.push({ type: good ? '機會' : '課題', text: firstSentence(atext) });
    }
  }

  let note = todayNote ?? null;
  if (chart.solarChart) note = (note ? note + ' ' : '') + '不知道出生時間，行運落宮用太陽盤估算，只看星座層級的大方向。';
  if (note) paragraphs.push(`【說明】${note}`);

  return {
    year, today: `${today.y}-${String(today.mo).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`,
    jupiterHouse: houseByPlanet.jupiter, saturnHouse: houseByPlanet.saturn,
    jupiterSign: signByPlanet.jupiter, saturnSign: signByPlanet.saturn,
    transits, paragraphs, notes, note, estimated: Boolean(chart.solarChart),
  };
}

/* ---------- 主函式 ---------- */

export function analyze(chart, opts = {}) {
  if (!chart || !Array.isArray(chart.houses) || chart.houses.length !== 12) throw new Error('沒有收到完整的星盤資料');
  let today = parseToday(opts.today);
  let todayNote = null;
  if (!today) {
    today = parseBirth(chart);
    todayNote = '呼叫時沒有給今天的日期，這裡暫時用出生日當作今天，年運與年齡只是示意。';
  }
  const ctx = makeContext(chart);
  const patterns = detectPatterns(ctx);
  const domainScores = {};
  for (const k of DOMAIN_KEYS) domainScores[k] = scoreDomain(chart, DOMAINS[k], patterns);
  const aspects = buildAspects(chart);
  const domains = {};
  for (const k of DOMAIN_KEYS) domains[k] = buildDomain(chart, DOMAINS[k], patterns, domainScores[k]);
  const age = ageAt(chart, today);

  return {
    overview: buildOverview(chart, ctx, patterns, domainScores),
    domains,
    planets: buildPlanets(chart),
    houses: buildHouses(chart),
    aspects,
    patterns,
    careers: buildCareers(chart, patterns),
    cycles: buildCycles(chart, age),
    year: { age, ...buildYear(chart, today, todayNote) },
    age,
    timeUnknown: Boolean(chart.solarChart),
  };
}
