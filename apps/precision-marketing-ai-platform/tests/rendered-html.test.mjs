import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("uses the isolated WebGL orb for the fourth-page entry journey", async () => {
  const [journey, tuningPanels, orb, styles, packageJson] = await Promise.all([
    readFile(
      new URL("../components/home/immersive-journey.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL(
        "../components/home/immersive-portal-tuning-panels.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL("../components/ui/animated-orb.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(journey, /<BlueFluidBackground\s*\/>/);
  assert.match(journey, /<AnimatedOrb className="immersive-orb"\s*\/>/);
  assert.match(journey, /orbScale\s*=\s*0\.82\s*\+\s*easedProgress\s*\*\s*8\.8/);
  assert.match(journey, /穿过数据噪声/);
  assert.match(journey, /<span>抵达可执行的策略。<\/span>/);
  assert.match(journey, /ImmersivePortalTuningPanels/);
  assert.match(journey, /IMMERSIVE_SCROLL_STEPS\s*=\s*5/);
  assert.match(journey, /ORB_MIDPOINT_PROGRESS\s*=\s*3\s*\/\s*IMMERSIVE_SCROLL_STEPS/);
  assert.match(journey, /flatten:\s*51/);
  assert.match(journey, /scale:\s*463/);
  assert.match(journey, /x:\s*-72/);
  assert.match(journey, /y:\s*175/);
  assert.match(journey, /immersive-next-scene-mask/);
  assert.match(journey, /let targetStep\s*=/);
  assert.match(journey, /wheelGestureActive/);
  assert.match(
    journey,
    /pointerOffsetY[\s\S]*?resolvedOrbTuning\.flatten\s*\/\s*100/
  );
  assert.match(journey, /addEventListener\("wheel",\s*handleWheel,\s*\{\s*passive:\s*false\s*\}\)/);
  assert.match(journey, /策略执行路径/);
  assert.doesNotMatch(journey, /PORTAL_ASSET|ai-loop-data-portal-v1/);

  assert.match(tuningPanels, /光球初始态调参（临时）/);
  assert.match(tuningPanels, /场景文案调参（临时）/);
  assert.match(
    tuningPanels,
    /DEFAULT_IMMERSIVE_ORB_TUNING[\s\S]*?x:\s*205[\s\S]*?y:\s*120[\s\S]*?scale:\s*120/
  );
  assert.match(tuningPanels, /横向位置 X/);
  assert.match(tuningPanels, /纵向位置 Y/);
  assert.match(tuningPanels, /整体大小/);
  assert.match(tuningPanels, /圆扁比例/);
  assert.match(tuningPanels, /scaleMax=\{500\}/);
  assert.match(tuningPanels, /useState\(false\)/);
  assert.match(tuningPanels, /\{collapsed \? "展开" : "收起"\}/);
  assert.match(tuningPanels, /className="immersive-tuning-card-body"/);
  assert.match(styles, /\.immersive-tuning-card-body\s*\{/);
  assert.match(
    styles,
    /@media \(max-width: 520px\)[\s\S]*?\.immersive-tuning-panels\s*\{[\s\S]*?display:\s*none/
  );
  assert.match(
    styles,
    /\.immersive-scene-copy h2\s*\{[\s\S]*?font-size:\s*clamp\(32px,\s*9\.8vw,\s*40px\)/
  );

  assert.match(orb, /from "ogl"/);
  assert.match(orb, /FRAGMENT_SHADER/);
  assert.doesNotMatch(orb, /getUserMedia|mediaDevices|AudioContext|MicOff/);
  assert.match(styles, /\.immersive-orb-shell/);
  assert.match(styles, /\.immersive-orb-entry-wash/);
  assert.match(
    styles,
    /\.immersive-next-scene-mask\s*\{[\s\S]*?clip-path:\s*ellipse[\s\S]*?mask-image:\s*radial-gradient/
  );
  assert.match(
    styles,
    /\.immersive-scene-copy h2\s*\{[\s\S]*?row-gap:\s*0\.14em/
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.immersive-portal-track\s*\{[\s\S]*?height:\s*100svh/
  );
  assert.match(styles, /\.immersive-portal-track\s*\{[\s\S]*background:\s*#ffffff/);
  assert.match(JSON.parse(packageJson).dependencies.ogl, /^\^?1\./);
});

test("renders the six-card hero before the masked interactive robot", async () => {
  const [
    layout,
    page,
    home,
    navigation,
    productMarquee,
    productHeadingTuning,
    productMotion,
    hero,
    demo,
    robot,
    softField,
    scrollAnimation,
    hologramWorkspace,
    opportunityMap,
    opportunityMapThree,
    opportunityMapBoundaries,
    opportunityMapDataText,
    glowingSearch,
    fluid,
    styles,
    packageJson,
  ] =
    await Promise.all([
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../components/home/home-experience.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../components/home/product-navigation.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/home/product-video-marquee.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/home/product-story-heading-tuning-panel.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/home/product-story-motion.ts",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../components/home/six-card-hero.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/interactive-3d-robot-demo.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../components/ui/interactive-3d-robot.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../components/ui/soft-projection-field.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/container-scroll-animation.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/robot-holographic-workspace.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/o2o-opportunity-map-projection.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/o2o-opportunity-map-three.ts",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/o2o-opportunity-map-boundaries.ts",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../public/data/o2o/dele-20260718.json",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/ui/animated-glowing-search-bar.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../components/ui/blue-fluid-background.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  assert.match(layout, /<html lang="zh-CN">/i);
  assert.match(page, /title:\s*"OTC 精准化营销 AI 智能体"/i);
  assert.match(page, /HomeExperience/);
  assert.ok(home.indexOf("<ProductNavigation") < home.indexOf("<SixCardHero"));
  assert.ok(home.indexOf("<SixCardHero") < home.indexOf("<RobotSection"));
  assert.ok(
    home.indexOf("<RobotSection") < home.indexOf("<ProductVideoMarquee")
  );
  assert.doesNotMatch(home, /NavigationTuningLab|navigationTuning/);
  assert.doesNotMatch(home, /O2OWorkbench|workbench/);

  assert.match(navigation, /landing-nav/);
  assert.match(navigation, /landing-pill-nav/);
  assert.match(navigation, /landing-nav-cta/);
  assert.match(navigation, /six-card-hero/);
  assert.match(navigation, /robot-showcase/);
  assert.match(navigation, /product-stories/);
  assert.match(navigation, /label:\s*"蜂窝地图"/);
  assert.match(navigation, /label:\s*"策略中枢"/);
  assert.doesNotMatch(navigation, /AI 机器人|AI 世界/);
  assert.doesNotMatch(navigation, /navigation-lab|导航调试/);
  assert.match(navigation, /aria-current/);
  assert.match(navigation, /scrollIntoView\(\{\s*behavior:\s*"smooth"/);
  assert.match(navigation, /window\.history\[/);
  assert.match(navigation, />进入系统</);
  assert.match(navigation, /NEXT_PUBLIC_INTERNAL_SYSTEM_ENTRY_URL/);
  assert.match(navigation, /data-auth-entry="feishu"/);
  assert.match(navigation, /href=\{systemEntryUrl\}/);
  assert.match(navigation, /#\/login\?returnTo=%2Foverview/);
  assert.match(
    navigation,
    /const LOCAL_INTERNAL_LOGIN_URL\s*=\s*["']\/internal\/#\/login\?returnTo=%2Foverview["']/,
  );
  assert.doesNotMatch(navigation, /localhost:5173/);
  assert.doesNotMatch(navigation, /location\.assign|FEISHU_APP_SECRET/);
  assert.match(productMarquee, /const ROW_ONE:[\s\S]*const ROW_TWO:/);
  assert.equal(
    productMarquee.match(/id:\s*"[\w-]+"/g)?.length,
    21
  );
  assert.match(
    productMarquee,
    /const TRIPLED_ROW_ONE\s*=\s*\[\.\.\.ROW_ONE,\s*\.\.\.ROW_ONE,\s*\.\.\.ROW_ONE\]/
  );
  assert.match(
    productMarquee,
    /const TRIPLED_ROW_TWO\s*=\s*\[\.\.\.ROW_TWO,\s*\.\.\.ROW_TWO,\s*\.\.\.ROW_TWO\]/
  );
  assert.match(productMarquee, /getLoopedProductRowTranslate/);
  assert.match(productMarquee, /data-product-source-length=\{sourceLength\}/);
  assert.match(productMotion, /PRODUCT_ROW_AUTO_SPEED\s*=\s*46/);
  assert.match(productMotion, /PRODUCT_ROW_STAGGER\s*=\s*216/);
  assert.match(productMotion, /PRODUCT_ROW_MAX_SCROLL_BOOST\s*=\s*640/);
  assert.match(
    productMotion,
    /return\s*\(\s*-cycleWidth\s*\+\s*getCenteredLoopOffset/
  );
  assert.match(productMarquee, /requestAnimationFrame\(animateRows\)/);
  assert.match(productMarquee, /addProductRowScrollBoost/);
  assert.match(productMarquee, /decayProductRowScrollBoost/);
  assert.match(
    productMarquee,
    /firstRowRef\.current[\s\S]*direction:\s*-1[\s\S]*secondRowRef\.current[\s\S]*direction:\s*1/
  );
  assert.match(productMarquee, /addEventListener\("scroll"[\s\S]*passive:\s*true/);
  assert.match(productMarquee, /willChange:\s*"transform"/);
  assert.match(productMarquee, /<video[\s\S]*muted[\s\S]*loop[\s\S]*playsInline/);
  assert.match(productMarquee, /data-product-loop="true"/);
  assert.doesNotMatch(
    productMarquee,
    /data-product-loop=\{duplicateIndex\s*===\s*0/
  );
  assert.match(productMarquee, /preload="none"/);
  assert.match(
    productMarquee,
    /PRODUCT_VIDEO_BASE\s*=\s*"\/visuals\/products\/videos"/
  );
  assert.match(
    productMarquee,
    /data-src=\{`\$\{PRODUCT_VIDEO_BASE\}\/\$\{product\.id\}\.mp4`\}/
  );
  assert.doesNotMatch(
    productMarquee,
    /duplicateIndex\s*===\s*0\s*\?\s*\(\s*<source/
  );
  assert.match(productMarquee, /IntersectionObserver/);
  assert.match(productMarquee, /TextScatter/);
  assert.match(productMarquee, /ProductStoryHeadingTuningPanel/);
  assert.match(productMarquee, /headingTuning/);
  assert.match(productMarquee, /--product-story-heading-x/);
  assert.match(productMarquee, /--product-story-heading-y/);
  assert.match(productMarquee, /--product-story-heading-scale/);
  assert.match(productHeadingTuning, /产品矩阵标题调参（临时）/);
  assert.match(productHeadingTuning, /注释 1 \+ 2 · 标题整组/);
  assert.match(productHeadingTuning, /水平 X/);
  assert.match(productHeadingTuning, /垂直 Y/);
  assert.match(productHeadingTuning, /整体大小/);
  assert.match(productHeadingTuning, /恢复基准/);
  assert.doesNotMatch(productMarquee, /ProductStoryTuningPanel/);
  assert.match(
    productHeadingTuning,
    /DEFAULT_PRODUCT_STORY_HEADING_TUNING[\s\S]*?scale:\s*87[\s\S]*?x:\s*35[\s\S]*?y:\s*9/
  );
  assert.doesNotMatch(productMarquee, /DEFAULT_PRODUCT_STORY_TUNING/);
  assert.doesNotMatch(productMarquee, /data-testid="product-story-tuning-panel"/);
  assert.match(productMarquee, /data-product-row-viewport/);
  assert.match(productMarquee, /data-product-story-row/);
  assert.match(productMarquee, /data-product-story-card/);
  assert.match(productMarquee, /as="p"[\s\S]*PRODUCT STORIES/);
  assert.match(productMarquee, /as="h2"[\s\S]*让每个产品/);
  assert.match(productMarquee, /<BlueFluidBackground/);
  assert.match(hero, /CARD_HOLD_SECONDS\s*=\s*5/);
  assert.match(hero, /CARD_TRANSITION_SECONDS\s*=\s*0\.78/);
  assert.equal(
    hero.match(/\/visuals\/six-card\/loops\/\d{2}-[\w-]+\.mp4/g)?.length,
    6
  );
  assert.match(hero, /otc-comic-card-back-v1\.png/);
  assert.match(hero, /blue-hoodie-character\.png/);
  assert.doesNotMatch(
    hero,
    /HeroCharacterTuningPanel|HERO_CHARACTER_CONTROLS|人物图调参/
  );
  assert.match(
    hero,
    /HERO_CHARACTER_ENTRY_POSE[\s\S]*x:\s*300[\s\S]*y:\s*-27[\s\S]*scale:\s*0\.58/
  );
  assert.match(
    hero,
    /HERO_CHARACTER_FINAL_POSE[\s\S]*x:\s*-36[\s\S]*y:\s*-27[\s\S]*scale:\s*0\.96/
  );
  assert.match(hero, /HERO_CHARACTER_INTRO_DURATION\s*=\s*1600/);
  assert.match(hero, /data-character-motion="scroll-linked"/);
  assert.match(
    hero,
    /scrollRoot\.addEventListener\("scroll",\s*scheduleScrollUpdate/
  );
  assert.match(hero, /getScrollProgress/);
  assert.match(hero, /prefers-reduced-motion:\s*reduce/);
  assert.match(hero, /--hero-character-x/);
  assert.match(hero, /--hero-character-y/);
  assert.match(hero, /--hero-character-scale/);
  assert.match(hero, /TextScatter/);
  assert.match(hero, /CAPABILITY_PAGE_INTERVAL\s*=\s*6500/);
  assert.match(hero, /data-testid="six-card-carousel"/);
  assert.match(hero, /data-testid="hero-card"/);
  assert.match(hero, /selectCarouselCard\(cardIndex\)/);
  assert.match(hero, /carouselPaused\.current\s*=\s*true/);
  assert.match(hero, /carouselPaused\.current\s*=\s*false/);
  assert.match(hero, /if\s*\(!carouselPaused\.current\)/);
  assert.match(hero, /Math\.round\(\s*\(currentProgress - targetIndex\)/);
  assert.match(hero, /<video[\s\S]*autoPlay[\s\S]*loop/);

  assert.match(demo, /\/visuals\/robot\/scene\.splinecode/);
  assert.match(demo, /InteractiveRobotSpline/);
  assert.match(demo, /BlueFluidBackground/);
  assert.match(demo, /object\.name\s*===\s*"Spot Light"/);
  assert.match(demo, /"#F5FAFF"/);
  assert.match(demo, /"#91CAFF"/);
  assert.match(demo, /findObjectByName\("Plane"\)/);
  assert.match(demo, /floor\?\.hide\(\)/);
  assert.doesNotMatch(demo, /eventManager\?\.pause\?\.\(\)/);
  assert.match(demo, /handlers\?\.LookAt/);
  assert.match(demo, /event\.paused\s*=\s*true/);
  assert.match(demo, /pitch:\s*normalizedY\s*\*\s*HEAD_MAX_PITCH/);
  assert.match(demo, /multiplyQuaternions/);
  assert.match(demo, /is-spline-ready/);
  assert.match(demo, /IntersectionObserver/);
  assert.match(demo, /matchMedia\("\(max-width: 680px\)"\)/);
  assert.match(demo, /shouldLoadSpline\s*&&\s*canLoadSpline/);
  assert.match(demo, /preloadInteractiveRobotSpline/);
  assert.match(demo, /preloadRobotScene/);
  assert.match(demo, /Promise\.allSettled/);
  assert.match(demo, /robot-loading-poster/);
  assert.doesNotMatch(demo, /isMapSettled/);
  assert.doesNotMatch(demo, /requestIdleCallback/);
  assert.doesNotMatch(demo, /2400/);
  assert.doesNotMatch(demo, /onMapSettled/);
  assert.match(demo, /previewBounds\.top\s*\+\s*previewBounds\.height\s*\/\s*2\s*-\s*98/);
  assert.match(demo, /SoftProjectionField/);
  assert.match(demo, /RobotHolographicWorkspace/);
  assert.match(demo, /active=\{isStageVisible\s*&&\s*isSplineReady\}/);
  assert.match(
    demo,
    /<RobotHolographicWorkspace[\s\S]*active=\{isStageVisible\}/
  );
  assert.doesNotMatch(
    demo,
    /ProjectionDebugPanel|projectionTuning|DEFAULT_PROJECTION_TUNING/
  );
  assert.match(demo, /robot-cast-shadows/);
  assert.doesNotMatch(
    demo,
    /RobotPositionLab|robot-position-lab|临时调试/
  );
  assert.match(demo, /angle:\s*30/);
  assert.match(demo, /intensity:\s*83/);
  assert.match(demo, /color:\s*\{\s*r:\s*69,\s*g:\s*249,\s*b:\s*243\s*\}/);
  assert.match(demo, /intensity:\s*1\.25/);
  assert.doesNotMatch(
    demo,
    /ColorPicker|机器人调色器|进入工作台|robot-color-tint|robot-head-projection|robot-projection-beam|robot-projection-surface|robot-projection-emitter|NeonReveal/
  );
  assert.match(robot, /@splinetool\/react-spline/);
  assert.match(softField, /import\("three"\)/);
  assert.match(softField, /powerPreference:\s*"low-power"/);
  assert.match(softField, /uConeSlope/);
  assert.match(
    softField,
    /Math\.tan\(\s*\(nextSettings\.angle\s*\*\s*Math\.PI\)\s*\/\s*360\s*\)/
  );
  assert.match(softField, /uIntensity/);
  assert.match(softField, /uColor/);
  assert.match(softField, /settingsRef/);
  assert.match(softField, /uAspect/);
  assert.match(softField, /renderer\.dispose\(\)/);
  assert.match(softField, /className="soft-projection-field"/);
  assert.match(scrollAnimation, /from "framer-motion"/);
  assert.match(scrollAnimation, /useSpring\(progress/);
  assert.doesNotMatch(scrollAnimation, /hasRevealedRef/);
  assert.match(
    scrollAnimation,
    /progress\.set\(\s*active\s*\?\s*nextProgress\s*:\s*Math\.min\(nextProgress,\s*0\.18\)\s*\)/
  );
  assert.match(
    scrollAnimation,
    /useTransform\(smoothProgress,\s*\[0,\s*1\],\s*\[-78,\s*0\]\)/
  );
  assert.match(scrollAnimation, /\[0\.14,\s*0\.62,\s*1\]/);
  assert.match(scrollAnimation, /\[520,\s*0\]/);
  assert.match(scrollAnimation, /pointerRotateX/);
  assert.match(scrollAnimation, /pointerRotateY/);
  assert.match(scrollAnimation, /hologram-tilt-plane/);
  assert.match(scrollAnimation, /hologram-projection-content/);
  assert.match(hologramWorkspace, /OTC AI 智能体投影工作台/);
  assert.match(hologramWorkspace, /告诉我今天需要关注什么/);
  assert.match(hologramWorkspace, /WORKFLOW_STEPS/);
  assert.match(hologramWorkspace, /O2OOpportunityMapProjection/);
  assert.match(hologramWorkspace, /onMapSettled/);
  assert.doesNotMatch(hologramWorkspace, /TASKS|hologram-task-grid|GlowCard/);
  assert.match(hologramWorkspace, /AnimatedGlowingSearchBar/);
  assert.match(opportunityMap, /\/data\/o2o\/dele-20260718\.json/);
  assert.doesNotMatch(opportunityMap, /\/api\/o2o\/overview/);
  assert.match(opportunityMap, /2026-07-18/);
  assert.match(opportunityMapDataText, /6903286104018/);
  assert.match(opportunityMapDataText, /"hives":13954/);
  assert.match(opportunityMap, /preloadOpportunityMapResources/);
  assert.match(opportunityMap, /loadOpportunityMapData/);
  assert.match(opportunityMap, /Segmented/);
  assert.match(opportunityMap, /Select/);
  assert.match(opportunityMap, /Drawer/);
  assert.match(opportunityMap, /Spin/);
  assert.match(opportunityMap, /Empty/);
  assert.match(opportunityMap, /Alert/);
  assert.match(opportunityMap, /待系统接入/);
  assert.match(opportunityMap, /不会自动投放、调价、补货或产生费用/);
  assert.match(opportunityMap, /移动端使用可访问清单/);
  assert.doesNotMatch(
    opportunityMap,
    /if\s*\(\s*!active\s*\|\|\s*dataState\.status\s*!==\s*"loading"/
  );
  assert.doesNotMatch(
    opportunityMap,
    /if\s*\(\s*!active\s*\|\|\s*!data\s*\|\|\s*!container\s*\|\|\s*isMobile/
  );
  assert.doesNotMatch(opportunityMap, /setTimeout\(\s*preload\s*,\s*5000\s*\)/);
  assert.doesNotMatch(
    opportunityMap,
    /prefersReducedMotion\s*\?\s*0\s*:\s*360/
  );
  assert.match(opportunityMapThree, /import \* as THREE from "three"/);
  assert.match(
    opportunityMapThree,
    /import ChinaData from "china-map-geojson\/lib\/china"/
  );
  assert.doesNotMatch(opportunityMapThree, /await import\("three"\)/);
  assert.match(opportunityMapThree, /powerPreference:\s*"low-power"/);
  assert.match(opportunityMapThree, /ResizeObserver/);
  assert.match(opportunityMapThree, /preloadOpportunityMapEngine/);
  assert.match(opportunityMapThree, /pointerdown/);
  assert.match(opportunityMapThree, /pointerup/);
  assert.match(opportunityMapThree, /pointercancel/);
  assert.match(opportunityMapThree, /setPointerCapture/);
  assert.match(opportunityMapThree, /keydown/);
  assert.match(opportunityMapThree, /addEventListener\(\s*"wheel"/);
  assert.match(opportunityMapThree, /passive:\s*false/);
  assert.match(
    opportunityMapThree,
    /const handleWheel[\s\S]*?event\.preventDefault\(\);[\s\S]*?const nextScale/
  );
  assert.match(opportunityMapThree, /intersectPlane/);
  assert.match(opportunityMapThree, /event\.offsetX/);
  assert.match(opportunityMapThree, /world\.scale\.setScalar/);
  assert.match(opportunityMapThree, /MAX_MAP_SCALE/);
  assert.match(opportunityMapThree, /removeEventListener\(\s*"wheel"/);
  assert.match(opportunityMapThree, /activePointerButton/);
  assert.match(
    opportunityMapThree,
    /event\.button\s*!==\s*0\s*&&\s*event\.button\s*!==\s*2/
  );
  assert.match(opportunityMapThree, /panInViewPlane/);
  assert.match(
    opportunityMapThree,
    /applyQuaternion\(\s*camera\.quaternion\s*\)/
  );
  assert.match(opportunityMapThree, /addEventListener\(\s*"contextmenu"/);
  assert.match(opportunityMapThree, /removeEventListener\(\s*"contextmenu"/);
  assert.match(
    opportunityMapThree,
    /按住左键拖动可旋转，按住右键拖动可平移/
  );
  assert.match(opportunityMap, /左键旋转 · 右键拖移 · 滚轮缩放/);
  assert.match(opportunityMapThree, /canvas\.parentElement\s*===\s*container/);
  assert.match(opportunityMapThree, /geometrySliceStartedAt/);
  assert.match(opportunityMapThree, /renderer\.dispose\(\)/);
  assert.match(opportunityMapThree, /renderer\.forceContextLoss\(\)/);
  assert.match(opportunityMapThree, /loadProvinceBoundary/);
  assert.match(opportunityMapThree, /setSelectedProvince[\s\S]*Promise<void>/);
  assert.match(opportunityMapThree, /collectMaterialOpacities/);
  assert.match(opportunityMapThree, /applyOpacityProgress/);
  assert.match(opportunityMapThree, /transitionDuration\s*=\s*260/);
  assert.match(
    opportunityMapThree,
    /requestAnimationFrame\(animateTransition\)/
  );
  assert.doesNotMatch(opportunityMap, /加载\$\{selectedProvince\}城市边界/);
  assert.match(opportunityMap, /返回全国/);
  assert.match(opportunityMap, /城市级 3D 地图/);
  assert.match(
    opportunityMapBoundaries,
    /import\("china-map-geojson\/lib\/province\/shan_dong_geo"\)/
  );
  assert.match(opportunityMapBoundaries, /陕西/);
  assert.match(opportunityMapBoundaries, /山西/);
  assert.doesNotMatch(
    opportunityMapThree,
    /@react-three\/fiber|@react-three\/drei|gsap|zustand|d3-geo/
  );
  const opportunityMapData = JSON.parse(opportunityMapDataText);
  assert.equal(opportunityMapData.meta.snapshot, "2026-07-18");
  assert.equal(opportunityMapData.meta.product.upc, "6903286104018");
  assert.equal(opportunityMapData.national.hives, 13954);
  assert.equal(opportunityMapData.national.readyHives, 6186);
  assert.equal(opportunityMapData.national.riskHives, 7768);
  assert.equal(opportunityMapData.provinces.length, 31);
  assert.equal(
    opportunityMapData.provinces.reduce(
      (count, province) => count + province.cities.length,
      0
    ),
    364
  );
  assert.match(glowingSearch, /Input\.Search/);

  assert.match(fluid, /r:\s*0\.729/);
  assert.match(fluid, /g:\s*0\.878/);
  assert.match(fluid, /b:\s*1/);
  assert.match(fluid, /\/visuals\/fluid-cursor\.js/);
  assert.match(styles, /\/visuals\/blue-gradient-fade\.svg/);
  assert.match(styles, /mix-blend-mode:\s*multiply/);
  assert.match(styles, /filter:\s*blur\(3px\)/);
  assert.match(styles, /opacity:\s*0\.2/);
  assert.doesNotMatch(
    styles,
    /robot-head-projection|robot-projection-beam|robot-projection-surface|robot-projection-emitter|neon-projection-field/
  );
  assert.match(
    styles,
    /\.soft-projection-field\s*\{[\s\S]*inset:\s*0[\s\S]*filter:\s*blur\(18px\)\s+saturate\(1\.08\)[\s\S]*opacity:\s*0\.82/
  );
  assert.match(styles, /scroll-snap-type:\s*y proximity/);
  assert.match(
    styles,
    /\.product-story-marquee\s*\{[\s\S]*?scroll-snap-align:\s*none/
  );
  assert.match(
    styles,
    /\.immersive-portal-track\s*\{[\s\S]*?scroll-snap-align:\s*none/
  );
  assert.match(styles, /\.landing-pill-nav\s*\{[\s\S]*left:\s*50%/);
  assert.match(styles, /\.landing-nav-cta\.ant-btn/);
  assert.match(styles, /\.landing-nav-status/);
  assert.match(
    styles,
    /\.six-card-hero\s*>\s*\[data-testid="blue-hoodie-character"\][\s\S]*translate:\s*var\(--hero-character-x,\s*-36px\)\s+var\(--hero-character-y,\s*-27px\)[\s\S]*scale:\s*var\(--hero-character-scale,\s*0\.96\)[\s\S]*will-change:\s*translate,\s*scale/
  );
  assert.doesNotMatch(styles, /\.hero-character-tuning/);
  assert.match(styles, /@media \(max-width:\s*680px\)[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(
    styles,
    /@media \(max-width:\s*680px\)[\s\S]*\.robot-preview,[\s\S]*\.robot-cast-shadows,[\s\S]*\.robot-stage::before\s*\{[\s\S]*display:\s*none/
  );
  assert.doesNotMatch(styles, /\.navigation-(?:lab|tuning)/);
  assert.match(
    styles,
    /\.landing-nav\s*\{[\s\S]*--landing-brand-y:\s*20px[\s\S]*--landing-brand-scale:\s*1\.2[\s\S]*--landing-pill-y:\s*20px[\s\S]*--landing-pill-scale:\s*1\.2[\s\S]*--landing-cta-y:\s*20px[\s\S]*--landing-cta-scale:\s*1\.2/
  );
  assert.match(styles, /\.home-pages\s*\{[\s\S]*scroll-padding-top:\s*0/);
  assert.match(
    styles,
    /#project-hero-copy\s*\{[\s\S]*translate:\s*0 calc\(-50% \+ 26px\)[\s\S]*scale:\s*1\.224/
  );
  assert.match(styles, /\.robot-stage\s*\{[\s\S]*--robot-scene-scale:\s*0\.9/);
  assert.match(styles, /\.robot-preview\s*\{[\s\S]*scale:\s*0\.9/);
  assert.match(
    styles,
    /\.robot-hologram-workspace\s*\{[\s\S]*width:\s*min\(66\.5vw,\s*1240px\)[\s\S]*transform:\s*translate\(200px,\s*calc\(-49% \+ 3px\)\)\s*scale\(0\.97\)/
  );
  assert.match(
    styles,
    /\.hologram-scroll-surface\s*\{[\s\S]*border:\s*0[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none/
  );
  assert.doesNotMatch(styles, /projection-debug/);
  assert.match(
    styles,
    /\.hologram-tilt-plane\s*\{[\s\S]*overflow:\s*visible[\s\S]*background:\s*transparent/
  );
  assert.match(
    styles,
    /\.hologram-tilt-plane::before\s*\{[\s\S]*filter:\s*blur\(24px\)[\s\S]*mask-image:\s*radial-gradient/
  );
  assert.match(
    styles,
    /\.hologram-tilt-plane::after\s*\{[\s\S]*display:\s*none/
  );
  assert.doesNotMatch(styles, /--hologram-shape|clip-path:\s*var\(--hologram-shape\)/);
  assert.match(
    styles,
    /\.hologram-projection-content\s*\{[\s\S]*perspective\(1320px\)\s+translateX\(40px\)\s+rotateY\(14deg\)\s+scale\(0\.92\)[\s\S]*transform-origin:\s*right center/
  );
  assert.match(styles, /\.o2o-opportunity-map/);
  assert.match(styles, /\.o2o-map-layout/);
  assert.match(styles, /\.o2o-map-webgl/);
  assert.match(
    styles,
    /\.o2o-map-detail-body\s*\{[\s\S]*min-height:\s*118px[\s\S]*contain:\s*layout paint/
  );
  assert.match(
    styles,
    /\.o2o-map-city-list ol\s*\{[\s\S]*height:\s*94px[\s\S]*scrollbar-gutter:\s*stable/
  );
  assert.match(styles, /\.o2o-map-mobile-list/);
  assert.match(
    styles,
    /\.product-story-card\s*\{[\s\S]*width:\s*var\(--product-card-width,\s*420px\)[\s\S]*height:\s*var\(--product-card-height,\s*270px\)[\s\S]*flex:\s*0\s+0\s+var\(--product-card-width,\s*420px\)[\s\S]*border-radius:\s*16px/
  );
  assert.match(
    styles,
    /\.product-story-rows\s*\{[\s\S]*--product-rows-scale:\s*0\.85[\s\S]*width:\s*calc\(100%\s*\/\s*var\(--product-rows-scale\)\)[\s\S]*margin-inline:\s*calc\([\s\S]*scale:\s*var\(--product-rows-scale\)/
  );
  assert.match(
    styles,
    /\.product-story-media\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%[\s\S]*object-fit:\s*cover/
  );
  assert.doesNotMatch(styles, /\.product-story-tuning-panel/);
  assert.match(
    styles,
    /\.product-story-heading h2\s*\{[\s\S]*max-width:\s*none[\s\S]*white-space:\s*nowrap/
  );
  assert.match(
    styles,
    /\.product-story-heading p\s*\{[\s\S]*color:\s*#ffffff[\s\S]*font-size:\s*23px/
  );
  assert.match(
    styles,
    /\.product-story-heading h2\s*\{[\s\S]*color:\s*#234167[\s\S]*font-size:\s*51px/
  );
  assert.match(
    styles,
    /\.product-story-eyebrow-scatter\s*\{[\s\S]*clamp\(-251px,\s*calc\(\(100vw\s*-\s*1204px\)\s*\/\s*-2\),\s*0px\)[\s\S]*-55px/
  );
  assert.match(
    styles,
    /\.product-story-title-scatter\s*\{[\s\S]*clamp\(-255px,\s*calc\(\(100vw\s*-\s*1204px\)\s*\/\s*-2\),\s*0px\)[\s\S]*-35px/
  );
  assert.match(
    styles,
    /@media \(max-width:\s*980px\)\s*\{[\s\S]*\.product-story-heading h2\s*\{[\s\S]*font-size:\s*min\(51px,\s*5\.6vw\)/
  );
  assert.match(
    styles,
    /\.product-story-heading-tuning-layer\s*\{[\s\S]*?translate:[\s\S]*?--product-story-heading-x[\s\S]*?--product-story-heading-y[\s\S]*?scale:\s*var\(--product-story-heading-scale,\s*1\)/
  );
  assert.match(
    styles,
    /\.product-story-heading-tuning-panel\s*\{[\s\S]*?position:\s*absolute[\s\S]*?z-index:\s*50/
  );
  assert.match(
    styles,
    /@media \(max-width:\s*680px\)[\s\S]*?\.product-story-heading-tuning-panel\s*\{[\s\S]*?display:\s*none/
  );
  assert.match(styles, /\.animated-search-shell::before/);
  assert.match(styles, /@keyframes hologram-search-orbit/);
  assert.match(
    styles,
    /\.robot-cast-shadows\s*\{[\s\S]*left:\s*50%[\s\S]*scale\(var\(--robot-scene-scale\)\)[\s\S]*transform-origin:\s*left top/
  );
  assert.match(styles, /\.robot-preview\s*\{[\s\S]*mask-image:/);
  assert.match(
    styles,
    /\.robot-preview\s*\{[\s\S]*z-index:\s*2/
  );
  assert.match(styles, /mask-composite:\s*add/);
  assert.match(
    styles,
    /--robot-horizontal-shift:\s*clamp\(340px,\s*calc\(28vw\s*\+\s*120px\),\s*640px\)/
  );
  assert.match(styles, /--robot-vertical-shift:\s*130px/);
  assert.match(styles, /--robot-user-x:\s*85px/);
  assert.match(styles, /--robot-user-y:\s*-89px/);
  assert.match(styles, /--robot-final-x:\s*calc\(var\(--robot-horizontal-shift\)\s*\+\s*var\(--robot-user-x\)\)/);
  assert.match(styles, /--robot-final-y:\s*calc\(var\(--robot-vertical-shift\)\s*\+\s*var\(--robot-user-y\)\)/);
  assert.match(
    styles,
    /\.robot-preview\s*\{[\s\S]*transform:\s*translate\(\s*var\(--robot-final-x\),\s*var\(--robot-final-y\)\s*\)/
  );
  assert.match(
    styles,
    /\.robot-preview\.is-spline-ready\s*\{[\s\S]*transform:\s*translate\(\s*var\(--robot-final-x\),\s*var\(--robot-final-y\)\s*\)/
  );
  assert.match(
    styles,
    /\.robot-loading-poster\s*\{[\s\S]*opacity:\s*1[\s\S]*transition:\s*opacity/
  );
  assert.match(
    styles,
    /\.robot-preview\.is-spline-ready\s+\.robot-loading-poster\s*\{[\s\S]*opacity:\s*0/
  );
  assert.doesNotMatch(
    styles,
    /workbench|robot-color-lab|robot-color-tint|robot-workbench-entry|robot-position-lab/
  );
  assert.doesNotMatch(packageJson, /drizzle|db:generate/);
  assert.match(packageJson, /"three":\s*"\^0\.185\.1"/);
  assert.match(packageJson, /"china-map-geojson":\s*"1\.0\.4"/);
  assert.match(packageJson, /"framer-motion":/);
  assert.match(packageJson, /"@types\/three":\s*"\^0\.185\.1"/);
  assert.doesNotMatch(`${page}${home}${hero}${demo}`, /<iframe|file:\/\//);
  assert.doesNotMatch(robot, /bg-white/);
});

test("keeps every six-card media asset local", async () => {
  const assets = [
    "../public/visuals/six-card/blue-hoodie-character.png",
    "../public/visuals/six-card/otc-comic-card-back-v1.png",
    "../public/visuals/six-card/loops/01-strategy.mp4",
    "../public/visuals/six-card/loops/02-content.mp4",
    "../public/visuals/six-card/loops/03-collaboration.mp4",
    "../public/visuals/six-card/loops/04-monitoring.mp4",
    "../public/visuals/six-card/loops/05-o2o.mp4",
    "../public/visuals/six-card/loops/06-review.mp4",
    "../public/visuals/robot/scene.splinecode",
    "../public/data/o2o/dele-20260718.json",
  ];

  await Promise.all(
    assets.map((asset) => access(new URL(asset, import.meta.url)))
  );
});

test("keeps the real-impact heading concise", async () => {
  const immersiveJourney = await readFile(
    new URL("../components/home/immersive-journey.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    immersiveJourney,
    /<h2 id="loop-value-title">一条可追溯的营销闭环<\/h2>/
  );
  assert.doesNotMatch(immersiveJourney, /不是更多页面/);
});

test("removes the legacy workbench implementation", async () => {
  const removedFiles = [
    "../app/O2OWorkbench.tsx",
    "../app/api/o2o/route.ts",
    "../app/workbench.css",
    "../lib/o2o-engine.ts",
    "../db/schema.ts",
    "../drizzle.config.ts",
  ];

  await Promise.all(
    removedFiles.map((removedFile) =>
      assert.rejects(access(new URL(removedFile, import.meta.url)))
    )
  );
});
