/**
 * TechDebtScorer — scores each iFlow on 5 technical debt dimensions
 * and produces a weighted composite score 0-100.
 *
 * Categories and weights:
 *   1. Age           (0.15)
 *   2. Complexity    (0.25)
 *   3. Error Handling(0.25)
 *   4. Deprecated    (0.20)
 *   5. Hardcoded     (0.15)
 *
 * Ported from com.sakiv.cpi.techdebt.service.TechDebtScoringService (Java).
 */

import type {
  ExtractionResult,
  IntegrationFlow,
  IFlowContent,
  IFlowAdapter,
  IFlowRoute,
  ScriptInfo,
} from '@/types/cpi';
import type {
  TechDebtScore,
  ScoringResult,
  DebtCategory,
  RiskLevel,
} from '@/types/tech-debt';
import { riskLevelFromScore } from '@/types/tech-debt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHT_AGE = 0.15;
const WEIGHT_COMPLEXITY = 0.25;
const WEIGHT_ERROR_HANDLING = 0.25;
const WEIGHT_DEPRECATED = 0.20;
const WEIGHT_HARDCODED = 0.15;

/** Deprecated / legacy adapter types in SAP CPI */
const DEPRECATED_ADAPTERS = new Set([
  'SuccessFactors',
  'SAPSuccessFactorsSOAP',
  'FlatFile',
  'LDAP',
  'AS2',
  'Twitter',
  'Facebook',
  'ELSTER',
  'SOAP1x',
  'SOAPSender1x',
  'SOAPReceiver1x',
  'XI',
  'MailSender',
  'MailReceiver',
  'IDoc_AAE',
]);

