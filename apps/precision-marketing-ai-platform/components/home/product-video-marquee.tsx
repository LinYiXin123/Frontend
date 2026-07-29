"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { BlueFluidBackground } from "@/components/ui/blue-fluid-background";
import {
  addProductRowScrollBoost,
  decayProductRowScrollBoost,
  getLoopedProductRowTranslate,
  PRODUCT_ROW_AUTO_SPEED,
  PRODUCT_ROW_STAGGER,
} from "@/components/home/product-story-motion";
import {
  DEFAULT_PRODUCT_STORY_HEADING_TUNING,
  ProductStoryHeadingTuningPanel,
} from "@/components/home/product-story-heading-tuning-panel";
import { TextScatter } from "@/components/home/text-scatter";

type ProductStory = {
  displayName: string;
  genericName: string;
  id: string;
  poster: string;
};

const PRODUCT_VIDEO_BASE = "/visuals/products/videos";

const ROW_ONE: ProductStory[] = [
  {
    id: "lizhu-dele-capsule",
    displayName: "丽珠得乐",
    genericName: "枸橼酸铋钾胶囊",
    poster: "/visuals/products/posters/lizhu-dele-capsule.png",
  },
  {
    id: "yilian",
    displayName: "壹丽安",
    genericName: "艾普拉唑肠溶片",
    poster: "/visuals/products/posters/yilian.jpg",
  },
  {
    id: "lizhu-weisanlian",
    displayName: "丽珠维三联",
    genericName: "枸橼酸铋钾片／替硝唑片／克拉霉素片组合包装",
    poster: "/visuals/products/posters/lizhu-weisanlian.jpg",
  },
  {
    id: "lizhu-changle",
    displayName: "丽珠肠乐",
    genericName: "双歧杆菌胶囊",
    poster: "/visuals/products/posters/lizhu-changle.jpg",
  },
  {
    id: "libeile",
    displayName: "丽倍乐",
    genericName: "雷贝拉唑钠肠溶胶囊",
    poster: "/visuals/products/posters/libeile.jpg",
  },
  {
    id: "limeilin",
    displayName: "丽美啉",
    genericName: "多潘立酮片",
    poster: "/visuals/products/posters/limeilin.jpg",
  },
  {
    id: "ruifulin",
    displayName: "瑞复啉",
    genericName: "盐酸伊托必利片",
    poster: "/visuals/products/posters/ruifulin.jpg",
  },
  {
    id: "jiali",
    displayName: "甲力",
    genericName: "克拉霉素片",
    poster: "/visuals/products/posters/jiali.jpg",
  },
  {
    id: "lizhu-xing",
    displayName: "丽珠星",
    genericName: "罗红霉素分散片",
    poster: "/visuals/products/posters/lizhu-xing.jpg",
  },
  {
    id: "lizhu-wei",
    displayName: "丽珠威",
    genericName: "盐酸伐昔洛韦片",
    poster: "/visuals/products/posters/lizhu-wei.jpg",
  },
  {
    id: "lizhu-qile",
    displayName: "丽珠奇乐",
    genericName: "阿奇霉素分散片",
    poster: "/visuals/products/posters/lizhu-qile.jpg",
  },
];

const ROW_TWO: ProductStory[] = [
  {
    id: "lizhu-keduxing",
    displayName: "丽珠克毒星",
    genericName: "阿昔洛韦片",
    poster: "/visuals/products/posters/lizhu-keduxing.jpg",
  },
  {
    id: "lizhu-kuaifujing",
    displayName: "丽珠快服净",
    genericName: "替硝唑片",
    poster: "/visuals/products/posters/lizhu-kuaifujing.jpg",
  },
  {
    id: "ruibile",
    displayName: "瑞必乐",
    genericName: "马来酸氟伏沙明片",
    poster: "/visuals/products/posters/ruibile.jpg",
  },
  {
    id: "kangerting",
    displayName: "康尔汀",
    genericName: "盐酸哌罗匹隆片",
    poster: "/visuals/products/posters/kangerting.jpg",
  },
  {
    id: "xinnaolilong",
    displayName: "新瑙力隆",
    genericName: "二维三七桂利嗪胶囊",
    poster: "/visuals/products/posters/xinnaolilong.jpg",
  },
  {
    id: "lizhu-weike",
    displayName: "丽珠维可",
    genericName: "缬沙坦胶囊",
    poster: "/visuals/products/posters/lizhu-weike.jpg",
  },
  {
    id: "xianlite",
    displayName: "仙利特",
    genericName: "盐酸西替利嗪片",
    poster: "/visuals/products/posters/xianlite.jpg",
  },
  {
    id: "lizhu-feng",
    displayName: "丽珠风",
    genericName: "泛昔洛韦片",
    poster: "/visuals/products/posters/lizhu-feng.jpg",
  },
  {
    id: "lizhu-junle",
    displayName: "丽珠君乐",
    genericName: "喷昔洛韦乳膏",
    poster: "/visuals/products/posters/lizhu-junle.jpg",
  },
  {
    id: "lizhu-dele-tablets",
    displayName: "丽珠得乐片",
    genericName: "枸橼酸铋钾片",
    poster: "/visuals/products/posters/lizhu-dele.jpg",
  },
];

