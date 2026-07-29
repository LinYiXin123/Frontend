"use client";

import { Button } from "antd";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_IMMERSIVE_COPY_TUNING,
  DEFAULT_IMMERSIVE_ORB_TUNING,
  ImmersivePortalTuningPanels,
} from "@/components/home/immersive-portal-tuning-panels";
import type { ImmersivePortalTuningValue } from "@/components/home/immersive-portal-tuning-panels";
import { AnimatedOrb } from "@/components/ui/animated-orb";
import { BlueFluidBackground } from "@/components/ui/blue-fluid-background";

const WORLD_ASSET =
  "/visuals/immersive/ai-loop-cloud-world-v1.webp";

const IMMERSIVE_SCROLL_STEPS = 5;
const ORB_MIDPOINT_PROGRESS = 3 / IMMERSIVE_SCROLL_STEPS;
const ORB_MIDPOINT_TUNING = {
  flatten: 51,
  scale: 463,
  x: -72,
  y: 175,
} as const;
const ORB_FINAL_TUNING = {
  flatten: 100,
  scale: 100,
  x: 0,
  y: 0,
} as const;

const LOOP_VALUES = [
  {
    asset: "01-trend-to-strategy",
    kicker: "01 · 趋势到策略",
    title: "信号出现，策略开始成形。",
    description:
      "把行业、内容与供给变化汇入同一条判断路径，生成区域化响应建议。",
  },
  {
    asset: "02-content-to-fulfillment",
    kicker: "02 · 内容到承接",
    title: "传播不再止于曝光。",
    description:
      "让内容触达、即时购药与经营承接进入同一条可以追踪的业务路径。",
  },
  {
    asset: "03-gate-to-approval",
    kicker: "03 · 门禁到审批",
    title: "先校验边界，再进入执行。",
    description:
      "供给、合规或执行条件不足时，方案先经过门禁，再交由人工确认。",
  },
  {
    asset: "04-action-to-review",
    kicker: "04 · 执行到复盘",
    title: "每次动作，都回到同一套复盘。",
    description:
      "把内容表现与 O2O 结果连接起来，让下一轮策略建立在可追溯结果上。",
  },
  {
    asset: "05-region-to-unit",
    kicker: "05 · 区域到 SKU",
    title: "策略落到真实经营颗粒度。",
    description:
      "响应建议可以继续细化到区域、人群、时段与 SKU，便于团队判断和执行。",
  },
  {
    asset: "06-platform-to-collaboration",
    kicker: "06 · 平台到协同",
    title: "复用平台能力，衔接跨域决策。",
    description:
      "现有平台继续承担专业能力，AI LOOP 负责把信号、判断与动作串联起来。",
  },
  {
    asset: "07-process-to-evidence",
    kicker: "07 · 过程到依据",
    title: "结果可见，过程同样可查。",
    description:
      "版本、审批、执行回执与依据被保留下来，形成完整的业务决策链路。",
  },
] as const;

type MotionState = {
  currentProgress: number;
  pointerX: number;
  pointerY: number;
  targetPointerX: number;
  targetPointerY: number;
  targetProgress: number;
};

