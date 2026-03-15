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

type Intent = 'chat' | 'take-control' | 'digest';

interface IntentResult {
  intent: Intent;
  ticketKey: string | null;
}

export async function classifyIntent(
  userMessage: string,
  ticketContext?: string,
): Promise<Intent> {
  try {
    const openai = getClient();

    const systemPrompt = `You classify a developer's message into one of three intents.

Respond with ONLY valid JSON in this exact format: {"intent": "chat|take-control|digest", "ticketKey": "PROJ-123 or null"}

Intent rules:
- "take-control": message contains patterns like "take control", "handle this", "do this for me", "execute", "complete this", "fix it for me", "just do it", combined with a ticket reference (e.g. PROJ-123) OR a clear task description
- "digest": message asks for a daily digest, morning briefing, priority overview, "what should I work on", "what's on my plate"
- "chat": everything else — questions, analysis requests, conversations

${ticketContext ? `Ticket context for reference:\n${ticketContext}` : ''}`;

    const t0 = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 64,
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

    if (intent === 'take-control' || intent === 'digest' || intent === 'chat') {
      return intent;
    }
    return 'chat';
  } catch (err) {
    // On any failure, fall back to 'chat' — don't block the user
    console.error('[OpenAI] classifyIntent error:', err instanceof Error ? err.message : err);
    return 'chat';
  }
}
