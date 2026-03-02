/**
 * iFlow Bundle Parser — parses SAP CPI iFlow ZIP bundles into IFlowContent.
 * Port of the Java IFlowBundleParser + IFlowXmlParser.
 *
 * ZIP → extract .iflw (BPMN2 XML) + scripts + mapping files
 * BPMN2 XML → adapters, routes, endpoints, mappings, processProperties
 */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type {
  IFlowContent,
  IFlowAdapter,
  IFlowEndpoint,
  IFlowMapping,
  IFlowRoute,
  ScriptInfo,
} from '@/types/cpi';

// Tags that can appear multiple times — force array
const ARRAY_TAGS = new Set([
  'participant',
  'messageFlow',
  'callActivity',
  'serviceTask',
  'sequenceFlow',
  'property',
  'process',
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  textNodeName: '#text',
  isArray: (name: string) => ARRAY_TAGS.has(name),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseBundle(
  base64Zip: string,
  flowId: string,
  version: string,
): Promise<IFlowContent> {
  const zipBuffer = Buffer.from(base64Zip, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);

  let iflwXml: string | null = null;
  const scripts: ScriptInfo[] = [];
  const mappingFiles: string[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const lower = path.toLowerCase();
    const fileName = extractFileName(path);

    if (lower.endsWith('.iflw')) {
      iflwXml = await file.async('string');
    } else if (lower.endsWith('.groovy')) {
      const content = await file.async('string');
      scripts.push({
        fileName,
        language: 'Groovy',
        content,
        contentSnippet: snippet(content),
      });
    } else if (lower.endsWith('.js')) {
      const content = await file.async('string');
      scripts.push({
        fileName,
        language: 'JavaScript',
        content,
        contentSnippet: snippet(content),
      });
    } else if (lower.endsWith('.mmap')) {
      mappingFiles.push(fileName);
    } else if (lower.endsWith('.xsl') || lower.endsWith('.xslt')) {
      mappingFiles.push(fileName);
    }
  }

  let content: IFlowContent;
  if (iflwXml) {
    content = parseIFlowXml(iflwXml);
    content.rawXml = iflwXml;
  } else {
    content = emptyContent();
  }

  content.flowId = flowId;
  content.version = version;
  content.scripts = scripts;
  content.mappingFiles = mappingFiles;

  return content;
}

// ---------------------------------------------------------------------------
// BPMN2 XML parser
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseIFlowXml(xml: string): IFlowContent {
  const parsed = xmlParser.parse(xml);
  const defs = parsed?.definitions ?? parsed ?? {};
  const collaboration = defs.collaboration ?? {};
  const processes = asArray(defs.process);

  const endpoints: IFlowEndpoint[] = [];
  const adapters: IFlowAdapter[] = [];
  const routes: IFlowRoute[] = [];
  const mappings: IFlowMapping[] = [];
  const processProperties: Record<string, string> = {};

  // ── 1. Participants → Endpoints ──────────────────────────
  const participants = asArray(collaboration.participant);
  const participantRoles = new Map<string, string>();

  for (const p of participants) {
    const id = str(p['@_id']);
    const name = str(p['@_name']);
    // ifl:type → @_type (after removeNSPrefix)
    const iflType = str(p['@_type']);
    const componentType = getProperty(p, 'ComponentType') ?? '';
    const address = getProperty(p, 'address') ?? '';

    endpoints.push({ id, name, type: iflType, componentType, address, role: iflType });
    if (iflType) participantRoles.set(id, iflType);
  }

  // ── 2. MessageFlows → Adapters + Routes ──────────────────
  const messageFlows = asArray(collaboration.messageFlow);
  for (const mf of messageFlows) {
    const mfId = str(mf['@_id']);
    const mfName = str(mf['@_name']);
    const sourceRef = str(mf['@_sourceRef']);
    const targetRef = str(mf['@_targetRef']);
    const sourceRole = participantRoles.get(sourceRef) ?? '';
    const targetRole = participantRoles.get(targetRef) ?? '';

    // Determine adapter direction
    let direction = '';
    if (sourceRole.toLowerCase().includes('sender')) {
      direction = 'Sender';
    } else if (
      targetRole.toLowerCase().includes('receiver') ||
      targetRole.toLowerCase().includes('recevier') // SAP typo
    ) {
      direction = 'Receiver';
    }

    if (direction) {
      const adapterType = getProperty(mf, 'ComponentType') || mfName;
      adapters.push({
        id: mfId,
        name: mfName,
        adapterType,
        direction,
        transportProtocol: getProperty(mf, 'TransportProtocol') ?? '',
        messageProtocol: getProperty(mf, 'MessageProtocol') ?? '',
        address: getProperty(mf, 'Address') ?? '',
        properties: extractAllProperties(mf),
      });
    }

    // Also add as route (for flow connectivity)
    routes.push({
      id: mfId,
      name: mfName,
      type: 'messageFlow',
      activityType: '',
      componentType: '',
      sourceRef,
      targetRef,
      properties: extractAllProperties(mf),
    });
  }

  // ── 3-6. Process-level elements ──────────────────────────
  for (const proc of processes) {
    // 3. callActivities → Routes + Mappings
    for (const ca of asArray(proc.callActivity)) {
      const activityType = getProperty(ca, 'ActivityType') ?? '';
      const componentType = getProperty(ca, 'ComponentType') ?? '';

      if (isMappingActivity(activityType, componentType)) {
        mappings.push({
          id: str(ca['@_id']),
          name: str(ca['@_name']),
          mappingType: componentType || activityType,
          resourceId: getProperty(ca, 'mappinguri') ?? getProperty(ca, 'MappingPath') ?? '',
          properties: extractAllProperties(ca),
        });
      }

      routes.push({
        id: str(ca['@_id']),
        name: str(ca['@_name']),
        type: 'callActivity',
        activityType,
        componentType,
        sourceRef: '',
        targetRef: '',
        properties: extractAllProperties(ca),
      });
    }

    // 4. serviceTasks → Routes
    for (const st of asArray(proc.serviceTask)) {
      routes.push({
        id: str(st['@_id']),
        name: str(st['@_name']),
        type: 'serviceTask',
        activityType: getProperty(st, 'ActivityType') ?? '',
        componentType: getProperty(st, 'ComponentType') ?? '',
        sourceRef: '',
        targetRef: '',
        properties: extractAllProperties(st),
      });
    }

    // 5. sequenceFlows → Routes (with optional conditions)
    for (const sf of asArray(proc.sequenceFlow)) {
      const condExpr = sf.conditionExpression;
      let condition: string | undefined;
      if (condExpr) {
        condition = typeof condExpr === 'string' ? condExpr : str(condExpr['#text']);
      }

      routes.push({
        id: str(sf['@_id']),
        name: str(sf['@_name']),
        type: 'sequenceFlow',
        activityType: '',
        componentType: '',
        sourceRef: str(sf['@_sourceRef']),
        targetRef: str(sf['@_targetRef']),
        condition,
        properties: extractAllProperties(sf),
      });
    }

    // 6. Process-level properties
    Object.assign(processProperties, extractAllProperties(proc));
  }

  return {
    flowId: '',
    version: '',
    routes,
    adapters,
    mappings,
    endpoints,
    processProperties,
    scripts: [],
    mappingFiles: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function str(val: any): string {
  if (val == null) return '';
  return String(val);
}

/**
 * Get a single property value from the extensionElements.
 * SAP BPMN2 structure:
 * <extensionElements>
 *   <ifl:property>
 *     <key>PropertyName</key>
 *     <value>PropertyValue</value>
 *   </ifl:property>
 * </extensionElements>
 */
function getProperty(elem: any, key: string): string | null {
  const ext = elem?.extensionElements;
  if (!ext) return null;
  const properties = asArray(ext.property);
  for (const prop of properties) {
    const k = prop?.key;
    const keyStr = typeof k === 'object' ? str(k?.['#text']) : str(k);
    if (keyStr === key) {
      const v = prop?.value;
      if (v == null) return '';
      return typeof v === 'object' ? str(v['#text']) : str(v);
    }
  }
  return null;
}

function extractAllProperties(elem: any): Record<string, string> {
  const props: Record<string, string> = {};
  const ext = elem?.extensionElements;
  if (!ext) return props;
  const properties = asArray(ext.property);
  for (const prop of properties) {
    const k = prop?.key;
    const v = prop?.value;
    const keyStr = typeof k === 'object' ? str(k?.['#text']) : str(k);
    const valStr = typeof v === 'object' ? str(v?.['#text']) : str(v ?? '');
    if (keyStr) props[keyStr] = valStr;
  }
  return props;
}

function isMappingActivity(activityType: string, componentType: string): boolean {
  const at = activityType.toLowerCase();
  const ct = componentType.toLowerCase();
  return (
    at.includes('mapping') ||
    at.includes('xslt') ||
    at.includes('message_mapping') ||
    ct.includes('mapping') ||
    ct.includes('xslt')
  );
}

function extractFileName(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

function snippet(content: string): string {
  const lines = content.split('\n');
  if (lines.length <= 20) return content;
  return lines.slice(0, 20).join('\n') + '\n... (truncated)';
}

function emptyContent(): IFlowContent {
  return {
    flowId: '',
    version: '',
    routes: [],
    adapters: [],
    mappings: [],
    endpoints: [],
    processProperties: {},
    scripts: [],
    mappingFiles: [],
  };
}
