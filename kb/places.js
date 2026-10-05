// kb/places.mjs — 出生地清單（星盤系統知識庫）
//
// 資料來源與精度：
// - 台灣 22 縣市：座標取「縣市政府所在地」（例：桃園市政府、台中市政府台灣大道市政大樓、
//   台南市政府永華市政中心、南投縣政府中興新村），小數 4 位，維基百科／地圖等級。
// - 桃園 13 區：座標取各區公所，小數 4 位。
// - 海外城市：市中心代表點（維基百科等級），小數 4 位。
// - 時區一律用 IANA 名稱，交給 lib/timezone.mjs 用 Intl.DateTimeFormat 換算。
// - 精度說明：出生地只到縣市／市區等級（不是門牌）。同一縣市內的座標差距對星盤的影響
//   主要在上升點與宮頭，誤差約 2～3 度以內；行星星座與度數幾乎不受影響。
// - 中國大陸城市統一用 Asia/Shanghai（全國同一時區）。
//
// 全部資料物件用 Object.freeze 鎖住，避免被外部改動。

const freezeDeep = (v) => {
  if (Array.isArray(v)) { v.forEach(freezeDeep); return Object.freeze(v); }
  if (v && typeof v === 'object') { Object.values(v).forEach(freezeDeep); return Object.freeze(v); }
  return v;
};

export const PLACE_GROUPS = Object.freeze(['台灣', '桃園各區', '亞洲', '大洋洲', '美洲', '歐洲']);

/** 預設出生地（桃園市） */
export const DEFAULT_PLACE_ID = 'TW-TAO';

const P = (id, name, group, lat, lon, tz, keywords = []) =>
  ({ id, name, group, lat, lon, tz, keywords });

