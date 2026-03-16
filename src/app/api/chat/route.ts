import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAssignedTickets, updateTicketPriority, updateTicketDueDate, transitionTicket, createTicket } from '@/lib/jira';
import { fetchUserChannels, fetchRecentMessages } from '@/lib/slack';
import { buildContext, serializeForLLM } from '@/lib/context-builder';
import { getSystemPrompt, getChatMessages } from '@/lib/prompts';
import { streamChatResponse, classifyIntent } from '@/lib/openai';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { ChatMessage } from '@/lib/types';

interface ChatBody {
  message: string;
  conversationHistory: ChatMessage[];
}

export async function POST(request: NextRequest) {
  // Auth
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Parse body
  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Rate limit
  const { allowed, retryAfterMs } = checkRateLimit(user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many requests. Please wait ${Math.ceil(retryAfterMs / 1000)}s before trying again.` },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  const { message, conversationHistory = [] } = body;
  // Sanitize: trim, max length, strip null bytes
  const sanitizedMessage = (message ?? '').replace(/\0/g, '').trim().slice(0, 2000);
  if (!sanitizedMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // User profile
  const { data: profile } = await supabase
    .from('users')
    .select('jira_email, slack_user_id, display_name')
    .eq('id', user.id)
    .single();

  const developerName = profile?.display_name ?? user.email ?? 'Developer';

  // Fetch Jira + Slack in parallel — graceful fallback if not configured
  const t0 = Date.now();
  const [tickets, slackMessages] = await Promise.all([
    profile?.jira_email
      ? fetchAssignedTickets(profile.jira_email).catch(() => [])
      : Promise.resolve([]),
    profile?.slack_user_id
      ? fetchUserChannels(profile.slack_user_id)
          .then((channels) =>
            channels.length > 0
              ? fetchRecentMessages(channels.map((c) => c.id)).catch(() => [])
              : [],
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  console.log(`[${new Date().toISOString()}] [Chat] context fetch ${Date.now() - t0}ms tickets=${tickets.length} slack=${slackMessages.length} user=${user.id.slice(0, 8)}`);

  // Build enriched context
  const enrichedTickets = buildContext(tickets, slackMessages);
  const context = serializeForLLM(enrichedTickets, sanitizedMessage, slackMessages);

  // Classify intent
  const { intent, jiraAction, createTicket: createTicketIntent } = await classifyIntent(sanitizedMessage, context.slice(0, 500));

  // Create-ticket branch — create a new Jira ticket via API
  if (intent === 'create-ticket' && createTicketIntent) {
    const created = await createTicket(createTicketIntent);
    const encoder = new TextEncoder();
    const msg = created
      ? `✅ Created **[${created.key}](${created.url})** — "${createTicketIntent.summary}"${createTicketIntent.priority ? ` · Priority: **${createTicketIntent.priority}**` : ''}${createTicketIntent.dueDate ? ` · Due: **${createTicketIntent.dueDate}**` : ''}`
      : `❌ Failed to create ticket. Check that your Jira project key and API token are correct.`;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode(msg)); controller.close(); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  // Jira-action branch — direct API call, no browser needed
  if (intent === 'jira-action' && jiraAction) {
    const { ticketKey, action, value } = jiraAction;
    let success = false;
    let confirmMsg = '';

    if (action === 'set-priority') {
      success = await updateTicketPriority(ticketKey, value);
      confirmMsg = success
        ? `✅ **${ticketKey}** priority updated to **${value}**`
        : `❌ Failed to update priority for **${ticketKey}**. Check that the priority name is valid (Critical, High, Medium, Low).`;
    } else if (action === 'set-due-date') {
      success = await updateTicketDueDate(ticketKey, value);
      confirmMsg = success
        ? `✅ **${ticketKey}** due date set to **${value}**`
        : `❌ Failed to update due date for **${ticketKey}**.`;
    } else if (action === 'set-status' || action === 'close') {
      const statusName = action === 'close' ? 'Done' : value;
      success = await transitionTicket(ticketKey, statusName);
      confirmMsg = success
        ? `✅ **${ticketKey}** status changed to **${statusName}**`
        : `❌ Failed to transition **${ticketKey}** to "${statusName}". Available transitions may differ — try "Done", "In Progress", or "To Do".`;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(confirmMsg));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  // Take-control branch — return JSON, agent handled separately
  if (intent === 'take-control') {
    const ticketMatch = sanitizedMessage.match(/[A-Z]+-\d+/);
    const ticketKey = ticketMatch?.[0] ?? null;
    return NextResponse.json({
      type: 'take-control',
      ticketKey,
      message: ticketKey
        ? `I'll take control of **${ticketKey}**. Starting browser agent...`
        : "I'll take control of this task. Starting browser agent...",
    });
  }

  // Streaming response
  const systemPrompt = getSystemPrompt(developerName);

  // Append the current user message to history for context building
  const historyWithCurrent: ChatMessage[] = [
    ...conversationHistory,
    {
      id: 'current',
      role: 'user' as const,
      content: sanitizedMessage,
      timestamp: new Date(),
    },
  ];

  const messages = getChatMessages(systemPrompt, context, historyWithCurrent);

  // Graceful note if integrations are missing
  if (!profile?.jira_email && !profile?.slack_user_id) {
    const note = '\n\n> ⚠️ No Jira or Slack integrations configured. Add your credentials in Settings to get personalized prioritization.';
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') lastMsg.content += note;
  } else if (!profile?.jira_email) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') lastMsg.content += '\n\n> ⚠️ Jira not connected. Add your Jira email in Settings.';
  } else if (!profile?.slack_user_id) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') lastMsg.content += '\n\n> ⚠️ Slack not connected. Add your Slack user ID in Settings.';
  }

  try {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamChatResponse(messages, (chunk) => {
            controller.enqueue(encoder.encode(chunk));
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'An error occurred';
          controller.enqueue(encoder.encode(`\n\n❌ ${errMsg}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Failed to generate response';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
