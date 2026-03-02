import { NextResponse } from 'next/server';
import { cpiGet } from '@/lib/cpi/cpi-http-client';
import { parseODataResponse, mapODataFields } from '@/lib/cpi/odata-parser';
import type { ConnectionConfig, RuntimeArtifact } from '@/types/cpi';

export async function POST(request: Request) {
  try {
    const { config } = (await request.json()) as { config: ConnectionConfig };

    const allItems: Record<string, unknown>[] = [];
    let url: string | null = '/api/v1/IntegrationRuntimeArtifacts?$format=json';

    while (url) {
      const data = await cpiGet(config, url);
      const { items, nextLink } = parseODataResponse(data);
      allItems.push(...items);
      url = nextLink;
    }

    const runtimeArtifacts = allItems.map((item) =>
      mapODataFields<RuntimeArtifact>(item)
    );

    return NextResponse.json({ runtimeArtifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch runtime artifacts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
