export const PRODUCT_ROW_AUTO_SPEED = 46;
export const PRODUCT_ROW_STAGGER = 216;
export const PRODUCT_ROW_MAX_SCROLL_BOOST = 640;

type ProductRowMotionInput = {
  cycleWidth: number;
  distance: number;
  direction: -1 | 1;
  stagger?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCenteredLoopOffset(distance: number, cycleWidth: number) {
  if (cycleWidth <= 0) return 0;

  const halfCycle = cycleWidth / 2;
  return (
    ((((distance + halfCycle) % cycleWidth) + cycleWidth) % cycleWidth) -
    halfCycle
  );
}

export function getLoopedProductRowTranslate({
  cycleWidth,
  distance,
  direction,
  stagger = 0,
}: ProductRowMotionInput) {
  if (cycleWidth <= 0) return 0;

  return (
    -cycleWidth +
    getCenteredLoopOffset(distance * direction + stagger, cycleWidth)
  );
}

export function addProductRowScrollBoost(
  currentBoost: number,
  scrollDelta: number
) {
  return clamp(
    currentBoost + Math.abs(scrollDelta) * 0.9,
    0,
    PRODUCT_ROW_MAX_SCROLL_BOOST
  );
}

export function decayProductRowScrollBoost(
  currentBoost: number,
  elapsedSeconds: number
) {
  return currentBoost * Math.exp(-2.6 * Math.max(0, elapsedSeconds));
}
