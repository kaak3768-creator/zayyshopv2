'use strict';
const { handler, query, requireMethod, HttpError } = require('../lib/core');
const store = require('../lib/store');

// Sajikan foto produk (disimpan di Redis sebagai data URL). URL berversi (?v=) sehingga aman di-cache lama.
module.exports = handler(async (req, res) => {
  requireMethod(req, 'GET');
  const id = String(query(req).get('id') || '');
  if (!/^p[a-f0-9]{8}$/.test(id) || !store.enabled()) throw new HttpError(404, 'Foto tidak ditemukan');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec((await store.getJson(`zs:img:${id}`)) || '');
  if (!m) throw new HttpError(404, 'Foto tidak ditemukan');
  res.statusCode = 200;
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(Buffer.from(m[2], 'base64'));
});
