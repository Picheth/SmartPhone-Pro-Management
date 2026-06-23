import { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Search, 
  MapPin, 
  User, 
  TrendingUp,
  Tag,
  Calendar,
  Plus,
  X,
  Minus,
  Save,
  Package,
  ShieldCheck,
  CreditCard,
  Target
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  addDoc,
  serverTimestamp,
  doc,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction, Location, Product, Partner } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../auth/ToastContext'; // Import useToast

export default function Sales() {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [search, setSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [allowOverselling, setAllowOverselling] = useState(false);
  const { addToast } = useToast(); // Initialize useToast
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    referenceNo: `SLS-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    locationId: '',
    partnerId: '',
    paymentStatus: 'Paid' as 'Paid' | 'Partial' | 'Due',
    paymentMethod: 'Cash' as 'Cash' | 'Bank' | 'Credit',
    staffName: '',
    items: [] as any[]
  });

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('type', '==', 'SALE'), 
      orderBy('timestamp', 'desc'), 
      limit(50)
    );

    const unsubSettings = onSnapshot(doc(db, "settings", "inventory"), (snap) => {
      if (snap.exists()) setAllowOverselling(snap.data().allowOverselling);
    });

    const unsubSales = onSnapshot(q, (s) => {
      setSales(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transactions'));

    const unsubLocs = onSnapshot(collection(db, 'locations'), (s) => {
      const locs = s.docs.map(d => ({ id: d.id, ...d.data() } as Location));
      setLocations(locs);
      if (locs.length > 0) setForm(f => ({ ...f, locationId: locs[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));

    const unsubProducts = onSnapshot(collection(db, 'products'), (s) => {
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (s) => {
      const custs = s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Customer' } as Partner));
      setPartners(prev => {
        const others = prev.filter(p => p.type !== 'Customer');
        return [...others, ...custs];
      });
    }, (error) => handleFirestoreError(error, OperationType.GET, 'customers'));

    const unsubDealers = onSnapshot(collection(db, 'dealers'), (s) => {
      const deals = s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Dealer' } as Partner));
      setPartners(prev => {
        const others = prev.filter(p => p.type !== 'Dealer');
        return [...others, ...deals];
      });
    }, (error) => handleFirestoreError(error, OperationType.GET, 'dealers'));

    return () => {
      unsubSales();
      unsubLocs();
      unsubProducts();
      unsubCustomers();
      unsubDealers();
      unsubSettings();
    };
  }, []);

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', variationId: '', sku: '', quantity: 1, unitPrice: 0, tax: 0, warranty: '1 Year' }]
    }));
  };

  const removeItem = (idx: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setForm(prev => {
      const newItems = [...prev.items];
      newItems[idx] = { ...newItems[idx], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const calculateSubtotal = () => form.items.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);
  const calculateTax = () => form.items.reduce((acc, i) => acc + (i.tax || 0), 0);
  const calculateTotal = () => calculateSubtotal() + calculateTax();

  const handleSave = async () => {
    if (!form.locationId || !form.partnerId || !form.staffName.trim()) {
      addToast("Please fill out location, customer, and staff name.", "error");
      return;
    }

    if (form.items.length === 0 || form.items.some(i => i.quantity <= 0 || !i.productId || !i.variationId)) {
      addToast("Please ensure all items have a selected variation and positive quantity.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const partner = partners.find(p => p.id === form.partnerId);
        const stockChanges = new Map<string, {
          ref: ReturnType<typeof doc>;
          productId: string;
          variationId: string;
          quantity: number;
        }>();

        for (const item of form.items) {
          const stockDocId = `${form.locationId}_${item.variationId}`;
          const existing = stockChanges.get(stockDocId);

          stockChanges.set(stockDocId, {
            ref: doc(db, 'stock', stockDocId),
            productId: item.productId,
            variationId: item.variationId,
            quantity: (existing?.quantity || 0) + item.quantity
          });
        }

        const stockReads = new Map<string, any>();
        for (const [stockDocId, change] of stockChanges) {
          stockReads.set(stockDocId, await transaction.get(change.ref));
        }
        
        // 1. Transaction Doc
        const txData = {
          type: 'SALE',
          date: form.date,
          referenceNo: form.referenceNo,
          locationId: form.locationId,
          partnerId: form.partnerId,
          partnerName: partner?.name,
          partnerType: partner?.type,
          paymentStatus: form.paymentStatus,
          paymentMethod: form.paymentMethod,
          staffName: form.staffName,
          items: form.items.map(item => {
            const product = products.find(p => p.id === item.productId);
            return { ...item, productName: product?.name };
          }),
          taxAmount: calculateTax(),
          total: calculateTotal(),
          timestamp: serverTimestamp()
        };

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, txData);

        // 2. Adjust Stock (Subtract)
        for (const [stockDocId, change] of stockChanges) {
          const stockSnap = stockReads.get(stockDocId);

          if (stockSnap.exists()) {
             const currentQty = stockSnap.data().quantity;
             if (!allowOverselling && currentQty < change.quantity) {
                throw new Error(`Insufficient stock for variation: ${change.variationId}. Current stock: ${currentQty}. Overselling is disabled.`);
             }
             transaction.update(change.ref, {
                quantity: currentQty - change.quantity,
                lastUpdated: serverTimestamp()
             });
          } else {
             if (!allowOverselling) {
                throw new Error("Cannot sell item: No stock record found and overselling is disabled. Please add stock first.");
             }
             // Create the stock record with a negative value if it doesn't exist and overselling is on
             transaction.set(change.ref, {
                locationId: form.locationId,
                productId: change.productId,
                variationId: change.variationId,
                quantity: -change.quantity,
                lastUpdated: serverTimestamp()
             });
          }
        }
      });

      setIsAdding(false);
      setForm({
         ...form,
         referenceNo: `SLS-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
         items: [],
         staffName: ''
      });
      addToast("Sale recorded successfully!", "success");
    } catch (e) {
      console.error(e);
      addToast(e instanceof Error ? e.message : "Transaction failed.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSales = sales.filter(s => {
    const matchesSearch = s.partnerName?.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.referenceNo?.toLowerCase().includes(search.toLowerCase()) ||
      s.staffName.toLowerCase().includes(search.toLowerCase());
    
    const matchesPaymentStatus = paymentStatusFilter === 'all' || s.paymentStatus === paymentStatusFilter;
    const matchesLocation = locationFilter === 'all' || s.locationId === locationFilter; // Already exists
    const matchesStaff = staffFilter === 'all' || s.staffName === staffFilter;
    const matchesProduct = productFilter === 'all' || s.items.some(item => item.productName === productFilter);
    
    let matchesDate = true;
    if (startDate || endDate) {
      const saleDate = new Date(s.date || (s.timestamp?.seconds ? s.timestamp.seconds * 1000 : 0));
      if (startDate && saleDate < new Date(startDate)) matchesDate = false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (saleDate > end) matchesDate = false;
      }
    }

    return matchesSearch && matchesPaymentStatus && matchesLocation && matchesDate && matchesStaff && matchesProduct;
  });

  const uniqueStaff = Array.from(new Set(sales.map(s => s.staffName))).filter(Boolean).sort();
  const uniqueProductNames = Array.from(new Set(sales.flatMap(s => s.items.map(i => i.productName)))).filter(Boolean).sort();

  const exportToCSV = () => {
    const headers = ['Date', 'Reference', 'Customer', 'Type', 'Location', 'Items', 'Total Value', 'Payment Status', 'Sales Rep'];
    const rows = filteredSales.map(s => {
      const location = locations.find(l => l.id === s.locationId)?.name || 'N/A';
      const itemsList = s.items.map(i => `${i.quantity}x ${i.productName || 'Item'}`).join('; ');
      const totalValue = s.total || s.items.reduce((acc, i) => acc + (i.quantity * (i.unitPrice || 0)), 0);
      
      return [
        s.date || (s.timestamp?.seconds ? new Date(s.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'),
        s.referenceNo || s.id,
        s.partnerName || 'N/A',
        s.partnerType || 'N/A',
        location,
        itemsList,
        totalValue,
        s.paymentStatus,
        s.staffName
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Sales_Report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Sales Records</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Detailed history of customer sales</p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsAdding(true)}
            className="hidden sm:flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            New Sale
          </button>
        </div>
        <div className="flex flex-col xl:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
             <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 shadow-sm">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="date" 
                  className="py-1.5 text-[10px] font-bold uppercase outline-none bg-transparent"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-slate-300">-</span>
                <input 
                  type="date" 
                  className="py-1.5 text-[10px] font-bold uppercase outline-none bg-transparent"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
             </div>
             
             <select 
               className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition-all shadow-sm"
               value={locationFilter}
               onChange={(e) => setLocationFilter(e.target.value)}
             >
               <option value="all">All Locations</option>
               {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
             </select>

             <select 
               className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition-all shadow-sm"
               value={paymentStatusFilter}
               onChange={(e) => setPaymentStatusFilter(e.target.value)}
             >
               <option value="all">All Status</option>
               <option value="Paid">Paid</option>
               <option value="Partial">Partial</option>
               <option value="Due">Due</option>
             </select>

             <select 
               className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition-all shadow-sm"
               value={staffFilter}
               onChange={(e) => setStaffFilter(e.target.value)}
             >
               <option value="all">All Sales Reps</option>
               {uniqueStaff.map(s => <option key={s} value={s}>{s}</option>)}
             </select>

             <select 
               className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition-all shadow-sm"
               value={productFilter}
               onChange={(e) => setProductFilter(e.target.value)}
             >
               <option value="all">All Products</option>
               {uniqueProductNames.map(p => <option key={p} value={p}>{p}</option>)}
             </select>

             <button 
                onClick={exportToCSV}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-2 shadow-lg shadow-slate-800/10"
             >
                <Save className="w-3.5 h-3.5" />
                Export CSV
             </button>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              placeholder="Search customer or ID..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden mb-8"
          >
             <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                     <ShoppingBag className="w-6 h-6 text-white" />
                  </div>
                  <div>
                     <h2 className="text-xl font-black text-slate-800 tracking-tight">Record New Sale</h2>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Generating customer invoice & adjusting stock</p>
                  </div>
               </div>
               <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white rounded-full transition-colors border border-slate-100 shadow-sm">
                  <X className="w-5 h-5 text-slate-400" />
               </button>
            </div>

            <div className="p-8 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Sale Date</label>
                    <input 
                       type="date"
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-medium"
                       value={form.date}
                       onChange={e => setForm({...form, date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Reference Code</label>
                    <input 
                       type="text"
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-mono font-black text-emerald-700"
                       value={form.referenceNo}
                       onChange={e => setForm({...form, referenceNo: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Store/Origin</label>
                    <select 
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-medium"
                       value={form.locationId}
                       onChange={e => setForm({...form, locationId: e.target.value})}
                    >
                       <option value="">Select Location...</option>
                       {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Customer / Dealer</label>
                    <select 
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-medium"
                       value={form.partnerId}
                       onChange={e => setForm({...form, partnerId: e.target.value})}
                    >
                       <option value="">Select Account...</option>
                       {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Payment Status</label>
                    <select 
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-medium"
                       value={form.paymentStatus}
                       onChange={e => setForm({...form, paymentStatus: e.target.value as any})}
                    >
                       <option value="Paid">Paid Fully</option>
                       <option value="Partial">Partial Payment</option>
                       <option value="Due">Debt / Due</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Payment Channel</label>
                    <select 
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-medium"
                       value={form.paymentMethod}
                       onChange={e => setForm({...form, paymentMethod: e.target.value as any})}
                    >
                       <option value="Cash">Physical Cash</option>
                       <option value="Bank">Bank / Mobile App</option>
                       <option value="Credit">Store Credit</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 col-span-1 md:col-span-2">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1 tracking-wider">Sales Representative (By)</label>
                    <input 
                       type="text"
                       placeholder="Enter executor name..."
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 font-bold"
                       value={form.staffName}
                       onChange={e => setForm({...form, staffName: e.target.value})}
                    />
                  </div>
               </div>

               <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                     <h3 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-500" />
                        Cart Items
                     </h3>
                     <button 
                        onClick={addItem}
                        className="flex items-center gap-2 text-xs font-black text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100 hover:shadow-md transition-all active:scale-95"
                     >
                        <Plus className="w-4 h-4" />
                        Add Product
                     </button>
                  </div>

                  <div className="space-y-3">
                     {form.items.map((item, idx) => (
                        <div key={idx} className="flex flex-col lg:flex-row gap-4 p-5 bg-white border border-slate-200 rounded-2xl items-end lg:items-center shadow-sm hover:border-emerald-200 transition-colors">
                           <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter pl-1">Product Model</label>
                              <select 
                                 className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                                 value={`${item.productId}|${item.variationId}`}
                                 onChange={e => {
                                    const [pid, vid] = e.target.value.split('|');
                                    const product = products.find(p => p.id === pid);
                                    const variation = (product?.variations ?? []).find(v => v.id === vid);
                                    
                                    setForm(prev => {
                                       const newItems = [...prev.items];
                                       newItems[idx] = { 
                                          ...newItems[idx], 
                                          productId: pid, 
                                          variationId: vid, 
                                          sku: variation?.sku || '' 
                                       };
                                       return { ...prev, items: newItems };
                                    });
                                 }}
                              >
                                 <option value="|">Select...</option>
                                 {products.map(p => (
                                    <optgroup key={p.id} label={p.name}>
                                       {(p.variations ?? []).map(v => (
                                          <option key={v.id} value={`${p.id}|${v.id}`}>
                                             {v.storage} {v.color} ({v.countryCode})
                                          </option>
                                       ))}
                                    </optgroup>
                                 ))}
                              </select>
                           </div>
                           <div className="w-full lg:w-32 space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center block">SKU</label>
                              <input 
                                 type="text"
                                 className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none text-center font-mono font-bold"
                                 value={item.sku}
                                 onChange={e => updateItem(idx, 'sku', e.target.value)}
                              />
                           </div>
                           <div className="w-full lg:w-24 space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center block">Qty</label>
                              <input 
                                 type="number"
                                 className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none text-center font-black"
                                 value={item.quantity === 0 ? '' : item.quantity}
                                 onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value))}
                              />
                           </div>
                           <div className="w-full lg:w-32 space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center block">Unit Price</label>
                              <input 
                                 type="number"
                                 className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none text-center font-black text-emerald-600 font-mono"
                                 value={item.unitPrice === 0 ? '' : item.unitPrice}
                                 onChange={e => updateItem(idx, 'unitPrice', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                              />
                           </div>
                           <div className="w-full lg:w-32 space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center block">Tax</label>
                              <input 
                                 type="number"
                                 className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none text-center font-bold"
                                 value={item.tax === 0 ? '' : item.tax}
                                 onChange={e => updateItem(idx, 'tax', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                              />
                           </div>
                           <div className="w-full lg:w-40 space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center block underline decoration-emerald-500/30">Warranty Period</label>
                              <input 
                                 type="text"
                                 placeholder="e.g. 1 Year"
                                 className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none text-center font-bold italic text-slate-600"
                                 value={item.warranty}
                                 onChange={e => updateItem(idx, 'warranty', e.target.value)}
                              />
                           </div>
                           <div className="w-full lg:w-40 space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center block">Subtotal</label>
                              <div className="p-2.5 text-xs font-black text-emerald-700 text-center bg-emerald-50 rounded-xl border border-emerald-100 font-mono">
                                 ${(item.quantity * item.unitPrice + (item.tax || 0)).toLocaleString()}
                              </div>
                           </div>
                           <button onClick={() => removeItem(idx)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                              <Minus className="w-5 h-5" />
                           </button>
                        </div>
                     ))}
                  </div>

                  {form.items.length > 0 && (
                    <div className="flex flex-col md:flex-row gap-8 mt-10 p-8 bg-slate-900 rounded-[2rem] text-white shadow-3xl relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/10 blur-3xl rounded-full" />
                       <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-8">
                          <div>
                             <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-2">Cart Value</p>
                             <p className="text-xl font-bold font-mono">${calculateSubtotal().toLocaleString()}</p>
                          </div>
                          <div>
                             <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-2">Collected Tax</p>
                             <p className="text-xl font-bold font-mono text-emerald-400">${calculateTax().toLocaleString()}</p>
                          </div>
                          <div className="col-span-2 lg:col-span-1 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-slate-800 pt-6 lg:pt-0 lg:pl-10">
                             <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.2em] mb-1">Grand Total (Receive)</p>
                             <p className="text-3xl font-black font-mono text-white tracking-tight">${calculateTotal().toLocaleString()}</p>
                          </div>
                       </div>
                       <div className="flex flex-col sm:flex-row items-center gap-4">
                          <button 
                             onClick={() => setIsAdding(false)}
                             className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-sm font-black transition-all border border-slate-700"
                          >
                             Cancel
                          </button>
                          <button 
                             onClick={handleSave}
                             disabled={isSaving}
                             className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 rounded-2xl text-sm font-black shadow-2xl shadow-emerald-600/30 active:scale-95 transition-all text-white"
                          >
                             {isSaving ? <TrendingUp className="w-5 h-5 animate-bounce" /> : <Save className="w-5 h-5" />}
                             {isSaving ? 'Processing...' : 'Finalize Sale'}
                          </button>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-widest font-bold text-slate-500 border-b border-slate-100 text-center">
                <th className="px-8 py-4 text-left">Date & Reference</th>
                <th className="px-8 py-4 text-left">Customer / Dealer</th>
                <th className="px-8 py-4">Location</th>
                <th className="px-8 py-4">Items Sold</th>
                <th className="px-8 py-4">Total Value</th>
                <th className="px-8 py-4">Payment Status</th>
                <th className="px-8 py-4 text-right">Sales Rep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map(sale => {
                const totalValue = sale.total || sale.items.reduce((acc, i) => acc + (i.quantity * (i.unitPrice || 0)), 0);
                return (
                  <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <Calendar className="w-3 h-3 text-emerald-500" />
                          {sale.date || (sale.timestamp?.seconds ? new Date(sale.timestamp.seconds * 1000).toLocaleDateString() : 'N/A')}
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-4.5">
                          #{sale.referenceNo || sale.id.slice(0, 8)}
                        </p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{sale.partnerName}</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase">{sale.partnerType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-center">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 w-fit">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {locations.find(l => l.id === sale.locationId)?.name || 'Central Store'}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1">
                          {sale.items.reduce((acc, i) => acc + i.quantity, 0)} Units Sold
                        </p>
                        <div className="flex flex-col items-center gap-1">
                          {sale.items.slice(0, 2).map((item, idx) => (
                             <span key={idx} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase w-fit">
                                {item.quantity}x @ ${item.unitPrice?.toLocaleString() || '0'}
                             </span>
                          ))}
                          {sale.items.length > 2 && (
                             <span className="text-[9px] text-slate-400 font-bold italic">+{sale.items.length - 2} more</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <p className="text-sm font-black text-emerald-600 italic">
                        ${totalValue.toLocaleString()}
                      </p>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                        sale.paymentStatus === 'Paid' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                        sale.paymentStatus === 'Partial' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                        "bg-red-100 text-red-700 border border-red-200"
                      )}>
                        {sale.paymentStatus}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <p className="text-xs font-black text-slate-800">{sale.staffName}</p>
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-60">
                        <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">Verified Sale</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredSales.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-slate-300">
              <ShoppingBag className="w-12 h-12 mb-4 opacity-10" />
              <p className="text-sm font-bold uppercase tracking-widest italic opacity-40">No sales transactions documented</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
