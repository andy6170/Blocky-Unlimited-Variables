// BF6 Extended Variable Manager - works with ContextMenuRegistry
(function () {
  const pluginId = "bf-portal-extended-variable-manager";
  const plugin = BF2042Portal.Plugins.getPlugin(pluginId) || { id: pluginId };

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
      if (BF2042Portal.Shared && BF2042Portal.Shared.saveToLocalStorage) {
        BF2042Portal.Shared.saveToLocalStorage(STORAGE_KEY, state);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) { console.warn("[ExtVars] Save failed:", e); }
  }

  function loadState() {
    try {
      let loaded = null;
      if (BF2042Portal.Shared && BF2042Portal.Shared.loadFromLocalStorage) {
        loaded = BF2042Portal.Shared.loadFromLocalStorage(STORAGE_KEY);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = JSON.parse(raw);
      }
      if (loaded && typeof loaded === "object") state = Object.assign({}, state, loaded);
    } catch (e) { console.warn("[ExtVars] Load failed:", e); }
    ensureStateCategories();

    // Ensure nextIdCounter above existing EV_ ids
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
      if (_Blockly && _Blockly.getMainWorkspace) return _Blockly.getMainWorkspace();
      if (Blockly && Blockly.getMainWorkspace) return Blockly.getMainWorkspace();
      if (BF2042Portal.getMainWorkspace) return BF2042Portal.getMainWorkspace();
    } catch (e) {}
    return null;
  }

  function workspaceGetVariableMap(ws) {
    if (!ws) return null;
    return ws.getVariableMap ? ws.getVariableMap() : ws.variableMap || null;
  }

  function workspaceHasVariableWithId(ws, id) {
    const map = workspaceGetVariableMap(ws);
    if (!map) return false;
    if (map.getVariableById) return !!map.getVariableById(id);
    if (map.getVariables) return map.getVariables().some(v => v.id === id);
    return false;
  }

  function workspaceHasVariableWithName(ws, name) {
    const map = workspaceGetVariableMap(ws);
    if (!map) return false;
    if (map.getVariableByName) return !!map.getVariableByName(name);
    if (map.getVariables) return map.getVariables().some(v => v.name === name);
    return false;
  }

  function createWorkspaceVariable(ws, name, type, id) {
    const map = workspaceGetVariableMap(ws);
    if (map && map.createVariable) {
      try { return map.createVariable(name, type || "", id); } catch { try { return map.createVariable(name, type || "", undefined); } catch {} }
    }
    if (ws.createVariable) {
      try { return ws.createVariable(name, type || "", id); } catch { try { return ws.createVariable(name, type || "", undefined); } catch {} }
    }
    if (Blockly.Variables && Blockly.Variables.createVariable) {
      try { return Blockly.Variables.createVariable(ws, name, type || "", id); } catch {}
    }
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    const map = workspaceGetVariableMap(ws);
    if (!map) return false;
    if (map.deleteVariable) { try { map.deleteVariable(idOrName); return true; } catch {} }
    if (map.removeVariable) { try { map.removeVariable(idOrName); return true; } catch {} }
    if (map.getVariables) {
      const vs = map.getVariables();
      const idx = vs.findIndex(v => v.id === idOrName || v.name === idOrName);
      if (idx >= 0 && Array.isArray(vs)) { try { vs.splice(idx, 1); return true; } catch {} }
    }
    return false;
  }

  // Modal management
  let modalOverlay = null;
  function removeModal() { if (modalOverlay) { try { modalOverlay.remove(); } catch {} modalOverlay = null; } }

  function makeNextSequentialId() {
    const id = "EV_" + String(state.nextIdCounter).padStart(4, "0");
    state.nextIdCounter++;
    return id;
  }

  function openModal() {
    loadState();
    ensureStateCategories();
    const ws = getMainWorkspaceSafe();
    if (ws) {
      for (const cat of CATEGORIES) {
        for (const v of state.variables[cat] || []) {
          if (!workspaceHasVariableWithId(ws, v.id) && !workspaceHasVariableWithName(ws, v.name)) {
            createWorkspaceVariable(ws, v.name, v.type || cat, v.id);
          }
        }
      }
    }

    removeModal();

    modalOverlay = document.createElement("div");
    modalOverlay.style.position = "fixed";
    modalOverlay.style.top = "0";
    modalOverlay.style.left = "0";
    modalOverlay.style.width = "100%";
    modalOverlay.style.height = "100%";
    modalOverlay.style.background = "rgba(0,0,0,0.62)";
    modalOverlay.style.zIndex = "999999";
    modalOverlay.style.display = "flex";
    modalOverlay.style.alignItems = "center";
    modalOverlay.style.justifyContent = "center";

    const modalEl = document.createElement("div");
    modalEl.style.width = "min(1100px, 92vw)";
    modalEl.style.height = "min(720px, 88vh)";
    modalEl.style.background = THEME.panel;
    modalEl.style.borderRadius = "10px";
    modalEl.style.boxShadow = "0 12px 48px rgba(0,0,0,0.75)";
    modalEl.style.color = THEME.text;
    modalEl.style.padding = "14px";
    modalEl.style.overflow = "hidden";
    modalEl.style.display = "flex";
    modalEl.style.flexDirection = "column";
    modalOverlay.appendChild(modalEl);

    // Header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "10px";
    const title = document.createElement("div");
    title.innerText = "Extended Variable Manager";
    title.style.fontSize = "18px";
    title.style.fontWeight = "700";
    header.appendChild(title);
    modalEl.appendChild(header);

    document.body.appendChild(modalOverlay);

    // Close on click outside
    modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) removeModal(); });
  }

  plugin.openManager = openModal;

  // Context menu registration
  function registerContextMenu() {
    try {
      const reg = _Blockly.ContextMenuRegistry.registry;
      if (!reg) return;

      const item = {
        id: "manageExtendedVariables",
        displayText: "Manage Variables",
        preconditionFn: () => "enabled",
        callback: () => openModal(),
        scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
        weight: 98
      };

      if (reg.getItem(item.id)) reg.unregister(item.id);
      reg.register(item);
    } catch (err) {
      console.warn("[ExtVars] Context menu registration failed:", err);
    }
  }

  function initialize() {
    loadState();
    ensureStateCategories();
    const ws = getMainWorkspaceSafe();
    if (ws) {
      for (const cat of CATEGORIES) {
        for (const v of state.variables[cat] || []) {
          createWorkspaceVariable(ws, v.name, v.type || cat, v.id);
        }
      }
    }
    registerContextMenu();
    console.info("[ExtVars] initialized - BF6 Extended Variable Manager");
  }

  // Initialize shortly after load
  setTimeout(initialize, 1000);
})();
