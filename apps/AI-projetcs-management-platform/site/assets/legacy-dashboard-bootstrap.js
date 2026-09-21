(function () {
  var attributeName = "data-dashboard-bootstrap";
  var root = document.documentElement;
  var firstDashboardRequest = true;
  var released = false;
  var releaseScheduled = false;
  var appRootObserver = null;

  function release() {
    if (released) return;
    released = true;
    if (appRootObserver) {
      appRootObserver.disconnect();
      appRootObserver = null;
    }
    root.removeAttribute(attributeName);
  }

  function releaseAfterRender() {
    if (releaseScheduled || released) return;
    releaseScheduled = true;
    // Let the mounted application paint before removing the startup cover.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(release);
    });
    // requestAnimationFrame pauses in hidden tabs, so keep a short timer fallback.
    window.setTimeout(release, 180);
  }

  function appSurfaceReady() {
    var appRoot = document.getElementById("root");
    return Boolean(appRoot && appRoot.querySelector(".app-shell, .login-shell, .login-page"));
  }

  function watchForAppSurface() {
    var appRoot = document.getElementById("root");
    if (!appRoot) return;
    if (appSurfaceReady()) {
      releaseAfterRender();
      return;
    }
    if (!window.MutationObserver) return;
    appRootObserver = new window.MutationObserver(function () {
      if (appSurfaceReady()) releaseAfterRender();
    });
    appRootObserver.observe(appRoot, { childList: true, subtree: true });
  }

  function isDashboardRequest(input) {
    var rawUrl = typeof input === "string" ? input : input && input.url;
    if (!rawUrl) return false;
    try {
      var url = new URL(rawUrl, window.location.href);
      return url.origin === window.location.origin && url.pathname === "/api/dashboard";
    } catch (error) {
      return false;
    }
  }

  root.setAttribute(attributeName, "loading");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchForAppSurface, { once: true });
  } else {
    watchForAppSurface();
  }

  var originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var guardThisRequest = firstDashboardRequest && isDashboardRequest(input);
    if (guardThisRequest) firstDashboardRequest = false;
    return originalFetch(input, init).then(function (response) {
      if (guardThisRequest) {
        // Parse a clone so releasing the overlay follows the dashboard payload,
        // without consuming the response that the application still needs.
        response.clone().json().catch(function () {
          return null;
        }).finally(releaseAfterRender);
      }
      return response;
    }).catch(function (error) {
      if (guardThisRequest) release();
      throw error;
    });
  };

  // Never hold the whole interface behind a large dashboard response. The page
  // can render its own loading and empty states while data continues to arrive.
  window.setTimeout(release, 1600);
})();
