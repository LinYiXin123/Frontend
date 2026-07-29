"use client";

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Segmented,
  Select,
  Spin,
  Statistic,
  Tag,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type {
  OpportunityMapData,
  OpportunityMapLayer,
  OpportunityMapProvince,
  OpportunityMapSummary,
} from "@/components/ui/o2o-opportunity-map-types";
import type { OpportunityMapController } from "@/components/ui/o2o-opportunity-map-three";

interface O2OOpportunityMapProjectionProps {
  active: boolean;
  onSettled?: () => void;
}

type DataState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: OpportunityMapData }
  | { status: "empty" }
  | { status: "error"; message: string };

const DATA_URL = "/data/o2o/dele-20260718.json";

let opportunityMapDataPromise: Promise<OpportunityMapData> | null = null;
let opportunityMapModulePromise:
  | Promise<typeof import("@/components/ui/o2o-opportunity-map-three")>
  | null = null;

const LAYER_OPTIONS = [
  { label: "供给风险", value: "risk" },
  { label: "覆盖率", value: "coverage" },
  { label: "可售门店", value: "stores" },
] as const;

function isOpportunityMapData(value: unknown): value is OpportunityMapData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OpportunityMapData>;
  return Boolean(
    candidate.meta?.snapshot &&
      candidate.national &&
      Array.isArray(candidate.provinces)
  );
}

function loadOpportunityMapData() {
  if (!opportunityMapDataPromise) {
    opportunityMapDataPromise = fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!isOpportunityMapData(payload)) {
          throw new Error("数据契约校验失败");
        }
        return payload;
      })
      .catch((error: unknown) => {
        opportunityMapDataPromise = null;
        throw error;
      });
  }

  return opportunityMapDataPromise;
}

function loadOpportunityMapModule() {
  if (!opportunityMapModulePromise) {
    opportunityMapModulePromise = import(
      "@/components/ui/o2o-opportunity-map-three"
    ).catch((error: unknown) => {
      opportunityMapModulePromise = null;
      throw error;
    });
  }

  return opportunityMapModulePromise;
}

