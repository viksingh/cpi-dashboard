import { NextResponse } from 'next/server';
import { cpiGet } from '@/lib/cpi/cpi-http-client';
import { parseODataResponse, mapODataFields } from '@/lib/cpi/odata-parser';
import type { ConnectionConfig, Configuration } from '@/types/cpi';

export async function POST(request: Request) {
  try {
    const { config, flowId, flowVersion } = (await request.json()) as {
      config: ConnectionConfig;
      flowId: string;
      flowVersion: string;
    };

    const ver = flowVersion || 'active';
    const allItems: Record<string, unknown>[] = [];
    let url: string | null =
      `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(flowId)}',Version='${encodeURIComponent(ver)}')/Configurations?$format=json`;

    while (url) {
      const data = await cpiGet(config, url);
      const { items, nextLink } = parseODataResponse(data);
      allItems.push(...items);
      url = nextLink;
    }

    const configurations = allItems.map((item) => {
      const cfg = mapODataFields<Configuration>(item);
      return { ...cfg, artifactId: flowId };
    });

    return NextResponse.json({ configurations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch configurations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
