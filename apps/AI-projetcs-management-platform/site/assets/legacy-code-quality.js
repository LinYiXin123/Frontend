(function () {
  "use strict";

  // Retired product surface: retained only as a harmless cache-compatible asset.
  return;

  var HASH = "#code-quality";
  var WORKBENCH_ROUTE_EVENT = "legacy-workbench:navigate";
  var PAGE_ID = "code-quality-page";
  var NAV_ATTR = "data-code-quality-nav";
  var NAV_SECTION_CLASS = "code-quality-nav-section";
  var active = window.location.hash === HASH;
  var scheduled = false;
  var loading = false;
  var starting = false;
  var loadError = "";
  var overview = null;
  var policy = null;
  var scan = null;
  var scanHistory = [];
  var branches = [];
  var branchLoading = false;
  var branchError = "";
  var selectedProjectId = 0;
  var branch = "";
  var scanMode = "full";
  var severityFilter = "all";
  var query = "";
  var page = 1;
  var pageSize = 5;
  var pollTimer = 0;
  var searchTimer = 0;
  var findingsTransitionToken = 0;
  var pipelineMotionMedia = null;
  var selectedFindingId = 0;
  var dialog = "";
  var triageDraftStatus = "";
  var triageDraftReason = "";
  var triageDraftExpiresOn = "";
  var triageSaving = false;
  var qualityLayer = "governance";
  var reportTab = "evidence";
  var governanceQuery = "";
  var governanceGateFilter = "all";
  var governanceCoverageFilter = "all";
  var governancePage = 1;
  var governancePageSize = 8;
  var triageEvents = [];
  var triageEventsLoading = false;
  var qualityCharts = [];

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compact(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function projectBusinessName(project) {
    var item = project || {};
    return compact(item.display_name_zh || item.display_name || item.name) || "未命名项目";
  }

  function scanErrorSummary(value) {
    var message = compact(value);
    if (!message) return "扫描任务失败，请重新执行质检";
    if (/WinError\s*206|文件名或扩展名太长/i.test(message)) return "扫描工作区路径超过系统限制，请在当前 macOS 环境重新执行质检";
    if (/Errno\s*2|No such file or directory|系统找不到指定的文件/i.test(message)) return "扫描工作区文件缺失，请重新同步仓库后执行质检";
    return message
      .replace(/[A-Za-z]:\\[^\s'\"]+/g, "[本地路径已隐藏]")
      .replace(/\/(?:Users|tmp|private\/var\/folders|var\/folders)\/[^\s'\"]+/g, "[本地路径已隐藏]")
      .slice(0, 180);
  }

  function icon(name, className) {
    return '<i data-lucide="' + escapeHtml(name) + '" class="quality-icon' + (className ? " " + escapeHtml(className) : "") + '" aria-hidden="true"></i>';
  }

  function hydrateIcons() {
    var runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({
      icons: runtime.icons,
      attrs: { width: 18, height: 18, "stroke-width": 1.8 }
    });
  }

  function motionEngine() {
    var runtime = window.LegacyQualityMotion;
    return runtime && runtime.gsap ? runtime.gsap : null;
  }

  function reduceMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function disposePipelineMotion() {
    if (!pipelineMotionMedia) return;
    pipelineMotionMedia.revert();
    pipelineMotionMedia = null;
  }

  function setupPipelineMotion() {
    disposePipelineMotion();
    var gsap = motionEngine();
    var root = document.querySelector("#" + PAGE_ID + " .code-quality-steps");
    if (!gsap || !root) return;
    pipelineMotionMedia = gsap.matchMedia();
    pipelineMotionMedia.add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, function (context) {
      if (context.conditions.reduceMotion) return;
      root.querySelectorAll(".code-quality-step-line.line-active").forEach(function (line) {
        var flow = line.querySelector(".code-quality-step-line-flow");
        var node = line.querySelector(".code-quality-step-line-node");
        if (flow) {
          gsap.fromTo(flow, { xPercent: -125, autoAlpha: 0 }, {
            xPercent: 165, autoAlpha: 1, duration: 1.25, ease: "none", repeat: -1, overwrite: true
          });
        }
        if (node) {
          gsap.fromTo(node, { x: 0, autoAlpha: .25, scale: .7 }, {
            x: function (_, target) { return Math.max(0, target.parentElement.clientWidth - target.offsetWidth); },
            autoAlpha: 1, scale: 1, duration: 1.25, ease: "power1.inOut", repeat: -1, overwrite: true
          });
        }
      });
      root.querySelectorAll("[data-quality-step-halo]").forEach(function (halo) {
        gsap.fromTo(halo, { scale: .72, autoAlpha: .9 }, {
          scale: 1.45, autoAlpha: 0, duration: 1.4, ease: "power1.out", repeat: -1, overwrite: true
        });
      });
    }, root);
  }

  function formatTime(value) {
    if (!value) return "尚未扫描";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function localDateAfter(days) {
    var date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + Number(days || 0));
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function formatDuration(value) {
    var milliseconds = Number(value || 0);
    if (!milliseconds) return "--";
    var seconds = Math.max(1, Math.round(milliseconds / 1000));
    if (seconds < 60) return seconds + "秒";
    return Math.floor(seconds / 60) + "分" + String(seconds % 60).padStart(2, "0") + "秒";
  }

  function liveScanProgress() {
    var summary = scan && scan.summary || {};
    var progress = summary.progress && typeof summary.progress === "object" ? summary.progress : {};
    var percent = Number(progress.percent || 0);
    var elapsed = Number(progress.elapsed_ms || scan && scan.duration_ms || 0);
    var expected = Number(progress.expected_total_ms || 0);
    var stage = String(progress.stage || (scan && scan.status === "queued" ? "queued" : ""));
    var caps = { queued: 3, resolve_ref: 8, ci_evidence: 14, cache_lookup: 17, download: 35, extract: 47, analysis: 91, finalize: 99 };
    if (expected > 0 && scan && ["queued", "running"].includes(scan.status)) {
      percent = Math.max(percent, Math.min(caps[stage] || 99, Math.round(elapsed * 100 / expected)));
    }
    return {
      stage: stage,
      label: String(progress.label || (scan && scan.status === "queued" ? "正在等待扫描资源" : "正在准备质检")),
      percent: Math.max(0, Math.min(100, percent)),
      elapsed_ms: elapsed,
      expected_total_ms: expected,
      remaining_ms: Number(progress.remaining_ms || 0),
      estimate_exceeded: Boolean(progress.estimate_exceeded),
      estimate_basis: String(progress.estimate_basis || "project_or_platform_history")
    };
  }

  function renderLiveScanStatus() {
    if (!scan || !["queued", "running"].includes(scan.status)) return "";
    var progress = liveScanProgress();
    var queued = scan.status === "queued";
    var title = queued ? "质检任务正在排队" : progress.label;
    var elapsedLabel = queued ? "排队已等待 " + formatDuration(progress.elapsed_ms) : "已运行 " + formatDuration(progress.elapsed_ms);
    var estimateLabel = queued
      ? "预计执行耗时约 " + formatDuration(progress.expected_total_ms)
      : progress.estimate_exceeded
        ? "已超过历史预估，仍在完成当前阶段"
        : "预计剩余 " + formatDuration(progress.remaining_ms);
    var basisLabel = progress.estimate_basis === "platform_baseline"
      ? "暂无同项目历史，当前采用平台保守基线"
      : "按该项目最近完整扫描估算；历史不足时自动采用平台基线";
    return '<section class="cq2-live-scan tone-' + (queued ? "queued" : "running") + '" data-quality-live-status aria-live="polite">' +
      '<span class="cq2-live-scan-icon">' + icon(queued ? "clock-3" : "loader-circle", queued ? "" : "spin") + '</span>' +
      '<div class="cq2-live-scan-body"><div><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(elapsedLabel) + '<i></i>' + escapeHtml(estimateLabel) + '</span></div>' +
      '<div class="cq2-live-scan-track" role="progressbar" aria-label="' + escapeHtml(title) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress.percent + '"><b style="width:' + progress.percent + '%"></b></div>' +
      '<small>' + escapeHtml(basisLabel) + (queued ? "；排队时长受前序任务影响，不计入执行耗时。" : "。") + '</small></div>' +
      '<em>' + progress.percent + '%</em></section>';
  }

  function formatBytes(value) {
    var bytes = Number(value || 0);
    if (!bytes) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 0 : 0) + " " + units[index];
  }

  function requestJson(url, options) {
    var config = Object.assign({ credentials: "same-origin" }, options || {});
    if (config.body && !config.headers) config.headers = { "Content-Type": "application/json" };
    return fetch(url, config).then(async function (response) {
      var text = await response.text();
      var body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
      if (!response.ok) throw new Error(body.detail || body.message || "请求失败（" + response.status + "）");
      return body;
    });
  }

  function severityLabel(value) {
    return ({ critical: "阻断", high: "高危", medium: "中危", low: "低危", info: "提示" })[value] || "提示";
  }

  function categoryLabel(value) {
    return ({
      security: "安全", reliability: "可靠性", maintainability: "可维护性",
      testing: "测试", build: "构建", performance: "性能", style: "规范",
      delivery: "发布", dependencies: "依赖", configuration: "配置"
    })[value] || value || "代码质量";
  }

  function statusLabel(value) {
    return ({
      queued: "等待扫描", running: "扫描中", completed: "扫描完成", failed: "扫描失败",
      partial: "扫描不完整", unavailable: "未安装", skipped: "未启用",
      open: "待修复", confirmed: "待修复", false_positive: "误报", accepted_risk: "已接受", fixed: "已记录",
      pending: "尚未质检"
    })[value] || value || "尚未质检";
  }

  function engineCacheLabel(engine) {
    if (engine && engine.cache_hit) {
      return " · 精确内容缓存复用" + (engine.cache_reused_partial ? "（仍不完整）" : "");
    }
    if (engine && engine.incremental_cache_hit) {
      return " · 跨提交复用 " + Number(engine.file_cache_hit_count || 0).toLocaleString("zh-CN") +
        " 个未变文件，重扫 " + Number(engine.file_cache_miss_count || 0).toLocaleString("zh-CN") + " 个文件";
    }
    return "";
  }

  function engineRulesetLabel(engine) {
    var snapshot = engine && engine.performance && engine.performance.ruleset_snapshot || null;
    if (!snapshot) return "";
    if (!snapshot.execution_verified) return " · 规则快照未验证";
    var freshness = ({ current: "已刷新", pinned: "已固定", recent_cached: "近期快照", stale: "已过常规新鲜度" })[snapshot.freshness_status] || "已验证";
    return " · 规则快照 " + escapeHtml(snapshot.snapshot_id || "--") + "（" + freshness + "）";
  }

  function findingDisplayTitle(item) {
    var title = String(item && item.title || "代码质量问题");
    if (["DS-0002", "AVD-DS-0002"].includes(String(item && item.rule_id || "")) || title.includes("Image user should not be 'root'")) {
      return "容器未配置普通用户运行";
    }
    return title;
  }

  function recommendationDisplayTitle(value) {
    var title = String(value || "");
    return title.includes("Image user should not be 'root'") ? "容器未配置普通用户运行" : title;
  }

  function currentProject() {
    if (!overview || !Array.isArray(overview.projects)) return null;
    return overview.projects.find(function (item) { return Number(item.id) === Number(selectedProjectId); }) || null;
  }

  function currentFinding() {
    if (!scan || !Array.isArray(scan.findings)) return null;
    return scan.findings.find(function (item) { return Number(item.id) === Number(selectedFindingId); }) || null;
  }

  function isOutdatedScan() {
    return Boolean(scan && scan.status === "completed" && (scan.stale_policy || scan.policy_current === false));
  }

  function navLabel(button) {
    if (!button) return "";
    return compact(button.getAttribute("aria-label") || button.textContent);
  }

  function ensureNav() {
    var nav = document.querySelector(".sidebar nav");
    if (!nav) return null;
    var section = nav.querySelector("." + NAV_SECTION_CLASS);
    var existing = section && section.querySelector("[" + NAV_ATTR + "]");
    if (!section) {
      section = document.createElement("div");
      section.className = "nav-section " + NAV_SECTION_CLASS;
    }
    if (!existing) {
      var staleEntry = nav.querySelector("[" + NAV_ATTR + "]");
      if (staleEntry) staleEntry.remove();
      existing = document.createElement("button");
      existing.type = "button";
      existing.setAttribute(NAV_ATTR, "");
      existing.setAttribute("aria-label", "代码质检");
      existing.title = "代码质检";
      var iconSlot = document.createElement("span");
      iconSlot.className = "nav-icon";
      iconSlot.title = "代码质检";
      var label = document.createElement("span");
      label.className = "nav-label";
      label.textContent = "代码质检";
      existing.append(iconSlot, label);
      existing.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      section.appendChild(existing);
    }
    var assistantSection = nav.querySelector(".feishu-agent-nav-section");
    var rulesGroup = Array.prototype.find.call(nav.children, function (child) {
      return navLabel(child.querySelector(":scope > button")).indexOf("数据与规则") === 0;
    });
    var reference = assistantSection || rulesGroup || null;
    if (!section.isConnected || (reference && section.nextElementSibling !== reference)) {
      nav.insertBefore(section, reference);
    }
    existing.classList.toggle("active", active);
    if (active) existing.setAttribute("aria-current", "page");
    else existing.removeAttribute("aria-current");
    return existing;
  }

  function ensurePage() {
    var main = document.querySelector(".app-shell main") || document.querySelector("main");
    if (!main) return null;
    var pageElement = document.getElementById(PAGE_ID);
    if (pageElement && pageElement.parentElement !== main) pageElement.remove();
    if (!pageElement) {
      pageElement = document.createElement("section");
      pageElement.id = PAGE_ID;
      pageElement.className = "code-quality-page";
      pageElement.setAttribute("aria-label", "代码质检");
      main.appendChild(pageElement);
    }
    return pageElement;
  }

  function projectOptions() {
    var projects = overview && Array.isArray(overview.projects) ? overview.projects : [];
    if (!projects.length) return [{ value: "", label: "暂无可访问项目", hint: "请先同步 GitLab 项目", disabled: true }];
    return projects.map(function (project) {
      return {
        value: String(Number(project.id)),
        label: projectBusinessName(project),
        hint: project.gitlab_configured ? "GitLab 已关联" : "待关联 GitLab",
        disabled: false
      };
    });
  }

  function branchOptions(project) {
    var names = branches.map(function (item) { return item.name; }).filter(Boolean);
    var selected = branch || (project && project.default_branch) || "main";
    if (selected && !names.includes(selected)) names.unshift(selected);
    if (!names.length) names.push("main");
    return names.map(function (name) {
      return {
        value: name,
        label: name,
        hint: name === (project && project.default_branch) ? "默认分支" : "可扫描分支",
        disabled: false
      };
    });
  }

  function scanModeOptions() {
    var configured = policy && Array.isArray(policy.scan_modes) ? policy.scan_modes : [];
    if (!configured.length) return [
      { value: "full", label: "全量扫描", hint: "扫描当前分支全部文件", disabled: false },
      { value: "incremental", label: "新增代码门禁", hint: "策略加载后可用", disabled: true }
    ];
    return configured.map(function (item) {
      return {
        value: item.value,
        label: item.label,
        hint: item.description || (item.value === "full" ? "扫描当前分支全部文件" : "对比上一提交报告"),
        disabled: item.available === false
      };
    });
  }

  function renderQualitySelect(config) {
    var options = Array.isArray(config.options) ? config.options : [];
    var selected = options.find(function (option) { return String(option.value) === String(config.value); }) || options[0] || { value: "", label: "请选择" };
    var listId = "quality-select-list-" + config.key;
    var disabled = Boolean(config.disabled);
    return '<div class="quality-control-field ' + escapeHtml(config.className || "") + '">' +
      '<span class="quality-control-label">' + escapeHtml(config.label) + '</span>' +
      '<div class="quality-select" data-quality-select="' + escapeHtml(config.key) + '">' +
      '<button type="button" class="quality-select-toggle" data-quality-select-toggle aria-haspopup="listbox" aria-expanded="false" aria-controls="' + listId + '" aria-label="选择' + escapeHtml(config.label) + '，当前为' + escapeHtml(selected.label) + '"' + (disabled ? " disabled" : "") + '>' +
      '<strong title="' + escapeHtml(selected.label) + '">' + escapeHtml(selected.label) + '</strong>' + icon("chevron-down", "quality-select-chevron") + '</button>' +
      '<div class="quality-select-menu" id="' + listId + '" role="listbox" aria-label="' + escapeHtml(config.label) + '选项" aria-hidden="true">' +
      options.map(function (option) {
        var isSelected = String(option.value) === String(selected.value);
        return '<button type="button" role="option" class="quality-select-option' + (isSelected ? " selected" : "") + '" data-quality-select-option data-quality-select-key="' + escapeHtml(config.key) + '" data-quality-select-value="' + escapeHtml(option.value) + '" aria-selected="' + String(isSelected) + '"' + (option.disabled ? " disabled" : "") + '>' +
          '<span><strong>' + escapeHtml(option.label) + '</strong>' + (option.hint ? '<small>' + escapeHtml(option.hint) + '</small>' : "") + '</span>' +
          (isSelected ? icon("check", "quality-select-check") : "") + '</button>';
      }).join("") + '</div></div></div>';
  }

  function scanStatusMeta() {
    if (!scan) return { tone: "pending", label: "尚未质检", icon: "circle-dashed" };
    if (isOutdatedScan()) return { tone: "outdated", label: "历史报告", icon: "history" };
    if (scan.status === "completed" && scan.summary && scan.summary.scan_complete === false) return { tone: "fail", label: "扫描不完整", icon: "circle-x" };
    if (scan.status === "completed" && scan.summary && scan.summary.cache_hit) return { tone: "pass", label: "完成 · 证据复用", icon: "circle-check" };
    if (scan.status === "completed") return { tone: "pass", label: "扫描完成", icon: "circle-check" };
    if (scan.status === "failed") return { tone: "fail", label: "扫描失败", icon: "circle-x" };
    return { tone: "running", label: statusLabel(scan.status), icon: "loader-circle" };
  }

  function renderHeader(project) {
    var busy = starting || (scan && ["queued", "running"].includes(scan.status));
    var disabled = !project || !project.gitlab_configured || busy;
    return '<header class="code-quality-header">' +
      '<div><div class="code-quality-eyebrow"><strong>代码质量</strong>' + icon("chevron-right") + '<span>质检报告</span></div>' +
      '<h1>代码质检</h1><p>按项目技术栈自动选择 AST、Lizard、Semgrep、Trivy、OSV、Ruff、Biome 与 jscpd，形成证据可追溯的代码质量报告</p></div>' +
      '<div class="code-quality-header-actions">' +
      '<button type="button" class="code-quality-secondary" data-quality-policy>' + icon("settings-2") + '质检策略</button>' +
      '<button type="button" class="code-quality-primary" data-quality-start' + (disabled ? " disabled" : "") + '>' +
      (busy ? icon("loader-circle", "spin") + '正在质检' : icon("play") + '开始质检') + '</button></div></header>';
  }

  function renderContextAlert(project) {
    if (loadError) {
      return '<div class="code-quality-context-alert tone-error">' + icon("circle-alert") + '<div><strong>质检数据加载失败</strong><span>' + escapeHtml(loadError) + '</span></div><button type="button" data-quality-reload>' + icon("refresh-cw") + '重新加载</button></div>';
    }
    if (!project) {
      return '<div class="code-quality-context-alert">' + icon("link") + '<div><strong>尚未读取到可访问项目</strong><span>请刷新项目数据；若仍为空，请先在 GitLab 集成中完成仓库同步。</span></div><div class="context-actions"><button type="button" data-quality-reload>' + icon("refresh-cw") + '刷新项目</button><button type="button" data-quality-open-gitlab>' + icon("external-link") + 'GitLab 集成</button></div></div>';
    }
    if (!project.gitlab_configured) {
      return '<div class="code-quality-context-alert tone-warn">' + icon("git-branch") + '<div><strong>当前项目尚未关联 GitLab 仓库</strong><span>完成仓库配置后即可读取分支并运行只读扫描。</span></div><button type="button" data-quality-open-gitlab>' + icon("external-link") + '配置仓库</button></div>';
    }
    if (isOutdatedScan()) {
      return '<div class="code-quality-context-alert tone-warn">' + icon("history") + '<div><strong>当前展示的是历史报告，不能作为当前质量结论</strong><span>该报告使用 v' + escapeHtml(scan.scanner_version || "未知") + ' 规则生成，当前规则已升级到 v' + escapeHtml(scan.current_scanner_version || policy && policy.version || "--") + '。旧报告中的问题数量仅供追溯，请重新质检。</span></div><button type="button" data-quality-start>' + icon("refresh-cw") + '按当前规则重扫</button></div>';
    }
    if (branchError) {
      return '<div class="code-quality-context-alert tone-warn compact">' + icon("circle-alert") + '<div><strong>分支列表暂不可用</strong><span>' + escapeHtml(branchError) + '，仍可使用默认分支继续质检。</span></div><button type="button" data-quality-reload-branches>' + icon("refresh-cw") + '重试</button></div>';
    }
    return "";
  }

  function renderControls(project) {
    var status = scanStatusMeta();
    var commit = scan && scan.commit_sha ? scan.commit_sha.slice(0, 7) : "--";
    var time = scan ? formatTime(scan.finished_at || scan.created_at) : "等待首次质检";
    return '<section class="code-quality-controls" aria-label="扫描配置">' +
      renderQualitySelect({ key: "project", label: "项目", className: "project-control", options: projectOptions(), value: selectedProjectId, disabled: !overview || !overview.projects || !overview.projects.length }) +
      renderQualitySelect({ key: "branch", label: "分支", options: branchOptions(project), value: branch || (project && project.default_branch) || "main", disabled: !project || branchLoading }) +
      renderQualitySelect({ key: "mode", label: "扫描模式", options: scanModeOptions(), value: scanMode, disabled: false }) +
      '<div class="code-quality-commit"><span>' + icon("git-commit-horizontal") + 'Commit</span><strong>' + escapeHtml(commit) + '</strong><i></i><time>' + escapeHtml(time) + '</time></div>' +
      '<span class="code-quality-status-badge tone-' + status.tone + '">' + icon(status.icon, status.tone === "running" ? "spin" : "") + status.label + '</span>' +
      '</section>';
  }

  function gateMeta() {
    if (!currentProject()) return { tone: "pending", label: "待关联", description: "选择项目后开始" };
    if (!scan) return { tone: "pending", label: "待质检", description: "运行首次扫描后判断" };
    if (isOutdatedScan()) return { tone: "outdated", label: "报告已过期", description: "旧规则结果不能用于当前质量准入" };
    if (scan.status === "failed") return { tone: "fail", label: "扫描失败", description: scanErrorSummary(scan.error) };
    if (scan.summary && (scan.summary.gate_scan_complete === false || (scan.summary.gate_scan_complete == null && scan.summary.scan_complete === false))) return { tone: "fail", label: "扫描不完整", description: "本次门禁范围的必需质检引擎未成功运行" };
    var summary = scan.summary || {};
    var newCodeGate = summary.gate_scope === "new_code";
    var gateBlockers = Number(summary.blocker_count || 0);
    var overallBlockers = Number(summary.overall_blocker_count == null ? gateBlockers : summary.overall_blocker_count);
    if (scan.gate_status === "passed" && newCodeGate) return {
      tone: "pass",
      label: "新增代码通过",
      description: summary.scan_complete === false
        ? "新增范围检查完整；全仓报告仍有历史文件未覆盖"
        : overallBlockers > gateBlockers ? "新增范围未发现阻断；全仓仍有 " + overallBlockers + " 项历史阻断" : "新增范围未发现质量阻断"
    };
    if (scan.gate_status === "passed" && summary.assurance_level === "baseline") return { tone: "pass", label: "基线通过", description: "增强引擎未运行，仅代表内置基线通过" };
    if (scan.gate_status === "passed") return { tone: "pass", label: "已通过", description: "高置信证据门禁已通过" };
    if (scan.gate_status === "failed" && newCodeGate) return { tone: "fail", label: "新增代码未通过", description: "新增范围存在 " + gateBlockers + " 个阻断问题" };
    if (scan.gate_status === "failed") return { tone: "fail", label: "未通过", description: "存在 " + gateBlockers + " 个阻断问题" };
    return { tone: "pending", label: "质检中", description: "正在生成质量结论" };
  }

  function previousCompletedScan() {
    if (!scan || !scanHistory.length) return null;
    return scanHistory.find(function (item) { return item.status === "completed" && Number(item.id) !== Number(scan.id); }) || null;
  }

  function renderMetricCards() {
    var summary = scan && scan.summary ? scan.summary : {};
    var counts = summary.severity_counts || {};
    var gate = gateMeta();
    var scoreAvailable = summary.scan_complete !== false && summary.quality_score_available !== false;
    var score = scoreAvailable && scan && scan.score != null ? Number(scan.score) : null;
    var previous = previousCompletedScan();
    var delta = previous && score != null && previous.score != null ? score - Number(previous.score) : null;
    var languageNames = Object.keys(summary.languages || {}).slice(0, 3);
    var overallBlockers = Number(summary.overall_blocker_count == null ? summary.blocker_count || 0 : summary.overall_blocker_count);
    var blockerSummary = summary.gate_scope === "new_code"
      ? "新增阻断 " + Number(summary.blocker_count || 0) + " · 全仓阻断 " + overallBlockers + " · 改进 " + Number(summary.measured_improvement_count || 0)
      : "阻断 " + overallBlockers + " · 待复核 " + Number(summary.review_candidate_count || 0) + " · 改进 " + Number(summary.measured_improvement_count || 0);
    return '<section class="code-quality-metrics">' +
      '<article class="code-quality-metric gate-' + gate.tone + '"><span class="metric-icon">' + icon(gate.tone === "fail" ? "shield-alert" : gate.tone === "pass" ? "shield-check" : "circle-dashed") + '</span><div><small>质量门禁</small><strong>' + gate.label + '</strong><em>' + escapeHtml(gate.description) + '</em></div></article>' +
      '<article class="code-quality-metric score-card"><canvas data-quality-score width="76" height="76" aria-label="代码质量分 ' + (score == null ? "不可用" : score) + '"></canvas><div><small>' + (isOutdatedScan() ? "历史质量分" : scoreAvailable ? "代码质量分" : "质量分不可用") + '</small><strong>' + (score == null ? "--" : score) + '</strong><em>' + (!scoreAvailable ? "扫描证据不完整，本次不出分" : isOutdatedScan() ? "旧规则结果，仅供追溯" : delta == null ? "暂无历史对比" : '较上次 <b class="' + (delta >= 0 ? "positive" : "negative") + '">' + (delta >= 0 ? "+" : "") + delta + '</b>') + '</em></div></article>' +
      '<article class="code-quality-metric"><span class="metric-icon issue-icon">' + icon("alert-triangle") + '</span><div><small>质量项总数</small><strong>' + (scan ? Number(summary.finding_count || 0) : "--") + '</strong><em>' + blockerSummary + '</em></div></article>' +
      '<article class="code-quality-metric"><span class="metric-icon folder-icon">' + icon("folder") + '</span><div><small>扫描范围</small><strong>' + (scan ? Number(summary.scanned_files || 0) : "--") + '<b> 个文件</b></strong><em>' + (languageNames.length ? languageNames.join(" · ") : "等待读取仓库代码") + '</em></div></article>' +
      '</section>';
  }

  function drawScoreChart() {
    var canvas = document.querySelector("[data-quality-score]");
    if (!canvas || typeof canvas.getContext !== "function") return;
    var context = canvas.getContext("2d");
    if (!context) return;
    var scoreAvailable = !scan || !scan.summary || (scan.summary.scan_complete !== false && scan.summary.quality_score_available !== false);
    var score = scoreAvailable && scan && scan.score != null ? Math.max(0, Math.min(100, Number(scan.score))) : 0;
    var ratio = window.devicePixelRatio || 1;
    var size = 76;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    context.scale(ratio, ratio);
    context.clearRect(0, 0, size, size);
    context.lineWidth = 7;
    context.lineCap = "round";
    context.strokeStyle = "#e8eef8";
    context.beginPath();
    context.arc(38, 38, 27, 0, Math.PI * 2);
    context.stroke();
    if (score > 0) {
      context.strokeStyle = score >= 80 ? "#2f72e7" : score >= 60 ? "#f59e0b" : "#ef4444";
      context.beginPath();
      context.arc(38, 38, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100);
      context.stroke();
    }
  }

  function stepStatus(step, index) {
    if (!scan) return "waiting";
    if (scan.report && Array.isArray(scan.report.steps)) {
      var known = scan.report.steps.find(function (item) { return item.key === step.key; });
      if (known) return known.status;
    }
    if (scan.status === "failed") return index === 0 ? "failed" : "waiting";
    if (scan.status === "completed") return step.key === "ai" ? "skipped" : "completed";
    if (scan.status === "running") {
      var stage = liveScanProgress().stage;
      if (stage === "resolve_ref") return step.key === "fetch" ? "running" : "waiting";
      if (stage === "ci_evidence") return step.key === "fetch" ? "completed" : step.key === "ci" ? "running" : "waiting";
      if (["cache_lookup", "download"].includes(stage)) return ["fetch", "ci"].includes(step.key) ? "completed" : "waiting";
      if (stage === "extract") return ["fetch", "ci"].includes(step.key) ? "completed" : step.key === "rules" ? "running" : "waiting";
      if (stage === "analysis") {
        if (["fetch", "ci"].includes(step.key)) return "completed";
        if (["rules", "security"].includes(step.key)) return "running";
        return "waiting";
      }
      if (stage === "finalize") return step.key === "report" ? "running" : "completed";
      return index === 0 ? "running" : "waiting";
    }
    return index === 0 ? "running" : "waiting";
  }

  function renderPipeline() {
    var steps = [
      { key: "fetch", label: "锁定代码版本", icon: "download" },
      { key: "ci", label: "CI 与测试证据", icon: "git-branch" },
      { key: "rules", label: "代码正确性扫描", icon: "list-checks" },
      { key: "security", label: "安全与依赖扫描", icon: "shield-check" },
      { key: "report", label: "生成报告", icon: "file-text" }
    ];
    var states = steps.map(function (step, index) {
      var state = stepStatus(step, index);
      return ["failed", "unavailable", "partial"].includes(state) ? "failed" : state;
    });
    var hasRunningStep = states.includes("running");
    function connectorState(index) {
      var current = states[index];
      var next = states[index + 1];
      if (next === "running") return "active";
      if (current === "failed" || next === "failed") return "failed";
      if (current === "completed" && ["completed", "skipped"].includes(next)) return "completed";
      if (scan && ["queued", "running"].includes(scan.status) && current === "completed" && next === "waiting" && !hasRunningStep) return "active";
      return "waiting";
    }
    var progress = liveScanProgress();
    var isBusy = scan && ["queued", "running"].includes(scan.status);
    var timing = isBusy
      ? '已用 ' + formatDuration(progress.elapsed_ms) + ' · ' + (progress.estimate_exceeded ? '已超过历史预估，正在完成当前阶段' : '预计剩余 ' + formatDuration(progress.remaining_ms))
      : '用时 ' + formatDuration(scan && scan.duration_ms);
    var liveProgress = isBusy ? '<div class="code-quality-live-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress.percent + '"><div><span>' + escapeHtml(progress.label) + '</span><strong>' + progress.percent + '%</strong></div><i><b style="width:' + progress.percent + '%"></b></i><small>预计时间根据该项目最近完整扫描动态计算，首次扫描使用平台基线。</small></div>' : '';
    return '<section class="code-quality-panel code-quality-pipeline"><div class="code-quality-panel-title"><h2>本次质检流程</h2><span>' + timing + '</span></div>' + liveProgress +
      '<div class="code-quality-steps">' + steps.map(function (step, index) {
        var state = stepStatus(step, index);
        var normalizedState = ["failed", "unavailable", "partial"].includes(state) ? "failed" : state;
        var label = state === "completed" ? "已完成" : state === "running" ? "进行中" : state === "skipped" || state === "unavailable" ? "未启用" : state === "partial" ? "不完整" : state === "failed" ? "失败" : "等待";
        var stateIcon = normalizedState === "completed" ? "check" : normalizedState === "failed" ? "circle-x" : normalizedState === "running" ? "loader-circle" : step.icon;
        var connector = index < steps.length - 1 ? connectorState(index) : "";
        return '<div class="code-quality-step step-' + normalizedState + '"><span>' + (normalizedState === "running" ? '<b class="code-quality-step-halo" data-quality-step-halo aria-hidden="true"></b>' : '') + icon(stateIcon, normalizedState === "running" ? "spin" : "") + '</span><strong>' + step.label + '</strong><small>' + label + '</small></div>' + (connector ? '<i class="code-quality-step-line line-' + connector + '" aria-hidden="true"><span class="code-quality-step-line-track"></span><span class="code-quality-step-line-flow"></span><b class="code-quality-step-line-node"></b></i>' : '');
      }).join("") + '</div></section>';
  }

  function filteredFindings() {
    var findings = scan && Array.isArray(scan.findings) ? scan.findings : [];
    var normalizedQuery = compact(query).toLocaleLowerCase("zh-CN");
    var severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return findings.filter(function (item) {
      if (severityFilter === "blocking" && !item.blocking) return false;
      if (severityFilter === "improvement" && !["complexity_metric", "duplication_metric"].includes(item.evidence_type)) return false;
      if (severityFilter === "new" && (!item.metadata || item.metadata.baseline_status !== "new")) return false;
      if (!["all", "blocking", "improvement", "new"].includes(severityFilter) && item.severity !== severityFilter) return false;
      if (!normalizedQuery) return true;
      return [item.title, findingDisplayTitle(item), item.description, item.file_path, item.rule_id, categoryLabel(item.category)]
        .some(function (value) { return String(value || "").toLocaleLowerCase("zh-CN").includes(normalizedQuery); });
    }).sort(function (left, right) {
      var leftEvidence = Number(left.evidence_score || (left.metadata && left.metadata.evidence_assessment && left.metadata.evidence_assessment.score) || 0);
      var rightEvidence = Number(right.evidence_score || (right.metadata && right.metadata.evidence_assessment && right.metadata.evidence_assessment.score) || 0);
      return Number(Boolean(right.blocking)) - Number(Boolean(left.blocking)) ||
        Number(severityOrder[left.severity] == null ? 9 : severityOrder[left.severity]) - Number(severityOrder[right.severity] == null ? 9 : severityOrder[right.severity]) ||
        rightEvidence - leftEvidence ||
        String(left.file_path || "").localeCompare(String(right.file_path || "")) ||
        Number(left.line || 0) - Number(right.line || 0);
    });
  }

  function filterButton(value, label, count) {
    return '<button type="button" data-quality-severity="' + value + '" class="' + (severityFilter === value ? "active" : "") + '"><span>' + label + '</span><b>' + count + '</b></button>';
  }

  function renderPagination(totalItems) {
    var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    page = Math.min(Math.max(page, 1), totalPages);
    var visiblePages = totalPages <= 7
      ? Array.from({ length: totalPages }, function (_, index) { return index + 1; })
      : [1, page - 1, page, page + 1, totalPages].concat(page <= 4 ? [2, 3, 4] : []).concat(page >= totalPages - 3 ? [totalPages - 3, totalPages - 2, totalPages - 1] : [])
        .filter(function (value) { return value >= 1 && value <= totalPages; })
        .filter(function (value, index, values) { return values.indexOf(value) === index; })
        .sort(function (left, right) { return left - right; });
    var pageButtons = [];
    visiblePages.forEach(function (pageNumber, index) {
      if (index && pageNumber - visiblePages[index - 1] > 1) pageButtons.push('<span class="pagination-ellipsis" aria-hidden="true">…</span>');
      pageButtons.push('<button type="button" data-quality-page="' + pageNumber + '" class="' + (page === pageNumber ? "active" : "") + '" aria-label="第 ' + pageNumber + ' 页"' + (page === pageNumber ? ' aria-current="page"' : '') + '>' + pageNumber + '</button>');
    });
    return '<div class="code-quality-pagination"><span>共 ' + totalItems + ' 条 · 第 ' + page + ' / ' + totalPages + ' 页</span><div><button type="button" data-quality-page="' + (page - 1) + '" aria-label="上一页" title="上一页"' + (page <= 1 ? " disabled" : "") + '>' + icon("arrow-left") + '</button>' + pageButtons.join("") + '<button type="button" data-quality-page="' + (page + 1) + '" aria-label="下一页" title="下一页"' + (page >= totalPages ? " disabled" : "") + '>' + icon("arrow-right") + '</button></div><span>' + pageSize + ' 条/页</span></div>';
  }

  function renderFindingRow(item, ordinal) {
    var displayTitle = findingDisplayTitle(item);
    var baselineStatus = item.metadata && item.metadata.baseline_status;
    var baselineBadge = baselineStatus === "new" ? '<em class="quality-baseline-badge">新增</em>' : "";
    var corroboration = item.metadata && item.metadata.corroboration || {};
    var corroborationBadge = Number(corroboration.source_count || 0) >= 2 ? '<em class="quality-corroboration-badge">同根因</em>' : "";
    var location = item.file_path || "项目级检查";
    if (item.line) location += ":" + Number(item.line);
    // Keep the queue row as one unambiguous click target. A nested GitLab link
    // intercepted pointer clicks and prevented the finding workbench from
    // opening; the source link remains available in the detail evidence panel.
    var locationMarkup = '<strong class="code-quality-table-location" title="打开问题详情后可前往 GitLab 查看对应代码行">' + escapeHtml(location) + '</strong>';
    return '<div class="code-quality-finding-row" data-quality-finding="' + Number(item.id) + '" role="button" tabindex="0" aria-label="查看问题详情：' + escapeHtml(displayTitle) + '">' +
      '<span><b class="code-quality-row-number" aria-label="序号 ' + Number(ordinal) + '">' + Number(ordinal) + '</b></span>' +
      '<span><b class="severity-' + escapeHtml(item.severity) + '">' + severityLabel(item.severity) + '</b></span>' +
      '<span><strong>' + escapeHtml(displayTitle) + baselineBadge + '</strong></span>' +
      '<span>' + locationMarkup + '</span>' +
      '<span><b class="quality-category">' + escapeHtml(item.source || categoryLabel(item.category)) + (item.blocking ? ' · 阻断' : '') + corroborationBadge + '</b></span>' +
      '<span><b class="triage-' + escapeHtml(item.triage_status) + '">' + statusLabel(item.triage_status) + '</b></span>' +
      '<span>' + icon("chevron-right") + '</span></div>';
  }

  function findingsViewData() {
    var all = filteredFindings();
    var totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    page = Math.min(Math.max(page, 1), totalPages);
    var start = (page - 1) * pageSize;
    return { all: all, rows: all.slice(start, start + pageSize) };
  }

  function renderFindingResults(rows) {
    var pageOffset = (page - 1) * pageSize;
    return rows.length ? rows.map(function (item, index) { return renderFindingRow(item, pageOffset + index + 1); }).join("") : '<div class="code-quality-table-empty">' + icon(scan ? "circle-check" : "circle-dashed") + '<strong>' + (scan ? "当前筛选下没有问题" : "尚未生成问题清单") + '</strong><span>' + (scan ? "可以切换筛选条件查看其他风险。" : "完成首次质检后，这里会显示真实扫描结果。") + '</span></div>';
  }

  function renderFindings() {
    var counts = scan && scan.summary && scan.summary.severity_counts ? scan.summary.severity_counts : {};
    var view = findingsViewData();
    var baselineFilter = scan && scan.scan_mode === "incremental" && scan.summary && scan.summary.baseline_available ? filterButton("new", "新增", Number(scan.summary.new_finding_count || 0)) : "";
    var overallBlockers = Number(scan && scan.summary && (scan.summary.overall_blocker_count == null ? scan.summary.blocker_count : scan.summary.overall_blocker_count) || 0);
    return '<section class="code-quality-panel code-quality-findings"><div class="code-quality-findings-head"><div><h2>问题清单</h2><div class="code-quality-filters">' + filterButton("all", "全部", Number((scan && scan.summary && scan.summary.finding_count) || 0)) + filterButton("blocking", "阻断", overallBlockers) + baselineFilter + filterButton("improvement", "改进", Number((scan && scan.summary && scan.summary.measured_improvement_count) || 0)) + filterButton("high", "高危", Number(counts.high || 0)) + filterButton("medium", "中危", Number(counts.medium || 0)) + filterButton("low", "低危", Number(counts.low || 0)) + '</div></div><label class="code-quality-search">' + icon("search") + '<input data-quality-search value="' + escapeHtml(query) + '" placeholder="搜索文件或问题" /></label></div>' +
      '<div class="code-quality-table"><div class="code-quality-table-head"><span>序号</span><span>等级</span><span>问题</span><span>文件位置</span><span>来源</span><span>状态</span><span></span></div>' +
      '<div class="code-quality-findings-results" data-quality-findings-results aria-live="polite">' + renderFindingResults(view.rows) + '</div></div><div data-quality-pagination-region>' + renderPagination(view.all.length) + '</div></section>';
  }

  function updateFindingControls() {
    document.querySelectorAll("#" + PAGE_ID + " [data-quality-severity]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.qualitySeverity === severityFilter);
    });
  }

  function refreshFindingResults() {
    var results = document.querySelector("#" + PAGE_ID + " [data-quality-findings-results]");
    var pagination = document.querySelector("#" + PAGE_ID + " [data-quality-pagination-region]");
    if (!results || !pagination) return null;
    var view = findingsViewData();
    results.innerHTML = renderFindingResults(view.rows);
    pagination.innerHTML = renderPagination(view.all.length);
    hydrateIcons();
    return { results: results, pagination: pagination };
  }

  function transitionFindings(mutate) {
    if (typeof mutate === "function") mutate();
    updateFindingControls();
    var section = document.querySelector("#" + PAGE_ID + " .code-quality-findings");
    var results = section && section.querySelector("[data-quality-findings-results]");
    var pagination = section && section.querySelector("[data-quality-pagination-region]");
    var gsap = motionEngine();
    if (!section || !results || !pagination) { render(); return; }
    var token = ++findingsTransitionToken;
    var targets = [results, pagination];
    section.classList.add("is-transitioning");
    section.setAttribute("aria-busy", "true");
    if (!gsap || reduceMotion()) {
      refreshFindingResults();
      section.classList.remove("is-transitioning");
      section.setAttribute("aria-busy", "false");
      return;
    }
    gsap.killTweensOf(targets);
    gsap.to(targets, {
      autoAlpha: 0,
      y: -5,
      duration: .13,
      stagger: .015,
      ease: "power1.in",
      overwrite: true,
      onComplete: function () {
        if (token !== findingsTransitionToken) return;
        var refreshed = refreshFindingResults();
        if (!refreshed) return;
        var nextTargets = [refreshed.results, refreshed.pagination];
        var rows = refreshed.results.querySelectorAll(".code-quality-finding-row, .code-quality-table-empty");
        gsap.set(nextTargets, { autoAlpha: 1, y: 0 });
        gsap.fromTo(rows, { autoAlpha: 0, y: 9 }, {
          autoAlpha: 1,
          y: 0,
          duration: .3,
          stagger: .035,
          ease: "power2.out",
          overwrite: true,
          clearProps: "transform,opacity,visibility",
          onComplete: function () {
            if (token !== findingsTransitionToken) return;
            section.classList.remove("is-transitioning");
            section.setAttribute("aria-busy", "false");
          }
        });
        gsap.fromTo(refreshed.pagination, { autoAlpha: 0, y: 6 }, {
          autoAlpha: 1, y: 0, duration: .24, delay: .04, ease: "power2.out", overwrite: true, clearProps: "transform,opacity,visibility"
        });
      }
    });
  }

  function fallbackRecommendations() {
    if (!scan) return [];
    if (scan.gate_status === "passed") return [
      { level: "可进入下一步", title: "高置信证据扫描未发现质量阻断项", icon: "circle-check", tone: "pass" }
    ];
    return [
      { level: "立即修复", title: "先处理阻断和高危问题后再进入下一流程", icon: "circle-alert", tone: "danger" }
    ];
  }

  function reportNumber() {
    if (!scan || !scan.id) return "--";
    var date = new Date(scan.created_at || Date.now());
    var stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("");
    return "CQ-" + stamp + "-" + String(scan.id).padStart(4, "0");
  }

  function renderBaselineSummary() {
    var baseline = scan && scan.report && scan.report.baseline;
    var evidence = scan && scan.report && scan.report.new_code_evidence;
    if (!scan || scan.scan_mode !== "incremental") return "";
    if (!baseline || !baseline.available) {
      return '<div class="code-quality-baseline-summary is-empty">' + icon("git-compare-arrows") + '<span>新增代码范围不可用，本次已安全回退全量门禁：' + escapeHtml(evidence && evidence.summary || baseline && baseline.reason || "GitLab Compare 未形成完整证据") + '</span></div>';
    }
    if (baseline.mode === "gitlab_compare_new_code_v1") {
      return '<div class="code-quality-baseline-summary"><span><small>目标分支</small><strong>' + escapeHtml(baseline.target_branch || "--") + '</strong></span><span class="is-existing"><small>变更范围</small><strong>' + Number(baseline.changed_file_count || 0) + ' / ' + Number(baseline.changed_line_count || 0) + '</strong></span><span class="is-new"><small>新增问题</small><strong>' + Number(baseline.new_count || 0) + '</strong></span></div>';
    }
    return '<div class="code-quality-baseline-summary"><span class="is-new"><small>新增</small><strong>' + Number(baseline.new_count || 0) + '</strong></span><span class="is-existing"><small>持续</small><strong>' + Number(baseline.existing_count || 0) + '</strong></span><span class="is-resolved"><small>已解决</small><strong>' + Number(baseline.resolved_count || 0) + '</strong></span></div>';
  }

  function renderSidePanels() {
    var outdated = isOutdatedScan();
    var summary = scan && scan.summary || {};
    var review = scan && scan.report && scan.report.ai_review ? scan.report.ai_review : null;
    var conclusion = outdated
      ? "这是一份旧规则生成的历史报告，其中的 " + Number(scan && scan.summary && scan.summary.blocker_count || 0) + " 个阻断问题未经当前高精度规则复核，不能直接作为当前质量结论。请按当前规则重新质检。"
      : review && review.conclusion ? review.conclusion : "完成首次质检后，系统会根据固定规则给出质量结论和优先处理建议。";
    if (!outdated && Number(summary.accepted_risk_count || 0) > 0) {
      conclusion += " 当前另有 " + Number(summary.accepted_risk_count) + " 项限期接受风险；它们未计入当前门禁，但并不代表已经修复。";
    }
    if (!outdated && Number(summary.expired_risk_acceptance_count || 0) > 0) {
      conclusion += " 其中 " + Number(summary.expired_risk_acceptance_count) + " 项风险接受已到期并重新进入门禁。";
    }
    var recommendations = outdated ? [
      { level: "需要重扫", title: "使用当前规则重新扫描同一分支后再判断", icon: "refresh-cw", tone: "warn" }
    ] : review && Array.isArray(review.recommendations) && review.recommendations.length ? review.recommendations.map(function (item, index) {
      return { level: item.level, title: recommendationDisplayTitle(item.title), icon: index === 0 ? "circle-alert" : "layers-3", tone: index === 0 ? "danger" : "warn" };
    }) : fallbackRecommendations();
    return '<div class="code-quality-side-stack"><article class="code-quality-panel code-quality-conclusion"><div class="side-panel-head"><h2>智能质检结论</h2><span>' + icon("sparkles") + '规则汇总</span></div><p>' + escapeHtml(conclusion) + '</p><div class="code-quality-recommendations">' + (recommendations.length ? recommendations.slice(0, 3).map(function (item) {
      return '<div class="tone-' + item.tone + '">' + icon(item.icon) + '<strong>' + escapeHtml(item.level) + '</strong><span>' + escapeHtml(item.title) + '</span></div>';
    }).join("") : '<div class="empty-recommendation">' + icon("circle-dashed") + '<span>暂无优先处理项</span></div>') + '</div></article>' +
      '<article class="code-quality-panel code-quality-report-meta"><h2>报告信息</h2>' + renderBaselineSummary() + '<dl><div><dt>扫描分支</dt><dd>' + escapeHtml(scan && scan.branch || branch || "--") + '</dd></div><div><dt>规则版本</dt><dd>v' + escapeHtml(scan && scan.scanner_version || policy && policy.version || "--") + (outdated ? "（历史）" : "") + '</dd></div><div><dt>Commit</dt><dd>' + escapeHtml(scan && scan.commit_sha ? scan.commit_sha.slice(0, 7) : "--") + '</dd></div><div><dt>报告编号</dt><dd>' + escapeHtml(reportNumber()) + '</dd></div><div><dt>扫描方式</dt><dd>' + (scan && scan.scan_mode === "incremental" ? "新增代码门禁（全量报告）" : scan && scan.summary && scan.summary.cache_hit ? "全量扫描（同提交证据复用）" : "全量扫描") + '</dd></div><div><dt>治理处置</dt><dd>接受风险 ' + Number(summary.accepted_risk_count || 0) + ' · 误报 ' + Number(summary.false_positive_count || 0) + '</dd></div></dl><div class="code-quality-report-actions"><button type="button" class="code-quality-action-button is-secondary" data-quality-report' + (!scan || scan.status !== "completed" ? " disabled" : "") + '><span class="code-quality-action-icon">' + icon("eye") + '</span><span>' + (outdated ? "查看历史报告" : "查看完整报告") + '</span></button><button type="button" class="code-quality-action-button is-primary" data-quality-pdf' + (!scan || scan.status !== "completed" ? " disabled" : "") + '><span class="code-quality-action-icon">' + icon("download") + '</span><span>下载 PDF</span><i class="code-quality-button-sheen" aria-hidden="true"></i></button></div></article></div>';
  }

  function renderWorkspace() {
    return '<section class="code-quality-workspace"><div>' + renderFindings() + '</div>' + renderSidePanels() + '</section>';
  }

  function renderDrawer() {
    var finding = currentFinding();
    if (!finding) return "";
    var locationLabel = (finding.file_path || "项目级检查") + (finding.line ? ':' + Number(finding.line) : "");
    var locationMarkup = finding.web_url
      ? '<a class="code-quality-source-link" data-quality-source-link href="' + escapeHtml(finding.web_url) + '" target="_blank" rel="noopener noreferrer" title="在 GitLab 打开对应代码行">' + escapeHtml(locationLabel) + icon("external-link") + '</a>'
      : '<strong>' + escapeHtml(locationLabel) + '</strong>';
    var statuses = [
      { value: "confirmed", label: "确认问题" },
      { value: "fixed", label: "标记已修复" },
      { value: "false_positive", label: "标记误报" },
      { value: "accepted_risk", label: "接受风险" }
    ];
    var findingMetadata = finding.metadata || {};
    var evidenceAssessment = findingMetadata.evidence_assessment || {};
    var evidenceLabel = finding.blocking
      ? "高置信阻断证据"
      : finding.evidence_type === "complexity_metric"
      ? "量化复杂度指标"
      : finding.evidence_type === "duplication_metric"
      ? "量化重复度指标"
      : finding.evidence_type === "dependency_advisory" && findingMetadata.known_exploited
      ? "已知在野利用 · 精确 CVE 证据"
      : finding.evidence_type === "dependency_advisory" && findingMetadata.exposure_status === "version_matched_reachability_unknown"
      ? "依赖版本命中 · 可达性待确认"
      : finding.evidence_type === "dependency_advisory" && findingMetadata.reachability === "imported"
      ? "依赖已被项目导入 · 漏洞路径待确认"
      : finding.evidence_type === "dependency_advisory"
      ? "依赖漏洞情报"
      : finding.verification_status === "confirmed"
      ? "已确认非阻断质量项"
      : "待复核候选";
    var dependencyUsage = findingMetadata.dependency_usage || {};
    var dependencyUsageSamples = Array.isArray(dependencyUsage.source_samples) ? dependencyUsage.source_samples : [];
    var dependencyDeclaration = findingMetadata.dependency_declaration || {};
    var dependencyManifestSamples = Array.isArray(dependencyDeclaration.manifest_samples) ? dependencyDeclaration.manifest_samples : [];
    var dependencyThreatIntelligence = findingMetadata.threat_intelligence || {};
    var dependencyKev = dependencyThreatIntelligence.cisa_kev || {};
    var dependencyEpss = dependencyThreatIntelligence.first_epss || {};
    var dependencyRelationLabels = { direct_runtime: "组件直接生产依赖", direct_optional: "组件直接可选依赖", direct_peer: "组件直接对等依赖", direct_provided: "组件直接提供型依赖", direct_build: "组件直接构建依赖", direct_development: "组件直接开发或测试依赖", declared_indirect: "清单明确标记的间接依赖", declared_requirement: "需求文件中已声明，直接性未知", constraint_only: "仅在版本约束文件中出现", version_catalog: "仅在集中版本目录中声明" };
    var reachabilityLabels = { reachable: "漏洞调用路径已确认可达", called: "漏洞调用路径已确认调用", executed: "漏洞路径已确认执行", imported: "项目源码已直接导入该依赖，漏洞函数可达性未知", not_called: "调用分析未发现漏洞函数被调用", unknown: "仅确认版本命中，可达性未知" };
    var dependencyUsageMarkup = finding.evidence_type === "dependency_advisory" && findingMetadata.reachability === "imported" ? '<div class="dependency-usage-evidence"><p><strong>项目使用证据：</strong>在 ' + Number(dependencyUsage.occurrence_count || dependencyUsageSamples.length) + ' 处源码导入中匹配到该依赖。此证据用于提高处置优先级，不代表漏洞函数或攻击路径可达。</p>' + (dependencyUsageSamples.length ? '<ul>' + dependencyUsageSamples.map(function (sample) { var sampleLabel = String(sample.file_path || ".") + ':' + Number(sample.line || 1); return '<li>' + (sample.web_url ? '<a class="code-quality-source-link" href="' + escapeHtml(String(sample.web_url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(sampleLabel) + icon("external-link") + '</a>' : '<span>' + escapeHtml(sampleLabel) + '</span>') + (sample.import_name ? ' · <code>' + escapeHtml(String(sample.import_name)) + '</code>' : '') + '</li>'; }).join("") + '</ul>' : '') + '</div>' : '';
    var dependencyDeclarationMarkup = finding.evidence_type === "dependency_advisory" && dependencyDeclaration.relation ? '<div class="dependency-usage-evidence dependency-declaration-evidence"><p><strong>依赖关系证据：</strong>' + escapeHtml(dependencyRelationLabels[String(dependencyDeclaration.relation)] || String(dependencyDeclaration.relation)) + '。该关系用于确定升级和复核顺序，不代表漏洞函数或运行时攻击路径可达。</p>' + (dependencyManifestSamples.length ? '<ul>' + dependencyManifestSamples.map(function (sample) { var sampleLabel = String(sample.manifest_path || ".") + ':' + Number(sample.line || 1); return '<li>' + (sample.web_url ? '<a class="code-quality-source-link" href="' + escapeHtml(String(sample.web_url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(sampleLabel) + icon("external-link") + '</a>' : '<span>' + escapeHtml(sampleLabel) + '</span>') + (sample.source_kind ? ' · <code>' + escapeHtml(String(sample.source_kind)) + '</code>' : '') + '</li>'; }).join("") + '</ul>' : '') + '</div>' : '';
    var dependencyThreatMarkup = finding.evidence_type === "dependency_advisory" && (dependencyKev.cve || dependencyEpss.cve) ? '<div class="dependency-usage-evidence dependency-threat-evidence">' + (dependencyKev.cve ? '<p><strong>CISA 已知在野利用：</strong>' + escapeHtml(String(dependencyKev.cve)) + (dependencyKev.date_added ? ' · 收录 ' + escapeHtml(String(dependencyKev.date_added)) : '') + (dependencyKev.due_date ? ' · 建议期限 ' + escapeHtml(String(dependencyKev.due_date)) : '') + '。这是精确 CVE 命中，可参与高危且已有修复版本的质量准入。</p>' + (dependencyKev.required_action ? '<p>官方处置建议：' + escapeHtml(String(dependencyKev.required_action)) + '</p>' : '') : '') + (dependencyEpss.cve ? '<p><strong>FIRST EPSS 概率排序：</strong>未来 30 天利用概率 ' + (Math.round(Number(dependencyEpss.probability || 0) * 10000) / 100) + '% · 百分位 ' + (Math.round(Number(dependencyEpss.percentile || 0) * 10000) / 100) + '%。该模型只提高复核优先级，绝不单独阻断。</p>' : '') + '</div>' : '';
    var dependencyMarkup = finding.evidence_type === "dependency_advisory" ? '<section><h3>依赖风险判定</h3><p>依赖：' + escapeHtml(String(findingMetadata.package || "--")) + ' ' + escapeHtml(String(findingMetadata.installed_version || "")) + (findingMetadata.fixed_version ? ' · 可升级至 ' + escapeHtml(String(findingMetadata.fixed_version)) : '') + '</p><p>证据状态：' + escapeHtml(reachabilityLabels[String(findingMetadata.reachability || "unknown")] || String(findingMetadata.reachability || "unknown")) + (findingMetadata.cvss_score != null ? ' · CVSS ' + Number(findingMetadata.cvss_score) : '') + '。版本命中证明依赖受影响，不自动等同于当前业务路径可利用。</p>' + dependencyThreatMarkup + dependencyDeclarationMarkup + dependencyUsageMarkup + '</section>' : '';
    var corroborationDetails = findingMetadata.corroboration || {};
    var advisoryCorroboration = findingMetadata.advisory_corroboration || {};
    var corroborationMarkup = Number(corroborationDetails.source_count || 0) >= 2 ? '<section><h3>多引擎根因关联</h3><p>' + (advisoryCorroboration.status === "matched" ? Number(corroborationDetails.source_count || 0) + ' 个独立漏洞情报源对同一依赖、版本和公告给出一致结论：' + escapeHtml((corroborationDetails.sources || []).join("、")) + '。报告已合并为一条证据，避免重复计数；可达性仍需单独确认。' : Number(corroborationDetails.source_count || 0) + ' 个独立引擎在相邻代码位置给出同一分类或相同代码证据：' + escapeHtml((corroborationDetails.sources || []).join("、")) + '。完整报告按一个重点根因展示，但原始结果分别保留。') + '</p></section>' : '';
    var assessmentMarkup = evidenceAssessment.label ? '<section><h3>证据强度</h3><p><strong>' + escapeHtml(String(evidenceAssessment.label)) + ' · ' + Number(evidenceAssessment.score || 0) + '/100</strong></p><ul>' + (Array.isArray(evidenceAssessment.factors) ? evidenceAssessment.factors.map(function (item) { return '<li>' + escapeHtml(String(item)) + '</li>'; }).join("") : '') + '</ul></section>' : '';
    var dataflow = findingMetadata.dataflow_trace || {};
    var dataflowMarkup = dataflow.available && Array.isArray(dataflow.steps) ? '<section><h3>代码数据流</h3><p>扫描器给出了从输入到风险点的 ' + Number(dataflow.step_count || dataflow.steps.length) + ' 步路径：</p><ol class="quality-dataflow">' + dataflow.steps.map(function (step) { return '<li><b>' + escapeHtml(String(step.role || "trace")) + '</b><span>' + escapeHtml(String(step.file_path || finding.file_path || ".")) + ':' + Number(step.line || 1) + '</span>' + (step.content ? '<code>' + escapeHtml(String(step.content)) + '</code>' : '') + '</li>'; }).join("") + '</ol></section>' : '';
    var triageAuditMarkup = finding.triaged_at || finding.triage_reason ? '<div class="code-quality-triage-audit' + (finding.triage_expired ? ' is-expired' : '') + '"><strong>' + (finding.triage_expired ? '风险接受已到期，问题重新进入门禁' : '最近处置记录') + '</strong><span>' + escapeHtml(finding.triaged_by_name || "系统") + ' · ' + escapeHtml(formatTime(finding.triaged_at)) + '</span>' + (finding.triage_reason ? '<p>' + escapeHtml(finding.triage_reason) + '</p>' : '') + (finding.triage_expires_at ? '<small>有效期至 ' + escapeHtml(formatTime(finding.triage_expires_at)) + '</small>' : '') + '</div>' : '';
    var triageMaxDays = Number(policy && policy.limits && policy.limits.risk_acceptance_max_days || 180);
    var triageFormMarkup = triageDraftStatus ? '<div class="code-quality-triage-form"><label><span>处置依据 <em>必填，至少 ' + Number(policy && policy.limits && policy.limits.triage_reason_min_length || 10) + ' 个字符</em></span><textarea data-quality-triage-reason maxlength="1000" placeholder="说明验证过程、业务影响、补偿控制或误报依据">' + escapeHtml(triageDraftReason) + '</textarea></label>' + (triageDraftStatus === "accepted_risk" ? '<label><span>风险接受到期日 <em>最长 ' + triageMaxDays + ' 天</em></span><input type="date" data-quality-triage-expiry min="' + localDateAfter(1) + '" max="' + localDateAfter(triageMaxDays) + '" value="' + escapeHtml(triageDraftExpiresOn || localDateAfter(30)) + '"></label>' : '') + '<div><button type="button" data-quality-triage-cancel>取消</button><button type="button" class="is-primary" data-quality-triage-confirm' + (triageSaving ? ' disabled' : '') + '>' + (triageSaving ? '正在保存…' : '确认并留痕') + '</button></div></div>' : '';
    return '<div class="code-quality-drawer-backdrop" data-quality-close-drawer><aside class="code-quality-drawer" role="dialog" aria-modal="true" aria-label="问题详情" onclick="event.stopPropagation()"><header><div><b class="severity-' + escapeHtml(finding.severity) + '">' + severityLabel(finding.severity) + '</b><span>' + escapeHtml(categoryLabel(finding.category)) + '</span></div><button type="button" data-quality-close-drawer aria-label="关闭">' + icon("x") + '</button></header>' +
      '<div class="code-quality-drawer-body"><p class="code-quality-rule-id">' + escapeHtml(finding.rule_id) + ' · 置信度 ' + escapeHtml(finding.confidence) + ' · ' + escapeHtml(evidenceLabel) + '</p><h2>' + escapeHtml(findingDisplayTitle(finding)) + '</h2><p>' + escapeHtml(finding.description) + '</p>' +
      '<section><h3>问题位置</h3>' + locationMarkup + (finding.snippet ? '<pre><code>' + escapeHtml(finding.snippet) + '</code></pre>' : '') + '</section>' +
      dependencyMarkup +
      assessmentMarkup +
      dataflowMarkup +
      corroborationMarkup +
      '<section><h3>修复建议</h3><p>' + escapeHtml(finding.remediation || "请由项目负责人确认并制定修复方案。") + '</p></section>' +
      '<section><h3>处理状态</h3>' + triageAuditMarkup + '<div class="code-quality-triage-actions">' + statuses.map(function (item) {
        return '<button type="button" data-quality-triage="' + item.value + '" class="' + (finding.triage_status === item.value ? "active" : "") + '">' + item.label + '</button>';
      }).join("") + '</div>' + triageFormMarkup + '<small>误报和接受风险仅管理员可操作，必须填写依据；风险接受到期后自动重新进入质量准入，所有状态变化均保留审计记录。</small></section></div></aside></div>';
  }

  function benchmarkLanguageMarkup(benchmark) {
    var coverage = benchmark && benchmark.coverage || {};
    var gates = Array.isArray(coverage.language_gates) ? coverage.language_gates : [];
    if (!gates.length) return "";
    var statusLabels = { passed: "已认证", failed: "未达标", missing: "缺少真值集" };
    return '<div class="policy-tags benchmark-language-gates">' + gates.map(function (item) {
      var status = String(item && item.status || "missing");
      var cases = Number(item && item.cases || 0);
      return '<span>' + escapeHtml(String(item && item.language || "未知技术栈")) + ' · ' + escapeHtml(statusLabels[status] || "未认证") + (cases ? ' · ' + cases + ' 例' : '') + '</span>';
    }).join("") + '</div>';
  }

  function renderPolicyDialog() {
    if (dialog !== "policy") return "";
    var currentPolicy = policy || {};
    var rules = currentPolicy.rules || {};
    var gate = currentPolicy.gate || {};
    var limits = currentPolicy.limits || {};
    var reportQuality = currentPolicy.report_quality || {};
    var benchmark = currentPolicy.benchmark_validation || {};
    var benchmarkLabel = benchmark.status === "verified" ? (benchmark.signature_verified ? "基准与签名已验证" : "基准已验证（未签名）") : benchmark.status === "expired" ? "验证已过期" : benchmark.status === "signature_invalid" ? "签名无效" : "尚未验证";
    var benchmarkSignatureLabel = benchmark.signature_verified ? "Ed25519 签名已验证" : benchmark.signature_required ? "生产签名未通过" : "当前环境未强制签名";
    var categories = rules.category_counts || {};
    return '<div class="code-quality-modal-backdrop" data-quality-close-modal><section class="code-quality-modal" role="dialog" aria-modal="true" aria-labelledby="quality-policy-title" onclick="event.stopPropagation()"><header><div><span class="modal-icon">' + icon("sliders-horizontal") + '</span><div><h2 id="quality-policy-title">质检策略</h2><p>' + escapeHtml(currentPolicy.description || "平台内置只读质检策略") + '</p></div></div><button type="button" data-quality-close-modal aria-label="关闭">' + icon("x") + '</button></header><div class="code-quality-modal-body">' +
      '<div class="policy-summary"><article><small>策略版本</small><strong>v' + escapeHtml(currentPolicy.version || "--") + '</strong></article><article><small>启用规则</small><strong>' + Number(rules.count || 0) + ' 条</strong></article><article><small>质量门禁</small><strong>' + (gate.enabled === false ? "未启用" : "已启用") + '</strong></article><article><small>准确性状态</small><strong>' + benchmarkLabel + '</strong></article></div>' +
      '<section class="policy-section"><h3>' + icon("shield-alert") + '门禁规则</h3><p>严重/高危问题仍需具备可复现证据才阻断。依赖版本命中会进入报告，但默认只有确认代码可达，或通过精确 CVE 命中 CISA KEV 的已知在野利用时才阻断；FIRST EPSS 只排序，绝不单独阻断。启发式候选只进入人工复核。必需扫描器未完成时，不生成通过结论。</p></section>' +
      '<section class="policy-section"><h3>' + icon("clipboard-check") + '处置治理</h3><p>' + escapeHtml(reportQuality.triage_audit || "误报和接受风险必须记录依据与操作者；接受风险必须限期，到期后自动重新进入门禁，所有状态变化保留审计记录。") + '</p><div class="policy-tags"><span>强制处置依据</span><span>限期风险接受</span><span>到期自动重开</span><span>SARIF 保留抑制记录</span></div></section>' +
      '<section class="policy-section"><h3>' + icon("shield-check") + '准确性验证</h3><p>' + escapeHtml(benchmark.reason || "当前未配置与本规则版本绑定的标注集评测证明，不会伪装成已验证") + '；每个要求技术栈都必须独立达到 Precision、Recall、F1 与零误阻断阈值，总体高分不能替代单语言认证。该证明不代表静态扫描可以发现业务逻辑问题。</p><div class="policy-tags"><span>状态 ' + escapeHtml(benchmarkLabel) + '</span><span>' + escapeHtml(benchmarkSignatureLabel) + '</span><span>有效期 ' + Number(benchmark.max_age_days || 30) + ' 天</span>' + (benchmark.suite_count ? '<span>标注集 ' + Number(benchmark.suite_count) + ' 套</span>' : '') + '</div>' + benchmarkLanguageMarkup(benchmark) + '</section>' +
      '<section class="policy-section"><h3>' + icon("bar-chart-3") + '针对性检查</h3><p>平台先识别项目类型、语言、框架和前后端组件，再选择适用扫描器与规则；不适用的语言工具会跳过，不会把“没运行”伪装成“没有问题”。大仓库只把共享索引筛出的源码交给独立引擎并行处理：Semgrep 负责语义安全，Trivy 与 OSV 对依赖漏洞进行交叉佐证，Biome 只保留高信号 Web 正确性规则，PMD 只在 Java 项目运行固定错误与并发规则，Staticcheck 只在 Go 模块运行 SA 正确性规则，jscpd 用严格 Token 匹配计算重复度。平台会只读解析 npm、PyPI、Maven/Gradle、Go、Cargo、Composer、NuGet 和 RubyGems 项目清单，按组件目录区分直接生产、开发构建、明确间接和仅约束关系；未匹配保持未知，不会跨子项目套用。平台还会对 Python、Node、Java、Go 建立有界的只读导入索引，并在外部扫描运行期间并行完成；发现源码直接导入时提高依赖情报的复核优先级，但不会把“导入包”误写成“漏洞函数可达”，未匹配也不会被解释成项目未使用该依赖。平台先把 Semgrep 官方 registry 或本地规则转成内容寻址快照，再让引擎执行同一份字节，因此报告摘要与实际规则严格一致；官方快照使用 ETag 刷新，网络异常时只允许近期已验证快照，过期快照不会产生完整结论。跨提交复用同时校验文件内容、路径、引擎版本和规则快照，只重扫变化文件。只有文件数、总代码量和非空白语义代码量同时超过阈值的真正超大仓库才启用均衡分片和受控并发；小而多的仓库继续使用更快的原生多核单进程。分片失败时整体报告保持不完整，但已完成文件会形成安全续跑证据，下次只重试缺失部分。确定性语法解析缺口可短期复用但继续标记不完整，超时、未知范围、明细截断、缺少目标完成证据和真正失败绝不作为完成证据缓存。</p><div class="policy-tags">' + Object.keys(categories).map(function (key) { return '<span>' + escapeHtml(categoryLabel(key)) + ' ' + Number(categories[key]) + '</span>'; }).join("") + '</div></section>' +
      '<section class="policy-section"><h3>' + icon("shield-check") + '免费漏洞利用情报</h3><p>' + escapeHtml(reportQuality.threat_intelligence || "只通过精确 CVE 关联 CISA KEV 与 FIRST EPSS；KEV 表示已有在野利用证据，EPSS 只是未来 30 天利用概率模型。情报快照使用内容摘要和本地缓存，情报不可用不会被解释成没有风险。") + '</p><div class="policy-tags"><span>CISA KEV 精确匹配</span><span>FIRST EPSS 只排序</span><span>免费公开数据</span><span>离线快照</span></div></section>' +
      '<section class="policy-section"><h3>' + icon("git-branch") + 'CI 运行证据</h3><p>平台只读查询与本次扫描 Commit 完全一致的 GitLab Pipeline、Job、覆盖率和标准 JUnit 汇总，不下载构建产物，也不执行项目代码。同提交的失败流水线或失败测试属于可复现质量阻断；没有 Pipeline 或测试报告时明确标为“未验证”，不会伪造成通过。CI 状态变化会自动使旧缓存失效。</p></section>' +
      '<section class="policy-section"><h3>' + icon("git-compare-arrows") + '新增代码门禁</h3><p>选择“新增代码门禁”后，平台仍扫描完整仓库并保留全部历史问题，只把目标分支 merge-base 之后的新增或修改行、变更文件度量、仓库级状态和同提交 CI 证据用于本次质量准入。GitLab Compare 超时、折叠、超限或目标分支不可用时，系统自动回退全量门禁，绝不会用残缺 diff 给出通过结论。</p><div class="policy-tags"><span>全量报告</span><span>变更范围门禁</span><span>证据不足回退全量</span></div></section>' +
      '<section class="policy-section"><h3>' + icon("git-branch") + 'GitLab 合并请求协作</h3><p>完成报告可导出标准 SARIF 2.1.0，供 reviewdog 在 CI 中按新增代码行发布 GitLab MR 讨论。平台默认不会自动评论，也不会保存或展示 MR 写入令牌。</p><div class="policy-tags"><span>SARIF 2.1.0</span><span>reviewdog 兼容</span><span>默认只读</span></div></section>' +
      '<section class="policy-section"><h3>' + icon("git-branch") + '报告降噪</h3><ul><li>' + escapeHtml(reportQuality.stable_identity || "使用稳定指纹跟踪跨提交问题") + '</li><li>' + escapeHtml(reportQuality.cross_scan_lifecycle || "仅在规则、引擎和扫描覆盖可比时生成问题生命周期趋势") + '</li><li>' + escapeHtml(reportQuality.conservative_correlation || "仅聚合证据明确一致的多引擎结果") + '</li><li>' + escapeHtml(reportQuality.root_cause_summary || "管理报告按根因呈现并保留原始证据") + '</li><li>' + escapeHtml(reportQuality.evidence_assessment || "按证据类型和可达性标注证据强度") + '</li><li>' + escapeHtml(reportQuality.coverage_matrix || "明确展示适用检查和未覆盖范围") + '</li></ul></section>' +
      '<section class="policy-section"><h3>' + icon("circle-help") + '不在扫描范围</h3><p>' + escapeHtml(reportQuality.secret_scanning || "不执行凭据或密钥发现；本功能聚焦代码缺陷、依赖、配置、测试和可维护性。") + '</p></section>' +
      '<section class="policy-section"><h3>' + icon("lock-keyhole") + '安全限制</h3><ul><li>只读下载仓库归档，不执行项目脚本</li><li>最多扫描 ' + Number(limits.max_files || 0).toLocaleString("zh-CN") + ' 个文件，单文件上限 ' + escapeHtml(formatBytes(limits.single_file_bytes)) + '</li><li>报告中的敏感值仅保留脱敏片段</li></ul></section>' +
      '<section class="policy-section"><h3>' + icon("brain-circuit") + '智能复核</h3><p>' + escapeHtml(currentPolicy.ai_review && currentPolicy.ai_review.description || "AI 只辅助解释，不直接判定门禁。") + '</p></section>' +
      '</div><footer><span>策略由平台版本统一管理，变更后会生成新版本。</span><button type="button" data-quality-close-modal>我知道了</button></footer></section></div>';
  }

  function renderReportDialog() {
    if (dialog !== "report" || !scan) return "";
    var outdated = isOutdatedScan();
    var summary = scan.summary || {};
    var counts = summary.severity_counts || {};
    var limitations = scan.report && Array.isArray(scan.report.limitations) ? scan.report.limitations : [];
    var enginePayload = scan.report && scan.report.engine || {};
    var engines = (Array.isArray(enginePayload.internal_scanners) ? enginePayload.internal_scanners : []).concat(Array.isArray(enginePayload.external_scanners) ? enginePayload.external_scanners : []);
    var profile = scan.report && scan.report.project_profile || {};
    var benchmark = scan.report && scan.report.benchmark_validation || {};
    var newCodeEvidence = scan.report && scan.report.new_code_evidence || {};
    var baseline = scan.report && scan.report.baseline || {};
    var lifecycle = scan.report && scan.report.quality_lifecycle || {};
    var ciEvidence = scan.report && scan.report.ci_evidence || {};
    var ciPipeline = ciEvidence.pipeline || {};
    var ciTests = ciEvidence.tests || {};
    var ciJobs = ciEvidence.jobs || {};
    var coreReport = scan.report && scan.report.core_report || {};
    var coreCounts = coreReport.core_counts || {};
    var semanticValidation = scan.report && scan.report.performance && scan.report.performance.external_cache && scan.report.performance.external_cache.semantic_validation || {};
    var scheduler = scan.report && scan.report.performance && scan.report.performance.external_cache && scan.report.performance.external_cache.scheduler || {};
    var threatSnapshot = scan.report && scan.report.provenance && scan.report.provenance.threat_intelligence || {};
    var threatSources = threatSnapshot.sources || {};
    var rootCauses = Array.isArray(coreReport.root_cause_clusters) ? coreReport.root_cause_clusters : [];
    var governedFindings = (Array.isArray(scan.findings) ? scan.findings : []).filter(function (item) {
      return ["accepted_risk", "false_positive"].includes(String(item.triage_recorded_status || item.triage_status || "open"));
    });
    var reportAssurance = coreReport.report_assurance || {};
    var assuranceDimensions = Array.isArray(reportAssurance.dimensions) ? reportAssurance.dimensions : [];
    var qualityScoreAvailable = summary.scan_complete !== false && summary.quality_score_available !== false;
    var newCodeGate = summary.gate_scope === "new_code";
    var schedulerExhausted = Number(scheduler.budget_exhausted_count || 0);
    var schedulerOptionalSkipped = Number(scheduler.optional_budget_skipped_count || 0);
    var schedulerRequiredExhausted = scheduler.required_budget_exhausted_count == null
      ? null
      : Number(scheduler.required_budget_exhausted_count || 0);
    var schedulerStatusParts = [];
    if (schedulerOptionalSkipped) {
      schedulerStatusParts.push(schedulerOptionalSkipped + " 个可选引擎因剩余时间不足以形成有效结果而未启动，已保留覆盖缺口。");
    }
    if (schedulerExhausted) {
      schedulerStatusParts.push("累计 " + schedulerExhausted + " 个引擎因预算限制未形成完整结果。");
      if (schedulerRequiredExhausted == null) {
        schedulerStatusParts.push("该历史记录未区分必需与可选引擎，请按门禁不完整处理。");
      } else if (schedulerRequiredExhausted) {
        schedulerStatusParts.push("其中 " + schedulerRequiredExhausted + " 个是必需引擎，质量准入证据不完整。");
      } else {
        schedulerStatusParts.push("必需门禁引擎未因预算耗尽而缺失。");
      }
    } else if (!schedulerOptionalSkipped) {
      schedulerStatusParts.push("没有引擎因总预算耗尽而被跳过。");
    }
    var schedulerStatusText = schedulerStatusParts.join("");
    var schedulerRuntime = scheduler.runtime_model || {};
    var schedulerHistoricalPredictions = Number(schedulerRuntime.historical_prediction_count || 0);
    var schedulerColdStartPredictions = Number(schedulerRuntime.cold_start_prediction_count || 0);
    var schedulerRuntimeText = schedulerRuntime.version
      ? "耗时模型：" + schedulerHistoricalPredictions + " 个引擎使用跨项目同规模历史预测，" + schedulerColdStartPredictions + " 个使用冷启动保守值。"
      : "";
    var projectTypeLabels = { fullstack: "全栈应用", frontend: "前端应用", backend: "后端服务", infrastructure: "基础设施项目", "multi-component": "多组件项目", library: "代码库", unknown: "待确认" };
    var frameworkLabel = Array.isArray(profile.frameworks) && profile.frameworks.length ? profile.frameworks.join("、") : "未识别到框架";
    var riskFocus = Array.isArray(profile.risk_focus) ? profile.risk_focus : [];
    var rootCauseMarkup = rootCauses.length ? '<section class="report-section report-root-cause-section"><h3>重点根因 <small>重复证据已合并</small></h3><div class="report-root-causes">' + rootCauses.slice(0, 5).map(function (item) {
      var taxonomy = item && item.taxonomy || {};
      var standards = (Array.isArray(taxonomy.cwe) ? taxonomy.cwe : []).concat(Array.isArray(taxonomy.cve) ? taxonomy.cve : []);
      var sources = Array.isArray(item.sources) ? item.sources : [];
      return '<article><div><span>' + escapeHtml(String(item.domain_label || "质量风险")) + '</span><b>' + Number(item.source_count || 0) + ' 个引擎一致</b></div><strong>' + escapeHtml(String(item.title || "代码质量问题")) + '</strong><p>' + escapeHtml(String(item.location || "项目级检查")) + (standards.length ? ' · ' + escapeHtml(standards.join("、")) : '') + '</p><small>合并 ' + Number(item.finding_count || 0) + ' 条原始结果 · ' + escapeHtml(sources.join("、") || "来源待确认") + '</small></article>';
    }).join("") + '</div></section>' : '';
    var dependencyEvidenceMarkup = Number(coreCounts.dependency_advisories || 0) ? '<section class="report-section report-dependency-evidence"><h3>依赖漏洞与项目关联 <small>清单与源码证据</small></h3><p>版本命中共 ' + Number(coreCounts.dependency_advisories || 0) + ' 项；其中 ' + Number(coreCounts.direct_runtime_dependency_advisories || 0) + ' 项是组件直接生产依赖，' + Number(coreCounts.direct_development_dependency_advisories || 0) + ' 项是直接构建、开发或测试依赖，' + Number(coreCounts.indirect_dependency_advisories || 0) + ' 项由清单明确标记为间接依赖，' + Number(coreCounts.imported_dependency_advisories || 0) + ' 项在源码中发现导入，' + Number(coreCounts.reachable_dependency_advisories || 0) + ' 项由调用分析确认可达。依赖关系和源码导入只用于提高复核优先级，不等同于漏洞函数可达。</p></section>' : '';
    var threatStatusLabels = { fresh: "快照有效", stale: "使用宽限期内缓存", partial: "部分情报源可用", unavailable: "情报不可用", disabled: "未启用" };
    var threatIntelligenceMarkup = threatSnapshot.enabled ? '<section class="report-section report-threat-intelligence"><h3>漏洞利用优先级情报 <small>' + escapeHtml(threatStatusLabels[threatSnapshot.status] || String(threatSnapshot.status || "待确认")) + '</small></h3><p>通过精确 CVE 标识发现 ' + Number(coreCounts.cisa_kev_dependency_advisories || 0) + ' 项依赖漏洞已列入 CISA 已知在野利用目录；' + Number(coreCounts.high_epss_dependency_advisories || 0) + ' 项达到 FIRST EPSS 优先复核阈值。CISA KEV 可参与高危且已有修复版本的门禁；EPSS 是未来 30 天利用概率模型，只用于排序，绝不单独阻断。</p><div class="policy-tags"><span>CISA KEV ' + escapeHtml(threatSources.cisa_kev && threatSources.cisa_kev.published_at || "日期不可用") + '</span><span>FIRST EPSS ' + escapeHtml(threatSources.first_epss && threatSources.first_epss.published_at || "日期不可用") + '</span><span>精确 CVE 匹配</span></div>' + (threatSnapshot.status === "partial" || threatSnapshot.status === "unavailable" ? '<p class="report-scope-note">情报源未完整可用；未匹配不能解释为没有在野利用。</p>' : '') + '</section>' : '';
    var assuranceStatusLabels = { covered: "已覆盖", partial: "部分覆盖", failed: "执行失败", unavailable: "不可用", not_enabled: "未启用", not_applicable: "不适用" };
    var assuranceMarkup = assuranceDimensions.length ? '<section class="report-section report-assurance-section"><h3>报告证据覆盖 <small>' + Number(reportAssurance.evidence_coverage_percent || 0) + '% · ' + escapeHtml(String(reportAssurance.label || "待判断")) + '</small></h3><p>' + escapeHtml(String(reportAssurance.interpretation || "该数值表示自动化检查证据覆盖程度，不是代码质量分。")) + '</p><div class="report-assurance-grid">' + assuranceDimensions.filter(function (item) { return item.applicable; }).map(function (item) { return '<article class="assurance-' + escapeHtml(String(item.status || "not_enabled")) + '"><div><strong>' + escapeHtml(String(item.label || item.name || "检查项")) + '</strong><b>' + escapeHtml(assuranceStatusLabels[item.status] || String(item.status || "待判断")) + '</b></div><span>覆盖 ' + Number(item.coverage_percent || 0) + '% · ' + (item.required ? "必需检查" : "增强检查") + '</span><small>' + escapeHtml(String(item.reason || "按项目画像自动选择")) + '</small></article>'; }).join("") + '</div></section>' : '';
    var benchmarkMarkup = '<section class="report-section"><h3>规则准确性证明 <small>' + (benchmark.verified ? (benchmark.signature_verified ? "已验签" : "已验证·未签名") : "未验证") + '</small></h3><p>' + escapeHtml(benchmark.reason || "本报告没有与当前扫描器和规则摘要严格绑定的有效标注集证明，因此不宣称已达到已知准确率。") + '</p>' + (benchmark.metrics ? '<div class="policy-tags"><span>总体 Precision ' + (benchmark.metrics.precision == null ? "--" : Math.round(Number(benchmark.metrics.precision) * 1000) / 10 + "%") + '</span><span>总体 Recall ' + (benchmark.metrics.recall == null ? "--" : Math.round(Number(benchmark.metrics.recall) * 1000) / 10 + "%") + '</span><span>误阻断 ' + Number(benchmark.metrics.false_blocker_count || 0) + '</span><span>' + (benchmark.signature_verified ? "Ed25519 签名有效" : benchmark.signature_required ? "生产签名未通过" : "未要求签名") + '</span></div>' : '') + benchmarkLanguageMarkup(benchmark) + '<p class="report-scope-note">逐技术栈独立验证；缺少或未达标的语言明确标为未认证，不能被总体分数掩盖。</p></section>';
    var semanticValidationMarkup = Number(semanticValidation.semantic_candidate_count || 0) ? '<section class="report-section report-semantic-validation"><h3>语义复核与降噪 <small>' + escapeHtml(String(semanticValidation.policy || "按当前规则")) + '</small></h3><p>宽泛危险 API 候选会先判断是否存在可信来源到危险汇点。完整外部轨迹仍属于单引擎复核证据，不会自动升级为质量阻断。</p><div class="policy-tags"><span>候选 ' + Number(semanticValidation.semantic_candidate_count || 0) + '</span><span>内置独立佐证 ' + Number(semanticValidation.builtin_corroborated_finding_count || 0) + '</span><span>完整数据流轨迹 ' + Number(semanticValidation.external_trace_retained_finding_count || 0) + '</span><span>未二次验证 ' + Number(semanticValidation.not_evaluated_finding_count || 0) + '</span><span>已降噪 ' + Number(semanticValidation.suppressed_finding_count || 0) + '</span></div></section>' : '';
    var schedulerMemory = scheduler.memory || {};
    var schedulerMarkup = scheduler.strategy ? '<section class="report-section report-scheduler"><h3>扫描时效控制 <small>必需引擎保留资源 · 可选引擎按成本准入</small></h3><p>外部检查共享 ' + Number(scheduler.total_budget_seconds || 0) + ' 秒截止时间，并发 ' + Number(scheduler.workers || 0) + '，CPU 预算 ' + Number(scheduler.cpu_budget || 0) + '，内存预算 ' + Number(scheduler.memory_budget_mb || 0) + ' MiB（峰值预留 ' + Number(schedulerMemory.peak_reserved_mb || 0) + ' MiB）；最长 Worker 排队 ' + escapeHtml(formatDuration(Number(scheduler.max_queue_wait_ms || 0))) + '，最长内存等待 ' + escapeHtml(formatDuration(Number(scheduler.max_memory_wait_ms || 0))) + '；实际耗时 ' + escapeHtml(formatDuration(Number(scheduler.duration_ms || 0))) + '。' + escapeHtml(schedulerRuntimeText) + escapeHtml(schedulerStatusText) + '</p></section>' : '';
    var ciDecisionLabels = { verified_passed: "已验证通过", verified_failed: "已验证失败", pipeline_passed_tests_unverified: "流水线通过，测试未验证", in_progress: "运行中", inconclusive: "未形成结论", no_pipeline: "未找到同提交流水线", unavailable: "证据不可用" };
    var failedCiJobs = Array.isArray(ciJobs.failed_required) ? ciJobs.failed_required : [];
    var pipelineUrl = /^https?:\/\//i.test(String(ciPipeline.web_url || "")) ? String(ciPipeline.web_url) : "";
    var ciMarkup = '<section class="report-section report-ci-evidence"><h3>CI 与测试证据 <small>' + escapeHtml(ciDecisionLabels[ciEvidence.decision] || "未验证") + '</small></h3><p>' + escapeHtml(ciEvidence.summary || "未读取到与本次 Commit 严格一致的 GitLab 构建和测试证据；这不等同于已通过。") + '</p><div class="policy-tags"><span>Commit ' + escapeHtml(ciEvidence.commit_match ? "已匹配" : "未验证") + '</span><span>Pipeline ' + escapeHtml(ciPipeline.status || "--") + '</span><span>测试 ' + (ciTests.available ? Number(ciTests.count || 0) + ' 项 / 失败 ' + Number(ciTests.unsuccessful || 0) : "未提供 JUnit") + '</span><span>覆盖率 ' + (ciPipeline.coverage == null ? "--" : Number(ciPipeline.coverage) + "%") + '</span></div>' + (failedCiJobs.length ? '<ul>' + failedCiJobs.slice(0, 5).map(function (job) { return '<li>失败 Job：' + escapeHtml(String(job.stage || "unknown")) + ' / ' + escapeHtml(String(job.name || "未命名")) + '</li>'; }).join("") + '</ul>' : '') + (pipelineUrl ? '<a class="report-ci-link" href="' + escapeHtml(pipelineUrl) + '" target="_blank" rel="noopener noreferrer">打开 GitLab Pipeline ' + icon("external-link") + '</a>' : '') + '</section>';
    var compareUrl = /^https?:\/\//i.test(String(baseline.compare_web_url || newCodeEvidence.web_url || "")) ? String(baseline.compare_web_url || newCodeEvidence.web_url) : "";
    var newCodeMarkup = scan.scan_mode === "incremental"
      ? baseline.available
        ? '<section class="report-section report-new-code-evidence"><h3>新增代码门禁范围 <small>merge-base 已验证</small></h3><p>' + escapeHtml(baseline.interpretation || "完整仓库已扫描；本次质量准入只使用目标分支之后的新增或修改代码证据。") + '</p><div class="policy-tags"><span>目标分支 ' + escapeHtml(baseline.target_branch || "--") + '</span><span>变更文件 ' + Number(baseline.changed_file_count || 0) + '</span><span>变更代码 ' + Number(baseline.changed_line_count || 0) + ' 行</span><span>新增问题 ' + Number(baseline.new_count || 0) + '</span><span>新增阻断 ' + Number(baseline.new_blocker_count || 0) + '</span><span>全仓问题 ' + Number(summary.finding_count || 0) + '</span><span>门禁覆盖 ' + (summary.gate_scan_complete === false ? "不完整" : "完整") + '</span><span>全仓覆盖 ' + (summary.scan_complete === false ? "部分" : "完整") + '</span></div>' + (Array.isArray(summary.gate_scope_excluded_scanner_failures) && summary.gate_scope_excluded_scanner_failures.length ? '<p>以下扫描缺口仅位于未修改文件，不影响本次新增代码门禁：' + escapeHtml(summary.gate_scope_excluded_scanner_failures.join("、")) + '。全仓报告仍按“不完整”展示。</p>' : '') + (compareUrl ? '<a class="report-ci-link" href="' + escapeHtml(compareUrl) + '" target="_blank" rel="noopener noreferrer">打开 GitLab 变更比较 ' + icon("external-link") + '</a>' : '') + '</section>'
        : '<section class="report-section report-new-code-evidence is-fallback"><h3>新增代码范围 <small>已回退全量门禁</small></h3><p>' + escapeHtml(newCodeEvidence.summary || baseline.reason || "GitLab Compare 未形成完整证据，因此本次按全仓问题执行门禁。") + '</p></section>'
      : '';
    var lifecycleDirectionLabels = { improved: "风险收敛", stable: "保持稳定", degraded: "需要关注", unavailable: "暂不可比" };
    var lifecycleMarkup = lifecycle.available
      ? '<section class="report-section report-lifecycle"><h3>质量变化趋势 <small>' + escapeHtml(lifecycleDirectionLabels[lifecycle.direction] || "已完成比较") + '</small></h3><p>与报告 #' + Number(lifecycle.source_scan_id || 0) + '（Commit ' + escapeHtml(String(lifecycle.source_commit_sha || "--").slice(0, 12)) + '）' + (lifecycle.same_commit ? '的同一提交复核' : '的上一可比版本') + '相比。本节只描述检测结果变化，不改变本次质量准入结论。</p><div class="policy-tags"><span>新增检测 ' + Number(lifecycle.new_count || 0) + '</span><span>持续存在 ' + Number(lifecycle.persistent_count || 0) + '</span><span>已不再检测 ' + Number(lifecycle.resolved_count || 0) + '</span><span>重新出现 ' + Number(lifecycle.reopened_count || 0) + '</span><span>净变化 ' + (Number(lifecycle.net_finding_change || 0) > 0 ? "+" : "") + Number(lifecycle.net_finding_change || 0) + '</span></div><p class="report-scope-note">“新增检测”不等于由本次提交引入；规则覆盖、依赖漏洞情报或代码变化都可能使问题首次被检测。“已不再检测”也不等于修复已经完成，仍应结合修复记录确认。</p></section>'
      : '<section class="report-section report-lifecycle is-unavailable"><h3>质量变化趋势 <small>暂不可比</small></h3><p>' + escapeHtml(lifecycle.reason || "暂无规则、引擎及扫描覆盖都完全可比的历史报告；本次不会把全部问题误标为新增。") + '</p></section>';
    var governanceMarkup = '<section class="report-section report-triage-governance"><h3>处置与风险接受 <small>可审计治理记录</small></h3>' + (governedFindings.length ? '<p>以下问题仍保留在报告中。风险接受只在有效期内排除门禁，不代表问题已经修复；到期后会自动重新进入门禁。</p><ul>' + governedFindings.slice(0, 8).map(function (item) { var recorded = String(item.triage_recorded_status || item.triage_status || "open"); var location = String(item.file_path || "项目级检查") + ':' + Number(item.line || 1); var label = item.triage_expired ? "风险接受已到期" : recorded === "accepted_risk" ? "限期接受风险" : "已确认误报"; return '<li><strong>' + escapeHtml(label) + ' · ' + escapeHtml(findingDisplayTitle(item)) + '</strong><span>' + escapeHtml(location) + ' · ' + escapeHtml(item.triaged_by_name || "未记录责任人") + (item.triage_expires_at ? ' · 有效期至 ' + escapeHtml(formatTime(item.triage_expires_at)) : '') + '</span><small>' + escapeHtml(item.triage_reason || "未记录处置依据") + '</small></li>'; }).join("") + '</ul>' + (governedFindings.length > 8 ? '<p class="report-scope-note">另有 ' + (governedFindings.length - 8) + ' 项处置记录，请在问题清单中查看。</p>' : '') : '<p>本报告没有已确认误报或限期接受风险的处置记录。</p>') + '</section>';
    return '<div class="code-quality-modal-backdrop" data-quality-close-modal><section class="code-quality-modal report-modal" role="dialog" aria-modal="true" aria-labelledby="quality-report-title" onclick="event.stopPropagation()"><header><div><span class="modal-icon">' + icon("file-text") + '</span><div><h2 id="quality-report-title">完整质检报告</h2><p>' + escapeHtml(reportNumber()) + ' · ' + escapeHtml(currentProject() && currentProject().name || "项目") + '</p></div></div><button type="button" data-quality-close-modal aria-label="关闭">' + icon("x") + '</button></header><div class="code-quality-modal-body">' +
      '<div class="report-hero tone-' + (outdated ? "outdated" : scan.gate_status === "passed" ? "pass" : "fail") + '"><div>' + icon(outdated ? "history" : scan.gate_status === "passed" ? "shield-check" : "shield-alert") + '<span><small>质量结论</small><strong>' + (outdated ? "历史报告，不可作为当前准入依据" : newCodeGate ? scan.gate_status === "passed" ? "新增代码门禁通过" : "新增代码门禁未通过" : scan.gate_status === "passed" ? "质量门禁通过" : "质量门禁未通过") + '</strong></span></div><b>' + (qualityScoreAvailable ? Number(scan.score || 0) + '<small>/100</small>' : '--<small>扫描不完整不出分</small>') + '</b></div>' +
      (outdated ? '<section class="report-section report-history-notice"><h3>' + icon("circle-alert") + '报告提示</h3><p>这份报告由旧版规则生成，问题数和分数仅用于历史追溯，不代表当前代码仍存在相同风险。请下载 PDF 了解报告口径，并按当前规则重新扫描后再做质量决策。</p></section>' : '') +
      '<div class="report-facts"><div><span>项目 / 分支</span><strong>' + escapeHtml(currentProject() && currentProject().name || "--") + ' / ' + escapeHtml(scan.branch || "--") + '</strong></div><div><span>Commit</span><strong>' + escapeHtml(scan.commit_sha || "--") + '</strong></div><div><span>扫描范围</span><strong>' + Number(summary.scanned_files || 0) + ' 个文件 · ' + Number(summary.total_lines || 0).toLocaleString("zh-CN") + ' 行</strong></div><div><span>完成时间</span><strong>' + escapeHtml(formatTime(scan.finished_at)) + '</strong></div><div><span>项目画像</span><strong>' + escapeHtml(projectTypeLabels[profile.project_type] || profile.project_type || "待确认") + '</strong></div><div><span>识别技术栈</span><strong>' + escapeHtml(frameworkLabel) + '</strong></div><div><span>本次执行</span><strong>' + (summary.cache_hit ? '同提交证据复用（来源 #' + Number(summary.cache_source_scan_id || 0) + '）' : '实际分析 · ' + escapeHtml(formatDuration(scan.duration_ms))) + '</strong></div></div>' +
      (riskFocus.length ? '<section class="report-section"><h3>本项目重点检查</h3><div class="policy-tags">' + riskFocus.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join("") + '</div></section>' : '') +
      assuranceMarkup +
      schedulerMarkup +
      ciMarkup +
      newCodeMarkup +
      lifecycleMarkup +
      governanceMarkup +
      benchmarkMarkup +
      semanticValidationMarkup +
      dependencyEvidenceMarkup +
      threatIntelligenceMarkup +
      rootCauseMarkup +
      '<section class="report-section"><h3>风险分布</h3><div class="report-severity"><span class="critical">' + (newCodeGate ? "新增阻断" : "阻断") + ' <b>' + Number(summary.blocker_count || 0) + '</b></span>' + (newCodeGate ? '<span class="overall">全仓阻断 <b>' + Number(summary.overall_blocker_count == null ? summary.blocker_count || 0 : summary.overall_blocker_count) + '</b></span>' : '') + '<span class="high">高危 <b>' + Number(counts.high || 0) + '</b></span><span class="medium">中危 <b>' + Number(counts.medium || 0) + '</b></span><span class="low">低危 <b>' + Number(counts.low || 0) + '</b></span></div></section>' +
      '<section class="report-section"><h3>扫描器实况</h3><ul>' + (engines.length ? engines.map(function (engine) { return '<li>' + escapeHtml(String(engine.name || "").toUpperCase()) + '：' + escapeHtml(statusLabel(engine.status)) + (engine.version ? ' · ' + escapeHtml(engine.version) : '') + (engine.duration_ms != null ? ' · ' + escapeHtml(formatDuration(engine.duration_ms)) : '') + engineCacheLabel(engine) + engineRulesetLabel(engine) + (engine.shard_count > 1 ? ' · ' + Number(engine.completed_shards || 0) + '/' + Number(engine.shard_count) + ' 分片完成' : '') + (engine.target_count != null ? ' · ' + Number(engine.target_count).toLocaleString("zh-CN") + ' 个目标' : '') + (engine.warning ? ' · 提示：' + escapeHtml(engine.warning) : '') + (engine.error ? ' · ' + escapeHtml(engine.error) : '') + '</li>'; }).join("") : '<li>仅运行内置基线扫描</li>') + '</ul></section>' +
      '<section class="report-section"><h3>检测说明</h3><ul>' + limitations.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join("") + '</ul></section>' +
      '</div><footer><span>报告由证据分层扫描器 v' + escapeHtml(scan.scanner_version || "--") + ' 生成</span><div><button type="button" class="secondary" data-quality-export>' + icon("download") + '导出 JSON</button><button type="button" class="secondary" data-quality-sarif>' + icon("git-branch") + '导出 SARIF</button><button type="button" class="secondary" data-quality-pdf>' + icon("download") + '下载 PDF</button><button type="button" data-quality-close-modal>关闭</button></div></footer></section></div>';
  }

  function disposeQualityCharts() {
    qualityCharts.forEach(function (chart) {
      try { chart.dispose(); } catch (_) { /* chart already disposed */ }
    });
    qualityCharts = [];
  }

  function latestProjectRun(project) {
    return project && project.latest_scan ? project.latest_scan : null;
  }

  function governanceProjectState(project) {
    var run = latestProjectRun(project);
    if (!project || !project.gitlab_configured) return { key: "unlinked", label: "待关联", tone: "muted", icon: "link-2-off" };
    if (!run) return { key: "not_scanned", label: "待质检", tone: "muted", icon: "circle-dashed" };
    if (["queued", "running"].includes(run.status)) return { key: "running", label: "质检中", tone: "info", icon: "loader-circle" };
    if (run.stale_policy) return { key: "outdated", label: "报告过期", tone: "warn", icon: "history" };
    if (run.status === "failed" || run.summary && run.summary.scan_complete === false) return { key: "blocked", label: "证据不完整", tone: "danger", icon: "circle-x" };
    if (run.gate_status === "failed") return { key: "blocked", label: "门禁阻断", tone: "danger", icon: "shield-alert" };
    if (run.gate_status === "passed") return { key: "passed", label: "门禁通过", tone: "success", icon: "shield-check" };
    return { key: "review", label: "待复核", tone: "warn", icon: "circle-help" };
  }

  function governanceDimension(project, key) {
    var run = latestProjectRun(project);
    var summary = run && run.summary || {};
    if (key === "repository") return project.gitlab_configured
      ? { tone: "success", label: "已关联", detail: "仓库与默认分支可用" }
      : { tone: "missing", label: "待关联", detail: "尚未配置 GitLab 仓库" };
    if (!run) return { tone: "missing", label: "无证据", detail: "尚未执行代码质检" };
    if (key === "coverage") {
      if (run.status === "failed") return { tone: "blocked", label: "失败", detail: scanErrorSummary(run.error) };
      if (["queued", "running"].includes(run.status)) return { tone: "progress", label: "进行中", detail: "正在生成扫描证据" };
      if (summary.scan_complete === false) return { tone: "blocked", label: "不完整", detail: "必需引擎存在缺口" };
      return { tone: "success", label: "完整", detail: Number(summary.scanned_files || 0) + " 个文件已扫描" };
    }
    if (key === "assurance") {
      var coverage = Number(summary.evidence_coverage_percent || 0);
      if (!coverage) return { tone: "missing", label: "待评估", detail: "报告未提供证据覆盖率" };
      return coverage >= 100
        ? { tone: "success", label: coverage + "%", detail: "必需证据已覆盖" }
        : { tone: "progress", label: coverage + "%", detail: "仍有证据维度待补齐" };
    }
    if (key === "gate") {
      if (run.stale_policy) return { tone: "progress", label: "已过期", detail: "需按当前规则重新质检" };
      if (run.gate_status === "passed") return { tone: "success", label: "通过", detail: "当前质量准入通过" };
      if (run.gate_status === "failed") return { tone: "blocked", label: "阻断", detail: Number(summary.blocker_count || 0) + " 个阻断问题" };
      return { tone: "missing", label: "待判断", detail: "尚未形成门禁结论" };
    }
    if (key === "review") {
      var reviewCount = Number(summary.review_candidate_count || summary.review_finding_count || 0);
      var expired = Number(summary.expired_risk_acceptance_count || 0);
      if (expired) return { tone: "blocked", label: expired + " 项到期", detail: "风险接受已到期并重开" };
      if (reviewCount) return { tone: "progress", label: reviewCount + " 待复核", detail: "需要人工确认扫描结论" };
      return { tone: "success", label: "已闭环", detail: "当前无待复核问题" };
    }
    return { tone: "missing", label: "待评估", detail: "暂无可用证据" };
  }

  function governanceRiskScore(project) {
    var run = latestProjectRun(project);
    var summary = run && run.summary || {};
    var state = governanceProjectState(project);
    var base = ({ blocked: 80, outdated: 62, not_scanned: 55, unlinked: 50, review: 42, running: 20, passed: 0 })[state.key] || 0;
    return Math.min(100, base + Math.min(20, Number(summary.blocker_count || 0) * 6) + Math.min(12, Number(summary.review_candidate_count || 0) * 2) + Math.min(8, Number(summary.expired_risk_acceptance_count || 0) * 4));
  }

  function governanceCoverageBucket(project) {
    var run = latestProjectRun(project);
    var coverage = run ? Number(run.summary && run.summary.evidence_coverage_percent || 0) : 0;
    if (!run || coverage <= 0) return "missing";
    if (coverage >= 100) return "full";
    if (coverage >= 80) return "high";
    return "low";
  }

  function filteredGovernanceProjects() {
    var projects = overview && Array.isArray(overview.projects) ? overview.projects.slice() : [];
    var normalized = compact(governanceQuery).toLocaleLowerCase("zh-CN");
    return projects.filter(function (project) {
      var state = governanceProjectState(project);
      if (governanceGateFilter !== "all" && state.key !== governanceGateFilter) return false;
      if (governanceCoverageFilter !== "all" && governanceCoverageBucket(project) !== governanceCoverageFilter) return false;
      if (!normalized) return true;
      return [projectBusinessName(project), project.name, project.owner_name, project.default_branch, state.label].some(function (value) {
        return String(value || "").toLocaleLowerCase("zh-CN").includes(normalized);
      });
    }).sort(function (left, right) {
      return governanceRiskScore(right) - governanceRiskScore(left) || projectBusinessName(left).localeCompare(projectBusinessName(right), "zh-CN");
    });
  }

  function renderGovernanceHeader() {
    return '<header class="cq2-header"><div><div class="cq2-eyebrow">代码质检 / 质量治理</div><h1>代码质量治理中心</h1><p>统一查看项目门禁、扫描证据与待复核问题，从项目级风险下钻到代码行和处置审计。</p></div><div class="cq2-header-actions"><button type="button" class="cq2-secondary" data-quality-policy>' + icon("settings-2") + '治理策略</button><button type="button" class="cq2-primary" data-quality-governance-refresh>' + icon("refresh-cw") + '刷新数据</button></div></header>';
  }

  function renderGovernanceMetrics() {
    var projects = overview && Array.isArray(overview.projects) ? overview.projects : [];
    var total = projects.length;
    var counts = projects.reduce(function (result, project) {
      var key = governanceProjectState(project).key;
      result[key] = Number(result[key] || 0) + 1;
      return result;
    }, {});
    var metrics = [
      { key: "all", label: "治理项目", value: total, note: "当前可访问且未归档", icon: "folders", tone: "blue" },
      { key: "passed", label: "门禁通过", value: Number(counts.passed || 0), note: total ? Math.round(Number(counts.passed || 0) * 100 / total) + "% 项目已通过" : "暂无项目", icon: "shield-check", tone: "green" },
      { key: "blocked", label: "需要处理", value: Number(counts.blocked || 0), note: "门禁阻断或扫描证据不完整", icon: "shield-alert", tone: "red" },
      { key: "outdated", label: "报告过期", value: Number(counts.outdated || 0), note: "需按当前规则重新质检", icon: "history", tone: "orange" },
      { key: "not_scanned", label: "尚未质检", value: Number(counts.not_scanned || 0), note: Number(counts.unlinked || 0) ? Number(counts.unlinked || 0) + " 个项目待关联 GitLab" : "尚无可追溯扫描报告", icon: "circle-dashed", tone: "slate" }
    ];
    return '<section class="cq2-metrics" aria-label="代码质量治理概览">' + metrics.map(function (item) {
      return '<button type="button" class="cq2-metric tone-' + item.tone + (governanceGateFilter === item.key ? ' is-active' : '') + '" data-quality-governance-filter="' + item.key + '"><span>' + icon(item.icon) + '</span><div><small>' + item.label + '</small><strong>' + item.value + '</strong><em>' + item.note + '</em></div></button>';
    }).join("") + '</section>';
  }

  function renderDimensionCell(project, key) {
    var value = governanceDimension(project, key);
    var statusIcon = value.tone === "success" ? "circle-check" : value.tone === "blocked" ? "circle-x" : value.tone === "progress" ? "clock-3" : "circle-help";
    return '<span class="cq2-dimension tone-' + value.tone + '" title="' + escapeHtml(value.detail) + '">' + icon(statusIcon) + '<b>' + escapeHtml(value.label) + '</b></span>';
  }

  function renderGovernanceMatrix() {
    var all = filteredGovernanceProjects();
    var totalPages = Math.max(1, Math.ceil(all.length / governancePageSize));
    governancePage = Math.min(Math.max(governancePage, 1), totalPages);
    var rows = all.slice((governancePage - 1) * governancePageSize, governancePage * governancePageSize);
    var headers = ["项目", "GitLab 关联", "扫描完整度", "证据覆盖", "质量准入", "人工复核", "操作"];
    return '<article class="cq2-panel cq2-matrix"><div class="cq2-panel-head"><div><h2>项目治理矩阵</h2><p>每一格均来自项目、最新扫描报告和问题处置记录；悬停可查看判断口径。</p></div><span>当前 ' + all.length + ' / ' + Number(overview && overview.summary && overview.summary.project_count || 0) + ' 个项目</span></div>' +
      '<div class="cq2-matrix-toolbar"><label>' + icon("search") + '<input data-quality-governance-search value="' + escapeHtml(governanceQuery) + '" placeholder="搜索项目、负责人或分支" /></label><select data-quality-governance-status aria-label="按治理状态筛选"><option value="all"' + (governanceGateFilter === "all" ? " selected" : "") + '>全部状态</option><option value="blocked"' + (governanceGateFilter === "blocked" ? " selected" : "") + '>需要处理</option><option value="passed"' + (governanceGateFilter === "passed" ? " selected" : "") + '>门禁通过</option><option value="outdated"' + (governanceGateFilter === "outdated" ? " selected" : "") + '>报告过期</option><option value="not_scanned"' + (governanceGateFilter === "not_scanned" ? " selected" : "") + '>尚未质检</option><option value="unlinked"' + (governanceGateFilter === "unlinked" ? " selected" : "") + '>待关联 GitLab</option></select><select data-quality-governance-coverage aria-label="按证据覆盖率筛选"><option value="all"' + (governanceCoverageFilter === "all" ? " selected" : "") + '>全部证据覆盖</option><option value="full"' + (governanceCoverageFilter === "full" ? " selected" : "") + '>证据覆盖 100%</option><option value="high"' + (governanceCoverageFilter === "high" ? " selected" : "") + '>证据覆盖 80–99%</option><option value="low"' + (governanceCoverageFilter === "low" ? " selected" : "") + '>证据覆盖 1–79%</option><option value="missing"' + (governanceCoverageFilter === "missing" ? " selected" : "") + '>无报告或无覆盖</option></select><button type="button" data-quality-governance-reset>' + icon("rotate-ccw") + '重置</button></div>' +
      '<div class="cq2-table-wrap"><table class="cq2-table"><thead><tr>' + headers.map(function (header) { return '<th>' + header + '</th>'; }).join("") + '</tr></thead><tbody>' + (rows.length ? rows.map(function (project) {
        var state = governanceProjectState(project);
        var run = latestProjectRun(project);
        return '<tr data-quality-open-project="' + Number(project.id) + '" tabindex="0"><td><div class="cq2-project-cell"><span class="cq2-state-dot tone-' + state.tone + '"></span><div><strong>' + escapeHtml(projectBusinessName(project)) + '</strong><small>' + escapeHtml(project.owner_name || "负责人待确认") + ' · ' + escapeHtml(project.default_branch || "main") + '</small></div></div></td><td>' + renderDimensionCell(project, "repository") + '</td><td>' + renderDimensionCell(project, "coverage") + '</td><td>' + renderDimensionCell(project, "assurance") + '</td><td>' + renderDimensionCell(project, "gate") + '</td><td>' + renderDimensionCell(project, "review") + '</td><td><button type="button" class="cq2-link-button" data-quality-open-project="' + Number(project.id) + '">' + (run ? "查看报告" : "开始接入") + icon("chevron-right") + '</button></td></tr>';
      }).join("") : '<tr><td colspan="7"><div class="cq2-empty">' + icon("search-x") + '<strong>没有匹配的项目</strong><span>请调整搜索词或治理状态筛选。</span></div></td></tr>') + '</tbody></table></div>' +
      '<footer class="cq2-table-footer"><span>共 ' + all.length + ' 个项目</span><div><button type="button" data-quality-governance-page="' + (governancePage - 1) + '"' + (governancePage <= 1 ? " disabled" : "") + '>上一页</button><b>' + governancePage + ' / ' + totalPages + '</b><button type="button" data-quality-governance-page="' + (governancePage + 1) + '"' + (governancePage >= totalPages ? " disabled" : "") + '>下一页</button></div></footer></article>';
  }

  function renderGovernancePriority() {
    var projects = filteredGovernanceProjects().filter(function (project) { return governanceRiskScore(project) > 0; }).slice(0, 6);
    return '<article class="cq2-panel cq2-priority"><div class="cq2-panel-head"><div><h2>建议处理顺序</h2><p>按门禁、证据缺口、报告时效和待复核数量综合排序。</p></div><span>实时排序</span></div><div class="cq2-priority-list">' + (projects.length ? projects.map(function (project, index) {
      var state = governanceProjectState(project);
      var score = governanceRiskScore(project);
      return '<button type="button" data-quality-open-project="' + Number(project.id) + '"><span class="cq2-rank rank-' + Math.min(index + 1, 4) + '">' + (index + 1) + '</span><div><strong>' + escapeHtml(projectBusinessName(project)) + '</strong><small>' + escapeHtml(state.label) + ' · ' + escapeHtml(project.owner_name || "负责人待确认") + '</small><i><b style="width:' + score + '%"></b></i></div><em>' + score + '</em>' + icon("chevron-right") + '</button>';
    }).join("") : '<div class="cq2-empty compact">' + icon("circle-check") + '<strong>当前没有待处理项目</strong><span>所有可治理项目均已通过。</span></div>') + '</div></article>';
  }

  function renderGovernanceCharts() {
    return '<section class="cq2-chart-grid"><article class="cq2-panel"><div class="cq2-panel-head"><div><h2>治理状态分布</h2><p>点击图例或扇区可联动上方项目矩阵。</p></div><span>可交互</span></div><div class="cq2-chart" data-quality-governance-state-chart role="img" aria-label="项目代码质量治理状态分布图"></div></article><article class="cq2-panel"><div class="cq2-panel-head"><div><h2>证据覆盖分布</h2><p>按最新报告证据覆盖率分组，帮助识别扫描能力缺口。</p></div><span>真实报告</span></div><div class="cq2-chart" data-quality-governance-coverage-chart role="img" aria-label="项目代码质检证据覆盖率分布图"></div></article></section>';
  }

  function renderGovernance() {
    return renderGovernanceHeader() + (loadError ? renderContextAlert(null) : "") + renderGovernanceMetrics() + '<section class="cq2-governance-grid">' + renderGovernanceMatrix() + renderGovernancePriority() + '</section>' + renderGovernanceCharts() + renderPolicyDialog();
  }

  function renderReportHeader(project) {
    var busy = starting || scan && ["queued", "running"].includes(scan.status);
    return '<header class="cq2-header cq2-report-header"><div><button type="button" class="cq2-back" data-quality-back-governance>' + icon("arrow-left") + '代码质量治理</button><h1>' + escapeHtml(project ? projectBusinessName(project) : "项目质检报告") + '</h1><p>' + escapeHtml(project && project.owner_name || "负责人待确认") + ' · ' + escapeHtml(branch || project && project.default_branch || "main") + ' · ' + escapeHtml(reportNumber()) + '</p></div><div class="cq2-header-actions"><button type="button" class="cq2-secondary" data-quality-report' + (!scan ? " disabled" : "") + '>' + icon("file-text") + '完整报告</button><button type="button" class="cq2-secondary" data-quality-export' + (!scan ? " disabled" : "") + '>' + icon("download") + '导出 JSON</button><button type="button" class="cq2-primary" data-quality-start' + (!project || !project.gitlab_configured || busy ? " disabled" : "") + '>' + (busy ? icon("loader-circle", "spin") + '正在质检' : icon("play") + '重新质检') + '</button></div></header>';
  }

  function renderReportTabs() {
    var tabs = [
      { key: "evidence", label: "报告诊断", icon: "layout-dashboard" },
      { key: "findings", label: "问题清单", icon: "list-checks" },
      { key: "chain", label: "证据链", icon: "git-fork" }
    ];
    return '<nav class="cq2-report-tabs" aria-label="项目质检报告视图">' + tabs.map(function (tab) {
      return '<button type="button" data-quality-report-tab="' + tab.key + '" class="' + (reportTab === tab.key ? "is-active" : "") + '">' + icon(tab.icon) + tab.label + '</button>';
    }).join("") + '</nav>';
  }

  function qualityEngineRecords() {
    var payload = scan && scan.report && scan.report.engine || {};
    return (Array.isArray(payload.internal_scanners) ? payload.internal_scanners : []).concat(Array.isArray(payload.external_scanners) ? payload.external_scanners : []);
  }

  function renderScanHistoryRail() {
    return '<article class="cq2-panel cq2-scan-history"><div class="cq2-panel-head"><div><h2>报告队列</h2><p>当前项目最近扫描与规则版本。</p></div><span>' + scanHistory.length + ' 份</span></div><div>' + (scanHistory.length ? scanHistory.map(function (item) {
      var selected = scan && Number(scan.id) === Number(item.id);
      var state = item.status === "completed" && item.gate_status === "passed" ? "success" : item.status === "completed" ? "danger" : item.status === "failed" ? "danger" : "info";
      return '<button type="button" class="cq2-scan-item' + (selected ? " is-active" : "") + '" data-quality-load-scan="' + Number(item.id) + '"><span class="tone-' + state + '">' + icon(item.status === "completed" ? "file-check-2" : item.status === "failed" ? "file-x-2" : "loader-circle") + '</span><div><strong>' + escapeHtml(item.commit_sha ? item.commit_sha.slice(0, 8) : "等待 Commit") + '</strong><small>' + escapeHtml(formatTime(item.finished_at || item.created_at)) + '</small></div><em>' + escapeHtml(statusLabel(item.status)) + '</em></button>';
    }).join("") : '<div class="cq2-empty compact">' + icon("file-clock") + '<strong>暂无扫描报告</strong><span>运行首次质检后自动留痕。</span></div>') + '</div></article>';
  }

  function renderEvidenceOverview() {
    var summary = scan && scan.summary || {};
    var engines = qualityEngineRecords();
    var findings = scan && Array.isArray(scan.findings) ? scan.findings : [];
    var counts = summary.severity_counts || {};
    var lifecycle = scan && scan.report && scan.report.lifecycle || {};
    return '<section class="cq2-report-grid">' + renderScanHistoryRail() + '<div class="cq2-report-center"><article class="cq2-panel cq2-scan-facts"><div class="cq2-panel-head"><div><h2>本次扫描证据</h2><p>同一项目、分支与 Commit 的真实扫描结果。</p></div><span class="cq2-gate gate-' + escapeHtml(scan && scan.gate_status || "pending") + '">' + escapeHtml(gateMeta().label) + '</span></div><div class="cq2-facts-grid"><div><small>Commit</small><strong>' + escapeHtml(scan && scan.commit_sha ? scan.commit_sha.slice(0, 12) : "--") + '</strong></div><div><small>扫描文件</small><strong>' + Number(summary.scanned_files || 0) + '</strong></div><div><small>证据覆盖</small><strong>' + Number(summary.evidence_coverage_percent || 0) + '%</strong></div><div><small>扫描耗时</small><strong>' + escapeHtml(formatDuration(scan && scan.duration_ms)) + '</strong></div></div><div class="cq2-engine-list">' + (engines.length ? engines.map(function (engine) {
      var tone = engine.status === "completed" ? "success" : ["partial", "unavailable", "failed"].includes(engine.status) ? "danger" : "muted";
      return '<div><span class="tone-' + tone + '">' + icon(tone === "success" ? "circle-check" : tone === "danger" ? "circle-x" : "circle-dashed") + '</span><strong>' + escapeHtml(String(engine.name || "扫描器").toUpperCase()) + '</strong><small>' + escapeHtml(statusLabel(engine.status)) + (engine.duration_ms != null ? ' · ' + escapeHtml(formatDuration(engine.duration_ms)) : '') + '</small></div>';
    }).join("") : '<div class="cq2-inline-empty">尚未生成扫描器证据</div>') + '</div></article><article class="cq2-panel cq2-risk-board"><div class="cq2-panel-head"><div><h2>风险与质量变化</h2><p>问题严重度与上一份可比报告的真实变化。</p></div><button type="button" class="cq2-link-button" data-quality-report-tab="findings">查看全部问题' + icon("arrow-right") + '</button></div><div class="cq2-risk-metrics"><div class="critical"><span>阻断</span><strong>' + Number(summary.blocker_count || 0) + '</strong></div><div class="high"><span>高危</span><strong>' + Number(counts.high || 0) + '</strong></div><div class="medium"><span>中危</span><strong>' + Number(counts.medium || 0) + '</strong></div><div class="review"><span>待复核</span><strong>' + Number(summary.review_candidate_count || 0) + '</strong></div></div><div class="cq2-lifecycle"><span><b>' + Number(lifecycle.new_count || 0) + '</b>新增检测</span><span><b>' + Number(lifecycle.persistent_count || 0) + '</b>持续存在</span><span><b>' + Number(lifecycle.resolved_count || 0) + '</b>已不再检测</span><span><b>' + Number(lifecycle.reopened_count || 0) + '</b>重新出现</span></div><div class="cq2-top-findings">' + (findings.length ? findings.slice().sort(function (a, b) { return Number(Boolean(b.blocking)) - Number(Boolean(a.blocking)) || Number(b.evidence_score || 0) - Number(a.evidence_score || 0); }).slice(0, 4).map(function (item) {
      return '<button type="button" data-quality-finding="' + Number(item.id) + '"><span class="severity-' + escapeHtml(item.severity) + '">' + escapeHtml(severityLabel(item.severity)) + '</span><div><strong>' + escapeHtml(findingDisplayTitle(item)) + '</strong><small>' + escapeHtml(item.file_path || "项目级检查") + (item.line ? ':' + Number(item.line) : '') + '</small></div>' + icon("chevron-right") + '</button>';
    }).join("") : '<div class="cq2-empty compact">' + icon("circle-check") + '<strong>当前没有问题记录</strong><span>扫描完成后会在这里展示真实发现。</span></div>') + '</div></article></div>' + renderReportActionPanel() + '</section>';
  }

  function renderReportActionPanel() {
    var summary = scan && scan.summary || {};
    var gaps = Array.isArray(summary.coverage_gaps) ? summary.coverage_gaps : [];
    var blockerCount = Number(summary.blocker_count || 0);
    var reviewCount = Number(summary.review_candidate_count || 0);
    var actions = [];
    if (!scan) actions.push("运行首次代码质检并生成可追溯报告");
    if (scan && summary.scan_complete === false) actions.push("补齐必需扫描器后重新质检");
    if (blockerCount) actions.push("先处理 " + blockerCount + " 个门禁阻断问题");
    if (reviewCount) actions.push("复核 " + reviewCount + " 个候选问题并记录结论");
    if (scan && scan.stale_policy) actions.push("按当前规则版本重新质检");
    if (!actions.length) actions.push("当前门禁已通过，可进入下一质量流程");
    return '<aside class="cq2-panel cq2-report-actions"><div class="cq2-panel-head"><div><h2>质量判断</h2><p>仅基于当前真实扫描证据。</p></div></div><div class="cq2-decision tone-' + escapeHtml(gateMeta().tone) + '">' + icon(gateMeta().tone === "pass" ? "shield-check" : "shield-alert") + '<div><small>当前结论</small><strong>' + escapeHtml(gateMeta().label) + '</strong><span>' + escapeHtml(gateMeta().description) + '</span></div></div><section><h3>下一步动作</h3><ol>' + actions.map(function (action) { return '<li>' + escapeHtml(action) + '</li>'; }).join("") + '</ol></section><section><h3>证据缺口</h3>' + (gaps.length ? '<ul class="cq2-gap-list">' + gaps.slice(0, 6).map(function (gap) { return '<li>' + escapeHtml(gap) + '</li>'; }).join("") + '</ul>' : '<p class="cq2-ok-note">' + icon("circle-check") + '当前报告未声明额外覆盖缺口。</p>') + '</section><button type="button" class="cq2-primary cq2-full" data-quality-report' + (!scan ? " disabled" : "") + '>' + icon("file-text") + '查看完整证据报告</button></aside>';
  }

  function renderEvidenceChain() {
    return '<article class="cq2-panel cq2-chain-panel"><div class="cq2-panel-head"><div><h2>扫描证据链</h2><p>项目、Commit、扫描引擎、问题证据与门禁结论按同一报告 ID 关联；滚轮缩放，按住左键拖动画布。</p></div><div><button type="button" class="cq2-secondary" data-quality-chain-reset>' + icon("maximize-2") + '还原视图</button></div></div><div class="cq2-chain-chart" data-quality-evidence-chain role="img" aria-label="代码质检证据链关系图"></div><footer><span class="tone-success">' + icon("circle-check") + '完整证据</span><span class="tone-info">' + icon("circle-dot") + '过程节点</span><span class="tone-danger">' + icon("circle-x") + '阻断问题</span><span class="tone-muted">' + icon("circle-dashed") + '缺失或未启用</span></footer></article>';
  }

  function redactSnippet(value) {
    return String(value || "").replace(/((?:token|secret|password|passwd|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/ig, "$1***已脱敏***");
  }

  function renderFindingWorkbench() {
    var finding = currentFinding();
    var all = filteredFindings();
    if (!finding && all.length) {
      selectedFindingId = Number(all[0].id);
      finding = currentFinding();
    }
    var location = finding ? (finding.file_path || "项目级检查") + (finding.line ? ':' + Number(finding.line) : '') : "--";
    return renderReportHeader(currentProject()) + '<section class="cq2-finding-layout"><aside class="cq2-panel cq2-finding-queue"><div class="cq2-panel-head"><div><h2>问题处置队列</h2><p>按阻断、严重度与证据强度排序。</p></div><button type="button" class="cq2-icon-button" data-quality-back-report aria-label="返回项目报告">' + icon("x") + '</button></div><label class="cq2-finding-search">' + icon("search") + '<input data-quality-search value="' + escapeHtml(query) + '" placeholder="搜索规则、文件或问题" /></label><div>' + (all.length ? all.slice(0, 30).map(function (item) {
      return '<button type="button" class="cq2-queue-item' + (Number(item.id) === Number(selectedFindingId) ? " is-active" : "") + '" data-quality-finding="' + Number(item.id) + '"><span class="severity-' + escapeHtml(item.severity) + '">' + escapeHtml(severityLabel(item.severity)) + '</span><div><strong>' + escapeHtml(findingDisplayTitle(item)) + '</strong><small>' + escapeHtml(item.rule_id || item.source || "规则") + ' · ' + escapeHtml(statusLabel(item.triage_status)) + '</small></div></button>';
    }).join("") : '<div class="cq2-empty compact">' + icon("circle-check") + '<strong>没有匹配的问题</strong></div>') + '</div></aside><article class="cq2-panel cq2-finding-detail">' + (finding ? '<div class="cq2-finding-title"><div><span class="severity-' + escapeHtml(finding.severity) + '">' + escapeHtml(severityLabel(finding.severity)) + '</span><span class="cq2-evidence-grade">证据 ' + escapeHtml(finding.evidence_grade || finding.verification_status || "待复核") + '</span><h1>' + escapeHtml(findingDisplayTitle(finding)) + '</h1><p>' + escapeHtml(finding.rule_id || "--") + ' · ' + escapeHtml(categoryLabel(finding.category)) + ' · ' + escapeHtml(finding.source || "内置规则") + '</p></div><button type="button" class="cq2-secondary" data-quality-back-report>' + icon("arrow-left") + '返回报告</button></div><section class="cq2-finding-summary"><h2>为什么被发现</h2><p>' + escapeHtml(finding.description || "当前规则未提供补充说明。") + '</p><dl><div><dt>代码位置</dt><dd>' + escapeHtml(location) + '</dd></div><div><dt>置信度</dt><dd>' + escapeHtml(finding.confidence || "待判断") + '</dd></div><div><dt>证据类型</dt><dd>' + escapeHtml(finding.evidence_type || "规则证据") + '</dd></div><div><dt>门禁影响</dt><dd>' + (finding.blocking ? "阻断质量准入" : "不直接阻断") + '</dd></div></dl></section><section class="cq2-code-evidence"><div><h2>代码证据</h2>' + (finding.web_url ? '<a data-quality-source-link href="' + escapeHtml(finding.web_url) + '" target="_blank" rel="noopener noreferrer">在 GitLab 打开' + icon("external-link") + '</a>' : '') + '</div><pre><code>' + escapeHtml(redactSnippet(finding.snippet) || "当前问题未返回代码片段；请通过文件位置查看原始证据。") + '</code></pre><small>敏感字段会在展示前二次脱敏；原始仓库内容不会写入处置审计。</small></section><section class="cq2-remediation"><h2>建议修复</h2><p>' + escapeHtml(finding.remediation || "请结合规则说明、业务语境和测试证据完成复核。") + '</p></section>' : '<div class="cq2-empty">' + icon("mouse-pointer-click") + '<strong>请选择一个问题</strong><span>左侧队列会显示当前报告的真实扫描发现。</span></div>') + '</article>' + renderTriagePanel(finding) + '</section>';
  }

  function renderTriagePanel(finding) {
    if (!finding) return '<aside class="cq2-panel cq2-triage-panel"><div class="cq2-empty compact">请选择问题后开始处置</div></aside>';
    var minimum = Number(policy && policy.limits && policy.limits.triage_reason_min_length || 10);
    var governed = ["false_positive", "accepted_risk"].includes(triageDraftStatus);
    return '<aside class="cq2-panel cq2-triage-panel"><div class="cq2-panel-head"><div><h2>处置与审计</h2><p>任何结论都写入追加式审计记录。</p></div><span class="triage-' + escapeHtml(finding.triage_status) + '">' + escapeHtml(statusLabel(finding.triage_status)) + '</span></div><section><h3>处置动作</h3><div class="cq2-triage-actions"><button type="button" data-quality-triage="confirmed">确认问题</button><button type="button" data-quality-triage="fixed">已修复</button><button type="button" data-quality-triage="false_positive">确认误报</button><button type="button" data-quality-triage="accepted_risk">限期接受</button></div>' + (governed ? '<div class="cq2-governed-form"><label>处置依据<textarea data-quality-triage-reason placeholder="至少 ' + minimum + ' 个字符，说明证据与判断口径">' + escapeHtml(triageDraftReason) + '</textarea></label>' + (triageDraftStatus === "accepted_risk" ? '<label>风险到期日<input type="date" data-quality-triage-expiry value="' + escapeHtml(triageDraftExpiresOn) + '" /></label><p>风险接受到期后自动重新进入质量准入。</p>' : '<p>确认误报不会删除原始问题，扫描证据与审计历史继续保留。</p>') + '<div><button type="button" data-quality-triage-cancel>取消</button><button type="button" class="cq2-primary" data-quality-triage-confirm' + (triageSaving ? " disabled" : "") + '>确认并留痕</button></div></div>' : '') + '</section><section><h3>审计时间线</h3><div class="cq2-audit-list">' + (triageEventsLoading ? '<div class="cq2-inline-empty">正在读取审计记录…</div>' : triageEvents.length ? triageEvents.map(function (event) {
      return '<article><span>' + icon("history") + '</span><div><strong>' + escapeHtml(statusLabel(event.from_status)) + ' → ' + escapeHtml(statusLabel(event.to_status)) + '</strong><small>' + escapeHtml(event.actor_name || "系统") + ' · ' + escapeHtml(formatTime(event.created_at)) + '</small><p>' + escapeHtml(event.reason || "未记录补充说明") + '</p></div></article>';
    }).join("") : '<div class="cq2-inline-empty">当前问题尚无人工处置记录。</div>') + '</div></section></aside>';
  }

  function renderProjectReport() {
    var project = currentProject();
    var body = reportTab === "findings" ? renderFindings() : reportTab === "chain" ? renderEvidenceChain() : renderEvidenceOverview();
    return renderReportHeader(project) + renderContextAlert(project) + renderControls(project) + renderLiveScanStatus() + renderMetricCards() + renderReportTabs() + body + renderPolicyDialog() + renderReportDialog();
  }

  function initGovernanceCharts() {
    var echarts = window.ProjectOperationsECharts;
    if (!echarts || !overview) return;
    var projects = Array.isArray(overview.projects) ? overview.projects : [];
    var states = [
      { key: "passed", label: "门禁通过", color: "#19a974" },
      { key: "blocked", label: "需要处理", color: "#ef4d5a" },
      { key: "outdated", label: "报告过期", color: "#f59e0b" },
      { key: "not_scanned", label: "尚未质检", color: "#7c8da8" },
      { key: "unlinked", label: "待关联", color: "#a9b5c7" },
      { key: "running", label: "质检中", color: "#2f6df6" }
    ];
    var stateNode = document.querySelector("[data-quality-governance-state-chart]");
    if (stateNode) {
      var stateChart = echarts.init(stateNode);
      stateChart.setOption({ animationDuration: 700, aria: { enabled: true, description: "展示当前项目代码质检治理状态分布" }, tooltip: { trigger: "item", formatter: "{b}<br/>{c} 个项目（{d}%）" }, legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: "#60718e", fontSize: 12 } }, series: [{ type: "pie", radius: ["48%", "72%"], center: ["50%", "43%"], padAngle: 2, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 5 }, label: { show: true, formatter: "{b}\n{c}", color: "#33415c", fontSize: 12 }, data: states.map(function (state) { return { name: state.label, value: projects.filter(function (project) { return governanceProjectState(project).key === state.key; }).length, itemStyle: { color: state.color }, key: state.key }; }).filter(function (item) { return item.value > 0; }) }] });
      stateChart.on("click", function (params) { governanceGateFilter = params.data && params.data.key || "all"; governancePage = 1; render(); });
      stateChart.on("legendselectchanged", function (params) {
        var state = states.find(function (item) { return item.label === params.name; });
        governanceGateFilter = state ? state.key : "all";
        governancePage = 1;
        render();
      });
      qualityCharts.push(stateChart);
    }
    var coverageNode = document.querySelector("[data-quality-governance-coverage-chart]");
    if (coverageNode) {
      var buckets = [{ name: "100%", min: 100, max: 101 }, { name: "80–99%", min: 80, max: 100 }, { name: "1–79%", min: 1, max: 80 }, { name: "无报告", min: -1, max: 1 }];
      var values = buckets.map(function (bucket, index) { return projects.filter(function (project) { var run = latestProjectRun(project); var value = run ? Number(run.summary && run.summary.evidence_coverage_percent || 0) : 0; return index === 3 ? !run || value === 0 : value >= bucket.min && value < bucket.max; }).length; });
      var coverageChart = echarts.init(coverageNode);
      coverageChart.setOption({ animationDuration: 650, aria: { enabled: true, description: "展示最新代码质检报告证据覆盖率分布，可点击柱形筛选项目矩阵，并使用滚轮缩放或工具栏还原" }, toolbox: { right: 12, top: 0, feature: { dataZoom: { yAxisIndex: "none", title: { zoom: "区域缩放", back: "缩放还原" } }, restore: { title: "还原视图" } }, iconStyle: { borderColor: "#71829d" }, emphasis: { iconStyle: { borderColor: "#2f6df6" } } }, dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none", zoomOnMouseWheel: true, moveOnMouseWheel: false, moveOnMouseMove: true }], grid: { top: 30, left: 48, right: 20, bottom: 42 }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: function (params) { var item = params[0]; return item.name + "<br/>" + item.value + " 个项目<br/><small>点击筛选项目矩阵</small>"; } }, xAxis: { type: "category", data: buckets.map(function (item) { return item.name; }), axisTick: { show: false }, axisLine: { lineStyle: { color: "#d8e1ef" } }, axisLabel: { color: "#60718e" } }, yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#edf2f8" } }, axisLabel: { color: "#7c8da8" } }, series: [{ type: "bar", data: values.map(function (value, index) { return { value: value, bucket: ["full", "high", "low", "missing"][index], itemStyle: { color: ["#19a974", "#2f6df6", "#f59e0b", "#a9b5c7"][index], borderRadius: [6, 6, 0, 0] } }; }), barWidth: 34, emphasis: { focus: "self" } }] });
      coverageChart.on("click", function (params) {
        governanceCoverageFilter = params.data && params.data.bucket || "all";
        governancePage = 1;
        render();
      });
      qualityCharts.push(coverageChart);
    }
  }

  function initEvidenceChain() {
    var echarts = window.ProjectOperationsECharts;
    var node = document.querySelector("[data-quality-evidence-chain]");
    if (!echarts || !node || !scan) return;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var project = currentProject();
    var engines = qualityEngineRecords();
    var findings = Array.isArray(scan.findings) ? scan.findings : [];
    var graphNodes = [];
    var links = [];
    function addNode(id, name, category, value, symbolSize, detail) {
      graphNodes.push({ id: id, name: name, category: category, value: value, symbolSize: symbolSize, detail: detail || "" });
    }
    function addLink(source, target) { links.push({ source: source, target: target }); }
    addNode("project", project ? projectBusinessName(project) : "项目", 0, 1, 70, "项目 #" + Number(project && project.id || 0));
    addNode("commit", scan.commit_sha ? scan.commit_sha.slice(0, 10) : "Commit 待确认", 1, 1, 58, scan.branch || "main"); addLink("project", "commit");
    engines.forEach(function (engine, index) { var id = "engine-" + index; addNode(id, String(engine.name || "扫描器").toUpperCase(), engine.status === "completed" ? 2 : 4, Number(engine.target_count || 1), 46, statusLabel(engine.status)); addLink("commit", id); });
    var grouped = {};
    findings.forEach(function (finding) { var key = finding.source || categoryLabel(finding.category); if (!grouped[key]) grouped[key] = []; grouped[key].push(finding); });
    Object.keys(grouped).slice(0, 10).forEach(function (key, index) { var id = "finding-" + index; var group = grouped[key]; var blocking = group.filter(function (item) { return item.blocking; }).length; addNode(id, key + " · " + group.length, blocking ? 3 : 1, group.length, Math.min(62, 36 + group.length * 2), blocking ? blocking + " 个阻断问题" : "非阻断问题"); var engineIndex = engines.findIndex(function (engine) { return String(engine.name || "").toLocaleLowerCase() === String(key).toLocaleLowerCase(); }); addLink(engineIndex >= 0 ? "engine-" + engineIndex : "commit", id); addLink(id, "gate"); });
    addNode("gate", gateMeta().label, scan.gate_status === "passed" ? 2 : 3, 1, 66, gateMeta().description);
    if (!Object.keys(grouped).length) addLink("commit", "gate");
    function sphereColor(highlight, core, edge) {
      return echarts.graphic && echarts.graphic.RadialGradient
        ? new echarts.graphic.RadialGradient(0.32, 0.28, 0.78, [
          { offset: 0, color: highlight },
          { offset: 0.24, color: core },
          { offset: 0.72, color: edge },
          { offset: 1, color: edge }
        ])
        : core;
    }
    function sphereStyle(highlight, core, edge, glow, restingOpacity) {
      return {
        color: sphereColor(highlight, core, edge),
        borderColor: "rgba(255, 255, 255, .76)",
        borderWidth: 1,
        shadowBlur: 20,
        shadowColor: glow,
        shadowOffsetY: 2,
        opacity: restingOpacity == null ? .88 : restingOpacity
      };
    }
    var categories = [
      { name: "项目", itemStyle: sphereStyle("#f4f8ff", "#80a7ff", "#2758dc", "rgba(67, 118, 255, .48)") },
      { name: "过程", itemStyle: sphereStyle("#f6f2ff", "#9f8cf2", "#46507f", "rgba(145, 121, 255, .34)") },
      { name: "完整", itemStyle: sphereStyle("#ecfff9", "#48d6aa", "#087d61", "rgba(44, 218, 166, .4)") },
      { name: "阻断", itemStyle: sphereStyle("#fff1f4", "#ff7b8c", "#c7224d", "rgba(255, 75, 112, .45)", .9) },
      { name: "缺失", itemStyle: sphereStyle("#f8faff", "#aab7cc", "#536078", "rgba(150, 166, 196, .25)", .82) }
    ];
    var chart = echarts.init(node);
    chart.setOption({
      animation: !reducedMotion,
      animationDuration: 1050,
      animationDurationUpdate: 650,
      animationEasing: "cubicOut",
      animationEasingUpdate: "quinticInOut",
      aria: { enabled: true, description: "展示项目、Commit、扫描器、问题来源与门禁结论的关联证据链" },
      tooltip: {
        backgroundColor: "rgba(9, 15, 30, .94)",
        borderColor: "#334766",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: "#dbe7fb", fontSize: 11 },
        extraCssText: "border-radius:10px;box-shadow:0 16px 38px rgba(0,0,0,.35);backdrop-filter:blur(12px)",
        formatter: function (params) { return '<strong style="color:#fff">' + escapeHtml(params.data.name || "") + '</strong><br/><span style="color:#9fb0cb">' + escapeHtml(params.data.detail || "") + '</span>'; }
      },
      legend: [{
        bottom: 14,
        left: "center",
        data: ["项目", "过程", "完整", "阻断", "缺失"],
        itemWidth: 17,
        itemHeight: 8,
        itemGap: 18,
        selectedMode: "multiple",
        textStyle: { color: "#5e6d82", fontSize: 10 }
      }],
      series: [{
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        categories: categories,
        data: graphNodes,
        links: links,
        edgeSymbol: ["none", "circle"],
        edgeSymbolSize: [0, 3],
        force: { repulsion: 350, edgeLength: [98, 184], gravity: 0.055, friction: .62 },
        label: {
          show: true,
          position: "right",
          distance: 8,
          color: "#25354f",
          fontSize: 11,
          fontWeight: 620,
          textBorderColor: "rgba(255, 255, 255, .94)",
          textBorderWidth: 3
        },
        lineStyle: {
          color: "source",
          curveness: 0.1,
          opacity: .28,
          width: 1.25,
          shadowBlur: 7,
          shadowColor: "rgba(83, 118, 180, .28)"
        },
        emphasis: {
          focus: "adjacency",
          scale: 1.16,
          itemStyle: { opacity: 1, borderColor: "rgba(255,255,255,.72)", borderWidth: 0, shadowBlur: 32 },
          label: { color: "#14213a", fontSize: 12 },
          lineStyle: { width: 2.6, opacity: .9, shadowBlur: 12 }
        },
        blur: { itemStyle: { opacity: .14 }, lineStyle: { opacity: .05 }, label: { opacity: .18 } }
      }]
    });
    qualityCharts.push(chart);
  }

  function render() {
    if (!active) return;
    var pageElement = ensurePage();
    if (!pageElement) return;
    var focusedSearch = document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-quality-governance-search], [data-quality-search]")
      ? (document.activeElement.matches("[data-quality-governance-search]") ? "[data-quality-governance-search]" : "[data-quality-search]")
      : "";
    var focusedSearchPosition = focusedSearch && typeof document.activeElement.selectionStart === "number" ? document.activeElement.selectionStart : null;
    if (loading && !overview) {
      pageElement.innerHTML = '<div class="code-quality-loading">' + icon("loader-circle", "spin") + '<strong>正在加载代码质检工作台…</strong><span>正在同步项目与策略信息</span></div>';
      requestAnimationFrame(hydrateIcons);
      return;
    }
    var project = currentProject();
    disposePipelineMotion();
    disposeQualityCharts();
    pageElement.innerHTML = qualityLayer === "governance" ? renderGovernance() : qualityLayer === "finding" ? renderFindingWorkbench() + renderPolicyDialog() + renderReportDialog() : renderProjectReport();
    requestAnimationFrame(function () {
      hydrateIcons();
      drawScoreChart();
      if (qualityLayer === "governance") initGovernanceCharts();
      if (qualityLayer === "report" && reportTab === "chain") initEvidenceChain();
      if (focusedSearch) {
        var nextSearch = document.querySelector("#" + PAGE_ID + " " + focusedSearch);
        if (nextSearch) {
          nextSearch.focus({ preventScroll: true });
          if (focusedSearchPosition != null && typeof nextSearch.setSelectionRange === "function") nextSearch.setSelectionRange(focusedSearchPosition, focusedSearchPosition);
        }
      }
    });
  }

  async function loadScan(runId) {
    if (!runId) {
      scan = null;
      render();
      return;
    }
    scan = await requestJson("/api/code-quality/scans/" + Number(runId));
    var project = currentProject();
    if (project) project.latest_scan = scan;
    render();
    if (["queued", "running"].includes(scan.status)) startPolling();
    else stopPolling();
  }

  async function loadBranches(projectId) {
    var project = currentProject();
    branches = [];
    branchError = "";
    if (!project || !project.gitlab_configured || Number(project.id) !== Number(projectId)) return;
    branchLoading = true;
    render();
    try {
      var result = await requestJson("/api/projects/" + Number(projectId) + "/code-quality-branches");
      if (Number(selectedProjectId) !== Number(projectId)) return;
      branches = Array.isArray(result.branches) ? result.branches : [];
      var names = branches.map(function (item) { return item.name; });
      if (!branch || !names.includes(branch)) branch = result.default_branch || project.default_branch || "main";
    } catch (error) {
      if (Number(selectedProjectId) !== Number(projectId)) return;
      branchError = error.message || "无法读取分支";
    } finally {
      if (Number(selectedProjectId) === Number(projectId)) {
        branchLoading = false;
        render();
      }
    }
  }

  async function loadHistory(projectId) {
    try {
      var result = await requestJson("/api/projects/" + Number(projectId) + "/code-quality-scans?limit=20");
      if (Number(selectedProjectId) === Number(projectId)) scanHistory = Array.isArray(result) ? result : [];
    } catch (_) {
      if (Number(selectedProjectId) === Number(projectId)) scanHistory = [];
    }
  }

  async function selectProject(projectId, keepBranch) {
    selectedProjectId = Number(projectId || 0);
    var project = currentProject();
    if (!keepBranch) branch = project ? project.default_branch || "main" : "";
    scan = null;
    scanHistory = [];
    branches = [];
    branchError = "";
    selectedFindingId = 0;
    page = 1;
    render();
    if (!project) return;
    await Promise.all([loadHistory(project.id), loadBranches(project.id)]);
    if (Number(selectedProjectId) !== Number(project.id)) return;
    if (project.latest_scan) {
      try { await loadScan(project.latest_scan.id); }
      catch (error) { showToast(error.message || "质检报告读取失败", "error"); }
    } else {
      render();
    }
  }

  async function loadTriageEvents(findingId) {
    if (!findingId) {
      triageEvents = [];
      triageEventsLoading = false;
      return;
    }
    triageEventsLoading = true;
    render();
    try {
      var result = await requestJson("/api/code-quality/findings/" + Number(findingId) + "/triage-events");
      if (Number(selectedFindingId) === Number(findingId)) triageEvents = Array.isArray(result) ? result : [];
    } catch (error) {
      if (Number(selectedFindingId) === Number(findingId)) {
        triageEvents = [];
        showToast(error.message || "处置审计读取失败", "error");
      }
    } finally {
      if (Number(selectedFindingId) === Number(findingId)) {
        triageEventsLoading = false;
        render();
      }
    }
  }

  function openFindingWorkbench(findingId) {
    selectedFindingId = Number(findingId || 0);
    triageDraftStatus = "";
    triageDraftReason = "";
    triageDraftExpiresOn = "";
    triageEvents = [];
    qualityLayer = "finding";
    render();
    loadTriageEvents(selectedFindingId);
  }

  async function openProjectReport(projectId) {
    qualityLayer = "report";
    reportTab = "evidence";
    governancePage = 1;
    await selectProject(projectId, false);
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    loadError = "";
    render();
    try {
      var results = await Promise.allSettled([
        requestJson("/api/code-quality/overview"),
        requestJson("/api/code-quality/policy")
      ]);
      if (results[0].status !== "fulfilled") throw results[0].reason;
      overview = results[0].value;
      if (!Array.isArray(overview.projects)) overview.projects = [];
      policy = results[1].status === "fulfilled" ? results[1].value : null;
      if (!scanModeOptions().some(function (item) { return item.value === scanMode && !item.disabled; })) scanMode = "full";
      var exists = overview.projects.some(function (item) { return Number(item.id) === Number(selectedProjectId); });
      var initial = exists ? selectedProjectId : (overview.projects[0] && overview.projects[0].id);
      await selectProject(initial, exists);
    } catch (error) {
      overview = overview || { projects: [], summary: {} };
      loadError = error.message || "代码质检数据加载失败";
    } finally {
      loading = false;
      render();
    }
  }

  async function startScan() {
    var project = currentProject();
    if (!project || starting) return;
    if (!project.gitlab_configured) {
      showToast("请先在 GitLab 集成中关联仓库", "error");
      return;
    }
    starting = true;
    render();
    try {
      scan = await requestJson("/api/projects/" + Number(project.id) + "/code-quality-scans", {
        method: "POST",
        body: JSON.stringify({ branch: compact(branch) || project.default_branch || "main", scan_mode: scanMode })
      });
      project.latest_scan = scan;
      scanHistory.unshift(scan);
      showToast("质检任务已启动，正在只读扫描仓库", "success");
      startPolling();
    } catch (error) {
      showToast(error.message || "质检启动失败", "error");
    } finally {
      starting = false;
      render();
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(async function () {
      if (!active || !scan || !["queued", "running"].includes(scan.status)) return;
      try {
        await loadScan(scan.id);
        if (scan && scan.status === "completed") await loadHistory(selectedProjectId);
      } catch (error) {
        stopPolling();
        showToast(error.message || "扫描状态读取失败", "error");
      }
    }, 1500);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  async function triageFinding(status, reason, expiresAt) {
    var finding = currentFinding();
    if (!finding) return;
    try {
      var updated = await requestJson("/api/code-quality/findings/" + Number(finding.id), {
        method: "PATCH",
        body: JSON.stringify({ status: status, reason: reason || "", expires_at: expiresAt || null })
      });
      scan.findings = scan.findings.map(function (item) { return item.id === updated.id ? updated : item; });
      await loadScan(scan.id);
      selectedFindingId = updated.id;
      triageDraftStatus = "";
      triageDraftReason = "";
      triageDraftExpiresOn = "";
      triageSaving = false;
      render();
      loadTriageEvents(updated.id);
      showToast("处理状态已更新，质量门禁已重新计算", "success");
    } catch (error) {
      triageSaving = false;
      showToast(error.message || "状态更新失败", "error");
      render();
    }
  }

  function beginGovernedTriage(status) {
    if (status !== "false_positive" && status !== "accepted_risk") {
      triageFinding(status, "", null);
      return;
    }
    triageDraftStatus = status;
    triageDraftReason = "";
    triageDraftExpiresOn = status === "accepted_risk" ? localDateAfter(30) : "";
    render();
  }

  function confirmGovernedTriage() {
    var minimum = Number(policy && policy.limits && policy.limits.triage_reason_min_length || 10);
    if (compact(triageDraftReason).length < minimum) {
      showToast("请填写至少 " + minimum + " 个字符的处置依据", "error");
      return;
    }
    var expiresAt = null;
    if (triageDraftStatus === "accepted_risk") {
      if (!triageDraftExpiresOn) {
        showToast("请选择风险接受到期日", "error");
        return;
      }
      var expiry = new Date(triageDraftExpiresOn + "T23:59:59");
      if (Number.isNaN(expiry.getTime())) {
        showToast("风险接受到期日格式不正确", "error");
        return;
      }
      expiresAt = expiry.toISOString();
    }
    triageSaving = true;
    render();
    triageFinding(triageDraftStatus, compact(triageDraftReason), expiresAt);
  }

  function exportReport() {
    if (!scan) return;
    var payload = { exported_at: new Date().toISOString(), report_number: reportNumber(), project: currentProject() && currentProject().name, scan: scan };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "代码质检报告-" + compact(currentProject() && currentProject().name || "project").replace(/[\\/:*?\"<>|]+/g, "-") + "-" + scan.id + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("质检报告已导出", "success");
  }

  function downloadProjectPdf() {
    if (!scan || !scan.id) return;
    var link = document.createElement("a");
    link.href = "/api/code-quality/scans/" + Number(scan.id) + "/report.pdf?audience=project";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("正在生成代码质检 PDF", "success");
  }

  function downloadSarif() {
    if (!scan || !scan.id) return;
    var link = document.createElement("a");
    link.href = "/api/code-quality/scans/" + Number(scan.id) + "/report.sarif";
    link.download = "代码质检报告-" + Number(scan.id) + ".sarif";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("已开始导出 SARIF，可用于 reviewdog 与 GitLab MR", "success");
  }

  function openSourceLink(anchor, event) {
    if (!anchor || !anchor.href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var opened = window.open(anchor.href, "_blank");
    if (opened) {
      try { opened.opener = null; } catch (_) { /* cross-origin window */ }
      return;
    }
    showToast("浏览器阻止了新标签页，请允许弹出窗口后重试", "error");
  }

  function navigateToSidebar(label) {
    var buttons = Array.from(document.querySelectorAll(".sidebar button"));
    var target = buttons.find(function (button) { return navLabel(button).indexOf(label) === 0; });
    if (!target) {
      showToast("未找到“" + label + "”入口", "error");
      return;
    }
    deactivate();
    window.setTimeout(function () { target.click(); }, 0);
  }

  function showToast(message, tone) {
    var previous = document.querySelector(".code-quality-toast");
    if (previous) previous.remove();
    var toast = document.createElement("div");
    toast.className = "code-quality-toast " + (tone || "");
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(function () { toast.classList.add("visible"); }, 10);
    window.setTimeout(function () { toast.classList.remove("visible"); }, 3000);
    window.setTimeout(function () { toast.remove(); }, 3300);
  }

  function closeQualitySelects(except) {
    document.querySelectorAll(".quality-select.is-open").forEach(function (select) {
      if (select === except) return;
      select.classList.remove("is-open");
      var toggle = select.querySelector("[data-quality-select-toggle]");
      var menu = select.querySelector(".quality-select-menu");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (menu) menu.setAttribute("aria-hidden", "true");
    });
  }

  function toggleQualitySelect(toggle) {
    if (!toggle || toggle.disabled) return;
    var select = toggle.closest(".quality-select");
    if (!select) return;
    var shouldOpen = !select.classList.contains("is-open");
    closeQualitySelects(select);
    select.classList.toggle("is-open", shouldOpen);
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    var menu = select.querySelector(".quality-select-menu");
    if (menu) menu.setAttribute("aria-hidden", String(!shouldOpen));
  }

  function applyQualitySelect(key, value) {
    closeQualitySelects();
    if (key === "project") { selectProject(value, false); return; }
    if (key === "branch") { branch = value; render(); return; }
    if (key === "mode") { scanMode = value; render(); }
  }

  function activate() {
    if (!active) window.dispatchEvent(new CustomEvent(WORKBENCH_ROUTE_EVENT, { detail: { hash: HASH } }));
    active = true;
    if (window.location.hash !== HASH) window.location.hash = HASH;
    document.documentElement.classList.add("legacy-code-quality-view");
    ensureNav();
    ensurePage();
    render();
    if (!overview && !loading) loadData();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    document.documentElement.classList.remove("legacy-code-quality-view");
    disposePipelineMotion();
    if (searchTimer) window.clearTimeout(searchTimer);
    var pageElement = document.getElementById(PAGE_ID);
    if (pageElement) pageElement.remove();
    stopPolling();
    ensureNav();
    if (window.location.hash === HASH) window.history.replaceState(window.history.state, document.title, window.location.pathname + window.location.search);
  }

  function enhance() {
    scheduled = false;
    ensureNav();
    if (!active) return;
    document.documentElement.classList.add("legacy-code-quality-view");
    var pageElement = ensurePage();
    if (pageElement && !pageElement.hasChildNodes()) render();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  document.addEventListener("change", function (event) {
    if (!active || !event.target || !event.target.matches) return;
    if (event.target.matches("[data-quality-project]")) selectProject(event.target.value, false);
    if (event.target.matches("[data-quality-branch]")) branch = event.target.value;
    if (event.target.matches("[data-quality-mode]")) scanMode = event.target.value;
    if (event.target.matches("[data-quality-governance-status]")) {
      governanceGateFilter = event.target.value || "all";
      governancePage = 1;
      render();
    }
    if (event.target.matches("[data-quality-governance-coverage]")) {
      governanceCoverageFilter = event.target.value || "all";
      governancePage = 1;
      render();
    }
  });

  document.addEventListener("input", function (event) {
    if (!active || !event.target || !event.target.matches) return;
    if (event.target.matches("[data-quality-search]")) {
      query = event.target.value;
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        searchTimer = 0;
        transitionFindings(function () { page = 1; });
      }, 90);
    }
    if (event.target.matches("[data-quality-governance-search]")) {
      governanceQuery = event.target.value;
      governancePage = 1;
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        searchTimer = 0;
        render();
      }, 120);
    }
    if (event.target.matches("[data-quality-triage-reason]")) {
      triageDraftReason = event.target.value;
    }
    if (event.target.matches("[data-quality-triage-expiry]")) {
      triageDraftExpiresOn = event.target.value;
    }
  });

  document.addEventListener("click", function (event) {
    if (!event.target || !event.target.closest) return;
    var target;
    if ((target = event.target.closest("[data-quality-select-toggle]"))) {
      event.preventDefault();
      toggleQualitySelect(target);
      return;
    }
    if ((target = event.target.closest("[data-quality-select-option]"))) {
      event.preventDefault();
      if (!target.disabled) applyQualitySelect(target.dataset.qualitySelectKey, target.dataset.qualitySelectValue);
      return;
    }
    closeQualitySelects();
    if ((target = event.target.closest("[data-quality-governance-filter]"))) {
      governanceGateFilter = target.dataset.qualityGovernanceFilter || "all";
      governancePage = 1;
      render();
      return;
    }
    if ((target = event.target.closest("[data-quality-governance-page]"))) {
      if (!target.disabled) {
        governancePage = Number(target.dataset.qualityGovernancePage || 1);
        render();
      }
      return;
    }
    if ((target = event.target.closest("[data-quality-governance-reset]"))) {
      governanceQuery = "";
      governanceGateFilter = "all";
      governanceCoverageFilter = "all";
      governancePage = 1;
      render();
      return;
    }
    if ((target = event.target.closest("[data-quality-governance-refresh]"))) {
      overview = null;
      scan = null;
      loadData();
      return;
    }
    if ((target = event.target.closest("[data-quality-open-project]"))) {
      event.preventDefault();
      openProjectReport(target.dataset.qualityOpenProject);
      return;
    }
    if ((target = event.target.closest("[data-quality-back-governance]"))) {
      qualityLayer = "governance";
      reportTab = "evidence";
      selectedFindingId = 0;
      triageEvents = [];
      render();
      return;
    }
    if ((target = event.target.closest("[data-quality-back-report]"))) {
      qualityLayer = "report";
      reportTab = "findings";
      selectedFindingId = 0;
      triageEvents = [];
      render();
      return;
    }
    if ((target = event.target.closest("[data-quality-report-tab]"))) {
      reportTab = target.dataset.qualityReportTab || "evidence";
      qualityLayer = "report";
      render();
      return;
    }
    if ((target = event.target.closest("[data-quality-load-scan]"))) {
      loadScan(target.dataset.qualityLoadScan);
      return;
    }
    if ((target = event.target.closest("[data-quality-chain-reset]"))) {
      var chartNode = document.querySelector("[data-quality-evidence-chain]");
      var echarts = window.ProjectOperationsECharts;
      var chainChart = echarts && chartNode ? echarts.getInstanceByDom(chartNode) : null;
      if (chainChart) {
        chainChart.dispose();
        qualityCharts = qualityCharts.filter(function (item) { return item !== chainChart; });
        initEvidenceChain();
      }
      return;
    }
    if ((target = event.target.closest("[data-quality-start]"))) { event.preventDefault(); startScan(); return; }
    if ((target = event.target.closest("[data-quality-source-link]"))) { openSourceLink(target, event); return; }
    if ((target = event.target.closest("[data-quality-export]"))) { event.preventDefault(); exportReport(); return; }
    if ((target = event.target.closest("[data-quality-sarif]"))) { event.preventDefault(); downloadSarif(); return; }
    if ((target = event.target.closest("[data-quality-pdf]"))) { event.preventDefault(); if (!target.disabled) downloadProjectPdf(); return; }
    if ((target = event.target.closest("[data-quality-policy]"))) { dialog = "policy"; render(); return; }
    if ((target = event.target.closest("[data-quality-report]"))) { if (!target.disabled) { dialog = "report"; render(); } return; }
    if ((target = event.target.closest("[data-quality-severity]"))) { transitionFindings(function () { severityFilter = target.dataset.qualitySeverity; page = 1; }); return; }
    if ((target = event.target.closest("[data-quality-page]"))) { if (!target.disabled) transitionFindings(function () { page = Number(target.dataset.qualityPage || 1); }); return; }
    if ((target = event.target.closest("[data-quality-finding]"))) { openFindingWorkbench(target.dataset.qualityFinding); return; }
    if ((target = event.target.closest("[data-quality-triage-confirm]"))) { confirmGovernedTriage(); return; }
    if ((target = event.target.closest("[data-quality-triage-cancel]"))) { triageDraftStatus = ""; triageDraftReason = ""; triageDraftExpiresOn = ""; render(); return; }
    if ((target = event.target.closest("[data-quality-triage]"))) { beginGovernedTriage(target.dataset.qualityTriage); return; }
    // The backdrop carries the close attribute, so an event originating from
    // any child (including the GitLab source link) also matches
    // `closest('[data-quality-close-drawer]')`.  This listener runs in the
    // capture phase; re-rendering here would remove the anchor before the
    // browser performs its default navigation.  Only close when the backdrop
    // itself (or an explicit close control) was clicked.
    if ((target = event.target.closest("[data-quality-close-drawer]"))) {
      if (target.classList.contains("code-quality-drawer-backdrop") && event.target !== target) return;
      selectedFindingId = 0;
      triageDraftStatus = "";
      triageDraftReason = "";
      triageDraftExpiresOn = "";
      render();
      return;
    }
    if ((target = event.target.closest("[data-quality-close-modal]"))) {
      if (target.classList.contains("code-quality-modal-backdrop") && event.target !== target) return;
      dialog = "";
      render();
      return;
    }
    if (event.target.closest("[data-quality-reload]")) { overview = null; scan = null; loadData(); return; }
    if (event.target.closest("[data-quality-reload-branches]")) { loadBranches(selectedProjectId); return; }
    if (event.target.closest("[data-quality-open-gitlab]")) { navigateToSidebar("GitLab 集成"); return; }
    if (active && event.target.closest(".sidebar button") && !event.target.closest(".sidebar-collapse-btn, .sidebar-resize-handle, .sidebar-foot, .o2o-primary-footer") && !event.target.closest(".sidebar .nav-group > button") && !event.target.closest("[" + NAV_ATTR + "]")) deactivate();
  }, true);

  window.addEventListener(WORKBENCH_ROUTE_EVENT, function (event) {
    if (event.detail && event.detail.hash === HASH) return;
    if (active) deactivate();
    else ensureNav();
  });

  window.addEventListener("hashchange", function () {
    if (window.location.hash === HASH) activate();
    else if (active) deactivate();
  });

  document.addEventListener("keydown", function (event) {
    var findingRow = event.target && event.target.closest ? event.target.closest("[data-quality-finding]") : null;
    if (findingRow && event.target === findingRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openFindingWorkbench(findingRow.dataset.qualityFinding);
      return;
    }
    var governanceRow = event.target && event.target.closest ? event.target.closest("[data-quality-open-project]") : null;
    if (governanceRow && event.target === governanceRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openProjectReport(governanceRow.dataset.qualityOpenProject);
      return;
    }
    var select = event.target && event.target.closest ? event.target.closest(".quality-select") : null;
    if (select) {
      var toggle = select.querySelector("[data-quality-select-toggle]");
      var options = Array.from(select.querySelectorAll("[data-quality-select-option]:not(:disabled)"));
      var optionIndex = options.indexOf(event.target);
      if (event.target === toggle && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        if (!select.classList.contains("is-open")) toggleQualitySelect(toggle);
        var selectedOption = options.find(function (option) { return option.getAttribute("aria-selected") === "true"; });
        (selectedOption || (event.key === "ArrowDown" ? options[0] : options[options.length - 1]))?.focus();
        return;
      }
      if (optionIndex >= 0 && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        var nextIndex = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (optionIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[nextIndex]?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeQualitySelects();
        toggle?.focus();
        return;
      }
    }
    if (event.key === "Escape") {
      if (qualityLayer === "finding") { qualityLayer = "report"; reportTab = "findings"; selectedFindingId = 0; triageEvents = []; render(); }
      else if (selectedFindingId) { selectedFindingId = 0; render(); }
      else if (dialog) { dialog = ""; render(); }
    }
  });

  document.addEventListener("DOMContentLoaded", schedule);
  new MutationObserver(function (mutations) {
    var pageElement = document.getElementById(PAGE_ID);
    var onlyQualityPageChanged = Boolean(pageElement) && mutations.every(function (mutation) {
      return mutation.target === pageElement || pageElement.contains(mutation.target);
    });
    if (!onlyQualityPageChanged) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  if (active) activate();
})();
