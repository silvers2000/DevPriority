import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { agentSessions } from '@/lib/agent-sessions';
import { handleTaskCompletion } from '@/lib/post-execution';
import type { AgentStep } from '@/lib/types';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const session = agentSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // First poll — kick off execution in background
  if (!session.started) {
    session.started = true;

    const onProgress = (step: AgentStep) => {
      const idx = session.steps.findIndex((s) => s.stepNumber === step.stepNumber);
      if (idx !== -1) session.steps[idx] = step;
      session.currentStep = step.stepNumber;

      if (step.status === 'awaiting-approval') {
        session.isWaitingApproval = true;
        session.awaitingStep = step;
      } else if (session.awaitingStep?.stepNumber === step.stepNumber) {
        session.isWaitingApproval = false;
        session.awaitingStep = null;
      }
    };

    const onPermissionNeeded = (step: AgentStep): Promise<boolean> => {
      session.isWaitingApproval = true;
      session.awaitingStep = step;
      return new Promise<boolean>((resolve) => {
        session.resolveApproval = resolve;
      });
    };

    // Launch and run in background (fire-and-forget)
    session.agent
      .launch()
      .then(() => session.agent.executePlan(session.steps, onProgress, onPermissionNeeded))
      .then(async ({ actionLog }) => {
        session.isComplete = true;
        session.isWaitingApproval = false;

        // Kick off post-execution in background — don't block the status response
        handleTaskCompletion(session.userId, sessionId, session.ticketKey, actionLog)
          .then((result) => {
            session.postExecution = result;
          })
          .catch((err) => {
            console.error(`[PostExecution] ${sessionId} failed:`, err instanceof Error ? err.message : err);
            session.postExecution = { jiraUpdated: false, slackNotified: false, summary: '' };
          });
      })
      .catch((err) => {
        console.error(`[Agent] Session ${sessionId} error:`, err instanceof Error ? err.message : err);
        session.isComplete = true;
      })
      .finally(() => session.agent.close().catch(() => {}));
  }

  return NextResponse.json({
    sessionId,
    steps: session.steps,
    currentStep: session.currentStep,
    isComplete: session.isComplete,
    isWaitingApproval: session.isWaitingApproval,
    awaitingStep: session.awaitingStep,
    postExecution: session.postExecution ?? null,
  });
}
