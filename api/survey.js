import { getRedis, isAuthed, genId } from './_lib.js';

const INDEX_KEY = 'practice:surveys';
const GROUPS_KEY = 'practice:groups';
const WEEKLY_KEY = 'practice:weeklySlots';
const KEY = (id) => `practice:survey:${id}`;

// 時限パターンの検証（src/schedule.js は api/ から import できないため最小限を再実装）
const ASA_SLOT = '朝運動';
const KOMA_SLOTS = ['1限', '2限', '3限'];
const GOZEN_SLOTS = ['午前', '午後'];
const ALL_SLOTS = [ASA_SLOT, ...KOMA_SLOTS, ...GOZEN_SLOTS];
const GOZEN_ALLOWED_DOW = [5, 6]; // 土・日のみ

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
    const survey = await redis.get(KEY(id));
    if (!survey) return res.status(404).json({ error: 'not_found' });
    if (full === '1') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      return res.status(200).json({ survey });
    }
    // public: schedule/groups/year/month/deadline のみ。responses は出さない
    const { year, month, schedule, groups, deadline } = survey;
    return res.status(200).json({ survey: { year, month, schedule, groups, deadline } });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action;

    if (action === 'updateGroups') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { groups } = body;
      if (!groups || !groups.third || !groups.second || !groups.first) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await redis.set(GROUPS_KEY, groups);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateWeeklySlots') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { weeklySlots } = body;
      if (!isValidWeeklySlots(weeklySlots)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      await redis.set(WEEKLY_KEY, weeklySlots);
      return res.status(200).json({ ok: true });
    }

    if (action === 'create') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { year, month, schedule, groups, deadline } = body;
      if (!year || !month || !schedule || !groups) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const id = genId();
      const survey = {
        id, year, month, schedule, groups, responses: {},
        deadline: deadline || null,
        createdAt: new Date().toISOString(),
      };
      await redis.set(KEY(id), survey);
      const list = (await redis.get(INDEX_KEY)) || [];
      list.unshift({ id, year, month, createdAt: survey.createdAt });
      await redis.set(INDEX_KEY, list);
      return res.status(200).json({ id });
    }

    if (action === 'respond') {
      const { id, name, grade, slots } = body;
      if (!id || !name || typeof slots !== 'object') {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      // #1: グループに存在する名前のみ受け付ける
      const allNames = [
        ...(survey.groups?.third || []),
        ...(survey.groups?.second || []),
        ...(survey.groups?.first || []),
      ];
      if (!allNames.includes(name)) {
        return res.status(400).json({ error: 'invalid_name' });
      }
      survey.responses = survey.responses || {};
      survey.responses[name] = { name, grade, slots, submittedAt: new Date().toISOString() };
      await redis.set(KEY(id), survey);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateHorses') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { id, horses } = body;
      if (!id || typeof horses !== 'object') {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      survey.horses = horses;
      await redis.set(KEY(id), survey);
      const newNames = Object.values(horses).filter(v => v && v.trim());
      if (newNames.length > 0) {
        const existing = (await redis.get('practice:horseNames')) || [];
        const merged = [...new Set([...existing, ...newNames.map(n => n.trim())])];
        await redis.set('practice:horseNames', merged);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateAsaUndo') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { id, date, names } = body;
      if (!id || !date || !Array.isArray(names)) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      survey.asaUndo = survey.asaUndo || {};
      survey.asaUndo[date] = names;
      await redis.set(KEY(id), survey);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateGozenAssign') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { id, date, assign } = body;
      if (!id || !date || typeof assign !== 'object') {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      survey.gozenAssign = survey.gozenAssign || {};
      survey.gozenAssign[date] = assign;
      await redis.set(KEY(id), survey);
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateAsaUndoHorse') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { id, date, horse } = body;
      if (!id || !date || typeof horse !== 'string') {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      const survey = await redis.get(KEY(id));
      if (!survey) return res.status(404).json({ error: 'not_found' });
      survey.asaUndoHorse = survey.asaUndoHorse || {};
      survey.asaUndoHorse[date] = horse;
      await redis.set(KEY(id), survey);
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'invalid_payload' });
      await redis.del(KEY(id));
      const list = ((await redis.get(INDEX_KEY)) || []).filter(s => s.id !== id);
      await redis.set(INDEX_KEY, list);
      return res.status(200).json({ ok: true });
    }

    if (action === 'changePin') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { newPin } = body;
      if (!newPin || typeof newPin !== 'string' || !/^\d{4,8}$/.test(newPin.trim())) {
        return res.status(400).json({ error: 'invalid_pin_format' });
      }
      await redis.set('practice:pin', newPin.trim());
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown_action' });
  }

  return res.status(405).end();
}
