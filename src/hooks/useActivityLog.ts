import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityAction = 'REGISTER' | 'EDIT' | 'FORWARD' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'UPDATE' | 'SECURITY_ALERT';

export interface ActivityLogEntry {
  id: string;
  user_role: string;
  user_name: string;
  action: ActivityAction;
  record_id: string | null;
  diary_number: string | null;
  receiving_number: string | null;
  subject: string | null;
  details: Record<string, any>;
  session_id: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session ID — unique per browser tab/session
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'kwsb_session_id';

export function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logging function — non-blocking, fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────

export async function logActivity(params: {
  userRole: string;
  userName: string;
  action: ActivityAction;
  recordId?: string;
  diaryNumber?: string;
  receivingNumber?: string;
  subject?: string;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    const payload = {
      user_role: params.userRole,
      user_name: params.userName,
      action: params.action,
      record_id: params.recordId || null,
      diary_number: params.diaryNumber || null,
      receiving_number: params.receivingNumber || null,
      subject: params.subject || null,
      details: params.details || {},
      session_id: getSessionId(),
    };

    await supabase.from('activity_log' as any).insert(payload);
  } catch (err) {
    // Silent fail — activity logging should never break the app
    console.warn('[ActivityLog] Failed to log activity:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helpers (used by ActivityLog page)
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityFilters {
  userRole?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ActivityFetchResult {
  data: ActivityLogEntry[];
  total: number;
}

export async function fetchActivityLogs(filters: ActivityFilters = {}): Promise<ActivityFetchResult> {
  const pageSize = filters.pageSize || 50;
  const page = filters.page || 0;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('activity_log' as any)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.userRole && filters.userRole !== 'all') {
    query = query.eq('user_role', filters.userRole);
  }
  if (filters.action && filters.action !== 'all') {
    query = query.eq('action', filters.action);
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
  }
  if (filters.dateTo) {
    query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
  }
  if (filters.search) {
    query = query.or(
      `diary_number.ilike.%${filters.search}%,receiving_number.ilike.%${filters.search}%,subject.ilike.%${filters.search}%,user_name.ilike.%${filters.search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('[ActivityLog] Fetch error:', error);
    return { data: [], total: 0 };
  }

  return {
    data: (data || []) as ActivityLogEntry[],
    total: count || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// User stats — per-user action counts
// ─────────────────────────────────────────────────────────────────────────────

export interface UserStats {
  user_role: string;
  user_name: string;
  total: number;
  registers: number;
  edits: number;
  forwards: number;
  deletes: number;
  last_active: string;
  is_online: boolean;
}

export async function fetchUserStats(): Promise<UserStats[]> {
  try {
    const { data, error } = await supabase
      .from('activity_log' as any)
      .select('user_role, user_name, action, created_at')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const statsMap = new Map<string, UserStats>();
    const now = Date.now();

    for (const row of data as any[]) {
      const key = row.user_role;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          user_role: row.user_role,
          user_name: row.user_name,
          total: 0,
          registers: 0,
          edits: 0,
          forwards: 0,
          deletes: 0,
          last_active: row.created_at,
          is_online: false,
        });
      }

      const s = statsMap.get(key)!;
      s.total++;
      if (row.action === 'REGISTER') s.registers++;
      if (row.action === 'EDIT') s.edits++;
      if (row.action === 'FORWARD') s.forwards++;
      if (row.action === 'DELETE') s.deletes++;

      // Consider "online" if last activity within 15 minutes
      const timeDiff = now - new Date(row.created_at).getTime();
      if (timeDiff < 15 * 60 * 1000) {
        s.is_online = true;
      }

      // Track latest activity
      if (new Date(row.created_at) > new Date(s.last_active)) {
        s.last_active = row.created_at;
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
  } catch (err) {
    console.error('[ActivityLog] Stats error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Online users — who logged in recently (last 15 min activity)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchOnlineUsers(): Promise<{ user_role: string; user_name: string; last_action: string; last_time: string }[]> {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('activity_log' as any)
      .select('user_role, user_name, action, created_at')
      .gte('created_at', fifteenMinAgo)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    // Unique users — latest action only
    const seen = new Map<string, any>();
    for (const row of data as any[]) {
      if (!seen.has(row.user_role)) {
        seen.set(row.user_role, {
          user_role: row.user_role,
          user_name: row.user_name,
          last_action: row.action,
          last_time: row.created_at,
        });
      }
    }

    return Array.from(seen.values());
  } catch (err) {
    console.error('[ActivityLog] Online users error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hourly Activity Stats (Last 24 Hours)
// ─────────────────────────────────────────────────────────────────────────────

export interface HourlyActivityStat {
  hour: string; // "14:00"
  count: number;
}

export async function fetchHourlyActivityStats(): Promise<HourlyActivityStat[]> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('activity_log' as any)
      .select('created_at')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    // Initialize the last 24 hours with 0 count
    const hourlyMap = new Map<string, number>();
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourKey = `${d.getHours().toString().padStart(2, '0')}:00`;
      hourlyMap.set(hourKey, 0);
    }

    // Group logs by hour
    for (const row of data as any[]) {
      const date = new Date(row.created_at);
      const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`;
      if (hourlyMap.has(hourKey)) {
        hourlyMap.set(hourKey, hourlyMap.get(hourKey)! + 1);
      }
    }

    return Array.from(hourlyMap.entries()).map(([hour, count]) => ({ hour, count }));
  } catch (err) {
    console.error('[ActivityLog] Hourly stats error:', err);
    return [];
  }
}
