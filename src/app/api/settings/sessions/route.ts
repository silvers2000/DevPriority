import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, device_name, device_type, platform, last_seen, is_active, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('last_seen', { ascending: false });

  return NextResponse.json({ sessions: sessions ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json() as {
    sessionId?: string;
    deviceName?: string;
    deviceType?: string;
    platform?: string;
  };

  const admin = createAdminClient();

  if (body.sessionId) {
    // Update last_seen for existing session
    const { error } = await admin
      .from('sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', body.sessionId)
      .eq('user_id', user.id);

    if (error) {
      // Session may have been revoked — create a new one
      body.sessionId = undefined;
    } else {
      return NextResponse.json({ sessionId: body.sessionId });
    }
  }

  // Create a new session record
  const { data: inserted } = await admin
    .from('sessions')
    .insert({
      user_id: user.id,
      device_name: body.deviceName ?? 'Browser',
      device_type: body.deviceType ?? 'desktop',
      platform: body.platform ?? 'Web',
      is_active: true,
      last_seen: new Date().toISOString(),
    })
    .select('id')
    .single();

  return NextResponse.json({ sessionId: inserted?.id ?? null });
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json() as { sessionId?: string; all?: boolean };
  const admin = createAdminClient();

  if (body.all) {
    await admin
      .from('sessions')
      .update({ is_active: false })
      .eq('user_id', user.id);
  } else if (body.sessionId) {
    await admin
      .from('sessions')
      .update({ is_active: false })
      .eq('id', body.sessionId)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ success: true });
}
