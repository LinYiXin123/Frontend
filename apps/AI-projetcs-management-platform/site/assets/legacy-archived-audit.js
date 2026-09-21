(function archivedAuditWorkbench() {
  "use strict";

  const ROOT_CLASS = "archived-audit-root";
  const API_URL = "/api/archived-projects/overview";
  const ARCHIVED_HASH = "#archived-projects";
  const NAV_CLASS = "legacy-archived-projects-nav";
  const WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  const PAGE_SIZES = [5, 10, 15, 50];
  const stateMeta = {
    source_missing: { label: "源项目不可访问", color: "#e5484d", icon: "CircleAlert" },
    gitlab_archived: { label: "GitLab 仍归档", color: "#2563eb", icon: "Archive" },
    restore_pending: { label: "GitLab 已开放 · 待确认", color: "#ee9418", icon: "RefreshCcw" },
    recycle_bin: { label: "回收站待恢复", color: "#e5484d", icon: "Trash2" },
    restorable: { label: "可恢复", color: "#16a66a", icon: "ArchiveRestore" },
  };
  const timelineKindMeta = {
    archived: { label: "归档事件", color: "#2563eb" },
    restored: { label: "恢复完成", color: "#16a66a" },
    restore_detected: { label: "恢复待确认", color: "#ee9418" },
  };
  const timelineLegendDefaults = () => Object.fromEntries(
    Object.values(timelineKindMeta).map((meta) => [meta.label, true])
  );
  const stateLegendDefaults = () => Object.fromEntries(
    Object.values(stateMeta).map((meta) => [meta.label, true])
  );
  const sourceMeta = {
    gitlab: "GitLab 同步",
    gitlab_discovery: "GitLab 同步",
    recycle_bin: "回收站",
    system: "平台操作",
  };
  const archivedSelectDefinitions = {
    lifecycle: {
      label: "生命周期状态",
      className: "archived-lifecycle-select",
      options: [
        ["all", "全部状态"],
        ...Object.entries(stateMeta).map(([value, meta]) => [value, meta.label]),
      ],
    },
    source: {
      label: "归档来源",
      className: "archived-source-select",
      options: [
        ["all", "全部来源"],
        ["system", "平台操作"],
        ["gitlab", "GitLab 同步"],
        ["recycle_bin", "回收站"],
      ],
    },
  };
  const statusLabels = {
    developing: "开发中",
    online: "已上线",
    archived: "已归档",
    suspended: "已暂停",
    active: "进行中",
    completed: "已完成",
    draft: "草稿",
    accepted: "已验收",
    pending_acceptance: "待验收",
    rejected: "已驳回",
    stale: "已失效",
    not_submitted: "未提交",
    none: "未排期",
  };
  const state = {
    active: false,
    routeSelected: window.location.hash === ARCHIVED_HASH,
    loading: false,
    payload: null,
    error: "",
    search: "",
    lifecycle: "all",
    source: "all",
    month: "",
    eventKind: "all",
    sort: "archive_time",
    sortDirection: "desc",
    page: 1,
    pageSize: 10,
    expandedId: null,
    loadController: null,
    chartTimer: 0,
    timelineZoom: { start: 0, end: 100 },
    timelineLegendSelected: timelineLegendDefaults(),
    stateLegendSelected: stateLegendDefaults(),
    timelineChart: null,
    stateChart: null,
    resizeObserver: null,
    navigationEpoch: 0,
  };

  let root = document.querySelector(`.${ROOT_CLASS}`);
  if (!root) {
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.setAttribute("aria-label", "已归档项目生命周期审计");
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
  }

  function escapeHtml(value) {
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

  function projectBusinessName(project) {
    const item = project || {};
    return compact(item.display_name_zh || item.display_name || item.name) || "未命名项目";
  }

  function statusLabel(value, fallback) {
    const normalized = compact(value);
    return statusLabels[normalized] || fallback || normalized || "暂无";
  }

  function localizeLifecycleText(value) {
    let localized = String(value == null ? "" : value);
    Object.entries(statusLabels).forEach(([token, label]) => {
      localized = localized.replace(new RegExp(`\\b${token}\\b`, "g"), label);
    });
    return localized;
  }

  function navLabel(button) {
    if (!button) return "";
    const clone = button.cloneNode(true);
    clone.querySelectorAll(".simple-child-nav-icon, b").forEach((node) => node.remove());
    return compact(clone.textContent);
  }

  function projectNavigationGroup() {
    return Array.from(document.querySelectorAll(".sidebar .nav-group")).find((group) => {
      const parent = group.querySelector(":scope > button");
      return compact(parent?.getAttribute("aria-label") || parent?.textContent).startsWith("项目中心");
    }) || null;
  }

  function replaceArchivedHash(active) {
    const nextUrl = `${window.location.pathname}${window.location.search}${active ? ARCHIVED_HASH : ""}`;
    try {
      window.history.replaceState(window.history.state, document.title, nextUrl);
    } catch (_error) {
      window.location.hash = active ? ARCHIVED_HASH : "";
    }
  }

  function updateArchivedNavigationCount() {
    const button = document.querySelector(`.${NAV_CLASS}`);
    if (!button) return;
    button.classList.add("nav-count-hidden");
    button.querySelectorAll(":scope > b, :scope > .social-count-badge")
      .forEach((badge) => badge.remove());
  }

  function syncArchivedNavigationState(active) {
    const button = document.querySelector(`.${NAV_CLASS}`);
    if (!button) return;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
      button.parentElement?.querySelectorAll(":scope > button").forEach((sibling) => {
        if (sibling === button) return;
        sibling.classList.remove("active");
        sibling.removeAttribute("aria-current");
      });
    } else {
      button.removeAttribute("aria-current");
    }
    updateArchivedNavigationCount();
  }

  function activateArchivedNavigation() {
    const navigationEpoch = ++state.navigationEpoch;
    window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { hash: ARCHIVED_HASH } }));
    state.routeSelected = true;
    const detailBackButton = document.querySelector(".project-detail-page .detail-header .breadcrumb button");
    if (detailBackButton) detailBackButton.click();
    replaceArchivedHash(true);
    syncArchivedNavigationState(true);
    window.requestAnimationFrame(() => {
      if (navigationEpoch !== state.navigationEpoch || !state.routeSelected) return;
      replaceArchivedHash(true);
      syncArchivedNavigationState(true);
      syncView();
    });
  }

  function ensureArchivedNavigation() {
    const group = projectNavigationGroup();
    const children = group?.querySelector(".nav-children");
    if (!children) return null;
    let button = children.querySelector(`.${NAV_CLASS}`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = NAV_CLASS;
      button.setAttribute("data-legacy-nav", "archived-projects");
      button.textContent = "已归档项目";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        activateArchivedNavigation();
      });
      const registration = Array.from(children.querySelectorAll(":scope > button"))
        .find((candidate) => navLabel(candidate).startsWith("项目登记"));
      children.insertBefore(button, registration || null);
    }
    syncArchivedNavigationState(window.location.hash === ARCHIVED_HASH || state.active || state.routeSelected);
    return button;
  }

  function safeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw, window.location.origin);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch (_error) {
      return "";
    }
  }

  function icon(name, className) {
    return `<i data-lucide="${escapeHtml(name)}" class="archived-icon${className ? ` ${escapeHtml(className)}` : ""}" aria-hidden="true"></i>`;
  }

  function hydrateIcons() {
    const runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({
      icons: runtime.icons,
      attrs: { width: 16, height: 16, "stroke-width": 1.8 },
    });
  }

  function archivedSelectValue(key) {
    return state[key];
  }

  function renderArchivedSelect(key) {
    const definition = archivedSelectDefinitions[key];
    if (!definition) return "";
    const selectedValue = archivedSelectValue(key);
    const selected = definition.options.find(([value]) => value === selectedValue) || definition.options[0];
    const listId = `archived-select-${key}-listbox`;
    return `<div class="archived-select ${escapeHtml(definition.className)}" data-archived-select="${escapeHtml(key)}">
      <button class="archived-select-trigger" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}" aria-label="${escapeHtml(definition.label)}，当前为${escapeHtml(selected[1])}" data-archived-select-toggle="${escapeHtml(key)}">
        <span>${escapeHtml(definition.label)}</span>
        <strong>${escapeHtml(selected[1])}</strong>
        ${icon("ChevronDown", "archived-select-chevron")}
      </button>
      <div class="archived-select-menu" id="${listId}" role="listbox" aria-label="${escapeHtml(definition.label)}选项" aria-hidden="true">
        ${definition.options.map(([value, label], optionIndex) => {
          const isSelected = value === selected[0];
          return `<button class="archived-select-option${isSelected ? " is-selected" : ""}" id="${listId}-option-${optionIndex}" type="button" role="option" tabindex="-1" aria-selected="${String(isSelected)}" data-archived-select-option="${escapeHtml(key)}" data-value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span>${icon("Check", "archived-select-check")}</button>`;
        }).join("")}
      </div>
    </div>`;
  }

  function closeArchivedSelectMenus(except) {
    root.querySelectorAll("[data-archived-select]").forEach((control) => {
      if (control === except) return;
      control.classList.remove("is-open");
      const trigger = control.querySelector("[data-archived-select-toggle]");
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.removeAttribute("aria-activedescendant");
      control.querySelector(".archived-select-menu")?.setAttribute("aria-hidden", "true");
      control.querySelectorAll("[data-archived-select-option]").forEach((option) => option.classList.remove("is-keyboard-active"));
    });
  }

  function setActiveArchivedSelectOption(control, option) {
    const trigger = control?.querySelector("[data-archived-select-toggle]");
    control?.querySelectorAll("[data-archived-select-option]").forEach((item) => {
      item.classList.toggle("is-keyboard-active", item === option);
    });
    if (!option?.id) {
      trigger?.removeAttribute("aria-activedescendant");
      return;
    }
    trigger?.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  }

  function setArchivedSelectMenuOpen(control, open, focusEdge) {
    if (!control) return;
    closeArchivedSelectMenus(open ? control : null);
    control.classList.toggle("is-open", open);
    control.querySelector("[data-archived-select-toggle]")?.setAttribute("aria-expanded", String(open));
    control.querySelector(".archived-select-menu")?.setAttribute("aria-hidden", String(!open));
    if (!open) {
      setActiveArchivedSelectOption(control, null);
      return;
    }
    const options = Array.from(control.querySelectorAll("[data-archived-select-option]"));
    const target = focusEdge === "last"
      ? options[options.length - 1]
      : options.find((option) => option.getAttribute("aria-selected") === "true") || options[0];
    setActiveArchivedSelectOption(control, target);
  }

  function applyArchivedSelectValue(key, value) {
    const definition = archivedSelectDefinitions[key];
    if (!definition?.options.some(([optionValue]) => optionValue === value)) return;
    state[key] = value;
    state.page = 1;
    state.expandedId = null;
    renderShell();
  }

  function formatDate(value, withTime) {
    if (!value) return "暂无";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, withTime ? 16 : 10);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    }).format(date);
  }

  function monthLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[1]}年${Number(match[2])}月` : value || "全部月份";
  }

  function initials(name) {
    const normalized = compact(name || "待定");
    return normalized.slice(0, 2);
  }

  function avatar(person, fallbackName) {
    const user = person || {};
    const name = compact(user.name || fallbackName || "待定");
    const imageUrl = safeUrl(user.feishu_avatar_url);
    return `<span class="archived-avatar" title="${escapeHtml(name)}">${imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" referrerpolicy="no-referrer">`
      : escapeHtml(initials(name))}</span>`;
  }

  function isArchivedNavigationActive() {
    return Boolean(document.querySelector(`.${NAV_CLASS}.active`)) || window.location.hash === ARCHIVED_HASH;
  }

  function isOtherProjectNavigationActive() {
    const group = projectNavigationGroup();
    const buttons = group ? Array.from(group.querySelectorAll(".nav-children > button")) : [];
    return buttons.some((button) => {
      if (button.classList.contains(NAV_CLASS)) return false;
      return button.classList.contains("active")
        || button.getAttribute("aria-current") === "page"
        || button.getAttribute("aria-pressed") === "true";
    });
  }

  function markProjectNavigationActive(button) {
    const group = projectNavigationGroup();
    if (!group || button.closest(".nav-group") !== group || !button.closest(".nav-children")) return;
    group.querySelectorAll(".nav-children > button").forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle("active", active);
      if (active) candidate.setAttribute("aria-current", "page");
      else candidate.removeAttribute("aria-current");
    });
  }

  function isProjectDetailOpen() {
    return Boolean(document.querySelector(".project-detail-page"));
  }

  function syncSidebarBounds() {
    const sidebar = document.querySelector(".sidebar");
    const right = sidebar ? Math.max(0, sidebar.getBoundingClientRect().right) : 0;
    root.style.setProperty("--archived-sidebar-right", `${Math.round(right)}px`);
    root.style.left = `${Math.round(right)}px`;
    window.requestAnimationFrame(resizeCharts);
  }

  function suspendLegacyMain(suspended) {
    const main = Array.from(document.querySelectorAll("main")).find((candidate) => !root.contains(candidate));
    if (!main) return;
    if (suspended) {
      main.hidden = true;
      main.setAttribute("inert", "");
      main.setAttribute("aria-hidden", "true");
      return;
    }
    if (document.querySelector(".project-ops-root.is-active, .mine-workbench-root.is-active")) return;
    main.hidden = false;
    main.removeAttribute("inert");
    main.removeAttribute("aria-hidden");
  }

  function showToast(message, tone) {
    let toast = root.querySelector(".archived-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "archived-toast";
      toast.setAttribute("role", "status");
      root.appendChild(toast);
    }
    toast.className = `archived-toast is-visible${tone ? ` is-${tone}` : ""}`;
    toast.textContent = message;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function renderLoading() {
    root.innerHTML = `<div class="archived-app">
      <header class="archived-header"><div class="archived-heading"><div><span class="archived-eyebrow">项目中心</span><h1>已归档项目</h1></div><p>归档不等于删除：正在读取项目生命周期与保留数据。</p></div></header>
      <main class="archived-scroll archived-loading-stage"><section class="archived-loading" role="status" aria-live="polite" aria-busy="true" aria-label="正在整理已归档项目">
        <div class="archived-loading-card">
          <div class="archived-loading-visual" aria-hidden="true">${icon("Archive")}${icon("LoaderCircle", "archived-loading-spinner is-spinning")}</div>
          <span class="archived-loading-kicker">归档生命周期</span>
          <strong>正在整理已归档项目</strong>
          <p>正在关联项目档案、GitLab 与生命周期记录</p>
          <span class="archived-loading-progress" aria-hidden="true"><i></i></span>
          <span class="archived-loading-meta">数据只用于审计追溯与恢复判断</span>
        </div>
      </section></main>
    </div>`;
    hydrateIcons();
  }

  function renderError() {
    root.innerHTML = `<div class="archived-app">
      <header class="archived-header"><div><span class="archived-eyebrow">项目中心</span><h1>已归档项目</h1><p>归档不等于删除，关联证据会继续保留。</p></div></header>
      <main class="archived-scroll"><section class="archived-error" role="alert">${icon("CircleAlert")}<h2>归档数据暂时无法加载</h2><p>${escapeHtml(state.error || "请稍后重试")}</p><button type="button" data-action="reload">重新加载</button></section></main>
    </div>`;
    hydrateIcons();
  }

  function lifecycleState(project) {
    return project?.restore?.state || "restorable";
  }

  function lifecycleStateCount(key) {
    return (state.payload?.projects || []).filter((project) => lifecycleState(project) === key).length;
  }

  function archiveSource(project) {
    return project?.archived_event?.source || "system";
  }

  const retiredActivitySources = new Set(["delivery", "code_quality"]);

  function isVisibleLifecycleEvent(event) {
    return !retiredActivitySources.has(String(event?.source || ""));
  }

  function lifecycleEvents(project) {
    const events = Array.isArray(project?.lifecycle_events)
      ? project.lifecycle_events.filter(isVisibleLifecycleEvent)
      : [];
    const archivedEvent = project?.archived_event;
    if (archivedEvent && isVisibleLifecycleEvent(archivedEvent) && !events.some((event) => event.kind === "archived" && event.occurred_at === archivedEvent.occurred_at)) {
      events.push({ ...archivedEvent, kind: "archived" });
    }
    return events;
  }

  function archiveReason(project) {
    const event = project?.archived_event || {};
    return compact(event.metadata?.archive_reason || event.description) || "归档时未填写原因";
  }

  function canEditArchiveReason(project) {
    return Boolean(
      project?.restore?.can_manage
      && !project?.is_deleted
      && !project?.gitlab_archived
      && archiveSource(project) === "system"
    );
  }

  function matchesTimelineFilter(project) {
    if (!state.month && state.eventKind === "all") return true;
    return lifecycleEvents(project).some((event) => {
      if (state.eventKind !== "all" && event.kind !== state.eventKind) return false;
      if (state.month && String(event.occurred_at || "").slice(0, 7) !== state.month) return false;
      return true;
    });
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s_\-./\\]+/g, "");
  }

  function archivedSearchTerms(value) {
    return compact(value)
      .split(/\s+/)
      .map(normalizeSearchText)
      .filter(Boolean);
  }

  function archivedSearchText(project) {
    const participantNames = [
      ...(project.participants || []),
      ...(project.participant_users || []).map((person) => person?.name),
    ];
    return [
      projectBusinessName(project),
      project.name,
      project.demand_source,
      project.owner_name,
      project.owner_user?.name,
      project.gitlab_project_id,
      project.gitlab_repo_url,
      archiveReason(project),
      ...participantNames,
    ].join(" ");
  }

  function matchesArchivedSearch(project) {
    const terms = archivedSearchTerms(state.search);
    if (!terms.length) return true;
    const haystack = normalizeSearchText(archivedSearchText(project));
    return terms.every((term) => haystack.includes(term));
  }

  function filteredProjects() {
    const projects = (state.payload?.projects || []).filter((project) => {
      if (state.lifecycle !== "all" && lifecycleState(project) !== state.lifecycle) return false;
      if (state.source !== "all" && archiveSource(project) !== state.source) return false;
      if (!matchesTimelineFilter(project)) return false;
      return matchesArchivedSearch(project);
    });
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return projects.sort((left, right) => {
      let a = "";
      let b = "";
      if (state.sort === "project") {
        a = left.name || "";
        b = right.name || "";
      } else if (state.sort === "owner") {
        a = left.owner_name || "";
        b = right.owner_name || "";
      } else {
        a = left.archived_event?.occurred_at || "";
        b = right.archived_event?.occurred_at || "";
      }
      return String(a).localeCompare(String(b), "zh-CN") * direction;
    });
  }

  function summaryHtml() {
    const summary = state.payload?.summary || {};
    const cards = [
      ["Archive", "当前归档", summary.total || 0, "全部处于归档状态的项目", "archive", "归档总览"],
      ["LockKeyhole", "GitLab 仍归档", summary.gitlab_archived || 0, "仓库未开放，暂不能恢复", "blocked", "恢复阻断"],
      ["RefreshCcw", "待管理员确认", summary.restore_pending || 0, "GitLab 已开放，等待平台确认", "pending", "人工确认"],
      ["ArchiveRestore", "当前可处理", summary.actionable || 0, "按账号权限可执行恢复", "actionable", "恢复出口"],
    ];
    return `<section class="archived-summary" aria-label="归档项目概览">${cards.map(([iconName, label, value, note, tone, category], index) => `<article class="is-${tone}">
      <span class="archived-summary-icon">${icon(iconName)}</span><div class="archived-summary-copy"><span class="archived-summary-kicker">${escapeHtml(category)}</span><div class="archived-summary-value"><strong>${Number(value)}</strong><b>${escapeHtml(label)}</b></div><small>${escapeHtml(note)}</small></div><span class="archived-summary-ordinal" aria-hidden="true">0${index + 1}</span>
    </article>`).join("")}</section>`;
  }

  function filtersHtml(resultCount) {
    return `<div class="archived-table-tools">
      <div class="archived-filter-group">
        ${renderArchivedSelect("lifecycle")}
        ${renderArchivedSelect("source")}
        <label class="archived-search">${icon("Search")}<input type="search" value="${escapeHtml(state.search)}" placeholder="模糊搜索项目、GitLab、负责人或成员" aria-label="模糊搜索已归档项目"></label>
      </div>
      <div class="archived-result-meta"><span>当前结果 <strong>${resultCount}</strong> / ${state.payload?.summary?.total || 0} 个项目</span><button type="button" class="archived-text-button" data-action="reset-filters"${state.lifecycle === "all" && state.source === "all" && !state.month && state.eventKind === "all" && !state.search ? " disabled" : ""}>重置筛选</button></div>
    </div>`;
  }

  function paginationHtml(projects, total, startIndex, pageCount) {
    const shownStart = projects.length ? startIndex + 1 : 0;
    const shownEnd = startIndex + projects.length;
    return `<footer class="archived-table-footer">
      <span class="archived-pagination-summary" aria-live="polite">显示 ${shownStart}–${shownEnd} 条，共 ${total} 个真实归档项目</span>
      <div class="archived-pagination-controls">
        <label class="archived-page-size"><span>每页显示</span><select data-archived-page-size aria-label="每页显示条数">${PAGE_SIZES.map((size) => `<option value="${size}"${state.pageSize === size ? " selected" : ""}>${size} 条</option>`).join("")}</select></label>
        <nav class="archived-pagination" aria-label="归档项目分页"><button type="button" data-action="page-prev"${state.page <= 1 ? " disabled" : ""}>上一页</button><b>第 ${state.page} / ${pageCount} 页</b><button type="button" data-action="page-next"${state.page >= pageCount ? " disabled" : ""}>下一页</button></nav>
      </div>
      <span>数据更新时间：${escapeHtml(formatDate(state.payload?.generated_at, true))}</span>
    </footer>`;
  }

  function memberHtml(project) {
    const owner = project.owner_user || { name: project.owner_name };
    const participants = project.participant_users || [];
    return `<div class="archived-member-cell"><div class="archived-member-primary">${avatar(owner, project.owner_name)}<span><strong>${escapeHtml(project.owner_name || "待确认")}</strong><small>负责人</small></span></div>
      <div class="archived-member-secondary">${participants.slice(0, 3).map((person) => avatar(person, person.name)).join("")}${participants.length ? `<span>${participants.length} 位参与人</span>` : "<span>暂无参与人</span>"}</div></div>`;
  }

  function repositoryHtml(project) {
    const meta = stateMeta[lifecycleState(project)] || stateMeta.restorable;
    const url = safeUrl(project.gitlab_repo_url);
    const path = project.gitlab_project_id || "未绑定 GitLab";
    return `<div class="archived-repository"><span class="archived-state-badge" style="--state-color:${meta.color}">${icon(meta.icon)}${escapeHtml(meta.label)}</span>
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(path)}${icon("ExternalLink")}</a>` : `<small>${escapeHtml(path)}</small>`}</div>`;
  }

  function retentionHtml(project) {
    const retention = project.retention || {};
    return `<div class="archived-retention" aria-label="关联数据保留情况">
      <span title="活动记录">${icon("Activity")}<b>${Number(retention.activities || 0)}</b> 活动</span>
      <span title="预警记录">${icon("BellRing")}<b>${Number(retention.alerts || 0)}</b> 预警</span>
      <span title="排期版本">${icon("History")}<b>${Number(retention.schedule_versions || 0)}</b> 版本</span>
    </div>`;
  }

  function auditEventHtml(event, index) {
    const kindIcon = event.kind === "archived" ? "Archive" : event.kind === "restored" ? "ArchiveRestore" : "RefreshCcw";
    const kindLabel = event.kind === "archived" ? "归档" : event.kind === "restored" ? "恢复" : event.kind === "restore_detected" ? "待确认" : "变更";
    return `<li>
      <span class="archived-audit-index">${index + 1}</span>
      <span class="archived-audit-icon is-${escapeHtml(event.kind || "lifecycle")}">${icon(kindIcon)}</span>
      <time datetime="${escapeHtml(event.occurred_at || "")}"><strong>${escapeHtml(formatDate(event.occurred_at, false))}</strong><span>${escapeHtml(formatDate(event.occurred_at, true).split(" ").slice(-1)[0] || "")}</span></time>
      <div class="archived-audit-event"><span class="archived-audit-kind">${escapeHtml(kindLabel)}</span><strong>${escapeHtml(localizeLifecycleText(event.title || "生命周期记录"))}</strong><p>${escapeHtml(localizeLifecycleText(event.description || "该操作已写入项目活动记录。"))}</p></div>
      <div class="archived-audit-actor"><strong>${escapeHtml(event.actor || "系统")}</strong><span>${escapeHtml(sourceMeta[event.source] || sourceMeta.system)}</span></div>
    </li>`;
  }

  function restoreDecisionView(project) {
    const restore = project.restore || {};
    if (restore.can_restore === true) {
      return {
        transitionClass: "is-ready",
        targetCaption: "恢复后",
        targetLabel: "开发中",
        guidance: "",
      };
    }

    const sourceUnavailable = compact(restore.state) === "source_missing";
    return {
      transitionClass: "is-blocked",
      targetCaption: "恢复状态",
      targetLabel: "当前不可恢复",
      guidance: sourceUnavailable
        ? "平台只能恢复项目档案，不能恢复已删除的 GitLab 仓库。请先恢复或重建仓库并重新绑定；若仓库仍存在，请检查集成账号权限后重新检测。"
        : "请先处理以上阻断条件，重新检测通过后才能恢复为开发中。",
    };
  }

  function auditDrawerHtml(project) {
    const restore = project.restore || {};
    const decision = restoreDecisionView(project);
    const events = lifecycleEvents(project);
    const schedule = project.retention?.schedule;
    const impact = [
      `活动 ${Number(project.retention?.activities || 0)} 条继续保留`,
      `预警 ${Number(project.retention?.alerts || 0)} 条继续保留`,
      schedule ? `排期当前为${statusLabel(schedule.status)}` : "尚未建立排期",
    ];
    const reason = archiveReason(project);
    return `<tr class="archived-audit-row" id="archived-audit-${Number(project.id)}" data-audit-project-id="${Number(project.id)}"><td colspan="8"><div class="archived-audit-drawer" aria-label="${escapeHtml(projectBusinessName(project))}生命周期审计，共 ${events.length} 条记录">
      <section class="archived-audit-trail"><div class="archived-audit-section-title"><div><strong>证据与审计轨迹</strong><span>每条事件均来自当前项目的活动记录</span></div>${icon("History")}</div>
        <div class="archived-reason-card"><span>${icon("FileText")}</span><div><small>归档原因</small><strong>${escapeHtml(reason)}</strong><p>与最近一次归档活动记录关联，不改变项目原始数据。</p></div>${canEditArchiveReason(project) ? `<button type="button" data-action="edit-archive-reason" data-project-id="${Number(project.id)}">${icon("Settings2")}<span>${reason === "归档时未填写原因" ? "补充原因" : "修改原因"}</span></button>` : ""}</div>
        ${events.length ? `<ol>${events.map(auditEventHtml).join("")}</ol>` : `<div class="archived-audit-empty">${icon("History")}<span>暂无更早的结构化生命周期记录</span></div>`}
        <footer>${icon("Database")}<span>归档只改变项目运行态；活动、预警与历史变更仍按项目 ID 关联保留。</span></footer>
      </section>
      <aside class="archived-audit-decision"><div class="archived-audit-section-title"><div><strong>恢复判断</strong><span>基于仓库状态与当前账号权限</span></div>${icon("ShieldCheck")}</div>
        <div class="archived-status-transition ${decision.transitionClass}" aria-label="当前状态已归档，${escapeHtml(decision.targetCaption)}${escapeHtml(decision.targetLabel)}"><span><small>当前状态</small><strong>已归档</strong></span>${icon("ArrowRight")}<span><small>${escapeHtml(decision.targetCaption)}</small><strong>${escapeHtml(decision.targetLabel)}</strong></span></div>
        <ul>${impact.map((item) => `<li>${icon("CheckCircle2")}<span>${escapeHtml(item)}</span></li>`).join("")}</ul>
        ${restore.blockers?.length ? `<div class="archived-blockers"><strong>暂不能恢复</strong>${restore.blockers.map((item) => `<p>${icon("CircleAlert")}<span>${escapeHtml(item)}</span></p>`).join("")}<p class="archived-blocker-guidance">${icon("RefreshCcw")}<span>${escapeHtml(decision.guidance)}</span></p></div>` : `<div class="archived-ready">${icon("ShieldCheck")}<span>当前账号满足恢复条件，恢复后项目将重新进入开发中看板与相关统计。</span></div>`}
      </aside>
    </div></td></tr>`;
  }

  function projectRowHtml(project, index) {
    const expanded = Number(state.expandedId) === Number(project.id);
    const event = project.archived_event || {};
    const restore = project.restore || {};
    const scheduleStatus = project.retention?.schedule?.status || "未排期";
    const actionLabel = restore.can_restore
      ? (lifecycleState(project) === "restore_pending" ? "确认恢复" : "恢复项目")
      : (restore.action_label || "查看阻断");
    return `<tr class="archived-project-row${expanded ? " is-expanded" : ""}" data-project-id="${Number(project.id)}" tabindex="0" aria-expanded="${String(expanded)}" aria-controls="archived-audit-${Number(project.id)}" title="点击项目行${expanded ? "收起" : "查看"}审计轨迹">
      <td class="archived-index">${index + 1}</td>
      <td><div class="archived-project-cell"><button type="button" class="archived-project-link" data-action="open-project" data-project-id="${Number(project.id)}" aria-label="打开只读项目详情：${escapeHtml(projectBusinessName(project))}"><strong>${escapeHtml(projectBusinessName(project))}</strong>${icon("ExternalLink")}</button><small>${escapeHtml(project.demand_source || "需求方待补充")}</small><span>${escapeHtml(project.gitlab_project_id || "未绑定仓库")}</span></div></td>
      <td>${memberHtml(project)}</td>
      <td><div class="archived-event-cell"><strong>${escapeHtml(localizeLifecycleText(event.title || "平台项目已归档"))}</strong><span>${escapeHtml(formatDate(event.occurred_at, true))}</span><small>${escapeHtml(event.actor || "系统")} · ${escapeHtml(sourceMeta[event.source] || sourceMeta.system)}</small></div></td>
      <td>${repositoryHtml(project)}</td>
      <td>${retentionHtml(project)}</td>
      <td><span class="archived-schedule-state${scheduleStatus === "suspended" ? " is-suspended" : ""}">${icon("CalendarClock")}${escapeHtml(statusLabel(scheduleStatus, "未排期"))}</span></td>
      <td><div class="archived-row-actions"><button type="button" class="archived-action-button${restore.can_restore ? " is-ready" : ""}" data-action="${restore.can_restore ? "restore" : "toggle-audit"}" data-project-id="${Number(project.id)}">${icon(restore.can_restore ? "ArchiveRestore" : "Eye")}<span>${escapeHtml(actionLabel)}</span></button></div></td>
    </tr>${expanded ? auditDrawerHtml(project) : ""}`;
  }

  function tableHtml() {
    const allProjects = filteredProjects();
    const pageCount = Math.max(1, Math.ceil(allProjects.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const startIndex = (state.page - 1) * state.pageSize;
    const projects = allProjects.slice(startIndex, startIndex + state.pageSize);
    return `<section class="archived-panel archived-table-panel">
      <div class="archived-panel-heading"><div><span>归档治理台账</span><h2>项目档案与恢复建议</h2><p>每一行都以项目 ID 关联 GitLab、成员、活动、预警和排期数据；点击项目行查看审计轨迹。</p></div>${icon("TableProperties")}</div>
      ${filtersHtml(allProjects.length)}
      <div class="archived-table-wrap"><table class="archived-table"><thead><tr>
        <th>#</th>
        <th><span>项目档案</span><button type="button" data-sort="project" aria-label="按项目名称排序">${icon("ArrowUpDown")}</button></th>
        <th><span>负责人 / 成员</span><button type="button" data-sort="owner" aria-label="按负责人排序">${icon("ArrowUpDown")}</button></th>
        <th><span>归档事件</span><button type="button" data-sort="archive_time" aria-label="按归档时间排序">${icon("ArrowUpDown")}</button></th>
        <th>仓库状态</th><th>数据保留</th><th>排期状态</th><th>恢复建议</th>
      </tr></thead><tbody>${projects.length ? projects.map((project, index) => projectRowHtml(project, startIndex + index)).join("") : `<tr><td colspan="8"><div class="archived-empty">
        <span class="archived-empty-icon">${icon("ArchiveRestore")}</span><h3>${state.payload?.summary?.total ? "没有符合当前筛选的归档项目" : "当前还没有已归档项目"}</h3>
        <p>${state.payload?.summary?.total ? "调整生命周期、来源、月份或搜索条件后再试。" : "项目归档后不会删除活动、预警和变更记录；真实记录会在这里形成可恢复、可追溯的档案。"}</p>
        ${state.payload?.summary?.total ? `<button type="button" data-action="reset-filters">清除筛选</button>` : `<button type="button" data-action="go-all-projects">查看全部项目</button>`}
      </div></td></tr>`}</tbody></table></div>
      ${paginationHtml(projects, allProjects.length, startIndex, pageCount)}
    </section>`;
  }

  function chartLegendHtml(scope, items, selectedState, label) {
    return `<div class="archived-chart-legend is-${scope}" role="group" aria-label="${escapeHtml(label)}">${items.map((item) => {
      const selected = selectedState[item.name] !== false;
      return `<button type="button" class="archived-chart-legend-button${selected ? " is-selected" : ""}" data-action="toggle-chart-legend" data-chart-scope="${scope}" data-series-name="${escapeHtml(item.name)}" aria-pressed="${selected}" title="${selected ? "隐藏" : "显示"}${escapeHtml(item.name)}">
        <i aria-hidden="true" style="--archived-legend-color:${item.color}"></i><span>${escapeHtml(item.name)}</span><strong>${Number(item.value || 0)}</strong>
      </button>`;
    }).join("")}</div>`;
  }

  function chartsHtml() {
    const summary = state.payload?.summary || {};
    const timeline = state.payload?.timeline || [];
    const hasTimelineEvents = timeline.some((item) => item.archived || item.restored || item.restore_detected);
    const hasArchivedProjects = Number(summary.total || 0) > 0;
    const timelineLegendItems = Object.entries(timelineKindMeta).map(([key, meta]) => ({
      name: meta.label,
      color: meta.color,
      value: timeline.reduce((sum, item) => sum + Number(item[key] || 0), 0),
    }));
    const stateLegendItems = Object.entries(stateMeta).map(([key, meta]) => ({
      name: meta.label,
      color: meta.color,
      value: lifecycleStateCount(key),
    }));
    return `<section class="archived-chart-grid">
      <article class="archived-panel archived-timeline-panel${hasTimelineEvents ? "" : " is-empty"}"><div class="archived-panel-heading"><div><span>归档 / 恢复趋势</span><h2>近 12 个月生命周期事件</h2><p>点击图例显示或隐藏事件，点击数据点联动台账；在图内滚轮缩放、拖动平移。</p></div><div class="archived-timeline-controls"><button type="button" class="archived-chart-reset" data-action="reset-timeline"${state.month || state.eventKind !== "all" || state.timelineZoom.start > 0 || state.timelineZoom.end < 100 || Object.values(state.timelineLegendSelected).some((selected) => !selected) ? "" : " disabled"}>${icon("RotateCcw")}还原时间视图</button>${chartLegendHtml("timeline", timelineLegendItems, state.timelineLegendSelected, "趋势图系列显示控制")}</div></div><div class="archived-timeline-chart" role="img" aria-label="近十二个月项目归档与恢复趋势，图例可显示隐藏事件，数据点可联动台账，鼠标滚轮可缩放并拖动平移">${hasTimelineEvents ? "" : `<div class="archived-chart-empty">${icon("CalendarDays")}<strong>暂无归档或恢复事件</strong><span>项目产生真实生命周期记录后，这里会形成月度趋势。</span></div>`}</div><div class="archived-chart-interaction-hint">${icon("Info")}<span>图例只控制图表系列；点击数据点联动台账。滚轮缩放、拖动平移，工具栏可还原或保存视图。</span></div></article>
      <article class="archived-panel archived-state-panel${hasArchivedProjects ? "" : " is-empty"}"><div class="archived-panel-heading"><div><span>当前归档状态分布</span><h2>${Number(summary.total || 0)} 个归档项目</h2><p>点击图例显示或隐藏状态，点击扇区联动筛选台账。</p></div>${icon("PieChart")}</div><div class="archived-state-chart" role="img" aria-label="当前归档项目生命周期状态分布，图例可显示隐藏状态，扇区可联动筛选台账">${hasArchivedProjects ? "" : `<div class="archived-chart-empty">${icon("ArchiveRestore")}<strong>暂无归档项目</strong><span>归档后将按可恢复、待确认和阻断状态展示。</span></div>`}</div>${chartLegendHtml("state", stateLegendItems, state.stateLegendSelected, "状态分布图显示控制")}</article>
    </section>`;
  }

  function renderShell() {
    root.innerHTML = `<div class="archived-app">
      <header class="archived-header"><div class="archived-heading"><div><span class="archived-eyebrow">项目中心</span><h1>已归档项目</h1><button type="button" class="archived-rule-link" data-action="show-rules">查看归档规则${icon("Info")}</button></div><p>归档不等于删除：关联活动、预警与变更记录持续保留。</p></div>
        <div class="archived-header-actions"><button type="button" class="archived-primary-button" data-action="export">${icon("Download")}导出归档清单</button><button type="button" class="archived-secondary-button" data-action="reload">${icon("RefreshCw")}刷新</button></div>
      </header>
      <main class="archived-scroll">${summaryHtml()}${chartsHtml()}${tableHtml()}</main>
      <div class="archived-reason-overlay" hidden><section class="archived-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="archived-reason-title"><header><div><span>生命周期记录</span><h2 id="archived-reason-title">补充归档原因</h2></div><button type="button" data-action="hide-archive-reason" aria-label="关闭归档原因编辑">${icon("X")}</button></header><label><span>归档原因</span><textarea rows="4" maxlength="500" placeholder="说明项目为何归档（至少 2 个字符）"></textarea><small>保存后写入最近一次归档活动记录，并保留修改人和修改时间。</small></label><footer><button type="button" class="archived-secondary-button" data-action="hide-archive-reason">取消</button><button type="button" class="archived-primary-button" data-action="save-archive-reason">保存原因</button></footer></section></div>
      <div class="archived-rule-overlay" hidden><section class="archived-rule-dialog" role="dialog" aria-modal="true" aria-labelledby="archived-rule-title"><header><div><span>归档规则</span><h2 id="archived-rule-title">归档数据与恢复条件</h2></div><button type="button" data-action="hide-rules" aria-label="关闭归档规则">${icon("X")}</button></header><div class="archived-rule-list"><article>${icon("Database")}<div><strong>数据持续保留</strong><p>项目归档后，活动、预警、通知和排期版本不会删除。</p></div></article><article>${icon("GitBranch")}<div><strong>GitLab 状态优先</strong><p>仓库仍处于归档状态时，平台项目不能恢复为开发中。</p></div></article><article>${icon("ShieldCheck")}<div><strong>按权限恢复</strong><p>负责人或 Maintainer 可以恢复普通归档；回收站和 GitLab 待确认项目仅管理员可恢复。</p></div></article><article>${icon("History")}<div><strong>操作可追溯</strong><p>恢复会形成系统活动记录，项目重新进入开发中看板与统计。</p></div></article></div><footer><button type="button" class="archived-primary-button" data-action="hide-rules">我知道了</button></footer></section></div>
    </div>`;
    hydrateIcons();
    const timeline = state.payload?.timeline || [];
    const hasChartData = Number(state.payload?.summary?.total || 0) > 0 || timeline.some((item) => item.archived || item.restored || item.restore_detected);
    if (hasChartData) scheduleCharts();
    else disposeCharts();
  }

  function disposeCharts() {
    window.clearTimeout(state.chartTimer);
    state.timelineChart?.dispose();
    state.stateChart?.dispose();
    state.timelineChart = null;
    state.stateChart = null;
    state.resizeObserver?.disconnect();
    state.resizeObserver = null;
  }

  function resizeCharts() {
    state.timelineChart?.resize();
    state.stateChart?.resize();
  }

  function syncTimelineResetButton() {
    const button = root.querySelector("[data-action='reset-timeline']");
    if (!button) return;
    const hasHiddenSeries = Object.values(state.timelineLegendSelected).some((selected) => !selected);
    button.disabled = !(state.month || state.eventKind !== "all" || state.timelineZoom.start > 0 || state.timelineZoom.end < 100 || hasHiddenSeries);
  }

  function syncChartLegendButtons(scope) {
    const selectedState = scope === "timeline" ? state.timelineLegendSelected : state.stateLegendSelected;
    root.querySelectorAll(`[data-chart-scope="${scope}"][data-series-name]`).forEach((button) => {
      const selected = selectedState[button.dataset.seriesName] !== false;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.title = `${selected ? "隐藏" : "显示"}${button.dataset.seriesName}`;
    });
  }

  function toggleChartLegend(scope, seriesName) {
    const meta = scope === "timeline" ? timelineKindMeta : scope === "state" ? stateMeta : null;
    const allowedNames = meta ? Object.values(meta).map((item) => item.label) : [];
    if (!allowedNames.includes(seriesName)) return;
    const stateKey = scope === "timeline" ? "timelineLegendSelected" : "stateLegendSelected";
    const chart = scope === "timeline" ? state.timelineChart : state.stateChart;
    const nextSelected = { ...state[stateKey], [seriesName]: state[stateKey][seriesName] === false };
    state[stateKey] = nextSelected;
    chart?.setOption({ legend: { selected: nextSelected } });
    syncChartLegendButtons(scope);
    if (scope === "timeline") syncTimelineResetButton();
  }

  function scheduleCharts(attempt) {
    window.clearTimeout(state.chartTimer);
    state.chartTimer = window.setTimeout(() => drawCharts(attempt || 0), attempt ? 100 : 0);
  }

  function drawCharts(attempt) {
    if (!state.active) return;
    const echarts = window.ProjectOperationsECharts;
    const timelineElement = root.querySelector(".archived-timeline-chart");
    const stateElement = root.querySelector(".archived-state-chart");
    if (!echarts || !timelineElement || !stateElement) {
      if ((attempt || 0) < 40) scheduleCharts((attempt || 0) + 1);
      return;
    }
    disposeCharts();
    const timeline = state.payload?.timeline || [];
    const hasEvents = timeline.some((item) => item.archived || item.restored || item.restore_detected);
    if (hasEvents) {
    const timelineTotals = Object.fromEntries(Object.keys(timelineKindMeta).map((key) => [
      timelineKindMeta[key].label,
      timeline.reduce((sum, item) => sum + Number(item[key] || 0), 0),
    ]));
    const timelineData = (key) => timeline.map((item) => {
      const value = Number(item[key] || 0);
      const linked = state.month === item.month && (state.eventKind === "all" || state.eventKind === key);
      return linked ? {
        value,
        symbolSize: 12,
        itemStyle: { borderColor: "#fff", borderWidth: 3, shadowBlur: 9, shadowColor: timelineKindMeta[key].color },
      } : value;
    });
    state.timelineChart = echarts.init(timelineElement, null, { renderer: "canvas" });
    state.timelineChart.setOption({
      animationDuration: 650,
      animationEasing: "cubicOut",
      aria: { enabled: true, description: "展示最近十二个月真实项目归档、恢复完成和 GitLab 恢复待确认事件。" },
      color: ["#2563eb", "#16a66a", "#ee9418"],
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, .94)",
        borderWidth: 0,
        textStyle: { color: "#fff", fontSize: 12 },
        formatter(params) {
          const month = params?.[0]?.axisValue || "";
          const lines = (params || []).map((item) => `${item.marker}${item.seriesName} <b>${item.value}</b>`);
          return `<strong>${monthLabel(month)}</strong><br>${lines.join("<br>")}`;
        },
      },
      legend: {
        show: false,
        selectedMode: true,
        selected: state.timelineLegendSelected,
        left: 0,
        top: 2,
        right: 126,
        itemWidth: 16,
        itemHeight: 9,
        itemGap: 18,
        icon: "roundRect",
        textStyle: { color: "#53627a", fontSize: 11, fontWeight: 650, lineHeight: 18 },
        formatter: (name) => `${name}  ${Number(timelineTotals[name] || 0)}`,
      },
      toolbox: {
        show: true,
        right: 8,
        top: 2,
        itemSize: 14,
        iconStyle: { borderColor: "#7890af", borderWidth: 1.4 },
        emphasis: { iconStyle: { borderColor: "#2563eb" } },
        feature: {
          dataZoom: { yAxisIndex: "none", title: { zoom: "框选缩放", back: "返回上一步" } },
          restore: { title: "还原视图" },
          saveAsImage: { title: "保存图表", name: "归档恢复趋势" },
        },
      },
      grid: { left: 40, right: 66, top: 44, bottom: 31 },
      xAxis: { type: "category", boundaryGap: false, triggerEvent: true, data: timeline.map((item) => item.month), axisLine: { lineStyle: { color: "#dbe4f0" } }, axisTick: { show: false }, axisLabel: { color: "#7b8aa0", fontSize: 10, cursor: "pointer", formatter: (value) => String(value).slice(5) } },
      yAxis: { type: "value", minInterval: 1, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#7b8aa0", fontSize: 10 }, splitLine: { lineStyle: { color: "#edf2f7" } } },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          start: state.timelineZoom.start,
          end: state.timelineZoom.end,
          minValueSpan: 2,
          zoomOnMouseWheel: true,
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
          preventDefaultMouseMove: true,
        },
      ],
      graphic: hasEvents ? [] : [{ type: "text", left: "center", top: "48%", silent: true, style: { text: "当前权限范围内暂无归档 / 恢复事件", fill: "#94a3b8", fontSize: 12 } }],
      series: [
        { name: "归档事件", type: "line", smooth: .28, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5 }, areaStyle: { color: "rgba(37, 99, 235, .08)" }, data: timelineData("archived") },
        { name: "恢复完成", type: "line", smooth: .28, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5 }, data: timelineData("restored") },
        { name: "恢复待确认", type: "line", smooth: .28, symbol: "diamond", symbolSize: 7, lineStyle: { width: 1.8, type: "dashed" }, data: timelineData("restore_detected") },
      ],
    });
    state.timelineChart.on("legendselectchanged", (params) => {
      state.timelineLegendSelected = { ...timelineLegendDefaults(), ...(params?.selected || {}) };
      syncChartLegendButtons("timeline");
      syncTimelineResetButton();
    });
    state.timelineChart.on("click", (params) => {
      const month = params?.componentType === "xAxis" ? params.value : params?.name;
      if (!month) return;
      const eventKind = Object.entries(timelineKindMeta).find(([, meta]) => meta.label === params.seriesName)?.[0] || "all";
      const isCurrentFilter = state.month === month && state.eventKind === eventKind;
      state.month = isCurrentFilter ? "" : month;
      state.eventKind = isCurrentFilter ? "all" : eventKind;
      state.expandedId = null;
      renderShell();
    });
    state.timelineChart.on("datazoom", () => {
      const zoom = state.timelineChart?.getOption()?.dataZoom?.[0];
      if (!zoom) return;
      state.timelineZoom = {
        start: Number.isFinite(Number(zoom.start)) ? Number(zoom.start) : 0,
        end: Number.isFinite(Number(zoom.end)) ? Number(zoom.end) : 100,
      };
      syncTimelineResetButton();
    });
    }

    const summary = state.payload?.summary || {};
    const pieData = Object.entries(stateMeta)
      .map(([key, meta]) => ({ name: meta.label, value: lifecycleStateCount(key), key, itemStyle: { color: meta.color } }));
    if (pieData.some((item) => item.value > 0)) {
    state.stateChart = echarts.init(stateElement, null, { renderer: "canvas" });
    state.stateChart.setOption({
      animationDuration: 700,
      animationEasing: "cubicOut",
      aria: { enabled: true, description: "展示当前归档项目按 GitLab 和恢复条件划分的生命周期状态。" },
      tooltip: { trigger: "item", formatter: ({ name, value, percent }) => `${name}<br><b>${value}</b> 个项目 · ${percent}%` },
      legend: {
        show: false,
        selectedMode: true,
        selected: state.stateLegendSelected,
        left: 4,
        right: 4,
        bottom: 0,
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 10,
        icon: "roundRect",
        padding: [6, 8],
        backgroundColor: "rgba(248, 250, 252, .94)",
        borderColor: "#dbe5f3",
        borderWidth: 1,
        borderRadius: 7,
        textStyle: { color: "#44546b", fontSize: 12, fontWeight: 650, lineHeight: 22 },
        formatter: (name) => {
          const item = pieData.find((entry) => entry.name === name);
          return `${name}  ${Number(item?.value || 0)}`;
        },
      },
      graphic: [
        { type: "text", left: "center", top: "34%", silent: true, style: { text: String(summary.total || 0), fill: "#182033", fontSize: 26, fontWeight: 750, textAlign: "center" } },
        { type: "text", left: "center", top: "57%", silent: true, style: { text: "归档项目", fill: "#7b8aa0", fontSize: 10, textAlign: "center" } },
      ],
      series: [{ type: "pie", radius: ["45%", "68%"], center: ["50%", "50%"], avoidLabelOverlap: true, padAngle: 2, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 }, label: { show: false }, emphasis: { scale: true, scaleSize: 5 }, data: pieData }],
    });
    state.stateChart.on("legendselectchanged", (params) => {
      state.stateLegendSelected = { ...stateLegendDefaults(), ...(params?.selected || {}) };
      syncChartLegendButtons("state");
    });
    state.stateChart.on("click", (params) => {
      const item = pieData.find((entry) => entry.name === params?.name);
      if (!item) return;
      state.lifecycle = state.lifecycle === item.key ? "all" : item.key;
      state.expandedId = null;
      renderShell();
    });
    }
    if (state.timelineChart || state.stateChart) {
      state.resizeObserver = new ResizeObserver(resizeCharts);
      state.resizeObserver.observe(root);
    }
  }

  async function loadData(force) {
    if (state.loading && !force) return;
    state.loadController?.abort();
    const controller = new AbortController();
    state.loadController = controller;
    state.loading = true;
    state.error = "";
    renderLoading();
    try {
      const response = await fetch(API_URL, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) {
        let message = `后端返回 ${response.status}`;
        try {
          const error = await response.json();
          message = error.detail || message;
        } catch (_error) {}
        throw new Error(message);
      }
      state.payload = await response.json();
      updateArchivedNavigationCount();
      renderShell();
    } catch (error) {
      if (controller.signal.aborted) return;
      state.error = error instanceof Error ? error.message : "无法加载归档项目";
      renderError();
    } finally {
      if (state.loadController === controller) state.loadController = null;
      state.loading = false;
    }
  }

  function activate() {
    if (isProjectDetailOpen()) return;
    const wasActive = state.active;
    state.active = true;
    root.classList.add("is-active");
    root.setAttribute("aria-hidden", "false");
    suspendLegacyMain(true);
    syncSidebarBounds();
    if (!state.payload && !state.loading) void loadData(false);
    else if (!state.loading && !wasActive) renderShell();
  }

  function deactivate(options) {
    const preserveData = options?.preserveData !== false;
    state.active = false;
    state.loadController?.abort();
    disposeCharts();
    root.classList.remove("is-active");
    root.setAttribute("aria-hidden", "true");
    if (!preserveData) state.payload = null;
    suspendLegacyMain(false);
  }

  function syncView() {
    ensureArchivedNavigation();
    const otherProjectViewActive = isOtherProjectNavigationActive();
    if (otherProjectViewActive) {
      state.routeSelected = false;
      replaceArchivedHash(false);
    }
    const active = !otherProjectViewActive && (state.routeSelected || isArchivedNavigationActive()) && !isProjectDetailOpen();
    syncArchivedNavigationState(active);
    if (active) {
      state.routeSelected = true;
      activate();
    }
    else deactivate({ preserveData: true });
  }

  function projectById(projectId) {
    return (state.payload?.projects || []).find((project) => Number(project.id) === Number(projectId));
  }

  function revealExpandedAudit(projectId) {
    const numericProjectId = Number(projectId);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (Number(state.expandedId) !== numericProjectId) return;
      const scroller = root.querySelector(".archived-scroll");
      const row = root.querySelector(`tr.archived-project-row[data-project-id="${numericProjectId}"]`);
      const drawer = root.querySelector(`tr.archived-audit-row[data-audit-project-id="${numericProjectId}"]`);
      if (!scroller || !row || !drawer) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const drawerRect = drawer.getBoundingClientRect();
      const topPadding = 12;
      const bottomPadding = 16;
      const previewHeight = Math.min(drawerRect.height, Math.max(180, scrollerRect.height * .48));
      const rowIsClipped = rowRect.top < scrollerRect.top + topPadding;
      const drawerPreviewIsClipped = drawerRect.top + previewHeight > scrollerRect.bottom - bottomPadding;
      if (!rowIsClipped && !drawerPreviewIsClipped) return;

      const targetTop = scroller.scrollTop + rowRect.top - scrollerRect.top - topPadding;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: Math.max(0, targetTop), behavior: reducedMotion ? "auto" : "smooth" });
    }));
  }

  function toggleAudit(projectId) {
    state.expandedId = Number(state.expandedId) === Number(projectId) ? null : Number(projectId);
    renderShell();
    if (state.expandedId) revealExpandedAudit(projectId);
  }

  function openProjectDetail(projectId) {
    const numericProjectId = Number(projectId);
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0) return;
    if (typeof window.__legacyOpenProject !== "function") {
      showToast("项目详情入口暂时不可用，请刷新页面后重试。", "warning");
      return;
    }
    state.routeSelected = false;
    deactivate({ preserveData: true });
    const request = window.__legacyOpenProject(numericProjectId);
    window.__legacyProjectDetailReturn = { page: "projects", scope: "all" };
    void Promise.resolve(request).catch((error) => {
      console.error("[archived-audit] unable to open project detail", error);
      showToast("项目详情打开失败，请刷新后重试。", "error");
    });
  }

  function showArchiveReasonDialog(project) {
    if (!project || !canEditArchiveReason(project)) {
      showToast("当前账号或归档来源不允许修改该原因。", "warning");
      return;
    }
    const overlay = root.querySelector(".archived-reason-overlay");
    if (!overlay) return;
    overlay.dataset.projectId = String(project.id);
    overlay.querySelector("#archived-reason-title").textContent = `归档原因 · ${projectBusinessName(project)}`;
    const input = overlay.querySelector("textarea");
    input.value = archiveReason(project) === "归档时未填写原因" ? "" : archiveReason(project);
    overlay.hidden = false;
    window.requestAnimationFrame(() => input.focus());
  }

  function hideArchiveReasonDialog() {
    const overlay = root.querySelector(".archived-reason-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.dataset.projectId = "";
  }

  async function saveArchiveReason(triggerButton) {
    const overlay = root.querySelector(".archived-reason-overlay");
    const projectId = Number(overlay?.dataset.projectId);
    const reason = overlay?.querySelector("textarea")?.value.trim() || "";
    if (!Number.isInteger(projectId) || reason.length < 2) {
      showToast("归档原因至少需要 2 个字符。", "warning");
      overlay?.querySelector("textarea")?.focus();
      return;
    }
    triggerButton.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/archive-reason`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        let message = `保存失败（${response.status}）`;
        try {
          const error = await response.json();
          message = error.detail || message;
        } catch (_error) {}
        throw new Error(message);
      }
      hideArchiveReasonDialog();
      showToast("归档原因已写入项目生命周期记录。", "success");
      await loadData(true);
      state.expandedId = projectId;
      renderShell();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "归档原因保存失败", "error");
    } finally {
      triggerButton.disabled = false;
    }
  }

  async function restoreProject(project, triggerButton) {
    if (!project) return;
    if (!project.restore?.can_restore) {
      state.expandedId = Number(project.id);
      renderShell();
      showToast(project.restore?.blockers?.[0] || "当前项目暂不能恢复", "warning");
      return;
    }
    const confirmed = typeof window.legacyConfirmProjectStatus === "function"
      ? await window.legacyConfirmProjectStatus({ action: "restore", projectName: projectBusinessName(project), triggerButton })
      : window.confirm(`确认恢复项目“${projectBusinessName(project)}”吗？`);
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/projects/${Number(project.id)}/status`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status: "developing" }),
      });
      if (!response.ok) {
        let message = `恢复失败（${response.status}）`;
        try {
          const error = await response.json();
          message = error.detail || message;
        } catch (_error) {}
        throw new Error(message);
      }
      showToast(`项目“${projectBusinessName(project)}”已恢复为开发中`, "success");
      state.expandedId = null;
      await loadData(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "项目恢复失败", "error");
    }
  }

  function exportCsv() {
    const projects = filteredProjects();
    const rows = [["项目", "需求方", "负责人", "参与人", "归档时间", "归档操作人", "归档来源", "归档原因", "GitLab 路径", "仓库状态", "活动记录", "预警记录", "排期状态", "恢复建议"]];
    projects.forEach((project) => rows.push([
      projectBusinessName(project),
      project.demand_source,
      project.owner_name,
      (project.participants || []).join("、"),
      formatDate(project.archived_event?.occurred_at, true),
      project.archived_event?.actor || "系统",
      sourceMeta[project.archived_event?.source] || sourceMeta.system,
      archiveReason(project),
      project.gitlab_project_id || "",
      project.restore?.label || "",
      project.retention?.activities || 0,
      project.retention?.alerts || 0,
      statusLabel(project.retention?.schedule?.status || "none"),
      project.restore?.action_label || "",
    ]));
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `已归档项目-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${projects.length} 个真实归档项目`, "success");
  }

  function resetFilters() {
    state.search = "";
    state.lifecycle = "all";
    state.source = "all";
    state.month = "";
    state.eventKind = "all";
    state.timelineZoom = { start: 0, end: 100 };
    state.timelineLegendSelected = timelineLegendDefaults();
    state.stateLegendSelected = stateLegendDefaults();
    state.page = 1;
    state.expandedId = null;
    renderShell();
  }

  function resetTimelineView() {
    state.month = "";
    state.eventKind = "all";
    state.timelineZoom = { start: 0, end: 100 };
    state.timelineLegendSelected = timelineLegendDefaults();
    state.page = 1;
    state.expandedId = null;
    renderShell();
  }

  function goAllProjects() {
    const buttons = Array.from(document.querySelectorAll(".sidebar .nav-children button"));
    const target = buttons.find((button) => compact(button.textContent).replace(/\s+\d+$/, "") === "全部项目");
    if (!target) return;
    state.routeSelected = false;
    replaceArchivedHash(false);
    syncArchivedNavigationState(false);
    deactivate({ preserveData: true });
    target.click();
  }

  function renderSearchDrivenTable(caretPosition) {
    const currentTable = root.querySelector(".archived-table-panel");
    if (!currentTable) {
      renderShell();
      return;
    }
    currentTable.outerHTML = tableHtml();
    hydrateIcons();
    window.requestAnimationFrame(() => {
      const input = root.querySelector(".archived-search input");
      if (!input) return;
      input.focus();
      const position = Math.min(Number(caretPosition) || 0, input.value.length);
      input.setSelectionRange(position, position);
    });
  }

  function scheduleSearchRender(delay, caretPosition) {
    window.clearTimeout(root.searchTimer);
    root.searchTimer = window.setTimeout(() => renderSearchDrivenTable(caretPosition), delay);
  }

  root.addEventListener("input", (event) => {
    if (!event.target.matches(".archived-search input")) return;
    state.search = event.target.value;
    state.page = 1;
    state.expandedId = null;
    if (event.isComposing || root.searchComposing) return;
    scheduleSearchRender(160, event.target.selectionStart);
  });

  root.addEventListener("compositionstart", (event) => {
    if (event.target.matches(".archived-search input")) root.searchComposing = true;
  });

  root.addEventListener("compositionend", (event) => {
    if (!event.target.matches(".archived-search input")) return;
    root.searchComposing = false;
    state.search = event.target.value;
    state.page = 1;
    state.expandedId = null;
    scheduleSearchRender(1, event.target.selectionStart);
  });

  root.addEventListener("change", (event) => {
    if (!event.target.matches("[data-archived-page-size]")) return;
    const pageSize = Number(event.target.value);
    if (!PAGE_SIZES.includes(pageSize)) return;
    state.pageSize = pageSize;
    state.page = 1;
    state.expandedId = null;
    renderShell();
  });

  root.addEventListener("keydown", (event) => {
    const selectControl = event.target.closest && event.target.closest("[data-archived-select]");
    if (selectControl) {
      const trigger = selectControl.querySelector("[data-archived-select-toggle]");
      const options = Array.from(selectControl.querySelectorAll("[data-archived-select-option]"));
      if (event.target === trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (!selectControl.classList.contains("is-open")) {
          setArchivedSelectMenuOpen(selectControl, true, event.key === "ArrowUp" ? "last" : "selected");
          return;
        }
        const activeId = trigger.getAttribute("aria-activedescendant");
        const activeIndex = Math.max(0, options.findIndex((option) => option.id === activeId));
        const nextIndex = event.key === "ArrowDown"
          ? (activeIndex + 1) % options.length
          : (activeIndex - 1 + options.length) % options.length;
        setActiveArchivedSelectOption(selectControl, options[nextIndex]);
        return;
      }
      if (event.target === trigger && selectControl.classList.contains("is-open") && ["Home", "End"].includes(event.key)) {
        event.preventDefault();
        setActiveArchivedSelectOption(selectControl, event.key === "Home" ? options[0] : options[options.length - 1]);
        return;
      }
      if (event.target === trigger && selectControl.classList.contains("is-open") && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        const activeId = trigger.getAttribute("aria-activedescendant");
        options.find((option) => option.id === activeId)?.click();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setArchivedSelectMenuOpen(selectControl, false);
        trigger?.focus();
        return;
      }
      if (event.key === "Tab") setArchivedSelectMenuOpen(selectControl, false);
    }
    const row = event.target.closest("tr[data-project-id]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      toggleAudit(row.dataset.projectId);
    }
    if (event.key === "Escape" && !root.querySelector(".archived-rule-overlay")?.hidden) {
      root.querySelector(".archived-rule-overlay").hidden = true;
    }
    if (event.key === "Escape" && !root.querySelector(".archived-reason-overlay")?.hidden) {
      hideArchiveReasonDialog();
    }
  });

  root.addEventListener("click", (event) => {
    const selectControl = event.target.closest("[data-archived-select]");
    if (!selectControl) closeArchivedSelectMenus();
    const selectButton = event.target.closest("button");
    if (selectButton?.dataset.archivedSelectToggle) {
      setArchivedSelectMenuOpen(selectControl, !selectControl.classList.contains("is-open"));
      return;
    }
    if (selectButton?.dataset.archivedSelectOption) {
      const key = selectButton.dataset.archivedSelectOption;
      setArchivedSelectMenuOpen(selectControl, false);
      applyArchivedSelectValue(key, selectButton.dataset.value);
      window.requestAnimationFrame(() => root.querySelector(`[data-archived-select-toggle="${key}"]`)?.focus());
      return;
    }
    const sort = event.target.closest("[data-sort]");
    if (sort) {
      if (state.sort === sort.dataset.sort) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      else {
        state.sort = sort.dataset.sort;
        state.sortDirection = sort.dataset.sort === "project" || sort.dataset.sort === "owner" ? "asc" : "desc";
      }
      state.page = 1;
      state.expandedId = null;
      renderShell();
      return;
    }
    const button = selectButton;
    if (!button) {
      const row = event.target.closest("tr[data-project-id]");
      if (row) toggleAudit(row.dataset.projectId);
      return;
    }
    const action = button.dataset.action;
    if (action === "reload") void loadData(true);
    else if (action === "reset-filters") resetFilters();
    else if (action === "page-prev") {
      state.page = Math.max(1, state.page - 1);
      state.expandedId = null;
      renderShell();
    } else if (action === "page-next") {
      const pageCount = Math.max(1, Math.ceil(filteredProjects().length / state.pageSize));
      state.page = Math.min(pageCount, state.page + 1);
      state.expandedId = null;
      renderShell();
    }
    else if (action === "reset-timeline") resetTimelineView();
    else if (action === "toggle-chart-legend") toggleChartLegend(button.dataset.chartScope, button.dataset.seriesName);
    else if (action === "toggle-audit") toggleAudit(button.dataset.projectId);
    else if (action === "open-project") openProjectDetail(button.dataset.projectId);
    else if (action === "edit-archive-reason") showArchiveReasonDialog(projectById(button.dataset.projectId));
    else if (action === "hide-archive-reason") hideArchiveReasonDialog();
    else if (action === "save-archive-reason") void saveArchiveReason(button);
    else if (action === "restore") void restoreProject(projectById(button.dataset.projectId), button);
    else if (action === "export") exportCsv();
    else if (action === "go-all-projects") goAllProjects();
    else if (action === "show-rules") {
      const overlay = root.querySelector(".archived-rule-overlay");
      overlay.hidden = false;
      overlay.querySelector("[data-action='hide-rules']")?.focus();
    } else if (action === "hide-rules") root.querySelector(".archived-rule-overlay").hidden = true;
  }, true);

  document.addEventListener("click", (event) => {
    if (!event.target?.closest) return;
    const sidebarButton = event.target.closest(".sidebar button");
    if (sidebarButton && !sidebarButton.classList.contains(NAV_CLASS)) {
      if (sidebarButton.matches(".sidebar-collapse-btn, .sidebar-resize-handle") || sidebarButton.closest(".sidebar-foot, .o2o-primary-footer")) return;
      if (sidebarButton.matches(".nav-group > button")) return;
      state.navigationEpoch += 1;
      state.routeSelected = false;
      replaceArchivedHash(false);
      syncArchivedNavigationState(false);
      markProjectNavigationActive(sidebarButton);
      deactivate({ preserveData: true });
      window.requestAnimationFrame(syncView);
      return;
    }
    if (!state.active) return;
    if (!event.target.closest(`.${ROOT_CLASS}`)) closeArchivedSelectMenus();
  }, true);

  let syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    window.requestAnimationFrame(() => {
      syncScheduled = false;
      syncView();
    });
  }

  new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-current"] });
  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener(WORKBENCH_ROUTE_EVENT, (event) => {
    if (event.detail?.hash === ARCHIVED_HASH) return;
    state.navigationEpoch += 1;
    state.routeSelected = false;
    if (window.location.hash === ARCHIVED_HASH) replaceArchivedHash(false);
    syncArchivedNavigationState(false);
    deactivate({ preserveData: true });
  });
  window.addEventListener("resize", syncSidebarBounds, { passive: true });
  ensureArchivedNavigation();
  scheduleSync();
})();
