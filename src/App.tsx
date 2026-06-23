/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowLeftRight, 
  Users, 
  Briefcase,
  Truck, 
  UserCircle,
  Menu,
  X,
  Plus,
  Search,
  LogOut,
  MapPin,
  TrendingUp,
  History,
  Smartphone,
  ShoppingBag,
  ShoppingBasket,
  Mail,
  Lock,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './auth/AuthContext';
import { ToastProvider } from './auth/ToastContext';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import Transactions from './components/Transactions';
import Suppliers from './components/Suppliers';
import Customers from './components/Customers';
import Dealers from './components/Dealers';
import Locations from './components/Locations';
import StockTransfers from './components/StockTransfers';
import Sales from './components/Sales';
import Purchases from './components/Purchases';
import UserSettings from './components/UserSettings.tsx';
import { db, auth } from './lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';

type Tab = 'dashboard' | 'Products' | 'transactions' | 'suppliers' | 'customers' | 'dealers' | 'locations' | 'transfers' | 'sales' | 'purchases' | 'settings';

export default function App() {
  const { user, loading, logout, loginWithGoogle, loginWithEmail } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]); // To fetch user roles

  // Determine if the current logged-in user is an Admin
  const MASTER_ADMIN_EMAIL = 'pichethneou@gmail.com';
  const isAdmin = useMemo(() => {
    if (user?.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
    const dbUser = allUsers.find((u) => u.email === user?.email);
    return dbUser?.role === "Admin" || dbUser?.role === "SuperAdmin" || dbUser?.role === "superadmin";
  }, [allUsers, user]);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    // Listen for all users to determine roles
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      // Silently ignore permission-denied (expected when not logged in or after sign-out)
      if (error.code !== 'permission-denied') {
        console.error('Users listener error:', error);
      }
    });

    return () => unsubUsers();
  }, []);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setLoginError("Please enter your email address first.");
      return;
    }
    setLoginError(null);
    setResetMessage(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage("Password reset email sent! Please check your inbox.");
    } catch (error: any) {
      setLoginError(error.message || "Failed to send reset email.");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      // This calls the function in AuthContext.tsx
      await loginWithEmail(email, password);
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
    } catch (error: any) {
      console.error(error);
      const code = error?.code;
      const message = error?.message || (typeof error === 'string' ? error : 'An unexpected error occurred during login.');

      switch (code) {
        case "auth/invalid-credential":
          setLoginError("Invalid email or password.");
          break;

        case "auth/configuration-not-found":
          setLoginError("Firebase Authentication is not configured for this project.");
          break;

        default:
          setLoginError(message);
      }
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'Products', label: 'Products', icon: Package },
    { id: 'purchases', label: 'Purchases', icon: ShoppingBasket },
    { id: 'sales', label: 'Sales', icon: ShoppingBag },
    { id: 'transfers', label: 'Transfers', icon: Truck },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'transactions', label: 'Register', icon: ArrowLeftRight },
    { id: 'suppliers', label: 'Suppliers', icon: UserCircle },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'dealers', label: 'Dealers', icon: Briefcase },
    ...(isAdmin ? [{ id: 'settings', label: 'User Settings', icon: Settings }] : []),
  ];

  useEffect(() => {
    const handleSwitch = (e: any) => {
      if (e.detail.tab) setActiveTab(e.detail.tab);
    };
    window.addEventListener('switch-tab', handleSwitch);
    return () => window.removeEventListener('switch-tab', handleSwitch);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <motion.div 
          animate={{ scale: [1, 1.2, 1] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-12 h-12 bg-blue-600 rounded-xl"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 bg-[grid-white]/5">
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10 pointer-events-none" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl relative overflow-hidden"
        >
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 bg-blue-600 flex items-center justify-center rounded-2xl shadow-lg shadow-blue-600/20">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-2">
  <h1 className="text-4xl font-black tracking-tight text-slate-900 font-sans">
    SmartPhone Pro
  </h1>

  <p className="text-sm tracking-[0.2em] uppercase text-slate-500 font-medium">
    Mobile & Electronics Management System
  </p>
</div>

            <form onSubmit={handleEmailLogin} className="w-full space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="email" 
                    placeholder="pichethneou@gmail.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="password" 
                    placeholder="........"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

            <div className="w-full flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 transition-all cursor-pointer"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-500 transition-colors">Remember Me</span>
              </label>

              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest transition-colors focus:outline-none cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

              {loginError && <p className="text-xs text-red-500 font-medium">{loginError}</p>}
              {resetMessage && <p className="text-xs text-green-600 font-medium">{resetMessage}</p>}

              <button
                type="submit"
                className="w-full flex items-center justify-center bg-blue-600 text-white py-4 px-6 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
              >
                Sign In
              </button>
            </form>

            <div className="w-full flex items-center gap-3 py-2">
              <div className="h-px bg-slate-100 flex-1" />
              <span className="text-[10px] font-bold text-slate-300 uppercase">OR</span>
              <div className="h-px bg-slate-100 flex-1" />
            </div>

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-600 py-3 px-6 rounded-2xl font-semibold hover:bg-slate-50 transition-all active:scale-[0.98]"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
              Continue with Google
            </button>
            <p className="text-xs text-neutral-400">Restricted to authorized staff only.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ToastProvider>
    <div className="min-h-screen bg-slate-50 flex font-sans selection:bg-blue-100 selection:text-blue-900 text-slate-900 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside 
        className={cn(
          "fixed md:sticky top-0 h-screen bg-slate-900 flex flex-col transition-all duration-300 z-50 shadow-xl",
          isSidebarOpen ? "w-64" : "w-16"
        )}
      >
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center font-bold text-white flex-shrink-0">P</div>
            {isSidebarOpen && <h1 className="text-white font-bold tracking-tight text-lg truncate">PhoneIMS</h1>}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as Tab)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all group",
                activeTab === item.id 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", activeTab === item.id ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
              {isSidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-800">
          <div className={cn("flex flex-col gap-2", !isSidebarOpen && "items-center")}>
            <div className={cn("flex items-center gap-3 p-2 rounded-lg bg-slate-800/50", !isSidebarOpen && "bg-transparent")}>
              <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400 overflow-hidden flex-shrink-0">
                <img src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || user.email || 'User'}`} alt="avatar" />
              </div>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{user.displayName || user.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-slate-500 truncate">Manager @KY VIP</p>
                </div>
              )}
            </div>
            <button 
              onClick={logout}
              className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full group",
                !isSidebarOpen && "justify-center"
              )}
            >
              <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              {isSidebarOpen && <span className="text-xs font-medium">Log out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-500"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800 capitalize tracking-tight">
                {activeTab} Overview
              </h2>
            </div>
          </div>
          {/* Auth Section */}
          <div className="flex items-center gap-3">
            {/* Store badge — hidden on mobile */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md text-sm text-slate-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              គ្នាយើង | KneaYerng
            </div>

            {/* Greeting */}
            <button
              onClick={() => setActiveTab('settings')}
              className="hidden sm:flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors group"
              title="View profile"
            >
              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center overflow-hidden">
                <img
                  src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.email || 'User')}`}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <span>
                Hello,{' '}
                <span className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                  {user.displayName || allUsers.find(u => u.email === user.email)?.name || user.email?.split('@')[0] || 'User'}
                </span>
              </span>
            </button>

            {/* Settings shortcut (admin only) */}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 border border-indigo-200 hover:border-indigo-400 px-2.5 py-1 rounded-md transition-all"
                title="User Settings"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            {/* Sign Out */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-400 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-md transition-all"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Dynamic Section */}
        <div className="flex-1 p-8 overflow-y-auto space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'Products' && <Products />}
              {activeTab === 'transactions' && <Transactions staffName={user.displayName || 'Unknown Staff'} />}
              {activeTab === 'suppliers' && <Suppliers />}
              {activeTab === 'customers' && <Customers />}
              {activeTab === 'dealers' && <Dealers />}
              {activeTab === 'locations' && <Locations />}
              {activeTab === 'transfers' && <StockTransfers staffName={user.displayName || 'Unknown Staff'} />}
              {activeTab === 'sales' && <Sales />}
              {activeTab === 'purchases' && <Purchases />}
              {activeTab === 'settings' && <UserSettings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
