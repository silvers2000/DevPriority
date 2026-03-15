import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAssignedTickets } from '@/lib/jira';
import { fetchUserChannels, fetchRecentMessages } from '@/lib/slack';
import { buildContext, serializeForLLM } from '@/lib/context-builder';
import { getSystemPrompt } from '@/lib/prompts';
import OpenAI from 'openai';

const DIGEST_QUESTION = `Generate a comprehensive daily digest for today. Include:
1. **Priority task list** — ranked by urgency with reasoning
2. **What changed since yesterday** — new Slack mentions, updated tickets, approaching deadlines
3. **Key Slack discussions** — threads that need your attention
4. **Suggested day plan** — broken into time blocks (morning, afternoon, end-of-day)
5. **Blockers to resolve** — anything preventing progress

Be specific and actionable. Use the actual ticket keys and Slack channels from the context.`;

export async function GET() {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('jira_email, slack_user_id, display_name')
    .eq('id', user.id)
    .single();

  const developerName = profile?.display_name ?? user.email ?? 'Developer';

  const [tickets, slackMessages] = await Promise.all([
    profile?.jira_email
      ? fetchAssignedTickets(profile.jira_email).catch(() => [])
      : Promise.resolve([]),
    profile?.slack_user_id
      ? fetchUserChannels(profile.slack_user_id)
          .then((channels) =>
            channels.length > 0
              ? fetchRecentMessages(channels.map((c) => c.id), 1).catch(() => [])
              : [],
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const enrichedTickets = buildContext(tickets, slackMessages);
  const context = serializeForLLM(enrichedTickets, DIGEST_QUESTION);

  const systemPrompt = getSystemPrompt(developerName);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `[CURRENT CONTEXT]\n${context}\n\n[USER QUESTION]\n${DIGEST_QUESTION}`,
        },
      ],
    });

    const digest = completion.choices[0]?.message?.content ?? 'No digest generated.';

    // Store in Supabase
    await supabase.from('digests').insert({
      user_id: user.id,
      ticket_snapshot: enrichedTickets,
      summary_text: digest,
    });

    return NextResponse.json({ digest, ticketCount: enrichedTickets.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate digest';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
