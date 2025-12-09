// BF6 Extended Variable Manager - integrated, persistent, workspace-sync
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  // defensive access to portal plugin API if present
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

  const STORAGE_KEY = PLUGIN_ID + "-state-v1";

  // ====== Workspace accessor (defensive) ======
  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly && typeof _Blockly.getMainWorkspace === "function") {
        return _Blockly.getMainWorkspace();
      }
      if (typeof Blockly !== "undefined" && Blockly && typeof Blockly.getMainWorkspace === "function") {
        return Blockly.getMainWorkspace();
      }
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) {
        try { return BF2042Portal.getMainWorkspace(); } catch (e) {}
      }
    } catch (e) { /* swallow */ }
    return null;
  }

  // ====== Categories & state ======
  const categories = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  // persisted state object
  let state = {
    nextIdCounter: 1,
    variables: {} // category -> [{id,name,type}]
  };

  function ensureStateCategories() {
    for (const c of categories) if (!Array.isArray(state.variables[c])) state.variables[c] = [];
  }

  // ===== Persistence =====
  function saveState() {
    try {
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.saveToLocalStorage === "function") {
        BF2042Portal.Shared.saveToLocalStorage(STORAGE_KEY, state);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.warn("[ExtVars] saveState failed:", e);
    }
  }

  function loadState() {
    try {
      let loaded = null;
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.loadFromLocalStorage === "function") {
        loaded = BF2042Portal.Shared.loadFromLocalStorage(STORAGE_KEY);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = JSON.parse(raw);
      }
      if (loaded && typeof loaded === "object") {
        // merge safely
        state = Object.assign({}, state, loaded);
      }
    } catch (e) {
      console.warn("[ExtVars] loadState failed:", e);
    }
    ensureStateCategories();

    // ensure nextIdCounter is above any existing EV_ ids
    try {
      let max = state.nextIdCounter || 1;
      for (const cat of categories) {
        const arr = state.variables[cat] || [];
        for (const v of arr) {
          if (v && typeof v.id === "string" && v.id.startsWith("EV_")) {
            const n = parseInt(v.id.slice(3), 10);
            if (!isNaN(n) && n >= max) max = n + 1;
          }
        }
      }
      state.nextIdCounter = max;
    } catch (e) {}
  }

  // ===== Workspace variable helpers (defensive) =====
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

  // serialize traversal helper for usage counting
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

  // Register all saved variables into workspace (best-effort)
  function registerAllVariablesInWorkspace(ws) {
    try {
      for (const cat of categories) {
        const arr = state.variables[cat] || [];
        for (const v of arr) {
          try {
            if (!workspaceHasVariableWithId(ws, v.id) && !workspaceHasVariableWithName(ws, v.name)) {
              createWorkspaceVariable(ws, v.name, v.type || cat, v.id);
            }
          } catch (e) {}
        }
      }
      try { document.dispatchEvent(new Event("variables_refreshed")); } catch (e) {}
    } catch (e) { console.warn("[ExtVars] registerAllVariablesInWorkspace error:", e); }
  }

  // resync workspace variable map by removing and re-adding (best-effort)
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
                try { map.deleteVariableById(ex.getId()); } catch(e) {}
              } else if (typeof map.deleteVariable === "function") {
                try { map.deleteVariable(ex); } catch(e) {}
              }
            } catch(e) {}
          }
        }
      } catch (e) {}
      for (const cat of categories) {
        for (const v of state.variables[cat] || []) {
          try { createWorkspaceVariable(ws, v.name, v.type || cat, v.id); } catch (e) {}
        }
      }
      try { if (ws.refreshToolboxSelection) ws.refreshToolboxSelection(); } catch (e) {}
      try { if (ws.toolbox_) ws.toolbox_.refreshSelection && ws.toolbox_.refreshSelection(); } catch (e) {}
      try { document.dispatchEvent(new Event("variables_refreshed")); } catch (e) {}
    } catch (e) { console.warn("[ExtVars] resyncWorkspaceVariableMap error:", e); }
  }

  // make next sequential EV id
  function makeNextSequentialId() {
    // try to use monotonic counter first
    if (!state.nextIdCounter || typeof state.nextIdCounter !== "number") state.nextIdCounter = 1;
    const id = "EV_" + String(state.nextIdCounter).padStart(4, "0");
    state.nextIdCounter += 1;
    return id;
  }

  // ====== UI CSS injection (keeps your original styles) ======
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
        .varPopupOverlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.55);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999999;
        }
        .varPopup {
            background: #1a1a1a;
            padding: 18px;
            width: 900px;
            max-height: 86vh;
            overflow: hidden;
            display: flex;
            border-radius: 8px;
            box-shadow: 0 0 25px rgba(0,0,0,0.5);
            color: #ddd;
            font-family: Inter, Arial, sans-serif;
        }
        .varCategories {
            width: 200px;
            overflow-y: auto;
            border-right: 1px solid #333;
            padding-right: 10px;
            margin-right: 12px;
        }
        .variable-category {
            padding: 6px 10px;
            cursor: pointer;
            border-radius: 4px;
            margin-bottom: 4px;
            color: #ddd;
            background: transparent;
        }
        .variable-category:hover { background-color: rgba(255,255,255,0.03); }
        .variable-category.selected { background-color: rgba(255,255,255,0.08); border-left: 3px solid #ff0a03; }
        .varList {
            flex: 1;
            overflow-y: auto;
            padding-left: 6px;
            color: #ddd;
            display: flex;
            flex-direction: column;
        }
        .varEntry {
            padding: 8px;
            background: #222;
            margin-bottom: 8px;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .buttonRow {
            text-align: right;
            padding-top: 12px;
        }
        .blueBtn {
            background: #2ca72c;
            padding: 6px 10px;
            border-radius: 6px;
            cursor: pointer;
            margin-left: 6px;
            color: #fff;
            border: none;
        }
        .redBtn {
            background: #a73232;
            padding: 6px 10px;
            border-radius: 6px;
            cursor: pointer;
            margin-left: 6px;
            color: #fff;
            border: none;
        }
        .smallMuted { color: #9aa; font-size: 12px; }
        .detailBox { margin-top: 8px; font-size: 13px; color: #dfe6ea; }
    `;
    document.head.appendChild(style);
  })();

  // ====== UI: variable manager popup - based on your model, extended with persistence/workspace sync ======
  function openVariableManager() {
    loadState();
    ensureStateCategories();

    let currentCategory = categories[0];

    // try to pre-register variables in workspace
    const wsPre = getMainWorkspaceSafe();
    if (wsPre) registerAllVariablesInWorkspace(wsPre);

    // build overlay + popup
    const overlay = document.createElement("div");
    overlay.className = "varPopupOverlay";

    const popup = document.createElement("div");
    popup.className = "varPopup";
    overlay.appendChild(popup);

    // left / right
    const categoryList = document.createElement("div");
    categoryList.className = "varCategories";
    const variableList = document.createElement("div");
    variableList.className = "varList";

    popup.appendChild(categoryList);
    popup.appendChild(variableList);
    document.body.appendChild(overlay);

    function getVariableCount(category) { return (state.variables[category]||[]).length; }

    function rebuildCategories() {
      categoryList.innerHTML = "";
      categories.forEach(category => {
        const el = document.createElement("div");
        el.className = "variable-category";
        el.textContent = `${category} (${getVariableCount(category)})`;
        if (category === currentCategory) el.classList.add("selected");
        el.addEventListener("click", () => {
          categoryList.querySelectorAll(".variable-category").forEach(x => x.classList.remove("selected"));
          el.classList.add("selected");
          currentCategory = category;
          rebuildCategories();
          rebuildVariableList();
        });
        categoryList.appendChild(el);
      });
    }

    function rebuildVariableList() {
      variableList.innerHTML = "";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.marginBottom = "8px";

      const h1 = document.createElement("div");
      h1.innerHTML = `<strong>${currentCategory} Variables</strong><div class="smallMuted">Total: ${getVariableCount(currentCategory)}</div>`;
      header.appendChild(h1);

      const addBtn = document.createElement("button");
      addBtn.className = "blueBtn";
      addBtn.textContent = "Add";
      addBtn.addEventListener("click", () => openAddDialog());
      header.appendChild(addBtn);

      variableList.appendChild(header);

      const arr = state.variables[currentCategory] || [];
      if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.className = "smallMuted";
        empty.textContent = "(no variables)";
        variableList.appendChild(empty);
      } else {
        for (const v of arr) {
          const row = document.createElement("div");
          row.className = "varEntry";

          const left = document.createElement("div");
          left.style.display = "flex";
          left.style.flexDirection = "column";

          const usedCount = (function(){ try{ const ws = getMainWorkspaceSafe(); return ws ? countVariableUsage(ws, v) : 0; }catch(e){return 0;} })();

          left.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="smallMuted">ID: ${v.id} &nbsp; • &nbsp; In use: (${usedCount})</div>`;

          const right = document.createElement("div");

          const editBtn = document.createElement("button");
          editBtn.className = "blueBtn";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", () => openEditDialog(v));

          const delBtn = document.createElement("button");
          delBtn.className = "redBtn";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", () => {
            if (!confirm(`Delete variable "${v.name}"? This may break blocks that reference it.`)) return;
            state.variables[currentCategory] = state.variables[currentCategory].filter(x => x.id !== v.id);
            saveState();
            // delete from workspace if possible
            try {
              const ws = getMainWorkspaceSafe();
              if (ws) deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name);
              resyncWorkspaceVariableMap(ws);
            } catch (e) {}
            rebuildCategories();
            rebuildVariableList();
          });

          right.appendChild(editBtn);
          right.appendChild(delBtn);

          row.appendChild(left);
          row.appendChild(right);
          variableList.appendChild(row);
        }
      }
    }

    function closeOverlay() {
      try { overlay.remove(); } catch (e) {}
    }

    // Add dialog: only name input; sequential ID created
    function openAddDialog() {
      const name = prompt(`Create new ${currentCategory} variable — name:`);
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      // unique in category
      if (!validateName(currentCategory, trimmed)) {
        alert("Duplicate name in this category not allowed.");
        return;
      }
      const id = makeNextSequentialId();
      const varDef = { id: id, name: trimmed, type: currentCategory };
      state.variables[currentCategory].push(varDef);
      saveState();

      // also register in workspace variable map if available
      try {
        const ws = getMainWorkspaceSafe();
        if (ws) {
          createWorkspaceVariable(ws, varDef.name, varDef.type || currentCategory, varDef.id);
          resyncWorkspaceVariableMap(ws);
        }
      } catch (e) {}

      rebuildCategories();
      rebuildVariableList();
    }

    // Edit dialog: only name editable
    function openEditDialog(varDef) {
      const newName = prompt("Edit variable name:", varDef.name);
      if (!newName) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      if (!validateName(currentCategory, trimmed, varDef.id)) {
        alert("Duplicate name in this category not allowed.");
        return;
      }
      const oldName = varDef.name;
      varDef.name = trimmed;
      saveState();

      // attempt to update workspace variable name (best-effort)
      try {
        const ws = getMainWorkspaceSafe();
        if (ws) {
          const map = workspaceGetVariableMap(ws);
          if (map) {
            try {
              let existing = null;
              if (typeof map.getVariableById === "function") existing = map.getVariableById(varDef.id);
              if (!existing && typeof map.getVariable === "function") existing = map.getVariable(varDef.id) || map.getVariable(oldName);
              if (existing && existing.name !== undefined) existing.name = varDef.name;
              // fallback: resync map
              resyncWorkspaceVariableMap(ws);
            } catch (e) {}
          }
        }
      } catch (e) {}

      rebuildCategories();
      rebuildVariableList();
    }

    // validation
    function validateName(category, name, ignoreId = null) {
      const arr = state.variables[category] || [];
      return !arr.some(v => v.name.toLowerCase() === name.toLowerCase() && v.id !== ignoreId);
    }

    // close on background click
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeOverlay();
    });

    rebuildCategories();
    rebuildVariableList();
  }

  // ===== Context menu registration via ContextMenuRegistry like copy/paste plugin =====
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
          callback: () => openVariableManager(),
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

    // fallback to DOM injection (best-effort)
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
          el.style.color = "#fff";
          el.textContent = "Manage Variables";
          el.addEventListener("click", (e) => {
            openVariableManager();
            try { menu.style.display = "none"; } catch(e){}
          });
          menu.appendChild(el);
        }, 40);
      });
    })();
  }

  // ===== Init =====
  function initialize() {
    loadState();
    ensureStateCategories();
    // attempt to pre-register saved variables in workspace
    try {
      const ws = getMainWorkspaceSafe();
      if (ws) registerAllVariablesInWorkspace(ws);
    } catch (e) {}
    registerContextMenuItem();

    // expose for debugging/manual open
    if (plugin) plugin.openExtendedVariables = openVariableManager;
    console.info("[ExtVars] Extended Variable Manager initialized.");
  }

  // Run initialize after short delay to allow portal/Blockly to be ready
  setTimeout(initialize, 900);
})();
