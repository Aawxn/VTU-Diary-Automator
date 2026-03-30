(function () {
  const DEFAULT_TIMEOUT = 15000;

  function isAutomationCancelled() {
    return Boolean(globalThis.VTUAutomationControl?.isCancelled?.());
  }

  function throwIfAutomationCancelled() {
    if (isAutomationCancelled()) {
      throw new Error("Automation stopped by user");
    }
  }

  function log(...args) {
    console.log("[VTU Automator]", ...args);
  }

  async function sleep(ms) {
    const endTime = Date.now() + ms;

    while (Date.now() < endTime) {
      throwIfAutomationCancelled();
      const remaining = endTime - Date.now();
      await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 120)));
    }

    throwIfAutomationCancelled();
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function humanDelay(min = 1000, max = 3000, reason = "waiting") {
    const duration = randomInt(min, max);
    log(`${reason} for ${duration}ms`);
    await sleep(duration);
  }

  async function retry(fn, attempts = 3, delayMs = 1200) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      throwIfAutomationCancelled();

      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;
        log(`Retry ${attempt}/${attempts} failed: ${error.message}`);

        if (attempt < attempts) {
          await humanDelay(delayMs, delayMs + 600, "retry backoff");
        }
      }
    }

    throw lastError;
  }

  function waitForElement(selector, timeout = DEFAULT_TIMEOUT, root = document) {
    return new Promise((resolve, reject) => {
      throwIfAutomationCancelled();

      let timer;
      let cancelWatcher;

      function cleanup() {
        clearTimeout(timer);
        clearInterval(cancelWatcher);
        observer.disconnect();
      }

      const existing = root.querySelector(selector);

      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        if (isAutomationCancelled()) {
          cleanup();
          reject(new Error("Automation stopped by user"));
          return;
        }

        const element = root.querySelector(selector);
        if (!element) {
          return;
        }

        cleanup();
        resolve(element);
      });

      observer.observe(root === document ? document.documentElement : root, {
        childList: true,
        subtree: true
      });

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Element not found: ${selector}`));
      }, timeout);

      cancelWatcher = setInterval(() => {
        if (!isAutomationCancelled()) {
          return;
        }

        cleanup();
        reject(new Error("Automation stopped by user"));
      }, 120);
    });
  }

  function normalizeText(value) {
    return (value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function textMatches(value, terms) {
    const normalized = normalizeText(value);
    return terms.some((term) => normalized.includes(normalizeText(term)));
  }

  function getVisibleText(element) {
    return normalizeText(
      element?.innerText ||
      element?.textContent ||
      element?.value ||
      element?.getAttribute?.("placeholder") ||
      ""
    );
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function setFieldValue(element, value) {
    setNativeValue(element, value);
    dispatchInputEvents(element);
  }

  async function typeLikeHuman(element, value) {
    if (!element) {
      throw new Error("Cannot type into a missing element");
    }

    element.focus();
    element.click();

    const tagName = element.tagName.toLowerCase();
    if (tagName === "select") {
      setFieldValue(element, value);
      return;
    }

    setFieldValue(element, "");

    for (const character of String(value)) {
      setNativeValue(element, `${element.value}${character}`);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(randomInt(20, 60));
    }

    dispatchInputEvents(element);
  }

  function getLabelsForControl(element) {
    const labels = [];

    if (element.labels?.length) {
      labels.push(...Array.from(element.labels));
    }

    const id = element.getAttribute("id");
    if (id) {
      labels.push(...Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)));
    }

    const wrappingLabel = element.closest("label");
    if (wrappingLabel) {
      labels.push(wrappingLabel);
    }

    return labels;
  }

  function getFieldDescriptor(element) {
    const parts = [
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("type"),
      ...getLabelsForControl(element).map((label) => label.textContent)
    ];

    return normalizeText(parts.filter(Boolean).join(" "));
  }

  function findFieldByTerms(terms, options = {}) {
    const {
      selector = "input, textarea, select",
      root = document,
      includeReadOnly = false
    } = options;

    const elements = Array.from(root.querySelectorAll(selector)).filter((element) => {
      if (element.disabled || (!includeReadOnly && element.readOnly)) {
        return false;
      }

      const descriptor = getFieldDescriptor(element);
      return terms.some((term) => descriptor.includes(normalizeText(term)));
    });

    return elements[0] || null;
  }

  function findButtonByTerms(terms, root = document) {
    const buttons = Array.from(root.querySelectorAll("button, input[type='button'], input[type='submit'], a[role='button']"));

    return buttons.find((button) => {
      const descriptor = [
        button.textContent,
        button.value,
        button.getAttribute("aria-label"),
        button.getAttribute("title")
      ].filter(Boolean).join(" ");

      return textMatches(descriptor, terms);
    }) || null;
  }

  function pageContainsText(terms, root = document.body) {
    const bodyText = getVisibleText(root);
    return terms.some((term) => bodyText.includes(normalizeText(term)));
  }

  function looksLikeSuccessMessage() {
    const selectors = [
      "[role='alert']",
      ".alert",
      ".toast",
      ".notification",
      ".swal2-popup",
      ".mat-snack-bar-container"
    ];

    const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    return candidates.some((candidate) => textMatches(getVisibleText(candidate), ["saved", "success", "submitted", "updated"]));
  }

  function waitForUrlChange(previousUrl, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const started = Date.now();

      const interval = setInterval(() => {
        if (isAutomationCancelled()) {
          clearInterval(interval);
          reject(new Error("Automation stopped by user"));
          return;
        }

        if (window.location.href !== previousUrl) {
          clearInterval(interval);
          resolve(window.location.href);
          return;
        }

        if (Date.now() - started > timeout) {
          clearInterval(interval);
          reject(new Error("Timed out waiting for URL change"));
        }
      }, 300);
    });
  }

  function waitForCondition(predicate, timeout = DEFAULT_TIMEOUT, pollMs = 300, message = "Condition timed out") {
    return new Promise((resolve, reject) => {
      const started = Date.now();

      const interval = setInterval(() => {
        if (isAutomationCancelled()) {
          clearInterval(interval);
          reject(new Error("Automation stopped by user"));
          return;
        }

        try {
          const result = predicate();
          if (result) {
            clearInterval(interval);
            resolve(result);
            return;
          }

          if (Date.now() - started > timeout) {
            clearInterval(interval);
            reject(new Error(message));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, pollMs);
    });
  }

  globalThis.VTUUtils = {
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
    sleep,
    textMatches,
    throwIfAutomationCancelled,
    typeLikeHuman,
    waitForCondition,
    waitForElement,
    waitForUrlChange
  };
})();
