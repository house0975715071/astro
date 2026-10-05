// 時間換算：當地鐘錶時間＋IANA 時區 → UTC（規格書 3.2）
// 只用 Intl.DateTimeFormat（iOS 不支援 Temporal），瀏覽器與 Node 共用。
// 西洋占星用鐘錶時間直接換世界時，不做真太陽時修正。

const DAY_MS = 86400000;
const fmtCache = new Map();

function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      calendar: 'gregory',
      numberingSystem: 'latn',
      era: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** 時區字串能不能被 Intl 接受；不能就丟中文錯誤。 */
export function assertTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) throw new Error('出生地缺少時區設定');
  try { formatter(tz); }
  catch { throw new Error(`時區「${tz}」無法辨識，請改選內建的出生地或填正確的時區名稱`); }
  return tz;
}

/** 某個 UTC 瞬間在該時區的偏移（分鐘，東正西負；1896 年前的台北會是 486 這種非整數倍）。 */
export function offsetMinutes(tz, utcMs) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  let y = Number(parts.year);
  if (/^B/i.test(parts.era || '')) y = 1 - y;
  const asUtc = utcFromFields(y, Number(parts.month), Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  // 精確到秒，再換成分鐘（可能帶小數，例：柏林 LMT 53.47 分）
  return (asUtc - Math.floor(utcMs / 1000) * 1000) / 60000;
}

function utcFromFields(y, mo, d, h, mi, s = 0) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, s, 0);
  return dt.getTime();
}

