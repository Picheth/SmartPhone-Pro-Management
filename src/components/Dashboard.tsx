import { useState, useEffect, useMemo, useCallback } from 'react';
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
  BarChart3,
  Download,
  FileText
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, onSnapshot, query, limit, orderBy, addDoc, doc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction, Stock, Location, Product, Variation } from '../types';
import { cn } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend
} from 'recharts';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [allSales, setAllSales] = useState<Transaction[]>([]);
  const [stats, setStats] = useState({
    totalStock: 0,
    totalValue: 0,
    totalSales: 0,
    monthlySales: 0,
    yearlySales: [] as { name: string, total: number }[],
    recentTransactions: [] as Transaction[],
    lowStock: [] as any[],
    negativeStock: [] as any[],
    locations: [] as Location[],
    locationStock: {} as Record<string, number>,
    hasPartners: true
  });

  const [revenueTimeframe, setRevenueTimeframe] = useState<'monthly' | 'total'>('monthly');

  const renderPieLabel = useCallback(({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    // Position label slightly further out (60% of the way) for better visual balance in a donut
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6; 
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Only show labels for slices larger than 5% to prevent clutter
    if (percent < 0.05) return null;

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[9px] font-black pointer-events-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_40%)]">
        <tspan x={x} dy="-0.5em">{name}</tspan>
        <tspan x={x} dy="1.1em">{(percent * 100).toFixed(0)}%</tspan>
      </text>
    );
  }, []);

  useEffect(() => {
    // Fetch recent transactions (single-field orderBy, no composite index needed)
    const unsubTransactions = onSnapshot(
      query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(5)),
      (snapshot) => {
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setStats(prev => ({ ...prev, recentTransactions: transactions }));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'transactions')
    );

    // Fetch ALL sales with a single-field where (no composite index needed)
    // Monthly and yearly aggregations are computed client-side
    const unsubAllSales = onSnapshot(
      query(
        collection(db, 'transactions'), 
        where('type', '==', 'SALE')
      ),
      (snapshot) => {
        const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        const total = txs.reduce((acc, tx) => acc + (tx.total || 0), 0);
        setAllSales(txs);
        setStats(prev => ({ ...prev, totalSales: total }));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'transactions')
    );

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    const unsubStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
      setStocks(snapshot.docs.map(doc => doc.data() as Stock));
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
      unsubAllSales();
      unsubProducts();
      unsubStock();
      unsubSuppliers();
      unsubLocs();
    };
  }, []);

  // Compute monthly and yearly sales client-side from allSales (avoids composite index)
  useEffect(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let monthlySales = 0;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const salesByMonth = months.map(name => ({ name, total: 0 }));

    allSales.forEach(tx => {
      const ts = (tx as any).timestamp;
      if (ts) {
        const date = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
        if (date >= startOfMonth) {
          monthlySales += (tx.total || 0);
        }
        if (date >= startOfYear) {
          salesByMonth[date.getMonth()].total += (tx.total || 0);
        }
      }
    });

    setStats(prev => ({ ...prev, monthlySales, yearlySales: salesByMonth }));
  }, [allSales]);

  // Recalculate stats when products or stocks change
  useEffect(() => {
    const total = stocks.reduce((acc, curr) => acc + curr.quantity, 0);
    const value = stocks.reduce((acc, s) => {
      const product = products.find(p => p.id === s.productId);
      const variation = product?.variations.find(v => v.id === s.variationId) as Variation & { price?: string };
      const price = variation?.price ? parseFloat(variation.price) : 500;
      return acc + (s.quantity * price);
    }, 0);
    
    const low = stocks.filter(s => s.quantity < 5);
    const negative = stocks.filter(s => s.quantity < 0);

    const locationStock: Record<string, number> = {};
    stocks.forEach(s => {
      locationStock[s.locationId] = (locationStock[s.locationId] || 0) + s.quantity;
    });

    setStats(prev => ({ 
      ...prev, 
      totalStock: total, 
      totalValue: value, 
      lowStock: low,
      negativeStock: negative,
      locationStock
    }));
  }, [products, stocks]);

  const categorySalesData = useMemo(() => {
    const salesByCategory: Record<string, number> = {};
    
    allSales.forEach(tx => {
      tx.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const category = product?.type || 'Other';
        const value = (item.quantity * (item.unitPrice || item.price || 0)) + (item.tax || 0);
        salesByCategory[category] = (salesByCategory[category] || 0) + value;
      });
    });

    return Object.entries(salesByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allSales, products]);

  const CATEGORY_COLORS = [
    '#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'
  ];

  const chartData = useMemo(() => {
    return stats.locations.map(loc => ({
      name: loc.name,
      value: stocks
        .filter(s => s.locationId === loc.id)
        .reduce((acc, s) => {
          const product = products.find(p => p.id === s.productId);
          const variation = product?.variations.find(v => v.id === s.variationId) as Variation & { price?: string };
          const price = variation?.price ? parseFloat(variation.price) : 500;
          return acc + (s.quantity * price);
        }, 0)
    })).filter(d => d.value > 0 || stats.locations.length < 5);
  }, [stats.locations, stocks, products]);

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

  const exportNegativeStockToPDF = () => {
    const doc = new jsPDF();
    
    // Add Store Logo
    // Note: If you have a local image, import it: import logo from '../assets/logo.png';
    // Then use: doc.addImage(logo, 'PNG', 14, 10, 15, 15);
    
    // Stylized placeholder for the "SmartPhone Pro" brand logo
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.roundedRect(14, 10, 12, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("P", 18, 18.5);

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text("SmartPhone Pro", 30, 19);

    // Add Report Title
    doc.setFontSize(14);
    doc.setTextColor(220, 38, 38); // Red-600
    doc.text("Negative Inventory Report", 14, 32);
    
    // Add Metadata (Date and Summary)
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 40);
    const totalShortageValue = stats.negativeStock.reduce((acc, item) => {
      const product = products.find(p => p.id === item.productId);
      const variation = product?.variations.find(v => v.id === item.variationId) as Variation & { price?: string };
      const price = variation?.price ? parseFloat(variation.price) : 500;
      return acc + (Math.abs(item.quantity) * price);
    }, 0);
    doc.text(`Total Discrepancies: ${stats.negativeStock.length} Items | Est. Value: $${totalShortageValue.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`, 14, 45);
    
    const tableColumn = ["Product Variation", "Location", "Qty", "Unit Price", "Total Value"];
    const tableRows = stats.negativeStock.map(item => {
      const product = products.find(p => p.id === item.productId);
      const variation = product?.variations.find(v => v.id === item.variationId) as Variation & { price?: string };
      const location = stats.locations.find(l => l.id === item.locationId);
      const unitPrice = variation?.price ? parseFloat(variation.price) : 500;
      const totalValue = Math.abs(item.quantity) * unitPrice;
      
      return [
        `${product?.name || 'Unknown Item'} ${variation ? `(${variation.storage} ${variation.color} ${variation.countryCode})` : ''}`,
        location?.name || 'Unknown Store',
        item.quantity % 1 !== 0 
          ? item.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
          : item.quantity.toLocaleString(),
        `$${unitPrice.toLocaleString(undefined, { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })}`,
        `$${totalValue.toLocaleString(undefined, { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })}`
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      headStyles: { fillColor: [220, 38, 38] }, // Match the red warning theme
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    doc.save(`Negative_Inventory_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const cards = [
    { 
      label: 'Total Stock Units', 
      value: stats.totalStock % 1 !== 0 
        ? stats.totalStock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
        : stats.totalStock.toLocaleString(), 
      icon: Package, 
      color: 'text-blue-600', bg: 'bg-blue-50', growth: 'Live Inventory' 
    },
    { 
      label: 'Estimated Value', 
      value: `$${stats.totalValue.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 
      icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', growth: 'Current Valuation' 
    },
    { 
      label: revenueTimeframe === 'monthly' ? 'Monthly Revenue' : 'Total Revenue', 
      value: `$${(revenueTimeframe === 'monthly' ? stats.monthlySales : stats.totalSales).toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 
      icon: ShoppingBag, color: 'text-purple-600', bg: 'bg-purple-50', growth: revenueTimeframe === 'monthly' ? 'This Month' : 'All Time' 
    },
    { label: 'Total Dealers', value: '145', icon: AlertCircle, color: 'text-slate-600', bg: 'bg-slate-100', growth: 'Active Partners' },
    { label: 'Customers', value: stats.totalStock > 0 ? '12.5k' : '0', icon: MapPin, color: 'text-green-600', bg: 'bg-green-50', growth: 'General Reach' },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Executive Summary</h1>
          <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Inventory Intelligence
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
          <button 
            onClick={() => setRevenueTimeframe('monthly')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              revenueTimeframe === 'monthly' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Monthly
          </button>
          <button 
            onClick={() => setRevenueTimeframe('total')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              revenueTimeframe === 'total' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Total
          </button>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 shrink-0">
        {cards.map((card, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-slate-500 font-medium">{card.label}</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{card.value}</h3>
            <p className={cn("text-xs mt-2 font-medium", card.color)}>{card.growth}</p>
          </div>
        ))}
      </div>

      {/* Negative Inventory Report */}
      {stats.negativeStock.length > 0 && (
        <div className="bg-white border-2 border-red-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-800 tracking-tight">Negative Inventory Report</h3>
                <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-0.5">Summary of oversold units requiring reconciliation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={exportNegativeStockToPDF}
                className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all flex items-center gap-2 shadow-sm active:scale-95"
              >
                <Download className="w-3 h-3" />
                Export PDF
              </button>
              <span className="text-[10px] font-black bg-red-600 text-white px-3 py-1 rounded-full uppercase animate-pulse">
                 {stats.negativeStock.length} Items To Resolve
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-widest font-bold text-slate-500 border-b border-slate-100">
                  <th className="px-8 py-3">Product Variation</th>
                  <th className="px-8 py-3">Location</th>
                  <th className="px-8 py-3 text-center">Current Shortage</th>
                  <th className="px-8 py-3 text-right">Inventory Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.negativeStock.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  const variation = product?.variations.find(v => v.id === item.variationId);
                  const location = stats.locations.find(l => l.id === item.locationId);
                  
                  return (
                    <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-8 py-4">
                        <div className="font-bold text-slate-800 text-sm">{product?.name || 'Unknown Item'}</div>
                        <div className="text-[10px] text-red-600 font-black uppercase tracking-widest mt-0.5">
                          {variation ? `${variation.storage} ${variation.color} (${variation.countryCode})` : 'Ref: ' + item.variationId}
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {location?.name || 'Unknown Store'}
                        </div>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="text-sm font-black text-red-600 tabular-nums bg-red-50 px-3 py-1 rounded-lg border border-red-100">
                          {item.quantity % 1 !== 0 
                            ? item.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                            : item.quantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <button 
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('switch-tab', { 
                              detail: { 
                                tab: 'transactions', 
                                type: 'PURCHASE',
                                productId: item.productId,
                                variationId: item.variationId,
                                suggestedQty: Math.abs(item.quantity)
                              } 
                            }));
                          }}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-sm active:scale-95 flex items-center gap-2 ml-auto"
                        >
                          <ShoppingBasket className="w-3 h-3" />
                          Resolve with Purchase
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Value by Location Chart */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Stock Value Distribution by Location
            </h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Valuation based on custom variation prices</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-600" />
              <span className="text-slate-600">Total Value ($)</span>
            </div>
          </div>
        </div>

        <div className="w-full" style={{ minHeight: 300, height: 300 }}>
          <ResponsiveContainer width="100%" height={300}>
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
                tickFormatter={(value) => `$${(value / 1000).toFixed(2)}k`}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{payload[0].payload.name}</p>
                        <p className="text-sm font-black">
                          ${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Yearly Sales Performance Chart */}
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Annual Sales Performance
              </h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Revenue Comparison by Month</p>
            </div>
          </div>

          <div className="w-full" style={{ minHeight: 300, height: 300 }}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.yearlySales} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
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
                  tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{payload[0].payload.name}</p>
                          <p className="text-sm font-black">${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Sales Distribution */}
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
          <div className="mb-8">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-purple-500" />
              Sales by Category
            </h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Revenue contribution per product type</p>
          </div>
          <div className="w-full" style={{ minHeight: 300, height: 300 }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categorySalesData}
                  cx="50%"
                  cy="50%"
                  innerRadius={82}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {categorySalesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-0.5em" className="fill-slate-400 font-bold text-[9px] uppercase tracking-[0.2em]">Total Rev</tspan>
                  <tspan x="50%" dy="1.4em" className="fill-slate-900 font-black text-lg">${stats.totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</tspan>
                </text>
                <Tooltip 
                  formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Revenue']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
