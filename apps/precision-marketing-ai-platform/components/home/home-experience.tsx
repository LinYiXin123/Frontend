"use client";

import { ConfigProvider } from "antd";
import { ImmersiveJourney } from "@/components/home/immersive-journey";
import { Section as RobotSection } from "@/components/ui/interactive-3d-robot-demo";
import { ProductNavigation } from "@/components/home/product-navigation";
import { ProductVideoMarquee } from "@/components/home/product-video-marquee";
import { SixCardHero } from "@/components/home/six-card-hero";

export function HomeExperience() {
  return (
    <ConfigProvider
      theme={{
        cssVar: { key: "home-theme-vars" },
        token: {
          colorPrimary: "#1677FF",
          borderRadius: 6,
          borderRadiusLG: 8,
          controlHeight: 36,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <div className="home-pages">
        <ProductNavigation />
        <SixCardHero />
        <RobotSection />
        <ProductVideoMarquee />
        <ImmersiveJourney />
      </div>
    </ConfigProvider>
  );
}
