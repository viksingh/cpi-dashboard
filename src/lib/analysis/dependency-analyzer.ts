/**
 * DependencyAnalyzer — builds a dependency graph from a CPI extraction
 * snapshot by running 6 analysis passes:
 *
 *   1. ProcessDirect address matching
 *   2. HTTP Loopback detection
 *   3. Shared Value Mappings
 *   4. Shared Scripts
 *   5. DataStore dependencies
 *   6. Configuration references
 *
 * Also exposes graph utility functions: cycle detection, impact analysis,
 * orphan detection, and dependency-count aggregation.
 *
 * Ported from com.sakiv.cpi.depmap.service.DependencyAnalysisService (Java).
 */

import type {
  ExtractionResult,
  IntegrationFlow,
  IFlowContent,
  Configuration,
} from '@/types/cpi';
import type {
  DependencyGraph,
  Dependency,
  DependencyType,
} from '@/types/dependency';

// ---------------------------------------------------------------------------
// DataStore property keys to scan
// ---------------------------------------------------------------------------

const DATA_STORE_KEYS = [
  'DataStoreNameProperty',
  'storeName',
  'dataStoreName',
  'DataStoreName',
  'data_store_name',
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze an extraction snapshot and return a fully-populated
 * DependencyGraph (no HTTP calls required).
 */
export function analyzeFromSnapshot(
  result: ExtractionResult,
  tenantUrl: string,
): DependencyGraph {
  const allFlows = result.allFlows;

  const flowsById: Record<string, IntegrationFlow> = {};
  const contentMap = new Map<string, IFlowContent>();

  for (const flow of allFlows) {
    flowsById[flow.id] = flow;
    if (flow.iflowContent) {
      contentMap.set(flow.id, flow.iflowContent);
    }
  }

  const dependencies: Dependency[] = [];
  const unresolvedReferences: string[] = [];

  // Pass 1: ProcessDirect
  analyzeProcessDirect(allFlows, contentMap, dependencies, unresolvedReferences);

  // Pass 2: HTTP Loopback
  analyzeHttpLoopback(allFlows, contentMap, dependencies, tenantUrl);

  // Pass 3: Shared Value Mappings
  analyzeSharedValueMappings(allFlows, contentMap, dependencies);

  // Pass 4: Shared Scripts
  analyzeSharedScripts(allFlows, contentMap, dependencies);

  // Pass 5: DataStore
  analyzeDataStores(allFlows, contentMap, dependencies);

  // Pass 6: Configuration refs
  analyzeConfigurationRefs(allFlows, dependencies);

  return { flowsById, dependencies, unresolvedReferences };
}

// ---------------------------------------------------------------------------
// Graph utilities
// ---------------------------------------------------------------------------

/**
 * Detect cycles in the dependency graph using 3-colour DFS.
 * Returns an array of cycle descriptions (one per back-edge found).
 */
export function detectCycles(graph: DependencyGraph): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: string[] = [];

  // Build adjacency list
  const adj = new Map<string, { target: string; dep: Dependency }[]>();
  for (const dep of graph.dependencies) {
    if (!adj.has(dep.sourceFlowId)) adj.set(dep.sourceFlowId, []);
    adj.get(dep.sourceFlowId)!.push({ target: dep.targetFlowId, dep });
  }

  for (const flowId of Object.keys(graph.flowsById)) {
    color.set(flowId, WHITE);
  }

  function dfs(u: string): void {
    color.set(u, GRAY);
    const neighbours = adj.get(u) ?? [];
    for (const { target: v, dep } of neighbours) {
      const c = color.get(v);
      if (c === undefined) {
        // node not in flowsById but referenced as target
        continue;
      }
      if (c === WHITE) {
        parent.set(v, u);
        dfs(v);
      } else if (c === GRAY) {
        // back-edge: cycle detected
        const sourceName = graph.flowsById[u]?.name ?? u;
        const targetName = graph.flowsById[v]?.name ?? v;
        cycles.push(
          `Cycle: ${sourceName} -> ${targetName} (${dep.type}: ${dep.details})`,
        );
      }
    }
    color.set(u, BLACK);
  }

  for (const flowId of Object.keys(graph.flowsById)) {
    if (color.get(flowId) === WHITE) {
      parent.set(flowId, null);
      dfs(flowId);
    }
  }

  return cycles;
}

/**
 * BFS bidirectional traversal: returns the set of all flow IDs that are
 * reachable from `flowId` in either direction (impacted by changes).
 */
