/**
 * RequirementDocGenerator — for each iFlow, auto-generates a migration
 * requirements document with current state, systems, protocols,
 * transformations, error handling, and proposed S/4 target state.
 */

import type { ExtractionResult, RuntimeArtifact } from '@/types/cpi';
import type { RequirementDoc, RequirementDocResult } from '@/types/req-doc';

const ECC_URL_PATTERNS = [
  '/sap/bc/', '/sap/xi/', '/sap/opu/odata/', ':8000', ':8001', ':44300',
  ':44301', 'sapgw', 'sapecc', 'saperp',
];

export function analyzeFromSnapshot(result: ExtractionResult): RequirementDocResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) runtimeMap.set(rt.id, rt);

  const documents: RequirementDoc[] = [];

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    const pkgName = packageNames.get(flow.packageId) ?? flow.packageId ?? '';
    const rtStatus = runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED';

    // Determine source/target systems
    let sourceSystem = flow.sender || '';
    let targetSystem = flow.receiver || '';
    const protocols: string[] = [];
    const adapterTypes: string[] = [];
    const eccIndicators: string[] = [];
    let hasErrorHandling = false;

    if (content) {
      const senders = (content.adapters || []).filter((a) => a.direction?.toLowerCase() === 'sender');
      const receivers = (content.adapters || []).filter((a) => a.direction?.toLowerCase() === 'receiver');

      if (senders.length > 0 && !sourceSystem) {
        sourceSystem = senders.map((a) => a.adapterType).join(', ');
      }
      if (receivers.length > 0 && !targetSystem) {
        targetSystem = receivers.map((a) => a.adapterType).join(', ');
      }

      for (const adapter of (content.adapters || [])) {
        if (adapter.transportProtocol) protocols.push(adapter.transportProtocol);
        if (adapter.adapterType) adapterTypes.push(adapter.adapterType);

        // Check ECC
        const type = (adapter.adapterType ?? '').toLowerCase();
        if (type === 'rfc' || type.startsWith('rfc_') || type === 'idoc' || type.startsWith('idoc_')) {
          eccIndicators.push(`ECC adapter: ${adapter.adapterType}`);
        }
        const addr = (adapter.address ?? '').toLowerCase();
        for (const p of ECC_URL_PATTERNS) {
          if (addr.includes(p.toLowerCase())) {
            eccIndicators.push(`ECC URL pattern: ${p}`);
            break;
          }
        }
      }

      hasErrorHandling = (content.routes || []).some((r) =>
        r.type?.toLowerCase().includes('exception') ||
        r.componentType?.toLowerCase().includes('exception'));
    }

    const configurations = (flow.configurations || []).map((c) => ({
      key: c.parameterKey, value: c.parameterValue,
    }));

    const scripts = (content?.scripts || []).map((s) => s.fileName) || [];
    const mappings = (content?.mappings || []).map((m) => m.name || m.mappingType) || [];

    const eccRelated = eccIndicators.length > 0;
    let proposedS4State = 'No changes required - not ECC-related';
    if (eccRelated) {
      proposedS4State = 'Requires migration: update endpoints from ECC to S/4HANA APIs. ';
      if (adapterTypes.some((t) => t.toLowerCase() === 'rfc' || t.toLowerCase().startsWith('rfc_'))) {
        proposedS4State += 'Replace RFC with S/4 OData/SOAP APIs. ';
      }
      if (adapterTypes.some((t) => t.toLowerCase() === 'idoc' || t.toLowerCase().startsWith('idoc_'))) {
        proposedS4State += 'Review IDoc message types for S/4 compatibility. ';
      }
      proposedS4State += 'Update credentials and test end-to-end.';
    }

    documents.push({
      flowId: flow.id,
      flowName: flow.name,
      packageId: flow.packageId ?? '',
      packageName: pkgName,
      description: flow.description || '',
      sender: flow.sender || sourceSystem,
      receiver: flow.receiver || targetSystem,
      createdBy: flow.createdBy || '',
      createdAt: flow.createdAt || '',
      modifiedBy: flow.modifiedBy || '',
      modifiedAt: flow.modifiedAt || '',
      runtimeStatus: rtStatus,
      sourceSystem,
      targetSystem,
      protocols: [...new Set(protocols)],
      adapterTypes: [...new Set(adapterTypes)],
      configurations,
      scripts,
      mappings,
      eccRelated,
      eccIndicators: [...new Set(eccIndicators)],
      errorHandling: hasErrorHandling ? 'Exception subprocess configured' : 'No exception handling detected',
      proposedS4State,
    });
  }

  return {
    documents,
    totalFlows: documents.length,
    eccFlows: documents.filter((d) => d.eccRelated).length,
    generatedAt: new Date().toISOString(),
  };
}
