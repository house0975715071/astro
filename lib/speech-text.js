// 文字轉「可念文字」：數字、符號、讀音替換、斷句（語音解說用）
// 規格：docs/voice-contract.md 第 3 節。只用 Node 內建功能，不連網。
import { PRONOUNCE } from '../kb/pronounce.js?v=8be9bc87';

const DIGIT_ZH = '零一二三四五六七八九';

// 後面接這些量詞時，單獨的 2 念「兩」
const LIANG_UNITS = ['個', '年', '次', '位', '種', '段', '件', '項', '條', '天', '週', '倍', '歲', '人', '份', '間', '張', '本', '句', '章', '顆', '層', '筆', '家', '隻', '碗', '杯', '場', '台', '輛', '棟', '戶', '坪', '趟', '套', '組', '頁', '篇', '招', '點', '成'];

/* ───────── 數字 ───────── */

function sectionToChinese(v, isLeading) {
  // v：0～9999
  const units = ['千', '百', '十', ''];
  const ds = [Math.floor(v / 1000), Math.floor(v / 100) % 10, Math.floor(v / 10) % 10, v % 10];
  let out = '';
  let zero = false;
  let started = false;
  for (let i = 0; i < 4; i++) {
    const d = ds[i];
    if (d === 0) {
      if (started) zero = true;
      continue;
    }
    if (zero) { out += '零'; zero = false; }
    let ch = DIGIT_ZH[d];
    if (d === 2 && (i === 0 || i === 1)) ch = '兩';          // 兩千、兩百
    if (i === 2 && d === 1 && !started && isLeading) ch = ''; // 十、十五（不是一十）
    out += ch + units[i];
    started = true;
  }
  return out;
}

function integerToChinese(n) {
  if (n === 0) return '零';
  if (n > Number.MAX_SAFE_INTEGER) return digitsToChinese(String(n));
  const big = ['', '萬', '億', '兆'];
  const groups = [];
  let x = n;
  while (x > 0) { groups.push(x % 10000); x = Math.floor(x / 10000); }
  if (groups.length > big.length) return digitsToChinese(String(n));
  let out = '';
  let pendingZero = false;
  for (let g = groups.length - 1; g >= 0; g--) {
    const v = groups[g];
    if (v === 0) {
      if (out) pendingZero = true;
      continue;
    }
    if (out && (pendingZero || v < 1000)) out += '零';
    pendingZero = false;
    let s = sectionToChinese(v, out === '');
    if (g > 0 && v === 2) s = '兩';                          // 兩萬、兩億
    out += s + big[g];
  }
  return out;
}

// 36 → '三十六'；10 → '十'；105 → '一百零五'；0 → '零'；-8 → '負八'；8.5 → '八點五'
export function numberToChinese(n) {
  let s;
  if (typeof n === 'number') {
    if (!Number.isFinite(n)) return '';
    s = Math.abs(n) < 1e21 ? String(n) : '';
    if (!s || /e/i.test(s)) {
      s = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
    }
  } else if (typeof n === 'string' || typeof n === 'bigint') {
    s = String(n).trim().replace(/,/g, '');
  } else {
    return '';
  }
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return '';
  const [, sign, intPart, frac] = m;
  const intNum = intPart.length > 16 ? null : Number(intPart);
  let out = intNum === null ? digitsToChinese(intPart) : integerToChinese(intNum);
  if (frac) out += '點' + digitsToChinese(frac);
  const isZero = /^0+$/.test(intPart) && (!frac || /^0+$/.test(frac));
  if (sign === '-' && !isZero) out = '負' + out;
  return out;
}

// '1990' → '一九九零'（逐位念，年份用）；非數字字元原樣保留
export function digitsToChinese(s) {
  return String(s ?? '').replace(/[0-9]/g, (d) => DIGIT_ZH[Number(d)]);
}

// 一個數字字串（可含小數）→ 中文
function numStr(str) {
  return numberToChinese(str);
}

/* ───────── 讀音字典 ───────── */

const compiledCache = new WeakMap();

