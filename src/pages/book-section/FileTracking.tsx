"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search,
  MapPin,
  Clock,
  History,
  FileText,
  Printer,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Building2,
  Shield,
  Calendar,
  User,
  MessageSquare,
  Save,
  Loader2,
  FileSignature,
  PenTool,
  CalendarDays,
  RotateCcw as ResetIcon,
  Trash2,
  Check,
  Upload,
  Image as ImageIcon,
  Bell,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeft,
  Plus,
  ShieldCheck, Eye,
  FileEdit,
  Inbox,
  LayoutDashboard,
  Users,
  RefreshCw,
  Network,
  ScanLine,
  Wifi,
  WifiOff,
  CloudOff, AlertTriangle
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { QRCodeCanvas } from "qrcode.react";
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppConfig, getSubCategoriesFor, sectionsToLegacy } from "@/hooks/useAppConfig";
import { logActivity } from "@/hooks/useActivityLog";
import { checkDeleteBurst } from "@/hooks/useSecurityMonitor";
import { addToOfflineQueue, syncOrphanedDirtyRecords } from "@/lib/offlineSync";
import JourneyMapModal from "@/components/JourneyMapModal";
import FileReception from "@/components/FileReception";
import { db } from "@/lib/db";
import { useSyncManager } from "@/hooks/useSyncManager";
import Fuse from "fuse.js";
import { Highlight } from "@/components/ui/Highlight";
import { CommandPalette } from "@/components/CommandPalette";
import DailyCategoryReportModal from "@/components/DailyCategoryReportModal";

const getSubCatLabel = (val: string | null) => {
  if (!val) return "---";
  const mapping: Record<string, string> = {
    'cp-fund': 'CP Fund',
    'funds': 'Funds',
    'supp-salary': 'Supp Salary',
    'house-building': 'House Building',
    'tada': 'TADA',
    'overtime': 'Overtime',
    'fund': 'Fund',
    'lpr': 'LPR',
    'pension-gratuity': 'Pension Gratuity',
    'pension-arrear': 'Pension Arrear',
    'financial-assistance': 'Financial Assistance',
    'daily-wages': 'Daily Wages',
    'daily_wages': 'Daily Wages'
  };
  return mapping[val] || val;
};

