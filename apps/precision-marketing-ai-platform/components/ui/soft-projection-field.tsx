"use client";

import { useEffect, useRef } from "react";

interface SoftProjectionFieldProps {
  active: boolean;
  angle: number;
  intensity: number;
  color: {
    r: number;
    g: number;
    b: number;
  };
}

const DEFAULT_PROJECTION_COLOR = { r: 69, g: 249, b: 243 };

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform vec2 uOrigin;
  uniform vec2 uTarget;
  uniform float uAspect;
  uniform float uConeSlope;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform float uTime;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 eased = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), eased.x),
      mix(
        hash(cell + vec2(0.0, 1.0)),
        hash(cell + vec2(1.0, 1.0)),
        eased.x
      ),
      eased.y
    );
  }

  float fieldNoise(vec2 point) {
    float value = 0.0;
    value += noise(point) * 0.58;
    value += noise(point * 2.03 + 9.7) * 0.28;
    value += noise(point * 4.11 - 5.3) * 0.14;
    return value;
  }

  void main() {
    vec2 aspectScale = vec2(uAspect, 1.0);
    vec2 point = vUv * aspectScale;
    vec2 originPoint = uOrigin * aspectScale;
    vec2 targetPoint = uTarget * aspectScale;
    vec2 directionVector = targetPoint - originPoint;
    float directionLength = max(length(directionVector), 0.001);
    vec2 direction = directionVector / directionLength;
    vec2 offset = point - originPoint;

    float forward = dot(offset, direction);
    float sideways = abs(offset.x * direction.y - offset.y * direction.x);
    float positiveForward = max(forward, 0.0);
    float spread =
      0.07 + positiveForward * uConeSlope;
    float feather = 0.2 + positiveForward * 0.42;
    float innerSpread = 0.035 + positiveForward * 0.52;

    float outerFade =
      1.0 - smoothstep(spread * 0.5, spread + feather, sideways);
    float innerFade =
      1.0 - smoothstep(
        innerSpread * 0.04,
        innerSpread + feather * 0.3,
        sideways
      );
    float sourceFade = smoothstep(-0.06, 0.13, forward);
    float distanceFade = 1.0 - smoothstep(1.5, 3.2, positiveForward);
    float directionField =
      (outerFade * 0.58 + innerFade * 0.42) * sourceFade * distanceFade;

    vec2 flowingPoint =
      point * vec2(2.2, 4.7) +
      direction * uTime * 0.045 +
      vec2(uTime * -0.014, uTime * 0.022);
    float flowingNoise = fieldNoise(flowingPoint);
    float softBands =
      0.84 +
      0.16 * sin((forward * 8.0 - uTime * 0.32) + flowingNoise * 3.2);
    float movingGrain = hash(
      floor(
        (vUv + direction * uTime * 0.018) *
        vec2(760.0, 430.0)
      )
    );
    float lightTexture = mix(flowingNoise, movingGrain, 0.26);

    float sourceGlow = exp(-length(offset) * 13.0);
    vec2 floatingCenter = originPoint + direction * 0.48;
    float ambientGlow =
      exp(-length((point - floatingCenter) * vec2(0.72, 1.0)) * 2.1);

    float field =
      directionField * (0.58 + lightTexture * 0.74) * softBands +
      ambientGlow * (0.05 + flowingNoise * 0.055) +
      sourceGlow * 0.2;

    float nearSource = 1.0 - smoothstep(0.0, 0.34, positiveForward);
    vec3 baseColor = clamp(uColor, 0.0, 1.0);
    vec3 blue = mix(baseColor * 0.62, baseColor, 0.76);
    vec3 paleBlue = mix(baseColor, vec3(1.0), 0.4);
    vec3 white = vec3(0.98, 0.995, 1.0);
    vec3 color = mix(blue, paleBlue, 0.46 + flowingNoise * 0.26);
    color = mix(color, white, nearSource * 0.78 + sourceGlow * 0.22);

    float alpha = clamp(field * 1.34 * uIntensity, 0.0, 0.9);
    alpha *= smoothstep(0.0, 0.075, field);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function SoftProjectionField({
  active,
  angle = 30,
  intensity = 83,
  color = DEFAULT_PROJECTION_COLOR,
}: SoftProjectionFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ angle, intensity, color });

  useEffect(() => {
    settingsRef.current = { angle, intensity, color };
  }, [angle, color, intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage || !active) return undefined;

    let disposed = false;
    let frameId = 0;
    let rendererCleanup: (() => void) | undefined;

    const setup = async () => {
      const THREE = await import("three");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        premultipliedAlpha: true,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

      const scene = new THREE.Scene();
      const camera = new THREE.Camera();
      const geometry = new THREE.PlaneGeometry(2, 2);
      const initialSettings = settingsRef.current;
      const uniforms = {
        uOrigin: { value: new THREE.Vector2(0.82, 0.47) },
        uTarget: { value: new THREE.Vector2(0.18, 0.52) },
        uAspect: { value: 1 },
        uConeSlope: {
          value: Math.tan((initialSettings.angle * Math.PI) / 360),
        },
        uIntensity: { value: initialSettings.intensity / 100 },
        uColor: {
          value: new THREE.Vector3(
            initialSettings.color.r / 255,
            initialSettings.color.g / 255,
            initialSettings.color.b / 255
          ),
        },
        uTime: { value: 0 },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      const targetOrigin = new THREE.Vector2(0.82, 0.47);
      const targetPointer = new THREE.Vector2(0.18, 0.52);
      const currentOrigin = targetOrigin.clone();
      const currentPointer = targetPointer.clone();
      const targetColor = uniforms.uColor.value.clone();

      const measureOrigin = () => {
        const bounds = stage.getBoundingClientRect();
        const preview =
          stage.querySelector<HTMLElement>(".robot-preview");
        const previewBounds = preview?.getBoundingClientRect();
        const originX = previewBounds
          ? previewBounds.left + previewBounds.width / 2
          : bounds.left + bounds.width / 2;
        const originY = previewBounds
          ? previewBounds.top + previewBounds.height / 2 - 98
          : bounds.top + bounds.height / 2 + 32;

        targetOrigin.set(
          (originX - bounds.left) / bounds.width,
          1 - (originY - bounds.top) / bounds.height
        );
      };

      const resize = () => {
        const bounds = stage.getBoundingClientRect();
        renderer.setSize(
          Math.max(1, Math.round(bounds.width)),
          Math.max(1, Math.round(bounds.height)),
          false
        );
        uniforms.uAspect.value = bounds.width / Math.max(bounds.height, 1);
        measureOrigin();
      };

      const handlePointerMove = (event: PointerEvent) => {
        const bounds = stage.getBoundingClientRect();
        measureOrigin();
        targetPointer.set(
          Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
          Math.max(
            0,
            Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height)
          )
        );
      };

      const handlePointerLeave = () => {
        measureOrigin();
        targetPointer.set(0.18, 0.52);
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      stage.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      stage.addEventListener("pointerleave", handlePointerLeave);
      resize();

      const startedAt = performance.now();
      const render = (time: number) => {
        const nextSettings = settingsRef.current;
        const nextConeSlope = Math.tan(
          (nextSettings.angle * Math.PI) / 360
        );
        uniforms.uConeSlope.value +=
          (nextConeSlope - uniforms.uConeSlope.value) * 0.12;
        uniforms.uIntensity.value +=
          (nextSettings.intensity / 100 - uniforms.uIntensity.value) * 0.12;
        targetColor.set(
          nextSettings.color.r / 255,
          nextSettings.color.g / 255,
          nextSettings.color.b / 255
        );
        uniforms.uColor.value.lerp(targetColor, 0.12);
        currentOrigin.lerp(targetOrigin, 0.14);
        currentPointer.lerp(targetPointer, 0.1);
        uniforms.uOrigin.value.copy(currentOrigin);
        uniforms.uTarget.value.copy(currentPointer);
        uniforms.uTime.value = (time - startedAt) / 1000;
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(render);
      };
      frameId = requestAnimationFrame(render);

      rendererCleanup = () => {
        cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        stage.removeEventListener("pointermove", handlePointerMove);
        stage.removeEventListener("pointerleave", handlePointerLeave);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      };
    };

    void setup();

    return () => {
      disposed = true;
      rendererCleanup?.();
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="soft-projection-field"
      aria-hidden="true"
    />
  );
}
