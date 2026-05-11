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
  AlertCircle,
  X,
  Truck
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
  StockTransfer, 
  Variation, 
  Location
} from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function StockTransfers({ staffName }: { staffName: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);

  // Form State
  const [form, setForm] = useState({
    fromLocationId: '',
    toLocationId: '',
    items: [] as any[],
    note: ''
  });

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (s) => 
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
      (error) => handleFirestoreError(error, OperationType.GET, 'products')
    );

    const unsubLocs = onSnapshot(collection(db, 'locations'), (s) => {
        const locs = s.docs.map(d => ({ id: d.id, ...d.data() } as Location));
        setLocations(locs);
        if (locs.length >= 2 && !form.fromLocationId) {
            setForm(prev => ({ ...prev, fromLocationId: locs[0].id, toLocationId: locs[1].id }));
        }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));
    
    const q = query(collection(db, 'transfers'), orderBy('timestamp', 'desc'), limit(15));
    const unsubTx = onSnapshot(q, (s) => {
      setTransfers(s.docs.map(d => ({ id: d.id, ...d.data() } as StockTransfer)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transfers'));

    return () => {
      unsubProducts();
      unsubLocs();
      unsubTx();
    };
  }, []);

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', variationId: '', quantity: 1 }]
    }));
  };

  const removeItem = (idx: number) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    }));
  };

  const submitTransfer = async () => {
    if (!form.fromLocationId || !form.toLocationId || form.fromLocationId === form.toLocationId) {
        alert("Select different source and destination locations.");
        return;
    }
    if (form.items.length === 0) return;

    try {
      await runTransaction(db, async (transaction) => {
        const transferData = {
          fromLocationId: form.fromLocationId,
          toLocationId: form.toLocationId,
          items: form.items.map(item => {
             const product = products.find(p => p.id === item.productId);
             return {
               ...item,
               productName: product?.name || 'Unknown'
             };
          }),
          staffName,
          timestamp: serverTimestamp(),
          status: 'COMPLETED',
          note: form.note
        };

        // Update Stocks
        for (const item of form.items) {
          // 1. Decrease Source
          const sourceDocId = `${form.fromLocationId}_${item.variationId}`;
          const sourceRef = doc(db, 'stock', sourceDocId);
          const sourceSnap = await transaction.get(sourceRef);
          
          let sourceQty = sourceSnap.exists() ? (sourceSnap.data().quantity || 0) : 0;
          if (sourceQty < item.quantity) {
             throw new Error(`Insufficient stock at source for variation ${item.variationId}`);
          }
          transaction.set(sourceRef, { 
            quantity: sourceQty - item.quantity, 
            lastUpdated: serverTimestamp(),
            productId: item.productId,
            variationId: item.variationId,
            locationId: form.fromLocationId
          }, { merge: true });

          // 2. Increase Destination
          const destDocId = `${form.toLocationId}_${item.variationId}`;
          const destRef = doc(db, 'stock', destDocId);
          const destSnap = await transaction.get(destRef);
          
          let destQty = destSnap.exists() ? (destSnap.data().quantity || 0) : 0;
          transaction.set(destRef, { 
            quantity: destQty + item.quantity, 
            lastUpdated: serverTimestamp(),
            productId: item.productId,
            variationId: item.variationId,
            locationId: form.toLocationId
          }, { merge: true });
        }

        const newTransferRef = doc(collection(db, 'transfers'));
        transaction.set(newTransferRef, transferData);
      });

      setIsAdding(false);
      setForm(prev => ({ ...prev, items: [], note: '' }));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Transfer failed");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center">
            <Truck className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Stock Transfers</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Move inventory between stores</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Transfer
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
                   <Truck className="w-5 h-5 text-blue-600" />
                   <h3 className="text-lg font-bold text-slate-800 tracking-tight">New Stock Transfer</h3>
                </div>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                   <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 pl-1">Source Location</label>
                      <select 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm"
                        value={form.fromLocationId}
                        onChange={e => setForm({...form, fromLocationId: e.target.value})}
                      >
                         <option value="">Select Store</option>
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
                   <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
                      <div className="bg-blue-600 text-white p-1 rounded-full shadow-lg">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 pl-1">Target Location</label>
                      <select 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm"
                        value={form.toLocationId}
                        onChange={e => setForm({...form, toLocationId: e.target.value})}
                      >
                         <option value="">Select Store</option>
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
                </div>

                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <label className="text-[10px] uppercase font-bold text-slate-400 pl-1">Transfer Items</label>
                     <button onClick={addItem} className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded transition-all">
                        <Plus className="w-3.5 h-3.5" /> add product
                     </button>
                   </div>

                   <div className="space-y-3">
                      {form.items.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 lg:grid-cols-5 gap-3 relative group">
                           <div className="lg:col-span-2 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Product</label>
                              <select 
                                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none"
                                value={item.productId}
                                onChange={e => updateItem(idx, 'productId', e.target.value)}
                              >
                                 <option value="">Choose...</option>
                                 {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                           </div>
                           <div className="lg:col-span-2 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Spec</label>
                              <select 
                                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none"
                                value={item.variationId}
                                onChange={e => updateItem(idx, 'variationId', e.target.value)}
                              >
                                 <option value="">Select Variation</option>
                                 {products.find(p => p.id === item.productId)?.variations.map(v => (
                                   <option key={v.id} value={v.id}>{v.storage} {v.color} {v.countryCode}</option>
                                 ))}
                              </select>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Qty</label>
                              <input 
                                type="number" 
                                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-md outline-none text-center font-bold"
                                value={item.quantity === 0 ? '' : item.quantity}
                                onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value))}
                              />
                           </div>
                           <button onClick={() => removeItem(idx)} className="absolute -right-2 -top-2 bg-white text-slate-300 hover:text-red-500 border border-slate-100 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="space-y-1.5">
                   <label className="text-[10px] uppercase font-bold text-slate-400 pl-1">Internal Note (Optional)</label>
                   <textarea 
                     className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm h-24"
                     placeholder="Explain the reason for this movement..."
                     value={form.note}
                     onChange={e => setForm({...form, note: e.target.value})}
                   />
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                 <button onClick={() => setIsAdding(false)} className="px-6 py-2 rounded-md font-semibold text-slate-500 hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                 <button 
                  onClick={submitTransfer}
                  className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm text-sm"
                 >
                    <ArrowRightLeft className="w-4 h-4" />
                    Commit Transfer
                 </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
             <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                   <th className="px-8 py-4">Transfer Details</th>
                   <th className="px-8 py-4">From Location</th>
                   <th className="px-8 py-4">To Location</th>
                   <th className="px-8 py-4 text-center">Items</th>
                   <th className="px-8 py-4 text-right">Executor</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 italic text-sm">
                {transfers.map(tf => (
                  <tr key={tf.id} className="hover:bg-slate-50 transition-colors">
                     <td className="px-8 py-6">
                        <p className="text-xs font-bold text-slate-800">TRF-{tf.id.slice(0,8).toUpperCase()}</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5 not-italic">
                           {new Date(tf.timestamp?.seconds * 1000).toLocaleString()}
                        </p>
                     </td>
                     <td className="px-8 py-6">
                        <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-md font-bold text-[10px] border border-amber-100 uppercase">
                           {locations.find(l => l.id === tf.fromLocationId)?.name || 'Unknown'}
                        </span>
                     </td>
                     <td className="px-8 py-6">
                        <span className="bg-green-50 text-green-700 px-3 py-1 rounded-md font-bold text-[10px] border border-green-100 uppercase">
                           {locations.find(l => l.id === tf.toLocationId)?.name || 'Unknown'}
                        </span>
                     </td>
                     <td className="px-8 py-6">
                        <div className="space-y-1.5 max-w-xs">
                           {tf.items.map((item, idx) => {
                             const product = products.find(p => p.id === item.productId);
                             const variation = product?.variations.find(v => v.id === item.variationId);
                             return (
                               <div key={idx} className="flex flex-col">
                                 <div className="flex items-center justify-between">
                                   <span className="text-xs font-bold text-slate-900 truncate">{item.productName}</span>
                                   <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">x{item.quantity}</span>
                                 </div>
                                 <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight -mt-0.5">
                                   {variation ? `${variation.storage} ${variation.color} ${variation.countryCode}` : 'Variation Ref Error'}
                                 </p>
                               </div>
                             );
                           })}
                        </div>
                     </td>
                     <td className="px-8 py-6 text-right not-italic">
                        <p className="text-xs font-bold text-slate-800">{tf.staffName}</p>
                        <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest">Completed</span>
                     </td>
                  </tr>
                ))}
             </tbody>
          </table>
          {transfers.length === 0 && (
            <div className="py-24 text-center text-slate-300">
              <Truck className="w-12 h-12 mx-auto mb-4 opacity-10" />
              <p className="italic">No history of stock transfers.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Trash2(props: any) {
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
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}
