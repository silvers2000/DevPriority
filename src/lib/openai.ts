import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey });
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// streamChatResponse
// ---------------------------------------------------------------------------

export async function streamChatResponse(
  messages: OpenAIMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  const openai = getClient();
  let fullText = '';
  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] [OpenAI] streamChatResponse start model=gpt-4o messages=${messages.length}`);

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      stream: true,
      messages,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }
    console.log(`[${new Date().toISOString()}] [OpenAI] streamChatResponse done ${Date.now() - t0}ms chars=${fullText.length}`);
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again shortly.');
      }
      if (err.status === 401) {
        throw new Error('Invalid OpenAI API key. Please check your configuration.');
      }
      throw new Error(`OpenAI API error ${err.status}: ${err.message}`);
    }
    throw err;
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// classifyIntent
// ---------------------------------------------------------------------------

export type Intent = 'chat' | 'take-control' | 'digest' | 'jira-action' | 'create-ticket';

export type JiraActionType = 'set-priority' | 'set-due-date' | 'set-status' | 'close';

export interface JiraAction {
  ticketKey: string;
  action: JiraActionType;
  value: string;
}

export interface CreateTicketIntent {
  summary: string;
  description?: string;
  priority?: string;
  dueDate?: string; // YYYY-MM-DD
}

interface IntentResult {
  intent: Intent;
  ticketKey: string | null;
  jiraAction?: JiraAction;
  createTicket?: CreateTicketIntent;
}

export async function classifyIntent(
  userMessage: string,
  ticketContext?: string,
): Promise<{ intent: Intent; jiraAction?: JiraAction; createTicket?: CreateTicketIntent }> {
  try {
    const openai = getClient();

    const systemPrompt = `You classify a developer's message into one of five intents.

Respond with ONLY valid JSON:
{
  "intent": "chat|take-control|digest|jira-action|create-ticket",
  "ticketKey": "PROJ-123 or null",
  "jiraAction": null or {"ticketKey":"PDM-5","action":"set-priority|set-due-date|set-status|close","value":"High|2026-03-20|Done"},
  "createTicket": null or {"summary":"...","description":"...","priority":"High|Medium|Low|Critical","dueDate":"YYYY-MM-DD or null"}
}

Intent rules:
- "create-ticket": user wants to CREATE a new Jira ticket. Triggers on: "create a ticket", "add a task", "make a new ticket", "log a bug", "create an issue". Extract summary, optional description, optional priority, optional due date.
- "jira-action": user wants to UPDATE an existing ticket field. Triggers on: "change priority", "set priority", "update due date", "set due date", "close ticket", "mark as done".
  - action="set-priority": value = "High"|"Medium"|"Low"|"Critical"
  - action="set-due-date": value = YYYY-MM-DD
  - action="set-status"/"close": value = "Done"|"In Progress"|"To Do"
- "take-control": user wants the browser agent for complex multi-step tasks on any website
- "digest": "what should I work on", daily digest, morning briefing
- "chat": everything else

Today's date: ${new Date().toISOString().slice(0, 10)}
${ticketContext ? `Ticket context:\n${ticketContext}` : ''}`;

    const t0 = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    });
    console.log(`[${new Date().toISOString()}] [OpenAI] classifyIntent ${Date.now() - t0}ms tokens=${response.usage?.total_tokens ?? '?'}`);

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as IntentResult;
    const intent = parsed.intent;

    if (intent === 'create-ticket' && parsed.createTicket?.summary) {
      return { intent: 'create-ticket', createTicket: parsed.createTicket };
    }
    if (intent === 'jira-action' && parsed.jiraAction?.ticketKey && parsed.jiraAction?.action) {
      return { intent: 'jira-action', jiraAction: parsed.jiraAction };
    }
    if (intent === 'take-control' || intent === 'digest') {
      return { intent };
    }
    return { intent: 'chat' };
  } catch (err) {
    console.error('[OpenAI] classifyIntent error:', err instanceof Error ? err.message : err);
    return { intent: 'chat' };
  }
}
