(function () {
  const USER_KEY = "ai_project_hub_user_id";
  const ACTIVITY_PAGE_SIZES = [7, 15, 30];
  const SOURCE_LABELS = {
    gitlab_commit: "代码提交",
    gitlab_mr: "合并请求",
    gitlab_issue: "Issue",
    gitlab_branch: "分支更新",
    gitlab_discovery: "GitLab 发现",
    system: "系统事件",
    rendered: "页面记录",
    manual: "人工进展"
  };
  const RETIRED_ACTIVITY_SOURCES = new Set(["delivery", "code_quality"]);
  const STATUS_LABELS = {
    developing: "开发中",
    online: "已上线",
    archived: "已归档"
  };
  const HEALTH_LABELS = {
    normal: "正常",
    attention: "关注",
    warning: "异常",
    severe: "严重",
    stalled: "停滞"
  };

  let modalRoot = null;
  let enhancementQueued = false;
  let activeProject = null;
  let selectedActivityKey = null;
  let activitySourceFilter = "all";
  let activitySignalFilter = "all";
  let activitySearchQuery = "";
  let activityPage = 1;
  let activityPageSize = ACTIVITY_PAGE_SIZES[0];
  let workspaceTransitionToken = 0;
  let inspectorTransitionToken = 0;

  const EDIT_MODAL_ICONS = [
    {
      match: ["\u7f16\u8f91\u6210\u5458\u6620\u5c04", "\u65b0\u589e\u6210\u5458\u6620\u5c04"],
      src: "/image/\u7f16\u8f91\u6210\u5458\u6620\u5c04.png",
      alt: "\u7f16\u8f91\u6210\u5458\u6620\u5c04"
    },
    {
      match: ["\u7f16\u8f91\u57fa\u672c\u4fe1\u606f"],
      src: "/image/\u7f16\u8f91\u57fa\u672c\u4fe1\u606f.png",
      alt: "\u7f16\u8f91\u57fa\u672c\u4fe1\u606f"
    },
    {
      match: ["\u7f16\u8f91\u73af\u5883\u94fe\u63a5"],
      src: "/image/\u7f16\u8f91\u73af\u5883\u94fe\u63a5.png",
      alt: "\u7f16\u8f91\u73af\u5883\u94fe\u63a5"
    },
    {
      match: ["\u7f16\u8f91\u6b63\u5f0f\u8bbf\u95ee\u5730\u5740"],
      src: "/image/\u7f16\u8f91\u6b63\u5f0f\u8bbf\u95ee\u5730\u5740.png",
      alt: "\u7f16\u8f91\u6b63\u5f0f\u8bbf\u95ee\u5730\u5740"
    },
    {
      match: ["\u7f16\u8f91\u9879\u76ee\u6863\u6848"],
      src: "/image/\u7f16\u8f91\u9879\u76ee\u6863\u6848.png",
      alt: "\u7f16\u8f91\u9879\u76ee\u6863\u6848"
    }
  ];

  const ACTIVITY_DETAIL_ICON = {
    src: "/image/\u6700\u8fd1\u52a8\u6001\u6d41.png",
    alt: "\u6700\u8fd1\u52a8\u6001\u6d41"
  };

  const escapeHtml = value =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();

  const formatDateTime = value => {
    if (!value) return "暂无";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const sourceLabel = activity => SOURCE_LABELS[activity?.source] || activity?.source || "未知来源";

  const activityDisplayTitle = activity => compact(
    activity?.display_title_zh
    || activity?.title_zh
    || activity?.display_title
    || activity?.title
  ) || "未命名动态";

  const activityDisplayDescription = activity => compact(
    activity?.display_description_zh
    || activity?.description_zh
    || activity?.display_description
    || activity?.description
  ) || "暂无描述";

  const activityHasServerTranslation = activity => {
    const title = compact(activity?.title);
    const description = compact(activity?.description);
    const displayTitle = compact(activity?.display_title);
    const displayDescription = compact(activity?.display_description);
    return Boolean(
      compact(activity?.display_title_zh)
      || compact(activity?.title_zh)
      || compact(activity?.display_description_zh)
      || compact(activity?.description_zh)
      || (displayTitle && displayTitle !== title)
      || (displayDescription && displayDescription !== description)
    );
  };

  const valueText = value => {
    if (value == null || value === "") return "暂无";
    if (Array.isArray(value)) return value.map(valueText).join("、");
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  const isHttpUrl = value => {
    const text = compact(value);
    if (!/^https?:\/\//i.test(text)) return false;
    try {
      const url = new URL(text);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const valueHtml = value => {
    if (value == null || value === "") return "暂无";
    if (Array.isArray(value)) {
      return value.map(item => valueHtml(item)).join('<span class="activity-detail-value-separator">、</span>');
    }
    if (typeof value === "object") return escapeHtml(JSON.stringify(value, null, 2));

    const text = String(value);
    if (isHttpUrl(text)) {
      return `<a class="activity-detail-meta-link" href="${escapeHtml(compact(text))}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)} ↗</a>`;
    }
    return escapeHtml(text);
  };

  const branchText = activity => {
    const meta = activity?.metadata || {};
    if (activity?.source === "gitlab_mr" && (meta.source_branch || meta.target_branch)) {
      return `${meta.source_branch || "?"} -> ${meta.target_branch || "?"}`;
    }
    const branches = Array.isArray(meta.branch_names) && meta.branch_names.length
      ? meta.branch_names
      : Array.isArray(meta.branches)
        ? meta.branches
        : [];
    if (branches.length) return branches.join("、");
    return meta.branch || meta.ref || meta.target_branch || "暂无分支信息";
  };

  const getProjectIdFromPage = () => {
    const target = document.querySelector(".project-detail-page .basic-card") || document.querySelector(".project-detail-page");
    const match = (target?.textContent || "").match(/PRJ-(\d+)/);
    return match ? Number(match[1]) : null;
  };

  const requestJson = async url => {
    const headers = { "Content-Type": "application/json" };
    const userId = localStorage.getItem(USER_KEY);
    if (userId) headers["X-User-Id"] = userId;
    const response = await fetch(url, { headers });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "请求失败");
    return body;
  };

  const extractPairs = root =>
    Array.from(root?.querySelectorAll("dl div") || []).map(row => ({
      label: compact(row.querySelector("dt")?.textContent),
      value: compact(row.querySelector("dd")?.textContent)
    })).filter(item => item.label || item.value);

  const extractRenderedActivities = () =>
    Array.from(document.querySelectorAll(".timeline-card .activity")).map((row, index) => {
      const title = row.querySelector(".activity-main b, b");
      const description = row.querySelector("p");
      return {
        id: `dom-${index}`,
        source: "rendered",
        signal_type: row.querySelector("i.hard") ? "hard" : "soft",
        title: compact(title?.getAttribute("title")) || compact(title?.textContent),
        display_title: compact(title?.textContent),
        description: compact(description?.getAttribute("title")) || compact(description?.textContent),
        display_description: compact(description?.textContent),
        actor: compact(row.querySelector("small")?.textContent?.split("·")[0]),
        occurred_at: compact(row.querySelector("small")?.textContent?.split("·").slice(1).join("·")),
        metadata: {
          rendered_order: index + 1,
          visible_chips: Array.from(row.querySelectorAll(".activity-tools span, .activity-tools em")).map(chip => compact(chip.textContent))
        }
      };
    });

  const extractProjectFromDom = () => {
    const pairs = extractPairs(document.querySelector(".project-detail-page .basic-card"));
    const byLabel = label => pairs.find(item => item.label.includes(label))?.value || "";
    return {
      id: getProjectIdFromPage(),
      name: compact(document.querySelector(".detail-title-row h1")?.textContent) || "当前项目",
      owner_name: byLabel("负责人"),
      demand_source: byLabel("需求方"),
      expected_scale: byLabel("规模"),
      description: byLabel("简介"),
      status: compact(document.querySelector(".detail-title-row .badge")?.textContent),
      activities: extractRenderedActivities()
    };
  };

  const loadCurrentProject = async () => {
    const id = getProjectIdFromPage();
    if (!id) return extractProjectFromDom();
    try {
      return await requestJson(`/api/projects/${id}`);
    } catch (error) {
      return { ...extractProjectFromDom(), _activityDetailError: error.message };
    }
  };

  const metadataEntries = activity =>
    Object.entries(activity?.metadata || {})
      .filter(([, value]) => value != null && value !== "" && !(Array.isArray(value) && value.length === 0));

  const keyValue = (label, value) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${valueHtml(value)}</strong>
    </div>
  `;

  const applyIcon = (mark, icon, className) => {
    if (!mark || !icon?.src || mark.dataset.editIconSrc === icon.src || mark.dataset.iconLoading === icon.src || mark.dataset.iconMissing === icon.src) return;
    mark.dataset.iconLoading = icon.src;

    const image = new Image();
    image.alt = icon.alt || "";
    image.loading = "eager";
    image.decoding = "async";
    image.onload = () => {
      delete mark.dataset.iconLoading;
      delete mark.dataset.iconMissing;
      mark.dataset.editIconSrc = icon.src;
      if (className) mark.classList.add(className);
      mark.textContent = "";
      mark.appendChild(image);
    };
    image.onerror = () => {
      delete mark.dataset.iconLoading;
      mark.dataset.iconMissing = icon.src;
    };
    image.src = icon.src;
  };

  const activityKey = (activity, index) => `${activity?.id || "activity"}::${index}`;

  const activityActor = activity => {
    const metadata = activity?.metadata || {};
    return activity?.actor || metadata.author_name || metadata.user_name || metadata.assignee_name || activity?.source || "暂无";
  };

  const activitySignalLabel = activity => activity?.signal_type === "hard" ? "强信号" : "普通信号";

  const visibleActivities = project =>
    (Array.isArray(project?.activities) ? project.activities : [])
      .filter(activity => !RETIRED_ACTIVITY_SOURCES.has(String(activity?.source || "")));

  const activityRows = project =>
    visibleActivities(project).map((activity, index) => ({
      activity,
      index,
      key: activityKey(activity, index)
    }));

  const activitySearchText = activity => [
    activity?.id,
    sourceLabel(activity),
    activityDisplayTitle(activity),
    activity?.title,
    activityDisplayDescription(activity),
    activity?.description,
    branchText(activity),
    activityActor(activity),
    activitySignalLabel(activity),
    valueText(activity?.metadata || {})
  ].map(valueText).join(" ").toLocaleLowerCase();

  const filteredActivityRows = project => {
    const searchTokens = compact(activitySearchQuery).toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return activityRows(project).filter(({ activity }) => {
      if (activitySourceFilter !== "all" && String(activity.source || "") !== activitySourceFilter) return false;
      if (activitySignalFilter !== "all" && String(activity.signal_type || "soft") !== activitySignalFilter) return false;
      if (searchTokens.length) {
        const haystack = activitySearchText(activity);
        if (!searchTokens.every(token => haystack.includes(token))) return false;
      }
      return true;
    });
  };

  const renderMetadataItem = ([key, value]) => {
    const text = valueText(value);
    const wide = isHttpUrl(text);
    return `
      <div class="activity-detail-meta-item${wide ? " is-wide" : ""}">
        <span title="${escapeHtml(key)}">${escapeHtml(key)}</span>
        <strong>${valueHtml(value)}</strong>
      </div>
    `;
  };

  const renderActivityRow = ({ activity, index, key }, selected, visualIndex = index) => `
    <tr class="${selected ? "active" : ""}" data-activity-detail-select="${escapeHtml(key)}" tabindex="0" aria-selected="${selected ? "true" : "false"}" style="--activity-row-delay:${Math.min(visualIndex, 10) * 14}ms">
      <td class="activity-detail-cell-time">
        <strong>${escapeHtml(formatDateTime(activity.occurred_at).slice(5))}</strong>
        <span>#${escapeHtml(activity.id || String(index + 1).padStart(2, "0"))}</span>
      </td>
      <td><span class="activity-detail-source-badge">${escapeHtml(sourceLabel(activity))}</span></td>
      <td class="activity-detail-cell-content">
        <strong title="${escapeHtml(activity.title || "未命名动态")}">${escapeHtml(activityDisplayTitle(activity))}</strong>
        <span title="${escapeHtml(activity.description || "暂无描述")}">${escapeHtml(activityDisplayDescription(activity))}</span>
      </td>
      <td class="activity-detail-cell-branch" title="${escapeHtml(branchText(activity))}">${escapeHtml(branchText(activity))}</td>
      <td title="${escapeHtml(activityActor(activity))}">${escapeHtml(activityActor(activity))}</td>
      <td><span class="activity-detail-signal ${activity.signal_type === "hard" ? "hard" : "soft"}">${escapeHtml(activitySignalLabel(activity))}</span></td>
      <td><button class="activity-detail-row-action" type="button" data-activity-detail-select="${escapeHtml(key)}">查看</button></td>
    </tr>
  `;

  const renderActivityInspector = row => {
    if (!row) {
      return `
        <div class="activity-detail-inspector-empty">
          <strong>没有匹配的动态</strong>
          <p>调整筛选条件后再试。</p>
        </div>
      `;
    }

    const { activity, index } = row;
    const translatedTitle = activityHasServerTranslation(activity)
      ? activityDisplayTitle(activity)
      : translateTitle(activity.title || "");
    const translatedDesc = activityHasServerTranslation(activity)
      ? activityDisplayDescription(activity)
      : translateText(activity.description || activity.title || "");
    const meta = metadataEntries(activity);
    return `
      <article class="activity-detail-inspector-content">
        <div class="activity-detail-inspector-head">
          <div>
            <span class="activity-detail-inspector-kicker">第 ${String(index + 1).padStart(2, "0")} 条 · ${escapeHtml(sourceLabel(activity))}</span>
            <h3 title="${escapeHtml(activity.title || "未命名动态")}">${escapeHtml(activityDisplayTitle(activity))}</h3>
            <p title="${escapeHtml(activity.description || "暂无描述")}">${escapeHtml(activityDisplayDescription(activity))}</p>
          </div>
          <span class="activity-detail-signal ${activity.signal_type === "hard" ? "hard" : "soft"}">${escapeHtml(activitySignalLabel(activity))}</span>
        </div>
        <div class="activity-detail-inspector-meta">
          ${keyValue("发生时间", formatDateTime(activity.occurred_at))}
          ${keyValue("相关分支", branchText(activity))}
          ${keyValue("提交/记录人", activityActor(activity))}
          ${keyValue("活动 ID", activity.id || "暂无")}
        </div>
        <section class="activity-detail-block activity-detail-translation">
          <h4>中文辅助解读</h4>
          <p><b>${escapeHtml(translatedTitle)}</b></p>
          <p>${escapeHtml(translatedDesc)}</p>
        </section>
        <details class="activity-detail-json activity-detail-original">
          <summary>查看原始内容与完整元数据</summary>
          <section class="activity-detail-block">
            <h4>原始内容</h4>
            <p><b>${escapeHtml(activity.title || "暂无标题")}</b></p>
            <p>${escapeHtml(activity.description || "暂无描述")}</p>
          </section>
          ${meta.length ? `
            <section class="activity-detail-meta-section">
              <header><h4>采集元数据</h4><span>${meta.length} 项</span></header>
              <div class="activity-detail-meta-list">
                ${meta.map(renderMetadataItem).join("")}
              </div>
            </section>
          ` : `<p>暂无额外元数据。</p>`}
          <details class="activity-detail-raw-json">
            <summary>查看原始 JSON</summary>
            <pre>${escapeHtml(JSON.stringify(activity.metadata || {}, null, 2))}</pre>
          </details>
        </details>
      </article>
    `;
  };

  const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const filterOptions = {
    signal: [
      { value: "all", label: "全部信号" },
      { value: "hard", label: "强信号" },
      { value: "soft", label: "普通信号" }
    ]
  };

  const renderActivityFilter = (name, caption, options, value, className = "") => {
    const selected = options.find(option => option.value === value) || options[0];
    return `
      <div class="activity-detail-filter ${escapeHtml(className)}" data-activity-detail-filter="${escapeHtml(name)}">
        <button class="activity-detail-filter-toggle" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(caption)}" data-activity-detail-filter-toggle="${escapeHtml(name)}">
          <span>${escapeHtml(caption)}</span>
          <strong data-activity-detail-filter-label="${escapeHtml(name)}">${escapeHtml(selected.label)}</strong>
          <i aria-hidden="true"></i>
        </button>
        <div class="activity-detail-filter-menu" role="listbox" aria-label="${escapeHtml(caption)}">
          ${options.map(option => `
            <button type="button" role="option" aria-selected="${option.value === value ? "true" : "false"}" class="${option.value === value ? "active" : ""}" data-activity-detail-filter-option="${escapeHtml(name)}" data-value="${escapeHtml(option.value)}">
              <span>${escapeHtml(option.label)}</span><i aria-hidden="true"></i>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  };

  const closeActivityFilterMenus = except => {
    modalRoot?.querySelectorAll("[data-activity-detail-filter]").forEach(filter => {
      if (filter === except) return;
      filter.classList.remove("open");
      filter.querySelector("[data-activity-detail-filter-toggle]")?.setAttribute("aria-expanded", "false");
    });
  };

  const syncActivityFilterControl = name => {
    if (!modalRoot) return;
    const value = name === "source"
      ? activitySourceFilter
      : name === "signal"
        ? activitySignalFilter
        : String(activityPageSize);
    const filter = modalRoot.querySelector(`[data-activity-detail-filter="${name}"]`);
    if (!filter) return;
    const options = Array.from(filter.querySelectorAll(`[data-activity-detail-filter-option="${name}"]`));
    const selected = options.find(option => option.dataset.value === value) || options[0];
    filter.querySelector(`[data-activity-detail-filter-label="${name}"]`).textContent = selected?.textContent?.trim() || "全部";
    options.forEach(option => {
      const active = option === selected;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
    });
  };

  const activityPageCount = totalRows => Math.max(1, Math.ceil(totalRows / activityPageSize));

  const activityPageRows = rows => {
    const start = (activityPage - 1) * activityPageSize;
    return rows.slice(start, start + activityPageSize);
  };

  const paginationPages = totalPages => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = Array.from(new Set([1, totalPages, activityPage - 1, activityPage, activityPage + 1]))
      .filter(page => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
    const items = [];
    pages.forEach((page, index) => {
      if (index && page - pages[index - 1] > 1) items.push("ellipsis");
      items.push(page);
    });
    return items;
  };

  const renderActivityPagination = totalRows => {
    const totalPages = activityPageCount(totalRows);
    const start = totalRows ? (activityPage - 1) * activityPageSize + 1 : 0;
    const end = Math.min(activityPage * activityPageSize, totalRows);
    const pageSizeOptions = ACTIVITY_PAGE_SIZES.map(size => ({ value: String(size), label: String(size) }));
    return `
      <div class="activity-detail-pagination-meta">
        <span>${start}-${end} / ${totalRows} 条</span>
        ${renderActivityFilter("pageSize", "每页", pageSizeOptions, String(activityPageSize), "activity-detail-page-size-filter")}
      </div>
      <div class="activity-detail-pagination-pages">
        <button type="button" aria-label="上一页" title="上一页" data-activity-detail-page="${activityPage - 1}"${activityPage <= 1 ? " disabled" : ""}>‹</button>
        ${paginationPages(totalPages).map(item => item === "ellipsis"
          ? `<i aria-hidden="true">…</i>`
          : `<button type="button" data-activity-detail-page="${item}"${item === activityPage ? ` class="active" aria-current="page"` : ""}>${item}</button>`
        ).join("")}
        <button type="button" aria-label="下一页" title="下一页" data-activity-detail-page="${activityPage + 1}"${activityPage >= totalPages ? " disabled" : ""}>›</button>
      </div>
    `;
  };

  const updateActivityWorkspace = (rows, selectedRow, { scrollSelected = false, totalRows = rows.length } = {}) => {
    const tableBody = modalRoot?.querySelector("[data-activity-detail-table-body]");
    const inspector = modalRoot?.querySelector("[data-activity-detail-inspector]");
    const result = modalRoot?.querySelector("[data-activity-detail-result]");
    const clearButton = modalRoot?.querySelector("[data-activity-detail-clear]");
    const pagination = modalRoot?.querySelector("[data-activity-detail-pagination]");

    if (tableBody) {
      tableBody.innerHTML = rows.length
        ? rows.map((row, visualIndex) => renderActivityRow(row, row.key === selectedActivityKey, visualIndex)).join("")
        : `<tr><td class="activity-detail-table-empty" colspan="7">没有找到匹配的动态，请调整筛选条件。</td></tr>`;
    }
    if (inspector) inspector.innerHTML = renderActivityInspector(selectedRow);
    if (result) {
      const start = totalRows ? (activityPage - 1) * activityPageSize + 1 : 0;
      const end = Math.min(activityPage * activityPageSize, totalRows);
      result.textContent = `显示 ${start}-${end} / ${totalRows} 条`;
    }
    if (pagination) pagination.innerHTML = renderActivityPagination(totalRows);
    if (clearButton) {
      clearButton.hidden = activitySourceFilter === "all" && activitySignalFilter === "all" && !activitySearchQuery;
    }

    if (scrollSelected && selectedRow) {
      window.setTimeout(() => {
        Array.from(modalRoot?.querySelectorAll("tr[data-activity-detail-select]") || [])
          .find(row => row.dataset.activityDetailSelect === selectedActivityKey)
          ?.scrollIntoView({ block: "nearest" });
      }, 30);
    }
  };

  const refreshActivityWorkspace = ({ scrollSelected = false, transition = false } = {}) => {
    if (!modalRoot || !activeProject) return;
    const filteredRows = filteredActivityRows(activeProject);
    const totalPages = activityPageCount(filteredRows.length);
    activityPage = Math.min(Math.max(activityPage, 1), totalPages);
    const rows = activityPageRows(filteredRows);
    if (!rows.some(row => row.key === selectedActivityKey)) selectedActivityKey = rows[0]?.key || null;
    const tableBody = modalRoot.querySelector("[data-activity-detail-table-body]");
    const inspector = modalRoot.querySelector("[data-activity-detail-inspector]");
    const selectedRow = rows.find(row => row.key === selectedActivityKey) || null;
    const applyUpdate = () => updateActivityWorkspace(rows, selectedRow, { scrollSelected, totalRows: filteredRows.length });

    workspaceTransitionToken += 1;
    inspectorTransitionToken += 1;
    const token = workspaceTransitionToken;
    [tableBody, inspector].forEach(node => node?.getAnimations?.().forEach(animation => animation.cancel()));
    if (!transition || prefersReducedMotion() || !tableBody || !inspector) {
      applyUpdate();
      return;
    }

    Promise.all([tableBody, inspector].map(node =>
      node.animate(
        [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(6px)" }],
        { duration: 110, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }
      ).finished.catch(() => null)
    )).then(() => {
      if (token !== workspaceTransitionToken || !modalRoot) return;
      applyUpdate();
      [tableBody, inspector].forEach((node, index) => node.animate(
        [
          { opacity: 0, transform: index ? "translateX(12px)" : "translateY(8px)" },
          { opacity: 1, transform: "translate(0, 0)" }
        ],
        { duration: index ? 280 : 240, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
      ));
    });
  };

  const selectActivityRow = key => {
    if (!modalRoot || !activeProject || key === selectedActivityKey) return;
    selectedActivityKey = key;
    const rows = filteredActivityRows(activeProject);
    const selectedRow = rows.find(row => row.key === selectedActivityKey) || null;
    modalRoot.querySelectorAll("tr[data-activity-detail-select]").forEach(row => {
      const active = row.dataset.activityDetailSelect === selectedActivityKey;
      row.classList.toggle("active", active);
      row.setAttribute("aria-selected", String(active));
    });

    const inspector = modalRoot.querySelector("[data-activity-detail-inspector]");
    if (!inspector) return;
    inspectorTransitionToken += 1;
    const token = inspectorTransitionToken;
    inspector.getAnimations?.().forEach(animation => animation.cancel());
    if (prefersReducedMotion()) {
      inspector.innerHTML = renderActivityInspector(selectedRow);
      return;
    }

    inspector.animate(
      [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(10px)" }],
      { duration: 105, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }
    ).finished.catch(() => null).then(() => {
      if (token !== inspectorTransitionToken || !modalRoot) return;
      inspector.innerHTML = renderActivityInspector(selectedRow);
      inspector.animate(
        [{ opacity: 0, transform: "translateX(14px)" }, { opacity: 1, transform: "translateX(0)" }],
        { duration: 290, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
      );
    });
  };

  const translateTitle = title => {
    const trimmed = compact(title);
    const match = trimmed.match(/^([a-z]+)(?:\([^)]+\))?:\s*(.*)$/i);
    if (!match) return trimmed || "暂无标题";
    const typeMap = {
      feat: "功能",
      fix: "修复",
      docs: "文档",
      refactor: "重构",
      test: "测试",
      chore: "维护",
      style: "样式",
      perf: "性能优化",
      ci: "CI/CD",
      build: "构建"
    };
    return `${typeMap[match[1].toLowerCase()] || match[1]}：${match[2] || trimmed}`;
  };

  const translateText = text => {
    const trimmed = compact(text);
    if (!trimmed) return "暂无可解读内容。";
    if (!/[A-Za-z]{3,}/.test(trimmed)) return trimmed;
    return `该条动态来自 GitLab 或系统采集信号，建议结合分支、提交人、发生时间和原始描述判断它是否代表真实进展、需求变更、异常修复或仅是维护性提交。原文：${trimmed}`;
  };

  const renderModal = ({ project, focusIndex = null, loading = false }) => {
    const activities = visibleActivities(project);
    const safeFocusIndex = Number.isInteger(focusIndex) && focusIndex >= 0 && focusIndex < activities.length ? focusIndex : null;
    const focused = safeFocusIndex == null ? null : activities[safeFocusIndex];
    if (!loading) {
      activeProject = project;
      selectedActivityKey = focused
        ? activityKey(focused, safeFocusIndex)
        : selectedActivityKey || (activities[0] ? activityKey(activities[0], 0) : null);
    }
    const gitlabCount = activities.filter(item => String(item.source || "").startsWith("gitlab_")).length;
    const manualCount = activities.filter(item => item.source === "manual").length;
    const branches = Array.from(new Set(activities.map(branchText).filter(value => value && value !== "暂无分支信息"))).slice(0, 8);
    const newest = activities[0]?.occurred_at;
    const oldest = activities[activities.length - 1]?.occurred_at;
    const projectPairs = [
      ["项目编号", project?.id ? `PRJ-${String(project.id).padStart(4, "0")}` : "暂无"],
      ["负责人", project?.owner_name || "暂无"],
      ["需求方", project?.demand_source || "暂无"],
      ["项目状态", STATUS_LABELS[project?.status] || project?.status || "暂无"],
      ["健康状态", HEALTH_LABELS[project?.health] || project?.health || "暂无"],
      ["GitLab 项目", project?.gitlab_project_id || project?.gitlab_repo_url || "暂无"],
      ["默认分支", project?.gitlab_default_branch || "暂无"],
      ["最近扫描", formatDateTime(project?.last_scan_at)]
    ];
    const sources = Array.from(new Set(activities.map(activity => String(activity.source || "")).filter(Boolean)));
    const sourceOptions = [
      { value: "all", label: "全部来源" },
      ...sources.map(source => ({ value: source, label: SOURCE_LABELS[source] || source }))
    ];
    const initialRows = loading ? [] : filteredActivityRows(project);
    if (focused && initialRows.length) {
      const focusedPosition = initialRows.findIndex(row => row.key === selectedActivityKey);
      if (focusedPosition >= 0) activityPage = Math.floor(focusedPosition / activityPageSize) + 1;
    }
    activityPage = Math.min(Math.max(activityPage, 1), activityPageCount(initialRows.length));
    const initialPageRows = activityPageRows(initialRows);
    if (!initialPageRows.some(row => row.key === selectedActivityKey)) selectedActivityKey = initialPageRows[0]?.key || null;
    const initialSelected = initialPageRows.find(row => row.key === selectedActivityKey) || null;
    const initialStart = initialRows.length ? (activityPage - 1) * activityPageSize + 1 : 0;
    const initialEnd = Math.min(activityPage * activityPageSize, initialRows.length);

    modalRoot.innerHTML = `
      <div class="overlay nested-overlay activity-detail-overlay" data-activity-detail-close>
        <div class="modal activity-detail-modal" role="dialog" aria-modal="true" aria-label="最近动态流详情">
          <button class="close" type="button" data-activity-detail-close>×</button>
          <div class="activity-detail-title">
            <span class="brand-mark">详</span>
            <div>
              <h2>${escapeHtml(project?.name || "最近动态流详情")}</h2>
              <p>${focused ? "已定位到当前动态，可筛选并查看完整项目活动上下文。" : "浏览完整动态，点击表格行查看中文解读、原文和采集元数据。"}</p>
            </div>
          </div>
          <div class="activity-detail-scroll">
            ${loading ? `<div class="activity-detail-loading">正在读取完整动态数据...</div>` : `
              ${project?._activityDetailError ? `<p class="activity-detail-error">完整接口读取失败，以下为页面可见内容：${escapeHtml(project._activityDetailError)}</p>` : ""}
              <section class="activity-detail-summary">
                <article><span>动态总数</span><strong>${activities.length}</strong><small>完整 activities 列表</small></article>
                <article><span>GitLab 信号</span><strong>${gitlabCount}</strong><small>Commit / MR / Issue / Branch</small></article>
                <article><span>人工记录</span><strong>${manualCount}</strong><small>页面手动录入进展</small></article>
                <article><span>时间范围</span><strong>${escapeHtml(formatDateTime(newest).slice(5))}</strong><small>${escapeHtml(formatDateTime(oldest))} 起</small></article>
              </section>
              <details class="activity-detail-context">
                <summary>
                  <span><b>项目上下文</b> · ${escapeHtml(project?.owner_name || "暂无负责人")} · ${escapeHtml(project?.gitlab_default_branch || "暂无默认分支")}</span>
                  <small>${branches.length} 个活跃分支</small>
                </summary>
                <div class="activity-detail-context-body">
                  <div class="activity-detail-meta-grid">${projectPairs.map(([label, value]) => keyValue(label, value)).join("")}</div>
                  <p class="activity-detail-description">${escapeHtml(project?.description || "暂无项目简介。")}</p>
                  <div class="activity-detail-chips">
                    ${branches.length ? branches.map(branch => `<span>${escapeHtml(branch)}</span>`).join("") : `<span>暂无分支信息</span>`}
                  </div>
                </div>
              </details>
              <section class="activity-detail-dataset" aria-label="详细动态数据表">
                <div class="activity-detail-toolbar">
                  <div class="activity-detail-filter-bar">
                    <span class="activity-detail-filter-bar-label">筛选</span>
                    ${renderActivityFilter("source", "来源", sourceOptions, activitySourceFilter)}
                    ${renderActivityFilter("signal", "信号", filterOptions.signal, activitySignalFilter)}
                    <button class="activity-detail-clear" type="button" data-activity-detail-clear${activitySourceFilter === "all" && activitySignalFilter === "all" && !activitySearchQuery ? " hidden" : ""}>清除</button>
                  </div>
                  <label class="activity-detail-search">
                    <span aria-hidden="true"></span>
                    <input type="search" value="${escapeHtml(activitySearchQuery)}" placeholder="搜索标题、分支、记录人或元数据" aria-label="模糊搜索动态" data-activity-detail-search />
                  </label>
                  <span class="activity-detail-result" data-activity-detail-result>显示 ${initialStart}-${initialEnd} / ${initialRows.length} 条</span>
                </div>
                <div class="activity-detail-data-layout">
                  <div class="activity-detail-table-panel">
                    <div class="activity-detail-table-wrap">
                      <table class="activity-detail-table">
                        <thead>
                          <tr><th>时间 / ID</th><th>类型</th><th>动态内容</th><th>分支</th><th>记录人</th><th>信号</th><th></th></tr>
                        </thead>
                        <tbody data-activity-detail-table-body>
                          ${initialPageRows.length ? initialPageRows.map((row, visualIndex) => renderActivityRow(row, row.key === selectedActivityKey, visualIndex)).join("") : `<tr><td class="activity-detail-table-empty" colspan="7">暂无动态记录。</td></tr>`}
                        </tbody>
                      </table>
                    </div>
                    <nav class="activity-detail-pagination" aria-label="详细动态分页" data-activity-detail-pagination>
                      ${renderActivityPagination(initialRows.length)}
                    </nav>
                  </div>
                  <aside class="activity-detail-inspector" data-activity-detail-inspector aria-label="选中动态详情">
                    ${renderActivityInspector(initialSelected)}
                  </aside>
                </div>
              </section>
            `}
          </div>
        </div>
      </div>
    `;

    applyIcon(modalRoot.querySelector(".activity-detail-title .brand-mark"), ACTIVITY_DETAIL_ICON, "activity-detail-mark");

    if (focused) refreshActivityWorkspace({ scrollSelected: true });
  };

  const openActivityDetail = async focusIndex => {
    closeActivityDetail();
    activeProject = null;
    selectedActivityKey = null;
    activitySourceFilter = "all";
    activitySignalFilter = "all";
    activitySearchQuery = "";
    activityPage = 1;
    modalRoot = document.createElement("div");
    modalRoot.className = "activity-detail-root";
    document.body.appendChild(modalRoot);
    renderModal({ project: extractProjectFromDom(), focusIndex, loading: true });
    const project = await loadCurrentProject();
    renderModal({ project, focusIndex });
  };

  const closeActivityDetail = () => {
    modalRoot?.remove();
    modalRoot = null;
    activeProject = null;
    selectedActivityKey = null;
    workspaceTransitionToken += 1;
    inspectorTransitionToken += 1;
  };

  const enhanceTimeline = () => {
    const timeline = document.querySelector(".project-detail-page .timeline-card");
    if (!timeline) return;

    const actions = timeline.querySelector(".detail-card-title .card-title-actions");
    if (actions && !actions.querySelector("[data-activity-detail-trigger='all']")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "link-button activity-detail-trigger";
      button.dataset.activityDetailTrigger = "all";
      button.textContent = "详情";
      actions.appendChild(button);
    }

    Array.from(timeline.querySelectorAll(".activity")).forEach((activity, index) => {
      const actionWrap = activity.querySelector(".activity-actions");
      if (!actionWrap || actionWrap.querySelector("[data-activity-detail-trigger='item']")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "activity-detail-trigger activity-detail-inline";
      button.dataset.activityDetailTrigger = "item";
      button.dataset.activityIndex = String(index);
      button.textContent = "详情";
      actionWrap.appendChild(button);
    });
  };

  const enhanceModalIcons = () => {
    document.querySelectorAll(".modal .modal-title").forEach(title => {
      const heading = compact(title.querySelector("h2")?.textContent);
      const icon = EDIT_MODAL_ICONS.find(item => item.match.some(label => heading.includes(label)));
      if (!icon) return;

      const mark = title.querySelector(".brand-mark");
      applyIcon(mark, icon, "edit-form-mark");
    });
  };

  const scheduleEnhance = () => {
    if (enhancementQueued) return;
    enhancementQueued = true;
    window.requestAnimationFrame(() => {
      enhancementQueued = false;
      enhanceTimeline();
      enhanceModalIcons();
    });
  };

  document.addEventListener("click", event => {
    const closeTarget = event.target.closest("[data-activity-detail-close]");
    const shouldClose = closeTarget && modalRoot && (closeTarget === event.target || closeTarget.tagName === "BUTTON");
    if (shouldClose) {
      event.preventDefault();
      closeActivityDetail();
      return;
    }

    const pageTarget = event.target.closest("[data-activity-detail-page]");
    if (pageTarget && modalRoot && !pageTarget.disabled) {
      event.preventDefault();
      activityPage = Number(pageTarget.dataset.activityDetailPage) || 1;
      refreshActivityWorkspace({ transition: true });
      return;
    }

    const clearTarget = event.target.closest("[data-activity-detail-clear]");
    if (clearTarget && modalRoot) {
      activitySourceFilter = "all";
      activitySignalFilter = "all";
      activitySearchQuery = "";
      activityPage = 1;
      const searchInput = modalRoot.querySelector("[data-activity-detail-search]");
      if (searchInput) searchInput.value = "";
      syncActivityFilterControl("source");
      syncActivityFilterControl("signal");
      closeActivityFilterMenus();
      refreshActivityWorkspace({ transition: true });
      return;
    }

    const filterOption = event.target.closest("[data-activity-detail-filter-option]");
    if (filterOption && modalRoot) {
      event.preventDefault();
      const name = filterOption.dataset.activityDetailFilterOption;
      if (name === "source") activitySourceFilter = filterOption.dataset.value;
      if (name === "signal") activitySignalFilter = filterOption.dataset.value;
      if (name === "pageSize") {
        const firstVisibleIndex = (activityPage - 1) * activityPageSize;
        activityPageSize = ACTIVITY_PAGE_SIZES.includes(Number(filterOption.dataset.value))
          ? Number(filterOption.dataset.value)
          : ACTIVITY_PAGE_SIZES[0];
        activityPage = Math.floor(firstVisibleIndex / activityPageSize) + 1;
      } else {
        activityPage = 1;
      }
      const filterToggle = filterOption.closest("[data-activity-detail-filter]")?.querySelector("[data-activity-detail-filter-toggle]");
      syncActivityFilterControl(name);
      closeActivityFilterMenus();
      refreshActivityWorkspace({ transition: true });
      filterToggle?.focus();
      return;
    }

    const filterToggle = event.target.closest("[data-activity-detail-filter-toggle]");
    if (filterToggle && modalRoot) {
      event.preventDefault();
      const filter = filterToggle.closest("[data-activity-detail-filter]");
      const willOpen = !filter.classList.contains("open");
      closeActivityFilterMenus(filter);
      filter.classList.toggle("open", willOpen);
      filterToggle.setAttribute("aria-expanded", String(willOpen));
      return;
    }

    closeActivityFilterMenus();

    const selectionTarget = event.target.closest("[data-activity-detail-select]");
    if (selectionTarget && modalRoot) {
      event.preventDefault();
      selectActivityRow(selectionTarget.dataset.activityDetailSelect);
      return;
    }

    const trigger = event.target.closest("[data-activity-detail-trigger]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const index = trigger.dataset.activityDetailTrigger === "item" ? Number(trigger.dataset.activityIndex) : null;
    openActivityDetail(Number.isInteger(index) ? index : null);
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modalRoot) {
      const openFilter = modalRoot.querySelector("[data-activity-detail-filter].open");
      if (openFilter) {
        const filterToggle = openFilter.querySelector("[data-activity-detail-filter-toggle]");
        closeActivityFilterMenus();
        filterToggle?.focus();
        return;
      }
      closeActivityDetail();
    }
    const row = event.target.closest("tr[data-activity-detail-select]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectActivityRow(row.dataset.activityDetailSelect);
    }
  });

  document.addEventListener("input", event => {
    const searchInput = event.target.closest?.("[data-activity-detail-search]");
    if (!searchInput || !modalRoot) return;
    activitySearchQuery = searchInput.value;
    activityPage = 1;
    refreshActivityWorkspace();
  });

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
