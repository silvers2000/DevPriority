import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAssignedTickets } from '@/lib/jira';

export async function GET() {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Look up jira_email from the users table
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('jira_email')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 });
  }

  if (!profile?.jira_email) {
    return NextResponse.json(
      { error: 'No Jira email configured. Please add your Jira email in Settings.' },
      { status: 400 },
    );
  }

  const tickets = await fetchAssignedTickets(profile.jira_email);
  return NextResponse.json({ tickets, total: tickets.length });
}
