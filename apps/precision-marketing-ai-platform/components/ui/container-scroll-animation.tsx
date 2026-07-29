"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

interface ContainerScrollProps {
  active?: boolean;
  children: ReactNode;
  className?: string;
  titleComponent?: ReactNode;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function ContainerScroll({
  active = true,
  children,
  className,
  titleComponent,
}: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const progress = useMotionValue(prefersReducedMotion ? 1 : 0);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothProgress = useSpring(progress, {
    stiffness: 170,
    damping: 26,
    mass: 0.68,
  });
  const pointerRotateX = useSpring(
    useTransform(pointerY, [-0.5, 0.5], [5.5, -5.5]),
    {
      stiffness: 170,
      damping: 24,
      mass: 0.72,
    }
  );
  const pointerRotateY = useSpring(
    useTransform(pointerX, [-0.5, 0.5], [-6, 6]),
    {
      stiffness: 170,
      damping: 24,
      mass: 0.72,
    }
  );
  const rotateY = useTransform(smoothProgress, [0, 1], [-78, 0]);
  const scale = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    [0.14, 0.62, 1]
  );
  const translateX = useTransform(smoothProgress, [0, 1], [520, 0]);
  const opacity = useTransform(
    smoothProgress,
    [0, 0.12, 0.42, 1],
    [0, 0.24, 0.78, 1]
  );
  const blur = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    ["blur(14px)", "blur(4px)", "blur(0px)"]
  );

  useEffect(() => {
    const container = containerRef.current;
    const scrollRoot = container?.closest<HTMLElement>(".home-pages");
    if (!container || !scrollRoot) return undefined;

    const updateProgress = () => {
      if (prefersReducedMotion) {
        progress.set(1);
        return;
      }

      const rootBounds = scrollRoot.getBoundingClientRect();
      const containerBounds = container.getBoundingClientRect();
      const distanceFromEntry =
        rootBounds.bottom - containerBounds.top;
      const revealDistance = Math.max(rootBounds.height * 0.68, 480);
      const nextProgress = clamp(distanceFromEntry / revealDistance);

      progress.set(active ? nextProgress : Math.min(nextProgress, 0.18));
    };

    updateProgress();
    scrollRoot.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });

    return () => {
      scrollRoot.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [active, prefersReducedMotion, progress]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !active) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(
      (event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5
    );
    pointerY.set(
      (event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5
    );
  };

  const resetPointerTilt = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <div
      ref={containerRef}
      className={`hologram-scroll-container${className ? ` ${className}` : ""}`}
    >
      <motion.div
        className="hologram-scroll-card"
        style={{
          filter: blur,
          opacity,
          rotateY,
          scale,
          x: translateX,
        }}
      >
        <motion.div
          className="hologram-tilt-plane"
          onPointerMove={handlePointerMove}
          onPointerLeave={resetPointerTilt}
          style={{
            rotateX: prefersReducedMotion ? 0 : pointerRotateX,
            rotateY: prefersReducedMotion ? 0 : pointerRotateY,
            transformPerspective: 1600,
          }}
        >
          <div className="hologram-projection-content">
            {titleComponent ? (
              <div className="hologram-scroll-header">{titleComponent}</div>
            ) : null}
            <div className="hologram-scroll-surface">{children}</div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
