/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
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
  ShoppingBasket
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Transactions from './components/Transactions';
import Suppliers from './components/Suppliers';
import Customers from './components/Customers';
import Dealers from './components/Dealers';
import Locations from './components/Locations';
import StockTransfers from './components/StockTransfers';
import Sales from './components/Sales';
import Purchases from './components/Purchases';

type Tab = 'dashboard' | 'inventory' | 'transactions' | 'suppliers' | 'customers' | 'dealers' | 'locations' | 'transfers' | 'sales' | 'purchases';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'sales', label: 'Sales History', icon: ShoppingBag },
    { id: 'purchases', label: 'Purchases', icon: ShoppingBasket },
    { id: 'transfers', label: 'Transfers', icon: Truck },
    { id: 'locations', label: 'Warehouse', icon: MapPin },
    { id: 'transactions', label: 'Register', icon: ArrowLeftRight },
    { id: 'suppliers', label: 'Suppliers', icon: UserCircle },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'dealers', label: 'Dealers', icon: Briefcase },
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
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900 italic font-serif">SmartPhone Pro</h1>
              <p className="text-neutral-500">Shop Management System</p>
            </div>
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-neutral-900 text-white py-4 px-6 rounded-2xl font-semibold hover:bg-neutral-800 transition-all active:scale-[0.98]"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 rounded-full" />
              Sign in with Google
            </button>
            <p className="text-xs text-neutral-400">Restricted to authorized staff only.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
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
                <img src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} alt="avatar" />
              </div>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-500 truncate">Manager @KY VIP</p>
                </div>
              )}
            </div>
            <button 
              onClick={handleLogout}
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
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md text-sm text-slate-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Location: KY VIP
             </div>
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
              {activeTab === 'inventory' && <Inventory />}
              {activeTab === 'transactions' && <Transactions staffName={user.displayName || 'Unknown Staff'} />}
              {activeTab === 'suppliers' && <Suppliers />}
              {activeTab === 'customers' && <Customers />}
              {activeTab === 'dealers' && <Dealers />}
              {activeTab === 'locations' && <Locations />}
              {activeTab === 'transfers' && <StockTransfers staffName={user.displayName || 'Unknown Staff'} />}
              {activeTab === 'sales' && <Sales />}
              {activeTab === 'purchases' && <Purchases />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
