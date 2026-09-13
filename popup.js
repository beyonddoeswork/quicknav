document.addEventListener("DOMContentLoaded", () => {
   
  // Tab switching
   
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panels = { shortcuts: document.getElementById("panel-shortcuts"), routines: document.getElementById("panel-routines") };

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(panels).forEach(p => p.classList.remove("active"));
      panels[btn.dataset.tab].classList.add("active");
    });
  });

   
  // SHORTCUTS
   
  const keywordInput = document.getElementById("keyword");
  const urlInput = document.getElementById("url");
  const searchUrlInput = document.getElementById("searchUrl");
  const aliasesInput = document.getElementById("aliases");
  const saveBtn = document.getElementById("save-btn");
  const listContainer = document.getElementById("shortcut-list");

  function loadShortcuts() {
    chrome.storage.local.get("customShortcuts", (data) => {
      const shortcuts = data.customShortcuts || {};
      listContainer.innerHTML = "";

      const keys = Object.keys(shortcuts);
      if (keys.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">No custom shortcuts yet. Add one above.</div>`;
        return;
      }

      keys.forEach((kw) => {
        const config = shortcuts[kw];
        const row = document.createElement("div");
        row.className = "shortcut-row";
        const aliasText = (config.aliases && config.aliases.length) ? `also: ${config.aliases.join(", ")}` : "";
        row.innerHTML = `
          <div class="prompt-chip"><span class="arrow">go</span> ${escapeHtml(kw)}</div>
          <div class="shortcut-meta">
            <span class="shortcut-url">${escapeHtml(config.url || "")}</span>
            ${aliasText ? `<span class="shortcut-aliases">${escapeHtml(aliasText)}</span>` : ""}
          </div>
          <button class="btn btn-danger" data-keyword="${escapeHtml(kw)}">✕</button>
        `;
        listContainer.appendChild(row);
      });

      listContainer.querySelectorAll("button[data-keyword]").forEach(btn => {
        btn.addEventListener("click", (e) => deleteShortcut(e.target.getAttribute("data-keyword")));
      });
    });
  }

  saveBtn.addEventListener("click", () => {
    const keyword = keywordInput.value.trim().toLowerCase();
    const url = urlInput.value.trim();
    const search = searchUrlInput.value.trim();
    const aliases = aliasesInput.value.trim()
      ? aliasesInput.value.split(",").map(a => a.trim().toLowerCase()).filter(Boolean)
      : [];

    if (!keyword || !url) {
      alert("Please enter both a keyword and a URL.");
      return;
    }

    chrome.storage.local.get("customShortcuts", (data) => {
      const shortcuts = data.customShortcuts || {};
      shortcuts[keyword] = { url, search, aliases };

      chrome.storage.local.set({ customShortcuts: shortcuts }, () => {
        keywordInput.value = "";
        urlInput.value = "";
        searchUrlInput.value = "";
        aliasesInput.value = "";
        loadShortcuts();
      });
    });
  });

  function deleteShortcut(keyword) {
    chrome.storage.local.get("customShortcuts", (data) => {
      const shortcuts = data.customShortcuts || {};
      delete shortcuts[keyword];
      chrome.storage.local.set({ customShortcuts: shortcuts }, loadShortcuts);
    });
  }

   
  // Routines
   
  const routineSelect = document.getElementById("routine-select");
  const newRoutineBtn = document.getElementById("new-routine-btn");
  const routineLabelInput = document.getElementById("routine-label");
  const routineStepsContainer = document.getElementById("routine-steps");
  const newStepUrlInput = document.getElementById("new-step-url");
  const addStepBtn = document.getElementById("add-step-btn");
  const saveRoutineBtn = document.getElementById("save-routine-btn");
  const deleteRoutineBtn = document.getElementById("delete-routine-btn");

  // Hard coded shouldn't have any erros for now... [POTENTIAL ERROR - CODE HC]
  // Can be changes via popup.html and popup.js 

  const defaultRoutines = {
    morning: {
      label: "Morning Routine",
      urls: [
        "https://mail.google.com",
        "https://calendar.google.com",
        "https://news.google.com"
      ]
    }
  };

  let routinesCache = {};
  let currentRoutineKey = "morning";
  // in-memory draft of the steps for the routine being edited right now
  let draftUrls = [];

  function loadRoutines(preferredKey) {
    chrome.storage.local.get("routines", (data) => {
      routinesCache = data.routines || defaultRoutines;
      if (Object.keys(routinesCache).length === 0) {
        routinesCache = { morning: { label: "Morning Routine", urls: [] } };
      }

      const keys = Object.keys(routinesCache);
      currentRoutineKey = preferredKey && routinesCache[preferredKey] ? preferredKey : keys[0];

      renderRoutineSelect();
      renderRoutineEditor();
    });
  }

  function renderRoutineSelect() {
    routineSelect.innerHTML = "";
    Object.keys(routinesCache).forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      if (key === currentRoutineKey) opt.selected = true;
      routineSelect.appendChild(opt);
    });
  }

  function renderRoutineEditor() {
    const routine = routinesCache[currentRoutineKey] || { label: currentRoutineKey, urls: [] };
    routineLabelInput.value = currentRoutineKey;
    draftUrls = [...(routine.urls || [])];
    renderSteps();
  }

  function renderSteps() {
    routineStepsContainer.innerHTML = "";
    if (draftUrls.length === 0) {
      routineStepsContainer.innerHTML = `<div class="empty-state">No tabs yet — add one below.</div>`;
      return;
    }

    draftUrls.forEach((url, idx) => {
      const row = document.createElement("div");
      row.className = "step-row";
      row.innerHTML = `
        <div class="step-num">${idx + 1}</div>
        <div class="step-url">${escapeHtml(url)}</div>
        <div class="step-actions">
          <button data-action="up" data-idx="${idx}" title="Move up">↑</button>
          <button data-action="down" data-idx="${idx}" title="Move down">↓</button>
          <button data-action="remove" data-idx="${idx}" title="Remove">✕</button>
        </div>
      `;
      routineStepsContainer.appendChild(row);
    });

    routineStepsContainer.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const action = btn.getAttribute("data-action");
        if (action === "remove") {
          draftUrls.splice(idx, 1);
        } else if (action === "up" && idx > 0) {
          [draftUrls[idx - 1], draftUrls[idx]] = [draftUrls[idx], draftUrls[idx - 1]];
        } else if (action === "down" && idx < draftUrls.length - 1) {
          [draftUrls[idx + 1], draftUrls[idx]] = [draftUrls[idx], draftUrls[idx + 1]];
        }
        renderSteps();
      });
    });
  }

  routineSelect.addEventListener("change", () => {
    currentRoutineKey = routineSelect.value;
    renderRoutineEditor();
  });

  newRoutineBtn.addEventListener("click", () => {
    const name = prompt("Name this routine (this is what you'll type after \"go\", e.g. \"evening\"):");
    if (!name) return;
    const key = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!key) return;
    if (routinesCache[key]) {
      alert("A routine with that name already exists.");
      currentRoutineKey = key;
      renderRoutineSelect();
      renderRoutineEditor();
      return;
    }
    routinesCache[key] = { label: key, urls: [] };
    chrome.storage.local.set({ routines: routinesCache }, () => {
      currentRoutineKey = key;
      renderRoutineSelect();
      renderRoutineEditor();
    });
  });

  addStepBtn.addEventListener("click", () => {
    let url = newStepUrlInput.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    draftUrls.push(url);
    newStepUrlInput.value = "";
    renderSteps();
  });

  newStepUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addStepBtn.click();
  });

  saveRoutineBtn.addEventListener("click", () => {
    const newKeyRaw = routineLabelInput.value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!newKeyRaw) {
      alert("Give this routine a name.");
      return;
    }

    // If the user renamed the routine, move its data to the new key
    if (newKeyRaw !== currentRoutineKey) {
      delete routinesCache[currentRoutineKey];
      currentRoutineKey = newKeyRaw;
    }

    routinesCache[currentRoutineKey] = { label: currentRoutineKey, urls: draftUrls };

    chrome.storage.local.set({ routines: routinesCache }, () => {
      renderRoutineSelect();
      renderRoutineEditor();
      saveRoutineBtn.textContent = "Saved ✓";
      setTimeout(() => { saveRoutineBtn.textContent = "Save routine"; }, 1200);
    });
  });

  deleteRoutineBtn.addEventListener("click", () => {
    const keys = Object.keys(routinesCache);
    if (keys.length <= 1) {
      alert("You need at least one routine. Edit it instead of deleting it.");
      return;
    }
    if (!confirm(`Delete the "${currentRoutineKey}" routine?`)) return;
    delete routinesCache[currentRoutineKey];
    chrome.storage.local.set({ routines: routinesCache }, () => {
      loadRoutines(Object.keys(routinesCache)[0]);
    });
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  loadShortcuts();
  loadRoutines("morning");
});
