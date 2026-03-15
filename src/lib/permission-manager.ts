import { createAdminClient } from './supabase-server';
import type { AgentPermission } from './types';

type PermissionValue = 'once' | 'always' | 'never';

export async function checkPermission(
  userId: string,
  actionType: string,
): Promise<PermissionValue | 'ask'> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('permissions')
      .select('permission')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .maybeSingle();

    if (error || !data) return 'ask';

    const p = data.permission as PermissionValue;
    if (p === 'always' || p === 'never') return p;
    return 'ask';
  } catch {
    return 'ask';
  }
}

export async function savePermission(
  userId: string,
  actionType: string,
  permission: AgentPermission['permission'],
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('permissions').upsert(
      {
        user_id: userId,
        action_type: actionType,
        permission,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,action_type' },
    );
  } catch (err) {
    console.error('[PermissionManager] savePermission error:', err instanceof Error ? err.message : err);
  }
}
