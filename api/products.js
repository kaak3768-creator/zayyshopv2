'use strict';
const { handler, send, requireMethod } = require('../lib/core');
const { getProducts } = require('../lib/catalog');

// Daftar produk publik untuk etalase (tanpa data internal).
module.exports = handler(async (req, res) => {
  requireMethod(req, 'GET');
  const products = Object.values(await getProducts()).map((p) => ({
    id: p.id, name: p.name, price: p.price, desc: p.desc || '',
    img: p.img ? `/api/img?id=${p.id}&v=${p.img}` : null,
  }));
  send(res, 200, { products });
});
