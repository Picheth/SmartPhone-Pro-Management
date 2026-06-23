import { useState, useEffect } from 'react';
import { 
  ShoppingBasket, 
  Search, 
  MapPin, 
  User, 
  TrendingDown,
  Truck,
  Calendar,
  Plus,
  X,
  Minus,
  Save,
  Package,
  CreditCard,
  CheckCircle2,
  AlertCircle
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
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction, Location, Product, Partner, PurchaseOrder } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { FileText } from 'lucide-react';
import { useToast } from '../auth/ToastContext';

export default function Purchases() {
  const [purchases, setPurchases] = useState<Transaction[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [search, setSearch] = useState('');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();

  // Form State
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    referenceNo: `PUR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    locationId: '',
    partnerId: '',
    purchaseStatus: 'Received' as 'Ordered' | 'Pending' | 'Received',
    paymentStatus: 'Paid' as 'Paid' | 'Partial' | 'Due',
    paymentMethod: 'Cash' as 'Cash' | 'Bank' | 'Credit',
    staffName: '',
    items: [] as any[]
  });

  const [orderForm, setOrderForm] = useState({
    date: new Date().toISOString().split('T')[0],
    referenceNo: `PO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    locationId: '',
    partnerId: '',
    staffName: '',
    items: [] as any[]
  });

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('type', '==', 'PURCHASE'), 
      orderBy('timestamp', 'desc'), 
      limit(50)
    );

    const unsubPurchases = onSnapshot(q, (s) => {
      setPurchases(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transactions'));

    const unsubLocs = onSnapshot(collection(db, 'locations'), (s) => {
      const locs = s.docs.map(d => ({ id: d.id, ...d.data() } as Location));
      setLocations(locs);
      if (locs.length > 0) setForm(f => ({ ...f, locationId: locs[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));

    const unsubProducts = onSnapshot(collection(db, 'products'), (s) => {
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    const unsubPartners = onSnapshot(collection(db, 'suppliers'), (s) => {
      setPartners(s.docs.map(d => ({ id: d.id, ...d.data() } as Partner)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));

    return () => {
      unsubPurchases();
      unsubLocs();
      unsubProducts();
      unsubPartners();
    };
  }, []);

  const addItem = (isOrder = false) => {
    if (isOrder) {
      setOrderForm(prev => ({
        ...prev,
        items: [...prev.items, { productId: '', variationId: '', quantity: 1, price: 0, tax: 0 }]
      }));
    } else {
      setForm(prev => ({
        ...prev,
        items: [...prev.items, { productId: '', variationId: '', quantity: 1, price: 0, tax: 0 }]
      }));
    }
  };

  const removeItem = (idx: number, isOrder = false) => {
    if (isOrder) {
      setOrderForm(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== idx)
      }));
    } else {
      setForm(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== idx)
      }));
    }
  };

  const updateItem = (idx: number, field: string, value: any, isOrder = false) => {
    if (isOrder) {
      setOrderForm(prev => {
        const newItems = [...prev.items];
        newItems[idx] = { ...newItems[idx], [field]: value };
        return { ...prev, items: newItems };
      });
    } else {
      setForm(prev => {
        const newItems = [...prev.items];
        newItems[idx] = { ...newItems[idx], [field]: value };
        return { ...prev, items: newItems };
      });
    }
  };

  const handleProductSelect = (idx: number, pid: string, vid: string, isOrder = false) => {
    // Find last cost from purchase history
    const lastPurchaseWithItem = purchases.find(p => 
      p.items.some(item => item.productId === pid && item.variationId === vid)
    );
    
    const lastPrice = lastPurchaseWithItem?.items.find(item => 
      item.productId === pid && item.variationId === vid
    )?.price || 0;

    if (isOrder) {
      setOrderForm(prev => {
        const newItems = [...prev.items];
        newItems[idx] = { 
          ...newItems[idx], 
          productId: pid, 
          variationId: vid, 
          price: lastPrice 
        };
        return { ...prev, items: newItems };
      });
    } else {
      setForm(prev => {
        const newItems = [...prev.items];
        newItems[idx] = { 
          ...newItems[idx], 
          productId: pid, 
          variationId: vid, 
          price: lastPrice 
        };
        return { ...prev, items: newItems };
      });
    }
  };

  const calculateSubtotal = (isOrder = false) => {
    const items = isOrder ? orderForm.items : form.items;
    return items.reduce((acc, i) => acc + (i.quantity * i.price), 0);
  };
  const calculateTax = (isOrder = false) => {
    const items = isOrder ? orderForm.items : form.items;
    return items.reduce((acc, i) => acc + (i.tax || 0), 0);
  };
  const calculateTotal = (isOrder = false) => calculateSubtotal(isOrder) + calculateTax(isOrder);

  const handleSaveOrder = async () => {
    if (!orderForm.locationId || !orderForm.partnerId || orderForm.items.length === 0 || !orderForm.staffName) {
      addToast("Please fill in all required fields and add at least one item.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const partner = partners.find(p => p.id === orderForm.partnerId);
      const purchaseOrderData = {
        date: orderForm.date,
        referenceNo: orderForm.referenceNo,
        locationId: orderForm.locationId,
        partnerId: orderForm.partnerId,
        partnerName: partner?.name || '',
        staffName: orderForm.staffName,
        status: 'Draft',
        items: orderForm.items.map(item => {
          const product = products.find(p => p.id === item.productId);
          return {
            ...item,
            productName: product?.name || ''
          };
        }),
        taxAmount: calculateTax(true),
        total: calculateTotal(true),
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, 'purchase_orders'), purchaseOrderData);
      
      setIsAddingOrder(false);
      setOrderForm({
        date: new Date().toISOString().split('T')[0],
        referenceNo: `PO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        locationId: '',
        partnerId: '',
        staffName: '',
        items: []
      });
      addToast(`Purchase Order ${orderForm.referenceNo} created successfully!`, "success");
    } catch (e) {
      console.error(e);
      addToast("Failed to create Purchase Order.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.locationId || !form.partnerId || !form.staffName.trim()) {
      addToast("Please fill in location, supplier, and staff name.", "error");
      return;
    }

    if (form.items.length === 0 || form.items.some(i => i.quantity <= 0 || !i.productId || !i.variationId)) {
      addToast("Please add items with valid variations and positive quantities.", "error");
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
        
        // 1. Transaction Log
        const txData = {
          type: 'PURCHASE',
          date: form.date,
          referenceNo: form.referenceNo,
          locationId: form.locationId,
          partnerId: form.partnerId,
          partnerName: partner?.name,
          partnerType: 'Supplier',
          purchaseStatus: form.purchaseStatus,
          paymentStatus: form.paymentStatus,
          paymentMethod: form.paymentMethod,
          staffName: form.staffName,
          items: form.items.map(item => {
            const product = products.find(p => p.id === item.productId);
            return {
              ...item,
              productName: product?.name
            };
          }),
          taxAmount: calculateTax(),
          total: calculateTotal(),
          timestamp: serverTimestamp()
        };

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, txData);

        // 2. Update Stock Levels
        for (const [stockDocId, change] of stockChanges) {
          const stockSnap = stockReads.get(stockDocId);

          if (stockSnap.exists()) {
            transaction.update(change.ref, {
              quantity: stockSnap.data().quantity + change.quantity,
              lastUpdated: serverTimestamp()
            });
          } else {
            transaction.set(change.ref, {
              locationId: form.locationId,
              productId: change.productId,
              variationId: change.variationId,
              quantity: change.quantity,
              lastUpdated: serverTimestamp()
            });
          }
        }
      });

      setIsAdding(false);
      setForm({
        ...form,
        referenceNo: `PUR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        items: [],
        staffName: ''
      });
      addToast(`Purchase ${form.referenceNo} recorded & stock updated!`, "success");
    } catch (e: any) {
      console.error(e);
      addToast(e?.message || "Failed to save purchase. Check console for details.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPurchases = purchases.filter(p => {
    const matchesSearch = p.partnerName?.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.referenceNo?.toLowerCase().includes(search.toLowerCase()) ||
      p.staffName.toLowerCase().includes(search.toLowerCase());
    
    const matchesPurchaseStatus = purchaseStatusFilter === 'all' || p.purchaseStatus === purchaseStatusFilter;
    const matchesPaymentStatus = paymentStatusFilter === 'all' || p.paymentStatus === paymentStatusFilter;
    const matchesLocation = locationFilter === 'all' || p.locationId === locationFilter;

    let matchesDate = true;
    if (startDate || endDate) {
      const purchaseDate = new Date(p.date || (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : 0));
      if (startDate && purchaseDate < new Date(startDate)) matchesDate = false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (purchaseDate > end) matchesDate = false;
      }
    }

    return matchesSearch && matchesPurchaseStatus && matchesPaymentStatus && matchesLocation && matchesDate;
  });

  const exportToCSV = () => {
    const headers = [
      'Purchase ID', 'Reference No', 'Date', 'Supplier', 'Supplier Type', 
      'Location', 'Items', 'Total Cost', 'Purchase Status', 'Payment Status', 
      'Payment Method', 'Staff Name'
    ];
    const rows = filteredPurchases.map(p => {
      const location = locations.find(l => l.id === p.locationId)?.name || 'N/A';
      const itemsList = p.items.map(item => 
        `${item.quantity}x ${products.find(prod => prod.id === item.productId)?.name || 'Unknown Product'} (${item.price?.toLocaleString() || '0'})`
      ).join('; ');
      
      return [
        p.id,
        p.referenceNo || 'N/A',
        p.date || (p.timestamp?.seconds ? new Date(p.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'),
        p.partnerName || 'N/A',
        p.partnerType || 'N/A',
        location,
        itemsList,
        p.total?.toLocaleString() || '0',
        p.purchaseStatus || 'N/A',
        p.paymentStatus || 'N/A',
        p.paymentMethod || 'N/A',
        p.staffName
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchases_Report_${new Date().toISOString().split('T')[0]}.csv`);
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
            <div className="w-10 h-10 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-center">
              <ShoppingBasket className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Purchase History</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Procurement logs from suppliers</p>
            </div>
          </div>

          <button 
            onClick={() => setIsAdding(true)}
            className="hidden sm:flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            New Purchase
          </button>

          <button 
            onClick={() => setIsAddingOrder(true)}
            className="hidden sm:flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-slate-800/20 hover:bg-slate-900 transition-all active:scale-95"
          >
            <FileText className="w-3.5 h-3.5" />
            Create PO
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

             <button 
                onClick={exportToCSV}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-2 shadow-lg shadow-slate-800/10"
             >
                <Save className="w-3.5 h-3.5" />
                Export CSV
             </button>

            <select 
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition-all shadow-sm"
              value={purchaseStatusFilter}
              onChange={(e) => setPurchaseStatusFilter(e.target.value)}
            >
              <option value="all">All Purchase Status</option>
              <option value="Ordered">Ordered</option>
              <option value="Pending">Pending</option>
              <option value="Received">Received</option>
            </select>
            <select 
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition-all shadow-sm"
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
            >
              <option value="all">All Payment Status</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Due">Due</option>
            </select>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              placeholder="Search supplier or Ref..."
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
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden mb-8"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-50/30">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                     <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                     <h2 className="text-lg font-black text-slate-800 tracking-tight">Log New Purchase</h2>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Entering procurement details</p>
                  </div>
               </div>
               <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
               </button>
            </div>

            <div className="p-8 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Purchase Date</label>
                    <input 
                       type="date"
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.date}
                       onChange={e => setForm({...form, date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Reference No</label>
                    <input 
                       type="text"
                       placeholder="PUR-XXXXXX"
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-mono font-bold"
                       value={form.referenceNo}
                       onChange={e => setForm({...form, referenceNo: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Destination Location</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.locationId}
                       onChange={e => setForm({...form, locationId: e.target.value})}
                    >
                       <option value="">Select Location...</option>
                       {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Supplier</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.partnerId}
                       onChange={e => setForm({...form, partnerId: e.target.value})}
                    >
                       <option value="">Select Supplier...</option>
                       {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Purchase Status</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.purchaseStatus}
                       onChange={e => setForm({...form, purchaseStatus: e.target.value as any})}
                    >
                       <option value="Ordered">Ordered</option>
                       <option value="Pending">Pending</option>
                       <option value="Received">Received</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Payment Status</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.paymentStatus}
                       onChange={e => setForm({...form, paymentStatus: e.target.value as any})}
                    >
                       <option value="Paid">Paid</option>
                       <option value="Partial">Partial</option>
                       <option value="Due">Due</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Payment Method</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.paymentMethod}
                       onChange={e => setForm({...form, paymentMethod: e.target.value as any})}
                    >
                       <option value="Cash">Cash</option>
                       <option value="Bank">Bank Transfer</option>
                       <option value="Credit">Credit</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Performed By</label>
                    <input 
                       type="text"
                       placeholder="Your Name"
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={form.staffName}
                       onChange={e => setForm({...form, staffName: e.target.value})}
                    />
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <Package className="w-3.5 h-3.5" />
                       Product Items
                    </h3>
                    <button 
                       onClick={() => addItem()}
                       className="flex items-center gap-2 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                       <Plus className="w-3.5 h-3.5" />
                       Add Item
                    </button>
                  </div>

                  <div className="space-y-2">
                     {form.items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-9 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl items-center">
                           <div className="md:col-span-2 lg:col-span-3 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Product & Variation</label>
                              <select 
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none"
                                 value={`${item.productId}|${item.variationId}`}
                                 onChange={e => {
                                    const [pid, vid] = e.target.value.split('|');
                                    handleProductSelect(idx, pid, vid);
                                 }}
                              >
                                 <option value="|">Select Product...</option>
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
                           <div className="lg:col-span-1 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Qty</label>
                              <input 
                                 type="number"
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold"
                                 value={item.quantity === 0 ? '' : item.quantity}
                                 onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value))}
                              />
                           </div>
                           <div className="lg:col-span-1 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Unit Cost</label>
                              <input 
                                 type="number"
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold text-blue-600 font-mono"
                                 value={item.price === 0 ? '' : item.price}
                                 onChange={e => updateItem(idx, 'price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                              />
                           </div>
                           <div className="lg:col-span-1 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Tax</label>
                              <input 
                                 type="number"
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold"
                                 value={item.tax === 0 ? '' : item.tax}
                                 onChange={e => updateItem(idx, 'tax', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                              />
                           </div>
                           <div className="lg:col-span-2 space-y-1 px-4">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Sub-total</label>
                              <div className="text-xs font-black text-slate-800 text-center py-2 bg-white rounded border border-slate-100">
                                 ${(item.quantity * item.price + (item.tax || 0)).toLocaleString()}
                              </div>
                           </div>
                           <div className="flex justify-center">
                              <button onClick={() => removeItem(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                 <Minus className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                     ))}
                  </div>

                  {form.items.length > 0 && (
                    <div className="flex flex-col md:flex-row gap-6 mt-8 p-6 bg-slate-900 rounded-2xl text-white shadow-2xl">
                       <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-6">
                          <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Sub-total Cost</p>
                             <p className="text-xl font-black font-mono">${calculateSubtotal().toLocaleString()}</p>
                          </div>
                          <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Tax Amount</p>
                             <p className="text-xl font-black font-mono text-blue-400">${calculateTax().toLocaleString()}</p>
                          </div>
                          <div className="col-span-2 lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-6">
                             <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Grand Total</p>
                             <p className="text-2xl font-black font-mono text-white">${calculateTotal().toLocaleString()}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-3">
                          <button 
                             onClick={() => setIsAdding(false)}
                             className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold transition-all"
                          >
                             Discard
                          </button>
                          <button 
                             onClick={handleSave}
                             disabled={isSaving}
                             className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-black shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
                          >
                             {isSaving ? <TrendingDown className="w-4 h-4 animate-bounce" /> : <Save className="w-4 h-4" />}
                             {isSaving ? 'Processing...' : 'Complete Purchase'}
                          </button>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingOrder && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden mb-8"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                     <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                     <h2 className="text-lg font-black text-slate-800 tracking-tight">Create Purchase Order</h2>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Drafting new procurement request</p>
                  </div>
               </div>
               <button onClick={() => setIsAddingOrder(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
               </button>
            </div>

            <div className="p-8 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Order Date</label>
                    <input 
                       type="date"
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={orderForm.date}
                       onChange={e => setOrderForm({...orderForm, date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">PO Reference</label>
                    <input 
                       type="text"
                       placeholder="PO-XXXXXX"
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-mono font-bold"
                       value={orderForm.referenceNo}
                       onChange={e => setOrderForm({...orderForm, referenceNo: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Target Location</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={orderForm.locationId}
                       onChange={e => setOrderForm({...orderForm, locationId: e.target.value})}
                    >
                       <option value="">Select Location...</option>
                       {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Supplier</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={orderForm.partnerId}
                       onChange={e => setOrderForm({...orderForm, partnerId: e.target.value})}
                    >
                       <option value="">Select Supplier...</option>
                       {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 pl-1">Created By</label>
                    <input 
                       type="text"
                       placeholder="Your Name"
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={orderForm.staffName}
                       onChange={e => setOrderForm({...orderForm, staffName: e.target.value})}
                    />
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <Package className="w-3.5 h-3.5" />
                       Requested Items
                    </h3>
                    <button 
                       onClick={() => addItem(true)}
                       className="flex items-center gap-2 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                       <Plus className="w-3.5 h-3.5" />
                       Add Item
                    </button>
                  </div>

                  <div className="space-y-2">
                     {orderForm.items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-9 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl items-center">
                           <div className="md:col-span-2 lg:col-span-3 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Product & Variation</label>
                              <select 
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none"
                                 value={`${item.productId}|${item.variationId}`}
                                 onChange={e => {
                                    const [pid, vid] = e.target.value.split('|');
                                    handleProductSelect(idx, pid, vid, true);
                                 }}
                              >
                                 <option value="|">Select Product...</option>
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
                           <div className="lg:col-span-1 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Qty</label>
                              <input 
                                 type="number"
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold"
                                 value={item.quantity === 0 ? '' : item.quantity}
                                 onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value), true)}
                              />
                           </div>
                           <div className="lg:col-span-1 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Unit Cost</label>
                              <input 
                                 type="number"
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold text-emerald-600 font-mono"
                                 value={item.price === 0 ? '' : item.price}
                                 onChange={e => updateItem(idx, 'price', e.target.value === '' ? 0 : parseFloat(e.target.value), true)}
                              />
                           </div>
                           <div className="lg:col-span-1 space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Tax</label>
                              <input 
                                 type="number"
                                 className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold"
                                 value={item.tax === 0 ? '' : item.tax}
                                 onChange={e => updateItem(idx, 'tax', e.target.value === '' ? 0 : parseFloat(e.target.value), true)}
                              />
                           </div>
                           <div className="lg:col-span-2 space-y-1 px-4">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center block">Sub-total</label>
                              <div className="text-xs font-black text-slate-800 text-center py-2 bg-white rounded border border-slate-100">
                                 ${(item.quantity * item.price + (item.tax || 0)).toLocaleString()}
                              </div>
                           </div>
                           <div className="flex justify-center">
                              <button onClick={() => removeItem(idx, true)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                 <Minus className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                     ))}
                  </div>

                  {orderForm.items.length > 0 && (
                    <div className="flex flex-col md:flex-row gap-6 mt-8 p-6 bg-slate-900 rounded-2xl text-white shadow-2xl">
                       <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-6">
                          <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Estimated Cost</p>
                             <p className="text-xl font-black font-mono">${calculateSubtotal(true).toLocaleString()}</p>
                          </div>
                          <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Estimated Tax</p>
                             <p className="text-xl font-black font-mono text-emerald-400">${calculateTax(true).toLocaleString()}</p>
                          </div>
                          <div className="col-span-2 lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-6">
                             <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">Total Order Value</p>
                             <p className="text-2xl font-black font-mono text-white">${calculateTotal(true).toLocaleString()}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-3">
                          <button 
                             onClick={() => setIsAddingOrder(false)}
                             className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold transition-all"
                          >
                             Discard
                          </button>
                          <button 
                             onClick={handleSaveOrder}
                             disabled={isSaving}
                             className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded-xl text-sm font-black shadow-xl shadow-emerald-600/20 active:scale-95 transition-all"
                          >
                             {isSaving ? <TrendingDown className="w-4 h-4 animate-bounce" /> : <Save className="w-4 h-4" />}
                             {isSaving ? 'Processing...' : 'Create Order'}
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
              <tr className="bg-slate-50 text-[10px] uppercase tracking-widest font-bold text-slate-500 border-b border-slate-100">
                <th className="px-8 py-4">Procurement ID</th>
                <th className="px-8 py-4">Supplier/Source</th>
                <th className="px-8 py-4">Inventory Destination</th>
                <th className="px-8 py-4 text-center">Items (Unit Price)</th>
                <th className="px-8 py-4 text-center">Total Cost</th>
                <th className="px-8 py-4">Purchase Status</th>
                <th className="px-8 py-4">Payment Status</th>
                <th className="px-8 py-4 text-right">Executor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPurchases.map(purchase => {
                const totalValue = purchase.total || purchase.items.reduce((acc, i) => acc + (i.quantity * (i.price || 0)), 0);
                return (
                  <tr key={purchase.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">#{purchase.referenceNo || purchase.id.slice(0, 8)}</p>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {purchase.date || (purchase.timestamp?.seconds ? new Date(purchase.timestamp.seconds * 1000).toLocaleDateString() : 'N/A')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{purchase.partnerName}</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{purchase.partnerType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 w-fit">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {locations.find(l => l.id === purchase.locationId)?.name || 'Main Warehouse'}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-900">
                          {purchase.items.reduce((acc, i) => acc + i.quantity, 0)} Units Incoming
                        </p>
                        <div className="flex flex-col items-center gap-1">
                          {purchase.items.slice(0, 2).map((item, idx) => (
                             <span key={idx} className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase border border-emerald-100">
                                {item.quantity}x @ ${item.price?.toLocaleString() || '0'}
                             </span>
                          ))}
                          {purchase.items.length > 2 && (
                             <span className="text-[9px] text-slate-400 font-bold italic">+{purchase.items.length - 2} items</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <p className="text-sm font-black text-blue-600 italic">
                        ${totalValue.toLocaleString()}
                      </p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                        purchase.purchaseStatus === 'Received' ? "bg-emerald-100 text-emerald-700" :
                        purchase.purchaseStatus === 'Pending' ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      )}>
                        {purchase.purchaseStatus}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                        purchase.paymentStatus === 'Paid' ? "bg-emerald-100 text-emerald-700" :
                        purchase.paymentStatus === 'Partial' ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {purchase.paymentStatus}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <p className="text-xs font-bold text-slate-800">{purchase.staffName}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <TrendingDown className="w-3 h-3 text-blue-500" />
                        <span className="text-[9px] font-black uppercase text-blue-500 tracking-widest">Entry Confirmed</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredPurchases.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-slate-300">
              <ShoppingBasket className="w-12 h-12 mb-4 opacity-10" />
              <p className="text-sm font-bold uppercase tracking-widest italic opacity-40">No purchase records found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