function compileDict(dict) {
  const list = Array.isArray(dict) ? dict : PRONOUNCE;
  if (compiledCache.has(list)) return compiledCache.get(list);
  const byTerm = new Map();
  for (const e of list) {
    if (!e || typeof e.term !== 'string' || !e.term || typeof e.say !== 'string') continue;
    byTerm.set(e.term, e); // 同 term 以最後一筆為準
  }
  const byFirst = new Map();
  for (const e of byTerm.values()) {
    const first = e.term[0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push({
      term: e.term,
      say: e.say,
      notAfter: Array.isArray(e.notAfter) ? e.notAfter.filter((x) => typeof x === 'string' && x) : [],
      notBefore: Array.isArray(e.notBefore) ? e.notBefore.filter((x) => typeof x === 'string' && x) : [],
    });
  }
  for (const arr of byFirst.values()) arr.sort((a, b) => b.term.length - a.term.length); // 長詞優先
  compiledCache.set(list, byFirst);
  return byFirst;
}

// 依字典替換：由左到右，每個位置長詞優先，尊重 notAfter / notBefore（以原文判斷）
export function applyPronounce(text, dict) {
  const src = String(text ?? '');
  if (!src) return '';
  const byFirst = compileDict(dict);
  if (byFirst.size === 0) return src;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const cands = byFirst.get(src[i]);
    let hit = null;
    if (cands) {
      for (const c of cands) {
        if (!src.startsWith(c.term, i)) continue;
        const before = src.slice(0, i);
        if (c.notAfter.some((w) => before.endsWith(w))) continue;
        const endIdx = i + c.term.length;
        if (c.notBefore.some((w) => src.startsWith(w, endIdx))) continue;
        hit = c;
        break;
      }
    }
    if (hit) {
      out += hit.say;
      i += hit.term.length;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

// 使用者字典覆蓋同 term 的內建條目；使用者新增的條目接在後面
export function mergeDict(builtin, user) {
  const map = new Map();
  for (const e of Array.isArray(builtin) ? builtin : []) {
    if (e && typeof e.term === 'string' && e.term && typeof e.say === 'string') map.set(e.term, { ...e });
  }
  for (const u of Array.isArray(user) ? user : []) {
    if (!u || typeof u.term !== 'string' || !u.term || typeof u.say !== 'string') continue;
    const entry = { term: u.term, say: u.say };
    if (typeof u.reading === 'string') entry.reading = u.reading;
    if (typeof u.note === 'string') entry.note = u.note;
    if (map.has(u.term)) map.delete(u.term); // 覆蓋：原本的例外規則也一併換掉
    map.set(u.term, entry);
  }
  return [...map.values()];
}

/* ───────── 可念文字 ───────── */

const PUNCT_RANK = { '、': 1, '，': 2, '：': 2, '；': 3, '。': 4, '！': 5, '？': 6 };
const PUNCT_CLASS = '、，：；。！？';

function isLiangContext(after) {
  // 「2點鐘」要念「兩點鐘」，所以不排除點鐘；「第2點」由呼叫端看前一個字處理
  return LIANG_UNITS.some((u) => after.startsWith(u)) && !after.startsWith('年級');
}

function convertRanges(t) {
  const re = /(?<![\d.])(\d+(?:\.\d+)?)([ \t]*)(～|~|〜|－|-|–|—|至|到)[ \t]*(\d+(?:\.\d+)?)(?![\d.])([ \t]*)([%％]?)/g;
  return t.replace(re, (all, a, sp0, sep, b, sp, pct, offset, whole) => {
    const after = whole.slice(offset + all.length);
    // 「10 -6」「5 - 2」是減法或加減分，不是範圍：減號前面有空白時，後面要接歲或年才算範圍
    if (sp0 && /^[－\-–—]$/.test(sep) && !/^(歲|年)/.test(after)) return all;
    if (pct) return '百分之' + numStr(a) + '到' + numStr(b);
    const isYear = /^\d{4}$/.test(a) && /^\d{4}$/.test(b) && after.startsWith('年');
    if (isYear) return digitsToChinese(a) + '到' + digitsToChinese(b);
    let za = numStr(a);
    let zb = numStr(b);
    if (isLiangContext(after)) {
      if (a === '2') za = '兩';
      if (b === '2') zb = '兩';
    }
    return za + '到' + zb;
  });
}

// toSpeakable(text, { dict })
export function toSpeakable(text, opts = {}) {
  let t = String(text ?? '');
  const dict = opts && Array.isArray(opts.dict) ? opts.dict : PRONOUNCE;

  // 0. 全形數字與符號正規化
  t = t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48))
    .replace(/＋/g, '+').replace(/％/g, '%').replace(/．/g, '.')
    .replace(/\r\n?/g, '\n');

  // 1. 標頭符號、星號、引號、表情符號、多餘空白
  t = t.replace(/【/g, '').replace(/】/g, '，')
    .replace(/[⭐★☆✦✧️‍]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[「」『』“”‘’"《》〈〉]/g, '')
    .replace(/[ \t　 ]+/g, ' ');

  // 千分位逗號：1,400 → 1400
  while (/\d,\d{3}(?!\d)/.test(t)) t = t.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');

  // 日期與時間（先處理，避免被當成範圍）
  t = t.replace(/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d.])/g,
    (_, y, m, d) => digitsToChinese(y) + '年' + numStr(String(Number(m))) + '月' + numStr(String(Number(d))) + '日');
  t = t.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g, (_, h, m) => {
    const hh = Number(h);
    const mm = Number(m);
    const hz = hh === 2 ? '兩' : numberToChinese(hh);
    return hz + '點' + (mm === 0 ? '' : numberToChinese(mm) + '分');
  });

  // 2. 範圍
  t = convertRanges(t);

  // 3. 數字
  // 百分比
  t = t.replace(/([+-]?)(\d+(?:\.\d+)?)[ \t]*%/g, (_, sign, num, offset, whole) => {
    let prefix = '';
    const prev = whole[offset - 1];
    if (sign === '+') prefix = '加';
    else if (sign === '-') prefix = (prev && /\d/.test(prev)) ? '到' : '減';
    return prefix + '百分之' + numStr(num);
  });
  // 分數：1/3 → 三分之一（放在「／ → 或」之前；日期 2026/9/17 前面已經轉掉，前後還接著斜線的也不動）
  t = t.replace(/(?<![\d.\/／])(\d+)[ \t]*[\/／][ \t]*(\d+)(?![\d.\/／])/g,(_, a, b) => numberToChinese(b) + '分之' + numberToChinese(a));
  // 四位數年份（1000～2999）逐位念
  t = t.replace(/(?<![\d.])([12]\d{3})(?![\d.])(?=[ \t]*年)/g, (_, y) => digitsToChinese(y));
  // 正負號
  t = t.replace(/\+[ \t]*(?=\d)/g, '加');
  t = t.replace(/(?<!\d)[-−][ \t]*(?=\d)/g, '減');
  // 小數
  t = t.replace(/(?<![\d.])(\d+)\.(\d+)(?![\d.])/g, (_, a, b) => numberToChinese(a) + '點' + digitsToChinese(b));
  // 兩
  t = t.replace(/(?<![\d.])2(?![\d.])([ \t]*)/g, (all, sp, offset, whole) => {
    const prev = whole[offset - 1];
    const after = whole.slice(offset + all.length);
    if (prev === '第') return '二' + sp;
    return (isLiangContext(after) ? '兩' : '二') + sp;
  });
  // 其他整數
  t = t.replace(/\d+/g, (d) => (d.length > 16 ? digitsToChinese(d) : numberToChinese(d)));
  t = t.replace(/%/g, '');

  // 4. 符號
  t = t.replace(/[／/]/g, '或')
    .replace(/[～~〜]/g, '到')
    .replace(/——|—|–|[·・•：:]/g, '，')
    .replace(/…+|\.{3,}/g, '。')
    .replace(/[（(]/g, '，').replace(/[）)]/g, '，')
    .replace(/,/g, '，').replace(/;/g, '；').replace(/!/g, '！').replace(/\?/g, '？')
    .replace(/[-−_*#=|\\^`<>\[\]{}]/g, '')
    .replace(/&/g, '和');
  // 換行 → 句號
  t = t.replace(/\n+/g, '。');
  // 空白：中文與標點旁邊的空白拿掉
  t = t.replace(/ +/g, ' ')
    .replace(/ ?([^\x00-\x7f]) ?/g, '$1')
    .trim();

  // 5. 讀音字典
  t = applyPronounce(t, dict);

  // 6. 收尾：連續標點合併（留最強的一個）、開頭不留標點
  t = t.replace(new RegExp(`[${PUNCT_CLASS}]{2,}`, 'g'), (run) => {
    let best = run[0];
    for (const c of run) if ((PUNCT_RANK[c] || 0) > (PUNCT_RANK[best] || 0)) best = c;
    return best;
  });
  t = t.replace(new RegExp(`^[${PUNCT_CLASS}\\s]+`), '');
  return t.trim();
}

/* ───────── 斷句 ───────── */

const HARD_END = new Set(['。', '！', '？', '；', '!', '?', ';']);
const CLOSERS = new Set(['」', '』', '）', ')', '】', '”', '’']);
const SOFT_BREAK = new Set(['，', '、', '：']);
const NUM_CHAR = /[0-9０-９零〇一二三四五六七八九十百千萬億兩點.%％]/;
const UNIT_CHAR = /[歲年分月日個次位種段%％]/;
const ONLY_PUNCT = /^[\s，、：；。！？,.;:!?「」『』（）()【】…～~—\-]*$/;

function badCut(s, p) {
  // 在 s[p-1] 與 s[p] 之間切，會不會切斷數字或數字與單位
  const a = s[p - 1];
  const b = s[p];
  if (a === undefined || b === undefined) return false;
  if (NUM_CHAR.test(a) && (NUM_CHAR.test(b) || UNIT_CHAR.test(b))) return true;
  return false;
}

function splitLong(s, max) {
  if (s.length <= max) return [s];
  const mid = s.length / 2;
  let bestP = -1;
  for (let i = 0; i < s.length - 1; i++) {
    if (!SOFT_BREAK.has(s[i])) continue;
    let p = i + 1;
    while (p < s.length && CLOSERS.has(s[p])) p++;
    if (p >= s.length || badCut(s, p)) continue;
    if (bestP < 0 || Math.abs(p - mid) < Math.abs(bestP - mid)) bestP = p;
  }
  if (bestP < 0) {
    // 沒有逗號可以切：從中間往兩邊找一個不會切斷數字的位置
    const m = Math.floor(mid);
    for (let d = 0; d < s.length; d++) {
      for (const p of [m - d, m + d]) {
        if (p <= 0 || p >= s.length) continue;
        if (badCut(s, p)) continue;
        if (SOFT_BREAK.has(s[p]) || HARD_END.has(s[p]) || CLOSERS.has(s[p])) continue;
        bestP = p;
        break;
      }
      if (bestP >= 0) break;
    }
  }
  if (bestP <= 0 || bestP >= s.length) return [s];
  return [...splitLong(s.slice(0, bestP), max), ...splitLong(s.slice(bestP), max)];
}

// splitSentences(text, { max = 48 })
export function splitSentences(text, opts = {}) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const max = Number.isInteger(opts?.max) && opts.max >= 4 ? opts.max : 48;
  const pieces = [];
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\n') {
      pieces.push(cur);
      cur = '';
      continue;
    }
    cur += c;
    if (HARD_END.has(c)) {
      while (i + 1 < src.length && (HARD_END.has(src[i + 1]) || CLOSERS.has(src[i + 1]))) cur += src[++i];
      pieces.push(cur);
      cur = '';
    }
  }
  pieces.push(cur);
  const out = [];
  for (const raw of pieces) {
    const p = raw.trim();
    if (!p || ONLY_PUNCT.test(p)) continue;
    for (const part of splitLong(p, max)) {
      const q = part.trim();
      if (q && !ONLY_PUNCT.test(q)) out.push(q);
    }
  }
  return out;
}

/* ───────── 估時 ───────── */

// 估計念多久（秒）：字數／每秒字數＋標點停頓；四捨五入到小數一位
export function estimateSeconds(speakText, cps = 3.6) {
  const s = String(speakText ?? '');
  const rate = Number.isFinite(cps) && cps > 0 ? cps : 3.6;
  let chars = 0;
  let pause = 0;
  for (const c of s) {
    if (/\s/.test(c)) continue;
    if ('，、：,:'.includes(c)) pause += 0.25;
    else if ('；;'.includes(c)) pause += 0.35;
    else if ('。！？!?'.includes(c)) pause += 0.5;
    else if (/[\p{P}\p{S}]/u.test(c)) continue;
    else chars++;
  }
  return Math.round((chars / rate + pause) * 10) / 10;
}
