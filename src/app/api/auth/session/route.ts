import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: { session } } = await supabase.auth.getSession();

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    session: {
      expiresAt: session?.expires_at,
    },
    device: {
      userAgent: request.headers.get('user-agent'),
      platform: request.headers.get('sec-ch-ua-platform'),
    },
  });
}
