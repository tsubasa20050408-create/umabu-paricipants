import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api, tokenStore } from './api.js';
import {
  buildMonthSchedule, INITIAL_GROUPS, GRADE_LABEL, GRADE_ORDER, GRADE_COLOR,
  DOW_LABELS, orderedMembers, gradeOf, ADMIN_ONLY_SLOTS,
} from './schedule.js';
import { exportPracticeXlsx } from './export.js';

// ─── URL ルーティング ──────────────────────────────────────────
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (hash.startsWith('#/m/')) return { kind: 'member', surveyId: hash.slice(4) };
  if (hash.startsWith('#/admin/')) return { kind: 'admin', surveyId: hash.slice(8) };
  return { kind: 'home' };
}

const PAGE = {
  fontFamily: "'Noto Sans JP', sans-serif",
  background: '#0f1117', minHeight: '100vh', color: '#e2e8f0',
};
const CARD = { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16 };
const INPUT = {
  background: '#0f1117', border: '1px solid #334155', borderRadius: 8,
  color: '#f8fafc', padding: '6px 12px', fontSize: 14, outline: 'none',
};
const BTN_PRIMARY = {
  padding: '8px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
  border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14,
  cursor: 'pointer', boxShadow: '0 4px 15px rgba(99,102,241,0.4)',
};
const BTN_SUCCESS = {
  padding: '8px 18px', background: 'linear-gradient(135deg,#059669,#047857)',
  border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
};

// 締切日までの残り日数
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr + 'T23:59:59') - new Date();
  return Math.ceil(diff / 86400000);
}

// 午前参加者を1限/2限に自動振り分け
// ルール: 3年/2年/1年それぞれを均等に分け、個人ごとの1限/2限回数を均等に
function assignGozen(date, attendees, existingAssign) {
  const cnt1 = {}, cnt2 = {};
  for (const [d, a] of Object.entries(existingAssign)) {
    if (d >= date) continue;
    (a['1限'] || []).forEach(n => { cnt1[n] = (cnt1[n] || 0) + 1; });
    (a['2限'] || []).forEach(n => { cnt2[n] = (cnt2[n] || 0) + 1; });
  }

  const diff = m => (cnt1[m.name] || 0) - (cnt2[m.name] || 0);

  const splitGroup = (grade) => {
    const group = [...attendees.filter(m => m.grade === grade)].sort((a, b) => diff(a) - diff(b));
    const half = Math.ceil(group.length / 2);
    return { in1: group.slice(0, half), in2: group.slice(half) };
  };

  const third = splitGroup('third');
  const second = splitGroup('second');
  const first = splitGroup('first');

  return {
    '1限': [...third.in1, ...second.in1, ...first.in1].map(m => m.name),
    '2限': [...third.in2, ...second.in2, ...first.in2].map(m => m.name),
  };
}

// 朝運動で使用する馬リスト（固定）
const ASA_UNDO_HORSES = ['イト', 'ツムギ', 'シュウ', 'スモモ'];

const daysBetween = (d1, d2) =>
  Math.round((new Date(d2) - new Date(d1)) / 86400000);

// 朝運動使用馬を1日1頭で自動割り当て（日付順1ループで処理）
// 制約: ①前日使用禁止 ②2日後使用は低優先 ③月内で同じ人に同じ馬を割り当てない（conflictCount最小化）
function assignAsaUndoHorses(schedule, asaUndo) {
  const asaDates = schedule
    .filter(d => d.slots.includes('朝運動'))
    .map(d => d.date)
    .sort();

  const result = {};
  const lastUsed = {};
  const personRidden = {};

  for (const date of asaDates) {
    const participants = asaUndo[date] || [];
    if (participants.length === 0) continue;

    const forbidden = [], lowPriority = [], normal = [];
    for (const h of ASA_UNDO_HORSES) {
      const gap = lastUsed[h] ? daysBetween(lastUsed[h], date) : 99;
      if (gap <= 1) forbidden.push(h);
      else if (gap === 2) lowPriority.push(h);
      else normal.push(h);
    }

    const conflictCount = (h) =>
      participants.filter(name => personRidden[name]?.has(h)).length;

    const rank = (arr) => [...arr].sort((a, b) => {
      const ca = conflictCount(a), cb = conflictCount(b);
      if (ca !== cb) return ca - cb;
      const ga = lastUsed[a] ? daysBetween(lastUsed[a], date) : 999;
      const gb = lastUsed[b] ? daysBetween(lastUsed[b], date) : 999;
      return gb - ga;
    });

    const chosen = rank(normal)[0] ?? rank(lowPriority)[0] ?? rank(forbidden)[0];
    result[date] = chosen;
    lastUsed[chosen] = date;
    for (const name of participants) {
      personRidden[name] = personRidden[name] || new Set();
      personRidden[name].add(chosen);
    }
  }

  return result;
}

