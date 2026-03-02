/**
 * ParamAuditAnalyzer — checks all iFlows for hardcoded values that
 * should be externalized: URLs, IPs, credentials, system IDs, client numbers.
 */

import type { ExtractionResult, RuntimeArtifact } from '@/types/cpi';
import type { ParamViolation, ParamAuditResult, ParamViolationType } from '@/types/param-audit';

const URL_RE = /https?:\/\/[^"'\s,;)}>]+/gi;
const IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const CREDENTIAL_RE = /(?:password|secret|token|apikey|api_key)\s*[=:]\s*["'][^"']+["']/gi;
const SYSTEM_ID_RE = /\b(SID|sap_system_id|systemId)\s*[=:]\s*["']?([A-Z]{3})["']?/gi;
const CLIENT_RE = /\b(client|mandt|sap_client)\s*[=:]\s*["']?(\d{3})["']?/gi;

const SAFE_URL_PREFIXES = [
  'http://www.w3.org', 'https://www.w3.org', 'http://schemas', 'https://schemas',
  'http://xmlns', 'https://xmlns', 'http://java.sun.com', 'http://camel.apache.org',
  'http://github.com', 'https://github.com', 'http://apache.org',
];

function isExternalized(value: string): boolean {
  return value.includes('{{') || value.includes('${') || value.includes('$Simple{');
}

function isSafeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SAFE_URL_PREFIXES.some((p) => lower.startsWith(p));
}

export function analyzeFromSnapshot(result: ExtractionResult): ParamAuditResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) runtimeMap.set(rt.id, rt);

  const violations: ParamViolation[] = [];
  const flowIds = new Set<string>();
  let flowsScanned = 0;

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsScanned++;
    const pkgName = packageNames.get(flow.packageId) ?? flow.packageId ?? '';
    const rtStatus = runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED';

    // Check adapter properties for non-externalized values
    for (const adapter of content.adapters) {
      const address = adapter.address ?? '';
      if (address && !isExternalized(address) && address.startsWith('http')) {
        if (!isSafeUrl(address)) {
          violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
            'HARDCODED_URL', `Adapter: ${adapter.adapterType}`, 'address', address,
            'Externalize URL using {{property}} syntax', rtStatus));
          flowIds.add(flow.id);
        }
      }

      if (!adapter.properties) continue;
      for (const [key, val] of Object.entries(adapter.properties)) {
        if (!val || isExternalized(val)) continue;

        // Check for hardcoded IPs
        IP_RE.lastIndex = 0;
        if (IP_RE.test(val) && !key.toLowerCase().includes('subnet') && !key.toLowerCase().includes('mask')) {
          violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
            'HARDCODED_IP', `Adapter: ${adapter.adapterType}`, key, val,
            'Externalize IP address using {{property}} syntax', rtStatus));
          flowIds.add(flow.id);
        }

        // Check for system IDs
        SYSTEM_ID_RE.lastIndex = 0;
        if (SYSTEM_ID_RE.test(val)) {
          violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
            'HARDCODED_SYSTEM_ID', `Adapter: ${adapter.adapterType}`, key, val,
            'Externalize system ID for environment portability', rtStatus));
          flowIds.add(flow.id);
        }

        // Check for client numbers
        CLIENT_RE.lastIndex = 0;
        if (CLIENT_RE.test(val)) {
          violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
            'HARDCODED_CLIENT', `Adapter: ${adapter.adapterType}`, key, val,
            'Externalize SAP client number', rtStatus));
          flowIds.add(flow.id);
        }
      }
    }

    // Scan scripts for hardcoded values
    for (const script of content.scripts) {
      if (!script.content) continue;
      const lines = script.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        CREDENTIAL_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = CREDENTIAL_RE.exec(line)) !== null) {
          violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
            'HARDCODED_CREDENTIAL', `Script: ${script.fileName}:${i + 1}`, 'script', match[0],
            'Use Secure Store credential lookup instead of hardcoded credentials', rtStatus));
          flowIds.add(flow.id);
        }

        URL_RE.lastIndex = 0;
        while ((match = URL_RE.exec(line)) !== null) {
          if (!isSafeUrl(match[0])) {
            violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
              'HARDCODED_URL', `Script: ${script.fileName}:${i + 1}`, 'script', match[0],
              'Externalize URL using property lookup or externalized parameter', rtStatus));
            flowIds.add(flow.id);
          }
        }
      }
    }

    // Check configurations for non-externalized values
    for (const cfg of flow.configurations) {
      const val = cfg.parameterValue ?? '';
      if (!val || isExternalized(val)) continue;
      URL_RE.lastIndex = 0;
      if (URL_RE.test(val) && !isSafeUrl(val)) {
        violations.push(makeViolation(flow.id, flow.name, flow.packageId ?? '', pkgName,
          'NON_EXTERNALIZED', 'Configuration', cfg.parameterKey, val,
          'Consider using externalized parameters for environment-specific values', rtStatus));
        flowIds.add(flow.id);
      }
    }
  }

  const typeCounts: Record<ParamViolationType, number> = {
    HARDCODED_URL: 0, HARDCODED_IP: 0, HARDCODED_CREDENTIAL: 0,
    HARDCODED_SYSTEM_ID: 0, HARDCODED_CLIENT: 0, NON_EXTERNALIZED: 0,
  };
  for (const v of violations) typeCounts[v.type]++;

  return { violations, totalViolations: violations.length, flowsWithViolations: flowIds.size, flowsScanned, typeCounts };
}

function makeViolation(
  flowId: string, flowName: string, packageId: string, packageName: string,
  type: ParamViolationType, source: string, propertyKey: string, currentValue: string,
  recommendation: string, runtimeStatus: string,
): ParamViolation {
  return { violationId: randomId(), flowId, flowName, packageId, packageName, type, source, propertyKey, currentValue, recommendation, runtimeStatus };
}

function randomId(): string {
  const c = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}
