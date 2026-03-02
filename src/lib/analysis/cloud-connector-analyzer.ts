/**
 * CloudConnectorAnalyzer — maps all on-premise virtual hosts/routes
 * referenced by CPI iFlows for S/4 cutover planning.
 *
 * Filters adapters where proxyType property = 'on-premise',
 * extracts virtual host + port from address URL, groups by host:port,
 * and classifies backend as ECC/S4/OTHER.
 */

import type {
  ExtractionResult,
  IFlowAdapter,
  RuntimeArtifact,
} from '@/types/cpi';
import type {
  CloudConnectorRoute,
  CloudConnectorResult,
  BackendType,
} from '@/types/cloud-connector';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_TYPE_KEYS = ['proxyType', 'ProxyType', 'proxy.type', 'ProxyTypeProperty'] as const;
const LOCATION_ID_KEYS = ['locationId', 'LocationId', 'location.id', 'CloudConnectorLocationId'] as const;

const ECC_PATTERNS = [
  '/sap/bc/', '/sap/xi/', '/sap/opu/odata/', '/sap/bc/srt/', '/sap/bc/soap/',
  '/sap/bc/rest/', ':8000', ':8001', ':44300', ':44301', 'sapgw', 'sapecc', 'saperp',
];

const S4_PATTERNS = [
  's4hana', 's/4hana', ':443/sap/', 'api.sap.com',
];

const BW_PATTERNS = ['bw4hana', 'sapbw', '/sap/bw/'];
const PIPO_PATTERNS = ['sap/xi/engine', 'sappi', 'sap/po/'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeFromSnapshot(
  result: ExtractionResult,
): CloudConnectorResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) {
    runtimeMap.set(rt.id, rt);
  }

  const routes: CloudConnectorRoute[] = [];
  const flowIds = new Set<string>();

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;

    for (const adapter of content.adapters) {
      if (!isOnPremise(adapter)) continue;

      const { host, port } = extractVirtualHostPort(adapter.address);
      const locationId = extractLocationId(adapter);

      const route: CloudConnectorRoute = {
        routeId: randomId(),
        flowId: flow.id,
        flowName: flow.name,
        packageId: flow.packageId ?? '',
        packageName: packageNames.get(flow.packageId) ?? flow.packageId ?? '',
        adapterType: adapter.adapterType ?? '',
        direction: adapter.direction ?? '',
        virtualHost: host,
        virtualPort: port,
        locationId,
        address: adapter.address ?? '',
        backendType: classifyBackend(adapter.address ?? ''),
        runtimeStatus: runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED',
      };

      routes.push(route);
      flowIds.add(flow.id);
    }
  }

  const locationCounts: Record<string, number> = {};
  const virtualHostCounts: Record<string, number> = {};
  const backendTypeCounts: Record<BackendType, number> = { ECC: 0, S4: 0, BW: 0, PI_PO: 0, OTHER: 0 };

  for (const r of routes) {
    const loc = r.locationId || '(default)';
    locationCounts[loc] = (locationCounts[loc] || 0) + 1;

    const vh = r.virtualHost ? `${r.virtualHost}:${r.virtualPort || '*'}` : '(unknown)';
    virtualHostCounts[vh] = (virtualHostCounts[vh] || 0) + 1;

    backendTypeCounts[r.backendType]++;
  }

  return {
    routes,
    totalRoutes: routes.length,
    eccRoutes: routes.filter((r) => r.backendType === 'ECC').length,
    uniqueLocations: Object.keys(locationCounts).length,
    uniqueVirtualHosts: Object.keys(virtualHostCounts).length,
    flowsUsingCC: flowIds.size,
    locationCounts,
    virtualHostCounts,
    backendTypeCounts,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOnPremise(adapter: IFlowAdapter): boolean {
  const props = adapter.properties;
  if (!props) return false;
  for (const key of PROXY_TYPE_KEYS) {
    const val = props[key];
    if (val && val.toLowerCase().includes('on-premise')) return true;
    if (val && val.toLowerCase() === 'onpremise') return true;
  }
  return false;
}

function extractLocationId(adapter: IFlowAdapter): string {
  const props = adapter.properties;
  if (!props) return '';
  for (const key of LOCATION_ID_KEYS) {
    const val = props[key];
    if (val && val.trim().length > 0) return val.trim();
  }
  return '';
}

function extractVirtualHostPort(address: string | undefined | null): { host: string; port: string } {
  if (!address) return { host: '', port: '' };
  try {
    let url = address.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
    };
  } catch {
    // Fallback: try to extract host:port manually
    const match = address.match(/([^/:]+):(\d+)/);
    if (match) return { host: match[1], port: match[2] };
    return { host: address, port: '' };
  }
}

function classifyBackend(address: string): BackendType {
  const lower = address.toLowerCase();
  for (const p of S4_PATTERNS) {
    if (lower.includes(p)) return 'S4';
  }
  for (const p of BW_PATTERNS) {
    if (lower.includes(p)) return 'BW';
  }
  for (const p of PIPO_PATTERNS) {
    if (lower.includes(p)) return 'PI_PO';
  }
  for (const p of ECC_PATTERNS) {
    if (lower.includes(p)) return 'ECC';
  }
  return 'OTHER';
}

function randomId(): string {
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
