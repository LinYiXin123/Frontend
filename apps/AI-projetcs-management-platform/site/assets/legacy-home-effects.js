(function () {
  let queued = false;
  const interactiveEnhanced = new WeakSet();
  const previewMotionEnhanced = new WeakMap();
  const previewScreensEnhanced = new WeakSet();

  const HEAVY_CLASSES = [
    "rb-login-shell",
    "rb-login-card",
    "rb-login-reveal",
    "rb-tilt-surface",
    "rb-prompt-console",
    "rb-home-hero",
    "rb-home-grid",
    "rb-quick-entry-grid"
  ];

  const cleanupHeavyEffects = () => {
    document.querySelectorAll(".rb-surface-glow, .rb-login-fluid-field, .rb-login-fluid-canvas").forEach(node => node.remove());
    document.querySelectorAll(HEAVY_CLASSES.map(name => `.${name}`).join(",")).forEach(element => {
      HEAVY_CLASSES.forEach(name => element.classList.remove(name));
      [
        "--rb-glow-x",
        "--rb-glow-y",
        "--rb-tilt-x",
        "--rb-tilt-y",
        "--rb-lift",
        "--login-tilt-x",
        "--login-tilt-y"
      ].forEach(property => element.style.removeProperty(property));
    });
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothStep = value => value * value * (3 - 2 * value);

  const resetInteractiveSurface = element => {
    element.style.setProperty("--rb-glow-x", "50%");
    element.style.setProperty("--rb-glow-y", "50%");
    element.style.setProperty("--login-tilt-x", "0deg");
    element.style.setProperty("--login-tilt-y", "0deg");
    element.style.setProperty("--rb-preview-tilt-x", "0deg");
    element.style.setProperty("--rb-preview-tilt-y", "0deg");
  };

  const enhancePointerSurface = (element, type) => {
    if (interactiveEnhanced.has(element)) return;
    interactiveEnhanced.add(element);
    element.classList.add(type === "preview" ? "rb-preview-interactive" : "rb-login-interactive");

    let frame = 0;
    let lastEvent = null;
    const strength = 3.2;

    const applyFromPointer = () => {
      frame = 0;
      if (!lastEvent) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = clamp((lastEvent.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((lastEvent.clientY - rect.top) / rect.height, 0, 1);
      const tiltX = ((0.5 - y) * strength).toFixed(2);
      const tiltY = ((x - 0.5) * strength).toFixed(2);

      element.style.setProperty("--rb-glow-x", `${(x * 100).toFixed(1)}%`);
      element.style.setProperty("--rb-glow-y", `${(y * 100).toFixed(1)}%`);
      if (type === "preview") {
        element.style.setProperty("--rb-preview-tilt-x", `${tiltX}deg`);
        element.style.setProperty("--rb-preview-tilt-y", `${tiltY}deg`);
      }
    };

    element.addEventListener("pointermove", event => {
      lastEvent = event;
      if (!frame) frame = window.requestAnimationFrame(applyFromPointer);
    }, { passive: true });

    element.addEventListener("pointerleave", () => {
      lastEvent = null;
      resetInteractiveSurface(element);
    }, { passive: true });

    element.addEventListener("pointercancel", () => {
      lastEvent = null;
      resetInteractiveSurface(element);
    }, { passive: true });

    resetInteractiveSurface(element);
  };

  const enhancePreviewMotion = device => {
    const wrap = device.closest(".preview-device-wrap");
    const section = device.closest(".landing-scroll-section") || wrap;
    if (!wrap || !section) return;

    const existingUpdate = previewMotionEnhanced.get(device);
    if (existingUpdate) {
      existingUpdate();
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
      const travel = Math.max(rect.height + viewportHeight * 0.72, 1);
      const rawProgress = clamp((viewportHeight - rect.top) / travel, 0, 1);
      const progress = smoothStep(rawProgress);
      const rotate = 28 - progress * 28;
      const scale = 0.84 + progress * 0.16;
      const y = -34 * progress;

      wrap.style.setProperty("--rb-preview-scroll-rotate", `${rotate.toFixed(2)}deg`);
      wrap.style.setProperty("--rb-preview-scroll-scale", scale.toFixed(3));
      wrap.style.setProperty("--rb-preview-scroll-y", `${y.toFixed(1)}px`);
      wrap.style.setProperty("--rb-preview-scroll-progress", progress.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    previewMotionEnhanced.set(device, update);
    update();
  };

  const enhancePreviewScreen = screen => {
    if (previewScreensEnhanced.has(screen)) return;
    previewScreensEnhanced.add(screen);
    screen.classList.add("rb-preview-screen-interactive");
    screen.dataset.mode = "overview";
    screen.innerHTML = `
      <aside class="rb-preview-sidebar">
        <button class="rb-preview-logo is-active" type="button" data-preview-tab="overview">AI</button>
        <button type="button" class="is-active" data-preview-tab="overview" data-preview-icon="01">全局看板</button>
        <button type="button" data-preview-tab="alerts" data-preview-icon="AI">预警中心</button>
        <button type="button" data-preview-tab="rules" data-preview-icon="DB">数据规则</button>
      </aside>
      <main class="rb-preview-main">
        <header class="rb-preview-topbar">
          <div>
            <span data-preview-subtitle>实时监控</span>
            <strong data-preview-title>项目全局看板</strong>
          </div>
          <div class="rb-preview-actions">
            <button type="button" data-preview-tab="alerts">查看预警</button>
            <button type="button" class="primary" data-preview-action="scan">运行巡检</button>
          </div>
        </header>
        <section class="rb-preview-command" aria-live="polite">
          <b data-preview-detail-title>健康元合规系统</b>
          <span data-preview-detail-meta>最近扫描正常，0 天静默，代码与通知链路均可追踪。</span>
          <em data-preview-pulse>实时监控中</em>
        </section>
        <section class="rb-preview-panel is-active" data-preview-panel="overview">
          <div class="rb-preview-metrics">
            <button type="button" data-preview-metric="all" data-preview-icon="ALL"><strong>19</strong><span>全部项目</span><small>健康元 17 / 丽珠 2</small></button>
            <button type="button" data-preview-metric="normal" data-preview-icon="OK"><strong>5</strong><span>正常推进</span><small>近 2 天有 Commit / MR</small></button>
            <button type="button" data-preview-metric="stalled" data-preview-icon="AI"><strong>11</strong><span>停滞待确认</span><small>已生成追问队列</small></button>
            <button type="button" data-preview-metric="notice" data-preview-icon="MSG"><strong>69</strong><span>通知记录</span><small>36 dry-run / 33 人工</small></button>
          </div>
          <div class="rb-preview-heatline">
            ${Array.from({ length: 21 }, (_, index) => `<button type="button" class="level-${index % 6}" data-preview-day="${index + 1}" title="第 ${index + 1} 天活跃度"></button>`).join("")}
          </div>
          <div class="rb-preview-projects">
            <button type="button" class="is-active" data-preview-project="healthy" data-preview-icon="H"><b>健康元合规系统</b><span class="ok">正常</span><em>0 天</em><small>Commit 17 / MR 2 / 通知已读 / 负责人在线</small></button>
            <button type="button" data-preview-project="cap" data-preview-icon="C"><b>CAP</b><span class="warn">异常</span><em>3 天</em><small>硬件信号连续异常，负责人待确认联调进度</small></button>
            <button type="button" data-preview-project="medical" data-preview-icon="M"><b>OpenClaw-Medical-Skills</b><span class="stop">停滞</span><em>115 天</em><small>触发 5 次追问，建议归档、暂停或补充状态</small></button>
            <button type="button" data-preview-project="ops" data-preview-icon="G"><b>joincare-ops-backend</b><span class="ok">扫描成功</span><em>14:45</em><small>默认分支 main，发现 8 条代码/协作信号</small></button>
          </div>
          <div class="rb-preview-mini-log">
            <span><b>14:45</b> GitLab 扫描完成，新增 8 条信号</span>
            <span><b>14:47</b> AI 生成 5 条追问建议</span>
            <span><b>14:50</b> dry-run 通知进入待确认队列</span>
          </div>
        </section>
        <section class="rb-preview-panel" data-preview-panel="alerts">
          <div class="rb-preview-alert-grid">
            <article data-preview-icon="TOP"><span>今日优先</span><strong>10</strong><small>严重 / 停滞项目需确认</small></article>
            <article data-preview-icon="MSG"><span>未读通知</span><strong>49</strong><small>36 条 dry-run，13 条人工记录</small></article>
            <article data-preview-icon="OK"><span>失败投递</span><strong>0</strong><small>单用户私聊通道正常</small></article>
          </div>
          <div class="rb-preview-queue">
            <button type="button" data-preview-project="medical" data-preview-icon="AI"><b>OpenClaw-Medical-Skills</b><span>生成追问</span><small>停滞 115 天，触发 5 次；建议确认是否继续推进</small></button>
            <button type="button" data-preview-project="cap" data-preview-icon="!"><b>CAP</b><span>查看通知</span><small>静默 3 天，硬件信号异常；建议负责人确认</small></button>
            <button type="button" data-preview-project="ops" data-preview-icon="G"><b>joincare-ops-backend</b><span>扫描详情</span><small>GitLab 最近扫描 14:45；默认分支 main</small></button>
            <button type="button" data-preview-project="healthy" data-preview-icon="OK"><b>健康元合规系统</b><span>已读回执</span><small>通知链路完整，负责人已确认今日进度</small></button>
          </div>
        </section>
        <section class="rb-preview-panel" data-preview-panel="rules">
          <div class="rb-preview-rule-grid">
            <button type="button" data-preview-icon="GL"><b>GitLab 集成</b><span>17 个项目已接入</span><small>Commit / MR / Issue / Branch 扫描</small></button>
            <button type="button" data-preview-icon="FS"><b>飞书集成</b><span>dry-run 安全模式</span><small>群仅接收入站指令；私聊、日报与追问策略可配置</small></button>
            <button type="button" data-preview-icon="3D"><b>预警规则</b><span>3 / 5 / 7 天阈值</span><small>自动升级追问、通知和归档建议</small></button>
            <button type="button" data-preview-icon="ID"><b>成员映射</b><span>59 位成员</span><small>OpenID / UnionID / GitLab 用户名待补齐</small></button>
          </div>
        </section>
      </main>
    `;

    const detailMap = {
      healthy: ["健康元合规系统", "正常推进，最近 24 小时有代码信号和通知回执。"],
      cap: ["CAP", "已静默 3 天，建议先确认需求或联调是否卡住。"],
      medical: ["OpenClaw-Medical-Skills", "停滞 115 天，建议归档、暂停或补充真实进展。"],
      ops: ["joincare-ops-backend", "GitLab 扫描成功，默认分支 main，分支数 2。"]
    };
    const modeCopy = {
      overview: ["实时监控", "项目全局看板"],
      alerts: ["AI 预警队列", "预警中心"],
      rules: ["配置中心", "数据与规则"]
    };

    const setMode = mode => {
      screen.dataset.mode = mode;
      const copy = modeCopy[mode] || modeCopy.overview;
      screen.querySelector("[data-preview-subtitle]").textContent = copy[0];
      screen.querySelector("[data-preview-title]").textContent = copy[1];
      screen.querySelectorAll("[data-preview-tab]").forEach(button => {
        button.classList.toggle("is-active", button.dataset.previewTab === mode);
      });
      screen.querySelectorAll("[data-preview-panel]").forEach(panel => {
        panel.classList.toggle("is-active", panel.dataset.previewPanel === mode);
      });
    };
    const setDetail = key => {
      const detail = detailMap[key] || detailMap.healthy;
      screen.querySelector("[data-preview-detail-title]").textContent = detail[0];
      screen.querySelector("[data-preview-detail-meta]").textContent = detail[1];
      screen.querySelectorAll("[data-preview-project]").forEach(button => {
        button.classList.toggle("is-active", button.dataset.previewProject === key);
      });
    };

    screen.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const tabButton = target.closest("[data-preview-tab]");
      const projectButton = target.closest("[data-preview-project]");
      const dayButton = target.closest("[data-preview-day]");
      const actionButton = target.closest("[data-preview-action]");
      if (tabButton) {
        setMode(tabButton.dataset.previewTab || "overview");
      } else if (projectButton) {
        setDetail(projectButton.dataset.previewProject || "healthy");
      } else if (dayButton) {
        const day = dayButton.dataset.previewDay || "1";
        screen.querySelector("[data-preview-detail-title]").textContent = `近 21 天第 ${day} 天`;
        screen.querySelector("[data-preview-detail-meta]").textContent = Number(day) % 3 === 0
          ? "这一天有 Commit / MR 信号，项目活跃度较高。"
          : "活跃度较低，可结合项目负责人状态继续观察。";
        screen.querySelectorAll("[data-preview-day]").forEach(button => {
          button.classList.toggle("is-active", button === dayButton);
        });
      } else if (actionButton) {
        screen.querySelector("[data-preview-detail-title]").textContent = "巡检已触发";
        screen.querySelector("[data-preview-detail-meta]").textContent = "正在扫描 GitLab、通知队列和运行状态，结果会回写预警中心。";
      }
    });
  };

  const enhanceLogin = () => {
    document.querySelectorAll(".login-shell").forEach(shell => {
      shell.classList.add("rb-login-shell-lite");
    });

    document.querySelectorAll(".signin-card").forEach(card => {
      card.classList.remove("rb-lite-reveal");
      card.classList.add("rb-login-card-safe");
      enhancePointerSurface(card, "login");
    });

    document.querySelectorAll(".landing-copy > *, .landing-kpis > span").forEach((element, index) => {
      element.style.setProperty("--rb-lite-delay", `${Math.min(index * 36, 320)}ms`);
      element.classList.add("rb-lite-reveal");
    });

    document.querySelectorAll(".preview-device").forEach(device => {
      device.classList.add("rb-preview-device-lite");
      enhancePointerSurface(device, "preview");
      enhancePreviewMotion(device);
      const screen = device.querySelector(".preview-screen");
      if (screen) enhancePreviewScreen(screen);
    });
  };

  const enhanceBusinessHome = () => {
    document.querySelectorAll(".ai-suite-hero").forEach(section => {
      section.classList.add("rb-business-hero-lite");
    });
    document.querySelectorAll(".ai-prompt-console").forEach(panel => {
      panel.classList.add("rb-prompt-lite");
    });
    document.querySelectorAll(".hero-grid .metric, .quick-entry-grid button").forEach((card, index) => {
      card.style.setProperty("--rb-lite-delay", `${Math.min(index * 32, 240)}ms`);
      card.classList.add("rb-card-lite");
    });
  };

  const scan = () => {
    document.documentElement.classList.add("react-bits-home-effects", "react-bits-lite-effects");
    cleanupHeavyEffects();
    enhanceLogin();
    enhanceBusinessHome();
  };

  const scheduleScan = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleScan();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
