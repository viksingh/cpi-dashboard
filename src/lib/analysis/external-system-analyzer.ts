/**
 * ExternalSystemAnalyzer — extracts all endpoint URLs/hostnames from
 * iFlow adapters and scripts. Builds a graph of every external system
 * the CPI tenant connects to.
 */

import type { ExtractionResult } from '@/types/cpi';
import type { ExternalSystem, ExternalSystemResult, SystemCategory } from '@/types/external-system';

const ECC_PATTERNS = ['/sap/bc/', '/sap/xi/', 'sapgw', ':8000', ':8001', ':44300', ':44301', 'sapecc', 'saperp'];
const S4_PATTERNS = ['s4hana', 's/4hana', 'api.sap.com'];
const BW_PATTERNS = ['bw4hana', 'sapbw', '/sap/bw/'];
const PIPO_PATTERNS = ['sap/xi/engine', 'sappi', 'sap/po/'];
const SF_PATTERNS = ['successfactors', 'sfsf'];
const ARIBA_PATTERNS = ['ariba'];
const SAAS_PATTERNS = ['salesforce', 'workday', 'servicenow', 'azure', 'amazonaws', 'googleapis'];

const URL_RE = /https?:\/\/[^"'\s,;)}>]+/gi;
const SKIP_HOSTS = new Set(['www.w3.org', 'schemas.xmlsoap.org', 'xmlns', 'github.com', 'stackoverflow.com', 'apache.org', 'maven.org', 'schema.org']);

export function analyzeFromSnapshot(result: ExtractionResult): ExternalSystemResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const systemMap = new Map<string, {
    hostname: string; protocol: string; flowIds: Set<string>; flowNames: Set<string>;
    adapterTypes: Set<string>; addresses: Set<string>;
  }>();
  let flowsScanned = 0;

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsScanned++;

    for (const adapter of (content.adapters || [])) {
      const address = adapter.address;
      if (!address || address.trim().length === 0) continue;
      const host = extractHostname(address);
      if (!host || SKIP_HOSTS.has(host)) continue;

      if (!systemMap.has(host)) {
        systemMap.set(host, {
          hostname: host,
          protocol: adapter.transportProtocol || adapter.adapterType || '',
          flowIds: new Set(), flowNames: new Set(),
          adapterTypes: new Set(), addresses: new Set(),
        });
      }
      const entry = systemMap.get(host)!;
      entry.flowIds.add(flow.id);
      entry.flowNames.add(flow.name);
      entry.adapterTypes.add(adapter.adapterType || '');
      entry.addresses.add(address);
    }

    // Scan scripts for URLs
    for (const script of (content.scripts || [])) {
      if (!script.content) continue;
      URL_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = URL_RE.exec(script.content)) !== null) {
        const host = extractHostname(match[0]);
        if (!host || SKIP_HOSTS.has(host)) continue;
        if (!systemMap.has(host)) {
          systemMap.set(host, {
            hostname: host, protocol: 'HTTP',
            flowIds: new Set(), flowNames: new Set(),
            adapterTypes: new Set(), addresses: new Set(),
          });
        }
        const entry = systemMap.get(host)!;
        entry.flowIds.add(flow.id);
        entry.flowNames.add(flow.name);
        entry.adapterTypes.add('Script');
        entry.addresses.add(match[0]);
      }
    }
  }

  const systems: ExternalSystem[] = Array.from(systemMap.values()).map((entry) => {
    const category = classifySystem(entry.hostname, entry.addresses);
    return {
      hostname: entry.hostname,
      category,
      protocol: entry.protocol,
      flowCount: entry.flowIds.size,
      flowNames: Array.from(entry.flowNames),
      adapterTypes: Array.from(entry.adapterTypes),
      addresses: Array.from(entry.addresses),
      eccRelated: category === 'ECC',
    };
  }).sort((a, b) => b.flowCount - a.flowCount);

  const categoryCounts: Record<SystemCategory, number> = {
    ECC: 0, S4: 0, BW: 0, PI_PO: 0, SUCCESSFACTORS: 0, ARIBA: 0,
    THIRD_PARTY: 0, SAAS: 0, UNKNOWN: 0,
  };
  for (const s of systems) categoryCounts[s.category]++;

  return {
    systems,
    totalSystems: systems.length,
    eccSystems: systems.filter((s) => s.eccRelated).length,
    categoryCounts,
    flowsScanned,
  };
}

function classifySystem(hostname: string, addresses: Set<string>): SystemCategory {
  const lower = hostname.toLowerCase();
  const allAddrs = Array.from(addresses).join(' ').toLowerCase();
  for (const p of S4_PATTERNS) if (lower.includes(p) || allAddrs.includes(p)) return 'S4';
  for (const p of SF_PATTERNS) if (lower.includes(p)) return 'SUCCESSFACTORS';
  for (const p of ARIBA_PATTERNS) if (lower.includes(p)) return 'ARIBA';
  for (const p of BW_PATTERNS) if (lower.includes(p) || allAddrs.includes(p)) return 'BW';
  for (const p of PIPO_PATTERNS) if (lower.includes(p) || allAddrs.includes(p)) return 'PI_PO';
  for (const p of ECC_PATTERNS) if (lower.includes(p) || allAddrs.includes(p)) return 'ECC';
  for (const p of SAAS_PATTERNS) if (lower.includes(p)) return 'SAAS';
  return 'UNKNOWN';
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
