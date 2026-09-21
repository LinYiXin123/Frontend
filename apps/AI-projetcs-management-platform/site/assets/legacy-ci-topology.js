(function () {
  const USER_KEY = "ai_project_hub_user_id";
  const CARD_ID = "legacy-ci-topology-card";
  const TOAST_CLASS = "ci-topology-toast";
  const ENV_ORDER = ["uat", "test", "staging", "pre", "prod", "production"];

  let queued = false;
  let activeProjectId = null;
  let topologyCache = new Map();
  let runtimeCache = new Map();
  let inflight = null;

  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();

  const escapeHtml = value =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const getUserHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    const userId = localStorage.getItem(USER_KEY);
    if (userId) headers["X-User-Id"] = userId;
    return headers;
  };

  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getUserHeaders(),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || body?.message || `请求失败：${response.status}`);
    return body;
  };

  const showToast = message => {
    document.querySelector(`.${TOAST_CLASS}`)?.remove();
    const toast = document.createElement("div");
    toast.className = TOAST_CLASS;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  };

  const getProjectIdFromPage = () => {
    const target = document.querySelector(".project-detail-page .basic-card") || document.querySelector(".project-detail-page");
    const match = (target?.textContent || "").match(/PRJ-(\d+)/);
    return match ? Number(match[1]) : null;
  };

  const getProjectTitleFromPage = () =>
    text(document.querySelector(".project-detail-page .detail-title-row h1")?.textContent) || "当前项目";

  const getRepoUrlFromPage = () => {
    const links = Array.from(document.querySelectorAll(".project-detail-page a[href]"));
    const repo = links.find(link => /git\.joincare\.com\.cn|10\.10\.132\.18/i.test(link.href));
    return repo?.href || "";
  };

  const formatDateTime = value => {
    if (!value) return "暂无";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const envLabel = env => {
    const map = {
      uat: "UAT 环境",
      test: "测试环境",
      staging: "预发环境",
      pre: "预发环境",
      prod: "生产环境",
      production: "生产环境"
    };
    return map[String(env || "").toLowerCase()] || `${env || "未知"} 环境`;
  };

  const pipelineStatusLabel = status => {
    const map = {
      success: "成功",
      failed: "失败",
      running: "运行中",
      pending: "等待中",
      manual: "手动待触发",
      created: "已创建",
      skipped: "跳过",
      canceled: "已取消",
      never: "未同步",
      unknown: "未知"
    };
    return map[String(status || "").toLowerCase()] || status || "暂无";
  };

  const deliveryStepStatusLabel = status => ({
    success: "已完成",
    failed: "需要技术处理",
    running: "正在处理",
    pending: "等待开始",
    created: "等待开始",
    manual: "等待技术确认",
    skipped: "本次未执行",
    canceled: "已取消"
  }[String(status || "").toLowerCase()] || "等待确认");

  const statusClass = status => {
    const normalized = String(status || "").toLowerCase();
    if (["success", "passed", "topology_ready"].includes(normalized)) return "success";
    if (["failed", "error", "ci_config_missing", "parse_failed", "permission_failed", "sync_failed", "no_deploy_targets"].includes(normalized)) return "danger";
    if (["running", "pending", "not_synced"].includes(normalized)) return "running";
    if (["manual", "created", "skipped", "gitlab_unbound", "never"].includes(normalized)) return "manual";
    return "neutral";
  };

  const shortModuleName = value => {
    const raw = String(value || "");
    return raw
      .replace(/^joincare-ops-/, "")
      .replace(/^joincare-/, "")
      .replace(/^ops-/, "") || "unknown";
  };

  const unique = values => Array.from(new Set((values || []).filter(Boolean)));

  const sortEnvironments = entries =>
    entries.sort(([left], [right]) => {
      const leftIndex = ENV_ORDER.indexOf(String(left).toLowerCase());
      const rightIndex = ENV_ORDER.indexOf(String(right).toLowerCase());
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex) || String(left).localeCompare(String(right));
    });

  const groupTargets = targets => {
    const groups = new Map();
    (targets || []).forEach(target => {
      const env = target.environment || "unknown";
      if (!groups.has(env)) groups.set(env, []);
      groups.get(env).push(target);
    });
    return sortEnvironments(Array.from(groups.entries()));
  };

  const getStageStats = (topology, stage) => topology?.pipeline_summary?.stages?.[stage] || null;

  const getStageStatus = (topology, stage) => {
    const stats = getStageStats(topology, stage);
    const job = stats?.jobs?.[0];
    return job?.status || (stats?.success ? "success" : stats?.manual ? "manual" : stats?.failed ? "failed" : "created");
  };

  const renderChip = (label, className = "") => `<span class="ci-chip ${className}">${escapeHtml(label)}</span>`;

  const renderStat = (label, value, helper, tone = "") => `
    <article class="ci-stat ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(helper)}</em>
    </article>
  `;

  const listItems = items => items?.length
    ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>暂无</p>";

  const readinessFallback = topology => topology?.readiness || {
    category: topology?.sync_status || "never",
    label: pipelineStatusLabel(topology?.sync_status || "never"),
    production_ready: false,
    topology_ready: false,
    runtime_ready: false,
    runtime_status: { label: "服务可用性待确认", message: "尚未接入服务可用性检查。" },
    blockers: [],
    warnings: [],
    next_actions: ["更新交付准备后查看项目交付结论。"],
    facts: {}
  };

  const customerSummary = (topology, state = {}) => {
    const readiness = readinessFallback(topology);
    const checks = topology?.runtime_checks?.checks || [];
    const incidents = topology?.runtime_checks?.incidents || [];
    const healthyChecks = checks.filter(check => ["healthy", "configured"].includes(String(check.monitor_state || check.last_probe_status || "").toLowerCase()));
    const checkedEnvironments = unique(checks.map(check => String(check.environment || "").toLowerCase()));
    const openIncidents = incidents.filter(incident => incident.status === "open");
    const runtimeHealthy = checks.length > 0 && healthyChecks.length === checks.length && openIncidents.length === 0;
    const blockerCount = readiness.blockers?.length || 0;
    const warningCount = readiness.warnings?.length || 0;
    const category = readiness.category || topology?.sync_status || "never";

    if (state.loading || state.syncing) {
      return {
        tone: "checking",
        badge: "正在更新",
        title: "正在更新项目交付准备",
        description: "请稍候，系统正在核对项目是否可以正常使用，以及正式交付前还需要完成的准备。",
        facts: [
          { label: "当前情况", value: "正在检查" },
          { label: "还需处理", value: "等待结果" },
          { label: "建议动作", value: "无需操作" }
        ],
        actionLabel: "更新中..."
      };
    }

    if (state.error) {
      return {
        tone: "attention",
        badge: "待确认",
        title: "暂时无法确认交付准备",
        description: "本次更新没有完成，不影响继续查看项目；建议稍后再次更新交付准备。",
        facts: [
          { label: "当前情况", value: "检查未完成" },
          { label: "还需处理", value: "交付条件待确认" },
          { label: "建议动作", value: "再次更新" }
        ],
        actionLabel: "再次更新"
      };
    }

    if (readiness.production_ready) {
      return {
        tone: "success",
        badge: "可进入验收",
        title: "项目已具备正式交付条件",
        description: runtimeHealthy
          ? `已确认 ${checkedEnvironments.length || checks.length} 个服务地址可以正常访问，当前没有发现影响交付的问题。`
          : "项目交付准备已完成，当前没有发现影响正式交付的问题。",
        facts: [
          { label: "当前情况", value: runtimeHealthy ? "服务可以正常使用" : "交付准备已完成" },
          { label: "还需处理", value: warningCount ? `${warningCount} 项提醒` : "暂无阻碍" },
          { label: "建议动作", value: "进入验收" }
        ],
        actionLabel: "更新交付准备"
      };
    }

    if (["not_synced", "never"].includes(category)) {
      return {
        tone: "neutral",
        badge: "待检查",
        title: "项目交付准备尚未确认",
        description: "更新一次后，系统会汇总项目能否正常使用、是否具备正式交付条件，以及需要推进的事项。",
        facts: [
          { label: "当前情况", value: "尚未检查" },
          { label: "还需处理", value: "交付条件未知" },
          { label: "建议动作", value: "更新交付准备" }
        ],
        actionLabel: "更新交付准备"
      };
    }

    if (category === "gitlab_unbound") {
      return {
        tone: "neutral",
        badge: "待完善",
        title: "暂时无法自动确认交付准备",
        description: "项目还没有关联研发信息，平台暂时无法自动汇总交付准备；请项目负责人协调技术负责人补充。",
        facts: [
          { label: "当前情况", value: "研发信息未关联" },
          { label: "还需处理", value: "无法自动汇总" },
          { label: "建议动作", value: "请技术负责人补充" }
        ],
        actionLabel: "更新交付准备"
      };
    }

    if (category === "no_deploy_targets") {
      return {
        tone: "attention",
        badge: "需完善",
        title: "项目可以正常使用，正式交付前还差 1 项准备",
        description: runtimeHealthy
          ? `已确认 ${checkedEnvironments.length || checks.length} 个服务地址可以正常访问；正式交付前，请技术负责人补充发布流程。`
          : "项目当前可以继续推进；正式交付前，请技术负责人补充发布流程。",
        facts: [
          { label: "当前情况", value: runtimeHealthy ? "服务可以正常使用" : "项目可继续推进" },
          { label: "还需处理", value: "补充发布流程" },
          { label: "建议动作", value: "请技术负责人确认" }
        ],
        actionLabel: "更新交付准备"
      };
    }

    return {
      tone: blockerCount ? "danger" : "attention",
      badge: blockerCount ? "需处理" : "需确认",
      title: blockerCount ? "正式交付前还有事项需要处理" : "项目交付准备基本完成",
      description: blockerCount
        ? `系统发现 ${blockerCount} 个可能影响正式交付的事项，处理完成后再进入验收。`
        : `当前没有明确阻碍，但有 ${warningCount || 1} 项提醒建议在正式交付前确认。`,
      facts: [
        { label: "当前情况", value: runtimeHealthy ? "服务可以正常使用" : "服务状态待确认" },
        { label: "还需处理", value: blockerCount ? `${blockerCount} 项待处理` : `${warningCount || 1} 项待确认` },
        { label: "建议动作", value: blockerCount ? "处理待办事项" : "完成交付确认" }
      ],
      actionLabel: "更新交付准备"
    };
  };

  const runtimeStatusClass = status => ({
    healthy: "ok",
    configured: "ok",
    recovering: "warn",
    degraded: "warn",
    down: "danger",
    pending: "warn",
    pending_probe: "warn",
    unhealthy: "danger",
    error: "danger",
    not_configured: "warn"
  }[status] || "warn");

  const runtimeCheckLabel = status => ({
    healthy: "健康",
    recovering: "恢复确认中",
    degraded: "波动待确认",
    down: "故障",
    pending: "等待首检",
    unhealthy: "异常",
    error: "探测失败",
    never: "未探测"
  }[status] || "未探测");

  const runtimeIncidentLabel = incident => incident?.status === "open" ? "处理中" : "已恢复";

  const renderRuntimePanel = topology => {
    const runtime = topology?.runtime_checks;
    const checks = runtime?.checks || [];
    const incidents = (runtime?.incidents || []).slice(0, 6);
    const monitor = runtime?.monitor || runtime?.runtime_status?.auto_monitor || {};
    const suggestions = runtime?.suggestions || [];
    const status = runtime?.runtime_status || readinessFallback(topology).runtime_status || {};
    const missing = suggestions.filter(item => !item.configured).slice(0, 6);
    return `
      <section class="ci-runtime-panel">
        <div class="ci-section-title">
          <div>
            <h3>服务可用性检查</h3>
            <p>系统定期访问已登记的服务地址，确认项目能否正常使用。</p>
          </div>
          ${renderChip(status.label || "服务可用性待确认", runtimeStatusClass(status.status))}
        </div>
        <div class="ci-runtime-summary">
          <article>
            <b>${escapeHtml(status.label || "服务可用性待确认")}</b>
            <p>${escapeHtml(status.message || "尚未登记可自动检查的服务地址。")}</p>
            <div class="ci-runtime-monitor-meta">
              <span class="${monitor.enabled && monitor.worker_running ? "ok" : "warn"}">${monitor.enabled && monitor.worker_running ? `每 ${monitor.interval_seconds || 60} 秒自动检查一次` : monitor.enabled ? "自动检查暂未运行" : "自动检查尚未启用"}</span>
              <span>连续异常时会生成故障提醒</span>
              <span class="${monitor.notification_dry_run ? "warn" : "ok"}">${monitor.notification_dry_run ? "当前仅演练通知" : "故障提醒已启用"}</span>
            </div>
          </article>
          <div class="ci-runtime-actions">
            <button type="button" data-ci-runtime-copy>复制给技术负责人</button>
            <button type="button" class="primary" data-ci-runtime-probe="${activeProjectId || ""}">立即更新检查</button>
          </div>
        </div>
        ${checks.length ? `
          <div class="ci-runtime-checks">
            ${checks.map(check => `
              <article class="ci-runtime-check ${runtimeStatusClass(check.monitor_state || check.last_probe_status)}">
                <div>
                  <b>${escapeHtml(check.module_name || "未命名服务")}</b>
                  <p>${escapeHtml(envLabel(check.environment))} · 服务地址已登记</p>
                  <small>${check.last_probe_at ? `最近确认：${formatDateTime(check.last_probe_at)}` : "暂未完成服务检查"}${Number.isFinite(check.last_probe_latency_ms) ? ` · 响应约 ${escapeHtml(check.last_probe_latency_ms)} ms` : ""}</small>
                  <small class="ci-runtime-counters">${runtimeCheckLabel(check.monitor_state || check.last_probe_status) === "健康" ? "最近一次检查确认可正常访问" : "请技术负责人确认服务状态"}</small>
                </div>
                ${renderChip(runtimeCheckLabel(check.monitor_state || check.last_probe_status), runtimeStatusClass(check.monitor_state || check.last_probe_status))}
              </article>
            `).join("")}
          </div>
        ` : ""}
        ${incidents.length ? `
          <div class="ci-runtime-incidents">
            <div class="ci-runtime-subhead">
              <b>故障事件</b>
              <span>${incidents.filter(item => item.status === "open").length} 个未恢复</span>
            </div>
            ${incidents.map(incident => `
              <div class="ci-runtime-incident ${incident.status === "open" ? "danger" : "ok"}">
                <i aria-hidden="true"></i>
                <div>
                  <strong>${escapeHtml(incident.module_name || "未命名服务")} · ${escapeHtml(incident.environment || "unknown")}</strong>
                  <small>${escapeHtml(incident.last_message || "无探测详情")} · ${formatDateTime(incident.opened_at)}${incident.resolved_at ? ` 至 ${formatDateTime(incident.resolved_at)}` : ""}</small>
                </div>
                ${renderChip(runtimeIncidentLabel(incident), incident.status === "open" ? "danger" : "ok")}
              </div>
            `).join("")}
          </div>
        ` : ""}
        ${missing.length ? `
          <div class="ci-runtime-missing">
            <b>需要技术负责人补充服务地址</b>
            <p>无需自行查找。点“复制给技术负责人”发送模板，拿到服务地址后再由技术人员补充。</p>
            ${missing.map(item => `
              <div class="ci-runtime-row" data-ci-runtime-row data-target-id="${escapeHtml(item.deployment_target_id || "")}" data-env="${escapeHtml(item.environment || "")}" data-module="${escapeHtml(item.module_name || "")}">
                <span>${escapeHtml(item.environment || "环境待确认")}</span>
                <strong title="${escapeHtml(item.module_name || "")}">${escapeHtml(shortModuleName(item.module_name || "服务待确认"))}</strong>
                <em>${escapeHtml(item.host || "主机待确认")}</em>
                <input data-ci-health-url type="url" placeholder="由技术负责人填写服务检查地址" />
                <button type="button" data-ci-runtime-save>保存</button>
              </div>
            `).join("")}
          </div>
        ` : checks.length ? "" : `
          <div class="ci-runtime-missing">
            <b>暂时无法自动确认服务地址</b>
            <p>可先更新交付准备，或将模板发送给技术负责人确认服务地址。</p>
          </div>
        `}
      </section>
    `;
  };

  const renderPipeline = topology => {
    const stages = topology?.stages?.length ? topology.stages : ["build", "deploy-uat", "deploy-prod"];
    const stageLabel = stage => {
      const normalized = String(stage || "").toLowerCase();
      if (normalized.includes("validate") || normalized.includes("lint") || normalized.includes("check")) return "研发基础检查";
      if (normalized.includes("test")) return "功能验证";
      if (normalized.includes("build") || normalized.includes("package")) return "交付版本准备";
      if (normalized.includes("deploy") && normalized.includes("prod")) return "正式环境交付";
      if (normalized.includes("deploy")) return "测试环境交付";
      return "交付环节";
    };
    return `
      <section class="ci-pipeline">
        ${stages.map((stage, index) => {
          const status = getStageStatus(topology, stage);
          const stats = getStageStats(topology, stage);
          return `
            <article class="ci-stage ${statusClass(status)}" style="--stage-index:${index}">
              <i></i>
              <strong>${escapeHtml(stageLabel(stage))}</strong>
              <p>${escapeHtml(deliveryStepStatusLabel(status))}</p>
              <small>${stats ? `已完成 ${stats.success || 0} 项 · 需处理 ${stats.failed || 0} 项${stats.manual ? ` · 待技术确认 ${stats.manual} 项` : ""}` : "暂未获得研发检查结果"}</small>
            </article>
          `;
        }).join("")}
      </section>
    `;
  };

  const renderEnvironment = (env, targets) => {
    const hosts = unique(targets.map(target => target.host));
    return `
      <article class="ci-env-panel">
        <header>
          <div>
            <h3>${escapeHtml(envLabel(env))}</h3>
            <p>${targets.length} 个部署目标 · ${hosts.length} 台主机</p>
          </div>
          ${renderChip((targets[0]?.trigger_mode || "manual").toUpperCase(), "manual")}
        </header>
        <div class="ci-service-list">
          ${targets.map(target => `
            <div class="ci-service-row">
              <div class="ci-service-main">
                <strong title="${escapeHtml(target.module_name || "")}">${escapeHtml(shortModuleName(target.module_name))}</strong>
                <span title="${escapeHtml(target.deploy_dir || "")}">${escapeHtml(target.deploy_dir || "未识别目录")}</span>
              </div>
              ${renderChip(target.host || "未识别主机")}
              ${renderChip(target.profile || env, "profile")}
              ${renderChip(String(target.restart || "").toLowerCase() === "no" ? "no restart" : "restart", String(target.restart || "").toLowerCase() === "no" ? "warn" : "ok")}
            </div>
          `).join("")}
        </div>
      </article>
    `;
  };

  const renderTopologyContent = topology => {
    const targets = topology?.targets || [];
    const environments = groupTargets(targets);
    const latestPipeline = topology?.pipeline_summary?.latest_pipeline;
    const readiness = readinessFallback(topology);
    const checks = topology?.runtime_checks?.checks || [];
    const incidents = topology?.runtime_checks?.incidents || [];
    const healthyChecks = checks.filter(check => ["healthy", "configured"].includes(String(check.monitor_state || check.last_probe_status || "").toLowerCase()));
    const serviceAvailable = checks.length > 0 && healthyChecks.length === checks.length && !incidents.some(incident => incident.status === "open");
    const latestStatus = String(latestPipeline?.status || topology?.sync_status || "").toLowerCase();
    const deliveryConclusion = readiness.production_ready ? "可以进入验收" : "暂不建议验收";
    const deliveryReason = readiness.production_ready
      ? "交付前的必要检查已完成。"
      : !targets.length
        ? "服务可以正常使用，但正式交付的发布安排尚未确认。"
        : latestStatus === "failed"
          ? "最近一次研发检查未通过，处理完成后再更新交付准备。"
          : "仍有交付前事项待技术负责人确认。";
    const stats = [
      renderStat("交付结论", deliveryConclusion, deliveryReason, readiness.production_ready ? "success" : "danger"),
      renderStat("服务可用性", serviceAvailable ? "已确认可用" : checks.length ? "待技术确认" : "尚未确认", serviceAvailable ? `${checks.length} 个服务地址可正常访问` : checks.length ? "存在服务状态待确认" : "尚未登记可检查的服务地址", serviceAvailable ? "success" : "warn"),
      renderStat("交付安排", targets.length ? "已确认" : "尚未确认", targets.length ? `已识别 ${targets.length} 项交付安排，涉及 ${environments.length} 个环境` : "系统尚未识别正式交付的发布安排", targets.length ? "success" : "warn"),
      renderStat("最近一次研发检查", latestStatus === "success" ? "已完成" : latestStatus === "failed" ? "需要技术处理" : "待确认", latestPipeline?.updated_at ? `检查时间：${formatDateTime(latestPipeline.updated_at)}` : "尚未获得最近一次检查结果", statusClass(latestStatus))
    ].filter(Boolean).join("");

    return `
      ${renderRuntimePanel(topology)}
      <div class="ci-topology-stats">
        ${stats}
      </div>

      <div class="ci-topology-grid">
        <div class="ci-topology-main">
          <div class="ci-section-title">
            <div>
              <h3>交付检查说明</h3>
              <p>以下内容帮助确认项目能否正式交付；研发内部编号和原始记录无需由管理员处理。</p>
            </div>
            ${renderChip(readiness.production_ready ? "交付准备已完成" : "等待技术负责人确认", readiness.production_ready ? "ok" : "warn")}
          </div>
          ${renderPipeline(topology)}
          <div class="ci-env-grid">
            ${environments.length ? environments.map(([env, items]) => renderEnvironment(env, items)).join("") : `
              <article class="ci-empty-env">
                <strong>正式交付安排尚未确认</strong>
                <span>系统已读取到研发检查信息，但尚未确认由哪个流程完成正式交付；请技术负责人补充发布流程。</span>
              </article>
            `}
          </div>
        </div>
      </div>

      ${targets.length ? `<div class="ci-target-table" role="table" aria-label="部署目标明细">
        <div class="ci-table-row head" role="row">
          <span>模块</span><span>环境</span><span>主机</span><span>部署目录</span><span>进程/重启</span><span>Job</span>
        </div>
        ${targets.slice(0, 12).map(target => `
          <div class="ci-table-row" role="row">
            <b>${escapeHtml(shortModuleName(target.module_name))}</b>
            <span>${escapeHtml(target.environment || "unknown")}</span>
            <span>${escapeHtml(target.host || "未识别")}</span>
            <span title="${escapeHtml(target.deploy_dir || "")}">${escapeHtml(target.deploy_dir || "暂无")}</span>
            <span>${escapeHtml(target.restart === "no" ? "需单独检查" : "可按 Jar 进程检查")}</span>
            <span>${escapeHtml(target.job_name || "暂无")}</span>
          </div>
        `).join("")}
        ${targets.length > 12 ? `<div class="ci-table-more">还有 ${targets.length - 12} 个部署目标，后续可展开完整表格。</div>` : ""}
      </div>` : ""}
    `;
  };

  const emptyTextForReadiness = readiness => {
    const map = {
      gitlab_unbound: "项目尚未关联研发信息，平台暂时无法自动确认交付准备。",
      not_synced: "项目已关联研发信息，但交付准备尚未更新。",
      ci_config_missing: "系统尚未找到可用于确认交付安排的研发配置，请由技术负责人补充。",
      permission_failed: "平台暂时无法读取研发检查信息，请由技术负责人确认关联权限。",
      parse_failed: "平台已读取研发配置，但暂时无法确认交付安排，请由技术负责人核对。",
      sync_failed: "本次交付准备更新失败，请稍后再试；如持续失败，请联系技术负责人。",
      no_deploy_targets: "服务可以正常使用，但正式交付的发布安排尚未确认。"
    };
    return map[readiness?.category] || "当前项目尚未获得足够信息，暂时无法确认交付准备。";
  };

  const renderEmptyContent = (projectId, error = "", topology = null) => {
    const readiness = readinessFallback(topology);
    return `
      <div class="ci-empty-state ci-empty-state-rich">
        <div>
          <strong>${escapeHtml(readiness.production_ready ? "项目已具备正式交付条件" : "项目交付准备尚未确认")}</strong>
          <p>${escapeHtml(error || emptyTextForReadiness(readiness))}</p>
          ${readiness.blockers?.length || readiness.warnings?.length || readiness.next_actions?.length ? `
            <div class="ci-empty-readiness">
              ${readiness.blockers?.length ? `<b>阻塞项</b>${listItems(readiness.blockers)}` : ""}
              ${readiness.warnings?.length ? `<b>风险提示</b>${listItems(readiness.warnings)}` : ""}
              ${readiness.next_actions?.length ? `<b>下一步</b>${listItems(readiness.next_actions)}` : ""}
            </div>
          ` : ""}
        </div>
        <button type="button" class="primary" data-ci-sync="${projectId}">更新交付准备</button>
      </div>
    `;
  };

  const renderLoadingContent = () => `
    <div class="ci-loading">
      <i></i>
      <div>
        <strong>正在更新项目交付准备</strong>
        <span>正在汇总服务可用性和正式交付安排...</span>
      </div>
    </div>
  `;

  const renderCard = (state = {}) => {
    const projectId = state.projectId || getProjectIdFromPage();
    const repoUrl = getRepoUrlFromPage();
    const topology = state.topology;
    const hasUsableTopology = topology?.sync_status === "success";
    const ciUrl = text(topology?.ci_file_url) || (repoUrl && topology?.ref
      ? `${repoUrl.replace(/\/$/, "")}/-/blob/${encodeURIComponent(topology.ref)}/.gitlab-ci.yml`
      : "");
    const card = ensureCard();
    if (!card) return;

    const detailsWereOpen = card.querySelector(".ci-technical-details")?.open;
    const summary = customerSummary(topology, state);
    const technicalContent = state.loading
      ? renderLoadingContent()
      : hasUsableTopology
        ? renderTopologyContent(topology)
        : renderEmptyContent(projectId, state.error, topology);

    card.classList.add("ci-customer-status-card");
    card.innerHTML = `
      <section class="ci-customer-summary tone-${escapeHtml(summary.tone)}" aria-live="polite">
        <header class="ci-customer-header">
          <div>
            <span class="ci-customer-kicker">项目交付准备</span>
            <h2>${escapeHtml(summary.title)}</h2>
            <p>${escapeHtml(summary.description)}</p>
          </div>
          <strong class="ci-customer-badge">${escapeHtml(summary.badge)}</strong>
        </header>
        <div class="ci-customer-facts">
          ${summary.facts.map(item => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}
        </div>
        <div class="ci-customer-actions">
          <button type="button" class="primary" data-ci-sync="${projectId || ""}"${state.loading || state.syncing ? " disabled" : ""}>${escapeHtml(summary.actionLabel)}</button>
        </div>
      </section>
      <details class="ci-technical-details"${detailsWereOpen ? " open" : ""}>
        <summary>
          <span>查看交付准备详情</span>
          <small>供技术负责人核对的运行与发布信息</small>
        </summary>
        <div class="ci-technical-content">
          <header class="ci-technical-header">
            <div>
              <strong>${escapeHtml(topology?.ci_project_name || getProjectTitleFromPage())} · 技术详情</strong>
              <p>以下信息供研发和运维人员排查使用。</p>
            </div>
            ${ciUrl ? `<a href="${escapeHtml(ciUrl)}" target="_blank" rel="noopener noreferrer">查看配置文件</a>` : ""}
          </header>
          ${technicalContent}
        </div>
      </details>
    `;
  };

  const ensureCard = () => {
    const page = document.querySelector(".project-detail-page");
    const layout = page?.querySelector(".detail-layout");
    if (!page || !layout) return null;

    let card = document.getElementById(CARD_ID);
    if (card && !layout.contains(card)) {
      card.remove();
      card = null;
    }
    if (!card) {
      card = document.createElement("section");
      card.id = CARD_ID;
      card.className = "detail-card ci-topology-card";
    }

    if (layout.lastElementChild !== card) {
      layout.appendChild(card);
    }
    return card;
  };

  const loadTopology = async projectId => {
    if (!projectId) return;
    activeProjectId = projectId;
    if (topologyCache.has(projectId)) {
      renderCard({ projectId, topology: topologyCache.get(projectId) });
      return;
    }
    renderCard({ projectId, loading: true });
    try {
      inflight?.abort?.();
      inflight = new AbortController();
      const [topology, runtime] = await Promise.all([
        requestJson(`/api/projects/${projectId}/deployment-topology`, { signal: inflight.signal }),
        requestJson(`/api/projects/${projectId}/runtime-checks`, { signal: inflight.signal }).catch(() => null)
      ]);
      if (runtime) {
        topology.runtime_checks = runtime;
        if (runtime.readiness) topology.readiness = runtime.readiness;
        runtimeCache.set(projectId, runtime);
      }
      topologyCache.set(projectId, topology);
      if (activeProjectId === projectId) renderCard({ projectId, topology });
    } catch (error) {
      if (error.name === "AbortError") return;
      if (activeProjectId === projectId) renderCard({ projectId, error: error.message });
    }
  };

  const syncTopology = async projectId => {
    if (!projectId) {
      showToast("还没有定位到当前项目编号");
      return;
    }
    renderCard({ projectId, topology: topologyCache.get(projectId), syncing: true });
    try {
      const topology = await requestJson(`/api/projects/${projectId}/deployment-topology/sync`, { method: "POST" });
      const runtime = await requestJson(`/api/projects/${projectId}/runtime-checks`).catch(() => null);
      if (runtime) {
        topology.runtime_checks = runtime;
        if (runtime.readiness) topology.readiness = runtime.readiness;
        runtimeCache.set(projectId, runtime);
      }
      topologyCache.set(projectId, topology);
      renderCard({ projectId, topology });
      showToast(topology?.readiness?.production_ready ? "交付准备已更新，可以进入验收" : "交付准备已更新，请查看待处理事项");
    } catch (error) {
      renderCard({ projectId, topology: topologyCache.get(projectId), error: error.message });
      showToast(error.message || "同步失败");
    }
  };

  const refreshRuntime = async projectId => {
    const runtime = await requestJson(`/api/projects/${projectId}/runtime-checks`);
    runtimeCache.set(projectId, runtime);
    const topology = topologyCache.get(projectId) || await requestJson(`/api/projects/${projectId}/deployment-topology`);
    topology.runtime_checks = runtime;
    if (runtime.readiness) topology.readiness = runtime.readiness;
    topologyCache.set(projectId, topology);
    renderCard({ projectId, topology });
    return runtime;
  };

  const saveRuntimeCheck = async button => {
    const projectId = activeProjectId || getProjectIdFromPage();
    const row = button.closest("[data-ci-runtime-row]");
    const input = row?.querySelector("[data-ci-health-url]");
    const healthUrl = text(input?.value);
    if (!projectId || !row || !healthUrl) {
      showToast("请先粘贴健康检查 URL");
      return;
    }
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await requestJson(`/api/projects/${projectId}/runtime-checks`, {
        method: "POST",
        body: JSON.stringify({
          deployment_target_id: Number(row.dataset.targetId) || null,
          environment: row.dataset.env || "",
          module_name: row.dataset.module || "",
          health_url: healthUrl,
          expected_status: 200,
          expected_text: ""
        })
      });
      await refreshRuntime(projectId);
      showToast("健康检查 URL 已保存");
    } catch (error) {
      showToast(error.message || "保存失败");
    } finally {
      button.disabled = false;
      button.textContent = "保存";
    }
  };

  const probeRuntimeChecks = async projectId => {
    if (!projectId) return;
    showToast("正在探测健康 URL...");
    try {
      const result = await requestJson(`/api/projects/${projectId}/runtime-checks/probe`, { method: "POST" });
      runtimeCache.set(projectId, result);
      await refreshRuntime(projectId);
      showToast(result.runtime_status?.ready ? "健康探测通过" : "健康探测未通过，请查看异常项");
    } catch (error) {
      showToast(error.message || "探测失败");
    }
  };

  const copyRuntimeRequest = () => {
    const runtime = runtimeCache.get(activeProjectId) || topologyCache.get(activeProjectId)?.runtime_checks;
    const content = runtime?.ops_request_text || "请运维协助提供服务健康检查 URL，例如 http://服务IP:端口/actuator/health。不要提供密码、token、私钥。";
    navigator.clipboard?.writeText(content).catch(() => null);
    showToast("已生成给运维的健康 URL 请求模板");
  };

  const alignDetailStacks = () => {
    const page = document.querySelector(".project-detail-page");
    const envCard = page?.querySelector(".env-card");
    const trendCard = page?.querySelector(".trend-card");
    const aiCard = page?.querySelector(".ai-card");
    const timelineCard = page?.querySelector(".timeline-card");
    [trendCard, timelineCard].forEach(card => {
      if (card) card.style.marginTop = "";
    });
    if (!page || !window.matchMedia("(min-width: 1321px)").matches) return;

    const alignBelow = (topCard, lowerCard) => {
      if (!topCard || !lowerCard) return;
      const targetTop = Math.round(topCard.getBoundingClientRect().bottom + 14);
      const currentTop = Math.round(lowerCard.getBoundingClientRect().top);
      const offset = targetTop - currentTop;
      if (Math.abs(offset) > 1) lowerCard.style.marginTop = `${offset}px`;
    };

    alignBelow(envCard, trendCard);
    alignBelow(aiCard, timelineCard);
  };

  const enhance = () => {
    const projectId = getProjectIdFromPage();
    if (!projectId || !document.querySelector(".project-detail-page")) {
      document.getElementById(CARD_ID)?.remove();
      alignDetailStacks();
      activeProjectId = null;
      return;
    }
    ensureCard();
    if (activeProjectId !== projectId) loadTopology(projectId);
    else if (!document.getElementById(CARD_ID)?.children.length) renderCard({ projectId, topology: topologyCache.get(projectId) });
    requestAnimationFrame(alignDetailStacks);
  };

  const scheduleEnhance = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  document.addEventListener("click", event => {
    const syncButton = event.target.closest("[data-ci-sync]");
    if (syncButton) {
      event.preventDefault();
      event.stopPropagation();
      syncTopology(Number(syncButton.dataset.ciSync || activeProjectId || getProjectIdFromPage()));
      return;
    }
    if (event.target.closest("[data-ci-runtime-copy]")) {
      event.preventDefault();
      event.stopPropagation();
      copyRuntimeRequest();
      return;
    }
    const saveRuntimeButton = event.target.closest("[data-ci-runtime-save]");
    if (saveRuntimeButton) {
      event.preventDefault();
      event.stopPropagation();
      saveRuntimeCheck(saveRuntimeButton);
      return;
    }
    const probeRuntimeButton = event.target.closest("[data-ci-runtime-probe]");
    if (probeRuntimeButton) {
      event.preventDefault();
      event.stopPropagation();
      probeRuntimeChecks(Number(probeRuntimeButton.dataset.ciRuntimeProbe || activeProjectId || getProjectIdFromPage()));
    }
  }, true);

  const observer = new MutationObserver(scheduleEnhance);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleEnhance();
  };

  window.__legacyCiCustomerStatus = { customerSummary };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
