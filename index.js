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
  let dragEl = null;
  let placeholder = null;

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

  // ---------- inject CSS ----------
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .ev-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999999}
      .ev-modal{width:min(1100px,94vw);height:min(760px,90vh);background:#1e1e1e;border-radius:10px;padding:14px;display:flex;flex-direction:column;color:#e9eef2;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,0.75)}
      .ev-list{flex:1;background:#000000;border-radius:8px;padding:10px;overflow:auto;display:flex;flex-direction:column}
      .ev-row{
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:8px;
        background:#171717;
        border-radius:6px;
        margin-bottom:8px;
        cursor:grab; /* 🔥 NEW */
      }
      .ev-row:active{
        cursor:grabbing; /* 🔥 NEW */
      }
    `;
    document.head.appendChild(style);
  })();

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
        row.dataset.name = v.name;
        row.innerText = v.name;

        // 🔥 CUSTOM DRAG SYSTEM
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();

          dragEl = row;

          placeholder = document.createElement("div");
          placeholder.className = "ev-row";
          placeholder.style.height = row.offsetHeight + "px";
          placeholder.style.background = "#2a2a2a";
          placeholder.style.border = "1px dashed #888";

          row.parentNode.insertBefore(placeholder, row.nextSibling);

          row.style.position = "absolute";
          row.style.zIndex = "9999";
          row.style.width = row.offsetWidth + "px";
          row.style.pointerEvents = "none";
          row.style.opacity = "0.8";

          document.body.appendChild(row);

          function moveAt(pageY) {
            row.style.top = pageY - row.offsetHeight / 2 + "px";
            row.style.left = center.getBoundingClientRect().left + "px";
          }

          moveAt(e.pageY);

          function onMouseMove(e) {
            moveAt(e.pageY);

            const rows = Array.from(center.querySelectorAll(".ev-row"));

            for (const r of rows) {
              if (r === placeholder) continue;

              const rect = r.getBoundingClientRect();
              if (e.clientY < rect.top + rect.height / 2) {
                center.insertBefore(placeholder, r);
                break;
              } else {
                center.appendChild(placeholder);
              }
            }
          }

          document.addEventListener("mousemove", onMouseMove);

          document.addEventListener("mouseup", () => {
            document.removeEventListener("mousemove", onMouseMove);

            center.insertBefore(dragEl, placeholder);

            dragEl.style.position = "";
            dragEl.style.zIndex = "";
            dragEl.style.top = "";
            dragEl.style.left = "";
            dragEl.style.width = "";
            dragEl.style.pointerEvents = "";
            dragEl.style.opacity = "";

            placeholder.remove();
            placeholder = null;
            dragEl = null;

            applyNewOrder();
          }, { once: true });
        });

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
