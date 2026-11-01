import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Calendar,
  Clock,
  User,
  FileEdit,
  FilePlus,
  Forward,
  Trash2,
  LogIn,
  LogOut,
  Download,
  AlertCircle,
  Eye,
  BarChart3,
  Wifi,
  Printer,
  ShieldCheck,
  FileText,
  Building2,
  Image as ImageIcon,
  ExternalLink,
  Maximize2,
  X,
  Shield,
  Zap,
  Globe,
  Lock,
  Siren,
  TriangleAlert,
  ServerCrash
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppConfig } from '@/hooks/useAppConfig';
import {
  ActivityLogEntry,
  UserStats,
  HourlyActivityStat,
  fetchActivityLogs,
  fetchUserStats,
  fetchOnlineUsers,
  fetchHourlyActivityStats
} from '@/hooks/useActivityLog';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useSecurityAlerts, SecurityAlert, triggerSecurityAlert, getUserIP } from '@/hooks/useSecurityMonitor';

// ─────────────────────────────────────────────────────────────────────────────
// Processing Time helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats milliseconds into a human-readable duration string.
 * e.g. "2h 15m 30s", "45m 10s", "30s"
 */
const safeFormatDate = (dateStr: any) => {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  let d: Date;
  if (dateStr instanceof Date) {
    d = dateStr;
  } else if (typeof dateStr === 'string') {
    d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDuration = (ms: number): string => {
  if (ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

/**
 * Given the full list of logs (newest-first) and a REGISTER log entry,
 * finds the next action (FORWARD/EDIT/DELETE) on the same receiving_number
 * and returns the formatted duration string. Returns null if not found.
 */
const getProcessingTime = (logs: ActivityLogEntry[], registerLog: ActivityLogEntry): string | null => {
  if (registerLog.action !== 'REGISTER' || !registerLog.receiving_number) return null;

  // logs are ordered newest-first; REGISTER is at higher index.
  // We want entries that come AFTER the REGISTER in time (= lower index = newer).
  const regIndex = logs.findIndex(l => l.id === registerLog.id);
  if (regIndex === -1) return null;

  // Slice everything before this index (newer entries), reverse to get chronological order,
  // then find first matching action on the same file.
  const nextAction = logs
    .slice(0, regIndex)
    .reverse()
    .find(
      l =>
        l.receiving_number === registerLog.receiving_number &&
        (l.action === 'FORWARD' || l.action === 'EDIT' || l.action === 'DELETE')
    );

  if (!nextAction) return null;

  const diffMs =
    new Date(nextAction.created_at).getTime() -
    new Date(registerLog.created_at).getTime();
  return formatDuration(diffMs);
};

const DiffViewer = ({ before, after }: { before: any, after: any }) => {
  if (!before || !after) return null;

  const changes: { key: string; oldVal: string; newVal: string }[] = [];
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  allKeys.forEach(key => {
    // Skip noisy fields or internal states
    if (['history', 'file_image', 'is_dirty', 'updated_at', 'created_at'].includes(key)) return;

    const oldV = before[key];
    const newV = after[key];

    const oldStr = typeof oldV === 'object' ? JSON.stringify(oldV) : String(oldV ?? '');
    const newStr = typeof newV === 'object' ? JSON.stringify(newV) : String(newV ?? '');

    if (oldStr !== newStr) {
      changes.push({
        key: key.replace(/_/g, ' ').toUpperCase(),
        oldVal: oldStr === '' ? '(Empty)' : oldStr,
        newVal: newStr === '' ? '(Empty)' : newStr
      });
    }
  });

  if (changes.length === 0) {
    return <div className="text-white/50 text-xs italic bg-white/5 p-4 rounded-lg text-center border border-white/10">No visible changes recorded in tracked fields.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Before Column */}
      <div className="space-y-2">
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase px-3 py-1.5 rounded-t-lg flex items-center justify-between">
          <span>Before Change (Old Value)</span>
        </div>
        <ScrollArea className="h-64 bg-black/60 rounded-b-lg border border-white/5 border-t-0 p-4">
          <div className="space-y-4">
            {changes.map((c, i) => (
              <div key={`old-${i}`} className="space-y-1">
                <div className="text-[9px] text-rose-400/70 font-bold uppercase tracking-wider">{c.key}</div>
                <div className="text-xs font-mono text-rose-200 bg-rose-500/10 p-2 rounded border border-rose-500/20 break-words whitespace-pre-wrap">
                  {c.oldVal}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* After Column */}
      <div className="space-y-2">
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase px-3 py-1.5 rounded-t-lg flex items-center justify-between">
          <span>After Change (New Value)</span>
        </div>
        <ScrollArea className="h-64 bg-black/60 rounded-b-lg border border-white/5 border-t-0 p-4">
          <div className="space-y-4">
            {changes.map((c, i) => (
              <div key={`new-${i}`} className="space-y-1">
                <div className="text-[9px] text-emerald-400/70 font-bold uppercase tracking-wider">{c.key}</div>
                <div className="text-xs font-mono text-emerald-200 bg-emerald-500/10 p-2 rounded border border-emerald-500/20 break-words whitespace-pre-wrap">
                  {c.newVal}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

const PayloadViewer = ({ data }: { data: any }) => {
  if (!data) return null;
  const keys = Object.keys(data).filter(k => !['history', 'file_image', 'signature_data'].includes(k));
  
  if (keys.length === 0) {
    return <div className="text-white/50 text-xs italic bg-white/5 p-4 rounded-lg text-center border border-white/10">No structured data found.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-xl border border-white/[0.05] max-h-96 overflow-y-auto">
      {keys.map(k => (
        <div key={k} className="bg-black/20 p-2 rounded-lg border border-white/5">
          <Label className="text-[9px] text-white/40 uppercase tracking-widest block mb-1 font-bold">{k.replace(/_/g, ' ')}</Label>
          <div className="text-xs text-white/90 font-medium break-words">
            {typeof data[k] === 'object' ? JSON.stringify(data[k]) : String(data[k] || '---')}
          </div>
        </div>
      ))}
    </div>
  );
};

export default function ActivityLog() {
  const { userRole, isAdmin } = useAuth();
  const isAdminUser = userRole === 'admin' || isAdmin;
  const hasAccess = true; // Activity log visible to all users
  const { alerts: securityAlerts } = useSecurityAlerts();

  // ── Attack Demo State ──────────────────────────────────────────
  const [showAttackDemo, setShowAttackDemo] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoAlerts, setDemoAlerts] = useState<SecurityAlert[]>([]);

  // Demo attack scenarios
  const DEMO_SCENARIOS: SecurityAlert[] = [
    {
      type: 'DELETE_BURST',
      severity: 'CRITICAL',
      user_role: 'sub_cfo_1',
      user_name: 'ASST. CFO-1',
      description: 'ASST. CFO-1 deleted 7 records within 1 hour — Unusual activity detected!',
      details: { count: 7, ip: '103.14.52.88', window: '60 minutes', location: 'Karachi, PK' },
      timestamp: new Date().toISOString(),
    },
    {
      type: 'OFF_HOURS_ACCESS',
      severity: 'HIGH',
      user_role: 'entry_operator',
      user_name: 'ENTRY OPERATOR',
      description: 'ENTRY OPERATOR accessed the system at 2:15 AM (PKT) — Outside office hours!',
      details: { ip: '45.151.62.240', pkt_hour: 2, location: 'Unknown Location' },
      timestamp: new Date(Date.now() - 60000).toISOString(),
    },
    {
      type: 'BRUTE_FORCE',
      severity: 'CRITICAL',
      user_role: 'unknown',
      user_name: 'UNKNOWN USER',
      description: '12 failed login attempts detected — Brute force attack on admin@kwsb.gov.pk!',
      details: { attempts: 12, ip: '185.220.101.45', location: 'Germany (Tor Exit Node)', target_email: 'admin@kwsb.gov.pk' },
      timestamp: new Date(Date.now() - 120000).toISOString(),
    },
    {
      type: 'RAPID_LOGIN',
      severity: 'HIGH',
      user_role: 'cfo',
      user_name: 'CFO',
      description: 'CFO account logged in simultaneously from 2 different IP addresses — Possible session hijack!',
      details: { ip: '103.14.52.88', second_ip: '91.108.4.12', location: 'Karachi + Russia', gap_minutes: 2 },
      timestamp: new Date(Date.now() - 30000).toISOString(),
    },
  ];

  const handleRunAttackDemo = async () => {
    setIsDemoRunning(true);
    setDemoAlerts([]);
    setDemoStep(0);

    // Fire each scenario with a delay — dramatic effect
    for (let i = 0; i < DEMO_SCENARIOS.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i === 0 ? 500 : 1800));
      setDemoStep(i + 1);
      setDemoAlerts(prev => [DEMO_SCENARIOS[i], ...prev]);

      // Actually fire it to the real system (so WhatsApp + DB also get it)
      await triggerSecurityAlert(DEMO_SCENARIOS[i]);
    }

    setIsDemoRunning(false);
    toast.success('Attack Demo complete — Check WhatsApp for notifications!', { duration: 5000 });
  };
  
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyActivityStat[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  // New Features State
  const [isLive, setIsLive] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ActivityLogEntry | null>(null);
  const [selectedLogImage, setSelectedLogImage] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const { sections } = useAppConfig();

  // Opens image in new tab using Blob URL to prevent Chrome about:blank top-frame block
  const openInNewTab = (imgUrl: string) => {
    if (!imgUrl) return;
    if (imgUrl.startsWith('data:')) {
      try {
        const parts = imgUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, '_blank');
        if (win) {
          win.focus();
          return;
        }
      } catch (err) {
        console.warn('Blob creation error:', err);
      }
    }
    window.open(imgUrl, '_blank');
  };

  // Downloads image directly via Blob
  const handleDownloadImage = (imgUrl: string, fileName: string) => {
    if (!imgUrl) return;
    if (imgUrl.startsWith('data:')) {
      try {
        const parts = imgUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      } catch (err) {
        console.warn('Blob download error:', err);
      }
    }
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Resolve document image whenever selectedLog opens
  useEffect(() => {
    if (!selectedLog) {
      setSelectedLogImage(null);
      setIsLoadingImage(false);
      return;
    }

    // 1. Direct check in log details (REGISTER, EDIT, FORWARD payloads)
    const directImage =
      selectedLog.details?.file_image ||
      selectedLog.details?.after?.file_image ||
      selectedLog.details?.before?.file_image ||
      (Array.isArray(selectedLog.details?.history) &&
        [...selectedLog.details.history].reverse().find((h: any) => h?.file_image)?.file_image);

    if (directImage) {
      setSelectedLogImage(directImage);
      return;
    }

    // 2. Fallback: Query local Dexie and Supabase by receiving_number or diary_number
    const rNo = selectedLog.receiving_number || selectedLog.details?.receiving_number;
    const dNo = selectedLog.diary_number || selectedLog.details?.cfo_diary_number;

    if (rNo || dNo) {
      setIsLoadingImage(true);

      const tryFetch = async () => {
        try {
          // Check local Dexie first (instant)
          if (rNo) {
            const localRec = await db.records.where('receiving_number').equals(rNo).first();
            if (localRec?.file_image) {
              setSelectedLogImage(localRec.file_image);
              setIsLoadingImage(false);
              return;
            }
          }
          if (dNo) {
            const localRec = await db.records.where('cfo_diary_number').equals(dNo).first();
            if (localRec?.file_image) {
              setSelectedLogImage(localRec.file_image);
              setIsLoadingImage(false);
              return;
            }
          }

          // Query Supabase (using 'history' column which actually exists)
          let query = supabase.from('file_tracking_records').select('history');
          if (rNo) {
            query = query.eq('receiving_number', rNo);
          } else if (dNo) {
            query = query.eq('cfo_diary_number', dNo);
          }
          const { data } = await query.limit(1).maybeSingle();
          if (data && Array.isArray(data.history)) {
            const img = [...data.history].reverse().find((h: any) => h?.file_image)?.file_image;
            if (img) {
              setSelectedLogImage(img);
              setIsLoadingImage(false);
              return;
            }
          }
        } catch (e) {
          console.warn('Error fetching document image for activity log:', e);
        } finally {
          setIsLoadingImage(false);
        }
      };

      tryFetch();
    } else {
      setSelectedLogImage(null);
    }
  }, [selectedLog]);
  const [qrPrintModal, setQrPrintModal] = useState<{
    diary: string;
    receiving: string;
    subject: string;
    created_date: string;
    print_date: string;
    mark_to?: string;
    additional_mark_to?: string;
  } | null>(null);
  const [isPrintingQR, setIsPrintingQR] = useState(false);
  const [isDuplicatePrint, setIsDuplicatePrint] = useState(false);

  // Filters
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [logsRes, statsRes, onlineRes, hourlyRes] = await Promise.all([
        fetchActivityLogs({
          page,
          search,
          userRole: filterUser,
          action: filterAction,
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
          pageSize: 50
        }),
        fetchUserStats(),
        fetchOnlineUsers(),
        fetchHourlyActivityStats()
      ]);

      setLogs(logsRes.data);
      setTotalRecords(logsRes.total);
      setStats(statsRes);
      setOnlineUsers(onlineRes);
      setHourlyStats(hourlyRes);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load activity data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess) {
      loadData();
    }
  }, [page, search, filterUser, filterAction, filterDateFrom, filterDateTo, hasAccess]);

  // Supabase Realtime Subscription
  useEffect(() => {
    if (!hasAccess || !isLive) return;

    const channel = supabase.channel('public:activity_log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        const newLog = payload.new as ActivityLogEntry;
        
        // Respect current filters for live appends
        if (filterUser !== 'all' && newLog.user_role !== filterUser) return;
        if (filterAction !== 'all' && newLog.action !== filterAction) return;
        
        setLogs(prev => [newLog, ...prev]);
        setTotalRecords(prev => prev + 1);
        
        toast.info(`New activity: ${newLog.action} by ${newLog.user_name}`, {
          description: newLog.subject || 'Action performed',
          duration: 3000,
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLive, isAdminUser, filterUser, filterAction]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetchActivityLogs({
        search,
        userRole: filterUser,
        action: filterAction,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        pageSize: 10000 
      });

      if (res.data.length === 0) {
        toast.error("No records to export");
        return;
      }

      const headers = ['Date', 'Time', 'User Role', 'User Name', 'Action', 'Diary No', 'Receiving No', 'Subject', 'Details'];
      const csvContent = [
        headers.join(','),
        ...res.data.map(log => {
          const date = new Date(log.created_at);
          const detailsStr = log.details ? JSON.stringify(log.details).replace(/"/g, '""') : '';
          return [
            date.toLocaleDateString(),
            date.toLocaleTimeString(),
            `"${log.user_role}"`,
            `"${log.user_name}"`,
            log.action,
            `"${log.diary_number || ''}"`,
            `"${log.receiving_number || ''}"`,
            `"${(log.subject || '').replace(/"/g, '""')}"`,
            `"${detailsStr}"`
          ].join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `kwsc_activity_log_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success('Export successful');
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleForceLogout = (targetName: string) => {
    if (!isAdminUser) return;
    
    supabase.channel('public:admin_commands').send({
      type: 'broadcast',
      event: 'force_logout',
      payload: { targetName }
    });
    
    toast.success(`Force logout command sent to ${targetName}`);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'REGISTER': return <FilePlus className="w-4 h-4" />;
      case 'EDIT': return <FileEdit className="w-4 h-4" />;
      case 'FORWARD': return <Forward className="w-4 h-4" />;
      case 'DELETE': return <Trash2 className="w-4 h-4" />;
      case 'LOGIN': return <LogIn className="w-4 h-4" />;
      case 'LOGOUT': return <LogOut className="w-4 h-4" />;
      case 'SECURITY_ALERT': return <ShieldCheck className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getActionSeverity = (action: string) => {
    switch (action) {
      case 'DELETE': return 'critical';
      case 'SECURITY_ALERT': return 'critical';
      case 'EDIT':
      case 'FORWARD': return 'warning';
      default: return 'info';
    }
  };

  const getActionBadgeColor = (action: string) => {
    const severity = getActionSeverity(action);
    switch (severity) {
      case 'critical': return 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
      case 'warning': return 'bg-amber-50 text-amber-700 border-amber-300 font-bold';
      default: return 'bg-blue-50 text-[#1e3a8a] border-blue-200 font-bold';
    }
  };

  const getSectionName = (secId?: string) => {
    if (!secId) return 'CFO Office';
    const found = sections?.find(s => s.config_key === secId || s.id === secId);
    return found?.config_label || secId;
  };

  const handleOpenPrint = (log: ActivityLogEntry) => {
    const diary =
      log.diary_number ||
      log.details?.cfo_diary_number ||
      log.details?.diary_number ||
      log.details?.after?.cfo_diary_number ||
      log.details?.before?.cfo_diary_number ||
      '';
    const receiving =
      log.receiving_number ||
      log.details?.receiving_number ||
      log.details?.after?.receiving_number ||
      log.details?.before?.receiving_number ||
      '';

    if (!diary && !receiving) {
      toast.error('This activity is not linked to any file record.');
      return;
    }

    const subject =
      log.subject ||
      log.details?.subject ||
      log.details?.after?.subject ||
      log.details?.before?.subject ||
      'Subject Details';

    const mark_to =
      log.details?.mark_to ||
      log.details?.after?.mark_to ||
      log.details?.before?.mark_to ||
      'cfo';

    const additional_mark_to =
      log.details?.additional_mark_to ||
      log.details?.after?.additional_mark_to ||
      log.details?.before?.additional_mark_to ||
      '';

    const created_date =
      log.details?.inward_date ||
      log.details?.registration_date ||
      log.created_at;

    const print_date =
      log.details?.print_date ||
      new Date().toISOString().split('T')[0];

    setQrPrintModal({
      diary,
      receiving,
      subject,
      created_date,
      print_date,
      mark_to,
      additional_mark_to,
    });
  };

  const handlePrintQR = () => {
    if (!qrPrintModal) return;
    setIsPrintingQR(true);
    document.body.classList.add('printing-qr-ticket');
    setTimeout(() => {
      window.print();
    }, 300);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-qr-ticket');
      setIsPrintingQR(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);



  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Security Alerts Banner */}
      {securityAlerts.length > 0 && (
        <div className="space-y-2">
          {securityAlerts.slice(0, 3).map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top-2 duration-300 ${
                alert.severity === 'CRITICAL'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${alert.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${alert.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    🚨 {alert.severity}
                  </span>
                  <span className="text-xs font-bold">{alert.type.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-white/40 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs mt-1 text-white/70">{alert.description}</p>
                {alert.details?.ip && alert.details.ip !== 'unknown' && (
                  <p className="text-[10px] text-white/40 font-mono mt-0.5">IP: {alert.details.ip}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f1115]/80 p-6 rounded-[28px] border border-white/5 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-black flex items-center gap-3 text-white tracking-tighter">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            System Activity Log
          </h1>
          <p className="text-xs text-white/40 ml-14">
            Advanced monitoring, security tracking, and real-time activity streaming.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-black/20 p-2 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 px-3 py-1">
            <Wifi className={cn("w-4 h-4", isLive ? "text-emerald-400 animate-pulse" : "text-white/40")} />
            <Label htmlFor="live-mode" className="text-xs font-bold text-white uppercase tracking-wider cursor-pointer">
              Live Tail
            </Label>
            <Switch id="live-mode" checked={isLive} onCheckedChange={setIsLive} />
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <Button
            variant="outline"
            className="border-white/10 bg-white/5 text-white hover:bg-white/10 text-xs h-8"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 text-xs h-8"
            onClick={handleExport}
            disabled={isExporting || logs.length === 0}
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-2" />}
            Export
          </Button>
          {/* 🚨 Attack Demo — visible to all users for demonstration */}
          <>
            <div className="w-px h-6 bg-white/10" />
            <Button
              variant="outline"
              className="border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 text-xs h-8 font-bold animate-pulse hover:animate-none"
              onClick={() => setShowAttackDemo(true)}
            >
              <AlertCircle className="w-3.5 h-3.5 mr-2" />
              🚨 Attack Demo
              </Button>
          </>
        </div>
      </div>

      {/* 24-Hour Activity Chart */}
      <Card className="border-white/10 bg-[#09090b]/50 backdrop-blur-md overflow-hidden">
        <CardHeader className="pb-2 border-b border-white/5">
          <CardTitle className="text-sm font-black flex items-center gap-2 text-white">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            Activity Last 24 Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyStats} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="hour" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
              <RechartsTooltip 
                contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }} 
                itemStyle={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}
                labelStyle={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                formatter={(v: number) => [v, 'Actions']} 
              />
              <Area type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Stats & Online Users */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Online Users */}
          <Card className="border-white/10 bg-[#09090b]/50 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-sm font-black flex items-center gap-2 text-white">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {onlineUsers.length > 0 ? (
                <div className="space-y-3">
                  {onlineUsers.map((ou, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-white/[0.02] p-2 rounded-lg border border-white/[0.05]">
                      <div className="flex items-center gap-2 truncate">
                        <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-white/80 font-medium truncate text-xs" title={ou.user_name}>{ou.user_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-white/40 whitespace-nowrap font-mono bg-black/40 px-1.5 py-0.5 rounded">
                          {new Date(ou.last_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-5 w-5 p-0 text-rose-400/70 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                          onClick={() => handleForceLogout(ou.user_name)}
                          title="Force Logout User"
                        >
                          <LogOut className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40 text-center py-4 bg-white/[0.02] rounded-lg border border-white/[0.05]">No active sessions right now.</p>
              )}
            </CardContent>
          </Card>

          {/* User Stats Leaderboard */}
          <Card className="border-white/10 bg-[#09090b]/50 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-sm font-black flex items-center gap-2 text-white">
                <Activity className="w-4 h-4 text-sky-400" />
                Top Active Users
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <ScrollArea className="h-[400px]">
                <div className="p-4 space-y-4">
                  {stats.slice(0, 10).map((s, idx) => (
                    <div key={idx} className="space-y-2 bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white truncate pr-2">{s.user_name}</span>
                        <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/20 text-[9px] font-mono">
                          {s.total} total
                        </Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-1 flex flex-col items-center" title="Registered">
                          <span className="text-[9px] text-emerald-400 font-bold">{s.registers}</span>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-1 flex flex-col items-center" title="Forwarded">
                          <span className="text-[9px] text-blue-400 font-bold">{s.forwards}</span>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-1 flex flex-col items-center" title="Edited">
                          <span className="text-[9px] text-amber-400 font-bold">{s.edits}</span>
                        </div>
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded p-1 flex flex-col items-center" title="Deleted">
                          <span className="text-[9px] text-rose-400 font-bold">{s.deletes}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stats.length === 0 && !isLoading && (
                    <p className="text-xs text-white/40 text-center py-4 bg-white/[0.02] rounded-lg border border-white/[0.05] m-4">No user stats available.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Activity Table */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-[#09090b]/50 border border-white/5 p-3 rounded-2xl backdrop-blur-sm">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <Input
                placeholder="Search diary, subject, or user..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 bg-black/40 border-white/10 text-white h-9 text-xs rounded-xl focus:border-sky-500/50"
              />
            </div>
            
            <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9 text-xs bg-black/40 border-white/10 text-white rounded-xl">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f1115] border-white/10 text-white">
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="REGISTER">Register</SelectItem>
                <SelectItem value="FORWARD">Forward</SelectItem>
                <SelectItem value="EDIT">Edit</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
                <SelectItem value="LOGIN">Login</SelectItem>
                <SelectItem value="LOGOUT">Logout</SelectItem>
                <SelectItem value="SECURITY_ALERT">🚨 Security Alert</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterUser} onValueChange={v => { setFilterUser(v); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-9 text-xs bg-black/40 border-white/10 text-white rounded-xl">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f1115] border-white/10 text-white">
                <SelectItem value="all">All Users</SelectItem>
                {stats.map(s => (
                  <SelectItem key={s.user_role} value={s.user_role}>{s.user_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }}
                className="w-32 h-9 text-xs bg-black/40 border-white/10 text-white rounded-xl"
                title="From Date"
              />
              <span className="text-white/40 text-xs">-</span>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setPage(0); }}
                className="w-32 h-9 text-xs bg-black/40 border-white/10 text-white rounded-xl"
                title="To Date"
              />
            </div>
          </div>

          {/* Table */}
          <Card className="border-white/10 bg-[#09090b]/50 backdrop-blur-md overflow-hidden rounded-2xl">
            <CardContent className="p-0">
              {isLoading && logs.length === 0 ? (
                <div className="flex items-center justify-center py-32 text-white/40">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-white/30">
                  <Activity className="w-12 h-12 mb-4 text-white/10" />
                  <p>No activity logs found matching criteria.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-[10px] text-white/40 font-bold uppercase tracking-wider w-[120px]">Time</TableHead>
                        <TableHead className="text-[10px] text-white/40 font-bold uppercase tracking-wider w-[160px]">User</TableHead>
                        <TableHead className="text-[10px] text-white/40 font-bold uppercase tracking-wider w-[120px]">Action</TableHead>
                        <TableHead className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Context</TableHead>
                        <TableHead className="text-[10px] text-white/40 font-bold uppercase tracking-wider w-[110px]">⏱ Proc. Time</TableHead>
                        <TableHead className="text-[10px] text-white/40 font-bold uppercase tracking-wider w-[100px] text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map(log => {
                        const d = new Date(log.created_at);
                        const severity = getActionSeverity(log.action);
                        return (
                          <TableRow 
                            key={log.id} 
                            className={cn(
                              "border-white/5 group transition-colors",
                              severity === 'critical' ? "bg-rose-500/5 hover:bg-rose-500/10" : "hover:bg-white/[0.02]"
                            )}
                          >
                            <TableCell className="align-top py-4">
                              <div className="flex flex-col">
                                <span className="text-xs text-white/80 font-mono">
                                  {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </span>
                                <span className="text-[10px] text-white/40 font-mono mt-0.5">
                                  {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="align-top py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-white truncate max-w-[140px]" title={log.user_name}>
                                  {log.user_name}
                                </span>
                                <span className="text-[9px] text-white/40 font-mono mt-0.5">
                                  {log.user_role}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="align-top py-4">
                              <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 shadow-xs ${getActionBadgeColor(log.action)}`}>
                                {getActionIcon(log.action)}
                                {log.action}
                              </span>
                            </TableCell>
                            <TableCell className="align-top py-4">
                              <div className="space-y-1">
                                {(log.diary_number || log.receiving_number) && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {log.diary_number && (
                                      <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                                        D.No: {log.diary_number}
                                      </span>
                                    )}
                                    {log.receiving_number && (
                                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                        R.No: {log.receiving_number}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {log.subject ? (
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs text-white/70 font-medium truncate max-w-md" title={log.subject}>
                                      {log.subject}
                                    </p>
                                    {(() => {
                                      const rowImg =
                                        log.details?.file_image ||
                                        log.details?.after?.file_image ||
                                        (Array.isArray(log.details?.history) &&
                                          [...log.details.history].reverse().find((h: any) => h?.file_image)?.file_image);
                                      if (!rowImg) return null;
                                      return (
                                        <img
                                          src={rowImg}
                                          alt="doc"
                                          title="Attached Document Photo (Click to view full image)"
                                          className="w-5 h-5 object-cover rounded border border-teal-500/50 cursor-pointer hover:scale-150 transition-transform shrink-0 shadow-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setFullScreenImage(rowImg);
                                          }}
                                        />
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <p className="text-xs text-white/40 italic">No subject</p>
                                )}
                              </div>
                            </TableCell>
                            {/* ⏱ Time Tracking Cell */}
                            <TableCell className="align-top py-4">
                              {log.action === 'REGISTER' ? (() => {
                                const procTime = getProcessingTime(logs, log);
                                const fillMs = log.details?.form_fill_duration_ms;
                                const fillTime = typeof fillMs === 'number' ? formatDuration(fillMs) : null;
                                return (
                                  <div className="flex flex-col gap-1.5">
                                    {/* Fill Time — how long user took to fill the form */}
                                    {fillTime ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-[8px] text-amber-400/50 uppercase tracking-wider">Fill Time</span>
                                        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded w-max">
                                          ✍ {fillTime}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] text-white/20 italic">Fill: —</span>
                                    )}
                                    {/* Process Time — how long before next action */}
                                    {procTime ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-[8px] text-violet-400/50 uppercase tracking-wider">Process Time</span>
                                        <span className="text-[10px] font-mono font-bold text-violet-300 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded w-max">
                                          ⚡ {procTime}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] text-white/20 italic">Process: Pending…</span>
                                    )}
                                  </div>
                                );
                              })() : (
                                <span className="text-[10px] text-white/15">—</span>
                              )}
                            </TableCell>
                            <TableCell className="align-top py-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                                onClick={() => setSelectedLog(log)}
                                title="View Diff Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                                onClick={() => handleOpenPrint(log)}
                                title="Print Tracking Slip (QR)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            
            {/* Pagination footer */}
            {totalRecords > 0 && (
              <div className="border-t border-white/5 p-3 bg-black/20 flex items-center justify-between">
                <div className="text-[10px] text-white/40 font-mono">
                  Showing {page * 50 + 1} - {Math.min((page + 1) * 50, totalRecords)} of {totalRecords} records
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/5 border-white/10 text-white rounded-lg hover:bg-white/10"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/5 border-white/10 text-white rounded-lg hover:bg-white/10"
                    disabled={(page + 1) * 50 >= totalRecords}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* DETAILED DIFF MODAL */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl bg-[#09090b] border-white/10 text-white">
          <DialogHeader className="border-b border-white/5 pb-4">
            <DialogTitle className="text-lg font-black flex items-center gap-3">
              <Badge className={getActionBadgeColor(selectedLog?.action || '')}>
                {getActionIcon(selectedLog?.action || '')}
                <span className="ml-1">{selectedLog?.action}</span>
              </Badge>
              Activity Details
            </DialogTitle>
            <CardDescription className="text-white/40 mt-1">
              By {selectedLog?.user_name} on {selectedLog ? new Date(selectedLog.created_at).toLocaleString() : ''}
            </CardDescription>
          </DialogHeader>

          <div className="pt-4 space-y-6">
            
            {/* Context Info */}
            <div className="grid grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-xl border border-white/[0.05]">
              <div>
                <Label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Diary No</Label>
                <div className="text-sm font-mono font-bold text-sky-400">{selectedLog?.diary_number || 'N/A'}</div>
              </div>
              <div>
                <Label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Receiving No</Label>
                <div className="text-sm font-mono font-bold text-emerald-400">{selectedLog?.receiving_number || 'N/A'}</div>
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Subject</Label>
                <div className="text-sm text-white/90">{selectedLog?.subject || 'N/A'}</div>
              </div>
            </div>

            {/* Attached Document Photo Section */}
            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/[0.05] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-teal-400" />
                  <Label className="text-[10px] text-teal-300 uppercase tracking-widest font-bold">Attached Document / File Picture</Label>
                </div>
                {selectedLogImage && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-lg gap-1.5"
                      onClick={() => setFullScreenImage(selectedLogImage)}
                      title="Open Fullscreen View inside page"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Fullscreen View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs bg-white/5 hover:bg-white/10 text-white rounded-lg gap-1.5"
                      onClick={() => openInNewTab(selectedLogImage)}
                      title="Open in new browser tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-teal-400" /> New Tab
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs bg-white/5 hover:bg-white/10 text-white rounded-lg gap-1.5"
                      onClick={() => handleDownloadImage(selectedLogImage, `document-${selectedLog?.receiving_number || selectedLog?.diary_number || 'file'}.jpg`)}
                      title="Download image file"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" /> Download
                    </Button>
                  </div>
                )}
              </div>

              {isLoadingImage ? (
                <div className="flex items-center justify-center py-6 text-white/40 text-xs gap-2 bg-black/20 rounded-lg border border-white/5">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" /> Loading attached document image...
                </div>
              ) : selectedLogImage ? (
                <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center max-h-80">
                  <img
                    src={selectedLogImage}
                    alt="Attached Document"
                    className="max-h-80 w-auto object-contain rounded-lg cursor-pointer transition-transform hover:scale-[1.01]"
                    onClick={() => setFullScreenImage(selectedLogImage)}
                    title="Click to view full screen"
                  />
                  <div 
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer gap-2"
                    onClick={() => setFullScreenImage(selectedLogImage)}
                  >
                    <span className="text-xs font-bold text-white bg-black/80 px-3 py-1.5 rounded-full border border-white/20 flex items-center gap-1.5 shadow-lg">
                      <Maximize2 className="w-3.5 h-3.5 text-teal-400" /> Click for Fullscreen View
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-white/[0.01] rounded-lg border border-dashed border-white/10 text-white/40 text-xs">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-white/30" />
                  </div>
                  <div>
                    <span className="font-semibold text-white/60 block text-[11px]">No Document Photo Attached</span>
                    <span className="text-[10px] text-white/30">No picture was uploaded during registration or forwarding for this file.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Diff Viewer */}
            <div>
              <Label className="text-[10px] text-white/40 uppercase tracking-widest block mb-2">Payload Data (JSON)</Label>
              
              {selectedLog?.details && (selectedLog.details.before !== undefined || selectedLog.details.after !== undefined) ? (
                // Human Readable Diff View
                <DiffViewer before={selectedLog.details.before} after={selectedLog.details.after || selectedLog.details} />
              ) : (
                // Nicely formatted Payload View
                <PayloadViewer data={selectedLog?.details} />
              )}
            </div>

            {selectedLog && (selectedLog.diary_number || selectedLog.receiving_number || selectedLog.details?.cfo_diary_number || selectedLog.details?.receiving_number) && (
              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-primary/30 text-primary hover:bg-primary hover:text-black font-bold"
                  onClick={() => handleOpenPrint(selectedLog)}
                >
                  <Printer className="w-3.5 h-3.5" /> Print Tracking Slip (QR)
                </Button>
              </div>
            )}

          </div>
        </DialogContent>
      </Dialog>
{/* Full Screen Ticket & QR Modal (Matches File Tracking Layout exactly) */}
      <Dialog open={!!qrPrintModal} onOpenChange={(open) => !open && setQrPrintModal(null)}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-xl">
          {qrPrintModal && (
            <div className={`w-full h-full qr-ticket-printable bg-white print:bg-white ${isPrintingQR ? 'overflow-visible max-h-none' : 'max-h-[90vh] overflow-y-auto'} overflow-x-hidden font-sans pb-6 relative`}>
              {/* DUPLICATE Watermark for QR Ticket */}
              {isDuplicatePrint && (
                <div className="hidden print:flex absolute inset-0 items-center justify-center pointer-events-none z-[100] overflow-hidden select-none">
                  <div 
                    className="text-[90px] font-black uppercase text-red-500/20 -rotate-45 select-none"
                    style={{ WebkitTextStroke: '1.5px rgba(239, 68, 68, 0.4)' }}
                  >
                    DUPLICATE
                  </div>
                </div>
              )}

              {/* Full-Slip Official KWSC Watermark - Subtle, clean opacity so it doesn't pollute text or print */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[35] overflow-hidden">
                <img
                  src="/kwsc-watermark-logo.png"
                  alt="KWSC Watermark"
                  className="w-[340px] h-[340px] object-contain opacity-[0.20] select-none filter contrast-125 print:opacity-[0.25]"
                />
              </div>

              {/* Header - Solid rich Navy Blue (#1e3a8a) in print, no dirty grey smudges */}
              <div className="bg-[#1e3a8a] print:bg-[#1e3a8a] px-6 pt-7 pb-14 rounded-b-[36px] shadow-none relative overflow-hidden shrink-0 border-b-2 border-[#1e3a8a]">
                {/* Decorative circles - ONLY on screen, hidden on print so they don't cause dirty grey smudges! */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl print:hidden"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl print:hidden"></div>

                <div className="relative flex justify-center items-center mb-3">
                  <ShieldCheck className="w-10 h-10 text-emerald-400 print:text-emerald-400" />
                </div>

                <div className="relative text-center space-y-1">
                  <h1 className="text-white print:text-white text-xl font-black tracking-tight uppercase" style={{ color: '#ffffff' }}>Verified Tracking</h1>
                  <p className="text-blue-100 print:text-white text-[10px] font-bold uppercase tracking-widest" style={{ color: '#ffffff' }}>Karachi Water Corporation</p>
                </div>
              </div>

              {/* Main Content Card */}
              <div className="px-5 -mt-8 relative z-10 shrink-0">
                <Card className="rounded-[28px] border border-slate-200 shadow-none overflow-hidden bg-white print:border-none print:shadow-none">
                  <div className="p-1 bg-[#1e3a8a] print:bg-[#1e3a8a]"></div>
                  <CardContent className="pt-5 space-y-5 print:pt-4">

                    {/* Tracking Numbers */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50/70 dark:bg-blue-950/70 print:bg-slate-50 rounded-2xl p-3.5 text-center border-2 border-blue-200 dark:border-blue-700/60 print:border-slate-300 relative group overflow-hidden">
                        <span className="text-[10px] font-black text-[#1e3a8a] dark:text-sky-300 print:text-[#1e3a8a] uppercase tracking-wider block">CFO Diary</span>
                        <p className="text-sm font-black text-slate-900 dark:text-white print:text-black font-mono mt-1 tracking-tight">{qrPrintModal.diary || '—'}</p>
                      </div>
                      <div className="bg-emerald-50/70 dark:bg-emerald-950/70 print:bg-slate-50 rounded-2xl p-3.5 text-center border-2 border-emerald-200 dark:border-emerald-700/60 print:border-slate-300 relative group overflow-hidden">
                        <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 print:text-emerald-800 uppercase tracking-wider block">Receiving No</span>
                        <p className="text-sm font-black text-slate-900 dark:text-white print:text-black font-mono mt-1 tracking-tight">{qrPrintModal.receiving || '—'}</p>
                      </div>
                    </div>

                    {/* File Info */}
                    <div className="space-y-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 print:border-slate-200">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-[#1e3a8a] dark:text-sky-300 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-700 print:border-slate-200">
                          <FileText className="w-4 h-4 text-[#1e3a8a] dark:text-sky-300" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Subject</span>
                          <p className="text-xs font-black text-slate-900 dark:text-white print:text-black leading-snug">{qrPrintModal.subject || "Subject Details"}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-700 print:border-slate-200">
                          <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Created Date</span>
                          <p className="text-xs font-black text-amber-700 dark:text-amber-300 print:text-amber-800 font-mono tracking-tight">{safeFormatDate(qrPrintModal.created_date)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-700 print:border-slate-200">
                          <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Printed Date</span>
                          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300 print:text-emerald-800 font-mono tracking-tight">
                            {safeFormatDate(qrPrintModal.print_date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-[#1e3a8a] dark:text-sky-300 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-700 print:border-slate-200">
                          <Building2 className="w-4 h-4 text-[#1e3a8a]" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Current Section</span>
                          <p className="text-xs font-black text-[#1e3a8a] dark:text-sky-300 print:text-[#1e3a8a] uppercase tracking-tight">{getSectionName(qrPrintModal.mark_to)}</p>
                        </div>
                      </div>
                      {qrPrintModal.additional_mark_to && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 border border-purple-100 dark:border-purple-700 print:border-slate-200">
                            <Building2 className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Additional Mark To</span>
                            <p className="text-xs font-black text-purple-700 dark:text-purple-300 print:text-purple-800 uppercase tracking-tight">{getSectionName(qrPrintModal.additional_mark_to)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* QR Section - Crisp High Contrast, Clean borders, 100% Scannable */}
                    <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900/80 print:bg-white rounded-2xl flex flex-col items-center gap-3 text-center border border-slate-200 dark:border-slate-700 print:border-none print:shadow-none">
                      <div data-qr-white className="qr-code-white-card bg-white p-3.5 rounded-xl border-2 border-[#1e3a8a] dark:border-sky-400 print:border-[#1e3a8a] flex flex-col items-center shadow-md" style={{ backgroundColor: '#ffffff' }}>
                        <div data-qr-white className="relative inline-flex items-center justify-center p-2 rounded-lg bg-white" style={{ backgroundColor: '#ffffff' }}>
                          <QRCodeCanvas
                            value={`${window.location.origin}/public-track/${qrPrintModal.diary || qrPrintModal.receiving}/${qrPrintModal.receiving || qrPrintModal.diary}`}
                            size={140}
                            level="H"
                            fgColor="#000000"
                            bgColor="#ffffff"
                            imageSettings={{
                              src: "/kwsc-watermark-logo.png",
                              x: undefined,
                              y: undefined,
                              height: 28,
                              width: 28,
                              excavate: true,
                            }}
                            style={{ width: '120px', height: '120px', display: 'block' }}
                          />
                        </div>
                        <span className="text-[8.5px] font-black mt-2 uppercase text-center block" style={{ color: '#0f172a' }}>Prepared by Engineer Tariq Zamir</span>
                      </div>
                      <div>
                        <p className="text-[#1e3a8a] dark:text-sky-300 print:text-[#1e3a8a] text-xs font-black uppercase tracking-widest">Scan to Track Live</p>
                        <p className="text-slate-800 dark:text-white print:text-black text-xs font-black tracking-tight mt-0.5 font-mono">CODE: {qrPrintModal.receiving}</p>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-2 justify-center">
                      <div className="no-print space-y-2 mb-2 bg-slate-500/5 p-3 rounded-lg border border-slate-500/20">
                        <div className="flex items-center gap-2 mb-3 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                          <Checkbox 
                            id="duplicate-print-qr-activity" 
                            checked={isDuplicatePrint}
                            onCheckedChange={(checked) => setIsDuplicatePrint(!!checked)}
                          />
                          <Label htmlFor="duplicate-print-qr-activity" className="text-[10px] font-bold text-amber-600 cursor-pointer uppercase">Print with DUPLICATE watermark</Label>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-amber-600">Override Created Date</label>
                          <input
                            type="date"
                            value={qrPrintModal.created_date ? qrPrintModal.created_date.split('T')[0] : ''}
                            onChange={e => setQrPrintModal({ ...qrPrintModal, created_date: e.target.value })}
                            className="w-full h-8 text-xs bg-white border border-amber-500/30 text-amber-600 font-bold rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-emerald-600">Override Print Date</label>
                          <input
                            type="date"
                            value={qrPrintModal.print_date ? qrPrintModal.print_date.split('T')[0] : ''}
                            onChange={e => setQrPrintModal({ ...qrPrintModal, print_date: e.target.value })}
                            className="w-full h-8 text-xs bg-white border border-emerald-500/30 text-emerald-600 font-bold rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full bg-[#1e3a8a] hover:bg-[#172554] text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-none flex items-center justify-center gap-2 no-print"
                        style={{ color: '#ffffff' }}
                        onClick={handlePrintQR}
                      >
                        <Printer className="w-4 h-4 mr-2" style={{ color: '#ffffff' }} />
                        <span style={{ color: '#ffffff' }}>Print Tracking Slip</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FULLSCREEN IMAGE LIGHTBOX MODAL */}
      <Dialog open={!!fullScreenImage} onOpenChange={(open) => !open && setFullScreenImage(null)}>
        <DialogContent className="max-w-[96vw] md:max-w-5xl max-h-[96vh] p-4 bg-[#09090b]/98 border border-white/20 text-white rounded-3xl flex flex-col items-center justify-between overflow-hidden shadow-2xl z-[120]">
          <div className="w-full flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-teal-400" />
              <span className="text-sm font-bold text-white tracking-wide">
                Attached Document Photo — Full Size
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white rounded-lg gap-1.5"
                onClick={() => fullScreenImage && openInNewTab(fullScreenImage)}
                title="Open in a dedicated browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-teal-400" /> Open in New Tab
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg gap-1.5 font-bold"
                onClick={() => fullScreenImage && handleDownloadImage(fullScreenImage, `document-${selectedLog?.receiving_number || 'file'}.jpg`)}
                title="Download original document photo"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </div>
          </div>
          <div className="w-full flex-1 overflow-auto flex items-center justify-center p-2 min-h-[50vh] max-h-[82vh] bg-black/60 rounded-2xl border border-white/5 my-2">
            {fullScreenImage && (
              <img
                src={fullScreenImage}
                alt="Full Document"
                className="max-h-[78vh] w-auto max-w-full object-contain rounded-xl shadow-2xl transition-transform"
              />
            )}
          </div>
          <div className="w-full flex justify-between items-center pt-2 text-[11px] text-white/40 shrink-0">
            <span>High-Resolution Document Preview</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs bg-white/5 hover:bg-white/10 text-white rounded-lg border-white/10"
              onClick={() => setFullScreenImage(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        ${isPrintingQR ? `
          @media print {
            body * { 
              visibility: visible !important; 
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .no-print { display: none !important; }
            @page { size: auto; margin: 0; }
          }
        ` : ''}
        
        @media screen {
          /* Dashboard Dark Theme Overrides for Ticket Modal */
          [data-radix-portal] .bg-zinc-950, [data-radix-portal] .bg-slate-50 { background-color: #09090b !important; }
          [data-radix-portal] .bg-white:not(.qr-code-white-card):not([data-qr-white]) { background-color: #18181b !important; border: 1px solid rgba(255,255,255,0.1) !important; }
          [data-radix-portal] .qr-code-white-card, [data-radix-portal] [data-qr-white] { background-color: #ffffff !important; }
          [data-radix-portal] .text-zinc-800, [data-radix-portal] .text-zinc-400 { color: #f4f4f5 !important; }
          [data-radix-portal] .bg-slate-50.rounded-2xl { background-color: #27272a !important; border: 1px solid rgba(255,255,255,0.05) !important; }
          [data-radix-portal] .border-zinc-100 { border-color: rgba(255,255,255,0.05) !important; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════
          🚨 ATTACK DEMO MODAL — Full Screen
      ═══════════════════════════════════════════════════════════ */}
      {showAttackDemo && (
        <div className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-xl flex flex-col overflow-auto">
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-rose-500/20 bg-rose-950/30 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center animate-pulse">
                <AlertCircle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white tracking-tight">🛡️ KWSC Security Attack Detection — Live Demo</h2>
                <p className="text-xs text-rose-300/60">This demo shows how the system detects and responds to security attacks</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/50 hover:text-white hover:bg-white/10"
              onClick={() => { setShowAttackDemo(false); setDemoAlerts([]); setDemoStep(0); setIsDemoRunning(false); }}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">

            {/* ── Intro Card ── */}
            <div className="bg-[#0f1115] border border-white/5 rounded-2xl p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">How Does System Attack Detection Work?</h3>
                  <p className="text-sm text-white/50 mt-1">
                    KWSC system monitors all user activities 24/7. When any suspicious action is detected — whether internal or external — the system <span className="text-rose-300 font-semibold">immediately alerts</span> the admin and sends a WhatsApp notification.
                  </p>
                </div>
              </div>

              {/* Attack types explanation */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { icon: '🗑️', label: 'Delete Burst', desc: '3+ records deleted within 1 hour', color: 'rose' },
                  { icon: '🌙', label: 'Off-Hours Login', desc: 'System access outside office hours', color: 'amber' },
                  { icon: '🔐', label: 'Brute Force', desc: 'Repeated wrong password attempts', color: 'rose' },
                  { icon: '🌍', label: 'IP Change', desc: 'Same account from different location', color: 'amber' },
                ].map((item, i) => (
                  <div key={i} className={`bg-${item.color}-500/5 border border-${item.color}-500/20 rounded-xl p-3 space-y-1`}>
                    <div className="text-2xl">{item.icon}</div>
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[10px] text-white/40">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Demo Control ── */}
            <div className="bg-[#0f1115] border border-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Simulate an Attack</h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    Click the button — the system will detect real attacks, generate alerts, and send WhatsApp notifications
                  </p>
                </div>
                <Button
                  onClick={handleRunAttackDemo}
                  disabled={isDemoRunning}
                  className="bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold px-6 h-10 rounded-xl shadow-lg shadow-rose-500/20 border-0"
                >
                  {isDemoRunning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Demo...</>
                  ) : (
                    <><AlertCircle className="w-4 h-4 mr-2" /> 🚨 Start Attack Demo</>
                  )}
                </Button>
              </div>

              {/* Progress steps */}
              {isDemoRunning && (
                <div className="flex items-center gap-2 mb-4">
                  {DEMO_SCENARIOS.map((s, i) => (
                    <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-700 ${i < demoStep ? 'bg-rose-500' : i === demoStep - 1 ? 'bg-rose-400 animate-pulse' : 'bg-white/10'}`} />
                  ))}
                </div>
              )}

              {/* Live Alert Feed */}
              <div className="space-y-3 min-h-[60px]">
                {demoAlerts.length === 0 && !isDemoRunning && (
                  <p className="text-xs text-white/20 text-center py-6 border border-dashed border-white/5 rounded-xl">
                    Alerts will appear here when you start the demo...
                  </p>
                )}

                {demoAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-4 p-4 rounded-xl border animate-in slide-in-from-left-4 duration-500 ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-amber-500/10 border-amber-500/20'
                    }`}
                  >
                    {/* Severity indicator */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      alert.severity === 'CRITICAL' ? 'bg-rose-500/20' : 'bg-amber-500/20'
                    }`}>
                      <span className="text-lg">{alert.severity === 'CRITICAL' ? '🔴' : '🟡'}</span>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs font-bold text-white">{alert.type.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-white/30 font-mono">
                          {new Date(alert.timestamp).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })} PKT
                        </span>
                      </div>
                      <p className="text-sm text-white/80">{alert.description}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {alert.details?.ip && (
                          <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                            🌐 IP: {alert.details.ip}
                          </span>
                        )}
                        {alert.details?.location && (
                          <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                            📍 {alert.details.location}
                          </span>
                        )}
                        {alert.details?.count && (
                          <span className="text-[10px] font-mono text-rose-300/70 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            🗑️ {alert.details.count} deletions
                          </span>
                        )}
                        {alert.details?.attempts && (
                          <span className="text-[10px] font-mono text-rose-300/70 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            🔐 {alert.details.attempts} failed attempts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* WhatsApp sent badge */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        📱 WhatsApp Sent
                      </span>
                      <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                        💾 DB Logged
                      </span>
                    </div>
                  </div>
                ))}

                {/* Success summary after demo */}
                {!isDemoRunning && demoAlerts.length === DEMO_SCENARIOS.length && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in duration-700">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-300">✅ Demo Complete — System detected {demoAlerts.length} attacks!</p>
                      <p className="text-xs text-emerald-400/60 mt-0.5">
                        All alerts have been saved to the Activity Log and WhatsApp notifications were sent.
                        Use the filter above to view "🚨 Security Alert" entries.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Response Guide ── */}
            <div className="bg-[#0f1115] border border-white/5 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                What Should Admin Do — Response Guide
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    step: '1',
                    title: 'View Alerts',
                    desc: 'A red alert banner appears on the Activity Log page. Select "Security Alert" from the filter.',
                    color: 'sky',
                    icon: '👁️',
                  },
                  {
                    step: '2',
                    title: 'Block the User',
                    desc: 'Use the Force Logout button next to the user in the Active Sessions card to immediately remove access.',
                    color: 'amber',
                    icon: '🚫',
                  },
                  {
                    step: '3',
                    title: 'Export Evidence',
                    desc: 'Click the Export button to download the full activity log as CSV — for official record keeping.',
                    color: 'emerald',
                    icon: '📥',
                  },
                ].map((item) => (
                  <div key={item.step} className={`bg-${item.color}-500/5 border border-${item.color}-500/15 rounded-xl p-4 space-y-2`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full bg-${item.color}-500/20 text-${item.color}-400 text-xs font-black flex items-center justify-center`}>{item.step}</span>
                      <span className="text-sm font-bold text-white">{item.icon} {item.title}</span>
                    </div>
                    <p className="text-xs text-white/50">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
