/* 西洋占星 免費星盤（網頁版）— 主程式
 * 全部在訪客自己的瀏覽器裡算：不連網、不存任何東西（沒有 cookie、沒有瀏覽器儲存、網址不帶生日）。
 * 重新整理就清空，這是故意的。
 * 本機版（桌面殼）也載入這一支：排完盤會發 'astro:chart' 事件，並掛 window.astroApp 給名冊「開盤」用。
 */
import { buildChart, houseName, HOUSE_SYSTEMS, DIGNITY_NAMES, PLANET_NAMES } from './lib/astro.js?v=00e539aa';
import { analyze } from './lib/analyze.js?v=00e539aa';
import { renderReport } from './lib/report.js?v=00e539aa';
import { buildNarration } from './lib/narrate.js?v=00e539aa';
import { PLACES, PLACE_GROUPS, findPlace, DEFAULT_PLACE_ID } from './kb/places.js?v=00e539aa';
import { radarChart, houseStarChart, wheelChart, cycleTimeline, barChart, elementBars, attachTooltips, extremes, topWithTies } from './charts.js?v=00e539aa';
import { createSpeaker } from './speak.js?v=00e539aa';

/* ───────── 常數 ───────── */

const DOMAIN_KEYS = ['事業', '財運', '家庭', '感情', '健康'];
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;
const ASPECTS_SHOWN = 12;

const TONE = { great: '#b8860b', good: '#2e7d5b', ok: '#4a5568', warn: '#b7791f', bad: '#9b2c2c' };
const PAT_TONE = { great: TONE.great, good: TONE.good, mixed: TONE.warn, warn: TONE.bad, bad: TONE.bad };
const ASPECT_CLS = { conjunction: 'asp-conj', sextile: 'asp-soft', trine: 'asp-soft', square: 'asp-tense', opposition: 'asp-tense' };
const CYCLE_STATUS = { past: '已走過', now: '現在', future: '之後' };

// 語音講稿參數（規格書 8.1；照紫微改星盤的 CTA）
const NARRATION_OPTS = {
  mode: 'brief',
  useChartName: false,
  speaker: '阿良',
  voiceKind: 'generic',
  disclosure: true,
  cta: '如果你最近有買房、換屋或置產的想法，歡迎點下面的 LINE 按鈕找我聊聊，預算與行情我可以幫你一起算。',
};

/* ───────── 小工具 ───────── */

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toneOf = (lv) => TONE[lv && lv.tone] || TONE.ok;
const hasCjk = (s) => /[一-鿿]/.test(String(s || ''));
const pad2 = (n) => String(n).padStart(2, '0');
const hName = (n) => { try { return houseName(n); } catch { return ''; } };
const pName = (id) => PLANET_NAMES[id] || id;
// 取第一句（到第一個句號）
const c1 = (s) => { const i = String(s).indexOf('。'); return i > 0 ? String(s).slice(0, i + 1) : String(s); };

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function widthOf(el, fallback) {
  const w = el ? el.clientWidth : 0;
  return w > 0 ? w : fallback;
}

// 圖表畫壞不能拖垮整頁：包起來，失敗就顯示一行字
function chartHtml(fn) {
  try {
    const svg = fn();
    if (typeof svg === 'string' && svg.includes('<svg')) return svg;
  } catch (e) {
    console.warn('圖表產生失敗', e && e.message);
  }
  return '<p class="chart-empty">這張圖畫不出來，下面的文字說明一樣可以看。</p>';
}

function domainList(an) {
  return DOMAIN_KEYS.map((k) => an.domains[k]).filter(Boolean);
}

// 圖上的可點元素（SVG 群組）也要能用鍵盤點
function makeFocusable(root, sel) {
  $$(sel, root).forEach((el) => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    el.style.cursor = 'pointer';
  });
}

/* ───────── 狀態（只在記憶體，重新整理就沒了） ───────── */

let cur = null; // { input, chart, analysis, narration, nick }
let domainKey = DOMAIN_KEYS[0];
let aspectsAll = false;
const detach = {};
let lastSheetFocus = null;

/* ───────── 初始化 ───────── */

function init() {
  $('#f-y').innerHTML = '<option value="">----</option>' +
    Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => `<option value="${YEAR_MIN + i}">${YEAR_MIN + i}</option>`).join('');
  $('#f-m').innerHTML = '<option value="">--</option>' +
    Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  fillDays();
  $('#f-hh').innerHTML = '<option value="">--</option>' +
    Array.from({ length: 24 }, (_, i) => `<option value="${i}">${pad2(i)}</option>`).join('');
  $('#f-mm').innerHTML = '<option value="">--</option>' +
    Array.from({ length: 60 }, (_, i) => `<option value="${i}">${pad2(i)}</option>`).join('');
  fillPlaces();

  $('#f-y').addEventListener('change', fillDays);
  $('#f-m').addEventListener('change', fillDays);
  $('#f-tu').addEventListener('change', onTimeUnknownChange);
  $('#f-place').addEventListener('change', onPlaceChange);
  $('#f-dst').addEventListener('change', () => { if (cur) startChart(); });
  // 宮位制跟夏令時間下拉一樣：已經有結果就直接重排，免得畫面還是舊的宮位制
  $$('input[name="as-hs"]').forEach((r) => r.addEventListener('change', () => { if (cur) startChart(); }));
  $('#birth-form').addEventListener('submit', (e) => { e.preventDefault(); startChart(); });

  // 詳解：輪盤（行星、宮位）、十二宮星狀圖、宮位按鈕、行星表、週期時間軸，全部用同一個入口
  for (const id of ['#wheel', '#house-star', '#house-list', '#planet-table', '#cycle-timeline', '#cycle-notes', '#sheet-body', '#domain-body']) {
    $(id).addEventListener('click', onDetailClick);
    $(id).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest('[data-planet],[data-house],[data-cycle]');
      if (t && t.tagName !== 'BUTTON') { e.preventDefault(); onDetailClick({ target: t }); }
    });
  }

  $('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', onSheetKey);

  $('#domain-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-domain]');
    if (b) selectDomain(b.getAttribute('data-domain'), false);
  });
  $('#domain-tabs').addEventListener('keydown', onTabKey);

  $('#btn-aspects-all').addEventListener('click', () => { aspectsAll = !aspectsAll; renderAspectTable(); });
  $('#btn-report').addEventListener('click', openReport);

  // 圖表提示框：整個結果區只掛一次（每張圖都有 data-tip，重畫圖也不用重掛）
  try { detach.tips = attachTooltips($('#result')); } catch (e) { console.warn('提示框掛載失敗', e && e.message); }

  // 「改生日重新排」：回到輸入卡；柔性 CTA：捲到名片卡
  document.addEventListener('click', (e) => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (e.target.closest('[data-goto="cta"]')) {
      closeSheet();
      $('#cta-card').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    const b = e.target.closest('[data-redo]');
    if (!b) return;
    $('#form-card').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    try { $('#f-y').focus({ preventScroll: true }); } catch { /* 舊瀏覽器 */ }
  });

  initVoice();

  let lastW = document.documentElement.clientWidth;
  window.addEventListener('resize', debounce(() => {
    const w = document.documentElement.clientWidth;
    if (!cur || Math.abs(w - lastW) < 24) return;
    lastW = w;
    renderCharts();
  }, 200));

  const boot = $('#boot-note');
  if (boot) boot.remove();
}

