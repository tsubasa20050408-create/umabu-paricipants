// 曜日ごとの練習時限（May練習参加者.xlsxを元に作成）
// 月～日: 0=月,1=火,...,6=日
export const WEEKLY_SLOTS = {
  0: ['朝運動', '2限', '3限'],     // 月
  1: ['朝運動', '2限', '3限'],     // 火
  2: ['朝運動', '1限'],            // 水
  3: ['朝運動'],                   // 木
  4: ['朝運動', '3限'],            // 金
  5: ['朝運動'],                   // 土
  6: ['朝運動', '午前', '午後'],   // 日
};

export const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

// 学年別メンバー（shift-app と同一）
export const INITIAL_GROUPS = {
  third:  ['日下部', '須藤', '松﨑', '新行内', '中林', '渡邊', '高杉'],
  second: ['常山', '元橋', '金子', '大塚', '増田', '柴田', '浦澤', '栗山'],
  first:  ['落合', '栗林', '杉山', '水平', '岡', '土井', '村上', '物部', '堀', '兼杉', '作島', '吉越', '田代'],
};

export const GRADE_LABEL = { third: '3年', second: '2年', first: '1年' };
export const GRADE_ORDER = ['third', 'second', 'first'];
export const GRADE_COLOR = { third: '#c084fc', second: '#60a5fa', first: '#34d399' };

// 月のスケジュール生成: [{ date: 'YYYY-MM-DD', day: 1-31, dow: 0-6, slots: [...] }]
export function buildMonthSchedule(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const out = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const raw = new Date(year, month - 1, d).getDay(); // 0=Sun
    const dow = raw === 0 ? 6 : raw - 1;
    const slots = WEEKLY_SLOTS[dow];
    if (slots && slots.length) {
      out.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        dow,
        slots,
      });
    }
  }
  return out;
}

// 学年で順序を作る: 3年→2年→1年
export function orderedMembers(groups) {
  return GRADE_ORDER.flatMap(g => groups[g].map(name => ({ name, grade: g })));
}

export function gradeOf(name, groups) {
  for (const g of GRADE_ORDER) {
    if (groups[g].includes(name)) return g;
  }
  return null;
}

// Excel日付シリアル (1900-based, with leap-bug)
export function excelSerial(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const epoch = Date.UTC(1899, 11, 30); // Excelの基準日
  return Math.floor((d.getTime() - epoch) / 86400000);
}
