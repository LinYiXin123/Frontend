import type {
  ChinaMapFeatureCollection,
  ChinaMapGeoFeature,
} from "china-map-geojson";
import ChinaData from "china-map-geojson/lib/china";
import * as THREE from "three";
import { loadProvinceBoundary } from "@/components/ui/o2o-opportunity-map-boundaries";
import type {
  OpportunityMapCity,
  OpportunityMapData,
  OpportunityMapLayer,
  OpportunityMapProvince,
  OpportunityMapSummary,
} from "@/components/ui/o2o-opportunity-map-types";

interface CreateOpportunityMapOptions {
  container: HTMLElement;
  data: OpportunityMapData;
  initialLayer: OpportunityMapLayer;
  initialProvince: string | null;
  onError: (message: string) => void;
  onHoverProvince: (province: string | null) => void;
  onSelectProvince: (province: string) => void;
  reducedMotion: boolean;
}

export interface OpportunityMapController {
  dispose: () => void;
  setLayer: (layer: OpportunityMapLayer) => void;
  setSelectedProvince: (province: string | null) => Promise<void>;
}

interface RegionMeshState {
  data: OpportunityMapSummary | null;
  face: import("three").MeshPhysicalMaterial;
  featureName: string;
  group: import("three").Group;
  mesh: import("three").Mesh;
  normalizedName: string;
  regionName: string;
}

const PROVINCE_SUFFIXES = [
  "壮族自治区",
  "维吾尔自治区",
  "回族自治区",
  "特别行政区",
  "自治区",
  "省",
  "市",
] as const;

const DEFAULT_ROTATION_X = -0.34;
const DEFAULT_ROTATION_Z = 0;
const MIN_ROTATION_X = -1.08;
const MAX_ROTATION_X = 0.3;
const MIN_MAP_SCALE = 0.72;
const MAX_MAP_SCALE = 2.4;

export function preloadOpportunityMapEngine() {
  return Promise.resolve();
}

export function normalizeProvinceName(name: string) {
  return PROVINCE_SUFFIXES.reduce(
    (current, suffix) =>
      current.endsWith(suffix) ? current.slice(0, -suffix.length) : current,
    name.trim()
  );
}

function polygonGroups(feature: ChinaMapGeoFeature): number[][][][] {
  if (feature.geometry.type === "Polygon") {
    return [feature.geometry.coordinates as number[][][]];
  }
  return feature.geometry.coordinates as number[][][][];
}

function walkCoordinates(
  collection: ChinaMapFeatureCollection,
  visit: (longitude: number, latitude: number) => void
) {
  collection.features.forEach((feature) => {
    polygonGroups(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([longitude, latitude]) => {
          visit(longitude, latitude);
        });
      });
    });
  });
}

function createProjector(
  collection: ChinaMapFeatureCollection,
  targetWidth: number
) {
  const points: Array<[number, number]> = [];
  walkCoordinates(collection, (longitude, latitude) => {
    const longitudeRadians = (longitude * Math.PI) / 180;
    const latitudeRadians =
      (Math.max(-80, Math.min(80, latitude)) * Math.PI) / 180;
    points.push([
      longitudeRadians,
      Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
    ]);
  });

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 0.0001);
  const height = Math.max(maxY - minY, 0.0001);
  const scale = targetWidth / width;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    height: height * scale,
    project(longitude: number, latitude: number): [number, number] {
      const longitudeRadians = (longitude * Math.PI) / 180;
      const latitudeRadians =
        (Math.max(-80, Math.min(80, latitude)) * Math.PI) / 180;
      const mercatorY = Math.log(
        Math.tan(Math.PI / 4 + latitudeRadians / 2)
      );
      return [
        (longitudeRadians - centerX) * scale,
        (mercatorY - centerY) * scale,
      ];
    },
  };
}

function layerValue(
  province: OpportunityMapSummary | null,
  layer: OpportunityMapLayer,
  maxStores: number
) {
  if (!province) return null;
  if (layer === "coverage") {
    return Math.max(0, Math.min(1, province.averageCoverageRate));
  }
  if (layer === "stores") {
    return Math.max(
      0,
      Math.min(1, province.sellableStores / Math.max(maxStores, 1))
    );
  }
  return Math.max(0, Math.min(1, province.riskRate));
}

