// BF6 Extended Variable Manager - fully fixed (live workspace-only)
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

  // categories
  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  // ---------- workspace helpers ----------
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

  function getVarId(v) { try { return v?.id ?? (v.getId ? v.getId() : null); } catch (e) { return null; } }
  function getVarName(v) { try { return v?.name ?? (v.getName ? v.getName() : null); } catch(e) { return null; } }
  function getVarType(v) { try { return v?.type ?? (v.getType ? v.getType() : "Global"); } catch(e) { return "Global"; } }

  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map && typeof map.createVariable === "function") {
        try { return map.createVariable(name, type || "", id); } catch (e) { try { return map.createVariable(name, type || ""); } catch(e2){} }
      }
      if (ws && typeof ws.createVariable === "function") {
        try { return ws.createVariable(name, type || "", id); } catch (e) { try { return ws.createVariable(name, type || ""); } catch(e2){} }
      }
      if (typeof Blockly !== "undefined" && Blockly.Variables && typeof Blockly.Variables.createVariable === "function") {
        try { return Blockly.Variables.createVariable(ws, name, type || "", id); } catch(e) {}
      }
    } catch(e) { console.warn("[ExtVars] createWorkspaceVariable error:", e); }
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.deleteVariableById === "function") { try { map.deleteVariableById(idOrName); return true; } catch(e){} }
      if (typeof map.deleteVariable === "function") { try { map.deleteVariable(idOrName); return true; } catch(e){} }
      if (typeof map.removeVariable === "function") { try { map.removeVariable(idOrName); return true; } catch(e){} }
      if (map.getVariables && typeof map.getVariables === "function") {
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
      if (id && typeof map.getVariableById === "function") { try { found = map.getVariableById(id); } catch(e){found=null;} }
      if (!found && typeof map.getVariable === "function") { try { found = map.getVariable(id) || map.getVariable(getVarName(varObj)); } catch(e){found=null;} }
      if (found) { try { found.name = newName; return true; } catch(e){} }
      try { if (varObj && varObj.name !== undefined) { varObj.name = newName; return true; } } catch(e){}
    } catch(e) { console.warn("[ExtVars] renameWorkspaceVariable error:", e); }
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
        const cat = (type && typeof type==="string") ? type : "Global";
        if (!live[cat]) live[cat]=[];
        live[cat].push({ id, name, type, _raw:v });
      }
    } catch(e){}
    return live;
  }

  // ---------- block usage counter ----------
  function blockUsesVariable(block, varId, seen = new Set()) {
    if (!block || seen.has(block.id)) return false;
    seen.add(block.id);

    // Check if block itself is a variable reference
    if (block.fields && block.fields.VAR && block.fields.VAR.id === varId) return true;

    // Recurse into inputs
    if (block.inputList) {
      for (const input of block.inputList) {
        if (input.connection && input.connection.targetBlock) {
          const child = input.connection.targetBlock();
          if (blockUsesVariable(child, varId, seen)) return true;
        }
      }
    }

    // Recurse into next blocks
    if (block.nextConnection && block.nextConnection.targetBlock) {
      const next = block.nextConnection.targetBlock();
      if (blockUsesVariable(next, varId, seen)) return true;
    }

    return false;
  }

  // ---------- modal ----------
  let modalOverlay = null;
  function removeModal(){ if(modalOverlay){ try{modalOverlay.remove();}catch(e){} modalOverlay=null;} }

  // --- add variable ---
  function openAdd() {
    const ws = getMainWorkspaceSafe();
    if (!ws) return;

    const id = makeNextSequentialIdFromWorkspace();
    const name = `var_${id}`;
    createWorkspaceVariable(ws, name, "Global", id);
    openModal();
  }

  // --- edit variable ---
  function openEdit(varObj) {
    const ws = getMainWorkspaceSafe();
    if (!ws || !varObj) return;

    const editOverlay = document.createElement("div");
    editOverlay.className = "ev-overlay";

    const modal = document.createElement("div");
    modal.className = "ev-modal";
    editOverlay.appendChild(modal);

    const title = document.createElement("div");
    title.className = "ev-title";
    title.innerText = `Edit Variable: ${varObj.name}`;
    modal.appendChild(title);

    const input = document.createElement("input");
    input.className = "ev-input";
    input.value = varObj.name;
    modal.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "ev-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "ev-btn ev-add";
    saveBtn.innerText = "Save";
    saveBtn.onclick = () => {
      const newName = input.value.trim();
      if (!newName) return alert("Variable name cannot be empty!");
      renameWorkspaceVariable(ws, varObj._raw || varObj, newName);
      document.body.removeChild(editOverlay);
      openModal();
    };
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ev-btn ev-del";
    cancelBtn.innerText = "Cancel";
    cancelBtn.onclick = () => document.body.removeChild(editOverlay);
    actions.appendChild(cancelBtn);

    modal.appendChild(actions);
    document.body.appendChild(editOverlay);
  }

  // --- main modal ---
  function openModal() {
    removeModal();
    const ws = getMainWorkspaceSafe();
    const live = getLiveRegistry();
    const usageCounts = {};

    if (ws) {
      const allBlocks = ws.getAllBlocks ? ws.getAllBlocks() : [];
      for (const cat of CATEGORIES) {
        for (const v of live[cat] || []) {
          let count = 0;
          for (const block of allBlocks) {
            if (blockUsesVariable(block, v.id)) count++;
          }
          usageCounts[v.id] = count;
        }
      }
    }

    modalOverlay = document.createElement("div"); modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div"); modal.className = "ev-modal"; modalOverlay.appendChild(modal);

    // header
    const top = document.createElement("div"); top.className = "ev-top";
    const title = document.createElement("div"); title.className = "ev-title"; title.innerText = "Extended Variable Manager"; top.appendChild(title);
    const topActions = document.createElement("div"); 
    const closeBtn = document.createElement("button"); closeBtn.className = "ev-btn ev-del"; closeBtn.innerText = "Close"; 
    closeBtn.onclick = () => removeModal(); 
    topActions.appendChild(closeBtn); 
    top.appendChild(topActions); 
    modal.appendChild(top);

    // content
    const content = document.createElement("div"); content.className = "ev-content"; modal.appendChild(content);
    const left = document.createElement("div"); left.className = "ev-cats";
    const center = document.createElement("div"); center.className = "ev-list";
    const right = document.createElement("div"); right.className = "ev-details"; 
    right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
    content.appendChild(left); content.appendChild(center); content.appendChild(right);

    let currentCategory = CATEGORIES[0];
    function getCount(cat) { return (live[cat] || []).length; }

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
      const addBtn = document.createElement("button"); addBtn.className = "ev-btn ev-add"; addBtn.innerText = "Add"; addBtn.onclick = openAdd; header.appendChild(addBtn); center.appendChild(header);

      const arr = live[currentCategory] || [];
      if (arr.length === 0) { const empty = document.createElement("div"); empty.className = "ev-muted"; empty.innerText = "(no variables)"; center.appendChild(empty); return; }

      for (const v of arr) {
        const row = document.createElement("div"); row.className = "ev-row";
        const leftCol = document.createElement("div"); leftCol.style.display = "flex"; leftCol.style.flexDirection = "column";
        const usedCount = usageCounts[v.id] || 0;
        leftCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${usedCount})</div>`;

        const rightCol = document.createElement("div");
        const editBtn = document.createElement("button"); editBtn.className = "ev-btn ev-edit"; editBtn.style.marginRight = "6px"; editBtn.innerText = "Edit"; editBtn.onclick = () => openEdit(v);
        const delBtn = document.createElement("button"); delBtn.className = "ev-btn ev-del"; delBtn.innerText = "Delete"; delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          try { const ws = getMainWorkspaceSafe(); if (ws) { deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name); } } catch (e) { console.warn(e); }
          rebuildCategories(); rebuildList(); right.innerHTML = "<div style='font-weight:700;margin-bottom:8px'>Details</div>";
        };
        rightCol.appendChild(editBtn); rightCol.appendChild(delBtn); row.appendChild(leftCol); row.appendChild(rightCol); center.appendChild(row);
      }
    }

    rebuildCategories(); rebuildList();
    modalOverlay.addEventListener("click", (ev) => { if (ev.target === modalOverlay) removeModal(); });
    document.body.appendChild(modalOverlay);
  }

  // ---------- context menu ----------
  function registerContextMenuItem(){
    try{
      const reg=(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry)?_Blockly.ContextMenuRegistry.registry
               :(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry)?Blockly.ContextMenuRegistry.registry:null;
      if(reg && typeof reg.register==="function"){
        const item={
          id:"manageExtendedVariables",
          displayText:"Manage Variables",
          preconditionFn:()=> "enabled",
          callback:()=>openModal(),
          scopeType:(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry)?_Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                   :(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry)?Blockly.ContextMenuRegistry.ScopeType.WORKSPACE:null,
          weight:98
        };
        try{ if(reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); }catch(e){}
        reg.register(item); console.log("[ExtVars] Registered context menu item via ContextMenuRegistry"); return;
      }
    }catch(e){ console.warn("[ExtVars] ContextMenuRegistry registration failed:",e); }

    (function domFallback(){
      document.addEventListener("contextmenu",()=>{
        setTimeout(()=>{
          const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu"); if(!menu) return;
          if(menu.querySelector("[data-extvars]")) return;
          const el=document.createElement("div"); el.setAttribute("data-extvars","1"); el.style.padding="6px 10px"; el.style.cursor="pointer"; el.style.color="#e9eef2"; el.textContent="Manage Variables"; el.addEventListener("click",()=>{ openModal(); try{menu.style.display="none";}catch(e){} }); menu.appendChild(el);
        },40);
      });
    })();
  }

  function initialize(){ registerContextMenuItem(); if(plugin) plugin.openManager=openModal; console.info("[ExtVars] Live Extended Variable Manager initialized (workspace-only)."); }
  setTimeout(initialize,900);

})();
