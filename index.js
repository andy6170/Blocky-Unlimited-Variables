// BF6 Extended Variable Manager - live workspace-only with usage counter
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins && typeof BF2042Portal.Plugins.getPlugin === "function") {
      plugin = BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID };
    } else { plugin = { id: PLUGIN_ID }; }
  } catch (e) { plugin = { id: PLUGIN_ID }; }

  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

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

  function workspaceGetVariables(ws) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return [];
      if (typeof map.getVariables === "function") return map.getVariables();
      if (typeof map.getAllVariables === "function") return map.getAllVariables();
      if (Array.isArray(map.variables)) return map.variables;
    } catch (e) {}
    return [];
  }

  function getVarId(v) { try { if (!v) return null; return v.id || (v.getId ? v.getId() : null); } catch (e) { return null; } }
  function getVarName(v) { try { if (!v) return null; return v.name !== undefined ? v.name : (v.getName ? v.getName() : null); } catch (e) { return null; } }
  function getVarType(v) { try { if (!v) return "Global"; return v.type !== undefined ? v.type : (v.getType ? v.getType() : "Global"); } catch (e) { return "Global"; } }

  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map && typeof map.createVariable === "function") {
        try { return map.createVariable(name, type || "", id); } catch (e) { return map.createVariable(name, type || ""); }
      }
      if (ws && typeof ws.createVariable === "function") return ws.createVariable(name, type || "", id);
      if (typeof Blockly !== "undefined" && Blockly.Variables && typeof Blockly.Variables.createVariable === "function") return Blockly.Variables.createVariable(ws, name, type || "", id);
    } catch (e) { console.warn("[ExtVars] createWorkspaceVariable error:", e); }
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.deleteVariableById === "function") { try { map.deleteVariableById(idOrName); return true; } catch (e) {} }
      if (typeof map.deleteVariable === "function") { try { map.deleteVariable(idOrName); return true; } catch (e) {} }
      if (typeof map.removeVariable === "function") { try { map.removeVariable(idOrName); return true; } catch (e) {} }
      if (map.getVariables && typeof map.getVariables === "function") {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => getVarId(v) === idOrName || getVarName(v) === idOrName);
        if (idx >= 0 && Array.isArray(vs)) { try { vs.splice(idx, 1); return true; } catch (e) {} }
      }
    } catch (e) { console.warn("[ExtVars] deleteWorkspaceVariable error:", e); }
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      let found = null;
      const id = getVarId(varObj);
      if (id && typeof map.getVariableById === "function") { try { found = map.getVariableById(id); } catch (e) { found = null; } }
      if (!found && typeof map.getVariable === "function") { try { found = map.getVariable(id) || map.getVariable(getVarName(varObj)); } catch (e) { found = null; } }
      if (found) { try { found.name = newName; return true; } catch (e) {} }
      try { if (varObj && varObj.name !== undefined) { varObj.name = newName; return true; } } catch (e) {}
    } catch (e) { console.warn("[ExtVars] renameWorkspaceVariable error:", e); }
    return false;
  }

  function makeNextSequentialIdFromWorkspace() {
    try {
      const ws = getMainWorkspaceSafe();
      const vars = workspaceGetVariables(ws);
      let max = 0;
      for (const v of vars) {
        const id = getVarId(v);
        if (typeof id === "string" && id.startsWith("EV_")) {
          const n = parseInt(id.slice(3), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
      return "EV_" + String(max + 1).padStart(4, "0");
    } catch (e) { return "EV_0001"; }
  }

  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for (const c of CATEGORIES) live[c] = [];
    try {
      const vars = workspaceGetVariables(ws);
      for (const v of vars) {
        try {
          const id = getVarId(v);
          const name = getVarName(v);
          const type = getVarType(v) || "Global";
          if (!live[type]) live[type] = [];
          live[type].push({ id, name, type, _raw: v });
        } catch (e) {}
      }
    } catch (e) {}
    for (const c of CATEGORIES) if (!live[c]) live[c] = [];
    return live;
  }

  // ---------- count variable usage in workspace ----------
  function countVariableUsage(ws, varDef) {
    if (!ws || !varDef) return 0;
    try {
      const blocks = ws.getAllBlocks ? ws.getAllBlocks() : [];
      const name = varDef.name;
      let count = 0;

      blocks.forEach(block => {
        if (!block) return;

        if (block.getVars && typeof block.getVars === "function") {
          const vars = block.getVars();
          if (Array.isArray(vars)) count += vars.filter(v => v === name).length;
        }

        if (block.getVariable && typeof block.getVariable === "function") {
          const v = block.getVariable();
          if (v === name) count++;
        }

        if (block.inputList && Array.isArray(block.inputList)) {
          block.inputList.forEach(input => {
            if (!input.fieldRow) return;
            input.fieldRow.forEach(field => {
              if (!field) return;
              if (field.getValue && field.getValue() === name) count++;
            });
          });
        }
      });

      return count;
    } catch (e) { return 0; }
  }

  // ---------- UI CSS ----------
  (function injectStyle() {
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

  // ---------- modal UI ----------
  let modalOverlay = null;
  function removeModal() { if (modalOverlay) { try { modalOverlay.remove(); } catch(e) {} modalOverlay = null; } }

  function openModal() {
    const live = getLiveRegistry();
    removeModal();
    modalOverlay = document.createElement("div"); modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div"); modal.className = "ev-modal";
    modalOverlay.appendChild(modal);

    const top = document.createElement("div"); top.className = "ev-top";
    const title = document.createElement("div"); title.className = "ev-title"; title.innerText = "Extended Variable Manager";
    top.appendChild(title);
    const topActions = document.createElement("div");
    const closeBtn = document.createElement("button"); closeBtn.className = "ev-btn ev-del"; closeBtn.innerText = "Close";
    closeBtn.onclick = () => { removeModal(); };
    topActions.appendChild(closeBtn); top.appendChild(topActions);
    modal.appendChild(top);

    const content = document.createElement("div"); content.className = "ev-content";
    modal.appendChild(content);

    const left = document.createElement("div"); left.className = "ev-cats";
    const center = document.createElement("div"); center.className = "ev-list";
    const right = document.createElement("div"); right.className = "ev-details"; right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
    content.appendChild(left); content.appendChild(center); content.appendChild(right);

    let currentCategory = CATEGORIES[0];

    function getCount(cat) { 
      const arr = live[cat] || [];
      let usage = 0;
      try {
        const ws = getMainWorkspaceSafe();
        if (!ws) return arr.length;
        arr.forEach(v => usage += countVariableUsage(ws, v));
        return usage;
      } catch(e){ return arr.length; }
    }

    function rebuildCategories() {
      left.innerHTML = "";
      for (const cat of CATEGORIES) {
        const el = document.createElement("div"); el.className = "ev-cat";
        if (cat === currentCategory) el.classList.add("selected");
        el.innerHTML = `<span style="font-weight:600">${cat}</span><span class="ev-muted">${getCount(cat)}</span>`;
        el.onclick = () => { currentCategory = cat; rebuildCategories(); rebuildList(); right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>"; };
        left.appendChild(el);
      }
    }

    function rebuildList() {
      const fresh = getLiveRegistry(); Object.assign(live, fresh);
      center.innerHTML = "";
      const header = document.createElement("div"); header.style.display = "flex"; header.style.justifyContent = "space-between"; header.style.alignItems = "center"; header.style.marginBottom = "8px";
      const h = document.createElement("div"); h.innerHTML = `<strong>${currentCategory} Variables</strong><div class="ev-muted">Total: ${getCount(currentCategory)}</div>`; header.appendChild(h);
      const addBtn = document.createElement("button"); addBtn.className = "ev-btn ev-add"; addBtn.innerText = "Add"; addBtn.onclick = () => openAdd(); header.appendChild(addBtn); center.appendChild(header);

      const arr = live[currentCategory] || [];
      if (arr.length === 0) { const empty = document.createElement("div"); empty.className = "ev-muted"; empty.innerText = "(no variables)"; center.appendChild(empty); return; }

      for (const v of arr) {
        const row = document.createElement("div"); row.className = "ev-row";
        const leftCol = document.createElement("div"); leftCol.style.display = "flex"; leftCol.style.flexDirection = "column";
        const usedCount = (function(){ try{ const ws = getMainWorkspaceSafe(); return ws ? countVariableUsage(ws, v) : 0; }catch(e){return 0;} })();
        leftCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${usedCount})</div>`;

        const rightCol = document.createElement("div");
        const editBtn = document.createElement("button"); editBtn.className = "ev-btn ev-edit"; editBtn.style.marginRight = "6px"; editBtn.innerText = "Edit"; editBtn.onclick = () => openEdit(v);
        const delBtn = document.createElement("button"); delBtn.className = "ev-btn ev-del"; delBtn.innerText = "Delete"; delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          try { const ws = getMainWorkspaceSafe(); if (ws) deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name); } catch (e) { console.warn(e); }
          rebuildCategories(); rebuildList(); right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
        };

        rightCol.appendChild(editBtn); rightCol.appendChild(delBtn);
        row.appendChild(leftCol); row.appendChild(rightCol);
        center.appendChild(row);
      }
    }

    function openAdd() {
      const name = prompt(`Create new ${currentCategory} variable — name:`); if (!name) return;
      const trimmed = name.trim(); if (!trimmed) return;
      const id = makeNextSequentialIdFromWorkspace();
      try { const ws = getMainWorkspaceSafe(); if (!ws) { alert("No workspace available."); return; } createWorkspaceVariable(ws, trimmed, currentCategory, id); } catch (e) { console.warn("[ExtVars] add error:", e); }
      rebuildCategories(); rebuildList();
    }

    function openEdit(varDef) {
      right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Edit Variable</div>";
      const nameLabel = document.createElement("div"); nameLabel.className = "ev-muted"; nameLabel.innerText = "Name";
      const nameInput = document.createElement("input"); nameInput.className = "ev-input"; nameInput.value = varDef.name || "";
      right.appendChild(nameLabel); right.appendChild(nameInput);

      const actions = document.createElement("div"); actions.className = "ev-actions";
      const save = document.createElement("button"); save.className = "ev-btn ev-add"; save.innerText = "Save"; save.onclick = () => {
        const newName = nameInput.value.trim(); if (!newName) { alert("Name cannot be empty"); return; }
        try { const ws = getMainWorkspaceSafe(); if (!ws) { alert("No workspace available."); return; } renameWorkspaceVariable(ws, varDef._raw || varDef, newName); } catch (e) { console.warn("[ExtVars] rename failed:", e); }
        rebuildCategories(); rebuildList(); right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
      };
      const cancel = document.createElement("button"); cancel.className = "ev-btn ev-edit"; cancel.innerText = "Cancel"; cancel.onclick = () => { right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>"; };
      actions.appendChild(cancel); actions.appendChild(save); right.appendChild(actions);
    }

    rebuildCategories(); rebuildList();

    modalOverlay.addEventListener("click", (ev) => { if (ev.target === modalOverlay) removeModal(); });
    document.body.appendChild(modalOverlay);
  }

  window.BF6_ExtendedVariableManager = { open: openModal };
})();
