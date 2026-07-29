import assert from "node:assert/strict";
import test from "node:test";

import {
  addProductRowScrollBoost,
  decayProductRowScrollBoost,
  getLoopedProductRowTranslate,
  PRODUCT_ROW_AUTO_SPEED,
  PRODUCT_ROW_MAX_SCROLL_BOOST,
  PRODUCT_ROW_STAGGER,
} from "../components/home/product-story-motion.ts";

test("autonomous distance advances staggered rows in opposite directions", () => {
  const cycleWidth = 4752;
  const elapsedSeconds = 2;
  const distance = PRODUCT_ROW_AUTO_SPEED * elapsedSeconds;
  const firstStart = getLoopedProductRowTranslate({
    cycleWidth,
    direction: -1,
    distance: 0,
    stagger: -PRODUCT_ROW_STAGGER / 2,
  });
  const firstAfter = getLoopedProductRowTranslate({
    cycleWidth,
    direction: -1,
    distance,
    stagger: -PRODUCT_ROW_STAGGER / 2,
  });
  const secondStart = getLoopedProductRowTranslate({
    cycleWidth,
    direction: 1,
    distance: 0,
    stagger: PRODUCT_ROW_STAGGER / 2,
  });
  const secondAfter = getLoopedProductRowTranslate({
    cycleWidth,
    direction: 1,
    distance,
    stagger: PRODUCT_ROW_STAGGER / 2,
  });

  assert.ok(firstAfter < firstStart);
  assert.ok(secondAfter > secondStart);
  assert.equal(secondStart - firstStart, PRODUCT_ROW_STAGGER);
});

test("looped row translations always keep duplicate cards on both sides", () => {
  for (const cycleWidth of [4320, 4752]) {
    for (const direction of [-1, 1]) {
      for (const distance of [0, 2400, 9600, 24000, 96000]) {
        const translate = getLoopedProductRowTranslate({
          cycleWidth,
          direction,
          distance,
          stagger: direction * (PRODUCT_ROW_STAGGER / 2),
        });

        assert.ok(translate >= cycleWidth * -1.5);
        assert.ok(translate < cycleWidth * -0.5);
      }
    }
  }
});

test("wheel scrolling creates a capped boost that decays toward cruise speed", () => {
  const downwardBoost = addProductRowScrollBoost(0, 480);
  const upwardBoost = addProductRowScrollBoost(0, -480);
  const saturatedBoost = addProductRowScrollBoost(downwardBoost, 2000);
  const decayedBoost = decayProductRowScrollBoost(downwardBoost, 0.5);

  assert.equal(downwardBoost, upwardBoost);
  assert.ok(downwardBoost > PRODUCT_ROW_AUTO_SPEED);
  assert.equal(saturatedBoost, PRODUCT_ROW_MAX_SCROLL_BOOST);
  assert.ok(decayedBoost > 0);
  assert.ok(decayedBoost < downwardBoost);
});