// ════════════════════════════════════════════════════════════════
// PINロック画面
// ════════════════════════════════════════════════════════════════
function PinLock({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = useCallback(async (p) => {
    if (!p || loading) return;
    setLoading(true); setErr('');
    try {
      const { token } = await api.login(p);
      tokenStore.set(token);
      onUnlock();
    } catch (e) {
      setErr(e.status === 401 ? 'PINが違います' : (e.message || '失敗'));
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  }, [loading, onUnlock]);

  const press = useCallback((n) => {
    if (loading) return;
    setPin(prev => {
      if (prev.length >= 8) return prev;
      return prev + n;
    });
  }, [loading]);

  const back = useCallback(() => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
  }, [loading]);

  // キーボード対応
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') setPin(p => { submit(p); return p; });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [press, back, submit]);

  // 4桁以上入力されたら自動送信（PINが4桁の場合に即開く）
  useEffect(() => {
    if (pin.length >= 4 && !loading) {
      submit(pin);
    }
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const dotColor = shake ? '#fc8181' : '#fff';

  return (
    <div style={{
      ...PAGE, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg,#1e293b,#0f172a)',
    }}>
      <div style={{ fontSize: 50, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>管理者ログイン</div>
      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>PIN を入力してください</div>

      <div style={{
        display: 'flex', gap: 14, marginBottom: 24, justifyContent: 'center',
        transition: 'transform 0.1s',
        transform: shake ? 'translateX(8px)' : 'none',
      }}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            border: `2px solid ${i < pin.length ? dotColor : 'rgba(255,255,255,0.4)'}`,
            background: i < pin.length ? dotColor : 'transparent',
            transition: 'background 0.1s',
          }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,72px)', gap: 12 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button key={n} onClick={() => press(String(n))} disabled={loading} style={{
            width: 72, height: 72, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            fontSize: 22, fontWeight: 600, cursor: 'pointer',
          }}>{n}</button>
        ))}
        <button onClick={() => submit(pin)} disabled={!pin || loading} style={{
          width: 72, height: 72, borderRadius: '50%',
          border: '1px solid rgba(99,102,241,0.4)',
          background: 'rgba(99,102,241,0.25)', color: '#a5b4fc',
          fontSize: 18, fontWeight: 700, cursor: 'pointer',
        }}>OK</button>
        <button onClick={() => press('0')} disabled={loading} style={{
          width: 72, height: 72, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.08)', color: '#fff',
          fontSize: 22, fontWeight: 600, cursor: 'pointer',
        }}>0</button>
        <button onClick={back} disabled={loading} style={{
          width: 72, height: 72, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.08)', color: '#fff',
          fontSize: 18, fontWeight: 600, cursor: 'pointer',
        }}>⌫</button>
      </div>
      <div style={{ color: '#fc8181', fontSize: 13, marginTop: 18, fontWeight: 600, height: 20 }}>{err}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 管理者ホーム
