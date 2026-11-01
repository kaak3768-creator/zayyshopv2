'use strict';
/**
 * API Admin Panel (semua butuh sesi admin: header Authorization: Bearer <token dari /api/auth>)
 *  GET  ?action=products | users | orders | activity
 *  POST {action:"save-product", id?, name, price, desc, delivery, needsUsername, image?}
 *  POST {action:"delete-product", id}
 *  POST {action:"reset-password", email, password}
 */
const crypto = require('crypto');
const { handler, send, readJson, query, HttpError, requireAdmin, hashPw } = require('../lib/core');
const store = require('../lib/store');

const IMG_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

async function allUsers() {
  const emails = await store.smembers('zs:users');
  return (await store.mget(emails.map((e) => `zs:user:${e}`))).filter(Boolean);
}

module.exports = handler(async (req, res) => {
  requireAdmin(req);
  if (!store.enabled()) throw new HttpError(503, 'Redis belum dikonfigurasi (UPSTASH_REDIS_REST_URL / _TOKEN).');

  if (req.method === 'GET') {
    const a = query(req).get('action');
    if (a === 'products') return send(res, 200, { products: (await store.getJson('zs:products')) || [] });

    if (a === 'users' || a === 'activity') {
      const users = (await allUsers()).map(({ email, name, createdAt, lastSeen, visits }) => ({ email, name, createdAt, lastSeen, visits: visits || 0 }));
      users.sort((x, y) => (a === 'activity' ? y.lastSeen - x.lastSeen : y.createdAt - x.createdAt));
      return send(res, 200, { users });
    }

    if (a === 'orders') {
      const ids = await store.lrange('zs:orders', 0, 299);
      const [os, ds] = await Promise.all([store.mget(ids.map((t) => `zs:order:${t}`)), store.mget(ids.map((t) => `zs:done:${t}`))]);
      const now = Date.now();
      const orders = os.map((o, i) => o && ({
        orderId: o.o, email: o.e, account: o.a || null, username: o.u || null,
        items: o.i.map(([, q, n]) => `${n} ×${q}`), total: o.T, ts: o.ts, mode: o.m,
        status: ds[i] ? 'paid' : o.x < now ? 'failed' : 'pending',
      })).filter(Boolean);
      return send(res, 200, { orders });
    }
    throw new HttpError(400, 'Aksi tidak dikenal.');
  }

  if (req.method === 'POST') {
    const b = await readJson(req);

    if (b.action === 'save-product') {
      const name = String(b.name || '').trim().slice(0, 80);
      const price = Number(b.price);
      if (name.length < 2) throw new HttpError(400, 'Nama produk minimal 2 karakter.');
      if (!Number.isInteger(price) || price < 1000 || price > 100_000_000) throw new HttpError(400, 'Harga harus bilangan bulat, minimal Rp 1.000.');
      const list = (await store.getJson('zs:products')) || [];
      let p = b.id ? list.find((x) => x.id === b.id) : null;
      if (b.id && !p) throw new HttpError(404, 'Produk tidak ditemukan.');
      if (!p) { p = { id: 'p' + crypto.randomBytes(4).toString('hex') }; list.push(p); }
      Object.assign(p, { name, price, desc: String(b.desc || '').trim().slice(0, 600), delivery: String(b.delivery || '').trim().slice(0, 400), needsUsername: !!b.needsUsername });
      if (b.image) {
        if (!IMG_RE.test(b.image) || b.image.length > 900_000) throw new HttpError(400, 'Foto tidak valid / terlalu besar (maks ±600 KB).');
        await store.setJson(`zs:img:${p.id}`, b.image, 0);
        p.img = Date.now().toString(36);
      }
      await store.setJson('zs:products', list, 0);
      return send(res, 200, { ok: true, product: p });
    }

    if (b.action === 'delete-product') {
      const list = (await store.getJson('zs:products')) || [];
      if (!list.some((x) => x.id === b.id)) throw new HttpError(404, 'Produk tidak ditemukan.');
      await store.setJson('zs:products', list.filter((x) => x.id !== b.id), 0);
      await store.del(`zs:img:${b.id}`).catch(() => {});
      return send(res, 200, { ok: true });
    }

    if (b.action === 'reset-password') {
      const email = String(b.email || '').toLowerCase();
      const pw = String(b.password || '');
      if (pw.length < 6 || pw.length > 72) throw new HttpError(400, 'Password baru 6–72 karakter.');
      const u = await store.getJson(`zs:user:${email}`);
      if (!u) throw new HttpError(404, 'User tidak ditemukan.');
      u.pw = hashPw(pw);
      await store.setJson(`zs:user:${email}`, u, 0);
      await store.del(`zs:fail:${email}`).catch(() => {});
      return send(res, 200, { ok: true });
    }
    throw new HttpError(400, 'Aksi tidak dikenal.');
  }
  throw new HttpError(405, 'Method tidak diizinkan');
});
