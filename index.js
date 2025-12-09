// BF6 Extended Variable Manager - final corrected (live workspace-only)
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  // defensive plugin handle
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins && typeof BF2042Portal.Plugins.getPlugin === "function") {
      plugin = BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID };
    } else {
      plugin = { id: PLUGIN_ID };
    }
  } catch (e) { plugin = { id: PLUGIN_ID }; }

  // categories (kept from your model)
  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  // ---------- workspace helpers (defensive) ----------
  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly && typeof _Blockly.getMainWorkspace === "function") return _Blockly.getMainWorkspace();
      if (typeof Blockly !== "undefined" && Blockly && typeof Blockly.getMainWorkspace === "function") return Blockly.getMainWorkspace();
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) {
        try { return BF2042Portal.getMainWorkspace(); } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function workspaceGetVariableMap(ws) {
    try {
      if (!ws) return null;
      if (typeof ws.getVariableMap === "function") return ws.getVariableMap();
      if (ws.variableMap) return ws.variableMap;
    } catch (e) {}
    return null;
  }

  // return array of workspace variable objects (best-effort)
  function workspaceGetVariables(ws) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return [];
      if (typeof map.getVariables === "function") return map.getVariables();
      if (typeof map.getAllVariables === "function") return map.getAllVariables();
      // fallback: map may be an object with internal arrays
      if (Array.isArray(map.variables)) return map.variables;
    } catch (e) {}
    return [];
  }

  function getVarId(v) {
    try { if (!v) return null; if (typeof v.getId === "function") return v.getId(); if (v.id) return v.id; return v.getId && v.getId(); } catch (e) { return null; }
  }
  function getVarName(v) {
    try { if (!v) return null; return v.name !== undefined ? v.name : (v.getName ? v.getName() : null); } catch (e) { return null; }
  }
  function getVarType(v) {
    try { if (!v) return "Global"; return v.type !== undefined ? v.type : (v.getType ? v.getType() : "Global"); } catch (e) { return "Global"; }
  }

  // create variable in workspace; attempt to preserve id when possible
  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map && typeof map.createVariable === "function") {
        try { return map.createVariable(name, type || "", id); } catch (e) { try { return map.createVariable(name, type || "", undefined); } catch(e2){} }
      }
      if (ws && typeof ws.createVariable === "function") {
        try { return ws.createVariable(name, type || "", id); } catch (e) { try { return ws.createVariable(name, type || "", undefined); } catch(e2){} }
      }
      if (typeof Blockly !== "undefined" && Blockly.Variables && typeof Blockly.Variables.createVariable === "function") {
        try { return Blockly.Variables.createVariable(ws, name, type || "", id); } catch (e) {}
      }
    } catch (e) { console.warn("[ExtVars] createWorkspaceVariable error:", e); }
    return null;
  }

  // delete var by id or name
  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.deleteVariableById === "function") {
        try { map.deleteVariableById(idOrName); return true; } catch (e) {}
      }
      if (typeof map.deleteVariable === "function") {
        try { map.deleteVariable(idOrName); return true; } catch (e) {}
      }
      if (typeof map.removeVariable === "function") {
        try { map.removeVariable(idOrName); return true; } catch (e) {}
      }
      if (map.getVariables && typeof map.getVariables === "function") {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => getVarId(v) === idOrName || getVarName(v) === idOrName);
        if (idx >= 0 && Array.isArray(vs)) {
          try { vs.splice(idx, 1); return true; } catch (e) {}
        }
      }
    } catch (e) { console.warn("[ExtVars] deleteWorkspaceVariable error:", e); }
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      // try getVariableById
      let found = null;
      const id = getVarId(varObj);
      if (id && typeof map.getVariableById === "function") {
        try { found = map.getVariableById(id); } catch (e) { found = null; }
      }
      if (!found && typeof map.getVariable === "function") {
        try { found = map.getVariable(id) || map.getVariable(getVarName(varObj)); } catch (e) { found = null; }
      }
      if (found) {
        try { found.name = newName; return true; } catch (e) {}
      }
      // last resort: mutate varObj directly
      try { if (varObj && varObj.name !== undefined) { varObj.name = newName; return true; } } catch (e) {}
    } catch (e) { console.warn("[ExtVars] renameWorkspaceVariable error:", e); }
    return false;
  }

  // ---------- ID generation that scans workspace for EV_### collisions ----------
  function makeNextSequentialIdFromWorkspace() {
    try {
      const ws = getMainWorkspaceSafe();
      const vars = workspaceGetVariables(ws);
      let max = 0;
      for (const v of vars) {
        const id = getVarId(v) || (v && v.id) || null;
        if (typeof id === "string" && id.startsWith("EV_")) {
          const n = parseInt(id.slice(3), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
      const next = max + 1;
      return "EV_" + String(next).padStart(4, "0");
    } catch (e) { return "EV_0001"; }
  }

  // ---------- build a LIVE registry of workspace vars grouped by category ----------
  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for (const c of CATEGORIES) live[c] = [];
    try {
      const vars = workspaceGetVariables(ws);
      for (const v of vars) {
        try {
          const id = getVarId(v) || (v && v.id) || (v && v.getId && v.getId());
          const name = getVarName(v) || (v && v.name);
          const type = getVarType(v) || "Global";
          const cat = (type && typeof type === "string") ? type : "Global";
          if (!live[cat]) live[cat] = [];
          live[cat].push({ id: id || null, name: name || String(id || ""), type: type || cat, _raw: v });
        } catch (e) {}
      }
    } catch (e) {}
    // ensure categories exist even if empty
    for (const c of CATEGORIES) if (!live[c]) live[c] = [];
    return live;
  }

  // ---------- UI CSS ----------
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .ev-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999999}
      .ev-modal{width:min(1100px,94vw);height:min(760px,90vh);background:#0f0f10;border-radius:10px;padding:14px;display:flex;flex-direction:column;color:#e9eef2;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,0.75)}
      .ev-content{display:flex;gap:12px;flex:1;overflow:hidden}
      .ev-cats{width:240px;background:#121214;border-radius:8px;padding:10px;overflow-y:auto}
      .ev-cat{padding:8px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:transparent;color:#e9eef2;margin-bottom:6px}
      .ev-cat:hover{background:#1a1a1c}
      .ev-cat.selected{background:rgba(255,10,3,0.08);border-left:4px solid #ff0a03}
      .ev-list{flex:1;background:#0b0b0c;border-radius:8px;padding:10px;overflow:auto;display:flex;flex-direction:column}
      .ev-row{display:flex;justify-content:space-between;align-items:center;padding:8px;background:#0e0e0f;border-radius:6px;margin-bottom:8px}
      .ev-btn{padding:6px 10px;border-radius:6px;border:none;color:#fff;cursor:pointer}
      .ev-add{background:#2ca72c}
      .ev-edit{background:#2b2b2b}
      .ev-del{background:#a73232}
      .ev-muted{color:#9aa1a8;font-size:12px}
      .ev-details{width:320px;background:#121214;border-radius:8px;padding:10px;overflow:auto}
      .ev-input{width:100%;padding:8px;border-radius:6px;border:1px solid #222;background:#0b0b0c;color:#e9eef2;margin-bottom:8px}
      .ev-actions{display:flex;justify-content:flex-end;margin-top:10px;gap:8px}
      .ev-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .ev-title{font-weight:700;font-size:16px}
    `;
    document.head.appendChild(style);
  })();

  // ---------- modal UI (uses live registry only) ----------
  let modalOverlay = null;
  function removeModal() { if (modalOverlay) { try { modalOverlay.remove(); } catch(e) {} modalOverlay = null; } }

  function openModal() {
    // build fresh live registry from workspace each time
    const live = getLiveRegistry();

    // prepare DOM
    removeModal();
    modalOverlay = document.createElement("div");
    modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div");
    modal.className = "ev-modal";
    modalOverlay.appendChild(modal);

    // header
    const top = document.createElement("div"); top.className = "ev-top";
    const title = document.createElement("div"); title.className = "ev-title"; title.innerText = "Extended Variable Manager";
    top.appendChild(title);

    const topActions = document.createElement("div");
    const closeBtn = document.createElement("button"); closeBtn.className = "ev-btn ev-del"; closeBtn.innerText = "Close";
    closeBtn.onclick = () => { removeModal(); };
    topActions.appendChild(closeBtn);
    top.appendChild(topActions);
    modal.appendChild(top);

    const content = document.createElement("div"); content.className = "ev-content";
    modal.appendChild(content);

    // left / center / right
    const left = document.createElement("div"); left.className = "ev-cats";
    const center = document.createElement("div"); center.className = "ev-list";
    const right = document.createElement("div"); right.className = "ev-details"; right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";

    content.appendChild(left); content.appendChild(center); content.appendChild(right);

    let currentCategory = CATEGORIES[0];

    function getCount(cat) { return (live[cat] || []).length; }

    function rebuildCategories() {
      left.innerHTML = "";
      for (const cat of CATEGORIES) {
        const el = document.createElement("div");
        el.className = "ev-cat";
        if (cat === currentCategory) el.classList.add("selected");
        el.innerHTML = `<span style="font-weight:600">${cat}</span><span class="ev-muted">${getCount(cat)}</span>`;
        el.onclick = () => { currentCategory = cat; rebuildCategories(); rebuildList(); right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>"; };
        left.appendChild(el);
      }
    }

    function rebuildList() {
      // re-read live registry fresh each render to pick up external changes
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);

      center.innerHTML = "";
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.marginBottom = "8px";
      const h = document.createElement("div");
      h.innerHTML = `<strong>${currentCategory} Variables</strong><div class="ev-muted">Total: ${getCount(currentCategory)}</div>`;
      header.appendChild(h);

      const addBtn = document.createElement("button");
      addBtn.className = "ev-btn ev-add";
      addBtn.innerText = "Add";
      addBtn.onclick = () => openAdd();
      header.appendChild(addBtn);
      center.appendChild(header);

      const arr = live[currentCategory] || [];
      if (arr.length === 0) {
        const empty = document.createElement("div"); empty.className = "ev-muted"; empty.innerText = "(no variables)"; center.appendChild(empty); return;
      }

      for (const v of arr) {
        const row = document.createElement("div"); row.className = "ev-row";
        const leftCol = document.createElement("div"); leftCol.style.display = "flex"; leftCol.style.flexDirection = "column";
        const usedCount = (function(){ try{ const ws = getMainWorkspaceSafe(); return ws ? countVariableUsage(ws, v) : 0; }catch(e){return 0;} })();
        leftCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">ID: ${v.id || "—"} &nbsp; • &nbsp; In use: (${usedCount})</div>`;

        const rightCol = document.createElement("div");
        const editBtn = document.createElement("button"); editBtn.className = "ev-btn ev-edit"; editBtn.style.marginRight = "6px"; editBtn.innerText = "Edit";
        editBtn.onclick = () => openEdit(v);
        const delBtn = document.createElement("button"); delBtn.className = "ev-btn ev-del"; delBtn.innerText = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          try {
            const ws = getMainWorkspaceSafe();
            if (ws) {
              // attempt delete by id first, then name
              deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name);
            }
          } catch (e) { console.warn(e); }
          // refresh UI
          rebuildCategories();
          rebuildList();
          right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
        };

        rightCol.appendChild(editBtn); rightCol.appendChild(delBtn);
        row.appendChild(leftCol); row.appendChild(rightCol);
        center.appendChild(row);
      }
    }

    // Add: create variable directly in workspace (do not persist)
    function openAdd() {
      const name = prompt(`Create new ${currentCategory} variable — name:`);
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      // generate id from workspace scan to avoid collisions
      const id = makeNextSequentialIdFromWorkspace();
      try {
        const ws = getMainWorkspaceSafe();
        if (!ws) { alert("No workspace available."); return; }
        // create in workspace (attempt keep id)
        createWorkspaceVariable(ws, trimmed, currentCategory, id);
      } catch (e) { console.warn("[ExtVars] add error:", e); }
      // refresh UI
      rebuildCategories();
      rebuildList();
    }

    // Edit: rename in workspace
    function openEdit(varDef) {
      right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Edit Variable</div>";
      const nameLabel = document.createElement("div"); nameLabel.className = "ev-muted"; nameLabel.innerText = "Name";
      const nameInput = document.createElement("input"); nameInput.className = "ev-input"; nameInput.value = varDef.name || "";
      right.appendChild(nameLabel); right.appendChild(nameInput);

      const idLabel = document.createElement("div"); idLabel.className = "ev-muted"; idLabel.innerText = "ID (locked)";
      const idBox = document.createElement("div"); idBox.className = "ev-muted"; idBox.style.marginBottom = "8px"; idBox.innerText = varDef.id || "—";
      right.appendChild(idLabel); right.appendChild(idBox);

      const actions = document.createElement("div"); actions.className = "ev-actions";
      const save = document.createElement("button"); save.className = "ev-btn ev-add"; save.innerText = "Save";
      save.onclick = () => {
        const newName = nameInput.value.trim();
        if (!newName) { alert("Name cannot be empty"); return; }
        try {
          const ws = getMainWorkspaceSafe();
          if (!ws) { alert("No workspace available."); return; }
          // rename in workspace
          const success = renameWorkspaceVariable(ws, varDef._raw || varDef, newName);
          if (!success) {
            // as fallback, try to find by id and mutate fields
            const map = workspaceGetVariableMap(ws);
            if (map && typeof map.getVariableById === "function") {
              try { const ex = map.getVariableById(varDef.id); if (ex) ex.name = newName; }
              catch(e){}
            }
          }
        } catch (e) { console.warn("[ExtVars] rename failed:", e); }
        // refresh UI
        rebuildCategories();
        rebuildList();
        right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
      };

      const cancel = document.createElement("button"); cancel.className = "ev-btn ev-edit"; cancel.innerText = "Cancel";
      cancel.onclick = () => { right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>"; };

      actions.appendChild(cancel); actions.appendChild(save);
      right.appendChild(actions);
    }

    rebuildCategories();
    rebuildList();

    // close on overlay click
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) removeModal();
    });

    document.body.appendChild(modalOverlay);
  } // openModal end

  // ---------- context menu registration (use ContextMenuRegistry when available) ----------
  function registerContextMenuItem() {
    try {
      const reg = (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.registry
                : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.registry
                : null;
      if (reg && typeof reg.register === "function") {
        const item = {
          id: "manageExtendedVariables",
          displayText: "Manage Variables",
          preconditionFn: () => "enabled",
          callback: () => openModal(),
          scopeType: (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : null,
          weight: 98
        };
        try { if (reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); } catch(e){}
        reg.register(item);
        console.log("[ExtVars] Registered context menu item via ContextMenuRegistry");
        return;
      }
    } catch (e) {
      console.warn("[ExtVars] ContextMenuRegistry registration failed:", e);
    }

    // fallback DOM injection (best-effort)
    (function domFallback() {
      document.addEventListener("contextmenu", () => {
        setTimeout(() => {
          const menu = document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
          if (!menu) return;
          if (menu.querySelector("[data-extvars]")) return;
          const el = document.createElement("div");
          el.setAttribute("data-extvars", "1");
          el.style.padding = "6px 10px";
          el.style.cursor = "pointer";
          el.style.color = "#e9eef2";
          el.textContent = "Manage Variables";
          el.addEventListener("click", () => {
            openModal();
            try { menu.style.display = "none"; } catch(e){}
          });
          menu.appendChild(el);
        }, 40);
      });
    })();
  }

  // ---------- initialization ----------
  function initialize() {
    // just register context menu - we do NOT persist any variables across projects
    registerContextMenuItem();
    if (plugin) plugin.openManager = openModal;
    console.info("[ExtVars] Live Extended Variable Manager initialized (workspace-only).");
  }

  setTimeout(initialize, 900);
})();
