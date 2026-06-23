// src/components/UserSettings.tsx

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ShieldCheck,
  Users,
  Circle,
  Zap,
  X,
  Save,
  Sliders,
  Award,
  ShieldAlert,
  Database,
  RefreshCw,
  Download,
  Upload,
  Info,
  Moon,
  Sun,
  Monitor,
  Eye,
  Copy
} from "lucide-react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, addDoc, serverTimestamp, updateDoc, getDoc, getDocs } from "firebase/firestore";
import { db, firebaseConfig } from "../lib/firebase";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../auth/ToastContext";
import { useSettings } from "../hooks/useSettings";
import { rbacService } from "../services/rbacService";
import { cn } from "../lib/utils";

interface User {
  id: string;
  name: string;
  email: string;
  branch: string;
  role: string;
  status: "Online" | "Offline";
  lastLogin?: any;
}

const roleColors: Record<string, string> = {
  SuperAdmin: "bg-rose-105 text-rose-700 font-bold border-rose-200",
  superadmin: "bg-rose-105 text-rose-700 font-bold border-rose-200",
  Admin: "bg-red-105 text-red-700 font-bold border-red-200",
  admin: "bg-red-105 text-red-700 font-bold border-red-200",
  Manager: "bg-blue-105 text-blue-700 border-blue-200",
  manager: "bg-blue-105 text-blue-700 border-blue-200",
  Editor: "bg-indigo-105 text-indigo-700 border-indigo-200",
  editor: "bg-indigo-105 text-indigo-700 border-indigo-200",
  Viewer: "bg-purple-105 text-purple-700 border-purple-200",
  viewer: "bg-purple-105 text-purple-700 border-purple-200",
  User: "bg-slate-105 text-slate-700 border-slate-200",
  user: "bg-slate-105 text-slate-700 border-slate-200",
  Sales: "bg-green-105 text-green-700 border-green-200",
  sales: "bg-green-105 text-green-700 border-green-200",
  Technician: "bg-orange-105 text-orange-700 border-orange-200",
  technician: "bg-orange-105 text-orange-700 border-orange-200",
  Accountant: "bg-pink-105 text-pink-700 border-pink-200",
  accountant: "bg-pink-105 text-pink-700 border-pink-200",
};