const HARDCODED_URL_RE = /https?:\/\/[^"'\s,;)}>]+/gi;
const HARDCODED_IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const HARDCODED_CREDENTIAL_RE =
  /(?:password|secret|token|apikey|api_key)\s*[=:]\s*["'][^"']+["']/gi;

/** URL prefixes that are safe to ignore */
const SKIP_URL_PREFIXES = [
  'http://www.w3.org',
  'https://www.w3.org',
  'http://schemas',
  'https://schemas',
  'http://xml',
  'https://xml',
  'http://java.sun.com',
  'https://java.sun.com',
  'http://xmlns',
  'https://xmlns',
  'http://camel.apache.org',
  'https://camel.apache.org',
  'http://github.com',
  'https://github.com',
  'http://maven.apache.org',
  'https://maven.apache.org',
  'http://apache.org',
  'https://apache.org',
  'http://localhost',
  'https://localhost',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score all iFlows from an extraction snapshot.
 */
export function scoreFromSnapshot(extraction: ExtractionResult): ScoringResult {
  // Build package name lookup
  const flowToPackageName = new Map<string, string>();
  for (const pkg of extraction.packages) {
    for (const flow of pkg.integrationFlows) {
      flowToPackageName.set(flow.id, pkg.name);
    }
  }
  // Also check allFlows that may have packageId set
  for (const flow of extraction.allFlows) {
    if (flow.packageId && !flowToPackageName.has(flow.id)) {
      for (const pkg of extraction.packages) {
        if (pkg.id === flow.packageId) {
          flowToPackageName.set(flow.id, pkg.name);
          break;
        }
      }
    }
  }

  // Apply runtime status from snapshot
  const runtimeStatusMap = new Map<string, string>();
  if (extraction.runtimeArtifacts) {
    for (const rt of extraction.runtimeArtifacts) {
      runtimeStatusMap.set(rt.id, rt.status);
    }
  }
  for (const flow of extraction.allFlows) {
    if (!flow.runtimeStatus) {
      const status = runtimeStatusMap.get(flow.id);
      if (status) {
        flow.runtimeStatus = status;
      }
    }
  }

  // Score each flow
  const scores: TechDebtScore[] = [];
  let flowsScored = 0;
  let flowsSkipped = 0;

  for (const flow of extraction.allFlows) {
    const score = scoreFlow(flow, flowToPackageName.get(flow.id) ?? null);
    if (score) {
      scores.push(score);
      if (flow.bundleParsed) {
        flowsScored++;
      } else {
        flowsSkipped++;
      }
    }
  }

  return {
    tenantUrl: extraction.tenantUrl,
    totalPackages: extraction.packages.length,
    totalFlows: extraction.allFlows.length,
    flowsScored,
    flowsSkipped,
    scores,
  };
}

// ---------------------------------------------------------------------------
// Per-flow scoring
// ---------------------------------------------------------------------------

function scoreFlow(
  flow: IntegrationFlow,
  packageName: string | null,
): TechDebtScore {
  const findings: Record<DebtCategory, string[]> = {
    AGE: [],
    COMPLEXITY: [],
    MISSING_ERROR_HANDLING: [],
    DEPRECATED_ADAPTERS: [],
    HARDCODED_VALUES: [],
  };

  // Score each category
  const ageResult = scoreAge(flow, findings);
  const complexityResult = scoreComplexity(flow, findings);
  const errorResult = scoreMissingErrorHandling(flow, findings);
  const deprecatedResult = scoreDeprecatedAdapters(flow, findings);
  const hardcodedResult = scoreHardcodedValues(flow, findings);

  // Compute weighted composite
  const composite =
    ageResult.ageScore * WEIGHT_AGE +
    complexityResult.complexityScore * WEIGHT_COMPLEXITY +
    errorResult.errorScore * WEIGHT_ERROR_HANDLING +
    deprecatedResult.deprecatedScore * WEIGHT_DEPRECATED +
    hardcodedResult.hardcodedScore * WEIGHT_HARDCODED;

  const compositeScore = Math.round(composite * 10) / 10;

  return {
    iflowId: flow.id,
    iflowName: flow.name,
    packageId: flow.packageId,
    packageName,
    version: flow.version,
    createdAt: flow.createdAt,
    modifiedAt: flow.modifiedAt,
    runtimeStatus: flow.runtimeStatus ?? null,

    ageScore: ageResult.ageScore,
    complexityScore: complexityResult.complexityScore,
    missingErrorHandlingScore: errorResult.errorScore,
    deprecatedAdapterScore: deprecatedResult.deprecatedScore,
    hardcodedValueScore: hardcodedResult.hardcodedScore,
    compositeScore,
    riskLevel: riskLevelFromScore(compositeScore),

    findings,

    ageDays: ageResult.ageDays,
    stepCount: complexityResult.stepCount,
    adapterCount: complexityResult.adapterCount,
    scriptCount: complexityResult.scriptCount,
    mappingCount: complexityResult.mappingCount,
    routeCount: complexityResult.routeCount,
    hasExceptionSubprocess: errorResult.hasExceptionSubprocess,
    deprecatedAdapterCount: deprecatedResult.deprecatedCount,
    hardcodedValueCount: hardcodedResult.hardcodedCount,
    totalScriptLines: complexityResult.totalScriptLines,
  };
}

// ---------------------------------------------------------------------------
// Category 1: Age Score
// ---------------------------------------------------------------------------

interface AgeResult {
  ageScore: number;
  ageDays: number;
}

function scoreAge(
  flow: IntegrationFlow,
  findings: Record<DebtCategory, string[]>,
): AgeResult {
  const ageDays = computeAgeDays(flow.createdAt);

  let ageScore: number;
  if (ageDays > 1825) {
    // > 5 years
    ageScore = 100;
    findings.AGE.push(`iFlow is over 5 years old (${ageDays} days)`);
  } else if (ageDays > 1095) {
    // > 3 years
    ageScore = 75;
    findings.AGE.push(`iFlow is over 3 years old (${ageDays} days)`);
  } else if (ageDays > 730) {
    // > 2 years
    ageScore = 50;
    findings.AGE.push(`iFlow is over 2 years old (${ageDays} days)`);
  } else if (ageDays > 365) {
    // > 1 year
    ageScore = 30;
    findings.AGE.push(`iFlow is over 1 year old (${ageDays} days)`);
  } else {
    ageScore = Math.min(Math.floor((ageDays * 100) / 365), 25);
  }

  // Staleness penalty
  const daysSinceModified = computeAgeDays(flow.modifiedAt);
  if (daysSinceModified > 365 && ageDays > 365) {
    ageScore = Math.min(100, ageScore + 10);
    findings.AGE.push(`Not modified in ${daysSinceModified} days`);
  }

  return { ageScore: Math.min(100, ageScore), ageDays };
}

// ---------------------------------------------------------------------------
// Category 2: Complexity Score
// ---------------------------------------------------------------------------

interface ComplexityResult {
  complexityScore: number;
  stepCount: number;
  adapterCount: number;
  scriptCount: number;
  mappingCount: number;
  routeCount: number;
  totalScriptLines: number;
}

function scoreComplexity(
  flow: IntegrationFlow,
  findings: Record<DebtCategory, string[]>,
): ComplexityResult {
  const content = flow.iflowContent;
  if (!content) {
    return {
      complexityScore: 0,
      stepCount: 0,
      adapterCount: 0,
      scriptCount: 0,
      mappingCount: 0,
      routeCount: 0,
      totalScriptLines: 0,
    };
  }

  const steps = (content.routes || []).length;
  const adapters = (content.adapters || []).length;
  const mappings = (content.mappings || []).length;
  const scripts = (content.scripts || []).length;
  const routes = (content.routes || []).filter(
    (r) => r.type === 'sequenceFlow' || r.type === 'messageFlow',
  ).length;
  const totalScriptLines = (content.scripts || []).reduce((sum, s) => {
    return sum + (s.content ? s.content.split('\n').length : 0);
  }, 0);

  // Weighted complexity index
  const complexityIndex =
    steps + adapters * 2 + mappings * 2 + scripts * 3 + Math.floor(routes / 2);

  let complexityScore: number;
  if (complexityIndex > 50) {
    complexityScore = 100;
    findings.COMPLEXITY.push(
      `Very high complexity: ${complexityIndex} weighted steps`,
    );
  } else if (complexityIndex > 30) {
    complexityScore = 75;
    findings.COMPLEXITY.push(
      `High complexity: ${complexityIndex} weighted steps`,
    );
  } else if (complexityIndex > 15) {
    complexityScore = 50;
    findings.COMPLEXITY.push(
      `Moderate complexity: ${complexityIndex} weighted steps`,
    );
  } else if (complexityIndex > 8) {
    complexityScore = 25;
  } else {
    complexityScore = Math.min(complexityIndex * 3, 20);
  }

  // Bonus for large scripts
  if (totalScriptLines > 500) {
    complexityScore = Math.min(100, complexityScore + 15);
    findings.COMPLEXITY.push(
      `Large scripts: ${totalScriptLines} total lines`,
    );
  } else if (totalScriptLines > 200) {
    complexityScore = Math.min(100, complexityScore + 10);
    findings.COMPLEXITY.push(
      `Moderate scripts: ${totalScriptLines} total lines`,
    );
  }

  // Many adapters bonus
  if (adapters > 6) {
    complexityScore = Math.min(100, complexityScore + 10);
    findings.COMPLEXITY.push(`${adapters} adapter channels`);
  }

  return {
    complexityScore: Math.min(100, complexityScore),
    stepCount: steps,
    adapterCount: adapters,
    scriptCount: scripts,
    mappingCount: mappings,
    routeCount: routes,
    totalScriptLines,
  };
}

// ---------------------------------------------------------------------------
// Category 3: Missing Error Handling Score
// ---------------------------------------------------------------------------

interface ErrorHandlingResult {
  errorScore: number;
  hasExceptionSubprocess: boolean;
}

function scoreMissingErrorHandling(
  flow: IntegrationFlow,
  findings: Record<DebtCategory, string[]>,
): ErrorHandlingResult {
  const content = flow.iflowContent;
  if (!content) {
    findings.MISSING_ERROR_HANDLING.push('No bundle content to analyze');
    return { errorScore: 50, hasExceptionSubprocess: false };
  }

  let hasExceptionSubprocess = false;
  let hasErrorEndEvent = false;
  let hasTryCatch = false;
  let hasExceptionHandler = false;

  // Check routes/steps for exception handling patterns
  for (const route of (content.routes || [])) {
    const type = (route.type ?? '').toLowerCase();
    const activityType = (route.activityType ?? '').toLowerCase();
    const componentType = (route.componentType ?? '').toLowerCase();
    const name = (route.name ?? '').toLowerCase();

    if (
      activityType.includes('exception') ||
      componentType.includes('exception') ||
      name.includes('exception') ||
      name.includes('error')
    ) {
      hasExceptionSubprocess = true;
    }
    if (
      type.includes('error') ||
      activityType.includes('error') ||
      componentType.includes('errorend')
    ) {
      hasErrorEndEvent = true;
    }
  }

  // Check XML for exception subprocess elements
  const rawXml = content.rawXml;
  if (rawXml) {
    const xmlLower = rawXml.toLowerCase();
    if (
      xmlLower.includes('exceptionsubprocess') ||
      xmlLower.includes('exception_subprocess') ||
      xmlLower.includes('subprocesstype="erroreventsubprocess"')
    ) {
      hasExceptionSubprocess = true;
    }
    if (
      xmlLower.includes('errorendevent') ||
      xmlLower.includes('error_end_event')
    ) {
      hasErrorEndEvent = true;
    }
  }

  // Check scripts for try-catch
  for (const script of (content.scripts || [])) {
    if (script.content) {
      const lower = script.content.toLowerCase();
      if (lower.includes('try') && lower.includes('catch')) {
        hasTryCatch = true;
      }
      if (
        lower.includes('exceptionhandler') ||
        lower.includes('exception_handler')
      ) {
        hasExceptionHandler = true;
      }
    }
  }

  // Check process properties for error configuration
  let hasErrorConfig = false;
  for (const key of Object.keys(content.processProperties)) {
    const keyLower = key.toLowerCase();
    if (
      keyLower.includes('error') ||
      keyLower.includes('exception') ||
      keyLower.includes('retry')
    ) {
      hasErrorConfig = true;
      break;
    }
  }

  let errorScore: number;
  if (
    !hasExceptionSubprocess &&
    !hasErrorEndEvent &&
    !hasTryCatch &&
    !hasExceptionHandler
  ) {
    errorScore = 100;
    findings.MISSING_ERROR_HANDLING.push('No exception subprocess found');
    findings.MISSING_ERROR_HANDLING.push('No error end event found');
    if ((content.scripts || []).length > 0) {
      findings.MISSING_ERROR_HANDLING.push('Scripts lack try-catch blocks');
    }
  } else if (!hasExceptionSubprocess) {
    errorScore = 70;
    findings.MISSING_ERROR_HANDLING.push('No exception subprocess found');
    if (hasTryCatch) {
      errorScore -= 15;
    }
    if (hasErrorEndEvent) {
      errorScore -= 15;
    }
  } else {
    errorScore = 0;
    if (!hasTryCatch && (content.scripts || []).length > 0) {
      errorScore = 20;
      findings.MISSING_ERROR_HANDLING.push('Scripts lack try-catch blocks');
    }
  }

  if (!hasErrorConfig && (content.adapters || []).length > 0) {
    errorScore = Math.min(100, errorScore + 10);
    findings.MISSING_ERROR_HANDLING.push(
      'No error/retry configuration in process properties',
    );
  }

  return {
    errorScore: Math.max(0, Math.min(100, errorScore)),
    hasExceptionSubprocess,
  };
}

// ---------------------------------------------------------------------------
// Category 4: Deprecated Adapters Score
// ---------------------------------------------------------------------------

interface DeprecatedResult {
  deprecatedScore: number;
  deprecatedCount: number;
}

function scoreDeprecatedAdapters(
  flow: IntegrationFlow,
  findings: Record<DebtCategory, string[]>,
): DeprecatedResult {
  const content = flow.iflowContent;
  if (!content) {
    return { deprecatedScore: 0, deprecatedCount: 0 };
  }

  let deprecatedCount = 0;
  for (const adapter of (content.adapters || [])) {
    const type = adapter.adapterType;
    if (!type) continue;

    if (isDeprecatedAdapter(type)) {
      deprecatedCount++;
      findings.DEPRECATED_ADAPTERS.push(
        `Deprecated adapter: ${type} (${adapter.direction})`,
      );
    }
  }

  let depScore: number;
  if (deprecatedCount === 0) {
    depScore = 0;
  } else if (deprecatedCount === 1) {
    depScore = 50;
  } else if (deprecatedCount === 2) {
    depScore = 75;
  } else {
    depScore = 100;
  }

  return { deprecatedScore: depScore, deprecatedCount };
}

function isDeprecatedAdapter(adapterType: string): boolean {
  if (!adapterType) return false;
  const upper = adapterType.toUpperCase();
  for (const deprecated of DEPRECATED_ADAPTERS) {
    if (
      deprecated.toLowerCase() === adapterType.toLowerCase() ||
      upper.includes(deprecated.toUpperCase())
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Category 5: Hardcoded Values Score
// ---------------------------------------------------------------------------

interface HardcodedResult {
  hardcodedScore: number;
  hardcodedCount: number;
}

function scoreHardcodedValues(
  flow: IntegrationFlow,
  findings: Record<DebtCategory, string[]>,
): HardcodedResult {
  const content = flow.iflowContent;
  if (!content) {
    return { hardcodedScore: 0, hardcodedCount: 0 };
  }

  let hardcodedCount = 0;

  // Check scripts for hardcoded URLs, IPs, credentials
  for (const script of (content.scripts || [])) {
    if (!script.content) continue;
    const scriptContent = script.content;

    // Hardcoded URLs
    HARDCODED_URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HARDCODED_URL_RE.exec(scriptContent)) !== null) {
      const url = match[0];
      if (!shouldSkipUrl(url)) {
        hardcodedCount++;
        findings.HARDCODED_VALUES.push(
          `Hardcoded URL in ${script.fileName}: ${truncate(url, 80)}`,
        );
      }
    }

    // Hardcoded IPs
    HARDCODED_IP_RE.lastIndex = 0;
    while ((match = HARDCODED_IP_RE.exec(scriptContent)) !== null) {
      const ip = match[0];
      if (!ip.startsWith('0.') && ip !== '127.0.0.1' && !ip.startsWith('255.')) {
        hardcodedCount++;
        findings.HARDCODED_VALUES.push(
          `Hardcoded IP in ${script.fileName}: ${ip}`,
        );
      }
    }

    // Hardcoded credentials
    HARDCODED_CREDENTIAL_RE.lastIndex = 0;
    while ((match = HARDCODED_CREDENTIAL_RE.exec(scriptContent)) !== null) {
      hardcodedCount++;
      findings.HARDCODED_VALUES.push(
        `Possible hardcoded credential in ${script.fileName}`,
      );
    }
  }

  // Check adapter properties for hardcoded values
  for (const adapter of (content.adapters || [])) {
    for (const [key, value] of Object.entries(adapter.properties)) {
      if (!value) continue;
      const keyLower = key.toLowerCase();

      // Check for hardcoded addresses instead of externalized parameters
      if (
        (keyLower.includes('address') ||
          keyLower.includes('url') ||
          keyLower.includes('host')) &&
        value.startsWith('http') &&
        !value.startsWith('{{') &&
        !value.includes('${')
      ) {
        hardcodedCount++;
        findings.HARDCODED_VALUES.push(
          `Non-externalized ${key} in adapter ${adapter.name}: ${truncate(value, 80)}`,
        );
      }

      // Check for hardcoded credentials in adapter config
      if (
        (keyLower.includes('password') ||
          keyLower.includes('secret') ||
          keyLower.includes('credential')) &&
        value.trim().length > 0 &&
        !value.startsWith('{{') &&
        !value.includes('${') &&
        value !== '****'
      ) {
        hardcodedCount++;
        findings.HARDCODED_VALUES.push(
          `Possible hardcoded credential in adapter ${adapter.name} property: ${key}`,
        );
      }
    }
  }

  // Check process properties for hardcoded patterns
  for (const [propKey, propValue] of Object.entries(content.processProperties)) {
    if (!propValue) continue;
    HARDCODED_URL_RE.lastIndex = 0;
    const match = HARDCODED_URL_RE.exec(propValue);
    if (match && !shouldSkipUrl(match[0])) {
      hardcodedCount++;
      findings.HARDCODED_VALUES.push(
        `Hardcoded URL in process property '${propKey}'`,
      );
    }
  }

  let hcScore: number;
  if (hardcodedCount === 0) {
    hcScore = 0;
  } else if (hardcodedCount <= 2) {
    hcScore = 30;
  } else if (hardcodedCount <= 5) {
    hcScore = 60;
  } else if (hardcodedCount <= 10) {
    hcScore = 80;
  } else {
    hcScore = 100;
  }

  return { hardcodedScore: hcScore, hardcodedCount };
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CPI date string and return the number of days since that date.
 * Handles:  /Date(epoch)/ , numeric epoch strings , ISO date strings.
 */
function computeAgeDays(dateStr: string | undefined | null): number {
  if (!dateStr || dateStr.trim().length === 0) return 0;

  try {
    const now = Date.now();

    // SAP CPI dates: /Date(1234567890000)/
    if (dateStr.includes('/Date(')) {
      const digits = dateStr.replace(/[^0-9-]/g, '');
      let ms = digits;
      const dashIdx = ms.indexOf('-');
      if (dashIdx > 0) {
        ms = ms.substring(0, dashIdx);
      }
      const epoch = parseInt(ms, 10);
      if (!isNaN(epoch)) {
        return Math.floor((now - epoch) / 86400000);
      }
    }

    // Numeric epoch string (10-13 digits)
    if (/^\d{10,13}$/.test(dateStr)) {
      let epoch = parseInt(dateStr, 10);
      if (epoch <= 9999999999) {
        epoch = epoch * 1000; // seconds to ms
      }
      return Math.floor((now - epoch) / 86400000);
    }

    // ISO date string
    const iso = dateStr.substring(0, Math.min(10, dateStr.length));
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) {
      return Math.floor((now - parsed.getTime()) / 86400000);
    }
  } catch {
    // Ignore parse errors
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase();
  for (const prefix of SKIP_URL_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen) + '...' : s;
}
