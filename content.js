(async function () {
  const {
    dispatchInputEvents,
    findButtonByTerms,
    findFieldByTerms,
    humanDelay,
    log,
    looksLikeSuccessMessage,
    normalizeText,
    pageContainsText,
    retry,
    setFieldValue,
    typeLikeHuman,
    throwIfAutomationCancelled,
    waitForCondition,
    waitForElement,
    waitForVisibleDocument,
    waitForUrlChange
  } = globalThis.VTUUtils;

  const {
    getAutomationStatus,
    getOverwriteExisting,
    getPanelPosition,
    getCurrentIndex,
    getImportedEntries,
    incrementCurrentIndex,
    isAutomationEnabled,
    isPanelCollapsed,
    isPanelVisible,
    setAutomationEnabled,
    setAutomationStatus,
    setCurrentIndex,
    setPanelCollapsed,
    setPanelPosition,
    setPanelVisible
  } = globalThis.VTUStorage;

  const DEFAULTS = {
    hours: "3",
    skills: ["Machine Learning"]
  };

  const SKILL_ALIASES = {
    ml: "machine learning",
    machinelearning: "machine learning",
    "nlp": "natural language processing",
    "uiux": "ui/ux",
    "ux": "ux design",
    "cv": "computer vision",
    "js": "javascript",
    "ts": "typescript"
  };

  const ALLOWED_SKILLS = [
    "3D PRINTING CONCEPTS, DESIGN AND PRINTING",
    "Accounting",
    "Adobe Illustrator",
    "Adobe Indesign",
    "Adobe Photoshop",
    "Android Studio",
    "Angular",
    "AWS",
    "Azure",
    "BIM CONCEPTS WITH MEP AND PRODUCT DESIGN",
    "BIM FOR ARCHITECTURE",
    "BIM FOR CONSTRUCTION",
    "BIM FOR HIGHWAY ENGINEERING",
    "BIM FOR STRUCTURES",
    "Business Management",
    "Business operations and Strategy",
    "C++",
    "CakePHP",
    "Canva",
    "Cassandra",
    "Circuit Design",
    "Cloud access control",
    "CodeIgniter",
    "computer vision",
    "CSS",
    "D3.js",
    "Data encryption",
    "Data modeling",
    "Data visualization",
    "Database design",
    "Design with FPGA",
    "DevOps",
    "DHCP",
    "Digital Design",
    "Docker",
    "Economics",
    "Embedded Systems",
    "entrepreneurship",
    "Figma",
    "FilamentPHP",
    "Finance",
    "Firewall configuration",
    "Flutter",
    "Game design",
    "Game development",
    "Game engine",
    "Git",
    "Godot",
    "Google Cloud",
    "HTML",
    "Human Resource Management",
    "IaaS",
    "Indexing",
    "Intelligent Machines",
    "INTERIOR AND EXTERIOR DESIGN",
    "Inventory Management",
    "IoT",
    "Java",
    "JavaScript",
    "Keras",
    "Kotlin",
    "Kubernetes",
    "LAN",
    "Laravel",
    "Layout Design",
    "Machine learning",
    "Macro economics",
    "Management Information System",
    "Manufacturing",
    "Market Theory",
    "Marketing",
    "Matplotlib",
    "Micro economics",
    "MongoDB",
    "MySQL",
    "Natural language processing",
    "Network architecture",
    "Node.js",
    "NoSQL",
    "Numpy",
    "Objective-C",
    "Operations Management",
    "PaaS",
    "Pandas",
    "PHP",
    "Physical Design",
    "Planning & Control systems",
    "PostgreSQL",
    "Power BI",
    "PRODUCT DESIGN & 3D PRINTING",
    "PRODUCT DESIGN & MANUFACTURING",
    "Python",
    "PyTorch",
    "React",
    "React.js",
    "Risk management",
    "Ruby on Rails",
    "SaaS",
    "Sales & Marketing",
    "scikit-learn",
    "Seaborn",
    "SEO",
    "SQL",
    "Statistical analysis",
    "Statistics",
    "Swift",
    "Tableau",
    "TCP/IP",
    "TensorFlow",
    "TypeScript",
    "UI/UX",
    "UX design",
    "Verification & Validations",
    "VLSI Design",
    "VPNs",
    "Vue.js",
    "WAN",
    "WordPress",
    "Xamarin",
    "Xcode"
  ];

  const TIMINGS = {
    initialSettle: [900, 1400],
    beforeCreate: [220, 420],
    beforeNextEntry: [220, 420],
    beforeDate: [420, 760],
    beforeContinue: [580, 920],
    datePickerOpen: [250, 450],
    datePickerSelect: [120, 240],
    datePickerClose: [90, 160]
  };

  const PAGE_MARKERS = {
    page1: ["select internship & date"],
    page2: ["create internship diary entry", "work summary", "what i worked on"],
    page3: ["internship diary entries", "actions", "create"],
    page4: ["edit internship diary entry", "existing internship diary entry found"]
  };

  const FLOATING_PANEL_ID = "vtu-automator-floating-panel";
  const FLOATING_PANEL_STYLE_ID = "vtu-automator-floating-style";
  const FLOATING_PANEL_VERSION = "4";

  const automationState = {
    stopRequested: false,
    currentDate: null,
    totalEntries: 0,
    suppressNextStopStatus: false
  };

  const floatingPanelState = {
    collapsed: false
  };

  globalThis.VTUAutomationControl = {
    isCancelled() {
      return automationState.stopRequested;
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (automationState.stopRequested) {
      return;
    }

    if (document.hidden) {
      updateAutomationStatus({
        state: "running",
        phase: "paused_hidden",
        message: "VTU tab is hidden. Automation will resume when the tab is active again."
      }).catch(() => {});
      return;
    }

    if (!automationState.totalEntries) {
      return;
    }

    updateAutomationStatus({
      state: "running",
      phase: "resuming",
      message: "VTU tab is active again. Resuming automation."
    }).catch(() => {});
  });

  async function updateAutomationStatus(details = {}) {
    const status = {
      state: details.state || "running",
      phase: details.phase || "working",
      page: details.page || detectPage() || null,
      date: details.date !== undefined ? details.date : automationState.currentDate,
      index: typeof details.index === "number" ? details.index : await getCurrentIndex(),
      total: typeof details.total === "number" ? details.total : automationState.totalEntries,
      message: details.message || "",
      updatedAt: new Date().toISOString()
    };

    await setAutomationStatus(status);
  }

  async function markAutomationComplete(message) {
    automationState.suppressNextStopStatus = true;
    await setAutomationEnabled(false);
    await updateAutomationStatus({
      state: "completed",
      phase: "completed",
      date: null,
      index: automationState.totalEntries,
      total: automationState.totalEntries,
      message
    });
    chrome.runtime.sendMessage({
      type: "VTU_NOTIFY",
      title: "VTU Automator",
      message
    }).catch(() => {});
  }

  function getEntriesListRows() {
    const rowSelectors = [
      "table tbody tr",
      "main .overflow-x-auto tr",
      "[role='row']",
      ".divide-y > *"
    ];

    return rowSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((row) => isVisible(row));
  }

  async function waitForEntriesListReady() {
    await waitForCondition(
      () => {
        if (detectPage() !== "page3") {
          return false;
        }

        const createButton = findCreateEntryButton();
        const rows = getEntriesListRows();
        return createButton && (rows.length > 0 || pageContainsText(["internship diary entries"]));
      },
      10000,
      180,
      "Diary entries list did not finish rendering"
    );
  }

  async function loadEntries() {
    const importedEntries = await getImportedEntries();
    const entries = importedEntries.length ? importedEntries : await (async () => {
      const url = chrome.runtime.getURL("data.json");
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Failed to load data.json: ${response.status}`);
      }

      return response.json();
    })();

    if (!Array.isArray(entries)) {
      throw new Error("data.json must be an array of entries");
    }

    const allowedSkills = ALLOWED_SKILLS;

    const normalized = entries.map((entry, index) => {
      const workSummary = entry?.workSummary ?? entry?.work_summary ?? entry?.work;
      const learningOutcomes = entry?.learningOutcomes ?? entry?.learning_outcomes ?? entry?.learning;
      const hours = entry?.hours ?? DEFAULTS.hours;
      const requestedSkills = Array.isArray(entry?.skills) && entry.skills.length
        ? entry.skills.map((skill) => String(skill))
        : DEFAULTS.skills;

      if (!entry?.date || !workSummary || !learningOutcomes) {
        throw new Error(`Invalid entry at index ${index}`);
      }

      const skills = requestedSkills.map((skill) => resolveAllowedSkill(skill, allowedSkills));

      return {
        date: String(entry.date),
        workSummary: String(workSummary),
        learningOutcomes: String(learningOutcomes),
        hours: String(hours),
        skills
      };
    });
    return normalized;
  }

  async function validateCurrentEntries() {
    const importedEntries = await getImportedEntries();
    const entries = await loadEntries();
    return {
      count: entries.length,
      dates: entries.map((entry) => entry.date),
      source: importedEntries.length ? "imported_json" : "data_json",
      skillsUsed: Array.from(new Set(entries.flatMap((entry) => entry.skills))).sort((left, right) => left.localeCompare(right))
    };
  }

  async function shouldSkipExistingEntries() {
    return !(await getOverwriteExisting());
  }

  async function requestRecoveryReload(message, phase = "reloading") {
    await updateAutomationStatus({
      state: "running",
      phase,
      message
    });

    setTimeout(() => {
      window.location.reload();
    }, 80);

    throw new Error("__VTU_RELOAD__");
  }

  function normalizeSkillKey(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, "");
  }

  function resolveAllowedSkill(skill, allowedSkills) {
    if (!allowedSkills.length) {
      return String(skill);
    }

    const requested = String(skill);
    const normalizedRequested = normalizeText(requested);
    const compactRequested = normalizeSkillKey(requested);
    const aliasTarget = SKILL_ALIASES[compactRequested];

    const exactMatch = allowedSkills.find((allowedSkill) => normalizeText(allowedSkill) === normalizedRequested);
    if (exactMatch) {
      return exactMatch;
    }

    const compactMatch = allowedSkills.find((allowedSkill) => normalizeSkillKey(allowedSkill) === compactRequested);
    if (compactMatch) {
      return compactMatch;
    }

    if (aliasTarget) {
      const aliasMatch = allowedSkills.find((allowedSkill) => normalizeText(allowedSkill) === aliasTarget);
      if (aliasMatch) {
        return aliasMatch;
      }
    }

    const partialMatch = allowedSkills.find((allowedSkill) => {
      const normalizedAllowed = normalizeText(allowedSkill);
      return normalizedAllowed.includes(normalizedRequested) || normalizedRequested.includes(normalizedAllowed);
    });

    throw new Error(
      partialMatch
        ? `Skill "${requested}" is not in the built-in VTU skill list. Did you mean "${partialMatch}"?`
        : `Skill "${requested}" is not in the built-in VTU skill list.`
    );
  }

  function isUiRunningState(state) {
    const terminalStates = ["completed", "stopped", "error", "idle"];
    const statusState = state.status?.state;
    if (statusState && terminalStates.includes(statusState)) {
      return false;
    }

    return Boolean(state.enabled);
  }

  function panelTitleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  async function readUiState() {
    const [enabled, index, status, panelVisible, panelCollapsed, panelPosition] = await Promise.all([
      isAutomationEnabled(),
      getCurrentIndex(),
      getAutomationStatus(),
      isPanelVisible(),
      isPanelCollapsed(),
      getPanelPosition()
    ]);

    return {
      enabled,
      index,
      status,
      panelVisible,
      panelCollapsed,
      panelPosition
    };
  }

  function ensureFloatingPanelStyles() {
    if (document.getElementById(FLOATING_PANEL_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = FLOATING_PANEL_STYLE_ID;
    style.textContent = `
      #${FLOATING_PANEL_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483646;
        width: 294px;
        border-radius: 26px;
        background: rgba(14, 17, 28, 0.96);
        color: #f6f8ff;
        box-shadow: 0 24px 60px rgba(7, 10, 18, 0.36);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(16px);
        font-family: "Segoe UI", sans-serif;
        overflow: hidden;
        user-select: none;
        pointer-events: auto;
      }

      #${FLOATING_PANEL_ID}.is-collapsed {
        width: 248px;
        border-radius: 999px;
      }

      #${FLOATING_PANEL_ID} * {
        box-sizing: border-box;
      }

      #${FLOATING_PANEL_ID} .vtu-shell {
        padding: 14px;
      }

      #${FLOATING_PANEL_ID} .vtu-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      #${FLOATING_PANEL_ID}.is-collapsed .vtu-header {
        display: none;
      }

      #${FLOATING_PANEL_ID} .vtu-drag-handle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        cursor: move;
        touch-action: none;
      }

      #${FLOATING_PANEL_ID} .vtu-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 11px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.07);
        color: #b8c7ff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      #${FLOATING_PANEL_ID} .vtu-chip--ghost {
        background: rgba(255, 255, 255, 0.04);
        color: rgba(214, 224, 255, 0.64);
      }

      #${FLOATING_PANEL_ID} .vtu-chip::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #6ea0ff;
        box-shadow: 0 0 0 4px rgba(110, 160, 255, 0.14);
      }

      #${FLOATING_PANEL_ID} .vtu-top-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #${FLOATING_PANEL_ID} .vtu-icon-btn {
        border: 0;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: #f6f8ff;
        cursor: pointer;
      }

      #${FLOATING_PANEL_ID} .vtu-icon-btn:hover {
        background: rgba(255, 255, 255, 0.14);
      }

      #${FLOATING_PANEL_ID} .vtu-mini {
        font-size: 17px;
        line-height: 1;
      }

      #${FLOATING_PANEL_ID} .vtu-body {
        margin-top: 12px;
      }

      #${FLOATING_PANEL_ID}.is-collapsed .vtu-body {
        display: none;
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed {
        display: none;
      }

      #${FLOATING_PANEL_ID}.is-collapsed .vtu-collapsed {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed-main {
        min-width: 0;
        cursor: move;
        touch-action: none;
        padding-left: 2px;
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed-date {
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed-state {
        margin-top: 4px;
        color: rgba(233, 238, 255, 0.58);
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed-bar {
        margin-top: 8px;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed-bar > span {
        display: block;
        width: 0;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #4f82ff 0%, #6eb7ff 100%);
      }

      #${FLOATING_PANEL_ID} .vtu-collapsed-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #${FLOATING_PANEL_ID} .vtu-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #${FLOATING_PANEL_ID} .vtu-title {
        font-size: 18px;
        line-height: 1.1;
        font-weight: 700;
      }

      #${FLOATING_PANEL_ID} .vtu-badge {
        padding: 7px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08);
        color: #e6ecff;
      }

      #${FLOATING_PANEL_ID} .vtu-badge[data-state="running"] {
        background: rgba(58, 115, 255, 0.18);
        color: #93bcff;
      }

      #${FLOATING_PANEL_ID} .vtu-badge[data-state="completed"] {
        background: rgba(75, 201, 140, 0.16);
        color: #88efbd;
      }

      #${FLOATING_PANEL_ID} .vtu-badge[data-state="error"] {
        background: rgba(255, 109, 85, 0.18);
        color: #ff9e8f;
      }

      #${FLOATING_PANEL_ID} .vtu-badge[data-state="stopped"] {
        background: rgba(255, 255, 255, 0.08);
        color: #d2daee;
      }

      #${FLOATING_PANEL_ID} .vtu-copy {
        margin-top: 8px;
        color: rgba(233, 238, 255, 0.72);
        font-size: 12px;
        line-height: 1.45;
        min-height: 34px;
      }

      #${FLOATING_PANEL_ID} .vtu-meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      #${FLOATING_PANEL_ID} .vtu-card {
        padding: 10px 11px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }

      #${FLOATING_PANEL_ID} .vtu-card-label {
        color: rgba(233, 238, 255, 0.56);
        font-size: 11px;
        margin-bottom: 4px;
      }

      #${FLOATING_PANEL_ID} .vtu-card-value {
        font-size: 15px;
        font-weight: 700;
      }

      #${FLOATING_PANEL_ID} .vtu-progress {
        margin-top: 12px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      #${FLOATING_PANEL_ID} .vtu-progress > span {
        display: block;
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, #4f82ff 0%, #6eb7ff 100%);
        transition: width 220ms ease;
      }

      #${FLOATING_PANEL_ID} .vtu-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      #${FLOATING_PANEL_ID} .vtu-primary,
      #${FLOATING_PANEL_ID} .vtu-secondary {
        border: 0;
        cursor: pointer;
        border-radius: 16px;
        padding: 12px 14px;
        font: inherit;
        font-weight: 700;
      }

      #${FLOATING_PANEL_ID} .vtu-primary {
        background: linear-gradient(135deg, #4b7bff 0%, #5a68ff 100%);
        color: #ffffff;
        grid-column: 1 / -1;
      }

      #${FLOATING_PANEL_ID} .vtu-primary[data-mode="stop"] {
        background: linear-gradient(135deg, #ff774d 0%, #ff5f6d 100%);
      }

      #${FLOATING_PANEL_ID} .vtu-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #f6f8ff;
      }

      #${FLOATING_PANEL_ID} .vtu-secondary[data-tone="danger"] {
        color: #ffd9d2;
        background: rgba(255, 114, 91, 0.12);
      }

      #${FLOATING_PANEL_ID}.is-collapsed .vtu-shell {
        padding: 10px 12px;
      }

      @media (max-width: 720px) {
        #${FLOATING_PANEL_ID} {
          right: auto;
          left: 12px;
          bottom: 12px;
          width: min(294px, calc(100vw - 24px));
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function applyFloatingPanelPosition(panel, position) {
    if (position && typeof position.x === "number" && typeof position.y === "number") {
      panel.style.left = `${position.x}px`;
      panel.style.top = `${position.y}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      return;
    }

    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "20px";
    panel.style.bottom = "20px";
  }

  function clampFloatingPanelPosition(panel, position) {
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    return {
      x: Math.min(Math.max(8, position.x), maxX),
      y: Math.min(Math.max(8, position.y), maxY)
    };
  }

  function enableFloatingPanelDrag(panel) {
    const handles = panel.querySelectorAll(".vtu-drag-handle, .vtu-collapsed-main");
    handles.forEach((handle) => {
      if (!handle || handle.dataset.dragBound === "true") {
        return;
      }

      handle.dataset.dragBound = "true";
      handle.addEventListener("pointerdown", async (event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        const move = (moveEvent) => {
          const nextPosition = clampFloatingPanelPosition(panel, {
            x: moveEvent.clientX - offsetX,
            y: moveEvent.clientY - offsetY
          });
          applyFloatingPanelPosition(panel, nextPosition);
        };

        const up = async () => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          document.removeEventListener("pointercancel", up);

          const finalRect = panel.getBoundingClientRect();
          await setPanelPosition({ x: finalRect.left, y: finalRect.top });
        };

        handle.setPointerCapture?.(event.pointerId);
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
        document.addEventListener("pointercancel", up);
      });
    });
  }

  function bindPanelButton(button, listener) {
    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await listener(event);
    });
  }

  function ensureFloatingPanelLegacy() {
    return ensureFloatingPanel();

    let panel = document.getElementById(FLOATING_PANEL_ID);
    if (panel) {
      if (panel.dataset.version === FLOATING_PANEL_VERSION) {
        return panel;
      }

      panel.remove();
    }

    ensureFloatingPanelStyles();
    panel = document.createElement("div");
    panel.id = FLOATING_PANEL_ID;
    panel.dataset.version = FLOATING_PANEL_VERSION;
    panel.innerHTML = `
      <div class="vtu-shell">
        <div class="vtu-header">
          <div class="vtu-drag-handle" title="Drag panel">
            <div class="vtu-chip">VTU Running Tab</div>
            <div class="vtu-chip vtu-chip--ghost">Move</div>
          </div>
          <div class="vtu-top-actions">
            <button class="vtu-icon-btn" type="button" data-role="collapse" aria-label="Collapse panel"><span class="vtu-mini">-</span></button>
            <button class="vtu-icon-btn" type="button" data-role="close" aria-label="Hide panel"><span class="vtu-mini">×</span></button>
          </div>
        </div>
        <div class="vtu-collapsed">
          <div class="vtu-collapsed-main">
            <div class="vtu-collapsed-date" data-role="collapsedDate">No date yet</div>
            <div class="vtu-collapsed-state" data-role="collapsedState">Idle</div>
            <div class="vtu-collapsed-bar"><span data-role="collapsedBar"></span></div>
          </div>
          <div class="vtu-collapsed-actions">
            <button class="vtu-icon-btn" type="button" data-role="expand" aria-label="Expand panel"><span class="vtu-mini">+</span></button>
            <button class="vtu-icon-btn" type="button" data-role="closeCollapsed" aria-label="Hide panel"><span class="vtu-mini">×</span></button>
          </div>
        </div>
        <div class="vtu-body">
          <div class="vtu-title-row">
            <div class="vtu-title" data-role="date">No date yet</div>
            <div class="vtu-badge" data-role="badge" data-state="idle">Idle</div>
          </div>
          <div class="vtu-copy" data-role="message">Waiting for Start.</div>
          <div class="vtu-meta">
            <div class="vtu-card">
              <div class="vtu-card-label">Progress</div>
              <div class="vtu-card-value" data-role="progressText">0 / 0</div>
            </div>
            <div class="vtu-card">
              <div class="vtu-card-label">Phase</div>
              <div class="vtu-card-value" data-role="phase">Idle</div>
            </div>
          </div>
          <div class="vtu-progress"><span data-role="bar"></span></div>
          <div class="vtu-actions">
            <button class="vtu-secondary" type="button" data-role="validate">Validate</button>
            <button class="vtu-secondary" type="button" data-role="reset" data-tone="danger">Reset</button>
            <button class="vtu-primary" type="button" data-role="toggle" data-mode="start">Start Automation</button>
          </div>
        </div>
      </div>
    `;

    bindPanelButton(panel.querySelector("[data-role='collapse']"), async () => {
      floatingPanelState.collapsed = !floatingPanelState.collapsed;
      await setPanelCollapsed(floatingPanelState.collapsed);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='expand']"), async () => {
      floatingPanelState.collapsed = false;
      await setPanelCollapsed(false);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='close']"), async () => {
      await setPanelVisible(false);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='closeCollapsed']"), async () => {
      await setPanelVisible(false);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='validate']"), async () => {
      try {
        const result = await validateCurrentEntries();
        await updateAutomationStatus({
          state: "idle",
          phase: "validated",
          page: detectPage(),
          date: result.dates[0] || null,
          index: result.count,
          total: result.count,
          message: `Validated ${result.count} entries from ${result.source === "imported_json" ? "imported JSON" : "data.json"}.`
        });
      } catch (error) {
        await updateAutomationStatus({
          state: "error",
          phase: "validation_error",
          message: error?.message || "Validation failed."
        });
      }
    });

    bindPanelButton(panel.querySelector("[data-role='toggle']"), async () => {
      const state = await readUiState();
      const nextEnabled = !isUiRunningState(state);

      if (nextEnabled) {
        try {
          const result = await validateCurrentEntries();
          await setAutomationEnabled(true);
          automationState.stopRequested = false;
          await updateAutomationStatus({
            state: "running",
            phase: "starting",
            date: result.dates[0] || null,
            index: await getCurrentIndex(),
            total: result.count,
            message: "Start received from the floating panel."
          });
          humanDelay(200, 500, "starting from panel").then(() => run());
        } catch (error) {
          await setAutomationEnabled(false);
          await updateAutomationStatus({
            state: "error",
            phase: "validation_error",
            message: error?.message || "Validation failed."
          });
        }
      } else {
        await setAutomationEnabled(false);
        automationState.stopRequested = true;
        await updateAutomationStatus({
          state: "stopped",
          phase: "stopped",
          message: "Stop requested from the floating panel."
        });
      }
    });

    bindPanelButton(panel.querySelector("[data-role='reset']"), async () => {
      automationState.stopRequested = true;
      await setCurrentIndex(0);
      await setAutomationEnabled(false);
      await setAutomationStatus({
        state: "idle",
        phase: "reset",
        page: detectPage(),
        date: null,
        index: 0,
        total: automationState.totalEntries,
        message: "Progress reset. Ready for a fresh run."
      });
    });

    document.documentElement.appendChild(panel);
    enableFloatingPanelDrag(panel);
    return panel;
  }

  function ensureFloatingPanel() {
    let panel = document.getElementById(FLOATING_PANEL_ID);
    if (panel) {
      if (panel.dataset.version === FLOATING_PANEL_VERSION) {
        return panel;
      }

      panel.remove();
    }

    ensureFloatingPanelStyles();
    panel = document.createElement("div");
    panel.id = FLOATING_PANEL_ID;
    panel.dataset.version = FLOATING_PANEL_VERSION;
    panel.innerHTML = `
      <div class="vtu-shell">
        <div class="vtu-header">
          <div class="vtu-drag-handle" title="Drag panel">
            <div class="vtu-chip">VTU Control</div>
            <div class="vtu-chip vtu-chip--ghost">Drag</div>
          </div>
          <div class="vtu-top-actions">
            <button class="vtu-icon-btn" type="button" data-role="collapse" aria-label="Collapse panel"><span class="vtu-mini">-</span></button>
            <button class="vtu-icon-btn" type="button" data-role="close" aria-label="Hide panel"><span class="vtu-mini">x</span></button>
          </div>
        </div>
        <div class="vtu-collapsed">
          <div class="vtu-collapsed-main" title="Drag panel">
            <div class="vtu-collapsed-date" data-role="collapsedDate">No date yet</div>
            <div class="vtu-collapsed-state" data-role="collapsedState">Idle | 0 / 0</div>
            <div class="vtu-collapsed-bar"><span data-role="collapsedBar"></span></div>
          </div>
          <div class="vtu-collapsed-actions">
            <button class="vtu-icon-btn" type="button" data-role="expand" aria-label="Expand panel"><span class="vtu-mini">+</span></button>
            <button class="vtu-icon-btn" type="button" data-role="closeCollapsed" aria-label="Hide panel"><span class="vtu-mini">x</span></button>
          </div>
        </div>
        <div class="vtu-body">
          <div class="vtu-title-row">
            <div class="vtu-title" data-role="date">No date yet</div>
            <div class="vtu-badge" data-role="badge" data-state="idle">Idle</div>
          </div>
          <div class="vtu-copy" data-role="message">Waiting for Start.</div>
          <div class="vtu-meta">
            <div class="vtu-card">
              <div class="vtu-card-label">Progress</div>
              <div class="vtu-card-value" data-role="progressText">0 / 0</div>
            </div>
            <div class="vtu-card">
              <div class="vtu-card-label">Phase</div>
              <div class="vtu-card-value" data-role="phase">Idle</div>
            </div>
          </div>
          <div class="vtu-progress"><span data-role="bar"></span></div>
          <div class="vtu-actions">
            <button class="vtu-secondary" type="button" data-role="validate">Validate</button>
            <button class="vtu-secondary" type="button" data-role="reset" data-tone="danger">Reset</button>
            <button class="vtu-primary" type="button" data-role="toggle" data-mode="start">Start Automation</button>
          </div>
        </div>
      </div>
    `;

    bindPanelButton(panel.querySelector("[data-role='collapse']"), async () => {
      floatingPanelState.collapsed = !floatingPanelState.collapsed;
      await setPanelCollapsed(floatingPanelState.collapsed);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='expand']"), async () => {
      floatingPanelState.collapsed = false;
      await setPanelCollapsed(false);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='close']"), async () => {
      await setPanelVisible(false);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='closeCollapsed']"), async () => {
      await setPanelVisible(false);
      await renderFloatingPanel();
    });

    bindPanelButton(panel.querySelector("[data-role='validate']"), async () => {
      try {
        const result = await validateCurrentEntries();
        await updateAutomationStatus({
          state: "idle",
          phase: "validated",
          page: detectPage(),
          date: result.dates[0] || null,
          index: result.count,
          total: result.count,
          message: `Validated ${result.count} entries from ${result.source === "imported_json" ? "imported JSON" : "data.json"}.`
        });
      } catch (error) {
        await updateAutomationStatus({
          state: "error",
          phase: "validation_error",
          message: error?.message || "Validation failed."
        });
      }
    });

    bindPanelButton(panel.querySelector("[data-role='toggle']"), async () => {
      const state = await readUiState();
      const nextEnabled = !isUiRunningState(state);

      if (nextEnabled) {
        try {
          const result = await validateCurrentEntries();
          await setAutomationEnabled(true);
          automationState.stopRequested = false;
          await updateAutomationStatus({
            state: "running",
            phase: "starting",
            date: result.dates[0] || null,
            index: await getCurrentIndex(),
            total: result.count,
            message: "Start received from the floating panel."
          });
          humanDelay(200, 500, "starting from panel").then(() => run());
        } catch (error) {
          await setAutomationEnabled(false);
          await updateAutomationStatus({
            state: "error",
            phase: "validation_error",
            message: error?.message || "Validation failed."
          });
        }
      } else {
        await setAutomationEnabled(false);
        automationState.stopRequested = true;
        await updateAutomationStatus({
          state: "stopped",
          phase: "stopped",
          message: "Stop requested from the floating panel."
        });
      }
    });

    bindPanelButton(panel.querySelector("[data-role='reset']"), async () => {
      automationState.stopRequested = true;
      await setCurrentIndex(0);
      await setAutomationEnabled(false);
      await setAutomationStatus({
        state: "idle",
        phase: "reset",
        page: detectPage(),
        date: null,
        index: 0,
        total: automationState.totalEntries,
        message: "Progress reset. Ready for a fresh run."
      });
    });

    document.documentElement.appendChild(panel);
    enableFloatingPanelDrag(panel);
    return panel;
  }

  async function renderFloatingPanel() {
    const panel = ensureFloatingPanel();
    const state = await readUiState();
    if (!state.panelVisible) {
      panel.style.display = "none";
      return;
    }

    panel.style.display = "";
    applyFloatingPanelPosition(panel, state.panelPosition);
    floatingPanelState.collapsed = state.panelCollapsed;
    panel.classList.toggle("is-collapsed", state.panelCollapsed);

    const running = isUiRunningState(state);
    const status = state.status || {};
    const total = Number(status.total) || 0;
    const index = Number(status.index ?? state.index) || 0;
    const progressText = total > 0 ? `${Math.min(index, total)} / ${total}` : "0 / 0";
    const percentage = total > 0 ? Math.max(0, Math.min(100, (Math.min(index, total) / total) * 100)) : 0;
    const badgeState = status.state || (running ? "running" : "idle");

    panel.querySelector("[data-role='date']").textContent = status.date || "No date yet";
    panel.querySelector("[data-role='badge']").textContent = panelTitleCase(badgeState);
    panel.querySelector("[data-role='badge']").dataset.state = badgeState;
    panel.querySelector("[data-role='message']").textContent = status.message || (running ? "Automation is running on this tab." : "Waiting for Start.");
    panel.querySelector("[data-role='progressText']").textContent = progressText;
    panel.querySelector("[data-role='phase']").textContent = panelTitleCase(status.phase || (running ? "running" : "idle"));
    panel.querySelector("[data-role='bar']").style.width = `${percentage}%`;
    panel.querySelector("[data-role='collapsedDate']").textContent =
      status.date || "No date yet";
    panel.querySelector("[data-role='collapsedState']").textContent = `${panelTitleCase(badgeState)} | ${progressText}`;
    panel.querySelector("[data-role='collapsedBar']").style.width = `${percentage}%`;

    const toggleButton = panel.querySelector("[data-role='toggle']");
    toggleButton.dataset.mode = running ? "stop" : "start";
    toggleButton.textContent = running ? "Stop Automation" : "Start Automation";
  }

  function detectPage() {
    const pathname = window.location.pathname;

    if (pathname.includes("/dashboard/student/edit-diary-entry/")) {
      return "page4";
    }

    if (pathname.includes("/dashboard/student/diary-entries")) {
      return "page3";
    }

    if (pathname.includes("/dashboard/student/student-diary")) {
      const page2Detected = pageContainsText(PAGE_MARKERS.page2);
      if (page2Detected) {
        return "page2";
      }

      const page1Detected = pageContainsText(PAGE_MARKERS.page1);
      if (page1Detected) {
        return "page1";
      }
    }

    if (pageContainsText(PAGE_MARKERS.page1)) {
      return "page1";
    }

    if (pageContainsText(PAGE_MARKERS.page2)) {
      return "page2";
    }

    if (pageContainsText(PAGE_MARKERS.page3)) {
      return "page3";
    }

    if (pageContainsText(PAGE_MARKERS.page4)) {
      return "page4";
    }

    return null;
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
  }

  function getElementDisplayText(element) {
    if (!element) {
      return "";
    }

    return normalizeText(
      element.value ||
      element.innerText ||
      element.textContent ||
      element.getAttribute("aria-label") ||
      element.getAttribute("placeholder") ||
      ""
    );
  }

  function findInteractiveElementByText(terms, selector = "button, [role='button'], input, div") {
    const normalizedTerms = terms.map((term) => normalizeText(term));

    return Array.from(document.querySelectorAll(selector)).find((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const descriptor = normalizeText(
        [
          element.textContent,
          element.value,
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.getAttribute("placeholder")
        ].filter(Boolean).join(" ")
      );

      return normalizedTerms.some((term) => descriptor.includes(term));
    }) || null;
  }

  function findControlNearLabel(terms, controlSelector) {
    const labelCandidates = Array.from(document.querySelectorAll("label, span, div, p")).filter((element) => {
      const text = normalizeText(element.textContent);
      return text && terms.some((term) => text.includes(normalizeText(term))) && text.length < 80;
    });

    for (const label of labelCandidates) {
      let current = label;

      for (let depth = 0; depth < 5 && current; depth += 1) {
        const control = Array.from(current.querySelectorAll(controlSelector)).find((element) => element !== label && isVisible(element));
        if (control) {
          return control;
        }

        current = current.parentElement;
      }
    }

    return null;
  }

  function getDateDisplayElement() {
    return (
      findInteractiveElementByText(["pick a date", "diary date"], "button, [role='button'], input") ||
      findControlNearLabel(
      ["diary date", "pick a date", "date"],
      "input, button, [role='button'], [role='textbox'], [aria-haspopup='dialog']"
      )
    );
  }

  async function findDateField() {
    const textMatchedControl = getDateDisplayElement();
    if (textMatchedControl) {
      return textMatchedControl;
    }

    const selectorCandidates = [
      "input[type='date']",
      "input[placeholder*='Pick a Date' i]",
      "input[placeholder*='Date' i]",
      "input[aria-label*='Diary Date' i]",
      "input[name*='date' i]",
      "input[id*='date' i]",
      "button[aria-label*='date' i]",
      "[role='button'][aria-label*='date' i]",
      "[role='textbox']",
      "[aria-haspopup='dialog']"
    ];

    for (const selector of selectorCandidates) {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        return element;
      }
    }

    const semanticMatch = findFieldByTerms(["diary date", "pick a date", "date"], {
      selector: "input, textarea",
      includeReadOnly: true
    });
    if (semanticMatch) {
      return semanticMatch;
    }

    throw new Error("Date field not found");
  }

  async function findInternshipDropdown() {
    const selectorCandidates = [
      "select[name*='intern' i]",
      "select[id*='intern' i]",
      "select[aria-label*='intern' i]",
      "select",
      "[role='combobox']",
      "input[list]",
      "input[aria-haspopup='listbox']"
    ];

    for (const selector of selectorCandidates) {
      try {
        const element = await waitForElement(selector, 5000);
        const descriptor = [
          element.getAttribute("name"),
          element.getAttribute("id"),
          element.getAttribute("aria-label"),
          element.getAttribute("placeholder"),
          element.labels?.[0]?.textContent
        ].filter(Boolean).join(" ").toLowerCase();

        if (!descriptor || descriptor.includes("intern")) {
          return element;
        }
      } catch (error) {
        log(`Internship selector candidate failed: ${selector}`);
      }
    }

    const semanticMatch = findFieldByTerms(["select internship", "internship"], {
      selector: "input, select",
      includeReadOnly: true
    });
    if (!semanticMatch) {
      throw new Error("Internship field not found");
    }

    return semanticMatch;
  }

  async function selectFirstInternshipOption(dropdown) {
    if (dropdown.tagName.toLowerCase() === "select") {
      const options = Array.from(dropdown.options).filter((option) => option.value && !option.disabled);
      if (!options.length) {
        throw new Error("No internship options found");
      }

      dropdown.value = options[0].value;
      dispatchInputEvents(dropdown);
      return;
    }

    dropdown.focus();
    dropdown.click();
    await humanDelay(700, 1400, "waiting after opening internship field");

    const optionSelectors = [
      "[role='option']",
      "[id*='option' i]",
      "[class*='option' i]",
      "[class*='menu' i] div",
      "li",
      ".mat-option",
      ".ng-option"
    ];

    for (const selector of optionSelectors) {
      const options = Array.from(document.querySelectorAll(selector)).filter((element) => {
        const text = element.textContent?.trim();
        return text && !/select|choose/i.test(text);
      });

      if (options.length) {
        options[0].click();
        return;
      }
    }

    const typedOption = dropdown.tagName.toLowerCase() === "input" ? dropdown.value?.trim() : "";
    if (typedOption) {
      dispatchInputEvents(dropdown);
      return;
    }

    throw new Error("No internship options found");
  }

  async function setDateFieldValue(dateField, isoDate) {
    throwIfAutomationCancelled();

    const [year, month, day] = isoDate.split("-");
    const shortMonth = new Date(`${isoDate}T00:00:00`).toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC"
    });
    const longMonth = new Date(`${isoDate}T00:00:00`).toLocaleString("en-US", {
      month: "long",
      timeZone: "UTC"
    });
    const directFormats = [
      isoDate,
      `${day}/${month}/${year}`,
      `${day}-${month}-${year}`,
      `${month}/${day}/${year}`,
      `${month}-${day}-${year}`,
      `${day} ${shortMonth} ${year}`,
      `${day} ${longMonth} ${year}`
    ];

    if (dateField.matches("input, textarea")) {
      for (const candidate of directFormats) {
        setFieldValue(dateField, candidate);
        await humanDelay(150, 350, "letting date field react");

        if (dateField.value) {
          log(`Date field accepted value: ${dateField.value}`);
          return;
        }
      }
    }

    await selectDateFromCalendar(dateField, { year, month, day, shortMonth, longMonth });
  }

  function getVisibleCalendarRoot() {
    const selectors = [
      ".rdp-root",
      ".react-datepicker",
      ".datepicker",
      ".calendar",
      "[role='dialog']",
      ".flatpickr-calendar",
      ".rdp",
      ".MuiPickersPopper-root"
    ];

    for (const selector of selectors) {
      const match = Array.from(document.querySelectorAll(selector)).find((element) => isVisible(element));
      if (match) {
        return match;
      }
    }

    const selectMatch = Array.from(document.querySelectorAll("select")).find((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const optionTexts = Array.from(element.options).map((option) => normalizeText(option.textContent));
      return optionTexts.some((text) => ["jan", "january", "feb", "february"].includes(text));
    });

    return selectMatch?.closest("div, section, form, body") || document.body;
  }

  function getSelectedOptionText(selectElement) {
    const option = selectElement.options[selectElement.selectedIndex];
    return normalizeText(option?.textContent || "");
  }

  async function setSelectByVisibleText(selectElement, acceptedTexts, label) {
    const normalizedTargets = acceptedTexts.map((text) => normalizeText(text));
    const options = Array.from(selectElement.options);
    const matchingOption = options.find((option) => normalizedTargets.includes(normalizeText(option.textContent)));

    if (!matchingOption) {
      throw new Error(`Unable to find ${label} option: ${acceptedTexts.join(" / ")}`);
    }

    selectElement.focus();
    selectElement.click();
    selectElement.value = matchingOption.value;
    selectElement.selectedIndex = options.indexOf(matchingOption);
    dispatchInputEvents(selectElement);

    await waitForCondition(
      () => normalizedTargets.includes(getSelectedOptionText(selectElement)),
      3000,
      100,
      `${label} select did not update`
    );
  }

  function getRdpDayButton(calendarRoot, targetDate) {
    const targetDataDay = `${Number(targetDate.month)}/${Number(targetDate.day)}/${targetDate.year}`;
    const exactByDataDay = calendarRoot.querySelector(`[data-day="${targetDataDay}"]`);
    if (exactByDataDay && isVisible(exactByDataDay)) {
      return exactByDataDay;
    }

    const buttons = Array.from(
      calendarRoot.querySelectorAll(".rdp-day_button, .rdp-day, [role='gridcell'] button, [role='gridcell']")
    );

    const targetDay = String(Number(targetDate.day));
    const targetMonthNames = [targetDate.shortMonth, targetDate.longMonth].map((value) => normalizeText(value));
    const targetYear = normalizeText(targetDate.year);

    const exactByAria = buttons.find((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const aria = normalizeText(element.getAttribute("aria-label"));
      return (
        aria.includes(targetDay) &&
        targetMonthNames.some((monthName) => aria.includes(monthName)) &&
        aria.includes(targetYear)
      );
    });

    if (exactByAria) {
      return exactByAria;
    }

    return buttons.find((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const cell = element.closest("td, [role='gridcell']") || element;
      const classText = `${element.className || ""} ${cell.className || ""}`;
      const normalizedClassText = normalizeText(classText);

      if (
        element.disabled ||
        element.getAttribute("aria-disabled") === "true" ||
        normalizedClassText.includes("outside") ||
        normalizedClassText.includes("disabled") ||
        normalizedClassText.includes("hidden")
      ) {
        return false;
      }

      const text = normalizeText(element.textContent);
      const aria = normalizeText(element.getAttribute("aria-label"));
      const title = normalizeText(element.getAttribute("title"));
      const descriptor = `${text} ${aria} ${title}`;

      if (text !== targetDay) {
        return false;
      }

      if (!aria && !title) {
        return true;
      }

      const monthMatch = targetMonthNames.some((monthName) => descriptor.includes(monthName));
      const yearMatch = descriptor.includes(targetYear);
      return monthMatch || yearMatch;
    });
  }

  function isRdpDaySelected(calendarRoot, targetDate) {
    const targetDataDay = `${Number(targetDate.month)}/${Number(targetDate.day)}/${targetDate.year}`;
    const selected = calendarRoot.querySelector(
      `[data-day="${targetDataDay}"][data-selected-single="true"], [data-day="${targetDataDay}"][aria-selected="true"]`
    );

    return Boolean(selected);
  }

  function dispatchKeyboardSelection(element, key) {
    const keyCode = key === "Enter" ? 13 : 32;
    element.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, keyCode, which: keyCode, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keypress", { key, code: key, keyCode, which: keyCode, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, keyCode, which: keyCode, bubbles: true }));
  }

  function dispatchNavigationKey(element, key) {
    const keyMap = {
      ArrowDown: 40,
      Enter: 13
    };
    const keyCode = keyMap[key];
    element.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, keyCode, which: keyCode, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, keyCode, which: keyCode, bubbles: true }));
  }

  async function closeDatePicker() {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await humanDelay(TIMINGS.datePickerClose[0], TIMINGS.datePickerClose[1], "waiting after closing date picker");
  }

  async function verifyDateCommitted(dateDisplayElement, initialDisplay, targetDate, timeout = 1500) {
    return waitForCondition(
      () => {
        const currentDisplay = getElementDisplayText(dateDisplayElement);
        const hasChanged = currentDisplay && currentDisplay !== initialDisplay;
        const isPlaceholderGone = !currentDisplay.includes("pick a date");
        const mentionsDay = currentDisplay.includes(String(Number(targetDate.day)));
        const mentionsYear = currentDisplay.includes(targetDate.year);
        const mentionsMonth =
          currentDisplay.includes(normalizeText(targetDate.shortMonth)) ||
          currentDisplay.includes(normalizeText(targetDate.longMonth)) ||
          currentDisplay.includes(targetDate.month);

        return hasChanged && isPlaceholderGone && (mentionsYear || mentionsMonth || mentionsDay);
      },
      timeout,
      120,
      "Date selection was not reflected in the field"
    ).catch(() => false);
  }

  async function selectDateFromCalendar(dateControl, targetDate) {
    const dateDisplayElement = dateControl;
    const initialDisplay = getElementDisplayText(dateDisplayElement);

    dateControl.focus();
    dateControl.click();
    await humanDelay(TIMINGS.datePickerOpen[0], TIMINGS.datePickerOpen[1], "waiting for date picker");

    const calendarRoot = await waitForCondition(
      () => getVisibleCalendarRoot(),
      5000,
      150,
      "Date picker did not open"
    );

    const monthSelect = Array.from(calendarRoot.querySelectorAll("select")).find((element) => {
      const texts = Array.from(element.options).map((option) => normalizeText(option.textContent));
      return texts.some((text) => text === normalizeText(targetDate.shortMonth) || text === normalizeText(targetDate.longMonth));
    });

    const yearSelect = Array.from(calendarRoot.querySelectorAll("select")).find((element) => {
      const texts = Array.from(element.options).map((option) => normalizeText(option.textContent));
      return texts.includes(normalizeText(targetDate.year));
    });

    if (monthSelect) {
      await setSelectByVisibleText(monthSelect, [targetDate.shortMonth, targetDate.longMonth], "month");
      await humanDelay(TIMINGS.datePickerSelect[0], TIMINGS.datePickerSelect[1], "waiting after month select");
    }

    if (yearSelect) {
      await setSelectByVisibleText(yearSelect, [targetDate.year], "year");
      await humanDelay(TIMINGS.datePickerSelect[0], TIMINGS.datePickerSelect[1], "waiting after year select");
    }

    await waitForCondition(
      () => {
        if (monthSelect && ![normalizeText(targetDate.shortMonth), normalizeText(targetDate.longMonth)].includes(getSelectedOptionText(monthSelect))) {
          return false;
        }

        if (yearSelect && getSelectedOptionText(yearSelect) !== normalizeText(targetDate.year)) {
          return false;
        }

        return true;
      },
      3000,
      100,
      "Calendar did not switch to the requested month/year"
    );

    const exactDayButton = getRdpDayButton(calendarRoot, targetDate);

    if (!exactDayButton) {
      throw new Error(`Unable to find day ${targetDate.day} in date picker`);
    }

    exactDayButton.focus();
    exactDayButton.click();
    exactDayButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    exactDayButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    exactDayButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await humanDelay(TIMINGS.datePickerSelect[0], TIMINGS.datePickerSelect[1], "waiting after day selection");
    let selected = await waitForCondition(
      () => isRdpDaySelected(calendarRoot, targetDate) || !getVisibleCalendarRoot(),
      1200,
      100,
      "Chosen day was not marked selected"
    ).catch(() => false);
    await closeDatePicker();

    let committed = await verifyDateCommitted(dateDisplayElement, initialDisplay, targetDate, 1800);

    if (!committed) {
      dateControl.focus();
      dateControl.click();
      await humanDelay(TIMINGS.datePickerOpen[0], TIMINGS.datePickerOpen[1], "reopening date picker for keyboard selection");
      dispatchKeyboardSelection(exactDayButton, " ");
      await humanDelay(TIMINGS.datePickerSelect[0], TIMINGS.datePickerSelect[1], "waiting after space selection");
      selected = await waitForCondition(
        () => isRdpDaySelected(calendarRoot, targetDate) || !getVisibleCalendarRoot(),
        1000,
        100,
        "Chosen day was not marked selected after space key"
      ).catch(() => selected);
      await closeDatePicker();
      committed = await verifyDateCommitted(dateDisplayElement, initialDisplay, targetDate, 1400);
    }

    if (!committed) {
      dateControl.focus();
      dateControl.click();
      await humanDelay(TIMINGS.datePickerOpen[0], TIMINGS.datePickerOpen[1], "reopening date picker for enter selection");
      dispatchKeyboardSelection(exactDayButton, "Enter");
      await humanDelay(TIMINGS.datePickerSelect[0], TIMINGS.datePickerSelect[1], "waiting after enter selection");
      selected = await waitForCondition(
        () => isRdpDaySelected(calendarRoot, targetDate) || !getVisibleCalendarRoot(),
        1000,
        100,
        "Chosen day was not marked selected after enter key"
      ).catch(() => selected);
      await closeDatePicker();
      committed = await verifyDateCommitted(dateDisplayElement, initialDisplay, targetDate, 1400);
    }

    if (!committed && !selected) {
      throw new Error("Date picker interaction did not select the target date");
    }

    if (!committed && selected) {
      log("Date selection may have succeeded without updating visible trigger text immediately");
    }

    log(`Date selected from calendar: ${targetDate.day}-${targetDate.month}-${targetDate.year}`);
  }

  async function waitForPageTransition(previousUrl, expectedPage, timeout = 15000) {
    return waitForCondition(
      () => {
        if (detectPage() === expectedPage) {
          return expectedPage;
        }

        if (window.location.href !== previousUrl) {
          const detected = detectPage();
          return detected === expectedPage ? expectedPage : window.location.href;
        }

        return false;
      },
      timeout,
      180,
      `Timed out waiting for ${expectedPage}`
    );
  }

  async function waitForAnyPage(previousUrl, expectedPages, timeout = 12000) {
    return waitForCondition(
      () => {
        const detectedPage = detectPage();
        if (expectedPages.includes(detectedPage)) {
          return detectedPage;
        }

        if (window.location.href !== previousUrl) {
          return detectPage() || true;
        }

        return false;
      },
      timeout,
      180,
      `Timed out waiting for one of: ${expectedPages.join(", ")}`
    );
  }

  function findCreateEntryButton() {
    return (
      document.querySelector("a[href='/dashboard/student/student-diary']") ||
      findButtonByTerms(["create"])
    );
  }

  function findCancelButton() {
    return findButtonByTerms(["cancel"]) || document.querySelector("a[href='/dashboard/student/diary-entries']");
  }

  function isExistingEntryNoticeVisible() {
    return pageContainsText(["existing internship diary entry found"]);
  }

  function entriesListContainsDate(date) {
    const normalizedDate = normalizeText(date);
    const compactDate = String(date).replace(/\D/g, "");
    const rows = getEntriesListRows();
    return rows.some((row) => {
      const text = normalizeText(row.textContent);
      const compactText = text.replace(/\D/g, "");
      return text.includes(normalizedDate) || compactText.includes(compactDate);
    });
  }

  async function ensureAutomationEnabled() {
    throwIfAutomationCancelled();

    const enabled = await isAutomationEnabled();
    if (!enabled) {
      automationState.stopRequested = true;
      throw new Error("Automation stopped by user");
    }
  }

  function getTextareaByLabel(terms) {
    return findFieldByTerms(terms, {
      selector: "textarea"
    });
  }

  function getInputByLabel(terms, includeReadOnly = false) {
    return findFieldByTerms(terms, {
      selector: "input, select",
      includeReadOnly
    });
  }

  function findVisibleElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        return element;
      }
    }

    return null;
  }

  async function findWorkSummaryField() {
    const exactSelectors = [
      "textarea#description",
      "textarea[name='description']",
      "textarea[placeholder*='Briefly describe the work you did today' i]"
    ];

    const exactMatch = findVisibleElement(exactSelectors);
    if (exactMatch) {
      return exactMatch;
    }

    const semanticMatch = getTextareaByLabel(["work summary", "description"]);
    if (!semanticMatch) {
      throw new Error("Work Summary field not found");
    }

    return semanticMatch;
  }

  async function findHoursWorkedField() {
    const exactSelectors = [
      "input[placeholder*='e.g. 6.5' i]",
      "input[name*='hour' i]",
      "input[id*='hour' i]",
      "input[type='number']"
    ];

    const exactMatch = findVisibleElement(exactSelectors);
    if (exactMatch) {
      return exactMatch;
    }

    const semanticMatch = getInputByLabel(["hours worked", "hours"]);
    if (!semanticMatch) {
      throw new Error("Hours field not found");
    }

    return semanticMatch;
  }

  async function findLearningOutcomesField() {
    const exactSelectors = [
      "textarea[placeholder*='What did you learn or ship today' i]",
      "textarea[name*='learning' i]",
      "textarea[id*='learning' i]",
      "textarea[id*='outcome' i]",
      "textarea[name*='outcome' i]"
    ];

    const exactMatch = findVisibleElement(exactSelectors);
    if (exactMatch) {
      return exactMatch;
    }

    const semanticMatch = getTextareaByLabel(["learnings / outcomes", "learnings", "outcomes"]);
    if (!semanticMatch) {
      throw new Error("Learnings field not found");
    }

    return semanticMatch;
  }

  async function findSkillsInputField() {
    const exactSelectors = [
      "input.react-select__input",
      "input[id^='react-select-'][id$='-input']",
      "input[role='combobox'][aria-autocomplete='list']",
      ".react-select__input-container input"
    ];

    const exactMatch = findVisibleElement(exactSelectors);
    if (exactMatch) {
      return exactMatch;
    }

    const nearLabel = findControlNearLabel(
      ["skills used", "add skills", "skills"],
      "input[role='combobox'], input.react-select__input, input[id^='react-select-'][id$='-input'], input"
    );
    if (nearLabel) {
      return nearLabel;
    }

    throw new Error("Skills input not found");
  }

  function getSkillOptionElements(root = document) {
    const queryRoot = root && typeof root.querySelectorAll === "function" ? root : document;
    const selectors = [
      "[role='option']",
      ".react-select__option",
      "[id*='react-select'][id*='option']",
      "[class*='menu' i] [class*='option' i]",
      "li"
    ];

    return selectors.flatMap((selector) => Array.from(queryRoot.querySelectorAll(selector)))
      .filter((element) => isVisible(element) && normalizeText(element.textContent));
  }

  function getSkillMenuContainer() {
    const selectors = [
      "[role='listbox']",
      ".react-select__menu-list",
      ".react-select__menu",
      "[class*='menu-list' i]",
      "[class*='menu' i]"
    ];

    for (const selector of selectors) {
      const match = Array.from(document.querySelectorAll(selector)).find((element) => isVisible(element));
      if (match) {
        return match;
      }
    }

    return null;
  }

  function isSkillAlreadySelected(optionText) {
    const normalizedTarget = normalizeText(optionText);
    return Array.from(document.querySelectorAll(".react-select__multi-value__label, [class*='multi-value__label'], [class*='multiValue']"))
      .some((element) => normalizeText(element.textContent) === normalizedTarget);
  }

  async function selectSkillOption(optionText) {
    const skillField = await retry(() => findSkillsInputField(), 3);
    const normalizedTarget = normalizeText(optionText);

    if (isSkillAlreadySelected(optionText)) {
      log(`Skill already selected: ${optionText}`);
      return;
    }

    skillField.focus();
    skillField.click();
    await humanDelay(700, 1200, "waiting for skills dropdown");

    if (skillField.tagName.toLowerCase() === "select") {
      const options = Array.from(skillField.options);
      const exactOption = options.find((option) => normalizeText(option.textContent).includes(normalizeText(optionText)));
      if (!exactOption) {
        throw new Error(`Skill option not found: ${optionText}`);
      }

      skillField.value = exactOption.value;
      dispatchInputEvents(skillField);
      return;
    }

    if (skillField.tagName.toLowerCase() === "input") {
      await typeLikeHuman(skillField, optionText);
      await humanDelay(700, 1200, "waiting for skill suggestions");
    }

    const optionSelectors = [
      "[role='option']",
      ".react-select__option",
      "[id*='react-select'][id*='option']",
      "li",
      "[class*='option' i]",
      "[class*='menu' i] div",
      ".mat-option",
      ".ng-option"
    ];

    for (const selector of optionSelectors) {
      const option = Array.from(document.querySelectorAll(selector)).find((element) => {
        const text = normalizeText(element.textContent);
        return text === normalizedTarget || text.includes(normalizedTarget);
      });

      if (option) {
        option.click();
        dispatchInputEvents(skillField);
        const committed = await waitForCondition(
          () => isSkillAlreadySelected(optionText),
          1500,
          100,
          "Skill chip did not appear after option click"
        ).catch(() => false);

        if (committed) {
          return;
        }
      }
    }

    dispatchNavigationKey(skillField, "ArrowDown");
    await humanDelay(150, 300, "waiting after arrow down");
    dispatchNavigationKey(skillField, "Enter");

    const committed = await waitForCondition(
      () => isSkillAlreadySelected(optionText),
      1800,
      120,
      "Skill chip did not appear after keyboard selection"
    ).catch(() => false);

    if (!committed) {
      throw new Error(`Skill option not found or not committed: ${optionText}`);
    }
  }

  async function fillPage1(entry) {
    await ensureAutomationEnabled();
    automationState.currentDate = entry.date;
    await updateAutomationStatus({
      phase: "page1",
      page: "page1",
      date: entry.date,
      message: `Selecting internship and date for ${entry.date}.`
    });
    log("Starting Page 1 automation", entry.date);

    const internshipDropdown = await retry(() => findInternshipDropdown(), 3);
    await humanDelay(600, 1100, "before selecting internship");
    try {
      await retry(() => selectFirstInternshipOption(internshipDropdown), 3);
    } catch (error) {
      if (error.message === "No internship options found") {
        await requestRecoveryReload(
          `Internship options did not load for ${entry.date}. Reloading once to recover.`,
          "reload_internship"
        );
      }

      throw error;
    }

    await retry(async () => {
      const dateField = await findDateField();
      await updateAutomationStatus({
        phase: "date_selection",
        page: "page1",
        date: entry.date,
        message: `Choosing ${entry.date} in the diary date picker.`
      });
      await humanDelay(TIMINGS.beforeDate[0], TIMINGS.beforeDate[1], "before entering date");
      await setDateFieldValue(dateField, entry.date);

      const continueButton = findButtonByTerms(["continue", "next", "proceed"]);
      if (!continueButton) {
        throw new Error("Continue button not found");
      }

      await ensureAutomationEnabled();
      await updateAutomationStatus({
        phase: "continuing",
        page: "page1",
        date: entry.date,
        message: `Submitting ${entry.date} to open the diary form.`
      });
      await humanDelay(TIMINGS.beforeContinue[0], TIMINGS.beforeContinue[1], "before clicking continue");
      const previousUrl = window.location.href;
      continueButton.click();
      await waitForPageTransition(previousUrl, "page2", 12000);
    }, 3);

    await updateAutomationStatus({
      phase: "page1_complete",
      date: entry.date,
      message: `${entry.date} accepted. Moving to the diary form.`
    });
    log("Page 1 completed, navigation detected");

    if (detectPage() === "page2") {
      await humanDelay(450, 800, "before continuing on Page 2");
      await fillPage2(entry);
      return;
    }

    if (detectPage() === "page4") {
      const entries = await loadEntries();
      await handleExistingEditEntry(entries);
    }
  }

  async function fillPage2(entry) {
    await ensureAutomationEnabled();
    automationState.currentDate = entry.date;
    await updateAutomationStatus({
      phase: "page2",
      page: detectPage() || "page2",
      date: entry.date,
      message: `Filling the diary form for ${entry.date}.`
    });
    log("Starting Page 2 automation", entry.date);

    if (detectPage() === "page4" && await shouldSkipExistingEntries()) {
      log("Edit page detected during form fill. Switching to skip-existing flow.");
      const entries = await loadEntries();
      await handleExistingEditEntry(entries);
      return;
    }

    await retry(() => waitForElement("body", 5000), 2);
    await retry(
      () => waitForCondition(() => pageContainsText(["create internship diary entry", "what i worked on"]), 8000, 200, "Page 2 did not finish rendering"),
      2
    );

    const workField = await retry(() => findWorkSummaryField(), 3);
    const hoursField = await retry(() => findHoursWorkedField(), 3);
    const learningField = await retry(() => findLearningOutcomesField(), 3);

    await ensureAutomationEnabled();
    await updateAutomationStatus({
      phase: "work_summary",
      page: "page2",
      date: entry.date,
      message: `Adding work summary for ${entry.date}.`
    });
    await humanDelay(900, 1700, "before entering work summary");
    await typeLikeHuman(workField, entry.workSummary);

    await updateAutomationStatus({
      phase: "hours",
      page: "page2",
      date: entry.date,
      message: `Setting hours for ${entry.date}.`
    });
    await humanDelay(700, 1300, "before entering hours");
    await typeLikeHuman(hoursField, entry.hours);

    await updateAutomationStatus({
      phase: "learnings",
      page: "page2",
      date: entry.date,
      message: `Adding learning outcomes for ${entry.date}.`
    });
    await humanDelay(900, 1700, "before entering learnings");
    await typeLikeHuman(learningField, entry.learningOutcomes);

    await updateAutomationStatus({
      phase: "skills",
      page: "page2",
      date: entry.date,
      message: `Selecting skills for ${entry.date}.`
    });
    await humanDelay(900, 1700, "before selecting skills");
    for (const skill of entry.skills) {
      await retry(() => selectSkillOption(skill), 3);
      await humanDelay(300, 700, `after selecting skill ${skill}`);
    }

    const saveButton = findButtonByTerms(["save", "submit", "update"]);
    if (!saveButton) {
      throw new Error("Save button not found");
    }

    await ensureAutomationEnabled();
    await updateAutomationStatus({
      phase: "saving",
      page: "page2",
      date: entry.date,
      message: `Saving diary entry for ${entry.date}.`
    });
    await humanDelay(1100, 2400, "before clicking save");
    const previousUrl = window.location.href;
    saveButton.click();

    const saveChecks = await Promise.allSettled([
      waitForUrlChange(previousUrl, 15000),
      waitForCondition(
        () => looksLikeSuccessMessage() || detectPage() !== "page2",
        15000,
        300,
        "Timed out waiting for save confirmation"
      )
    ]);

    if (!saveChecks.some((result) => result.status === "fulfilled")) {
      const firstError = saveChecks.find((result) => result.status === "rejected");
      throw firstError?.reason || new Error("Timed out waiting for save confirmation");
    }

    const nextIndex = await incrementCurrentIndex();
    automationState.currentDate = nextIndex < automationState.totalEntries ? null : entry.date;
    await updateAutomationStatus({
      phase: "saved",
      date: entry.date,
      index: nextIndex,
      message: `Saved ${entry.date} successfully.`
    });
    log(`Entry saved successfully. Advanced to index ${nextIndex}`);

    if (nextIndex >= automationState.totalEntries) {
      await markAutomationComplete("All diary entries have been processed.");
      return;
    }

    await humanDelay(1500, 3000, "after save");

    if (detectPage() === "page1") {
      const entries = await loadEntries();
      if (nextIndex < entries.length) {
        log("Page 1 is already available after save, continuing with the next entry");
        await humanDelay(TIMINGS.beforeNextEntry[0], TIMINGS.beforeNextEntry[1], "before next entry");
        await fillPage1(entries[nextIndex]);
      }
      return;
    }

    if (detectPage() === "page3") {
      const entries = await loadEntries();
      await continueFromEntriesList(entries);
    }
  }

  async function openCreateEntryPage() {
    const createButton = findCreateEntryButton();
    if (!createButton) {
      throw new Error("Create button not found on diary entries page");
    }

    const previousUrl = window.location.href;
    createButton.click();
    await waitForAnyPage(previousUrl, ["page1", "page4"], 12000);
  }

  async function continueFromEntriesList(entries) {
    await waitForEntriesListReady();
    let index = await getCurrentIndex();
    const skipExistingEntries = await shouldSkipExistingEntries();

    while (skipExistingEntries && index < entries.length && entriesListContainsDate(entries[index].date)) {
      automationState.currentDate = entries[index].date;
      await updateAutomationStatus({
        phase: "skipping",
        page: "page3",
        date: entries[index].date,
        index,
        total: entries.length,
        message: `${entries[index].date} already exists in the diary list. Skipping.`
      });
      log(`Diary entry for ${entries[index].date} already exists in the list. Skipping.`);
      index = await incrementCurrentIndex();
    }

    if (index >= entries.length) {
      await markAutomationComplete("All listed diary dates already exist or have been processed.");
      log("All diary entries are already present in the list");
      return;
    }

    automationState.currentDate = entries[index].date;
    await updateAutomationStatus({
      phase: "create",
      page: "page3",
      date: entries[index].date,
      index,
      total: entries.length,
      message: `Opening Create for ${entries[index].date}.`
    });
    await humanDelay(TIMINGS.beforeCreate[0], TIMINGS.beforeCreate[1], "before clicking create");
    await openCreateEntryPage();

    if (detectPage() === "page1") {
      await updateAutomationStatus({
        phase: "queue_next",
        page: "page1",
        date: entries[index].date,
        index,
        total: entries.length,
        message: `Starting the next diary entry for ${entries[index].date}.`
      });
      await humanDelay(TIMINGS.beforeNextEntry[0], TIMINGS.beforeNextEntry[1], "before next entry");
      await fillPage1(entries[index]);
      return;
    }

    if (detectPage() === "page4") {
      await handleExistingEditEntry(entries);
    }
  }

  async function handleExistingEditEntry(entries) {
    const index = await getCurrentIndex();
    const currentEntry = entries[index];

    if (!currentEntry) {
      return;
    }

    if (await shouldSkipExistingEntries()) {
      automationState.currentDate = currentEntry.date;
      await updateAutomationStatus({
        phase: "existing_entry",
        page: "page4",
        date: currentEntry.date,
        index,
        total: entries.length,
        message: `Existing entry found for ${currentEntry.date}. Returning to the list.`
      });
      log(`Existing entry detected for ${currentEntry.date}. Skipping without overwriting.`);
      await incrementCurrentIndex();
      const cancelButton = findCancelButton();
      if (cancelButton) {
        const previousUrl = window.location.href;
        cancelButton.click();
        await waitForPageTransition(previousUrl, "page3", 12000).catch(async () => {
          window.location.assign("/dashboard/student/diary-entries");
          await humanDelay(650, 1200, "waiting after fallback diary entries redirect");
        });
      } else {
        window.location.assign("/dashboard/student/diary-entries");
        await humanDelay(650, 1200, "waiting after fallback diary entries redirect");
      }

      const refreshedEntries = await loadEntries();
      if (detectPage() === "page3" || window.location.pathname.includes("/dashboard/student/diary-entries")) {
        await updateAutomationStatus({
          phase: "entries_list",
          page: "page3",
          index: await getCurrentIndex(),
          total: refreshedEntries.length,
          date: refreshedEntries[await getCurrentIndex()]?.date || null,
          message: "Back on the diary entries list. Continuing with the next item."
        });
        await continueFromEntriesList(refreshedEntries);
      }
      return;
    }

    await updateAutomationStatus({
      phase: "overwrite_existing",
      page: "page4",
      date: currentEntry.date,
      index,
      total: entries.length,
      message: `Overwrite mode is on. Continuing into the existing entry for ${currentEntry.date}.`
    });
    await fillPage2(currentEntry);
  }

  async function run() {
    const enabled = await isAutomationEnabled();
    if (!enabled) {
      const existingStatus = await getAutomationStatus();
      if (!existingStatus || !["completed", "stopped", "error"].includes(existingStatus.state)) {
        await updateAutomationStatus({
          state: "idle",
          phase: "idle",
          message: "Automation is disabled. Start it from the extension popup."
        });
      }
      log("Automation is disabled. Start it from the extension popup.");
      return;
    }

    if (window.__VTU_AUTOMATOR_RUNNING__) {
      log("Automation is already running on this page instance");
      return;
    }

    const page = await waitForCondition(
      () => detectPage(),
      15000,
      400,
      "Timed out waiting for a supported VTU portal page"
    ).catch(() => null);

    if (!page) {
      return;
    }

    automationState.stopRequested = false;
    window.__VTU_AUTOMATOR_RUNNING__ = true;

    try {
      const entries = await loadEntries();
      automationState.totalEntries = entries.length;
      const index = await getCurrentIndex();

      if (index >= entries.length) {
        await markAutomationComplete("All diary entries have already been processed.");
        log("All diary entries have already been processed");
        return;
      }

      const currentEntry = entries[index];
      automationState.currentDate = currentEntry.date;
      await updateAutomationStatus({
        state: "running",
        phase: "detected",
        page,
        date: currentEntry.date,
        index,
        total: entries.length,
        message: `Processing ${currentEntry.date}.`
      });
      log(`Detected ${page}. Processing entry ${index + 1}/${entries.length}`, currentEntry);

      if (page === "page1") {
        await fillPage1(currentEntry);
        return;
      }

      if (page === "page2") {
        await fillPage2(currentEntry);
        return;
      }

      if (page === "page3") {
        log("Detected diary entries page, opening Create to continue automation");
        await continueFromEntriesList(entries);
        return;
      }

      if (page === "page4") {
        log("Detected edit diary entry page");
        await handleExistingEditEntry(entries);
      }
    } catch (error) {
      if (error?.message === "Automation stopped by user") {
        await updateAutomationStatus({
          state: "stopped",
          phase: "stopped",
          message: "Automation stopped from the popup."
        });
        log("Automation stopped by user");
      } else if (error?.message === "__VTU_RELOAD__") {
        log("Reloading the page to recover the automation flow");
      } else {
        await updateAutomationStatus({
          state: "error",
          phase: "error",
          message: error?.message || "Automation stopped unexpectedly."
        });
        console.error("[VTU Automator] Automation stopped:", error);
      }
    } finally {
      window.__VTU_AUTOMATOR_RUNNING__ = false;
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (
      changes.vtuAutomationEnabled ||
      changes.vtuCurrentIndex ||
      changes.vtuAutomationStatus ||
      changes.vtuPanelVisible ||
      changes.vtuPanelCollapsed ||
      changes.vtuPanelPosition
    ) {
      renderFloatingPanel().catch(() => {});
    }

    if (changes.vtuAutomationEnabled?.newValue === false) {
      automationState.stopRequested = true;
      if (automationState.suppressNextStopStatus) {
        automationState.suppressNextStopStatus = false;
      } else {
        updateAutomationStatus({
          state: "stopped",
          phase: "stopped",
          message: "Stop requested from the popup."
        });
      }
      log("Stop requested from popup");
    }

    if (changes.vtuAutomationEnabled?.newValue === true) {
      automationState.stopRequested = false;
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "VTU_START") {
      validateCurrentEntries()
        .then(async (result) => {
          await setAutomationEnabled(true);
          automationState.stopRequested = false;
          await updateAutomationStatus({
            state: "running",
            phase: "starting",
            page: detectPage(),
            date: result.dates[0] || null,
            index: await getCurrentIndex(),
            total: result.count,
            message: "Start received. Waiting for the page to settle."
          });
          log("Received start command from popup");
          humanDelay(200, 500, "starting from popup").then(() => run());
          sendResponse({ ok: true, result });
        })
        .catch(async (error) => {
          await setAutomationEnabled(false);
          await updateAutomationStatus({
            state: "error",
            phase: "validation_error",
            message: error?.message || "Validation failed."
          });
          sendResponse({ ok: false, error: error?.message || "Validation failed." });
        });
      return true;
    }

    if (message?.type === "VTU_STOP") {
      automationState.stopRequested = true;
      updateAutomationStatus({
        state: "stopped",
        phase: "stopped",
        message: "Stop command received from the popup."
      });
      log("Received stop command from popup");
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "VTU_PANEL_VISIBILITY") {
      setPanelVisible(message.visible !== false)
        .then(() => renderFloatingPanel())
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message?.type === "VTU_VALIDATE_DATA") {
      validateCurrentEntries()
        .then(async (result) => {
          await updateAutomationStatus({
            state: "idle",
            phase: "validated",
            page: detectPage(),
            date: result.dates[0] || null,
            index: result.count,
            total: result.count,
            message: `Validated ${result.count} entries from ${result.source === "imported_json" ? "imported JSON" : "data.json"}.`
          });
          sendResponse({ ok: true, result });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

  });

  renderFloatingPanel().catch(() => {});
  await humanDelay(TIMINGS.initialSettle[0], TIMINGS.initialSettle[1], "initial page settle");
  await run();
})();
