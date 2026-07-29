"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle, Vec3 } from "ogl";

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float iTime;
  uniform vec3 iResolution;
  uniform float hue;
  uniform float rot;
  varying vec2 vUv;

  vec3 rgb2yiq(vec3 c) {
    float y = dot(c, vec3(0.299, 0.587, 0.114));
    float i = dot(c, vec3(0.596, -0.274, -0.322));
    float q = dot(c, vec3(0.211, -0.523, 0.312));
    return vec3(y, i, q);
  }

  vec3 yiq2rgb(vec3 c) {
    float r = c.x + 0.956 * c.y + 0.621 * c.z;
    float g = c.x - 0.272 * c.y - 0.647 * c.z;
    float b = c.x - 1.106 * c.y + 1.703 * c.z;
    return vec3(r, g, b);
  }

  vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = hueDeg * 3.14159265 / 180.0;
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad);
    float sinA = sin(hueRad);
    float i = yiq.y * cosA - yiq.z * sinA;
    float q = yiq.y * sinA + yiq.z * cosA;
    yiq.y = i;
    yiq.z = q;
    return yiq2rgb(yiq);
  }

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(
      p3.x + p3.y,
      p3.x + p3.z,
      p3.y + p3.z
    ) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(
      dot(d0, d0),
      dot(d1, d1),
      dot(d2, d2),
      dot(d3, d3)
    ), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  vec4 extractAlpha(vec3 colorIn) {
    float alpha = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (alpha + 1e-5), alpha);
  }

  const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);
  const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);
  const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);
  const float innerRadius = 0.6;
  const float noiseScale = 0.65;

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }

  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 drawOrb(vec2 uv) {
    vec3 color1 = adjustHue(baseColor1, hue);
    vec3 color2 = adjustHue(baseColor2, hue);
    vec3 color3 = adjustHue(baseColor3, hue);

    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;
    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
    float r0 = mix(
      mix(innerRadius, 1.0, 0.4),
      mix(innerRadius, 1.0, 0.6),
      n0
    );
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);
    v0 *= smoothstep(r0 * 1.05, r0, len);
    float colorBlend = cos(ang + iTime * 2.0) * 0.5 + 0.5;

    float orbit = iTime * -1.0;
    vec2 lightPosition = vec2(cos(orbit), sin(orbit)) * r0;
    float lightDistance = distance(uv, lightPosition);
    float v1 = light2(1.5, 5.0, lightDistance);
    v1 *= light1(1.0, 50.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 color = mix(color1, color2, colorBlend);
    color = mix(color3, color, v0);
    color = (color + v1) * v2 * v3;
    return extractAlpha(clamp(color, 0.0, 1.0));
  }

  void main() {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (vUv * iResolution.xy - center) / size * 2.0;
    float sine = sin(rot);
    float cosine = cos(rot);
    uv = vec2(
      cosine * uv.x - sine * uv.y,
      sine * uv.x + cosine * uv.y
    );

    vec4 color = drawOrb(uv);
    gl_FragColor = vec4(color.rgb * color.a, color.a);
  }
`;

type AnimatedOrbProps = {
  className?: string;
  hue?: number;
};

export function AnimatedOrb({ className, hue = 0 }: AnimatedOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const renderer = new Renderer({
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      premultipliedAlpha: false,
    });
    const gl = renderer.gl;
    const canvas = gl.canvas;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        hue: { value: hue },
        iResolution: {
          value: new Vec3(1, 1, 1),
        },
        iTime: { value: 0 },
        rot: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    let animationFrame: number | null = null;
    let isVisible = true;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      program.uniforms.iResolution.value.set(
        canvas.width,
        canvas.height,
        canvas.width / canvas.height
      );
    };

    const render = (time: number) => {
      animationFrame = null;
      program.uniforms.hue.value = hue;
      program.uniforms.iTime.value = reducedMotion ? 0 : time * 0.001;
      program.uniforms.rot.value = reducedMotion ? 0 : time * 0.00018;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      renderer.render({ scene: mesh });

      if (!reducedMotion && isVisible) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const startRendering = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      startRendering();
    });
    resizeObserver.observe(container);

    const scrollRoot = document.querySelector<HTMLElement>(".home-pages");
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          startRendering();
        } else if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
      },
      {
        root: scrollRoot,
        rootMargin: "18% 0px",
        threshold: 0.01,
      }
    );
    visibilityObserver.observe(container);

    resize();
    startRendering();

    return () => {
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [hue]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="immersive-animated-orb"
      aria-hidden="true"
    />
  );
}
