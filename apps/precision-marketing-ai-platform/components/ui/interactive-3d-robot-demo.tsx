"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Application, SPEObject } from "@splinetool/runtime";
import { BlueFluidBackground } from "@/components/ui/blue-fluid-background";
import {
  InteractiveRobotSpline,
  preloadInteractiveRobotSpline,
} from "@/components/ui/interactive-3d-robot";
import { RobotHolographicWorkspace } from "@/components/ui/robot-holographic-workspace";
import { SoftProjectionField } from "@/components/ui/soft-projection-field";

const ROBOT_SCENE_URL = "/visuals/robot/scene.splinecode";
let robotScenePromise: Promise<void> | null = null;

const SPOT_LIGHT_SETTINGS = [
  { color: "#F5FAFF", intensity: 1 },
  { color: "#91CAFF", intensity: 1.25 },
] as const;

const PROJECTION_SETTINGS = {
  angle: 30,
  intensity: 83,
  color: { r: 69, g: 249, b: 243 },
} as const;

const HEAD_MAX_PITCH = Math.PI / 9;
const HEAD_MAX_YAW = Math.PI / 7.5;
const HEAD_FOLLOW_EASING = 0.12;

interface LookAtHandler {
  events?: Array<{ paused: boolean }>;
  onMouseMove: (event: PointerEvent) => void;
}

interface SplineEventManager {
  eventContext?: {
    domElement?: HTMLElement;
    eventElement?: HTMLElement | Window;
  };
  handlers?: {
    LookAt?: LookAtHandler;
  };
  resume?: () => void;
}

interface Rotation3 {
  x: number;
  y: number;
  z: number;
}

interface Quaternion4 extends Rotation3 {
  w: number;
}

