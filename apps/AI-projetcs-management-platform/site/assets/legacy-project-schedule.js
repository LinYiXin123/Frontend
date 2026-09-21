(function () {
  const USER_STORAGE_KEY = "ai_project_hub_user_id";
  const CARD_CLASS = "legacy-project-schedule";
  let activeProjectId = null;
  let renderToken = 0;
  let usersCache = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function requestHeaders() {
    const headers = { "Content-Type": "application/json" };
    const userId = window.localStorage.getItem(USER_STORAGE_KEY);
    if (userId) headers["X-User-Id"] = userId;
    return headers;
  }

  async function api(path, options) {
    const response = await window.fetch(path, {
      ...options,
      headers: { ...requestHeaders(), ...(options && options.headers) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body && body.detail;
      const error = new Error(
        typeof detail === "string"
          ? detail
          : (detail && detail.message) || "请求失败，请稍后重试",
      );
      error.status = response.status;
      error.code = detail && typeof detail === "object" ? detail.code : "";
      error.expectedVersion = detail && typeof detail === "object" ? detail.expected_version : null;
      error.currentVersion = detail && typeof detail === "object" ? detail.current_version : null;
      error.currentSchedule = detail && typeof detail === "object" ? detail.schedule : null;
      throw error;
    }
    return body;
  }

  function projectIdFromPage(page) {
    const rows = page.querySelectorAll(".basic-card .detail-dl > div");
    for (const row of rows) {
      const label = row.querySelector("dt");
      if (!label || !label.textContent.includes("项目编号")) continue;
      const match = (row.querySelector("dd")?.textContent || "").match(/PRJ-(\d+)/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function formatDate(value) {
    if (!value) return "待补充";
    const parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : value;
  }

  function statusMeta(schedule) {
    if (!schedule) return { label: "待补充排期", tone: "gray" };
    if (schedule.status === "draft") return { label: "草稿", tone: "gray" };
    if (schedule.status === "suspended") return { label: "监控已暂停", tone: "yellow" };
    if (schedule.status === "completed") return { label: "已完成", tone: "green" };
    if (schedule.health === "overdue") return { label: `已逾期 ${schedule.overdue_days} 天`, tone: "red" };
    if (schedule.health === "attention") return { label: "进度需关注", tone: "yellow" };
    return { label: "按计划推进", tone: "green" };
  }

  function milestoneStatusLabel(status) {
    return {
      pending: "未开始",
      in_progress: "进行中",
      completed: "已完成",
      cancelled: "已取消",
    }[status] || status;
  }

  function showToast(message, isError) {
    let toast = document.querySelector(".legacy-schedule-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "legacy-schedule-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.classList.add("show");
    window.clearTimeout(toast._hideTimer);
    toast._hideTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function milestoneRows(schedule, canContribute) {
    if (!schedule.milestones.length) {
      return '<div class="schedule-empty-inline">成员尚未提交里程碑。计划周期启用后，项目成员可在用户端填写并更新进度。</div>';
    }
    return schedule.milestones.map((milestone, index) => {
      const statusClass = milestone.status === "completed" ? "done" : milestone.is_overdue ? "overdue" : "";
      const controls = canContribute && milestone.can_edit && !["completed", "cancelled"].includes(milestone.status)
        ? `<div class="milestone-progress-editor" data-milestone-id="${milestone.id}">
             <input type="range" min="0" max="100" step="5" value="${milestone.progress_pct}" aria-label="${escapeHtml(milestone.name)}进度" />
             <output>${milestone.progress_pct}%</output>
             <button type="button" class="schedule-inline-save">更新</button>
           </div>`
        : `<div class="milestone-progress-static"><span style="--milestone-progress:${milestone.progress_pct}%"></span><b>${milestone.progress_pct}%</b></div>`;
      return `<div class="schedule-milestone-row ${statusClass}" data-milestone-id="${milestone.id}">
        <div class="milestone-sequence"><span>${milestone.status === "completed" ? "✓" : index + 1}</span></div>
        <div class="milestone-date">${formatDate(milestone.planned_date)}</div>
        <div class="milestone-main">
          <div class="milestone-name-line">
            <strong>${escapeHtml(milestone.name)}</strong>
            <span class="milestone-status">${milestoneStatusLabel(milestone.status)}</span>
            ${milestone.is_overdue ? `<span class="milestone-overdue">逾期 ${milestone.overdue_days} 天</span>` : ""}
          </div>
          <p>${escapeHtml(milestone.acceptance_criteria || "暂未填写验收标准")}</p>
        </div>
        <div class="milestone-owner"><span>负责人</span><b>${escapeHtml((milestone.owner_names || []).join("、") || milestone.owner_name || "待指定")}</b></div>
        ${controls}
      </div>`;
    }).join("");
  }

  function cardMarkup(data) {
    const schedule = data.schedule;
    const meta = statusMeta(schedule);
    const readOnlyNote = data.project_status !== "developing"
      ? `<div class="schedule-readonly-note"><i aria-hidden="true"></i><span>${data.project_status === "online" ? "项目已上线，开发基线只读；维护计划请在后续独立版本中创建。" : "项目已归档，排期和进度只读；恢复为开发中后才能继续调整。"}</span></div>`
      : "";
    if (!schedule) {
      return `<article class="detail-card schedule-card ${CARD_CLASS}">
        <div class="schedule-card-head">
          <div><div class="schedule-title-line"><h2>计划与里程碑</h2><span class="schedule-state ${meta.tone}">${meta.label}</span></div>
          <p>管理员先设置计划周期；项目成员在周期内提交里程碑并更新进度。</p></div>
          ${data.can_manage ? '<button type="button" class="schedule-primary schedule-open-editor">新建计划</button>' : ""}
        </div>
        ${readOnlyNote}
        <div class="schedule-empty">
          <div class="schedule-empty-mark">＋</div>
          <strong>这个项目还没有排期</strong>
          <span>由管理员设置并启用计划周期；成员将在用户端补充具体里程碑。</span>
        </div>
      </article>`;
    }
    const gap = schedule.progress_gap_pct;
    const gapText = gap === 0 ? "与时间进度一致" : gap > 0 ? `领先 ${gap} 个百分点` : `落后 ${Math.abs(gap)} 个百分点`;
    const actions = [
      '<button type="button" class="schedule-secondary schedule-open-history">版本记录</button>',
      data.can_manage ? '<button type="button" class="schedule-secondary schedule-open-editor">编辑计划</button>' : "",
      data.can_manage && schedule.status === "draft" ? '<button type="button" class="schedule-primary schedule-activate">启用基线</button>' : "",
      data.can_manage && data.project_status === "developing" && schedule.status === "suspended" ? '<button type="button" class="schedule-primary schedule-resume">恢复监控</button>' : "",
    ].filter(Boolean).join("");
    return `<article class="detail-card schedule-card ${CARD_CLASS}">
      <div class="schedule-card-head">
        <div><div class="schedule-title-line"><h2>计划与里程碑</h2><span class="schedule-state ${meta.tone}">${meta.label}</span><span class="schedule-version">V${schedule.version}</span></div>
        <p>管理员维护计划周期；实际进度由成员提交并更新的里程碑汇总。</p></div>
        <div class="schedule-actions">${actions}</div>
      </div>
      ${readOnlyNote}
      <div class="schedule-kpis">
        <div><span>计划周期</span><strong>${formatDate(schedule.current_start_date)} — ${formatDate(schedule.current_end_date)}</strong></div>
        <div><span>${schedule.overdue_days ? "已逾期" : "剩余时间"}</span><strong>${schedule.overdue_days || schedule.remaining_days}<small> 天</small></strong></div>
        <div><span>时间进度</span><strong>${schedule.time_progress_pct}<small>%</small></strong></div>
        <div><span>实际进度</span><strong>${schedule.actual_progress_pct}<small>%</small></strong><em class="${gap < 0 ? "behind" : ""}">${gapText}</em></div>
      </div>
      <div class="schedule-progress-comparison">
        <div><span>时间进度</span><i><b style="width:${schedule.time_progress_pct}%"></b></i><strong>${schedule.time_progress_pct}%</strong></div>
        <div><span>实际进度</span><i class="actual"><b style="width:${schedule.actual_progress_pct}%"></b></i><strong>${schedule.actual_progress_pct}%</strong></div>
      </div>
      <div class="schedule-section-head"><div><h3>里程碑</h3><span>已完成 ${schedule.completed_milestone_count} / ${schedule.milestone_count}</span></div></div>
      <div class="schedule-milestone-list">${milestoneRows(schedule, data.can_contribute)}</div>
    </article>`;
  }

  function placeCard(page, element) {
    const layout = page.querySelector(".detail-layout");
    if (!layout) return false;
    const teamPanel = layout.querySelector("#legacy-gitlab-team-panel");
    if (teamPanel) {
      teamPanel.insertAdjacentElement("beforebegin", element);
      return true;
    }

    const basicCard = layout.querySelector(".basic-card");
    if (basicCard) {
      basicCard.insertAdjacentElement("afterend", element);
    } else {
      layout.prepend(element);
    }
    return true;
  }

  async function loadUsers() {
    if (!usersCache) usersCache = await api("/api/users");
    return usersCache;
  }

  function closeOverlay() {
    document.querySelector(".legacy-schedule-overlay")?.remove();
    document.documentElement.classList.remove("schedule-dialog-open");
  }

  function confirmAction(title, description, confirmLabel) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "legacy-schedule-overlay schedule-confirm-overlay";
      overlay.innerHTML = `<button class="schedule-overlay-backdrop" type="button" aria-label="取消"></button>
        <section class="schedule-confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="schedule-confirm-title">
          <span>计划基线</span><h2 id="schedule-confirm-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>
          <div><button type="button" class="schedule-secondary schedule-confirm-cancel">取消</button><button type="button" class="schedule-primary schedule-confirm-submit">${escapeHtml(confirmLabel)}</button></div>
        </section>`;
      const finish = (confirmed) => {
        overlay.remove();
        document.documentElement.classList.remove("schedule-dialog-open");
        resolve(confirmed);
      };
      document.body.appendChild(overlay);
      document.documentElement.classList.add("schedule-dialog-open");
      overlay.querySelectorAll(".schedule-overlay-backdrop,.schedule-confirm-cancel").forEach((button) => button.addEventListener("click", () => finish(false)));
      overlay.querySelector(".schedule-confirm-submit").addEventListener("click", () => finish(true));
    });
  }

  function activationOwnerGroups(schedule) {
    const groups = new Map();
    const unassigned = [];
    (schedule.milestones || []).forEach((milestone) => {
      const ownerIds = (milestone.owner_user_ids || (milestone.owner_user_id ? [milestone.owner_user_id] : [])).map(Number);
      const ownersById = new Map((milestone.owners || []).map((owner) => [Number(owner.id), owner]));
      if (!ownerIds.length) {
        unassigned.push(milestone);
        return;
      }
      ownerIds.forEach((key, ownerIndex) => {
        const owner = ownersById.get(key) || {};
        if (!groups.has(key)) {
          groups.set(key, {
            id: key,
            name: owner.name || milestone.owner_names?.[ownerIndex] || milestone.owner_name || "待确认负责人",
            avatarUrl: owner.feishu_avatar_url || (ownerIndex === 0 ? milestone.owner_avatar_url : "") || "",
            feishuReady: owner.feishu_ready ?? (ownerIndex === 0 && Boolean(milestone.owner_feishu_ready)),
            lifecycleStatus: owner.lifecycle_status || (ownerIndex === 0 ? milestone.owner_lifecycle_status : "active") || "active",
            milestones: [],
          });
        }
        groups.get(key).milestones.push(milestone);
      });
    });
    return { owners: Array.from(groups.values()), unassigned };
  }

  function activationOwnerMarkup(owner) {
    const avatar = ownerAvatarMarkup({
      name: owner.name,
      feishu_avatar_url: owner.avatarUrl,
    });
    const readiness = owner.lifecycleStatus !== "active"
      ? '<span class="schedule-recipient-status unavailable">账号不可用</span>'
      : owner.feishuReady
        ? '<span class="schedule-recipient-status ready">飞书可送达</span>'
        : '<span class="schedule-recipient-status unavailable">未映射飞书</span>';
    const milestoneNames = owner.milestones.map((item) => item.name || "未命名里程碑").join("、");
    return `<li>
      ${avatar}
      <div><strong>${escapeHtml(owner.name)}</strong><p>${escapeHtml(milestoneNames)}</p></div>
      <b>${owner.milestones.length}<small> 个</small></b>
      ${readiness}
    </li>`;
  }

  function confirmScheduleActivation(data) {
    return new Promise((resolve) => {
      const schedule = data.schedule;
      const { owners, unassigned } = activationOwnerGroups(schedule);
      const readyCount = owners.filter((owner) => owner.feishuReady && owner.lifecycleStatus === "active").length;
      const unavailableCount = owners.length - readyCount;
      const canNotify = owners.length > 0;
      const deliveryMode = data.notification_delivery_mode === "live" ? "真实发送" : "安全演练";
      const overlay = document.createElement("div");
      overlay.className = "legacy-schedule-overlay schedule-confirm-overlay schedule-activation-overlay";
      overlay.innerHTML = `<button class="schedule-overlay-backdrop" type="button" aria-label="取消启用基线"></button>
        <section class="schedule-confirm-panel schedule-activation-panel" role="alertdialog" aria-modal="true" aria-labelledby="schedule-activation-title">
          <header>
            <div><span>计划基线</span><h2 id="schedule-activation-title">启用计划基线</h2></div>
            <button type="button" class="schedule-activation-close" aria-label="关闭">×</button>
          </header>
          <p class="schedule-activation-lead">计划周期启用后，项目成员可在用户端提交里程碑；管理员可在此查看汇总、进展和预警。</p>
          <div class="schedule-activation-summary">
            <div><span>项目</span><strong>${escapeHtml(data.project_name || "当前项目")}</strong></div>
            <div><span>基线版本</span><strong>V${schedule.version}</strong></div>
            <div><span>计划周期</span><strong>${formatDate(schedule.current_start_date)} — ${formatDate(schedule.current_end_date)}</strong></div>
            <div><span>里程碑</span><strong>${schedule.milestone_count} 个</strong></div>
          </div>
          <section class="schedule-activation-recipients">
            <div class="schedule-activation-section-head"><div><strong>已提交里程碑负责人</strong><span>${owners.length} 人 · ${deliveryMode}</span></div><p><b>${readyCount}</b> 人可送达${unavailableCount ? ` · ${unavailableCount} 人待完善映射` : ""}</p></div>
            <ul>${owners.length ? owners.map(activationOwnerMarkup).join("") : '<li class="schedule-recipient-empty">当前还没有成员提交里程碑；启用周期后可由成员在用户端填写。</li>'}</ul>
            ${unassigned.length ? `<div class="schedule-activation-warning">${unassigned.length} 个里程碑未指定负责人：${escapeHtml(unassigned.map((item) => item.name || "未命名里程碑").join("、"))}</div>` : ""}
          </section>
          <div class="schedule-activation-note"><span aria-hidden="true">i</span><p>启用与通知记录会在同一事务中保存；飞书投递失败不会回滚基线，可在“通知记录”查看状态和重试结果。</p></div>
          <footer>
            <button type="button" class="schedule-secondary schedule-activation-cancel">取消</button>
            <button type="button" class="schedule-secondary schedule-activation-only">仅启用基线</button>
            <button type="button" class="schedule-primary schedule-activation-notify" ${canNotify ? "" : "disabled"}>启用并通知负责人</button>
          </footer>
        </section>`;
      const finish = (result) => {
        overlay.remove();
        document.documentElement.classList.remove("schedule-dialog-open");
        resolve(result);
      };
      document.body.appendChild(overlay);
      document.documentElement.classList.add("schedule-dialog-open");
      overlay.querySelectorAll(".schedule-overlay-backdrop,.schedule-activation-close,.schedule-activation-cancel").forEach((button) => button.addEventListener("click", () => finish(null)));
      overlay.querySelector(".schedule-activation-only").addEventListener("click", () => finish({ notifyOwners: false }));
      overlay.querySelector(".schedule-activation-notify").addEventListener("click", () => finish({ notifyOwners: true }));
    });
  }

  function memberInitial(name) {
    return String(name || "?").trim().slice(0, 1).toUpperCase();
  }

  function ownerAvatarMarkup(user) {
    if (!user) {
      return '<span class="owner-picker-avatar is-empty" data-initial="—">—</span>';
    }
    const name = user.name || "项目成员";
    const initial = memberInitial(name);
    const avatarUrl = user.feishu_avatar_url || "";
    return `<span class="owner-picker-avatar" data-initial="${escapeHtml(initial)}">${
      avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" loading="lazy" />`
        : escapeHtml(initial)
    }</span>`;
  }

  function ownerPickerMarkup(milestone, users) {
    const selectedIds = new Set(
      (milestone.owner_user_ids || (milestone.owner_user_id ? [milestone.owner_user_id] : [])).map(Number),
    );
    const selectedUsers = users.filter((user) => selectedIds.has(Number(user.id)));
    const selectedName = selectedUsers.length
      ? selectedUsers.length <= 2
        ? selectedUsers.map((user) => user.name).join("、")
        : `${selectedUsers.length} 位负责人`
      : "待指定";
    const options = [
      `<button type="button" class="owner-picker-option owner-picker-clear" data-action="clear" data-search="清空 待指定">
         ${ownerAvatarMarkup(null)}<span><b>清空负责人</b><small>稍后再分配负责人</small></span><i>×</i>
       </button>`,
      ...users.map((user) => `<button type="button" class="owner-picker-option ${selectedIds.has(Number(user.id)) ? "selected" : ""}" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name || "")}" data-avatar-url="${escapeHtml(user.feishu_avatar_url || "")}" data-initial="${escapeHtml(memberInitial(user.name))}" data-search="${escapeHtml(`${user.name || ""} ${user.department || ""} ${user.organization || ""} ${user.gitlab_username || ""}`)}" aria-selected="${selectedIds.has(Number(user.id))}">
        ${ownerAvatarMarkup(user)}<span><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.department || user.organization || "项目成员")}</small></span><i>✓</i>
      </button>`),
    ].join("");
    return `<div class="editor-owner-picker" data-values="${Array.from(selectedIds).join(",")}">
      <button type="button" class="owner-picker-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="owner-picker-avatar-stack">${selectedUsers.slice(0, 3).map(ownerAvatarMarkup).join("") || ownerAvatarMarkup(null)}</span>
        <span class="owner-picker-current"><b>${escapeHtml(selectedName)}</b><small>${selectedUsers.length ? `已选择 ${selectedUsers.length} 人` : "可选择多位项目成员"}</small></span>
        <i class="owner-picker-chevron" aria-hidden="true"></i>
      </button>
      <div class="owner-picker-menu" role="listbox" aria-multiselectable="true" hidden>
        <div class="owner-picker-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索成员" aria-label="搜索负责人" /></div>
        <div class="owner-picker-options">${options}</div>
        <div class="owner-picker-empty" hidden>没有匹配的成员</div>
        <div class="owner-picker-footer"><span>已选 <b>${selectedUsers.length}</b> 人</span><button type="button" class="owner-picker-done">完成</button></div>
      </div>
    </div>`;
  }

  function refreshOwnerPicker(picker) {
    const selectedOptions = Array.from(picker.querySelectorAll(".owner-picker-option.selected[data-user-id]"));
    picker.dataset.values = selectedOptions.map((option) => option.dataset.userId).join(",");
    picker.querySelectorAll(".owner-picker-option[data-user-id]").forEach((option) => {
      option.setAttribute("aria-selected", String(option.classList.contains("selected")));
    });
    const names = selectedOptions.map((option) => option.dataset.userName || option.querySelector("b")?.textContent || "");
    const title = picker.querySelector(".owner-picker-current b");
    const detail = picker.querySelector(".owner-picker-current small");
    title.textContent = names.length ? (names.length <= 2 ? names.join("、") : `${names.length} 位负责人`) : "待指定";
    detail.textContent = names.length ? `已选择 ${names.length} 人` : "可选择多位项目成员";
    const stack = picker.querySelector(".owner-picker-avatar-stack");
    stack.replaceChildren();
    if (!selectedOptions.length) {
      const empty = document.createElement("span");
      empty.className = "owner-picker-avatar is-empty";
      empty.dataset.initial = "—";
      empty.textContent = "—";
      stack.appendChild(empty);
    } else {
      selectedOptions.slice(0, 3).forEach((option) => {
        stack.appendChild(option.querySelector(".owner-picker-avatar").cloneNode(true));
      });
      if (selectedOptions.length > 3) {
        const more = document.createElement("span");
        more.className = "owner-picker-avatar owner-picker-more";
        more.textContent = `+${selectedOptions.length - 3}`;
        stack.appendChild(more);
      }
    }
    picker.querySelector(".owner-picker-footer b").textContent = String(selectedOptions.length);
  }

  function isDateWithinPeriod(value, startDate, endDate) {
    return Boolean(
      /^\d{4}-\d{2}-\d{2}$/.test(value || "")
      && /^\d{4}-\d{2}-\d{2}$/.test(startDate || "")
      && /^\d{4}-\d{2}-\d{2}$/.test(endDate || "")
      && startDate <= value
      && value <= endDate,
    );
  }

  function syncMilestoneDateBounds(overlay) {
    const startDate = overlay.querySelector("#schedule-start-date")?.value || "";
    const endDate = overlay.querySelector("#schedule-end-date")?.value || "";
    const hasPeriod = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      && startDate <= endDate;
    overlay.querySelectorAll(".editor-date").forEach((input) => {
      if (hasPeriod) {
        input.min = startDate;
        input.max = endDate;
      } else {
        input.removeAttribute("min");
        input.removeAttribute("max");
      }
      const invalid = Boolean(input.value) && hasPeriod && !isDateWithinPeriod(input.value, startDate, endDate);
      input.setAttribute("aria-invalid", String(invalid));
      input.closest(".schedule-input-shell")?.classList.toggle("is-invalid", invalid);
    });
  }

  function clearEditorValidation(overlay) {
    const message = overlay.querySelector(".schedule-editor-validation");
    if (message) {
      message.hidden = true;
      message.textContent = "";
    }
    overlay.querySelectorAll(".schedule-input-shell.is-invalid").forEach((field) => {
      field.classList.remove("is-invalid");
    });
  }

  function showEditorValidation(overlay, message, field) {
    const notice = overlay.querySelector(".schedule-editor-validation");
    if (notice) {
      notice.textContent = message;
      notice.hidden = false;
    }
    const shell = field?.closest?.(".schedule-input-shell");
    shell?.classList.add("is-invalid");
    const body = overlay.querySelector(".schedule-editor-body");
    if (body && shell) {
      const bodyTop = body.getBoundingClientRect().top;
      const shellTop = shell.getBoundingClientRect().top;
      body.scrollTo({ top: body.scrollTop + shellTop - bodyTop - 24, behavior: "smooth" });
    }
    showToast(message, true);
  }

  function scheduleValidationError(overlay, payload, startDate, endDate) {
    if (!startDate || !endDate) {
      return { message: "请先选择完整的计划周期", field: overlay.querySelector("#schedule-start-date") };
    }
    if (startDate > endDate) {
      return { message: "计划开始日期不能晚于结束日期", field: overlay.querySelector("#schedule-start-date") };
    }
    const incomplete = payload.milestones.find((item) => !item.name || !item.planned_date);
    if (incomplete) {
      const row = Array.from(overlay.querySelectorAll(".schedule-editor-milestone"))[payload.milestones.indexOf(incomplete)];
      return {
        message: "请完整填写里程碑名称和计划日期",
        field: row?.querySelector(incomplete.name ? ".editor-date" : ".editor-name"),
      };
    }
    const outsidePeriod = payload.milestones.find((item) => !isDateWithinPeriod(item.planned_date, startDate, endDate));
    if (outsidePeriod) {
      const row = Array.from(overlay.querySelectorAll(".schedule-editor-milestone"))[payload.milestones.indexOf(outsidePeriod)];
      return {
        message: `里程碑计划日期必须位于 ${startDate} 至 ${endDate} 之间`,
        field: row?.querySelector(".editor-date"),
      };
    }
    return null;
  }

  function milestoneEditorRow(milestone, users, sequence = 1) {
    return `<div class="schedule-editor-milestone" data-id="${milestone.id || ""}" data-status="${milestone.status || "pending"}" data-progress="${milestone.progress_pct || 0}">
      <div class="editor-milestone-top"><strong><em>${String(sequence).padStart(2, "0")}</em> 里程碑</strong><button type="button" class="schedule-remove-milestone" title="删除里程碑" aria-label="删除里程碑">×</button></div>
      <label class="schedule-form-field"><span>名称</span><div class="schedule-input-shell"><input class="editor-name" maxlength="100" value="${escapeHtml(milestone.name || "")}" placeholder="例如：完成开发联调" /></div></label>
      <div class="editor-field-pair">
        <label class="schedule-form-field"><span>计划日期</span><div class="schedule-input-shell date"><input class="editor-date" type="date" aria-label="里程碑计划日期" value="${escapeHtml(milestone.planned_date || "")}" /></div></label>
        <label class="schedule-form-field owner-field"><span>负责人 <small>可多选</small></span>${ownerPickerMarkup(milestone, users)}</label>
      </div>
      <label class="schedule-form-field"><span>验收标准 <small>用于判断里程碑是否真正完成</small></span><div class="schedule-input-shell textarea"><textarea class="editor-criteria" maxlength="500" rows="2" placeholder="描述可验证、可复核的完成标准">${escapeHtml(milestone.acceptance_criteria || "")}</textarea></div></label>
      <label class="editor-weight-label schedule-form-field"><span>里程碑占比 <small>用于汇总项目整体进度</small></span><div class="editor-weight-control"><div class="schedule-weight-stepper"><button type="button" data-step="-0.5" aria-label="降低里程碑占比">−</button><input class="editor-weight" type="number" min="0.5" max="100" step="0.5" value="${milestone.weight || 1}" aria-label="里程碑相对权重" /><b>权重</b><button type="button" data-step="0.5" aria-label="提高里程碑占比">＋</button></div><output class="editor-weight-share">占整体进度 100%</output></div></label>
    </div>`;
  }

  function updateWeightShares(root) {
    const rows = Array.from(root.querySelectorAll(".schedule-editor-milestone"));
    const weights = rows.map((row) => Math.min(100, Math.max(0.5, Number(row.querySelector(".editor-weight")?.value) || 1)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    rows.forEach((row, index) => {
      const share = totalWeight ? Math.round(weights[index] * 100 / totalWeight) : 0;
      const output = row.querySelector(".editor-weight-share");
      if (output) output.textContent = `占整体进度 ${share}%`;
    });
  }

  function mountSchedulePeriodPicker(overlay) {
    const host = overlay.querySelector(".schedule-period-picker-host");
    const start = overlay.querySelector("#schedule-start-date");
    const end = overlay.querySelector("#schedule-end-date");
    const calendar = window.LegacyAntdCalendar;
    if (!host || !start || !end || !calendar || typeof calendar.mountRangePeriod !== "function") return false;
    calendar.mountRangePeriod(host, start, end, {
      mode: "custom",
      showModeSelector: false,
      className: "schedule-period-picker",
      ariaLabel: "计划周期",
      popupContainerSelector: ".legacy-schedule-overlay",
      onChange: () => syncMilestoneDateBounds(overlay),
    });
    return true;
  }

  async function openEditor(data) {
    return openPlanPeriodEditor(data);
  }

  async function openPlanPeriodEditor(data) {
    const schedule = data.schedule;
    const needsReason = schedule && ["active", "suspended"].includes(schedule.status);
    const overlay = document.createElement("div");
    overlay.className = "legacy-schedule-overlay";
    overlay.innerHTML = `<button class="schedule-overlay-backdrop" type="button" aria-label="关闭计划周期编辑"></button>
      <section class="schedule-editor-panel" role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title">
        <header><div><span>管理员计划周期</span><h2 id="schedule-editor-title">${schedule ? "编辑计划周期" : "新建计划周期"}</h2></div><button type="button" class="schedule-close-editor" title="关闭" aria-label="关闭">×</button></header>
        <div class="schedule-editor-body">
          <section class="schedule-plan-period">
            <div class="schedule-form-section-head"><div><strong>计划周期</strong><span>用于计算时间进度和剩余天数</span></div><i aria-hidden="true"></i></div>
            <div class="schedule-editor-dates"><div class="schedule-period-picker-host">
              <input id="schedule-start-date" type="date" aria-label="计划开始日期" value="${escapeHtml(schedule?.current_start_date || "")}" />
              <input id="schedule-end-date" type="date" aria-label="计划结束日期" value="${escapeHtml(schedule?.current_end_date || "")}" />
            </div></div>
          </section>
          <p class="schedule-editor-validation" role="alert" aria-live="assertive" hidden></p>
          ${needsReason ? '<label class="schedule-change-reason"><span>变更原因 <b>必填</b></span><textarea id="schedule-change-reason" maxlength="500" rows="2" placeholder="说明本次计划周期调整原因"></textarea></label>' : ""}
          <div class="schedule-role-boundary"><strong>里程碑由项目成员填写</strong><span>计划周期启用后，成员可在用户端新增、修改本人里程碑并更新进度；管理员在此查看汇总和进展。</span></div>
        </div>
        <footer><p><span aria-hidden="true">✓</span> 保存前将校验完整的计划周期</p><div><button type="button" class="schedule-secondary schedule-cancel-editor">取消</button><button type="button" class="schedule-primary schedule-save-editor">保存${needsReason ? "新版本" : "草稿"}</button></div></footer>
      </section>`;
    document.body.appendChild(overlay);
    document.documentElement.classList.add("schedule-dialog-open");
    if (!mountSchedulePeriodPicker(overlay)) window.setTimeout(() => mountSchedulePeriodPicker(overlay), 0);
    overlay.querySelector(".schedule-editor-panel").focus();
    overlay.querySelectorAll(".schedule-overlay-backdrop,.schedule-close-editor,.schedule-cancel-editor").forEach((button) => button.addEventListener("click", closeOverlay));
    overlay.addEventListener("input", (event) => {
      if (event.target.matches("#schedule-start-date,#schedule-end-date")) clearEditorValidation(overlay);
    });
    const saveButton = overlay.querySelector(".schedule-save-editor");
    saveButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void savePlanPeriod(saveButton).catch((error) => showEditorValidation(overlay, error?.message || "保存失败，请稍后重试"));
    });
    async function savePlanPeriod(button) {
      if (button.disabled || overlay.dataset.scheduleSaving === "true") return;
      const defaultLabel = `保存${needsReason ? "新版本" : "草稿"}`;
      const startDate = overlay.querySelector("#schedule-start-date").value;
      const endDate = overlay.querySelector("#schedule-end-date").value;
      const payload = {
        start_date: startDate,
        end_date: endDate,
        expected_version: schedule?.revision,
        change_reason: overlay.querySelector("#schedule-change-reason")?.value.trim() || "",
        deleted_ids: [],
        milestones: [],
      };
      const validation = scheduleValidationError(overlay, payload, startDate, endDate);
      if (validation) {
        showEditorValidation(overlay, validation.message, validation.field);
        return;
      }
      clearEditorValidation(overlay);
      overlay.dataset.scheduleSaving = "true";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "正在保存…";
      try {
        const saved = await api(`/api/projects/${activeProjectId}/schedule`, { method: "PUT", body: JSON.stringify(payload) });
        closeOverlay();
        showToast(needsReason ? `计划周期 V${saved.schedule.version} 已保存` : "计划周期草稿已保存");
        await renderSchedule(true);
      } catch (error) {
        if (error.code === "schedule_version_conflict") {
          showEditorValidation(overlay, "计划已被其他人更新，请加载最新版本后再保存");
        } else {
          showEditorValidation(overlay, error.message || "保存失败，请稍后重试");
        }
      } finally {
        delete overlay.dataset.scheduleSaving;
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.textContent = defaultLabel;
        }
      }
    }
  }

  // Kept only for historical records opened in an old browser tab. New
  // administrator controls route to openPlanPeriodEditor above; milestone
  // authoring now belongs to the member workbench.
  async function legacyMilestoneEditor(data) {
    const users = await loadUsers();
    const schedule = data.schedule;
    const milestones = schedule?.milestones || [{}];
    const needsReason = schedule && ["active", "suspended"].includes(schedule.status);
    const deletedMilestoneIds = new Set();
    const overlay = document.createElement("div");
    overlay.className = "legacy-schedule-overlay";
    overlay.innerHTML = `<button class="schedule-overlay-backdrop" type="button" aria-label="关闭排期编辑"></button>
      <section class="schedule-editor-panel" role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title">
        <header><div><span>项目计划</span><h2 id="schedule-editor-title">${schedule ? "编辑排期与里程碑" : "新建排期与里程碑"}</h2></div><button type="button" class="schedule-close-editor" title="关闭" aria-label="关闭">×</button></header>
        <div class="schedule-editor-body">
          <section class="schedule-plan-period">
            <div class="schedule-form-section-head"><div><strong>计划周期</strong><span>用于计算时间进度和剩余天数</span></div><i aria-hidden="true"></i></div>
            <div class="schedule-editor-dates">
              <div class="schedule-period-picker-host">
                <input id="schedule-start-date" type="date" aria-label="计划开始日期" value="${escapeHtml(schedule?.current_start_date || "")}" />
                <input id="schedule-end-date" type="date" aria-label="计划结束日期" value="${escapeHtml(schedule?.current_end_date || "")}" />
              </div>
            </div>
          </section>
          <p class="schedule-editor-validation" role="alert" aria-live="assertive" hidden></p>
          ${needsReason ? '<label class="schedule-change-reason"><span>变更原因 <b>必填</b></span><textarea id="schedule-change-reason" maxlength="500" rows="2" placeholder="说明本次调整原因，保存后会生成新版本"></textarea></label>' : ""}
          <div class="schedule-editor-section-title"><div><strong>里程碑</strong><span>日期需位于计划周期内</span></div><button type="button" class="schedule-add-milestone"><span aria-hidden="true">＋</span><b>添加里程碑</b></button></div>
          <div class="schedule-editor-milestones">${milestones.map((item, index) => milestoneEditorRow(item, users, index + 1)).join("")}</div>
        </div>
        <footer><p><span aria-hidden="true">✓</span> 保存前将校验计划周期与里程碑日期</p><div><button type="button" class="schedule-secondary schedule-cancel-editor">取消</button><button type="button" class="schedule-primary schedule-save-editor">保存${needsReason ? "新版本" : "草稿"}</button></div></footer>
      </section>`;
    overlay.addEventListener("error", (event) => {
      if (!event.target.matches(".owner-picker-avatar img")) return;
      const avatar = event.target.closest(".owner-picker-avatar");
      avatar.textContent = avatar.dataset.initial || "?";
      avatar.classList.add("is-fallback");
    }, true);
    document.body.appendChild(overlay);
    document.documentElement.classList.add("schedule-dialog-open");
    if (!mountSchedulePeriodPicker(overlay)) {
      window.setTimeout(() => mountSchedulePeriodPicker(overlay), 0);
    }
    syncMilestoneDateBounds(overlay);
    updateWeightShares(overlay);
    overlay.querySelector(".schedule-editor-panel").focus();
    overlay.querySelectorAll(".schedule-overlay-backdrop,.schedule-close-editor,.schedule-cancel-editor").forEach((button) => button.addEventListener("click", closeOverlay));
    overlay.querySelector(".schedule-add-milestone").addEventListener("click", () => {
      const list = overlay.querySelector(".schedule-editor-milestones");
      list.insertAdjacentHTML("beforeend", milestoneEditorRow({}, users, list.children.length + 1));
      syncMilestoneDateBounds(overlay);
      updateWeightShares(overlay);
      list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    // The editor lives inside several legacy page-level click delegates. Bind the
    // primary action on the button itself so a surrounding delegate cannot swallow
    // the click before the schedule save request starts.
    const saveButton = overlay.querySelector(".schedule-save-editor");
    saveButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void saveEditor(saveButton).catch((error) => {
        showEditorValidation(overlay, error?.message || "保存失败，请稍后重试");
      });
    });
    overlay.addEventListener("click", (event) => {
      const ownerTrigger = event.target.closest(".owner-picker-trigger");
      if (ownerTrigger) {
        const picker = ownerTrigger.closest(".editor-owner-picker");
        const menu = picker.querySelector(".owner-picker-menu");
        const willOpen = menu.hidden;
        overlay.querySelectorAll(".editor-owner-picker.open").forEach((item) => {
          if (item === picker) return;
          item.classList.remove("open", "open-up");
          item.querySelector(".owner-picker-menu").hidden = true;
          item.querySelector(".owner-picker-trigger").setAttribute("aria-expanded", "false");
        });
        menu.hidden = !willOpen;
        picker.classList.toggle("open", willOpen);
        picker.classList.toggle("open-up", willOpen && ownerTrigger.getBoundingClientRect().bottom > window.innerHeight - 280);
        ownerTrigger.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) window.setTimeout(() => menu.querySelector('input[type="search"]')?.focus(), 0);
        return;
      }
      const ownerOption = event.target.closest(".owner-picker-option");
      if (ownerOption) {
        const picker = ownerOption.closest(".editor-owner-picker");
        if (ownerOption.dataset.action === "clear") {
          picker.querySelectorAll(".owner-picker-option.selected[data-user-id]").forEach((item) => item.classList.remove("selected"));
        } else {
          ownerOption.classList.toggle("selected");
        }
        refreshOwnerPicker(picker);
        return;
      }
      const ownerDone = event.target.closest(".owner-picker-done");
      if (ownerDone) {
        const picker = ownerDone.closest(".editor-owner-picker");
        picker.classList.remove("open", "open-up");
        picker.querySelector(".owner-picker-menu").hidden = true;
        picker.querySelector(".owner-picker-trigger").setAttribute("aria-expanded", "false");
        return;
      }
      const weightStep = event.target.closest(".schedule-weight-stepper button");
      if (weightStep) {
        const input = weightStep.closest(".schedule-weight-stepper").querySelector(".editor-weight");
        input.value = String(Math.min(100, Math.max(0.5, Number(input.value || 1) + Number(weightStep.dataset.step))));
        updateWeightShares(overlay);
        return;
      }
      const remove = event.target.closest(".schedule-remove-milestone");
      if (remove) {
        const rows = overlay.querySelectorAll(".schedule-editor-milestone");
        if (rows.length === 1) {
          showToast("至少保留一个里程碑编辑项", true);
          return;
        }
        const removedRow = remove.closest(".schedule-editor-milestone");
        const removedId = Number(removedRow.dataset.id);
        if (removedId) deletedMilestoneIds.add(removedId);
        removedRow.remove();
        overlay.querySelectorAll(".schedule-editor-milestone").forEach((row, index) => {
          row.querySelector(".editor-milestone-top em").textContent = String(index + 1).padStart(2, "0");
        });
        updateWeightShares(overlay);
        return;
      }
      if (!event.target.closest(".editor-owner-picker")) {
        overlay.querySelectorAll(".editor-owner-picker.open").forEach((picker) => {
          picker.classList.remove("open", "open-up");
          picker.querySelector(".owner-picker-menu").hidden = true;
          picker.querySelector(".owner-picker-trigger").setAttribute("aria-expanded", "false");
        });
      }
    });
    overlay.addEventListener("input", (event) => {
      if (event.target.matches("#schedule-start-date,#schedule-end-date")) {
        clearEditorValidation(overlay);
        syncMilestoneDateBounds(overlay);
        return;
      }
      if (event.target.matches(".editor-name,.editor-date")) {
        clearEditorValidation(overlay);
        syncMilestoneDateBounds(overlay);
        return;
      }
      if (event.target.matches(".editor-weight")) {
        updateWeightShares(overlay);
        return;
      }
      if (!event.target.matches('.owner-picker-search input[type="search"]')) return;
      const picker = event.target.closest(".editor-owner-picker");
      const query = event.target.value.trim().toLocaleLowerCase("zh-CN");
      let visible = 0;
      picker.querySelectorAll(".owner-picker-option").forEach((option) => {
        const match = !query || option.dataset.search.toLocaleLowerCase("zh-CN").includes(query);
        option.hidden = !match;
        if (match) visible += 1;
      });
      picker.querySelector(".owner-picker-empty").hidden = visible > 0;
    });
    async function saveEditor(button) {
      if (button.disabled || overlay.dataset.scheduleSaving === "true") return;
      const defaultLabel = `保存${needsReason ? "新版本" : "草稿"}`;
      const startDate = overlay.querySelector("#schedule-start-date").value;
      const endDate = overlay.querySelector("#schedule-end-date").value;
      const changeReason = overlay.querySelector("#schedule-change-reason")?.value.trim() || "";
      const payload = {
        start_date: startDate,
        end_date: endDate,
        expected_version: schedule?.revision,
        change_reason: changeReason,
        deleted_ids: Array.from(deletedMilestoneIds),
        milestones: Array.from(overlay.querySelectorAll(".schedule-editor-milestone")).map((row) => {
          const ownerUserIds = (row.querySelector(".editor-owner-picker").dataset.values || "")
            .split(",")
            .map(Number)
            .filter(Boolean);
          return {
            id: Number(row.dataset.id) || undefined,
            name: row.querySelector(".editor-name").value.trim(),
            planned_date: row.querySelector(".editor-date").value,
            owner_user_id: ownerUserIds[0] || null,
            owner_user_ids: ownerUserIds,
            status: row.dataset.status || "pending",
            progress_pct: Number(row.dataset.progress) || 0,
            weight: Number(row.querySelector(".editor-weight").value) || 1,
            acceptance_criteria: row.querySelector(".editor-criteria").value.trim(),
          };
        }),
      };
      const validation = scheduleValidationError(overlay, payload, startDate, endDate);
      if (validation) {
        showEditorValidation(overlay, validation.message, validation.field);
        return;
      }
      clearEditorValidation(overlay);
      overlay.dataset.scheduleSaving = "true";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "正在保存…";
      try {
        const saved = await api(`/api/projects/${activeProjectId}/schedule`, { method: "PUT", body: JSON.stringify(payload) });
        closeOverlay();
        const notificationResult = saved.notifications || {};
        const sentCount = Number(notificationResult.outbox?.sent || 0);
        const dryRunCount = (notificationResult.recipients || []).filter((item) => item.status === "dry_run").length;
        const failedCount = Number(notificationResult.failed || 0);
        let noticeSuffix = "";
        if (sentCount) noticeSuffix = `，已飞书通知 ${sentCount} 位负责人`;
        else if (dryRunCount) noticeSuffix = `，已生成 ${dryRunCount} 条安全演练通知`;
        else if (failedCount) noticeSuffix = "，站内记录已保留，飞书账号待完善";
        showToast(needsReason ? `计划 V${saved.schedule.version} 已保存${noticeSuffix}` : "排期草稿已保存");
        await renderSchedule(true);
      } catch (error) {
        if (error.code === "schedule_version_conflict") {
          const versionText = error.currentVersion
            ? `你打开时的修订为 ${error.expectedVersion || "未知"}，服务器当前修订为 ${error.currentVersion}。`
            : "服务器上的计划已发生变化。";
          const reload = await confirmAction(
            "计划已被其他人更新",
            `${versionText} 可保留当前编辑自行核对，或加载最新版本后重新合并。`,
            "加载最新版本",
          );
          if (reload) {
            closeOverlay();
            await renderSchedule(true);
          } else {
            showToast("已保留当前编辑内容，请核对后再保存");
          }
        } else {
          showEditorValidation(overlay, error.message || "保存失败，请稍后重试");
        }
      } finally {
        delete overlay.dataset.scheduleSaving;
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.textContent = defaultLabel;
        }
      }
    }
  }

  function historyMilestonesMarkup(snapshot) {
    const milestones = Array.isArray(snapshot?.milestones) ? snapshot.milestones : [];
    if (!milestones.length) return "";
    return `<details class="schedule-history-milestones"><summary>查看 ${milestones.length} 个里程碑</summary><div>${milestones.map((milestone) => `<p><b>${escapeHtml(milestone.name || "未命名里程碑")}</b><span>${formatDate(milestone.planned_date)} · ${Number(milestone.progress_pct) || 0}%</span></p>`).join("")}</div></details>`;
  }

  async function openHistory() {
    try {
      const history = await api(`/api/projects/${activeProjectId}/schedule/history`);
      const overlay = document.createElement("div");
      overlay.className = "legacy-schedule-overlay";
      const rows = history.length ? history.map((item) => `<div class="schedule-history-row"><b>V${item.version}</b><div><strong>${formatDate(item.snapshot.current_start_date)} — ${formatDate(item.snapshot.current_end_date)}</strong><p>${escapeHtml(item.change_reason || "未填写变更原因")}</p>${historyMilestonesMarkup(item.snapshot)}</div><span>${escapeHtml(item.changed_by_name)}<small>${formatDate(item.created_at)}</small></span></div>`).join("") : '<div class="schedule-empty-inline">暂无已启用的计划版本。</div>';
      overlay.innerHTML = `<button class="schedule-overlay-backdrop" type="button" aria-label="关闭版本记录"></button><section class="schedule-history-panel" role="dialog" aria-modal="true"><header><div><span>审计记录</span><h2>计划版本</h2></div><button type="button" class="schedule-close-editor" aria-label="关闭">×</button></header><div class="schedule-history-list">${rows}</div></section>`;
      document.body.appendChild(overlay);
      document.documentElement.classList.add("schedule-dialog-open");
      overlay.querySelectorAll(".schedule-overlay-backdrop,.schedule-close-editor").forEach((button) => button.addEventListener("click", closeOverlay));
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function activateSchedule(button, data) {
    const schedule = data.schedule;
    const decision = await confirmScheduleActivation(data);
    if (!decision) return;
    button.disabled = true;
    try {
      const activated = await api(`/api/projects/${activeProjectId}/schedule/activate`, {
        method: "POST",
        body: JSON.stringify({
          expected_version: schedule.revision,
          notify_owners: decision.notifyOwners,
        }),
      });
      const notifications = activated.notifications || {};
      const sent = Number(notifications.outbox?.sent || 0);
      const queued = Number(notifications.queued || 0);
      const failed = Number(notifications.failed || 0);
      const missing = (notifications.missing_owner_milestones || []).length;
      if (!decision.notifyOwners) {
        showToast("计划基线已启用，排期监控开始运行");
      } else if (sent) {
        showToast(`计划基线已启用，已向 ${sent} 位负责人发送飞书卡片`);
      } else if (queued) {
        showToast(`计划基线已启用，${queued} 条负责人通知已进入发送队列`);
      } else if (activated.notification_delivery_mode === "dry_run") {
        showToast("计划基线已启用，负责人通知已按安全演练记录");
      } else {
        showToast(`计划基线已启用；${failed + missing} 条负责人通知需要完善配置`, true);
      }
      await renderSchedule(true);
    } catch (error) {
      showToast(error.message, true);
      if (error.code === "schedule_version_conflict") await renderSchedule(true);
    } finally {
      button.disabled = false;
    }
  }

  async function resumeSchedule(button, schedule) {
    button.disabled = true;
    try {
      await api(`/api/projects/${activeProjectId}/schedule/resume`, {
        method: "POST",
        body: JSON.stringify({ expected_version: schedule.revision }),
      });
      showToast("排期监控已恢复");
      await renderSchedule(true);
    } catch (error) {
      showToast(error.message, true);
      if (error.code === "schedule_version_conflict") await renderSchedule(true);
    } finally {
      button.disabled = false;
    }
  }

  async function saveInlineProgress(editor, scheduleRevision) {
    const button = editor.querySelector(".schedule-inline-save");
    const progress = Number(editor.querySelector('input[type="range"]').value);
    button.disabled = true;
    try {
      await api(`/api/projects/${activeProjectId}/milestones/${editor.dataset.milestoneId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progress_pct: progress, expected_version: scheduleRevision }),
      });
      showToast("里程碑进度已更新");
      await renderSchedule(true);
    } catch (error) {
      showToast(error.message, true);
      if (error.code === "schedule_version_conflict") await renderSchedule(true);
    } finally {
      button.disabled = false;
    }
  }

  function bindCard(card, data) {
    card.querySelector(".schedule-open-editor")?.addEventListener("click", () => openEditor(data).catch((error) => showToast(error.message, true)));
    card.querySelector(".schedule-open-history")?.addEventListener("click", openHistory);
    card.querySelector(".schedule-activate")?.addEventListener("click", (event) => activateSchedule(event.currentTarget, data));
    card.querySelector(".schedule-resume")?.addEventListener("click", (event) => resumeSchedule(event.currentTarget, data.schedule));
    card.querySelectorAll(".milestone-progress-editor").forEach((editor) => {
      const range = editor.querySelector('input[type="range"]');
      const output = editor.querySelector("output");
      range.addEventListener("input", () => { output.textContent = `${range.value}%`; });
      editor.querySelector(".schedule-inline-save").addEventListener("click", () => saveInlineProgress(editor, data.schedule.revision));
    });
  }

  async function renderSchedule(force) {
    const page = document.querySelector(".project-detail-page");
    if (!page) {
      activeProjectId = null;
      return;
    }
    const projectId = projectIdFromPage(page);
    if (!projectId) return;
    const existing = page.querySelector(`.${CARD_CLASS}`);
    if (existing && activeProjectId === projectId && !force) return;
    activeProjectId = projectId;
    const token = ++renderToken;
    if (existing) existing.remove();
    const loading = document.createElement("article");
    loading.className = `detail-card schedule-card ${CARD_CLASS} loading`;
    loading.innerHTML = '<div class="schedule-loading"><span></span><div><b>正在读取项目排期</b><small>同步计划、里程碑与预警状态</small></div></div>';
    if (!placeCard(page, loading)) return;
    try {
      const data = await api(`/api/projects/${projectId}/schedule`);
      if (token !== renderToken || !document.contains(loading)) return;
      const next = document.createElement("div");
      next.innerHTML = cardMarkup(data);
      const card = next.firstElementChild;
      loading.replaceWith(card);
      bindCard(card, data);
      window.dispatchEvent(new CustomEvent("legacy-project-schedule:loaded", {
        detail: { projectId, data },
      }));
      window.dispatchEvent(new Event("resize"));
    } catch (error) {
      loading.classList.remove("loading");
      loading.innerHTML = `<div class="schedule-load-error"><strong>排期暂时无法读取</strong><span>${escapeHtml(error.message)}</span><button type="button">重试</button></div>`;
      loading.querySelector("button").addEventListener("click", () => renderSchedule(true));
    }
  }

  let observerQueued = false;
  const observer = new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    window.requestAnimationFrame(() => {
      observerQueued = false;
      renderSchedule(false);
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOverlay();
  });
  window.addEventListener("load", () => renderSchedule(false));
  renderSchedule(false);

  window.__legacyProjectSchedule = { projectIdFromPage, render: () => renderSchedule(true) };
})();
