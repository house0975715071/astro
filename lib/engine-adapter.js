// 星盤引擎轉接層（瀏覽器版）：index.html 先載入 vendor/astronomy.browser.min.js（UMD，全域 Astronomy），
// 這裡再把它以 A 的名字匯出，讓 lib/astro.js 在瀏覽器裡跟 Node 版用同一份程式碼。
const engine = (typeof self !== 'undefined' && self.Astronomy)
  || (typeof globalThis !== 'undefined' && globalThis.Astronomy)
  || null;
if (!engine) throw new Error('星盤引擎沒有載入，請重新整理頁面');
export const A = engine;
