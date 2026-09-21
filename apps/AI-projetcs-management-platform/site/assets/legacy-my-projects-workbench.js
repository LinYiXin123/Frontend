(function retirePersonalProjectsWorkbench() {
  "use strict";

  // Compatibility tombstone for tabs that still have an older legacy HTML shell
  // cached. The personal-projects workbench is retired and must never recreate
  // its overlay, observers, API polling, or navigation bridge.
  document.querySelectorAll(".mine-workbench-root").forEach(function (node) {
    node.remove();
  });

  var legacyMain = document.querySelector("main.mine-legacy-content-suspended");
  if (legacyMain) {
    legacyMain.classList.remove("mine-legacy-content-suspended");
    legacyMain.removeAttribute("aria-hidden");
  }
})();
