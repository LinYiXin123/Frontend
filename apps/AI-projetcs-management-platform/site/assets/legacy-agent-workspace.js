(function () {
  // Retired product surface: retained only as a harmless cache-compatible asset.
  return;

  const USER_KEY = "ai_project_hub_user_id";
  const ROOT_CLASS = "agent-chat-workspace";
  const ACTIVE_KEY = "ai_project_hub_agent_workspace_active";
  const MESSAGE_KEY = "ai_project_hub_agent_workspace_messages";

  const AGENTS = {
    monitor: {
      key: "monitor",
      name: "监控 Agent",
      shortName: "监控",
      icon: "⌁",
      tone: "blue",
      description: "发现 GitLab 变化、扫描项目、评估 3/5/7 天预警，并把结果写入通知队列。",
      prompt: "帮我跑一次全局巡检，看看今天哪些项目有异常、停滞或通知失败。",
      plan: ["读取 GitLab 与项目档案", "评估 3/5/7 天预警", "生成通知队列与日报链路摘要"],
      example: "今天哪些项目需要先处理？"
    },
    followup: {
      key: "followup",
      name: "追问 Agent",
      shortName: "追问",
      icon: "✦",
      tone: "violet",
      description: "把异常项目变成可发给负责人、可确认、可复制的追问话术。",
      prompt: "帮我找出今天最该追问的项目，并生成给负责人的飞书话术。",
      plan: ["选择最高优先级异常项目", "解释为什么需要追问", "生成负责人确认问题和飞书话术"],
      example: "帮我追问超过 7 天没进展的项目"
    },
    daily_report: {
      key: "daily_report",
      name: "日报 Agent",
      shortName: "日报",
      icon: "☼",
      tone: "green",
      description: "汇总项目健康度、异常项目、通知链路和今日建议，生成每日早报。",
      prompt: "生成今天的项目早报草稿，重点列出异常项目和需要管理者确认的事项。",
      plan: ["汇总项目健康度", "提取风险项目和通知状态", "生成适合飞书发送的早报摘要"],
      example: "帮我生成今日早报"
    },
    ops: {
      key: "ops",
      name: "运维 Agent",
      shortName: "运维",
      icon: "⚙",
      tone: "amber",
      description: "审计 CI/CD、Pipeline、部署拓扑、目标机器和运行态探针缺口。",
      prompt: "帮我审计 CI/CD 和部署环境风险，看看哪些项目上线前还有运维阻塞。",
      plan: ["读取 CI/CD 拓扑与 Pipeline 状态", "识别部署环境和目标机器缺口", "输出上线前运维风险清单"],
      example: "检查部署和服务器风险"
    }
  };

  let data = null;
  let runs = [];
  let activeAgent = safeGet(ACTIVE_KEY) || "followup";
  let busy = false;
  let mountedRoot = null;
  let refreshTimer = 0;

  function safeGet(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage may be unavailable in strict browser modes.
    }
  }

  function sessionGet(key) {
    try {
      return sessionStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function sessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      // Ignore.
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

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function getHeaders() {
    const headers = { "Content-Type": "application/json" };
    const userId = safeGet(USER_KEY);
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    return headers;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.detail || body?.message || `请求失败：${response.status}`);
    }
    return body;
  }

  function formatTime(value) {
    if (!value) {
      return "暂无";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 16);
    }
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function statusLabel(status) {
    const map = {
      running: "运行中",
      success: "成功",
      failed: "失败",
      pending: "待确认",
      completed: "完成",
      cancelled: "已取消"
    };
    return map[status] || status || "暂无";
  }

  function agentMeta(key) {
    return AGENTS[key] || AGENTS.followup;
  }

  function definitionFor(key) {
    const definitions = data?.definitions || [];
    return definitions.find(item => item.key === key) || null;
  }

  function canRun(key) {
    const definition = definitionFor(key);
    if (!definition) {
      return false;
    }
    return Boolean(definition.can_run);
  }

  function currentUserLabel() {
    const user = data?.current_user;
    if (!user) {
      return "正在识别身份";
    }
    return user.role === "admin"
      ? "当前身份 · 管理员"
      : user.role === "tester"
        ? "当前身份 · 内测用户"
        : "当前身份 · 普通成员";
  }

  function initialMessages() {
    return [
      {
        id: "welcome",
        role: "assistant",
        agent: "followup",
        content:
          "你可以像和 Codex 对话一样告诉我目标，不需要先想好要点哪个按钮。\n\n例如：\n- 今天哪些项目需要追问？\n- 帮我生成一份早报草稿。\n- 检查哪些项目上线前还有运行风险。\n\n我会先判断应该调用哪个 Agent，再给你执行计划。需要真实执行时，会先让你确认。"
      }
    ];
  }

  function loadMessages() {
    try {
      const parsed = JSON.parse(sessionGet(MESSAGE_KEY) || "[]");
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    } catch (error) {
      // Ignore malformed session state.
    }
    return initialMessages();
  }

  let messages = loadMessages();

  function saveMessages() {
    sessionSet(MESSAGE_KEY, JSON.stringify(messages.slice(-24)));
  }

  function addMessage(message) {
    messages.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...message
    });
    messages = messages.slice(-24);
    saveMessages();
    render();
    scrollMessages();
  }

  function scrollMessages() {
    window.requestAnimationFrame(() => {
      const list = mountedRoot?.querySelector(".agent-chat-thread");
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    });
  }

  function detectAgent(message) {
    const source = text(message).toLowerCase();
    if (/日报|早报|汇报|周报|report/.test(source)) {
      return "daily_report";
    }
    if (/运维|部署|服务器|环境|ci|cd|pipeline|runner|docker|portainer/.test(source)) {
      return "ops";
    }
    if (/追问|负责人|飞书|私聊|通知|话术|催/.test(source)) {
      return "followup";
    }
    if (/监控|巡检|扫描|预警|异常|风险|卡点/.test(source)) {
      return "monitor";
    }
    return activeAgent in AGENTS ? activeAgent : "followup";
  }

  function shouldOfferRun(message) {
    return /运行|执行|跑|检查|巡检|扫描|生成|审计|处理|追问|日报|验收|上线/.test(message);
  }

  function buildPlan(agentKey, userMessage) {
    const meta = agentMeta(agentKey);
    const runText = canRun(agentKey)
      ? "如果你确认，我会以 dry-run 安全模式运行，先写台账和输出快照，不直接对外发送真实消息。"
      : "当前身份不能直接运行 Agent，但可以先生成方案；需要管理员确认后再执行。";
    return [
      `我建议用【${meta.name}】处理这件事。`,
      "",
      "我会按这个顺序来：",
      ...meta.plan.map((item, index) => `${index + 1}. ${item}`),
      "",
      `你的目标：${userMessage}`,
      "",
      runText
    ].join("\n");
  }

  function renderPlanActions(agentKey) {
    const disabled = !canRun(agentKey) || busy;
    return `
      <div class="agent-chat-actions">
        <button type="button" class="primary" data-agent-run="${escapeHtml(agentKey)}" ${disabled ? "disabled" : ""}>确认 dry-run</button>
        <button type="button" data-agent-copy="${escapeHtml(agentKey)}">复制执行计划</button>
        <button type="button" data-agent-refresh>刷新台账</button>
      </div>
    `;
  }

  function renderMessage(message) {
    const role = message.role === "user" ? "user" : "assistant";
    const meta = agentMeta(message.agent || activeAgent);
    const content = escapeHtml(message.content || "").replace(/\n/g, "<br>");
    return `
      <article class="agent-chat-message ${role}">
        ${role === "assistant" ? `<span class="agent-chat-avatar ${escapeHtml(meta.tone)}">${escapeHtml(meta.icon)}</span>` : ""}
        <div class="agent-chat-bubble">
          ${role === "assistant" ? `<strong>${escapeHtml(meta.name)}</strong>` : ""}
          <p>${content}</p>
          ${message.kind === "plan" ? renderPlanActions(message.agent) : ""}
        </div>
      </article>
    `;
  }

  function renderCapabilityCards() {
    return Object.values(AGENTS).map(meta => {
      const definition = definitionFor(meta.key);
      const latest = definition?.latest_run;
      const active = activeAgent === meta.key;
      const runnable = canRun(meta.key);
      return `
        <button type="button" class="agent-capability ${active ? "active" : ""}" data-agent-select="${escapeHtml(meta.key)}">
          <span class="agent-capability-icon ${escapeHtml(meta.tone)}">${escapeHtml(meta.icon)}</span>
          <span class="agent-capability-copy">
            <strong>${escapeHtml(meta.name)}</strong>
            <em>${escapeHtml(runnable ? "可确认执行" : "需管理员确认")}</em>
            <small>最近：${escapeHtml(formatTime(latest?.started_at))} · ${escapeHtml(statusLabel(latest?.status))}</small>
          </span>
        </button>
      `;
    }).join("");
  }

  function renderRunList() {
    if (!runs.length) {
      return `<div class="agent-chat-empty">还没有可展示的运行台账。确认执行一次 Agent 后，这里会显示步骤和结果。</div>`;
    }
    return runs.slice(0, 8).map(run => {
      const meta = agentMeta(run.agent_key);
      return `
        <article class="agent-chat-run ${run.status === "failed" ? "failed" : ""}">
          <span>${escapeHtml(meta.icon)}</span>
          <div>
            <strong>${escapeHtml(meta.name)}</strong>
            <small>${escapeHtml(statusLabel(run.status))} · ${escapeHtml(formatTime(run.started_at))}</small>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderQuickPrompts() {
    return Object.values(AGENTS).map(meta => `
      <button type="button" data-agent-prompt="${escapeHtml(meta.key)}">${escapeHtml(meta.example)}</button>
    `).join("");
  }

  function render() {
    if (!mountedRoot) {
      return;
    }
    const active = agentMeta(activeAgent);
    mountedRoot.innerHTML = `
      <article class="agent-chat-shell">
        <header class="agent-chat-head">
          <div>
            <span class="scan-pill blue">对话式编排</span>
            <h2>AI Agent 工作台</h2>
            <p>把四个 Agent 收进同一个对话入口：先说目标，再生成方案，确认后执行。</p>
          </div>
          <div class="agent-chat-status">
            <span>${escapeHtml(currentUserLabel())}</span>
            <span>默认 dry-run</span>
          </div>
        </header>
        <section class="agent-chat-layout">
          <div class="agent-chat-main-panel">
            <div class="agent-chat-active">
              <span class="agent-capability-icon ${escapeHtml(active.tone)}">${escapeHtml(active.icon)}</span>
              <div>
                <strong>当前能力：${escapeHtml(active.name)}</strong>
                <p>${escapeHtml(active.description)}</p>
              </div>
            </div>
            <div class="agent-chat-thread">${messages.map(renderMessage).join("")}</div>
            <div class="agent-chat-quick">${renderQuickPrompts()}</div>
            <form class="agent-chat-composer">
              <textarea rows="3" placeholder="像和 Codex 对话一样输入：帮我检查今天哪些项目需要追问，或者生成一份日报草稿"></textarea>
              <div>
                <button type="button" data-agent-clear>清空对话</button>
                <button type="submit" class="primary" ${busy ? "disabled" : ""}>发送</button>
              </div>
            </form>
          </div>
          <aside class="agent-chat-side-panel">
            <section>
              <h3>Agent 能力</h3>
              <div class="agent-capability-list">${renderCapabilityCards()}</div>
            </section>
            <section>
              <h3>运行台账</h3>
              <div class="agent-chat-runs">${renderRunList()}</div>
            </section>
          </aside>
        </section>
      </article>
    `;
  }

  async function loadData() {
    try {
      data = await requestJson("/api/agents");
    } catch (error) {
      data = {
        current_user: null,
        definitions: Object.keys(AGENTS).map(key => ({ key, can_run: false }))
      };
    }
    try {
      runs = await requestJson("/api/agents/runs?limit=12");
    } catch (error) {
      runs = [];
    }
    render();
  }

  async function runAgent(agentKey, note) {
    const meta = agentMeta(agentKey);
    busy = true;
    render();
    try {
      const result = await requestJson("/api/agents/run", {
        method: "POST",
        body: JSON.stringify({
          agent_key: agentKey,
          trigger_source: "manual",
          dry_run: true,
          force: false,
          note: note || `从对话式 Agent 工作台运行 ${meta.name}`
        })
      });
      const summary = result?.status === "failed"
        ? `${meta.name} 已写入台账，但后端返回失败状态。`
        : `${meta.name} 已完成一次 dry-run，并把结果写入运行台账。`;
      const steps = "\n\n步骤：\n" + meta.plan.map((step, index) => `${index + 1}. ${step}`).join("\n");
      addMessage({
        role: "assistant",
        agent: agentKey,
        content: `${summary}${steps}\n\n我已把这次执行写入运行台账，你可以继续追问“为什么这样判断”或“下一步怎么处理”。`
      });
      await loadData();
    } catch (error) {
      addMessage({
        role: "assistant",
        agent: agentKey,
        content: `这次没有真正执行成功。\n\n原因：${error.message || "未知错误"}\n\n如果你当前是普通成员，可以先在这里生成方案，再让管理员确认执行。`
      });
    } finally {
      busy = false;
      render();
    }
  }

  function handleUserMessage(value) {
    const message = text(value);
    if (!message) {
      return;
    }
    const agentKey = detectAgent(message);
    activeAgent = agentKey;
    safeSet(ACTIVE_KEY, agentKey);
    addMessage({ role: "user", content: message, agent: agentKey });
    addMessage({
      role: "assistant",
      agent: agentKey,
      kind: shouldOfferRun(message) ? "plan" : "plain",
      content: buildPlan(agentKey, message)
    });
  }

  function copyPlan(agentKey) {
    const meta = agentMeta(agentKey);
    const content = [`${meta.name} 执行计划`, ...meta.plan.map((item, index) => `${index + 1}. ${item}`)].join("\n");
    navigator.clipboard?.writeText(content).catch(() => {});
  }

  function mount() {
    const consolePanel = document.querySelector(".ai-agent-console");
    if (!consolePanel) {
      mountedRoot = null;
      return;
    }
    consolePanel.classList.add("agent-chat-mode");
    let root = consolePanel.querySelector(`:scope > .${ROOT_CLASS}`);
    if (!root) {
      root = document.createElement("section");
      root.className = ROOT_CLASS;
      consolePanel.prepend(root);
    }
    mountedRoot = root;
    render();
    loadData();
    scrollMessages();
  }

  document.addEventListener("submit", event => {
    const form = event.target.closest(".agent-chat-composer");
    if (!form) {
      return;
    }
    event.preventDefault();
    const input = form.querySelector("textarea");
    const value = input?.value || "";
    if (input) {
      input.value = "";
    }
    handleUserMessage(value);
  });

  document.addEventListener("click", async event => {
    const select = event.target.closest("[data-agent-select]");
    if (select) {
      activeAgent = select.dataset.agentSelect;
      safeSet(ACTIVE_KEY, activeAgent);
      render();
      return;
    }
    const prompt = event.target.closest("[data-agent-prompt]");
    if (prompt) {
      const meta = agentMeta(prompt.dataset.agentPrompt);
      handleUserMessage(meta.prompt);
      return;
    }
    const runButton = event.target.closest("[data-agent-run]");
    if (runButton && !runButton.disabled) {
      const agentKey = runButton.dataset.agentRun;
      const lastUser = [...messages].reverse().find(item => item.role === "user");
      await runAgent(agentKey, lastUser?.content || "");
      return;
    }
    const copy = event.target.closest("[data-agent-copy]");
    if (copy) {
      copyPlan(copy.dataset.agentCopy);
      return;
    }
    if (event.target.closest("[data-agent-refresh]")) {
      await loadData();
      return;
    }
    if (event.target.closest("[data-agent-clear]")) {
      messages = initialMessages();
      saveMessages();
      render();
    }
  });

  const boot = () => {
    mount();
    new MutationObserver(() => {
      if (!document.querySelector(".ai-agent-console")) {
        mountedRoot = null;
        return;
      }
      if (!mountedRoot || !mountedRoot.isConnected) {
        mount();
      }
    }).observe(document.body, { childList: true, subtree: true });
    refreshTimer = window.setInterval(() => {
      if (document.querySelector(".ai-agent-console")) {
        loadData();
      }
    }, 15000);
  };

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
