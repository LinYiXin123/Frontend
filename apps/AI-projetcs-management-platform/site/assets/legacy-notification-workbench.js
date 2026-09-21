(function notificationWorkbench() {
  "use strict";

  const ROOT_CLASS = "notification-workbench-root";
  const ROUTE_HASH = "#notification-workbench";
  const WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  const OTHER_TYPE_KEY = "other";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const typeMeta = {
    alert_card: { label: "项目预警", icon: "ShieldAlert", color: "#2563eb" },
    agent_private_message: { label: "智能助手消息", icon: "MessageCircle", color: "#0f9f8f" },
    daily_private_digest: { label: "个人每日提醒", icon: "FileText", color: "#7c3aed" },
    daily_report: { label: "项目日报", icon: "ListChecks", color: "#3b82f6" },
    milestone_baseline: { label: "计划确认", icon: "Flag", color: "#2563eb" },
    schedule_version_update: { label: "计划变更", icon: "CalendarClock", color: "#0f766e" },
    new_project: { label: "新增项目", icon: "Folder", color: "#f59e0b" },
    project_lifecycle: { label: "项目状态变更", icon: "Archive", color: "#ef4444" },
    runtime_incident: { label: "服务故障", icon: "CircleAlert", color: "#ef4444" },
    runtime_recovery: { label: "服务恢复", icon: "CircleCheck", color: "#16a66a" },
    other: { label: "其他消息", icon: "BellRing", color: "#64748b" },
  };
  const filterTypeMeta = {
    alert_card: { label: "项目预警（含服务故障）" },
    agent_private_message: { label: "智能助手消息" },
    daily_private_digest: { label: "个人每日提醒" },
    daily_report: { label: "项目日报" },
    milestone_baseline: { label: "计划确认" },
    schedule_version_update: { label: "计划变更" },
    new_project: { label: "新增项目" },
    project_lifecycle: { label: "项目状态变更" },
    runtime_recovery: { label: "服务恢复" },
    other: { label: "其他消息" },
  };
  const resultMeta = {
    sent: { label: "发送成功", color: "#16a66a", icon: "CircleCheck" },
    dry_run: { label: "仅记录，未发送", color: "#7c3aed", icon: "FileClock" },
    queued: { label: "等待发送", color: "#2563eb", icon: "Clock3" },
    sending: { label: "正在发送", color: "#2563eb", icon: "LoaderCircle" },
    failed: { label: "发送失败", color: "#ef4444", icon: "CircleX" },
    dead_letter: { label: "多次发送失败", color: "#e5484d", icon: "ShieldAlert" },
    failed_all: { label: "发送失败", color: "#ef4444", icon: "ShieldAlert" },
  };
  const scopeMeta = {
    project: "项目",
    global: "平台",
    user: "个人",
  };

  function pageSizeForViewport() {
    const height = Number(window.innerHeight || document.documentElement.clientHeight || 900);
    if (height >= 1500) return 16;
    if (height >= 1200) return 12;
    if (height >= 900) return 10;
    return 8;
  }

  const state = {
    active: false,
    routeSelected: window.location.hash === ROUTE_HASH,
    loading: false,
    error: "",
    notifications: [],
    total: 0,
    users: [],
    me: null,
    filters: {
      read: "all",
      result: "all",
      type: "all",
      scope: "all",
      range: "all",
      startDate: "",
      endDate: "",
      search: "",
      hour: "",
    },
    selectedId: null,
    inspectorOpen: false,
    typeChart: null,
    rhythmChart: null,
    analysisOpen: false,
    resizeObserver: null,
    loadController: null,
    busyAction: "",
    page: 1,
    pageSize: pageSizeForViewport(),
    expandedRecipientId: null,
    readReceipts: {},
    readReceiptLoading: {},
    readReceiptLastCheckedAt: {},
    readReceiptAutoSyncScheduled: false,
    inspectorFocus: "",
  };

  let root = document.querySelector("." + ROOT_CLASS);
  if (!root) {
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.setAttribute("aria-label", "消息中心");
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

  function safeUrl(value) {
    const raw = compact(value);
    if (!raw) return "";
    if (raw.startsWith("/")) return raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch (_error) {
      return "";
    }
  }

  function feishuChatUrl(person) {
    if (!person || person.feishu_receive_eligible !== true) return "";
    const userId = Number(person.id);
    if (!Number.isInteger(userId) || userId < 1) return "";
    return "/api/users/" + userId + "/feishu-chat";
  }

  function notificationGitlabUrl(item) {
    if (!item || item.delivery_type !== "new_project") return "";
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const project = payload.project && typeof payload.project === "object" ? payload.project : {};
    const directUrl = safeUrl(payload.web_url || project.gitlab_repo_url);
    if (directUrl) return directUrl;
    const baseUrl = compact(project.gitlab_base_url).replace(/\/+$/, "");
    const projectPath = compact(payload.path || project.gitlab_project_id).replace(/^\/+/, "");
    return safeUrl(baseUrl && projectPath ? baseUrl + "/" + projectPath : "");
  }

  function userForRecipient(userId) {
    const numericId = Number(userId);
    return state.users.find(function (user) {
      return Number.isFinite(numericId) && numericId > 0 && Number(user.id) === numericId;
    }) || null;
  }

  function recipientsFor(item) {
    const structuredRecipients = Array.isArray(item.recipients) ? item.recipients : [];
    const names = Array.isArray(item.recipient_names) ? item.recipient_names : [];
    const userIds = Array.isArray(item.recipient_user_ids) ? item.recipient_user_ids : [];
    const count = structuredRecipients.length || Math.max(names.length, userIds.length);
    return Array.from({ length: count }, function (_, index) {
      const recipient = structuredRecipients[index] || {};
      const userId = recipient.user_id || userIds[index] || "";
      const user = userForRecipient(userId) || {};
      const target = structuredRecipients.length ? recipient : user;
      const name = compact(recipient.name || names[index] || user.name || "接收人");
      const feishuAvatarUrl = safeUrl(user.feishu_avatar_url);
      const avatarUrl = safeUrl(user.feishu_avatar_url);
      return {
        id: user.id || userId,
        name: name,
        feishu_open_id: compact(target.feishu_open_id),
        feishu_receive_eligible: target.feishu_receive_eligible === true,
        feishuAvatarUrl: feishuAvatarUrl,
        avatarUrl: avatarUrl,
        department: compact(user.department || user.organization || ""),
      };
    });
  }

  function recipientAvatar(person, options) {
    const config = options || {};
    const avatarUrl = config.feishuOnly ? person.feishuAvatarUrl : person.avatarUrl;
    const avatarLabel = config.feishuOnly ? person.name + "的飞书头像" : person.name + "的头像";
    return "<span class='nw-recipient-avatar'>" + (avatarUrl
      ? "<img src='" + esc(avatarUrl) + "' alt='" + esc(avatarLabel) + "' referrerpolicy='no-referrer'>"
      : "<span>" + esc(person.name.slice(0, 1) || "?") + "</span>") + "</span>";
  }

  function recipientPill(person, options) {
    const config = options || {};
    const chatUrl = feishuChatUrl(person);
    const avatarOnly = Boolean(config.avatarOnly);
    const className = "nw-recipient-pill" + (avatarOnly ? " is-avatar-only" : "");
    const content = recipientAvatar(person, config) + (avatarOnly ? "" : "<strong>" + esc(person.name) + "</strong>");
    if (chatUrl) {
      return "<a class='" + className + " is-chat' role='listitem' data-recipient-chat href='" + esc(chatUrl) + "' target='_blank' rel='noopener noreferrer' aria-label='在飞书中与" + esc(person.name) + "私聊' title='打开" + esc(person.name) + "的飞书私聊'>" + content + "</a>";
    }
    return "<span class='" + className + " is-unmapped' role='listitem' aria-label='" + esc(person.name) + "，当前不可通过平台飞书私聊' title='" + esc(person.name) + "当前不可通过平台飞书私聊'>" + content + "</span>";
  }

  function recipientGroup(item, options) {
    const people = recipientsFor(item);
    const config = options || {};
    const expanded = Number(state.expandedRecipientId) === Number(item.id);
    const limit = expanded ? people.length : Math.max(1, Number(config.limit || 2));
    const visible = people.slice(0, limit);
    const remaining = Math.max(0, people.length - visible.length);
    if (!people.length) return "<span class='nw-recipient-empty'>暂无接收人</span>";
    return [
      "<div class='nw-recipient-group" + (config.dense ? " is-dense" : "") + "' role='list' aria-label='接收人，共 " + people.length + " 人'>",
        visible.map(function (person) { return recipientPill(person, config); }).join(""),
        remaining ? "<button type='button' class='nw-recipient-more' data-action='view-recipients' data-notification-id='" + Number(item.id) + "' title='查看其余 " + remaining + " 位接收人'>+" + remaining + "</button>" : "",
        config.expandable && expanded && people.length > Number(config.limit || 12) ? "<button type='button' class='nw-recipient-more' data-action='toggle-recipients' data-notification-id='" + Number(item.id) + "'>收起</button>" : "",
      "</div>",
    ].join("");
  }

  function paginationTokens(current, total) {
    const values = [];
    let previous = 0;
    for (let page = 1; page <= total; page += 1) {
      if (page !== 1 && page !== total && Math.abs(page - current) > 1) continue;
      if (previous && page - previous > 1) values.push("ellipsis-" + page);
      values.push(page);
      previous = page;
    }
    return values;
  }

  function icon(name, extra) {
    return "<i data-lucide='" + esc(name) + "' class='nw-icon" + (extra ? " " + esc(extra) : "") + "' aria-hidden='true'></i>";
  }

  function hydrateIcons() {
    const runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({ icons: runtime.icons, attrs: { width: 16, height: 16, "stroke-width": 1.85 } });
  }

  function chartRuntime() {
    return window.ProjectOperationsECharts || null;
  }

  function ensureChartRuntime() {
    if (chartRuntime()) {
      root.dataset.chartRuntime = "ready";
      return;
    }
    if (document.querySelector("script[data-notification-chart-runtime]")) return;
    root.dataset.chartRuntime = "loading";
    const script = document.createElement("script");
    script.src = "/assets/legacy-project-operations-charts.js?v=echarts-6.1.0-notification-workbench-20260720";
    script.defer = true;
    script.dataset.notificationChartRuntime = "true";
    script.addEventListener("load", function () {
      root.dataset.chartRuntime = chartRuntime() ? "ready" : "missing";
      if (state.active) window.requestAnimationFrame(initCharts);
    }, { once: true });
    script.addEventListener("error", function () {
      state.error = "通知分析图表组件加载失败，请刷新后重试";
      if (state.active) renderShell();
    }, { once: true });
    document.head.appendChild(script);
  }

  function navText(button) {
    if (!button) return "";
    const clone = button.cloneNode(true);
    clone.querySelectorAll("b, .simple-child-nav-icon").forEach(function (node) { node.remove(); });
    return compact(clone.textContent).replace(/\s+\d+$/, "");
  }

  function notificationNavButton() {
    return Array.from(document.querySelectorAll(".sidebar button")).find(function (button) {
      return navText(button) === "通知记录";
    }) || null;
  }

  function setHash(active) {
    const next = window.location.pathname + window.location.search + (active ? ROUTE_HASH : "");
    try {
      window.history.replaceState(window.history.state, document.title, next);
    } catch (_error) {
      window.location.hash = active ? ROUTE_HASH : "";
    }
  }

  function syncNavigation(active) {
    const button = notificationNavButton();
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
      if (groupButton) groupButton.classList.add("active");
      button.setAttribute("aria-current", "page");
      button.parentElement && button.parentElement.querySelectorAll(":scope > button").forEach(function (candidate) {
        if (candidate !== button) {
          candidate.classList.remove("active");
          candidate.removeAttribute("aria-current");
        }
      });
    } else {
      if (groupButton) groupButton.classList.remove("active");
      button.removeAttribute("aria-current");
    }
  }

  function syncSidebarBounds() {
    const sidebar = document.querySelector(".sidebar");
    const right = sidebar ? Math.max(0, Math.round(sidebar.getBoundingClientRect().right)) : 0;
    root.style.setProperty("--nw-sidebar-right", right + "px");
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
    main.dataset.notificationWorkbenchHidden = "true";
  }

  function restoreLegacyMain() {
    document.querySelectorAll("main[data-notification-workbench-hidden='true']").forEach(function (main) {
      main.hidden = false;
      main.removeAttribute("inert");
      delete main.dataset.notificationWorkbenchHidden;
    });
  }

  function parsedDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dayKey(value) {
    const date = value instanceof Date ? value : parsedDate(value);
    if (!date) return compact(value).slice(0, 10);
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function todayKey() {
    return dayKey(new Date());
  }

  function localParts(value) {
    const date = parsedDate(value);
    if (!date) return { day: dayKey(value), hour: 0, time: "--:--:--" };
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date).reduce(function (acc, item) {
      acc[item.type] = item.value;
      return acc;
    }, {});
    return {
      day: [parts.year, parts.month, parts.day].join("-"),
      hour: Number(parts.hour || 0) % 24,
      time: [parts.hour, parts.minute, parts.second].join(":"),
    };
  }

  function eventTime(item) {
    return item.sent_at || item.simulated_at || item.last_attempt_at || item.created_at;
  }

  function formatStamp(value) {
    if (!value) return "暂无";
    const date = parsedDate(value);
    if (!date) return esc(value);
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function weekLabel(day) {
    const date = parsedDate(day + "T12:00:00+08:00");
    if (!date) return "";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" }).format(date);
  }

  function resultKey(item) {
    if (item.status === "dry_run" || item.dry_run) return "dry_run";
    return item.status || "queued";
  }

  function typeFor(item) {
    return typeMeta[notificationTypeKey(item)];
  }

  function notificationTypeKey(item) {
    const key = compact(item && item.delivery_type);
    return key && Object.prototype.hasOwnProperty.call(typeMeta, key) ? key : OTHER_TYPE_KEY;
  }

  function notificationFilterTypeKey(item) {
    const key = notificationTypeKey(item);
    return key === "runtime_incident" ? "alert_card" : key;
  }

  function resultFor(item) {
    const key = resultKey(item);
    return resultMeta[key] || { label: compact(key) || "未知", color: "#64748b", icon: "CircleHelp" };
  }

  function readStateFor(item) {
    if (item && ["read", "unread", "unknown", "not_applicable"].includes(item.read_state)) {
      return item.read_state;
    }
    if (item && item.read_at) return "read";
    if (!item || item.dry_run || !item.feishu_message_id) return "not_applicable";
    return item.feishu_receipts_sync_status === "ok" ? "unread" : "unknown";
  }

  function readReceiptProgressFor(item) {
    const recipientTotal = Math.max(
      0,
      Number(item && item.feishu_receipt_total || 0),
      Array.isArray(item && item.recipient_user_ids) ? item.recipient_user_ids.length : 0,
      Array.isArray(item && item.recipient_names) ? item.recipient_names.length : 0,
    );
    const readCount = Math.max(
      0,
      Number(item && item.feishu_receipt_read_count || 0),
      readStateFor(item) === "read" ? 1 : 0,
    );
    return { recipientTotal: recipientTotal, readCount: Math.min(readCount, recipientTotal || readCount) };
  }

  function binaryReadStateFor(item) {
    const progress = readReceiptProgressFor(item);
    const recipientTotal = progress.recipientTotal;
    const readCount = progress.readCount;
    if (recipientTotal > 0) return readCount >= recipientTotal ? "read" : "unread";
    return readStateFor(item) === "read" ? "read" : "unread";
  }

  function readStateMeta(item) {
    const progress = readReceiptProgressFor(item);
    if (progress.recipientTotal > 0 && progress.readCount >= progress.recipientTotal) {
      return { key: "read", label: "已读", detail: "" };
    }
    if (progress.readCount > 0) {
      return { key: "partial", label: "已读人数：" + progress.readCount + "/" + progress.recipientTotal, detail: "" };
    }
    return binaryReadStateFor(item) === "read"
      ? { key: "read", label: "已读", detail: "" }
      : { key: "unread", label: "未读", detail: "" };
  }

  function alertLevel(item) {
    const title = compact(item.title);
    if (title.includes("严重") || title.includes("停滞")) return { label: title.includes("停滞") ? "停滞" : "严重", color: "#ef4444" };
    if (title.includes("异常")) return { label: "异常", color: "#f59e0b" };
    if (title.includes("提醒") || title.includes("关注")) return { label: "关注", color: "#2563eb" };
    return null;
  }

  function deliveryTypes() {
    return Object.keys(filterTypeMeta);
  }

  function currentDateFilter() {
    const startDate = validBusinessDate(state.filters.startDate);
    const endDate = validBusinessDate(state.filters.endDate);
    if (startDate && endDate && startDate <= endDate) {
      return { startDate: startDate, endDate: endDate, days: 0, cutoff: null, now: null };
    }
    const days = state.filters.range === "today" ? 1 : state.filters.range === "7" ? 7 : state.filters.range === "30" ? 30 : 0;
    if (!days) return { startDate: "", endDate: "", days: 0, cutoff: null, now: null };
    const now = parsedDate(todayKey() + "T23:59:59+08:00") || new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    cutoff.setHours(0, 0, 0, 0);
    return { startDate: "", endDate: "", days: days, cutoff: cutoff, now: now };
  }

  function notificationMatchesDateFilter(item, filter) {
    const activeFilter = filter || currentDateFilter();
    const eventDay = localParts(eventTime(item)).day;
    if (activeFilter.startDate && eventDay < activeFilter.startDate) return false;
    if (activeFilter.endDate && eventDay > activeFilter.endDate) return false;
    if (!activeFilter.days) return true;
    const date = parsedDate(eventTime(item));
    return Boolean(date && date >= activeFilter.cutoff && date <= activeFilter.now);
  }

  function visibleNotifications() {
    // 筛选和排序均由服务端完成，当前页只保留实际需要展示的记录。
    return state.notifications;
  }

  function countByResult(key) {
    return state.notifications.filter(function (item) { return resultKey(item) === key; }).length;
  }

  function selectedNotification() {
    return state.notifications.find(function (item) { return Number(item.id) === Number(state.selectedId); }) || null;
  }

  function selectMarkup(key, label, options) {
    const current = state.filters[key];
    const selected = options.find(function (option) { return String(option[0]) === String(current); }) || options[0];
    const listId = "nw-select-" + key + "-listbox";
    return [
      "<div class='nw-select nw-select-" + esc(key) + "' data-nw-select='" + esc(key) + "'>",
      "<button class='nw-select-trigger' type='button' role='combobox' aria-haspopup='listbox' aria-expanded='false' aria-controls='" + esc(listId) + "' aria-label='" + esc(label) + "，当前为" + esc(selected[1]) + "' data-nw-select-toggle='" + esc(key) + "'>",
      "<span>" + esc(label) + "</span><strong>" + esc(selected[1]) + "</strong>",
      icon("ChevronDown", "nw-select-chevron"),
      "</button>",
      "<div class='nw-select-menu' id='" + esc(listId) + "' role='listbox' aria-label='" + esc(label) + "选项' aria-hidden='true'>",
      options.map(function (option, optionIndex) {
        const isSelected = String(option[0]) === String(selected[0]);
        return "<button class='nw-select-option" + (isSelected ? " is-selected" : "") + "' id='" + esc(listId) + "-option-" + optionIndex + "' type='button' role='option' tabindex='-1' aria-selected='" + String(isSelected) + "' data-nw-select-option='" + esc(key) + "' data-value='" + esc(option[0]) + "'><span>" + esc(option[1]) + "</span>" + icon("Check", "nw-select-check") + "</button>";
      }).join(""),
      "</div></div>",
    ].join("");
  }

  function closeNotificationSelectMenus(except) {
    root.querySelectorAll("[data-nw-select]").forEach(function (control) {
      if (control === except) return;
      control.classList.remove("is-open");
      control.removeAttribute("data-placement");
      control.style.removeProperty("--nw-select-menu-max-height");
      const trigger = control.querySelector("[data-nw-select-toggle]");
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-activedescendant");
      }
      const menu = control.querySelector(".nw-select-menu");
      if (menu) menu.setAttribute("aria-hidden", "true");
      control.querySelectorAll("[data-nw-select-option]").forEach(function (option) {
        option.classList.remove("is-keyboard-active");
      });
    });
  }

  function setActiveNotificationSelectOption(control, option) {
    const trigger = control && control.querySelector("[data-nw-select-toggle]");
    if (!control || !trigger) return;
    control.querySelectorAll("[data-nw-select-option]").forEach(function (item) {
      item.classList.toggle("is-keyboard-active", item === option);
    });
    if (!option || !option.id) {
      trigger.removeAttribute("aria-activedescendant");
      return;
    }
    trigger.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  }

  function setNotificationSelectMenuOpen(control, open, focusEdge) {
    if (!control) return;
    closeNotificationSelectMenus(open ? control : null);
    control.classList.toggle("is-open", open);
    const trigger = control.querySelector("[data-nw-select-toggle]");
    const menu = control.querySelector(".nw-select-menu");
    if (trigger) trigger.setAttribute("aria-expanded", String(open));
    if (menu) menu.setAttribute("aria-hidden", String(!open));
    if (!open) {
      control.removeAttribute("data-placement");
      control.style.removeProperty("--nw-select-menu-max-height");
      setActiveNotificationSelectOption(control, null);
      return;
    }
    const options = Array.from(control.querySelectorAll("[data-nw-select-option]"));
    const target = focusEdge === "last"
      ? options[options.length - 1]
      : options.find(function (option) { return option.getAttribute("aria-selected") === "true"; }) || options[0];
    setActiveNotificationSelectOption(control, target);
    window.requestAnimationFrame(function () {
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const scroll = control.closest(".nw-scroll");
      const scrollRect = scroll && scroll.getBoundingClientRect();
      const topBoundary = Math.max(0, scrollRect ? scrollRect.top : 0);
      const bottomBoundary = Math.min(viewportHeight, scrollRect ? scrollRect.bottom : viewportHeight);
      const roomBelow = Math.max(0, bottomBoundary - triggerRect.bottom);
      const roomAbove = Math.max(0, triggerRect.top - topBoundary);
      const usefulDownwardRoom = Math.min(menuHeight + 12, 140);
      const placement = roomBelow >= usefulDownwardRoom || roomBelow >= roomAbove ? "bottom" : "top";
      const availableRoom = placement === "top" ? roomAbove : roomBelow;
      control.dataset.placement = placement;
      control.style.setProperty("--nw-select-menu-max-height", Math.max(88, Math.min(230, availableRoom - 12)) + "px");
    });
  }

  function notificationStatsQuery() {
    const params = new URLSearchParams({
      scope: "all",
      read: state.filters.read || "all",
      type: state.filters.type || "all",
      range: state.filters.range || "all",
    });
    const range = selectedNotificationDateRange();
    if (range) {
      params.set("start_date", range.startDate);
      params.set("end_date", range.endDate);
    }
    return "/api/notifications/stats?" + params.toString();
  }

  function notificationListQuery() {
    const params = new URLSearchParams({
      scope: state.filters.scope || "all",
      status: state.filters.result || "all",
      read: state.filters.read || "all",
      type: state.filters.type || "all",
      search: state.filters.search || "",
      hour: state.filters.hour || "",
      limit: String(state.pageSize),
      page: String(state.page),
    });
    const range = selectedNotificationDateRange();
    if (range) {
      params.set("start_date", range.startDate);
      params.set("end_date", range.endDate);
    }
    return "/api/notifications?" + params.toString();
  }

  async function refreshStats() {
    try {
      const stats = await fetchJson(notificationStatsQuery(), { signal: state.loadController ? state.loadController.signal : undefined });
      state.stats = stats && typeof stats === "object" ? stats : null;
      if (state.active) renderShell();
    } catch (_error) {
      // 统计刷新失败时保留上一次数字，不影响页面
    }
  }

  function applyNotificationSelectValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(state.filters, key)) return;
    state.filters[key] = value;
    state.page = 1;
    renderShell();
    void refreshStats();
    void loadData(true);
  }

  function renderSummary() {
    const stats = state.stats;
    const total = stats && typeof stats.total === "number" ? stats.total : state.notifications.length;
    const sent = stats && typeof stats.sent === "number" ? stats.sent : countByResult("sent");
    const failed = stats && typeof stats.failed === "number" ? stats.failed : countByResult("failed") + countByResult("dead_letter");
    const unread = stats && typeof stats.unread === "number" ? stats.unread : state.notifications.filter(function (item) {
      return !item.dry_run && item.feishu_message_id && binaryReadStateFor(item) === "unread";
    }).length;
    const items = [
      ["MessagesSquare", "全部消息", total, "当前账号可查看"],
      ["CheckCircle2", "发送成功", sent, "已送达飞书"],
      ["CircleAlert", "发送失败", failed, failed ? "需要管理员处理" : "当前无需处理"],
      ["MailOpen", "尚未阅读", unread, "来自飞书阅读状态"],
    ];
    return "<section class='nw-summary' aria-label='消息中心概览'>" + items.map(function (item) {
      return "<article>" +
        "<span class='nw-summary-icon'>" + icon(item[0]) + "</span>" +
        "<div><span>" + esc(item[1]) + "</span><strong data-count-value='" + Number(item[2]) + "'>" + Number(item[2]) + "</strong><small>" + esc(item[3]) + "</small></div>" +
      "</article>";
    }).join("") + "</section>";
  }

  function renderFilters() {
    const typeOptions = [["all", "全部类型"]].concat(deliveryTypes().map(function (key) { return [key, filterTypeMeta[key].label]; }));
    const chips = [];
    if (state.filters.read !== "all") chips.push(["read", "阅读状态：" + ({ read: "已读", unread: "未读" }[state.filters.read] || state.filters.read)]);
    if (state.filters.result !== "all") chips.push(["result", "发送状态：" + (resultMeta[state.filters.result] || {}).label]);
    if (state.filters.type !== "all") chips.push(["type", "类型：" + (filterTypeMeta[state.filters.type] || {}).label]);
    if (state.filters.scope !== "all") chips.push(["scope", "范围：" + scopeMeta[state.filters.scope]]);
    const dateRange = selectedNotificationDateRange();
    if (dateRange) chips.push(["date-range", "日期：" + dateRange.startDate.replaceAll("-", "/") + " 至 " + dateRange.endDate.replaceAll("-", "/")]);
    else if (state.filters.range !== "all") chips.push(["range", "日期：" + ({ today: "今天", 7: "近7天", 30: "近30天" }[state.filters.range] || state.filters.range)]);
    if (state.filters.hour !== "") chips.push(["hour", "时段：" + String(state.filters.hour).padStart(2, "0") + ":00"]);
    if (state.filters.search) chips.push(["search", "搜索：" + state.filters.search]);
    const resultCount = Number.isFinite(Number(state.total)) ? Number(state.total) : visibleNotifications().length;
    return [
      "<section class='nw-filter-panel' aria-label='消息筛选'>",
        "<div class='nw-filter-row'>",
          selectMarkup("type", "消息类型", typeOptions),
          selectMarkup("result", "发送状态", [["all", "全部状态"], ["sent", "发送成功"], ["failed_all", "发送失败"], ["dry_run", "仅记录，未发送"]]),
          selectMarkup("read", "阅读状态", [["all", "全部状态"], ["read", "已读"], ["unread", "未读"]]),
          selectMarkup("scope", "范围", [["all", "全部范围"], ["project", "项目"], ["global", "平台"], ["user", "个人"]]),
          renderNotificationDateRangePicker(),
          "<button class='nw-icon-button' type='button' data-action='reset' aria-label='重置全部筛选'>" + icon("RotateCcw") + "<span>重置</span></button>",
        "</div>",
        "<label class='nw-search'>" + icon("Search") + "<input type='search' data-search value='" + esc(state.filters.search) + "' placeholder='搜索消息、项目或接收人' /></label>",
        "<div class='nw-active-filters'>",
          "<div>" + (chips.length ? chips.map(function (chip) {
            return "<button type='button' data-action='clear-filter' data-filter-key='" + chip[0] + "'>" + esc(chip[1]) + icon("X") + "</button>";
          }).join("") : "<span>当前未添加筛选条件</span>") + "</div>",
          "<strong>当前结果 <b>" + resultCount + "</b> 条</strong>",
          chips.length ? "<button class='nw-clear-all' type='button' data-action='reset'>" + icon("Trash2") + "清空全部</button>" : "",
        "</div>",
      "</section>",
    ].join("");
  }

  function validBusinessDate(value) {
    const normalized = compact(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized <= todayKey() ? normalized : "";
  }

  function selectedNotificationDateRange() {
    const startDate = validBusinessDate(state.filters.startDate);
    const endDate = validBusinessDate(state.filters.endDate);
    return startDate && endDate && startDate <= endDate ? { startDate: startDate, endDate: endDate } : null;
  }

  function renderNotificationDateRangePicker() {
    const startDate = validBusinessDate(state.filters.startDate);
    const endDate = validBusinessDate(state.filters.endDate);
    const today = todayKey();
    return [
      "<div class='nw-date-range' aria-label='日期范围'>",
        "<span>日期范围</span>",
        "<div class='nw-date-range-picker-host' data-nw-date-range-picker>",
          "<input type='date' data-nw-start-date aria-label='起始日期' max='" + esc(today) + "' value='" + esc(startDate) + "' />",
          "<input type='date' data-nw-end-date aria-label='终止日期' max='" + esc(today) + "' value='" + esc(endDate) + "' />",
        "</div>",
      "</div>",
    ].join("");
  }

  function mountNotificationDateRangePicker() {
    const host = root.querySelector("[data-nw-date-range-picker]");
    const start = host && host.querySelector("[data-nw-start-date]");
    const end = host && host.querySelector("[data-nw-end-date]");
    const calendar = window.LegacyAntdCalendar;
    if (!host || !start || !end || !calendar || typeof calendar.mountRangePeriod !== "function") return false;
    calendar.mountRangePeriod(host, start, end, {
      mode: "custom",
      showModeSelector: false,
      className: "notification-date-range-picker",
      ariaLabel: "日期范围",
      popupContainerSelector: ".nw-filter-panel",
      onChange: function (next) {
        state.filters.startDate = validBusinessDate(next && next.start);
        state.filters.endDate = validBusinessDate(next && next.end);
        state.filters.range = "all";
        state.filters.hour = "";
        state.page = 1;
        renderShell();
        void refreshStats();
        void loadData(true);
      },
    });
    return true;
  }

  function deliveryDescription(item) {
    const key = resultKey(item);
    if (key === "sent") return "已发送至飞书";
    if (key === "dry_run") return "系统仅记录，未向成员发送";
    if (key === "queued") return "正在等待系统发送";
    if (key === "sending") return "正在发送，请稍后刷新";
    if (key === "failed" || key === "dead_letter") return "需要管理员处理";
    return "发送状态待确认";
  }

  function renderNotificationRow(item) {
    const type = typeFor(item);
    const result = resultFor(item);
    const level = alertLevel(item);
    const time = localParts(eventTime(item));
    const relatedTitle = item.project_name || (item.scope_type === "global" ? "AI创新部" : item.scope_type === "user" ? (item.delivery_type === "daily_private_digest" ? "个人每日提醒" : "个人消息") : "未关联项目");
    const relatedMeta = item.alert_id ? "预警 ALERT-" + String(item.alert_id).padStart(4, "0") : item.project_id ? "项目 PRJ-" + String(item.project_id).padStart(4, "0") : (scopeMeta[item.scope_type] || "其他") + "消息";
    const readMeta = readStateMeta(item);
    const selected = Number(state.selectedId) === Number(item.id);
    return [
      "<tr tabindex='0' data-notification-id='" + Number(item.id) + "' aria-controls='nw-notification-inspector' aria-expanded='" + String(selected && state.inspectorOpen) + "'" + (selected ? " aria-selected='true'" : "") + " class='" + (selected ? "is-selected " : "") + "is-" + readMeta.key + "'>",
        "<td class='nw-time-cell'><time>" + esc(time.time) + "</time><span class='nw-flow-dot' style='--nw-event-color:" + esc(type.color) + "'></span></td>",
        "<td><div class='nw-event-title'><span class='nw-type-icon' style='--nw-event-color:" + esc(type.color) + "'>" + icon(type.icon) + "</span><div><strong>" + esc(type.label) + "</strong>" + (level ? "<em style='--nw-level-color:" + level.color + "'>" + esc(level.label) + "</em>" : "") + "<small>" + esc(item.title || item.content || "消息记录") + "</small></div></div></td>",
        "<td><div class='nw-related'><strong>" + esc(relatedTitle) + "</strong><small>" + esc(relatedMeta) + "</small></div></td>",
        "<td>" + recipientGroup(item, { limit: 4, dense: true, avatarOnly: true, feishuOnly: true }) + "</td>",
        "<td><div class='nw-delivery-read'><div class='nw-result' style='--nw-result-color:" + esc(result.color) + "'><strong>" + icon(result.icon) + esc(result.label) + "</strong><small>" + esc(deliveryDescription(item)) + "</small></div><button type='button' class='nw-read-state is-" + readMeta.key + "' data-action='view-read-receipts' data-notification-id='" + Number(item.id) + "' aria-label='查看阅读情况，当前状态" + esc(readMeta.label) + "'><strong><span></span>" + esc(readMeta.label) + "</strong>" + (readMeta.detail ? "<small>" + esc(readMeta.detail) + "</small>" : "") + "</button></div></td>",
      "</tr>",
    ].join("");
  }

  function renderTable() {
    const rows = visibleNotifications();
    const total = Number.isFinite(Number(state.total)) ? Number(state.total) : rows.length;
    if (!rows.length) {
      return "<section class='nw-stream-panel'><div class='nw-empty'>" + icon("BellRing") + "<h2>没有符合条件的消息</h2><p>可以清空筛选条件后查看全部消息。</p><button type='button' data-action='reset'>清空筛选</button></div></section>";
    }
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const start = (state.page - 1) * state.pageSize;
    const groups = [];
    rows.forEach(function (item) {
      const key = localParts(eventTime(item)).day;
      let group = groups.find(function (entry) { return entry.day === key; });
      if (!group) {
        group = { day: key, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    return [
      "<section class='nw-stream-panel' aria-label='消息记录'>",
        "<div class='nw-table-wrap'><table class='nw-table'>",
          "<thead><tr>",
            "<th>时间</th>",
            "<th>消息内容</th>",
            "<th>关联对象</th>",
            "<th>接收人</th>",
            "<th>发送与阅读</th>",
          "</tr></thead>",
          groups.map(function (group) {
            return "<tbody><tr class='nw-day-row'><th colspan='5'>" + esc(group.day) + " <span>" + esc(weekLabel(group.day)) + "</span></th></tr>" + group.items.map(renderNotificationRow).join("") + "</tbody>";
          }).join(""),
        "</table></div>",
        "<footer class='nw-pagination'>",
          "<span>显示 " + (start + 1) + "–" + Math.min(start + rows.length, total) + " 条，共 " + total + " 条 · " + state.pageSize + " 条/页</span>",
          "<nav aria-label='消息中心分页'>",
            "<button type='button' data-action='page-prev' aria-label='上一页'" + (state.page <= 1 ? " disabled" : "") + "><span class='nw-pagination-arrow' aria-hidden='true'>‹</span></button>",
            paginationTokens(state.page, pageCount).map(function (token) {
              if (typeof token !== "number") return "<span aria-hidden='true'>…</span>";
              return "<button type='button' data-action='go-page' data-page='" + token + "'" + (token === state.page ? " class='is-current' aria-current='page'" : "") + ">" + token + "</button>";
            }).join(""),
            "<button type='button' data-action='page-next' aria-label='下一页'" + (state.page >= pageCount ? " disabled" : "") + "><span class='nw-pagination-arrow' aria-hidden='true'>›</span></button>",
          "</nav>",
        "</footer>",
      "</section>",
    ].join("");
  }

  function renderAnalytics() {
    const sent = countByResult("sent");
    const dryRun = countByResult("dry_run");
    const failed = countByResult("failed") + countByResult("dead_letter");
    return [
      "<aside class='nw-analytics' aria-label='消息数据分析'>",
        "<section class='nw-analytics-panel nw-analytics-type-panel'>",
          "<div class='nw-panel-head'><div><h2>消息类型分布</h2><span>点击图例或条目可筛选列表</span></div><div><b>可交互</b><button type='button' data-action='reset-chart' data-chart='type' aria-label='重置类型图表'>" + icon("RotateCcw") + "</button></div></div>",
          "<div class='nw-chart nw-type-chart' data-chart='type' role='img' aria-label='已发送与仅记录消息按类型分布的可交互条形图'></div>",
        "</section>",
        "<section class='nw-analytics-panel'>",
          "<div class='nw-panel-head'><div><h2>今日发送时段</h2><span>点击时段可筛选列表</span></div><button type='button' data-action='reset-chart' data-chart='rhythm' aria-label='重置时段图表'>" + icon("RotateCcw") + "</button></div>",
          "<div class='nw-chart nw-rhythm-chart' data-chart='rhythm' role='img' aria-label='今日每小时已发送与仅记录消息数量热力图'></div>",
        "</section>",
        "<section class='nw-analytics-panel nw-result-overview'>",
          "<div class='nw-panel-head'><div><h2>发送结果</h2><span>来自当前可查看的消息</span></div><button type='button' data-action='reset-result' aria-label='重置发送状态筛选'>" + icon("RotateCcw") + "</button></div>",
          "<button type='button' data-action='filter-result' data-result='sent'><span style='--nw-result-color:#16a66a'></span>发送成功<strong>" + sent + "</strong></button>",
          "<button type='button' data-action='filter-result' data-result='dry_run'><span style='--nw-result-color:#7c3aed'></span>仅记录，未发送<strong>" + dryRun + "</strong></button>",
          "<button type='button' data-action='filter-result' data-result='failed_all'><span style='--nw-result-color:#ef4444'></span>发送失败<strong>" + failed + "</strong></button>",
          "<p class='" + (failed ? "is-warning" : "") + "'>" + icon(failed ? "ShieldAlert" : "ShieldCheck") + (failed ? "有消息发送失败，请优先处理" : "当前没有发送失败的消息") + "</p>",
        "</section>",
      "</aside>",
    ].join("");
  }

  function renderAdminTools() {
    if (!state.me || state.me.role !== "admin") return "";
    return [
      "<section class='nw-admin-tools' aria-label='管理工具'>",
        "<div><span>管理工具</span><strong>仅用于检查，不会直接向成员发送消息</strong></div>",
        "<div class='nw-admin-tool-actions'>",
          "<button class='nw-secondary-button' type='button' data-action='daily-report'" + (state.busyAction ? " disabled" : "") + ">" + icon(state.busyAction === "daily-report" ? "LoaderCircle" : "CalendarDays", state.busyAction === "daily-report" ? "is-spin" : "") + "生成日报预览</button>",
          "<button class='nw-secondary-button' type='button' data-action='run-monitor'" + (state.busyAction ? " disabled" : "") + ">" + icon(state.busyAction === "run-monitor" ? "LoaderCircle" : "Play", state.busyAction === "run-monitor" ? "is-spin" : "") + "检查一次预警</button>",
        "</div>",
      "</section>",
    ].join("");
  }

  function renderSecondaryAnalysis() {
    return [
      "<details class='nw-analysis-details'" + (state.analysisOpen ? " open" : "") + ">",
        "<summary><span>" + icon("ChartNoAxesCombined") + "<strong>数据分析与管理工具</strong><small>按需查看消息分布、发送时段和安全检查工具</small></span><em>展开查看</em>" + icon("ChevronDown") + "</summary>",
        "<div class='nw-analysis-body'>" + renderAdminTools() + renderAnalytics() + "</div>",
      "</details>",
    ].join("");
  }

  function renderReadReceipts(item) {
    const receipt = state.readReceipts[Number(item.id)];
    const loading = Boolean(state.readReceiptLoading[Number(item.id)]);
    if (!receipt) {
      return "<div class='nw-read-receipts-loading'>" + icon("LoaderCircle", loading ? "is-spin" : "") + (loading ? "正在读取成员阅读状态…" : "暂无成员阅读明细") + "</div>";
    }
    const sync = receipt.sync || {};
    const recipients = Array.isArray(receipt.recipients) ? receipt.recipients : [];
    const rows = recipients.map(function (person) {
      const avatarUrl = safeUrl(person.feishu_avatar_url);
      const read = person.status === "read" && Boolean(person.read_at);
      const unread = person.status === "unread";
      const receiptLabel = read ? "已读" : "未读";
      const receiptDetail = read ? "飞书已读于 " + formatStamp(person.read_at) : unread ? "飞书返回尚未阅读" : person.status === "not_applicable" ? "未真实投递到飞书" : "暂未查询到飞书已读记录";
      return [
        "<li class='is-" + esc(person.status || "unknown") + "'>",
          "<span class='nw-receipt-avatar'>" + (avatarUrl ? "<img src='" + esc(avatarUrl) + "' alt='' referrerpolicy='no-referrer'>" : esc(String(person.name || "?").slice(0, 1))) + "</span>",
          "<div><strong>" + esc(person.name || "未映射成员") + (person.is_current_user ? " <em>当前账号</em>" : "") + "</strong><small>" + esc(receiptDetail) + "</small></div>",
          "<b>" + (read ? icon("CheckCircle2") : unread ? icon("Circle") : icon("CircleHelp")) + esc(receiptLabel) + "</b>",
        "</li>",
      ].join("");
    }).join("");
    let syncMessage = "";
    if (sync.status === "permission_required") syncMessage = "飞书应用尚未开通消息读取权限，当前不能判断谁已读或未读。";
    else if (sync.status === "failed") syncMessage = sync.error || "飞书阅读回执同步失败，请稍后重试。";
    else if (sync.status === "not_applicable") syncMessage = "该记录未真实投递到飞书，不存在飞书阅读回执。";
    return [
      syncMessage ? "<div class='nw-receipt-sync-message is-" + esc(sync.status || "failed") + "'>" + icon(sync.status === "permission_required" ? "ShieldAlert" : "CircleAlert") + "<span>" + esc(syncMessage) + "</span></div>" : "",
      "<div class='nw-receipt-summary'><strong>" + Number(receipt.read_count || 0) + " / " + Number(receipt.total || 0) + " 人飞书已读</strong><span>" + Math.max(0, Number(receipt.total || 0) - Number(receipt.read_count || 0)) + " 人未读</span></div>",
      "<ul class='nw-read-receipt-list'>" + (rows || "<li class='is-empty'>该通知没有可识别的接收人</li>") + "</ul>",
      "<small class='nw-receipt-note'>阅读状态来自飞书官方回执；打开本平台详情不会改变阅读状态。</small>",
    ].join("");
  }

  function renderInspector() {
    const item = selectedNotification();
    if (!item) return "<aside class='nw-inspector' id='nw-notification-inspector' aria-label='消息详情' aria-hidden='true' inert></aside>";
    const type = typeFor(item);
    const result = resultFor(item);
    const recipients = recipientsFor(item);
    const mappedRecipients = recipients.filter(function (person) { return Boolean(feishuChatUrl(person)); });
    const gitlabUrl = notificationGitlabUrl(item);
    const hiddenAttributes = state.inspectorOpen ? " aria-hidden='false'" : " aria-hidden='true' inert";
    return [
      "<aside class='nw-inspector' id='nw-notification-inspector' aria-label='消息详情'" + hiddenAttributes + ">",
        "<header class='nw-inspector-head'><div class='nw-inspector-title'><small>消息详情</small><h2>" + esc(type.label) + "</h2><p>发送状态：" + esc(result.label) + "</p></div><button class='nw-inspector-close' type='button' data-action='close-inspector' aria-label='关闭消息详情'>" + icon("X") + "<span>关闭</span></button></header>",
        "<div class='nw-inspector-scroll'>",
          "<section><span class='nw-step'>1</span><div><h3>消息内容</h3><strong>" + esc(item.title || "消息记录") + "</strong><p>" + esc(item.content || "暂无消息内容") + "</p>" + (gitlabUrl ? "<a class='nw-gitlab-link' href='" + esc(gitlabUrl) + "' target='_blank' rel='noopener noreferrer' aria-label='在 GitLab 中打开项目 " + esc(item.project_name || "") + "'>" + icon("Gitlab") + "打开 GitLab 项目" + icon("ExternalLink") + "</a>" : "") + "</div></section>",
          "<section><span class='nw-step'>2</span><div><h3>关联项目</h3><dl><div><dt>项目</dt><dd>" + esc(item.project_name || "未关联项目") + "</dd></div><div><dt>项目编号</dt><dd>" + (item.project_id ? "PRJ-" + String(item.project_id).padStart(4, "0") : "—") + "</dd></div><div><dt>预警编号</dt><dd>" + (item.alert_id ? "ALERT-" + String(item.alert_id).padStart(4, "0") : "—") + "</dd></div><div><dt>消息范围</dt><dd>" + esc(scopeMeta[item.scope_type] || item.scope_type) + "</dd></div></dl>" + (item.project_id ? "<button type='button' class='nw-link-button' data-action='open-project' data-project-id='" + Number(item.project_id) + "'>查看项目详情" + icon("ArrowRight") + "</button>" : "") + "</div></section>",
          "<section><span class='nw-step'>3</span><div><h3>接收人</h3>" + recipientGroup(item, { limit: 12, expandable: true }) + "<small>可通过飞书接收消息：" + mappedRecipients.length + " / " + recipients.length + " 人。</small></div></section>",
          "<section><span class='nw-step'>4</span><div><h3>发送情况</h3><strong class='nw-inspector-result' style='--nw-result-color:" + esc(result.color) + "'>" + icon(result.icon) + esc(result.label) + "</strong><p class='nw-delivery-description'>" + esc(deliveryDescription(item)) + "</p><dl><div><dt>生成时间</dt><dd>" + esc(formatStamp(item.created_at)) + "</dd></div><div><dt>发送时间</dt><dd>" + esc(formatStamp(item.sent_at || item.simulated_at)) + "</dd></div></dl>" + (item.error ? "<p class='nw-error'>发送失败，请稍后重试；如持续失败，请联系系统维护人员。</p>" : "") + "<details class='nw-technical-details'><summary>查看技术信息</summary><dl><div><dt>记录编号</dt><dd>#" + Number(item.id) + "</dd></div><div><dt>尝试次数</dt><dd>" + Number(item.attempt_count || 0) + "</dd></div><div><dt>飞书消息标识</dt><dd>" + esc(item.feishu_message_id || "—") + "</dd></div>" + (item.error ? "<div><dt>失败原因</dt><dd>" + esc(item.error) + "</dd></div>" : "") + "</dl></details></div></section>",
          "<section class='nw-read-receipts-step" + (state.inspectorFocus === "reads" ? " is-focused" : "") + "' data-inspector-section='reads'><span class='nw-step'>5</span><div><div class='nw-receipt-title'><h3>阅读情况</h3><button type='button' data-action='refresh-read-receipts' data-notification-id='" + Number(item.id) + "'" + (state.readReceiptLoading[Number(item.id)] ? " disabled" : "") + ">" + icon(state.readReceiptLoading[Number(item.id)] ? "LoaderCircle" : "RefreshCw", state.readReceiptLoading[Number(item.id)] ? "is-spin" : "") + "刷新状态</button></div>" + renderReadReceipts(item) + "</div></section>",
        "</div>",
        "<footer><span>" + (state.readReceiptLoading[Number(item.id)] ? icon("LoaderCircle", "is-spin") + "正在向飞书查询真实阅读回执" : readStateFor(item) === "read" ? icon("CheckCircle2") + "已展示飞书返回的真实已读时间" : icon("Info") + "打开详情不会自动标记已读") + "</span></footer>",
      "</aside>",
    ].join("");
  }

  function renderHeader() {
    return [
      "<header class='nw-header'><div><div class='nw-title-row'><h1>消息中心</h1></div><p>查看哪些消息已发送、谁还没读，以及哪些发送失败需要处理。</p></div></header>",
    ].join("");
  }

  function renderLoading() {
    return [
      "<main class='nw-loading-stage'><div class='nw-loading' role='status' aria-live='polite' aria-label='正在准备消息中心'>",
      "<div class='nw-loading-card'><div class='nw-loading-visual'>" + icon("BellRing") + icon("LoaderCircle", "nw-loading-spinner is-spin") + "</div>",
      "<span class='nw-loading-kicker'>消息中心</span><strong>正在整理消息</strong>",
      "<p>正在汇总发送结果和成员阅读状态</p><div class='nw-loading-progress' aria-hidden='true'><i></i></div>",
      "<span class='nw-loading-meta' aria-hidden='true'>读取消息&nbsp;&nbsp;·&nbsp;&nbsp;关联接收人&nbsp;&nbsp;·&nbsp;&nbsp;汇总阅读状态</span></div></div></main>",
    ].join("");
  }

  function renderShell() {
    disposeCharts();
    if (state.loading && !state.notifications.length) {
      root.innerHTML = "<div class='nw-app'>" + renderHeader() + renderLoading() + "<div class='nw-toast' hidden></div></div>";
      hydrateIcons();
      return;
    }
    root.classList.toggle("is-inspector-open", state.inspectorOpen && Boolean(selectedNotification()));
    root.innerHTML = [
      "<div class='nw-app'>",
        renderHeader(),
        "<main class='nw-scroll'>",
          state.error ? "<div class='nw-alert'>" + icon("CircleAlert") + "<span>" + esc(state.error) + "</span><button type='button' data-action='reload'>重新加载</button></div>" : "",
          renderSummary(),
          renderFilters(),
          "<div class='nw-layout'>" + renderTable() + "</div>",
          renderSecondaryAnalysis(),
        "</main>",
        renderInspector(),
        "<div class='nw-toast' hidden></div>",
      "</div>",
    ].join("");
    hydrateIcons();
    if (!mountNotificationDateRangePicker()) {
      window.setTimeout(mountNotificationDateRangePicker, 0);
    }
    const analysisDetails = root.querySelector(".nw-analysis-details");
    if (analysisDetails) {
      analysisDetails.addEventListener("toggle", function () {
        state.analysisOpen = analysisDetails.open;
        if (analysisDetails.open) window.requestAnimationFrame(initCharts);
        else disposeCharts();
      });
    }
    if (state.active && state.analysisOpen) window.requestAnimationFrame(initCharts);
    scheduleVisibleReadReceiptSync();
  }

  function renderTimelineOnly() {
    const panel = root.querySelector(".nw-stream-panel");
    if (!panel) return renderShell();
    const main = root.querySelector(".nw-scroll");
    const mainScrollTop = main ? main.scrollTop : 0;
    const tableWrap = panel.querySelector(".nw-table-wrap");
    const tableScrollLeft = tableWrap ? tableWrap.scrollLeft : 0;
    panel.outerHTML = renderTable();
    const nextMain = root.querySelector(".nw-scroll");
    const nextTableWrap = root.querySelector(".nw-stream-panel .nw-table-wrap");
    if (nextMain) nextMain.scrollTop = mainScrollTop;
    if (nextTableWrap) nextTableWrap.scrollLeft = tableScrollLeft;
    hydrateIcons();
    scheduleVisibleReadReceiptSync();
  }

  function renderSearchDrivenView() {
    if (state.active) void loadData(true);
  }

  function scheduleSearchRender(delay) {
    window.clearTimeout(root.searchTimer);
    root.searchTimer = window.setTimeout(renderSearchDrivenView, Number(delay) || 140);
  }

  function renderNotificationRowOnly(notificationId) {
    const item = state.notifications.find(function (entry) { return Number(entry.id) === Number(notificationId); });
    const row = root.querySelector("tr[data-notification-id='" + Number(notificationId) + "']");
    if (!item || !row) return;
    row.outerHTML = renderNotificationRow(item);
    hydrateIcons();
  }

  function syncSelectedRow() {
    root.querySelectorAll("tr[data-notification-id]").forEach(function (row) {
      const selected = Number(row.dataset.notificationId) === Number(state.selectedId);
      row.classList.toggle("is-selected", selected);
      if (selected) row.setAttribute("aria-selected", "true");
      else row.removeAttribute("aria-selected");
      row.setAttribute("aria-expanded", String(selected && state.inspectorOpen));
    });
  }

  function syncInspector() {
    const appNode = root.querySelector(".nw-app");
    if (!appNode) return;
    const markup = renderInspector();
    const existing = appNode.querySelector(":scope > .nw-inspector");
    const template = document.createElement("template");
    template.innerHTML = markup;
    const next = template.content.querySelector(".nw-inspector");
    if (existing && next) {
      const scroll = existing.querySelector(".nw-inspector-scroll");
      const scrollTop = scroll ? scroll.scrollTop : 0;
      existing.innerHTML = next.innerHTML;
      existing.className = next.className;
      existing.setAttribute("aria-hidden", next.getAttribute("aria-hidden") || "true");
      if (next.hasAttribute("inert")) existing.setAttribute("inert", "");
      else existing.removeAttribute("inert");
      const updatedScroll = existing.querySelector(".nw-inspector-scroll");
      if (updatedScroll) updatedScroll.scrollTop = scrollTop;
    } else {
      const toast = appNode.querySelector(":scope > .nw-toast");
      appNode.insertBefore(template.content, toast || null);
    }
    hydrateIcons();
    if (state.inspectorFocus === "reads") {
      window.requestAnimationFrame(function () {
        const inspectorScroll = root.querySelector(".nw-inspector-scroll");
        const section = root.querySelector("[data-inspector-section='reads']");
        if (inspectorScroll && section) {
          inspectorScroll.scrollTo({ top: Math.max(0, section.offsetTop - 72), behavior: "smooth" });
        }
      });
    }
  }

  function closeInspector(restoreFocus) {
    const wasOpen = state.inspectorOpen;
    const inspector = root.querySelector(".nw-inspector");
    state.inspectorOpen = false;
    state.expandedRecipientId = null;
    state.inspectorFocus = "";
    root.classList.remove("is-inspector-open");
    if (inspector) {
      inspector.classList.remove("is-entering");
      inspector.setAttribute("aria-hidden", "true");
      inspector.setAttribute("inert", "");
    }
    syncSelectedRow();
    if (!wasOpen || !restoreFocus || !state.selectedId) return;
    window.requestAnimationFrame(function () {
      const row = root.querySelector("tr[data-notification-id='" + Number(state.selectedId) + "']");
      if (row) row.focus();
    });
  }

  function openInspectorWithMotion() {
    root.classList.add("is-inspector-open");
    const inspector = root.querySelector(".nw-inspector");
    if (!inspector) return;
    inspector.setAttribute("aria-hidden", "false");
    inspector.removeAttribute("inert");
    syncSelectedRow();
    if (reduceMotion.matches) return;
    inspector.classList.remove("is-entering");
    void inspector.offsetWidth;
    inspector.classList.add("is-entering");
    inspector.addEventListener("animationend", function () {
      inspector.classList.remove("is-entering");
    }, { once: true });
  }

  function typeChartData() {
    const dateFilter = currentDateFilter();
    const dateFilteredNotifications = state.notifications.filter(function (item) {
      return notificationMatchesDateFilter(item, dateFilter);
    });
    return deliveryTypes().map(function (key) {
      const items = dateFilteredNotifications.filter(function (item) { return notificationFilterTypeKey(item) === key; });
      return {
        key: key,
        label: filterTypeMeta[key].label,
        sent: items.filter(function (item) { return resultKey(item) === "sent"; }).length,
        dryRun: items.filter(function (item) { return resultKey(item) === "dry_run"; }).length,
      };
    }).sort(function (a, b) { return (b.sent + b.dryRun) - (a.sent + a.dryRun); });
  }

  function initTypeChart() {
    const echarts = chartRuntime();
    const node = root.querySelector(".nw-chart[data-chart='type']");
    if (!echarts || !node) return;
    const data = typeChartData();
    state.typeChart = echarts.init(node, null, { renderer: "canvas" });
    state.typeChart.setOption({
      animationDuration: 520,
      animationEasing: "cubicOut",
      aria: { enabled: true, description: "按消息类型展示已发送与仅记录数量，图例和条目均可联动筛选消息列表。" },
      color: ["#2563eb", "#37b8c8"],
      grid: { left: 88, right: 14, top: 34, bottom: 18 },
      legend: { top: 0, left: 88, itemWidth: 8, itemHeight: 8, textStyle: { color: "#52627a", fontSize: 10 } },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: "rgba(15,23,42,.94)",
        textStyle: { color: "#fff", fontSize: 11 },
        formatter: function (params) {
          const datum = data[params[0].dataIndex];
          return "<strong>" + esc(datum.label) + "</strong><br/>已发送 " + datum.sent + "<br/>仅记录 " + datum.dryRun + "<br/><span style='color:#93c5fd'>点击筛选该类型</span>";
        },
      },
      xAxis: { type: "value", axisLabel: { color: "#8a98ad", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf1f7" } } },
      yAxis: { type: "category", inverse: true, data: data.map(function (item) { return item.label; }), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#43516a", fontSize: 10, width: 78, overflow: "truncate" } },
      dataZoom: [{ type: "inside", yAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true, start: 0, end: 100 }],
      series: [
        { name: "已发送", type: "bar", stack: "total", barWidth: 12, emphasis: { focus: "series" }, data: data.map(function (item) { return { value: item.sent, itemStyle: { opacity: state.filters.type === "all" || state.filters.type === item.key ? 1 : .3 } }; }) },
        { name: "仅记录", type: "bar", stack: "total", barWidth: 12, emphasis: { focus: "series" }, data: data.map(function (item) { return { value: item.dryRun, itemStyle: { opacity: state.filters.type === "all" || state.filters.type === item.key ? 1 : .3 } }; }) },
      ],
    });
    state.typeChart.on("click", function (params) {
      if (params.componentType !== "series") return;
      const datum = data[params.dataIndex];
      if (!datum) return;
      state.filters.type = state.filters.type === datum.key ? "all" : datum.key;
      state.filters.result = params.seriesName === "仅记录" ? "dry_run" : params.seriesName === "已发送" ? "sent" : state.filters.result;
      state.page = 1;
      renderShell();
    });
    state.typeChart.on("legendselectchanged", function (params) {
      const real = params.selected["已发送"];
      const drill = params.selected["仅记录"];
      state.filters.result = real && !drill ? "sent" : drill && !real ? "dry_run" : "all";
      state.page = 1;
      renderShell();
    });
  }

  function initRhythmChart() {
    const echarts = chartRuntime();
    const node = root.querySelector(".nw-chart[data-chart='rhythm']");
    if (!echarts || !node) return;
    const today = todayKey();
    const hours = Array.from({ length: 24 }, function (_, index) { return index; });
    const series = ["sent", "dry_run"].map(function (key, row) {
      return hours.map(function (hour) {
        const count = state.notifications.filter(function (item) {
          const local = localParts(eventTime(item));
          return local.day === today && local.hour === hour && resultKey(item) === key;
        }).length;
        return [hour, row, count];
      });
    });
    const max = Math.max(1, ...series[0].concat(series[1]).map(function (item) { return item[2]; }));
    state.rhythmChart = echarts.init(node, null, { renderer: "canvas" });
    state.rhythmChart.setOption({
      animationDuration: 500,
      aria: { enabled: true, description: "展示今天二十四小时内已发送与仅记录的消息数量，支持滚轮缩放和点击时段筛选。" },
      grid: { left: 68, right: 10, top: 8, bottom: 28 },
      tooltip: {
        position: "top",
        borderWidth: 0,
        backgroundColor: "rgba(15,23,42,.94)",
        textStyle: { color: "#fff", fontSize: 11 },
        formatter: function (params) {
          return String(params.value[0]).padStart(2, "0") + ":00<br/>" + (params.value[1] === 0 ? "已发送" : "仅记录") + " " + params.value[2] + " 条<br/><span style='color:#93c5fd'>点击筛选此时段</span>";
        },
      },
      xAxis: { type: "category", data: hours.map(function (hour) { return String(hour).padStart(2, "0"); }), axisLine: { lineStyle: { color: "#dbe3ef" } }, axisTick: { show: false }, axisLabel: { interval: 2, color: "#718096", fontSize: 8 } },
      yAxis: { type: "category", data: ["已发送", "仅记录"], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#52627a", fontSize: 9 } },
      visualMap: { show: false, min: 0, max: max, inRange: { color: ["#edf4ff", "#a9cdfb", "#2563eb"] } },
      dataZoom: [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true, start: 0, end: 100 }],
      series: [{ type: "heatmap", data: series[0].concat(series[1]), emphasis: { itemStyle: { borderColor: "#0f172a", borderWidth: 1, shadowBlur: 6, shadowColor: "rgba(37,99,235,.25)" } }, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 2 } }],
    });
    state.rhythmChart.on("click", function (params) {
      state.filters.startDate = todayKey();
      state.filters.endDate = todayKey();
      state.filters.range = "all";
      state.filters.hour = String(params.value[0]);
      state.page = 1;
      renderShell();
      void refreshStats();
      void loadData(true);
    });
  }

  function initCharts() {
    const analysisDetails = root.querySelector(".nw-analysis-details");
    if (!analysisDetails || !analysisDetails.open) return;
    root.dataset.chartInit = "called";
    if (!chartRuntime()) {
      root.dataset.chartInit = "waiting";
      ensureChartRuntime();
      return;
    }
    initTypeChart();
    initRhythmChart();
    root.dataset.chartInit = "ready";
    if (state.resizeObserver) state.resizeObserver.disconnect();
    state.resizeObserver = new ResizeObserver(function () {
      state.typeChart && state.typeChart.resize();
      state.rhythmChart && state.rhythmChart.resize();
    });
    root.querySelectorAll(".nw-chart").forEach(function (node) { state.resizeObserver.observe(node); });
  }

  function disposeCharts() {
    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
      state.resizeObserver = null;
    }
    ["typeChart", "rhythmChart"].forEach(function (key) {
      if (state[key]) {
        state[key].dispose();
        state[key] = null;
      }
    });
  }

  function dataSignature(notifications, me, users) {
    return JSON.stringify([
      Array.isArray(notifications) ? notifications : [],
      me || null,
      Array.isArray(users) ? users : [],
    ]);
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
    const previousSignature = dataSignature(state.notifications, state.me, state.users);
    const hadError = Boolean(state.error);
    state.loading = true;
    state.error = "";
    const showedLoading = state.active && (!force || !state.notifications.length);
    let shouldRender = hadError || !root.querySelector(":scope > .nw-app");
    if (showedLoading) {
      shouldRender = true;
      renderShell();
    }
    if (state.loadController) state.loadController.abort();
    state.loadController = new AbortController();
    try {
      const results = await Promise.all([
        fetchJson(notificationListQuery(), { signal: state.loadController.signal }),
        fetchJson("/api/me", { signal: state.loadController.signal }),
        fetchJson("/api/users", { signal: state.loadController.signal }),
      ]);
      const pagePayload = results[0] && typeof results[0] === "object" && !Array.isArray(results[0]) ? results[0] : null;
      const nextNotifications = pagePayload && Array.isArray(pagePayload.items)
        ? pagePayload.items
        : Array.isArray(results[0]) ? results[0] : [];
      const nextTotal = pagePayload && Number.isFinite(Number(pagePayload.total))
        ? Number(pagePayload.total)
        : nextNotifications.length;
      const nextMe = results[1] || null;
      const nextUsers = Array.isArray(results[2]) ? results[2] : [];
      let nextStats = null;
      try {
        const statsPayload = await fetchJson(notificationStatsQuery(), { signal: state.loadController.signal });
        nextStats = statsPayload && typeof statsPayload === "object" ? statsPayload : null;
      } catch (_statsError) {
        // 统计不可用时列表照常展示，统计卡回退到列表条数
      }
      const statsChanged = JSON.stringify(nextStats) !== JSON.stringify(state.stats);
      const dataChanged = dataSignature(nextNotifications, nextMe, nextUsers) !== previousSignature;
      const totalChanged = nextTotal !== state.total;
      state.notifications = nextNotifications;
      state.total = nextTotal;
      state.me = nextMe;
      state.users = nextUsers;
      state.stats = nextStats;
      shouldRender = shouldRender || dataChanged || totalChanged || statsChanged;
      if (!selectedNotification()) {
        state.selectedId = null;
        state.inspectorOpen = false;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
      state.error = error instanceof Error ? error.message : "消息加载失败";
      shouldRender = true;
    } finally {
      state.loading = false;
      if (state.active && shouldRender) renderShell();
    }
  }

  function resetFilters() {
    state.filters = { read: "all", result: "all", type: "all", scope: "all", range: "all", date: "", startDate: "", endDate: "", search: "", hour: "" };
    state.page = 1;
    renderShell();
    void refreshStats();
    void loadData(true);
  }

  function showToast(message, tone) {
    let toast = root.querySelector(".nw-toast");
    if (!toast) return;
    toast.className = "nw-toast is-" + (tone || "info");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(root.toastTimer);
    root.toastTimer = window.setTimeout(function () { toast.hidden = true; }, 3000);
  }

  function applyReadReceiptToNotification(notificationId, receipt) {
    const index = state.notifications.findIndex(function (entry) { return Number(entry.id) === Number(notificationId); });
    if (index < 0 || !receipt) return;
    const viewer = receipt.viewer || {};
    const sync = receipt.sync || {};
    state.notifications[index] = Object.assign({}, state.notifications[index], {
      read_at: viewer.read_at || null,
      read_by: viewer.read_by || null,
      read_state: viewer.status || "unknown",
      read_source: viewer.source || null,
      feishu_receipt_total: Number(receipt.total || 0),
      feishu_receipt_read_count: Number(receipt.read_count || 0),
      feishu_receipt_latest_read_at: (receipt.recipients || []).reduce(function (latest, person) {
        if (!person || !person.read_at) return latest;
        return !latest || String(person.read_at) > String(latest) ? person.read_at : latest;
      }, null),
      feishu_receipts_synced_at: sync.synced_at || null,
      feishu_receipts_sync_status: sync.status || "failed",
      feishu_receipts_sync_error: sync.error || null,
    });
  }

  function visiblePageNotifications() {
    const items = visibleNotifications();
    const pageCount = Math.max(1, Math.ceil(items.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const start = (state.page - 1) * state.pageSize;
    return items.slice(start, start + state.pageSize);
  }

  function shouldAutoSyncReadReceipt(item) {
    if (!item || item.dry_run || !item.feishu_message_id || resultKey(item) !== "sent") return false;
    const notificationId = Number(item.id);
    const lastCheckedAt = Number(state.readReceiptLastCheckedAt[notificationId] || 0);
    return !state.readReceiptLoading[notificationId] && Date.now() - lastCheckedAt >= 60 * 1000;
  }

  function scheduleVisibleReadReceiptSync() {
    if (!state.active || state.readReceiptAutoSyncScheduled) return;
    state.readReceiptAutoSyncScheduled = true;
    window.setTimeout(function () {
      state.readReceiptAutoSyncScheduled = false;
      void refreshVisibleReadReceipts();
    }, 0);
  }

  async function refreshVisibleReadReceipts() {
    if (!state.active) return;
    const queue = visiblePageNotifications().filter(shouldAutoSyncReadReceipt).map(function (item) { return Number(item.id); });
    if (!queue.length) return;
    const workerCount = Math.min(3, queue.length);
    await Promise.all(Array.from({ length: workerCount }, async function () {
      while (queue.length && state.active) {
        const notificationId = queue.shift();
        if (!Number.isFinite(notificationId)) continue;
        await refreshReadReceipts(notificationId, { silent: true });
      }
    }));
    if (!state.active) return;
    const summary = root.querySelector(".nw-summary");
    if (summary) summary.outerHTML = renderSummary();
    if (state.filters.read !== "all") renderTimelineOnly();
    hydrateIcons();
  }

  async function refreshReadReceipts(id, options) {
    const notificationId = Number(id);
    if (!Number.isFinite(notificationId)) return;
    const config = options || {};
    state.readReceiptLoading[notificationId] = true;
    if (state.inspectorOpen && Number(state.selectedId) === notificationId) syncInspector();
    try {
      const receipt = await fetchJson("/api/notifications/" + notificationId + "/read-receipts");
      state.readReceipts[notificationId] = receipt;
      applyReadReceiptToNotification(notificationId, receipt);
      renderNotificationRowOnly(notificationId);
    } catch (error) {
      if (!config.silent) showToast(error instanceof Error ? error.message : "飞书阅读状态同步失败", "error");
    } finally {
      state.readReceiptLastCheckedAt[notificationId] = Date.now();
      state.readReceiptLoading[notificationId] = false;
      if (state.inspectorOpen && Number(state.selectedId) === notificationId) syncInspector();
    }
  }

  async function openNotification(id, options) {
    const notificationId = Number(id);
    if (!Number.isFinite(notificationId)) return;
    const config = options || {};
    const item = state.notifications.find(function (entry) { return Number(entry.id) === notificationId; });
    if (!item) return;
    state.selectedId = notificationId;
    state.inspectorOpen = true;
    state.expandedRecipientId = config.expandRecipients ? notificationId : null;
    state.inspectorFocus = config.focusReads ? "reads" : "";
    syncSelectedRow();
    syncInspector();
    openInspectorWithMotion();
    await refreshReadReceipts(notificationId);
  }

  async function runAdminAction(action) {
    if (state.busyAction) return;
    state.busyAction = action;
    renderShell();
    let toastMessage = "";
    let toastTone = "success";
    try {
      const endpoint = action === "daily-report" ? "/api/reports/daily" : "/api/monitor/run";
      const payload = action === "daily-report" ? { dry_run: true, force: false } : { dry_run: true };
      const result = await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      await loadData(true);
      toastMessage = result.notice || (action === "daily-report" ? "日报预览已生成，没有向成员发送" : "预警检查已完成，消息列表已刷新");
    } catch (error) {
      toastMessage = error instanceof Error ? error.message : "操作失败";
      toastTone = "error";
    } finally {
      state.busyAction = "";
      if (state.active) renderShell();
      if (toastMessage) showToast(toastMessage, toastTone);
    }
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

  function activate() {
    if (!state.active) window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { hash: ROUTE_HASH } }));
    if (state.active) {
      syncSidebarBounds();
      hideLegacyMain();
      syncNavigation(true);
      return;
    }
    state.active = true;
    state.routeSelected = true;
    state.pageSize = pageSizeForViewport();
    setHash(true);
    syncSidebarBounds();
    hideLegacyMain();
    root.classList.add("is-active");
    root.setAttribute("aria-hidden", "false");
    syncNavigation(true);
    const hasRenderedShell = Boolean(root.querySelector(":scope > .nw-app"));
    if (!hasRenderedShell && state.notifications.length) renderShell();
    void loadData(true);
    scheduleVisibleReadReceiptSync();
  }

  function deactivate() {
    if (!state.active) return;
    state.active = false;
    state.inspectorOpen = false;
    root.classList.remove("is-active", "is-inspector-open");
    const inspector = root.querySelector(".nw-inspector");
    if (inspector) {
      inspector.classList.remove("is-entering");
      inspector.setAttribute("aria-hidden", "true");
      inspector.setAttribute("inert", "");
    }
    syncSelectedRow();
    root.setAttribute("aria-hidden", "true");
    disposeCharts();
    restoreLegacyMain();
    syncNavigation(false);
  }

  function syncView() {
    syncSidebarBounds();
    if (window.location.hash !== ROUTE_HASH) {
      state.routeSelected = false;
      deactivate();
      return;
    }
    state.routeSelected = true;
    if (!document.querySelector(".project-detail-page")) activate();
  }

  root.addEventListener("input", function (event) {
    if (!event.target.matches("[data-search]")) return;
    state.filters.search = event.target.value;
    state.page = 1;
    if (event.isComposing || root.searchComposing) return;
    scheduleSearchRender(140);
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

  root.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.inspectorOpen) {
      event.preventDefault();
      closeInspector(true);
      return;
    }
    if (event.target.closest && event.target.closest("[data-recipient-chat], [data-action]")) return;
    const selectControl = event.target.closest && event.target.closest("[data-nw-select]");
    if (selectControl) {
      const trigger = selectControl.querySelector("[data-nw-select-toggle]");
      const options = Array.from(selectControl.querySelectorAll("[data-nw-select-option]"));
      if (event.target === trigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        if (!selectControl.classList.contains("is-open")) {
          setNotificationSelectMenuOpen(selectControl, true, event.key === "ArrowUp" ? "last" : "selected");
          return;
        }
        const activeId = trigger.getAttribute("aria-activedescendant");
        const activeIndex = Math.max(0, options.findIndex(function (option) { return option.id === activeId; }));
        const nextIndex = event.key === "ArrowDown"
          ? (activeIndex + 1) % options.length
          : (activeIndex - 1 + options.length) % options.length;
        setActiveNotificationSelectOption(selectControl, options[nextIndex]);
        return;
      }
      if (event.target === trigger && selectControl.classList.contains("is-open") && (event.key === "Home" || event.key === "End")) {
        event.preventDefault();
        setActiveNotificationSelectOption(selectControl, event.key === "Home" ? options[0] : options[options.length - 1]);
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
        setNotificationSelectMenuOpen(selectControl, false);
        if (trigger) trigger.focus();
        return;
      }
      if (event.key === "Tab") setNotificationSelectMenuOpen(selectControl, false);
    }
    const row = event.target.closest && event.target.closest("tr[data-notification-id]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      void openNotification(row.dataset.notificationId);
      return;
    }
  });

  root.addEventListener("click", function (event) {
    if (event.target.closest("[data-recipient-chat]")) return;
    const selectControl = event.target.closest("[data-nw-select]");
    if (!selectControl) closeNotificationSelectMenus();
    const selectTrigger = event.target.closest("[data-nw-select-toggle]");
    if (selectTrigger) {
      setNotificationSelectMenuOpen(selectControl, !selectControl.classList.contains("is-open"));
      return;
    }
    const selectOption = event.target.closest("[data-nw-select-option]");
    if (selectOption) {
      const key = selectOption.dataset.nwSelectOption;
      const value = selectOption.dataset.value;
      setNotificationSelectMenuOpen(selectControl, false);
      applyNotificationSelectValue(key, value);
      window.requestAnimationFrame(function () {
        const nextTrigger = root.querySelector("[data-nw-select-toggle='" + key + "']");
        if (nextTrigger) nextTrigger.focus();
      });
      return;
    }
    const row = event.target.closest("tr[data-notification-id]");
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode && row) {
      void openNotification(row.dataset.notificationId);
      return;
    }
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === "reset") resetFilters();
    else if (action === "clear-filter") {
      const key = actionNode.dataset.filterKey;
      if (key === "date-range") {
        state.filters.startDate = "";
        state.filters.endDate = "";
      } else {
        state.filters[key] = key === "hour" || key === "search" || key === "date" ? "" : "all";
      }
      state.page = 1;
      renderShell();
      void refreshStats();
      void loadData(true);
    } else if (action === "reset-chart") {
      if (actionNode.dataset.chart === "type") {
        state.filters.type = "all";
        state.filters.result = "all";
      } else {
        state.filters.hour = "";
      }
      state.page = 1;
      renderShell();
      void loadData(true);
    } else if (action === "reset-result") {
      state.filters.result = "all";
      state.page = 1;
      renderShell();
      void loadData(true);
    } else if (action === "filter-result") {
      const next = actionNode.dataset.result;
      state.filters.result = state.filters.result === next ? "all" : next;
      state.page = 1;
      renderShell();
      void loadData(true);
    } else if (action === "page-prev") {
      state.page = Math.max(1, state.page - 1);
      void loadData(true);
    } else if (action === "page-next") {
      state.page = Math.min(Math.max(1, Math.ceil(state.total / state.pageSize)), state.page + 1);
      void loadData(true);
    } else if (action === "go-page") {
      state.page = Math.max(1, Number(actionNode.dataset.page) || 1);
      void loadData(true);
    } else if (action === "view-recipients") {
      void openNotification(actionNode.dataset.notificationId, { expandRecipients: true });
    } else if (action === "view-read-receipts") {
      void openNotification(actionNode.dataset.notificationId, { focusReads: true });
    } else if (action === "refresh-read-receipts") {
      void refreshReadReceipts(actionNode.dataset.notificationId);
    } else if (action === "toggle-recipients") {
      const notificationId = Number(actionNode.dataset.notificationId);
      state.expandedRecipientId = Number(state.expandedRecipientId) === notificationId ? null : notificationId;
      syncInspector();
    } else if (action === "close-inspector") {
      closeInspector(true);
    } else if (action === "open-project") openProject(actionNode.dataset.projectId);
    else if (action === "reload") void loadData(true);
    else if (action === "daily-report") void runAdminAction("daily-report");
    else if (action === "run-monitor") void runAdminAction("run-monitor");
  }, true);

  document.addEventListener("click", function (event) {
    if (!state.active || !state.inspectorOpen || !(event.target instanceof Element)) return;
    if (event.target.closest(".nw-inspector, tr[data-notification-id], [data-action='view-recipients'], [data-action='view-read-receipts']")) return;
    closeInspector(false);
  });

  let lastSidebarPointerActivationAt = Number.NEGATIVE_INFINITY;

  function stopSidebarNavigationEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function handleSidebarCapture(event) {
    if (!event.target || !event.target.closest) return;
    const sidebarButton = event.target.closest(".sidebar button");
    if (!sidebarButton) return;
    if (sidebarButton.matches(".sidebar-collapse-btn, .sidebar-resize-handle") || sidebarButton.closest(".sidebar-foot, .o2o-primary-footer")) return;
    if (sidebarButton.matches(".nav-group > button")) return;
    if (navText(sidebarButton) === "通知记录") {
      const now = window.performance && typeof window.performance.now === "function"
        ? window.performance.now()
        : Date.now();
      const isDuplicatePointerClick = event.type === "click"
        && Number(event.detail || 0) > 0
        && now - lastSidebarPointerActivationAt < 5000;
      stopSidebarNavigationEvent(event);
      if (isDuplicatePointerClick) return;
      if (event.type === "pointerdown") lastSidebarPointerActivationAt = now;
      state.routeSelected = true;
      setHash(true);
      activate();
      return;
    }
    state.routeSelected = false;
    if (window.location.hash === ROUTE_HASH) setHash(false);
    deactivate();
  }

  window.addEventListener("pointerdown", handleSidebarCapture, true);
  window.addEventListener("click", handleSidebarCapture, true);
  window.addEventListener(WORKBENCH_ROUTE_EVENT, function (event) {
    if (event.detail && event.detail.hash === ROUTE_HASH) return;
    state.routeSelected = false;
    if (window.location.hash === ROUTE_HASH) setHash(false);
    if (state.active) deactivate();
    else if (notificationNavButton()?.classList.contains("active")) syncNavigation(false);
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

  function handleViewportResize() {
    syncSidebarBounds();
    window.clearTimeout(root.viewportTimer);
    root.viewportTimer = window.setTimeout(function () {
      const nextPageSize = pageSizeForViewport();
      if (!state.active || nextPageSize === state.pageSize) return;
      state.pageSize = nextPageSize;
      state.page = Math.min(state.page, Math.max(1, Math.ceil(state.total / state.pageSize)));
      void loadData(true);
    }, 120);
  }

  new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-current"] });
  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener("resize", handleViewportResize, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (state.active && document.visibilityState === "visible") void loadData(true);
  });
  ensureChartRuntime();
  scheduleSync();
})();
