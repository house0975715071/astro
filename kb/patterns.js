// 星盤格局判定規則（西洋占星）
// 每條規則：id / 名稱 / 等級 / 判定函式 test(ctx) / 說明 desc / 對五大面向的影響 effect / 職業提示 careerHint / 涉及行星 planetsOf(ctx)
// ctx 由 lib/astro.mjs 的 makeContext(chart) 提供：
//   ctx.chart、ctx.planet(id)、ctx.inHouse(n)、ctx.inSign(name)、ctx.aspectsOf(id)、
//   ctx.hasAspect(a, b, type)、ctx.aspectBetween(a, b)、ctx.elementCount()、ctx.modeCount()、
//   ctx.ruler(n)、ctx.isDay()、ctx.hasTime()、ctx.retroCount()
// 所有 test 都包在 try/catch 裡，任何錯誤一律回 false；planetsOf 出錯回空陣列。

const TEN = Object.freeze(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);

const ELEMENTS = Object.freeze(['火象', '土象', '風象', '水象']);
const ELEMENT_KEY_ALIAS = Object.freeze({ fire: '火象', earth: '土象', air: '風象', water: '水象' });

const SIGN_NAMES = Object.freeze([
  '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
  '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座',
]);

// 廟位（入廟星座）：只用現代守護，互容用。必須跟 lib/astro.mjs 的 DIGNITY[].domicile 完全一致
// （kb 不能 import lib，所以這裡抄一份；tests/kb.test.mjs 逐格比對，改了引擎這裡要跟著改）。
// 古典雙守護（火星天蠍、木星雙魚、土星水瓶）不算，否則畫面會出現「互容」但兩顆都沒入廟的矛盾。
export const DOMICILE = Object.freeze({
  sun: Object.freeze(['獅子座']),
  moon: Object.freeze(['巨蟹座']),
  mercury: Object.freeze(['雙子座', '處女座']),
  venus: Object.freeze(['金牛座', '天秤座']),
  mars: Object.freeze(['牡羊座']),
  jupiter: Object.freeze(['射手座']),
  saturn: Object.freeze(['摩羯座']),
  uranus: Object.freeze(['水瓶座']),
  neptune: Object.freeze(['雙魚座']),
  pluto: Object.freeze(['天蠍座']),
});

// ---- 小工具（純函式，不碰時間） ----

function safeTest(fn) {
  return (ctx) => {
    try { return !!fn(ctx); } catch { return false; }
  };
}

