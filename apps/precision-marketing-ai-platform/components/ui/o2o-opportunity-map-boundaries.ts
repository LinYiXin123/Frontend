import type { ChinaMapFeatureCollection } from "china-map-geojson";

type ProvinceBoundaryModule =
  | ChinaMapFeatureCollection
  | { default: ChinaMapFeatureCollection };

type ProvinceBoundaryLoader = () => Promise<ProvinceBoundaryModule>;

const PROVINCE_BOUNDARY_LOADERS: Record<string, ProvinceBoundaryLoader> = {
  安徽: () => import("china-map-geojson/lib/province/an_hui_geo"),
  澳门: () => import("china-map-geojson/lib/province/ao_men_geo"),
  北京: () => import("china-map-geojson/lib/province/bei_jing_geo"),
  重庆: () => import("china-map-geojson/lib/province/chong_qing_geo"),
  福建: () => import("china-map-geojson/lib/province/fu_jian_geo"),
  甘肃: () => import("china-map-geojson/lib/province/gan_su_geo"),
  广东: () => import("china-map-geojson/lib/province/guang_dong_geo"),
  广西: () => import("china-map-geojson/lib/province/guang_xi_geo"),
  贵州: () => import("china-map-geojson/lib/province/gui_zhou_geo"),
  海南: () => import("china-map-geojson/lib/province/hai_nan_geo"),
  河北: () => import("china-map-geojson/lib/province/he_bei_geo"),
  河南: () => import("china-map-geojson/lib/province/he_nan_geo"),
  黑龙江: () => import("china-map-geojson/lib/province/hei_long_jiang_geo"),
  湖北: () => import("china-map-geojson/lib/province/hu_bei_geo"),
  湖南: () => import("china-map-geojson/lib/province/hu_nan_geo"),
  吉林: () => import("china-map-geojson/lib/province/ji_lin_geo"),
  江苏: () => import("china-map-geojson/lib/province/jiang_su_geo"),
  江西: () => import("china-map-geojson/lib/province/jiang_xi_geo"),
  辽宁: () => import("china-map-geojson/lib/province/liao_ning_geo"),
  内蒙古: () => import("china-map-geojson/lib/province/nei_meng_gu_geo"),
  宁夏: () => import("china-map-geojson/lib/province/ning_xia_geo"),
  青海: () => import("china-map-geojson/lib/province/qing_hai_geo"),
  山东: () => import("china-map-geojson/lib/province/shan_dong_geo"),
  山西: () => import("china-map-geojson/lib/province/shan_xi_1_geo"),
  陕西: () => import("china-map-geojson/lib/province/shan_xi_3_geo"),
  上海: () => import("china-map-geojson/lib/province/shang_hai_geo"),
  四川: () => import("china-map-geojson/lib/province/si_chuan_geo"),
  台湾: () => import("china-map-geojson/lib/province/tai_wan_geo"),
  天津: () => import("china-map-geojson/lib/province/tian_jin_geo"),
  西藏: () => import("china-map-geojson/lib/province/xi_zang_geo"),
  香港: () => import("china-map-geojson/lib/province/xiang_gang_geo"),
  新疆: () => import("china-map-geojson/lib/province/xin_jiang_geo"),
  云南: () => import("china-map-geojson/lib/province/yun_nan_geo"),
  浙江: () => import("china-map-geojson/lib/province/zhe_jiang_geo"),
};

function normalizeBoundaryProvinceName(name: string) {
  return name
    .trim()
    .replace(/壮族自治区|维吾尔自治区|回族自治区|特别行政区|自治区|省|市$/u, "");
}

export async function loadProvinceBoundary(provinceName: string) {
  const normalizedName = normalizeBoundaryProvinceName(provinceName);
  const loader = PROVINCE_BOUNDARY_LOADERS[normalizedName];
  if (!loader) {
    throw new Error(`${provinceName}城市边界尚未收录`);
  }

  const loadedModule = await loader();
  const collection =
    "default" in loadedModule ? loadedModule.default : loadedModule;
  if (!collection?.features?.length) {
    throw new Error(`${provinceName}城市边界为空`);
  }
  return collection;
}
