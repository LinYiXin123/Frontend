(function alertHandlingWorkbench() {
  "use strict";

  const ROOT_CLASS = "alert-workbench-root";
  const ALERT_HASH = "#alert-workbench";
  const WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  const ALERT_PROJECT_FOCUS_EVENT = "legacy-alert-workbench:focus-project";
  const levelMeta = {
    stalled: { label: "停滞", color: "#e5484d", rank: 3, slaDays: 1 },
    critical: { label: "严重", color: "#f08c1a", rank: 2, slaDays: 2 },
    warning: { label: "异常", color: "#2563eb", rank: 1, slaDays: 3 },
  };
  const handlingMeta = {
    pending: { label: "待处理", color: "#64748b" },
    handling: { label: "处置中", color: "#2563eb" },
    resolved: { label: "已闭环", color: "#16a66a" },
  };
  const alertKindMeta = {
    inactivity: "无硬性信号",
    schedule_progress: "里程碑进度",
    schedule_end: "计划逾期",
    short_task_overrun: "短任务超期",
    notification_delivery: "通知投递",
    runtime: "运行监控",
  };
  const state = {
    active: false,
    routeSelected: window.location.hash === ALERT_HASH,
    loading: false,
    error: "",
    alerts: [],
    projects: [],
    users: [],
    notifications: [],
    me: null,
    selectedId: null,
    inspectorOpen: false,
    assigneeId: null,
    assigneeQuery: "",
    assigneePickerOpen: false,
    handlingEvents: {},
    projectDetails: {},
    filters: { organization: "all", level: "all", kind: "all", status: "all", search: "", chartDate: "" },
    chartLevels: new Set(["stalled", "critical", "warning"]),
    page: 1,
    pageSize: 7,
    scatterChart: null,
    trendChart: null,
    resizeObserver: null,
    loadController: null,
    reassigning: false,
    pendingProjectId: null,
  };

  let root = document.querySelector("." + ROOT_CLASS);
  if (!root) {
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.setAttribute("aria-label", "异常处理工作台");
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function compact(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function feishuChatUrl(person) {
    if (!person || person.feishu_receive_eligible !== true) return "";
    const userId = Number(person.id);
    if (!Number.isInteger(userId) || userId < 1) return "";
    return "/api/users/" + userId + "/feishu-chat";
  }

  function icon(name, extra) {
    return "<i data-lucide='" + esc(name) + "' class='aw-icon" + (extra ? " " + esc(extra) : "") + "' aria-hidden='true'></i>";
  }

  function hydrateIcons() {
    const runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({ icons: runtime.icons, attrs: { width: 16, height: 16, "stroke-width": 1.8 } });
  }

  function navText(button) {
    if (!button) return "";
    const clone = button.cloneNode(true);
    clone.querySelectorAll("b, .simple-child-nav-icon").forEach(function (node) { node.remove(); });
    return compact(clone.textContent).replace(/\s+\d+$/, "");
  }

  function alertNavButton() {
    return Array.from(document.querySelectorAll(".sidebar button")).find(function (button) {
      return navText(button) === "异常处理";
    }) || null;
  }

  function setHash(active) {
    const next = window.location.pathname + window.location.search + (active ? ALERT_HASH : "");
    try {
      window.history.replaceState(window.history.state, document.title, next);
    } catch (_error) {
      window.location.hash = active ? ALERT_HASH : "";
    }
  }

  function syncNavigation(active) {
    const button = alertNavButton();
    if (!button) return;
    const group = button.closest(".nav-group");
    const groupButton = group ? group.querySelector(":scope > button") : null;
    button.classList.toggle("active", active);
    if (active) {
      document.querySelectorAll(".sidebar button.active").forEach(function (candidate) {
        if (candidate !== button && candidate !== groupButton) {
          candidate.classList.remove("active");
          candidate.removeAttribute("aria-current");
        }
      });
      button.setAttribute("aria-current", "page");
      button.parentElement && button.parentElement.querySelectorAll(":scope > button").forEach(function (candidate) {
        if (candidate !== button) {
          candidate.classList.remove("active");
          candidate.removeAttribute("aria-current");
        }
      });
    } else {
      button.removeAttribute("aria-current");
    }
    let badge = button.querySelector(":scope > b");
    const count = state.alerts.filter(function (item) { return item.status === "open"; }).length;
    if (!badge && count) {
      badge = document.createElement("b");
      button.appendChild(badge);
    }
    if (badge) {
      badge.textContent = String(count);
      badge.setAttribute("aria-label", count + " 条待处理预警");
      badge.hidden = count === 0;
    }
  }

  function syncSidebarBounds() {
    const sidebar = document.querySelector(".sidebar");
    const right = sidebar ? Math.max(0, Math.round(sidebar.getBoundingClientRect().right)) : 0;
    root.style.setProperty("--aw-sidebar-right", right + "px");
  }

  function legacyMain() {
    return Array.from(document.querySelectorAll("main")).find(function (candidate) {
      return !root.contains(candidate);
    }) || null;
  }

  function hideLegacyMain() {
    const main = legacyMain();
    if (!main) return;
    main.hidden = true;
    main.setAttribute("inert", "");
    main.dataset.alertWorkbenchHidden = "true";
  }

  function restoreLegacyMain() {
    document.querySelectorAll("main[data-alert-workbench-hidden='true']").forEach(function (main) {
      main.hidden = false;
      main.removeAttribute("inert");
      delete main.dataset.alertWorkbenchHidden;
    });
  }

  function dayKey(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
  }

  function todayKey() {
    return dayKey(new Date());
  }

  function formatDate(value, withTime) {
    if (!value) return "暂无";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: withTime ? "2-digit" : undefined,
      minute: withTime ? "2-digit" : undefined,
      hour12: false,
    }).format(parsed);
  }

  function projectFor(alert) {
    return state.projects.find(function (project) { return Number(project.id) === Number(alert.project_id); }) || {};
  }

  function organizationFor(alert) {
    const project = projectFor(alert);
    return compact(project.owner_user && project.owner_user.organization) || compact(project.demand_source) || "未归属";
  }

  function notificationsFor(alert) {
    return state.notifications.filter(function (notification) {
      return Number(notification.alert_id) === Number(alert.id);
    }).sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  function latestNotification(alert) {
    return notificationsFor(alert)[0] || null;
  }

  function notificationState(alert) {
    const notification = latestNotification(alert);
    if (!notification) return { key: "none", label: "未生成", color: "#94a3b8" };
    if (notification.status === "failed" || notification.status === "dead_letter") {
      return { key: "failed", label: "未触达", color: "#e5484d" };
    }
    if (notification.status === "sent") return { key: "sent", label: "已触达", color: "#16a66a" };
    if (notification.status === "dry_run") return { key: "dry_run", label: "演练", color: "#8b5cf6" };
    return { key: "pending", label: "待发送", color: "#f08c1a" };
  }

  function levelOf(alert) {
    return levelMeta[alert.level] || levelMeta.warning;
  }

  function handlingOf(alert) {
    const key = alert.status === "resolved" ? "resolved" : (alert.handling_status || "pending");
    return handlingMeta[key] || handlingMeta.pending;
  }

  function slaInfo(alert) {
    const days = levelOf(alert).slaDays;
    const start = new Date(alert.first_triggered_at || alert.created_at || Date.now()).getTime();
    const due = start + days * 86400000;
    const remainingMs = due - Date.now();
    const remainingDays = Math.ceil(Math.abs(remainingMs) / 86400000);
    return {
      due: due,
      overdue: remainingMs < 0,
      days: remainingDays,
      label: remainingMs < 0 ? "逾期 " + remainingDays + " 天" : "剩余 " + remainingDays + " 天",
    };
  }

  function priorityScore(alert) {
    const level = levelOf(alert);
    const sla = slaInfo(alert);
    const failed = notificationState(alert).key === "failed" ? 12 : 0;
    const overdue = sla.overdue ? Math.min(24, sla.days * 4) : 0;
    return level.rank * 25 + Math.min(30, Number(alert.days_inactive || 0)) + Math.min(10, Number(alert.trigger_count || 0)) + failed + overdue;
  }

  function sortedAlerts(alerts) {
    return alerts.slice().sort(function (a, b) {
      return priorityScore(b) - priorityScore(a)
        || Number(b.days_inactive || 0) - Number(a.days_inactive || 0)
        || String(b.last_triggered_at || "").localeCompare(String(a.last_triggered_at || ""));
    });
  }

  function filteredAlerts() {
    const search = compact(state.filters.search).toLowerCase();
    return sortedAlerts(state.alerts.filter(function (alert) {
      if (alert.status !== "open") return false;
      if (state.filters.organization !== "all" && organizationFor(alert) !== state.filters.organization) return false;
      if (state.filters.level !== "all" && alert.level !== state.filters.level) return false;
      if (!state.chartLevels.has(alert.level)) return false;
      if (state.filters.kind !== "all" && alert.alert_kind !== state.filters.kind) return false;
      const handling = alert.handling_status || "pending";
      if (state.filters.status !== "all" && handling !== state.filters.status) return false;
      if (state.filters.chartDate && dayKey(alert.first_triggered_at) !== state.filters.chartDate && dayKey(alert.resolved_at) !== state.filters.chartDate) return false;
      if (search) {
        const project = projectFor(alert);
        const haystack = [
          alert.project_name, alert.owner_name, alert.reason, alert.rule_key,
          project.gitlab_project_id, project.demand_source, organizationFor(alert),
        ].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    }));
  }

  function selectedAlert() {
    return state.alerts.find(function (alert) { return Number(alert.id) === Number(state.selectedId); }) || null;
  }

  function activeUsers() {
    return state.users.filter(function (user) {
      return user && user.id != null && user.lifecycle_status !== "disabled" && user.lifecycle_status !== "departed";
    });
  }

  function assigneeLabel(user) {
    return user ? compact(user.name) + " · " + compact(user.department || user.organization || "成员") : "";
  }

  function assigneeSearchText(user) {
    return compact([
      user.name, user.department, user.organization, user.username, user.email, user.feishu_user_id,
    ].filter(Boolean).join(" ")).toLowerCase();
  }

  function filteredAssignees(users) {
    const query = compact(state.assigneeQuery).toLowerCase();
    const matches = query ? users.filter(function (user) {
      return assigneeSearchText(user).includes(query);
    }) : users;
    return matches.slice(0, 18);
  }

  function resetAssigneePicker(alert) {
    const assigneeId = Number(alert && alert.assignee_user_id) || null;
    const assignee = activeUsers().find(function (user) { return Number(user.id) === assigneeId; }) || null;
    state.assigneeId = assigneeId;
    state.assigneeQuery = assignee ? assignee.name : "";
    state.assigneePickerOpen = false;
  }

  function assigneeOptionsHtml(users) {
    const matches = filteredAssignees(users);
    if (!matches.length) {
      return "<div class='aw-assignee-empty'>没有匹配的成员，可尝试姓名、部门或邮箱</div>";
    }
    return matches.map(function (user) {
      const selected = Number(user.id) === Number(state.assigneeId);
      return [
        "<button type='button' class='aw-assignee-option" + (selected ? " is-selected" : "") + "' role='option' aria-selected='" + String(selected) + "' data-action='choose-assignee' data-user-id='" + Number(user.id) + "'>",
        user.feishu_avatar_url ? "<img src='" + esc(user.feishu_avatar_url) + "' alt=''>" : "<i>" + esc(compact(user.name).slice(0, 1) || "?") + "</i>",
        "<span><b>" + esc(user.name || "未命名成员") + "</b><small>" + esc(user.department || user.organization || "成员") + "</small></span>",
        icon("Check", "aw-assignee-check"),
        "</button>",
      ].join("");
    }).join("");
  }

  function renderAssigneePicker(users) {
    const listId = "aw-assignee-listbox";
    return [
      "<label class='aw-assignee-field'><span>指派处置人</span>",
      "<div class='aw-assignee-picker" + (state.assigneePickerOpen ? " is-open" : "") + "' data-assignee-picker>",
      "<div class='aw-assignee-input-wrap'>" + icon("Search") + "<input type='search' value='" + esc(state.assigneeQuery) + "' placeholder='搜索姓名、部门或邮箱' autocomplete='off' role='combobox' aria-autocomplete='list' aria-haspopup='listbox' aria-expanded='" + String(state.assigneePickerOpen) + "' aria-controls='" + listId + "' data-assignee-search>" + icon("ChevronDown", "aw-assignee-chevron") + "</div>",
      "<div class='aw-assignee-menu' id='" + listId + "' role='listbox' aria-label='处置人搜索结果' aria-hidden='" + String(!state.assigneePickerOpen) + "' data-assignee-options>" + assigneeOptionsHtml(users) + "</div>",
      "</div></label>",
    ].join("");
  }

  function syncAssigneePicker() {
    const picker = root.querySelector("[data-assignee-picker]");
    if (!picker) return;
    picker.classList.toggle("is-open", state.assigneePickerOpen);
    const input = picker.querySelector("[data-assignee-search]");
    const menu = picker.querySelector("[data-assignee-options]");
    if (input) input.setAttribute("aria-expanded", String(state.assigneePickerOpen));
    if (menu) {
      menu.setAttribute("aria-hidden", String(!state.assigneePickerOpen));
      menu.innerHTML = assigneeOptionsHtml(activeUsers());
    }
    const startButton = root.querySelector("[data-action='start-handling']");
    if (startButton) startButton.disabled = !state.assigneeId;
    hydrateIcons();
  }

  function closeAssigneePicker() {
    if (!state.assigneePickerOpen) return;
    state.assigneePickerOpen = false;
    syncAssigneePicker();
  }

  function selectHtml(key, label, options) {
    const current = state.filters[key];
    const selected = options.find(function (option) { return String(option[0]) === String(current); }) || options[0];
    const listId = "aw-select-" + key + "-listbox";
    return [
      "<div class='aw-select aw-select-" + esc(key) + "' data-aw-select='" + esc(key) + "'>",
      "<button class='aw-select-trigger' type='button' role='combobox' aria-haspopup='listbox' aria-expanded='false' aria-controls='" + esc(listId) + "' aria-label='" + esc(label) + "，当前为" + esc(selected[1]) + "' data-aw-select-toggle='" + esc(key) + "'>",
      "<span>" + esc(label) + "</span><strong>" + esc(selected[1]) + "</strong>",
      icon("ChevronDown", "aw-select-chevron"),
      "</button>",
      "<div class='aw-select-menu' id='" + esc(listId) + "' role='listbox' aria-label='" + esc(label) + "选项' aria-hidden='true'>",
      options.map(function (option, optionIndex) {
        const isSelected = String(option[0]) === String(selected[0]);
        return "<button class='aw-select-option" + (isSelected ? " is-selected" : "") + "' id='" + esc(listId) + "-option-" + optionIndex + "' type='button' role='option' tabindex='-1' aria-selected='" + String(isSelected) + "' data-aw-select-option='" + esc(key) + "' data-value='" + esc(option[0]) + "'><span>" + esc(option[1]) + "</span>" + icon("Check", "aw-select-check") + "</button>";
      }).join(""),
      "</div></div>",
    ].join("");
  }

  function closeAlertSelectMenus(except) {
    root.querySelectorAll("[data-aw-select]").forEach(function (control) {
      if (control === except) return;
      control.classList.remove("is-open");
      control.removeAttribute("data-placement");
      control.style.removeProperty("--aw-select-menu-max-height");
      const trigger = control.querySelector("[data-aw-select-toggle]");
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-activedescendant");
      }
      const menu = control.querySelector(".aw-select-menu");
      if (menu) menu.setAttribute("aria-hidden", "true");
      control.querySelectorAll("[data-aw-select-option]").forEach(function (option) {
        option.classList.remove("is-keyboard-active");
      });
    });
  }

  function setActiveAlertSelectOption(control, option) {
    const trigger = control && control.querySelector("[data-aw-select-toggle]");
    if (!control || !trigger) return;
    control.querySelectorAll("[data-aw-select-option]").forEach(function (item) {
      item.classList.toggle("is-keyboard-active", item === option);
    });
    if (!option || !option.id) {
      trigger.removeAttribute("aria-activedescendant");
      return;
    }
    trigger.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  }

  function setAlertSelectMenuOpen(control, open, focusEdge) {
    if (!control) return;
    closeAlertSelectMenus(open ? control : null);
    control.classList.toggle("is-open", open);
    const trigger = control.querySelector("[data-aw-select-toggle]");
    const menu = control.querySelector(".aw-select-menu");
    if (trigger) trigger.setAttribute("aria-expanded", String(open));
    if (menu) menu.setAttribute("aria-hidden", String(!open));
    if (!open) {
      control.removeAttribute("data-placement");
      control.style.removeProperty("--aw-select-menu-max-height");
      setActiveAlertSelectOption(control, null);
      return;
    }
    const options = Array.from(control.querySelectorAll("[data-aw-select-option]"));
    const target = focusEdge === "last"
      ? options[options.length - 1]
      : options.find(function (option) { return option.getAttribute("aria-selected") === "true"; }) || options[0];
    setActiveAlertSelectOption(control, target);
    window.requestAnimationFrame(function () {
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const scrollRect = control.closest(".aw-scroll") && control.closest(".aw-scroll").getBoundingClientRect();
      const topBoundary = Math.max(0, scrollRect ? scrollRect.top : 0);
      const bottomBoundary = Math.min(viewportHeight, scrollRect ? scrollRect.bottom : viewportHeight);
      const roomBelow = Math.max(0, bottomBoundary - triggerRect.bottom);
      const roomAbove = Math.max(0, triggerRect.top - topBoundary);
      const usefulDownwardRoom = Math.min(menuHeight + 12, 140);
      const placement = roomBelow >= usefulDownwardRoom || roomBelow >= roomAbove ? "bottom" : "top";
      const availableRoom = placement === "top" ? roomAbove : roomBelow;
      control.dataset.placement = placement;
      control.style.setProperty("--aw-select-menu-max-height", Math.max(88, Math.min(230, availableRoom - 12)) + "px");
    });
  }

  function applyAlertSelectValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(state.filters, key)) return;
    state.filters[key] = value;
    state.page = 1;
    renderShell();
  }

  function renderHeader() {
    return [
      "<header class='aw-header'>",
      "<div><div class='aw-title-row'><h1>异常处理</h1><span class='aw-title-chip'>处置闭环</span></div>",
      "<p>统一处理项目异常，关联负责人、活动证据、预警规则、飞书通知与审计记录</p></div>",
      "<div class='aw-header-actions'>",
      "<button class='aw-secondary-button' type='button' data-action='notifications'>" + icon("BellRing") + "通知记录（" + state.notifications.length + "）</button>",
      "<button class='aw-primary-button' type='button' data-action='evaluate'>" + icon("Play") + "运行一次监控</button>",
      "</div></header>",
    ].join("");
  }

  function renderHero() {
    const open = sortedAlerts(state.alerts.filter(function (item) { return item.status === "open"; }));
    const severe = open.filter(function (item) { return item.level === "stalled" || item.level === "critical"; });
    const overdue = open.filter(function (item) { return slaInfo(item).overdue; });
    const handling = open.filter(function (item) { return item.handling_status === "handling"; });
    const top = open[0] || null;
    return [
      "<section class='aw-hero' aria-labelledby='aw-hero-title'>",
      "<div class='aw-hero-copy'><span class='aw-hero-kicker'>" + icon("ShieldAlert") + "今日风险快照</span>",
      "<h2 id='aw-hero-title'>还有 <strong>" + open.length + "</strong> 个异常等待处理</h2>",
      "<p>" + (severe.length ? severe.length + " 项为停滞或严重风险，建议优先处理已经超过处置启动时限的项目。" : "当前没有停滞或严重风险，可按队列顺序完成日常处置。") + "</p>",
      "<div class='aw-hero-actions'><button class='aw-hero-primary' type='button' data-action='focus-top-alert' " + (top ? "" : "disabled") + ">" + icon("ArrowRight") + "处理最高风险</button>",
      "<span>" + (top ? "当前优先：" + esc(top.project_name) : "当前风险已清空") + "</span></div></div>",
      "<div class='aw-hero-snapshot' aria-label='今日风险摘要'>",
      "<div class='aw-hero-snapshot-head'><span>处置态势</span>" + icon("Sparkles") + "</div>",
      "<strong>" + overdue.length + "</strong><b>项已超处置时限</b>",
      "<div class='aw-hero-snapshot-meta'><span><i class='is-red'></i>高风险 " + severe.length + "</span><span><i class='is-blue'></i>处置中 " + handling.length + "</span></div>",
      "</div></section>",
    ].join("");
  }

  function renderSummary() {
    const open = state.alerts.filter(function (item) { return item.status === "open"; });
    const severe = open.filter(function (item) { return item.level === "stalled" || item.level === "critical"; });
    const failedNotifications = state.notifications.filter(function (item) {
      return item.status === "failed" || item.status === "dead_letter";
    });
    const failedAlertIds = new Set(failedNotifications.map(function (item) { return item.alert_id; }).filter(Boolean));
    const today = open.filter(function (item) { return dayKey(item.first_triggered_at) === todayKey(); });
    const cards = [
      ["ListChecks", "is-blue", open.length, "待处理", "其中处置中 " + open.filter(function (item) { return item.handling_status === "handling"; }).length + " 条"],
      ["AlertTriangle", "is-red", severe.length, "严重 / 停滞", "需优先确认推进、暂停或归档"],
      ["BellRing", "is-teal", failedNotifications.length, "飞书未触达", "涉及 " + failedAlertIds.size + " 条预警"],
      ["CalendarClock", "is-amber", today.length, "今日新增", "按首次触发时间统计"],
    ];
    return "<section class='aw-summary' aria-label='异常处理概览'>" + cards.map(function (card) {
      return "<article class='" + card[1] + "'><div class='aw-summary-top'><span class='aw-summary-icon'>" + icon(card[0]) + "</span><b>" + card[3] + "</b></div><strong data-count='" + card[2] + "'>" + card[2] + "</strong><small>" + card[4] + "</small></article>";
    }).join("") + "</section>";
  }

  function renderFilters() {
    const organizations = Array.from(new Set(state.alerts.map(organizationFor))).filter(Boolean).sort();
    const kinds = Array.from(new Set(state.alerts.map(function (item) { return item.alert_kind; }))).filter(Boolean);
    return [
      "<section class='aw-panel aw-filter-panel'>",
      "<div class='aw-filter-heading'><div><span class='aw-section-kicker'>" + icon("SlidersHorizontal") + "筛选视图</span><b>快速定位需要行动的异常</b></div><small>筛选结果会同步更新队列与诊断图</small></div>",
      "<div class='aw-filter-grid'>",
      selectHtml("organization", "组织", [["all", "全部组织"]].concat(organizations.map(function (value) { return [value, value]; }))),
      selectHtml("level", "严重程度", [["all", "全部"], ["stalled", "停滞"], ["critical", "严重"], ["warning", "异常"]]),
      selectHtml("kind", "预警来源", [["all", "全部"]].concat(kinds.map(function (value) { return [value, alertKindMeta[value] || value]; }))),
      selectHtml("status", "处置状态", [["all", "全部"], ["pending", "待处理"], ["handling", "处置中"]]),
      "<label class='aw-search'>" + icon("Search") + "<input type='search' value='" + esc(state.filters.search) + "' placeholder='搜索项目、负责人、仓库或预警原因' aria-label='搜索预警' data-search></label>",
      "<button class='aw-reset-button' type='button' data-action='reset'>" + icon("RotateCcw") + "重置</button>",
      "</div></section>",
    ].join("");
  }

  function evidenceFor(alert) {
    const detail = state.projectDetails[alert.project_id];
    const activity = detail && Array.isArray(detail.activities) ? detail.activities[0] : null;
    if (activity) return { title: activity.title || "项目活动", at: activity.occurred_at, source: activity.source || "activity" };
    return { title: alert.last_activity_at ? "最近硬性证据" : "暂无可追溯证据", at: alert.last_activity_at, source: alert.last_activity_at ? "activity" : "none" };
  }

  function renderTable() {
    const alerts = filteredAlerts();
    const pageCount = Math.max(1, Math.ceil(alerts.length / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * state.pageSize;
    const page = alerts.slice(start, start + state.pageSize);
    const headers = [
      ["priority", "优先级"], ["project", "项目"], ["owner", "负责人"], ["severity", "严重程度"],
      ["inactive", "沉默天数"], ["feishu", "飞书触达"],
      ["status", "状态"], ["sla", "处置启动时限"], ["action", "下一步"],
    ];
    return [
      "<section class='aw-panel aw-table-panel'>",
      "<div class='aw-panel-heading'><div><span class='aw-section-kicker'>预警处置队列</span><h2>优先处理队列</h2><p>当前筛选 " + alerts.length + " 条；队列已按风险、沉默天数和处置时限自动排序</p></div>",
      state.filters.chartDate ? "<button class='aw-link-button' type='button' data-action='clear-chart-date'>清除日期联动：" + esc(state.filters.chartDate) + "</button>" : "",
      "</div>",
      "<div class='aw-table-wrap'><table class='aw-table'><thead><tr>",
      headers.map(function (header) { return "<th><span>" + esc(header[1]) + "</span></th>"; }).join(""),
      "</tr></thead><tbody>",
      page.length ? page.map(function (alert, index) {
        const project = projectFor(alert);
        const owner = project.owner_user || {};
        const level = levelOf(alert);
        const handling = handlingOf(alert);
        const notification = notificationState(alert);
        const sla = slaInfo(alert);
        const selected = Number(alert.id) === Number(state.selectedId);
        const rank = start + index + 1;
        return [
          "<tr tabindex='0' data-alert-id='" + alert.id + "' class='" + (selected ? "is-selected" : "") + "' aria-label='打开预警：" + esc(alert.project_name) + "'>",
          "<td><span class='aw-rank is-" + Math.min(rank, 4) + "'>" + rank + "</span></td>",
          "<td><button class='aw-project-link' type='button' data-action='open-project' data-project-id='" + alert.project_id + "'>" + esc(alert.project_name) + "</button><small>" + esc(project.gitlab_project_id || project.demand_source || "项目档案") + "</small></td>",
          "<td><span class='aw-person'>" + (owner.feishu_avatar_url ? "<img src='" + esc(owner.feishu_avatar_url) + "' alt=''>" : "<i>" + esc((alert.owner_name || "?").slice(0, 1)) + "</i>") + "<b>" + esc(alert.owner_name || "待补") + "</b></span></td>",
          "<td><span class='aw-status-pill' style='--tone:" + level.color + "'>" + level.label + "</span></td>",
          "<td><span class='aw-inactive-days'><strong>" + Number(alert.days_inactive || 0) + "</strong><small>天</small></span></td>",
          "<td><span class='aw-dot-label' style='--tone:" + notification.color + "'>" + notification.label + "</span></td>",
          "<td><span class='aw-status-pill' style='--tone:" + handling.color + "'>" + handling.label + "</span></td>",
          "<td><b class='" + (sla.overdue ? "is-danger" : "is-ok") + "'>" + esc(sla.label) + "</b><small>" + esc(formatDate(sla.due, true)) + "</small></td>",
          "<td><button class='aw-row-action' type='button' data-action='select-alert' data-alert-id='" + alert.id + "'>查看详情" + icon("ChevronRight") + "</button></td>",
          "</tr>",
        ].join("");
      }).join("") : "<tr><td colspan='9'><div class='aw-empty'>" + icon("CheckCircle2") + "<strong>当前筛选范围没有待处理预警</strong><span>可以重置筛选或重新评估预警规则。</span></div></td></tr>",
      "</tbody></table></div>",
      "<footer class='aw-table-footer'><span>第 " + state.page + " / " + pageCount + " 页</span><div><button type='button' data-action='page-prev' " + (state.page <= 1 ? "disabled" : "") + ">上一页</button><button type='button' data-action='page-next' " + (state.page >= pageCount ? "disabled" : "") + ">下一页</button></div></footer>",
      "</section>",
    ].join("");
  }

  function renderCharts() {
    const trend = alertTrendSnapshot();
    const latestIndex = trend.dates.length - 1;
    const latestAdded = trend.added[latestIndex] || 0;
    const latestResolved = trend.resolved[latestIndex] || 0;
    const latestNet = latestAdded - latestResolved;
    const selectedDateHint = state.filters.chartDate
      ? "已选 " + esc(state.filters.chartDate.slice(5)) + "，点击相同日期可取消"
      : "点击日期查看明细";
    return [
      "<section class='aw-chart-grid'>",
      "<article class='aw-panel aw-chart-panel'><div class='aw-panel-heading'><div><span class='aw-section-kicker'>风险诊断</span><h2>严重程度 × 沉默天数诊断</h2><p>气泡大小代表触发次数；点击气泡联动队列与详情</p></div><span class='aw-interactive-chip'>可交互</span></div>",
      "<div class='aw-scatter-chart' role='img' aria-label='严重程度与沉默天数诊断散点图'></div>",
      "<div class='aw-chart-hint'>" + icon("Info") + "图例可筛选；鼠标滚轮缩放横轴；工具栏可还原或保存视图。</div></article>",
      "<article class='aw-panel aw-chart-panel'><div class='aw-panel-heading'><div><span class='aw-section-kicker'>处置趋势</span><h2>告警趋势（近 7 天）</h2><p>蓝=当天新增，绿=当天闭环；两线表示当天发生量，不是待处理总数。</p></div><span class='aw-interactive-chip'>可交互</span></div>",
      "<div class='aw-trend-reading' aria-label='告警趋势读图说明'><span class='is-added'><i></i>新增：当天首次触发</span><span class='is-resolved'><i></i>已闭环：当天完成处置</span></div>",
      "<div class='aw-trend-summary' aria-label='近七天告警趋势摘要'><article class='is-added'><small>7 天新增</small><strong>" + trend.totalAdded + "</strong><span>条</span></article><article class='is-resolved'><small>7 天闭环</small><strong>" + trend.totalResolved + "</strong><span>条</span></article><article class='is-open'><small>当前待处理</small><strong>" + trend.openCount + "</strong><span>条</span></article></div>",
      "<div class='aw-trend-chart' role='img' aria-label='近七天告警新增与解决趋势图'></div>",
      "<div class='aw-chart-hint'>" + icon("Info") + "今天：新增 " + latestAdded + "、闭环 " + latestResolved + "，待办" + (latestNet > 0 ? "净增 " + latestNet : latestNet < 0 ? "净减少 " + Math.abs(latestNet) : "持平") + "；" + selectedDateHint + "。</div></article>",
      "</section>",
    ].join("");
  }

  function alertTrendSnapshot() {
    const dates = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      dates.push(dayKey(new Date(Date.now() - offset * 86400000)));
    }
    const added = dates.map(function (date) {
      return state.alerts.filter(function (item) { return dayKey(item.first_triggered_at) === date; }).length;
    });
    const resolved = dates.map(function (date) {
      return state.alerts.filter(function (item) { return dayKey(item.resolved_at) === date; }).length;
    });
    return {
      dates: dates,
      added: added,
      resolved: resolved,
      totalAdded: added.reduce(function (total, value) { return total + value; }, 0),
      totalResolved: resolved.reduce(function (total, value) { return total + value; }, 0),
      openCount: state.alerts.filter(function (item) { return item.status === "open"; }).length,
    };
  }

  function eventLabel(event) {
    if (event.event_type === "resolved") return "处置完成";
    if (event.event_type === "reassigned") return "处置改派";
    return "开始处置";
  }

  function alertMemberLineHtml(person, fallbackName, roleLabel) {
    const member = person || {};
    const name = compact(member.name || fallbackName || "待补");
    const avatarUrl = compact(member.feishu_avatar_url);
    const chatUrl = feishuChatUrl(member);
    const content = (avatarUrl
      ? "<img src='" + esc(avatarUrl) + "' alt='" + esc(name) + "' referrerpolicy='no-referrer'>"
      : "<i>" + esc(name.slice(0, 1) || "?") + "</i>")
      + "<div><b>" + esc(name) + "</b><small>" + esc(roleLabel) + "</small></div>"
      + (chatUrl ? "<span class='aw-member-chat-state'>飞书私聊</span>" : "");
    return chatUrl
      ? "<a class='aw-person-card aw-person-chat' href='" + esc(chatUrl) + "' target='_blank' rel='noopener noreferrer' aria-label='在飞书中与" + esc(name) + "私聊' title='打开" + esc(name) + "的飞书会话'>" + content + "</a>"
      : "<div class='aw-person-card'>" + content + "</div>";
  }

  function renderInspector() {
    const alert = selectedAlert();
    if (!alert) {
      return "<aside class='aw-inspector' aria-label='异常详情' aria-hidden='true'></aside>";
    }
    const project = projectFor(alert);
    const detail = state.projectDetails[alert.project_id] || project;
    const owner = project.owner_user || {};
    const participants = project.participant_users || [];
    const evidence = evidenceFor(alert);
    const notification = latestNotification(alert);
    const notificationStatus = notificationState(alert);
    const events = state.handlingEvents[alert.id] || [];
    const handling = handlingOf(alert);
    const level = levelOf(alert);
    const users = activeUsers();
    const recommendation = alert.level === "stalled"
      ? "先确认项目继续、暂停或归档；如继续推进，要求补充可追溯证据并给出恢复时间。"
      : alert.level === "critical"
        ? "联系负责人确认卡点、所需资源和下一次交付时间，并在 2 天内形成处置结论。"
        : "提醒负责人补充进展或说明阻塞原因，避免预警继续升级。";
    const recipientDetails = notification && Array.isArray(notification.recipients) ? notification.recipients : [];
    const recipients = recipientDetails.length
      ? recipientDetails.map(function (person) { return person.name || "接收人"; })
      : notification ? (notification.recipient_names || []) : [];
    const eligibleRecipientCount = recipientDetails.filter(function (person) {
      return person.feishu_receive_eligible === true;
    }).length;
    return [
      "<aside class='aw-inspector' aria-label='异常详情：" + esc(alert.project_name) + "' aria-hidden='" + String(!state.inspectorOpen) + "'>",
      "<div class='aw-inspector-header'><div><small>异常详情</small><h2>" + esc(alert.project_name) + "</h2><span class='aw-status-pill' style='--tone:" + level.color + "'>" + level.label + "</span><span class='aw-status-pill' style='--tone:" + handling.color + "'>" + handling.label + "</span></div><button type='button' class='aw-close-button' data-action='clear-selection' aria-label='关闭详情'>" + icon("X") + "</button></div>",
      "<div class='aw-inspector-scroll'>",
      "<section class='aw-detail-step'><span class='aw-step-index'>1</span><div><h3>项目与负责人</h3><div class='aw-person-list'>"
        + alertMemberLineHtml(owner, alert.owner_name, "项目负责人 · " + organizationFor(alert))
        + (participants.length
          ? participants.map(function (person) { return alertMemberLineHtml(person, person.name, "参与人"); }).join("")
          : "<p class='aw-no-participants'>参与人：暂无</p>")
        + "</div><button class='aw-text-button aw-project-detail-button' data-action='open-project' data-project-id='" + alert.project_id + "'>查看项目详情</button></div></section>",
      "<section class='aw-detail-step'><span class='aw-step-index'>2</span><div><h3>最新信号与触发缘由</h3><dl><div><dt>最新证据</dt><dd>" + esc(evidence.title) + "</dd></div><div><dt>时间</dt><dd>" + esc(formatDate(evidence.at, true)) + "</dd></div><div><dt>触发规则</dt><dd>" + esc(alertKindMeta[alert.alert_kind] || alert.rule_key) + " · 第 " + Number(alert.trigger_count || 0) + " 次</dd></div></dl><p class='aw-reason'>" + esc(alert.reason) + "</p></div></section>",
      "<section class='aw-detail-step'><span class='aw-step-index'>3</span><div><div class='aw-detail-heading'><h3>飞书触达结果</h3><span class='aw-dot-label' style='--tone:" + notificationStatus.color + "'>" + notificationStatus.label + "</span></div>" + (notification ? "<dl><div><dt>本预警投递</dt><dd>" + notificationsFor(alert).length + " 次</dd></div><div><dt>收件人</dt><dd>" + esc(recipients.join("、") || "未生成") + "</dd></div><div><dt>当前可接收</dt><dd>" + eligibleRecipientCount + " / " + recipients.length + "</dd></div><div><dt>最近投递</dt><dd>" + esc(formatDate(notification.sent_at || notification.last_attempt_at || notification.created_at, true)) + "</dd></div></dl>" + (notification.error ? "<p class='aw-error-note'>" + esc(notification.error) + "</p>" : "") : "<p class='aw-muted'>当前预警尚未生成飞书投递记录。</p>") + "</div></section>",
      "<section class='aw-detail-step'><span class='aw-step-index'>4</span><div><h3>建议处置行动</h3><p>" + esc(recommendation) + "</p><p class='aw-linked-note'>依据：级别 " + esc(level.label) + " · 沉默 " + Number(alert.days_inactive || 0) + " 天 · " + esc(notificationStatus.label) + "</p></div></section>",
      "<section class='aw-detail-step'><span class='aw-step-index'>5</span><div><h3>处置审计</h3>" + (events.length ? "<ol class='aw-audit-list'>" + events.slice(0, 5).map(function (event) { return "<li><b>" + esc(eventLabel(event)) + "</b><span>" + esc(event.assignee_name || event.actor_name) + " · " + esc(formatDate(event.created_at, true)) + "</span>" + (event.note ? "<p>" + esc(event.note) + "</p>" : "") + "</li>"; }).join("") + "</ol>" : "<p class='aw-muted'>尚无处置记录。开始处置后会写入审计轨迹。</p>") + "</div></section>",
      "</div>",
      "<footer class='aw-inspector-footer'>",
      alert.status === "open" && (alert.handling_status !== "handling" || state.reassigning)
        ? renderAssigneePicker(users) + "<div><button class='aw-secondary-button' type='button' data-action='clear-selection'>稍后处理</button><button class='aw-primary-button' type='button' data-action='start-handling' " + (state.assigneeId ? "" : "disabled") + ">" + icon("Play") + "开始处置</button></div>"
        : alert.status === "open"
          ? "<div class='aw-assignee-line'>" + icon("CheckCircle2") + "当前处置人：<b>" + esc(alert.assignee_name || "待补") + "</b></div><div><button class='aw-secondary-button' type='button' data-action='reassign'>改派</button><button class='aw-primary-button' type='button' data-action='show-resolve'>" + icon("Check") + "填写结论并闭环</button></div>"
          : "<div class='aw-assignee-line'>" + icon("CheckCircle2") + "已由 <b>" + esc(alert.resolved_by || alert.assignee_name || "系统") + "</b> 完成闭环</div>",
      "</footer></aside>",
    ].join("");
  }

  function renderResolveDialog() {
    const alert = selectedAlert();
    if (!alert || !root.classList.contains("is-resolving")) return "";
    return "<div class='aw-modal-backdrop'><section class='aw-modal' role='dialog' aria-modal='true' aria-label='填写处置结论'><button class='aw-modal-close' type='button' data-action='hide-resolve' aria-label='关闭'>" + icon("X") + "</button><small>处置闭环</small><h2>填写处置结论</h2><p>项目“" + esc(alert.project_name) + "”的结论将写入预警审计和项目活动记录。</p><label><span>处置结论</span><textarea data-resolution-note maxlength='500' placeholder='例如：已联系负责人，确认项目继续推进；预计 7 月 23 日补充联调证据。'></textarea></label><div><button class='aw-secondary-button' type='button' data-action='hide-resolve'>取消</button><button class='aw-primary-button' type='button' data-action='resolve' disabled>标记已处理</button></div></section></div>";
  }

  function renderShell() {
    if (!state.active) return;
    if (state.loading && !state.alerts.length) {
      root.innerHTML = "<div class='aw-app'>" + renderHeader()
        + "<main class='aw-loading-stage'><div class='aw-loading' role='status' aria-live='polite' aria-label='正在准备异常处理工作台'>"
        + "<div class='aw-loading-card'><div class='aw-loading-visual' aria-hidden='true'>" + icon("ShieldAlert") + icon("LoaderCircle", "aw-loading-spinner is-spinning") + "</div>"
        + "<span class='aw-loading-kicker'>预警中心 · 处置闭环</span><strong>正在准备异常处理工作台</strong>"
        + "<p>同步预警、项目、成员与通知记录</p><div class='aw-loading-progress' aria-hidden='true'><i></i></div>"
        + "<span class='aw-loading-meta' aria-hidden='true'>读取预警&nbsp;&nbsp;·&nbsp;&nbsp;关联项目&nbsp;&nbsp;·&nbsp;&nbsp;同步通知</span></div></div></main></div>";
      hydrateIcons();
      return;
    }
    if (state.error && !state.alerts.length) {
      root.innerHTML = renderHeader() + "<div class='aw-loading is-error'>" + icon("CircleAlert") + "<strong>异常处理数据暂时无法加载</strong><span>" + esc(state.error) + "</span><button class='aw-primary-button' data-action='reload'>重新加载</button></div>";
      hydrateIcons();
      return;
    }
    root.innerHTML = [
      "<div class='aw-app'>", renderHeader(), "<main class='aw-scroll'><div class='aw-layout'><div class='aw-content'>",
      renderHero(), renderSummary(), renderFilters(), renderTable(), renderCharts(),
      "</div></div></main>", renderInspector(), renderResolveDialog(), "</div>",
    ].join("");
    const inspectorVisible = Boolean(state.inspectorOpen && selectedAlert());
    root.classList.toggle("is-inspector-open", inspectorVisible);
    const inspector = root.querySelector(".aw-inspector");
    if (inspector) inspector.setAttribute("aria-hidden", String(!inspectorVisible));
    hydrateIcons();
    syncNavigation(true);
    window.requestAnimationFrame(mountCharts);
  }

  function renderSearchDrivenView() {
    if (!state.active) return;
    const currentTable = root.querySelector(".aw-table-panel");
    const currentCharts = root.querySelector(".aw-chart-grid");
    if (!currentTable || !currentCharts) {
      renderShell();
      return;
    }
    disposeCharts();
    currentTable.outerHTML = renderTable();
    currentCharts.outerHTML = renderCharts();
    hydrateIcons();
    syncSelectedAlertRow();
    window.requestAnimationFrame(mountCharts);
  }

  function scheduleSearchRender(delay) {
    window.clearTimeout(root.searchTimer);
    root.searchTimer = window.setTimeout(renderSearchDrivenView, delay);
  }

  function syncSelectedAlertRow() {
    root.querySelectorAll("tr[data-alert-id]").forEach(function (row) {
      row.classList.toggle("is-selected", Number(row.dataset.alertId) === Number(state.selectedId));
    });
  }

  function renderInspectorPanel(animate) {
    const current = root.querySelector(".aw-inspector");
    if (!current) {
      renderShell();
      return;
    }
    current.outerHTML = renderInspector();
    const inspector = root.querySelector(".aw-inspector");
    const inspectorVisible = Boolean(state.inspectorOpen && selectedAlert());
    root.classList.toggle("is-inspector-open", inspectorVisible);
    if (inspector) {
      inspector.setAttribute("aria-hidden", String(!inspectorVisible));
      if (inspectorVisible && animate) {
        void inspector.offsetWidth;
        inspector.classList.add("is-entering");
        inspector.addEventListener("animationend", function () {
          inspector.classList.remove("is-entering");
        }, { once: true });
      }
    }
    syncSelectedAlertRow();
    hydrateIcons();
  }

  function refreshSelectedInspector(alertId) {
    const refresh = function () {
      if (state.active && Number(state.selectedId) === Number(alertId)) renderInspectorPanel(false);
    };
    const inspector = root.querySelector(".aw-inspector.is-entering");
    if (inspector) {
      inspector.addEventListener("animationend", refresh, { once: true });
      return;
    }
    refresh();
  }

  function chartRuntime() {
    return window.ProjectOperationsECharts || null;
  }

  function disposeCharts() {
    if (state.scatterChart) state.scatterChart.dispose();
    if (state.trendChart) state.trendChart.dispose();
    state.scatterChart = null;
    state.trendChart = null;
  }

  function mountCharts() {
    if (!state.active) return;
    const echarts = chartRuntime();
    if (!echarts) return;
    disposeCharts();
    const scatterNode = root.querySelector(".aw-scatter-chart");
    const trendNode = root.querySelector(".aw-trend-chart");
    const open = filteredAlerts();
    if (scatterNode) {
      state.scatterChart = echarts.init(scatterNode, null, { renderer: "canvas" });
      const series = ["warning", "critical", "stalled"].map(function (levelKey) {
        const meta = levelMeta[levelKey];
        return {
          name: meta.label,
          type: "scatter",
          data: open.filter(function (item) { return item.level === levelKey; }).map(function (item) {
            return { value: [Number(item.days_inactive || 0), meta.rank, Number(item.trigger_count || 1)], alertId: item.id, projectName: item.project_name, score: priorityScore(item) };
          }),
          symbolSize: function (value) { return Math.max(11, Math.min(32, 8 + Math.sqrt(Number(value[2] || 1)) * 4)); },
          itemStyle: { color: meta.color, opacity: 0.82, borderColor: "#fff", borderWidth: 2, shadowBlur: 8, shadowColor: meta.color + "55" },
          emphasis: { scale: 1.18, focus: "series" },
        };
      });
      state.scatterChart.setOption({
        animationDuration: 500,
        aria: { enabled: true, description: "按严重程度和沉默天数展示当前真实预警，气泡大小代表触发次数。" },
        color: ["#2563eb", "#f08c1a", "#e5484d"],
        legend: {
          top: 4,
          left: 8,
          selectedMode: true,
          selected: {
            "停滞": state.chartLevels.has("stalled"),
            "严重": state.chartLevels.has("critical"),
            "异常": state.chartLevels.has("warning"),
          },
          textStyle: { color: "#52627a", fontSize: 10 },
        },
        grid: { left: 48, right: 18, top: 44, bottom: 44 },
        tooltip: {
          trigger: "item",
          confine: true,
          formatter: function (params) {
            const item = params.data || {};
            const value = item.value || [];
            return "<b>" + esc(item.projectName) + "</b><br>严重程度：" + esc(params.seriesName) + "<br>沉默天数：" + value[0] + " 天<br>触发次数：" + value[2] + " 次<br>处置优先分：" + item.score;
          },
        },
        toolbox: { top: 0, right: 4, feature: { dataZoom: {}, restore: {}, saveAsImage: { name: "异常诊断" } }, iconStyle: { borderColor: "#8090a7" } },
        xAxis: { type: "value", name: "沉默天数", nameTextStyle: { color: "#64748b", fontSize: 10 }, axisLabel: { color: "#7b8aa2", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf1f7" } } },
        yAxis: { type: "value", min: 0.5, max: 3.5, interval: 1, axisLabel: { color: "#7b8aa2", fontSize: 9, formatter: function (value) { return value === 3 ? "停滞" : value === 2 ? "严重" : value === 1 ? "异常" : ""; } }, splitLine: { lineStyle: { color: "#edf1f7" } } },
        dataZoom: [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false }],
        series: series,
      });
      state.scatterChart.on("click", function (params) {
        if (params.data && params.data.alertId) revealAlertInQueue(params.data.alertId);
      });
      state.scatterChart.on("legendselectchanged", function (event) {
        const reverse = { "停滞": "stalled", "严重": "critical", "异常": "warning" };
        state.chartLevels = new Set(Object.keys(event.selected).filter(function (name) { return event.selected[name]; }).map(function (name) { return reverse[name]; }));
        state.page = 1;
        renderShell();
      });
    }
    if (trendNode) {
      const trend = alertTrendSnapshot();
      const dates = trend.dates;
      const added = trend.added;
      const resolved = trend.resolved;
      state.trendChart = echarts.init(trendNode, null, { renderer: "canvas" });
      state.trendChart.setOption({
        animationDuration: 500,
        aria: { enabled: true, description: "近七天真实预警趋势。蓝线表示当天首次触发的新增预警，绿线表示当天完成闭环的预警；两条线表示每天发生量，不是待处理总数。点击日期可联动下方处置队列。" },
        color: ["#2563eb", "#16a66a"],
        legend: { top: 4, left: 8, selectedMode: true, textStyle: { color: "#52627a", fontSize: 10 } },
        grid: { left: 34, right: 14, top: 44, bottom: 38 },
        tooltip: {
          trigger: "axis",
          confine: true,
          formatter: function (params) {
            const date = params && params[0] ? params[0].axisValue : "";
            const index = dates.indexOf(date);
            const addedCount = index >= 0 ? added[index] : 0;
            const resolvedCount = index >= 0 ? resolved[index] : 0;
            const net = addedCount - resolvedCount;
            const flow = net > 0 ? "当天待处理净增 " + net + " 条" : net < 0 ? "当天待处理净减少 " + Math.abs(net) + " 条" : "当天待处理数量持平";
            return "<b>" + esc(date) + " 当天</b><br><span style='display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#2563eb'></span>新增预警：<b>" + addedCount + " 条</b><br><span style='display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#16a66a'></span>完成闭环：<b>" + resolvedCount + " 条</b><br><span style='color:#64748b'>" + flow + "</span>";
          },
        },
        toolbox: { top: 0, right: 2, feature: { dataZoom: {}, restore: {}, saveAsImage: { name: "告警趋势" } }, iconStyle: { borderColor: "#8090a7" } },
        xAxis: { type: "category", data: dates, name: "发生日期", nameTextStyle: { color: "#7b8aa2", fontSize: 9, padding: [12, 0, 0, 0] }, axisLabel: { color: "#7b8aa2", fontSize: 9, formatter: function (value) { return value.slice(5); } }, axisLine: { lineStyle: { color: "#d9e1ec" } } },
        yAxis: { type: "value", name: "条数", nameTextStyle: { color: "#7b8aa2", fontSize: 9, padding: [0, 0, 0, -8] }, minInterval: 1, axisLabel: { color: "#7b8aa2", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf1f7" } } },
        dataZoom: [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true }],
        series: [
          { name: "新增", type: "line", smooth: true, data: added, symbolSize: 7, lineStyle: { width: 2.5 }, areaStyle: { color: "rgba(37,99,235,.08)" } },
          { name: "解决", type: "line", smooth: true, data: resolved, symbolSize: 7, lineStyle: { width: 2.5 } },
        ],
      });
      state.trendChart.on("click", function (params) {
        if (!params.name) return;
        state.filters.chartDate = state.filters.chartDate === params.name ? "" : params.name;
        state.page = 1;
        renderShell();
      });
    }
    if (state.resizeObserver) state.resizeObserver.disconnect();
    state.resizeObserver = new ResizeObserver(function () {
      state.scatterChart && state.scatterChart.resize();
      state.trendChart && state.trendChart.resize();
    });
    scatterNode && state.resizeObserver.observe(scatterNode);
    trendNode && state.resizeObserver.observe(trendNode);
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, Object.assign({ credentials: "same-origin", headers: { Accept: "application/json" } }, options || {}));
    if (!response.ok) {
      let message = "请求失败（" + response.status + "）";
      try {
        const body = await response.json();
        message = body.detail && typeof body.detail === "object" ? body.detail.message || message : body.detail || message;
      } catch (_error) {}
      throw new Error(message);
    }
    return response.json();
  }

  async function loadData(force) {
    if (state.loading) return;
    state.loading = true;
    state.error = "";
    if (state.active) renderShell();
    if (state.loadController) state.loadController.abort();
    state.loadController = new AbortController();
    try {
      const results = await Promise.all([
        fetchJson("/api/alerts?status=all&scope=all", { signal: state.loadController.signal }),
        fetchJson("/api/projects?scope=all", { signal: state.loadController.signal }),
        fetchJson("/api/users", { signal: state.loadController.signal }),
        fetchJson("/api/notifications?scope=all&limit=200", { signal: state.loadController.signal }),
        fetchJson("/api/me", { signal: state.loadController.signal }),
      ]);
      state.alerts = Array.isArray(results[0]) ? results[0] : [];
      state.projects = Array.isArray(results[1]) ? results[1] : [];
      state.users = Array.isArray(results[2]) ? results[2] : [];
      state.notifications = Array.isArray(results[3]) ? results[3] : [];
      state.me = results[4] || null;
      if (!selectedAlert()) {
        state.selectedId = null;
        state.inspectorOpen = false;
      }
      if (state.inspectorOpen && state.selectedId) void loadSelectedRelations(state.selectedId, false);
      syncNavigation(true);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      state.error = error instanceof Error ? error.message : "数据加载失败";
    } finally {
      state.loading = false;
      const pendingProjectAlert = state.active ? preparePendingProjectAlert() : null;
      if (state.active) renderShell();
      finishPendingProjectAlert(pendingProjectAlert);
    }
  }

  async function loadSelectedRelations(alertId, rerender) {
    const alert = state.alerts.find(function (item) { return Number(item.id) === Number(alertId); });
    if (!alert) return;
    const tasks = [];
    if (!state.handlingEvents[alert.id]) {
      tasks.push(fetchJson("/api/alerts/" + alert.id + "/handling-events").then(function (events) { state.handlingEvents[alert.id] = events; }));
    }
    if (!state.projectDetails[alert.project_id]) {
      tasks.push(fetchJson("/api/projects/" + alert.project_id).then(function (project) { state.projectDetails[alert.project_id] = project; }));
    }
    if (!tasks.length) return;
    try {
      await Promise.all(tasks);
      if (rerender) refreshSelectedInspector(alertId);
    } catch (_error) {}
  }

  function selectAlert(alertId, scrollIntoView) {
    const nextId = Number(alertId);
    const changed = Number(state.selectedId) !== nextId;
    state.selectedId = nextId;
    state.inspectorOpen = true;
    state.reassigning = false;
    if (changed || !state.assigneeId) resetAssigneePicker(selectedAlert());
    renderInspectorPanel(true);
    void loadSelectedRelations(alertId, true);
    if (scrollIntoView) {
      window.requestAnimationFrame(function () {
        root.querySelector("tr[data-alert-id='" + Number(alertId) + "']") && root.querySelector("tr[data-alert-id='" + Number(alertId) + "']").scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  function revealAlertInQueue(alertId) {
    const alerts = filteredAlerts();
    const index = alerts.findIndex(function (alert) {
      return Number(alert.id) === Number(alertId);
    });
    if (index < 0) return false;
    state.page = Math.floor(index / state.pageSize) + 1;
    selectAlert(alertId, true);
    return true;
  }

  function resetAlertFilterState() {
    state.filters = { organization: "all", level: "all", kind: "all", status: "all", search: "", chartDate: "" };
    state.chartLevels = new Set(["stalled", "critical", "warning"]);
    state.page = 1;
  }

  function preparePendingProjectAlert() {
    const projectId = Number(state.pendingProjectId);
    if (!Number.isInteger(projectId) || projectId <= 0) return null;
    if (!state.alerts.length && !state.projects.length) return null;
    state.pendingProjectId = null;
    resetAlertFilterState();
    const candidate = sortedAlerts(state.alerts.filter(function (alert) {
      return alert.status === "open" && Number(alert.project_id) === projectId;
    }))[0] || null;
    if (!candidate) return { found: false, projectId: projectId };
    const queue = filteredAlerts();
    const index = queue.findIndex(function (alert) { return Number(alert.id) === Number(candidate.id); });
    state.page = Math.max(1, Math.floor(Math.max(0, index) / state.pageSize) + 1);
    state.selectedId = Number(candidate.id);
    state.inspectorOpen = true;
    state.reassigning = false;
    resetAssigneePicker(candidate);
    return { found: true, alertId: Number(candidate.id), projectName: candidate.project_name || "该项目" };
  }

  function finishPendingProjectAlert(result) {
    if (!result) return;
    if (!result.found) {
      showToast("该项目当前没有未闭环预警，可返回全部项目查看其他下一步动作。", "warning");
      return;
    }
    void loadSelectedRelations(result.alertId, true);
    window.requestAnimationFrame(function () {
      const row = root.querySelector("tr[data-alert-id='" + Number(result.alertId) + "']");
      if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    showToast("已为你打开“" + result.projectName + "”优先级最高的未闭环预警。", "success");
  }

  function closeInspector(restoreFocus) {
    if (!state.inspectorOpen) return;
    state.inspectorOpen = false;
    state.assigneePickerOpen = false;
    state.reassigning = false;
    root.classList.remove("is-inspector-open");
    const inspector = root.querySelector(".aw-inspector");
    if (inspector) inspector.setAttribute("aria-hidden", "true");
    if (!restoreFocus || !state.selectedId) return;
    window.requestAnimationFrame(function () {
      const row = root.querySelector("tr[data-alert-id='" + Number(state.selectedId) + "']");
      if (row) row.focus();
    });
  }

  function activate() {
    if (!state.active) window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { hash: ALERT_HASH } }));
    // The legacy renderer can replace its <main> after our first activation.
    // Re-assert the visibility/inert contract whenever the observer resyncs so
    // a late legacy render never becomes visible or keyboard-accessible.
    if (state.active) {
      syncSidebarBounds();
      hideLegacyMain();
      syncNavigation(true);
      return;
    }
    state.active = true;
    state.routeSelected = true;
    setHash(true);
    syncSidebarBounds();
    hideLegacyMain();
    root.classList.add("is-active");
    root.setAttribute("aria-hidden", "false");
    syncNavigation(true);
    const pendingProjectAlert = preparePendingProjectAlert();
    renderShell();
    finishPendingProjectAlert(pendingProjectAlert);
    if (!state.alerts.length) void loadData(false);
  }

  function deactivate() {
    if (!state.active) return;
    state.active = false;
    state.inspectorOpen = false;
    state.assigneePickerOpen = false;
    root.classList.remove("is-active", "is-resolving", "is-inspector-open");
    root.setAttribute("aria-hidden", "true");
    disposeCharts();
    restoreLegacyMain();
    syncNavigation(false);
  }

  function syncView() {
    syncSidebarBounds();
    if (window.location.hash !== ALERT_HASH) {
      state.routeSelected = false;
      deactivate();
      return;
    }
    state.routeSelected = true;
    if (!document.querySelector(".project-detail-page")) activate();
  }

  function updateAlert(updated) {
    const index = state.alerts.findIndex(function (item) { return Number(item.id) === Number(updated.id); });
    if (index >= 0) state.alerts[index] = updated;
    else state.alerts.push(updated);
    if (updated.handling_events) state.handlingEvents[updated.id] = updated.handling_events;
  }

  async function startHandling(reassign) {
    const alert = selectedAlert();
    if (!alert) return;
    const assigneeId = Number(state.assigneeId);
    if (!assigneeId) {
      showToast("请先选择处置人", "warning");
      return;
    }
    try {
      const updated = await fetchJson("/api/alerts/" + alert.id + "/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ assignee_user_id: assigneeId, note: reassign ? "在异常处理工作台改派处置人" : "在异常处理工作台开始处置" }),
      });
      updateAlert(updated);
      state.reassigning = false;
      state.assigneePickerOpen = false;
      resetAssigneePicker(updated);
      renderShell();
      showToast(reassign ? "已改派并写入处置审计" : "已开始处置并写入审计记录", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "开始处置失败", "error");
    }
  }

  async function resolveAlert() {
    const alert = selectedAlert();
    const textarea = root.querySelector("[data-resolution-note]");
    const note = compact(textarea && textarea.value);
    if (!alert || note.length < 3) {
      showToast("请填写至少 3 个字的处置结论", "warning");
      return;
    }
    try {
      const updated = await fetchJson("/api/alerts/" + alert.id + "/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ note: note }),
      });
      updateAlert(updated);
      root.classList.remove("is-resolving");
      state.inspectorOpen = false;
      state.selectedId = null;
      state.assigneeId = null;
      state.assigneeQuery = "";
      renderShell();
      showToast("预警已闭环，结论已写入审计和项目活动", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "闭环失败", "error");
    }
  }

  function showToast(message, tone) {
    let toast = root.querySelector(".aw-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "aw-toast";
      root.appendChild(toast);
    }
    toast.className = "aw-toast is-" + (tone || "info");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(root.toastTimer);
    root.toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2800);
  }

  function openProject(projectId) {
    const id = Number(projectId);
    state.routeSelected = false;
    setHash(false);
    deactivate();
    if (typeof window.__legacyOpenProject === "function") {
      window.__legacyOpenProject(id);
      window.__legacyProjectDetailReturn = { page: "projects", scope: "all" };
    }
  }

  function openNotifications() {
    const button = Array.from(document.querySelectorAll(".sidebar button")).find(function (candidate) {
      return navText(candidate) === "通知记录";
    });
    if (!button) return;
    state.routeSelected = false;
    setHash(false);
    deactivate();
    button.click();
  }

  function resetFilters() {
    resetAlertFilterState();
    renderShell();
  }

  root.addEventListener("input", function (event) {
    if (event.target.matches("[data-search]")) {
      state.filters.search = event.target.value;
      state.page = 1;
      if (event.isComposing || root.searchComposing) return;
      scheduleSearchRender(130);
    }
    if (event.target.matches("[data-resolution-note]")) {
      const button = root.querySelector("[data-action='resolve']");
      if (button) button.disabled = compact(event.target.value).length < 3;
    }
    if (event.target.matches("[data-assignee-search]")) {
      state.assigneeQuery = event.target.value;
      state.assigneePickerOpen = true;
      const selected = activeUsers().find(function (user) { return Number(user.id) === Number(state.assigneeId); });
      const query = compact(state.assigneeQuery);
      if (!selected || (query !== compact(selected.name) && query !== assigneeLabel(selected))) state.assigneeId = null;
      syncAssigneePicker();
    }
  });

  root.addEventListener("compositionstart", function (event) {
    if (!event.target.matches("[data-search]")) return;
    root.searchComposing = true;
    window.clearTimeout(root.searchTimer);
  });

  root.addEventListener("compositionend", function (event) {
    if (!event.target.matches("[data-search]")) return;
    root.searchComposing = false;
    state.filters.search = event.target.value;
    state.page = 1;
    scheduleSearchRender(1);
  });

  root.addEventListener("focusin", function (event) {
    if (!event.target.matches("[data-assignee-search]")) return;
    state.assigneePickerOpen = true;
    syncAssigneePicker();
  });

  root.addEventListener("keydown", function (event) {
    const assigneeInput = event.target.matches && event.target.matches("[data-assignee-search]") ? event.target : null;
    const assigneeOption = event.target.closest && event.target.closest("[data-action='choose-assignee']");
    if (assigneeInput && event.key === "ArrowDown") {
      event.preventDefault();
      state.assigneePickerOpen = true;
      syncAssigneePicker();
      const firstOption = root.querySelector("[data-action='choose-assignee']");
      if (firstOption) firstOption.focus();
      return;
    }
    if (assigneeOption && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const options = Array.from(root.querySelectorAll("[data-action='choose-assignee']"));
      const index = options.indexOf(assigneeOption);
      const next = event.key === "ArrowDown" ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1);
      if (options[next]) options[next].focus();
      return;
    }
    if ((assigneeInput || assigneeOption) && event.key === "Escape") {
      event.preventDefault();
      closeAssigneePicker();
      const input = root.querySelector("[data-assignee-search]");
      if (input) input.focus();
      return;
    }
    const selectControl = event.target.closest && event.target.closest("[data-aw-select]");
    if (selectControl) {
      const trigger = selectControl.querySelector("[data-aw-select-toggle]");
      const options = Array.from(selectControl.querySelectorAll("[data-aw-select-option]"));
      if (event.target === trigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        if (!selectControl.classList.contains("is-open")) {
          setAlertSelectMenuOpen(selectControl, true, event.key === "ArrowUp" ? "last" : "selected");
          return;
        }
        const activeId = trigger.getAttribute("aria-activedescendant");
        const activeIndex = Math.max(0, options.findIndex(function (option) { return option.id === activeId; }));
        const nextIndex = event.key === "ArrowDown"
          ? (activeIndex + 1) % options.length
          : (activeIndex - 1 + options.length) % options.length;
        setActiveAlertSelectOption(selectControl, options[nextIndex]);
        return;
      }
      if (event.target === trigger && selectControl.classList.contains("is-open") && (event.key === "Home" || event.key === "End")) {
        event.preventDefault();
        setActiveAlertSelectOption(selectControl, event.key === "Home" ? options[0] : options[options.length - 1]);
        return;
      }
      if (event.target === trigger && selectControl.classList.contains("is-open") && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        const activeId = trigger.getAttribute("aria-activedescendant");
        const activeOption = options.find(function (option) { return option.id === activeId; });
        if (activeOption) activeOption.click();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setAlertSelectMenuOpen(selectControl, false);
        if (trigger) trigger.focus();
        return;
      }
      if (event.key === "Tab") setAlertSelectMenuOpen(selectControl, false);
    }
    const row = event.target.closest("tr[data-alert-id]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectAlert(row.dataset.alertId, false);
    }
    if (event.key === "Escape") {
      if (root.classList.contains("is-resolving")) {
        root.classList.remove("is-resolving");
        renderShell();
      } else if (state.inspectorOpen) {
        closeInspector(true);
      }
    }
  });

  root.addEventListener("click", function (event) {
    const selectControl = event.target.closest("[data-aw-select]");
    if (!selectControl) closeAlertSelectMenus();
    const button = event.target.closest("button");
    const row = event.target.closest("tr[data-alert-id]");
    const insideInspector = event.target.closest(".aw-inspector");
    if (state.assigneePickerOpen && !event.target.closest("[data-assignee-picker]")) closeAssigneePicker();
    if (state.inspectorOpen && !insideInspector && !row) closeInspector(false);
    if (!button && row) {
      selectAlert(row.dataset.alertId, false);
      return;
    }
    if (!button) return;
    if (button.dataset.awSelectToggle) {
      setAlertSelectMenuOpen(selectControl, !selectControl.classList.contains("is-open"));
      return;
    }
    if (button.dataset.awSelectOption) {
      const key = button.dataset.awSelectOption;
      const value = button.dataset.value;
      setAlertSelectMenuOpen(selectControl, false);
      applyAlertSelectValue(key, value);
      window.requestAnimationFrame(function () {
        const nextTrigger = root.querySelector("[data-aw-select-toggle='" + key + "']");
        if (nextTrigger) nextTrigger.focus();
      });
      return;
    }
    const action = button.dataset.action;
    if (action === "choose-assignee") {
      const user = activeUsers().find(function (candidate) { return Number(candidate.id) === Number(button.dataset.userId); });
      if (!user) return;
      state.assigneeId = Number(user.id);
      state.assigneeQuery = user.name;
      state.assigneePickerOpen = false;
      syncAssigneePicker();
      const input = root.querySelector("[data-assignee-search]");
      if (input) input.value = user.name;
      return;
    }
    if (action === "select-alert") selectAlert(button.dataset.alertId, false);
    else if (action === "focus-top-alert") {
      const top = sortedAlerts(state.alerts.filter(function (alert) { return alert.status === "open"; }))[0];
      if (!top) return;
      resetAlertFilterState();
      renderShell();
      revealAlertInQueue(top.id);
    }
    else if (action === "open-project") openProject(button.dataset.projectId);
    else if (action === "notifications") openNotifications();
    else if (action === "reload") void loadData(true);
    else if (action === "evaluate") {
      button.disabled = true;
      void fetchJson("/api/alerts/evaluate", { method: "POST" }).then(function () {
        showToast("预警规则已重新评估；本操作未发送飞书通知", "success");
        return loadData(true);
      }).catch(function (error) {
        showToast(error instanceof Error ? error.message : "监控运行失败", "error");
      }).finally(function () { button.disabled = false; });
    } else if (action === "reset") resetFilters();
    else if (action === "clear-chart-date") { state.filters.chartDate = ""; state.page = 1; renderShell(); }
    else if (action === "page-prev") { state.page = Math.max(1, state.page - 1); renderShell(); }
    else if (action === "page-next") { state.page += 1; renderShell(); }
    else if (action === "clear-selection") closeInspector(true);
    else if (action === "start-handling") void startHandling(state.reassigning);
    else if (action === "reassign") {
      state.reassigning = true;
      resetAssigneePicker(selectedAlert());
      renderShell();
      window.requestAnimationFrame(function () {
        const input = root.querySelector("[data-assignee-search]");
        if (input) input.focus();
      });
    } else if (action === "show-resolve") { root.classList.add("is-resolving"); renderShell(); window.requestAnimationFrame(function () { root.querySelector("[data-resolution-note]") && root.querySelector("[data-resolution-note]").focus(); }); }
    else if (action === "hide-resolve") { root.classList.remove("is-resolving"); renderShell(); }
    else if (action === "resolve") void resolveAlert();
  }, true);

  // Capture pointer-down as well as click at `window`. The legacy navigation
  // starts its page switch before its final click in some browsers; owning both
  // phases avoids a visible transition into the retired warning view.
  function handleSidebarCapture(event) {
    if (!event.target || !event.target.closest) return;
    const sidebarButton = event.target.closest(".sidebar button");
    if (!sidebarButton) return;
    if (sidebarButton.matches(".sidebar-collapse-btn, .sidebar-resize-handle") || sidebarButton.closest(".sidebar-foot, .o2o-primary-footer")) return;
    if (sidebarButton.matches(".nav-group > button")) return;
    if (navText(sidebarButton) === "异常处理") {
      // Own this navigation before the legacy React handler runs. This prevents
      // the retired alert page from being mounted behind the new workbench.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      state.routeSelected = true;
      setHash(true);
      activate();
      return;
    }
    state.routeSelected = false;
    if (window.location.hash === ALERT_HASH) setHash(false);
    deactivate();
  }
  window.addEventListener("pointerdown", handleSidebarCapture, true);
  window.addEventListener("click", handleSidebarCapture, true);
  window.addEventListener(WORKBENCH_ROUTE_EVENT, function (event) {
    if (event.detail && event.detail.hash === ALERT_HASH) return;
    state.routeSelected = false;
    if (window.location.hash === ALERT_HASH) setHash(false);
    if (state.active) deactivate();
    else if (alertNavButton()?.classList.contains("active")) syncNavigation(false);
  });
  window.addEventListener(ALERT_PROJECT_FOCUS_EVENT, function (event) {
    const projectId = Number(event.detail && event.detail.projectId);
    if (!Number.isInteger(projectId) || projectId <= 0) return;
    state.pendingProjectId = projectId;
    if (!state.active || state.loading || (!state.alerts.length && !state.projects.length)) return;
    const pendingProjectAlert = preparePendingProjectAlert();
    renderShell();
    finishPendingProjectAlert(pendingProjectAlert);
  });

  let syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    window.requestAnimationFrame(function () {
      syncScheduled = false;
      syncView();
    });
  }

  new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-current"] });
  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener("resize", syncSidebarBounds, { passive: true });
  scheduleSync();
})();
