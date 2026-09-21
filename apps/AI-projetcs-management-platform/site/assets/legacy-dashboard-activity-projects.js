(function dashboardActivityProjectDetails() {
  "use strict";

  const USER_ID_KEY = "ai_project_hub_user_id";
  const INSPECTOR_SELECTOR = ".heatmap-panel .contribution-inspector";
  const OVERLAY_ID = "dashboard-activity-project-details";
  const ACTIVE_PROJECT_STATUSES = new Set(["developing", "online"]);
  const HEALTH_LABELS = {
    normal: "正常",
    attention: "关注",
    alert: "异常",
    critical: "严重",
    stalled: "停滞",
    unknown: "待接入",
  };
  const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  let scheduled = false;
  let overlay = null;
  let triggerButton = null;
  let keydownHandler = null;

  function compact(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function projectBusinessName(project) {
    const item = project || {};
    return compact(item.display_name_zh || item.display_name || item.name) || "未命名项目";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseVisibleDate(label) {
    const match = compact(label).match(/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!month || !day) return null;

    const now = new Date();
    const candidates = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
      .map((year) => new Date(year, month - 1, day, 12, 0, 0, 0))
      .filter((candidate) => candidate.getMonth() === month - 1 && candidate.getDate() === day)
      .sort((left, right) => Math.abs(left.getTime() - now.getTime()) - Math.abs(right.getTime() - now.getTime()));
    const selected = candidates[0];
    if (!selected) return null;
    return `${selected.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function selectedDateKey(inspector) {
    const board = inspector.closest(".contribution-board") || inspector.parentElement;
    const activeDay = board?.querySelector(".contribution-day.active");
    const dateFromCell = parseVisibleDate(activeDay?.querySelector("span")?.textContent);
    if (dateFromCell) return dateFromCell;

    const textMatch = compact(inspector.querySelector("strong")?.textContent).match(/(\d{1,2})月(\d{1,2})日/);
    return textMatch ? parseVisibleDate(`${textMatch[1]}/${textMatch[2]}`) : null;
  }

  function dayLabel(dateKey) {
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey || "当前日期";
    return `${date.getMonth() + 1}月${date.getDate()}日 ${DAY_LABELS[date.getDay()]}`;
  }

  function projectActivityCount(project, dateKey) {
    const day = (project.activity_daily_counts || []).find((item) => item?.date === dateKey);
    return Math.max(0, Number(day?.count || 0));
  }

  function activeProjectsForDay(projects, dateKey) {
    return (Array.isArray(projects) ? projects : [])
      .filter((project) => project && ACTIVE_PROJECT_STATUSES.has(compact(project.status)))
      .map((project) => ({ project, signalCount: projectActivityCount(project, dateKey) }))
      .filter((item) => item.signalCount > 0)
      .sort((left, right) => (
        right.signalCount - left.signalCount
        || projectBusinessName(left.project).localeCompare(projectBusinessName(right.project), "zh-CN")
      ));
  }

  function projectOwnerChatUrl(project) {
    if (!project || project.owner_feishu_receive_eligible !== true) return "";
    const ownerUserId = Number(project.owner_user_id);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) return "";
    return `/api/users/${ownerUserId}/feishu-chat`;
  }

  async function fetchDashboardProjects() {
    const headers = { Accept: "application/json" };
    const userId = window.localStorage.getItem(USER_ID_KEY);
    if (userId) headers["X-User-Id"] = userId;

    const response = await window.fetch("/api/dashboard", {
      credentials: "same-origin",
      headers,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || `项目清单加载失败（${response.status}）`);
    return body?.projects || [];
  }

  function closeModal() {
    if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
    overlay?.remove();
    overlay = null;
    document.body.classList.remove("dashboard-activity-details-open");
    if (triggerButton?.isConnected) triggerButton.focus();
    triggerButton = null;
  }

  function openProject(projectId) {
    const numericProjectId = Number(projectId);
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0) return;
    closeModal();
    if (typeof window.__legacyOpenProject === "function") {
      Promise.resolve(window.__legacyOpenProject(numericProjectId)).catch(() => {
        window.location.assign(`/projects/${numericProjectId}`);
      });
      return;
    }
    window.location.assign(`/projects/${numericProjectId}`);
  }

  function createOverlay() {
    closeModal();
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "dashboard-activity-details-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) closeModal();
    });
    document.body.append(overlay);
    document.body.classList.add("dashboard-activity-details-open");
    keydownHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    };
    document.addEventListener("keydown", keydownHandler);
    return overlay;
  }

  function modalShell(dateKey) {
    if (!overlay) return null;
    const modal = document.createElement("section");
    modal.className = "dashboard-activity-details-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "dashboard-activity-details-title");
    modal.innerHTML = `
      <header class="dashboard-activity-details-head">
        <div>
          <p>项目活跃明细</p>
          <h2 id="dashboard-activity-details-title">${escapeHtml(dayLabel(dateKey))} 的全部活跃项目</h2>
          <span>按当前热力图统计口径加载；点击项目名进入详情，点击负责人打开飞书私聊。</span>
        </div>
        <button type="button" class="dashboard-activity-details-close" aria-label="关闭活跃项目明细">×</button>
      </header>
      <div class="dashboard-activity-details-body" data-activity-project-body></div>
    `;
    modal.querySelector(".dashboard-activity-details-close")?.addEventListener("click", closeModal);
    overlay.replaceChildren(modal);
    return modal.querySelector("[data-activity-project-body]");
  }

  function renderLoading(dateKey) {
    const body = modalShell(dateKey);
    if (!body) return;
    body.innerHTML = `
      <div class="dashboard-activity-details-state" role="status" aria-live="polite" aria-busy="true">
        <i class="dashboard-activity-details-spinner" aria-hidden="true"></i>
        <strong>正在加载 ${escapeHtml(dayLabel(dateKey))} 的活跃项目</strong>
        <span>正在汇总项目与当天的 GitLab / 人工进展信号。</span>
      </div>
    `;
  }

  function renderError(dateKey, message, onRetry) {
    const body = modalShell(dateKey);
    if (!body) return;
    body.innerHTML = `
      <div class="dashboard-activity-details-state is-error" role="alert">
        <strong>项目清单暂时无法加载</strong>
        <span>${escapeHtml(message || "请稍后重试")}</span>
        <button type="button" class="dashboard-activity-details-retry">重新加载</button>
      </div>
    `;
    body.querySelector(".dashboard-activity-details-retry")?.addEventListener("click", onRetry);
  }

  function renderResults(dateKey, rows, query = "") {
    const body = modalShell(dateKey);
    if (!body) return;
    const normalizedQuery = compact(query).toLocaleLowerCase("zh-CN");
    const rankedRows = rows.map((item, index) => ({ ...item, sequence: index + 1 }));
    const filteredRows = rankedRows.filter(({ project }) => {
      if (!normalizedQuery) return true;
      const searchable = [
        projectBusinessName(project),
        project.name,
        project.owner_name,
        project.gitlab_project_id,
        project.gitlab_instance_label,
        project.demand_source,
      ].map(compact).join(" ").toLocaleLowerCase("zh-CN");
      return searchable.includes(normalizedQuery);
    });
    const signalTotal = rows.reduce((total, item) => total + item.signalCount, 0);

    const resultRows = filteredRows.map(({ project, signalCount, sequence }) => {
      const projectName = projectBusinessName(project);
      const repository = compact(project.gitlab_project_id) || compact(project.gitlab_repo_url) || "未关联 GitLab 项目";
      const owner = compact(project.owner_name) || "待确认负责人";
      const source = compact(project.gitlab_instance_label) || compact(project.demand_source) || "未接入来源";
      const health = HEALTH_LABELS[compact(project.health)] || "待确认";
      const ownerChatUrl = projectOwnerChatUrl(project);
      const ownerControl = ownerChatUrl
        ? `<a class="dashboard-activity-project-owner is-chat" href="${escapeHtml(ownerChatUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在飞书中与${escapeHtml(owner)}私聊" title="打开${escapeHtml(owner)}的飞书私聊">
            <span><b>${escapeHtml(owner)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg></span>
            <small>飞书私聊</small>
          </a>`
        : `<span class="dashboard-activity-project-owner is-unavailable" aria-label="${escapeHtml(owner)}，当前不可通过平台飞书私聊" title="该负责人当前不可通过平台飞书私聊"><b>${escapeHtml(owner)}</b></span>`;
      return `
        <article class="dashboard-activity-project-row">
          <span class="dashboard-activity-project-sequence${sequence <= 3 ? " is-top" : ""}" aria-label="序号 ${sequence}">${sequence}</span>
          <div class="dashboard-activity-project-main">
            <button type="button" class="dashboard-activity-project-name" data-open-project="${Number(project.id)}" title="打开 ${escapeHtml(projectName)} 的详情">${escapeHtml(projectName)}</button>
            <span title="${escapeHtml(repository)}">${escapeHtml(repository)}</span>
          </div>
          <div class="dashboard-activity-project-meta"><small>来源</small><b>${escapeHtml(source)}</b></div>
          <div class="dashboard-activity-project-meta is-owner"><small>负责人</small>${ownerControl}</div>
          <div class="dashboard-activity-project-meta"><small>状态</small><b>${escapeHtml(health)}</b></div>
          <strong class="dashboard-activity-project-signals">${signalCount}<small>个信号</small></strong>
        </article>
      `;
    }).join("");

    body.innerHTML = `
      <section class="dashboard-activity-details-summary" aria-label="当天活跃项目统计">
        <strong>${signalTotal}</strong><span>个活跃信号</span>
        <i aria-hidden="true"></i>
        <strong>${rows.length}</strong><span>个项目有动静</span>
      </section>
      <label class="dashboard-activity-details-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value="${escapeHtml(query)}" placeholder="搜索项目、负责人或 GitLab 路径" aria-label="搜索当天活跃项目" autocomplete="off" />
      </label>
      <div class="dashboard-activity-details-list" aria-live="polite">
        <div class="dashboard-activity-details-list-head"><span>序号</span><span>项目</span><span>来源</span><span>负责人</span><span>状态</span><span>当天活跃</span></div>
        ${resultRows || `<div class="dashboard-activity-details-empty">没有匹配的活跃项目</div>`}
      </div>
    `;

    const searchInput = body.querySelector("input[type='search']");
    searchInput?.addEventListener("input", () => {
      const nextQuery = searchInput.value;
      renderResults(dateKey, rows, nextQuery);
      const nextInput = overlay?.querySelector("input[type='search']");
      nextInput?.focus();
      nextInput?.setSelectionRange(nextQuery.length, nextQuery.length);
    });
    body.querySelectorAll("[data-open-project]").forEach((button) => {
      button.addEventListener("click", () => openProject(button.getAttribute("data-open-project")));
    });
  }

  async function openDetails(inspector, button) {
    const dateKey = selectedDateKey(inspector);
    if (!dateKey) return;
    triggerButton = button;
    createOverlay();
    renderLoading(dateKey);
    try {
      const projects = await fetchDashboardProjects();
      if (!overlay) return;
      renderResults(dateKey, activeProjectsForDay(projects, dateKey));
      overlay.querySelector(".dashboard-activity-details-close")?.focus();
    } catch (error) {
      if (!overlay) return;
      renderError(dateKey, error?.message || "请检查网络后重试", () => openDetails(inspector, button));
      overlay.querySelector(".dashboard-activity-details-retry")?.focus();
    }
  }

  function enhanceInspector(inspector) {
    const summary = inspector.querySelector(":scope > div:first-child");
    if (!summary || summary.querySelector(".contribution-view-project-details")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "contribution-view-project-details";
    button.textContent = "点击查看详情";
    button.title = "加载当天全部活跃项目";
    button.addEventListener("click", () => openDetails(inspector, button));
    summary.append(button);
  }

  function enhance() {
    scheduled = false;
    document.querySelectorAll(INSPECTOR_SELECTOR).forEach(enhanceInspector);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  document.addEventListener("DOMContentLoaded", schedule);
  window.addEventListener("load", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
