export type DebtCategory =
  | 'AGE'
  | 'COMPLEXITY'
  | 'MISSING_ERROR_HANDLING'
  | 'DEPRECATED_ADAPTERS'
  | 'HARDCODED_VALUES';

export const DebtCategoryLabels: Record<DebtCategory, string> = {
  AGE: 'Age',
  COMPLEXITY: 'Complexity',
  MISSING_ERROR_HANDLING: 'Missing Error Handling',
  DEPRECATED_ADAPTERS: 'Deprecated Adapters',
  HARDCODED_VALUES: 'Hardcoded Values',
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export interface TechDebtScore {
  iflowId: string;
  iflowName: string;
  packageId: string;
  packageName: string | null;
  version: string;
  createdAt: string;
  modifiedAt: string;
  runtimeStatus: string | null;

  ageScore: number;
  complexityScore: number;
  missingErrorHandlingScore: number;
  deprecatedAdapterScore: number;
  hardcodedValueScore: number;
  compositeScore: number;
  riskLevel: RiskLevel;

  findings: Record<DebtCategory, string[]>;

  ageDays: number;
  stepCount: number;
  adapterCount: number;
  scriptCount: number;
  mappingCount: number;
  routeCount: number;
  hasExceptionSubprocess: boolean;
  deprecatedAdapterCount: number;
  hardcodedValueCount: number;
  totalScriptLines: number;
}

export interface ScoringResult {
  tenantUrl: string;
  totalPackages: number;
  totalFlows: number;
  flowsScored: number;
  flowsSkipped: number;
  scores: TechDebtScore[];
}
