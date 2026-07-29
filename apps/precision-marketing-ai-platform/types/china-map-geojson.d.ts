declare module "china-map-geojson" {
  export interface ChinaMapGeoFeature {
    type: "Feature";
    properties: {
      id?: string;
      name: string;
      cp?: [number, number];
    };
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }

  export interface ChinaMapFeatureCollection {
    type: "FeatureCollection";
    features: ChinaMapGeoFeature[];
  }

  export const ChinaData: ChinaMapFeatureCollection;
  export const ProvinceData: Record<string, ChinaMapFeatureCollection>;

  const moduleValue: {
    ChinaData: ChinaMapFeatureCollection;
    ProvinceData: Record<string, ChinaMapFeatureCollection>;
  };

  export default moduleValue;
}

declare module "china-map-geojson/lib/china" {
  import type { ChinaMapFeatureCollection } from "china-map-geojson";

  const ChinaData: ChinaMapFeatureCollection;
  export default ChinaData;
}

declare module "china-map-geojson/lib/province/*_geo" {
  import type { ChinaMapFeatureCollection } from "china-map-geojson";

  const ProvinceData: ChinaMapFeatureCollection;
  export default ProvinceData;
}
