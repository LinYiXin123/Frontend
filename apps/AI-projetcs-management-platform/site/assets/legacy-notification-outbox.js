(() => {
  "use strict";

  const USER_KEY = "ai_project_hub_user_id";
  const PANEL_SELECTOR = ".notification-panel";
  const OUTBOX_SELECTOR = "[data-notification-outbox-alert]";
  let adminUser = null;
  let refreshPromise = null;
  let refreshTimer = null;

  function userHeaders() {
    const userId = localStorage.getItem(USER_KEY);
    return userId ? { "X-User-Id": userId } : {};
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...userHeaders(),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || `请求失败（HTTP ${response.status}）`);
    }
    return data;
  }

  async function currentAdmin() {
    if (adminUser !== null) return adminUser;
    const user = await requestJson("/api/me");
    adminUser = user?.role === "admin";
    return adminUser;
  }

  function formatTime(value) {
    if (!value) return "时间未知";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function closeDialog(dialog) {
    dialog?.remove();
  }

  function confirmRetry(notification) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "notification-outbox-dialog-overlay";
      overlay.innerHTML = `
        <section class="notification-outbox-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-outbox-dialog-title">
          <div class="notification-outbox-dialog-icon" aria-hidden="true">↻</div>
          <div>
            <h3 id="notification-outbox-dialog-title">重新投递这条通知？</h3>
            <p></p>
          </div>
          <div class="notification-outbox-dialog-actions">
            <button type="button" class="ghost" data-outbox-cancel>取消</button>
            <button type="button" class="primary" data-outbox-confirm>确认重投</button>
          </div>
        </section>`;
      overlay.querySelector("p").textContent = `将立即重试《${notification.title || "未命名通知"}》，结果会继续保留在通知记录和异常处理里。`;
      document.body.appendChild(overlay);
      const cancel = () => {
        closeDialog(overlay);
        resolve(false);
      };
      overlay.querySelector("[data-outbox-cancel]").addEventListener("click", cancel);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cancel();
      });
      overlay.querySelector("[data-outbox-confirm]").addEventListener("click", () => {
        closeDialog(overlay);
        resolve(true);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") cancel();
      });
      overlay.querySelector("[data-outbox-confirm]").focus();
    });
  }

  function buildFailureRow(notification) {
    const row = document.createElement("article");
    row.className = "notification-outbox-failure";
    row.dataset.notificationId = String(notification.id);

    const content = document.createElement("div");
    content.className = "notification-outbox-failure-content";
    const title = document.createElement("h4");
    title.textContent = notification.title || "未命名通知";
    const error = document.createElement("p");
    error.textContent = notification.error || "飞书未返回可识别的失败原因";
    const meta = document.createElement("div");
    meta.className = "notification-outbox-failure-meta";
    [
      notification.project_name || "未知项目",
      `已尝试 ${Number(notification.attempt_count || 0)} 次`,
      formatTime(notification.dead_lettered_at || notification.updated_at),
    ].forEach((text) => {
      const item = document.createElement("span");
      item.textContent = text;
      meta.appendChild(item);
    });
    content.append(title, error, meta);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "notification-outbox-retry";
    button.innerHTML = '<span aria-hidden="true">↻</span><span>重新投递</span>';
    button.addEventListener("click", async () => {
      if (!(await confirmRetry(notification))) return;
      button.disabled = true;
      button.classList.add("is-loading");
      button.lastElementChild.textContent = "投递中";
      try {
        const result = await requestJson(`/api/notification-outbox/${notification.id}/retry`, {
          method: "POST",
        });
        const status = result?.notification?.status;
        if (status !== "sent") {
          throw new Error(result?.notification?.error || "重投仍未成功，请检查集成配置");
        }
        row.classList.add("is-resolved");
        button.lastElementChild.textContent = "已发送";
        window.setTimeout(() => refreshOutbox(true), 450);
      } catch (errorValue) {
        row.classList.add("has-error");
        error.textContent = errorValue.message || "重新投递失败";
        button.disabled = false;
        button.classList.remove("is-loading");
        button.lastElementChild.textContent = "再次重投";
      }
    });
    row.append(content, button);
    return row;
  }

  function renderOutbox(panel, notifications) {
    panel.querySelector(OUTBOX_SELECTOR)?.remove();
    if (!notifications.length) return;

    const container = document.createElement("section");
    container.className = "notification-outbox-alert";
    container.dataset.notificationOutboxAlert = "true";
    container.setAttribute("aria-label", "通知投递异常");

    const header = document.createElement("div");
    header.className = "notification-outbox-alert-head";
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `投递异常 ${notifications.length}`;
    const subtitle = document.createElement("p");
    subtitle.textContent = "自动重试已耗尽，待管理员处理";
    heading.append(title, subtitle);
    const badge = document.createElement("span");
    badge.textContent = "死信";
    header.append(heading, badge);

    const list = document.createElement("div");
    list.className = "notification-outbox-failure-list";
    notifications.slice(0, 5).forEach((notification) => {
      list.appendChild(buildFailureRow(notification));
    });
    if (notifications.length > 5) {
      const remainder = document.createElement("p");
      remainder.className = "notification-outbox-remainder";
      remainder.textContent = `另有 ${notifications.length - 5} 条死信，请先处理当前高优先级项目。`;
      list.appendChild(remainder);
    }
    container.append(header, list);
    const panelHead = panel.querySelector(":scope > .panel-head");
    panelHead?.insertAdjacentElement("afterend", container);
  }

  async function refreshOutbox(force = false) {
    if (refreshPromise) return refreshPromise;
    const panel = document.querySelector(PANEL_SELECTOR);
    if (!panel) return null;
    refreshPromise = (async () => {
      try {
        if (!(await currentAdmin())) {
          panel.querySelector(OUTBOX_SELECTOR)?.remove();
          return;
        }
        const notifications = await requestJson(
          "/api/notifications?status=dead_letter&read=all&scope=all&limit=50",
        );
        const currentPanel = document.querySelector(PANEL_SELECTOR);
        if (currentPanel) renderOutbox(currentPanel, Array.isArray(notifications) ? notifications : []);
      } catch (errorValue) {
        console.warn("[notification-outbox] status refresh failed", errorValue);
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refreshOutbox(), 120);
  }

  new MutationObserver(() => {
    if (document.querySelector(PANEL_SELECTOR) && !document.querySelector(OUTBOX_SELECTOR)) {
      scheduleRefresh();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("hashchange", scheduleRefresh);
  window.setInterval(() => {
    if (document.querySelector(PANEL_SELECTOR)) refreshOutbox(true);
  }, 30000);
  scheduleRefresh();
})();