function colorForLayer(
  THREE: typeof import("three"),
  province: OpportunityMapSummary | null,
  layer: OpportunityMapLayer,
  maxStores: number
) {
  const value = layerValue(province, layer, maxStores);
  if (!province || value === null) return new THREE.Color("#B8C5D6");

  if (layer === "risk") {
    if (value >= 0.68) return new THREE.Color("#FF7875");
    if (value >= 0.45) return new THREE.Color("#F6BD55");
    return new THREE.Color("#36CFC9");
  }

  if (layer === "coverage") {
    if (value >= 0.14) return new THREE.Color("#36CFC9");
    if (value >= 0.07) return new THREE.Color("#69B1FF");
    if (value > 0) return new THREE.Color("#F6BD55");
    return new THREE.Color("#FF7875");
  }

  if (province.sellableStores === 0) return new THREE.Color("#FF7875");
  if (value >= 0.42) return new THREE.Color("#36CFC9");
  if (value >= 0.16) return new THREE.Color("#69B1FF");
  return new THREE.Color("#F6BD55");
}

function depthForLayer(
  province: OpportunityMapSummary | null,
  layer: OpportunityMapLayer,
  maxStores: number
) {
  const value = layerValue(province, layer, maxStores);
  if (value === null) return 1;
  return 1.2 + value * 3.2;
}

function createShapes(
  THREE: typeof import("three"),
  feature: ChinaMapGeoFeature,
  project: (longitude: number, latitude: number) => [number, number]
) {
  const shapes: import("three").Shape[] = [];

  polygonGroups(feature).forEach((polygon) => {
    const [outerRing, ...holeRings] = polygon;
    if (!outerRing || outerRing.length < 3) return;

    const outer = outerRing.map(
      ([longitude, latitude]) =>
        new THREE.Vector2(...project(longitude, latitude))
    );
    if (!THREE.ShapeUtils.isClockWise(outer)) outer.reverse();

    const shape = new THREE.Shape(outer);
    holeRings.forEach((ring) => {
      if (ring.length < 3) return;
      const hole = ring.map(
        ([longitude, latitude]) =>
          new THREE.Vector2(...project(longitude, latitude))
      );
      if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
      shape.holes.push(new THREE.Path(hole));
    });
    shapes.push(shape);
  });

  return shapes;
}

const CITY_NAME_ALIASES: Record<string, string> = {
  襄樊: "襄阳",
};

function normalizeCityName(name: string) {
  const normalized = name
    .trim()
    .replace(/自治州|地区|市|县|盟|州$/u, "");
  return CITY_NAME_ALIASES[normalized] ?? normalized;
}

function cityForBoundaryFeature(
  featureName: string,
  cities: OpportunityMapCity[]
) {
  const normalizedFeatureName = normalizeCityName(featureName);
  const exact = cities.find(
    (city) => normalizeCityName(city.city) === normalizedFeatureName
  );
  if (exact) return exact;

  return cities.find((city) => {
    const normalizedCityName = normalizeCityName(city.city);
    return (
      normalizedCityName.length >= 2 &&
      featureName.startsWith(normalizedCityName) &&
      /自治州$/u.test(featureName)
    );
  }) ?? null;
}

