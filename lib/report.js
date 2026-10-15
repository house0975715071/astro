// 產生可列印、可存檔的完整星盤解析報告（單一 HTML 檔，inline CSS）
// renderReport(chart, analysis, { anonymous=false, web=false })
//   anonymous = true：隱去姓名、生日（各種寫法）、出生時間、出生地、時區、行星／宮頭度數、年齡、西元年
//   wording = { sub, foot, privacy }：預設網頁版字樣；桌面殼把自己的字樣傳進來（見 DEFAULT_WORDING 上方說明）
// 段落結構、note、foot 比照 ../ziwei-desk/lib/report.mjs；所有動態文字一律 esc。
// 不用 Date.now()／new Date()：報告裡的「今年」來自 analysis.year（由呼叫端傳入 today）。

import { PLANET_NAMES, DIGNITY_NAMES, HOUSE_SYSTEMS, houseName, houseLabel } from './astro.js?v=8be9bc87';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toneColor(tone) {
  return ({ great: '#b8860b', good: '#2e7d5b', ok: '#4a5568', warn: '#b7791f', bad: '#9b2c2c' })[tone] || '#4a5568';
}

const PATTERN_COLOR = { great: '#b8860b', good: '#2e7d5b', mixed: '#b7791f', warn: '#9b2c2c', bad: '#9b2c2c' };
const PATTERN_LABEL = { great: '大格局', good: '助力', mixed: '雙面', warn: '留意', bad: '課題' };
const CYCLE_STATUS = { past: { label: '已經走過', color: '#8a8274' }, now: { label: '現在', color: '#b8860b' }, future: { label: '還沒到', color: '#1a4d8f' } };
const ASPECT_TONE = { conjunction: '#4a5568', sextile: '#2e7d5b', square: '#9b2c2c', trine: '#2e7d5b', opposition: '#b7791f' };

/** 頁尾免責四句（規格書第 7 節），健康那句一定要在 */
// 法定揭露簽名檔（跟網頁頁尾、臉書固定簽名檔同一份，一字不改）：報告會被存成 PDF 轉傳，所以報告裡也要有
export const SIGNATURE = Object.freeze([
  '桃竹苗在地深耕 ‧ 買賣委託歡迎指名中信房屋',
  '經紀業：中信房屋 中原大學加盟店（加盟經營）叁匠開發企業社 91861935',
  '營業員：劉益良(112)登字442586號',
  '經紀人：方維磊(98)桃市經字第001068號',
  '電話：0975-715-071（電話可以加 LINE）｜LINE：@house168168',
]);

export const DISCLAIMER = Object.freeze([
  '星盤是認識自己的一個角度，不是預言，也不是保證；重大決定請配合實際狀況、專業意見與家人共識。',
  '健康、心理相關內容只是傾向提醒，不能取代醫師或心理專業的診斷。若你正處於情緒低潮，可撥打衛福部 1925 安心專線（24 小時免付費）。',
  '分數是為了讓強弱一眼可比，不是吉凶的絕對值。',
  '隱私：生日、出生時間、出生地只在你的手機／電腦裡計算，不會送到任何伺服器；本站不用 cookie、不裝統計或追蹤碼。',
]);

// 預設是網頁版字樣；桌面殼（public/desk.js）用 opts.wording 把「本機」版字樣傳進來。
// 桌面字樣不能寫在這個檔：網頁建置會掃 lib/report.js，出現桌面字樣就拒絕建置。
export const DEFAULT_WORDING = Object.freeze({
  sub: '本報告在你的瀏覽器裡產生，生日與出生資料沒有上傳',
  foot: '星盤 免費排盤　·　排盤核心 astronomy-engine（MIT）　·　生日只在你的瀏覽器裡計算，沒有上傳也沒有儲存',
  privacy: '隱私：生日、出生時間、出生地只在你的手機／電腦裡計算，不會送到任何伺服器；本站不用 cookie、不裝統計或追蹤碼。',
});
const WORDING_KEYS = ['sub', 'foot', 'privacy'];
function pickWording(w) {
  const out = { ...DEFAULT_WORDING };
  if (w && typeof w === 'object') {
    for (const k of WORDING_KEYS) if (typeof w[k] === 'string' && w[k].trim()) out[k] = w[k].replace(/[\r\n<>]/g, ' ').slice(0, 200);
  }
  return out;
}

const planetName = (id) => PLANET_NAMES[id] || (id === 'asc' ? '上升' : id === 'mc' ? '天頂' : String(id || ''));
const dignityName = (d) => (d ? (DIGNITY_NAMES[d] || d) : '');
const num = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '');
const list = (arr) => (Array.isArray(arr) ? arr.filter((x) => x != null && x !== '') : []);

/** 匿名模式下把段落裡可能洩漏時間的寫法拿掉（例：月亮跨座提示裡的 HH:MM） */
function scrub(text, anonymous) {
  const s = String(text ?? '');
  if (!anonymous) return s;
  return s
    .replace(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g, '出生那天')
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, '出生那天')
    .replace(/\d{1,2}:\d{2}/g, '當天某個時間')
    .replace(/\d{4}\s*年/g, '今年')
    .replace(/\d+\s*歲/g, '這個年紀');
}

const paras = (arr, anon) => list(arr).map((t) => `<p>${esc(scrub(t, anon))}</p>`).join('');
const lis = (arr, anon) => list(arr).map((t) => `<li>${esc(scrub(t, anon))}</li>`).join('');
const pill = (level) => (level ? `<span class="pill" style="background:${toneColor(level.tone)}">${esc(level.label)}</span>` : '');
const scorePill = (score, level) => (level ? `<span class="pill" style="background:${toneColor(level.tone)}">${esc(score)} 分　${esc(level.label)}</span>` : '');

/* ---------- 標題區 ---------- */
function headerBlock(chart, an, opt) {
  const input = chart.input || {};
  const callName = opt.anonymous ? '（不具名）' : (input.name || '未命名');
  const big3 = an.overview?.big3 || chart.big3 || {};
  const b3 = [
    ['太陽', big3.sun], ['月亮', big3.moon], ['上升', big3.asc || (chart.solarChart ? '（出生時間不明）' : '')],
  ].map(([k, v]) => `<div class="b3"><span>${k}</span><b>${esc(v || '—')}</b></div>`).join('');

  let birth;
  if (opt.anonymous) {
    birth = '<div class="birth anon">出生資料已隱去：這份報告不顯示姓名、生日、出生時間、出生地與度數，只保留分析內容。</div>';
  } else {
    const place = input.place || {};
    const rows = [
      ['出生日期', input.date],
      ['出生時間', chart.solarChart ? '不知道（宮位以太陽盤估算）' : input.time],
      ['出生地', place.name ? `${place.name}（${num(place.lat, 4)}, ${num(place.lon, 4)}）` : ''],
      ['時區', place.tz ? `${place.tz}${chart.time && typeof chart.time.offsetMin === 'number' ? `　UTC${chart.time.offsetMin >= 0 ? '+' : '−'}${Math.floor(Math.abs(chart.time.offsetMin) / 60)}:${String(Math.abs(chart.time.offsetMin) % 60).padStart(2, '0')}` : ''}` : ''],
      ['宮位制', HOUSE_SYSTEMS[chart.houseSystemUsed] || chart.houseSystemUsed || ''],
    ].filter(([, v]) => v);
    const notes = [chart.time?.note, chart.houseNote].filter(Boolean);
    birth = `<table class="birth"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    ${notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')}`;
  }

  const unknown = chart.solarChart ? '<div class="warnbar">出生時間不明，宮位以太陽盤估算；上升、天頂等四軸不列出，五大面向與行運分數為估算值。</div>' : '';
  const angles = (!opt.anonymous && !chart.solarChart && chart.angles)
    ? `<table class="angles"><thead><tr><th>上升（ASC）</th><th>天頂（MC）</th><th>下降（DSC）</th><th>天底（IC）</th></tr></thead>
      <tbody><tr>${['asc', 'mc', 'dsc', 'ic'].map((k) => `<td>${esc(chart.angles[k]?.sign?.name || '')} ${esc(chart.angles[k]?.sign?.dms || '')}</td>`).join('')}</tr></tbody></table>`
    : '';

  return `<div class="head">
    <div class="c-name">${esc(callName)}</div>
    <div class="c-main">${esc(an.overview?.title || '')}</div>
    <div class="b3row">${b3}</div>
    ${unknown}
    ${birth}
    ${angles}
  </div>`;
}

/* ---------- 一、總覽 ---------- */
function overviewBlock(an, chart, opt) {
  const o = an.overview || {};
  const el = o.elements || chart.elements || {};
  const mo = o.modes || chart.modes || {};
  const elRows = [['火象', el.fire], ['土象', el.earth], ['風象', el.air], ['水象', el.water]];
  const moRows = [['本位', mo.cardinal], ['固定', mo.fixed], ['變動', mo.mutable]];
  const bar = (rows) => {
    const max = Math.max(1, ...rows.map(([, v]) => v || 0));
    return rows.map(([k, v]) => `<div class="bar"><span class="bar-k">${k}</span><span class="bar-t"><i style="width:${Math.round(((v || 0) / max) * 100)}%"></i></span><span class="bar-v">${esc(v ?? 0)}</span></div>`).join('');
  };
  return `<h2>一、總覽</h2>
<div class="stage">
  <div class="stage-h"><b>${esc(o.title || '')}</b>${scorePill(o.score, o.level)}</div>
  <div class="tags">${list(o.keywords).map((k) => `<span>${esc(k)}</span>`).join('')}</div>
  <div class="two">
    <div class="box"><h4>元素比例${o.dominant?.element ? `　·　最強：${esc(o.dominant.element)}` : ''}</h4>${bar(elRows)}</div>
    <div class="box"><h4>模式比例${o.dominant?.mode ? `　·　最強：${esc(o.dominant.mode)}` : ''}</h4>${bar(moRows)}</div>
  </div>
  ${paras(o.paragraphs, opt.anonymous)}
</div>`;
}

/* ---------- 二、五大面向 ---------- */
function domainBlock(d, opt) {
  const est = d.estimated ? '<span class="est">估算</span>' : '';
  const refs = list(d.refs).map((r) => `<tr><td>${esc(r.house)}</td><td>${esc(r.theme)}</td><td>${esc(list(r.planetNames).join('、') || '（空宮）')}</td><td>${esc(r.score)}（${esc(r.level?.label)}）</td></tr>`).join('');
  return `<section class="asp">
    <h3><span class="asp-name">${esc(d.key)}</span>
      <span class="asp-score" style="color:${toneColor(d.level?.tone)}">${esc(d.score)}<small>分</small></span>
      ${pill(d.level)}${est}</h3>
    <p class="asp-meta">主看${esc(d.mainHouse)}・${esc(d.mainTheme)}　·　宮內行星：${esc(list(d.planetNames).join('、') || '無')}　·　守護星${esc(d.rulerName)}落在${esc(houseName(d.rulerHouse))}</p>
    ${paras(d.paragraphs, opt.anonymous)}
    <div class="two">
      <div class="box good"><h4>優勢</h4><ul>${lis(d.strengths, opt.anonymous) || '<li>這個領域沒有特別突出的加分，靠日常經營累積。</li>'}</ul></div>
      <div class="box risk"><h4>風險</h4><ul>${lis(d.risks, opt.anonymous) || '<li>沒有明顯的扣分項，維持現在的節奏就好。</li>'}</ul></div>
    </div>
    <div class="box act"><h4>現在可以做的事</h4><ol>${lis(d.actions, opt.anonymous)}</ol></div>
    <table class="reftab"><thead><tr><th>參考宮位</th><th>看什麼</th><th>宮內行星</th><th>分數</th></tr></thead><tbody>${refs}</tbody></table>
  </section>`;
}

