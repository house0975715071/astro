// 公開網頁版：用瀏覽器（裝置）內建語音念講稿
// 規格：docs/web-contract.md 第 5 節。
//
// 原則：
// - 一句一個 utterance（念 segment.speak），念完接下一句；章與章之間停 0.6 秒。
//   避免 Chrome 一次念長段、念到 15 秒左右自己停掉的問題。
// - 聲音清單很多瀏覽器是非同步載入（voiceschanged），最多等 2 秒；還是沒有中文語音就判定不支援。
// - play()／resume() 會在同一個呼叫裡「同步」呼叫 speechSynthesis.speak()，
//   iOS 規定首次播放一定要在使用者點擊的處理函式裡發生。
// - pause() 在部分手機不可靠：暫停＝記住位置＋cancel()，resume() 從那一句重念。
// - 頁面切到背景（visibilitychange → hidden）或關閉（pagehide）時 cancel()。
// - 本模組不畫任何畫面、不連網、不存任何資料；畫面由 app.js 依 onState／onSegment 自己畫。
//
// 回呼：
//   onState(state)   state = { status, chapter, seg, chapters, supported, ready, reason,
//                              networkVoice, voiceId, voiceName, rate }
//   onSegment(chapterIndex, segIndex, segment, chapter)   這一句開始念（拿來把這句亮起來）
//   onError(message, { code, chapter, seg })               message 一律是中文

const RATE_MIN = 0.8;
const RATE_MAX = 1.5;
const CHAPTER_GAP_MS = 600;
const VOICE_WAIT_MS = 2000;
const VOICE_POLL_MS = 250;
const WATCH_MAX_REARM = 3;

const MSG = {
  noApi: '這個瀏覽器不支援語音朗讀，可以改用新版的 Chrome、Edge 或 Safari 再試。',
  noZh: '這台裝置沒有中文語音，所以沒辦法念。可以到裝置的「設定」裡的「文字轉語音」或「語音」下載中文語音後，重新整理這一頁再試。',
  noNarration: '還沒有解說內容，請先排星盤。',
  badNarration: '解說內容的格式不對，沒辦法播放。請重新排盤一次。',
  noSuchVoice: '找不到這個語音，已經維持原本的語音。',
  notAllowed: '瀏覽器擋下了播放，請再按一次「播放」。',
  network: '線上語音連不上網路。請檢查網路，或改選沒有標示「線上」的語音。',
  audioBusy: '裝置的喇叭正被其他程式使用，請先關掉其他聲音再按「播放」。',
  voiceUnavailable: '這個語音目前不能用，請換一個中文語音再試。',
  failed: '這一句念不出來，已經停在這裡；按「播放」可以從這一句重來，或按「下一章」跳過。',
  speakThrow: '瀏覽器的語音功能出了問題，請重新整理這一頁再試。',
};

function errorMessage(code) {
  switch (code) {
    case 'not-allowed': return MSG.notAllowed;
    case 'network': return MSG.network;
    case 'audio-busy':
    case 'audio-hardware': return MSG.audioBusy;
    case 'language-unavailable':
    case 'voice-unavailable':
    case 'synthesis-unavailable': return MSG.voiceUnavailable;
    default: return MSG.failed;
  }
}

function normLang(lang) {
  return String(lang || '').trim().replace(/_/g, '-').toLowerCase();
}
function langParts(lang) {
  return normLang(lang).split('-').filter(Boolean);
}
function isZh(lang) {
  const p = langParts(lang);
  return p.length > 0 && (p[0] === 'zh' || p[0] === 'cmn' || p[0] === 'yue');
}
function isTW(lang) {
  const p = langParts(lang);
  return p.slice(1).includes('tw');
}
// 粵語念國語講稿會變廣東話，排在其他中文的後面
function isCantonese(lang) {
  const p = langParts(lang);
  return p[0] === 'yue' || p.slice(1).includes('hk') || p.slice(1).includes('mo');
}

function clampRate(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return 1;
  const c = Math.min(RATE_MAX, Math.max(RATE_MIN, n));
  return Math.round(c * 100) / 100;
}