const UserSettings: React.FC = () => {
  const { user: authUser } = useAuth();
  const { addToast } = useToast();
  
  // Custom workspace settings hook
  const { settings, updateUIPreferences, updatePrintDefaults, updateBusinessInfo } = useSettings();

  const [activeSubTab, setActiveSubTab] = useState<"preferences" | "branding" | "access" | "users" | "database">("preferences");
  
  // Firestore settings states
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [allowOverselling, setAllowOverselling] = useState(false);
  
  // Interactive RBAC state
  const [rbacRoles, setRbacRoles] = useState<any[]>([]);
  const [rbacPermissions, setRbacPermissions] = useState<any[]>([]);
  const [modifiedPermissions, setModifiedPermissions] = useState<Record<string, string[]>>({});
  const [isSavingMatrix, setIsSavingMatrix] = useState(false);
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [isCloneRoleModalOpen, setIsCloneRoleModalOpen] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [cloneSourceRoleId, setCloneSourceRoleId] = useState("");

  // Access Control sub-tab state (lifted from renderAccessControl to comply with Rules of Hooks)
  const [activeAccessSub, setActiveAccessSub] = useState<"roles" | "matrix" | "audit">("roles");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  
  const [enterpriseAuditing, setEnterpriseAuditing] = useState(() => {
    return localStorage.getItem('repair_flow_enterprise_auditing') === 'true';
  });
  
  // Modals and form state
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    branch: "Main Branch",
    role: "Sales",
  });

  // Database panel state (lifted from renderDatabase to comply with Rules of Hooks)
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"Online" | "Offline" | "Error">("Online");
  const [latency, setLatency] = useState<number | null>(null);

  // Determine if the current logged-in user is an Admin / SuperAdmin
  const isAdmin = useMemo(() => {
    if (authUser?.email?.toLowerCase() === "pichethneou@gmail.com") return true;
    const dbUser = users.find((u) => u.email === authUser?.email);
    if (!dbUser) return false;
    const r = dbUser.role?.toLowerCase();
    return r === "admin" || r === "superadmin";
  }, [users, authUser]);

  // Load RBAC configuration from rbacService
  const loadRBAC = async () => {
    try {
      await rbacService.syncFromDatabase();
      setRbacRoles(rbacService.get_roles());
      setRbacPermissions(rbacService.get_permissions());
    } catch (err) {
      console.error("Failed to load RBAC configurations:", err);
    }
  };

  // Sync users list and overselling settings
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    const unsubSettings = onSnapshot(doc(db, "settings", "inventory"), (snap) => {
      if (snap.exists()) {
        setAllowOverselling(snap.data().allowOverselling);
      }
    });

    loadRBAC();

    return () => {
      unsubUsers();
      unsubSettings();
    };
  }, []);

  // Dynamic selector roles list based on current active RBAC roles
  const selectableRoles = useMemo(() => {
    const rolesList = rbacRoles.map(r => r.name);
    const defaultList = ["SuperAdmin", "Admin", "Manager", "Editor", "Viewer", "User", "Sales", "Technician", "Accountant"];
    return Array.from(new Set([...rolesList, ...defaultList]));
  }, [rbacRoles]);

  // Update root element dark-mode class based on settings preference
  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = settings.ui.darkMode === 'dark' || (settings.ui.darkMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.ui.darkMode]);

  const toggleOverselling = async () => {
    const newState = !allowOverselling;
    await setDoc(doc(db, "settings", "inventory"), {
      allowOverselling: newState
    }, { merge: true });
    addToast(`Overselling is now ${newState ? 'enabled' : 'disabled'}.`, newState ? 'warning' : 'success');
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase()) ||
      user.role?.toLowerCase().includes(search.toLowerCase())
  );

  // User Actions (Create, Update, Delete)
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email || !userForm.password) {
      addToast("Name, Email, and Password are required.", "error");
      return;
    }

    if (userForm.password.length < 6) {
      addToast("Password must be at least 6 characters.", "error");
      return;
    }

    setIsSavingUser(true);
    let tempApp;
    try {
      // 1. Create Auth user using secondary app instance so admin remains logged in
      const tempAppName = `TempApp_${Date.now()}`;
      tempApp = initializeApp(firebaseConfig, tempAppName);
      const tempAuth = getAuth(tempApp);

      const userCredential = await createUserWithEmailAndPassword(
        tempAuth,
        userForm.email,
        userForm.password
      );
      const uid = userCredential.user.uid;

      // Update auth profile display name
      await updateProfile(userCredential.user, { displayName: userForm.name });

      // 2. Save profile in Firestore with correct matching ID
      const { name, email, branch, role } = userForm;
      await setDoc(doc(db, "users", uid), {
        name,
        email,
        branch,
        role,
        status: "Offline",
        createdAt: serverTimestamp()
      });

      setIsAddingUser(false);
      setUserForm({ name: "", email: "", password: "", branch: "Main Branch", role: "Sales" });
      addToast(`${userForm.name} created successfully!`, "success");
    } catch (error: any) {
      console.error("Error adding user:", error);
      addToast(error.message || "Failed to add user.", "error");
    } finally {
      if (tempApp) {
        try {
          await tempApp.delete();
        } catch (delErr) {
          console.error("Failed to delete temp app:", delErr);
        }
      }
      setIsSavingUser(false);
    }
  };

  const startEdit = (user: User) => {
    setUserForm({
      name: user.name,
      email: user.email,
      password: "",
      branch: user.branch,
      role: user.role,
    });
    setEditingUserId(user.id);
    setIsEditingUser(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    setIsSavingUser(true);
    try {
      const { name, email, branch, role } = userForm;
      await updateDoc(doc(db, "users", editingUserId), {
        name,
        email,
        branch,
        role,
        updatedAt: serverTimestamp()
      });
      setIsEditingUser(false);
      setEditingUserId(null);
      setUserForm({ name: "", email: "", password: "", branch: "Main Branch", role: "Sales" });
      addToast("User profile updated.", "success");
    } catch (error) {
      console.error("Error updating user:", error);
      addToast("Failed to update user.", "error");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (confirmed) {
      try {
        await deleteDoc(doc(db, "users", id));
        addToast("User deleted permanently.", "success");
      } catch (error) {
        console.error("Error deleting user:", error);
        addToast("Failed to delete user.", "error");
      }
    }
  };

  // --- SUB TAB RENDERING METHODS ---

  const renderPreferences = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-800 dark:text-white">Workspace Preferences</h2>
        <p className="text-xs text-slate-450 dark:text-slate-500 mt-1">Configure your personal interface options and printing presets</p>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-700" />

      {/* Theme Selection */}
      <div className="space-y-3">
        <label className="text-[10px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest pl-1">Theme Selection</label>
        <div className="grid grid-cols-3 gap-4">
          {[
            { id: 'light', label: 'Light Mode', icon: Sun },
            { id: 'dark', label: 'Dark Mode', icon: Moon },
            { id: 'system', label: 'System Theme', icon: Monitor },
          ].map((theme) => {
            const ThemeIcon = theme.icon;
            const isSelected = settings.ui.darkMode === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => updateUIPreferences({ darkMode: theme.id as any })}
                className={cn(
                  "p-4 rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.98]",
                  isSelected
                    ? "bg-blue-50/50 border-blue-500 text-blue-600 shadow-sm dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-900/50 dark:border-slate-800 text-slate-650 dark:text-slate-400"
                )}
              >
                <ThemeIcon size={24} />
                <span className="font-bold text-xs">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Display Density */}
      <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 dark:bg-slate-900/30 dark:border-slate-800 rounded-2xl">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-750 dark:text-slate-350">Compact Display Mode</p>
          <p className="text-xs text-slate-455 dark:text-slate-500">Reduce spacing, sizes, and padding across workspaces</p>
        </div>
        <button
          onClick={() => updateUIPreferences({ compactMode: !settings.ui.compactMode })}
          className={cn(
            "w-12 h-6 rounded-full transition-colors relative",
            settings.ui.compactMode ? "bg-blue-600" : "bg-slate-350 dark:bg-slate-700"
          )}
        >
          <div className={cn(
            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
            settings.ui.compactMode ? "left-7" : "left-1"
          )} />
        </button>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-700" />

      {/* Printing Defaults */}
      <div className="space-y-4">
        <h3 className="font-bold text-sm text-slate-800 dark:text-white pl-1">Label Printing Defaults</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Default Labels Quantity</label>
            <input
              type="number"
              min={1}
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
              value={settings.print.defaultQuantity}
              onChange={(e) => updatePrintDefaults({ defaultQuantity: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Print Layout Orientation</label>
            <select
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
              value={settings.print.orientation}
              onChange={(e) => updatePrintDefaults({ orientation: e.target.value as any })}
            >
              <option value="landscape">Landscape (Horizontal)</option>
              <option value="portrait">Portrait (Vertical)</option>
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Default Label Dimensions</label>
            <select
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
              value={settings.print.labelSize}
              onChange={(e) => updatePrintDefaults({ labelSize: e.target.value as any })}
            >
              <option value="40x25">40x25 mm (Standard Barcode)</option>
              <option value="50x30">50x30 mm</option>
              <option value="60x35">60x35 mm</option>
              <option value="70x40">70x40 mm</option>
              <option value="80x50">80x50 mm (Retail Badge)</option>
              <option value="100x70">100x70 mm</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 dark:bg-slate-900/30 dark:border-slate-800 rounded-2xl">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-750 dark:text-slate-300">Show Price on Labels</p>
          <p className="text-xs text-slate-450 dark:text-slate-500">Include retail unit prices on generated barcode outputs</p>
        </div>
        <button
          onClick={() => updatePrintDefaults({ showPrice: !settings.print.showPrice })}
          className={cn(
            "w-12 h-6 rounded-full transition-colors relative",
            settings.print.showPrice ? "bg-blue-600" : "bg-slate-350 dark:bg-slate-700"
          )}
        >
          <div className={cn(
            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
            settings.print.showPrice ? "left-7" : "left-1"
          )} />
        </button>
      </div>
    </div>
  );

  const renderBranding = () => {
    const info = settings.branding;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-white">Business Branding</h2>
          <p className="text-xs text-slate-455 dark:text-slate-500 mt-1">Configure company metadata assets and receipt invoice layouts</p>
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-700" />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Metadata Forms */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest pl-1">Business Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-bold"
                value={info.name}
                onChange={(e) => updateBusinessInfo({ ...info, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest pl-1">Business Tagline</label>
              <input
                type="text"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                value={info.tagline}
                onChange={(e) => updateBusinessInfo({ ...info, tagline: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest pl-1">Customer Phone Contact</label>
              <input
                type="text"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                value={info.phone || ''}
                onChange={(e) => updateBusinessInfo({ ...info, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest pl-1">Physical Address</label>
              <textarea
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                value={info.address || ''}
                onChange={(e) => updateBusinessInfo({ ...info, address: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest pl-1">Logo URL</label>
              <input
                type="text"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-mono"
                placeholder="https://domain.com/logo.png"
                value={info.logoUrl || ''}
                onChange={(e) => updateBusinessInfo({ ...info, logoUrl: e.target.value })}
              />
            </div>
          </div>

          {/* Live Preview Panel */}
          <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 rounded-3xl p-6 flex flex-col items-center">
            <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest pl-1 w-full mb-4">Live Layout Preview</label>
            
            <div className="w-full max-w-[280px] bg-white border border-slate-200 dark:bg-white dark:text-slate-850 p-6 shadow-md rounded-md font-mono text-center text-xs space-y-4 text-slate-700">
              {info.logoUrl ? (
                <img src={info.logoUrl} alt="Logo" className="w-12 h-12 mx-auto rounded-full object-cover border" />
              ) : (
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto border text-slate-400 font-sans font-bold">Logo</div>
              )}

              <div>
                <h4 className="font-bold text-sm tracking-tight text-slate-950">{info.name || 'Business Name'}</h4>
                <p className="text-[10px] opacity-80 mt-1">{info.tagline || 'Tagline/Services motto'}</p>
              </div>

              <div className="border-t border-dashed my-2 border-slate-350" />

              <div className="text-left space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Invoice:</span>
                  <span>#INV-78401</span>
                </div>
                {info.phone && (
                  <div className="flex justify-between">
                    <span>Phone:</span>
                    <span>{info.phone}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed my-2 border-slate-350" />

              <div className="text-[10px] space-y-1">
                <div className="flex justify-between">
                  <span>1x Replacement Screen OLED</span>
                  <span>$89.00</span>
                </div>
                <div className="flex justify-between font-bold text-slate-950 mt-2 text-xs">
                  <span>TOTAL PAID:</span>
                  <span>$89.00</span>
                </div>
              </div>

              <div className="border-t border-dashed my-2 border-slate-350" />

              {info.address && (
                <p className="text-[9px] opacity-80 max-w-[200px] mx-auto leading-normal">{info.address}</p>
              )}
              <p className="text-[9px] font-bold opacity-80 uppercase tracking-widest mt-1">Thank you for visiting!</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAccessControl = () => {

    const auditLogs = rbacService.get_audit_logs();

    const filteredLogs = auditLogs.filter(log => {
      const matchesQuery =
        log.userEmail.toLowerCase().includes(auditQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(auditQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(auditQuery.toLowerCase());
      
      const matchesFilter = auditFilter === "all" || log.action.includes(auditFilter);
      return matchesQuery && matchesFilter;
    });

    const togglePermission = (roleId: string, permId: string) => {
      const roleObj = rbacRoles.find(r => r.id === roleId);
      if (!roleObj) return;

      const currentPerms = modifiedPermissions[roleId] ?? roleObj.permissions;
      const nextPerms = currentPerms.includes(permId)
        ? currentPerms.filter((id: string) => id !== permId)
        : [...currentPerms, permId];

      setModifiedPermissions(prev => ({
        ...prev,
        [roleId]: nextPerms
      }));
    };

    const handleSaveMatrix = async () => {
      setIsSavingMatrix(true);
      try {
        const updatedRoles = rbacRoles.map(role => {
          if (role.id in modifiedPermissions) {
            return { ...role, permissions: modifiedPermissions[role.id] };
          }
          return role;
        });

        // Save modifications to database & sync local storage via service
        await rbacService.update_roles_matrix(updatedRoles, authUser?.email || 'admin');
        
        setRbacRoles(updatedRoles);
        setModifiedPermissions({});
        addToast("Role permission matrix saved successfully!", "success");
      } catch (err: any) {
        console.error("Save matrix failed:", err);
        addToast("Failed to save changes: " + err.message, "error");
      } finally {
        setIsSavingMatrix(false);
      }
    };

    const handleDeleteRole = async (roleId: string, roleName: string) => {
      if (!window.confirm(`Are you sure you want to delete the custom role "${roleName}"?`)) return;

      try {
        await rbacService.delete_role(roleId, authUser?.email || 'admin');
        const updatedRoles = rbacService.get_roles();
        setRbacRoles(updatedRoles);
        addToast(`Role "${roleName}" deleted.`, "success");
      } catch (err: any) {
        addToast(err.message || "Failed to delete role", "error");
      }
    };

    const handleToggleAuditing = (val: boolean) => {
      setEnterpriseAuditing(val);
      localStorage.setItem('repair_flow_enterprise_auditing', val ? 'true' : 'false');
      addToast(`Enterprise Auditing ${val ? 'enabled' : 'disabled'}.`, 'success');
      rbacService.add_audit_log(
        authUser?.email || 'admin',
        'AUDITING_TOGGLE',
        `Toggled Advanced Enterprise Auditing to ${val ? 'ON' : 'OFF'}`
      );
    };

    const handleSyncDB = async () => {
      setIsSavingMatrix(true);
      try {
        await loadRBAC();
        addToast("Security matrix synced from database.", "success");
      } catch (err: any) {
        addToast("Database sync failed: " + err.message, "error");
      } finally {
        setIsSavingMatrix(false);
      }
    };

    const handleRestoreDefaults = async () => {
      if (!window.confirm("Are you sure you want to reset all security configurations to system defaults? All custom roles will be removed.")) return;
      setIsSavingMatrix(true);
      try {
        await rbacService.reset_to_defaults();
        await loadRBAC();
        addToast("Access matrices restored to factory defaults.", "success");
      } catch (err: any) {
        addToast("Reset failed: " + err.message, "error");
      } finally {
        setIsSavingMatrix(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">Security Matrix & Access Control</h2>
            <p className="text-xs text-slate-455 dark:text-slate-500 mt-1">Configure role permissions, check security matrix grids, and audit operational logs</p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200/20 self-start">
            <button
              onClick={() => setActiveAccessSub("roles")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                activeAccessSub === "roles"
                  ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              Security Roles
            </button>
            <button
              onClick={() => setActiveAccessSub("matrix")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                activeAccessSub === "matrix"
                  ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              Access Matrix
            </button>
            <button
              onClick={() => setActiveAccessSub("audit")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                activeAccessSub === "audit"
                  ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              Audit Logs
            </button>
          </div>
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-700" />

        {activeAccessSub === "roles" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pl-1">
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-350">Defined Security Roles</h3>
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsCloneRoleModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition active:scale-95"
                  >
                    <Copy size={13} />
                    Clone Role
                  </button>
                  <button
                    onClick={() => setIsAddRoleModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-xs font-bold transition active:scale-95 dark:bg-slate-700"
                  >
                    <Plus size={13} />
                    Add Custom Role
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {rbacRoles.map(r => (
                <div key={r.id} className="bg-slate-50 border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-sm text-slate-805 dark:text-white">{r.name}</h4>
                      <span className={cn(
                        "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider",
                        r.isSystem ? "bg-slate-900 text-white dark:bg-slate-750" : "bg-blue-100 text-blue-800"
                      )}>{r.isSystem ? "System" : "Custom"}</span>
                    </div>
                    <p className="text-[11px] text-slate-450 dark:text-slate-500 leading-normal">{r.description}</p>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-200/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Permissions Count:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-blue-650 bg-blue-50 px-2.5 py-0.5 rounded-full dark:bg-blue-950/20 dark:text-blue-400">
                        {r.permissions.length === rbacPermissions.length ? 'ALL' : `${r.permissions.length} keys`}
                      </span>
                      {!r.isSystem && isAdmin && (
                        <button
                          onClick={() => handleDeleteRole(r.id, r.name)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-655 rounded transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Professional Admin options */}
            <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/20 dark:border-slate-800 rounded-3xl p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 dark:bg-rose-950/20 dark:text-rose-400">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-850 dark:text-white">Professional Admin Options</h3>
                  <p className="text-xs text-slate-450 dark:text-slate-550 font-medium">Configure advanced auditing controls and configurations restore options</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-white border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 rounded-2xl">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-750 dark:text-slate-350">Enterprise Auditing Log Mode</p>
                  <p className="text-xs text-slate-450 dark:text-slate-550">Store granular user metadata and logs trail actions to Firestore database</p>
                </div>
                <button
                  onClick={() => handleToggleAuditing(!enterpriseAuditing)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    enterpriseAuditing ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-750"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    enterpriseAuditing ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-750 dark:text-slate-300">Sync Security Setup</h4>
                    <p className="text-[11px] text-slate-450 dark:text-slate-550 mt-0.5">Force reload security configurations directly from Cloud Firestore</p>
                  </div>
                  <button
                    onClick={handleSyncDB}
                    disabled={isSavingMatrix}
                    className="inline-flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold transition active:scale-95 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <RefreshCw size={13} className={cn(isSavingMatrix && "animate-spin")} />
                    Sync database
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-750 dark:text-slate-350">Restore Factory Setup</h4>
                    <p className="text-[11px] text-slate-450 dark:text-slate-550 mt-0.5">Reset RBAC matrix mapping configurations back to initial standard keys</p>
                  </div>
                  <button
                    onClick={handleRestoreDefaults}
                    disabled={isSavingMatrix}
                    className="inline-flex items-center gap-1 px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition active:scale-95 dark:border-rose-950/30"
                  >
                    <RefreshCw size={13} />
                    Restore factory defaults
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeAccessSub === "matrix" && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/20 dark:border-slate-800 rounded-3xl p-6 overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-750 dark:text-slate-300">Modular Access Matrix</h3>
                  <p className="text-xs text-slate-450 dark:text-slate-550 mt-0.5">Edit checkmarks to toggle active authorization capabilities for any role</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-2 font-bold text-slate-400 uppercase tracking-widest text-[9px] w-1/3">Permission Key / Action</th>
                      {rbacRoles.map(r => (
                        <th key={r.id} className="text-center py-2 font-bold text-slate-400 uppercase tracking-widest text-[9px]">{r.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150/50 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
                    {rbacPermissions.map(perm => (
                      <tr key={perm.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5">
                          <span className="font-bold text-slate-850 dark:text-white">{perm.module}</span>
                          <span className="text-slate-400 dark:text-slate-505 mx-1.5">•</span>
                          <span>{perm.description}</span>
                        </td>
                        {rbacRoles.map(role => {
                          const currentPerms = modifiedPermissions[role.id] ?? role.permissions;
                          const isChecked = currentPerms.includes(perm.id);
                          const isSuper = role.id?.toLowerCase() === 'superadmin' || role.id?.toLowerCase() === 'super_admin';
                          
                          return (
                            <td key={role.id} className="text-center py-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isSuper || !isAdmin}
                                onChange={() => togglePermission(role.id, perm.id)}
                                className="w-4 h-4 text-blue-600 border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded focus:ring-blue-500/25 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {Object.keys(modifiedPermissions).length > 0 && (
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setModifiedPermissions({})}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold"
                  >
                    Cancel changes
                  </button>
                  <button
                    onClick={handleSaveMatrix}
                    disabled={isSavingMatrix}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors text-xs font-bold shadow-md shadow-blue-500/25 flex items-center gap-1.5"
                  >
                    {isSavingMatrix && <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />}
                    Save Access Matrix
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeAccessSub === "audit" && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search audit trail logs..."
                  value={auditQuery}
                  onChange={(e) => setAuditQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all shadow-sm"
                />
              </div>
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all shadow-sm bg-white"
              >
                <option value="all">All actions</option>
                <option value="ROLE_">Role adjustments</option>
                <option value="USER_">User configurations</option>
                <option value="SYSTEM_">System core operations</option>
              </select>
            </div>

            <div className="border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-750">
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-5 py-3 text-slate-400 font-bold uppercase tracking-widest text-[9px]">Timestamp</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-bold uppercase tracking-widest text-[9px]">Operator</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-bold uppercase tracking-widest text-[9px]">Event</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-bold uppercase tracking-widest text-[9px]">Details</th>
                      <th className="text-right px-5 py-3 text-slate-400 font-bold uppercase tracking-widest text-[9px]">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-350 bg-white dark:bg-slate-900">
                    {filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-450">
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap font-bold text-slate-800 dark:text-white">
                          {log.userEmail}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                            log.action.includes('SYSTEM') ? "bg-slate-950 text-white" :
                            log.action.includes('ROLE') ? "bg-indigo-50 text-indigo-650 dark:bg-indigo-950/20 dark:text-indigo-400" :
                            log.action.includes('USER') ? "bg-amber-50 text-amber-655 dark:bg-amber-950/20 dark:text-amber-400" : "bg-blue-50 text-blue-600"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-5 py-3 leading-normal max-w-sm truncate">{log.details}</td>
                        <td className="px-5 py-3 text-right font-mono text-slate-400">{log.ipAddress || '127.0.0.1'}</td>
                      </tr>
                    ))}

                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-500">No matching system audit logs found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUsers = () => (
    <div className="space-y-6">
      {/* Header section with add user */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-white">User Accounts</h2>
          <p className="text-xs text-slate-455 dark:text-slate-500 mt-1">Manage staff workspace accounts and assign authorization roles</p>
        </div>

        {isAdmin && (
          <button 
            onClick={() => setIsAddingUser(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm active:scale-95 text-xs font-bold self-start dark:bg-slate-700 dark:hover:bg-slate-655">
            <Plus size={16} />
            Add User
          </button>
        )}
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-700" />

      {/* User listing table */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search user email, names or roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 dark:bg-slate-850 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Name / Email</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Branch</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Role</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Last Active</th>
                  {isAdmin && (
                    <th className="text-right px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4">
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">{user.name}</h4>
                        <p className="text-slate-400 font-mono mt-0.5">{user.email}</p>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">
                      {user.branch || 'Main Branch'}
                    </td>

                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
                        roleColors[user.role] || "bg-slate-100 text-slate-650 border-slate-200"
                      )}>
                        {user.role}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Circle
                          size={8}
                          className={cn(
                            user.status === "Online" ? "text-green-500 fill-current" : "text-slate-350 fill-current"
                          )}
                        />
                        <span className="text-slate-650 dark:text-slate-400 font-medium">{user.status}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-505 font-medium whitespace-nowrap">
                      {user.lastLogin?.seconds 
                        ? new Date(user.lastLogin.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : 'Never'}
                    </td>

                    {isAdmin && (
                      <td className="px-6 py-4">
                        <div className="flex justify-end items-center gap-2">
                          <button 
                            onClick={() => startEdit(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-850 font-bold transition"
                          >
                            <Edit size={12} />
                            Edit
                          </button>

                          <button
                            onClick={() => handleDelete(user.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-650 hover:bg-red-50 font-bold dark:border-red-950/30 dark:hover:bg-red-955/10"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="text-center py-12 text-slate-500">No user accounts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDatabase = () => {

    const exportBackup = async () => {
      setIsExporting(true);
      try {
        const collectionsToExport = [
          'users', 'products', 'suppliers', 'dealers', 'customers',
          'locations', 'transactions', 'stock', 'transfers', 'purchase_orders'
        ];
        const backupData: Record<string, any[]> = {};
        
        for (const colName of collectionsToExport) {
          const snap = await getDocs(collection(db, colName));
          backupData[colName] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        
        const fileString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([fileString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", url);
        downloadAnchor.setAttribute("download", `phoneims_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        URL.revokeObjectURL(url);
        
        addToast("Workspace backup JSON file downloaded successfully!", "success");
      } catch (error: any) {
        console.error("Backup failed:", error);
        addToast("Failed to compile database backup: " + error.message, "error");
      } finally {
        setIsExporting(false);
      }
    };

    const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!window.confirm("WARNING: Importing data can overwrite your existing database items. Are you sure you want to proceed?")) {
        e.target.value = "";
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error("Invalid format. Must be a valid JSON backup.");
          }
          
          let importCount = 0;
          setIsImporting(true);
          
          for (const [colName, docs] of Object.entries(parsed)) {
            if (!Array.isArray(docs)) continue;
            for (const docData of docs) {
              const { id, ...rest } = docData;
              if (!id) continue;
              await setDoc(doc(db, colName, id), rest);
              importCount++;
            }
          }
          
          addToast(`Restored ${importCount} elements to the workspace successfully!`, "success");
          setTimeout(() => window.location.reload(), 1500);
        } catch (err: any) {
          console.error("Restore failed:", err);
          addToast("Restore failed: " + err.message, "error");
        } finally {
          setIsImporting(false);
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    };

    const runDiagnostics = async () => {
      setIsDiagnosing(true);
      const startTime = performance.now();
      try {
        await getDoc(doc(db, "settings", "inventory"));
        const endTime = performance.now();
        const ping = Math.round(endTime - startTime);
        setLatency(ping);
        setConnectionStatus("Online");
        addToast(`Firestore Connection diagnostic completed! Ping: ${ping}ms`, "success");
      } catch (err: any) {
        console.error("Ping failed:", err);
        setConnectionStatus("Error");
        setLatency(null);
        addToast("Failed to ping database: " + err.message, "error");
      } finally {
        setIsDiagnosing(false);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">Workspace Data Management</h2>
          <p className="text-xs text-slate-450 dark:text-slate-550 mt-1">Configure workspace backup sets, imports, and check server connection health</p>
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-700" />

        {/* Connection diagnostics card */}
        <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-white relative",
              connectionStatus === "Online" ? "bg-green-500 shadow-lg shadow-green-500/20" : "bg-red-500 shadow-lg shadow-red-500/20"
            )}>
              <Database size={24} />
              <span className={cn(
                "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-800",
                connectionStatus === "Online" ? "bg-green-400 animate-ping" : "bg-red-400"
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 dark:text-white">Firebase Google Firestore</h3>
                <span className={cn(
                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider",
                  connectionStatus === "Online" ? "bg-green-100 text-green-700 dark:bg-green-955/25 dark:text-green-400" : "bg-red-100 text-red-700"
                )}>{connectionStatus}</span>
              </div>
              <p className="text-xs text-slate-450 dark:text-slate-555 mt-1">
                {latency !== null ? `Diagnostic ping roundtrip: ${latency}ms (Excellent)` : 'Run diagnostics to check server response latency'}
              </p>
            </div>
          </div>

          <button
            onClick={runDiagnostics}
            disabled={isDiagnosing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-white shadow-sm active:scale-95 transition-all"
          >
            {isDiagnosing ? (
              <div className="w-4 h-4 border-2 border-slate-450 border-t-slate-800 rounded-full animate-spin" />
            ) : (
              <RefreshCw size={14} className={cn(isDiagnosing && "animate-spin")} />
            )}
            Ping Database
          </button>
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-700" />

        {/* Backups grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Export Card */}
          <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-850 dark:text-white">Export Local Backup Set</h3>
              <p className="text-xs text-slate-450 dark:text-slate-550 leading-relaxed">
                Compile all system documents including inventory products, sales, purchases, suppliers, dealers, and locations into a single, encrypted portable JSON file.
              </p>
            </div>
            <button
              onClick={exportBackup}
              disabled={isExporting}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:bg-slate-400"
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download size={15} />
              )}
              Download Backup JSON
            </button>
          </div>

          {/* Import Card */}
          <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-850 dark:text-white">Import / Restore Backup</h3>
              <p className="text-xs text-slate-450 dark:text-slate-550 leading-relaxed">
                Restore workspace databases from a previously saved JSON backup file. All database entries will be created or updated matching their backup identifiers.
              </p>
            </div>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                disabled={isImporting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <button
                disabled={isImporting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:bg-slate-400"
              >
                {isImporting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Upload size={15} />
                )}
                Upload Backup JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleAddRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName) return;

    setIsSavingRole(true);
    try {
      const newRole = await rbacService.create_role(newRoleName, newRoleDesc, [], authUser?.email || 'admin');
      const updatedRoles = rbacService.get_roles();
      setRbacRoles(updatedRoles);

      setIsAddRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      addToast(`Custom role "${newRoleName}" created successfully!`, "success");
    } catch (e: any) {
      console.error(e);
      addToast("Failed to create role: " + e.message, "error");
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleCloneRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName || !cloneSourceRoleId) return;

    setIsSavingRole(true);
    try {
      const newRole = await rbacService.clone_role(cloneSourceRoleId, newRoleName, authUser?.email || 'admin');
      const updatedRoles = rbacService.get_roles();
      setRbacRoles(updatedRoles);

      setIsCloneRoleModalOpen(false);
      setNewRoleName("");
      setCloneSourceRoleId("");
      addToast(`Role cloned successfully as "${newRoleName}"`, "success");
    } catch (err: any) {
      addToast(err.message || "Failed to clone role", "error");
    } finally {
      setIsSavingRole(false);
    }
  };

  const subTabs = [
    { id: "preferences", label: "Preferences", desc: "Theme, densities, and printing scales", icon: Sliders },
    { id: "branding", label: "Branding", desc: "Business metadata and receipt layouts", icon: Award },
    { id: "access", label: "Access Control", desc: "Roles, security mappings, and audit logs", icon: ShieldAlert },
    { id: "users", label: "Users", desc: "Manage users, passwords, and roles", icon: Users },
    { id: "database", label: "Database", desc: "Backups, imports, and connections health", icon: Database },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">System Settings</h1>
        <p className="text-sm text-slate-505 dark:text-slate-400 mt-1">Configure your application workspace options</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Navigation Sidebar */}
        <div className="w-full lg:w-72 shrink-0 space-y-2">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={cn(
                  "w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-4 group active:scale-[0.98]",
                  isActive
                    ? "bg-white border-slate-200 shadow-md shadow-slate-100/50 dark:bg-slate-850 dark:border-slate-800"
                    : "bg-transparent border-transparent hover:bg-slate-100/40 hover:border-slate-200/40 dark:hover:bg-slate-805/40"
                )}
              >
                <div
                  className={cn(
                    "p-2.5 rounded-xl transition-all",
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "bg-slate-100 text-slate-505 group-hover:bg-slate-200 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700"
                  )}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn(
                      "font-bold text-sm transition-colors",
                      isActive ? "text-slate-850 dark:text-white" : "text-slate-650 dark:text-slate-300 group-hover:text-slate-900"
                    )}
                  >
                    {tab.label}
                  </h3>
                  <p className="text-[11px] text-slate-450 dark:text-slate-555 font-medium mt-0.5 leading-normal truncate">
                    {tab.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Tab Panel Content */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSubTab}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.15 }}
              className="bg-white border border-slate-200 dark:bg-slate-855 dark:border-slate-800 rounded-3xl p-6 shadow-sm min-h-[500px]"
            >
              {activeSubTab === "preferences" && renderPreferences()}
              {activeSubTab === "branding" && renderBranding()}
              {activeSubTab === "access" && renderAccessControl()}
              {activeSubTab === "users" && renderUsers()}
              {activeSubTab === "database" && renderDatabase()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Add Custom Role Modal */}
      <AnimatePresence>
        {isAddRoleModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:bg-slate-850 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center shadow-lg dark:bg-slate-700">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-white tracking-tight">Add Custom Role</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Create system access permission groups</p>
                  </div>
                </div>
                <button onClick={() => setIsAddRoleModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAddRoleSubmit} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sales Assistant"
                    className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-bold"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Role Description</label>
                  <textarea
                    required
                    placeholder="Describe role responsibilities..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsAddRoleModalOpen(false)} className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                  <button type="submit" disabled={isSavingRole} className="flex-[2] bg-slate-900 hover:bg-slate-850 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-slate-900/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:bg-slate-400 dark:bg-slate-700">
                    {isSavingRole ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Create Role"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clone Custom Role Modal */}
      <AnimatePresence>
        {isCloneRoleModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:bg-slate-850 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-650 rounded-xl flex items-center justify-center shadow-lg dark:bg-blue-900">
                    <Copy className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-850 dark:text-white tracking-tight">Clone Existing Role</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Duplicate role capabilities</p>
                  </div>
                </div>
                <button onClick={() => setIsCloneRoleModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleCloneRoleSubmit} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Source Role</label>
                  <select
                    required
                    className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={cloneSourceRoleId}
                    onChange={(e) => setCloneSourceRoleId(e.target.value)}
                  >
                    <option value="">-- Choose Role to Clone --</option>
                    {rbacRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">New Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Technician"
                    className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-bold"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsCloneRoleModalOpen(false)} className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                  <button type="submit" disabled={isSavingRole} className="flex-[2] bg-blue-650 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:bg-slate-400">
                    {isSavingRole ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Clone Role"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:bg-slate-850 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200 dark:bg-slate-705">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-white tracking-tight">Add New User</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Registering system staff</p>
                  </div>
                </div>
                <button onClick={() => setIsAddingUser(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                  <input 
                    type="email"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-mono"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 focus:outline-none"
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12.013a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Assigned Branch</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.branch}
                    onChange={(e) => setUserForm({ ...userForm, branch: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">User Role</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    {selectableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsAddingUser(false)} className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Cancel</button>
                  <button type="submit" disabled={isSavingUser} className="flex-[2] bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-slate-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400 dark:bg-slate-750 dark:hover:bg-slate-700">
                    {isSavingUser ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Create User</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {isEditingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:bg-slate-850 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-blue-50/50 dark:bg-slate-850">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 dark:bg-blue-900">
                    <Edit className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-805 dark:text-white tracking-tight">Edit User Profile</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update permissions & access</p>
                  </div>
                </div>
                <button onClick={() => { setIsEditingUser(false); setEditingUserId(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                  <input 
                    type="email"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-mono"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Assigned Branch</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.branch}
                    onChange={(e) => setUserForm({ ...userForm, branch: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">User Role</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    {selectableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => { setIsEditingUser(false); setEditingUserId(null); }} className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Cancel</button>
                  <button type="submit" disabled={isSavingUser} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400">
                    {isSavingUser ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Save Changes</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserSettings;