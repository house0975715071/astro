// 內建讀音字典（星盤語音解說用）
// 格式照紫微 ../ziwei-desk/kb/pronounce.mjs：
// term：原文；say：送給語音引擎的替代寫法（全部用「只有一個讀音」的同音字，只能是中文）；
// reading：正確讀音（漢語拼音含聲調，台灣標準讀音）；note：說明與查證來源。
// notAfter / notBefore（選填）：前一個字／後一個字是這些時不替換。
//
// 查證原則：以教育部《重編國語辭典修訂本》為準（https://dict.revised.moe.edu.tw/）。
// 辭典沒有收的占星術語，逐字核對各字在該意思下的讀音，note 標「推定」。
// say 等於 term 的條目＝電腦語音本來就念得對，只當讀音備查。
// 摩羯、天蠍、射手不換字，只放備查。

export const PRONOUNCE_VERSION = 1;

// 「進行運動」「執行運作」：行念ㄒㄧㄥˊ 但不是占星的「行運」
const XINGYUN_NOT_AFTER = ['進', '執', '實', '推', '施', '履', '發', '舉', '旅', '運', '可', '自'];
const XINGYUN_NOT_BEFORE = ['動', '作', '用', '算', '輸', '送', '轉', '費', '營', '氣', '將'];

// 「相位」前面接這些字時多半是別的詞（真相位、面相位），不替換
const XIANGWEI_NOT_AFTER = ['真', '面', '手', '互', '照', '長'];

