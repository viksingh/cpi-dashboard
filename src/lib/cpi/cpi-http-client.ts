import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ConnectionConfig } from '@/types/cpi';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

// Module-level token cache keyed by tokenUrl+clientId to reuse across requests
const tokenCacheMap = new Map<string, TokenCache>();

function getCacheKey(config: ConnectionConfig): string {
  return `${config.oauthTokenUrl}|${config.oauthClientId}`;
}

const httpClient: AxiosInstance = axios.create({
  timeout: 60000,
  headers: { Accept: 'application/json' },
});

async function getOAuth2Token(config: ConnectionConfig): Promise<string> {
  const cacheKey = getCacheKey(config);
  const cached = tokenCacheMap.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  const { oauthTokenUrl, oauthClientId, oauthClientSecret } = config;
  if (!oauthTokenUrl || !oauthClientId || !oauthClientSecret) {
    throw new Error('OAuth2 credentials not configured');
  }

  const credentials = Buffer.from(`${oauthClientId}:${oauthClientSecret}`).toString('base64');

  const resp = await axios.post(
    oauthTokenUrl,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30000,
    }
  );

  const { access_token, expires_in } = resp.data;

  tokenCacheMap.set(cacheKey, {
    accessToken: access_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000,
  });

  return access_token;
}

function invalidateToken(config: ConnectionConfig): void {
  tokenCacheMap.delete(getCacheKey(config));
}

async function getAuthHeader(config: ConnectionConfig): Promise<string> {
  if (config.authType === 'oauth2') {
    const token = await getOAuth2Token(config);
    return `Bearer ${token}`;
  }
  const { basicUsername, basicPassword } = config;
  if (!basicUsername || !basicPassword) {
    throw new Error('Basic auth credentials not configured');
  }
  return `Basic ${Buffer.from(`${basicUsername}:${basicPassword}`).toString('base64')}`;
}

function resolveUrl(config: ConnectionConfig, urlOrPath: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  const base = config.tenantUrl.replace(/\/+$/, '');
  const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${base}${path}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function cpiGet(config: ConnectionConfig, urlOrPath: string): Promise<unknown> {
  const url = resolveUrl(config, urlOrPath);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const auth = await getAuthHeader(config);
      const axCfg: AxiosRequestConfig = {
        headers: { Authorization: auth, Accept: 'application/json' },
      };
      const resp = await httpClient.get(url, axCfg);
      return resp.data;
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: unknown }; message?: string; code?: string };
      lastError = err as Error;
      const status = axErr.response?.status;

      if (status === 401 && attempt < MAX_RETRIES) {
        invalidateToken(config);
        continue;
      }
      if (status === 429 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      if (status && status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // Build a detailed error message
      if (axErr.response) {
        const detail = typeof axErr.response.data === 'string'
          ? axErr.response.data.substring(0, 200)
          : JSON.stringify(axErr.response.data)?.substring(0, 200);
        throw new Error(`CPI API error ${status}: ${detail || axErr.message}`);
      }
      if (axErr.code === 'ECONNREFUSED' || axErr.code === 'ENOTFOUND') {
        throw new Error(`Cannot reach ${url} (${axErr.code}). Check the tenant URL.`);
      }
      throw err;
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

export async function cpiGetBytes(config: ConnectionConfig, urlOrPath: string): Promise<Buffer> {
  const url = resolveUrl(config, urlOrPath);
  const auth = await getAuthHeader(config);

  const resp = await httpClient.get(url, {
    headers: {
      Authorization: auth,
      Accept: 'application/zip, application/octet-stream, */*',
    },
    responseType: 'arraybuffer',
  });

  return Buffer.from(resp.data);
}

export async function testConnection(config: ConnectionConfig): Promise<void> {
  await cpiGet(config, '/api/v1/');
}
