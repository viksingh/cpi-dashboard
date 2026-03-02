import { NextResponse } from 'next/server';
import { cpiGet } from '@/lib/cpi/cpi-http-client';
import { parseODataResponse, mapODataFields } from '@/lib/cpi/odata-parser';
import type { ConnectionConfig, ValueMapping } from '@/types/cpi';

export async function POST(request: Request) {
  try {
    const { config, packageId } = (await request.json()) as {
      config: ConnectionConfig;
      packageId: string;
    };

    const allItems: Record<string, unknown>[] = [];
    let url: string | null =
      `/api/v1/IntegrationPackages('${encodeURIComponent(packageId)}')/ValueMappingDesigntimeArtifacts?$format=json`;

    while (url) {
      const data = await cpiGet(config, url);
      const { items, nextLink } = parseODataResponse(data);
      allItems.push(...items);
      url = nextLink;
    }

    const valueMappings = allItems.map((item) => {
      const vm = mapODataFields<ValueMapping>(item);
      return { ...vm, packageId };
    });

    return NextResponse.json({ valueMappings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch value mappings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