function fillPlaces() {
  const sel = $('#f-place');
  const groups = PLACE_GROUPS.map((g) => {
    const opts = PLACES.filter((p) => p.group === g).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return opts ? `<optgroup label="${esc(g)}">${opts}</optgroup>` : '';
  }).join('');
  sel.innerHTML = groups + '<option value="custom">自訂經緯度…</option>';
  sel.value = DEFAULT_PLACE_ID;
  if (!sel.value && PLACES.length) sel.value = PLACES[0].id;
  onPlaceChange();
}

function onPlaceChange() {
  const custom = $('#f-place').value === 'custom';
  $('#custom-wrap').hidden = !custom;
  if (custom && !$('#f-tz').value) $('#f-tz').value = 'Asia/Taipei';
}

function onTimeUnknownChange() {
  const unknown = $('#f-tu').checked;
  $('#f-hh').disabled = unknown;
  $('#f-mm').disabled = unknown;
  $('#time-help').textContent = unknown
    ? '不知道出生時間：行星用當天中午計算，宮位改用太陽盤估算，上升星座與天頂不會顯示。'
    : '出生時間會決定上升星座與十二宮；不知道的話勾上面，改用太陽盤估算。';
}

// 日期下拉：依年月算天數（避免 2 月 30 日）
function fillDays() {
  const sel = $('#f-d');
  const keep = sel.value;
  const y = Number($('#f-y').value);
  const m = Number($('#f-m').value);
  let max = 31;
  if (m >= 1 && m <= 12) max = (y >= YEAR_MIN && y <= YEAR_MAX) ? new Date(y, m, 0).getDate() : [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  sel.innerHTML = '<option value="">--</option>' +
    Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  if (keep && Number(keep) <= max) sel.value = keep;
}

function houseSystemVal() {
  const r = $('input[name="as-hs"]:checked');
  return r ? r.value : 'placidus';
}

/* ───────── 排盤 ───────── */

function formError(text) {
  const el = $('#form-err');
  el.textContent = text || '';
  el.hidden = !text;
}

function cleanNick(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f<>{}[\]\\/"'`&;|$]/g, '').trim().slice(0, 12);
}

// 今天（瀏覽器本地日期，只看年月日）：年運與年齡的「今天」由這裡傳給解析引擎
function todayStart() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
function todayStr() {
  const t = todayStart();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
const NOT_BORN = '這個生日比今天還晚，還沒出生沒辦法排年運與年齡。請確認年份有沒有選錯（要選西元年）。';

function readForm() {
  const y = Number($('#f-y').value);
  const m = Number($('#f-m').value);
  const d = Number($('#f-d').value);
  if (!y) return { error: '請選擇出生年（西元），例如 1985（民國 74 年＋1911）。' };
  if (!m) return { error: '請選擇出生月份。' };
  if (!d) return { error: '請選擇出生日期。' };
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return { error: `西元 ${y} 年 ${m} 月沒有 ${d} 日，請再確認一次。` };
  }
  if (dt > todayStart()) return { error: NOT_BORN };

  const timeUnknown = $('#f-tu').checked;
  let time = null;
  if (!timeUnknown) {
    const hh = $('#f-hh').value;
    const mm = $('#f-mm').value;
    if (hh === '' || mm === '') return { error: '請選擇出生時間（時與分）；真的不知道，就勾「不知道出生時間」。' };
    time = `${pad2(Number(hh))}:${pad2(Number(mm))}`;
  }

  let place;
  const pid = $('#f-place').value;
  if (pid === 'custom') {
    const lat = Number($('#f-lat').value);
    const lon = Number($('#f-lon').value);
    const tz = String($('#f-tz').value || '').trim();
    if ($('#f-lat').value.trim() === '' || !Number.isFinite(lat) || lat < -89.99 || lat > 89.99) return { error: '自訂經緯度：緯度要在 −89.99 到 89.99 之間（北緯正、南緯負），例如桃園 24.9937。' };
    if ($('#f-lon').value.trim() === '' || !Number.isFinite(lon) || lon < -180 || lon > 180) return { error: '自訂經緯度：經度要在 −180 到 180 之間（東經正、西經負），例如桃園 121.3010。' };
    if (!tz) return { error: '自訂經緯度：請填時區名稱，例如 Asia/Taipei、Asia/Tokyo、America/Los_Angeles。' };
    place = { id: '', name: `自訂地點（${lat}, ${lon}）`, lat, lon, tz };
  } else {
    const p = findPlace(pid);
    if (!p) return { error: '請選擇出生地。' };
    place = { id: p.id, name: p.name, lat: p.lat, lon: p.lon, tz: p.tz };
  }

  const dstChoice = $('#dst-wrap').hidden ? null : ($('#f-dst').value || null);
  return {
    input: {
      name: cleanNick($('#f-nick').value),
      date: `${y}-${m}-${d}`,
      time,
      timeUnknown,
      place,
      houseSystem: houseSystemVal(),
      dstChoice,
    },
  };
}

// 新的一次排盤失敗時，把上一個人的結果收起來，免得把舊結果看成新結果（例如幫家人排）
function clearResult() {
  if (cur) {
    cur = null;
    try { V.speaker && V.speaker.stop(); } catch { /* 忽略 */ }
    try { if (detach.tips && detach.tips.hide) detach.tips.hide(); } catch { /* 忽略 */ }
    closeSheet();
    $('#result').hidden = true;
  }
  // 通知本機殼（名冊「存進名冊」、本人聲音面板）：現在沒有有效的排盤結果，別拿上一個人的資料存檔
  // 第一次排盤就失敗也要送（本機殼的面板可能已經顯示）
  try {
    document.dispatchEvent(new CustomEvent('astro:clear'));
  } catch (e) {
    console.warn('astro:clear 事件送出失敗', e && e.message);
  }
}

function chartFail(text) {
  clearResult();
  formError(text);
  // 錯誤訊息在表單裡；結果收起來後畫面可能停在很下面，拉回來讓人看得到
  const el = $('#form-err');
  if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'center' });
}

// 回傳 Promise：排完（成功或失敗）才 resolve，本機殼的名冊「開盤」可以等
function startChart() {
  formError('');
  const f = readForm();
  if (f.error) { chartFail(f.error); return Promise.resolve(false); }
  const btn = $('#btn-go');
  btn.disabled = true;
  btn.textContent = '排盤中…';
  // 讓「排盤中」先畫出來再算
  return new Promise((resolve) => {
    setTimeout(() => {
      let ok = false;
      try { ok = runChart(f.input); } finally {
        btn.disabled = false;
        btn.textContent = '開始排盤';
        resolve(ok);
      }
    }, 20);
  });
}

