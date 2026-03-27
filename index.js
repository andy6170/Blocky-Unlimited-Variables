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

  // 🔽 NEW (drag state)
  let dragSrcEl = null;

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
    } catch(e) {}
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (map.deleteVariableById) { try { map.deleteVariableById(idOrName); return true; } catch(e){} }
      if (map.deleteVariable) { try { map.deleteVariable(idOrName); return true; } catch(e){} }
    } catch(e) {}
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      let found = null;
      const id = getVarId(varObj);
      if (id && map.getVariableById) found = map.getVariableById(id);
      if (found) { found.name = newName; return true; }
      if (varObj?.name !== undefined) { varObj.name = newName; return true; }
    } catch(e) {}
    return false;
  }

  // 🔽 NEW (core reorder logic)
  function reorderVariablesInWorkspace(ws, category, orderedList) {
    if (!ws || !orderedList) return;

    const snapshot = orderedList.map(v => ({
      id: v.id,
      name: v.name,
      type: v.type
    }));

    const allVars = workspaceGetVariables(ws);

    for (const v of allVars) {
      if ((getVarType(v) || "Global") === category) {
        deleteWorkspaceVariable(ws, getVarId(v));
      }
    }

    for (const v of snapshot) {
      createWorkspaceVariable(ws, v.name, v.type, v.id);
    }

    console.log(`[ExtVars] Reordered ${category}`);
  }

  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for (const c of CATEGORIES) live[c]=[];

    const vars = workspaceGetVariables(ws);
    for (const v of vars) {
      const id = getVarId(v);
      const name = getVarName(v);
      const type = getVarType(v) || "Global";
      if (!live[type]) live[type]=[];
      live[type].push({ id, name, type, _raw:v });
    }
    return live;
  }

  // ---------- UI ----------
  let modalOverlay = null;

  function removeModal(){ if(modalOverlay){ modalOverlay.remove(); modalOverlay=null;} }

  function openModal() {
    removeModal();
    const ws = getMainWorkspaceSafe();
    const live = getLiveRegistry();

    modalOverlay = document.createElement("div"); 
    modalOverlay.className = "ev-overlay";

    const modal = document.createElement("div"); 
    modal.className = "ev-modal"; 
    modalOverlay.appendChild(modal);

    const center = document.createElement("div"); 
    center.className = "ev-list";
    modal.appendChild(center);

    let currentCategory = CATEGORIES[0];

    function rebuildList() {
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);

      center.innerHTML = "";

      const arr = live[currentCategory] || [];

      // 🔽 NEW (apply order function)
      function applyNewOrder() {
        const rows = Array.from(center.querySelectorAll(".ev-row"));

        const newOrder = rows.map(row => {
          const name = row.dataset.name;
          return arr.find(v => v.name === name);
        }).filter(Boolean);

        reorderVariablesInWorkspace(ws, currentCategory, newOrder);

        rebuildList();
      }

      for (const v of arr) {
        const row = document.createElement("div"); 
        row.className = "ev-row";

        // 🔽 NEW (store name safely)
        row.dataset.name = v.name;

        // 🔽 NEW (drag setup)
        row.draggable = true;

        row.addEventListener("dragstart", () => {
          dragSrcEl = row;
          row.style.opacity = "0.4";
        });

        row.addEventListener("dragend", () => {
          row.style.opacity = "1";
        });

        row.addEventListener("dragover", (e) => {
          e.preventDefault();
        });

        row.addEventListener("drop", (e) => {
          e.preventDefault();

          if (dragSrcEl !== row) {
            const children = Array.from(center.querySelectorAll(".ev-row"));
            const srcIndex = children.indexOf(dragSrcEl);
            const targetIndex = children.indexOf(row);

            if (srcIndex < targetIndex) {
              center.insertBefore(dragSrcEl, row.nextSibling);
            } else {
              center.insertBefore(dragSrcEl, row);
            }

            applyNewOrder(); // 🔥 instant apply
          }
        });

        row.innerText = v.name;
        center.appendChild(row);
      }
    }

    rebuildList();

    document.body.appendChild(modalOverlay);
  }

  function initialize(){
    if(plugin) plugin.openManager=openModal;
    console.log("[ExtVars] Initialized with drag reorder");
  }

  setTimeout(initialize,900);

})();
