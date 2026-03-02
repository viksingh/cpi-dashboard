// ── Credential & Security Auditor types ──────────────────────

export type CredentialType =
  | 'USER_CREDENTIAL'
  | 'OAUTH2_CLIENT'
  | 'KEYSTORE'
  | 'SECURE_PARAMETER'
  | 'KNOWN_HOSTS';

export const CredentialTypeLabels: Record<CredentialType, string> = {
  USER_CREDENTIAL: 'User Credential',
  OAUTH2_CLIENT: 'OAuth2 Client',
  KEYSTORE: 'Keystore / Certificate',
  SECURE_PARAMETER: 'Secure Parameter',
  KNOWN_HOSTS: 'Known Hosts',
};

export interface CredentialInfo {
  credentialId: string;
  name: string;
  type: CredentialType;
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  source: string;
  adapterType: string;
  propertyKey: string;
  eccRelated: boolean;
  eccIndicator: string;
  runtimeStatus: string;
}

export interface SecurityAuditResult {
  credentials: CredentialInfo[];
  totalCredentials: number;
  eccRelatedCount: number;
  sharedCredentials: { name: string; type: CredentialType; flowCount: number; flowNames: string[] }[];
  typeCounts: Record<CredentialType, number>;
  flowsWithCredentials: number;
  flowsScanned: number;
}
