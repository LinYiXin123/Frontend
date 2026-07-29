"use client";

import { useState } from "react";
import { AnimatedGlowingSearchBar } from "@/components/ui/animated-glowing-search-bar";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { O2OOpportunityMapProjection } from "@/components/ui/o2o-opportunity-map-projection";

const WORKFLOW_STEPS = ["洞察", "策略", "内容", "投放", "监测", "复盘"];

interface RobotHolographicWorkspaceProps {
  active: boolean;
  onMapSettled?: () => void;
}

export function RobotHolographicWorkspace({
  active,
  onMapSettled,
}: RobotHolographicWorkspaceProps) {
  const [command, setCommand] = useState("");
  const [submittedCommand, setSubmittedCommand] = useState("");

  return (
    <aside
      className="robot-hologram-workspace"
      aria-label="OTC AI 智能体投影工作台"
    >
      <ContainerScroll
        active={active}
        titleComponent={
          <div className="hologram-status-row">
            <span className="hologram-status-dot" aria-hidden="true" />
            <strong>OTC AI 智能体</strong>
            <span>在线 · 等待指令</span>
          </div>
        }
      >
        <div className="hologram-command">
          <AnimatedGlowingSearchBar
            aria-label="向 OTC AI 智能体发送指令"
            value={command}
            placeholder="告诉我今天需要关注什么？"
            buttonLabel="发送"
            onChange={(event) => setCommand(event.target.value)}
            onSearch={(value) => {
              const nextCommand = value.trim();
              if (!nextCommand) return;
              setSubmittedCommand(nextCommand);
            }}
          />
          <p aria-live="polite">
            {submittedCommand
              ? `已记录：“${submittedCommand}” · 待系统接口接入`
              : "输入任务后，智能体将在工作流中组织执行步骤。"}
          </p>
        </div>

        <ol className="hologram-workflow" aria-label="营销智能体六步工作流">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>

        <O2OOpportunityMapProjection
          active={active}
          onSettled={onMapSettled}
        />
      </ContainerScroll>
    </aside>
  );
}
