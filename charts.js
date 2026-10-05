// 星盤網頁版｜圖表（docs/astro-contract.md 第 7 節）
// 全部是純函式、回傳 SVG 字串；不依賴任何外部套件、不發任何連線，在 Node 也能直接測。
// 規格（沿用紫微 web contract）：線 2px 圓角、點直徑 >= 8px 外圈 2px 底色、長條 <= 24px、
//       格線 1px 實線、文字只用字色（不用資料色）、只標重點、不用 id、每張 role=img＋aria-label＋<title>。
// 尺寸：app.js 依容器寬度傳 width／size 進來，字維持原本大小（圖不會被縮小到看不清）。
// 「今天」「年齡」一律由呼叫端傳進來，這裡不用 Date。

// 配色（桃紅西方玄學版）：圖表全部畫在粉白 #fffafc 底上（輪盤在夜空卡裡是一塊粉白圓盤），只需要一套淺色配色。
// 資料色（accent／highlight／TENSION_COLOR／ELEMENT_COLORS）以 dataviz 驗證器驗過（light、surface #fffafc，全部 PASS）；
// 文字只用 ink／ink2／ink3。改這裡要一起改 style.css 的 --data／--gold 與 tests/web-charts.test.mjs 的預期值。
export const COLORS = {
  accent: '#5760c8',     // 靛藍：三分／六分相、一般資料（index.html 文案「藍線」仍成立）
  highlight: '#b08414',  // 金：最高分、現在這段（「金色是…」文案仍成立）
  muted: '#9c8592',      // 基準線、已走過（中性色，不當資料色；粉白底上 3.3:1，已走過色塊看得到）
  grid: '#efdde6',
  ink: '#2b1c26',
  ink2: '#654e5c',
  ink3: '#78606e',
  surface: '#fffafc',    // 粉白紙卡底色（style.css --surface）
};

/** 元素四色：只用在輪盤扇形底色（透明度 0.12），文字不用 */
export const ELEMENT_COLORS = {
  fire: '#cf5a2a',
  earth: '#2f8f6f',
  air: '#2f8ccf',
  water: '#6a4fbf',
};
export const ELEMENT_OPACITY = 0.12;
/** 四分／對分相位線的顏色（胭脂紅） */
export const TENSION_COLOR = '#9a1c3a';

const FONT = 'system-ui, &quot;Microsoft JhengHei&quot;, &quot;PingFang TC&quot;, sans-serif';
const AREA_OPACITY = 0.1;

const SIGN_SHORT = ['牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女', '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚'];
const SIGN_ELEMENT = ['fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water'];
const HOUSE_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
/** 輪盤上的行星縮寫（南交點預設不畫，跟北交點重複） */
export const PLANET_GLYPH = {
  sun: '日', moon: '月', mercury: '水', venus: '金', mars: '火', jupiter: '木', saturn: '土',
  uranus: '天', neptune: '海', pluto: '冥', northnode: '北交', southnode: '南交', fortune: '福',
};
const PLANET_FULL = {
  sun: '太陽', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星',
  uranus: '天王星', neptune: '海王星', pluto: '冥王星', northnode: '北交點', southnode: '南交點', fortune: '福點',
  asc: '上升', mc: '天頂',
};
const ASPECT_NAME = { conjunction: '合相', sextile: '六分相', square: '四分相', trine: '三分相', opposition: '對分相' };
const ELEMENT_LABEL = { fire: '火象', earth: '土象', air: '風象', water: '水象' };
const MODE_LABEL = { cardinal: '本位', fixed: '固定', mutable: '變動' };

// ---------- 小工具 ----------

/** HTML／XML 跳脫（文字與屬性共用） */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 數值：NaN／undefined／字串亂碼 → lo，再夾在 lo～hi */
export function clampScore(v, lo = 0, hi = 100) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// 座標輸出固定一位小數，避免 -0 與浮點雜訊，讓輸出可重現
function f(n) {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

// 分數顯示：整數就整數，否則一位小數
function num(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function norm(deg) { let x = deg % 360; if (x < 0) x += 360; return x === 360 ? 0 : x; }

/** 「第X宮」標準化（避免「第一宮宮」這類雙字尾） */
export function houseName(n) {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1 || k > 12) return '';
  return `第${HOUSE_NUM[k]}宮`;
}

/** 估算文字寬度（px）：中文／全形字 = 1 字寬，英數約 0.6，空白約 0.3 */
export function textWidth(str, fs) {
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c === 32) w += 0.3;
    else if (c < 0x2e80) w += (c >= 0x41 && c <= 0x5a) || ch === 'm' || ch === 'w' ? 0.7 : 0.6;
    else w += 1;
  }
  return w * fs;
}

function truncate(str, fs, maxW) {
  const s = String(str);
  if (textWidth(s, fs) <= maxW) return s;
  let out = '';
  for (const ch of s) {
    if (textWidth(out + ch + '…', fs) > maxW) break;
    out += ch;
  }
  return out + '…';
}

