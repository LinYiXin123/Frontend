(() => {
  const ORGANIZATION_APPEARANCE_TOTAL = 57;
  const UNIQUE_DIRECTORY_TOTAL = 56;
  const PAGE_SIZES = [5, 10, 50];

  let root = null;
  let panel = null;
  let users = [];
  let currentUser = null;
  let category = "directory";
  let lifecycle = "active";
  let search = "";
  let organization = "";
  let department = "";
  let roleFilter = "all";
  let mappingFilter = "all";
  let page = 1;
  let pageSize = 10;
  let scheduled = false;
  let orbitTooltip = null;
  let orbitTooltipHideTimer = 0;
  let activeOrbitNode = null;
  let governanceSelectSequence = 0;
  let governanceSnapshot = null;

  const text = (value) => String(value ?? "").trim();
  const normalize = (value) => text(value).toLocaleLowerCase("zh-CN");

  function safeExternalUrl(value) {
    const candidate = text(value);
    if (!candidate) return "";
    try {
      const url = new URL(candidate, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function feishuAvatarUrl(user) {
    return safeExternalUrl(user.feishu_avatar_url);
  }

  function memberAvatarSource(user) {
    const feishuUrl = feishuAvatarUrl(user);
    if (feishuUrl) return { url: feishuUrl, source: "feishu", feishuUrl };
    return { url: "", source: "", feishuUrl: "" };
  }

  function feishuChatUrl(user) {
    if (!user || user.feishu_receive_eligible !== true) return "";
    const userId = Number(user.id);
    if (!Number.isInteger(userId) || userId < 1) return "";
    return `/api/users/${userId}/feishu-chat`;
  }

  function orbitMemberLocation(user) {
    const memberships = Array.isArray(user.organization_memberships) ? user.organization_memberships : [];
    const paths = memberships
      .map((membership) => [text(membership.organization), text(membership.department)].filter(Boolean).join(" / "))
      .filter(Boolean);
    const uniquePaths = [...new Set(paths)];
    if (uniquePaths.length) return uniquePaths.join(" · ");
    return [text(user.organization), text(user.department)].filter(Boolean).join(" / ") || "组织架构待完善";
  }

  function orbitMembers(sourceUsers) {
    const people = sourceUsers
      .filter((user) => text(user.name) && (user.lifecycle_status || "active") === "active")
      .sort(
        (left, right) =>
          Number(Boolean(right.is_department_leader)) - Number(Boolean(left.is_department_leader)) ||
          Number(Boolean(memberAvatarSource(right).url)) - Number(Boolean(memberAvatarSource(left).url)) ||
          text(left.name).localeCompare(text(right.name), "zh-CN"),
      )
      .slice(0, 40);
    const leaders = people.filter((user) => user.is_department_leader).slice(0, 8);
    const rest = people.filter((user) => !user.is_department_leader);
    const firstRing = [...leaders, ...rest.slice(0, Math.max(0, 8 - leaders.length))].slice(0, 8);
    const used = new Set(firstRing.map((user) => user.id ?? user.name));
    const remaining = people.filter((user) => !used.has(user.id ?? user.name));
    return [...firstRing, ...remaining.slice(0, 12), ...remaining.slice(12, 28)];
  }

  function cancelOrbitTooltipHide() {
    if (orbitTooltipHideTimer) window.clearTimeout(orbitTooltipHideTimer);
    orbitTooltipHideTimer = 0;
  }

  function hideOrbitTooltip() {
    cancelOrbitTooltipHide();
    if (orbitTooltip) orbitTooltip.hidden = true;
    activeOrbitNode?.closest(".org-circles-stage")?.classList.remove("member-orbit-active");
    activeOrbitNode = null;
  }

  function scheduleOrbitTooltipHide() {
    cancelOrbitTooltipHide();
    orbitTooltipHideTimer = window.setTimeout(hideOrbitTooltip, 180);
  }

  function ensureOrbitTooltip() {
    if (orbitTooltip?.isConnected) return orbitTooltip;
    orbitTooltip = element("aside", "member-orbit-tooltip");
    orbitTooltip.id = "member-orbit-tooltip";
    orbitTooltip.hidden = true;
    orbitTooltip.setAttribute("role", "tooltip");
    orbitTooltip.setAttribute("aria-live", "polite");
    orbitTooltip.addEventListener("mouseenter", cancelOrbitTooltipHide);
    orbitTooltip.addEventListener("mouseleave", scheduleOrbitTooltipHide);
    orbitTooltip.addEventListener("focusin", cancelOrbitTooltipHide);
    orbitTooltip.addEventListener("focusout", scheduleOrbitTooltipHide);
    document.body.append(orbitTooltip);
    return orbitTooltip;
  }

  function buildOrbitAction(label, url, missingLabel) {
    if (!url) return element("span", "member-orbit-action is-disabled", missingLabel);
    const link = element("a", "member-orbit-action", label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.memberOrbitAction = label === "访问GitLab" ? "gitlab" : "feishu";
    return link;
  }

  function orbitAvatar(user, className = "") {
    const avatar = memberAvatarSource(user);
    if (!avatar.url) return element("span", `${className} member-orbit-avatar-fallback`.trim(), text(user.name).slice(0, 1) || "员");
    const image = element("img", `${className} member-orbit-avatar-image is-${avatar.source}`.trim());
    image.src = avatar.url;
    image.alt = `${text(user.name) || "成员"}的${avatar.source === "gitlab" ? "GitLab" : "飞书"}头像`;
    image.dataset.avatarSource = avatar.source;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      if (image.dataset.avatarSource === "gitlab" && avatar.feishuUrl && avatar.feishuUrl !== avatar.url) {
        image.dataset.avatarSource = "feishu";
        image.classList.remove("is-gitlab");
        image.classList.add("is-feishu");
        image.alt = `${text(user.name) || "成员"}的飞书头像`;
        image.src = avatar.feishuUrl;
        return;
      }
      image.replaceWith(element("span", `${className} member-orbit-avatar-fallback`.trim(), text(user.name).slice(0, 1) || "员"));
    });
    return image;
  }

  function positionOrbitTooltip(source) {
    if (!orbitTooltip || orbitTooltip.hidden) return;
    const sourceRect = source.getBoundingClientRect();
    const tooltipRect = orbitTooltip.getBoundingClientRect();
    const gap = 12;
    const margin = 12;
    let left = sourceRect.left + sourceRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    let top = sourceRect.top - tooltipRect.height - gap;
    if (top < margin) top = sourceRect.bottom + gap;
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
    orbitTooltip.style.left = `${Math.round(left)}px`;
    orbitTooltip.style.top = `${Math.round(top)}px`;
  }

  function showOrbitTooltip(source, user) {
    cancelOrbitTooltipHide();
    const tooltip = ensureOrbitTooltip();
    activeOrbitNode?.closest(".org-circles-stage")?.classList.remove("member-orbit-active");
    activeOrbitNode = source;
    source.closest(".org-circles-stage")?.classList.add("member-orbit-active");
    tooltip.replaceChildren();

    const header = element("header", "member-orbit-tooltip-header");
    header.append(orbitAvatar(user, "member-orbit-tooltip-avatar"));
    const identity = element("div", "member-orbit-tooltip-identity");
    identity.append(element("strong", "", text(user.name) || "未命名成员"));
    identity.append(element("span", "", roleLabel(user)));
    header.append(identity);

    const organizationBlock = element("div", "member-orbit-tooltip-organization");
    organizationBlock.append(element("span", "", "组织架构"), element("strong", "", orbitMemberLocation(user)));
    if (text(user.department_role)) organizationBlock.append(element("small", "", text(user.department_role)));

    const actions = element("div", "member-orbit-tooltip-actions");
    actions.append(
      buildOrbitAction("访问GitLab", safeExternalUrl(profileUrl(user)), "GitLab 待映射"),
      buildOrbitAction("飞书私聊", feishuChatUrl(user), "当前不可通过平台私聊"),
    );
    tooltip.append(header, organizationBlock, actions);
    tooltip.hidden = false;
    window.requestAnimationFrame(() => positionOrbitTooltip(source));
  }

  function bindOrbitNode(node, user) {
    const signature = [
      user.id,
      user.name,
      user.organization,
      user.department,
      user.department_role,
      user.feishu_avatar_url,
      user.gitlab_profile_url,
      user.feishu_open_id,
      user.feishu_receive_eligible,
    ].map(text).join("|");
    if (node.dataset.memberOrbitSignature === signature) return;
    const previous = node.memberOrbitHandlers;
    if (previous) {
      node.removeEventListener("mouseenter", previous.show);
      node.removeEventListener("mouseleave", previous.hide);
      node.removeEventListener("focus", previous.show);
      node.removeEventListener("blur", previous.hide);
      node.removeEventListener("click", previous.show);
      node.removeEventListener("keydown", previous.keydown);
    }

    node.dataset.memberOrbitSignature = signature;
    node.dataset.memberOrbitUserId = text(user.id);
    node.classList.remove("has-gitlab-avatar");
    node.classList.toggle("has-feishu-avatar", Boolean(feishuAvatarUrl(user)));
    node.classList.toggle("is-gitlab-unmapped", !feishuAvatarUrl(user));
    node.removeAttribute("title");
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `${text(user.name)}，${orbitMemberLocation(user)}，查看成员信息`);
    node.setAttribute("aria-describedby", "member-orbit-tooltip");
    node.style.setProperty("--target-opacity", "0.96");
    node.style.setProperty("--target-blur", "0px");

    const content = node.querySelector(".circle-content");
    if (content) {
      content.replaceChildren(orbitAvatar(user, "circle-image"));
      content.setAttribute("aria-hidden", "true");
    }

    const show = () => showOrbitTooltip(node, user);
    const hide = () => scheduleOrbitTooltipHide();
    const keydown = (event) => {
      if (event.key === "Escape") hideOrbitTooltip();
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
    };
    node.addEventListener("mouseenter", show);
    node.addEventListener("mouseleave", hide);
    node.addEventListener("focus", show);
    node.addEventListener("blur", hide);
    node.addEventListener("click", show);
    node.addEventListener("keydown", keydown);
    node.memberOrbitHandlers = { show, hide, keydown };
  }

  function enhanceMemberOrbit(sourceUsers = users) {
    const stage = document.querySelector(".org-visual-orbit .org-circles-stage");
    if (!stage || !sourceUsers.length) return;
    const nodes = [...stage.querySelectorAll(".circle-item")];
    const members = orbitMembers(sourceUsers);
    if (!nodes.length || !members.length) return;
    stage.removeAttribute("aria-hidden");
    stage.classList.add("member-orbit-enhanced");
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", "成员映射轨道，可悬停或聚焦头像查看成员信息");
    nodes.forEach((node, index) => {
      const user = members[index];
      node.hidden = !user;
      if (user) bindOrbitNode(node, user);
    });
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function button(label, className, onClick) {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function memberIcon(name, className = "") {
    const icon = element("i", className);
    icon.setAttribute("data-lucide", name);
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function renderMemberIcons(scope = document) {
    if (!window.LegacyQualityIcons?.createIcons) return;
    window.LegacyQualityIcons.createIcons({
      icons: window.LegacyQualityIcons.icons,
      root: scope,
    });
  }

  function classify(user) {
    if (user.member_category) return user.member_category;
    if (text(user.organization) || hasFeishuMapping(user)) return "directory";
    const username = text(user.gitlab_username);
    return username && !username.toLowerCase().startsWith("project_") ? "gitlab_unmatched" : "system";
  }

  function profileUrl(user) {
    if (user.gitlab_profile_url) return user.gitlab_profile_url;
    const username = text(user.gitlab_username);
    if (!username) return "";
    if (text(user.organization).includes("健康元")) {
      return `https://git.joincare.com.cn/${encodeURIComponent(username)}`;
    }
    if (text(user.organization).includes("丽珠")) {
      return `http://10.10.132.18/${encodeURIComponent(username)}`;
    }
    return "";
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      throw new Error(typeof detail === "string" ? detail : `HTTP ${response.status}`);
    }
    return data;
  }

  async function refresh() {
    if (!root) return;
    root.dataset.loading = "true";
    try {
      const me = await api("/api/me");
      const nextUsers = await api("/api/users");
      users = Array.isArray(nextUsers) ? nextUsers : [];
      currentUser = me;
      render();
      enhanceMemberOrbit(users);
    } catch (error) {
      renderError(`成员数据加载失败：${error.message}`);
    } finally {
      if (root) root.dataset.loading = "false";
    }
  }

  async function syncFeishuDirectory(buttonNode) {
    if (currentUser?.role !== "admin" || !buttonNode) return;
    buttonNode.disabled = true;
    buttonNode.setAttribute("aria-busy", "true");
    const originalLabel = buttonNode.textContent;
    buttonNode.textContent = "同步中…";
    try {
      const summary = await api("/api/feishu/directory/sync", { method: "POST" });
      await refresh();
      const profileUpdates = Number(summary.email_updated || 0) + Number(summary.organization_updated || 0) + Number(summary.department_updated || 0);
      const identityUpdates = Number(summary.avatar_updated || 0);
      const changes = profileUpdates + identityUpdates;
      const departmentMessage = summary.department_sync_status === "permission_missing"
        ? "；部门权限尚未开通，邮箱和头像已照常同步"
        : "";
      const accountStatusMessage = summary.user_status_sync_status === "permission_missing"
        ? "；账号状态权限尚未开通，冻结账号暂不能自动识别"
        : ["token_unavailable", "unavailable"].includes(summary.user_status_sync_status)
          ? "；账号状态暂未读取，冻结状态可能延迟更新"
          : "";
      const disabled = Number(summary.lifecycle_disabled || 0);
      const departed = Number(summary.lifecycle_departed || 0);
      const lifecycleMessage = (disabled || departed)
        ? `；已更新成员状态：${departed ? `离职 ${departed} 人` : ""}${disabled && departed ? "、" : ""}${disabled ? `停用 ${disabled} 人` : ""}，历史项目关系已保留`
        : "";
      showBridgeStatus(`飞书通讯录已同步${changes ? `，更新 ${changes} 项资料` : ""}${lifecycleMessage}${departmentMessage}${accountStatusMessage}。`);
    } catch (error) {
      showBridgeStatus(`飞书通讯录同步失败：${error.message}`, true);
    } finally {
      if (buttonNode.isConnected) {
        buttonNode.disabled = false;
        buttonNode.removeAttribute("aria-busy");
        buttonNode.textContent = originalLabel;
      }
    }
  }

  function counts() {
    return users.reduce(
      (result, user) => {
        result[classify(user)] += 1;
        const state = user.lifecycle_status || "active";
        result[state] = (result[state] || 0) + 1;
        result.all += 1;
        return result;
      },
      { directory: 0, gitlab_unmatched: 0, system: 0, active: 0, disabled: 0, departed: 0, all: 0 },
    );
  }

  function organizationTree() {
    const tree = new Map();
    users.filter((user) => classify(user) === "directory").forEach((user) => {
      const org = text(user.organization) || "未归属组织";
      const dept = text(user.department) || "未填部门";
      if (!tree.has(org)) tree.set(org, new Set());
      tree.get(org).add(dept);
    });
    return [...tree.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
      .map(([org, departments]) => ({
        organization: org,
        departments: [...departments].sort((left, right) => left.localeCompare(right, "zh-CN")),
      }));
  }

  function matches(user) {
    const memberCategory = classify(user);
    if (category !== "all" && memberCategory !== category) return false;
    const state = user.lifecycle_status || "active";
    if (lifecycle === "inactive" && state === "active") return false;
    if (!["all", "inactive"].includes(lifecycle) && state !== lifecycle) return false;
    const memberships = Array.isArray(user.organization_memberships) ? user.organization_memberships : [];
    if (organization) {
      const belongs = memberships.some(
        (membership) =>
          text(membership.organization) === organization &&
          (!department || text(membership.department) === department),
      );
      if (!belongs) return false;
    } else if (department && text(user.department) !== department) {
      return false;
    }
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    const mappingComplete = Boolean(text(user.email) && text(user.gitlab_username) && text(user.feishu_open_id));
    if (mappingFilter === "complete" && !mappingComplete) return false;
    if (mappingFilter === "incomplete" && mappingComplete) return false;
    const query = normalize(search);
    if (!query) return true;
    return [
      user.name,
      user.email,
      user.organization,
      user.department,
      user.department_role,
      user.manager_name,
      user.gitlab_username,
      user.feishu_open_id,
      user.feishu_union_id,
      ...(Array.isArray(user.oversight_organizations) ? user.oversight_organizations : []),
    ].some((value) => normalize(value).includes(query));
  }

  function filteredUsers() {
    return users.filter(matches);
  }

  function roleLabelValue(role) {
    return { admin: "管理员", developer: "普通成员", tester: "内测用户" }[role] || "内测用户";
  }

  function roleLabel(user) {
    return roleLabelValue(user.role);
  }

  function roleClass(role) {
    return ["admin", "developer", "tester"].includes(role) ? role : "tester";
  }

  function setCategory(nextCategory) {
    category = nextCategory;
    if (nextCategory !== "directory") {
      organization = "";
      department = "";
    }
    page = 1;
    render();
  }

  function setLifecycle(nextLifecycle) {
    lifecycle = nextLifecycle;
    page = 1;
    render();
  }

  function closeHierarchyMenu(source) {
    source.closest("details")?.removeAttribute("open");
  }

  function buildHierarchyFilter() {
    const wrapper = element("details", "member-hierarchy-filter");
    const selected = department || organization || "全部组织 / 部门";
    const summary = element("summary", "member-hierarchy-summary");
    summary.append(element("span", "", "角色 / 部门"), element("small", "", selected), element("i", "", "⌄"));
    wrapper.append(summary);

    const menu = element("div", "member-hierarchy-menu");
    menu.append(
      button("全部组织 / 部门", !organization ? "selected" : "", (event) => {
        organization = "";
        department = "";
        category = "directory";
        page = 1;
        closeHierarchyMenu(event.currentTarget);
        render();
      }),
    );

    organizationTree().forEach((group) => {
      const item = element("div", "member-hierarchy-item");
      const orgButton = button(group.organization, organization === group.organization && !department ? "selected" : "", (event) => {
        organization = group.organization;
        department = "";
        category = "directory";
        page = 1;
        closeHierarchyMenu(event.currentTarget);
        render();
      });
      orgButton.append(element("i", "", "›"));
      const submenu = element("div", "member-hierarchy-submenu");
      group.departments.forEach((name) => {
        submenu.append(
          button(name, organization === group.organization && department === name ? "selected" : "", (event) => {
            organization = group.organization;
            department = name;
            category = "directory";
            page = 1;
            closeHierarchyMenu(event.currentTarget);
            render();
          }),
        );
      });
      item.append(orgButton, submenu);
      menu.append(item);
    });
    wrapper.append(menu);
    return wrapper;
  }

  function mappingIsComplete(user) {
    return Boolean(text(user.email) && text(user.gitlab_username) && hasFeishuMapping(user));
  }

  function hasFeishuMapping(user) {
    // The API deliberately redacts a tester's OpenID.  `feishu_mapped` keeps
    // the mapping state visible without turning an ineligible identity into a
    // chat target or falsely displaying it as pending.
    return user?.feishu_mapped === true || Boolean(text(user?.feishu_open_id));
  }

  function feishuMappingDescription(user) {
    if (!hasFeishuMapping(user)) {
      return { label: "待映射", detail: "OpenID / UnionID 待补齐", mapped: false };
    }
    if (user?.feishu_receive_eligible === true) {
      return { label: "已映射", detail: "可接收飞书私聊", mapped: true };
    }
    if (user?.role === "tester") {
      return { label: "已映射", detail: "内测用户不接收", mapped: true };
    }
    return { label: "已映射", detail: "当前不可接收", mapped: true };
  }

  function buildCompactSelect(label, value, options, onChange, className = "") {
    const wrapper = element("div", `member-governance-select ${className}`.trim());
    const selected = options.find(([optionValue]) => String(optionValue) === String(value)) || options[0];
    const listId = `member-governance-select-${++governanceSelectSequence}`;
    const trigger = button("", "member-governance-select-trigger", (event) => {
      event.stopPropagation();
      setOpen(!wrapper.classList.contains("is-open"));
    });
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", listId);
    trigger.setAttribute("aria-label", `${label}，当前为${selected?.[1] || ""}`);
    const chevron = element("i", "member-governance-select-chevron", "⌄");
    chevron.setAttribute("aria-hidden", "true");
    trigger.append(
      element("span", "member-governance-select-label", label),
      element("strong", "member-governance-select-value", selected?.[1] || ""),
      chevron,
    );

    const menu = element("div", "member-governance-select-menu");
    menu.id = listId;
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", `${label}选项`);
    const optionButtons = options.map(([optionValue, optionLabel], optionIndex) => {
      const isSelected = String(optionValue) === String(selected?.[0]);
      const option = button("", `member-governance-select-option${isSelected ? " is-selected" : ""}`, (event) => {
        event.stopPropagation();
        setOpen(false);
        onChange(optionValue);
      });
      option.id = `${listId}-option-${optionIndex}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(isSelected));
      option.tabIndex = -1;
      const check = element("i", "member-governance-select-check", "✓");
      check.setAttribute("aria-hidden", "true");
      option.append(element("span", "", optionLabel), check);
      option.addEventListener("keydown", (event) => {
        const currentIndex = optionButtons.indexOf(option);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? optionButtons.length - 1
              : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + optionButtons.length) % optionButtons.length;
          optionButtons[nextIndex]?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false, true);
        } else if (event.key === "Tab") {
          setOpen(false);
        }
      });
      menu.append(option);
      return option;
    });

    function closeOtherSelects() {
      document.querySelectorAll(".member-governance-select.is-open").forEach((control) => {
        if (control !== wrapper && typeof control.closeGovernanceSelect === "function") {
          control.closeGovernanceSelect();
        }
      });
    }

    function handleOutsidePointer(event) {
      if (!wrapper.contains(event.target)) setOpen(false);
    }

    function setOpen(open, restoreFocus = false) {
      if (open) closeOtherSelects();
      wrapper.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      if (open) document.addEventListener("pointerdown", handleOutsidePointer, true);
      if (restoreFocus) trigger.focus();
    }

    wrapper.closeGovernanceSelect = () => setOpen(false);
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
        const selectedIndex = Math.max(0, optionButtons.findIndex((option) => option.getAttribute("aria-selected") === "true"));
        const targetIndex = event.key === "ArrowUp" && selectedIndex === 0 ? optionButtons.length - 1 : selectedIndex;
        optionButtons[targetIndex]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false, true);
      }
    });
    wrapper.append(trigger, menu);
    return wrapper;
  }

  function exportMembers() {
    const header = ["姓名", "组织", "部门", "系统角色", "GitLab", "飞书映射", "项目个数"];
    const lines = users.map((user) => [
      user.name,
      user.organization,
      user.department,
      roleLabel(user),
      user.gitlab_username,
      user.feishu_open_id ? "已映射" : "待映射",
      Number(user.project_count || 0),
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `成员映射-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function buildGovernanceIntro() {
    const tally = counts();
    const complete = users.filter(mappingIsComplete).length;
    const incomplete = users.length - complete;
    const anomalous = users.filter((user) => (user.lifecycle_status || "active") !== "active").length;
    const intro = element("section", "member-governance-intro");
    const steps = element("div", "member-governance-steps");
    [
      ["1", "查看待完善", `${incomplete} 位成员需要补齐身份映射`],
      ["2", "核对身份映射", "确认 GitLab 与飞书账号属于同一人"],
      ["3", "设置系统角色", "三层角色会同步决定权限与飞书消息接收资格"],
    ].forEach(([index, title, description]) => {
      const item = element("article", "member-governance-step");
      item.append(element("span", "member-governance-step-index", index));
      const copy = element("div");
      copy.append(element("strong", "", title), element("small", "", description));
      item.append(copy);
      steps.append(item);
    });

    const metrics = element("div", "member-governance-metrics");
    [
      [tally.all, "成员总数", "来自项目负责人、参与人和手动新增", "Layers3"],
      [complete, "映射完整", "邮箱、GitLab、飞书 OpenID 均已填写", "ShieldCheck"],
      [incomplete, "待完善", "优先补齐 GitLab 与飞书身份", "Clock3"],
      [anomalous, "账号异常", "停用、离职或身份冲突账号", "ShieldAlert"],
    ].forEach(([value, label, description, iconName], index) => {
      const card = element("article", `member-governance-metric metric-${index + 1}`);
      const icon = element("span", "member-governance-metric-icon");
      icon.append(memberIcon(iconName));
      const copy = element("div", "member-governance-metric-copy");
      copy.append(element("span", "", label), element("strong", "", value), element("small", "", description));
      card.append(icon, copy);
      metrics.append(card);
    });
    intro.append(steps, metrics);
    renderMemberIcons(metrics);
    return intro;
  }

  function buildGovernanceTasks() {
    const tasks = element("aside", "panel member-governance-tasks");
    const header = element("header", "member-governance-task-header");
    const heading = element("div");
    heading.append(element("h2", "", "待处理事项"), element("p", "", "优先处理身份映射和角色策略"));
    header.append(heading, button("查看全部", "member-governance-live", () => {
      mappingFilter = "incomplete";
      page = 1;
      render();
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    tasks.append(header);
    const list = element("div", "member-governance-task-list");
    const incomplete = users.filter((user) => !mappingIsComplete(user));
    [
      ["待补齐映射", incomplete.length, "缺少邮箱、GitLab 或飞书 OpenID", () => incomplete[0] && openLegacyEditor(incomplete[0])],
      ["内测角色复核", users.filter((user) => user.role === "tester").length, "内测用户不接收任何飞书提醒、消息或机器人通知", () => {
        category = "all";
        roleFilter = "tester";
        mappingFilter = "all";
        page = 1;
        render();
        window.requestAnimationFrame(() => panel?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }],
    ].forEach(([title, count, description, activate], index) => {
      const item = button("", `member-governance-task task-${index + 1}`, () => {
        activate();
      });
      const rank = element("span", "member-governance-task-rank", String(index + 1));
      const copy = element("div");
      copy.append(element("strong", "", title), element("small", "", description));
      item.append(rank, copy, element("b", "", String(count)), element("i", "", "查看"));
      list.append(item);
    });
    tasks.append(list);
    return tasks;
  }

  function buildOrbitLegend() {
    const filterPanel = element("section", "member-orbit-filter-panel");
    filterPanel.setAttribute("aria-label", "成员映射状态图例");
    const legend = element("div", "member-orbit-status-legend");
    [
      ["complete", "已完整映射", "CircleCheck"],
      ["partial", "部分映射", "CircleDashed"],
      ["pending", "待完善", "Clock3"],
      ["inactive", "离职 / 已停用", "CircleX"],
    ].forEach(([tone, label, iconName]) => {
      const item = element("span", `tone-${tone}`);
      item.append(memberIcon(iconName), document.createTextNode(label));
      legend.append(item);
    });
    filterPanel.append(legend);
    renderMemberIcons(filterPanel);
    return filterPanel;
  }

  function enhanceGovernanceLayout() {
    const content = panel?.closest(".rules-content");
    if (!content) return;
    const layout = content.closest(".rules-layout");
    const pageHeader = layout?.parentElement?.querySelector(":scope > header");
    const title = pageHeader?.querySelector("h1");
    const subtitle = pageHeader?.querySelector("p");
    if (!governanceSnapshot || governanceSnapshot.layout !== layout) {
      governanceSnapshot = {
        content,
        layout,
        pageHeader,
        titleText: text(title?.textContent),
        subtitleText: text(subtitle?.textContent),
      };
    }
    content.classList.add("member-governance-active");
    content.querySelector(":scope > .rule-summary-grid")?.classList.add("member-governance-native-hidden");
    content.querySelector(":scope > .org-overview-panel")?.classList.add("member-governance-native-hidden");
    const visual = content.querySelector(":scope > .org-visual-panel");
    visual?.classList.add("member-governance-visual");
    const visualCopy = visual?.querySelector(":scope > .org-visual-copy");
    visualCopy?.querySelector(":scope > .member-orbit-filter-panel")?.remove();
    visualCopy?.append(buildOrbitLegend());
    panel.classList.add("member-governance-table-panel");
    removeLegacyQualityIssues(panel);

    const panelTitle = panel.querySelector(":scope > .panel-head h2, :scope > .panel-head h3");
    const panelSubtitle = panel.querySelector(":scope > .panel-head p");
    if (panelTitle) panelTitle.textContent = `成员列表（${counts().all}）`;
    if (panelSubtitle) panelSubtitle.textContent = "飞书通讯录会自动同步成员资料与状态；飞书明确标记的冻结或离职账号会自动从成员列表移除，目录暂未返回时保留待核验，项目历史关系不受影响。";

    content.querySelector(":scope > .member-governance-intro")?.remove();
    content.querySelector(":scope > .member-governance-tasks")?.remove();
    const intro = buildGovernanceIntro();
    if (visual) {
      visual.before(intro);
      visual.after(buildGovernanceTasks());
    } else {
      content.prepend(intro);
    }

    layout?.classList.add("member-governance-layout");
    if (title) title.textContent = "成员映射";
    if (subtitle) subtitle.textContent = "统一管理组织身份、系统角色与项目协作关系，新手也能按步骤完成配置。";
    const actions = pageHeader?.querySelector(".header-actions");
    if (actions && !actions.querySelector(".member-export-button")) {
      const exportButton = button("导出成员", "ghost member-export-button", exportMembers);
      actions.prepend(exportButton);
    }
    if (actions && currentUser?.role === "admin" && !actions.querySelector(".member-directory-sync-button")) {
      const syncButton = button("立即同步飞书", "ghost member-directory-sync-button", () => syncFeishuDirectory(syncButton));
      actions.prepend(syncButton);
    }
  }

  function removeLegacyQualityIssues(targetPanel) {
    const issues = targetPanel?.querySelector(":scope > .quality-issues");
    if (!issues) return;
    const issuePagination = issues.nextElementSibling;
    if (issuePagination?.classList.contains("pagination")) issuePagination.remove();
    issues.remove();
  }

  function buildSummary() {
    const tally = counts();
    const summary = element("div", "member-directory-summary");
    const primary = element("div", "member-directory-summary-primary");
    primary.append(element("strong", "", `飞书组织口径 ${ORGANIZATION_APPEARANCE_TOTAL} 人次`));
    const rosterStatus = tally.directory === UNIQUE_DIRECTORY_TOTAL ? "已与飞书截图核对一致" : `应为 ${UNIQUE_DIRECTORY_TOTAL} 人，请检查数据`;
    primary.append(element("span", "", `唯一成员 ${tally.directory} 人 · 林鹏跨组织重复 1 次，已去重 · ${rosterStatus}`));
    const explanation = element("p", "");
    explanation.append(
      document.createTextNode("另外保留 "),
      element("b", "", `${tally.gitlab_unmatched} 个 GitLab 待认领身份`),
      document.createTextNode("；机器人、服务账号及系统占位记录已从成员列表排除。"),
    );
    explanation.append(document.createTextNode(` 当前在职 ${tally.active} 人，停用 ${tally.disabled} 人，离职 ${tally.departed} 人。`));
    summary.append(primary, explanation);
    return summary;
  }

  function buildToolbar() {
    const tally = counts();
    const toolbar = element("div", "member-directory-toolbar");
    const tabs = element("div", "member-directory-tabs");
    [
      ["directory", `组织成员 ${tally.directory}`],
      ["gitlab_unmatched", `GitLab 待认领 ${tally.gitlab_unmatched}`],
      ["all", `全部账号 ${tally.all}`],
    ].forEach(([key, label]) => tabs.append(button(label, category === key ? "active" : "", () => setCategory(key))));

    const searchLabel = element("label", "member-directory-search");
    const input = element("input");
    input.type = "search";
    input.value = search;
    input.placeholder = "搜索姓名、邮箱、部门、GitLab 或飞书标识";
    input.setAttribute("aria-label", "搜索成员");
    input.addEventListener("input", () => {
      search = input.value;
      page = 1;
      renderRows();
    });
    searchLabel.append(input);
    const refreshButton = button("刷新", "member-directory-refresh", refresh);
    const filters = element("div", "member-governance-filters");
    filters.append(
      buildHierarchyFilter(),
      buildCompactSelect("系统角色", roleFilter, [["all", "全部角色"], ["admin", "管理员"], ["developer", "普通成员"], ["tester", "内测用户"]], (value) => {
        roleFilter = value;
        page = 1;
        render();
      }),
      buildCompactSelect("映射状态", mappingFilter, [["all", "全部映射"], ["complete", "已完整"], ["incomplete", "待完善"]], (value) => {
        mappingFilter = value;
        page = 1;
        render();
      }),
    );
    toolbar.append(tabs, filters, searchLabel, refreshButton);
    return toolbar;
  }

  function lifecycleLabel(status) {
    return { active: "在职", disabled: "已停用", departed: "已离职" }[status] || "在职";
  }

  function closeLifecycleModal(overlay) {
    if (overlay?.lifecycleKeyHandler) {
      document.removeEventListener("keydown", overlay.lifecycleKeyHandler);
    }
    overlay?.remove();
    document.body.classList.remove("member-lifecycle-modal-open");
  }

  function openLifecycleModal(user) {
    if (currentUser?.role !== "admin") return;
    const currentStatus = user.lifecycle_status || "active";
    let selectedStatus = currentStatus;
    const overlay = element("div", "member-lifecycle-overlay");
    const modal = element("section", "member-lifecycle-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "member-lifecycle-title");

    const header = element("header", "member-lifecycle-header");
    const heading = element("div", "");
    const title = element("h3", "", `变更 ${user.name} 的成员状态`);
    title.id = "member-lifecycle-title";
    heading.append(title, element("p", "", "历史项目关系继续保留；停用或离职后将禁止登录、新指派和新通知。"));
    const close = button("×", "member-lifecycle-close", () => closeLifecycleModal(overlay));
    close.setAttribute("aria-label", "关闭成员状态弹窗");
    header.append(heading, close);

    const statusGroup = element("div", "member-lifecycle-options");
    statusGroup.setAttribute("role", "radiogroup");
    const statusButtons = [];
    [
      ["active", "在职", "可登录并接受项目指派"],
      ["disabled", "停用", "暂时禁止登录和新指派"],
      ["departed", "离职", "记录离职时间并停止新业务流转"],
    ].forEach(([value, label, description]) => {
      const option = button("", "member-lifecycle-option", () => {
        selectedStatus = value;
        statusButtons.forEach((item) => {
          const checked = item.dataset.value === selectedStatus;
          item.classList.toggle("selected", checked);
          item.setAttribute("aria-checked", String(checked));
        });
        updateSubmitState();
      });
      option.dataset.value = value;
      option.setAttribute("role", "radio");
      option.setAttribute("aria-checked", String(value === currentStatus));
      option.classList.toggle("selected", value === currentStatus);
      option.append(element("strong", "", label), element("small", "", description));
      statusButtons.push(option);
      statusGroup.append(option);
    });

    const reasonLabel = element("label", "member-lifecycle-reason");
    reasonLabel.append(element("span", "", "变更原因"));
    const reason = element("textarea");
    reason.rows = 3;
    reason.maxLength = 500;
    reason.required = true;
    reason.placeholder = "请填写可追溯的停用、离职或恢复原因";
    reason.addEventListener("input", () => updateSubmitState());
    reasonLabel.append(reason);
    const error = element("p", "member-lifecycle-error");
    error.hidden = true;

    const footer = element("footer", "member-lifecycle-footer");
    const cancel = button("取消", "ghost", () => closeLifecycleModal(overlay));
    const submit = button("确认变更", "primary", async () => {
      submit.disabled = true;
      error.hidden = true;
      try {
        await api(`/api/users/${user.id}/lifecycle`, {
          method: "PATCH",
          body: JSON.stringify({ status: selectedStatus, reason: reason.value.trim() }),
        });
        closeLifecycleModal(overlay);
        await refresh();
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
        updateSubmitState();
      }
    });
    function updateSubmitState() {
      submit.disabled = selectedStatus === currentStatus || reason.value.trim().length < 2;
    }
    updateSubmitState();
    footer.append(cancel, submit);
    modal.append(header, statusGroup, reasonLabel, error, footer);
    overlay.append(modal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeLifecycleModal(overlay);
    });
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        closeLifecycleModal(overlay);
      }
    };
    overlay.lifecycleKeyHandler = onKeydown;
    document.addEventListener("keydown", onKeydown);
    document.body.classList.add("member-lifecycle-modal-open");
    document.body.append(overlay);
    reason.focus();
  }

  function activeRulesTabLabel() {
    return text(document.querySelector(".rule-side-tabs button.active")?.textContent);
  }

  function isMemberGovernanceView(targetPanel = document.querySelector(".mapping-panel")) {
    const activeLabel = activeRulesTabLabel();
    if (activeLabel) return activeLabel.includes("成员映射");
    return Boolean(targetPanel?.isConnected);
  }

  function cleanupGovernanceLayout() {
    const hasGovernanceState = Boolean(
      governanceSnapshot
      || root
      || document.querySelector(".member-governance-layout, .member-governance-active"),
    );
    if (!hasGovernanceState) return;

    hideOrbitTooltip();
    document.querySelectorAll(".member-lifecycle-overlay").forEach((overlay) => closeLifecycleModal(overlay));

    const content = governanceSnapshot?.content || document.querySelector(".rules-content.member-governance-active");
    const layout = governanceSnapshot?.layout || document.querySelector(".rules-layout.member-governance-layout");
    const pageHeader = governanceSnapshot?.pageHeader || layout?.parentElement?.querySelector(":scope > header");

    content?.classList.remove("member-governance-active");
    content?.querySelectorAll(":scope > .member-governance-intro, :scope > .member-governance-tasks").forEach((node) => node.remove());
    content?.querySelector(":scope > .rule-summary-grid")?.classList.remove("member-governance-native-hidden");
    content?.querySelector(":scope > .org-overview-panel")?.classList.remove("member-governance-native-hidden");
    content?.querySelector(":scope > .org-visual-panel")?.classList.remove("member-governance-visual");
    content?.querySelector(":scope > .mapping-panel")?.classList.remove("member-governance-table-panel");
    layout?.classList.remove("member-governance-layout");

    const title = pageHeader?.querySelector("h1");
    const subtitle = pageHeader?.querySelector("p");
    if (title && governanceSnapshot?.titleText) title.textContent = governanceSnapshot.titleText;
    if (subtitle && governanceSnapshot?.subtitleText) subtitle.textContent = governanceSnapshot.subtitleText;
    pageHeader?.querySelector(".member-export-button")?.remove();
    pageHeader?.querySelector(".member-directory-sync-button")?.remove();

    if (root?.isConnected) root.remove();
    root = null;
    panel = null;
    governanceSnapshot = null;
  }

  function buildGitLabCell(user) {
    const cell = element("div", "member-gitlab-cell");
    const username = text(user.gitlab_username);
    if (!username) {
      cell.append(element("code", "", "待映射"));
      return cell;
    }
    const url = profileUrl(user);
    if (!url) {
      const code = element("code", "", username);
      code.title = "尚未确认该账号所属的 GitLab 实例";
      cell.append(code, element("small", "", "待确认所属 GitLab"));
      return cell;
    }
    const link = element("a", "member-gitlab-link");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `打开 ${user.name} 的 GitLab 主页`;
    link.append(element("code", "", username), element("span", "", "↗"));
    cell.append(link);
    return cell;
  }

  function syncInlineRoleControl(wrapper, select, role) {
    const normalizedRole = roleClass(role);
    ["admin", "developer", "tester"].forEach((value) => {
      wrapper.classList.toggle(`is-${value}`, value === normalizedRole);
    });
    select.dataset.role = normalizedRole;
  }

  async function updateInlineRole(user, select, wrapper) {
    const previousRole = roleClass(user.role);
    const nextRole = roleClass(select.value);
    if (currentUser?.role !== "admin" || nextRole === previousRole) {
      select.value = previousRole;
      syncInlineRoleControl(wrapper, select, previousRole);
      return;
    }

    wrapper.classList.add("is-saving");
    wrapper.setAttribute("aria-busy", "true");
    syncInlineRoleControl(wrapper, select, nextRole);
    select.disabled = true;
    try {
      const updated = await api(`/api/users/${user.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({
          role: nextRole,
          reason: `成员列表内联调整 ${text(user.name) || "未命名成员"} 系统角色：${roleLabelValue(previousRole)} → ${roleLabelValue(nextRole)}`,
        }),
      });
      Object.assign(user, updated);
      render();
      showBridgeStatus(`已将“${text(user.name) || "未命名成员"}”的系统角色调整为${roleLabel(user)}。`);
    } catch (requestError) {
      select.value = previousRole;
      syncInlineRoleControl(wrapper, select, previousRole);
      showBridgeStatus(`角色调整失败：${requestError.message}`, true);
    } finally {
      if (wrapper.isConnected) {
        wrapper.classList.remove("is-saving");
        wrapper.setAttribute("aria-busy", "false");
        select.disabled = currentUser?.role !== "admin";
      }
    }
  }

  function buildInlineRoleCell(user) {
    const role = element("div", "member-directory-role");
    const wrapper = element("div", "member-role-select-wrap");
    const select = element("select", "member-role-select");
    const memberName = text(user.name) || "未命名成员";
    const editable = currentUser?.role === "admin";
    [
      ["admin", "管理员"],
      ["developer", "普通成员"],
      ["tester", "内测用户"],
    ].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = value;
      select.append(option);
    });
    select.value = roleClass(user.role);
    select.disabled = !editable;
    select.setAttribute("aria-label", `设置${memberName}的系统角色`);
    select.title = editable ? `修改${memberName}的系统角色` : "仅管理员可修改系统角色";
    wrapper.classList.toggle("is-readonly", !editable);
    wrapper.setAttribute("aria-busy", "false");
    syncInlineRoleControl(wrapper, select, user.role);
    select.addEventListener("change", () => updateInlineRole(user, select, wrapper));
    wrapper.append(select);
    role.append(wrapper);
    return role;
  }

  function buildRow(user) {
    const hasIssue = !text(user.email) || !text(user.gitlab_username) || !hasFeishuMapping(user);
    const row = element("div", `mapping-row${hasIssue ? " has-issue" : ""}`);
    row.dataset.userId = user.id;

    const identity = element("div", "member-directory-identity");
    identity.append(orbitAvatar(user, "member-directory-avatar"));
    const identityCopy = element("div", "member-directory-identity-copy");
    const name = element("strong", "", user.name || "未命名成员");
    identityCopy.append(name, element("small", "", user.email || "未填邮箱"));
    identity.append(identityCopy);

    const org = element("div", "member-directory-organization");
    const location = user.is_innovation_director
      ? "健康元集团总部 / 丽珠集团总部 AI创新部"
      : [user.organization, user.department].filter(Boolean).join(" / ") || "未归属组织";
    org.append(element("strong", "", location), element("small", "", user.department_role || "成员"));

    const feishu = element("div", "member-directory-feishu");
    const feishuMapping = feishuMappingDescription(user);
    feishu.append(element("span", feishuMapping.mapped ? "is-complete" : "is-pending", feishuMapping.label));
    feishu.append(element("small", "", feishuMapping.detail));

    const mapping = element("div", "member-mapping-status");
    mapping.append(element("span", mappingIsComplete(user) ? "is-complete" : "is-pending", mappingIsComplete(user) ? "映射完整" : "待完善"));
    const projectCount = element("div", "member-project-count");
    projectCount.append(element("strong", "", String(Number(user.project_count || 0))), element("small", "", "个项目"));

    row.append(identity, org, buildInlineRoleCell(user), buildGitLabCell(user), feishu, mapping, projectCount);
    return row;
  }

  function buildPagination(total, totalPages) {
    const pagination = element("div", "pagination member-directory-pagination");
    const sizeControl = element("div", "page-size-control");
    const label = element("label", "", "每页显示");
    const select = element("select");
    PAGE_SIZES.forEach((size) => {
      const option = element("option", "", `${size} 位成员`);
      option.value = String(size);
      option.selected = size === pageSize;
      select.append(option);
    });
    select.addEventListener("change", () => {
      pageSize = Number(select.value) || 10;
      page = 1;
      renderRows();
    });
    label.append(select);
    sizeControl.append(label);

    const unit = category === "directory" ? "位已录入成员" : category === "gitlab_unmatched" ? "个待认领身份" : "条账号记录";
    const summary = element("span", "pagination-summary", `第 ${Math.min(page, totalPages)} / ${totalPages} 页，共 ${total} ${unit}`);
    const actions = element("div", "pagination-actions");
    const previous = button("上一页", "ghost", () => {
      page = Math.max(1, page - 1);
      renderRows();
    });
    previous.disabled = page <= 1;
    const next = button("下一页", "ghost", () => {
      page = Math.min(totalPages, page + 1);
      renderRows();
    });
    next.disabled = page >= totalPages;
    actions.append(previous, next);
    pagination.append(sizeControl, summary, actions);
    return pagination;
  }

  function renderRows() {
    if (!root) return;
    const table = root.querySelector(".member-directory-table");
    const oldBody = root.querySelector(".member-directory-table-body");
    const oldPagination = root.querySelector(".member-directory-pagination");
    if (!table || !oldBody) return;

    const filtered = filteredUsers();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const body = element("div", "member-directory-table-body");
    filtered.slice(start, start + pageSize).forEach((user) => body.append(buildRow(user)));
    if (!filtered.length) {
      const empty = element("div", "empty compact member-directory-empty");
      empty.append(element("div", "", "⌕"), element("h3", "", "没有匹配的成员"), element("p", "", "请更换关键词或组织筛选条件。"));
      body.append(empty);
    }
    oldBody.replaceWith(body);
    oldPagination?.replaceWith(buildPagination(filtered.length, totalPages));
  }

  function render() {
    if (!root) return;
    root.replaceChildren();
    root.append(buildToolbar());

    const table = element("div", "mapping-table member-directory-table");
    const head = element("div", "mapping-head member-directory-head");
    head.append(
      element("span", "", "成员"),
      element("span", "", "组织 / 部门"),
      element("span", "", "系统角色"),
      element("span", "", "GitLab"),
      element("span", "", "飞书"),
      element("span", "", "映射状态"),
      element("span", "", "项目个数"),
    );
    table.append(head, element("div", "member-directory-table-body"));
    root.append(table, element("div", "pagination member-directory-pagination"));
    renderRows();
    enhanceGovernanceLayout();
    window.requestAnimationFrame(() => enhanceMemberOrbit(filteredUsers()));
  }

  function renderError(message) {
    if (!root) return;
    root.replaceChildren();
    const error = element("div", "member-directory-error");
    error.append(element("strong", "", "成员目录暂不可用"), element("p", "", message), button("重新加载", "ghost", refresh));
    root.append(error);
  }

  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function showBridgeStatus(message, isError = false) {
    if (!root) return;
    let status = root.querySelector(".member-directory-bridge-status");
    if (!status) {
      status = element("div", "member-directory-bridge-status");
      root.prepend(status);
    }
    status.classList.toggle("error", isError);
    status.setAttribute("role", isError ? "alert" : "status");
    status.setAttribute("aria-live", isError ? "assertive" : "polite");
    status.textContent = message;
    window.setTimeout(() => status?.remove(), 3600);
  }

  function openLegacyEditor(user) {
    const legacySearch = panel?.querySelector(":scope > .panel-head .member-search input");
    if (!legacySearch) {
      showBridgeStatus("未找到原有成员编辑入口，请刷新页面后重试。", true);
      return;
    }
    setReactInputValue(legacySearch, user.name);
    showBridgeStatus(`正在打开“${user.name}”的成员映射…`);
    window.setTimeout(() => {
      const rows = [...panel.querySelectorAll(":scope > .mapping-table .mapping-row")];
      const target = rows.find((row) => row.querySelector("strong")?.textContent?.trim().startsWith(user.name));
      const edit = target?.querySelector("button");
      if (!edit || edit.disabled) {
        showBridgeStatus("成员编辑入口未就绪，请稍后重试。", true);
        return;
      }
      edit.click();
      let opened = false;
      let ticks = 0;
      const watcher = window.setInterval(() => {
        ticks += 1;
        const modal = document.querySelector(".modal.edit-modal");
        opened ||= Boolean(modal);
        if ((opened && !modal) || ticks > 100) {
          window.clearInterval(watcher);
          setReactInputValue(legacySearch, "");
          if (opened) refresh();
        }
      }, 200);
    }, 120);
  }

  function enhance() {
    const nextPanel = document.querySelector(".mapping-panel");
    if (!isMemberGovernanceView(nextPanel)) {
      cleanupGovernanceLayout();
      return;
    }
    if (!nextPanel) return;
    const existing = nextPanel.querySelector(":scope > .member-directory-enhancement");
    if (existing) {
      root = existing;
      panel = nextPanel;
      removeLegacyQualityIssues(panel);
      if (users.length) enhanceMemberOrbit(users);
      return;
    }
    const originalTable = nextPanel.querySelector(":scope > .mapping-table");
    if (!originalTable) return;
    panel = nextPanel;
    root = element("section", "member-directory-enhancement");
    root.setAttribute("aria-label", "成员目录与身份映射");
    originalTable.before(root);
    refresh();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  document.addEventListener("DOMContentLoaded", schedule);
  document.addEventListener("click", (event) => {
    const navigationButton = event.target?.closest?.(".sidebar nav button, .rule-side-tabs button");
    if (!navigationButton || navigationButton.matches(".nav-group > button")) return;
    if (text(navigationButton.textContent).includes("成员映射")) {
      schedule();
      return;
    }
    window.setTimeout(() => {
      cleanupGovernanceLayout();
      schedule();
    }, 0);
  });
  document.addEventListener("scroll", hideOrbitTooltip, true);
  window.addEventListener("resize", hideOrbitTooltip);
  window.addEventListener("hashchange", () => {
    cleanupGovernanceLayout();
    schedule();
  });
  window.addEventListener("popstate", () => {
    cleanupGovernanceLayout();
    schedule();
  });
  window.addEventListener("load", schedule);
  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
  schedule();
})();
