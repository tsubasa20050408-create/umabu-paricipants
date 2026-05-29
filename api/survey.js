import { getRedis, isAuthed, genId } from './_lib.js';

const INDEX_KEY = 'practice:surveys';
const GROUPS_KEY = 'practice:groups';
const KEY = (id) => `practice:survey:${id}`;

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

    if (action === 'delete') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'invalid_payload' });
      await redis.del(KEY(id));
      const list = ((await redis.get(INDEX_KEY)) || []).filter(s => s.id !== id);
      await redis.set(INDEX_KEY, list);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown_action' });
  }

  return res.status(405).end();
}
