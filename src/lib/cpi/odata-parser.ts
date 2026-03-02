/**
 * OData response parser handling 6 SAP CPI response format variants.
 * Strips __metadata, __deferred, __count fields.
 * Follows pagination via d.__next, __next, @odata.nextLink.
 */

function stripMetadata(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripMetadata);
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key.startsWith('__')) continue;
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'results' in (value as Record<string, unknown>) &&
        Array.isArray((value as Record<string, unknown>).results)
      ) {
        cleaned[key] = stripMetadata((value as Record<string, unknown>).results);
      } else {
        cleaned[key] = stripMetadata(value);
      }
    }
    return cleaned;
  }
  return obj;
}

export interface ODataParseResult {
  items: Record<string, unknown>[];
  nextLink: string | null;
}

export function parseODataResponse(body: unknown): ODataParseResult {
  let items: unknown[];
  let nextLink: string | null = null;

  const obj = body as Record<string, unknown>;

  if (obj.d !== undefined) {
    const d = obj.d as Record<string, unknown>;
    if (d.results !== undefined && Array.isArray(d.results)) {
      items = d.results;
      nextLink = (d.__next as string) || (obj.__next as string) || null;
    } else if (Array.isArray(d)) {
      items = d;
      nextLink = (obj.__next as string) || null;
    } else {
      items = [d];
      nextLink = null;
    }
  } else if (obj.results !== undefined && Array.isArray(obj.results)) {
    items = obj.results;
    nextLink = (obj.__next as string) || null;
  } else if (obj.value !== undefined && Array.isArray(obj.value)) {
    items = obj.value;
    nextLink = (obj['@odata.nextLink'] as string) || null;
  } else if (Array.isArray(body)) {
    items = body;
    nextLink = null;
  } else {
    items = [];
    nextLink = null;
  }

  return {
    items: stripMetadata(items) as Record<string, unknown>[],
    nextLink,
  };
}

const FIELD_MAP: Record<string, string> = {
  Id: 'id', Name: 'name', Description: 'description', ShortText: 'shortText',
  Version: 'version', Vendor: 'vendor', Mode: 'mode',
  SupportedPlatform: 'supportedPlatform', ModifiedBy: 'modifiedBy',
  CreationDate: 'creationDate', ModifiedDate: 'modifiedDate', CreatedBy: 'createdBy',
  Products: 'products', Keywords: 'keywords', Countries: 'countries',
  Industries: 'industries', LineOfBusiness: 'lineOfBusiness', ResourceId: 'resourceId',
  PackageId: 'packageId', Sender: 'sender', Receiver: 'receiver',
  CreatedAt: 'createdAt', ModifiedAt: 'modifiedAt', ArtifactContent: 'artifactContent',
  ParameterKey: 'parameterKey', ParameterValue: 'parameterValue', DataType: 'dataType',
  Type: 'type', DeployedBy: 'deployedBy', DeployedOn: 'deployedOn',
  Status: 'status', ErrorInformation: 'errorInformation',
};

export function mapODataFields<T>(item: Record<string, unknown>): T {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    const tsKey = FIELD_MAP[key] || key;
    mapped[tsKey] = value;
  }
  return mapped as T;
}