export function createSpeaker({ onState, onSegment, onError } = {}) {
  const g = typeof window !== 'undefined' && window ? window : globalThis;
  let synth = null;
  try { synth = g.speechSynthesis || null; } catch { synth = null; }
  const Utter = typeof g.SpeechSynthesisUtterance === 'function' ? g.SpeechSynthesisUtterance : null;
  const doc = g.document || null;
  const api = !!(synth && Utter && typeof synth.speak === 'function' && typeof synth.cancel === 'function');

  let cbState = typeof onState === 'function' ? onState : null;
  let cbSegment = typeof onSegment === 'function' ? onSegment : null;
  let cbError = typeof onError === 'function' ? onError : null;

  let list = [];          // 排序好的中文語音 [{ id, name, lang, local, raw }]
  let voice = null;       // 目前選的語音（list 裡的一筆）
  let userPicked = false; // 使用者自己選過語音
  let ready = false;      // 語音清單已經有結論（找到中文語音，或等滿 2 秒）
  let reason = '';        // 不支援的原因（中文）
  let rate = 1;

  let narration = null;
  let status = 'idle';
  let ci = 0;
  let si = 0;

  let gen = 0;            // 每次開始念／取消都 +1，舊 utterance 的事件一律忽略
  let utter = null;       // 留住參考，避免 Chrome 把 utterance 回收掉而收不到 onend
  let started = false;
  let retried = false;
  let rearms = 0;
  let gapTimer = null;
  let watchTimer = null;
  let waitTimer = null;
  let pollTimer = null;
  let destroyed = false;

  let readyResolve = null;
  const readyPromise = new Promise((r) => { readyResolve = r; });

  /* ───────── 小工具 ───────── */

  function safe(fn, ...args) {
    if (!fn) return;
    try { fn(...args); } catch { /* 畫面那邊的錯誤不能讓播放壞掉 */ }
  }

  function supported() {
    return !destroyed && api && list.length > 0;
  }

  function snapshot() {
    const sup = supported();
    return {
      status,
      chapter: ci,
      seg: si,
      chapters: narration ? narration.chapters.length : 0,
      supported: sup,
      ready,
      reason: sup ? '' : (ready ? reason : ''),
      networkVoice: !!(voice && !voice.local),
      voiceId: voice ? voice.id : null,
      voiceName: voice ? voice.name : '',
      rate,
    };
  }

  function emit() {
    if (destroyed) return;
    safe(cbState, snapshot());
  }

  function fail(message, code) {
    if (destroyed) return;
    safe(cbError, message, { code, chapter: ci, seg: si });
  }

  function clearTimer(t) {
    if (t !== null) { try { clearTimeout(t); } catch { /* 忽略 */ } }
    return null;
  }

  // 停掉目前在念的東西（不改 status）
  function halt() {
    gen++;
    gapTimer = clearTimer(gapTimer);
    watchTimer = clearTimer(watchTimer);
    if (api) { try { synth.cancel(); } catch { /* 忽略 */ } }
    utter = null;
  }

  /* ───────── 語音清單 ───────── */

  function refreshVoices() {
    if (!api) return false;
    let raw = [];
    try { raw = synth.getVoices() || []; } catch { raw = []; }
    const seen = new Map();
    const items = [];
    Array.from(raw).forEach((v, i) => {
      if (!v || !isZh(v.lang)) return;
      const name = String(v.name || '').trim() || '中文語音';
      let id = String(v.voiceURI || '').trim() || name;
      if (seen.has(id)) {
        const n = seen.get(id) + 1;
        seen.set(id, n);
        id = `${id}#${n}`;
      } else {
        seen.set(id, 1);
      }
      const local = v.localService === true;
      const tw = isTW(v.lang);
      // zh-TW 本機 > zh-TW 線上 > 其他中文本機 > 其他中文線上
      const tier = tw ? (local ? 0 : 1) : (local ? 2 : 3);
      items.push({
        id, name, lang: String(v.lang || '').replace(/_/g, '-'), local, raw: v,
        _tier: tier, _yue: isCantonese(v.lang) ? 1 : 0, _def: v.default ? 0 : 1, _i: i,
      });
    });
    items.sort((a, b) => a._tier - b._tier || a._yue - b._yue || a._def - b._def || a._i - b._i);
    list = items;
    if (!list.length) {
      voice = null;
      return false;
    }
    // 使用者自己選過、而且那個語音還在 → 保留；否則用排在最前面的（預設 zh-TW 本機）
    const keep = voice ? list.find((x) => x.id === voice.id) : null;
    if (userPicked && keep) voice = keep;
    else {
      voice = list[0];
      userPicked = false;
    }
    return true;
  }

  function finishLoading() {
    if (ready) return;
    ready = true;
    waitTimer = clearTimer(waitTimer);
    if (pollTimer !== null) { try { clearInterval(pollTimer); } catch { /* 忽略 */ } pollTimer = null; }
    if (!list.length) reason = MSG.noZh;
    else reason = '';
    readyResolve(list.length > 0);
    emit();
  }

  function onVoicesChanged() {
    if (destroyed) return;
    const found = refreshVoices();
    if (!ready) {
      if (found) finishLoading();
      return;
    }
    // 等滿 2 秒才來的語音：從「不支援」翻成「支援」
    reason = found ? '' : MSG.noZh;
    emit();
  }

  let prevOnVoicesChanged = null;
  let voicesHandler = null;
  const docHandler = () => {
    if (destroyed) return;
    let hidden = false;
    try { hidden = doc.visibilityState === 'hidden' || doc.hidden === true; } catch { hidden = false; }
    if (hidden && status === 'playing') pauseInternal();
  };
  const pageHideHandler = () => {
    if (destroyed) return;
    if (status === 'playing') pauseInternal();
    else if (api) { try { synth.cancel(); } catch { /* 忽略 */ } }
  };

  if (!api) {
    ready = true;
    reason = MSG.noApi;
    readyResolve(false);
  } else {
    voicesHandler = () => onVoicesChanged();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', voicesHandler);
    } else {
      prevOnVoicesChanged = synth.onvoiceschanged || null;
      const chained = function (e) {
        if (prevOnVoicesChanged) { try { prevOnVoicesChanged.call(this, e); } catch { /* 忽略 */ } }
        voicesHandler(e);
      };
      voicesHandler._chained = chained;
      synth.onvoiceschanged = chained;
    }
    if (refreshVoices()) {
      ready = true;
      readyResolve(true);
    } else {
      waitTimer = setTimeout(() => { waitTimer = null; finishLoading(); }, VOICE_WAIT_MS);
      // 有些瀏覽器不發 voiceschanged，但過一下 getVoices() 就有東西
      pollTimer = setInterval(() => {
        if (destroyed || ready) return;
        if (refreshVoices()) finishLoading();
      }, VOICE_POLL_MS);
    }
  }
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', docHandler);
  if (typeof g.addEventListener === 'function') g.addEventListener('pagehide', pageHideHandler);

  // 初始狀態用微任務送出：呼叫端 `const sp = createSpeaker({ onState })` 在回呼裡用 sp 也不會出錯
  Promise.resolve().then(() => { if (!destroyed) emit(); });

  /* ───────── 講稿位置 ───────── */

  function segOk(c, s) {
    const ch = narration && narration.chapters[c];
    const sg = ch && ch.segments[s];
    return !!(sg && typeof sg.speak === 'string' && sg.speak.trim());
  }

  // 從 (c, s) 開始（含）往後找最近一句能念的
  function findFrom(c, s) {
    if (!narration) return null;
    const chs = narration.chapters;
    for (let x = Math.max(0, c); x < chs.length; x++) {
      const start = x === c ? Math.max(0, s) : 0;
      for (let y = start; y < chs[x].segments.length; y++) {
        if (segOk(x, y)) return { c: x, s: y };
      }
    }
    return null;
  }

  function chapterHasSpeech(c) {
    const ch = narration && narration.chapters[c];
    if (!ch) return false;
    for (let y = 0; y < ch.segments.length; y++) if (segOk(c, y)) return true;
    return false;
  }

  function cleanNarration(n) {
    if (!n || typeof n !== 'object' || !Array.isArray(n.chapters)) return null;
    const chapters = n.chapters.map((ch) => {
      const o = ch && typeof ch === 'object' ? ch : {};
      return { ...o, segments: Array.isArray(o.segments) ? o.segments : [] };
    });
    const out = { ...n, chapters };
    return out;
  }

  /* ───────── 念 ───────── */

  function speakCurrent(isRetry = false) {
    watchTimer = clearTimer(watchTimer);
    const ch = narration.chapters[ci];
    const sg = ch.segments[si];
    const my = ++gen;
    retried = isRetry;
    if (!isRetry) rearms = 0;
    started = false;
    let u;
    try {
      u = new Utter(sg.speak);
      u.lang = voice ? voice.raw.lang || voice.lang : 'zh-TW';
      if (voice) u.voice = voice.raw;
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
    } catch {
      speakFailed('synthesis-failed', MSG.speakThrow);
      return;
    }
    u.onstart = () => { if (my === gen) started = true; };
    u.onend = () => {
      if (my !== gen || status !== 'playing') return;
      advance();
    };
    u.onerror = (e) => {
      if (my !== gen || status !== 'playing') return;
      const code = (e && e.error) || '';
      if (code === 'interrupted' || code === 'canceled') {
        // 不是我們取消的（例如別的分頁搶走了語音）：當成暫停，停在這一句
        pauseInternal();
        return;
      }
      speakFailed(code);
    };
    utter = u;
    safe(cbSegment, ci, si, sg, ch);
    // 回呼裡可能已經暫停／停止／換位置
    if (my !== gen || status !== 'playing') return;
    try {
      if (synth.paused) synth.resume();
      synth.speak(u);
    } catch {
      speakFailed('synthesis-failed', MSG.speakThrow);
      return;
    }
    armWatch(my, sg.speak);
  }

  // 保險：有些手機念完不發 onend，播放會卡住
  function armWatch(my, text) {
    const len = String(text).replace(/\s/g, '').length;
    const ms = Math.max(4000, Math.round((len / (3 * rate)) * 1000 * 2) + 3000);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      if (my !== gen || status !== 'playing') return;
      let busy = false;
      try { busy = !!(synth.speaking || synth.pending); } catch { busy = false; }
      if (busy && rearms < WATCH_MAX_REARM) {
        rearms++;
        armWatch(my, text);
        return;
      }
      if (!busy && !started && !retried) {
        // 根本沒開始念（Chrome 偶爾在 cancel 後吃掉下一句）：同一句再念一次
        speakCurrent(true);
        return;
      }
      if (busy) { gen++; try { synth.cancel(); } catch { /* 忽略 */ } }
      advance();
    }, ms);
  }

  function advance() {
    watchTimer = clearTimer(watchTimer);
    utter = null;
    const p = findFrom(ci, si + 1);
    if (!p) {
      status = 'ended';
      emit();
      return;
    }
    if (p.c === ci) {
      si = p.s;
      speakCurrent();
      emit();
      return;
    }
    // 換章：停 0.6 秒
    ci = p.c;
    si = p.s;
    const my = ++gen;
    gapTimer = setTimeout(() => {
      gapTimer = null;
      if (my !== gen || status !== 'playing') return;
      speakCurrent();
      emit();
    }, CHAPTER_GAP_MS);
    emit();
  }

  function speakFailed(code, message) {
    halt();
    status = 'paused';
    emit();
    fail(message || errorMessage(code), code || 'synthesis-failed');
  }

  function pauseInternal() {
    halt();
    status = 'paused';
    emit();
  }

  function canSpeak() {
    if (!narration) { fail(MSG.noNarration, 'no-narration'); return false; }
    if (!api) { fail(MSG.noApi, 'unsupported'); return false; }
    if (!list.length) refreshVoices();
    if (!list.length && ready) { fail(MSG.noZh, 'no-voice'); return false; }
    return true;
  }

  /* ───────── 對外 API ───────── */

  function play(chapterIndex = 0, segIndex = 0) {
    if (destroyed) return false;
    if (!canSpeak()) return false;
    const n = narration.chapters.length;
    let c = Math.trunc(Number(chapterIndex));
    let s = Math.trunc(Number(segIndex));
    if (!Number.isFinite(c) || c < 0) c = 0;
    if (!Number.isFinite(s) || s < 0) s = 0;
    if (c >= n) { c = 0; s = 0; }
    const p = findFrom(c, s) || findFrom(0, 0);
    halt();
    ci = p.c;
    si = p.s;
    status = 'playing';
    speakCurrent();
    emit();
    return status === 'playing';
  }

  function pause() {
    if (destroyed || status !== 'playing') return false;
    pauseInternal();
    return true;
  }

  function resume() {
    if (destroyed) return false;
    if (status === 'playing') return true;
    if (status === 'ended') return play(0, 0);
    return play(ci, si);
  }

  function stop() {
    if (destroyed) return;
    halt();
    status = 'idle';
    ci = 0;
    si = 0;
    emit();
  }

  function moveTo(c) {
    const p = findFrom(c, 0);
    if (!p) return false;
    if (status === 'playing') return play(p.c, p.s);
    halt();
    ci = p.c;
    si = p.s;
    status = 'paused';
    emit();
    return true;
  }

  function next() {
    if (destroyed || !narration) return false;
    for (let c = ci + 1; c < narration.chapters.length; c++) {
      if (chapterHasSpeech(c)) return moveTo(c);
    }
    return false;
  }

  function prev() {
    if (destroyed || !narration) return false;
    for (let c = ci - 1; c >= 0; c--) {
      if (chapterHasSpeech(c)) return moveTo(c);
    }
    return moveTo(0);
  }

  function setRate(r) {
    if (destroyed) return rate;
    const nr = clampRate(r);
    const changed = nr !== rate;
    rate = nr;
    // 播放中：這一句用新速度重念（換章的停頓中就等下一句）
    if (changed && status === 'playing' && gapTimer === null) {
      halt();
      speakCurrent();
    }
    emit();
    return rate;
  }

  function setVoice(id) {
    if (destroyed) return false;
    if (!list.length) refreshVoices();
    const found = list.find((x) => x.id === String(id));
    if (!found) {
      fail(MSG.noSuchVoice, 'no-such-voice');
      return false;
    }
    const changed = found !== voice;
    voice = found;
    userPicked = true;
    if (changed && status === 'playing' && gapTimer === null) {
      halt();
      speakCurrent();
    }
    emit();
    return true;
  }

  function load(n) {
    if (destroyed) return false;
    halt();
    status = 'idle';
    ci = 0;
    si = 0;
    const clean = cleanNarration(n);
    narration = clean;
    if (!clean || !findFrom(0, 0)) {
      narration = null;
      emit();
      fail(MSG.badNarration, 'bad-narration');
      return false;
    }
    emit();
    return true;
  }

  function voices() {
    if (destroyed || !api) return [];
    if (!list.length) refreshVoices();
    return list.map((x) => ({ id: x.id, name: x.name, lang: x.lang, local: x.local }));
  }

  function state() {
    return { status, chapter: ci, seg: si };
  }

  function destroy() {
    if (destroyed) return;
    halt();
    status = 'idle';
    destroyed = true;
    waitTimer = clearTimer(waitTimer);
    if (pollTimer !== null) { try { clearInterval(pollTimer); } catch { /* 忽略 */ } pollTimer = null; }
    if (api && voicesHandler) {
      if (typeof synth.removeEventListener === 'function' && typeof synth.addEventListener === 'function') {
        synth.removeEventListener('voiceschanged', voicesHandler);
      } else if (synth.onvoiceschanged === voicesHandler._chained) {
        synth.onvoiceschanged = prevOnVoicesChanged;
      }
    }
    if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', docHandler);
    if (typeof g.removeEventListener === 'function') g.removeEventListener('pagehide', pageHideHandler);
    if (!ready) readyResolve(false);
    narration = null;
    cbState = null;
    cbSegment = null;
    cbError = null;
  }

  return {
    supported,
    voices,
    setVoice,
    setRate,
    load,
    play,
    pause,
    resume,
    stop,
    next,
    prev,
    state,
    destroy,
    // 額外：語音清單有結論時 resolve（true＝有中文語音）；畫面可以 await 它再決定要不要顯示播放鍵
    ready: () => readyPromise,
  };
}
