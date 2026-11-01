# ZayyStore — pembayaran & pembelian otomatis (QRIS via Kipay) di Vercel

## Alur otomatis
1. Pembeli pilih produk → keranjang (+ kode promo `ZAYY20`) → isi email (& username Minecraft bila perlu)
2. Server membuat transaksi di Kipay → tampil **QRIS + nominal + hitung mundur**
3. Pembeli bayar → Kipay kirim **webhook** → server verifikasi signature & cek ulang status ke Kipay
4. Produk **otomatis dikirim**: tampil di layar, dikirim ke email, dan admin dapat notifikasi Discord

Harga **selalu dihitung ulang di server** (`lib/catalog.js`), API key tidak pernah ke browser.

## Setup (±10 menit)

### 1. Deploy ke Vercel
Upload folder ini ke GitHub → Vercel → *Add New Project* → pilih repo (Framework: **Other**, tanpa build command).

### 2. Environment Variables (Vercel → Settings → Environment Variables)
| Nama | Isi |
|---|---|
| `KIPAY_API_KEY` | API key project Kipay (`apg_...`) |
| `KIPAY_WEBHOOK_SECRET` | secret `whsec_...` (lihat langkah 3) |
| `ORDER_SECRET` | teks acak panjang (`openssl rand -hex 32`) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | otomatis terisi bila kamu tambah **Storage → Upstash Redis** (gratis) |
| `RESEND_API_KEY`, `MAIL_FROM` | opsional, email otomatis ke pembeli (resend.com) |
| `DISCORD_WEBHOOK_URL` | opsional, notifikasi pesanan ke Discord |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | login admin panel (ganti dari bawaan!) |

Setelah mengisi, **Redeploy**. Contoh lengkap ada di `.env.example`.

### 3. Webhook di dashboard Kipay
Dashboard Kipay → Projects → isi **Webhook URL**: `https://DOMAINMU.vercel.app/api/webhook`
Secret `whsec_...` hanya tampil **sekali** → salin ke `KIPAY_WEBHOOK_SECRET`. Klik tes webhook (`webhook.test`) — harus sukses.

### 4. Uji di Sandbox dulu
Pakai API key **sandbox** Kipay. Di popup QR akan muncul tombol **"Simulasikan pembayaran berhasil"** (hanya muncul di sandbox).
Setelah lancar, ganti `KIPAY_API_KEY` ke key production → tombol simulasi hilang otomatis.

## Admin Panel
1. Klik **Login** di toko, masuk dengan akun admin (bawaan `admin122@gmail.com` / `admin123`) → tombol **Admin Panel** muncul di samping tombol Keluar. **Ganti kredensial ini** lewat env `ADMIN_EMAIL` & `ADMIN_PASSWORD`.
2. Isi Admin Panel: **Produk** (foto, nama, harga, deskripsi, pesan setelah bayar), **List User**, **Riwayat Transaksi** (berhasil / pending / gagal + akun pembeli), **Aktivitas Akun** (terakhir buka web & total kunjungan).
3. Semua data (produk, akun, riwayat) disimpan di Upstash Redis → **Redis wajib** untuk fitur ini.
4. Password pengguna disimpan sebagai hash (scrypt), tidak bisa dilihat; admin bisa **Reset password** bila pengguna lupa.
5. Tombol "Simulasikan pembayaran berhasil" (sandbox) hanya muncul & hanya berfungsi untuk admin.
6. Kode promo: `COUPONS` di `lib/catalog.js`.

## Mode tanpa Redis
Produk, akun & Admin Panel **tidak berfungsi** (etalase kosong). **Redis wajib.**

## Uji lokal tanpa Kipay
`npm run dev` → http://localhost:3000 (Kipay & Redis palsu; QR hanya contoh, tidak bisa discan).
Uji dengan Kipay sungguhan: buat `.env.local` dari `.env.example`, lalu `npm run dev:real`.

## Struktur
```
api/checkout.js  buat pesanan + transaksi     api/webhook.js   terima webhook Kipay (verifikasi HMAC)
api/status.js    cek status + kirim produk    api/qr.js        proxy gambar QR (API key aman)
api/quote.js     hitung harga/promo           api/simulate.js  simulasi bayar (sandbox saja)
api/admin.js     API admin panel              api/auth.js      login/daftar/aktivitas
api/products.js  etalase produk               api/img.js       foto produk
lib/*            logika bersama               admin.html       halaman Admin Panel
checkout.js      UI checkout/QR/pesanan       script.js        keranjang & UI toko
```

## Catatan keamanan
- Status "lunas" hanya dipercaya dari API Kipay (server-to-server), tidak pernah dari browser.
- Webhook ditolak bila signature salah / timestamp > 5 menit; pengiriman idempotent (tidak dobel).
- Pembeli harus membayar **nominal persis** (ada kode unik 3 digit dari Kipay).
- Jangan commit `.env` ke GitHub.