const TRIPLED_ROW_ONE = [...ROW_ONE, ...ROW_ONE, ...ROW_ONE];
const TRIPLED_ROW_TWO = [...ROW_TWO, ...ROW_TWO, ...ROW_TWO];

function ProductVideoCard({
  product,
  duplicateIndex,
}: {
  product: ProductStory;
  duplicateIndex: number;
}) {
  return (
    <article
      className="product-story-card"
      data-product-story-card
      aria-hidden={duplicateIndex > 0 ? "true" : undefined}
      aria-label={
        duplicateIndex === 0
          ? `${product.displayName}，${product.genericName}`
          : undefined
      }
    >
      <video
        className="product-story-media"
        data-product-card
        data-product-loop="true"
        muted
        loop
        playsInline
        preload="none"
        data-poster={product.poster}
        aria-hidden="true"
      >
        <source
          data-src={`${PRODUCT_VIDEO_BASE}/${product.id}.mp4`}
          type="video/mp4"
        />
      </video>
      <div className="product-story-sheen" aria-hidden="true" />
      <div className="product-story-label">
        <strong>{product.displayName}</strong>
        <span>{product.genericName}</span>
      </div>
    </article>
  );
}

function ProductRow({
  products,
  rowRef,
}: {
  products: ProductStory[];
  rowRef: React.RefObject<HTMLDivElement | null>;
}) {
  const sourceLength =
    products.length === TRIPLED_ROW_ONE.length ? ROW_ONE.length : ROW_TWO.length;

  return (
    <div className="product-story-row-viewport" data-product-row-viewport>
      <div
        ref={rowRef}
        className="product-story-row"
        data-product-source-length={sourceLength}
        data-product-story-row
        style={{ willChange: "transform" }}
      >
        {products.map((product, index) => (
          <ProductVideoCard
            key={`${product.id}-${index}`}
            product={product}
            duplicateIndex={Math.floor(index / sourceLength)}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductVideoMarquee() {
  const [headingTuning, setHeadingTuning] = useState(
    DEFAULT_PRODUCT_STORY_HEADING_TUNING
  );
  const sectionRef = useRef<HTMLElement>(null);
  const firstRowRef = useRef<HTMLDivElement>(null);
  const secondRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const scrollRoot = document.querySelector<HTMLElement>(".home-pages");
    if (!section || !scrollRoot) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let animationFrame: number | null = null;
    let lastFrameTime: number | null = null;
    let lastScrollTop = scrollRoot.scrollTop;
    let motionDistance = 0;
    let scrollBoost = 0;
    let isVisible = false;
    let firstCycleWidth = 0;
    let secondCycleWidth = 0;

    const getCycleWidth = (row: HTMLDivElement | null) => {
      if (!row) return 0;

      const sourceLength = Number(row.dataset.productSourceLength);
      const firstCard = row.children.item(0) as HTMLElement | null;
      const repeatedCard = row.children.item(sourceLength) as HTMLElement | null;

      return firstCard && repeatedCard
        ? repeatedCard.offsetLeft - firstCard.offsetLeft
        : 0;
    };

    const measureRows = () => {
      firstCycleWidth = getCycleWidth(firstRowRef.current);
      secondCycleWidth = getCycleWidth(secondRowRef.current);
    };

    const renderRows = () => {
      if (firstRowRef.current) {
        const translateX = getLoopedProductRowTranslate({
          cycleWidth: firstCycleWidth,
          direction: -1,
          distance: motionDistance,
          stagger: -PRODUCT_ROW_STAGGER / 2,
        });
        firstRowRef.current.style.transform = `translate3d(${translateX}px, 0, 0)`;
      }
      if (secondRowRef.current) {
        const translateX = getLoopedProductRowTranslate({
          cycleWidth: secondCycleWidth,
          direction: 1,
          distance: motionDistance,
          stagger: PRODUCT_ROW_STAGGER / 2,
        });
        secondRowRef.current.style.transform = `translate3d(${translateX}px, 0, 0)`;
      }
    };

    const animateRows = (time: number) => {
      animationFrame = null;
      if (!isVisible || reducedMotion) return;

      if (lastFrameTime === null) {
        lastFrameTime = time;
      }
      const elapsedSeconds = Math.min(
        0.05,
        Math.max(0, (time - lastFrameTime) / 1000)
      );
      lastFrameTime = time;
      motionDistance +=
        (PRODUCT_ROW_AUTO_SPEED + scrollBoost) * elapsedSeconds;
      scrollBoost = decayProductRowScrollBoost(
        scrollBoost,
        elapsedSeconds
      );
      renderRows();
      animationFrame = window.requestAnimationFrame(animateRows);
    };

    const startAnimation = () => {
      measureRows();
      renderRows();
      if (!reducedMotion && animationFrame === null) {
        lastFrameTime = null;
        animationFrame = window.requestAnimationFrame(animateRows);
      }
    };

    const handleScroll = () => {
      const nextScrollTop = scrollRoot.scrollTop;
      const scrollDelta = nextScrollTop - lastScrollTop;
      lastScrollTop = nextScrollTop;

      if (isVisible && !reducedMotion && scrollDelta !== 0) {
        scrollBoost = addProductRowScrollBoost(scrollBoost, scrollDelta);
      }
    };

    const handleResize = () => {
      measureRows();
      renderRows();
    };

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        lastScrollTop = scrollRoot.scrollTop;

        if (isVisible) {
          startAnimation();
          return;
        }
        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        lastFrameTime = null;
        scrollBoost = 0;
      },
      { root: scrollRoot, rootMargin: "18% 0px", threshold: 0 }
    );

    measureRows();
    renderRows();
    visibilityObserver.observe(section);
    scrollRoot.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      visibilityObserver.disconnect();
      scrollRoot.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const scrollRoot = document.querySelector<HTMLElement>(".home-pages");
    if (!section) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          const isPlayable = video.dataset.productLoop === "true";
          if (!entry.isIntersecting || !isPlayable) {
            video.pause();
            if (entry.isIntersecting && video.dataset.poster && !video.poster) {
              video.poster = video.dataset.poster;
            }
            return;
          }

          if (video.dataset.poster && !video.poster) {
            video.poster = video.dataset.poster;
          }
          const source = video.querySelector<HTMLSourceElement>(
            "source[data-src]"
          );
          if (source?.dataset.src && !source.src) {
            source.src = source.dataset.src;
            video.load();
          }
          void video.play().catch(() => {
            // The poster remains visible when autoplay is blocked.
          });
        });
      },
      { root: scrollRoot, rootMargin: "25% 96px", threshold: 0.08 }
    );

    const videos = section.querySelectorAll<HTMLVideoElement>(
      "video[data-product-card]"
    );
    videos.forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="product-stories"
      className="home-screen product-story-marquee"
      aria-labelledby="product-story-title"
    >
      <BlueFluidBackground />
      <div
        className="product-story-heading product-story-heading-tuning-layer"
        style={
          {
            "--product-story-heading-scale": headingTuning.scale / 100,
            "--product-story-heading-x": `${headingTuning.x}px`,
            "--product-story-heading-y": `${headingTuning.y}px`,
          } as CSSProperties
        }
      >
        <TextScatter
          as="p"
          text="PRODUCT STORIES · 丽珠产品矩阵"
          className="product-story-eyebrow-scatter"
          velocity={200}
          rotation={90}
          scale={1}
          returnAfter={1}
          duration={2}
        />
        <TextScatter
          id="product-story-title"
          as="h2"
          text="让每个产品，都拥有自己的动态叙事。"
          className="product-story-title-scatter"
          velocity={200}
          rotation={90}
          scale={1}
          returnAfter={1}
          duration={2}
        />
      </div>
      <ProductStoryHeadingTuningPanel
        onChange={setHeadingTuning}
        value={headingTuning}
      />
      <div className="product-story-rows">
        <ProductRow products={TRIPLED_ROW_ONE} rowRef={firstRowRef} />
        <ProductRow products={TRIPLED_ROW_TWO} rowRef={secondRowRef} />
      </div>
    </section>
  );
}
