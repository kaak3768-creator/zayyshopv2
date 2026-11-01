/* ZayyStore — login/daftar, sesi, tombol Admin Panel (hanya tampil untuk admin), pencatatan aktivitas */
(() => {
  const $ = s => document.querySelector(s);
  const K = "zs_session";
  const get = () => { try { return JSON.parse(localStorage.getItem(K)); } catch { return null; } };
  const call = async (body, token) => {
    const r = await fetch("/api/auth", { method:"POST", headers:{ "Content-Type":"application/json", ...(token ? { Authorization:"Bearer " + token } : {}) }, body:JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "Terjadi kesalahan. Coba lagi."); e.status = r.status; throw e; }
    return j;
  };
  window.zsAuth = {
    session: get,
    isAdmin: () => { const s = get(); return !!s && s.role === "admin"; },
    headers: () => { const s = get(); return s ? { Authorization:"Bearer " + s.token } : {}; },
  };

  const modal = $("#loginModal");
  let mode = "login";
  function paint() {
    const s = get();
    $("#loginBtn").textContent = s ? "Keluar" : "Login";
    $("#loginBtn").title = s ? s.email : "";
    $("#adminBtn").hidden = !(s && s.role === "admin");
  }
  function setMode(m) {
    mode = m; const reg = m === "register";
    $("#authNameWrap").hidden = !reg; $("#authName").required = reg;
    $("#authKicker").textContent = reg ? "BUAT AKUN" : "WELCOME BACK";
    $("#authTitle").innerHTML = reg ? "Daftar <span>akun</span>" : "Masuk ke <span>ZayyStore</span>";
    $("#authSubmit").innerHTML = (reg ? "Daftar" : "Masuk") + " <span>→</span>";
    $("#authAsk").textContent = reg ? "Sudah punya akun?" : "Belum punya akun?";
    $("#authSwitch").textContent = reg ? "Masuk" : "Daftar";
    $("#authErr").hidden = true;
  }
  $("#authSwitch").addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));

  $("#loginBtn").addEventListener("click", () => {
    if (get()) { localStorage.removeItem(K); paint(); window.toast && toast("Kamu sudah keluar."); return; }
    setMode("login"); modal.classList.add("open"); setTimeout(() => $("#authEmail").focus(), 150);
  });
  $("#adminBtn").addEventListener("click", () => { location.href = "/admin.html"; });

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#authSubmit"), err = $("#authErr");
    err.hidden = true; btn.disabled = true;
    try {
      const j = await call({ action:mode, name:$("#authName").value, email:$("#authEmail").value, password:$("#authPass").value });
      localStorage.setItem(K, JSON.stringify(j));
      sessionStorage.setItem("zs_visited", "1"); // login sudah dihitung sebagai kunjungan
      paint(); modal.classList.remove("open"); e.target.reset();
      window.toast && toast(j.role === "admin" ? "Masuk sebagai admin — tombol Admin Panel aktif." : `Halo, ${j.name}! 👋`);
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });

  // Catat aktivitas: terakhir buka + hitung 1 kunjungan per sesi browser. Token kedaluwarsa -> keluar otomatis.
  const s = get();
  if (s) {
    const nv = !sessionStorage.getItem("zs_visited");
    sessionStorage.setItem("zs_visited", "1");
    call({ action:"ping", newVisit:nv }, s.token).catch(x => { if (x.status === 401) { localStorage.removeItem(K); paint(); } });
  }
  paint();
})();