function domainsBlock(an, opt) {
  const ds = Object.values(an.domains || {});
  return `<h2>二、五大面向分析</h2>
<table><thead><tr><th>面向</th><th>分數</th><th>評等</th><th>主看宮位</th><th>宮內行星</th></tr></thead><tbody>
${ds.map((d) => `<tr><td><b>${esc(d.key)}</b></td><td style="color:${toneColor(d.level?.tone)};font-weight:700">${esc(d.score)}${d.estimated ? '（估算）' : ''}</td><td>${esc(d.level?.label)}</td><td>${esc(d.mainHouse)}・${esc(d.mainTheme)}</td><td>${esc(list(d.planetNames).join('、') || '—')}</td></tr>`).join('')}
</tbody></table>
${ds.map((d) => domainBlock(d, opt)).join('')}`;
}

/* ---------- 三、行星表 ---------- */
function planetTable(an, opt) {
  const rows = list(an.planets).map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.sign)}</td>${opt.anonymous ? '' : `<td>${esc(p.dms)}</td>`}<td>${esc(p.house ? houseName(p.house) : '—')}</td><td>${p.retro ? '逆行' : ''}</td><td>${esc(dignityName(p.dignity))}</td></tr>`).join('');
  return `<h2>三、行星位置表</h2>
<table class="ptab"><thead><tr><th>行星</th><th>星座</th>${opt.anonymous ? '' : '<th>度數</th>'}<th>宮位</th><th>逆行</th><th>尊貴</th></tr></thead><tbody>${rows}</tbody></table>
<p class="hint">尊貴只描述行星「發揮的方式」（入廟、擢升、失勢、落陷），不是吉凶。${opt.anonymous ? '匿名報告不顯示度數。' : ''}</p>`;
}

/* ---------- 四、相位表 ---------- */
function aspectTable(an, opt) {
  const rows = list(an.aspects).slice(0, 12);
  if (!rows.length) return '<h2>四、主要相位</h2><p class="hint">這張盤沒有落在容許度內的相位。</p>';
  return `<h2>四、主要相位（前 ${rows.length} 條，依緊密度排序）</h2>
<table class="atab"><thead><tr><th>行星</th><th>相位</th><th>行星</th><th>差距（度）</th><th>趨勢</th><th>說明</th></tr></thead><tbody>
${rows.map((a) => `<tr><td><b>${esc(a.aName || planetName(a.a))}</b></td><td style="color:${ASPECT_TONE[a.type] || '#4a5568'};font-weight:700">${esc(a.name)}</td><td><b>${esc(a.bName || planetName(a.b))}</b></td><td>${esc(num(a.orb))}</td><td>${a.applying ? '入相' : '出相'}</td><td class="atxt">${esc(scrub(a.text || '', opt.anonymous))}</td></tr>`).join('')}
</tbody></table>
<p class="hint">差距越小，這條相位在生活裡的感覺越明顯；入相代表還在靠近，出相代表已經過了最緊的時候。</p>`;
}

/* ---------- 五、格局 ---------- */
function patternBlock(an, opt) {
  const ps = list(an.patterns);
  if (!ps.length) return '<h2>五、星盤格局</h2><p class="hint">這張盤沒有成立的特殊格局，行星各自發揮，重點看五大面向與行星逐顆的說明。</p>';
  return `<h2>五、星盤格局</h2>
${ps.map((p) => `<div class="pat ${esc(p.level)}"><b>${esc(p.name)}</b>　<span class="pill" style="background:${PATTERN_COLOR[p.level] || '#4a5568'}">${esc(p.levelLabel || PATTERN_LABEL[p.level] || p.level)}</span>
  ${list(p.planets).length ? `<span class="pat-pl">相關行星：${esc(list(p.planets).map(planetName).join('、'))}</span>` : ''}
  <p>${esc(scrub(p.desc, opt.anonymous))}</p>
  ${p.effect ? `<p class="hint">影響：${esc(Object.entries(p.effect).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('　'))}</p>` : ''}
</div>`).join('')}`;
}

/* ---------- 六、行星逐顆 ---------- */
function planetsBlock(an, opt) {
  return `<h2>六、行星逐顆說明</h2>
