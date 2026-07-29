"use client";

import { Button, InputNumber, Slider } from "antd";
import { useState, useSyncExternalStore } from "react";

export type ProductStoryHeadingTuningValue = {
  scale: number;
  x: number;
  y: number;
};

export const DEFAULT_PRODUCT_STORY_HEADING_TUNING: ProductStoryHeadingTuningValue =
  {
    scale: 87,
    x: 35,
    y: 9,
  };

type ProductStoryHeadingTuningPanelProps = {
  onChange: (value: ProductStoryHeadingTuningValue) => void;
  value: ProductStoryHeadingTuningValue;
};

type NumericTuningFieldProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
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
  suffix,
  value,
}: NumericTuningFieldProps) {
  return (
    <label className="product-story-heading-tuning-field">
      <span>{label}</span>
      <div className="product-story-heading-tuning-control">
        <Slider
          ariaLabelForHandle={label}
          max={max}
          min={min}
          onChange={onChange}
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
          precision={0}
          suffix={suffix}
          value={value}
        />
      </div>
    </label>
  );
}

export function ProductStoryHeadingTuningPanel({
  onChange,
  value,
}: ProductStoryHeadingTuningPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
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
      aria-label="产品矩阵标题临时调参"
      className={`product-story-heading-tuning-panel${
        collapsed ? " is-collapsed" : ""
      }`}
      data-testid="product-story-heading-tuning-panel"
    >
      <header>
        <div>
          <strong>产品矩阵标题调参（临时）</strong>
          <span>注释 1 + 2 · 标题整组</span>
        </div>
        <Button
          onClick={() => setCollapsed((current) => !current)}
          size="small"
          type="text"
        >
          {collapsed ? "展开" : "收起"}
        </Button>
      </header>

      {collapsed ? null : (
        <div className="product-story-heading-tuning-body">
          <p>基于当前已确认样式，相对调整两段文字的整体位置与大小。</p>
          <NumericTuningField
            label="水平 X"
            max={500}
            min={-500}
            onChange={(x) => onChange({ ...value, x })}
            suffix="px"
            value={value.x}
          />
          <NumericTuningField
            label="垂直 Y"
            max={320}
            min={-320}
            onChange={(y) => onChange({ ...value, y })}
            suffix="px"
            value={value.y}
          />
          <NumericTuningField
            label="整体大小"
            max={180}
            min={40}
            onChange={(scale) => onChange({ ...value, scale })}
            suffix="%"
            value={value.scale}
          />

          <footer>
            <code>
              X {value.x} · Y {value.y} · {value.scale}%
            </code>
            <Button
              onClick={() =>
                onChange(DEFAULT_PRODUCT_STORY_HEADING_TUNING)
              }
              size="small"
            >
              恢复基准
            </Button>
          </footer>
        </div>
      )}
    </aside>
  );
}
