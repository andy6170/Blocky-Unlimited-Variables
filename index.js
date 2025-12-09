// Extended Variable Manager - Dark theme with BF6 accent (#ff0a03)
// Final stable build (left column 240px)
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

  // Storage key
  const STORAGE_KEY = pluginId + "-data-v1";

  // Categories
  const CATEGORIES = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint","LootSpawner","MCOM",
    "Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject","Spawner","SpawnPoint","Team",
    "Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];

  // Theme (dark + BF6 accent)
  const THEME = {
    bg: "#0b0b0c",
    panel: "#0f0f10",
    sidebar: "#121214",
    sidebarHover: "#1a1b1d",
    sidebarSelectedBg: "rgba(255, 10, 3, 0.08)", // subtle BF6 red
    accent: "#ff0a03", // BF6 red
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

  // State
  let state = {
    nextIdCounter: 1,
    variables: {}
  };
  function ensureStateCategories() {
    for (const c of CATEGORIES) if (!state.variables[c]) state.variables[c] = [];
  }

  // Persistence helpers
  function saveState() {
    try {
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.saveToLocalStorage === "function") {
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
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.Shared && typeof BF2042Portal.Shared.loadFromLocalStorage === "function") {
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
    ensureStateCategories();
    // ensure nextIdCounter is at least above existing EV_ ids
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

  // Workspace accessor (defensive)
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

  // Workspace variable helpers (defensive)
  function workspaceGetVariableMap(ws) {
    try {
      if (!ws) return null;
      if (typeof ws.getVariableMap === "function") return ws.getVariableMap();
      if (ws.variableMap) return ws.variableMap;
      return null;
    } catch (e) { return null; }
  }
  function workspaceHasVariableWithId(ws, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.getVariableById === "function") {
        try { return !!map.getVariableById(id); } catch (e) {}
      }
      if (typeof map.getVariable === "function") {
        try { return !!map.getVariable(id); } catch (e) {}
      }
      if (map.getVariables && typeof map.getVariables === "function") {
        return map.getVariables().some(v => v.id === id);
      }
      return false;
    } catch (e) { return false; }
  }
  function workspaceHasVariableWithName(ws, name) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.getVariableByName === "function") {
        try { return !!map.getVariableByName(name); } catch (e) {}
      }
      if (typeof map.getVariable === "function") {
        try { return !!map.getVariable(name); } catch (e) {}
      }
      if (map.getVariables && typeof map.getVariables === "function") {
        return map.getVariables().some(v => v.name === name);
      }
      return false;
    } catch (e) { return false; }
  }
  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map && typeof map.createVariable === "function") {
        try { return map.createVariable(name, type || "", id); } catch (e) { try { return map.createVariable(name, type || "", undefined); } catch (e2) {} }
      }
      if (typeof ws.createVariable === "function") {
        try { return ws.createVariable(name, type || "", id); } catch (e) { try { return ws.createVariable(name, type || "", undefined); } catch (e2) {} }
      }
      if (typeof Blockly !== "undefined" && Blockly.Variables && typeof Blockly.Variables.createVariable === "function") {
        try { return Blockly.Variables.createVariable(ws, name, type || "", id); } catch (e) {}
      }
    } catch (e) { console.warn("[ExtVars] createWorkspaceVariable error:", e); }
    return null;
  }
  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (typeof map.deleteVariable === "function") {
        try { map.deleteVariable(idOrName); return true; } catch (e) {}
      }
      if (typeof map.removeVariable === "function") {
        try { map.removeVariable(idOrName); return true; } catch (e) {}
      }
      if (map.getVariables && typeof map.getVariables === "function") {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => v.id === idOrName || v.name === idOrName);
        if (idx >= 0 && Array.isArray(vs)) {
          try { vs.splice(idx, 1); return true; } catch (e) {}
        }
      }
    } catch (e) { console.warn("[ExtVars] deleteWorkspaceVariable error:", e); }
    return false;
  }

  // Traverse serialized nodes
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

  // Count usage by scanning workspace blocks (robust)
  function countVariableUsage(ws, varDef) {
    let count = 0;
    try {
      const allBlocks = ws.getAllBlocks ? ws.getAllBlocks(false) : [];
      for (const blk of allBlocks) {
        try {
          let serial = null;
          if (_Blockly && _Blockly.serialization && _Blockly.serialization.blocks && typeof _Blockly.serialization.blocks.save === "function") {
            serial = _Blockly.serialization.blocks.save(blk);
          } else if (Blockly && Blockly.serialization && Blockly.serialization.blocks && typeof Blockly.serialization.blocks.save === "function") {
            serial = Blockly.serialization.blocks.save(blk);
          } else {
            continue;
          }
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
        } catch (e) {}
      }
    } catch (e) { console.warn("[ExtVars] usage count error:", e); }
    return count;
  }

  // make next sequential EV id (ensures unique)
  function makeNextSequentialId() {
    const id = "EV_" + String(state.nextIdCounter).padStart(4, "0");
    state.nextIdCounter += 1;
    return id;
  }

  // Register variables in workspace (create missing)
  function registerAllVariablesInWorkspace(ws) {
    try {
      for (const cat of CATEGORIES) {
        const arr = state.variables[cat] || [];
        for (const v of arr) {
          if (!workspaceHasVariableWithId(ws, v.id) && !workspaceHasVariableWithName(ws, v.name)) {
            try { createWorkspaceVariable(ws, v.name, v.type || cat, v.id); } catch (e) {}
          }
        }
      }
      // best-effort trigger: some editors update on this event
      try { document.dispatchEvent(new Event("variables_refreshed")); } catch (e) {}
    } catch (e) { console.warn("[ExtVars] registerAllVariablesInWorkspace error:", e); }
  }

  // Resync workspace variable map from state.mod.variables (hard sync)
  function resyncWorkspaceVariableMap(ws) {
    try {
      if (!ws) return;
      const map = workspaceGetVariableMap(ws);
      if (!map) return;
      // attempt to remove existing variables then re-add from state
      try {
        if (typeof map.getVariables === "function") {
          const existing = map.getVariables();
          // delete by id where possible
          for (const ex of Array.from(existing || [])) {
            try {
              if (typeof map.deleteVariableById === "function" && ex.getId) {
                try { map.deleteVariableById(ex.getId()); } catch (e) {}
              } else if (typeof map.deleteVariable === "function") {
                try { map.deleteVariable(ex); } catch (e) {}
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
      // re-add
      for (const cat of CATEGORIES) {
        for (const v of state.variables[cat] || []) {
          try { createWorkspaceVariable(ws, v.name, v.type || cat, v.id); } catch (e) {}
        }
      }
      // trigger UI refresh hooks if present
      try { if (ws.refreshToolboxSelection) ws.refreshToolboxSelection(); } catch (e) {}
      try { if (ws.toolbox_) ws.toolbox_.refreshSelection && ws.toolbox_.refreshSelection(); } catch (e) {}
      try { document.dispatchEvent(new Event("variables_refreshed")); } catch (e) {}
    } catch (e) { console.warn("[ExtVars] resyncWorkspaceVariableMap error:", e); }
  }

  // UI modal management
  let modalOverlay = null;
  function removeModal() {
    if (modalOverlay) {
      try { modalOverlay.remove(); } catch (e) {}
      modalOverlay = null;
    }
  }

  // Primary modal builder (stable, full-featured)
  function openModal() {
    // ensure latest state
    loadState();
    ensureStateCategories();
    const ws = getMainWorkspaceSafe();
    if (ws) registerAllVariablesInWorkspace(ws);

    // close any previous
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
    modalEl.style.fontFamily = "Inter, Arial, sans-serif";
    modalOverlay.appendChild(modalEl);

    // header
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

    // content
    const content = document.createElement("div");
    content.style.display = "flex";
    content.style.flex = "1 1 auto";
    content.style.gap = "12px";
    content.style.overflow = "hidden";
    modalEl.appendChild(content);

    // left (categories)
    const left = document.createElement("div");
    left.style.width = "240px"; // chosen custom width
    left.style.background = THEME.sidebar;
    left.style.borderRadius = "8px";
    left.style.padding = "10px";
    left.style.overflowY = "auto";
    content.appendChild(left);

    const catTitle = document.createElement("div");
    catTitle.innerText = "Categories";
    catTitle.style.fontWeight = "700";
    catTitle.style.marginBottom = "8px";
    left.appendChild(catTitle);

    const catList = document.createElement("div");
    catList.style.display = "flex";
    catList.style.flexDirection = "column";
    catList.style.gap = "6px";
    left.appendChild(catList);

    // center (variables)
    const center = document.createElement("div");
    center.style.flex = "1 1 auto";
    center.style.background = THEME.bg;
    center.style.borderRadius = "8px";
    center.style.padding = "10px";
    center.style.overflow = "auto";
    center.style.display = "flex";
    center.style.flexDirection = "column";
    content.appendChild(center);

    // right (details)
    const right = document.createElement("div");
    right.style.width = "320px";
    right.style.background = THEME.sidebar;
    right.style.borderRadius = "8px";
    right.style.padding = "10px";
    right.style.overflow = "auto";
    content.appendChild(right);

    // center header
    const centerHeader = document.createElement("div");
    centerHeader.style.display = "flex";
    centerHeader.style.justifyContent = "space-between";
    centerHeader.style.alignItems = "center";
    centerHeader.style.marginBottom = "8px";

    const centerTitle = document.createElement("div");
    centerTitle.innerText = "Variables";
    centerTitle.style.fontWeight = "700";

    const addBtn = document.createElement("button");
    addBtn.innerText = "Add Variable";
    addBtn.style.padding = "6px 10px";
    addBtn.style.border = "none";
    addBtn.style.borderRadius = "6px";
    addBtn.style.background = THEME.btnGreen;
    addBtn.style.color = "#fff";
    addBtn.style.cursor = "pointer";
    addBtn.onmouseenter = () => addBtn.style.background = THEME.btnGreenHover;
    addBtn.onmouseleave = () => addBtn.style.background = THEME.btnGreen;

    centerHeader.appendChild(centerTitle);
    centerHeader.appendChild(addBtn);
    center.appendChild(centerHeader);

    const varListContainer = document.createElement("div");
    varListContainer.style.display = "flex";
    varListContainer.style.flexDirection = "column";
    varListContainer.style.gap = "8px";
    varListContainer.style.flex = "1 1 auto";
    varListContainer.style.minHeight = "0";
    varListContainer.style.overflow = "auto";
    center.appendChild(varListContainer);

    // right details header
    const rightTitle = document.createElement("div");
    rightTitle.innerText = "Details";
    rightTitle.style.fontWeight = "700";
    rightTitle.style.marginBottom = "8px";
    right.appendChild(rightTitle);

    const detailBox = document.createElement("div");
    detailBox.style.color = THEME.text;
    right.appendChild(detailBox);

    // state for UI
    let currentCategory = CATEGORIES[0];

    // Utils: isDuplicate in category
    function isDuplicateName(category, name, skipId) {
      const arr = state.variables[category] || [];
      return arr.some(v => v.name.toLowerCase() === name.toLowerCase() && v.id !== skipId);
    }

    // Render categories
    function renderCategories() {
      catList.innerHTML = "";
      for (const cat of CATEGORIES) {
        const btn = document.createElement("button");
        btn.style.padding = "8px";
        btn.style.textAlign = "left";
        btn.style.border = "none";
        btn.style.borderRadius = "6px";
        btn.style.background = THEME.sidebar;
        btn.style.color = THEME.text;
        btn.style.cursor = "pointer";
        btn.style.display = "flex";
        btn.style.justifyContent = "space-between";
        btn.dataset.category = cat;
        btn.innerHTML = `<span style="font-weight:600">${cat}</span><span style="color:${THEME.muted}">${(state.variables[cat]||[]).length}</span>`;

        // hover
        btn.onmouseenter = () => {
          if (cat !== currentCategory) btn.style.background = THEME.sidebarHover;
        };
        btn.onmouseleave = () => {
          if (cat !== currentCategory) btn.style.background = THEME.sidebar;
        };

        // selected state
        if (cat === currentCategory) {
          btn.style.background = THEME.sidebarSelectedBg;
          btn.style.borderLeft = `4px solid ${THEME.accent}`;
        } else {
          btn.style.borderLeft = "4px solid transparent";
        }

        btn.onclick = () => {
          currentCategory = cat;
          renderCategories();
          renderVariables();
          detailBox.innerHTML = "";
        };
        catList.appendChild(btn);
      }
    }

    // Render variables for current category
    function renderVariables() {
      varListContainer.innerHTML = "";
      const heading = document.createElement("div");
      heading.style.display = "flex";
      heading.style.justifyContent = "space-between";
      heading.style.alignItems = "center";
      heading.style.marginBottom = "6px";
      heading.innerHTML = `<div style="font-weight:700">${currentCategory}</div><div style="color:${THEME.muted}">${(state.variables[currentCategory]||[]).length}</div>`;
      varListContainer.appendChild(heading);

      const arr = state.variables[currentCategory] || [];
      if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = THEME.muted;
        empty.innerText = "(no variables)";
        varListContainer.appendChild(empty);
        return;
      }

      const ws = getMainWorkspaceSafe();

      for (const v of arr) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "8px";
        row.style.background = THEME.varRow;
        row.style.borderRadius = "6px";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.flexDirection = "column";

        const name = document.createElement("div");
        name.innerText = v.name;
        name.style.fontWeight = "600";

        const usage = document.createElement("div");
        usage.style.fontSize = "12px";
        usage.style.color = THEME.muted;
        const usedCount = ws ? countVariableUsage(ws, v) : 0;
        usage.innerText = `In use: (${usedCount})`;

        left.appendChild(name);
        left.appendChild(usage);

        const rightCol = document.createElement("div");
        rightCol.style.display = "flex";
        rightCol.style.gap = "6px";

        const editBtn = document.createElement("button");
        editBtn.innerText = "Edit";
        editBtn.style.padding = "6px 8px";
        editBtn.style.border = "none";
        editBtn.style.borderRadius = "6px";
        editBtn.style.background = THEME.btnGray;
        editBtn.style.color = "#fff";
        editBtn.style.cursor = "pointer";
        editBtn.onmouseenter = () => editBtn.style.background = THEME.btnGrayHover;
        editBtn.onmouseleave = () => editBtn.style.background = THEME.btnGray;
        editBtn.onclick = () => openEditPanel(currentCategory, v);

        const delBtn = document.createElement("button");
        delBtn.innerText = "Delete";
        delBtn.style.padding = "6px 8px";
        delBtn.style.border = "none";
        delBtn.style.borderRadius = "6px";
        delBtn.style.background = THEME.btnRed;
        delBtn.style.color = "#fff";
        delBtn.style.cursor = "pointer";
        delBtn.onmouseenter = () => delBtn.style.background = THEME.btnRedHover;
        delBtn.onmouseleave = () => delBtn.style.background = THEME.btnRed;
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          deleteVariable(currentCategory, v.id);
          saveState();
          // resync into workspace, and re-render
          const ws2 = getMainWorkspaceSafe();
          resyncWorkspaceVariableMap(ws2);
          renderCategories();
          renderVariables();
          detailBox.innerHTML = "";
        };

        rightCol.appendChild(editBtn);
        rightCol.appendChild(delBtn);

        row.appendChild(left);
        row.appendChild(rightCol);
        varListContainer.appendChild(row);
      }
    }

    // Add variable flow
    addBtn.onclick = () => {
      const nm = prompt("New variable name (no duplicates):");
      if (!nm) return;
      const t = nm.trim();
      if (!t) return;
      if (isDuplicateName(currentCategory, t)) {
        alert("Duplicate name in this category not allowed.");
        return;
      }
      const id = makeNextSequentialId();
      const v = { id, name: t, type: currentCategory };
      state.variables[currentCategory].push(v);
      saveState();
      // ensure workspace sees it immediately
      const ws2 = getMainWorkspaceSafe();
      if (ws2) {
        try { createWorkspaceVariable(ws2, v.name, v.type, v.id); } catch (e) {}
        resyncWorkspaceVariableMap(ws2);
      }
      renderCategories();
      renderVariables();
    };

    // Edit panel (name only)
    function openEditPanel(category, varDef) {
      detailBox.innerHTML = "";
      const title = document.createElement("div");
      title.innerText = `Edit variable`;
      title.style.fontWeight = "700";
      title.style.marginBottom = "8px";
      detailBox.appendChild(title);

      const nameLabel = document.createElement("div");
      nameLabel.innerText = "Name";
      nameLabel.style.fontSize = "12px";
      nameLabel.style.color = THEME.muted;
      detailBox.appendChild(nameLabel);

      const nameInput = document.createElement("input");
      nameInput.value = varDef.name;
      nameInput.style.width = "100%";
      nameInput.style.padding = "8px";
      nameInput.style.marginTop = "6px";
      nameInput.style.marginBottom = "10px";
      nameInput.style.borderRadius = "6px";
      nameInput.style.border = "1px solid #222";
      nameInput.style.background = "#0b0b0c";
      nameInput.style.color = THEME.text;
      detailBox.appendChild(nameInput);

      const saveBtn = document.createElement("button");
      saveBtn.innerText = "Save";
      saveBtn.style.padding = "8px 12px";
      saveBtn.style.border = "none";
      saveBtn.style.borderRadius = "6px";
      saveBtn.style.background = THEME.btnGreen;
      saveBtn.style.color = "#fff";
      saveBtn.style.cursor = "pointer";
      saveBtn.onmouseenter = () => saveBtn.style.background = THEME.btnGreenHover;
      saveBtn.onmouseleave = () => saveBtn.style.background = THEME.btnGreen;
      saveBtn.onclick = () => {
        const newName = nameInput.value.trim();
        if (!newName) { alert("Name cannot be empty"); return; }
        if (isDuplicateName(category, newName, varDef.id)) { alert("Duplicate name not allowed in category"); return; }
        varDef.name = newName;
        saveState();
        // attempt to update workspace variable object (best-effort)
        try {
          const ws3 = getMainWorkspaceSafe();
          const map = workspaceGetVariableMap(ws3);
          if (map) {
            if (typeof map.getVariableById === "function") {
              const existing = map.getVariableById(varDef.id);
              if (existing && existing.name !== undefined) existing.name = newName;
            }
          }
        } catch (e) {}
        renderVariables();
        detailBox.innerHTML = "";
      };
      detailBox.appendChild(saveBtn);

      const spacer = document.createElement("div");
      spacer.style.height = "12px";
      detailBox.appendChild(spacer);

      const info = document.createElement("div");
      info.style.color = THEME.muted;
      info.innerText = `Type: ${varDef.type} (type is locked)`;
      detailBox.appendChild(info);
    }

    // delete variable
    function deleteVariable(category, id) {
      const arr = state.variables[category] || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx >= 0) arr.splice(idx, 1);
      // delete from workspace if possible
      try {
        const ws3 = getMainWorkspaceSafe();
        deleteWorkspaceVariable(ws3, id);
        resyncWorkspaceVariableMap(ws3);
      } catch (e) {}
    }

    // bottom close + click outside: both close and trigger resync (so EA manager sees variables)
    const closeBottom = document.createElement("button");
    closeBottom.innerText = "Close";
    closeBottom.style.marginTop = "10px";
    closeBottom.style.padding = "8px 12px";
    closeBottom.style.border = "none";
    closeBottom.style.borderRadius = "8px";
    closeBottom.style.background = THEME.btnGray;
    closeBottom.style.color = "#fff";
    closeBottom.style.cursor = "pointer";
    closeBottom.onmouseenter = () => closeBottom.style.background = THEME.btnGrayHover;
    closeBottom.onmouseleave = () => closeBottom.style.background = THEME.btnGray;
    closeBottom.onclick = () => {
      // final resync to workspace + persist
      try {
        const ws3 = getMainWorkspaceSafe();
        resyncWorkspaceVariableMap(ws3);
      } catch (e) {}
      removeModal();
    };
    modalEl.appendChild(closeBottom);

    // click outside closes and resyncs
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) {
        try {
          const ws3 = getMainWorkspaceSafe();
          resyncWorkspaceVariableMap(ws3);
        } catch (e) {}
        removeModal();
      }
    });

    // initial render
    renderCategories();
    renderVariables();
  }

  // Context menu registration (robust)
  function registerContextMenu() {
    try {
      const reg = (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.registry
                : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.registry
                : null;
      if (reg && typeof reg.register === "function") {
        const item = {
          id: "manageExtendedVariables",
          displayText: "Manage Variables",
          preconditionFn: () => "enabled",
          callback: () => openModal(),
          scopeType: (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : null,
          weight: 98
        };
        try { if (reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); } catch (e) {}
        reg.register(item);
        return;
      }
    } catch (e) { console.warn(e); }

    // fallback DOM injection
    (function domFallback() {
      document.addEventListener("contextmenu", () => {
        setTimeout(() => {
          const menu = document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
          if (!menu) return;
          if (menu.querySelector("[data-extvars]")) return;
          const el = document.createElement("div");
          el.setAttribute("data-extvars", "1");
          el.style.padding = "8px 12px";
          el.style.cursor = "pointer";
          el.style.color = THEME.text;
          el.style.background = "transparent";
          el.style.borderTop = "1px solid rgba(255,255,255,0.03)";
          el.textContent = "Manage Variables";
          el.onclick = () => {
            openModal();
            try { menu.style.display = "none"; } catch (e) {}
          };
          menu.appendChild(el);
        }, 40);
      });
    })();
  }

  // Expose helper
  if (plugin) plugin.openManager = openModal;

  // Initialize
  function initialize() {
    loadState();
    ensureStateCategories();
    const ws = getMainWorkspaceSafe();
    if (ws) registerAllVariablesInWorkspace(ws);
    registerContextMenu();
    console.info("[ExtVars] initialized (dark theme, BF6 accent)");
  }

  // run initialize shortly after load
  setTimeout(initialize, 800);
})();
