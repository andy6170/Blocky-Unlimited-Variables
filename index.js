// ===============================
//  Battlefield Portal Variable Manager Plugin
// ===============================

(function () {
    let workspace = null;

    // ====== VARIABLE REGISTRY ======
    // Stores variables by category: { category: [ { id, name } ] }
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

    // Initialize empty lists
    categories.forEach(c => variableRegistry[c] = []);

    // ===============================
    //  Inject CSS for popup + highlight
    // ===============================
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
        }
        .varEntry {
            padding: 6px;
            background: #222;
            margin-bottom: 6px;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
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
        }
        .redBtn {
            background: #cc0000;
            padding: 5px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 6px;
        }
    `;
    document.head.appendChild(style);

    // ===============================
    //  COUNT FIX — 1 variable = 1 count
    // ===============================
    function getVariableCount(category) {
        return variableRegistry[category].length;
    }

    // ===============================
    //  UNIQUE NAME VALIDATION
    // ===============================
    function validateName(category, name, ignoreId = null) {
        return !variableRegistry[category].some(v =>
            v.name.toLowerCase() === name.toLowerCase() &&
            v.id !== ignoreId
        );
    }

    // ===============================
    //  Next Sequential ID
    // ===============================
    function nextId(category) {
        const list = variableRegistry[category];
        if (list.length === 0) return 1;
        return Math.max(...list.map(v => v.id)) + 1;
    }

    // ===============================
    //  SHOW POPUP UI
    // ===============================
    function openVariableManager() {
        let currentCategory = categories[0];

        const overlay = document.createElement("div");
        overlay.className = "varPopupOverlay";

        const popup = document.createElement("div");
        popup.className = "varPopup";

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const categoryList = document.createElement("div");
        categoryList.className = "varCategories";

        const variableList = document.createElement("div");
        variableList.className = "varList";

        popup.appendChild(categoryList);
        popup.appendChild(variableList);

        // ----- Build category list -----
        function rebuildCategories() {
            categoryList.innerHTML = "";
            categories.forEach(category => {
                const el = document.createElement("div");
                el.className = "variable-category";
                el.textContent = `${category} (${getVariableCount(category)}/16)`;

                if (category === currentCategory) {
                    el.classList.add("selected");
                }

                el.addEventListener("click", () => {
                    document.querySelectorAll(".variable-category")
                        .forEach(x => x.classList.remove("selected"));

                    el.classList.add("selected");
                    currentCategory = category;
                    rebuildCategories();
                    rebuildVariableList();
                });

                categoryList.appendChild(el);
            });
        }

        // ----- Variable list -----
        function rebuildVariableList() {
            variableList.innerHTML = "";

            const header = document.createElement("div");
            header.innerHTML = `<h3>${currentCategory} Variables</h3>`;
            variableList.appendChild(header);

            variableRegistry[currentCategory].forEach(v => {
                const row = document.createElement("div");
                row.className = "varEntry";

                row.innerHTML = `
                    <span>${v.name}</span>
                    <div>
                        <span class="blueBtn">Edit</span>
                        <span class="redBtn">Delete</span>
                    </div>
                `;

                // EDIT (name only)
                row.querySelector(".blueBtn").addEventListener("click", () => {
                    openEditDialog(v);
                });

                // DELETE
                row.querySelector(".redBtn").addEventListener("click", () => {
                    variableRegistry[currentCategory] =
                        variableRegistry[currentCategory].filter(x => x.id !== v.id);

                    rebuildCategories();
                    rebuildVariableList();
                });

                variableList.appendChild(row);
            });

            // ADD button
            const addBtn = document.createElement("div");
            addBtn.className = "blueBtn";
            addBtn.style.marginTop = "10px";
            addBtn.textContent = "Add Variable";

            addBtn.addEventListener("click", () => {
                openAddDialog();
            });

            variableList.appendChild(addBtn);
        }

        // ===============================
        //  ADD VARIABLE DIALOG
        // ===============================
        function openAddDialog() {
            const name = prompt("Enter variable name:");
            if (!name) return;

            if (!validateName(currentCategory, name)) {
                alert("A variable with this name already exists in this category.");
                return;
            }

            const id = nextId(currentCategory);

            variableRegistry[currentCategory].push({ id, name });

            rebuildCategories();
            rebuildVariableList();
        }

        // ===============================
        //  EDIT VARIABLE DIALOG
        // ===============================
        function openEditDialog(variable) {
            const newName = prompt("Edit variable name:", variable.name);
            if (!newName) return;

            if (!validateName(currentCategory, newName, variable.id)) {
                alert("Another variable with this name already exists.");
                return;
            }

            variable.name = newName;

            rebuildCategories();
            rebuildVariableList();
        }

        // Close overlay on click outside popup
        overlay.addEventListener("click", e => {
            if (e.target === overlay) overlay.remove();
        });

        rebuildCategories();
        rebuildVariableList();
    }

    // ===============================
    //  ADD TO RIGHT-CLICK MENU
    // ===============================
    function addContextMenuItem() {
        document.addEventListener("contextmenu", () => {
            const menu = document.querySelector(".context-menu");

            if (!menu) return;

            const btn = document.createElement("div");
            btn.className = "context-menu-item";
            btn.textContent = "Manage Variables (Extended)";
            btn.addEventListener("click", () => {
                openVariableManager();
            });

            menu.appendChild(btn);
        });
    }

    // Init
    function init() {
        workspace = Blockly.getMainWorkspace();
        addContextMenuItem();
    }

    setTimeout(init, 1500);
})();
