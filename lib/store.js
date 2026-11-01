'use strict';
/**
 * Penyimpanan via Upstash Redis (REST) — gratis & 1-klik lewat Vercel Marketplace.
 * Dipakai untuk: produk, akun pengguna, riwayat pesanan, aktivitas, anti-dobel kirim.
 * Tanpa Redis toko tetap tampil, tetapi produk/akun/riwayat tidak bisa disimpan.
 */
const url = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const enabled = () => !!(url() && token());

async function cmd(...args) {
  const r = await fetch(url(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j.result;
}

const DAY = 86400;
const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

module.exports = {
  enabled,
  async getJson(key) { return parse(await cmd('GET', key)); },
  /** ttlSec = 0 -> tanpa kedaluwarsa (dipakai untuk produk & akun) */
  async setJson(key, value, ttlSec = 90 * DAY) {
    return ttlSec ? cmd('SET', key, JSON.stringify(value), 'EX', ttlSec) : cmd('SET', key, JSON.stringify(value));
  },
  async del(key) { return cmd('DEL', key); },
  async mget(keys) { return keys.length ? (await cmd('MGET', ...keys)).map(parse) : []; },
  async lpush(key, v) { return cmd('LPUSH', key, v); },
  async lrange(key, a, b) { return cmd('LRANGE', key, a, b); },
  async sadd(key, v) { return cmd('SADD', key, v); },
  async smembers(key) { return cmd('SMEMBERS', key); },
  /** true jika berhasil mengunci (belum ada) */
  async lock(key, ttlSec = 60) { return (await cmd('SET', key, '1', 'NX', 'EX', ttlSec)) === 'OK'; },
  async unlock(key) { return cmd('DEL', key); },
};
