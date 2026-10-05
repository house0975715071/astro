// 星盤排盤引擎（規格書 3.1、3.3～3.6）
// 只准 import './engine-adapter.mjs'（瀏覽器版建置時會換成 web/engine-adapter.js）。
// 星座／行星名稱與尊貴表直接放這裡（不依賴 kb/），kb 只負責解說文字。
import { A } from './engine-adapter.js?v=00e539aa';
import { localToUtc, assertTimeZone, utcToLocalFields } from './timezone.js?v=00e539aa';

/* ---------- 常數 ---------- */
export const SIGN_NAMES = Object.freeze([
  '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
  '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座',
]);
export const SIGN_SHORT = Object.freeze(SIGN_NAMES.map((s) => s.slice(0, 2)));
export const ELEMENT_KEYS = Object.freeze(['fire', 'earth', 'air', 'water']);
export const ELEMENT_NAMES = Object.freeze({ fire: '火象', earth: '土象', air: '風象', water: '水象' });
export const MODE_KEYS = Object.freeze(['cardinal', 'fixed', 'mutable']);
export const MODE_NAMES = Object.freeze({ cardinal: '本位', fixed: '固定', mutable: '變動' });
/** 星座 index → 元素 key（牡羊火、金牛土、雙子風、巨蟹水…循環） */
export const SIGN_ELEMENT = Object.freeze(SIGN_NAMES.map((_, i) => ELEMENT_KEYS[i % 4]));
/** 星座 index → 模式 key（牡羊本位、金牛固定、雙子變動…循環） */
export const SIGN_MODE = Object.freeze(SIGN_NAMES.map((_, i) => MODE_KEYS[i % 3]));
/** 現代守護星（天蠍冥王星、水瓶天王星、雙魚海王星） */
export const SIGN_RULER = Object.freeze([
  'mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
  'venus', 'pluto', 'jupiter', 'saturn', 'uranus', 'neptune',
]);

export const PLANET_ORDER = Object.freeze([
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'northnode', 'southnode', 'fortune',
]);
export const PLANET_NAMES = Object.freeze({
  sun: '太陽', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
  jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', pluto: '冥王星',
  northnode: '北交點', southnode: '南交點', fortune: '福點',
  asc: '上升', mc: '天頂', dsc: '下降', ic: '天底',
});
/** 十大行星（相位、元素統計用） */
export const MAIN_PLANETS = Object.freeze(PLANET_ORDER.slice(0, 10));

/**
 * 尊貴表（現代守護）：入廟＝現代守護的星座、失勢＝其對宮；擢升／落陷用通行的配置。
 * 星座用 index（0 牡羊 … 11 雙魚）。
 */
export const DIGNITY = Object.freeze({
  sun:     Object.freeze({ domicile: [4],    exaltation: [0],  detriment: [10],   fall: [6] }),
  moon:    Object.freeze({ domicile: [3],    exaltation: [1],  detriment: [9],    fall: [7] }),
  mercury: Object.freeze({ domicile: [2, 5], exaltation: [5],  detriment: [8, 11], fall: [11] }),
  venus:   Object.freeze({ domicile: [1, 6], exaltation: [11], detriment: [7, 0], fall: [5] }),
  mars:    Object.freeze({ domicile: [0],    exaltation: [9],  detriment: [6],    fall: [3] }),
  jupiter: Object.freeze({ domicile: [8],    exaltation: [3],  detriment: [2],    fall: [9] }),
  saturn:  Object.freeze({ domicile: [9],    exaltation: [6],  detriment: [3],    fall: [0] }),
  uranus:  Object.freeze({ domicile: [10],   exaltation: [7],  detriment: [4],    fall: [1] }),
  neptune: Object.freeze({ domicile: [11],   exaltation: [3],  detriment: [5],    fall: [9] }),
  pluto:   Object.freeze({ domicile: [7],    exaltation: [0],  detriment: [1],    fall: [6] }),
});
export const DIGNITY_NAMES = Object.freeze({ domicile: '入廟', exaltation: '擢升', detriment: '失勢', fall: '落陷' });

