import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { completeTicket, transitionTicket, addComment } from '@/lib/jira';

interface UpdateBody {
  ticketKey: string;
  action: 'complete' | 'transition';
  transitionName?: string;
  comment?: string;
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ticketKey, action, transitionName, comment } = body;

  if (!ticketKey || !action) {
    return NextResponse.json({ error: 'ticketKey and action are required' }, { status: 400 });
  }

  let result: Record<string, unknown>;

  if (action === 'complete') {
    const summary = comment ?? 'Task completed via DevPriority';
    result = await completeTicket(ticketKey, summary);
  } else if (action === 'transition') {
    if (!transitionName) {
      return NextResponse.json({ error: 'transitionName is required for transition action' }, { status: 400 });
    }
    const transitioned = await transitionTicket(ticketKey, transitionName);
    let commented = false;
    if (comment) {
      commented = await addComment(ticketKey, comment);
    }
    result = { transitioned, commented };
  } else {
    return NextResponse.json({ error: 'action must be "complete" or "transition"' }, { status: 400 });
  }

  // Log to notifications table
  await supabase.from('notifications').insert({
    user_id: user.id,
    type: 'jira',
    payload: { ticketKey, action, transitionName, comment, result },
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({ ticketKey, action, result });
}
