(function environmentLinkReminder() {
  const USER_KEY = "ai_project_hub_user_id";
  const ACTION_SELECTOR = "[data-environment-link-reminder]";
  const TOAST_CLASS = "environment-link-reminder-toast";
  let queued = false;

  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();

  const getUserHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    const userId = window.localStorage?.getItem(USER_KEY);
    if (userId) headers["X-User-Id"] = userId;
    return headers;
  };

  const projectIdFromPage = page => {
    const rows = Array.from(page?.querySelectorAll(".basic-card .detail-dl > div") || []);
    for (const row of rows) {
      const label = text(row.querySelector("dt")?.textContent);
      const value = text(row.querySelector("dd")?.textContent);
      if (label === "项目编号") {
        const matched = value.match(/PRJ-(\d+)/i);
        if (matched) return Number(matched[1]);
      }
    }
    const fallback = text(page?.textContent).match(/PRJ-(\d+)/i);
    return fallback ? Number(fallback[1]) : null;
  };

  const showToast = message => {
    document.querySelector(`.${TOAST_CLASS}`)?.remove();
    const toast = document.createElement("div");
    toast.className = TOAST_CLASS;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  };

  const mountAction = () => {
    const page = document.querySelector(".project-detail-page");
    const card = page?.querySelector(".env-card");
    if (!page || !card || card.querySelector(ACTION_SELECTOR)) return;
    const projectId = projectIdFromPage(page);
    if (!projectId) return;

    const action = document.createElement("div");
    action.className = "environment-link-reminder-action";
    action.innerHTML = `
      <span>环境地址待核验？</span>
      <button type="button" data-environment-link-reminder data-project-id="${projectId}">
        提醒负责人补充
      </button>
    `;
    card.appendChild(action);
  };

  const sendReminder = async button => {
    const projectId = Number(button.dataset.projectId || 0);
    if (!projectId || button.disabled) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "发送中…";
    try {
      const response = await fetch(`/api/projects/${projectId}/environment-links/remind-owner`, {
        method: "POST",
        headers: getUserHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || body?.message || "提醒发送失败");
      showToast(body?.message || "已提醒项目负责人补充环境地址");
    } catch (error) {
      showToast(error?.message || "提醒发送失败，请稍后重试");
    } finally {
      button.disabled = false;
      button.textContent = originalText || "提醒负责人补充";
    }
  };

  const scheduleMount = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      mountAction();
    });
  };

  document.addEventListener("click", event => {
    const button = event.target.closest(ACTION_SELECTOR);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    sendReminder(button);
  }, true);

  const observer = new MutationObserver(scheduleMount);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleMount();
  };

  window.__legacyEnvironmentLinkReminder = { projectIdFromPage };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
