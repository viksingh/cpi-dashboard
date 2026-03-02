/**
 * HealthCheckAnalyzer — extracts all unique endpoint targets from iFlow
 * adapters for connectivity health checking. Snapshot-based target
 * discovery; actual health checks run via /api/tools/health-check.
 */

import type { ExtractionResult, RuntimeArtifact } from '@/types/cpi';
import type { HealthCheckTarget, HealthCheckResult } from '@/types/health-check';

const SKIP_HOSTS = new Set([
  'www.w3.org', 'schemas.xmlsoap.org', 'xmlns', 'github.com',
  'stackoverflow.com', 'apache.org', 'maven.org',
]);

export function analyzeFromSnapshot(result: ExtractionResult): HealthCheckResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) runtimeMap.set(rt.id, rt);

  const seen = new Set<string>();
  const targets: HealthCheckTarget[] = [];

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    const pkgName = packageNames.get(flow.packageId) ?? flow.packageId ?? '';
    const rtStatus = runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED';

    for (const adapter of content.adapters) {
      const address = adapter.address;
      if (!address || address.trim().length === 0) continue;

      const hostname = extractHostname(address);
      if (!hostname || SKIP_HOSTS.has(hostname)) continue;

      const key = `${hostname}|${adapter.adapterType}|${address}`;
      if (seen.has(key)) continue;
      seen.add(key);

      targets.push({
        targetId: randomId(),
        hostname,
        address,
        protocol: adapter.transportProtocol || adapter.adapterType || '',
        adapterType: adapter.adapterType ?? '',
        flowId: flow.id,
        flowName: flow.name,
        packageName: pkgName,
        runtimeStatus: rtStatus,
        healthStatus: 'NOT_TESTED',
        responseTimeMs: 0,
        errorMessage: '',
        lastChecked: '',
      });
    }
  }

  return {
    targets,
    totalTargets: targets.length,
    healthyCount: 0,
    degradedCount: 0,
    unreachableCount: 0,
    notTestedCount: targets.length,
    checkedAt: '',
  };
}

function extractHostname(url: string): string | null {
  if (!url) return null;
  try {
    let u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'http://' + u;
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function randomId(): string {
  const c = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}
