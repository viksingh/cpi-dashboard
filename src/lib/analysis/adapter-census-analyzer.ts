/**
 * AdapterCensusAnalyzer — produces a breakdown of adapter types in use,
 * highlights ECC-specific adapters, and quantifies migration effort.
 */

import type { ExtractionResult } from '@/types/cpi';
import type { AdapterTypeStat, AdapterCensusResult } from '@/types/adapter-census';

const ECC_ADAPTER_TYPES = new Set([
  'rfc', 'idoc', 'idoc_aae', 'xi', 'soap1x', 'soapreceiver1x', 'soapsender1x',
]);

const HIGH_EFFORT_ADAPTERS = new Set([
  'rfc', 'idoc', 'idoc_aae', 'xi',
]);

const MEDIUM_EFFORT_ADAPTERS = new Set([
  'soap', 'odata', 'successfactors', 'ariba', 'elster',
]);

export function analyzeFromSnapshot(result: ExtractionResult): AdapterCensusResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const typeMap = new Map<string, {
    count: number; senderCount: number; receiverCount: number;
    flowIds: Set<string>; flowNames: Set<string>;
  }>();
  let flowsScanned = 0;

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsScanned++;

    for (const adapter of content.adapters) {
      const type = adapter.adapterType || 'Unknown';
      if (!typeMap.has(type)) {
        typeMap.set(type, { count: 0, senderCount: 0, receiverCount: 0, flowIds: new Set(), flowNames: new Set() });
      }
      const entry = typeMap.get(type)!;
      entry.count++;
      if (adapter.direction?.toLowerCase() === 'sender') entry.senderCount++;
      else if (adapter.direction?.toLowerCase() === 'receiver') entry.receiverCount++;
      entry.flowIds.add(flow.id);
      entry.flowNames.add(flow.name);
    }
  }

  const stats: AdapterTypeStat[] = Array.from(typeMap.entries())
    .map(([adapterType, data]) => {
      const lower = adapterType.toLowerCase();
      const eccRelated = ECC_ADAPTER_TYPES.has(lower);
      let migrationEffort: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      let migrationNotes = 'Standard adapter, minimal migration impact';

      if (HIGH_EFFORT_ADAPTERS.has(lower)) {
        migrationEffort = 'HIGH';
        migrationNotes = 'ECC-specific adapter requiring S/4 endpoint reconfiguration';
      } else if (MEDIUM_EFFORT_ADAPTERS.has(lower)) {
        migrationEffort = 'MEDIUM';
        migrationNotes = 'May require endpoint URL or credential updates for S/4';
      }

      return {
        adapterType,
        count: data.count,
        senderCount: data.senderCount,
        receiverCount: data.receiverCount,
        flowCount: data.flowIds.size,
        flowNames: Array.from(data.flowNames),
        eccRelated,
        migrationEffort,
        migrationNotes,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    stats,
    totalAdapters: stats.reduce((sum, s) => sum + s.count, 0),
    uniqueTypes: stats.length,
    eccAdapterCount: stats.filter((s) => s.eccRelated).reduce((sum, s) => sum + s.count, 0),
    flowsScanned,
  };
}
