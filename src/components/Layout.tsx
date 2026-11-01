import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Shield, 
  Lock, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  LogOut, 
  Menu, 
  X,
  Sun,
  Moon,
  ListTree,
  Stethoscope,
  Briefcase,
  FileText,
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  Users,
  Search,
  Landmark,
  Settings2,
  Activity,
  MessageCircle,
  BarChart3,
  Wallet,
  Megaphone
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/ThemeProvider";
import NotificationListener from "@/components/NotificationListener";
import SpyListener from "@/components/SpyListener";
import OfflineIndicator from "@/components/OfflineIndicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { motion, AnimatePresence } from "framer-motion";
import { useAutoLogout } from "@/hooks/useAutoLogout";

import { NotificationDropdown } from "@/components/NotificationDropdown";

const Layout = ({ children }: { children: React.ReactNode }) => {
  // useAutoLogout();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>("book-section");
  const location = useLocation();
  const { signOut, userRole, isAdmin, userName, isTransferUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const mainRef = useRef<HTMLDivElement>(null);

  const isCFORole = userRole === 'cfo' || userRole === 'admin' || userRole === 'sub_cfo' || userRole?.startsWith('sub_cfo_') || isAdmin;
  const isRestrictedAsstCFO = userRole?.startsWith('sub_cfo_') && userRole !== 'sub_cfo';
  const isEmpOperator = userRole === 'emp_operator';
  const isHRMSEmployee = userRole === 'hrms_employee';

  const [showSplash, setShowSplash] = useState(() => {
    if (!isCFORole) return false;
    return true;
  });

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  const isItemActive = (to: string) => {
    if (to === "/dashboard" || to === "/") {
      return location.pathname === "/" || location.pathname === "/dashboard";
    }
    return location.pathname === to;
  };

  const topNavItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", visible: !isRestrictedAsstCFO && !isEmpOperator && !isTransferUser && !isHRMSEmployee },
    { to: "/book-section/file-tracking", icon: Shield, label: "File Tracking", visible: !isEmpOperator && !isTransferUser && !isHRMSEmployee },
    { to: "/bank-entries", icon: Landmark, label: "Bank Entries", visible: !isEmpOperator && !isTransferUser && !isHRMSEmployee },
    { to: "/budget-control", icon: Wallet, label: "Budget Control", visible: (userRole === 'admin' || userRole === 'super_admin' || userRole === 'cfo') && !isTransferUser && !isHRMSEmployee },
    { to: "/notice-board", icon: Megaphone, label: "Notice Board", visible: !isTransferUser && !isHRMSEmployee },
    { to: "/messages", icon: MessageCircle, label: "Messages", visible: !isTransferUser && !isHRMSEmployee },
    { to: "/user-management", icon: Users, label: "User Management", visible: (userRole === 'admin' || userRole === 'super_admin') && !isTransferUser && !isHRMSEmployee },
    { to: "/admin-config", icon: Settings2, label: "Admin Config", visible: (userRole === 'admin' || userRole === 'super_admin') && !isTransferUser && !isHRMSEmployee },
    { to: "/activity-log", icon: Activity, label: "Activity Log", visible: !isTransferUser && !isHRMSEmployee },
    { to: "/file-analytics", icon: BarChart3, label: "File Analytics", visible: (userRole === 'admin' || userRole === 'super_admin' || userRole === 'cfo') && !isTransferUser && !isHRMSEmployee },
    { to: "/revenue-collection", icon: BarChart3, label: "Revenue Dashboard", visible: (userRole === 'admin' || userRole === 'super_admin' || userRole === 'cfo') && !isTransferUser && !isHRMSEmployee },
  ].filter(item => item.visible);

  const categories = [];

  if (!isRestrictedAsstCFO && !isEmpOperator && !isTransferUser && !isHRMSEmployee) {
    categories.push({
      id: "collection-operations",
      label: "Collection Operations",
      items: [
        { to: "/restricted", icon: Lock, label: "Restrict Dashboard", visible: true },
        { to: "/collection-entry", icon: Plus, label: "Collection Entry", visible: true },
      ].filter(item => item.visible)
    });
  }

  if ((userRole || isAdmin) && !isRestrictedAsstCFO && !isTransferUser && !isHRMSEmployee) {
    categories.push({
      id: "book-section",
      label: "Sections Management",
      items: [
        { to: "/book-section/emp-details", label: "Employee Details", icon: ListTree, visible: isCFORole || isEmpOperator },
        { to: "/book-section/all-employees", label: "Search All Employees", icon: Search, visible: isCFORole || isEmpOperator },
        { to: "/book-section/medical", label: "Medical Section", icon: Stethoscope, visible: isCFORole && !isEmpOperator },
        { to: "/book-section/contractor", label: "Contractor Section", icon: Briefcase, visible: isCFORole && !isEmpOperator },
        { to: "/book-section/vendor-creation", label: "Vendor Creation", icon: Users, visible: isCFORole && !isEmpOperator },
        { to: "/book-section/security-deposit", label: "Security Deposit", icon: Lock, visible: isCFORole && !isEmpOperator },
        { to: "/book-section/pol-bills", label: "POL Bills", icon: FileText, visible: isCFORole && !isEmpOperator },
        { to: "/book-section/contingencies", label: "Contingencies", icon: AlertCircle, visible: isCFORole && !isEmpOperator },
        { to: "/book-section/bill-dispatch", label: "Bill Dispatch", icon: ArrowLeftRight, visible: false },
        { to: "/book-section/books", label: "Books", icon: BookOpen, visible: (isCFORole || userRole === 'books') && !isEmpOperator },
        { to: "/book-section/establishment", label: "Establishment", icon: Users, visible: (isCFORole || userRole === 'establishment') && !isEmpOperator },
      ].filter(item => item.visible)
    });
  }

  if ((isAdmin || isTransferUser) && !isHRMSEmployee) {
    categories.push({
      id: "transfer-operations",
      label: "Transfer Operations",
      items: [
        { to: "/book-section/transfer-advice", icon: ArrowLeftRight, label: "Transfer Advice", visible: true },
        { to: "/book-section/transfer-advice-records", icon: ListTree, label: "Transfer Records", visible: true },
      ].filter(item => item.visible)
    });
  }

  if (isCFORole || isAdmin || isHRMSEmployee) {
    categories.push({
      id: "hrms-system",
      label: "HRMS System",
      items: [
        { to: "/hrms/dashboard", icon: LayoutDashboard, label: "HR Dashboard", visible: true },
        { to: "/hrms/employees", icon: Users, label: "Employees", visible: isCFORole || isAdmin },
        { to: "/hrms/attendance", icon: Activity, label: "Attendance", visible: true },
        { to: "/hrms/leaves", icon: Shield, label: "Leave Management", visible: true },
        { to: "/hrms/payroll", icon: Wallet, label: "Payroll", visible: true },
      ].filter(item => item.visible)
    });
  }

  const sections = [
    { id: 'emp_details', name: 'Employee Details' },
    { id: 'medical', name: 'Medical Section' },
    { id: 'contractor', name: 'Contractor Section' },
    { id: 'security_deposit', name: 'Security Deposit' },
    { id: 'pol_bills', name: 'POL Bills' },
    { id: 'contingencies', name: 'Contingencies' },
    { id: 'bill_dispatch', name: 'Bill Dispatch' },
    { id: 'books', name: 'Books' },
    { id: 'establishment', name: 'Establishment' },
  ];

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] text-slate-800 overflow-hidden relative font-sans antialiased">
      {/* Desktop Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: collapsed ? 80 : 280 }}
        className="hidden md:flex flex-col bg-[#1e3a8a] text-white border-r border-blue-900 shadow-md relative z-30 transition-all duration-300"
      >
        <div className="p-6 flex items-center justify-between border-b border-blue-800">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <img src="/kwsc-logo.png" alt="KWSC" className="w-10 h-10 object-contain drop-shadow" />
              <span className="font-black text-lg tracking-tight text-white">KW&SC FINANCE</span>
            </div>
          )}
          {collapsed && (
            <img src="/kwsc-logo.png" alt="KWSC" className="w-8 h-8 object-contain mx-auto" />
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg hover:bg-blue-800 text-blue-200 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(!collapsed)} className="mt-4 mx-auto p-2 rounded-lg hover:bg-blue-800 text-blue-200 hover:text-white transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        <ScrollArea className="flex-1 px-4 py-6 custom-scrollbar">
          <div className="space-y-6">

            <div className="space-y-1.5">
              {topNavItems.map((item) => {
                const active = isItemActive(item.to);
                return (
                  <motion.div key={item.to} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                    <Link to={item.to} className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative overflow-hidden font-bold text-sm",
                      active 
                        ? "sidebar-active-link bg-white text-[#1e3a8a] shadow-md" 
                        : "sidebar-inactive-link text-white hover:text-white hover:bg-white/15"
                    )}>
                      <item.icon className={cn("w-5 h-5 shrink-0 transition-colors", active ? "text-[#1e3a8a]" : "text-white")} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {categories.map((category) => (
              <div key={category.id} className="pt-4 border-t border-blue-800">
                {!collapsed && (
                  <button 
                    onClick={() => setOpenCategory(openCategory === category.id ? null : category.id)}
                    className="w-full flex items-center justify-between px-3 mb-2 text-xs font-black uppercase tracking-wider transition-colors"
                    style={{ color: '#ffffff' }}
                  >
                    <span style={{ color: '#ffffff' }}>{category.label}</span>
                    <motion.div
                      animate={{ rotate: openCategory === category.id ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-white" />
                    </motion.div>
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {(openCategory === category.id || collapsed) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="space-y-1.5 overflow-hidden mt-2"
                    >
                      {category.items.map((item) => {
                        const active = isItemActive(item.to);
                        return (
                          <motion.div key={item.to} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                            <Link to={item.to} className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-xl transition-all group relative overflow-hidden font-bold text-sm",
                              active 
                                ? "sidebar-active-link bg-white text-[#1e3a8a] shadow-md" 
                                : "sidebar-inactive-link text-white hover:text-white hover:bg-white/15"
                            )}>
                              <item.icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-[#1e3a8a]" : "text-white")} />
                              {!collapsed && <span>{item.label}</span>}
                            </Link>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-blue-800 space-y-2">
          <motion.div whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
            <Link to="/profile" className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white hover:bg-white/15 transition-all font-bold text-sm">
              <Settings2 className="w-5 h-5 shrink-0 text-white" />
              {!collapsed && <span>Profile Settings</span>}
            </Link>
          </motion.div>
          <motion.div whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
            <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-red-100 hover:bg-red-500/25 hover:text-white transition-all font-bold text-sm">
              <LogOut className="w-5 h-5 shrink-0 text-red-200" />
              {!collapsed && <span>Logout</span>}
            </button>
          </motion.div>
          <motion.div whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
            <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white hover:bg-white/15 transition-all font-bold text-sm">
              {theme === 'dark' ? <Sun className="w-5 h-5 shrink-0 text-amber-300" /> : <Moon className="w-5 h-5 shrink-0 text-white" />}
              {!collapsed && <span>{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</span>}
            </button>
          </motion.div>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="flex h-16 items-center justify-between px-4 md:px-8 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-slate-700 hover:text-[#1e3a8a] hover:bg-slate-100">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72 flex flex-col bg-[#1e3a8a] text-white border-r border-blue-900">
                  <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                  <div className="p-6 flex items-center gap-3 border-b border-blue-800">
                    <img src="/kwsc-logo.png" alt="KWSC" className="w-10 h-10 object-contain drop-shadow" />
                    <span className="font-black text-lg tracking-tight text-white">KW&SC FINANCE</span>
                  </div>
                  
                  <ScrollArea className="flex-1 px-4 py-6">
                    <div className="space-y-6">
                      <div className="space-y-1.5">
                        {topNavItems.map((item) => {
                          const active = isItemActive(item.to);
                          return (
                            <Link key={item.to} to={item.to} className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative font-bold text-sm",
                              active 
                                ? "sidebar-active-link bg-white text-[#1e3a8a] shadow-md" 
                                : "sidebar-inactive-link text-white hover:text-white hover:bg-white/15"
                            )}>
                              <item.icon className={cn("w-5 h-5 shrink-0", active ? "text-[#1e3a8a]" : "text-white")} />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>

                      {categories.map((category) => (
                        <div key={category.id} className="pt-4 border-t border-blue-800">
                          <button 
                            onClick={() => setOpenCategory(openCategory === category.id ? null : category.id)}
                            className="w-full flex items-center justify-between px-3 mb-2 text-xs font-black uppercase tracking-wider transition-colors"
                            style={{ color: '#ffffff' }}
                          >
                            <span style={{ color: '#ffffff' }}>{category.label}</span>
                            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200 text-white", openCategory === category.id && "rotate-90")} />
                          </button>
                          <div className={cn(
                            "space-y-1.5 overflow-hidden transition-all duration-300 ease-in-out",
                            openCategory === category.id ? "max-h-[500px] opacity-100 mt-2" : "max-h-0 opacity-0"
                          )}>
                            {category.items.map((item) => {
                              const active = isItemActive(item.to);
                              return (
                                <Link key={item.to} to={item.to} className={cn(
                                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-all group relative font-bold text-sm",
                                  active 
                                    ? "sidebar-active-link bg-white text-[#1e3a8a] shadow-md" 
                                    : "sidebar-inactive-link text-white hover:text-white hover:bg-white/15"
                                )}>
                                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#1e3a8a]" : "text-white")} />
                                  <span>{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t border-blue-800 space-y-2">
                    <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white hover:bg-white/15 transition-all font-bold text-sm">
                      {theme === 'dark' ? <Sun className="w-5 h-5 shrink-0 text-amber-300" /> : <Moon className="w-5 h-5 shrink-0 text-white" />}
                      <span>{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</span>
                    </button>
                    <Link to="/profile" className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white hover:bg-white/15 transition-all font-bold text-sm">
                      <Settings2 className="w-5 h-5 shrink-0 text-white" />
                      <span>Profile Settings</span>
                    </Link>
                    <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-red-100 hover:bg-red-500/25 hover:text-white transition-all font-bold text-sm">
                      <LogOut className="w-5 h-5 shrink-0 text-red-200" />
                      <span>Logout</span>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            
            <div className="flex flex-col">
              <h2 className="text-xs font-semibold text-slate-500">Welcome back,</h2>
              <p className="text-sm md:text-base font-black text-[#1e3a8a] uppercase tracking-wide">
                {userName || sections.find(s => s.id === userRole)?.name || userRole}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-blue-50 border border-blue-200 text-[#1e3a8a] text-[10px] md:text-xs font-bold uppercase tracking-wide shadow-xs">
              {userRole === 'admin' ? 'System Administrator' : 'Active Department'}
            </div>
            <NotificationDropdown />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#f8fafc] dark:bg-[#0f172a] text-slate-800 dark:text-slate-200 relative custom-scrollbar">
          <OfflineIndicator />
          <NotificationListener />
          <SpyListener />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full min-h-full p-4 md:p-8 pb-28 md:pb-8"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-50 safe-area-pb">
        <nav className="flex justify-around items-center bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 rounded-3xl shadow-xl overflow-hidden">
          {!isEmpOperator ? (
            <>
              <Link to="/" className="flex-1 relative">
                <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center justify-center gap-1 py-3">
                  {location.pathname === "/" && (
                    <motion.div layoutId="mobile-main-active" className="absolute inset-0 bg-blue-50 rounded-3xl -z-10" transition={{ type: "spring", bounce: 0, duration: 0.2 }} />
                  )}
                  <LayoutDashboard className={cn("w-5 h-5 transition-all duration-200", location.pathname === "/" ? "text-[#1e3a8a] scale-110 font-bold" : "text-slate-400")} strokeWidth={location.pathname === "/" ? 2.5 : 2} />
                  <span className={cn("text-[10px] font-bold transition-all duration-200", location.pathname === "/" ? "text-[#1e3a8a]" : "text-slate-400")}>Home</span>
                </motion.div>
              </Link>

              <Link to="/book-section/file-tracking" className="flex-1 relative">
                <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center justify-center gap-1 py-3">
                  {location.pathname === "/book-section/file-tracking" && (
                    <motion.div layoutId="mobile-main-active" className="absolute inset-0 bg-blue-50 rounded-3xl -z-10" transition={{ type: "spring", bounce: 0, duration: 0.2 }} />
                  )}
                  <Shield className={cn("w-5 h-5 transition-all duration-200", location.pathname === "/book-section/file-tracking" ? "text-[#1e3a8a] scale-110 font-bold" : "text-slate-400")} strokeWidth={location.pathname === "/book-section/file-tracking" ? 2.5 : 2} />
                  <span className={cn("text-[10px] font-bold transition-all duration-200", location.pathname === "/book-section/file-tracking" ? "text-[#1e3a8a]" : "text-slate-400")}>Tracking</span>
                </motion.div>
              </Link>
              
              <Link to="/restricted" className="flex-1 relative">
                <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center justify-center gap-1 py-3">
                  {location.pathname === "/restricted" && (
                    <motion.div layoutId="mobile-main-active" className="absolute inset-0 bg-blue-50 rounded-3xl -z-10" transition={{ type: "spring", bounce: 0, duration: 0.2 }} />
                  )}
                  <Lock className={cn("w-5 h-5 transition-all duration-200", location.pathname === "/restricted" ? "text-[#1e3a8a] scale-110 font-bold" : "text-slate-400")} strokeWidth={location.pathname === "/restricted" ? 2.5 : 2} />
                  <span className={cn("text-[10px] font-bold transition-all duration-200", location.pathname === "/restricted" ? "text-[#1e3a8a]" : "text-slate-400")}>Admin</span>
                </motion.div>
              </Link>
            </>
          ) : (
            <>
              <Link to="/book-section/emp-details" className="flex-1 relative">
                <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center justify-center gap-1 py-3">
                  {location.pathname === "/book-section/emp-details" && (
                    <motion.div layoutId="mobile-main-active" className="absolute inset-0 bg-blue-50 rounded-3xl -z-10" transition={{ type: "spring", bounce: 0, duration: 0.2 }} />
                  )}
                  <ListTree className={cn("w-5 h-5 transition-all duration-200", location.pathname === "/book-section/emp-details" ? "text-[#1e3a8a] scale-110 font-bold" : "text-slate-400")} strokeWidth={location.pathname === "/book-section/emp-details" ? 2.5 : 2} />
                  <span className={cn("text-[10px] font-bold transition-all duration-200", location.pathname === "/book-section/emp-details" ? "text-[#1e3a8a]" : "text-slate-400")}>Details</span>
                </motion.div>
              </Link>

              <Link to="/book-section/all-employees" className="flex-1 relative">
                <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center justify-center gap-1 py-3">
                  {location.pathname === "/book-section/all-employees" && (
                    <motion.div layoutId="mobile-main-active" className="absolute inset-0 bg-blue-50 rounded-3xl -z-10" transition={{ type: "spring", bounce: 0, duration: 0.2 }} />
                  )}
                  <Search className={cn("w-5 h-5 transition-all duration-200", location.pathname === "/book-section/all-employees" ? "text-[#1e3a8a] scale-110 font-bold" : "text-slate-400")} strokeWidth={location.pathname === "/book-section/all-employees" ? 2.5 : 2} />
                  <span className={cn("text-[10px] font-bold transition-all duration-200", location.pathname === "/book-section/all-employees" ? "text-[#1e3a8a]" : "text-slate-400")}>Search</span>
                </motion.div>
              </Link>
            </>
          )}
          <button onClick={() => signOut()} className="flex-1 flex flex-col items-center justify-center gap-1 text-rose-600 hover:text-rose-700">
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-bold text-slate-500">Exit</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

export default Layout;
