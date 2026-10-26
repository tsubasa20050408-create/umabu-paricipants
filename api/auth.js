import crypto from 'crypto';
import { makeToken, getRedis, getAdminPin, hasSecret } from './_lib.js';

// 総当たり対策: IP ごとに 15分で5回、全体で 1時間に30回まで失敗を許す
const IP_LIMIT = 5, IP_WINDOW = 15 * 60;
const GLOBAL_LIMIT = 30, GLOBAL_WINDOW = 60 * 60;
const GLOBAL_KEY = 'practice:authfail:global';
const ipKey = (ip) => `practice:authfail:ip:${ip}`;

function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function countFailure(redis, key, window) {
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, window);
}

function pinEquals(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const redis = getRedis();
  if (!redis) return res.status(500).json({ error: 'redis_not_configured' });

  // PIN の桁数（ログイン画面の自動送信に使う）
  if (req.method === 'GET') {
    const pin = await getAdminPin(redis);
    return res.status(200).json({ pinLength: pin ? pin.length : null });
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (!hasSecret()) return res.status(500).json({ error: 'secret_not_configured' });
  const correctPin = await getAdminPin(redis);
  if (!correctPin) return res.status(500).json({ error: 'pin_not_configured' });

  const { pin } = req.body || {};
  if (!pin || typeof pin !== 'string') return res.status(400).json({ error: 'pin_required' });

  const ip = clientIp(req);
  const [ipFails, globalFails] = await redis.mget(ipKey(ip), GLOBAL_KEY);
  if (Number(ipFails) >= IP_LIMIT || Number(globalFails) >= GLOBAL_LIMIT) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  if (!pinEquals(pin.trim(), correctPin)) {
    await countFailure(redis, ipKey(ip), IP_WINDOW);
    await countFailure(redis, GLOBAL_KEY, GLOBAL_WINDOW);
    return res.status(401).json({ error: 'invalid_pin' });
  }
  await redis.del(ipKey(ip));
  return res.status(200).json({ token: makeToken(), expiresIn: 604800 });
}
