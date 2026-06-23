import { useState, useEffect } from 'react';
import { 
  ArrowRightLeft, 
  Plus, 
  Minus, 
  ArrowRight, 
  Search, 
  History, 
  MapPin, 
  User, 
  Smartphone,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  runTransaction, 
  doc, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Product, 
  Transaction, 
  Supplier, 
  Customer, 
  Dealer, 
  Variation, 
  TransactionType,
  Location
} from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Transactions({ staffName }: { staffName: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<{ id: string, name: string, type: string, code: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [allowOverselling, setAllowOverselling] = useState(false);
  const [txType, setTxType] = useState<TransactionType>('SALE');
  
  // Transaction Form
  const [form, setForm] = useState({
    locationId: '',
    partnerId: '',
    referenceNo: '',
    purchaseStatus: 'Received' as any,
    paymentStatus: 'Paid' as any,
    paymentMethod: 'Cash' as any,
    date: new Date().toISOString().split('T')[0],
    items: [] as any[]
  });

  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    const handleSwitch = (e: any) => {
      if (e.detail.type) {
        const { type, productId, variationId, suggestedQty } = e.detail;
        setTxType(type);
        setForm(f => ({ 
          ...f, 
          referenceNo: `REF-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          items: productId && variationId ? [
            { 
              productId, 
              variationId, 
              quantity: suggestedQty || 1, 
              price: 0, 
              tax: 0, 
              warranty: '1 Year' 
            }
          ] : []
        }));
        setIsAdding(true);
      }
    };
    window.addEventListener('switch-tab', handleSwitch);

    const unsubSettings = onSnapshot(doc(db, "settings", "inventory"), (snap) => {
      if (snap.exists()) setAllowOverselling(snap.data().allowOverselling);
    });
    
    const unsubProducts = onSnapshot(collection(db, 'products'), (s) => 
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
      (error) => handleFirestoreError(error, OperationType.GET, 'products')
    );
    
    // Combining partners
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Supplier' }));
      setPartners(prev => [...prev.filter(p => p.type !== 'Supplier'), ...data as any]);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Customer' }));
      setPartners(prev => [...prev.filter(p => p.type !== 'Customer'), ...data as any]);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'customers'));

    const unsubDealers = onSnapshot(collection(db, 'dealers'), (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Dealer' }));
      setPartners(prev => [...prev.filter(p => p.type !== 'Dealer'), ...data as any]);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'dealers'));

    const unsubLocs = onSnapshot(collection(db, 'locations'), (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() } as Location));
        setLocations(data);
        if (data.length > 0) setForm(prev => ({ ...prev, locationId: data[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));

    const q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(15));
    const unsubTx = onSnapshot(q, (s) => {
      setRecentTxs(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transactions'));

    return () => { 
      window.removeEventListener('switch-tab', handleSwitch);
      unsubProducts();
      unsubSuppliers(); 
      unsubCustomers(); 
      unsubDealers(); 
      unsubTx(); 
      unsubLocs(); 
      unsubSettings();
    };
  }, []);

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', variationId: '', quantity: 1, price: 0, tax: 0, warranty: '1 Year' }]
    }));
  };

  const removeItem = (index: number) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const updateItem = (index: number, field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  const submitTransaction = async () => {
    if (!form.partnerId) {
      alert("Please select a partner.");
      return;
    }

    if (form.items.length === 0 || form.items.some(i => i.quantity <= 0 || !i.productId || !i.variationId)) {
      alert("Please ensure all line items have a selected product and positive quantity.");
      return;
    }
    
    const partner = partners.find(p => p.id === form.partnerId);
    
    try {
      await runTransaction(db, async (transaction) => {
        const stockChanges = new Map<string, {
          productId: string;
          variationId: string;
          quantity: number;
        }>();

        for (const item of form.items) {
          const stockDocId = `${form.locationId}_${item.variationId}`;
          const existing = stockChanges.get(stockDocId);
          const change = txType === 'PURCHASE' ? item.quantity : -item.quantity;

          stockChanges.set(stockDocId, {
            productId: item.productId,
            variationId: item.variationId,
            quantity: (existing?.quantity || 0) + change
          });
        }

        const stockReads = new Map<string, any>();
        for (const stockDocId of stockChanges.keys()) {
          const stockRef = doc(db, 'stock', stockDocId);
          stockReads.set(stockDocId, {
            ref: stockRef,
            snap: await transaction.get(stockRef)
          });
        }

        // 1. Log Transaction
        const totalTax = form.items.reduce((acc, item) => acc + (item.tax || 0), 0);
        const grandTotal = form.items.reduce((acc, item) => acc + (item.quantity * item.price) + (item.tax || 0), 0);

        const txData = {
          type: txType,
          referenceNo: form.referenceNo,
          items: form.items.map(item => {
             const product = products.find(p => p.id === item.productId);
             return {
               ...item,
               productName: product?.name || 'Unknown'
             };
          }),
          locationId: form.locationId,
          partnerId: form.partnerId,
          partnerName: partner?.name,
          partnerType: partner?.type,
          staffName,
          timestamp: serverTimestamp(),
          date: form.date,
          purchaseStatus: txType === 'PURCHASE' ? form.purchaseStatus : null,
          paymentStatus: form.paymentStatus,
          paymentMethod: form.paymentMethod,
          taxAmount: totalTax,
          total: grandTotal
        };

        // 2. Update Stocks
        for (const [stockDocId, change] of stockChanges) {
          const { ref: stockRef, snap: stockSnap } = stockReads.get(stockDocId);
          
          let currentQty = 0;
          if (stockSnap.exists()) {
            currentQty = stockSnap.data().quantity || 0;
          }

          const newQty = currentQty + change.quantity;

          if (!allowOverselling && txType === 'SALE' && newQty < 0) {
            throw new Error(`Insufficient stock for variation: ${change.variationId}`);
          }
          
          transaction.set(stockRef, {
            locationId: form.locationId,
            variationId: change.variationId,
            productId: change.productId,
            quantity: newQty,
            lastUpdated: serverTimestamp()
          }, { merge: true });
        }

        const newTxRef = doc(collection(db, 'transactions'));
        transaction.set(newTxRef, txData);
      });

      setIsAdding(false);
      setForm({ 
        locationId: locations[0]?.id || '', 
        partnerId: '', 
        referenceNo: '', 
        purchaseStatus: 'Received', 
        paymentStatus: 'Paid', 
        paymentMethod: 'Cash',
        date: new Date().toISOString().split('T')[0],
        items: [] 
      });
    } catch (e) {
      console.error("Transaction failed:", e);
      alert(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center">
              <History className="w-5 h-5 text-slate-400" />
           </div>
           <h2 className="text-xl font-bold text-slate-800 tracking-tight">Movement History</h2>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          Log Movement
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">Record Inventory Move</h3>
                </div>
                <button onClick={() => setIsAdding(false)} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Type Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setTxType('SALE')}
                    className={cn(
                      "flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all text-sm font-semibold",
                      txType === 'SALE' ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100 text-slate-400 bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    <ArrowRight className="w-5 h-5" />
                    SALE (Stock Out)
                  </button>
                  <button 
                    onClick={() => setTxType('PURCHASE')}
                    className={cn(
                      "flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all text-sm font-semibold",
                      txType === 'PURCHASE' ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100 text-slate-400 bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    <Plus className="w-5 h-5" />
                    PURCHASE (Stock In)
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Transaction Date</label>
                    <input 
                      type="date"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Reference No</label>
                    <input 
                      type="text"
                      placeholder="e.g. INV-2024-001"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm font-mono"
                      value={form.referenceNo}
                      onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Action Location</label>
                      <select 
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm"
                        value={form.locationId}
                        onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                      >
                        {locations.filter(l => l.type === 'Master').map(m => (
                          <optgroup key={m.id} label={m.name}>
                            <option value={m.id}>{m.name} (Master)</option>
                            {locations.filter(l => l.parentId === m.id).map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                            ))}
                          </optgroup>
                        ))}
                        {locations.filter(l => !l.type || (l.type !== 'Master' && !l.parentId)).map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                        ))}
                      </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Target Account ({txType === 'SALE' ? 'Customer/Dealer' : 'Supplier'})</label>
                    <select 
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm font-medium"
                      value={form.partnerId}
                      onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
                    >
                      <option value="">Select Partner</option>
                      {partners
                        .filter(p => txType === 'PURCHASE' ? p.type === 'Supplier' : (p.type === 'Customer' || p.type === 'Dealer'))
                        .map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                    </select>
                  </div>
                  {txType === 'PURCHASE' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Purchase Status</label>
                      <select 
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm"
                        value={form.purchaseStatus}
                        onChange={(e) => setForm({ ...form, purchaseStatus: e.target.value as any })}
                      >
                        <option value="Ordered">Ordered</option>
                        <option value="Pending">Pending</option>
                        <option value="Received">Received</option>
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Payment Status</label>
                    <select 
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm"
                      value={form.paymentStatus}
                      onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as any })}
                    >
                      <option value="Paid">Paid</option>
                      <option value="Partial">Partial</option>
                      <option value="Due">Due</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Payment Method</label>
                    <select 
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm"
                      value={form.paymentMethod}
                      onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as any })}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank Transfer</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Stock Line Items</label>
                    <button onClick={addItem} className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition-all border border-blue-100">
                      <Plus className="w-3.5 h-3.5" /> add unit
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.items.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-4 relative">
                        <div className="flex-[2] space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Product Model</label>
                          <select 
                            className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none"
                            value={item.productId}
                            onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                          >
                            <option value="">Choose Model...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="flex-[2] space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Variation</label>
                          <select 
                            className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none"
                            disabled={!item.productId}
                            value={item.variationId}
                            onChange={(e) => updateItem(idx, 'variationId', e.target.value)}
                          >
                            <option value="">Choose Specs...</option>
                            {(products.find(p => p.id === item.productId)?.variations ?? []).map(v => (
                              <option key={v.id} value={v.id}>{v.storage} {v.color} {v.countryCode}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Units</label>
                          <input 
                            type="number" 
                            className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold font-mono"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value))}
                          />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Unit Price</label>
                          <input 
                            type="number" 
                            className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold font-mono text-emerald-600"
                            value={item.price === 0 ? '' : item.price}
                            placeholder="0"
                            onChange={(e) => updateItem(idx, 'price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Tax</label>
                          <input 
                            type="number" 
                            className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold font-mono text-slate-600"
                            value={item.tax === 0 ? '' : item.tax}
                            placeholder="0"
                            onChange={(e) => updateItem(idx, 'tax', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                          />
                        </div>
                        {txType === 'SALE' && (
                          <div className="flex-1 space-y-1.5 min-w-[100px]">
                            <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Warranty</label>
                            <input 
                              type="text" 
                              className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold text-slate-600 truncate"
                              value={item.warranty}
                              placeholder="1 Year"
                              onChange={(e) => updateItem(idx, 'warranty', e.target.value)}
                            />
                          </div>
                        )}
                        <button onClick={() => removeItem(idx)} className="md:self-end self-end p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {form.items.length > 0 && (
                    <div className="mt-6 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 space-y-2">
                       <div className="flex justify-between items-center text-xs text-slate-500">
                          <span className="font-medium uppercase tracking-wider">Sub-total (Items)</span>
                          <span className="font-bold text-slate-700">${form.items.reduce((acc, i) => acc + (i.quantity * i.price), 0).toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs text-slate-500">
                          <span className="font-medium uppercase tracking-wider">Total Tax</span>
                          <span className="font-bold text-slate-700">${form.items.reduce((acc, i) => acc + (i.tax || 0), 0).toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-blue-100 my-2" />
                       <div className="flex justify-between items-center text-sm">
                          <span className="font-black text-blue-600 uppercase tracking-[0.1em]">Grand Total</span>
                          <span className="text-lg font-black text-blue-700 font-mono">
                            ${(form.items.reduce((acc, i) => acc + (i.quantity * i.price), 0) + form.items.reduce((acc, i) => acc + (i.tax || 0), 0)).toLocaleString()}
                          </span>
                       </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setIsAdding(false)} className="px-6 py-2 rounded-md font-semibold text-slate-500 hover:bg-slate-200 transition-colors text-sm">Dismiss</button>
                <button 
                  onClick={submitTransaction}
                  className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm text-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Validate Move
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                <th className="px-8 py-4">Transaction Details</th>
                <th className="px-8 py-4 text-center">Reference Partner</th>
                <th className="px-8 py-4 text-center">Qty</th>
                <th className="px-8 py-4 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic text-sm">
              {recentTxs.map((tx) => (
                <tr key={tx.id} className="group hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                       <div className={cn(
                         "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm border",
                         tx.type === 'SALE' ? "bg-green-50 text-green-600 border-green-100" : "bg-blue-50 text-blue-600 border-blue-100"
                       )}>
                         {tx.type === 'SALE' ? <ArrowRight className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                       </div>
                       <div>
                         <p className="text-xs font-bold text-slate-800 tracking-tight">{tx.type} • Order ID: {tx.id.slice(0, 8).toUpperCase()}</p>
                         <p className="text-[10px] font-medium text-slate-400 mt-0.5 flex items-center gap-1 not-italic">
                           <MapPin className="w-2.5 h-2.5" />
                           {locations.find(l => l.id === tx.locationId)?.name}
                         </p>
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <p className="font-semibold text-slate-800 text-sm">{tx.partnerName}</p>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 not-italic">
                      {tx.partnerType}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center font-mono font-bold text-slate-900">
                    {tx.items.length}
                  </td>
                  <td className="px-8 py-5 text-right not-italic">
                    <div className="flex items-center justify-end gap-2">
                       <div className="text-right">
                         <p className="text-xs font-bold text-slate-800">{tx.staffName}</p>
                         <p className="text-[10px] font-medium text-slate-400 mt-0.5">{new Date(tx.timestamp?.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                       </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentTxs.length === 0 && (
             <div className="flex flex-col items-center justify-center p-24 text-slate-400 text-center">
               <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <ArrowRightLeft className="w-8 h-8 opacity-20" />
               </div>
               <p className="italic text-sm">No inventory movements recorded yet.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
