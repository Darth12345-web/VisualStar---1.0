/**
 * ============================================================
 *  DEEP BLUE GAMES HUB — Save Progress Module v2
 *
 *  Add ONE line to index.html just before </body>:
 *    <script src="save-progress.js"></script>
 *
 *  FEATURES:
 *  1. CONSOLE INTERCEPT  — saves all console.log/warn/error
 *  2. BLANKER CAPTURE    — injects into about:blanker tabs,
 *                          auto-snapshots ALL localStorage
 *                          from inside the game window on
 *                          page unload + manual "Snap" button
 *  3. BOOKMARKLET        — drag to bookmarks bar, click on
 *                          any game site to beam its full
 *                          localStorage back to the launcher
 *  4. NOTES              — per-game manual progress notes
 *  5. EXPORT / IMPORT    — full JSON backup & restore
 * ============================================================
 */
;(function SaveProgressModule() {
  "use strict";

  /* ─────────────────────────────────────────────
     STORAGE KEYS
  ───────────────────────────────────────────── */
  const K_CONSOLE = "dbg_console_v2";
  const K_NOTES   = "dbg_notes_v2";
  const K_SNAPS   = "dbg_lssnaps_v2";
  const K_INJECT  = "dbg_inject_v2";
  const MAX_LOGS  = 500;

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */
  const store = {
    get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
    set(k, v)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
  };
  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  function dlJSON(name, data) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function stamp() { return new Date().toLocaleString(); }

  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  const consoleLogs = store.get(K_CONSOLE, []);
  const notesStore  = store.get(K_NOTES,   {});
  const lsSnaps     = store.get(K_SNAPS,   {});
  let   injectOn    = store.get(K_INJECT,  false);
  let   activeTab   = "console";
  let   conFilter   = "";
  let   panelOpen   = false;

  /* ─────────────────────────────────────────────
     CONSOLE INTERCEPT
  ───────────────────────────────────────────── */
  const _orig = {};
  ["log","warn","error","info","debug"].forEach(m => {
    _orig[m] = console[m].bind(console);
    console[m] = (...args) => {
      _orig[m](...args);
      pushLog(m, args.map(a => { try { return typeof a==="object"?JSON.stringify(a):String(a); }catch{return String(a);} }).join(" "));
    };
  });

  function pushLog(lvl, msg, label) {
    const entry = { t: Date.now(), lvl, msg: label ? `[${label}] ${msg}` : msg };
    consoleLogs.push(entry);
    if (consoleLogs.length > MAX_LOGS) consoleLogs.splice(0, consoleLogs.length - MAX_LOGS);
    store.set(K_CONSOLE, consoleLogs);
    if (activeTab==="console" && panelOpen) renderConsoleLogs();
  }

  /* ─────────────────────────────────────────────
     SNAPSHOT RECEIVER
  ───────────────────────────────────────────── */
  function receiveSnap(title, origin, snap) {
    const snapKeys = Object.keys(snap||{});
    if (!snapKeys.length) return;
    // Use origin as dedupe key so the same site overwrites rather than duplicates
    const key = (origin||title||"unknown").replace(/[^a-z0-9]/gi,"_").slice(0,40);
    lsSnaps[key] = { title: title||origin, origin, snap, savedAt: Date.now() };
    store.set(K_SNAPS, lsSnaps);
    if (activeTab==="saves" && panelOpen) renderSnaps();
    // Flash FAB badge
    document.getElementById("sp-badge").classList.add("on");
    setTimeout(() => document.getElementById("sp-badge").classList.remove("on"), 4000);
    pushLog("info", `Snapshot from "${title||origin}": ${snapKeys.length} key(s) captured`);
  }

  /* ─────────────────────────────────────────────
     MESSAGE BUS (BroadcastChannel + postMessage)
  ───────────────────────────────────────────── */
  function handleMsg(raw) {
    try {
      const data = typeof raw==="string" ? JSON.parse(raw) : raw;
      if (!data || typeof data!=="object") return;
      if (data.type==="sp_snapshot") receiveSnap(data.title, data.origin, data.snap);
      if (data.type==="sp_log")      pushLog(data.lvl||"log", data.msg, data.label);
    } catch(e) {}
  }
  try { const bc = new BroadcastChannel("sp_channel"); bc.onmessage = e => handleMsg(e.data); } catch(e) {}
  window.addEventListener("message", e => handleMsg(e.data));

  /* ─────────────────────────────────────────────
     STYLES
  ───────────────────────────────────────────── */
  document.head.insertAdjacentHTML("beforeend", `<style>
    #sp-fab{position:fixed;bottom:72px;right:18px;z-index:9999;width:50px;height:50px;border-radius:50%;
      background:linear-gradient(135deg,#67d1ff,#7fffd4);border:none;cursor:pointer;
      box-shadow:0 6px 22px rgba(103,209,255,.5);display:flex;align-items:center;justify-content:center;
      font-size:22px;transition:transform .2s,box-shadow .2s;color:#041224;font-family:inherit;position:fixed;}
    #sp-fab:hover{transform:scale(1.12) rotate(-8deg);box-shadow:0 10px 30px rgba(103,209,255,.65);}
    #sp-badge{position:absolute;top:-2px;right:-2px;width:13px;height:13px;border-radius:50%;
      background:#ff6e7a;display:none;border:2px solid #061024;animation:sp-pulse 1s ease infinite;}
    #sp-badge.on{display:block;}
    @keyframes sp-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.3);}}

    #sp-panel{position:fixed;bottom:132px;right:18px;z-index:9998;width:430px;
      max-width:calc(100vw - 24px);max-height:74vh;display:flex;flex-direction:column;
      background:rgba(5,11,28,.97);backdrop-filter:blur(20px);
      border:1px solid rgba(103,209,255,.22);border-radius:18px;
      box-shadow:0 32px 80px rgba(0,0,0,.75);font-family:'Comfortaa',system-ui,sans-serif;
      color:#e7f0ff;overflow:hidden;transition:opacity .22s,transform .22s;}
    #sp-panel.sp-hidden{opacity:0;pointer-events:none;transform:translateY(14px) scale(.96);}

    .sp-hdr{display:flex;align-items:center;justify-content:space-between;
      padding:12px 14px 0;flex-shrink:0;}
    .sp-hdr-title{font-size:.88rem;font-weight:700;color:#67d1ff;}
    .sp-hdr-close{width:26px;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.08);cursor:pointer;color:#e7f0ff;
      display:grid;place-items:center;font-size:13px;transition:.15s;}
    .sp-hdr-close:hover{background:rgba(255,110,122,.25);border-color:#ff6e7a;}

    .sp-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.09);
      background:rgba(255,255,255,.03);flex-shrink:0;margin-top:8px;}
    .sp-tab{flex:1;padding:9px 3px;text-align:center;cursor:pointer;font-size:.72rem;
      font-weight:700;letter-spacing:.03em;border:none;background:none;
      color:rgba(185,199,255,.5);border-bottom:2px solid transparent;transition:.15s;font-family:inherit;}
    .sp-tab:hover{color:#e7f0ff;}
    .sp-tab.on{color:#67d1ff;border-bottom-color:#67d1ff;}

    .sp-body{flex:1;overflow-y:auto;padding:12px;min-height:0;}
    .sp-body::-webkit-scrollbar{width:5px;}
    .sp-body::-webkit-scrollbar-thumb{background:rgba(103,209,255,.28);border-radius:5px;}

    /* shared button */
    .sp-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:10px;
      border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#e7f0ff;
      font-family:inherit;font-size:.78rem;cursor:pointer;transition:.15s;white-space:nowrap;}
    .sp-btn:hover{background:rgba(255,255,255,.15);transform:translateY(-1px);}
    .sp-btn.accent{background:linear-gradient(135deg,rgba(103,209,255,.18),rgba(127,255,212,.18));
      border-color:rgba(103,209,255,.4);color:#a8e8ff;}
    .sp-btn.danger{border-color:rgba(255,110,122,.3);color:#ffaaaf;}
    .sp-btn.danger:hover{background:rgba(255,110,122,.12);}

    /* toolbar row */
    .sp-row{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;}

    /* console */
    .sp-entry{font-family:'Courier New',monospace;font-size:.75rem;padding:3px 7px;
      border-radius:5px;margin-bottom:2px;border-left:2px solid transparent;
      word-break:break-all;animation:sp-in .1s ease both;}
    @keyframes sp-in{from{opacity:0;transform:translateY(2px);}to{opacity:1;}}
    .sp-ll-log  {border-color:rgba(185,199,255,.3);color:#c5d5ff;background:rgba(255,255,255,.025);}
    .sp-ll-info {border-color:#67d1ff;color:#a8e8ff;background:rgba(103,209,255,.055);}
    .sp-ll-warn {border-color:#ffd76e;color:#ffe9a0;background:rgba(255,215,110,.055);}
    .sp-ll-error{border-color:#ff6e7a;color:#ffaaaf;background:rgba(255,110,122,.055);}
    .sp-ll-debug{border-color:#b28aff;color:#d4bcff;background:rgba(178,138,255,.045);}
    .sp-lts{font-size:.66rem;opacity:.4;margin-right:4px;}

    /* toggle */
    .sp-trow{display:flex;align-items:center;gap:9px;margin:8px 0;}
    .sp-track{width:40px;height:22px;border-radius:999px;cursor:pointer;flex-shrink:0;
      background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);
      position:relative;transition:.18s;}
    .sp-track.on{background:linear-gradient(90deg,#67d1ff,#7fffd4);border-color:#67d1ff;}
    .sp-knob{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;
      background:#fff;transition:transform .18s;box-shadow:0 2px 5px rgba(0,0,0,.3);}
    .sp-track.on .sp-knob{transform:translateX(18px);}
    .sp-tlbl{font-size:.8rem;color:#e7f0ff;}

    /* snap cards */
    .sp-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
      border-radius:12px;padding:11px 13px;margin-bottom:9px;}
    .sp-card-title{font-weight:700;font-size:.84rem;color:#67d1ff;margin-bottom:2px;}
    .sp-card-meta{font-size:.7rem;color:rgba(185,199,255,.5);margin-bottom:8px;}
    .sp-keys{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;}
    .sp-key{font-family:'Courier New',monospace;font-size:.68rem;padding:2px 7px;border-radius:5px;
      background:rgba(103,209,255,.1);border:1px solid rgba(103,209,255,.2);color:#a8e8ff;
      cursor:pointer;transition:.13s;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .sp-key:hover{background:rgba(103,209,255,.22);}

    /* notes */
    .sp-select{width:100%;padding:8px 10px;border-radius:10px;
      background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
      color:#e7f0ff;font-family:inherit;font-size:.84rem;outline:none;margin-bottom:8px;}
    .sp-select option{background:#0a183a;}
    .sp-ta{width:100%;min-height:130px;padding:9px 11px;border-radius:10px;
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
      color:#e7f0ff;font-family:'Courier New',monospace;font-size:.8rem;
      resize:vertical;outline:none;line-height:1.55;transition:.15s;}
    .sp-ta:focus{border-color:rgba(103,209,255,.5);background:rgba(255,255,255,.09);}
    .sp-saved{font-size:.72rem;color:#7fffd4;min-height:15px;transition:opacity .4s;margin-top:3px;}
    .sp-saved.fade{opacity:0;}

    /* bookmarklet */
    .sp-bm-box{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
      border-radius:12px;padding:13px;margin-bottom:10px;}
    .sp-bm-desc{font-size:.8rem;color:rgba(185,199,255,.75);line-height:1.65;margin-bottom:10px;}
    .sp-bm-link{display:block;padding:10px 14px;border-radius:10px;text-align:center;
      background:linear-gradient(135deg,rgba(103,209,255,.22),rgba(127,255,212,.22));
      border:1px solid rgba(103,209,255,.42);color:#a8e8ff;font-weight:700;
      font-size:.84rem;cursor:grab;text-decoration:none;transition:.15s;word-break:break-all;}
    .sp-bm-link:hover{background:linear-gradient(135deg,rgba(103,209,255,.35),rgba(127,255,212,.35));}
    .sp-bm-note{font-size:.74rem;color:rgba(185,199,255,.5);line-height:1.55;margin-top:8px;}

    /* val modal */
    #sp-vmodal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);
      backdrop-filter:blur(8px);display:none;place-items:center;}
    #sp-vmodal.on{display:grid;}
    #sp-vbox{width:min(480px,calc(100vw - 24px));background:rgba(5,11,28,.98);
      border:1px solid rgba(103,209,255,.3);border-radius:16px;padding:18px;
      box-shadow:0 32px 72px rgba(0,0,0,.85);}
    #sp-vkey{font-family:'Courier New',monospace;font-size:.8rem;color:#67d1ff;
      margin-bottom:8px;word-break:break-all;}
    #sp-vcontent{width:100%;min-height:120px;padding:9px;border-radius:10px;
      background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
      color:#e7f0ff;font-family:'Courier New',monospace;font-size:.75rem;resize:vertical;outline:none;}

    .sp-divider{height:1px;background:rgba(255,255,255,.07);margin:8px 0;}
    .sp-stat{font-size:.74rem;color:rgba(185,199,255,.45);margin-top:6px;}
    .sp-empty{font-size:.82rem;color:rgba(185,199,255,.5);line-height:1.6;}
    .sp-empty strong{color:#67d1ff;}
  </style>`);

  /* ─────────────────────────────────────────────
     PANEL HTML
  ───────────────────────────────────────────── */
  document.body.insertAdjacentHTML("beforeend", `
    <button id="sp-fab" title="Save Progress">💾<div id="sp-badge" class="sp-badge"></div></button>

    <div id="sp-panel" class="sp-hidden">
      <div class="sp-hdr">
        <span class="sp-hdr-title">💾 Save Progress</span>
        <button class="sp-hdr-close" id="sp-close">✕</button>
      </div>
      <div class="sp-tabs">
        <button class="sp-tab on" data-tab="console">🖥 Console</button>
        <button class="sp-tab" data-tab="saves">💾 Saves</button>
        <button class="sp-tab" data-tab="notes">📝 Notes</button>
        <button class="sp-tab" data-tab="bookmarklet">🔖 Bookmark</button>
        <button class="sp-tab" data-tab="export">📦 Export</button>
      </div>

      <!-- CONSOLE -->
      <div class="sp-body" id="sp-body-console">
        <div class="sp-row">
          <button class="sp-btn" id="sp-con-clear">🗑 Clear</button>
          <button class="sp-btn" data-filter="">All</button>
          <button class="sp-btn" data-filter="error">Errors</button>
          <button class="sp-btn" data-filter="warn">Warns</button>
          <button class="sp-btn" data-filter="info">Info</button>
        </div>
        <div class="sp-trow">
          <div class="sp-track" id="sp-inject-track"><div class="sp-knob"></div></div>
          <span class="sp-tlbl" id="sp-inject-lbl">Inject console into Blanker tabs</span>
        </div>
        <div id="sp-con-list"></div>
      </div>

      <!-- SAVES -->
      <div class="sp-body sp-hidden" id="sp-body-saves">
        <div id="sp-snaps"></div>
        <div id="sp-snaps-empty" class="sp-empty" style="display:none">
          No saves yet.<br>
          • Open a game with <strong>Blanker</strong> (with inject ON) and click <strong>💾 Snap</strong><br>
          • Or use the <strong>Bookmarklet</strong> tab on any game site
        </div>
      </div>

      <!-- NOTES -->
      <div class="sp-body sp-hidden" id="sp-body-notes">
        <select class="sp-select" id="sp-note-sel"><option value="">— Pick a game —</option></select>
        <textarea class="sp-ta" id="sp-note-ta" placeholder="Level, score, passwords, seeds, tips…" spellcheck="false"></textarea>
        <div class="sp-saved fade" id="sp-saved-ind">✓ Auto-saved</div>
      </div>

      <!-- BOOKMARKLET -->
      <div class="sp-body sp-hidden" id="sp-body-bookmarklet">
        <div class="sp-bm-box">
          <div class="sp-bm-desc">
            <strong style="color:#67d1ff">Drag this to your bookmarks bar</strong>, then click it on any game website to snapshot its full <strong style="color:#7fffd4">localStorage</strong> and beam it back here instantly.
          </div>
          <a id="sp-bm-link" class="sp-bm-link" title="Drag me to your bookmarks bar">📸 Snapshot Game Save</a>
          <div class="sp-bm-note">
            How it works:<br>
            1. Drag the button above to your bookmarks bar<br>
            2. Go to any game in a regular tab<br>
            3. Click the bookmarklet — data appears in <strong style="color:#7fffd4">Saves</strong><br>
            4. This launcher tab must be open to receive it
          </div>
        </div>
        <div class="sp-bm-box">
          <div class="sp-bm-desc" style="margin-bottom:6px"><strong style="color:#7fffd4">Or paste this in DevTools Console</strong> on any game site:</div>
          <textarea class="sp-ta" id="sp-bm-code" readonly style="min-height:54px;font-size:.68rem;" spellcheck="false"></textarea>
        </div>
      </div>

      <!-- EXPORT -->
      <div class="sp-body sp-hidden" id="sp-body-export">
        <div style="display:flex;flex-direction:column;gap:7px;">
          <button class="sp-btn accent" id="sp-dl-all">📦 Download full save (JSON)</button>
          <button class="sp-btn" id="sp-dl-snaps">💾 Download localStorage snapshots</button>
          <button class="sp-btn" id="sp-dl-notes">📝 Download notes only</button>
          <button class="sp-btn" id="sp-dl-logs">🖥 Download console logs</button>
          <div class="sp-divider"></div>
          <button class="sp-btn" id="sp-import-btn">📥 Import save file</button>
          <input type="file" id="sp-import-file" accept=".json" style="display:none"/>
          <div class="sp-divider"></div>
          <button class="sp-btn danger" id="sp-clear-all">🗑 Clear ALL saved data</button>
          <div class="sp-stat" id="sp-stat-line"></div>
        </div>
      </div>
    </div>

    <!-- Value inspector -->
    <div id="sp-vmodal">
      <div id="sp-vbox">
        <div id="sp-vkey"></div>
        <textarea id="sp-vcontent" readonly></textarea>
        <button class="sp-btn" id="sp-vclose" style="margin-top:8px;width:100%;justify-content:center;">Close</button>
      </div>
    </div>
  `);

  /* ─────────────────────────────────────────────
     OPEN / CLOSE
  ───────────────────────────────────────────── */
  document.getElementById("sp-fab").addEventListener("click", () => {
    panelOpen = !panelOpen;
    document.getElementById("sp-panel").classList.toggle("sp-hidden", !panelOpen);
    if (panelOpen) refreshActiveTab();
  });
  document.getElementById("sp-close").addEventListener("click", () => {
    panelOpen = false; document.getElementById("sp-panel").classList.add("sp-hidden");
  });

  function refreshActiveTab() {
    if (activeTab==="console")     renderConsoleLogs();
    if (activeTab==="saves")       renderSnaps();
    if (activeTab==="notes")       populateNoteSelect();
    if (activeTab==="bookmarklet") buildBookmarklet();
    if (activeTab==="export")      updateStatLine();
  }

  /* ─────────────────────────────────────────────
     TABS
  ───────────────────────────────────────────── */
  document.querySelectorAll(".sp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll(".sp-tab").forEach(t => t.classList.remove("on"));
      tab.classList.add("on");
      document.querySelectorAll(".sp-body").forEach(b => b.classList.add("sp-hidden"));
      document.getElementById("sp-body-" + activeTab).classList.remove("sp-hidden");
      refreshActiveTab();
    });
  });

  /* ─────────────────────────────────────────────
     CONSOLE TAB
  ───────────────────────────────────────────── */
  function renderConsoleLogs() {
    const list = document.getElementById("sp-con-list");
    const logs = conFilter ? consoleLogs.filter(l=>l.lvl===conFilter) : consoleLogs;
    list.innerHTML = "";
    const frag = document.createDocumentFragment();
    logs.slice(-150).forEach(e => {
      const d = document.createElement("div");
      d.className = "sp-entry sp-ll-" + e.lvl;
      d.innerHTML = `<span class="sp-lts">${new Date(e.t).toLocaleTimeString()}</span>${esc(e.msg)}`;
      frag.appendChild(d);
    });
    list.appendChild(frag);
    list.scrollTop = list.scrollHeight;
  }

  document.getElementById("sp-con-clear").addEventListener("click", () => {
    consoleLogs.length = 0; store.set(K_CONSOLE, []); renderConsoleLogs();
  });
  document.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => { conFilter = btn.dataset.filter; renderConsoleLogs(); });
  });

  // Inject toggle
  const injTrack = document.getElementById("sp-inject-track");
  const injLbl   = document.getElementById("sp-inject-lbl");
  function syncInject() {
    injTrack.classList.toggle("on", injectOn);
    injLbl.textContent = injectOn ? "Injecting — ON (next Blanker opens will have panel)" : "Inject console into Blanker tabs";
    store.set(K_INJECT, injectOn);
    patchBlanker();
  }
  syncInject();
  injTrack.addEventListener("click", () => { injectOn = !injectOn; syncInject(); });

  /* ─────────────────────────────────────────────
     SAVES TAB
  ───────────────────────────────────────────── */
  function renderSnaps() {
    const container = document.getElementById("sp-snaps");
    const emptyEl   = document.getElementById("sp-snaps-empty");
    const keys = Object.keys(lsSnaps).sort((a,b) => (lsSnaps[b].savedAt||0)-(lsSnaps[a].savedAt||0));
    container.innerHTML = "";

    if (!keys.length) { emptyEl.style.display="block"; return; }
    emptyEl.style.display = "none";

    keys.forEach(gk => {
      const s = lsSnaps[gk];
      const snapKeys = Object.keys(s.snap||{});
      const card = document.createElement("div");
      card.className = "sp-card";

      const keysId = "spkeys-" + gk.replace(/[^a-z0-9]/gi,"");
      card.innerHTML = `
        <div class="sp-card-title">${esc(s.title||gk)}</div>
        <div class="sp-card-meta">${esc(s.origin||"")} &nbsp;·&nbsp; ${snapKeys.length} key(s) &nbsp;·&nbsp; ${s.savedAt ? new Date(s.savedAt).toLocaleString() : "?"}</div>
        <div class="sp-keys" id="${keysId}"></div>
        <div class="sp-row">
          <button class="sp-btn" data-dl="${gk}">💾 Download</button>
          <button class="sp-btn danger" data-del="${gk}">✕ Delete</button>
        </div>`;

      const keysEl = card.querySelector("#" + keysId);
      snapKeys.slice(0,24).forEach(k => {
        const tag = document.createElement("span");
        tag.className="sp-key"; tag.textContent=k; tag.title="Click to inspect";
        tag.addEventListener("click", () => showVal(k, s.snap[k]));
        keysEl.appendChild(tag);
      });
      if (snapKeys.length > 24) {
        const more = document.createElement("span");
        more.className="sp-key"; more.textContent = `+${snapKeys.length-24} more`;
        keysEl.appendChild(more);
      }

      card.querySelector("[data-dl]").addEventListener("click", () =>
        dlJSON(`save-${gk}-${Date.now()}.json`, s));
      card.querySelector("[data-del]").addEventListener("click", () => {
        if (confirm("Delete this save?")) { delete lsSnaps[gk]; store.set(K_SNAPS, lsSnaps); renderSnaps(); }
      });

      container.appendChild(card);
    });
  }

  function showVal(key, val) {
    document.getElementById("sp-vkey").textContent = key;
    let pretty = val;
    try { pretty = JSON.stringify(JSON.parse(String(val)), null, 2); } catch { pretty = String(val); }
    document.getElementById("sp-vcontent").value = pretty;
    document.getElementById("sp-vmodal").classList.add("on");
  }
  document.getElementById("sp-vclose").addEventListener("click", () => document.getElementById("sp-vmodal").classList.remove("on"));
  document.getElementById("sp-vmodal").addEventListener("click", e => { if(e.target===document.getElementById("sp-vmodal")) document.getElementById("sp-vmodal").classList.remove("on"); });

  /* ─────────────────────────────────────────────
     NOTES TAB
  ───────────────────────────────────────────── */
  let curNoteKey = null, noteSaveTimer = null;

  function populateNoteSelect() {
    const sel = document.getElementById("sp-note-sel");
    const cur = sel.value;
    sel.innerHTML = `<option value="">— Pick a game —</option>`;
    Object.keys(notesStore).forEach(k => {
      const o = document.createElement("option");
      o.value=k; o.textContent=notesStore[k].title||k; sel.appendChild(o);
    });
    try {
      JSON.parse(localStorage.getItem("dbg_items_v6")||"[]").forEach(item => {
        if (!notesStore[item.id]) {
          const o = document.createElement("option");
          o.value=item.id; o.textContent=item.title||item.src; sel.appendChild(o);
        }
      });
    } catch(e) {}
    Object.keys(lsSnaps).forEach(k => {
      if (!notesStore[k] && !document.querySelector(`#sp-note-sel option[value="${k}"]`)) {
        const o = document.createElement("option");
        o.value=k; o.textContent=lsSnaps[k].title||k; sel.appendChild(o);
      }
    });
    sel.value = cur;
    loadNote(sel.value);
  }

  function loadNote(key) {
    curNoteKey = key||null;
    const ta = document.getElementById("sp-note-ta");
    ta.disabled = !key;
    ta.value = key ? (notesStore[key]?.notes||"") : "";
  }

  document.getElementById("sp-note-sel").addEventListener("change", e => loadNote(e.target.value));
  document.getElementById("sp-note-ta").addEventListener("input", () => {
    if (!curNoteKey) return;
    const text = document.getElementById("sp-note-ta").value;
    if (!notesStore[curNoteKey]) {
      let title = curNoteKey;
      try { const f = JSON.parse(localStorage.getItem("dbg_items_v6")||"[]").find(x=>x.id===curNoteKey); if(f) title=f.title||title; } catch(e) {}
      notesStore[curNoteKey] = { title, notes:"", ts:0 };
    }
    notesStore[curNoteKey].notes = text;
    notesStore[curNoteKey].ts = Date.now();
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => {
      store.set(K_NOTES, notesStore);
      const ind = document.getElementById("sp-saved-ind");
      ind.classList.remove("fade");
      setTimeout(() => ind.classList.add("fade"), 1400);
    }, 500);
  });

  /* ─────────────────────────────────────────────
     BOOKMARKLET TAB
  ───────────────────────────────────────────── */
  function buildBookmarklet() {
    const code = `(function(){var s={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);s[k]=localStorage.getItem(k);}var p=JSON.stringify({type:'sp_snapshot',title:document.title,origin:location.origin,snap:s});try{new BroadcastChannel('sp_channel').postMessage(p);}catch(e){}try{window.opener&&window.opener.postMessage(p,'*');}catch(e){}alert('Snapshot sent! '+Object.keys(s).length+' keys from '+location.origin);})();`;
    document.getElementById("sp-bm-link").href = "javascript:" + encodeURIComponent(code);
    document.getElementById("sp-bm-code").value = code;
  }

  /* ─────────────────────────────────────────────
     EXPORT TAB
  ───────────────────────────────────────────── */
  function updateStatLine() {
    document.getElementById("sp-stat-line").textContent =
      `${Object.keys(lsSnaps).length} save snapshot(s) · ${Object.keys(notesStore).length} note(s) · ${consoleLogs.length} log(s)`;
  }

  document.getElementById("sp-dl-all").addEventListener("click", () =>
    dlJSON(`dbg-save-${Date.now()}.json`, { exported:new Date().toISOString(), version:2, lsSnaps, notes:notesStore, consoleLogs }));
  document.getElementById("sp-dl-snaps").addEventListener("click", () => dlJSON(`dbg-snaps-${Date.now()}.json`, lsSnaps));
  document.getElementById("sp-dl-notes").addEventListener("click", () => dlJSON(`dbg-notes-${Date.now()}.json`, notesStore));
  document.getElementById("sp-dl-logs").addEventListener("click",  () => dlJSON(`dbg-logs-${Date.now()}.json`, consoleLogs));
  document.getElementById("sp-import-btn").addEventListener("click", () => document.getElementById("sp-import-file").click());
  document.getElementById("sp-import-file").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.lsSnaps)     Object.assign(lsSnaps, d.lsSnaps);
        if (d.notes)       Object.assign(notesStore, d.notes);
        if (d.consoleLogs) { consoleLogs.length=0; consoleLogs.push(...d.consoleLogs); }
        store.set(K_SNAPS, lsSnaps); store.set(K_NOTES, notesStore); store.set(K_CONSOLE, consoleLogs);
        refreshActiveTab(); updateStatLine();
        alert("✓ Import successful!");
      } catch { alert("⚠ Invalid save file"); }
    };
    r.readAsText(file); e.target.value="";
  });
  document.getElementById("sp-clear-all").addEventListener("click", () => {
    if (!confirm("Delete ALL snapshots, notes, and console logs? Cannot be undone.")) return;
    consoleLogs.length=0;
    Object.keys(notesStore).forEach(k=>delete notesStore[k]);
    Object.keys(lsSnaps).forEach(k=>delete lsSnaps[k]);
    store.set(K_CONSOLE,[]); store.set(K_NOTES,{}); store.set(K_SNAPS,{});
    refreshActiveTab(); updateStatLine(); alert("Cleared.");
  });

  /* ─────────────────────────────────────────────
     BLANKER PATCH
     Wraps makeBlankerHTML() to inject a floating
     save panel + console + localStorage snap button
     into every about:blanker game window.
  ───────────────────────────────────────────── */
  function patchBlanker() {
    if (!injectOn) {
      if (window.__sp_orig) window.makeBlankerHTML = window.__sp_orig;
      return;
    }
    if (!window.__sp_orig) {
      if (typeof window.makeBlankerHTML !== "function") { setTimeout(patchBlanker, 300); return; }
      window.__sp_orig = window.makeBlankerHTML;
    }

    window.makeBlankerHTML = function(title, src, autoFS) {
      const base = window.__sp_orig(title, src, autoFS);
      const safeTitle = JSON.stringify(String(title||"Game"));
      const safeOrigin = JSON.stringify(String(src||""));

      const inject = `
<style>
  #spw{position:fixed;bottom:10px;left:10px;z-index:99999;width:290px;
    background:rgba(4,9,24,.96);border:1px solid rgba(103,209,255,.28);border-radius:12px;
    font-size:.72rem;color:#c5d5ff;box-shadow:0 14px 44px rgba(0,0,0,.8);overflow:hidden;
    transition:max-height .22s ease;max-height:280px;font-family:'Courier New',monospace;}
  #spw.col{max-height:34px;}
  #spwh{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;
    background:rgba(103,209,255,.07);cursor:pointer;border-bottom:1px solid rgba(255,255,255,.06);}
  #spwt{font-weight:700;color:#67d1ff;font-family:system-ui,sans-serif;font-size:.74rem;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;}
  .spwb{padding:3px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.07);color:#e7f0ff;cursor:pointer;font-size:.67rem;margin-left:2px;}
  .spwb:hover{background:rgba(255,255,255,.18);}
  #spwlogs{overflow-y:auto;max-height:130px;padding:4px 7px;}
  #spwlogs::-webkit-scrollbar{width:3px;}
  #spwlogs::-webkit-scrollbar-thumb{background:rgba(103,209,255,.3);border-radius:3px;}
  .spwl{padding:2px 0 2px 5px;border-left:2px solid rgba(255,255,255,.14);margin-bottom:1px;word-break:break-all;}
  .spwl.e{border-color:#ff6e7a;color:#ffaaaf;} .spwl.w{border-color:#ffd76e;color:#ffe9a0;}
  .spwl.i{border-color:#67d1ff;color:#a8e8ff;}
  #spwnotes{padding:6px 8px;border-top:1px solid rgba(255,255,255,.06);display:none;}
  #spwna{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
    border-radius:6px;color:#e7f0ff;font-family:'Courier New',monospace;font-size:.68rem;
    padding:4px;resize:none;outline:none;height:42px;}
  #spwna:focus{border-color:rgba(103,209,255,.45);}
  #spwsnapinfo{padding:5px 8px;border-top:1px solid rgba(255,255,255,.06);
    font-size:.68rem;color:#7fffd4;display:none;}
</style>
<div id="spw">
  <div id="spwh">
    <span id="spwt">💾 Console</span>
    <span>
      <button class="spwb" id="spwn">📝</button>
      <button class="spwb" id="spwsnap">💾 Snap</button>
      <button class="spwb" id="spwcl">—</button>
    </span>
  </div>
  <div id="spwlogs"></div>
  <div id="spwnotes">
    <textarea id="spwna" placeholder="Progress notes…"></textarea>
    <div style="display:flex;gap:4px;margin-top:3px;">
      <button class="spwb" id="spwsb">Save</button>
      <button class="spwb" id="spwclear">Clear logs</button>
    </div>
  </div>
  <div id="spwsnapinfo"></div>
</div>
<script>
(function(){
  var TITLE=${safeTitle};
  var NOTE_KEY='sp_note_'+encodeURIComponent(TITLE).slice(0,40);
  var logs=document.getElementById('spwlogs');
  var collapsed=false;

  function send(type,data){
    var p=JSON.stringify(Object.assign({type:type},data));
    try{new BroadcastChannel('sp_channel').postMessage(p);}catch(e){}
    try{window.opener&&window.opener.postMessage(p,'*');}catch(e){}
  }

  function addLog(lvl,msg){
    var d=document.createElement('div');
    d.className='spwl '+(lvl==='error'?'e':lvl==='warn'?'w':lvl==='info'?'i':'');
    d.textContent=new Date().toLocaleTimeString().slice(0,8)+' '+msg.slice(0,200);
    logs.appendChild(d);
    if(logs.children.length>80) logs.removeChild(logs.firstChild);
    logs.scrollTop=logs.scrollHeight;
    send('sp_log',{lvl:lvl,msg:msg,label:TITLE});
  }

  // Console intercept
  ['log','warn','error','info','debug'].forEach(function(m){
    var o=console[m].bind(console);
    console[m]=function(){
      o.apply(console,arguments);
      addLog(m,Array.from(arguments).map(function(a){
        try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(e){return String(a);}
      }).join(' '));
    };
  });
  window.addEventListener('error',function(e){addLog('error','Uncaught: '+e.message+' (line '+e.lineno+')');});
  window.addEventListener('unhandledrejection',function(e){addLog('error','Promise rejection: '+String(e.reason));});

  function snapLS(){
    var snap={};
    for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);snap[k]=localStorage.getItem(k);}
    send('sp_snapshot',{title:document.title||TITLE,origin:location.origin,snap:snap});
    return snap;
  }

  // Snap button
  document.getElementById('spwsnap').addEventListener('click',function(){
    var snap=snapLS();
    var info=document.getElementById('spwsnapinfo');
    var n=Object.keys(snap).length;
    info.style.display='block';
    info.textContent='✓ '+n+' key(s) sent to launcher'+(n===0?' (localStorage is empty here — game may use a different storage)':'');
    setTimeout(function(){info.style.display='none';},4000);
  });

  // Auto-snap on unload
  window.addEventListener('beforeunload',function(){
    var snap={};
    for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);snap[k]=localStorage.getItem(k);}
    if(Object.keys(snap).length) send('sp_snapshot',{title:document.title||TITLE,origin:location.origin,snap:snap});
  });

  // Collapse
  document.getElementById('spwh').addEventListener('click',function(e){
    if(e.target.closest('.spwb')) return;
    collapsed=!collapsed;
    document.getElementById('spw').classList.toggle('col',collapsed);
    document.getElementById('spwcl').textContent=collapsed?'+':'—';
  });
  document.getElementById('spwcl').addEventListener('click',function(e){
    e.stopPropagation();collapsed=!collapsed;
    document.getElementById('spw').classList.toggle('col',collapsed);
    e.target.textContent=collapsed?'+':'—';
  });

  // Notes
  document.getElementById('spwn').addEventListener('click',function(){
    var n=document.getElementById('spwnotes');
    var show=n.style.display==='none';
    n.style.display=show?'block':'none';
    if(show){document.getElementById('spwna').value=localStorage.getItem(NOTE_KEY)||'';}
  });
  document.getElementById('spwsb').addEventListener('click',function(){
    var txt=document.getElementById('spwna').value;
    localStorage.setItem(NOTE_KEY,txt);
    send('sp_note',{key:NOTE_KEY,txt:txt,gameTitle:TITLE});
    this.textContent='✓'; setTimeout(function(){document.getElementById('spwsb').textContent='Save';},1200);
  });
  document.getElementById('spwclear').addEventListener('click',function(){logs.innerHTML='';});

  addLog('info','Save Progress ready. Hit 💾 Snap to capture localStorage.');
})();
<\/script>`;

      return base.replace("</body>", inject + "</body>");
    };
  }

  patchBlanker();
  document.addEventListener("DOMContentLoaded", patchBlanker);

  console.log("[SaveProgress v2] ✓ Loaded — console intercepted, BroadcastChannel listening");
})();