export const PRONOUNCE = [
  // ── 星座 ──
  { term: '天秤座', say: '天平座', reading: 'tiān píng zuò', note: '教育部辭典「天秤」念ㄊㄧㄢ ㄆㄧㄥˊ（秤在此念ㄆㄧㄥˊ，同「天平」），避免念成ㄔㄥˋ' },
  { term: '天秤', say: '天平', reading: 'tiān píng', note: '教育部辭典「天秤」念ㄊㄧㄢ ㄆㄧㄥˊ；不設 notBefore，接「座」時一樣要換' },
  { term: '處女座', say: '楚女座', reading: 'chǔ nǚ zuò', note: '教育部辭典「處女」念ㄔㄨˇ ㄋㄩˇ（處在此為未出嫁的意思，三聲），避免念成ㄔㄨˋ' },
  { term: '摩羯座', say: '摩羯座', reading: 'mó jié zuò', note: '教育部辭典「摩羯」念ㄇㄛˊ ㄐㄧㄝˊ，念得對，備查；規格書指定不換字' },
  { term: '天蠍座', say: '天蠍座', reading: 'tiān xiē zuò', note: '教育部辭典「蠍」念ㄒㄧㄝ，念得對，備查；規格書指定不換字' },
  { term: '射手座', say: '射手座', reading: 'shè shǒu zuò', note: '射念ㄕㄜˋ，念得對，備查；規格書指定不換字' },

  // ── 相位 ──
  { term: '相位', say: '象位', reading: 'xiàng wèi', note: '占星的相位＝行星之間的角度關係，相取「相貌、形象」的意思念四聲ㄒㄧㄤˋ（教育部辭典「相位」物理學條目亦念ㄒㄧㄤˋ ㄨㄟˋ）', notAfter: XIANGWEI_NOT_AFTER },
  { term: '合相', say: '合象', reading: 'hé xiàng', note: '相念四聲ㄒㄧㄤˋ（同「相位」，辭典未收占星詞，依「相位」推定）' },
  { term: '六分相', say: '六分象', reading: 'liù fēn xiàng', note: '相念四聲ㄒㄧㄤˋ（同「相位」，推定）' },
  { term: '四分相', say: '四分象', reading: 'sì fēn xiàng', note: '相念四聲ㄒㄧㄤˋ（同「相位」，推定）' },
  { term: '三分相', say: '三分象', reading: 'sān fēn xiàng', note: '相念四聲ㄒㄧㄤˋ（同「相位」，推定）' },
  { term: '對分相', say: '對分象', reading: 'duì fēn xiàng', note: '相念四聲ㄒㄧㄤˋ（同「相位」，推定）' },

  // ── 占星術語 ──
  { term: '占星', say: '瞻星', reading: 'zhān xīng', note: '教育部辭典「占星」念ㄓㄢ ㄒㄧㄥ（占＝占卜，一聲），避免念成占據的ㄓㄢˋ' },
  { term: '行運', say: '形運', reading: 'xíng yùn', note: '教育部辭典「行運」念ㄒㄧㄥˊ ㄩㄣˋ（運行、走運的行），避免念成ㄏㄤˊ', notAfter: XINGYUN_NOT_AFTER, notBefore: XINGYUN_NOT_BEFORE },
  { term: '落陷', say: '洛陷', reading: 'luò xiàn', note: '落念ㄌㄨㄛˋ（教育部辭典「陷落」念ㄒㄧㄢˋ ㄌㄨㄛˋ），避免念成ㄌㄚˋ；沿用紫微字典' },
  { term: '擢升', say: '卓升', reading: 'zhuó shēng', note: '教育部辭典「擢升」念ㄓㄨㄛˊ ㄕㄥ；擢字少見，換成同音的卓' },
  { term: '逆行', say: '逆行', reading: 'nì xíng', note: '教育部辭典「逆行」念ㄋㄧˋ ㄒㄧㄥˊ，念得對，備查' },

  // ── 解說常用詞裡的多音字 ──
  { term: '執著', say: '執酌', reading: 'zhí zhuó', note: '教育部辭典「執著」念ㄓˊ ㄓㄨㄛˊ，避免念成ㄓㄜ' },
  { term: '沉著', say: '沉酌', reading: 'chén zhuó', note: '教育部辭典「沉著」念ㄔㄣˊ ㄓㄨㄛˊ，避免念成ㄓㄜ' },
  { term: '強迫', say: '搶迫', reading: 'qiǎng pò', note: '教育部辭典「強迫」念ㄑㄧㄤˇ ㄆㄛˋ（台灣標準讀音，強念三聲）' },
  { term: '給予', say: '給予', reading: 'jǐ yǔ', note: '教育部辭典「給予」念ㄐㄧˇ ㄩˇ，電腦語音常念成ㄍㄟˇ；同音字不好找，講稿一律改寫成「提供」，這條只當備查' },

  // ── 一般用語裡的多音字（從紫微字典照抄） ──
  { term: '行業', say: '航業', reading: 'háng yè', note: '教育部辭典「行業」念ㄏㄤˊ ㄧㄝˋ；「執行業務」這類的行念ㄒㄧㄥˊ，不替換', notAfter: ['執', '進', '運', '推', '實', '施', '奉', '履', '發', '流', '旅', '先', '可', '自'] },
  { term: '銀行', say: '銀航', reading: 'yín háng', note: '行念ㄏㄤˊ（教育部辭典「私人銀行業務」）' },
  { term: '長輩', say: '掌輩', reading: 'zhǎng bèi', note: '教育部辭典「長輩」念ㄓㄤˇ ㄅㄟˋ' },
  { term: '重視', say: '重視', reading: 'zhòng shì', note: '教育部辭典「重視」念ㄓㄨㄥˋ ㄕˋ，念得對，備查' },
  { term: '還是', say: '還是', reading: 'hái shi', note: '教育部辭典「還是」念ㄏㄞˊ ˙ㄕ，念得對，備查' },
  { term: '教養', say: '叫養', reading: 'jiào yǎng', note: '教育部辭典「教養」念ㄐㄧㄠˋ ㄧㄤˇ，避免念成一聲' },
  { term: '樂於', say: '樂於', reading: 'lè yú', note: '樂念ㄌㄜˋ（同教育部辭典「樂意」），念得對，備查' },
  { term: '差距', say: '插距', reading: 'chā jù', note: '教育部辭典「差距」念ㄔㄚ ㄐㄩˋ，避免念成ㄔㄚˋ' },
  { term: '調整', say: '條整', reading: 'tiáo zhěng', note: '教育部辭典「調整」念ㄊㄧㄠˊ ㄓㄥˇ，避免念成ㄉㄧㄠˋ' },
  { term: '參與', say: '餐預', reading: 'cān yù', note: '教育部辭典「參與」念ㄘㄢ ㄩˋ（台灣標準讀音，與念四聲）' },
  { term: '便宜', say: '便宜', reading: 'pián yi', note: '價錢低的意思念ㄆㄧㄢˊ ˙ㄧ（教育部辭典）；念得對，備查' },
  { term: '厚積薄發', say: '厚積博發', reading: 'hòu jī bó fā', note: '教育部辭典「厚積薄發」的薄念ㄅㄛˊ，避免念成ㄅㄠˊ' },
  { term: '處理', say: '楚理', reading: 'chǔ lǐ', note: '教育部辭典「處理」念ㄔㄨˇ ㄌㄧˇ，避免念成ㄔㄨˋ' },
];

// 講稿前處理：英文縮寫與符號先換成中文，再過讀音字典
export const SPEAK_REPLACE = [
  ['ASC', '上升點'],
  ['MC', '天頂'],
  ['DSC', '下降點'],
  ['IC', '天底'],
  ['℞', '逆行'],
];

for (const e of PRONOUNCE) Object.freeze(e);
Object.freeze(PRONOUNCE);
for (const p of SPEAK_REPLACE) Object.freeze(p);
Object.freeze(SPEAK_REPLACE);
