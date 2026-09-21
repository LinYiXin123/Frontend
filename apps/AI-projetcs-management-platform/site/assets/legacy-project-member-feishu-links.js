(function projectMemberFeishuLinks() {
  "use strict";

  const USER_STORAGE_KEY = "ai_project_hub_user_id";
  const DETAIL_PAGE_SELECTOR = ".project-detail-page";
  const DETAIL_ROW_SELECTOR = ".basic-card .detail-dl > div";
  const LINK_CLASS = "project-member-feishu-link";
  const detailRequests = new Map();
  let scheduled = false;

  function compact(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function requestHeaders() {
    const headers = { Accept: "application/json" };
    const userId = window.localStorage.getItem(USER_STORAGE_KEY);
    if (userId) headers["X-User-Id"] = userId;
    return headers;
  }

  function projectIdFromPage(page) {
    if (window.__legacyProjectSchedule?.projectIdFromPage) {
      return window.__legacyProjectSchedule.projectIdFromPage(page);
    }
    const rows = page.querySelectorAll(DETAIL_ROW_SELECTOR);
    for (const row of rows) {
      const label = row.querySelector("dt");
      if (!label || !compact(label.textContent).includes("项目编号")) continue;
      const match = compact(row.querySelector("dd")?.textContent).match(/PRJ-(\d+)/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function feishuChatUrl(person) {
    if (!person || person.feishu_chat_eligible !== true) return "";
    const userId = Number(person.id);
    if (!Number.isInteger(userId) || userId < 1) return "";
    return `/api/users/${userId}/feishu-chat`;
  }

  function requestProjectDetail(projectId) {
    if (!detailRequests.has(projectId)) {
      detailRequests.set(
        projectId,
        window.fetch(`/api/projects/${projectId}`, {
          credentials: "same-origin",
          headers: requestHeaders(),
          cache: "no-store",
        }).then(async (response) => {
          if (!response.ok) return null;
          return response.json();
        }).catch(() => null),
      );
    }
    return detailRequests.get(projectId);
  }

  function memberRows(page) {
    return Array.from(page.querySelectorAll(DETAIL_ROW_SELECTOR)).map((row) => ({
      row,
      label: compact(row.querySelector("dt")?.textContent),
      value: row.querySelector("dd"),
    })).filter((item) => item.value);
  }

  function membersForRow(project, label) {
    if (label === "项目负责人" || label === "负责人") {
      return project?.owner_user ? [project.owner_user] : [];
    }
    if (label === "参与人") {
      return Array.isArray(project?.participant_users) ? project.participant_users : [];
    }
    return [];
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function replaceWithMemberLinks(value, members) {
    const source = compact(value.textContent);
    const linkedMembers = members
      .map((member) => ({ member, name: compact(member?.name), url: feishuChatUrl(member) }))
      .filter((item) => item.name && source.includes(item.name));
    const signature = `${source}|${linkedMembers.map((item) => `${item.name}:${item.url}`).join("|")}`;
    if (value.dataset.projectMemberFeishuSignature === signature) return;

    const membersByName = new Map(linkedMembers.map((item) => [item.name, item]));
    const names = Array.from(membersByName.keys()).sort((left, right) => right.length - left.length);
    if (!names.some((name) => membersByName.get(name)?.url)) {
      value.textContent = source;
      value.dataset.projectMemberFeishuSignature = signature;
      return;
    }

    const expression = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "g");
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of source.matchAll(expression)) {
      const name = match[0];
      const start = match.index ?? 0;
      if (start > cursor) fragment.append(document.createTextNode(source.slice(cursor, start)));

      const item = membersByName.get(name);
      if (item?.url) {
        const link = document.createElement("a");
        link.className = LINK_CLASS;
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = `在飞书中联系${name}`;
        link.setAttribute("aria-label", `在飞书中联系${name}`);
        link.textContent = name;
        fragment.append(link);
      } else {
        fragment.append(document.createTextNode(name));
      }
      cursor = start + name.length;
    }
    if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    value.replaceChildren(fragment);
    value.dataset.projectMemberFeishuSignature = signature;
  }

  function enhancePage(page, project) {
    memberRows(page).forEach(({ label, value }) => {
      const members = membersForRow(project, label);
      if (members.length) replaceWithMemberLinks(value, members);
    });
  }

  function enhance() {
    scheduled = false;
    document.querySelectorAll(DETAIL_PAGE_SELECTOR).forEach((page) => {
      const projectId = projectIdFromPage(page);
      if (!Number.isInteger(projectId) || projectId < 1) return;
      void requestProjectDetail(projectId).then((project) => {
        if (!project || !page.isConnected || projectIdFromPage(page) !== projectId) return;
        enhancePage(page, project);
      });
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  window.__legacyProjectMemberFeishuLinks = {
    projectIdFromPage,
    feishuChatUrl,
    membersForRow,
  };

  document.addEventListener("DOMContentLoaded", schedule);
  window.addEventListener("load", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
