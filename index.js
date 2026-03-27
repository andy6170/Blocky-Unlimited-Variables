// BF6 Extended Variable Manager
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  // defensive plugin handle
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins?.getPlugin) {
      plugin = BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID };
    } else {
      plugin = { id: PLUGIN_ID };
    }
  } catch (e) { plugin = { id: PLUGIN_ID }; }

  // categories
  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  function registerContextMenuItem() {
  const tryRegister = () => {
    const reg = 
      (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry?.registry) ? _Blockly.ContextMenuRegistry.registry :
      (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry?.registry) ? Blockly.ContextMenuRegistry.registry :
      null;

    if (reg && typeof reg.register === "function") {
      const scopeType = 
        (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry?.ScopeType?.WORKSPACE) ? _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE :
        (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry?.ScopeType?.WORKSPACE) ? Blockly.ContextMenuRegistry.ScopeType.WORKSPACE :
        null;

      const item = {
        id: "manageExtendedVariables",
        displayText: "Manage Variables",
        preconditionFn: () => "enabled",
        callback: () => openModal(),
        scopeType: scopeType,
        weight: 98
      };

      try { if(reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); } catch(e) {}
      reg.register(item);
      console.log("[ExtVars] Registered context menu item via ContextMenuRegistry");
      return true;
    }
    return false;
  };

  if (!tryRegister()) {
    // Fallback DOM injection for right-click menu
    document.addEventListener("contextmenu", () => {
      setTimeout(() => {
        const menu = document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
        if (!menu) return;
        if (menu.querySelector("[data-extvars]")) return;

        const el = document.createElement("div");
        el.setAttribute("data-extvars","1");
        el.style.padding="6px 10px";
        el.style.cursor="pointer";
        el.style.color="#e9eef2";
        el.textContent = "Manage Variables";
        el.addEventListener("click", () => { openModal(); try { menu.style.display="none"; } catch(e) {} });
        menu.appendChild(el);
      }, 40);
    });
    console.log("[ExtVars] Registered context menu fallback via DOM injection");
  }
}

