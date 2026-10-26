import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// 既定値は持たない（コードが公開されると PIN / 署名鍵が推測できてしまうため）
export const ENV_PIN = (process.env.ADMIN_PIN || '').trim() || null;
const SECRET = (process.env.ADMIN_SECRET || '').trim() || null;
const TTL = 7 * 24 * 60 * 60 * 1000;

export const hasSecret = () => !!SECRET;

export function makeToken() {
  if (!SECRET) throw new Error('secret_not_configured');
  const exp = (Date.now() + TTL).toString();
  const sig = crypto.createHmac('sha256', SECRET).update(exp).digest('hex');
  return Buffer.from(exp + '.' + sig).toString('base64url');
}

export function verifyToken(token) {
  if (!SECRET) return false;
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

// 管理画面で変更した PIN（Redis）を優先し、無ければ環境変数
export async function getAdminPin(redis) {
  const stored = redis ? await redis.get('practice:pin') : null;
  return (stored != null ? String(stored).trim() : '') || ENV_PIN;
}

export function genId() {
  return crypto.randomBytes(8).toString('hex');
}