${list(an.planets).map((p) => `<div class="stage">
  <div class="stage-h"><b>${esc(p.name)}</b>
    <span class="meta">${esc(p.sign)}${opt.anonymous ? '' : ` ${esc(p.dms)}`}${p.house ? `　·　${esc(houseName(p.house))}` : ''}${p.retro ? '　·　逆行' : ''}${p.dignity ? `　·　${esc(dignityName(p.dignity))}` : ''}</span></div>
  ${p.theme ? `<p class="hint">${esc(p.theme)}</p>` : ''}
  ${paras(p.paragraphs, opt.anonymous)}
</div>`).join('')}`;
}

/* ---------- 七、宮位逐宮 ---------- */
function housesBlock(an, opt) {
  return `<h2>七、十二宮逐宮明細</h2>
${list(an.houses).map((h) => `<div class="stage">
  <div class="stage-h"><b>${esc(houseLabel(h.index))}</b>${pill(h.level)}<span class="pscore" style="color:${toneColor(h.level?.tone)}">${esc(h.score)}</span></div>
  <p class="hint">宮頭 ${esc(h.cuspSign)}${opt.anonymous ? '' : ` ${esc(h.cuspDms)}`}　·　守護星${esc(h.rulerName)}落在${esc(houseName(h.rulerHouse))}　·　宮內行星：${esc(list(h.planetNames).join('、') || '（空宮）')}</p>
  ${paras(h.paragraphs, opt.anonymous)}
</div>`).join('')}`;
}

/* ---------- 八、適合的工作 ---------- */
function careersBlock(an, opt) {
  const c = an.careers || {};
  return `<h2>八、適合的工作與行業</h2>
<table><thead><tr><th>排名</th><th>類型</th><th>評分</th><th>具體職業</th><th>依據</th></tr></thead><tbody>
${list(c.top).map((x) => `<tr><td>${esc(x.rank)}</td><td><b>${esc(x.category)}</b></td><td style="font-weight:700;color:${x.score >= 85 ? '#b8860b' : '#4a5568'}">${esc(x.score)}</td><td>${esc(list(x.jobs).join('、'))}</td><td>${esc(scrub(x.reason, opt.anonymous))}</td></tr>`).join('')}
</tbody></table>
${list(c.avoid).length ? `<div class="box risk"><h4>建議避開的類型</h4><ul>${lis(c.avoid, opt.anonymous)}</ul></div>` : ''}`;
}

/* ---------- 九、人生週期 ---------- */
function cyclesBlock(an, opt) {
  const cs = list(an.cycles);
  const st = (s) => CYCLE_STATUS[s] || { label: '', color: '#8a8274' };
  const anon = opt.anonymous;
  const ageCol = anon ? '' : '<th>年齡</th><th>年份</th>';
  const rows = cs.map((c) => `<tr class="${c.status === 'now' ? 'now' : ''}"><td><b>${esc(c.name)}</b></td><td>${esc(c.planetName || planetName(c.planet))}</td>${anon ? '' : `<td>${esc(c.ageFrom)}～${esc(c.ageTo)} 歲</td><td>${esc(c.yearFrom)}～${esc(c.yearTo)}</td>`}<td><span class="pill" style="background:${st(c.status).color}">${st(c.status).label}</span></td></tr>`).join('');
  const nowLine = (!anon && typeof an.age === 'number') ? `<p class="hint">你現在 ${esc(an.age)} 歲。</p>` : '';
  return `<h2>九、人生週期</h2>