function sizeOr(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// 標準外框：role=img＋aria-label＋<title>；寬高照 viewBox，CSS 讓它隨容器縮放
function svgOpen({ vbX = 0, vbY = 0, w, h, label, title, cls }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="as-chart ${cls}" role="img" aria-label="${esc(label)}"`
    + ` viewBox="${f(vbX)} ${f(vbY)} ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}"`
    + ` style="max-width:100%;height:auto;display:block;margin:0 auto;-webkit-tap-highlight-color:transparent" font-family="${FONT}">`
    + `<title>${esc(title)}</title>`;
}

// 可點的元素：不要手機點擊的藍色反白框與瀏覽器焦點框（焦點時會跳出提示框，看得出在哪）
const TAP = 'cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent';

// 文字外圍一圈底色，壓在格線上仍清楚
const HALO = `paint-order="stroke" stroke="${COLORS.surface}" stroke-width="4" stroke-linejoin="round"`;
const HALO3 = `paint-order="stroke" stroke="${COLORS.surface}" stroke-width="3" stroke-linejoin="round"`;

function dot(x, y, r, color, extra = '') {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}" stroke="${COLORS.surface}" stroke-width="2"${extra}/>`;
}

function emptyChart(w, h, title, cls) {
  return svgOpen({ w, h, label: `${title}：目前沒有資料`, title, cls })
    + `<rect x="0" y="0" width="${f(w)}" height="${f(h)}" fill="${COLORS.surface}"/>`
    + `<text x="${f(w / 2)}" y="${f(h / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="${COLORS.ink3}">目前沒有資料</text></svg>`;
}

// 依角度決定文字對齊：θ 從正上方順時針（弧度）
function labelPlacement(cx, cy, r, theta, fs, text, lineCount = 1, lineH = fs * 1.25) {
  const sx = Math.sin(theta);
  const sy = -Math.cos(theta);
  const x = cx + r * sx;
  const y = cy + r * sy;
  const anchor = Math.abs(sx) < 0.3 ? 'middle' : sx > 0 ? 'start' : 'end';
  const w = textWidth(text, fs);
  const h = lineH * lineCount;
  let top;
  if (sy < -0.3) top = y - h;               // 上方：整塊在點的上面
  else if (sy > 0.3) top = y;               // 下方：整塊在點的下面
  else top = y - h / 2;                     // 左右：垂直置中
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const baseline = top + fs * 0.95;         // 第一行基線
  return { x, y, anchor, baseline, box: { x: left, y: top, w, h } };
}

function unionBox(boxes) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// 左右對稱撐開，讓圖的中心永遠在正中間（不同命盤的圖寬度也比較一致）
function symmetricX(b, cx) {
  const half = Math.max(cx - b.x, b.x + b.w - cx);
  return { x: cx - half, y: b.y, w: half * 2, h: b.h };
}

function overlaps(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

// ---------- 同分規則（圖與 app.js 共用，保證畫面各處說法一致） ----------

/**
 * 分數最高／最低的「全部」位置（同分並列一起算）。全部同分時 flat＝true，max／min 都是空陣列。
 * @param {number[]} values
 * @returns {{ max: number[], min: number[], flat: boolean, hi: number, lo: number }}
 */
export function extremes(values) {
  const v = (Array.isArray(values) ? values : []).map((x) => clampScore(x));
  if (!v.length) return { max: [], min: [], flat: true, hi: 0, lo: 0 };
  const hi = Math.max(...v);
  const lo = Math.min(...v);
  if (hi === lo) return { max: [], min: [], flat: true, hi, lo };
  const max = [];
  const min = [];
  v.forEach((x, i) => { if (x === hi) max.push(i); if (x === lo) min.push(i); });
  return { max, min, flat: false, hi, lo };
}

/**
 * 前 n 名的位置（跟第 n 名同分的也一起算進來）。全部同分回空陣列（沒有誰比較高）。
 * 同分擴張太多（超過 2n 個）時，只留比第 n 名分數高的，避免一整片金色。
 */
export function topWithTies(values, n) {
  const v = (Array.isArray(values) ? values : []).map((x) => clampScore(x));
  const k = Math.max(0, Math.min(v.length, Math.floor(Number(n)) || 0));
  if (!k || !v.length) return [];
  if (Math.max(...v) === Math.min(...v)) return [];
  const order = v.map((_, i) => i).sort((a, b) => v[b] - v[a] || a - b);
  const cut = v[order[k - 1]];
  let set = order.filter((i) => v[i] >= cut);
  if (set.length > k * 2) set = order.filter((i) => v[i] > cut);
  return set;
}

// ---------- 雷達圖（五大面向） ----------

/**
 * 五大面向雷達（星狀圖）
 * @param {{ axes: {key:string,label:string,value:number}[], size?: number, title?: string, highlightKey?: string|string[]|null }} opt
 */
export function radarChart({ axes = [], size = 340, title = '', highlightKey = null } = {}) {
  const S = sizeOr(size, 340, 220, 1200);
  const heading = String(title || '五大面向雷達圖');
  const list = (Array.isArray(axes) ? axes : []).filter(Boolean).map((a, i) => ({
    key: String(a.key ?? a.label ?? i),
    label: String(a.label ?? a.key ?? ''),
    value: clampScore(a.value),
  }));
  if (list.length < 3) return emptyChart(S, Math.round(S * 0.6), heading, 'as-radar');

  const ex = extremes(list.map((a) => a.value));
  let hiIdx = [];
  if (!ex.flat) {
    if (highlightKey == null) hiIdx = ex.max;
    else {
      const keys = new Set((Array.isArray(highlightKey) ? highlightKey : [highlightKey]).map(String));
      hiIdx = list.map((a, i) => (keys.has(a.key) ? i : -1)).filter((i) => i >= 0);
    }
  }
  const hiSet = new Set(hiIdx);
  const hiNames = hiIdx.map((i) => list[i].label).join('、');

  const fs = Math.max(12, Math.round(S / 26));
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - fs * 4.2;
  const n = list.length;
  const ang = (i) => (Math.PI * 2 * i) / n;
  const pt = (i, v) => [cx + R * (v / 100) * Math.sin(ang(i)), cy - R * (v / 100) * Math.cos(ang(i))];

  const parts = [];
  for (const lv of [20, 40, 60, 80, 100]) {
    const ring = list.map((_, i) => pt(i, lv).map(f).join(',')).join(' ');
    parts.push(`<polygon class="as-grid" points="${ring}" fill="none" stroke="${COLORS.grid}" stroke-width="1"/>`);
  }
  list.forEach((_, i) => {
    const [x, y] = pt(i, 100);
    parts.push(`<line class="as-axis" x1="${f(cx)}" y1="${f(cy)}" x2="${f(x)}" y2="${f(y)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
  });
  const base = list.map((_, i) => pt(i, 50).map(f).join(',')).join(' ');
  parts.push(`<polygon class="as-base" points="${base}" fill="none" stroke="${COLORS.muted}" stroke-width="1.5"/>`);

  const poly = list.map((a, i) => pt(i, a.value).map(f).join(',')).join(' ');
  parts.push(`<polygon class="as-area" points="${poly}" fill="${COLORS.accent}" fill-opacity="${AREA_OPACITY}" stroke="${COLORS.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);

  const boxes = [{ x: cx - R - 7, y: cy - R - 7, w: 2 * R + 14, h: 2 * R + 14 }];
  const labels = [];
  const ptsLo = [];
  const ptsHi = [];
  list.forEach((a, i) => {
    const [x, y] = pt(i, a.value);
    const isHi = hiSet.has(i);
    const tip = `${a.label}｜${num(a.value)} 分${isHi ? (hiSet.size > 1 ? '｜並列比較有優勢的方向' : '｜你比較有優勢的方向') : ''}`;
    const text = `${a.label} ${num(a.value)}`;
    const L = labelPlacement(cx, cy, R + fs * 0.7, ang(i), fs, text);
    boxes.push(L.box);
    const weight = isHi ? ' font-weight="700"' : '';
    labels.push(`<text class="as-label${isHi ? ' as-hi' : ''}" x="${f(L.x)}" y="${f(L.baseline)}" text-anchor="${L.anchor}" font-size="${fs}" fill="${COLORS.ink}"${weight}>`
      + `${esc(a.label)} <tspan fill="${isHi ? COLORS.ink : COLORS.ink2}">${esc(num(a.value))}</tspan></text>`);
    (isHi ? ptsHi : ptsLo).push(`<g class="as-pt${isHi ? ' as-hi' : ''}" data-key="${esc(a.key)}" data-tip="${esc(tip)}">`
      + `<circle cx="${f(x)}" cy="${f(y)}" r="22" fill="transparent"/>`
      + dot(x, y, isHi ? 6 : 4.5, isHi ? COLORS.highlight : COLORS.accent)
      + '</g>');
  });
  parts.push(...ptsLo, ...ptsHi, ...labels);

  const all = unionBox(boxes);
  const legY = all.y + all.h + fs * 1.1;
  const legFs = Math.max(11, fs - 2);
  const leg = [];
  const legItems = [['line', COLORS.muted, '基準 50']];
  if (hiSet.size) legItems.push(['dot', COLORS.highlight, hiSet.size > 1 ? `並列較強：${hiNames}` : `較強：${hiNames}`]);
  else if (ex.flat) legItems.push(['text', null, '各面向同分']);
  const itemsW = legItems.map(([kind, , t]) => (kind === 'text' ? 0 : 22) + textWidth(t, legFs));
  const totalW = itemsW.reduce((s, w) => s + w, 0) + 18 * (legItems.length - 1);
  let lx = cx - totalW / 2;
  legItems.forEach(([kind, color, t], k) => {
    if (kind === 'line') leg.push(`<line x1="${f(lx)}" y1="${f(legY - legFs * 0.35)}" x2="${f(lx + 16)}" y2="${f(legY - legFs * 0.35)}" stroke="${color}" stroke-width="1.5"/>`);
    else if (kind === 'dot') leg.push(dot(lx + 8, legY - legFs * 0.35, 5, color));
    leg.push(`<text x="${f(lx + (kind === 'text' ? 0 : 22))}" y="${f(legY)}" font-size="${legFs}" fill="${COLORS.ink2}">${esc(t)}</text>`);
    lx += itemsW[k] + 18;
  });
  boxes.push({ x: cx - totalW / 2, y: legY - legFs, w: totalW, h: legFs * 1.3 });

  const pad = 8;
  const vb = symmetricX(unionBox(boxes), cx);
  const vbX = Math.floor(vb.x - pad);
  const vbY = Math.floor(vb.y - pad);
  const w = Math.ceil(vb.w + pad * 2);
  const h = Math.ceil(vb.h + pad * 2);

  const sorted = list.map((a) => `${a.label} ${num(a.value)} 分`).join('、');
  const tail = hiSet.size ? `；${hiNames}${hiSet.size > 1 ? '並列' : ''}比較有優勢` : (ex.flat ? '；各面向分數相同，沒有特別偏向哪一面' : '');
  const label = `${heading}：${sorted}${tail}。`;
  return svgOpen({ vbX, vbY, w, h, label, title: heading, cls: 'as-radar' })
    + `<rect x="${f(vbX)}" y="${f(vbY)}" width="${f(w)}" height="${f(h)}" fill="${COLORS.surface}"/>`
    + parts.join('') + leg.join('') + '</svg>';
}

// ---------- 十二宮星狀圖 ----------

/**
 * 十二宮星狀圖：12 軸，軸標籤「第X宮」＋小字主題，前 top 名（含同分）金色
 * @param {{ houses: {index:number,name?:string,theme?:string,score:number}[], size?: number, top?: number, title?: string }} opt
 */
export function houseStarChart({ houses = [], size = 360, top = 3, title = '' } = {}) {
  const S = sizeOr(size, 360, 240, 1200);
  const heading = String(title || '十二宮星狀圖');
  const list = (Array.isArray(houses) ? houses : []).filter(Boolean).map((h, i) => {
    const idx = Number.isInteger(Number(h.index)) ? Number(h.index) : i + 1;
    return {
      index: idx,
      name: String(h.name || houseName(idx) || `第 ${idx} 宮`),
      theme: String(h.theme ?? '').trim(),
      score: clampScore(h.score),
    };
  });
  if (list.length < 3) return emptyChart(S, Math.round(S * 0.6), heading, 'as-houses');

  const topN = Math.max(0, Math.min(list.length, Math.floor(Number(top)) || 0));
  const order = list.map((p, i) => i).sort((a, b) => list[b].score - list[a].score || a - b);
  const topIdx = topWithTies(list.map((p) => p.score), topN);
  const topSet = new Set(topIdx);
  const tiedAtCut = topSet.size > topN;
  const rank = new Map(list.map((p, i) => [i, 1 + list.filter((q) => q.score > p.score).length]));
  const sameCount = new Map(list.map((p, i) => [i, list.filter((q) => q.score === p.score).length]));

  const fs = Math.max(12, Math.round(S / 28));
  const subFs = Math.max(10, fs - 2);
  const cx = S / 2;
  const cy = S / 2;
  const n = list.length;
  const ang = (i) => (Math.PI * 2 * i) / n;
  // 主題小字最多 6 個字寬（太長就截斷，完整主題在提示框裡）
  const themeMax = subFs * 6;
  const themeText = list.map((p) => (p.theme ? truncate(p.theme, subFs, themeMax) : ''));
  const lineH = fs * 1.25;
  const subLineH = fs * 1.25;   // 第二行是小字，但行距照大字算，兩行的估算外框才不會互相碰到
  const labelH = (i) => lineH + (themeText[i] ? subLineH : 0);
  // 半徑：讓左右兩側的標籤剛好落在 S 之內（字不縮小），但最少是 S 的 22%
  const sideW = Math.max(...list.map((p, i) => {
    const sx = Math.abs(Math.sin(ang(i)));
    if (sx < 0.3) return 0;
    return Math.max(textWidth(topSet.has(i) ? `${p.name} ${num(p.score)}` : p.name, fs), textWidth(themeText[i], subFs));
  }));
  // 半徑下限：相鄰兩軸（差 360/n 度）的標籤上下要分得開。以 12 軸為例，30° 與 60° 的標籤都在點的上方，
  // 垂直距離 = r×(sin60°−sin30°) 要 >= 標籤高度＋3
  const maxH = Math.max(...list.map((_, i) => labelH(i)));
  const step = (Math.PI * 2) / n;
  const denom = Math.max(0.2, Math.sin(2 * step) - Math.sin(step));
  const rMin = (maxH + 3) / denom - fs * 0.6;
  const R = Math.max(rMin, S * 0.22, Math.min(S / 2 - fs * 3.2, S / 2 - 8 - fs * 0.6 - sideW));
  const pt = (i, v) => [cx + R * (v / 100) * Math.sin(ang(i)), cy - R * (v / 100) * Math.cos(ang(i))];

  const parts = [];
  for (const lv of [25, 50, 75, 100]) {
    const color = lv === 50 ? COLORS.muted : COLORS.grid;
    parts.push(`<circle class="as-grid" cx="${f(cx)}" cy="${f(cy)}" r="${f(R * lv / 100)}" fill="none" stroke="${color}" stroke-width="1"/>`);
  }
  list.forEach((_, i) => {
    const [x, y] = pt(i, 100);
    parts.push(`<line class="as-axis" x1="${f(cx)}" y1="${f(cy)}" x2="${f(x)}" y2="${f(y)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
  });
  const poly = list.map((p, i) => pt(i, p.score).map(f).join(',')).join(' ');
  parts.push(`<polygon class="as-area" points="${poly}" fill="${COLORS.accent}" fill-opacity="${AREA_OPACITY}" stroke="${COLORS.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);

  const boxes = [{ x: cx - R - 7, y: cy - R - 7, w: 2 * R + 14, h: 2 * R + 14 }];
  const groups = [];
  list.forEach((p, i) => {
    const [x, y] = pt(i, p.score);
    const isTop = topSet.has(i);
    const text = isTop ? `${p.name} ${num(p.score)}` : p.name;
    const sub = themeText[i];
    const L = labelPlacement(cx, cy, R + fs * 0.6, ang(i), fs, text, 1, lineH);
    // 兩行時整塊高度重新算（第二行是小字）
    const h = labelH(i);
    const sy = -Math.cos(ang(i));
    let topY;
    if (sy < -0.3) topY = L.y - h;
    else if (sy > 0.3) topY = L.y;
    else topY = L.y - h / 2;
    const w = Math.max(textWidth(text, fs), textWidth(sub, subFs));
    const left = L.anchor === 'start' ? L.x : L.anchor === 'end' ? L.x - w : L.x - w / 2;
    const box = { x: left, y: topY, w, h };
    boxes.push(box);
    const baseline = topY + fs * 0.95;
    const [ex, ey] = pt(i, 100);
    const tip = `${p.name}${p.theme ? `・${p.theme}` : ''}｜${num(p.score)} 分｜${sameCount.get(i) > 1 ? '並列' : ''}第 ${rank.get(i)} 高｜點一下看詳解`;
    const nameSvg = isTop
      ? `<text class="as-label as-hi" x="${f(L.x)}" y="${f(baseline)}" text-anchor="${L.anchor}" font-size="${fs}" font-weight="700" fill="${COLORS.ink}">${esc(p.name)} <tspan>${esc(num(p.score))}</tspan></text>`
      : `<text class="as-label" x="${f(L.x)}" y="${f(baseline)}" text-anchor="${L.anchor}" font-size="${fs}" fill="${COLORS.ink2}">${esc(p.name)}</text>`;
    const subSvg = sub
      ? `<text class="as-sublabel" x="${f(L.x)}" y="${f(baseline + subLineH)}" text-anchor="${L.anchor}" font-size="${subFs}" fill="${COLORS.ink3}">${esc(sub)}</text>`
      : '';
    groups.push(`<g class="as-pt as-house-axis${isTop ? ' as-hi' : ''}" data-house="${p.index}" data-name="${esc(p.name)}" data-tip="${esc(tip)}" tabindex="0" style="${TAP}">`
      + `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(ex)}" y2="${f(ey)}" stroke="transparent" stroke-width="22" stroke-linecap="round"/>`
      + `<rect x="${f(box.x - 4)}" y="${f(box.y - 4)}" width="${f(box.w + 8)}" height="${f(box.h + 8)}" fill="transparent"/>`
      + `<circle cx="${f(x)}" cy="${f(y)}" r="14" fill="transparent"/>`
      + dot(x, y, isTop ? 6 : 4, isTop ? COLORS.highlight : COLORS.accent)
      + nameSvg + subSvg
      + '</g>');
  });
  parts.push(...groups);

  const all = unionBox(boxes);
  const legFs = Math.max(11, fs - 2);
  const legY = all.y + all.h + fs * 1.7;
  const items = [];
  if (topSet.size > 0) items.push(['dot', COLORS.highlight, tiedAtCut ? `前 ${topN} 高（含同分）` : `前 ${topSet.size} 高`]);
  items.push(['dot', COLORS.accent, '其他宮位'], ['ring', COLORS.muted, '50 分']);
  const itemsW = items.map(([, , t]) => 22 + textWidth(t, legFs));
  const totalW = itemsW.reduce((s, w) => s + w, 0) + 18 * (items.length - 1);
  let lx = cx - totalW / 2;
  const leg = [];
  items.forEach(([kind, color, t], k) => {
    const my = legY - legFs * 0.35;
    if (kind === 'ring') leg.push(`<line x1="${f(lx)}" y1="${f(my)}" x2="${f(lx + 16)}" y2="${f(my)}" stroke="${color}" stroke-width="1"/>`);
    else leg.push(dot(lx + 8, my, color === COLORS.highlight ? 5.5 : 4.5, color));
    leg.push(`<text x="${f(lx + 22)}" y="${f(legY)}" font-size="${legFs}" fill="${COLORS.ink2}">${esc(t)}</text>`);
    lx += itemsW[k] + 18;
  });
  boxes.push({ x: cx - totalW / 2, y: legY - legFs, w: totalW, h: legFs * 1.3 });

  const pad = 8;
  const vb = symmetricX(unionBox(boxes), cx);
  const vbX = Math.floor(vb.x - pad);
  const vbY = Math.floor(vb.y - pad);
  const w = Math.ceil(vb.w + pad * 2);
  const h = Math.ceil(vb.h + pad * 2);

  const topText = order.filter((i) => topSet.has(i)).map((i) => `${list[i].name}${list[i].theme ? `（${list[i].theme}）` : ''} ${num(list[i].score)} 分`).join('、');
  const allSame = list.every((p) => p.score === list[0].score);
  let label;
  if (topSet.size > 0) label = `${heading}：共 ${n} 宮，分數前 ${topN} 高${tiedAtCut ? '（含同分並列）' : ''}是${topText}。`;
  else if (topN > 0 && allSame) label = `${heading}：共 ${n} 宮，每一宮都是 ${num(list[0].score)} 分。`;
  else label = `${heading}：共 ${n} 宮。`;
  return svgOpen({ vbX, vbY, w, h, label, title: heading, cls: 'as-houses' })
    + `<rect x="${f(vbX)}" y="${f(vbY)}" width="${f(w)}" height="${f(h)}" fill="${COLORS.surface}"/>`
    + parts.join('') + leg.join('') + '</svg>';
}

// ---------- 本命星盤輪盤 ----------

/** 扇形路徑（角度用「顯示角」：0＝左邊 9 點鐘、逆時針增加，黃道逆時針） */
function polar(cx, cy, r, disp) {
  const a = (180 + disp) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}
function sectorPath(cx, cy, r0, r1, d0, d1) {
  const [ax, ay] = polar(cx, cy, r1, d0);
  const [bx, by] = polar(cx, cy, r1, d1);
  const [cx1, cy1] = polar(cx, cy, r0, d1);
  const [dx, dy] = polar(cx, cy, r0, d0);
  const big = norm(d1 - d0) > 180 ? 1 : 0;
  // 逆時針（螢幕上）走：sweep-flag 0
  return `M${f(ax)},${f(ay)}A${f(r1)},${f(r1)} 0 ${big} 0 ${f(bx)},${f(by)}L${f(cx1)},${f(cy1)}A${f(r0)},${f(r0)} 0 ${big} 1 ${f(dx)},${f(dy)}Z`;
}
function arcPath(cx, cy, r, d0, d1) {
  const [ax, ay] = polar(cx, cy, r, d0);
  const [bx, by] = polar(cx, cy, r, d1);
  const big = norm(d1 - d0) > 180 ? 1 : 0;
  return `M${f(ax)},${f(ay)}A${f(r)},${f(r)} 0 ${big} 0 ${f(bx)},${f(by)}`;
}
function lineAt(cx, cy, r0, r1, disp, color, width, cls = '') {
  const [x1, y1] = polar(cx, cy, r0, disp);
  const [x2, y2] = polar(cx, cy, r1, disp);
  return `<line${cls ? ` class="${cls}"` : ''} x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${width}"/>`;
}
const DMS_RE = /^\d{1,2}°\d{2}′$/;
function dmsOf(lon) {
  const inSign = norm(lon) % 30;
  let m = Math.round(inSign * 60);
  if (m >= 1800) m = 1799;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}°${String(m % 60).padStart(2, '0')}′`;
}
function signNameOf(lon) { return `${SIGN_SHORT[Math.floor(norm(lon) / 30) % 12]}座`; }

/**
 * 本命星盤輪盤（規格書 7：黃道 12 座環＋宮位線＋行星位置＋相位線；ASC 在左、黃道逆時針）
 * @param {object} chart lib/astro.mjs 的 buildChart 輸出（planets/houses/angles/aspects/solarChart）
 * @param {{ size?: number, title?: string, showSouthNode?: boolean, aspects?: boolean }} opts
 */
export function wheelChart(chart, { size = 640, title = '', showSouthNode = false, aspects: drawAspects = true } = {}) {
  const S = sizeOr(size, 640, 280, 720);
  const heading = String(title || '本命星盤');
  const cls = 'as-wheel';
  const planetsIn = Array.isArray(chart?.planets) ? chart.planets.filter((p) => p && Number.isFinite(Number(p.lon))) : [];
  if (!planetsIn.length) return emptyChart(S, S, heading, cls);
  const housesIn = Array.isArray(chart?.houses) && chart.houses.length === 12 && chart.houses.every((h) => h && Number.isFinite(Number(h.cusp))) ? chart.houses : null;
  const angles = chart?.angles && Number.isFinite(Number(chart.angles.asc?.lon)) && Number.isFinite(Number(chart.angles.mc?.lon)) ? chart.angles : null;
  const solar = Boolean(chart?.solarChart) || !angles;
  const ascLon = angles ? norm(angles.asc.lon) : housesIn ? norm(housesIn[0].cusp) : 0;
  const mcLon = angles ? norm(angles.mc.lon) : housesIn ? norm(housesIn[9].cusp) : null;
  const disp = (lon) => norm(norm(lon) - ascLon);   // 顯示角：ASC = 0（左邊），逆時針增加

  const cx = S / 2;
  const cy = S / 2;
  // 字級：容器寬 375 的手機也要 >= 10px（app.js 傳容器寬進來時 viewBox = 容器寬，字不會縮）
  const fsSign = Math.max(11, Math.min(15, Math.round(S * 0.032)));
  const fsHouse = Math.max(10, Math.min(13, Math.round(S * 0.028)));
  const fsGlyph = Math.max(13, Math.min(18, Math.round(S * 0.038)));
  const fsSmall = Math.max(10, Math.min(12, Math.round(S * 0.026)));
  const margin = fsSmall * 2.4;                        // 外圈留白：放「上升」「天頂」
  const rOuter = S / 2 - margin;
  const rSign = rOuter - fsSign * 2.3;                 // 星座環內緣
  const rHouse = housesIn ? rSign - fsHouse * 1.9 : rSign;   // 宮位環內緣
  // 行星縮寫先整理出來（要知道最寬的字，才能決定行星環要留多寬）
  const list = planetsIn
    .filter((p) => PLANET_GLYPH[p.id] && (showSouthNode || p.id !== 'southnode'))
    .map((p) => {
      const glyph = PLANET_GLYPH[p.id];
      const retro = Boolean(p.retro);
      const w = textWidth(glyph + (retro ? '逆' : ''), fsGlyph);
      return { id: p.id, name: p.name || PLANET_FULL[p.id] || p.id, lon: norm(p.lon), retro, glyph, w, h: fsGlyph * 1.25, house: p.house, sign: p.sign, true: disp(p.lon), d: disp(p.lon) };
    })
    .sort((a, b) => a.true - b.true);
  const maxHalf = Math.max(fsGlyph * 0.8, ...list.map((p) => Math.hypot(p.w, p.h) / 2));
  const rPlanet = rHouse - maxHalf - 3;                // 行星縮寫（最寬的字斜放也不會碰到宮位環）
  const rAspect = rPlanet - maxHalf - 3;               // 相位圈

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${f(S)}" height="${f(S)}" fill="${COLORS.surface}"/>`);

  // 1. 星座環：12 扇形（元素底色）＋星座名＋刻度
  for (let i = 0; i < 12; i++) {
    const d0 = disp(i * 30);
    const d1 = disp(i * 30 + 30);
    const el = SIGN_ELEMENT[i];
    parts.push(`<path class="as-sign" data-sign="${i}" d="${sectorPath(cx, cy, rSign, rOuter, d0, d1)}" fill="${ELEMENT_COLORS[el]}" fill-opacity="${ELEMENT_OPACITY}" stroke="${COLORS.surface}" stroke-width="1"/>`);
  }
  for (let i = 0; i < 12; i++) {
    const [tx, ty] = polar(cx, cy, (rSign + rOuter) / 2, disp(i * 30 + 15));
    parts.push(`<text class="as-sign-name" x="${f(tx)}" y="${f(ty)}" text-anchor="middle" dominant-baseline="central" font-size="${fsSign}" fill="${COLORS.ink}">${SIGN_SHORT[i]}</text>`);
  }
  // 刻度：每 5° 短、每 10° 長（畫在星座環內緣往外）
  const ticks = [];
  for (let d = 0; d < 360; d += 5) {
    const len = d % 30 === 0 ? 0 : d % 10 === 0 ? 5 : 3;
    if (len) ticks.push(lineAt(cx, cy, rSign, rSign + len, disp(d), COLORS.ink3, 1, 'as-tick'));
  }
  parts.push(...ticks);
  parts.push(`<circle class="as-ring" cx="${f(cx)}" cy="${f(cy)}" r="${f(rOuter)}" fill="none" stroke="${COLORS.grid}" stroke-width="1"/>`);
  parts.push(`<circle class="as-ring" cx="${f(cx)}" cy="${f(cy)}" r="${f(rSign)}" fill="none" stroke="${COLORS.ink3}" stroke-width="1"/>`);

  // 2. 宮位環：宮頭線、宮號、可點扇形（提示框）
  const houseTips = [];
  if (housesIn) {
    parts.push(`<circle class="as-ring" cx="${f(cx)}" cy="${f(cy)}" r="${f(rHouse)}" fill="none" stroke="${COLORS.grid}" stroke-width="1"/>`);
    for (let i = 0; i < 12; i++) {
      const h = housesIn[i];
      const c0 = norm(h.cusp);
      const c1 = norm(housesIn[(i + 1) % 12].cusp);
      const span = norm(c1 - c0) || 30;
      const mid = disp(c0 + span / 2);
      const angular = [1, 4, 7, 10].includes(i + 1);
      const name = String(h.name || houseName(i + 1));
      const theme = String(h.theme ?? '');
      const alias = String(h.alias ?? '');
      const tip = `${name}${theme ? `・${theme}` : ''}${alias ? `（${alias}）` : ''}｜宮頭 ${h.sign?.name || signNameOf(c0)} ${h.sign?.dms && DMS_RE.test(h.sign.dms) ? h.sign.dms : dmsOf(c0)}`
        + (Array.isArray(h.planets) && h.planets.length ? `｜${h.planets.map((id) => PLANET_FULL[id] || id).join('、')}` : '｜空宮');
      const [nx, ny] = polar(cx, cy, (rSign + rHouse) / 2, mid);
      houseTips.push(`<g class="as-house" data-house="${i + 1}" data-tip="${esc(tip)}" style="${TAP}">`
        + `<path d="${sectorPath(cx, cy, rHouse, rSign, disp(c0), disp(c1))}" fill="transparent"/>`
        + `<text class="as-house-num" x="${f(nx)}" y="${f(ny)}" text-anchor="middle" dominant-baseline="central" font-size="${fsHouse}" fill="${angular ? COLORS.ink : COLORS.ink2}"${angular ? ' font-weight="700"' : ''}>${i + 1}</text>`
        + '</g>');
    }
    // 宮頭線：角宮（1/4/7/10）粗、其餘細；畫到相位圈為止
    for (let i = 0; i < 12; i++) {
      const angular = [1, 4, 7, 10].includes(i + 1);
      parts.push(lineAt(cx, cy, rAspect, rSign, disp(housesIn[i].cusp), angular ? COLORS.ink2 : COLORS.grid, angular ? 2 : 1, angular ? 'as-cusp as-cusp-angular' : 'as-cusp'));
    }
  }
  // 整宮制：上升／天頂不等於宮頭，另外畫四軸線（上升—下降、天頂—天底）
  if (angles && !solar) {
    const diffAsc = housesIn ? Math.abs(((norm(housesIn[0].cusp) - ascLon + 540) % 360) - 180) : 180;
    const diffMc = housesIn ? Math.abs(((norm(housesIn[9].cusp) - mcLon + 540) % 360) - 180) : 180;
    if (diffAsc > 0.05) {
      parts.push(lineAt(cx, cy, rAspect, rSign, 0, COLORS.ink2, 2, 'as-angle-line as-angle-asc'));
      parts.push(lineAt(cx, cy, rAspect, rSign, 180, COLORS.ink2, 2, 'as-angle-line as-angle-dsc'));
    }
    if (diffMc > 0.05) {
      parts.push(lineAt(cx, cy, rAspect, rSign, disp(mcLon), COLORS.ink2, 2, 'as-angle-line as-angle-mc'));
      parts.push(lineAt(cx, cy, rAspect, rSign, disp(mcLon + 180), COLORS.ink2, 2, 'as-angle-line as-angle-ic'));
    }
  }
  parts.push(`<circle class="as-ring as-aspect-ring" cx="${f(cx)}" cy="${f(cy)}" r="${f(rAspect)}" fill="none" stroke="${COLORS.grid}" stroke-width="1"/>`);

  // 3. 上升／天頂標籤（外圈留白處）；太陽盤改標「太陽盤」
  if (!solar && angles) {
    const [ax, ay] = polar(cx, cy, rOuter + 3, 0);
    parts.push(`<text class="as-axis-label" x="${f(ax)}" y="${f(ay)}" text-anchor="end" dominant-baseline="central" font-size="${fsSmall}" font-weight="700" fill="${COLORS.ink2}">上升</text>`);
    const md = disp(mcLon);
    const [mx, my] = polar(cx, cy, rOuter + 3, md);
    const msx = Math.cos((180 + md) * Math.PI / 180);
    const anchor = Math.abs(msx) < 0.35 ? 'middle' : msx > 0 ? 'start' : 'end';
    const msy = -Math.sin((180 + md) * Math.PI / 180);
    const base = msy < -0.35 ? 'auto' : msy > 0.35 ? 'hanging' : 'central';
    parts.push(`<text class="as-axis-label" x="${f(mx)}" y="${f(my)}" text-anchor="${anchor}" dominant-baseline="${base}" font-size="${fsSmall}" font-weight="700" fill="${COLORS.ink2}">天頂</text>`);
  } else {
    parts.push(`<text class="as-solar-label" x="4" y="${f(fsSmall + 2)}" font-size="${fsSmall}" font-weight="700" fill="${COLORS.ink2}">太陽盤</text>`);
    parts.push(`<text class="as-solar-note" x="4" y="${f(fsSmall * 2.4 + 2)}" font-size="${fsSmall}" fill="${COLORS.ink3}">沒有出生時間，太陽星座當第一宮</text>`);
  }

  // 4. 行星：真實位置刻度＋縮寫（重疊時沿圓周錯開，並拉引線指回真實位置）
  const n = list.length;
  // 兩個字框（水平擺放）沿圓周要隔多遠才不會碰到：看它們連線方向跟螢幕軸的夾角，
  // 水平方向差 >= 寬度和／2 或 垂直方向差 >= 高度和／2 就分得開；再換算成圓心角（最少 6°）
  const sepOf = (a, b, midDisp) => {
    const ang = (180 + midDisp) * Math.PI / 180;
    const tx = Math.abs(Math.sin(ang));   // 切線方向在螢幕 x 軸的分量
    const ty = Math.abs(Math.cos(ang));
    const wx = (a.w + b.w) / 2 + 4;
    const hy = (a.h + b.h) / 2 + 4;
    const chord = Math.min(tx > 1e-6 ? wx / tx : Infinity, ty > 1e-6 ? hy / ty : Infinity);
    const deg = 2 * Math.asin(Math.min(1, chord / (2 * rPlanet))) * 180 / Math.PI;
    return Math.max(6, deg);
  };
  if (n > 1) {
    // 環狀鬆弛：相鄰兩顆太近就各退一半，重複到沒有人太近（總需求 < 360°，一定收斂）
    for (let iter = 0; iter < 200; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        const a = list[i];
        const b = list[(i + 1) % n];
        const gap = i === n - 1 ? norm(b.d - a.d + 360) : b.d - a.d;
        const g = i === n - 1 ? (gap === 0 ? 360 : gap) : gap;
        const need = sepOf(a, b, a.d + g / 2);
        if (g < need - 1e-6) {
          const push = (need - g) / 2;
          a.d -= push;
          b.d += push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // 整體再轉回來：讓平均位移為 0（不要整圈往一邊漂）
    const shift = list.reduce((s, p) => s + (p.d - p.true), 0) / n;
    for (const p of list) p.d -= shift;
  }
  const glyphs = [];
  const leaders = [];
  for (const p of list) {
    const dd = norm(p.d);
    const [gx, gy] = polar(cx, cy, rPlanet, dd);
    const [tx0, ty0] = polar(cx, cy, rHouse - 1, p.true);
    const [tx1, ty1] = polar(cx, cy, rHouse - 6, p.true);
    // 真實位置的小刻度（永遠畫）
    leaders.push(`<line class="as-planet-tick" x1="${f(tx0)}" y1="${f(ty0)}" x2="${f(tx1)}" y2="${f(ty1)}" stroke="${COLORS.ink2}" stroke-width="1.5"/>`);
    const moved = Math.abs(((dd - p.true + 540) % 360) - 180) > 0.75;
    if (moved) {
      // 引線：從真實刻度拉到縮寫外側
      const [ex, ey] = polar(cx, cy, rPlanet + fsGlyph * 0.72, dd);
      leaders.push(`<line class="as-leader" x1="${f(tx1)}" y1="${f(ty1)}" x2="${f(ex)}" y2="${f(ey)}" stroke="${COLORS.ink3}" stroke-width="1"/>`);
    }
    const signName = p.sign?.name || signNameOf(p.lon);
    const dms = p.sign?.dms && DMS_RE.test(p.sign.dms) ? p.sign.dms : dmsOf(p.lon);
    const tip = `${p.name} ${signName} ${dms}${p.house ? ` ${houseName(p.house)}` : ''}${p.retro ? ' 逆行' : ''}`;
    glyphs.push(`<g class="as-planet${p.retro ? ' as-retro' : ''}" data-planet="${esc(p.id)}" data-tip="${esc(tip)}" tabindex="0" style="${TAP}">`
      + `<circle cx="${f(gx)}" cy="${f(gy)}" r="${f(Math.max(14, p.w / 2 + 4))}" fill="transparent"/>`
      + `<text class="as-planet-glyph" x="${f(gx)}" y="${f(gy)}" text-anchor="middle" dominant-baseline="central" font-size="${fsGlyph}" font-weight="700" fill="${COLORS.ink}" ${HALO3}>${esc(p.glyph)}`
      + (p.retro ? `<tspan class="as-retro-mark" font-size="${fsSmall}" font-weight="400" fill="${COLORS.ink2}">逆</tspan>` : '')
      + '</text></g>');
  }

  // 5. 相位線（內圈）：三分／六分主色、四分／對分紅、合相畫小弧；線寬依緊密度 1～2px
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const aspectSvg = [];
  let aspectCount = 0;
  if (drawAspects && Array.isArray(chart?.aspects)) {
    for (const a of chart.aspects) {
      if (!a || !byId[a.a] || !byId[a.b]) continue;   // 只畫行星對行星（上升／天頂的相位不畫線）
      const type = String(a.type);
      if (!ASPECT_NAME[type]) continue;
      const orb = Number(a.orb);
      const maxOrb = Number(a.maxOrb) > 0 ? Number(a.maxOrb) : 7;
      const tight = Number.isFinite(orb) ? Math.max(0, Math.min(1, 1 - orb / maxOrb)) : 0.5;
      const width = Math.round((1 + tight) * 10) / 10;
      const opacity = Math.round((0.45 + 0.5 * tight) * 100) / 100;
      const tip = `${byId[a.a].name} ${ASPECT_NAME[type]} ${byId[a.b].name}｜容許 ${Number.isFinite(orb) ? orb.toFixed(1) : '?'}°${a.applying ? '｜入相' : ''}`;
      aspectCount++;
      if (type === 'conjunction') {
        const d0 = byId[a.a].true;
        const d1 = byId[a.b].true;
        // 短的那一邊
        const fwd = norm(d1 - d0);
        const [s, e] = fwd <= 180 ? [d0, d1] : [d1, d0];
        const spanDeg = Math.max(2, norm(e - s));
        aspectSvg.push(`<g class="as-aspect as-aspect-conjunction" data-aspect="${esc(`${a.a}-${a.b}`)}" data-tip="${esc(tip)}">`
          + `<path d="${arcPath(cx, cy, rAspect - 4, s - 1, s + spanDeg + 1)}" fill="none" stroke="transparent" stroke-width="10"/>`
          + `<path d="${arcPath(cx, cy, rAspect - 4, s - 1, s + spanDeg + 1)}" fill="none" stroke="${COLORS.highlight}" stroke-width="${f(width + 1)}" stroke-linecap="round"/>`
          + '</g>');
      } else {
        const color = type === 'square' || type === 'opposition' ? TENSION_COLOR : COLORS.accent;
        const [x1, y1] = polar(cx, cy, rAspect, byId[a.a].true);
        const [x2, y2] = polar(cx, cy, rAspect, byId[a.b].true);
        aspectSvg.push(`<g class="as-aspect as-aspect-${type}" data-aspect="${esc(`${a.a}-${a.b}`)}" data-tip="${esc(tip)}">`
          + `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="transparent" stroke-width="8"/>`
          + `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${f(width)}" stroke-opacity="${opacity}" stroke-linecap="round"/>`
          + '</g>');
      }
    }
  }

  parts.push(...aspectSvg, ...houseTips, ...leaders, ...glyphs);

  // aria
  const planetText = list.map((p) => `${p.name} ${p.sign?.name || signNameOf(p.lon)}${p.house ? houseName(p.house) : ''}${p.retro ? '逆行' : ''}`).join('、');
  const axisText = !solar && angles ? `上升 ${angles.asc.sign?.name || signNameOf(angles.asc.lon)}、天頂 ${angles.mc.sign?.name || signNameOf(angles.mc.lon)}；` : '太陽盤（沒有出生時間，太陽星座當第一宮）；';
  const label = `${heading}：${axisText}${planetText}；相位 ${aspectCount} 條。`;
  return svgOpen({ w: S, h: S, label, title: heading, cls }) + parts.join('') + '</svg>';
}

// ---------- 人生週期時間軸 ----------

function ageText(c) { return c.ageTo > c.ageFrom ? `${c.ageFrom}～${c.ageTo} 歲` : `${c.ageFrom} 歲`; }
const STATUS_WORD = { past: '已走過', now: '現在', future: '之後' };

/**
 * 人生週期時間軸：橫軸 0～90 歲，每個週期一個色塊（now 金、past 灰、future 主色），
 * 「你現在 N 歲」金色直線；標籤放在色塊旁邊，同一列放不下就換下一列（寬 <520 改兩行標籤）。
 * @param {{ cycles: {id?:string,name:string,planet?:string,ageFrom:number,ageTo:number,status?:string,text?:string}[], currentAge?: number|null, width?: number, title?: string }} opt
 */
export function cycleTimeline({ cycles = [], currentAge = null, width = 680, title = '' } = {}) {
  const W = sizeOr(width, 680, 300, 2000);
  const heading = String(title || '人生週期時間軸');
  const hasNow = currentAge !== null && currentAge !== undefined && currentAge !== '' && Number.isFinite(Number(currentAge));
  const now = hasNow ? Math.round(clampScore(currentAge, 0, 150)) : null;
  const list = (Array.isArray(cycles) ? cycles : []).filter(Boolean).map((c, i) => {
    const from = Math.round(clampScore(c.ageFrom, 0, 150));
    const to = Math.max(from, Math.round(clampScore(c.ageTo, 0, 150)));
    let status = String(c.status || '');
    if (!['past', 'now', 'future'].includes(status)) {
      status = !hasNow ? 'future' : now < from ? 'future' : now > to ? 'past' : 'now';
    }
    return { i, id: String(c.id ?? i), name: String(c.name ?? '').trim() || `週期 ${i + 1}`, planet: String(c.planet ?? ''), ageFrom: from, ageTo: to, status, text: String(c.text ?? '').trim() };
  }).sort((a, b) => a.ageFrom - b.ageFrom || a.ageTo - b.ageTo || a.i - b.i);
  if (!list.length) return emptyChart(W, 160, heading, 'as-cycles');

  const compact = W < 520;
  const fs = 12;
  const tickFs = 12;
  const padL = 10;
  const padR = 10;
  const top = 8;
  const axisH = 22;
  const nowRowH = hasNow ? 20 : 0;
  const blockH = 14;
  const lineH = fs * 1.25;
  const laneH = compact ? blockH + lineH * 2 + 6 : blockH + 8;   // 兩行標籤時，標籤在色塊下面
  const maxAge = Math.max(90, ...list.map((c) => c.ageTo + 1), hasNow ? now : 0);
  const ageMax = Math.ceil(maxAge / 10) * 10;
  const plotL = padL;
  const plotR = W - padR;
  const xs = (age) => plotL + (age / ageMax) * (plotR - plotL);
  const nowX = hasNow ? xs(now) : null;

  // 標籤文字：寬螢幕一行「名稱 28～30 歲」，窄螢幕兩行（名稱／年齡）
  const items = list.map((c) => {
    const lines = compact ? [c.name, ageText(c)] : [`${c.name} ${ageText(c)}`];
    const lw = Math.max(...lines.map((t) => textWidth(t, fs)));
    return { c, lines, lw, x0: xs(c.ageFrom), x1: xs(c.ageTo + 1) };
  });

  // 排列：每個色塊找第一條放得下的列（色塊＋標籤占的橫向範圍不跟同列的重疊）
  const lanes = [];   // 每列：[{x0,x1}] 已占用的範圍
  const gap = 10;
  for (const it of items) {
    // 標籤位置候選：寬螢幕放色塊右邊（放不下就左邊）；窄螢幕放色塊下方（置中，貼邊時靠內）
    const cands = [];
    if (compact) {
      let lx = (it.x0 + it.x1) / 2 - it.lw / 2;
      lx = Math.min(plotR - it.lw, Math.max(plotL, lx));
      cands.push({ lx, side: 'below' });
    } else {
      if (it.x1 + 6 + it.lw <= plotR) cands.push({ lx: it.x1 + 6, side: 'right' });
      if (it.x0 - 6 - it.lw >= plotL) cands.push({ lx: it.x0 - 6 - it.lw, side: 'left' });
      if (!cands.length) cands.push({ lx: Math.min(plotR - it.lw, Math.max(plotL, it.x1 + 6)), side: 'right' });
    }
    let best = null;
    for (let lane = 0; lane < 40 && !best; lane++) {
      const used = lanes[lane] || [];
      for (const cd of cands) {
        const span = { x0: Math.min(it.x0, cd.lx) - gap / 2, x1: Math.max(it.x1, cd.lx + it.lw) + gap / 2 };
        // 「你現在」直線穿過標籤 → 換另一個候選（都會穿過就接受，標籤有底色描邊）
        const crossNow = nowX != null && nowX > cd.lx - 3 && nowX < cd.lx + it.lw + 3;
        const clash = used.some((u) => span.x0 < u.x1 && u.x0 < span.x1);
        if (!clash && !crossNow) { best = { lane, ...cd, span }; break; }
      }
      if (!best) {
        // 這一列放不下沒交叉的：再試「允許被直線穿過」的候選
        for (const cd of cands) {
          const span = { x0: Math.min(it.x0, cd.lx) - gap / 2, x1: Math.max(it.x1, cd.lx + it.lw) + gap / 2 };
          const clash = used.some((u) => span.x0 < u.x1 && u.x0 < span.x1);
          if (!clash) { best = { lane, ...cd, span }; break; }
        }
      }
    }
    if (!best) best = { lane: lanes.length, ...cands[0], span: { x0: it.x0, x1: it.x1 } };
    if (!lanes[best.lane]) lanes[best.lane] = [];
    lanes[best.lane].push(best.span);
    it.lane = best.lane;
    it.lx = best.lx;
    it.side = best.side;
  }
  const laneCount = lanes.length;
  const plotTop = top;
  const plotBottom = plotTop + laneCount * laneH + 4;
  const H = plotBottom + axisH + nowRowH + 4;

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" fill="${COLORS.surface}"/>`);
  // 直向格線：每 10 歲
  for (let age = 0; age <= ageMax; age += 10) {
    const x = xs(age);
    parts.push(`<line class="as-grid" x1="${f(x)}" y1="${f(plotTop)}" x2="${f(x)}" y2="${f(plotBottom)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
  }
  // 基線
  parts.push(`<line class="as-axis" x1="${f(plotL)}" y1="${f(plotBottom)}" x2="${f(plotR)}" y2="${f(plotBottom)}" stroke="${COLORS.muted}" stroke-width="1"/>`);
  // 刻度：0、10、…；「歲」標在第一個畫出來的刻度；被「你現在」直線壓到的不標
  let unitShown = false;
  for (let age = 0; age <= ageMax; age += 10) {
    const x = xs(age);
    const t = unitShown ? String(age) : `${age} 歲`;
    const tw = textWidth(t, tickFs);
    const anchor = age === 0 ? 'start' : age === ageMax ? 'end' : 'middle';
    const tl = anchor === 'start' ? x : anchor === 'end' ? x - tw : x - tw / 2;
    if (nowX != null && nowX > tl - 4 && nowX < tl + tw + 4) continue;
    unitShown = true;
    parts.push(`<text class="as-tick" x="${f(x)}" y="${f(plotBottom + 16)}" text-anchor="${anchor}" font-size="${tickFs}" fill="${COLORS.ink3}">${esc(t)}</text>`);
  }

  // 色塊＋標籤
  const blocks = [];
  for (const it of items) {
    const c = it.c;
    const y = plotTop + it.lane * laneH + (compact ? 2 : 4);
    const color = c.status === 'now' ? COLORS.highlight : c.status === 'past' ? COLORS.muted : COLORS.accent;
    const bw = Math.max(3, it.x1 - it.x0);
    const tip = `${c.name}｜${ageText(c)}｜${STATUS_WORD[c.status]}${c.text ? `｜${c.text}` : ''}`;
    const isNow = c.status === 'now';
    const ty = compact ? y + blockH + fs * 1.05 : y + blockH / 2 + fs * 0.35;
    const labelSvg = `<text class="as-cycle-label${isNow ? ' as-hi' : ''}" x="${f(it.lx)}" y="${f(ty)}" font-size="${fs}" fill="${isNow ? COLORS.ink : COLORS.ink2}"${isNow ? ' font-weight="700"' : ''} ${HALO}>`
      + it.lines.map((t, k) => (k === 0 ? esc(t) : `<tspan x="${f(it.lx)}" dy="${f(lineH)}" fill="${COLORS.ink3}">${esc(t)}</tspan>`)).join('')
      + '</text>';
    blocks.push(`<g class="as-cycle as-${c.status}" data-cycle="${esc(c.id)}" data-age="${c.ageFrom}" data-tip="${esc(tip)}" tabindex="0" style="${TAP}">`
      + `<rect class="as-hit" x="${f(Math.min(it.x0, it.lx) - 3)}" y="${f(plotTop + it.lane * laneH)}" width="${f(Math.max(it.x1, it.lx + it.lw) - Math.min(it.x0, it.lx) + 6)}" height="${f(laneH)}" fill="transparent"/>`
      + `<rect class="as-block" x="${f(it.x0)}" y="${f(y)}" width="${f(bw)}" height="${f(blockH)}" rx="3" fill="${color}"/>`
      + labelSvg
      + '</g>');
  }

  // 「你現在 N 歲」：金色直線＋底部標籤
  const nowSvg = [];
  if (hasNow) {
    nowSvg.push(`<line class="as-now" x1="${f(nowX)}" y1="${f(plotTop - 2)}" x2="${f(nowX)}" y2="${f(plotBottom + 20)}" stroke="${COLORS.highlight}" stroke-width="2" stroke-linecap="round"/>`);
    const t = `你現在 ${now} 歲`;
    const tw = textWidth(t, fs) + 2;
    let tx = nowX - tw / 2;
    tx = Math.min(W - 4 - tw, Math.max(4, tx));
    nowSvg.push(`<text class="as-now-label" x="${f(tx)}" y="${f(H - 7)}" font-size="${fs}" font-weight="700" fill="${COLORS.ink}">${esc(t)}</text>`);
  }
  parts.push(...nowSvg, ...blocks);

  const nowList = list.filter((c) => c.status === 'now');
  const nextC = list.find((c) => c.status === 'future');
  let label = `${heading}：共 ${list.length} 個週期，橫軸 0 到 ${ageMax} 歲。`;
  if (hasNow) {
    label += `你現在 ${now} 歲`;
    label += nowList.length ? `，正在${nowList.map((c) => `${c.name}（${ageText(c)}）`).join('、')}` : '，目前不在任何週期裡';
    label += nextC ? `；接下來是${nextC.name}（${ageText(nextC)}）。` : '。';
  }
  return svgOpen({ w: W, h: H, label, title: heading, cls: 'as-cycles' }) + parts.join('') + '</svg>';
}

// ---------- 水平長條 ----------

function barPath(x, y, w, h) {
  if (w <= 0) return '';
  const r = Math.min(4, w, h / 2);
  return `M${f(x)},${f(y)}H${f(x + w - r)}A${f(r)},${f(r)} 0 0 1 ${f(x + w)},${f(y + r)}`
    + `V${f(y + h - r)}A${f(r)},${f(r)} 0 0 1 ${f(x + w - r)},${f(y + h)}H${f(x)}Z`;
}

/**
 * 水平長條圖：label 在左、值在長條末端；最大值那條（同分都算）用重點色
 * @param {{ items: {label:string,value:number,sub?:string}[], width?: number, max?: number, highlightMax?: boolean, title?: string }} opt
 */
export function barChart({ items = [], width = 520, max = 100, highlightMax = true, title = '' } = {}) {
  const W = sizeOr(width, 520, 240, 2000);
  const heading = String(title || '分數長條圖');
  const list = (Array.isArray(items) ? items : []).filter(Boolean).map((it) => ({
    label: String(it.label ?? ''),
    value: clampScore(it.value),
    sub: it.sub == null ? '' : String(it.sub).trim(),
  }));
  if (!list.length) return emptyChart(W, 120, heading, 'as-bar');

  let M = Number(max);
  if (!Number.isFinite(M) || M <= 0) M = 100;
  M = Math.min(100, M);
  const top = Math.max(...list.map((it) => it.value));

  const fs = 14;
  const subFs = 12;
  const barH = 20;
  const valW = textWidth('100', 13) + 10;
  const labelW = Math.min(W * 0.4, Math.max(...list.map((it) => textWidth(it.label, fs))) + 14);
  const x0 = labelW;
  const barMax = W - x0 - valW - 4;
  const anySub = list.some((it) => it.sub);
  const rowH = anySub ? 50 : 34;

  const parts = [];
  let y = 6;
  const H = 6 + rowH * list.length + 4;
  parts.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" fill="${COLORS.surface}"/>`);
  parts.push(`<line class="as-grid" x1="${f(x0)}" y1="2" x2="${f(x0)}" y2="${f(H - 2)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
  list.forEach((it) => {
    const isHi = highlightMax && it.value === top && top > 0;
    const w = (Math.min(it.value, M) / M) * barMax;
    const by = y + 4;
    const lbl = truncate(it.label, fs, labelW - 10);
    const tip = `${it.label}｜${num(it.value)} 分${it.sub ? `｜${it.sub}` : ''}`;
    parts.push(`<g class="as-bar-row${isHi ? ' as-hi' : ''}" data-tip="${esc(tip)}">`
      + `<rect x="0" y="${f(y)}" width="${f(W)}" height="${f(rowH)}" fill="transparent"/>`
      + `<text class="as-label" x="2" y="${f(by + barH / 2 + fs * 0.35)}" font-size="${fs}" fill="${COLORS.ink}"${isHi ? ' font-weight="700"' : ''}>${esc(lbl)}</text>`
      + (w > 0 ? `<path class="as-bar" d="${barPath(x0, by, w, barH)}" fill="${isHi ? COLORS.highlight : COLORS.accent}"/>` : '')
      + `<text class="as-value" x="${f(x0 + w + 6)}" y="${f(by + barH / 2 + 13 * 0.35)}" font-size="13" font-weight="700" fill="${COLORS.ink}">${esc(num(it.value))}</text>`
      + (it.sub ? `<text class="as-sub" x="${f(x0 + 6)}" y="${f(by + barH + 17)}" font-size="${subFs}" fill="${COLORS.ink3}">${esc(truncate(it.sub, subFs, W - x0 - 8))}</text>` : '')
      + '</g>');
    y += rowH;
  });

  const label = `${heading}：` + list.map((it) => `${it.label} ${num(it.value)} 分`).join('、') + '。';
  return svgOpen({ w: W, h: H, label, title: heading, cls: 'as-bar' }) + parts.join('') + '</svg>';
}

// ---------- 元素／模式比例橫條 ----------

/**
 * 元素（火土風水）與模式（本位固定變動）比例：兩組橫條，各組最多的（同分都算）用重點色
 * @param {{fire:number,earth:number,air:number,water:number}} elements
 * @param {{cardinal:number,fixed:number,mutable:number}} modes
 * @param {{ width?: number, title?: string }} opts
 */
export function elementBars(elements, modes, { width = 520, title = '' } = {}) {
  const W = sizeOr(width, 520, 240, 2000);
  const heading = String(title || '元素與模式比例');
  const el = elements && typeof elements === 'object' ? elements : {};
  const mo = modes && typeof modes === 'object' ? modes : {};
  const groups = [
    { key: 'elements', name: '元素', rows: ['fire', 'earth', 'air', 'water'].map((k) => ({ key: k, label: ELEMENT_LABEL[k], value: clampScore(el[k], 0, 99) })) },
    { key: 'modes', name: '模式', rows: ['cardinal', 'fixed', 'mutable'].map((k) => ({ key: k, label: MODE_LABEL[k], value: clampScore(mo[k], 0, 99) })) },
  ].map((g) => ({ ...g, total: g.rows.reduce((s, r) => s + r.value, 0) })).filter((g) => g.total > 0);
  if (!groups.length) return emptyChart(W, 120, heading, 'as-elements');

  const fs = 13;
  const headFs = 12;
  const barH = 14;
  const rowH = 24;
  const headH = 22;
  const gapG = 10;
  const labelW = textWidth('本位', fs) + 14;
  const valW = textWidth('12（100%）', 12) + 8;
  const x0 = labelW;
  const barMax = W - x0 - valW - 4;
  const H = 6 + groups.reduce((s, g) => s + headH + g.rows.length * rowH, 0) + gapG * (groups.length - 1) + 4;

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" fill="${COLORS.surface}"/>`);
  let y = 6;
  const ariaParts = [];
  groups.forEach((g, gi) => {
    const ex = extremes(g.rows.map((r) => r.value));
    const hiSet = new Set(ex.max);
    parts.push(`<text class="as-group" x="2" y="${f(y + headFs + 2)}" font-size="${headFs}" font-weight="700" fill="${COLORS.ink2}">${g.name}</text>`);
    y += headH;
    parts.push(`<line class="as-grid" x1="${f(x0)}" y1="${f(y)}" x2="${f(x0)}" y2="${f(y + g.rows.length * rowH - 4)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
    g.rows.forEach((r, i) => {
      const isHi = hiSet.has(i);
      const pct = Math.round((r.value / g.total) * 100);
      const w = (r.value / g.total) * barMax;
      const by = y + (rowH - barH) / 2 - 2;
      const valText = `${num(r.value)}（${pct}%）`;
      const tip = `${r.label}｜${num(r.value)}（${pct}%）${isHi ? (hiSet.size > 1 ? '｜並列最多' : '｜最多') : ''}`;
      parts.push(`<g class="as-bar-row as-${g.key}${isHi ? ' as-hi' : ''}" data-key="${r.key}" data-tip="${esc(tip)}">`
        + `<rect x="0" y="${f(y - 2)}" width="${f(W)}" height="${f(rowH)}" fill="transparent"/>`
        + `<text class="as-label" x="2" y="${f(by + barH / 2 + fs * 0.35)}" font-size="${fs}" fill="${COLORS.ink}"${isHi ? ' font-weight="700"' : ''}>${r.label}</text>`
        + (w > 0 ? `<path class="as-bar" d="${barPath(x0, by, w, barH)}" fill="${isHi ? COLORS.highlight : COLORS.accent}"/>` : '')
        + `<text class="as-value" x="${f(x0 + w + 6)}" y="${f(by + barH / 2 + 12 * 0.35)}" font-size="12"${isHi ? ' font-weight="700"' : ''} fill="${COLORS.ink}">${esc(valText)}</text>`
        + '</g>');
      y += rowH;
    });
    if (gi < groups.length - 1) y += gapG;
    const strongest = ex.flat ? '各項相同' : `最多是${ex.max.map((i) => g.rows[i].label).join('、')}`;
    ariaParts.push(`${g.name} ${g.rows.map((r) => `${r.label} ${num(r.value)}`).join('、')}，${strongest}`);
  });
  const label = `${heading}：${ariaParts.join('；')}。`;
  return svgOpen({ w: W, h: H, label, title: heading, cls: 'as-elements' }) + parts.join('') + '</svg>';
}

// ---------- 提示框（滑鼠滑過、手機點一下） ----------

/**
 * 讓 rootEl 裡帶 data-tip 的元素出現提示框。滑鼠：滑過出現、移開消失；
 * 觸控：點一下出現、點別處消失；鍵盤：Tab 到時出現、Esc 關掉。回傳 detach 函式（detach.hide 可從外部收起）。
 */
export function attachTooltips(rootEl) {
  if (!rootEl || typeof document === 'undefined') return () => {};
  const doc = rootEl.ownerDocument || document;
  const win = doc.defaultView || window;
  const tip = doc.createElement('div');
  tip.className = 'as-tip';
  tip.setAttribute('role', 'tooltip');
  Object.assign(tip.style, {
    position: 'fixed', left: '0px', top: '0px', zIndex: '9999', display: 'none',
    maxWidth: 'min(280px, calc(100vw - 16px))', padding: '7px 10px', borderRadius: '6px',
    background: COLORS.ink, color: COLORS.surface, fontSize: '13px', lineHeight: '1.5',
    fontFamily: 'system-ui, "Microsoft JhengHei", "PingFang TC", sans-serif',
    boxShadow: '0 4px 14px rgba(60,10,40,.28)', pointerEvents: 'none', whiteSpace: 'normal',
    wordBreak: 'break-word',
  });
  doc.body.appendChild(tip);

  let current = null;
  let pinned = false;

  const findTip = (t) => {
    let el = t;
    while (el && el !== rootEl.parentNode) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-tip')) return rootEl.contains(el) ? el : null;
      el = el.parentNode;
    }
    return null;
  };

  function position(el, px, py) {
    const m = 8;
    const vw = win.innerWidth || doc.documentElement.clientWidth;
    const vh = win.innerHeight || doc.documentElement.clientHeight;
    let ax = px; let ay = py;
    if (ax == null || ay == null) {
      const r = el.getBoundingClientRect();
      ax = r.left + r.width / 2;
      ay = r.top + r.height / 2;
    }
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = ax - tw / 2;
    let top = ay - th - 14;
    if (top < m) top = ay + 18;
    left = Math.min(vw - m - tw, Math.max(m, left));
    top = Math.min(vh - m - th, Math.max(m, top));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function show(el, px, py) {
    current = el;
    tip.textContent = el.getAttribute('data-tip') || '';
    tip.style.display = 'block';
    position(el, px, py);
  }
  function hide() {
    current = null;
    pinned = false;
    tip.style.display = 'none';
  }

  const onOver = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (pinned) return;
    const el = findTip(e.target);
    if (el) show(el, e.clientX, e.clientY);
  };
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (pinned || !current) return;
    const el = findTip(e.target);
    if (el === current) position(el, e.clientX, e.clientY);
  };
  const onOut = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (pinned) return;
    const from = findTip(e.target);
    const to = findTip(e.relatedTarget);
    if (from && from !== to) hide();
  };
  let lastPointer = null;
  const onDown = (e) => { lastPointer = e.pointerType || null; };
  const onDocClick = (e) => {
    const el = findTip(e.target);
    const byMouse = lastPointer === 'mouse';
    lastPointer = null;
    if (el) {
      show(el, e.clientX || null, e.clientY || null);
      pinned = !byMouse;
    } else if (current) hide();
  };
  const onFocus = (e) => {
    const el = findTip(e.target);
    if (el) show(el);
  };
  const onBlur = (e) => {
    if (findTip(e.target) === current && !pinned) hide();
  };
  const onKey = (e) => { if (e.key === 'Escape' && current) hide(); };
  const onScroll = () => { if (current) hide(); };

  doc.addEventListener('pointerdown', onDown, true);
  rootEl.addEventListener('pointerover', onOver);
  rootEl.addEventListener('pointermove', onMove);
  rootEl.addEventListener('pointerout', onOut);
  rootEl.addEventListener('focusin', onFocus);
  rootEl.addEventListener('focusout', onBlur);
  doc.addEventListener('click', onDocClick, true);
  doc.addEventListener('keydown', onKey);
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onScroll);

  const detach = function detach() {
    doc.removeEventListener('pointerdown', onDown, true);
    rootEl.removeEventListener('pointerover', onOver);
    rootEl.removeEventListener('pointermove', onMove);
    rootEl.removeEventListener('pointerout', onOut);
    rootEl.removeEventListener('focusin', onFocus);
    rootEl.removeEventListener('focusout', onBlur);
    doc.removeEventListener('click', onDocClick, true);
    doc.removeEventListener('keydown', onKey);
    win.removeEventListener('scroll', onScroll);
    win.removeEventListener('resize', onScroll);
    if (tip.parentNode) tip.parentNode.removeChild(tip);
    current = null;
  };
  detach.hide = hide;
  return detach;
}
