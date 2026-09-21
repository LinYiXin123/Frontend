(function projectOperationsView() {
  "use strict";

  const ROOT_CLASS = "project-ops-root";
  const API_URL = "/api/project-operations?scope=all&days=21";
  const WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  const ALERT_PROJECT_FOCUS_EVENT = "legacy-alert-workbench:focus-project";
  const healthOrder = { stalled: 0, critical: 1, alert: 2, attention: 3, unknown: 4, normal: 5 };
  const healthMeta = {
    normal: { label: "正常", color: "#16a66a", className: "normal" },
    attention: { label: "关注", color: "#ee9418", className: "attention" },
    alert: { label: "异常", color: "#e5484d", className: "alert" },
    critical: { label: "严重", color: "#d93d63", className: "alert" },
    stalled: { label: "停滞", color: "#64748b", className: "stalled" },
    unknown: { label: "待接入", color: "#94a3b8", className: "stalled" },
  };
  const sourceMeta = {
    gitlab_commit: { label: "Commit", color: "#2563eb" },
    gitlab_mr: { label: "MR", color: "#7c5cff" },
    gitlab_branch: { label: "Branch", color: "#21a6b8" },
    gitlab_issue: { label: "Issue", color: "#d95387" },
    manual: { label: "人工进展", color: "#17a673" },
  };
  const chartSourceKeys = {
    Commit: ["commit"],
    MR: ["merge_request"],
    Branch: ["branch"],
    "人工进展": ["manual"],
    Issue: ["issue"],
  };
  const activitySourceKeys = new Set(["commit", "merge_request", "branch", "issue", "manual"]);
  const retiredActivitySources = new Set(["delivery", "code_quality"]);
  const diagnosticMeta = [
    { key: "code", label: "代码活跃" },
    { key: "team", label: "成员关联" },
    { key: "runtime", label: "运行监控" },
    { key: "milestone", label: "里程碑" },
  ];
  const diagnosticStateMeta = {
    complete: { label: "完整", icon: "circle-check", className: "is-complete" },
    progress: { label: "进行中", icon: "circle-dashed", className: "is-progress" },
    pending: { label: "待补充", icon: "circle-alert", className: "is-pending" },
    blocked: { label: "阻断", icon: "circle-x", className: "is-blocked" },
    no_data: { label: "无数据", icon: "circle-help", className: "is-no-data" },
  };
  const riskMeta = {
    milestone: { label: "里程碑逾期", color: "#ef4444" },
    inactivity: { label: "长期静默", color: "#64748b" },
    runtime: { label: "运行未监控", color: "#8b7cf6" },
    feishu: { label: "飞书不可达", color: "#f59e0b" },
    repository: { label: "仓库未接入", color: "#3b82f6" },
    other: { label: "其他风险", color: "#94a3b8" },
  };
  const timelinePageSize = 5;
  const diagnosisPageSize = 8;
  const priorityVisibleCount = 5;
  const priorityScrollInterval = 2800;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    active: false,
    loading: false,
    error: "",
    payload: null,
    selectedId: null,
    sourceChartProjectId: null,
    inspectorTab: "overview",
    page: 1,
    pageSize: 8,
    timelinePage: 1,
    diagnosisPage: 1,
    decisionScopeSignature: "",
    priorityScrollIndex: 0,
    priorityScrollPaused: false,
    priorityScrollTimer: 0,
    filters: {
      organization: "all",
      health: "all",
      signal: "all",
      completeness: "all",
      sort: "risk",
      chartDate: "",
      chartSource: "",
      riskReason: "",
      diagnosticDimension: "",
      search: "",
    },
    loadController: null,
    searchTimer: 0,
    transitionToken: 0,
    charts: { trend: null, source: null, deliveryTimeline: null, risk: null },
    timelineResizeObserver: null,
    timelineResizeTarget: null,
    timelineResizeWidth: 0,
    timelineResizeFrame: 0,
    detailReturnContext: null,
  };

  let root = document.querySelector(`.${ROOT_CLASS}`);
  if (!root) {
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.setAttribute("aria-label", "全部项目运营总览");
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

  function safeUrl(value, allowRelative) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (allowRelative && raw.startsWith("/")) return raw;
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
    return `/api/users/${userId}/feishu-chat`;
  }

  function formatPercent(value, total) {
    if (!total) return 0;
    return Math.round((Number(value || 0) / total) * 100);
  }

  function formatDateTime(value) {
    if (!value) return "暂无";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function formatRelative(value) {
    if (!value) return "暂无信号";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absolute = Math.abs(seconds);
    const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
    if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
    if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
    if (absolute < 604800) return formatter.format(Math.round(seconds / 86400), "day");
    return formatDateTime(value);
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim();
  }

  function projectDisplayName(project) {
    const item = project || {};
    return String(item.display_name_zh || item.display_name || item.name || "").trim() || "未命名项目";
  }

  function fuzzyFieldScore(query, value) {
    const needle = normalizeSearch(query);
    const haystack = normalizeSearch(value);
    if (!needle) return 1;
    if (!haystack) return -1;
    const exactIndex = haystack.indexOf(needle);
    if (exactIndex >= 0) return 1000 - exactIndex * 2 - (haystack.length - needle.length);
    let cursor = 0;
    let first = -1;
    let previous = -1;
    let gaps = 0;
    for (const character of needle) {
      const index = haystack.indexOf(character, cursor);
      if (index < 0) return -1;
      if (first < 0) first = index;
      if (previous >= 0) gaps += Math.max(0, index - previous - 1);
      previous = index;
      cursor = index + 1;
    }
    return 540 - first * 3 - gaps * 8 - (haystack.length - needle.length);
  }

  function projectSearchScore(project, query) {
    if (!query) return 0;
    const fields = [
      projectDisplayName(project),
      project.name,
      project.owner_name,
      project.gitlab_project_id,
      project.gitlab_instance_label,
      project.demand_source,
      ...(project.participants || []),
    ];
    return Math.max(...fields.map((value) => fuzzyFieldScore(query, value)));
  }

  function projectActivityCount(project) {
    return (project.timeline_events || []).reduce((total, event) => (
      activitySourceKeys.has(event.source) ? total + Number(event.count || 0) : total
    ), 0);
  }

  function organizationKey(project) {
    const source = String(`${project.gitlab_instance_label || ""} ${project.gitlab_base_url || ""} ${project.demand_source || ""}`);
    if (source.includes("丽珠") || source.includes("10.10.132.18")) return "lizhu";
    if (source.includes("健康元") || source.includes("joincare")) return "joincare";
    return "unlinked";
  }

  function projectLogo(project) {
    const source = String(project.gitlab_instance_label || project.demand_source || "");
    if (source.includes("丽珠")) return "/assets/logos/lizhu.png";
    if (source.includes("健康元")) return "/assets/logos/jiankangyuan.png";
    return project.gitlab_base_url ? "/assets/logos/gitlab.png" : "/image/logo.png";
  }

  function avatarHtml(user, title) {
    const person = user || {};
    const imageUrl = safeUrl(person.feishu_avatar_url, true);
    const name = String(person.name || title || "待确认").trim();
    const fallback = name.slice(0, 2);
    return `<span class="ops-avatar" title="${escapeHtml(name)}">${
      imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" referrerpolicy="no-referrer">`
        : escapeHtml(fallback)
    }</span>`;
  }

  function memberLineHtml(person, roleLabel) {
    const name = String(person?.name || "待确认").trim();
    const chatUrl = feishuChatUrl(person);
    const mappingLabel = chatUrl ? "飞书私聊" : person?.feishu_mapped ? "飞书已映射 · 不接收" : "待补飞书";
    const content = `${avatarHtml(person)}<span class="ops-member-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(roleLabel)}</small></span><span class="ops-mapping-state${person?.feishu_mapped ? "" : " is-missing"}">${mappingLabel}</span>`;
    return chatUrl
      ? `<a class="ops-member-line ops-member-chat" href="${escapeHtml(chatUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在飞书中与${escapeHtml(name)}私聊" title="打开${escapeHtml(name)}的飞书会话">${content}</a>`
      : `<div class="ops-member-line">${content}</div>`;
  }

  function teamHtml(project, limit) {
    const people = [project.owner_user, ...(project.participant_users || [])].filter(Boolean);
    if (!people.length) return `<span class="ops-status-pill is-warn">待关联成员</span>`;
    const visible = people.slice(0, limit || 3);
    return `<div class="ops-team-cell">${visible.map((person) => avatarHtml(person)).join("")}${
      people.length > visible.length ? `<span class="ops-team-more">+${people.length - visible.length}</span>` : ""
    }</div>`;
  }

  function runtimeView(runtime) {
    const stateKey = (runtime && runtime.state) || "not_configured";
    return {
      healthy: { label: "运行健康", className: "is-good" },
      degraded: { label: "运行降级", className: "is-warn" },
      down: { label: "运行故障", className: "is-bad" },
      pending: { label: "等待探测", className: "is-warn" },
      not_configured: { label: "未配置", className: "" },
    }[stateKey] || { label: stateKey, className: "" };
  }

  function projectTeam(project) {
    return [project.owner_user, ...(project.participant_users || [])].filter(Boolean);
  }

  function projectHasFeishuReach(project) {
    return projectTeam(project).some((person) => Boolean(feishuChatUrl(person)));
  }

  function visibleTimelineEvents(project) {
    return (project?.timeline_events || []).filter((event) => !retiredActivitySources.has(event.source));
  }

  function visibleLatestSignals(project) {
    return (project?.latest_signals || []).filter((signal) => !retiredActivitySources.has(signal.source));
  }

  function nextActionView(project) {
    const next = project?.next_action || {};
    if (!next.kind || next.kind === "delivery") {
      return { kind: "detail", label: "查看项目详情", reason: "继续跟踪项目证据。" };
    }
    return next;
  }

  function dataCompletenessScore(project) {
    const dimensions = [
      Boolean(project?.owner_user?.id || String(project?.owner_name || "").trim()),
      Boolean(project?.gitlab_base_url && project?.gitlab_project_id),
      projectHasFeishuReach(project),
      Boolean(visibleTimelineEvents(project).length || visibleLatestSignals(project).length),
    ];
    return dimensions.filter(Boolean).length * 25;
  }

  function projectRiskReason(project) {
    const alert = project.open_alert || {};
    const schedule = project.schedule;
    if (alert.alert_kind === "milestone" || schedule?.health === "overdue") return "milestone";
    if (alert.alert_kind === "inactivity" || project.health === "stalled") return "inactivity";
    if ((project.status === "online" || project.prod_url) && !project.runtime?.monitored) return "runtime";
    if (!projectHasFeishuReach(project)) return "feishu";
    if (!project.gitlab_base_url || !project.gitlab_project_id) return "repository";
    if (["attention", "alert", "critical"].includes(project.health)) return "other";
    return "";
  }

  function diagnosticValue(project, key) {
    if (key === "code") {
      if (!project.gitlab_base_url || !project.gitlab_project_id) return 0;
      return visibleLatestSignals(project).some((signal) => String(signal.source || "").startsWith("gitlab_")) ? 2 : 1;
    }
    if (key === "team") {
      const ownerActive = project.owner_user?.lifecycle_status === "active";
      if (ownerActive && projectHasFeishuReach(project)) return 2;
      return projectTeam(project).length ? 1 : 0;
    }
    if (key === "runtime") {
      const runtimeState = project.runtime?.state || "not_configured";
      if (runtimeState === "healthy") return 2;
      if (["pending", "degraded"].includes(runtimeState)) return 1;
      return 0;
    }
    if (key === "milestone") {
      const schedule = project.schedule;
      if (!schedule || schedule.status !== "active") return 0;
      if (["overdue"].includes(schedule.health)) return 0;
      return schedule.health === "attention" ? 1 : 2;
    }
    return 0;
  }

  function diagnosticDetail(project, key) {
    if (key === "code") {
      if (!project.gitlab_base_url || !project.gitlab_project_id) return "未绑定 GitLab 仓库";
      return visibleLatestSignals(project).length ? `最近信号：${signalView(project).title}` : "仓库已接入，当前周期无新信号";
    }
    if (key === "team") {
      const team = projectTeam(project);
      if (!team.length) return "未关联负责人和参与人";
      return `${team.length} 名成员 · ${projectHasFeishuReach(project) ? "飞书映射已完成" : "飞书映射待补齐"}`;
    }
    if (key === "runtime") return `${runtimeView(project.runtime).label}${project.runtime?.last_probe_at ? ` · ${formatDateTime(project.runtime.last_probe_at)}` : ""}`;
    if (key === "milestone") {
      const schedule = project.schedule;
      if (!schedule) return "尚未建立项目计划基线";
      return `${Number(schedule.completed_milestone_count || 0)} / ${Number(schedule.milestone_count || 0)} 个里程碑完成 · 实际进度 ${Number(schedule.actual_progress_pct || 0)}%`;
    }
    return "暂无诊断说明";
  }

  function diagnosticState(project, key) {
    if (key === "code") {
      if (!project.gitlab_base_url || !project.gitlab_project_id) return "blocked";
      return visibleLatestSignals(project).some((signal) => String(signal.source || "").startsWith("gitlab_"))
        ? "complete"
        : "pending";
    }
    if (key === "team") {
      const team = projectTeam(project);
      if (!team.length) return "blocked";
      const ownerActive = project.owner_user?.lifecycle_status === "active";
      return ownerActive && projectHasFeishuReach(project) ? "complete" : "pending";
    }
    if (key === "runtime") {
      const runtimeState = project.runtime?.state || "not_configured";
      if (runtimeState === "healthy") return "complete";
      if (runtimeState === "pending") return "progress";
      if (runtimeState === "degraded") return "pending";
      if (runtimeState === "down") return "blocked";
      return "no_data";
    }
    if (key === "milestone") {
      const schedule = project.schedule;
      if (!schedule || schedule.status !== "active") return "no_data";
      if (schedule.health === "overdue") return "blocked";
      if (schedule.health === "attention") return "pending";
      const total = Number(schedule.milestone_count || 0);
      const completed = Number(schedule.completed_milestone_count || 0);
      return total > 0 && completed >= total ? "complete" : "progress";
    }
    return "no_data";
  }

  function priorityAssessment(project) {
    const assessment = project.priority || {};
    const allFactors = Array.isArray(assessment.factors) ? assessment.factors : [];
    const removedPoints = allFactors
      .filter((factor) => factor.key === "delivery")
      .reduce((sum, factor) => sum + Math.max(0, Number(factor.points || 0)), 0);
    const factors = allFactors.filter((factor) => factor.key !== "delivery");
    const score = Math.max(0, Math.min(100, Math.round(Number(assessment.score || 0) - removedPoints)));
    const label = score >= 70 ? "立即处理" : score >= 50 ? "高优先" : score >= 25 ? "需关注" : "常规";
    return {
      score,
      label,
      version: assessment.version || "未标注版本",
      factors,
    };
  }

  function priorityScore(project) {
    return priorityAssessment(project).score;
  }

  function priorityExplanation(project) {
    const assessment = priorityAssessment(project);
    const factorText = assessment.factors
      .filter((factor) => Number(factor.points || 0) > 0)
      .map((factor) => `${factor.label || factor.key} +${Number(factor.points || 0)}：${factor.reason || ""}`)
      .join("；");
    return `${assessment.label} ${assessment.score} 分（${assessment.version}）${factorText ? `；${factorText}` : "；当前无加分项"}`;
  }

  function signalView(project) {
    const signal = visibleLatestSignals(project)[0];
    if (!signal) {
      return {
        title: project.last_scan_status === "failed" ? "GitLab 扫描失败" : "暂无可追溯信号",
        detail: project.last_scan_status === "failed" ? "请检查仓库连接" : "等待 Commit、MR 或人工进展",
        color: project.last_scan_status === "failed" ? "#e5484d" : "#94a3b8",
      };
    }
    const meta = sourceMeta[signal.source] || { label: signal.source || "信号", color: "#2563eb" };
    return {
      title: `${formatDateTime(signal.occurred_at)} · ${meta.label}`,
      detail: signal.title || signal.description || "已记录项目进展",
      color: meta.color,
      signal,
    };
  }

  function sortedProjects(projects, searchScores) {
    return projects.slice().sort((a, b) => {
      const sortMode = state.filters.sort || "risk";
      if (searchScores && sortMode === "risk") {
        const relevance = Number(searchScores.get(b.id) || 0) - Number(searchScores.get(a.id) || 0);
        if (relevance) return relevance;
      }
      if (sortMode !== "risk") {
        const separatorIndex = sortMode.lastIndexOf("_");
        const sortKey = sortMode.slice(0, separatorIndex);
        const direction = sortMode.slice(separatorIndex + 1);
        if (sortKey === "name") {
          const nameOrder = projectDisplayName(a).localeCompare(projectDisplayName(b), "zh-CN");
          if (nameOrder) return direction === "desc" ? -nameOrder : nameOrder;
        } else {
          const valueFor = (project) => {
            if (sortKey === "activity") return projectActivityCount(project);
            if (sortKey === "inactive") return Number(project.inactive_days || 0);
            if (sortKey === "completeness") return dataCompletenessScore(project);
            return 0;
          };
          const valueOrder = valueFor(a) - valueFor(b);
          if (valueOrder) return direction === "desc" ? -valueOrder : valueOrder;
        }
      }
      const risk = (healthOrder[a.health] ?? 9) - (healthOrder[b.health] ?? 9);
      if (risk) return risk;
      const inactive = Number(b.inactive_days || 0) - Number(a.inactive_days || 0);
      if (inactive) return inactive;
      return projectDisplayName(a).localeCompare(projectDisplayName(b), "zh-CN");
    });
  }

  function filteredProjects() {
    const projects = (state.payload && state.payload.projects) || [];
    const search = state.filters.search.trim();
    const searchScores = search ? new Map() : null;
    const filtered = projects.filter((project) => {
      if (state.filters.organization !== "all" && organizationKey(project) !== state.filters.organization) return false;
      if (
        state.filters.health !== "all"
        && !(
          state.filters.health === "alert"
            ? ["alert", "critical"].includes(project.health)
            : project.health === state.filters.health
        )
      ) return false;
      if (state.filters.signal === "gitlab" && !project.gitlab_base_url) return false;
      if (state.filters.signal === "manual" && !visibleLatestSignals(project).some((item) => item.source === "manual")) return false;
      if (state.filters.signal === "alert" && !project.open_alert) return false;
      if (state.filters.chartDate && !visibleTimelineEvents(project).some((event) => event.date === state.filters.chartDate && activitySourceKeys.has(event.source))) return false;
      if (
        state.filters.chartSource
        && !(chartSourceKeys[state.filters.chartSource] || []).some((key) => visibleTimelineEvents(project).some((event) => event.source === key))
      ) return false;
      if (state.filters.riskReason && projectRiskReason(project) !== state.filters.riskReason) return false;
      if (
        state.filters.diagnosticDimension
        && diagnosticValue(project, state.filters.diagnosticDimension) >= 2
      ) return false;
      const score = dataCompletenessScore(project);
      if (state.filters.completeness === "complete" && score < 100) return false;
      if (state.filters.completeness === "incomplete" && score >= 100) return false;
      if (!search) return true;
      const relevance = projectSearchScore(project, search);
      if (relevance < 0) return false;
      searchScores.set(project.id, relevance);
      return true;
    });
    return sortedProjects(filtered, searchScores);
  }

  function selectedProject() {
    const projects = (state.payload && state.payload.projects) || [];
    return projects.find((project) => Number(project.id) === Number(state.selectedId)) || null;
  }

  function sourceChartProject() {
    const projects = (state.payload && state.payload.projects) || [];
    return projects.find((project) => Number(project.id) === Number(state.sourceChartProjectId)) || null;
  }

  function projectSourceTimeline(project, globalTimeline) {
    const timeline = (globalTimeline || []).map((item) => ({
      date: item.date,
      sources: {
        commit: 0,
        merge_request: 0,
        branch: 0,
        issue: 0,
        manual: 0,
      },
    }));
    const byDate = new Map(timeline.map((item) => [String(item.date || ""), item]));
    visibleTimelineEvents(project).forEach((event) => {
      const source = String(event.source || "");
      const item = byDate.get(String(event.date || ""));
      if (!item || !activitySourceKeys.has(source)) return;
      item.sources[source] = Number(item.sources[source] || 0) + Number(event.count || 0);
    });
    return timeline;
  }

  function visibleOperationsTimeline() {
    const timeline = (state.payload?.timeline || []).map((item) => ({
      ...item,
      active_projects: 0,
      signal_count: 0,
      sources: {},
    }));
    const byDate = new Map(timeline.map((item) => [String(item.date || ""), item]));
    const activeByDate = new Map(timeline.map((item) => [String(item.date || ""), new Set()]));
    for (const project of state.payload?.projects || []) {
      for (const event of visibleTimelineEvents(project)) {
        const date = String(event.date || "");
        const item = byDate.get(date);
        if (!item) continue;
        const count = Math.max(1, Number(event.count || 1));
        item.sources[event.source] = Number(item.sources[event.source] || 0) + count;
        if (activitySourceKeys.has(event.source)) {
          item.signal_count += count;
          activeByDate.get(date)?.add(Number(project.id));
        }
      }
    }
    timeline.forEach((item) => {
      item.active_projects = activeByDate.get(String(item.date || ""))?.size || 0;
    });
    return timeline;
  }

  function syncSourceChartScopeUi(project) {
    const panel = root.querySelector(".ops-source-chart-panel");
    const context = root.querySelector(".ops-source-chart-context");
    const badge = root.querySelector(".ops-source-chart-scope-badge");
    const chart = root.querySelector(".ops-source-chart");
    const scoped = Boolean(project);
    panel?.classList.toggle("is-project-scope", scoped);
    if (context) {
      context.textContent = scoped
        ? `当前范围：${projectDisplayName(project)}；点击右上角“还原”返回全部项目`
        : "当前范围：全部项目；图例可筛选，点击柱形联动下方项目列表";
    }
    if (badge) badge.textContent = scoped ? "单项目" : "全部项目";
    chart?.setAttribute(
      "aria-label",
      scoped ? `${projectDisplayName(project)}过去21天活动信号来源分布` : "过去21天全部项目活动信号来源分布",
    );
  }

  function scopeSourceChartToProject(projectId) {
    const projects = (state.payload && state.payload.projects) || [];
    const project = projects.find((item) => Number(item.id) === Number(projectId));
    if (!project) return;
    state.sourceChartProjectId = Number(project.id);
    renderSourceChart(visibleOperationsTimeline());
  }

  function clearSourceChartProjectScope() {
    if (!state.sourceChartProjectId) return;
    state.sourceChartProjectId = null;
    renderSourceChart(visibleOperationsTimeline());
  }

  function sourceChartToolboxRight() {
    if (!root.classList.contains("is-inspector-open")) return 0;
    const inspectorWidth = root.querySelector(".ops-inspector")?.getBoundingClientRect().width || 0;
    return Math.max(0, Math.round(inspectorWidth + 8));
  }

  function renderLoading() {
    stopPriorityAutoScroll();
    disposeCharts();
    root.innerHTML = `<div class="ops-loading" role="status" aria-live="polite" aria-label="正在建立项目关联视图">
      <div class="ops-loading-card">
        <div class="ops-loading-visual" aria-hidden="true">
          <img src="/image/project-management-icon.png?v=20260907" alt="">
          <span class="ops-loading-spinner"></span>
        </div>
        <span class="ops-loading-kicker">项目中心 · 全部项目</span>
        <strong>正在建立项目关联视图</strong>
        <p>汇总成员、GitLab、进展信号、预警与运行态</p>
        <div class="ops-loading-bar" aria-hidden="true"><i></i></div>
        <span class="ops-loading-meta" aria-hidden="true">成员与角色&nbsp;&nbsp;·&nbsp;&nbsp;GitLab 信号&nbsp;&nbsp;·&nbsp;&nbsp;预警运行态</span>
      </div>
    </div>`;
  }

  function renderError() {
    stopPriorityAutoScroll();
    disposeCharts();
    root.innerHTML = `<div class="ops-error-state"><div class="ops-error-card"><strong>项目运营数据暂时不可用</strong><p>${escapeHtml(state.error || "请确认本地后端已经启动。")}</p><button class="ops-primary-button" type="button" data-action="refresh">重新加载</button></div></div>`;
  }

  function renderHealthSummary() {
    const counts = state.payload.health_counts || {};
    const total = Number(counts.all || 0);
    const alertCount = Number(counts.alert || 0) + Number(counts.critical || 0);
    const items = [
      ["normal", Number(counts.normal || 0), "正常推进", "最近 2 天有实质信号"],
      ["attention", Number(counts.attention || 0), "需要关注", "活跃下降或 3 天无信号"],
      ["alert", alertCount, "出现异常", "存在风险信号，建议优先跟进"],
      ["stalled", Number(counts.stalled || 0), "严重 / 停滞", "建议立即确认继续推进或归档"],
    ];
    return `<section class="ops-health-summary" aria-label="项目健康状态"><div class="ops-section-kicker"><div><strong>项目健康状态</strong><small>按最近有效信号与风险情况划分</small></div><span>共 <b class="ops-inline-count" data-count-value="${total}">0</b> 个活跃项目</span></div><div class="ops-health-grid">${items.map(([key, value, label, hint]) => `<button class="ops-health-item ops-health-${key}${state.filters.health === key ? " is-selected" : ""}" type="button" data-health-filter="${key}" aria-pressed="${state.filters.health === key}"><span class="ops-health-item-label">${label}</span><strong data-count-value="${value}">0</strong><span class="ops-health-item-share"><i data-count-value="${formatPercent(value, total)}">0</i>%</span><small>${hint}</small><em aria-hidden="true">${label === "正常推进" ? "01" : label === "需要关注" ? "02" : label === "出现异常" ? "03" : "04"}</em></button>`).join("")}</div></section>`;
  }

  function renderCoverageSummary() {
    const coverage = state.payload.coverage || {};
    const total = Number(coverage.total_projects || 0);
    const items = [
      ["负责人", Number(coverage.owner_mapped_projects || 0), "成员目录已关联"],
      ["GitLab", Number(coverage.gitlab_connected_projects || 0), "仓库绑定"],
      ["飞书映射完成", Number(coverage.feishu_reachable_projects || 0), "项目成员至少 1 人已映射"],
      ["运行检查", Number(coverage.runtime_monitored_projects || 0), "已启用健康探测"],
    ];
    return `<section class="ops-coverage-summary"><div class="ops-section-kicker"><strong>关联数据覆盖</strong><span>${escapeHtml(formatDateTime(state.payload.generated_at))} 更新</span></div><div class="ops-coverage-grid">${items.map(([label, value, hint]) => { const percent = formatPercent(value, total); return `<div class="ops-coverage-item"><span>${escapeHtml(label)}</span><strong><b data-count-value="${value}">0</b> / <b data-count-value="${total}">0</b></strong><small><i data-count-value="${percent}">0</i>% · ${escapeHtml(hint)}</small><div class="ops-progress"><i data-progress-target="${percent}" style="width:0%"></i></div></div>`; }).join("")}</div></section>`;
  }

  function renderSecondaryAnalysis() {
    return `<details class="ops-analysis-details">
      <summary>
        <span><strong>数据分析</strong><small>关联覆盖、过去 21 天活动趋势与信号来源</small></span>
        <em>按需查看</em>
      </summary>
      <div class="ops-analysis-body">
        <section class="ops-panel ops-analysis-coverage">${renderCoverageSummary()}</section>
        <section class="ops-visuals">
          <article class="ops-panel ops-chart-panel">
            <div class="ops-chart-head"><div><h2>过去 21 天活跃项目数</h2><p>悬停查看数据，点击图例显示或隐藏，点击日期筛选项目</p></div><span class="ops-chart-interaction-hint">可交互</span></div>
            <div class="ops-chart-wrap"><div class="ops-trend-chart" role="img" aria-label="过去21天活跃项目趋势"></div></div>
          </article>
          <article class="ops-panel ops-chart-panel ops-source-chart-panel">
            <div class="ops-chart-head"><div><h2>信号来源分布</h2><p class="ops-source-chart-context" aria-live="polite">当前范围：全部项目；图例可筛选，点击柱形联动项目列表</p></div><span class="ops-chart-interaction-hint ops-source-chart-scope-badge">全部项目</span></div>
            <div class="ops-chart-wrap"><div class="ops-source-chart" role="img" aria-label="过去21天全部项目活动信号来源分布"></div></div>
          </article>
        </section>
      </div>
    </details>`;
  }

  function renderDecisionFilterState() {
    const labels = [];
    if (state.filters.riskReason) labels.push(`风险：${riskMeta[state.filters.riskReason]?.label || state.filters.riskReason}`);
    if (state.filters.diagnosticDimension) {
      labels.push(`待补：${diagnosticMeta.find((item) => item.key === state.filters.diagnosticDimension)?.label || state.filters.diagnosticDimension}`);
    }
    return labels.length ? labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("") : "<span>全部关联项目</span>";
  }

  function rankedProjects(limit) {
    const projects = filteredProjects()
      .slice()
      .sort((a, b) => priorityScore(b) - priorityScore(a) || Number(b.inactive_days || 0) - Number(a.inactive_days || 0));
    return Number.isFinite(limit) ? projects.slice(0, Math.max(0, Number(limit))) : projects;
  }

  function priorityProjects() {
    return rankedProjects();
  }

  function decisionPage(projects, pageKey, pageSize) {
    const pageCount = Math.max(1, Math.ceil(projects.length / pageSize));
    const page = Math.max(1, Math.min(pageCount, Number(state[pageKey] || 1)));
    state[pageKey] = page;
    const start = (page - 1) * pageSize;
    return { projects: projects.slice(start, start + pageSize), total: projects.length, page, pageCount, start };
  }

  function timelineProjects() {
    return decisionPage(rankedProjects(), "timelinePage", timelinePageSize);
  }

  function diagnosisProjects() {
    return decisionPage(rankedProjects(), "diagnosisPage", diagnosisPageSize);
  }

  function renderDecisionPagination(kind, pageData, label) {
    const first = pageData.total ? pageData.start + 1 : 0;
    const last = Math.min(pageData.start + pageData.projects.length, pageData.total);
    return `<footer class="ops-decision-pagination" data-decision-pagination="${escapeHtml(kind)}" aria-label="${escapeHtml(label)}翻页">
      <span>${pageData.total ? `显示 ${first}-${last}，共 ${pageData.total} 个项目` : "暂无项目"}</span>
      <div>
        <button type="button" data-action="${escapeHtml(kind)}-prev-page" aria-label="${escapeHtml(label)}上一页"${pageData.page <= 1 ? " disabled" : ""}>上一页</button>
        <b aria-live="polite">${pageData.page} / ${pageData.pageCount}</b>
        <button type="button" data-action="${escapeHtml(kind)}-next-page" aria-label="${escapeHtml(label)}下一页"${pageData.page >= pageData.pageCount ? " disabled" : ""}>下一页</button>
      </div>
    </footer>`;
  }

  function renderPriorityList() {
    const projects = priorityProjects();
    if (!projects.length) return '<div class="ops-decision-empty">当前联动条件下没有待处理项目。</div>';
    return projects.map((project, index) => {
      const priority = priorityAssessment(project);
      const score = priority.score;
      const explanation = priorityExplanation(project);
      const riskKey = projectRiskReason(project) || "other";
      const meta = riskMeta[riskKey] || riskMeta.other;
      return `<article class="ops-priority-item${Number(project.id) === Number(state.selectedId) ? " is-selected" : ""}" data-priority-project="${Number(project.id)}" data-priority-index="${index}" tabindex="0" role="button" aria-label="第 ${index + 1} 项，选择项目：${escapeHtml(projectDisplayName(project))}">
        <span class="ops-priority-rank">${index + 1}</span>
        <span class="ops-priority-copy"><strong>${escapeHtml(projectDisplayName(project))}</strong><small>${escapeHtml(project.owner_name || "负责人待补齐")} · ${escapeHtml(meta.label)} · ${Number(project.inactive_days || 0)} 天静默</small></span>
        <span class="ops-priority-score" title="${escapeHtml(explanation)}" aria-label="${escapeHtml(explanation)}"><b data-count-value="${score}">0</b><small>综合分</small></span>
        <button type="button" data-action="priority-next" data-project-id="${Number(project.id)}">${escapeHtml(nextActionView(project).label || "处理")}</button>
      </article>`;
    }).join("");
  }

  function renderDiagnosisMatrix() {
    const pageData = diagnosisProjects();
    const projects = pageData.projects;
    const legend = Object.entries(diagnosticStateMeta).map(([key, meta]) => `<span class="ops-diagnosis-legend-item ${meta.className}"><i data-lucide="${meta.icon}" aria-hidden="true"></i>${escapeHtml(meta.label)}</span>`).join("");
    if (!projects.length) {
      return `<div class="ops-diagnosis-matrix"><div class="ops-diagnosis-legend" aria-label="诊断状态图例">${legend}</div><div class="ops-decision-empty">当前联动条件下没有可诊断项目。</div>${renderDecisionPagination("diagnosis", pageData, "四维健康诊断矩阵")}</div>`;
    }
    return `<div class="ops-diagnosis-matrix">
      <div class="ops-diagnosis-legend" aria-label="诊断状态图例">${legend}</div>
      <div class="ops-diagnosis-table-wrap">
        <table class="ops-diagnosis-table">
          <colgroup><col class="ops-diagnosis-rank-col"><col class="ops-diagnosis-project-col">${diagnosticMeta.map(() => '<col class="ops-diagnosis-state-col">').join("")}</colgroup>
          <thead><tr><th scope="col" aria-label="处理序号">序号</th><th scope="col">项目</th>${diagnosticMeta.map((dimension) => `<th scope="col">${escapeHtml(dimension.label)}</th>`).join("")}</tr></thead>
          <tbody>${projects.map((project, index) => `<tr${Number(project.id) === Number(state.selectedId) ? ' class="is-selected"' : ""}>
            <td><span class="ops-diagnosis-rank">${pageData.start + index + 1}</span></td>
            <th scope="row"><button type="button" class="ops-diagnosis-project" data-diagnosis-project="${Number(project.id)}" title="打开关联项目：${escapeHtml(projectDisplayName(project))}"><strong>${escapeHtml(projectDisplayName(project))}</strong></button></th>
            ${diagnosticMeta.map((dimension) => {
              const stateKey = diagnosticState(project, dimension.key);
              const meta = diagnosticStateMeta[stateKey] || diagnosticStateMeta.no_data;
              const detail = diagnosticDetail(project, dimension.key);
              const active = state.filters.diagnosticDimension === dimension.key && stateKey !== "complete";
              return `<td><button type="button" class="ops-diagnosis-cell ${meta.className}${active ? " is-active" : ""}" data-diagnosis-cell data-project-id="${Number(project.id)}" data-dimension-key="${escapeHtml(dimension.key)}" data-project-name="${escapeHtml(projectDisplayName(project))}" data-dimension-label="${escapeHtml(dimension.label)}" data-status-label="${escapeHtml(meta.label)}" data-detail="${escapeHtml(detail)}" aria-label="${escapeHtml(projectDisplayName(project))}，${escapeHtml(dimension.label)}：${escapeHtml(meta.label)}。${escapeHtml(detail)}"><i data-lucide="${meta.icon}" aria-hidden="true"></i></button></td>`;
            }).join("")}
          </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="ops-diagnosis-foot"><span>按风险优先展示 · 悬停看规则</span><span>点击联动列表</span></div>
      ${renderDecisionPagination("diagnosis", pageData, "四维健康诊断矩阵")}
    </div>`;
  }

  function renderDecisionBoard() {
    const coverage = state.payload.coverage || {};
    const scheduled = Number(coverage.scheduled_projects || 0);
    const total = Number(coverage.total_projects || 0);
    const timelinePage = timelineProjects();
    return `<section class="ops-decision-board" aria-label="项目推进与风险诊断">
      <header class="ops-decision-toolbar">
        <div><h2>项目推进与风险诊断</h2><p>同一项目 ID 贯通排期、里程碑、代码信号、成员与运行状态</p></div>
        <div class="ops-decision-state" aria-live="polite">${renderDecisionFilterState()}</div>
        <button class="ops-secondary-button ops-decision-reset" type="button" data-action="reset-decision-filters">重置联动</button>
      </header>
      <div class="ops-decision-grid">
        <article class="ops-panel ops-decision-panel ops-timeline-panel">
          <div class="ops-chart-head"><div><h2>项目推进与里程碑时间轴</h2><p>有计划时展示排期与真实里程碑；无计划时仅展示最近信号至今的静默区间</p></div><span class="ops-chart-interaction-hint">${scheduled} / ${total} 已排期</span></div>
          <div class="ops-decision-chart ops-delivery-timeline-chart" role="img" aria-label="项目推进与里程碑时间轴"></div>
          ${renderDecisionPagination("timeline", timelinePage, "项目推进时间轴")}
        </article>
        <article class="ops-panel ops-decision-panel ops-risk-panel">
          <div class="ops-chart-head"><div><h2>风险原因构成</h2><p>按每个项目当前最主要阻断原因归类，点击扇区筛选关联项目</p></div><span class="ops-chart-interaction-hint">可筛选</span></div>
          <div class="ops-decision-chart ops-risk-chart" role="img" aria-label="项目风险原因构成"></div>
        </article>
        <article class="ops-panel ops-decision-panel ops-diagnosis-panel">
          <div class="ops-chart-head"><div><h2>项目四维健康诊断矩阵</h2><p>序号对应风险优先级；状态来自仓库、成员、监控与里程碑关联数据</p></div><span class="ops-chart-interaction-hint">可诊断</span></div>
          ${renderDiagnosisMatrix()}
        </article>
        <article class="ops-panel ops-decision-panel ops-priority-panel">
          <div class="ops-chart-head"><div><h2>建议处理顺序</h2><p>综合健康等级、静默天数、未闭环预警、运行与排期阻断动态排序</p></div><span class="ops-chart-interaction-hint">实时排序</span></div>
          <div class="ops-priority-list" aria-label="完整建议处理顺序；自动滚动，悬停时暂停" data-visible-count="${priorityVisibleCount}">${renderPriorityList()}</div>
        </article>
      </div>
    </section>`;
  }

  function renderChartFilterChips() {
    const chips = [];
    if (state.filters.chartDate) chips.push(["chart-date", `活跃日期：${state.filters.chartDate.slice(5)}`]);
    if (state.filters.chartSource) chips.push(["chart-source", `信号：${state.filters.chartSource}`]);
    if (state.filters.riskReason) chips.push(["risk-reason", `风险：${riskMeta[state.filters.riskReason]?.label || state.filters.riskReason}`]);
    if (state.filters.diagnosticDimension) chips.push(["diagnostic-dimension", `待补：${diagnosticMeta.find((item) => item.key === state.filters.diagnosticDimension)?.label || state.filters.diagnosticDimension}`]);
    return chips.length
      ? `<span class="ops-chart-filter-chips">${chips.map(([key, label]) => `<button type="button" data-action="clear-${key}" aria-label="移除${escapeHtml(label)}筛选">${escapeHtml(label)}<small>移除</small></button>`).join("")}</span>`
      : "";
  }

  function filterDefinitions() {
    return [
      {
        key: "organization",
        className: "ops-filter-organization",
        label: "集团",
        options: [
          ["all", "全部"],
          ["joincare", "健康元"],
          ["lizhu", "丽珠"],
          ["unlinked", "未识别 / 未接入"],
        ],
      },
      {
        key: "health",
        className: "ops-filter-health",
        label: "健康状态",
        options: [
          ["all", "全部"],
          ["normal", "正常"],
          ["attention", "关注"],
          ["alert", "异常"],
          ["critical", "严重"],
          ["stalled", "停滞"],
          ["unknown", "待接入"],
        ],
      },
      {
        key: "signal",
        className: "ops-filter-signal",
        label: "信号来源",
        options: [
          ["all", "全部"],
          ["gitlab", "GitLab 已接入"],
          ["manual", "人工进展"],
          ["alert", "存在预警"],
        ],
      },
      {
        key: "completeness",
        className: "ops-filter-completeness",
        label: "数据完整度",
        options: [
          ["all", "全部"],
          ["complete", "完整 100%"],
          ["incomplete", "待补齐"],
        ],
      },
      {
        key: "sort",
        className: "ops-filter-sort",
        label: "排序",
        options: [
          ["risk", "风险优先"],
          ["activity_desc", "活跃度：高→低"],
          ["activity_asc", "活跃度：低→高"],
          ["inactive_desc", "静默天数：多→少"],
          ["inactive_asc", "静默天数：少→多"],
          ["completeness_desc", "完整度：高→低"],
          ["completeness_asc", "完整度：低→高"],
          ["name_asc", "名称：正序"],
          ["name_desc", "名称：倒序"],
        ],
      },
    ];
  }

  function renderFilterControl(definition) {
    const selectedValue = state.filters[definition.key];
    const selected = definition.options.find(([value]) => value === selectedValue) || definition.options[0];
    const listId = `ops-filter-${definition.key}-listbox`;
    return `<div class="ops-filter-select ${escapeHtml(definition.className)}" data-ops-filter="${escapeHtml(definition.key)}">
      <button class="ops-filter-trigger" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}" aria-label="${escapeHtml(definition.label)}，当前为${escapeHtml(selected[1])}" data-ops-filter-toggle="${escapeHtml(definition.key)}">
        <span>${escapeHtml(definition.label)}</span>
        <strong data-ops-filter-label="${escapeHtml(definition.key)}">${escapeHtml(selected[1])}</strong>
        <i data-lucide="chevron-down" class="ops-filter-chevron" aria-hidden="true"></i>
      </button>
      <div class="ops-filter-menu" id="${listId}" role="listbox" aria-label="${escapeHtml(definition.label)}选项" aria-hidden="true">
        ${definition.options.map(([value, label], optionIndex) => {
          const isSelected = value === selected[0];
          return `<button class="ops-filter-option${isSelected ? " selected" : ""}" id="${listId}-option-${optionIndex}" type="button" role="option" tabindex="-1" aria-selected="${String(isSelected)}" data-ops-filter-option="${escapeHtml(definition.key)}" data-value="${escapeHtml(value)}" data-label="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><i data-lucide="check" class="ops-filter-check" aria-hidden="true"></i></button>`;
        }).join("")}
      </div>
    </div>`;
  }

  function hydrateOperationIcons(scope) {
    const iconLibrary = window.LegacyQualityIcons;
    if (!scope || !iconLibrary?.createIcons || !iconLibrary.icons) return;
    iconLibrary.createIcons({
      icons: {
        ChevronDown: iconLibrary.icons.ChevronDown,
        Check: iconLibrary.icons.Check,
        CircleCheck: iconLibrary.icons.CircleCheck,
        CircleDashed: iconLibrary.icons.CircleDashed,
        CircleAlert: iconLibrary.icons.CircleAlert,
        CircleX: iconLibrary.icons.CircleX,
        CircleHelp: iconLibrary.icons.CircleHelp,
      },
      root: scope,
    });
  }

  function closeFilterMenus(except) {
    root.querySelectorAll("[data-ops-filter]").forEach((control) => {
      if (control === except) return;
      control.classList.remove("open");
      control.removeAttribute("data-placement");
      control.style.removeProperty("--ops-filter-menu-max-height");
      const trigger = control.querySelector("[data-ops-filter-toggle]");
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.removeAttribute("aria-activedescendant");
      control.querySelectorAll("[data-ops-filter-option]").forEach((option) => option.classList.remove("keyboard-active"));
      control.querySelector(".ops-filter-menu")?.setAttribute("aria-hidden", "true");
    });
  }

  function setActiveFilterOption(control, option) {
    const trigger = control?.querySelector("[data-ops-filter-toggle]");
    control?.querySelectorAll("[data-ops-filter-option]").forEach((item) => {
      item.classList.toggle("keyboard-active", item === option);
    });
    if (!option?.id) {
      trigger?.removeAttribute("aria-activedescendant");
      return;
    }
    trigger?.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  }

  function setFilterMenuOpen(control, open, focusEdge) {
    if (!control) return;
    closeFilterMenus(open ? control : null);
    control.classList.toggle("open", open);
    control.querySelector("[data-ops-filter-toggle]")?.setAttribute("aria-expanded", String(open));
    control.querySelector(".ops-filter-menu")?.setAttribute("aria-hidden", String(!open));
    if (!open) {
      control.removeAttribute("data-placement");
      control.style.removeProperty("--ops-filter-menu-max-height");
      setActiveFilterOption(control, null);
      return;
    }
    const options = Array.from(control.querySelectorAll("[data-ops-filter-option]"));
    const target = focusEdge === "last"
      ? options[options.length - 1]
      : options.find((option) => option.getAttribute("aria-selected") === "true") || options[0];
    setActiveFilterOption(control, target);
    window.requestAnimationFrame(() => {
      const trigger = control.querySelector("[data-ops-filter-toggle]");
      const menu = control.querySelector(".ops-filter-menu");
      if (trigger && menu) {
        const triggerRect = trigger.getBoundingClientRect();
        const menuHeight = menu.getBoundingClientRect().height;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const scrollRect = control.closest(".ops-scroll")?.getBoundingClientRect();
        const topBoundary = Math.max(0, scrollRect?.top || 0);
        const bottomBoundary = Math.min(viewportHeight, scrollRect?.bottom || viewportHeight);
        const roomBelow = Math.max(0, bottomBoundary - triggerRect.bottom);
        const roomAbove = Math.max(0, triggerRect.top - topBoundary);
        const usefulDownwardRoom = Math.min(menuHeight + 12, 132);
        const placement = roomBelow >= usefulDownwardRoom || roomBelow >= roomAbove ? "bottom" : "top";
        const availableRoom = placement === "top" ? roomAbove : roomBelow;
        control.dataset.placement = placement;
        control.style.setProperty("--ops-filter-menu-max-height", `${Math.max(96, Math.min(244, availableRoom - 12))}px`);
      }
    });
  }

  function renderShell() {
    stopPriorityAutoScroll();
    disposeCharts();
    root.classList.remove("is-inspector-open");
    root.innerHTML = `<div class="ops-app">
      <section class="ops-main">
        <header class="ops-header">
          <div class="ops-heading"><h1>全部项目</h1><p>从人员、仓库与活动证据判断项目是否真实推进</p></div>
          <div class="ops-header-actions">
            <input class="ops-search" type="search" aria-label="模糊搜索项目" placeholder="模糊搜索项目、负责人或仓库" value="${escapeHtml(state.filters.search)}" autocomplete="off">
            <button class="ops-secondary-button" type="button" data-action="refresh">刷新数据</button>
          </div>
        </header>
        <div class="ops-scroll">
          <section class="ops-panel ops-summary">${renderHealthSummary()}</section>
          <section class="ops-panel ops-filter-bar" aria-label="项目筛选器">
            ${filterDefinitions().map(renderFilterControl).join("")}
            <button class="ops-secondary-button ops-filter-reset" type="button" data-action="reset-filters">清空</button>
            ${renderChartFilterChips()}
            <span class="ops-filter-count" aria-live="polite"></span>
          </section>
          <section class="ops-panel ops-table-panel">
            <div class="ops-table-scroll"><table class="ops-table"><colgroup><col style="width:20%"><col style="width:10%"><col style="width:11%"><col style="width:20%"><col style="width:11%"><col style="width:12%"><col style="width:16%"></colgroup><thead><tr><th>项目</th><th>健康 / 静默</th><th>负责人 / 参与人</th><th>最近信号</th><th>运行态</th><th>数据完整度</th><th>下一步</th></tr></thead><tbody class="ops-project-rows"></tbody></table></div>
            <footer class="ops-pagination"><span class="ops-page-summary"></span><div class="ops-page-actions"><button type="button" data-action="prev-page" aria-label="上一页">上一页</button><span class="ops-page-number"></span><button type="button" data-action="next-page" aria-label="下一页">下一页</button></div></footer>
          </section>
          ${renderDecisionBoard()}
          ${renderSecondaryAnalysis()}
        </div>
      </section>
      <aside class="ops-inspector" id="ops-project-inspector" aria-label="项目关联详情" aria-hidden="true" inert>
        <header class="ops-inspector-head"><div class="ops-inspector-title"></div><button class="ops-icon-button ops-inspector-close" type="button" data-action="close-inspector" aria-label="关闭项目详情">关闭</button></header>
        <nav class="ops-inspector-tabs" aria-label="项目详情分类"><button type="button" data-inspector-tab="overview">概览</button><button type="button" data-inspector-tab="signals">信号</button><button type="button" data-inspector-tab="risk">风险</button><button type="button" data-inspector-tab="members">成员</button></nav>
        <div class="ops-inspector-body"></div>
        <footer class="ops-inspector-actions"><button class="ops-primary-button" type="button" data-action="follow-next">执行下一步</button><button class="ops-secondary-button" type="button" data-action="open-signals">查看证据</button></footer>
      </aside>
    </div>`;
    hydrateOperationIcons(root);
    syncFilterControls();
    updateView();
    animateMetrics(root.querySelector(".ops-summary"));
    root.querySelector(".ops-analysis-details")?.addEventListener("toggle", (event) => {
      const details = event.currentTarget;
      if (details.open) {
        animateMetrics(details);
        window.requestAnimationFrame(drawCharts);
      } else {
        disposeChart("trend");
        disposeChart("source");
      }
    });
    animatePageEntrance();
  }

  function syncFilterControls() {
    for (const definition of filterDefinitions()) {
      const value = state.filters[definition.key];
      const control = root.querySelector(`[data-ops-filter="${definition.key}"]`);
      const selected = definition.options.find(([optionValue]) => optionValue === value) || definition.options[0];
      if (!control || !selected) continue;
      const label = control.querySelector(`[data-ops-filter-label="${definition.key}"]`);
      const trigger = control.querySelector("[data-ops-filter-toggle]");
      if (label) label.textContent = selected[1];
      trigger?.setAttribute("aria-label", `${definition.label}，当前为${selected[1]}`);
      control.querySelectorAll("[data-ops-filter-option]").forEach((option) => {
        const isSelected = option.dataset.value === selected[0];
        option.classList.toggle("selected", isSelected);
        option.setAttribute("aria-selected", String(isSelected));
      });
    }
  }

  function projectRow(project, index) {
    const health = healthMeta[project.health] || healthMeta.unknown;
    const signal = signalView(project);
    const runtime = runtimeView(project.runtime);
    const completeness = dataCompletenessScore(project);
    const next = nextActionView(project);
    const repoLabel = project.gitlab_project_id || project.demand_source || "未接入仓库";
    const selected = Number(project.id) === Number(state.selectedId);
    const expanded = selected && root.classList.contains("is-inspector-open");
    return `<tr data-project-id="${Number(project.id)}" tabindex="0" aria-controls="ops-project-inspector" aria-expanded="${expanded}" style="--ops-row-index:${Number(index || 0)}"${selected ? ' class="is-selected" aria-selected="true"' : ""}>
      <td><div class="ops-project-cell"><span class="ops-project-logo"><img src="${escapeHtml(projectLogo(project))}" alt=""></span><span class="ops-project-name"><strong>${escapeHtml(projectDisplayName(project))}</strong><small>${escapeHtml(repoLabel)}</small></span></div></td>
      <td><div class="ops-health-cell"><i class="ops-state-dot" style="--state-color:${health.color}"></i><span><strong>${health.label}</strong><small>${project.inactive_days == null ? "无基线" : `${Number(project.inactive_days)} 天`}</small></span></div></td>
      <td>${teamHtml(project, 3)}</td>
      <td><div class="ops-signal-copy"><strong style="color:${signal.color}">${escapeHtml(signal.title)}</strong><small>${escapeHtml(signal.detail)}</small></div></td>
      <td><span class="ops-status-pill ${runtime.className}">${escapeHtml(runtime.label)}</span></td>
      <td><div class="ops-completeness"><strong>${completeness}%</strong><div class="ops-progress"><i data-progress-target="${completeness}" style="width:0%"></i></div></div></td>
      <td><button class="ops-next-button" type="button" data-action="project-next" data-project-id="${Number(project.id)}">${escapeHtml(next.label || "查看详情")}</button></td>
    </tr>`;
  }

  function updateView() {
    if (!state.payload || !root.querySelector(".ops-project-rows")) return;
    const projects = filteredProjects();
    const decisionScopeSignature = projects.map((project) => Number(project.id)).join(",");
    if (state.decisionScopeSignature !== decisionScopeSignature) {
      state.decisionScopeSignature = decisionScopeSignature;
      state.timelinePage = 1;
      state.diagnosisPage = 1;
      state.priorityScrollIndex = 0;
      stopPriorityAutoScroll();
    }
    const pageCount = Math.max(1, Math.ceil(projects.length / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    const start = (state.page - 1) * state.pageSize;
    const visible = projects.slice(start, start + state.pageSize);
    if (state.selectedId && !projects.some((project) => Number(project.id) === Number(state.selectedId))) {
      closeInspector();
      state.selectedId = null;
    }

    const rows = root.querySelector(".ops-project-rows");
    rows.innerHTML = visible.length
      ? visible.map(projectRow).join("")
      : `<tr><td class="ops-empty" colspan="7">当前筛选条件下没有项目，请调整筛选条件。</td></tr>`;
    root.querySelector(".ops-filter-count").textContent = `当前结果 ${projects.length} / ${state.payload.projects.length} 个项目${state.filters.search ? " · 模糊匹配" : ""}`;
    root.querySelector(".ops-page-summary").textContent = projects.length ? `显示 ${start + 1}-${Math.min(start + state.pageSize, projects.length)}，共 ${projects.length} 个项目` : "暂无项目";
    root.querySelector(".ops-page-number").textContent = `${state.page} / ${pageCount}`;
    root.querySelector('[data-action="prev-page"]').disabled = state.page <= 1;
    root.querySelector('[data-action="next-page"]').disabled = state.page >= pageCount;
    syncFilterControls();
    updateChartFilterChips();
    refreshDecisionHtml();
    updateInspector();
    animateProgressBars(rows);
    window.requestAnimationFrame(drawCharts);
  }

  function inspectorOverview(project) {
    const signal = signalView(project);
    const runtime = runtimeView(project.runtime);
    const next = nextActionView(project);
    const team = [project.owner_user, ...(project.participant_users || [])].filter(Boolean);
    const alert = project.open_alert;
    const repoUrl = safeUrl(project.gitlab_repo_url || (project.gitlab_base_url && project.gitlab_project_id ? `${String(project.gitlab_base_url).replace(/\/$/, "")}/${project.gitlab_project_id}` : ""));
    return `<div class="ops-chain">
      <section class="ops-chain-step"><span class="ops-chain-number">1</span><div class="ops-chain-card ops-project-detail-link" role="link" tabindex="0" data-action="open-project-detail" data-project-id="${Number(project.id)}" aria-label="打开项目详情：${escapeHtml(projectDisplayName(project))}"><h3>项目</h3><strong>${escapeHtml(projectDisplayName(project))}</strong><p>项目编号 PRJ-${String(project.id).padStart(4, "0")} · ${escapeHtml(project.demand_source || "需求来源待补齐")}</p><span class="ops-chain-link-label">查看项目详情</span></div></section>
        <section class="ops-chain-step"><span class="ops-chain-number">2</span><div class="ops-chain-card"><h3>负责人 / 参与人（共 ${team.length} 人）</h3>${team.map((person, index) => memberLineHtml(person, index === 0 ? "负责人" : "参与人")).join("") || `<p>尚未关联有效成员。</p>`}</div></section>
      <section class="ops-chain-step"><span class="ops-chain-number">3</span><div class="ops-chain-card"><h3>GitLab 仓库</h3><strong>${escapeHtml(project.gitlab_project_id || "未接入")}</strong><p>${project.gitlab_base_url ? `${escapeHtml(project.gitlab_instance_label || project.gitlab_base_url)} · 默认分支 ${escapeHtml(project.gitlab_default_branch || "待扫描")}` : "缺少仓库绑定，无法形成代码活动证据。"}</p>${repoUrl ? `<button class="ops-text-button" type="button" data-action="open-repo" data-url="${escapeHtml(repoUrl)}">打开仓库</button>` : ""}</div></section>
      <section class="ops-chain-step"><span class="ops-chain-number">4</span><div class="ops-chain-card"><h3>最近信号</h3><strong>${escapeHtml(signal.title)}</strong><p>${escapeHtml(signal.detail)}</p><button class="ops-text-button" type="button" data-action="open-signals">查看全部证据</button></div></section>
      <section class="ops-chain-step"><span class="ops-chain-number">5</span><div class="ops-chain-card${alert ? " is-risk" : ""}"><h3>当前风险</h3><strong>${escapeHtml(alert ? (healthMeta[project.health] || healthMeta.unknown).label : "暂无未闭环预警")}</strong><p>${escapeHtml(alert ? alert.reason : "健康状态由最近实质信号时间自动计算。")}</p></div></section>
      <section class="ops-chain-step"><span class="ops-chain-number">6</span><div class="ops-chain-card${runtime.className === "is-bad" ? " is-risk" : runtime.className === "is-warn" ? " is-warning" : ""}"><h3>运行状态</h3><strong>运行态：${escapeHtml(runtime.label)}</strong><p>${escapeHtml(project.runtime?.message || project.runtime?.last_result?.message || "运行监控尚未形成有效结果。")}</p></div></section>
      <section class="ops-chain-step"><span class="ops-chain-number">7</span><div class="ops-chain-card is-warning"><h3>下一步行动</h3><strong>${escapeHtml(next.label || "查看项目详情")}</strong><p>${escapeHtml(next.reason || "继续跟踪项目证据。")}</p></div></section>
    </div>`;
  }

  function inspectorSignals(project) {
    const signals = visibleLatestSignals(project);
    if (!signals.length) return `<div class="ops-detail-message"><strong>暂无可追溯信号</strong><p>当前项目尚未记录 Commit、MR、Branch 或人工进展。</p></div>`;
    return `<div class="ops-signal-list">${signals.map((signal) => { const meta = sourceMeta[signal.source] || { label: signal.source || "信号", color: "#2563eb" }; return `<article class="ops-signal-item" style="--signal-color:${meta.color}"><i></i><div><strong>${escapeHtml(meta.label)} · ${escapeHtml(signal.title || "项目活动")}</strong><p>${escapeHtml(signal.description || signal.actor || "已记录项目证据")}</p><time>${escapeHtml(formatDateTime(signal.occurred_at))}${signal.actor ? ` · ${escapeHtml(signal.actor)}` : ""}</time></div></article>`; }).join("")}</div>`;
  }

  function inspectorRisk(project) {
    const alert = project.open_alert;
    if (!alert) return `<div class="ops-detail-message"><strong>当前没有未闭环预警</strong><p>健康状态仍会随最新实质信号时间自动更新；如果连续 3 天无信号，会进入异常治理。</p></div>`;
    return `<div class="ops-detail-message"><strong>${escapeHtml((healthMeta[project.health] || healthMeta.unknown).label)} · 已静默 ${Number(project.inactive_days || alert.days_inactive || 0)} 天</strong><p>${escapeHtml(alert.reason)}</p><p>最近触发：${escapeHtml(formatDateTime(alert.last_triggered_at))} · 累计触发 ${Number(alert.trigger_count || 1)} 次</p></div>`;
  }

  function inspectorMembers(project) {
    const people = [project.owner_user, ...(project.participant_users || [])].filter(Boolean);
    if (!people.length) return `<div class="ops-detail-message"><strong>成员关系待补齐</strong><p>请先在成员映射中建立负责人和参与人，再关联到项目。</p></div>`;
    return `<div class="ops-signal-list">${people.map((person, index) => `<article class="ops-chain-card">${memberLineHtml(person, `${index === 0 ? "项目负责人" : "项目参与人"}${person.department ? ` · ${person.department}` : ""}`)}<p>GitLab：${person.gitlab_mapped ? "已映射" : "待补齐"} · 飞书：${person.feishu_receive_eligible === true ? "可接收" : person.feishu_mapped ? "已映射 · 不接收" : "待补齐 OpenID"}</p></article>`).join("")}</div>`;
  }

  function updateInspector(animateBody = true) {
    const project = selectedProject();
    const title = root.querySelector(".ops-inspector-title");
    const body = root.querySelector(".ops-inspector-body");
    const actions = root.querySelector(".ops-inspector-actions");
    if (!title || !body || !actions) return;
    if (!project) {
      title.innerHTML = `<h2>项目关联详情</h2><p>从列表选择一个项目</p>`;
      body.innerHTML = `<div class="ops-detail-message"><strong>尚未选择项目</strong><p>选择项目后，这里会沿真实关系展示成员、仓库、信号、风险和运行状态。</p></div>`;
      actions.hidden = true;
      return;
    }
    actions.hidden = false;
    const health = healthMeta[project.health] || healthMeta.unknown;
    title.innerHTML = `<h2>${escapeHtml(projectDisplayName(project))}</h2><p><span style="color:${health.color}">${health.label}</span> · PRJ-${String(project.id).padStart(4, "0")}</p>`;
    root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.inspectorTab === state.inspectorTab));
    if (state.inspectorTab === "signals") body.innerHTML = inspectorSignals(project);
    else if (state.inspectorTab === "risk") body.innerHTML = inspectorRisk(project);
    else if (state.inspectorTab === "members") body.innerHTML = inspectorMembers(project);
    else body.innerHTML = inspectorOverview(project);
    if (animateBody) animateElementIn(body, 12);
  }

  function animateElementIn(element, distance) {
    if (!element || reduceMotion.matches || typeof element.animate !== "function") return;
    element.animate(
      [
        { opacity: 0, transform: `translateY(${Number(distance || 6)}px)`, filter: "blur(3px)" },
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
      ],
      { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
    );
  }

  function animateMetrics(scope) {
    if (!scope) return;
    for (const element of scope.querySelectorAll("[data-count-value]")) {
      const target = Number(element.dataset.countValue || 0);
      if (reduceMotion.matches) {
        element.textContent = String(target);
        continue;
      }
      const startedAt = performance.now();
      const duration = 620 + Math.min(260, target * 8);
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = String(Math.round(target * eased));
        if (progress < 1 && element.isConnected) window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    }
    animateProgressBars(scope);
  }

  function animateProgressBars(scope) {
    if (!scope) return;
    for (const bar of scope.querySelectorAll("[data-progress-target]")) {
      const target = Math.max(0, Math.min(100, Number(bar.dataset.progressTarget || 0)));
      if (reduceMotion.matches || typeof bar.animate !== "function") {
        bar.style.width = `${target}%`;
        continue;
      }
      bar.animate(
        [{ width: "0%", opacity: .35 }, { width: `${target}%`, opacity: 1 }],
        { duration: 720, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
      );
    }
  }

  function animatePageEntrance() {
    if (reduceMotion.matches) return;
    // The inspector owns its translateX drawer transform at narrow container
    // widths, so the page entrance must never hold a competing transform on it.
    const surfaces = root.querySelectorAll(".ops-header, .ops-summary, .ops-decision-toolbar, .ops-decision-panel, .ops-chart-panel, .ops-filter-bar, .ops-table-panel");
    surfaces.forEach((surface, index) => {
      surface.animate(
        [
          { opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" },
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        ],
        { duration: 430, delay: Math.min(240, index * 42), easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
      );
    });
  }

  function refreshSummary() {
    const summary = root.querySelector(".ops-summary");
    if (!summary) return;
    summary.innerHTML = renderHealthSummary() + renderCoverageSummary();
    animateMetrics(summary);
  }

  function replaceDecisionPagination(kind, pageData, label) {
    const current = root.querySelector(`[data-decision-pagination="${kind}"]`);
    if (!current) return;
    const replacement = document.createRange().createContextualFragment(renderDecisionPagination(kind, pageData, label)).firstElementChild;
    if (replacement) current.replaceWith(replacement);
  }

  function refreshTimelinePagination() {
    const pageData = timelineProjects();
    replaceDecisionPagination("timeline", pageData, "项目推进时间轴");
    return pageData;
  }

  function refreshDiagnosisMatrix() {
    const diagnosis = root.querySelector(".ops-diagnosis-matrix");
    if (!diagnosis) return;
    const replacement = document.createRange().createContextualFragment(renderDiagnosisMatrix()).firstElementChild;
    if (replacement) {
      diagnosis.replaceWith(replacement);
      hydrateOperationIcons(replacement);
    }
  }

  function stopPriorityAutoScroll() {
    window.clearInterval(state.priorityScrollTimer);
    state.priorityScrollTimer = 0;
  }

  function priorityListItems(list) {
    return Array.from(list?.querySelectorAll(".ops-priority-item") || []);
  }

  function scrollPriorityListTo(list, index, behavior) {
    const items = priorityListItems(list);
    const maxStart = Math.max(0, items.length - priorityVisibleCount);
    const nextIndex = Math.max(0, Math.min(maxStart, Number(index || 0)));
    const firstTop = items[0]?.offsetTop || 0;
    const top = items[nextIndex] ? Math.max(0, items[nextIndex].offsetTop - firstTop) : 0;
    state.priorityScrollIndex = nextIndex;
    list.dataset.autoScrollIndex = String(nextIndex);
    if (typeof list.scrollTo === "function") list.scrollTo({ top, behavior });
    else list.scrollTop = top;
  }

  function setPriorityScrollPaused(paused, list) {
    state.priorityScrollPaused = Boolean(paused);
    const target = list || root.querySelector(".ops-priority-list");
    if (!target) return;
    target.classList.toggle("is-auto-scroll-paused", state.priorityScrollPaused);
    target.dataset.autoScrollState = state.priorityScrollPaused ? "paused" : "running";
  }

  function startPriorityAutoScroll() {
    stopPriorityAutoScroll();
    const list = root.querySelector(".ops-priority-list");
    if (!list) return;
    const items = priorityListItems(list);
    const maxStart = Math.max(0, items.length - priorityVisibleCount);
    scrollPriorityListTo(list, Math.min(state.priorityScrollIndex, maxStart), "auto");
    setPriorityScrollPaused(list.matches(":hover") || list.contains(document.activeElement), list);
    if (items.length <= priorityVisibleCount) {
      list.dataset.autoScrollState = "complete";
      return;
    }
    state.priorityScrollTimer = window.setInterval(() => {
      if (!state.active || state.priorityScrollPaused || !list.isConnected) return;
      const nextIndex = state.priorityScrollIndex >= maxStart ? 0 : state.priorityScrollIndex + 1;
      scrollPriorityListTo(list, nextIndex, reduceMotion.matches ? "auto" : "smooth");
    }, priorityScrollInterval);
  }

  function refreshDecisionHtml() {
    const stateScope = root.querySelector(".ops-decision-state");
    if (stateScope) stateScope.innerHTML = renderDecisionFilterState();
    refreshTimelinePagination();
    refreshDiagnosisMatrix();
    const list = root.querySelector(".ops-priority-list");
    if (list) {
      stopPriorityAutoScroll();
      list.innerHTML = renderPriorityList();
      animateMetrics(list);
      window.requestAnimationFrame(startPriorityAutoScroll);
    }
  }

  function updateChartFilterChips() {
    const filterBar = root.querySelector(".ops-filter-bar");
    const count = filterBar?.querySelector(".ops-filter-count");
    filterBar?.querySelector(".ops-chart-filter-chips")?.remove();
    const html = renderChartFilterChips();
    if (html && count) count.insertAdjacentHTML("beforebegin", html);
  }

  function runFilterTransition(change) {
    const panel = root.querySelector(".ops-table-panel");
    const token = ++state.transitionToken;
    if (!panel || reduceMotion.matches || typeof panel.animate !== "function") {
      change();
      updateView();
      return;
    }
    const leaving = panel.animate(
      [
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        { opacity: .2, transform: "translateY(3px)", filter: "blur(4px)" },
      ],
      { duration: 120, easing: "ease-in", fill: "forwards" },
    );
    leaving.finished.catch(() => undefined).then(() => {
      if (token !== state.transitionToken) return;
      change();
      updateView();
      panel.animate(
        [
          { opacity: .2, transform: "translateY(5px)", filter: "blur(4px)" },
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        ],
        { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
      );
    });
  }

  function disposeChart(key) {
    state.charts[key]?.dispose();
    state.charts[key] = null;
  }

  function disposeCharts() {
    for (const key of ["trend", "source", "deliveryTimeline", "risk"]) disposeChart(key);
  }

  function ensureChart(key, selector) {
    const echarts = window.ProjectOperationsECharts;
    const element = root.querySelector(selector);
    if (!echarts || !element) return null;
    const existing = echarts.getInstanceByDom(element);
    state.charts[key] = existing || echarts.init(element, null, { renderer: "canvas" });
    return state.charts[key];
  }

  function chartBaseOptions() {
    return {
      animation: !reduceMotion.matches,
      animationDuration: 760,
      animationDurationUpdate: 520,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicInOut",
      aria: { enabled: true },
      textStyle: {
        color: "#64748b",
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: 9,
      },
      toolbox: {
        right: 0,
        top: 0,
        itemSize: 13,
        itemGap: 8,
        iconStyle: { borderColor: "#64748b" },
        emphasis: { iconStyle: { borderColor: "#2563eb" } },
        feature: {
          dataZoom: { yAxisIndex: "none", title: { zoom: "区域缩放", back: "缩放还原" } },
          restore: { title: "还原" },
          saveAsImage: { title: "保存图片", pixelRatio: 2, backgroundColor: "#ffffff" },
        },
      },
      grid: { left: 30, right: 12, top: 40, bottom: 24 },
      dataZoom: [{ type: "inside", filterMode: "none", zoomOnMouseWheel: true, moveOnMouseMove: true }],
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#dbe4f0" } },
        axisTick: { show: false },
        axisLabel: { color: "#94a3b8", fontSize: 8, interval: 4, formatter: (value) => String(value).slice(5) },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#94a3b8", fontSize: 8 },
        splitLine: { lineStyle: { color: "#edf1f6" } },
      },
    };
  }

  function timelineProjectRange(project, rangeStart, rangeEnd) {
    const schedule = project.schedule;
    if (schedule?.current_start_date && schedule?.current_end_date) {
      const start = new Date(`${schedule.current_start_date}T00:00:00`).getTime();
      const end = new Date(`${schedule.current_end_date}T23:59:59`).getTime();
      const progress = Math.max(0, Math.min(100, Number(schedule.actual_progress_pct || 0)));
      return {
        start: Number.isFinite(start) ? start : rangeStart,
        end: Number.isFinite(end) ? end : rangeEnd,
        progress,
        planned: true,
        label: `${Number(schedule.completed_milestone_count || 0)} / ${Number(schedule.milestone_count || 0)} 个里程碑完成`,
      };
    }
    const lastActivity = new Date(project.last_activity_at || project.created_at || rangeStart).getTime();
    const start = Math.max(rangeStart, Number.isFinite(lastActivity) ? lastActivity : rangeStart);
    const end = Math.min(rangeEnd, Math.max(start + 86400000, Date.now()));
    return { start, end, progress: 100, planned: false, label: "未建立计划基线 · 显示最近信号至今的静默区间" };
  }

  function timelineChartLayout(containerWidth) {
    const width = Math.max(280, Number(containerWidth || 0));
    const labelFontSize = Math.max(8, Math.min(9, width / 88));
    const left = Math.round(Math.max(80, Math.min(126, width * .18)));
    const right = Math.round(Math.max(10, Math.min(18, width * .025)));
    const plotWidth = Math.max(120, width - left - right);
    const labelBudget = labelFontSize * 5.6 + 22;
    return {
      left,
      right,
      yLabelWidth: Math.max(64, left - 14),
      labelFontSize,
      tickCount: Math.max(2, Math.min(9, Math.floor(plotWidth / labelBudget))),
    };
  }

  function observeTimelineContainer() {
    const target = root.querySelector(".ops-delivery-timeline-chart");
    if (state.timelineResizeTarget === target) return;
    state.timelineResizeObserver?.disconnect();
    state.timelineResizeTarget = target;
    state.timelineResizeWidth = 0;
    if (!target || typeof ResizeObserver === "undefined") return;
    if (!state.timelineResizeObserver) {
      state.timelineResizeObserver = new ResizeObserver((entries) => {
        const entry = entries.find((item) => item.target === state.timelineResizeTarget);
        const width = Math.round(Number(entry?.contentRect?.width || 0));
        if (!state.active || width < 1 || Math.abs(width - state.timelineResizeWidth) < 2) return;
        state.timelineResizeWidth = width;
        window.cancelAnimationFrame(state.timelineResizeFrame);
        state.timelineResizeFrame = window.requestAnimationFrame(() => {
          if (!state.active || !state.payload || !state.timelineResizeTarget?.isConnected) return;
          state.charts.deliveryTimeline?.resize({ animation: { duration: reduceMotion.matches ? 0 : 180 } });
          renderDeliveryTimelineChart();
        });
      });
    }
    state.timelineResizeObserver.observe(target);
  }

  function renderDeliveryTimelineChart() {
    const chart = ensureChart("deliveryTimeline", ".ops-delivery-timeline-chart");
    if (!chart) return;
    const chartElement = root.querySelector(".ops-delivery-timeline-chart");
    const layout = timelineChartLayout(chartElement?.getBoundingClientRect().width || 0);
    const projects = timelineProjects().projects;
    const timelineStart = new Date(`${state.payload.timeline?.[0]?.date || new Date().toISOString().slice(0, 10)}T00:00:00`).getTime();
    const today = new Date();
    const defaultEnd = today.getTime() + 14 * 86400000;
    const scheduledEnds = projects.map((project) => new Date(`${project.schedule?.current_end_date || ""}T23:59:59`).getTime()).filter(Number.isFinite);
    const rangeEnd = Math.max(defaultEnd, ...(scheduledEnds.length ? scheduledEnds : [defaultEnd]));
    const ranges = projects.map((project, index) => {
      const range = timelineProjectRange(project, timelineStart, rangeEnd);
      const progressEnd = range.start + Math.max(86400000, (range.end - range.start) * range.progress / 100);
      return {
        project,
        range,
        value: [index, range.start, range.end, Math.min(range.end, progressEnd), Number(project.id), range.planned ? 1 : 0],
      };
    });
    const milestoneData = [];
    ranges.forEach(({ project }, index) => {
      (project.schedule?.milestones || []).forEach((milestone) => {
        const when = new Date(`${milestone.planned_date}T12:00:00`).getTime();
        if (Number.isFinite(when)) milestoneData.push([when, index, Number(project.id), milestone.name, milestone.status, Number(milestone.progress_pct || 0), Number(milestone.overdue_days || 0)]);
      });
    });
    chart.setOption({
      animation: !reduceMotion.matches,
      animationDuration: 820,
      animationDurationUpdate: 520,
      animationEasing: "cubicOut",
      aria: { enabled: true },
      textStyle: chartBaseOptions().textStyle,
      grid: { left: layout.left, right: layout.right, top: 22, bottom: 34 },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: "rgba(255,255,255,.98)",
        borderColor: "#cfe0ff",
        borderWidth: 1,
        textStyle: { color: "#334155", fontSize: 10 },
        extraCssText: "box-shadow:0 12px 30px rgba(15,23,42,.13);border-radius:8px;",
        formatter: (params) => {
          if (params.seriesName === "里程碑") {
            const value = params.value || [];
            return `<div class="ops-chart-tooltip"><strong>${escapeHtml(value[3] || "里程碑")}</strong><span>计划日期 <b>${escapeHtml(formatDateTime(value[0]).slice(0, 10))}</b></span><span>进度 <b>${Number(value[5] || 0)}%</b></span><span>状态 <b>${value[4] === "completed" ? "已完成" : Number(value[6] || 0) ? `逾期 ${Number(value[6])} 天` : "推进中"}</b></span><small>点击联动该项目诊断与项目表</small></div>`;
          }
          const item = ranges[params.dataIndex];
          if (!item) return "";
          return `<div class="ops-chart-tooltip"><strong>${escapeHtml(projectDisplayName(item.project))}</strong><span>区间 <b>${escapeHtml(new Date(item.range.start).toLocaleDateString("zh-CN"))} - ${escapeHtml(new Date(item.range.end).toLocaleDateString("zh-CN"))}</b></span><span>实际进度 <b>${Number(item.range.progress)}%</b></span><span>依据 <b>${escapeHtml(item.range.label)}</b></span><small>点击联动该项目诊断与项目表</small></div>`;
        },
      },
      xAxis: {
        type: "time",
        min: timelineStart,
        max: rangeEnd,
        splitNumber: layout.tickCount,
        minInterval: DAY_MS,
        axisLine: { lineStyle: { color: "#dbe4f0" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#94a3b8",
          fontSize: layout.labelFontSize,
          hideOverlap: true,
          margin: 11,
          formatter: (value) => new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
        },
        splitLine: { show: true, lineStyle: { color: "#edf1f6" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: projects.map(projectDisplayName),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#475569", fontSize: 9, width: layout.yLabelWidth, overflow: "truncate" },
      },
      dataZoom: [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true }],
      series: [
        {
          name: "推进区间",
          type: "custom",
          encode: { x: [1, 2], y: 0 },
          renderItem: (params, api) => {
            const start = api.coord([api.value(1), api.value(0)]);
            const end = api.coord([api.value(2), api.value(0)]);
            const progress = api.coord([api.value(3), api.value(0)]);
            const height = Math.min(12, api.size([0, 1])[1] * .38);
            const project = projects[api.value(0)];
            const selected = Number(project?.id) === Number(state.selectedId);
            const healthColor = project?.health === "normal" ? "#16a66a" : project?.health === "attention" ? "#f59e0b" : ["alert", "critical"].includes(project?.health) ? "#ef4444" : "#64748b";
            return {
              type: "group",
              children: [
                { type: "rect", shape: { x: start[0], y: start[1] - height / 2, width: Math.max(3, end[0] - start[0]), height, r: 5 }, style: { fill: api.value(5) ? "#e8eef7" : "#eef2f6", stroke: selected ? "#2563eb" : "transparent", lineWidth: selected ? 2 : 0, opacity: api.value(5) ? 1 : .72 } },
                { type: "rect", shape: { x: start[0], y: start[1] - height / 2, width: Math.max(3, progress[0] - start[0]), height, r: 5 }, style: { fill: healthColor, opacity: api.value(5) ? .92 : .58 } },
              ],
            };
          },
          data: ranges.map((item) => item.value),
          emphasis: { focus: "series" },
        },
        {
          name: "里程碑",
          type: "scatter",
          symbol: "diamond",
          symbolSize: (value) => value[4] === "completed" ? 9 : 11,
          itemStyle: {
            color: (params) => params.value[4] === "completed" ? "#16a66a" : Number(params.value[6] || 0) ? "#ef4444" : "#2563eb",
            borderColor: "#fff",
            borderWidth: 2,
            shadowBlur: 6,
            shadowColor: "rgba(37,99,235,.18)",
          },
          data: milestoneData,
          emphasis: { scale: 1.6 },
        },
      ],
    }, { notMerge: true, lazyUpdate: false });
    chart.off("click");
    chart.on("click", (params) => {
      const projectId = params.seriesName === "里程碑" ? Number(params.value?.[2]) : Number(ranges[params.dataIndex]?.project.id);
      if (projectId) selectProject(projectId, false);
    });
  }

  function renderRiskChart() {
    const chart = ensureChart("risk", ".ops-risk-chart");
    if (!chart) return;
    const projects = filteredProjects();
    const counts = new Map();
    projects.forEach((project) => {
      const key = projectRiskReason(project);
      if (key) counts.set(key, Number(counts.get(key) || 0) + 1);
    });
    const data = Object.entries(riskMeta)
      .map(([key, meta]) => ({ name: meta.label, value: Number(counts.get(key) || 0), key, itemStyle: { color: meta.color } }))
      .filter((item) => item.value > 0);
    const total = data.reduce((sum, item) => sum + item.value, 0);
    chart.setOption({
      animation: !reduceMotion.matches,
      animationDuration: 780,
      animationDurationUpdate: 480,
      animationEasing: "cubicOut",
      aria: { enabled: true },
      title: { text: String(total), subtext: "风险项目", left: "center", top: "36%", textStyle: { color: "#1e293b", fontSize: 22, fontWeight: 800 }, subtextStyle: { color: "#94a3b8", fontSize: 9 }, itemGap: 2 },
      legend: { type: "scroll", bottom: 0, left: "center", itemWidth: 8, itemHeight: 8, textStyle: { color: "#64748b", fontSize: 8 } },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: "rgba(255,255,255,.98)",
        borderColor: "#cfe0ff",
        textStyle: { color: "#334155", fontSize: 10 },
        formatter: (params) => `<div class="ops-chart-tooltip"><strong>${escapeHtml(params.name)}</strong><span>项目数 <b>${Number(params.value || 0)}</b></span><span>占风险项目 <b>${Math.round(Number(params.percent || 0))}%</b></span><small>点击扇区筛选并联动其他面板</small></div>`,
      },
      series: [{
        name: "风险原因",
        type: "pie",
        radius: ["42%", "74%"],
        center: ["50%", "43%"],
        roseType: "radius",
        minAngle: 8,
        padAngle: 2,
        itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 },
        label: { color: "#475569", fontSize: 8, formatter: "{b}\n{c}" },
        labelLine: { length: 8, length2: 5, lineStyle: { color: "#cbd5e1" } },
        emphasis: { scale: true, scaleSize: 7, label: { fontWeight: 800 } },
        data,
        universalTransition: true,
      }],
    }, { notMerge: true, lazyUpdate: false });
    chart.off("click");
    chart.on("click", (params) => {
      const key = params.data?.key;
      if (!key) return;
      runFilterTransition(() => {
        state.filters.riskReason = state.filters.riskReason === key ? "" : key;
        state.page = 1;
      });
    });
  }

  function renderTrendChart(timeline) {
    const chart = ensureChart("trend", ".ops-trend-chart");
    if (!chart) return;
    const byDate = new Map(timeline.map((item) => [item.date, item]));
    const options = chartBaseOptions();
    chart.setOption({
      ...options,
      legend: {
        left: 0,
        top: 0,
        itemWidth: 9,
        itemHeight: 7,
        itemGap: 14,
        textStyle: { color: "#64748b", fontSize: 9 },
        data: ["活跃项目", "预警"],
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        appendToBody: false,
        axisPointer: { type: "line", lineStyle: { color: "#93b4f7", width: 1 } },
        backgroundColor: "rgba(255,255,255,.98)",
        borderColor: "#cfe0ff",
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: "#334155", fontSize: 10 },
        extraCssText: "box-shadow:0 12px 30px rgba(15,23,42,.13);border-radius:8px;",
        formatter: (params) => {
          const date = params[0]?.axisValue;
          const item = byDate.get(date) || {};
          return `<div class="ops-chart-tooltip"><strong>${escapeHtml(date || "")}</strong><span>活跃项目 <b>${Number(item.active_projects || 0)}</b></span><span>活动信号 <b>${Number(item.signal_count || 0)}</b></span><span>触发预警 <b>${Number(item.sources && item.sources.alert || 0)}</b></span><small>点击该日期筛选下方项目</small></div>`;
        },
      },
      xAxis: { ...options.xAxis, data: timeline.map((item) => item.date) },
      series: [
        {
          name: "活跃项目",
          type: "line",
          smooth: .34,
          showSymbol: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { width: 2, color: "#2563eb" },
          itemStyle: { color: "#ffffff", borderColor: "#2563eb", borderWidth: 2 },
          areaStyle: { color: "rgba(37,99,235,.08)" },
          emphasis: { focus: "series", scale: 1.8 },
          data: timeline.map((item) => item.active_projects),
          universalTransition: true,
        },
        {
          name: "预警",
          type: "scatter",
          symbol: "circle",
          symbolSize: (value, params) => 7 + Math.min(5, Number(params.data?.alertCount || 0)),
          itemStyle: { color: "#e5484d", borderColor: "#ffffff", borderWidth: 2 },
          emphasis: { scale: 1.7 },
          data: timeline.map((item) => Number(item.sources && item.sources.alert || 0)
            ? { value: item.active_projects, alertCount: Number(item.sources.alert) }
            : null),
          universalTransition: true,
        },
      ],
    }, { notMerge: true, lazyUpdate: false });
    chart.off("click");
    chart.on("click", (params) => {
      const date = String(params.name || params.axisValue || "");
      if (!date) return;
      runFilterTransition(() => {
        state.filters.chartDate = state.filters.chartDate === date ? "" : date;
        state.page = 1;
      });
    });
  }

  function renderSourceChart(globalTimeline) {
    if (!root.querySelector(".ops-analysis-details")?.open) return;
    const scopedProject = sourceChartProject();
    const timeline = scopedProject ? projectSourceTimeline(scopedProject, globalTimeline) : globalTimeline;
    const toolboxRight = scopedProject ? sourceChartToolboxRight() : 0;
    syncSourceChartScopeUi(scopedProject);
    const chart = ensureChart("source", ".ops-source-chart");
    if (!chart) return;
    const options = chartBaseOptions();
    const definitions = [
      ["Commit", "commit", "#2563eb"],
      ["MR", "merge_request", "#7c5cff"],
      ["Branch", "branch", "#21a6b8"],
      ["人工进展", "manual", "#17a673"],
      ["Issue", "issue", "#d95387"],
    ];
    chart.setOption({
      ...options,
      toolbox: {
        ...options.toolbox,
        right: toolboxRight,
        feature: {
          ...options.toolbox.feature,
          restore: { title: scopedProject ? "恢复全部项目" : "还原图表" },
        },
      },
      legend: {
        type: "scroll",
        left: 0,
        right: Math.max(76, toolboxRight + 76),
        top: 0,
        itemWidth: 8,
        itemHeight: 7,
        itemGap: 9,
        pageIconSize: 8,
        textStyle: { color: "#64748b", fontSize: 8 },
        data: definitions.map((item) => item[0]),
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(37,99,235,.06)" } },
        backgroundColor: "rgba(255,255,255,.98)",
        borderColor: "#cfe0ff",
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: "#334155", fontSize: 10 },
        extraCssText: "box-shadow:0 12px 30px rgba(15,23,42,.13);border-radius:8px;",
        formatter: (params) => `<div class="ops-chart-tooltip"><strong>${scopedProject ? `${escapeHtml(projectDisplayName(scopedProject))} · ` : ""}${escapeHtml(params[0]?.axisValue || "")}</strong>${params.filter((item) => Number(item.value || 0) > 0).map((item) => `<span><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.seriesName)} <b>${Number(item.value || 0)}</b></span>`).join("") || `<span>${scopedProject ? "该项目当天暂无活动信号" : "当天暂无活动信号"}</span>`}<small>点击柱形筛选该类信号项目</small></div>`,
      },
      xAxis: { ...options.xAxis, boundaryGap: true, data: timeline.map((item) => item.date) },
      series: definitions.map(([name, key, color]) => ({
        name,
        type: "bar",
        stack: "signals",
        barMaxWidth: 11,
        itemStyle: { color, borderRadius: [2, 2, 0, 0] },
        emphasis: { focus: "series" },
        data: timeline.map((item) => Number(item.sources && item.sources[key] || 0)),
        universalTransition: true,
      })),
    }, { notMerge: true, lazyUpdate: false });
    chart.off("click");
    chart.on("click", (params) => {
      if (!chartSourceKeys[params.seriesName]) return;
      runFilterTransition(() => {
        state.filters.chartSource = state.filters.chartSource === params.seriesName ? "" : params.seriesName;
        state.page = 1;
      });
    });
    chart.off("restore");
    chart.on("restore", clearSourceChartProjectScope);
  }

  function drawCharts() {
    if (!state.active || !state.payload) return;
    if (!window.ProjectOperationsECharts) {
      root.querySelectorAll(".ops-chart-wrap, .ops-decision-chart").forEach((element) => {
        element.innerHTML = '<div class="ops-chart-unavailable">图表组件暂未加载，请刷新页面。</div>';
      });
      return;
    }
    observeTimelineContainer();
    renderDeliveryTimelineChart();
    renderRiskChart();
    if (root.querySelector(".ops-analysis-details")?.open) {
      const timeline = visibleOperationsTimeline();
      renderTrendChart(timeline);
      renderSourceChart(timeline);
    }
    resizeCharts();
  }

  function resizeCharts() {
    for (const key of ["trend", "source", "deliveryTimeline", "risk"]) {
      state.charts[key]?.resize({ animation: { duration: reduceMotion.matches ? 0 : 220 } });
    }
  }

  function showToast(message) {
    root.querySelector(".ops-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "ops-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    root.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  function hideDiagnosisTooltip() {
    const tooltip = root.querySelector(".ops-diagnosis-tooltip");
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltip.removeAttribute("data-visible");
  }

  function showDiagnosisTooltip(button) {
    if (!button) return;
    let tooltip = root.querySelector(".ops-diagnosis-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "ops-diagnosis-tooltip";
      tooltip.id = "ops-diagnosis-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.hidden = true;
      root.appendChild(tooltip);
    }
    const interactionHint = button.classList.contains("is-complete")
      ? "点击定位该项目，并同步更新关联面板"
      : "点击筛选该维度待补项目，并同步更新关联面板";
    tooltip.innerHTML = `<strong>${escapeHtml(button.dataset.projectName)} · ${escapeHtml(button.dataset.dimensionLabel)}</strong><span>状态 <b>${escapeHtml(button.dataset.statusLabel)}</b></span><p>${escapeHtml(button.dataset.detail)}</p><small>${interactionHint}</small>`;
    tooltip.hidden = false;
    tooltip.setAttribute("data-visible", "true");
    button.setAttribute("aria-describedby", tooltip.id);
    const rect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const left = Math.max(10, Math.min(viewportWidth - tooltipRect.width - 10, rect.left + rect.width / 2 - tooltipRect.width / 2));
    const roomAbove = rect.top - tooltipRect.height - 10;
    const top = roomAbove > 8 ? roomAbove : Math.min(viewportHeight - tooltipRect.height - 10, rect.bottom + 10);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  function closeInspector(restoreFocus = false) {
    const wasOpen = root.classList.contains("is-inspector-open");
    root.classList.remove("is-inspector-open");
    const inspector = root.querySelector(".ops-inspector");
    inspector?.classList.remove("is-entering");
    inspector?.setAttribute("aria-hidden", "true");
    inspector?.setAttribute("inert", "");
    syncSelectedProjectSurfaces();
    if (!wasOpen) return;
    if (state.sourceChartProjectId) renderSourceChart(visibleOperationsTimeline());
    if (!restoreFocus || !state.selectedId) return;
    window.requestAnimationFrame(() => {
      root.querySelector(`tr[data-project-id="${Number(state.selectedId)}"]`)?.focus();
    });
  }

  function syncSelectedProjectSurfaces() {
    root.querySelectorAll(".ops-project-rows tr[data-project-id]").forEach((row) => {
      const selected = Number(row.dataset.projectId) === Number(state.selectedId);
      row.classList.toggle("is-selected", selected);
      if (selected) row.setAttribute("aria-selected", "true");
      else row.removeAttribute("aria-selected");
      row.setAttribute("aria-expanded", String(selected && root.classList.contains("is-inspector-open")));
    });
    root.querySelectorAll("[data-priority-project]").forEach((item) => {
      item.classList.toggle("is-selected", Number(item.dataset.priorityProject) === Number(state.selectedId));
    });
    root.querySelectorAll("[data-diagnosis-project]").forEach((button) => {
      button.closest("tr")?.classList.toggle("is-selected", Number(button.dataset.diagnosisProject) === Number(state.selectedId));
    });
    state.charts.deliveryTimeline?.resize({ animation: { duration: 0 } });
  }

  function openInspectorWithMotion() {
    root.classList.add("is-inspector-open");
    const inspector = root.querySelector(".ops-inspector");
    inspector?.setAttribute("aria-hidden", "false");
    inspector?.removeAttribute("inert");
    syncSelectedProjectSurfaces();
    if (!inspector || reduceMotion.matches) return;
    inspector.classList.remove("is-entering");
    void inspector.offsetWidth;
    inspector.classList.add("is-entering");
    inspector.addEventListener("animationend", () => inspector.classList.remove("is-entering"), { once: true });
  }

  function selectProject(projectId, openInspector) {
    state.selectedId = Number(projectId);
    syncSelectedProjectSurfaces();
    updateInspector(!openInspector);
    if (openInspector) openInspectorWithMotion();
  }

  function openProjectDetail(projectId) {
    const numericProjectId = Number(projectId);
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0) return;
    if (typeof window.__legacyOpenProject !== "function") {
      showToast("项目详情入口暂时不可用，请刷新页面后重试。");
      return;
    }
    state.detailReturnContext = {
      projectId: numericProjectId,
      inspectorTab: state.inspectorTab,
      scrollTop: Number(root.querySelector(".ops-scroll")?.scrollTop || 0),
      pending: false,
    };
    deactivate();
    const request = window.__legacyOpenProject(numericProjectId);
    window.__legacyProjectDetailReturn = { page: "projects", scope: "all" };
    void Promise.resolve(request).catch((error) => {
      console.error("[project-operations] unable to open project detail", error);
    });
  }

  function navigateLegacy(label) {
    const buttons = Array.from(document.querySelectorAll(".sidebar button, main button"));
    const target = buttons.find((button) => button.textContent.trim().replace(/\s+\d+$/, "") === label && !button.closest(`.${ROOT_CLASS}`));
    if (!target) {
      showToast(`暂未找到“${label}”入口，请从左侧导航进入。`);
      return;
    }
    deactivate();
    target.click();
  }

  function followNextAction(project) {
    if (!project) return;
    const next = nextActionView(project);
    if (next.kind === "alert") {
      window.dispatchEvent(new CustomEvent(ALERT_PROJECT_FOCUS_EVENT, {
        detail: { projectId: Number(project.id) },
      }));
      navigateLegacy("异常处理");
      return;
    }
    const routes = {
      member: "成员映射",
      gitlab: "GitLab 集成",
      runtime: "运行总览",
    };
    const route = routes[next.kind];
    if (route) navigateLegacy(route);
    else {
      state.inspectorTab = "signals";
      updateInspector();
      openInspectorWithMotion();
      showToast("已展开该项目的真实活动证据。");
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
      const response = await fetch(API_URL, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = `后端返回 ${response.status}`;
        try {
          const error = await response.json();
          message = error.detail || message;
        } catch (_error) {
          // Keep the status-based message.
        }
        throw new Error(message);
      }
      state.payload = await response.json();
      if (
        state.sourceChartProjectId
        && !state.payload.projects.some((project) => Number(project.id) === Number(state.sourceChartProjectId))
      ) state.sourceChartProjectId = null;
      if (state.selectedId && !state.payload.projects.some((project) => Number(project.id) === Number(state.selectedId))) {
        state.selectedId = null;
      }
      renderShell();
    } catch (error) {
      if (controller.signal.aborted) return;
      state.error = error instanceof Error ? error.message : "无法加载项目运营数据";
      renderError();
    } finally {
      if (state.loadController === controller) state.loadController = null;
      state.loading = false;
    }
  }

  function isAllProjectsView() {
    if (document.querySelector(".legacy-archived-projects-nav.active, .project-detail-page")) return false;
    const buttons = Array.from(document.querySelectorAll(".sidebar button"));
    return buttons.some((button) => button.textContent.trim().replace(/\s+\d+$/, "") === "全部项目" && (button.classList.contains("active") || button.getAttribute("aria-pressed") === "true"));
  }

  function restoreDetailReturnContext() {
    const context = state.detailReturnContext;
    if (!context?.pending || !state.payload) return false;
    state.selectedId = Number(context.projectId);
    state.inspectorTab = context.inspectorTab || "overview";
    if (!root.querySelector(".ops-project-rows")) renderShell();
    else updateView();
    openInspectorWithMotion();
    window.requestAnimationFrame(() => {
      const scroll = root.querySelector(".ops-scroll");
      if (scroll) scroll.scrollTop = Number(context.scrollTop || 0);
    });
    state.detailReturnContext = null;
    return true;
  }

  function syncSidebarBounds() {
    const sidebar = document.querySelector(".sidebar");
    const right = sidebar ? Math.max(0, sidebar.getBoundingClientRect().right) : 0;
    root.style.setProperty("--ops-sidebar-right", `${Math.round(right)}px`);
    root.style.left = `${Math.round(right)}px`;
    window.requestAnimationFrame(() => {
      const analysisOpen = root.querySelector(".ops-analysis-details")?.open;
      const coreChartsMissing = !state.charts.deliveryTimeline || !state.charts.risk;
      const secondaryChartsMissing = analysisOpen && (!state.charts.trend || !state.charts.source);
      if (coreChartsMissing || secondaryChartsMissing) drawCharts();
      else resizeCharts();
    });
  }

  function activate() {
    if (!isAllProjectsView()) return;
    state.active = true;
    root.classList.add("is-active");
    root.setAttribute("aria-hidden", "false");
    const main = document.querySelector("main");
    if (main) {
      main.setAttribute("aria-hidden", "true");
      main.setAttribute("inert", "");
      main.hidden = true;
    }
    syncSidebarBounds();
    if (!state.payload && !state.loading) void loadData(false);
    else if (!restoreDetailReturnContext()) window.requestAnimationFrame(drawCharts);
  }

  function deactivate() {
    state.active = false;
    state.loadController?.abort();
    stopPriorityAutoScroll();
    closeFilterMenus();
    root.classList.remove("is-active", "is-inspector-open");
    const inspector = root.querySelector(".ops-inspector");
    inspector?.setAttribute("aria-hidden", "true");
    inspector?.setAttribute("inert", "");
    root.setAttribute("aria-hidden", "true");
    const main = document.querySelector("main");
    if (main) {
      main.hidden = false;
      main.removeAttribute("inert");
      main.removeAttribute("aria-hidden");
    }
  }

  root.addEventListener("click", (event) => {
    const filterControl = event.target.closest && event.target.closest("[data-ops-filter]");
    if (!filterControl) closeFilterMenus();
    const projectDetailLink = event.target.closest && event.target.closest('[data-action="open-project-detail"]');
    if (projectDetailLink) {
      openProjectDetail(projectDetailLink.dataset.projectId);
      return;
    }
    const row = event.target.closest("tr[data-project-id]");
    const button = event.target.closest("button");
    const priorityItem = event.target.closest("[data-priority-project]");
    if (row && !button) {
      selectProject(row.dataset.projectId, true);
      scopeSourceChartToProject(row.dataset.projectId);
      return;
    }
    if (priorityItem && !button) {
      selectProject(priorityItem.dataset.priorityProject, false);
      return;
    }
    if (!button) return;
    if (button.dataset.diagnosisProject) {
      selectProject(button.dataset.diagnosisProject, false);
      return;
    }
    if (button.hasAttribute("data-diagnosis-cell")) {
      const projectId = Number(button.dataset.projectId);
      const dimensionKey = button.dataset.dimensionKey;
      const isComplete = button.classList.contains("is-complete");
      runFilterTransition(() => {
        if (!isComplete) {
          state.filters.diagnosticDimension = state.filters.diagnosticDimension === dimensionKey ? "" : dimensionKey;
        }
        if (projectId) state.selectedId = projectId;
        state.page = 1;
      });
      return;
    }
    if (button.dataset.opsFilterToggle) {
      setFilterMenuOpen(filterControl, !filterControl.classList.contains("open"));
      return;
    }
    if (button.dataset.opsFilterOption) {
      const key = button.dataset.opsFilterOption;
      const value = button.dataset.value;
      if (!Object.prototype.hasOwnProperty.call(state.filters, key)) return;
      const trigger = filterControl?.querySelector("[data-ops-filter-toggle]");
      setFilterMenuOpen(filterControl, false);
      runFilterTransition(() => {
        state.filters[key] = value;
        state.page = 1;
        if (key === "sort") state.selectedId = null;
        refreshSummary();
      });
      trigger?.focus();
      return;
    }
    const action = button.dataset.action;
    if (button.dataset.healthFilter) {
      const value = button.dataset.healthFilter;
      runFilterTransition(() => {
        state.filters.health = state.filters.health === value ? "all" : value;
        state.page = 1;
        refreshSummary();
      });
      return;
    }
    if (button.dataset.inspectorTab) {
      state.inspectorTab = button.dataset.inspectorTab;
      updateInspector();
      return;
    }
    if (action === "refresh") void loadData(true);
    else if (action === "reset-filters") {
      runFilterTransition(() => {
        window.clearTimeout(state.searchTimer);
        state.filters = {
          organization: "all",
          health: "all",
          signal: "all",
          completeness: "all",
          sort: "risk",
          chartDate: "",
          chartSource: "",
          riskReason: "",
          diagnosticDimension: "",
          search: "",
        };
        state.page = 1;
        const search = root.querySelector(".ops-search");
        if (search) search.value = "";
        refreshSummary();
      });
    } else if (action === "reset-decision-filters") {
      runFilterTransition(() => {
        state.filters.riskReason = "";
        state.filters.diagnosticDimension = "";
        state.page = 1;
      });
    } else if (action === "clear-chart-date") {
      runFilterTransition(() => {
        state.filters.chartDate = "";
        state.page = 1;
      });
    } else if (action === "clear-chart-source") {
      runFilterTransition(() => {
        state.filters.chartSource = "";
        state.page = 1;
      });
    } else if (action === "clear-risk-reason") {
      runFilterTransition(() => {
        state.filters.riskReason = "";
        state.page = 1;
      });
    } else if (action === "clear-diagnostic-dimension") {
      runFilterTransition(() => {
        state.filters.diagnosticDimension = "";
        state.page = 1;
      });
    } else if (action === "prev-page") {
      runFilterTransition(() => { state.page = Math.max(1, state.page - 1); });
    } else if (action === "next-page") {
      runFilterTransition(() => { state.page += 1; });
    } else if (action === "timeline-prev-page") {
      state.timelinePage = Math.max(1, state.timelinePage - 1);
      refreshTimelinePagination();
      renderDeliveryTimelineChart();
    } else if (action === "timeline-next-page") {
      state.timelinePage += 1;
      refreshTimelinePagination();
      renderDeliveryTimelineChart();
    } else if (action === "diagnosis-prev-page") {
      state.diagnosisPage = Math.max(1, state.diagnosisPage - 1);
      refreshDiagnosisMatrix();
    } else if (action === "diagnosis-next-page") {
      state.diagnosisPage += 1;
      refreshDiagnosisMatrix();
    } else if (action === "project-next") {
      selectProject(button.dataset.projectId, true);
      followNextAction(selectedProject());
    } else if (action === "priority-next") {
      selectProject(button.dataset.projectId, true);
      followNextAction(selectedProject());
    } else if (action === "follow-next") followNextAction(selectedProject());
    else if (action === "open-signals") {
      state.inspectorTab = "signals";
      updateInspector();
      openInspectorWithMotion();
    } else if (action === "open-repo") {
      const url = safeUrl(button.dataset.url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } else if (action === "close-inspector") closeInspector(true);
  });

  root.addEventListener("pointerover", (event) => {
    const cell = event.target.closest && event.target.closest("[data-diagnosis-cell]");
    if (cell) showDiagnosisTooltip(cell);
    const priorityList = event.target.closest && event.target.closest(".ops-priority-list");
    if (priorityList && !priorityList.contains(event.relatedTarget)) setPriorityScrollPaused(true, priorityList);
  });

  root.addEventListener("pointerout", (event) => {
    const cell = event.target.closest && event.target.closest("[data-diagnosis-cell]");
    if (!cell || cell.contains(event.relatedTarget)) return;
    cell.removeAttribute("aria-describedby");
    hideDiagnosisTooltip();
  });

  root.addEventListener("pointerout", (event) => {
    const priorityList = event.target.closest && event.target.closest(".ops-priority-list");
    if (priorityList && !priorityList.contains(event.relatedTarget)) setPriorityScrollPaused(false, priorityList);
  });

  root.addEventListener("focusin", (event) => {
    const cell = event.target.closest && event.target.closest("[data-diagnosis-cell]");
    if (cell) showDiagnosisTooltip(cell);
    const priorityList = event.target.closest && event.target.closest(".ops-priority-list");
    if (priorityList) setPriorityScrollPaused(true, priorityList);
  });

  root.addEventListener("focusout", (event) => {
    const cell = event.target.closest && event.target.closest("[data-diagnosis-cell]");
    if (!cell) return;
    cell.removeAttribute("aria-describedby");
    hideDiagnosisTooltip();
  });

  root.addEventListener("focusout", (event) => {
    const priorityList = event.target.closest && event.target.closest(".ops-priority-list");
    if (priorityList && !priorityList.contains(event.relatedTarget)) setPriorityScrollPaused(false, priorityList);
  });

  root.addEventListener("scroll", (event) => {
    const list = event.target;
    if (!(list instanceof Element) || !list.classList.contains("ops-priority-list") || !state.priorityScrollPaused) return;
    const items = priorityListItems(list);
    if (!items.length) return;
    const firstTop = items[0].offsetTop;
    const maxStart = Math.max(0, items.length - priorityVisibleCount);
    const nearest = items.reduce((best, item, index) => {
      if (index > maxStart) return best;
      const distance = Math.abs(item.offsetTop - firstTop - list.scrollTop);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    state.priorityScrollIndex = nearest.index;
    list.dataset.autoScrollIndex = String(nearest.index);
  }, true);

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("ops-search")) return;
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      runFilterTransition(() => {
        state.filters.search = target.value;
        state.page = 1;
      });
    }, 180);
  });

  root.addEventListener("keydown", (event) => {
    const projectDetailLink = event.target.closest && event.target.closest('[data-action="open-project-detail"]');
    if (projectDetailLink && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      openProjectDetail(projectDetailLink.dataset.projectId);
      return;
    }
    const filterControl = event.target.closest && event.target.closest("[data-ops-filter]");
    if (filterControl) {
      const trigger = filterControl.querySelector("[data-ops-filter-toggle]");
      const options = Array.from(filterControl.querySelectorAll("[data-ops-filter-option]"));
      const optionIndex = options.indexOf(event.target);
      if (event.target === trigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        if (!filterControl.classList.contains("open")) {
          setFilterMenuOpen(filterControl, true, event.key === "ArrowUp" ? "last" : "selected");
          return;
        }
        const activeId = trigger.getAttribute("aria-activedescendant");
        const activeIndex = Math.max(0, options.findIndex((option) => option.id === activeId));
        const nextIndex = event.key === "ArrowDown"
          ? (activeIndex + 1) % options.length
          : (activeIndex - 1 + options.length) % options.length;
        setActiveFilterOption(filterControl, options[nextIndex]);
        return;
      }
      if (event.target === trigger && filterControl.classList.contains("open") && ["Home", "End"].includes(event.key)) {
        event.preventDefault();
        setActiveFilterOption(filterControl, event.key === "Home" ? options[0] : options[options.length - 1]);
        return;
      }
      if (event.target === trigger && filterControl.classList.contains("open") && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        const activeId = trigger.getAttribute("aria-activedescendant");
        options.find((option) => option.id === activeId)?.click();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setFilterMenuOpen(filterControl, false);
        trigger?.focus();
        return;
      }
      if (optionIndex >= 0 && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        let nextIndex = optionIndex;
        if (event.key === "ArrowDown") nextIndex = (optionIndex + 1) % options.length;
        else if (event.key === "ArrowUp") nextIndex = (optionIndex - 1 + options.length) % options.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = options.length - 1;
        setActiveFilterOption(filterControl, options[nextIndex]);
        options[nextIndex]?.focus();
        return;
      }
      if (event.key === "Tab") setFilterMenuOpen(filterControl, false);
      return;
    }
    if (event.key === "Escape" && root.classList.contains("is-inspector-open")) {
      event.preventDefault();
      closeInspector(true);
      return;
    }
    const priorityItem = event.target.closest && event.target.closest("[data-priority-project]");
    if (priorityItem && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      selectProject(priorityItem.dataset.priorityProject, false);
      return;
    }
    const row = event.target.closest && event.target.closest("tr[data-project-id]");
    if (!row || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    selectProject(row.dataset.projectId, true);
    scopeSourceChartToProject(row.dataset.projectId);
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest(".ops-inspector, tr[data-project-id], [data-priority-project], [data-diagnosis-project]")) closeInspector();
    if (event.target.closest(".sidebar-collapse-btn, .sidebar-floating-toggle, .sidebar-resize-handle, .sidebar-foot, .o2o-primary-footer")) return;
    if (!event.target.closest(`.${ROOT_CLASS}`)) closeFilterMenus();
    if (event.target.closest(`.${ROOT_CLASS}`)) return;
    const button = event.target.closest("button");
    if (!button) return;
    const label = button.textContent.trim().replace(/\s+\d+$/, "");
    const isDetailAllProjectsBack = Boolean(button.closest(".detail-header .breadcrumb")) && label.includes("全部项目");
    if (isDetailAllProjectsBack && state.detailReturnContext) {
      state.detailReturnContext.pending = true;
      window.setTimeout(activate, 100);
      return;
    }
    if (label === "全部项目") {
      if (state.detailReturnContext && button.closest(".sidebar")) state.detailReturnContext.pending = true;
      window.setTimeout(activate, 60);
      return;
    }
    if (button.closest(".sidebar") || button.closest("main > header")) {
      state.detailReturnContext = null;
      window.setTimeout(() => {
        if (!isAllProjectsView()) deactivate();
      }, 60);
    }
  }, true);

  window.addEventListener(WORKBENCH_ROUTE_EVENT, (event) => {
    const detail = event?.detail || {};
    if (!state.active || detail.path === "/projects") return;
    if (detail.hash || detail.path) {
      state.detailReturnContext = null;
      deactivate();
    }
  });

  let syncTimer = 0;
  const appRoot = document.getElementById("root");
  if (appRoot) {
    const observer = new MutationObserver(() => {
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        if (isAllProjectsView()) activate();
        else if (state.active) deactivate();
        syncSidebarBounds();
      }, 80);
    });
    observer.observe(appRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-pressed"] });
  }

  const waitForSidebar = window.setInterval(() => {
    const sidebar = document.querySelector(".sidebar");
    const main = document.querySelector("main");
    if (!sidebar || !main) return;
    window.clearInterval(waitForSidebar);
    syncSidebarBounds();
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(syncSidebarBounds);
      resizeObserver.observe(sidebar);
    }
    if (isAllProjectsView()) activate();
  }, 120);
  window.setTimeout(() => window.clearInterval(waitForSidebar), 15000);
  window.addEventListener("resize", syncSidebarBounds, { passive: true });
})();
