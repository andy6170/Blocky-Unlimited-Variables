// ===============================
//  Battlefield Portal Extended Variable Manager Plugin (final)
// ===============================
(function () {
  // defensive access to portal plugin API if present
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins && typeof BF2042Portal.Plugins.getPlugin === "function") {
      plugin = BF2042Portal.Plugins.getPlugin("bf-portal-extended-variable-manager") || { id: "bf-portal-extended-variable-manager" };
    }
  } catch (e) {
    plugin = { id: "bf-portal-extended-variable-manager" };
  }

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
    } catch (e) {}
    return null;
  }

  // ===============================
  //  Categories
  // ===============================
  const categories = [
    "Global", "AreaTrigger", "CapturePoint", "EmplacementSpawner", "HQ", "InteractPoint", 
    "LootSpawner", "MCOM", "Player", "RingOfFire", "ScreenEffect", "Sector", "SFX", 
    "SpatialObject", "Spawner", "SpawnPoint", "Team", "Vehicle", "VehicleSpawner", 
    "VFX", "VO", "WaypointPath", "WorldIcon"
  ];

  // ===============================
  //  CSS Injection
  // ===============================
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .varPopupOverlay {position: fixed;top:0;left:0;right:0;bottom:0;background: rgba(0,0,0,0.55);display:flex;justify-content:center;align-items:center;z-index:999999;}
      .varPopup {background:#1a1a1a;padding:18px;width:750px;max-height:80vh;overflow:hidden;display:flex;border-radius:8px;box-shadow:0 0 25px rgba(0,0,0,0.5);}
      .varCategories {width:200px;overflow-y:auto;border-right:1px solid #333;padding-right:10px;}
      .variable-category {padding:6px 10px;cursor:pointer;border-radius:4px;margin-bottom:4px;color:#ddd;background:transparent;}
      .variable-category:hover {background-color: rgba(255,255,255,0.05);}
      .variable-category.selected {background-color: rgba(255,255,255,0.12);border-left: 3px solid #00eaff;}
      .varList {flex:1;overflow-y:auto;padding-left:15px;color:#ddd;}
      .varEntry {padding:6px;background:#222;margin-bottom:6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;}
      .buttonRow {text-align:right;padding-top:12px;}
      .blueBtn {background:#007bff;padding:5px 12px;border-radius:4px;cursor:pointer;margin-left:6px;color:#fff;border:none;}
      .redBtn {background:#cc0000;padding:5px 12px;border-radius:4px;cursor:pointer;margin-left:6px;color:#fff;border:none;}
      .smallMuted {color:#9aa;font-size:12px;}
    `;
    document.head.appendChild(style);
  })();

  // ===============================
  //  Variable Collection & Usage
  // ===============================
  function getWorkspaceVariables(ws) {
    if (!ws) return [];
    let map = null;
    try {
      map = ws.getVariableMap ? ws.getVariableMap() : ws.variableMap_ || null;
    } catch(e){ map = null; }

    if (!map) return [];

    let vars = [];
    try {
      if (typeof map.getVariables === "function") vars = map.getVariables();
      else if (typeof map.getVariables_ === "function") vars = map.getVariables_();
      else if (typeof map.variableMap_ === "object") vars = Object.values(map.variableMap_);
    } catch(e){ vars = []; }

    return vars || [];
  }

  function computeUsageCounts() {
    const ws = getMainWorkspaceSafe();
    if (!ws) return {};
    const blocks = ws.getAllBlocks ? ws.getAllBlocks(false) : [];
    const usage = {};
    blocks.forEach(b => {
      if (b.getVars) {
        try {
          const vars = b.getVars();
          if (Array.isArray(vars)) {
            vars.forEach(v => {
              if (!v) return;
              const key = v.toLowerCase();
              usage[key] = (usage[key]||0) + 1;
            });
          }
        } catch(e){}
      }
    });
    return usage;
  }

  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const vars = getWorkspaceVariables(ws);
    const usage = computeUsageCounts();
    const reg = {};
    categories.forEach(c => reg[c] = []);
    vars.forEach(v => {
      const cat = v.type || "Global";
      if (!reg[cat]) reg[cat] = [];
      const name = v.name || (v.getName ? v.getName() : "");
      reg[cat].push({
        name: name,
        type: cat,
        usage: usage[name.toLowerCase()] || 0
      });
    });
    return reg;
  }

  // ===============================
  //  Sequential ID generator
  // ===============================
  function makeNextSequentialId() {
    const ws = getMainWorkspaceSafe();
    const vars = getWorkspaceVariables(ws);
    let max = 0;
    vars.forEach(v => {
      const id = v.id || (v.getId ? v.getId() : "");
      if (typeof id === "string" && id.startsWith("EV_")) {
        const num = parseInt(id.slice(3),10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
    return "EV_" + String(max+1).padStart(4,"0");
  }

  // ===============================
  //  Unique name validation
  // ===============================
  function validateName(name, registryArr) {
    if (!registryArr) return true;
    return !registryArr.some(v => v.name.toLowerCase() === name.toLowerCase());
  }

  // ===============================
  //  Variable Manager UI
  // ===============================
  function openVariableManager() {
    let currentCategory = categories[0];
    const registry = getLiveRegistry();

    const overlay = document.createElement("div");
    overlay.className = "varPopupOverlay";

    const popup = document.createElement("div");
    popup.className = "varPopup";
    overlay.appendChild(popup);

    const categoryList = document.createElement("div");
    categoryList.className = "varCategories";
    const variableList = document.createElement("div");
    variableList.className = "varList";

    popup.appendChild(categoryList);
    popup.appendChild(variableList);
    document.body.appendChild(overlay);

    function rebuildCategories() {
      categoryList.innerHTML = "";
      categories.forEach(cat => {
        const el = document.createElement("div");
        el.className = "variable-category";
        const count = registry[cat] ? registry[cat].reduce((acc,v)=>acc+v.usage,0) : 0;
        el.textContent = `${cat} (${count})`;
        if (cat===currentCategory) el.classList.add("selected");
        el.addEventListener("click", () => {
          categoryList.querySelectorAll(".variable-category").forEach(x=>x.classList.remove("selected"));
          el.classList.add("selected");
          currentCategory = cat;
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
      h1.innerHTML = `<strong>${currentCategory} Variables</strong><div class="smallMuted">Total: ${registry[currentCategory]?.length||0}</div>`;
      header.appendChild(h1);

      const addBtn = document.createElement("button");
      addBtn.className = "blueBtn";
      addBtn.textContent = "Add";
      addBtn.addEventListener("click", () => openAddDialog());
      header.appendChild(addBtn);

      variableList.appendChild(header);

      const arr = registry[currentCategory] || [];
      if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.className = "smallMuted";
        empty.textContent = "(no variables)";
        variableList.appendChild(empty);
      } else {
        arr.forEach(v=>{
          const row = document.createElement("div");
          row.className = "varEntry";

          const left = document.createElement("div");
          left.style.fontWeight="600";
          left.textContent = v.name + (v.usage>0?` (${v.usage})`:"");

          const right = document.createElement("div");

          const editBtn = document.createElement("button");
          editBtn.className = "blueBtn";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", ()=>openEditDialog(v));

          const delBtn = document.createElement("button");
          delBtn.className = "redBtn";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", ()=>{
            if(!confirm(`Delete variable "${v.name}"? This may break blocks that reference it.`)) return;
            const ws = getMainWorkspaceSafe();
            if(ws) {
              const map = ws.getVariableMap ? ws.getVariableMap() : null;
              if(map && typeof map.deleteVariable === "function") {
                try { map.deleteVariable(v.id||v.name); } catch(e) {}
              }
            }
            registry[currentCategory] = registry[currentCategory].filter(x=>x.name!==v.name);
            rebuildCategories();
            rebuildVariableList();
          });

          right.appendChild(editBtn);
          right.appendChild(delBtn);
          row.appendChild(left);
          row.appendChild(right);
          variableList.appendChild(row);
        });
      }
    }

    function closeOverlay() { try { overlay.remove(); } catch(e){} }

    function openAddDialog() {
      const name = prompt(`Create new ${currentCategory} variable — name:`);
      if(!name) return;
      const trimmed = name.trim();
      if(!trimmed) return;
      if(!validateName(trimmed, registry[currentCategory])) { alert("Duplicate name in this category not allowed."); return; }

      const id = makeNextSequentialId();
      const varDef = { id, name: trimmed, type: currentCategory, usage: 0 };
      registry[currentCategory].push(varDef);

      // add to workspace map
      const ws = getMainWorkspaceSafe();
      if(ws && ws.getVariableMap) {
        const map = ws.getVariableMap();
        if(map && typeof map.createVariable === "function") {
          try { map.createVariable(varDef.name,varDef.type,varDef.id); } catch(e){ map.createVariable(varDef.name,varDef.type); }
        }
      }

      rebuildCategories();
      rebuildVariableList();
    }

    function openEditDialog(v) {
      const newName = prompt("Edit variable name:", v.name);
      if(!newName) return;
      const trimmed = newName.trim();
      if(!trimmed) return;
      if(!validateName(trimmed, registry[currentCategory])) { alert("Duplicate name in this category not allowed."); return; }

      const ws = getMainWorkspaceSafe();
      if(ws && ws.getVariableMap) {
        const map = ws.getVariableMap();
        if(map && typeof map.getVariableById === "function") {
          const existing = map.getVariableById(v.id);
          if(existing) { try { existing.name = trimmed; } catch(e){} }
        }
      }

      v.name = trimmed;
      rebuildCategories();
      rebuildVariableList();
    }

    overlay.addEventListener("click", (ev)=>{ if(ev.target===overlay) closeOverlay(); });
    rebuildCategories();
    rebuildVariableList();
  }

  // ===============================
  //  Context menu registration
  // ===============================
  function registerContextMenuItem() {
    try {
      const reg = (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.registry
                : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.registry
                : null;
      if(reg && typeof reg.register==="function") {
        const item = {
          id:"manageExtendedVariables",
          displayText:"Manage Variables",
          preconditionFn:()=> "enabled",
          callback:()=>openVariableManager(),
          scopeType: (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : null,
          weight:98
        };
        try{ if(reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); }catch(e){}
        reg.register(item);
        return;
      }
    } catch(e){}
  }

  // ===============================
  //  Initialize
  // ===============================
  function initialize() {
    try {
      registerContextMenuItem();
      if(plugin) plugin.openExtendedVariables = openVariableManager;
      console.info("[ExtVars] Extended Variable Manager initialized.");
    } catch(e){ console.error("[ExtVars] init failed:",e); }
  }

  setTimeout(initialize,800);
})();