function multiplyQuaternions(a: Quaternion4, b: Quaternion4): Quaternion4 {
  return {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function eulerToQuaternion({ x, y, z }: Rotation3): Quaternion4 {
  const cx = Math.cos(x / 2);
  const cy = Math.cos(y / 2);
  const cz = Math.cos(z / 2);
  const sx = Math.sin(x / 2);
  const sy = Math.sin(y / 2);
  const sz = Math.sin(z / 2);

  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

function quaternionToEuler({ x, y, z, w }: Quaternion4): Rotation3 {
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const rotationY = Math.asin(Math.max(-1, Math.min(1, m13)));

  if (Math.abs(m13) < 0.9999999) {
    return {
      x: Math.atan2(-m23, m33),
      y: rotationY,
      z: Math.atan2(-m12, m11),
    };
  }

  return {
    x: Math.atan2(m32, m22),
    y: rotationY,
    z: 0,
  };
}

function applyHeadRotation(
  head: SPEObject,
  baseRotation: Rotation3,
  pitch: number,
  yaw: number
) {
  const halfPitch = pitch / 2;
  const halfYaw = yaw / 2;
  const yawRotation: Quaternion4 = {
    x: 0,
    y: Math.sin(halfYaw),
    z: 0,
    w: Math.cos(halfYaw),
  };
  const pitchRotation: Quaternion4 = {
    x: Math.sin(halfPitch),
    y: 0,
    z: 0,
    w: Math.cos(halfPitch),
  };
  const localLookRotation = multiplyQuaternions(yawRotation, pitchRotation);
  const rotation = quaternionToEuler(
    multiplyQuaternions(eulerToQuaternion(baseRotation), localLookRotation)
  );

  head.rotation.x = rotation.x;
  head.rotation.y = rotation.y;
  head.rotation.z = rotation.z;
}

function disableNativeLookAt(application: Application) {
  const eventManager =
    application.eventManager as unknown as SplineEventManager | undefined;
  const lookAt = eventManager?.handlers?.LookAt;
  const domElement = eventManager?.eventContext?.domElement;
  const eventElement = eventManager?.eventContext?.eventElement;

  eventManager?.resume?.();

  if (!lookAt || !eventElement) return undefined;

  const originalOnMouseMove = lookAt.onMouseMove;
  const originalListener = originalOnMouseMove as EventListener;

  eventElement.removeEventListener("pointermove", originalListener);
  domElement?.removeEventListener("pointerdown", originalListener);
  lookAt.events?.forEach((event) => {
    event.paused = true;
  });

  return () => {
    eventElement.removeEventListener("pointermove", originalListener);
    domElement?.removeEventListener("pointerdown", originalListener);
  };
}

function prepareSplineScene(application: Application) {
  const sceneObjects = application.getAllObjects();
  const spotLights = sceneObjects
    .filter((object) => object.name === "Spot Light");

  spotLights.forEach((light, index) => {
    const settings = SPOT_LIGHT_SETTINGS[index] ?? SPOT_LIGHT_SETTINGS[0];
    light.color = settings.color;
    light.intensity = settings.intensity;
  });

  const floor = application.findObjectByName("Plane");
  floor?.hide();
}

function preloadRobotScene() {
  if (!robotScenePromise) {
    robotScenePromise = fetch(ROBOT_SCENE_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        robotScenePromise = null;
        throw error;
      });
  }

  return robotScenePromise;
}

export function Section() {
  const [shouldLoadSpline, setShouldLoadSpline] = useState(false);
  const [canLoadSpline, setCanLoadSpline] = useState(false);
  const [isSplineReady, setIsSplineReady] = useState(false);
  const [isStageVisible, setIsStageVisible] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const applicationRef = useRef<Application | null>(null);
  const headRef = useRef<SPEObject | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const baseRotationRef = useRef<Rotation3>({ x: 0, y: 0, z: 0 });
  const currentLookRef = useRef({ pitch: 0, yaw: 0 });
  const targetLookRef = useRef({ pitch: 0, yaw: 0 });
  const removeNativeLookAtRef = useRef<(() => void) | undefined>(undefined);

  const animateHead = useCallback(function tick() {
    const application = applicationRef.current;
    const head = headRef.current;

    if (!application || !head) {
      animationFrameRef.current = null;
      return;
    }

    const current = currentLookRef.current;
    const target = targetLookRef.current;

    current.pitch += (target.pitch - current.pitch) * HEAD_FOLLOW_EASING;
    current.yaw += (target.yaw - current.yaw) * HEAD_FOLLOW_EASING;
    applyHeadRotation(
      head,
      baseRotationRef.current,
      current.pitch,
      current.yaw
    );
    application.requestRender();

    const isSettled =
      Math.abs(target.pitch - current.pitch) < 0.0005 &&
      Math.abs(target.yaw - current.yaw) < 0.0005;

    if (!isSettled) {
      animationFrameRef.current = requestAnimationFrame(tick);
      return;
    }

    applyHeadRotation(
      head,
      baseRotationRef.current,
      target.pitch,
      target.yaw
    );
    application.requestRender();
    animationFrameRef.current = null;
  }, []);

  const scheduleHeadAnimation = useCallback(() => {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(animateHead);
    }
  }, [animateHead]);

  const handleSplineLoad = useCallback(
    (application: Application) => {
      prepareSplineScene(application);

      removeNativeLookAtRef.current?.();
      removeNativeLookAtRef.current = disableNativeLookAt(application);

      const head = application.findObjectByName("Cabeza") ?? null;
      applicationRef.current = application;
      headRef.current = head;

      if (!head) return;

      const baseRotation = {
        x: head.rotation.x,
        y: head.rotation.y,
        z: head.rotation.z,
      };
      baseRotationRef.current = baseRotation;
      currentLookRef.current = { pitch: 0, yaw: 0 };
      targetLookRef.current = { pitch: 0, yaw: 0 };
      setIsSplineReady(true);
    },
    []
  );

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 680px)");
    const syncSplineCapability = () => {
      const nextCanLoad = !compactViewport.matches;
      setCanLoadSpline(nextCanLoad);

      if (!nextCanLoad) {
        setIsSplineReady(false);
      }
    };

    syncSplineCapability();
    compactViewport.addEventListener("change", syncSplineCapability);

    return () => {
      compactViewport.removeEventListener("change", syncSplineCapability);
    };
  }, []);

  useEffect(() => {
    if (canLoadSpline) return;

    removeNativeLookAtRef.current?.();
    removeNativeLookAtRef.current = undefined;
    applicationRef.current = null;
    headRef.current = null;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [canLoadSpline]);

  useEffect(() => {
    if (!canLoadSpline || shouldLoadSpline) return undefined;

    setShouldLoadSpline(true);
    void Promise.allSettled([
      preloadInteractiveRobotSpline(),
      preloadRobotScene(),
    ]);
    return undefined;
  }, [canLoadSpline, shouldLoadSpline]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = Boolean(entry?.isIntersecting);
        setIsStageVisible(isVisible);
      },
      { threshold: 0.08 }
    );

    observer.observe(stage);

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = stage.getBoundingClientRect();
      const preview = stage.querySelector<HTMLElement>(".robot-preview");
      const previewBounds = preview?.getBoundingClientRect();
      const lookOriginX = previewBounds
        ? previewBounds.left + previewBounds.width / 2
        : bounds.left + bounds.width / 2;
      const lookOriginY = previewBounds
        ? previewBounds.top + previewBounds.height / 2 - 98
        : bounds.top + bounds.height / 2 + 32;
      const deltaX = event.clientX - lookOriginX;
      const deltaY = event.clientY - lookOriginY;
      const normalizedX = Math.max(
        -1,
        Math.min(1, deltaX / (bounds.width * 0.42))
      );
      const normalizedY = Math.max(
        -1,
        Math.min(1, deltaY / (bounds.height * 0.42))
      );
      targetLookRef.current = {
        pitch: normalizedY * HEAD_MAX_PITCH,
        yaw: normalizedX * HEAD_MAX_YAW,
      };
      scheduleHeadAnimation();
    };

    const handlePointerLeave = () => {
      targetLookRef.current = { pitch: 0, yaw: 0 };
      scheduleHeadAnimation();
    };

    stage.addEventListener("pointermove", handlePointerMove, { passive: true });
    stage.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      observer.disconnect();
      stage.removeEventListener("pointermove", handlePointerMove);
      stage.removeEventListener("pointerleave", handlePointerLeave);
      removeNativeLookAtRef.current?.();
      removeNativeLookAtRef.current = undefined;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = null;
      applicationRef.current = null;
      headRef.current = null;
    };
  }, [scheduleHeadAnimation]);

  return (
    <section
      ref={stageRef}
      id="robot-showcase"
      className="home-screen robot-stage relative min-h-[100svh] w-full overflow-hidden"
      aria-label="交互式 3D 机器人"
    >
      <BlueFluidBackground />
      <SoftProjectionField
        active={isStageVisible && isSplineReady}
        angle={PROJECTION_SETTINGS.angle}
        intensity={PROJECTION_SETTINGS.intensity}
        color={PROJECTION_SETTINGS.color}
      />
      <RobotHolographicWorkspace
        active={isStageVisible}
      />
      <div className="robot-cast-shadows" aria-hidden="true" />

      <div
        className={`robot-preview${isSplineReady ? " is-spline-ready" : ""}`}
      >
        <div className="robot-loading-poster" aria-hidden="true">
          <span className="robot-loading-head" />
          <span className="robot-loading-neck" />
          <span className="robot-loading-body" />
        </div>
        {shouldLoadSpline && canLoadSpline ? (
          <InteractiveRobotSpline
            scene={ROBOT_SCENE_URL}
            className="robot-spline absolute inset-0 z-0 h-full w-full"
            onLoad={handleSplineLoad}
          />
        ) : null}
      </div>
    </section>
  );
}