export async function createOpportunityMap({
  container,
  data,
  initialLayer,
  initialProvince,
  onError,
  onHoverProvince,
  onSelectProvince,
  reducedMotion,
}: CreateOpportunityMapOptions): Promise<OpportunityMapController> {
  const chinaData = ChinaData;

  if (!chinaData?.features?.length) {
    throw new Error("全国边界数据为空");
  }

  let disposed = false;
  let selectedProvince = initialProvince;
  let hoveredProvince: string | null = null;
  let layer = initialLayer;

  const canvas = document.createElement("canvas");
  canvas.className = "o2o-map-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "得乐 2026-07-18 全国 O2O 供给风险三维地图；按住左键拖动可旋转，按住右键拖动可平移，滚轮以鼠标位置缩放，方向键、WASD 与加减号提供键盘操作；地区选择器提供同等信息"
  );
  canvas.tabIndex = 0;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  container.replaceChildren(canvas);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "low-power",
    premultipliedAlpha: true,
  });
  renderer.setClearColor(0xffffff, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 320);
  camera.position.set(0, -64, 104);
  camera.lookAt(0, 1, 0);

  const world = new THREE.Group();
  world.rotation.x = DEFAULT_ROTATION_X;
  world.rotation.z = DEFAULT_ROTATION_Z;
  scene.add(world);

  scene.add(new THREE.HemisphereLight(0xf7fbff, 0x4673a8, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 4.1);
  keyLight.position.set(-24, -18, 70);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x78f4ff, 3.2);
  rimLight.position.set(42, 28, 44);
  scene.add(rimLight);

  const provinceByName = new Map(
    data.provinces.map((province) => [
      normalizeProvinceName(province.province),
      province,
    ])
  );
  let viewProvince: OpportunityMapProvince | null = null;
  let targetProvinceName: string | null = null;
  let viewRequestId = 0;
  let regionStates: RegionMeshState[] = [];
  let interactiveMeshes: import("three").Mesh[] = [];
  let maxStores = 1;
  let activeMapRoot = new THREE.Group();
  let transitionFrameId: number | null = null;
  let cancelTransition: (() => void) | null = null;
  let isTransitioning = false;

  const buildRegionMap = async (
    collection: ChinaMapFeatureCollection,
    province: OpportunityMapProvince | null
  ) => {
    const root = new THREE.Group();
    const states: RegionMeshState[] = [];
    const meshes: import("three").Mesh[] = [];
    const summaries = province?.cities ?? data.provinces;
    const nextMaxStores = Math.max(
      ...summaries.map((summary) => summary.sellableStores),
      1
    );
    const projector = createProjector(collection, 78);

    const glowGeometry = new THREE.PlaneGeometry(94, projector.height + 22);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fdcff,
      opacity: 0.085,
      transparent: true,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -1.4;
    root.add(glow);

    let geometrySliceStartedAt = performance.now();
    for (const [featureIndex, feature] of collection.features.entries()) {
      const provinceData = province
        ? null
        : provinceByName.get(
            normalizeProvinceName(feature.properties.name)
          ) ?? null;
      const cityData = province
        ? cityForBoundaryFeature(feature.properties.name, province.cities)
        : null;
      const regionData = provinceData ?? cityData;
      const regionName =
        provinceData?.province ?? cityData?.city ?? feature.properties.name;
      const normalizedName = province
        ? normalizeCityName(regionName)
        : normalizeProvinceName(regionName);
      const shapes = createShapes(THREE, feature, projector.project);
      if (!shapes.length) continue;

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.12,
        bevelThickness: 0.16,
        curveSegments: 1,
        depth: depthForLayer(regionData, layer, nextMaxStores),
        steps: 1,
      });
      geometry.computeVertexNormals();

      const face = new THREE.MeshPhysicalMaterial({
        clearcoat: 0.74,
        clearcoatRoughness: 0.24,
        color: colorForLayer(THREE, regionData, layer, nextMaxStores),
        emissive: new THREE.Color("#0D3D66"),
        emissiveIntensity: 0.06,
        metalness: 0.1,
        opacity: regionData ? 0.93 : 0.48,
        roughness: 0.28,
        transparent: true,
      });
      const side = new THREE.MeshStandardMaterial({
        color: regionData ? "#2B6EA8" : "#8194A9",
        metalness: 0.12,
        opacity: regionData ? 0.66 : 0.3,
        roughness: 0.42,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, [face, side]);
      mesh.userData.regionName = regionName;
      mesh.userData.isMapped = Boolean(regionData);
      mesh.userData.normalizedName = normalizedName;

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 18),
        new THREE.LineBasicMaterial({
          color: regionData ? 0xd9f2ff : 0xd5dce5,
          opacity: regionData ? 0.68 : 0.34,
          transparent: true,
        })
      );

      const regionGroup = new THREE.Group();
      regionGroup.add(mesh, edges);
      root.add(regionGroup);

      states.push({
        data: regionData,
        face,
        featureName: feature.properties.name,
        group: regionGroup,
        mesh,
        normalizedName,
        regionName,
      });
      meshes.push(mesh);

      if (
        featureIndex < collection.features.length - 1 &&
        performance.now() - geometrySliceStartedAt >= 6
      ) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        geometrySliceStartedAt = performance.now();
      }
    }

    return { maxStores: nextMaxStores, meshes, root, states };
  };

  const nationalMap = await buildRegionMap(chinaData, null);
  activeMapRoot = nationalMap.root;
  regionStates = nationalMap.states;
  interactiveMeshes = nationalMap.meshes;
  maxStores = nationalMap.maxStores;
  world.add(activeMapRoot);

  if (!regionStates.length) {
    renderer.dispose();
    if (canvas.parentElement === container) canvas.remove();
    throw new Error("全国边界几何生成失败");
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let activePointerId: number | null = null;
  let activePointerButton: 0 | 2 | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let dragDistance = 0;
  let suppressNextClick = false;

  const render = () => {
    if (!disposed) renderer.render(scene, camera);
  };

  const updateCursor = () => {
    canvas.style.cursor =
      activePointerButton === 2
        ? "move"
        : activePointerButton === 0
          ? "grabbing"
        : hoveredProvince
          ? "pointer"
          : "grab";
  };

  const resize = () => {
    if (disposed) return;
    const bounds = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };

  const updateVisualState = () => {
    regionStates.forEach((state) => {
      const isSelected =
        !viewProvince && state.regionName === selectedProvince;
      const isHovered = state.regionName === hoveredProvince;
      state.face.color.copy(
        colorForLayer(THREE, state.data, layer, maxStores)
      );
      state.face.emissiveIntensity = isSelected ? 0.58 : isHovered ? 0.28 : 0.06;
      state.face.opacity = state.data ? (isSelected ? 1 : 0.93) : 0.48;
      state.group.position.z = isSelected ? 1.45 : isHovered ? 0.46 : 0;
    });
    render();
  };

  const disposeMapRoot = (root: import("three").Group) => {
    root.traverse((object) => {
      const mesh = object as import("three").Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material?.dispose?.();
      }
    });
  };

  type MaterialOpacityState = {
    material: import("three").Material;
    opacity: number;
  };

  const collectMaterialOpacities = (root: import("three").Group) => {
    const materials = new Set<import("three").Material>();
    root.traverse((object) => {
      const material = (object as import("three").Mesh).material;
      if (Array.isArray(material)) {
        material.forEach((item) => materials.add(item));
      } else if (material) {
        materials.add(material);
      }
    });

    return [...materials].map<MaterialOpacityState>((material) => ({
      material,
      opacity: material.opacity,
    }));
  };

  const applyOpacityProgress = (
    states: MaterialOpacityState[],
    progress: number
  ) => {
    states.forEach(({ material, opacity }) => {
      material.opacity = opacity * progress;
    });
  };

  const commitRegionView = (
    nextMap: Awaited<ReturnType<typeof buildRegionMap>>,
    province: OpportunityMapProvince | null
  ) => {
    activeMapRoot = nextMap.root;
    activeMapRoot.scale.setScalar(1);
    regionStates = nextMap.states;
    interactiveMeshes = nextMap.meshes;
    maxStores = nextMap.maxStores;
    viewProvince = province;
    selectedProvince = province?.province ?? null;
    hoveredProvince = null;
    isTransitioning = false;
    onHoverProvince(null);
    canvas.setAttribute(
      "aria-label",
      province
        ? `得乐 2026-07-18 ${province.province}城市供给风险三维地图；按住左键拖动可旋转，按住右键拖动可平移，滚轮以鼠标位置缩放，方向键、WASD 与加减号提供键盘操作；返回全国按钮提供同等导航`
        : "得乐 2026-07-18 全国 O2O 供给风险三维地图；按住左键拖动可旋转，按住右键拖动可平移，滚轮以鼠标位置缩放，方向键、WASD 与加减号提供键盘操作；地区选择器提供同等信息"
    );
    updateCursor();
    updateVisualState();
  };

  const replaceRegionView = async (nextProvince: string | null) => {
    const requestId = ++viewRequestId;
    cancelTransition?.();
    const province = nextProvince
      ? provinceByName.get(normalizeProvinceName(nextProvince)) ?? null
      : null;
    if (nextProvince && !province) {
      throw new Error(`${nextProvince}不在当前供给快照中`);
    }
    targetProvinceName = province?.province ?? null;

    const collection = province
      ? await loadProvinceBoundary(province.province)
      : chinaData;
    const nextMap = await buildRegionMap(collection, province);

    if (disposed || requestId !== viewRequestId) {
      disposeMapRoot(nextMap.root);
      return;
    }

    const previousRoot = activeMapRoot;
    const previousMaterialStates = collectMaterialOpacities(previousRoot);
    const nextMaterialStates = collectMaterialOpacities(nextMap.root);

    if (reducedMotion) {
      world.remove(previousRoot);
      disposeMapRoot(previousRoot);
      world.add(nextMap.root);
      world.position.set(0, 0, 0);
      world.scale.setScalar(1);
      world.rotation.x = DEFAULT_ROTATION_X;
      world.rotation.z = DEFAULT_ROTATION_Z;
      commitRegionView(nextMap, province);
      return;
    }

    isTransitioning = true;
    hoveredProvince = null;
    onHoverProvince(null);
    applyOpacityProgress(nextMaterialStates, 0);
    nextMap.root.scale.setScalar(0.985);
    world.add(nextMap.root);

    const startPosition = world.position.clone();
    const startScale = world.scale.x;
    const startRotationX = world.rotation.x;
    const startRotationZ = world.rotation.z;
    const transitionStartedAt = performance.now();
    const transitionDuration = 260;

    const completed = await new Promise<boolean>((resolve) => {
      let settled = false;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        if (transitionFrameId !== null) {
          cancelAnimationFrame(transitionFrameId);
          transitionFrameId = null;
        }
        if (cancelTransition === cancel) cancelTransition = null;
        resolve(result);
      };

      const cancel = () => {
        applyOpacityProgress(previousMaterialStates, 1);
        world.remove(nextMap.root);
        disposeMapRoot(nextMap.root);
        world.position.copy(startPosition);
        world.scale.setScalar(startScale);
        world.rotation.x = startRotationX;
        world.rotation.z = startRotationZ;
        isTransitioning = false;
        render();
        finish(false);
      };

      const animateTransition = (now: number) => {
        if (disposed || requestId !== viewRequestId) {
          cancel();
          return;
        }

        const progress = Math.min(
          1,
          (now - transitionStartedAt) / transitionDuration
        );
        const eased = progress * progress * (3 - 2 * progress);

        applyOpacityProgress(previousMaterialStates, 1 - eased);
        applyOpacityProgress(nextMaterialStates, eased);
        previousRoot.scale.setScalar(1 + eased * 0.008);
        nextMap.root.scale.setScalar(0.985 + eased * 0.015);
        world.position.lerpVectors(
          startPosition,
          new THREE.Vector3(),
          eased
        );
        world.scale.setScalar(THREE.MathUtils.lerp(startScale, 1, eased));
        world.rotation.x = THREE.MathUtils.lerp(
          startRotationX,
          DEFAULT_ROTATION_X,
          eased
        );
        world.rotation.z = THREE.MathUtils.lerp(
          startRotationZ,
          DEFAULT_ROTATION_Z,
          eased
        );
        render();

        if (progress >= 1) {
          finish(true);
          return;
        }
        transitionFrameId = requestAnimationFrame(animateTransition);
      };

      cancelTransition = cancel;
      transitionFrameId = requestAnimationFrame(animateTransition);
    });

    if (!completed || disposed || requestId !== viewRequestId) return;

    world.remove(previousRoot);
    disposeMapRoot(previousRoot);
    previousRoot.scale.setScalar(1);
    world.position.set(0, 0, 0);
    world.scale.setScalar(1);
    world.rotation.x = DEFAULT_ROTATION_X;
    world.rotation.z = DEFAULT_ROTATION_Z;
    commitRegionView(nextMap, province);
  };

  const setPointer = (event: {
    clientX: number;
    clientY: number;
    offsetX?: number;
    offsetY?: number;
  }) => {
    const bounds = canvas.getBoundingClientRect();
    const localX =
      typeof event.offsetX === "number"
        ? event.offsetX
        : event.clientX - bounds.left;
    const localY =
      typeof event.offsetY === "number"
        ? event.offsetY
        : event.clientY - bounds.top;
    const width = Math.max(canvas.clientWidth || bounds.width, 1);
    const height = Math.max(canvas.clientHeight || bounds.height, 1);
    pointer.set(
      (localX / width) * 2 - 1,
      -(localY / height) * 2 + 1
    );
  };

  const scaleAroundLocalPoint = (
    nextScale: number,
    localAnchor = new THREE.Vector3()
  ) => {
    scene.updateMatrixWorld(true);
    const worldAnchor = world.localToWorld(localAnchor.clone());
    world.scale.setScalar(nextScale);
    world.updateMatrixWorld(true);
    const shiftedAnchor = world.localToWorld(localAnchor.clone());
    world.position.add(worldAnchor.sub(shiftedAnchor));
    world.updateMatrixWorld(true);
    render();
  };

  const panInViewPlane = (deltaX: number, deltaY: number) => {
    scene.updateMatrixWorld(true);
    const mapWorldPosition = world.getWorldPosition(new THREE.Vector3());
    const distance = camera.position.distanceTo(mapWorldPosition);
    const visibleHeight =
      2 *
      distance *
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const unitsPerPixel = visibleHeight / Math.max(canvas.clientHeight, 1);
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(
      camera.quaternion
    );
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      camera.quaternion
    );

    world.position.addScaledVector(cameraRight, deltaX * unitsPerPixel);
    world.position.addScaledVector(cameraUp, -deltaY * unitsPerPixel);
    world.updateMatrixWorld(true);
    render();
  };

  const localAnchorUnderPointer = (event: WheelEvent) => {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    scene.updateMatrixWorld(true);

    const planeOrigin = world.localToWorld(new THREE.Vector3());
    const planeNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(world.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const mapPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      planeOrigin
    );
    const intersection = raycaster.ray.intersectPlane(
      mapPlane,
      new THREE.Vector3()
    );

    return intersection
      ? world.worldToLocal(intersection.clone())
      : new THREE.Vector3();
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const deltaMultiplier =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? Math.max(canvas.clientHeight, 1)
          : 1;
    const nextScale = Math.max(
      MIN_MAP_SCALE,
      Math.min(
        MAX_MAP_SCALE,
        world.scale.x * Math.exp(-event.deltaY * deltaMultiplier * 0.0014)
      )
    );

    if (Math.abs(nextScale - world.scale.x) < 0.0001) return;
    scaleAroundLocalPoint(nextScale, localAnchorUnderPointer(event));
  };

  const pickRegion = (event: PointerEvent) => {
    if (isTransitioning) return null;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
    if (!hit) return null;
    const name = hit.object.userData.regionName;
    return typeof name === "string" ? name : null;
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (activePointerId === event.pointerId) {
      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      dragDistance += Math.hypot(deltaX, deltaY);

      if (dragDistance >= 4) {
        if (activePointerButton === 2) {
          panInViewPlane(deltaX, deltaY);
        } else {
          world.rotation.z += deltaX * 0.0065;
          world.rotation.x = Math.max(
            MIN_ROTATION_X,
            Math.min(MAX_ROTATION_X, world.rotation.x + deltaY * 0.0045)
          );
        }
        if (hoveredProvince) {
          hoveredProvince = null;
          onHoverProvince(null);
        }
        if (activePointerButton === 0) render();
      }
      return;
    }

    const nextHover = pickRegion(event);
    if (nextHover === hoveredProvince) return;
    hoveredProvince = nextHover;
    updateCursor();
    onHoverProvince(nextHover);
    updateVisualState();
  };

  const handlePointerLeave = () => {
    if (activePointerId !== null) return;
    if (!hoveredProvince) return;
    hoveredProvince = null;
    updateCursor();
    onHoverProvince(null);
    updateVisualState();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (
      isTransitioning ||
      !event.isPrimary ||
      (event.button !== 0 && event.button !== 2)
    ) {
      return;
    }
    activePointerId = event.pointerId;
    activePointerButton = event.button;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    dragDistance = 0;
    suppressNextClick = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    updateCursor();
    event.preventDefault();
  };

  const finishPointerInteraction = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    suppressNextClick =
      activePointerButton === 0 && dragDistance >= 4;
    activePointerId = null;
    activePointerButton = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    updateCursor();
  };

  const handleLostPointerCapture = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    suppressNextClick =
      activePointerButton === 0 && dragDistance >= 4;
    activePointerId = null;
    activePointerButton = null;
    updateCursor();
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  const handleClick = (event: PointerEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (viewProvince) return;
    const nextSelection = pickRegion(event);
    if (
      !nextSelection ||
      !provinceByName.has(normalizeProvinceName(nextSelection))
    ) {
      return;
    }
    selectedProvince =
      provinceByName.get(normalizeProvinceName(nextSelection))?.province ?? null;
    if (selectedProvince) onSelectProvince(selectedProvince);
    updateVisualState();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const rotationStep = event.shiftKey ? 0.16 : 0.08;
    const panStep = event.shiftKey ? 34 : 18;
    const normalizedKey = event.key.toLowerCase();
    if (event.key === "ArrowLeft") {
      world.rotation.z -= rotationStep;
    } else if (event.key === "ArrowRight") {
      world.rotation.z += rotationStep;
    } else if (event.key === "ArrowUp") {
      world.rotation.x = Math.max(
        MIN_ROTATION_X,
        world.rotation.x - rotationStep
      );
    } else if (event.key === "ArrowDown") {
      world.rotation.x = Math.min(
        MAX_ROTATION_X,
        world.rotation.x + rotationStep
      );
    } else if (normalizedKey === "a") {
      panInViewPlane(-panStep, 0);
    } else if (normalizedKey === "d") {
      panInViewPlane(panStep, 0);
    } else if (normalizedKey === "w") {
      panInViewPlane(0, -panStep);
    } else if (normalizedKey === "s") {
      panInViewPlane(0, panStep);
    } else if (event.key === "+" || event.key === "=") {
      scaleAroundLocalPoint(
        Math.min(MAX_MAP_SCALE, world.scale.x * (event.shiftKey ? 1.25 : 1.12))
      );
    } else if (event.key === "-" || event.key === "_") {
      scaleAroundLocalPoint(
        Math.max(MIN_MAP_SCALE, world.scale.x / (event.shiftKey ? 1.25 : 1.12))
      );
    } else if (event.key === "Home") {
      world.position.set(0, 0, 0);
      world.scale.setScalar(1);
      world.rotation.x = DEFAULT_ROTATION_X;
      world.rotation.z = DEFAULT_ROTATION_Z;
    } else {
      return;
    }

    event.preventDefault();
    render();
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onError("WebGL 上下文已丢失，请使用地区清单继续查看。");
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", finishPointerInteraction);
  canvas.addEventListener("pointercancel", finishPointerInteraction);
  canvas.addEventListener("lostpointercapture", handleLostPointerCapture);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  canvas.addEventListener("click", handleClick);
  canvas.addEventListener("contextmenu", handleContextMenu);
  canvas.addEventListener("keydown", handleKeyDown);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", handleContextLost);
  resize();
  updateVisualState();

  return {
    setLayer(nextLayer) {
      layer = nextLayer;
      regionStates.forEach((state) => {
        const nextDepth = depthForLayer(state.data, layer, maxStores);
        const position = state.mesh.geometry.attributes.position;
        if (!(position instanceof THREE.BufferAttribute)) return;
        const currentBounds = new THREE.Box3().setFromBufferAttribute(position);
        const currentDepth = Math.max(
          currentBounds.max.z - currentBounds.min.z,
          0.0001
        );
        state.group.scale.z = nextDepth / currentDepth;
      });
      updateVisualState();
    },
    async setSelectedProvince(nextProvince) {
      if (targetProvinceName === nextProvince) {
        return;
      }
      try {
        await replaceRegionView(nextProvince);
      } catch (error) {
        if (targetProvinceName === nextProvince) {
          targetProvinceName = viewProvince?.province ?? null;
        }
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      viewRequestId += 1;
      cancelTransition?.();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", finishPointerInteraction);
      canvas.removeEventListener("pointercancel", finishPointerInteraction);
      canvas.removeEventListener(
        "lostpointercapture",
        handleLostPointerCapture
      );
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("webglcontextlost", handleContextLost);

      scene.traverse((object) => {
        const mesh = object as import("three").Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material?.dispose?.();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentElement === container) canvas.remove();
    },
  };
}
