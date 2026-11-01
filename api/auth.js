'use strict';
/**
 * Akun pengguna. POST JSON {action: register | login | me | ping, ...}
 *  - Password pengguna disimpan sebagai HASH (scrypt); tidak ada yang bisa membacanya, termasuk admin.
 *  - Admin = email/password dari env ADMIN_EMAIL / ADMIN_PASSWORD (bawaan ada di lib/core.js — segera ganti).
 */
const { handler, send, readJson, requireMethod, HttpError, signSession, getSession, adminCreds, safeEq, hashPw, checkPw } = require('../lib/core');
const store = require('../lib/store');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const uKey = (e) => `zs:user:${e}`;
const out = (res, s) => send(res, 200, { token: signSession(s), email: s.e, name: s.n, role: s.r });

module.exports = handler(async (req, res) => {
  requireMethod(req, 'POST');
  const b = await readJson(req);
  const admin = adminCreds();
  const email = String(b.email || '').trim().toLowerCase();
  const pw = String(b.password || '');

  if (b.action === 'register') {
    if (!store.enabled()) throw new HttpError(503, 'Pendaftaran butuh database Redis (belum dikonfigurasi).');
    const name = String(b.name || '').trim().slice(0, 40);
    if (name.length < 2) throw new HttpError(400, 'Nama minimal 2 karakter.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email tidak valid.');
    if (pw.length < 6 || pw.length > 72) throw new HttpError(400, 'Password 6–72 karakter.');
    if (email === admin.email || (await store.getJson(uKey(email)))) throw new HttpError(409, 'Email ini sudah terdaftar. Silakan masuk.');
    const now = Date.now();
    await store.setJson(uKey(email), { email, name, pw: hashPw(pw), createdAt: now, lastSeen: now, visits: 1 }, 0);
    await store.sadd('zs:users', email);
    return out(res, { e: email, n: name, r: 'user' });
  }

  if (b.action === 'login') {
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email tidak valid.');
    const isAdminEmail = email === admin.email;
    if (!isAdminEmail && !store.enabled()) throw new HttpError(503, 'Login akun butuh database Redis (belum dikonfigurasi).');
    const f = store.enabled() ? await store.getJson('zs:fail:' + email) : null;
    if (f && f.n >= 8 && f.until > Date.now()) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi 10 menit lagi.');

    let sess = null;
    if (isAdminEmail) {
      if (safeEq(pw, admin.password)) sess = { e: email, n: 'Admin', r: 'admin' };
    } else {
      const u = await store.getJson(uKey(email));
      if (u && checkPw(pw, u.pw)) {
        u.lastSeen = Date.now(); u.visits = (u.visits || 0) + 1;
        await store.setJson(uKey(email), u, 0);
        sess = { e: email, n: u.name, r: 'user' };
      }
    }
    if (!sess) {
      if (store.enabled()) await store.setJson('zs:fail:' + email, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 600_000 }, 600);
      throw new HttpError(401, 'Email atau password salah.');
    }
    if (f) await store.del('zs:fail:' + email).catch(() => {});
    return out(res, sess);
  }

  const s = getSession(req);
  if (!s) throw new HttpError(401, 'Sesi berakhir. Silakan login ulang.');
  if (b.action === 'me') return send(res, 200, { email: s.e, name: s.n, role: s.r });
  if (b.action === 'ping') {
    if (s.r === 'user' && store.enabled()) {
      const u = await store.getJson(uKey(s.e));
      if (!u) throw new HttpError(401, 'Akun tidak ditemukan.');
      u.lastSeen = Date.now();
      if (b.newVisit) u.visits = (u.visits || 0) + 1;
      await store.setJson(uKey(s.e), u, 0);
    }
    return send(res, 200, { ok: true });
  }
  throw new HttpError(400, 'Aksi tidak dikenal.');
});
