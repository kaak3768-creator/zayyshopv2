'use strict';
/**
 * Helper inti: response JSON, error, token pesanan bertanda-tangan, dan klien API Kipay.
 * Semua rahasia (API key, secret) hanya dibaca dari environment variable di server.
 */
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

/** Bungkus handler agar error selalu jadi JSON rapi (tanpa membocorkan detail internal). */
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error('[unhandled]', e && e.stack ? e.stack : e);
      send(res, 500, { error: 'Terjadi kesalahan pada server. Coba lagi sebentar.' });
    }
  };
}

function readStream(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Permintaan terlalu besar')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Ambil body mentah (dipakai webhook untuk verifikasi signature). */
async function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  return readStream(req);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRaw(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'Format permintaan tidak valid'); }
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

function requireMethod(req, ...methods) {
  if (!methods.includes(req.method)) throw new HttpError(405, 'Method tidak diizinkan');
}

/* ---------------------------- Token pesanan ---------------------------- */

function secret() {
  if (process.env.ORDER_SECRET) return process.env.ORDER_SECRET;
  // Fallback agar tetap aman bila ORDER_SECRET belum diisi (diturunkan dari API key).
  return crypto.createHash('sha256').update('zayystore|' + (process.env.KIPAY_API_KEY || '')).digest('hex');
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 10000 || !token.includes('.')) {
    throw new HttpError(400, 'Token pesanan tidak valid');
  }
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(400, 'Token pesanan tidak valid');
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { throw new HttpError(400, 'Token pesanan tidak valid'); }
}


/* ------------------- Sesi login, password, kredensial admin ------------------- */

const sessKey = () => crypto.createHash('sha256').update('sess|' + secret()).digest();
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

/** Sesi stateless bertanda-tangan (7 hari). payload: {e: email, n: nama, r: 'user'|'admin'} */
function signSession(p) {
  const body = Buffer.from(JSON.stringify({ ...p, x: Date.now() + 7 * 86400e3 })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', sessKey()).update(body).digest('base64url')}`;
}
function getSession(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', sessKey()).update(body).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.x > Date.now() ? p : null; }
  catch { return null; }
}
function requireAdmin(req) {
  const s = getSession(req);
  if (!s || s.r !== 'admin') throw new HttpError(401, 'Khusus admin. Silakan login sebagai admin.');
  return s;
}
/** Kredensial admin. GANTI lewat env ADMIN_EMAIL / ADMIN_PASSWORD di Vercel untuk produksi. */
const adminCreds = () => ({
  email: String(process.env.ADMIN_EMAIL || 'admin122@gmail.com').toLowerCase(),
  password: process.env.ADMIN_PASSWORD || 'admin123',
});
/** Password pengguna disimpan sebagai hash scrypt (bukan teks asli). */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------ Klien Kipay ----------------------------- */

const kipayBase = () => (process.env.KIPAY_BASE_URL || 'https://api.kipay.id').replace(/\/$/, '');

function kipayUrl(path) {
  const key = process.env.KIPAY_API_KEY;
  if (!key) throw new HttpError(500, 'Pembayaran belum dikonfigurasi (KIPAY_API_KEY belum diisi di Vercel).');
  return `${kipayBase()}/api/pay/${encodeURIComponent(key)}${path}`;
}

async function kipay(method, path, body) {
  const url = kipayUrl(path); // jangan pernah di-log: berisi API key
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error('[kipay] network error:', e.message);
    throw new HttpError(502, 'Gagal terhubung ke payment gateway. Coba lagi sebentar.');
  }
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* bukan JSON */ }
  if (!r.ok) {
    console.error('[kipay]', method, path.replace(/\/[A-Za-z0-9-]+(?=\/|$)/g, '/*'), '->', r.status, text.slice(0, 300));
    throw new HttpError(r.status === 404 ? 404 : 502, `Payment gateway menolak permintaan (${r.status}).`);
  }
  return data || {};
}

async function kipayQr(trxId) {
  const url = kipayUrl(`/transactions/${encodeURIComponent(trxId)}/qr.png`);
  let r;
  try { r = await fetch(url, { headers: { Accept: 'image/png' }, signal: AbortSignal.timeout(15000) }); }
  catch { throw new HttpError(502, 'Gagal mengambil QR'); }
  if (!r.ok) throw new HttpError(404, 'QR tidak tersedia / sudah kedaluwarsa');
  return Buffer.from(await r.arrayBuffer());
}

/** Kipay mengirim waktu "YYYY-MM-DD HH:mm:ss" dalam UTC (sama dengan sent_at webhook). */
function parseKipayTime(s) {
  if (!s) return NaN;
  if (typeof s === 'number') return s > 1e12 ? s : s * 1000;
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) return Date.parse(str.replace(' ', 'T') + 'Z');
  return Date.parse(str);
}

module.exports = {
  HttpError, send, handler, readRaw, readJson, query, requireMethod,
  signToken, verifyToken, kipay, kipayQr, parseKipayTime, secret,
  signSession, getSession, requireAdmin, adminCreds, safeEq, hashPw, checkPw,
};
