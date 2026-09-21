(function progressOverviewWorkbench() {
  "use strict";

  var HASH = "#progress-overview";
  var WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  var PAGE_ID = "progress-overview-page";
  var NAV_SECTION_CLASS = "progress-overview-nav-section";
  var API_URL = "/api/project-operations?scope=all&days=21";
  var PAGE_SIZES = [10, 20, 50];
  var active = window.location.hash === HASH;
  var scheduled = false;
  var state = {
    payload: null,
    loading: false,
    error: "",
    query: "",
    filter: "all",
    page: 1,
    pageSize: PAGE_SIZES[0],
    expandedProjectIds: new Set(),
    controller: null,
    loadedAt: 0,
  };

  var scheduleMeta = {
    draft: { label: "草稿", tone: "neutral", order: 5 },
    active: { label: "进行中", tone: "blue", order: 4 },
    completed: { label: "已完成", tone: "green", order: 6 },
    suspended: { label: "已暂停", tone: "neutral", order: 7 },
    overdue: { label: "已逾期", tone: "red", order: 0 },
    attention: { label: "需关注", tone: "amber", order: 1 },
    on_track: { label: "按计划", tone: "green", order: 3 },
    unplanned: { label: "未设置", tone: "neutral", order: 2 },
  };

  var milestoneMeta = {
    pending: { label: "未开始", tone: "neutral" },
    in_progress: { label: "进行中", tone: "blue" },
    completed: { label: "已完成", tone: "green" },
    cancelled: { label: "已取消", tone: "neutral" },
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearch(value) {
    return compactText(value).normalize("NFKC").toLocaleLowerCase("zh-CN");
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(String(value).slice(0, 10) + "T12:00:00");
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "尚未刷新";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function projectDisplayName(project) {
    var item = project || {};
    return compactText(item.display_name_zh || item.display_name || item.name) || "未命名项目";
  }

  function projectSearchText(project) {
    var schedule = project.schedule || {};
    var milestones = Array.isArray(schedule.milestones) ? schedule.milestones : [];
    return normalizeSearch([
      projectDisplayName(project),
      project.name,
      project.owner_name,
      milestones.map(function (item) { return item.name; }).join(" "),
      milestones.map(function (item) { return (item.owner_names || []).join(" ") || item.owner_name; }).join(" "),
    ].join(" "));
  }

  function scheduleKey(project) {
    var schedule = project && project.schedule;
    if (!schedule) return "unplanned";
    if (schedule.health && scheduleMeta[schedule.health]) return schedule.health;
    if (schedule.status && scheduleMeta[schedule.status]) return schedule.status;
    return "active";
  }

  function scheduleState(project) {
    var key = scheduleKey(project);
    return Object.assign({ key: key }, scheduleMeta[key] || scheduleMeta.active);
  }

  function navLabel(button) {
    if (!button) return "";
    return compactText(button.getAttribute("aria-label") || button.textContent).replace(/\s+\d+$/, "");
  }

  function ensureNavigation() {
    var nav = document.querySelector(".sidebar nav");
    if (!nav) return null;
    var section = nav.querySelector("." + NAV_SECTION_CLASS);
    if (!section) {
      section = document.createElement("div");
      section.className = "nav-section nav-first-level-leaf " + NAV_SECTION_CLASS;

      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-progress-overview-nav", "");
      button.setAttribute("aria-label", "进度总览");
      button.title = "进度总览";

      var icon = document.createElement("span");
      icon.className = "nav-icon";
      icon.title = "进度总览";
      var label = document.createElement("span");
      label.className = "nav-label";
      label.textContent = "进度总览";
      var chevron = document.createElement("span");
      chevron.className = "nav-first-level-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "›";
      button.append(icon, label, chevron);
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      section.appendChild(button);
    }

    var projectSection = Array.prototype.find.call(nav.children, function (child) {
      return navLabel(child.querySelector(":scope > button")) === "项目中心";
    });
    var alertSection = Array.prototype.find.call(nav.children, function (child) {
      return navLabel(child.querySelector(":scope > button")) === "预警中心";
    });
    var reference = projectSection ? projectSection.nextElementSibling : alertSection;
    if (!section.isConnected || reference !== section) {
      nav.insertBefore(section, reference || alertSection || null);
    }

    var entry = section.querySelector("[data-progress-overview-nav]");
    if (active) {
      Array.prototype.forEach.call(document.querySelectorAll(".sidebar button.active"), function (button) {
        if (button === entry) return;
        button.classList.remove("active");
        button.removeAttribute("aria-current");
      });
    }
    entry.classList.toggle("active", active);
    if (active) entry.setAttribute("aria-current", "page");
    else entry.removeAttribute("aria-current");
    return entry;
  }

  function bindPage(page) {
    page.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest("button") : null;
      if (!target) return;
      if (target.matches("[data-progress-refresh], [data-progress-retry]")) {
        void loadData(true);
        return;
      }
      if (target.matches("[data-progress-filter-shortcut]")) {
        state.filter = target.getAttribute("data-progress-filter-shortcut") || "all";
        state.page = 1;
        render(false);
        window.requestAnimationFrame(function () {
          var workspace = page.querySelector(".progress-workspace");
          if (workspace) workspace.scrollIntoView({ block: "start" });
        });
        return;
      }
      if (target.matches("[data-progress-page]")) {
        var nextPage = Number(target.getAttribute("data-progress-page"));
        if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === state.page) return;
        state.page = nextPage;
        render(false);
        window.requestAnimationFrame(function () {
          var workspace = page.querySelector(".progress-workspace");
          if (workspace) workspace.scrollIntoView({ block: "start" });
        });
        return;
      }
      if (target.matches("[data-progress-expand]")) {
        var projectId = Number(target.getAttribute("data-project-id"));
        if (state.expandedProjectIds.has(projectId)) state.expandedProjectIds.delete(projectId);
        else state.expandedProjectIds.add(projectId);
        render(true);
        return;
      }
      if (target.matches("[data-progress-open-project]")) {
        openProject(Number(target.getAttribute("data-project-id")));
      }
    });
    page.addEventListener("input", function (event) {
      if (!event.target.matches("[data-progress-search]")) return;
      state.query = event.target.value;
      state.page = 1;
      render(true);
    });
    page.addEventListener("change", function (event) {
      if (event.target.matches("[data-progress-filter]")) {
        state.filter = event.target.value || "all";
        state.page = 1;
        render(true);
        return;
      }
      if (event.target.matches("[data-progress-page-size]")) {
        var nextPageSize = Number(event.target.value);
        state.pageSize = PAGE_SIZES.includes(nextPageSize) ? nextPageSize : PAGE_SIZES[0];
        state.page = 1;
        render(false);
        window.requestAnimationFrame(function () {
          var workspace = page.querySelector(".progress-workspace");
          if (workspace) workspace.scrollIntoView({ block: "start" });
        });
      }
    });
  }

  function ensurePage() {
    var main = document.querySelector(".app-shell main") || document.querySelector("main");
    if (!main) return null;
    main.hidden = false;
    main.removeAttribute("inert");
    main.removeAttribute("aria-hidden");
    var page = document.getElementById(PAGE_ID);
    if (page && page.parentElement !== main) page.remove();
    if (!page) {
      page = document.createElement("section");
      page.id = PAGE_ID;
      page.className = "progress-overview-page";
      page.setAttribute("aria-label", "进度总览");
      main.appendChild(page);
      bindPage(page);
    }
    return page;
  }

  function nextMilestone(schedule) {
    var milestones = Array.isArray(schedule && schedule.milestones) ? schedule.milestones : [];
    return milestones
      .filter(function (item) { return item.status !== "completed" && item.status !== "cancelled"; })
      .slice()
      .sort(function (left, right) {
        return String(left.planned_date || "9999-12-31").localeCompare(String(right.planned_date || "9999-12-31"));
      })[0] || null;
  }

  function statusBadge(meta, suffix) {
    return '<span class="progress-state is-' + escapeHtml(meta.tone) + '">' +
      escapeHtml(meta.label + (suffix || "")) + "</span>";
  }

  function iconMarkup(name, className) {
    return '<i data-lucide="' + escapeHtml(name) + '" class="' + escapeHtml(className || "") + '" aria-hidden="true"></i>';
  }

  function hydrateIcons(scope) {
    var runtime = window.LegacyQualityIcons;
    if (!scope || !runtime || typeof runtime.createIcons !== "function" || !runtime.icons) return;
    runtime.createIcons({
      icons: runtime.icons,
      root: scope,
      attrs: { width: 16, height: 16, "stroke-width": 1.9 },
    });
  }

  function progressTrack(schedule) {
    if (!schedule) {
      return '<div class="progress-empty-track"><span></span><b>未设置基线</b></div>';
    }
    var actual = clampPercent(schedule.actual_progress_pct);
    var planned = clampPercent(schedule.time_progress_pct);
    return '<div class="progress-track-cell" title="实际 ' + actual + '%，计划 ' + planned + '%">' +
      '<div class="progress-track" role="progressbar" aria-label="实际进度 ' + actual + '%，计划进度 ' + planned + '%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + actual + '">' +
        '<span style="width:' + actual + '%"></span><i style="left:' + planned + '%" aria-hidden="true"></i>' +
      '</div><div class="progress-track-label"><b>' + actual + '%</b><span>计划 ' + planned + '%</span></div></div>';
  }

  function gapMarkup(schedule) {
    if (!schedule || schedule.status !== "active") return '<span class="progress-muted">—</span>';
    var gap = Math.round(Number(schedule.progress_gap_pct) || 0);
    var tone = gap < -15 ? "behind" : gap >= 0 ? "ahead" : "near";
    var label = gap === 0 ? "持平" : gap > 0 ? "领先 " + gap + "%" : "落后 " + Math.abs(gap) + "%";
    return '<span class="progress-gap is-' + tone + '">' + escapeHtml(label) + "</span>";
  }

  function milestoneRows(project) {
    var schedule = project.schedule || {};
    var milestones = Array.isArray(schedule.milestones) ? schedule.milestones : [];
    if (!milestones.length) {
      return '<div class="progress-milestone-empty">该计划尚未设置里程碑。</div>';
    }
    return milestones.map(function (milestone) {
      var meta = milestone.is_overdue
        ? { label: "已逾期", tone: "red" }
        : milestoneMeta[milestone.status] || milestoneMeta.pending;
      var owners = (milestone.owner_names || []).join("、") || milestone.owner_name || "待分配";
      var progress = clampPercent(milestone.progress_pct);
      var overdue = milestone.is_overdue ? " " + Number(milestone.overdue_days || 0) + " 天" : "";
      return '<div class="progress-milestone-item">' +
        '<span class="progress-milestone-dot is-' + escapeHtml(meta.tone) + '" aria-hidden="true"></span>' +
        '<div class="progress-milestone-copy"><strong>' + escapeHtml(milestone.name || "未命名里程碑") + '</strong>' +
          '<span>' + escapeHtml(owners) + (milestone.acceptance_criteria ? " · " + escapeHtml(milestone.acceptance_criteria) : "") + '</span></div>' +
        '<time>' + escapeHtml(formatDate(milestone.planned_date)) + '</time>' +
        '<div class="progress-milestone-value"><b>' + progress + '%</b><span><i style="width:' + progress + '%"></i></span></div>' +
        statusBadge(meta, overdue) +
      '</div>';
    }).join("");
  }

  function projectRow(project) {
    var schedule = project.schedule;
    var meta = scheduleState(project);
    var milestones = Array.isArray(schedule && schedule.milestones) ? schedule.milestones : [];
    var next = nextMilestone(schedule);
    var projectId = Number(project.id);
    var expanded = state.expandedProjectIds.has(projectId);
    var displayName = projectDisplayName(project);
    var rawName = compactText(project.name);
    var title = rawName && rawName !== displayName ? rawName : displayName;
    var period = schedule
      ? formatDate(schedule.current_start_date) + " — " + formatDate(schedule.current_end_date)
      : "尚未设置计划周期";
    var milestoneSummary = schedule
      ? Number(schedule.completed_milestone_count || 0) + " / " + Number(schedule.milestone_count || milestones.length || 0)
      : "—";
    var nextLabel = next
      ? escapeHtml(next.name || "下一里程碑") + '<small>' + escapeHtml(formatDate(next.planned_date)) + '</small>'
      : '<span class="progress-muted">暂无待办节点</span>';
    var expandButton = milestones.length
      ? '<button type="button" class="progress-expand" data-progress-expand data-project-id="' + projectId + '" aria-expanded="' + String(expanded) + '" aria-label="' + (expanded ? "收起" : "展开") + escapeHtml(displayName) + '的里程碑">' + iconMarkup(expanded ? "chevron-down" : "chevron-right", "progress-expand-icon") + '</button>'
      : '<span class="progress-expand-placeholder" aria-hidden="true"></span>';
    return '<tr class="progress-project-row is-' + escapeHtml(meta.tone) + (expanded ? " is-expanded" : "") + '" data-progress-project-row="' + projectId + '">' +
      '<td><div class="progress-project-cell">' + expandButton + '<div><strong title="' + escapeHtml(title) + '">' + escapeHtml(displayName) + '</strong><span>' + escapeHtml(project.owner_name || "负责人待补充") + '</span></div></div></td>' +
      '<td>' + progressTrack(schedule) + '</td>' +
      '<td>' + gapMarkup(schedule) + '</td>' +
      '<td><span class="progress-milestone-count">' + escapeHtml(milestoneSummary) + '</span></td>' +
      '<td><div class="progress-next-milestone">' + nextLabel + '</div></td>' +
      '<td><span class="progress-period">' + escapeHtml(period) + '</span></td>' +
      '<td>' + statusBadge(meta, schedule && meta.key === "overdue" ? " " + Number(schedule.overdue_days || 0) + " 天" : "") + '</td>' +
      '<td><button type="button" class="progress-project-action" data-progress-open-project data-project-id="' + projectId + '"><span>查看项目</span>' + iconMarkup("arrow-right", "progress-action-icon") + '</button></td>' +
    '</tr>' + (expanded ? '<tr class="progress-milestone-detail"><td colspan="8"><div class="progress-milestone-panel">' + milestoneRows(project) + '</div></td></tr>' : "");
  }

  function filteredProjects() {
    var projects = Array.isArray(state.payload && state.payload.projects) ? state.payload.projects.slice() : [];
    var query = normalizeSearch(state.query);
    return projects
      .filter(function (project) {
        var key = scheduleKey(project);
        var filterMatch = state.filter === "all"
          || (state.filter === "risk" && (key === "overdue" || key === "attention"))
          || state.filter === key;
        return filterMatch && (!query || projectSearchText(project).includes(query));
      })
      .sort(function (left, right) {
        var leftMeta = scheduleState(left);
        var rightMeta = scheduleState(right);
        if (leftMeta.order !== rightMeta.order) return leftMeta.order - rightMeta.order;
        var leftDate = String((left.schedule || {}).current_end_date || "9999-12-31");
        var rightDate = String((right.schedule || {}).current_end_date || "9999-12-31");
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
        return projectDisplayName(left).localeCompare(projectDisplayName(right), "zh-CN");
      });
  }

  function paginationItems(currentPage, totalPages) {
    var items = [];
    var previousPage = 0;
    for (var pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      var visible = pageNumber === 1
        || pageNumber === totalPages
        || Math.abs(pageNumber - currentPage) <= 1;
      if (!visible) continue;
      if (previousPage && pageNumber - previousPage > 1) items.push("ellipsis-" + previousPage);
      items.push(pageNumber);
      previousPage = pageNumber;
    }
    return items;
  }

  function paginationMarkup(totalItems, startIndex, endIndex, totalPages) {
    var pageButtons = paginationItems(state.page, totalPages).map(function (item) {
      if (typeof item === "string") {
        return '<span class="progress-pagination-ellipsis" aria-hidden="true">…</span>';
      }
      return '<button type="button" class="progress-page-number' + (item === state.page ? " is-active" : "") + '" data-progress-page="' + item + '"' + (item === state.page ? ' aria-current="page"' : "") + ' aria-label="第 ' + item + ' 页">' + item + '</button>';
    }).join("");
    var pageSizeOptions = PAGE_SIZES.map(function (size) {
      return '<option value="' + size + '"' + (size === state.pageSize ? " selected" : "") + '>' + size + ' 条</option>';
    }).join("");

    return '<footer class="progress-pagination" aria-label="项目列表分页">' +
      '<div class="progress-pagination-summary"><strong>第 ' + (startIndex + 1) + '–' + endIndex + ' 项</strong><span>共 ' + totalItems + ' 项筛选结果</span></div>' +
      '<div class="progress-pagination-controls">' +
        '<label class="progress-page-size"><span>每页</span><select data-progress-page-size aria-label="每页显示项目数">' + pageSizeOptions + '</select></label>' +
        '<span class="progress-page-position">' + state.page + ' / ' + totalPages + ' 页</span>' +
        '<nav class="progress-page-nav" aria-label="选择页码">' +
          '<button type="button" class="progress-page-arrow" data-progress-page="' + (state.page - 1) + '" aria-label="上一页"' + (state.page === 1 ? " disabled" : "") + '>' + iconMarkup("chevron-left", "progress-page-arrow-icon") + '</button>' +
          pageButtons +
          '<button type="button" class="progress-page-arrow" data-progress-page="' + (state.page + 1) + '" aria-label="下一页"' + (state.page === totalPages ? " disabled" : "") + '>' + iconMarkup("chevron-right", "progress-page-arrow-icon") + '</button>' +
        '</nav>' +
      '</div>' +
    '</footer>';
  }

  function metricMarkup(label, value, suffix, detail, tone, iconName) {
    return '<article class="progress-metric' + (tone ? " is-" + tone : "") + '">' +
      '<div class="progress-metric-head"><span class="progress-metric-icon">' + iconMarkup(iconName, "progress-metric-icon-svg") + '</span><span>' + escapeHtml(label) + '</span></div>' +
      '<div class="progress-metric-value"><strong>' + escapeHtml(value) + '</strong>' + (suffix ? '<em>' + escapeHtml(suffix) + '</em>' : "") + '</div>' +
      '<small>' + escapeHtml(detail) + '</small></article>';
  }

  function progressHeroMarkup(projectCount, scheduleCount, averageProgress, riskCount, overdueCount) {
    var hasRisk = riskCount > 0;
    var title = hasRisk
      ? '<h2><strong>' + escapeHtml(riskCount) + '</strong> 个项目需要关注</h2>'
      : '<h2>项目推进状态良好</h2>';
    var description = hasRisk
      ? "其中 " + overdueCount + " 个已逾期，建议优先查看进度偏差和下一里程碑。"
      : "当前没有逾期或需关注项目，可以继续按计划推进。";
    var shortcut = hasRisk ? "risk" : "all";
    var shortcutLabel = hasRisk ? "查看风险项目" : "浏览全部项目";
    return '<section class="progress-hero" aria-label="项目进度快照">' +
      '<div class="progress-hero-copy">' +
        '<span class="progress-hero-eyebrow">' + iconMarkup("sparkles", "progress-hero-eyebrow-icon") + '项目进度快照</span>' +
        title +
        '<p>' + escapeHtml(description) + '</p>' +
        '<div class="progress-hero-actions"><button type="button" data-progress-filter-shortcut="' + shortcut + '"><span>' + escapeHtml(shortcutLabel) + '</span>' + iconMarkup("arrow-right", "progress-hero-action-icon") + '</button><small>' + escapeHtml(projectCount) + ' 个项目 · ' + escapeHtml(scheduleCount) + ' 个已排期</small></div>' +
      '</div>' +
      '<div class="progress-hero-progress">' +
        '<div><span>平均实际进度</span><strong>' + escapeHtml(averageProgress) + '%</strong></div>' +
        '<span class="progress-hero-track" role="progressbar" aria-label="平均实际进度 ' + escapeHtml(averageProgress) + '%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + escapeHtml(averageProgress) + '"><i style="width:' + escapeHtml(averageProgress) + '%"></i></span>' +
        '<small>基于 ' + escapeHtml(scheduleCount) + ' 个已配置排期项目</small>' +
      '</div>' +
    '</section>';
  }

  function contentMarkup() {
    if (state.loading && !state.payload) {
      return '<section class="progress-loading-stage" role="status" aria-live="polite" aria-busy="true" aria-label="正在生成跨项目进度视图">' +
        '<div class="progress-loading-card">' +
          '<div class="progress-loading-visual" aria-hidden="true">' + iconMarkup("bar-chart-3", "progress-loading-icon") + iconMarkup("loader-circle", "progress-loading-spinner") + '</div>' +
          '<span class="progress-loading-kicker">项目计划与执行</span>' +
          '<strong>正在生成跨项目进度视图</strong>' +
          '<p>正在汇总计划基线、实际进度与里程碑状态</p>' +
          '<span class="progress-loading-track" aria-hidden="true"><i></i></span>' +
          '<div class="progress-loading-steps" aria-hidden="true"><span class="is-active">计划基线</span><span>实际进度</span><span>里程碑</span></div>' +
          '<small>进度结果按项目排期与里程碑权重计算</small>' +
        '</div>' +
      '</section>';
    }
    if (state.error && !state.payload) {
      return '<section class="progress-state-panel is-error" role="alert"><div><strong>进度数据暂时无法读取</strong><p>' + escapeHtml(state.error) + '</p></div><button type="button" data-progress-retry>重新加载</button></section>';
    }

    var projects = Array.isArray(state.payload && state.payload.projects) ? state.payload.projects : [];
    var schedules = projects.filter(function (project) { return Boolean(project.schedule); });
    var activeSchedules = schedules.filter(function (project) { return project.schedule.status === "active"; });
    var riskSchedules = schedules.filter(function (project) { return ["attention", "overdue"].includes(project.schedule.health); });
    var overdueSchedules = schedules.filter(function (project) { return project.schedule.health === "overdue"; });
    var averageProgress = schedules.length
      ? Math.round(schedules.reduce(function (total, project) { return total + clampPercent(project.schedule.actual_progress_pct); }, 0) / schedules.length)
      : 0;
    var visibleProjects = filteredProjects();
    var totalPages = Math.max(1, Math.ceil(visibleProjects.length / state.pageSize));
    state.page = Math.max(1, Math.min(state.page, totalPages));
    var startIndex = (state.page - 1) * state.pageSize;
    var paginatedProjects = visibleProjects.slice(startIndex, startIndex + state.pageSize);
    var endIndex = startIndex + paginatedProjects.length;
    var rows = paginatedProjects.map(projectRow).join("");
    var staleWarning = state.error
      ? '<div class="progress-stale-warning" role="status">刷新失败，当前保留上一次成功读取的数据：' + escapeHtml(state.error) + '</div>'
      : "";

    return staleWarning +
      progressHeroMarkup(projects.length, schedules.length, averageProgress, riskSchedules.length, overdueSchedules.length) +
      '<section class="progress-metrics" aria-label="进度指标">' +
        metricMarkup("项目总数", projects.length, "个", "当前全部非归档项目", "blue", "folder") +
        metricMarkup("已配置排期", schedules.length, "个", activeSchedules.length + " 个有效计划基线", "violet", "calendar-clock") +
        metricMarkup("平均实际进度", averageProgress, "%", "按已配置排期项目计算", "cyan", "bar-chart-3") +
        metricMarkup("需关注", riskSchedules.length, "个", overdueSchedules.length + " 个项目已逾期", riskSchedules.length ? "amber" : "green", riskSchedules.length ? "alert-triangle" : "circle-check") +
      '</section>' +
      '<section class="progress-workspace" aria-label="项目进度列表">' +
        '<header class="progress-workspace-head"><div class="progress-workspace-title"><span class="progress-workspace-title-icon">' + iconMarkup("list-checks", "progress-workspace-title-icon-svg") + '</span><div><h2>项目推进情况</h2><p>实际进度来自里程碑权重；计划进度按项目周期计算。</p></div></div>' +
          '<div class="progress-legend" aria-label="进度图例"><span><i class="is-actual"></i>实际进度</span><span><i class="is-planned"></i>计划节点</span></div></header>' +
        '<div class="progress-toolbar">' +
          '<label class="progress-search">' + iconMarkup("search", "progress-search-icon") + '<input type="search" data-progress-search value="' + escapeHtml(state.query) + '" placeholder="搜索项目、负责人或里程碑" aria-label="搜索项目进度" /></label>' +
          '<label class="progress-filter"><span>进度状态</span><select data-progress-filter aria-label="按进度状态筛选">' +
            '<option value="all"' + (state.filter === "all" ? " selected" : "") + '>全部状态</option>' +
            '<option value="risk"' + (state.filter === "risk" ? " selected" : "") + '>需关注 / 逾期</option>' +
            '<option value="on_track"' + (state.filter === "on_track" ? " selected" : "") + '>按计划</option>' +
            '<option value="unplanned"' + (state.filter === "unplanned" ? " selected" : "") + '>未设置</option>' +
            '<option value="draft"' + (state.filter === "draft" ? " selected" : "") + '>草稿</option>' +
            '<option value="suspended"' + (state.filter === "suspended" ? " selected" : "") + '>已暂停</option>' +
            '<option value="completed"' + (state.filter === "completed" ? " selected" : "") + '>已完成</option>' +
          '</select></label>' +
          '<span class="progress-result-count" aria-live="polite">筛选结果 ' + visibleProjects.length + ' 项<span> · 共 ' + projects.length + ' 项目</span></span>' +
        '</div>' +
        (rows
          ? '<div class="progress-table-scroll"><table class="progress-table"><thead><tr><th>项目 / 负责人</th><th>实际 / 计划</th><th>进度偏差</th><th>里程碑</th><th>下一节点</th><th>计划周期</th><th>状态</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>' + paginationMarkup(visibleProjects.length, startIndex, endIndex, totalPages)
          : '<div class="progress-empty">' + iconMarkup("search", "progress-empty-icon") + '<strong>没有符合条件的项目</strong><p>请调整搜索词或进度状态筛选。</p></div>') +
      '</section>';
  }

  function render(preserveFocus) {
    if (!active) return;
    var page = ensurePage();
    if (!page) return;
    var search = page.querySelector("[data-progress-search]");
    var selection = search && document.activeElement === search
      ? { start: search.selectionStart, end: search.selectionEnd }
      : null;
    var generatedAt = state.payload && state.payload.generated_at;
    page.innerHTML = '<header class="progress-page-header"><div><span>项目计划与执行</span><h1>进度总览</h1><p>统一查看计划基线、实际完成度和跨项目里程碑。</p></div><div class="progress-header-actions"><span>数据更新于 ' + escapeHtml(formatDateTime(generatedAt)) + '</span><button type="button" data-progress-refresh' + (state.loading ? " disabled aria-busy=\"true\"" : "") + '>' + iconMarkup("refresh-cw", "progress-refresh-icon") + (state.loading ? "刷新中…" : "刷新数据") + '</button></div></header><div class="progress-page-body">' + contentMarkup() + '</div>';
    hydrateIcons(page);
    if (preserveFocus && selection) {
      window.requestAnimationFrame(function () {
        var nextSearch = page.querySelector("[data-progress-search]");
        if (!nextSearch) return;
        nextSearch.focus();
        nextSearch.setSelectionRange(selection.start, selection.end);
      });
    }
  }

  async function loadData(force) {
    if (state.loading && !force) return;
    if (state.controller) state.controller.abort();
    var controller = new AbortController();
    state.controller = controller;
    state.loading = true;
    state.error = "";
    render(false);
    try {
      var response = await fetch(API_URL, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok) {
        throw new Error(payload && (payload.detail || payload.message) || "请求失败（" + response.status + "）");
      }
      if (!payload || !Array.isArray(payload.projects)) throw new Error("服务端未返回可用的项目进度数据");
      state.payload = payload;
      state.loadedAt = Date.now();
    } catch (error) {
      if (error && error.name === "AbortError") return;
      state.error = error && error.message || "进度数据加载失败";
    } finally {
      if (state.controller === controller) state.controller = null;
      state.loading = false;
      render(false);
    }
  }

  function openProject(projectId) {
    if (!Number.isInteger(projectId) || projectId < 1) return;
    if (typeof window.__legacyOpenProject !== "function") {
      state.error = "项目详情入口暂时不可用，请刷新页面后重试。";
      render(false);
      return;
    }
    var request = window.__legacyOpenProject(projectId);
    deactivate();
    void Promise.resolve(request).catch(function () {
      state.error = "项目详情暂时无法打开，请稍后重试。";
    });
  }

  function activate() {
    if (!active) {
      window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { hash: HASH } }));
    }
    active = true;
    if (window.location.hash !== HASH) window.location.hash = HASH;
    document.documentElement.classList.add("legacy-progress-overview-view");
    ensureNavigation();
    ensurePage();
    render(false);
    if (!state.payload || Date.now() - state.loadedAt > 60000) void loadData(false);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    if (state.controller) state.controller.abort();
    state.controller = null;
    state.loading = false;
    document.documentElement.classList.remove("legacy-progress-overview-view");
    var page = document.getElementById(PAGE_ID);
    if (page) page.remove();
    ensureNavigation();
    if (window.location.hash === HASH) {
      window.history.replaceState(window.history.state, document.title, window.location.pathname + window.location.search);
    }
  }

  function enhance() {
    scheduled = false;
    ensureNavigation();
    if (!active) return;
    document.documentElement.classList.add("legacy-progress-overview-view");
    var page = ensurePage();
    if (page && !page.hasChildNodes()) render(false);
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  window.addEventListener(WORKBENCH_ROUTE_EVENT, function (event) {
    var detail = event && event.detail || {};
    if (detail.hash === HASH) return;
    if (active) deactivate();
    else ensureNavigation();
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash === HASH) activate();
    else if (active) deactivate();
  });
  document.addEventListener("click", function (event) {
    if (!active || !event.target || !event.target.closest) return;
    if (event.target.closest("." + NAV_SECTION_CLASS)) return;
    if (event.target.closest(".sidebar-collapse-btn, .sidebar-resize-handle, .sidebar-foot, .o2o-primary-footer")) return;
    if (event.target.closest(".sidebar button")) deactivate();
  }, true);
  document.addEventListener("DOMContentLoaded", scheduleEnhance);
  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhance();
  if (active) activate();
})();
