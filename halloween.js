/* ZayyStore — efek background Halloween: bintang, kabut, kelelawar, hantu, percikan api, laba-laba & labu.
   Semua dibuat dari sini supaya index.html tetap rapi. Otomatis mati bila pengguna memilih "kurangi animasi". */
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const R = (a, b) => a + Math.random() * (b - a);
  const el = (cls, css = "", html = "") => { const e = document.createElement("div"); e.className = cls; if (css) e.style.cssText = css; if (html) e.innerHTML = html; return e; };
  const small = matchMedia("(max-width:700px)").matches;

  const BAT = '<svg viewBox="0 0 64 32" aria-hidden="true"><path fill="#0b0414" stroke="#a855f7" stroke-opacity=".55" stroke-width=".8" d="M32 11 L30 5 L28.5 11.5 C25 8 19 6 12 8 C6 9.5 2 13 0 18 C4 16.5 8 17 11 19.5 C13.5 17.5 17 17.5 19.5 20 C22 18 25 19 27 22 L30 27 L32 30 L34 27 L37 22 C39 19 42 18 44.5 20 C47 17.5 50.5 17.5 53 19.5 C56 17 60 16.5 64 18 C62 13 58 9.5 52 8 C45 6 39 8 35.5 11.5 L34 5 Z"/><circle cx="30" cy="12.5" r=".9" fill="#ffb347"/><circle cx="34" cy="12.5" r=".9" fill="#ffb347"/></svg>';

  /* lapisan belakang: bintang + kabut */
  const back = el("hw-back"); back.setAttribute("aria-hidden", "true");
  for (let i = 0; i < (small ? 30 : 60); i++)
    back.appendChild(el("hw-star", `--x:${R(0, 100)}%;--y:${R(0, 85)}%;--s:${R(1.5, 3.2).toFixed(1)}px;--d:${R(2.5, 6).toFixed(1)}s;--t:${(-R(0, 6)).toFixed(1)}s`));
  back.appendChild(el("hw-fog f1")); back.appendChild(el("hw-fog f2"));

  /* lapisan depan: kelelawar, hantu, percikan api */
  const front = el("hw-front"); front.setAttribute("aria-hidden", "true");
  const bats = small ? 3 : 6;
  for (let i = 0; i < bats; i++) {
    const b = el("hw-bat" + (i % 3 === 1 ? " rtl" : ""), `--y:${R(6, 70).toFixed(0)}%;--w:${R(34, 66).toFixed(0)}px;--d:${R(15, 28).toFixed(1)}s;--t:${(-R(0, 24)).toFixed(1)}s;--b:${R(1.4, 2.6).toFixed(1)}s`, `<span>${BAT}</span>`);
    front.appendChild(b);
  }
  for (let i = 0; i < (small ? 2 : 3); i++)
    front.appendChild(el("hw-ghost", `--x:${R(8, 88).toFixed(0)}%;--s:${R(34, 56).toFixed(0)}px;--d:${R(22, 34).toFixed(1)}s;--t:${(-R(0, 28)).toFixed(1)}s`, "👻"));
  for (let i = 0; i < (small ? 14 : 28); i++)
    front.appendChild(el("hw-ember", `--x:${R(0, 100).toFixed(0)}%;--s:${R(3, 6).toFixed(0)}px;--d:${R(7, 15).toFixed(1)}s;--t:${(-R(0, 15)).toFixed(1)}s;--dx:${R(-90, 90).toFixed(0)}px`));

  document.body.prepend(back);
  document.body.appendChild(front);

  /* hero: laba-laba menggantung + labu menyala */
  const hero = document.querySelector(".sv-hero");
  if (hero) {
    hero.appendChild(el("hw-spider", "", "<span>🕷️</span>"));
    hero.appendChild(el("hw-pump l", "", "🎃"));
    hero.appendChild(el("hw-pump r", "", "🎃"));
  }
})();
