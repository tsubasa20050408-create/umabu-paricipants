import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api, tokenStore } from './api.js';
import {
  buildMonthSchedule, INITIAL_GROUPS, GRADE_LABEL, GRADE_ORDER, GRADE_COLOR,
  DOW_LABELS, orderedMembers, gradeOf,
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

        {/* ─── スタッフタブ ─── */}
        {tab === 'staff' && (
          <>
            <div style={CARD}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>スタッフ追加</div>
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

  const load = useCallback(async () => {
    try {
      const { survey } = await api.getSurveyFull(surveyId);
      setSurvey(survey);
      setHorses(survey.horses || {});
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

  if (loading) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div></div>;
  if (!survey) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>調査が見つかりません <a href="#" style={{ color: '#93c5fd' }}>戻る</a></div></div>;

  const allMembers = orderedMembers(survey.groups);
  const responses = survey.responses || {};
  const submitted = allMembers.filter(m => responses[m.name]);
  const pending = allMembers.filter(m => !responses[m.name]);
  const remainDays = daysUntil(survey.deadline);

  const handleExport = () => {
    exportPracticeXlsx({
      year: survey.year, month: survey.month,
      schedule: survey.schedule, responses, groups: survey.groups, horses,
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
                  {survey.schedule.map(day => day.slots.map((slot, i) => {
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
                            style={{
                              ...INPUT, fontSize: 12, padding: '3px 8px',
                              width: 140, border: '1px solid #334155',
                            }}
                          />
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
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
  const [done, setDone] = useState(false);

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

  const toggle = (key) => setSlots(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleDay = (day, on) => {
    setSlots(prev => {
      const next = { ...prev };
      day.slots.forEach(s => { next[`${day.date}__${s}`] = on; });
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
      setDone(true);
    } catch (e) {
      alert('送信失敗: ' + e.message);
    } finally { setSubmitting(false); }
  };

  if (loading) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div></div>;
  if (!survey) return <div style={PAGE}><div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>調査が見つかりません</div></div>;

  const remainDays = daysUntil(survey.deadline);
  const isExpired = survey.deadline && remainDays !== null && remainDays < 0;

  if (done) {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 500, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>送信完了しました</div>
          <div style={{ color: '#94a3b8', marginBottom: 24 }}>
            {selectedName} さんの{survey.year}年{survey.month}月分の希望を受け付けました
          </div>
          <button onClick={() => { setDone(false); setSelectedName(''); setSlots({}); }} style={BTN_PRIMARY}>
            別の人で入力
          </button>
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
              <div style={{ fontWeight: 700, marginBottom: 12 }}>① あなたの名前を選択</div>
              {GRADE_ORDER.map(g => (
                <div key={g} style={{ marginBottom: 12 }}>
                  <div style={{ color: GRADE_COLOR[g], fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                    {GRADE_LABEL[g]}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {survey.groups[g].map(name => (
                      <button key={name} onClick={() => setSelectedName(name)} style={{
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${selectedName === name ? GRADE_COLOR[g] : '#334155'}`,
                        background: selectedName === name ? GRADE_COLOR[g] + '33' : '#0f1117',
                        color: selectedName === name ? GRADE_COLOR[g] : '#cbd5e1',
                        fontWeight: selectedName === name ? 700 : 500, fontSize: 14,
                      }}>{name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedName && (
              <>
                <div style={CARD}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>② 参加できる日程にチェック</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                    ✔チェックを入れた時限のみ「参加可能」として記録されます
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {survey.schedule.map(day => {
                      const allOn = day.slots.every(s => slots[`${day.date}__${s}`]);
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
                            <button onClick={() => toggleDay(day, !allOn)} style={{
                              marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                              background: allOn ? '#3b1f1f' : '#064e3b',
                              color: allOn ? '#fca5a5' : '#6ee7b7',
                              border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                            }}>
                              {allOn ? '全て外す' : 'この日全て'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {day.slots.map(s => {
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

  if (route.kind === 'member') return <MemberView surveyId={route.surveyId} />;
  if (!authed) return <PinLock onUnlock={() => setAuthed(true)} />;
  if (route.kind === 'admin') return <AdminDetail surveyId={route.surveyId} />;
  return <AdminHome />;
}
