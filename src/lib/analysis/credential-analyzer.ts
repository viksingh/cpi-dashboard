/**
 * CredentialAnalyzer — inventories all security artifacts referenced
 * by iFlows: user credentials, OAuth2 clients, keystores, secure
 * parameters, and known hosts.
 *
 * Scans adapter properties for credential keys and regex-scans scripts
 * for getUserCredential / API credential patterns.
 */

import type {
  ExtractionResult,
  IFlowAdapter,
  IFlowContent,
  RuntimeArtifact,
} from '@/types/cpi';
import type {
  CredentialInfo,
  CredentialType,
  SecurityAuditResult,
} from '@/types/credential';

// ---------------------------------------------------------------------------
// Credential property key mappings
// ---------------------------------------------------------------------------

const CREDENTIAL_KEY_MAP: { keys: string[]; type: CredentialType }[] = [
  {
    keys: [
      'credential.name', 'credentialName', 'CredentialName',
      'user.credential.name', 'UserCredentialName',
      'basic.credential.name', 'BasicCredentialName',
    ],
    type: 'USER_CREDENTIAL',
  },
  {
    keys: [
      'oauth.credential.name', 'OAuthCredentialName',
      'oauth2.credential.name', 'OAuth2CredentialName',
      'oauthCredentialName',
    ],
    type: 'OAUTH2_CLIENT',
  },
  {
    keys: [
      'private.key.alias', 'PrivateKeyAlias', 'privateKeyAlias',
      'certificate.name', 'CertificateName',
      'keystore.entry', 'KeystoreEntry',
      'ssl.keystore.alias', 'SslKeystoreAlias',
    ],
    type: 'KEYSTORE',
  },
  {
    keys: [
      'secure.param', 'SecureParam', 'secureParameter',
      'secure.parameter.name', 'SecureParameterName',
    ],
    type: 'SECURE_PARAMETER',
  },
  {
    keys: [
      'known.hosts', 'KnownHosts', 'knownHostsFile',
      'known.hosts.file', 'KnownHostsFile',
    ],
    type: 'KNOWN_HOSTS',
  },
];

/** Script patterns for extracting credential references */
const SCRIPT_PATTERNS: { regex: RegExp; type: CredentialType }[] = [
  { regex: /getUserCredential\s*\(\s*["']([^"']+)["']\s*\)/g, type: 'USER_CREDENTIAL' },
  { regex: /getSecureParameter\s*\(\s*["']([^"']+)["']\s*\)/g, type: 'SECURE_PARAMETER' },
  { regex: /getCredential\s*\(\s*["']([^"']+)["']\s*\)/g, type: 'USER_CREDENTIAL' },
  { regex: /lookupCredential\s*\(\s*["']([^"']+)["']\s*\)/g, type: 'USER_CREDENTIAL' },
];

