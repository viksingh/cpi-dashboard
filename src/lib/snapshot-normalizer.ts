/**
 * Normalizes snapshot JSON from Java tools (PascalCase OData fields)
 * to the camelCase format expected by the web dashboard.
 *
 * The Java snapshot creator stores OData API fields in PascalCase
 * (Id, Name, Version, PackageId, CreatedAt, ModifiedAt, etc.)
 * while the dashboard TypeScript types expect camelCase
 * (id, name, version, packageId, createdAt, modifiedAt, etc.).
 */

import type {
  ExtractionResult,
  IntegrationPackage,
  IntegrationFlow,
  ValueMapping,
  RuntimeArtifact,
  Configuration,
} from '@/types/cpi';

// PascalCase → camelCase field mappings for each entity type
const PACKAGE_FIELDS: Record<string, string> = {
  Id: 'id', Name: 'name', Description: 'description', ShortText: 'shortText',
  Version: 'version', Vendor: 'vendor', Mode: 'mode',
  SupportedPlatform: 'supportedPlatform', ModifiedBy: 'modifiedBy',
  CreationDate: 'creationDate', ModifiedDate: 'modifiedDate', CreatedBy: 'createdBy',
  Products: 'products', Keywords: 'keywords', Countries: 'countries',
  Industries: 'industries', LineOfBusiness: 'lineOfBusiness', ResourceId: 'resourceId',
};

const FLOW_FIELDS: Record<string, string> = {
  Id: 'id', Name: 'name', Description: 'description', Version: 'version',
  PackageId: 'packageId', Sender: 'sender', Receiver: 'receiver',
  CreatedBy: 'createdBy', CreatedAt: 'createdAt',
  ModifiedBy: 'modifiedBy', ModifiedAt: 'modifiedAt',
  ArtifactContent: 'artifactContent',
};

const VM_FIELDS: Record<string, string> = {
  Id: 'id', Name: 'name', Description: 'description', Version: 'version',
  PackageId: 'packageId',
  CreatedBy: 'createdBy', CreatedAt: 'createdAt',
  ModifiedBy: 'modifiedBy', ModifiedAt: 'modifiedAt',
};

const RUNTIME_FIELDS: Record<string, string> = {
  Id: 'id', Name: 'name', Version: 'version', Type: 'type',
  DeployedBy: 'deployedBy', DeployedOn: 'deployedOn',
  Status: 'status', ErrorInformation: 'errorInformation',
};

const CONFIG_FIELDS: Record<string, string> = {
  ParameterKey: 'parameterKey', ParameterValue: 'parameterValue',
  DataType: 'dataType',
};

/**
 * Map PascalCase fields to camelCase on an object.
 * Existing camelCase fields are preserved (not overwritten).
 */
function mapFields<T>(obj: Record<string, unknown>, fieldMap: Record<string, string>): T {
  const result: Record<string, unknown> = { ...obj };
  for (const [pascal, camel] of Object.entries(fieldMap)) {
    if (pascal in obj && !(camel in obj)) {
      result[camel] = obj[pascal];
    }
  }
  return result as T;
}

function normalizeConfig(cfg: Record<string, unknown>): Configuration {
  return mapFields<Configuration>(cfg, CONFIG_FIELDS);
}

function normalizeFlow(flow: Record<string, unknown>): IntegrationFlow {
  const mapped = mapFields<IntegrationFlow>(flow, FLOW_FIELDS);

  // Normalize configurations within the flow
  if (Array.isArray(mapped.configurations)) {
    mapped.configurations = mapped.configurations.map((c) =>
      normalizeConfig(c as unknown as Record<string, unknown>),
    );
  } else {
    mapped.configurations = [];
  }

  // Ensure bundleParsed reflects iflowContent presence
  if (mapped.bundleParsed === undefined || mapped.bundleParsed === null) {
    mapped.bundleParsed = !!mapped.iflowContent;
  }

  return mapped;
}

function normalizePackage(pkg: Record<string, unknown>): IntegrationPackage {
  const mapped = mapFields<IntegrationPackage>(pkg, PACKAGE_FIELDS);

  // Normalize nested integrationFlows
  if (Array.isArray(mapped.integrationFlows)) {
    mapped.integrationFlows = mapped.integrationFlows.map((f) =>
      normalizeFlow(f as unknown as Record<string, unknown>),
    );
  } else {
    mapped.integrationFlows = [];
  }

  // Normalize nested valueMappings
  if (Array.isArray(mapped.valueMappings)) {
    mapped.valueMappings = mapped.valueMappings.map((v) =>
      mapFields<ValueMapping>(v as unknown as Record<string, unknown>, VM_FIELDS),
    );
  } else {
    mapped.valueMappings = [];
  }

  return mapped;
}

function normalizeVM(vm: Record<string, unknown>): ValueMapping {
  return mapFields<ValueMapping>(vm, VM_FIELDS);
}

function normalizeRuntime(rt: Record<string, unknown>): RuntimeArtifact {
  return mapFields<RuntimeArtifact>(rt, RUNTIME_FIELDS);
}

/**
 * Normalize a snapshot, mapping PascalCase OData fields to camelCase.
 * Safe to call on already-normalized data (camelCase fields are preserved).
 */
export function normalizeSnapshot(raw: Record<string, unknown>): ExtractionResult {
  const data = raw as unknown as ExtractionResult;

  // Ensure arrays exist
  const packages = Array.isArray(data.packages) ? data.packages : [];
  const allFlows = Array.isArray(data.allFlows) ? data.allFlows : [];
  const allValueMappings = Array.isArray(data.allValueMappings) ? data.allValueMappings : [];
  const runtimeArtifacts = Array.isArray(data.runtimeArtifacts) ? data.runtimeArtifacts : [];

  const normalizedPackages = packages.map((p) =>
    normalizePackage(p as unknown as Record<string, unknown>),
  );
  const normalizedFlows = allFlows.map((f) =>
    normalizeFlow(f as unknown as Record<string, unknown>),
  );
  const normalizedVMs = allValueMappings.map((v) =>
    normalizeVM(v as unknown as Record<string, unknown>),
  );
  const normalizedRuntime = runtimeArtifacts.map((r) =>
    normalizeRuntime(r as unknown as Record<string, unknown>),
  );

  return {
    extractedAt: data.extractedAt || new Date().toISOString(),
    tenantUrl: data.tenantUrl || '',
    packages: normalizedPackages,
    allFlows: normalizedFlows,
    allValueMappings: normalizedVMs,
    runtimeArtifacts: normalizedRuntime,
    totalPackages: data.totalPackages ?? normalizedPackages.length,
    totalFlows: data.totalFlows ?? normalizedFlows.length,
    totalValueMappings: data.totalValueMappings ?? normalizedVMs.length,
    deployedArtifacts: data.deployedArtifacts ?? normalizedRuntime.filter((r) => r.status === 'STARTED').length,
    errorArtifacts: data.errorArtifacts ?? normalizedRuntime.filter((r) => r.status === 'ERROR').length,
  };
}