export async function preloadOpportunityMapResources() {
  const mapModule = await loadOpportunityMapModule();
  await Promise.all([
    loadOpportunityMapData(),
    mapModule.preloadOpportunityMapEngine(),
  ]);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function riskTone(riskRate: number) {
  if (riskRate >= 0.68) return "error";
  if (riskRate >= 0.45) return "warning";
  return "success";
}

function summaryForLayer(
  summary: OpportunityMapSummary,
  layer: OpportunityMapLayer
) {
  if (layer === "coverage") {
    return {
      label: "平均覆盖率",
      value: summary.averageCoverageRate * 100,
      precision: 1,
      suffix: "%",
    };
  }
  if (layer === "stores") {
    return {
      label: "上架可售门店",
      value: summary.sellableStores,
      precision: 0,
      suffix: "家",
    };
  }
  return {
    label: "无供给蜂窝占比",
    value: summary.riskRate * 100,
    precision: 1,
    suffix: "%",
  };
}

function DetailPanel({
  layer,
  province,
  summary,
}: {
  layer: OpportunityMapLayer;
  province: OpportunityMapProvince | null;
  summary: OpportunityMapSummary;
}) {
  const metric = summaryForLayer(summary, layer);
  const riskCities = province?.cities.slice(0, 5) ?? [];

  return (
    <div className="o2o-map-detail-panel">
      <div className="o2o-map-detail-heading">
        <div>
          <small>{province ? "REGION SIGNAL" : "NATIONAL SIGNAL"}</small>
          <strong>{province?.province ?? "全国供给概览"}</strong>
        </div>
        <Tag color={riskTone(summary.riskRate)}>
          {province ? formatPercent(summary.riskRate) : "单日快照"}
        </Tag>
      </div>

      <div className="o2o-map-stat-grid">
        <Statistic
          title={metric.label}
          value={metric.value}
          formatter={(value) =>
            metric.precision === 1
              ? Number(value).toFixed(1)
              : formatNumber(Number(value))
          }
          suffix={metric.suffix}
        />
        <Statistic
          title="蜂窝"
          value={summary.hives}
          formatter={(value) => formatNumber(Number(value))}
        />
        <Statistic
          title="无供给"
          value={summary.riskHives}
          formatter={(value) => formatNumber(Number(value))}
        />
        <Statistic
          title="供给充足"
          value={summary.readyHives}
          formatter={(value) => formatNumber(Number(value))}
        />
      </div>

      <div className="o2o-map-detail-body">
        {province ? (
          <div
            className="o2o-map-city-list"
            aria-label={`${province.province}城市供给风险`}
          >
            <div className="o2o-map-subheading">
              <strong>城市风险</strong>
              <span>按无供给占比排序</span>
            </div>
            {riskCities.length ? (
              <ol>
                {riskCities.map((city) => (
                  <li key={city.city}>
                    <span>{city.city}</span>
                    <small>{formatNumber(city.riskHives)} 个无供给蜂窝</small>
                    <Tag color={riskTone(city.riskRate)}>
                      {formatPercent(city.riskRate)}
                    </Tag>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该地区暂无城市聚合"
              />
            )}
          </div>
        ) : (
          <p className="o2o-map-detail-copy">
            点击地图省份或使用地区选择器，查看城市级供给风险。全国层不加载门店明细。
          </p>
        )}
      </div>

      <div className="o2o-map-action-row">
        <Button type="primary" disabled block>
          生成区域计划草案 · 待系统接入
        </Button>
        <small>不会自动投放、调价、补货或产生费用</small>
      </div>
    </div>
  );
}

export function O2OOpportunityMapProjection({
  active,
  onSettled,
}: O2OOpportunityMapProjectionProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<OpportunityMapController | null>(null);
  const initializationRef = useRef<Promise<void> | null>(null);
  const lifecycleRef = useRef(0);
  const [dataState, setDataState] = useState<DataState>({ status: "loading" });
  const [layer, setLayer] = useState<OpportunityMapLayer>("risk");
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const layerRef = useRef<OpportunityMapLayer>("risk");
  const selectedProvinceRef = useRef<string | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [mapError, setMapError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const selectLayer = (nextLayer: OpportunityMapLayer) => {
    layerRef.current = nextLayer;
    setLayer(nextLayer);
  };

  const selectProvince = (nextProvince: string | null) => {
    selectedProvinceRef.current = nextProvince;
    setSelectedProvince(nextProvince);
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isMobile) return undefined;

    const preload = () => {
      void preloadOpportunityMapResources().catch(() => {
        // The visible loading/error state remains the source of truth.
      });
    };

    if (active) {
      preload();
      return undefined;
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 900 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preload, 240);
    return () => globalThis.clearTimeout(timeoutId);
  }, [active, isMobile]);

  useEffect(() => {
    if (dataState.status !== "loading") return undefined;

    let cancelled = false;
    void loadOpportunityMapData()
      .then((payload) => {
        if (cancelled) return;
        if (!payload.provinces.length) {
          setDataState({ status: "empty" });
          onSettled?.();
          return;
        }
        setDataState({ status: "ready", data: payload });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDataState({
          status: "error",
          message: error instanceof Error ? error.message : "数据加载失败",
        });
        onSettled?.();
      });

    return () => {
      cancelled = true;
    };
  }, [dataState.status, onSettled]);

  const data = dataState.status === "ready" ? dataState.data : null;
  const province = useMemo(
    () =>
      data?.provinces.find((item) => item.province === selectedProvince) ??
      null,
    [data, selectedProvince]
  );
  const summary = province ?? data?.national ?? null;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!data || !container) return undefined;

    if (isMobile) {
      lifecycleRef.current += 1;
      const lifecycle = lifecycleRef.current;
      initializationRef.current = null;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      queueMicrotask(() => {
        if (lifecycleRef.current === lifecycle) setMapStatus("idle");
      });
      if (active) onSettled?.();
      return undefined;
    }

    if (!active || controllerRef.current || initializationRef.current) {
      return undefined;
    }

    const lifecycle = lifecycleRef.current;
    queueMicrotask(() => {
      if (lifecycleRef.current !== lifecycle) return;
      setMapStatus("loading");
      setMapError("");
    });

    const initialization = loadOpportunityMapModule()
      .then(async ({ createOpportunityMap }) => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        return createOpportunityMap({
          container,
          data,
          initialLayer: layerRef.current,
          initialProvince: selectedProvinceRef.current,
          onError: (message) => {
            if (lifecycleRef.current !== lifecycle) return;
            setMapError(message);
            setMapStatus("error");
          },
          onHoverProvince: (nextProvince) => {
            if (lifecycleRef.current === lifecycle) {
              setHoveredProvince(nextProvince);
            }
          },
          onSelectProvince: (nextProvince) => {
            if (lifecycleRef.current !== lifecycle) return;
            selectedProvinceRef.current = nextProvince;
            setSelectedProvince(nextProvince);
          },
          reducedMotion: prefersReducedMotion,
        });
      })
      .then(async (controller) => {
        if (lifecycleRef.current !== lifecycle) {
          controller.dispose();
          return;
        }
        controllerRef.current = controller;
        await controller.setSelectedProvince(selectedProvinceRef.current);
        if (lifecycleRef.current !== lifecycle) {
          controller.dispose();
          return;
        }
        setMapStatus("ready");
        onSettled?.();
      })
      .catch((error: unknown) => {
        if (lifecycleRef.current !== lifecycle) return;
        setMapError(
          error instanceof Error ? error.message : "三维地图初始化失败"
        );
        setMapStatus("error");
        onSettled?.();
      })
      .finally(() => {
        if (initializationRef.current === initialization) {
          initializationRef.current = null;
        }
      });

    initializationRef.current = initialization;
    return undefined;
  }, [active, data, isMobile, onSettled, prefersReducedMotion]);

  useEffect(
    () => () => {
      lifecycleRef.current += 1;
      initializationRef.current = null;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    []
  );

  useEffect(() => {
    controllerRef.current?.setLayer(layer);
  }, [layer]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return undefined;

    let cancelled = false;
    setMapError("");
    setMapStatus((current) => (current === "error" ? "ready" : current));
    void controller
      .setSelectedProvince(selectedProvince)
      .then(() => {
        if (!cancelled) setMapStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMapError(
          error instanceof Error ? error.message : "城市边界加载失败"
        );
        setMapStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProvince]);

  const provinceOptions = useMemo(
    () =>
      data?.provinces
        .map((item) => ({
          label: `${item.province} · ${formatPercent(item.riskRate)}`,
          value: item.province,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")) ?? [],
    [data]
  );

  const mobileProvinces = useMemo(
    () =>
      [...(data?.provinces ?? [])].sort(
        (a, b) => b.riskRate - a.riskRate || b.hives - a.hives
      ),
    [data]
  );

  if (dataState.status === "idle" || dataState.status === "loading") {
    return (
      <div className="o2o-map-feedback" role="status" aria-live="polite">
        <Spin size="large" />
        <span>正在加载 2026-07-18 得乐供给快照</span>
      </div>
    );
  }

  if (dataState.status === "error") {
    return (
      <Alert
        showIcon
        type="error"
        title="O2O 供给数据加载失败"
        description={dataState.message}
      />
    );
  }

  if (dataState.status === "empty" || !data || !summary) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="当前快照没有可展示的 O2O 供给数据"
      />
    );
  }

  return (
    <section
      className="o2o-opportunity-map"
      aria-labelledby="o2o-opportunity-map-title"
    >
      <header className="o2o-map-header">
        <div>
          <div className="o2o-map-eyebrow">
            <Tag color="processing">2026-07-18 供给快照／已确认</Tag>
            <span>STEP 05 · O2O 响应</span>
          </div>
          <h2 id="o2o-opportunity-map-title">O2O 全国供给与机会地图</h2>
          <p>得乐 40 粒 · 全国到城市供给风险</p>
        </div>
        <div className="o2o-map-boundary-status">
          <span aria-hidden="true" />
          边界底图待标准地图复核
        </div>
      </header>

      <div className="o2o-map-controls" aria-label="地图筛选">
        <Select
          aria-label="选择产品"
          className="o2o-map-product-select"
          value={data.meta.product.upc}
          options={[
            {
              value: data.meta.product.upc,
              label: `得乐 40 粒 · ${data.meta.product.upc}`,
            },
          ]}
        />
        <Select
          allowClear
          aria-label="搜索并选择省份"
          className="o2o-map-region-select"
          placeholder="全国／搜索省份"
          value={selectedProvince ?? undefined}
          showSearch={{ optionFilterProp: "label" }}
          onChange={(value) => selectProvince(value ?? null)}
          options={provinceOptions}
        />
        <Segmented
          aria-label="切换地图图层"
          block
          value={layer}
          onChange={(value) => selectLayer(value as OpportunityMapLayer)}
          options={[...LAYER_OPTIONS]}
        />
      </div>

      <div className="o2o-map-layout">
        {isMobile ? (
          <div className="o2o-map-mobile-list" aria-label="省份供给风险清单">
            <p>移动端使用可访问清单；不创建额外 WebGL 地图。</p>
            <ol>
              {mobileProvinces.map((item) => (
                <li key={item.province}>
                  <Button
                    type="text"
                    block
                    onClick={() => {
                      selectProvince(item.province);
                      setMobileDrawerOpen(true);
                    }}
                  >
                    <span>{item.province}</span>
                    <small>{formatNumber(item.riskHives)} 个无供给蜂窝</small>
                    <Tag color={riskTone(item.riskRate)}>
                      {formatPercent(item.riskRate)}
                    </Tag>
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="o2o-map-stage">
            <div
              ref={mapContainerRef}
              className="o2o-map-webgl"
              aria-busy={mapStatus === "loading"}
            />
            <div className="o2o-map-level-control" aria-live="polite">
              <span>
                {selectedProvince
                  ? `${selectedProvince} · 城市级 3D 地图`
                  : "全国 · 省级 3D 地图"}
              </span>
              {selectedProvince ? (
                <Button size="small" onClick={() => selectProvince(null)}>
                  返回全国
                </Button>
              ) : null}
            </div>
            {mapStatus === "loading" ? (
              <div className="o2o-map-stage-status" role="status">
                <Spin />
                <span>初始化轻量 3D 地图</span>
              </div>
            ) : null}
            {mapStatus === "error" ? (
              <Alert
                className="o2o-map-stage-error"
                showIcon
                type="warning"
                title="3D 地图不可用"
                description={`${mapError} 可继续使用右侧地区选择器。`}
              />
            ) : null}
            <div className="o2o-map-legend" aria-label="供给风险图例">
              <span><i className="is-ready" />供给较好</span>
              <span><i className="is-warning" />需关注</span>
              <span><i className="is-risk" />高风险</span>
              <span><i className="is-missing" />数据缺失</span>
            </div>
            <div className="o2o-map-hover-label" aria-live="polite">
              {hoveredProvince
                ? `当前${selectedProvince ? "城市" : "区域"}：${hoveredProvince}`
                : "左键旋转 · 右键拖移 · 滚轮缩放"}
            </div>
          </div>
        )}

        {!isMobile ? (
          <DetailPanel layer={layer} province={province} summary={summary} />
        ) : null}
      </div>

      <footer className="o2o-map-footer">
        <span>
          来源：{data.meta.sourceFile}／{data.meta.sourceSheet}
        </span>
        <span>
          待接入：{data.meta.pendingFields.join("、")}
        </span>
      </footer>

      <Drawer
        title={province?.province ?? "全国供给概览"}
        placement="bottom"
        size="72vh"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        className="o2o-map-mobile-drawer"
      >
        <DetailPanel layer={layer} province={province} summary={summary} />
      </Drawer>
    </section>
  );
}
