(function () {
  const STORAGE_KEYS = {
    currentIndex: "vtuCurrentIndex",
    automationEnabled: "vtuAutomationEnabled",
    status: "vtuAutomationStatus",
    overwriteExisting: "vtuOverwriteExisting",
    panelVisible: "vtuPanelVisible",
    panelCollapsed: "vtuPanelCollapsed",
    panelPosition: "vtuPanelPosition",
    importedEntries: "vtuImportedEntries"
  };

  function get(keys) {
    return chrome.storage.local.get(keys);
  }

  async function getCurrentIndex() {
    const result = await get(STORAGE_KEYS.currentIndex);
    return Number.isInteger(result[STORAGE_KEYS.currentIndex]) ? result[STORAGE_KEYS.currentIndex] : 0;
  }

  async function setCurrentIndex(index) {
    await chrome.storage.local.set({ [STORAGE_KEYS.currentIndex]: index });
  }

  async function incrementCurrentIndex() {
    const index = await getCurrentIndex();
    const nextIndex = index + 1;
    await setCurrentIndex(nextIndex);
    return nextIndex;
  }

  async function isAutomationEnabled() {
    const result = await get(STORAGE_KEYS.automationEnabled);
    return Boolean(result[STORAGE_KEYS.automationEnabled]);
  }

  async function setAutomationEnabled(enabled) {
    await chrome.storage.local.set({ [STORAGE_KEYS.automationEnabled]: Boolean(enabled) });
  }

  async function getAutomationStatus() {
    const result = await get(STORAGE_KEYS.status);
    return result[STORAGE_KEYS.status] || null;
  }

  async function setAutomationStatus(status) {
    await chrome.storage.local.set({ [STORAGE_KEYS.status]: status });
  }

  async function clearAutomationStatus() {
    await chrome.storage.local.remove(STORAGE_KEYS.status);
  }

  async function getOverwriteExisting() {
    const result = await get(STORAGE_KEYS.overwriteExisting);
    return Boolean(result[STORAGE_KEYS.overwriteExisting]);
  }

  async function setOverwriteExisting(enabled) {
    await chrome.storage.local.set({ [STORAGE_KEYS.overwriteExisting]: Boolean(enabled) });
  }

  async function isPanelVisible() {
    const result = await get(STORAGE_KEYS.panelVisible);
    return result[STORAGE_KEYS.panelVisible] !== false;
  }

  async function setPanelVisible(visible) {
    await chrome.storage.local.set({ [STORAGE_KEYS.panelVisible]: Boolean(visible) });
  }

  async function isPanelCollapsed() {
    const result = await get(STORAGE_KEYS.panelCollapsed);
    return Boolean(result[STORAGE_KEYS.panelCollapsed]);
  }

  async function setPanelCollapsed(collapsed) {
    await chrome.storage.local.set({ [STORAGE_KEYS.panelCollapsed]: Boolean(collapsed) });
  }

  async function getPanelPosition() {
    const result = await get(STORAGE_KEYS.panelPosition);
    const position = result[STORAGE_KEYS.panelPosition];
    return position && typeof position.x === "number" && typeof position.y === "number" ? position : null;
  }

  async function setPanelPosition(position) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.panelPosition]: position && typeof position.x === "number" && typeof position.y === "number"
        ? position
        : null
    });
  }

  async function getImportedEntries() {
    const result = await get(STORAGE_KEYS.importedEntries);
    return Array.isArray(result[STORAGE_KEYS.importedEntries]) ? result[STORAGE_KEYS.importedEntries] : [];
  }

  async function setImportedEntries(entries) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.importedEntries]: Array.isArray(entries) ? entries : []
    });
  }

  globalThis.VTUStorage = {
    clearAutomationStatus,
    getImportedEntries,
    getOverwriteExisting,
    STORAGE_KEYS,
    getAutomationStatus,
    getCurrentIndex,
    incrementCurrentIndex,
    isAutomationEnabled,
    isPanelCollapsed,
    isPanelVisible,
    setAutomationEnabled,
    setAutomationStatus,
    setCurrentIndex,
    setImportedEntries,
    setOverwriteExisting,
    setPanelCollapsed,
    setPanelPosition,
    setPanelVisible,
    getPanelPosition
  };
})();
