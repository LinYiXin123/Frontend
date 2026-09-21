(function () {
  "use strict";

  var scheduled = false;

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isProjectProfileDialog(dialog) {
    var heading = compactText(dialog.querySelector(".modal-title h2")?.textContent);
    return heading === "编辑基本信息" || heading === "编辑项目档案";
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function enhance(dialog) {
    if (!isProjectProfileDialog(dialog)) return;

    dialog.classList.add("toc-project-profile-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    var title = dialog.querySelector(".modal-title");
    var heading = title?.querySelector("h2");
    var form = dialog.querySelector("form");
    if (!title || !heading || !form) return;

    if (!heading.id) heading.id = "toc-project-profile-title";
    dialog.setAttribute("aria-labelledby", heading.id);
    form.classList.add("toc-project-profile-form");

    var grid = form.querySelector(".form-grid");
    if (grid && !form.querySelector(".toc-profile-form-intro")) {
      var intro = element("div", "toc-profile-form-intro");
      intro.setAttribute("role", "note");
      var index = element("span", "toc-profile-form-index", "01");
      index.setAttribute("aria-hidden", "true");
      var copy = element("div", "toc-profile-form-copy");
      copy.appendChild(element("strong", "", "项目档案"));
      copy.appendChild(element("small", "", "维护基础协作信息；带 * 的字段为必填项。"));
      intro.appendChild(index);
      intro.appendChild(copy);
      grid.before(intro);
    }

    Array.from(form.querySelectorAll(".form-grid > label")).forEach(function (label) {
      label.classList.add("toc-profile-field");
    });
    form.querySelector(".project-plan-date-grid")?.classList.add("toc-profile-period-field");

    var actions = form.querySelector(".form-actions");
    if (actions) {
      actions.classList.add("toc-profile-actions");
      if (!actions.querySelector(".toc-profile-save-note")) {
        var note = element("span", "toc-profile-save-note", "保存后同步项目档案");
        note.setAttribute("aria-hidden", "true");
        actions.prepend(note);
      }
    }
  }

  function scan() {
    scheduled = false;
    document.querySelectorAll(".overlay.nested-overlay .modal.edit-modal").forEach(enhance);
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(scan);
  }

  document.addEventListener("DOMContentLoaded", scheduleScan);
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scheduleScan();
})();
