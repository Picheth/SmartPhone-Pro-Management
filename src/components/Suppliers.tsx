import { useState, useEffect } from 'react';
import { Truck, Plus, Search, Building2, User, ChevronRight, Hash, X, Package } from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Supplier } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newS, setNewS] = useState({ code: '', name: '', type: 'Main' as 'Main' | 'Sub', parentCode: '' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), (s) => {
      setSuppliers(s.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));
    return () => unsub();
  }, []);

  const addSupplier = async () => {
    if (!newS.code || !newS.name) return;
    await addDoc(collection(db, 'suppliers'), newS);
    setNewS({ code: '', name: '', type: 'Main', parentCode: '' });
    setIsAdding(false);
  };

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center">
            <Truck className="w-5 h-5 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Supply Network</h2>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          Partner Onboarding
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Register New Supplier Entity</h3>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Entity Name / Shop</label>
                   <input 
                     placeholder="e.g. លីហៃបោះដុំ (Li Hay Wholesale)"
                     className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                     value={newS.name} onChange={(e) => setNewS({...newS, name: e.target.value})}
                   />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Classification Code</label>
                   <input 
                     placeholder="e.g. S04-000"
                     className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all font-mono"
                     value={newS.code} onChange={(e) => setNewS({...newS, code: e.target.value})}
                   />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Supplier Category</label>
                   <select 
                     className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                     value={newS.type} onChange={(e) => setNewS({...newS, type: e.target.value as any})}
                   >
                     <option value="Main">Primary (Main Stock)</option>
                     <option value="Sub">Secondary (Sub-Supplier)</option>
                   </select>
                 </div>
                 {newS.type === 'Sub' && (
                   <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Parent Reference Code</label>
                     <input 
                       placeholder="e.g. S04-000"
                       className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all font-mono"
                       value={newS.parentCode} onChange={(e) => setNewS({...newS, parentCode: e.target.value})}
                     />
                   </div>
                 )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onClick={() => setIsAdding(false)} className="px-6 py-2 rounded-md font-semibold text-slate-500 hover:bg-slate-100 text-sm">Cancel</button>
                <button 
                  onClick={addSupplier}
                  className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold hover:bg-blue-700 transition-all shadow-sm text-sm"
                >
                  Confirm Registration
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((s) => (
          <div key={s.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors">
                  <Building2 className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                </div>
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider",
                  s.type === 'Main' ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-slate-100 text-slate-600 border-slate-200"
                )}>
                  {s.type}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">{s.name}</h3>
                <p className="text-[10px] font-mono text-blue-600 mt-1 font-bold">UID: {s.code}</p>
                {s.parentCode && <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Relational ID: {s.parentCode}</p>}
              </div>
            </div>
            
            <div className="pt-6 mt-6 border-t border-slate-50 flex items-center justify-between">
               <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                  <Package className="w-3.5 h-3.5" />
                  Active Supplier
               </div>
               <button className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-all">Details</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
