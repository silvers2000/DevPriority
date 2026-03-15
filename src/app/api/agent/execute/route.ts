import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAssignedTickets } from '@/lib/jira';
import { buildContext } from '@/lib/context-builder';
import { planBrowserActions } from '@/lib/agent-planner';
import { BrowserAgent } from '@/lib/browser-agent';
import { agentSessions } from '@/lib/agent-sessions';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { EnrichedTicket } from '@/lib/types';

interface ExecuteBody {
  ticketKey: string;
  taskDescription?: string;
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: ExecuteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Rate limit (separate bucket from /api/chat)
  const { allowed, retryAfterMs } = checkRateLimit(`agent:${user.id}`);
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many agent requests. Please wait ${Math.ceil(retryAfterMs / 1000)}s.` },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  // Sanitize ticketKey — only allow alphanumeric, hyphen, underscore (e.g. PROJ-123)
  const rawKey = (body.ticketKey ?? '').trim();
  const ticketKey = /^[A-Za-z0-9_-]{1,32}$/.test(rawKey) ? rawKey.toUpperCase() : '';
  if (!ticketKey) {
    return NextResponse.json({ error: 'ticketKey is required and must match PROJ-123 format' }, { status: 400 });
  }

  // Sanitize taskDescription
  const taskDescription = (body.taskDescription ?? '').replace(/\0/g, '').trim().slice(0, 500) || undefined;

  // Load user profile for jira_email
  const { data: profile } = await supabase
    .from('users')
    .select('jira_email')
    .eq('id', user.id)
    .single();

  // Fetch ticket + build enriched context
  let enrichedTicket: EnrichedTicket | null = null;
  if (profile?.jira_email) {
    const tickets = await fetchAssignedTickets(profile.jira_email).catch(() => []);
    const enriched = buildContext(tickets, []);
    enrichedTicket = enriched.find((t) => t.key === ticketKey) ?? null;
  }

  // Fallback minimal ticket if not found in Jira
  if (!enrichedTicket) {
    enrichedTicket = {
      key: ticketKey,
      summary: taskDescription ?? `Task ${ticketKey}`,
      description: '',
      priority: { name: 'Medium', id: '' },
      status: { name: 'In Progress', id: '' },
      assignee: null,
      dueDate: null,
      storyPoints: null,
      comments: [],
      linkedIssues: [],
      slackContext: [],
      urgencyScore: 50,
      slackMentions: 0,
      priorityReason: 'Manual execution requested',
    };
  }

  const task = taskDescription ?? `Complete Jira ticket ${ticketKey}: ${enrichedTicket.summary}`;

  console.log(`[${new Date().toISOString()}] [Agent] execute ticketKey=${ticketKey} user=${user.id.slice(0, 8)}`);

  // Plan steps
  const steps = await planBrowserActions(task, enrichedTicket);

  // Create session
  const sessionId = uuidv4();
  const agent = new BrowserAgent(sessionId);

  agentSessions.set(sessionId, {
    sessionId,
    userId: user.id,
    ticketKey,
    steps,
    currentStep: 0,
    isComplete: false,
    isWaitingApproval: false,
    awaitingStep: null,
    agent,
    started: false,
  });

  return NextResponse.json({ sessionId, steps });
}
