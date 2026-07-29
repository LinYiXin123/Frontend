"use client";

import Image from "next/image";
import { Button } from "antd";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { TextScatter } from "@/components/home/text-scatter";
import { BlueFluidBackground } from "@/components/ui/blue-fluid-background";
import { GlowCard } from "@/components/ui/spotlight-card";

const CARD_VIDEOS = [
  "/visuals/six-card/loops/01-strategy.mp4",
  "/visuals/six-card/loops/02-content.mp4",
  "/visuals/six-card/loops/03-collaboration.mp4",
  "/visuals/six-card/loops/04-monitoring.mp4",
  "/visuals/six-card/loops/05-o2o.mp4",
  "/visuals/six-card/loops/06-review.mp4",
] as const;

const CARD_BACK_ART = "/visuals/six-card/otc-comic-card-back-v1.png";
const CARD_HOLD_SECONDS = 5;
const CARD_TRANSITION_SECONDS = 0.78;

const CARD_FEATURES = [
  {
    label: "01",
    title: "AI 策略大脑",
    description: "洞察与产品双轮驱动，输出清晰策略指令",
  },
  {
    label: "02",
    title: "AI 引擎·内容生产",
    description: "匹配区域、人群与达人矩阵，精细化生产内容",
  },
  {
    label: "03",
    title: "团队协作·内容发布",
    description: "匹配账号、内容与节奏，推动发布流程化",
  },
  {
    label: "04",
    title: "AI 检测·流量峰值",
    description: "持续监测内容流量，识别两小时数据波动",
  },
  {
    label: "05",
    title: "AI 引擎·O2O 运营",
    description: "结合区域、人群、时段与 SKU 精准运营",
  },
  {
    label: "06",
    title: "AI 检测·复盘反哺",
    description: "将复盘经验回写策略大脑，形成自循环",
  },
] as const;

const HERO_CAPABILITIES = [
  {
    code: "01",
    title: "AI 策略大脑",
    description: "识别趋势，生成区域化营销指令",
  },
  {
    code: "02",
    title: "AI 引擎·内容生产",
    description: "匹配区域、人群与达人，精细化生成内容",
  },
  {
    code: "03",
    title: "团队协作·内容发布",
    description: "匹配账号、内容与节奏，推动发布流程",
  },
  {
    code: "04",
    title: "AI 检测·流量峰值",
    description: "持续监测内容流量，识别两小时异常",
  },
  {
    code: "05",
    title: "AI 引擎·O2O 运营",
    description: "结合区域、人群、时段与 SKU 精准运营",
  },
  {
    code: "06",
    title: "AI 检测·复盘反哺",
    description: "将复盘经验回写策略，形成自循环",
  },
] as const;

const CAPABILITIES_PER_PAGE = 3;
const CAPABILITY_PAGE_INTERVAL = 6500;
const CAPABILITY_PAGES = Array.from(
  {
    length: Math.ceil(HERO_CAPABILITIES.length / CAPABILITIES_PER_PAGE),
  },
  (_, pageIndex) =>
    HERO_CAPABILITIES.slice(
      pageIndex * CAPABILITIES_PER_PAGE,
      (pageIndex + 1) * CAPABILITIES_PER_PAGE
    )
);

const THICKNESS_LAYERS = [-1.47, -0.73, 0, 0.73, 1.47] as const;

type CardMetrics = {
  cardW: number;
  cardH: number;
};

type CarouselTransition = {
  from: number;
  to: number;
  elapsed: number;
  duration: number;
};

type HeroCharacterPose = {
  x: number;
  y: number;
  scale: number;
};

const HERO_CHARACTER_ENTRY_POSE: HeroCharacterPose = {
  x: 300,
  y: -27,
  scale: 0.58,
};

const HERO_CHARACTER_FINAL_POSE: HeroCharacterPose = {
  x: -36,
  y: -27,
  scale: 0.96,
};

const HERO_CHARACTER_INTRO_DURATION = 1600;