function runChart(input) {
  let chart;
  let analysis;
  try {
    chart = buildChart(input);
    analysis = analyze(chart, { today: todayStr() });
  } catch (e) {
    const msg = String((e && e.message) || '');
    console.warn('排盤失敗', e && e.message);
    chartFail(hasCjk(msg) ? `排盤沒有成功：${msg.replace(/[。．.]+$/, '')}。` : '排盤沒有成功：請確認日期、時間與出生地是否正確。');
    return false;
  }

  // 夏令重複時段：只有這種情況才出現「用哪一次」的選擇
  const ambiguous = chart.time && chart.time.status === 'ambiguous';
  $('#dst-wrap').hidden = !ambiguous;
  if (ambiguous) {
    $('#adv').open = true;
    $('#f-dst').value = input.dstChoice === 'later' ? 'later' : 'earlier';
  }

  let narration = null;
  try {
    narration = buildNarration(chart, analysis, { ...NARRATION_OPTS, callName: input.name });
  } catch (e) {
    console.warn('講稿產生失敗', e && e.message);
  }

  cur = { input, chart, analysis, narration, nick: input.name };
  domainKey = DOMAIN_KEYS[0];
  aspectsAll = false;
  const result = $('#result');
  result.hidden = false;
  renderAll();

  try {
    document.dispatchEvent(new CustomEvent('astro:chart', { detail: { input, chart, analysis, narration } }));
  } catch (e) {
    console.warn('astro:chart 事件送出失敗', e && e.message);
  }

  const ov = $('#ov');
  try { ov.focus({ preventScroll: true }); } catch { /* 舊瀏覽器 */ }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  ov.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  return true;
}

/* ───────── 給本機殼用：把 input 填回表單並排盤 ───────── */

function fillForm(input) {
  const inp = input && typeof input === 'object' ? input : {};
  $('#f-nick').value = cleanNick(inp.name);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(inp.date || '').trim());
  if (m) {
    $('#f-y').value = String(Number(m[1]));
    $('#f-m').value = String(Number(m[2]));
    fillDays();
    $('#f-d').value = String(Number(m[3]));
  } else {
    $('#f-y').value = ''; $('#f-m').value = ''; fillDays(); $('#f-d').value = '';
  }
  const unknown = Boolean(inp.timeUnknown) || inp.time == null || String(inp.time).trim() === '';
  $('#f-tu').checked = unknown;
  const t = unknown ? null : /^(\d{1,2}):(\d{1,2})$/.exec(String(inp.time).trim());
  $('#f-hh').value = t ? String(Number(t[1])) : '';
  $('#f-mm').value = t ? String(Number(t[2])) : '';
  onTimeUnknownChange();
  const place = inp.place || {};
  const known = place.id ? findPlace(place.id) : null;
  if (known) {
    $('#f-place').value = known.id;
  } else {
    $('#f-place').value = 'custom';
    $('#f-lat').value = place.lat != null ? String(place.lat) : '';
    $('#f-lon').value = place.lon != null ? String(place.lon) : '';
    $('#f-tz').value = place.tz ? String(place.tz) : 'Asia/Taipei';
  }
  onPlaceChange();
  const hs = ['placidus', 'whole', 'equal'].includes(inp.houseSystem) ? inp.houseSystem : 'placidus';
  const r = $(`input[name="as-hs"][value="${hs}"]`);
  if (r) r.checked = true;
  const dst = inp.dstChoice === 'later' ? 'later' : inp.dstChoice === 'earlier' ? 'earlier' : null;
  $('#f-dst').value = dst || 'earlier';
  $('#dst-wrap').hidden = !dst;
}

function runWithInput(input) {
  fillForm(input);
  return startChart();
}

export const astroApp = { runWithInput, getCurrent: () => cur };
window.astroApp = astroApp;

/* ───────── 畫面 ───────── */

function renderAll() {
  renderOverview();
  renderHouseList();
  renderPlanetTable();
  renderAspectTable();
  renderCycleNotes();
  renderDomainTabs();
  renderCareers();
  renderYearly();
  renderCharts();
  loadVoice();
  $('#r-msg').textContent = '';
}

// 先一次讀完所有容器寬度（只觸發一次版面計算），再一口氣寫入圖表；
// 不要「讀一次、寫一次、再讀」，那樣手機上每張圖都要重排整頁，會卡一秒多
function renderCharts() {
  if (!cur) return;
  const w = {
    elem: widthOf($('#elem-bars'), 320),
    wheel: widthOf($('#wheel'), 340),
    radar: widthOf($('#radar-box'), 320),
    dbar: widthOf($('#dbar-box'), 320),
    star: widthOf($('#house-star'), 330),
    cycle: widthOf($('#cycle-timeline'), 340),
    career: widthOf($('#career-bars'), 320),
  };
  renderElementBars(w);
  renderWheel(w);
  renderDomainCharts(w);
  renderHouseStar(w);
  renderCycleTimeline(w);
  renderCareerBars(w);
}

// 同分並列的寫法：【事業 72】、【財運 72】
const bracketList = (items) => items.map((a) => `【${esc(a.key)} ${a.score}】`).join('、');

function domainExtremes(an) {
  const list = domainList(an);
  const ex = extremes(list.map((a) => a.score));
  return { list, ex, hi: ex.max.map((i) => list[i]), lo: ex.min.map((i) => list[i]) };
}

function chartNotes() {
  const c = cur.chart;
  const notes = [];
  if (c.time && c.time.note) notes.push(`時間換算：${c.time.note}。`);
  if (c.houseNote) notes.push(`${c.houseNote}。`);
  if (c.moonAmbiguous) notes.push(`月亮可能跨座：你出生那天月亮在 ${c.moonAmbiguous.switchLocal} 從${c.moonAmbiguous.from}走進${c.moonAmbiguous.to}，這裡用中午的位置計算；若之後查到出生時間，重新排一次會準得多。`);
  return notes;
}

