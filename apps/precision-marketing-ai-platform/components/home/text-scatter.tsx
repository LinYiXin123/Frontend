"use client";

import type { MouseEvent } from "react";

type TextScatterProps = {
  id?: string;
  text: string;
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
  velocity?: number;
  rotation?: number;
  scale?: number;
  returnAfter?: number;
  duration?: number;
};

export function TextScatter({
  id,
  text,
  as: Component = "span",
  className = "",
  velocity = 200,
  rotation = 90,
  scale = 1,
  returnAfter = 1,
  duration = 2,
}: TextScatterProps) {
  function scatterCharacter(event: MouseEvent<HTMLSpanElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(centerY - event.clientY, centerX - event.clientX);
    const force = velocity * (0.8 + Math.random() * 0.4);
    const translateX = Math.cos(angle) * force;
    const translateY = Math.sin(angle) * force;
    const rotate = (Math.random() - 0.5) * rotation * 2;

    target.getAnimations().forEach((animation) => animation.cancel());

    const scatter = target.animate(
      [
        { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)" },
        {
          transform: `translate3d(${translateX}px, ${translateY}px, 0) rotate(${rotate}deg) scale(${scale})`,
        },
      ],
      {
        duration: duration * 1000,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      }
    );

    void scatter.finished
      .then(() => {
        if (!target.isConnected) return;

        target.animate(
          [
            {
              transform: `translate3d(${translateX}px, ${translateY}px, 0) rotate(${rotate}deg) scale(${scale})`,
            },
            { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)" },
          ],
          {
            duration: duration * 1000,
            delay: returnAfter * 1000,
            easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            fill: "forwards",
          }
        );
      })
      .catch(() => {
        // A new hover cancels the previous animation before starting again.
      });
  }

  return (
    <Component
      id={id}
      className={`relative select-none ${className}`}
      aria-label={text.replaceAll("\n", " ")}
    >
      {Array.from(text).map((character, index) => {
        if (character === "\n") {
          return <br key={`line-break-${index}`} aria-hidden="true" />;
        }

        return (
          <span
            key={`${character}-${index}`}
            aria-hidden="true"
            className="relative inline-block cursor-default"
            onMouseEnter={scatterCharacter}
            style={{
              willChange: "transform",
              transformOrigin: "50% 70%",
            }}
          >
            {character === " " ? "\u00A0" : character}
          </span>
        );
      })}
    </Component>
  );
}
