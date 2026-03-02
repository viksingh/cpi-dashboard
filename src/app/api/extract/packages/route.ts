import { NextResponse } from 'next/server';
import { cpiGet } from '@/lib/cpi/cpi-http-client';
import { parseODataResponse, mapODataFields } from '@/lib/cpi/odata-parser';
import type { ConnectionConfig, IntegrationPackage } from '@/types/cpi';

export async function POST(request: Request) {
  try {
    const { config } = (await request.json()) as { config: ConnectionConfig };

    const allItems: Record<string, unknown>[] = [];
    let url: string | null = '/api/v1/IntegrationPackages?$format=json';

    while (url) {
      const data = await cpiGet(config, url);
      const { items, nextLink } = parseODataResponse(data);
      allItems.push(...items);
      url = nextLink;
    }

    const packages = allItems.map((item) => {
      const pkg = mapODataFields<IntegrationPackage>(item);
      return { ...pkg, integrationFlows: [], valueMappings: [] };
    });

    return NextResponse.json({ packages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch packages';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