${nowLine}
<table class="ctab"><thead><tr><th>週期</th><th>行星</th>${ageCol}<th>狀態</th></tr></thead><tbody>${rows}</tbody></table>
${cs.map((c) => `<div class="stage cyc ${esc(c.status)}">
  <div class="stage-h"><b>${esc(c.name)}</b><span class="pill" style="background:${st(c.status).color}">${st(c.status).label}</span>${anon ? '' : `<span class="meta">${esc(c.ageFrom)}～${esc(c.ageTo)} 歲　·　${esc(c.yearFrom)}～${esc(c.yearTo)} 年</span>`}</div>
  <p>${esc(scrub(c.text, anon))}</p>
  ${c.advice ? `<div class="box act"><h4>這個階段的建議</h4><p style="margin:0">${esc(scrub(c.advice, anon))}</p></div>` : ''}
</div>`).join('')}`;
}

/* ---------- 十、今年行運 ---------- */
function yearBlock(an, opt) {
  const y = an.year;
  if (!y) return '';
  const anon = opt.anonymous;
  const title = anon ? '十、今年行運' : `十、${esc(y.year)} 年行運`;
  const est = y.estimated ? '<span class="est">估算</span>' : '';
  const lead = `<p>${anon ? '今年' : `${esc(y.year)} 年`}${!anon && typeof y.age === 'number' ? `（你 ${esc(y.age)} 歲）` : ''}木星走到你的<b>${esc(houseName(y.jupiterHouse))}</b>${y.jupiterSign ? `（${esc(y.jupiterSign)}）` : ''}，土星走到你的<b>${esc(houseName(y.saturnHouse))}</b>${y.saturnSign ? `（${esc(y.saturnSign)}）` : ''}。</p>`;
  return `<h2>${title}${est}</h2>
<div class="stage">
  ${lead}
  ${y.note ? `<p class="hint">${esc(scrub(y.note, anon))}</p>` : ''}
  ${paras(y.paragraphs, anon)}
  ${list(y.notes).length ? `<div class="two">
    <div class="box good"><h4>機會</h4><ul>${lis(list(y.notes).filter((n) => n.type === '機會').map((n) => n.text), anon) || '<li>今年沒有特別突出的機會點，適合穩住基本盤。</li>'}</ul></div>
    <div class="box risk"><h4>課題</h4><ul>${lis(list(y.notes).filter((n) => n.type !== '機會').map((n) => n.text), anon) || '<li>今年沒有特別要注意的課題，把握機會就好。</li>'}</ul></div>
  </div>` : ''}