function safeList(fn) {
  return (ctx) => {
    try {
      const r = fn(ctx);
      return Array.isArray(r) ? r.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  };
}

function signNameOf(x) {
  if (!x) return null;
  if (typeof x === 'string') return x;
  if (x.sign) return signNameOf(x.sign);
  if (typeof x.name === 'string') return x.name;
  return null;
}

function elementOf(ctx, id) {
  const p = ctx.planet(id);
  if (!p || !p.sign) return null;
  if (p.sign.element) return p.sign.element;
  const idx = SIGN_NAMES.indexOf(p.sign.name);
  return idx >= 0 ? ELEMENTS[idx % 4] : null;
}

function lonOf(ctx, id) {
  const p = ctx.planet(id);
  if (!p || typeof p.lon !== 'number' || Number.isNaN(p.lon)) return null;
  return p.lon;
}

function angleDiff(a, b) {
  let d = Math.abs((((a - b) % 360) + 360) % 360);
  if (d > 180) d = 360 - d;
  return d;
}

function isQuincunx(ctx, a, b, orb = 2) {
  const la = lonOf(ctx, a), lb = lonOf(ctx, b);
  if (la === null || lb === null) return false;
  return Math.abs(angleDiff(la, lb) - 150) <= orb;
}

function has(ctx, a, b, type) {
  try { return !!ctx.hasAspect(a, b, type); } catch { return false; }
}

function orbBetween(ctx, a, b, types) {
  const asp = ctx.aspectBetween(a, b);
  if (!asp) return null;
  if (types && !types.includes(asp.type)) return null;
  return typeof asp.orb === 'number' ? asp.orb : null;
}

function normalizeElementCount(ctx) {
  const raw = ctx.elementCount() || {};
  const out = { 火象: 0, 土象: 0, 風象: 0, 水象: 0 };
  for (const [k, v] of Object.entries(raw)) {
    const key = ELEMENT_KEY_ALIAS[k] || k;
    if (key in out && typeof v === 'number') out[key] = v;
  }
  return out;
}

// 只留十顆行星（去掉交點、福點）
function onlyTen(ids) {
  return (ids || []).filter((id) => TEN.includes(id));
}

// 找出所有大三角：三顆行星兩兩三分相、且同一元素
function findGrandTrines(ctx) {
  const out = [];
  for (let i = 0; i < TEN.length; i++) {
    for (let j = i + 1; j < TEN.length; j++) {
      if (!has(ctx, TEN[i], TEN[j], 'trine')) continue;
      for (let k = j + 1; k < TEN.length; k++) {
        if (!has(ctx, TEN[i], TEN[k], 'trine') || !has(ctx, TEN[j], TEN[k], 'trine')) continue;
        const e1 = elementOf(ctx, TEN[i]), e2 = elementOf(ctx, TEN[j]), e3 = elementOf(ctx, TEN[k]);
        if (e1 && e1 === e2 && e2 === e3) out.push({ ids: [TEN[i], TEN[j], TEN[k]], element: e1 });
      }
    }
  }
  return out;
}

function grandTrineOf(element) {
  return (ctx) => findGrandTrines(ctx).filter((t) => t.element === element);
}

// 丁字三角：a 對分 b，c 同時四分 a 與 b
function findTSquares(ctx) {
  const out = [];
  for (let i = 0; i < TEN.length; i++) {
    for (let j = i + 1; j < TEN.length; j++) {
      if (!has(ctx, TEN[i], TEN[j], 'opposition')) continue;
      for (const c of TEN) {
        if (c === TEN[i] || c === TEN[j]) continue;
        if (has(ctx, c, TEN[i], 'square') && has(ctx, c, TEN[j], 'square')) {
          out.push({ ids: [TEN[i], TEN[j], c], apex: c });
        }
      }
    }
  }
  return out;
}

// 大十字：a 對 c、b 對 d，且 a-b、b-c、c-d、d-a 都四分
function findGrandCrosses(ctx) {
  const out = [];
  for (let i = 0; i < TEN.length; i++) {
    for (let k = i + 1; k < TEN.length; k++) {
      if (!has(ctx, TEN[i], TEN[k], 'opposition')) continue;
      for (let j = 0; j < TEN.length; j++) {
        if (j === i || j === k) continue;
        for (let l = j + 1; l < TEN.length; l++) {
          if (l === i || l === k) continue;
          if (!has(ctx, TEN[j], TEN[l], 'opposition')) continue;
          const a = TEN[i], b = TEN[j], c = TEN[k], d = TEN[l];
          if (has(ctx, a, b, 'square') && has(ctx, b, c, 'square') && has(ctx, c, d, 'square') && has(ctx, d, a, 'square')) {
            out.push({ ids: [a, b, c, d] });
          }
        }
      }
    }
  }
  return out;
}

// 上帝之指：a 與 b 六分相，c 與 a、b 各成 150°（±2°）
function findYods(ctx) {
  const out = [];
  for (let i = 0; i < TEN.length; i++) {
    for (let j = i + 1; j < TEN.length; j++) {
      if (!has(ctx, TEN[i], TEN[j], 'sextile')) continue;
      for (const c of TEN) {
        if (c === TEN[i] || c === TEN[j]) continue;
        if (isQuincunx(ctx, c, TEN[i]) && isQuincunx(ctx, c, TEN[j])) {
          out.push({ ids: [TEN[i], TEN[j], c], apex: c });
        }
      }
    }
  }
  return out;
}

// 風箏：大三角＋第四顆行星，與其中一角對分、與另外兩角六分
function findKites(ctx) {
  const out = [];
  for (const t of findGrandTrines(ctx)) {
    for (const p of TEN) {
      if (t.ids.includes(p)) continue;
      for (const tail of t.ids) {
        const others = t.ids.filter((x) => x !== tail);
        if (has(ctx, p, tail, 'opposition') && others.every((o) => has(ctx, p, o, 'sextile'))) {
          out.push({ ids: [...t.ids, p], tail: p });
        }
      }
    }
  }
  return out;
}

// 互容：兩顆行星各在對方的廟位
function findMutualReceptions(ctx) {
  const out = [];
  const ids = Object.keys(DOMICILE);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const sa = signNameOf(ctx.planet(a)), sb = signNameOf(ctx.planet(b));
      if (!sa || !sb) continue;
      if (DOMICILE[b].includes(sa) && DOMICILE[a].includes(sb)) out.push({ ids: [a, b] });
    }
  }
  return out;
}

