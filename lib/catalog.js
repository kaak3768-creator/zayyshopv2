'use strict';
/**
 * KATALOG: produk dikelola admin lewat Admin Panel dan disimpan di Redis (zs:products).
 * Harga SELALU dihitung ulang di server; browser hanya mengirim id + jumlah.
 */
const { HttpError } = require('./core');
const store = require('./store');

/** Kode promo. percent = persen diskon; only = daftar id produk yang berlaku (null = semua). */
const COUPONS = {
  ZAYY20: { percent: 20, label: 'Promo Launch 20%', only: null },
};
const MIN_TOTAL = 1000; // batas minimum nominal transaksi (Rp)
const MAX_QTY = 10;
const DEFAULT_DELIVERY = 'Pesanan kamu sedang diproses admin. Detail akan dikirim ke email kamu secepatnya (maksimal 15 menit). Jika belum ada kabar, hubungi admin dengan menyebut ID pesanan.';

/** @returns {Promise<Object<string,{id,name,price,desc,delivery,needsUsername,img}>>} */
async function getProducts() {
  if (!store.enabled()) return {};
  const list = (await store.getJson('zs:products')) || [];
  return Object.fromEntries(list.map((p) => [p.id, p]));
}

function priceCart(rawItems, couponCode, PRODUCTS) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(400, 'Keranjang masih kosong.');
  if (rawItems.length > 30) throw new HttpError(400, 'Terlalu banyak item.');

  const merged = new Map();
  for (const it of rawItems) {
    const id = String(it && it.id || '');
    const qty = Number(it && it.qty);
    if (!PRODUCTS[id]) throw new HttpError(400, 'Ada produk yang sudah tidak tersedia. Muat ulang halaman.');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new HttpError(400, `Jumlah per produk maksimal ${MAX_QTY}.`);
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) || 0) + qty));
  }

  const lines = [...merged].map(([id, qty]) => {
    const p = PRODUCTS[id];
    return { id, name: p.name, price: p.price, qty, total: p.price * qty, needsUsername: !!p.needsUsername };
  });
  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  let discount = 0;
  let coupon = null;
  const code = String(couponCode || '').trim().toUpperCase();
  if (code) {
    const c = COUPONS[code];
    if (!c) throw new HttpError(400, 'Kode promo tidak valid.');
    const eligible = lines.filter((l) => !c.only || c.only.includes(l.id)).reduce((s, l) => s + l.total, 0);
    if (eligible <= 0) throw new HttpError(400, 'Kode promo tidak berlaku untuk produk di keranjang.');
    discount = Math.floor((eligible * c.percent) / 100);
    coupon = { code, label: c.label, percent: c.percent };
  }

  const total = subtotal - discount;
  if (total < MIN_TOTAL) throw new HttpError(400, `Total minimal transaksi Rp ${MIN_TOTAL.toLocaleString('id-ID')}.`);

  return { lines, subtotal, discount, total, coupon, needsUsername: lines.some((l) => l.needsUsername) };
}

module.exports = { getProducts, priceCart, COUPONS, MAX_QTY, DEFAULT_DELIVERY };
