// 網頁版限定：排盤前請客人留姓名（稱呼）與電話，送到阿良的 Google 表單。
// 只送四個欄位：姓名、電話、來源、同意版本；生日、出生時間、出生地一律不送。
// 這支只在公開網頁版載入（建置時把 web/index.html 的 web:lead marker 換成這支的 script）；本機版不載入，所以本機排盤不受影響。
// 不用 cookie、不用瀏覽器儲存：「這次開頁已留過」只記在記憶體，重新整理會再問一次。
// 建置掃描只准這支的送出那一行（整行一字不差）連到 FORM，FORM 也要一字不差，改了建置會失敗（tools/build-web.mjs）。
// 整份檔案的 sha256 也釘在 tools/build-web.mjs 的 LEAD_JS_SHA256：改任何一個字，都要先確認沒有多送任何資料，再更新那個雜湊。

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSc9tF4-HkGywbRBiRi-eltcmsdSBSPZNZwFk8_TBppC_D0hxg/formResponse';
const FIELD = { name: 'entry.1573103177', phone: 'entry.430522721', source: 'entry.2147041649', consent: 'entry.984140140' };
const SOURCE = '西洋星盤網頁';           // 來源欄：星盤網站固定寫這個（紫微網站寫「紫微斗數網頁」）
const CONSENT_VERSION = '告知v2-20261015';
const SITE = 'https://house0975715071.github.io/astro/';            // 建置時換成正式網址；只有在正式網址才真的送出，預覽與測試只乾跑
const LIVE = document.URL.startsWith(SITE);
const TIMEOUT_MS = 8000;

let done = false;        // 這次開頁是否已經留過
let failures = 0;        // 連續送出失敗次數
let openPromise = null;  // 防止重複開視窗

const NOTICE = [
  ['蒐集者', '劉益良（阿良），中信房屋 中原大學加盟店營業員；電話 0975-715-071、LINE @house168168。'],
  ['目的', '讓阿良之後用電話或 LINE 跟你聯絡，提供房地產買賣租賃、命理諮詢等服務資訊（行銷）。留姓名電話是使用這個免費排盤的條件。'],
  ['資料', '你填的姓名（稱呼）和電話。你的生日、出生時間、出生地不會送出。'],
  ['保存與利用', '在台灣利用；資料存在阿良的 Google 表單與試算表，放在 Google 公司的雲端伺服器，可能位於台灣以外（例如美國）。只有阿良看得到、不提供給其他人；保存到你要求刪除，或不再需要聯絡為止。'],
  ['你的權利', '你可以隨時打電話或傳 LINE 給阿良，要求查詢或閱覽、取得複本、補充或更正、停止蒐集處理利用（包括停止聯絡），或刪除你的資料。'],
  ['不提供的影響', '不留姓名電話就無法使用這個免費排盤。'],
];

function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of kids) n.append(c);
  return n;
}

// 姓名：全形轉半形、去掉頭尾空白、拿掉開頭的 = + - @（避免匯出 Excel 時被當成公式），最多 20 字
export function cleanName(s) {
  return String(s || '').normalize('NFKC').trim().replace(/^[=+\-@\s]+/, '').replace(/\s+/g, ' ').slice(0, 20);
}

// 電話：全形轉半形；去掉空白、連字號、點、括號；+886／886 開頭換成 0；只收台灣手機（09 開頭 10 碼）或市話（0 開頭 9～10 碼）
export function cleanPhone(s) {
  let d = String(s || '').normalize('NFKC').replace(/[\s\-().]/g, '');
  if (/^\+?886/.test(d)) d = '0' + d.replace(/^\+?886/, '');
  if (/^09\d{8}$/.test(d)) return d;
  if (/^0[2-8]\d{7,8}$/.test(d)) return d;
  return '';
}

