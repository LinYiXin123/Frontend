(function () {
  var RECOVERY_FLAG = "ai_project_hub_blank_recovered_at";
  var SAFE_STATE_KEYS = [
    "ai_project_hub_route",
    "ai_project_hub_active_section",
    "ai_project_hub_ai_section",
    "ai_project_hub_active_config",
    "ai_project_hub_project_page_size",
    "ai_project_hub_notification_page_size",
    "ai_project_hub_alert_page_size",
    "ai_project_hub_delivery_page_size"
  ];
  var MANUAL_RESET_STATE_KEYS = [
    "ai_project_hub_pending_nav"
  ];
  var runtimeErrors = [];
  var recoveryShown = false;
  var checkCount = 0;

  window.__AI_PROJECT_HUB_RUNTIME_ERRORS__ = runtimeErrors;

  function now() {
    return Date.now();
  }

  function safeGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (error) {
      // Storage can be disabled in some browser modes.
    }
  }

  function safeRemove(storage, key) {
    try {
      storage.removeItem(key);
    } catch (error) {
      // Storage can be disabled in some browser modes.
    }
  }

  function safeClearSession() {
    try {
      sessionStorage.clear();
    } catch (error) {
      // Ignore.
    }
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function rememberError(type, payload) {
    runtimeErrors.push({
      type: type,
      message: compactText(payload && (payload.message || payload.reason || payload.error || payload)),
      source: payload && payload.filename,
      line: payload && payload.lineno,
      time: now()
    });
    if (runtimeErrors.length > 12) {
      runtimeErrors.shift();
    }
  }

  window.addEventListener("error", function (event) {
    rememberError("error", event);
  });

  window.addEventListener("unhandledrejection", function (event) {
    rememberError("rejection", {
      reason: event.reason && (event.reason.message || event.reason)
    });
  });

  function hasAppSurface() {
    if (document.querySelector(".login-shell, .app-shell")) {
      return true;
    }

    var bodyText = compactText(document.body && document.body.innerText);
    return /欢迎回来|项目管理平台|AI\s*功能集成|AI功能集成|AI追问/.test(bodyText);
  }

  function clearSafeUiState() {
    SAFE_STATE_KEYS.forEach(function (key) {
      safeRemove(localStorage, key);
    });
  }

  function isNavigationRestorePending() {
    var pending = window.__AI_PROJECT_HUB_NAV_RESTORE_PENDING__;
    return !!(pending && pending.until && pending.until > now());
  }

  function injectRecoveryStyles() {
    if (document.getElementById("legacy-blank-recovery-style")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "legacy-blank-recovery-style";
    style.textContent = [
      "#legacy-blank-recovery{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 25% 18%,rgba(86,143,255,.18),transparent 34%),radial-gradient(circle at 74% 28%,rgba(122,92,255,.16),transparent 32%),linear-gradient(135deg,#f7fbff,#edf4ff);font-family:Inter,'PingFang SC','Microsoft YaHei',Arial,sans-serif;color:#182a44;}",
      "#legacy-blank-recovery .recovery-card{width:min(520px,calc(100vw - 40px));border:1px solid rgba(126,164,235,.48);border-radius:24px;padding:28px;background:rgba(255,255,255,.82);box-shadow:0 28px 80px rgba(50,86,160,.22),inset 0 1px 0 rgba(255,255,255,.9);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);}",
      "#legacy-blank-recovery h1{margin:0 0 10px;font-size:22px;line-height:1.35;letter-spacing:0;color:#182033;}",
      "#legacy-blank-recovery p{margin:0 0 18px;color:#61708d;font-size:14px;line-height:1.8;}",
      "#legacy-blank-recovery .recovery-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;}",
      "#legacy-blank-recovery button{height:44px;border:1px solid rgba(118,154,225,.55);border-radius:14px;padding:0 18px;color:#294267;font-weight:800;background:rgba(255,255,255,.86);box-shadow:0 10px 24px rgba(66,104,180,.14);cursor:pointer;}",
      "#legacy-blank-recovery button.primary{color:#fff;border-color:rgba(59,111,255,.72);background:linear-gradient(135deg,#357dff,#705dff);box-shadow:0 16px 34px rgba(64,111,231,.3);}"
    ].join("");
    document.head.appendChild(style);
  }

  function showRecovery(reason) {
    if (recoveryShown || document.getElementById("legacy-blank-recovery")) {
      return;
    }
    recoveryShown = true;
    injectRecoveryStyles();

    var panel = document.createElement("div");
    panel.id = "legacy-blank-recovery";
    panel.setAttribute("role", "alert");
    panel.innerHTML = [
      '<section class="recovery-card">',
      "<h1>页面刚才没有正常展开</h1>",
      "<p>我已经拦截到一次空白状态。通常是浏览器缓存或上一次菜单状态卡住导致的，可以先重新加载；如果还不行，再清理本页临时状态。</p>",
      '<div class="recovery-actions">',
      '<button type="button" data-reset>清理状态并重开</button>',
      '<button type="button" class="primary" data-reload>重新加载</button>',
      "</div>",
      "</section>"
    ].join("");

    panel.querySelector("[data-reload]").addEventListener("click", function () {
      window.location.reload();
    });

    panel.querySelector("[data-reset]").addEventListener("click", function () {
      clearSafeUiState();
      MANUAL_RESET_STATE_KEYS.forEach(function (key) {
        safeRemove(localStorage, key);
      });
      safeClearSession();
      window.location.reload();
    });

    document.body.appendChild(panel);
    rememberError("blank-recovery", { message: reason || "blank app surface" });
  }

  function recoverBlank(reason) {
    var lastRecovery = Number(safeGet(sessionStorage, RECOVERY_FLAG) || 0);
    if (!lastRecovery || now() - lastRecovery > 30000) {
      safeSet(sessionStorage, RECOVERY_FLAG, String(now()));
      clearSafeUiState();
      window.location.reload();
      return;
    }

    showRecovery(reason);
  }

  function checkBlankSurface() {
    checkCount += 1;
    if (hasAppSurface()) {
      return;
    }

    if (isNavigationRestorePending() && checkCount < 6) {
      return;
    }

    var root = document.getElementById("root");
    var rootLength = root && root.innerHTML ? root.innerHTML.trim().length : 0;
    var bodyTextLength = compactText(document.body && document.body.innerText).length;

    if (document.readyState !== "loading" && rootLength < 80 && bodyTextLength < 20 && checkCount >= 2) {
      recoverBlank("empty-root-after-load");
    }
  }

  window.setTimeout(checkBlankSurface, 1800);
  window.setTimeout(checkBlankSurface, 4200);
  window.setTimeout(checkBlankSurface, 8000);

  var interval = window.setInterval(function () {
    if (checkCount > 24 || hasAppSurface()) {
      window.clearInterval(interval);
      return;
    }
    checkBlankSurface();
  }, 2500);
  // ---- Reveal-animation unfreeze (hidden-tab / embedded-browser support) ----
  // Entrance animations (e.g. page-rise) reveal content from opacity 0. When
  // the tab is hidden, the browser freezes CSS animations at their first
  // frame, so freshly mounted content stays invisible even though it is in
  // the DOM. While the document is hidden, force such stuck finite
  // animations to their end state so content is always visible; visible
  // tabs keep their original animation behavior.
  var lastUnfreezeRun = 0;

  function unfreezeStuckRevealAnimations() {
    if (!document.hidden) {
      return;
    }
    var animations = document.getAnimations ? document.getAnimations() : [];
    for (var i = 0; i < animations.length; i++) {
      var animation = animations[i];
      try {
        var effect = animation.effect;
        var timing = effect && effect.getComputedTiming ? effect.getComputedTiming() : null;
        var playState = animation.playState;
        if (!timing || timing.iterations === Infinity || playState === "finished" || playState === "idle") {
          continue;
        }
        animation.finish();
      } catch (error) {
        // Some animation types reject finish(); leave them untouched.
      }
    }
  }

  function scheduleUnfreeze() {
    var now = Date.now();
    if (now - lastUnfreezeRun < 150) {
      return;
    }
    lastUnfreezeRun = now;
    // Run synchronously: timers are heavily throttled while the tab is
    // hidden, but MutationObserver callbacks are delivered with the page's
    // own task execution and stay responsive.
    unfreezeStuckRevealAnimations();
  }

  scheduleUnfreeze();
  window.setInterval(scheduleUnfreeze, 1200);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      scheduleUnfreeze();
    }
  });
  if (window.MutationObserver) {
    try {
      var unfreezeObserver = new MutationObserver(scheduleUnfreeze);
      if (document.body) {
        unfreezeObserver.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener("DOMContentLoaded", function () {
          unfreezeObserver.observe(document.body, { childList: true, subtree: true });
        });
      }
    } catch (error) {
      // Observers are best-effort; the interval fallback still applies.
    }
  }
})();
