/**
 * EndpointAnalyzer — extracts all endpoints (adapter channels and
 * hardcoded script URLs) from a CPI snapshot, enriches them with
 * runtime status, and flags ECC-related connections.
 *
 * Ported from com.sakiv.cpi.endpointtracker.service.EndpointAnalysisService (Java).
 */

import type {
  ExtractionResult,
  IFlowContent,
  IFlowAdapter,
  ScriptInfo,
  RuntimeArtifact,
} from '@/types/cpi';
import type {
  EndpointInfo,
  EndpointInventory,
  EndpointType,
  MigrationStatus,
} from '@/types/endpoint';
import { classifyEndpointType } from '@/types/endpoint';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Regex to find hardcoded URLs in scripts */
const URL_PATTERN = /https?:\/\/[^"'\s,;)}>]+/gi;

/** ECC-related URL patterns */
const ECC_URL_PATTERNS = [
  '/sap/bc/',
  '/sap/xi/',
  '/sap/opu/odata/',
  '/sap/bc/srt/',
  '/sap/bc/bsp/',
  '/sap/bc/adt/',
  '/sap/bc/gui/',
  ':8000/',
  ':8001/',
  ':44300/',
  ':44301/',
  'sapgw',
  'saprouter',
  '/sap/es1/',
  '/sap/bc/soap/',
  '/sap/bc/rest/',
  '.sap-system.',
  'sapecc',
  'saperp',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze an extraction snapshot and return an EndpointInventory
 * (no HTTP calls required).
 */
export function analyzeFromSnapshot(
  result: ExtractionResult,
): EndpointInventory {
  const allFlows = result.allFlows;

  // Build package name lookup
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const allEndpoints: EndpointInfo[] = [];
  let flowsParsed = 0;
  const flowsWithEndpointIds = new Set<string>();

  for (const flow of allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsParsed++;

    const pkgName =
      packageNames.get(flow.packageId) ?? flow.packageId ?? '';

    // Step 1: Extract endpoints from adapters
    const adapterEndpoints = extractFromAdapters(
      content,
      flow.id,
      flow.name,
      flow.packageId,
      pkgName,
    );
    if (adapterEndpoints.length > 0) {
      flowsWithEndpointIds.add(flow.id);
      allEndpoints.push(...adapterEndpoints);
    }

    // Step 2: Scan scripts for hardcoded URLs
    const scriptEndpoints = extractFromScripts(
      content,
      flow.id,
      flow.name,
      flow.packageId,
      pkgName,
    );
    if (scriptEndpoints.length > 0) {
      flowsWithEndpointIds.add(flow.id);
      allEndpoints.push(...scriptEndpoints);
    }
  }

  // Step 3: Enrich with runtime status from snapshot
  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) {
    runtimeMap.set(rt.id, rt);
  }
  for (const ep of allEndpoints) {
    const rt = runtimeMap.get(ep.iflowId);
    ep.runtimeStatus = rt ? rt.status : 'NOT_DEPLOYED';
  }

  // Step 4: Flag ECC-related endpoints
  flagEccEndpoints(allEndpoints);

  return {
    tenantUrl: result.tenantUrl,
    totalPackages: result.packages.length,
    totalFlows: allFlows.length,
    flowsParsed,
    flowsWithEndpoints: flowsWithEndpointIds.size,
    allEndpoints,
  };
}

// ---------------------------------------------------------------------------
// Adapter endpoint extraction
// ---------------------------------------------------------------------------

function extractFromAdapters(
  content: IFlowContent,
  flowId: string,
  flowName: string,
  packageId: string,
  packageName: string,
): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  for (const adapter of (content.adapters || [])) {
    const ep: EndpointInfo = {
      endpointId: randomId(),
      iflowId: flowId,
      iflowName: flowName,
      packageId: packageId,
      packageName: packageName,
      adapterType: adapter.adapterType ?? '',
      endpointType: classifyEndpointType(adapter.adapterType),
      direction: adapter.direction ?? '',
      address: adapter.address ?? '',
      transportProtocol: adapter.transportProtocol ?? '',
      messageProtocol: adapter.messageProtocol ?? '',
      migrationStatus: 'NOT_ASSESSED' as MigrationStatus,
      migrationNotes: '',
      eccRelated: false,
      eccIndicator: '',
      runtimeStatus: '',
      sourceFile: '',
      sourceLine: 0,
      fromScript: false,
    };
    endpoints.push(ep);
  }
  return endpoints;
}

// ---------------------------------------------------------------------------
// Script URL extraction
// ---------------------------------------------------------------------------

function extractFromScripts(
  content: IFlowContent,
  flowId: string,
  flowName: string,
  packageId: string,
  packageName: string,
): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];

  for (const script of (content.scripts || [])) {
    if (!script.content) continue;

    const lines = script.content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip comment lines
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      ) {
        continue;
      }

      URL_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = URL_PATTERN.exec(line)) !== null) {
        const url = match[0];
        if (isRelevantUrl(url)) {
          const ep: EndpointInfo = {
            endpointId: randomId(),
            iflowId: flowId,
            iflowName: flowName,
            packageId: packageId,
            packageName: packageName,
            adapterType: 'Script',
            endpointType: 'HTTP_REST' as EndpointType,
            direction: 'outbound',
            address: url,
            transportProtocol: url.startsWith('https') ? 'HTTPS' : 'HTTP',
            messageProtocol: '',
            migrationStatus: 'NOT_ASSESSED' as MigrationStatus,
            migrationNotes: '',
            eccRelated: false,
            eccIndicator: '',
            runtimeStatus: '',
            sourceFile: script.fileName,
            sourceLine: lineNum + 1,
            fromScript: true,
          };
          endpoints.push(ep);
        }
      }
    }
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// URL relevance filter
// ---------------------------------------------------------------------------

function isRelevantUrl(url: string | null): boolean {
  if (!url || url.length < 10) return false;
  const lower = url.toLowerCase();

  if (lower.includes('github.com')) return false;
  if (lower.includes('stackoverflow.com')) return false;
  if (lower.includes('w3.org')) return false;
  if (lower.includes('xmlns')) return false;
  if (lower.includes('schema.org')) return false;
  if (lower.includes('apache.org')) return false;
  if (lower.includes('maven.org')) return false;
  if (lower.endsWith('.xsd')) return false;
  if (lower.endsWith('.dtd')) return false;
  if (lower.endsWith('.wsdl') && !lower.includes('/sap/')) return false;

  return true;
}

// ---------------------------------------------------------------------------
// ECC flagging
// ---------------------------------------------------------------------------

function flagEccEndpoints(endpoints: EndpointInfo[]): void {
  for (const ep of endpoints) {
    const type = ep.endpointType;

    // RFC and IDoc are always ECC-related
    if (type === 'RFC' || type === 'IDOC') {
      ep.eccRelated = true;
      ep.eccIndicator = `Adapter type: ${type}`;
      continue;
    }

    // XI is typically ECC-related
    if (type === 'XI') {
      ep.eccRelated = true;
      ep.eccIndicator = 'Adapter type: XI/PI (typically ECC)';
      continue;
    }

    // Check address for ECC URL patterns
    const address = ep.address;
    if (address && address.trim().length > 0) {
      const lowerAddress = address.toLowerCase();
      for (const pattern of ECC_URL_PATTERNS) {
        if (lowerAddress.includes(pattern.toLowerCase())) {
          ep.eccRelated = true;
          ep.eccIndicator = `URL pattern: ${pattern}`;
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Generate a random 8-character hex ID */
function randomId(): string {
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
