"use client";

import type {
  CSSProperties,
  HTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

type GlowColor = "blue" | "purple" | "green" | "red" | "orange";
type GlowCardSize = "sm" | "md" | "lg";
type GlowCardElement = "div" | "article";

interface GlowCardProps
  extends Omit<HTMLAttributes<HTMLElement>, "children" | "style"> {
  children: ReactNode;
  className?: string;
  glowColor?: GlowColor;
  size?: GlowCardSize;
  width?: string | number;
  height?: string | number;
  customSize?: boolean;
  as?: GlowCardElement;
}

interface GlowCardStyle extends CSSProperties {
  "--glow-hue": number;
  "--glow-x": string;
  "--glow-y": string;
  "--glow-opacity": number;
}

const GLOW_COLORS: Record<
  GlowColor,
  { base: number; spread: number }
> = {
  blue: { base: 208, spread: 24 },
  purple: { base: 270, spread: 26 },
  green: { base: 132, spread: 22 },
  red: { base: 358, spread: 18 },
  orange: { base: 24, spread: 20 },
};

const SIZE_CLASSES: Record<GlowCardSize, string> = {
  sm: "h-64 w-48",
  md: "h-80 w-64",
  lg: "h-96 w-80",
};

function toCssSize(value: string | number | undefined) {
  return typeof value === "number" ? `${value}px` : value;
}

export function GlowCard({
  children,
  className = "",
  glowColor = "blue",
  size = "md",
  width,
  height,
  customSize = false,
  as: Component = "div",
  onPointerMove,
  onPointerLeave,
  ...elementProps
}: GlowCardProps) {
  const { base, spread } = GLOW_COLORS[glowColor];

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement | HTMLElement>
  ) => {
    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const horizontalProgress = Math.max(
      0,
      Math.min(1, localX / Math.max(bounds.width, 1))
    );

    card.style.setProperty("--glow-x", `${localX.toFixed(2)}px`);
    card.style.setProperty("--glow-y", `${localY.toFixed(2)}px`);
    card.style.setProperty(
      "--glow-hue",
      `${(base + horizontalProgress * spread).toFixed(2)}`
    );
    card.style.setProperty("--glow-opacity", "1");
    onPointerMove?.(event);
  };

  const handlePointerLeave = (
    event: ReactPointerEvent<HTMLDivElement | HTMLElement>
  ) => {
    event.currentTarget.style.setProperty("--glow-opacity", "0");
    onPointerLeave?.(event);
  };

  const style: GlowCardStyle = {
    "--glow-hue": base,
    "--glow-x": "50%",
    "--glow-y": "50%",
    "--glow-opacity": 0,
    width: toCssSize(width),
    height: toCssSize(height),
  };

  return (
    <Component
      {...elementProps}
      data-glow-card
      className={`spotlight-card ${
        customSize ? "" : SIZE_CLASSES[size]
      } ${className}`.trim()}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </Component>
  );
}
