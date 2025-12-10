// BF6 Extended Variable Manager - live workspace-only (fixed In Use counter)
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

  // ---------- workspace helpers ----------
  function getMainWorkspaceSafe() {
    if (typeof _Blockly !== "undefined" && typeof _Blockly.getMainWorkspace === "function") return _Blockly.getMainWorkspace();
    if (typeof Blockly !== "undefined" && typeof Blockly.getMainWorkspace === "function") return Blockly.getMainWorkspace();
    console.error("[ExtVars] ERROR: No Blockly workspace found!");
    return null;
  }

  function workspaceGetVariables(ws) {
    try {
      if (!ws) return [];
      if (ws.getAllVariables) return ws.getAllVariables();
      if (ws.getVariableMap && ws.getVariableMap().getVariables) return ws.getVariableMap().getVariables();
      if (ws.variableMap && Array.isArray(ws.variableMap.variables)) return ws.variableMap.variables;
    } catch (e) {}
    return [];
  }

  function getVarId(v) { try { return v?.id ?? (v.getId ? v.getId() : null); } catch (e) { return null; } }
  function getVarName(v) { try { return v?.name ?? (v.getName ? v.getName() : null); } catch(e) { return null; } }
  function getVarType(v) { try { return v?.type ?? (v.getType ? v.getType() : "Global"); } catch(e) { return "Global"; } }

  function makeNextSequentialIdFromWorkspace() {
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

  // ---------- count variable usage ----------
  function countVariableUsage(ws, varDef) {
    if (!ws || !varDef) return 0;
    const allBlocks = ws.getAllBlocks ? ws.getAllBlocks() : [];
    const targetId = varDef.id;
    const targetName = varDef.name;
    let count = 0;

    for (const block of allBlocks) {
      let matched = false;

      // variableReferenceBlock exact match
      if (block.type === "variableReferenceBlock" && block.fields?.VAR) {
        if ((block.fields.VAR.id && block.fields.VAR.id === targetId) ||
            (block.fields.VAR.name && block.fields.VAR.name === targetName)) matched = true;
      }

      // GetVariable / SetVariable match (once per block)
      if (!matched && (block.type === "GetVariable" || block.type === "SetVariable")) {
        const text = block.toString ? block.toString() : "";
        if (text.includes(targetName)) matched = true;
      }

      if (matched) count++;
    }

    console.log(`[ExtVars] "${targetName}" usage: ${count}`);
    return count;
  }

  // ---------- modal / UI ----------
  let modalOverlay = null;
  function removeModal(){ if(modalOverlay){ try{modalOverlay.remove();}catch(e){} modalOverlay=null;} }

  function openModal() {
    removeModal();
    const ws = getMainWorkspaceSafe();
    if (!ws) return;

    const live = getLiveRegistry();

    // --- UI elements ---
    modalOverlay = document.createElement("div"); modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div"); modal.className = "ev-modal"; modalOverlay.appendChild(modal);

    // header
    const top = document.createElement("div"); top.className = "ev-top";
    const title = document.createElement("div"); title.className = "ev-title"; title.innerText = "Extended Variable Manager"; top.appendChild(title);
    const topActions = document.createElement("div");
    const closeBtn = document.createElement("button"); closeBtn.className="ev-btn ev-del"; closeBtn.innerText="Close"; closeBtn.onclick=()=>removeModal();
    topActions.appendChild(closeBtn); top.appendChild(topActions); modal.appendChild(top);

    // content
    const content = document.createElement("div"); content.className="ev-content"; modal.appendChild(content);
    const left = document.createElement("div"); left.className="ev-cats";
    const center = document.createElement("div"); center.className="ev-list";
    const right = document.createElement("div"); right.className="ev-details"; 
    right.innerHTML="<div style='font-weight:700;margin-bottom:8px'>Details</div>";
    content.appendChild(left); content.appendChild(center); content.appendChild(right);

    let currentCategory = CATEGORIES[0];

    function rebuildCategories() {
      left.innerHTML="";
      for (const cat of CATEGORIES) {
        const el = document.createElement("div"); el.className="ev-cat";
        if (cat===currentCategory) el.classList.add("selected");
        el.innerHTML=`<span style="font-weight:600">${cat}</span><span class="ev-muted">${(live[cat]||[]).length}</span>`;
        el.onclick=()=>{ currentCategory=cat; rebuildCategories(); rebuildList(); right.innerHTML="<div style='font-weight:700;margin-bottom:8px'>Details</div>"; };
        left.appendChild(el);
      }
    }

    function rebuildList() {
      const fresh = getLiveRegistry(); Object.assign(live,fresh);
      center.innerHTML="";
      const header=document.createElement("div"); header.style.display="flex"; header.style.justifyContent="space-between"; header.style.alignItems="center"; header.style.marginBottom="8px";
      const h=document.createElement("div"); h.innerHTML=`<strong>${currentCategory} Variables</strong><div class="ev-muted">Total: ${(live[currentCategory]||[]).length}</div>`; header.appendChild(h);
      const addBtn=document.createElement("button"); addBtn.className="ev-btn ev-add"; addBtn.innerText="Add";
      addBtn.onclick=()=>{
        const name=prompt("Enter variable name:"); if(!name) return;
        const id=makeNextSequentialIdFromWorkspace();
        try { ws.createVariable(name,currentCategory,id); } catch(e){}
        rebuildCategories(); rebuildList();
      };
      header.appendChild(addBtn); center.appendChild(header);

      const arr = live[currentCategory]||[];
      if(arr.length===0){ const empty=document.createElement("div"); empty.className="ev-muted"; empty.innerText="(no variables)"; center.appendChild(empty); return; }

      for(const v of arr){
        const row=document.createElement("div"); row.className="ev-row";
        const leftCol=document.createElement("div"); leftCol.style.display="flex"; leftCol.style.flexDirection="column";
        const usedCount = countVariableUsage(ws,v);
        leftCol.innerHTML=`<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${usedCount})</div>`;

        const rightCol=document.createElement("div");
        const editBtn=document.createElement("button"); editBtn.className="ev-btn ev-edit"; editBtn.style.marginRight="6px"; editBtn.innerText="Edit";
        editBtn.onclick=()=>{
          const newName=prompt("Enter new name for variable:",v.name); if(!newName) return;
          if(v._raw?.name!==undefined) v._raw.name=newName;
          rebuildCategories(); rebuildList();
        };
        const delBtn=document.createElement("button"); delBtn.className="ev-btn ev-del"; delBtn.innerText="Delete";
        delBtn.onclick=()=>{
          if(!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          try { ws.deleteVariableById(v.id); } catch(e){}
          rebuildCategories(); rebuildList(); right.innerHTML="<div style='font-weight:700;margin-bottom:8px'>Details</div>";
        };
        rightCol.appendChild(editBtn); rightCol.appendChild(delBtn); row.appendChild(leftCol); row.appendChild(rightCol); center.appendChild(row);
      }
    }

    rebuildCategories(); rebuildList();
    modalOverlay.addEventListener("click",(ev)=>{ if(ev.target===modalOverlay) removeModal(); });
    document.body.appendChild(modalOverlay);
  }

  // ---------- context menu ----------
  function registerContextMenuItem(){
    try{
      const reg=(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry?.registry)?_Blockly.ContextMenuRegistry.registry
               :(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry?.registry)?Blockly.ContextMenuRegistry.registry:null;
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

    // fallback
    (function domFallback(){
      document.addEventListener("contextmenu",()=>{
        setTimeout(()=>{
          const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu"); if(!menu) return;
          if(menu.querySelector("[data-extvars]")) return;
          const el=document.createElement("div"); el.setAttribute("data-extvars","1"); el.style.padding="6px 10px"; el.style.cursor="pointer"; el.style.color="#e9eef2"; el.textContent="Manage Variables";
          el.addEventListener("click",()=>{ openModal(); try{menu.style.display="none";}catch(e){} });
          menu.appendChild(el);
        },40);
      });
    })();
  }

  function initialize(){ registerContextMenuItem(); if(plugin) plugin.openManager=openModal; console.info("[ExtVars] Live Extended Variable Manager initialized (workspace-only)."); }
  setTimeout(initialize,900);

})();