function renderOverview() {
  const c = cur.chart;
  const an = cur.analysis;
  const o = an.overview;
  const { list, ex, hi, lo } = domainExtremes(an);
  let line = '';
  if (list.length && !ex.flat) {
    line = `你最強的是<b>${bracketList(hi)}</b>${hi.length > 1 ? '（並列）' : ''}，`
      + `最需要留心的是<b class="low">${bracketList(lo)}</b>${lo.length > 1 ? '（並列）' : ''}`;
  } else if (list.length) {
    line = `五個面向都是 ${list[0].score} 分，走勢相對平均，沒有特別偏向哪一面。`;
  }
  const byId = Object.fromEntries(c.planets.map((p) => [p.id, p]));
  const sun = byId.sun;
  const moon = byId.moon;
  const asc = c.angles ? c.angles.asc : null;
  const big3 = [
    ['太陽', sun.sign.name, sun.sign.dms],
    ['月亮', moon.sign.name, moon.sign.dms],
    asc ? ['上升', asc.sign.name, asc.sign.dms] : ['上升', null, null],
  ].map(([k, v, d]) => v
    ? `<div class="b3"><span class="b3-k">${k}</span><span class="b3-v">${esc(v)}</span><span class="b3-d">${esc(d)}</span></div>`
    : `<div class="b3 none"><span class="b3-k">${k}</span><span class="b3-v">要有出生時間才算得出</span></div>`).join('');
  const pats = an.patterns || [];
  const notes = chartNotes();
  const ov = $('#ov');
  ov.dataset.score = o.score;
  ov.dataset.sun = o.big3.sun || '';
  ov.dataset.moon = o.big3.moon || '';
  ov.dataset.asc = o.big3.asc || '';
  ov.dataset.title = o.title;
  ov.innerHTML = `
    <h2 id="ov-h" class="card-h">星盤總覽</h2>
    ${notes.map((n) => `<p class="info-note" role="status">${esc(n)}</p>`).join('')}
    <p class="ov-who">${cur.nick ? `${esc(cur.nick)}，` : ''}你是 <strong>${esc(o.title)}</strong></p>
    <div class="big3" aria-label="三大主星">${big3}</div>
    <div class="ov-meta">
      <span class="pill" style="background:${toneOf(o.level)}">整體 ${o.score} 分・${esc(o.level && o.level.label)}</span>
      <span>元素偏${esc(o.dominant.element)}・模式偏${esc(o.dominant.mode)}</span>
      <span>${esc(HOUSE_SYSTEMS[c.houseSystemUsed] || c.houseSystemUsed)}${c.solarChart ? '（太陽盤）' : ''}</span>
    </div>
    ${o.keywords && o.keywords.length ? `<div class="tags" aria-label="關鍵字">${o.keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</div>` : ''}
    ${line ? `<p class="ov-line">${line}</p>` : ''}
    <figure class="chart-box elem-box"><div class="chart" id="elem-bars"></div>
      <figcaption class="chart-note">元素（火、土、風、水）與模式（本位、固定、變動）的比重：太陽、月亮、上升各算 2，其他行星各算 1</figcaption></figure>
    <details class="more">
      <summary>看星盤詳細解說</summary>
      <div class="prose">${(o.paragraphs || []).map((t) => `<p>${esc(t)}</p>`).join('')}</div>
    </details>
    ${pats.length ? `<details class="more">
      <summary>星盤格局（${pats.length} 個）</summary>
      ${pats.map((p) => `<div class="pat ${esc(p.level)}" data-pattern="${esc(p.id)}"><b>${esc(p.name)}</b>
        <span class="pill" style="background:${PAT_TONE[p.level] || TONE.ok};margin-left:6px">${esc(p.levelLabel || '')}</span>
        ${p.planets && p.planets.length ? `<span class="dim" style="font-size:13px;color:#8a8274;margin-left:6px">${esc(p.planets.map(pName).join('、'))}</span>` : ''}
        <p>${esc(p.desc)}</p></div>`).join('')}
    </details>` : ''}
    <p class="redo"><button type="button" class="btn-text" data-redo>改生日重新排（也可以幫家人排）</button></p>`;
}

function renderElementBars(w) {
  const box = $('#elem-bars');
  if (!box) return;
  const o = cur.analysis.overview;
  box.innerHTML = chartHtml(() => elementBars(o.elements || cur.chart.elements, o.modes || cur.chart.modes, { width: Math.round(clamp(w.elem, 260, 520)), title: '元素與模式比例' }));
}

function renderWheel(w) {
  const box = $('#wheel');
  box.innerHTML = chartHtml(() => wheelChart(cur.chart, { size: Math.round(clamp(w.wheel, 280, 640)), title: '本命星盤' }));
  makeFocusable(box, '.as-planet, .as-house');
}

function renderDomainCharts(w) {
  const an = cur.analysis;
  const { list, ex, hi } = domainExtremes(an);
  const axes = DOMAIN_KEYS.map((k) => ({ key: k, label: k, value: an.domains[k] ? an.domains[k].score : 0 }));
  // 同分就一起標金色；五個都一樣就都不標
  const highlightKey = hi.map((a) => a.key);
  $('#radar').innerHTML = chartHtml(() => radarChart({ axes, size: Math.round(clamp(w.radar, 240, 340)), title: '五大面向分數', highlightKey }));
  const sorted = list.slice().sort((a, b) => b.score - a.score);
  const items = sorted.map((a) => ({ label: a.key, value: a.score, sub: (a.level && a.level.label) + (a.estimated ? '（太陽盤估算）' : '') }));
  $('#domain-bars').innerHTML = chartHtml(() => barChart({ items, width: Math.round(clamp(w.dbar, 260, 520)), max: 100, highlightMax: !ex.flat, title: '五大面向分數排序' }));
  const cap = $('#dbar-note');
  if (cap) {
    cap.textContent = ex.flat
      ? '由高到低排序；五個面向同分，所以沒有標金色'
      : hi.length > 1 ? '由高到低排序，金色是分數最高的（同分並列）' : '由高到低排序，金色是分數最高的一項';
  }
}

function topHouseIdx(an, n) {
  return new Set(topWithTies(an.houses.map((h) => h.score), n).map((i) => an.houses[i].index));
}

function renderHouseStar(w) {
  const an = cur.analysis;
  const houses = an.houses.map((h) => ({ index: h.index, name: h.name, theme: h.theme, score: h.score }));
  const want = Math.round(clamp(w.star, 260, 380));
  // 星狀圖會為了放宮名把畫布撐寬，再被縮回容器寬 → 點和字都變小。
  // 先量一次撐寬多少，再用小一點的尺寸重畫，讓實際顯示接近 1:1。
  let svg = chartHtml(() => houseStarChart({ houses, size: want, top: 3, title: '十二宮能量星狀圖' }));
  const vb = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) /);
  const vbW = vb ? Number(vb[1]) : 0;
  if (vbW > w.star + 1) {
    const smaller = Math.max(240, Math.floor(want * (w.star / vbW)));
    if (smaller < want) svg = chartHtml(() => houseStarChart({ houses, size: smaller, top: 3, title: '十二宮能量星狀圖' }));
  }
  const box = $('#house-star');
  box.innerHTML = svg;
  makeFocusable(box, '[data-house]');
}

function renderHouseList() {
  const an = cur.analysis;
  const top = topHouseIdx(an, 3);
  $('#house-list').innerHTML = an.houses.map((h) => `<button type="button" class="pl-btn${top.has(h.index) ? ' top' : ''}" data-house="${h.index}" data-score="${h.score}" aria-label="${esc(h.name)}・${esc(h.theme)} ${h.score} 分，看詳解">
      <span class="pl-n"><i class="dot" aria-hidden="true"></i>${esc(h.name)}<small>・${esc(h.theme)}</small></span><span class="pl-s">${h.score}</span></button>`).join('');
}

/* ───────── 行星表、相位表 ───────── */

function dignityHtml(d) {
  if (!d) return '';
  const weak = d === 'detriment' || d === 'fall';
  return `<span class="dig${weak ? ' weak' : ''}">${esc(DIGNITY_NAMES[d] || d)}</span>`;
}

function renderPlanetTable() {
  const c = cur.chart;
  const an = cur.analysis;
  const rows = an.planets.map((p) => `<tr class="row-btn" tabindex="0" role="button" data-planet="${esc(p.id)}" data-sign="${esc(p.sign)}" data-house="${p.house || ''}" data-retro="${p.retro ? 1 : 0}" data-dms="${esc(p.dms)}" aria-label="${esc(p.name)} ${esc(p.sign)} ${esc(p.dms)}${p.house ? `，${esc(hName(p.house))}` : ''}，看解說">
      <td class="p-name">${esc(p.name)}</td>
      <td>${esc(p.sign)}</td>
      <td class="num">${esc(p.dms)}</td>
      <td>${p.house ? esc(hName(p.house)) : '<span class="dim">—</span>'}</td>
      <td>${dignityHtml(p.dignity)}${p.retro ? '<span class="retro">逆行</span>' : ''}${!p.dignity && !p.retro ? '<span class="dim">—</span>' : ''}</td>
    </tr>`);
  if (c.angles) {
    for (const [id, label] of [['asc', '上升'], ['mc', '天頂'], ['dsc', '下降'], ['ic', '天底']]) {
      const a = c.angles[id];
      rows.push(`<tr class="axis" data-axis="${id}" data-sign="${esc(a.sign.name)}" data-dms="${esc(a.sign.dms)}"><td class="p-name">${label}</td><td>${esc(a.sign.name)}</td><td class="num">${esc(a.sign.dms)}</td><td class="dim">四軸</td><td class="dim">—</td></tr>`);
    }
  }
  $('#planet-table').innerHTML = `<thead><tr><th>行星</th><th>星座</th><th>度數</th><th>宮位</th><th>狀態</th></tr></thead><tbody>${rows.join('')}</tbody>`;
}