export const HOUSE_THEMES = Object.freeze([
  null,
  Object.freeze({ theme: '自我與形象', alias: '命宮' }),
  Object.freeze({ theme: '金錢與價值', alias: '財帛宮' }),
  Object.freeze({ theme: '溝通與學習', alias: '兄弟宮' }),
  Object.freeze({ theme: '家與房子', alias: '田宅宮' }),
  Object.freeze({ theme: '戀愛與創造', alias: '子女宮' }),
  Object.freeze({ theme: '工作與健康習慣', alias: '工作宮' }),
  Object.freeze({ theme: '伴侶與合作', alias: '夫妻宮' }),
  Object.freeze({ theme: '共同財務與深層連結', alias: '疾厄宮' }),
  Object.freeze({ theme: '遠方與信念', alias: '遷移宮' }),
  Object.freeze({ theme: '事業與社會位置', alias: '官祿宮' }),
  Object.freeze({ theme: '朋友與願景', alias: '福德宮' }),
  Object.freeze({ theme: '獨處與潛意識', alias: '心靈宮' }),
]);
const HOUSE_NUM = Object.freeze(['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']);

export const ASPECT_TYPES = Object.freeze([
  Object.freeze({ id: 'conjunction', name: '合相', angle: 0, orbLum: 10, orb: 7, orbAxis: 5 }),
  Object.freeze({ id: 'sextile', name: '六分相', angle: 60, orbLum: 6, orb: 6, orbAxis: 3 }),
  Object.freeze({ id: 'square', name: '四分相', angle: 90, orbLum: 10, orb: 7, orbAxis: 5 }),
  Object.freeze({ id: 'trine', name: '三分相', angle: 120, orbLum: 10, orb: 7, orbAxis: 5 }),
  Object.freeze({ id: 'opposition', name: '對分相', angle: 180, orbLum: 10, orb: 7, orbAxis: 5 }),
]);

export const HOUSE_SYSTEMS = Object.freeze({ placidus: 'Placidus 宮位制', whole: '整宮制', equal: '等宮制', porphyry: 'Porphyry 宮位制' });

const BODY = Object.freeze({
  mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter',
  saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
});

/* ---------- 小工具 ---------- */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export function norm(deg) { let x = deg % 360; if (x < 0) x += 360; return x === 360 ? 0 : x; }
/** 收到 (−180, 180] */
export function wrap180(deg) { let x = norm(deg); if (x > 180) x -= 360; return x; }
const sin = (d) => Math.sin(d * D2R);
const cos = (d) => Math.cos(d * D2R);
const tan = (d) => Math.tan(d * D2R);
const atan2d = (y, x) => norm(Math.atan2(y, x) * R2D);

/** 「第X宮」標準化（避免「第一宮宮」這類雙字尾） */
export function houseName(n) {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1 || k > 12) throw new Error(`宮位編號不對：${n}`);
  return `第${HOUSE_NUM[k]}宮`;
}
export function houseLabel(n) { return `${houseName(n)}・${HOUSE_THEMES[n].theme}（${HOUSE_THEMES[n].alias}）`; }

