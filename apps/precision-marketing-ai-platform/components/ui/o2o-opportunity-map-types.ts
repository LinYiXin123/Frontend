export type OpportunityMapLayer = "risk" | "coverage" | "stores";

export interface OpportunityMapSummary {
  hives: number;
  sellableStores: number;
  averageCoverageRate: number;
  readyHives: number;
  riskHives: number;
  riskRate: number;
  supplyTypes: Record<string, number>;
}

export interface OpportunityMapCity extends OpportunityMapSummary {
  city: string;
  centroid: [number, number] | null;
}

export interface OpportunityMapProvince extends OpportunityMapSummary {
  province: string;
  cities: OpportunityMapCity[];
}

export interface OpportunityMapData {
  meta: {
    snapshot: string;
    sourceFile: string;
    sourceSheet: string;
    product: {
      brand: string;
      upc: string;
      name: string;
    };
    dedupeKey: string[];
    riskDefinition: string;
    coverageDefinition: string;
    cityCentroidDefinition: string;
    dataStatus: string;
    boundaryStatus: string;
    pendingFields: string[];
  };
  national: OpportunityMapSummary;
  provinces: OpportunityMapProvince[];
}
