// ===============================
//  Battlefield Portal Variable Manager Plugin (fixed)
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
      // try BF2042Portal helper if available
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) {
        try { return BF2042Portal.getMainWorkspace(); } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  // ====== VARIABLE REGISTRY ======
  const variableRegistry = {};
  const categories = [
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
  categories.forEach(c => variableRegistry[c] = []);

  // ===============================
  //  Inject CSS for popup + highlight
  // ===============================
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
        .varPopupOverlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.55);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999999;
        }
        .varPopup {
            background: #1a1a1a;
            padding: 18px;
            width: 750px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            border-radius: 8px;
            box-shadow: 0 0 25px rgba(0,0,0,0.5);
        }
        .varCategories {
            width: 200px;
            overflow-y: auto;
            border-right: 1px solid #333;
            padding-right: 10px;
        }
        .variable-category {
            padding: 6px 10px;
            cursor: pointer;
            border-radius: 4px;
            margin-bottom: 4px;
            color: #ddd;
            background: transparent;
        }
        .variable-category:hover {
            background-color: rgba(255,255,255,0.05);
        }
        .variable-category.selected {
            background-color: rgba(255,255,255,0.12);
            border-left: 3px solid #00eaff;
        }
        .varList {
            flex: 1;
            overflow-y: auto;
            padding-left: 15px;
            color: #ddd;
        }
        .varEntry {
            padding: 6px;
            background: #222;
            margin-bottom: 6px;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .buttonRow {
            text-align: right;
            padding-top: 12px;
        }
        .blueBtn {
            background: #007bff;
            padding: 5px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 6px;
            color: #fff;
            border: none;
        }
        .redBtn {
            background: #cc0000;
            padding: 5px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 6px;
            color: #fff;
            border: none;
        }
        .smallMuted { color: #9aa; font-size: 12px; }
    `;
    document.head.appendChild(style);
  })();

  // ===============================
  //  COUNT FIX — 1 variable = 1 count
  // ===============================
  function getVariableCount(category) {
    return variableRegistry[category] ? variableRegistry[category].length : 0;
  }

  // ===============================
  //  UNIQUE NAME VALIDATION
  // ===============================
  function validateName(category, name, ignoreId = null) {
    if (!variableRegistry[category]) return true;
    return !variableRegistry[category].some(v =>
      v.name.toLowerCase() === name.toLowerCase() &&
      v.id !== ignoreId
    );
  }

  // ===============================
  //  Next Sequential ID (EV_0001 style)
  // ===============================
  function makeNextSequentialId() {
    // find highest existing numeric suffix across registry
    let max = 0;
    for (const cat of categories) {
      for (const v of (variableRegistry[cat]||[])) {
        if (typeof v.id === "string" && v.id.startsWith("EV_")) {
          const num = parseInt(v.id.slice(3), 10);
          if (!isNaN(num) && num > max) max = num;
        }
      }
    }
    const next = max + 1;
    return "EV_" + String(next).padStart(4, "0");
  }

  // traverse utility for potential serialized nodes (kept for future usage)
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

  // ===============================
  //  Popup UI
  // ===============================
  function openVariableManager() {
    let currentCategory = categories[0];

    // build overlay + popup
    const overlay = document.createElement("div");
    overlay.className = "varPopupOverlay";

    const popup = document.createElement("div");
    popup.className = "varPopup";
    overlay.appendChild(popup);

    // left / right
    const categoryList = document.createElement("div");
    categoryList.className = "varCategories";
    const variableList = document.createElement("div");
    variableList.className = "varList";

    popup.appendChild(categoryList);
    popup.appendChild(variableList);
    document.body.appendChild(overlay);

    function rebuildCategories() {
      categoryList.innerHTML = "";
      categories.forEach(category => {
        const el = document.createElement("div");
        el.className = "variable-category";
        el.textContent = `${category} (${getVariableCount(category)})`;
        if (category === currentCategory) el.classList.add("selected");
        el.addEventListener("click", () => {
          // toggle selection styling
          categoryList.querySelectorAll(".variable-category").forEach(x => x.classList.remove("selected"));
          el.classList.add("selected");
          currentCategory = category;
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
      h1.innerHTML = `<strong>${currentCategory} Variables</strong><div class="smallMuted">Total: ${getVariableCount(currentCategory)}</div>`;
      header.appendChild(h1);

      const addBtn = document.createElement("button");
      addBtn.className = "blueBtn";
      addBtn.textContent = "Add";
      addBtn.addEventListener("click", () => openAddDialog());
      header.appendChild(addBtn);

      variableList.appendChild(header);

      const arr = variableRegistry[currentCategory] || [];
      if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.className = "smallMuted";
        empty.textContent = "(no variables)";
        variableList.appendChild(empty);
      } else {
        arr.forEach(v => {
          const row = document.createElement("div");
          row.className = "varEntry";
          const left = document.createElement("div");
          left.style.display = "flex";
          left.style.flexDirection = "column";
          left.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="smallMuted">ID: ${v.id}</div>`;
          const right = document.createElement("div");

          const editBtn = document.createElement("button");
          editBtn.className = "blueBtn";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", () => openEditDialog(v));

          const delBtn = document.createElement("button");
          delBtn.className = "redBtn";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", () => {
            if (!confirm(`Delete variable "${v.name}"? This may break blocks that reference it.`)) return;
            variableRegistry[currentCategory] = variableRegistry[currentCategory].filter(x => x.id !== v.id);
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

    function closeOverlay() {
      try { overlay.remove(); } catch (e) {}
    }

    // Add dialog: only name input; sequential ID created
    function openAddDialog() {
      const name = prompt(`Create new ${currentCategory} variable — name:`);
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      if (!validateName(currentCategory, trimmed)) {
        alert("Duplicate name in this category not allowed.");
        return;
      }
      const id = makeNextSequentialId();
      const varDef = { id: id, name: trimmed, type: currentCategory };
      variableRegistry[currentCategory].push(varDef);

      // also register in workspace variable map if available
      try {
        const ws = getMainWorkspaceSafe();
        if (ws && typeof ws.getVariableMap === "function") {
          try {
            const map = ws.getVariableMap();
            if (map && typeof map.createVariable === "function") {
              try { map.createVariable(varDef.name, varDef.type || "", varDef.id); } catch (e) { map.createVariable(varDef.name, varDef.type || ""); }
            }
          } catch (e) {}
        }
      } catch (e) {}

      rebuildCategories();
      rebuildVariableList();
    }

    // Edit dialog: only name editable
    function openEditDialog(varDef) {
      const newName = prompt("Edit variable name:", varDef.name);
      if (!newName) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      if (!validateName(currentCategory, trimmed, varDef.id)) {
        alert("Duplicate name in this category not allowed.");
        return;
      }
      varDef.name = trimmed;

      // attempt to update workspace variable name (best-effort)
      try {
        const ws = getMainWorkspaceSafe();
        if (ws) {
          const map = ws.getVariableMap ? ws.getVariableMap() : null;
          if (map) {
            try {
              // attempt to find by id then update
              let existing = null;
              if (typeof map.getVariableById === "function") existing = map.getVariableById(varDef.id);
              if (!existing && typeof map.getVariable === "function") existing = map.getVariable(varDef.id) || map.getVariable(varDef.name);
              if (existing) {
                try { existing.name = varDef.name; } catch(e) {}
              }
            } catch(e){}
          }
        }
      } catch(e){}

      rebuildCategories();
      rebuildVariableList();
    }

    // close on background click
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeOverlay();
    });

    rebuildCategories();
    rebuildVariableList();
  }

  // ===============================
  //  Context menu registration (robust)
  // ===============================
  function registerContextMenuItem() {
    // Preferred: use Blockly context menu registry if available
    try {
      const reg = (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.registry
                : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.registry
                : null;
      if (reg && typeof reg.register === "function") {
        const item = {
          id: "manageExtendedVariables",
          displayText: "Manage Variables",
          preconditionFn: () => "enabled",
          callback: () => openVariableManager(),
          scopeType: (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry) ? _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry) ? Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                      : null,
          weight: 98
        };
        // unregister if exists
        try { if (reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); } catch(e){}
        reg.register(item);
        return;
      }
    } catch (e) {
      // ignore and fallback
    }

    // Fallback: try DOM-based context menu injection (best-effort)
    (function domFallback() {
      // attach global listener that watches for a context menu DOM element and injects our item.
      document.addEventListener("contextmenu", () => {
        setTimeout(() => {
          // try some common menu selectors
          const menu = document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
          if (!menu) return;
          // Avoid adding duplicate entry
          if (menu.querySelector("[data-extvars]")) return;
          const el = document.createElement("div");
          el.setAttribute("data-extvars", "1");
          el.style.padding = "6px 10px";
          el.style.cursor = "pointer";
          el.style.color = "#fff";
          el.textContent = "Manage Variables";
          el.addEventListener("click", (e) => {
            openVariableManager();
            try { menu.style.display = "none"; } catch(e){}
          });
          // append to end
          menu.appendChild(el);
        }, 40);
      });
    })();
  }

  // ===============================
  //  Init plugin (safe)
  // ===============================
  function initialize() {
    try {
      // Try to register menu item
      registerContextMenuItem();

      // Expose helper on plugin for manual opening/debug
      if (plugin) plugin.openExtendedVariables = openVariableManager;

      console.info("[ExtVars] Extended Variable Manager initialized (fixed).");
    } catch (e) {
      console.error("[ExtVars] init failed:", e);
    }
  }

  // run init after short delay so environment is ready
  setTimeout(initialize, 800);
})();
