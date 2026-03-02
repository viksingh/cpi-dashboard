/**
 * InterfaceAnalyzer — extracts interface records (Source -> iFlow -> Target)
 * from a CPI snapshot, enriches with runtime status, and flags ECC-related
 * interfaces.
 *
 * For each adapter in a flow:
 *   - Sender adapter = Inbound  (source = sender participant, target = CPI)
 *   - Receiver adapter = Outbound (source = CPI, target = receiver participant)
 *
 * Ported from com.sakiv.cpi.ifinventory.service.InterfaceAnalysisService (Java).
 */

import type {
  ExtractionResult,
  IFlowContent,
  IFlowAdapter,
  RuntimeArtifact,
} from '@/types/cpi';
import type {
  InterfaceRecord,
  InterfaceInventory,
} from '@/types/interface-inventory';
import { classifyProtocolType } from '@/types/interface-inventory';
import { classifyEndpointType } from '@/types/endpoint';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ECC-related URL patterns (same as endpoint analyzer) */
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
 * Analyze an extraction snapshot and return an InterfaceInventory
 * (no HTTP calls required).
 */
export function analyzeFromSnapshot(
  result: ExtractionResult,
): InterfaceInventory {
  const allFlows = result.allFlows;

  // Build package name lookup
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const allInterfaces: InterfaceRecord[] = [];
  let flowsParsed = 0;
  const flowsWithInterfaceIds = new Set<string>();

  for (const flow of allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsParsed++;

    const pkgName =
      packageNames.get(flow.packageId) ?? flow.packageId ?? '';

    // Collect sender participant names from endpoints
    const senderNames: string[] = [];
    const receiverNames: string[] = [];

    for (const ep of content.endpoints) {
      if (ep.role && ep.role.toLowerCase().includes('sender')) {
        if (ep.name && ep.name.trim().length > 0) {
          senderNames.push(ep.name);
        }
      }
      if (ep.role && ep.role.toLowerCase().includes('receiver')) {
        if (ep.name && ep.name.trim().length > 0) {
          receiverNames.push(ep.name);
        }
      }
    }

    // Fallback names from flow metadata
    const flowSenderFallback =
      flow.sender && flow.sender.trim().length > 0 ? flow.sender : 'Unknown';
    const flowReceiverFallback =
      flow.receiver && flow.receiver.trim().length > 0
        ? flow.receiver
        : 'Unknown';

    for (const adapter of content.adapters) {
      const direction = (adapter.direction ?? '').toLowerCase();
      const isSenderAdapter = direction.includes('sender');

      let sourceSystemName: string;
      let targetSystemName: string;

      if (isSenderAdapter) {
        // Inbound: external system -> CPI
        sourceSystemName =
          senderNames.length > 0 ? senderNames[0] : flowSenderFallback;
        targetSystemName = 'CPI';
      } else {
        // Outbound: CPI -> external system
        sourceSystemName = 'CPI';
        targetSystemName =
          receiverNames.length > 0 ? receiverNames[0] : flowReceiverFallback;
      }

      const record: InterfaceRecord = {
        recordId: randomId(),
        iflowId: flow.id,
        iflowName: flow.name,
        iflowVersion: flow.version,
        packageId: flow.packageId,
        packageName: pkgName,
        sourceSystemName,
        targetSystemName,
        direction: isSenderAdapter ? 'Inbound' : 'Outbound',
        adapterType: adapter.adapterType ?? '',
        protocolType: classifyProtocolType(adapter.adapterType),
        transportProtocol: adapter.transportProtocol ?? '',
        messageProtocol: adapter.messageProtocol ?? '',
        address: adapter.address ?? '',
        runtimeStatus: '',
        eccRelated: false,
        eccIndicator: '',
        modifiedBy: flow.modifiedBy ?? '',
        modifiedAt: flow.modifiedAt ?? '',
      };

      allInterfaces.push(record);
    }

    if (
      content.adapters.length > 0
    ) {
      flowsWithInterfaceIds.add(flow.id);
    }
  }

  // Enrich with runtime status from snapshot
  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) {
    runtimeMap.set(rt.id, rt);
  }
  for (const rec of allInterfaces) {
    const rt = runtimeMap.get(rec.iflowId);
    rec.runtimeStatus = rt ? rt.status : 'NOT_DEPLOYED';
  }

  // Flag ECC-related interfaces
  flagEccInterfaces(allInterfaces);

  return {
    tenantUrl: result.tenantUrl,
    totalPackages: result.packages.length,
    totalFlows: allFlows.length,
    flowsParsed,
    flowsWithInterfaces: flowsWithInterfaceIds.size,
    allInterfaces,
  };
}

// ---------------------------------------------------------------------------
// ECC flagging
// ---------------------------------------------------------------------------

function flagEccInterfaces(records: InterfaceRecord[]): void {
  for (const rec of records) {
    const type = rec.protocolType;

    // RFC and IDoc are always ECC-related
    if (type === 'RFC' || type === 'IDOC') {
      rec.eccRelated = true;
      rec.eccIndicator = `Adapter type: ${type}`;
      continue;
    }

    // XI is typically ECC-related
    if (type === 'XI') {
      rec.eccRelated = true;
      rec.eccIndicator = 'Adapter type: XI/PI (typically ECC)';
      continue;
    }

    // Check address for ECC URL patterns
    const address = rec.address;
    if (address && address.trim().length > 0) {
      const lowerAddress = address.toLowerCase();
      for (const pattern of ECC_URL_PATTERNS) {
        if (lowerAddress.includes(pattern.toLowerCase())) {
          rec.eccRelated = true;
          rec.eccIndicator = `URL pattern: ${pattern}`;
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