function buildDialog() {
  const box = el('div', { class: 'lead-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lead-title', 'aria-describedby': 'lead-sub' });
  const title = el('h2', { id: 'lead-title', class: 'lead-title', text: '排盤前，請留下聯絡方式' });
  const sub = el('p', { id: 'lead-sub', class: 'lead-sub', text: '排盤免費。留下姓名和電話，阿良之後會用電話或 LINE 跟你聯絡；你的生日不會送出。未滿 18 歲請先經家長同意。' });

  const name = el('input', { id: 'lead-name', type: 'text', autocomplete: 'name', maxlength: '20', placeholder: '怎麼稱呼你', enterkeyhint: 'next', 'aria-describedby': 'lead-name-err' });
  const phone = el('input', { id: 'lead-phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '20', placeholder: '手機 09 開頭共 10 碼', enterkeyhint: 'done', 'aria-describedby': 'lead-phone-err' });
  // 防機器人：真人看不到、也不會用鍵盤跳到這格；有填就假裝成功但不送
  const trap = el('input', { id: 'lead-website', type: 'text', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', class: 'lead-trap' });

  const nameErr = el('small', { id: 'lead-name-err', class: 'lead-ferr', role: 'alert' });
  const phoneErr = el('small', { id: 'lead-phone-err', class: 'lead-ferr', role: 'alert' });
  const fName = el('label', { class: 'lead-field' }, [el('span', { text: '姓名或稱呼' }), name, nameErr]);
  const fPhone = el('label', { class: 'lead-field' }, [el('span', { text: '電話' }), phone, phoneErr]);

  const notice = el('div', { class: 'lead-notice', id: 'lead-notice' }, [
    el('p', { class: 'lead-notice-h', text: '個人資料蒐集告知' }),
    el('dl', {}, NOTICE.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
  ]);

  // 底部固定區：同意、錯誤、按鈕。視窗內容再長，客人都看得到這一塊
  const agree = el('input', { id: 'lead-agree', type: 'checkbox', 'aria-describedby': 'lead-agree-err' });
  const fAgree = el('label', { class: 'lead-agree' }, [agree, el('span', { text: '我已看過上面的說明，同意阿良用電話或 LINE 提供房地產、命理諮詢等資訊給我（之後可隨時要求停止）' })]);
  const agreeErr = el('small', { id: 'lead-agree-err', class: 'lead-ferr', role: 'alert' });
  const err = el('p', { id: 'lead-err', class: 'lead-err', role: 'alert' });   // 只用在「送出失敗」
  const skip = el('button', { type: 'button', id: 'lead-skip', class: 'lead-btn lead-btn-skip', text: '先排盤，晚點再用 LINE 聯絡阿良', hidden: '' });
  const ok = el('button', { type: 'button', id: 'lead-ok', class: 'lead-btn lead-btn-main', text: '送出並開始排盤' });
  const cancel = el('button', { type: 'button', id: 'lead-cancel', class: 'lead-btn lead-btn-ghost', text: '取消' });
  const foot = el('div', { class: 'lead-foot' }, [fAgree, agreeErr, err, skip, el('div', { class: 'lead-actions' }, [ok, cancel])]);

  box.append(title, sub, fName, fPhone, trap, notice, foot);
  const backdrop = el('div', { class: 'lead-backdrop', id: 'lead-sheet' }, [box]);
  return { backdrop, name, phone, trap, agree, nameErr, phoneErr, agreeErr, err, ok, skip, cancel };
}

async function send(name, phone) {
  const body = new URLSearchParams();
  body.set(FIELD.name, name);
  body.set(FIELD.phone, phone);
  body.set(FIELD.source, SOURCE);
  body.set(FIELD.consent, CONSENT_VERSION);
  if (!LIVE) { await new Promise(r => setTimeout(r, 300)); return true; }   // 預覽與測試：乾跑，不送
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    await fetch(FORM, { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', body, signal: ctl.signal });
    return true;   // no-cors 看不到回應內容；沒丟例外就當作送達
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 給 app.js 呼叫：回傳 true＝可以開始排盤；false＝客人取消
export function leadGate() {
  if (done) return Promise.resolve(true);
  if (openPromise) return openPromise;
  const back = document.activeElement;
  const d = buildDialog();
  document.body.append(d.backdrop);
  d.name.focus();

  openPromise = new Promise(resolve => {
    let closed = false;
    let sending = false;
    const setErr = (input, box, msg) => {
      box.textContent = msg;
      if (input) {
        if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      }
    };
    const clearAll = () => {
      setErr(d.name, d.nameErr, ''); setErr(d.phone, d.phoneErr, ''); setErr(d.agree, d.agreeErr, ''); d.err.textContent = '';
    };
    const close = (result) => {
      if (closed) return;
      closed = true;
      d.backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      openPromise = null;
      if (back && back.focus) back.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (!sending) close(false); return; }
      if (e.key === 'Tab') {   // 焦點留在視窗裡
        const f = [...d.backdrop.querySelectorAll('input:not(.lead-trap), button:not([hidden]):not([disabled])')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      if (e.key === 'Enter' && e.target === d.name) { e.preventDefault(); d.phone.focus(); return; }
      if (e.key === 'Enter' && e.target === d.phone) { e.preventDefault(); d.ok.click(); }
    };
    document.addEventListener('keydown', onKey, true);
    d.name.addEventListener('input', () => setErr(d.name, d.nameErr, ''));
    d.phone.addEventListener('input', () => setErr(d.phone, d.phoneErr, ''));
    d.agree.addEventListener('change', () => setErr(d.agree, d.agreeErr, ''));
    d.cancel.addEventListener('click', () => { if (!sending) close(false); });
    d.skip.addEventListener('click', () => { if (sending) return; done = true; close(true); });

    d.ok.addEventListener('click', async () => {
      if (sending) return;
      clearAll();
      const name = cleanName(d.name.value);
      const rawPhone = String(d.phone.value || '').trim();
      const phone = cleanPhone(rawPhone);
      let first = null;
      if (!name) { setErr(d.name, d.nameErr, '請填姓名或稱呼。'); first = first || d.name; }
      if (!rawPhone) { setErr(d.phone, d.phoneErr, '請填電話。'); first = first || d.phone; }
      else if (!phone) { setErr(d.phone, d.phoneErr, '電話格式不對：手機請填 09 開頭共 10 碼，市話請加區碼。'); first = first || d.phone; }
      if (!d.agree.checked) { setErr(d.agree, d.agreeErr, '請先勾選同意，才能開始排盤。'); first = first || d.agree; }
      if (first) { first.focus(); first.scrollIntoView({ block: 'center' }); return; }
      if (d.trap.value) { done = true; close(true); return; }   // 機器人：不送

      sending = true;
      d.ok.disabled = true; d.cancel.disabled = true; d.skip.disabled = true;
      d.ok.textContent = '送出中…';
      const ok = await send(name, phone);
      sending = false;
      d.ok.disabled = false; d.cancel.disabled = false; d.skip.disabled = false;
      d.ok.textContent = '送出並開始排盤';
      if (closed) return;
      if (ok) { failures = 0; done = true; close(true); return; }
      failures += 1;
      if (failures >= 2) {
        d.err.textContent = '還是送不出去（可能是網路不穩或擋廣告的外掛）。可以按下面的「先排盤，晚點再用 LINE 聯絡阿良」。';
        d.skip.hidden = false;
        d.skip.scrollIntoView({ block: 'nearest' });
        d.skip.focus();
      } else {
        d.err.textContent = '送出失敗，可能是網路不穩或擋廣告的外掛擋住了，請再按一次。';
        d.err.scrollIntoView({ block: 'nearest' });
      }
    });
  });
  return openPromise;
}

window.__leadGate = leadGate;
