import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { createAdminClient } from '@/lib/supabase-server';
import { jiraHealthCheck } from '@/lib/jira';

async function checkSlack(): Promise<'ok' | 'error'> {
  try {
    const token = process.env.SLACK_USER_TOKEN;
    if (!token) return 'error';
    const client = new WebClient(token);
    const res = await client.auth.test();
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

async function checkSupabase(): Promise<'ok' | 'error'> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('users').select('id').limit(1);
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

function checkOpenAI(): 'ok' | 'error' {
  return process.env.OPENAI_API_KEY ? 'ok' : 'error';
}

export async function GET() {
  const [jira, slack, supabase] = await Promise.all([
    jiraHealthCheck(),
    checkSlack(),
    checkSupabase(),
  ]);
  const openai = checkOpenAI();

  const status = { jira, slack, supabase, openai };
  const allOk = Object.values(status).every((s) => s === 'ok');

  return NextResponse.json(
    { status, healthy: allOk },
    { status: allOk ? 200 : 207 },
  );
}
