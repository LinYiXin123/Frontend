(function () {
  const MODE_KEY = "ai_project_hub_ai_chat_mode";
  const USER_KEY = "ai_project_hub_user_id";
  const ENHANCED_ATTR = "data-ai-chat-modes-ready";
  const CHAT_TITLE = "艺新，你说，我在听！";
  const AGENT_TITLE = "智能体模式：你说目标，我来编排";
  const CHAT_PLACEHOLDER = "有问题，尽管问";
  const AGENT_PLACEHOLDER = "例如：帮我检查今天哪些项目需要追问，并生成飞书话术";
  const CHAT_PROGRESS_STAGES = [
    { key: "understanding", label: "理解问题" },
    { key: "retrieving", label: "读取数据" },
    { key: "analyzing", label: "分析信息" },
    { key: "drafting", label: "整理回答" }
  ];
  let activeChatProgress = null;

  const AGENT_PROMPTS = [
    {
      label: "运行一次巡检",
      text: "帮我运行一次全局巡检，找出今天需要优先处理的异常项目。",
      agent: "监控 Agent"
    },
    {
      label: "生成追问方案",
      text: "帮我列出今天最需要追问的项目，并生成给负责人的飞书追问话术。",
      agent: "追问 Agent"
    },
    {
      label: "生成今日早报",
      text: "生成今天的项目早报，重点列出异常项目、通知状态和需要管理员确认的事项。",
      agent: "日报 Agent"
    },
    {
      label: "检查上线风险",
      text: "帮我检查哪些项目上线或验收前还缺环境链接、GitLab 扫描或运行信息。",
      agent: "验收准备"
    }
  ];

  const AGENT_ARTIFACTS = [
    {
      key: "project_csv",
      label: "导出项目清单",
      agent: "监控 Agent",
      file: ".csv",
      prompt: "生成一份可用 Excel 打开的项目清单文件，包含状态、负责人、分支、最近活跃和健康状态。"
    },
    {
      key: "daily_report",
      label: "生成今日汇报",
      agent: "日报 Agent",
      file: ".md",
      prompt: "生成今日项目汇报文件，汇总项目状态、风险项目、未读通知和建议动作。"
    },
    {
      key: "followup_plan",
      label: "生成追问方案",
      agent: "追问 Agent",
      file: ".md",
      prompt: "生成需要追问项目的负责人话术和处理建议文件。"
    },
    {
      key: "delivery_risk",
      label: "上线风险清单",
      agent: "验收准备",
      file: ".csv",
      prompt: "生成交付风险清单文件，列出环境、扫描、上线和阻塞项。"
    }
  ];
  const ARTIFACT_STORE = new Map();

  function readMode() {
    try {
      return localStorage.getItem(MODE_KEY) === "agent" ? "agent" : "chat";
    } catch (error) {
      return "chat";
    }
  }

  function saveMode(mode) {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch (error) {
      // Storage can be blocked in a few browser modes.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function projectBusinessName(project) {
    const item = project || {};
    return String(item.display_name_zh || item.display_name || item.name || "").trim() || "未命名项目";
  }

  function getUserHeaders() {
    const headers = { "Content-Type": "application/json" };
    try {
      const userId = localStorage.getItem(USER_KEY);
      if (userId) headers["X-User-Id"] = userId;
    } catch (error) {
      // Storage can be blocked in a few browser modes.
    }
    return headers;
  }

  async function requestJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: getUserHeaders()
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || body?.message || `请求失败：${response.status}`);
    return body;
  }

  function todayStamp() {
    const date = new Date();
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function csvCell(value) {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function asCsv(rows) {
    return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\n");
  }

  function labelForHealth(value) {
    return {
      normal: "正常",
      attention: "关注",
      alert: "异常",
      critical: "严重",
      stalled: "停滞",
      unknown: "待接入",
      archived: "已归档"
    }[value] || value || "未知";
  }

  function labelForStatus(value) {
    return {
      developing: "开发中",
      online: "已上线",
      archived: "已归档"
    }[value] || value || "未知";
  }

  function formatTime(value) {
    if (!value) return "暂无";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function showArtifactToast(filename) {
    document.querySelector(".ai-agent-artifact-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "ai-agent-artifact-toast";
    toast.innerHTML = `<b>文件已生成</b><span>${escapeHtml(filename)}</span>`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function localTimeParts(date = new Date()) {
    return {
      time: date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      full: date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    };
  }

  function ensureAgentRunFeed() {
    const center = currentCenter();
    if (!center) return null;
    let feed = center.querySelector(".ai-agent-run-feed");
    if (!feed) {
      feed = document.createElement("div");
      feed.className = "ai-agent-run-feed";
      const anchor = center.querySelector(".ai-chat-agent-prompts")
        || center.querySelector(".ai-chat-suggestions")
        || center.querySelector(".ai-chat-input-shell");
      if (anchor) {
        anchor.insertAdjacentElement("afterend", feed);
      } else {
        center.appendChild(feed);
      }
    }
    return feed;
  }

  function renderRunCard(runId, task, started) {
    return `
      <article class="ai-agent-run-card is-running" data-ai-agent-run="${escapeHtml(runId)}">
        <div class="ai-agent-run-message user">
          <div class="ai-agent-run-avatar">我</div>
          <div class="ai-agent-run-bubble">
            <p>${escapeHtml(task.prompt)}</p>
            <time>${escapeHtml(started.time)}</time>
          </div>
        </div>
        <div class="ai-agent-run-message assistant">
          <div class="ai-agent-run-avatar agent">A</div>
          <div class="ai-agent-run-bubble">
            <div class="ai-agent-run-head">
              <strong>${escapeHtml(task.label)}</strong>
              <time>开始：${escapeHtml(started.full)}</time>
            </div>
            <div class="ai-agent-thinking" data-agent-thinking>
              <i></i><span>正在理解任务并读取项目数据</span>
            </div>
            <ol class="ai-agent-step-list" data-agent-steps>
              <li class="done">接收目标</li>
              <li class="active">读取项目、预警和通知数据</li>
              <li>生成文件产物</li>
            </ol>
          </div>
        </div>
      </article>
    `;
  }

  function createAgentRunCard(task) {
    const feed = ensureAgentRunFeed();
    if (!feed) return null;
    const runId = `artifact-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    feed.insertAdjacentHTML("afterbegin", renderRunCard(runId, task, localTimeParts()));
    const card = feed.querySelector(`[data-ai-agent-run="${CSS.escape(runId)}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return { runId, card };
  }

  function buildArtifact(task, key, projects, alerts, notifications) {
    const date = todayStamp();
    let filename = "";
    let content = "";
    let mime = "text/plain;charset=utf-8";
    let summary = "";
    let recordCount = 0;
    if (key === "project_csv") {
      filename = `AI项目清单-${date}.csv`;
      content = projectCsv(projects);
      mime = "text/csv;charset=utf-8";
      recordCount = projects.length;
      summary = `已汇总 ${projects.length} 个项目，包含状态、负责人、分支、最近活跃和健康状态。`;
    } else if (key === "delivery_risk") {
      filename = `上线风险清单-${date}.csv`;
      content = deliveryRiskCsv(projects);
      mime = "text/csv;charset=utf-8";
      recordCount = projects.length;
      summary = `已检查 ${projects.length} 个项目的环境信息、运行态、阻塞项和下一步动作。`;
    } else if (key === "followup_plan") {
      filename = `项目追问方案-${date}.md`;
      content = followupMarkdown(alerts);
      mime = "text/markdown;charset=utf-8";
      recordCount = alerts.length;
      summary = alerts.length
        ? `已基于 ${alerts.length} 条开放预警生成追问对象和话术。`
        : "当前没有开放预警，已生成观察说明。";
    } else {
      filename = `项目今日汇报-${date}.md`;
      content = dailyReportMarkdown(projects, alerts, notifications);
      mime = "text/markdown;charset=utf-8";
      recordCount = projects.length;
      summary = `已汇总 ${projects.length} 个项目、${alerts.length} 条开放预警和 ${notifications.length} 条通知记录。`;
    }
    return {
      id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: task.label,
      filename,
      content,
      mime,
      summary,
      recordCount,
      created: localTimeParts()
    };
  }

  function renderArtifactCard(artifact) {
    const extension = artifact.filename.split(".").pop()?.toUpperCase() || "FILE";
    return `
      <div class="ai-agent-artifact-card" data-ai-artifact-card="${escapeHtml(artifact.id)}">
        <div class="ai-agent-file-icon">${escapeHtml(extension.slice(0, 3))}</div>
        <div class="ai-agent-file-copy">
          <strong>${escapeHtml(artifact.filename)}</strong>
          <span>${escapeHtml(artifact.summary)}</span>
          <time>生成时间：${escapeHtml(artifact.created.full)}</time>
        </div>
        <button type="button" data-ai-agent-download="${escapeHtml(artifact.id)}">下载保存</button>
      </div>
    `;
  }

  function updateRunProgress(card, state, detail) {
    if (!card) return;
    const thinking = card.querySelector("[data-agent-thinking] span");
    if (thinking && detail) thinking.textContent = detail;
    const steps = [...card.querySelectorAll("[data-agent-steps] li")];
    steps.forEach((step, index) => {
      step.classList.toggle("done", index < state);
      step.classList.toggle("active", index === state);
    });
  }

  function completeRunCard(card, artifact) {
    if (!card) return;
    card.classList.remove("is-running");
    card.classList.add("is-complete");
    const bubble = card.querySelector(".ai-agent-run-message.assistant .ai-agent-run-bubble");
    if (!bubble) return;
    bubble.innerHTML = `
      <div class="ai-agent-run-head">
        <strong>${escapeHtml(artifact.label)}已完成</strong>
        <time>完成：${escapeHtml(artifact.created.full)}</time>
      </div>
      <p class="ai-agent-run-summary">${escapeHtml(artifact.summary)}</p>
      ${renderArtifactCard(artifact)}
    `;
  }

  function failRunCard(card, message) {
    if (!card) return;
    card.classList.remove("is-running");
    card.classList.add("is-failed");
    const bubble = card.querySelector(".ai-agent-run-message.assistant .ai-agent-run-bubble");
    if (!bubble) return;
    bubble.innerHTML = `
      <div class="ai-agent-run-head">
        <strong>生成失败</strong>
        <time>${escapeHtml(localTimeParts().full)}</time>
      </div>
      <p class="ai-agent-run-summary">${escapeHtml(message || "请稍后重试。")}</p>
    `;
  }

  function projectCsv(projects) {
    return asCsv([
      ["项目", "来源", "负责人", "参与人", "项目状态", "健康状态", "静默天数", "默认分支", "分支数", "最近活跃", "GitLab 路径", "扫描状态"],
      ...projects.map(project => [
        projectBusinessName(project),
        project.gitlab_instance_label || project.demand_source || "",
        project.owner_name || "",
        (project.participants || []).join("、"),
        labelForStatus(project.status),
        labelForHealth(project.health),
        project.inactive_days ?? "",
        project.gitlab_default_branch || "",
        project.last_scan_branches ?? 0,
        formatTime(project.last_activity_at),
        project.gitlab_project_id || project.gitlab_repo_url || "",
        project.last_scan_status || ""
      ])
    ]);
  }

  function deliveryRiskCsv(projects) {
    return asCsv([
      ["项目", "负责人", "健康状态", "上线准备", "运行态", "阻塞项", "提醒项", "下一步"],
      ...projects.map(project => {
        const readiness = project.deployment_readiness || {};
        const runtime = readiness.runtime_status || {};
        return [
          projectBusinessName(project),
          project.owner_name || "",
          labelForHealth(project.health),
          readiness.label || readiness.category || "未评估",
          runtime.label || runtime.status || "未接入",
          (readiness.blockers || []).join("；"),
          (readiness.warnings || []).join("；"),
          (readiness.next_actions || []).join("；")
        ];
      })
    ]);
  }

  function dailyReportMarkdown(projects, alerts, notifications) {
    const activeProjects = projects.filter(project => project.health === "normal");
    const riskProjects = projects.filter(project => ["alert", "critical", "stalled"].includes(project.health));
    const unread = notifications.filter(item => !item.read_at);
    return [
      `# AI 创新部项目今日汇报 ${todayStamp()}`,
      "",
      "## 总览",
      `- 项目总数：${projects.length}`,
      `- 正常推进：${activeProjects.length}`,
      `- 风险/停滞：${riskProjects.length}`,
      `- 开放预警：${alerts.length}`,
      `- 未读通知：${unread.length}`,
      "",
      "## 重点风险项目",
      ...(riskProjects.length ? riskProjects.slice(0, 12).map(project =>
        `- ${projectBusinessName(project)}：${labelForHealth(project.health)}，负责人 ${project.owner_name || "待确认"}，静默 ${project.inactive_days ?? 0} 天，最近活跃 ${formatTime(project.last_activity_at)}`
      ) : ["- 暂无需要立即关注的风险项目。"]),
      "",
      "## 建议动作",
      "- 严重/停滞项目先确认是否继续推进、暂停或归档。",
      "- 对未读通知较多的项目，先确认负责人和飞书触达链路。",
      "- 开发中但缺环境或运行信息的项目，补齐测试环境、正式环境和运行监控。"
    ].join("\n");
  }

  function followupMarkdown(alerts) {
    const sections = alerts.length ? alerts.slice(0, 20).map((alert, index) => [
      `## ${index + 1}. ${alert.project_name}`,
      `- 等级：${labelForHealth(alert.level)}`,
      `- 负责人：${alert.owner_name || "待确认"}`,
      `- 静默：${alert.days_inactive ?? 0} 天`,
      "- 建议话术：请确认项目是否继续推进；如果暂停，请说明暂停原因和预计恢复时间；如果继续推进，请补充最近一次可验证进展。",
      ""
    ].join("\n")) : ["暂无开放预警，可先观察。"];
    return [`# 项目追问方案 ${todayStamp()}`, "", ...sections].join("\n");
  }

  async function runArtifactTask(key) {
    const task = AGENT_ARTIFACTS.find(item => item.key === key);
    if (!task) return;
    const button = document.querySelector(`[data-ai-agent-artifact="${CSS.escape(key)}"]`);
    button?.setAttribute("aria-busy", "true");
    const run = createAgentRunCard(task);
    try {
      await wait(220);
      updateRunProgress(run?.card, 1, "正在调用项目、预警和通知数据工具");
      const [projects, alerts, notifications] = await Promise.all([
        requestJson("/api/projects?scope=all"),
        requestJson("/api/alerts?status=open"),
        requestJson("/api/notifications?read=all&limit=200")
      ]);
      await wait(220);
      updateRunProgress(run?.card, 2, "正在生成文件产物");
      const artifact = buildArtifact(task, key, projects, alerts, notifications);
      ARTIFACT_STORE.set(artifact.id, artifact);
      await wait(180);
      completeRunCard(run?.card, artifact);
      showArtifactToast(`${artifact.filename} 已就绪，请在卡片中下载保存`);
    } catch (error) {
      const message = `生成失败：${error.message || "请稍后重试"}`;
      failRunCard(run?.card, message);
      showArtifactToast(message);
    } finally {
      button?.removeAttribute("aria-busy");
    }
  }

  function currentCenter() {
    return document.querySelector(".ai-chat-page .ai-chat-main .ai-chat-center");
  }

  function currentTextarea() {
    return document.querySelector(".ai-chat-page .ai-chat-input-shell textarea");
  }

  function writeTextarea(value) {
    const textarea = currentTextarea();
    if (!textarea) {
      return;
    }
    textarea.focus();
    const prototype = Object.getPrototypeOf(textarea);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(textarea, value);
    } else {
      textarea.value = value;
    }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function beginChatProgress() {
    activeChatProgress?.finish();
    const state = {
      stage: "understanding",
      label: "正在理解问题",
      detail: "识别问题重点和当前对话上下文",
      startedAt: Date.now(),
      stopped: false,
      timer: 0
    };

    const render = () => {
      if (state.stopped) return;
      const loading = document.querySelector(".ai-chat-message.assistant:last-of-type .ai-chat-loading");
      if (!loading) return;
      const activeIndex = Math.max(0, CHAT_PROGRESS_STAGES.findIndex(item => item.key === state.stage));
      const elapsed = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
      loading.classList.add("ai-chat-progress");
      loading.setAttribute("role", "status");
      loading.setAttribute("aria-live", "polite");
      loading.setAttribute("aria-label", `${state.label}，已用时 ${elapsed} 秒`);
      loading.innerHTML = `
        <div class="ai-chat-progress-head">
          <span class="ai-chat-progress-pulse" aria-hidden="true"><i></i></span>
          <div>
            <strong>${escapeHtml(state.label)}</strong>
            <p>${escapeHtml(state.detail)}</p>
          </div>
          <time>${elapsed} 秒</time>
        </div>
        <ol class="ai-chat-progress-steps" aria-label="回答处理进度">
          ${CHAT_PROGRESS_STAGES.map((item, index) => `
            <li class="${index < activeIndex ? "done" : index === activeIndex ? "active" : "pending"}">
              <i aria-hidden="true">${index < activeIndex ? "✓" : index + 1}</i>
              <span>${escapeHtml(item.label)}</span>
            </li>
          `).join("")}
        </ol>
        <small>展示的是处理阶段，不包含模型内部推理内容</small>
      `;
    };

    const tracker = {
      update(event) {
        if (!event || event.type !== "progress") return;
        state.stage = CHAT_PROGRESS_STAGES.some(item => item.key === event.stage)
          ? event.stage
          : state.stage;
        state.label = event.label || state.label;
        state.detail = event.detail || state.detail;
        render();
      },
      render,
      finish() {
        state.stopped = true;
        if (state.timer) window.clearInterval(state.timer);
        if (activeChatProgress === tracker) activeChatProgress = null;
      }
    };
    state.timer = window.setInterval(render, 1000);
    activeChatProgress = tracker;
    render();
    return tracker;
  }

  async function readChatProgressStream(response, tracker) {
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error("浏览器不支持流式回答，请升级浏览器后重试");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;
    let failure = null;

    const consumeLine = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === "progress") tracker.update(event);
      if (event.type === "result") result = event.data;
      if (event.type === "error") failure = event;
    };

    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consumeLine);
      if (chunk.done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
    if (failure) return { error: failure };
    if (!result) throw new Error("AI 流式回答没有返回结果");
    return { data: result };
  }

  function patchAiChatFetch() {
    if (window.__aiChatModeFetchPatched || typeof window.fetch !== "function") {
      return;
    }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function patchedFetch(input, init) {
      const url = typeof input === "string" ? input : input && input.url;
      const isChatRequest = url
        && /\/api\/ai\/chat(?:\?|$)/.test(String(url))
        && !String(url).includes("/api/ai/chat/stream");
      if (isChatRequest && init && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);
          body.mode = readMode() === "agent" ? "pro" : "advanced";
          init = { ...init, body: JSON.stringify(body) };
        } catch (error) {
          // Leave non-JSON requests untouched.
          return nativeFetch(input, init);
        }
        const tracker = beginChatProgress();
        const streamUrl = String(url).replace(/\/api\/ai\/chat(?=\?|$)/, "/api/ai/chat/stream");
        return nativeFetch(streamUrl, init)
          .then(async response => {
            if (!response.ok) return response;
            const streamed = await readChatProgressStream(response, tracker);
            if (streamed.error) {
              return new Response(
                JSON.stringify({ detail: streamed.error.detail || "AI 服务暂时不可用" }),
                {
                  status: streamed.error.status || 500,
                  headers: { "Content-Type": "application/json; charset=utf-8" }
                }
              );
            }
            return new Response(JSON.stringify(streamed.data), {
              status: 200,
              headers: { "Content-Type": "application/json; charset=utf-8" }
            });
          })
          .finally(() => tracker.finish());
      }
      return nativeFetch(input, init);
    };
    window.__aiChatModeFetchPatched = true;
  }

  function renderModePanel(mode) {
    return `
      <div class="ai-chat-mode-panel">
        <div class="ai-chat-mode-switch" role="tablist" aria-label="AI 对话模式" data-mode="${mode}">
          <button type="button" role="tab" data-ai-chat-mode="chat" aria-selected="${mode === "chat"}" class="${mode === "chat" ? "active" : ""}">
            日常对话
          </button>
          <button type="button" role="tab" data-ai-chat-mode="agent" aria-selected="${mode === "agent"}" class="${mode === "agent" ? "active" : ""}">
            智能体
          </button>
        </div>
      </div>
    `;
  }

  function renderAgentPrompts() {
    return `
      <div class="ai-chat-agent-prompts" aria-label="智能体快捷任务">
        ${AGENT_ARTIFACTS.map((task) => `
          <button type="button" data-ai-agent-artifact="${escapeHtml(task.key)}" data-ai-agent-prompt="${escapeHtml(task.prompt)}">
            ${escapeHtml(task.label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function ensureModePanel() {
    const center = currentCenter();
    if (!center || center.classList.contains("has-messages")) {
      applyMode(readMode());
      return;
    }

    const emptyState = center.querySelector(".ai-chat-empty-state");
    if (!emptyState) {
      applyMode(readMode());
      return;
    }

    if (!emptyState.hasAttribute(ENHANCED_ATTR)) {
      const mode = readMode();
      emptyState.insertAdjacentHTML("afterbegin", renderModePanel(mode));
      const suggestions = center.querySelector(".ai-chat-suggestions");
      if (suggestions && !center.querySelector(".ai-chat-agent-prompts")) {
        suggestions.insertAdjacentHTML("afterend", renderAgentPrompts());
      }
      emptyState.setAttribute(ENHANCED_ATTR, "true");
    }

    applyMode(readMode());
  }

  function applyMode(mode) {
    const page = document.querySelector(".ai-chat-page");
    const center = currentCenter();
    if (!page || !center) {
      return;
    }

    page.classList.toggle("ai-chat-mode-agent", mode === "agent");
    page.classList.toggle("ai-chat-mode-daily", mode !== "agent");

    const title = center.querySelector(".ai-chat-empty-state h2");
    if (title) {
      if (!title.dataset.originalText) {
        title.dataset.originalText = title.textContent.trim() || CHAT_TITLE;
      }
      title.textContent = mode === "agent" ? AGENT_TITLE : title.dataset.originalText || CHAT_TITLE;
    }

    const textarea = currentTextarea();
    if (textarea) {
      if (!textarea.dataset.originalPlaceholder) {
        textarea.dataset.originalPlaceholder = textarea.getAttribute("placeholder") || CHAT_PLACEHOLDER;
      }
      textarea.setAttribute("placeholder", mode === "agent" ? AGENT_PLACEHOLDER : textarea.dataset.originalPlaceholder || CHAT_PLACEHOLDER);
    }

    const switcher = center.querySelector(".ai-chat-mode-switch");
    if (switcher) {
      switcher.dataset.mode = mode;
    }

    center.querySelectorAll("[data-ai-chat-mode]").forEach((button) => {
      const isActive = button.dataset.aiChatMode === mode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  }

  function switchMode(mode) {
    const page = document.querySelector(".ai-chat-page");
    if (!page || page.classList.contains("ai-chat-mode-leaving")) {
      applyMode(mode);
      return;
    }
    const currentMode = page.classList.contains("ai-chat-mode-agent") ? "agent" : "chat";
    if (currentMode === mode) {
      applyMode(mode);
      return;
    }
    page.classList.remove("ai-chat-mode-entering");
    page.classList.add("ai-chat-mode-leaving");
    window.setTimeout(() => {
      applyMode(mode);
      page.classList.remove("ai-chat-mode-leaving");
      page.classList.add("ai-chat-mode-entering");
      window.setTimeout(() => page.classList.remove("ai-chat-mode-entering"), 280);
    }, 120);
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const modeButton = event.target.closest("[data-ai-chat-mode]");
      if (modeButton) {
        const mode = modeButton.dataset.aiChatMode === "agent" ? "agent" : "chat";
        saveMode(mode);
        switchMode(mode);
        return;
      }

      const promptButton = event.target.closest("[data-ai-agent-prompt]");
      if (promptButton) {
        saveMode("agent");
        applyMode("agent");
        const artifactKey = promptButton.dataset.aiAgentArtifact;
        if (artifactKey) {
          runArtifactTask(artifactKey);
        } else {
          writeTextarea(promptButton.dataset.aiAgentPrompt || "");
        }
        return;
      }

      const downloadButton = event.target.closest("[data-ai-agent-download]");
      if (downloadButton) {
        const artifact = ARTIFACT_STORE.get(downloadButton.dataset.aiAgentDownload);
        if (!artifact) {
          showArtifactToast("文件已过期，请重新生成一次");
          return;
        }
        downloadTextFile(artifact.filename, artifact.content, artifact.mime);
        showArtifactToast(`${artifact.filename} 已开始下载`);
      }
    });
  }

  function start() {
    patchAiChatFetch();
    ensureModePanel();
    bindEvents();

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        ensureModePanel();
        activeChatProgress?.render();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