// ════════════════════════════════════════════════════════════════
function AdminHome() {
  const today = new Date();
  const nextMonth = today.getMonth() + 2;
  const [tab, setTab] = useState('survey');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [year, setYear] = useState(nextMonth > 12 ? today.getFullYear() + 1 : today.getFullYear());
  const [month, setMonth] = useState(nextMonth > 12 ? 1 : nextMonth);
  const [deadline, setDeadline] = useState('');
  const [creating, setCreating] = useState(false);
  const [surveys, setSurveys] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // 締切日: 選択月の20日をデフォルト
  useEffect(() => {
    const y = nextMonth > 12 ? today.getFullYear() + 1 : today.getFullYear();
    const m = nextMonth > 12 ? 1 : nextMonth;
    setDeadline(`${y}-${String(m).padStart(2, '0')}-20`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // スタッフ管理
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('first');

  const loadSurveys = useCallback(async () => {
    try {
      const { surveys } = await api.listSurveys();
      setSurveys(surveys);
    } catch (e) { console.error(e); }
    finally { setLoaded(true); }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const { groups: g } = await api.getGroups();
      if (g) setGroups(g);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadSurveys(); loadGroups(); }, [loadSurveys, loadGroups]);

  // #3: エラー時に前の状態にロールバック
  const saveGroups = async (next, prev) => {
    setSaving(true);
    try {
      await api.updateGroups(next);
    } catch (e) {
      setGroups(prev);
      alert('保存失敗: ' + e.message);
    } finally { setSaving(false); }
  };

  const createSurvey = async () => {
    setCreating(true);
    try {
      const schedule = buildMonthSchedule(year, month);
      const { id } = await api.createSurvey({
        year, month, schedule, groups,
        deadline: deadline || null,
      });
      window.location.hash = `#/admin/${id}`;
    } catch (e) {
      alert('作成失敗: ' + e.message);
    } finally { setCreating(false); }
  };

  const removeSurvey = async (id) => {
    if (!confirm('この調査を削除しますか？（回答もすべて削除されます）')) return;
    await api.deleteSurvey(id);
    loadSurveys();
  };

  const addStaff = async () => {
    const name = newName.trim();
    if (!name) return;
    const all = [...groups.third, ...groups.second, ...groups.first];
    if (all.includes(name)) { alert(`「${name}」はすでに登録されています`); return; }
    const prev = groups;
    const next = { ...groups, [newGrade]: [...groups[newGrade], name] };
    setGroups(next);
    setNewName('');
    await saveGroups(next, prev);
  };

  const removeStaff = async (name) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const prev = groups;
    const next = {
      third: groups.third.filter(n => n !== name),
      second: groups.second.filter(n => n !== name),
      first: groups.first.filter(n => n !== name),
    };
    setGroups(next);
    await saveGroups(next, prev);
  };

  const promoteStaff = async (name) => {
    const prev = groups;
    let next;
    if (groups.third.includes(name)) {
      if (!confirm(`「${name}」を卒業（削除）しますか？`)) return;
      next = { ...groups, third: groups.third.filter(n => n !== name) };
    } else if (groups.second.includes(name)) {
      next = { ...groups, second: groups.second.filter(n => n !== name), third: [...groups.third, name] };
    } else {
      next = { ...groups, first: groups.first.filter(n => n !== name), second: [...groups.second, name] };
    }
    setGroups(next);
    await saveGroups(next, prev);
  };

  const promoteAll = async () => {
    const graduating = groups.third;
    if (!confirm(
      `学年を一斉繰り上げします。\n` +
      `・3年生 ${graduating.length}名（${graduating.join('、') || 'なし'}）→ 卒業（削除）\n` +
      `・2年生 ${groups.second.length}名 → 3年生\n` +
      `・1年生 ${groups.first.length}名 → 2年生\n\n` +
      `よろしいですか？`
    )) return;
    const prev = groups;
    const next = { third: groups.second, second: groups.first, first: [] };
    setGroups(next);
    await saveGroups(next, prev);
  };

  const handleChangePin = async () => {
    try {
      await api.changePin(newPin);
      setPinMsg('PINを変更しました。次回ログイン時から新しいPINが有効になります。');
      setNewPin(''); setConfirmPin('');
    } catch (e) {
      setPinMsg('変更失敗: ' + e.message);
    }
  };

  const logout = () => { tokenStore.clear(); window.location.reload(); };

  const tabStyle = (key) => ({
    padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    background: tab === key ? '#6366f1' : '#1e293b',
    color: tab === key ? '#fff' : '#94a3b8',
  });

  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🐴 練習参加者把握ツール</h1>
          <button onClick={logout} style={{
            marginLeft: 'auto', padding: '4px 12px', fontSize: 12,
            background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
            borderRadius: 6, cursor: 'pointer',
          }}>ログアウト</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button style={tabStyle('survey')} onClick={() => setTab('survey')}>📅 調査</button>
          <button style={tabStyle('staff')} onClick={() => setTab('staff')}>👥 スタッフ</button>
          <button style={tabStyle('settings')} onClick={() => setTab('settings')}>⚙️ 設定</button>
        </div>

        {/* ─── 調査タブ ─── */}
        {tab === 'survey' && (
          <>
            <div style={CARD}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>新規調査を作成</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <input type="number" value={year} onChange={e => setYear(+e.target.value)}
                  style={{ ...INPUT, width: 90 }} />
                <span>年</span>
                <input type="number" min={1} max={12} value={month}
                  onChange={e => setMonth(+e.target.value)} style={{ ...INPUT, width: 60 }} />
                <span>月</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>締切日</span>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                  style={{ ...INPUT, colorScheme: 'dark' }} />
              </div>
              <button onClick={createSurvey} disabled={creating} style={BTN_PRIMARY}>
                {creating ? '作成中...' : '➕ 作成'}
              </button>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
                ※ 現在のスタッフ名簿（{groups.third.length + groups.second.length + groups.first.length}名）が使われます
              </div>
            </div>

            <div style={CARD}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>既存の調査</div>
              {loaded && surveys.length === 0 && (
                <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>まだありません</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {surveys.map(s => (
                  <div key={s.id} style={{
                    padding: '10px 14px', background: '#0f1117', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <a href={`#/admin/${s.id}`} style={{
                      flex: 1, textDecoration: 'none', color: '#e2e8f0',
                      display: 'flex', gap: 10, alignItems: 'baseline',
                    }}>
                      <span style={{ fontWeight: 700 }}>{s.year}年{s.month}月</span>
                      <span style={{ color: '#64748b', fontSize: 11 }}>{s.id.slice(0, 8)}...</span>
                    </a>
                    <button onClick={() => removeSurvey(s.id)} style={{
                      padding: '3px 10px', fontSize: 11, border: 'none', borderRadius: 6,
                      background: '#3b1f1f', color: '#f87171', cursor: 'pointer',
                    }}>削除</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── 設定タブ ─── */}
        {tab === 'settings' && (
          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>🔑 管理者PIN変更</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
              新しいPIN（4〜8桁の数字）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280 }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="新しいPIN"
                style={INPUT}
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="確認のため再入力"
                style={INPUT}
              />
              <button
                onClick={handleChangePin}
                disabled={newPin.length < 4 || newPin !== confirmPin}
                style={{
                  ...BTN_PRIMARY,
                  opacity: newPin.length < 4 || newPin !== confirmPin ? 0.5 : 1,
                }}
              >
                変更する
              </button>
              {pinMsg && (
                <div style={{
                  fontSize: 13, color: pinMsg.startsWith('変更失敗') ? '#f87171' : '#6ee7b7',
                  padding: '8px 12px', background: '#0f1117', borderRadius: 8,
                }}>
                  {pinMsg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── スタッフタブ ─── */}
        {tab === 'staff' && (
          <>
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700 }}>スタッフ追加</div>
                <button onClick={promoteAll} disabled={saving} style={{
                  marginLeft: 'auto', padding: '6px 16px', fontSize: 13, fontWeight: 700,
                  background: 'linear-gradient(135deg,#92400e,#78350f)',
                  color: '#fcd34d', border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>🎓 学年を一斉繰り上げ</button>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStaff()}
                  placeholder="氏名" style={{ ...INPUT, width: 140 }} />
                <select value={newGrade} onChange={e => setNewGrade(e.target.value)}
                  style={{ ...INPUT, padding: '6px 10px' }}>
                  <option value="third">3年</option>
                  <option value="second">2年</option>
                  <option value="first">1年</option>
                </select>
                <button onClick={addStaff} disabled={saving} style={BTN_PRIMARY}>追加</button>
              </div>
            </div>

            {[['third', '3年', '#c084fc'], ['second', '2年', '#60a5fa'], ['first', '1年', '#34d399']].map(([key, label, color]) => (
              <div key={key} style={CARD}>
                <div style={{ color, fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
                  {label}生 ({groups[key].length}名)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groups[key].length === 0 && (
                    <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>スタッフなし</div>
                  )}
                  {groups[key].map(name => (
                    <div key={name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', background: '#0f1117', borderRadius: 8,
                    }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
                      <button onClick={() => promoteStaff(name)} disabled={saving} style={{
                        padding: '4px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: key === 'third' ? '#451a03' : '#1e3a5f',
                        color: key === 'third' ? '#fdba74' : '#93c5fd', fontWeight: 600,
                      }}>
                        {key === 'third' ? '卒業' : key === 'second' ? '→3年に繰上' : '→2年に繰上'}
                      </button>
                      <button onClick={() => removeStaff(name)} disabled={saving} style={{
                        padding: '4px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: '#3b1f1f', color: '#f87171', fontWeight: 600,
                      }}>削除</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 管理者: 調査詳細
// ════════════════════════════════════════════════════════════════
function AdminDetail({ surveyId }) {
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedPending, setCopiedPending] = useState(false);
  const [refreshAt, setRefreshAt] = useState(Date.now());
  const [horses, setHorses] = useState({});
  const [asaUndo, setAsaUndo] = useState({});
  const [asaUndoHorse, setAsaUndoHorse] = useState({});
  const [gozenAssign, setGozenAssign] = useState({});
  const [horseNameSuggestions, setHorseNameSuggestions] = useState([]);

  const load = useCallback(async () => {
    try {
      const { survey } = await api.getSurveyFull(surveyId);
      setSurvey(survey);
      setHorses(survey.horses || {});
      setAsaUndo(survey.asaUndo || {});
      setAsaUndoHorse(survey.asaUndoHorse || {});
      setGozenAssign(survey.gozenAssign || {});
      api.getHorseNames().then(r => setHorseNameSuggestions(r.names || [])).catch(() => {});
    } catch (e) {
      if (e.status === 404) setSurvey(null);
      else console.error(e);
    } finally { setLoading(false); }
  }, [surveyId]);

  useEffect(() => { load(); }, [load, refreshAt]);

  // #5: 60秒ポーリング
  useEffect(() => {
    const t = setInterval(() => setRefreshAt(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const memberLink = useMemo(() => {
    return `${window.location.origin}${window.location.pathname}#/m/${surveyId}`;
  }, [surveyId]);

  const copyLink = () => {
    navigator.clipboard.writeText(memberLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyPending = (pending) => {
    navigator.clipboard.writeText(pending.map(p => p.name).join('、'));
    setCopiedPending(true);
    setTimeout(() => setCopiedPending(false), 1500);
  };

  const saveHorse = async (key, value) => {
    const next = { ...horses, [key]: value };
    setHorses(next);
    try { await api.updateHorses(surveyId, next); }
    catch (e) { console.error('馬名保存失敗:', e.message); }
  };

  const toggleAsaUndo = async (date, name) => {
    const current = asaUndo[date] || [];
    const next = current.includes(name)
      ? current.filter(n => n !== name)
      : [...current, name];
    setAsaUndo(prev => ({ ...prev, [date]: next }));
    try { await api.updateAsaUndo(surveyId, date, next); }
    catch (e) { console.error('朝運動保存失敗:', e.message); }
  };

  const toggleGozen = async (date, name, assign) => {
    const in1 = assign['1限'] || [];
    const in2 = assign['2限'] || [];
    const next = in1.includes(name)
      ? { '1限': in1.filter(n => n !== name), '2限': [...in2, name] }
      : { '1限': [...in1, name], '2限': in2.filter(n => n !== name) };
    setGozenAssign(prev => ({ ...prev, [date]: next }));
    try { await api.updateGozenAssign(surveyId, date, next); }
    catch (e) { console.error('振り分け保存失敗:', e.message); }
  };

  if (loading) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div></div>;
  if (!survey) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>調査が見つかりません <a href="#" style={{ color: '#93c5fd' }}>戻る</a></div></div>;

  const allMembers = orderedMembers(survey.groups);
  const responses = survey.responses || {};
  const submitted = allMembers.filter(m => responses[m.name]);
  const pending = allMembers.filter(m => !responses[m.name]);
  const remainDays = daysUntil(survey.deadline);

  const autoAssignAsaUndoHorses = async () => {
    const newAssign = assignAsaUndoHorses(survey.schedule, asaUndo);
    setAsaUndoHorse(newAssign);
    for (const [date, horse] of Object.entries(newAssign)) {
      try { await api.updateAsaUndoHorse(surveyId, date, horse); }
      catch (e) { console.error('馬割り当て保存失敗:', e.message); }
    }
  };

  const saveAsaUndoHorse = async (date, horse) => {
    setAsaUndoHorse(prev => ({ ...prev, [date]: horse }));
    try { await api.updateAsaUndoHorse(surveyId, date, horse); }
    catch (e) { console.error('馬割り当て保存失敗:', e.message); }
  };

  const autoAssignGozen = async (date) => {
    const key = `${date}__午前`;
    const attendees = allMembers.filter(m => responses[m.name]?.slots?.[key]);
    const assign = assignGozen(date, attendees, gozenAssign);
    setGozenAssign(prev => ({ ...prev, [date]: assign }));
    try { await api.updateGozenAssign(surveyId, date, assign); }
    catch (e) { console.error('振り分け保存失敗:', e.message); }
  };

  const handleExport = () => {
    exportPracticeXlsx({
      year: survey.year, month: survey.month,
      schedule: survey.schedule, responses, groups: survey.groups, horses,
      asaUndo, gozenAssign, asaUndoHorse,
    });
  };

  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <a href="#" style={{ color: '#94a3b8', textDecoration: 'none' }}>← ホーム</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            🐴 {survey.year}年{survey.month}月 練習参加調査
          </h1>
          {survey.deadline && (
            <span style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 6, fontWeight: 700,
              background: remainDays !== null && remainDays <= 3 ? '#3b1f1f' : '#1e293b',
              color: remainDays !== null && remainDays <= 3 ? '#fca5a5' : '#94a3b8',
            }}>
              締切 {survey.deadline} {remainDays !== null ? `（あと${remainDays}日）` : '（期限切れ）'}
            </span>
          )}
          <button onClick={() => setRefreshAt(Date.now())} style={{
            marginLeft: 'auto', fontSize: 12, padding: '4px 10px',
            background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
            borderRadius: 6, cursor: 'pointer',
          }}>🔄 更新</button>
        </div>

        <div style={CARD}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>📩 部員配布リンク</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input readOnly value={memberLink}
              style={{ ...INPUT, flex: 1, minWidth: 280 }}
              onFocus={e => e.target.select()} />
            <button onClick={copyLink} style={{ ...BTN_PRIMARY, padding: '6px 16px' }}>
              {copied ? '✓ コピー' : 'コピー'}
            </button>
          </div>
        </div>

        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>
              ✅ 提出状況 {submitted.length} / {allMembers.length}
            </div>
            {pending.length > 0 && (
              <button onClick={() => copyPending(pending)} style={{
                marginLeft: 'auto', fontSize: 12, padding: '4px 12px',
                background: copiedPending ? '#064e3b' : '#1e3a5f',
                color: copiedPending ? '#6ee7b7' : '#93c5fd',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              }}>
                {copiedPending ? '✓ コピー済み' : `📋 未提出者をコピー（${pending.length}名）`}
              </button>
            )}
          </div>
          {GRADE_ORDER.map(g => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div style={{ color: GRADE_COLOR[g], fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                {GRADE_LABEL[g]}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {survey.groups[g].map(name => {
                  const done = !!responses[name];
                  return (
                    <span key={name} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 13,
                      background: done ? '#064e3b' : '#3b1f1f',
                      color: done ? '#6ee7b7' : '#fca5a5', fontWeight: 600,
                    }}>
                      {done ? '✓' : '·'} {name}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {submitted.length > 0 && (
          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>📋 集計・馬名入力</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
              馬名欄はフォーカスを外すと自動保存されます
            </div>
            <datalist id="horse-names-list">
              {horseNameSuggestions.map(n => <option key={n} value={n} />)}
            </datalist>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#64748b' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>日付</th>
                    <th style={{ padding: 6 }}>曜</th>
                    <th style={{ padding: 6, textAlign: 'left' }}>時限</th>
                    <th style={{ padding: 6, textAlign: 'left' }}>参加者</th>
                    <th style={{ padding: 6, textAlign: 'left' }}>馬名</th>
                  </tr>
                </thead>
                <tbody>
                  {survey.schedule.map(day => {
                    const visibleSlots = day.slots.filter(s => !ADMIN_ONLY_SLOTS.has(s));
                    return visibleSlots.map((slot, i) => {
                      const key = `${day.date}__${slot}`;
                      const attendees = allMembers
                        .filter(m => responses[m.name]?.slots?.[key])
                        .map(m => m.name);
                      return (
                        <tr key={key} style={{ borderTop: '1px solid #0f1117' }}>
                          <td style={{ padding: 5 }}>{i === 0 ? `${survey.month}/${day.day}` : ''}</td>
                          <td style={{ padding: 5, textAlign: 'center', color: day.dow === 6 ? '#f87171' : day.dow === 5 ? '#60a5fa' : '#94a3b8' }}>
                            {i === 0 ? DOW_LABELS[day.dow] : ''}
                          </td>
                          <td style={{ padding: 5, color: '#fbbf24' }}>{slot}</td>
                          <td style={{ padding: 5 }}>{attendees.join('、') || <span style={{ color: '#334155' }}>—</span>}</td>
                          <td style={{ padding: 5 }}>
                            <input
                              defaultValue={horses[key] || ''}
                              onBlur={e => saveHorse(key, e.target.value)}
                              placeholder="馬名を入力"
                              list="horse-names-list"
                              style={{
                                ...INPUT, fontSize: 12, padding: '3px 8px',
                                width: 140, border: '1px solid #334155',
                              }}
                            />
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>🌅 朝運動記録</div>
            <button
              onClick={autoAssignAsaUndoHorses}
              style={{
                marginLeft: 'auto', padding: '4px 14px', fontSize: 12,
                background: '#1e3a5f', color: '#93c5fd',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              }}>🐴 馬を自動配置</button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            参加した人をクリックして記録。馬名は自動配置後にドロップダウンで調整できます。
          </div>
          {survey.schedule.filter(day => day.slots.includes('朝運動')).map(day => {
            const attending = asaUndo[day.date] || [];
            const selectedHorse = asaUndoHorse[day.date] || '';
            return (
              <div key={day.date} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #0f1117' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontWeight: 700, fontSize: 12,
                    color: day.dow === 6 ? '#f87171' : day.dow === 5 ? '#60a5fa' : '#94a3b8',
                  }}>
                    {survey.month}/{day.day}（{DOW_LABELS[day.dow]}）
                  </span>
                  <select
                    value={selectedHorse}
                    onChange={e => saveAsaUndoHorse(day.date, e.target.value)}
                    style={{
                      ...INPUT, fontSize: 12, padding: '2px 6px',
                      width: 90, border: '1px solid #334155',
                    }}>
                    <option value="">馬名--</option>
                    {ASA_UNDO_HORSES.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {allMembers.map(m => {
                    const on = attending.includes(m.name);
                    return (
                      <button key={m.name} onClick={() => toggleAsaUndo(day.date, m.name)} style={{
                        padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        background: on ? '#064e3b' : '#1e293b',
                        color: on ? '#6ee7b7' : '#64748b',
                        border: `1px solid ${on ? '#10b981' : '#334155'}`,
                        fontWeight: on ? 700 : 400,
                      }}>
                        {on ? '✓' : '·'} {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 人×馬 重複チェック */}
          {(() => {
            const history = {};
            for (const day of survey.schedule.filter(d => d.slots.includes('朝運動'))) {
              const horse = asaUndoHorse[day.date];
              if (!horse) continue;
              for (const name of (asaUndo[day.date] || [])) {
                history[name] = history[name] || {};
                history[name][horse] = (history[name][horse] || 0) + 1;
              }
            }
            const entries = Object.entries(history);
            if (entries.length === 0) return null;
            const conflicts = entries.filter(([, hm]) => Object.values(hm).some(c => c > 1));
            return (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1e293b' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: conflicts.length > 0 ? '#f87171' : '#6ee7b7' }}>
                  {conflicts.length > 0 ? `⚠ 重複あり（${conflicts.length}名）` : '✓ 重複なし'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entries.map(([name, horseMap]) => {
                    const hasConflict = Object.values(horseMap).some(c => c > 1);
                    return (
                      <div key={name} style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: hasConflict ? '#3b1f1f' : '#0f1117',
                        border: `1px solid ${hasConflict ? '#f87171' : '#1e293b'}`,
                        color: hasConflict ? '#fca5a5' : '#64748b',
                      }}>
                        {name}:{' '}
                        {Object.entries(horseMap).map(([h, c]) => (
                          <span key={h} style={{ color: c > 1 ? '#f87171' : '#94a3b8', fontWeight: c > 1 ? 700 : 400 }}>
                            {h}{c > 1 ? `×${c}` : ''}
                          </span>
                        )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, '・', el], [])}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {survey.schedule.some(day => day.dow === 6 && day.slots.includes('午前')) && (
          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>📅 日曜午前 振り分け</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              午前参加者を1限・2限に振り分けます（上級生/下級生を均等配分、個人の回数差を最小化）
            </div>
            {survey.schedule.filter(day => day.dow === 6 && day.slots.includes('午前')).map(day => {
              const key = `${day.date}__午前`;
              const gozenAttendees = allMembers.filter(m => responses[m.name]?.slots?.[key]);
              const assign = gozenAssign[day.date] || {};
              const in1 = assign['1限'] || [];
              const in2 = assign['2限'] || [];
              return (
                <div key={day.date} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #0f1117' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#f87171', fontSize: 13 }}>
                      {survey.month}/{day.day}（日）
                    </span>
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                      午前参加: {gozenAttendees.length > 0 ? gozenAttendees.map(m => m.name).join('、') : 'なし'}
                    </span>
                    <button
                      onClick={() => autoAssignGozen(day.date)}
                      disabled={gozenAttendees.length === 0}
                      style={{
                        marginLeft: 'auto', padding: '4px 14px', fontSize: 12,
                        background: '#1e3a5f', color: '#93c5fd',
                        border: 'none', borderRadius: 6, cursor: gozenAttendees.length === 0 ? 'not-allowed' : 'pointer',
                        fontWeight: 600, opacity: gozenAttendees.length === 0 ? 0.5 : 1,
                      }}>🔀 自動振り分け</button>
                  </div>
                  {(in1.length > 0 || in2.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {['1限', '2限'].map(koma => (
                        <div key={koma}>
                          <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{koma}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(koma === '1限' ? in1 : in2).map(name => (
                              <button key={name} onClick={() => toggleGozen(day.date, name, assign)}
                                title={`クリックで${koma === '1限' ? '2限' : '1限'}に移動`}
                                style={{
                                  padding: '3px 9px', borderRadius: 6, fontSize: 11,
                                  background: '#1e293b', color: '#e2e8f0',
                                  border: '1px solid #334155', cursor: 'pointer',
                                }}>{name} ⇄</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...CARD, textAlign: 'center' }}>
          {pending.length > 0 && (
            <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
              未提出: {pending.map(p => p.name).join('、')}
            </div>
          )}
          {pending.length === 0 && (
            <div style={{ marginBottom: 12, fontSize: 13, color: '#6ee7b7' }}>🎉 全員提出済み</div>
          )}
          <button onClick={handleExport} style={BTN_SUCCESS}>
            📥 Excelファイル作成
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 部員: 入力ページ
// ════════════════════════════════════════════════════════════════
function MemberView({ surveyId }) {
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedName, setSelectedName] = useState('');
  const [slots, setSlots] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState('select'); // 'select' | 'confirm' | 'form' | 'done'
  const [savedSubmission, setSavedSubmission] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { survey } = await api.getSurveyPublic(surveyId);
        setSurvey(survey);
      } catch (e) {
        if (e.status === 404) setSurvey(null);
        else console.error(e);
      } finally { setLoading(false); }
    })();
  }, [surveyId]);

  const lsKey = (name) => `submit_${surveyId}_${name}`;

  const selectName = (name) => {
    setSelectedName(name);
    const raw = localStorage.getItem(lsKey(name));
    if (raw) {
      try {
        setSavedSubmission(JSON.parse(raw));
        setMode('confirm');
        return;
      } catch { /* ignore parse error, fall through */ }
    }
    setSavedSubmission(null);
    setSlots({});
    setMode('form');
  };

  const toggle = (key) => setSlots(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleDay = (day, memberSlots, on) => {
    setSlots(prev => {
      const next = { ...prev };
      memberSlots.forEach(s => { next[`${day.date}__${s}`] = on; });
      return next;
    });
  };

  const submit = async () => {
    if (!selectedName) { alert('名前を選んでください'); return; }
    setSubmitting(true);
    try {
      await api.respond({
        id: surveyId,
        name: selectedName,
        grade: gradeOf(selectedName, survey.groups) ?? 'first',
        slots,
      });
      const now = new Date().toISOString();
      const submission = { slots, submittedAt: now };
      localStorage.setItem(lsKey(selectedName), JSON.stringify(submission));
      setSavedSubmission(submission);
      setMode('done');
    } catch (e) {
      alert('送信失敗: ' + e.message);
    } finally { setSubmitting(false); }
  };

  const resetToSelect = () => {
    setSelectedName(''); setSlots({}); setSavedSubmission(null); setMode('select');
  };

  if (loading) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div></div>;
  if (!survey) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>調査が見つかりません</div></div>;

  const remainDays = daysUntil(survey.deadline);
  const isExpired = survey.deadline && remainDays !== null && remainDays < 0;

  if (mode === 'done') {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 500, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>送信完了しました</div>
          <div style={{ color: '#94a3b8', marginBottom: 24 }}>
            {selectedName} さんの{survey.year}年{survey.month}月分の希望を受け付けました
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setMode('confirm')} style={{
              ...BTN_PRIMARY, background: '#1e293b', boxShadow: 'none',
              border: '1px solid #334155', color: '#94a3b8',
            }}>
              📋 回答を確認する
            </button>
            <button onClick={resetToSelect} style={BTN_PRIMARY}>
              別の人で入力
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'confirm' && savedSubmission) {
    const fmt = new Date(savedSubmission.submittedAt).toLocaleString('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            🐴 {survey.year}年{survey.month}月 練習参加調査
          </h1>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              {selectedName} さんの提出済み回答
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              提出日時: {fmt}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {survey.schedule.map(day => {
                const memberSlots = day.slots.filter(s => !ADMIN_ONLY_SLOTS.has(s));
                if (memberSlots.length === 0) return null;
                return (
                  <div key={day.date} style={{
                    background: '#0f1117', borderRadius: 10, padding: '10px 14px',
                    borderLeft: `3px solid ${day.dow === 6 ? '#f87171' : day.dow === 5 ? '#60a5fa' : '#334155'}`,
                  }}>
                    <div style={{
                      fontWeight: 700, marginBottom: 6, fontSize: 14,
                      color: day.dow === 6 ? '#f87171' : day.dow === 5 ? '#60a5fa' : '#f8fafc',
                    }}>
                      {survey.month}/{day.day}（{DOW_LABELS[day.dow]}）
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {memberSlots.map(s => {
                        const on = !!savedSubmission.slots[`${day.date}__${s}`];
                        return (
                          <span key={s} style={{
                            padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                            background: on ? '#064e3b' : '#1e293b',
                            color: on ? '#6ee7b7' : '#475569',
                            border: `1px solid ${on ? '#10b981' : '#1e293b'}`,
                          }}>
                            {on ? '○' : '×'} {s}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={() => { setSlots(savedSubmission.slots); setMode('form'); }} style={BTN_PRIMARY}>
                ✏️ 修正する
              </button>
              <button onClick={resetToSelect} style={{
                padding: '8px 20px', background: '#1e293b', border: '1px solid #334155',
                borderRadius: 10, color: '#94a3b8', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                別の人で確認
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          🐴 {survey.year}年{survey.month}月 練習参加調査
        </h1>

        {survey.deadline && (
          <div style={{
            marginBottom: 20, padding: '8px 14px', borderRadius: 8,
            background: isExpired ? '#3b1f1f' : remainDays <= 3 ? '#451a03' : '#1e293b',
            color: isExpired ? '#fca5a5' : remainDays <= 3 ? '#fdba74' : '#94a3b8',
            fontSize: 13, fontWeight: 600,
          }}>
            {isExpired
              ? '⛔ 締切日を過ぎているため回答できません'
              : `📅 回答締切: ${survey.deadline}（あと${remainDays}日）`}
          </div>
        )}

        {isExpired ? null : (
          <>
            <div style={CARD}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>① あなたの名前を選択</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                ✓ マークは前回の回答があります
              </div>
              {GRADE_ORDER.map(g => (
                <div key={g} style={{ marginBottom: 12 }}>
                  <div style={{ color: GRADE_COLOR[g], fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                    {GRADE_LABEL[g]}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {survey.groups[g].map(name => {
                      const hasSaved = !!localStorage.getItem(lsKey(name));
                      const isSelected = selectedName === name;
                      return (
                        <button key={name} onClick={() => selectName(name)} style={{
                          padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${isSelected ? GRADE_COLOR[g] : '#334155'}`,
                          background: isSelected ? GRADE_COLOR[g] + '33' : '#0f1117',
                          color: isSelected ? GRADE_COLOR[g] : '#cbd5e1',
                          fontWeight: isSelected ? 700 : 500, fontSize: 14,
                          position: 'relative',
                        }}>
                          {name}
                          {hasSaved && (
                            <span style={{
                              position: 'absolute', top: -5, right: -5,
                              fontSize: 9, background: '#10b981', color: '#fff',
                              borderRadius: '50%', width: 14, height: 14,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 900,
                            }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {mode === 'form' && (
              <>
                <div style={CARD}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>② 参加できる日程にチェック</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                    ✔チェックを入れた時限のみ「参加可能」として記録されます
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {survey.schedule.map(day => {
                      const memberSlots = day.slots.filter(s => !ADMIN_ONLY_SLOTS.has(s));
                      if (memberSlots.length === 0) return null;
                      const allOn = memberSlots.every(s => slots[`${day.date}__${s}`]);
                      return (
                        <div key={day.date} style={{
                          background: '#0f1117', borderRadius: 10, padding: '12px 14px',
                          borderLeft: `3px solid ${day.dow === 6 ? '#f87171' : day.dow === 5 ? '#60a5fa' : '#334155'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              fontWeight: 700, fontSize: 16,
                              color: day.dow === 6 ? '#f87171' : day.dow === 5 ? '#60a5fa' : '#f8fafc',
                            }}>
                              {survey.month}/{day.day} ({DOW_LABELS[day.dow]})
                            </span>
                            <button onClick={() => toggleDay(day, memberSlots, !allOn)} style={{
                              marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                              background: allOn ? '#3b1f1f' : '#064e3b',
                              color: allOn ? '#fca5a5' : '#6ee7b7',
                              border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                            }}>
                              {allOn ? '全て外す' : 'この日全て'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {memberSlots.map(s => {
                              const key = `${day.date}__${s}`;
                              const on = !!slots[key];
                              return (
                                <label key={s} style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                                  background: on ? '#064e3b' : '#1e293b',
                                  border: `1px solid ${on ? '#10b981' : '#334155'}`,
                                  color: on ? '#6ee7b7' : '#94a3b8', fontSize: 13, fontWeight: 600,
                                  userSelect: 'none',
                                }}>
                                  <input type="checkbox" checked={on}
                                    onChange={() => toggle(key)}
                                    style={{ accentColor: '#10b981' }} />
                                  {s}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ ...CARD, textAlign: 'center' }}>
                  <button onClick={submit} disabled={submitting} style={BTN_SUCCESS}>
                    {submitting ? '送信中...' : `📨 ${selectedName} として送信`}
                  </button>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                    ※ 同じ名前で再送信すると上書きされます
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ルート
// ════════════════════════════════════════════════════════════════
export default function App() {
  const route = useHashRoute();
  const [authed, setAuthed] = useState(() => !!tokenStore.get());

  useEffect(() => {
    const handle = () => setAuthed(false);
    window.addEventListener('auth:expired', handle);
    return () => window.removeEventListener('auth:expired', handle);
  }, []);

  if (route.kind === 'member') return <MemberView surveyId={route.surveyId} />;
  if (!authed) return <PinLock onUnlock={() => setAuthed(true)} />;
  if (route.kind === 'admin') return <AdminDetail surveyId={route.surveyId} />;
  return <AdminHome />;
}
