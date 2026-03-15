import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendManagerNotification } from '@/lib/slack';

interface NotifyBody {
  ticketKey: string;
  ticketTitle: string;
  summary: string;
  jiraLink: string;
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: NotifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ticketKey, ticketTitle, summary, jiraLink } = body;
  if (!ticketKey || !ticketTitle || !summary) {
    return NextResponse.json(
      { error: 'ticketKey, ticketTitle, and summary are required' },
      { status: 400 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('display_name, manager_slack_channel')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 });
  }

  if (!profile?.manager_slack_channel) {
    return NextResponse.json(
      { error: 'No manager Slack channel configured. Please add it in Settings.' },
      { status: 400 },
    );
  }

  const completionTime = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const sent = await sendManagerNotification(profile.manager_slack_channel, {
    developerName: profile.display_name ?? user.email ?? 'Developer',
    ticketKey,
    ticketTitle,
    summary,
    completionTime,
    jiraLink: jiraLink ?? '',
  });

  // Log to notifications table
  await supabase.from('notifications').insert({
    user_id: user.id,
    type: 'slack',
    payload: { ticketKey, ticketTitle, summary, jiraLink, channel: profile.manager_slack_channel },
    status: sent ? 'sent' : 'failed',
    sent_at: sent ? new Date().toISOString() : null,
  });

  if (!sent) {
    return NextResponse.json({ error: 'Failed to send Slack notification' }, { status: 500 });
  }

  return NextResponse.json({ success: true, channel: profile.manager_slack_channel });
}
