// ── Cloud Connector Route Mapper types ───────────────────────

export type BackendType = 'ECC' | 'S4' | 'BW' | 'PI_PO' | 'OTHER';

export const BackendTypeLabels: Record<BackendType, string> = {
  ECC: 'SAP ECC',
  S4: 'SAP S/4HANA',
  BW: 'SAP BW',
  PI_PO: 'SAP PI/PO',
  OTHER: 'Other',
};

export interface CloudConnectorRoute {
  routeId: string;
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  adapterType: string;
  direction: string;
  virtualHost: string;
  virtualPort: string;
  locationId: string;
  address: string;
  backendType: BackendType;
  runtimeStatus: string;
}

export interface CloudConnectorResult {
  routes: CloudConnectorRoute[];
  totalRoutes: number;
  eccRoutes: number;
  uniqueLocations: number;
  uniqueVirtualHosts: number;
  flowsUsingCC: number;
  locationCounts: Record<string, number>;
  virtualHostCounts: Record<string, number>;
  backendTypeCounts: Record<BackendType, number>;
}
