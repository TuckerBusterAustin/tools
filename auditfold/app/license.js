// Paid features unlock with a license (D24). Launch copies this file into each product
// as license.js and writes license-config.js before it:
//   window.VS_LICENSE_CONFIG = { slug, publicX, api, buyUrl };
// Apps call `await VSLicense.isUnlocked()` before a paid feature, and show
// `VSLicense.unlockBox(element)` for people who already bought.
// The check is offline: an Ed25519 signature made by our backend, verified with the
// public key. (A static page can always be bypassed by someone determined; truly
// premium work should be served by the backend to valid licenses.)
(function () {
  const cfg = window.VS_LICENSE_CONFIG || {};
  const KEY = `vs-license:${cfg.slug || "?"}`;
  // Only a Stripe checkout link may become the Buy button (it's written into the page).
  const BUY = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/.test(cfg.buyUrl || "") ? cfg.buyUrl : "";

  function b64urlDecode(s) {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function verify(token) {
    const [body, sig] = String(token || "").trim().split(".");
    if (!body || !sig || !cfg.publicX || !(crypto && crypto.subtle)) return false;
    try {
      const key = await crypto.subtle.importKey("jwk",
        { kty: "OKP", crv: "Ed25519", x: cfg.publicX }, { name: "Ed25519" }, false, ["verify"]);
      const ok = await crypto.subtle.verify("Ed25519", key, b64urlDecode(sig),
        new TextEncoder().encode(body));
      const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
      // a bundle license names every product it unlocks in `slugs`
      const covers = claims.slug === cfg.slug ||
        (Array.isArray(claims.slugs) && claims.slugs.includes(cfg.slug));
      return ok && covers ? claims : false;
    } catch (e) {
      return false;
    }
  }

  function stored() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }

  async function save(token) {
    const claims = await verify(token);
    if (!claims) return false;
    // every product shares the domain, so a bundle key is saved for each product it covers
    const slugs = [cfg.slug, ...(Array.isArray(claims.slugs) ? claims.slugs : [])];
    try {
      for (const s of slugs) localStorage.setItem(`vs-license:${s}`, token.trim());
    } catch (e) { /* private mode */ }
    return true;
  }

  async function claimFromUrl() {
    const sid = new URLSearchParams(location.search).get("session_id");
    if (!sid || !cfg.api) return "";
    for (let i = 0; i < 10; i++) {  // the payment webhook can take a few seconds
      const r = await fetch(`${cfg.api}/claim?session_id=${encodeURIComponent(sid)}`);
      if (r.status === 200) {
        const { token } = await r.json();
        if (await save(token)) return token;
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    return "";
  }

  function unlockBox(el) {
    el.innerHTML = '<details class="vs-unlock"><summary>Already bought? Unlock</summary>' +
      '<label>License key <input type="text" autocomplete="off"></label> ' +
      '<button type="button">Unlock</button> <span role="status"></span></details>' +
      (BUY ? ` <a class="vs-buy" href="${BUY}" rel="noopener">Buy</a>` : "");
    const input = el.querySelector("input"), status = el.querySelector("[role=status]");
    el.querySelector("button").addEventListener("click", async () => {
      const ok = await save(input.value);
      status.textContent = ok ? "Unlocked. Thank you!" : "That key doesn't look right.";
      if (ok) document.dispatchEvent(new CustomEvent("vs-unlocked"));
    });
  }

  window.VSLicense = {
    isUnlocked: async () => Boolean(await verify(stored())),
    save, claimFromUrl, unlockBox, verify,
    buyUrl: BUY,
  };
})();
