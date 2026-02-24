/**
 * ============================================================
 *  DEEP BLUE GAMES HUB — Save Progress Module
 *  Drop this file next to index.html and add ONE line to your
 *  index.html just before </body>:
 *
 *    <script src="save-progress.js"></script>
 *
 *  What it does:
 *  1. CONSOLE PANEL   — intercepts window console, saves every
 *                       log/warn/error to localStorage with timestamps
 *  2. NOTES PANEL     — per-game progress notes you type manually
 *                       (scores, levels, seeds, cheats, etc.)
 *  3. BLANKER INJECT  — upgrades about:blanker tabs with a
 *                       floating console viewer + note-taker
 *                       so you can track progress INSIDE the game window
 *  4. EXPORT / IMPORT — download all saves as JSON, restore later
 * ============================================================
 */
;(function SaveProgressModule() {
  "use strict";

  /* ──────────────────────────────────────────────────────────
     CONSTANTS
  ────────────────────────────────────────────────────────── */
  const KEY_CONSOLE = "dbg_console_v1";
  const KEY_NOTES   = "dbg_notes_v1";
  const MAX_LOGS    = 400;

  /* ──────────────────────────────────────────────────────────
     STORAGE HELPERS
  ────────────────────────────────────────────────────────── */
  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch(e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  /* ──────────────────────────────────────────────────────────
     CONSOLE INTERCEPTOR
     Wraps window.console methods so every log is stored.
  ────────────────────────────────────────────────────────── */
  const consoleLogs = loadJSON(KEY_CONSOLE, []);
  const _orig = {};
  ["log","warn","error","info","debug"].forEach(method => {
    _orig[method] = console[method].bind(console);
    console[method] = function(...args) {
      _orig[method](...args);
      const entry = {
        t: Date.now(),
        lvl: method,
        msg: args.map(a => {
          try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
          catch(e) { return String(a); }
        }).join(" ")
      };
      consoleLogs.push(entry);
      if (consoleLogs.length > MAX_LOGS) consoleLogs.splice(0, consoleLogs.length - MAX_LOGS);
      saveJSON(KEY_CONSOLE, consoleLogs);
      if (panelConsoleList) renderConsoleLogs();
    };
  });

  /* ──────────────────────────────────────────────────────────
     NOTES STORE  { [gameId_or_title]: { title, notes, ts } }
  ────────────────────────────────────────────────────────── */
  const notesStore = loadJSON(KEY_NOTES, {});
  function saveNotes() { saveJSON(KEY_NOTES, notesStore); }

  /* ──────────────────────────────────────────────────────────
     INJECT STYLES
  ────────────────────────────────────────────────────────── */
  const style = document.createElement("style");
  style.textContent = `
    /* ── Save Progress Panel ── */
    #sp-fab {
      position: fixed; bottom: 72px; right: 18px; z-index: 9999;
      width: 50px; height: 50px; border-radius: 50%;
      background: linear-gradient(135deg, #67d1ff, #7fffd4);
      border: none; cursor: pointer; box-shadow: 0 6px 20px rgba(103,209,255,.5);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; transition: transform .2s, box-shadow .2s;
      color: #041224;
    }
    #sp-fab:hover { transform: scale(1.1) rotate(-8deg); box-shadow: 0 10px 28px rgba(103,209,255,.65); }

    #sp-panel {
      position: fixed; bottom: 132px; right: 18px; z-index: 9998;
      width: 400px; max-width: calc(100vw - 24px);
      max-height: 70vh; display: flex; flex-direction: column;
      background: rgba(6,14,32,.97); backdrop-filter: blur(18px);
      border: 1px solid rgba(103,209,255,.25); border-radius: 18px;
      box-shadow: 0 28px 64px rgba(0,0,0,.6);
      font-family: 'Comfortaa', system-ui, sans-serif;
      color: #e7f0ff; overflow: hidden;
      transition: opacity .25s, transform .25s;
    }
    #sp-panel.sp-hidden { opacity: 0; pointer-events: none; transform: translateY(10px) scale(.97); }

    .sp-tabs {
      display: flex; border-bottom: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.04); flex-shrink: 0;
    }
    .sp-tab {
      flex: 1; padding: 10px 6px; text-align: center; cursor: pointer;
      font-size: .8rem; font-weight: 700; letter-spacing: .04em;
      border: none; background: none; color: rgba(185,199,255,.6);
      border-bottom: 2px solid transparent; transition: .2s;
    }
    .sp-tab:hover { color: #e7f0ff; }
    .sp-tab.sp-active { color: #67d1ff; border-bottom-color: #67d1ff; }

    .sp-body { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }
    .sp-body::-webkit-scrollbar { width: 6px; }
    .sp-body::-webkit-scrollbar-thumb { background: rgba(103,209,255,.3); border-radius: 6px; }

    /* Console tab */
    .sp-log-entry {
      font-family: 'Courier New', monospace; font-size: .78rem;
      padding: 4px 8px; border-radius: 6px; margin-bottom: 3px;
      border-left: 3px solid transparent; word-break: break-all;
      animation: sp-fadein .15s ease both;
    }
    @keyframes sp-fadein { from { opacity:0; transform:translateY(3px); } to { opacity:1; } }
    .sp-log-log   { border-color: rgba(185,199,255,.3); color: #c5d5ff; background: rgba(255,255,255,.03); }
    .sp-log-info  { border-color: #67d1ff; color: #a8e8ff; background: rgba(103,209,255,.07); }
    .sp-log-warn  { border-color: #ffd76e; color: #ffe9a0; background: rgba(255,215,110,.07); }
    .sp-log-error { border-color: #ff6e7a; color: #ffaaaf; background: rgba(255,110,122,.07); }
    .sp-log-debug { border-color: #b28aff; color: #d4bcff; background: rgba(178,138,255,.06); }
    .sp-log-ts { font-size: .68rem; opacity: .45; margin-right: 5px; }

    /* Notes tab */
    .sp-game-select {
      width: 100%; padding: 8px 10px; border-radius: 10px;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15);
      color: #e7f0ff; font-family: inherit; font-size: .86rem; outline: none; margin-bottom: 8px;
    }
    .sp-game-select option { background: #0a183a; }
    .sp-notes-area {
      width: 100%; min-height: 140px; padding: 10px; border-radius: 10px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14);
      color: #e7f0ff; font-family: 'Courier New', monospace; font-size: .82rem;
      resize: vertical; outline: none; line-height: 1.5;
      transition: border-color .2s, background .2s;
    }
    .sp-notes-area:focus { border-color: rgba(103,209,255,.5); background: rgba(255,255,255,.09); }
    .sp-save-indicator {
      font-size: .74rem; color: #7fffd4; margin-top: 4px; min-height: 16px;
      transition: opacity .4s;
    }
    .sp-save-indicator.sp-fade { opacity: 0; }

    /* Blanker inject tab */
    .sp-inject-info {
      font-size: .8rem; color: rgba(185,199,255,.75); line-height: 1.6;
      background: rgba(255,255,255,.04); border-radius: 10px; padding: 10px;
      border: 1px solid rgba(255,255,255,.1);
    }
    .sp-inject-info strong { color: #67d1ff; }
    .sp-inject-toggle {
      display: flex; align-items: center; gap: 10px; margin-top: 10px;
    }
    .sp-toggle-track {
      width: 42px; height: 24px; border-radius: 999px; cursor: pointer;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2);
      position: relative; transition: background .2s;
      flex-shrink: 0;
    }
    .sp-toggle-track.on { background: linear-gradient(90deg, #67d1ff, #7fffd4); border-color: #67d1ff; }
    .sp-toggle-knob {
      position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
      border-radius: 50%; background: white; transition: transform .2s;
      box-shadow: 0 2px 6px rgba(0,0,0,.3);
    }
    .sp-toggle-track.on .sp-toggle-knob { transform: translateX(18px); }
    .sp-inject-label { font-size: .82rem; color: #e7f0ff; }

    /* Export tab */
    .sp-export-grid { display: flex; flex-direction: column; gap: 8px; }
    .sp-export-btn {
      padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.16);
      background: rgba(255,255,255,.08); color: #e7f0ff; font-family: inherit;
      font-size: .86rem; cursor: pointer; text-align: left;
      transition: background .2s, transform .15s;
    }
    .sp-export-btn:hover { background: rgba(255,255,255,.15); transform: translateX(3px); }
    .sp-export-btn .sp-btn-icon { margin-right: 8px; }
    .sp-stat { font-size: .78rem; color: rgba(185,199,255,.6); margin-top: 4px; }
    .sp-divider { height: 1px; background: rgba(255,255,255,.08); margin: 8px 0; }

    /* Header */
    .sp-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px 0; flex-shrink: 0;
    }
    .sp-title { font-size: .88rem; font-weight: 700; color: #67d1ff; }
    .sp-close-btn {
      width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.08); cursor: pointer; color: #e7f0ff;
      display: grid; place-items: center; font-size: 14px; transition: .2s;
    }
    .sp-close-btn:hover { background: rgba(255,110,122,.25); border-color: #ff6e7a; }
  `;
  document.head.appendChild(style);

  /* ──────────────────────────────────────────────────────────
     BUILD UI
  ────────────────────────────────────────────────────────── */
  // FAB button
  const fab = document.createElement("button");
  fab.id = "sp-fab";
  fab.title = "Game Progress & Console";
  fab.textContent = "💾";
  document.body.appendChild(fab);

  // Panel
  const panel = document.createElement("div");
  panel.id = "sp-panel";
  panel.classList.add("sp-hidden");
  panel.innerHTML = `
    <div class="sp-header">
      <span class="sp-title">💾 Save Progress</span>
      <button class="sp-close-btn" id="sp-close">✕</button>
    </div>
    <div class="sp-tabs">
      <button class="sp-tab sp-active" data-tab="console">🖥 Console</button>
      <button class="sp-tab" data-tab="notes">📝 Notes</button>
      <button class="sp-tab" data-tab="inject">🔧 Blanker</button>
      <button class="sp-tab" data-tab="export">📦 Export</button>
    </div>
    <div class="sp-body" id="sp-body-console">
      <div id="sp-console-toolbar" style="display:flex;gap:6px;margin-bottom:8px;">
        <button class="sp-export-btn" id="sp-console-clear" style="padding:5px 10px;font-size:.76rem;">🗑 Clear logs</button>
        <button class="sp-export-btn" id="sp-console-filter-all"  style="padding:5px 10px;font-size:.76rem;" data-filter="">All</button>
        <button class="sp-export-btn" id="sp-console-filter-err"  style="padding:5px 10px;font-size:.76rem;" data-filter="error">Errors</button>
        <button class="sp-export-btn" id="sp-console-filter-warn" style="padding:5px 10px;font-size:.76rem;" data-filter="warn">Warns</button>
      </div>
      <div id="sp-console-list"></div>
    </div>
    <div class="sp-body sp-hidden" id="sp-body-notes">
      <select class="sp-game-select" id="sp-game-select"><option value="">— Pick a game —</option></select>
      <textarea class="sp-notes-area" id="sp-notes-area" placeholder="Type your progress here…&#10;Level, score, seeds, cheats, save codes…" spellcheck="false"></textarea>
      <div class="sp-save-indicator sp-fade" id="sp-save-indicator">✓ Saved</div>
    </div>
    <div class="sp-body sp-hidden" id="sp-body-inject">
      <div class="sp-inject-info">
        <strong>about:blanker Script Injector</strong><br><br>
        When enabled, every game you open with <strong>Blanker</strong> or <strong>Blanker+FS</strong> will get a floating mini-console panel injected into the page.<br><br>
        It shows live console output <em>from inside the game window</em> and lets you write notes without leaving the game.
        <div class="sp-inject-toggle">
          <div class="sp-toggle-track" id="sp-inject-toggle"><div class="sp-toggle-knob"></div></div>
          <span class="sp-inject-label" id="sp-inject-label">Disabled</span>
        </div>
      </div>
      <div style="margin-top:12px;font-size:.78rem;color:rgba(185,199,255,.6);line-height:1.5;">
        ⚠ Note: The injected panel only captures the game window's own console — not iframes within it. This works best for single-page JS games.
      </div>
    </div>
    <div class="sp-body sp-hidden" id="sp-body-export">
      <div class="sp-export-grid">
        <button class="sp-export-btn" id="sp-dl-all"><span class="sp-btn-icon">📦</span>Download full save (JSON)</button>
        <button class="sp-export-btn" id="sp-dl-notes"><span class="sp-btn-icon">📝</span>Download notes only</button>
        <button class="sp-export-btn" id="sp-dl-console"><span class="sp-btn-icon">🖥</span>Download console logs</button>
        <div class="sp-divider"></div>
        <button class="sp-export-btn" id="sp-import-btn"><span class="sp-btn-icon">📥</span>Import save file</button>
        <input type="file" id="sp-import-file" accept=".json" style="display:none"/>
        <div class="sp-divider"></div>
        <button class="sp-export-btn" id="sp-clear-all" style="border-color:rgba(255,110,122,.3);color:#ffaaaf;"><span class="sp-btn-icon">🗑</span>Clear ALL saved data</button>
        <div class="sp-stat" id="sp-stats-line"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  /* ──────────────────────────────────────────────────────────
     ELEMENT REFS
  ────────────────────────────────────────────────────────── */
  let panelConsoleList = document.getElementById("sp-console-list");
  let activeTab = "console";
  let consoleFilter = "";
  let injectEnabled = loadJSON("dbg_inject_enabled", false);

  /* ──────────────────────────────────────────────────────────
     TABS
  ────────────────────────────────────────────────────────── */
  panel.querySelectorAll(".sp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      panel.querySelectorAll(".sp-tab").forEach(t => t.classList.remove("sp-active"));
      tab.classList.add("sp-active");
      panel.querySelectorAll(".sp-body").forEach(b => b.classList.add("sp-hidden"));
      document.getElementById("sp-body-" + activeTab).classList.remove("sp-hidden");
      if (activeTab === "notes") populateGameSelect();
      if (activeTab === "export") updateStatsLine();
    });
  });

  /* ──────────────────────────────────────────────────────────
     FAB / CLOSE
  ────────────────────────────────────────────────────────── */
  fab.addEventListener("click", () => panel.classList.toggle("sp-hidden"));
  document.getElementById("sp-close").addEventListener("click", () => panel.classList.add("sp-hidden"));

  /* ──────────────────────────────────────────────────────────
     CONSOLE TAB
  ────────────────────────────────────────────────────────── */
  function renderConsoleLogs() {
    const list = panelConsoleList;
    const logs = consoleFilter
      ? consoleLogs.filter(l => l.lvl === consoleFilter)
      : consoleLogs;
    list.innerHTML = "";
    const frag = document.createDocumentFragment();
    const slice = logs.slice(-120); // show last 120
    slice.forEach(entry => {
      const el = document.createElement("div");
      el.className = "sp-log-entry sp-log-" + entry.lvl;
      const ts = new Date(entry.t).toLocaleTimeString();
      el.innerHTML = `<span class="sp-log-ts">${ts}</span>${escHtml(entry.msg)}`;
      frag.appendChild(el);
    });
    list.appendChild(frag);
    list.scrollTop = list.scrollHeight;
  }
  renderConsoleLogs();

  document.getElementById("sp-console-clear").addEventListener("click", () => {
    consoleLogs.length = 0; saveJSON(KEY_CONSOLE, []); renderConsoleLogs();
  });
  panel.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      consoleFilter = btn.dataset.filter;
      renderConsoleLogs();
    });
  });

  /* ──────────────────────────────────────────────────────────
     NOTES TAB
  ────────────────────────────────────────────────────────── */
  let noteSaveTimer = null;
  let currentNoteKey = null;

  function populateGameSelect() {
    const sel = document.getElementById("sp-game-select");
    const current = sel.value;
    sel.innerHTML = `<option value="">— Pick a game or type a name —</option>`;

    // Add saved notes keys
    Object.keys(notesStore).forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = notesStore[k].title || k;
      sel.appendChild(opt);
    });

    // Try to pull game titles from the launcher
    try {
      const items = JSON.parse(localStorage.getItem("dbg_items_v6") || "[]");
      items.forEach(item => {
        if (!notesStore[item.id]) {
          const opt = document.createElement("option");
          opt.value = item.id;
          opt.textContent = item.title || item.src;
          sel.appendChild(opt);
        }
      });
    } catch(e) {}

    if (current) sel.value = current;
    loadNoteForKey(sel.value);
  }

  function loadNoteForKey(key) {
    currentNoteKey = key || null;
    const area = document.getElementById("sp-notes-area");
    if (!key) { area.value = ""; area.disabled = true; return; }
    area.disabled = false;
    area.value = notesStore[key]?.notes || "";
  }

  document.getElementById("sp-game-select").addEventListener("change", e => {
    loadNoteForKey(e.target.value);
  });

  document.getElementById("sp-notes-area").addEventListener("input", () => {
    if (!currentNoteKey) return;
    const text = document.getElementById("sp-notes-area").value;
    if (!notesStore[currentNoteKey]) {
      // Try to find the title
      let title = currentNoteKey;
      try {
        const items = JSON.parse(localStorage.getItem("dbg_items_v6") || "[]");
        const found = items.find(x => x.id === currentNoteKey);
        if (found) title = found.title || title;
      } catch(e) {}
      notesStore[currentNoteKey] = { title, notes: "", ts: Date.now() };
    }
    notesStore[currentNoteKey].notes = text;
    notesStore[currentNoteKey].ts = Date.now();
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => {
      saveNotes();
      const ind = document.getElementById("sp-save-indicator");
      ind.classList.remove("sp-fade");
      setTimeout(() => ind.classList.add("sp-fade"), 1200);
    }, 600);
  });

  /* ──────────────────────────────────────────────────────────
     BLANKER INJECT TOGGLE
  ────────────────────────────────────────────────────────── */
  const injectToggle = document.getElementById("sp-inject-toggle");
  const injectLabel  = document.getElementById("sp-inject-label");

  function syncInjectUI() {
    injectToggle.classList.toggle("on", injectEnabled);
    injectLabel.textContent = injectEnabled ? "Enabled — next Blanker opens will have the panel" : "Disabled";
    saveJSON("dbg_inject_enabled", injectEnabled);
  }
  syncInjectUI();

  injectToggle.addEventListener("click", () => {
    injectEnabled = !injectEnabled;
    syncInjectUI();
    patchMakeBlankerHTML();
  });

  /* ──────────────────────────────────────────────────────────
     PATCH makeBlankerHTML
     We intercept the global function used by the launcher to
     inject our mini console panel into blanker pages.
  ────────────────────────────────────────────────────────── */
  function patchMakeBlankerHTML() {
    if (!injectEnabled) {
      // Restore original if it was saved
      if (window.__origMakeBlankerHTML) {
        window.makeBlankerHTML = window.__origMakeBlankerHTML;
      }
      return;
    }
    if (!window.__origMakeBlankerHTML && typeof window.makeBlankerHTML === "function") {
      window.__origMakeBlankerHTML = window.makeBlankerHTML;
    }
    if (!window.__origMakeBlankerHTML) return; // launcher not loaded yet

    window.makeBlankerHTML = function(title, src, autoFS) {
      const base = window.__origMakeBlankerHTML(title, src, autoFS);
      const inject = `
<style>
  #sp-mini{position:fixed;bottom:10px;left:10px;z-index:99999;width:320px;max-height:260px;
    display:flex;flex-direction:column;
    background:rgba(4,10,28,.95);border:1px solid rgba(103,209,255,.3);border-radius:14px;
    font-family:'Courier New',monospace;font-size:.72rem;color:#c5d5ff;box-shadow:0 12px 36px rgba(0,0,0,.7);
    backdrop-filter:blur(12px);overflow:hidden;transition:opacity .2s;}
  #sp-mini.sp-collapsed{max-height:36px;}
  #sp-mini-header{display:flex;align-items:center;justify-content:space-between;
    padding:6px 10px;background:rgba(103,209,255,.08);border-bottom:1px solid rgba(255,255,255,.08);
    cursor:pointer;flex-shrink:0;}
  #sp-mini-title{font-weight:700;color:#67d1ff;font-family:system-ui,sans-serif;}
  #sp-mini-btns{display:flex;gap:4px;}
  .sp-mini-btn{padding:2px 7px;border-radius:6px;border:1px solid rgba(255,255,255,.15);
    background:rgba(255,255,255,.07);color:#e7f0ff;cursor:pointer;font-size:.7rem;}
  .sp-mini-btn:hover{background:rgba(255,255,255,.15);}
  #sp-mini-logs{overflow-y:auto;flex:1;padding:6px 8px;}
  #sp-mini-logs::-webkit-scrollbar{width:4px;}
  #sp-mini-logs::-webkit-scrollbar-thumb{background:rgba(103,209,255,.3);border-radius:4px;}
  .sp-ml{padding:2px 0;border-left:2px solid rgba(255,255,255,.15);padding-left:5px;margin-bottom:2px;word-break:break-all;}
  .sp-ml.e{border-color:#ff6e7a;color:#ffaaaf;} .sp-ml.w{border-color:#ffd76e;color:#ffe9a0;}
  .sp-ml.i{border-color:#67d1ff;color:#a8e8ff;}
  #sp-mini-notes{padding:6px;border-top:1px solid rgba(255,255,255,.08);}
  #sp-mini-notes textarea{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
    border-radius:8px;color:#e7f0ff;font-family:'Courier New',monospace;font-size:.72rem;
    padding:5px;resize:none;outline:none;height:50px;}
  #sp-mini-notes textarea:focus{border-color:rgba(103,209,255,.5);}
</style>
<div id="sp-mini">
  <div id="sp-mini-header">
    <span id="sp-mini-title">💾 Console</span>
    <div id="sp-mini-btns">
      <button class="sp-mini-btn" id="sp-mini-notes-btn">📝</button>
      <button class="sp-mini-btn" id="sp-mini-clear">🗑</button>
      <button class="sp-mini-btn" id="sp-mini-toggle">—</button>
    </div>
  </div>
  <div id="sp-mini-logs"></div>
  <div id="sp-mini-notes" style="display:none">
    <textarea placeholder="Notes / progress…" id="sp-mini-notes-area"></textarea>
    <button class="sp-mini-btn" id="sp-mini-save-note" style="margin-top:3px;">Save note</button>
  </div>
</div>
<script>
(function(){
  const el=document.getElementById('sp-mini');
  const logs=document.getElementById('sp-mini-logs');
  const gameTitle=${JSON.stringify(title)};
  const gameKey='sp_blanker_'+encodeURIComponent(gameTitle);
  let collapsed=false;
  function addLog(lvl,msg){
    const d=document.createElement('div');
    d.className='sp-ml '+(lvl==='error'?'e':lvl==='warn'?'w':lvl==='info'?'i':'');
    d.textContent=new Date().toLocaleTimeString()+' '+msg.slice(0,200);
    logs.appendChild(d);
    if(logs.children.length>80) logs.removeChild(logs.firstChild);
    logs.scrollTop=logs.scrollHeight;
    // Persist to parent localStorage via postMessage
    try{window.opener?.postMessage({type:'sp_log',lvl,msg,gameTitle},'*');}catch(e){}
  }
  ['log','warn','error','info','debug'].forEach(m=>{
    const orig=console[m].bind(console);
    console[m]=function(...a){orig(...a);addLog(m,a.map(x=>{try{return typeof x==='object'?JSON.stringify(x):String(x);}catch(e){return String(x);}}).join(' '));};
  });
  window.addEventListener('error',e=>{addLog('error','Uncaught: '+e.message+' ('+e.filename+':'+e.lineno+')');});
  window.addEventListener('unhandledrejection',e=>{addLog('error','Unhandled promise: '+e.reason);});

  document.getElementById('sp-mini-header').addEventListener('click',e=>{
    if(e.target.closest('#sp-mini-btns')) return;
    collapsed=!collapsed; el.classList.toggle('sp-collapsed',collapsed);
    document.getElementById('sp-mini-toggle').textContent=collapsed?'+':'—';
  });
  document.getElementById('sp-mini-toggle').addEventListener('click',e=>{e.stopPropagation();collapsed=!collapsed;el.classList.toggle('sp-collapsed',collapsed);e.target.textContent=collapsed?'+':'—';});
  document.getElementById('sp-mini-clear').addEventListener('click',()=>{logs.innerHTML='';});
  document.getElementById('sp-mini-notes-btn').addEventListener('click',()=>{
    const n=document.getElementById('sp-mini-notes');
    n.style.display=n.style.display==='none'?'block':'none';
    if(n.style.display==='block'){
      const saved=localStorage.getItem(gameKey)||'';
      document.getElementById('sp-mini-notes-area').value=saved;
    }
  });
  document.getElementById('sp-mini-save-note').addEventListener('click',()=>{
    const txt=document.getElementById('sp-mini-notes-area').value;
    localStorage.setItem(gameKey,txt);
    try{window.opener?.postMessage({type:'sp_note',key:gameKey,txt,gameTitle},'*');}catch(e){}
    document.getElementById('sp-mini-save-note').textContent='✓ Saved!';
    setTimeout(()=>{document.getElementById('sp-mini-save-note').textContent='Save note';},1500);
  });
  const saved=localStorage.getItem(gameKey);
  if(saved) document.getElementById('sp-mini-notes-area').value=saved;
})();
<\/script>`;
      // Inject before </body>
      return base.replace("</body>", inject + "</body>");
    };
  }

  // Listen for messages from blanker windows
  window.addEventListener("message", e => {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "sp_log") {
      const entry = { t: Date.now(), lvl: e.data.lvl, msg: `[${e.data.gameTitle}] ${e.data.msg}` };
      consoleLogs.push(entry);
      if (consoleLogs.length > MAX_LOGS) consoleLogs.splice(0, consoleLogs.length - MAX_LOGS);
      saveJSON(KEY_CONSOLE, consoleLogs);
      if (activeTab === "console") renderConsoleLogs();
    }
    if (e.data.type === "sp_note") {
      if (!notesStore[e.data.key]) notesStore[e.data.key] = { title: e.data.gameTitle, notes: "", ts: Date.now() };
      notesStore[e.data.key].notes = e.data.txt;
      notesStore[e.data.key].ts = Date.now();
      saveNotes();
    }
  });

  // Try to patch immediately (in case launcher already loaded)
  patchMakeBlankerHTML();
  // Also try after DOM is ready (in case it loads later)
  document.addEventListener("DOMContentLoaded", patchMakeBlankerHTML);

  /* ──────────────────────────────────────────────────────────
     EXPORT TAB
  ────────────────────────────────────────────────────────── */
  function updateStatsLine() {
    const noteCount = Object.keys(notesStore).length;
    const logCount  = consoleLogs.length;
    document.getElementById("sp-stats-line").textContent =
      `${noteCount} note(s) saved  •  ${logCount} console log(s) stored`;
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  document.getElementById("sp-dl-all").addEventListener("click", () => {
    downloadJSON("dbg-save-" + Date.now() + ".json", {
      exported: new Date().toISOString(),
      version: 1,
      notes: notesStore,
      consoleLogs
    });
  });
  document.getElementById("sp-dl-notes").addEventListener("click", () => {
    downloadJSON("dbg-notes-" + Date.now() + ".json", notesStore);
  });
  document.getElementById("sp-dl-console").addEventListener("click", () => {
    downloadJSON("dbg-console-" + Date.now() + ".json", consoleLogs);
  });
  document.getElementById("sp-import-btn").addEventListener("click", () => {
    document.getElementById("sp-import-file").click();
  });
  document.getElementById("sp-import-file").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.notes) Object.assign(notesStore, data.notes);
        if (data.consoleLogs) { consoleLogs.length=0; consoleLogs.push(...data.consoleLogs); }
        saveNotes(); saveJSON(KEY_CONSOLE, consoleLogs);
        renderConsoleLogs(); updateStatsLine();
        alert("✓ Import successful!");
      } catch(err) { alert("⚠ Invalid save file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  document.getElementById("sp-clear-all").addEventListener("click", () => {
    if (!confirm("Clear ALL saved notes and console logs? This cannot be undone.")) return;
    consoleLogs.length = 0;
    Object.keys(notesStore).forEach(k => delete notesStore[k]);
    saveJSON(KEY_CONSOLE, []); saveNotes(); renderConsoleLogs(); updateStatsLine();
    alert("Cleared.");
  });

  /* ──────────────────────────────────────────────────────────
     UTIL
  ────────────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  console.log("[SaveProgress] Module loaded ✓ — console interception active");
})();
