/**
 * DiffEngine — compares two CPI extraction snapshots and classifies
 * every package, flow, value-mapping, configuration, and runtime
 * artifact as ADDED / REMOVED / MODIFIED / UNCHANGED.
 *
 * Ported from com.sakiv.cpi.diff.service.DiffEngine (Java).
 */

import type {
  ExtractionResult,
  IntegrationPackage,
  IntegrationFlow,
  ValueMapping,
  RuntimeArtifact,
  Configuration,
} from '@/types/cpi';
import type {
  DiffResult,
  DiffEntry,
  DiffStatus,
  FieldChange,
} from '@/types/diff';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare two extraction snapshots and return a unified diff result
 * covering packages, flows, value mappings, configurations, and runtime
 * artifacts.
 */
export function compareSnapshots(
  snapshotA: ExtractionResult,
  snapshotB: ExtractionResult,
): DiffResult {
  const packageDiffs = diffList(
    snapshotA.packages,
    snapshotB.packages,
    (p) => p.id,
    (p) => p.name,
    comparePackageFields,
  );

  const flowDiffs = diffList(
    snapshotA.allFlows,
    snapshotB.allFlows,
    (f) => f.id,
    (f) => f.name,
    compareFlowFields,
  );

  const valueMappingDiffs = diffList(
    snapshotA.allValueMappings,
    snapshotB.allValueMappings,
    (v) => v.id,
    (v) => v.name,
    compareValueMappingFields,
  );

  // Flatten configurations from flows for comparison
  const configsA = flattenConfigurations(snapshotA.allFlows);
  const configsB = flattenConfigurations(snapshotB.allFlows);
  const configurationDiffs = diffList(
    configsA,
    configsB,
    getConfigCompositeKey,
    getConfigDisplayName,
    compareConfigurationFields,
  );

  const runtimeDiffs = diffList(
    snapshotA.runtimeArtifacts,
    snapshotB.runtimeArtifacts,
    (r) => r.id,
    (r) => r.name,
    compareRuntimeFields,
  );

  return {
    snapshotALabel: snapshotA.tenantUrl,
    snapshotBLabel: snapshotB.tenantUrl,
    snapshotADate: snapshotA.extractedAt,
    snapshotBDate: snapshotB.extractedAt,
    packageDiffs,
    flowDiffs,
    valueMappingDiffs,
    configurationDiffs,
    runtimeDiffs,
  };
}

// ---------------------------------------------------------------------------
// Generic diffList helper
// ---------------------------------------------------------------------------

type FieldComparator<T> = (a: T, b: T) => FieldChange[];

/**
 * Generic list-diffing helper.  Indexes both lists by a unique key,
 * then classifies every key as ADDED / REMOVED / MODIFIED / UNCHANGED.
 */
