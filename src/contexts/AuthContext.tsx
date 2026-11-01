import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import { logActivity } from '@/hooks/useActivityLog';
import { getUserIP, checkOffHoursAccess } from '@/hooks/useSecurityMonitor';

export interface DepartmentUser {
  id?: string;
  email: string;
  password?: string;
  roleId: string;
  displayName: string;
  avatarUrl?: string;
  allowOverrideDates?: boolean;
  is_blocked?: boolean;
  enforce_attendance?: boolean;
}

export const DEFAULT_DEPARTMENT_USERS: DepartmentUser[] = [
  { email: 'superadmin@kwsb.gov.pk',       password: 'super@12345',  roleId: 'super_admin',       displayName: 'SUPER ADMIN' },
  { email: 'hr.admin@kwsb.gov.pk',         password: 'hradmin',      roleId: 'hr_admin',          displayName: 'HR ADMIN' },
  { email: 'admin@kwsb.gov.pk',            password: 'admin',        roleId: 'admin',             displayName: 'SYSTEM ADMINISTRATOR' },
  { email: 'cfo@kwsb.gov.pk',              password: 'cfo@12345',    roleId: 'cfo',              displayName: 'CFO' },
  { email: 'cia@kwsb.gov.pk',              password: 'cia@12345',    roleId: 'cia',              displayName: 'CIA' },
  { email: 'budget@kwsb.gov.pk',           password: 'budget@12345', roleId: 'budget',            displayName: 'BUDGET' },
  { email: 'pension@kwsb.gov.pk',          password: 'pension@12345',roleId: 'pension',           displayName: 'PENSION' },
  { email: 'fund@kwsb.gov.pk',             password: 'fund@12345',   roleId: 'fund',              displayName: 'FUND' },
  { email: 'audit1@kwsb.gov.pk',           password: 'audit1@12345', roleId: 'internal_audit_1',  displayName: 'INTERNAL AUDIT-1' },
  { email: 'director.account@kwsb.gov.pk', password: 'da@12345',     roleId: 'director_account',  displayName: 'DIRECTOR ACCOUNT' },
  { email: 'director.finance@kwsb.gov.pk', password: 'df@12345',     roleId: 'director_finance',  displayName: 'DIRECTOR FINANCE' },
  { email: 'director.it@kwsb.gov.pk',      password: 'dit@12345',    roleId: 'director_it',       displayName: 'DIRECTOR IT' },
  { email: 'subcfo@kwsb.gov.pk',           password: 'sub@12345',     roleId: 'sub_cfo',           displayName: 'ASST. CFO' },
  { email: 'books@kwsb.gov.pk',            password: 'books@12345',   roleId: 'books',             displayName: 'BOOKS' },
  { email: 'establishment@kwsb.gov.pk',    password: 'est@12345',     roleId: 'establishment',     displayName: 'ESTABLISHMENT' },
  { email: 'director.audit@kwsb.gov.pk',   password: 'daudit@12345',  roleId: 'director_audit',    displayName: 'DIRECTOR AUDIT' },
  { email: 'audit2@kwsb.gov.pk',           password: 'audit2@12345',  roleId: 'internal_audit_2',  displayName: 'INTERNAL AUDIT-2' },
  { email: 'law@kwsb.gov.pk',              password: 'law@12345',     roleId: 'law_department',    displayName: 'LAW DEPARTMENT' },
  { email: 'chro@kwsb.gov.pk',             password: 'chro@12345',    roleId: 'chro',              displayName: 'CHRO' },
  { email: 'asst.cfo1@kwsb.gov.pk',        password: 'acfo1@12345',  roleId: 'sub_cfo_1',         displayName: 'ASST. CFO-1' },
  { email: 'asst.cfo2@kwsb.gov.pk',        password: 'acfo2@12345',  roleId: 'sub_cfo_2',         displayName: 'ASST. CFO-2' },
  { email: 'asst.cfo3@kwsb.gov.pk',        password: 'acfo3@12345',  roleId: 'sub_cfo_3',         displayName: 'ASST. CFO-3' },
  { email: 'asst.cfo4@kwsb.gov.pk',        password: 'acfo4@12345',  roleId: 'sub_cfo_4',         displayName: 'ASST. CFO-4' },
  { email: 'asst.cfo5@kwsb.gov.pk',        password: 'acfo5@12345',  roleId: 'sub_cfo_5',         displayName: 'ASST. CFO-5' },
  { email: 'mdoffice@kwsb.gov.pk',         password: 'md@12345',      roleId: 'md_office',         displayName: 'MD OFFICE' },
  { email: 'emp1@kwsb.gov.pk',             password: 'emp1@12345',    roleId: 'emp_operator',      displayName: 'EMPLOYEE REGISTRY 1' },
  { email: 'transfer@kwsb.gov.pk',         password: 'transfer@12345',roleId: 'transfer_user',   displayName: 'TRANSFER ADVICE' },
  { email: 'emp2@kwsb.gov.pk',             password: 'emp2@12345',    roleId: 'emp_operator',      displayName: 'EMPLOYEE REGISTRY 2' },
  { email: 'viewer@kwsb.gov.pk',           password: 'viewer@12345',  roleId: 'file_viewer',       displayName: 'FILE VIEWER' },
  { email: 'entry@kwsb.gov.pk',            password: 'entry@12345',  roleId: 'entry_operator',    displayName: 'ENTRY OPERATOR' },];

