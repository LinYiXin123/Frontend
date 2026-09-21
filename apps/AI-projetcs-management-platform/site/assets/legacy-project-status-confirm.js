(function () {
  "use strict";

  var activeDialog = null;

  function statusIcon(name, className) {
    var icon = document.createElement("i");
    icon.className = "legacy-project-status-icon" + (className ? " " + className : "");
    icon.setAttribute("data-lucide", name);
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function hydrateStatusIcons() {
    var runtime = window.LegacyQualityIcons;
    if (!runtime || typeof runtime.createIcons !== "function") return;
    runtime.createIcons({
      icons: runtime.icons,
      attrs: { width: 18, height: 18, "stroke-width": 1.8 },
    });
  }

  function dialogCopy(action, projectName) {
    if (action === "restore") {
      return {
        eyebrow: "项目生命周期",
        icon: "ArchiveRestore",
        title: "恢复项目",
        subtitle: "项目“" + projectName + "”",
        currentState: "已归档",
        nextState: "开发中",
        impactTitle: "恢复后重新纳入开发中项目",
        impactText: "平台状态将变为开发中，并重新出现在项目看板和相关统计中。",
        checklist: [
          "重新纳入全部项目和相关统计",
          "完整保留活动、预警与生命周期记录",
          "本次恢复操作将写入项目活动记录",
        ],
        note: "恢复只调整项目运行状态，不会删除或重建原有关联数据。",
        confirmText: "恢复项目",
      };
    }
    return {
      eyebrow: "项目生命周期",
      icon: "Archive",
      title: "归档项目",
      subtitle: "项目“" + projectName + "”",
      currentState: "开发中",
      nextState: "已归档",
      impactTitle: "归档不会删除项目数据",
      impactText: "项目将从进行中看板隐藏，活动和预警记录都会保留，之后可在已归档项目中恢复。",
      checklist: [
        "从进行中项目与相关统计中移出",
        "完整保留活动、预警与生命周期记录",
        "本次归档操作将写入项目活动记录",
      ],
      note: "归档不是删除，后续仍可在已归档项目中查看和恢复。",
      confirmText: "确认归档",
    };
  }

  window.legacyConfirmProjectStatus = function (options) {
    options = options || {};
    if (activeDialog) return Promise.resolve(false);

    var action = options.action === "restore" ? "restore" : "archive";
    var projectName = String(options.projectName || "当前项目").trim() || "当前项目";
    var triggerButton = options.triggerButton;
    var copy = dialogCopy(action, projectName);

    return new Promise(function (resolve) {
      var previousOverflow = document.body.style.overflow;
      var previousFocus = triggerButton && triggerButton.focus ? triggerButton : document.activeElement;
      var overlay = document.createElement("div");
      var modal = document.createElement("div");
      var closeButton = document.createElement("button");
      var intro = document.createElement("div");
      var iconBadge = document.createElement("span");
      var titleBlock = document.createElement("div");
      var eyebrow = document.createElement("span");
      var title = document.createElement("h2");
      var subtitle = document.createElement("p");
      var transition = document.createElement("div");
      var currentState = document.createElement("span");
      var nextState = document.createElement("span");
      var impact = document.createElement("div");
      var impactTitle = document.createElement("strong");
      var impactText = document.createElement("p");
      var checklist = document.createElement("ul");
      var note = document.createElement("div");
      var reasonField = null;
      var reasonInput = null;
      var reasonHint = null;
      var actions = document.createElement("div");
      var cancelButton = document.createElement("button");
      var confirmButton = document.createElement("button");
      var settled = false;

      overlay.className = "overlay legacy-project-status-overlay";
      overlay.setAttribute("role", "presentation");
      modal.className = "modal legacy-project-status-modal legacy-project-status-" + action;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "legacy-project-status-title");
      modal.setAttribute("aria-describedby", "legacy-project-status-description");

      closeButton.type = "button";
      closeButton.className = "close";
      closeButton.textContent = "\u00d7";
      closeButton.setAttribute("aria-label", "关闭" + copy.title + "弹窗");

      intro.className = "legacy-project-status-intro";
      iconBadge.className = "legacy-project-status-icon-badge";
      iconBadge.appendChild(statusIcon(copy.icon));
      titleBlock.className = "modal-title legacy-project-status-title";
      eyebrow.className = "legacy-project-status-eyebrow";
      eyebrow.textContent = copy.eyebrow;
      title.id = "legacy-project-status-title";
      title.textContent = copy.title;
      subtitle.textContent = copy.subtitle;
      titleBlock.appendChild(eyebrow);
      titleBlock.appendChild(title);
      titleBlock.appendChild(subtitle);
      intro.appendChild(iconBadge);
      intro.appendChild(titleBlock);

      transition.className = "legacy-project-status-transition";
      currentState.innerHTML = "<small>当前状态</small><strong>" + copy.currentState + "</strong>";
      nextState.innerHTML = "<small>操作后</small><strong>" + copy.nextState + "</strong>";
      transition.appendChild(currentState);
      transition.appendChild(statusIcon("ArrowRight", "is-transition-arrow"));
      transition.appendChild(nextState);

      impact.className = "legacy-project-status-impact";
      impactTitle.textContent = copy.impactTitle;
      impactText.id = "legacy-project-status-description";
      impactText.textContent = copy.impactText;
      impact.appendChild(impactTitle);
      impact.appendChild(impactText);

      checklist.className = "legacy-project-status-checklist";
      copy.checklist.forEach(function (item) {
        var row = document.createElement("li");
        var label = document.createElement("span");
        label.textContent = item;
        row.appendChild(statusIcon("CheckCircle2"));
        row.appendChild(label);
        checklist.appendChild(row);
      });

      note.className = "legacy-project-status-note";
      note.appendChild(statusIcon("Database"));
      var noteText = document.createElement("span");
      noteText.textContent = copy.note;
      note.appendChild(noteText);

      if (action === "archive") {
        reasonField = document.createElement("label");
        reasonInput = document.createElement("textarea");
        reasonHint = document.createElement("small");
        reasonField.className = "legacy-project-status-reason";
        reasonField.appendChild(document.createTextNode("归档原因"));
        reasonInput.rows = 3;
        reasonInput.maxLength = 500;
        reasonInput.placeholder = "说明项目为何归档，便于后续恢复判断（至少 2 个字符）";
        reasonInput.setAttribute("aria-describedby", "legacy-project-status-reason-hint");
        reasonHint.id = "legacy-project-status-reason-hint";
        reasonHint.textContent = "将写入该项目的生命周期活动记录，可在已归档项目中补充或修订。";
        reasonField.appendChild(reasonInput);
        reasonField.appendChild(reasonHint);
      }

      actions.className = "form-actions legacy-project-status-actions";
      cancelButton.type = "button";
      cancelButton.className = "ghost";
      cancelButton.textContent = "取消";
      confirmButton.type = "button";
      confirmButton.className = "legacy-project-status-confirm " + (action === "restore" ? "primary" : "danger-ghost");
      confirmButton.textContent = copy.confirmText;
      if (reasonInput) confirmButton.disabled = true;
      actions.appendChild(cancelButton);
      actions.appendChild(confirmButton);

      modal.appendChild(closeButton);
      modal.appendChild(intro);
      modal.appendChild(transition);
      modal.appendChild(impact);
      modal.appendChild(checklist);
      modal.appendChild(note);
      if (reasonField) modal.appendChild(reasonField);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      function finish(confirmed) {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", handleKeydown);
        overlay.remove();
        activeDialog = null;
        document.body.style.overflow = previousOverflow;
        if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
        resolve(confirmed);
      }

      function handleKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
          return;
        }
        if (event.key !== "Tab") return;
        var focusable = [closeButton].concat(reasonInput ? [reasonInput] : [], [cancelButton, confirmButton]);
        var currentIndex = focusable.indexOf(document.activeElement);
        var nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
          : (currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1);
        event.preventDefault();
        focusable[nextIndex].focus();
      }

      overlay.addEventListener("mousedown", function (event) {
        if (event.target === overlay) finish(false);
      });
      closeButton.addEventListener("click", function () { finish(false); });
      cancelButton.addEventListener("click", function () { finish(false); });
      if (reasonInput) {
        reasonInput.addEventListener("input", function () {
          var valid = reasonInput.value.trim().length >= 2;
          confirmButton.disabled = !valid;
          reasonField.classList.toggle("is-invalid", reasonInput.value.length > 0 && !valid);
        });
      }
      confirmButton.addEventListener("click", function () {
        if (reasonInput) {
          var reason = reasonInput.value.trim();
          if (reason.length < 2) {
            reasonField.classList.add("is-invalid");
            reasonInput.focus();
            return;
          }
          window.__legacyPendingArchiveReason = reason;
        }
        finish(true);
      });
      document.addEventListener("keydown", handleKeydown);

      activeDialog = overlay;
      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";
      hydrateStatusIcons();
      window.requestAnimationFrame(function () { (reasonInput || cancelButton).focus(); });
    });
  };

  window.legacyShowReleaseReadiness = function (readiness) {
    readiness = readiness || {};
    if (activeDialog) return Promise.resolve();

    return new Promise(function (resolve) {
      var previousOverflow = document.body.style.overflow;
      var previousFocus = document.activeElement;
      var overlay = document.createElement("div");
      var modal = document.createElement("div");
      var closeButton = document.createElement("button");
      var hero = document.createElement("div");
      var iconBadge = document.createElement("span");
      var titleBlock = document.createElement("div");
      var eyebrow = document.createElement("span");
      var title = document.createElement("h2");
      var subtitle = document.createElement("p");
      var summary = document.createElement("div");
      var summaryText = document.createElement("strong");
      var progress = document.createElement("div");
      var progressBar = document.createElement("i");
      var list = document.createElement("div");
      var actions = document.createElement("div");
      var acknowledgeButton = document.createElement("button");
      var settled = false;
      var requirements = Array.isArray(readiness.requirements) ? readiness.requirements : [];
      var passedCount = requirements.filter(function (requirement) { return requirement.passed; }).length;
      var blockedCount = Math.max(0, requirements.length - passedCount);
      var completion = requirements.length ? Math.round((passedCount / requirements.length) * 100) : 100;

      overlay.className = "overlay legacy-project-status-overlay";
      modal.className = "modal legacy-project-status-modal legacy-release-readiness-modal " + (readiness.ready ? "is-ready" : "is-blocked");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "legacy-release-readiness-title");
      modal.setAttribute("aria-describedby", "legacy-release-readiness-description");

      closeButton.type = "button";
      closeButton.className = "close";
      closeButton.appendChild(statusIcon("X"));
      closeButton.setAttribute("aria-label", "关闭上线检查结果");

      hero.className = "legacy-release-readiness-hero";
      iconBadge.className = "legacy-release-readiness-icon-badge";
      iconBadge.appendChild(statusIcon(readiness.ready ? "ShieldCheck" : "ShieldAlert"));
      titleBlock.className = "modal-title legacy-project-status-title";
      eyebrow.className = "legacy-release-readiness-eyebrow";
      eyebrow.appendChild(statusIcon("Sparkles"));
      eyebrow.appendChild(document.createTextNode("上线前自动检查"));
      title.id = "legacy-release-readiness-title";
      title.textContent = readiness.ready ? "已具备上线条件" : "还有条件未满足";
      subtitle.id = "legacy-release-readiness-description";
      subtitle.textContent = readiness.project_name
        ? "项目“" + readiness.project_name + "”的检查结果"
        : "系统已按当前真实数据完成检查";
      titleBlock.appendChild(eyebrow);
      titleBlock.appendChild(title);
      titleBlock.appendChild(subtitle);
      hero.appendChild(iconBadge);
      hero.appendChild(titleBlock);

      summary.className = "legacy-release-readiness-summary";
      summaryText.textContent = readiness.ready ? "全部 " + requirements.length + " 项检查已通过" : blockedCount + " 项待处理 · " + passedCount + " 项已通过";
      progress.className = "legacy-release-readiness-progress";
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", "上线检查完成度");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute("aria-valuenow", String(completion));
      progressBar.style.width = completion + "%";
      progress.appendChild(progressBar);
      summary.appendChild(summaryText);
      summary.appendChild(progress);

      list.className = "legacy-release-readiness-list";
      requirements.forEach(function (requirement, index) {
        var row = document.createElement("div");
        var marker = document.createElement("span");
        var content = document.createElement("div");
        var heading = document.createElement("div");
        var label = document.createElement("strong");
        var state = document.createElement("small");
        var message = document.createElement("p");
        row.className = "legacy-release-readiness-row " + (requirement.passed ? "passed" : "blocked");
        marker.className = "legacy-release-readiness-marker";
        marker.appendChild(statusIcon(requirement.passed ? "CheckCircle2" : "CircleAlert"));
        label.textContent = requirement.label || "检查项";
        state.textContent = requirement.passed ? "已通过" : "待处理";
        message.textContent = requirement.message || (requirement.passed ? "已通过" : "待完成");
        heading.appendChild(label);
        heading.appendChild(state);
        content.appendChild(heading);
        content.appendChild(message);
        row.appendChild(marker);
        row.appendChild(content);
        row.setAttribute("aria-label", "检查项 " + (index + 1) + "：" + label.textContent + "，" + state.textContent);
        list.appendChild(row);
      });

      actions.className = "form-actions legacy-project-status-actions";
      acknowledgeButton.type = "button";
      acknowledgeButton.className = "primary";
      acknowledgeButton.appendChild(statusIcon(readiness.ready ? "CheckCircle2" : "ArrowLeft"));
      acknowledgeButton.appendChild(document.createTextNode(readiness.ready ? "完成检查" : "返回项目继续完善"));
      actions.appendChild(acknowledgeButton);

      modal.appendChild(closeButton);
      modal.appendChild(hero);
      modal.appendChild(summary);
      modal.appendChild(list);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      function finish() {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", handleKeydown);
        overlay.remove();
        activeDialog = null;
        document.body.style.overflow = previousOverflow;
        if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
        resolve();
      }

      function handleKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish();
        }
      }

      overlay.addEventListener("mousedown", function (event) {
        if (event.target === overlay) finish();
      });
      closeButton.addEventListener("click", finish);
      acknowledgeButton.addEventListener("click", finish);
      document.addEventListener("keydown", handleKeydown);

      activeDialog = overlay;
      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";
      hydrateStatusIcons();
      window.requestAnimationFrame(function () { acknowledgeButton.focus(); });
    });
  };

  if (!window.__legacyReleaseReadinessFetchInstalled) {
    window.__legacyReleaseReadinessFetchInstalled = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      var requestUrl = typeof input === "string" ? input : input && input.url;
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var statusMatch = String(requestUrl || "").match(/\/api\/projects\/(\d+)\/status(?:\?|$)/);
      var payload = null;
      if (statusMatch && method === "POST" && init && typeof init.body === "string") {
        try {
          payload = JSON.parse(init.body);
        } catch (_error) {
          payload = null;
        }
      }
      if (statusMatch && method === "POST" && payload && payload.status === "archived") {
        var archiveReason = String(window.__legacyPendingArchiveReason || "").trim();
        if (archiveReason) {
          payload.reason = archiveReason;
          init = Object.assign({}, init, { body: JSON.stringify(payload) });
          window.__legacyPendingArchiveReason = "";
        }
      }
      if (!statusMatch || !payload || payload.status !== "online") {
        return nativeFetch(input, init);
      }

      try {
        var readinessResponse = await nativeFetch(
          "/api/projects/" + statusMatch[1] + "/release-readiness",
          {
            method: "GET",
            headers: init.headers,
            credentials: init.credentials,
          },
        );
        if (readinessResponse.ok) {
          var readiness = await readinessResponse.json();
          if (!readiness.ready) {
            await window.legacyShowReleaseReadiness(readiness);
            return new Response(
              JSON.stringify({ detail: "上线门禁未通过，请按检查结果补齐后再试" }),
              { status: 409, headers: { "Content-Type": "application/json" } },
            );
          }
        }
      } catch (_error) {
        // The backend status endpoint remains the authority if the preview cannot load.
      }
      return nativeFetch(input, init);
    };
  }

})();
