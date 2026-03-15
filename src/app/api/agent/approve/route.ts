import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { agentSessions } from '@/lib/agent-sessions';
import { savePermission } from '@/lib/permission-manager';

interface ApproveBody {
  sessionId: string;
  approved: boolean;
  remember?: 'once' | 'always' | 'never';
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: ApproveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, approved, remember } = body;
  if (!sessionId || approved === undefined) {
    return NextResponse.json({ error: 'sessionId and approved are required' }, { status: 400 });
  }

  const session = agentSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!session.resolveApproval) {
    return NextResponse.json({ error: 'No pending approval for this session' }, { status: 400 });
  }

  // Optionally persist the permission preference
  if (remember && remember !== 'once' && session.awaitingStep) {
    const actionType = session.awaitingStep.tabInfo?.title ?? 'unknown';
    await savePermission(user.id, actionType, remember);
  }

  // Resolve the pending promise in browser-agent.ts
  session.resolveApproval(approved);
  session.resolveApproval = undefined;
  session.isWaitingApproval = false;

  return NextResponse.json({ success: true, approved });
}