function findSignStelliums(ctx) {
  const out = [];
  for (const s of SIGN_NAMES) {
    const ids = onlyTen(ctx.inSign(s));
    if (ids.length >= 3) out.push({ sign: s, ids });
  }
  return out;
}

function findHouseStelliums(ctx) {
  if (!ctx.hasTime()) return [];
  const out = [];
  for (let n = 1; n <= 12; n++) {
    const ids = onlyTen(ctx.inHouse(n));
    if (ids.length >= 3) out.push({ house: n, ids });
  }
  return out;
}

function ascSignName(ctx) {
  const ang = ctx.chart && ctx.chart.angles;
  if (!ang || !ang.asc) return null;
  return signNameOf(ang.asc);
}

const flat = (list) => Array.from(new Set(list.flatMap((x) => x.ids)));

// ---- 格局清單 ----

const RAW_PATTERNS = [
  {
    id: 'grand-trine-fire',
    name: '火象大三角',
    level: 'great',
    test: (ctx) => grandTrineOf('火象')(ctx).length > 0,
    desc: '三顆火象行星互相形成三分相，熱情、行動力與自信在你身上流轉得很順，做事容易一鼓作氣，也常常帶動身邊的人。要留意的是太順手反而懶得深耕，建議把這股衝勁綁在一個能累積的長期目標上，才不會東做一點西做一點。',
    effect: { 事業: 7, 財運: 4, 家庭: 2, 感情: 3, 健康: 3 },
    careerHint: '業務、創業、運動、演出、教練、行銷',
    planetsOf: (ctx) => flat(grandTrineOf('火象')(ctx)),
  },
  {
    id: 'grand-trine-earth',
    name: '土象大三角',
    level: 'great',
    test: (ctx) => grandTrineOf('土象')(ctx).length > 0,
    desc: '三顆土象行星互相三分，你天生有把事情落實的手感，理財、工作流程與生活節奏都傾向穩穩推進，別人覺得麻煩的細節你反而做得踏實。缺點是容易太安於現狀，建議每年主動給自己一個新挑戰，讓穩定變成資本而不是限制。',
    effect: { 事業: 6, 財運: 8, 家庭: 5, 感情: 2, 健康: 4 },
    careerHint: '財務、不動產、營建、行政、製造、農林',
    planetsOf: (ctx) => flat(grandTrineOf('土象')(ctx)),
  },
  {
    id: 'grand-trine-air',
    name: '風象大三角',
    level: 'great',
    test: (ctx) => grandTrineOf('風象')(ctx).length > 0,
    desc: '三顆風象行星互拱，你的思路、表達與人脈常常一氣呵成，學新東西快、講話有條理，很適合靠溝通與資訊吃飯。要留意想得多做得少，建議每次有點子就立刻排出三個可以動手的小步驟，讓靈感真正落地。',
    effect: { 事業: 6, 財運: 4, 家庭: 2, 感情: 4, 健康: 2 },
    careerHint: '傳播、教學、業務、企劃、寫作、公關',
    planetsOf: (ctx) => flat(grandTrineOf('風象')(ctx)),
  },
  {
    id: 'grand-trine-water',
    name: '水象大三角',
    level: 'great',
    test: (ctx) => grandTrineOf('水象')(ctx).length > 0,
    desc: '三顆水象行星互相三分，你的直覺與同理心運作得很自然，容易感受到別人沒說出口的需求，在照顧、諮商、服務類工作特別有優勢。缺點是情緒容易被環境牽動，建議固定安排獨處與休息時間，讓感受力成為工具而不是負擔。',
    effect: { 事業: 4, 財運: 3, 家庭: 6, 感情: 7, 健康: 2 },
    careerHint: '照護、諮商、藝術、餐飲、教育、社工',
    planetsOf: (ctx) => flat(grandTrineOf('水象')(ctx)),
  },
  {
    id: 't-square',
    name: '丁字三角',
    level: 'warn',
    test: (ctx) => findTSquares(ctx).length > 0,
    desc: '兩顆行星對分，再同時被第三顆行星四分，形成緊繃的三角。你的人生常在這個主題上感到卡關與拉扯，但也因此練出比別人強的韌性與解決問題的本事。建議把壓力最集中的那顆行星所管的領域當成主戰場，用行動化解，而不是逃避。',
    effect: { 事業: 3, 財運: -2, 家庭: -3, 感情: -3, 健康: -3 },
    planetsOf: (ctx) => flat(findTSquares(ctx)),
  },
  {
    id: 'grand-cross',
    name: '大十字',
    level: 'bad',
    test: (ctx) => findGrandCrosses(ctx).length > 0,
    desc: '四顆行星兩兩對分、彼此四分，像四個方向同時在拉你。你可能常覺得每件事都很急、每個角色都要顧，壓力來自四面八方。好處是抗壓性與執行力被磨得很強。建議一次只處理一個象限的事，並固定留一天不排工作，讓身心有空隙。',
    effect: { 事業: 2, 財運: -3, 家庭: -4, 感情: -4, 健康: -5 },
    planetsOf: (ctx) => flat(findGrandCrosses(ctx)),
  },
  {
    id: 'stellium-sign',
    name: '星群同座',
    level: 'mixed',
    test: (ctx) => findSignStelliums(ctx).length > 0,
    desc: '有三顆以上的行星擠在同一個星座，這個星座的特質在你身上會非常鮮明，別人一眼就看得出你的風格，優勢集中、辨識度高。相對地，視角容易單一、不太聽得進不同意見。建議刻意跟特質相反的人合作，補足你看不到的角度。',
    effect: { 事業: 4, 財運: 2, 家庭: 0, 感情: -1, 健康: -1 },
    planetsOf: (ctx) => flat(findSignStelliums(ctx)),
  },
  {
    id: 'stellium-house',
    name: '星群同宮',
    level: 'mixed',
    test: (ctx) => findHouseStelliums(ctx).length > 0,
    desc: '三顆以上的行星集中在同一個宮位，代表你的人生能量大量投入這個領域，容易在這裡做出成績，也容易在這裡耗損最多心力。建議先看這個宮位的主題是什麼，主動經營它，同時提醒自己別把其他生活面向全部放掉。',
    effect: { 事業: 4, 財運: 2, 家庭: 0, 感情: 0, 健康: -2 },
    planetsOf: (ctx) => flat(findHouseStelliums(ctx)),
  },
  {
    id: 'yod',
    name: '上帝之指',
    level: 'mixed',
    test: (ctx) => findYods(ctx).length > 0,
    desc: '兩顆行星形成六分相，再一起指向第三顆行星，呈現細長的三角。被指到的那顆行星常是你人生中一直被推著去調整的主題，年輕時可能覺得不順，經過幾次轉彎後反而走出獨特的路。建議把它當成需要慢慢磨的專長，不要急著下定論。',
    effect: { 事業: 3, 財運: 0, 家庭: -1, 感情: -1, 健康: -2 },
    planetsOf: (ctx) => flat(findYods(ctx)),
  },
  {
    id: 'kite',
    name: '風箏',
    level: 'great',
    test: (ctx) => findKites(ctx).length > 0,
    desc: '大三角之外再加一顆行星，與其中一角對分、與另外兩角六分，像三角形多了一條尾巴。大三角的順手因此有了出口與方向，你比一般人更容易把天賦轉成具體成果。建議以那顆尾巴行星所在的領域為目標，讓順勢多出來的能量有地方發揮。',
    effect: { 事業: 8, 財運: 6, 家庭: 3, 感情: 3, 健康: 3 },
    planetsOf: (ctx) => flat(findKites(ctx)),
  },
  {
    id: 'mutual-reception',
    name: '互容',
    level: 'good',
    test: (ctx) => findMutualReceptions(ctx).length > 0,
    desc: '兩顆行星各自坐在對方守護的星座裡，彼此像交換了鑰匙，能互相支援。這兩顆行星所管的主題在你的人生裡常常一起變好，也一起需要照顧。建議同時經營這兩個領域，一邊順的時候把資源帶去另一邊，效果會比單獨衝刺明顯。',
    effect: { 事業: 5, 財運: 5, 家庭: 3, 感情: 3, 健康: 2 },
    planetsOf: (ctx) => flat(findMutualReceptions(ctx)),
  },
  {
    id: 'new-moon',
    name: '新月相',
    level: 'mixed',
    test: (ctx) => has(ctx, 'sun', 'moon', 'conjunction'),
    desc: '太陽與月亮合相，你想要的與你需要的傾向一致，做決定時內心比較少拉扯，行動起來乾脆有力。相對地，你較難從外面看自己，容易一頭熱而忽略提醒。建議身邊留幾個敢講真話的朋友，並在重大決定前給自己兩天冷靜期。',
    effect: { 事業: 4, 財運: 2, 家庭: 1, 感情: 2, 健康: 1 },
    planetsOf: () => ['sun', 'moon'],
  },
  {
    id: 'full-moon',
    name: '滿月相',
    level: 'mixed',
    test: (ctx) => has(ctx, 'sun', 'moon', 'opposition'),
    desc: '太陽與月亮對分，理智想要的與情感需要的常常拉扯，你對關係特別敏感，也容易把心力放在他人身上。好處是你懂得站在對方的角度，談判與協調時很吃香。建議多練習說出自己的需求，不要每次都先退讓，才不會累積委屈。',
    effect: { 事業: 2, 財運: 0, 家庭: -1, 感情: 3, 健康: -2 },
    planetsOf: () => ['sun', 'moon'],
  },
  {
    id: 'multi-retro',
    name: '多逆行',
    level: 'warn',
    test: (ctx) => ctx.retroCount() >= 4,
    desc: '星盤裡有四顆以上的行星逆行，你的節奏傾向比外界慢半拍，很多事要繞一圈、想清楚才會真的動，內在反省的能力比一般人強。建議不要拿別人的速度逼自己，把時間花在真正想深耕的事情上，慢慢累積反而走得更遠。',
    effect: { 事業: -2, 財運: -2, 家庭: 0, 感情: -1, 健康: -1 },
    planetsOf: (ctx) => TEN.filter((id) => { const p = ctx.planet(id); return !!(p && p.retro); }),
  },
  {
    id: 'mercury-retro',
    name: '水星逆行',
    level: 'warn',
    test: (ctx) => { const p = ctx.planet('mercury'); return !!(p && p.retro); },
    desc: '出生時水星逆行，你思考時習慣在心裡先繞幾圈，講出口的常常比想的少，寫下來會比當場說清楚得多。這種人常在事後才想到更好的說法。建議重要的溝通用文字先整理，會議後補一封確認訊息，就能把誤會降到最低。',
    effect: { 事業: -1, 財運: -1, 家庭: 0, 感情: -2, 健康: 0 },
    planetsOf: () => ['mercury'],
  },
  {
    id: 'element-missing',
    name: '元素缺',
    level: 'warn',
    test: (ctx) => Object.values(normalizeElementCount(ctx)).some((v) => v === 0),
    desc: '四種元素裡有一種完全沒有行星落入，這個元素代表的能力不是你天生擅長的，需要靠後天練習或找人補位。缺火象常少衝勁、缺土象常少落實、缺風象常少表達、缺水象常少感受。建議把缺的那項當成年度練習題，或找具備它的夥伴合作。',
    effect: { 事業: -2, 財運: -2, 家庭: -1, 感情: -2, 健康: -2 },
    planetsOf: () => [],
  },
  {
    id: 'element-dominant',
    name: '元素強勢',
    level: 'mixed',
    test: (ctx) => Object.values(normalizeElementCount(ctx)).some((v) => v >= 5),
    desc: '某一種元素的加權分數特別高，你的個性會明顯偏向它：火象重行動、土象重實際、風象重思考、水象重感受。優勢很集中，也容易在別的面向顯得不耐煩。建議理解自己的偏向，遇到需要另一種能力的事，先放慢腳步或請人協助。',
    effect: { 事業: 3, 財運: 1, 家庭: 0, 感情: 0, 健康: 0 },
    planetsOf: (ctx) => {
      const count = normalizeElementCount(ctx);
      const strong = ELEMENTS.filter((e) => count[e] >= 5);
      return TEN.filter((id) => strong.includes(elementOf(ctx, id)));
    },
  },
  {
    id: 'venus-mars-tight',
    name: '金火緊密',
    level: 'mixed',
    test: (ctx) => { const o = orbBetween(ctx, 'venus', 'mars'); return o !== null && o <= 3; },
    desc: '金星與火星形成緊密相位，你的魅力與慾望是連在一起的，在感情裡態度直接、有熱度，做創意或業務也容易靠個人風格吸引人。相位緊繃時要留意衝動與佔有慾。建議把這股熱度用在需要主動出擊的事情上，感情裡則多聽對方一句再行動。',
    effect: { 事業: 3, 財運: 1, 家庭: 0, 感情: 5, 健康: 1 },
    careerHint: '業務、演出、設計、美容、活動企劃、運動',
    planetsOf: () => ['venus', 'mars'],
  },
  {
    id: 'saturn-pressure',
    name: '土星壓日月',
    level: 'warn',
    test: (ctx) => ['sun', 'moon'].some((lum) => {
      const o = orbBetween(ctx, 'saturn', lum, ['square', 'opposition']);
      return o !== null && o <= 5;
    }),
    desc: '土星與太陽或月亮形成四分相或對分相，你對自己要求高，常覺得做得不夠、不敢輕易放鬆，年輕時容易缺乏自信。但這種人往往三十歲後越走越穩，靠的是真本事。建議把土星的嚴格用在專業上，對自己的情緒則寬容一點。',
    effect: { 事業: 2, 財運: -1, 家庭: -3, 感情: -3, 健康: -3 },
    planetsOf: (ctx) => ['saturn', ...['sun', 'moon'].filter((lum) => {
      const o = orbBetween(ctx, 'saturn', lum, ['square', 'opposition']);
      return o !== null && o <= 5;
    })],
  },
  {
    id: 'jupiter-trine-sun',
    name: '木星拱太陽',
    level: 'good',
    test: (ctx) => has(ctx, 'jupiter', 'sun', 'trine'),
    desc: '木星與太陽形成三分相，你天生比較樂觀、遇事往好處想，貴人與機會也常常自己出現，很多人會覺得你運氣不錯。要留意的是容易太寬鬆、承諾太多。建議把這份好運用在願意長期投入的事情上，並學會對不重要的邀約說不。',
    effect: { 事業: 6, 財運: 5, 家庭: 3, 感情: 3, 健康: 3 },
    careerHint: '教育、出版、法律、國際貿易、顧問、旅遊',
    planetsOf: () => ['jupiter', 'sun'],
  },
  {
    id: 'asc-sun-same',
    name: '上升太陽同座',
    level: 'good',
    test: (ctx) => {
      if (!ctx.hasTime()) return false;
      const asc = ascSignName(ctx), sun = signNameOf(ctx.planet('sun'));
      return !!asc && !!sun && asc === sun;
    },
    desc: '上升星座跟太陽星座相同，你給人的外在印象與內在真正的自己很一致，表裡如一，別人容易信任你，你也不用花力氣扮演另一種樣子。缺點是特質太單一、比較沒有彈性。建議在需要不同風格的場合，刻意觀察並學習別人的做法。',
    effect: { 事業: 4, 財運: 2, 家庭: 2, 感情: 3, 健康: 2 },
    planetsOf: () => ['sun'],
  },
  {
    id: 'sun-moon-harmony',
    name: '日月調和',
    level: 'good',
    test: (ctx) => has(ctx, 'sun', 'moon', 'trine') || has(ctx, 'sun', 'moon', 'sextile'),
    desc: '太陽與月亮形成三分相或六分相，你想做的與心裡舒服的方向大致一致，情緒穩定、自我認同清楚，做決定時不太內耗，與家人的關係也常常比較和諧。建議善用這份穩定去支持身邊在拉扯中的人，會是你很自然的優勢。',
    effect: { 事業: 3, 財運: 2, 家庭: 5, 感情: 4, 健康: 4 },
    planetsOf: () => ['sun', 'moon'],
  },
  {
    id: 'mars-saturn-hard',
    name: '火土緊張',
    level: 'bad',
    test: (ctx) => { const o = orbBetween(ctx, 'mars', 'saturn', ['square', 'opposition']); return o !== null && o <= 5; },
    desc: '火星與土星形成四分相或對分相，你常感覺想衝卻被什麼卡住，努力很久才看到成果，容易累積挫折與壓抑的怒氣。這種配置練出來的是耐力與紀律。建議把力氣放在能長期累積的技術上，並找一項規律運動，把火氣有出口地放掉。',
    effect: { 事業: 0, 財運: -2, 家庭: -2, 感情: -2, 健康: -4 },
    planetsOf: () => ['mars', 'saturn'],
  },
  {
    id: 'venus-jupiter-soft',
    name: '金木相合',
    level: 'good',
    test: (ctx) => ['conjunction', 'trine', 'sextile'].some((t) => has(ctx, 'venus', 'jupiter', t)),
    desc: '金星與木星形成合相、三分相或六分相，你在人際與金錢上常有好運氣，人緣好、也懂得享受生活，做生意或談合作容易讓對方感到舒服。要留意花費與享受容易過頭。建議固定把一部分收入先存起來，再放心地享受生活。',
    effect: { 事業: 3, 財運: 6, 家庭: 3, 感情: 4, 健康: 1 },
    careerHint: '業務、餐飲、精品、旅遊、公關、藝術經紀',
    planetsOf: () => ['venus', 'jupiter'],
  },
];

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

