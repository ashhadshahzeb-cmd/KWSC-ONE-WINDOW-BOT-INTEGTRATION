import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Inbox,
  Send,
  FileText,
  Clock,
  Building2,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Search,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Filter,
  Layers,
  ChevronRight,
  X,
  Eye,
  FileCheck,
  CheckCircle2,
  Database
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// KW&SC Corporate Blue Palette (Zero Gradient, High Contrast)
const THEME_BLUE = "#1e3a8a";
const CHART_COLORS = [
  "#1e3a8a", // Primary Navy Blue
  "#0284c7", // Sky Blue
  "#0d9488", // Teal
  "#2563eb", // Royal Blue
  "#d97706", // Amber
  "#059669", // Emerald
  "#4f46e5", // Indigo
  "#db2777", // Rose
  "#7c3aed", // Violet
  "#475569"  // Slate
];

interface DashboardRecord {
  id: string;
  tracking_id?: string;
  cfo_diary_number?: string;
  receiving_number?: string;
  inward_date?: string;
  outward_date?: string;
  main_category?: string;
  sub_category?: string;
  mark_to?: string;
  amount?: number;
  subject?: string;
  created_at?: string;
}

const CACHE_KEY = "kwsc_dashboard_real_data_v2";

export default function Dashboard() {
  const [records, setRecords] = useState<DashboardRecord[]>(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [recentFiles, setRecentFiles] = useState<DashboardRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(records.length === 0);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [timeRange, setTimeRange] = useState<"all" | "today" | "30d" | "this_month" | "this_year">("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [chartViewMode, setChartViewMode] = useState<"bar" | "area">("bar");
  
  // Drill-down Modal State
  const [drilldownModal, setDrilldownModal] = useState<{
    title: string;
    type: "category" | "section";
    key: string;
    items: DashboardRecord[];
  } | null>(null);

  // Fetch full dataset on mount or refresh + setup Realtime listener
  useEffect(() => {
    loadFullRealDataset();

    // Setup Supabase Realtime channel for live updates without page refresh
    const channel = supabase
      .channel("dashboard_file_tracking_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "file_tracking_records"
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newRec = payload.new as DashboardRecord;
            setRecords(prev => {
              if (prev.some(r => r.id === newRec.id)) return prev;
              return [newRec, ...prev];
            });
            setRecentFiles(prev => [newRec, ...prev.slice(0, 9)]);
          } else if (payload.eventType === "UPDATE") {
            const updatedRec = payload.new as DashboardRecord;
            setRecords(prev => prev.map(r => r.id === updatedRec.id ? { ...r, ...updatedRec } : r));
            setRecentFiles(prev => prev.map(r => r.id === updatedRec.id ? { ...r, ...updatedRec } : r));
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setRecords(prev => prev.filter(r => r.id !== deletedId));
              setRecentFiles(prev => prev.filter(r => r.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadFullRealDataset = async () => {
    setIsLoading(true);
    setSyncProgress("Connecting to File Tracking database...");
    try {
      // 1. Fetch exact count from Supabase
      const { count } = await (supabase
        .from("file_tracking_records" as any)
        .select("*", { count: "exact", head: true }));

      const totalCount = (count !== null && count !== undefined && count > 0) ? count : 12569;
      setSyncProgress(`Loading ${totalCount.toLocaleString()} official records...`);

      // 2. Fetch in parallel chunks of 1000 - select ONLY slim columns needed for aggregates (no huge strings)
      const chunkSize = 1000;
      const promises: Promise<DashboardRecord[]>[] = [];

      for (let i = 0; i < totalCount; i += chunkSize) {
        promises.push(
          (supabase
            .from("file_tracking_records" as any)
            .select("id, main_category, sub_category, mark_to, inward_date, outward_date, amount, created_at")
            .range(i, i + chunkSize - 1) as any)
            .then((res: any) => res.data || [])
        );
      }

      // Fast targeted query for the 10 newest files (takes <50ms)
      const recentPromise = (supabase
        .from("file_tracking_records" as any)
        .select("id, cfo_diary_number, receiving_number, inward_date, outward_date, main_category, mark_to, amount, subject, created_at")
        .order("created_at", { ascending: false })
        .limit(10) as any)
        .then((res: any) => res.data || []);

      const [chunkResults, latestRecent] = await Promise.all([
        Promise.all(promises),
        recentPromise
      ]);

      if (latestRecent && latestRecent.length > 0) {
        setRecentFiles(latestRecent);
      }

      let allRemoteRecords = chunkResults.flat();

      // 3. Merge unsynced dirty records from Dexie IndexedDB
      try {
        const localRecords = await db.records.filter(r => !r.deleted_locally && r.status !== "trashed").toArray();
        const localDirty = localRecords.filter(r => r.is_dirty);
        if (localDirty.length > 0) {
          const remoteIds = new Set(allRemoteRecords.map(r => r.id));
          const uniqueDirty = localDirty.filter(d => !remoteIds.has(d.id));
          allRemoteRecords = [...uniqueDirty as any, ...allRemoteRecords];
        }
      } catch (dexErr) {
        console.warn("Dexie local merge note:", dexErr);
      }

      if (allRemoteRecords.length > 0) {
        setRecords(allRemoteRecords);
        try {
          // Cache in sessionStorage for ultra-fast tab switches without freezing localStorage
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(allRemoteRecords.slice(0, 3000)));
        } catch (storageErr) {
          console.warn("Storage quota note:", storageErr);
        }
      }
    } catch (err) {
      console.error("Dashboard full real data load error:", err);
    } finally {
      setIsLoading(false);
      setSyncProgress("");
    }
  };

  // Filter records based on selected time range, category, and search query
  const filteredRecords = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return records.filter(r => {
      // Time filter
      const rDateStr = r.inward_date || r.created_at?.slice(0, 10);
      if (timeRange !== "all" && rDateStr) {
        const rDate = new Date(rDateStr);
        if (timeRange === "today" && rDateStr !== todayStr) return false;
        if (timeRange === "30d" && rDate < thirtyDaysAgo) return false;
        if (timeRange === "this_month" && (rDate.getFullYear() !== currentYear || rDate.getMonth() !== currentMonth)) return false;
        if (timeRange === "this_year" && rDate.getFullYear() !== currentYear) return false;
      }

      // Category filter
      if (selectedCategoryFilter !== "all") {
        const cat = (r.main_category || "others").toLowerCase().trim();
        if (cat !== selectedCategoryFilter.toLowerCase()) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const diary = (r.cfo_diary_number || "").toLowerCase();
        const receiving = (r.receiving_number || "").toLowerCase();
        const subject = (r.subject || "").toLowerCase();
        const markTo = (r.mark_to || "").toLowerCase();
        const cat = (r.main_category || "").toLowerCase();
        if (!diary.includes(q) && !receiving.includes(q) && !subject.includes(q) && !markTo.includes(q) && !cat.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [records, timeRange, selectedCategoryFilter, searchQuery]);

  // Aggregate Key Real KPI Metrics
  const stats = useMemo(() => {
    let inwardCount = 0;
    let outwardCount = 0;
    let totalAmount = 0;
    const activeSections = new Set<string>();

    filteredRecords.forEach(r => {
      inwardCount++;

      // Real Outward logic: Any file that has an outward_date recorded or mark_to === 'exited'
      const isOutward = Boolean(
        (r.outward_date && r.outward_date.trim() !== "") ||
        r.mark_to === "exited"
      );

      if (isOutward) {
        outwardCount++;
      }

      if (r.amount) {
        const amt = Number(r.amount);
        if (!isNaN(amt) && amt > 0) totalAmount += amt;
      }
      if (r.mark_to && r.mark_to.trim() !== "" && r.mark_to !== "exited") {
        activeSections.add(r.mark_to.trim().toLowerCase());
      }
    });

    const pendingOutwardCount = Math.max(0, inwardCount - outwardCount);
    const outwardRate = inwardCount > 0 ? ((outwardCount / inwardCount) * 100).toFixed(1) : "0.0";

    return {
      totalFiles: filteredRecords.length,
      inwardCount,
      outwardCount,
      pendingOutwardCount,
      outwardRate,
      totalAmount,
      activeSectionsCount: activeSections.size
    };
  }, [filteredRecords]);

  // Real Category Breakdown ("har category ki file bataye")
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { count: number; totalAmount: number; subCats: Record<string, number> }> = {};

    filteredRecords.forEach(r => {
      let rawCat = (r.main_category || "others").trim().toLowerCase();
      let catName = rawCat;

      if (catName === "employee") catName = "Employee / HR";
      else if (catName === "contractor") catName = "Contractor Bills";
      else if (catName === "pol_bills" || catName === "pol") catName = "POL & Fuel Bills";
      else if (catName === "medical" || catName === "medical_bills") catName = "Medical Claims";
      else if (catName === "contingencies" || catName === "contingency") catName = "Contingencies";
      else if (catName === "security_deposit") catName = "Security Deposit";
      else if (catName === "imprest" || catName === "impress") catName = "Imprest Cash";
      else if (catName === "news-paper" || catName === "newspaper") catName = "Newspaper Bills";
      else if (catName === "books" || catName === "book-section") catName = "Books & Accounts";
      else if (catName === "k-electric") catName = "K-Electric Bills";
      else if (catName === "others" || catName === "" || catName === "general") catName = "Others / General";
      else {
        catName = catName.charAt(0).toUpperCase() + catName.slice(1);
      }

      if (!map[catName]) {
        map[catName] = { count: 0, totalAmount: 0, subCats: {} };
      }
      map[catName].count += 1;
      const amt = Number(r.amount);
      if (!isNaN(amt) && amt > 0) map[catName].totalAmount += amt;

      const sub = r.sub_category || "General";
      map[catName].subCats[sub] = (map[catName].subCats[sub] || 0) + 1;
    });

    const total = filteredRecords.length || 1;
    return Object.keys(map).map((catName, idx) => ({
      name: catName,
      count: map[catName].count,
      percentage: Number(((map[catName].count / total) * 100).toFixed(1)),
      totalAmount: map[catName].totalAmount,
      avgAmount: map[catName].count > 0 ? map[catName].totalAmount / map[catName].count : 0,
      subCats: map[catName].subCats,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    })).sort((a, b) => b.count - a.count);
  }, [filteredRecords]);

  // Real Section Breakdown ("jis section me jitni files gain hai wo bhi bataye")
  const sectionBreakdown = useMemo(() => {
    const map: Record<string, { count: number; totalAmount: number; outwardCount: number }> = {};

    filteredRecords.forEach(r => {
      let rawSec = (r.mark_to || "unassigned").trim().toLowerCase();
      let secName = rawSec;

      if (secName === "budget") secName = "Budget Section";
      else if (secName === "cia") secName = "CIA Section";
      else if (secName === "establishment") secName = "Establishment Section";
      else if (secName === "director_it") secName = "Director IT";
      else if (secName === "director_finance" || secName === "diretor finance") secName = "Director Finance";
      else if (secName === "fund") secName = "CP Fund Section";
      else if (secName === "pension") secName = "Pension Section";
      else if (secName === "books") secName = "Books Section";
      else if (secName === "internal_audit_2") secName = "Internal Audit - II";
      else if (secName === "internal_audit_1") secName = "Internal Audit - I";
      else if (secName === "director-f&a" || secName === "director_fa") secName = "Director F&A";
      else if (secName === "director_audit") secName = "Director Audit";
      else if (secName === "cfo") secName = "CFO Secretariat";
      else if (secName === "sub_cfo") secName = "Sub CFO Office";
      else if (secName === "chro") secName = "CHRO Office";
      else if (secName === "medical") secName = "Medical Section";
      else if (secName === "contractor") secName = "Contractor Section";
      else if (secName === "exited") secName = "Exited / Completed";
      else if (secName === "unassigned" || secName === "") secName = "Unassigned / General";
      else {
        secName = secName.replace(/_/g, " ").toUpperCase();
      }

      if (!map[secName]) {
        map[secName] = { count: 0, totalAmount: 0, outwardCount: 0 };
      }
      map[secName].count += 1;
      const amt = Number(r.amount);
      if (!isNaN(amt) && amt > 0) map[secName].totalAmount += amt;

      const isOutward = Boolean(
        (r.outward_date && r.outward_date.trim() !== "") ||
        r.mark_to === "exited"
      );
      if (isOutward) {
        map[secName].outwardCount += 1;
      }
    });

    const total = filteredRecords.length || 1;
    return Object.keys(map).map((secName, idx) => ({
      name: secName,
      files: map[secName].count,
      percentage: Number(((map[secName].count / total) * 100).toFixed(1)),
      totalAmount: map[secName].totalAmount,
      outwardCount: map[secName].outwardCount,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    })).sort((a, b) => b.files - a.files);
  }, [filteredRecords]);

  // Real Inward vs Outward Monthly Movement Trends
  const movementTrends = useMemo(() => {
    const monthMap: Record<string, { month: string; sortKey: string; inward: number; outward: number; totalAmount: number }> = {};

    filteredRecords.forEach(r => {
      // 1. Inward counted on inward_date
      const inDateStr = r.inward_date || r.created_at;
      if (inDateStr) {
        const d = new Date(inDateStr);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          if (year >= 2024 && year <= 2027) {
            const sortKey = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

            if (!monthMap[sortKey]) {
              monthMap[sortKey] = { month: monthLabel, sortKey, inward: 0, outward: 0, totalAmount: 0 };
            }

            monthMap[sortKey].inward += 1;
            const amt = Number(r.amount);
            if (!isNaN(amt) && amt > 0) monthMap[sortKey].totalAmount += amt;
          }
        }
      }

      // 2. Outward counted on outward_date
      const isOutward = Boolean(
        (r.outward_date && r.outward_date.trim() !== "") ||
        r.mark_to === "exited"
      );
      if (isOutward) {
        const outDateStr = r.outward_date || r.inward_date || r.created_at;
        if (outDateStr) {
          const d = new Date(outDateStr);
          if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            if (year >= 2024 && year <= 2027) {
              const sortKey = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

              if (!monthMap[sortKey]) {
                monthMap[sortKey] = { month: monthLabel, sortKey, inward: 0, outward: 0, totalAmount: 0 };
              }

              monthMap[sortKey].outward += 1;
            }
          }
        }
      }
    });

    const sorted = Object.values(monthMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return sorted.slice(-10);
  }, [filteredRecords]);

  // Drilldown Modal
  const handleOpenDrilldown = async (type: "category" | "section", key: string, title: string) => {
    setIsDrilldownLoading(true);
    setDrilldownModal({
      title,
      type,
      key,
      items: []
    });

    try {
      let q = supabase
        .from("file_tracking_records" as any)
        .select("id, cfo_diary_number, receiving_number, inward_date, outward_date, main_category, mark_to, amount, subject, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      const cleanKey = key.toLowerCase().split("/")[0].trim().replace(/ section| bills| claims| office/gi, "").trim();

      if (type === "category") {
        q = q.ilike("main_category", `%${cleanKey}%`);
      } else {
        q = q.ilike("mark_to", `%${cleanKey}%`);
      }

      const { data } = await q;
      setDrilldownModal({
        title,
        type,
        key,
        items: data || []
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsDrilldownLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.06 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
  };

  return (
    <div className="w-full space-y-6 text-slate-900 pb-16 font-sans">
      
      {/* ══════════════════════════════════════════════════════════════════════════════
          1. HEADER & CONTROLS TOOLBAR
      ══════════════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#1e3a8a] text-white flex items-center justify-center shadow-md">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl md:text-3xl font-black text-[#1e3a8a] tracking-tight">
                  KW&SC File Tracking & Operations Dashboard
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1e3a8a] border border-blue-200">
                  <Database className="w-3 h-3 text-[#1e3a8a]" /> Official Records
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Realtime
                </span>
              </div>
              <p className="text-xs text-slate-700 font-semibold mt-0.5">
                Real-time metrics, live inward/outward file movements, and departmental exposure
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            {[
              { id: "all", label: "All Time" },
              { id: "this_year", label: "This Year" },
              { id: "this_month", label: "This Month" },
              { id: "30d", label: "Last 30 Days" },
              { id: "today", label: "Today" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  timeRange === tab.id
                    ? "bg-[#1e3a8a] text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-900"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadFullRealDataset}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e3a8a] hover:bg-blue-900 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
            title="Refresh Live Data"
          >
            <RefreshCw className={cn("w-4 h-4 text-white", isLoading && "animate-spin")} />
            <span>{isLoading ? "Syncing..." : "Refresh"}</span>
          </button>
        </div>
      </motion.div>

      {/* Sync Status Banner if Loading */}
      {isLoading && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between text-xs font-bold text-[#1e3a8a]">
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#1e3a8a]" />
            {syncProgress || "Updating real statistics from File Tracking..."}
          </span>
          <span className="text-slate-600 font-semibold">Cached data displayed below</span>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search diary no, receiving, subject..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <span className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[#1e3a8a]" /> Category Filter:
          </span>
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
          >
            <option value="all">All Categories ({stats.totalFiles.toLocaleString()})</option>
            <option value="employee">Employee / HR</option>
            <option value="contractor">Contractor Bills</option>
            <option value="pol_bills">POL & Fuel Bills</option>
            <option value="medical">Medical Claims</option>
            <option value="contingencies">Contingencies</option>
            <option value="security_deposit">Security Deposit</option>
            <option value="imprest">Imprest Cash</option>
            <option value="books">Books & Accounts</option>
            <option value="others">Others / General</option>
          </select>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════════
          2. KEY REAL KPI CARDS (Inward, Outward, In-Transit, Real Claim Amount)
      ══════════════════════════════════════════════════════════════════════════════ */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {/* TOTAL INWARD FILES */}
        <motion.div variants={itemVariants}>
          <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Total Inward Files
                </span>
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1e3a8a] border border-blue-200 flex items-center justify-center font-bold">
                  <ArrowDownLeft className="w-5 h-5 text-[#1e3a8a]" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl xl:text-4xl font-black text-[#1e3a8a] tracking-tight">
                  {stats.inwardCount.toLocaleString()}
                </span>
                <span className="text-[10px] sm:text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 whitespace-nowrap">
                  Total Received
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-700 font-semibold">
                Official files registered into KW&SC File Tracking
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* TOTAL OUTWARD FILES */}
        <motion.div variants={itemVariants}>
          <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Total Outward Files
                </span>
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 border border-sky-200 flex items-center justify-center font-bold">
                  <ArrowUpRight className="w-5 h-5 text-sky-800" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl xl:text-4xl font-black text-sky-800 tracking-tight">
                  {stats.outwardCount.toLocaleString()}
                </span>
                <span className="text-[10px] sm:text-xs font-black text-sky-900 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-300 whitespace-nowrap">
                  {stats.outwardRate}% Dispatched
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-700 font-semibold">
                Official files dispatched and forwarded to departmental sections
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* ACTIVE IN SECTIONS */}
        <motion.div variants={itemVariants}>
          <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Active in Sections
                </span>
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 border border-amber-200 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5 text-amber-900" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl xl:text-4xl font-black text-amber-800 tracking-tight">
                  {stats.activeSectionsCount.toLocaleString()} Sections
                </span>
                <span className="text-[10px] sm:text-xs font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 whitespace-nowrap">
                  {stats.pendingOutwardCount > 0 ? `${stats.pendingOutwardCount} Pending Outward` : "All Dispatched"}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-700 font-semibold">
                Files distributed across {stats.activeSectionsCount} active operational departments
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* TOTAL CLAIM AMOUNT */}
        <motion.div variants={itemVariants}>
          <Card className="border-2 border-amber-400 rounded-2xl" style={{ background: '#fffbeb' }}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                  Total File Amount (PKR)
                </span>
                <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center font-bold">
                  <FileCheck className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-lg sm:text-xl lg:text-2xl font-black tracking-tight font-mono break-all leading-tight px-3 py-1 rounded-lg" style={{ color: '#92400e', background: '#fef08a', border: '1.5px solid #fbbf24', display: 'inline-block' }}>
                  {formatCurrency(stats.totalAmount)}
                </span>
              </div>
              <p className="mt-2 text-xs text-amber-800 font-semibold">
                Combined financial value across recorded claims
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════════════════
          3. MAIN CHARTS (Inward vs Outward Movement Trends & Category Share)
      ══════════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CHART 1: INWARD VS OUTWARD MOVEMENT TRENDS */}
        <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-200 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black text-[#1e3a8a] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#1e3a8a]" />
                Inward vs Outward File Movement Trends
              </CardTitle>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Monthly inflow of files versus outward movements
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-black">
                <span className="flex items-center gap-1.5 text-[#1e3a8a]">
                  <span className="w-3 h-3 rounded-full bg-[#1e3a8a] inline-block" /> Inward ({stats.inwardCount.toLocaleString()})
                </span>
                <span className="flex items-center gap-1.5 text-sky-700">
                  <span className="w-3 h-3 rounded-full bg-[#0284c7] inline-block" /> Outward ({stats.outwardCount.toLocaleString()})
                </span>
              </div>
              
              <button
                onClick={() => setChartViewMode(chartViewMode === "bar" ? "area" : "bar")}
                className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold rounded-lg border border-slate-300 transition-colors"
              >
                {chartViewMode === "bar" ? "Area Flow" : "Bar View"}
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartViewMode === "bar" ? (
                  <BarChart data={movementTrends} barGap={4} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" stroke="#334155" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis stroke="#334155" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#cbd5e1",
                        borderRadius: "12px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a"
                      }}
                    />
                    <Bar
                      dataKey="inward"
                      name="Inward Files"
                      fill="#1e3a8a"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={true}
                      animationDuration={1000}
                    />
                    <Bar
                      dataKey="outward"
                      name="Outward Files"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={true}
                      animationDuration={1200}
                    />
                  </BarChart>
                ) : (
                  <AreaChart data={movementTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" stroke="#334155" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis stroke="#334155" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#cbd5e1",
                        borderRadius: "12px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="inward"
                      name="Inward Files"
                      stroke="#1e3a8a"
                      strokeWidth={3}
                      fill="#1e3a8a"
                      fillOpacity={0.2}
                      isAnimationActive={true}
                    />
                    <Area
                      type="monotone"
                      dataKey="outward"
                      name="Outward Files"
                      stroke="#0284c7"
                      strokeWidth={3}
                      fill="#0284c7"
                      fillOpacity={0.2}
                      isAnimationActive={true}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* CHART 2: CATEGORY SHARE DONUT */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-200">
            <CardTitle className="text-base font-black text-[#1e3a8a] flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-[#1e3a8a]" />
              Category Share Breakdown
            </CardTitle>
            <p className="text-xs text-slate-600 font-semibold">
              Volume distribution across categories
            </p>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center pt-4">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    isAnimationActive={true}
                    animationDuration={1200}
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#cbd5e1",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: "#0f172a"
                    }}
                    formatter={(val: number) => [`${val.toLocaleString()} files`, "Volume"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Compact Legend */}
            <div className="w-full mt-2 grid grid-cols-2 gap-2 text-xs">
              {categoryBreakdown.slice(0, 6).map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => handleOpenDrilldown("category", cat.name, cat.name)}
                  className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-300 transition-all"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="truncate font-extrabold text-slate-800">{cat.name}</span>
                  </span>
                  <span className="font-mono font-black text-[#1e3a8a]">{cat.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════════
          4. CATEGORY-WISE IN-DEPTH CARDS ("har category ki file bataye")
      ══════════════════════════════════════════════════════════════════════════════ */}
      <Card className="bg-white border-slate-200 shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-slate-200 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-black text-[#1e3a8a] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#1e3a8a]" />
              All Category Files & Financial Analysis
            </CardTitle>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">
              Exact number of files and total financial amount for every single category
            </p>
          </div>
          <span className="text-xs font-black bg-blue-50 text-[#1e3a8a] px-3 py-1 rounded-full border border-blue-200">
            {categoryBreakdown.length} Categories ({stats.totalFiles.toLocaleString()} Files)
          </span>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryBreakdown.map((cat) => (
              <motion.div
                key={cat.name}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.2 }}
                onClick={() => handleOpenDrilldown("category", cat.name, cat.name)}
                className="bg-slate-50 hover:bg-white border border-slate-200 hover:border-[#1e3a8a] p-4 rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded-md" style={{ backgroundColor: cat.color }} />
                    <h3 className="font-black text-sm text-slate-900 group-hover:text-[#1e3a8a] transition-colors">
                      {cat.name}
                    </h3>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#1e3a8a] group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase text-slate-600 block">Total Files</span>
                    <span className="text-xl font-black text-[#1e3a8a]">{cat.count.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-extrabold uppercase text-slate-600 block">Share of Total</span>
                    <span className="text-xl font-black text-slate-900">{cat.percentage}%</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-bold">Total Amount:</span>
                  <span className="font-mono font-black px-2 py-0.5 rounded" style={{ color: '#92400e', background: '#fef08a', border: '1px solid #fbbf24' }}>{formatCurrency(cat.totalAmount)}</span>
                </div>

                {/* Subcategory Pills */}
                {Object.keys(cat.subCats).length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {Object.entries(cat.subCats).slice(0, 3).map(([sub, count]) => (
                      <span key={sub} className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-md text-slate-800">
                        {sub}: <strong className="text-[#1e3a8a]">{count.toLocaleString()}</strong>
                      </span>
                    ))}
                    {Object.keys(cat.subCats).length > 3 && (
                      <span className="text-[10px] text-slate-500 px-1 py-0.5 font-bold">
                        +{Object.keys(cat.subCats).length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════════════
          5. SECTION-WISE WORKLOAD ("jis section me jitni files gain hai wo bhi bataye")
      ══════════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* HORIZONTAL BAR CHART - SECTION WORKLOAD */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-200 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black text-[#1e3a8a] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#1e3a8a]" />
                Section-wise File Workload Ranking
              </CardTitle>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Exact files received and held per department
              </p>
            </div>
            <span className="text-xs font-black text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              Top 10 Sections
            </span>
          </CardHeader>
          <CardContent className="flex-1 pt-6">
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sectionBreakdown.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 35, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#334155" fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#1e3a8a"
                    fontSize={11}
                    fontWeight="bold"
                    tickLine={false}
                    axisLine={false}
                    width={125}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#cbd5e1",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: "#0f172a"
                    }}
                    formatter={(val: number) => [`${val.toLocaleString()} files`, "Files Assigned"]}
                  />
                  <Bar
                    dataKey="files"
                    fill="#1e3a8a"
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={true}
                    animationDuration={1100}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* SECTION WORKLOAD TABLE */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-200 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black text-[#1e3a8a] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#1e3a8a]" />
                Section File Distribution Table
              </CardTitle>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Detailed file breakdown across all active departments
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-black uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Section / Department</th>
                  <th className="py-3 px-3 text-center">Files In</th>
                  <th className="py-3 px-3 text-center">Dispatched</th>
                  <th className="py-3 px-3 text-right">Amount (PKR)</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sectionBreakdown.slice(0, 10).map((sec) => (
                  <tr key={sec.name} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-black text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sec.color }} />
                        <span className="truncate max-w-[140px] sm:max-w-none">{sec.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-black font-mono text-[#1e3a8a]">
                      {sec.files.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-center font-black font-mono text-sky-800">
                      {sec.outwardCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      <span className="px-2 py-0.5 rounded text-xs font-black" style={{ color: '#92400e', background: '#fef08a', border: '1px solid #fbbf24' }}>{formatCurrency(sec.totalAmount)}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleOpenDrilldown("section", sec.name, sec.name)}
                        className="p-1.5 rounded-lg text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                        title="View Files"
                      >
                        <Eye className="w-4 h-4 text-[#1e3a8a]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════════
          6. RECENT ACTIVITY STREAM (Live File Stream)
      ══════════════════════════════════════════════════════════════════════════════ */}
      <Card className="bg-white border-slate-200 shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-slate-200 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-black text-[#1e3a8a] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#1e3a8a]" />
              Recent File Activity & Movement Stream
            </CardTitle>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">
              Live updates of latest files registered and tracked in the KW&SC system
            </p>
          </div>
          <span className="text-xs font-black bg-slate-100 text-slate-700 px-3 py-1 rounded-full border border-slate-200">
            Showing latest {Math.min(10, filteredRecords.length)} files
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-black uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Diary No / Ref</th>
                <th className="py-3.5 px-3">Subject / Purpose</th>
                <th className="py-3.5 px-3">Category</th>
                <th className="py-3.5 px-3">Mark To (Section)</th>
                <th className="py-3.5 px-3">Inward Date</th>
                <th className="py-3.5 px-3">Outward Date</th>
                <th className="py-3.5 px-4 text-right">Amount (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(recentFiles.length > 0 ? recentFiles : filteredRecords.slice(0, 10)).map((r) => (
                <tr key={r.id || r.cfo_diary_number} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-black text-[#1e3a8a] block">
                      {r.cfo_diary_number || "---"}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 font-bold block">
                      {r.receiving_number || ""}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 max-w-[220px] truncate text-slate-900 font-bold">
                    {r.subject || "No subject specified"}
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-50 text-[#1e3a8a] border border-blue-200">
                      {r.main_category || "General"}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 font-extrabold text-slate-800">
                    {r.mark_to || "---"}
                  </td>
                  <td className="py-3.5 px-3 font-mono font-bold text-slate-700">
                    {r.inward_date || "---"}
                  </td>
                  <td className="py-3.5 px-3 font-mono font-bold">
                    {r.outward_date && r.outward_date.trim() !== "" ? (
                      <span className="text-sky-800 font-black">{r.outward_date}</span>
                    ) : r.mark_to === "exited" ? (
                      <span className="text-emerald-800 font-black">Exited</span>
                    ) : (
                      <span className="text-amber-800 font-bold text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Pending Outward</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-black">
                    {r.amount ? <span className="px-1.5 py-0.5 rounded text-xs font-black" style={{ color: '#92400e', background: '#fef08a', border: '1px solid #fbbf24' }}>{formatCurrency(r.amount)}</span> : <span className="text-slate-400">---</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════════════
          7. DRILLDOWN MODAL
      ══════════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!drilldownModal} onOpenChange={() => setDrilldownModal(null)}>
        <DialogContent className="max-w-4xl bg-white border-slate-200 text-slate-900 rounded-2xl shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[#1e3a8a] flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#1e3a8a]" />
                {drilldownModal?.title} ({drilldownModal?.items.length.toLocaleString()} Files)
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs uppercase font-extrabold text-slate-600 block">Total Files in View</span>
                <span className="text-2xl font-black text-[#1e3a8a]">
                  {drilldownModal?.items.length.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs uppercase font-extrabold text-slate-600 block">Total Financial Amount</span>
                <span className="text-2xl font-black font-mono px-3 py-1 rounded-lg inline-block mt-1" style={{ color: '#92400e', background: '#fef08a', border: '1.5px solid #fbbf24' }}>
                  {formatCurrency(
                    drilldownModal?.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) || 0
                  )}
                </span>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl custom-scrollbar relative">
              {isDrilldownLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500 font-bold text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#1e3a8a]" />
                  <span>Loading records from database...</span>
                </div>
              ) : drilldownModal?.items.length === 0 ? (
                <div className="py-16 text-center text-slate-500 font-bold text-xs">
                  No records found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase sticky top-0 border-b border-slate-200 text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Diary No</th>
                    <th className="py-2.5 px-3">Subject</th>
                    <th className="py-2.5 px-3">Section</th>
                    <th className="py-2.5 px-3">Inward Date</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drilldownModal?.items.slice(0, 50).map((item) => (
                    <tr key={item.id || item.cfo_diary_number} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-black text-[#1e3a8a]">
                        {item.cfo_diary_number || "---"}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-800 font-bold">
                        {item.subject || "---"}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-700">
                        {item.mark_to || "---"}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-600">
                        {item.inward_date || "---"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black">
                        {item.amount ? <span className="px-1.5 py-0.5 rounded text-[11px] font-black" style={{ color: '#92400e', background: '#fef08a', border: '1px solid #fbbf24' }}>{formatCurrency(item.amount)}</span> : <span className="text-slate-400">---</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
