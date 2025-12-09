// BF6 Extended Variable Manager - Final (full, project-scoped, workspace-sync)
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins && typeof BF2042Portal.Plugins.getPlugin === "function") {
      plugin = BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID };
    } else {
      plugin = { id: PLUGIN_ID };
    }
  } catch (e) {
    plugin = { id: PLUGIN_ID };
  }

  // ----- categories
  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  // ----- state
  let state = { nextIdCounter: 1, variables: {} };
  function ensureStateCategories() {
    for (const c of CATEGORIES) if (!Array.isArray(state.variables[c])) state.variables[c] = [];
  }

  // ----- storage key (project-scoped)
  function getExperienceId() {
    try {
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.currentExperienceId) return String(BF2042Portal.currentExperienceId);
    } catch (e) {}
    // fallback to pathname (last segment) or "default"
    try {
      const p = location.pathname || "";
      const seg = p.split("/").filter(Boolean).slice(-1)[0];
      if (seg) return seg;
    } catch (e) {}
    return "default";
  }
  function getStorageKey() {
    const exp = getExperienceId();
    return PLUGIN_ID + "-state-" + exp;
  }

  // ----- persistence
  function saveState() {
    try {
      const key = getStorageKey();
      const payload = JSON.stringify(state);
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.saveToLocalStorage === "function") {
        BF2042Portal.Shared.saveToLocalStorage(key, state);
      } else {
        localStorage.setItem(key, payload);
      }
    } catch (e) { console.warn("[ExtVars] saveState failed:", e); }
  }
  function loadState() {
    try {
      const key = getStorageKey();
      let loaded = null;
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.loadFromLocalStorage === "function") {
        loaded = BF2042Portal.Shared.loadFromLocalStorage(key);
      } else {
        const raw = localStorage.getItem(key);
        if (raw) loaded = JSON.parse(raw);
      }
      if (loaded && typeof loaded === "object") {
        // merge so we don't lose fields
        state = Object.assign({}, state, loaded);
        if (!state.variables) state.variables = {};
      }
    } catch (e) { console.warn("[ExtVars] loadState failed:", e); }
    ensureStateCategories();

    // set nextIdCounter above any EV_ in state
    try {
      let max = state.nextIdCounter || 1;
      for (const cat of CATEGORIES) {
        for (const v of state.variables[cat] || []) {
          if (v && typeof v.id === "string" && v.id.startsWith("EV_")) {
            const n = parseInt(v.id.slice(3), 10);
            if (!isNaN(n) && n >= max) max = n + 1;
          }
        }
      }
      state.nextIdCounter = max;
    } catch (e) {}
  }

  // ----- workspace access helpers
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
  function workspaceHasVariableWithId(ws, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.getVariableById === "function") return !!map.getVariableById(id);
      if (typeof map.getVariable === "function") return !!map.getVariable(id);
      if (map.getVariables) return map.getVariables().some(v => v.id === id);
    } catch (e) {}
    return false;
  }
  function workspaceHasVariableWithName(ws, name) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.getVariableByName === "function") return !!map.getVariableByName(name);
      if (typeof map.getVariable === "function") return !!map.getVariable(name);
      if (map.getVariables) return map.getVariables().some(v => v.name === name);
    } catch (e) {}
    return false;
  }
  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map && typeof map.createVariable === "function") {
        try { return map.createVariable(name, type || "", id); } catch (e) { try { return map.createVariable(name, type || "", undefined); } catch(e2){} }
      }
      if (ws && typeof ws.createVariable === "function") {
        try { return ws.createVariable(name, type || "", id); } catch(e){ try { return ws.createVariable(name, type || "", undefined); } catch(e2){} }
      }
      if (typeof Blockly !== "undefined" && Blockly.Variables && typeof Blockly.Variables.createVariable === "function") {
        try { return Blockly.Variables.createVariable(ws, name, type || "", id); } catch (e) {}
      }
    } catch (e) { console.warn("[ExtVars] createWorkspaceVariable error:", e); }
    return null;
  }
  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.deleteVariable === "function") { try { map.deleteVariable(idOrName); return true; } catch (e) {} }
      if (typeof map.removeVariable === "function") { try { map.removeVariable(idOrName); return true; } catch (e) {} }
      if (map.getVariables) {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => v.id === idOrName || v.name === idOrName);
        if (idx >= 0 && Array.isArray(vs)) { try { vs.splice(idx, 1); return true; } catch(e) {} }
      }
    } catch (e) { console.warn("[ExtVars] deleteWorkspaceVariable error:", e); }
    return false;
  }

  // ----- serialized traversal / usage counting
  function traverseSerializedBlocks(node, cb) {
    if (!node) return;
    cb(node);
    if (node.inputs && typeof node.inputs === "object") {
      for (const input of Object.values(node.inputs)) {
        if (input && input.block) traverseSerializedBlocks(input.block, cb);
        if (input && input.shadow) traverseSerializedBlocks(input.shadow, cb);
      }
    }
    if (node.next && node.next.block) traverseSerializedBlocks(node.next.block, cb);
  }
  function countVariableUsage(ws, varDef) {
    let count = 0;
    try {
      if (!ws) return 0;
      const allBlocks = ws.getAllBlocks ? ws.getAllBlocks(false) : [];
      for (const blk of allBlocks) {
        try {
          let serial = null;
          if (typeof _Blockly !== "undefined" && _Blockly.serialization && _Blockly.serialization.blocks && typeof _Blockly.serialization.blocks.save === "function") {
            serial = _Blockly.serialization.blocks.save(blk);
          } else if (typeof Blockly !== "undefined" && Blockly.serialization && Blockly.serialization.blocks && typeof Blockly.serialization.blocks.save === "function") {
            serial = Blockly.serialization.blocks.save(blk);
          } else {
            continue;
          }
          traverseSerializedBlocks(serial, (node) => {
            if (!node || !node.fields) return;
            const vf = node.fields.VAR;
            if (!vf) return;
            if (typeof vf === "object") {
              if (vf.id && varDef.id && vf.id === varDef.id) count++;
              else if (vf.name && vf.name === varDef.name && (vf.type || "") === (varDef.type || "")) count++;
            } else if (typeof vf === "string") {
              if (vf === varDef.name) count++;
            }
          });
        } catch (e) {}
      }
    } catch (e) { console.warn("[ExtVars] usage count error:", e); }
    return count;
  }

  // ----- register/resync helpers
  function registerAllVariablesInWorkspace(ws) {
    try {
      for (const cat of CATEGORIES) {
        for (const v of state.variables[cat] || []) {
          if (!workspaceHasVariableWithId(ws, v.id) && !workspaceHasVariableWithName(ws, v.name)) {
            try { createWorkspaceVariable(ws, v.name, v.type || cat, v.id); } catch (e) {}
          }
        }
      }
      try { document.dispatchEvent(new Event("variables_refreshed")); } catch (e) {}
    } catch (e) { console.warn("[ExtVars] registerAllVariablesInWorkspace error:", e); }
  }
  function resyncWorkspaceVariableMap(ws) {
    try {
      if (!ws) return;
      const map = workspaceGetVariableMap(ws);
      if (!map) return;
      try {
        if (typeof map.getVariables === "function") {
          const existing = map.getVariables();
          for (const ex of Array.from(existing || [])) {
            try {
              if (typeof map.deleteVariableById === "function" && ex.getId) {
                try { map.deleteVariableById(ex.getId()); } catch (e) {}
              } else if (typeof map.deleteVariable === "function") {
                try { map.deleteVariable(ex); } catch (e) {}
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
      for (const cat of CATEGORIES) {
        for (const v of state.variables[cat] || []) {
          try { createWorkspaceVariable(ws, v.name, v.type || cat, v.id); } catch (e) {}
        }
      }
      try { if (ws.refreshToolboxSelection) ws.refreshToolboxSelection(); } catch (e) {}
      try { if (ws.toolbox_) ws.toolbox_.refreshSelection && ws.toolbox_.refreshSelection(); } catch (e) {}
      try { document.dispatchEvent(new Event("variables_refreshed")); } catch (e) {}
    } catch (e) { console.warn("[ExtVars] resyncWorkspaceVariableMap error:", e); }
  }

  // ----- ID allocation
  function makeNextSequentialId() {
    if (!state.nextIdCounter || typeof state.nextIdCounter !== "number") state.nextIdCounter = 1;
    const id = "EV_" + String(state.nextIdCounter).padStart(4, "0");
    state.nextIdCounter += 1;
    return id;
  }

  // ----- import workspace variables into plugin state (ensures any external creation is visible)
  function syncWorkspaceIntoState() {
    const ws = getMainWorkspaceSafe();
    if (!ws) return;
    const map = workspaceGetVariableMap(ws);
    if (!map || typeof map.getVariables !== "function") return;
    try {
      const workspaceVars = map.getVariables();
      let changed = false;
      for (const wv of workspaceVars) {
        const category = (wv.type && typeof wv.type === "string") ? wv.type : "Global";
        if (!state.variables[category]) state.variables[category] = [];
        const exists = state.variables[category].some(v => v.id === wv.id || v.name === wv.name);
        if (!exists) {
          state.variables[category].push({ id: wv.id || makeNextSequentialId(), name: wv.name, type: wv.type || category });
          changed = true;
        }
      }
      if (changed) saveState();
    } catch (e) {
      console.warn("[ExtVars] syncWorkspaceIntoState failed:", e);
    }
  }

  // ----- UI CSS injection
  (function injectStyle(){
    const s = document.createElement("style");
    s.textContent = `
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
    document.head.appendChild(s);
  })();

  // ----- Main UI modal builder (full featured)
  let modalOverlay = null;
  function removeModal() {
    if (modalOverlay) {
      try { modalOverlay.remove(); } catch (e) {}
      modalOverlay = null;
    }
  }

  function openModal() {
    loadState();
    ensureStateCategories();

    // import any variables from workspace so everything created by other methods shows
    try { syncWorkspaceIntoState(); } catch (e) {}

    // attempt to register all stored variables in workspace so they become available
    try { const wsPre = getMainWorkspaceSafe(); if (wsPre) registerAllVariablesInWorkspace(wsPre); } catch (e) {}

    removeModal();

    modalOverlay = document.createElement("div");
    modalOverlay.className = "ev-overlay";

    const modal = document.createElement("div");
    modal.className = "ev-modal";
    modalOverlay.appendChild(modal);

    // header
    const top = document.createElement("div");
    top.className = "ev-top";
    const title = document.createElement("div");
    title.className = "ev-title";
    title.innerText = "Extended Variable Manager";
    top.appendChild(title);

    const topActions = document.createElement("div");
    // import/export
    const importBtn = document.createElement("button");
    importBtn.className = "ev-btn ev-edit";
    importBtn.style.marginRight = "6px";
    importBtn.innerText = "Import";
    importBtn.onclick = () => {
      try {
        const raw = prompt("Paste variables JSON (array of {id,name,type})");
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) throw new Error("Invalid JSON (not array)");
        for (const it of arr) {
          const cat = it.type || "Global";
          if (!state.variables[cat]) state.variables[cat]=[];
          if (!state.variables[cat].some(v=>v.id===it.id)) state.variables[cat].push({id:it.id,name:it.name,type:cat});
        }
        saveState();
        try { const ws = getMainWorkspaceSafe(); if (ws) resyncWorkspaceVariableMap(ws); } catch(e) {}
        rebuildCategories(); rebuildList();
        alert("Imported.");
      } catch (e) { alert("Import failed: "+e.message); }
    };
    topActions.appendChild(importBtn);

    const exportBtn = document.createElement("button");
    exportBtn.className = "ev-btn ev-edit";
    exportBtn.innerText = "Export";
    exportBtn.onclick = () => {
      try {
        // flatten variables to an array
        const out = [];
        for (const c of CATEGORIES) for (const v of state.variables[c] || []) out.push({id:v.id,name:v.name,type:v.type});
        const txt = JSON.stringify(out, null, 2);
        prompt("Copy the JSON below:", txt);
      } catch (e) { console.warn(e); }
    };
    topActions.appendChild(exportBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ev-btn ev-del";
    closeBtn.innerText = "Close";
    closeBtn.onclick = () => { try { const ws = getMainWorkspaceSafe(); if (ws) resyncWorkspaceVariableMap(ws); } catch(e) {} removeModal(); };
    topActions.appendChild(closeBtn);

    top.appendChild(topActions);
    modal.appendChild(top);

    const content = document.createElement("div");
    content.className = "ev-content";
    modal.appendChild(content);

    // left categories
    const left = document.createElement("div");
    left.className = "ev-cats";
    content.appendChild(left);

    // center list
    const center = document.createElement("div");
    center.className = "ev-list";
    content.appendChild(center);

    // right details
    const right = document.createElement("div");
    right.className = "ev-details";
    right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
    content.appendChild(right);

    let currentCategory = CATEGORIES[0];

    // helpers for UI rebuild
    function getCount(cat) { return (state.variables[cat]||[]).length; }

    function rebuildCategories() {
      left.innerHTML = "";
      for (const cat of CATEGORIES) {
        const el = document.createElement("div");
        el.className = "ev-cat";
        if (cat === currentCategory) el.classList.add("selected");
        el.innerHTML = `<span style="font-weight:600">${cat}</span><span class="ev-muted">${getCount(cat)}</span>`;
        el.onclick = () => {
          currentCategory = cat;
          rebuildCategories();
          rebuildList();
          right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
        };
        left.appendChild(el);
      }
    }

    function rebuildList() {
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
      addBtn.onclick = openAdd;
      header.appendChild(addBtn);

      center.appendChild(header);

      const arr = state.variables[currentCategory] || [];
      if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ev-muted";
        empty.innerText = "(no variables)";
        center.appendChild(empty);
        return;
      }

      for (const v of arr) {
        const row = document.createElement("div");
        row.className = "ev-row";

        const leftCol = document.createElement("div");
        leftCol.style.display = "flex";
        leftCol.style.flexDirection = "column";
        const usedCount = (function(){ try{ const ws = getMainWorkspaceSafe(); return ws ? countVariableUsage(ws, v) : 0; }catch(e){return 0;} })();
        leftCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">ID: ${v.id} &nbsp; • &nbsp; In use: (${usedCount})</div>`;

        const rightCol = document.createElement("div");
        const edit = document.createElement("button");
        edit.className = "ev-btn ev-edit"; edit.style.marginRight = "6px"; edit.innerText = "Edit";
        edit.onclick = () => openEdit(v);

        const del = document.createElement("button");
        del.className = "ev-btn ev-del"; del.innerText = "Delete";
        del.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          state.variables[currentCategory] = state.variables[currentCategory].filter(x => x.id !== v.id);
          saveState();
          try { const ws = getMainWorkspaceSafe(); if (ws) { deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name); resyncWorkspaceVariableMap(ws); } } catch(e){}
          rebuildCategories(); rebuildList();
          right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
        };

        rightCol.appendChild(edit);
        rightCol.appendChild(del);
        row.appendChild(leftCol);
        row.appendChild(rightCol);
        center.appendChild(row);
      }
    }

    // ADD
    function openAdd() {
      const name = prompt(`Create new ${currentCategory} variable — name:`);
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      if (!validateName(currentCategory, trimmed)) { alert("Duplicate name in this category not allowed."); return; }
      const id = makeNextSequentialId();
      const v = { id: id, name: trimmed, type: currentCategory };
      state.variables[currentCategory].push(v);
      saveState();

      try {
        const ws = getMainWorkspaceSafe();
        if (ws) { createWorkspaceVariable(ws, v.name, v.type || currentCategory, v.id); resyncWorkspaceVariableMap(ws); }
      } catch (e) {}

      rebuildCategories(); rebuildList();
    }

    // EDIT
    function openEdit(varDef) {
      // populate details pane with editing UI
      right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Edit Variable</div>";
      const nameLabel = document.createElement("div"); nameLabel.className = "ev-muted"; nameLabel.innerText = "Name";
      const nameInput = document.createElement("input"); nameInput.className = "ev-input"; nameInput.value = varDef.name;
      right.appendChild(nameLabel); right.appendChild(nameInput);

      const idLabel = document.createElement("div"); idLabel.className = "ev-muted"; idLabel.innerText = "ID (locked)";
      const idBox = document.createElement("div"); idBox.className = "ev-muted"; idBox.style.marginBottom = "8px"; idBox.innerText = varDef.id;
      right.appendChild(idLabel); right.appendChild(idBox);

      const actions = document.createElement("div"); actions.className = "ev-actions";
      const save = document.createElement("button"); save.className = "ev-btn ev-add"; save.innerText = "Save";
      save.onclick = () => {
        const newName = nameInput.value.trim();
        if (!newName) { alert("Name cannot be empty"); return; }
        if (!validateName(currentCategory, newName, varDef.id)) { alert("Duplicate name in this category not allowed."); return; }
        const oldName = varDef.name;
        varDef.name = newName;
        saveState();
        // update workspace variable object best-effort
        try {
          const ws = getMainWorkspaceSafe();
          const map = workspaceGetVariableMap(ws);
          if (map) {
            let existing = null;
            if (typeof map.getVariableById === "function") existing = map.getVariableById(varDef.id);
            if (!existing && typeof map.getVariable === "function") existing = map.getVariable(varDef.id) || map.getVariable(oldName);
            if (existing && existing.name !== undefined) existing.name = varDef.name;
            // do a resync to be safe
            resyncWorkspaceVariableMap(ws);
          }
        } catch (e) {}
        rebuildList();
        right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
      };
      const cancel = document.createElement("button"); cancel.className = "ev-btn ev-edit"; cancel.innerText = "Cancel";
      cancel.onclick = () => { right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>"; };

      actions.appendChild(cancel); actions.appendChild(save);
      right.appendChild(actions);
    }

    function validateName(category, name, ignoreId=null) {
      const arr = state.variables[category] || [];
      return !arr.some(v => v.name.toLowerCase() === name.toLowerCase() && v.id !== ignoreId);
    }

    // initial render
    rebuildCategories();
    rebuildList();

    // click outside closes and triggers final resync
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) {
        try { const ws = getMainWorkspaceSafe(); if (ws) resyncWorkspaceVariableMap(ws); } catch (e) {}
        removeModal();
      }
    });

    // add to DOM
    document.body.appendChild(modalOverlay);
  } // openModal end

  // ----- Context menu registration (use ContextMenuRegistry like working copy/paste plugin)
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

    // fallback (best-effort DOM injection)
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

  // ----- initialization
  function initialize() {
    loadState();
    ensureStateCategories();
    // attempt to pre-register into workspace
    try { const ws = getMainWorkspaceSafe(); if (ws) registerAllVariablesInWorkspace(ws); } catch (e) {}
    registerContextMenuItem();
    if (plugin) plugin.openManager = openModal;
    console.info("[ExtVars] Extended Variable Manager initialized.");
  }

  setTimeout(initialize, 900);
})();
