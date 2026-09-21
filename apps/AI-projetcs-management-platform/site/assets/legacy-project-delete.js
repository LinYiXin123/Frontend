(function () {
  var BUTTON_CLASS = "legacy-project-delete-button";
  var ROW_CLASS = "legacy-project-delete-enabled";
  var TOAST_CLASS = "legacy-project-delete-toast";
  var currentUserRole = null;
  var deletedProjectIds = new Set();
  var scheduled = false;

  function projectIdForRow(row) {
    if (!row) return null;
    var fiberKey = Object.keys(row).find(function (key) {
      return key.indexOf("__reactFiber$") === 0;
    });
    var fiber = fiberKey ? row[fiberKey] : null;
    var depth = 0;
    while (fiber && depth < 4) {
      var projectId = Number(fiber.key);
      if (Number.isInteger(projectId) && projectId > 0) return projectId;
      fiber = fiber.return;
      depth += 1;
    }
    return null;
  }

  function projectNameForRow(row) {
    var heading = row && row.querySelector(".project-title h3");
    return heading ? heading.textContent.trim() : "该项目";
  }

  function showToast(message, tone) {
    var toast = document.querySelector("." + TOAST_CLASS);
    if (!toast) {
      toast = document.createElement("div");
      toast.className = TOAST_CLASS;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.classList.toggle("error", tone === "error");
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toast._hideTimer);
    toast._hideTimer = window.setTimeout(function () {
      toast.classList.remove("visible");
    }, 3200);
  }

  function confirmProjectDeletion(projectName, triggerButton) {
    return new Promise(function (resolve) {
      var previousOverflow = document.body.style.overflow;
      var overlay = document.createElement("div");
      var modal = document.createElement("div");
      var closeButton = document.createElement("button");
      var intro = document.createElement("div");
      var iconBadge = document.createElement("span");
      var titleBlock = document.createElement("div");
      var eyebrow = document.createElement("span");
      var title = document.createElement("h2");
      var subtitle = document.createElement("p");
      var content = document.createElement("div");
      var projectCard = document.createElement("div");
      var projectLabel = document.createElement("span");
      var projectValue = document.createElement("strong");
      var notice = document.createElement("div");
      var noticeIcon = document.createElement("span");
      var noticeText = document.createElement("p");
      var actions = document.createElement("div");
      var actionNote = document.createElement("span");
      var actionButtons = document.createElement("div");
      var cancelButton = document.createElement("button");
      var confirmButton = document.createElement("button");
      var settled = false;

      overlay.className = "overlay legacy-project-delete-overlay";
      overlay.setAttribute("role", "presentation");

      modal.className = "modal legacy-project-delete-modal";
      modal.setAttribute("role", "alertdialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "legacy-project-delete-title");
      modal.setAttribute("aria-describedby", "legacy-project-delete-description");

      closeButton.type = "button";
      closeButton.className = "close";
      closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>';
      closeButton.setAttribute("aria-label", "关闭移除确认弹窗");

      intro.className = "legacy-project-delete-intro";
      iconBadge.className = "legacy-project-delete-icon-badge";
      iconBadge.setAttribute("aria-hidden", "true");
      iconBadge.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>';

      titleBlock.className = "legacy-project-delete-title";
      eyebrow.className = "legacy-project-delete-eyebrow";
      eyebrow.textContent = "项目治理 · 危险操作";
      title.id = "legacy-project-delete-title";
      title.textContent = "确认移除项目";
      subtitle.id = "legacy-project-delete-description";
      subtitle.textContent = "请核对项目名称，确认后项目将移入已归档项目。";
      titleBlock.appendChild(eyebrow);
      titleBlock.appendChild(title);
      titleBlock.appendChild(subtitle);
      intro.appendChild(iconBadge);
      intro.appendChild(titleBlock);

      content.className = "legacy-project-delete-content";
      projectCard.className = "legacy-project-delete-project";
      projectLabel.textContent = "即将移除";
      projectValue.textContent = projectName;
      projectCard.appendChild(projectLabel);
      projectCard.appendChild(projectValue);

      notice.className = "legacy-project-delete-notice";
      noticeIcon.setAttribute("aria-hidden", "true");
      noticeIcon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></svg>';
      noticeText.textContent = "移除后，该项目不会继续出现在当前项目列表中。";
      notice.appendChild(noticeIcon);
      notice.appendChild(noticeText);
      content.appendChild(projectCard);
      content.appendChild(notice);

      actions.className = "form-actions legacy-project-delete-actions";
      actionNote.className = "legacy-project-delete-action-note";
      actionNote.textContent = "可在已归档项目中查看";
      actionButtons.className = "legacy-project-delete-action-buttons";
      cancelButton.type = "button";
      cancelButton.className = "ghost";
      cancelButton.textContent = "取消";
      confirmButton.type = "button";
      confirmButton.className = "danger-ghost legacy-project-delete-confirm";
      confirmButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /></svg><span>确认移除</span>';
      actionButtons.appendChild(cancelButton);
      actionButtons.appendChild(confirmButton);
      actions.appendChild(actionNote);
      actions.appendChild(actionButtons);

      modal.appendChild(closeButton);
      modal.appendChild(intro);
      modal.appendChild(content);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      function finish(reason) {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", handleKeydown);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        if (triggerButton && triggerButton.isConnected) triggerButton.focus();
        resolve(reason);
      }

      function handleKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.key === "Tab") {
          var focusable = [closeButton, cancelButton, confirmButton];
          var currentIndex = focusable.indexOf(document.activeElement);
          var nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
            : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
          event.preventDefault();
          focusable[nextIndex].focus();
        }
      }

      overlay.addEventListener("mousedown", function (event) {
        if (event.target === overlay) finish(null);
      });
      closeButton.addEventListener("click", function () { finish(null); });
      cancelButton.addEventListener("click", function () { finish(null); });
      confirmButton.addEventListener("click", function () {
        finish("管理员确认移除项目");
      });
      document.addEventListener("keydown", handleKeydown);
      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";
      window.requestAnimationFrame(function () { cancelButton.focus(); });
    });
  }

  async function deleteProject(row, button) {
    var projectId = projectIdForRow(row);
    var projectName = projectNameForRow(row);
    if (!projectId) {
      showToast("无法识别项目，请刷新页面后重试", "error");
      return;
    }

    var reason = await confirmProjectDeletion(projectName, button);
    if (!reason) return;

    button.disabled = true;
    button.textContent = "处理中";
    try {
      var response = await window.fetch("/api/projects/" + projectId, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason }),
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload.detail || ("操作失败（" + response.status + "）"));
      }
      showToast("项目“" + projectName + "”已移入回收站");
      window.setTimeout(function () {
        window.location.reload();
      }, 650);
    } catch (error) {
      button.disabled = false;
      button.textContent = "移除";
      showToast(error && error.message ? error.message : "操作失败，请稍后重试", "error");
    }
  }

  function enhanceRows() {
    scheduled = false;
    var rows = document.querySelectorAll(".project-list .project-row");
    Array.prototype.forEach.call(rows, function (row) {
      var existing = row.querySelector(":scope > ." + BUTTON_CLASS);
      var projectId = projectIdForRow(row);
      if (currentUserRole !== "admin" || deletedProjectIds.has(projectId)) {
        row.classList.remove(ROW_CLASS);
        if (existing) existing.remove();
        return;
      }
      if (existing || !projectId) return;

      var projectName = projectNameForRow(row);
      var button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.textContent = "移除";
      button.title = "移入回收站";
      button.setAttribute("aria-label", "将项目移入回收站 " + projectName);
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        deleteProject(row, button);
      });
      row.classList.add(ROW_CLASS);
      row.appendChild(button);
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhanceRows);
  }

  function loadCurrentUser() {
    window.fetch("/api/me", { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("current user unavailable");
        return response.json();
      })
      .then(function (user) {
        currentUserRole = user && user.role;
        if (currentUserRole !== "admin") return [];
        return window.fetch("/api/projects?status=archived", { credentials: "same-origin" })
          .then(function (response) {
            if (!response.ok) throw new Error("archived projects unavailable");
            return response.json();
          });
      })
      .then(function (archivedProjects) {
        deletedProjectIds = new Set(
          (archivedProjects || [])
            .filter(function (project) { return Boolean(project && project.deleted_at); })
            .map(function (project) { return Number(project.id); })
        );
        scheduleEnhance();
      })
      .catch(function () {
        currentUserRole = null;
        deletedProjectIds = new Set();
        scheduleEnhance();
      });
  }

  var observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadCurrentUser();
      scheduleEnhance();
    }, { once: true });
  } else {
    loadCurrentUser();
    scheduleEnhance();
  }
})();
