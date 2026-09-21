(function () {
  "use strict";

  const USER_STORAGE_KEY = "ai_project_hub_user_id";
  let scheduled = false;
  const scheduleRequests = new Map();

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function currentProjectId() {
    const rows = document.querySelectorAll(".project-detail-page .basic-card .detail-dl > div");
    for (const row of rows) {
      const label = row.querySelector("dt");
      if (!label || !compactText(label.textContent).includes("项目编号")) continue;
      const match = compactText(row.querySelector("dd")?.textContent).match(/PRJ-(\d+)/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function headers() {
    const result = {};
    const userId = window.localStorage.getItem(USER_STORAGE_KEY);
    if (userId) result["X-User-Id"] = userId;
    return result;
  }

  async function loadSchedule() {
    const projectId = currentProjectId();
    if (!projectId) return null;
    if (!scheduleRequests.has(projectId)) {
      scheduleRequests.set(projectId, window.fetch(`/api/projects/${projectId}/schedule`, { headers: headers() })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => payload && payload.schedule)
        .catch(() => null));
    }
    return scheduleRequests.get(projectId);
  }

  async function loadExistingDates(container) {
    try {
      const schedule = await loadSchedule();
      if (!container.isConnected || !schedule) return;
      const start = container.querySelector('input[name="plan_start_date"]');
      const end = container.querySelector('input[name="plan_end_date"]');
      if (start && !start.value && schedule.current_start_date) {
        start.value = String(schedule.current_start_date).slice(0, 10);
        start.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (end && !end.value && schedule.current_end_date) {
        end.value = String(schedule.current_end_date).slice(0, 10);
        end.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (_) {
      // The edit dialog remains usable even if a historic schedule cannot be loaded.
    }
  }

  async function replaceScaleSummary() {
    const row = Array.from(document.querySelectorAll(".project-detail-page .basic-card .detail-dl > div"))
      .find((item) => compactText(item.querySelector("dt")?.textContent) === "预期规模");
    if (!row || row.dataset.projectPlanPeriodReady === "true") return;
    const schedule = await loadSchedule();
    if (!row.isConnected) return;
    const label = row.querySelector("dt");
    const value = row.querySelector("dd");
    if (!label || !value) return;
    label.textContent = "计划周期";
    value.textContent = schedule?.current_start_date && schedule?.current_end_date
      ? `${String(schedule.current_start_date).slice(0, 10)} 至 ${String(schedule.current_end_date).slice(0, 10)}`
      : "待补充";
    row.dataset.projectPlanPeriodReady = "true";
  }

  function mountPlanPeriodPicker(container) {
    const host = container.querySelector(".project-plan-period-picker-host");
    const start = container.querySelector('input[name="plan_start_date"]');
    const end = container.querySelector('input[name="plan_end_date"]');
    const calendar = window.LegacyAntdCalendar;
    if (!host || !start || !end || !calendar || typeof calendar.mountRangePeriod !== "function") return false;
    calendar.mountRangePeriod(host, start, end, {
      mode: "custom",
      showModeSelector: false,
      className: "project-plan-period-picker",
      ariaLabel: "项目计划周期",
      popupContainerSelector: ".edit-project-overlay",
    });
    return true;
  }

  function enhanceDialog(dialog) {
    if (dialog.dataset.projectPlanDatesReady === "true") return;
    const heading = compactText(dialog.querySelector(".modal-title h2")?.textContent);
    if (heading !== "编辑基本信息" && heading !== "编辑项目档案") return;
    const scaleLabel = Array.from(dialog.querySelectorAll("label")).find((label) => (
      label.querySelector('[name="expected_scale"]') && compactText(label.textContent).includes("预期规模")
    ));
    if (!scaleLabel) return;
    const scaleGrid = scaleLabel.parentElement;
    const form = dialog.querySelector("form");
    if (!scaleGrid || !form) return;

    const dateGrid = document.createElement("div");
    dateGrid.className = "form-grid project-plan-date-grid";
    dateGrid.innerHTML = `
      <div class="project-plan-period-picker-host">
        <input type="date" name="plan_start_date" aria-label="计划开始日期" />
        <input type="date" name="plan_end_date" aria-label="计划结束日期" />
      </div>`;
    scaleLabel.remove();
    scaleGrid.insertAdjacentElement("afterend", dateGrid);
    dialog.dataset.projectPlanDatesReady = "true";

    form.addEventListener("submit", () => {
      const projectId = currentProjectId();
      if (projectId) scheduleRequests.delete(projectId);
      const emptyInputs = Array.from(dateGrid.querySelectorAll('input[type="date"]')).filter(
        (input) => !input.value,
      );
      emptyInputs.forEach((input) => { input.disabled = true; });
      window.setTimeout(() => emptyInputs.forEach((input) => { input.disabled = false; }), 0);
    }, true);
    if (!mountPlanPeriodPicker(dateGrid) && window.LegacyAntdCalendar) {
      window.LegacyAntdCalendar.scan(dateGrid);
      window.setTimeout(() => mountPlanPeriodPicker(dateGrid), 0);
    }
    loadExistingDates(dateGrid);
  }

  function scan() {
    scheduled = false;
    document.querySelectorAll(".edit-project-overlay .edit-modal").forEach(enhanceDialog);
    replaceScaleSummary();
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(scan);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scheduleScan();
})();