const safeFormatDate = (dateStr: any) => {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  let d;
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


const safeFormatDateTime = (dateStr: any) => {
  if (!dateStr) return new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  let d;
  if (dateStr instanceof Date) {
    d = dateStr;
  } else if (typeof dateStr === 'string') {
    d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};


const safeISOString = (dateStr?: any) => {
  if (!dateStr) return new Date().toISOString();
  let d;
  if (dateStr instanceof Date) {
    d = dateStr;
  } else if (typeof dateStr === 'string') {
    d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
};

// Helper to extract the local YYYY-MM-DD, avoiding UTC timezone shifts
const getLocalDateString = (dateStr?: string | Date | null): string => {
  const d = dateStr ? new Date(typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr + 'T00:00:00' : dateStr) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

export default function FileTracking() {
  const location = useLocation();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const tabsListContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("register");
  const [isForwardingMode, setIsForwardingMode] = useState(false);

  // Automatically ensure active tab is scrolled into view horizontally
  useEffect(() => {
    if (tabsListContainerRef.current) {
      const activeEl = tabsListContainerRef.current.querySelector<HTMLElement>('[data-state="active"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  // Filters & Pagination
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSubCategory, setFilterSubCategory] = useState<string>("all");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [filterAmount, setFilterAmount] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"active" | "exited">("active");
  const [isExitingFile, setIsExitingFile] = useState(false);
  
  // Auto-Exit Scanner State
  const [scanInput, setScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [exitModalFile, setExitModalFile] = useState<any>(null);
  const [exitModalScanInput, setExitModalScanInput] = useState("");
  
  const [approvalStatus, setApprovalStatus] = useState<"waiting" | "approved" | "rejected">("waiting");

  // Server-side pagination & filtering
  const DB_PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);

  const [contractorYearFilter, setContractorYearFilter] = useState('all');
  const [contractorMarkToFilter, setContractorMarkToFilter] = useState('all');

  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.replace(/CF0-/gi, 'CFO-'));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [coveringSlipPrintDate, setCoveringSlipPrintDate] = useState(getLocalDateString());
  const [coveringSlipCreatedDate, setCoveringSlipCreatedDate] = useState(getLocalDateString());
  const [isDuplicatePrint, setIsDuplicatePrint] = useState(false);
  
  // Auth-based role detection
  const { userRole, userName, signOut, isAdmin, verifyPassword, allowOverrideDates } = useAuth();
  const currentRole = userRole || 'cfo';
  const isFileViewer = currentRole === 'file_viewer';
  const [viewingRole, setViewingRole] = useState(currentRole);

  // Offline-first sync manager
  const { isOnline, pendingCount, syncStatus, enqueue } = useSyncManager();


  useEffect(() => {
    // Sub-CFO and Asst-CFOs behave as department users for the CFO section
    setViewingRole((currentRole === 'sub_cfo' || currentRole?.startsWith('sub_cfo_')) ? 'cfo' : currentRole);
    // File viewer only gets the view_only tab
    if (isFileViewer) {
      setActiveTab('view_only');
    }
    
    // Recover any orphaned offline records on mount
    syncOrphanedDirtyRecords(db);
  }, [currentRole, isFileViewer]);

  const isCFORole = currentRole === 'cfo' || currentRole === 'sub_cfo' || currentRole?.startsWith('sub_cfo_') || currentRole === 'admin' || isAdmin;

  // New Form State
  const [isPreEntryModalOpen, setIsPreEntryModalOpen] = useState(false);
  const [preEntryForm, setPreEntryForm] = useState({ handover_person_name: "", file_purpose: "" });
  const [isSavingForm, setIsSavingForm] = useState(false);
  // Tracks when the registration form was opened/reset
  const formStartTimeRef = useRef<number>(Date.now());
  const [fileImage, setFileImage] = useState<string>("");
  const [pendingTrackingCode, setPendingTrackingCode] = useState("");
  const [linkedPendingId, setLinkedPendingId] = useState<string | null>(null);
  const [mobileUploadSessionId, setMobileUploadSessionId] = useState<string>("");
  const [showMobileUploadQR, setShowMobileUploadQR] = useState(false);
  const [isMobileListening, setIsMobileListening] = useState(false);
  const [formData, setFormData] = useState({
    cfo_diary_number: `CFO-${new Date().getFullYear()}-${String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0')}`,
    inward_date: getLocalDateString(),
    registration_date: getLocalDateString(),
    print_date: getLocalDateString(),
    received_from: "",
    receiving_number: `RC-${Math.floor(100000 + Math.random() * 900000)}`,
    mainCategory: "",
    subCategory: "",
    subject: "",
    date_of_sign: getLocalDateString(),
    signature_data: "",
    mark_to: "",
    outward_date: getLocalDateString(),
    amount: 0,
    gross_amount: 0,
    deduction: 0,
    remarks: "",
    employee_number: "",
    voucher_code: "",
    vehicle_no: "",
    department_number: "",
    no_amount: false,
    subject_prefix: "",
    fuel_station: "",
    additional_mark_to: "",
    handover_person_name: "",
    file_purpose: "",
    budget_code: "",
  });

  const [pendingFilesList, setPendingFilesList] = useState<any[]>([]);
  const [isPendingFilesLoading, setIsPendingFilesLoading] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [reportDateFilter, setReportDateFilter] = useState("all");
  const [isDailyCategoryReportOpen, setIsDailyCategoryReportOpen] = useState(false);
  
  useEffect(() => {
    if (currentRole) {
      if (false) {
        setReportDateFilter("today");
      } else {
        setReportDateFilter("all");
      }
    }
  }, [currentRole]);
  const [customFilterStartDate, setCustomFilterStartDate] = useState("");
  const [customFilterEndDate, setCustomFilterEndDate] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isBulkEditDateModalOpen, setIsBulkEditDateModalOpen] = useState(false);
  const [bulkEditDateForm, setBulkEditDateForm] = useState({ created_date: '', print_date: '', password: '' });
  const [bulkPrintFullScreen, setBulkPrintFullScreen] = useState<any[] | null>(null);
  const [bulkModifiedRecords, _setBulkModifiedRecords] = useState<any[]>(() => {
    try {
      const saved = sessionStorage.getItem('kwsb_bulk_modified');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const setBulkModifiedRecords = (records: any[]) => {
    _setBulkModifiedRecords(records);
    try {
      if (records.length > 0) {
        sessionStorage.setItem('kwsb_bulk_modified', JSON.stringify(records));
      } else {
        sessionStorage.removeItem('kwsb_bulk_modified');
      }
    } catch { /* ignore */ }
  };
  const [allBulkModifiedRecords, setAllBulkModifiedRecords] = useState<any[]>([]);
  const [isBulkModifiedLoading, setIsBulkModifiedLoading] = useState(false);
  const [empSuggestions, setEmpSuggestions] = useState<any[]>([]);
  const [showEmpSuggestions, setShowEmpSuggestions] = useState(false);
  const [selectedEmpProfile, setSelectedEmpProfile] = useState<any>(null);
  const [isSearchingEmp, setIsSearchingEmp] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const handleDeleteRecord = async () => {
    if (isFileEditPasswordEnabled && !verifyPassword(deletePassword)) {
      toast.error("Incorrect password. Deletion failed.");
      return;
    }
    if (!recordToDelete) return;

    try {
      // Soft delete: update status to trashed instead of physical deletion
      const deletedRecord = records.find(r => r.id === recordToDelete);
      if (!deletedRecord) return;

      const newHistoryItem = {
        date: new Date().toISOString(),
        processed_by: userName || currentRole || 'Admin',
        action: "TRASHED",
        remarks: "Moved to Trash Box",
      };

      const updatedHistory = [...(deletedRecord.history || []), newHistoryItem];

      // Update local IndexedDB immediately
      await db.records.where('id').equals(recordToDelete).modify({ 
        status: 'trashed',
        history: updatedHistory,
        is_dirty: true
      });

      // Enqueue for remote update (not delete)
      await enqueue({
        action: 'update',
        table: 'file_tracking_records',
        payload: { 
          id: recordToDelete, 
          status: 'trashed',
          history: updatedHistory,
          is_dirty: true
        },
        record_id: deletedRecord?.receiving_number,
      });

      // Log delete activity
      logActivity({
        userRole: currentRole || 'unknown',
        userName: userName || sections.find(s => s.id === currentRole)?.name || currentRole || 'Unknown',
        action: 'DELETE',
        recordId: recordToDelete,
        diaryNumber: deletedRecord?.cfo_diary_number,
        receivingNumber: deletedRecord?.receiving_number,
        subject: deletedRecord?.subject,
        details: { 
          before: deletedRecord,
          after: { ...deletedRecord, status: 'trashed' } 
        }
      });

      // 🛡️ Security: Check for DELETE burst (3+ deletes/hour)
      checkDeleteBurst(
        currentRole || 'unknown',
        userName || currentRole || 'Unknown'
      );

      toast.success(isOnline ? "Record deleted successfully." : "Deleted locally. Will sync when online.");
      setIsDeleteModalOpen(false);
      setDeletePassword("");
      setRecordToDelete(null);
      fetchRecords(currentPage);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete record");
    }
  };

  const handleBulkEditDateSubmit = async () => {
    if (isFileEditPasswordEnabled && !bulkEditDateForm.password) {
      toast.error("Password required for bulk edit"); return;
    }
    
    if (isFileEditPasswordEnabled) {
      const overrideAllowed = verifyPassword(bulkEditDateForm.password);
      if (!overrideAllowed) {
        toast.error("Invalid authorization password"); return;
      }
    }

    if (!bulkEditDateForm.created_date && !bulkEditDateForm.print_date) {
      toast.error("Please provide at least one date to change."); return;
    }

    const modifiedRecords = [];
    setIsSavingForm(true);

    try {
      for (const id of selectedRecordIds) {
        const record = records.find(r => r.id === id);
        if (!record) continue;

        const updatePayload: any = {};
        if (bulkEditDateForm.created_date) {
          updatePayload.created_at = safeISOString(bulkEditDateForm.created_date + 'T00:00:00');
          updatePayload.inward_date = safeFormatDate(bulkEditDateForm.created_date); 
        }
        if (bulkEditDateForm.print_date) {
          updatePayload.print_date = bulkEditDateForm.print_date;
        }

        const newHistory = [...(record.history || []), {
          date: new Date().toISOString(),
          action: "BULK_DATE_EDITED",
          processed_by: sections.find(s => s.id === currentRole)?.name || currentRole,
        }];
        updatePayload.history = newHistory;

        await db.records.where('id').equals(id).modify({ ...updatePayload, is_dirty: true });

        await enqueue({
          action: 'update',
          table: 'file_tracking_records',
          payload: { id, ...updatePayload },
          record_id: record.receiving_number
        });
        
        modifiedRecords.push({ ...record, ...updatePayload });
        
        logActivity({
          userRole: currentRole || 'unknown',
          userName: userName || sections.find(s => s.id === currentRole)?.name || currentRole || 'Unknown',
          action: 'BULK_EDIT_DATE' as any,
          recordId: id,
          diaryNumber: record.cfo_diary_number,
          receivingNumber: record.receiving_number,
          subject: record.subject,
          details: {
            before: record,
            after: { ...record, ...updatePayload }
          }
        });
      }

      toast.success(`Successfully updated ${modifiedRecords.length} records.`);
      setIsBulkEditDateModalOpen(false);
      setBulkEditDateForm({ created_date: '', print_date: '', password: '' });
      setSelectedRecordIds([]);
      
      setBulkModifiedRecords(modifiedRecords);
      setActiveTab('bulk_modified');
      fetchRecords(currentPage); 

    } catch(err) {
       toast.error("Error updating records in bulk");
    } finally {
       setIsSavingForm(false);
    }
  };

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState<any>(null);
  const [editPassword, setEditPassword] = useState("");
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditModalOpen || !recordToEdit || !userRole || approvalStatus !== "waiting") return;
    
    const channel = supabase
      .channel('file_tracking_approval')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.receiver_role === userRole && newMsg.message.startsWith('[FILE_TRACKING_EDIT_APPROVED]::' + recordToEdit.id)) {
            toast.success("Admin approved edit request!");
            setApprovalStatus("approved");
            setIsEditModalOpen(false);
            
            // Go to edit mode
            setActiveTab("register");
            setFormData({
              ...formData,
              cfo_diary_number: recordToEdit.cfo_diary_number,
              inward_date: recordToEdit.inward_date || getLocalDateString(),
              registration_date: recordToEdit.created_at ? getLocalDateString(recordToEdit.created_at) : getLocalDateString(),
              print_date: recordToEdit.created_at ? getLocalDateString(recordToEdit.created_at) : getLocalDateString(),
              received_from: recordToEdit.received_from || "",
              receiving_number: recordToEdit.receiving_number,
              mainCategory: recordToEdit.mainCategory || recordToEdit.main_category || "",
              subCategory: recordToEdit.subCategory || recordToEdit.sub_category || "",
              subject: recordToEdit.subject || "",
              amount: recordToEdit.amount || 0,
              gross_amount: recordToEdit.gross_amount || 0,
              deduction: recordToEdit.deduction || 0,
              remarks: recordToEdit.remarks || "",
              mark_to: recordToEdit.mark_to || "cfo",
              signature_data: recordToEdit.signature_data || "",
              employee_number: recordToEdit.employee_number || "",
              voucher_code: recordToEdit.voucher_code || "",
            });
            setIsEditingMode(true);
            setEditingRecordId(recordToEdit.id);
            const existingImage = recordToEdit.file_image || (recordToEdit.history && recordToEdit.history.length > 0 && [...recordToEdit.history].reverse().find((h) => h.file_image)?.file_image) || "";
            setFileImage(existingImage);
            
          } else if (newMsg.receiver_role === userRole && newMsg.message.startsWith('[FILE_TRACKING_EDIT_REJECTED]::' + recordToEdit.id)) {
            toast.error("Admin rejected edit request.");
            setApprovalStatus("rejected");
            setIsEditModalOpen(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isEditModalOpen, recordToEdit, userRole, approvalStatus]);

  // My Tray local search
  const [traySearchQuery, setTraySearchQuery] = useState("");

  // CFO Diary register tab search
  const [cfoDiarySearchQuery, setCfoDiarySearchQuery] = useState("");
  const [isCfoDiarySearching, setIsCfoDiarySearching] = useState(false);

  const handleRequestEdit = async (record: any) => {
    setRecordToEdit(record);
    if (isAdmin) {
      setActiveTab("register");
      setFormData({
        ...formData,
        cfo_diary_number: record.cfo_diary_number,
        inward_date: record.inward_date || getLocalDateString(),
        registration_date: record.created_at ? getLocalDateString(record.created_at) : getLocalDateString(),
        print_date: record.created_at ? getLocalDateString(record.created_at) : getLocalDateString(),
        received_from: record.received_from || "",
        receiving_number: record.receiving_number,
        mainCategory: record.mainCategory || record.main_category || "",
        subCategory: record.subCategory || record.sub_category || "",
        subject: record.subject || "",
        amount: record.amount || 0,
        gross_amount: record.gross_amount || 0,
        deduction: record.deduction || 0,
        remarks: record.remarks || "",
        mark_to: record.mark_to || "cfo",
        signature_data: record.signature_data || "",
        employee_number: record.employee_number || "",
        voucher_code: record.voucher_code || "",
      });
      setIsEditingMode(true);
      setEditingRecordId(record.id);
      const existingImage = record.file_image || (record.history && record.history.length > 0 && [...record.history].reverse().find((h) => h.file_image)?.file_image) || "";
      setFileImage(existingImage);
    } else if (!isFileEditPasswordEnabled) {
      setActiveTab("register");
      setFormData({
        ...formData,
        cfo_diary_number: record.cfo_diary_number,
        inward_date: record.inward_date || getLocalDateString(),
        registration_date: record.created_at ? getLocalDateString(record.created_at) : getLocalDateString(),
        print_date: record.created_at ? getLocalDateString(record.created_at) : getLocalDateString(),
        received_from: record.received_from || "",
        receiving_number: record.receiving_number,
        mainCategory: record.mainCategory || record.main_category || "",
        subCategory: record.subCategory || record.sub_category || "",
        subject: record.subject || "",
        amount: record.amount || 0,
        gross_amount: record.gross_amount || 0,
        deduction: record.deduction || 0,
        remarks: record.remarks || "",
        mark_to: record.mark_to || "cfo",
        signature_data: record.signature_data || "",
        employee_number: record.employee_number || "",
        voucher_code: record.voucher_code || "",
      });
      setIsEditingMode(true);
      setEditingRecordId(record.id);
      const existingImage = record.file_image || (record.history && record.history.length > 0 && [...record.history].reverse().find((h) => h.file_image)?.file_image) || "";
      setFileImage(existingImage);
    } else {
      setApprovalStatus("waiting");
      setIsEditModalOpen(true);
      setEditPassword("");
      await supabase.from('messages').insert([{
        sender_role: userRole,
        sender_name: userName,
        receiver_role: 'admin',
        receiver_name: 'Admin',
        message: `[FILE_TRACKING_EDIT_REQ]::${record.id}`
      }]);
      toast.info("Approval request sent to Admin.");
    }
  };

  const handleCfoDiarySearch = async () => {
    if (!cfoDiarySearchQuery.trim()) return;
    setIsCfoDiarySearching(true);
    const q = cfoDiarySearchQuery.trim().toLowerCase().replace(/cf0-/i, 'cfo-');
    try {
      // 1️⃣ Search local Dexie first (works offline & for unsynced records)
      const allLocal = await db.records.filter(r =>
        !r.deleted_locally &&
        (
          (r.cfo_diary_number || '').toLowerCase().includes(q) ||
          (r.receiving_number || '').toLowerCase().includes(q) ||
          (r.subject || '').toLowerCase().includes(q)
        )
      ).first();

      if (allLocal) {
        await handleRequestEdit(allLocal);
        setCfoDiarySearchQuery('');
        return;
      }

      // 2️⃣ Fallback: search Supabase (for records not yet pulled locally)
      const { data, error } = await supabase
        .from('file_tracking_records' as any)
        .select('*')
        .or(`cfo_diary_number.ilike.%${cfoDiarySearchQuery.trim()}%,receiving_number.ilike.%${cfoDiarySearchQuery.trim()}%,subject.ilike.%${cfoDiarySearchQuery.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        await handleRequestEdit(data);
        setCfoDiarySearchQuery('');
      } else {
        toast.error('No record found with this CFO Diary / Receiving Number.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
    } finally {
      setIsCfoDiarySearching(false);
    }

  };

  const handleEditRecordAuth = () => {
    if (isFileEditPasswordEnabled && !verifyPassword(editPassword)) {
      toast.error("Incorrect password. Edit access denied.");
      return;
    }
    if (!recordToEdit) return;

    setIsEditModalOpen(false);
    setEditPassword("");
    setApprovalStatus("approved");
    
    setActiveTab("register");
    setFormData({
      ...formData,
      cfo_diary_number: recordToEdit.cfo_diary_number,
      inward_date: recordToEdit.inward_date || getLocalDateString(),
      registration_date: recordToEdit.created_at ? getLocalDateString(recordToEdit.created_at) : getLocalDateString(),
      print_date: recordToEdit.created_at ? getLocalDateString(recordToEdit.created_at) : getLocalDateString(),
      received_from: recordToEdit.received_from || "",
      receiving_number: recordToEdit.receiving_number,
      mainCategory: recordToEdit.mainCategory || recordToEdit.main_category || "",
      subCategory: recordToEdit.subCategory || recordToEdit.sub_category || "",
      subject: recordToEdit.subject || "",
      amount: recordToEdit.amount || 0,
      gross_amount: recordToEdit.gross_amount || 0,
      deduction: recordToEdit.deduction || 0,
      remarks: recordToEdit.remarks || "",
      mark_to: recordToEdit.mark_to || "cfo",
      signature_data: recordToEdit.signature_data || "",
      employee_number: recordToEdit.employee_number || "",
      voucher_code: recordToEdit.voucher_code || "",
      vehicle_no: recordToEdit.vehicle_no || "",
      date_of_sign: recordToEdit.date_of_sign || getLocalDateString(),
      outward_date: recordToEdit.outward_date || getLocalDateString(),
      additional_mark_to: recordToEdit.additional_mark_to || "",
      handover_person_name: recordToEdit.handover_person_name || "",
      file_purpose: recordToEdit.file_purpose || "",
    });
    setIsEditingMode(true);
    setEditingRecordId(recordToEdit.id);
    setIsForwardingMode(false);
    // Load existing image if available (from root or history)
    const existingImage = recordToEdit.file_image || (recordToEdit.history && recordToEdit.history.length > 0 && [...recordToEdit.history].reverse().find(h => h.file_image)?.file_image) || "";
    setFileImage(existingImage);
    toast.info(`Editing record: ${recordToEdit.subject}`);
  };

  const fetchNextDiaryNumber = async () => {
    const year = "2627";

    // Extract numeric suffix from role — ASST CFO-4 (sub_cfo_4) → 4, CFO/Admin → no suffix
    const role = (currentRole || 'cfo').toLowerCase();
    let userId = '';
    if (role === 'cfo' || role === 'admin') {
      userId = ''; // CFO/Admin: CFO-2627-XXXX (no middle number)
    } else {
      const match = role.match(/(\d+)$/);
      userId = match ? match[1] : '0'; // sub_cfo_4 → 4, sub_cfo → 0
    }
    const prefix = userId ? `CFO-${year}-${userId}` : `CFO-${year}`;

    // 1. Fetch from local Dexie first
    let localMatches: any[] = [];
    try {
      localMatches = await db.records
        .filter(r => (r.cfo_diary_number || '').startsWith(prefix))
        .toArray();
    } catch (e) {
      console.error("Error reading local Dexie records for diary number:", e);
    }

    // 2. Fetch from Supabase
    let supabaseData: any[] = [];
    try {
      const { data, error } = await supabase
        .from('file_tracking_records' as any)
        .select('cfo_diary_number')
        .like('cfo_diary_number', `${prefix}-%`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        supabaseData = data;
      }
    } catch (e) {
      console.error("Error fetching next diary number from Supabase:", e);
    }

    // 3. Combine both lists of diary numbers
    const allDiaryNumbers = [
      ...localMatches.map(r => r.cfo_diary_number),
      ...supabaseData.map(r => r.cfo_diary_number)
    ].filter(Boolean);

    const numericSuffixes = allDiaryNumbers
      .map(num => {
        const parts = num.split('-');
        return parseInt(parts[parts.length - 1]) || 0;
      })
      .filter(n => !isNaN(n) && n > 0);

    const nextNo = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;
    setFormData(prev => ({ ...prev, cfo_diary_number: `${prefix}-${String(nextNo).padStart(4, '0')}` }));
  };

  useEffect(() => {
    if (activeTab === 'register' && !isForwardingMode && !isEditingMode) {
      fetchNextDiaryNumber();
    }
  }, [activeTab, isForwardingMode, isEditingMode]);

  const [records, setRecords] = useState<any[]>([]);
  const [allMatchingRecords, setAllMatchingRecords] = useState<any[]>([]);

  // Helper for CSV Export
  const subCatReadable = (val: string | null | undefined) => {
    if (!val) return "---";
    return val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const mainCatReadable = (val: string | null | undefined) => {
    if (!val) return "---";
    return val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const exportToCSV = (data: any[], filename: string, rangeLabel?: string, filterInfo?: string) => {
    if (data.length === 0) return;
    const headers = [
      "S#", "Diary No", "Ref No", "Inward Date", "Subject", "Amount",
      "Main Category", "Sub Category", "Employee No", "Voucher Code", "Vehicle No",
      "Received From", "Mark To", "Outward Date", "Reg. Date", "Remarks"
    ];
    const rows = data.map((r, idx) => [
      idx + 1,
      r.cfo_diary_number || "",
      r.receiving_number || "",
      r.inward_date ? safeFormatDate(r.inward_date) : "",
      (r.subject || "").replace(/,/g, " "),
      r.amount || 0,
      mainCatReadable(r.mainCategory || r.main_category).toUpperCase(),
      subCatReadable(r.subCategory || r.sub_category),
      r.employee_number || "",
      r.voucher_code || "",
      r.vehicle_no || "",
      (r.received_from || "").replace(/,/g, " "),
      r.mark_to || "",
      r.outward_date ? safeFormatDate(r.outward_date) : "",
      r.created_at ? safeFormatDate(r.created_at) : "",
      (r.remarks || "").replace(/,/g, " ")
    ]);

    let csvContent = "KARACHI WATER & SEWERAGE CORPORATION,,,,,,,,,,,,,,\n";
    csvContent += "Finance Department - File Movement Tracking Report,,,,,,,,,,,,,,\n";
    if (rangeLabel) {
      csvContent += `Report Period: ${rangeLabel.replace(/,/g, " ")},,,,,,,,,,,,,,\n`;
    }
    if (filterInfo) {
      csvContent += `Filter: ${filterInfo.replace(/,/g, " ")},,,,,,,,,,,,,,\n`;
    }
    csvContent += `Generated At: ${new Date().toLocaleString()},,,,,,,,,,,,,,\n`;
    csvContent += `Total Records: ${data.length},,,,,,,,,,,,,,\n\n`;
    csvContent += [headers, ...rows].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for Professional PDF Export (Print-based)
  const handlePrintFullReport = (data: any[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let dateRangeLabel = "All Time Records";
    if (reportDateFilter === 'today' || reportDateFilter === 'daily') {
      dateRangeLabel = `Daily (Today: ${new Date().toLocaleDateString()})`;
    } else if (reportDateFilter === 'weekly') {
      dateRangeLabel = "Last 7 Days";
    } else if (reportDateFilter === 'monthly') {
      dateRangeLabel = "Last 30 Days";
    } else if (reportDateFilter === 'yearly') {
      dateRangeLabel = "Last 1 Year";
    } else if (reportDateFilter === 'custom') {
      const fromStr = customFilterStartDate ? safeFormatDate(customFilterStartDate) : "Beginning";
      const toStr = customFilterEndDate ? safeFormatDate(customFilterEndDate) : "Present";
      dateRangeLabel = `${fromStr} to ${toStr}`;
    }

    const categoryLabel = filterCategory === 'all' ? 'All Categories' : filterCategory.toUpperCase();
    const subCategoryLabel = filterSubCategory === 'all'
      ? (filterCategory !== 'all' ? `All ${filterCategory.toUpperCase()} Sub-Categories` : 'All Sub-Categories')
      : subCatReadable(filterSubCategory);

    const reportRows = data.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.cfo_diary_number || '---'}</strong><br/><span style="font-size:9px;color:#666">${r.receiving_number || ''}</span></td>
        <td>${r.inward_date ? safeFormatDate(r.inward_date) : '---'}</td>
        <td style="max-width:160px">${r.subject || '---'}</td>
        <td style="text-align:right;white-space:nowrap">${formatCurrency(r.amount || 0)}</td>
        <td>
          <div style="font-weight: bold; text-transform: uppercase; color: #1e40af; font-size:10px;">${mainCatReadable(r.mainCategory || r.main_category)}</div>
          ${(r.subCategory || r.sub_category) ? `<div style="font-size: 9px; color: #555; text-transform: uppercase; margin-top: 2px; font-style: italic;">${subCatReadable(r.subCategory || r.sub_category)}</div>` : ''}
        </td>
        <td>${r.received_from || '---'}</td>
        <td>
          ${r.employee_number ? `<div style="font-size:9px"><b>Emp#:</b> ${r.employee_number}</div>` : ''}
          ${r.voucher_code ? `<div style="font-size:9px"><b>Vchr:</b> ${r.voucher_code}</div>` : ''}
          ${r.vehicle_no ? `<div style="font-size:9px"><b>Veh:</b> ${r.vehicle_no}</div>` : ''}
          ${(!r.employee_number && !r.voucher_code && !r.vehicle_no) ? '---' : ''}
        </td>
        <td>${sections.find(s => s.id === r.mark_to)?.name || r.mark_to || '---'}</td>
        <td style="white-space:nowrap">${r.outward_date ? safeFormatDate(r.outward_date) : '---'}</td>
        <td style="max-width:120px;font-size:9px;color:#555">${r.remarks || '---'}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>KWSC - Finance Tracking Report</title>
          <style>
            @page { size: A4 landscape; margin: 15mm; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; font-size: 11px; }
            .report-header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 20px; }
            .logo { font-size: 20px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
            .report-title { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #333; font-weight: bold; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 11px; margin-bottom: 12px; padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
            .meta-item { display: flex; flex-direction: column; }
            .meta-label { font-size: 9px; text-transform: uppercase; color: #94a3b8; font-weight: bold; letter-spacing: 0.05em; margin-bottom: 2px; }
            .meta-value { font-weight: bold; color: #1e293b; }
            .filter-bar { display: flex; gap: 12px; align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 10px; flex-wrap: wrap; }
            .filter-tag { background: #1e40af; color: white; border-radius: 4px; padding: 2px 8px; font-weight: bold; text-transform: uppercase; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; font-size: 10px; vertical-align: top; }
            th { background-color: #1e40af !important; font-weight: bold; text-transform: uppercase; color: white; font-size: 9px; letter-spacing: 0.05em; }
            tr:nth-child(even) { background-color: #f8fafc; }
            tr:hover { background-color: #eff6ff; }
            .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
            .sig-box { border-top: 2px solid #1e40af; width: 200px; text-align: center; padding-top: 8px; font-size: 11px; font-weight: bold; color: #1e40af; }
            .total-row { background: #dbeafe !important; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="report-header">
            <div class="logo">KARACHI WATER &amp; SEWERAGE CORPORATION</div>
            <div class="report-title">Finance Department &mdash; File Movement Tracking Report</div>
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Generated By</span>
              <span class="meta-value">${userName || currentRole.toUpperCase()}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Date Range</span>
              <span class="meta-value">${dateRangeLabel}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Generated At</span>
              <span class="meta-value">${new Date().toLocaleString()}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Category Filter</span>
              <span class="meta-value">${categoryLabel}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Sub-Category Filter</span>
              <span class="meta-value">${subCategoryLabel}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Total Records</span>
              <span class="meta-value">${data.length}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>S#</th>
                <th>Diary No / Ref No</th>
                <th>Inward Date</th>
                <th>Subject</th>
                <th>Amount</th>
                <th>Category / Sub-Category</th>
                <th>Received From</th>
                <th>Emp# / Vchr / Veh</th>
                <th>Forwarded To</th>
                <th>Outward Date</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows}
            </tbody>
          </table>

          <div class="signature-section">
            <div class="sig-box">Section Head Signature</div>
            <div class="sig-box">CFO / Administrator</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Comprehensive Database Schema Reference for file_tracking_records:

  /* 
    SUPABASE SQL SCHEMA FOR file_tracking_records:
    
    CREATE TABLE file_tracking_records (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      tracking_id TEXT UNIQUE NOT NULL,
      cfo_diary_number TEXT,
      inward_date DATE,
      received_from TEXT,
      receiving_number TEXT UNIQUE,
      main_category TEXT,
      sub_category TEXT,
      subject TEXT,
      date_of_sign DATE,
      signature_data TEXT,
      mark_to TEXT,
      outward_date DATE,
      remarks TEXT,
      amount NUMERIC DEFAULT 0,
      history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  */

  const [isSignDialogOpen, setIsSignDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isJourneyMapOpen, setIsJourneyMapOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<any>(null);
  const [qrFullScreen, setQrFullScreen] = useState<{ diary: string, receiving: string, print_date?: string, created_date?: string, subject?: string, mark_to?: string, additional_mark_to?: string, history?: any[] } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.beginPath();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0ea5e9'; // primary color

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Check if canvas is empty (simplified check)
      const dataUrl = canvas.toDataURL();
      setFormData(prev => ({ ...prev, signature_data: dataUrl }));
      setIsSignDialogOpen(false);
      toast.success("E-Signature captured successfully");
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({ ...prev, signature_data: event.target?.result as string }));
        setIsSignDialogOpen(false);
        toast.success("Signature image uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  // Dynamic config from Supabase (replaces hardcoded categoryOptions & sections)
  const { mainCategories: dynMainCats, subCategories: dynSubCats, sections: dynSections, contractorAccounts, isFileEditPasswordEnabled } = useAppConfig();

  // Legacy format for backward compatibility
  const categoryOptions: Record<string, string[]> = dynMainCats.reduce((acc, mc) => {
    acc[mc.config_key] = getSubCategoriesFor(dynSubCats, mc.config_key).map(sc => sc.config_label);
    return acc;
  }, {} as Record<string, string[]>);

  // Sub-cat key lookup: label → key (needed for form saving)
  const subCatLabelToKey = (label: string, parentKey: string): string => {
    const found = dynSubCats.find(sc => sc.parent_key === parentKey && sc.config_label === label);
    return found ? found.config_key : label.toLowerCase().replace(/ /g, '_');
  };
  const handleFormReset = () => {
    // Trigger the useEffect above to fetch next number after reset
    setIsForwardingMode(false);
    setIsEditingMode(false);
    setEditingRecordId(null);
    // Setting a temporary random one which will be overwritten by the useEffect if needed
    setFormData({
      cfo_diary_number: `CFO-${new Date().getFullYear()}-${String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0')}`,
      inward_date: getLocalDateString(),
      registration_date: getLocalDateString(),
      print_date: getLocalDateString(),
      received_from: "",
      receiving_number: `RC-${Math.floor(100000 + Math.random() * 900000)}`,
      mainCategory: "",
      subCategory: "",
      subject: "",
      date_of_sign: getLocalDateString(),
      signature_data: "",
      mark_to: "",
      outward_date: getLocalDateString(),
      amount: 0,
      remarks: "",
      employee_number: "",
      voucher_code: "",
      vehicle_no: "",
      handover_person_name: "",
      file_purpose: "",
      budget_code: "",
    });
    setSelectedEmpProfile(null);
    setEmpSuggestions([]);
    setShowEmpSuggestions(false);
    setFileImage("");
    setShowMobileUploadQR(false);
    setMobileUploadSessionId("");
    fetchNextDiaryNumber();
    // Reset the form start timer for fresh registration
    formStartTimeRef.current = Date.now();
  };

  const handleEmployeeNumberChange = async (val: string) => {
    setFormData(prev => ({ ...prev, employee_number: val }));
    if (val.trim().length < 2) {
      setEmpSuggestions([]);
      setShowEmpSuggestions(false);
      return;
    }
    
    setIsSearchingEmp(true);
    try {
      const term = `%${val.trim()}%`;
      const { data, error } = await supabase
        .from('book_section_employees')
        .select('*')
        .or(`employee_no.ilike.${term},pension_no.ilike.${term},full_name.ilike.${term}`)
        .limit(10);
      
      if (!error && data) {
        setEmpSuggestions(data);
        setShowEmpSuggestions(data.length > 0);
      }
    } catch (err) {
      console.error("Employee autocomplete search failed:", err);
    } finally {
      setIsSearchingEmp(false);
    }
  };

  const handleLoadPendingRecord = async () => {
    if (!pendingTrackingCode.trim()) {
      toast.error("Please enter a tracking code");
      return;
    }
    try {
      const allLocal = await db.pendingFiles.toArray();
      let record = allLocal.find(r => r.tracking_code === pendingTrackingCode.trim());

      if (!record && isOnline) {
        const { data, error } = await supabase
          .from('file_tracking_pending')
          .select('*')
          .eq('tracking_code', pendingTrackingCode.trim())
          .maybeSingle();
        if (data) record = data;
      }

      if (record) {
        if (record.status !== 'pending') {
          toast.error("This tracking code has already been processed.");
          return;
        }
        setLinkedPendingId(record.id);
        if (record.file_image) setFileImage(record.file_image);
        setFormData(prev => ({ 
          ...prev, 
          mainCategory: record.category || "",
          subject: record.subject || prev.subject
        }));
        toast.success(`Loaded pending record: ${record.tracking_code}`);
      } else {
        toast.error("No pending record found with this tracking code.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading pending record");
    }
  };

  const handleSelectEmployee = (emp: any) => {
    const readableSubCat = emp.sub_category_regular || emp.sub_category_retired || "Claim";
    const subCatLabel = getSubCatLabel(readableSubCat);
    
    setFormData(prev => ({
      ...prev,
      employee_number: emp.employee_no || emp.pension_no || "",
      received_from: emp.full_name || "",
      amount: emp.cheque_amount || emp.total_amount || 0,
      subject: `Claim under ${subCatLabel}`
    }));
    
    setSelectedEmpProfile(emp);
    setShowEmpSuggestions(false);
    toast.success(`Verified Employee: ${emp.full_name}`);
  };

  const handleSaveForm = async (bypassDuplicateCheck?: boolean | React.MouseEvent) => {
    const isEntryOperator = currentRole === 'entry_operator';
    const isSubCategoryRequired = formData.mainCategory !== 'impress' && formData.mainCategory !== 'pol_bills';
    
    if (isEntryOperator) {
      if (!formData.cfo_diary_number) {
        toast.error("CFO Diary Number is required");
        return;
      }
    } else {
      if (!formData.cfo_diary_number || !formData.receiving_number || !formData.subject || !formData.mainCategory || (isSubCategoryRequired && !formData.subCategory) || !formData.mark_to || !formData.handover_person_name || !formData.file_purpose) {
        toast.error("Please fill all required fields");
        return;
      }
    }
    const shouldBypass = bypassDuplicateCheck === true;
    if (!isEditingMode && !isForwardingMode && !shouldBypass) {
      try {
        const inputSubject = formData.subject.trim();
        const dateToCheck = formData.inward_date;
        
        // 1. Get local records for that date (fast indexed lookup)
        let combinedRecords = await db.records.where('inward_date').equals(dateToCheck).toArray();

        // 2. Get online records for that date (only fetch id & subject, lightning fast)
        try {
          if (navigator.onLine) {
            const { data, error } = await supabase
              .from('file_tracking_records' as any)
              .select('id, subject, cfo_diary_number')
              .eq('inward_date', dateToCheck)
              .limit(100);
              
            if (!error && data) {
               // Merge avoiding duplicates
               const localIds = new Set(combinedRecords.map(r => r.id));
               const remoteUniques = data.filter(r => !localIds.has(r.id));
               combinedRecords = [...combinedRecords, ...remoteUniques];
            }
          }
        } catch (e) {
          console.warn("Online duplicate check failed (might be offline):", e);
        }

        // 3. Run Fuzzy Search (using Fuse.js)
        if (combinedRecords.length > 0 && inputSubject) {
          const fuse = new Fuse(combinedRecords, {
            keys: ['subject'],
            includeScore: true,
            threshold: 0.35 // 0.0 is perfect, 1.0 is mismatch. 0.35 allows minor typos/abbreviations
          });

          const results = fuse.search(inputSubject);
          
          if (results.length > 0) {
             const bestMatch = results[0].item;
             setDuplicateFound(bestMatch);
             setIsDuplicateDialogOpen(true);
             return;
          }
        }
      } catch (err) {
        console.error("Duplicate check error:", err);
      }
    }

    setIsSavingForm(true);

    try {
      const snapshot = {
        ...formData,
        date: new Date().toISOString(),
        processed_by: sections.find(s => s.id === currentRole)?.name,
        action: isEditingMode ? "EDITED" : (isForwardingMode ? "FORWARDED" : "REGISTERED"),
        amount: formData.amount,
        gross_amount: formData.gross_amount || 0,
        deduction: formData.deduction || 0,
        file_image: fileImage || undefined
      };

      if (isEditingMode) {
        // ── 1. Edit Existing Record ──
        const updatePayload = {
          cfo_diary_number: formData.cfo_diary_number,
          inward_date: formData.inward_date,
          received_from: formData.received_from,
          receiving_number: formData.receiving_number,
          main_category: formData.mainCategory,
          sub_category: formData.subCategory,
          subject: formData.subject,
          date_of_sign: formData.date_of_sign,
          signature_data: formData.signature_data,
          mark_to: formData.mark_to,
          outward_date: formData.outward_date,
          remarks: formData.remarks,
          amount: formData.amount,
        gross_amount: formData.gross_amount || 0,
        deduction: formData.deduction || 0,
          employee_number: formData.employee_number,
          voucher_code: formData.voucher_code,
          vehicle_no: formData.vehicle_no,
          additional_mark_to: formData.additional_mark_to,
          handover_person_name: formData.handover_person_name,
          file_purpose: formData.file_purpose,
          budget_code: formData.budget_code,
          print_date: formData.print_date || getLocalDateString(),
          created_at: formData.registration_date
            ? safeISOString(formData.registration_date + 'T00:00:00')
            : undefined,
        };

        // For local Dexie only, keep file_image on root for easy access
        const localUpdatePayload = {
          ...updatePayload,
          file_image: fileImage || undefined
        };

        // Get old record before modification for activity log diff
        const oldRecord = await db.records.where('id').equals(editingRecordId as string).first();

        // Append EDITED snapshot to history (so WhatsApp bot can detect edits)
        const editedHistory = [...(oldRecord?.history || []), snapshot];
        updatePayload.history = editedHistory;
        localUpdatePayload.history = editedHistory;

        // Update locally
        await db.records.where('id').equals(editingRecordId as string).modify({
          ...localUpdatePayload,
          is_dirty: true
        });

        // Enqueue sync task
        await enqueue({
          action: 'update',
          table: 'file_tracking_records',
          payload: { id: editingRecordId, ...updatePayload },
          record_id: formData.receiving_number,
        });

        const { file_image: _img1, signature_data: _sig1, ...safeOldRecord } = (oldRecord || {}) as any;
        const { file_image: _img2, signature_data: _sig2, ...safeUpdateRecord } = updatePayload as any;
        logActivity({
          userRole: currentRole || 'unknown',
          userName: userName || sections.find(s => s.id === currentRole)?.name || currentRole || 'Unknown',
          action: 'EDIT',
          recordId: editingRecordId || undefined,
          diaryNumber: formData.cfo_diary_number,
          receivingNumber: formData.receiving_number,
          subject: formData.subject,
          details: { 
            before: safeOldRecord,
            after: { id: editingRecordId, ...safeUpdateRecord }
          }
        });

        if (currentRole !== 'super_admin' && formData.cfo_diary_number && formData.cfo_diary_number.includes('-2026-')) {
          toast.success("Record updated successfully! (This record is restricted to Super Admin)");
        } else {
          toast.success(isOnline ? "Record updated successfully!" : "Saved locally. Will sync when online.");
          setQrFullScreen({ diary: formData.cfo_diary_number, receiving: formData.receiving_number, print_date: formData.print_date, subject: formData.subject, mark_to: formData.mark_to, additional_mark_to: formData.additional_mark_to });
        }
        handleFormReset();
        fetchRecords(0);

      } else if (isForwardingMode) {
        // ── 2. Forward Existing Record ──
        const existingRecord = await db.records.where('receiving_number').equals(formData.receiving_number).first();
        
        if (!existingRecord) {
          toast.error("Original record not found locally for forwarding. Try syncing first.");
          setIsSavingForm(false);
          return;
        }

        const newHistory = [...(existingRecord.history || []), snapshot];
        
        const updatePayload = {
          mark_to: formData.mark_to,
          remarks: formData.remarks,
          subject: formData.subject,
          main_category: formData.mainCategory,
          sub_category: formData.subCategory,
          received_from: formData.received_from,
          amount: formData.amount,
        gross_amount: formData.gross_amount || 0,
        deduction: formData.deduction || 0,
          employee_number: formData.employee_number,
          voucher_code: formData.voucher_code,
          vehicle_no: formData.vehicle_no,
          additional_mark_to: formData.additional_mark_to,
          handover_person_name: formData.handover_person_name,
          file_purpose: formData.file_purpose,
          history: newHistory
        };

        const localUpdatePayload = {
          ...updatePayload,
          file_image: fileImage || undefined
        };

        // Update locally
        await db.records.where('receiving_number').equals(formData.receiving_number).modify({
          ...localUpdatePayload,
          is_dirty: true
        });

        // Enqueue sync task
        await enqueue({
          action: 'update',
          table: 'file_tracking_records',
          payload: updatePayload,
          record_id: formData.receiving_number,
        });

        const { file_image: _imgF1, signature_data: _sigF1, ...safeExistRecord } = (existingRecord || {}) as any;
        const { file_image: _imgF2, signature_data: _sigF2, ...safeFwdRecord } = updatePayload as any;
        logActivity({
          userRole: currentRole || 'unknown',
          userName: userName || sections.find(s => s.id === currentRole)?.name || currentRole || 'Unknown',
          action: 'FORWARD',
          recordId: existingRecord.id,
          diaryNumber: formData.cfo_diary_number,
          receivingNumber: formData.receiving_number,
          subject: formData.subject,
          details: { 
            before: safeExistRecord,
            after: { ...safeExistRecord, ...safeFwdRecord }
          }
        });

        if (currentRole !== 'super_admin' && formData.cfo_diary_number && formData.cfo_diary_number.includes('-2026-')) {
          toast.success(`File forwarded to ${formData.mark_to}. (This record is restricted to Super Admin)`);
        } else {
          toast.success(isOnline ? `File forwarded to ${formData.mark_to}` : "Forwarded locally. Will sync when online.");
          setQrFullScreen({ diary: formData.cfo_diary_number, receiving: formData.receiving_number, print_date: formData.print_date, subject: formData.subject, mark_to: formData.mark_to, additional_mark_to: formData.additional_mark_to });
        }
        handleFormReset();
        fetchRecords(0);

      } else {
        // ── 3. Register New Record ──
        // Check local duplicate
        const diaryExists = await db.records.where('cfo_diary_number').equals(formData.cfo_diary_number).count();
        if (diaryExists > 0) {
          toast.error(`CFO Diary Number ${formData.cfo_diary_number} already exists locally!`);
          setIsSavingForm(false);
          return;
        }

        // const receivingExists = await db.records.where('receiving_number').equals(formData.receiving_number).count();
        // if (receivingExists > 0) {
        //   toast.error("This Receiving Number already exists locally!");
        //   setIsSavingForm(false);
        //   return;
        // }

        const trackingId = `FT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
        let tempId = '';
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          tempId = crypto.randomUUID();
        } else {
          tempId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }
        const newEntry = {
          id: tempId,
          tracking_id: trackingId,
          cfo_diary_number: formData.cfo_diary_number,
          inward_date: formData.inward_date,
          received_from: formData.received_from,
          receiving_number: formData.receiving_number,
          main_category: formData.mainCategory,
          sub_category: formData.subCategory,
          subject: formData.subject,
          date_of_sign: formData.date_of_sign,
          signature_data: formData.signature_data,
          mark_to: formData.mark_to,
          outward_date: formData.outward_date,
          remarks: formData.remarks,
          amount: formData.amount,
        gross_amount: formData.gross_amount || 0,
        deduction: formData.deduction || 0,
          employee_number: formData.employee_number,
          voucher_code: formData.voucher_code,
          vehicle_no: formData.vehicle_no,
          additional_mark_to: formData.additional_mark_to,
          handover_person_name: formData.handover_person_name,
          file_purpose: formData.file_purpose,
          budget_code: formData.budget_code,
          print_date: formData.print_date || getLocalDateString(),
          history: [snapshot],
          created_at: formData.registration_date
            ? safeISOString(formData.registration_date + 'T00:00:00')
            : new Date().toISOString()
        };

        const localNewEntry = {
          ...newEntry,
          file_image: fileImage || undefined
        };

        // Insert locally
        await db.records.add({
          ...localNewEntry,
          is_dirty: true,
          deleted_locally: false
        });

        // Enqueue sync
        await enqueue({
          action: 'insert',
          table: 'file_tracking_records',
          payload: newEntry,
          record_id: formData.receiving_number,
        });

        // Calculate how long the user took to fill the registration form
        const formFillDurationMs = Date.now() - formStartTimeRef.current;
        const { file_image: _nImg, signature_data: _nSig, ...safeNewEntry } = newEntry as any;
        logActivity({
          userRole: currentRole || 'unknown',
          userName: userName || sections.find(s => s.id === currentRole)?.name || currentRole || 'Unknown',
          action: 'REGISTER',
          recordId: undefined,
          diaryNumber: formData.cfo_diary_number,
          receivingNumber: formData.receiving_number,
          subject: formData.subject,
          details: { ...safeNewEntry, form_fill_duration_ms: formFillDurationMs }
        });

        if (linkedPendingId) {
          const completedAt = new Date().toISOString();
          await db.pendingFiles.where('id').equals(linkedPendingId).modify({ status: 'completed', completed_at: completedAt, is_dirty: true });
          await enqueue({
            action: 'update',
            table: 'file_tracking_pending',
            payload: { id: linkedPendingId, status: 'completed', completed_at: completedAt },
            record_id: pendingTrackingCode,
          });
          setLinkedPendingId(null);
          setPendingTrackingCode("");
        }

        if (currentRole !== 'super_admin' && formData.cfo_diary_number && formData.cfo_diary_number.includes('-2026-')) {
          toast.success("File registered successfully. (This record is restricted to Super Admin)");
        } else {
          toast.success(isOnline ? `File registered successfully` : "Registered offline. Will sync when online.");
          setQrFullScreen({ diary: formData.cfo_diary_number, receiving: formData.receiving_number, print_date: formData.print_date, subject: formData.subject, mark_to: formData.mark_to, additional_mark_to: formData.additional_mark_to });
        }
        handleFormReset();
        fetchRecords(0);
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error saving record locally");
    } finally {
      setIsSavingForm(false);
    }
  };

  const [isPrintingQR, setIsPrintingQR] = useState(false);
  const [isPrintingQRMinimal, setIsPrintingQRMinimal] = useState(false);
  const [isPrintingCovering, setIsPrintingCovering] = useState(false);
  
  const handlePrintQR = async () => {
    if (qrFullScreen && (qrFullScreen.created_date || qrFullScreen.print_date)) {
      const ticket = records.find(r => r.cfo_diary_number === qrFullScreen.diary || r.receiving_number === qrFullScreen.receiving);
      if (ticket) {
        const updatePayload: any = {};
        if (qrFullScreen.created_date) {
          updatePayload.created_at = safeISOString(qrFullScreen.created_date + 'T00:00:00');
          updatePayload.inward_date = safeFormatDate(qrFullScreen.created_date); 
        }
        if (qrFullScreen.print_date) {
          updatePayload.print_date = qrFullScreen.print_date;
        }

        const newHistory = [...(ticket.history || []), {
          date: new Date().toISOString(),
          action: "BULK_DATE_EDITED",
          processed_by: sections.find((s: any) => s.id === currentRole)?.name || currentRole,
        }];
        updatePayload.history = newHistory;

        try {
          await db.records.where('id').equals(ticket.id).modify({ ...updatePayload, is_dirty: true });
          await enqueue({
            action: 'update',
            table: 'file_tracking_records',
            payload: { id: ticket.id, ...updatePayload },
            record_id: ticket.receiving_number
          });
          
          logActivity({
            userRole: currentRole || 'unknown',
            userName: userName || sections.find((s: any) => s.id === currentRole)?.name || currentRole || 'Unknown',
            action: 'BULK_EDIT_DATE' as any,
            recordId: ticket.id,
            diaryNumber: ticket.cfo_diary_number,
            receivingNumber: ticket.receiving_number,
            subject: ticket.subject,
            details: {
              before: ticket,
              after: { ...ticket, ...updatePayload }
            }
          });
          
          setRecords(prev => prev.map(r => r.id === ticket.id ? { ...r, ...updatePayload } : r));
        } catch (err) {
          console.error("Error saving date override during print:", err);
        }
      }
    }

    setIsPrintingQR(true);
    document.body.classList.add('printing-qr-ticket');
    setTimeout(() => {
      window.print();
    }, 300);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-qr-ticket');
      document.body.classList.remove('thermal-mode');
      setIsPrintingQR(false);
      setIsPrintingQRMinimal(false);
      setIsPrintingCovering(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handlePrintQRMinimal = () => {
    setIsPrintingQRMinimal(true);
    document.body.classList.add('thermal-mode');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('thermal-mode');
      setIsPrintingQRMinimal(false);
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'button') return; // Let buttons act naturally

      e.preventDefault();
      const formContainer = document.getElementById('registration-form-container');
      if (!formContainer) return;

      const focusableElements = Array.from(
        formContainer.querySelectorAll('input:not([readonly]):not([disabled]), button[role="combobox"]:not([disabled]), textarea:not([disabled])')
      );

      const index = focusableElements.indexOf(target);
      if (index > -1 && index < focusableElements.length - 1) {
        const nextEl = focusableElements[index + 1] as HTMLElement;
        nextEl.focus();
        nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  useEffect(() => {
    setCurrentPage(0);
  }, [filterCategory, filterSubCategory, filterSection, filterAmount, filterStatus, sortOrder, debouncedSearchQuery, activeTab, viewingRole, reportDateFilter, customFilterStartDate, customFilterEndDate, contractorYearFilter, contractorMarkToFilter]);

  const handleRestoreRecord = async (file: any) => {
    try {
      let previousStatus = 'active';
      if (file.history) {
        // Look for the last non-TRASHED action to determine if it was EXITED or just active
        const lastAction = [...file.history].reverse().find((h: any) => h.action !== 'TRASHED' && h.action !== 'RESTORED');
        if (lastAction && lastAction.action === 'EXITED') {
           previousStatus = 'exited';
        }
      }

      const newHistoryItem = {
        date: new Date().toISOString(),
        processed_by: userName || currentRole || 'Admin',
        action: "RESTORED",
        remarks: "Restored from Trash Box",
      };

      const updatedHistory = [...(file.history || []), newHistoryItem];

      // Update local IndexedDB
      await db.records.where('id').equals(file.id).modify({ 
        status: previousStatus,
        history: updatedHistory,
        is_dirty: true
      });

      // Enqueue remote update
      await enqueue({
        action: 'update',
        table: 'file_tracking_records',
        payload: { 
          id: file.id, 
          status: previousStatus,
          history: updatedHistory,
          is_dirty: true
        },
        record_id: file.receiving_number,
      });
      
      toast.success("Record restored successfully.");
      fetchRecords(currentPage);
    } catch (err: any) {
      toast.error("Failed to restore record.");
    }
  };

  const fetchRecords = async (page = 0) => {
    setIsLoading(true);
    
    const applyLocalFilters = (data: any[]) => {
      let mapped = [...data].sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return sortOrder === 'asc' ? da - db : db - da;
      });

      // GLOBAL RESTRICTION: Hide 2026 CFO Diary Numbers from non-superadmins
      if (currentRole !== 'super_admin' && activeTab !== 'contractor_bills') {
        mapped = mapped.filter(r => !(r.cfo_diary_number && r.cfo_diary_number.includes('-2026-')));
      }

      mapped = mapped.map((d: any) => ({
        ...d,
        mainCategory: d.main_category || d.mainCategory,
        subCategory: d.sub_category || d.subCategory,
      }));

      // 1. Role-based & Status filters
      if (activeTab === 'trash_box') {
        mapped = mapped.filter(r => r.status === 'trashed');
      } else {
        mapped = mapped.filter(r => r.status !== 'trashed');
        
        if (activeTab === 'tray' || activeTab === 'timeline' || activeTab === 'returned_files') {
          const effectiveRole = effectiveViewingRole;
          const isCfoOrAdmin = currentRole === 'cfo' || currentRole?.startsWith('sub_cfo') || isAdmin;
          
          if (!isCfoOrAdmin) {
            if (activeTab === 'tray') {
              mapped = mapped.filter(r => r.mark_to === effectiveRole);
            } else if (activeTab === 'returned_files') {
              mapped = mapped.filter(r => r.additional_mark_to === currentRole);
            } else {
              mapped = mapped.filter(r => r.mark_to === effectiveRole || (r.history && r.history.some((h: any) => h.processed_by === sections.find(s => s.id === effectiveRole)?.name)));
            }
          } else {
            if (activeTab === 'tray') {
              mapped = mapped.filter(r => r.mark_to === effectiveRole);
            } else if (activeTab === 'returned_files') {
              if (viewingRole === 'cfo' || viewingRole === 'admin') {
                mapped = mapped.filter(r => r.additional_mark_to);
              } else {
                mapped = mapped.filter(r => r.additional_mark_to === effectiveRole);
              }
            }
          }
        } else if (activeTab === 'cfo_all_files') {
          if (filterStatus === 'exited') {
            mapped = mapped.filter(r => r.mark_to === 'exited');
          } else {
            mapped = mapped.filter(r => r.mark_to === 'cfo');
          }
        } else if (activeTab === 'bulk_modified') {
          mapped = mapped.filter(r => r.history && r.history.some((h: any) => h.action === 'BULK_DATE_EDITED'));
        } else if (activeTab === 'backdate_2026') {
          mapped = mapped.filter(r => r.cfo_diary_number && r.cfo_diary_number.includes('-2026-'));
        } else if (activeTab === 'contractor_bills') {
          // Keep only contractor + contractor bills records
          mapped = mapped.filter(r =>
            (r.main_category || r.mainCategory || '').toLowerCase().includes('contractor') &&
            (r.sub_category || r.subCategory || '').toLowerCase().includes('contractor') &&
            (r.sub_category || r.subCategory || '').toLowerCase().includes('bill')
          );
          // Year filter
          if (contractorYearFilter !== 'all') {
            mapped = mapped.filter(r => (r.cfo_diary_number || '').includes(contractorYearFilter));
          }
          // Mark-to filter
          if (contractorMarkToFilter !== 'all') {
            mapped = mapped.filter(r => (r.mark_to || '').toLowerCase() === contractorMarkToFilter.toLowerCase());
          }
        }
      }

      // 2. Category & Section Filters
      if (filterCategory !== 'all') mapped = mapped.filter(r => r.mainCategory === filterCategory);
      if (filterSubCategory !== 'all') mapped = mapped.filter(r => r.subCategory === filterSubCategory);
      if (filterSection !== 'all') mapped = mapped.filter(r => r.mark_to === filterSection);
      if (filterAmount === 'above_2_lac') mapped = mapped.filter(r => (r.amount || 0) > 200000);
      if (filterAmount === 'below_2_lac') mapped = mapped.filter(r => (r.amount || 0) <= 200000);

      // 3. Search Filter (Comprehensive Multi-Field Search)
      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.trim().toLowerCase();
        mapped = mapped.filter((r: any) => {
          const diary = (r.cfo_diary_number || '').toLowerCase();
          const recv = (r.receiving_number || '').toLowerCase();
          const subj = (r.subject || '').toLowerCase();
          const from = (r.received_from || '').toLowerCase();
          const track = (r.tracking_id || '').toLowerCase();
          const handover = (r.handover_person_name || '').toLowerCase();
          const empNo = (r.employee_number || r.emp_no || '').toLowerCase();
          const empName = (r.emp_name || r.party_name || '').toLowerCase();
          const voucher = (r.voucher_code || '').toLowerCase();
          const vehicle = (r.vehicle_no || '').toLowerCase();
          const purpose = (r.file_purpose || '').toLowerCase();
          const remarks = (r.remarks || '').toLowerCase();
          const cat = (r.mainCategory || r.main_category || '').toLowerCase();
          const subCat = (r.subCategory || r.sub_category || '').toLowerCase();
          const markTo = (r.mark_to || '').toLowerCase();
          const amountStr = String(r.amount || '');

          return (
            diary.includes(q) ||
            recv.includes(q) ||
            subj.includes(q) ||
            from.includes(q) ||
            track.includes(q) ||
            handover.includes(q) ||
            empNo.includes(q) ||
            empName.includes(q) ||
            voucher.includes(q) ||
            vehicle.includes(q) ||
            purpose.includes(q) ||
            remarks.includes(q) ||
            cat.includes(q) ||
            subCat.includes(q) ||
            markTo.includes(q) ||
            amountStr.includes(q)
          );
        });
      }

      // 4. Date Filter (Robust Local Calendar Comparison)
      if (reportDateFilter !== 'all') {
        const now = new Date();
        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (reportDateFilter === 'today' || reportDateFilter === 'daily') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (reportDateFilter === 'yesterday') {
          const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
          endDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
        } else if (reportDateFilter === 'weekly') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date();
        } else if (reportDateFilter === 'monthly') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date();
        } else if (reportDateFilter === 'yearly') {
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          endDate = new Date();
        } else if (reportDateFilter === 'custom') {
          if (customFilterStartDate) {
            const [y, m, d] = customFilterStartDate.split('-').map(Number);
            startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
          }
          if (customFilterEndDate) {
            const [y, m, d] = customFilterEndDate.split('-').map(Number);
            endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
          }
        }

        mapped = mapped.filter((r: any) => {
          const rDate = r.created_at ? new Date(r.created_at) : (r.inward_date ? new Date(r.inward_date) : null);
          if (!rDate || isNaN(rDate.getTime())) return false;
          if (startDate && rDate < startDate) return false;
          if (endDate && rDate > endDate) return false;
          return true;
        });
      }

      return mapped;
    };

    // Load from IndexedDB immediately (limit to 100 recent/dirty records for sub-10ms render)
    try {
      const localData = await db.records.filter(r => !r.deleted_locally).limit(100).toArray();
      if (localData.length > 0) {
        const filteredLocal = applyLocalFilters(localData);
        setRecords(filteredLocal);
        setTotalRecords(filteredLocal.length);
        setAllMatchingRecords(filteredLocal);
      }
    } catch (localErr) {
      console.error("IndexedDB load error:", localErr);
    }

    try {
      const from = page * DB_PAGE_SIZE;
      const to = from + DB_PAGE_SIZE - 1;

      // Fast slim column selection for table rows (excludes heavy base64 signature_data & file_image)
      const tableSelectColumns = 'id, tracking_id, cfo_diary_number, receiving_number, inward_date, outward_date, main_category, sub_category, subject, mark_to, amount, gross_amount, deduction, received_from, employee_number, voucher_code, vehicle_no, print_date, handover_person_name, file_purpose, budget_code, remarks, created_at, date_of_sign' + (activeTab === 'bulk_modified' || activeTab === 'timeline' ? ', history' : '');

      let query = supabase
        .from('file_tracking_records' as any)
        .select(tableSelectColumns, { count: 'exact' });

      // Remove status filtering from Supabase query since the column doesn't exist in Supabase.
      // Trashed files will be fetched but filtered out locally in UI, or we can filter by history.
      if (activeTab === 'trash_box' && isAdmin) {
        // Only fetch records where history contains "TRASHED"
        query = query.contains('history', '[{"action": "TRASHED"}]');
      } else {
        // Fetch all records, we rely on local IndexedDB to filter out 'trashed' status
      }
        
        if (activeTab === 'tray' || activeTab === 'timeline' || activeTab === 'returned_files') {
        const effectiveRole = effectiveViewingRole;
        if (!(currentRole === 'cfo' || isAdmin)) {
          if (activeTab === 'tray') {
            query = query.eq('mark_to', effectiveRole);
          } else if (activeTab === 'returned_files') {
            query = query.eq('additional_mark_to', currentRole);
          } else {
            query = query.or(`mark_to.eq.${effectiveRole},history.cs.[{"processed_by":"${sections.find(s => s.id === effectiveRole)?.name}"}]`);
          }
        } else if (currentRole === 'cfo' || isAdmin) {
          if (activeTab === 'tray') {
            query = query.eq('mark_to', effectiveRole);
          } else if (activeTab === 'returned_files') {
            if (viewingRole === 'cfo' || viewingRole === 'admin') {
              query = query.not('additional_mark_to', 'is', null).neq('additional_mark_to', '');
            } else {
              query = query.eq('additional_mark_to', effectiveRole);
            }
          }
        }
      } else if (activeTab === 'cfo_all_files') {
        if (filterStatus === 'exited') {
          query = query.eq('mark_to', 'exited');
        } else {
          query = query.eq('mark_to', 'cfo');
        }
      } else if (activeTab === 'bulk_modified') {
        query = query.contains('history', '[{"action": "BULK_DATE_EDITED"}]');
      } else if (activeTab === 'backdate_2026') {
        query = query.like('cfo_diary_number', '%-2026-%');
      } else if (activeTab === 'contractor_bills') {
        // Filter by contractor category and contractor bills sub-category
        query = query.ilike('main_category', '%contractor%').ilike('sub_category', '%contractor%bill%');
        // Year filter
        if (contractorYearFilter !== 'all') {
          query = query.ilike('cfo_diary_number', `%${contractorYearFilter}%`);
        }
        // Mark-to filter (cia / budget)
        if (contractorMarkToFilter !== 'all') {
          query = query.eq('mark_to', contractorMarkToFilter);
        }
      }

      // Apply Category filter
      if (filterCategory !== 'all') {
        query = query.eq('main_category', filterCategory);
      }

      // Apply Sub-Category filter
      if (filterSubCategory !== 'all') {
        query = query.eq('sub_category', filterSubCategory);
      }

      // Apply Section filter
      if (filterSection !== 'all') {
        query = query.eq('mark_to', filterSection);
      }

      // Apply Amount filter
      if (filterAmount === 'above_2_lac') {
        query = query.gt('amount', 200000);
      } else if (filterAmount === 'below_2_lac') {
        query = query.lte('amount', 200000);
      }

      // Apply Date filter
      if (reportDateFilter !== 'all') {
        const now = new Date();
        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (reportDateFilter === 'today' || reportDateFilter === 'daily') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (reportDateFilter === 'yesterday') {
          const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
          endDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
        } else if (reportDateFilter === 'weekly') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
        } else if (reportDateFilter === 'monthly') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        } else if (reportDateFilter === 'yearly') {
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        } else if (reportDateFilter === 'custom') {
          if (customFilterStartDate) {
            const [y, m, d] = customFilterStartDate.split('-').map(Number);
            startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
          }
          if (customFilterEndDate) {
            const [y, m, d] = customFilterEndDate.split('-').map(Number);
            endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
          }
        }

        if (startDate) {
          query = query.gte('created_at', safeISOString(startDate));
        }
        if (endDate) {
          query = query.lte('created_at', safeISOString(endDate));
        }
      }

      // Apply Search filter
      if (debouncedSearchQuery) {
        const q = `%${debouncedSearchQuery.toLowerCase()}%`;
        query = query.or(`cfo_diary_number.ilike.${q},receiving_number.ilike.${q},subject.ilike.${q},received_from.ilike.${q},tracking_id.ilike.${q},handover_person_name.ilike.${q},employee_number.ilike.${q},voucher_code.ilike.${q},vehicle_no.ilike.${q},file_purpose.ilike.${q}`);
      }

      // 1. Build the paginated query
      const pagedQueryPromise = query
        .order('created_at', { ascending: sortOrder === 'asc' })
        .range(from, to);

      // 2. Build the query to get all matching records for statistics & global selection (slim metadata, no heavy histories)
      let selectFields = 'id, amount, main_category, sub_category, mark_to, created_at';
      if (activeTab === 'bulk_modified') {
        selectFields += ', history';
      }

      let allQuery = supabase
        .from('file_tracking_records' as any)
        .select(selectFields);

      // Status filters
      if (activeTab === 'trash_box' && isAdmin) {
        allQuery = allQuery.contains('history', '[{"action": "TRASHED"}]');
      }

      if (activeTab === 'tray' || activeTab === 'timeline' || activeTab === 'returned_files') {
        const effectiveRole = effectiveViewingRole;
        if (!(currentRole === 'cfo' || isAdmin)) {
          if (activeTab === 'tray') {
            allQuery = allQuery.eq('mark_to', effectiveRole);
          } else if (activeTab === 'returned_files') {
            allQuery = allQuery.eq('additional_mark_to', currentRole);
          } else {
            allQuery = allQuery.or(`mark_to.eq.${effectiveRole},history.cs.[{"processed_by":"${sections.find(s => s.id === effectiveRole)?.name}"}]`);
          }
        } else if (currentRole === 'cfo' || isAdmin) {
          if (activeTab === 'tray') {
            allQuery = allQuery.eq('mark_to', effectiveRole);
          } else if (activeTab === 'returned_files') {
            if (viewingRole === 'cfo' || viewingRole === 'admin') {
              allQuery = allQuery.not('additional_mark_to', 'is', null).neq('additional_mark_to', '');
            } else {
              allQuery = allQuery.eq('additional_mark_to', effectiveRole);
            }
          }
        }
      } else if (activeTab === 'cfo_all_files') {
        if (filterStatus === 'exited') {
          allQuery = allQuery.eq('mark_to', 'exited');
        } else {
          allQuery = allQuery.eq('mark_to', 'cfo');
        }
      } else if (activeTab === 'bulk_modified') {
        allQuery = allQuery.contains('history', '[{"action": "BULK_DATE_EDITED"}]');
      } else if (activeTab === 'backdate_2026') {
        allQuery = allQuery.like('cfo_diary_number', '%-2026-%');
      }

      if (filterCategory !== 'all') {
        allQuery = allQuery.eq('main_category', filterCategory);
      }

      if (filterSubCategory !== 'all') {
        allQuery = allQuery.eq('sub_category', filterSubCategory);
      }

      if (filterSection !== 'all') {
        allQuery = allQuery.eq('mark_to', filterSection);
      }

      if (filterAmount === 'above_2_lac') {
        allQuery = allQuery.gt('amount', 200000);
      } else if (filterAmount === 'below_2_lac') {
        allQuery = allQuery.lte('amount', 200000);
      }

      if (reportDateFilter !== 'all') {
        const now = new Date();
        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (reportDateFilter === 'today' || reportDateFilter === 'daily') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (reportDateFilter === 'yesterday') {
          const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          startDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
          endDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
        } else if (reportDateFilter === 'weekly') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
        } else if (reportDateFilter === 'monthly') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        } else if (reportDateFilter === 'yearly') {
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        } else if (reportDateFilter === 'custom') {
          if (customFilterStartDate) {
            const [y, m, d] = customFilterStartDate.split('-').map(Number);
            startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
          }
          if (customFilterEndDate) {
            const [y, m, d] = customFilterEndDate.split('-').map(Number);
            endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
          }
        }

        if (startDate) {
          allQuery = allQuery.gte('created_at', safeISOString(startDate));
        }
        if (endDate) {
          allQuery = allQuery.lte('created_at', safeISOString(endDate));
        }
      }

      if (debouncedSearchQuery) {
        const q = `%${debouncedSearchQuery.toLowerCase()}%`;
        allQuery = allQuery.or(`cfo_diary_number.ilike.${q},receiving_number.ilike.${q},subject.ilike.${q},received_from.ilike.${q},tracking_id.ilike.${q},handover_person_name.ilike.${q},employee_number.ilike.${q},voucher_code.ilike.${q},vehicle_no.ilike.${q},file_purpose.ilike.${q}`);
      }

      const allQueryPromise = allQuery
        .order('created_at', { ascending: sortOrder === 'asc' })
        .limit(1000);

      // 3. Execute queries in parallel
      const [pagedResult, allResult] = await Promise.all([pagedQueryPromise, allQueryPromise]);

      if (pagedResult.error) throw pagedResult.error;
      if (allResult.error) throw allResult.error;

      const data = pagedResult.data;
      const count = pagedResult.count;
      const allData = allResult.data;

      if (allData) {
        const mappedAll = (allData as any[]).map(d => ({
          ...d,
          mainCategory: d.main_category,
          subCategory: d.sub_category,
        }));
        const filteredAll = applyLocalFilters(mappedAll);
        setAllMatchingRecords(filteredAll);
      }

      if (data) {
        const mappedData = (data as any[]).map(d => ({
          ...d,
          mainCategory: d.main_category,
          subCategory: d.sub_category,
        }));
        
        // ── Save to IndexedDB for offline access ──
        try {
          await db.records.bulkPut(mappedData.map((r: any) => ({
            ...r,
            is_dirty: false,
            deleted_locally: false
          })));
        } catch (bulkErr) {
          console.error("bulkPut error:", bulkErr);
        }

        // MERGE: Retrieve local records not returned by Supabase query
        // This handles two cases:
        // 1. is_dirty=true records (not yet synced to Supabase)
        // 2. Any local record missing from Supabase results (e.g. sync failed, wrong project, etc.)
        const rawLocalDirtyRecords = await db.records.filter(r => r.is_dirty && !r.deleted_locally).toArray();
        let mergedData = [...mappedData];
        
        rawLocalDirtyRecords.forEach(localRecord => {
          const idx = mergedData.findIndex(d => d.receiving_number === localRecord.receiving_number);
          if (idx === -1) {
            mergedData.unshift(localRecord);
          } else {
            mergedData[idx] = localRecord;
          }
        });

        // If Supabase returned 0 results due to a search query, also include any
        // local (non-dirty) records that match — so locally-only records always appear in search
        if (mappedData.length === 0 && debouncedSearchQuery) {
          const q = debouncedSearchQuery.toLowerCase().replace(/cf0-/gi, 'cfo-');
          const extraLocalMatches = await db.records.filter(r =>
            !r.deleted_locally &&
            !rawLocalDirtyRecords.some(d => d.receiving_number === r.receiving_number) &&
            (
              (r.cfo_diary_number || '').toLowerCase().includes(q) ||
              (r.receiving_number || '').toLowerCase().includes(q) ||
              (r.subject || '').toLowerCase().includes(q) ||
              (r.tracking_id || '').toLowerCase().includes(q) ||
              (r.received_from || '').toLowerCase().includes(q)
            )
          ).toArray();
          extraLocalMatches.forEach(localRecord => {
            const idx = mergedData.findIndex(d => d.receiving_number === localRecord.receiving_number);
            if (idx === -1) mergedData.unshift(localRecord);
          });
        }

        mergedData = applyLocalFilters(mergedData);
        setRecords(mergedData);
        setTotalRecords((count || 0) + Math.max(0, mergedData.length - mappedData.length));
        setCurrentPage(page);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      // ── Offline fallback already handled at start of function ──
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  };

  const fetchBulkModifiedRecords = async () => {
    setIsBulkModifiedLoading(true);
    try {
      // First load from IndexedDB (offline support)
      const localData = await db.records.filter((r: any) =>
        !r.deleted_locally && r.history && r.history.some((h: any) => h.action === 'BULK_DATE_EDITED')
      ).toArray();
      
      let allMapped: any[] = [];

      if (localData.length > 0) {
        allMapped = localData.map((d: any) => ({
          ...d,
          mainCategory: d.main_category || d.mainCategory,
          subCategory: d.sub_category || d.subCategory,
        }));
        setAllBulkModifiedRecords(allMapped);
      }

      // Fetch diary numbers from activity_log
      const { data: logData, error: logError } = await (supabase as any)
        .from('activity_log')
        .select('diary_number')
        .eq('action', 'BULK_EDIT_DATE');

      if (!logError && logData && logData.length > 0) {
        const diaryNumbers = [...new Set(logData.map((l: any) => l.diary_number).filter(Boolean))];
        
        if (diaryNumbers.length > 0) {
          // Then fetch from Supabase
          const { data, error } = await (supabase as any)
            .from('file_tracking_records')
            .select('*')
            .in('cfo_diary_number', diaryNumbers)
            .order('created_at', { ascending: false });

          if (!error && data) {
            const mapped = (data as any[]).map(d => ({
              ...d,
              mainCategory: d.main_category,
              subCategory: d.sub_category,
            }));
            
            // Merge local and remote
            const combined = [...mapped];
            allMapped.forEach(localRecord => {
              if (!combined.find(r => r.id === localRecord.id)) {
                combined.push(localRecord);
              }
            });
            
            setAllBulkModifiedRecords(combined);
          }
        }
      }
    } catch (err) {
      console.error("fetchBulkModifiedRecords error:", err);
    } finally {
      setIsBulkModifiedLoading(false);
    }
  };

  const handleBulkExport = async (format: 'csv' | 'pdf') => {

    setIsLoading(true);
    toast.info(`Fetching all records for ${format.toUpperCase()} export...`);
    try {
      const sectionName = sections.find(s => s.id === effectiveViewingRole)?.name || effectiveViewingRole;

      let query = supabase
        .from('file_tracking_records' as any)
        .select(
          'id, tracking_id, cfo_diary_number, inward_date, received_from, receiving_number, main_category, sub_category, subject, mark_to, outward_date, remarks, amount, created_at, employee_number, voucher_code, vehicle_no'
        );

      if (selectedRecordIds.length > 0) {
        query = query.in('id', selectedRecordIds);
      } else {
        // Apply same filters as fetchRecords
        if (activeTab === 'tray' || activeTab === 'timeline') {
          const effectiveRole = effectiveViewingRole;
          if (!(currentRole === 'cfo' || isAdmin)) {
            if (activeTab === 'tray') {
              query = query.eq('mark_to', effectiveRole);
            } else {
              query = query.or(`mark_to.eq.${effectiveRole},history.cs.[{"processed_by":"${sectionName}"}]`);
            }
          } else if (currentRole === 'cfo' || isAdmin) {
            if (activeTab === 'tray') {
              query = query.eq('mark_to', effectiveRole);
            }
          }
        } else if (activeTab === 'cfo_all_files') {
          if (filterStatus === 'exited') {
            query = query.eq('mark_to', 'exited');
          } else {
            query = query.neq('mark_to', 'exited');
          }
        }

        if (filterCategory !== 'all') {
          query = query.eq('main_category', filterCategory);
        }

        if (filterSubCategory !== 'all') {
          query = query.eq('sub_category', filterSubCategory);
        }

        if (filterSection !== 'all') {
          query = query.eq('mark_to', filterSection);
        }

        if (filterAmount === 'above_2_lac') {
          query = query.gt('amount', 200000);
        } else if (filterAmount === 'below_2_lac') {
          query = query.lte('amount', 200000);
        }

        if (reportDateFilter !== 'all') {
          const now = new Date();
          let startDate: Date | null = null;
          let endDate: Date | null = null;

          if (reportDateFilter === 'today' || reportDateFilter === 'daily') {
            startDate = new Date(now.setHours(0, 0, 0, 0));
          } else if (reportDateFilter === 'weekly') {
            startDate = new Date(now.setDate(now.getDate() - 7));
          } else if (reportDateFilter === 'monthly') {
            startDate = new Date(now.setMonth(now.getMonth() - 1));
          } else if (reportDateFilter === 'yearly') {
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          } else if (reportDateFilter === 'custom') {
            if (customFilterStartDate) {
              startDate = new Date(customFilterStartDate);
              startDate.setHours(0, 0, 0, 0);
            }
            if (customFilterEndDate) {
              endDate = new Date(customFilterEndDate);
              endDate.setHours(23, 59, 59, 999);
            }
          }

          if (startDate) {
            query = query.gte('created_at', safeISOString(startDate));
          }
          if (endDate) {
            query = query.lte('created_at', safeISOString(endDate));
          }
        }

        if (debouncedSearchQuery) {
          const q = `%${debouncedSearchQuery.toLowerCase()}%`;
          query = query.or(`cfo_diary_number.ilike.${q},receiving_number.ilike.${q},subject.ilike.${q},received_from.ilike.${q},tracking_id.ilike.${q}`);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: sortOrder === 'asc' });

      if (error) throw error;

      if (data && data.length > 0) {
        const mappedData = (data as any[]).map(d => ({
          ...d,
          mainCategory: d.main_category,
          subCategory: d.sub_category,
        }));

        let dateRangeLabel = "All Time Records";
        if (reportDateFilter === 'today' || reportDateFilter === 'daily') {
          dateRangeLabel = `Daily (Today: ${new Date().toLocaleDateString()})`;
        } else if (reportDateFilter === 'weekly') {
          dateRangeLabel = "Last 7 Days";
        } else if (reportDateFilter === 'monthly') {
          dateRangeLabel = "Last 30 Days";
        } else if (reportDateFilter === 'yearly') {
          dateRangeLabel = "Last 1 Year";
        } else if (reportDateFilter === 'custom') {
          const fromStr = customFilterStartDate ? safeFormatDate(customFilterStartDate) : "Beginning";
          const toStr = customFilterEndDate ? safeFormatDate(customFilterEndDate) : "Present";
          dateRangeLabel = `${fromStr} to ${toStr}`;
        }

        if (format === 'csv') {
          let rangeName = "";
          if (reportDateFilter === 'custom') {
            const start = customFilterStartDate || "Start";
            const end = customFilterEndDate || "End";
            rangeName = `_range_${start}_to_${end}`;
          } else {
            rangeName = `_${reportDateFilter}`;
          }
          const catLabel = filterCategory === 'all' ? 'All' : filterCategory.toUpperCase();
          const subCatLabel = filterSubCategory === 'all'
            ? (filterCategory !== 'all' ? `All ${filterCategory.toUpperCase()} Sub-Categories` : 'All Sub-Categories')
            : subCatReadable(filterSubCategory);
          const filterInfo = `Category: ${catLabel} | Sub-Category: ${subCatLabel}`;
          exportToCSV(
            mappedData,
            `KWSC_Export_${filterCategory}${rangeName}_${getLocalDateString()}`,
            dateRangeLabel,
            filterInfo
          );
        } else {
          handlePrintFullReport(mappedData);
        }
        toast.success(`Exported ${mappedData.length} records successfully`);
      } else {
        toast.error("No records found matching current filters to export");
      }
    } catch (err: any) {
      console.error("Export error:", err);
      toast.error(`Failed to export data: ${err.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecordHistory = async (receiving_number: string) => {
    try {
      const { data, error } = await supabase
        .from('file_tracking_records' as any)
        .select('receiving_number, history')
        .eq('receiving_number', receiving_number)
        .single();

      if (!error && data) {
        const historyData = (data as any).history || [];
        setRecords(prev =>
          prev.map(r =>
            r.receiving_number === receiving_number
              ? { ...r, history: historyData }
              : r
          )
        );
        setSelectedBill(prev => 
          prev && prev.receiving_number === receiving_number
            ? { ...prev, history: historyData }
            : prev
        );
      }
    } catch (err) {
      console.error('History fetch error:', err);
    }
  };

  useEffect(() => {
    if (isFileViewer) {
      if (activeTab === "register" || activeTab === "tray" || activeTab === "pending_scans" || activeTab === "returned_files") {
        setActiveTab("view_only");
      }
    }
  }, [isFileViewer, activeTab]);

  useEffect(() => {
    if (activeTab === 'bulk_modified') {
      fetchBulkModifiedRecords();
    } else {
      fetchRecords(currentPage);
    }
  }, [currentPage, filterCategory, filterSubCategory, filterSection, filterAmount, filterStatus, sortOrder, debouncedSearchQuery, activeTab, viewingRole, reportDateFilter, customFilterStartDate, customFilterEndDate, contractorYearFilter, contractorMarkToFilter]);

  // Auto-select records when category changes to a specific category
  useEffect(() => {
    if (filterCategory && filterCategory !== 'all') {
      const targetIds = allMatchingRecords
        .filter(r => r.mainCategory === filterCategory)
        .map(r => r.id);
      setSelectedRecordIds(targetIds);
    } else if (filterCategory === 'all') {
      setSelectedRecordIds([]);
    }
  }, [filterCategory, allMatchingRecords]);


  useEffect(() => {
    // If navigated from BillDispatch with a bill in state
    if (location.state?.bill) {
      setSelectedBill(location.state.bill);
      setCoveringSlipPrintDate(getLocalDateString(location.state.bill.created_at));
      setCoveringSlipCreatedDate(getLocalDateString(location.state.bill.created_at));
      setSearchQuery(location.state.bill.tracking_id || location.state.bill.diary_no);
    }
  }, [location.state]);

  const handleSearch = async () => {
    if (!searchQuery) {
      setSelectedBill(null);
      return;
    }

    setIsLoading(true);
    const safeQuery = searchQuery.replace(/CF0-/i, 'CFO-').trim();
    try {
      // 1. Check current records first
      const localMatch = records.find(r =>
        r.tracking_id?.toLowerCase().includes(safeQuery.toLowerCase()) ||
        r.cfo_diary_number?.toLowerCase().includes(safeQuery.toLowerCase()) ||
        r.receiving_number?.toLowerCase().includes(safeQuery.toLowerCase()) ||
        r.subject?.toLowerCase().includes(safeQuery.toLowerCase())
      );

      if (localMatch) {
        setSelectedBill({
          ...localMatch,
          diary_no: localMatch.cfo_diary_number || localMatch.diary_no,
          party_name: localMatch.received_from || localMatch.party_name,
          amount: localMatch.amount || 0,
          history: localMatch.history || []
        });
        setCoveringSlipPrintDate(getLocalDateString(localMatch.created_at));
        setCoveringSlipCreatedDate(getLocalDateString(localMatch.created_at));
        toast.success("Found record matching your input");
        return;
      }

      // 2. Search full IndexedDB (all pages, not just current page)
      const q = safeQuery.toLowerCase();
      const fullLocalMatch = await db.records.filter(r =>
        !r.deleted_locally &&
        (
          (r.tracking_id || '').toLowerCase().includes(q) ||
          (r.cfo_diary_number || '').toLowerCase().includes(q) ||
          (r.receiving_number || '').toLowerCase().includes(q) ||
          (r.subject || '').toLowerCase().includes(q)
        )
      ).first();

      if (fullLocalMatch) {
        setSelectedBill({
          ...fullLocalMatch,
          diary_no: fullLocalMatch.cfo_diary_number || (fullLocalMatch as any).diary_no,
          party_name: fullLocalMatch.received_from || (fullLocalMatch as any).party_name,
          amount: fullLocalMatch.amount || 0,
          history: fullLocalMatch.history || []
        });
        setCoveringSlipPrintDate(getLocalDateString((fullLocalMatch as any).created_at));
        setCoveringSlipCreatedDate(getLocalDateString((fullLocalMatch as any).created_at));
        toast.success("Found record in local storage");
        return;
      }

      // 3. Fetch from Supabase — use safeQuery (CF0→CFO typo fix applied)
      const { data, error } = await supabase
        .from('file_tracking_records' as any)
        .select('*')
        .or(`cfo_diary_number.ilike.%${safeQuery}%,receiving_number.ilike.%${safeQuery}%,tracking_id.ilike.%${safeQuery}%,subject.ilike.%${safeQuery}%`)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setSelectedBill({
          ...(data as any),
          diary_no: (data as any).cfo_diary_number,
          party_name: (data as any).received_from,
          amount: (data as any).amount || 0,
          history: (data as any).history || []
        });
        setCoveringSlipPrintDate(getLocalDateString((data as any).created_at));
        setCoveringSlipCreatedDate(getLocalDateString((data as any).created_at));
        toast.success("Found record in database");
      } else {
        setSelectedBill(null);
        toast.error(`No record found for "${safeQuery}"`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Error searching record");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    setIsPrintingCovering(true);
    setTimeout(() => {
      window.print();
      setIsPrintingCovering(false);
    }, 250);
  };

  // Dynamic sections from Supabase app_config (replaces hardcoded array)
  const sections = sectionsToLegacy(dynSections).length > 0
    ? sectionsToLegacy(dynSections)
    : [
        { id: 'cfo', name: 'CFO' },
        { id: 'cia', name: 'CIA' },
        { id: 'budget', name: 'BUDGET' },
        { id: 'pension', name: 'PENSION' },
        { id: 'fund', name: 'FUND' },
        { id: 'internal_audit_1', name: 'INTERNAL AUDIT-1' },
        { id: 'director_account', name: 'DIRECTOR ACCOUNT' },
        { id: 'director_finance', name: 'DIRECTOR FINANCE' },
        { id: 'director_it', name: 'DIRECTOR IT' },
        { id: 'sub_cfo', name: 'ASST. CFO' },
        { id: 'books', name: 'BOOKS' },
        { id: 'establishment', name: 'ESTABLISHMENT' },
        { id: 'director_audit', name: 'DIRECTOR AUDIT' },
        { id: 'internal_audit_2', name: 'INTERNAL AUDIT-2' },
        { id: 'law_department', name: 'LAW DEPARTMENT' },
        { id: 'chro', name: 'CHRO' },
        { id: 'md_office', name: 'MD OFFICE' }
      ];

  // Logic to filter viewable files based on the viewing role
  // If CFO/Admin views another department, they see exactly what that department would see
  // SUB_CFO acts as a restricted section user but for the 'cfo' section
  const effectiveViewingRole = viewingRole === 'sub_cfo' ? 'cfo' : viewingRole;

  // Inbox count for badge
  const [inboxCount, setInboxCount] = useState(0);
  const [trayRecords, setTrayRecords] = useState<any[]>([]);

  useEffect(() => {
    const fetchTraySummary = async () => {
      const { data, count, error } = await supabase
        .from('file_tracking_records' as any)
        .select('id, tracking_id, subject, receiving_number, received_from, main_category, sub_category, mark_to, created_at', { count: 'exact' })
        .eq('mark_to', effectiveViewingRole)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setTrayRecords(data);
        setInboxCount(count || 0);
      }
    };
    fetchTraySummary();
  }, [effectiveViewingRole]);

  const handleProcessFile = (file: any) => {
    // Prepare form for the selected department to contribute their part
    setActiveTab("register"); // Switch to registration tab
    // History on-demand fetch for forwarding
    fetchRecordHistory(file.receiving_number);
    setFormData({
      ...formData,
      cfo_diary_number: file.cfo_diary_number,
      received_from: sections.find(s => s.id === currentRole)?.name || file.received_from,
      receiving_number: file.receiving_number,
      mainCategory: file.mainCategory,
      subCategory: file.subCategory,
      subject: file.subject,
      amount: file.amount || 0,
      remarks: ``, // Clear remarks for new entry
      mark_to: "cfo", // Defaulting back to CFO
      additional_mark_to: file.additional_mark_to || "",
      handover_person_name: file.handover_person_name || "",
      file_purpose: file.file_purpose || "",
      signature_data: "" // Clear signature for new person to sign
    });
    setIsForwardingMode(true);
    toast.info(`Now processing: ${file.subject}. Review the journey below before signing.`);
  };

  const [additionalMarkTo, setAdditionalMarkTo] = useState("");
  const [exitRemarks, setExitRemarks] = useState("");
  
  const handleExitFile = async (file: any) => {
    setIsExitingFile(true);
    try {
      // Create an "EXITED" history entry
      const snapshot = {
        date: new Date().toISOString(),
        processed_by: sections.find(s => s.id === currentRole)?.name || currentRole,
        action: "EXITED",
        amount: file.amount || 0,
        remarks: "Manually exited by CFO/Admin"
      };
      
      const newHistory = [...(file.history || []), snapshot];

      let updatePayload: any = {
        mark_to: additionalMarkTo || 'exited',
        additional_mark_to: additionalMarkTo,
        remarks: exitRemarks ? (file.remarks ? file.remarks + ' | ' + exitRemarks : exitRemarks) : file.remarks,
        history: newHistory
      };

      let { error } = await supabase
        .from('file_tracking_records' as any)
        .update(updatePayload)
        .eq('id', file.id);

      // Fallback if additional_mark_to column does not exist
      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        delete updatePayload.additional_mark_to;
        const retry = await supabase
          .from('file_tracking_records' as any)
          .update(updatePayload)
          .eq('id', file.id);
        error = retry.error;
      }

      if (error) throw error;

      logActivity({
        userRole: currentRole || 'unknown',
        userName: userName || sections.find(s => s.id === currentRole)?.name || currentRole || 'Unknown',
        action: 'EXIT',
        recordId: file.id,
        diaryNumber: file.cfo_diary_number,
        receivingNumber: file.receiving_number,
        subject: file.subject,
        details: { status: 'exited' }
      });

      toast.success("File successfully exited!");
      fetchRecords(currentPage);
    } catch (err: any) {
      console.error(err);
      toast.error(`Error exiting file: ${err.message || "Unknown error"}`);
    } finally {
      setIsExitingFile(false);
    }
  };

  const handleScanExit = async (val: string) => {
    if (!val.trim()) return;
    setIsScanning(true);
    try {
      const { data, error } = await supabase
        .from('file_tracking_records' as any)
        .select('*')
        .or(`receiving_number.eq.${val.trim()},cfo_diary_number.eq.${val.trim()}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast.error("File not found! Please check the scanned code.");
        return;
      }
      
      if (data.mark_to === 'exited') {
        toast.info("This file is already marked as EXITED.");
        setScanInput("");
        return;
      }

      await handleExitFile(data);
      setScanInput("");
    } catch (err: any) {
      toast.error(err.message || "Failed to scan and exit file.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleQRClick = async (diary: string, receiving: string, print_date?: string, created_date?: string) => {
    let ticketData = records.find(r => r.cfo_diary_number === diary || r.receiving_number === receiving);
    
    if (!ticketData) {
      ticketData = await db.records.where('receiving_number').equals(receiving).first();
    }
    
    setQrFullScreen({ 
      diary, 
      receiving, 
      print_date: print_date || ticketData?.print_date, 
      created_date: created_date || ticketData?.created_at,
      subject: ticketData?.subject,
      mark_to: ticketData?.mark_to,
      additional_mark_to: ticketData?.additional_mark_to,
      history: ticketData?.history
    });
  };

  const totalPages = Math.ceil(totalRecords / DB_PAGE_SIZE) || 1;

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds(prev =>
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (ids: string[]) => {
    const allSelected = ids.every(id => selectedRecordIds.includes(id));
    if (allSelected) {
      setSelectedRecordIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedRecordIds(prev => {
        const union = new Set([...prev, ...ids]);
        return Array.from(union);
      });
    }
  };


  const fetchPendingFilesList = async () => {
    setIsPendingFilesLoading(true);
    try {
      const { data, error } = await supabase
        .from('file_tracking_pending')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPendingFilesList(data || []);
    } catch (err: any) {
      toast.error("Failed to load pending files: " + err.message);
    } finally {
      setIsPendingFilesLoading(false);
    }
  };

  const handleTabChange = (val: string) => {
    if (val === "register" && !isEditingMode && !isForwardingMode) {
      if (!formData.handover_person_name || !formData.file_purpose) {
        setIsPreEntryModalOpen(true);
        return;
      }
    }
    if (val === "pending_scans") {
      fetchPendingFilesList();
    }
    setActiveTab(val);
  };

  const handlePreEntrySubmit = () => {
    if (!preEntryForm.handover_person_name || !preEntryForm.file_purpose) {
      toast.error("Donon fields bharna zaroori hai");
      return;
    }
    setFormData(prev => ({
      ...prev,
      handover_person_name: preEntryForm.handover_person_name,
      file_purpose: preEntryForm.file_purpose
    }));
    setIsPreEntryModalOpen(false);
    setActiveTab("register");
  };

  const allMatchingIds = allMatchingRecords.map(f => f.id);
  const isAllSelected = allMatchingIds.length > 0 && allMatchingIds.every(id => selectedRecordIds.includes(id));
  const isSomeSelected = allMatchingIds.length > 0 && !isAllSelected && allMatchingIds.some(id => selectedRecordIds.includes(id));
  
  const totalAmountMatching = allMatchingRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const selectedAmount = allMatchingRecords
    .filter(r => selectedRecordIds.includes(r.id))
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="space-y-6 animate-page-enter pb-10">
      <CommandPalette onSelectRecord={(record) => {
        setActiveTab("track");
        setSelectedBill(record);
        setSearchQuery(record.cfo_diary_number || record.receiving_number || record.tracking_id || "");
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#0f1115]/80 p-6 rounded-[32px] border border-white/5 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black flex items-center gap-3 text-white tracking-tighter">
              <div className="w-10 h-10 rounded-xl bg-[#14b8a6]/10 flex items-center justify-center border border-[#14b8a6]/20">
                <FileSearch className="w-6 h-6 text-[#14b8a6]" />
              </div>
              Centralized Tracking & Workflow
            </h1>
            
            {/* Sync Status Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${
              !isOnline ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
              pendingCount > 0 ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse' : 
              'bg-[#14b8a6]/10 text-[#14b8a6] border-[#14b8a6]/20'
            }`}>
              {!isOnline ? <WifiOff className="w-3.5 h-3.5" /> : 
               pendingCount > 0 ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 
               <Wifi className="w-3.5 h-3.5" />}
              <span>
                {!isOnline ? 'Offline Mode' : 
                 pendingCount > 0 ? `${pendingCount} Pending Sync` : 
                 'Online & Synced'}
              </span>
            </div>
            
            {isInitialLoading && (
              <Badge variant="outline" className="bg-[#14b8a6]/10 text-[#14b8a6] border-[#14b8a6]/20 animate-pulse text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Loading
              </Badge>
            )}
          </div>
          <p className="text-xs text-white/40 italic font-medium ml-14">Real-time file movement across KW&SB Finance Sections</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Enhanced Role Selector Box */}
          <div className="flex items-center gap-4 bg-[#111318] border border-white/5 rounded-2xl px-5 py-3 shadow-inner">
            <div className="w-10 h-10 rounded-full bg-[#14b8a6]/10 flex items-center justify-center border border-[#14b8a6]/20">
              <Users className="w-5 h-5 text-[#14b8a6]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.15em] mb-0.5">
                {currentRole === 'cfo' ? 'Viewing Dept' : 'Logged In As'}
              </span>
              {currentRole === 'cfo' ? (
                <Select value={viewingRole} onValueChange={setViewingRole}>
                  <SelectTrigger className="h-6 p-0 border-none bg-transparent shadow-none focus:ring-0 text-lg font-black text-[#14b8a6] hover:text-[#14b8a6]/80 transition-all italic flex items-center gap-2">
                    <SelectValue>
                      {sections.find(s => s.id === viewingRole)?.name || 'CFO'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f1115] border-white/10 text-white/70 z-[100] rounded-xl shadow-2xl">
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs font-bold uppercase tracking-tight py-2.5">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-lg font-black text-[#14b8a6] italic">{userName || sections.find(s => s.id === currentRole)?.name}</p>
              )}
            </div>
          </div>

          {/* Notification & Signout */}
          <div className="flex items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="w-12 h-12 rounded-xl bg-[#111318] border-white/5 text-white/70 hover:text-[#14b8a6] hover:bg-[#14b8a6]/5 transition-all relative">
                  <Bell className="w-5 h-5" />
                  {inboxCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#ef4444] text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-[#0f1115] shadow-lg">
                      {inboxCount}
                    </span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0f1115] border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-white">
                    <ArrowDownCircle className="w-5 h-5 text-[#14b8a6]" />
                    Incoming Files Tray
                  </DialogTitle>
                  <DialogDescription className="text-white/40 uppercase text-[10px] font-bold tracking-widest">FILES PENDING YOUR REVIEW AND SIGNATURE</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[300px] mt-4 pr-4">
                  {trayRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-white/20">
                      <Inbox className="w-12 h-12 opacity-20 mb-2" />
                      <p className="text-xs font-bold">No new files for your section</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {trayRecords.map((file, i) => (
                        <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-[#14b8a6]/10 cursor-pointer transition-all group" onClick={() => handleProcessFile(file)}>
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-sm text-white group-hover:text-[#14b8a6]">{file.subject}</h4>
                            <Badge className="bg-[#14b8a6]/20 text-[#14b8a6] border-none text-[10px]">{file.receiving_number}</Badge>
                          </div>
                          <p className="text-[10px] text-white/40 mt-1 uppercase font-bold">From: {file.received_from}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              className="h-12 px-6 rounded-xl bg-[#111318] border-white/5 text-white/70 hover:text-red-400 hover:bg-red-400/5 transition-all font-black text-xs gap-2"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Sticky Pinned Navigation Tabs Bar */}
        <div className="sticky -top-4 md:-top-8 z-30 bg-[#f8fafc]/95 dark:bg-[#0f172a]/95 backdrop-blur-md pt-2 md:pt-3 pb-2.5 mb-4 border-b border-slate-200 dark:border-slate-800 shadow-xs -mx-4 md:-mx-8 px-4 md:px-8">
          <div ref={tabsListContainerRef} className="w-full overflow-x-auto pb-1 no-scrollbar scroll-smooth">
            <TabsList className="flex w-max h-auto bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 gap-1.5 shadow-xs">
            {isFileViewer ? (
              <TabsTrigger
                value="view_only"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
              >
                <FileSearch className="w-4 h-4" /> View Only
              </TabsTrigger>
            ) : (
              <>
                <TabsTrigger
                  value="reception"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <Inbox className="w-4 h-4" /> File Reception
                </TabsTrigger>

                <TabsTrigger
                  value="register"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <Plus className="w-4 h-4" /> Registration
                  {isEditingMode && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider">Edit</span>}
                  {isForwardingMode && <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-500 text-white text-[9px] font-black uppercase tracking-wider">Forward</span>}
                </TabsTrigger>

                <TabsTrigger
                  value="pending_scans"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <Clock className="w-4 h-4" /> Pending Scans
                </TabsTrigger>

                <TabsTrigger
                  value="tray"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs relative"
                >
                  <Inbox className="w-4 h-4" /> My Tray
                  {inboxCount > 0 && (
                    <span className="absolute -top-1.5 -right-1 bg-[#ef4444] text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white">
                      {inboxCount}
                    </span>
                  )}
                </TabsTrigger>

                <TabsTrigger
                  value="returned_files"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs relative"
                >
                  <RefreshCw className="w-4 h-4" /> Returned Files
                </TabsTrigger>

                <TabsTrigger
                  value="timeline"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <History className="w-4 h-4" /> Timeline
                </TabsTrigger>

                <TabsTrigger
                  value="reports"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <FileSearch className="w-4 h-4" /> Tracking Reports
                </TabsTrigger>

                <TabsTrigger
                  value="bulk_modified"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <CalendarDays className="w-4 h-4" /> Bulk Modified
                </TabsTrigger>

                <TabsTrigger
                  value="track"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
                >
                  <Search className="w-4 h-4" /> Search
                </TabsTrigger>
              </>
            )}
            {isCFORole && (
              <TabsTrigger
                value="cfo_all_files"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
              >
                <Building2 className="w-4 h-4" /> CFO Dashboard
              </TabsTrigger>
            )}
            {currentRole === 'super_admin' && (
              <TabsTrigger
                value="backdate_2026"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
              >
                <History className="w-4 h-4" /> Backdate (2026)
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="contractor_bills" 
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-[#1e3a8a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs"
            >
              <Building2 className="w-4 h-4" /> Contractor Bills
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger
                value="trash_box"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all font-bold text-xs"
              >
                <Trash2 className="w-4 h-4" /> Trash Box
              </TabsTrigger>
            )}
          </TabsList>
          </div>
        </div>

        {/* PRE-ENTRY MODAL */}
        <Dialog open={isPreEntryModalOpen} onOpenChange={setIsPreEntryModalOpen}>
          <DialogContent className="bg-[#0f1115] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">New Entry Details</DialogTitle>
              <DialogDescription className="text-white/40">File ki entry shuru karne se pehle ye details bharain.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-bold text-white/70 uppercase">File Owner / Handover Person</label>
                <Input 
                  placeholder="e.g., Ali Raza / Admin Dept" 
                  className="bg-white/5 border-white/10 mt-1 text-white"
                  value={preEntryForm.handover_person_name}
                  onChange={(e) => setPreEntryForm(prev => ({ ...prev, handover_person_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-white/70 uppercase">File Purpose / Description</label>
                <Input 
                  placeholder="e.g., Payment Voucher for July" 
                  className="bg-white/5 border-white/10 mt-1 text-white"
                  value={preEntryForm.file_purpose}
                  onChange={(e) => setPreEntryForm(prev => ({ ...prev, file_purpose: e.target.value }))}
                />
              </div>
              <Button className="w-full bg-[#14b8a6] hover:bg-teal-600 text-[#0f1115] font-bold mt-4" onClick={handlePreEntrySubmit}>
                Proceed to Registration
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-4 mb-6 border-b border-border/50 pb-4 animate-slide-down" style={{ animationDelay: '0.1s' }}>

          <div className="flex flex-wrap items-center gap-2">
            {/* Global Search for My Tray, Timeline, Reports */}
            {activeTab !== 'track' && activeTab !== 'register' && (
              <div className="relative shrink-0 flex items-center">
                <Input
                  placeholder="Search Diary, Ref, Subject, Emp#, Amount..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="w-[200px] sm:w-[260px] h-10 text-xs bg-white border-slate-300 pl-8 pr-7 text-slate-800 focus-visible:ring-[#1e3a8a] rounded-xl shadow-sm"
                />
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#1e3a8a]" />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setCurrentPage(0);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 font-bold text-sm"
                    title="Clear Search"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Daily Category Report Button */}
            <Button
              onClick={() => setIsDailyCategoryReportOpen(true)}
              className="h-10 px-3.5 bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold text-xs gap-1.5 rounded-xl shadow-sm shrink-0 transition-transform active:scale-95"
            >
              <Calendar className="w-4 h-4 text-white" />
              Daily Category Report
            </Button>

            <Select value={filterCategory} onValueChange={(v) => {
              setFilterCategory(v);
              setFilterSubCategory("all"); // Reset subcategory when category changes
              setCurrentPage(0);
            }}>
              <SelectTrigger className="w-[145px] h-10 text-xs bg-white border-slate-300 text-slate-800 hover:border-[#1e3a8a] transition-all rounded-xl shrink-0 shadow-sm font-semibold">
                <SelectValue placeholder="Category View" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl">
                <SelectItem value="all">All Categories</SelectItem>
                {dynMainCats.map(mc => (
                  <SelectItem key={mc.config_key} value={mc.config_key}>{mc.config_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterSubCategory} onValueChange={(v) => {
              setFilterSubCategory(v);
              setCurrentPage(0);
            }}>
              <SelectTrigger className="w-[155px] h-10 text-xs bg-white border-slate-300 text-slate-800 hover:border-[#1e3a8a] transition-all rounded-xl shrink-0 shadow-sm font-semibold">
                <SelectValue placeholder="Sub Category">
                  {filterSubCategory === 'all'
                    ? (filterCategory !== 'all'
                        ? `All ${filterCategory === 'pol_bills' ? 'POL Bills' : filterCategory.charAt(0).toUpperCase() + filterCategory.slice(1)} Sub-Cats`
                        : 'All Sub-Categories')
                    : subCatReadable(filterSubCategory)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl">
                <SelectItem value="all">
                  {filterCategory !== 'all'
                    ? `All ${filterCategory === 'pol_bills' ? 'POL Bills' : filterCategory.charAt(0).toUpperCase() + filterCategory.slice(1)} Sub-Categories`
                    : 'All Sub-Categories'
                  }
                </SelectItem>
                {(filterCategory === 'all'
                  ? dynSubCats
                  : dynSubCats.filter(sc => sc.parent_key === filterCategory)
                ).map(sc => (
                  <SelectItem key={sc.config_key} value={sc.config_key}>{sc.config_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterSection} onValueChange={(v) => {
              setFilterSection(v);
              setCurrentPage(0);
            }}>
              <SelectTrigger className="w-[140px] h-10 text-xs bg-white border-slate-300 text-slate-800 hover:border-[#1e3a8a] transition-all rounded-xl shrink-0 shadow-sm font-semibold">
                <SelectValue placeholder="Section View" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl">
                <SelectItem value="all">All Sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs font-bold uppercase tracking-tight py-2.5">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterAmount} onValueChange={(v) => {
              setFilterAmount(v);
              setCurrentPage(0);
            }}>
              <SelectTrigger className="w-[135px] h-10 text-xs bg-white border-slate-300 text-slate-800 hover:border-[#1e3a8a] transition-all rounded-xl shrink-0 shadow-sm font-semibold">
                <SelectValue placeholder="Amount View" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl">
                <SelectItem value="all">All Amounts</SelectItem>
                <SelectItem value="above_2_lac">&gt; 2 Lac</SelectItem>
                <SelectItem value="below_2_lac">&le; 2 Lac</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range Filter (Visible for all users) */}
            <div className="flex items-center gap-2">
              <Select value={reportDateFilter} onValueChange={(v) => {
                setReportDateFilter(v);
                setCurrentPage(0);
              }}>
                <SelectTrigger className="w-[155px] h-10 text-xs bg-white border-slate-300 text-slate-800 hover:border-[#1e3a8a] transition-all rounded-xl shrink-0 shadow-sm font-semibold">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl">
                  <SelectItem value="all">All Time Records</SelectItem>
                  <SelectItem value="today">Daily Report (Today)</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="weekly">Last 7 Days</SelectItem>
                  <SelectItem value="monthly">This Month</SelectItem>
                  <SelectItem value="yearly">This Year</SelectItem>
                  <SelectItem value="custom">Specific / Custom Date</SelectItem>
                </SelectContent>
              </Select>

              {reportDateFilter === 'custom' && (
                <div className="flex items-center gap-1.5 animate-in slide-in-from-left-2 duration-300">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">From</span>
                  <Input
                    type="date"
                    value={customFilterStartDate}
                    onChange={(e) => {
                      setCustomFilterStartDate(e.target.value);
                      setCurrentPage(0);
                    }}
                    className="h-10 text-xs bg-white border-slate-300 text-slate-800 w-[130px] rounded-xl"
                  />
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">To</span>
                  <Input
                    type="date"
                    value={customFilterEndDate}
                    onChange={(e) => {
                      setCustomFilterEndDate(e.target.value);
                      setCurrentPage(0);
                    }}
                    className="h-10 text-xs bg-white border-slate-300 text-slate-800 w-[130px] rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Reset Filters Button */}
            {(filterCategory !== 'all' || filterSubCategory !== 'all' || filterSection !== 'all' || filterAmount !== 'all' || reportDateFilter !== 'all' || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterCategory("all");
                  setFilterSubCategory("all");
                  setFilterSection("all");
                  setFilterAmount("all");
                  setReportDateFilter("all");
                  setCustomFilterStartDate("");
                  setCustomFilterEndDate("");
                  setCurrentPage(0);
                }}
                className="h-10 px-3 text-xs border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-xl shrink-0 gap-1"
                title="Reset all active filters"
              >
                <ResetIcon className="w-3.5 h-3.5" />
                Reset Filters
              </Button>
            )}

            <Select value={sortOrder} onValueChange={(v: "desc" | "asc") => setSortOrder(v)}>
              <SelectTrigger className="w-[130px] h-10 text-xs bg-[#0f1115] border-white/5 text-white/70 hover:text-white transition-all rounded-xl shrink-0">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f1115] border-white/10 text-white/70">
                <SelectItem value="desc">Newest First</SelectItem>
                <SelectItem value="asc">Oldest First</SelectItem>
              </SelectContent>
            </Select>

            {activeTab !== 'register' && !isFileViewer && (
              <div className="flex items-center gap-1.5 ml-2">
                <Button
                  onClick={() => handleBulkExport('pdf')}
                  disabled={isLoading}
                  variant="outline"
                  className="h-10 px-4 bg-[#14b8a6]/10 border-[#14b8a6]/20 text-[#14b8a6] hover:bg-[#14b8a6] hover:text-[#0f1115] transition-all rounded-xl font-black text-[10px] uppercase gap-2 shrink-0 shadow-lg shadow-[#14b8a6]/5"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Bulk PDF
                </Button>
                <Button
                  onClick={() => handleBulkExport('csv')}
                  disabled={isLoading}
                  variant="outline"
                  className="h-10 px-4 bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all rounded-xl font-black text-[10px] uppercase gap-2 shrink-0 shadow-lg shadow-emerald-500/5"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-4 h-4 rotate-180" />}
                  Bulk CSV
                </Button>
              </div>
            )}

            {selectedRecordIds.length > 0 && (
              <div className="flex items-center gap-1 ml-2 animate-in fade-in slide-in-from-right-4">
                <Badge variant="secondary" className="h-9 px-3 rounded-md bg-primary/10 text-primary border-primary/20 flex items-center gap-2">
                  <span className="font-bold">{selectedRecordIds.length} Selected | Total: {formatCurrency(selectedAmount)}</span>
                  <div className="flex gap-1 border-l border-primary/20 pl-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-primary/20 text-primary"
                      title="Export Selected to PDF"
                      onClick={() => handlePrintFullReport(allMatchingRecords.filter(r => selectedRecordIds.includes(r.id)))}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-primary/20 text-primary"
                      title="Export Selected to CSV"
                      onClick={() => exportToCSV(allMatchingRecords.filter(r => selectedRecordIds.includes(r.id)), "Selected_Files")}
                    >
                      <Plus className="w-3.5 h-3.5 rotate-45" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-amber-500/20 text-amber-500"
                      title="Bulk Edit Date"
                      onClick={() => setIsBulkEditDateModalOpen(true)}
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-red-500/20 text-red-500"
                      title="Clear Selection"
                      onClick={() => setSelectedRecordIds([])}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Badge>
              </div>
            )}
          </div>
        </div>

        <TabsContent value="tray" className="animate-fade-up">
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Inbox className="w-6 h-6 text-primary" />
                  {sections.find(s => s.id === currentRole)?.name} - Departmental Tray
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Files assigned to your section for processing</p>
              </div>
              {/* Tray inline search */}
              <div className="relative w-full sm:w-[280px] shrink-0">
                <Input
                  placeholder="Search by subject, diary no, from..."
                  value={traySearchQuery}
                  onChange={e => setTraySearchQuery(e.target.value)}
                  className="h-10 pl-9 pr-4 text-xs bg-muted/20 border-border/50 rounded-xl focus-visible:ring-primary/50"
                />
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                {traySearchQuery && (
                  <button
                    onClick={() => setTraySearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs font-bold"
                  >✕</button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary Stats Row */}
              {!isInitialLoading && !isLoading && allMatchingRecords.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-4 rounded-xl bg-[#0f1115]/50 border border-white/5">
                  <div className="flex gap-6">
                    <div>
                      <p className="text-[10px] uppercase font-black text-white/40 tracking-wider">Total Matching Files</p>
                      <p className="text-lg font-bold text-[#14b8a6]">{allMatchingRecords.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-white/40 tracking-wider">Total Matching Amount</p>
                      <p className="text-lg font-bold text-emerald-500">{formatCurrency(totalAmountMatching)}</p>
                    </div>
                  </div>
                  {selectedRecordIds.length > 0 && (
                    <div className="flex gap-6 border-l border-white/10 pl-6">
                      <div>
                        <p className="text-[10px] uppercase font-black text-amber-400">Selected Files</p>
                        <p className="text-lg font-bold text-amber-400">{selectedRecordIds.length}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-black text-amber-400">Selected Amount</p>
                        <p className="text-lg font-bold text-amber-400">{formatCurrency(selectedAmount)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isInitialLoading || isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                  <h3 className="text-sm font-bold uppercase tracking-widest">Loading Records...</h3>
                </div>
              ) : records.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-xl border-2 border-dashed border-border/50">
                  <Inbox className="w-16 h-16 opacity-10 mb-4" />
                  <h3 className="text-lg font-bold">Your Tray is Empty</h3>
                  <p className="text-sm">No files found for your section matching current filters.</p>
                </div>
              ) : records.filter(f => {
                if (!traySearchQuery.trim()) return true;
                const q = traySearchQuery.toLowerCase();
                return (
                  (f.subject || "").toLowerCase().includes(q) ||
                  (f.cfo_diary_number || "").toLowerCase().includes(q) ||
                  (f.receiving_number || "").toLowerCase().includes(q) ||
                  (f.received_from || "").toLowerCase().includes(q) ||
                  (f.mainCategory || f.main_category || "").toLowerCase().includes(q)
                );
              }).length === 0 && traySearchQuery ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-xl border-2 border-dashed border-border/50">
                  <Search className="w-16 h-16 opacity-10 mb-4" />
                  <h3 className="text-lg font-bold">No Results Found</h3>
                  <p className="text-sm">No files match "<strong>{traySearchQuery}</strong>"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-border/50 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={isAllSelected ? true : (isSomeSelected ? "indeterminate" : false)}
                              onCheckedChange={() => toggleSelectAll(allMatchingIds)}
                            />
                          </TableHead>
                          <TableHead className="text-xs uppercase font-bold">Diary/Ref No</TableHead>
                          <TableHead className="text-xs uppercase font-bold text-center">Track QR</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Subject</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Category</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Amount</TableHead>
                          <TableHead className="text-xs uppercase font-bold">From</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Date Marked</TableHead>
                          <TableHead className="text-xs uppercase font-bold text-center">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.filter(f => {
                            if (!traySearchQuery.trim()) return true;
                            const q = traySearchQuery.toLowerCase();
                            return (
                              (f.subject || "").toLowerCase().includes(q) ||
                              (f.cfo_diary_number || "").toLowerCase().includes(q) ||
                              (f.receiving_number || "").toLowerCase().includes(q) ||
                              (f.received_from || "").toLowerCase().includes(q) ||
                              (f.mainCategory || f.main_category || "").toLowerCase().includes(q)
                            );
                          }).map((file, i) => (
                          <TableRow key={i} className="hover:bg-primary/5 transition-colors group animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                            <TableCell>
                              <Checkbox
                                checked={selectedRecordIds.includes(file.id)}
                                onCheckedChange={() => toggleSelectRecord(file.id)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold text-primary">{file.receiving_number}</TableCell>
                            <TableCell className="text-center">
                              {file.cfo_diary_number && (
                                <div
                                  className="cursor-zoom-in group/qr transition-transform hover:scale-110"
                                  onClick={() => handleQRClick(file.cfo_diary_number, file.receiving_number, getLocalDateString(file.created_at), getLocalDateString(file.created_at))}
                                >
                                  <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=35x35&data=${encodeURIComponent(`${window.location.origin}/public-track/${file.cfo_diary_number}/${file.receiving_number}`)}&color=0ea5e9`}
                                    alt="QR"
                                    className="w-8 h-8 mx-auto opacity-70 group-hover:opacity-100 transition-opacity rounded border border-border bg-white"
                                  />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold text-sm">
                              <div className="flex items-center gap-2">
                                <span>{file.subject}</span>
                                {(file.file_image || (file.history && file.history.length > 0 && [...file.history].reverse().find(h => h.file_image)?.file_image)) && (
                                  <img
                                    src={file.file_image || [...file.history].reverse().find(h => h.file_image)?.file_image}
                                    alt="doc"
                                    title="Document photo attached"
                                    className="w-7 h-7 object-cover rounded border border-teal-500/40 cursor-pointer hover:scale-150 transition-transform"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(file.file_image || [...file.history].reverse().find(h => h.file_image)?.file_image, '_blank');
                                    }}
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className="text-[10px] uppercase">{mainCatReadable(file.mainCategory)}</Badge>
                                {file.subCategory && (
                                  <span className="text-[9px] text-muted-foreground uppercase font-bold px-1 italic">
                                    {file.subCategory?.replace(/_/g, " ")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-bold text-xs text-primary">{formatCurrency(file.amount || 0)}</TableCell>
                            <TableCell className="text-xs">{file.received_from}</TableCell>
                            <TableCell className="text-xs">{safeFormatDate(file.created_at)}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 px-3 border border-blue-600/30 bg-blue-50/70 text-[#1e3a8a] hover:bg-[#1e3a8a] hover:text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                                  onClick={() => handleProcessFile(file)}
                                >
                                  <span>Review & Sign</span> <ArrowRight className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0 border-blue-500/20 text-blue-500 hover:bg-blue-500 hover:text-white transition-all ml-1"
                                  title="Edit Record"
                                  onClick={() => handleRequestEdit(file)}
                                >
                                  <FileEdit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                                  title="Delete Record"
                                  onClick={() => {
                                    setRecordToDelete(file.id);
                                    setIsDeleteModalOpen(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Server Pagination */}
                  {totalRecords > DB_PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                        Showing {records.length} of {totalRecords} records
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                          disabled={currentPage === 0 || isLoading}
                          className="h-8 text-[10px] font-black uppercase tracking-tight"
                        >
                          <ArrowLeft className="w-3 h-3 mr-1" /> Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const pageNum = i;
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(pageNum)}
                                className={`h-8 w-8 text-[10px] font-black ${currentPage === pageNum ? 'bg-primary text-white' : ''}`}
                              >
                                {pageNum + 1}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={currentPage >= totalPages - 1 || isLoading}
                          className="h-8 text-[10px] font-black uppercase tracking-tight"
                        >
                          Next <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returned_files" className="animate-fade-up">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* List Panel */}
            <div className="lg:col-span-2">
              <Card className="glass-card border-none shadow-xl">
                <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <RefreshCw className="w-6 h-6 text-primary animate-spin-slow" />
                    Returned / Additional Mark Tray
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Files assigned to your section as an additional department</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-md border border-border/50 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="text-xs uppercase font-bold">Diary No</TableHead>
                            <TableHead className="text-xs uppercase font-bold text-center">Track QR</TableHead>
                            <TableHead className="text-xs uppercase font-bold">Subject</TableHead>
                            <TableHead className="text-xs uppercase font-bold">Category</TableHead>
                            <TableHead className="text-xs uppercase font-bold">Amount</TableHead>
                            <TableHead className="text-xs uppercase font-bold text-center">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                No files found in additional tray
                              </TableCell>
                            </TableRow>
                          ) : (
                            records.map((file, i) => (
                              <TableRow key={i} className="hover:bg-primary/5 transition-colors group animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                                <TableCell className="font-mono text-xs font-bold text-primary">{file.cfo_diary_number}</TableCell>
                                <TableCell className="text-center">
                                  <div
                                    className="cursor-zoom-in transition-transform hover:scale-110"
                                    onClick={() => handleQRClick(file.cfo_diary_number, file.receiving_number)}
                                  >
                                    <img
                                      src={`https://api.qrserver.com/v1/create-qr-code/?size=35x35&data=${encodeURIComponent(`${window.location.origin}/public-track/${file.cfo_diary_number}/${file.receiving_number}`)}&color=0ea5e9`}
                                      alt="QR"
                                      className="w-8 h-8 mx-auto rounded border border-border bg-white"
                                    />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="font-semibold text-sm">{file.subject}</div>
                                  <div className="text-[10px] text-muted-foreground">{file.receiving_number}</div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <Badge variant="outline" className="text-[9px] uppercase">{mainCatReadable(file.mainCategory)}</Badge>
                                    {file.subCategory && (
                                      <span className="text-[8px] text-muted-foreground uppercase font-bold italic">
                                        {file.subCategory?.replace(/_/g, " ")}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-bold text-xs text-primary">{formatCurrency(file.amount || 0)}</TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1.5 px-3 border border-blue-200 dark:border-blue-700/60 bg-blue-50/80 dark:bg-blue-950/70 text-[#1e3a8a] dark:text-sky-300 hover:!bg-[#1e3a8a] hover:!text-white font-black text-xs rounded-xl shadow-xs transition-all"
                                    onClick={() => {
                                      setSelectedBill({
                                        ...file,
                                        diary_no: file.cfo_diary_number,
                                        party_name: file.received_from,
                                        amount: file.amount || 0
                                      });
                                      if (!file.history || file.history.length === 0) {
                                        fetchRecordHistory(file.receiving_number);
                                      }
                                    }}
                                  >
                                    <span className="text-inherit">View Timeline</span> <ArrowRight className="w-3.5 h-3.5 text-inherit" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Timeline Panel */}
            <div className="lg:col-span-1">
              {selectedBill ? (
                <Card className="glass-card border-none shadow-xl relative">
                  <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <History className="w-5 h-5 text-primary" />
                      Movement History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-10 pt-4">
                    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:via-primary/20 before:to-transparent">
                      <h4 className="text-xs font-black uppercase text-zinc-400 tracking-widest flex items-center justify-between">
                        <span className="flex items-center gap-2"><History className="w-4 h-4" /> Log Roadmap</span>
                        <button 
                          onClick={() => setIsJourneyMapOpen(true)}
                          className="bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white transition-colors px-3 py-1.5 rounded-full text-[10px] flex items-center gap-1.5 shadow-sm"
                        >
                          <Network className="w-3.5 h-3.5" /> Visual Map
                        </button>
                      </h4>
                      
                      <JourneyMapModal 
                        isOpen={isJourneyMapOpen} 
                        onClose={() => setIsJourneyMapOpen(false)} 
                        record={selectedBill} 
                      />

                      {selectedBill.history?.map((step: any, index: number) => (
                        <div key={index} className="relative flex items-center gap-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full border border-primary/50 bg-background text-primary shadow shrink-0 z-10">
                            {index === selectedBill.history.length - 1 ? <MapPin className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 p-3 rounded-xl border border-primary/10 bg-primary/5 shadow-sm">
                            <div className="flex justify-between items-start gap-1">
                              <span className="text-[10px] font-black uppercase text-primary">
                                {step.action || "FORWARDED"}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-mono">
                                {step.date ? safeFormatDate(step.date) : ""}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold text-white mt-1">
                              Processed by: {step.processed_by || "CFO Office"}
                            </p>
                            {step.mark_to && (
                              <p className="text-[10px] font-medium text-white/70">
                                Forwarded to: {sections.find(s => s.id === step.mark_to)?.name || step.mark_to}
                              </p>
                            )}
                            {step.additional_mark_to && (
                              <p className="text-[10px] font-medium text-purple-400">
                                Additional Mark: {sections.find(s => s.id === step.additional_mark_to)?.name || step.additional_mark_to}
                              </p>
                            )}
                            {step.remarks && (
                              <p className="text-[10px] italic text-muted-foreground border-l-2 border-primary/20 pl-1.5 mt-1 bg-white/5 p-1 rounded">
                                Remarks: {step.remarks}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="glass-card border-none shadow-xl h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <History className="w-12 h-12 opacity-20 mb-3" />
                  <p className="text-sm font-semibold">Select a file to view its history & visual roadmap</p>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="animate-fade-up">
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <FileText className="w-6 h-6 text-primary" />
                  File Tracking Insights & Reports
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Exportable summaries for audits and status monitoring</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsDailyCategoryReportOpen(true)}
                  className="h-9 bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold text-xs gap-1.5 rounded-xl shadow-sm"
                >
                  <Calendar className="w-3.5 h-3.5 text-white" />
                  Daily Category Report
                </Button>

                <Select value={reportDateFilter} onValueChange={(v) => {
                   setReportDateFilter(v);
                   setCurrentPage(0);
                 }}>
                  <SelectTrigger className="w-[155px] h-9 bg-white border-slate-300 text-xs text-slate-800 rounded-xl font-semibold shadow-sm">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl">
                    <SelectItem value="all">All Time Records</SelectItem>
                    <SelectItem value="today">Daily Report (Today)</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="weekly">Last 7 Days</SelectItem>
                    <SelectItem value="monthly">This Month</SelectItem>
                    <SelectItem value="yearly">This Year</SelectItem>
                    <SelectItem value="custom">Specific Date</SelectItem>
                  </SelectContent>
                </Select>

                {reportDateFilter === 'custom' && (
                  <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                    <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">From</span>
                    <Input
                      type="date"
                      value={customFilterStartDate}
                      onChange={(e) => {
                        setCustomFilterStartDate(e.target.value);
                        setCurrentPage(0);
                      }}
                      className="h-9 w-[130px] bg-white border-slate-300 text-xs text-slate-800 rounded-xl"
                    />
                    <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">To</span>
                    <Input
                      type="date"
                      value={customFilterEndDate}
                      onChange={(e) => {
                        setCustomFilterEndDate(e.target.value);
                        setCurrentPage(0);
                      }}
                      className="h-9 w-[130px] bg-white border-slate-300 text-xs text-slate-800 rounded-xl"
                    />
                  </div>
                )}
              {selectedRecordIds.length > 0 && (
                <>
                    <Button
                      onClick={() => setIsBulkEditDateModalOpen(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-2 animate-in fade-in zoom-in-95 duration-150"
                    >
                      <CalendarDays className="w-4 h-4" /> Bulk Edit Date ({selectedRecordIds.length})
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedRecordIds([])}
                      className="bg-transparent border-white/10 text-white/70 hover:text-white hover:bg-white/5 font-bold text-xs gap-2 animate-in fade-in zoom-in-95 duration-150"
                    >
                      Clear Selection
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => handleBulkExport('pdf')}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2"
                >
                  <Printer className="w-4 h-4" /> Bulk PDF Export
                </Button>
                <Button
                  onClick={() => handleBulkExport('csv')}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2"
                >
                  <Upload className="w-4 h-4 rotate-180" /> Bulk CSV Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary Stats Row */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-4 rounded-xl bg-[#0f1115]/50 border border-white/5">
                <div className="flex gap-6">
                  <div>
                    <p className="text-[10px] uppercase font-black text-white/40 tracking-wider">Total Matching Files</p>
                    <p className="text-lg font-bold text-[#14b8a6]">{totalRecords}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-black text-white/40 tracking-wider">Total Matching Amount</p>
                    <p className="text-lg font-bold text-emerald-500">{formatCurrency(totalAmountMatching)}</p>
                  </div>
                </div>
                {selectedRecordIds.length > 0 && (
                  <div className="flex gap-6 border-l border-white/10 pl-6">
                    <div>
                      <p className="text-[10px] uppercase font-black text-amber-400">Selected Files</p>
                      <p className="text-lg font-bold text-amber-400">{selectedRecordIds.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-amber-400">Selected Amount</p>
                      <p className="text-lg font-bold text-amber-400">{formatCurrency(selectedAmount)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/50 overflow-hidden bg-background/40">
                <Table>
                  <TableHeader className="bg-muted/50 text-[10px] uppercase font-black tracking-tighter">
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={isAllSelected ? true : (isSomeSelected ? "indeterminate" : false)}
                          onCheckedChange={() => toggleSelectAll(allMatchingIds)}
                        />
                      </TableHead>
                      <TableHead>Diary #</TableHead>
                      <TableHead>Ref/Sub</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>From & Mark To</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right pr-6">Export</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((file, i) => (
                      <TableRow key={i} className="hover:bg-primary/5 border-border/30 transition-colors animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRecordIds.includes(file.id)}
                            onCheckedChange={() => toggleSelectRecord(file.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-[10px] font-bold text-primary">{file.cfo_diary_number}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">{file.subject}</span>
                            <span className="text-[10px] text-muted-foreground italic">{file.receiving_number}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-[9px] uppercase border-primary/20">{mainCatReadable(file.mainCategory)}</Badge>
                            {file.subCategory && (
                              <span className="text-[8px] text-muted-foreground uppercase font-bold italic">
                                {file.subCategory?.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground">F: {file.received_from}</span>
                            <span className="text-emerald-500 font-bold">M: {sections.find(s => s.id === file.mark_to)?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">
                          {safeFormatDate(file.created_at)}
                        </TableCell>
                        <TableCell className="font-bold text-[10px] text-primary">
                          {formatCurrency(file.amount || 0)}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:text-emerald-500"
                              onClick={() => exportToCSV([file], `Report_${file.receiving_number}`)}
                            >
                              <Upload className="w-3.5 h-3.5 rotate-180" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:text-red-400"
                              onClick={() => handlePrintFullReport([file])}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:text-blue-500"
                              onClick={() => handleQRClick(file.cfo_diary_number, file.receiving_number, getLocalDateString(file.created_at), getLocalDateString(file.created_at))}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:text-blue-500 hover:bg-blue-500/10"
                              title="Edit Record"
                              onClick={() => handleRequestEdit(file)}
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:text-red-500 hover:bg-red-500/10"
                              title="Delete Record"
                              onClick={() => {
                                setRecordToDelete(file.id);
                                setIsDeleteModalOpen(true);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Server Pagination - Reports */}
              {totalRecords > DB_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    Showing {records.length} of {totalRecords} records
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0 || isLoading}
                      className="h-8 text-[10px] font-black uppercase tracking-tight"
                    >
                      <ArrowLeft className="w-3 h-3 mr-1" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1 || isLoading}
                      className="h-8 text-[10px] font-black uppercase tracking-tight"
                    >
                      Next <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk_modified" className="animate-fade-up" onFocus={undefined}>
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <CalendarDays className="w-6 h-6 text-amber-500" />
                  Bulk Modified Files
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  List of files whose inward or print dates were modified in bulk during this session.
                </p>
              </div>
              {allBulkModifiedRecords.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setBulkPrintFullScreen(allBulkModifiedRecords)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2"
                  >
                    <Printer className="w-4 h-4" /> Print All Slips
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isBulkModifiedLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                  <span className="ml-3 text-muted-foreground text-sm font-bold">Loading back-dated files...</span>
                </div>
              ) : allBulkModifiedRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-xl border-2 border-dashed border-border/50">
                  <CalendarDays className="w-16 h-16 opacity-10 mb-4" />
                  <h3 className="text-lg font-bold">No Back-Dated Files Found</h3>
                  <p className="text-sm">No files have had their dates modified via bulk edit or QR popup.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border/50 overflow-hidden bg-background/40">
                  <Table>
                    <TableHeader className="bg-muted/50 text-[10px] uppercase font-black tracking-tighter">
                      <TableRow>
                        <TableHead>Diary #</TableHead>
                        <TableHead>Ref/Sub</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>From & Mark To</TableHead>
                        <TableHead>Created At (Inward)</TableHead>
                        <TableHead>Print Date</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allBulkModifiedRecords.map((file, i) => (
                        <TableRow key={i} className="hover:bg-primary/5 border-border/30 transition-colors animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                          <TableCell className="font-mono text-[10px] font-bold text-primary">{file.cfo_diary_number}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-xs">{file.subject}</span>
                              <span className="text-[10px] text-muted-foreground italic">{file.receiving_number}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <Badge className="text-[9px] font-black uppercase tracking-wider scale-90 origin-left bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                                {file.mainCategory}
                              </Badge>
                              <span className="text-[8px] text-muted-foreground mt-0.5 uppercase tracking-widest">{file.subCategory}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col text-[10px]">
                              <span className="text-muted-foreground">F: {file.received_from || "ONE WINDOW"}</span>
                              <span className="text-emerald-500 font-bold">M: {sections.find(s => s.id === file.mark_to)?.name || file.mark_to}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-black text-amber-600">{safeFormatDate(file.created_at)}</TableCell>
                          <TableCell className="text-xs font-black text-zinc-300">{file.print_date}</TableCell>
                          <TableCell className="text-right pr-6">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-primary/20 text-primary"
                              onClick={() => setQrFullScreen({
                                diary: file.cfo_diary_number,
                                receiving: file.receiving_number,
                                print_date: file.print_date,
                                created_date: file.created_at,
                                subject: file.subject,
                                mark_to: file.mark_to,
                                additional_mark_to: file.additional_mark_to,
                                history: file.history
                              })}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="animate-fade-up">
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <History className="w-6 h-6 text-primary" />
                Department Activity Timeline
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Detailed trail of all files processed or forwarded by your section</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {isInitialLoading || isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Loading Timeline...</h3>
                  </div>
                ) : records.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-xl border-2 border-dashed border-border/50">
                    <History className="w-16 h-16 opacity-10 mb-4" />
                    <h3 className="text-lg font-bold">No Timeline Data</h3>
                    <p className="text-sm">You haven't interacted with any files yet.</p>
                  </div>
                ) : (
                  records.map((file, i) => (
                    <Dialog key={i}>
                      <DialogTrigger asChild>
                        <div
                          className="bg-muted/10 border border-border/50 rounded-xl p-6 cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden"
                          onClick={() => {
                            // History on-demand fetch agar abhi tak load nahi hui
                            if (!file.history || file.history.length === 0) {
                              fetchRecordHistory(file.receiving_number);
                            }
                          }}
                        >
                          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1 text-[10px]">
                              <FileSearch className="w-3 h-3" /> Click to Preview
                            </Badge>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-border/50 pb-4">
                            <div>
                              <h4 className="font-bold text-base text-primary group-hover:underline">{file.subject}</h4>
                              <span className="inline-block mt-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest bg-muted/30 px-2 py-0.5 rounded-full">
                                DIARY NO: {file.cfo_diary_number} | REF: {file.receiving_number}
                              </span>
                            </div>
                            <Badge variant={file.mark_to === currentRole ? 'default' : 'secondary'} className="uppercase">
                              Current Desk: {sections.find(s => s.id === file.mark_to)?.name || file.mark_to}
                            </Badge>
                          </div>

                          <div className="space-y-0 relative border-l-2 border-primary/20 ml-3">
                            {file.history?.map((step: any, idx: number) => (
                              <div key={idx} className="relative pb-6 pl-6 last:pb-0">
                                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                                <div className="bg-background rounded-lg border border-border p-3 shadow-sm group-hover:border-primary/30 transition-colors">
                                  <div className="flex flex-wrap items-center justify-between gap-4 text-sm font-bold mb-1">
                                    <span className="text-primary flex items-center gap-1"><User className="w-3 h-3" /> {step.processed_by || 'Unknown Section'}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                                      {safeFormatDateTime(step.date)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-[9px] uppercase border-primary/20 text-primary">{step.action || 'PROCESSED'}</Badge>
                                    {step.mark_to && <span className="text-xs text-muted-foreground">&rarr; Forwarded to <strong className="text-foreground">{sections.find(s => s.id === step.mark_to)?.name || step.mark_to}</strong></span>}
                                  </div>
                                  {step.remarks && (
                                    <p className="text-xs text-muted-foreground mt-2 italic bg-muted/20 p-2 rounded border border-border/30">"{step.remarks}"</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border-border/50">
                        <DialogHeader>
                          <DialogTitle className="flex items-center justify-between text-xl text-primary w-full pr-6">
                            <span className="flex items-center gap-2"><FileText className="w-5 h-5" /> File Data Preview</span>
                            <button 
                              onClick={() => setIsJourneyMapOpen(true)}
                              className="bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white transition-colors px-3 py-1.5 rounded-full text-[10px] flex items-center gap-1.5 shadow-sm ml-auto"
                            >
                              <Network className="w-3.5 h-3.5" /> View Visual Map
                            </button>
                          </DialogTitle>
                          <JourneyMapModal 
                            isOpen={isJourneyMapOpen} 
                            onClose={() => setIsJourneyMapOpen(false)} 
                            record={file} 
                          />
                          <DialogDescription>Overview for Ref No: {file.receiving_number}</DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50 col-span-2">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Subject</p>
                            <p className="text-sm font-semibold text-primary">{file.subject}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">CFO Diary No</p>
                            <p className="text-sm font-bold">{file.cfo_diary_number || 'N/A'}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Received From</p>
                            <p className="text-sm font-semibold">{file.received_from}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Category Structure</p>
                            <p className="text-sm font-semibold uppercase">{file.mainCategory} &rarr; {file.subCategory?.replace(/_/g, " ")}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Registration Date</p>
                            <p className="text-sm font-semibold">{safeFormatDate(file.created_at)}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Current Mark To</p>
                            <p className="text-sm font-semibold uppercase">{sections.find(s => s.id === file.mark_to)?.name || file.mark_to}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Outward Date</p>
                            <p className="text-sm font-semibold text-emerald-500">{file.outward_date ? safeFormatDate(file.outward_date) : 'N/A'}</p>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Net Amount</p>
                            <p className="text-sm font-bold text-primary">{formatCurrency(file.amount || 0)}</p>
                          </div>
                          {file.remarks && (
                            <div className="bg-muted/10 p-3 rounded-lg border border-border/50 col-span-2 text-amber-500">
                              <p className="text-[10px] text-muted-foreground font-bold uppercase text-amber-500/70">Latest Remarks</p>
                              <p className="text-sm font-semibold italic">"{file.remarks}"</p>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 flex justify-end">
                          <Button variant="outline" className="border-primary/20 hover:bg-primary/10" onClick={() => handleQRClick(file.cfo_diary_number, file.receiving_number)}>
                            <Printer className="w-4 h-4 mr-2" /> View Printable Slip
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))
                )}
                {/* Server Pagination - Timeline */}
                {totalRecords > DB_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                      Showing {records.length} of {totalRecords} records
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0 || isLoading}
                        className="h-8 text-[10px] font-black uppercase tracking-tight"
                      >
                        <ArrowLeft className="w-3 h-3 mr-1" /> Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1 || isLoading}
                        className="h-8 text-[10px] font-black uppercase tracking-tight"
                      >
                        Next <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="track" className="animate-fade-up">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Search Panel */}
            <Card className="glass-card border-none shadow-xl">
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Track Your File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold font-mono">TRACKING ID / DIARY NO</Label>
                  <div className="relative">
                    <Input
                      placeholder="e.g. FL-2024-1234"
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleSearch();
                        }
                      }}
                      className="bg-muted/20 border-primary/20 h-12 font-mono text-base pr-10 focus-visible:ring-primary shadow-inner"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/40">
                      {isLoading ? <Clock className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {selectedBill && (
                  <div className="pt-4 border-t border-border/50 space-y-4 animate-fade-in">
                    <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-bold text-primary uppercase">Current Status</p>
                          <h3 className="text-xl font-bold flex items-center gap-2 mt-1">
                            <Building2 className="w-5 h-5 text-primary" />
                            {selectedBill.mark_to ? sections.find(s => s.id === selectedBill.mark_to)?.name : "Registered"}
                          </h3>
                          <div className="mt-2 text-[10px] font-bold uppercase px-2 py-0.5 bg-primary/10 text-primary w-fit rounded">
                            {selectedBill.current_status || "Processing"}
                          </div>
                        </div>
                        <div
                          className="bg-white p-1 rounded-lg border border-primary/20 shadow-sm cursor-zoom-in hover:scale-110 transition-transform relative inline-flex items-center justify-center"
                          onClick={() => handleQRClick(selectedBill.cfo_diary_number || selectedBill.diary_no, selectedBill.receiving_number || selectedBill.tracking_id, getLocalDateString(selectedBill.created_at), getLocalDateString(selectedBill.created_at))}
                        >
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(`${window.location.origin}/public-track/${selectedBill.cfo_diary_number || selectedBill.diary_no}/${selectedBill.receiving_number || selectedBill.tracking_id}`)}`}
                            alt="QR"
                            className="w-12 h-12"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <img
                              src="/kwsc-watermark-logo.png"
                              alt="KWSC Watermark"
                              className="w-3.5 h-3.5 object-contain bg-white rounded-full p-0.5 shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="space-y-2 mt-4">
                        <Label className="text-xs uppercase font-bold text-amber-500 flex items-center gap-2">
                          <Calendar className="w-3 h-3" />
                          Created Date
                          <span className="text-[9px] font-normal text-muted-foreground normal-case">(For Covering Slip)</span>
                        </Label>
                        <Input
                          type="date"
                          value={coveringSlipCreatedDate}
                          onChange={e => setCoveringSlipCreatedDate(e.target.value)}
                          className="bg-amber-500/5 border-amber-500/30 text-amber-500 font-bold focus-visible:ring-amber-500 mb-4"
                        />
                        <Label className="text-xs uppercase font-bold text-emerald-500 flex items-center gap-2 mt-4">
                          <Printer className="w-3 h-3" />
                          Print Date
                          <span className="text-[9px] font-normal text-muted-foreground normal-case">(For Covering Slip)</span>
                        </Label>
                        <Input
                          type="date"
                          value={coveringSlipPrintDate}
                          onChange={e => setCoveringSlipPrintDate(e.target.value)}
                          className="bg-emerald-500/5 border-emerald-500/30 text-emerald-500 font-bold focus-visible:ring-emerald-500"
                        />
                      </div>
                    )}

                    {isAdmin && (
                      <div className="flex items-center gap-2 mb-2 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        <Checkbox 
                          id="duplicate-print" 
                          checked={isDuplicatePrint}
                          onCheckedChange={(checked) => setIsDuplicatePrint(!!checked)}
                        />
                        <Label htmlFor="duplicate-print" className="text-xs font-bold text-amber-600 cursor-pointer">Print with DUPLICATE watermark</Label>
                      </div>
                    )}
                    <Button variant="outline" className="w-full gap-2 border border-blue-600/30 bg-blue-50/70 text-[#1e3a8a] hover:bg-[#1e3a8a] hover:text-white font-bold mt-2 rounded-xl transition-all shadow-xs" onClick={handlePrint}>
                      <Printer className="w-4 h-4" /> Print Covering Page (Slip)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Content Panel */}
            <div className="lg:col-span-2 space-y-6">
              {!selectedBill ? (
                <Card className="glass-card border-none shadow-xl">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <History className="w-6 h-6 text-primary" />
                        All Entries
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">Found {totalRecords} records matching your filters</p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="rounded-md border border-border/50 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead className="text-xs uppercase font-bold">Diary No</TableHead>
                              <TableHead className="text-xs uppercase font-bold">Track QR</TableHead>
                              <TableHead className="text-xs uppercase font-bold">Subject</TableHead>
                              <TableHead className="text-xs uppercase font-bold">Category</TableHead>
                              <TableHead className="text-xs uppercase font-bold">Amount</TableHead>
                              <TableHead className="text-xs uppercase font-bold">Marked To</TableHead>
                              <TableHead className="text-xs uppercase font-bold text-center">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {records.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                  No records found matching criteria
                                </TableCell>
                              </TableRow>
                            ) : (
                              records.map((file, i) => (
                                  <TableRow key={i} className="hover:bg-primary/5 transition-colors group animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                                    <TableCell className="font-mono text-xs font-bold text-primary">
                                      <Highlight text={file.cfo_diary_number} query={debouncedSearchQuery} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div
                                        className="cursor-zoom-in transition-transform hover:scale-110"
                                        onClick={() => handleQRClick(file.cfo_diary_number, file.receiving_number)}
                                      >
                                        <img
                                          src={`https://api.qrserver.com/v1/create-qr-code/?size=35x35&data=${encodeURIComponent(`${window.location.origin}/public-track/${file.cfo_diary_number}/${file.receiving_number}`)}&color=0ea5e9`}
                                          alt="QR"
                                          className="w-8 h-8 mx-auto rounded border border-border bg-white"
                                        />
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="font-semibold text-sm">
                                        <Highlight text={file.subject} query={debouncedSearchQuery} />
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        <Highlight text={file.receiving_number} query={debouncedSearchQuery} />
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <Badge variant="outline" className="text-[9px] uppercase">{mainCatReadable(file.mainCategory)}</Badge>
                                      {file.subCategory && (
                                        <span className="text-[8px] text-muted-foreground uppercase font-bold italic">
                                          {file.subCategory?.replace(/_/g, " ")}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-bold text-xs text-primary">{formatCurrency(file.amount || 0)}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] uppercase">
                                      {sections.find(s => s.id === file.mark_to)?.name}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1.5 px-3 border border-blue-200 dark:border-blue-700/60 bg-blue-50/80 dark:bg-blue-950/70 text-[#1e3a8a] dark:text-sky-300 hover:!bg-[#1e3a8a] hover:!text-white font-black text-xs rounded-xl shadow-xs transition-all"
                                      onClick={() => {
                                        setSelectedBill({
                                          ...file,
                                          diary_no: file.cfo_diary_number,
                                          party_name: file.received_from,
                                          amount: file.amount || 0
                                        });
                                        setCoveringSlipPrintDate(getLocalDateString(file.created_at));
                                        setCoveringSlipCreatedDate(getLocalDateString(file.created_at));
                                      }}
                                    >
                                      <span className="text-inherit">View Timeline</span> <ArrowRight className="w-3.5 h-3.5 text-inherit" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      {/* Server Pagination - Search Tab */}
                      {totalRecords > DB_PAGE_SIZE && (
                        <div className="flex items-center justify-between pt-4 border-t border-border/50">
                          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                            Showing {records.length} of {totalRecords} records
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                              disabled={currentPage === 0 || isLoading}
                              className="h-8 text-[10px] font-black uppercase tracking-tight"
                            >
                              <ArrowLeft className="w-3 h-3 mr-1" /> Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={currentPage >= totalPages - 1 || isLoading}
                              className="h-8 text-[10px] font-black uppercase tracking-tight"
                            >
                              Next <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedBill(null)}
                      className="gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back to Search Results
                    </Button>
                  </div>
                  {/* File Details */}
                  <Card className="glass-card border-none shadow-xl overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-primary to-blue-400" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/30">
                      <CardTitle className="text-lg font-bold">File Specifications</CardTitle>
                      <span className="text-xs font-mono font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">{selectedBill.tracking_id}</span>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <User className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Party / Vendor</p>
                            <p className="font-semibold">{selectedBill.party_name}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Subject</p>
                            <p className="text-sm text-muted-foreground">{selectedBill.subject}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Diary Reference</p>
                            <p className="font-mono text-sm">{selectedBill.diary_no || selectedBill.cfo_diary_number}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Clock className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Amount</p>
                            <p className="font-bold text-primary">{formatCurrency(selectedBill.amount)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tracking Journey */}
                  <Card className="glass-card border-none shadow-xl relative">
                    <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        Movement History (Timeline)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-10 pt-4">
                      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:via-primary/20 before:to-transparent">
                        <h4 className="text-xs font-black uppercase text-zinc-400 tracking-widest flex items-center justify-between">
                          <span className="flex items-center gap-2"><History className="w-4 h-4" /> Movement History</span>
                          <button 
                            onClick={() => setIsJourneyMapOpen(true)}
                            className="bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white transition-colors px-3 py-1.5 rounded-full text-[10px] flex items-center gap-1.5 shadow-sm"
                          >
                            <Network className="w-3.5 h-3.5" /> View Visual Map
                          </button>
                        </h4>
                        
                        <JourneyMapModal 
                          isOpen={isJourneyMapOpen} 
                          onClose={() => setIsJourneyMapOpen(false)} 
                          record={selectedBill} 
                        />

                        {selectedBill.history?.map((step: any, index: number) => (
                          <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-primary/50 bg-background text-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 group-hover:bg-primary group-hover:text-white transition-colors duration-200">
                              {index === selectedBill.history.length - 1 ? <MapPin className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </div>
                            <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-primary/10 bg-primary/5 shadow-sm group-hover:bg-primary/10 transition-colors duration-200">
                              <div className="flex items-center justify-between space-x-2 mb-1">
                                <div className="font-bold text-sm text-primary">{step.step}</div>
                                <time className="font-mono text-[10px] text-muted-foreground">{safeFormatDateTime(step.date)}</time>
                              </div>
                              <div className="text-xs font-semibold flex items-center gap-1 mb-2">
                                <Building2 className="w-3 h-3 text-muted-foreground" />
                                {step.location?.toUpperCase() || "PROCESSING"}
                              </div>
                              <div className="text-xs text-muted-foreground italic flex gap-1 items-start bg-background/50 p-2 rounded-md">
                                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                                "{step.remarks}"
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reception" className="animate-fade-up mt-0 border-none outline-none">
          <FileReception />
        </TabsContent>

        <TabsContent value="register" className="animate-fade-up">
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileEdit className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl font-bold">File Registration Form</CardTitle>
                      <Badge className="bg-[#1e3a8a] text-white text-xs px-2.5 py-0.5 font-bold shadow-xs">
                        Active Tab: Registration
                      </Badge>
                      {isEditingMode && <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5 font-bold">Edit Mode</Badge>}
                      {isForwardingMode && <Badge className="bg-indigo-500 text-white text-xs px-2 py-0.5 font-bold">Forwarding Mode</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">Register new inward files and track their forward movement</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" onClick={handleFormReset} className="bg-[#0f1115] text-white border-white/10 hover:bg-[#1a1c20] font-bold px-6 h-11 rounded-xl">Reset</Button>
                  <Button onClick={handleSaveForm} disabled={isSavingForm} className="bg-[#14b8a6] text-[#0f1115] hover:bg-[#14b8a6]/90 font-black gap-2 px-6 h-11 rounded-xl shadow-lg shadow-[#14b8a6]/20">
                    {isSavingForm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Record
                  </Button>
                </div>
              </div>
              {/* CFO Diary / Record Search */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <Search className="w-4 h-4 text-primary shrink-0" />
                <span className="text-[11px] font-black uppercase tracking-widest text-primary/70 shrink-0 hidden sm:block">CFO Diary Search:</span>
                <Input
                  placeholder="Search by CFO Diary No, Receiving No, or Subject to load for editing..."
                  value={cfoDiarySearchQuery}
                  onChange={e => setCfoDiarySearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCfoDiarySearch(); }}
                  className="flex-1 h-9 text-xs bg-background/50 border-primary/20 rounded-lg focus-visible:ring-primary/50"
                />
                <Button
                  size="sm"
                  onClick={handleCfoDiarySearch}
                  disabled={isCfoDiarySearching || !cfoDiarySearchQuery.trim()}
                  className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs gap-2 shrink-0"
                >
                  {isCfoDiarySearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Find & Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent
              id="registration-form-container"
              onKeyDown={handleKeyDown}
              onFocusCapture={(e) => {
                const target = e.target as HTMLElement;
                if (target && typeof target.scrollIntoView === 'function') {
                  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              }}
              className="flex flex-col gap-6 pt-6 border-t border-border/50"
            >
              
              {!isEditingMode && !isForwardingMode && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl bg-[#14b8a6]/10 border-2 border-[#14b8a6]/30 shadow-lg shadow-[#14b8a6]/5 w-full">
                  <div className="flex items-center gap-2">
                    <Inbox className="w-5 h-5 text-[#14b8a6] shrink-0" />
                    <span className="text-xs font-black uppercase tracking-widest text-[#14b8a6] shrink-0">Load Pending File (Reception):</span>
                  </div>
                  <div className="flex w-full sm:flex-1 gap-2">
                    <Input
                      placeholder="Enter Tracking Code (e.g. TRK-123456)"
                      value={pendingTrackingCode}
                      onChange={e => setPendingTrackingCode(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleLoadPendingRecord(); }}
                      className="flex-1 h-11 text-sm bg-white dark:bg-[#0a0a0b] text-slate-900 dark:text-slate-100 border-[#14b8a6]/40 rounded-lg focus-visible:ring-[#14b8a6]/50 font-mono font-semibold"
                    />
                    <Button
                      onClick={handleLoadPendingRecord}
                      disabled={!pendingTrackingCode.trim()}
                      className="h-11 px-6 bg-[#14b8a6] text-[#0f1115] hover:bg-[#14b8a6]/90 font-black text-sm gap-2 shrink-0 shadow-md"
                    >
                      Load File
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">CFO Office Diary No <span className="text-emerald-500 text-[9px]">(Auto-Generated)</span></Label>
                    <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      fetchNextDiaryNumber();
                    }}
                    className="h-5 px-2 py-0 text-[10px] text-sky-500 border border-sky-400/30 hover:bg-sky-500 hover:text-white transition-colors"
                    title="Regenerate Diary Number if it already exists"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                  </Button>
                </div>
                <Input
                  value={formData.cfo_diary_number}
                  onChange={e => setFormData({ ...formData, cfo_diary_number: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-slate-100 h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Inward Date</Label>
                <Input
                  type="date"
                  value={formData.inward_date}
                  onChange={e => setFormData({ ...formData, inward_date: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                />
              </div>

              {currentRole !== 'entry_operator' && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-teal-600 dark:text-[#14b8a6]">File Owner / Handover Person {currentRole !== 'entry_operator' && <span className="text-red-500">*</span>}</Label>
                  <Input
                    placeholder="Handover Person / Owner"
                    value={formData.handover_person_name || ""}
                    onChange={e => setFormData({ ...formData, handover_person_name: e.target.value })}
                    className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                  />
                </div>
              )}

              {currentRole !== 'entry_operator' && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-teal-600 dark:text-[#14b8a6]">File Purpose / Description {currentRole !== 'entry_operator' && <span className="text-red-500">*</span>}</Label>
                  <Input
                    placeholder="File Purpose"
                    value={formData.file_purpose || ""}
                    onChange={e => setFormData({ ...formData, file_purpose: e.target.value })}
                    className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                  />
                </div>
              )}

              {currentRole !== 'entry_operator' && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Budget Code <span className="text-muted-foreground/50 text-[10px]">(Optional)</span></Label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FileText className="h-4 w-4 text-amber-500" />
                    </div>
                    <Input
                      placeholder="e.g. BC-2024-001"
                      className="pl-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono h-11 transition-all rounded-xl font-semibold"
                      value={formData.budget_code || ""}
                      onChange={e => setFormData({ ...formData, budget_code: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Received From Section (Optional)</Label>
                <Input
                  placeholder="Department or Section"
                  value={formData.received_from}
                  onChange={e => setFormData({ ...formData, received_from: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Receiving Number {currentRole !== 'entry_operator' && <span className="text-red-500">*</span>}</Label>
                <Input
                  placeholder="Enter Receiving Number"
                  value={formData.receiving_number}
                  onChange={e => setFormData({ ...formData, receiving_number: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-slate-100 font-semibold h-11"
                />
              </div>
              {currentRole !== 'entry_operator' && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Department Number <span className="text-muted-foreground/50 text-[10px]">(Optional)</span></Label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FileText className="h-4 w-4 text-teal-500" />
                    </div>
                    <Input
                      placeholder="e.g. DEPT-123"
                      className="pl-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono h-11 transition-all rounded-xl font-semibold"
                      value={formData.department_number || ""}
                      onChange={e => setFormData({ ...formData, department_number: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Main Category {currentRole !== 'entry_operator' && <span className="text-red-500">*</span>}</Label>
                <Select
                  value={formData.mainCategory}
                  onValueChange={v => setFormData({ ...formData, mainCategory: v, subCategory: "" })}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11">
                    <SelectValue placeholder="Select Main Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {dynMainCats.map(mc => (
                      <SelectItem key={mc.config_key} value={mc.config_key}>{mc.config_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(formData.mainCategory === 'pol_bills' || formData.mainCategory === 'pol-bills' || formData.mainCategory === 'POL Bills') ? (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Fuel Station</Label>
                  <div className="relative">
                    <Select value={formData.fuel_station || formData.subCategory} onValueChange={v => setFormData({ ...formData, fuel_station: v, subCategory: v })}>
                      <SelectTrigger className="w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 h-11 transition-all rounded-xl font-semibold">
                        <SelectValue placeholder="Select fuel station" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[250px]">
                        <SelectItem value="ISHA SERVICE STATION">ISHA SERVICE STATION</SelectItem>
                        <SelectItem value="ALLIED PETROLIUM SERVICE">ALLIED PETROLIUM SERVICE</SelectItem>
                        <SelectItem value="AWAMI FILLING STATION">AWAMI FILLING STATION</SelectItem>
                        <SelectItem value="BANBHORE FILLING STATION">BANBHORE FILLING STATION</SelectItem>
                        <SelectItem value="BROTHERS SERVICE STATION">BROTHERS SERVICE STATION</SelectItem>
                        <SelectItem value="CENTRAL SERVICE STATION">CENTRAL SERVICE STATION</SelectItem>
                        <SelectItem value="DILAWAR GESOLINE">DILAWAR GESOLINE</SelectItem>
                        <SelectItem value="FAISAL FILLING STATION">FAISAL FILLING STATION</SelectItem>
                        <SelectItem value="FANCY SERVICE STATION">FANCY SERVICE STATION</SelectItem>
                        <SelectItem value="KARACHI SERVICE STATION">KARACHI SERVICE STATION</SelectItem>
                        <SelectItem value="KARIMI AUTOMOBILE SERVICE">KARIMI AUTOMOBILE SERVICE</SelectItem>
                        <SelectItem value="LANDHI GASOLINE SERVICES">LANDHI GASOLINE SERVICES</SelectItem>
                        <SelectItem value="MACCA MOBILE SERVICE">MACCA MOBILE SERVICE</SelectItem>
                        <SelectItem value="MADINA FILLING STATION">MADINA FILLING STATION</SelectItem>
                        <SelectItem value="MADINA SERVICE STATION EJAZ">MADINA SERVICE STATION EJAZ</SelectItem>
                        <SelectItem value="MADINA SERVICES STATION YASIR">MADINA SERVICES STATION YASIR</SelectItem>
                        <SelectItem value="MANSOOR SERVICE STATION">MANSOOR SERVICE STATION</SelectItem>
                        <SelectItem value="MUGHAL PETROLEUM SERVICES">MUGHAL PETROLEUM SERVICES</SelectItem>
                        <SelectItem value="NOOR PETROLIUM SERVICE">NOOR PETROLIUM SERVICE</SelectItem>
                        <SelectItem value="PAK PETROLEUM SERVICE">PAK PETROLEUM SERVICE</SelectItem>
                        <SelectItem value="PSO FLEET CARD">PSO FLEET CARD</SelectItem>
                        <SelectItem value="Q STAR PETROLEUM SERVICE">Q STAR PETROLEUM SERVICE</SelectItem>
                        <SelectItem value="ROSHAN SERVICE STATION">ROSHAN SERVICE STATION</SelectItem>
                        <SelectItem value="STADIUM SERVICE STATION">STADIUM SERVICE STATION</SelectItem>
                        <SelectItem value="SUPER SERVICE STATION">SUPER SERVICE STATION</SelectItem>
                        <SelectItem value="UNITED FILLING STATION">UNITED FILLING STATION</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Sub Category {currentRole !== 'entry_operator' && formData.mainCategory !== 'impress' && formData.mainCategory !== 'pol_bills' && <span className="text-red-500">*</span>}</Label>
                  <Select
                    value={formData.subCategory}
                    onValueChange={v => setFormData({ ...formData, subCategory: v })}
                    disabled={!formData.mainCategory}
                  >
                    <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11">
                      <SelectValue placeholder={formData.mainCategory ? "Select Sub Category" : "Select Main Category First"} />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.mainCategory && getSubCategoriesFor(dynSubCats, formData.mainCategory).map(sc => (
                        <SelectItem key={sc.config_key} value={sc.config_key}>{sc.config_label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Conditional Field: Employee Number */}
              {formData.mainCategory === 'employee' && formData.subCategory && (
                <div className="space-y-2 animate-in slide-in-from-left-2 duration-300 relative">
                  <Label className="text-xs uppercase font-bold text-sky-500 flex items-center gap-2">
                    <User className="w-3 h-3" /> Employee / Pension Number
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="Type Name, Emp No, or Pension No..."
                      value={formData.employee_number}
                      onChange={e => handleEmployeeNumberChange(e.target.value)}
                      onFocus={() => { if (empSuggestions.length > 0) setShowEmpSuggestions(true); }}
                      className="bg-sky-50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-500/30 text-sky-800 dark:text-sky-300 font-bold focus-visible:ring-sky-500 pr-8 font-mono text-sm h-11"
                    />
                    {isSearchingEmp && (
                      <div className="absolute right-2.5 top-2.5">
                        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                      </div>
                    )}
                  </div>

                  {/* Suggestions Popover Dropdown */}
                  {showEmpSuggestions && empSuggestions.length > 0 && (
                    <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-[#0f1115]/95 backdrop-blur-xl shadow-2xl p-1 space-y-0.5 scrollbar-thin">
                      <div className="p-1.5 text-[9px] uppercase font-bold text-sky-400/60 tracking-wider border-b border-white/5">
                        Lookup matches found
                      </div>
                      {empSuggestions.map((emp) => {
                        const num = emp.employee_no || emp.pension_no || "N/A";
                        return (
                          <div
                            key={emp.id}
                            onClick={() => handleSelectEmployee(emp)}
                            className="flex flex-col gap-0.5 p-2 rounded-md hover:bg-sky-500/10 cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs font-bold text-white">{emp.full_name}</span>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                              <span className="text-sky-400 font-semibold">{num}</span>
                              <span>•</span>
                              <span className="uppercase text-[9px] px-1 bg-white/5 rounded">{emp.category}</span>
                              {emp.source_tab && (
                                <>
                                  <span>•</span>
                                  <span className="text-[9px] text-purple-400 font-semibold uppercase">{emp.source_tab}</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Verified Employee Summary Profile Card */}
                  {selectedEmpProfile && (
                    <div className="mt-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md space-y-3 animate-in fade-in zoom-in-95 duration-300 shadow-inner col-span-full">
                      <div className="flex items-center justify-between border-b border-emerald-500/15 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Verified KWSC Staff Profile</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-400">
                          {selectedEmpProfile.category}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase font-medium">Full Name</span>
                          <p className="font-bold text-white text-sm truncate">{selectedEmpProfile.full_name}</p>
                        </div>
                        <div className="space-y-0.5 font-mono">
                          <span className="text-[9px] text-muted-foreground uppercase font-medium">Employee / Pen No</span>
                          <p className="font-bold text-white text-xs">{selectedEmpProfile.employee_no || selectedEmpProfile.pension_no || "---"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase font-medium">Original source sheet</span>
                          <p className="font-bold text-sky-400 text-xs font-mono uppercase">{selectedEmpProfile.source_tab || "UNIFIED"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase font-medium">Sanctioned Net Amount</span>
                          <p className="font-bold text-emerald-400 font-mono text-sm">
                            Rs. {(selectedEmpProfile.cheque_amount || selectedEmpProfile.total_amount || 0).toLocaleString()}
                          </p>
                        </div>
                        {selectedEmpProfile.bank_details && (
                          <div className="col-span-2 space-y-0.5 pt-1 border-t border-emerald-500/10">
                            <span className="text-[9px] text-muted-foreground uppercase font-medium">Bank details</span>
                            <p className="text-white/80 italic text-[11px] truncate">{selectedEmpProfile.bank_details}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Conditional Field: Contractor Account Selection */}
              {formData.mainCategory === 'contractor' && (
                <div className="space-y-2 animate-in slide-in-from-left-2 duration-300">
                  <Label className="text-xs uppercase font-bold text-amber-500 flex items-center gap-2">
                    <User className="w-3 h-3" /> Select Contractor
                  </Label>
                  <Select
                    value={formData.employee_number} // Reusing employee_number field to store the contractor phone number
                    onValueChange={(val) => {
                      const selected = contractorAccounts.find(c => c.config_key === val);
                      setFormData(prev => ({
                        ...prev,
                        employee_number: val,
                        received_from: selected ? selected.config_label : prev.received_from
                      }));
                    }}
                  >
                    <SelectTrigger className="bg-amber-500/5 border-amber-500/30 text-white font-bold h-10 text-sm">
                      <SelectValue placeholder="Select Contractor Account..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-white/10">
                      {contractorAccounts.map(account => (
                        <SelectItem key={account.id} value={account.config_key}>
                          {account.config_label} <span className="text-white/40 ml-2 font-mono text-xs">({account.config_key})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-white/40 italic">File updates will be sent to the contractor's WhatsApp number.</p>
                </div>
              )}

              {/* Conditional Field: Voucher Code */}
              {formData.mainCategory === 'contractor' && formData.subCategory && (
                <div className="space-y-2 animate-in slide-in-from-left-2 duration-300">
                  <Label className="text-xs uppercase font-bold text-emerald-500 flex items-center gap-2">
                    <FileText className="w-3 h-3" /> Voucher Code
                  </Label>
                  <Input
                    placeholder="Enter Voucher Reference"
                    value={formData.voucher_code}
                    onChange={e => setFormData({ ...formData, voucher_code: e.target.value })}
                    className="bg-emerald-500/5 border-emerald-500/30 font-bold focus-visible:ring-emerald-500"
                  />
                </div>
              )}

              {/* Conditional Field: Vehicle No */}
              {((formData.mainCategory === 'contractor' && formData.subCategory === 'pol_bills') || formData.mainCategory === 'pol_bills') && (
                <div className="space-y-2 animate-in slide-in-from-left-2 duration-300">
                  <Label className="text-xs uppercase font-bold text-orange-500 flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> Vehicle No (Optional)
                  </Label>
                  <Input
                    placeholder="Enter Vehicle Number"
                    value={formData.vehicle_no}
                    onChange={e => setFormData({ ...formData, vehicle_no: e.target.value })}
                    className="bg-orange-500/5 border-orange-500/30 font-bold focus-visible:ring-orange-500"
                  />
                </div>
              )}

              <div className="space-y-2 lg:col-span-1">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Subject {currentRole !== 'entry_operator' && <span className="text-red-500">*</span>}</Label>
                <Input
                  placeholder="Purpose of file"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                />
              </div>

              {(formData.mainCategory === 'employee' || formData.mainCategory === 'contractor') ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold text-muted-foreground">Amount (PKR) <span className="text-emerald-500 text-[9px]">(Gross Amount)</span></Label>
                      <Input
                        type="number"
                        placeholder="Enter Gross Amount"
                        value={formData.gross_amount}
                        onChange={e => {
                          const gross = Number(e.target.value);
                          setFormData({ ...formData, gross_amount: gross, amount: gross - (formData.deduction || 0) })
                        }}
                        className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold text-muted-foreground">Deduction (PKR)</Label>
                      <Input
                        type="number"
                        placeholder="Enter Deduction"
                        value={formData.deduction}
                        onChange={e => {
                          const ded = Number(e.target.value);
                          setFormData({ ...formData, deduction: ded, amount: (formData.gross_amount || 0) - ded })
                        }}
                        className="bg-white dark:bg-slate-900 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-bold h-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Amount (PKR) <span className="text-emerald-500 text-[9px]">(Net Amount)</span></Label>
                    <Input
                      type="number"
                      disabled
                      value={formData.amount}
                      className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 font-black text-emerald-700 dark:text-emerald-400 opacity-90 cursor-not-allowed h-11"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Amount (PKR) <span className="text-emerald-500 text-[9px]">(Net Amount)</span></Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="no_amount_chk"
                        checked={formData.no_amount || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, no_amount: !!checked, amount: checked ? 0 : formData.amount })}
                      />
                      <label htmlFor="no_amount_chk" className="text-[11px] font-semibold text-slate-600 dark:text-white/60 cursor-pointer select-none">No Amount</label>
                    </div>
                  </div>
                  <Input
                    type="number"
                    placeholder="Enter Amount"
                    value={formData.amount}
                    disabled={formData.no_amount || false}
                    onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold h-11 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              <div className="space-y-4">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Digital Authorization (E-Signature)</Label>

                {!formData.signature_data ? (
                  <Dialog open={isSignDialogOpen} onOpenChange={setIsSignDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full border-dashed border-2 h-20 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/50 transition-all">
                        <PenTool className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase">Click to Sign Digitally</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileSignature className="w-5 h-5 text-primary" />
                          Draw Your E-Signature
                        </DialogTitle>
                        <DialogDescription>
                          Choose to draw your signature or upload an image of your physical signature.
                        </DialogDescription>
                      </DialogHeader>

                      <Tabs defaultValue="draw" className="w-full mt-4">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="draw" className="gap-2">
                            <PenTool className="w-4 h-4" /> Draw
                          </TabsTrigger>
                          <TabsTrigger value="upload" className="gap-2">
                            <Upload className="w-4 h-4" /> Upload
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="draw" className="flex flex-col items-center gap-4 py-4 animate-in fade-in-50 duration-300">
                          <div className="border-2 border-border rounded-lg bg-white overflow-hidden touch-none">
                            <canvas
                              ref={canvasRef}
                              width={450}
                              height={200}
                              onMouseDown={startDrawing}
                              onMouseUp={stopDrawing}
                              onMouseMove={draw}
                              onMouseLeave={stopDrawing}
                              onTouchStart={startDrawing}
                              onTouchEnd={stopDrawing}
                              onTouchMove={draw}
                              className="cursor-crosshair"
                            />
                          </div>
                          <div className="flex w-full justify-between">
                            <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-destructive hover:text-destructive gap-2">
                              <ResetIcon className="w-4 h-4" /> Clear Pad
                            </Button>
                            <p className="text-[10px] text-muted-foreground italic self-center">Verification Stamp will be added automatically</p>
                          </div>
                          <div className="w-full flex justify-end gap-2 mt-2">
                            <Button variant="outline" onClick={() => setIsSignDialogOpen(false)}>Cancel</Button>
                            <Button onClick={saveSignature} className="bg-primary hover:bg-primary/90 gap-2">
                              Apply Signature <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="upload" className="flex flex-col items-center gap-6 py-10 animate-in slide-in-from-bottom-2 duration-300">
                          <div
                            className="w-full max-w-[300px] border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-4 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
                            onClick={() => document.getElementById('signature-image-upload')?.click()}
                          >
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-bold">Select Signature Image</p>
                              <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG or JPEG (Max 2MB)</p>
                            </div>
                            <input
                              type="file"
                              id="signature-image-upload"
                              hidden
                              accept="image/*"
                              onChange={handleSignatureUpload}
                            />
                          </div>
                          <p className="text-center text-[10px] text-muted-foreground max-w-[300px]">
                            Tip: For best results, use a high-contrast image (black ink on white paper).
                          </p>
                        </TabsContent>
                      </Tabs>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <div className="relative group">
                    <div className="border-2 border-emerald-500/30 rounded-lg p-2 bg-emerald-500/5 flex flex-col items-center overflow-hidden">
                      <img src={formData.signature_data} alt="ESign" className="max-h-16 mix-blend-multiply" />
                      <div className="mt-2 text-[8px] font-mono text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        VERIFIED: {safeFormatDate(formData.date_of_sign)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      onClick={() => setFormData({ ...formData, signature_data: "" })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Date of Sign</Label>
                <Input
                  type="date"
                  value={formData.date_of_sign}
                  onChange={e => setFormData({ ...formData, date_of_sign: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-bold h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Mark To (Forward) {currentRole !== 'entry_operator' && <span className="text-red-500">*</span>}</Label>
                <Select value={formData.mark_to} onValueChange={v => setFormData({ ...formData, mark_to: v })}>
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11">
                    <SelectValue placeholder="Target Section" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-primary/20 text-slate-900 dark:text-white">
                    {sections.map(section => (
                      <SelectItem key={section.id} value={section.id} className="font-bold uppercase tracking-tight">
                        {section.name} {section.id === 'books' || section.id === 'establishment' ? '(NEW)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(isForwardingMode || isEditingMode) && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Additional Mark To <span className="text-muted-foreground/50 text-[10px]">(Optional)</span></Label>
                  <Select
                    value={formData.additional_mark_to || ""}
                    onValueChange={v => setFormData({ ...formData, additional_mark_to: v })}
                  >
                    <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11">
                      <SelectValue placeholder="Select additional department (optional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-primary/20 text-slate-900 dark:text-white">
                      {sections.map(section => (
                        <SelectItem key={section.id} value={section.id} className="font-bold uppercase tracking-tight">
                          {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Outward (Forwarding) Date</Label>
                <Input
                  type="date"
                  value={formData.outward_date}
                  onChange={e => setFormData({ ...formData, outward_date: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                />
              </div>

              {(isAdmin || allowOverrideDates) && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-amber-600 dark:text-amber-500 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Registration Date
                      <span className="text-[9px] font-normal text-muted-foreground normal-case">(Backward date allowed)</span>
                    </Label>
                    <Input
                      type="date"
                      value={formData.registration_date}
                      onChange={e => setFormData({ ...formData, registration_date: e.target.value, print_date: e.target.value })}
                      className="bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-500 font-bold h-11 focus-visible:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-emerald-600 dark:text-emerald-500 flex items-center gap-2">
                      <Printer className="w-3 h-3" />
                      Print Date
                      <span className="text-[9px] font-normal text-muted-foreground normal-case">(Shown on print slip)</span>
                    </Label>
                    <Input
                      type="date"
                      value={formData.print_date}
                      onChange={e => setFormData({ ...formData, print_date: e.target.value })}
                      className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-500 font-bold h-11 focus-visible:ring-emerald-500"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2 lg:col-span-3">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Remarks</Label>
                <Input
                  placeholder="Any additional notes..."
                  value={formData.remarks}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold h-11"
                />
              </div>

              {/* ── Document Image Section ── */}
              <div className="space-y-3 lg:col-span-3 border border-dashed border-border/40 rounded-xl p-4 bg-muted/10">
                <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
                  <ImageIcon className="w-3 h-3" />
                  Document Photo
                  <span className="text-[9px] font-normal normal-case text-muted-foreground">(Optional — attach scanned copy)</span>
                </Label>

                {fileImage ? (
                  <div className="relative w-full">
                    <img
                      src={fileImage}
                      alt="Document"
                      className="w-full max-h-48 object-contain rounded-lg border border-border/30 bg-black/20"
                    />
                    <button
                      type="button"
                      onClick={() => setFileImage("")}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-md"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {/* Desktop file input */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            // Resize via canvas first
                            const dataUrl = await new Promise<string>((resolve) => {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const img = new Image();
                                img.src = ev.target?.result as string;
                                img.onload = () => {
                                  const canvas = document.createElement('canvas');
                                  const MAX = 1024;
                                  let w = img.width, h = img.height;
                                  if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
                                  else { if (h > MAX) { w = w * MAX / h; h = MAX; } }
                                  canvas.width = w; canvas.height = h;
                                  canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
                                  resolve(canvas.toDataURL('image/jpeg', 0.75));
                                };
                              };
                              reader.readAsDataURL(file);
                            });
                            // Convert base64 to Blob and upload to Supabase Storage
                            const base64Data = dataUrl.split(',')[1];
                            const blob = await fetch(dataUrl).then(r => r.blob());
                            const fileName = `doc_images/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
                            const { data: uploadData, error: uploadError } = await supabase.storage
                              .from('file-tracking-images')
                              .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
                            if (uploadError) {
                              console.warn('Storage upload failed, falling back to base64:', uploadError.message);
                              setFileImage(dataUrl); // fallback
                            } else {
                              const { data: urlData } = supabase.storage
                                .from('file-tracking-images')
                                .getPublicUrl(fileName);
                              setFileImage(urlData.publicUrl);
                            }
                          } catch (err) {
                            console.warn('Image processing error:', err);
                          }
                          e.target.value = '';
                        }}
                      />
                      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors text-xs font-bold text-muted-foreground">
                        <Upload className="w-3.5 h-3.5" />
                        Upload from PC
                      </div>
                    </label>

                    {/* Mobile QR scan button */}
                    <button
                      type="button"
                      onClick={() => {
                        const sessionId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        setMobileUploadSessionId(sessionId);
                        setShowMobileUploadQR(true);
                        setIsMobileListening(true);
                        // Subscribe to Supabase Realtime broadcast
                        const channel = supabase.channel(`mobile-upload-${sessionId}`);
                        channel
                          .on('broadcast', { event: 'image-uploaded' }, (payload) => {
                            if (payload?.payload?.image) {
                              setFileImage(payload.payload.image);
                              setShowMobileUploadQR(false);
                              setIsMobileListening(false);
                              toast.success("Document photo received from mobile!");
                              supabase.removeChannel(channel);
                            }
                          })
                          .subscribe();
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors text-xs font-bold text-teal-500"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      Scan from Mobile
                    </button>
                  </div>
                )}

                {/* Mobile QR Modal */}
                {showMobileUploadQR && mobileUploadSessionId && (
                  <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
                      <h3 className="text-base font-black text-white">Scan with Mobile Camera</h3>
                      <p className="text-xs text-zinc-400">Open camera app, scan the QR code, then take a photo of the document.</p>
                      <div className="flex justify-center">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/mobile-upload/' + mobileUploadSessionId)}`}
                          alt="QR Code"
                          className="w-48 h-48 rounded-xl border-4 border-white"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono break-all">
                        {window.location.origin}/mobile-upload/{mobileUploadSessionId}
                      </p>
                      {isMobileListening && (
                        <div className="flex items-center justify-center gap-2 text-xs text-teal-400 font-bold">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Waiting for mobile upload...
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowMobileUploadQR(false);
                          setIsMobileListening(false);
                        }}
                        className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </CardContent>

            {/* Journey History at the Bottom */}
            {records.find(r => r.receiving_number === formData.receiving_number) && (
              <div className="border-t border-border/50 bg-muted/10 p-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                  <History className="w-5 h-5" /> Detailed File Movement Record
                </h3>
                <div className="space-y-0 ml-4 border-l-2 border-primary/20">
                  {records.find(r => r.receiving_number === formData.receiving_number)?.history.map((step: any, i: number) => (
                    <div key={i} className="relative pb-8 pl-8 last:pb-0">
                      <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-1">
                        <span className="text-xs font-black text-primary uppercase bg-primary/10 px-2 py-0.5 rounded">Action Log #{i + 1}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{safeFormatDate(step.date)}</span>
                      </div>
                      <div className="bg-background rounded-lg border border-border p-3 shadow-sm hover:border-primary/50 transition-colors">
                        <div className="flex items-center justify-between gap-4 text-sm font-bold mb-2 pb-2 border-b border-border/50">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {step.processed_by}
                          </div>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 hover:bg-primary/10 text-primary">
                                <FileSearch className="w-3 h-3" /> View Log Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Log Snapshot: {step.processed_by}</DialogTitle>
                                <DialogDescription>Full data captured at {safeFormatDateTime(step.date)}</DialogDescription>
                              </DialogHeader>
                              <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-muted/20 rounded-xl border border-border">
                                <div>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Main Category</p>
                                  <p className="text-sm font-semibold">{mainCatReadable(step.mainCategory).toUpperCase()}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Sub Category</p>
                                  <p className="text-sm font-semibold">{step.subCategory?.replace(/_/g, " ")?.toUpperCase()}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Subject</p>
                                  <p className="text-sm font-semibold bg-background p-2 rounded border border-border/50">{step.subject}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Remarks</p>
                                  <p className="text-xs text-muted-foreground italic bg-background p-2 rounded border border-border/20">&ldquo;{step.remarks}&rdquo;</p>
                                </div>
                                {step.employee_number && (
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Employee Number</p>
                                    <p className="text-sm font-semibold">{step.employee_number}</p>
                                  </div>
                                )}
                                {step.voucher_code && (
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Voucher Code</p>
                                    <p className="text-sm font-semibold">{step.voucher_code}</p>
                                  </div>
                                )}
                                {step.vehicle_no && (
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Vehicle No</p>
                                    <p className="text-sm font-semibold">{step.vehicle_no}</p>
                                  </div>
                                )}
                                {step.signature_data && (
                                  <div className="col-span-2">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Digital Signature</p>
                                    <img src={step.signature_data} alt="Sign" className="h-16 border rounded bg-white p-1" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Marked To</p>
                                  <Badge>{step.mark_to?.toUpperCase()}</Badge>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <p className="text-xs text-muted-foreground italic line-clamp-2">&ldquo;{step.remarks}&rdquo;</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Pending Scans Tab */}
        <TabsContent value="pending_scans" className="animate-fade-up">
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Pending File Scans
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isPendingFilesLoading ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-amber-400/20 rounded-full animate-spin"></div>
                    <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                  </div>
                  <p className="text-sm font-semibold text-amber-400 animate-pulse">Loading Pending Scans...</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border/50 bg-[#0f1115]/50 overflow-hidden backdrop-blur-sm">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="border-border/30 hover:bg-transparent">
                          <TableHead className="font-bold text-xs uppercase text-muted-foreground whitespace-nowrap">Tracking Code</TableHead>
                          <TableHead className="font-bold text-xs uppercase text-muted-foreground">Details</TableHead>
                          <TableHead className="font-bold text-xs uppercase text-muted-foreground">Category</TableHead>
                          <TableHead className="font-bold text-xs uppercase text-muted-foreground whitespace-nowrap">Scan Date</TableHead>
                          <TableHead className="font-bold text-xs uppercase text-muted-foreground text-right whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingFilesList.length === 0 ? (
                          <TableRow className="hover:bg-transparent border-none">
                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                              No pending scans available.
                            </TableCell>
                          </TableRow>
                        ) : (
                          pendingFilesList.map((file, i) => (
                            <TableRow key={file.id} className="hover:bg-amber-400/5 border-border/30 transition-colors animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                              <TableCell className="font-mono text-[10px] font-bold text-amber-400">{file.tracking_code}</TableCell>
                              <TableCell>
                                <div className="font-semibold text-sm max-w-[200px] truncate">{file.subject || 'N/A'}</div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[9px] uppercase border-amber-400/30 text-amber-400 bg-amber-400/5 font-bold tracking-widest whitespace-nowrap">
                                  {file.category}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {safeFormatDateTime(file.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge className="text-[9px] bg-amber-500/10 text-amber-500 border-amber-500/20 uppercase font-black tracking-widest">
                                  {file.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* View Only Tab - read‑only view for file_viewer */}
        <TabsContent value="view_only" className="animate-fade-up">
          <Card className="glass-card border-none shadow-xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Eye className="w-6 h-6 text-primary" /> View Only
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Read‑only list of files for your department</p>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <p className="text-center py-10 text-white/40 italic">No records available for viewing.</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border/50 overflow-hidden bg-background/40">
                    <Table>
                      <TableHeader className="bg-muted/50 text-[10px] uppercase font-black tracking-tighter">
                        <TableRow>
                          <TableHead>Diary #</TableHead>
                          <TableHead>Ref/Sub</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>From & Mark To</TableHead>
                          <TableHead>Created At</TableHead>
                          <TableHead>Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((file, i) => (
                          <TableRow key={i} className="hover:bg-primary/5 border-border/30 transition-colors animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                            <TableCell className="font-mono text-[10px] font-bold text-primary">{file.cfo_diary_number}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-bold text-xs">{file.subject}</span>
                                <span className="text-[10px] text-muted-foreground italic">{file.receiving_number}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className="text-[9px] uppercase border-primary/20">{mainCatReadable(file.mainCategory)}</Badge>
                                {file.subCategory && (
                                  <span className="text-[8px] text-muted-foreground uppercase font-bold italic">
                                    {file.subCategory?.replace(/_/g, " ")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px]">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-muted-foreground">F: {file.received_from}</span>
                                <span className="text-emerald-500 font-bold">M: {sections.find(s => s.id === file.mark_to)?.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-muted-foreground">
                              {safeFormatDate(file.created_at)}
                            </TableCell>
                            <TableCell className="font-bold text-[10px] text-primary">
                              {formatCurrency(file.amount || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Server Pagination - View Only */}
                  {totalRecords > DB_PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                        Showing {records.length} of {totalRecords} records
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                          disabled={currentPage === 0 || isLoading}
                          className="h-8 text-[10px] font-black uppercase tracking-tight"
                        >
                          <ArrowLeft className="w-3 h-3 mr-1" /> Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={currentPage >= totalPages - 1 || isLoading}
                          className="h-8 text-[10px] font-black uppercase tracking-tight"
                        >
                          Next <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contractor_bills" className="mt-6 space-y-6">
            <Card className="glass-card border-none shadow-2xl">
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  Contractor Bills
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-sm font-mono">
                    {totalRecords} entries
                  </span>
                </CardTitle>
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                  <Select value={contractorYearFilter} onValueChange={setContractorYearFilter}>
                    <SelectTrigger className="w-[150px] bg-[#0f1115] border-white/10 text-white font-bold h-10">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f1115] border-white/10 text-white">
                      <SelectItem value="all">All Years</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                      <SelectItem value="2627">2627</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={contractorMarkToFilter} onValueChange={setContractorMarkToFilter}>
                    <SelectTrigger className="w-[150px] bg-[#0f1115] border-white/10 text-white font-bold h-10">
                      <SelectValue placeholder="Mark To" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f1115] border-white/10 text-white">
                      <SelectItem value="all">All Sections</SelectItem>
                      <SelectItem value="budget">Budget</SelectItem>
                      <SelectItem value="cia">CIA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead>Diary / Receiving</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date / Time</TableHead>
                        <TableHead>Status / Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((file, i) => (
                        <TableRow key={i} className="hover:bg-primary/5 transition-colors group">
                          <TableCell className="font-mono text-xs font-bold text-primary">{file.cfo_diary_number}</TableCell>
                          <TableCell>
                            <div className="font-bold text-sm text-foreground">{file.subject}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">{file.mainCategory} / {file.subCategory}</div>
                          </TableCell>
                          <TableCell className="font-mono font-bold">{formatCurrency(file.amount)}</TableCell>
                          <TableCell>
                            <div className="text-xs font-medium">{new Date(file.created_at).toLocaleDateString()}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(file.created_at).toLocaleTimeString()}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase">{file.mark_to}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {/* Pagination for contractor bills */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                  <span className="text-sm text-white/50">
                    Showing {records.length} of {totalRecords} entries
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
                      disabled={currentPage === 0}
                      className="px-3 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-30 hover:bg-white/10 transition"
                    >← Prev</button>
                    <span className="text-sm text-white/50">Page {currentPage + 1}</span>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={(currentPage + 1) * 50 >= totalRecords}
                      className="px-3 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-30 hover:bg-white/10 transition"
                    >Next →</button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cfo_all_files" className="mt-6 space-y-6">
          <Card className="glass-card border-none shadow-2xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <Building2 className="w-6 h-6 text-[#14b8a6]" />
                  CFO Dashboard
                </CardTitle>
                <p className="text-xs text-white/40 mt-2 font-medium">Manage and exit files across all departments</p>
              </div>
              <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                <div className="relative group">
                  <Input 
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleScanExit(scanInput);
                    }}
                    placeholder="Scan QR to Exit..."
                    className="w-full md:w-[250px] pl-10 bg-[#111318] border-white/10 text-white font-bold h-10 transition-all focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6]"
                    disabled={isScanning}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#14b8a6] transition-colors">
                    {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <Select value={filterStatus} onValueChange={(val: 'active' | 'exited') => setFilterStatus(val)}>
                    <SelectTrigger className="w-[150px] bg-[#0f1115] border-white/10 text-white font-bold h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f1115] border-white/10 text-white">
                      <SelectItem value="active">Active Files</SelectItem>
                      <SelectItem value="exited">Exited Files</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={filterSection} onValueChange={setFilterSection}>
                    <SelectTrigger className="w-[180px] bg-[#0f1115] border-white/10 text-white font-bold h-10">
                      <SelectValue placeholder="All Sections" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f1115] border-white/10 text-white max-h-[300px]">
                      <SelectItem value="all">All Sections</SelectItem>
                      {sections.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-white/5 overflow-hidden bg-black/20">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Diary No</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Subject</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Category</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Amount</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Marked To</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase tracking-widest pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-white/30 font-medium">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#14b8a6]" />
                        </TableCell>
                      </TableRow>
                    ) : records.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-white/30 font-medium">No files found matching criteria.</TableCell>
                      </TableRow>
                    ) : (
                      records.map((file, i) => (
                        <TableRow key={i} className="hover:bg-white/5 border-white/5 transition-colors animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                          <TableCell className="font-mono text-xs font-bold text-[#14b8a6]">{file.cfo_diary_number}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-sm">{file.subject}</div>
                            <div className="text-[10px] text-white/40">{file.receiving_number}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] uppercase border-white/10 bg-white/5">{mainCatReadable(file.mainCategory)}</Badge>
                          </TableCell>
                          <TableCell className="font-black text-xs text-emerald-400">{formatCurrency(file.amount || 0)}</TableCell>
                          <TableCell>
                            {file.mark_to === 'exited' ? (
                              <Badge className="bg-red-500/20 text-red-400 border-none text-[10px] uppercase font-bold">EXITED</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] uppercase border-white/10 bg-white/5">
                                {sections.find(s => s.id === file.mark_to)?.name || file.mark_to}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-2">
                              {file.mark_to !== 'exited' && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-8 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold text-[10px] uppercase tracking-widest"
                                  onClick={() => {
                                    setExitModalFile(file);
                                    setExitModalScanInput("");
                                  }}
                                  disabled={isExitingFile}
                                >
                                  {isExitingFile ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Trash2 className="w-3 h-3 mr-2" />}
                                  Exit
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:text-[#14b8a6]"
                                onClick={() => handleQRClick(file.cfo_diary_number, file.receiving_number, getLocalDateString(file.created_at), getLocalDateString(file.created_at))}
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {totalRecords > DB_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/5">
                  <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                    Showing {records.length} of {totalRecords} records
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0 || isLoading}
                      className="h-8 bg-transparent border-white/10 text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-tight"
                    >
                      <ArrowLeft className="w-3 h-3 mr-1" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1 || isLoading}
                      className="h-8 bg-transparent border-white/10 text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-tight"
                    >
                      Next <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {currentRole === 'super_admin' && (
        <TabsContent value="backdate_2026" className="mt-6 space-y-6">
          <Card className="glass-card border-none shadow-2xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3 text-purple-500">
                  <History className="w-6 h-6 text-purple-500" />
                  Backdate (2026) Restricted Files
                </CardTitle>
                <p className="text-xs text-white/40 mt-2 font-medium">View files registered with 2026 CFO Diary Numbers</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-white/5 overflow-hidden bg-black/20">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Diary No</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Subject</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Category</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Amount</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase tracking-widest pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-white/30 font-medium">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#14b8a6]" />
                        </TableCell>
                      </TableRow>
                    ) : records.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-white/30 font-medium">No 2026 backdated files found.</TableCell>
                      </TableRow>
                    ) : (
                      records.map((file, i) => (
                        <TableRow key={i} className="hover:bg-white/5 border-white/5 transition-colors animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                          <TableCell className="font-mono text-xs font-bold text-purple-400">{file.cfo_diary_number}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-sm">{file.subject}</div>
                            <div className="text-[10px] text-white/40">{file.receiving_number}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] uppercase border-white/10 bg-white/5">{mainCatReadable(file.mainCategory)}</Badge>
                          </TableCell>
                          <TableCell className="font-black text-xs text-emerald-400">{formatCurrency(file.amount || 0)}</TableCell>
                          <TableCell className="text-right pr-6 flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                 setQrFullScreen({ diary: file.cfo_diary_number, receiving: file.receiving_number, print_date: file.print_date, subject: file.subject, mark_to: file.mark_to, additional_mark_to: file.additional_mark_to });
                              }}
                              className="h-8 gap-2 border border-blue-600/30 bg-blue-50/70 text-[#1e3a8a] hover:bg-[#1e3a8a] hover:text-white font-bold text-xs rounded-xl transition-all shadow-xs"
                            >
                              <Printer className="w-3.5 h-3.5" /> <span>Print QR</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
        {isAdmin && (
        <TabsContent value="trash_box" className="mt-6 space-y-6">
          <Card className="glass-card border-none shadow-2xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3 text-red-500">
                  <Trash2 className="w-6 h-6 text-red-500" />
                  Trash Box
                </CardTitle>
                <p className="text-xs text-white/40 mt-2 font-medium">View and restore deleted files</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-white/5 overflow-hidden bg-black/20">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Diary No</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Subject</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Category</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest">Amount</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase tracking-widest pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-white/30 font-medium">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#14b8a6]" />
                        </TableCell>
                      </TableRow>
                    ) : records.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-white/30 font-medium">No trashed files found.</TableCell>
                      </TableRow>
                    ) : (
                      records.map((file, i) => (
                        <TableRow key={i} className="hover:bg-white/5 border-white/5 transition-colors opacity-70 animate-row-slide-in" style={{ animationDelay: `${i * 0.05}s` }}>
                          <TableCell className="font-mono text-xs font-bold text-red-400">{file.cfo_diary_number}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-sm line-through decoration-red-500/50">{file.subject}</div>
                            <div className="text-[10px] text-white/40">{file.receiving_number}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] uppercase border-white/10 bg-white/5">{mainCatReadable(file.mainCategory)}</Badge>
                          </TableCell>
                          <TableCell className="font-black text-xs text-emerald-400/50">{formatCurrency(file.amount || 0)}</TableCell>
                          <TableCell className="text-right pr-6">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 font-bold text-[10px] uppercase tracking-widest"
                              onClick={() => handleRestoreRecord(file)}
                            >
                              <RefreshCw className="w-3 h-3 mr-2" />
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

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
        ${isPrintingCovering ? `
          @media print {
            @page { size: A5 portrait; margin: 0; }
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

      {/* Hidden Printable Covering Page */}
      <div className={`print-only hidden ${isPrintingCovering ? '' : 'no-print'}`}>
        <div ref={printRef} className="p-6 font-sans text-black bg-white min-h-[210mm] w-[148mm] mx-auto relative overflow-hidden">
          {/* Full-Page Official KWSC Watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[35] overflow-hidden">
            <img src="/kwsc-watermark-logo.png" alt="KWSC Watermark" className="w-[420px] h-[420px] object-contain opacity-[0.10] select-none filter contrast-125 print:opacity-[0.14]" />
          </div>
          
          {/* DUPLICATE Watermark */}
          {isDuplicatePrint && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <div 
                className="text-[120px] font-black uppercase text-gray-300/30 -rotate-45 select-none"
                style={{ WebkitTextStroke: '2px rgba(156, 163, 175, 0.4)' }}
              >
                DUPLICATE
              </div>
            </div>
          )}

          {/* Header */}
          <div className="text-center border-b-2 border-black pb-4 mb-4 flex justify-between items-end relative z-10">
            <div className="text-left">
              <h1 className="text-xl font-black uppercase tracking-tighter">Karachi Water Corporation</h1>
              <h2 className="text-sm font-bold uppercase mt-1">Finance Department - File Movement Slip</h2>
              <div className="flex gap-4 mt-2 font-mono text-[10px]">
                <span>Ref No: {selectedBill?.diary_no}</span>
                <span>Tracking ID: {selectedBill?.tracking_id}</span>
              </div>
            </div>
            {selectedBill && (
              <div className="flex flex-col items-center gap-1">
                <div className="relative inline-flex items-center justify-center border border-black p-1 bg-white">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.origin}/public-track/${selectedBill.cfo_diary_number || selectedBill.diary_no}/${selectedBill.receiving_number || selectedBill.tracking_id}?sec=${selectedBill.mark_to || selectedBill.current_status || 'CFO'}`)}`}
                    alt="QR Code"
                    className="w-24 h-24"
                  />
                  {/* Central KWSC Watermark Logo */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <img
                      src="/kwsc-watermark-logo.png"
                      alt="KWSC Watermark"
                      className="w-7 h-7 object-contain bg-white rounded-full p-0.5 shadow-sm border border-blue-900/40"
                    />
                  </div>
                </div>
                <span className="text-[7px] font-bold mt-1 max-w-[100px] text-center uppercase">Prepared by Engineer Tariq Zamir</span>
                <span className="text-[8px] font-bold font-mono">{selectedBill.receiving_number || selectedBill.tracking_id}</span>
              </div>
            )}
          </div>

          {/* File Overview */}
          <div className="grid grid-cols-2 gap-8 mb-10">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Party / Vendor Name</p>
                <p className="text-base font-bold underline underline-offset-4">{selectedBill?.party_name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Subject / Nature of Work</p>
                <p className="text-sm border-b border-dotted border-gray-400 pb-1">{selectedBill?.subject}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Created Date</p>
                <p className="text-base font-bold">{safeFormatDate(coveringSlipCreatedDate)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Printed Date</p>
                <p className="text-sm font-semibold">
                  {safeFormatDate(coveringSlipPrintDate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Amount Claimed</p>
                <p className="text-base font-bold">{formatCurrency(selectedBill?.amount)}</p>
              </div>
            </div>
          </div>

          {/* Movement Table */}
          <div className="mt-8">
            <h3 className="text-sm font-bold uppercase mb-4 bg-gray-100 p-2">Chronological Movement Record</h3>
            <table className="w-full border-collapse border border-black text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black p-2 text-left w-12">SN</th>
                  <th className="border border-black p-2 text-left">Department / Section</th>
                  <th className="border border-black p-2 text-left">Date & Time</th>
                  <th className="border border-black p-2 text-left">Action Taken / Remarks</th>
                  <th className="border border-black p-2 text-left w-24">Signature</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                  const step = selectedBill?.history?.[i - 1];
                  return (
                    <tr key={i} className="h-16">
                      <td className="border border-black p-2 text-center font-bold">{i}</td>
                      <td className="border border-black p-2 text-sm font-semibold">{step?.location || ""}</td>
                      <td className="border border-black p-2 font-mono text-[10px]">{step ? safeFormatDateTime(step.date) : ""}</td>
                      <td className="border border-black p-2 text-gray-600">{step?.remarks || ""}</td>
                      <td className="border border-black p-2"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="absolute bottom-10 left-10 right-10 flex justify-between items-end border-t border-black pt-4">
            <div className="text-[10px] font-mono">
              <p>Generated by: FinLedger Software</p>
              <p>Printed Date: {new Date().toLocaleString()}</p>
            </div>
            <div className="text-center w-48">
              <div className="border-t border-black mb-1"></div>
              <p className="text-[10px] font-bold uppercase">Section Officer (Finance)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Full Screen Ticket & QR Modal (Matches Public Tracking Layout) */}
      <Dialog open={!!qrFullScreen} onOpenChange={(open) => !open && setQrFullScreen(null)}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-xl">
          {(() => {
            const ticket = qrFullScreen ? records.find(r => r.cfo_diary_number === qrFullScreen.diary || r.receiving_number === qrFullScreen.receiving) : null;
            return (
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
                          <p className="text-sm font-black text-slate-900 dark:text-white print:text-black font-mono mt-1 tracking-tight">{qrFullScreen?.diary || '—'}</p>
                        </div>
                        <div className="bg-emerald-50/70 dark:bg-emerald-950/70 print:bg-slate-50 rounded-2xl p-3.5 text-center border-2 border-emerald-200 dark:border-emerald-700/60 print:border-slate-300 relative group overflow-hidden">
                          <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 print:text-emerald-800 uppercase tracking-wider block">Receiving No</span>
                          <p className="text-sm font-black text-slate-900 dark:text-white print:text-black font-mono mt-1 tracking-tight">{qrFullScreen?.receiving || '—'}</p>
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
                            <p className="text-xs font-black text-slate-900 dark:text-white print:text-black leading-snug">{qrFullScreen?.subject || ticket?.subject || "Subject Details"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-700 print:border-slate-200">
                            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Created Date</span>
                            <p className="text-xs font-black text-amber-700 dark:text-amber-300 print:text-amber-800 font-mono tracking-tight">{safeFormatDate(qrFullScreen?.created_date)}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-700 print:border-slate-200">
                            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Printed Date</span>
                            <p className="text-xs font-black text-emerald-700 dark:text-emerald-300 print:text-emerald-800 font-mono tracking-tight">
                              {safeFormatDate(qrFullScreen?.print_date)}
                            </p>
                          </div>
                        </div>
                        {qrFullScreen?.history?.filter((h: any) => (h.action === 'FORWARD' || h.action === 'FORWARDED') && h.from)?.slice(-1)[0]?.from && (
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-700 print:border-slate-200">
                              <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Previous Section</span>
                              <p className="text-xs font-black text-slate-800 dark:text-slate-100 print:text-black uppercase tracking-tight">
                                {sections.find(s => s.id === qrFullScreen.history!.filter((h: any) => (h.action === 'FORWARD' || h.action === 'FORWARDED') && h.from).slice(-1)[0].from)?.name || qrFullScreen.history!.filter((h: any) => (h.action === 'FORWARD' || h.action === 'FORWARDED') && h.from).slice(-1)[0].from}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-[#1e3a8a] dark:text-sky-300 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-700 print:border-slate-200">
                            <Building2 className="w-4 h-4 text-[#1e3a8a] dark:text-sky-300" />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Current Section</span>
                            <p className="text-xs font-black text-[#1e3a8a] dark:text-sky-300 print:text-[#1e3a8a] uppercase tracking-tight">{qrFullScreen?.mark_to ? (sections.find(s => s.id === qrFullScreen.mark_to)?.name || qrFullScreen.mark_to) : (ticket?.mark_to || "CFO Office")}</p>
                          </div>
                        </div>
                        {(qrFullScreen?.additional_mark_to || ticket?.additional_mark_to) && (
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 border border-purple-100 dark:border-purple-700 print:border-slate-200">
                              <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Additional Mark To</span>
                              <p className="text-xs font-black text-purple-700 dark:text-purple-300 print:text-purple-800 uppercase tracking-tight">{qrFullScreen?.additional_mark_to ? (sections.find(s => s.id === qrFullScreen.additional_mark_to)?.name || qrFullScreen.additional_mark_to) : (sections.find(s => s.id === ticket?.additional_mark_to)?.name || ticket?.additional_mark_to)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* QR Section - Crisp High Contrast, Clean borders, 100% Scannable */}
                      <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900/80 print:bg-white rounded-2xl flex flex-col items-center gap-3 text-center border border-slate-200 dark:border-slate-700 print:border-none print:shadow-none">
                        <div data-qr-white className="qr-code-white-card bg-white p-3.5 rounded-xl border-2 border-[#1e3a8a] dark:border-sky-400 print:border-[#1e3a8a] flex flex-col items-center shadow-md" style={{ backgroundColor: '#ffffff' }}>
                          <div data-qr-white className="relative inline-flex items-center justify-center p-2 rounded-lg bg-white" style={{ backgroundColor: '#ffffff' }}>
                            <QRCodeCanvas
                              value={`${window.location.origin}/public-track/${qrFullScreen?.diary || qrFullScreen?.receiving}/${qrFullScreen?.receiving || qrFullScreen?.diary}`}
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
                          <p className="text-slate-800 dark:text-white print:text-black text-xs font-black tracking-tight mt-0.5 font-mono">CODE: {qrFullScreen?.receiving}</p>
                        </div>
                      </div>

                      <div className="pt-2 flex flex-col gap-2 justify-center">
                        <div className="no-print space-y-2 mb-2 bg-slate-500/5 p-3 rounded-lg border border-slate-500/20">
                          <div className="flex items-center gap-2 mb-3 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                            <Checkbox 
                              id="duplicate-print-qr" 
                              checked={isDuplicatePrint}
                              onCheckedChange={(checked) => setIsDuplicatePrint(!!checked)}
                            />
                            <Label htmlFor="duplicate-print-qr" className="text-[10px] font-bold text-amber-600 cursor-pointer uppercase">Print with DUPLICATE watermark</Label>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-amber-600">Override Created Date</label>
                            <input
                              type="date"
                              value={qrFullScreen?.created_date || ''}
                              onChange={e => setQrFullScreen({ ...qrFullScreen!, created_date: e.target.value })}
                              className="w-full h-8 text-xs bg-white border border-amber-500/30 text-amber-600 font-bold rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-emerald-600">Override Print Date</label>
                            <input
                              type="date"
                              value={qrFullScreen?.print_date || ''}
                              onChange={e => setQrFullScreen({ ...qrFullScreen!, print_date: e.target.value })}
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

                {/* Minimal Thermal Printer Content - Hidden in standard print */}
                <div className="thermal-only hidden">
                  <div style={{ marginRight: '2mm' }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.origin}/public-track/${qrFullScreen?.diary}/${qrFullScreen?.receiving}`)}&color=000000&margin=0`}
                      alt="Thermal QR"
                      style={{ width: '11mm', height: '11mm' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                    <p style={{ fontSize: '10pt', fontWeight: '900', margin: '0', color: 'black', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      D: {qrFullScreen?.diary}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="bg-[#0f1115] border-white/10 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Please enter your password to confirm deletion of this file tracking record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/50">Your Password</label>
              <Input
                type="password"
                placeholder="Enter password..."
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="bg-[#111318] border-white/5 text-white placeholder:text-white/20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDeleteRecord();
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              className="bg-transparent border-white/10 text-white/70 hover:text-white hover:bg-white/5"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeletePassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white font-bold"
              onClick={handleDeleteRecord}
              disabled={!deletePassword}
            >
              Delete Record
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-[#0B101E] border-white/10 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl text-sky-400 font-bold flex items-center gap-2">
              <FileEdit className="w-5 h-5" /> Edit Authorization
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-sky-900/20 border border-sky-500/20 rounded-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
              </div>
              <div>
                <p className="font-bold text-sky-400">Waiting for Admin Approval</p>
                <p className="text-sm text-white/70">A request has been sent to the admin. Please wait for them to approve your edit request.</p>
              </div>
            </div>
            {isFileEditPasswordEnabled && (
              <>
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#0B101E] px-2 text-xs text-white/40 uppercase font-bold tracking-widest">or bypass</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/50">Enter Password to Bypass</label>
                  <Input
                    type="password"
                    placeholder="Enter admin password..."
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="bg-[#1A2333] border-white/10 text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditRecordAuth();
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="text-white border-white/20">
              Cancel
            </Button>
            <Button className="ml-2 bg-sky-600 hover:bg-sky-700 text-white" onClick={handleEditRecordAuth}>
              Authorize Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Specific File Scan Exit Confirmation Modal */}
      <Dialog open={!!exitModalFile} onOpenChange={(open) => {
        if (!open) {
          setExitModalFile(null);
          setExitModalScanInput("");
        }
      }}>
        <DialogContent className="bg-[#0f1115] border-white/10 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#14b8a6] flex items-center gap-2">
              <ScanLine className="w-5 h-5" /> Confirm Exit by Scanning
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Please scan the QR code for <strong className="text-white">{exitModalFile?.cfo_diary_number}</strong> to confirm you physically have the file and want to exit it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2 relative group">
              <label className="text-xs font-bold uppercase tracking-widest text-white/50">Scanner Input</label>
              <Input
                autoFocus
                value={exitModalScanInput}
                onChange={(e) => setExitModalScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (exitModalScanInput.trim() === exitModalFile?.cfo_diary_number || exitModalScanInput.trim() === exitModalFile?.receiving_number) {
                      handleExitFile(exitModalFile);
                      setExitModalFile(null);
                      setExitModalScanInput("");
                    } else {
                      toast.error("Scanned code does not match the selected file!");
                    }
                  }
                }}
                placeholder="Scan QR here..."
                className="bg-[#111318] border-white/5 text-white placeholder:text-white/20 pl-10 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6]"
              />
              <div className="absolute left-3 top-9 text-white/40 group-focus-within:text-[#14b8a6] transition-colors">
                <ScanLine className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              className="bg-transparent border-white/10 text-white/70 hover:text-white hover:bg-white/5"
              onClick={() => {
                setExitModalFile(null);
                setExitModalScanInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#14b8a6] hover:bg-[#0d9488] text-black font-bold"
              onClick={() => {
                if (exitModalScanInput.trim() === exitModalFile?.cfo_diary_number || exitModalScanInput.trim() === exitModalFile?.receiving_number) {
                  handleExitFile(exitModalFile);
                  setExitModalFile(null);
                  setExitModalScanInput("");
                } else {
                  toast.error("Scanned code does not match the selected file!");
                }
              }}
              disabled={!exitModalScanInput}
            >
              Confirm Exit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Date Modal */}
      <Dialog open={isBulkEditDateModalOpen} onOpenChange={setIsBulkEditDateModalOpen}>
        <DialogContent className="bg-[#0f1115] border-white/10 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#14b8a6] flex items-center gap-2">
              <CalendarDays className="w-5 h-5" /> Bulk Edit Dates
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Editing {selectedRecordIds.length} files. Enter new dates below. Leave blank to keep current.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/50">New Inward (Created) Date</label>
              <Input
                type="date"
                value={bulkEditDateForm.created_date}
                onChange={e => setBulkEditDateForm({ ...bulkEditDateForm, created_date: e.target.value })}
                className="bg-[#111318] border-white/5 text-white focus:border-[#14b8a6]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/50">New Print Date</label>
              <Input
                type="date"
                value={bulkEditDateForm.print_date}
                onChange={e => setBulkEditDateForm({ ...bulkEditDateForm, print_date: e.target.value })}
                className="bg-[#111318] border-white/5 text-white focus:border-[#14b8a6]"
              />
            </div>
            <div className="space-y-2 mt-4">
              <label className="text-xs font-bold text-red-400">Admin/CFO Password Required *</label>
              <Input
                type="password"
                placeholder="Enter authorization password"
                value={bulkEditDateForm.password}
                onChange={e => setBulkEditDateForm({ ...bulkEditDateForm, password: e.target.value })}
                className="bg-red-500/10 border-red-500/20 text-white placeholder:text-red-300/30"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="bg-transparent border-white/10 text-white hover:text-white hover:bg-white/5" onClick={() => setIsBulkEditDateModalOpen(false)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white font-bold" onClick={handleBulkEditDateSubmit} disabled={!bulkEditDateForm.password}>Apply Bulk Edit</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Print Full Screen Modal */}
      <Dialog open={!!bulkPrintFullScreen} onOpenChange={(open) => !open && setBulkPrintFullScreen(null)}>
        <DialogContent className="max-w-none w-screen h-screen m-0 p-0 rounded-none bg-white border-0 flex flex-col sm:max-w-none sm:rounded-none">
          <div className="flex justify-between items-center p-4 border-b border-gray-200 print:hidden bg-zinc-900 text-white">
            <h2 className="text-lg font-bold">Bulk Print Slips ({bulkPrintFullScreen?.length} Files)</h2>
            <div className="flex gap-2">
              <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Printer className="w-4 h-4" /> Print All
              </Button>
              <Button variant="outline" onClick={() => setBulkPrintFullScreen(null)} className="text-white border-white/20 hover:bg-white/10 hover:text-white">
                Close
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto bg-gray-100 p-8 print:p-0 print:bg-white">
            {bulkPrintFullScreen?.map((ticket, index) => (
              <div key={ticket.id} className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm print:shadow-none print:p-0 mb-8 print:mb-0 print:max-w-full" style={{ pageBreakAfter: index < bulkPrintFullScreen.length - 1 ? 'always' : 'auto' }}>
                <div className="border-[3px] border-zinc-800 p-1 bg-white relative overflow-hidden">
                  <div className="border-2 border-zinc-800 p-4 relative z-10 bg-white/90 backdrop-blur-sm">
                    {/* Bulk Header */}
                    <div className="flex justify-between items-start border-b-2 border-zinc-200 pb-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 className="w-5 h-5 text-zinc-800" />
                          <h2 className="text-lg font-black text-zinc-800 tracking-tighter">KW&SC</h2>
                        </div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">ONE WINDOW CELL</p>
                      </div>
                      <div className="text-right">
                        <div className="bg-zinc-800 text-white px-2 py-0.5 rounded-sm inline-block mb-1">
                          <p className="text-[10px] font-bold tracking-widest">DIARY NUMBER</p>
                        </div>
                        <p className="text-sm font-black text-zinc-800 font-mono mt-1 tracking-tighter">{ticket.cfo_diary_number}</p>
                        <p className="text-[10px] text-zinc-400 font-bold mt-1">REF: CODE</p>
                        <p className="text-sm font-black text-zinc-800 font-mono mt-1 tracking-tighter">{ticket.receiving_number}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-zinc-50 p-3 rounded-md border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Subject</p>
                        <p className="text-xs font-bold text-zinc-800 leading-tight">{ticket.subject || "Subject Details"}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Inward Date</p>
                          <p className="text-xs font-black text-amber-600 tracking-tight">{safeFormatDate(ticket.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Print Date</p>
                          <div className="flex items-center gap-1.5 text-xs font-black text-zinc-800">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            {safeFormatDate(ticket.print_date)}
                          </div>
                        </div>
                      </div>

                      <div className="border-t-2 border-dashed border-zinc-200 pt-4">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Routing Info</p>
                        <div className="flex items-center gap-3">
                          <div className="bg-zinc-100 p-2 rounded-md flex-1 text-center">
                            <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">From</p>
                            <p className="text-xs font-black text-zinc-800 uppercase tracking-tight">
                              {ticket.history?.filter((h: any) => (h.action === 'FORWARD' || h.action === 'FORWARDED') && h.from)?.slice(-1)[0]?.from ? 
                                (sections.find(s => s.id === ticket.history!.filter((h: any) => (h.action === 'FORWARD' || h.action === 'FORWARDED') && h.from).slice(-1)[0].from)?.name || ticket.history!.filter((h: any) => (h.action === 'FORWARD' || h.action === 'FORWARDED') && h.from).slice(-1)[0].from) 
                                : (ticket.received_from || "ONE WINDOW")}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                          <div className="bg-blue-50 p-2 rounded-md flex-1 text-center border border-blue-100">
                            <p className="text-[9px] font-bold text-blue-500 uppercase mb-1">Mark To</p>
                            <p className="text-xs font-black text-blue-600 uppercase tracking-tight">{ticket.mark_to ? (sections.find(s => s.id === ticket.mark_to)?.name || ticket.mark_to) : "CFO Office"}</p>
                          </div>
                        </div>
                        {ticket.additional_mark_to && (
                          <div className="mt-2 bg-purple-50 p-2 rounded-md text-center border border-purple-100">
                            <p className="text-[9px] font-bold text-purple-500 uppercase mb-1">Additional Mark To</p>
                            <p className="text-xs font-black text-purple-600 uppercase tracking-tight">{sections.find(s => s.id === ticket.additional_mark_to)?.name || ticket.additional_mark_to}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t-2 border-zinc-800 flex justify-between items-end">
                      <div className="text-center">
                        <div className="relative inline-flex items-center justify-center mx-auto border border-zinc-200 p-1 rounded-md bg-white">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/public-track/${ticket.cfo_diary_number}/${ticket.receiving_number}`)}&color=0ea5e9`}
                            alt="QR Code" 
                            className="w-16 h-16"
                          />
                          {/* Central KWSC Watermark Logo */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <img
                              src="/kwsc-watermark-logo.png"
                              alt="KWSC Watermark"
                              className="w-5 h-5 object-contain bg-white rounded-full p-0.5 shadow-sm border border-blue-900/40"
                            />
                          </div>
                        </div>
                        <p className="text-zinc-400 text-[10px] font-medium tracking-tight mt-1 font-mono">CODE: {ticket.receiving_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Official Use Only</p>
                        <div className="w-32 border-b-2 border-zinc-400 mb-1 mx-auto"></div>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Authorized Sig.</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute -right-16 -top-16 opacity-[0.03] pointer-events-none z-0 transform rotate-12">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.origin}/public-track/${ticket.cfo_diary_number}/${ticket.receiving_number}`)}&color=000000&margin=0`}
                      alt="Watermark QR" 
                      className="w-96 h-96 blur-[2px]"
                    />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                    <p className="text-[100px] font-black uppercase text-gray-500/40 -rotate-45 select-none" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                      D: {ticket.cfo_diary_number}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
        <DialogContent className="bg-[#0f1115] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-amber-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Duplicate File Detected
            </DialogTitle>
            <DialogDescription className="text-white/70 mt-2">
              A file with the same <strong>Subject</strong> and <strong>Date</strong> already exists in the system.
            </DialogDescription>
          </DialogHeader>
          
          {duplicateFound && (
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-sm space-y-2 mt-4">
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-white/50">CFO Diary No:</span>
                <span className="font-mono font-bold text-[#14b8a6]">{duplicateFound.cfo_diary_number}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-white/50">Subject:</span>
                <span className="font-bold">{duplicateFound.subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Date:</span>
                <span className="font-bold">{duplicateFound.inward_date}</span>
              </div>
            </div>
          )}
          
          <DialogFooter className="mt-6 flex gap-2 sm:justify-end">
            <Button variant="outline" className="bg-transparent border-white/10 text-white hover:bg-white/5" onClick={() => setIsDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={() => {
              setIsDuplicateDialogOpen(false);
              handleSaveForm(true);
            }}>
              Save Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DailyCategoryReportModal
        isOpen={isDailyCategoryReportOpen}
        onClose={() => setIsDailyCategoryReportOpen(false)}
        dynMainCats={dynMainCats}
        dynSubCats={dynSubCats}
      />
    </div>
  );
}


