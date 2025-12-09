// Extended Variable Manager - Dark theme with BF6 accent (#ff0a03)
(function () {
  const pluginId = "bf-portal-extended-variable-manager";
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins && typeof BF2042Portal.Plugins.getPlugin === "function") {
      plugin = BF2042Portal.Plugins.getPlugin(pluginId) || { id: pluginId };
    } else {
      plugin = { id: pluginId };
    }
  } catch (e) {
    plugin = { id: pluginId };
  }

  const STORAGE_KEY = pluginId + "-data-v1";

  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  const THEME = {
    bg: "#0b0b0c",
    panel: "#0f0f10",
    sidebar: "#121214",
    sidebarHover: "#1a1b1d",
    sidebarSelectedBg: "rgba(255, 10, 3, 0.08)",
    accent: "#ff0a03",
    text: "#e9eef2",
    muted: "#9aa1a8",
    varRow: "#0e0e0f",
    btnGreen: "#2ca72c",
    btnGreenHover: "#34c934",
    btnGray: "#2b2b2b",
    btnGrayHover: "#3a3a3a",
    btnRed: "#a73232",
    btnRedHover: "#c93b3b"
  };

  let state = { nextIdCounter: 1, variables: {} };

  function ensureStateCategories() {
    for (const c of CATEGORIES) if (!state.variables[c]) state.variables[c] = [];
  }

  function saveState() {
    try {
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.saveToLocalStorage === "function") {
        BF2042Portal.Shared.saveToLocalStorage(STORAGE_KEY, state);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) { console.warn("[ExtVars] Save failed:", e); }
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
      if (loaded && typeof loaded === "object") state = Object.assign({}, state, loaded);
    } catch (e) { console.warn("[ExtVars] Load failed:", e); }

    ensureStateCategories();

    let max = state.nextIdCounter || 1;
    try {
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

  // --- Workspace Helpers ---
  function workspaceGetVariableMap(ws) { try { if(!ws) return null; if(typeof ws.getVariableMap==='function') return ws.getVariableMap(); if(ws.variableMap) return ws.variableMap; return null; } catch(e){return null;} }
  function workspaceHasVariableWithId(ws,id){try{const map=workspaceGetVariableMap(ws);if(!map)return false;if(map.getVariableById)return!!map.getVariableById(id);if(map.getVariables) return map.getVariables().some(v=>v.id===id);return false;}catch(e){return false;}}
  function workspaceHasVariableWithName(ws,name){try{const map=workspaceGetVariableMap(ws);if(!map)return false;if(map.getVariableByName)return!!map.getVariableByName(name);if(map.getVariables) return map.getVariables().some(v=>v.name===name);return false;}catch(e){return false;}}
  function createWorkspaceVariable(ws,name,type,id){try{const map=workspaceGetVariableMap(ws);if(map&&map.createVariable)return map.createVariable(name,type||"",id);if(ws.createVariable)return ws.createVariable(name,type||"",id);if(Blockly&&Blockly.Variables&&Blockly.Variables.createVariable)return Blockly.Variables.createVariable(ws,name,type||"",id);}catch(e){console.warn("[ExtVars] createWorkspaceVariable error:",e);}return null;}
  function deleteWorkspaceVariable(ws,idOrName){try{const map=workspaceGetVariableMap(ws);if(!map)return false;if(map.deleteVariable){try{map.deleteVariable(idOrName);return true}catch(e){}}return false;}catch(e){console.warn("[ExtVars] deleteWorkspaceVariable error:",e);return false;}

  }

  function makeNextSequentialId() {
    const id = "EV_" + String(state.nextIdCounter).padStart(4, "0");
    state.nextIdCounter += 1;
    return id;
  }

  // --- MODAL MANAGEMENT ---
  let modalOverlay = null;
  function removeModal() { if(modalOverlay){try{modalOverlay.remove();}catch(e){} modalOverlay=null;} }

  function openModal() {
    loadState();
    ensureStateCategories();
    const ws = getMainWorkspaceSafe();
    if(ws) registerAllVariablesInWorkspace(ws);

    removeModal();

    modalOverlay = document.createElement("div");
    modalOverlay.style.position = "fixed";
    modalOverlay.style.top="0"; modalOverlay.style.left="0"; modalOverlay.style.width="100%"; modalOverlay.style.height="100%";
    modalOverlay.style.background="rgba(0,0,0,0.62)";
    modalOverlay.style.zIndex="999999";
    modalOverlay.style.display="flex"; modalOverlay.style.alignItems="center"; modalOverlay.style.justifyContent="center";

    const modalEl = document.createElement("div");
    modalEl.style.width="min(1100px,92vw)";
    modalEl.style.height="min(720px,88vh)";
    modalEl.style.background=THEME.panel;
    modalEl.style.borderRadius="10px";
    modalEl.style.boxShadow="0 12px 48px rgba(0,0,0,0.75)";
    modalEl.style.color=THEME.text;
    modalEl.style.padding="14px";
    modalEl.style.overflow="hidden";
    modalEl.style.display="flex"; modalEl.style.flexDirection="column";
    modalEl.style.fontFamily="Inter, Arial, sans-serif";
    modalOverlay.appendChild(modalEl);

    const header = document.createElement("div");
    header.style.display="flex"; header.style.justifyContent="space-between"; header.style.alignItems="center"; header.style.marginBottom="10px";
    const title=document.createElement("div"); title.innerText="Extended Variable Manager"; title.style.fontSize="18px"; title.style.fontWeight="700";
    header.appendChild(title); modalEl.appendChild(header);

    const content=document.createElement("div"); content.style.display="flex"; content.style.flex="1 1 auto"; content.style.gap="12px"; content.style.overflow="hidden";
    modalEl.appendChild(content);

    const left=document.createElement("div"); left.style.width="240px"; left.style.background=THEME.sidebar; left.style.borderRadius="8px"; left.style.padding="10px"; left.style.overflowY="auto"; content.appendChild(left);
    const catTitle=document.createElement("div"); catTitle.innerText="Categories"; catTitle.style.fontWeight="700"; catTitle.style.marginBottom="8px"; left.appendChild(catTitle);
    const catList=document.createElement("div"); catList.style.display="flex"; catList.style.flexDirection="column"; catList.style.gap="6px"; left.appendChild(catList);

    const center=document.createElement("div"); center.style.flex="1 1 auto"; center.style.background=THEME.bg; center.style.borderRadius="8px"; center.style.padding="10px"; center.style.overflow="auto"; center.style.display="flex"; center.style.flexDirection="column"; content.appendChild(center);

    const right=document.createElement("div"); right.style.width="320px"; right.style.background=THEME.sidebar; right.style.borderRadius="8px"; right.style.padding="10px"; right.style.overflow="auto"; content.appendChild(right);
    const rightTitle=document.createElement("div"); rightTitle.innerText="Details"; rightTitle.style.fontWeight="700"; rightTitle.style.marginBottom="8px"; right.appendChild(rightTitle);
    const detailBox=document.createElement("div"); detailBox.style.color=THEME.text; right.appendChild(detailBox);

    const centerHeader=document.createElement("div"); centerHeader.style.display="flex"; centerHeader.style.justifyContent="space-between"; centerHeader.style.alignItems="center"; centerHeader.style.marginBottom="8px";
    const centerTitle=document.createElement("div"); centerTitle.innerText="Variables"; centerTitle.style.fontWeight="700";
    const addBtn=document.createElement("button"); addBtn.innerText="Add Variable"; addBtn.style.padding="6px 10px"; addBtn.style.border="none"; addBtn.style.borderRadius="6px"; addBtn.style.background=THEME.btnGreen; addBtn.style.color="#fff"; addBtn.style.cursor="pointer"; addBtn.onmouseenter=()=>addBtn.style.background=THEME.btnGreenHover; addBtn.onmouseleave=()=>addBtn.style.background=THEME.btnGreen;
    centerHeader.appendChild(centerTitle); centerHeader.appendChild(addBtn); center.appendChild(centerHeader);
    const varListContainer=document.createElement("div"); varListContainer.style.display="flex"; varListContainer.style.flexDirection="column"; varListContainer.style.gap="8px"; varListContainer.style.flex="1 1 auto"; varListContainer.style.minHeight="0"; varListContainer.style.overflow="auto"; center.appendChild(varListContainer);

    let currentCategory=CATEGORIES[0];

    function isDuplicateName(category,name,skipId){ const arr=state.variables[category]||[]; return arr.some(v=>v.name.toLowerCase()===name.toLowerCase() && v.id!==skipId); }

    function renderCategories(){ catList.innerHTML=""; for(const cat of CATEGORIES){ const btn=document.createElement("button"); btn.style.padding="8px"; btn.style.textAlign="left"; btn.style.border="none"; btn.style.borderRadius="6px"; btn.style.background=THEME.sidebar; btn.style.color=THEME.text; btn.style.cursor="pointer"; btn.style.display="flex"; btn.style.justifyContent="space-between"; btn.dataset.category=cat; btn.innerHTML=`<span style="font-weight:600">${cat}</span><span style="color:${THEME.muted}">${(state.variables[cat]||[]).length}</span>`; btn.onmouseenter=()=>{if(cat!==currentCategory)btn.style.background=THEME.sidebarHover;}; btn.onmouseleave=()=>{if(cat!==currentCategory)btn.style.background=THEME.sidebar;}; if(cat===currentCategory){btn.style.background=THEME.sidebarSelectedBg; btn.style.borderLeft=`4px solid ${THEME.accent}`;} else btn.style.borderLeft="4px solid transparent"; btn.onclick=()=>{currentCategory=cat; renderCategories(); renderVariables(); detailBox.innerHTML="";}; catList.appendChild(btn); } }

    function renderVariables(){ varListContainer.innerHTML=""; const arr=state.variables[currentCategory]||[]; if(arr.length===0){ const empty=document.createElement("div"); empty.style.color=THEME.muted; empty.innerText="(no variables)"; varListContainer.appendChild(empty); return; } for(const v of arr){ const row=document.createElement("div"); row.style.display="flex"; row.style.justifyContent="space-between"; row.style.alignItems="center"; row.style.padding="8px"; row.style.background=THEME.varRow; row.style.borderRadius="6px"; const leftCol=document.createElement("div"); leftCol.style.display="flex"; leftCol.style.flexDirection="column"; const name=document.createElement("div"); name.innerText=v.name; name.style.fontWeight="600"; const usage=document.createElement("div"); usage.style.fontSize="12px"; usage.style.color=THEME.muted; const usedCount=ws?countVariableUsage(ws,v):0; usage.innerText=`In use: (${usedCount})`; leftCol.appendChild(name); leftCol.appendChild(usage); const rightCol=document.createElement("div"); rightCol.style.display="flex"; rightCol.style.gap="6px"; const editBtn=document.createElement("button"); editBtn.innerText="Edit"; editBtn.style.padding="6px 8px"; editBtn.style.border="none"; editBtn.style.borderRadius="6px"; editBtn.style.background=THEME.btnGray; editBtn.style.color="#fff"; editBtn.style.cursor="pointer"; editBtn.onmouseenter=()=>editBtn.style.background=THEME.btnGrayHover; editBtn.onmouseleave=()=>editBtn.style.background=THEME.btnGray; editBtn.onclick=()=>openEditPanel(currentCategory,v); const delBtn=document.createElement("button"); delBtn.innerText="Delete"; delBtn.style.padding="6px 8px"; delBtn.style.border="none"; delBtn.style.borderRadius="6px"; delBtn.style.background=THEME.btnRed; delBtn.style.color="#fff"; delBtn.style.cursor="pointer"; delBtn.onmouseenter=()=>delBtn.style.background=THEME.btnRedHover; delBtn.onmouseleave=()=>delBtn.style.background=THEME.btnRed; delBtn.onclick=()=>{if(!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`))return; deleteVariable(currentCategory,v.id); saveState(); const ws2=getMainWorkspaceSafe(); resyncWorkspaceVariableMap(ws2); renderCategories(); renderVariables(); detailBox.innerHTML="";}; rightCol.appendChild(editBtn); rightCol.appendChild(delBtn); row.appendChild(leftCol); row.appendChild(rightCol); varListContainer.appendChild(row); } }

    addBtn.onclick=()=>{ const nm=prompt("New variable name (no duplicates):"); if(!nm)return; const t=nm.trim(); if(!t)return; if(isDuplicateName(currentCategory,t)){ alert("Duplicate name not allowed"); return; } const id=makeNextSequentialId(); const v={id,name:t,type:currentCategory}; state.variables[currentCategory].push(v); saveState(); const ws2=getMainWorkspaceSafe(); if(ws2){ createWorkspaceVariable(ws2,v.name,v.type,v.id); resyncWorkspaceVariableMap(ws2); } renderCategories(); renderVariables(); };

    renderCategories(); renderVariables();
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener("click",ev=>{if(ev.target===modalOverlay){try{const ws3=getMainWorkspaceSafe(); resyncWorkspaceVariableMap(ws3);}catch(e){} removeModal();}});

  }

  // --- CONTEXT MENU PATCH ---
  function injectContextMenu() {
    const ws = getMainWorkspaceSafe();
    if(!ws || !ws.showContextMenu_) return;
    const originalShow = ws.showContextMenu_.bind(ws);
    ws.showContextMenu_ = function(options){
      originalShow(options);
      try{
        const menuEl=document.querySelector(".blocklyContextMenu,.context-menu,.bp-context-menu");
        if(!menuEl) return;
        if(menuEl.querySelector("[data-extvars]")) return;
        const el=document.createElement("div");
        el.setAttribute("data-extvars","1");
        el.style.padding="8px 12px"; el.style.cursor="pointer"; el.style.color=THEME.text;
        el.style.background="transparent"; el.style.borderTop="1px solid rgba(255,255,255,0.03)";
        el.textContent="Manage Variables";
        el.onclick=()=>{ openModal(); try{ menuEl.style.display="none"; }catch(e){} };
        menuEl.appendChild(el);
      }catch(e){console.warn("[ExtVars] Failed to inject context menu:",e);}
    };
    console.log("[ExtVars] Context menu patched successfully");
  }

  // --- INITIALIZE ---
  function initialize(){
    loadState(); ensureStateCategories();
    const ws=getMainWorkspaceSafe(); if(ws) registerAllVariablesInWorkspace(ws);
    injectContextMenu();
    console.info("[ExtVars] Initialized (dark theme, BF6 accent)");
  }

  // Run initialize shortly after load
  setTimeout(initialize, 1000);

  // Expose helper
  if(plugin) plugin.openManager = openModal;
})();
