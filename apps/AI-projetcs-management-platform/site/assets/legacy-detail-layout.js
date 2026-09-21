(function () {
  const desktopMinWidth = 1321;
  const fallbackGap = 16;
  let rafId = 0;
  const observedCards = new Set();
  const cardResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => scheduleAlign())
    : null;

  function getPage() {
    return document.querySelector(".project-detail-page");
  }

  function resetOffsets(page) {
    page.querySelectorAll(".review-card, .trend-card, .timeline-card").forEach((card) => {
      card.style.setProperty("--detail-stack-offset", "0px");
    });
  }

  function observeLayoutCards(page) {
    if (!cardResizeObserver) return;

    const nextCards = new Set(
      page.querySelectorAll(".basic-card, .review-card, .env-card, .trend-card, .ai-card, .timeline-card")
    );

    observedCards.forEach((card) => {
      if (nextCards.has(card)) return;
      cardResizeObserver.unobserve(card);
      observedCards.delete(card);
    });

    nextCards.forEach((card) => {
      if (observedCards.has(card)) return;
      observedCards.add(card);
      cardResizeObserver.observe(card);
    });
  }

  function clearObservedCards() {
    if (!cardResizeObserver) return;
    observedCards.forEach((card) => cardResizeObserver.unobserve(card));
    observedCards.clear();
  }

  function getTargetGap(page) {
    const layout = page.querySelector(".detail-layout");
    const rowGap = layout ? Number.parseFloat(getComputedStyle(layout).rowGap) : NaN;
    return Number.isFinite(rowGap) ? rowGap : fallbackGap;
  }

  function alignPair(page, firstSelector, secondSelector) {
    const first = page.querySelector(firstSelector);
    const second = page.querySelector(secondSelector);
    if (!first || !second) return;

    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    const currentGap = secondRect.top - firstRect.bottom;
    const targetGap = getTargetGap(page);
    const offset = Math.round(targetGap - currentGap);

    second.style.setProperty("--detail-stack-offset", `${offset}px`);
  }

  function alignStackBottom(page, referenceSelector, stackSelector) {
    const reference = page.querySelector(referenceSelector);
    const stack = page.querySelector(stackSelector);
    if (!reference || !stack) return;

    const referenceRect = reference.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    const height = Math.max(0, Math.round(referenceRect.bottom - stackRect.top));
    const nextHeight = `${height}px`;

    if (stack.style.getPropertyValue("--detail-stack-height") !== nextHeight) {
      stack.style.setProperty("--detail-stack-height", nextHeight);
    }
  }

  function alignDetailStacks() {
    rafId = 0;
    const page = getPage();
    if (!page) {
      clearObservedCards();
      return;
    }

    observeLayoutCards(page);

    resetOffsets(page);

    if (window.innerWidth < desktopMinWidth) {
      page.querySelectorAll(".review-card, .timeline-card").forEach((card) => {
        card.style.removeProperty("--detail-stack-height");
      });
      return;
    }

    alignPair(page, ".basic-card", ".review-card");
    alignPair(page, ".env-card", ".trend-card");
    alignPair(page, ".ai-card", ".timeline-card");
    alignStackBottom(page, ".trend-card", ".review-card");
    alignStackBottom(page, ".trend-card", ".timeline-card");
  }

  function scheduleAlign() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(alignDetailStacks);
  }

  window.addEventListener("resize", scheduleAlign, { passive: true });
  window.addEventListener("hashchange", scheduleAlign);
  window.addEventListener("load", scheduleAlign);
  document.addEventListener("click", () => setTimeout(scheduleAlign, 80), true);

  const observer = new MutationObserver(scheduleAlign);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleAlign();
})();
