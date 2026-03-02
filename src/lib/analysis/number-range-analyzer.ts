/**
 * NumberRangeAnalyzer — scans iFlow scripts, mappings, configurations,
 * and adapter properties for ECC number range references. Flags all
 * locations needing S/4 number range alignment.
 */

import type { ExtractionResult, RuntimeArtifact } from '@/types/cpi';
import type { NumberRangeReference, NumberRangeScanResult, NumberRangeSource } from '@/types/number-range';

/** Regex patterns for number range object references */
const NR_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\bNROBJ\s*[=:]\s*["']?([A-Z0-9_]+)["']?/gi, label: 'NROBJ' },
  { regex: /\bSNRO\b/gi, label: 'SNRO transaction' },
  { regex: /\bNUMBER_GET_NEXT\b/gi, label: 'NUMBER_GET_NEXT BAPI' },
  { regex: /\bNUMBER_RANGE_ENQUEUE\b/gi, label: 'NUMBER_RANGE_ENQUEUE' },
  { regex: /\bNUMBER_RANGE_DEQUEUE\b/gi, label: 'NUMBER_RANGE_DEQUEUE' },
  { regex: /\bnumber[_\s]*range[_\s]*object\b/gi, label: 'Number range object' },
  { regex: /\bNR_INTERVAL\b/gi, label: 'NR_INTERVAL' },
  { regex: /\bBUKRS\s*[=:]\s*["']?(\d{4})["']?/gi, label: 'Company Code (BUKRS)' },
  { regex: /\bBLART\s*[=:]\s*["']?([A-Z]{2})["']?/gi, label: 'Document Type (BLART)' },
  { regex: /\bBLNR\b/gi, label: 'Document Number (BLNR)' },
  { regex: /\bVBELN\b/gi, label: 'Sales Document Number (VBELN)' },
  { regex: /\bEBELN\b/gi, label: 'Purchase Document Number (EBELN)' },
  { regex: /\bMBLNR\b/gi, label: 'Material Document Number (MBLNR)' },
  { regex: /\bAUFNR\b/gi, label: 'Order Number (AUFNR)' },
  { regex: /\bBSEG-BELNR\b/gi, label: 'Accounting Document (BELNR)' },
  { regex: /\bnumberRangeInterval\b/gi, label: 'numberRangeInterval API' },
];

export function analyzeFromSnapshot(result: ExtractionResult): NumberRangeScanResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) runtimeMap.set(rt.id, rt);

  const references: NumberRangeReference[] = [];
  const flowIds = new Set<string>();
  let flowsScanned = 0;

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;
    flowsScanned++;
    const pkgName = packageNames.get(flow.packageId) ?? flow.packageId ?? '';
    const rtStatus = runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED';

    // Scan scripts
    for (const script of content.scripts) {
      if (!script.content) continue;
      const lines = script.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        for (const p of NR_PATTERNS) {
          const re = new RegExp(p.regex.source, p.regex.flags);
          let match: RegExpExecArray | null;
          while ((match = re.exec(line)) !== null) {
            references.push(makeRef(flow.id, flow.name, flow.packageId ?? '', pkgName,
              'SCRIPT', script.fileName, i + 1, match[0], p.label, line.trim(), rtStatus));
            flowIds.add(flow.id);
          }
        }
      }
    }

    // Scan configurations
    for (const cfg of flow.configurations) {
      const val = cfg.parameterValue ?? '';
      for (const p of NR_PATTERNS) {
        const re = new RegExp(p.regex.source, p.regex.flags);
        if (re.test(val)) {
          references.push(makeRef(flow.id, flow.name, flow.packageId ?? '', pkgName,
            'CONFIGURATION', cfg.parameterKey, 0, val, p.label, `${cfg.parameterKey}=${val}`, rtStatus));
          flowIds.add(flow.id);
        }
      }
    }

    // Scan adapter properties
    for (const adapter of content.adapters) {
      if (!adapter.properties) continue;
      for (const [key, val] of Object.entries(adapter.properties)) {
        for (const p of NR_PATTERNS) {
          const re = new RegExp(p.regex.source, p.regex.flags);
          if (re.test(val)) {
            references.push(makeRef(flow.id, flow.name, flow.packageId ?? '', pkgName,
              'ADAPTER_PROPERTY', `${adapter.adapterType}:${key}`, 0, val, p.label,
              `${key}=${val}`, rtStatus));
            flowIds.add(flow.id);
          }
        }
      }
    }

    // Scan mappings
    for (const mapping of content.mappings) {
      const props = mapping.properties;
      if (!props) continue;
      for (const [key, val] of Object.entries(props)) {
        for (const p of NR_PATTERNS) {
          const re = new RegExp(p.regex.source, p.regex.flags);
          if (re.test(val)) {
            references.push(makeRef(flow.id, flow.name, flow.packageId ?? '', pkgName,
              'MAPPING', `${mapping.name}:${key}`, 0, val, p.label, `${key}=${val}`, rtStatus));
            flowIds.add(flow.id);
          }
        }
      }
    }
  }

  const objectCounts: Record<string, number> = {};
  for (const r of references) {
    objectCounts[r.numberRangeObject] = (objectCounts[r.numberRangeObject] || 0) + 1;
  }

  return {
    references,
    totalReferences: references.length,
    uniqueObjects: Object.keys(objectCounts).length,
    flowsWithReferences: flowIds.size,
    flowsScanned,
    objectCounts,
  };
}

function makeRef(
  flowId: string, flowName: string, packageId: string, packageName: string,
  source: NumberRangeSource, sourceFile: string, lineNumber: number,
  matchedText: string, nrObject: string, context: string, runtimeStatus: string,
): NumberRangeReference {
  return {
    referenceId: randomId(), flowId, flowName, packageId, packageName,
    source, sourceFile, lineNumber, matchedText,
    numberRangeObject: nrObject, context, runtimeStatus,
  };
}

function randomId(): string {
  const c = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}