// call it after a short delay to ensure Blockly exists
setTimeout(registerContextMenuItem, 1200);

  // ---------- workspace helpers ----------
  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly.getMainWorkspace) return _Blockly.getMainWorkspace();
      if (typeof Blockly !== "undefined" && Blockly.getMainWorkspace) return Blockly.getMainWorkspace();
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) {
        try { return BF2042Portal.getMainWorkspace(); } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function workspaceGetVariableMap(ws) {
    try {
      if (!ws) return null;
      if (ws.getVariableMap) return ws.getVariableMap();
      if (ws.variableMap) return ws.variableMap;
    } catch (e) {}
    return null;
  }

  function workspaceGetVariables(ws) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return [];
      if (map.getVariables) return map.getVariables();
      if (map.getAllVariables) return map.getAllVariables();
      if (Array.isArray(map.variables)) return map.variables;
    } catch (e) {}
    return [];
  }

  function getVarId(v) { try { return v?.id ?? (v.getId ? v.getId() : null); } catch (e) { return null; } }
  function getVarName(v) { try { return v?.name ?? (v.getName ? v.getName() : null); } catch(e) { return null; } }
  function getVarType(v) { try { return v?.type ?? (v.getType ? v.getType() : "Global"); } catch(e) { return "Global"; } }

  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map?.createVariable) return map.createVariable(name, type || "", id);
      if (ws?.createVariable) return ws.createVariable(name, type || "", id);
      if (Blockly?.Variables?.createVariable) return Blockly.Variables.createVariable(ws, name, type || "", id);
    } catch(e) { console.warn("[ExtVars] createWorkspaceVariable error:", e); }
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (map.deleteVariableById) { try { map.deleteVariableById(idOrName); return true; } catch(e){} }
      if (map.deleteVariable) { try { map.deleteVariable(idOrName); return true; } catch(e){} }
      if (map.removeVariable) { try { map.removeVariable(idOrName); return true; } catch(e){} }
      if (map.getVariables) {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => getVarId(v) === idOrName || getVarName(v) === idOrName);
        if (idx >= 0) { try { vs.splice(idx,1); return true; } catch(e){} }
      }
    } catch(e) { console.warn("[ExtVars] deleteWorkspaceVariable error:", e); }
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      let found = null;
      const id = getVarId(varObj);
      if (id && map.getVariableById) { try { found = map.getVariableById(id); } catch(e){found=null;} }
      if (!found && map.getVariable) { try { found = map.getVariable(id) || map.getVariable(getVarName(varObj)); } catch(e){found=null;} }
      if (found) { try { found.name = newName; return true; } catch(e){} }
      if (varObj?.name !== undefined) { varObj.name = newName; return true; }
    } catch(e) { console.warn("[ExtVars] renameWorkspaceVariable error:", e); }
    return false;
  }

  // ---------- update blocks after rename ----------
  function updateBlocksForVariableRename(oldName, newName, ws) {
    if (!ws) return;
    const allBlocks = ws.getAllBlocks(false);
    let changed = 0;
    allBlocks.forEach(block => {
      if (!block) return;
      const varField = block.getField && block.getField("VAR");
      if (!varField) return;
      try {
        const val = varField.getValue?.();
        const varObj = ws.getVariableById?.(val);
        if (varObj && varObj.name === newName) { varField.setValue(val); block.render?.(); changed++; }
      } catch (e) { console.warn("[ExtVars] Block update error:", e); }
    });
    console.log(`[ExtVars] Rename complete: ${changed} blocks updated.`);

    try {
      const dummyName = "__EXTVARS_DUMMY__";
      const dummyId = "EXTVARS_DUMMY_" + Date.now();
      const dummyVar = createWorkspaceVariable(ws, dummyName, "Global", dummyId);
      if (dummyVar) { deleteWorkspaceVariable(ws, dummyId) || deleteWorkspaceVariable(ws, dummyName); }
    } catch (e) { console.warn("[ExtVars] Dummy variable trick failed:", e); }
  }

  function makeNextSequentialIdFromWorkspace() {
    try {
      const ws = getMainWorkspaceSafe();
      const vars = workspaceGetVariables(ws);
      let max = 0;
      for (const v of vars) {
        const id = getVarId(v);
        if (typeof id === "string" && id.startsWith("EV_")) {
          const n = parseInt(id.slice(3),10);
          if (!isNaN(n) && n>max) max=n;
        }
      }
      return "EV_"+String(max+1).padStart(4,"0");
    } catch(e){ return "EV_0001"; }
  }

  // ---------- live registry ----------
  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for (const c of CATEGORIES) live[c]=[];
    try {
      const vars = workspaceGetVariables(ws);
      for (const v of vars) {
        const id = getVarId(v);
        const name = getVarName(v);
        const type = getVarType(v) || "Global";
        const cat = (typeof type==="string") ? type : "Global";
        if (!live[cat]) live[cat]=[];
        live[cat].push({ id, name, type, _raw:v });
      }
    } catch(e){}
    return live;
  }

  // ---------- modal ----------
  let modalOverlay = null;
  function removeModal(){ if(modalOverlay){ try{modalOverlay.remove();}catch(e){} modalOverlay=null; } }

  function openModal() {
    removeModal();
    const ws = getMainWorkspaceSafe();
    if (!ws) { console.warn("[ExtVars] Workspace not ready yet."); return; }

    const live = getLiveRegistry();
    console.log("[ExtVars] live registry:", live);

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
    title.innerText = "Advanced Variable Manager";
    top.appendChild(title);

    const topActions = document.createElement("div");
    const closeBtn = document.createElement("button");
    closeBtn.className = "ev-btn ev-del";
    closeBtn.innerText = "Close";
    closeBtn.onclick = () => removeModal();
    topActions.appendChild(closeBtn);
    top.appendChild(topActions);
    modal.appendChild(top);

    const content = document.createElement("div");
    content.className = "ev-content";
    modal.appendChild(content);

    const left = document.createElement("div");
    left.className = "ev-cats";
    const center = document.createElement("div");
    center.className = "ev-list";
    content.appendChild(left);
    content.appendChild(center);

    let currentCategory = CATEGORIES[0];

    function rebuildCategories() {
      left.innerHTML = "";
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);
      for (const cat of CATEGORIES) {
        const el = document.createElement("div");
        el.className = "ev-cat";
        if (cat === currentCategory) el.classList.add("selected");
        const count = (live[cat] || []).length;
        el.innerHTML = `<span style="font-weight:600">${cat}</span><span class="ev-muted">${count}</span>`;
        el.onclick = () => { currentCategory = cat; rebuildCategories(); rebuildList(); };
        left.appendChild(el);
      }
    }

    function rebuildList() {
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);
      center.innerHTML = "";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.marginBottom = "8px";

      const h = document.createElement("div");
      h.innerHTML = `<strong>${currentCategory} Variables</strong><span class="ev-muted"> Total: ${live[currentCategory]?.length || 0}</span>`;
      header.appendChild(h);

      const addBtn = document.createElement("button");
      addBtn.className = "ev-btn ev-add";
      addBtn.innerText = "Add";
      addBtn.onclick = () => {
        const name = prompt("Enter variable name:");
        if (!name) return;
        const id = makeNextSequentialIdFromWorkspace();
        createWorkspaceVariable(ws, name, currentCategory, id);
        rebuildCategories();
        rebuildList();
      };
      header.appendChild(addBtn);
      center.appendChild(header);

      const arr = live[currentCategory] || [];
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
        const usedCount = countVariableUsage(ws, v);
        leftCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${usedCount})</div>`;

        const rightCol = document.createElement("div");

        const editBtn = document.createElement("button");
        editBtn.className = "ev-btn ev-edit";
        editBtn.style.marginRight = "6px";
        editBtn.innerText = "Edit";
        editBtn.onclick = () => {
          const newName = prompt("Enter new name for variable:", v.name);
          if (!newName) return;
          const oldName = v.name;
          renameWorkspaceVariable(ws, v._raw, newName);
          updateBlocksForVariableRename(oldName, newName, ws);
          rebuildCategories();
          rebuildList();
        };

        const delBtn = document.createElement("button");
        delBtn.className = "ev-btn ev-del";
        delBtn.innerText = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name);
          rebuildCategories();
          rebuildList();
        };

        rightCol.appendChild(editBtn);
        rightCol.appendChild(delBtn);

        row.appendChild(leftCol);
        row.appendChild(rightCol);
        center.appendChild(row);
      }
    }

    rebuildCategories();
    rebuildList();

    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) removeModal();
    });

    document.body.appendChild(modalOverlay);
  }

  // ---------- initialize ----------
  function initialize(){
    if(plugin) plugin.openManager=openModal;
    console.info("[ExtVars] Live Extended Variable Manager initialized (workspace-only).");
  }

  setTimeout(initialize, 900);

  // ---------- safe export ----------
  window._getMainWorkspaceSafe = getMainWorkspaceSafe;
  window._updateBlocksForVariableRename = updateBlocksForVariableRename;

})();
