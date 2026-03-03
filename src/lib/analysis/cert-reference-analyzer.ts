/**
 * CertReferenceAnalyzer — scans iFlow adapters for certificate and
 * keystore references. Snapshot-based analysis (no live API needed).
 * For live certificate expiry data, use the /api/tools/cert-expiry route.
 */

import type { ExtractionResult, RuntimeArtifact } from '@/types/cpi';
import type { CertReference, CertReferenceResult } from '@/types/cert-expiry';

const CERT_PROPERTY_KEYS = [
  'private.key.alias', 'PrivateKeyAlias', 'privateKeyAlias',
  'certificate.name', 'CertificateName',
  'keystore.entry', 'KeystoreEntry',
  'ssl.keystore.alias', 'SslKeystoreAlias',
  'ssl.truststore.alias', 'SslTruststoreAlias',
  'client.certificate.alias', 'ClientCertificateAlias',
  'server.certificate.alias', 'ServerCertificateAlias',
  'signer.certificate', 'SignerCertificate',
  'verification.certificate', 'VerificationCertificate',
  'encryption.certificate', 'EncryptionCertificate',
  'decryption.key.alias', 'DecryptionKeyAlias',
  'signing.key.alias', 'SigningKeyAlias',
];

export function analyzeFromSnapshot(result: ExtractionResult): CertReferenceResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) runtimeMap.set(rt.id, rt);

  const references: CertReference[] = [];
  const flowIds = new Set<string>();
  let flowsScanned = 0;

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsScanned++;
    const pkgName = packageNames.get(flow.packageId) ?? flow.packageId ?? '';
    const rtStatus = runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED';

    for (const adapter of (content.adapters || [])) {
      if (!adapter.properties) continue;
      for (const key of CERT_PROPERTY_KEYS) {
        const val = adapter.properties[key];
        if (val && val.trim().length > 0) {
          references.push({
            referenceId: randomId(),
            alias: val.trim(),
            flowId: flow.id,
            flowName: flow.name,
            packageName: pkgName,
            adapterType: adapter.adapterType ?? '',
            propertyKey: key,
            runtimeStatus: rtStatus,
          });
          flowIds.add(flow.id);
        }
      }
    }
  }

  const aliasCounts: Record<string, number> = {};
  for (const r of references) {
    aliasCounts[r.alias] = (aliasCounts[r.alias] || 0) + 1;
  }

  return {
    references,
    totalReferences: references.length,
    uniqueAliases: Object.keys(aliasCounts).length,
    flowsWithCerts: flowIds.size,
    flowsScanned,
    aliasCounts,
  };
}

function randomId(): string {
  const c = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}
