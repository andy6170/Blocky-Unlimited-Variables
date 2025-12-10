// BF6 Extended Variable Manager - live workspace-only (refactored)
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";
  const DEBUG = true;

  const debugLog = (...args) => { if (DEBUG) console.log("[ExtVars]", ...args); };

  // ------------------ defensive plugin handle ------------------
  let plugin = null;
  try {
    plugin = (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins?.getPlugin)
      ? BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID }
      : { id: PLUGIN_ID };
  } catch (e) { plugin = { id: PLUGIN_ID }; }

  // ------------------ categories ------------------
  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  // ------------------ helpers ------------------
  function safeGet(obj, fn, fallback = null) {
    try { return fn(obj); } catch(e) { return fallback; }
  }

  function getMainWorkspaceSafe() {
    return safeGet(window, _ => 
      (typeof _Blockly !== "undefined" && _Blockly.getMainWorkspace?.()) ||
      (typeof Blockly !== "undefined" && Blockly.getMainWorkspace?.()) ||
      (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace?.())
    );
  }

  function workspaceGetVariableMap(ws) {
    return safeGet(ws, w => w.getVariableMap?.() || w.variableMap, null);
  }

  function workspaceGetVariables(ws) {
    const map = workspaceGetVariableMap(ws);
    if (!map) return [];
    return map.getVariables?.() || map.getAllVariables?.() || Array.isArray(map.variables) ? map.variables : [];
  }

  function getVarId(v) { return safeGet(v, o => o.id ?? o.getId?.(), null); }
  function getVarName(v) { return safeGet(v, o => o.name ?? o.getName?.(), null); }
  function getVarType(v) { return safeGet(v, o => o.type ?? o.getType?.(), "Global"); }

  function createWorkspaceVariable(ws, name, type, id) {
    const map = workspaceGetVariableMap(ws);
    return safeGet(null, _ => map?.createVariable(name, type || "", id) || ws?.createVariable(name, type || "", id) || Blockly?.Variables?.createVariable(ws, name, type || "", id), null);
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    const map = workspaceGetVariableMap(ws);
    if (!map) return false;
    try {
      return map.deleteVariableById?.(idOrName) || map.deleteVariable?.(idOrName) || map.removeVariable?.(idOrName) ||
        (() => { 
          const vs = map.getVariables?.(); 
          const idx = vs?.findIndex(v => getVarId(v) === idOrName || getVarName(v) === idOrName); 
          if(idx >= 0){ vs.splice(idx,1); return true; } 
          return false; 
        })();
    } catch(e) { console.warn("[ExtVars] deleteWorkspaceVariable error:", e); return false; }
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    const map = workspaceGetVariableMap(ws);
    if (!map) return false;
    const id = getVarId(varObj);
    let found = safeGet(null, _ => map.getVariableById?.(id) || map.getVariable(id) || map.getVariable(getVarName(varObj)), null);
    if(found){ try { found.name = newName; return true; } catch(e){} }
    if(varObj?.name !== undefined){ varObj.name = newName; return true; }
    return false;
  }

  // ------------------ update blocks ------------------
  function updateBlocksForVariableRename(oldName, newName, ws) {
    if(!ws) return;

    const varBlocks = ws.getAllBlocks(false).filter(b => b?.getField?.("VAR"));
    let changed = 0;

    for(const block of varBlocks){
      try {
        const val = block.getField("VAR").getValue?.();
        const varObj = ws.getVariableById?.(val);
        if(varObj && varObj.name === newName){
          block.getField("VAR").setValue(val);
          block.render?.();
          changed++;
        }
      } catch(e) { console.warn("[ExtVars] Block update error:", e); }
    }

    debugLog(`Rename complete: ${changed} blocks updated.`);

    // ------------------ dummy variable to trigger save ------------------
    try {
      const dummyName = "__EXTVARS_DUMMY__";
      const dummyId = "EXTVARS_DUMMY_" + Date.now();
      const dummyVar = createWorkspaceVariable(ws, dummyName, "Global", dummyId);
      if(dummyVar) deleteWorkspaceVariable(ws, dummyId) || deleteWorkspaceVariable(ws, dummyName);
      debugLog("Dummy variable added & deleted to trigger save.");
    } catch(e){ console.warn("[ExtVars] Dummy variable trick failed:", e); }
  }

  // ------------------ sequential IDs ------------------
  function makeNextSequentialIdFromWorkspace() {
    const ws = getMainWorkspaceSafe();
    const vars = workspaceGetVariables(ws);
    let max = 0;
    for(const v of vars){
      const id = getVarId(v);
      if(typeof id === "string" && id.startsWith("EV_")){
        const n = parseInt(id.slice(3),10);
        if(!isNaN(n) && n>max) max=n;
      }
    }
    return "EV_" + String(max+1).padStart(4,"0");
  }

  // ------------------ live registry ------------------
  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    CATEGORIES.forEach(c => live[c]=[]);
    try {
      for(const v of workspaceGetVariables(ws)){
        const id = getVarId(v), name = getVarName(v), type = getVarType(v);
        const cat = typeof type==="string"? type : "Global";
        if(!live[cat]) live[cat]=[];
        live[cat].push({ id, name, type, _raw:v });
      }
    } catch(e){}
    return live;
  }

  // ------------------ nested check ------------------
  function isNestedInside(block, parent) {
    if(!parent?.inputList) return false;
    return parent.inputList.some(input => input.connection?.targetBlock_ === block);
  }

  // ------------------ count variable usage ------------------
  function countVariableUsage(ws, varDef) {
    if(!ws || !varDef) return 0;
    const allBlocks = ws.getAllBlocks?.() || [];
    const targetId = getVarId(varDef);
    let count = 0;

    debugLog(`\n===== FULL DEBUG START for variable: "${getVarName(varDef)}" (type: ${getVarType(varDef)}) =====`);

    for(const block of allBlocks){
      const varField = block.getField?.("VAR");
      if(!varField) continue;

      try {
        const val = varField.getValue?.();
        if(val !== targetId) continue;

        let nested = allBlocks.some(parent => parent !== block && isNestedInside(block,parent));
        if(!nested){
          count++;
          debugLog(`• COUNTED block: ${block.type} (id=${block.id})`);
        } else {
          debugLog(`• SKIPPED nested block: ${block.type} (id=${block.id})`);
        }
      } catch(e){ console.warn("[ExtVars] Variable count check error:", e); }
    }

    debugLog(`===== FINAL COUNT for "${getVarName(varDef)}": ${count} =====\n`);
    return count;
  }

  // ------------------ modal UI & rebuild ------------------
  function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .ev-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999999}
      .ev-modal{width:min(1100px,94vw);height:min(760px,90vh);background:#1a1a1a;border-radius:10px;padding:14px;display:flex;flex-direction:column;color:#e9eef2;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,0.75)}
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
      .ev-muted{color:#cdcdcd;font-size:14px}
      .ev-details{width:320px;background:#121214;border-radius:8px;padding:10px;overflow:auto}
      .ev-input{width:100%;padding:8px;border-radius:6px;border:1px solid #222;background:#0b0b0c;color:#e9eef2;margin-bottom:8px}
      .ev-actions{display:flex;justify-content:flex-end;margin-top:10px;gap:8px}
      .ev-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .ev-title{font-weight:700;font-size:24px}
    `;
    document.head.appendChild(style);
  }
  injectStyle();

  // ------------------ modal logic ------------------
  let modalOverlay = null;
  function removeModal(){ modalOverlay?.remove(); modalOverlay = null; }

  function openModal() {
    removeModal();
    const ws = getMainWorkspaceSafe();
    const live = getLiveRegistry();

    modalOverlay = document.createElement("div"); modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div"); modal.className = "ev-modal"; modalOverlay.appendChild(modal);

    // header
    const top = document.createElement("div"); top.className="ev-top";
    const title = document.createElement("div"); title.className="ev-title"; title.innerText="Advanced Variable Manager"; top.appendChild(title);
    const topActions = document.createElement("div");
    const closeBtn = document.createElement("button"); closeBtn.className="ev-btn ev-del"; closeBtn.innerText="Close"; closeBtn.onclick=removeModal;
    topActions.appendChild(closeBtn); top.appendChild(topActions); modal.appendChild(top);

    // content
    const content = document.createElement("div"); content.className="ev-content"; modal.appendChild(content);
    const left = document.createElement("div"); left.className="ev-cats";
    const center = document.createElement("div"); center.className="ev-list";
    content.append(left, center);

    let currentCategory = CATEGORIES[0];

    function rebuildCategories() {
      left.innerHTML="";
      const fresh = getLiveRegistry(); Object.assign(live, fresh);
      for(const cat of CATEGORIES){
        const el = document.createElement("div"); el.className="ev-cat"; if(cat===currentCategory) el.classList.add("selected");
        el.innerHTML=`<span style="font-weight:600">${cat}</span><span class="ev-muted">${live[cat]?.length||0}</span>`;
        el.onclick=()=>{ currentCategory=cat; rebuildCategories(); rebuildList(); };
        left.appendChild(el);
      }
    }

    function rebuildList() {
      center.innerHTML="";
      const fresh = getLiveRegistry(); Object.assign(live, fresh);
      const header = document.createElement("div"); header.style.display="flex"; header.style.justifyContent="space-between"; header.style.alignItems="center"; header.style.marginBottom="8px";
      const h = document.createElement("div"); h.innerHTML=`<strong>${currentCategory} Variables</strong><span class="ev-muted"> Total: ${live[currentCategory]?.length||0}</span>`; header.appendChild(h);
      const addBtn = document.createElement("button"); addBtn.className="ev-btn ev-add"; addBtn.innerText="Add"; 
      addBtn.onclick=()=>{
        const name=prompt("Enter variable name:"); if(!name) return;
        const id=makeNextSequentialIdFromWorkspace();
        createWorkspaceVariable(ws,name,currentCategory,id);
        rebuildCategories(); rebuildList();
      };
      header.appendChild(addBtn); center.appendChild(header);

      const arr = live[currentCategory]||[];
      if(arr.length===0){ const empty=document.createElement("div"); empty.className="ev-muted"; empty.innerText="(no variables)"; center.appendChild(empty); return; }

      for(const v of arr){
        const row=document.createElement("div"); row.className="ev-row";
        const leftCol=document.createElement("div"); leftCol.style.display="flex"; leftCol.style.flexDirection="column";
        leftCol.innerHTML=`<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${countVariableUsage(ws,v)})</div>`;
        const rightCol=document.createElement("div");
        const editBtn=document.createElement("button"); editBtn.className="ev-btn ev-edit"; editBtn.style.marginRight="6px"; editBtn.innerText="Edit";
        editBtn.onclick=()=>{
          const newName=prompt("Enter new name for variable:",v.name); if(!newName) return;
          const oldName=v.name;
          renameWorkspaceVariable(ws,v._raw,newName);
          updateBlocksForVariableRename(oldName,newName,ws);
          rebuildCategories(); rebuildList();
        };
        const delBtn=document.createElement("button"); delBtn.className="ev-btn ev-del"; delBtn.innerText="Delete";
        delBtn.onclick=()=>{
          if(!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          deleteWorkspaceVariable(ws,v.id)||deleteWorkspaceVariable(ws,v.name);
          rebuildCategories(); rebuildList();
        };
        rightCol.append(editBtn,delBtn); row.append(leftCol,rightCol); center.appendChild(row);
      }
    }

    rebuildCategories(); rebuildList();
    modalOverlay.addEventListener("click",(ev)=>{ if(ev.target===modalOverlay) removeModal(); });
    document.body.appendChild(modalOverlay);
  }

  // ------------------ context menu ------------------
  function registerContextMenuItem(){
    const reg = (typeof _Blockly!=="undefined" && _Blockly.ContextMenuRegistry?.registry)
      ? _Blockly.ContextMenuRegistry.registry
      : (typeof Blockly!=="undefined" && Blockly.ContextMenuRegistry?.registry)
      ? Blockly.ContextMenuRegistry.registry : null;

    if(reg && typeof reg.register==="function"){
      const item = {
        id:"manageExtendedVariables",
        displayText:"Manage Variables",
        preconditionFn:()=> "enabled",
        callback: openModal,
        scopeType: reg.ScopeType?.WORKSPACE || null,
        weight:98
      };
      try{ if(reg.getItem?.(item.id)) reg.unregister(item.id); }catch(e){}
      reg.register(item); debugLog("Registered context menu item via ContextMenuRegistry"); return;
    }

    // fallback
    document.addEventListener("contextmenu",()=>{ setTimeout(()=>{
      const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu"); if(!menu) return;
      if(menu.querySelector("[data-extvars]")) return;
      const el=document.createElement("div"); el.setAttribute("data-extvars","1"); el.style.padding="6px 10px"; el.style.cursor="pointer"; el.style.color="#e9eef2"; el.textContent="Manage Variables";
      el.addEventListener("click",()=>{ openModal(); try{menu.style.display="none";}catch(e){} });
      menu.appendChild(el);
    },40); });
  }

  function initialize(){
    registerContextMenuItem();
    if(plugin) plugin.openManager=openModal;
    debugLog("Live Extended Variable Manager initialized (workspace-only).");
  }
  setTimeout(initialize,900);

  // ------------------ safe export for console ------------------
  window._getMainWorkspaceSafe = getMainWorkspaceSafe;
  window._updateBlocksForVariableRename = updateBlocksForVariableRename;

})();