export const PATTERNS = deepFreeze(RAW_PATTERNS.map((p) => ({
  ...p,
  test: safeTest(p.test),
  planetsOf: safeList(p.planetsOf || (() => [])),
})));

export const PATTERN_LEVEL_LABEL = Object.freeze({
  great: '加分格局',
  good: '助力',
  mixed: '雙面',
  warn: '要留意',
  bad: '課題',
});

// 行業對照表：由太陽星座、天頂星座、第十／六／二宮行星、水火土落座加權（lib/analyze.mjs 用）
export const INDUSTRY_MAP = deepFreeze({
  業務與行銷: {
    signs: ['牡羊座', '獅子座', '雙子座', '射手座'],
    planets: ['mars', 'sun', 'mercury', 'jupiter'],
    houses: [3, 10, 11],
    jobs: ['業務代表', '業務主管', '行銷企劃', '品牌經理', '電話行銷', '保險業務', '汽車業務', '通路業務'],
  },
  不動產與營建: {
    signs: ['金牛座', '巨蟹座', '摩羯座', '天蠍座'],
    planets: ['venus', 'moon', 'saturn', 'pluto'],
    houses: [4, 2, 10],
    jobs: ['不動產經紀人', '房仲業務', '代銷專員', '土地開發', '建設公司專案', '營造工程師', '室內裝修', '包租代管', '估價師', '地政士'],
  },
  金融與投資: {
    signs: ['金牛座', '天蠍座', '摩羯座', '處女座'],
    planets: ['venus', 'pluto', 'saturn', 'jupiter'],
    houses: [2, 8, 10],
    jobs: ['銀行行員', '理財專員', '證券營業員', '投資分析師', '會計師', '財務主管', '保險精算', '信託專員'],
  },
  教育與訓練: {
    signs: ['射手座', '雙子座', '處女座', '水瓶座'],
    planets: ['jupiter', 'mercury', 'sun'],
    houses: [9, 3, 5],
    jobs: ['國中小老師', '高中教師', '大學教授', '補習班老師', '企業內訓講師', '幼教老師', '家教', '線上課程講師'],
  },
  醫療與照護: {
    signs: ['處女座', '巨蟹座', '雙魚座', '天蠍座'],
    planets: ['moon', 'neptune', 'pluto', 'mercury'],
    houses: [6, 12, 8],
    jobs: ['護理師', '醫師', '藥師', '物理治療師', '職能治療師', '長照照服員', '營養師', '醫檢師'],
  },
  科技與工程: {
    signs: ['水瓶座', '處女座', '雙子座', '摩羯座'],
    planets: ['uranus', 'mercury', 'saturn', 'mars'],
    houses: [6, 3, 10],
    jobs: ['軟體工程師', '資訊工程師', '電機工程師', '機械工程師', '系統分析師', '資料分析師', '網路管理員', '品保工程師'],
  },
  設計與創意: {
    signs: ['天秤座', '獅子座', '雙魚座', '金牛座'],
    planets: ['venus', 'neptune', 'sun', 'moon'],
    houses: [5, 12, 2],
    jobs: ['平面設計師', '室內設計師', '影像剪輯', '攝影師', '美術編輯', '遊戲美術', '服裝設計師', '插畫家'],
  },
  餐飲與服務: {
    signs: ['巨蟹座', '金牛座', '天秤座', '雙魚座'],
    planets: ['moon', 'venus', 'jupiter'],
    houses: [6, 4, 7],
    jobs: ['餐廳經營', '主廚', '飯店櫃檯', '門市店長', '旅遊領隊', '客服專員', '美髮設計師', '咖啡師'],
  },
  公職與行政: {
    signs: ['摩羯座', '處女座', '天秤座', '巨蟹座'],
    planets: ['saturn', 'mercury', 'moon'],
    houses: [10, 6, 9],
    jobs: ['公務員', '行政助理', '人資專員', '總務', '法務專員', '警察', '消防員', '戶政人員'],
  },
  傳播與媒體: {
    signs: ['雙子座', '獅子座', '射手座', '水瓶座'],
    planets: ['mercury', 'sun', 'jupiter', 'uranus'],
    houses: [3, 5, 9, 11],
    jobs: ['記者', '編輯', '主播', '節目企劃', '自媒體經營', '公關專員', '文案', '社群小編'],
  },
  諮商與人文: {
    signs: ['雙魚座', '天蠍座', '巨蟹座', '射手座'],
    planets: ['neptune', 'pluto', 'moon', 'jupiter'],
    houses: [12, 8, 9],
    jobs: ['心理諮商師', '社工師', '宗教工作者', '人力顧問', '生涯教練', '志工組織幹部', '哲學研究', '命理工作者'],
  },
  運動與戶外: {
    signs: ['牡羊座', '射手座', '獅子座', '水瓶座'],
    planets: ['mars', 'jupiter', 'sun', 'uranus'],
    houses: [1, 5, 9],
    jobs: ['健身教練', '運動員', '體育老師', '登山嚮導', '物流司機', '消防員', '農場經營', '戶外活動教練'],
  },
});
