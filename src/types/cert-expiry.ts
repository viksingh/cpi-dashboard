// ── Certificate Expiry Monitor types ─────────────────────────

export type CertStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNKNOWN';

export const CertStatusLabels: Record<CertStatus, string> = {
  VALID: 'Valid',
  EXPIRING_SOON: 'Expiring Soon',
  EXPIRED: 'Expired',
  UNKNOWN: 'Unknown',
};

export interface CertificateEntry {
  alias: string;
  type: string;
  validNotBefore: string;
  validNotAfter: string;
  issuer: string;
  subject: string;
  serialNumber: string;
  daysUntilExpiry: number;
  status: CertStatus;
  usedByFlows: string[];
}

export interface CertExpiryResult {
  certificates: CertificateEntry[];
  totalCertificates: number;
  expiredCount: number;
  expiringSoonCount: number;
  validCount: number;
  expiryWindowDays: number;
}

/** Snapshot-based: references to certificates found in iFlow adapters */
export interface CertReference {
  referenceId: string;
  alias: string;
  flowId: string;
  flowName: string;
  packageName: string;
  adapterType: string;
  propertyKey: string;
  runtimeStatus: string;
}

export interface CertReferenceResult {
  references: CertReference[];
  totalReferences: number;
  uniqueAliases: number;
  flowsWithCerts: number;
  flowsScanned: number;
  aliasCounts: Record<string, number>;
}
