import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/cpi/cpi-http-client';
import type { ConnectionConfig } from '@/types/cpi';

export async function POST(request: Request) {
  try {
    const config: ConnectionConfig = await request.json();

    if (!config.tenantUrl) {
      return NextResponse.json({ error: 'Tenant URL is required' }, { status: 400 });
    }

    await testConnection(config);

    return NextResponse.json({ success: true, message: 'Connected successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
