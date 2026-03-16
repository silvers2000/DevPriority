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

export type Intent = 'chat' | 'take-control' | 'digest' | 'jira-action';

export type JiraActionType = 'set-priority' | 'set-due-date' | 'set-status' | 'close';

export interface JiraAction {
  ticketKey: string;
  action: JiraActionType;
  value: string; // e.g. "High", "2026-03-20", "Done"
}

interface IntentResult {
  intent: Intent;
  ticketKey: string | null;
  jiraAction?: JiraAction;
}

export async function classifyIntent(
  userMessage: string,
  ticketContext?: string,
): Promise<{ intent: Intent; jiraAction?: JiraAction }> {
  try {
    const openai = getClient();

    const systemPrompt = `You classify a developer's message into one of four intents.

Respond with ONLY valid JSON:
{"intent": "chat|take-control|digest|jira-action", "ticketKey": "PROJ-123 or null", "jiraAction": null or {"ticketKey":"PDM-5","action":"set-priority|set-due-date|set-status|close","value":"High|2026-03-20|Done|null"}}

Intent rules:
- "jira-action": user wants to directly update a Jira ticket field WITHOUT browser automation. Triggers on: "change priority", "set priority", "update due date", "set due date", "change status", "close ticket", "mark as done" — these are simple field updates.
  - action="set-priority": value = priority name e.g. "High", "Medium", "Critical"
  - action="set-due-date": value = date in YYYY-MM-DD format parsed from message
  - action="set-status" or "close": value = status name e.g. "Done", "In Progress"
- "take-control": user wants the browser agent to do complex multi-step work on ANY website
- "digest": user asks for daily digest, "what should I work on", morning briefing
- "chat": everything else

Today's date: ${new Date().toISOString().slice(0, 10)}
${ticketContext ? `Ticket context:\n${ticketContext}` : ''}`;

    const t0 = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 128,
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

    if (intent === 'jira-action' && parsed.jiraAction?.ticketKey && parsed.jiraAction?.action) {
      return { intent: 'jira-action', jiraAction: parsed.jiraAction };
    }
    if (intent === 'take-control' || intent === 'digest' || intent === 'jira-action') {
      return { intent };
    }
    return { intent: 'chat' };
  } catch (err) {
    console.error('[OpenAI] classifyIntent error:', err instanceof Error ? err.message : err);
    return { intent: 'chat' };
  }
}
