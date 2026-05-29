import * as XLSX from 'xlsx';
import { DOW_LABELS, excelSerial, orderedMembers } from './schedule.js';

// May練習参加者.xlsx の形式で出力
// 列: A=日付シリアル / B=曜日 / C=時限 / D=参加者(カンマ区切り) / E=馬名
export function exportPracticeXlsx({ year, month, schedule, responses, groups, horses = {}, asaUndo = {}, gozenAssign = {} }) {
  const members = orderedMembers(groups);
  const wb = XLSX.utils.book_new();
  const aoa = [];

  for (const day of schedule) {
    let firstRow = true;
    for (const slot of day.slots) {
      const key = `${day.date}__${slot}`;

      if (slot === '朝運動') {
        const names = asaUndo[day.date] || [];
        aoa.push([
          firstRow ? excelSerial(day.date) : '',
          firstRow ? DOW_LABELS[day.dow] : '',
          '朝運動',
          names.join('、'),
          '',
        ]);
        firstRow = false;
        continue;
      }

      if (slot === '午前' && gozenAssign[day.date]) {
        for (const koma of ['1限', '2限']) {
          const names = gozenAssign[day.date][koma] || [];
          aoa.push([
            firstRow ? excelSerial(day.date) : '',
            firstRow ? DOW_LABELS[day.dow] : '',
            koma,
            names.join('、'),
            horses[`${day.date}__${koma}`] || '',
          ]);
          firstRow = false;
        }
        continue;
      }

      const attendees = members
        .filter(m => responses[m.name]?.slots?.[key])
        .map(m => m.name);
      aoa.push([
        firstRow ? excelSerial(day.date) : '',
        firstRow ? DOW_LABELS[day.dow] : '',
        slot,
        attendees.join('、'),
        horses[key] || '',
      ]);
      firstRow = false;
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet([[null, null, null, '参加者', null], ...aoa]);

  for (let r = 1; r <= aoa.length; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = 'yyyy/m/d';
    }
  }

  sheet['!cols'] = [
    { wch: 12 }, { wch: 5 }, { wch: 8 }, { wch: 80 }, { wch: 25 },
  ];

  XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');

  const submitRows = [['名前', '学年', '提出', '提出日時']];
  for (const m of members) {
    const r = responses[m.name];
    submitRows.push([
      m.name,
      m.grade === 'third' ? '3年' : m.grade === 'second' ? '2年' : '1年',
      r ? '○' : '',
      r?.submittedAt || '',
    ]);
  }
  const s2 = XLSX.utils.aoa_to_sheet(submitRows);
  s2['!cols'] = [{ wch: 10 }, { wch: 6 }, { wch: 6 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, s2, '提出状況');

  XLSX.writeFile(wb, `${year}年${month}月_練習参加者.xlsx`);
}
