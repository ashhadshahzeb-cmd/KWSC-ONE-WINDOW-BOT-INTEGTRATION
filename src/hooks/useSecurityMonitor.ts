import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// IP Address Fetcher — uses free public API, silent fail
// ─────────────────────────────────────────────────────────────────────────────

let cachedIp: string | null = null;

export async function getUserIP(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    cachedIp = json.ip || 'unknown';
    return cachedIp!;
  } catch {
    return 'unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Alert Types
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityAlertType =
  | 'DELETE_BURST'       // 3+ deletes in 1 hour
  | 'RAPID_LOGIN'        // Same user logged in from different IP quickly
  | 'BRUTE_FORCE'        // Multiple failed logins (tracked via flag in details)
  | 'OFF_HOURS_ACCESS';  // Login outside 8AM-6PM PKT

export interface SecurityAlert {
  type: SecurityAlertType;
  severity: 'HIGH' | 'CRITICAL';
  user_role: string;
  user_name: string;
  description: string;
  details: Record<string, any>;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log a security alert to activity_log with action='SECURITY_ALERT'
// AND broadcast via Supabase Realtime to admin
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerSecurityAlert(alert: SecurityAlert): Promise<void> {
  try {
    // 1. Log to activity_log table
    await supabase.from('activity_log' as any).insert({
      user_role: alert.user_role,
      user_name: alert.user_name,
      action: 'SECURITY_ALERT' as any,
      subject: `🚨 ${alert.type}: ${alert.description}`,
      details: {
        alert_type: alert.type,
        severity: alert.severity,
        description: alert.description,
        ip: alert.details.ip || 'unknown',
        timestamp: alert.timestamp,
        ...alert.details,
      },
    });

    // 2. Broadcast to admin channel (realtime)
    await supabase.channel('public:security_alerts').send({
      type: 'broadcast',
      event: 'security_alert',
      payload: alert,
    });
  } catch (err) {
    console.warn('[SecurityMonitor] Failed to trigger alert:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check DELETE Burst — if user made 3+ deletes in last 60 minutes
// Call this after every DELETE action
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDeleteBurst(userRole: string, userName: string): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from('activity_log' as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_role', userRole)
      .eq('action', 'DELETE')
      .gte('created_at', oneHourAgo);

    if ((count || 0) >= 3) {
      const ip = await getUserIP();
      await triggerSecurityAlert({
        type: 'DELETE_BURST',
        severity: 'CRITICAL',
        user_role: userRole,
        user_name: userName,
        description: `${userName} ne 1 ghante mein ${count} records delete kiye`,
        details: { count, ip, window: '60 minutes' },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('[SecurityMonitor] Delete burst check failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check Off-Hours Access (outside 8AM–6PM PKT = UTC+5)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkOffHoursAccess(userRole: string, userName: string, ip: string): Promise<void> {
  try {
    const nowPKT = new Date(Date.now() + 5 * 60 * 60 * 1000); // Convert to PKT
    const hour = nowPKT.getUTCHours(); // 0-23 in PKT

    // Off-hours: before 8 AM or after 7 PM PKT
    if (hour < 8 || hour >= 19) {
      await triggerSecurityAlert({
        type: 'OFF_HOURS_ACCESS',
        severity: 'HIGH',
        user_role: userRole,
        user_name: userName,
        description: `${userName} ne off-hours mein login kiya (PKT ${hour}:00)`,
        details: { ip, pkt_hour: hour },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('[SecurityMonitor] Off-hours check failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useSecurityAlerts React Hook — for AdminConfig / ActivityLog pages
// Subscribes to realtime security alert broadcasts
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export function useSecurityAlerts() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel('public:security_alerts')
      .on('broadcast', { event: 'security_alert' }, (payload) => {
        const alert = payload.payload as SecurityAlert;
        setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { alerts };
}
