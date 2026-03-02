/**
 * CutoverAnalyzer — auto-generates sequenced migration waves from
 * the dependency graph + ECC endpoint analysis.
 *
 * Reuses existing dependency-analyzer and endpoint-analyzer outputs.
 * Uses Kahn's algorithm (topological sort) to assign waves.
 * Risk levels: CRITICAL, HIGH, MEDIUM, LOW based on ECC exposure + deps.
 */

import type {
  ExtractionResult,
  IntegrationFlow,
  RuntimeArtifact,
} from '@/types/cpi';
import type {
  CutoverItem,
  CutoverWave,
  CutoverPlan,
  CutoverRisk,
} from '@/types/cutover';
import { analyzeFromSnapshot as analyzeDependencies, detectCycles } from './dependency-analyzer';
import { analyzeFromSnapshot as analyzeEndpoints } from './endpoint-analyzer';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeFromSnapshot(
  result: ExtractionResult,
): CutoverPlan {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) {
    runtimeMap.set(rt.id, rt);
  }

  // Step 1: Get dependency graph
  const depGraph = analyzeDependencies(result, result.tenantUrl);

  // Step 2: Get endpoint inventory for ECC classification
  const endpointInv = analyzeEndpoints(result);
  const eccCountByFlow = new Map<string, number>();
  for (const ep of endpointInv.allEndpoints) {
    if (ep.eccRelated) {
      eccCountByFlow.set(ep.iflowId, (eccCountByFlow.get(ep.iflowId) || 0) + 1);
    }
  }

  // Step 3: Build adjacency for topological sort
  // dependency: source depends on target
  const inDegree = new Map<string, number>();
  const dependsOnMap = new Map<string, Set<string>>();
  const blockedByMap = new Map<string, Set<string>>();

  for (const flow of result.allFlows) {
    inDegree.set(flow.id, 0);
    dependsOnMap.set(flow.id, new Set());
    blockedByMap.set(flow.id, new Set());
  }

  for (const dep of depGraph.dependencies) {
    // sourceFlow depends on targetFlow
    if (dep.sourceFlowId !== dep.targetFlowId) {
      if (!dependsOnMap.has(dep.sourceFlowId)) dependsOnMap.set(dep.sourceFlowId, new Set());
      dependsOnMap.get(dep.sourceFlowId)!.add(dep.targetFlowId);

      if (!blockedByMap.has(dep.targetFlowId)) blockedByMap.set(dep.targetFlowId, new Set());
      blockedByMap.get(dep.targetFlowId)!.add(dep.sourceFlowId);

      inDegree.set(dep.sourceFlowId, (inDegree.get(dep.sourceFlowId) || 0) + 1);
    }
  }

  // Step 4: Detect cycles
  const cycles = detectCycles(depGraph);
  const cyclicFlowIds = new Set<string>();
  for (const dep of depGraph.dependencies) {
    // Mark flows in cycles by checking if they form back-edges
    const sourceHasDep = dependsOnMap.get(dep.sourceFlowId)?.has(dep.targetFlowId);
    const targetHasDep = dependsOnMap.get(dep.targetFlowId)?.has(dep.sourceFlowId);
    if (sourceHasDep && targetHasDep) {
      cyclicFlowIds.add(dep.sourceFlowId);
      cyclicFlowIds.add(dep.targetFlowId);
    }
  }
  // Also mark flows from cycle detection
  if (cycles.length > 0) {
    for (const dep of depGraph.dependencies) {
      if (dependsOnMap.get(dep.targetFlowId)?.has(dep.sourceFlowId)) {
        cyclicFlowIds.add(dep.sourceFlowId);
        cyclicFlowIds.add(dep.targetFlowId);
      }
    }
  }

  // Step 5: Kahn's algorithm for topological sort into waves
  const waveAssignment = new Map<string, number>();
  const queue: string[] = [];

  // Wave 1: flows with no dependencies (in-degree 0), excluding cyclic
  for (const [flowId, degree] of inDegree) {
    if (degree === 0 && !cyclicFlowIds.has(flowId)) {
      queue.push(flowId);
      waveAssignment.set(flowId, 1);
    }
  }

  // BFS level-order to assign waves
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentWave = waveAssignment.get(current) || 1;
    const blocked = blockedByMap.get(current) ?? new Set();

    for (const dependentId of blocked) {
      if (cyclicFlowIds.has(dependentId)) continue;
      if (waveAssignment.has(dependentId)) continue;

      // Check if all dependencies of this dependent are assigned
      const deps = dependsOnMap.get(dependentId) ?? new Set();
      let allDepsAssigned = true;
      let maxDepWave = 0;
      for (const depId of deps) {
        if (cyclicFlowIds.has(depId)) continue;
        const w = waveAssignment.get(depId);
        if (w === undefined) {
          allDepsAssigned = false;
          break;
        }
        maxDepWave = Math.max(maxDepWave, w);
      }

      if (allDepsAssigned) {
        const nextWave = maxDepWave + 1;
        waveAssignment.set(dependentId, nextWave);
        queue.push(dependentId);
      }
    }
  }

  // Assign remaining non-cyclic flows with no deps to wave 1
  for (const flow of result.allFlows) {
    if (!waveAssignment.has(flow.id) && !cyclicFlowIds.has(flow.id)) {
      waveAssignment.set(flow.id, 1);
    }
  }

  // Step 6: Build cutover items
  const allItems: CutoverItem[] = [];
  const circularItems: CutoverItem[] = [];

  for (const flow of result.allFlows) {
    const eccCount = eccCountByFlow.get(flow.id) || 0;
    const depCount = (dependsOnMap.get(flow.id) ?? new Set()).size;
    const deps = Array.from(dependsOnMap.get(flow.id) ?? []);
    const blocked = Array.from(blockedByMap.get(flow.id) ?? []);
    const isCyclic = cyclicFlowIds.has(flow.id);

    const risk = assignRisk(eccCount, depCount, isCyclic);

    const item: CutoverItem = {
      flowId: flow.id,
      flowName: flow.name,
      packageId: flow.packageId ?? '',
      packageName: packageNames.get(flow.packageId) ?? flow.packageId ?? '',
      wave: isCyclic ? -1 : (waveAssignment.get(flow.id) ?? 1),
      risk: risk.level,
      riskReason: risk.reason,
      eccEndpointCount: eccCount,
      dependencyCount: depCount,
      dependsOn: deps.map((id) => depGraph.flowsById[id]?.name ?? id),
      blockedBy: blocked.map((id) => depGraph.flowsById[id]?.name ?? id),
      runtimeStatus: runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED',
    };

    if (isCyclic) {
      circularItems.push(item);
    } else {
      allItems.push(item);
    }
  }

  // Step 7: Group into waves
  const waveMap = new Map<number, CutoverItem[]>();
  for (const item of allItems) {
    if (!waveMap.has(item.wave)) waveMap.set(item.wave, []);
    waveMap.get(item.wave)!.push(item);
  }

  const waves: CutoverWave[] = Array.from(waveMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([waveNum, items]) => {
      const riskSummary: Record<CutoverRisk, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      let eccFlows = 0;
      for (const item of items) {
        riskSummary[item.risk]++;
        if (item.eccEndpointCount > 0) eccFlows++;
      }
      return {
        waveNumber: waveNum,
        items,
        totalFlows: items.length,
        eccFlows,
        riskSummary,
      };
    });

  const totalEcc = result.allFlows.filter((f) => eccCountByFlow.has(f.id)).length;

  return {
    waves,
    circularDeps: circularItems,
    totalFlows: result.allFlows.length,
    eccFlows: totalEcc,
    nonEccFlows: result.allFlows.length - totalEcc,
    totalWaves: waves.length,
  };
}

// ---------------------------------------------------------------------------
// Risk assignment
// ---------------------------------------------------------------------------

function assignRisk(
  eccCount: number,
  depCount: number,
  isCyclic: boolean,
): { level: CutoverRisk; reason: string } {
  if (isCyclic || eccCount >= 3) {
    const reasons: string[] = [];
    if (isCyclic) reasons.push('circular dependency');
    if (eccCount >= 3) reasons.push(`${eccCount} ECC endpoints`);
    return { level: 'CRITICAL', reason: reasons.join(', ') };
  }
  if (eccCount >= 2 || depCount >= 3) {
    const reasons: string[] = [];
    if (eccCount >= 2) reasons.push(`${eccCount} ECC endpoints`);
    if (depCount >= 3) reasons.push(`${depCount} dependencies`);
    return { level: 'HIGH', reason: reasons.join(', ') };
  }
  if (eccCount === 1) {
    return { level: 'MEDIUM', reason: '1 ECC endpoint' };
  }
  return { level: 'LOW', reason: 'No ECC endpoints' };
}