export function SixCardHero() {
  const heroRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameId = useRef(0);
  const progress = useRef(0);
  const carouselClock = useRef(0);
  const carouselPaused = useRef(false);
  const carouselTransition = useRef<CarouselTransition | null>(null);
  const lastFrameTime = useRef<number | null>(null);
  const mouse = useRef({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  });
  const [capabilityPage, setCapabilityPage] = useState(0);
  const [metrics, setMetrics] = useState<CardMetrics>({
    cardW: 336,
    cardH: 211,
  });

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = hero.getBoundingClientRect();
      const rx =
        (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2);
      const ry =
        (event.clientY - (bounds.top + bounds.height / 2)) /
        (bounds.height / 2);

      mouse.current.targetX = Math.max(-1, Math.min(1, rx));
      mouse.current.targetY = Math.max(-1, Math.min(1, ry));

      const hoverZone = hero.querySelector<HTMLElement>(
        "[data-carousel-hover-zone]"
      );
      const hoverBounds = hoverZone?.getBoundingClientRect();
      carouselPaused.current = Boolean(
        hoverBounds &&
          event.clientX >= hoverBounds.left &&
          event.clientX <= hoverBounds.right &&
          event.clientY >= hoverBounds.top &&
          event.clientY <= hoverBounds.bottom
      );
    };

    const handlePointerLeave = () => {
      mouse.current.targetX = 0;
      mouse.current.targetY = 0;
      carouselPaused.current = false;
    };

    hero.addEventListener("pointermove", handlePointerMove, { passive: true });
    hero.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      hero.removeEventListener("pointermove", handlePointerMove);
      hero.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    const character = hero?.querySelector<HTMLElement>(
      '[data-testid="blue-hoodie-character"]'
    );
    const scrollRoot = hero?.closest<HTMLElement>(".home-pages");
    if (!hero || !character || !scrollRoot) return undefined;

    let characterFrameId: number | null = null;
    let introStartTime: number | null = null;
    let introActive = false;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const clampProgress = (value: number) =>
      Math.max(0, Math.min(1, value));

    const applyCharacterProgress = (nextProgress: number) => {
      const motionProgress = clampProgress(nextProgress);
      const x =
        HERO_CHARACTER_ENTRY_POSE.x +
        (HERO_CHARACTER_FINAL_POSE.x - HERO_CHARACTER_ENTRY_POSE.x) *
          motionProgress;
      const y =
        HERO_CHARACTER_ENTRY_POSE.y +
        (HERO_CHARACTER_FINAL_POSE.y - HERO_CHARACTER_ENTRY_POSE.y) *
          motionProgress;
      const scale =
        HERO_CHARACTER_ENTRY_POSE.scale +
        (HERO_CHARACTER_FINAL_POSE.scale -
          HERO_CHARACTER_ENTRY_POSE.scale) *
          motionProgress;

      character.style.setProperty("--hero-character-x", `${x.toFixed(2)}px`);
      character.style.setProperty("--hero-character-y", `${y.toFixed(2)}px`);
      character.style.setProperty(
        "--hero-character-scale",
        scale.toFixed(4)
      );
      character.dataset.motionProgress = motionProgress.toFixed(3);
    };

    const getScrollProgress = () => {
      const rootBounds = scrollRoot.getBoundingClientRect();
      const heroBounds = hero.getBoundingClientRect();
      return clampProgress(
        (heroBounds.bottom - rootBounds.top) /
          Math.max(heroBounds.height, 1)
      );
    };

    const updateFromScroll = () => {
      characterFrameId = null;
      introActive = false;
      const scrollProgress = getScrollProgress();
      applyCharacterProgress(
        reducedMotion ? (scrollProgress >= 0.5 ? 1 : 0) : scrollProgress
      );
    };

    const scheduleScrollUpdate = () => {
      if (introActive && getScrollProgress() >= 0.998) return;

      if (introActive) {
        introActive = false;
        if (characterFrameId !== null) {
          window.cancelAnimationFrame(characterFrameId);
          characterFrameId = null;
        }
      }

      if (characterFrameId !== null) return;
      characterFrameId = window.requestAnimationFrame(updateFromScroll);
    };

    const animateIntro = (timestamp: number) => {
      if (!introActive) return;
      if (introStartTime === null) {
        introStartTime = timestamp;
      }

      const linearProgress = clampProgress(
        (timestamp - introStartTime) / HERO_CHARACTER_INTRO_DURATION
      );
      const easedProgress = 1 - Math.pow(1 - linearProgress, 3);
      applyCharacterProgress(easedProgress);

      if (linearProgress < 1) {
        characterFrameId = window.requestAnimationFrame(animateIntro);
      } else {
        introActive = false;
        characterFrameId = null;
      }
    };

    const initialScrollProgress = getScrollProgress();
    if (reducedMotion) {
      applyCharacterProgress(initialScrollProgress >= 0.5 ? 1 : 0);
    } else if (initialScrollProgress >= 0.998) {
      introActive = true;
      applyCharacterProgress(0);
      characterFrameId = window.requestAnimationFrame(animateIntro);
    } else {
      applyCharacterProgress(initialScrollProgress);
    }

    scrollRoot.addEventListener("scroll", scheduleScrollUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleScrollUpdate, {
      passive: true,
    });

    return () => {
      scrollRoot.removeEventListener("scroll", scheduleScrollUpdate);
      window.removeEventListener("resize", scheduleScrollUpdate);
      if (characterFrameId !== null) {
        window.cancelAnimationFrame(characterFrameId);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let cardWidth = Math.round(viewportWidth * 0.16 + 130);
      const heightFactor = Math.min(
        1,
        Math.max(0.65, viewportHeight / 850)
      );

      cardWidth = Math.round(cardWidth * heightFactor);
      cardWidth = Math.min(336, Math.max(150, cardWidth));

      setMetrics({
        cardW: cardWidth,
        cardH: Math.round(cardWidth / 1.5925),
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const pageTimer = window.setInterval(() => {
      setCapabilityPage(
        (currentPage) => (currentPage + 1) % CAPABILITY_PAGES.length
      );
    }, CAPABILITY_PAGE_INTERVAL);

    return () => window.clearInterval(pageTimer);
  }, [capabilityPage]);

  useEffect(() => {
    lastFrameTime.current = null;

    const render = (timestamp: number) => {
      if (lastFrameTime.current === null) {
        lastFrameTime.current = timestamp;
      }

      const deltaSeconds = Math.min(
        (timestamp - lastFrameTime.current) / 1000,
        0.1
      );
      lastFrameTime.current = timestamp;
      const cycleSeconds = CARD_HOLD_SECONDS + CARD_TRANSITION_SECONDS;
      const activeTransition = carouselTransition.current;

      if (activeTransition) {
        if (!carouselPaused.current) {
          activeTransition.elapsed += deltaSeconds;
        }

        const transitionProgress = Math.min(
          1,
          activeTransition.elapsed / activeTransition.duration
        );
        const easedTransition =
          transitionProgress *
          transitionProgress *
          (3 - 2 * transitionProgress);
        progress.current =
          activeTransition.from +
          (activeTransition.to - activeTransition.from) * easedTransition;

        if (transitionProgress >= 1) {
          progress.current = activeTransition.to;
          carouselClock.current = activeTransition.to * cycleSeconds;
          carouselTransition.current = null;
        }
      } else {
        if (!carouselPaused.current) {
          carouselClock.current += deltaSeconds;
        }

        const completedSteps = Math.floor(
          carouselClock.current / cycleSeconds
        );
        const phaseSeconds =
          carouselClock.current - completedSteps * cycleSeconds;

        if (phaseSeconds <= CARD_HOLD_SECONDS) {
          progress.current = completedSteps;
        } else {
          const transitionProgress = Math.min(
            1,
            (phaseSeconds - CARD_HOLD_SECONDS) / CARD_TRANSITION_SECONDS
          );
          const easedTransition =
            transitionProgress *
            transitionProgress *
            (3 - 2 * transitionProgress);
          progress.current = completedSteps + easedTransition;
        }
      }

      mouse.current.x +=
        (mouse.current.targetX - mouse.current.x) * 0.08;
      mouse.current.y +=
        (mouse.current.targetY - mouse.current.y) * 0.08;

      const cardCount = CARD_FEATURES.length;
      const viewportHeight =
        heroRef.current?.clientHeight ?? window.innerHeight;
      const virtualActiveIndex = progress.current;

      for (let index = 0; index < cardCount; index += 1) {
        const card = cardRefs.current[index];
        if (!card) continue;

        let offset = index - virtualActiveIndex;
        const halfCount = cardCount / 2;
        while (offset > halfCount) offset -= cardCount;
        while (offset < -halfCount) offset += cardCount;

        const absoluteOffset = Math.abs(offset);
        const direction = Math.sign(offset);
        const fadeStartOffset = 2.65;
        const fadeEndOffset = 3;

        if (absoluteOffset > fadeEndOffset) {
          card.style.visibility = "hidden";
          continue;
        }

        card.style.visibility = "visible";

        const trackOpacity =
          absoluteOffset <= fadeStartOffset
            ? 1
            : Math.max(
                0,
                (fadeEndOffset - absoluteOffset) /
                  (fadeEndOffset - fadeStartOffset)
              );

        const peekAmount = -55;
        const perspectiveDistance = 1350;
        const outerBandStep =
          cardCount >= 6 ? metrics.cardH * 0.81 : 0;

        let translateY = 0;
        let translateZ = 0;
        let rotation = 0;

        if (absoluteOffset <= 1) {
          const easedOffset =
            absoluteOffset *
            absoluteOffset *
            (3 - 2 * absoluteOffset);

          translateY =
            -direction * (easedOffset * metrics.cardH);
          translateZ = 400 + easedOffset * (220 - 400);
          rotation = easedOffset * 132;
        } else if (absoluteOffset <= 2) {
          const normalizedOffset = absoluteOffset - 1;
          const easedOffset =
            normalizedOffset *
            normalizedOffset *
            (3 - 2 * normalizedOffset);
          const projectionScale = perspectiveDistance / (perspectiveDistance + 60);
          const viewportEdgeY =
            (viewportHeight / 2 - peekAmount) / projectionScale -
            metrics.cardH / 2;
          const endY =
            cardCount >= 6
              ? metrics.cardH + outerBandStep
              : viewportEdgeY;
          const currentY =
            metrics.cardH + easedOffset * (endY - metrics.cardH);

          translateY = -direction * currentY;
          translateZ = 220 + easedOffset * (-60 - 220);
          rotation = 132 + easedOffset * (122 - 132);
        } else {
          const normalizedOffset = Math.min(absoluteOffset - 2, 1);
          const easedOffset =
            normalizedOffset *
            normalizedOffset *
            (3 - 2 * normalizedOffset);
          const projectionScale = perspectiveDistance / (perspectiveDistance + 60);
          const viewportEdgeY =
            (viewportHeight / 2 - peekAmount) / projectionScale -
            metrics.cardH / 2;
          const startY =
            cardCount >= 6
              ? metrics.cardH + outerBandStep
              : viewportEdgeY;
          const endProjectionScale =
            perspectiveDistance / (perspectiveDistance + 250);
          const offscreenY =
            (viewportHeight / 2 + 100) / endProjectionScale +
            metrics.cardH / 2;
          const endY = Math.max(offscreenY, startY + outerBandStep);
          const currentY = startY + easedOffset * (endY - startY);

          translateY = -direction * currentY;
          translateZ = -60 + easedOffset * (-250 + 60);
          rotation = 122 + easedOffset * (98 - 122);
        }

        const centerFactor = Math.max(0, 1 - absoluteOffset);
        const activeTiltX = -mouse.current.y * 12 * centerFactor;
        const activeTiltY = mouse.current.x * 15 * centerFactor;
        const totalRotationX = -direction * rotation + activeTiltX;

        card.style.zIndex = Math.round(translateZ).toString();
        card.style.opacity = trackOpacity.toFixed(3);
        card.style.transform = [
          `translateY(${translateY.toFixed(2)}px)`,
          `translateZ(${translateZ.toFixed(2)}px)`,
          `rotateX(${totalRotationX.toFixed(2)}deg)`,
          `rotateY(${activeTiltY.toFixed(2)}deg)`,
          "rotateZ(-3deg)",
        ].join(" ");
      }

      frameId.current = window.requestAnimationFrame(render);
    };

    frameId.current = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId.current);
    };
  }, [metrics]);

  const progressStyle = {
    "--capability-duration": `${CAPABILITY_PAGE_INTERVAL}ms`,
  } as CSSProperties;
  const characterEntryStyle = {
    "--hero-character-x": `${HERO_CHARACTER_ENTRY_POSE.x}px`,
    "--hero-character-y": `${HERO_CHARACTER_ENTRY_POSE.y}px`,
    "--hero-character-scale": HERO_CHARACTER_ENTRY_POSE.scale,
  } as CSSProperties;

  const selectCarouselCard = (targetIndex: number) => {
    const cardCount = CARD_FEATURES.length;
    const currentProgress = progress.current;
    const nearestCycle = Math.round(
      (currentProgress - targetIndex) / cardCount
    );
    const targetProgress = targetIndex + nearestCycle * cardCount;
    const distance = Math.abs(targetProgress - currentProgress);
    const cycleSeconds = CARD_HOLD_SECONDS + CARD_TRANSITION_SECONDS;

    if (distance < 0.01) {
      progress.current = targetProgress;
      carouselClock.current = targetProgress * cycleSeconds;
      carouselTransition.current = null;
      return;
    }

    carouselTransition.current = {
      from: currentProgress,
      to: targetProgress,
      elapsed: 0,
      duration: Math.min(1.6, 0.58 + distance * 0.22),
    };
  };

  return (
    <section
      ref={heroRef}
      id="six-card-hero"
      className="home-screen six-card-hero relative flex min-h-[100svh] w-full select-none items-center justify-center overflow-hidden bg-white text-[#69B1FF]"
      data-testid="six-card-hero"
      aria-labelledby="project-hero-title"
    >
      <BlueFluidBackground />

      <Image
        src="/visuals/six-card/blue-hoodie-character.png"
        alt=""
        width={1200}
        height={1600}
        priority
        unoptimized
        draggable={false}
        data-character-motion="scroll-linked"
        data-testid="blue-hoodie-character"
        className="pointer-events-none absolute bottom-3 right-[0.5vw] z-[25] hidden w-[36vw] min-w-[420px] max-w-[620px] select-none object-contain drop-shadow-[0_28px_45px_rgba(22,119,255,0.2)] lg:block"
        style={characterEntryStyle}
      />

      <div
        id="project-hero-copy"
        className="pointer-events-auto absolute left-[6vw] top-[5vh] z-20 w-[88vw] sm:left-[4vw] sm:top-[calc(38%+10px)] sm:w-[27vw] sm:max-w-[380px] sm:origin-top-left sm:-translate-y-1/2 sm:scale-[1.36]"
      >
        <div className="inline-flex items-center rounded-full border border-[#BAE0FF] bg-white/80 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#1677FF] shadow-[0_6px_18px_rgba(22,119,255,0.08)] backdrop-blur-xl">
          AI 策略与 O2O 响应
        </div>

        <TextScatter
          id="project-hero-title"
          text={"趋势出现时，\n营销已经开始行动。"}
          as="h1"
          className="mt-4 whitespace-nowrap text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] text-[#102A56] sm:text-[clamp(34px,3.05vw,46px)]"
          velocity={200}
          rotation={90}
          scale={1}
          returnAfter={1}
          duration={2}
        />

        <p className="mt-4 max-w-[34em] text-[13px] font-medium leading-6 text-[#35527A] sm:text-[14px]">
          汇聚行业、内容与供给信号，把洞察转成城市与蜂窝级响应建议。
        </p>

        <div className="mt-5 hidden sm:block" aria-label="平台六步核心能力">
          <div className="capability-pages-stage">
            {CAPABILITY_PAGES.map((pageItems, pageIndex) => (
              <div
                key={pageIndex}
                className={`capability-page space-y-3 ${
                  pageIndex === capabilityPage ? "is-active" : ""
                }`}
                aria-hidden={pageIndex !== capabilityPage}
                aria-label={`第 ${pageIndex + 1} 组能力，共 ${CAPABILITY_PAGES.length} 组`}
              >
                {pageItems.map((item, itemIndex) => {
                  const cardIndex =
                    pageIndex * CAPABILITIES_PER_PAGE + itemIndex;

                  return (
                    <GlowCard
                      key={item.code}
                      as="article"
                      glowColor="blue"
                      customSize
                      role="button"
                      tabIndex={0}
                      aria-label={`切换到第 ${item.code} 张卡片：${item.title}`}
                      onClick={() => selectCarouselCard(cardIndex)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectCarouselCard(cardIndex);
                        }
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-[18px] p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1677FF]"
                    >
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-[#91CAFF] bg-[#E6F4FF] font-mono text-[15px] font-bold tracking-[0.06em] text-[#1677FF]"
                        aria-hidden="true"
                      >
                        {item.code}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold leading-5 text-[#102A56]">
                          {item.title}
                        </h2>
                        <p className="mt-0.5 text-[11px] leading-[1.5] text-[#4F6B8A]">
                          {item.description}
                        </p>
                      </div>
                    </GlowCard>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-[14px] border border-white/80 bg-white/55 p-1.5 shadow-[0_8px_20px_rgba(22,119,255,0.08)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-1.5"
                aria-label="能力轮播分页"
              >
                {CAPABILITY_PAGES.map((_, pageIndex) => (
                  <Button
                    key={pageIndex}
                    type="text"
                    size="small"
                    htmlType="button"
                    aria-label={`显示第 ${pageIndex + 1} 组能力`}
                    aria-current={
                      pageIndex === capabilityPage ? "true" : undefined
                    }
                    data-active={pageIndex === capabilityPage}
                    onClick={() => setCapabilityPage(pageIndex)}
                    className="hero-capability-tab"
                  >
                    {pageIndex === 0 ? "01—03" : "04—06"}
                  </Button>
                ))}
              </div>
              <span className="pr-1 text-[9px] font-semibold tracking-[0.1em] text-[#5C83AD]">
                6 步闭环
              </span>
            </div>

            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#D9ECFF]">
              <div
                key={capabilityPage}
                className="capability-progress h-full w-full rounded-full bg-gradient-to-r from-[#69B1FF] to-[#1677FF]"
                style={progressStyle}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none relative z-30 flex h-full w-full items-center justify-center"
        style={{ perspective: "1350px" }}
        data-testid="six-card-carousel"
      >
        <div
          className="pointer-events-auto absolute origin-center sm:scale-[1.16]"
          data-carousel-hover-zone
          onPointerEnter={() => {
            carouselPaused.current = true;
          }}
          onPointerLeave={() => {
            carouselPaused.current = false;
          }}
          aria-label="六张能力卡片轮播区"
          style={{
            width: metrics.cardW,
            height: metrics.cardH,
            transformStyle: "preserve-3d",
          }}
        >
          {CARD_FEATURES.map((feature, index) => (
            <div
              key={feature.label}
              ref={(element) => {
                cardRefs.current[index] = element;
              }}
              className="absolute inset-0"
              data-testid="hero-card"
              data-card-index={index}
              style={{
                width: metrics.cardW,
                height: metrics.cardH,
                transformStyle: "preserve-3d",
                backfaceVisibility: "visible",
              }}
            >
              {THICKNESS_LAYERS.map((zOffset, layerIndex) => {
                const isFrontFace =
                  layerIndex === THICKNESS_LAYERS.length - 1;
                const isBackFace = layerIndex === 0;

                if (!isFrontFace && !isBackFace) {
                  return (
                    <div
                      key={zOffset}
                      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px] border border-[#808080]"
                      style={{
                        backgroundColor: "#808080",
                        transform: `translateZ(${zOffset}px)`,
                      }}
                    />
                  );
                }

                if (isFrontFace) {
                  return (
                    <div
                      key={zOffset}
                      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px] border border-white/15"
                      style={{
                        backgroundColor: "#E6F4FF",
                        transform: `translateZ(${zOffset}px)`,
                        backfaceVisibility: "hidden",
                        boxShadow:
                          "inset 0 1px 1px rgba(255, 255, 255, 0.15)",
                      }}
                    >
                      <video
                        src={CARD_VIDEOS[index]}
                        aria-label={feature.title}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        disablePictureInPicture
                        className="card-media-video absolute inset-0 h-full w-full rounded-[16px] object-cover"
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={zOffset}
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px] border border-white/80"
                    style={{
                      backgroundColor: "#E6F4FF",
                      transform: `translateZ(${zOffset}px) rotateX(180deg)`,
                      backfaceVisibility: "hidden",
                      boxShadow:
                        "inset 0 1px 1px rgba(255, 255, 255, 0.8)",
                    }}
                  >
                    <Image
                      src={CARD_BACK_ART}
                      alt=""
                      fill
                      sizes={`${metrics.cardW}px`}
                      unoptimized
                      className="card-back-art object-cover"
                    />
                    <div className="absolute inset-0 z-[5] bg-gradient-to-r from-white/30 via-transparent to-[#D6EEFF]/10" />

                    <div className="absolute left-[6%] top-1/2 z-20 w-[68%] -translate-y-1/2 rounded-[12px] border border-white/90 bg-white/[0.72] px-3.5 py-3 text-left shadow-[0_10px_30px_rgba(44,105,170,0.13)] backdrop-blur-[7px] sm:px-4 sm:py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#B7D7FF] bg-[#EDF6FF]/90 px-2 py-1 text-[7px] font-bold tracking-[0.14em] text-[#3978C6] sm:text-[8px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#55C8E9] shadow-[0_0_8px_rgba(85,200,233,0.8)]" />
                          OTC AI LOOP
                        </div>
                        <div className="text-[8px] font-bold tracking-[0.12em] text-[#76A9E6] sm:text-[9px]">
                          {feature.label} / 06
                        </div>
                      </div>

                      <div className="mt-2 text-[17px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#173F70] sm:text-[20px]">
                        {feature.title}
                      </div>
                      <div className="mt-1.5 max-w-[96%] text-[9px] font-semibold leading-[1.4] tracking-[0.01em] text-[#52779E] sm:text-[11px]">
                        {feature.description}
                      </div>

                      <div className="mt-2.5 flex items-center gap-1">
                        {CARD_FEATURES.map((step, stepIndex) => (
                          <span
                            key={step.label}
                            className="h-1 rounded-full"
                            style={{
                              width: stepIndex === index ? 22 : 7,
                              backgroundColor:
                                stepIndex === index ? "#4F8FFF" : "#C9E2FA",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <a
        href="#robot-showcase"
        className="hero-scroll-cue pointer-events-auto absolute bottom-4 left-1/2 z-40 -translate-x-1/2"
        aria-label="向下查看交互式 3D 机器人"
      >
        <span />
      </a>
    </section>
  );
}
