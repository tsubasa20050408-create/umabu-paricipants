import { getRedis, isAuthed, genId } from './_lib.js';

const INDEX_KEY = 'practice:surveys';
const GROUPS_KEY = 'practice:groups';
const WEEKLY_KEY = 'practice:weeklySlots';
const ASA_HORSES_KEY = 'practice:asaUndoHorses';
const KEY = (id) => `practice:survey:${id}`;

// 回答・管理者の記録は調査本体と別の Hash に1フィールドずつ保存する。
// 本体を丸ごと読み書きすると、同時に送信された回答や記録が上書きで消えるため。
//   responses    : 名前        → { name, grade, slots, submittedAt }
//   horses       : 日付__時限  → 馬名
//   asaUndo      : 日付        → [参加者名]
//   asaUndoHorse : 日付        → 馬名
//   gozenAssign  : 日付        → { '1限': [...], '2限': [...] }
const HASHES = ['responses', 'horses', 'asaUndo', 'asaUndoHorse', 'gozenAssign'];
const STRING_HASHES = new Set(['horses', 'asaUndoHorse']);
const HKEY = (id, kind) => `practice:survey:${id}:${kind}`;

// 時限パターンの検証（src/schedule.js は api/ から import できないため最小限を再実装）
const ASA_SLOT = '朝運動';
const KOMA_SLOTS = ['1限', '2限', '3限'];
const GOZEN_SLOTS = ['午前', '午後'];
const ALL_SLOTS = [ASA_SLOT, ...KOMA_SLOTS, ...GOZEN_SLOTS];
const GOZEN_ALLOWED_DOW = [5, 6]; // 土・日のみ

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 20;
const MAX_NAMES = 60;

function isValidWeeklySlots(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  for (let dow = 0; dow <= 6; dow++) {
    const slots = w[dow];
    if (!Array.isArray(slots)) return false;
    if (slots.some(s => typeof s !== 'string' || !ALL_SLOTS.includes(s))) return false;
    if (new Set(slots).size !== slots.length) return false;
    const hasGozen = slots.some(s => GOZEN_SLOTS.includes(s));
    const hasKoma = slots.some(s => KOMA_SLOTS.includes(s));
    if (hasGozen && !GOZEN_ALLOWED_DOW.includes(dow)) return false; // 月〜金に午前/午後は不可
    if (hasGozen && hasKoma) return false;                          // 限と午前/午後は排他
  }
  return true;
}

// 朝運動の馬リスト: [{ name: 'イト', active: true }, ...]
function isValidAsaUndoHorses(list) {
  if (!Array.isArray(list) || list.length > 20) return false;
  const names = new Set();
  for (const h of list) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) return false;
    if (typeof h.name !== 'string') return false;
    const name = h.name.trim();
    if (!name || name.length > 20) return false;
    if (typeof h.active !== 'boolean') return false;
    if (names.has(name)) return false;
    names.add(name);
  }
  return true;
}