type OrbMotionTuning = {
  flatten: number;
  scale: number;
  x: number;
  y: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(value: number) {
  const progress = clamp(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function resolveRelativeIndex(index: number, activeIndex: number, length: number) {
  let relativeIndex = (index - activeIndex + length) % length;
  if (relativeIndex > length / 2) {
    relativeIndex -= length;
  }
  return relativeIndex;
}

function interpolateOrbTuning(
  from: OrbMotionTuning,
  to: OrbMotionTuning,
  progress: number
) {
  const easedProgress = easeInOut(progress);
  const interpolate = (start: number, end: number) =>
    start + (end - start) * easedProgress;

  return {
    flatten: interpolate(from.flatten, to.flatten),
    scale: interpolate(from.scale, to.scale),
    x: interpolate(from.x, to.x),
    y: interpolate(from.y, to.y),
  };
}

function resolveOrbMotionTuning(
  progress: number,
  initialTuning: OrbMotionTuning
) {
  if (progress <= ORB_MIDPOINT_PROGRESS) {
    return interpolateOrbTuning(
      initialTuning,
      ORB_MIDPOINT_TUNING,
      progress / ORB_MIDPOINT_PROGRESS
    );
  }

  return interpolateOrbTuning(
    ORB_MIDPOINT_TUNING,
    ORB_FINAL_TUNING,
    (progress - ORB_MIDPOINT_PROGRESS) /
      (1 - ORB_MIDPOINT_PROGRESS)
  );
}

function LoopValuePortalPreview() {
  return (
    <>
      <div className="immersive-next-scene-world" />
      <div className="immersive-next-scene-atmosphere" />
      <div className="immersive-next-scene-content">
        <header className="loop-value-heading">
          <p>REAL IMPACT · AI LOOP 闭环价值</p>
          <h2>一条可追溯的营销闭环</h2>
          <span>
            从趋势洞察到 O2O 复盘，每一步都能被解释、被审批、被回收。
          </span>
        </header>
        <div className="immersive-next-scene-cards">
          {LOOP_VALUES.slice(2, 5).map((item, index) => (
            <article
              className={index === 1 ? "is-active" : undefined}
              key={item.kicker}
            >
              <span className="loop-value-card-copy">
                <small>{item.kicker}</small>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </span>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

function LoopValueCarousel() {
  const [activeIndex, setActiveIndex] = useState(
    Math.floor(LOOP_VALUES.length / 2)
  );
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncCompactLayout = () => setIsCompact(mediaQuery.matches);
    syncCompactLayout();
    mediaQuery.addEventListener("change", syncCompactLayout);
    return () =>
      mediaQuery.removeEventListener("change", syncCompactLayout);
  }, []);

  const geometry = isCompact
    ? {
        cardHeight: 320,
        cardWidth: 230,
        centerLift: 22,
        dropY: 34,
        stepX: 170,
        tilt: 7,
      }
    : {
        cardHeight: 420,
        cardWidth: 300,
        centerLift: 30,
        dropY: 52,
        stepX: 295,
        tilt: 8,
      };

  const move = (direction: -1 | 1) => {
    setActiveIndex(
      (currentIndex) =>
        (currentIndex + direction + LOOP_VALUES.length) % LOOP_VALUES.length
    );
  };

  return (
    <div className="loop-value-carousel">
      <div
        className="loop-value-arc"
        aria-label="AI LOOP 闭环价值卡片"
        style={
          {
            "--loop-card-height": `${geometry.cardHeight}px`,
            "--loop-card-width": `${geometry.cardWidth}px`,
          } as CSSProperties
        }
      >
        {LOOP_VALUES.map((item, index) => {
          const relativeIndex = resolveRelativeIndex(
            index,
            activeIndex,
            LOOP_VALUES.length
          );
          const distance = Math.abs(relativeIndex);
          const isActive = index === activeIndex;
          const cardStyle = {
            "--loop-card-opacity": distance > 3 ? 0 : 1,
            "--loop-card-rotate": `${relativeIndex * geometry.tilt}deg`,
            "--loop-card-x": `${relativeIndex * geometry.stepX}px`,
            "--loop-card-y": `${
              distance * geometry.dropY -
              (isActive ? geometry.centerLift : 0)
            }px`,
            zIndex: LOOP_VALUES.length - distance,
          } as CSSProperties;

          return (
            <button
              aria-current={isActive ? "true" : undefined}
              aria-label={`${item.kicker}：${item.title}${item.description}`}
              className={`loop-value-card${isActive ? " is-active" : ""}`}
              key={item.kicker}
              onClick={() => setActiveIndex(index)}
              style={cardStyle}
              tabIndex={distance <= 1 ? 0 : -1}
              type="button"
            >
              <img
                alt=""
                aria-hidden="true"
                className="loop-value-card-poster"
                src={`/visuals/real-impact/posters/${item.asset}.jpg`}
              />
              <video
                aria-hidden="true"
                autoPlay
                className="loop-value-card-video"
                disablePictureInPicture
                disableRemotePlayback
                loop
                muted
                playsInline
                poster={`/visuals/real-impact/posters/${item.asset}.jpg`}
                preload={distance <= 1 ? "auto" : "metadata"}
                src={`/visuals/real-impact/videos/${item.asset}.mp4`}
                tabIndex={-1}
              />
            </button>
          );
        })}
      </div>

      <div className="loop-value-controls">
        <Button
          aria-label="查看上一张闭环价值卡片"
          className="loop-value-control"
          icon={
            <img
              alt=""
              aria-hidden="true"
              className="loop-value-control-icon"
              src="/visuals/icons/antd-left-outlined.svg"
            />
          }
          onClick={() => move(-1)}
          shape="circle"
        />
        <span aria-live="polite">
          {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(LOOP_VALUES.length).padStart(2, "0")}
        </span>
        <Button
          aria-label="查看下一张闭环价值卡片"
          className="loop-value-control"
          icon={
            <img
              alt=""
              aria-hidden="true"
              className="loop-value-control-icon"
              src="/visuals/icons/antd-right-outlined.svg"
            />
          }
          onClick={() => move(1)}
          shape="circle"
        />
      </div>
    </div>
  );
}

export function ImmersiveJourney() {
  const portalSectionRef = useRef<HTMLElement>(null);
  const orbTuningLayerRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const nextSceneMaskRef = useRef<HTMLDivElement>(null);
  const entryWashRef = useRef<HTMLDivElement>(null);
  const sceneCopyRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const scheduleRenderRef = useRef<(() => void) | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [orbTuning, setOrbTuning] = useState(DEFAULT_IMMERSIVE_ORB_TUNING);
  const [copyTuning, setCopyTuning] = useState(DEFAULT_IMMERSIVE_COPY_TUNING);
  const orbTuningRef = useRef(DEFAULT_IMMERSIVE_ORB_TUNING);
  const motionRef = useRef<MotionState>({
    currentProgress: 0,
    pointerX: 0,
    pointerY: 0,
    targetPointerX: 0,
    targetPointerY: 0,
    targetProgress: 0,
  });

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setSceneReady(true), 420);
    return () => window.clearTimeout(readyTimer);
  }, []);

  const handleOrbTuningChange = (
    nextTuning: ImmersivePortalTuningValue
  ) => {
    orbTuningRef.current = nextTuning;
    setOrbTuning(nextTuning);
    scheduleRenderRef.current?.();
  };

  useEffect(() => {
    const section = portalSectionRef.current;
    const scrollRoot = document.querySelector<HTMLElement>(".home-pages");
    const orbTuningLayer = orbTuningLayerRef.current;
    const orb = orbRef.current;
    const nextSceneMask = nextSceneMaskRef.current;
    const entryWash = entryWashRef.current;
    const sceneCopy = sceneCopyRef.current;
    const progress = progressRef.current;
    if (
      !section ||
      !scrollRoot ||
      !orbTuningLayer ||
      !orb ||
      !nextSceneMask ||
      !entryWash ||
      !sceneCopy ||
      !progress
    ) {
      return undefined;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const readProgress = () => {
      if (reducedMotion) {
        motionRef.current.targetProgress = 0;
        return;
      }
      const travel = Math.max(1, section.offsetHeight - scrollRoot.clientHeight);
      motionRef.current.targetProgress = clamp(
        (scrollRoot.scrollTop - section.offsetTop) / travel
      );
    };

    const render = () => {
      frameRef.current = null;
      const motion = motionRef.current;

      motion.currentProgress +=
        (motion.targetProgress - motion.currentProgress) * 0.16;
      motion.pointerX += (motion.targetPointerX - motion.pointerX) * 0.1;
      motion.pointerY += (motion.targetPointerY - motion.pointerY) * 0.1;
      if (
        Math.abs(motion.targetProgress - motion.currentProgress) < 0.001
      ) {
        motion.currentProgress = motion.targetProgress;
      }

      const scrollProgress = reducedMotion ? 0 : motion.currentProgress;
      const easedProgress = easeInOut(scrollProgress);
      const orbScale = 0.82 + easedProgress * 8.8;
      const initialOrbTuning = orbTuningRef.current;
      const resolvedOrbTuning = resolveOrbMotionTuning(scrollProgress, {
        flatten: initialOrbTuning.flatten ?? 100,
        scale: initialOrbTuning.scale,
        x: initialOrbTuning.x,
        y: initialOrbTuning.y,
      });
      const copyOpacity = reducedMotion
        ? 1
        : clamp(1 - scrollProgress / 0.22);
      const orbOpacity = reducedMotion
        ? 1
        : scrollProgress <= 0.82
          ? 1
          : clamp(1 - (scrollProgress - 0.82) / 0.18);
      const entryWashOpacity = reducedMotion
        ? 0
        : scrollProgress <= 0.58
          ? 0
          : scrollProgress <= 0.82
            ? clamp((scrollProgress - 0.58) / 0.24)
            : clamp(1 - (scrollProgress - 0.82) / 0.18);
      const nextSceneOpacity = reducedMotion
        ? 0
        : easeInOut(clamp((scrollProgress - 0.08) / 0.92));
      const compactLayout = window.innerWidth <= 680;
      const orbBaseWidth = compactLayout
        ? Math.min(window.innerWidth * 0.78, 520)
        : clamp(window.innerWidth * 0.42, 360, 680);
      const orbOriginX = window.innerWidth * (compactLayout ? 0.5 : 0.65);
      const orbOriginY = window.innerHeight * (compactLayout ? 0.32 : 0.44);
      const resolvedOrbScale = resolvedOrbTuning.scale / 100;
      const pointerOffsetX =
        motion.pointerX *
        10 *
        (1 - scrollProgress) *
        resolvedOrbScale;
      const pointerOffsetY =
        motion.pointerY *
        10 *
        (1 - scrollProgress) *
        resolvedOrbScale *
        (resolvedOrbTuning.flatten / 100);
      const portalRadiusX =
        (orbBaseWidth / 2) * resolvedOrbScale * orbScale;
      const portalRadiusY =
        portalRadiusX * (resolvedOrbTuning.flatten / 100);

      orbTuningLayer.style.setProperty(
        "--immersive-orb-x",
        `${resolvedOrbTuning.x}px`
      );
      orbTuningLayer.style.setProperty(
        "--immersive-orb-y",
        `${resolvedOrbTuning.y}px`
      );
      orbTuningLayer.style.setProperty(
        "--immersive-orb-scale",
        `${resolvedOrbScale}`
      );
      orbTuningLayer.style.setProperty(
        "--immersive-orb-flatten",
        `${resolvedOrbTuning.flatten / 100}`
      );

      orb.style.transform = `translate3d(${
        motion.pointerX * 10 * (1 - scrollProgress)
      }px, ${
        motion.pointerY * 10 * (1 - scrollProgress)
      }px, 0) scale(${orbScale})`;
      orb.style.opacity = `${orbOpacity}`;
      nextSceneMask.style.setProperty(
        "--immersive-mask-x",
        `${
          orbOriginX +
          resolvedOrbTuning.x +
          pointerOffsetX
        }px`
      );
      nextSceneMask.style.setProperty(
        "--immersive-mask-y",
        `${
          orbOriginY +
          resolvedOrbTuning.y +
          pointerOffsetY
        }px`
      );
      nextSceneMask.style.setProperty(
        "--immersive-mask-radius-x",
        `${portalRadiusX}px`
      );
      nextSceneMask.style.setProperty(
        "--immersive-mask-radius-y",
        `${portalRadiusY}px`
      );
      nextSceneMask.style.opacity = `${nextSceneOpacity}`;
      entryWash.style.opacity = `${entryWashOpacity}`;
      sceneCopy.style.opacity = `${copyOpacity}`;
      sceneCopy.style.pointerEvents = copyOpacity > 0.08 ? "auto" : "none";
      progress.style.transform = `scaleX(${scrollProgress})`;

      const isSettled =
        Math.abs(motion.targetProgress - motion.currentProgress) < 0.001 &&
        Math.abs(motion.targetPointerX - motion.pointerX) < 0.01 &&
        Math.abs(motion.targetPointerY - motion.pointerY) < 0.01;
      if (!isSettled && frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(render);
      }
    };

    const scheduleRender = () => {
      readProgress();
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(render);
      }
    };
    scheduleRenderRef.current = scheduleRender;

    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotion) return;
      motionRef.current.targetPointerX =
        (event.clientX / window.innerWidth - 0.5) * 2;
      motionRef.current.targetPointerY =
        (event.clientY / window.innerHeight - 0.5) * 2;
      scheduleRender();
    };

    const handlePointerLeave = () => {
      motionRef.current.targetPointerX = 0;
      motionRef.current.targetPointerY = 0;
      scheduleRender();
    };

    let targetStep = Math.round(
      motionRef.current.targetProgress * IMMERSIVE_SCROLL_STEPS
    );
    let wheelAccumulator = 0;
    let wheelGestureActive = false;
    let wheelGestureTimer: number | null = null;

    const scheduleWheelGestureEnd = () => {
      if (wheelGestureTimer !== null) {
        window.clearTimeout(wheelGestureTimer);
      }
      wheelGestureTimer = window.setTimeout(() => {
        wheelAccumulator = 0;
        wheelGestureActive = false;
        wheelGestureTimer = null;
      }, 110);
    };

    const handleWheel = (event: WheelEvent) => {
      if (
        reducedMotion ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(".immersive-tuning-panels"))
      ) {
        return;
      }

      const travel = Math.max(1, section.offsetHeight - scrollRoot.clientHeight);
      const sectionStart = section.offsetTop;
      const sectionEnd = sectionStart + travel;
      const scrollTop = scrollRoot.scrollTop;
      const isInsideTrack =
        scrollTop >= sectionStart - 1 && scrollTop <= sectionEnd + 1;
      if (!isInsideTrack || Math.abs(event.deltaY) < 0.01) {
        return;
      }

      const direction = event.deltaY > 0 ? 1 : -1;
      const currentProgress = clamp((scrollTop - sectionStart) / travel);
      if (wheelGestureActive) {
        event.preventDefault();
        scheduleWheelGestureEnd();
        return;
      }
      if (
        (direction > 0 && currentProgress >= 0.999) ||
        (direction < 0 && currentProgress <= 0.001)
      ) {
        wheelAccumulator = 0;
        return;
      }

      event.preventDefault();
      const deltaMultiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scrollRoot.clientHeight
            : 1;
      wheelAccumulator += event.deltaY * deltaMultiplier;
      scheduleWheelGestureEnd();
      if (Math.abs(wheelAccumulator) < 36) {
        return;
      }

      const targetProgress = targetStep / IMMERSIVE_SCROLL_STEPS;
      if (Math.abs(currentProgress - targetProgress) > 0.12) {
        targetStep = Math.round(
          currentProgress * IMMERSIVE_SCROLL_STEPS
        );
      }
      const nextStep = clamp(
        targetStep + direction,
        0,
        IMMERSIVE_SCROLL_STEPS
      );
      targetStep = nextStep;
      wheelAccumulator = 0;
      wheelGestureActive = true;
      scheduleWheelGestureEnd();
      scrollRoot.scrollTo({
        behavior: "smooth",
        top:
          sectionStart +
          travel * (nextStep / IMMERSIVE_SCROLL_STEPS),
      });
    };

    readProgress();
    render();
    scrollRoot.addEventListener("scroll", scheduleRender, { passive: true });
    scrollRoot.addEventListener("wheel", handleWheel, { passive: false });
    section.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });
    section.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("resize", scheduleRender, { passive: true });

    return () => {
      scrollRoot.removeEventListener("scroll", scheduleRender);
      scrollRoot.removeEventListener("wheel", handleWheel);
      section.removeEventListener("pointerleave", handlePointerLeave);
      section.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", scheduleRender);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (wheelGestureTimer !== null) {
        window.clearTimeout(wheelGestureTimer);
      }
      scheduleRenderRef.current = null;
    };
  }, []);

  return (
    <>
      <section
        className="home-screen immersive-portal-track"
        id="immersive-portal"
        ref={portalSectionRef}
        aria-labelledby="immersive-portal-title"
      >
        <div className="immersive-portal-stage">
          <BlueFluidBackground />
          <div
            aria-hidden="true"
            className="immersive-next-scene-mask"
            data-testid="immersive-next-scene-mask"
            ref={nextSceneMaskRef}
          >
            <LoopValuePortalPreview />
          </div>
          <div
            className="immersive-orb-tuning-layer"
            ref={orbTuningLayerRef}
          >
            <div className="immersive-orb-shell" ref={orbRef}>
              <AnimatedOrb className="immersive-orb" />
            </div>
          </div>
          <div className="immersive-portal-vignette" aria-hidden="true" />
          <div
            className="immersive-orb-entry-wash"
            ref={entryWashRef}
            aria-hidden="true"
          />

          <div
            className="immersive-scene-copy-tuning-layer"
            style={
              {
                "--immersive-copy-x": `${copyTuning.x}px`,
                "--immersive-copy-y": `${copyTuning.y}px`,
                "--immersive-copy-scale": copyTuning.scale / 100,
              } as CSSProperties
            }
          >
            <div
              className={`immersive-scene-copy${sceneReady ? " is-ready" : ""}`}
              ref={sceneCopyRef}
            >
              <p>ENTER THE LOOP · 进入 AI 营销世界</p>
              <h2 id="immersive-portal-title">
                <span>穿过数据噪声，</span>
                <span>抵达可执行的策略。</span>
              </h2>
              <span>
                AI LOOP 将行业、内容、供给与 O2O 信号串成一条可追溯路径，
                让每一次判断都有来源、门禁与回执。
              </span>
              <div className="immersive-path" aria-label="策略执行路径">
                <strong>策略</strong>
                <i aria-hidden="true" />
                <strong>执行</strong>
                <i aria-hidden="true" />
                <strong>复盘</strong>
              </div>
            </div>
          </div>

          <ImmersivePortalTuningPanels
            copyValue={copyTuning}
            onCopyChange={setCopyTuning}
            onOrbChange={handleOrbTuningChange}
            orbValue={orbTuning}
          />

          <div className="immersive-scroll-progress" aria-hidden="true">
            <span ref={progressRef} />
          </div>
          <p className="immersive-scroll-hint">向下滚动 · 穿越策略路径</p>
        </div>
      </section>

      <section
        className="home-screen loop-value-section"
        id="real-impact"
        aria-labelledby="loop-value-title"
      >
        <img
          alt=""
          aria-hidden="true"
          className="loop-value-world"
          src={WORLD_ASSET}
        />
        <div className="loop-value-atmosphere" aria-hidden="true" />

        <header className="loop-value-heading">
          <p>REAL IMPACT · AI LOOP 闭环价值</p>
          <h2 id="loop-value-title">一条可追溯的营销闭环</h2>
          <span>
            从趋势洞察到 O2O 复盘，每一步都能被解释、被审批、被回收。
          </span>
        </header>

        <LoopValueCarousel />

        <footer className="loop-value-footer">
          <div className="loop-value-footer-brand">
            <img alt="" aria-hidden="true" src="/brand/ai-loop-infinity-v1.png" />
            <div>
              <strong>AI LOOP</strong>
              <span>精准化营销</span>
            </div>
          </div>
          <div>
            <strong>探索</strong>
            <a href="#six-card-hero">营销闭环</a>
            <a href="#robot-showcase">蜂窝地图</a>
          </div>
          <div>
            <strong>体验</strong>
            <a href="#product-stories">产品矩阵</a>
            <a href="#immersive-portal">策略中枢</a>
          </div>
          <div>
            <strong>系统</strong>
            <a href="#real-impact">价值回响</a>
            <a href="#six-card-hero">返回首页</a>
          </div>
          <small>© 2026 AI LOOP · OTC 精准化营销体验</small>
        </footer>
      </section>
    </>
  );
}
