// BF6 Extended Variable Manager (Fixed)
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  let plugin = null, dragEl = null, placeholder = null;
  try { plugin = BF2042Portal.Plugins?.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID }; } catch(e){plugin={id:PLUGIN_ID};}

  const CATEGORIES = ["Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM","Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team","Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"];

  function getMainWorkspaceSafe() {
    try {
      if (_Blockly?.getMainWorkspace) return _Blockly.getMainWorkspace();
      if (Blockly?.getMainWorkspace) return Blockly.getMainWorkspace();
      if (BF2042Portal?.getMainWorkspace) return BF2042Portal.getMainWorkspace();
    } catch(e) {}
    return null;
  }

  function workspaceGetVariableMap(ws) { return ws?.getVariableMap?.() || ws?.variableMap || null; }
  function workspaceGetVariables(ws) { 
    const map = workspaceGetVariableMap(ws); 
    if(!map) return []; 
    return map.getVariables?.() || map.getAllVariables?.() || map.variables || [];
  }

  function getVarId(v) { return v?.id ?? (v?.getId?.() || null); }
  function getVarName(v) { return v?.name ?? (v?.getName?.() || null); }
  function getVarType(v) { return v?.type ?? (v?.getType?.() || "Global"); }

  function createWorkspaceVariable(ws, name, type, id) {
    const map = workspaceGetVariableMap(ws);
    return map?.createVariable?.(name,type||"",id) || ws?.createVariable?.(name,type||"",id) || Blockly?.Variables?.createVariable?.(ws,name,type||"",id) || null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    const map = workspaceGetVariableMap(ws);
    if(!map) return false;
    try { map.deleteVariableById?.(idOrName); return true; } catch(e){}
    try { map.deleteVariable?.(idOrName); return true; } catch(e){}
    try { map.removeVariable?.(idOrName); return true; } catch(e){}
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    const map = workspaceGetVariableMap(ws);
    if(!map) return false;
    try {
      const id = getVarId(varObj);
      let found = map.getVariableById?.(id) || map.getVariable?.(id) || map.getVariable?.(getVarName(varObj));
      if(found){ found.name = newName; return true; }
      if(varObj?.name!==undefined){ varObj.name = newName; return true; }
    } catch(e){}
    return false;
  }

  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for(const c of CATEGORIES) live[c]=[];
    try {
      const vars = workspaceGetVariables(ws);
      for(const v of vars){
        const id=getVarId(v), name=getVarName(v), type=getVarType(v);
        const cat = typeof type==="string"?type:"Global";
        if(!live[cat]) live[cat]=[];
        live[cat].push({id,name,type,_raw:v});
      }
    } catch(e){}
    return live;
  }

  function countVariableUsage(ws,varDef){
    const allBlocks = ws?.getAllBlocks?.()||[];
    const targetId=getVarId(varDef);
    let count=0;
    for(const block of allBlocks){
      const field = block?.getField?.("VAR");
      if(!field) continue;
      try{ if(field.getValue?.()===targetId) count++; } catch(e){}
    }
    return count;
  }

  function updateBlocksForVariableRename(oldName,newName,ws){
    const allBlocks=ws?.getAllBlocks?.()||[];
    for(const block of allBlocks){
      const field=block?.getField?.("VAR");
      if(!field) continue;
      try{
        const val=field.getValue?.();
        const varObj=ws.getVariableById?.(val);
        if(varObj && varObj.name===newName) field.setValue(val), block.render?.();
      }catch(e){}
    }
    try{
      const dummyId="EXTVARS_DUMMY_"+Date.now();
      const dummy=createWorkspaceVariable(ws,"__EXTVARS_DUMMY__","Global",dummyId);
      if(dummy) deleteWorkspaceVariable(ws,dummyId);
    }catch(e){}
  }

  // ---------- modal ----------
  let modalOverlay=null;
  function removeModal(){ modalOverlay?.remove(); modalOverlay=null; }

  function openModal(){
    removeModal();
    const ws=getMainWorkspaceSafe();
    const live=getLiveRegistry();

    modalOverlay=document.createElement("div");
    modalOverlay.className="ev-overlay";
    const modal=document.createElement("div"); modal.className="ev-modal"; modalOverlay.appendChild(modal);

    // header
    const top=document.createElement("div"); top.className="ev-top";
    const title=document.createElement("div"); title.className="ev-title"; title.innerText="Advanced Variable Manager"; top.appendChild(title);
    const closeBtn=document.createElement("button"); closeBtn.className="ev-btn ev-del"; closeBtn.innerText="Close"; closeBtn.onclick=()=>removeModal(); top.appendChild(closeBtn);
    modal.appendChild(top);

    const content=document.createElement("div"); content.className="ev-content"; modal.appendChild(content);
    const left=document.createElement("div"); left.className="ev-cats";
    const center=document.createElement("div"); center.className="ev-list";
    content.appendChild(left); content.appendChild(center);

    let currentCategory=CATEGORIES[0];

    // ----- functions defined after DOM nodes exist -----
    function rebuildCategories(){
      left.innerHTML="";
      const fresh=getLiveRegistry(); Object.assign(live,fresh);
      for(const cat of CATEGORIES){
        const el=document.createElement("div"); el.className="ev-cat";
        if(cat===currentCategory) el.classList.add("selected");
        el.innerHTML=`<span style="font-weight:600">${cat}</span><span class="ev-muted">${(live[cat]||[]).length}</span>`;
        el.onclick=()=>{ currentCategory=cat; rebuildCategories(); rebuildList(); };
        left.appendChild(el);
      }
    }

    function applyNewOrder(){
      try{
        const newOrder=Array.from(center.querySelectorAll(".ev-row")).map(r=>live[currentCategory].find(v=>v.id===r.dataset.id)).filter(Boolean);
        const map=workspaceGetVariableMap(ws);
        if(map?.variableMap_ && map.variableMap_[currentCategory]) map.variableMap_[currentCategory]=newOrder.map(v=>v._raw||v);
        if(map?.variableList) map.variableList=Object.values(map.variableMap_||{}).flat();
        live[currentCategory]=newOrder;
        const dummyId="EXTVARS_DUMMY_"+Date.now();
        const dummy=createWorkspaceVariable(ws,"__EXTVARS_DUMMY__","Global",dummyId);
        if(dummy) deleteWorkspaceVariable(ws,dummyId);
        rebuildCategories(); rebuildList();
      }catch(e){console.warn("[ExtVars] applyNewOrder failed:",e);}
    }

    function rebuildList(){
      center.innerHTML="";
      const arr=live[currentCategory]||[];
      if(arr.length===0){ const empty=document.createElement("div"); empty.className="ev-muted"; empty.innerText="(no variables)"; center.appendChild(empty); return; }

      arr.forEach(v=>{
        const row=document.createElement("div"); row.className="ev-row"; row.dataset.id=v.id;
        const leftCol=document.createElement("div"); leftCol.style.display="flex"; leftCol.style.flexDirection="column";
        leftCol.innerHTML=`<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${countVariableUsage(ws,v)})</div>`;
        const rightCol=document.createElement("div");
        const editBtn=document.createElement("button"); editBtn.className="ev-btn ev-edit"; editBtn.innerText="Edit"; editBtn.onclick=()=>{ const newName=prompt("New name:",v.name); if(!newName) return; renameWorkspaceVariable(ws,v._raw,newName); updateBlocksForVariableRename(v.name,newName,ws); rebuildCategories(); rebuildList(); };
        const delBtn=document.createElement("button"); delBtn.className="ev-btn ev-del"; delBtn.innerText="Delete"; delBtn.onclick=()=>{ if(!confirm(`Delete "${v.name}"?`)) return; deleteWorkspaceVariable(ws,v.id)||deleteWorkspaceVariable(ws,v.name); rebuildCategories(); rebuildList(); };
        rightCol.appendChild(editBtn); rightCol.appendChild(delBtn);
        row.appendChild(leftCol); row.appendChild(rightCol);
        center.appendChild(row);

        // drag
        row.addEventListener("mousedown",e=>{
          if(e.target.closest(".ev-btn")) return;
          e.preventDefault();
          dragEl=row;
          placeholder=document.createElement("div"); placeholder.className="ev-row"; placeholder.style.height=row.offsetHeight+"px"; placeholder.style.background="#2a2a2a"; placeholder.style.border="1px dashed #888";
          row.parentNode.insertBefore(placeholder,row.nextSibling);
          const rect=row.getBoundingClientRect(); row.style.position="fixed"; row.style.top=rect.top+"px"; row.style.left=rect.left+"px"; row.style.width=rect.width+"px"; row.style.zIndex="9999"; row.style.pointerEvents="none"; row.style.opacity="0.85";
          document.body.appendChild(row);

          function moveAt(clientY){ row.style.top=(clientY-row.offsetHeight/2)+"px"; }
          function onMouseMove(e){ moveAt(e.clientY); const rows=Array.from(center.querySelectorAll(".ev-row")).filter(r=>r!==placeholder); for(const r of rows){ const rect=r.getBoundingClientRect(); if(e.clientY<rect.top+rect.height/2){ center.insertBefore(placeholder,r); break;} else center.appendChild(placeholder); } }
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

    rebuildCategories(); rebuildList();
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener("click",ev=>{ if(ev.target===modalOverlay) removeModal(); });
  }

  function registerContextMenuItem(){
    try{
      const reg=_Blockly?.ContextMenuRegistry?.registry || Blockly?.ContextMenuRegistry?.registry;
      if(reg && reg.register){
        const item={id:"manageExtendedVariables",displayText:"Manage Variables",preconditionFn:()=> "enabled",callback:()=>openModal(),scopeType:_Blockly?.ContextMenuRegistry?.ScopeType?.WORKSPACE||Blockly?.ContextMenuRegistry?.ScopeType?.WORKSPACE,weight:98};
        try{ if(reg.getItem(item.id)) reg.unregister(item.id);}catch(e){}
        reg.register(item); return;
      }
    }catch(e){}
    // fallback
    document.addEventListener("contextmenu",()=>{
      setTimeout(()=>{
        const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu"); if(!menu) return;
        if(menu.querySelector("[data-extvars]")) return;
        const el=document.createElement("div"); el.setAttribute("data-extvars","1"); el.style.padding="6px 10px"; el.style.cursor="pointer"; el.style.color="#e9eef2"; el.textContent="Manage Variables"; el.addEventListener("click",()=>openModal()); menu.appendChild(el);
      },40);
    });
  }

  function initialize(){ registerContextMenuItem(); if(plugin) plugin.openManager=openModal; console.info("[ExtVars] Variable Manager initialized."); }
  setTimeout(initialize,900);

  window._getMainWorkspaceSafe=getMainWorkspaceSafe;
  window._updateBlocksForVariableRename=updateBlocksForVariableRename;

})();