</div>`;
}

/* ---------- 主函式 ---------- */
export function renderReport(chart, an, opt = {}) {
  const o = { anonymous: !!opt.anonymous };
  if (!chart || !an) throw new Error('renderReport 需要 chart 與 analysis');
  const titleName = o.anonymous ? '星盤解析' : `${chart.input?.name || '星盤'}的星盤解析`;
  const wording = pickWording(opt.wording);
  const sub = wording.sub;
  const baseDay = (!o.anonymous && an.year?.today) ? `　·　行運基準日 ${esc(an.year.today)}` : '';
  const foot = wording.foot;
  const privacy = wording.privacy;

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titleName)}</title>
<style>
/* 報告（列印用）：白底為主，桃紅／金只做標題、分隔線、分數色塊的點綴；跟網頁版方向 C「暮光雙層」同一組顏色。
   列印時背景色預設不會印：分數色塊改白底框線、長條圖用 print-color-adjust 只印那一小條。 */
:root{--ink:#2b1c26;--sub:#654e5c;--line:#ecd6e0;--paper:#fff;--rose:#c2266f;--rose-ink:#a8185c;--wine:#8e1c4a;
  --gold:#b08414;--gold-d:#86620f;--champ:#c9a45c;--tint:#fcf4f7;--accent:#5760c8;--accent2:#8e1c4a;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f6ecf1;color:var(--ink);font:15px/1.85 "Noto Serif TC","Songti TC","PMingLiU",Georgia,"Microsoft JhengHei",serif}
.wrap{max-width:1000px;margin:0 auto;padding:28px 22px 60px;background:var(--paper);box-shadow:0 0 30px rgba(120,30,80,.10);
  border-top:4px solid var(--rose);border-image:linear-gradient(90deg,var(--rose),var(--champ) 60%,#f3e3c0) 1}
h1{font-size:26px;margin:0 0 4px;letter-spacing:3px;color:var(--wine)}
h1::before{content:"✦";color:var(--gold);font-size:.7em;margin-right:10px;vertical-align:.15em}
h2{font-size:20px;margin:34px 0 12px;padding:6px 0 6px 12px;border-left:4px solid var(--rose);border-bottom:1px solid #e9cfdb;
  background:linear-gradient(90deg,#fcf1f6,rgba(252,241,246,0) 70%);color:var(--wine);letter-spacing:1px}
h3{font-size:17px;margin:20px 0 8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--ink)}
h4{font-size:14.5px;margin:0 0 6px;color:var(--accent2)}
p{margin:8px 0}
.hdr-sub{color:var(--sub);font-size:13.5px;margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.head{position:relative;border:1px solid #d9bc7c;background:#fffafc;padding:18px 20px;margin:14px 0 26px;border-radius:10px;
  box-shadow:inset 0 0 0 4px #fffafc,inset 0 0 0 5px rgba(201,164,92,.45)}
.head::before,.head::after{content:"✦";position:absolute;top:8px;font-size:12px;line-height:1;color:var(--gold)}
.head::before{left:11px}
.head::after{right:11px}
.c-name{font-size:22px;font-weight:700;letter-spacing:2px;text-align:center;color:var(--wine)}
.c-main{margin:6px 0 10px;text-align:center;font-size:16px;font-weight:700;color:var(--rose-ink)}
.b3row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
.b3{background:#fff;border:1px solid var(--line);border-top:2px solid var(--champ);padding:8px 10px;text-align:center;border-radius:8px}
.b3 span{display:block;color:var(--sub);font-size:12.5px}
.b3 b{font-size:17px;color:var(--wine)}
.birth{font-size:13.5px;margin:10px 0 0}
.birth th{width:90px;white-space:nowrap}
.birth.anon{border:1px dashed #dcc0cd;padding:8px 12px;color:var(--sub);background:#fff;border-radius:8px}
.angles{font-size:13.5px;margin-top:8px}
.warnbar{background:#fdf3e3;border:1px solid #efd6a6;color:#6f470c;padding:8px 12px;font-size:13.5px;margin:10px 0;border-radius:8px}
.hint{color:var(--sub);font-size:13.5px}
.meta{color:var(--sub);font-size:13.5px;font-weight:400}
.est{display:inline-block;font-size:12px;color:#6f470c;background:#fdf3e3;border:1px solid #efd6a6;padding:0 6px;border-radius:8px;margin-left:6px;vertical-align:middle}
.asp{border:1px solid var(--line);background:#fff;padding:14px 18px;margin:14px 0;border-radius:10px;border-top:2px solid var(--champ)}
.asp-name{font-size:19px;letter-spacing:3px;color:var(--wine)}
.asp-score{font-size:26px;font-weight:700}
.asp-score small{font-size:12px;font-weight:400}
.asp-meta{color:var(--sub);font-size:13.5px;margin:2px 0 10px}
.pill{display:inline-block;padding:2px 10px;border-radius:10px;color:#fff;font-size:12.5px;white-space:nowrap}
/* toneColor 寫在行內的顏色：白字對比不到 4.5、或跟新配色不搭的換深一階（只換色，不改意思；toneColor 改色時這份清單要一起更新） */
.pill[style*="#b8860b"]{background:#86620f !important}
.pill[style*="#b7791f"]{background:#8f5d14 !important}
.pill[style*="#4a5568"]{background:#5c4a66 !important}
.pill[style*="#8a8274"]{background:#6f5a67 !important}
.pill[style*="#1a4d8f"]{background:#3f47a8 !important}
[style*="color:#b8860b"]{color:#86620f !important}
[style*="color:#b7791f"]{color:#8f5d14 !important}
[style*="color:#4a5568"]{color:#5c4a66 !important}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.box{border:1px solid var(--line);padding:10px 12px;border-radius:8px;background:var(--tint)}
.box.good{border-left:4px solid #2e7d5b}
.box.risk{border-left:4px solid #9a1c3a}
.box.act{border-left:4px solid var(--champ);background:#fdf7ea}
.box ul,.box ol{margin:0;padding-left:20px}
.box li{margin:4px 0;font-size:14px}
.bar{display:flex;align-items:center;gap:8px;font-size:13.5px;margin:3px 0}
.bar-k{width:36px;color:var(--sub)}
.bar-t{flex:1;height:8px;background:#f1e2e9;border-radius:4px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar-t i{display:block;height:100%;background:var(--accent);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar-v{width:22px;text-align:right}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13.5px}
th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{background:#fbf0f5;font-weight:600;color:var(--ink)}
.reftab{margin-top:12px}
.atab .atxt{font-size:12.5px;color:#4a3a44}
.ctab tr.now td{background:#fbf1dc}
.stage{border:1px solid var(--line);padding:14px 18px;margin:12px 0;background:#fff;border-radius:10px}
.stage-h{display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap}
.stage-h b{font-size:18px;color:var(--wine)}
.pscore{font-weight:700;font-size:15px}
.tags span{display:inline-block;background:#fbf3df;color:#6e4f08;border:1px solid #e6cf97;padding:1px 9px;border-radius:10px;font-size:12.5px;margin:3px 4px 3px 0}
.pat{border:1px solid var(--line);padding:10px 14px;margin:8px 0;background:#fff;border-left:4px solid var(--champ);border-radius:4px 8px 8px 4px}
.pat.warn,.pat.bad{border-left-color:#9a1c3a}
.pat.mixed{border-left-color:#8f5d14}
.pat.good{border-left-color:#2e7d5b}
.pat b{font-size:15px}
.pat-pl{color:var(--sub);font-size:12.5px;margin-left:8px}
.note{background:var(--tint);border:1px dashed #dcc0cd;padding:10px 14px;font-size:13.5px;color:var(--sub);margin:16px 0;border-radius:8px}
.note b{color:var(--ink)}
.note p{margin:4px 0}
/* 法定簽名檔：淺底金框方塊，第一行酒紅襯線粗體當標題，其餘主字色，至少 14px */
.sign{margin-top:28px;padding:14px 16px;border:1px solid var(--champ);border-radius:10px;background:#fffafc;font-size:14px;line-height:1.75;color:var(--ink);text-align:center}
.sign div:first-child{font-size:15.5px;font-weight:700;color:var(--wine);letter-spacing:1px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #ecd9ae}
.foot{margin-top:18px;padding-top:14px;border-top:1px solid var(--line);color:var(--sub);font-size:12.5px;text-align:center}
@media print{
  body{background:#fff}
  .wrap{box-shadow:none;max-width:100%;padding-top:12px}
  h2{background:none;break-after:avoid}
  .asp,.stage,.pat{break-inside:avoid}
  .pill,.pill[style]{background:#fff !important;color:#000 !important;border:1px solid #888}
  .head,.b3,.asp,.stage,.pat,.box,.note,.birth.anon,.sign,.warnbar,.est,.tags span{background:#fff !important}
  .head{box-shadow:none}
  th,.ctab tr.now td{background:#fff}
  .ctab tr.now td{font-weight:700}
}
@media (max-width:760px){.wrap{padding:16px 12px 40px}.two{grid-template-columns:1fr}.b3row{grid-template-columns:1fr}.asp-name{font-size:17px}table{font-size:12.5px}th,td{padding:4px 5px}.birth th{width:70px}}
</style></head><body><div class="wrap">

<h1>西洋占星 星盤解析</h1>
<div class="hdr-sub">${sub}${baseDay}</div>

${headerBlock(chart, an, o)}

${overviewBlock(an, chart, o)}

${domainsBlock(an, o)}

${planetTable(an, o)}

${aspectTable(an, o)}

${patternBlock(an, o)}

${planetsBlock(an, o)}

${housesBlock(an, o)}

${careersBlock(an, o)}

${cyclesBlock(an, o)}

${yearBlock(an, o)}

<div class="note">
  <b>使用說明</b>：本報告以現代西洋占星的常見論法（十大行星、四軸、十二宮、五大相位、格局、木星土星行運）搭配規則式評分產生。
  <p>${esc(DISCLAIMER[0])}</p>
  <p>${esc(DISCLAIMER[1])}</p>
  <p>${esc(DISCLAIMER[2])}</p>
  <p>${esc(privacy)}</p>
</div>

<div class="sign">${SIGNATURE.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
<div class="foot">${esc(foot)}</div>
</div></body></html>`;
}