/** ECC-related URL patterns (same as endpoint-analyzer) */
const ECC_URL_PATTERNS = [
  '/sap/bc/', '/sap/xi/', '/sap/opu/odata/', '/sap/bc/srt/',
  ':8000/', ':8001/', ':44300/', ':44301/', 'sapgw', 'sapecc', 'saperp',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeFromSnapshot(
  result: ExtractionResult,
): SecurityAuditResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) {
    runtimeMap.set(rt.id, rt);
  }

  const credentials: CredentialInfo[] = [];
  const flowIds = new Set<string>();
  let flowsScanned = 0;

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsScanned++;

    const pkgName = packageNames.get(flow.packageId) ?? flow.packageId ?? '';
    const rtStatus = runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED';

    // Step 1: Scan adapter properties
    for (const adapter of content.adapters) {
      scanAdapterProperties(adapter, flow.id, flow.name, flow.packageId ?? '', pkgName, rtStatus, credentials);
    }

    // Step 2: Scan scripts
    scanScripts(content, flow.id, flow.name, flow.packageId ?? '', pkgName, rtStatus, credentials);

    if (credentials.some((c) => c.flowId === flow.id)) {
      flowIds.add(flow.id);
    }
  }

  // Flag ECC-related credentials
  flagEccCredentials(credentials, result);

  // Build shared credential analysis
  const credByName = new Map<string, { type: CredentialType; flowNames: Set<string> }>();
  for (const c of credentials) {
    const key = `${c.name}::${c.type}`;
    if (!credByName.has(key)) {
      credByName.set(key, { type: c.type, flowNames: new Set() });
    }
    credByName.get(key)!.flowNames.add(c.flowName);
  }

  const sharedCredentials = Array.from(credByName.entries())
    .filter(([, v]) => v.flowNames.size > 1)
    .map(([key, v]) => ({
      name: key.split('::')[0],
      type: v.type,
      flowCount: v.flowNames.size,
      flowNames: Array.from(v.flowNames),
    }))
    .sort((a, b) => b.flowCount - a.flowCount);

  const typeCounts: Record<CredentialType, number> = {
    USER_CREDENTIAL: 0, OAUTH2_CLIENT: 0, KEYSTORE: 0,
    SECURE_PARAMETER: 0, KNOWN_HOSTS: 0,
  };
  for (const c of credentials) {
    typeCounts[c.type]++;
  }

  return {
    credentials,
    totalCredentials: credentials.length,
    eccRelatedCount: credentials.filter((c) => c.eccRelated).length,
    sharedCredentials,
    typeCounts,
    flowsWithCredentials: flowIds.size,
    flowsScanned,
  };
}

// ---------------------------------------------------------------------------
// Adapter property scanning
// ---------------------------------------------------------------------------

function scanAdapterProperties(
  adapter: IFlowAdapter,
  flowId: string,
  flowName: string,
  packageId: string,
  packageName: string,
  runtimeStatus: string,
  credentials: CredentialInfo[],
): void {
  const props = adapter.properties;
  if (!props) return;

  for (const mapping of CREDENTIAL_KEY_MAP) {
    for (const key of mapping.keys) {
      const val = props[key];
      if (val && val.trim().length > 0) {
        credentials.push({
          credentialId: randomId(),
          name: val.trim(),
          type: mapping.type,
          flowId,
          flowName,
          packageId,
          packageName,
          source: 'Adapter Property',
          adapterType: adapter.adapterType ?? '',
          propertyKey: key,
          eccRelated: false,
          eccIndicator: '',
          runtimeStatus,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Script scanning
// ---------------------------------------------------------------------------

function scanScripts(
  content: IFlowContent,
  flowId: string,
  flowName: string,
  packageId: string,
  packageName: string,
  runtimeStatus: string,
  credentials: CredentialInfo[],
): void {
  for (const script of content.scripts) {
    if (!script.content) continue;

    for (const sp of SCRIPT_PATTERNS) {
      const regex = new RegExp(sp.regex.source, sp.regex.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(script.content)) !== null) {
        credentials.push({
          credentialId: randomId(),
          name: match[1],
          type: sp.type,
          flowId,
          flowName,
          packageId,
          packageName,
          source: `Script: ${script.fileName}`,
          adapterType: 'Script',
          propertyKey: match[0].split('(')[0],
          eccRelated: false,
          eccIndicator: '',
          runtimeStatus,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ECC flagging
// ---------------------------------------------------------------------------

function flagEccCredentials(
  credentials: CredentialInfo[],
  result: ExtractionResult,
): void {
  // Build a set of flow IDs that connect to ECC systems
  const eccFlowIds = new Set<string>();
  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    for (const adapter of content.adapters) {
      const type = (adapter.adapterType ?? '').toLowerCase();
      if (type === 'rfc' || type.startsWith('rfc_') || type === 'idoc' || type.startsWith('idoc_')) {
        eccFlowIds.add(flow.id);
        break;
      }
      const address = (adapter.address ?? '').toLowerCase();
      if (ECC_URL_PATTERNS.some((p) => address.includes(p.toLowerCase()))) {
        eccFlowIds.add(flow.id);
        break;
      }
    }
  }

  for (const c of credentials) {
    if (eccFlowIds.has(c.flowId)) {
      c.eccRelated = true;
      c.eccIndicator = 'Used in ECC-connected iFlow';
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function randomId(): string {
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
