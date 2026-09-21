(function () {
  "use strict";

  // Retired product surface: retained only as a harmless cache-compatible asset.
  return;

  var WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  var WORKBENCH_PATH = "/agent-workspace";
  var WORKBENCH_FALLBACK_PATH = "/projects";
  var NAV_SECTION_CLASS = "feishu-agent-nav-section";
  var state = {
    open: false,
    mode: "tasks",
    filter: "all",
    overview: null,
    tasks: [],
    sessions: [],
    requirements: [],
    memories: [],
    selectedTask: null,
    selectedRequirement: null,
    requirementRevisions: [],
    executionPolicy: null,
    compose: false,
    prefillProjectId: "",
    error: "",
    busy: false,
    standaloneRoute: false,
  };
  var overlay = null;
  var pollTimer = 0;

  var STATUS_LABELS = {
    needs_project: "待绑定项目",
    planning: "正在规划",
    awaiting_approval: "待确认",
    approved: "已批准",
    queued: "排队中",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    rejected: "已拒绝",
    stopped: "已停止",
    pending: "待执行",
    waiting: "等待中",
    success: "已完成",
    proposed: "待确认",
    confirmed: "已确认",
    in_development: "开发中",
    ignored: "已忽略",
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function compactDate(value) {
    if (!value) return "刚刚";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status || "未知";
  }

  function statusChip(status) {
    return '<span class="feishu-agent-status ' + escapeHtml(status) + '">' + escapeHtml(statusLabel(status)) + "</span>";
  }

  function icon(name, className) {
    return '<i data-lucide="' + escapeHtml(name) + '" class="feishu-agent-control-icon' + (className ? " " + escapeHtml(className) : "") + '" aria-hidden="true"></i>';
  }

  function hydrateIcons() {
    var runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function" || !overlay) return;
    runtime.createIcons({
      icons: runtime.icons,
      attrs: { width: 16, height: 16, "stroke-width": 1.8 },
    });
  }

  function projectChoices() {
    return ((state.overview && state.overview.projects) || []).map(function (project) {
      return { value: String(project.id), label: project.name };
    });
  }

  function selectControl(config) {
    var options = config.options || [];
    var selectedValue = String(config.selectedValue == null ? "" : config.selectedValue);
    var selected = options.find(function (item) { return String(item.value) === selectedValue; });
    var placeholder = config.placeholder || "请选择";
    var searchable = config.searchable !== false && options.length > 7;
    var controlId = "feishu-agent-select-" + config.id;
    return '<div class="feishu-agent-select" data-agent-select data-required="' + (config.required ? "true" : "false") + '" data-required-message="' + escapeHtml(config.requiredMessage || placeholder) + '">' +
      '<input type="hidden" name="' + escapeHtml(config.name) + '" value="' + escapeHtml(selectedValue) + '" />' +
      '<button type="button" class="feishu-agent-select-trigger" data-select-trigger role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + escapeHtml(controlId) + '">' +
        '<span class="feishu-agent-select-value' + (selected ? "" : " placeholder") + '">' + escapeHtml(selected ? selected.label : placeholder) + '</span>' +
        icon("chevron-down", "feishu-agent-select-chevron") +
      '</button>' +
      '<div class="feishu-agent-select-menu" id="' + escapeHtml(controlId) + '" data-select-menu hidden>' +
        (searchable ? '<div class="feishu-agent-select-search">' + icon("search") + '<input type="search" data-select-search autocomplete="off" placeholder="搜索项目名称" aria-label="搜索项目" /></div>' : "") +
        '<div class="feishu-agent-select-options" role="listbox" aria-label="' + escapeHtml(config.ariaLabel || placeholder) + '">' +
          options.map(function (item) {
            var active = String(item.value) === selectedValue;
            return '<button type="button" class="feishu-agent-select-option' + (active ? " selected" : "") + '" data-select-option data-value="' + escapeHtml(item.value) + '" role="option" aria-selected="' + (active ? "true" : "false") + '"><span>' + escapeHtml(item.label) + '</span>' + icon("check", "feishu-agent-select-check") + '</button>';
          }).join("") +
          '<div class="feishu-agent-select-empty" data-select-empty' + (options.length ? " hidden" : "") + '>没有可选项目</div>' +
        '</div>' +
      '</div>' +
      '<small class="feishu-agent-field-error" data-select-error hidden>' + escapeHtml(config.requiredMessage || placeholder) + '</small>' +
    '</div>';
  }

  function visibleSelectOptions(select) {
    return Array.prototype.filter.call(select.querySelectorAll("[data-select-option]"), function (option) { return !option.hidden; });
  }

  function closeSelect(select, restoreFocus) {
    if (!select) return;
    var trigger = select.querySelector("[data-select-trigger]");
    var menu = select.querySelector("[data-select-menu]");
    var search = select.querySelector("[data-select-search]");
    select.classList.remove("open", "open-up");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
      menu.style.removeProperty("left");
      menu.style.removeProperty("top");
      menu.style.removeProperty("width");
      menu.style.removeProperty("visibility");
    }
    if (search) search.value = "";
    select.querySelectorAll("[data-select-option]").forEach(function (option) { option.hidden = false; });
    var empty = select.querySelector("[data-select-empty]");
    if (empty) empty.hidden = select.querySelectorAll("[data-select-option]").length > 0;
    if (restoreFocus && trigger) trigger.focus();
  }

  function closeAllSelects(except) {
    if (!overlay) return;
    overlay.querySelectorAll(".feishu-agent-select.open").forEach(function (select) {
      if (select !== except) closeSelect(select, false);
    });
  }

  function positionSelectMenu(select) {
    var trigger = select.querySelector("[data-select-trigger]");
    var menu = select.querySelector("[data-select-menu]");
    if (!trigger || !menu) return;
    var rect = trigger.getBoundingClientRect();
    var width = Math.min(Math.max(220, rect.width), window.innerWidth - 24);
    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.width = width + "px";
    var height = Math.min(menu.scrollHeight, 318);
    var below = window.innerHeight - rect.bottom - 12;
    var above = rect.top - 12;
    var openUp = below < Math.min(height, 270) && above > below;
    select.classList.toggle("open-up", openUp);
    var top = openUp ? Math.max(12, rect.top - height - 7) : Math.min(window.innerHeight - height - 12, rect.bottom + 7);
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    menu.style.left = left + "px";
    menu.style.top = Math.max(12, top) + "px";
    menu.style.visibility = "visible";
  }

  function openSelect(select, focusSearch) {
    if (!select) return;
    closeAllSelects(select);
    var trigger = select.querySelector("[data-select-trigger]");
    var search = select.querySelector("[data-select-search]");
    select.classList.add("open");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    positionSelectMenu(select);
    window.requestAnimationFrame(function () {
      var selected = select.querySelector('[data-select-option][aria-selected="true"]');
      if (focusSearch && search) search.focus();
      else (selected || visibleSelectOptions(select)[0] || trigger).focus();
    });
  }

  function chooseSelectOption(option) {
    var select = option && option.closest("[data-agent-select]");
    if (!select) return;
    var hidden = select.querySelector('input[type="hidden"]');
    var triggerValue = select.querySelector(".feishu-agent-select-value");
    var value = option.getAttribute("data-value") || "";
    if (hidden) hidden.value = value;
    if (triggerValue) {
      triggerValue.textContent = option.querySelector("span").textContent || "";
      triggerValue.classList.remove("placeholder");
    }
    select.querySelectorAll("[data-select-option]").forEach(function (item) {
      var active = item === option;
      item.classList.toggle("selected", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
    });
    select.classList.remove("invalid");
    var error = select.querySelector("[data-select-error]");
    if (error) error.hidden = true;
    if (hidden && hidden.name === "scope_type") {
      var form = select.closest("form");
      var projectInput = form && form.querySelector('input[type="hidden"][name="project_id"]');
      var projectSelect = projectInput && projectInput.closest("[data-agent-select]");
      if (projectSelect) {
        projectSelect.setAttribute("data-required", value === "project" ? "true" : "false");
        if (value !== "project") {
          projectSelect.classList.remove("invalid");
          var projectError = projectSelect.querySelector("[data-select-error]");
          if (projectError) projectError.hidden = true;
        }
      }
    }
    closeSelect(select, true);
  }

  function validateCustomSelects(form) {
    var firstInvalid = null;
    form.querySelectorAll('[data-agent-select][data-required="true"]').forEach(function (select) {
      var hidden = select.querySelector('input[type="hidden"]');
      var invalid = !hidden || !String(hidden.value || "").trim();
      select.classList.toggle("invalid", invalid);
      var error = select.querySelector("[data-select-error]");
      if (error) error.hidden = !invalid;
      if (invalid && !firstInvalid) firstInvalid = select;
    });
    if (firstInvalid) {
      firstInvalid.querySelector("[data-select-trigger]").focus();
      return false;
    }
    return true;
  }

  function readinessData() {
    if (state.error) {
      return {
        status: "blocked",
        summary: "平台连接失败",
        checks: [{ key: "api", label: "平台接口", status: "block", detail: state.error, action: "确认后端服务可用后重新检测" }],
      };
    }
    return (state.overview && state.overview.readiness) || { status: "blocked", summary: "正在检测接入状态", checks: [] };
  }

  function readinessBannerMarkup() {
    var readiness = readinessData();
    if (readiness.status === "ready") return "";
    var blocker = (readiness.checks || []).find(function (item) { return item.status === "block"; }) || {};
    return '<button type="button" class="feishu-agent-readiness-banner ' + escapeHtml(readiness.status) + '" data-action="show-readiness">' +
      '<span><b>' + escapeHtml(readiness.summary) + '</b><small>' + escapeHtml(blocker.detail || "点击查看完整接入检查") + '</small></span>' +
      '<em>查看检查</em></button>';
  }

  function readinessSetupMarkup(readiness) {
    var groups = readiness.setup_groups || [];
    if (!groups.length) {
      var checks = {};
      (readiness.checks || []).forEach(function (item) { checks[item.key] = item; });
      groups = [
        { title: "需要你提供", items: [checks.app, checks.space, checks.repository].filter(Boolean) },
        { title: "服务端执行", items: [checks.executor, checks.worker, checks.cicd].filter(Boolean) },
        { title: "上线验证", items: [checks.delivery, checks.event].filter(Boolean) },
      ];
    }
    if (!groups.length) return "";
    return '<section class="feishu-agent-setup-guide" aria-label="研发智能体接入清单">' +
      groups.map(function (group) {
        return '<article><header><span>' + escapeHtml(group.title) + '</span><b>' + Number((group.items || []).filter(function (item) { return item.status === "pass"; }).length) + '/' + Number((group.items || []).length) + '</b></header>' +
          '<div>' + (group.items || []).map(function (item) {
            var label = item.status === "pass" ? "已就绪" : (item.status === "warn" ? "需确认" : "待配置");
            return '<p class="' + escapeHtml(item.status || "block") + '"><i aria-hidden="true"></i><span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.detail) + '</small></span><em>' + escapeHtml(label) + '</em></p>';
          }).join("") + '</div></article>';
      }).join("") +
    '</section>';
  }

  function readinessMarkup() {
    var readiness = readinessData();
    var worker = readiness.worker || {};
    return '<div class="feishu-agent-detail">' +
      '<div class="feishu-agent-detail-header"><div><h1>接入检查</h1><p>这里展示真实闭环状态，不再用静态“在线”掩盖未配置项。</p></div><button type="button" class="feishu-agent-button" data-action="refresh-readiness">重新检测</button></div>' +
      (state.error ? '<div class="feishu-agent-error">' + escapeHtml(state.error) + '</div>' : "") +
      '<section class="feishu-agent-readiness-hero ' + escapeHtml(readiness.status) + '"><div><span>当前状态</span><strong>' + escapeHtml(readiness.summary) + '</strong><p>' + (readiness.closed_loop_ready ? "飞书需求、人工审批、代码执行、验证、Draft MR 和平台结果留存均已连通。" : "完成下方阻塞项后，飞书群里的需求才能真正跑到代码交付。") + '</p></div><b>' + escapeHtml((state.overview && state.overview.agent && state.overview.agent.status_label) || "待接入") + '</b></section>' +
      readinessSetupMarkup(readiness) +
      '<div class="feishu-agent-readiness-grid">' + (readiness.checks || []).map(function (item) {
        return '<article class="' + escapeHtml(item.status) + '"><i aria-hidden="true"></i><div><strong>' + escapeHtml(item.label) + '</strong><p>' + escapeHtml(item.detail) + '</p><small>' + escapeHtml(item.action) + '</small></div><span>' + (item.status === "pass" ? "通过" : (item.status === "warn" ? "确认" : "阻塞")) + '</span></article>';
      }).join("") + '</div>' +
      '<section class="feishu-agent-worker-card"><div><span>最近执行节点</span><strong>' + escapeHtml(worker.worker_id || "尚未发现 Worker") + '</strong><p>' + escapeHtml(worker.last_seen_at ? ("最后心跳 " + compactDate(worker.last_seen_at)) : "启动 worker/codem_worker.py 后会自动注册并上报心跳") + '</p></div><code>' + escapeHtml(worker.version || "offline") + '</code></section>' +
    '</div>';
  }

  async function requestJson(url, options) {
    var response = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
    var payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }
    if (!response.ok) {
      throw new Error((payload && payload.detail) || "请求失败（" + response.status + "）");
    }
    return payload;
  }

  function visibleTasks() {
    if (state.filter === "all") return state.tasks;
    if (state.filter === "active") return state.tasks.filter(function (task) { return ["planning", "approved", "queued", "running"].includes(task.status); });
    if (state.filter === "waiting") return state.tasks.filter(function (task) { return ["needs_project", "awaiting_approval"].includes(task.status); });
    if (state.filter === "done") return state.tasks.filter(function (task) { return ["completed", "failed", "rejected", "stopped"].includes(task.status); });
    return state.tasks;
  }

  function taskListMarkup() {
    var tasks = visibleTasks();
    if (!tasks.length) return '<div class="feishu-agent-empty"><div><img src="/image/logo.png" alt="项目管理平台" /><h3>暂无对应任务</h3><p>从飞书群里 @研发智能体，或者在平台内新建一个任务。</p></div></div>';
    return tasks.map(function (task) {
      var source = (task.context || {}).source || {};
      return '<button type="button" class="feishu-agent-task-item' + (state.selectedTask && state.selectedTask.id === task.id ? " active" : "") + '" data-task-id="' + task.id + '">' +
        '<header><strong>' + escapeHtml(task.title) + '</strong><time>' + escapeHtml(compactDate(task.created_at)) + '</time></header>' +
        '<p>' + escapeHtml(task.request_text) + '</p>' +
        '<footer>' + statusChip(task.status) + '<span class="feishu-agent-status">' + escapeHtml(source.chat_name || "平台内发起") + '</span></footer>' +
      '</button>';
    }).join("");
  }

  function sessionListMarkup() {
    if (!state.sessions.length) return '<div class="feishu-agent-empty"><div><img src="/image/logo.png" alt="项目管理平台" /><h3>暂无会话</h3><p>群聊或话题中首次 @研发智能体 后，会在这里形成一条持续会话。</p></div></div>';
    return state.sessions.map(function (session) {
      return '<button type="button" class="feishu-agent-task-item' + (state.selectedTask && state.selectedTask.id === session.last_task_id ? " active" : "") + '" data-task-id="' + session.last_task_id + '">' +
        '<header><strong>' + escapeHtml(session.title) + '</strong><time>' + escapeHtml(compactDate(session.updated_at)) + '</time></header>' +
        '<p>' + escapeHtml(session.request_text) + '</p>' +
        '<footer>' + statusChip(session.status) + '<span class="feishu-agent-status">' + escapeHtml(session.chat_name || "平台内任务") + '</span><span class="feishu-agent-status">' + Number(session.task_count || 0) + ' 个任务</span></footer>' +
      '</button>';
    }).join("");
  }

  function requirementListMarkup() {
    if (!state.requirements.length) return '<div class="feishu-agent-empty"><div><img src="/image/logo.png" alt="项目管理平台" /><h3>暂无群聊需求</h3><p>授权群里的讨论会被归纳成带证据的需求候选。</p></div></div>';
    return state.requirements.map(function (requirement) {
      return '<button type="button" class="feishu-agent-task-item' + (state.selectedRequirement && state.selectedRequirement.id === requirement.id ? " active" : "") + '" data-requirement-id="' + requirement.id + '">' +
        '<header><strong>' + escapeHtml(requirement.title) + '</strong><time>' + escapeHtml(compactDate(requirement.last_seen_at)) + '</time></header>' +
        '<p>' + escapeHtml(requirement.description) + '</p>' +
        '<footer>' + statusChip(requirement.status) + '<span class="feishu-agent-status">' + escapeHtml(requirement.priority || "medium") + '</span><span class="feishu-agent-status">' + Number(requirement.readiness_score || 0) + '% 可开发</span><span class="feishu-agent-status">' + Number(requirement.source_count || 1) + ' 条证据</span></footer>' +
      '</button>';
    }).join("");
  }

  function requirementDetailMarkup(requirement) {
    if (!requirement) return '<div class="feishu-agent-detail">' + readinessBannerMarkup() + '<div class="feishu-agent-empty"><div><img src="/image/logo.png" alt="研发智能体" /><h3>群聊会自动沉淀成需求池</h3><p>Agent 会识别需求、约束、验收标准、决策和阻塞；确认后才能转入代码执行。</p></div></div></div>';
    var evidence = requirement.evidence || [];
    var constraints = requirement.constraints || [];
    var acceptance = requirement.acceptance || [];
    var decisions = requirement.decisions || [];
    var conflicts = requirement.conflicts || [];
    var questions = requirement.open_questions || [];
    var revisions = state.requirementRevisions || [];
    var memory = state.memories.find(function (item) { return item.chat_id === requirement.chat_id && item.thread_id === requirement.thread_id; }) || {};
    var buttons = requirement.status === "proposed" ? '<button type="button" class="feishu-agent-button primary" data-action="confirm-requirement">确认需求</button>' : "";
    if (["proposed", "confirmed"].includes(requirement.status)) buttons += '<button type="button" class="feishu-agent-button" data-action="develop-requirement">转开发任务</button><button type="button" class="feishu-agent-button danger" data-action="ignore-requirement">忽略</button>';
    return '<div class="feishu-agent-detail">' +
      '<div class="feishu-agent-detail-header"><div><h1>' + escapeHtml(requirement.title) + '</h1><p>' + escapeHtml(requirement.category || "feature") + ' · ' + Math.round(Number(requirement.confidence || 0) * 100) + '% 置信度 · ' + Number(requirement.readiness_score || 0) + '% 可开发 · v' + Number(requirement.revision || 1) + '</p></div>' + statusChip(requirement.status) + '</div>' +
      readinessBannerMarkup() +
      '<section class="feishu-agent-card"><header><img src="/image/logo.png" alt="研发智能体" /><div><strong>群聊需求记忆</strong><small>证据可追溯 · 人工确认后开发</small></div></header><div class="feishu-agent-card-body">' +
        '<p class="feishu-agent-summary">' + escapeHtml(memory.summary || requirement.description) + '</p>' +
        '<div class="feishu-agent-context-grid">' +
          '<article class="feishu-agent-context-card"><span>参与讨论</span><strong>' + escapeHtml((requirement.participant_names || []).join("、") || "群聊成员") + '</strong><p>来源消息自动去重聚合</p></article>' +
          '<article class="feishu-agent-context-card"><span>优先级</span><strong>' + escapeHtml(requirement.priority || "medium") + '</strong><p>' + escapeHtml(requirement.category || "feature") + '</p></article>' +
          '<article class="feishu-agent-context-card"><span>关联任务</span><strong>' + escapeHtml(requirement.task_id ? ("#" + requirement.task_id) : "尚未开发") + '</strong><p>写代码前保留人工确认</p></article>' +
        '</div>' +
        (conflicts.length ? '<section class="feishu-agent-result"><header><div><span>相反约束</span><strong>' + escapeHtml(conflicts.map(function (item) { return item.left + " ↔ " + item.right; }).join("；")) + '</strong></div></header></section>' : "") +
        (questions.length ? '<section class="feishu-agent-result"><header><div><span>待澄清</span><strong>' + escapeHtml(questions.join("；")) + '</strong></div></header></section>' : "") +
        (constraints.length ? '<section class="feishu-agent-result"><header><div><span>约束</span><strong>' + escapeHtml(constraints.join("；")) + '</strong></div></header></section>' : "") +
        (acceptance.length ? '<section class="feishu-agent-result"><header><div><span>验收标准</span><strong>' + escapeHtml(acceptance.join("；")) + '</strong></div></header></section>' : "") +
        (decisions.length ? '<section class="feishu-agent-result"><header><div><span>已确认决策</span><strong>' + escapeHtml(decisions.join("；")) + '</strong></div></header></section>' : "") +
        (evidence.length ? '<details class="feishu-agent-source-messages" open><summary>查看需求证据（' + evidence.length + ' 条）</summary>' + evidence.map(function (item) { return '<div class="feishu-agent-message-row"><b>' + escapeHtml(item.sender_name || "群成员") + '</b>：' + escapeHtml(item.text || "") + '</div>'; }).join("") + '</details>' : "") +
        (revisions.length ? '<details class="feishu-agent-source-messages"><summary>查看版本记录（' + revisions.length + ' 个版本）</summary>' + revisions.map(function (item) { return '<div class="feishu-agent-message-row"><b>v' + Number(item.revision || 1) + ' · ' + escapeHtml(item.reason || "需求更新") + '</b>：' + escapeHtml(item.actor_name || "system") + ' · ' + escapeHtml(compactDate(item.created_at)) + '</div>'; }).join("") + '</details>' : "") +
        '<div class="feishu-agent-actions"><button type="button" class="feishu-agent-button" data-action="analyze-requirements">重新 AI 归纳</button>' + buttons + '</div>' +
      '</div></section></div>';
  }

  function composeMarkup() {
    return '<div class="feishu-agent-detail">' +
      '<div class="feishu-agent-detail-header"><div><h1>新建研发 Agent 任务</h1><p>任务会先读取项目上下文并生成计划，任何写入仍需人工确认。</p></div></div>' +
      readinessBannerMarkup() +
      (state.error ? '<div class="feishu-agent-error">' + escapeHtml(state.error) + '</div>' : "") +
      '<section class="feishu-agent-card"><header><img src="/image/logo.png" alt="研发智能体" /><div><strong>把需求交给研发智能体</strong><small>平台内发起 · 与飞书任务使用同一条执行链路</small></div></header>' +
      '<div class="feishu-agent-card-body"><form class="feishu-agent-form" data-form="create-task">' +
        '<div class="feishu-agent-form-field"><span class="feishu-agent-form-label">关联项目<small>Agent 将读取该项目的仓库、质检和运行上下文</small></span>' + selectControl({ id: "compose-project", name: "project_id", options: projectChoices(), selectedValue: state.prefillProjectId, placeholder: "搜索或选择项目", required: true, requiredMessage: "请选择关联项目", ariaLabel: "关联项目" }) + '</div>' +
        '<label><span class="feishu-agent-form-label">需求描述<small>写清目标和验收结果，Agent 会自动补充执行计划</small></span><textarea name="request_text" required placeholder="例如：结合群里的讨论，为项目详情增加研发 Agent 入口，完成构建和质检后创建 Draft MR。"></textarea></label>' +
        '<div class="feishu-agent-form-actions"><button type="button" class="feishu-agent-button" data-action="cancel-compose">取消</button><button type="submit" class="feishu-agent-button primary"' + (state.busy ? " disabled" : "") + '>' + (state.busy ? "正在创建…" : "生成执行计划") + '</button></div>' +
      '</form></div></section>' +
    '</div>';
  }

  function emptyDetailMarkup() {
    return '<div class="feishu-agent-detail">' + readinessBannerMarkup() + '<div class="feishu-agent-empty"><div><img src="/image/logo.png" alt="研发智能体" /><h3>在飞书里发需求，在这里看全程</h3><p>Agent 会读取授权群聊、关联项目资料、展开执行步骤，并在写代码或修改系统前等待确认。</p><button type="button" class="feishu-agent-button primary" data-action="open-compose">新建平台任务</button></div></div></div>';
  }

  function planMarkup(plan) {
    var todo = (plan && plan.todo) || [];
    return '<div class="feishu-agent-plan">' + todo.map(function (item, index) {
      return '<article><b>' + (index + 1) + '</b><div><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.detail) + '</p></div></article>';
    }).join("") + '</div>';
  }

  function messagesMarkup(messages) {
    if (!messages || !messages.length) return "";
    return '<details class="feishu-agent-source-messages"><summary>查看 Agent 读取的群聊上下文（' + messages.length + ' 条）</summary>' +
      messages.map(function (message) {
        return '<div class="feishu-agent-message-row"><b>' + escapeHtml(message.sender_name || "群成员") + '</b>：' + escapeHtml(message.text || "") + '</div>';
      }).join("") + '</details>';
  }

  function pipelineMarkup(pipeline) {
    if (!pipeline || ["", "not_applicable", "disabled", "not_configured"].includes(String(pipeline.status || ""))) return "";
    var statusLabels = { success: "已通过", failed: "失败", canceled: "已取消", running: "运行中", pending: "排队中", waiting: "等待创建", manual: "等待人工步骤", skipped: "已跳过", timeout: "监控超时" };
    var jobs = pipeline.jobs || [];
    var failedJobs = pipeline.failed_jobs || [];
    var diagnosis = pipeline.diagnosis || {};
    var primaryDiagnosis = diagnosis.primary || {};
    var strategyLabels = { repair_code: "定向修复代码", retry_pipeline: "先重试基础设施", manual_review: "人工核对后处理" };
    var diagnosisMarkup = primaryDiagnosis.label ? '<div class="feishu-agent-pipeline-diagnosis"><span>智能诊断</span><div><strong>' + escapeHtml(primaryDiagnosis.label) + '</strong><p>' + escapeHtml(strategyLabels[diagnosis.retry_strategy] || "人工核对后处理") + ' · 置信度 ' + Math.round(Number(primaryDiagnosis.confidence || 0) * 100) + '%</p>' + ((diagnosis.repair_hints || [])[0] ? '<small>' + escapeHtml(diagnosis.repair_hints[0]) + '</small>' : '') + '</div></div>' : '';
    var tone = pipeline.conclusion === "success" ? "success" : (pipeline.conclusion === "failed" ? "failed" : "attention");
    return '<section class="feishu-agent-pipeline ' + tone + '"><header><div><span>GitLab CI/CD</span><strong>Pipeline #' + escapeHtml(pipeline.id || "-") + ' · ' + escapeHtml(statusLabels[pipeline.status] || pipeline.status) + '</strong></div>' +
      (pipeline.web_url ? '<a href="' + escapeHtml(pipeline.web_url) + '" target="_blank" rel="noreferrer">查看流水线</a>' : "") + '</header>' +
      (jobs.length ? '<div class="feishu-agent-pipeline-jobs">' + jobs.map(function (job) {
        return '<span class="' + escapeHtml(job.status || "unknown") + '"><b>' + escapeHtml(job.stage || "stage") + '</b>' + escapeHtml(job.name || "job") + '</span>';
      }).join("") + '</div>' : "") + diagnosisMarkup +
      failedJobs.slice(0, 3).map(function (job) {
        return '<details class="feishu-agent-pipeline-log"><summary>' + escapeHtml(job.name || "失败 Job") + ' · 失败日志</summary><pre>' + escapeHtml(job.log_excerpt || "未获取到失败日志") + '</pre></details>';
      }).join("") + '</section>';
  }

  function resultMarkup(task) {
    var result = task.result || {};
    var files = result.changed_files || [];
    var checks = result.checks || [];
    if (!Object.keys(result).length && !task.merge_request_url) return "";
    return '<section class="feishu-agent-result" id="agent-code-changes"><header><div><span>交付结果</span><strong>' + escapeHtml(result.summary || task.summary || "任务已结束") + '</strong></div>' +
      (task.merge_request_url ? '<a href="' + escapeHtml(task.merge_request_url) + '" target="_blank" rel="noreferrer">查看 Draft MR</a>' : "") + '</header>' +
      (files.length ? '<div class="feishu-agent-files">' + files.map(function (item) {
        return '<article><code>' + escapeHtml(item.path || item.file || "未知文件") + '</code><span class="add">+' + Number(item.additions || 0) + '</span><span class="delete">-' + Number(item.deletions || 0) + '</span></article>';
      }).join("") + '</div>' : "") +
      (result.commit_sha ? '<div class="feishu-agent-delivery-status sent"><span>提交版本：<code>' + escapeHtml(result.commit_sha) + '</code></span></div>' : "") +
      (result.diff_summary ? '<pre class="feishu-agent-summary">' + escapeHtml(result.diff_summary) + '</pre>' : "") +
      (checks.length ? '<div class="feishu-agent-checks">' + checks.map(function (item) {
        return '<span class="' + escapeHtml(item.status || "success") + '">' + escapeHtml(item.name || item.command || "校验") + '</span>';
      }).join("") + '</div>' : "") + pipelineMarkup(result.pipeline) + '</section>';
  }

  function deliveryMarkup(task) {
    if (!task.delivery_status || String(task.chat_id || "").startsWith("platform:")) return "";
    return '<div class="feishu-agent-delivery-status dry_run"><span>群回传已停用 · 任务结果保存在平台</span></div>';
  }

  function taskActionsMarkup(task) {
    if (task.status === "needs_project") {
      return '<form class="feishu-agent-form" data-form="bind-project"><div class="feishu-agent-form-field"><span class="feishu-agent-form-label">先绑定项目<small>绑定后才会读取代码仓库并生成计划</small></span>' + selectControl({ id: "bind-project-" + task.id, name: "project_id", options: projectChoices(), selectedValue: "", placeholder: "搜索或选择项目", required: true, requiredMessage: "请选择要绑定的项目", ariaLabel: "绑定项目" }) + '</div><div class="feishu-agent-form-actions"><button type="submit" class="feishu-agent-button primary">绑定并生成计划</button></div></form>';
    }
    if (task.status === "awaiting_approval") {
      return '<div class="feishu-agent-actions"><button type="button" class="feishu-agent-button danger" data-action="reject-task">拒绝</button><button type="button" class="feishu-agent-button primary" data-action="approve-task">批准进入沙箱</button></div>';
    }
    if (["queued", "running"].includes(task.status)) {
      var readiness = readinessData();
      var blocker = (readiness.checks || []).find(function (item) { return item.status === "block"; });
      var runningCopy = task.status === "running" ? ("执行节点 " + (task.claimed_by_worker || "Worker") + " 正在处理，最近心跳 " + compactDate(task.last_heartbeat_at)) : "任务已进入独立执行器队列，页面会同步刷新执行步骤。";
      var copy = blocker ? ("当前阻塞：" + blocker.detail + "。" + blocker.action + "。") : runningCopy;
      return '<div class="feishu-agent-queue-note ' + (blocker ? "blocked" : "") + '">' + escapeHtml(copy) + '</div><div class="feishu-agent-actions">' + (blocker ? '<button type="button" class="feishu-agent-button" data-action="show-readiness">接入检查</button>' : "") + '<button type="button" class="feishu-agent-button danger" data-action="stop-task">停止任务</button></div>';
    }
    if (["failed", "stopped"].includes(task.status)) {
      var failedPipeline = (((task.result || {}).pipeline || {}).conclusion === "failed") ? ((task.result || {}).pipeline || {}) : {};
      var retryStrategy = ((failedPipeline.diagnosis || {}).retry_strategy || "");
      var retryLabel = retryStrategy === "retry_pipeline" ? "重试流水线环境" : (failedPipeline.conclusion ? "按流水线日志重试" : "重新执行");
      return '<div class="feishu-agent-actions"><button type="button" class="feishu-agent-button" data-action="retry-task">' + retryLabel + '</button></div>';
    }
    return "";
  }

  function taskDetailMarkup(task) {
    var context = task.context || {};
    var project = context.project || {};
    var source = context.source || {};
    var permission = context.permission || {};
    var steps = task.steps || [];
    return '<div class="feishu-agent-detail">' +
      '<div class="feishu-agent-detail-header"><div><h1>' + escapeHtml(task.title) + '</h1><p>' + escapeHtml(source.chat_name || "平台内发起") + ' · ' + escapeHtml(task.requester_name || "未知发起人") + ' · ' + escapeHtml(compactDate(task.created_at)) + '</p></div>' + statusChip(task.status) + '</div>' +
      (state.error ? '<div class="feishu-agent-error">' + escapeHtml(state.error) + '</div>' : "") +
      readinessBannerMarkup() +
      '<div class="feishu-agent-request">' + escapeHtml(task.request_text) + '</div>' +
      '<section class="feishu-agent-card"><header><img src="/image/logo.png" alt="研发智能体" /><div><strong>研发智能体</strong><small>已装载飞书与项目平台上下文</small></div></header>' +
        '<div class="feishu-agent-card-body"><p class="feishu-agent-summary">' + escapeHtml(task.summary || "正在分析任务") + '</p>' +
          '<div class="feishu-agent-steps">' + steps.map(function (step, index) {
            return '<article class="feishu-agent-step ' + escapeHtml(step.status) + '"><span class="feishu-agent-step-marker">' + (index + 1) + '</span><div class="feishu-agent-step-copy"><strong>' + escapeHtml(step.title) + '</strong><p>' + escapeHtml(step.detail) + '</p></div>' + statusChip(step.status) + '</article>';
          }).join("") + '</div>' +
          '<div class="feishu-agent-context-grid">' +
            '<article class="feishu-agent-context-card"><span>关联项目</span><strong>' + escapeHtml(project.name || "待绑定") + '</strong><p>' + escapeHtml(project.gitlab_project_id || "尚未关联代码仓库") + '</p></article>' +
            '<article class="feishu-agent-context-card"><span>系统权限</span><strong>' + escapeHtml(permission.scope_type === "all" ? "授权读取全系统" : "仅当前项目") + '</strong><p>写入策略：' + escapeHtml(permission.write_policy || "human_approval") + '</p></article>' +
            '<article class="feishu-agent-context-card"><span>可用工具</span><strong>' + ((task.tool_grants || []).length) + ' 项</strong><p>项目、GitLab、质检、运行态与飞书消息</p></article>' +
          '</div>' +
          planMarkup(task.plan || {}) + messagesMarkup(context.recent_messages || []) + resultMarkup(task) + deliveryMarkup(task) + taskActionsMarkup(task) +
        '</div></section>' +
    '</div>';
  }

  function spacesMarkup() {
    var spaces = (state.overview && state.overview.spaces) || [];
    var policy = state.executionPolicy || { project_id: "", verify_commands: [], required_checks: false, repair_attempts: 1, max_changed_files: 80, max_changed_lines: 6000 };
    return '<div class="feishu-agent-detail">' +
      '<div class="feishu-agent-detail-header"><div><h1>飞书群授权</h1><p>只有登记并启用的群可以触发研发 Agent；全系统范围仅管理员可配置。</p></div></div>' +
      readinessBannerMarkup() +
      (state.error ? '<div class="feishu-agent-error">' + escapeHtml(state.error) + '</div>' : "") +
      '<section class="feishu-agent-card"><header><img src="/image/logo.png" alt="研发智能体" /><div><strong>绑定一个飞书群</strong><small>Chat ID 可从飞书事件日志或开放平台调试工具获取</small></div></header><div class="feishu-agent-card-body">' +
      '<form class="feishu-agent-form" data-form="save-space">' +
        '<div class="feishu-agent-form-row"><label>群名称<input name="chat_name" required placeholder="例如：官网改版专项" /></label><label>飞书 Chat ID<input name="chat_id" required placeholder="oc_xxxxxxxxx" /></label></div>' +
        '<div class="feishu-agent-form-row"><div class="feishu-agent-form-field"><span class="feishu-agent-form-label">访问范围</span>' + selectControl({ id: "space-scope", name: "scope_type", options: [{ value: "project", label: "仅绑定项目" }, { value: "all", label: "读取全系统" }], selectedValue: "project", placeholder: "选择访问范围", required: true, ariaLabel: "访问范围", searchable: false }) + '</div><div class="feishu-agent-form-field"><span class="feishu-agent-form-label">绑定项目</span>' + selectControl({ id: "space-project", name: "project_id", options: projectChoices(), selectedValue: "", placeholder: "搜索或选择项目", required: false, ariaLabel: "绑定项目" }) + '</div></div>' +
        '<div class="feishu-agent-form-actions"><button type="submit" class="feishu-agent-button primary"' + (state.busy ? " disabled" : "") + '>保存群授权</button></div>' +
      '</form>' +
      '<div class="feishu-agent-space-list">' + (spaces.length ? spaces.map(function (space) {
        var project = ((state.overview.projects || []).find(function (item) { return item.id === space.project_id; }) || {}).name;
        return '<article class="feishu-agent-space-row"><div><strong>' + escapeHtml(space.chat_name || space.chat_id) + '</strong><p>' + escapeHtml(space.chat_id) + ' · ' + escapeHtml(space.scope_type === "all" ? "全系统" : (project || "项目范围")) + '</p></div><button type="button" class="feishu-agent-button" data-action="sync-space" data-chat-id="' + escapeHtml(space.chat_id) + '">同步群消息</button></article>';
      }).join("") : '<p class="feishu-agent-summary">还没有授权群。保存后，群内 @机器人 才会创建任务。</p>') + '</div>' +
      '</div></section>' +
      '<section class="feishu-agent-card"><header><img src="/image/logo.png" alt="研发智能体" /><div><strong>项目执行策略</strong><small>每个项目独立配置校验命令、自动修复次数和变更预算；Worker 仍会执行全局安全上限</small></div></header><div class="feishu-agent-card-body">' +
      '<form class="feishu-agent-form" data-form="save-execution-policy">' +
        '<div class="feishu-agent-form-field"><span class="feishu-agent-form-label">项目<small>策略只作用于新创建的 Agent 任务</small></span>' + selectControl({ id: "policy-project", name: "project_id", options: projectChoices(), selectedValue: policy.project_id, placeholder: "搜索或选择项目", required: true, requiredMessage: "请选择策略所属项目", ariaLabel: "策略项目" }) + '</div>' +
        '<label>校验命令（JSON 参数数组）<textarea name="verify_commands" placeholder=\'[["npm","test"],["npm","run","build"]]\'>' + escapeHtml(JSON.stringify(policy.verify_commands || [])) + '</textarea></label>' +
        '<div class="feishu-agent-form-row"><label>自动修复次数<input name="repair_attempts" type="number" min="0" max="3" value="' + Number(policy.repair_attempts || 0) + '" /></label><label>最多修改文件<input name="max_changed_files" type="number" min="1" max="200" value="' + Number(policy.max_changed_files || 80) + '" /></label></div>' +
        '<div class="feishu-agent-form-row"><label>最多变更行数<input name="max_changed_lines" type="number" min="1" max="20000" value="' + Number(policy.max_changed_lines || 6000) + '" /></label><label class="feishu-agent-checkbox"><input name="required_checks" type="checkbox"' + (policy.required_checks ? " checked" : "") + ' /><span>必须配置并通过项目校验</span></label></div>' +
        '<div class="feishu-agent-form-actions"><button type="button" class="feishu-agent-button" data-action="load-execution-policy">读取策略</button><button type="submit" class="feishu-agent-button primary"' + (state.busy ? " disabled" : "") + '>保存执行策略</button></div>' +
      '</form></div></section></div>';
  }

  function shellMarkup() {
    var tasksActive = state.mode === "tasks";
    var sessionsActive = state.mode === "sessions";
    var requirementsActive = state.mode === "requirements";
    var spacesActive = state.mode === "spaces";
    var readinessActive = state.mode === "readiness";
    var selected = state.selectedTask;
    var agent = state.error ? { status: "blocked", status_label: "连接失败" } : ((state.overview && state.overview.agent) || {});
    return '<section class="feishu-agent-shell" role="dialog" aria-modal="true" aria-label="研发智能体任务中心">' +
      '<header class="feishu-agent-topbar"><div class="feishu-agent-brand"><img src="/image/logo.png" alt="项目管理平台" /><div><h2>研发智能体</h2><p>Code with Lark · Code in Lark</p></div></div><button type="button" class="feishu-agent-online ' + escapeHtml(agent.status || "blocked") + '" data-action="show-readiness">' + escapeHtml(agent.status_label || "检测中") + '</button>' +
      '<nav class="feishu-agent-tabs" aria-label="研发智能体导航"><button type="button" class="' + (tasksActive ? "active" : "") + '" data-action="tab-tasks">任务</button><button type="button" class="' + (sessionsActive ? "active" : "") + '" data-action="tab-sessions">全部会话</button><button type="button" class="' + (requirementsActive ? "active" : "") + '" data-action="tab-requirements">需求池</button><button type="button" class="' + (spacesActive ? "active" : "") + '" data-action="tab-spaces">飞书设置</button><button type="button" class="' + (readinessActive ? "active" : "") + '" data-action="tab-readiness">接入检查</button></nav>' +
      '<button type="button" class="feishu-agent-close" data-action="close" aria-label="关闭研发智能体">关闭</button></header>' +
      '<div class="feishu-agent-layout">' +
        '<aside class="feishu-agent-list-pane"><div class="feishu-agent-list-head"><h3>' + (tasksActive ? "研发任务" : (sessionsActive ? "全部会话" : (requirementsActive ? "群聊需求" : "已授权群"))) + '</h3>' + (tasksActive ? '<button type="button" class="feishu-agent-button primary" data-action="open-compose">新任务</button>' : "") + '</div>' +
          (tasksActive ? '<div class="feishu-agent-filters"><button type="button" data-filter="all" class="' + (state.filter === "all" ? "active" : "") + '">全部</button><button type="button" data-filter="active" class="' + (state.filter === "active" ? "active" : "") + '">执行中</button><button type="button" data-filter="waiting" class="' + (state.filter === "waiting" ? "active" : "") + '">待确认</button><button type="button" data-filter="done" class="' + (state.filter === "done" ? "active" : "") + '">已完成</button></div><div class="feishu-agent-task-list">' + taskListMarkup() + '</div>' : (sessionsActive ? '<div class="feishu-agent-task-list">' + sessionListMarkup() + '</div>' : (requirementsActive ? '<div class="feishu-agent-task-list">' + requirementListMarkup() + '</div>' : '<div class="feishu-agent-task-list">' + ((state.overview && state.overview.spaces) || []).map(function (space) { return '<article class="feishu-agent-task-item"><header><strong>' + escapeHtml(space.chat_name || space.chat_id) + '</strong></header><p>' + escapeHtml(space.chat_id) + '</p><footer>' + statusChip(space.enabled ? "success" : "stopped") + '</footer></article>'; }).join("") + '</div>'))) +
        '</aside>' +
        '<main class="feishu-agent-detail-pane"><div class="feishu-agent-detail-scroll">' + (readinessActive ? readinessMarkup() : (requirementsActive ? requirementDetailMarkup(state.selectedRequirement) : ((tasksActive || sessionsActive) ? (state.compose ? composeMarkup() : (selected ? taskDetailMarkup(selected) : emptyDetailMarkup())) : spacesMarkup()))) + '</div></main>' +
      '</div></section>';
  }

  function render() {
    if (!overlay) return;
    overlay.hidden = !state.open;
    if (!state.open) return;
    overlay.innerHTML = shellMarkup();
    hydrateIcons();
  }

  async function loadData(selectTaskId) {
    state.error = "";
    try {
      var results = await Promise.all([
        requestJson("/api/feishu-agent/overview"),
        requestJson("/api/feishu-agent/tasks?limit=100"),
        requestJson("/api/feishu-agent/sessions?limit=100"),
        requestJson("/api/feishu-agent/requirements?limit=100"),
        requestJson("/api/feishu-agent/memories?limit=100"),
      ]);
      state.overview = results[0];
      state.tasks = results[1];
      state.sessions = results[2];
      state.requirements = results[3];
      state.memories = results[4];
      var desiredRequirementId = state.selectedRequirement && state.selectedRequirement.id;
      state.selectedRequirement = state.requirements.find(function (item) { return item.id === desiredRequirementId; }) || state.requirements[0] || null;
      state.requirementRevisions = state.selectedRequirement && state.mode === "requirements"
        ? await requestJson("/api/feishu-agent/requirements/" + state.selectedRequirement.id + "/revisions")
        : [];
      var desiredId = selectTaskId || (state.selectedTask && state.selectedTask.id) || (state.tasks[0] && state.tasks[0].id);
      if (desiredId) {
        state.selectedTask = await requestJson("/api/feishu-agent/tasks/" + desiredId);
      } else {
        state.selectedTask = null;
      }
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
    if (/[?&]agentView=changes/.test(window.location.search)) {
      window.setTimeout(function () {
        var changes = document.querySelector("#agent-code-changes");
        if (changes) changes.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 0);
    }
  }

  function openAgent(options) {
    var standaloneRoute = !options || options.standalone === true;
    if (!state.open && standaloneRoute) {
      window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { path: WORKBENCH_PATH } }));
    }
    if (!state.open) state.standaloneRoute = standaloneRoute;
    state.open = true;
    state.mode = (options && options.mode) || "tasks";
    state.compose = !!(options && options.compose);
    state.prefillProjectId = (options && options.projectId) || "";
    render();
    setNavigationActive(true);
    loadData(options && options.taskId);
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(function () {
      if (state.open && ["tasks", "sessions", "requirements"].includes(state.mode) && !state.compose && !state.busy) loadData();
    }, 8000);
  }

  function closeAgent(options) {
    var navigateToFallback = state.standaloneRoute && !(options && options.preserveNavigation);
    state.open = false;
    state.compose = false;
    state.error = "";
    state.standaloneRoute = false;
    window.clearInterval(pollTimer);
    render();
    setNavigationActive(false);
    if (navigateToFallback) {
      window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { path: WORKBENCH_FALLBACK_PATH } }));
      window.setTimeout(function () {
        var target = Array.prototype.find.call(document.querySelectorAll(".sidebar .nav-children button"), function (button) {
          return navigationLabel(button).indexOf("全部项目") === 0;
        });
        if (target) target.click();
      }, 0);
    }
  }

  function navigationLabel(node) {
    return String((node && (node.getAttribute("aria-label") || node.textContent)) || "")
      .replace(/\s+/g, "")
      .trim();
  }

  function setNavigationActive(active) {
    var button = document.querySelector(".feishu-agent-nav-entry");
    if (!button) return;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }

  function injectNavigation() {
    var nav = document.querySelector(".sidebar nav");
    if (!nav) return;
    var section = nav.querySelector("." + NAV_SECTION_CLASS);
    var existing = section && section.querySelector(".feishu-agent-nav-entry");
    if (!section) {
      section = document.createElement("div");
      section.className = "nav-section " + NAV_SECTION_CLASS;
    }
    if (!existing) {
      var staleEntry = nav.querySelector(".feishu-agent-nav-entry");
      if (staleEntry) staleEntry.remove();
      existing = document.createElement("button");
      existing.type = "button";
      existing.className = "feishu-agent-nav-entry";
      existing.title = "研发助手";
      existing.setAttribute("aria-label", "研发助手");
      var iconSlot = document.createElement("span");
      iconSlot.className = "nav-icon";
      iconSlot.title = "研发助手";
      var label = document.createElement("span");
      label.className = "nav-label";
      label.textContent = "研发助手";
      existing.append(iconSlot, label);
      existing.addEventListener("click", function () { openAgent(); });
      section.appendChild(existing);
    }
    var rulesGroup = Array.prototype.find.call(nav.children, function (child) {
      return navigationLabel(child.querySelector(":scope > button")).indexOf("数据与规则") === 0;
    });
    if (!section.isConnected || (rulesGroup && section.nextElementSibling !== rulesGroup)) {
      nav.insertBefore(section, rulesGroup || null);
    }
    setNavigationActive(state.open);
  }

  async function handleAction(action, target) {
    if (action === "close") return closeAgent();
    if (action === "tab-tasks") { state.mode = "tasks"; state.error = ""; return render(); }
    if (action === "tab-sessions") { state.mode = "sessions"; state.compose = false; state.error = ""; return render(); }
    if (action === "tab-requirements") { state.mode = "requirements"; state.compose = false; state.error = ""; return render(); }
    if (action === "tab-spaces") { state.mode = "spaces"; state.compose = false; state.error = ""; return render(); }
    if (action === "tab-readiness" || action === "show-readiness") { state.mode = "readiness"; state.compose = false; state.error = ""; return render(); }
    if (action === "refresh-readiness") { state.busy = true; render(); await loadData(state.selectedTask && state.selectedTask.id); state.busy = false; render(); return; }
    if (action === "open-compose") { state.compose = true; state.prefillProjectId = ""; state.error = ""; return render(); }
    if (action === "cancel-compose") { state.compose = false; state.error = ""; return render(); }
    if (action === "sync-space") {
      state.busy = true; render();
      try { await requestJson("/api/feishu-agent/spaces/sync-history?chat_id=" + encodeURIComponent(target.getAttribute("data-chat-id")), { method: "POST" }); await loadData(); }
      catch (error) { state.error = error.message; }
      state.busy = false; render(); return;
    }
    if (action === "load-execution-policy") {
      var policyForm = target.closest("form");
      var policyProjectId = policyForm && policyForm.querySelector('[name="project_id"]') && policyForm.querySelector('[name="project_id"]').value;
      if (!policyProjectId) { state.error = "请先选择项目"; return render(); }
      state.busy = true; render();
      try { state.executionPolicy = await requestJson("/api/feishu-agent/execution-policies/" + Number(policyProjectId)); }
      catch (error) { state.error = error.message; }
      state.busy = false; render(); return;
    }
    if (["confirm-requirement", "ignore-requirement", "develop-requirement", "analyze-requirements"].includes(action) && state.selectedRequirement) {
      state.busy = true; render();
      try {
        if (action === "analyze-requirements") {
          await requestJson("/api/feishu-agent/requirements/analyze?chat_id=" + encodeURIComponent(state.selectedRequirement.chat_id) + "&thread_id=" + encodeURIComponent(state.selectedRequirement.thread_id || ""), { method: "POST" });
        } else {
          var requirementEndpoint = action === "confirm-requirement" ? "confirm" : (action === "ignore-requirement" ? "ignore" : "develop");
          var requirementResult = await requestJson("/api/feishu-agent/requirements/" + state.selectedRequirement.id + "/" + requirementEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requirementEndpoint === "develop" ? undefined : JSON.stringify({ note: "" }),
          });
          if (requirementResult.task) {
            state.mode = "tasks";
            state.selectedTask = requirementResult.task;
            await loadData(requirementResult.task.id);
            state.busy = false; render(); return;
          }
        }
        await loadData();
      } catch (error) { state.error = error.message; }
      state.busy = false; render(); return;
    }
    if (["approve-task", "reject-task", "stop-task", "retry-task"].includes(action) && state.selectedTask) {
      var endpoint = action === "approve-task" ? "approve" : (action === "reject-task" ? "reject" : (action === "stop-task" ? "stop" : "retry"));
      state.busy = true; render();
      try {
        var actionResult = await requestJson("/api/feishu-agent/tasks/" + state.selectedTask.id + "/" + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "" }) });
        state.selectedTask = actionResult.task || actionResult;
        await loadData(state.selectedTask.id);
      } catch (error) { state.error = error.message; }
      state.busy = false; render();
    }
  }

  function mount() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "feishu-agent-overlay";
    overlay.hidden = true;
    overlay.addEventListener("click", function (event) {
      var selectTrigger = event.target.closest("[data-select-trigger]");
      if (selectTrigger) {
        event.preventDefault();
        var triggerSelect = selectTrigger.closest("[data-agent-select]");
        if (triggerSelect.classList.contains("open")) closeSelect(triggerSelect, false);
        else openSelect(triggerSelect, true);
        return;
      }
      var selectOption = event.target.closest("[data-select-option]");
      if (selectOption) {
        event.preventDefault();
        chooseSelectOption(selectOption);
        return;
      }
      if (!event.target.closest("[data-agent-select]")) closeAllSelects();
      var target = event.target.closest("[data-action], [data-task-id], [data-requirement-id], [data-filter]");
      if (!target) return;
      if (target.hasAttribute("data-task-id")) {
        var taskId = Number(target.getAttribute("data-task-id"));
        state.compose = false;
        loadData(taskId);
        return;
      }
      if (target.hasAttribute("data-requirement-id")) {
        var requirementId = Number(target.getAttribute("data-requirement-id"));
        state.selectedRequirement = state.requirements.find(function (item) { return item.id === requirementId; }) || null;
        state.requirementRevisions = [];
        state.compose = false;
        render();
        if (state.selectedRequirement) {
          requestJson("/api/feishu-agent/requirements/" + requirementId + "/revisions")
            .then(function (items) { state.requirementRevisions = items; render(); })
            .catch(function (error) { state.error = error.message; render(); });
        }
        return;
      }
      if (target.hasAttribute("data-filter")) {
        state.filter = target.getAttribute("data-filter") || "all";
        render();
        return;
      }
      handleAction(target.getAttribute("data-action"), target);
    });
    overlay.addEventListener("input", function (event) {
      var search = event.target.closest("[data-select-search]");
      if (!search) return;
      var select = search.closest("[data-agent-select]");
      var query = String(search.value || "").trim().toLocaleLowerCase("zh-CN");
      var visible = 0;
      select.querySelectorAll("[data-select-option]").forEach(function (option) {
        var matched = !query || String(option.textContent || "").toLocaleLowerCase("zh-CN").includes(query);
        option.hidden = !matched;
        if (matched) visible += 1;
      });
      var empty = select.querySelector("[data-select-empty]");
      if (empty) {
        empty.textContent = query ? "没有匹配的项目" : "没有可选项目";
        empty.hidden = visible > 0;
      }
    });
    overlay.addEventListener("keydown", function (event) {
      var select = event.target.closest("[data-agent-select]");
      if (!select) return;
      var trigger = event.target.closest("[data-select-trigger]");
      var option = event.target.closest("[data-select-option]");
      var search = event.target.closest("[data-select-search]");
      if (trigger && ["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        openSelect(select, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSelect(select, true);
        return;
      }
      if (search && event.key === "ArrowDown") {
        event.preventDefault();
        var first = visibleSelectOptions(select)[0];
        if (first) first.focus();
        return;
      }
      if (option && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        chooseSelectOption(option);
        return;
      }
      if (option && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        var options = visibleSelectOptions(select);
        var index = options.indexOf(option);
        if (event.key === "Home") index = 0;
        else if (event.key === "End") index = options.length - 1;
        else index = (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        if (options[index]) options[index].focus();
      }
    });
    overlay.addEventListener("scroll", function (event) {
      if (!event.target.closest || !event.target.closest("[data-select-menu]")) closeAllSelects();
    }, true);
    overlay.addEventListener("submit", async function (event) {
      var form = event.target.closest("form[data-form]");
      if (!form) return;
      event.preventDefault();
      if (!validateCustomSelects(form)) return;
      state.error = "";
      state.busy = true;
      render();
      var data = new FormData(form);
      try {
        if (form.getAttribute("data-form") === "create-task") {
          var task = await requestJson("/api/feishu-agent/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_text: data.get("request_text"), project_id: Number(data.get("project_id")) }),
          });
          state.compose = false;
          await loadData(task.id);
        } else if (form.getAttribute("data-form") === "bind-project") {
          await requestJson("/api/feishu-agent/tasks/" + state.selectedTask.id + "/bind-project?project_id=" + encodeURIComponent(data.get("project_id")), { method: "POST" });
          await loadData(state.selectedTask.id);
        } else if (form.getAttribute("data-form") === "save-space") {
          var scope = String(data.get("scope_type") || "project");
          await requestJson("/api/feishu-agent/spaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: data.get("chat_id"),
              chat_name: data.get("chat_name"),
              scope_type: scope,
              project_id: data.get("project_id") ? Number(data.get("project_id")) : null,
              enabled: true,
              allow_history: true,
              context_window: 50,
            }),
          });
          await loadData();
          state.mode = "spaces";
        } else if (form.getAttribute("data-form") === "save-execution-policy") {
          var commands;
          try { commands = JSON.parse(String(data.get("verify_commands") || "[]")); }
          catch (parseError) { throw new Error("校验命令必须是有效 JSON 参数数组"); }
          var projectId = Number(data.get("project_id"));
          state.executionPolicy = await requestJson("/api/feishu-agent/execution-policies/" + projectId, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              verify_commands: commands,
              required_checks: data.get("required_checks") === "on",
              repair_attempts: Number(data.get("repair_attempts") || 0),
              max_changed_files: Number(data.get("max_changed_files") || 80),
              max_changed_lines: Number(data.get("max_changed_lines") || 6000),
            }),
          });
          state.mode = "spaces";
        }
      } catch (error) {
        state.error = error.message || String(error);
      }
      state.busy = false;
      render();
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !state.open) return;
      var openSelectElement = overlay.querySelector(".feishu-agent-select.open");
      if (openSelectElement) {
        event.preventDefault();
        closeSelect(openSelectElement, true);
        return;
      }
      closeAgent();
    });
    window.addEventListener("resize", function () { if (state.open) closeAllSelects(); });
  }

  var scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      injectNavigation();
    });
  }

  mount();
  scheduleInject();
  new MutationObserver(scheduleInject).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener(WORKBENCH_ROUTE_EVENT, function (event) {
    if (!state.open || event.detail && event.detail.path === WORKBENCH_PATH) return;
    closeAgent({ preserveNavigation: true });
  });
  document.addEventListener("click", function (event) {
    if (!state.open || !event.target || !event.target.closest) return;
    var sidebarButton = event.target.closest(".sidebar button");
    if (sidebarButton && !sidebarButton.classList.contains("feishu-agent-nav-entry")) closeAgent({ preserveNavigation: true });
  });
  var taskMatch = /[?&]agentTask=(\d+)/.exec(window.location.search);
  var settingsMatch = /[?&]agentMode=settings/.test(window.location.search);
  var requirementsMatch = /[?&]agentMode=requirements/.test(window.location.search);
  if (taskMatch) openAgent({ taskId: Number(taskMatch[1]) });
  else if (requirementsMatch) openAgent({ mode: "requirements" });
  else if (settingsMatch) openAgent({ mode: "spaces" });
  window.__FEISHU_AGENT_OPEN__ = openAgent;
})();
