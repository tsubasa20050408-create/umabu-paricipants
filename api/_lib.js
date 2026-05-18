import crypto from 'crypto';
import { Redis } from '@upstash/redis';

export const CORRECT_PIN = (process.env.ADMIN_PIN || '0521').trim();
const SECRET = process.env.ADMIN_SECRET || 'practice_app_hmac_2026';
const TTL = 7 * 24 * 60 * 60 * 1000;

export function makeToken() {
  const exp = (Date.now() + TTL).toString();
  const sig = crypto.createHmac('sha256', SECRET).update(exp).digest('hex');
  return Buffer.from(exp + '.' + sig).toString('base64url');
}

export function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const dot = decoded.lastIndexOf('.');
    const exp = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    if (Date.now() > Number(exp)) return false;
    const expected = crypto.createHmac('sha256', SECRET).update(exp).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

export function isAuthed(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  return t && verifyToken(t);
}

export function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function genId() {
  return crypto.randomBytes(8).toString('hex');
}
