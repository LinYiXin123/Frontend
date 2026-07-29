"use client";

import { Suspense, lazy } from "react";
import type { Application } from "@splinetool/runtime";

let splineModulePromise:
  | Promise<typeof import("@splinetool/react-spline")>
  | null = null;

function loadSplineModule() {
  if (!splineModulePromise) {
    splineModulePromise = import("@splinetool/react-spline").catch(
      (error: unknown) => {
        splineModulePromise = null;
        throw error;
      }
    );
  }

  return splineModulePromise;
}

const Spline = lazy(loadSplineModule);

export async function preloadInteractiveRobotSpline() {
  await loadSplineModule();
}

interface InteractiveRobotSplineProps {
  scene: string;
  className?: string;
  onLoad?: (application: Application) => void;
}

export function InteractiveRobotSpline({
  scene,
  className,
  onLoad,
}: InteractiveRobotSplineProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`pointer-events-none flex h-full w-full items-center justify-center bg-transparent text-blue-600 ${className ?? ""}`}
          role="status"
          aria-label="加载 3D 场景"
        >
          <svg
            className="h-6 w-6 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l2-2.647z"
            />
          </svg>
        </div>
      }
    >
      <Spline scene={scene} className={className} onLoad={onLoad} />
    </Suspense>
  );
}
