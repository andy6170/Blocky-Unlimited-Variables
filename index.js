// ===============================
//  Battlefield Portal Extended Variable Manager (Final Fixed Version)
// ===============================
(function () {

  // ===== Safe access to plugin (not used for persistence anymore) =====
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins) {
      plugin = BF2042Portal.Plugins.getPlugin("bf-portal-extended-variable-manager") || { id: "bf-portal-extended-variable-manager" };
    }
  } catch (e) {
    plugin = { id: "bf-portal-extended-variable-manager" };
  }

  // ===============================
  //  Workspace Safe Access
  // ===============================
  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly.getMainWorkspace) {
        return _Blockly.getMainWorkspace();
      }
      if (typeof Blockly !== "undefined" && Blockly.getMainWorkspace) {
        return Blockly.getMainWorkspace();
      }
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) {
        return BF2042Portal.getMainWorkspace();
      }
    } catch (e) {}
    return null;
  }

  function workspaceGetVariableMap(ws) {
    if (!ws) return null;
    if (typeof ws.getVariableMap === "function") return ws.getVariableMap();
    if (ws.variableMap_) return ws.variableMap_;
    return null;
  }

  // ===============================
  //  Categories
  // ===============================
  const categories = [
    "Global", "AreaTrigger", "CapturePoint", "EmplacementSpawner", "HQ", "InteractPoint",
    "LootSpawner", "MCOM", "Player", "RingOfFire", "ScreenEffect", "Sector",
    "SFX", "SpatialObject", "Spawner", "SpawnPoint", "Team", "Vehicle",
    "VehicleSpawner", "VFX", "VO", "WaypointPath", "WorldIcon"
  ];

  // ===============================
  //  Inject UI styling
  // ===============================
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .varPopupOverlay {
        position: fixed; top:0; left:0; right:0; bottom:0;
        background:rgba(0,0,0,0.55); display:flex;
        justify-content:center; align-items:center;
        z-index:999999;
      }
      .varPopup {
        background:#1a1a1a; padding:18px; width:750px;
        max-height:80vh; overflow:hidden; display:flex;
        border-radius:8px; box-shadow:0 0 25px rgba(0,0,0,0.5);
      }
      .varCategories {
        width:200px; overflow-y:auto; border-right:1px solid #333; padding-right:10px;
      }
      .variable-category {
        padding:6px 10px; cursor:pointer; border-radius:4px;
        margin-bottom:4px; color:#ddd;
      }
      .variable-category:hover { background:rgba(255,255,255,0.05); }
      .variable-category.selected { background:rgba(255,255,255,0.12); border-left:3px solid #00eaff; }

      .varList { flex:1; overflow-y:auto; padding-left:15px; color:#ddd; }

      .varEntry {
        padding:6px; background:#222; margin-bottom:6px;
        border-radius:4px; display:flex;
        justify-content:space-between; align-items:center;
      }

      .smallMuted { color:#9aa; font-size:12px; }

      .blueBtn {
        background:#007bff; padding:5px 12px; border-radius:4px;
        cursor:pointer; margin-left:6px; color:#fff; border:none;
      }

      .redBtn {
        background:#cc0000; padding:5px 12px; border-radius:4px;
        cursor:pointer; margin-left:6px; color:#fff; border:none;
      }
    `;
    document.head.appendChild(style);
  })();

  // ===============================
  //  Count usage of variables by NAME only
  // ===============================
  function computeUsageCounts() {
    const ws = getMainWorkspaceSafe();
    if (!ws) return {};

    const counts = {};
    const vars = ws.getVariableMap().getVariables();

    vars.forEach(v => counts[v.name.toLowerCase()] = 0);

    const blocks = ws.getAllBlocks(false) || [];

    blocks.forEach(block => {
      const inputs = block.inputList || [];
      inputs.forEach(input => {
        input.fieldRow.forEach(field => {
          if (field && typeof field.getValue === "function") {
            const id = field.getValue();
            if (!id) return;

            const match = vars.find(v => v.getId() === id);
            if (!match) return;

            const key = match.name.toLowerCase();
            counts[key] = (counts[key] || 0) + 1;
          }
        });
      });
    });

    return counts;
  }

  // ===============================
  //  Build live registry from workspace
  // ===============================
  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const map = workspaceGetVariableMap(ws);
    const vars = map ? map.getVariables() : [];

    const usage = computeUsageCounts();

    const reg = {};
    categories.forEach(c => reg[c] = []);

    vars.forEach(v => {
      const cat = v.type || "Global";
      if (!reg[cat]) reg[cat] = [];

      reg[cat].push({
        id: v.getId(),
        name: v.name,
        type: cat,
        usage: usage[v.name.toLowerCase()] || 0
      });
    });

    return reg;
  }

  // ===============================
  //  Sequential ID generator
  // ===============================
  function makeNextSequentialId() {
    const ws = getMainWorkspaceSafe();
    if (!ws) return "EV_0001";
    const vars = ws.getVariableMap().getVariables();
    let max = 0;

    vars.forEach(v => {
      if (v.getId && v.getId().startsWith("EV_")) {
        const n = parseInt(v.getId().slice(3), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });

    return "EV_" + String(max + 1).padStart(4, "0");
  }

  // ===============================
  //  Add, Edit, Delete
  // ===============================
  function addVariable(name, category) {
    const ws = getMainWorkspaceSafe();
    if (!ws) return;
    const map = workspaceGetVariableMap(ws);

    const id = makeNextSequentialId();
    map.createVariable(name, category, id);
  }

  function renameVariable(varDef, newName) {
    const ws = getMainWorkspaceSafe();
    if (!ws) return;
    const map = workspaceGetVariableMap(ws);

    const existing = map.getVariableById(varDef.id);
    if (existing) existing.name = newName;
  }

  function deleteVariable(varDef) {
    const ws = getMainWorkspaceSafe();
    if (!ws) return;
    const map = workspaceGetVariableMap(ws);

    map.deleteVariableById(varDef.id);
  }

  // ===============================
  //  Variable Manager UI
  // ===============================
  function openVariableManager() {
    let currentCategory = categories[0];

    const overlay = document.createElement("div");
    overlay.className = "varPopupOverlay";

    const popup = document.createElement("div");
    popup.className = "varPopup";

    const categoryList = document.createElement("div");
    categoryList.className = "varCategories";

    const variableList = document.createElement("div");
    variableList.className = "varList";

    popup.appendChild(categoryList);
    popup.appendChild(variableList);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    function rebuildCategories() {
      const live = getLiveRegistry();
      categoryList.innerHTML = "";

      categories.forEach(category => {
        const el = document.createElement("div");
        el.className = "variable-category";

        // Sum usage for category
        const sum = live[category].reduce((a,v)=>a+v.usage, 0);

        el.textContent = `${category} (${sum})`;

        if (category === currentCategory) el.classList.add("selected");

        el.onclick = () => {
          currentCategory = category;
          rebuildCategories();
          rebuildVariableList();
        };
        categoryList.appendChild(el);
      });
    }

    function rebuildVariableList() {
      const live = getLiveRegistry();
      const arr = live[currentCategory];

      variableList.innerHTML = "";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.marginBottom = "8px";

      const h = document.createElement("div");
      h.innerHTML = `<strong>${currentCategory} Variables</strong>`;
      header.appendChild(h);

      const addBtn = document.createElement("button");
      addBtn.className = "blueBtn";
      addBtn.textContent = "Add";
      addBtn.onclick = () => {
        const name = prompt("New variable name:");
        if (!name) return;
        addVariable(name.trim(), currentCategory);
        rebuildCategories();
        rebuildVariableList();
      };
      header.appendChild(addBtn);

      variableList.appendChild(header);

      if (!arr.length) {
        const empty = document.createElement("div");
        empty.className = "smallMuted";
        empty.textContent = "(no variables)";
        variableList.appendChild(empty);
        return;
      }

      arr.forEach(v => {
        const row = document.createElement("div");
        row.className = "varEntry";

        const left = document.createElement("div");
        left.innerHTML = `
          <div style="font-weight:600">${v.name}</div>
          <div class="smallMuted">Used: ${v.usage}</div>
        `;

        const right = document.createElement("div");

        const editBtn = document.createElement("button");
        editBtn.className = "blueBtn";
        editBtn.textContent = "Edit";
        editBtn.onclick = () => {
          const newName = prompt("Edit variable name:", v.name);
          if (!newName) return;
          renameVariable(v, newName.trim());
          rebuildCategories();
          rebuildVariableList();
        };

        const delBtn = document.createElement("button");
        delBtn.className = "redBtn";
        delBtn.textContent = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"?`)) return;
          deleteVariable(v);
          rebuildCategories();
          rebuildVariableList();
        };

        right.appendChild(editBtn);
        right.appendChild(delBtn);

        row.appendChild(left);
        row.appendChild(right);

        variableList.appendChild(row);
      });
    }

    overlay.onclick = (ev) => {
      if (ev.target === overlay) overlay.remove();
    };

    rebuildCategories();
    rebuildVariableList();
  }

  // ===============================
  //  Add to Blockly Context Menu
  // ===============================
  function registerMenu() {
    try {
      const reg =
        (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry)
          ? _Blockly.ContextMenuRegistry.registry
          : (typeof Blockly !== "undefined" && Blockly.ContextMenuRegistry)
          ? Blockly.ContextMenuRegistry.registry
          : null;

      if (reg && reg.register) {
        const item = {
          id: "extVarMgr",
          displayText: "Manage Variables",
          preconditionFn: () => "enabled",
          callback: () => openVariableManager(),
          scopeType:
            (typeof _Blockly !== "undefined" && _Blockly.ContextMenuRegistry)
              ? _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
              : Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
          weight: 98
        };

        try { reg.unregister("extVarMgr"); } catch(e) {}
        reg.register(item);
        return;
      }
    } catch(e){}

    // DOM fallback
    document.addEventListener("contextmenu", () => {
      setTimeout(() => {
        const menu = document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
        if (!menu) return;
        if (menu.querySelector("[data-extvars]")) return;
        const btn = document.createElement("div");
        btn.textContent = "Manage Variables";
        btn.setAttribute("data-extvars","1");
        btn.style.padding = "6px 10px";
        btn.style.cursor = "pointer";
        btn.onclick = () => {
          openVariableManager();
          menu.style.display = "none";
        };
        menu.appendChild(btn);
      },40);
    });
  }

  // ===============================
  //  Init
  // ===============================
  setTimeout(() => {
    registerMenu();
    if (plugin) plugin.openExtendedVariables = openVariableManager;
    console.info("[ExtVars] Extended Variable Manager loaded.");
  }, 800);

})();
