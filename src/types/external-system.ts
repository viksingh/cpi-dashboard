// ── External System Dependency Map types ─────────────────────

export type SystemCategory = 'ECC' | 'S4' | 'BW' | 'PI_PO' | 'SUCCESSFACTORS' | 'ARIBA' | 'THIRD_PARTY' | 'SAAS' | 'UNKNOWN';

export const SystemCategoryLabels: Record<SystemCategory, string> = {
  ECC: 'SAP ECC',
  S4: 'SAP S/4HANA',
  BW: 'SAP BW',
  PI_PO: 'SAP PI/PO',
  SUCCESSFACTORS: 'SuccessFactors',
  ARIBA: 'Ariba',
  THIRD_PARTY: 'Third Party',
  SAAS: 'SaaS / Cloud',
  UNKNOWN: 'Unknown',
};

export interface ExternalSystem {
  hostname: string;
  category: SystemCategory;
  protocol: string;
  flowCount: number;
  flowNames: string[];
  adapterTypes: string[];
  addresses: string[];
  eccRelated: boolean;
}

export interface ExternalSystemResult {
  systems: ExternalSystem[];
  totalSystems: number;
  eccSystems: number;
  categoryCounts: Record<SystemCategory, number>;
  flowsScanned: number;
}
