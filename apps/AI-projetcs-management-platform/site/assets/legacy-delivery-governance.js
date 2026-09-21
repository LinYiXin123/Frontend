(function deliveryGovernanceWorkbench() {
  "use strict";

  if (window.__AI_PROJECT_HUB_FEATURES__ && window.__AI_PROJECT_HUB_FEATURES__.deliveryNavigation === false) {
    return;
  }

  var PAGE_ID = "delivery-governance-page";
  var HASH = "#delivery-governance";
  var ROUTE_EVENT = "legacy-workbench:navigate";
  var state = {
    active: window.location.hash.indexOf(HASH) === 0,
    loading: false,
    error: "",
    scope: "all",
    status: "all",
    search: "",
    source: "all",
    page: 1,
    pageSize: 8,
    payload: null,
    selectedId: 0,
    packageData: null,
    view: "governance",
    helpKey: "",
    submitChecks: {},
    submitNotes: "",
    reviewNote: "",
    auditNode: 0,
    mineStatus: "all",
    mineSource: "all",
    mineSearch: "",
    acceptancePriority: "all",
    acceptanceFreshness: "all",
    acceptanceTab: "overview",
    acceptanceLoading: false,
    graphNode: "project",
    graphFilter: "all",
    graphChart: null,
    graphResizeObserver: null,
    saving: false,
    controller: null,
  };

  var statusMeta = {
    not_submitted: { label: "未提交", tone: "muted", icon: "circle-dashed" },
    pending_acceptance: { label: "待验收", tone: "warning", icon: "clock-3" },
    accepted: { label: "已验收", tone: "success", icon: "badge-check" },
    rejected: { label: "已退回", tone: "danger", icon: "circle-x" },
    stale: { label: "证据失效", tone: "danger", icon: "refresh-cw-off" },
  };
  var checkLabels = {
    visual_ok: "视觉规范",
    interaction_ok: "交互完整",
    state_ok: "状态覆盖",
    performance_ok: "性能基线",
    responsive_ok: "适配要求",
  };
  var eventLabels = {
    submitted: "提交交付包",
    accepted: "管理员验收通过",
    rejected: "管理员退回修改",
    online_marked: "通过上线门禁",
  };
  var help = {
    project: ["项目与版本", "项目、GitLab 仓库、分支和提交 SHA 均以同一项目 ID 关联。版本变化后，旧验收会自动标记为证据失效。"],
    selfcheck: ["五项自检", "视觉、交互、状态、性能与适配必须全部完成；它们是交付包的一部分，不替代代码质检或运行监控。"],
    quality: ["代码质量门禁", "使用最新提交对应的代码质检报告。旧规则、失败扫描或非最新提交都不能进入管理员验收。"],
    acceptance: ["管理员验收", "只有管理员可以给出通过或退回结论。退回必须填写原因，所有结论都会写入不可覆盖的审计事件。"],
    readiness: ["上线门禁", "正式地址、最新代码质检、同版本验收、生产运行监控和严重预警必须同时满足。"],
    priority: ["处理优先级", "按退回、证据失效、待验收、未提交和上线阻断项综合排序；仅用于安排工作，不修改业务状态。"],
    audit: ["证据链", "每次提交都会生成独立快照；验收和上线形成追加事件，因此重新提交不会覆盖历史证据。"],
    mine_queue: ["我的交付处置队列", "仅展示当前登录人负责或参与、且仍需本人处理或关注的项目版本。优先级来自交付状态、证据有效性和上线阻断项。"],
    mine_version: ["当前版本", "当前版本以最新交付快照绑定的分支与 Commit 为准；没有快照时读取最新有效代码质检版本。"],
    mine_blocker: ["当前阻断", "阻断来自代码质检、预警中心、运行监控、管理员结论与上线门禁，均按项目 ID 和版本关联。"],
    mine_progress: ["自检进度", "五项自检分别是视觉、交互、状态、性能与适配。必须全部完成后才能生成不可覆盖的交付快照。"],
    mine_acceptance: ["验收状态", "管理员验收只对提交时锁定的 Commit 和交付快照有效；出现新提交后，旧验收会自动失效。"],
    mine_summary: ["跨页面证据摘要", "代码质检、预警、运行监控和管理员验收均读取同一项目的当前证据，并保留各自来源页面。"],
    version_compare: ["版本差异复核", "当前待提交版本与最近一次已验收快照进行对比。GitLab 变更文件、MR、流水线与覆盖率需接入后才能参与自动影响分析。"],
    evidence_graph: ["交付证据关系图", "节点来自项目档案、GitLab、代码质检、自检快照、管理员验收、运行监控、预警和上线门禁。可拖动节点、滚轮缩放、点击查看来源。"],
    acceptance_queue: ["待验收队列", "只展示已生成不可覆盖交付快照、等待管理员结论的项目。排序来自提交时间、证据有效性、质量门禁和运行阻断，不修改项目状态。"],
    acceptance_snapshot: ["不可变版本快照", "分支、Commit、五项自检、质检报告和提交时间在提交待验收时固化。后续仓库版本变化不会改写旧快照。"],
    acceptance_freshness: ["证据时效", "系统实时核对提交快照与最新质检报告、GitLab 提交是否仍一致。未配置业务 SLA 时仅展示真实等待时长，不伪造到期时间。"],
    acceptance_integrations: ["GitLab 深度验收维度", "MR 审批、流水线结果、受保护分支、发布产物和部署环境尚未形成完整的项目级证据链时统一标记为“需接入”，不参与当前自动结论。"],
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function compact(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function icon(name, className) {
    var aliases = {
      "archive-x": "archive",
      "badge-check": "circle-check",
      "chevron-left": "arrow-left",
      "clipboard-check": "list-checks",
      "folder-open": "folder",
      "folder-kanban": "folder",
      "git-commit": "git-commit-horizontal",
      "git-merge": "git-branch",
      lightbulb: "sparkles",
      "package-check": "archive-restore",
      "refresh-cw-off": "refresh-cw",
      rocket: "play",
      "search-x": "search",
      send: "arrow-right",
      "triangle-alert": "alert-triangle",
      "undo-2": "rotate-ccw",
      circle: "circle-dashed",
    };
    name = aliases[name] || name;
    return '<i data-lucide="' + esc(name) + '" class="dg-icon' + (className ? " " + esc(className) : "") + '" aria-hidden="true"></i>';
  }
  function hydrateIcons() {
    var runtime = window.LegacyQualityIcons;
    if (runtime && typeof runtime.createIcons === "function") {
      runtime.createIcons({ icons: runtime.icons, attrs: { width: 17, height: 17, "stroke-width": 1.8 } });
    }
  }
  function formatTime(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function shortSha(value) { return value ? String(value).slice(0, 9) : "未绑定"; }
  function status(value) { return statusMeta[value] || statusMeta.not_submitted; }
  function statusBadge(value) {
    var meta = status(value);
    return '<span class="dg-badge is-' + meta.tone + '">' + icon(meta.icon) + esc(meta.label) + '</span>';
  }
  function helpButton(key) {
    var entry = help[key] || ["字段说明", "暂无说明"];
    return '<button type="button" class="dg-info" data-dg-action="help" data-help-key="' + esc(key) + '" aria-label="查看' + esc(entry[0]) + '说明">' + icon("info") + '</button>';
  }
  function fetchJson(url, options) {
    var config = Object.assign({ credentials: "same-origin", cache: "no-store" }, options || {});
    if (config.body) config.headers = Object.assign({ "Content-Type": "application/json" }, config.headers || {});
    return fetch(url, config).then(async function (response) {
      var text = await response.text();
      var body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
      if (!response.ok) throw new Error(body.detail || body.message || "请求失败（" + response.status + "）");
      return body;
    });
  }
  function toast(message, tone) {
    var node = document.createElement("div");
    node.className = "dg-toast is-" + (tone || "info");
    node.textContent = message;
    document.body.appendChild(node);
    requestAnimationFrame(function () { node.classList.add("is-visible"); });
    window.setTimeout(function () { node.classList.remove("is-visible"); window.setTimeout(function () { node.remove(); }, 220); }, 2600);
  }
  function navText(button) {
    if (!button) return "";
    var clone = button.cloneNode(true);
    clone.querySelectorAll("b, .simple-child-nav-icon").forEach(function (node) { node.remove(); });
    return compact(clone.textContent).replace(/\s+\d+$/, "");
  }
  function navButtons() {
    return Array.from(document.querySelectorAll(".sidebar button")).filter(function (button) {
      return ["全部记录", "我的自检", "待验收"].includes(navText(button));
    });
  }
  function ensurePage() {
    var main = document.querySelector(".app-shell main") || document.querySelector("main");
    if (!main) return null;
    var page = document.getElementById(PAGE_ID);
    if (page && page.parentElement !== main) page.remove();
    if (!page) {
      page = document.createElement("section");
      page.id = PAGE_ID;
      page.className = "delivery-governance-page";
      page.setAttribute("aria-label", "交付治理中心");
      main.appendChild(page);
    }
    return page;
  }
  function syncNav() {
    navButtons().forEach(function (button) {
      var label = navText(button);
      var selected = state.active && ((state.scope === "mine" && label === "我的自检") || (state.status === "pending_acceptance" && label === "待验收") || (state.scope === "all" && state.status !== "pending_acceptance" && label === "全部记录"));
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
  }
  function setHash(active) {
    if (active && window.location.hash.indexOf(HASH) !== 0) history.replaceState(null, "", window.location.pathname + window.location.search + HASH);
    if (!active && window.location.hash.indexOf(HASH) === 0) history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  function activate(options) {
    options = options || {};
    // Always announce this route, including the first hash-based page load, so
    // previously mounted workbenches release their body/page visibility state.
    window.dispatchEvent(new CustomEvent(ROUTE_EVENT, { detail: { hash: HASH } }));
    state.active = true;
    state.scope = options.scope || state.scope;
    state.status = options.status || state.status;
    state.view = "governance";
    state.page = 1;
    document.documentElement.classList.add("legacy-delivery-governance-view");
    var page = ensurePage();
    if (page) page.setAttribute("aria-hidden", "false");
    setHash(true);
    syncNav();
    loadGovernance(true);
  }
  function deactivate() {
    state.active = false;
    state.controller && state.controller.abort();
    document.documentElement.classList.remove("legacy-delivery-governance-view");
    var page = document.getElementById(PAGE_ID);
    if (page) page.setAttribute("aria-hidden", "true");
    syncNav();
  }
  function pageElement() { return ensurePage(); }

  function header(title, subtitle) {
    return '<header class="dg-header"><div><div class="dg-eyebrow">交付自检 / 交付治理</div><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div><div class="dg-header-actions">' +
      '<button type="button" class="dg-button is-secondary" data-dg-action="audit-rules">' + icon("shield-check") + '审计规则</button>' +
      '<button type="button" class="dg-button is-primary" data-dg-action="refresh">' + icon("refresh-cw") + '刷新数据</button></div></header>';
  }
  function workflow(active) {
    var items = [
      ["governance", "1", "交付治理台账", "全项目风险与处理顺序"],
      ["package", "2", "版本交付包", "同一提交的五项证据"],
      ["review", "3", "管理员验收", "结论、原因与责任留痕"],
      ["audit", "4", "审计与上线门禁", "不可覆盖证据链"],
    ];
    return '<nav class="dg-workflow" aria-label="交付业务流程">' + items.map(function (item, index) {
      return '<button type="button" class="dg-workflow-step' + (active === item[0] ? " is-active" : "") + '" data-dg-view="' + item[0] + '"' + (item[0] !== "governance" && !state.selectedId ? " disabled" : "") + '><span>' + item[1] + '</span><strong>' + item[2] + '</strong><small>' + item[3] + '</small></button>' + (index < items.length - 1 ? '<i class="dg-workflow-line" aria-hidden="true"></i>' : "");
    }).join("") + '</nav>';
  }
  function infoDialog() {
    if (!state.helpKey) return "";
    var entry = state.helpKey === "rules"
      ? ["交付审计规则", "交付快照按项目与提交序号追加保存；管理员结论和上线事件只追加、不覆盖。代码质检、GitLab 提交、运行检查和预警都按项目 ID 与提交版本核对。"]
      : help[state.helpKey];
    if (!entry) return "";
    return '<div class="dg-dialog-backdrop" data-dg-action="close-help"><section class="dg-dialog" role="dialog" aria-modal="true" aria-labelledby="dg-help-title"><header><div><small>字段说明</small><h2 id="dg-help-title">' + esc(entry[0]) + '</h2></div><button type="button" data-dg-action="close-help" aria-label="关闭说明">' + icon("x") + '</button></header><p>' + esc(entry[1]) + '</p><div class="dg-dialog-note">' + icon("database") + '<span>页面展示来自项目档案、GitLab、代码质检、运行监控、预警和交付审计的关联数据，不使用演示数值替代。</span></div></section></div>';
  }

  function filteredRecords() {
    var records = state.payload && state.payload.records || [];
    var query = compact(state.search).toLowerCase();
    return records.filter(function (record) {
      var effective = record.delivery.effective_status || record.delivery.status;
      if (state.status !== "all" && effective !== state.status) return false;
      if (state.source !== "all" && (record.project.demand_source || "未分类") !== state.source) return false;
      if (query) {
        var haystack = [record.project.name, record.project.owner_name, record.project.gitlab_project_id, record.project.demand_source, (record.priority.reasons || []).join(" ")].join(" ").toLowerCase();
        if (haystack.indexOf(query) < 0) return false;
      }
      return true;
    });
  }
  function filterBar(records) {
    var sources = Array.from(new Set((state.payload.records || []).map(function (record) { return record.project.demand_source || "未分类"; }))).sort();
    return '<section class="dg-panel dg-filters" aria-label="交付筛选器"><label><span>检索</span><div class="dg-search">' + icon("search") + '<input type="search" data-dg-search placeholder="搜索项目、负责人、仓库或阻断原因" value="' + esc(state.search) + '"></div></label>' +
      '<label><span>交付状态</span><select data-dg-filter="status"><option value="all">全部状态</option>' + Object.keys(statusMeta).map(function (key) { return '<option value="' + key + '"' + (state.status === key ? " selected" : "") + '>' + esc(statusMeta[key].label) + '</option>'; }).join("") + '</select></label>' +
      '<label><span>需求来源</span><select data-dg-filter="source"><option value="all">全部来源</option>' + sources.map(function (source) { return '<option value="' + esc(source) + '"' + (state.source === source ? " selected" : "") + '>' + esc(source) + '</option>'; }).join("") + '</select></label>' +
      '<button type="button" class="dg-button is-secondary" data-dg-action="reset">' + icon("rotate-ccw") + '重置</button><p>当前结果 <strong>' + records.length + '</strong> 个项目</p></section>';
  }
  function kpis() {
    var counts = state.payload.counts;
    var items = [
      ["layers-3", counts.total, "纳入治理", "全部可访问项目", "blue"],
      ["clock-3", counts.pending_acceptance, "待管理员验收", "已形成版本交付包", "amber"],
      ["badge-check", counts.accepted, "有效验收", "证据仍与当前提交一致", "green"],
      ["refresh-cw-off", counts.stale + counts.rejected, "需重新处理", "证据失效或已退回", "red"],
      ["rocket", counts.ready, "具备上线条件", "五项门禁全部通过", "violet"],
    ];
    return '<section class="dg-kpis" aria-label="交付治理概览">' + items.map(function (item) {
      return '<article class="is-' + item[4] + '"><span>' + icon(item[0]) + '</span><div><strong>' + item[1] + '</strong><b>' + item[2] + '</b><small>' + item[3] + '</small></div></article>';
    }).join("") + '</section>';
  }
  function readinessDots(readiness) {
    return '<div class="dg-gates" aria-label="上线门禁 ' + (readiness.ready ? "已通过" : "未通过") + '">' + readiness.requirements.map(function (item) {
      return '<span class="' + (item.passed ? "is-pass" : "is-block") + '" title="' + esc(item.label + '：' + item.message) + '"></span>';
    }).join("") + '</div>';
  }
  function governanceTable(records) {
    var totalPages = Math.max(1, Math.ceil(records.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var start = (state.page - 1) * state.pageSize;
    var pageRecords = records.slice(start, start + state.pageSize);
    return '<section class="dg-panel dg-ledger"><div class="dg-panel-head"><div><span class="dg-kicker">全项目治理台账</span><h2>交付证据与上线门禁</h2><p>点击项目进入同版本交付包；排序来自真实状态与阻断条件。</p></div><span class="dg-result">第 ' + state.page + ' / ' + totalPages + ' 页</span></div><div class="dg-table-wrap"><table><thead><tr>' +
      '<th>优先级 ' + helpButton("priority") + '</th><th>项目与版本 ' + helpButton("project") + '</th><th>五项自检 ' + helpButton("selfcheck") + '</th><th>代码门禁 ' + helpButton("quality") + '</th><th>验收结论 ' + helpButton("acceptance") + '</th><th>上线门禁 ' + helpButton("readiness") + '</th><th>下一步</th></tr></thead><tbody>' +
      (pageRecords.length ? pageRecords.map(function (record, index) {
        var delivery = record.delivery;
        var effective = delivery.effective_status || delivery.status;
        var qualityPassed = delivery.quality_gate_status === "passed" && delivery.evidence && delivery.evidence.current;
        return '<tr tabindex="0" data-dg-project="' + record.project.id + '" aria-label="打开项目交付包：' + esc(record.project.name) + '"><td><span class="dg-rank is-' + (record.priority.score >= 88 ? "high" : record.priority.score >= 70 ? "medium" : "low") + '">' + (start + index + 1) + '</span><small>' + record.priority.score + ' 分</small></td>' +
          '<td><strong>' + esc(record.project.name) + '</strong><small>' + esc(record.project.gitlab_project_id || "未关联 GitLab") + '</small><em>' + esc(record.project.owner_name || "负责人待确认") + '</em></td>' +
          '<td><div class="dg-progress"><span style="width:' + (delivery.passed_count * 20) + '%"></span></div><b>' + delivery.passed_count + ' / ' + delivery.total_count + '</b></td>' +
          '<td><span class="dg-badge is-' + (qualityPassed ? "success" : "danger") + '">' + icon(qualityPassed ? "shield-check" : "shield-alert") + (qualityPassed ? "最新提交通过" : esc(delivery.quality_gate_status || "未质检")) + '</span><small>' + shortSha(delivery.quality_commit_sha) + '</small></td>' +
          '<td>' + statusBadge(effective) + '<small>' + esc(delivery.reviewed_by || delivery.submitted_by || "尚未流转") + '</small></td>' +
          '<td>' + readinessDots(record.readiness) + '<b class="' + (record.readiness.ready ? "dg-text-success" : "dg-text-danger") + '">' + (record.readiness.ready ? "可上线" : "阻断 " + record.readiness.requirements.filter(function (item) { return !item.passed; }).length) + '</b></td>' +
          '<td><button type="button" class="dg-link" data-dg-action="open-package" data-project-id="' + record.project.id + '">' + (effective === "pending_acceptance" && record.can_review ? "开始验收" : "查看交付包") + icon("chevron-right") + '</button></td></tr>';
      }).join("") : '<tr><td colspan="7"><div class="dg-empty">' + icon("search-x") + '<strong>没有符合条件的项目</strong><span>清除筛选后查看全部交付记录。</span></div></td></tr>') +
      '</tbody></table></div><footer class="dg-pagination"><span>显示 ' + (records.length ? start + 1 : 0) + '–' + Math.min(records.length, start + state.pageSize) + '，共 ' + records.length + ' 项</span><div><button type="button" data-dg-action="page-prev"' + (state.page <= 1 ? " disabled" : "") + '>' + icon("chevron-left") + '上一页</button><button type="button" data-dg-action="page-next"' + (state.page >= totalPages ? " disabled" : "") + '>下一页' + icon("chevron-right") + '</button></div></footer></section>';
  }
  function priorityQueue(records) {
    var items = records.slice(0, 5);
    return '<aside class="dg-panel dg-priority"><div class="dg-panel-head"><div><span class="dg-kicker">建议处理顺序</span><h2>交付阻断队列</h2><p>按版本证据和上线门禁实时计算</p></div>' + helpButton("priority") + '</div><div class="dg-priority-list">' + (items.length ? items.map(function (record, index) {
      var effective = record.delivery.effective_status || record.delivery.status;
      return '<button type="button" data-dg-action="open-package" data-project-id="' + record.project.id + '"><span class="dg-rank is-' + (record.priority.score >= 88 ? "high" : record.priority.score >= 70 ? "medium" : "low") + '">' + (index + 1) + '</span><div><strong>' + esc(record.project.name) + '</strong><small>' + esc((record.priority.reasons || []).join(" · ") || "持续跟踪") + '</small></div>' + statusBadge(effective) + '<b>' + record.priority.score + '</b></button>';
    }).join("") : '<div class="dg-empty is-compact">' + icon("badge-check") + '<strong>当前没有阻断项</strong></div>') + '</div><div class="dg-priority-note">' + icon("lightbulb") + '<p><strong>排序不会修改项目状态</strong><span>点击项目后再执行提交、验收或上线动作。</span></p></div></aside>';
  }
  function mineRecords() {
    var records = state.payload && state.payload.records || [];
    var query = compact(state.mineSearch).toLowerCase();
    return records.filter(function (record) {
      var effective = record.delivery.effective_status || record.delivery.status;
      if (state.mineStatus !== "all" && effective !== state.mineStatus) return false;
      if (state.mineSource !== "all" && (record.project.demand_source || "未分类") !== state.mineSource) return false;
      if (!query) return true;
      return [record.project.name, record.project.owner_name, record.project.gitlab_project_id, record.project.demand_source, (record.priority.reasons || []).join(" ")].join(" ").toLowerCase().includes(query);
    });
  }
  function mineSelected(records) {
    var selected = records.find(function (record) { return Number(record.project.id) === Number(state.selectedId); });
    if (!selected) selected = records[0] || null;
    if (selected) state.selectedId = Number(selected.project.id);
    return selected;
  }
  function mineKpis(records) {
    var actionable = records.filter(function (record) { return ["not_submitted", "rejected", "stale"].includes(record.delivery.effective_status || record.delivery.status); }).length;
    var readySubmit = records.filter(function (record) { return record.delivery.passed_count === 5 && ["not_submitted", "rejected", "stale"].includes(record.delivery.effective_status || record.delivery.status); }).length;
    var pending = records.filter(function (record) { return (record.delivery.effective_status || record.delivery.status) === "pending_acceptance"; }).length;
    var stale = records.filter(function (record) { return (record.delivery.effective_status || record.delivery.status) === "stale"; }).length;
    var items = [
      ["folder", records.length, "我的项目", "负责或参与", "blue", "project"],
      ["circle-minus", actionable, "待处理", "需要补齐或重提", "red", "mine_queue"],
      ["clock-3", readySubmit, "待提交", "自检已完成", "amber", "mine_progress"],
      ["user-check", pending, "待验收", "已锁定交付快照", "violet", "mine_acceptance"],
      ["refresh-cw-off", stale, "证据失效", "新提交导致版本变化", "red", "mine_version"],
    ];
    return '<section class="dg-mine-kpis" aria-label="我的自检概览">' + items.map(function (item) {
      return '<article class="is-' + item[4] + '"><span>' + icon(item[0]) + '</span><div><b>' + item[1] + '</b><strong>' + item[2] + '</strong><small>' + item[3] + '</small></div>' + helpButton(item[5]) + '</article>';
    }).join("") + '</section>';
  }
  function mineFilters(records) {
    var payloadRecords = state.payload && state.payload.records || [];
    var sources = Array.from(new Set(payloadRecords.map(function (record) { return record.project.demand_source || "未分类"; }))).sort();
    return '<div class="dg-mine-table-tools"><div class="dg-search">' + icon("search") + '<input type="search" data-dg-mine-search placeholder="搜索项目、版本、Commit 或负责人" value="' + esc(state.mineSearch) + '"></div><select data-dg-mine-filter="status" aria-label="按交付状态筛选"><option value="all">全部状态</option>' + Object.keys(statusMeta).map(function (key) { return '<option value="' + key + '"' + (state.mineStatus === key ? " selected" : "") + '>' + esc(statusMeta[key].label) + '</option>'; }).join("") + '</select><select data-dg-mine-filter="source" aria-label="按需求来源筛选"><option value="all">全部来源</option>' + sources.map(function (source) { return '<option value="' + esc(source) + '"' + (state.mineSource === source ? " selected" : "") + '>' + esc(source) + '</option>'; }).join("") + '</select><button type="button" class="dg-button is-secondary" data-dg-action="mine-reset">' + icon("rotate-ccw") + '重置</button><span>当前 ' + records.length + ' 项</span></div>';
  }
  function mineCheckDots(delivery) {
    return '<div class="dg-mine-check-dots" aria-label="五项自检完成 ' + delivery.passed_count + ' 项">' + Object.keys(checkLabels).map(function (key) { return '<span class="' + (delivery.checks[key] ? "is-pass" : "") + '" title="' + esc(checkLabels[key] + (delivery.checks[key] ? "：已完成" : "：待完成")) + '">' + icon(delivery.checks[key] ? "check" : "circle") + '</span>'; }).join("") + '</div>';
  }
  function mineQueue(records, selected) {
    return '<section class="dg-panel dg-mine-queue"><div class="dg-panel-head"><div><span class="dg-kicker">个人交付工作台</span><h2>我的交付处置队列 ' + helpButton("mine_queue") + '</h2><p>优先展示我负责或参与且仍需关注的当前版本。</p></div></div>' + mineFilters(records) + '<div class="dg-table-wrap dg-mine-table"><table><thead><tr><th>优先级</th><th>项目 / 我的角色</th><th>当前版本 ' + helpButton("mine_version") + '</th><th>最新证据</th><th>当前阻断 ' + helpButton("mine_blocker") + '</th><th>自检进度 ' + helpButton("mine_progress") + '</th><th>验收状态 ' + helpButton("mine_acceptance") + '</th><th>下一步</th></tr></thead><tbody>' + (records.length ? records.map(function (record, index) {
      var delivery = record.delivery;
      var effective = delivery.effective_status || delivery.status;
      var blockers = record.readiness.requirements.filter(function (item) { return !item.passed; });
      var selectedClass = selected && Number(selected.project.id) === Number(record.project.id) ? " is-selected" : "";
      var actionLabel = effective === "accepted" && delivery.evidence && delivery.evidence.current ? "查看记录" : delivery.passed_count === 5 ? "继续处理" : "开始自检";
      return '<tr class="' + selectedClass + '" tabindex="0" data-dg-mine-project="' + record.project.id + '"><td><span class="dg-mine-priority is-' + (record.priority.score >= 88 ? "high" : record.priority.score >= 70 ? "medium" : "low") + '">P' + Math.min(3, index + 1) + '</span><small>' + record.priority.score + ' 分</small></td><td><strong>' + esc(record.project.name) + '</strong><small>' + esc(record.permission === "owner" ? "负责人" : record.permission === "admin" ? "管理员" : "参与者") + '</small></td><td><b>' + esc(delivery.quality_branch || record.project.gitlab_default_branch || "分支待确认") + '</b><strong>' + shortSha(delivery.quality_commit_sha) + '</strong><small>' + formatTime(delivery.updated_at) + '</small></td><td><span class="dg-quality-score ' + (delivery.quality_gate_status === "passed" ? "is-pass" : "is-block") + '">' + (delivery.quality_score == null ? "—" : delivery.quality_score) + '</span><small>' + esc(delivery.quality_gate_status === "passed" ? "代码质检通过" : delivery.quality_gate_status || "尚未质检") + '</small></td><td>' + (blockers.length ? '<span class="dg-badge is-danger">' + icon("circle-minus") + '阻断 ' + blockers.length + '</span><small>' + esc(blockers[0].label) + '</small>' : '<span class="dg-badge is-success">' + icon("check") + '无阻断</span><small>当前证据完整</small>') + '</td><td><b>' + delivery.passed_count + ' / 5</b>' + mineCheckDots(delivery) + '</td><td>' + statusBadge(effective) + '<small>' + esc(delivery.reviewed_by || delivery.submitted_by || "尚未流转") + '</small></td><td><button type="button" class="dg-button is-secondary is-compact" data-dg-action="mine-continue" data-project-id="' + record.project.id + '">' + actionLabel + '</button></td></tr>';
    }).join("") : '<tr><td colspan="8"><div class="dg-empty"><strong>没有符合条件的项目</strong><span>重置筛选后查看我的全部交付任务。</span></div></td></tr>') + '</tbody></table></div></section>';
  }
  function mineInspector(record) {
    if (!record) return '<aside class="dg-panel dg-mine-inspector"><div class="dg-empty"><strong>暂无我的项目</strong><span>项目负责人或参与人关联后会出现在这里。</span></div></aside>';
    var delivery = record.delivery;
    var effective = delivery.effective_status || delivery.status;
    var blockers = record.readiness.requirements.filter(function (item) { return !item.passed; });
    var participants = record.project.participant_users || [];
    return '<aside class="dg-panel dg-mine-inspector"><header><div><span class="dg-kicker">当前项目</span><h2>' + esc(record.project.name) + '</h2><p>' + statusBadge(effective) + ' · ' + esc(delivery.quality_branch || record.project.gitlab_default_branch || "分支待确认") + '</p></div></header><section><h3>负责人与你的协作关系</h3><dl><div><dt>负责人</dt><dd>' + esc(record.project.owner_name || "待确认") + '</dd></div><div><dt>参与成员</dt><dd>' + esc(participants.length ? participants.map(function (user) { return user.name || user; }).slice(0, 4).join("、") : "暂无") + '</dd></div></dl></section><section><h3>代码与质量</h3><dl><div><dt>GitLab 项目</dt><dd>' + esc(record.project.gitlab_project_id || "未关联") + '</dd></div><div><dt>分支 / Commit</dt><dd>' + esc(delivery.quality_branch || "—") + ' · ' + shortSha(delivery.quality_commit_sha) + '</dd></div><div><dt>代码质检</dt><dd>' + (delivery.quality_score == null ? "暂无质量分" : delivery.quality_score + " / 100") + '</dd></div></dl></section><section><h3>最严重阻断</h3>' + (blockers.length ? '<div class="dg-mine-blocker">' + icon("circle-minus") + '<div><strong>' + esc(blockers[0].label) + '</strong><p>' + esc(blockers[0].message) + '</p></div></div>' : '<div class="dg-mine-ok">' + icon("check-circle-2") + '<span>当前未发现上线阻断项</span></div>') + '</section><section><h3>关联证据时效</h3><ul class="dg-mine-source-list"><li><span>代码质检</span><b>' + (delivery.quality_gate_status === "passed" ? "通过" : "待处理") + '</b></li><li><span>预警中心</span><b>' + record.readiness.blocking_alerts.length + ' 条阻断</b></li><li><span>运行监控</span><b>' + (record.readiness.runtime.ready ? "健康" : "待接入/异常") + '</b></li><li><span>管理员验收</span><b>' + esc(status(effective).label) + '</b></li></ul></section><button type="button" class="dg-button is-primary dg-mine-inspector-action" data-dg-action="mine-continue" data-project-id="' + record.project.id + '">' + icon("play") + '继续处理当前版本</button></aside>';
  }
  function mineEvidenceSummary(record) {
    if (!record) return "";
    var delivery = record.delivery;
    var effective = delivery.effective_status || delivery.status;
    var items = [
      ["shield-check", "代码质检", delivery.quality_gate_status === "passed" ? "通过" : "未通过", delivery.quality_score == null ? "暂无质量分" : delivery.quality_score + " / 100", "代码质检"],
      ["bell", "预警", record.readiness.blocking_alerts.length ? record.readiness.blocking_alerts.length + " 条阻断" : "无阻断", formatTime(record.readiness.checked_at), "预警中心"],
      ["activity", "运行监控", record.readiness.runtime.ready ? "健康" : "待接入/异常", (record.readiness.runtime.checks_healthy || 0) + " / " + (record.readiness.runtime.checks_total || 0) + " 检查点", "运行总览"],
      ["user-check", "管理员验收", status(effective).label, delivery.reviewed_by || "尚未验收", "待验收"],
    ];
    return '<section class="dg-panel dg-mine-summary"><div class="dg-panel-head"><div><span class="dg-kicker">所选项目 · ' + esc(delivery.quality_branch || "分支待确认") + ' · ' + shortSha(delivery.quality_commit_sha) + '</span><h2>跨页面证据摘要 ' + helpButton("mine_summary") + '</h2><p>同一项目和版本的关键证据，点击来源进入对应管理页面。</p></div></div><div>' + items.map(function (item) { return '<article><span>' + icon(item[0]) + '</span><div><small>' + item[1] + '</small><strong>' + esc(item[2]) + '</strong><p>' + esc(item[3]) + '</p><em>来源：' + item[4] + '</em></div></article>'; }).join("") + '</div><footer>' + icon("info") + '<span>若阻断项已修复，请重新运行对应检查以刷新证据状态；历史快照不会被覆盖。</span></footer></section>';
  }
  function renderMineOverview() {
    var records = mineRecords();
    var selected = mineSelected(records);
    return header("我的自检", "按当前版本和阻断顺序完成我的交付任务") + mineKpis(state.payload && state.payload.records || []) + '<div class="dg-mine-layout">' + mineQueue(records, selected) + mineInspector(selected) + '</div>' + mineEvidenceSummary(selected) + infoDialog();
  }
  function elapsedMeta(value) {
    if (!value) return { minutes: null, label: "时间待确认", bucket: "unknown" };
    var stamp = new Date(value);
    if (Number.isNaN(stamp.getTime())) return { minutes: null, label: "时间待确认", bucket: "unknown" };
    var minutes = Math.max(0, Math.floor((Date.now() - stamp.getTime()) / 60000));
    if (minutes < 60) return { minutes: minutes, label: minutes + " 分钟", bucket: "fresh" };
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return { minutes: minutes, label: hours + " 小时", bucket: hours >= 8 ? "aging" : "fresh" };
    var days = Math.floor(hours / 24);
    return { minutes: minutes, label: days + " 天", bucket: "aging" };
  }
  function acceptanceAllRecords() {
    return (state.payload && state.payload.records || []).filter(function (record) {
      return (record.delivery.effective_status || record.delivery.status) === "pending_acceptance";
    });
  }
  function acceptanceRecords() {
    var query = compact(state.search).toLowerCase();
    return acceptanceAllRecords().filter(function (record) {
      var delivery = record.delivery;
      var evidenceCurrent = Boolean(delivery.evidence && delivery.evidence.current);
      if (state.acceptancePriority === "high" && Number(record.priority.score || 0) < 85) return false;
      if (state.acceptancePriority === "normal" && Number(record.priority.score || 0) >= 85) return false;
      if (state.acceptanceFreshness === "current" && !evidenceCurrent) return false;
      if (state.acceptanceFreshness === "stale" && evidenceCurrent) return false;
      if (!query) return true;
      var snapshot = record.latest_snapshot || {};
      return [record.project.name, record.project.owner_name, record.project.gitlab_project_id, delivery.submitted_by, delivery.quality_branch, delivery.quality_commit_sha, snapshot.quality_commit_sha].join(" ").toLowerCase().includes(query);
    });
  }
  function acceptanceKpis(records) {
    var current = records.filter(function (record) { return record.delivery.evidence && record.delivery.evidence.current; }).length;
    var invalid = records.length - current;
    var direct = records.filter(function (record) {
      return record.delivery.evidence && record.delivery.evidence.current && record.delivery.passed_count === 5 && record.delivery.quality_gate_status === "passed";
    }).length;
    var review = Math.max(0, records.length - direct);
    var items = [
      ["inbox", records.length, "待验收", "已生成不可变交付快照", "blue", "acceptance_queue"],
      ["clock-3", records.length, "等待管理员", "按真实提交时间排序", "amber", "acceptance_freshness"],
      ["shield-x", invalid, "证据失效", "当前版本已不一致", "red", "acceptance_freshness"],
      ["circle-check", direct, "可进入决策", "自检与代码门禁有效", "green", "acceptance_snapshot"],
      ["scan-search", review, "需复核", "存在失效或缺口", "violet", "acceptance_integrations"],
    ];
    return '<section class="dg-acceptance-kpis" aria-label="待验收概览">' + items.map(function (item) {
      return '<article class="is-' + item[4] + '"><span>' + icon(item[0]) + '</span><div><b>' + item[1] + '</b><strong>' + item[2] + '</strong><small>' + item[3] + '</small></div>' + helpButton(item[5]) + '</article>';
    }).join("") + '</section>';
  }
  function acceptanceFilters(records) {
    return '<section class="dg-panel dg-acceptance-filters" aria-label="待验收筛选器"><div class="dg-search">' + icon("search") + '<input type="search" data-dg-search placeholder="搜索项目、负责人、提交人、分支或 Commit" value="' + esc(state.search) + '"></div>' +
      '<label><span>优先级</span><select data-dg-acceptance-filter="priority"><option value="all">全部优先级</option><option value="high"' + (state.acceptancePriority === "high" ? " selected" : "") + '>高优先级</option><option value="normal"' + (state.acceptancePriority === "normal" ? " selected" : "") + '>普通优先级</option></select></label>' +
      '<label><span>证据时效</span><select data-dg-acceptance-filter="freshness"><option value="all">全部证据</option><option value="current"' + (state.acceptanceFreshness === "current" ? " selected" : "") + '>当前有效</option><option value="stale"' + (state.acceptanceFreshness === "stale" ? " selected" : "") + '>已失效</option></select></label>' +
      '<button type="button" class="dg-button is-secondary" data-dg-action="acceptance-reset">' + icon("rotate-ccw") + '重置</button><span>当前结果 <b>' + records.length + '</b> 项</span></section>';
  }
  function acceptanceCheckIcons(delivery) {
    return '<div class="dg-acceptance-checks" aria-label="五项自检完成 ' + delivery.passed_count + ' 项">' + Object.keys(checkLabels).map(function (key) {
      var passed = Boolean(delivery.checks && delivery.checks[key]);
      return '<span class="' + (passed ? "is-pass" : "is-block") + '" title="' + esc(checkLabels[key] + "：" + (passed ? "已完成" : "未完成")) + '">' + icon(passed ? "check" : "x") + '</span>';
    }).join("") + '<b>' + delivery.passed_count + ' / 5</b></div>';
  }
  function acceptanceTable(records) {
    var totalPages = Math.max(1, Math.ceil(records.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var start = (state.page - 1) * state.pageSize;
    var pageRecords = records.slice(start, start + state.pageSize);
    return '<section class="dg-panel dg-acceptance-queue"><div class="dg-panel-head"><div><span class="dg-kicker">管理员工作队列</span><h2>版本交付快照 ' + helpButton("acceptance_queue") + '</h2><p>点击项目在右侧核对同一版本证据并给出验收结论。</p></div><span class="dg-result">第 ' + state.page + ' / ' + totalPages + ' 页</span></div><div class="dg-table-wrap dg-acceptance-table"><table><thead><tr><th>优先级</th><th>项目 / 负责人</th><th>不可变版本快照</th><th>提交人 / 时间</th><th>五项自检</th><th>代码门禁</th><th>运行 / 预警</th><th>证据时效</th></tr></thead><tbody>' + (pageRecords.length ? pageRecords.map(function (record, index) {
      var delivery = record.delivery;
      var snapshot = record.latest_snapshot || {};
      var runtime = record.readiness.runtime || {};
      var wait = elapsedMeta(delivery.submitted_at);
      var evidenceCurrent = Boolean(delivery.evidence && delivery.evidence.current);
      var selected = Number(record.project.id) === Number(state.selectedId);
      var priorityTone = record.priority.score >= 88 ? "high" : record.priority.score >= 78 ? "medium" : "low";
      var priorityLabel = priorityTone === "high" ? "P1" : priorityTone === "medium" ? "P2" : "P3";
      return '<tr class="' + (selected ? "is-selected" : "") + '" tabindex="0" data-dg-acceptance-project="' + record.project.id + '" aria-label="核验项目：' + esc(record.project.name) + '"><td><span class="dg-acceptance-priority is-' + priorityTone + '">' + priorityLabel + '</span><small>' + record.priority.score + ' 分</small></td>' +
        '<td><strong>' + esc(record.project.name) + '</strong><small>' + esc(record.project.gitlab_project_id || "未关联 GitLab") + '</small><em>' + esc(record.project.owner_name || "负责人待确认") + '</em></td>' +
        '<td><strong>' + esc(snapshot.quality_branch || delivery.quality_branch || "分支待确认") + '</strong><small>' + shortSha(snapshot.quality_commit_sha || delivery.quality_commit_sha) + ' ' + icon("copy") + '</small></td>' +
        '<td><strong>' + esc(snapshot.submitted_by_name || delivery.submitted_by || "提交人待确认") + '</strong><small>' + formatTime(snapshot.submitted_at || delivery.submitted_at) + '</small></td>' +
        '<td>' + acceptanceCheckIcons(delivery) + '</td>' +
        '<td><span class="dg-badge is-' + (delivery.quality_gate_status === "passed" ? "success" : "danger") + '">' + icon(delivery.quality_gate_status === "passed" ? "shield-check" : "shield-alert") + (delivery.quality_gate_status === "passed" ? "通过" : "未通过") + '</span><small>' + (delivery.quality_score == null ? "暂无质量分" : delivery.quality_score + " 分") + ' · v' + esc(delivery.quality_scanner_version || "未知") + '</small></td>' +
        '<td><span class="dg-badge is-' + (runtime.ready ? "success" : "warning") + '">' + icon("activity") + (runtime.ready ? "正常" : "待接入/异常") + '</span><small>' + Number(record.readiness.blocking_alerts.length || 0) + ' 条阻断预警</small></td>' +
        '<td><span class="dg-freshness is-' + (evidenceCurrent ? "current" : "stale") + '">' + icon(evidenceCurrent ? "check-circle-2" : "refresh-cw-off") + (evidenceCurrent ? "当前有效" : "已失效") + '</span><small>已等待 ' + wait.label + '</small><em>SLA 未配置</em></td></tr>';
    }).join("") : '<tr><td colspan="8"><div class="dg-empty">' + icon("inbox") + '<strong>当前没有待验收项目</strong><span>项目提交完整五项自检并生成版本快照后会进入这里；历史记录仍保留在“全部记录”。</span></div></td></tr>') + '</tbody></table></div><footer class="dg-pagination"><span>显示 ' + (records.length ? start + 1 : 0) + '–' + Math.min(records.length, start + state.pageSize) + '，共 ' + records.length + ' 项</span><div><button type="button" data-dg-action="page-prev"' + (state.page <= 1 ? " disabled" : "") + '>' + icon("chevron-left") + '上一页</button><button type="button" data-dg-action="page-next"' + (state.page >= totalPages ? " disabled" : "") + '>下一页' + icon("chevron-right") + '</button></div></footer></section>';
  }
  function acceptanceComparison(data) {
    var comparison = data.comparison || {};
    var snapshot = comparison.current_snapshot || data.snapshots[0] || {};
    var quality = data.readiness.quality || {};
    var rows = [
      ["项目 / 分支", (snapshot.project_snapshot || {}).name || data.project.name, snapshot.quality_branch || data.delivery.quality_branch || "—", quality.branch || "—"],
      ["Commit SHA", shortSha(snapshot.quality_commit_sha), shortSha(snapshot.quality_commit_sha), shortSha(quality.commit_sha)],
      ["扫描器版本", snapshot.quality_scanner_version || data.delivery.quality_scanner_version || "—", snapshot.quality_scanner_version || data.delivery.quality_scanner_version || "—", quality.scanner_version || "—"],
      ["质量分", snapshot.quality_score == null ? "—" : snapshot.quality_score + " / 100", snapshot.quality_score == null ? "—" : snapshot.quality_score + " / 100", quality.score == null ? "—" : quality.score + " / 100"],
      ["五项自检", Object.values(snapshot.checks || data.delivery.checks || {}).filter(Boolean).length + " / 5", Object.values(snapshot.checks || data.delivery.checks || {}).filter(Boolean).length + " / 5", data.delivery.passed_count + " / 5"],
    ];
    return '<div class="dg-acceptance-compare"><div class="dg-acceptance-compare-head"><span>对比项</span><span>提交快照（不可变）</span><span>当前关联状态</span><span>结果</span></div>' + rows.map(function (row) {
      var same = row[2] === row[3];
      return '<div><strong>' + esc(row[0]) + '</strong><span>' + esc(row[2]) + '</span><span>' + esc(row[3]) + '</span><b class="' + (same ? "is-pass" : "is-block") + '">' + icon(same ? "check" : "x") + (same ? "一致" : "已变化") + '</b></div>';
    }).join("") + '</div><div class="dg-acceptance-gaps"><header>' + helpButton("acceptance_integrations") + '<strong>需接入 GitLab</strong><span>接入后才参与自动验收</span></header><div>' + (comparison.unavailable_gitlab_dimensions || []).map(function (item) { return '<span>' + esc(item) + '<b>需接入</b></span>'; }).join("") + '<span>受保护分支<b>需接入</b></span><span>部署环境 / 发布产物<b>需接入</b></span></div></div>';
  }
  function acceptanceLineage(data) {
    var nodes = data.evidence_graph && data.evidence_graph.nodes || [];
    return '<ol class="dg-acceptance-lineage">' + nodes.filter(function (node) { return ["project", "commit", "quality", "selfcheck", "snapshot", "runtime", "alerts", "acceptance"].includes(node.id); }).map(function (node) {
      var meta = graphNodeMeta(node);
      return '<li class="is-' + meta.tone + '"><span>' + icon(meta.tone === "success" ? "check" : meta.tone === "danger" ? "x" : "clock-3") + '</span><button type="button" data-dg-action="acceptance-lineage" data-node-id="' + esc(node.id) + '"><strong>' + esc(node.label) + '</strong><small>' + esc(node.value) + ' · ' + esc(node.source) + '</small></button></li>';
    }).join("") + '</ol>';
  }
  function acceptanceAudit(data) {
    return '<div class="dg-acceptance-audit">' + (data.events.length ? data.events.slice(0, 8).map(function (event) {
      return '<article><span>' + icon(event.event_type === "accepted" ? "badge-check" : event.event_type === "rejected" ? "undo-2" : "package-check") + '</span><div><strong>' + esc(eventLabels[event.event_type] || event.event_type) + '</strong><small>' + esc(event.actor_name || "系统") + ' · ' + formatTime(event.created_at) + '</small><p>' + esc(event.note || "已写入不可修改的交付审计事件") + '</p></div></article>';
    }).join("") : '<div class="dg-empty is-compact"><strong>暂无验收事件</strong><span>提交快照和后续决策会按时间追加保存。</span></div>') + '</div>';
  }
  function acceptanceInspector(record) {
    if (!record) return '<aside class="dg-panel dg-acceptance-inspector is-empty"><div class="dg-empty">' + icon("mouse-pointer-2") + '<strong>选择一条待验收记录</strong><span>右侧将显示同版本快照、证据链和管理员决策。</span></div></aside>';
    if (state.acceptanceLoading || !state.packageData || Number(state.packageData.project.id) !== Number(record.project.id)) return '<aside class="dg-panel dg-acceptance-inspector"><div class="dg-loading"><span></span><strong>正在关联同版本证据</strong></div></aside>';
    var data = state.packageData;
    var delivery = data.delivery;
    var effective = delivery.effective_status || delivery.status;
    var evidenceCurrent = Boolean(delivery.evidence && delivery.evidence.current);
    var canDecide = data.can_review && effective === "pending_acceptance";
    var canAccept = canDecide && evidenceCurrent && delivery.passed_count === 5 && delivery.quality_gate_status === "passed";
    var snapshot = data.snapshots[0] || {};
    var tabs = [["overview", "验收概览"], ["compare", "版本对照"], ["lineage", "证据链"], ["audit", "审计日志"]];
    var body = state.acceptanceTab === "compare" ? acceptanceComparison(data) : state.acceptanceTab === "lineage" ? acceptanceLineage(data) : state.acceptanceTab === "audit" ? acceptanceAudit(data) :
      '<div class="dg-acceptance-overview"><section><h3>不可变版本快照</h3><dl><div><dt>分支</dt><dd>' + esc(snapshot.quality_branch || delivery.quality_branch || "—") + '</dd></div><div><dt>Commit</dt><dd>' + shortSha(snapshot.quality_commit_sha || delivery.quality_commit_sha) + '</dd></div><div><dt>提交人</dt><dd>' + esc(snapshot.submitted_by_name || delivery.submitted_by || "—") + '</dd></div><div><dt>提交时间</dt><dd>' + formatTime(snapshot.submitted_at || delivery.submitted_at) + '</dd></div></dl></section><section><h3>五项自检与代码质量</h3>' + acceptanceCheckIcons(delivery) + '<dl><div><dt>质量门禁</dt><dd>' + esc(delivery.quality_gate_status === "passed" ? "通过" : delivery.quality_gate_status || "未通过") + '</dd></div><div><dt>质量分</dt><dd>' + (delivery.quality_score == null ? "—" : delivery.quality_score + " / 100") + '</dd></div><div><dt>扫描器</dt><dd>v' + esc(delivery.quality_scanner_version || "未知") + '</dd></div></dl></section><section><h3>运行与预警</h3><dl><div><dt>健康检查</dt><dd>' + Number(data.readiness.runtime.checks_healthy || 0) + ' / ' + Number(data.readiness.runtime.checks_total || 0) + '</dd></div><div><dt>阻断预警</dt><dd>' + data.readiness.blocking_alerts.length + ' 条</dd></div><div><dt>证据状态</dt><dd class="' + (evidenceCurrent ? "dg-text-success" : "dg-text-danger") + '">' + (evidenceCurrent ? "当前有效" : "已失效") + '</dd></div></dl></section></div>';
    return '<aside class="dg-panel dg-acceptance-inspector"><header><div><span class="dg-kicker">版本验收检查器</span><h2>' + esc(data.project.name) + '</h2><p>' + statusBadge(effective) + '<span>' + esc(delivery.quality_branch || "分支待确认") + ' · ' + shortSha(delivery.quality_commit_sha) + '</span></p></div><button type="button" class="dg-info" data-dg-action="open-project" aria-label="打开项目详情">' + icon("external-link") + '</button></header><nav class="dg-acceptance-tabs" aria-label="验收证据视图">' + tabs.map(function (tab) { return '<button type="button" class="' + (state.acceptanceTab === tab[0] ? "is-active" : "") + '" data-dg-acceptance-tab="' + tab[0] + '">' + tab[1] + '</button>'; }).join("") + '</nav><div class="dg-acceptance-inspector-body">' + body + '</div><footer><label><span>验收意见</span><textarea data-dg-review-note maxlength="500" placeholder="通过可填写上线注意事项；退回必须说明需要补齐的证据">' + esc(state.reviewNote) + '</textarea></label>' + (!evidenceCurrent ? '<div class="dg-inline-notice is-danger">' + icon("triangle-alert") + '<span>' + esc(delivery.evidence && delivery.evidence.message || "证据已经失效，请退回后重新提交。") + '</span></div>' : '') + '<div class="dg-decision-actions"><button type="button" class="dg-button is-danger" data-dg-action="review-reject"' + (!canDecide || state.saving ? " disabled" : "") + '>' + icon("undo-2") + '退回补充证据</button><button type="button" class="dg-button is-primary" data-dg-action="review-accept"' + (!canAccept || state.saving ? " disabled" : "") + '>' + icon("badge-check") + '验收通过</button></div><p>' + icon("shield-check") + '所有验收决定都会生成不可篡改的审计事件。</p></footer></aside>';
  }
  function renderAcceptanceWorkbench() {
    var allRecords = acceptanceAllRecords();
    var records = acceptanceRecords();
    var selected = records.find(function (record) { return Number(record.project.id) === Number(state.selectedId); }) || records[0] || null;
    if (selected && (Number(selected.project.id) !== Number(state.selectedId) || !state.packageData || Number(state.packageData.project.id) !== Number(selected.project.id))) {
      state.selectedId = Number(selected.project.id);
      window.setTimeout(function () { loadAcceptanceInspector(state.selectedId); }, 0);
    }
    return header("待验收", "从提交快照到验收结论，全链路可追溯") + acceptanceKpis(allRecords) + acceptanceFilters(records) + '<div class="dg-acceptance-layout">' + acceptanceTable(records) + acceptanceInspector(selected) + '</div>' + infoDialog();
  }
  function renderGovernance() {
    if (state.scope === "mine") return renderMineOverview();
    if (state.status === "pending_acceptance") return renderAcceptanceWorkbench();
    var records = filteredRecords();
    return header(state.scope === "mine" ? "我的交付记录" : state.status === "pending_acceptance" ? "待验收队列" : "交付治理中心", "从项目版本、自检、代码质检到管理员验收和上线门禁，形成可追溯的交付闭环") + workflow("governance") + kpis() + filterBar(records) + '<div class="dg-governance-grid">' + governanceTable(records) + priorityQueue(records) + '</div>' + infoDialog();
  }

  function packageHero(data, activeView) {
    var delivery = data.delivery;
    var snapshot = data.snapshots[0];
    return '<div class="dg-subpage-head"><button type="button" class="dg-back" data-dg-view="governance">' + icon("arrow-left") + '返回治理台账</button><div><span class="dg-kicker">项目交付包</span><h1>' + esc(data.project.name) + '</h1><p>' + esc(data.project.gitlab_project_id || "未关联 GitLab") + ' · ' + esc(data.project.owner_name || "负责人待确认") + '</p></div><div>' + statusBadge(delivery.effective_status || delivery.status) + (snapshot ? '<span class="dg-version">第 ' + snapshot.sequence_no + ' 次提交</span>' : '') + '</div></div>' + workflow(activeView);
  }
  function evidenceCards(data) {
    var delivery = data.delivery;
    var readiness = data.readiness;
    var quality = readiness.quality || {};
    var runtime = readiness.runtime || {};
    var cards = [
      ["git-commit-horizontal", "GitLab 提交版本", shortSha(quality.commit_sha || delivery.quality_commit_sha), (quality.branch || delivery.quality_branch || "分支待确认")],
      ["shield-check", "代码质检", quality.gate_status === "passed" ? "门禁通过" : (quality.status || "尚未通过"), quality.score == null ? "暂无质量分" : "质量分 " + quality.score],
      ["activity", "运行监控", runtime.ready ? "健康" : (runtime.message || "尚未接入"), (runtime.checks_healthy || 0) + " / " + (runtime.checks_total || 0) + " 检查点"],
      ["triangle-alert", "阻断预警", readiness.blocking_alerts.length ? readiness.blocking_alerts.length + " 条未关闭" : "无严重阻断", "按项目 ID 实时关联"],
    ];
    return '<div class="dg-evidence-cards">' + cards.map(function (card, index) {
      var passed = index === 0 ? Boolean(quality.commit_sha || delivery.quality_commit_sha) : index === 1 ? quality.gate_status === "passed" : index === 2 ? Boolean(runtime.ready) : !readiness.blocking_alerts.length;
      return '<article class="' + (passed ? "is-pass" : "is-block") + '"><span>' + icon(card[0]) + '</span><div><small>' + card[1] + '</small><strong>' + esc(card[2]) + '</strong><p>' + esc(card[3]) + '</p></div></article>';
    }).join("") + '</div>';
  }
  function checkGrid(data, editable) {
    var checks = editable ? state.submitChecks : data.delivery.checks;
    return '<section class="dg-panel dg-checks"><div class="dg-panel-head"><div><span class="dg-kicker">版本自检</span><h2>五项交付检查</h2><p>所有项目使用同一套检查口径，提交后与当前版本一起固化。</p></div>' + helpButton("selfcheck") + '</div><div class="dg-check-grid">' + Object.keys(checkLabels).map(function (key, index) {
      var checked = Boolean(checks[key]);
      return '<label class="' + (checked ? "is-checked" : "") + '"><input type="checkbox" data-dg-check="' + key + '"' + (checked ? " checked" : "") + (editable ? "" : " disabled") + '><span>' + icon(checked ? "check-circle-2" : "circle") + '</span><div><b>0' + (index + 1) + '</b><strong>' + checkLabels[key] + '</strong><small>' + (["页面结构、字体、颜色和间距符合规范", "主流程、异常态与权限提示可操作", "加载、空态、错误和成功状态完整", "关键页面响应与交互达到基线", "常用桌面尺寸与浏览器可用"][index]) + '</small></div></label>';
    }).join("") + '</div>' + (editable ? '<label class="dg-notes"><span>自检说明</span><textarea data-dg-submit-notes maxlength="1000" placeholder="补充本次交付范围、已验证环境和注意事项">' + esc(state.submitNotes) + '</textarea></label><button type="button" class="dg-button is-primary dg-submit" data-dg-action="submit"' + (state.saving ? " disabled" : "") + '>' + icon("send") + (state.saving ? "正在提交" : "提交待验收") + '</button>' : '') + '</section>';
  }
  function readinessPanel(data) {
    return '<section class="dg-panel dg-readiness"><div class="dg-panel-head"><div><span class="dg-kicker">上线门禁</span><h2>' + (data.readiness.ready ? "已具备上线条件" : "仍有阻断条件") + '</h2><p>' + esc(data.readiness.message) + '</p></div>' + helpButton("readiness") + '</div><div class="dg-requirements">' + data.readiness.requirements.map(function (item, index) {
      return '<article class="' + (item.passed ? "is-pass" : "is-block") + '"><span>' + (index + 1) + '</span><div><strong>' + esc(item.label) + '</strong><p>' + esc(item.message) + '</p></div>' + icon(item.passed ? "check" : "x") + '</article>';
    }).join("") + '</div></section>';
  }
  function auditTimeline(data, limit) {
    var events = data.events.slice(0, limit || data.events.length);
    return '<section class="dg-panel dg-timeline"><div class="dg-panel-head"><div><span class="dg-kicker">审计轨迹</span><h2>交付生命周期事件</h2><p>提交、验收和上线均为追加事件。</p></div>' + helpButton("audit") + '</div><ol>' + (events.length ? events.map(function (event) {
      return '<li><span>' + icon(event.event_type === "online_marked" ? "rocket" : event.event_type === "accepted" ? "badge-check" : event.event_type === "rejected" ? "undo-2" : "package-check") + '</span><div><strong>' + esc(eventLabels[event.event_type] || event.event_type) + '</strong><p>' + esc(event.note || "已写入交付审计") + '</p><small>' + esc(event.actor_name || "系统") + ' · ' + formatTime(event.created_at) + '</small></div></li>';
    }).join("") : '<li class="is-empty"><span>' + icon("history") + '</span><div><strong>尚无审计事件</strong><p>首次提交交付自检后生成不可覆盖的版本快照。</p></div></li>') + '</ol></section>';
  }
  function renderPackage() {
    var data = state.packageData;
    if (!data) return loadingView("正在读取版本交付包");
    var effective = data.delivery.effective_status || data.delivery.status;
    var editable = data.can_submit && ["not_submitted", "rejected", "stale"].includes(effective);
    return packageHero(data, "package") + evidenceCards(data) + '<div class="dg-package-grid">' + checkGrid(data, editable) + readinessPanel(data) + '</div><div class="dg-package-grid is-bottom">' + auditTimeline(data, 5) + '<section class="dg-panel dg-actions-panel"><span class="dg-kicker">下一步</span><h2>按当前状态继续流转</h2><p>' + esc(effective === "pending_acceptance" ? "版本交付包已锁定，等待管理员给出验收结论。" : effective === "accepted" ? "验收有效；请补齐剩余上线门禁并保留发布证据。" : "完成最新提交的全部证据后重新提交。") + '</p><div>' +
      (effective === "pending_acceptance" && data.can_review ? '<button type="button" class="dg-button is-primary" data-dg-view="review">' + icon("clipboard-check") + '进入管理员验收</button>' : '') +
      '<button type="button" class="dg-button is-secondary" data-dg-view="audit">' + icon("git-merge") + '查看审计与门禁</button>' +
      '<button type="button" class="dg-button is-secondary" data-dg-action="open-project">' + icon("folder-open") + '项目详情</button></div></section></div>' + infoDialog();
  }
  function renderReview() {
    var data = state.packageData;
    if (!data) return loadingView("正在准备验收工作台");
    var delivery = data.delivery;
    var effective = delivery.effective_status || delivery.status;
    var canDecide = data.can_review && effective === "pending_acceptance";
    return packageHero(data, "review") + '<div class="dg-review-grid"><div class="dg-review-main"><section class="dg-panel dg-review-summary"><div class="dg-panel-head"><div><span class="dg-kicker">管理员验收</span><h2>同版本证据核验</h2><p>验收结论只针对下方提交 SHA 与交付快照生效。</p></div>' + statusBadge(effective) + '</div>' + evidenceCards(data) + '</section>' + checkGrid(data, false) + readinessPanel(data) + '</div><aside class="dg-panel dg-decision"><span class="dg-kicker">验收决策</span><h2>给出明确结论</h2><p>通过前确认代码质检和交付证据仍然有效；退回时必须填写原因。</p><div class="dg-version-card"><span>' + icon("git-commit") + '</span><div><small>本次验收提交</small><strong>' + shortSha(delivery.quality_commit_sha) + '</strong><p>' + esc(delivery.quality_branch || "分支待确认") + '</p></div></div><label><span>验收意见</span><textarea data-dg-review-note maxlength="500" placeholder="填写验收结论、退回原因或上线注意事项">' + esc(state.reviewNote) + '</textarea></label><div class="dg-decision-actions"><button type="button" class="dg-button is-danger" data-dg-action="review-reject"' + (!canDecide || state.saving ? " disabled" : "") + '>' + icon("undo-2") + '退回修改</button><button type="button" class="dg-button is-primary" data-dg-action="review-accept"' + (!canDecide || state.saving ? " disabled" : "") + '>' + icon("badge-check") + '验收通过</button></div>' + (!canDecide ? '<div class="dg-inline-notice">' + icon("info") + '<span>当前记录不是待验收状态，不能重复给出结论。</span></div>' : '') + '</aside></div>' + infoDialog();
  }
  function auditChain(data) {
    var snapshot = data.snapshots[0];
    var release = data.online_releases[0];
    var delivery = data.delivery;
    var quality = data.readiness.quality || {};
    var nodes = [
      ["项目版本", data.project.name, (data.project.gitlab_project_id || "未关联 GitLab"), "folder-kanban", true],
      ["代码证据", shortSha(quality.commit_sha || delivery.quality_commit_sha), (quality.branch || delivery.quality_branch || "分支待确认"), "git-commit-horizontal", Boolean(quality.commit_sha || delivery.quality_commit_sha)],
      ["质量门禁", quality.gate_status === "passed" ? "质检通过" : (quality.status || "未通过"), quality.score == null ? "暂无质量分" : "质量分 " + quality.score, "shield-check", quality.gate_status === "passed"],
      ["交付快照", snapshot ? "第 " + snapshot.sequence_no + " 次提交" : "尚未提交", snapshot ? formatTime(snapshot.submitted_at) : "等待负责人提交", "package-check", Boolean(snapshot)],
      ["管理员结论", status(delivery.effective_status || delivery.status).label, delivery.reviewed_by || "等待管理员", "clipboard-check", delivery.status === "accepted" && delivery.evidence && delivery.evidence.current],
      ["上线与留证", release ? "已标记上线" : data.readiness.ready ? "门禁已通过" : "仍有阻断", release ? formatTime(release.online_at) : data.readiness.requirements.filter(function (item) { return !item.passed; }).length + " 项待补齐", "rocket", Boolean(release)],
    ];
    var selectedIndex = Math.min(Math.max(Number(state.auditNode) || 0, 0), nodes.length - 1);
    var selected = nodes[selectedIndex];
    return '<section class="dg-panel dg-chain"><div class="dg-panel-head"><div><span class="dg-kicker">版本证据链</span><h2>从项目到上线的关联路径</h2><p>点击节点查看关联数据；所有节点来自同一项目和提交版本。</p></div>' + helpButton("audit") + '</div><div class="dg-chain-track" role="list">' + nodes.map(function (node, index) {
      return '<button type="button" role="listitem" class="dg-chain-node ' + (node[4] ? "is-pass" : "is-block") + (selectedIndex === index ? " is-selected" : "") + '" data-dg-action="audit-node" data-node-index="' + index + '" aria-pressed="' + (selectedIndex === index ? "true" : "false") + '" title="' + esc(node[0] + '：' + node[1] + '，' + node[2]) + '"><span>' + icon(node[3]) + '</span><small>' + node[0] + '</small><strong>' + esc(node[1]) + '</strong><p>' + esc(node[2]) + '</p></button>' + (index < nodes.length - 1 ? '<i class="dg-chain-link ' + (node[4] ? "is-pass" : "is-block") + '" aria-hidden="true"></i>' : '');
    }).join("") + '</div><div class="dg-chain-detail" aria-live="polite"><span>' + icon(selected[3]) + '</span><div><small>当前节点 · ' + esc(selected[0]) + '</small><strong>' + esc(selected[1]) + '</strong><p>' + esc(selected[2]) + '</p></div><b class="' + (selected[4] ? "is-pass" : "is-block") + '">' + (selected[4] ? "证据有效" : "待补齐") + '</b></div></section>';
  }
  function renderAudit() {
    var data = state.packageData;
    if (!data) return loadingView("正在读取审计证据链");
    return packageHero(data, "audit") + auditChain(data) + '<div class="dg-audit-grid">' + auditTimeline(data) + readinessPanel(data) + '</div><section class="dg-panel dg-snapshots"><div class="dg-panel-head"><div><span class="dg-kicker">不可覆盖快照</span><h2>历次交付版本</h2><p>重新提交只新增版本，不会覆盖之前的提交与验收证据。</p></div><span class="dg-result">共 ' + data.snapshots.length + ' 个快照</span></div><div class="dg-snapshot-list">' + (data.snapshots.length ? data.snapshots.map(function (snapshot) {
      return '<article><span>V' + snapshot.sequence_no + '</span><div><strong>' + shortSha(snapshot.quality_commit_sha) + '</strong><p>' + esc(snapshot.quality_branch || "分支待确认") + ' · ' + esc(snapshot.submitted_by_name || "提交人待确认") + '</p></div><b>' + Object.values(snapshot.checks || {}).filter(Boolean).length + ' / 5</b><small>' + formatTime(snapshot.submitted_at) + '</small></article>';
    }).join("") : '<div class="dg-empty">' + icon("archive-x") + '<strong>尚无版本快照</strong><span>提交交付自检后自动生成。</span></div>') + '</div></section>' + infoDialog();
  }
  function mineSubHeader(data, title, subtitle) {
    return '<header class="dg-mine-subhead"><button type="button" class="dg-back" data-dg-view="governance">' + icon("arrow-left") + '返回我的自检</button><div><span class="dg-kicker">' + esc(data.project.name) + '</span><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div><div><button type="button" class="dg-button is-secondary" data-dg-action="mine-open-graph">' + icon("git-branch") + '证据关系图</button><button type="button" class="dg-button is-primary" data-dg-action="refresh">' + icon("refresh-cw") + '刷新证据</button></div></header>';
  }
  function compareSnapshotCard(snapshot, title, tone) {
    if (!snapshot) return '<article class="dg-mine-version-card is-empty"><small>' + esc(title) + '</small><strong>暂无已验收基线</strong><p>首次交付将以当前版本创建基线。</p></article>';
    return '<article class="dg-mine-version-card is-' + tone + '"><small>' + esc(title) + '</small><strong>第 ' + snapshot.sequence_no + ' 次提交 · ' + shortSha(snapshot.quality_commit_sha) + '</strong><p>' + esc(snapshot.quality_branch || "分支待确认") + ' · ' + formatTime(snapshot.submitted_at) + '</p><span>' + (snapshot.quality_score == null ? "暂无质量分" : "质量分 " + snapshot.quality_score) + '</span></article>';
  }
  function mineVersionComparison(data) {
    var comparison = data.comparison || {};
    var current = comparison.current_snapshot;
    var baseline = comparison.baseline_snapshot;
    var effective = data.delivery.effective_status || data.delivery.status;
    var changed = comparison.changed_checks || [];
    return '<section class="dg-panel dg-mine-compare"><div class="dg-panel-head"><div><span class="dg-kicker">版本差异复核</span><h2>当前版本与最近验收快照 ' + helpButton("version_compare") + '</h2><p>只比较已固化证据；尚未接入的 GitLab 维度不会伪造结果。</p></div>' + statusBadge(effective) + '</div><div class="dg-mine-version-strip">' + compareSnapshotCard(baseline, "最近一次已验收快照", "baseline") + '<div class="dg-mine-version-change">' + icon(comparison.commit_changed ? "triangle-alert" : "equal") + '<strong>' + (comparison.commit_changed ? "检测到 Commit 变化" : "提交版本未变化") + '</strong><span>' + (comparison.quality_score_delta == null ? "质量分暂无可比基线" : "质量分变化 " + (comparison.quality_score_delta > 0 ? "+" : "") + comparison.quality_score_delta) + '</span></div>' + compareSnapshotCard(current || { sequence_no: "当前", quality_commit_sha: comparison.current_commit_sha, quality_branch: data.delivery.quality_branch, submitted_at: data.delivery.updated_at, quality_score: data.delivery.quality_score }, "当前待处理版本", "current") + '</div><div class="dg-mine-compare-table"><div class="dg-mine-compare-head"><span>检查维度</span><span>已验收基线</span><span>当前版本</span><span>影响结论</span></div>' + Object.keys(checkLabels).map(function (key) {
      var before = Boolean(baseline && baseline.checks && baseline.checks[key]);
      var now = Boolean((current && current.checks || data.delivery.checks || {})[key]);
      var isChanged = changed.includes(key);
      return '<div><strong>' + checkLabels[key] + '</strong><span class="' + (before ? "is-pass" : "is-pending") + '">' + icon(before ? "check" : "circle-dashed") + (baseline ? (before ? "已验证" : "未通过") : "无基线") + '</span><span class="' + (now ? "is-pass" : "is-pending") + '">' + icon(now ? "check" : "clock-3") + (now ? "已确认" : "需确认") + '</span><b class="' + (isChanged || !now ? "is-warning" : "is-stable") + '">' + (isChanged ? "状态变化" : now ? "证据稳定" : "需要复核") + '</b></div>';
    }).join("") + '</div><div class="dg-mine-integration-gap">' + icon("info") + '<div><strong>GitLab 深度影响分析待接入</strong><p>' + esc((comparison.unavailable_gitlab_dimensions || []).join("、")) + ' 当前没有可靠数据，因此不会参与本次自动结论。</p></div></div></section>';
  }
  function mineRecheckPanel(data) {
    var comparison = data.comparison || {};
    var requiredKeys = new Set(comparison.changed_checks || []);
    Object.keys(data.delivery.checks || {}).forEach(function (key) { if (!data.delivery.checks[key]) requiredKeys.add(key); });
    var effective = data.delivery.effective_status || data.delivery.status;
    var editable = data.can_submit && ["not_submitted", "rejected", "stale"].includes(effective);
    return '<aside class="dg-panel dg-mine-recheck"><span class="dg-kicker">本次处置</span><h2>' + (editable ? "完成版本自检" : effective === "pending_acceptance" ? "等待管理员验收" : "查看已固化证据") + '</h2><p>' + (requiredKeys.size ? '当前有 ' + requiredKeys.size + ' 个维度需要确认。' : '当前五项自检均已完成。') + '</p><div class="dg-mine-recheck-list">' + Object.keys(checkLabels).map(function (key, index) {
      var checked = Boolean(state.submitChecks[key]);
      return '<label class="' + (checked ? "is-pass" : "is-pending") + '"><input type="checkbox" data-dg-check="' + key + '"' + (checked ? " checked" : "") + (editable ? "" : " disabled") + '><span>' + (index + 1) + '</span><div><strong>' + checkLabels[key] + '</strong><small>' + (requiredKeys.has(key) ? "本次版本需重新确认" : "证据状态稳定") + '</small></div>' + icon(checked ? "check-circle-2" : "clock-3") + '</label>';
    }).join("") + '</div>' + (editable ? '<label class="dg-notes"><span>本次提交说明</span><textarea data-dg-submit-notes maxlength="1000" placeholder="说明本次版本范围、验证环境和注意事项">' + esc(state.submitNotes) + '</textarea></label><button type="button" class="dg-button is-primary" data-dg-action="submit"' + (state.saving ? " disabled" : "") + '>' + icon("send") + (state.saving ? "正在提交" : "提交交付包") + '</button>' : '<button type="button" class="dg-button is-secondary" data-dg-action="mine-open-graph">' + icon("git-branch") + '查看完整证据链</button>') + '</aside>';
  }
  function mineSnapshotHistory(data) {
    return '<section class="dg-panel dg-mine-history"><div class="dg-panel-head"><div><span class="dg-kicker">版本与快照记录</span><h2>不可覆盖的交付历史</h2><p>每次提交按 Commit 固化，自检、质检和验收状态均可追溯。</p></div><span class="dg-result">共 ' + data.snapshots.length + ' 个快照</span></div><div class="dg-table-wrap"><table><thead><tr><th>快照</th><th>分支 / Commit</th><th>提交人 / 时间</th><th>代码质检</th><th>五项自检</th><th>验收证据</th><th>操作</th></tr></thead><tbody>' + (data.snapshots.length ? data.snapshots.map(function (snapshot) {
      var acceptedEvent = data.events.find(function (event) { return event.event_type === "accepted" && Number(event.submission_snapshot_id) === Number(snapshot.id); });
      return '<tr><td><span class="dg-version">V' + snapshot.sequence_no + '</span></td><td><strong>' + esc(snapshot.quality_branch || "—") + '</strong><small>' + shortSha(snapshot.quality_commit_sha) + '</small></td><td><strong>' + esc(snapshot.submitted_by_name || "—") + '</strong><small>' + formatTime(snapshot.submitted_at) + '</small></td><td><span class="dg-badge is-' + (snapshot.quality_gate_status === "passed" ? "success" : "danger") + '">' + (snapshot.quality_score == null ? "—" : snapshot.quality_score + " 分") + '</span></td><td><b>' + Object.values(snapshot.checks || {}).filter(Boolean).length + ' / 5</b></td><td>' + (acceptedEvent ? '<span class="dg-badge is-success">已验收</span><small>' + esc(acceptedEvent.actor_name || "管理员") + '</small>' : '<span class="dg-badge is-muted">未验收</span>') + '</td><td><button type="button" class="dg-link" data-dg-action="mine-open-graph">查看证据</button></td></tr>';
    }).join("") : '<tr><td colspan="7"><div class="dg-empty"><strong>尚无交付快照</strong><span>完成五项自检并提交后自动生成。</span></div></td></tr>') + '</tbody></table></div></section>';
  }
  function renderMineCompare() {
    var data = state.packageData;
    if (!data) return loadingView("正在关联当前版本与最近验收快照");
    return mineSubHeader(data, "我的自检", "版本差异驱动自检：发现变化、聚焦影响、完成必要复核") + '<div class="dg-mine-compare-layout">' + mineVersionComparison(data) + mineRecheckPanel(data) + '</div>' + mineSnapshotHistory(data) + infoDialog();
  }
  function graphNodeMeta(node) {
    var tone = node.status === "pass" ? "success" : node.status === "block" ? "danger" : node.status === "current" ? "blue" : "warning";
    var label = node.status === "pass" ? "证据有效" : node.status === "block" ? "阻断 / 失效" : node.status === "current" ? "当前版本" : "待补齐";
    return { tone: tone, label: label };
  }
  function mineGraphInspector(data) {
    var nodes = data.evidence_graph && data.evidence_graph.nodes || [];
    var selected = nodes.find(function (node) { return node.id === state.graphNode; }) || nodes[0];
    if (!selected) return '<aside class="dg-panel dg-mine-graph-inspector"><div class="dg-empty"><strong>暂无证据节点</strong></div></aside>';
    var meta = graphNodeMeta(selected);
    var downstream = (data.evidence_graph.edges || []).filter(function (edge) { return edge.source === selected.id; }).map(function (edge) { return nodes.find(function (node) { return node.id === edge.target; }); }).filter(Boolean);
    return '<aside class="dg-panel dg-mine-graph-inspector"><header><span class="dg-kicker">节点详情</span><h2>' + esc(selected.label) + '</h2>' + '<span class="dg-badge is-' + meta.tone + '">' + esc(meta.label) + '</span></header><dl><div><dt>当前值</dt><dd>' + esc(selected.value) + '</dd></div><div><dt>证据来源</dt><dd>' + esc(selected.source) + '</dd></div><div><dt>业务说明</dt><dd>' + esc(selected.detail) + '</dd></div><div><dt>采集时间</dt><dd>' + formatTime(data.evidence_graph.generated_at) + '</dd></div></dl><section><h3>影响下游节点</h3>' + (downstream.length ? '<ol>' + downstream.map(function (node) { return '<li><span>' + icon("arrow-right") + '</span><div><strong>' + esc(node.label) + '</strong><small>' + esc(node.value) + '</small></div></li>'; }).join("") + '</ol>' : '<p>当前节点没有后续门禁依赖。</p>') + '</section><button type="button" class="dg-button is-primary" data-dg-view="mine-compare">返回版本复核</button></aside>';
  }
  function mineGraphTable(data) {
    var nodes = data.evidence_graph && data.evidence_graph.nodes || [];
    return '<section class="dg-panel dg-mine-graph-table"><div class="dg-panel-head"><div><span class="dg-kicker">与当前版本相关</span><h2>证据明细台账</h2><p>点击任一证据对象，与上方关系图和右侧节点详情联动。</p></div><span class="dg-result">共 ' + nodes.length + ' 个节点</span></div><div class="dg-table-wrap"><table><thead><tr><th>证据来源</th><th>证据对象</th><th>版本 / 状态</th><th>结论</th><th>业务说明</th><th>操作</th></tr></thead><tbody>' + nodes.map(function (node) {
      var meta = graphNodeMeta(node);
      return '<tr class="' + (node.id === state.graphNode ? "is-selected" : "") + '" tabindex="0" data-dg-graph-node="' + esc(node.id) + '"><td><strong>' + esc(node.source) + '</strong></td><td><strong>' + esc(node.label) + '</strong></td><td><small>' + esc(node.value) + '</small></td><td><span class="dg-badge is-' + meta.tone + '">' + esc(meta.label) + '</span></td><td><small>' + esc(node.detail) + '</small></td><td><button type="button" class="dg-link" data-dg-action="graph-node" data-node-id="' + esc(node.id) + '">查看详情</button></td></tr>';
    }).join("") + '</tbody></table></div></section>';
  }
  function renderMineGraph() {
    var data = state.packageData;
    if (!data) return loadingView("正在构建交付证据关系图");
    return mineSubHeader(data, "交付证据关系图", "查看当前版本的证据关系与上线阻断") + '<div class="dg-mine-graph-layout"><section class="dg-panel dg-mine-graph-panel"><div class="dg-panel-head"><div><span class="dg-kicker">同一项目 · 同一版本</span><h2>交付证据关系图 ' + helpButton("evidence_graph") + '</h2><p>滚轮缩放，拖动画布或节点；点击图例筛选，点击节点联动详情。</p></div><span class="dg-result">' + shortSha((data.comparison || {}).current_commit_sha) + '</span></div><div class="dg-mine-graph-chart" role="img" aria-label="当前项目交付证据关系图"></div><footer>' + icon("info") + '<span>所有节点均由后端按项目 ID、交付快照和当前 Commit 聚合，未接入数据会明确标记为待补齐。</span></footer></section>' + mineGraphInspector(data) + '</div>' + mineGraphTable(data) + infoDialog();
  }
  function disposeMineGraph() {
    if (state.graphChart) state.graphChart.dispose();
    if (state.graphResizeObserver) state.graphResizeObserver.disconnect();
    state.graphChart = null;
    state.graphResizeObserver = null;
  }
  function selectMineGraphNode(nodeId) {
    if (!state.packageData || !state.packageData.evidence_graph) return;
    var nodes = state.packageData.evidence_graph.nodes || [];
    var index = nodes.findIndex(function (node) { return node.id === nodeId; });
    if (index < 0) return;
    state.graphNode = nodeId;
    var inspector = document.querySelector("#" + PAGE_ID + " .dg-mine-graph-inspector");
    if (inspector) inspector.outerHTML = mineGraphInspector(state.packageData);
    document.querySelectorAll("#" + PAGE_ID + " [data-dg-graph-node]").forEach(function (row) {
      row.classList.toggle("is-selected", row.dataset.dgGraphNode === nodeId);
    });
    if (state.graphChart) {
      state.graphChart.dispatchAction({ type: "unselect", seriesIndex: 0 });
      state.graphChart.dispatchAction({ type: "select", seriesIndex: 0, dataIndex: index });
    }
    hydrateIcons();
  }
  function mountMineGraph() {
    if (state.view !== "mine-graph" || !state.packageData) { disposeMineGraph(); return; }
    var runtime = window.ProjectOperationsECharts;
    var chartNode = document.querySelector("#" + PAGE_ID + " .dg-mine-graph-chart");
    if (!runtime || !chartNode) return;
    disposeMineGraph();
    var graph = state.packageData.evidence_graph || { nodes: [], edges: [] };
    // Keep the initial evidence chain readable inside the management console's
    // constrained content column. ECharts scales node coordinates but not each
    // node's pixel size, so wider coordinates made vertically adjacent nodes
    // overlap at common laptop widths.
    var positions = {
      project: [70, 245], commit: [235, 55], quality: [235, 170], runtime: [235, 285], alerts: [235, 400],
      selfcheck: [420, 120], snapshot: [420, 320], acceptance: [580, 220], readiness: [735, 155], production: [735, 340],
    };
    var categories = [{ name: "当前版本" }, { name: "证据有效" }, { name: "待补齐" }, { name: "阻断 / 失效" }];
    var categoryIndex = { current: 0, pass: 1, pending: 2, block: 3 };
    var colors = ["#2563eb", "#159b68", "#dd8c1b", "#df4655"];
    var nodes = graph.nodes.map(function (node) {
      var pos = positions[node.id] || [500, 220];
      return Object.assign({}, node, { name: node.label, x: pos[0], y: pos[1], category: categoryIndex[node.status] == null ? 2 : categoryIndex[node.status], symbol: "roundRect", symbolSize: [148, 60], draggable: true, itemStyle: { color: "#ffffff", borderColor: colors[categoryIndex[node.status] == null ? 2 : categoryIndex[node.status]], borderWidth: node.id === state.graphNode ? 3 : 1.5, shadowBlur: node.id === state.graphNode ? 12 : 4, shadowColor: "rgba(28,58,105,.12)" } });
    });
    state.graphChart = runtime.init(chartNode, null, { renderer: "canvas" });
    state.graphChart.setOption({
      animationDuration: 420,
      aria: { enabled: true, description: "当前项目从 GitLab 提交、代码质检、自检快照、管理员验收到上线门禁的真实证据关系图。" },
      color: colors,
      legend: { top: 8, left: 14, selectedMode: true, data: categories.map(function (item) { return item.name; }), textStyle: { color: "#566780", fontSize: 11 } },
      tooltip: { trigger: "item", confine: true, formatter: function (params) { var item = params.data || {}; return '<b>' + esc(item.label || item.name) + '</b><br>当前值：' + esc(item.value || "—") + '<br>来源：' + esc(item.source || "—") + '<br>' + esc(item.detail || ""); } },
      toolbox: { top: 2, right: 8, feature: { restore: {}, saveAsImage: { name: "交付证据关系图" } }, iconStyle: { borderColor: "#7b8ba3" } },
      series: [{ type: "graph", layout: "none", roam: true, draggable: true, selectedMode: "single", select: { itemStyle: { borderWidth: 3, shadowBlur: 14, shadowColor: "rgba(37,99,235,.24)" } }, data: nodes, links: graph.edges, categories: categories, edgeSymbol: ["none", "arrow"], edgeSymbolSize: 7, lineStyle: { color: "#9fb0c6", width: 1.4, curveness: .08 }, emphasis: { focus: "adjacency", lineStyle: { width: 2.5, color: "#2563eb" } }, label: { show: true, color: "#20304a", fontSize: 11, lineHeight: 17, formatter: function (params) { return '{title|' + params.data.label + '}\n{value|' + params.data.value + '}'; }, rich: { title: { color: "#24344e", fontSize: 11, fontWeight: 700, lineHeight: 18 }, value: { color: "#718198", fontSize: 10, lineHeight: 16 } } } }],
    });
    state.graphChart.on("click", function (params) { if (params.dataType === "node" && params.data && params.data.id) selectMineGraphNode(params.data.id); });
    selectMineGraphNode(state.graphNode || "project");
    state.graphResizeObserver = new ResizeObserver(function () { state.graphChart && state.graphChart.resize(); });
    state.graphResizeObserver.observe(chartNode);
  }
  function loadingView(message) { return '<div class="dg-loading"><span></span><strong>' + esc(message) + '</strong></div>'; }
  function errorView(message) { return '<div class="dg-error">' + icon("triangle-alert") + '<h2>交付数据加载失败</h2><p>' + esc(message) + '</p><button type="button" class="dg-button is-primary" data-dg-action="refresh">重新加载</button></div>'; }
  function render() {
    var page = pageElement();
    if (!page || !state.active) return;
    if (state.loading && !state.payload) page.innerHTML = loadingView("正在关联项目、质检、验收和上线门禁");
    else if (state.error) page.innerHTML = errorView(state.error);
    else if (state.view === "mine-compare") page.innerHTML = renderMineCompare();
    else if (state.view === "mine-graph") page.innerHTML = renderMineGraph();
    else if (state.view === "package") page.innerHTML = renderPackage();
    else if (state.view === "review") page.innerHTML = renderReview();
    else if (state.view === "audit") page.innerHTML = renderAudit();
    else page.innerHTML = renderGovernance();
    hydrateIcons();
    window.requestAnimationFrame(mountMineGraph);
  }

  function loadGovernance(force) {
    if (state.loading && !force) return;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    state.loading = true;
    state.error = "";
    render();
    fetchJson("/api/delivery/governance?scope=" + encodeURIComponent(state.scope), { signal: state.controller.signal }).then(function (payload) {
      state.payload = payload;
      state.error = "";
    }).catch(function (error) {
      if (error.name !== "AbortError") state.error = error.message || "无法读取交付治理数据";
    }).finally(function () { state.loading = false; state.controller = null; render(); });
  }
  function loadPackage(projectId, view) {
    state.selectedId = Number(projectId);
    state.view = view || "package";
    state.packageData = null;
    state.auditNode = 0;
    state.graphNode = "project";
    state.loading = true;
    state.error = "";
    render();
    fetchJson("/api/projects/" + state.selectedId + "/delivery-package").then(function (payload) {
      state.packageData = payload;
      state.submitChecks = Object.assign({}, payload.delivery.checks || {});
      state.submitNotes = payload.delivery.notes || "";
      state.reviewNote = payload.delivery.review_note || "";
    }).catch(function (error) { state.error = error.message || "无法读取版本交付包"; }).finally(function () { state.loading = false; render(); });
  }
  function loadAcceptanceInspector(projectId) {
    var targetId = Number(projectId);
    if (!targetId) return;
    state.selectedId = targetId;
    state.packageData = null;
    state.acceptanceLoading = true;
    state.error = "";
    render();
    fetchJson("/api/projects/" + targetId + "/delivery-package").then(function (payload) {
      if (Number(state.selectedId) !== targetId || state.status !== "pending_acceptance") return;
      state.packageData = payload;
      state.reviewNote = payload.delivery.review_note || "";
    }).catch(function (error) {
      if (Number(state.selectedId) === targetId) toast(error.message || "无法读取验收证据", "error");
    }).finally(function () {
      if (Number(state.selectedId) === targetId) {
        state.acceptanceLoading = false;
        render();
      }
    });
  }
  function submitPackage() {
    var values = Object.values(state.submitChecks);
    if (values.length < 5 || values.some(function (value) { return !value; })) { toast("请先完成全部五项自检", "error"); return; }
    state.saving = true; render();
    fetchJson("/api/projects/" + state.selectedId + "/delivery-check", { method: "POST", body: JSON.stringify(Object.assign({}, state.submitChecks, { notes: state.submitNotes })) }).then(function () {
      toast("交付包已提交并生成不可覆盖快照", "success");
      return Promise.all([loadGovernance(true), loadPackage(state.selectedId, state.scope === "mine" ? "mine-compare" : "package")]);
    }).catch(function (error) { toast(error.message || "提交失败", "error"); }).finally(function () { state.saving = false; });
  }
  function reviewPackage(decision) {
    if (decision === "rejected" && compact(state.reviewNote).length < 2) { toast("退回修改时请填写明确原因", "error"); return; }
    state.saving = true; render();
    fetchJson("/api/projects/" + state.selectedId + "/delivery-check/review", { method: "POST", body: JSON.stringify({ status: decision, note: state.reviewNote }) }).then(function () {
      toast(decision === "accepted" ? "验收结论已写入审计链" : "已退回并保留原因", "success");
      if (state.status === "pending_acceptance") {
        state.packageData = null;
        state.acceptanceTab = "overview";
        state.reviewNote = "";
        return loadGovernance(true);
      }
      return Promise.all([loadGovernance(true), loadPackage(state.selectedId, decision === "accepted" ? "audit" : "package")]);
    }).catch(function (error) { toast(error.message || "验收操作失败", "error"); }).finally(function () { state.saving = false; });
  }
  function openProject() {
    if (typeof window.__legacyOpenProject === "function") {
      deactivate();
      Promise.resolve(window.__legacyOpenProject(state.selectedId)).catch(function () { toast("项目详情暂时不可用", "error"); });
    } else toast("项目详情入口暂时不可用", "error");
  }
  function switchView(view) {
    if (view === "governance") { state.view = "governance"; state.packageData = null; render(); return; }
    if (!state.selectedId) return;
    if (state.packageData) { state.view = view; render(); }
    else loadPackage(state.selectedId, view);
  }

  document.addEventListener("click", function (event) {
    if (!state.active) return;
    var page = event.target.closest && event.target.closest("#" + PAGE_ID);
    if (!page) return;
    var row = event.target.closest("tr[data-dg-project]");
    var mineRow = event.target.closest("tr[data-dg-mine-project]");
    var acceptanceRow = event.target.closest("tr[data-dg-acceptance-project]");
    var graphRow = event.target.closest("tr[data-dg-graph-node]");
    var button = event.target.closest("button");
    if (!button && graphRow) { selectMineGraphNode(graphRow.dataset.dgGraphNode); return; }
    if (!button && acceptanceRow) { state.acceptanceTab = "overview"; loadAcceptanceInspector(acceptanceRow.dataset.dgAcceptanceProject); return; }
    if (!button && mineRow) { state.selectedId = Number(mineRow.dataset.dgMineProject); render(); return; }
    if (!button && row) { loadPackage(row.dataset.dgProject, "package"); return; }
    if (!button) return;
    if (button.dataset.dgAcceptanceTab) { state.acceptanceTab = button.dataset.dgAcceptanceTab; render(); return; }
    if (button.dataset.dgView) { switchView(button.dataset.dgView); return; }
    var action = button.dataset.dgAction;
    if (action === "refresh") state.view === "governance" ? loadGovernance(true) : loadPackage(state.selectedId, state.view);
    else if (action === "audit-rules") { state.helpKey = "rules"; render(); }
    else if (action === "help") { state.helpKey = button.dataset.helpKey; render(); }
    else if (action === "close-help") { state.helpKey = ""; render(); }
    else if (action === "reset") { state.search = ""; state.status = "all"; state.source = "all"; state.page = 1; render(); syncNav(); }
    else if (action === "mine-reset") { state.mineSearch = ""; state.mineStatus = "all"; state.mineSource = "all"; render(); }
    else if (action === "acceptance-reset") { state.search = ""; state.acceptancePriority = "all"; state.acceptanceFreshness = "all"; state.page = 1; render(); }
    else if (action === "page-prev") { state.page = Math.max(1, state.page - 1); render(); }
    else if (action === "page-next") { state.page += 1; render(); }
    else if (action === "audit-node") { state.auditNode = Number(button.dataset.nodeIndex) || 0; render(); }
    else if (action === "open-package") loadPackage(button.dataset.projectId, "package");
    else if (action === "mine-continue") loadPackage(button.dataset.projectId, "mine-compare");
    else if (action === "mine-open-graph") { if (state.packageData) { state.view = "mine-graph"; render(); } else if (state.selectedId) loadPackage(state.selectedId, "mine-graph"); }
    else if (action === "graph-node") selectMineGraphNode(button.dataset.nodeId || "project");
    else if (action === "acceptance-lineage") { state.acceptanceTab = "lineage"; render(); }
    else if (action === "submit") submitPackage();
    else if (action === "review-accept") reviewPackage("accepted");
    else if (action === "review-reject") reviewPackage("rejected");
    else if (action === "open-project") openProject();
  }, true);
  document.addEventListener("input", function (event) {
    if (!state.active || !event.target.closest("#" + PAGE_ID)) return;
    if (event.target.matches("[data-dg-search]")) { state.search = event.target.value; state.page = 1; render(); var input = document.querySelector("[data-dg-search]"); if (input) { input.focus(); input.setSelectionRange(state.search.length, state.search.length); } }
    else if (event.target.matches("[data-dg-mine-search]")) { state.mineSearch = event.target.value; render(); var mineInput = document.querySelector("[data-dg-mine-search]"); if (mineInput) { mineInput.focus(); mineInput.setSelectionRange(state.mineSearch.length, state.mineSearch.length); } }
    else if (event.target.matches("[data-dg-submit-notes]")) state.submitNotes = event.target.value;
    else if (event.target.matches("[data-dg-review-note]")) state.reviewNote = event.target.value;
    else if (event.target.matches("[data-dg-check]")) { state.submitChecks[event.target.dataset.dgCheck] = event.target.checked; render(); }
  }, true);
  document.addEventListener("change", function (event) {
    if (!state.active || !event.target.closest("#" + PAGE_ID)) return;
    if (event.target.dataset.dgFilter === "status") { state.status = event.target.value; state.page = 1; render(); syncNav(); }
    if (event.target.dataset.dgFilter === "source") { state.source = event.target.value; state.page = 1; render(); }
    if (event.target.dataset.dgMineFilter === "status") { state.mineStatus = event.target.value; render(); }
    if (event.target.dataset.dgMineFilter === "source") { state.mineSource = event.target.value; render(); }
    if (event.target.dataset.dgAcceptanceFilter === "priority") { state.acceptancePriority = event.target.value; state.page = 1; render(); }
    if (event.target.dataset.dgAcceptanceFilter === "freshness") { state.acceptanceFreshness = event.target.value; state.page = 1; render(); }
  }, true);
  document.addEventListener("keydown", function (event) {
    if (!state.active) return;
    var row = event.target.closest && event.target.closest("tr[data-dg-project]");
    if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); loadPackage(row.dataset.dgProject, "package"); }
    var mineRow = event.target.closest && event.target.closest("tr[data-dg-mine-project]");
    if (mineRow && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); state.selectedId = Number(mineRow.dataset.dgMineProject); render(); }
    var acceptanceRow = event.target.closest && event.target.closest("tr[data-dg-acceptance-project]");
    if (acceptanceRow && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); state.acceptanceTab = "overview"; loadAcceptanceInspector(acceptanceRow.dataset.dgAcceptanceProject); }
    var graphRow = event.target.closest && event.target.closest("tr[data-dg-graph-node]");
    if (graphRow && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selectMineGraphNode(graphRow.dataset.dgGraphNode); }
    if (event.key === "Escape" && state.helpKey) { state.helpKey = ""; render(); }
  });

  function sidebarCapture(event) {
    if (!event.target || !event.target.closest) return;
    var button = event.target.closest(".sidebar button");
    if (!button || button.matches(".nav-group > button") || button.closest(".sidebar-foot, .o2o-primary-footer")) return;
    var label = navText(button);
    if (["全部记录", "我的自检", "待验收"].includes(label)) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      activate({ scope: label === "我的自检" ? "mine" : "all", status: label === "待验收" ? "pending_acceptance" : "all" });
      return;
    }
    if (state.active) { deactivate(); if (window.location.hash.indexOf(HASH) === 0) setHash(false); }
  }
  window.addEventListener("pointerdown", sidebarCapture, true);
  window.addEventListener("click", sidebarCapture, true);
  window.addEventListener(ROUTE_EVENT, function (event) {
    if (event.detail && String(event.detail.hash || "").indexOf(HASH) === 0) return;
    if (state.active) deactivate();
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash.indexOf(HASH) === 0 && !state.active) activate();
    else if (window.location.hash.indexOf(HASH) !== 0 && state.active) deactivate();
  });
  new MutationObserver(function () { if (state.active) { ensurePage(); syncNav(); } }).observe(document.body, { childList: true, subtree: true });
  if (state.active) activate();
})();
