// 人生週期（木星／土星／天王星／海王星的行運週期）
// 規格：docs/astro-contract.md 第 5 節。文字全部原創、第二人稱、台灣口語。
// 年齡區間依 ageFrom 排序；status 由 cycleStatus(cycle, age) 決定。

export const CYCLES = Object.freeze([
  Object.freeze({
    id: 'saturn-square-child',
    name: '童年土星四分',
    planet: 'saturn',
    ageFrom: 6,
    ageTo: 8,
    text: '這幾年你開始進入學校和團體，通常是人生裡最早感受到規矩、比較與責任的階段。可能會覺得大人的要求變多、自由變少，也開始在意自己做得好不好。這是學習自律、建立基本習慣的起點，很多做事的態度就是從這裡養成的。',
    advice: '回頭看這一段，可以想想你對規矩和責任的反應是從哪裡來的，有些習慣到現在還在影響你。',
  }),
  Object.freeze({
    id: 'jupiter-return-1',
    name: '木星回歸（十二歲前後）',
    planet: 'jupiter',
    ageFrom: 11,
    ageTo: 13,
    text: '木星走完一圈回到出生時的位置，通常帶來視野打開、對世界充滿好奇的感覺。你可能開始有自己的興趣、朋友圈變廣，也容易對未來有很多想像。這段時間吸收力很強，接觸到什麼常常會影響很久，喜歡的東西也容易延續到成年。',
    advice: '如果你家裡有這個年紀的孩子，多讓他接觸不同的事物，這幾年種下的興趣常常會跟一輩子。',
  }),
  Object.freeze({
    id: 'saturn-square-young',
    name: '成年土星四分',
    planet: 'saturn',
    ageFrom: 20,
    ageTo: 22,
    text: '你正從學生身分走向社會，容易感覺到選擇的壓力：要念什麼、做什麼、往哪裡去。土星在這裡提醒你，之前順著走的路線要開始自己負責。常常會有一段迷惘或想證明自己的時期，這很正常，不代表你走錯了。',
    advice: '不用急著把人生定案，先把一件事做到有成果，累積出可以說服你自己的證據，方向會慢慢清楚。',
  }),
  Object.freeze({
    id: 'jupiter-return-2',
    name: '木星回歸（二十四歲前後）',
    planet: 'jupiter',
    ageFrom: 23,
    ageTo: 25,
    text: '出社會後的木星回歸，機會通常變多：換工作、出國、進修、認識新圈子都可能在這幾年發生。你容易變得樂觀，也容易什麼都想試。這段時間適合大量嘗試，但要留意別因為機會太多而分散，最後什麼都做一半。',
    advice: '把你想做的事列出來，挑兩件認真投入，剩下的先放著，之後還會有機會，不用擔心錯過什麼。',
  }),
  Object.freeze({
    id: 'saturn-return-1',
    name: '第一次土星回歸',
    planet: 'saturn',
    ageFrom: 28,
    ageTo: 30,
    text: '土星走完一圈回到出生位置，這是多數人最早認真面對「我到底要什麼」的時期。工作、感情、住所常常在這幾年重新洗牌，不合適的關係或路線容易被迫檢視。過程通常不輕鬆，但留下來的東西會是真正屬於你的結構。',
    advice: '把這段當成整理期而不是危機期：該結束的好好收尾，該承諾的認真投入，你三十歲之後會輕鬆很多。',
  }),
  Object.freeze({
    id: 'jupiter-return-3',
    name: '木星回歸（三十六歲前後）',
    planet: 'jupiter',
    ageFrom: 35,
    ageTo: 37,
    text: '三十多歲的木星回歸，常常是把前幾年累積的經驗放大的時候。你可能在職場上被看見、被交付更大的責任，或是找到更適合發揮的位置。心態上也比較願意相信自己，這時候的擴張通常比二十多歲更有根基，也更容易留得住。',
    advice: '這是往上走的好時機，主動爭取你想要的角色，但擴張的速度要配合家庭和體力，別一口氣衝太快。',
  }),
  Object.freeze({
    id: 'uranus-opposition',
    name: '天王星對分',
    planet: 'uranus',
    ageFrom: 40,
    ageTo: 42,
    text: '行運天王星走到本命天王星的對面，常常會冒出一股「這樣下去不行」的念頭。有人想換跑道、有人想搬家、有人忽然對一直忍耐的事失去耐心。這不是你出了問題，而是被壓住很久的需求想要出來透氣，是很多人口中的中年轉折。',
    advice: '想改變很正常，但先小規模試，別一次把工作、關係、住所全部推翻，替你自己留一條可以回頭的路。',
  }),
  Object.freeze({
    id: 'neptune-square',
    name: '海王星四分',
    planet: 'neptune',
    ageFrom: 40,
    ageTo: 42,
    text: '跟天王星對分幾乎同時發生，海王星讓你對原本相信的目標開始感到模糊：努力到現在，這真的是我要的嗎？你可能對成就感的來源產生懷疑，或忽然對心靈、藝術、助人的事更有感覺。這段時間的迷惘是在幫你重新校準方向。',
    advice: '允許你自己有一段不確定的時間，多做一點沒有目的的事，答案通常在放鬆的時候才會浮現。',
  }),
  Object.freeze({
    id: 'saturn-opposition',
    name: '土星對分',
    planet: 'saturn',
    ageFrom: 43,
    ageTo: 45,
    text: '土星走到本命土星的對面，像是一次期中考：你二十九歲時建立的結構，現在要被檢驗還撐不撐得住。工作上可能面對責任的頂點，家裡也可能同時有上一代與下一代要照顧。累是真的，但這段撐過去，後面的路會清楚很多。',
    advice: '把你的時間和體力當成有限資源來分配，該授權的授權、該拒絕的拒絕，別什麼事都自己扛，留一點餘裕。',
  }),
  Object.freeze({
    id: 'jupiter-return-4',
    name: '木星回歸（四十八歲前後）',
    planet: 'jupiter',
    ageFrom: 47,
    ageTo: 49,
    text: '快五十歲的木星回歸，機會的形式常常變成「累積的人脈與信用開始回報」。你可能被找去合作、帶人、或發展副業。這時候的擴張比較不是往外衝，而是把過去的資源重新組合成新的可能，做起來會比年輕時省力也更有把握。',
    advice: '盤點你手上真正累積下來的東西：人脈、經驗、信用，用它們去開新局，比從零開始省力很多。',
  }),
  Object.freeze({
    id: 'saturn-square-mid',
    name: '中年土星四分',
    planet: 'saturn',
    ageFrom: 51,
    ageTo: 53,
    text: '土星走到跟出生位置成直角的地方，常常是「調整方向」的提醒。你四十多歲擴張出去的事，現在要檢查哪些值得留、哪些該收。身體也開始會抗議硬撐，作息和節奏需要重新安排，這是把人生後半段規畫得更務實的時候。',
    advice: '把不值得的事放掉一些，留下的做得更精，並且認真對待你身體發出的訊號，別再靠意志力硬撐。',
  }),
  Object.freeze({
    id: 'saturn-return-2',
    name: '第二次土星回歸',
    planet: 'saturn',
    ageFrom: 57,
    ageTo: 60,
    text: '土星第二次回到出生位置，你對人生下半場的規畫會變得很實際：什麼時候退、退了做什麼、錢和身體夠不夠用。有人在這時交棒，有人反而找到不必再為別人負責的自由。這是把「我是誰」重新定義的時期，跟二十九歲那次一樣重要。',
    advice: '先把你的財務和作息安排清楚，再想「接下來想做什麼」，順序對了會踏實很多，也比較不會慌。',
  }),
  Object.freeze({
    id: 'jupiter-return-5',
    name: '木星回歸（六十歲前後）',
    planet: 'jupiter',
    ageFrom: 59,
    ageTo: 61,
    text: '跟第二次土星回歸接在一起的木星回歸，讓這段時間除了整理，也有新的樂趣進來：學新東西、旅行、陪家人、發展一直沒空做的興趣。你可能會發現心境比想像中年輕，願意再去試一些以前覺得跟自己無關的事。',
    advice: '留一部分時間給純粹讓你自己開心的事，不用每件事都要有用途，這幾年的快樂是很好的養分。',
  }),
  Object.freeze({
    id: 'jupiter-return-6',
    name: '木星回歸（七十二歲前後）',
    planet: 'jupiter',
    ageFrom: 71,
    ageTo: 73,
    text: '七十多歲的木星回歸，重點常常是回顧與傳承：把經驗說給願意聽的人、整理自己的故事、決定什麼留給後代。你的心情容易變得寬容，看事情的角度也更長遠，過去計較的事現在多半覺得沒那麼要緊了。',
    advice: '把你的故事和心得記下來或說出來，對家人來說，這比任何東西都珍貴，也是他們日後最想留住的。',
  }),
  Object.freeze({
    id: 'uranus-return',
    name: '天王星回歸',
    planet: 'uranus',
    ageFrom: 84,
    ageTo: 86,
    text: '天王星走完整整一圈回到出生位置，這是很少人能親身經歷的週期，木星與土星也常在這前後同時回到出生的角度。你看世界的方式可能又變得像小時候一樣自由，不太在意別人怎麼想，也常常在這時看見時代真的變了。',
    advice: '用你自己喜歡的方式過每一天，你已經有資格不管別人的眼光，想做什麼、想見誰，就去安排。',
  }),
]);

/**
 * 判斷某個週期相對於目前年齡是過去、進行中還是未來。
 * @param {{ageFrom:number, ageTo:number}} cycle
 * @param {number} age 目前年齡（整數或小數皆可）
 * @returns {'past'|'now'|'future'}
 */
export function cycleStatus(cycle, age) {
  if (!Number.isFinite(age)) return 'future';
  if (age < cycle.ageFrom) return 'future';
  if (age > cycle.ageTo) return 'past';
  return 'now';
}
