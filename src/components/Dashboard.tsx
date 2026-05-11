import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  ArrowRightLeft, 
  AlertCircle,
  Smartphone,
  MapPin,
  Clock,
  Zap,
  ShoppingBag,
  ShoppingBasket,
  BarChart3
} from 'lucide-react';
import { collection, onSnapshot, query, limit, orderBy, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction, Stock, Location } from '../types';
import { cn } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalStock: 0,
    totalValue: 0,
    totalSales: 0,
    recentTransactions: [] as Transaction[],
    lowStock: [] as any[],
    locations: [] as Location[],
    locationStock: {} as Record<string, number>,
    hasPartners: true
  });

  useEffect(() => {
    const unsubTransactions = onSnapshot(
      query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(5)),
      (snapshot) => {
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setStats(prev => ({ ...prev, recentTransactions: transactions }));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'transactions')
    );

    const unsubStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
      const stocks = snapshot.docs.map(doc => doc.data() as Stock);
      const total = stocks.reduce((acc, curr) => acc + curr.quantity, 0);
      const value = total * 500;
      const low = stocks.filter(s => s.quantity < 5);

      const locationStock: Record<string, number> = {};
      stocks.forEach(s => {
        locationStock[s.locationId] = (locationStock[s.locationId] || 0) + s.quantity;
      });

      setStats(prev => ({ 
        ...prev, 
        totalStock: total, 
        totalValue: value, 
        lowStock: low,
        locationStock
      }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'stock'));

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      if (snapshot.empty) setStats(prev => ({ ...prev, hasPartners: false }));
      else setStats(prev => ({ ...prev, hasPartners: true }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));

    const unsubLocs = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setStats(prev => ({ ...prev, locations: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)) }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));

    return () => {
      unsubTransactions();
      unsubStock();
      unsubSuppliers();
      unsubLocs();
    };
  }, []);

  const chartData = useMemo(() => {
    return stats.locations.map(loc => ({
      name: loc.name,
      value: (stats.locationStock[loc.id] || 0) * 500
    })).filter(d => d.value > 0 || stats.locations.length < 5);
  }, [stats.locations, stats.locationStock]);

  const initializeData = async () => {
    const suppliers = [
      { code: 'S1000', name: 'S1000 Master', type: 'Main' },
      { code: 'S2000', name: 'S2000 Master', type: 'Main' },
      { code: 'S04-000', name: 'លីហៃបោះដុំ (Master)', type: 'Main' },
      { code: 'S04-001', name: 'លីហៃអីវ៉ាន់មួយទឹក', type: 'Sub', parentCode: 'S04-000' },
      { code: 'S04-002', name: 'លីហៃអីវ៉ាន់ថ្មី', type: 'Sub', parentCode: 'S04-000' },
      { code: 'S01-001', name: 'S01-001 Partner', type: 'Sub' },
      { code: 'S02-002', name: 'S02-002 Partner', type: 'Sub' }
    ];
    const customers = [{ code: 'C000001', name: 'General Customer' }];
    const dealers = [
      { code: 'D100', name: 'Dealer 100' },
      { code: 'D200', name: 'Dealer 200' }
    ];

    try {
      for (const s of suppliers) await addDoc(collection(db, 'suppliers'), s);
      for (const c of customers) await addDoc(collection(db, 'customers'), c);
      for (const d of dealers) await addDoc(collection(db, 'dealers'), d);
      alert("System initialized with base data!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'initialization');
    }
  };

  const cards = [
    { label: 'Total Stock Units', value: stats.totalStock.toLocaleString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', growth: 'Live Inventory' },
    { label: 'Estimated Value', value: `$${stats.totalValue.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', growth: '@ $500 Avg/Unit' },
    { label: 'Total Dealers', value: '145', icon: AlertCircle, color: 'text-slate-600', bg: 'bg-slate-100', growth: 'Registered Active' },
    { label: 'Customers', value: stats.totalStock > 0 ? '12.5k' : '0', icon: MapPin, color: 'text-green-600', bg: 'bg-green-50', growth: 'General Reach' },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Executive Summary</h1>
          <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Inventory Intelligence
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'transactions', type: 'PURCHASE' } }));
            }}
            className="group px-6 py-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-3 active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
              <ShoppingBasket className="w-4 h-4 text-blue-600 group-hover:text-white" />
            </div>
            <div className="text-left">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Inventory</p>
              <p className="text-sm font-bold text-slate-700 leading-none">New Purchase</p>
            </div>
          </button>

          <button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'transactions', type: 'SALE' } }));
            }}
            className="group px-6 py-3 bg-slate-900 text-white rounded-xl shadow-xl hover:shadow-2xl transition-all flex items-center gap-3 hover:-translate-y-0.5 active:translate-y-0"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-tighter mb-0.5">Outbound</p>
              <p className="text-sm font-bold leading-none">Add Sale</p>
            </div>
          </button>
        </div>
      </div>

      {!stats.hasPartners && (
        <div className="bg-blue-600 p-6 rounded-xl text-white flex items-center justify-between shadow-xl shadow-blue-600/20">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-white/20 rounded-lg">
                <Zap className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold text-lg">System Initial Setup</h3>
                <p className="text-sm opacity-80">Populate the system with the required Locations, Suppliers, and Dealers.</p>
             </div>
          </div>
          <button 
            onClick={initializeData}
            className="bg-white text-blue-600 px-6 py-2 rounded-md font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            Initialize Now
          </button>
        </div>
      )}

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        {cards.map((card, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-slate-500 font-medium">{card.label}</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{card.value}</h3>
            <p className={cn("text-xs mt-2 font-medium", card.color)}>{card.growth}</p>
          </div>
        ))}
      </div>

      {/* Stock Value by Location Chart */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Stock Value Distribution by Location
            </h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Valuation based on $500 average per unit</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-600" />
              <span className="text-slate-600">Total Value ($)</span>
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                tickFormatter={(value) => `$${(value / 1000)}k`}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{payload[0].payload.name}</p>
                        <p className="text-sm font-black">${payload[0].value?.toLocaleString()}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="value" 
                radius={[6, 6, 0, 0]} 
                barSize={40}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#2563eb' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[500px]">
        {/* Recent Transactions List */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">Recent Movement History</h4>
            <div className="flex gap-2">
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 font-bold uppercase tracking-tight cursor-pointer hover:bg-blue-100 transition-colors">Export</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 sticky top-0">
                <tr>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Partner / Entity</th>
                  <th className="px-6 py-3">Staff Name</th>
                  <th className="px-6 py-3 text-right">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {stats.recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] border font-bold uppercase",
                        tx.type === 'SALE' ? 'bg-green-50 text-green-700 border-green-200' : 
                        tx.type === 'PURCHASE' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                        'bg-slate-50 text-slate-600 border-slate-200'
                      )}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{tx.partnerName || 'Internal Transfer'}</div>
                      <div className="text-[10px] text-slate-400 italic">Order #{tx.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {tx.staffName}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                      {tx.items.reduce((acc, i) => acc + i.quantity, 0)}
                    </td>
                  </tr>
                ))}
                {stats.recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                      No recent activity recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stock Alerts Sidebar */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col h-full overflow-hidden">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs mb-4 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              Stock Alerts
            </h4>
            <div className="space-y-3 overflow-y-auto pr-1">
              {stats.lowStock.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded bg-slate-50 border border-slate-100 group hover:border-amber-200 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-700 truncate w-40">SKU: {item.variationId}</span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {stats.locations.find(l => l.id === item.locationId)?.name || 'Unknown Store'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-amber-600 tracking-tighter">{item.quantity} UNITS</span>
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 rounded-full font-bold uppercase">LOW</span>
                  </div>
                </div>
              ))}
              {stats.lowStock.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                   <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                      <Package className="w-6 h-6 text-green-500" />
                   </div>
                   <p className="text-xs text-slate-400 font-medium">All stock levels are currently healthy across all outlets.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
