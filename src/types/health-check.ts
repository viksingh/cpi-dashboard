// ── Connectivity Health Checker types ────────────────────────

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNREACHABLE' | 'NOT_TESTED';

export const HealthStatusLabels: Record<HealthStatus, string> = {
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  UNREACHABLE: 'Unreachable',
  NOT_TESTED: 'Not Tested',
};

export interface HealthCheckTarget {
  targetId: string;
  hostname: string;
  address: string;
  protocol: string;
  adapterType: string;
  flowId: string;
  flowName: string;
  packageName: string;
  runtimeStatus: string;
  healthStatus: HealthStatus;
  responseTimeMs: number;
  errorMessage: string;
  lastChecked: string;
}

export interface HealthCheckResult {
  targets: HealthCheckTarget[];
  totalTargets: number;
  healthyCount: number;
  degradedCount: number;
  unreachableCount: number;
  notTestedCount: number;
  checkedAt: string;
}