function renderAspectTable() {
  const an = cur.analysis;
  const all = an.aspects || [];
  const shown = aspectsAll ? all : all.slice(0, ASPECTS_SHOWN);
  const tbl = $('#aspect-table');
  if (!all.length) {
    tbl.innerHTML = '<tbody><tr><td class="dim">這張星盤在容許度內沒有相位，行星各自獨立運作，比較不會互相牽動。</td></tr></tbody>';
    $('#btn-aspects-all').hidden = true;
    return;
  }
  tbl.innerHTML = `<thead><tr><th>行星</th><th>相位</th><th>行星</th><th>容許度</th><th>狀態</th></tr></thead><tbody>${shown.map((a) => `
    <tr data-a="${esc(a.a)}" data-b="${esc(a.b)}" data-type="${esc(a.type)}" data-orb="${a.orb}">
      <td class="p-name">${esc(a.aName)}</td>
      <td class="${ASPECT_CLS[a.type] || ''}">${esc(a.name)}</td>
      <td class="p-name">${esc(a.bName)}</td>
      <td class="num">${Number(a.orb).toFixed(2)}°</td>
      <td class="dim">${a.applying ? '入相' : '出相'}</td>
    </tr>${a.text ? `<tr class="asp-text"><td colspan="5">${esc(a.text)}</td></tr>` : ''}`).join('')}</tbody>`;
  const btn = $('#btn-aspects-all');
  btn.hidden = all.length <= ASPECTS_SHOWN;
  btn.textContent = aspectsAll ? `只看前 ${ASPECTS_SHOWN} 條` : `看全部 ${all.length} 條相位`;
  btn.setAttribute('aria-expanded', String(aspectsAll));
}

/* ───────── 人生週期 ───────── */

function renderCycleTimeline(w) {
  const an = cur.analysis;
  const box = $('#cycle-timeline');
  box.innerHTML = chartHtml(() => cycleTimeline({ cycles: an.cycles || [], currentAge: an.age, width: Math.round(clamp(w.cycle, 300, 980)), title: '人生週期時間軸' }));
  makeFocusable(box, '[data-cycle]');
}

function renderCycleNotes() {
  const an = cur.analysis;
  const cycles = an.cycles || [];
  const age = Number.isFinite(an.age) ? an.age : null;
  const notes = [];
  const gold = '<i class="sw" style="background:#b8860b" aria-hidden="true"></i>';
  const ink = '<i class="sw" style="background:#23211d" aria-hidden="true"></i>';
  const blue = '<i class="sw" style="background:#256abf" aria-hidden="true"></i>';
  const seg = (c) => `${esc(c.name)}（${c.ageFrom}～${c.ageTo} 歲）`;
  const link = (c) => `<button type="button" class="btn-text" data-cycle="${esc(c.id)}">${seg(c)}</button>`;
  if (age !== null) {
    const now = cycles.filter((c) => c.status === 'now');
    const next = cycles.find((c) => c.status === 'future');
    const prev = cycles.filter((c) => c.status === 'past').slice(-1)[0];
    if (now.length) {
      for (const c of now) notes.push(`<li>${gold}<span><span class="k">你現在 ${age} 歲</span> 正走 ${link(c)}：${esc(c.text)}</span></li>`);
    } else {
      notes.push(`<li>${ink}<span><span class="k">你現在 ${age} 歲</span> 目前不在任何週期裡，是相對平穩、可以累積的一段。${prev ? `上一段是 ${link(prev)}。` : ''}</span></li>`);
    }
    if (next) notes.push(`<li>${blue}<span><span class="k">接下來</span> ${link(next)}，西元 ${next.yearFrom}～${next.yearTo} 年：${esc(c1(next.text))}</span></li>`);
  }
  const ul = $('#cycle-notes');
  ul.dataset.age = age === null ? '' : age;
  ul.dataset.now = cycles.filter((c) => c.status === 'now').map((c) => c.id).join(',');
  ul.innerHTML = notes.join('') + '<li class="fine"><span>年齡是實歲。每個週期的年齡段是依行星公轉週期算的通用區間，每個人都會經過，早一年晚一年都正常。</span></li>';
}

function renderCareerBars(w) {
  const box = $('#career-bars');
  if (!box) return;
  const top = (cur.analysis.careers && cur.analysis.careers.top) || [];
  if (!top.length) { box.innerHTML = ''; return; }
  const items = top.map((c) => ({ label: c.category, value: c.score }));
  box.innerHTML = chartHtml(() => barChart({ items, width: Math.round(clamp(w.career, 260, 520)), max: 100, highlightMax: true, title: `適合的工作類型（前 ${top.length} 名）` }));
}

/* ───────── 詳解（底部彈出層）：行星、宮位、週期 ───────── */

function onDetailClick(e) {
  const t = e.target.closest ? e.target.closest('[data-planet],[data-house],[data-cycle]') : null;
  if (!t || !cur) return;
  if (t.hasAttribute('data-planet')) openPlanet(t.getAttribute('data-planet'));
  else if (t.hasAttribute('data-house')) openHouse(Number(t.getAttribute('data-house')));
  else if (t.hasAttribute('data-cycle')) openCycle(t.getAttribute('data-cycle'));
}

function openPlanet(id) {
  const p = cur.analysis.planets.find((x) => x.id === id);
  if (!p) return;
  const meta = [
    `${p.sign} ${p.dms}`,
    p.house ? `落在${hName(p.house)}（${esc(cur.analysis.houses[p.house - 1].theme)}）` : '沒有出生時間，宮位不顯示',
    p.dignity ? DIGNITY_NAMES[p.dignity] : '',
    p.retro ? '逆行' : '',
  ].filter(Boolean).join('・');
  showSheet(`${p.name}・${p.sign}`, `
    <p class="sh-meta">${meta}</p>
    ${p.theme ? `<p><span class="pill soft">${esc(p.theme)}</span></p>` : ''}
    ${p.house ? `<div class="sh-chips"><button type="button" data-house="${p.house}">看${esc(hName(p.house))}的詳解</button></div>` : ''}
    <div class="prose">${(p.paragraphs || []).map((t) => `<p>${esc(t)}</p>`).join('') || '<p>這一顆沒有另外的解說文字。</p>'}</div>`);
}

function openHouse(n) {
  const h = cur.analysis.houses.find((x) => x.index === n);
  if (!h) return;
  const chips = (h.planets || []).map((id) => `<button type="button" data-planet="${esc(id)}">${esc(pName(id))}</button>`).join('') || '<span class="none">這一宮沒有行星（空宮），看守護星就好</span>';
  showSheet(`${h.name}・${h.theme}（${h.alias}）`, `
    <p class="sh-meta">宮頭在${esc(h.cuspSign)} ${esc(h.cuspDms)}・守護星${esc(h.rulerName)}落在${esc(hName(h.rulerHouse))}${cur.chart.solarChart ? '・太陽盤估算' : ''}</p>
    <p><span class="pill" style="background:${toneOf(h.level)}">${h.score} 分・${esc(h.level && h.level.label)}</span></p>
    <div class="sh-chips"><span class="none" style="font-weight:600;color:#6f6759">宮內行星</span>${chips}</div>
    <div class="prose">${(h.paragraphs || []).map((t) => `<p>${esc(t)}</p>`).join('')}</div>
    ${n === 4 ? '<p class="soft-cta">想知道你心中理想的家長什麼樣？<button type="button" class="btn-text" data-goto="cta">可以找阿良聊聊</button></p>' : ''}`);
}

