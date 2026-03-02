// ── Externalized Parameter Auditor types ─────────────────────

export type ParamViolationType = 'HARDCODED_URL' | 'HARDCODED_IP' | 'HARDCODED_CREDENTIAL' | 'HARDCODED_SYSTEM_ID' | 'HARDCODED_CLIENT' | 'NON_EXTERNALIZED';

export const ParamViolationLabels: Record<ParamViolationType, string> = {
  HARDCODED_URL: 'Hardcoded URL',
  HARDCODED_IP: 'Hardcoded IP Address',
  HARDCODED_CREDENTIAL: 'Hardcoded Credential',
  HARDCODED_SYSTEM_ID: 'Hardcoded System ID',
  HARDCODED_CLIENT: 'Hardcoded Client Number',
  NON_EXTERNALIZED: 'Non-Externalized Parameter',
};

export interface ParamViolation {
  violationId: string;
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  type: ParamViolationType;
  source: string;
  propertyKey: string;
  currentValue: string;
  recommendation: string;
  runtimeStatus: string;
}

export interface ParamAuditResult {
  violations: ParamViolation[];
  totalViolations: number;
  flowsWithViolations: number;
  flowsScanned: number;
  typeCounts: Record<ParamViolationType, number>;
}
