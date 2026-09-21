(function () {
  // Retired product surface: retained only as a harmless cache-compatible asset.
  return;

  const USER_KEY = "ai_project_hub_user_id";
  const ROOT_ID = "legacy-agent-action-dock";
  const TOAST_CLASS = "ci-topology-toast";

  let queued = false;
  let timer = null;
  let cache = [];
  let expanded = false;

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

  const isAiSurface = () =>
    Boolean(
      document.querySelector(".ai-chat-page") ||
      document.querySelector(".ai-suite-hero") ||
      document.querySelector(".ai-suite-tabs") ||
      Array.from(document.querySelectorAll("button, h1, h2")).some(node => /AI功能集成|AI Chat|AI对话|Agent编排/.test(node.textContent || ""))
    );

  const getHost = () =>
    document.querySelector(".ai-chat-main") ||
    document.querySelector(".ai-chat-page") ||
    document.querySelector("main") ||
    document.body;

  const statusLabel = status => {
    const map = {
      pending: "待确认",
      confirmed: "已确认",
      executing: "执行中",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消"
    };
    return map[status] || status || "未知";
  };

  const renderAction = action => {
    const payload = action.payload || {};
    const missingMapping = Boolean(payload.requires_mapping);
    const project = payload.project;
    const content = text(action.content);
    return `
      <article class="agent-action-card" data-action-id="${escapeHtml(action.id)}">
        <div class="agent-action-card-head">
          <span>${escapeHtml(statusLabel(action.status))}</span>
          <b>#${escapeHtml(action.id)} · ${escapeHtml(action.title || "Agent 动作")}</b>
        </div>
        <p class="agent-action-meta">
          目标：${escapeHtml(action.target_name || "未指定")}
          ${project ? ` · 项目：${escapeHtml(project.name || project.id)}` : ""}
          ${action.dry_run ? " · dry-run" : " · 等待真实执行确认"}
        </p>
        <p class="agent-action-content">${escapeHtml(content).slice(0, 220)}${content.length > 220 ? "…" : ""}</p>
        ${missingMapping ? `<p class="agent-action-warning">缺少飞书映射，执行前请先补齐 open_id / user_id。</p>` : ""}
        <div class="agent-action-buttons">
          <button type="button" data-agent-action="confirm" ${action.status !== "pending" ? "disabled" : ""}>确认</button>
          <button type="button" class="primary" data-agent-action="execute" ${!["pending", "confirmed", "failed"].includes(action.status) || missingMapping ? "disabled" : ""}>dry-run 执行</button>
          <button type="button" data-agent-action="cancel" ${!["pending", "confirmed", "failed"].includes(action.status) ? "disabled" : ""}>取消</button>
        </div>
      </article>
    `;
  };

  const render = () => {
    const existing = document.getElementById(ROOT_ID);
    if (!isAiSurface()) {
      existing?.remove();
      return;
    }
    const host = getHost();
    let root = existing;
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.className = "agent-action-dock";
      host.appendChild(root);
    }
    if (!cache.length) {
      root.remove();
      return;
    }
    root.classList.toggle("expanded", expanded);
    root.classList.remove("empty");
    root.innerHTML = `
      <button type="button" class="agent-action-pill" data-agent-action-toggle>
        <span>${cache.length}</span><b>待确认 Agent 动作</b><em>${expanded ? "收起" : "查看"}</em>
      </button>
      ${expanded ? `<div class="agent-action-list">${cache.map(renderAction).join("")}</div>` : ""}
    `;
  };

  const refresh = async () => {
    if (!isAiSurface()) {
      render();
      return;
    }
    try {
      cache = await requestJson("/api/agent-actions?status=pending&limit=20");
      render();
    } catch (error) {
      if (document.getElementById(ROOT_ID)) showToast(error.message || "Agent 动作加载失败");
    }
  };

  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      render();
    });
  };

  document.addEventListener("click", async event => {
    const toggle = event.target.closest("[data-agent-action-toggle]");
    if (toggle) {
      expanded = !expanded;
      render();
      if (expanded) refresh();
      return;
    }
    const button = event.target.closest("[data-agent-action]");
    if (!button || button.disabled) return;
    const card = button.closest("[data-action-id]");
    const id = card?.dataset.actionId;
    const action = button.dataset.agentAction;
    if (!id || !action) return;
    button.disabled = true;
    try {
      if (action === "confirm") {
        await requestJson(`/api/agent-actions/${id}/confirm`, {
          method: "POST",
          body: JSON.stringify({ note: "前端确认" })
        });
        showToast(`已确认 Agent 动作 #${id}`);
      } else if (action === "execute") {
        await requestJson(`/api/agent-actions/${id}/execute`, {
          method: "POST",
          body: JSON.stringify({ dry_run: true, note: "前端 dry-run 执行" })
        });
        showToast(`Agent 动作 #${id} 已 dry-run 执行`);
      } else if (action === "cancel") {
        await requestJson(`/api/agent-actions/${id}/cancel`, {
          method: "POST",
          body: JSON.stringify({ note: "前端取消" })
        });
        showToast(`已取消 Agent 动作 #${id}`);
      }
      await refresh();
    } catch (error) {
      showToast(error.message || "Agent 动作处理失败");
      button.disabled = false;
    }
  });

  const boot = () => {
    refresh();
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(refresh, 8000);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
