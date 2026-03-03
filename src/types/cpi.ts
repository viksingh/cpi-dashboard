// ── Filter Mode ──────────────────────────────────────────────
export enum FilterMode {
  EXISTED_AT = 'EXISTED_AT',
  MODIFIED_SINCE = 'MODIFIED_SINCE',
  CREATED_SINCE = 'CREATED_SINCE',
  CREATED_OR_MODIFIED_SINCE = 'CREATED_OR_MODIFIED_SINCE',
  DEPLOYED_SINCE = 'DEPLOYED_SINCE',
}

export const FilterModeLabels: Record<FilterMode, string> = {
  [FilterMode.EXISTED_AT]: 'Existed at (created before)',
  [FilterMode.MODIFIED_SINCE]: 'Modified since',
  [FilterMode.CREATED_SINCE]: 'Created since',
  [FilterMode.CREATED_OR_MODIFIED_SINCE]: 'Created or modified since',
  [FilterMode.DEPLOYED_SINCE]: 'Deployed since',
};

// ── Configuration (externalized params per iFlow) ────────────
export interface Configuration {
  parameterKey: string;
  parameterValue: string;
  dataType: string;
  artifactId?: string;
}

// ── iFlow Bundle sub-models ──────────────────────────────────
export interface IFlowAdapter {
  id: string;
  name: string;
  adapterType: string;
  direction: string;
  transportProtocol: string;
  messageProtocol: string;
  address: string;
  properties: Record<string, string>;
}

export interface IFlowEndpoint {
  id: string;
  name: string;
  type: string;
  componentType: string;
  address: string;
  role: string;
}

export interface IFlowMapping {
  id: string;
  name: string;
  mappingType: string;
  resourceId: string;
  properties: Record<string, string>;
}

export interface IFlowRoute {
  id: string;
  name: string;
  type: string;
  activityType: string;
  componentType: string;
  sourceRef: string;
  targetRef: string;
  condition?: string;
  properties: Record<string, string>;
}

export interface ScriptInfo {
  fileName: string;
  language: string;
  content: string;
  contentSnippet: string;
}

export interface IFlowContent {
  flowId: string;
  version: string;
  rawXml?: string;
  routes: IFlowRoute[];
  adapters: IFlowAdapter[];
  mappings: IFlowMapping[];
  endpoints: IFlowEndpoint[];
  processProperties: Record<string, string>;
  scripts: ScriptInfo[];
  mappingFiles: string[];
}

// ── Core domain models ───────────────────────────────────────
export interface IntegrationFlow {
  id: string;
  version: string;
  packageId: string;
  name: string;
  description: string;
  sender: string;
  receiver: string;
  createdBy: string;
  createdAt: string;
  modifiedBy: string;
  modifiedAt: string;
  artifactContent?: string;
  runtimeStatus?: string;
  deployedVersion?: string;
  deployedBy?: string;
  deployedAt?: string;
  runtimeError?: string;
  configurations: Configuration[];
  iflowContent?: IFlowContent;
  bundleParsed: boolean;
  bundleParseError?: string;
}

export interface ValueMapping {
  id: string;
  version: string;
  packageId: string;
  name: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  modifiedBy?: string;
  modifiedAt?: string;
  runtimeStatus?: string;
}

export interface RuntimeArtifact {
  id: string;
  version: string;
  name: string;
  type: string;
  deployedBy: string;
  deployedOn: string;
  status: string;
  errorInformation?: string;
}

export interface IntegrationPackage {
  id: string;
  name: string;
  description: string;
  shortText?: string;
  version: string;
  vendor?: string;
  mode?: string;
  supportedPlatform?: string;
  modifiedBy?: string;
  creationDate?: string;
  modifiedDate?: string;
  createdBy?: string;
  products?: string;
  keywords?: string;
  countries?: string;
  industries?: string;
  lineOfBusiness?: string;
  resourceId?: string;
  integrationFlows: IntegrationFlow[];
  valueMappings: ValueMapping[];
}

export interface ExtractionResult {
  extractedAt: string;
  tenantUrl: string;
  packages: IntegrationPackage[];
  allFlows: IntegrationFlow[];
  allValueMappings: ValueMapping[];
  runtimeArtifacts: RuntimeArtifact[];
  totalPackages?: number;
  totalFlows?: number;
  totalValueMappings?: number;
  deployedArtifacts?: number;
  errorArtifacts?: number;
}

// ── UI configuration types ───────────────────────────────────
export interface ConnectionConfig {
  tenantUrl: string;
  authType: 'oauth2' | 'basic';
  oauthTokenUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  basicUsername: string;
  basicPassword: string;
}

export interface ExtractionOptions {
  extractPackages: boolean;
  extractFlows: boolean;
  extractValueMappings: boolean;
  extractConfigurations: boolean;
  extractRuntime: boolean;
  extractIflowBundles: boolean;
  dateFilterEnabled: boolean;
  sinceDate: string | null;
  dateFilterMode: FilterMode;
}

export interface ExportConfig {
  format: 'xlsx' | 'csv' | 'json';
  filenamePrefix: string;
}

// ── Flattened row types for table display ────────────────────
export interface ConfigRow {
  artifactId: string;
  artifactName: string;
  parameterKey: string;
  parameterValue: string;
  dataType: string;
}

export interface AdapterRow {
  flowId: string;
  flowName: string;
  adapterId: string;
  adapterName: string;
  adapterType: string;
  direction: string;
  transportProtocol: string;
  messageProtocol: string;
  address: string;
}
