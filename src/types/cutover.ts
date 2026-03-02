// ── Cutover Plan Generator types ─────────────────────────────

export type CutoverRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const CutoverRiskLabels: Record<CutoverRisk, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export interface CutoverItem {
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  wave: number;
  risk: CutoverRisk;
  riskReason: string;
  eccEndpointCount: number;
  dependencyCount: number;
  dependsOn: string[];
  blockedBy: string[];
  runtimeStatus: string;
}

export interface CutoverWave {
  waveNumber: number;
  items: CutoverItem[];
  totalFlows: number;
  eccFlows: number;
  riskSummary: Record<CutoverRisk, number>;
}

export interface CutoverPlan {
  waves: CutoverWave[];
  circularDeps: CutoverItem[];
  totalFlows: number;
  eccFlows: number;
  nonEccFlows: number;
  totalWaves: number;
}
