(() => {
  "use strict";

  const STATUS_CLASSES = [
    "row-accent-critical",
    "row-accent-warning",
    "row-accent-stalled",
    "row-accent-success",
    "row-accent-info",
    "row-accent-muted",
  ];

  const ROW_SELECTOR = [
    ".project-row",
    ".alert-row",
    ".notification-row",
    ".delivery-card",
    ".sync-log-row",
    ".anomaly-list article",
    ".quality-issues button",
    ".online-review-list button",
    ".followup-list button",
    ".alert-rule-grid article",
    ".ai-notification-stream article",
  ].join(",");

  const USER_KEY = "ai_project_hub_user_id";
  const BRAND_LOGO_URL = "/image/logo.png";
  const METRIC_FILTERS = [
    { value: "all", healthIndexes: [0] },
    { value: "normal", healthIndexes: [1] },
    { value: "attention_group", healthIndexes: [2, 3] },
    { value: "risk_group", healthIndexes: [4, 5] },
  ];
  let projectAvatarCache = null;
  let projectAvatarLoading = false;
  let sidebarResizeDragging = false;
  const alertDateFilterState = { mode: "day", start: "", end: "" };
  const alertDatePeriodLabels = { day: "按日", week: "按周", month: "按月", custom: "自定义范围" };

  const textOf = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const toCountText = (count) => (Number(count) > 99 ? "99+" : String(Math.max(0, Number(count) || 0)));
  const normalizeKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/\/+$/, "");

  function getUserHeaders() {
    const headers = {};
    const userId = localStorage.getItem(USER_KEY);
    if (userId) headers["X-User-Id"] = userId;
    return headers;
  }

  function classifyProjectRow(row) {
    const badges = [...row.querySelectorAll(".badge")];
    const healthBadge =
      badges.find((badge) => /正常|关注|异常|严重|停滞|待接入|归档/.test(textOf(badge))) ||
      badges[0];
    const healthText = textOf(healthBadge);
    const classes = healthBadge?.className || "";

    if (/red|critical/.test(classes) || /严重/.test(healthText)) return "critical";
    if (/black|stalled/.test(classes) || /停滞/.test(healthText)) return "stalled";
    if (/yellow|orange|warning|alert/.test(classes) || /关注|异常/.test(healthText)) return "warning";
    if (/green|normal|success/.test(classes) || /正常/.test(healthText)) return "success";
    if (/gray|unknown|archived/.test(classes) || /待接入|归档/.test(healthText)) return "muted";

    return "info";
  }

  function classifyRow(row) {
    if (row.classList.contains("project-row")) return classifyProjectRow(row);

    const text = textOf(row);

    if (row.classList.contains("read") && !row.classList.contains("unread")) return "muted";
    if (/严重|失败|失败原因|rejected|error|failed|CAP|红色/.test(text)) return "critical";
    if (/异常|关注|待处理|待验收|pending|warning|dry-run|未发送|未读通知/.test(text)) return "warning";
    if (/停滞|静默|stalled|归档/.test(text)) return "stalled";
    if (/正常|成功|已发送|飞书已发送|accepted|success|已上线|已处理|已具备/.test(text)) return "success";
    if (/未读|新增|新建|扫描|GitLab|记录/.test(text)) return "info";

    return "info";
  }

  function applyRowAccents() {
    document.querySelectorAll(ROW_SELECTOR).forEach((row) => {
      const status = classifyRow(row);
      row.classList.remove(...STATUS_CLASSES);
      row.classList.add(`row-accent-${status}`);
    });
  }

  function styleExistingBadges() {
    document.querySelectorAll("nav button b").forEach((badge) => {
      badge.classList.add("social-count-badge");
    });
    document
      .querySelectorAll(".tabs button span, .source-tabs button span, .alert-level-tabs button span")
      .forEach((badge) => badge.classList.add("social-tab-count"));
  }

  function replaceBrandLogos() {
    document
      .querySelectorAll('img[src="/assets/logos/AI_Innovation.png"], img[src$="/assets/logos/AI_Innovation.png"]')
      .forEach((logo) => {
        if (logo.getAttribute("src") !== BRAND_LOGO_URL) logo.setAttribute("src", BRAND_LOGO_URL);
      });
  }

  function ownLabel(button) {
    const clone = button.cloneNode(true);
    clone.querySelectorAll("b, span.social-count-badge, span.social-tab-count").forEach((node) => node.remove());
    return textOf(clone);
  }

  function findNavButton(label) {
    return [...document.querySelectorAll("nav button")].find((button) => ownLabel(button).includes(label));
  }

  function ensureNavBadge(button, count) {
    if (!button) return;
    let badge = [...button.children].find((child) => child.tagName === "B");
    if (!badge) {
      badge = document.createElement("b");
      button.appendChild(badge);
    }
    badge.classList.add("social-count-badge");
    badge.textContent = toCountText(count);
    badge.title = `${count}`;
    badge.hidden = !count;
  }

  function removeNavBadge(button) {
    if (!button) return;
    button.classList.add("nav-count-hidden");
    button.querySelectorAll(":scope > b, :scope > .social-count-badge").forEach((badge) => badge.remove());
  }

  function removeQuietCounts() {
    removeNavBadge(findNavButton("异常处理"));
    removeNavBadge(findNavButton("通知记录"));
    removeNavBadge(findNavButton("预警中心"));

    document.querySelectorAll(".notification-panel .tabs button").forEach((button) => {
      const label = ownLabel(button);
      button.classList.toggle("notification-all-tab", label.includes("全部"));
      button.classList.toggle("notification-unread-tab", label.includes("未读"));
      button.classList.toggle("notification-read-tab", label.includes("已读"));
      button.style.order = label.includes("全部") ? "1" : label.includes("未读") ? "2" : "3";
      button.querySelectorAll(":scope > .social-tab-count").forEach((badge) => badge.remove());
    });
  }

  function ensureTabCount(button, count, hot = false) {
    if (!button) return;
    let badge = button.querySelector(":scope > span.social-tab-count");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "social-tab-count";
      button.appendChild(badge);
    }
    badge.classList.toggle("is-hot", hot && Number(count) > 0);
    badge.textContent = toCountText(count);
    badge.title = `${count}`;
  }

  function updateNotificationTabs() {
    const panel = document.querySelector(".notification-panel");
    if (!panel) return;

    removeQuietCounts();
  }

  function setMetricCount(container, label, count) {
    const metric = [...(container?.querySelectorAll("span") || [])].find((item) =>
      textOf(item).includes(label),
    );
    const value = metric?.querySelector("b");
    if (value && value.textContent !== String(count)) value.textContent = String(count);
  }

  function clarifyAllAlertsLabel(button) {
    const labelNode = [...button.childNodes].find(
      (node) => node.nodeType === 3 && /全部(?!待处理)/.test(node.textContent || ""),
    );
    if (labelNode) labelNode.textContent = labelNode.textContent.replace("全部", "全部待处理");
  }

  function updateAlertTabs(counts) {
    const panel = document.querySelector(".alert-panel");
    if (!panel) return;

    const buttons = [...panel.querySelectorAll(".alert-level-tabs button")];
    buttons.forEach((button) => {
      const label = ownLabel(button);
      if (label.includes("异常")) ensureTabCount(button, counts.warning, counts.warning > 0);
      if (label.includes("严重")) ensureTabCount(button, counts.critical, counts.critical > 0);
      if (label.includes("停滞")) ensureTabCount(button, counts.stalled, counts.stalled > 0);
      if (label.includes("全部") && !label.includes("已处理")) {
        clarifyAllAlertsLabel(button);
        ensureTabCount(button, counts.alerts, false);
      }
      if (label.includes("已处理")) ensureTabCount(button, counts.resolved, false);
    });

    const radar = document.querySelector(".ai-followup-radar .ai-radar-metrics");
    setMetricCount(radar, "待追问", counts.alerts);
    setMetricCount(radar, "严重/停滞", counts.critical + counts.stalled);
  }

  function alertTriggeredDate(row) {
    const match = textOf(row).match(/最近触发[：:]\s*(\d{4}-\d{2}-\d{2})/);
    return match?.[1] || "";
  }

  function applyAlertDateFilter(panel) {
    if (!panel) return;
    const list = panel.querySelector(".alert-list");
    if (!list) return;

    const rows = [...list.querySelectorAll(".alert-row")];
    const { start, end } = alertDateFilterState;
    const filtering = Boolean(start || end);
    let visible = 0;

    rows.forEach((row) => {
      const date = alertTriggeredDate(row);
      const matches =
        !filtering ||
        (Boolean(date) && (!start || date >= start) && (!end || date <= end));
      row.classList.toggle("alert-date-filter-hidden", !matches);
      if (matches) visible += 1;
    });

    let empty = panel.querySelector(":scope > .alert-date-empty");
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "alert-date-empty";
      empty.setAttribute("role", "status");
      empty.innerHTML = "<strong>该时间范围内暂无预警</strong><span>请调整起始日期或结束日期后重试</span>";
      list.insertAdjacentElement("afterend", empty);
    }
    empty.hidden = !filtering || visible > 0;

    const status = panel.querySelector(".alert-date-filter-status");
    if (status) {
      const modeLabel = alertDatePeriodLabels[alertDateFilterState.mode] || alertDatePeriodLabels.day;
      status.textContent = filtering ? `${modeLabel} · ${visible} 条` : `${modeLabel} · 未选择日期`;
    }
    const clear = panel.querySelector(".alert-date-clear");
    if (clear) clear.disabled = !filtering;
  }

  function syncAlertDatePeriodPicker(host) {
    const calendar = window.LegacyAntdCalendar;
    if (!host || !calendar || typeof calendar.mountPeriod !== "function") return false;
    const signature = [alertDateFilterState.mode, alertDateFilterState.start, alertDateFilterState.end].join("|");
    if (host.dataset.periodSignature === signature && host.dataset.periodMounted === "true") return true;
    calendar.mountPeriod(host, {
      mode: alertDateFilterState.mode,
      start: alertDateFilterState.start,
      end: alertDateFilterState.end,
      size: "compact",
      className: "alert-date-period-picker",
      ariaLabel: "预警触发时间筛选",
      onChange: function (next) {
        alertDateFilterState.mode = alertDatePeriodLabels[next && next.mode] ? next.mode : "day";
        alertDateFilterState.start = String((next && next.start) || "");
        alertDateFilterState.end = String((next && next.end) || "");
        applyAlertDateFilter(document.querySelector(".alert-panel"));
        syncAlertDatePeriodPicker(host);
      },
    });
    host.dataset.periodSignature = signature;
    host.dataset.periodMounted = "true";
    return true;
  }

  function ensureAlertDateFilter() {
    const panel = document.querySelector(".alert-panel");
    const head = panel?.querySelector(":scope > .panel-head");
    if (!panel || !head) return;

    let filter = head.querySelector(":scope > .alert-date-filter");
    if (!filter) {
      filter = document.createElement("div");
      filter.className = "alert-date-filter";
      filter.setAttribute("aria-label", "预警触发时间筛选");

      const period = document.createElement("div");
      period.className = "alert-date-period";
      const status = document.createElement("span");
      status.className = "alert-date-filter-status";

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "alert-date-clear";
      clear.title = "清除时间筛选";
      clear.setAttribute("aria-label", "清除时间筛选");
      clear.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

      clear.addEventListener("click", () => {
        alertDateFilterState.start = "";
        alertDateFilterState.end = "";
        syncAlertDatePeriodPicker(period);
        applyAlertDateFilter(panel);
      });

      filter.append(period, status, clear);
      head.appendChild(filter);
      if (!syncAlertDatePeriodPicker(period)) {
        window.setTimeout(function () {
          syncAlertDatePeriodPicker(period);
        }, 0);
      }
    } else {
      syncAlertDatePeriodPicker(filter.querySelector(".alert-date-period"));
    }

    applyAlertDateFilter(panel);
  }

  function removeAlertDateFilter() {
    document.querySelectorAll(".alert-date-period").forEach((host) => {
      window.LegacyAntdCalendar?.unmountPeriod?.(host);
      delete host.dataset.periodSignature;
      delete host.dataset.periodMounted;
    });
    document.querySelectorAll(".alert-date-filter, .alert-date-empty").forEach((node) => node.remove());
    document.querySelectorAll(".alert-date-filter-hidden").forEach((row) => {
      row.classList.remove("alert-date-filter-hidden");
    });
  }

  function applyCounts(counts) {
    removeQuietCounts();
    updateAlertTabs(counts);
    updateNotificationTabs();
  }

  async function fetchJson(path) {
    const response = await fetch(path, { credentials: "same-origin", headers: getUserHeaders() });
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return response.json();
  }

  function pushProjectKey(map, key, project) {
    const normalized = normalizeKey(key);
    if (normalized && !map.has(normalized)) map.set(normalized, project);
  }

  function pushPersonKey(map, key, person) {
    const normalized = normalizeKey(key);
    if (normalized && !map.has(normalized)) map.set(normalized, person);
  }

  function cleanPersonName(value) {
    return String(value || "")
      .replace(/\s+·\s+.*$/, "")
      .replace(/\s*[•|｜]\s+.*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function repoNamespace(project) {
    const repoPath = normalizeKey(project?.gitlab_project_id || project?.gitlab_repo_url || "");
    return repoPath.includes("/") ? repoPath.split("/")[0] : "";
  }

  function stableHex(value) {
    let hash = 0x811c9dc5;
    Array.from(String(value || "gitlab-user")).forEach((char) => {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    });
    const chunk = (hash >>> 0).toString(16).padStart(8, "0");
    return `${chunk}${chunk}${chunk}${chunk}`;
  }

  function fallbackAvatarUrl(person, project) {
    const namespace = repoNamespace(project);
    const identity =
      person?.gitlab_username ||
      (project?.owner_name && cleanPersonName(project.owner_name) === cleanPersonName(person?.name) ? namespace : "") ||
      person?.name ||
      namespace;
    if (!identity) return "";
    return `https://secure.gravatar.com/avatar/${stableHex(identity)}?s=80&d=identicon&r=g`;
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function profileUrlForPerson(person, project) {
    const explicit = safeHttpUrl(person?.gitlab_profile_url);
    if (explicit) return explicit;
    const username = String(person?.gitlab_username || "").trim();
    const baseUrl = safeHttpUrl(project?.gitlab_base_url).replace(/\/$/, "");
    if (!username || !/^[A-Za-z0-9_.-]+$/.test(username) || !baseUrl) return "";
    return `${baseUrl}/${encodeURIComponent(username)}`;
  }

  function normalizeAvatarUrl(value) {
    return safeHttpUrl(value).replace(/\/$/, "");
  }

  function buildProjectAvatarCache(projects) {
    const projectMap = new Map();
    const peopleMap = new Map();
    const avatarMap = new Map();

    (Array.isArray(projects) ? projects : []).forEach((project) => {
      pushProjectKey(projectMap, project.display_name_zh || project.display_name, project);
      pushProjectKey(projectMap, project.name, project);
      pushProjectKey(projectMap, project.gitlab_project_id, project);
      pushProjectKey(projectMap, project.gitlab_repo_url, project);

      const repoPath = normalizeKey(project.gitlab_project_id || project.gitlab_repo_url || "");
      if (repoPath.includes("/")) pushProjectKey(projectMap, repoPath.split("/").pop(), project);

      const ownerPerson = project.owner_user
        ? { ...project.owner_user, name: project.owner_user.name || project.owner_name, projectRole: "负责人" }
        : project.owner_name
          ? { name: project.owner_name, avatar_url: "", gitlab_username: "", projectRole: "负责人" }
          : null;

      const people = [
        ownerPerson,
        ...(project.participant_users || []).map((user) => ({ ...user, projectRole: user.department_role || "成员" })),
        ...(project.participants || []).map((name) => ({
          name,
          avatar_url: "",
          gitlab_username: "",
          projectRole: "参与人",
        })),
      ].filter(Boolean);

      const byName = new Map();
      const uniquePeople = [];
      people.forEach((person) => {
        const name = cleanPersonName(person.name);
        if (!name || byName.has(normalizeKey(name))) return;
        person.name = name;
        person.__legacyGitLabProfileUrl = profileUrlForPerson(person, project);
        // Portraits are deliberately not keyed from GitLab here. A GitLab
        // account cannot safely be treated as the employee's Feishu identity.
        byName.set(normalizeKey(name), person);
        uniquePeople.push(person);
        pushPersonKey(peopleMap, name, person);
        pushPersonKey(peopleMap, person.gitlab_username, person);
      });
      project.__legacyPeopleByName = byName;
      project.__legacyPeople = uniquePeople;
    });

    projectAvatarCache = { projectMap, peopleMap, avatarMap };
    applyContributionAvatars();
  }

  async function loadProjectAvatarCache() {
    if (projectAvatarCache || projectAvatarLoading) return;
    projectAvatarLoading = true;
    try {
      const projects = await fetchJson("/api/projects?scope=all");
      buildProjectAvatarCache(projects);
    } catch (error) {
      projectAvatarCache = null;
    } finally {
      projectAvatarLoading = false;
    }
  }

  function projectForContributionRow(row) {
    if (!projectAvatarCache) return null;
    const projectName = textOf(row.querySelector(".contribution-project-cell strong"));
    const repoPath = textOf(row.querySelector(".contribution-project-cell small"));
    return (
      projectAvatarCache.projectMap.get(normalizeKey(repoPath)) ||
      projectAvatarCache.projectMap.get(normalizeKey(projectName)) ||
      null
    );
  }

  function personFromAvatar(project, avatar) {
    if (!projectAvatarCache) return null;
    const rawTitle = avatar.getAttribute("title") || textOf(avatar);
    const rowName = textOf(avatar.closest(".contribution-value-row")?.querySelector(".contribution-people-cell small"));
    const candidates = [
      cleanPersonName(avatar.dataset.gitlabPersonName),
      cleanPersonName(rawTitle),
      cleanPersonName(rawTitle.split("·")[0]),
      cleanPersonName(rawTitle.split(/[•|｜]/)[0]),
      cleanPersonName(rowName),
      cleanPersonName(textOf(avatar)),
    ].filter(Boolean);

    for (const name of candidates) {
      const person =
        project?.__legacyPeopleByName?.get(normalizeKey(name)) ||
        projectAvatarCache.peopleMap.get(normalizeKey(name));
      if (person) return person;
    }

    const fallbackName = candidates.find((name) => name.length > 1) || cleanPersonName(project?.owner_name);
    return fallbackName ? { name: fallbackName, avatar_url: "", gitlab_username: "" } : null;
  }

  function feishuChatUrl(person) {
    if (!person || person.feishu_chat_eligible !== true) return "";
    const userId = Number(person.id);
    if (!Number.isInteger(userId) || userId < 1) return "";
    return `/api/users/${userId}/feishu-chat`;
  }

  function bindFeishuChatAvatar(avatar, person) {
    const chatUrl = feishuChatUrl(person);
    avatar.onclick = null;
    avatar.onkeydown = null;
    delete avatar.dataset.feishuChat;
    if (!chatUrl) {
      avatar.removeAttribute("role");
      avatar.removeAttribute("tabindex");
      avatar.removeAttribute("aria-label");
      return;
    }

    const personName = cleanPersonName(person.name) || "成员";
    avatar.dataset.feishuChat = "true";
    avatar.setAttribute("role", "link");
    avatar.tabIndex = 0;
    avatar.setAttribute("aria-label", `在飞书中联系${personName}`);
    avatar.title = `${personName} · ${person.projectRole || "成员"}（点击在飞书中联系）`;
    const openChat = (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.open(chatUrl, "_blank", "noopener,noreferrer");
    };
    avatar.onclick = openChat;
    avatar.onkeydown = (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      openChat(event);
    };
  }

  function setAvatarImage(avatar, person, project) {
    if (!person?.name) return;
    avatar.dataset.gitlabPersonName = person.name;
    delete avatar.dataset.avatarFallback;
    delete avatar.dataset.gitlabProfileUrl;
    // The board pairs each face with an internal employee name. A GitLab
    // avatar is only an external profile image and cannot prove that it is
    // the same person in the department directory (bots are a common example).
    // Therefore show a portrait only after a Feishu identity has been mapped;
    // otherwise use the person's name as a neutral, auditable fallback.
    const avatarUrl = person?.feishu_avatar_url || "";
    if (!avatarUrl) {
      const fallback = String(person.name || "?").trim().slice(0, 2) || "?";
      avatar.replaceChildren(document.createTextNode(fallback));
      avatar.dataset.avatarFallback = "identity-unverified";
      avatar.dataset.avatarPolished = "true";
      avatar.title = `${person.name} · ${person.projectRole || "成员"}（未绑定飞书头像）`;
      bindFeishuChatAvatar(avatar, person);
      return;
    }
    let img = avatar.querySelector("img");
    if (!img || img.getAttribute("src") !== avatarUrl) {
      img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = person.name || avatar.getAttribute("title") || "成员头像";
      img.loading = "lazy";
      avatar.textContent = "";
      avatar.appendChild(img);
    }
    avatar.dataset.avatarPolished = "true";
    delete avatar.dataset.avatarFallback;
    // A platform account does not grant a browser session for GitLab. Keep
    // member avatars as identity indicators rather than linking people to a
    // potentially private external GitLab profile.
    avatar.title = `${person.name} · ${person.projectRole || "成员"}`;
    bindFeishuChatAvatar(avatar, person);
  }

  function syncContributionPeople(row, project) {
    const stack = row.querySelector(".value-avatar-stack");
    const people = project?.__legacyPeople || [];
    if (!stack || !people.length) return false;

    const visiblePeople = people.slice(0, 4);
    while (stack.children.length < visiblePeople.length) {
      const avatar = document.createElement("span");
      avatar.className = "value-avatar";
      stack.appendChild(avatar);
    }
    while (stack.children.length > visiblePeople.length) {
      stack.lastElementChild?.remove();
    }
    Array.from(stack.children).forEach((avatar, index) => {
      setAvatarImage(avatar, visiblePeople[index], project);
    });

    const names = people.map((person) => person.name).filter(Boolean);
    stack.title = names.join("、");
    const label = row.querySelector(".contribution-people-cell small");
    if (label && names.length) {
      label.textContent = names.length > 1 ? `${names[0]} 等 ${names.length} 人` : names[0];
      label.title = names.join("、");
    }
    return true;
  }

  function applyKnownGitLabAvatarLinks() {
    // Do not decorate visible portraits with a GitLab-derived identity.
    // All employee portraits are rendered from Feishu identity data only.
    return;
  }

  function applyContributionAvatars() {
    if (!projectAvatarCache) {
      loadProjectAvatarCache();
      return;
    }
    document.querySelectorAll(".contribution-value-row").forEach((row) => {
      const project = projectForContributionRow(row);
      if (syncContributionPeople(row, project)) return;
      row.querySelectorAll(".value-avatar").forEach((avatar) => {
        setAvatarImage(avatar, personFromAvatar(project, avatar), project);
      });
    });
    applyKnownGitLabAvatarLinks();
  }

  function gitLabProfileTarget(event) {
    return event.target instanceof Element ? event.target.closest("[data-gitlab-profile-url]") : null;
  }

  function openGitLabProfile(target, event) {
    const profileUrl = safeHttpUrl(target?.dataset.gitlabProfileUrl);
    if (!profileUrl) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(profileUrl, "_blank", "noopener,noreferrer");
  }

  function projectListTarget() {
    return document.querySelector(".project-filter-panel .filter-list-head") || document.querySelector(".project-filter-panel");
  }

  function heatmapTarget() {
    return document.querySelector(".heatmap-panel .panel-head") || document.querySelector(".heatmap-panel");
  }

  function scrollTargetIntoView(target) {
    if (!target) return;

    target.classList.remove("legacy-scroll-target");
    void target.offsetWidth;
    target.classList.add("legacy-scroll-target");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 12);
    window.scrollTo({
      top,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  function scrollProjectListIntoView() {
    scrollTargetIntoView(projectListTarget());
  }

  function scrollHeatmapIntoView() {
    scrollTargetIntoView(heatmapTarget());
  }

  function applyMetricFilter(value) {
    if (typeof window.__legacyApplyHealthFilter === "function") {
      window.__legacyApplyHealthFilter(value);
    } else {
      const fallbackIndex = value === "normal" ? 1 : 0;
      document.querySelectorAll(".health-tabs button")[fallbackIndex]?.click();
    }

    const scrollAfterFilter = value === "all" ? scrollHeatmapIntoView : scrollProjectListIntoView;
    requestAnimationFrame(() => requestAnimationFrame(scrollAfterFilter));
    window.setTimeout(scrollAfterFilter, 180);
    window.setTimeout(scrollAfterFilter, 420);
    window.setTimeout(scrollAfterFilter, 760);
    window.setTimeout(syncMetricFilterState, 220);
    window.setTimeout(syncMetricFilterState, 520);
  }

  function metricCardLabel(card) {
    const label = textOf(card.querySelector("span")) || textOf(card);
    return `${label} filter`;
  }

  function bindMetricFilters() {
    const cards = [...document.querySelectorAll(".hero-grid .metric")].slice(0, METRIC_FILTERS.length);
    cards.forEach((card, index) => {
      const config = METRIC_FILTERS[index];
      if (!config) return;

      card.dataset.metricHealthFilter = config.value;
      card.classList.add("metric-filter-card");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", metricCardLabel(card));

      if (card.dataset.metricFilterBound === "true") return;
      card.dataset.metricFilterBound = "true";
      card.addEventListener("click", () => applyMetricFilter(config.value));
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        applyMetricFilter(config.value);
      });
    });
  }

  function syncMetricFilterState() {
    const current = window.__legacyCurrentHealthFilter || "all";
    document.querySelectorAll(".metric-filter-card").forEach((card) => {
      const active = card.dataset.metricHealthFilter === current;
      card.classList.toggle("active", active);
      card.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const healthButtons = [...document.querySelectorAll(".health-tabs button")];
    healthButtons.forEach((button) => button.classList.remove("legacy-group-active"));
    const activeGroup = METRIC_FILTERS.find((item) => item.value === current);
    if (!activeGroup || activeGroup.value === "all" || activeGroup.value === "normal") return;
    activeGroup.healthIndexes.forEach((index) => healthButtons[index]?.classList.add("legacy-group-active"));
  }

  function setSidebarResizeCursor(active) {
    document.body.classList.toggle("legacy-resize-cursor-active", active);
  }

  function bindSidebarResizeCursor() {
    const handle = document.querySelector(".sidebar-resize-handle");
    if (!handle || handle.dataset.resizeCursorBound === "true") return;

    handle.dataset.resizeCursorBound = "true";
    handle.addEventListener("pointerenter", () => setSidebarResizeCursor(true));
    handle.addEventListener("pointerleave", () => {
      if (!sidebarResizeDragging) setSidebarResizeCursor(false);
    });
    handle.addEventListener("pointerdown", () => {
      sidebarResizeDragging = true;
      setSidebarResizeCursor(true);
    });

    const clear = () => {
      sidebarResizeDragging = false;
      setSidebarResizeCursor(false);
    };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
  }

  async function fetchCounts() {
    const [alertRows, unread, read, all] = await Promise.all([
      fetchJson("/api/alerts?status=all"),
      fetchJson("/api/notifications?read=unread&limit=200"),
      fetchJson("/api/notifications?read=read&limit=200"),
      fetchJson("/api/notifications?read=all&limit=200"),
    ]);

    const alertCounts = {
      alerts: 0,
      warning: 0,
      critical: 0,
      stalled: 0,
      resolved: 0,
    };
    (Array.isArray(alertRows) ? alertRows : []).forEach((alert) => {
      if (alert.status === "resolved") {
        alertCounts.resolved += 1;
        return;
      }
      alertCounts.alerts += 1;
      if (Object.hasOwn(alertCounts, alert.level)) alertCounts[alert.level] += 1;
    });

    return {
      ...alertCounts,
      unread: Array.isArray(unread) ? unread.length : 0,
      read: Array.isArray(read) ? read.length : 0,
      all: Array.isArray(all) ? all.length : 0,
    };
  }

  let lastCounts = null;
  let countRefreshPending = false;

  async function refreshCounts() {
    if (countRefreshPending) return;
    countRefreshPending = true;
    try {
      const counts = await fetchCounts();
      lastCounts = counts;
      applyCounts(counts);
    } catch (error) {
      styleExistingBadges();
    } finally {
      countRefreshPending = false;
    }
  }

  let scheduled = false;
  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      replaceBrandLogos();
      styleExistingBadges();
      removeQuietCounts();
      applyRowAccents();
      applyContributionAvatars();
      bindMetricFilters();
      syncMetricFilterState();
      bindSidebarResizeCursor();
      if (document.querySelector(".alert-panel")) ensureAlertDateFilter();
      else removeAlertDateFilter();
      if (lastCounts) applyCounts(lastCounts);
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      const label = textOf(event.target?.closest?.("button"));
      if (/标记已读|标记已处理|运行一次监控|生成每日早报|扫描 GitLab/.test(label)) {
        setTimeout(refreshCounts, 600);
        setTimeout(refreshCounts, 1600);
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = gitLabProfileTarget(event);
      if (target && !target.closest("a[href]")) openGitLabProfile(target, event);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      const target = gitLabProfileTarget(event);
      if (target && !target.closest("a[href]")) openGitLabProfile(target, event);
    },
    true,
  );

  window.addEventListener("load", scheduleEnhance);
  document.addEventListener("DOMContentLoaded", scheduleEnhance);
  window.addEventListener("load", refreshCounts);
  document.addEventListener("DOMContentLoaded", refreshCounts);
  window.addEventListener("load", loadProjectAvatarCache);
  document.addEventListener("DOMContentLoaded", loadProjectAvatarCache);
  setInterval(refreshCounts, 45000);

  new MutationObserver(scheduleEnhance).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleEnhance();
})();
