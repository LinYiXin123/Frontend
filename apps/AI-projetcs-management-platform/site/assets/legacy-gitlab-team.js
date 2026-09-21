(function () {
  const USER_KEY = "ai_project_hub_user_id";
  const PANEL_ID = "legacy-gitlab-team-panel";
  const TOAST_CLASS = "ci-topology-toast";

  let queued = false;
  let activeProjectId = null;
  let teamCache = new Map();
  let inflight = null;

  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();

  const escapeHtml = value =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const safeProfileUrl = value => {
    try {
      const url = new URL(text(value));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
  };

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

  const roleClass = role => {
    const normalized = String(role || "").toLowerCase();
    if (normalized.includes("owner")) return "owner";
    if (normalized.includes("maintainer")) return "maintainer";
    if (normalized.includes("developer")) return "developer";
    return "member";
  };

  const memberInitial = name => text(name).slice(0, 1) || "G";

  const renderAvatar = member => {
    const user = member.user || {};
    const name = user.name || "GitLab 成员";
    const avatar = user.feishu_avatar_url;
    if (avatar) {
      return `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}的飞书头像" loading="lazy" referrerpolicy="no-referrer" />`;
    }
    return `<i>${escapeHtml(memberInitial(name))}</i>`;
  };

  const formatDateTime = value => {
    if (!value) return "暂未记录";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const isGitLabRoleSynced = member => {
    const projectRole = String(member.project_role || "").toLowerCase();
    return Boolean(member.source === "gitlab" || projectRole.startsWith("gitlab_"));
  };

  const displayRole = member => {
    if (!isGitLabRoleSynced(member)) {
      if (member.is_owner) {
        return {
          label: "项目负责人",
          className: "owner",
          hint: "来自项目档案负责人字段，未确认 GitLab 访问级别"
        };
      }
      return {
        label: "待同步角色",
        className: "pending",
        hint: "尚未从 GitLab 成员页同步访问级别"
      };
    }
    const label = member.gitlab_role || "Member";
    return {
      label,
      className: roleClass(label),
      hint: member.is_owner ? "GitLab 成员页同步的负责人权限" : "来自 GitLab 成员权限"
    };
  };

  const renderStatusPill = (label, ready, detail = "") => `
    <span class="gitlab-team-map-pill ${ready ? "ready" : "missing"}">
      ${escapeHtml(label)}
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </span>
  `;

  const renderMember = member => {
    const user = member.user || {};
    const name = user.name || "未命名成员";
    const role = displayRole(member);
    const department = user.department || "未归属部门";
    const title = user.department_role || user.role || "成员";
    const identity = user.email || "邮箱待补充";
    const gitlabAccount = user.gitlab_username ? `@${user.gitlab_username}` : "";
    const profileUrl = safeProfileUrl(member.gitlab_profile_url || user.gitlab_profile_url);
    const account = `
      <div class="gitlab-team-account">
        <div class="gitlab-team-avatar">${renderAvatar(member)}</div>
        <div>
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(identity)}</small>
        </div>
      </div>
    `;
    const accountLink = profileUrl
      ? `<a class="gitlab-team-account-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" title="打开 ${escapeHtml(name)} 的 GitLab 主页" aria-label="打开 ${escapeHtml(name)} 的 GitLab 主页">${account}</a>`
      : account;
    const searchable = [name, identity, gitlabAccount, role.label, department, title].join(" ");
    return `
      <tr class="gitlab-team-row ${role.className}" data-member-search="${escapeHtml(searchable.toLowerCase())}">
        <td>
          ${accountLink}
        </td>
        <td>
          <span class="gitlab-team-role-pill ${role.className}">${escapeHtml(role.label)}</span>
          <small>${escapeHtml(role.hint)}</small>
        </td>
        <td>
          <span>${escapeHtml(department)}</span>
        </td>
        <td>
          <div class="gitlab-team-map-stack">
            ${renderStatusPill("GitLab", member.gitlab_configured, user.gitlab_username ? `@${user.gitlab_username}` : "待补用户名")}
            ${renderStatusPill("飞书", member.feishu_configured, member.feishu_configured ? "已映射" : "待映射 OpenID")}
          </div>
        </td>
        <td>
          <strong>${escapeHtml(formatDateTime(member.linked_at || member.updated_at))}</strong>
          <small>${member.source === "gitlab" ? "GitLab 同步记录" : "本地项目档案"}</small>
        </td>
      </tr>
    `;
  };

  const renderSummaryPill = (label, value, tone = "") => `
    <span class="gitlab-team-pill ${tone}">
      <b>${escapeHtml(value)}</b>
      <small>${escapeHtml(label)}</small>
    </span>
  `;

  const renderTeam = (team, syncing = false) => {
    const members = team?.members || [];
    const summary = team?.summary || {};
    const roleCounts = members.reduce((acc, member) => {
      const role = displayRole(member).label;
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const syncedRoles = members.filter(isGitLabRoleSynced).length;
    const topRoles = Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => `${role} ${count}`)
      .join(" / ");
    return `
      <header class="gitlab-team-head">
        <div>
          <span>GITLAB MEMBERS</span>
          <h3>项目成员</h3>
          <p>${members.length ? `账号、GitLab 权限和通知映射集中在这里。当前角色：${escapeHtml(topRoles || "暂无")}` : "从 GitLab 项目成员页同步 Owner / Maintainer / Developer / Reporter / Guest。"}</p>
        </div>
        <div class="gitlab-team-tools">
          <label class="gitlab-team-filter">
            <span>筛选成员</span>
            <input type="search" placeholder="搜索姓名、账号、角色或部门" data-gitlab-team-filter />
          </label>
          <button type="button" class="gitlab-team-sync" data-gitlab-team-sync="${team?.project_id || activeProjectId || ""}">
            ${syncing ? "正在同步成员与飞书资料…" : "同步成员与飞书"}
          </button>
        </div>
      </header>
      <div class="gitlab-team-summary">
        ${renderSummaryPill("团队人数", summary.total || members.length || 0)}
        ${renderSummaryPill("GitLab 角色", syncedRoles, syncedRoles === members.length ? "ok" : "warn")}
        ${renderSummaryPill("GitLab 映射", summary.gitlab_mapped || 0, "blue")}
        ${renderSummaryPill("飞书已映射", summary.feishu_ready || 0, summary.missing_feishu ? "warn" : "ok")}
      </div>
      <div class="gitlab-team-members">
        ${members.length ? `
          <table class="gitlab-team-table">
            <thead>
              <tr>
                <th>账户</th>
                <th>角色</th>
                <th>部门</th>
                <th>映射状态</th>
                <th>同步信息</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(renderMember).join("")}
            </tbody>
          </table>
          <div class="gitlab-team-filter-empty" hidden>没有匹配的成员。</div>
        ` : `
          <div class="gitlab-team-empty">
            <strong>还没有同步到 GitLab 成员</strong>
            <span>点击“同步成员”，系统会读取项目成员页并自动回填负责人、参与人、GitLab 用户名和访问级别。</span>
          </div>
        `}
      </div>
      ${summary.missing_feishu ? `
        <div class="gitlab-team-warning">
          还有 ${escapeHtml(summary.missing_feishu)} 位成员缺少飞书映射，请在“数据与规则 / 成员映射”补齐。映射完成后仍按系统角色判定接收资格，内测用户不接收任何飞书提醒、消息或机器人通知。
        </div>
      ` : ""}
      ${team?.owner_name && summary.project_owner_in_gitlab === false ? `
        <div class="gitlab-team-warning gitlab-team-owner-note">
          项目档案负责人“${escapeHtml(team.owner_name)}”尚未绑定到 GitLab 成员，本页团队人数仅按 GitLab 成员接口统计。
        </div>
      ` : ""}
    `;
  };

  const renderLoading = () => `
    <div class="gitlab-team-loading">
      <i></i>
      <span>正在读取 GitLab 团队结构…</span>
    </div>
  `;

  const renderError = (projectId, message) => `
    <header class="gitlab-team-head">
      <div>
        <span>GITLAB TEAM SOURCE</span>
        <h3>GitLab 团队结构</h3>
        <p>${escapeHtml(message || "暂时无法读取团队成员")}</p>
      </div>
      <button type="button" class="gitlab-team-sync" data-gitlab-team-sync="${projectId || ""}">重新同步</button>
    </header>
  `;

  const ensurePanel = () => {
    const detailLayout = document.querySelector(".project-detail-page .detail-layout");
    const basicCard = document.querySelector(".project-detail-page .basic-card");
    if (!detailLayout || !basicCard) return null;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
    }
    panel.className = "detail-card gitlab-team-addon gitlab-team-card";
    const scheduleCard = detailLayout.querySelector(".legacy-project-schedule");
    const anchor = scheduleCard || basicCard;
    if (panel.parentElement !== detailLayout || panel.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", panel);
    }
    return panel;
  };

  const renderPanel = ({ projectId, team, loading = false, error = "", syncing = false } = {}) => {
    const panel = ensurePanel();
    if (!panel) return;
    panel.innerHTML = loading ? renderLoading() : error ? renderError(projectId, error) : renderTeam(team, syncing);
  };

  const loadTeam = async projectId => {
    if (!projectId) return;
    activeProjectId = projectId;
    if (teamCache.has(projectId)) {
      renderPanel({ projectId, team: teamCache.get(projectId) });
      return;
    }
    renderPanel({ projectId, loading: true });
    try {
      inflight?.abort?.();
      inflight = new AbortController();
      const team = await requestJson(`/api/projects/${projectId}/gitlab-team`, { signal: inflight.signal });
      teamCache.set(projectId, team);
      if (activeProjectId === projectId) renderPanel({ projectId, team });
    } catch (error) {
      if (error.name === "AbortError") return;
      if (activeProjectId === projectId) renderPanel({ projectId, error: error.message });
    }
  };

  const syncTeam = async projectId => {
    if (!projectId) {
      showToast("还没有定位到当前项目编号");
      return;
    }
    renderPanel({ projectId, team: teamCache.get(projectId), syncing: true });
    try {
      const result = await requestJson(`/api/projects/${projectId}/gitlab-team/sync`, { method: "POST" });
      const team = result.team || await requestJson(`/api/projects/${projectId}/gitlab-team`);
      teamCache.set(projectId, team);
      renderPanel({ projectId, team });
      const feishuSync = result.feishu_sync || {};
      if (feishuSync.status === "ok") {
        const aliasMessage = Number(feishuSync.mapped_aliases || 0)
          ? `，已修复 ${feishuSync.mapped_aliases} 条历史账号映射`
          : "";
        const unresolvedMessage = Number(feishuSync.unresolved_email_identities || 0)
          ? `；${feishuSync.unresolved_email_identities} 位成员未返回飞书身份，暂不能映射头像`
          : "";
        showToast(`已同步 ${result.member_count || team.members?.length || 0} 位成员，并刷新飞书头像${aliasMessage}${unresolvedMessage}`);
      } else if (feishuSync.status === "unavailable") {
        showToast(`已同步 ${result.member_count || team.members?.length || 0} 位 GitLab 成员；飞书资料暂未刷新：${text(feishuSync.message) || "请稍后重试"}`);
      } else {
        showToast(`已同步 ${result.member_count || team.members?.length || 0} 位 GitLab 成员`);
      }
    } catch (error) {
      renderPanel({ projectId, team: teamCache.get(projectId), error: error.message });
      showToast(error.message || "GitLab 成员同步失败");
    }
  };

  const enhance = () => {
    const projectId = getProjectIdFromPage();
    if (!projectId || !document.querySelector(".project-detail-page")) {
      document.getElementById(PANEL_ID)?.remove();
      activeProjectId = null;
      return;
    }
    ensurePanel();
    if (activeProjectId !== projectId) loadTeam(projectId);
    else if (!document.getElementById(PANEL_ID)?.children.length) renderPanel({ projectId, team: teamCache.get(projectId) });
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
    const syncButton = event.target.closest("[data-gitlab-team-sync]");
    if (!syncButton) return;
    event.preventDefault();
    event.stopPropagation();
    syncTeam(Number(syncButton.dataset.gitlabTeamSync || activeProjectId || getProjectIdFromPage()));
  }, true);

  document.addEventListener("input", event => {
    const input = event.target.closest("[data-gitlab-team-filter]");
    if (!input) return;
    const panel = input.closest(`#${PANEL_ID}`);
    const query = text(input.value).toLowerCase();
    const rows = [...panel.querySelectorAll(".gitlab-team-row")];
    let visible = 0;
    rows.forEach(row => {
      const matched = !query || row.dataset.memberSearch?.includes(query);
      row.hidden = !matched;
      if (matched) visible += 1;
    });
    const empty = panel.querySelector(".gitlab-team-filter-empty");
    if (empty) empty.hidden = visible !== 0;
  }, true);

  const observer = new MutationObserver(scheduleEnhance);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleEnhance();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
