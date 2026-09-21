(function () {
  var ROUTE_KEY = "ai_project_hub_route";
  var ACTIVE_SECTION_KEY = "ai_project_hub_active_section";
  var AI_SECTION_KEY = "ai_project_hub_ai_section";
  var PENDING_KEY = "ai_project_hub_pending_nav";
  var NAV_GROUPS_KEY = "ai_project_hub_nav_groups_open";
  var SIDEBAR_COLLAPSED_KEY = "ai_project_hub_sidebar_collapsed";
  var PENDING_MAX_AGE = 10 * 60 * 1000;
  var RESTORE_GRACE_MS = 15000;
  var restoreTimer = 0;
  var restoreAttempts = 0;
  var lastClickSection = "";
  var lastClickAt = 0;

  function aiNavigationEnabled() {
    var features = window.__AI_PROJECT_HUB_FEATURES__ || {};
    return features.aiNavigation !== false;
  }

  var AI_SECTIONS = {
    radar: "AI\u8ffd\u95ee\u96f7\u8fbe",
    chat: "AI\u5bf9\u8bdd",
    advice: "\u5f02\u5e38\u5efa\u8bae",
    notifications: "\u901a\u77e5\u8ffd\u8e2a",
    agents: "Agent\u7f16\u6392"
  };

  function now() {
    return Date.now();
  }

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be unavailable in strict browser modes.
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Ignore.
    }
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeSection(value) {
    if (!value) {
      return "";
    }
    var normalized = String(value).replace(/^ai[-_]/, "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(AI_SECTIONS, normalized) ? normalized : "";
  }

  function sectionFromText(text) {
    var label = compactText(text);
    for (var section in AI_SECTIONS) {
      if (AI_SECTIONS[section] === label) {
        return section;
      }
    }
    return "";
  }

  function parsePending() {
    try {
      var raw = safeGet(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function setRestorePending(section) {
    window.__AI_PROJECT_HUB_NAV_RESTORE_PENDING__ = {
      section: section,
      until: now() + RESTORE_GRACE_MS
    };
  }

  function clearRestorePending() {
    var pending = window.__AI_PROJECT_HUB_NAV_RESTORE_PENDING__;
    if (pending && pending.until && pending.until > now()) {
      window.__AI_PROJECT_HUB_NAV_RESTORE_PENDING__ = null;
    }
  }

  function updateHash(section) {
    var nextHash = "#ai-" + section;
    if (window.location.hash === nextHash) {
      return;
    }
    try {
      window.history.replaceState(window.history.state, document.title, window.location.pathname + window.location.search + nextHash);
    } catch (error) {
      window.location.hash = nextHash;
    }
  }

  function clearAiHash() {
    if (!/^#ai[-_]/i.test(window.location.hash || "")) {
      return;
    }
    try {
      window.history.replaceState(window.history.state, document.title, window.location.pathname + window.location.search);
    } catch (error) {
      window.location.hash = "";
    }
  }

  function clearRememberedAiRoute() {
    safeRemove(PENDING_KEY);
    safeRemove(ROUTE_KEY);
    safeRemove(ACTIVE_SECTION_KEY);
    safeRemove(AI_SECTION_KEY);
    clearRestorePending();
    clearAiHash();
  }

  function keepAiGroupOpen() {
    if (!aiNavigationEnabled()) {
      return;
    }
    var groups = {};
    try {
      groups = JSON.parse(safeGet(NAV_GROUPS_KEY) || "{}") || {};
    } catch (error) {
      groups = {};
    }
    groups.ai = true;
    safeSet(NAV_GROUPS_KEY, JSON.stringify(groups));
    if (!document.querySelector(".app-shell.sidebar-collapsed") && !window.__AI_PROJECT_HUB_COLLAPSED_FLYOUT_NAV__) {
      safeSet(SIDEBAR_COLLAPSED_KEY, "0");
    }
  }

  function rememberAiRoute(section, source) {
    section = normalizeSection(section);
    if (!section) {
      return;
    }
    keepAiGroupOpen();
    safeSet(ROUTE_KEY, "ai");
    safeSet(ACTIVE_SECTION_KEY, "ai");
    safeSet(AI_SECTION_KEY, section);
    safeSet(PENDING_KEY, JSON.stringify({ route: "ai", section: section, source: source || "nav", at: now() }));
    setRestorePending(section);
    updateHash(section);
  }

  function targetFromHash() {
    var match = /^#ai[-_](radar|chat|advice|notifications|agents)$/i.exec(window.location.hash || "");
    return match ? normalizeSection(match[1]) : "";
  }

  function targetFromStorage() {
    var pending = parsePending();
    if (pending && pending.route === "ai" && now() - Number(pending.at || 0) < PENDING_MAX_AGE) {
      return normalizeSection(pending.section);
    }
    if (pending) {
      safeRemove(PENDING_KEY);
    }
    if (safeGet(ROUTE_KEY) === "ai" || safeGet(ACTIVE_SECTION_KEY) === "ai") {
      return normalizeSection(safeGet(AI_SECTION_KEY));
    }
    return "";
  }

  function getRestoreTarget() {
    return targetFromHash() || targetFromStorage();
  }

  function isAiGroup(group) {
    if (!group) {
      return false;
    }
    if (group.querySelector(".nav-ai-icon")) {
      return true;
    }
    return /\bAI\s*\u529f\u80fd\u96c6\u6210\b/.test(compactText(group.textContent));
  }

  function getAiGroup() {
    var groups = Array.prototype.slice.call(document.querySelectorAll(".nav-group"));
    for (var index = 0; index < groups.length; index += 1) {
      if (isAiGroup(groups[index])) {
        return groups[index];
      }
    }
    return null;
  }

  function getAiButton(section) {
    var group = getAiGroup();
    if (!group) {
      return null;
    }
    var buttons = Array.prototype.slice.call(group.querySelectorAll(".nav-children button"));
    for (var index = 0; index < buttons.length; index += 1) {
      if (sectionFromText(buttons[index].textContent) === section) {
        return buttons[index];
      }
    }
    return null;
  }

  function isSectionActive(section) {
    var button = getAiButton(section);
    return !!(button && button.classList.contains("active"));
  }

  function clickButton(button) {
    if (!button) {
      return;
    }
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function openAiGroupIfNeeded(group, afterOpen) {
    if (!group || !group.classList.contains("collapsed")) {
      afterOpen();
      return;
    }
    var parentButton = group.querySelector(":scope > button");
    clickButton(parentButton);
    window.setTimeout(afterOpen, 90);
  }

  function applyTarget(section) {
    var shell = document.querySelector(".app-shell");
    if (!shell) {
      return false;
    }
    if (shell.classList.contains("sidebar-collapsed")) {
      var collapsedButton = getAiButton(section);
      if (!collapsedButton) {
        return false;
      }
      if (!collapsedButton.classList.contains("active")) {
        clickButton(collapsedButton);
      }
      return true;
    }

    var group = getAiGroup();
    var button = getAiButton(section);
    if (!group || !button) {
      return false;
    }
    openAiGroupIfNeeded(group, function () {
      var currentButton = getAiButton(section);
      if (currentButton && !currentButton.classList.contains("active")) {
        clickButton(currentButton);
      }
    });
    return true;
  }

  function scheduleRestore(delay) {
    window.clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(restoreAiRoute, delay);
  }

  function restoreAiRoute() {
    if (!aiNavigationEnabled()) {
      clearRestorePending();
      return;
    }
    var section = getRestoreTarget();
    if (!section) {
      clearRestorePending();
      return;
    }
    setRestorePending(section);
    keepAiGroupOpen();
    restoreAttempts += 1;

    if (isSectionActive(section)) {
      safeRemove(PENDING_KEY);
      clearRestorePending();
      return;
    }

    if (applyTarget(section)) {
      window.setTimeout(function () {
        if (isSectionActive(section)) {
          safeRemove(PENDING_KEY);
          clearRestorePending();
        } else if (restoreAttempts < 8) {
          scheduleRestore(220);
        }
      }, 160);
      return;
    }

    if (restoreAttempts < 40) {
      scheduleRestore(250);
    }
  }

  function sectionFromNavButton(button) {
    if (!button) {
      return "";
    }
    var group = button.closest(".nav-group");
    if (!isAiGroup(group)) {
      return "";
    }
    if (!button.closest(".nav-children")) {
      keepAiGroupOpen();
      return "";
    }
    return sectionFromText(button.textContent);
  }

  function handlePossibleAiClick(event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    var button = target.closest("button");
    var navGroup = button && button.closest(".nav-group");
    var inSidebarNav = !!(button && button.closest(".sidebar nav"));
    var inAiGroup = isAiGroup(navGroup);
    var section = sectionFromNavButton(button);

    if (inSidebarNav && !inAiGroup && !section) {
      clearRememberedAiRoute();
      return;
    }
    if (inSidebarNav && inAiGroup && !section) {
      keepAiGroupOpen();
      return;
    }
    if (!section) {
      return;
    }

    lastClickSection = section;
    lastClickAt = now();
    rememberAiRoute(section, event.type);
    window.setTimeout(function () {
      if (lastClickSection === section && now() - lastClickAt < 1500 && !isSectionActive(section)) {
        applyTarget(section);
      }
    }, 260);
    window.setTimeout(function () {
      if (lastClickSection === section && now() - lastClickAt < 2000 && !isSectionActive(section)) {
        applyTarget(section);
      }
    }, 850);
  }

  document.addEventListener("pointerdown", handlePossibleAiClick, true);
  document.addEventListener("click", handlePossibleAiClick, true);
  window.addEventListener("hashchange", function () {
    restoreAttempts = 0;
    scheduleRestore(40);
  });

  var initialTarget = aiNavigationEnabled() ? getRestoreTarget() : "";
  if (initialTarget) {
    rememberAiRoute(initialTarget, "restore");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      scheduleRestore(80);
    });
  } else {
    scheduleRestore(80);
  }
  window.setTimeout(function () {
    restoreAttempts = 0;
    scheduleRestore(600);
  }, 1200);
})();
