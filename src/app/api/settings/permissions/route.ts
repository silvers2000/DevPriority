import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: permissions } = await admin
    .from('permissions')
    .select('id, action_type, permission, updated_at')
    .eq('user_id', user.id)
    .order('action_type');

  return NextResponse.json({ permissions: permissions ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id, permission } = await request.json() as { id: string; permission: string };
  const admin = createAdminClient();

  const { error } = await admin
    .from('permissions')
    .update({ permission, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json() as { id?: string; all?: boolean };
  const admin = createAdminClient();

  if (body.all) {
    await admin.from('permissions').delete().eq('user_id', user.id);
  } else if (body.id) {
    await admin
      .from('permissions')
      .delete()
      .eq('id', body.id)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ success: true });
}
