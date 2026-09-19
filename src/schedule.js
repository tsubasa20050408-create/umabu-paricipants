// 曜日ごとの練習時限の【既定値】（May練習参加者.xlsxを元に作成）
// 管理画面の設定タブで編集した内容は Redis (practice:weeklySlots) に保存され、
// そちらが優先される。ここはサーバ未設定時のフォールバック。
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

// 参加者フォームに表示しない（管理者が記録する）スロット
export const ADMIN_ONLY_SLOTS = new Set(['朝運動']);

// ─── 時限パターンの編集で扱うスロット ───────────────────────
// 朝運動は全曜日固定（編集不可）。管理者が記録し、馬当番の割当に使う。
export const ASA_SLOT = '朝運動';
export const KOMA_SLOTS = ['1限', '2限', '3限'];
export const GOZEN_SLOTS = ['午前', '午後'];
// Excel の行順を決める正準順序
export const SLOT_ORDER = [ASA_SLOT, ...KOMA_SLOTS, ...GOZEN_SLOTS];
// 午前/午後を選べる曜日（土・日のみ）
export const GOZEN_ALLOWED_DOW = new Set([5, 6]);

// その曜日が「限で指定」か「午前・午後で指定」かを保存値から判定
export function slotModeOf(slots) {
  return (slots || []).some(s => GOZEN_SLOTS.includes(s)) ? 'gozen' : 'koma';
}

// 任意の入力を { 0..6: string[] } に整える。
// ・キー0〜6を必ず埋める / 未知のスロットを除去 / 朝運動を必ず先頭に付与
// ・月〜金からは午前・午後を除去
// ・限と午前/午後の混在は限を優先して排他化
// ・SLOT_ORDER で並べ替え
export function normalizeWeeklySlots(raw) {
  const out = {};
  for (let dow = 0; dow <= 6; dow++) {
    const src = Array.isArray(raw?.[dow]) ? raw[dow] : [];
    let picked = SLOT_ORDER.filter(s => s !== ASA_SLOT && src.includes(s));
    if (!GOZEN_ALLOWED_DOW.has(dow)) {
      picked = picked.filter(s => !GOZEN_SLOTS.includes(s));
    }
    if (picked.some(s => KOMA_SLOTS.includes(s))) {
      picked = picked.filter(s => !GOZEN_SLOTS.includes(s));
    }
    out[dow] = [ASA_SLOT, ...picked];
  }
  return out;
}

// 学年別メンバー（shift-app と同一）
export const INITIAL_GROUPS = {
  third:  ['日下部', '須藤', '松﨑', '新行内', '中林', '渡邊', '高杉'],
  second: ['常山', '元橋', '金子', '大塚', '増田', '柴田', '浦澤', '栗山'],
  first:  ['落合', '栗林', '杉山', '水平', '岡', '土井', '村上', '物部', '堀', '兼杉', '作島', '吉越', '田代'],
};

export const GRADE_LABEL = { third: '3年', second: '2年', first: '1年' };
export const GRADE_ORDER = ['third', 'second', 'first'];
// 学年色（theme.js の C.primary / C.amber / C.teal と対応。循環 import を避けるため hex 直書き）
export const GRADE_COLOR = { third: '#cc785c', second: '#e8a55a', first: '#5db8a6' };

// 月のスケジュール生成: [{ date: 'YYYY-MM-DD', day: 1-31, dow: 0-6, slots: [...] }]
export function buildMonthSchedule(year, month, weeklySlots = WEEKLY_SLOTS) {
  const pattern = normalizeWeeklySlots(weeklySlots);
  const daysInMonth = new Date(year, month, 0).getDate();
  const out = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const raw = new Date(year, month - 1, d).getDay(); // 0=Sun
    const dow = raw === 0 ? 6 : raw - 1;
    const slots = pattern[dow];
    if (slots && slots.length) {
      out.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        dow,
        slots: [...slots],
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
