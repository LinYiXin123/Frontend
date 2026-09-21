(function () {
  var OVERVIEW_HASH = "#runtime-monitor";
  var INCIDENTS_HASH = "#runtime-incidents";
  var QUALITY_HASH = "#delivery-quality";
  var WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  var PAGE_ID = "runtime-monitor-page";
  var NAV_CLASS = "runtime-monitor-nav-section";
  var TOPOLOGY_SCRIPT_URL = "/assets/legacy-runtime-topology.js?v=project-display-name-zh-v1-20260905-feishu-receive-gate-v1";
  var TOPOLOGY_STYLE_URL = "/assets/legacy-runtime-topology.css?v=business-page-autodetect-v1-20260722";
  var activeView = window.location.hash === INCIDENTS_HASH ? "incidents" : window.location.hash === QUALITY_HASH ? "quality" : "overview";
  var active = window.location.hash === OVERVIEW_HASH || window.location.hash === INCIDENTS_HASH || window.location.hash === QUALITY_HASH;
  var scheduled = false;
  var loading = false;
  var runtimeLoadVersion = 0;
  var runtimeLoadGuardTimer = 0;
  var qualityLoadingNoticeTimer = 0;
  var running = false;
  var pollTimer = 0;
  var snapshot = null;
  var qualitySnapshot = null;
  var qualityTableState = { query: "", filter: "all", page: 1, pageSize: 12 };
  var topologyLoadPromise = null;
  var coverageTableState = { query: "", topology: "all", sort: "targets_desc", page: 1, pageSize: 10 };
  var checkTableState = { query: "", status: "all", sort: "severity", page: 1, pageSize: 10 };
  var incidentTableState = { query: "", status: "all", environment: "all", sort: "opened_desc", page: 1, pageSize: 8, rangeDays: 30, dateKey: "", eventType: "all" };
  var selectedIncidentId = 0;
  var incidentTimelineChart = null;
  var incidentTimelineResizeObserver = null;
  var pendingTopologyProjectId = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function runtimeIcon(name, extraClass) {
    return '<i data-lucide="' + escapeHtml(name) + '" class="runtime-loading-icon' + (extraClass ? " " + escapeHtml(extraClass) : "") + '" aria-hidden="true"></i>';
  }

  function hydrateRuntimeIcons(scope) {
    var runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({
      icons: runtime.icons,
      attrs: { width: 16, height: 16, "stroke-width": 1.8 },
      root: scope || document
    });
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function projectDisplayName(project, fallback) {
    return compactText(project && project.display_name_zh) ||
      compactText(project && project.display_name) ||
      compactText(project && project.name) ||
      compactText(fallback) ||
      "未命名项目";
  }

  function projectSearchNames(project) {
    return [
      project && project.display_name_zh,
      project && project.display_name,
      project && project.name
    ].map(compactText).filter(Boolean).join(" ");
  }

  function runtimeProject(projectId) {
    return ((snapshot && snapshot.coverage && snapshot.coverage.projects) || []).find(function (project) {
      return Number(project.id) === Number(projectId);
    }) || null;
  }

  function feishuChatUrl(person) {
    if (!person || person.feishu_receive_eligible !== true) return "";
    var userId = Number(person.id);
    if (!Number.isInteger(userId) || userId < 1) return "";
    return "/api/users/" + userId + "/feishu-chat";
  }

  function formatTime(value) {
    if (!value) return "尚未探测";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function stateLabel(state) {
    return ({
      healthy: "健康",
      degraded: "波动待确认",
      down: "故障",
      recovering: "恢复确认中",
      pending: "等待首检"
    }[state] || "等待首检");
  }

  function stateTone(state) {
    return state === "healthy" ? "ok" : state === "down" ? "danger" : "warn";
  }

  function topologyLabel(status) {
    return ({
      success: "拓扑已同步",
      failed: "拓扑同步失败",
      never: "拓扑待同步"
    }[status] || "拓扑待同步");
  }

  function onboardingTone(status) {
    if (status === "monitored") return "ok";
    if (status === "topology_failed" || status === "retry_scheduled") return "danger";
    return "warn";
  }

  function normalizeSearch(value) {
    return compactText(value).toLocaleLowerCase("zh-CN");
  }

  function compareText(left, right) {
    return String(left || "").localeCompare(String(right || ""), "zh-CN", { sensitivity: "base" });
  }

  function clampPage(value, totalPages) {
    return Math.min(Math.max(Number(value) || 1, 1), Math.max(totalPages, 1));
  }

  function renderPagination(scope, state, totalItems) {
    var totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
    state.page = clampPage(state.page, totalPages);
    var pageButtons = [];
    var ellipsisAdded = false;
    for (var pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      var visible = pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - state.page) <= 1;
      if (!visible) {
        if (!ellipsisAdded) pageButtons.push('<span class="runtime-monitor-page-gap" aria-hidden="true">…</span>');
        ellipsisAdded = true;
        continue;
      }
      ellipsisAdded = false;
      pageButtons.push('<button type="button" data-runtime-' + scope + '-page="' + pageNumber + '" class="' + (pageNumber === state.page ? "active" : "") + '"' + (pageNumber === state.page ? ' aria-current="page"' : "") + '>' + pageNumber + '</button>');
    }
    return '<div class="runtime-monitor-pagination-meta">第 ' + state.page + ' / ' + totalPages + ' 页</div>' +
      '<div class="runtime-monitor-pagination-pages">' +
      '<button type="button" class="runtime-monitor-page-command" data-runtime-' + scope + '-page="' + (state.page - 1) + '"' + (state.page <= 1 ? " disabled" : "") + '>上一页</button>' +
      pageButtons.join("") +
      '<button type="button" class="runtime-monitor-page-command" data-runtime-' + scope + '-page="' + (state.page + 1) + '"' + (state.page >= totalPages ? " disabled" : "") + '>下一页</button>' +
      '</div>';
  }

  function tableSelectHtml(scope, key, label, options, selectedValue) {
    var selected = options.find(function (option) { return option.value === selectedValue; }) || options[0];
    var menuId = "runtime-" + scope + "-" + key + "-menu";
    return '<div class="runtime-monitor-table-field"><span>' + escapeHtml(label) + '</span>' +
      '<div class="runtime-monitor-select" data-runtime-select-scope="' + scope + '" data-runtime-select-key="' + key + '" data-runtime-select-value="' + escapeHtml(selected.value) + '">' +
      '<button type="button" class="runtime-monitor-select-toggle" data-runtime-select-toggle aria-haspopup="listbox" aria-expanded="false" aria-controls="' + menuId + '"><span data-runtime-select-label>' + escapeHtml(selected.label) + '</span><i aria-hidden="true"></i></button>' +
      '<div class="runtime-monitor-select-menu" id="' + menuId + '" role="listbox" aria-label="' + escapeHtml(label) + '">' +
      options.map(function (option) {
        var isSelected = option.value === selected.value;
        return '<button type="button" role="option" data-runtime-select-option="' + escapeHtml(option.value) + '" aria-selected="' + String(isSelected) + '" class="' + (isSelected ? "selected" : "") + '"><span>' + escapeHtml(option.label) + '</span><i aria-hidden="true"></i></button>';
      }).join("") +
      '</div></div></div>';
  }

  function setTableSelectValue(select, value) {
    if (!select) return;
    var option = Array.prototype.find.call(select.querySelectorAll("[data-runtime-select-option]"), function (item) {
      return item.dataset.runtimeSelectOption === String(value);
    });
    if (!option) return;
    select.dataset.runtimeSelectValue = String(value);
    var label = select.querySelector("[data-runtime-select-label]");
    if (label) label.textContent = compactText(option.textContent);
    select.querySelectorAll("[data-runtime-select-option]").forEach(function (item) {
      var selected = item === option;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
  }

  function closeTableSelect(select) {
    if (!select) return;
    select.classList.remove("open");
    select.querySelector("[data-runtime-select-toggle]")?.setAttribute("aria-expanded", "false");
  }

  function closeOtherTableSelects(except) {
    document.querySelectorAll(".runtime-monitor-select.open").forEach(function (select) {
      if (select !== except) closeTableSelect(select);
    });
  }

  function handleTableSelectKeydown(event) {
    var toggle = event.target.closest("[data-runtime-select-toggle]");
    var option = event.target.closest("[data-runtime-select-option]");
    var select = event.target.closest(".runtime-monitor-select");
    if (!select) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeTableSelect(select);
      select.querySelector("[data-runtime-select-toggle]")?.focus();
      return;
    }
    if (toggle && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      closeOtherTableSelects(select);
      select.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      var selected = select.querySelector('[data-runtime-select-option][aria-selected="true"]');
      selected?.focus();
      return;
    }
    if (!option || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    var options = Array.from(select.querySelectorAll("[data-runtime-select-option]"));
    var index = options.indexOf(option);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = options.length - 1;
    else if (event.key === "ArrowDown") index = (index + 1) % options.length;
    else index = (index - 1 + options.length) % options.length;
    options[index]?.focus();
  }

  function animateTableSwap(container, html) {
    if (!container) return;
    var token = String(Number(container.dataset.runtimeSwapToken || 0) + 1);
    container.dataset.runtimeSwapToken = token;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var commit = function () {
      if (container.dataset.runtimeSwapToken !== token) return;
      container.getAnimations?.().forEach(function (animation) { animation.cancel(); });
      container.innerHTML = html;
      if (reduceMotion) return;
      var rows = container.querySelectorAll(".runtime-monitor-coverage-row, .runtime-monitor-check-row, .runtime-incident-row, .runtime-monitor-table-empty");
      rows.forEach(function (row, index) {
        row.animate([
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" }
        ], {
          duration: 280,
          delay: Math.min(index * 24, 168),
          easing: "cubic-bezier(.22, 1, .36, 1)",
          fill: "both"
        });
      });
    };

    if (reduceMotion || !container.childElementCount || typeof container.animate !== "function") {
      commit();
      return;
    }
    container.getAnimations().forEach(function (animation) { animation.cancel(); });
    var exit = container.animate([
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-5px)" }
    ], {
      duration: 110,
      easing: "cubic-bezier(.4, 0, 1, 1)",
      fill: "forwards"
    });
    exit.finished.then(commit).catch(function () {});
  }

  function animateTextUpdate(element, value) {
    if (!element || element.textContent === value) return;
    element.textContent = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") return;
    element.animate([
      { opacity: .35, transform: "translateY(3px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 220, easing: "cubic-bezier(.22, 1, .36, 1)" });
  }

  async function requestJson(url, options) {
    var requestOptions = Object.assign({
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" }
    }, options || {});
    var timeoutMs = Number(requestOptions.timeoutMs) || 15000;
    delete requestOptions.timeoutMs;
    var controller = typeof AbortController === "function" && !requestOptions.signal
      ? new AbortController()
      : null;
    var timeoutId = 0;
    if (controller) {
      requestOptions.signal = controller.signal;
      timeoutId = window.setTimeout(function () { controller.abort(); }, timeoutMs);
    }
    try {
      var response = await fetch(url, requestOptions);
      var body = await response.json().catch(function () { return null; });
      if (!response.ok) {
        throw new Error((body && (body.detail || body.message)) || ("请求失败：HTTP " + response.status));
      }
      return body;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("请求超时，请检查后端服务或稍后重试");
      }
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  function ensureTopologyBundle() {
    if (window.LegacyRuntimeTopology) return Promise.resolve(window.LegacyRuntimeTopology);
    if (topologyLoadPromise) return topologyLoadPromise;
    if (!document.querySelector('link[data-runtime-topology-style]')) {
      var style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = TOPOLOGY_STYLE_URL;
      style.dataset.runtimeTopologyStyle = "true";
      document.head.appendChild(style);
    }
    topologyLoadPromise = new Promise(function (resolve, reject) {
      var script = document.querySelector('script[data-runtime-topology-script]');
      if (!script) {
        script = document.createElement("script");
        script.src = TOPOLOGY_SCRIPT_URL;
        script.defer = true;
        script.dataset.runtimeTopologyScript = "true";
        document.head.appendChild(script);
      }
      var complete = function () {
        if (window.LegacyRuntimeTopology) resolve(window.LegacyRuntimeTopology);
        else reject(new Error("运行拓扑组件加载失败"));
      };
      script.addEventListener("load", complete, { once: true });
      script.addEventListener("error", function () { reject(new Error("运行拓扑组件加载失败")); }, { once: true });
      if (window.LegacyRuntimeTopology) complete();
    }).catch(function (error) {
      topologyLoadPromise = null;
      throw error;
    });
    return topologyLoadPromise;
  }

  function unmountTopology(page) {
    var root = page && page.querySelector("[data-runtime-topology-root]");
    if (root && window.LegacyRuntimeTopology) window.LegacyRuntimeTopology.unmount(root);
    if (page) page.dataset.runtimeTopologyToken = String(Number(page.dataset.runtimeTopologyToken || 0) + 1);
  }

  function disposeIncidentTimeline() {
    if (incidentTimelineResizeObserver) {
      incidentTimelineResizeObserver.disconnect();
      incidentTimelineResizeObserver = null;
    }
    if (!incidentTimelineChart) return;
    incidentTimelineChart.dispose();
    incidentTimelineChart = null;
  }

  function navLabel(button) {
    if (!button) return "";
    return compactText(button.getAttribute("aria-label") || button.textContent);
  }

  function clearRuntimeLoadGuard() {
    if (!runtimeLoadGuardTimer) return;
    window.clearTimeout(runtimeLoadGuardTimer);
    runtimeLoadGuardTimer = 0;
  }

  function clearQualityLoadingNotice() {
    if (!qualityLoadingNoticeTimer) return;
    window.clearTimeout(qualityLoadingNoticeTimer);
    qualityLoadingNoticeTimer = 0;
  }

  function scheduleQualityLoadingNotice(loadVersion) {
    clearQualityLoadingNotice();
    qualityLoadingNoticeTimer = window.setTimeout(function () {
      qualityLoadingNoticeTimer = 0;
      if (!active || !loading || activeView !== "quality" || loadVersion !== runtimeLoadVersion) return;
      var page = ensurePage();
      var status = page && page.querySelector("[data-quality-loading-status]");
      var retry = page && page.querySelector("[data-quality-loading-retry]");
      if (status) status.textContent = "读取时间比平时稍长。您可以继续等待，或重新尝试。";
      if (retry) retry.hidden = false;
    }, 5000);
  }

  function cancelActiveLoad() {
    runtimeLoadVersion += 1;
    loading = false;
    clearRuntimeLoadGuard();
    clearQualityLoadingNotice();
  }

  function guardRuntimeLoad(loadVersion, view) {
    clearRuntimeLoadGuard();
    runtimeLoadGuardTimer = window.setTimeout(function () {
      if (!active || !loading || loadVersion !== runtimeLoadVersion) return;
      var hasData = view === "quality" ? Boolean(qualitySnapshot) : Boolean(snapshot);
      if (hasData) return;
      loading = false;
      runtimeLoadGuardTimer = 0;
      clearQualityLoadingNotice();
      var page = ensurePage();
      if (!page) return;
      var message = view === "quality"
        ? "超过 12 秒仍未拿到项目交付状态，请重新尝试。"
        : "读取时间较长，请重新加载后再试";
      if (view === "quality") renderQualityError(page, message);
      else renderError(page, message);
    }, view === "quality" ? 13000 : 18000);
  }

  function buildChildButton(label, view) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("data-runtime-view", view);
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      activate(view);
    });
    return button;
  }

  function ensureNav() {
    var nav = document.querySelector(".sidebar nav");
    if (!nav) return null;
    var section = nav.querySelector("." + NAV_CLASS);
    if (!section) {
      section = document.createElement("div");
      section.className = "nav-section nav-group open " + NAV_CLASS;

      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "运维监控");
      button.setAttribute("aria-expanded", "true");
      button.title = "运维监控";

      var icon = document.createElement("span");
      icon.className = "nav-icon";
      icon.title = "运维监控";
      var label = document.createElement("span");
      label.className = "nav-label";
      label.textContent = "运维监控";
      var caret = document.createElement("i");
      caret.className = "nav-caret";
      caret.textContent = "⌄";
      button.append(icon, label, caret);
      button.addEventListener("click", function (event) {
        event.preventDefault();
        var collapsed = section.classList.toggle("collapsed");
        section.classList.toggle("open", !collapsed);
        button.setAttribute("aria-expanded", String(!collapsed));
      });

      var children = document.createElement("div");
      children.className = "nav-children";
      children.append(
        buildChildButton("运行总览", "overview"),
        buildChildButton("故障事件", "incidents"),
        buildChildButton("交付质检", "quality")
      );
      section.append(button, children);

      var rulesGroup = Array.prototype.find.call(nav.children, function (child) {
        return navLabel(child.querySelector(":scope > button")).indexOf("数据与规则") === 0;
      });
      nav.insertBefore(section, rulesGroup || null);
    }

    var parentButton = section.querySelector(":scope > button");
    parentButton.classList.remove("active");
    section.classList.toggle("active-group", active);
    section.querySelectorAll("[data-runtime-view]").forEach(function (button) {
      var selected = active && button.dataset.runtimeView === activeView;
      if (selected) {
        document.querySelectorAll(".sidebar button.active").forEach(function (candidate) {
          if (candidate !== button && candidate !== parentButton) {
            candidate.classList.remove("active");
            candidate.removeAttribute("aria-current");
          }
        });
      }
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    updateNavBadge();
    return section;
  }

  function updateNavBadge() {
    var button = document.querySelector("." + NAV_CLASS + " > button");
    if (!button) return;
    var openCount = snapshot && snapshot.summary ? Number(snapshot.summary.incidents.open || 0) : 0;
    var badge = button.querySelector(":scope > b");
    if (!openCount) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("b");
      button.appendChild(badge);
    }
    badge.textContent = String(openCount);
  }

  function ensurePage() {
    var main = document.querySelector(".app-shell main") || document.querySelector("main");
    if (!main) return null;
    var page = document.getElementById(PAGE_ID);
    if (page && page.parentElement !== main) page.remove();
    if (!page) {
      page = document.createElement("section");
      page.id = PAGE_ID;
      page.className = "runtime-monitor-page";
      page.setAttribute("aria-label", "运维监控");
      main.appendChild(page);
    }
    return page;
  }

  function renderError(page, message) {
    removeIncidentInspectorShell();
    page.classList.remove("is-loading");
    page.innerHTML = '<div class="runtime-monitor-error"><strong>运维监控暂不可用</strong><p>' + escapeHtml(message) + '</p><button type="button" data-runtime-refresh>重新加载</button></div>';
    page.querySelector("[data-runtime-refresh]").addEventListener("click", loadData);
  }

  function openProjectDetail(projectId, row) {
    var numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) return;
    if (typeof window.__legacyOpenProject !== "function") {
      console.error("[runtime-monitor] project detail bridge is unavailable");
      return;
    }
    row?.classList.add("is-opening");
    deactivate();
    window.__legacyOpenProject(numericProjectId);
    window.__legacyProjectDetailReturn = { page: "projects", scope: "all" };
  }

  function openIncidentTopology(projectId) {
    var numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) return;
    selectedIncidentId = 0;
    pendingTopologyProjectId = numericProjectId;
    activate("overview");
  }

  function handleProjectRowKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var row = event.target.closest("[data-runtime-project-id]");
    if (!row) return;
    event.preventDefault();
    openProjectDetail(row.dataset.runtimeProjectId, row);
  }

  function renderCheck(check) {
    var state = check.monitor_state || "pending";
    var rawStatus = check.last_probe_status === "healthy" ? "HTTP 正常" : check.last_probe_status === "never" ? "未探测" : "探测异常";
    var latency = Number.isFinite(check.last_probe_latency_ms) ? check.last_probe_latency_ms + " ms" : "无耗时";
    var projectName = projectDisplayName(runtimeProject(check.project_id), check.project_name || ("项目 #" + check.project_id));
    return '<div class="runtime-monitor-check-row" role="link" tabindex="0" data-runtime-project-id="' + Number(check.project_id || 0) + '" aria-label="查看项目详情：' + escapeHtml(projectName) + '">' +
      '<div><strong>' + escapeHtml(projectName) + '</strong><small>' + escapeHtml(check.environment || "unknown") + '</small></div>' +
      '<div><strong>' + escapeHtml(check.module_name || "未命名服务") + '</strong><small title="' + escapeHtml(check.health_url) + '">' + escapeHtml(check.health_url) + '</small></div>' +
      '<span class="runtime-state ' + stateTone(state) + '"><i aria-hidden="true"></i>' + escapeHtml(stateLabel(state)) + '</span>' +
      '<div><strong>' + escapeHtml(rawStatus) + ' · ' + escapeHtml(latency) + '</strong><small>' + escapeHtml(formatTime(check.last_probe_at)) + '</small></div>' +
      '<div><strong>失败 ' + Number(check.consecutive_failures || 0) + ' / 成功 ' + Number(check.consecutive_successes || 0) + '</strong><small>' + escapeHtml(check.last_probe_message || "尚无探测结果") + '</small></div>' +
      '</div>';
  }

  function incidentDate(value) {
    var date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function incidentDateKey(value) {
    var date = incidentDate(value);
    if (!date) return "";
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function incidentDateLabel(value) {
    var date = incidentDate(value);
    if (!date) return "时间未记录";
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function incidentDurationMs(incident) {
    var openedAt = incidentDate(incident.opened_at || incident.first_failure_at);
    if (!openedAt) return 0;
    var endedAt = incidentDate(incident.resolved_at) || new Date();
    return Math.max(0, endedAt.getTime() - openedAt.getTime());
  }

  function durationMsLabel(duration) {
    if (duration < 1000) return "不足 1 秒";
    var totalSeconds = Math.floor(duration / 1000);
    var seconds = totalSeconds % 60;
    if (totalSeconds < 60) return totalSeconds + " 秒";
    var minutes = Math.floor(totalSeconds / 60);
    var secondLabel = seconds ? " " + seconds + " 秒" : "";
    if (minutes < 60) return minutes + " 分" + secondLabel;
    var hours = Math.floor(minutes / 60);
    var remainingMinutes = minutes % 60;
    var minuteLabel = remainingMinutes ? " " + remainingMinutes + " 分" : "";
    if (hours < 24) return hours + " 小时" + minuteLabel + secondLabel;
    var days = Math.floor(hours / 24);
    var remainingHours = hours % 24;
    var hourLabel = remainingHours ? " " + remainingHours + " 小时" : "";
    return days + " 天" + hourLabel + minuteLabel + secondLabel;
  }

  function incidentDurationLabel(incident) {
    return durationMsLabel(incidentDurationMs(incident));
  }

  function incidentDurationExplanation(incident) {
    var startSource = incident.opened_at ? "事件开启时间 " + incidentDateLabel(incident.opened_at) : "首次失败时间 " + incidentDateLabel(incident.first_failure_at);
    var endSource = incident.resolved_at ? "恢复完成时间 " + incidentDateLabel(incident.resolved_at) : "当前时间";
    var firstFailureNote = incident.opened_at && incident.first_failure_at ? "；首次失败时间不参与计算" : "";
    return "计算方式：" + endSource + " - " + startSource + " = " + incidentDurationLabel(incident) + firstFailureNote + "。";
  }

  function incidentProject(incident) {
    return runtimeProject(incident.project_id);
  }

  function incidentCheck(incident) {
    return ((snapshot && snapshot.checks) || []).find(function (check) {
      return Number(check.id) === Number(incident.check_id || incident.runtime_check_id);
    }) || null;
  }

  function incidentStatusLabel(status) {
    return status === "open" ? "处理中" : "已恢复";
  }

  function notificationChainLabel(incident) {
    var failure = Number(incident.failure_notification_id || 0);
    var recovery = Number(incident.recovery_notification_id || 0);
    if (failure && recovery) return "故障与恢复均已通知";
    if (failure) return "故障已通知";
    if (recovery) return "恢复已通知";
    return "暂无通知";
  }

  function incidentAverageRecovery(incidents) {
    var resolved = incidents.filter(function (incident) { return incident.status === "resolved" && incident.resolved_at; });
    if (!resolved.length) return { label: "—", explanation: "暂无已恢复事件，无法计算平均恢复时间。" };
    var average = resolved.reduce(function (total, incident) { return total + incidentDurationMs(incident); }, 0) / resolved.length;
    var label = durationMsLabel(average);
    return {
      label: label,
      explanation: "计算方式：" + resolved.length + " 条已恢复事件的（恢复完成时间 - 事件开启时间）之和 ÷ " + resolved.length + " = " + label + "；首次失败时间不参与计算。"
    };
  }

  function incidentRangeStart() {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - Math.max(1, incidentTableState.rangeDays - 1));
    return start;
  }

  function incidentWithinRange(incident) {
    var eventDate = incidentDate(incident.opened_at || incident.first_failure_at);
    return !eventDate || eventDate.getTime() >= incidentRangeStart().getTime();
  }

  function incidentEnvironmentOptions() {
    var seen = {};
    var options = [{ value: "all", label: "全部环境" }];
    ((snapshot && snapshot.incidents) || []).forEach(function (incident) {
      var value = compactText(incident.environment || "unknown");
      if (!value || seen[value]) return;
      seen[value] = true;
      options.push({ value: value, label: value.toUpperCase() });
    });
    return options;
  }

  function filteredRuntimeIncidents() {
    var query = normalizeSearch(incidentTableState.query);
    var selectedDate = incidentTableState.dateKey;
    var eventType = incidentTableState.eventType;
    var items = ((snapshot && snapshot.incidents) || []).filter(function (incident) {
      if (!incidentWithinRange(incident)) return false;
      if (incidentTableState.status !== "all" && incident.status !== incidentTableState.status) return false;
      if (incidentTableState.environment !== "all" && compactText(incident.environment || "unknown") !== incidentTableState.environment) return false;
      if (eventType === "opened" && !incident.opened_at) return false;
      if (eventType === "resolved" && !incident.resolved_at) return false;
      if (selectedDate) {
        var matchesDate = eventType === "resolved"
          ? incidentDateKey(incident.resolved_at) === selectedDate
          : eventType === "opened"
            ? incidentDateKey(incident.opened_at) === selectedDate
            : incidentDateKey(incident.opened_at) === selectedDate || incidentDateKey(incident.resolved_at) === selectedDate;
        if (!matchesDate) return false;
      }
      if (!query) return true;
      var project = incidentProject(incident);
      return normalizeSearch([
        projectSearchNames(project),
        incident.project_name,
        incident.module_name,
        incident.environment,
        incident.health_url,
        incident.last_message,
        project && project.owner_name,
        incidentStatusLabel(incident.status)
      ].join(" ")).indexOf(query) >= 0;
    });
    items.sort(function (left, right) {
      if (incidentTableState.sort === "duration_desc") return incidentDurationMs(right) - incidentDurationMs(left);
      if (incidentTableState.sort === "project_asc") return compareText(projectDisplayName(incidentProject(left), left.project_name), projectDisplayName(incidentProject(right), right.project_name)) || compareText(left.module_name, right.module_name);
      if (incidentTableState.sort === "failures_desc") return Number(right.failure_count || 0) - Number(left.failure_count || 0);
      if (incidentTableState.sort === "status_priority") {
        return Number(left.status !== "open") - Number(right.status !== "open") || (Date.parse(right.opened_at || "") || 0) - (Date.parse(left.opened_at || "") || 0);
      }
      return (Date.parse(right.opened_at || "") || 0) - (Date.parse(left.opened_at || "") || 0);
    });
    return items;
  }

  function incidentToolbarHtml() {
    return '<div class="runtime-incident-toolbar" data-runtime-incident-toolbar>' +
      '<label class="runtime-monitor-table-search"><span>模糊搜索</span><input type="search" autocomplete="off" placeholder="项目、服务、负责人或健康地址" data-runtime-incident-search></label>' +
      tableSelectHtml("incident", "status", "事件状态", [
        { value: "all", label: "全部状态" },
        { value: "open", label: "处理中" },
        { value: "resolved", label: "已恢复" }
      ], incidentTableState.status) +
      tableSelectHtml("incident", "environment", "运行环境", incidentEnvironmentOptions(), incidentTableState.environment) +
      tableSelectHtml("incident", "sort", "排序", [
        { value: "opened_desc", label: "最近发生" },
        { value: "status_priority", label: "处理中优先" },
        { value: "duration_desc", label: "持续时间最长" },
        { value: "failures_desc", label: "连续失败最多" },
        { value: "project_asc", label: "项目名称" }
      ], incidentTableState.sort) +
      '<button type="button" class="runtime-monitor-table-reset" data-runtime-incident-reset>重置</button>' +
      '</div>';
  }

  function renderIncidentRow(incident, index) {
    var project = incidentProject(incident);
    var check = incidentCheck(incident) || incident;
    var isOpen = incident.status === "open";
    var owner = project && project.owner_name ? project.owner_name : "负责人未设置";
    var projectName = projectDisplayName(project, incident.project_name || "未知项目");
    var probeState = check.monitor_state || check.last_probe_status || "pending";
    var probeLabel = check.last_probe_status === "healthy" ? "HTTP 正常" : check.last_probe_status === "never" ? "等待探测" : "探测异常";
    var latency = Number.isFinite(check.last_probe_latency_ms) ? check.last_probe_latency_ms + " ms" : "待采集";
    return '<div class="runtime-incident-row ' + (isOpen ? "is-open" : "is-resolved") + (Number(selectedIncidentId) === Number(incident.id) ? " is-selected" : "") + '" role="button" tabindex="0" data-runtime-incident-id="' + Number(incident.id || 0) + '" aria-label="查看故障详情：' + escapeHtml(projectName) + '">' +
      '<div class="runtime-incident-priority"><b>' + (index + 1) + '</b><span>' + (isOpen ? "高" : "已闭环") + '</span></div>' +
      '<div class="runtime-incident-project"><strong>' + escapeHtml(projectName) + '</strong><small>' + escapeHtml(owner) + ' · ' + escapeHtml((incident.environment || "unknown").toUpperCase()) + '</small></div>' +
      '<div class="runtime-incident-service"><strong>' + escapeHtml(incident.module_name || "未命名服务") + '</strong><small title="' + escapeHtml(incident.health_url || "") + '">' + escapeHtml(incident.health_url || "健康地址未记录") + '</small></div>' +
      '<div><span class="runtime-state ' + (isOpen ? "danger" : "ok") + '"><i aria-hidden="true"></i>' + incidentStatusLabel(incident.status) + '</span><small class="runtime-incident-subline">失败 ' + Number(incident.failure_count || 0) + ' / 恢复 ' + Number(incident.recovery_count || 0) + '</small></div>' +
      '<div><strong>' + escapeHtml(incidentDateLabel(incident.opened_at)) + '</strong><small>恢复：' + escapeHtml(incident.resolved_at ? incidentDateLabel(incident.resolved_at) : "尚未恢复") + '</small></div>' +
      '<div title="' + escapeHtml(incidentDurationExplanation(incident)) + '"><strong>' + escapeHtml(incidentDurationLabel(incident)) + '</strong><small>事件开启至恢复完成</small></div>' +
      '<div><span class="runtime-state ' + stateTone(probeState) + '"><i aria-hidden="true"></i>' + escapeHtml(probeLabel) + '</span><small class="runtime-incident-subline">' + escapeHtml(latency) + '</small></div>' +
      '<div><strong>' + escapeHtml(notificationChainLabel(incident)) + '</strong><small>' + (incident.failure_notification_id ? "故障 #" + Number(incident.failure_notification_id) : "故障通知无记录") + (incident.recovery_notification_id ? " · 恢复 #" + Number(incident.recovery_notification_id) : "") + '</small></div>' +
      '<button type="button" class="runtime-incident-view" data-runtime-incident-open="' + Number(incident.id || 0) + '">查看</button>' +
      '</div>';
  }

  function renderIncidentTable(page) {
    var section = page.querySelector("[data-runtime-incident-section]");
    if (!section) return;
    var items = filteredRuntimeIncidents();
    var totalPages = Math.max(1, Math.ceil(items.length / incidentTableState.pageSize));
    incidentTableState.page = clampPage(incidentTableState.page, totalPages);
    var start = (incidentTableState.page - 1) * incidentTableState.pageSize;
    var visible = items.slice(start, start + incidentTableState.pageSize);
    var list = section.querySelector("[data-runtime-incident-list]");
    var summary = section.querySelector("[data-runtime-incident-result]");
    var pagination = section.querySelector("[data-runtime-incident-pagination]");
    if (list) {
      animateTableSwap(list, visible.length
        ? visible.map(function (incident, index) { return renderIncidentRow(incident, start + index); }).join("")
        : '<div class="runtime-monitor-table-empty"><strong>没有符合当前条件的故障事件</strong><span>可重置筛选或切换时间范围。</span></div>');
    }
    if (summary) animateTextUpdate(summary, items.length ? "显示 " + (start + 1) + "–" + (start + visible.length) + "，共 " + items.length + " 条事件" : "0 条匹配事件");
    if (pagination) pagination.innerHTML = items.length ? renderPagination("incident", incidentTableState, items.length) : "";
    var reset = section.querySelector("[data-runtime-incident-reset]");
    if (reset) reset.disabled = !incidentTableState.query && incidentTableState.status === "all" && incidentTableState.environment === "all" && incidentTableState.sort === "opened_desc" && !incidentTableState.dateKey && incidentTableState.eventType === "all";
    var filterNote = section.querySelector("[data-runtime-incident-chart-filter]");
    if (filterNote) {
      var parts = [];
      if (incidentTableState.dateKey) parts.push(incidentTableState.dateKey);
      if (incidentTableState.eventType === "opened") parts.push("故障发生");
      if (incidentTableState.eventType === "resolved") parts.push("恢复完成");
      filterNote.innerHTML = parts.length ? '<span>图表联动：</span><b>' + escapeHtml(parts.join(" · ")) + '</b><button type="button" data-runtime-incident-chart-reset>清除</button>' : "";
    }
  }

  function removeIncidentInspectorShell() {
    document.querySelector("[data-runtime-incident-inspector-shell]")?.remove();
  }

  function ensureIncidentInspectorShell() {
    var shell = document.querySelector("[data-runtime-incident-inspector-shell]");
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "runtime-incident-inspector-shell";
      shell.setAttribute("data-runtime-incident-inspector-shell", "");
      shell.hidden = true;
    }
    if (shell.parentElement !== document.body) document.body.appendChild(shell);
    return shell;
  }

  function renderIncidentInspector(page, incidentId) {
    var incident = ((snapshot && snapshot.incidents) || []).find(function (item) { return Number(item.id) === Number(incidentId); });
    if (!incident) return;
    selectedIncidentId = Number(incident.id);
    var project = incidentProject(incident) || {};
    var check = incidentCheck(incident) || incident;
    var isOpen = incident.status === "open";
    var durationExplanation = incidentDurationExplanation(incident);
    var owner = project.owner_name || "负责人未设置";
    var projectName = projectDisplayName(project, incident.project_name || "未知项目");
    var avatar = project.owner_feishu_avatar_url ? '<img src="' + escapeHtml(project.owner_feishu_avatar_url) + '" alt="" referrerpolicy="no-referrer">' : '<span>' + escapeHtml(owner.slice(0, 1)) + '</span>';
    var ownerChatUrl = feishuChatUrl({
      id: project.owner_user_id,
      feishu_receive_eligible: project.owner_feishu_receive_eligible
    });
    var ownerInner = '<span class="runtime-incident-avatar">' + avatar + '</span><div><strong>' + escapeHtml(owner) + '</strong><small>' + escapeHtml(projectName) + ' · 项目负责人</small></div>';
    var ownerCard = ownerChatUrl
      ? '<a class="runtime-incident-owner is-chat" href="' + escapeHtml(ownerChatUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="在飞书中与' + escapeHtml(owner) + '私聊" title="在飞书中与' + escapeHtml(owner) + '私聊">' + ownerInner + '<span class="runtime-incident-chat">飞书私聊 ↗</span></a>'
      : '<div class="runtime-incident-owner">' + ownerInner + '<span class="runtime-incident-chat is-unavailable">当前不可通过平台私聊</span></div>';
    var shell = ensureIncidentInspectorShell();
    shell.hidden = false;
    shell.innerHTML = '<button type="button" class="runtime-incident-inspector-backdrop" data-runtime-incident-close aria-label="关闭故障详情"></button>' +
      '<aside class="runtime-incident-inspector" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="runtime-incident-inspector-title">' +
      '<header><div><small>故障事件 #' + Number(incident.id || 0) + '</small><h2 id="runtime-incident-inspector-title">' + escapeHtml(projectName) + '</h2><p>' + escapeHtml(incident.module_name || "未命名服务") + ' · ' + escapeHtml((incident.environment || "unknown").toUpperCase()) + '</p></div><button type="button" data-runtime-incident-close aria-label="关闭故障详情">×</button></header>' +
      '<div class="runtime-incident-inspector-scroll">' +
      '<section class="runtime-incident-inspector-status ' + (isOpen ? "danger" : "ok") + '" tabindex="0" title="' + escapeHtml(durationExplanation) + '" aria-label="' + escapeHtml((isOpen ? "当前事件已持续 " : "本次事件恢复耗时 ") + incidentDurationLabel(incident) + "。" + durationExplanation) + '"><span>' + (isOpen ? "当前仍在处理中" : "本次事件已经恢复") + '</span><strong>' + escapeHtml(incidentDurationLabel(incident)) + '</strong><p>' + escapeHtml(incident.last_message || "未记录额外探测说明") + '</p></section>' +
      '<section class="runtime-incident-detail-card"><div class="runtime-incident-detail-heading"><b>1</b><div><strong>项目与责任人</strong><small>按项目 ID 关联负责人和运行覆盖</small></div></div>' + ownerCard + '</section>' +
      '<section class="runtime-incident-detail-card"><div class="runtime-incident-detail-heading"><b>2</b><div><strong>服务检查点</strong><small>按检查点 ID 关联环境与健康地址</small></div></div><dl><dt>运行环境</dt><dd>' + escapeHtml((incident.environment || "unknown").toUpperCase()) + '</dd><dt>服务模块</dt><dd>' + escapeHtml(incident.module_name || "未命名服务") + '</dd><dt>健康地址</dt><dd title="' + escapeHtml(incident.health_url || "") + '">' + escapeHtml(incident.health_url || "未记录") + '</dd><dt>最近探测</dt><dd>' + escapeHtml(check.last_probe_at ? incidentDateLabel(check.last_probe_at) : "尚未探测") + '</dd></dl></section>' +
      '<section class="runtime-incident-detail-card"><div class="runtime-incident-detail-heading"><b>3</b><div><strong>事件生命周期</strong><small>真实发生、失败计数与恢复时间</small></div></div><div class="runtime-incident-life"><div><i class="danger"></i><span><strong>故障发生</strong><small>' + escapeHtml(incidentDateLabel(incident.opened_at)) + '</small></span></div><div><i></i><span><strong>连续失败 ' + Number(incident.failure_count || 0) + ' 次</strong><small>' + escapeHtml(incident.first_failure_at ? "首次失败 " + incidentDateLabel(incident.first_failure_at) : "首次失败时间未记录") + '</small></span></div><div><i class="' + (isOpen ? "pending" : "ok") + '"></i><span><strong>' + (isOpen ? "等待恢复" : "恢复完成") + '</strong><small>' + escapeHtml(incident.resolved_at ? incidentDateLabel(incident.resolved_at) + " · 成功 " + Number(incident.recovery_count || 0) + " 次" : "尚未达到恢复阈值") + '</small></span></div></div></section>' +
      '<section class="runtime-incident-detail-card"><div class="runtime-incident-detail-heading"><b>4</b><div><strong>通知留痕</strong><small>关联故障和恢复通知记录</small></div></div><dl><dt>故障通知</dt><dd>' + (incident.failure_notification_id ? "记录 #" + Number(incident.failure_notification_id) : "暂无记录") + '</dd><dt>恢复通知</dt><dd>' + (incident.recovery_notification_id ? "记录 #" + Number(incident.recovery_notification_id) : "暂无记录") + '</dd><dt>当前策略</dt><dd>' + ((snapshot.summary.config || {}).notification_dry_run ? "安全演练模式" : "真实发送模式") + '</dd></dl></section>' +
      '<section class="runtime-incident-detail-card is-muted"><div class="runtime-incident-detail-heading"><b>5</b><div><strong>处置扩展</strong><small>确认人、根因、SLA 与 GitLab 变更尚未入库</small></div></div><p>正式启用这些处置字段前，需要补充事件确认与根因分析数据表；当前页面不以静态值伪装。</p></section>' +
      '</div><footer><button type="button" data-runtime-incident-project="' + Number(incident.project_id || 0) + '">查看项目详情</button><button type="button" class="primary" data-runtime-open-topology="' + Number(incident.project_id || 0) + '">打开项目拓扑</button></footer></aside>';
    shell.onclick = function (event) {
      var close = event.target.closest("[data-runtime-incident-close]");
      if (close) {
        closeIncidentInspector(page);
        return;
      }
      var projectButton = event.target.closest("[data-runtime-incident-project]");
      if (projectButton) {
        openProjectDetail(projectButton.dataset.runtimeIncidentProject, projectButton);
        return;
      }
      var topologyButton = event.target.closest("[data-runtime-open-topology]");
      if (topologyButton) openIncidentTopology(topologyButton.dataset.runtimeOpenTopology);
    };
    window.requestAnimationFrame(function () { shell.classList.add("is-open"); });
    shell.querySelector(".runtime-incident-inspector")?.focus();
    renderIncidentTable(page);
  }

  function closeIncidentInspector(page) {
    var shell = document.querySelector("[data-runtime-incident-inspector-shell]");
    if (!shell || shell.hidden) return;
    shell.classList.remove("is-open");
    selectedIncidentId = 0;
    window.setTimeout(function () {
      if (!shell.classList.contains("is-open")) {
        shell.hidden = true;
        shell.innerHTML = "";
      }
    }, 220);
    renderIncidentTable(page);
  }

  function renderCoverageProject(project) {
    var linkCount = Number(Boolean(project.test_url)) + Number(Boolean(project.prod_url));
    var projectName = projectDisplayName(project, "项目 #" + project.id);
    var onboardingStatus = project.onboarding_status || "topology_pending";
    var onboardingLabel = project.onboarding_label || "等待接入";
    var onboardingMessage = project.onboarding_message || "尚未形成可验证的健康检查地址。";
    var retryHint = project.onboarding_next_attempt_at ? " 下次重试 " + formatTime(project.onboarding_next_attempt_at) : "";
    return '<div class="runtime-monitor-coverage-row" role="link" tabindex="0" data-runtime-project-id="' + Number(project.id || 0) + '" aria-label="查看项目详情：' + escapeHtml(projectName) + '">' +
      '<div><strong>' + escapeHtml(projectName) + '</strong><small>' + escapeHtml(project.owner_name || "负责人未设置") + '</small></div>' +
      '<span class="runtime-coverage-status ' + (project.topology_status === "success" ? "ok" : "warn") + '">' + escapeHtml(topologyLabel(project.topology_status)) + '</span>' +
      '<div><strong>' + Number(project.deployment_target_count || 0) + ' 个部署目标</strong><small>' + linkCount + ' 个环境地址</small></div>' +
      '<div class="runtime-monitor-onboarding-detail"><span class="runtime-coverage-status ' + onboardingTone(onboardingStatus) + '">' + escapeHtml(onboardingLabel) + '</span><small title="' + escapeHtml(onboardingMessage + retryHint) + '">' + escapeHtml(onboardingMessage + retryHint) + '</small></div>' +
      '</div>';
  }

  function filteredCoverageProjects() {
    var query = normalizeSearch(coverageTableState.query);
    var topology = coverageTableState.topology;
    var items = ((snapshot && snapshot.coverage && snapshot.coverage.projects) || [])
      .filter(function (project) { return !project.monitored; })
      .filter(function (project) {
        var projectTopology = project.topology_status || "never";
        if (topology !== "all" && projectTopology !== topology) return false;
        if (!query) return true;
        return normalizeSearch([
          projectSearchNames(project),
          project.name,
          project.owner_name,
          topologyLabel(projectTopology),
          project.onboarding_label,
          project.onboarding_message,
          project.deployment_target_count,
          project.test_url,
          project.prod_url
        ].join(" ")).indexOf(query) >= 0;
      });

    var topologyOrder = { failed: 0, never: 1, success: 2 };
    var onboardingOrder = {
      retry_scheduled: 0,
      topology_failed: 1,
      health_url_missing: 2,
      candidate_ready: 3,
      deployment_missing: 4,
      topology_pending: 5,
      monitored: 6
    };
    items.sort(function (left, right) {
      if (coverageTableState.sort === "name_asc") return compareText(projectDisplayName(left), projectDisplayName(right));
      if (coverageTableState.sort === "owner_asc") return compareText(left.owner_name, right.owner_name) || compareText(projectDisplayName(left), projectDisplayName(right));
      if (coverageTableState.sort === "topology_attention") {
        return (topologyOrder[left.topology_status || "never"] ?? 1) - (topologyOrder[right.topology_status || "never"] ?? 1) || compareText(projectDisplayName(left), projectDisplayName(right));
      }
      if (coverageTableState.sort === "onboarding_attention") {
        return (onboardingOrder[left.onboarding_status || "topology_pending"] ?? 5) - (onboardingOrder[right.onboarding_status || "topology_pending"] ?? 5) || compareText(projectDisplayName(left), projectDisplayName(right));
      }
      return Number(right.deployment_target_count || 0) - Number(left.deployment_target_count || 0) || compareText(projectDisplayName(left), projectDisplayName(right));
    });
    return items;
  }

  function filteredRuntimeChecks() {
    var query = normalizeSearch(checkTableState.query);
    var items = ((snapshot && snapshot.checks) || []).filter(function (check) {
      var state = check.monitor_state || "pending";
      var project = runtimeProject(check.project_id);
      if (checkTableState.status !== "all" && state !== checkTableState.status) return false;
      if (!query) return true;
      return normalizeSearch([
        projectSearchNames(project),
        check.project_name,
        check.environment,
        check.module_name,
        check.health_url,
        check.last_probe_message,
        stateLabel(state)
      ].join(" ")).indexOf(query) >= 0;
    });

    var severity = { down: 0, degraded: 1, recovering: 2, pending: 3, healthy: 4 };
    items.sort(function (left, right) {
      var leftName = projectDisplayName(runtimeProject(left.project_id), left.project_name);
      var rightName = projectDisplayName(runtimeProject(right.project_id), right.project_name);
      if (checkTableState.sort === "project_asc") return compareText(leftName, rightName) || compareText(left.module_name, right.module_name);
      if (checkTableState.sort === "latency_desc") {
        return Number(right.last_probe_latency_ms || -1) - Number(left.last_probe_latency_ms || -1) || compareText(leftName, rightName);
      }
      if (checkTableState.sort === "recent_desc") {
        return (Date.parse(right.last_probe_at || "") || 0) - (Date.parse(left.last_probe_at || "") || 0) || compareText(leftName, rightName);
      }
      return (severity[left.monitor_state || "pending"] ?? 3) - (severity[right.monitor_state || "pending"] ?? 3) || compareText(leftName, rightName);
    });
    return items;
  }

  function coverageToolbarHtml() {
    return '<div class="runtime-monitor-table-toolbar" data-runtime-coverage-toolbar>' +
      '<label class="runtime-monitor-table-search"><span>搜索</span><input type="search" autocomplete="off" placeholder="项目名称或负责人" data-runtime-coverage-search></label>' +
      tableSelectHtml("coverage", "topology", "拓扑状态", [
        { value: "all", label: "全部拓扑" },
        { value: "success", label: "已同步" },
        { value: "failed", label: "同步失败" },
        { value: "never", label: "待同步" }
      ], coverageTableState.topology) +
      tableSelectHtml("coverage", "sort", "排序", [
        { value: "targets_desc", label: "部署目标最多" },
        { value: "onboarding_attention", label: "接入阻塞优先" },
        { value: "topology_attention", label: "拓扑异常优先" },
        { value: "name_asc", label: "项目名称" },
        { value: "owner_asc", label: "负责人" }
      ], coverageTableState.sort) +
      tableSelectHtml("coverage", "size", "每页", [
        { value: "10", label: "10 条" },
        { value: "20", label: "20 条" },
        { value: "50", label: "50 条" }
      ], String(coverageTableState.pageSize)) +
      '<button type="button" class="runtime-monitor-table-reset" data-runtime-coverage-reset>重置</button>' +
      '</div>' +
      '<div class="runtime-monitor-table-summary"><span data-runtime-coverage-result aria-live="polite"></span></div>';
  }

  function checkToolbarHtml() {
    return '<div class="runtime-monitor-table-toolbar" data-runtime-check-toolbar>' +
      '<label class="runtime-monitor-table-search"><span>搜索</span><input type="search" autocomplete="off" placeholder="项目、服务或健康地址" data-runtime-check-search></label>' +
      tableSelectHtml("check", "status", "运行状态", [
        { value: "all", label: "全部状态" },
        { value: "down", label: "故障" },
        { value: "degraded", label: "波动待确认" },
        { value: "recovering", label: "恢复确认中" },
        { value: "pending", label: "等待首检" },
        { value: "healthy", label: "健康" }
      ], checkTableState.status) +
      tableSelectHtml("check", "sort", "排序", [
        { value: "severity", label: "严重程度" },
        { value: "recent_desc", label: "最近探测" },
        { value: "latency_desc", label: "耗时最高" },
        { value: "project_asc", label: "项目名称" }
      ], checkTableState.sort) +
      tableSelectHtml("check", "size", "每页", [
        { value: "10", label: "10 条" },
        { value: "20", label: "20 条" },
        { value: "50", label: "50 条" }
      ], String(checkTableState.pageSize)) +
      '<button type="button" class="runtime-monitor-table-reset" data-runtime-check-reset>重置</button>' +
      '</div>' +
      '<div class="runtime-monitor-table-summary"><span data-runtime-check-result aria-live="polite"></span></div>';
  }

  function renderCoverageTable(page) {
    var section = page.querySelector("[data-runtime-coverage-section]");
    if (!section) return;
    var items = filteredCoverageProjects();
    var totalPages = Math.max(1, Math.ceil(items.length / coverageTableState.pageSize));
    coverageTableState.page = clampPage(coverageTableState.page, totalPages);
    var start = (coverageTableState.page - 1) * coverageTableState.pageSize;
    var visible = items.slice(start, start + coverageTableState.pageSize);
    var list = section.querySelector("[data-runtime-coverage-list]");
    var result = section.querySelector("[data-runtime-coverage-result]");
    var pagination = section.querySelector("[data-runtime-coverage-pagination]");
    if (list) {
      animateTableSwap(list, visible.length
        ? visible.map(renderCoverageProject).join("")
        : '<div class="runtime-monitor-table-empty"><strong>没有匹配的待接入项目</strong></div>');
    }
    if (result) {
      animateTextUpdate(result, items.length ? "显示 " + (start + 1) + "–" + (start + visible.length) + "，共 " + items.length + " 个项目" : "0 个匹配项目");
    }
    if (pagination) pagination.innerHTML = items.length ? renderPagination("coverage", coverageTableState, items.length) : "";
    var reset = section.querySelector("[data-runtime-coverage-reset]");
    if (reset) reset.disabled = !coverageTableState.query && coverageTableState.topology === "all" && coverageTableState.sort === "targets_desc" && coverageTableState.pageSize === 10;
  }

  function renderCheckTable(page) {
    var section = page.querySelector("[data-runtime-check-section]");
    if (!section) return;
    var items = filteredRuntimeChecks();
    var totalPages = Math.max(1, Math.ceil(items.length / checkTableState.pageSize));
    checkTableState.page = clampPage(checkTableState.page, totalPages);
    var start = (checkTableState.page - 1) * checkTableState.pageSize;
    var visible = items.slice(start, start + checkTableState.pageSize);
    var list = section.querySelector("[data-runtime-check-list]");
    var result = section.querySelector("[data-runtime-check-result]");
    var pagination = section.querySelector("[data-runtime-check-pagination]");
    if (list) {
      animateTableSwap(list, visible.length
        ? visible.map(renderCheck).join("")
        : '<div class="runtime-monitor-table-empty"><strong>没有匹配的服务检查项</strong></div>');
    }
    if (result) {
      animateTextUpdate(result, items.length ? "显示 " + (start + 1) + "–" + (start + visible.length) + "，共 " + items.length + " 个检查项" : "0 个匹配检查项");
    }
    if (pagination) pagination.innerHTML = items.length ? renderPagination("check", checkTableState, items.length) : "";
    var reset = section.querySelector("[data-runtime-check-reset]");
    if (reset) reset.disabled = !checkTableState.query && checkTableState.status === "all" && checkTableState.sort === "severity" && checkTableState.pageSize === 10;
  }

  function bindOverviewTables(page) {
    var coverageSection = page.querySelector("[data-runtime-coverage-section]");
    if (coverageSection && coverageSection.querySelector("[data-runtime-coverage-toolbar]")) {
      var coverageSearch = coverageSection.querySelector("[data-runtime-coverage-search]");
      var coverageTopology = coverageSection.querySelector('[data-runtime-select-key="topology"]');
      var coverageSort = coverageSection.querySelector('[data-runtime-select-key="sort"]');
      var coverageSize = coverageSection.querySelector('[data-runtime-select-key="size"]');
      coverageSearch.value = coverageTableState.query;
      setTableSelectValue(coverageTopology, coverageTableState.topology);
      setTableSelectValue(coverageSort, coverageTableState.sort);
      setTableSelectValue(coverageSize, String(coverageTableState.pageSize));
      coverageSearch.addEventListener("input", function () {
        coverageTableState.query = coverageSearch.value;
        coverageTableState.page = 1;
        renderCoverageTable(page);
      });
      coverageSection.addEventListener("keydown", handleTableSelectKeydown);
      coverageSection.addEventListener("keydown", handleProjectRowKeydown);
      coverageSection.addEventListener("click", function (event) {
        var projectRow = event.target.closest("[data-runtime-project-id]");
        if (projectRow) {
          openProjectDetail(projectRow.dataset.runtimeProjectId, projectRow);
          return;
        }
        var toggle = event.target.closest("[data-runtime-select-toggle]");
        if (toggle) {
          var select = toggle.closest(".runtime-monitor-select");
          var shouldOpen = !select.classList.contains("open");
          closeOtherTableSelects(select);
          select.classList.toggle("open", shouldOpen);
          toggle.setAttribute("aria-expanded", String(shouldOpen));
          return;
        }
        var option = event.target.closest("[data-runtime-select-option]");
        if (option) {
          var select = option.closest(".runtime-monitor-select");
          var key = select.dataset.runtimeSelectKey;
          var value = option.dataset.runtimeSelectOption;
          setTableSelectValue(select, value);
          closeTableSelect(select);
          if (key === "topology") coverageTableState.topology = value;
          else if (key === "sort") coverageTableState.sort = value;
          else if (key === "size") coverageTableState.pageSize = Number(value) || 10;
          coverageTableState.page = 1;
          renderCoverageTable(page);
          toggle = select.querySelector("[data-runtime-select-toggle]");
          toggle?.focus();
          return;
        }
        closeOtherTableSelects();
        var reset = event.target.closest("[data-runtime-coverage-reset]");
        if (reset) {
          coverageTableState = { query: "", topology: "all", sort: "targets_desc", page: 1, pageSize: 10 };
          coverageSearch.value = "";
          setTableSelectValue(coverageTopology, "all");
          setTableSelectValue(coverageSort, "targets_desc");
          setTableSelectValue(coverageSize, "10");
          renderCoverageTable(page);
          return;
        }
        var target = event.target.closest("[data-runtime-coverage-page]");
        if (!target || target.disabled) return;
        coverageTableState.page = Number(target.dataset.runtimeCoveragePage) || 1;
        renderCoverageTable(page);
      });
      renderCoverageTable(page);
    }

    var checkSection = page.querySelector("[data-runtime-check-section]");
    if (checkSection && checkSection.querySelector("[data-runtime-check-toolbar]")) {
      var checkSearch = checkSection.querySelector("[data-runtime-check-search]");
      var checkStatus = checkSection.querySelector('[data-runtime-select-key="status"]');
      var checkSort = checkSection.querySelector('[data-runtime-select-key="sort"]');
      var checkSize = checkSection.querySelector('[data-runtime-select-key="size"]');
      checkSearch.value = checkTableState.query;
      setTableSelectValue(checkStatus, checkTableState.status);
      setTableSelectValue(checkSort, checkTableState.sort);
      setTableSelectValue(checkSize, String(checkTableState.pageSize));
      checkSearch.addEventListener("input", function () {
        checkTableState.query = checkSearch.value;
        checkTableState.page = 1;
        renderCheckTable(page);
      });
      checkSection.addEventListener("keydown", handleTableSelectKeydown);
      checkSection.addEventListener("keydown", handleProjectRowKeydown);
      checkSection.addEventListener("click", function (event) {
        var projectRow = event.target.closest("[data-runtime-project-id]");
        if (projectRow) {
          openProjectDetail(projectRow.dataset.runtimeProjectId, projectRow);
          return;
        }
        var toggle = event.target.closest("[data-runtime-select-toggle]");
        if (toggle) {
          var select = toggle.closest(".runtime-monitor-select");
          var shouldOpen = !select.classList.contains("open");
          closeOtherTableSelects(select);
          select.classList.toggle("open", shouldOpen);
          toggle.setAttribute("aria-expanded", String(shouldOpen));
          return;
        }
        var option = event.target.closest("[data-runtime-select-option]");
        if (option) {
          var select = option.closest(".runtime-monitor-select");
          var key = select.dataset.runtimeSelectKey;
          var value = option.dataset.runtimeSelectOption;
          setTableSelectValue(select, value);
          closeTableSelect(select);
          if (key === "status") checkTableState.status = value;
          else if (key === "sort") checkTableState.sort = value;
          else if (key === "size") checkTableState.pageSize = Number(value) || 10;
          checkTableState.page = 1;
          renderCheckTable(page);
          toggle = select.querySelector("[data-runtime-select-toggle]");
          toggle?.focus();
          return;
        }
        closeOtherTableSelects();
        var reset = event.target.closest("[data-runtime-check-reset]");
        if (reset) {
          checkTableState = { query: "", status: "all", sort: "severity", page: 1, pageSize: 10 };
          checkSearch.value = "";
          setTableSelectValue(checkStatus, "all");
          setTableSelectValue(checkSort, "severity");
          setTableSelectValue(checkSize, "10");
          renderCheckTable(page);
          return;
        }
        var target = event.target.closest("[data-runtime-check-page]");
        if (!target || target.disabled) return;
        checkTableState.page = Number(target.dataset.runtimeCheckPage) || 1;
        renderCheckTable(page);
      });
      renderCheckTable(page);
    }
  }

  function headerHtml(summary, title, subtitle) {
    var config = summary.config || {};
    var workerOk = config.enabled && config.worker_running;
    return '<header class="runtime-monitor-header"><div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle) + '</p></div>' +
      '<div class="runtime-monitor-header-actions"><span class="runtime-worker-status ' + (workerOk ? "ok" : "warn") + '"><i></i>' + (workerOk ? "自动巡检运行中" : "自动巡检未运行") + '</span><button type="button" data-runtime-refresh>刷新</button><button type="button" class="primary" data-runtime-run' + (running ? " disabled" : "") + '>' + (running ? "巡检中..." : "立即巡检") + '</button></div></header>';
  }

  function qualityStateLabel(state) {
    return ({ attention: "自动检查待处理", checking: "待检查或交付确认", passed: "可安排验收准备", not_checked: "需要更新信息", not_connected: "需要补齐信息" })[state] || "等待确认";
  }

  function qualityStateTone(item) {
    return item && item.tone === "success" ? "success" : item && item.tone === "danger" ? "danger" : item && item.tone === "warn" ? "warn" : "muted";
  }

  function qualityHeaderHtml(payload) {
    return '<header class="delivery-quality-header"><div><span>运维监控 · 交付质检</span><h1>项目交付状态</h1><p>统计全部未归档项目，每个项目只计入一种状态；按最新保存的 GitLab 同步和流水线结果判定。通过后仍需业务验收。</p></div>' +
      '<div><small>页面读取于 ' + escapeHtml(formatTime(payload && payload.generated_at)) + '</small><button type="button" data-quality-refresh>重新读取结果</button></div></header>';
  }

  function qualityLoadingHeaderHtml() {
    return '<header class="delivery-quality-header"><div><span>运维监控 · 交付质检</span><h1>项目交付状态</h1><p>正在读取最新结果。通常只需要几秒，完成后会自动显示。</p></div></header>';
  }

  function qualityMetric(label, value, helper, tone, filter, marker) {
    return '<button type="button" class="delivery-quality-metric ' + escapeHtml(tone) + (qualityTableState.filter === filter ? " active" : "") + '" data-quality-filter="' + escapeHtml(filter) + '" data-quality-marker="' + escapeHtml(marker) + '" aria-label="' + escapeHtml(label + '，' + Number(value || 0) + ' 个项目。实际判定：' + helper) + '"><span>' + escapeHtml(label) + '</span><strong>' + Number(value || 0) + '</strong><small>实际判定：' + escapeHtml(helper) + '</small></button>';
  }

  function qualityAdminNextStep(summary) {
    var attention = Number(summary && summary.attention_count || 0);
    var checking = Number(summary && summary.checking_count || 0);
    var coverage = Number(summary && summary.not_connected_count || 0);
    if (attention) {
      return {
        filter: "attention",
        tone: "attention",
        title: "请先跟进 " + attention + " 个项目负责人",
        detail: "这些项目暂时不能进入验收准备：可能是研发检查未通过，或最新结果未能读取。请在下方查看原因，由项目负责人处理后更新结果。",
        button: "查看待处理项目"
      };
    }
    if (checking) {
      return {
        filter: "checking",
        tone: "checking",
        title: "有 " + checking + " 个项目待检查或交付确认",
        detail: "这些项目可能正在自动检查，或自动检查已完成、等待项目负责人确认交付环节。确认前暂不安排业务验收。",
        button: "查看待检查或确认的项目"
      };
    }
    if (coverage) {
      return {
        filter: "coverage",
        tone: "coverage",
        title: "请补齐 " + coverage + " 个项目的研发信息",
        detail: "系统还没有拿到这些项目的研发检查信息。补齐或更新信息后，才能判断是否可进入验收准备。",
        button: "查看需要补齐信息的项目"
      };
    }
    return {
      filter: "passed",
      tone: "passed",
      title: "目前没有需要您协调的项目",
      detail: "研发检查通过的项目可以开始安排业务验收。完成业务验收后，项目才算正式交付。",
      button: "查看可安排验收的项目"
    };
  }

  function qualityNextAction(item) {
    if (item.state === "attention") return { title: "请项目负责人处理", detail: "负责人可在项目详情查看原因，处理后更新结果" };
    if (item.state === "checking") return { title: "等待检查或确认，暂不需操作", detail: "自动检查完成或交付确认后会自动更新" };
    if (item.state === "passed") return { title: "安排业务验收准备", detail: "完成业务验收后才算正式交付" };
    if (item.state === "not_checked") return { title: "请更新研发信息", detail: "更新后系统才能给出交付提示" };
    if (item.state === "not_connected") return { title: "请补充研发信息", detail: "补齐后系统才能给出交付提示" };
    return { title: item.next_action || "请确认下一步", detail: "请在项目详情查看处理方式" };
  }

  function qualityPagination(total) {
    var pageSize = qualityTableState.pageSize;
    var pageCount = Math.max(1, Math.ceil(total / pageSize));
    qualityTableState.page = Math.min(Math.max(qualityTableState.page, 1), pageCount);
    var current = qualityTableState.page;
    var pages = [];
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (pageNumber === 1 || pageNumber === pageCount || Math.abs(pageNumber - current) <= 1) {
        pages.push('<button type="button" data-quality-page="' + pageNumber + '" class="' + (pageNumber === current ? "active" : "") + '"' + (pageNumber === current ? ' aria-current="page"' : "") + '>' + pageNumber + '</button>');
      } else if (!pages.includes("…")) {
        pages.push("…");
      }
    }
    return '<footer class="delivery-quality-pagination"><span>显示 ' + (total ? ((current - 1) * pageSize + 1) : 0) + '–' + Math.min(current * pageSize, total) + ' / ' + total + ' 个项目</span><div><button type="button" data-quality-page="' + (current - 1) + '"' + (current <= 1 ? " disabled" : "") + '>上一页</button>' + pages.join("") + '<button type="button" data-quality-page="' + (current + 1) + '"' + (current >= pageCount ? " disabled" : "") + '>下一页</button></div></footer>';
  }

  function renderQuality(page) {
    removeIncidentInspectorShell();
    unmountTopology(page);
    disposeIncidentTimeline();
    page.classList.remove("runtime-monitor-topology-page");
    page.classList.add("delivery-quality-page");
    var payload = qualitySnapshot || { summary: {}, projects: [], generated_at: "" };
    var summary = payload.summary || {};
    var allProjects = Array.isArray(payload.projects) ? payload.projects : [];
    var normalizedQuery = normalizeSearch(qualityTableState.query);
    var projects = allProjects.filter(function (item) {
      var stateMatched = qualityTableState.filter === "all" || item.state === qualityTableState.filter || (qualityTableState.filter === "coverage" && ["not_checked", "not_connected"].includes(item.state));
      var searchText = [item.project_name, item.owner_name, item.conclusion, item.detail, item.next_action].map(normalizeSearch).join(" ");
      return stateMatched && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
    var start = (qualityTableState.page - 1) * qualityTableState.pageSize;
    var visible = projects.slice(start, start + qualityTableState.pageSize);
    var priority = allProjects.find(function (item) { return item.state === "attention"; }) || allProjects.find(function (item) { return item.state === "checking"; }) || null;
    var nextStep = qualityAdminNextStep(summary);

    page.innerHTML = qualityHeaderHtml(payload) +
      '<div class="delivery-quality-body">' +
        '<section class="delivery-quality-metrics" aria-label="项目交付状态概览">' +
          qualityMetric("可安排验收准备", summary.passed_count, "最新流水线成功，且没有失败或手动任务", "success", "passed", "验收") +
          qualityMetric("自动检查待处理", summary.attention_count, "同步失败，或流水线/阶段有失败", "danger", "attention", "待处理") +
          qualityMetric("待检查或交付确认", summary.checking_count, "流水线运行中，或存在手动任务", "warn", "checking", "确认") +
          qualityMetric("需要补齐信息", summary.not_connected_count, "尚未取得最新流水线结果", "muted", "coverage", "信息") +
        '</section>' +
        '<section class="delivery-quality-priority ' + escapeHtml(nextStep.tone) + (priority ? " has-item" : "") + '"><div><span>管理员下一步</span><strong>' + escapeHtml(nextStep.title) + '</strong><p>' + escapeHtml(nextStep.detail) + '</p>' + (priority ? '<small>优先查看：' + escapeHtml(priority.project_name) + '。' + escapeHtml(priority.detail) + '</small>' : "") + '</div><button type="button" data-quality-focus="' + escapeHtml(nextStep.filter) + '">' + escapeHtml(nextStep.button) + '</button></section>' +
        '<section class="delivery-quality-table-card"><header><div><span>项目跟进清单</span><h2>找到项目负责人，完成下一步</h2><p>只保留管理员需要的当前情况、负责人和行动建议；检查明细可在项目详情查看。</p></div><label><span>搜索</span><input type="search" data-quality-search placeholder="搜索项目、负责人或需要处理的事项" value="' + escapeHtml(qualityTableState.query) + '" /></label></header>' +
          '<div class="delivery-quality-filter" role="group" aria-label="项目交付状态筛选"><button type="button" data-quality-filter="all" class="' + (qualityTableState.filter === "all" ? "active" : "") + '">全部项目</button><button type="button" data-quality-filter="attention" class="' + (qualityTableState.filter === "attention" ? "active" : "") + '">待处理</button><button type="button" data-quality-filter="checking" class="' + (qualityTableState.filter === "checking" ? "active" : "") + '">待检查或确认</button><button type="button" data-quality-filter="coverage" class="' + (qualityTableState.filter === "coverage" ? "active" : "") + '">需要补齐信息</button></div>' +
          '<div class="delivery-quality-table" role="table" aria-label="项目交付状态"><div class="delivery-quality-row delivery-quality-head" role="row"><span>序号</span><span>项目与负责人</span><span>当前状态</span><span>您需要知道的情况</span><span>下一步怎么做</span><span>结果更新时间</span><span>操作</span></div>' +
            (visible.length ? visible.map(function (item, index) {
              var sequence = start + index + 1;
              var action = qualityNextAction(item);
              return '<div class="delivery-quality-row" role="row"><b>' + sequence + '</b><div><strong>' + escapeHtml(item.project_name) + '</strong><small>项目负责人：' + escapeHtml(item.owner_name || "待确认") + '</small></div><span class="delivery-quality-state ' + qualityStateTone(item) + '">' + escapeHtml(qualityStateLabel(item.state)) + '</span><div><strong>' + escapeHtml(item.conclusion) + '</strong><small>' + escapeHtml(item.detail) + '</small></div><div><strong>' + escapeHtml(action.title) + '</strong><small>' + escapeHtml(action.detail) + '</small></div><time>' + escapeHtml(formatTime(item.checked_at)) + '</time><button type="button" data-quality-open-project="' + Number(item.project_id || 0) + '">查看详情</button></div>';
            }).join("") : '<div class="delivery-quality-empty"><strong>没有符合条件的项目</strong><span>可清空搜索条件或切换检查状态。</span></div>') +
          '</div>' + qualityPagination(projects.length) +
        '</section>' +
      '</div>';
    bindQuality(page);
  }

  function renderQualityError(page, message) {
    page.classList.remove("runtime-monitor-topology-page");
    page.classList.add("delivery-quality-page");
    page.innerHTML = '<header class="delivery-quality-header"><div><span>运维监控 · 交付质检</span><h1>项目交付状态</h1><p>按项目查看当前交付情况、负责人和下一步。</p></div></header><div class="delivery-quality-error"><strong>项目交付状态暂时无法读取</strong><p>' + escapeHtml(message) + '</p><button type="button" data-quality-refresh>重新加载</button></div>';
    page.querySelector("[data-quality-refresh]")?.addEventListener("click", loadData);
  }

  function bindQuality(page) {
    var search = page.querySelector("[data-quality-search]");
    if (search) {
      search.addEventListener("input", function () {
        qualityTableState.query = search.value;
        qualityTableState.page = 1;
        renderQuality(page);
      });
    }
    if (page._deliveryQualityClick) page.removeEventListener("click", page._deliveryQualityClick);
    page._deliveryQualityClick = function (event) {
      var refresh = event.target.closest("[data-quality-refresh]");
      if (refresh) { loadData(); return; }
      var filter = event.target.closest("[data-quality-filter]");
      if (filter) {
        qualityTableState.filter = filter.dataset.qualityFilter || "all";
        qualityTableState.page = 1;
        renderQuality(page);
        return;
      }
      var focus = event.target.closest("[data-quality-focus]");
      if (focus) {
        qualityTableState.filter = focus.dataset.qualityFocus || "all";
        qualityTableState.page = 1;
        renderQuality(page);
        page.querySelector(".delivery-quality-table-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      var retryLoading = event.target.closest("[data-quality-loading-retry]");
      if (retryLoading) {
        cancelActiveLoad();
        loadData();
        return;
      }
      var project = event.target.closest("[data-quality-open-project]");
      if (project) { openProjectDetail(project.dataset.qualityOpenProject, project); return; }
      var pageButton = event.target.closest("[data-quality-page]");
      if (pageButton && !pageButton.disabled) {
        qualityTableState.page = Number(pageButton.dataset.qualityPage) || 1;
        renderQuality(page);
      }
    };
    page.addEventListener("click", page._deliveryQualityClick);
  }

  function configHtml(config) {
    return '<section class="runtime-monitor-config"><span>周期 ' + Number(config.interval_seconds || 60) + ' 秒</span><span>连续失败 ' + Number(config.failure_threshold || 3) + ' 次告警</span><span>连续成功 ' + Number(config.recovery_threshold || 2) + ' 次恢复</span><span>并发 ' + Number(config.concurrency || 1) + '</span><span class="' + (config.auto_onboard_enabled ? "ok" : "warn") + '">' + (config.auto_onboard_enabled ? "健康端点自动接入" : "健康端点需手动接入") + '</span><span class="' + (config.notification_dry_run ? "warn" : "ok") + '">' + (config.notification_dry_run ? "通知演练模式" : "故障通知真实发送") + '</span></section>';
  }

  function renderOverview(page) {
    removeIncidentInspectorShell();
    page.classList.remove("delivery-quality-page");
    var summary = snapshot.summary;
    var existingRoot = page.querySelector("[data-runtime-topology-root]");
    if (existingRoot && window.LegacyRuntimeTopology) {
      var headerDescription = page.querySelector(".runtime-monitor-header p");
      if (headerDescription) headerDescription.textContent = "全项目接入、环境与健康检查的一屏监控 · 最近巡检 " + formatTime(summary.last_probe_at);
      var workerStatus = page.querySelector(".runtime-worker-status");
      var workerOk = Boolean(summary.config && summary.config.enabled && summary.config.worker_running);
      if (workerStatus) {
        workerStatus.classList.toggle("ok", workerOk);
        workerStatus.classList.toggle("warn", !workerOk);
        workerStatus.innerHTML = "<i></i>" + (workerOk ? "自动巡检运行中" : "自动巡检未运行");
      }
      var runButton = page.querySelector("[data-runtime-run]");
      if (runButton) {
        runButton.disabled = running;
        runButton.textContent = running ? "巡检中..." : "立即巡检";
      }
      window.LegacyRuntimeTopology.mount(existingRoot, snapshot, {
        onRefresh: loadData,
        onRun: runMonitor,
        onOpenProject: function (projectId) { openProjectDetail(projectId); },
        initialMode: pendingTopologyProjectId ? "topology" : "global",
        initialProjectId: pendingTopologyProjectId
      });
      pendingTopologyProjectId = 0;
      return;
    }
    unmountTopology(page);
    var token = Number(page.dataset.runtimeTopologyToken || 0) + 1;
    page.dataset.runtimeTopologyToken = String(token);
    page.classList.add("runtime-monitor-topology-page");
    page.innerHTML = headerHtml(summary, "运行总览", "全项目接入、环境与健康检查的一屏监控 · 最近巡检 " + formatTime(summary.last_probe_at)) +
      '<div class="runtime-monitor-topology-loading" data-runtime-topology-root role="status" aria-live="polite"><div class="runtime-monitor-topology-loading-icon">' + runtimeIcon("Activity") + runtimeIcon("LoaderCircle", "is-spinning") + '</div><div><strong>正在绘制运行关系</strong><span>关联项目、部署环境与健康检查点</span></div></div>';
    hydrateRuntimeIcons(page);
    var root = page.querySelector("[data-runtime-topology-root]");
    ensureTopologyBundle().then(function (topology) {
      if (!active || activeView !== "overview" || !root.isConnected || Number(page.dataset.runtimeTopologyToken) !== token) return;
      topology.mount(root, snapshot, {
        onRefresh: loadData,
        onRun: runMonitor,
        onOpenProject: function (projectId) { openProjectDetail(projectId); },
        initialMode: pendingTopologyProjectId ? "topology" : "global",
        initialProjectId: pendingTopologyProjectId
      });
      pendingTopologyProjectId = 0;
    }).catch(function (error) {
      if (!root.isConnected) return;
      root.innerHTML = '<div class="runtime-monitor-error"><strong>运行拓扑组件未能加载</strong><p>' + escapeHtml(error.message || "请刷新后重试") + '</p><button type="button" data-runtime-refresh>重新加载</button></div>';
      root.querySelector("[data-runtime-refresh]")?.addEventListener("click", loadData);
    });
  }

  function incidentTimelineDates() {
    var start = incidentRangeStart();
    var dates = [];
    for (var offset = 0; offset < incidentTableState.rangeDays; offset += 1) {
      var date = new Date(start);
      date.setDate(start.getDate() + offset);
      dates.push(incidentDateKey(date));
    }
    return dates;
  }

  function incidentTimelineSeries(dates) {
    var opened = {};
    var resolved = {};
    ((snapshot && snapshot.incidents) || []).forEach(function (incident) {
      var openedKey = incidentDateKey(incident.opened_at);
      var resolvedKey = incidentDateKey(incident.resolved_at);
      if (openedKey) opened[openedKey] = Number(opened[openedKey] || 0) + 1;
      if (resolvedKey) resolved[resolvedKey] = Number(resolved[resolvedKey] || 0) + 1;
    });
    return {
      opened: dates.map(function (date) { return Number(opened[date] || 0); }),
      resolved: dates.map(function (date) { return Number(resolved[date] || 0); })
    };
  }

  function initIncidentTimeline(page, attempt) {
    var chartRoot = page && page.querySelector("[data-runtime-incident-timeline]");
    if (!chartRoot || !chartRoot.isConnected) return;
    var echarts = window.ProjectOperationsECharts;
    if (!echarts) {
      if ((attempt || 0) < 30) window.setTimeout(function () { initIncidentTimeline(page, Number(attempt || 0) + 1); }, 80);
      return;
    }
    disposeIncidentTimeline();
    incidentTimelineChart = echarts.init(chartRoot, null, { renderer: "canvas" });
    var dates = incidentTimelineDates();
    var series = incidentTimelineSeries(dates);
    incidentTimelineChart.setOption({
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 520,
      animationEasing: "cubicOut",
      aria: {
        enabled: true,
        description: "故障事件时间轴，展示真实故障发生与恢复完成数量。图例可以筛选，点击数据点联动下方台账，滚轮可缩放时间范围。"
      },
      color: ["#ef5865", "#22ad74"],
      grid: { left: 38, right: 28, top: 58, bottom: 48, containLabel: true },
      legend: {
        top: 10,
        left: 8,
        itemWidth: 18,
        itemHeight: 8,
        textStyle: { color: "#5f6f87", fontSize: 12, fontWeight: 700 },
        data: ["故障发生", "恢复完成"]
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: "#9db7e5", type: "dashed" } },
        backgroundColor: "rgba(255,255,255,.98)",
        borderColor: "#cfdbed",
        textStyle: { color: "#263a57", fontSize: 12 },
        extraCssText: "box-shadow:0 16px 40px rgba(30,67,124,.16);border-radius:8px;padding:10px 12px;"
      },
      toolbox: {
        right: 8,
        top: 4,
        feature: {
          dataZoom: { yAxisIndex: "none", title: { zoom: "框选缩放", back: "还原缩放" } },
          restore: { title: "还原视图" },
          saveAsImage: { title: "保存图表", name: "故障事件时间轴", pixelRatio: 2 }
        },
        iconStyle: { borderColor: "#6f86a7" },
        emphasis: { iconStyle: { borderColor: "#2f70ff" } }
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseWheel: false, moveOnMouseMove: true, preventDefaultMouseMove: true },
        { type: "slider", xAxisIndex: 0, height: 14, bottom: 8, borderColor: "transparent", fillerColor: "rgba(47,112,255,.12)", handleStyle: { color: "#2f70ff" }, textStyle: { color: "#71819a" } }
      ],
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: "#d9e2ef" } },
        axisTick: { show: false },
        axisLabel: { color: "#73829a", fontSize: 11, formatter: function (value) { return String(value).slice(5).replace("-", "/"); } }
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: "#8491a4", fontSize: 11 },
        splitLine: { lineStyle: { color: "#edf1f6" } }
      },
      series: [
        {
          name: "故障发生",
          type: "line",
          smooth: .32,
          symbol: "circle",
          symbolSize: 8,
          data: series.opened,
          lineStyle: { width: 2.5 },
          areaStyle: { opacity: .08 },
          emphasis: { focus: "series", scale: 1.25 }
        },
        {
          name: "恢复完成",
          type: "line",
          smooth: .32,
          symbol: "circle",
          symbolSize: 8,
          data: series.resolved,
          lineStyle: { width: 2.5 },
          areaStyle: { opacity: .06 },
          emphasis: { focus: "series", scale: 1.25 }
        }
      ]
    });
    incidentTimelineChart.on("click", function (params) {
      if (params.componentType !== "series") return;
      incidentTableState.dateKey = dates[params.dataIndex] || "";
      incidentTableState.eventType = params.seriesName === "恢复完成" ? "resolved" : "opened";
      incidentTableState.page = 1;
      renderIncidentTable(page);
      page.querySelector("[data-runtime-incident-section]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    incidentTimelineChart.on("legendselectchanged", function (params) {
      var openedSelected = Boolean(params.selected["故障发生"]);
      var resolvedSelected = Boolean(params.selected["恢复完成"]);
      incidentTableState.eventType = openedSelected && !resolvedSelected ? "opened" : !openedSelected && resolvedSelected ? "resolved" : "all";
      incidentTableState.page = 1;
      renderIncidentTable(page);
    });
    if (typeof ResizeObserver === "function") {
      incidentTimelineResizeObserver = new ResizeObserver(function () { incidentTimelineChart?.resize(); });
      incidentTimelineResizeObserver.observe(chartRoot);
    }
  }

  function renderIncidents(page) {
    removeIncidentInspectorShell();
    unmountTopology(page);
    disposeIncidentTimeline();
    page.classList.remove("runtime-monitor-topology-page");
    page.classList.remove("delivery-quality-page");
    var summary = snapshot.summary;
    var checksSummary = summary.checks || {};
    var incidentsSummary = summary.incidents || {};
    var incidents = snapshot.incidents || [];
    var openIncidents = incidents.filter(function (item) { return item.status === "open"; });
    var resolvedIncidents = incidents.filter(function (item) { return item.status === "resolved"; });
    var averageRecovery = incidentAverageRecovery(incidents);

    var notified = incidents.filter(function (incident) { return incident.failure_notification_id || incident.recovery_notification_id; }).length;
    page.innerHTML = headerHtml(summary, "故障事件", "从真实健康探测到恢复通知的一体化处置台账") +
      '<section class="runtime-incident-metric-strip" aria-label="故障事件核心指标">' +
      '<article class="danger"><span>开放事件</span><strong>' + openIncidents.length + '</strong><small>当前仍未恢复</small></article>' +
      '<article class="warn"><span>故障检查点</span><strong>' + Number(checksSummary.down || 0) + '</strong><small>已达到失败阈值</small></article>' +
      '<article class="ok"><span>已恢复事件</span><strong>' + resolvedIncidents.length + '</strong><small>当前真实列表</small></article>' +
      '<article class="runtime-incident-average-recovery" tabindex="0" title="' + escapeHtml(averageRecovery.explanation) + '" aria-label="' + escapeHtml("平均恢复时间 " + averageRecovery.label + "。" + averageRecovery.explanation) + '"><span>平均恢复时间</span><strong>' + escapeHtml(averageRecovery.label) + '</strong><small>开启至恢复平均耗时</small></article>' +
      '<article class="tone-primary"><span>通知已留痕</span><strong>' + notified + ' / ' + incidents.length + '</strong><small>' + ((summary.config || {}).notification_dry_run ? "当前为安全演练模式" : "当前为真实发送模式") + '</small></article>' +
      '</section>' +
      '<section class="runtime-incident-chart-panel">' +
      '<header><div><span>事件趋势</span><h2>故障发生与恢复时间轴</h2><p>数据来自运行故障表；图例、数据点、滚轮缩放与工具栏均可交互。</p></div><div class="runtime-incident-range" role="group" aria-label="时间范围"><button type="button" data-runtime-incident-range="14" class="' + (incidentTableState.rangeDays === 14 ? "active" : "") + '">近 14 天</button><button type="button" data-runtime-incident-range="30" class="' + (incidentTableState.rangeDays === 30 ? "active" : "") + '">近 30 天</button><button type="button" data-runtime-incident-range="90" class="' + (incidentTableState.rangeDays === 90 ? "active" : "") + '">近 90 天</button></div></header>' +
      '<div class="runtime-incident-chart" data-runtime-incident-timeline role="img" aria-label="故障发生与恢复时间轴"></div>' +
      '<footer><span>点击图例筛选事件类型，点击数据点联动下方台账；在图表内滚轮缩放时间。</span><button type="button" data-runtime-open-global-topology>查看全项目运行拓扑</button></footer>' +
      '</section>' +
      '<section class="runtime-incident-ledger" data-runtime-incident-section>' +
      '<header><div><span>处置台账</span><h2>故障事件与恢复闭环</h2><p>同一事件关联项目、检查点、探测结果和通知记录。</p></div><b>' + Number(incidentsSummary.open || 0) + ' 个开放故障</b></header>' +
      incidentToolbarHtml() +
      '<div class="runtime-incident-chart-filter" data-runtime-incident-chart-filter></div>' +
      '<div class="runtime-incident-head" aria-hidden="true"><span>优先级</span><span>项目 / 负责人</span><span>服务 / 健康地址</span><span>状态</span><span>发生 / 恢复</span><span>持续时间</span><span>最近探测</span><span>通知闭环</span><span>操作</span></div>' +
      '<div class="runtime-incident-list" data-runtime-incident-list></div>' +
      '<div class="runtime-monitor-table-summary"><span data-runtime-incident-result aria-live="polite"></span></div>' +
      '<div class="runtime-monitor-pagination" data-runtime-incident-pagination></div>' +
      '</section>';
    ensureIncidentInspectorShell();
    bindIncidentWorkbench(page);
    renderIncidentTable(page);
    initIncidentTimeline(page, 0);
  }

  function bindIncidentWorkbench(page) {
    var section = page.querySelector("[data-runtime-incident-section]");
    if (!section) return;
    var search = section.querySelector("[data-runtime-incident-search]");
    var status = section.querySelector('[data-runtime-select-key="status"]');
    var environment = section.querySelector('[data-runtime-select-key="environment"]');
    var sort = section.querySelector('[data-runtime-select-key="sort"]');
    search.value = incidentTableState.query;
    search.addEventListener("input", function () {
      incidentTableState.query = search.value;
      incidentTableState.page = 1;
      renderIncidentTable(page);
    });
    section.addEventListener("keydown", handleTableSelectKeydown);
    section.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var row = event.target.closest("[data-runtime-incident-id]");
      if (!row) return;
      event.preventDefault();
      renderIncidentInspector(page, row.dataset.runtimeIncidentId);
    });
    section.addEventListener("click", function (event) {
      var open = event.target.closest("[data-runtime-incident-open], [data-runtime-incident-id]");
      if (open) {
        renderIncidentInspector(page, open.dataset.runtimeIncidentOpen || open.dataset.runtimeIncidentId);
        return;
      }
      var toggle = event.target.closest("[data-runtime-select-toggle]");
      if (toggle) {
        var select = toggle.closest(".runtime-monitor-select");
        var shouldOpen = !select.classList.contains("open");
        closeOtherTableSelects(select);
        select.classList.toggle("open", shouldOpen);
        toggle.setAttribute("aria-expanded", String(shouldOpen));
        return;
      }
      var option = event.target.closest("[data-runtime-select-option]");
      if (option) {
        var select = option.closest(".runtime-monitor-select");
        var key = select.dataset.runtimeSelectKey;
        var value = option.dataset.runtimeSelectOption;
        setTableSelectValue(select, value);
        closeTableSelect(select);
        if (key === "status") incidentTableState.status = value;
        else if (key === "environment") incidentTableState.environment = value;
        else if (key === "sort") incidentTableState.sort = value;
        incidentTableState.page = 1;
        renderIncidentTable(page);
        select.querySelector("[data-runtime-select-toggle]")?.focus();
        return;
      }
      var chartReset = event.target.closest("[data-runtime-incident-chart-reset]");
      if (chartReset) {
        incidentTableState.dateKey = "";
        incidentTableState.eventType = "all";
        incidentTableState.page = 1;
        incidentTimelineChart?.dispatchAction({ type: "legendSelect", name: "故障发生" });
        incidentTimelineChart?.dispatchAction({ type: "legendSelect", name: "恢复完成" });
        renderIncidentTable(page);
        return;
      }
      var reset = event.target.closest("[data-runtime-incident-reset]");
      if (reset) {
        incidentTableState.query = "";
        incidentTableState.status = "all";
        incidentTableState.environment = "all";
        incidentTableState.sort = "opened_desc";
        incidentTableState.page = 1;
        incidentTableState.dateKey = "";
        incidentTableState.eventType = "all";
        search.value = "";
        setTableSelectValue(status, "all");
        setTableSelectValue(environment, "all");
        setTableSelectValue(sort, "opened_desc");
        incidentTimelineChart?.dispatchAction({ type: "legendSelect", name: "故障发生" });
        incidentTimelineChart?.dispatchAction({ type: "legendSelect", name: "恢复完成" });
        renderIncidentTable(page);
        return;
      }
      var pageButton = event.target.closest("[data-runtime-incident-page]");
      if (!pageButton || pageButton.disabled) return;
      incidentTableState.page = Number(pageButton.dataset.runtimeIncidentPage) || 1;
      renderIncidentTable(page);
    });
    if (page._runtimeIncidentPageClick) page.removeEventListener("click", page._runtimeIncidentPageClick);
    page._runtimeIncidentPageClick = function (event) {
      var close = event.target.closest("[data-runtime-incident-close]");
      if (close) {
        closeIncidentInspector(page);
        return;
      }
      var projectButton = event.target.closest("[data-runtime-incident-project]");
      if (projectButton) {
        openProjectDetail(projectButton.dataset.runtimeIncidentProject, projectButton);
        return;
      }
      var topologyButton = event.target.closest("[data-runtime-open-topology]");
      if (topologyButton) {
        openIncidentTopology(topologyButton.dataset.runtimeOpenTopology);
        return;
      }
      if (event.target.closest("[data-runtime-open-global-topology]")) activate("overview");
    };
    page.addEventListener("click", page._runtimeIncidentPageClick);
    page.querySelectorAll("[data-runtime-incident-range]").forEach(function (button) {
      button.addEventListener("click", function () {
        incidentTableState.rangeDays = Number(button.dataset.runtimeIncidentRange) || 30;
        incidentTableState.dateKey = "";
        incidentTableState.eventType = "all";
        incidentTableState.page = 1;
        renderIncidents(page);
        bindActions(page);
      });
    });
  }

  function bindActions(page) {
    page.querySelector("[data-runtime-refresh]")?.addEventListener("click", loadData);
    page.querySelector("[data-runtime-run]")?.addEventListener("click", runMonitor);
  }

  function render() {
    if (!active) return;
    var page = ensurePage();
    if (!page) return;
    if (loading && activeView === "quality" && !qualitySnapshot) {
      page.classList.add("is-loading", "delivery-quality-page");
      page.innerHTML = qualityLoadingHeaderHtml() + '<section class="delivery-quality-loading" role="status" aria-live="polite" aria-label="正在确认项目交付状态"><div class="delivery-quality-loading-card"><span>交付质检 · 正在汇总</span><div class="delivery-quality-loading-visual" aria-hidden="true"><i></i><b></b><em></em></div><strong>正在确认各项目的交付状态</strong><p>正在汇总检查结果、负责人和下一步，结果准备好后会自动显示。</p><div class="delivery-quality-loading-progress" aria-hidden="true"><i></i></div><small data-quality-loading-status>正在连接项目数据，请稍候。</small><button type="button" data-quality-loading-retry hidden>重新尝试</button></div></section>';
      bindQuality(page);
      return;
    }
    if (loading && !snapshot) {
      var incidentMode = activeView === "incidents";
      page.classList.add("is-loading");
      page.innerHTML = '<div class="runtime-monitor-loading-stage"><div class="runtime-monitor-loading" role="status" aria-live="polite" aria-label="' + (incidentMode ? "正在准备故障事件台账" : "正在准备运行总览") + '">' +
        '<div class="runtime-monitor-loading-card"><div class="runtime-monitor-loading-visual">' + runtimeIcon(incidentMode ? "AlertTriangle" : "Activity") + runtimeIcon("LoaderCircle", "is-spinning") + '</div>' +
        '<span class="runtime-monitor-loading-kicker">运维监控 · ' + (incidentMode ? "故障闭环" : "运行态势") + '</span>' +
        '<strong>' + (incidentMode ? "正在准备故障事件台账" : "正在准备运行总览") + '</strong>' +
        '<p>' + (incidentMode ? "同步故障、恢复、负责人和通知记录" : "同步项目、环境、检查点和运行拓扑") + '</p>' +
        '<div class="runtime-monitor-loading-progress" aria-hidden="true"><i></i></div>' +
        '<span class="runtime-monitor-loading-meta" aria-hidden="true">' + (incidentMode ? "读取事件&nbsp;&nbsp;·&nbsp;&nbsp;关联恢复&nbsp;&nbsp;·&nbsp;&nbsp;同步通知" : "读取项目&nbsp;&nbsp;·&nbsp;&nbsp;连接检查点&nbsp;&nbsp;·&nbsp;&nbsp;绘制拓扑") + '</span></div></div></div>';
      hydrateRuntimeIcons(page);
      return;
    }
    page.classList.remove("is-loading");
    if (activeView === "quality") {
      renderQuality(page);
      return;
    }
    if (!snapshot) return;
    if (activeView === "incidents") renderIncidents(page);
    else renderOverview(page);
    bindActions(page);
    updateNavBadge();
  }

  async function loadData() {
    if (!active || loading) return;
    var loadVersion = ++runtimeLoadVersion;
    var loadView = activeView;
    loading = true;
    guardRuntimeLoad(loadVersion, loadView);
    render();
    try {
      if (loadView === "quality") {
        scheduleQualityLoadingNotice(loadVersion);
        qualitySnapshot = await requestJson("/api/delivery-quality?scope=all", { timeoutMs: 12000 });
        if (!active || loadVersion !== runtimeLoadVersion) return;
        render();
        return;
      }
      var previousCoverage = snapshot && snapshot.coverage;
      var responses = await Promise.all([
        requestJson("/api/runtime-monitor/summary"),
        requestJson("/api/runtime-monitor/checks?state=all&limit=1000"),
        requestJson("/api/runtime-incidents?status=all&limit=100"),
        requestJson("/api/runtime-monitor/coverage").catch(function (error) {
          if (previousCoverage) return previousCoverage;
          throw error;
        })
      ]);
      if (!active || loadVersion !== runtimeLoadVersion) return;
      snapshot = {
        summary: responses[0],
        checks: responses[1],
        incidents: responses[2],
        coverage: responses[3]
      };
      render();
    } catch (error) {
      if (!active || loadVersion !== runtimeLoadVersion) return;
      var page = ensurePage();
      if (page) {
        if (loadView === "quality") renderQualityError(page, error.message || "读取失败");
        else renderError(page, error.message || "读取失败");
      }
    } finally {
      if (loadVersion !== runtimeLoadVersion) return;
      loading = false;
      clearRuntimeLoadGuard();
      clearQualityLoadingNotice();
      if (active && (loadView === "quality" ? qualitySnapshot : snapshot)) render();
    }
  }

  async function runMonitor() {
    if (running) return;
    running = true;
    render();
    try {
      await requestJson("/api/runtime-monitor/run", { method: "POST", body: "{}" });
      await loadData();
    } catch (error) {
      var page = ensurePage();
      if (page) renderError(page, error.message || "巡检失败");
    } finally {
      running = false;
      render();
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(function () {
      if (active) loadData();
    }, 30000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  function activate(view) {
    var nextView = view === "incidents" ? "incidents" : view === "quality" ? "quality" : "overview";
    if (active && activeView !== nextView && loading) cancelActiveLoad();
    if (!active || activeView !== nextView) {
      window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { hash: nextView === "incidents" ? INCIDENTS_HASH : nextView === "quality" ? QUALITY_HASH : OVERVIEW_HASH } }));
    }
    activeView = nextView;
    active = true;
    var nextHash = activeView === "incidents" ? INCIDENTS_HASH : activeView === "quality" ? QUALITY_HASH : OVERVIEW_HASH;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    document.documentElement.classList.add("legacy-runtime-monitor-view");
    var section = ensureNav();
    section?.classList.remove("collapsed");
    section?.classList.add("open");
    section?.querySelector(":scope > button")?.setAttribute("aria-expanded", "true");
    ensurePage();
    startPolling();
    if (activeView === "quality" ? !qualitySnapshot : !snapshot) loadData();
    else render();
  }

  function deactivate() {
    if (!active) return;
    cancelActiveLoad();
    active = false;
    document.documentElement.classList.remove("legacy-runtime-monitor-view");
    var page = document.getElementById(PAGE_ID);
    unmountTopology(page);
    disposeIncidentTimeline();
    removeIncidentInspectorShell();
    page?.remove();
    stopPolling();
    ensureNav();
    if (window.location.hash === OVERVIEW_HASH || window.location.hash === INCIDENTS_HASH || window.location.hash === QUALITY_HASH) {
      window.history.replaceState(window.history.state, document.title, window.location.pathname + window.location.search);
    }
  }

  function enhance() {
    scheduled = false;
    ensureNav();
    if (!active) return;
    document.documentElement.classList.add("legacy-runtime-monitor-view");
    ensurePage();
    if ((activeView === "quality" ? !qualitySnapshot : !snapshot) && !loading) loadData();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  document.addEventListener("click", function (event) {
    if (!active || !event.target || !event.target.closest) return;
    if (event.target.closest("." + NAV_CLASS) || event.target.closest(".collapsed-nav-flyout")) return;
    if (event.target.closest(".sidebar-collapse-btn, .sidebar-resize-handle, .sidebar-foot, .o2o-primary-footer")) return;
    if (event.target.closest(".sidebar .nav-group > button")) return;
    if (event.target.closest(".sidebar button")) deactivate();
  }, true);
  window.addEventListener(WORKBENCH_ROUTE_EVENT, function (event) {
    var routeHash = event.detail && event.detail.hash;
    if (routeHash === OVERVIEW_HASH || routeHash === INCIDENTS_HASH || routeHash === QUALITY_HASH) return;
    if (active) deactivate();
    else ensureNav();
  });
  document.addEventListener("click", function (event) {
    if (!event.target || !event.target.closest || event.target.closest(".runtime-monitor-select")) return;
    closeOtherTableSelects();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeOtherTableSelects();
    var page = document.getElementById(PAGE_ID);
    if (page) closeIncidentInspector(page);
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash === OVERVIEW_HASH) activate("overview");
    else if (window.location.hash === INCIDENTS_HASH) activate("incidents");
    else if (window.location.hash === QUALITY_HASH) activate("quality");
    else if (active) deactivate();
  });
  document.addEventListener("DOMContentLoaded", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  if (active) activate(activeView);
})();
