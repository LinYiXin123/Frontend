(function () {
  var SVG_NS = "http://www.w3.org/2000/svg";
  var replayingCollapsedClick = false;
  var scheduled = false;
  var activeCollapsedFlyout = null;
  var activeCollapsedGroup = null;
  var COLLAPSED_FLYOUT_ID = "collapsed-sidebar-submenu";
  var activeAccountFlyout = null;
  var activeAccountAvatar = null;
  var COLLAPSED_ACCOUNT_FLYOUT_ID = "collapsed-sidebar-account";
  var PERSPECTIVE_SESSION_KEY = "ai_project_hub_perspective";
  var PERSPECTIVE_CAPABILITY_KEY = "__AI_PROJECT_HUB_CAN_SWITCH_PERSPECTIVE__";
  var ACTIVE_PERSPECTIVE_KEY = "__AI_PROJECT_HUB_ACTIVE_PERSPECTIVE__";

  var ICONS = {
    dashboard: [
      ["rect", { x: "3", y: "3", width: "7", height: "7", rx: "1" }],
      ["rect", { x: "14", y: "3", width: "7", height: "7", rx: "1" }],
      ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1" }],
      ["rect", { x: "14", y: "14", width: "7", height: "7", rx: "1" }]
    ],
    projects: [
      ["path", { d: "M3 7.5h6l2-2h10v13.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }],
      ["path", { d: "M3 9h18" }],
      ["path", { d: "M8 13h8M8 17h5" }]
    ],
    alerts: [
      ["path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" }],
      ["path", { d: "M10 21h4" }],
      ["path", { d: "M12 7v4" }],
      ["path", { d: "M12 14h.01" }]
    ],
    ai: [
      ["rect", { x: "4", y: "7", width: "16", height: "12", rx: "3" }],
      ["path", { d: "M9 3h6M12 3v4M8 12h.01M16 12h.01M9 16h6" }],
      ["path", { d: "M2 11v4M22 11v4" }]
    ],
    delivery: [
      ["rect", { x: "5", y: "4", width: "14", height: "17", rx: "2" }],
      ["path", { d: "M9 4V2h6v2M8.5 13l2.2 2.2 4.8-5" }]
    ],
    rules: [
      ["ellipse", { cx: "12", cy: "5", rx: "8", ry: "3" }],
      ["path", { d: "M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" }],
      ["path", { d: "M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" }]
    ],
    activity: [
      ["path", { d: "M22 12h-4l-3 9L9 3l-3 9H2" }]
    ],
    progress: [
      ["path", { d: "M4 19V9M10 19V5M16 19v-7M22 19V3" }],
      ["path", { d: "M2 21h22" }]
    ],
    list: [
      ["path", { d: "M8 6h13M8 12h13M8 18h13" }],
      ["path", { d: "M3 6h.01M3 12h.01M3 18h.01" }]
    ],
    user: [
      ["circle", { cx: "12", cy: "8", r: "4" }],
      ["path", { d: "M4 21a8 8 0 0 1 16 0" }]
    ],
    logOut: [
      ["path", { d: "M10 17l5-5-5-5" }],
      ["path", { d: "M15 12H3" }],
      ["path", { d: "M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" }]
    ],
    archive: [
      ["path", { d: "M4 7h16v14H4z" }],
      ["path", { d: "M3 3h18v4H3z" }],
      ["path", { d: "M9 11h6" }]
    ],
    triangleAlert: [
      ["path", { d: "M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" }],
      ["path", { d: "M12 9v4M12 17h.01" }]
    ],
    bell: [
      ["path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" }]
    ],
    radar: [
      ["circle", { cx: "12", cy: "12", r: "9" }],
      ["circle", { cx: "12", cy: "12", r: "5" }],
      ["path", { d: "M12 12 18.4 5.6M12 3v2M21 12h-2" }]
    ],
    message: [
      ["path", { d: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" }]
    ],
    lightbulb: [
      ["path", { d: "M9 18h6M10 22h4M8.5 15.5A7 7 0 1 1 15.5 15.5c-.9.7-1.5 1.5-1.5 2.5h-4c0-1-.6-1.8-1.5-2.5Z" }]
    ],
    send: [
      ["path", { d: "m22 2-7 20-4-9-9-4Z" }],
      ["path", { d: "M22 2 11 13" }]
    ],
    bot: [
      ["rect", { x: "4", y: "7", width: "16", height: "12", rx: "3" }],
      ["path", { d: "M9 3h6M12 3v4M8 12h.01M16 12h.01M9 16h6" }]
    ],
    history: [
      ["path", { d: "M3 12a9 9 0 1 0 3-6.7L3 8" }],
      ["path", { d: "M3 3v5h5M12 7v5l3 2" }]
    ],
    sidebarToggle: [
      ["rect", { x: "4", y: "3", width: "16", height: "18", rx: "2" }],
      ["path", { d: "M9 3v18M15 9l-3 3 3 3" }]
    ],
    userCheck: [
      ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
      ["circle", { cx: "9", cy: "7", r: "4" }],
      ["path", { d: "m16 11 2 2 4-4" }]
    ],
    badgeCheck: [
      ["path", { d: "M12 3 15 5l3.5.5.5 3.5 2 3-2 3-.5 3.5L15 19l-3 2-3-2-3.5-.5L5 15l-2-3 2-3 .5-3.5L9 5Z" }],
      ["path", { d: "m9 12 2 2 4-4" }]
    ],
    gitBranch: [
      ["circle", { cx: "6", cy: "5", r: "2" }],
      ["circle", { cx: "18", cy: "6", r: "2" }],
      ["circle", { cx: "6", cy: "19", r: "2" }],
      ["path", { d: "M6 7v10M18 8a6 6 0 0 1-6 6H6" }]
    ],
    webhook: [
      ["path", { d: "M18 16.5a4 4 0 1 1-1.5-6.5M6 7.5A4 4 0 1 1 10.5 10M8 20a4 4 0 1 1 4.5-6" }],
      ["path", { d: "m14 8 2-4 2 4M5 15l-4 1 3 3M13 17l2 4 2-4" }]
    ],
    bellRing: [
      ["path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" }],
      ["path", { d: "M4 4 2.5 5.5M20 4l1.5 1.5" }]
    ],
    users: [
      ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
      ["circle", { cx: "9", cy: "7", r: "4" }],
      ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" }]
    ]
  };

  var NAV_ITEMS = {
    "\u5168\u5c40\u770b\u677f": "dashboard",
    "\u9879\u76ee\u4e2d\u5fc3": "projects",
    "\u8fdb\u5ea6\u603b\u89c8": "progress",
    "\u9884\u8b66\u4e2d\u5fc3": "alerts",
    "AI\u529f\u80fd\u96c6\u6210": "ai",
    "\u8fd0\u7ef4\u76d1\u63a7": "activity",
    "\u4ee3\u7801\u8d28\u68c0": "badgeCheck",
    "\u7814\u53d1\u52a9\u624b": "bot",
    "\u6570\u636e\u4e0e\u89c4\u5219": "rules"
  };

  var CHILD_NAV_ITEMS = {
    "\u5168\u90e8\u9879\u76ee": "list",
    "\u6211\u7684\u9879\u76ee": "user",
    "\u5df2\u5f52\u6863\u9879\u76ee": "archive",
    "\u9879\u76ee\u8be6\u60c5": "list",
    "\u5f02\u5e38\u5904\u7406": "triangleAlert",
    "\u901a\u77e5\u8bb0\u5f55": "bell",
    "AI\u8ffd\u95ee\u96f7\u8fbe": "radar",
    "AI\u5bf9\u8bdd": "message",
    "\u5f02\u5e38\u5efa\u8bae": "lightbulb",
    "\u901a\u77e5\u8ffd\u8e2a": "send",
    "\u8fd0\u884c\u603b\u89c8": "activity",
    "\u6545\u969c\u4e8b\u4ef6": "triangleAlert",
    "\u4ea4\u4ed8\u8d28\u68c0": "badgeCheck",
    "Agent\u7f16\u6392": "bot",
    "GitLab\u96c6\u6210": "gitBranch",
    "\u98de\u4e66\u96c6\u6210": "webhook",
    "\u9884\u8b66\u89c4\u5219": "bellRing",
    "\u6210\u5458\u6620\u5c04": "users"
  };

  var HIDDEN_CHILD_NAV_ITEMS = {
    "\u9879\u76ee\u8be6\u60c5": true,
    "\u9879\u76ee\u767b\u8bb0": true
  };

  var REMOVED_FEATURE_LABELS = {
    "\u9879\u76ee\u767b\u8bb0": true,
    "\uff0b \u9879\u76ee\u767b\u8bb0": true,
    "\u767b\u8bb0\u9879\u76ee": true
  };

  function createSvg(name) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("simple-nav-svg");
    svg.setAttribute("data-icon", name);

    ICONS[name].forEach(function (definition) {
      var node = document.createElementNS(SVG_NS, definition[0]);
      Object.keys(definition[1]).forEach(function (attribute) {
        node.setAttribute(attribute, definition[1][attribute]);
      });
      svg.appendChild(node);
    });
    return svg;
  }

  function enhanceIcons(sidebar) {
    Array.prototype.forEach.call(sidebar.querySelectorAll(".nav-icon"), function (slot) {
      var label = String(slot.getAttribute("title") || "").trim();
      var iconName = NAV_ITEMS[label];
      if (!iconName) {
        return;
      }

      var button = slot.closest("button");
      if (button) {
        button.setAttribute("data-nav-label", label);
        button.setAttribute("title", label);
        button.setAttribute("aria-label", label);
      }
      var group = slot.closest(".nav-group");
      if (group) {
        group.classList.toggle("nav-alert-counts-hidden", iconName === "alerts");
      }

      var current = slot.querySelector(":scope > svg.simple-nav-svg");
      if (!current || current.getAttribute("data-icon") !== iconName) {
        slot.replaceChildren(createSvg(iconName));
      }
      slot.classList.add("simple-nav-icon");
    });
  }

  function enhanceChildIcons(sidebar) {
    Array.prototype.forEach.call(sidebar.querySelectorAll(".nav-children button"), function (button) {
      var label = String(button.textContent || "").replace(/\s+/g, "").trim();
      var itemLabel = Object.keys(CHILD_NAV_ITEMS).find(function (candidateLabel) {
        return label.indexOf(candidateLabel) === 0;
      });
      var isHidden = Boolean(itemLabel && HIDDEN_CHILD_NAV_ITEMS[itemLabel]);
      button.classList.toggle("legacy-hidden-child-nav", isHidden);
      if (isHidden) {
        button.setAttribute("aria-hidden", "true");
        button.setAttribute("tabindex", "-1");
        return;
      }

      var iconName = itemLabel && CHILD_NAV_ITEMS[itemLabel];
      if (!iconName) {
        return;
      }

      var slot = button.querySelector(":scope > .simple-child-nav-icon");
      if (!slot) {
        slot = document.createElement("span");
        slot.className = "simple-child-nav-icon";
        button.prepend(slot);
      }
      var current = slot.querySelector(":scope > svg.simple-nav-svg");
      if (!current || current.getAttribute("data-icon") !== iconName) {
        slot.replaceChildren(createSvg(iconName));
      }
      button.classList.add("has-simple-child-icon");
    });
  }

  function syncActiveChildGroups(sidebar) {
    Array.prototype.forEach.call(sidebar.querySelectorAll(".nav-group"), function (group) {
      var activeChild = group.querySelector(
        ":scope > .nav-children > button.active, :scope > .nav-children > button[aria-current='page']"
      );
      group.classList.toggle("has-active-child", Boolean(activeChild));
    });
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function canSwitchPerspective() {
    return window[PERSPECTIVE_CAPABILITY_KEY] === true;
  }

  function activePerspective() {
    if (!canSwitchPerspective()) return "admin";
    return sessionStorage.getItem(PERSPECTIVE_SESSION_KEY) === "member" ? "member" : "admin";
  }

  function requestPerspective(perspective) {
    if (!canSwitchPerspective() || (perspective !== "admin" && perspective !== "member")) return;
    sessionStorage.setItem(PERSPECTIVE_SESSION_KEY, perspective);
    window[ACTIVE_PERSPECTIVE_KEY] = perspective;
    window.parent.postMessage({
      type: "ai-project-hub:perspective-change",
      perspective: perspective
    }, window.location.origin);
  }

  function hideRemovedFeatureEntrypoints(shell) {
    Array.prototype.forEach.call(
      shell.querySelectorAll(".sidebar button, main > header button"),
      function (button) {
        var label = compactText(button.textContent).replace(/\s+\d+$/, "");
        if (!REMOVED_FEATURE_LABELS[label]) return;
        if (!button.classList.contains("legacy-removed-feature")) {
          button.classList.add("legacy-removed-feature");
        }
        if (button.getAttribute("aria-hidden") !== "true") button.setAttribute("aria-hidden", "true");
        if (button.getAttribute("tabindex") !== "-1") button.setAttribute("tabindex", "-1");
      }
    );
  }

  function childButtonLabel(button) {
    var clone = button.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll(".simple-child-nav-icon, b"), function (node) {
      node.remove();
    });
    return compactText(clone.textContent);
  }

  function closeCollapsedFlyout(options) {
    options = options || {};
    var parentButton = activeCollapsedGroup && activeCollapsedGroup.querySelector(":scope > button");
    if (parentButton) {
      parentButton.setAttribute("aria-expanded", "false");
      parentButton.removeAttribute("aria-controls");
    }
    if (activeCollapsedGroup) {
      activeCollapsedGroup.classList.remove("collapsed-flyout-open");
    }
    if (activeCollapsedFlyout) {
      activeCollapsedFlyout.remove();
    }
    activeCollapsedFlyout = null;
    activeCollapsedGroup = null;
    if (options.restoreFocus && parentButton) {
      parentButton.focus();
    }
  }

  function closeCollapsedAccountFlyout(options) {
    options = options || {};
    var avatar = activeAccountAvatar;
    if (avatar) {
      avatar.setAttribute("aria-expanded", "false");
      avatar.removeAttribute("aria-controls");
      var footer = avatar.closest(".sidebar-foot");
      if (footer) footer.classList.remove("account-flyout-open");
    }
    if (activeAccountFlyout) {
      activeAccountFlyout.remove();
    }
    activeAccountFlyout = null;
    activeAccountAvatar = null;
    if (options.restoreFocus && avatar && avatar.isConnected) {
      avatar.focus();
    }
  }

  function positionCollapsedAccountFlyout(flyout, avatar) {
    var rect = avatar.getBoundingClientRect();
    var gap = 14;
    var viewportPadding = 12;
    if (flyout.classList.contains("perspective-account-flyout")) {
      var perspectiveLeft = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - flyout.offsetWidth - viewportPadding)
      );
      var perspectiveTop = Math.max(viewportPadding, rect.top - flyout.offsetHeight - 10);
      flyout.style.left = Math.round(perspectiveLeft) + "px";
      flyout.style.top = Math.round(perspectiveTop) + "px";
      flyout.style.setProperty(
        "--perspective-account-anchor",
        Math.round(rect.left + rect.width / 2 - perspectiveLeft) + "px"
      );
      return;
    }
    var left = Math.min(rect.right + gap, window.innerWidth - flyout.offsetWidth - viewportPadding);
    var top = Math.max(
      viewportPadding,
      Math.min(rect.bottom - flyout.offsetHeight, window.innerHeight - flyout.offsetHeight - viewportPadding)
    );
    flyout.style.left = Math.round(left) + "px";
    flyout.style.top = Math.round(top) + "px";
    flyout.style.setProperty(
      "--collapsed-account-anchor",
      Math.round(rect.top + rect.height / 2 - top) + "px"
    );
  }

  function enhanceAccountAvatar(sidebar, collapsed) {
    var avatar = sidebar.querySelector(".sidebar-foot .avatar");
    if (!avatar) return;
    avatar.classList.toggle("perspective-avatar-trigger", canSwitchPerspective());
    if (collapsed || canSwitchPerspective()) {
      avatar.setAttribute("role", "button");
      avatar.setAttribute("tabindex", "0");
      avatar.setAttribute("title", canSwitchPerspective() ? "\u5207\u6362\u5de5\u4f5c\u89c6\u89d2" : "\u6253\u5f00\u8d26\u6237\u83dc\u5355");
      avatar.setAttribute("aria-label", canSwitchPerspective() ? "\u5207\u6362\u5de5\u4f5c\u89c6\u89d2" : "\u6253\u5f00\u8d26\u6237\u83dc\u5355");
      avatar.setAttribute("aria-haspopup", canSwitchPerspective() ? "menu" : "dialog");
      avatar.setAttribute("aria-expanded", activeAccountAvatar === avatar ? "true" : "false");
      return;
    }
    avatar.removeAttribute("role");
    avatar.removeAttribute("tabindex");
    avatar.removeAttribute("title");
    avatar.removeAttribute("aria-label");
    avatar.removeAttribute("aria-haspopup");
    avatar.removeAttribute("aria-expanded");
    avatar.removeAttribute("aria-controls");
  }

  function bindAccountFlyoutKeyboard(flyout) {
    flyout.addEventListener("keydown", function (event) {
      var items = Array.prototype.slice.call(
        flyout.querySelectorAll("button[role='menuitem'], button[role='menuitemradio']")
      );
      var currentIndex = items.indexOf(document.activeElement);
      var nextIndex = currentIndex;
      if (event.key === "Escape") {
        event.preventDefault();
        closeCollapsedAccountFlyout({ restoreFocus: true });
        return;
      }
      if (event.key === "ArrowDown") nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      if (event.key === "ArrowUp") nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = items.length - 1;
      if (nextIndex !== currentIndex && items[nextIndex]) {
        event.preventDefault();
        items[nextIndex].focus();
      }
    });
  }

  function appendPerspectiveOptions(flyout) {
    var selectedPerspective = activePerspective();
    var list = document.createElement("div");
    list.className = "account-perspective-options";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "\u5de5\u4f5c\u89c6\u89d2");
    [
      { key: "admin", label: "\u5207\u6362\u7ba1\u7406\u5458\u89c6\u89d2" },
      { key: "member", label: "\u5207\u6362\u666e\u901a\u7528\u6237\u89c6\u89d2" }
    ].forEach(function (option) {
      var selected = option.key === selectedPerspective;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "account-perspective-option" + (selected ? " selected" : "");
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", String(selected));
      button.dataset.perspective = option.key;
      var label = document.createElement("span");
      label.textContent = option.label;
      var check = document.createElement("i");
      check.textContent = "\u2713";
      check.setAttribute("aria-hidden", "true");
      button.appendChild(label);
      button.appendChild(check);
      button.addEventListener("click", function () {
        closeCollapsedAccountFlyout();
        requestPerspective(option.key);
      });
      list.appendChild(button);
    });
    flyout.appendChild(list);
  }

  function openCollapsedAccountFlyout(account, avatar) {
    if (activeAccountAvatar === avatar && activeAccountFlyout) {
      closeCollapsedAccountFlyout({ restoreFocus: true });
      return;
    }
    closeCollapsedFlyout();
    closeCollapsedAccountFlyout();

    var nameNode = account.querySelector("strong");
    var metaNode = account.querySelector("small");
    var avatarImage = avatar.querySelector("img");
    var sourceLogout = account.querySelector(".sidebar-logout");
    var perspectiveEnabled = canSwitchPerspective();
    var flyout = document.createElement("section");
    flyout.id = COLLAPSED_ACCOUNT_FLYOUT_ID;
    flyout.className = "collapsed-account-flyout" + (perspectiveEnabled ? " perspective-account-flyout" : "");
    flyout.setAttribute("role", perspectiveEnabled ? "menu" : "dialog");
    flyout.setAttribute("aria-label", perspectiveEnabled ? "\u5de5\u4f5c\u89c6\u89d2\u4e0e\u8d26\u6237" : "\u8d26\u6237\u4e0e\u9000\u51fa\u767b\u5f55");

    var header = document.createElement("header");
    header.className = "collapsed-account-head";
    var avatarClone = avatar.cloneNode(true);
    avatarClone.className = "collapsed-account-avatar";
    avatarClone.removeAttribute("role");
    avatarClone.removeAttribute("tabindex");
    avatarClone.removeAttribute("title");
    avatarClone.removeAttribute("aria-label");
    avatarClone.removeAttribute("aria-haspopup");
    avatarClone.removeAttribute("aria-expanded");
    header.appendChild(avatarClone);

    var identity = document.createElement("div");
    identity.className = "collapsed-account-identity";
    var name = document.createElement("strong");
    name.textContent = compactText(nameNode && nameNode.textContent) ||
      compactText(avatarImage && avatarImage.getAttribute("alt")) ||
      "\u5f53\u524d\u7528\u6237";
    var meta = document.createElement("small");
    meta.textContent = compactText(metaNode && metaNode.textContent) || "\u98de\u4e66\u4f01\u4e1a\u8d26\u6237";
    identity.appendChild(name);
    identity.appendChild(meta);
    header.appendChild(identity);
    flyout.appendChild(header);

    if (perspectiveEnabled) appendPerspectiveOptions(flyout);

    var divider = document.createElement("div");
    divider.className = "collapsed-account-divider";
    flyout.appendChild(divider);

    var logout = document.createElement("button");
    logout.type = "button";
    logout.className = "collapsed-account-logout";
    if (perspectiveEnabled) logout.setAttribute("role", "menuitem");
    logout.appendChild(createSvg("logOut"));
    var logoutLabel = document.createElement("span");
    logoutLabel.textContent = "\u9000\u51fa\u767b\u5f55";
    logout.appendChild(logoutLabel);
    logout.addEventListener("click", function () {
      var logoutBridge = window.__AI_PROJECT_HUB_LOGOUT__;
      if (typeof logoutBridge === "function") {
        logoutBridge(logout);
        return;
      }
      closeCollapsedAccountFlyout();
      if (sourceLogout) sourceLogout.click();
    });
    flyout.appendChild(logout);
    document.body.appendChild(flyout);
    if (perspectiveEnabled) bindAccountFlyoutKeyboard(flyout);

    activeAccountFlyout = flyout;
    activeAccountAvatar = avatar;
    account.classList.add("account-flyout-open");
    avatar.setAttribute("aria-expanded", "true");
    avatar.setAttribute("aria-controls", COLLAPSED_ACCOUNT_FLYOUT_ID);
    positionCollapsedAccountFlyout(flyout, avatar);
    window.requestAnimationFrame(function () {
      if (activeAccountFlyout !== flyout) return;
      flyout.classList.add("open");
      var initialFocus = perspectiveEnabled && flyout.querySelector(".account-perspective-option.selected");
      (initialFocus || logout).focus();
    });
  }

  function replayCollapsedNavigation(button) {
    if (!button) {
      return;
    }
    window.__AI_PROJECT_HUB_COLLAPSED_FLYOUT_NAV__ = true;
    replayingCollapsedClick = true;
    button.click();
    replayingCollapsedClick = false;
    window.setTimeout(function () {
      window.__AI_PROJECT_HUB_COLLAPSED_FLYOUT_NAV__ = false;
    }, 0);
  }

  function positionCollapsedFlyout(flyout, parentButton) {
    var rect = parentButton.getBoundingClientRect();
    var gap = 12;
    var viewportPadding = 12;
    var left = Math.min(rect.right + gap, window.innerWidth - flyout.offsetWidth - viewportPadding);
    var top = Math.max(viewportPadding, Math.min(rect.top - 8, window.innerHeight - flyout.offsetHeight - viewportPadding));
    flyout.style.left = Math.round(left) + "px";
    flyout.style.top = Math.round(top) + "px";
    flyout.style.setProperty("--collapsed-flyout-anchor", Math.round(rect.top + rect.height / 2 - top) + "px");
  }

  function bindCollapsedFlyoutKeyboard(flyout) {
    flyout.addEventListener("keydown", function (event) {
      var items = Array.prototype.slice.call(flyout.querySelectorAll("button[role='menuitem']"));
      var currentIndex = items.indexOf(document.activeElement);
      var nextIndex = currentIndex;
      if (event.key === "Escape") {
        event.preventDefault();
        closeCollapsedFlyout({ restoreFocus: true });
        return;
      }
      if (event.key === "ArrowDown") nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      if (event.key === "ArrowUp") nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = items.length - 1;
      if (nextIndex !== currentIndex && items[nextIndex]) {
        event.preventDefault();
        items[nextIndex].focus();
      }
    });
  }

  function openCollapsedFlyout(group, parentButton) {
    if (activeCollapsedGroup === group && activeCollapsedFlyout) {
      closeCollapsedFlyout({ restoreFocus: true });
      return;
    }
    closeCollapsedAccountFlyout();
    closeCollapsedFlyout();

    var originalButtons = Array.prototype.slice
      .call(group.querySelectorAll(".nav-children button"))
      .filter(function (button) {
        return !button.classList.contains("legacy-hidden-child-nav");
      });
    if (!originalButtons.length) {
      replayCollapsedNavigation(parentButton);
      return;
    }

    var flyout = document.createElement("section");
    flyout.id = COLLAPSED_FLYOUT_ID;
    flyout.className = "collapsed-nav-flyout";
    flyout.setAttribute("role", "menu");
    flyout.setAttribute("aria-label", (parentButton.getAttribute("aria-label") || "子菜单") + "子菜单");

    var heading = document.createElement("header");
    heading.className = "collapsed-nav-flyout-head";
    var parentIcon = parentButton.querySelector(".nav-icon");
    if (parentIcon) {
      var iconClone = parentIcon.cloneNode(true);
      iconClone.classList.add("collapsed-nav-flyout-parent-icon");
      heading.appendChild(iconClone);
    }
    var headingText = document.createElement("strong");
    headingText.textContent = parentButton.getAttribute("aria-label") || compactText(parentButton.textContent);
    heading.appendChild(headingText);
    flyout.appendChild(heading);

    var itemList = document.createElement("div");
    itemList.className = "collapsed-nav-flyout-items";
    originalButtons.forEach(function (originalButton) {
      var item = document.createElement("button");
      var label = childButtonLabel(originalButton);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.setAttribute("aria-label", label);
      item.className = "collapsed-nav-flyout-item" + (originalButton.classList.contains("active") ? " active" : "");

      var childIcon = originalButton.querySelector(".simple-child-nav-icon");
      if (childIcon) item.appendChild(childIcon.cloneNode(true));
      var labelNode = document.createElement("span");
      labelNode.textContent = label;
      item.appendChild(labelNode);
      var badge = originalButton.querySelector(":scope > b");
      if (badge && compactText(badge.textContent)) {
        var badgeClone = document.createElement("b");
        badgeClone.textContent = compactText(badge.textContent);
        item.appendChild(badgeClone);
      }
      item.addEventListener("click", function () {
        closeCollapsedFlyout();
        replayCollapsedNavigation(originalButton);
      });
      itemList.appendChild(item);
    });
    flyout.appendChild(itemList);
    document.body.appendChild(flyout);

    activeCollapsedFlyout = flyout;
    activeCollapsedGroup = group;
    group.classList.add("collapsed-flyout-open");
    parentButton.setAttribute("aria-expanded", "true");
    parentButton.setAttribute("aria-controls", COLLAPSED_FLYOUT_ID);
    positionCollapsedFlyout(flyout, parentButton);
    bindCollapsedFlyoutKeyboard(flyout);
    window.requestAnimationFrame(function () {
      if (activeCollapsedFlyout !== flyout) return;
      flyout.classList.add("open");
      var activeItem = flyout.querySelector("button.active") || flyout.querySelector("button");
      if (activeItem) activeItem.focus();
    });
  }

  function removeRetiredNavigationSectionTitle(sidebar) {
    Array.prototype.forEach.call(sidebar.querySelectorAll(".nav-title-section"), function (section) {
      if (String(section.textContent || "").trim() !== "\u4ea4\u4ed8\u4e0e\u914d\u7f6e") {
        return;
      }
      section.remove();
    });
  }

  function createO2OFooterButton(iconName, className, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "o2o-primary-footer-button " + className;
    button.appendChild(createSvg(iconName));
    var text = document.createElement("span");
    text.className = "o2o-footer-label";
    text.textContent = label;
    button.appendChild(text);
    return button;
  }

  function alignO2OBrandWithMemberPortal(sidebar) {
    var brand = sidebar.querySelector(":scope > .brand");
    if (!brand) return;

    brand.classList.add("o2o-member-brand");
    brand.setAttribute("aria-label", "AI创新部 项目管理平台");

    var mark = brand.querySelector(".brand-mark");
    if (mark) {
      var logo = mark.querySelector("img");
      if (!logo) {
        logo = document.createElement("img");
        mark.replaceChildren(logo);
      }
      // Keep the administrator rail visually identical to the authenticated
      // login card and the member portal brand lockup.
      logo.src = "/image/project-management-icon.png";
      logo.alt = "";
    }

    var copy = brand.querySelector(":scope > span:not(.brand-mark)");
    if (!copy) return;
    var heading = copy.querySelector("strong") || document.createElement("strong");
    var subtitle = copy.querySelector("small") || document.createElement("small");
    heading.textContent = "AI创新部";
    subtitle.textContent = "项目管理平台";
    copy.replaceChildren(heading, subtitle);
  }

  function ensureO2OAppShell(shell, sidebar) {
    shell.classList.add("o2o-app-shell");
    sidebar.classList.add("o2o-primary-sider");
    alignO2OBrandWithMemberPortal(sidebar);
    var navigation = sidebar.querySelector("nav");
    if (navigation) {
      navigation.classList.add("o2o-primary-menu-scroll");
      navigation.setAttribute("aria-label", "一级导航");
    }

    var resizeHandle = sidebar.querySelector(".sidebar-resize-handle");
    if (resizeHandle) {
      resizeHandle.setAttribute("aria-hidden", "true");
      resizeHandle.setAttribute("tabindex", "-1");
    }

    var sourceCollapseButton = sidebar.querySelector(".sidebar-collapse-btn");
    if (sourceCollapseButton) {
      sourceCollapseButton.classList.add("o2o-native-collapse-source");
      sourceCollapseButton.setAttribute("aria-hidden", "true");
      sourceCollapseButton.setAttribute("tabindex", "-1");
    }

    var footer = sidebar.querySelector(":scope > .o2o-primary-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "o2o-primary-footer";
      footer.setAttribute("aria-label", "一级导航控制");

      var toggleButton = createO2OFooterButton("sidebarToggle", "o2o-navigation-collapse-button", "收起一级导航");
      toggleButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var currentSource = sidebar.querySelector(".sidebar-collapse-btn");
        if (currentSource) currentSource.click();
      });
      footer.appendChild(toggleButton);
      sidebar.appendChild(footer);
    }

    var collapsed = shell.classList.contains("sidebar-collapsed");
    var toggle = footer.querySelector(".o2o-navigation-collapse-button");
    if (toggle) {
      var label = collapsed ? "展开一级导航" : "收起一级导航";
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
      var labelNode = toggle.querySelector(".o2o-footer-label");
      if (labelNode) labelNode.textContent = label;
    }
  }

  function syncCollapsedState(shell, sidebar) {
    var collapsed = shell.classList.contains("sidebar-collapsed");
    if (sidebar.getAttribute("aria-hidden") !== "false") {
      sidebar.setAttribute("aria-hidden", "false");
    }

    var collapseButton = sidebar.querySelector(".sidebar-collapse-btn");
    if (collapseButton) {
      var label = collapsed ? "\u5c55\u5f00\u4fa7\u8fb9\u680f" : "\u6536\u8d77\u4fa7\u8fb9\u680f";
      collapseButton.setAttribute("title", label);
      collapseButton.setAttribute("aria-label", label);
    }
  }

  function enhance() {
    scheduled = false;
    var shell = document.querySelector(".app-shell");
    var sidebar = shell && shell.querySelector(".sidebar");
    if (!shell || !sidebar) {
      return;
    }
    hideRemovedFeatureEntrypoints(shell);
    removeRetiredNavigationSectionTitle(sidebar);
    ensureO2OAppShell(shell, sidebar);
    enhanceIcons(sidebar);
    enhanceChildIcons(sidebar);
    syncActiveChildGroups(sidebar);
    syncCollapsedState(shell, sidebar);
    enhanceAccountAvatar(sidebar, shell.classList.contains("sidebar-collapsed"));
    if (!shell.classList.contains("sidebar-collapsed") || (activeCollapsedGroup && !activeCollapsedGroup.isConnected)) {
      closeCollapsedFlyout();
    }
    if ((!shell.classList.contains("sidebar-collapsed") && !canSwitchPerspective()) || (activeAccountAvatar && !activeAccountAvatar.isConnected)) {
      closeCollapsedAccountFlyout();
    }
  }

  function scheduleEnhance() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.setTimeout(enhance, 0);
  }

  document.addEventListener("click", function (event) {
    if (replayingCollapsedClick || !event.target || !event.target.closest) {
      return;
    }
    if (event.target.closest(".collapsed-nav-flyout")) {
      return;
    }
    if (event.target.closest(".collapsed-account-flyout")) {
      return;
    }
    var shell = document.querySelector(".app-shell");
    var collapsedShell = document.querySelector(".app-shell.sidebar-collapsed");
    var railToggle = event.target.closest(".sidebar .sidebar-collapse-btn");
    if (collapsedShell && railToggle) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeCollapsedFlyout();
      closeCollapsedAccountFlyout();
      var expandButton = document.querySelector(".sidebar-floating-toggle");
      if (expandButton) {
        expandButton.click();
      } else {
        replayingCollapsedClick = true;
        railToggle.click();
        replayingCollapsedClick = false;
      }
      return;
    }
    var accountAvatar = event.target.closest(".sidebar .sidebar-foot .avatar");
    if (activeAccountFlyout && (!shell || !accountAvatar)) {
      closeCollapsedAccountFlyout();
    }
    if (shell && accountAvatar && (collapsedShell || canSwitchPerspective())) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openCollapsedAccountFlyout(accountAvatar.closest(".sidebar-foot"), accountAvatar);
      return;
    }
    var groupButton = event.target.closest(".sidebar .nav-group > button");
    var directButton = event.target.closest(
      ".sidebar nav > .nav-section:not(.nav-title-section):not(.nav-group) > button"
    );
    if (activeCollapsedFlyout && (!collapsedShell || (!groupButton && !directButton))) {
      closeCollapsedFlyout();
    }
    if (!collapsedShell || (!groupButton && !directButton)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (groupButton) {
      openCollapsedFlyout(groupButton.closest(".nav-group"), groupButton);
    } else {
      closeCollapsedFlyout();
      replayCollapsedNavigation(directButton);
    }
  }, true);

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var accountAvatar = target && target.closest && target.closest(".sidebar .sidebar-foot .avatar");
    if ((event.key === "Enter" || event.key === " ") && accountAvatar) {
      var shell = document.querySelector(".app-shell");
      var collapsedShell = document.querySelector(".app-shell.sidebar-collapsed");
      if (shell && (collapsedShell || canSwitchPerspective())) {
        event.preventDefault();
        openCollapsedAccountFlyout(accountAvatar.closest(".sidebar-foot"), accountAvatar);
      }
      return;
    }
    if (event.key === "Escape" && activeCollapsedFlyout) {
      event.preventDefault();
      closeCollapsedFlyout({ restoreFocus: true });
    }
    if (event.key === "Escape" && activeAccountFlyout) {
      event.preventDefault();
      closeCollapsedAccountFlyout({ restoreFocus: true });
    }
  }, true);

  window.addEventListener("resize", function () {
    if (activeCollapsedFlyout && activeCollapsedGroup) {
      var parentButton = activeCollapsedGroup.querySelector(":scope > button");
      if (parentButton) positionCollapsedFlyout(activeCollapsedFlyout, parentButton);
    }
    if (activeAccountFlyout && activeAccountAvatar) {
      positionCollapsedAccountFlyout(activeAccountFlyout, activeAccountAvatar);
    }
  });

  document.addEventListener("scroll", function (event) {
    if (activeCollapsedFlyout && !(event.target && activeCollapsedFlyout.contains(event.target))) {
      closeCollapsedFlyout();
    }
  }, true);

  var observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-hidden"]
  });

  window.addEventListener("ai-project-hub:perspective-ready", scheduleEnhance);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleEnhance, { once: true });
  } else {
    scheduleEnhance();
  }
})();
