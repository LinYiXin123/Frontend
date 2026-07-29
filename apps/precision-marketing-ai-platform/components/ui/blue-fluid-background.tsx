"use client";

import { useEffect, useRef, useState } from "react";

type FluidCursorColor = {
  r: number;
  g: number;
  b: number;
};

type FluidCursorEngine = {
  mount: (
    canvas: HTMLCanvasElement,
    options: { color: FluidCursorColor }
  ) => () => void;
};

declare global {
  interface Window {
    FluidCursorEngine?: FluidCursorEngine;
  }
}

const FLUID_CURSOR_SCRIPT_ID = "fluid-cursor-engine";
const FLUID_CURSOR_SCRIPT_SRC = "/visuals/fluid-cursor.js";

let fluidCursorScriptPromise: Promise<void> | null = null;

function loadFluidCursorEngine() {
  if (window.FluidCursorEngine) return Promise.resolve();
  if (fluidCursorScriptPromise) return fluidCursorScriptPromise;

  fluidCursorScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      FLUID_CURSOR_SCRIPT_ID
    ) as HTMLScriptElement | null;

    const handleLoad = () => {
      if (window.FluidCursorEngine) {
        resolve();
        return;
      }

      reject(new Error("流体背景引擎加载后未初始化"));
    };

    const handleError = () => {
      reject(new Error("流体背景引擎加载失败"));
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = FLUID_CURSOR_SCRIPT_ID;
    script.src = FLUID_CURSOR_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    fluidCursorScriptPromise = null;
    throw error;
  });

  return fluidCursorScriptPromise;
}

type FluidCursorProps = {
  color: FluidCursorColor;
};

function FluidCursor({ color: { r, g, b } }: FluidCursorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const scrollRoot = document.querySelector<HTMLElement>(".home-pages");
    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      {
        root: scrollRoot,
        rootMargin: "18% 0px",
        threshold: 0.01,
      }
    );
    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      !isNearViewport ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    let disposed = false;
    let unmountEngine: (() => void) | undefined;

    void loadFluidCursorEngine()
      .then(() => {
        if (disposed || !canvasRef.current || !window.FluidCursorEngine) return;

        unmountEngine = window.FluidCursorEngine.mount(canvasRef.current, {
          color: { r, g, b },
        });
      })
      .catch(() => {
        // The static gradient remains available if WebGL or the script is blocked.
      });

    return () => {
      disposed = true;
      unmountEngine?.();
    };
  }, [b, g, isNearViewport, r]);

  return (
    <canvas
      ref={canvasRef}
      className="robot-fluid-cursor"
      data-testid="blue-fluid-cursor"
      aria-hidden="true"
    />
  );
}

const FLUID_COLOR = {
  r: 0.729,
  g: 0.878,
  b: 1,
} as const;

export function BlueFluidBackground() {
  return (
    <div className="robot-ambient-background" aria-hidden="true">
      <div
        className="robot-gradient-background"
        data-testid="blue-gradient-background"
      />
      <FluidCursor color={FLUID_COLOR} />
    </div>
  );
}
