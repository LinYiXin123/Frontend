import type { Metadata } from "next";
import { HomeExperience } from "@/components/home/home-experience";

export const metadata: Metadata = {
  title: "OTC 精准化营销 AI 智能体",
  description: "六步营销闭环与蓝白色交互式 3D AI 形象。",
};

export default function Home() {
  return <HomeExperience />;
}
