"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "antd";

const NAV_ITEMS = [
  { id: "six-card-hero", label: "营销闭环" },
  { id: "robot-showcase", label: "蜂窝地图" },
  { id: "product-stories", label: "产品矩阵" },
  { id: "immersive-portal", label: "策略中枢" },
  { id: "real-impact", label: "价值回响" },
] as const;

type NavId = (typeof NAV_ITEMS)[number]["id"];

const LOCAL_INTERNAL_LOGIN_URL =
  "/internal/#/login?returnTo=%2Foverview";

function resolveSystemEntryUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return LOCAL_INTERNAL_LOGIN_URL;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : LOCAL_INTERNAL_LOGIN_URL;
  } catch {
    return LOCAL_INTERNAL_LOGIN_URL;
  }
}

function isNavId(value: string): value is NavId {
  return NAV_ITEMS.some((item) => item.id === value);
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
    >
      <path
        d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProductNavigation() {
  const systemEntryUrl = resolveSystemEntryUrl(
    process.env.NEXT_PUBLIC_INTERNAL_SYSTEM_ENTRY_URL
  );
  const [activeId, setActiveId] = useState<NavId>("six-card-hero");
  const programmaticTargetRef = useRef<NavId | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  const syncHash = useCallback((id: NavId, mode: "push" | "replace") => {
    const nextHash = `#${id}`;
    if (window.location.hash === nextHash) return;

    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history[mode === "push" ? "pushState" : "replaceState"](
      window.history.state,
      "",
      nextUrl
    );
  }, []);

  const navigateTo = useCallback(
    (id: NavId, historyMode: "push" | "replace" = "push") => {
      const section = document.getElementById(id);
      if (!section) return;

      programmaticTargetRef.current = id;
      setActiveId(id);
      syncHash(id, historyMode);
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [syncHash]
  );

  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>(".home-pages");
    if (!scrollRoot) return undefined;

    const updateFromScroll = () => {
      scrollFrameRef.current = null;
      const activationLine = window.innerHeight * 0.42;
      const programmedTarget = programmaticTargetRef.current;

      if (programmedTarget) {
        const target = document.getElementById(programmedTarget);
        const expectedTop =
          Number.parseFloat(getComputedStyle(scrollRoot).scrollPaddingTop) || 0;
        const targetTop = target?.getBoundingClientRect().top;
        const reachedTarget =
          targetTop !== undefined &&
          (Math.abs(targetTop - expectedTop) <= 6 || Math.abs(targetTop) <= 6);

        if (reachedTarget) {
          programmaticTargetRef.current = null;
        } else {
          return;
        }
      }

      let nextActive: NavId = NAV_ITEMS[0].id;
      for (const item of NAV_ITEMS) {
        const section = document.getElementById(item.id);
        if (section && section.getBoundingClientRect().top <= activationLine) {
          nextActive = item.id;
        }
      }

      setActiveId((current) => (current === nextActive ? current : nextActive));
      syncHash(nextActive, "replace");
    };

    const scheduleUpdate = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateFromScroll);
    };

    const handleHashChange = () => {
      const hashId = window.location.hash.slice(1);
      if (isNavId(hashId)) {
        navigateTo(hashId, "replace");
      }
    };

    const initialHash = window.location.hash.slice(1);
    if (isNavId(initialHash)) {
      window.requestAnimationFrame(() => navigateTo(initialHash, "replace"));
    } else {
      syncHash(NAV_ITEMS[0].id, "replace");
    }

    scrollRoot.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      scrollRoot.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", handleHashChange);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [navigateTo, syncHash]);

  return (
    <header
      className="landing-nav"
      data-testid="product-navigation"
    >
      <button
        type="button"
        className="landing-brand"
        aria-label="返回营销闭环首屏"
        onClick={() => navigateTo("six-card-hero")}
      >
        <span className="landing-brand-mark" aria-hidden="true">
          <span className="landing-brand-logo" />
        </span>
        <span className="landing-brand-copy">
          <strong>AI LOOP</strong>
          <small>精准化营销</small>
        </span>
      </button>

      <nav className="landing-pill-nav" aria-label="产品页面导航">
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <Button
              key={item.id}
              type="text"
              className={isActive ? "is-active" : undefined}
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigateTo(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </nav>

      <Button
        type="primary"
        shape="round"
        className="landing-nav-cta"
        aria-label="进入系统"
        data-auth-entry="feishu"
        href={systemEntryUrl}
      >
        <span className="landing-nav-status" aria-hidden="true" />
        <span>进入系统</span>
        <ArrowRightIcon />
      </Button>
    </header>
  );
}
