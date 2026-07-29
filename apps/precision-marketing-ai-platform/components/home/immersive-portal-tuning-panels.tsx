"use client";

import { Button, InputNumber, Slider } from "antd";
import { useState, useSyncExternalStore } from "react";

export type ImmersivePortalTuningValue = {
  flatten?: number;
  x: number;
  y: number;
  scale: number;
};

export const DEFAULT_IMMERSIVE_ORB_TUNING: ImmersivePortalTuningValue = {
  flatten: 100,
  x: 205,
  y: 120,
  scale: 120,
};

export const DEFAULT_IMMERSIVE_COPY_TUNING: ImmersivePortalTuningValue = {
  x: 0,
  y: 0,
  scale: 100,
};

type TuningPanelProps = {
  copyValue: ImmersivePortalTuningValue;
  onCopyChange: (value: ImmersivePortalTuningValue) => void;
  onOrbChange: (value: ImmersivePortalTuningValue) => void;
  orbValue: ImmersivePortalTuningValue;
};

type TuningCardProps = {
  description: string;
  label: string;
  onChange: (value: ImmersivePortalTuningValue) => void;
  onReset: () => void;
  scaleMax?: number;
  showFlatten?: boolean;
  testId: string;
  value: ImmersivePortalTuningValue;
};

type NumericTuningFieldProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  suffix: string;
  value: number;
};

const subscribeToClientReady = () => () => undefined;
const getClientReady = () => true;
const getServerReady = () => false;

function NumericTuningField({
  label,
  max,
  min,
  onChange,
  step = 1,
  suffix,
  value,
}: NumericTuningFieldProps) {
  return (
    <label className="immersive-tuning-field">
      <span>{label}</span>
      <div className="immersive-tuning-control">
        <Slider
          ariaLabelForHandle={label}
          max={max}
          min={min}
          onChange={onChange}
          step={step}
          tooltip={{ formatter: (nextValue) => `${nextValue}${suffix}` }}
          value={value}
        />
        <InputNumber
          aria-label={`${label}数值`}
          changeOnWheel={false}
          controls={false}
          max={max}
          min={min}
          onChange={(nextValue) => {
            if (typeof nextValue === "number") {
              onChange(nextValue);
            }
          }}
          precision={step < 1 ? 2 : 0}
          step={step}
          suffix={suffix}
          value={value}
        />
      </div>
    </label>
  );
}

function TuningCard({
  description,
  label,
  onChange,
  onReset,
  scaleMax = 180,
  showFlatten = false,
  testId,
  value,
}: TuningCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section
      aria-label={label}
      className={`immersive-tuning-card${
        collapsed ? " is-collapsed" : ""
      }`}
      data-testid={testId}
    >
      <header>
        <div>
          <strong>{label}</strong>
          <span>{description}</span>
        </div>
        <Button
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
          size="small"
          type="text"
        >
          {collapsed ? "展开" : "收起"}
        </Button>
      </header>

      {collapsed ? null : (
        <div className="immersive-tuning-card-body">
          <NumericTuningField
            label="横向位置 X"
            max={500}
            min={-500}
            onChange={(x) => onChange({ ...value, x })}
            suffix="px"
            value={value.x}
          />
          <NumericTuningField
            label="纵向位置 Y"
            max={360}
            min={-360}
            onChange={(y) => onChange({ ...value, y })}
            suffix="px"
            value={value.y}
          />
          <NumericTuningField
            label="整体大小"
            max={scaleMax}
            min={40}
            onChange={(scale) => onChange({ ...value, scale })}
            suffix="%"
            value={value.scale}
          />
          {showFlatten ? (
            <NumericTuningField
              label="圆扁比例"
              max={200}
              min={25}
              onChange={(flatten) => onChange({ ...value, flatten })}
              suffix="%"
              value={value.flatten ?? 100}
            />
          ) : null}

          <footer>
            <code>
              X {value.x} · Y {value.y} · {value.scale}%
              {showFlatten ? ` · 圆扁 ${value.flatten ?? 100}%` : ""}
            </code>
            <Button onClick={onReset} size="small">
              恢复基准
            </Button>
          </footer>
        </div>
      )}
    </section>
  );
}

export function ImmersivePortalTuningPanels({
  copyValue,
  onCopyChange,
  onOrbChange,
  orbValue,
}: TuningPanelProps) {
  const isMounted = useSyncExternalStore(
    subscribeToClientReady,
    getClientReady,
    getServerReady
  );

  if (!isMounted) {
    return null;
  }

  return (
    <aside
      aria-label="第四屏临时视觉调参"
      className="immersive-tuning-panels"
      data-testid="immersive-portal-tuning-panels"
    >
      <TuningCard
        description="调整第 0／5 步的初始位置与大小；第 3／5、5／5 步保持已确认关键帧"
        label="光球初始态调参（临时）"
        onChange={onOrbChange}
        onReset={() => onOrbChange(DEFAULT_IMMERSIVE_ORB_TUNING)}
        scaleMax={500}
        showFlatten
        testId="immersive-orb-tuning-panel"
        value={orbValue}
      />
      <TuningCard
        description="调整标题、说明与路径整组区域"
        label="场景文案调参（临时）"
        onChange={onCopyChange}
        onReset={() => onCopyChange(DEFAULT_IMMERSIVE_COPY_TUNING)}
        testId="immersive-copy-tuning-panel"
        value={copyValue}
      />
    </aside>
  );
}
