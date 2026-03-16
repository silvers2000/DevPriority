import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('display_name, jira_email, slack_user_id, manager_slack_channel')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    email: user.email ?? '',
    displayName: profile?.display_name ?? '',
    jiraEmail: profile?.jira_email ?? '',
    slackUserId: profile?.slack_user_id ?? '',
    managerSlackChannel: profile?.manager_slack_channel ?? '',
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json() as {
    displayName?: string;
    jiraEmail?: string;
    slackUserId?: string;
    managerSlackChannel?: string;
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .upsert({
      id: user.id,
      email: user.email ?? '',
      display_name: body.displayName ?? null,
      jira_email: body.jiraEmail ?? null,
      slack_user_id: body.slackUserId ?? null,
      manager_slack_channel: body.managerSlackChannel ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
