(function () {
  const pluginId = "bf-portal-extended-variable-manager";
  const plugin = BF2042Portal.Plugins.getPlugin(pluginId);

  // Local storage key (uses BF portal shared if available)
  const STORAGE_KEY = pluginId + "-data-v1";

  // Categories requested by user (display order)
  const CATEGORIES = [
    "Global",
    "AreaTrigger",
    "CapturePoint",
    "EmplacementSpawner",
    "HQ",
    "InteractPoint",
    "LootSpawner",
    "MCOM",
    "Player",
    "RingOfFire",
    "ScreenEffect",
    "Sector",
    "SFX",
    "SpatialObject",
    "Spawner",
    "SpawnPoint",
    "Team",
    "Vehicle",
    "VehicleSpawner",
    "VFX",
    "VO",
    "WaypointPath",
    "WorldIcon"
  ];

  // Default state structure
  let state = {
    nextIdCounter: 1,
    // map: category -> [{ id, name, type }]
    variables: {}
  };

  // UI elements
  let modalEl = null;
  let overlayEl = null;

  // Utilities
  function saveState() {
    try {
      if (BF2042Portal && BF2042Portal.Shared && typeof BF2042Portal.Shared.saveToLocalStorage === "function") {
        BF2042Portal.Shared.saveToLocalStorage(STORAGE_KEY, state);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.warn("[ExtVars] Save failed:", e);
    }
  }

  function loadState() {
    try {
      let loaded = null;
      if (BF2042Portal && BF2042Portal.Shared && typeof BF2042Portal.Shared.loadFromLocalStorage === "function") {
        loaded = BF2042Portal.Shared.loadFromLocalStorage(STORAGE_KEY);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = JSON.parse(raw);
      }
      if (loaded && typeof loaded === "object") {
        state = Object.assign({}, state, loaded);
      }
    } catch (e) {
      console.warn("[ExtVars] Load failed:", e);
    }

    // ensure categories exist
    for (const c of CATEGORIES) {
      if (!state.variables[c]) state.variables[c] = [];
    }
  }

  function makeSequentialId() {
    const id = "EV_" + String(state.nextIdCounter).padStart(4, "0");
    state.nextIdCounter += 1;
    return id;
  }

  // Workspace variable APIs (defensive)
  function workspaceGetVariableMap(ws) {
    try {
      if (!ws) return null;
      if (typeof ws.getVariableMap === "function") return ws.getVariableMap();
      // some builds: ws.variableMap
      if (ws.variableMap) return ws.variableMap;
      return null;
    } catch (e) {
      return null;
    }
  }

  function workspaceHasVariableWithId(ws, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.getVariable === "function") {
        const v = map.getVariable(id);
        if (v) return true;
      }
      if (typeof map.getVariableById === "function") {
        const v2 = map.getVariableById(id);
        if (v2) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function workspaceHasVariableWithName(ws, name, type) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.getVariableByName === "function") {
        const v = map.getVariableByName(name);
        if (v) return true;
      }
      // older: map.getVariable(name)
      if (typeof map.getVariable === "function") {
        const v = map.getVariable(name);
        if (v) return true;
      }
      // fallback: iterate
      if (map.getVariables && typeof map.getVariables === "function") {
        const arr = map.getVariables();
        return arr.some(x => x.name === name);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map && typeof map.createVariable === "function") {
        // some createVariable accept id third param
        try {
          return map.createVariable(name, type || "", id);
        } catch (e) {
          return map.createVariable(name, type || "", undefined);
        }
      }
      if (typeof ws.createVariable === "function") {
        try {
          return ws.createVariable(name, type || "", id);
        } catch (e) {
          return ws.createVariable(name, type || "", undefined);
        }
      }
      if (typeof Blockly !== "undefined" && Blockly.Variables && typeof Blockly.Variables.createVariable === "function") {
        try {
          return Blockly.Variables.createVariable(ws, name, type || "", id);
        } catch (e) {}
      }
    } catch (e) {
      console.warn("[ExtVars] createWorkspaceVariable error:", e);
    }
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      // try deleteVariable
      if (typeof map.deleteVariable === "function") {
        try {
          map.deleteVariable(idOrName);
          return true;
        } catch (e) {}
      }
      // try removeVariableById / removeVariable
      if (typeof map.removeVariable === "function") {
        try {
          map.removeVariable(idOrName);
          return true;
        } catch (e) {}
      }
      // fallback: iterate and remove if internal array exists
      if (map.getVariables && typeof map.getVariables === "function") {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => v.id === idOrName || v.name === idOrName);
        if (idx >= 0 && map.getVariablesArray && Array.isArray(map.getVariablesArray)) {
          try {
            map.getVariablesArray().splice(idx, 1);
            return true;
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("[ExtVars] deleteWorkspaceVariable error:", e);
    }
    return false;
  }

  // Usage tracking: scans workspace blocks and counts references by id or name/type
  function countVariableUsage(ws, varDef) {
    let count = 0;
    try {
      const all = ws.getAllBlocks ? ws.getAllBlocks(false) : [];
      for (const blk of all) {
        try {
          // examine serialized form to be broad
          const serial = safeSerializeBlock(blk);
          if (!serial) continue;
          traverseSerializedBlocks(serial, (node) => {
            if (!node || !node.fields) return;
            const vf = node.fields.VAR;
            if (!vf) return;
            if (typeof vf === "object") {
              if (vf.id && varDef.id && vf.id === varDef.id) count++;
              else if (vf.name && vf.name === varDef.name && (vf.type || "") === (varDef.type || "")) count++;
            } else if (typeof vf === "string") {
              if (vf === varDef.name) count++;
            }
          });
        } catch (be) { /* ignore per-block */ }
      }
    } catch (e) {
      console.warn("[ExtVars] usage count error:", e);
    }
    return count;
  }

  // safe serialize a real block to the same JSON structure our other code uses
  function safeSerializeBlock(blk) {
    try {
      if (!blk) return null;
      if (_Blockly && _Blockly.serialization && _Blockly.serialization.blocks && typeof _Blockly.serialization.blocks.save === "function") {
        return _Blockly.serialization.blocks.save(blk);
      }
      // fallback to XML conversion and simple parse (less ideal)
      const xml = Blockly.Xml.blockToDom(blk, /*opt_noId=*/ false);
      const text = Blockly.Xml.domToText(xml);
      // Not converting XML back to JSON here; return minimal info
      return { fields: {} };
    } catch (e) {
      return null;
    }
  }

  // traverse function for serialized JSON (same shape used elsewhere)
  function traverseSerializedBlocks(node, cb) {
    if (!node) return;
    cb(node);
    if (node.inputs && typeof node.inputs === "object") {
      for (const input of Object.values(node.inputs)) {
        if (input && input.block) traverseSerializedBlocks(input.block, cb);
        if (input && input.shadow) traverseSerializedBlocks(input.shadow, cb);
      }
    }
    if (node.next && node.next.block) traverseSerializedBlocks(node.next.block, cb);
  }

  /* -------------------------
     UI: modal creation and rendering
  --------------------------*/
  function createModal() {
    // Remove if present
    removeModal();

    overlayEl = document.createElement("div");
    overlayEl.style.position = "fixed";
    overlayEl.style.top = "0";
    overlayEl.style.left = "0";
    overlayEl.style.width = "100%";
    overlayEl.style.height = "100%";
    overlayEl.style.background = "rgba(0,0,0,0.6)";
    overlayEl.style.zIndex = "999999";
    overlayEl.style.display = "flex";
    overlayEl.style.alignItems = "center";
    overlayEl.style.justifyContent = "center";

    modalEl = document.createElement("div");
    modalEl.style.width = "min(1100px, 92vw)";
    modalEl.style.height = "min(700px, 86vh)";
    modalEl.style.background = "#0f0f10";
    modalEl.style.borderRadius = "8px";
    modalEl.style.boxShadow = "0 8px 40px rgba(0,0,0,0.8)";
    modalEl.style.color = "#fff";
    modalEl.style.padding = "14px";
    modalEl.style.overflow = "hidden";
    modalEl.style.display = "flex";
    modalEl.style.flexDirection = "column";
    modalEl.style.fontFamily = "Arial, sans-serif";

    // header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.marginBottom = "8px";

    const title = document.createElement("div");
    title.innerText = "Extended Variable Manager";
    title.style.fontSize = "18px";
    title.style.fontWeight = "700";

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Close";
    closeBtn.style.padding = "6px 10px";
    closeBtn.style.border = "none";
    closeBtn.style.borderRadius = "6px";
    closeBtn.style.background = "#2b2b2b";
    closeBtn.style.color = "#fff";
    closeBtn.onclick = () => removeModal();

    header.appendChild(title);
    header.appendChild(closeBtn);
    modalEl.appendChild(header);

    // main content container
    const content = document.createElement("div");
    content.style.display = "flex";
    content.style.flex = "1 1 auto";
    content.style.overflow = "hidden";
    content.style.gap = "12px";

    // left: category list
    const left = document.createElement("div");
    left.style.width = "220px";
    left.style.background = "#121213";
    left.style.borderRadius = "6px";
    left.style.padding = "8px";
    left.style.overflowY = "auto";

    const catTitle = document.createElement("div");
    catTitle.innerText = "Categories";
    catTitle.style.fontWeight = "600";
    catTitle.style.marginBottom = "8px";
    left.appendChild(catTitle);

    const catList = document.createElement("div");
    catList.style.display = "flex";
    catList.style.flexDirection = "column";
    catList.style.gap = "6px";

    // buttons for categories
    CATEGORIES.forEach((cat, idx) => {
      const b = document.createElement("button");
      b.innerText = cat;
      b.style.textAlign = "left";
      b.style.padding = "6px";
      b.style.border = "none";
      b.style.borderRadius = "4px";
      b.style.background = "#141416";
      b.style.color = "#ddd";
      b.style.cursor = "pointer";
      b.dataset.category = cat;
      b.onclick = () => renderCategory(cat);
      catList.appendChild(b);
    });
    left.appendChild(catList);

    // center: variable list
    const center = document.createElement("div");
    center.style.flex = "1 1 auto";
    center.style.background = "#0b0b0c";
    center.style.borderRadius = "6px";
    center.style.padding = "8px";
    center.style.overflow = "auto";
    center.style.display = "flex";
    center.style.flexDirection = "column";

    const centerHeader = document.createElement("div");
    centerHeader.style.display = "flex";
    centerHeader.style.justifyContent = "space-between";
    centerHeader.style.alignItems = "center";
    centerHeader.style.marginBottom = "8px";

    const centerTitle = document.createElement("div");
    centerTitle.innerText = "Variables";
    centerTitle.style.fontWeight = "600";

    const addAllBtn = document.createElement("button");
    addAllBtn.textContent = "Add Variable";
    addAllBtn.style.padding = "6px 10px";
    addAllBtn.style.border = "none";
    addAllBtn.style.borderRadius = "6px";
    addAllBtn.style.background = "#2a7a2a";
    addAllBtn.style.color = "#fff";

    addAllBtn.onclick = () => {
      // fallback: add to currently selected category or Global
      const cur = center.dataset.category || "Global";
      createVariableViaUi(cur);
    };

    centerHeader.appendChild(centerTitle);
    centerHeader.appendChild(addAllBtn);
    center.appendChild(centerHeader);

    const varList = document.createElement("div");
    varList.style.display = "flex";
    varList.style.flexDirection = "column";
    varList.style.gap = "6px";
    varList.style.flex = "1 1 auto";
    varList.style.minHeight = "0";
    center.appendChild(varList);

    // right: detail panel
    const right = document.createElement("div");
    right.style.width = "280px";
    right.style.background = "#111112";
    right.style.borderRadius = "6px";
    right.style.padding = "8px";
    right.style.overflow = "auto";

    const rightTitle = document.createElement("div");
    rightTitle.innerText = "Details";
    rightTitle.style.fontWeight = "600";
    rightTitle.style.marginBottom = "8px";
    right.appendChild(rightTitle);

    const detailBox = document.createElement("div");
    detailBox.style.color = "#ddd";
    right.appendChild(detailBox);

    content.appendChild(left);
    content.appendChild(center);
    content.appendChild(right);

    modalEl.appendChild(content);
    overlayEl.appendChild(modalEl);
    document.body.appendChild(overlayEl);

    // store references
    modalEl._catList = catList;
    modalEl._varList = varList;
    modalEl._detailBox = detailBox;
    modalEl._center = center;

    // default render Global
    renderCategory("Global");

    // close on overlay click outside modal
    overlayEl.addEventListener("click", (ev) => {
      if (ev.target === overlayEl) removeModal();
    });
  }

  function removeModal() {
    if (overlayEl) {
      try { overlayEl.remove(); } catch (e) {}
      overlayEl = null;
      modalEl = null;
    }
  }

  // Render helpers
  function renderCategory(category) {
    if (!modalEl) return;
    modalEl._center.dataset.category = category;
    const listEl = modalEl._varList;
    listEl.innerHTML = "";

    const heading = document.createElement("div");
    heading.style.fontWeight = "700";
    heading.style.marginBottom = "6px";
    heading.innerText = category;
    listEl.appendChild(heading);

    const arr = state.variables[category] || [];
    if (arr.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "#888";
      empty.innerText = "(no variables)";
      listEl.appendChild(empty);
    }

    const ws = _Blockly.getMainWorkspace();

    arr.forEach((v) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px";
      row.style.background = "#0d0d0e";
      row.style.borderRadius = "4px";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";

      const name = document.createElement("div");
      name.innerText = v.name;
      name.style.fontWeight = "600";

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.color = "#9aa";
      meta.innerText = v.type ? v.type : category;

      // usage count
      const usage = document.createElement("div");
      usage.style.fontSize = "12px";
      usage.style.color = "#9aa";
      const usedCount = countVariableUsage(ws, v);
      usage.innerText = "Used: " + usedCount;

      left.appendChild(name);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "6px";

      const editBtn = document.createElement("button");
      editBtn.innerText = "Edit";
      editBtn.style.padding = "4px 6px";
      editBtn.style.border = "none";
      editBtn.style.borderRadius = "4px";
      editBtn.style.background = "#2b2b2b";
      editBtn.style.color = "#fff";

      editBtn.onclick = () => openEditPanel(category, v);

      const delBtn = document.createElement("button");
      delBtn.innerText = "Delete";
      delBtn.style.padding = "4px 6px";
      delBtn.style.border = "none";
      delBtn.style.borderRadius = "4px";
      delBtn.style.background = "#7a2a2a";
      delBtn.style.color = "#fff";

      delBtn.onclick = () => {
        if (!confirm(`Delete variable "${v.name}"? This may break blocks that reference it.`)) return;
        deleteVariable(category, v.id);
        renderCategory(category);
        saveState();
      };

      right.appendChild(editBtn);
      right.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(usage);
      row.appendChild(right);

      listEl.appendChild(row);
    });
  }

  function openEditPanel(category, varDef) {
    if (!modalEl) return;
    const detail = modalEl._detailBox;
    detail.innerHTML = "";

    const title = document.createElement("div");
    title.innerText = `Edit: ${varDef.name}`;
    title.style.fontWeight = "700";
    title.style.marginBottom = "8px";
    detail.appendChild(title);

    const nameLabel = document.createElement("div");
    nameLabel.innerText = "Name";
    nameLabel.style.fontSize = "12px";
    detail.appendChild(nameLabel);

    const nameInput = document.createElement("input");
    nameInput.value = varDef.name;
    nameInput.style.width = "100%";
    nameInput.style.padding = "6px";
    nameInput.style.marginBottom = "8px";
    detail.appendChild(nameInput);

    const typeLabel = document.createElement("div");
    typeLabel.innerText = "Type";
    typeLabel.style.fontSize = "12px";
    detail.appendChild(typeLabel);

    const typeInput = document.createElement("input");
    typeInput.value = varDef.type || category;
    typeInput.style.width = "100%";
    typeInput.style.padding = "6px";
    typeInput.style.marginBottom = "8px";
    detail.appendChild(typeInput);

    const saveBtn = document.createElement("button");
    saveBtn.innerText = "Save";
    saveBtn.style.padding = "6px";
    saveBtn.style.border = "none";
    saveBtn.style.borderRadius = "6px";
    saveBtn.style.background = "#2b7a2b";
    saveBtn.style.color = "#fff";
    saveBtn.onclick = () => {
      const newName = nameInput.value.trim();
      const newType = typeInput.value.trim() || category;
      if (!newName) {
        alert("Name cannot be empty");
        return;
      }
      if (isDuplicateName(newName, category, varDef.id)) {
        alert("Duplicate variable name not allowed in same category");
        return;
      }
      // rename in state and update workspace variable if present
      varDef.name = newName;
      varDef.type = newType;
      try {
        const ws = _Blockly.getMainWorkspace();
        // attempt to find workspace variable by id and update its name/type via varMap APIs
        const map = workspaceGetVariableMap(ws);
        if (map) {
          const existing = (map.getVariableById && map.getVariableById(varDef.id))
            || (map.getVariable && map.getVariable(varDef.id));
          if (existing) {
            try { existing.name = newName; } catch (e) {}
            try { existing.type = newType; } catch (e) {}
          }
        }
      } catch (e) {
        console.warn("[ExtVars] rename workspace var failed:", e);
      }

      saveState();
      renderCategory(category);
      detail.innerHTML = "";
    };

    detail.appendChild(saveBtn);
  }

  function isDuplicateName(name, category, skipId) {
    const arr = state.variables[category] || [];
    return arr.some(v => v.name === name && v.id !== skipId);
  }

  function createVariableViaUi(category) {
    const name = prompt("New variable name (no duplicates):");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isDuplicateName(trimmed, category)) {
      alert("Duplicate name in this category. Choose a different name.");
      return;
    }
    const id = makeSequentialId();
    const varDef = { id: id, name: trimmed, type: category };
    state.variables[category].push(varDef);
    // register to workspace
    try {
      const ws = _Blockly.getMainWorkspace();
      createWorkspaceVariable(ws, varDef.name, varDef.type, varDef.id);
    } catch (e) {
      console.warn("[ExtVars] create variable failed:", e);
    }
    saveState();
    renderCategory(category);
  }

  function deleteVariable(category, id) {
    const arr = state.variables[category] || [];
    const idx = arr.findIndex(x => x.id === id);
    if (idx >= 0) arr.splice(idx, 1);
    // attempt to delete from workspace variable maps
    try {
      const ws = _Blockly.getMainWorkspace();
      deleteWorkspaceVariable(ws, id);
    } catch (e) {
      console.warn("[ExtVars] deleteWorkspaceVariable attempt failed:", e);
    }
    saveState();
  }

  // Build UI once per plugin; show modal when user clicks Manage Variables
  function openManagerModal() {
    if (!modalEl) createModal();
    // ensure state loaded and categories present
    for (const c of CATEGORIES) if (!state.variables[c]) state.variables[c] = [];
    renderCategory("Global");
  }

  // menu registration: add to workspace context menu
  function registerContextMenu() {
    const item = {
      id: "manageExtendedVariables",
      displayText: "Manage Variables",
      preconditionFn: () => "enabled",
      callback: openManagerModal,
      scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
      weight: 98
    };

    try {
      const reg = _Blockly.ContextMenuRegistry.registry;
      if (reg.getItem(item.id)) reg.unregister(item.id);
      reg.register(item);
    } catch (e) {
      console.warn("[ExtVars] Context menu registration failed:", e);
    }
  }

  // On workspace load: create variables from saved state (if not present)
  function registerAllVariablesInWorkspace(ws) {
    try {
      for (const cat of CATEGORIES) {
        const arr = state.variables[cat] || [];
        for (const v of arr) {
          if (!workspaceHasVariableWithId(ws, v.id) && !workspaceHasVariableWithName(ws, v.name)) {
            try {
              createWorkspaceVariable(ws, v.name, v.type || cat, v.id);
            } catch (e) {
              console.warn("[ExtVars] createWorkspaceVariable failed:", e);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[ExtVars] registerAllVariablesInWorkspace error:", e);
    }
  }

  // Hook: keep UI usage counts updated when workspace changes
  function workspaceChangeListener(event) {
    if (!modalEl) return;
    // re-render category to update 'Used' counts
    try {
      const cur = modalEl._center && modalEl._center.dataset.category || "Global";
      renderCategory(cur);
    } catch (e) {}
  }

  // Init plugin
  plugin.initializeWorkspace = function () {
    try {
      // load data
      loadState();

      // ensure variables registered
      const ws = _Blockly.getMainWorkspace();
      if (ws) registerAllVariablesInWorkspace(ws);

      // register menu item
      registerContextMenu();

      // attach change listener to update usage counts live
      try {
        ws.removeChangeListener && ws.removeChangeListener(workspaceChangeListener);
        ws.addChangeListener && ws.addChangeListener(workspaceChangeListener);
      } catch (e) {}

      console.info("[ExtVars] Extended Variable Manager initialized.");
    } catch (err) {
      console.error("[ExtVars] Initialization failed:", err);
    }
  };

  // expose for debugging
  plugin.__extvars_state = state;
  plugin.openManager = openManagerModal;
})();
