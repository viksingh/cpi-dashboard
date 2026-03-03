/**
 * Client-side date filter for ExtractionResult.
 *
 * Filters packages, flows, value mappings, and runtime artifacts
 * based on creation/modification/deployment dates.
 */

import { FilterMode } from '@/types/cpi';
import type { ExtractionResult } from '@/types/cpi';

/**
 * Parse a date string from SAP CPI OData or ISO 8601 format.
 * Handles: /Date(1705312200000)/, ISO 8601, plain date strings.
 */
export function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || dateStr.trim().length === 0) return null;

  // SAP OData v2 format: /Date(1705312200000)/
  const sapMatch = dateStr.match(/\/Date\((-?\d+)\)\//);
  if (sapMatch) return new Date(parseInt(sapMatch[1], 10));

  // Standard parsing (ISO 8601, etc.)
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

function matchesFilter(
  createdDate: string | undefined | null,
  modifiedDate: string | undefined | null,
  deployedDate: string | undefined | null,
  filterDate: Date,
  mode: FilterMode,
): boolean {
  switch (mode) {
    case FilterMode.EXISTED_AT: {
      // Show objects that existed at (were created on or before) the given date
      const created = parseDate(createdDate);
      // If no creation date, include by default (unknown creation)
      return created ? created <= filterDate : true;
    }
    case FilterMode.MODIFIED_SINCE: {
      const modified = parseDate(modifiedDate);
      return modified ? modified >= filterDate : false;
    }
    case FilterMode.CREATED_SINCE: {
      const created = parseDate(createdDate);
      return created ? created >= filterDate : false;
    }
    case FilterMode.CREATED_OR_MODIFIED_SINCE: {
      const created = parseDate(createdDate);
      const modified = parseDate(modifiedDate);
      return (
        (created !== null && created >= filterDate) ||
        (modified !== null && modified >= filterDate)
      );
    }
    case FilterMode.DEPLOYED_SINCE: {
      const deployed = parseDate(deployedDate);
      return deployed ? deployed >= filterDate : false;
    }
    default:
      return true;
  }
}

/**
 * Apply a date filter to an ExtractionResult, returning a new filtered result.
 * The original result is not mutated.
 */
export function applyDateFilter(
  result: ExtractionResult,
  sinceDate: string,
  mode: FilterMode,
): ExtractionResult {
  const filterDate = new Date(sinceDate);
  if (isNaN(filterDate.getTime())) return result;

  // For "existed at" mode, set to end of day so the entire day is included
  if (mode === FilterMode.EXISTED_AT) {
    filterDate.setHours(23, 59, 59, 999);
  } else {
    // For "since" modes, set to start of day
    filterDate.setHours(0, 0, 0, 0);
  }

  // Filter flows
  const filteredFlows = result.allFlows.filter((f) =>
    matchesFilter(f.createdAt, f.modifiedAt, f.deployedAt, filterDate, mode),
  );

  // Filter packages: keep if package has matching flows OR package itself matches
  const flowPackageIds = new Set(filteredFlows.map((f) => f.packageId));
  const filteredPackages = result.packages.filter(
    (p) =>
      flowPackageIds.has(p.id) ||
      matchesFilter(p.creationDate, p.modifiedDate, undefined, filterDate, mode),
  );

  // Filter value mappings
  const filteredVMs = result.allValueMappings.filter((vm) =>
    matchesFilter(vm.createdAt, vm.modifiedAt, undefined, filterDate, mode),
  );

  // Filter runtime artifacts: keep those matching filtered flows
  const filteredFlowIds = new Set(filteredFlows.map((f) => f.id));
  const filteredRuntime = result.runtimeArtifacts.filter((r) =>
    filteredFlowIds.has(r.id) ||
    (mode === FilterMode.DEPLOYED_SINCE &&
      matchesFilter(undefined, undefined, r.deployedOn, filterDate, mode)),
  );

  return {
    ...result,
    packages: filteredPackages,
    allFlows: filteredFlows,
    allValueMappings: filteredVMs,
    runtimeArtifacts: filteredRuntime,
    totalPackages: filteredPackages.length,
    totalFlows: filteredFlows.length,
    totalValueMappings: filteredVMs.length,
    deployedArtifacts: filteredRuntime.filter((r) => r.status === 'STARTED').length,
    errorArtifacts: filteredRuntime.filter((r) => r.status === 'ERROR').length,
  };
}
