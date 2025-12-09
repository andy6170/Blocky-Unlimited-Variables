// ===============================
//  Battlefield Portal Variable Manager Plugin (updated UI)
// ===============================
(function () {
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins) {
      plugin = BF2042Portal.Plugins.getPlugin("bf-portal-extended-variable-manager") || { id: "bf-portal-extended-variable-manager" };
    }
  } catch (e) {
    plugin = { id: "bf-portal-extended-variable-manager" };
  }

  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly.getMainWorkspace) return _Blockly.getMainWorkspace();
      if (typeof Blockly !== "undefined" && Blockly.getMainWorkspace) return Blockly.getMainWorkspace();
    } catch (e) {}
    return null;
  }

  const variableRegistry = {};
  const categories = [
    "Global","AreaTrigger","CapturePoint","EmplacementSpawner","HQ","InteractPoint",
    "LootSpawner","MCOM","Player","RingOfFire","ScreenEffect","Sector","SFX","SpatialObject",
    "Spawner","SpawnPoint","Team","Vehicle","VehicleSpawner","VFX","VO","WaypointPath","WorldIcon"
  ];
  categories.forEach(c => variableRegistry[c] = []);

  // Inject CSS — updated widths + new Close button
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
        .varPopupOverlay {
            position: fixed; top:0; left:0; right:0; bottom:0;
            background: rgba(0,0,0,0.55);
            display: flex; justify-content:center; align-items:center;
            z-index:999999;
        }
        .varPopup {
            background:#1a1a1a;
            padding:18px;
            width:750px;
            max-height:80vh;
            overflow:hidden;
            display:flex;
            border-radius:8px;
            box-shadow:0 0 25px rgba(0,0,0,0.5);
            position:relative;
        }
        .varCategories {
            width:260px;               /* widened from 200px → 260px */
            overflow-y:auto;
            border-right:1px solid #333;
            padding-right:10px;
        }
        .variable-category {
            padding:6px 10px;
            cursor:pointer;
            border-radius:4px;
            margin-bottom:4px;
            color:#ddd;
        }
        .variable-category.selected {
            background:rgba(255,255,255,0.12);
            border-left:3px solid #00eaff;
        }
        .varList {
            flex:1; overflow-y:auto; padding-left:15px; color:#ddd;
        }
        .varEntry {
            padding:6px;
            background:#222;
            margin-bottom:6px;
            border-radius:4px;
            display:flex;
            justify-content:space-between;
            align-items:center;
        }
        .buttonRow {
            text-align:right;
            margin-top:12px;
        }
        .blueBtn, .redBtn {
            padding:5px 12px;
            border-radius:4px;
            cursor:pointer;
            margin-left:6px;
            color:#fff;
            border:none;
        }
        .blueBtn { background:#007bff; }
        .redBtn { background:#cc0000; }
        .closeBtn {
            background:#444;
            color:#fff;
            padding:6px 14px;
            border-radius:4px;
            border:none;
            cursor:pointer;
            position:absolute;
            bottom:12px;
            right:12px;
        }
        .closeBtn:hover { background:#666; }
        .smallMuted { color:#9aa; font-size:12px; }
    `;
    document.head.appendChild(style);
  })();

  function getVariableCount(category) {
    return variableRegistry[category].length;
  }

  function validateName(category, name, exceptId=null) {
    return !variableRegistry[category].some(v =>
      v.name.toLowerCase() === name.toLowerCase() && v.id !== exceptId
    );
  }

  function openVariableManager() {
    let currentCategory = categories[0];

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

    // NEW — Close button
    const closeButton = document.createElement("button");
    closeButton.className = "closeBtn";
    closeButton.textContent = "Close";
    closeButton.onclick = () => overlay.remove();
    popup.appendChild(closeButton);

    document.body.appendChild(overlay);

    function rebuildCategories() {
      categoryList.innerHTML = "";
      categories.forEach(category => {
        const el = document.createElement("div");
        el.className = "variable-category";
        el.textContent = `${category} (${getVariableCount(category)})`;
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
      variableList.innerHTML = "";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.marginBottom = "8px";

      header.innerHTML = `
        <div><strong>${currentCategory} Variables</strong>
        <div class="smallMuted">Total: ${getVariableCount(currentCategory)}</div></div>
      `;

      const addBtn = document.createElement("button");
      addBtn.className = "blueBtn";
      addBtn.textContent = "Add";
      addBtn.onclick = () => openAddDialog();

      header.appendChild(addBtn);
      variableList.appendChild(header);

      const arr = variableRegistry[currentCategory];

      if (arr.length === 0) {
        variableList.innerHTML += `<div class="smallMuted">(no variables)</div>`;
        return;
      }

      arr.forEach(v => {
        const row = document.createElement("div");
        row.className = "varEntry";

        row.innerHTML = `
            <div>
                <div style="font-weight:600">${v.name}</div>
                <div class="smallMuted">In use: (${v.usage || 0})</div>
            </div>
        `;

        const buttons = document.createElement("div");

        const editBtn = document.createElement("button");
        editBtn.className = "blueBtn";
        editBtn.textContent = "Edit";
        editBtn.onclick = () => openEditDialog(v);

        const delBtn = document.createElement("button");
        delBtn.className = "redBtn";
        delBtn.textContent = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"?`)) return;
          variableRegistry[currentCategory] =
            variableRegistry[currentCategory].filter(x => x.id !== v.id);
          rebuildCategories();
          rebuildVariableList();
        };

        buttons.appendChild(editBtn);
        buttons.appendChild(delBtn);

        row.appendChild(buttons);
        variableList.appendChild(row);
      });
    }

    function openAddDialog() {
      const name = prompt("Variable name:");
      if (!name) return;
      if (!validateName(currentCategory, name)) {
        alert("Duplicate name not allowed.");
        return;
      }
      const id = "EV_" + String(Date.now()).slice(-5); // safe, unique
      variableRegistry[currentCategory].push({
        id, name, type: currentCategory, usage: 0
      });
      rebuildCategories();
      rebuildVariableList();
    }

    function openEditDialog(v) {
      const newName = prompt("Edit name:", v.name);
      if (!newName) return;
      if (!validateName(currentCategory, newName, v.id)) {
        alert("Duplicate name not allowed.");
        return;
      }
      v.name = newName;
      rebuildCategories();
      rebuildVariableList();
    }

    rebuildCategories();
    rebuildVariableList();
  }

  // context menu registration
  function registerContextMenuItem() {
    document.addEventListener("contextmenu", () => {
      setTimeout(() => {
        const menu = document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu");
        if (!menu) return;
        if (menu.querySelector("[data-extvars]")) return;
        const el = document.createElement("div");
        el.setAttribute("data-extvars", "1");
        el.style.padding = "6px 10px";
        el.style.cursor = "pointer";
        el.style.color = "#fff";
        el.textContent = "Manage Variables";
        el.onclick = () => openVariableManager();
        menu.appendChild(el);
      }, 40);
    });
  }

  registerContextMenuItem();
})();
