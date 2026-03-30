(async function () {
  const statusText = document.getElementById("statusText");
  const statusBadge = document.getElementById("statusBadge");
  const indexText = document.getElementById("indexText");
  const dateText = document.getElementById("dateText");
  const phaseText = document.getElementById("phaseText");
  const statusBar = document.getElementById("statusBar");
  const hintText = document.getElementById("hintText");
  const sourceBadge = document.getElementById("sourceBadge");
  const toggleBtn = document.getElementById("toggleBtn");
  const validateBtn = document.getElementById("validateBtn");
  const panelBtn = document.getElementById("panelBtn");
  const importToggleBtn = document.getElementById("importToggleBtn");
  const resetBtn = document.getElementById("resetBtn");
  const overwriteBtn = document.getElementById("overwriteBtn");
  const importDrawer = document.getElementById("importDrawer");
  const importFeedback = document.getElementById("importFeedback");
  const jsonInput = document.getElementById("jsonInput");
  const fileInput = document.getElementById("fileInput");
  const clearImportBtn = document.getElementById("clearImportBtn");
  let transientHint = "";
  let importValidationState = {
    valid: false,
    entries: [],
    error: "",
    source: "data.json"
  };
  let validationTimer = null;

  function toTitleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function clampPercentage(value) {
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  }

  function normalizeValue(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function compactValue(value) {
    return normalizeValue(value).replace(/[^a-z0-9+.#/&]/g, "");
  }

  function resolveAllowedSkill(skill) {
    const allowedSkills = globalThis.VTUSkills?.allowed || [];
    const aliases = globalThis.VTUSkills?.aliases || {};
    const requested = String(skill || "").trim();
    const normalizedRequested = normalizeValue(requested);
    const compactRequested = compactValue(requested);

    const exact = allowedSkills.find((allowedSkill) => normalizeValue(allowedSkill) === normalizedRequested);
    if (exact) {
      return exact;
    }

    const compactExact = allowedSkills.find((allowedSkill) => compactValue(allowedSkill) === compactRequested);
    if (compactExact) {
      return compactExact;
    }

    const aliasTarget = aliases[compactRequested];
    if (aliasTarget) {
      const aliasMatch = allowedSkills.find((allowedSkill) => normalizeValue(allowedSkill) === aliasTarget);
      if (aliasMatch) {
        return aliasMatch;
      }
    }

    const partialMatch = allowedSkills.find((allowedSkill) => {
      const normalizedAllowed = normalizeValue(allowedSkill);
      return normalizedAllowed.includes(normalizedRequested) || normalizedRequested.includes(normalizedAllowed);
    });

    throw new Error(
      partialMatch
        ? `Skill "${requested}" is not in the VTU list. Did you mean "${partialMatch}"?`
        : `Skill "${requested}" is not in the VTU list.`
    );
  }

  function validateEntriesPayload(entries) {
    if (!Array.isArray(entries)) {
      throw new Error("Imported JSON must be an array.");
    }

    return entries.map((entry, index) => {
      const workSummary = entry?.workSummary ?? entry?.work_summary ?? entry?.work;
      const learningOutcomes = entry?.learningOutcomes ?? entry?.learning_outcomes ?? entry?.learning;
      const hours = entry?.hours ?? 3;
      const requestedSkills = Array.isArray(entry?.skills) && entry.skills.length
        ? entry.skills.map((skill) => String(skill))
        : ["Machine learning"];

      if (!entry?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) {
        throw new Error(`Entry ${index + 1} is missing a valid YYYY-MM-DD date.`);
      }

      if (!workSummary || !String(workSummary).trim()) {
        throw new Error(`Entry ${index + 1} is missing workSummary.`);
      }

      if (!learningOutcomes || !String(learningOutcomes).trim()) {
        throw new Error(`Entry ${index + 1} is missing learningOutcomes.`);
      }

      return {
        date: String(entry.date),
        workSummary: String(workSummary),
        learningOutcomes: String(learningOutcomes),
        hours: String(hours),
        skills: requestedSkills.map((skill) => resolveAllowedSkill(skill))
      };
    });
  }

  function sanitizeImportedText(rawValue) {
    let value = String(rawValue || "");

    value = value
      .replace(/^\uFEFF/, "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[\u00A0\u2007\u202F]/g, " ")
      .replace(/[\u200B-\u200D\u2060]/g, "")
      .trim();

    const fencedMatch = value.match(/```(?:json|txt|text)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      value = fencedMatch[1].trim();
    }

    const firstBracket = value.indexOf("[");
    const lastBracket = value.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      value = value.slice(firstBracket, lastBracket + 1).trim();
    }

    return value;
  }

  function normalizeJsonLikeText(rawValue) {
    const raw = String(rawValue || "").replace(/\r\n?/g, "\n");
    let normalized = "";
    let inString = false;
    let quote = "";
    let escaped = false;

    for (let index = 0; index < raw.length; index += 1) {
      const character = raw[index];

      if (!inString) {
        if (character === "\"" || character === "'") {
          inString = true;
          quote = character;
          normalized += character === "'" ? "\"" : character;
          continue;
        }

        normalized += character;
        continue;
      }

      if (escaped) {
        normalized += character;
        escaped = false;
        continue;
      }

      if (character === "\\") {
        normalized += character;
        escaped = true;
        continue;
      }

      if (character === "\n" || character === "\t") {
        normalized += " ";
        continue;
      }

      if (character === quote) {
        normalized += quote === "'" ? "\"" : character;
        inString = false;
        quote = "";
        continue;
      }

      normalized += character;
    }

    return normalized.replace(/,\s*([}\]])/g, "$1");
  }

  function parseJsonInput(rawOverride = null) {
    const raw = rawOverride ?? jsonInput.value;
    const sanitized = sanitizeImportedText(raw);
    if (!sanitized) {
      throw new Error("Paste a JSON array before starting.");
    }

    const attempts = [sanitized, normalizeJsonLikeText(sanitized)];
    let lastError = null;

    for (const candidate of attempts) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          return {
            parsed,
            sanitized: candidate
          };
        }

        if (parsed && typeof parsed === "object") {
          return {
            parsed: [parsed],
            sanitized: JSON.stringify([parsed], null, 2)
          };
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(lastError?.message || "Imported JSON could not be parsed.");
  }

  async function activateImportedEntries(entries, message) {
    const state = await readState();
    const storagePatch = {
      vtuImportedEntries: entries
    };

    if (!isActuallyRunning(state)) {
      storagePatch.vtuAutomationStatus = {
        state: "idle",
        phase: "validated",
        date: entries[0]?.date || null,
        index: entries.length,
        total: entries.length,
        message
      };
    }

    await chrome.storage.local.set(storagePatch);
  }

  function getStatusMessage(state, running) {
    const status = state.status || {};
    if (status.message) {
      return status.message;
    }

    if (status.state === "completed") {
      return "All entries are done or were safely skipped.";
    }

    if (status.state === "validated") {
      return "Validation passed. You can start the run when ready.";
    }

    if (running) {
      return "Automation is running on the active VTU tab.";
    }

    return "Waiting for Start.";
  }

  function getActiveSourceLabel(state) {
    return state.importedEntries.length ? "Imported JSON" : "data.json";
  }

  async function readState() {
    const result = await chrome.storage.local.get([
      "vtuAutomationEnabled",
      "vtuCurrentIndex",
      "vtuAutomationStatus",
      "vtuPanelVisible",
      "vtuImportedEntries",
      "vtuOverwriteExisting"
    ]);

    return {
      enabled: Boolean(result.vtuAutomationEnabled),
      index: Number.isInteger(result.vtuCurrentIndex) ? result.vtuCurrentIndex : 0,
      status: result.vtuAutomationStatus || null,
      panelVisible: result.vtuPanelVisible !== false,
      importedEntries: Array.isArray(result.vtuImportedEntries) ? result.vtuImportedEntries : [],
      overwriteExisting: Boolean(result.vtuOverwriteExisting)
    };
  }

  function isActuallyRunning(state) {
    const terminalStates = ["completed", "stopped", "error", "idle"];
    const statusState = state.status?.state;
    if (statusState && terminalStates.includes(statusState)) {
      return false;
    }

    return Boolean(state.enabled);
  }

  function getProgress(state) {
    const total = Number(state.status?.total) || 0;
    const index = Number(state.status?.index ?? state.index) || 0;
    const progress = total > 0 ? (Math.min(index, total) / total) * 100 : 0;
    return {
      total,
      index,
      percentage: clampPercentage(progress)
    };
  }

  async function render() {
    const state = await readState();
    const progress = getProgress(state);
    const status = state.status || {};
    const running = isActuallyRunning(state);
    const currentState = status.state || (running ? "running" : "idle");
    const panelLabel = state.panelVisible ? "Hide Panel" : "Show Panel";
    const feedbackMessage = importValidationState.error
      ? importValidationState.error
      : (importValidationState.valid && importDrawer.classList.contains("open")
          ? `Validated ${importValidationState.entries.length} entr${importValidationState.entries.length === 1 ? "y" : "ies"} and set imported JSON as the active source.`
          : "");
    const hintMessage = transientHint || (
      importDrawer.classList.contains("open")
        ? importValidationState.error ||
          (importValidationState.valid
            ? `Looks good: ${importValidationState.entries.length} entries ready to use.`
            : "Paste or upload a JSON array. Validation runs automatically.")
        : (state.importedEntries.length
            ? `Imported JSON active: ${state.importedEntries.length} entries`
            : "Using built-in VTU skill validation.")
    );

    statusBadge.dataset.state = currentState;
    statusBadge.textContent = toTitleCase(currentState);
    dateText.textContent = status.date || "No date yet";
    statusText.textContent = getStatusMessage(state, running);
    phaseText.textContent = toTitleCase(status.phase || "idle");
    indexText.textContent = progress.total > 0 ? `${Math.min(progress.index, progress.total)} / ${progress.total}` : "0 / 0";
    statusBar.style.width = `${progress.percentage}%`;

    toggleBtn.dataset.mode = running ? "stop" : "start";
    toggleBtn.textContent = running ? "Stop Automation" : "Start Automation";
    panelBtn.textContent = panelLabel;
    importToggleBtn.textContent = importDrawer.classList.contains("open") ? "Hide Data Input" : "Data Input";
    overwriteBtn.textContent = `Overwrite Existing: ${state.overwriteExisting ? "On" : "Off"}`;
    hintText.textContent = hintMessage;
    hintText.dataset.state = importValidationState.error
      ? "error"
      : (importValidationState.valid ? "success" : "");
    importFeedback.hidden = !feedbackMessage;
    importFeedback.textContent = feedbackMessage;
    importFeedback.dataset.state = importValidationState.error ? "error" : "success";
    jsonInput.dataset.state = importValidationState.error
      ? "error"
      : (importValidationState.valid ? "valid" : "");
    sourceBadge.textContent = getActiveSourceLabel(state);
    sourceBadge.dataset.source = state.importedEntries.length ? "imported" : "file";
    if (!jsonInput.value && state.importedEntries.length) {
      jsonInput.value = JSON.stringify(state.importedEntries, null, 2);
      importValidationState = {
        valid: true,
        entries: state.importedEntries,
        error: "",
        source: "imported"
      };
    }
  }

  function toggleDrawer(forceOpen) {
    const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !importDrawer.classList.contains("open");
    importDrawer.classList.toggle("open", nextOpen);
    importToggleBtn.textContent = nextOpen ? "Hide Data Input" : "Data Input";
    if (nextOpen) {
      requestAnimationFrame(() => {
        importDrawer.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  async function notifyActiveTab(message) {
    const tab = await getActiveTab();
    if (!tab?.id) {
      hintText.textContent = "Open the VTU page in the active tab first.";
      transientHint = hintText.textContent;
      return null;
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      hintText.textContent = "Refresh the VTU page once, then try again.";
      transientHint = hintText.textContent;
      return null;
    }
  }

  async function autoValidateImport() {
    const raw = jsonInput.value.trim();
    if (!raw) {
      importValidationState = {
        valid: false,
        entries: [],
        error: "",
        source: "data.json"
      };
      await render();
      return;
    }

    try {
      const { parsed, sanitized } = parseJsonInput(raw);
      const normalizedEntries = validateEntriesPayload(parsed);
      importValidationState = {
        valid: true,
        entries: normalizedEntries,
        error: "",
        source: "imported"
      };
      if (jsonInput.value !== sanitized) {
        jsonInput.value = JSON.stringify(parsed, null, 2);
      }

      await activateImportedEntries(
        normalizedEntries,
        `Validated ${normalizedEntries.length} imported entr${normalizedEntries.length === 1 ? "y" : "ies"}.`
      );
      transientHint = `Imported JSON active: ${normalizedEntries.length} entr${normalizedEntries.length === 1 ? "y" : "ies"} validated automatically.`;
    } catch (error) {
      importValidationState = {
        valid: false,
        entries: [],
        error: error.message,
        source: "imported"
      };
      transientHint = error.message;
    }

    await render();
  }

  function queueAutoValidate() {
    if (validationTimer) {
      clearTimeout(validationTimer);
    }

    validationTimer = setTimeout(() => {
      autoValidateImport().catch(() => {});
    }, 280);
  }

  async function validateBeforeStartOrManual() {
    if (jsonInput.value.trim()) {
      await autoValidateImport();
      if (!importValidationState.valid) {
        await render();
        return false;
      }
    }

    const response = await notifyActiveTab({ type: "VTU_VALIDATE_DATA" });
    if (!response) {
      await render();
      return false;
    }

    if (response.ok === false) {
      transientHint = response.error || "Validation failed.";
      await render();
      return false;
    }

    transientHint = `Validated ${response.result.count} entr${response.result.count === 1 ? "y" : "ies"} from ${response.result.source === "imported_json" ? "imported JSON" : "data.json"}.`;
    await render();
    return true;
  }

  toggleBtn.addEventListener("click", async () => {
    const state = await readState();
    const nextEnabled = !isActuallyRunning(state);

    if (nextEnabled) {
      const ready = await validateBeforeStartOrManual();
      if (!ready) {
        return;
      }

      const response = await notifyActiveTab({ type: "VTU_START" });
      if (response?.ok !== false) {
        transientHint = "Automation started on the active VTU tab.";
      }
    } else {
      await chrome.storage.local.set({ vtuAutomationEnabled: false });
      const response = await notifyActiveTab({ type: "VTU_STOP" });

      if (response?.ok !== false) {
        transientHint = "Stop sent. The current action should cancel shortly.";
      }
    }

    await render();
  });

  validateBtn.addEventListener("click", async () => {
    await validateBeforeStartOrManual();
  });

  panelBtn.addEventListener("click", async () => {
    const state = await readState();
    const nextVisible = !state.panelVisible;
    await chrome.storage.local.set({ vtuPanelVisible: nextVisible });
    const response = await notifyActiveTab({ type: "VTU_PANEL_VISIBILITY", visible: nextVisible });

    if (response?.ok !== false) {
      transientHint = nextVisible ? "Pinned panel shown on the VTU tab." : "Pinned panel hidden on the VTU tab.";
    }

    await render();
  });

  importToggleBtn.addEventListener("click", () => {
    toggleDrawer();
    if (importDrawer.classList.contains("open")) {
      queueAutoValidate();
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    transientHint = "";
    jsonInput.value = await file.text();
    toggleDrawer(true);
    queueAutoValidate();
  });

  jsonInput.addEventListener("input", () => {
    transientHint = "";
    queueAutoValidate();
  });

  jsonInput.addEventListener("paste", () => {
    transientHint = "";
    setTimeout(() => {
      queueAutoValidate();
    }, 0);
  });

  clearImportBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ vtuImportedEntries: [] });
    jsonInput.value = "";
    fileInput.value = "";
    importValidationState = {
      valid: false,
      entries: [],
      error: "",
      source: "data.json"
    };
    transientHint = "Imported JSON cleared. The extension will use data.json again.";
    toggleDrawer(false);
    await render();
  });

  overwriteBtn.addEventListener("click", async () => {
    const state = await readState();
    const nextValue = !state.overwriteExisting;

    if (nextValue) {
      const confirmed = window.confirm("Overwrite mode will bypass the existing-entry skip flow and continue into the edit form if VTU opens it. Do you want to enable overwrite mode?");
      if (!confirmed) {
        return;
      }
    }

    await chrome.storage.local.set({ vtuOverwriteExisting: nextValue });
    transientHint = nextValue
      ? "Overwrite mode enabled. Existing diary dates will no longer be skipped."
      : "Overwrite mode disabled. Existing diary dates will be skipped safely.";
    await render();
  });

  resetBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({
      vtuCurrentIndex: 0,
      vtuAutomationEnabled: false,
      vtuAutomationStatus: {
        state: "idle",
        phase: "reset",
        date: null,
        index: 0,
        total: 0,
        message: "Progress reset. Ready for a fresh run."
      }
    });

    const response = await notifyActiveTab({ type: "VTU_STOP" });
    if (response?.ok !== false) {
      transientHint = "Reset cleared run progress and stopped automation. It did not delete imported data or overwrite settings.";
    }

    await render();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (
      changes.vtuAutomationEnabled ||
      changes.vtuCurrentIndex ||
      changes.vtuAutomationStatus ||
      changes.vtuPanelVisible ||
      changes.vtuImportedEntries ||
      changes.vtuOverwriteExisting
    ) {
      render();
    }
  });

  await render();
})();
