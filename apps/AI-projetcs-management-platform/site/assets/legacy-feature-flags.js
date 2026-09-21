(function () {
  var FEATURES = {
    aiNavigation: false,
    deliveryNavigation: false
  };
  var scheduled = false;
  var retiredRedirectPending = false;
  var retiredRedirectFeature = "retired-workbench";
  var RETIRED_HASH_PREFIXES = ["#delivery-governance", "#code-quality", "#ai-agents", "#agent-workspace"];
  var RETIRED_TOOL_LABELS = {
    "\u4ee3\u7801\u8d28\u68c0": true,
    "\u7814\u53d1\u52a9\u624b": true
  };

  window.__AI_PROJECT_HUB_FEATURES__ = Object.assign(
    {},
    window.__AI_PROJECT_HUB_FEATURES__ || {},
    FEATURES
  );

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function navigationLabel(button) {
    return compactText(button && button.textContent).replace(/\s+\d+$/, "");
  }

  function isRetiredMyProjectsButton(button) {
    var label = navigationLabel(button);
    return label === "\u6211\u7684\u9879\u76ee" || label === "\u67e5\u770b\u6211\u7684\u9879\u76ee";
  }

  function isRetiredToolButton(button) {
    return Boolean(RETIRED_TOOL_LABELS[navigationLabel(button)]);
  }

  function markRetiredRedirect(feature) {
    retiredRedirectPending = true;
    retiredRedirectFeature = feature || "retired-workbench";
  }

  function isAiNavigationGroup(group) {
    if (!group) {
      return false;
    }
    if (group.querySelector(".nav-ai-icon")) {
      return true;
    }
    var button = group.querySelector(":scope > button");
    return /^AI\s*\u529f\u80fd\u96c6\u6210\b/.test(compactText(button && button.textContent));
  }

  function isDeliveryNavigationGroup(group) {
    if (!group) {
      return false;
    }
    var button = group.querySelector(":scope > button");
    return compactText(button && button.textContent).indexOf("\u4ea4\u4ed8\u81ea\u68c0") === 0;
  }

  function setGroupHidden(group, hidden) {
    group.classList.toggle("nav-feature-hidden", hidden);
    group.hidden = hidden;
    var button = group.querySelector(":scope > button");
    if (hidden) {
      group.setAttribute("aria-hidden", "true");
      group.setAttribute("inert", "");
      if (button) button.setAttribute("tabindex", "-1");
      return;
    }
    group.removeAttribute("aria-hidden");
    group.removeAttribute("inert");
    if (button && button.getAttribute("tabindex") === "-1") button.removeAttribute("tabindex");
  }

  function hideRetiredButton(button) {
    button.classList.add("nav-feature-hidden");
    button.hidden = true;
    button.disabled = true;
    button.setAttribute("aria-hidden", "true");
    button.setAttribute("inert", "");
    button.setAttribute("tabindex", "-1");
    button.style.setProperty("display", "none", "important");
  }

  function isRetiredHash(value) {
    return RETIRED_HASH_PREFIXES.some(function (prefix) {
      return String(value || "").indexOf(prefix) === 0;
    });
  }

  function removeRetiredWorkbenchSurfaces() {
    document.documentElement.classList.remove("legacy-delivery-governance-view");
    ["delivery-governance-page", "code-quality-page"].forEach(function (id) {
      var page = document.getElementById(id);
      if (page) page.remove();
    });
    Array.prototype.forEach.call(document.querySelectorAll(
      ".agent-chat-workspace, .ai-agent-console, .feishu-agent-overlay, .feishu-agent-nav-section, .code-quality-nav-section, [data-code-quality-nav]"
    ), function (page) {
      page.remove();
    });
    Array.prototype.forEach.call(document.querySelectorAll(".mine-workbench-root"), function (page) {
      if (page.classList.contains("is-active")) markRetiredRedirect("my-projects");
      page.remove();
    });
    var suspendedMain = document.querySelector("main.mine-legacy-content-suspended");
    if (suspendedMain) {
      markRetiredRedirect("my-projects");
      suspendedMain.classList.remove("mine-legacy-content-suspended");
      if (!document.querySelector(".project-ops-root.is-active")) {
        suspendedMain.removeAttribute("aria-hidden");
      }
    }
  }

  function redirectRetiredNavigation() {
    if (isRetiredHash(window.location.hash)) {
      markRetiredRedirect("delivery");
      window.history.replaceState(
        window.history.state,
        document.title,
        window.location.pathname + window.location.search
      );
    }
    if (!retiredRedirectPending) {
      return;
    }
    var target = Array.prototype.find.call(
      document.querySelectorAll(".sidebar .nav-children button, .sidebar button"),
      function (button) {
        return navigationLabel(button) === "\u5168\u90e8\u9879\u76ee";
      }
    );
    if (target) {
      var retiredFeature = retiredRedirectFeature;
      retiredRedirectPending = false;
      window.dispatchEvent(new CustomEvent("legacy-workbench:navigate", {
        detail: { path: "/projects", retiredFeature: retiredFeature }
      }));
      target.click();
    }
  }

  function applyFeatureFlags() {
    scheduled = false;
    removeRetiredWorkbenchSurfaces();
    var groups = document.querySelectorAll(".sidebar nav .nav-group");
    Array.prototype.forEach.call(groups, function (group) {
      if (isAiNavigationGroup(group)) {
        setGroupHidden(group, window.__AI_PROJECT_HUB_FEATURES__.aiNavigation === false);
      }
      if (isDeliveryNavigationGroup(group)) {
        var hidden = window.__AI_PROJECT_HUB_FEATURES__.deliveryNavigation === false;
        if (hidden && (group.classList.contains("active-group") || group.querySelector(".active, [aria-current='page']"))) {
          markRetiredRedirect("delivery");
        }
        setGroupHidden(group, hidden);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll("button"), function (button) {
      if (isRetiredToolButton(button)) {
        if (button.matches(".active, [aria-current='page'], [aria-pressed='true']")) {
          markRetiredRedirect("retired-tools");
        }
        hideRetiredButton(button);
        return;
      }
      if (!isRetiredMyProjectsButton(button)) return;
      if (button.matches(".active, [aria-current='page'], [aria-pressed='true']")) {
        markRetiredRedirect("my-projects");
      }
      hideRetiredButton(button);
    });
    redirectRetiredNavigation();
  }

  function scheduleApply() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.requestAnimationFrame(applyFeatureFlags);
  }

  var observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  redirectRetiredNavigation();
  window.addEventListener("hashchange", function () {
    redirectRetiredNavigation();
    scheduleApply();
  });

  function blockRetiredMyProjectsAction(event) {
    if (!(event.target instanceof Element)) return;
    var button = event.target.closest("button");
    if (!isRetiredMyProjectsButton(button) && !isRetiredToolButton(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    markRetiredRedirect(isRetiredToolButton(button) ? "retired-tools" : "my-projects");
    scheduleApply();
  }

  document.addEventListener("click", blockRetiredMyProjectsAction, true);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") blockRetiredMyProjectsAction(event);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  } else {
    scheduleApply();
  }
})();
