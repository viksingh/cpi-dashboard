import { NextResponse } from 'next/server';
import { cpiGetBytes } from '@/lib/cpi/cpi-http-client';
import { parseBundle } from '@/lib/cpi/bundle-parser';
import type { ConnectionConfig } from '@/types/cpi';

export async function POST(request: Request) {
  try {
    const { config, flowId, flowVersion } = (await request.json()) as {
      config: ConnectionConfig;
      flowId: string;
      flowVersion: string;
    };

    const ver = flowVersion || 'active';
    const endpoint = `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(flowId)}',Version='${encodeURIComponent(ver)}')/$value`;

    const buffer = await cpiGetBytes(config, endpoint);
    const base64 = Buffer.from(buffer).toString('base64');

    const iflowContent = await parseBundle(base64, flowId, ver);

    return NextResponse.json({ iflowContent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download bundle';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