export const PLACES = freezeDeep([
  // ── 台灣 22 縣市（縣市政府所在地）──
  P('TW-TPE', '台北市', '台灣', 25.0375, 121.5637, 'Asia/Taipei', ['台北', '臺北', '北市', '信義區']),
  P('TW-NWT', '新北市', '台灣', 25.0120, 121.4657, 'Asia/Taipei', ['新北', '板橋', '台北縣', '臺北縣']),
  P('TW-TAO', '桃園市', '台灣', 24.9937, 121.3010, 'Asia/Taipei', ['桃園', '桃園縣']),
  P('TW-TXG', '台中市', '台灣', 24.1618, 120.6469, 'Asia/Taipei', ['台中', '臺中', '西屯', '台中縣', '臺中縣']),
  P('TW-TNN', '台南市', '台灣', 22.9926, 120.1852, 'Asia/Taipei', ['台南', '臺南', '安平', '台南縣', '臺南縣']),
  P('TW-KHH', '高雄市', '台灣', 22.6206, 120.3120, 'Asia/Taipei', ['高雄', '苓雅', '高雄縣']),
  P('TW-KEE', '基隆市', '台灣', 25.1315, 121.7441, 'Asia/Taipei', ['基隆', '中正區']),
  P('TW-HSZ', '新竹市', '台灣', 24.8066, 120.9686, 'Asia/Taipei', ['新竹', '竹市']),
  P('TW-HSQ', '新竹縣', '台灣', 24.8268, 121.0128, 'Asia/Taipei', ['新竹', '竹北', '竹縣']),
  P('TW-MIA', '苗栗縣', '台灣', 24.5645, 120.8207, 'Asia/Taipei', ['苗栗', '苗栗市']),
  P('TW-CHA', '彰化縣', '台灣', 24.0755, 120.5444, 'Asia/Taipei', ['彰化', '彰化市']),
  P('TW-NAN', '南投縣', '台灣', 23.9610, 120.6889, 'Asia/Taipei', ['南投', '中興新村', '南投市']),
  P('TW-YUN', '雲林縣', '台灣', 23.7092, 120.4313, 'Asia/Taipei', ['雲林', '斗六']),
  P('TW-CYI', '嘉義市', '台灣', 23.4801, 120.4491, 'Asia/Taipei', ['嘉義', '嘉市']),
  P('TW-CYQ', '嘉義縣', '台灣', 23.4592, 120.2937, 'Asia/Taipei', ['嘉義', '太保', '嘉縣']),
  P('TW-PIF', '屏東縣', '台灣', 22.6829, 120.4880, 'Asia/Taipei', ['屏東', '屏東市']),
  P('TW-ILA', '宜蘭縣', '台灣', 24.7302, 121.7632, 'Asia/Taipei', ['宜蘭', '宜蘭市']),
  P('TW-HUA', '花蓮縣', '台灣', 23.9872, 121.6016, 'Asia/Taipei', ['花蓮', '花蓮市']),
  P('TW-TTT', '台東縣', '台灣', 22.7554, 121.1503, 'Asia/Taipei', ['台東', '臺東', '台東市']),
  P('TW-PEN', '澎湖縣', '台灣', 23.5654, 119.5866, 'Asia/Taipei', ['澎湖', '馬公']),
  P('TW-KIN', '金門縣', '台灣', 24.4368, 118.3187, 'Asia/Taipei', ['金門', '金城']),
  P('TW-LIE', '連江縣', '台灣', 26.1571, 119.9505, 'Asia/Taipei', ['連江', '馬祖', '南竿']),

  // ── 桃園 13 區（區公所）──
  P('TW-TAO-TY', '桃園區', '桃園各區', 24.9964, 121.3018, 'Asia/Taipei', ['桃園', '桃園市桃園區', '藝文特區']),
  P('TW-TAO-ZL', '中壢區', '桃園各區', 24.9654, 121.2250, 'Asia/Taipei', ['中壢', '中原', '內壢']),
  P('TW-TAO-PZ', '平鎮區', '桃園各區', 24.9450, 121.2183, 'Asia/Taipei', ['平鎮', '南勢']),
  P('TW-TAO-BD', '八德區', '桃園各區', 24.9289, 121.2847, 'Asia/Taipei', ['八德', '大湳']),
  P('TW-TAO-YM', '楊梅區', '桃園各區', 24.9165, 121.1459, 'Asia/Taipei', ['楊梅', '埔心', '富岡']),
  P('TW-TAO-LZ', '蘆竹區', '桃園各區', 25.0451, 121.2920, 'Asia/Taipei', ['蘆竹', '南崁']),
  P('TW-TAO-DX', '大溪區', '桃園各區', 24.8815, 121.2867, 'Asia/Taipei', ['大溪', '埔頂']),
  P('TW-TAO-GS', '龜山區', '桃園各區', 24.9930, 121.3396, 'Asia/Taipei', ['龜山', '林口長庚', '迴龍', '山鶯']),
  P('TW-TAO-LT', '龍潭區', '桃園各區', 24.8636, 121.2160, 'Asia/Taipei', ['龍潭', '中興', '烏樹林']),
  P('TW-TAO-DY', '大園區', '桃園各區', 25.0630, 121.1962, 'Asia/Taipei', ['大園', '青埔', '高鐵', '機場']),
  P('TW-TAO-GY', '觀音區', '桃園各區', 25.0351, 121.0770, 'Asia/Taipei', ['觀音', '草漯', '新坡']),
  P('TW-TAO-XW', '新屋區', '桃園各區', 24.9723, 121.1050, 'Asia/Taipei', ['新屋', '永安']),
  P('TW-TAO-FX', '復興區', '桃園各區', 24.8199, 121.3524, 'Asia/Taipei', ['復興', '角板山', '拉拉山']),

  // ── 亞洲 ──
  P('JP-TYO', '東京', '亞洲', 35.6895, 139.6917, 'Asia/Tokyo', ['日本', '東京都']),
  P('JP-OSA', '大阪', '亞洲', 34.6937, 135.5023, 'Asia/Tokyo', ['日本', '關西']),
  P('JP-FUK', '福岡', '亞洲', 33.5902, 130.4017, 'Asia/Tokyo', ['日本', '九州']),
  P('KR-SEL', '首爾', '亞洲', 37.5665, 126.9780, 'Asia/Seoul', ['韓國', '南韓', '漢城']),
  P('KR-PUS', '釜山', '亞洲', 35.1796, 129.0756, 'Asia/Seoul', ['韓國', '南韓']),
  P('HK-HKG', '香港', '亞洲', 22.3193, 114.1694, 'Asia/Hong_Kong', ['港', '九龍']),
  P('MO-MFM', '澳門', '亞洲', 22.1987, 113.5439, 'Asia/Macau', ['澳']),
  P('CN-SHA', '上海', '亞洲', 31.2304, 121.4737, 'Asia/Shanghai', ['中國', '大陸', '滬']),
  P('CN-BJS', '北京', '亞洲', 39.9042, 116.4074, 'Asia/Shanghai', ['中國', '大陸', '京']),
  P('CN-CAN', '廣州', '亞洲', 23.1291, 113.2644, 'Asia/Shanghai', ['中國', '大陸', '廣東']),
  P('CN-SZX', '深圳', '亞洲', 22.5431, 114.0579, 'Asia/Shanghai', ['中國', '大陸', '廣東']),
  P('CN-XMN', '廈門', '亞洲', 24.4798, 118.0894, 'Asia/Shanghai', ['中國', '大陸', '福建']),
  P('SG-SIN', '新加坡', '亞洲', 1.3521, 103.8198, 'Asia/Singapore', ['星洲', '獅城']),
  P('MY-KUL', '吉隆坡', '亞洲', 3.1390, 101.6869, 'Asia/Kuala_Lumpur', ['馬來西亞', '大馬']),
  P('TH-BKK', '曼谷', '亞洲', 13.7563, 100.5018, 'Asia/Bangkok', ['泰國']),
  P('PH-MNL', '馬尼拉', '亞洲', 14.5995, 120.9842, 'Asia/Manila', ['菲律賓']),
  P('ID-JKT', '雅加達', '亞洲', -6.2088, 106.8456, 'Asia/Jakarta', ['印尼']),
  P('VN-SGN', '胡志明市', '亞洲', 10.8231, 106.6297, 'Asia/Ho_Chi_Minh', ['越南', '西貢']),
  P('VN-HAN', '河內', '亞洲', 21.0278, 105.8342, 'Asia/Ho_Chi_Minh', ['越南']),

  // ── 大洋洲 ──
  P('AU-SYD', '雪梨', '大洋洲', -33.8688, 151.2093, 'Australia/Sydney', ['澳洲', '澳大利亞', '新南威爾斯']),
  P('AU-MEL', '墨爾本', '大洋洲', -37.8136, 144.9631, 'Australia/Melbourne', ['澳洲', '澳大利亞', '維多利亞']),
  P('AU-BNE', '布里斯本', '大洋洲', -27.4698, 153.0251, 'Australia/Brisbane', ['澳洲', '澳大利亞', '昆士蘭']),
  P('NZ-AKL', '奧克蘭', '大洋洲', -36.8485, 174.7633, 'Pacific/Auckland', ['紐西蘭']),

  // ── 美洲 ──
  P('US-LAX', '洛杉磯', '美洲', 34.0522, -118.2437, 'America/Los_Angeles', ['美國', '加州', '洛城']),
  P('US-SFO', '舊金山', '美洲', 37.7749, -122.4194, 'America/Los_Angeles', ['美國', '加州', '三藩市', '灣區']),
  P('US-SEA', '西雅圖', '美洲', 47.6062, -122.3321, 'America/Los_Angeles', ['美國', '華盛頓州']),
  P('US-CHI', '芝加哥', '美洲', 41.8781, -87.6298, 'America/Chicago', ['美國', '伊利諾']),
  P('US-NYC', '紐約', '美洲', 40.7128, -74.0060, 'America/New_York', ['美國', '曼哈頓']),
  P('US-HNL', '檀香山', '美洲', 21.3069, -157.8583, 'Pacific/Honolulu', ['美國', '夏威夷', '火奴魯魯']),
  P('CA-YVR', '溫哥華', '美洲', 49.2827, -123.1207, 'America/Vancouver', ['加拿大', '卑詩']),
  P('CA-YYZ', '多倫多', '美洲', 43.6532, -79.3832, 'America/Toronto', ['加拿大', '安大略']),

  // ── 歐洲 ──
  P('GB-LON', '倫敦', '歐洲', 51.5074, -0.1278, 'Europe/London', ['英國']),
  P('FR-PAR', '巴黎', '歐洲', 48.8566, 2.3522, 'Europe/Paris', ['法國']),
  P('DE-BER', '柏林', '歐洲', 52.5200, 13.4050, 'Europe/Berlin', ['德國']),
  P('NL-AMS', '阿姆斯特丹', '歐洲', 52.3676, 4.9041, 'Europe/Amsterdam', ['荷蘭']),
]);

const BY_ID = Object.freeze(Object.fromEntries(PLACES.map((p) => [p.id, p])));

/** 依 id 找地點；找不到回 null */
export function findPlace(id) {
  if (typeof id !== 'string') return null;
  return BY_ID[id.trim()] || null;
}

/** 搜尋地點：name 或 keywords 包含 q（不分大小寫），最多回前 20 筆；q 空白回空陣列 */
export function searchPlaces(q) {
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const p of PLACES) {
    const hit = p.name.toLowerCase().includes(s) ||
      p.keywords.some((k) => k.toLowerCase().includes(s)) ||
      p.id.toLowerCase() === s;
    if (hit) { out.push(p); if (out.length >= 20) break; }
  }
  return out;
}