// その調査で使う馬名の配列
function isValidHorseNameList(names) {
  if (!Array.isArray(names) || names.length > 20) return false;
  const seen = new Set();
  for (const n of names) {
    if (typeof n !== 'string') return false;
    const name = n.trim();
    if (!name || name.length > 20 || seen.has(name)) return false;
    seen.add(name);
  }
  return true;
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isShortString = (v, max = MAX_NAME) => typeof v === 'string' && v.trim().length <= max;
const isNameArray = (v) =>
  Array.isArray(v) && v.length <= MAX_NAMES && v.every(n => typeof n === 'string' && n.length <= MAX_NAME);

function gradeOf(name, groups) {
  for (const g of ['third', 'second', 'first']) {
    if ((groups?.[g] || []).includes(name)) return g;
  }
  return null;
}

// 締切日（YYYY-MM-DD）の 23:59:59 JST を過ぎているか。サーバは UTC で動くので JST を明示する
function isPastDeadline(deadline) {
  if (!deadline) return false;
  const end = Date.parse(`${deadline}T23:59:59+09:00`);
  return Number.isFinite(end) && Date.now() > end;
}

// 旧形式（調査本体に responses 等を埋め込み）を Hash に移す。
// HSETNX なので、移行中に届いた新しい回答は上書きしない。
async function migrateLegacy(redis, id, survey) {
  if (!HASHES.some(k => k in survey)) return survey;
  const p = redis.pipeline();
  let queued = 0;
  for (const kind of HASHES) {
    const data = survey[kind];
    if (!isPlainObject(data)) continue;
    for (const [field, value] of Object.entries(data)) {
      if (value == null || value === '') continue;
      p.hsetnx(HKEY(id, kind), field, value);
      queued++;
    }
  }
  if (queued > 0) await p.exec();
  const meta = { ...survey };
  HASHES.forEach(k => { delete meta[k]; });
  await redis.set(KEY(id), meta);
  return meta;
}

async function loadFull(redis, id) {
  let survey = await redis.get(KEY(id));
  if (!survey) return null;
  survey = await migrateLegacy(redis, id, survey);
  const p = redis.pipeline();
  HASHES.forEach(kind => p.hgetall(HKEY(id, kind)));
  const results = await p.exec();
  HASHES.forEach((kind, i) => {
    const data = results[i] || {};
    // 自動デシリアライズで "123" のような馬名が数値になるため文字列に戻す
    if (STRING_HASHES.has(kind)) {
      for (const k of Object.keys(data)) data[k] = String(data[k]);
    }
    survey[kind] = data;
  });
  return survey;
}

// 値が空なら HDEL、そうでなければ HSET
async function setField(redis, id, kind, field, value, isEmpty) {
  if (isEmpty) await redis.hdel(HKEY(id, kind), field);
  else await redis.hset(HKEY(id, kind), { [field]: value });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const redis = getRedis();
  if (!redis) return res.status(500).json({ error: 'redis_not_configured' });

  if (req.method === 'GET') {
    const { id, full, resource } = req.query;

    if (resource === 'groups') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const groups = await redis.get(GROUPS_KEY);
      return res.status(200).json({ groups });
    }

    if (resource === 'weeklySlots') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const weeklySlots = await redis.get(WEEKLY_KEY);
      return res.status(200).json({ weeklySlots });
    }

    if (resource === 'asaUndoHorses') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const horses = await redis.get(ASA_HORSES_KEY);
      return res.status(200).json({ horses });
    }

    if (resource === 'horseNames') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const names = (await redis.get('practice:horseNames')) || [];
      return res.status(200).json({ names });
    }

    if (!id) {
      // list (admin only)
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const list = (await redis.get(INDEX_KEY)) || [];
      return res.status(200).json({ surveys: list });
    }
    if (full === '1') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const survey = await loadFull(redis, id);
      if (!survey) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ survey });
    }
    const survey = await redis.get(KEY(id));
    if (!survey) return res.status(404).json({ error: 'not_found' });
    // public: schedule/groups/year/month/deadline のみ。responses は出さない
    const { year, month, schedule, groups, deadline } = survey;
    return res.status(200).json({ survey: { year, month, schedule, groups, deadline } });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action;

    // 部員の回答だけは PIN 不要
    if (action === 'respond') {
      const { id, name, slots } = body;
      if (!id || typeof name !== 'string' || !isPlainObject(slots)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      if (isPastDeadline(survey.deadline)) {
        return res.status(403).json({ error: 'deadline_passed' });
      }
      // グループに存在する名前のみ受け付ける。学年はクライアントの申告ではなく名簿から決める
      const grade = gradeOf(name, survey.groups);
      if (!grade) return res.status(400).json({ error: 'invalid_name' });
      // 調査にある（部員が選べる）時限だけを true として残す
      const allowed = new Set((survey.schedule || []).flatMap(d =>
        (d.slots || []).filter(s => s !== ASA_SLOT).map(s => `${d.date}__${s}`)));
      const cleanSlots = {};
      for (const [k, v] of Object.entries(slots)) {
        if (v === true && allowed.has(k)) cleanSlots[k] = true;
      }
      await redis.hset(HKEY(id, 'responses'), {
        [name]: { name, grade, slots: cleanSlots, submittedAt: new Date().toISOString() },
      });
      return res.status(200).json({ ok: true });
    }

    // ここから先はすべて管理者のみ
    if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });

    if (action === 'updateGroups') {
      const { groups } = body;
      if (!groups || !isNameArray(groups.third) || !isNameArray(groups.second) || !isNameArray(groups.first)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await redis.set(GROUPS_KEY, groups);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateWeeklySlots') {
      const { weeklySlots } = body;
      if (!isValidWeeklySlots(weeklySlots)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await redis.set(WEEKLY_KEY, weeklySlots);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateAsaUndoHorses') {
      const { horses } = body;
      if (!isValidAsaUndoHorses(horses)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await redis.set(ASA_HORSES_KEY, horses.map(h => ({ name: h.name.trim(), active: h.active })));
      return res.status(200).json({ ok: true });
    }

    if (action === 'create') {
      const { year, month, schedule, groups, deadline } = body;
      if (!year || !month || !Array.isArray(schedule) || !groups) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      if (deadline && !DATE_RE.test(deadline)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const id = genId();
      const survey = {
        id, year, month, schedule, groups,
        deadline: deadline || null,
        createdAt: new Date().toISOString(),
      };
      await redis.set(KEY(id), survey);
      const list = (await redis.get(INDEX_KEY)) || [];
      list.unshift({ id, year, month, createdAt: survey.createdAt });
      await redis.set(INDEX_KEY, list);
      return res.status(200).json({ id });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'invalid_payload' });
      await redis.del(KEY(id), ...HASHES.map(kind => HKEY(id, kind)));
      const list = ((await redis.get(INDEX_KEY)) || []).filter(s => s.id !== id);
      await redis.set(INDEX_KEY, list);
      return res.status(200).json({ ok: true });
    }

    if (action === 'changePin') {
      const { newPin } = body;
      if (!newPin || typeof newPin !== 'string' || !/^\d{4,8}$/.test(newPin.trim())) {
        return res.status(400).json({ error: 'invalid_pin_format' });
      }
      await redis.set('practice:pin', newPin.trim());
      return res.status(200).json({ ok: true });
    }

    // ─── 以下は個別の調査に対する記録 ───
    const { id } = body;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'invalid_payload' });

    if (action === 'updateAsaUndoHorseEnabled') {
      const { names } = body;
      if (!isValidHorseNameList(names)) return res.status(400).json({ error: 'invalid_payload' });
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      survey.asaUndoHorseEnabled = names.map(n => n.trim());
      await redis.set(KEY(id), survey);
      return res.status(200).json({ ok: true });
    }

    if (!(await redis.exists(KEY(id)))) return res.status(404).json({ error: 'not_found' });

    // 集計表の馬名（1セル単位）
    if (action === 'updateHorse') {
      const { key, value } = body;
      if (typeof key !== 'string' || key.length > 40 || !/^\d{4}-\d{2}-\d{2}__/.test(key) || !isShortString(value)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const name = value.trim();
      await setField(redis, id, 'horses', key, name, !name);
      if (name) {
        const existing = (await redis.get('practice:horseNames')) || [];
        if (!existing.includes(name)) await redis.set('practice:horseNames', [...existing, name]);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateAsaUndo') {
      const { date, names } = body;
      if (!DATE_RE.test(date || '') || !isNameArray(names)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await setField(redis, id, 'asaUndo', date, names, names.length === 0);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateGozenAssign') {
      const { date, assign } = body;
      if (!DATE_RE.test(date || '') || !isPlainObject(assign)
        || !isNameArray(assign['1限'] || []) || !isNameArray(assign['2限'] || [])) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const clean = { '1限': assign['1限'] || [], '2限': assign['2限'] || [] };
      await setField(redis, id, 'gozenAssign', date, clean, false);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateAsaUndoHorse') {
      const { date, horse } = body;
      if (!DATE_RE.test(date || '') || !isShortString(horse)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await setField(redis, id, 'asaUndoHorse', date, horse.trim(), !horse.trim());
      return res.status(200).json({ ok: true });
    }

    // 自動配置の結果で、その月の朝運動の馬をまとめて置き換える（1トランザクション）
    if (action === 'setAsaUndoHorses') {
      const { assignments } = body;
      if (!isPlainObject(assignments)) return res.status(400).json({ error: 'invalid_payload' });
      const entries = Object.entries(assignments);
      if (entries.length > 31 || entries.some(([d, h]) => !DATE_RE.test(d) || !isShortString(h) || !h.trim())) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const tx = redis.multi();
      tx.del(HKEY(id, 'asaUndoHorse'));
      if (entries.length > 0) {
        tx.hset(HKEY(id, 'asaUndoHorse'), Object.fromEntries(entries.map(([d, h]) => [d, h.trim()])));
      }
      await tx.exec();
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown_action' });
  }

  return res.status(405).end();
}
