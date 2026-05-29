import { CORRECT_PIN, makeToken, getRedis } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const { pin } = req.body || {};
  if (!pin || typeof pin !== 'string') return res.status(400).json({ error: 'pin_required' });
  const redis = getRedis();
  const storedPin = redis ? await redis.get('practice:pin') : null;
  const correctPin = storedPin || CORRECT_PIN;
  if (pin.trim() !== correctPin) return res.status(401).json({ error: 'invalid_pin' });
  return res.status(200).json({ token: makeToken(), expiresIn: 604800 });
}