function diffList<T>(
  listA: T[],
  listB: T[],
  idExtractor: (item: T) => string,
  nameExtractor: (item: T) => string,
  comparator: FieldComparator<T>,
): DiffEntry<Record<string, unknown>>[] {
  const mapA = new Map<string, T>();
  for (const item of listA) {
    const key = idExtractor(item);
    if (!mapA.has(key)) mapA.set(key, item);
  }

  const mapB = new Map<string, T>();
  for (const item of listB) {
    const key = idExtractor(item);
    if (!mapB.has(key)) mapB.set(key, item);
  }

  // Preserve insertion order: A keys first, then new keys from B
  const allKeys = new Set<string>();
  for (const k of mapA.keys()) allKeys.add(k);
  for (const k of mapB.keys()) allKeys.add(k);

  const entries: DiffEntry<Record<string, unknown>>[] = [];

  for (const key of allKeys) {
    const itemA = mapA.get(key) ?? null;
    const itemB = mapB.get(key) ?? null;

    if (itemA === null && itemB !== null) {
      entries.push({
        id: key,
        name: nameExtractor(itemB),
        status: 'ADDED' as DiffStatus,
        itemA: null,
        itemB: itemB as unknown as Record<string, unknown>,
        changes: [],
      });
    } else if (itemA !== null && itemB === null) {
      entries.push({
        id: key,
        name: nameExtractor(itemA),
        status: 'REMOVED' as DiffStatus,
        itemA: itemA as unknown as Record<string, unknown>,
        itemB: null,
        changes: [],
      });
    } else if (itemA !== null && itemB !== null) {
      const changes = comparator(itemA, itemB);
      const status: DiffStatus = changes.length === 0 ? 'UNCHANGED' : 'MODIFIED';
      entries.push({
        id: key,
        name: nameExtractor(itemB),
        status,
        itemA: itemA as unknown as Record<string, unknown>,
        itemB: itemB as unknown as Record<string, unknown>,
        changes,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Field comparators
// ---------------------------------------------------------------------------

function comparePackageFields(a: IntegrationPackage, b: IntegrationPackage): FieldChange[] {
  const changes: FieldChange[] = [];
  compareField(changes, 'Name', a.name, b.name);
  compareField(changes, 'Description', a.description, b.description);
  compareField(changes, 'Version', a.version, b.version);
  compareField(changes, 'Vendor', a.vendor, b.vendor);
  compareField(changes, 'Mode', a.mode, b.mode);
  compareField(changes, 'SupportedPlatform', a.supportedPlatform, b.supportedPlatform);
  compareField(changes, 'ModifiedBy', a.modifiedBy, b.modifiedBy);
  compareField(changes, 'CreationDate', a.creationDate, b.creationDate);
  compareField(changes, 'ModifiedDate', a.modifiedDate, b.modifiedDate);
  compareField(changes, 'CreatedBy', a.createdBy, b.createdBy);
  compareField(changes, 'Products', a.products, b.products);
  compareField(changes, 'Keywords', a.keywords, b.keywords);
  return changes;
}

function compareFlowFields(a: IntegrationFlow, b: IntegrationFlow): FieldChange[] {
  const changes: FieldChange[] = [];
  compareField(changes, 'Name', a.name, b.name);
  compareField(changes, 'Description', a.description, b.description);
  compareField(changes, 'Version', a.version, b.version);
  compareField(changes, 'PackageId', a.packageId, b.packageId);
  compareField(changes, 'Sender', a.sender, b.sender);
  compareField(changes, 'Receiver', a.receiver, b.receiver);
  compareField(changes, 'CreatedBy', a.createdBy, b.createdBy);
  compareField(changes, 'CreatedAt', a.createdAt, b.createdAt);
  compareField(changes, 'ModifiedBy', a.modifiedBy, b.modifiedBy);
  compareField(changes, 'ModifiedAt', a.modifiedAt, b.modifiedAt);
  compareField(changes, 'RuntimeStatus', a.runtimeStatus, b.runtimeStatus);
  compareField(changes, 'DeployedVersion', a.deployedVersion, b.deployedVersion);
  compareField(changes, 'DeployedBy', a.deployedBy, b.deployedBy);
  compareField(changes, 'DeployedAt', a.deployedAt, b.deployedAt);
  return changes;
}

function compareValueMappingFields(a: ValueMapping, b: ValueMapping): FieldChange[] {
  const changes: FieldChange[] = [];
  compareField(changes, 'Name', a.name, b.name);
  compareField(changes, 'Description', a.description, b.description);
  compareField(changes, 'Version', a.version, b.version);
  compareField(changes, 'PackageId', a.packageId, b.packageId);
  compareField(changes, 'CreatedBy', a.createdBy, b.createdBy);
  compareField(changes, 'CreatedAt', a.createdAt, b.createdAt);
  compareField(changes, 'ModifiedBy', a.modifiedBy, b.modifiedBy);
  compareField(changes, 'ModifiedAt', a.modifiedAt, b.modifiedAt);
  compareField(changes, 'RuntimeStatus', a.runtimeStatus, b.runtimeStatus);
  return changes;
}

function compareConfigurationFields(a: Configuration, b: Configuration): FieldChange[] {
  const changes: FieldChange[] = [];
  compareField(changes, 'ParameterValue', a.parameterValue, b.parameterValue);
  compareField(changes, 'DataType', a.dataType, b.dataType);
  return changes;
}

function compareRuntimeFields(a: RuntimeArtifact, b: RuntimeArtifact): FieldChange[] {
  const changes: FieldChange[] = [];
  compareField(changes, 'Name', a.name, b.name);
  compareField(changes, 'Version', a.version, b.version);
  compareField(changes, 'Type', a.type, b.type);
  compareField(changes, 'Status', a.status, b.status);
  compareField(changes, 'DeployedBy', a.deployedBy, b.deployedBy);
  compareField(changes, 'DeployedOn', a.deployedOn, b.deployedOn);
  compareField(changes, 'ErrorInformation', a.errorInformation, b.errorInformation);
  return changes;
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

/**
 * Flatten configurations from all flows into a single list, ensuring each
 * configuration carries its parent flow's artifactId.
 */
function flattenConfigurations(flows: IntegrationFlow[]): Configuration[] {
  const configs: Configuration[] = [];
  for (const flow of flows) {
    if (!flow.configurations) continue;
    for (const cfg of flow.configurations) {
      configs.push({
        ...cfg,
        artifactId: cfg.artifactId || flow.id,
      });
    }
  }
  return configs;
}

/** Composite key for configurations: artifactId|parameterKey */
function getConfigCompositeKey(config: Configuration): string {
  return `${nullSafe(config.artifactId)}|${nullSafe(config.parameterKey)}`;
}

function getConfigDisplayName(config: Configuration): string {
  return `${nullSafe(config.artifactId)} / ${nullSafe(config.parameterKey)}`;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function compareField(
  changes: FieldChange[],
  fieldName: string,
  oldVal: string | undefined | null,
  newVal: string | undefined | null,
): void {
  const a = nullSafe(oldVal);
  const b = nullSafe(newVal);
  if (a !== b) {
    changes.push({ fieldName, oldValue: oldVal ?? null, newValue: newVal ?? null });
  }
}

function nullSafe(value: string | undefined | null): string {
  return value ?? '';
}