export const CUSTOM_USERS_KEY = 'kwsb_custom_users';

export const getDepartmentUsers = (): DepartmentUser[] => {
  const customStr = localStorage.getItem(CUSTOM_USERS_KEY);
  if (customStr) {
    try {
      const customUsers = JSON.parse(customStr);
      const merged = [...customUsers];
      DEFAULT_DEPARTMENT_USERS.forEach(defaultUser => {
        if (!merged.find((u: DepartmentUser) => u.email === defaultUser.email)) {
          merged.push(defaultUser);
        }
      });
      return merged;
    } catch {
      return DEFAULT_DEPARTMENT_USERS;
    }
  }
  return DEFAULT_DEPARTMENT_USERS;
};

export const saveDepartmentUsers = (users: DepartmentUser[]) => {
  localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(users));
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  userRole: string | null;
  userName: string | null;
  userAvatar: string | null;
  localSignIn: (email: string, password: string) => Promise<{ success: boolean; error?: string; method?: string }>;
  verifyPassword: (password: string) => boolean;
  allowOverrideDates: boolean;
  updateUserProfile: (newName: string, newPassword?: string, newAvatar?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [allowOverrideDates, setAllowOverrideDates] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const { data } = await supabase.storage.from('bucket_assets').download('system/maintenance.json');
        let overrideDate = null;
        let force = false;
        if (data) {
          const text = await data.text();
          const json = JSON.parse(text);
          overrideDate = json.override_date;
          force = json.force_maintenance;
        }

        const now = new Date();
        const currentHour = now.getHours();
        const todayStr = now.toISOString().split('T')[0];
        
        const isAuto = currentHour >= 17;
        
        if (force) {
          setIsMaintenance(true);
        } else if (isAuto && overrideDate !== todayStr) {
          setIsMaintenance(true);
        } else {
          setIsMaintenance(false);
        }
      } catch (e) {
        console.error("Maintenance check error:", e);
      }
    };

    checkMaintenance();
    const int = setInterval(checkMaintenance, 60000);
    return () => clearInterval(int);
  }, []);

  const toggleMaintenance = async (action: 'force' | 'override' | 'clear') => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const payload = { 
         force_maintenance: action === 'force', 
         override_date: action === 'override' ? todayStr : null 
      };
      await supabase.storage.from('bucket_assets').upload('system/maintenance.json', JSON.stringify(payload), { upsert: true });
      if (action === 'force') setIsMaintenance(true);
      else if (action === 'override') setIsMaintenance(false);
      else setIsMaintenance(now.getHours() >= 17);
  };

  const loadUserProfile = async (currentUser: User) => {
    try {
      const { data: settings } = await supabase
        .from('department_users_settings')
        .select('*')
        .eq('email', currentUser.email?.toLowerCase())
        .maybeSingle();

      const role = settings?.role_id || currentUser.user_metadata?.role_id;
      const displayName = settings?.display_name || currentUser.user_metadata?.display_name || currentUser.email;

      setUserRole(role);
      setUserName(displayName);
      setUserAvatar(settings?.avatar_url || null);
      setIsAdmin(role === 'super_admin' || role === 'cfo' || role === 'admin');
      setAllowOverrideDates(settings?.allow_override_dates || role === 'super_admin' || role === 'cfo' || role === 'admin');

    } catch (err) {
      console.error('Error loading user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedLocal = localStorage.getItem('kwsb_local_auth');
    if (savedLocal) {
      try {
        const parsed = JSON.parse(savedLocal);
        const role = parsed.roleId;
        setUserRole(role);
        setUserName(parsed.displayName);
        setSession({} as Session);
        setUser({ email: parsed.email } as User);
        setIsAdmin(role === 'super_admin' || role === 'cfo' || role === 'admin');
        setAllowOverrideDates(role === 'super_admin' || role === 'cfo' || role === 'admin');
        setLoading(false);
        return;
      } catch {
        localStorage.removeItem('kwsb_local_auth');
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        loadUserProfile(newSession.user);
      } else {
        setUserRole(null);
        setUserName(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userName) return;
    const channel = supabase.channel('public:admin_commands')
      .on('broadcast', { event: 'force_logout' }, (payload) => {
        if (payload.payload?.targetName === userName) {
           signOut();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userName]);

  const localSignIn = async (email: string, password: string): Promise<{ success: boolean; error?: string; method?: string }> => {
    const trimEmail = email.trim().toLowerCase();
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimEmail,
        password: password
      });

      if (error) {
        try {
          const { data: hrmsData, error: hrmsError } = await supabase
            .from('hrms_employees')
            .select('id, email, password, name')
            .eq('email', trimEmail)
            .maybeSingle();

          if (hrmsData && !hrmsError && hrmsData.password === password) {
            localStorage.setItem('kwsb_hrms_emp_id', hrmsData.id);
            localStorage.setItem('kwsb_local_auth', JSON.stringify({
              roleId: 'hrms_employee',
              displayName: hrmsData.name,
              email: hrmsData.email,
            }));
            setUserRole('hrms_employee');
            setUserName(hrmsData.name);
            setSession({} as Session);
            setUser({ email: hrmsData.email } as User);
            setIsAdmin(false);
            setAllowOverrideDates(false);
            
            getUserIP().then(ip => {
              logActivity({
                userRole: 'hrms_employee',
                userName: hrmsData.name,
                action: 'LOGIN',
                details: { email: trimEmail, method: 'hrms_fallback', ip },
              });
              checkOffHoursAccess('hrms_employee', hrmsData.name, ip);
            });
            return { success: true, method: 'hrms' };
          }
        } catch (e) {
          console.error("HRMS fallback failed", e);
        }
        
        // Final fallback: check hardcoded department users
        const allUsers = getDepartmentUsers();
        const localUser = allUsers.find(u => u.email === trimEmail && u.password === password);
        if (localUser) {
          localStorage.setItem('kwsb_local_auth', JSON.stringify({
            roleId: localUser.roleId,
            displayName: localUser.displayName,
            email: localUser.email,
          }));
          const role = localUser.roleId;
          setUserRole(role);
          setUserName(localUser.displayName);
          setSession({} as Session);
          setUser({ email: localUser.email } as User);
          setIsAdmin(role === 'super_admin' || role === 'cfo' || role === 'admin');
          setAllowOverrideDates(role === 'super_admin' || role === 'cfo' || role === 'admin');
          
          getUserIP().then(ip => {
            logActivity({
              userRole: localUser.roleId,
              userName: localUser.displayName,
              action: 'LOGIN',
              details: { email: trimEmail, method: 'hardcoded_fallback', ip },
            });
            checkOffHoursAccess(localUser.roleId, localUser.displayName, ip);
          });
          return { success: true, method: 'hardcoded' };
        }

        return { success: false, error: error.message };
      }

      if (data.user) {
        const { data: settings } = await supabase
          .from('department_users_settings')
          .select('is_blocked')
          .eq('email', trimEmail)
          .maybeSingle();

        if (settings?.is_blocked) {
          await supabase.auth.signOut();
          return { success: false, error: 'Your account has been blocked. Please contact Admin.' };
        }
      }

      getUserIP().then(ip => {
        const role = data.user?.user_metadata?.role_id || 'unknown';
        const name = data.user?.user_metadata?.display_name || trimEmail;
        logActivity({
          userRole: role,
          userName: name,
          action: 'LOGIN',
          details: { email: trimEmail, method: 'supabase', ip },
        });
        checkOffHoursAccess(role, name, ip);
      });

      return { success: true, method: 'supabase' };
    } catch (err: any) {
      return { success: false, error: err.message || 'An unexpected error occurred during login.' };
    }
  };

  const updateUserProfile = async (newName: string, newPassword?: string, newAvatar?: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated.' };

    try {
      const updatePayload: any = { display_name: newName };
      if (newPassword) updatePayload.password = newPassword;
      if (newAvatar !== undefined) updatePayload.avatar_url = newAvatar;

      await supabase.from('department_users_settings')
        .update(updatePayload)
        .eq('email', user.email);

      const authUpdates: any = { data: { display_name: newName } };
      if (newPassword) authUpdates.password = newPassword;

      await supabase.auth.updateUser(authUpdates);

      setUserName(newName);
      if (newAvatar !== undefined) setUserAvatar(newAvatar);

      await logActivity({
        userRole: userRole || 'unknown',
        userName: newName,
        action: 'UPDATE',
        subject: 'Profile Updated',
        details: { method: 'supabase', email: user.email, passwordChanged: !!newPassword },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update profile.' };
    }
  };

  const signOut = async () => {
    if (userRole && userName) {
      await logActivity({
        userRole: userRole,
        userName: userName,
        action: 'LOGOUT',
        details: { method: 'supabase' },
      });
    }
    await supabase.auth.signOut();
    localStorage.removeItem('kwsb_local_auth');
    setUserRole(null);
    setUserName(null);
    setIsAdmin(false);
    setSession(null);
    setUser(null);
  };

  const verifyPassword = (password: string): boolean => {
    return password.trim() === 'gmqaBhK6@90';
  };

  return (
    <AuthContext.Provider value={{ 
      session, 
      user, 
      loading, 
      signOut, 
      isAdmin,
      userRole,
      userName,
      userAvatar,
      localSignIn,
      verifyPassword,
      allowOverrideDates,
      updateUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