function openCycle(id) {
  const c = (cur.analysis.cycles || []).find((x) => x.id === id);
  if (!c) return;
  showSheet(`${c.name}`, `
    <p class="sh-meta">${c.ageFrom}～${c.ageTo} 歲・西元 ${c.yearFrom}～${c.yearTo} 年・${esc(c.planetName)}週期・${CYCLE_STATUS[c.status] || ''}</p>
    <div class="prose"><p>${esc(c.text)}</p></div>
    <div class="box act"><h3>這一段可以做的事</h3><p>${esc(c.advice)}</p></div>`);
}

function showSheet(title, bodyHtml) {
  // 提示框不要浮在彈出層上面
  try { if (detach.tips && detach.tips.hide) detach.tips.hide(); } catch { /* 忽略 */ }
  // 標題與 × 在固定不動的頂列（捲到底也看得到），內文最後再放一顆「關閉」
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = `${bodyHtml}<button type="button" class="btn-ghost sh-close" data-close>關閉</button>`;
  const sheet = $('#sheet');
  if (sheet.hidden) lastSheetFocus = document.activeElement;
  sheet.hidden = false;
  document.body.classList.add('no-scroll');
  const panel = $('.sheet-panel', sheet);
  panel.scrollTop = 0;
  try { panel.focus({ preventScroll: true }); } catch { panel.focus(); }
}

function closeSheet() {
  const sheet = $('#sheet');
  if (sheet.hidden) return;
  sheet.hidden = true;
  document.body.classList.remove('no-scroll');
  if (lastSheetFocus && typeof lastSheetFocus.focus === 'function') {
    try { lastSheetFocus.focus({ preventScroll: true }); } catch { /* 忽略 */ }
  }
  lastSheetFocus = null;
}

