// BF6 Extended Variable Manager
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  let plugin = null;
  let dragEl = null;
  let placeholder = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins?.getPlugin) {
      plugin = BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID };
    } else {
      plugin = { id: PLUGIN_ID };
    }
  } catch (e) { plugin = { id: PLUGIN_ID }; }

  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

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

  function countVariableUsage(ws, varDef) {
    if (!ws || !varDef) return 0;
    const allBlocks = ws.getAllBlocks ? ws.getAllBlocks() : [];
    const targetId = getVarId(varDef);
    let count = 0;
    for (const block of allBlocks) {
      if (!block) continue;
      const varField = block.getField && block.getField("VAR");
      if (!varField) continue;
      try {
        const val = varField.getValue?.();
        if (val === targetId) {
          count++;
        }
      } catch (e) {}
    }
    return count;
  }

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
        if (varObj && varObj.name === newName) {
          varField.setValue(val);
          block.render?.();
          changed++;
        }
      } catch (e) {}
    });
    // dummy variable to trigger save
    try {
      const dummyId = "EXTVARS_DUMMY_" + Date.now();
      const dummyVar = createWorkspaceVariable(ws, "__EXTVARS_DUMMY__", "Global", dummyId);
      if (dummyVar) deleteWorkspaceVariable(ws, dummyId);
    } catch (e) {}
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

  function openModal() {
    const ws = getMainWorkspaceSafe();
    if (!ws) return;
    const live = getLiveRegistry();

    let modalOverlay = document.createElement("div");
    modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div");
    modal.className = "ev-modal";
    modalOverlay.appendChild(modal);

    // ---------- header ----------
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
    closeBtn.onclick = () => modalOverlay.remove();
    topActions.appendChild(closeBtn);
    top.appendChild(topActions);
    modal.appendChild(top);

    // ---------- content ----------
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
      center.innerHTML = "";
      const arr = live[currentCategory] || [];
      if (!arr.length) { const empty = document.createElement("div"); empty.className="ev-muted"; empty.innerText="(no variables)"; center.appendChild(empty); return; }

      arr.forEach(v => {
        const row = document.createElement("div");
        row.className = "ev-row";
        row.dataset.id = v.id;

        const leftCol = document.createElement("div");
        leftCol.style.display = "flex";
        leftCol.style.flexDirection = "column";
        const usedCount = countVariableUsage(ws,v);
        leftCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${usedCount})</div>`;

        const rightCol = document.createElement("div");
        const editBtn = document.createElement("button");
        editBtn.className = "ev-btn ev-edit"; editBtn.style.marginRight="6px"; editBtn.innerText="Edit";
        editBtn.onclick = () => {
          const newName = prompt("Enter new name for variable:", v.name);
          if (!newName) return;
          const oldName = v.name;
          renameWorkspaceVariable(ws,v._raw,newName);
          updateBlocksForVariableRename(oldName,newName,ws);
          rebuildCategories(); rebuildList();
        };
        const delBtn = document.createElement("button");
        delBtn.className = "ev-btn ev-del"; delBtn.innerText="Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          deleteWorkspaceVariable(ws,v.id) || deleteWorkspaceVariable(ws,v.name);
          rebuildCategories(); rebuildList();
        };
        rightCol.appendChild(editBtn); rightCol.appendChild(delBtn);
        row.appendChild(leftCol); row.appendChild(rightCol);
        center.appendChild(row);

        // ---------- drag & drop ----------
        row.addEventListener("mousedown", e => {
          if (e.target.closest(".ev-btn")) return;
          e.preventDefault();
          dragEl = row;

          placeholder = document.createElement("div");
          placeholder.className="ev-row";
          placeholder.style.height=row.offsetHeight+"px";
          placeholder.style.background="#2a2a2a";
          placeholder.style.border="1px dashed #888";
          row.parentNode.insertBefore(placeholder,row.nextSibling);

          const rect=row.getBoundingClientRect();
          row.style.position="fixed"; row.style.top=rect.top+"px"; row.style.left=rect.left+"px";
          row.style.width=rect.width+"px"; row.style.zIndex="9999"; row.style.pointerEvents="none"; row.style.opacity="0.85";
          document.body.appendChild(row);

          function moveAt(clientY){ row.style.top=(clientY-row.offsetHeight/2)+"px"; }
          function onMouseMove(e){
            moveAt(e.clientY);
            const rows=Array.from(center.querySelectorAll(".ev-row")).filter(r=>r!==placeholder);
            for (const r of rows){
              const rRect=r.getBoundingClientRect();
              if (e.clientY < rRect.top+rRect.height/2){ center.insertBefore(placeholder,r); break; }
              else { center.appendChild(placeholder); }
            }
          }
          document.addEventListener("mousemove",onMouseMove);
          document.addEventListener("mouseup",()=>{
            document.removeEventListener("mousemove",onMouseMove);
            center.insertBefore(dragEl,placeholder);
            dragEl.style.position=""; dragEl.style.top=""; dragEl.style.left=""; dragEl.style.width=""; dragEl.style.zIndex=""; dragEl.style.pointerEvents=""; dragEl.style.opacity="";
            placeholder.remove(); placeholder=null; dragEl=null;
            applyNewOrder();
          },{once:true});
        });
      });
    }

    // ---------- new reorder function ----------
    function applyNewOrder(){
      const ws=getMainWorkspaceSafe();
      if(!ws) return;
      const rows=Array.from(center.querySelectorAll(".ev-row"));
      const newOrder=rows.map(r=>live[currentCategory].find(v=>v.id===r.dataset.id)).filter(Boolean);
      live[currentCategory]=newOrder;

      try{
        const map=workspaceGetVariableMap(ws);
        if(!map) return;
        if(map.variableList) map.variableList=map.variableList.map(v=>((getVarType(v)||"Global")===currentCategory)?(newOrder.find(o=>getVarId(o)===getVarId(v))||v):v);
        if(map.variables) map.variables=map.variables.map(v=>((getVarType(v)||"Global")===currentCategory)?(newOrder.find(o=>getVarId(o)===getVarId(v))||v):v);
        if(map.variableMap_ && map.variableMap_[currentCategory]) map.variableMap_[currentCategory]=newOrder.map(v=>v._raw||v);

        const dummyId="EXTVARS_DUMMY_"+Date.now();
        const dummyVar=createWorkspaceVariable(ws,"__EXTVARS_DUMMY__","Global",dummyId);
        if(dummyVar) deleteWorkspaceVariable(ws,dummyId);

        rebuildCategories(); rebuildList();
        console.log(`[ExtVars] Reordered category "${currentCategory}" successfully`);
      } catch(e){ console.warn("[ExtVars] applyNewOrder error:",e); }
    }

    rebuildCategories(); rebuildList();
    modalOverlay.addEventListener("click",ev=>{ if(ev.target===modalOverlay) modalOverlay.remove(); });
    document.body.appendChild(modalOverlay);
  }

  function registerContextMenuItem() {
    try{
      const reg=(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry?.registry)?_Blockly.ContextMenuRegistry.registry
               :(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry?.registry)?Blockly.ContextMenuRegistry.registry:null;
      if(reg && typeof reg.register==="function"){
        const item={ id:"manageExtendedVariables", displayText:"Manage Variables", preconditionFn:()=> "enabled", callback:()=>openModal(), scopeType:(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry)?_Blockly.ContextMenuRegistry.ScopeType.WORKSPACE:(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry)?Blockly.ContextMenuRegistry.ScopeType.WORKSPACE:null, weight:98};
        try{ if(reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); }catch(e){}
        reg.register(item); return;
      }
    }catch(e){}
    // fallback
    document.addEventListener("contextmenu",()=>{
      setTimeout(()=>{
        const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu"); if(!menu) return;
        if(menu.querySelector("[data-extvars]")) return;
        const el=document.createElement("div"); el.setAttribute("data-extvars","1"); el.style.padding="6px 10px"; el.style.cursor="pointer"; el.style.color="#e9eef2"; el.textContent="Manage Variables"; el.addEventListener("click",()=>{ openModal(); try{menu.style.display="none";}catch(e){} }); menu.appendChild(el);
      },40);
    });
  }

  function initialize(){ registerContextMenuItem(); if(plugin) plugin.openManager=openModal; console.info("[ExtVars] Live Extended Variable Manager initialized."); }
  setTimeout(initialize,900);

  window._getMainWorkspaceSafe = getMainWorkspaceSafe;
  window._updateBlocksForVariableRename = updateBlocksForVariableRename;

})();
