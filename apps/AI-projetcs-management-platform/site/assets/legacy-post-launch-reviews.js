(function () {
  "use strict";

  var USER_STORAGE_KEY = "ai_project_hub_user_id";
  var mountedClass = "post-launch-review-mounted";
  var state = { loading: true, error: "", data: null, activeReviewId: null, outcome: "healthy", returnFocus: null };
  var scheduled = false;
  var loadingPromise = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function requestHeaders() {
    var headers = { "Content-Type": "application/json" };
    var userId = window.localStorage.getItem(USER_STORAGE_KEY);
    if (userId) headers["X-User-Id"] = userId;
    return headers;
  }

  async function api(path, options) {
    var response = await window.fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { ...requestHeaders(), ...((options && options.headers) || {}) }
    });
    var body = await response.json().catch(function () { return null; });
    if (!response.ok) throw new Error((body && body.detail) || "请求失败，请稍后重试");
    return body;
  }

  function formatDate(value, includeTime) {
    if (!value) return "待生成";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, includeTime ? 16 : 10);
    return date.toLocaleString("zh-CN", includeTime
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
      : { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function dateInputValue(date) {
    var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function healthLabel(level) {
    return ({ critical: "需立即处理", attention: "需补充证据", healthy: "运行正常", pending: "等待首期" }[level] || "待复核");
  }

  function outcomeLabel(value) {
    return ({ healthy: "运行正常", follow_up: "需要跟进", optimization: "进入优化" }[value] || "待确认");
  }

  function targetCards() {
    return Array.from(document.querySelectorAll(".alert-side .side-card")).filter(function (card) {
      if (card.classList.contains(mountedClass)) return true;
      var heading = card.querySelector("h2,h3,h4,.side-card-head");
      return heading && compactText(heading.textContent).includes("已上线项目");
    });
  }

  function loadingMarkup() {
    return '<div class="post-launch-review-root post-launch-review-loading" aria-busy="true">' +
      '<div class="post-launch-review-head"><div><span>上线后闭环</span><h3>5 日上线复盘</h3></div><b>真实数据</b></div>' +
      '<div class="post-launch-review-skeleton"><i></i><i></i><i></i></div>' +
      '<p>正在读取复盘记录与运行态证据…</p></div>';
  }

  function errorMarkup() {
    return '<div class="post-launch-review-root post-launch-review-error">' +
      '<div class="post-launch-review-head"><div><span>上线后闭环</span><h3>5 日上线复盘</h3></div><b>读取失败</b></div>' +
      '<p>' + escapeHtml(state.error || "复盘服务暂不可用") + '</p>' +
      '<button type="button" data-post-launch-retry>重新读取</button></div>';
  }

  function projectRowMarkup(project) {
    var isDue = Boolean(project.due_review_id);
    var dueLabel = project.overdue_days > 0
      ? "第 " + escapeHtml(project.due_cycle_number) + " 期 · 已逾期 " + escapeHtml(project.overdue_days) + " 天"
      : "第 " + escapeHtml(project.due_cycle_number) + " 期 · 已到期";
    return '<button type="button" class="post-launch-review-row ' + (isDue ? "is-due" : "") + '" ' +
      (isDue ? 'data-post-launch-open="' + project.due_review_id + '"' : 'data-post-launch-overview') + '>' +
      '<span><strong>' + escapeHtml(project.project_name) + '</strong><small>' +
      (isDue ? dueLabel : "下次 " + escapeHtml(formatDate(project.next_due_at, false))) +
      '</small></span><em class="tone-' + escapeHtml(project.health_level) + '">' + escapeHtml(healthLabel(project.health_level)) + '</em></button>';
  }

  function cardMarkup() {
    if (state.loading) return loadingMarkup();
    if (state.error || !state.data) return errorMarkup();
    var summary = state.data.summary || {};
    var projects = state.data.projects || [];
    var visibleProjects = projects.slice(0, 2);
    var list = visibleProjects.map(projectRowMarkup).join("");
    if (!projects.length) {
      list = '<div class="post-launch-review-empty"><strong>当前没有已上线项目</strong>' +
        '<span>项目填写正式地址并切换“已上线”后，系统从上线时间起每 5 天自动生成一次复盘。</span></div>';
    }
    return '<div class="post-launch-review-root">' +
      '<div class="post-launch-review-head"><div><span>上线后闭环</span><h3>5 日上线复盘</h3></div>' +
      '<b class="' + (summary.due_reviews ? "has-due" : "") + '">' + (summary.due_reviews ? summary.due_reviews + " 项待处理" : "自动运行") + '</b></div>' +
      '<p class="post-launch-review-intro">每 5 天固化 GitLab 活跃、运行态与处理结论；全程可追溯。</p>' +
      '<div class="post-launch-review-metrics">' +
        '<span><b>' + escapeHtml(summary.online_projects || 0) + '</b><small>已上线</small></span>' +
        '<span><b>' + escapeHtml(summary.due_reviews || 0) + '</b><small>待复盘</small></span>' +
        '<span><b>' + escapeHtml(summary.completed_last_30_days || 0) + '</b><small>近 30 天完成</small></span>' +
      '</div><div class="post-launch-review-list">' + list + '</div>' +
      '<div class="post-launch-review-foot"><span data-tone="unconfigured">访问量源未配置，不生成模拟数据</span>' +
      '<button type="button" data-post-launch-overview>查看复盘台账</button></div></div>';
  }

  function renderCards() {
    var renderKey = JSON.stringify({ loading: state.loading, error: state.error, data: state.data });
    targetCards().forEach(function (card) {
      card.classList.add(mountedClass);
      var root = card.querySelector(":scope > .post-launch-review-root");
      if (!root) {
        root = document.createElement("div");
        root.className = "post-launch-review-root";
        card.appendChild(root);
      }
      if (root.dataset.postLaunchRenderKey === renderKey) return;
      var wrapper = document.createElement("div");
      wrapper.innerHTML = cardMarkup();
      var next = wrapper.firstElementChild;
      if (next) {
        next.dataset.postLaunchRenderKey = renderKey;
        root.replaceWith(next);
      }
    });
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      renderCards();
    });
  }

  async function loadData(options) {
    if (loadingPromise) return loadingPromise;
    var hadData = Boolean(state.data);
    state.loading = !hadData;
    state.error = "";
    if (!hadData) scheduleRender();
    loadingPromise = (async function () {
      if (options && options.evaluate) {
        await api("/api/post-launch-reviews/evaluate", { method: "POST", body: "{}" }).catch(function (error) {
          if (!String(error.message || "").includes("管理员")) console.warn("post-launch review evaluation:", error);
        });
      }
      state.data = await api("/api/post-launch-reviews?status=all&limit=60");
      state.loading = false;
      renderCards();
      if (document.querySelector(".post-launch-review-dialog")) renderDialog();
    })().catch(function (error) {
      state.loading = false;
      if (hadData) {
        console.warn("post-launch review refresh:", error);
      } else {
        state.error = error.message || "复盘服务暂不可用";
        renderCards();
      }
    }).finally(function () {
      loadingPromise = null;
    });
    return loadingPromise;
  }

  function metricMarkup(label, value) {
    return '<span><small>' + escapeHtml(label) + '</small><b>' + escapeHtml(value) + '</b></span>';
  }

  function reviewDetailMarkup(review) {
    var snapshot = review.snapshot || {};
    var gitlab = snapshot.gitlab || {};
    var runtime = snapshot.runtime || {};
    var analytics = snapshot.analytics || {};
    var canComplete = review.status === "due" && review.can_complete;
    var needsAction = state.outcome === "follow_up" || state.outcome === "optimization";
    var actionOwners = review.action_owner_options || [];
    var defaultActionOwner = actionOwners.some(function (user) { return user.name === review.assignee_name; })
      ? review.assignee_name
      : (actionOwners[0] && actionOwners[0].name) || "";
    var actionOwnerOptions = actionOwners.length
      ? actionOwners.map(function (user) {
          return '<option value="' + escapeHtml(user.name) + '" ' + (user.name === defaultActionOwner ? "selected" : "") + '>' + escapeHtml(user.name) + '</option>';
        }).join("")
      : '<option value="">暂无有效项目成员</option>';
    var today = dateInputValue(new Date());
    var defaultDue = dateInputValue(new Date(Date.now() + 3 * 86400000));
    var actionFields = needsAction ? '<div class="post-launch-review-action-fields" aria-label="后续动作字段">' +
      '<label><span>下一步动作</span><input name="action_summary" maxlength="500" required placeholder="例如：补齐正式环境健康检查并验证告警恢复"></label>' +
      '<label><span>动作负责人</span><select name="action_owner_name" required>' + actionOwnerOptions + '</select></label>' +
      '<label><span>计划完成日期</span><input type="date" name="action_due_date" min="' + today + '" value="' + defaultDue + '" required></label>' +
      '</div>' : '';
    var completeForm = canComplete ? '<form class="post-launch-review-form" data-post-launch-complete="' + review.id + '">' +
      '<fieldset><legend>本轮结论</legend><div class="post-launch-outcomes">' +
      [
        ["healthy", "运行正常"], ["follow_up", "需要跟进"], ["optimization", "进入优化"]
      ].map(function (option) {
        return '<button type="button" data-post-launch-outcome="' + option[0] + '" class="' + (state.outcome === option[0] ? "selected" : "") + '" aria-pressed="' + String(state.outcome === option[0]) + '">' + option[1] + '</button>';
      }).join("") + '</div></fieldset>' +
      '<label><span>本期复盘结论</span><textarea name="note" minlength="3" maxlength="1000" required placeholder="写清本周期证据、判断依据与结论"></textarea></label>' + actionFields +
      '<button type="submit" class="post-launch-review-submit">提交并完成本期复盘</button></form>' : "";
    var completedAction = review.action_summary ? '<dl class="post-launch-review-action-summary"><div><dt>下一步动作</dt><dd>' + escapeHtml(review.action_summary) + '</dd></div><div><dt>负责人</dt><dd>' + escapeHtml(review.action_owner_name || "待确认") + '</dd></div><div><dt>计划完成</dt><dd>' + escapeHtml(review.action_due_date || "待确认") + '</dd></div></dl>' : "";
    var completed = review.status === "completed" ? '<div class="post-launch-review-resolution"><span>已完成 · ' + escapeHtml(outcomeLabel(review.outcome)) + '</span><strong>' + escapeHtml(review.completed_by_name || "系统用户") + ' · ' + escapeHtml(formatDate(review.completed_at, true)) + '</strong><p>' + escapeHtml(review.resolution_note || "未填写结论") + '</p>' + completedAction + '</div>' : "";
    return '<div class="post-launch-review-detail">' +
      '<div class="post-launch-review-detail-head"><div><span>第 ' + escapeHtml(review.cycle_number) + ' 期 · ' + escapeHtml(formatDate(review.window_started_at, false)) + '—' + escapeHtml(formatDate(review.due_at, false)) + (review.is_overdue ? ' · 已逾期 ' + escapeHtml(review.overdue_days || 1) + ' 天' : '') + '</span>' +
      '<h3>' + escapeHtml(review.project_name) + '</h3><p>' + escapeHtml(review.health_summary) + '</p></div><em class="tone-' + escapeHtml(review.health_level) + '">' + escapeHtml(healthLabel(review.health_level)) + '</em></div>' +
      '<div class="post-launch-review-accountability"><span>本期责任人</span><strong>' + escapeHtml(review.assignee_name || review.owner_name || "待确认") + '</strong><small>生成复盘时已固化，不随项目负责人后续变更</small></div>' +
      '<div class="post-launch-review-source-grid"><section><h4>GitLab 活跃证据</h4><div>' +
        metricMarkup("提交", gitlab.commit_count || 0) + metricMarkup("MR", gitlab.merge_request_count || 0) + metricMarkup("Issue", gitlab.issue_count || 0) + metricMarkup("分支更新", gitlab.branch_update_count || 0) +
      '</div><p>扫描状态：' + escapeHtml(gitlab.status || "never") + ' · 最近证据 ' + escapeHtml(formatDate(gitlab.latest_activity_at, true)) + '</p></section>' +
      '<section><h4>运行态证据</h4><div>' + metricMarkup("检查项", runtime.configured_check_count || 0) + metricMarkup("健康", runtime.healthy_count || 0) + metricMarkup("异常", (runtime.down_count || 0) + (runtime.degraded_count || 0)) + metricMarkup("未关故障", runtime.open_incident_count || 0) +
      '</div><p>' + (runtime.configured_check_count ? "来自正式环境健康检查记录" : "尚未配置正式环境健康检查") + '</p></section></div>' +
      '<div class="post-launch-review-recommendation"><span>系统建议</span><p>' + escapeHtml(review.recommendation) + '</p></div>' +
      '<div class="post-launch-review-data-gap"><strong>产品访问数据</strong><span>' + escapeHtml(analytics.message || "尚未配置真实访问量数据源。") + '</span></div>' + completed + completeForm + '</div>';
  }

  function ledgerMarkup(data) {
    var items = data.items || [];
    var projects = data.projects || [];
    if (!items.length) {
      return '<div class="post-launch-review-ledger-empty"><strong>还没有到期复盘</strong><p>' +
        (projects.length ? "首期复盘会在项目上线满 5 天后自动生成。" : "项目切换为“已上线”后，这里会形成可追溯的 5 日复盘台账。") +
        '</p></div>';
    }
    return '<div class="post-launch-review-ledger">' + items.map(function (item) {
      return '<button type="button" data-post-launch-open="' + item.id + '" class="' + (item.status === "due" ? "is-due" : "") + '">' +
        '<span><strong>' + escapeHtml(item.project_name) + '</strong><small>第 ' + escapeHtml(item.cycle_number) + ' 期 · ' + escapeHtml(formatDate(item.due_at, false)) + (item.is_overdue ? ' · 逾期 ' + escapeHtml(item.overdue_days || 1) + ' 天' : '') + '</small></span>' +
        '<em class="tone-' + escapeHtml(item.health_level) + '">' + (item.status === "completed" ? "已完成" : item.status === "cancelled" ? "已取消" : healthLabel(item.health_level)) + '</em></button>';
    }).join("") + '</div>';
  }

  function dialogMarkup() {
    var data = state.data || { summary: {}, items: [], projects: [] };
    var active = (data.items || []).find(function (item) { return Number(item.id) === Number(state.activeReviewId); });
    return '<button type="button" class="post-launch-review-backdrop" data-post-launch-close aria-label="关闭上线复盘"></button>' +
      '<section class="post-launch-review-panel" role="dialog" aria-modal="true" aria-labelledby="post-launch-review-title">' +
      '<header><div><span>上线后持续治理</span><h2 id="post-launch-review-title">5 日上线复盘</h2><p>系统自动生成证据快照，负责人确认结论并留下下一步动作。</p></div>' +
      '<div><button type="button" data-post-launch-refresh>重新评估</button><button type="button" data-post-launch-close>关闭</button></div></header>' +
      '<div class="post-launch-review-dialog-metrics">' + metricMarkup("已上线", data.summary.online_projects || 0) + metricMarkup("待处理", data.summary.due_reviews || 0) + metricMarkup("已逾期", data.summary.overdue_reviews || 0) + metricMarkup("需立即处理", data.summary.critical_reviews || 0) + metricMarkup("近 30 天完成", data.summary.completed_last_30_days || 0) + '</div>' +
      '<main>' + (active ? reviewDetailMarkup(active) : ledgerMarkup(data)) + '</main></section>';
  }

  function renderDialog() {
    var overlay = document.querySelector(".post-launch-review-dialog");
    if (!overlay) return;
    overlay.innerHTML = dialogMarkup();
  }

  function openDialog(reviewId) {
    state.returnFocus = document.activeElement;
    state.activeReviewId = reviewId || null;
    state.outcome = "healthy";
    var overlay = document.querySelector(".post-launch-review-dialog");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "post-launch-review-dialog";
      document.body.appendChild(overlay);
    }
    renderDialog();
    document.documentElement.classList.add("post-launch-review-dialog-open");
    overlay.querySelector(".post-launch-review-panel [data-post-launch-close]")?.focus();
  }

  function closeDialog() {
    document.querySelector(".post-launch-review-dialog")?.remove();
    document.documentElement.classList.remove("post-launch-review-dialog-open");
    state.activeReviewId = null;
    if (state.returnFocus && document.contains(state.returnFocus)) state.returnFocus.focus();
    state.returnFocus = null;
  }

  function showToast(message, isError) {
    var toast = document.querySelector(".post-launch-review-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "post-launch-review-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.classList.add("show");
    window.clearTimeout(toast._hideTimer);
    toast._hideTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 2800);
  }

  document.addEventListener("click", function (event) {
    var open = event.target.closest("[data-post-launch-open]");
    if (open) {
      event.preventDefault();
      openDialog(Number(open.dataset.postLaunchOpen));
      return;
    }
    if (event.target.closest("[data-post-launch-overview]")) {
      event.preventDefault();
      openDialog(null);
      return;
    }
    if (event.target.closest("[data-post-launch-close]")) {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.target.closest("[data-post-launch-retry]")) {
      loadData({ evaluate: false });
      return;
    }
    if (event.target.closest("[data-post-launch-refresh]")) {
      loadData({ evaluate: true });
      return;
    }
    var outcome = event.target.closest("[data-post-launch-outcome]");
    if (outcome) {
      state.outcome = outcome.dataset.postLaunchOutcome;
      renderDialog();
    }
  });

  document.addEventListener("submit", async function (event) {
    var form = event.target.closest("[data-post-launch-complete]");
    if (!form) return;
    event.preventDefault();
    var submit = form.querySelector("button[type='submit']");
    var formData = new FormData(form);
    var note = compactText(formData.get("note"));
    var actionSummary = compactText(formData.get("action_summary"));
    var actionOwnerName = compactText(formData.get("action_owner_name"));
    var actionDueDate = compactText(formData.get("action_due_date"));
    if (note.length < 3) {
      showToast("请填写至少 3 个字的复盘结论", true);
      return;
    }
    if ((state.outcome === "follow_up" || state.outcome === "optimization") && (!actionSummary || !actionOwnerName || !actionDueDate)) {
      showToast("请完整填写下一步动作、负责人和计划完成日期", true);
      return;
    }
    submit.disabled = true;
    submit.textContent = "正在提交…";
    try {
      await api("/api/post-launch-reviews/" + form.dataset.postLaunchComplete + "/complete", {
        method: "POST",
        body: JSON.stringify({
          outcome: state.outcome,
          note: note,
          action_summary: actionSummary || null,
          action_owner_name: actionOwnerName || null,
          action_due_date: actionDueDate || null
        })
      });
      showToast("本期上线复盘已完成");
      state.activeReviewId = null;
      await loadData({ evaluate: false });
      renderDialog();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "提交并完成本期复盘";
      showToast(error.message || "提交失败，请稍后重试", true);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && document.querySelector(".post-launch-review-dialog")) closeDialog();
  });

  new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleRender);
  window.setInterval(function () {
    if (!document.hidden && targetCards().length) loadData({ evaluate: false });
  }, 60000);

  scheduleRender();
  loadData({ evaluate: true });
})();