function pad2(n) { return String(n).padStart(2, '0'); }
/** 偏移（分鐘）→ '+8:00'；有零頭秒數時多一段 ':ss'（例：蒙羅維亞 −44.5 分 → '-0:44:30'） */
function fmtOffset(min) {
  const sign = min < 0 ? '-' : '+';
  const sec = Math.round(Math.abs(min) * 60);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${sign}${h}:${pad2(m)}${s ? ':' + pad2(s) : ''}`;
}

// IANA 時區資料庫（2022b 起）把「1970 年後時間都一樣」的地點併成連結（tzdata 的 backward 檔：
// 「Pre-2013 practice, which typically had a Zone per zone.tab line」與
// 「Non-zone.tab locations with timestamps since 1970 that duplicate those of an existing location」兩段）。
// 瀏覽器與 Node 的 ICU 沒有 backzone，這些地點 1970 年前的時間是拿被併入的鄰近地點代替
// （例：阿姆斯特丹 1909～1940 法定 +0:19:32／+0:20，資料庫回的是布魯塞爾的 +0:00／+1:00）。
// 2026-09-27 從 github.com/eggert/tz 的 backward 抓清單，並在 Node 24（tz 2026b、ICU 78.3）
// 逐一確認 1850～1970 每年 1 月、7 月的偏移都跟連結目標完全相同（138 組，0 組不同）。
const MERGED_BEFORE_1970 = new Set(`
Africa/Accra Africa/Addis_Ababa Africa/Asmara Africa/Bamako Africa/Bangui Africa/Banjul Africa/Blantyre
Africa/Brazzaville Africa/Bujumbura Africa/Conakry Africa/Dakar Africa/Dar_es_Salaam Africa/Djibouti
Africa/Douala Africa/Freetown Africa/Gaborone Africa/Harare Africa/Kampala Africa/Kigali Africa/Kinshasa
Africa/Libreville Africa/Lome Africa/Luanda Africa/Lubumbashi Africa/Lusaka Africa/Malabo Africa/Maseru
Africa/Mbabane Africa/Mogadishu Africa/Niamey Africa/Nouakchott Africa/Ouagadougou Africa/Porto-Novo
Africa/Timbuktu
America/Anguilla America/Antigua America/Aruba America/Atikokan America/Blanc-Sablon America/Cayman
America/Creston America/Curacao America/Dominica America/Grenada America/Guadeloupe America/Kralendijk
America/Lower_Princes America/Marigot America/Montserrat America/Nassau America/Port_of_Spain
America/St_Barthelemy America/St_Kitts America/St_Lucia America/St_Thomas America/St_Vincent America/Tortola
America/Argentina/ComodRivadavia America/Atka America/Coral_Harbour America/Ensenada America/Fort_Wayne
America/Montreal America/Nipigon America/Pangnirtung America/Porto_Acre America/Rainy_River America/Rosario
America/Santa_Isabel America/Shiprock America/Thunder_Bay America/Yellowknife
Antarctica/DumontDUrville Antarctica/McMurdo Antarctica/Syowa Antarctica/South_Pole Arctic/Longyearbyen
Asia/Aden Asia/Bahrain Asia/Brunei Asia/Kuala_Lumpur Asia/Kuwait Asia/Muscat Asia/Phnom_Penh Asia/Vientiane
Asia/Choibalsan Asia/Chongqing Asia/Harbin Asia/Kashgar Asia/Tel_Aviv
Atlantic/Reykjavik Atlantic/St_Helena Atlantic/Jan_Mayen
Australia/Canberra Australia/Currie
Europe/Amsterdam Europe/Bratislava Europe/Busingen Europe/Copenhagen Europe/Guernsey Europe/Isle_of_Man
Europe/Jersey Europe/Ljubljana Europe/Luxembourg Europe/Mariehamn Europe/Monaco Europe/Oslo Europe/Podgorica
Europe/San_Marino Europe/Sarajevo Europe/Skopje Europe/Stockholm Europe/Vaduz Europe/Vatican Europe/Zagreb
Europe/Belfast Europe/Tiraspol Europe/Uzhgorod Europe/Zaporozhye
Indian/Antananarivo Indian/Christmas Indian/Cocos Indian/Comoro Indian/Kerguelen Indian/Mahe Indian/Mayotte
Indian/Reunion
Pacific/Chuuk Pacific/Funafuti Pacific/Majuro Pacific/Midway Pacific/Pohnpei Pacific/Saipan Pacific/Wake
Pacific/Wallis Pacific/Enderbury Pacific/Johnston Pacific/Yap
`.trim().split(/\s+/));
const MERGED_NOTE = '這個地點 1970 年前的時區資料是用鄰近地點代替，出生時間可能有幾分鐘到十幾分鐘的誤差，上升與宮位請當參考';

/** 這個時區在 1970 年前是不是「被併入鄰近地點」的連結（給測試與 UI 用） */
export function isMergedZoneBefore1970(tz, y) {
  return MERGED_BEFORE_1970.has(tz) && y < 1970;
}

// 時區資料庫裡每個地點最早的一段偏移就是 LMT（地方平時）；用很早的年代量出來
const LMT_PROBE_MS = Date.UTC(1700, 0, 1);

// 台灣舊夏令表（民國 34～40 年 5/1～9/30）跟 IANA 不同的區段（月日；含頭尾）
const TW_DST_DIFF = Object.freeze([
  [1945, '09-21', '09-30'],
  [1946, '05-01', '05-14'],
  [1947, '04-15', '04-30'],
  [1947, '10-01', '10-31'],
]);
const TW_DST_NOTE = '這段期間各家夏令時間表不一致，本站採政府公報版；若跟別站對照不同，可改用另一個時間試試';

function taiwanDstDifferent(tz, y, mo, d) {
  if (tz !== 'Asia/Taipei') return false;
  const md = `${pad2(mo)}-${pad2(d)}`;
  return TW_DST_DIFF.some(([yy, from, to]) => yy === y && md >= from && md <= to);
}

/**
 * 當地時間 → UTC。
 * @param {number} y 西元年
 * @param {number} mo 月 1～12
 * @param {number} d 日
 * @param {number} h 時（24 小時制）
 * @param {number} mi 分
 * @param {string} tz IANA 時區，例：'Asia/Taipei'
 * @param {'earlier'|'later'|null} dstChoice 落在夏令回撥重複那一小時時，使用者選的
 * @param {number|null} lon 東經（度）；偏移不是 15 分鐘整數倍（LMT 年代）時改用 lon/15 小時
 * @returns {{status:'ok'|'ambiguous'|'nonexistent'|'lmt', utcMs:number, offsetMin:number, note:string|null}}
 */
export function localToUtc(y, mo, d, h, mi, tz, dstChoice = null, lon = null) {
  assertTimeZone(tz);
  for (const [k, v] of [['年', y], ['月', mo], ['日', d], ['時', h], ['分', mi]]) {
    if (!Number.isInteger(v)) throw new Error(`出生${k}必須是整數`);
  }
  if (dstChoice != null && dstChoice !== 'earlier' && dstChoice !== 'later') {
    throw new Error('夏令時間的選擇只能是 earlier 或 later');
  }
  const localAsUtc = utcFromFields(y, mo, d, h, mi);
  const before = offsetMinutes(tz, localAsUtc - DAY_MS);
  const after = offsetMinutes(tz, localAsUtc + DAY_MS);
  const notes = [];

  const isQuarter = (o) => Math.abs(o / 15 - Math.round(o / 15)) < 1e-9;
  const valid = [];
  for (const o of before === after ? [before] : [before, after]) {
    if (offsetMinutes(tz, localAsUtc - o * 60000) === o) valid.push(o);
  }
  // 非 15 分鐘整數倍的偏移分兩種：
  //  ① 真的 LMT（資料庫最早那段，例：台北 1896 前 +8:06）→ 下面 LMT 分支，改用經度；
  //  ② 法定但有零頭的標準時間（例：蒙羅維亞 1972 前 −0:44:30）→ 採用資料庫值，照一般流程。
  const lmtOffset = offsetMinutes(tz, LMT_PROBE_MS);
  const isLmt = (o) => !isQuarter(o) && Math.abs(o - lmtOffset) < 1e-9;
  const candidates = valid.filter((o) => !isLmt(o));
  if (isMergedZoneBefore1970(tz, y)) notes.push(MERGED_NOTE);

  // LMT 年代：成立的偏移都不是 15 分鐘的整數倍、也不是法定時間
  if (candidates.length === 0 && (!isQuarter(before) || !isQuarter(after))) {
    let offsetMin;
    if (typeof lon === 'number' && Number.isFinite(lon)) {
      offsetMin = lon * 4; // lon/15 小時 = lon×4 分鐘
      notes.push(`這個年代還沒有統一的標準時間，改用出生地經度換算的地方平時（${fmtOffset(offsetMin)}）`);
    } else {
      offsetMin = valid.length ? valid[0] : (isQuarter(before) ? after : before);
      notes.push(`這個年代還沒有統一的標準時間，採用時區資料庫記載的地方平時（${fmtOffset(offsetMin)}）`);
    }
    return { status: 'lmt', utcMs: localAsUtc - offsetMin * 60000, offsetMin, note: notes.join('；') };
  }
  let status = 'ok';
  let offsetMin;
  if (candidates.length === 1) {
    offsetMin = candidates[0];
  } else if (candidates.length >= 2) {
    status = 'ambiguous';
    const earlier = Math.max(...candidates); // 偏移大的那個瞬間比較早（例：夏令 +9 在 +8 之前）
    const later = Math.min(...candidates);
    offsetMin = dstChoice === 'later' ? later : earlier;
    notes.push(`這個時間在當地出現過兩次（時鐘回撥），目前採用${dstChoice === 'later' ? '第二次' : '第一次'}（${fmtOffset(offsetMin)}）；可切換另一次試試`);
  } else {
    status = 'nonexistent';
    offsetMin = before; // 切換前的偏移
    notes.push(`這個時間在當地不存在（時鐘往前撥），已往後推到切換後的 ${fmtOffset(after)} 對應時刻`);
  }
  if (!isQuarter(offsetMin)) notes.push(`採用當時當地的法定時間（${fmtOffset(offsetMin)}）`);
  if (taiwanDstDifferent(tz, y, mo, d)) notes.push(TW_DST_NOTE);
  return { status, utcMs: localAsUtc - offsetMin * 60000, offsetMin, note: notes.length ? notes.join('；') : null };
}

/** 反向：UTC 瞬間 → 該時區的當地欄位（給月亮跨座時刻等顯示用）。 */
export function utcToLocalFields(tz, utcMs) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  let y = Number(parts.year);
  if (/^B/i.test(parts.era || '')) y = 1 - y;
  return {
    y, mo: Number(parts.month), d: Number(parts.day),
    h: Number(parts.hour) % 24, mi: Number(parts.minute), s: Number(parts.second),
  };
}

export { fmtOffset };
