import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { AgentStep } from './types';
import { replanOnError } from './agent-planner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionLogEntry {
  stepNumber: number;
  actionType: string;
  description: string;
  url: string;
  result?: string;
  error?: string;
  timestamp: string;
}

interface StepMeta {
  actionType: string;
  selector?: string;
  value?: string;
  isSensitive: boolean;
}

function parseMeta(step: AgentStep): StepMeta {
  try {
    return JSON.parse(step.tabInfo?.favicon ?? '{}') as StepMeta;
  } catch {
    return { actionType: step.tabInfo?.title ?? 'navigate', isSensitive: false };
  }
}

// ---------------------------------------------------------------------------
// BrowserAgent
// ---------------------------------------------------------------------------

export class BrowserAgent {
  private sessionId: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private actionLog: ActionLogEntry[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // ---------------------------------------------------------------------------

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: false, slowMo: 300 });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    this.page = await this.context.newPage();
    console.log(`[BrowserAgent] Session ${this.sessionId} launched`);
  }

  // ---------------------------------------------------------------------------

  async executeStep(
    step: AgentStep,
    onProgress: (step: AgentStep) => void,
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    const meta = parseMeta(step);
    const page = this.page!;

    // Sensitive steps pause for approval — caller must handle
    if (meta.isSensitive) {
      const waiting: AgentStep = { ...step, status: 'awaiting-approval' };
      onProgress(waiting);
      return { success: false, error: 'awaiting-approval' };
    }

    const inProgress: AgentStep = { ...step, status: 'in-progress' };
    onProgress(inProgress);

    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const timeout = 5000 + attempt * 5000; // 5s, 10s, 15s
      try {
        let result: string | undefined;

        switch (meta.actionType) {
          case 'navigate':
            await page.goto(step.url || 'about:blank', {
              waitUntil: 'domcontentloaded',
              timeout: 15_000,
            });
            break;

          case 'click':
          case 'submit':
            await page.click(meta.selector!, { timeout });
            break;

          case 'fill':
            await page.fill(meta.selector!, meta.value ?? '', { timeout });
            break;

          case 'extract':
            result = (await page.textContent(meta.selector!, { timeout })) ?? '';
            break;

          case 'screenshot':
            result = await this.takeScreenshot();
            break;

          case 'wait': {
            const ms = parseInt(meta.value ?? '1000', 10);
            await page.waitForTimeout(ms);
            break;
          }

          default:
            throw new Error(`Unknown actionType: ${meta.actionType}`);
        }

        const done: AgentStep = {
          ...step,
          status: 'done',
          screenshot: meta.actionType === 'screenshot' ? result : undefined,
        };
        onProgress(done);

        this.actionLog.push({
          stepNumber: step.stepNumber,
          actionType: meta.actionType,
          description: step.description,
          url: step.url,
          result,
          timestamp: new Date().toISOString(),
        });

        return { success: true, result };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < 2) {
          await page.waitForTimeout(1000);
        }
      }
    }

    const errStep: AgentStep = { ...step, status: 'error' };
    onProgress(errStep);

    this.actionLog.push({
      stepNumber: step.stepNumber,
      actionType: meta.actionType,
      description: step.description,
      url: step.url,
      error: lastError,
      timestamp: new Date().toISOString(),
    });

    return { success: false, error: lastError };
  }

  // ---------------------------------------------------------------------------

  async executePlan(
    steps: AgentStep[],
    onProgress: (step: AgentStep) => void,
    onPermissionNeeded: (step: AgentStep) => Promise<boolean>,
  ): Promise<{ completed: boolean; actionLog: ActionLogEntry[] }> {
    let currentSteps = [...steps];
    let i = 0;

    while (i < currentSteps.length) {
      const step = currentSteps[i];
      const meta = parseMeta(step);

      if (meta.isSensitive) {
        // Signal awaiting-approval
        onProgress({ ...step, status: 'awaiting-approval' });
        const approved = await onPermissionNeeded(step);

        if (!approved) {
          onProgress({ ...step, status: 'error' });
          this.actionLog.push({
            stepNumber: step.stepNumber,
            actionType: meta.actionType,
            description: step.description,
            url: step.url,
            error: 'User denied permission',
            timestamp: new Date().toISOString(),
          });
          i++;
          continue;
        }

        // Clear isSensitive flag so executeStep runs it
        const approvedMeta: StepMeta = { ...meta, isSensitive: false };
        const approvedStep: AgentStep = {
          ...step,
          tabInfo: {
            title: step.tabInfo?.title ?? '',
            favicon: JSON.stringify(approvedMeta),
          },
        };
        currentSteps[i] = approvedStep;
      }

      const { success, error } = await this.executeStep(currentSteps[i], onProgress);

      if (!success && error !== 'awaiting-approval') {
        const remaining = currentSteps.slice(i + 1);
        if (remaining.length > 0) {
          const replanned = await replanOnError(currentSteps[i], error ?? 'Unknown error', remaining);
          currentSteps = [...currentSteps.slice(0, i + 1), ...replanned];
        }
      }

      i++;
    }

    return { completed: true, actionLog: this.actionLog };
  }

  // ---------------------------------------------------------------------------

  async takeScreenshot(): Promise<string> {
    const buf = await this.page!.screenshot({ type: 'png' });
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    console.log(`[BrowserAgent] Session ${this.sessionId} closed`);
  }

  getActionLog(): ActionLogEntry[] {
    return this.actionLog;
  }
}