function onSheetKey(e) {
  const sheet = $('#sheet');
  if (sheet.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    // 焦點留在彈出層裡
    const panel = $('.sheet-panel', sheet);
    const f = $$('button, a[href], [tabindex]:not([tabindex="-1"])', panel);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
}

/* ───────── 五大面向詳解（分頁） ───────── */

function renderDomainTabs() {
  const an = cur.analysis;
  $('#domain-tabs').innerHTML = DOMAIN_KEYS.filter((k) => an.domains[k]).map((k) => {
    const on = k === domainKey;
    return `<button type="button" class="tab" role="tab" id="tab-${esc(k)}" data-domain="${esc(k)}" data-score="${an.domains[k].score}" aria-selected="${on}" aria-controls="domain-body" tabindex="${on ? 0 : -1}">${esc(k)}<small>${an.domains[k].score} 分</small></button>`;
  }).join('');
  renderDomainBody();
}

function selectDomain(k, focus) {
  if (!cur || !cur.analysis.domains[k]) return;
  domainKey = k;
  $$('#domain-tabs .tab').forEach((b) => {
    const on = b.getAttribute('data-domain') === k;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  renderDomainBody();
}

function onTabKey(e) {
  const keys = DOMAIN_KEYS.filter((k) => cur && cur.analysis.domains[k]);
  const i = keys.indexOf(domainKey);
  let n = -1;
  if (e.key === 'ArrowRight') n = (i + 1) % keys.length;
  else if (e.key === 'ArrowLeft') n = (i - 1 + keys.length) % keys.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = keys.length - 1;
  if (n < 0) return;
  e.preventDefault();
  selectDomain(keys[n], true);
}

function renderDomainBody() {
  const a = cur.analysis.domains[domainKey];
  const body = $('#domain-body');
  if (!a) { body.innerHTML = ''; return; }
  body.setAttribute('aria-labelledby', `tab-${domainKey}`);
  body.dataset.domain = a.key;
  body.dataset.score = a.score;
  const paras = a.paragraphs || [];
  const head = paras.slice(0, 2);
  const rest = paras.slice(2);
  const inside = (a.planetNames || []).length ? `宮內行星：${esc(a.planetNames.join('、'))}` : '宮內沒有行星（看守護星）';
  body.innerHTML = `
    <div class="asp-head">
      <span class="t">${esc(a.key)}</span>
      <span class="sc" style="color:${toneOf(a.level)}">${a.score}<small>分</small></span>
      <span class="pill" style="background:${toneOf(a.level)}">${esc(a.level && a.level.label)}</span>
      ${a.estimated ? '<span class="pill soft">太陽盤估算</span>' : ''}
    </div>
    <p class="asp-meta">主看${esc(a.mainHouse)}・${esc(a.mainTheme)}｜守護星${esc(a.rulerName)}落在${esc(hName(a.rulerHouse))}｜${inside}</p>
    <div class="prose">${head.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
    ${rest.length ? `<details class="more"><summary>看完整解說（還有 ${rest.length} 段）</summary><div class="prose">${rest.map((t) => `<p>${esc(t)}</p>`).join('')}</div></details>` : ''}
    <div class="two">
      <div class="box good"><h3>優勢</h3><ul>${(a.strengths || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="box risk"><h3>風險</h3><ul>${(a.risks || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div>
    <div class="box act"><h3>現在可以做的事</h3><ol>${(a.actions || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
    ${a.key === '家庭' ? '<p class="soft-cta">想知道你心中理想的家長什麼樣？<button type="button" class="btn-text" data-goto="cta">可以找阿良聊聊</button></p>' : ''}
    ${(a.refs || []).length ? `<details class="more"><summary>一起參考的宮位</summary><ul class="refs">
      ${a.refs.map((r) => `<li><button type="button" data-house="${r.index}">${esc(r.house)}</button><span>${esc(r.theme)}</span><span>${esc((r.planetNames || []).join('、') || '空宮')}</span><span class="r-s">${r.score}（${esc(r.level && r.level.label)}）</span></li>`).join('')}
    </ul></details>` : ''}`;
}

/* ───────── 適合的工作 ───────── */

function renderCareers() {
  const c = cur.analysis.careers || { top: [], all: [], avoid: [] };
  const top = c.top || [];
  // 名次照分數算（同分同名次），跟長條圖「同分都金色」一致
  const rankOf = (r) => 1 + top.filter((x) => x.score > r.score).length;
  const sameScore = (r) => top.filter((x) => x.score === r.score).length > 1;
  const tied = top.filter((x) => rankOf(x) === 1).length > 1;
  const el = $('#careers');
  el.dataset.top = top.map((r) => `${r.category}:${r.score}`).join(',');
  el.innerHTML = `
    <h2 id="car-h" class="card-h">適合的工作</h2>
    <p class="card-sub">依太陽星座、天頂星座、第十宮／第六宮／第二宮的行星，以及水星、火星、土星的落座加權排序。</p>
    ${top.length ? `<figure class="chart-box"><div class="chart" id="career-bars"></div>
      <figcaption class="chart-note">前 ${top.length} 類，${tied ? '金色是分數最高的（同分並列）' : '金色是分數最高的一類'}</figcaption></figure>
    <ol class="jobs">
      ${top.map((r) => `<li class="${rankOf(r) === 1 ? 'top' : ''}" data-category="${esc(r.category)}" data-score="${r.score}">
        <div class="j-h"><span class="j-rank">${sameScore(r) ? '並列 ' : ''}${rankOf(r)}</span><span class="j-cat">${esc(r.category)}</span><span class="j-sc">${r.score} 分</span></div>
        <p class="j-list">${esc((r.jobs || []).join('、'))}</p>
        <p class="j-why">${esc(r.reason)}</p></li>`).join('')}
    </ol>` : '<p class="card-sub">這張星盤沒有明顯對應的行業類型，重點在於選一個能長期累積的領域。</p>'}
    ${(c.avoid || []).length ? `<div class="box risk"><h3>建議避開</h3><ul>${c.avoid.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`;
}

/* ───────── 今年行運 ───────── */

function renderYearly() {
  const y = cur.analysis.year;
  const el = $('#yearly');
  if (!y) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.dataset.year = y.year;
  el.dataset.age = y.age;
  el.dataset.jupiterHouse = y.jupiterHouse;
  el.dataset.saturnHouse = y.saturnHouse;
  const age = Number.isFinite(y.age) ? y.age : null;
  const aspectTransits = (y.transits || []).filter((t) => t.kind === 'aspect');
  el.innerHTML = `
    <h2 id="yr-h" class="card-h">${esc(y.year)} 年行運</h2>
    <p class="card-sub">看今年木星（機會、擴張）與土星（責任、收斂）走到你星盤的哪一宮、跟本命的太陽、月亮、上升有沒有相位。${y.estimated ? '不知道出生時間，落宮用太陽盤估算，只看星座層級的大方向。' : ''}</p>
    <p class="y-lead">${age !== null ? `今年 ${age} 歲，` : ''}木星在你的<b>${esc(hName(y.jupiterHouse))}</b>（${esc(y.jupiterSign || '')}），土星在你的<b>${esc(hName(y.saturnHouse))}</b>（${esc(y.saturnSign || '')}）。</p>
    <div class="y-grid">
      <div class="y-cell"><span class="k">木星（機會）</span><span class="v">${esc(hName(y.jupiterHouse))}</span><span class="s">${esc(cur.analysis.houses[y.jupiterHouse - 1].theme)}</span></div>
      <div class="y-cell"><span class="k">土星（課題）</span><span class="v">${esc(hName(y.saturnHouse))}</span><span class="s">${esc(cur.analysis.houses[y.saturnHouse - 1].theme)}</span></div>
      ${aspectTransits.map((t) => `<div class="y-cell"><span class="k">${esc(t.planetName)}${esc(t.typeName || '')}</span><span class="v">本命${esc(t.targetName)}</span><span class="s">容許 ${Number(t.orb).toFixed(1)}°</span></div>`).join('')}
    </div>
    ${(y.notes || []).map((n) => `<div class="pat ${n.type === '課題' ? 'warn' : ''}"><b>${esc(n.type)}</b><p>${esc(n.text)}</p></div>`).join('')}
    ${(y.paragraphs || []).length ? `<details class="more"><summary>看今年行運完整說明</summary><div class="prose">${y.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}</div></details>` : ''}
    <p class="soft-cta">想知道今年適不適合買房、換屋？<button type="button" class="btn-text" data-goto="cta">可以找阿良聊聊</button></p>`;
}

/* ───────── 完整報告（Blob 開新分頁） ───────── */

function openReport() {
  const msgEl = $('#r-msg');
  msgEl.className = 'r-msg';
  msgEl.textContent = '';
  if (!cur) return;
  let html;
  try {
    // wording：預設網頁版字樣；本機殼（desk.js）會放一份「本機」字樣在 window.__astroReportWording
    html = renderReport(cur.chart, cur.analysis, { anonymous: $('#r-anon').checked, wording: window.__astroReportWording || null });
  } catch (e) {
    console.warn('報告產生失敗', e && e.message);
    msgEl.className = 'r-msg err';
    msgEl.textContent = '報告產生失敗，請重新排盤後再試一次。';
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const w = window.open(url, '_blank');
  if (w) {
    try { w.opener = null; } catch { /* 忽略 */ }
    msgEl.textContent = '報告已在新分頁打開。要存成 PDF：在報告頁按列印，印表機選「另存為 PDF」。';
  } else {
    msgEl.innerHTML = `瀏覽器擋掉了新分頁。<a href="${esc(url)}" target="_blank" rel="noopener">點這裡打開報告</a>`;
  }
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}

/* ───────── 語音解說（speak.js） ───────── */

const V = { speaker: null, ready: false, chapter: 0, seg: -1, net: false, supported: false, reason: '' };

function vMsg(text, isErr) {
  const el = $('#v-msg');
  el.textContent = text || '';
  el.className = 'v-msg' + (isErr ? ' err' : '');
}

function vState() {
  try {
    const s = V.speaker && V.speaker.state();
    if (s && typeof s === 'object') return s;
  } catch { /* 忽略 */ }
  return { status: 'idle', chapter: V.chapter, seg: V.seg };
}

function initVoice() {
  try {
    V.speaker = createSpeaker({
      onState: (s) => {
        if (s && typeof s === 'object') {
          if ('networkVoice' in s) V.net = !!s.networkVoice;
          if (typeof s.reason === 'string' && hasCjk(s.reason)) V.reason = s.reason;
          const becameReady = s.ready === true && !V.ready;
          const supChanged = typeof s.supported === 'boolean' && s.supported !== V.supported;
          if (s.ready === true) V.ready = true;
          if (becameReady || supChanged) { refreshVoiceSupport(); return; }
        }
        syncVoice();
      },
      onSegment: (a, b) => {
        let ch;
        let sg;
        if (a && typeof a === 'object') {
          ch = a.chapter ?? a.chapterIndex;
          sg = a.seg ?? a.segIndex ?? a.segment;
        } else { ch = a; sg = b; }
        if (Number.isInteger(ch) && Number.isInteger(sg)) setVoicePos(ch, sg);
      },
      onError: (e) => vMsg(typeof e === 'string' ? e : (e && hasCjk(e.message) ? e.message : '語音播放出了問題，請再按一次播放。'), true),
    });
  } catch (e) {
    console.warn('語音初始化失敗', e && e.message);
    V.speaker = null;
  }

  $('#v-play').addEventListener('click', onPlay);
  $('#v-prev').addEventListener('click', () => stepChapter(-1));
  $('#v-next').addEventListener('click', () => stepChapter(1));
  $('#v-rate').addEventListener('change', (e) => {
    try { V.speaker && V.speaker.setRate(Number(e.target.value)); } catch { /* 忽略 */ }
  });
  $('#v-voice').addEventListener('change', (e) => {
    const id = e.target.value;
    try { V.speaker && V.speaker.setVoice(id); } catch { /* 忽略 */ }
    updateNetNote();
  });
  $('#v-chapters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ch]');
    if (!b || !V.speaker) return;
    const i = Number(b.getAttribute('data-ch'));
    V.chapter = i;
    V.seg = -1;
    renderVoiceText();
    try { V.speaker.play(i, 0); } catch (err) { vMsg('語音播放出了問題，請再按一次播放。', true); }
    syncVoice();
  });
  $('#v-text').addEventListener('click', (e) => {
    const s = e.target.closest('[data-seg]');
    if (!s || !V.speaker) return;
    try { V.speaker.play(V.chapter, Number(s.getAttribute('data-seg'))); } catch { /* 忽略 */ }
    syncVoice();
  });

  // 很多瀏覽器的聲音清單要等一下才出來；等 2 秒多再做最後判定
  setTimeout(() => { V.ready = true; refreshVoiceSupport(); }, 2300);
  refreshVoiceSupport();
}

function unsupportedReason() {
  if (V.reason) return `${V.reason}上面的文字分析一樣完整。`;
  if (!('speechSynthesis' in window)) return '這個瀏覽器沒有內建語音朗讀，所以沒辦法念給你聽。可以改用 Chrome、Edge 或 Safari 打開這一頁；上面的文字分析一樣完整。';
  return '這台裝置找不到中文語音，所以沒辦法念給你聽。可以到手機或電腦的設定裡加裝「中文（台灣）」語音，再重新整理這一頁；上面的文字分析一樣完整。';
}

function refreshVoiceSupport() {
  let ok = false;
  try { ok = !!(V.speaker && V.speaker.supported()); } catch { ok = false; }
  V.supported = ok;
  const ui = $('#v-ui');
  const un = $('#v-unsup');
  if (!cur || !cur.narration) {
    if (cur) {
      ui.hidden = true;
      un.hidden = false;
      un.textContent = '這次的語音講稿沒有產生成功，其他分析不受影響。';
    }
    return;
  }
  if (ok) {
    ui.hidden = false;
    un.hidden = true;
    fillVoices();
    $('#v-play').disabled = false;
    if ($('#v-msg').textContent === '正在準備語音…') vMsg('');
  } else if (!V.ready) {
    ui.hidden = false;
    un.hidden = true;
    $('#v-play').disabled = true;
    vMsg('正在準備語音…');
  } else {
    ui.hidden = true;
    un.hidden = false;
    un.textContent = unsupportedReason();
  }
  syncVoice();
}

function fillVoices() {
  let list = [];
  try { list = V.speaker.voices() || []; } catch { list = []; }
  const sel = $('#v-voice');
  const keep = sel.value;
  sel.innerHTML = list.map((v) => `<option value="${esc(v.id)}" data-local="${v.local ? 1 : 0}">${v.local ? '裝置內建' : '線上'}・${esc(v.name)}</option>`).join('');
  if (keep && list.some((v) => String(v.id) === keep)) sel.value = keep;
  $('#v-voice-wrap').hidden = list.length < 2;
  updateNetNote();
}

function updateNetNote() {
  const opt = $('#v-voice').selectedOptions && $('#v-voice').selectedOptions[0];
  const selNet = opt ? opt.getAttribute('data-local') === '0' : false;
  $('#v-net').hidden = !(V.net || selNet);
}

function loadVoice() {
  V.chapter = 0;
  V.seg = -1;
  const n = cur && cur.narration;
  if (n && V.speaker) {
    try { V.speaker.load(n); } catch (e) { console.warn('講稿載入失敗', e && e.message); }
  }
  const mins = n ? Math.max(1, Math.round((n.estSeconds || 0) / 60)) : 0;
  $('#v-intro').textContent = n
    ? `用你裝置內建的語音，把這份星盤分析念給你聽，全部大約 ${mins} 分鐘。可以直接點章節或句子跳著聽。`
    : '用你裝置內建的語音，把這份分析念給你聽。';
  vMsg('');
  renderVoiceChapters();
  renderVoiceText();
  refreshVoiceSupport();
}

function renderVoiceChapters() {
  const n = cur && cur.narration;
  $('#v-chapters').innerHTML = n ? n.chapters.map((c, i) =>
    `<button type="button" class="v-chip${i === V.chapter ? ' on' : ''}" data-ch="${i}">${esc(c.title)}</button>`).join('') : '';
}

function renderVoiceText() {
  const n = cur && cur.narration;
  const ch = n && n.chapters[V.chapter];
  const box = $('#v-text');
  box.innerHTML = ch ? ch.segments.map((s, i) =>
    `<span class="v-seg${i === V.seg ? ' now' : ''}" data-seg="${i}">${esc(s.text)}</span>`).join('') : '';
  box.scrollTop = 0;
  $$('#v-chapters .v-chip').forEach((b) => b.classList.toggle('on', Number(b.getAttribute('data-ch')) === V.chapter));
}

function setVoicePos(ch, seg) {
  const n = cur && cur.narration;
  if (!n || !n.chapters[ch]) return;
  if (ch !== V.chapter) {
    V.chapter = ch;
    V.seg = seg;
    renderVoiceText();
  } else {
    V.seg = seg;
  }
  const box = $('#v-text');
  $$('.v-seg.now', box).forEach((x) => x.classList.remove('now'));
  const el = $(`.v-seg[data-seg="${seg}"]`, box);
  if (el) {
    el.classList.add('now');
    // 只捲動講稿框本身，不要把整頁拉走
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop + 8 || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = Math.max(0, top - 40);
  }
  const chip = $(`#v-chapters .v-chip[data-ch="${ch}"]`);
  if (chip) {
    const wrap = $('#v-chapters');
    const left = chip.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft;
    if (left < wrap.scrollLeft || left + chip.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = Math.max(0, left - 16);
  }
}

function syncVoice() {
  const st = vState();
  const play = $('#v-play');
  const label = st.status === 'playing' ? '暫停' : st.status === 'paused' ? '繼續' : st.status === 'ended' ? '重新播放' : '播放';
  play.textContent = label;
  play.setAttribute('aria-pressed', String(st.status === 'playing'));
  if ((st.status === 'playing' || st.status === 'paused') && Number.isInteger(st.chapter) && Number.isInteger(st.seg)) {
    if (st.chapter !== V.chapter || st.seg !== V.seg) setVoicePos(st.chapter, st.seg);
  }
  if (st.status === 'ended') {
    $$('#v-text .v-seg.now').forEach((x) => x.classList.remove('now'));
    V.seg = -1;
  }
  const total = cur && cur.narration ? cur.narration.chapters.length : 0;
  const idle = st.status !== 'playing' && st.status !== 'paused';
  $('#v-prev').disabled = idle && V.chapter <= 0;
  $('#v-next').disabled = idle && V.chapter >= total - 1;
  updateNetNote();
}

// 要在點擊事件裡「同步」呼叫 play()，iOS 才肯出聲
function onPlay() {
  if (!V.speaker || !cur || !cur.narration) return;
  const st = vState();
  vMsg('');
  try {
    if (st.status === 'playing') V.speaker.pause();
    else if (st.status === 'paused') V.speaker.resume();
    else if (st.status === 'ended') { V.chapter = 0; V.seg = -1; renderVoiceText(); V.speaker.play(0, 0); }
    else V.speaker.play(V.chapter, V.seg > 0 ? V.seg : 0);
  } catch (e) {
    vMsg('語音播放出了問題，請再按一次播放。', true);
  }
  syncVoice();
}

function stepChapter(dir) {
  if (!cur || !cur.narration) return;
  const st = vState();
  const total = cur.narration.chapters.length;
  if (V.speaker && (st.status === 'playing' || st.status === 'paused')) {
    try { if (dir > 0) V.speaker.next(); else V.speaker.prev(); } catch { /* 忽略 */ }
  } else {
    const n = clamp(V.chapter + dir, 0, total - 1);
    if (n === V.chapter) return;
    V.chapter = n;
    V.seg = -1;
    renderVoiceText();
  }
  syncVoice();
}

/* ───────── 開始 ───────── */

init();