/** 黃經 → 星座內度分字串，四捨五入到角分；到 30°00′ 時壓回 29°59′（星座以真實黃經為準） */
export function fmtDms(lon) {
  const inSign = norm(lon) % 30;
  let m = Math.round(inSign * 60);
  if (m >= 1800) m = 1799;
  const d = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(d).padStart(2, '0')}°${String(mm).padStart(2, '0')}′`;
}

/** 黃經 → sign 物件 {index, name, short, deg, dms, boundary?} */
export function signOf(lon) {
  const L = norm(lon);
  const index = Math.floor(L / 30) % 12;
  const deg = L - index * 30;
  const sign = { index, name: SIGN_NAMES[index], short: SIGN_SHORT[index], deg: Math.min(29.99, Math.round(deg * 100) / 100), dms: fmtDms(L) };
  // 離星座交界 ±1′ 以內
  if (deg < 1 / 60 || 30 - deg < 1 / 60) sign.boundary = true;
  return sign;
}
export function fmtLon(lon) { const s = signOf(lon); return `${s.name} ${s.dms}`; }

export function elementOf(lon) { return SIGN_ELEMENT[signOf(lon).index]; }
export function modeOf(lon) { return SIGN_MODE[signOf(lon).index]; }

export function dignityOf(planetId, signIndex) {
  const d = DIGNITY[planetId];
  if (!d) return null;
  for (const k of ['domicile', 'exaltation', 'detriment', 'fall']) if (d[k].includes(signIndex)) return k;
  return null;
}

/* ---------- 時間 ---------- */
export function jdFromUtcMs(utcMs) { return utcMs / 86400000 + 2440587.5; }
export function utcMsFromJd(jd) { return (jd - 2440587.5) * 86400000; }
function makeTime(utcMs) { return A.MakeTime(new Date(utcMs)); }

/* ---------- 天文位置 ---------- */
/** 單一天體的視黃經／黃緯（黃道 of date） */
export function bodyPosition(id, t) {
  if (id === 'sun') return { lon: norm(A.SunPosition(t).elon), lat: 0 };
  if (id === 'moon') { const m = A.EclipticGeoMoon(t); return { lon: norm(m.lon), lat: m.lat }; }
  if (id === 'northnode') return { lon: trueNode(t), lat: 0 };
  if (id === 'southnode') return { lon: norm(trueNode(t) + 180), lat: 0 };
  const name = BODY[id];
  if (!name) throw new Error(`不認識的天體：${id}`);
  const e = A.Ecliptic(A.GeoVector(A.Body[name], t, true));
  return { lon: norm(e.elon), lat: e.elat };
}
export function bodyLon(id, t) { return bodyPosition(id, t).lon; }

/** 真北交點：月球地心狀態向量 r×v 的密切軌道昇交點，轉到黃道 of date */
export function trueNode(t) {
  const st = A.GeoMoonState(t);
  const rot = A.Rotation_EQJ_ECT(t);
  const r = A.RotateVector(rot, new A.Vector(st.x, st.y, st.z, t));
  const v = A.RotateVector(rot, new A.Vector(st.vx, st.vy, st.vz, t));
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  return atan2d(hx, -hy);
}

/** 平均交點（Meeus） */
export function meanNode(t) {
  const T = t.tt / 36525;
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441 - T * T * T * T / 60616000);
}

/** 速度（度／日）：前後各一小時差分 */
export function bodySpeed(id, utcMs) {
  const h = 3600000;
  const a = bodyLon(id, makeTime(utcMs - h));
  const b = bodyLon(id, makeTime(utcMs + h));
  return wrap180(b - a) / (2 / 24);
}

/** 真黃赤交角、恆星時、RAMC */
export function siderealData(utcMs, lonEast) {
  const t = makeTime(utcMs);
  const eps = A.e_tilt(t).tobl;
  const gast = norm(A.SiderealTime(t) * 15);
  return { eps, gast, ramc: norm(gast + lonEast) };
}

/** 天頂黃經 */
export function mcFromRamc(ramc, eps) { return atan2d(sin(ramc), cos(ramc) * cos(eps)); }
/** 上升黃經（極區時要求上升落在天頂之後的半圈） */
export function ascFromRamc(ramc, eps, lat) {
  let asc = atan2d(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps)));
  const mc = mcFromRamc(ramc, eps);
  if (norm(asc - mc) > 180) asc = norm(asc + 180);
  return asc;
}

/* ---------- 宮位制 ---------- */
/** 黃道上黃緯 0 的點：赤經 → 黃經 */
export function raToLon(ra, eps) { return atan2d(sin(ra), cos(ra) * cos(eps)); }
/** 黃道點的赤緯（tan δ = tan ε · sin α） */
function declFromRa(ra, eps) { return Math.atan(tan(eps) * sin(ra)) * R2D; }

/**
 * Placidus 半弧迭代。回 12 個宮頭黃經（index 1～12），不收斂或極圈內回 null。
 * 11 宮 α=RAMC+DSA/3、12 宮 α=RAMC+2·DSA/3、2 宮 α=RAMC+180−2·NSA/3、3 宮 α=RAMC+180−NSA/3。
 */
export function placidusCusps(ramc, eps, lat, asc, mc) {
  if (Math.abs(lat) >= 90 - eps) return null;
  const solve = (start, fracDay, isNight) => {
    let ra = norm(ramc + start);
    for (let i = 0; i < 100; i++) {
      const dec = declFromRa(ra, eps);
      const x = -tan(lat) * tan(dec);
      if (x <= -1 || x >= 1) return null; // 永不落／永不升
      const dsa = Math.acos(x) * R2D;
      const nsa = 180 - dsa;
      const next = isNight ? norm(ramc + 180 - fracDay * nsa) : norm(ramc + fracDay * dsa);
      const delta = Math.abs(wrap180(next - ra));
      ra = next;
      if (delta < 1e-9) return raToLon(ra, eps);
    }
    return null;
  };
  const h11 = solve(30, 1 / 3, false);
  const h12 = solve(60, 2 / 3, false);
  const h2 = solve(120, 2 / 3, true);
  const h3 = solve(150, 1 / 3, true);
  if ([h11, h12, h2, h3].some((v) => v == null)) return null;
  const c = new Array(13).fill(0);
  c[1] = asc; c[2] = h2; c[3] = h3; c[4] = norm(mc + 180);
  c[5] = norm(h11 + 180); c[6] = norm(h12 + 180); c[7] = norm(asc + 180);
  c[8] = norm(h2 + 180); c[9] = norm(h3 + 180); c[10] = mc;
  c[11] = h11; c[12] = h12;
  // 宮頭必須依序（每個宮 0～180° 寬）
  for (let i = 1; i <= 12; i++) {
    const w = norm(c[i % 12 + 1] - c[i]);
    if (w <= 0 || w >= 180) return null;
  }
  return c;
}

/** Porphyry：MC→ASC、ASC→IC 各三等分 */
export function porphyryCusps(asc, mc) {
  const c = new Array(13).fill(0);
  const q1 = norm(asc - mc);       // 天頂到上升（四象限第一段）
  const q2 = 180 - q1;             // 上升到天底
  c[1] = asc; c[10] = mc; c[4] = norm(mc + 180); c[7] = norm(asc + 180);
  c[11] = norm(mc + q1 / 3); c[12] = norm(mc + 2 * q1 / 3);
  c[2] = norm(asc + q2 / 3); c[3] = norm(asc + 2 * q2 / 3);
  c[5] = norm(c[11] + 180); c[6] = norm(c[12] + 180); c[8] = norm(c[2] + 180); c[9] = norm(c[3] + 180);
  return c;
}
export function wholeSignCusps(startLon) {
  const base = Math.floor(norm(startLon) / 30) * 30;
  const c = new Array(13).fill(0);
  for (let i = 1; i <= 12; i++) c[i] = norm(base + 30 * (i - 1));
  return c;
}
export function equalCusps(asc) {
  const c = new Array(13).fill(0);
  for (let i = 1; i <= 12; i++) c[i] = norm(asc + 30 * (i - 1));
  return c;
}
/** 行星落宮：cusp[i] ≤ lon < cusp[i+1]（環狀） */
export function houseOf(lon, cusps) {
  for (let i = 1; i <= 12; i++) {
    const a = cusps[i];
    const b = cusps[i % 12 + 1];
    const w = norm(b - a);
    const x = norm(lon - a);
    if (x < w || (w === 0 && x === 0)) return i;
  }
  return 12;
}

/* ---------- 輸入驗證 ---------- */
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

export function parseDate(str) {
  const m = DATE_RE.exec(String(str ?? '').trim());
  if (!m) throw new Error('出生日期格式不對，請用 西元年-月-日（例：1985-6-15）');
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  // 規格書寫 1900～2100；放寬到 1800 是為了讓 1879 年的回歸測試盤（愛因斯坦）也能算
  if (y < 1800 || y > 2100) throw new Error('出生年份只支援西元 1800 到 2100 年');
  if (mo < 1 || mo > 12) throw new Error('出生月份必須在 1 到 12 之間');
  if (d < 1 || d > daysInMonth(y, mo)) throw new Error('這個月沒有這一天，請再確認日期'); // 訊息不帶年月日數值（生日是個資，錯誤可能被印到主控台）
  return { y, mo, d };
}
export function parseTime(str) {
  const m = TIME_RE.exec(String(str ?? '').trim());
  if (!m) throw new Error('出生時間格式不對，請用 24 小時制（例：13:30）');
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h < 0 || h > 23) throw new Error('出生時間的「時」必須在 0 到 23 之間');
  if (mi < 0 || mi > 59) throw new Error('出生時間的「分」必須在 0 到 59 之間');
  return { h, mi };
}
export function validatePlace(place) {
  if (!place || typeof place !== 'object') throw new Error('請選擇出生地');
  const name = String(place.name ?? '').trim();
  if (!name) throw new Error('出生地缺少名稱');
  const lat = Number(place.lat); const lon = Number(place.lon);
  if (!Number.isFinite(lat) || lat < -89.99 || lat > 89.99) throw new Error('出生地緯度必須在 −89.99 到 89.99 之間');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('出生地經度必須在 −180 到 180 之間');
  const tz = assertTimeZone(place.tz);
  return { id: place.id ? String(place.id) : '', name, lat, lon, tz };
}
export function normalizeInput(input) {
  if (!input || typeof input !== 'object') throw new Error('沒有收到排盤資料');
  const name = String(input.name ?? '').trim();
  const { y, mo, d } = parseDate(input.date);
  const timeUnknown = Boolean(input.timeUnknown) || input.time == null || String(input.time).trim() === '';
  const tm = timeUnknown ? null : parseTime(input.time);
  const place = validatePlace(input.place);
  const houseSystem = input.houseSystem == null || input.houseSystem === '' ? 'placidus' : String(input.houseSystem);
  if (!['placidus', 'whole', 'equal'].includes(houseSystem)) throw new Error('宮位制只支援 placidus、whole、equal');
  const dstChoice = input.dstChoice == null || input.dstChoice === '' ? null : String(input.dstChoice);
  if (dstChoice != null && dstChoice !== 'earlier' && dstChoice !== 'later') throw new Error('夏令時間的選擇只能是 earlier 或 later');
  return {
    name, date: `${y}-${mo}-${d}`, y, mo, d,
    time: tm ? `${String(tm.h).padStart(2, '0')}:${String(tm.mi).padStart(2, '0')}` : null,
    h: tm ? tm.h : 12, mi: tm ? tm.mi : 0,
    timeUnknown, place, houseSystem, dstChoice,
  };
}

/* ---------- 相位 ---------- */
const LUMINARIES = new Set(['sun', 'moon']);
const AXES = new Set(['asc', 'mc']);
const AXES_AND_NODES = new Set(['asc', 'mc', 'northnode', 'southnode']);
export function maxOrb(a, b, type) {
  if (AXES_AND_NODES.has(a) || AXES_AND_NODES.has(b)) return type.orbAxis;
  if (LUMINARIES.has(a) || LUMINARIES.has(b)) return type.orbLum;
  return type.orb;
}
/** bodies: [{id, lon, speed}] → 相位陣列，依 orb 由小到大 */
export function computeAspects(bodies) {
  const out = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const p = bodies[i]; const q = bodies[j];
      if (AXES.has(p.id) && AXES.has(q.id)) continue; // 上升跟天頂之間不算相位
      const diff = wrap180(q.lon - p.lon);          // q 相對 p 的有號角距
      const sep = Math.abs(diff);
      for (const type of ASPECT_TYPES) {
        const orb = Math.abs(sep - type.angle);
        const limit = maxOrb(p.id, q.id, type);
        if (orb > limit) continue;
        // 入相：兩星相對速度讓角距趨近精確值
        const relSpeed = (q.speed ?? 0) - (p.speed ?? 0);   // diff 的變化率
        const sepRate = diff >= 0 ? relSpeed : -relSpeed;    // |diff| 的變化率
        const applying = sep > type.angle ? sepRate < 0 : sepRate > 0;
        out.push({ a: p.id, b: q.id, type: type.id, name: type.name, angle: type.angle, orb: Math.round(orb * 100) / 100, maxOrb: limit, applying, exact: orb < 1e-9 });
        break; // 同一對只可能符合一種相位
      }
    }
  }
  out.sort((x, y) => x.orb - y.orb || x.a.localeCompare(y.a));
  for (const a of out) delete a.exact;
  return out;
}

/* ---------- 主流程 ---------- */
function planetEntry(id, utcMs, t) {
  const pos = bodyPosition(id, t);
  const speed = bodySpeed(id, utcMs);
  const sign = signOf(pos.lon);
  return {
    id, name: PLANET_NAMES[id],
    lon: pos.lon, lat: pos.lat, speed,
    retro: (id === 'sun' || id === 'moon') ? false : speed < 0,
    sign, house: null,
    dignity: dignityOf(id, sign.index),
  };
}

/** 月亮跨座：找出當天當地 00:00～23:59 月亮換星座的時刻 */
function moonAmbiguity(n) {
  // 掃描範圍要涵蓋整個當地日：開頭取「第一次」、結尾取「第二次」，時鐘回撥那一小時兩次都掃到
  // （不看使用者的 dstChoice；那是出生時刻用的，不是掃描範圍用的）
  const start = localToUtc(n.y, n.mo, n.d, 0, 0, n.place.tz, 'earlier', n.place.lon).utcMs;
  const end = localToUtc(n.y, n.mo, n.d, 23, 59, n.place.tz, 'later', n.place.lon).utcMs;
  const s0 = signOf(bodyLon('moon', makeTime(start))).index;
  const s1 = signOf(bodyLon('moon', makeTime(end))).index;
  if (s0 === s1) return null;
  let lo = start; let hi = end;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (signOf(bodyLon('moon', makeTime(mid))).index === s0) lo = mid; else hi = mid;
  }
  const f = utcToLocalFields(n.place.tz, hi);
  return { from: SIGN_NAMES[s0], to: SIGN_NAMES[s1], switchLocal: `${String(f.h).padStart(2, '0')}:${String(f.mi).padStart(2, '0')}` };
}

/**
 * 排盤主函式（規格書 3.6 的 chart 形狀）
 */
export function buildChart(input) {
  const n = normalizeInput(input);
  const tzr = localToUtc(n.y, n.mo, n.d, n.h, n.mi, n.place.tz, n.dstChoice, n.place.lon);
  const utcMs = tzr.utcMs;
  const t = makeTime(utcMs);
  const sd = siderealData(utcMs, n.place.lon);

  const planets = MAIN_PLANETS.concat(['northnode', 'southnode']).map((id) => planetEntry(id, utcMs, t));
  const byId = Object.fromEntries(planets.map((p) => [p.id, p]));

  let angles = null;
  let cusps;
  let houseSystemUsed = n.houseSystem;
  let houseNote = null;
  let solarChart = false;
  let moonAmbiguous = null;

  if (n.timeUnknown) {
    solarChart = true;
    houseSystemUsed = 'whole';
    houseNote = '不知道出生時間：行星用當天中午計算，宮位改用太陽盤（太陽星座為第一宮，整宮制），上升與天頂不顯示';
    cusps = wholeSignCusps(byId.sun.lon);
    moonAmbiguous = moonAmbiguity(n);
  } else {
    const mc = mcFromRamc(sd.ramc, sd.eps);
    const asc = ascFromRamc(sd.ramc, sd.eps, n.place.lat);
    angles = {
      asc: { lon: asc, sign: signOf(asc) },
      mc: { lon: mc, sign: signOf(mc) },
      dsc: { lon: norm(asc + 180), sign: signOf(asc + 180) },
      ic: { lon: norm(mc + 180), sign: signOf(mc + 180) },
    };
    if (n.houseSystem === 'whole') cusps = wholeSignCusps(asc);
    else if (n.houseSystem === 'equal') cusps = equalCusps(asc);
    else {
      cusps = placidusCusps(sd.ramc, sd.eps, n.place.lat, asc, mc);
      if (!cusps) {
        cusps = porphyryCusps(asc, mc);
        houseSystemUsed = 'porphyry';
        houseNote = `出生地緯度 ${Math.abs(n.place.lat).toFixed(2)}° 太接近極區，Placidus 宮位制算不出來，已改用 Porphyry 宮位制（天頂到上升、上升到天底各三等分）`;
      }
    }
    // 福點：日間盤 ASC+月−日，夜間盤 ASC+日−月
    const day = norm(byId.sun.lon - asc) >= 180;
    const fl = norm(day ? asc + byId.moon.lon - byId.sun.lon : asc + byId.sun.lon - byId.moon.lon);
    planets.push({ id: 'fortune', name: PLANET_NAMES.fortune, lon: fl, lat: 0, speed: 0, retro: false, sign: signOf(fl), house: null, dignity: null });
  }

  for (const p of planets) p.house = houseOf(p.lon, cusps);
  const planetsById = Object.fromEntries(planets.map((p) => [p.id, p]));

  const houses = [];
  for (let i = 1; i <= 12; i++) {
    const sign = signOf(cusps[i]);
    const ruler = SIGN_RULER[sign.index];
    houses.push({
      index: i, name: houseName(i), theme: HOUSE_THEMES[i].theme, alias: HOUSE_THEMES[i].alias,
      cusp: cusps[i], sign, ruler, rulerHouse: planetsById[ruler].house,
      planets: planets.filter((p) => p.house === i).map((p) => p.id),
    });
  }

  // 相位：10 行星＋北交點＋ASC/MC
  const aspectBodies = MAIN_PLANETS.concat(['northnode']).map((id) => ({ id, lon: planetsById[id].lon, speed: planetsById[id].speed }));
  if (angles) {
    aspectBodies.push({ id: 'asc', lon: angles.asc.lon, speed: 0 });
    aspectBodies.push({ id: 'mc', lon: angles.mc.lon, speed: 0 });
  }
  const aspects = computeAspects(aspectBodies);

  // 元素／模式加權：日月升各 2、其餘 1
  const elements = { fire: 0, earth: 0, air: 0, water: 0 };
  const modes = { cardinal: 0, fixed: 0, mutable: 0 };
  const add = (lon, w) => { elements[elementOf(lon)] += w; modes[modeOf(lon)] += w; };
  for (const id of MAIN_PLANETS) add(planetsById[id].lon, LUMINARIES.has(id) ? 2 : 1);
  if (angles) add(angles.asc.lon, 2);

  return {
    input: {
      name: n.name, date: n.date, time: n.time, timeUnknown: n.timeUnknown,
      place: { ...n.place }, houseSystem: n.houseSystem, dstChoice: n.dstChoice,
    },
    time: {
      utcIso: new Date(utcMs).toISOString(), jd: jdFromUtcMs(utcMs),
      offsetMin: tzr.offsetMin, status: tzr.status, note: tzr.note ?? null,
      ramc: sd.ramc, gast: sd.gast,
    },
    solarChart, moonAmbiguous,
    houseSystemUsed, houseNote,
    obliquity: sd.eps,
    planets,
    angles,
    houses,
    aspects,
    elements, modes,
    big3: { sun: planetsById.sun.sign.name, moon: planetsById.moon.sign.name, asc: angles ? angles.asc.sign.name : null },
  };
}

/* ---------- 給格局規則用的 context ---------- */
function signKey(name) {
  const s = String(name ?? '').trim();
  let idx = SIGN_NAMES.indexOf(s);
  if (idx < 0) idx = SIGN_SHORT.indexOf(s);
  if (idx < 0) idx = SIGN_NAMES.indexOf(s + '座');
  return idx;
}
export function makeContext(chart) {
  const byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
  const ctx = {
    chart,
    planet: (id) => byId[id] ?? null,
    planets: () => chart.planets.filter((p) => MAIN_PLANETS.includes(p.id)),
    inHouse: (n) => chart.planets.filter((p) => p.house === Number(n)).map((p) => p.id),
    inSign: (name) => { const idx = signKey(name); return chart.planets.filter((p) => p.sign.index === idx).map((p) => p.id); },
    aspectsOf: (id) => chart.aspects.filter((a) => a.a === id || a.b === id),
    hasAspect: (a, b, type) => chart.aspects.some((x) => ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && (!type || x.type === type)),
    aspectBetween: (a, b) => chart.aspects.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) ?? null,
    elementCount: () => ({ ...chart.elements }),
    modeCount: () => ({ ...chart.modes }),
    ruler: (n) => chart.houses[Number(n) - 1]?.ruler ?? null,
    rulerHouse: (n) => chart.houses[Number(n) - 1]?.rulerHouse ?? null,
    house: (n) => chart.houses[Number(n) - 1] ?? null,
    isDay: () => (chart.angles ? norm(byId.sun.lon - chart.angles.asc.lon) >= 180 : true),
    hasTime: () => Boolean(chart.angles),
    // 只算十大行星：交點的「逆行」是平均運動方向，不算行星逆行（多逆行格局用）
    retroCount: () => chart.planets.filter((p) => MAIN_PLANETS.includes(p.id) && p.retro).length,
    asc: () => chart.angles?.asc ?? null,
    mc: () => chart.angles?.mc ?? null,
  };
  return ctx;
}
