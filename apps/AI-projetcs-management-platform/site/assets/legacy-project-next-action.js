(function () {
  "use strict";

  const CARD_CLASS = "legacy-project-next-action";
  const SCHEDULE_EVENT = "legacy-project-schedule:loaded";
  let activeProjectId = null;
  let observerQueued = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function projectIdFromPage(page) {
    if (window.__legacyProjectSchedule?.projectIdFromPage) {
      return window.__legacyProjectSchedule.projectIdFromPage(page);
    }
    const rows = page.querySelectorAll(".basic-card .detail-dl > div");
    for (const row of rows) {
      const label = row.querySelector("dt");
      if (!label || !label.textContent.includes("项目编号")) continue;
      const match = (row.querySelector("dd")?.textContent || "").match(/PRJ-(\d+)/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function parseDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function daysBetween(from, to) {
    const start = parseDate(from);
    const end = parseDate(to);
    if (start === null || end === null) return null;
    return Math.round((end - start) / 86400000);
  }

  function shortDate(value) {
    const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})/);
    return match ? `${match[1]}/${match[2]}` : "待定";
  }

  function milestoneStatus(status) {
    return {
      pending: "未开始",
      in_progress: "进行中",
      completed: "已完成",
      cancelled: "已取消",
    }[status] || "待确认";
  }

  function ownerNames(milestone) {
    const names = Array.isArray(milestone?.owner_names)
      ? milestone.owner_names.filter(Boolean)
      : [];
    if (names.length) return names.join("、");
    return milestone?.owner_name || "待指定";
  }

  function openMilestones(schedule) {
    return (Array.isArray(schedule?.milestones) ? schedule.milestones : [])
      .filter((item) => !["completed", "cancelled"].includes(item.status))
      .sort((left, right) => {
        if (Boolean(left.is_overdue) !== Boolean(right.is_overdue)) return left.is_overdue ? -1 : 1;
        if (Number(left.overdue_days || 0) !== Number(right.overdue_days || 0)) {
          return Number(right.overdue_days || 0) - Number(left.overdue_days || 0);
        }
        return String(left.planned_date || "9999-12-31").localeCompare(String(right.planned_date || "9999-12-31"));
      });
  }

  function reasonForProgress(schedule) {
    const gap = Number(schedule?.progress_gap_pct || 0);
    const time = Number(schedule?.time_progress_pct || 0);
    const actual = Number(schedule?.actual_progress_pct || 0);
    if (gap < 0) return `计划已走 ${time}%，实际完成 ${actual}%，落后 ${Math.abs(gap)} 个百分点。`;
    if (gap > 0) return `计划已走 ${time}%，实际完成 ${actual}%，领先 ${gap} 个百分点。`;
    return `计划进度与实际进度均为 ${actual}%。`;
  }

  function queueFrom(schedule, selectedId) {
    return openMilestones(schedule)
      .filter((item) => Number(item.id) !== Number(selectedId))
      .slice(0, 2)
      .map((item) => ({
        id: Number(item.id),
        name: item.name || "未命名里程碑",
        meta: item.is_overdue
          ? `逾期 ${Number(item.overdue_days || 0)} 天`
          : `${shortDate(item.planned_date)} · ${milestoneStatus(item.status)}`,
      }));
  }

  function milestonePriority(data, milestone, options) {
    const schedule = data.schedule;
    const editable = Boolean(data.can_contribute && milestone.can_edit);
    const progress = Number(milestone.progress_pct || 0);
    const result = {
      tone: options.tone,
      badge: options.badge,
      eyebrow: options.eyebrow || "当前最优先",
      icon: options.icon,
      title: options.title || `优先推进「${milestone.name || "未命名里程碑"}」`,
      description: options.description,
      owner: ownerNames(milestone),
      metrics: options.metrics || [
        { label: "当前进度", value: `${progress}%` },
        { label: "计划日期", value: shortDate(milestone.planned_date) },
      ],
      reason: options.reason || reasonForProgress(schedule),
      action: "milestone",
      actionLabel: editable ? "更新进度" : "查看并推进",
      milestoneId: Number(milestone.id),
    };
    result.queue = queueFrom(schedule, result.milestoneId);
    return result;
  }

  function selectPriority(data) {
    const schedule = data?.schedule || null;
    if (!schedule) {
      return {
        tone: "neutral",
        badge: "待开始",
        eyebrow: "完成第一步",
        icon: "calendar-days",
        title: "先建立项目计划",
        description: "补充计划周期后，系统才能判断进度并推荐下一步。",
        owner: "项目管理员",
        metrics: [],
        reason: "当前项目还没有可用的计划与里程碑数据。",
        action: data?.can_manage ? "edit-schedule" : "schedule",
        actionLabel: data?.can_manage ? "新建计划" : "查看计划",
        queue: [],
      };
    }

    if (schedule.status === "draft") {
      return {
        tone: "neutral",
        badge: "草稿",
        eyebrow: "完成第一步",
        icon: "play",
        title: "启用项目计划",
        description: "计划仍是草稿，启用后才会开始进度监控和里程碑提醒。",
        owner: data.is_project_owner ? "你是项目负责人" : "项目负责人",
        metrics: [
          { label: "里程碑", value: `${Number(schedule.milestone_count || 0)} 项` },
          { label: "计划结束", value: shortDate(schedule.current_end_date) },
        ],
        reason: "草稿计划不会参与项目健康状态和逾期判断。",
        action: data.can_manage ? "activate-schedule" : "schedule",
        actionLabel: data.can_manage ? "启用计划" : "查看计划",
        queue: queueFrom(schedule),
      };
    }

    if (schedule.status === "suspended") {
      return {
        tone: "warning",
        badge: "已暂停",
        eyebrow: "当前最优先",
        icon: "circle-alert",
        title: "确认是否恢复计划监控",
        description: "监控暂停期间，系统不会继续产生新的进度提醒。",
        owner: data.is_project_owner ? "你是项目负责人" : "项目负责人",
        metrics: [
          { label: "实际进度", value: `${Number(schedule.actual_progress_pct || 0)}%` },
          { label: "剩余时间", value: `${Number(schedule.remaining_days || 0)} 天` },
        ],
        reason: "恢复监控前，请先确认当前计划周期仍然有效。",
        action: data.can_manage ? "resume-schedule" : "schedule",
        actionLabel: data.can_manage ? "恢复监控" : "查看计划",
        queue: queueFrom(schedule),
      };
    }

    const open = openMilestones(schedule);
    const overdue = open.find((item) => item.is_overdue);
    if (overdue) {
      return milestonePriority(data, overdue, {
        tone: "danger",
        badge: "需关注",
        icon: "shield-alert",
        title: `先推进「${overdue.name || "未命名里程碑"}」`,
        description: `已逾期 ${Number(overdue.overdue_days || 0)} 天，当前完成 ${Number(overdue.progress_pct || 0)}%。`,
        metrics: [
          { label: "已逾期", value: `${Number(overdue.overdue_days || 0)} 天` },
          { label: "当前进度", value: `${Number(overdue.progress_pct || 0)}%` },
        ],
      });
    }

    if (schedule.health === "overdue") {
      return {
        tone: "danger",
        badge: "项目逾期",
        eyebrow: "当前最优先",
        icon: "shield-alert",
        title: "确认项目延期安排",
        description: `计划周期已结束 ${Number(schedule.overdue_days || 0)} 天，需要明确新的交付安排。`,
        owner: data.is_project_owner ? "你是项目负责人" : "项目负责人",
        metrics: [
          { label: "实际进度", value: `${Number(schedule.actual_progress_pct || 0)}%` },
          { label: "已逾期", value: `${Number(schedule.overdue_days || 0)} 天` },
        ],
        reason: reasonForProgress(schedule),
        action: "schedule",
        actionLabel: "查看并调整",
        queue: queueFrom(schedule),
      };
    }

    const gap = Number(schedule.progress_gap_pct || 0);
    if (gap <= -15 && open.length) {
      const focus = open.find((item) => item.status === "in_progress") || open[0];
      return milestonePriority(data, focus, {
        tone: "warning",
        badge: "进度落后",
        icon: "activity",
        description: `项目实际进度落后 ${Math.abs(gap)} 个百分点，先推动当前节点。`,
      });
    }

    const dueSoon = open.find((item) => {
      const remaining = daysBetween(data.today, item.planned_date);
      return remaining !== null && remaining >= 0 && remaining <= 3;
    });
    if (dueSoon) {
      const remaining = daysBetween(data.today, dueSoon.planned_date);
      return milestonePriority(data, dueSoon, {
        tone: "primary",
        badge: "即将到期",
        icon: "calendar-clock",
        eyebrow: "接下来",
        title: `准备「${dueSoon.name || "未命名里程碑"}」`,
        description: remaining === 0 ? "计划今天完成，请确认交付结果。" : `距离计划完成还有 ${remaining} 天。`,
        reason: reasonForProgress(schedule),
      });
    }

    if (open.length) {
      const focus = open.find((item) => item.status === "in_progress") || open[0];
      return milestonePriority(data, focus, {
        tone: "success",
        badge: "进展正常",
        icon: "circle-check",
        eyebrow: "接下来",
        title: `继续推进「${focus.name || "未命名里程碑"}」`,
        description: `计划 ${shortDate(focus.planned_date)} 完成，当前进度 ${Number(focus.progress_pct || 0)}%。`,
      });
    }

    return {
      tone: "success",
      badge: "已完成",
      eyebrow: "当前状态",
      icon: "check-circle-2",
      title: "项目里程碑已全部完成",
      description: "当前没有需要立即处理的里程碑事项。",
      owner: "项目团队",
      metrics: [
        { label: "实际进度", value: `${Number(schedule.actual_progress_pct || 0)}%` },
        { label: "已完成", value: `${Number(schedule.completed_milestone_count || 0)} 项` },
      ],
      reason: reasonForProgress(schedule),
      action: "schedule",
      actionLabel: "查看完整计划",
      queue: [],
    };
  }

  function icon(name, className) {
    return `<i data-lucide="${escapeHtml(name)}" class="${escapeHtml(className || "")}" aria-hidden="true"></i>`;
  }

  function cardMarkup(priority, projectId) {
    const metrics = priority.metrics.length
      ? `<div class="next-action-metrics">${priority.metrics.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}</div>`
      : "";
    return `<article class="detail-card review-card next-action-card ${CARD_CLASS} tone-${priority.tone}" data-project-id="${projectId}" aria-labelledby="next-action-title-${projectId}" aria-live="polite">
      <header class="next-action-head">
        <div><span>PROJECT NEXT</span><h2 id="next-action-title-${projectId}">项目下一步</h2></div>
        <strong class="next-action-badge">${escapeHtml(priority.badge)}</strong>
      </header>
      <section class="next-action-focus">
        <div class="next-action-focus-label">${icon(priority.icon, "next-action-focus-icon")}<span>${escapeHtml(priority.eyebrow)}</span></div>
        <h3>${escapeHtml(priority.title)}</h3>
        <p>${escapeHtml(priority.description)}</p>
        <div class="next-action-owner"><span>负责人</span><strong>${escapeHtml(priority.owner)}</strong></div>
      </section>
      ${metrics}
      <button type="button" class="next-action-primary" data-next-action="${escapeHtml(priority.action)}"${priority.milestoneId ? ` data-milestone-id="${priority.milestoneId}"` : ""}>
        <span>${escapeHtml(priority.actionLabel)}</span>${icon("arrow-right", "next-action-button-icon")}
      </button>
      <details class="next-action-reason"><summary>查看判断依据${icon("chevron-down", "next-action-chevron")}</summary><p>${escapeHtml(priority.reason)}</p></details>
    </article>`;
  }

  function loadingMarkup(projectId) {
    return `<article class="detail-card review-card next-action-card ${CARD_CLASS} is-loading" data-project-id="${projectId}" role="status" aria-live="polite" aria-label="正在判断项目下一步">
      <header class="next-action-head"><div><span>PROJECT NEXT</span><h2>项目下一步</h2></div></header>
      <div class="next-action-loading">${icon("loader-circle", "next-action-loading-icon")}<div><strong>正在判断下一步</strong><span>同步排期、里程碑与当前权限</span></div></div>
    </article>`;
  }

  function hydrateIcons(scope) {
    if (!scope || !window.LegacyQualityIcons) return;
    window.LegacyQualityIcons.createIcons({
      icons: window.LegacyQualityIcons.icons,
      root: scope,
    });
  }

  function placeCard(page, card) {
    const basicCard = page.querySelector(".basic-card");
    const layout = page.querySelector(".detail-layout");
    if (!layout) return false;
    if (basicCard) basicCard.insertAdjacentElement("afterend", card);
    else layout.prepend(card);
    hydrateIcons(card);
    window.dispatchEvent(new Event("resize"));
    return true;
  }

  function findScheduleTarget(card, action, milestoneId) {
    const page = card.closest(".project-detail-page") || document;
    const schedule = page.querySelector(".legacy-project-schedule");
    if (!schedule) return null;
    if (action === "edit-schedule") return schedule.querySelector(".schedule-open-editor") || schedule;
    if (action === "activate-schedule") return schedule.querySelector(".schedule-activate") || schedule;
    if (action === "resume-schedule") return schedule.querySelector(".schedule-resume") || schedule;
    if (action === "milestone" && milestoneId) {
      return schedule.querySelector(`.schedule-milestone-row[data-milestone-id="${milestoneId}"]`) || schedule;
    }
    return schedule;
  }

  function revealTarget(target) {
    if (!target) return;
    if (target.matches("button")) {
      target.click();
      return;
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.classList.add("next-action-target");
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    const editable = target.querySelector('.milestone-progress-editor input[type="range"]');
    if (editable) editable.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove("next-action-target"), 1800);
  }

  function bindCard(card) {
    card.querySelector(".next-action-primary")?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      revealTarget(findScheduleTarget(card, button.dataset.nextAction, Number(button.dataset.milestoneId || 0)));
    });
  }

  function renderData(page, projectId, data) {
    const priority = selectPriority(data);
    const host = document.createElement("div");
    host.innerHTML = cardMarkup(priority, projectId);
    const card = host.firstElementChild;
    const existing = page.querySelector(`.${CARD_CLASS}`);
    if (existing) existing.replaceWith(card);
    else if (!placeCard(page, card)) return;
    hydrateIcons(card);
    bindCard(card);
    window.dispatchEvent(new Event("resize"));
  }

  function ensureCard() {
    const page = document.querySelector(".project-detail-page");
    if (!page) {
      activeProjectId = null;
      return;
    }
    const projectId = projectIdFromPage(page);
    if (!projectId) return;
    const existing = page.querySelector(`.${CARD_CLASS}`);
    if (existing && Number(existing.dataset.projectId) === projectId) return;
    existing?.remove();
    activeProjectId = projectId;
    const host = document.createElement("div");
    host.innerHTML = loadingMarkup(projectId);
    placeCard(page, host.firstElementChild);
  }

  function scheduleEnsure() {
    if (observerQueued) return;
    observerQueued = true;
    window.requestAnimationFrame(() => {
      observerQueued = false;
      ensureCard();
    });
  }

  window.addEventListener(SCHEDULE_EVENT, (event) => {
    const page = document.querySelector(".project-detail-page");
    const projectId = Number(event.detail?.projectId || 0);
    if (!page || !projectId || projectId !== projectIdFromPage(page)) return;
    activeProjectId = projectId;
    renderData(page, projectId, event.detail.data);
  });

  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", scheduleEnsure);
  scheduleEnsure();

  window.__legacyProjectNextAction = {
    selectPriority,
    projectIdFromPage,
    render: scheduleEnsure,
    get activeProjectId() { return activeProjectId; },
  };
})();