export function getImpactedFlows(
  graph: DependencyGraph,
  flowId: string,
): Set<string> {
  // Build bidirectional adjacency
  const adj = new Map<string, Set<string>>();
  for (const dep of graph.dependencies) {
    if (!adj.has(dep.sourceFlowId)) adj.set(dep.sourceFlowId, new Set());
    adj.get(dep.sourceFlowId)!.add(dep.targetFlowId);

    if (!adj.has(dep.targetFlowId)) adj.set(dep.targetFlowId, new Set());
    adj.get(dep.targetFlowId)!.add(dep.sourceFlowId);
  }

  const visited = new Set<string>();
  const queue: string[] = [flowId];
  visited.add(flowId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbours = adj.get(current);
    if (!neighbours) continue;
    for (const neighbour of neighbours) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  // Remove the starting node itself — only return impacted *other* flows
  visited.delete(flowId);
  return visited;
}

/**
 * Returns flow IDs that have no dependencies (neither source nor target).
 */
export function getOrphanFlows(graph: DependencyGraph): string[] {
  const connected = new Set<string>();
  for (const dep of graph.dependencies) {
    connected.add(dep.sourceFlowId);
    connected.add(dep.targetFlowId);
  }

  return Object.keys(graph.flowsById).filter((id) => !connected.has(id));
}

/**
 * Aggregate dependency counts by type.
 */
export function getDependencyCountsByType(
  graph: DependencyGraph,
): Record<DependencyType, number> {
  const counts: Record<string, number> = {
    PROCESS_DIRECT: 0,
    HTTP_LOOPBACK: 0,
    SHARED_VALUE_MAPPING: 0,
    SHARED_SCRIPT: 0,
    DATA_STORE: 0,
    CONFIGURATION_REF: 0,
  };

  for (const dep of graph.dependencies) {
    counts[dep.type] = (counts[dep.type] ?? 0) + 1;
  }

  return counts as Record<DependencyType, number>;
}

// ---------------------------------------------------------------------------
// Pass 1: ProcessDirect
// ---------------------------------------------------------------------------

function analyzeProcessDirect(
  allFlows: IntegrationFlow[],
  contentMap: Map<string, IFlowContent>,
  dependencies: Dependency[],
  unresolvedReferences: string[],
): void {
  // Build sender address map: normalized address -> flow
  const senderAddresses = new Map<string, IntegrationFlow>();

  for (const flow of allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const adapter of (content.adapters || [])) {
      if (
        adapter.adapterType?.toLowerCase() === 'processdirect' &&
        adapter.direction?.toLowerCase() === 'sender'
      ) {
        const address = normalizeAddress(adapter.address);
        if (address) {
          senderAddresses.set(address, flow);
        }
      }
    }
  }

  // Match receiver ProcessDirect adapters to senders
  for (const flow of allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const adapter of (content.adapters || [])) {
      if (
        adapter.adapterType?.toLowerCase() === 'processdirect' &&
        adapter.direction?.toLowerCase() === 'receiver'
      ) {
        const address = normalizeAddress(adapter.address);
        if (!address) continue;

        const targetFlow = senderAddresses.get(address);
        if (targetFlow && targetFlow.id !== flow.id) {
          dependencies.push({
            sourceFlowId: flow.id,
            sourceFlowName: flow.name,
            sourcePackageId: flow.packageId ?? null,
            targetFlowId: targetFlow.id,
            targetFlowName: targetFlow.name,
            targetPackageId: targetFlow.packageId ?? null,
            type: 'PROCESS_DIRECT',
            details: `Address: ${address}`,
          });
        } else if (!targetFlow) {
          unresolvedReferences.push(
            `ProcessDirect address '${address}' from ${flow.name} has no matching sender`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 2: HTTP Loopback
// ---------------------------------------------------------------------------

function analyzeHttpLoopback(
  allFlows: IntegrationFlow[],
  contentMap: Map<string, IFlowContent>,
  dependencies: Dependency[],
  tenantUrl: string,
): void {
  const tenantHost = extractHostname(tenantUrl);
  if (!tenantHost) return;

  for (const flow of allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const adapter of (content.adapters || [])) {
      if (adapter.direction?.toLowerCase() !== 'receiver') continue;
      const typeLower = (adapter.adapterType ?? '').toLowerCase();

      if (
        typeLower.includes('http') ||
        typeLower.includes('soap') ||
        typeLower.includes('rest') ||
        typeLower.includes('odata')
      ) {
        const address = adapter.address;
        if (address && address.includes(tenantHost)) {
          dependencies.push({
            sourceFlowId: flow.id,
            sourceFlowName: flow.name,
            sourcePackageId: flow.packageId ?? null,
            targetFlowId: flow.id,
            targetFlowName: flow.name,
            targetPackageId: flow.packageId ?? null,
            type: 'HTTP_LOOPBACK',
            details: `Adapter: ${adapter.adapterType}, Address: ${address}`,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 3: Shared Value Mappings
// ---------------------------------------------------------------------------

function analyzeSharedValueMappings(
  allFlows: IntegrationFlow[],
  contentMap: Map<string, IFlowContent>,
  dependencies: Dependency[],
): void {
  const mappingToFlows = new Map<string, IntegrationFlow[]>();

  for (const flow of allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const mapping of (content.mappings || [])) {
      const resourceId = mapping.resourceId;
      if (resourceId && resourceId.trim().length > 0) {
        if (!mappingToFlows.has(resourceId)) {
          mappingToFlows.set(resourceId, []);
        }
        mappingToFlows.get(resourceId)!.push(flow);
      }
    }
  }

  for (const [resourceId, flows] of mappingToFlows) {
    if (flows.length > 1) {
      createPairwiseDependencies(
        flows,
        'SHARED_VALUE_MAPPING',
        `Mapping: ${resourceId}`,
        dependencies,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 4: Shared Scripts
// ---------------------------------------------------------------------------

function analyzeSharedScripts(
  allFlows: IntegrationFlow[],
  contentMap: Map<string, IFlowContent>,
  dependencies: Dependency[],
): void {
  const scriptToFlows = new Map<string, IntegrationFlow[]>();

  for (const flow of allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const script of (content.scripts || [])) {
      const fileName = script.fileName;
      if (fileName && fileName.trim().length > 0) {
        if (!scriptToFlows.has(fileName)) {
          scriptToFlows.set(fileName, []);
        }
        scriptToFlows.get(fileName)!.push(flow);
      }
    }
  }

  for (const [fileName, flows] of scriptToFlows) {
    if (flows.length > 1) {
      createPairwiseDependencies(
        flows,
        'SHARED_SCRIPT',
        `Script: ${fileName}`,
        dependencies,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 5: DataStore
// ---------------------------------------------------------------------------

function analyzeDataStores(
  allFlows: IntegrationFlow[],
  contentMap: Map<string, IFlowContent>,
  dependencies: Dependency[],
): void {
  const dsToFlows = new Map<string, IntegrationFlow[]>();

  for (const flow of allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    const dsNames = extractDataStoreNames(content);
    for (const dsName of dsNames) {
      if (!dsToFlows.has(dsName)) {
        dsToFlows.set(dsName, []);
      }
      dsToFlows.get(dsName)!.push(flow);
    }
  }

  for (const [dsName, flows] of dsToFlows) {
    if (flows.length > 1) {
      createPairwiseDependencies(
        flows,
        'DATA_STORE',
        `DataStore: ${dsName}`,
        dependencies,
      );
    }
  }
}

function extractDataStoreNames(content: IFlowContent): Set<string> {
  const names = new Set<string>();

  // Check adapter properties
  for (const adapter of (content.adapters || [])) {
    const props = adapter.properties;
    if (!props) continue;
    for (const key of DATA_STORE_KEYS) {
      const val = props[key];
      if (val && val.trim().length > 0) {
        names.add(val.trim());
      }
    }
  }

  // Check route properties
  for (const route of (content.routes || [])) {
    const props = route.properties;
    if (!props) continue;
    for (const key of DATA_STORE_KEYS) {
      const val = props[key];
      if (val && val.trim().length > 0) {
        names.add(val.trim());
      }
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Pass 6: Configuration References
// ---------------------------------------------------------------------------

function analyzeConfigurationRefs(
  allFlows: IntegrationFlow[],
  dependencies: Dependency[],
): void {
  const allFlowIds = new Set<string>();
  const flowById = new Map<string, IntegrationFlow>();
  for (const flow of allFlows) {
    allFlowIds.add(flow.id);
    flowById.set(flow.id, flow);
  }

  for (const flow of allFlows) {
    if (!flow.configurations) continue;

    for (const cfg of flow.configurations) {
      const value = cfg.parameterValue;
      if (!value || value.trim().length === 0) continue;

      for (const otherFlowId of allFlowIds) {
        if (otherFlowId === flow.id) continue;
        if (value.includes(otherFlowId)) {
          const targetFlow = flowById.get(otherFlowId);
          dependencies.push({
            sourceFlowId: flow.id,
            sourceFlowName: flow.name,
            sourcePackageId: flow.packageId ?? null,
            targetFlowId: otherFlowId,
            targetFlowName: targetFlow?.name ?? otherFlowId,
            targetPackageId: targetFlow?.packageId ?? null,
            type: 'CONFIGURATION_REF',
            details: `Config key: ${cfg.parameterKey} = ${value}`,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPairwiseDependencies(
  flows: IntegrationFlow[],
  type: DependencyType,
  details: string,
  dependencies: Dependency[],
): void {
  for (let i = 0; i < flows.length; i++) {
    for (let j = i + 1; j < flows.length; j++) {
      const a = flows[i];
      const b = flows[j];
      dependencies.push({
        sourceFlowId: a.id,
        sourceFlowName: a.name,
        sourcePackageId: a.packageId ?? null,
        targetFlowId: b.id,
        targetFlowName: b.name,
        targetPackageId: b.packageId ?? null,
        type,
        details,
      });
    }
  }
}

function normalizeAddress(address: string | undefined | null): string | null {
  if (!address || address.trim().length === 0) return null;
  let normalized = address.trim().toLowerCase();
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return normalized;
}

function extractHostname(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const stripped = url.replace(/^https?:\/\//, '');
    const slashIdx = stripped.indexOf('/');
    return slashIdx > 0 ? stripped.substring(0, slashIdx) : stripped;
  } catch {
    return null;
  }
}
