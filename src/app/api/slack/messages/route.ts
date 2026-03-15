import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { fetchUserChannels, fetchRecentMessages } from '@/lib/slack';

export async function GET() {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('slack_user_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 });
  }

  if (!profile?.slack_user_id) {
    return NextResponse.json(
      { error: 'No Slack user ID configured. Please add your Slack user ID in Settings.' },
      { status: 400 },
    );
  }

  const channels = await fetchUserChannels(profile.slack_user_id);
  if (channels.length === 0) {
    return NextResponse.json({ messages: [], channels: [] });
  }

  const channelIds = channels.map((c) => c.id);
  const messages = await fetchRecentMessages(channelIds);

  return NextResponse.json({ messages, channels, total: messages.length });
}
