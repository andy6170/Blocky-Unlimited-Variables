// BF6 Extended Variable Manager
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  let plugin = null;
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

  // ------------------ Workspace Helpers ------------------
  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly.getMainWorkspace) return _Blockly.getMainWorkspace();
      if (typeof Blockly !== "undefined" && Blockly.getMainWorkspace) return Blockly.getMainWorkspace();
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) return BF2042Portal.getMainWorkspace();
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

  const getVarId = v => v?.id ?? v?.id_ ?? null;
  const getVarName = v => v?.name ?? null;
  const getVarType = v => v?.type ?? "Global";

  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map?.createVariable) return map.createVariable(name, type || "", id);
      if (ws?.createVariable) return ws.createVariable(name, type || "", id);
      if (Blockly?.Variables?.createVariable) return Blockly.Variables.createVariable(ws, name, type || "", id);
    } catch(e){}
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (map.deleteVariableById) { try { map.deleteVariableById(idOrName); return true; } catch(e){} }
      if (map.deleteVariable) { try { map.deleteVariable(idOrName); return true; } catch(e){} }
      if (map.removeVariable) { try { map.removeVariable(idOrName); return true; } catch(e){} }
    } catch(e){}
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      const id = getVarId(varObj);
      const found = map.getVariableById?.(id);
      if (found) { found.name = newName; return true; }
      if (varObj?.name !== undefined) { varObj.name = newName; return true; }
    } catch(e){}
    return false;
  }

  // ------------------ Portal‑Style Random ID ------------------
  function makePortalRandomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(){}[];:,.<>/?|`~-=+";
    let out = "";
    for (let i = 0; i < 20; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  // ------------------ Update Blocks After Rename ------------------
  function updateBlocksForVariableRename(oldName, newName, ws) {
    const allBlocks = ws.getAllBlocks(false);
    for (const block of allBlocks) {
      const field = block.getField?.("VAR");
      if (!field) continue;
      const id = field.getValue?.();
      const varObj = ws.getVariableById?.(id);
      if (varObj && varObj.name === newName) {
        field.setValue(id);
        block.render?.();
      }
    }

    // Force save
    try {
      const dummyId = "EXTVARS_DUMMY_" + Date.now();
      const dummy = createWorkspaceVariable(ws, "__DUMMY__", "Global", dummyId);
      deleteWorkspaceVariable(ws, dummyId);
    } catch(e){}
  }

  // ------------------ Live Registry ------------------
  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for (const c of CATEGORIES) live[c] = [];
    const vars = workspaceGetVariables(ws);
    for (const v of vars) {
      const cat = getVarType(v);
      if (!live[cat]) live[cat] = [];
      live[cat].push({ id: getVarId(v), name: getVarName(v), type: cat, _raw: v });
    }
    return live;
  }

  // ------------------ Count Usage ------------------
  function countVariableUsage(ws, varDef) {
    const id = getVarId(varDef);
    let count = 0;
    const blocks = ws.getAllBlocks(false);
    for (const block of blocks) {
      const field = block.getField?.("VAR");
      if (field && field.getValue?.() === id) count++;
    }
    return count;
  }

  // ------------------ Reorder Variables ------------------
  function reorderVariablesInMap(ws, cat, orderedIds) {
    const map = workspaceGetVariableMap(ws);
    if (!map || !map.variableMap) return;

    const vm = map.variableMap;
    const raw = vm.get(cat);
    if (!Array.isArray(raw)) return;

    const newArr = [];
    for (const id of orderedIds) {
      const v = raw.find(x => getVarId(x) === id);
      if (v) newArr.push(v);
    }
    for (const v of raw) {
      if (!newArr.includes(v)) newArr.push(v);
    }

    vm.set(cat, newArr);

    // Force save
    try {
      const dummyId = "EXTVARS_ORDER_DUMMY_" + Date.now();
      const dummy = createWorkspaceVariable(ws, "__ORDER_DUMMY__", "Global", dummyId);
      deleteWorkspaceVariable(ws, dummyId);
    } catch(e){}
  }

  // ------------------ CSS ------------------
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .ev-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999999}
      .ev-modal{width:min(1100px,94vw);height:min(760px,90vh);background:#1e1e1e;border-radius:10px;padding:14px;display:flex;flex-direction:column;color:#e9eef2;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,0.75)}
      .ev-content{display:flex;gap:12px;flex:1;overflow:hidden}
      .ev-cats{width:240px;background:#000000;border-radius:8px;padding:10px;overflow-y:auto}
      .ev-cat{padding:8px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:#171717;color:#e9eef2;margin-bottom:6px;transition:background 0.15s ease,transform 0.15s ease}
      .ev-cat:hover{background:#434343;transform:translateX(1px)}
      .ev-cat.selected{background:#6e0000;border-left:4px solid #ff0a03}
      .ev-list{flex:1;background:#000000;border-radius:8px;padding:10px;overflow:auto;display:flex;flex-direction:column}
      .ev-row{display:flex;justify-content:space-between;align-items:center;padding:8px;background:#171717;border-radius:6px;margin-bottom:8px;transition:transform 0.15s ease,box-shadow 0.15s ease,background 0.15s ease}
      .ev-row.dragging{opacity:0.9;background:#252525;box-shadow:0 8px 24px rgba(0,0,0,0.6);transform:scale(1.01)}
      .ev-btn{padding:6px 10px;border-radius:6px;border:none;color:#fff;cursor:pointer}
      .ev-add{background:#008a00}
      .ev-edit{background:#3a3a3a}
      .ev-del{background:#8a0000}
      .ev-muted{color:#cdcdcd;font-size:14px}
      .ev-row-left{display:flex;align-items:center;gap:8px}
      .ev-drag-handle{width:16px;height:16px;cursor:grab;display:flex;align-items:center;justify-content:center;color:#aaaaaa;font-size:14px;flex-shrink:0;user-select:none}
      .ev-drag-handle::before{content:"⋮⋮";line-height:1}
      .ev-row.dragging .ev-drag-handle{cursor:grabbing;color:#ffffff}
    `;
    document.head.appendChild(style);
  })();

  // ------------------ Modal ------------------
  let modalOverlay = null;
  function removeModal(){ modalOverlay?.remove(); modalOverlay=null; }

  function openModal() {
    removeModal();
    const ws = getMainWorkspaceSafe();
    const live = getLiveRegistry();

    modalOverlay = document.createElement("div");
    modalOverlay.className = "ev-overlay";

    const modal = document.createElement("div");
    modal.className = "ev-modal";
    modalOverlay.appendChild(modal);

    const top = document.createElement("div");
    top.className = "ev-top";
    top.innerHTML = `<div class="ev-title">Advanced Variable Manager</div>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "ev-btn ev-del";
    closeBtn.innerText = "Close";
    closeBtn.onclick = removeModal;
    top.appendChild(closeBtn);
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
        el.innerHTML = `<span>${cat}</span><span class="ev-muted">${live[cat].length}</span>`;
        el.onclick = () => { currentCategory = cat; rebuildCategories(); rebuildList(); };
        left.appendChild(el);
      }
    }

    function initDnD() {
      if (center.dataset.dndInit) return;
      center.dataset.dndInit = "1";

      center.addEventListener("dragover", ev => {
        ev.preventDefault();
        const dragging = center.querySelector(".ev-row.dragging");
        if (!dragging) return;

        const rows = [...center.querySelectorAll(".ev-row:not(.dragging)")];
        const after = rows.find(r => ev.clientY <= r.getBoundingClientRect().top + r.offsetHeight / 2);

        if (after) center.insertBefore(dragging, after);
        else center.appendChild(dragging);
      });

      center.addEventListener("drop", () => {
        const newOrder = [...center.querySelectorAll(".ev-row")].map(r => r.dataset.varId);
        reorderVariablesInMap(ws, currentCategory, newOrder);
        rebuildCategories();
        rebuildList();
      });
    }

    function rebuildList() {
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);

      center.innerHTML = "";
      initDnD();

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.marginBottom = "8px";
      header.innerHTML = `<strong>${currentCategory} Variables</strong>`;

      const addBtn = document.createElement("button");
      addBtn.className = "ev-btn ev-add";
      addBtn.innerText = "Add";
      addBtn.onclick = () => {
        const name = prompt("Enter variable name:");
        if (!name) return;
        const id = makePortalRandomId();
        createWorkspaceVariable(ws, name, currentCategory, id);
        rebuildCategories();
        rebuildList();
      };

      header.appendChild(addBtn);
      center.appendChild(header);

      const arr = live[currentCategory];
      if (!arr.length) {
        center.innerHTML += `<div class="ev-muted">(no variables)</div>`;
        return;
      }

      for (const v of arr) {
        const row = document.createElement("div");
        row.className = "ev-row";
        row.setAttribute("draggable", "true");
        row.dataset.varId = v.id;

        const leftCol = document.createElement("div");
        leftCol.className = "ev-row-left";

        const dragHandle = document.createElement("div");
        dragHandle.className = "ev-drag-handle";

        const textCol = document.createElement("div");
        textCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${countVariableUsage(ws, v)})</div>`;

        leftCol.appendChild(dragHandle);
        leftCol.appendChild(textCol);

        const rightCol = document.createElement("div");

        const editBtn = document.createElement("button");
        editBtn.className = "ev-btn ev-edit";
        editBtn.innerText = "Edit";
        editBtn.onclick = () => {
          const newName = prompt("Enter new name:", v.name);
          if (!newName) return;
          renameWorkspaceVariable(ws, v._raw, newName);
          updateBlocksForVariableRename(v.name, newName, ws);
          rebuildCategories();
          rebuildList();
        };

        const delBtn = document.createElement("button");
        delBtn.className = "ev-btn ev-del";
        delBtn.innerText = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"?`)) return;
          deleteWorkspaceVariable(ws, v.id);
          rebuildCategories();
          rebuildList();
        };

        rightCol.appendChild(editBtn);
        rightCol.appendChild(delBtn);

        row.appendChild(leftCol);
        row.appendChild(rightCol);
        center.appendChild(row);

        // Handle-only drag
        let allowDrag = false;

        dragHandle.addEventListener("mousedown", () => allowDrag = true);
        document.addEventListener("mouseup", () => allowDrag = false);

        row.addEventListener("dragstart", ev => {
          if (!allowDrag) { ev.preventDefault(); return; }
          ev.dataTransfer.setData("text/plain", v.id);
          row.classList.add("dragging");
        });

        row.addEventListener("dragend", () => {
          row.classList.remove("dragging");
          allowDrag = false;
        });
      }
    }

    rebuildCategories();
    rebuildList();
    modalOverlay.addEventListener("click", ev => { if (ev.target === modalOverlay) removeModal(); });
    document.body.appendChild(modalOverlay);
  }

  // ------------------ Context Menu (Original Working Version) ------------------
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
        reg.register(item);
        return;
      }
    }catch(e){}

    // DOM fallback (your original working version)
    (function domFallback(){
      document.addEventListener("contextmenu",()=>{
        setTimeout(()=>{
          const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
          if(!menu) return;
          if(menu.querySelector("[data-extvars]")) return;
          const el=document.createElement("div");
          el.setAttribute("data-extvars","1");
          el.style.padding="6px 10px";
          el.style.cursor="pointer";
          el.style.color="#e9eef2";
          el.textContent="Manage Variables";
          el.onclick=()=>{ openModal(); menu.style.display="none"; };
          menu.appendChild(el);
        },40);
      });
    })();
  }

  function initialize(){
    register
