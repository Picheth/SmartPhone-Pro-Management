import { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit2, X, Check, Search } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Location } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [form, setForm] = useState({ name: '', code: '', parentId: '', type: 'Master' as 'Master' | 'Sub' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'locations'), s => 
      setLocations(s.docs.map(d => ({ id: d.id, ...d.data() } as Location))),
      (error) => handleFirestoreError(error, OperationType.GET, 'locations')
    );
    return () => unsub();
  }, []);

  const seedStandardHierarchy = async () => {
    const standard = [
      { name: 'Stock Thom', code: 'ST-MAIN', type: 'Master', subs: [] },
      { name: 'KnearYerng', code: 'KY-MAIN', type: 'Master', subs: [
        { code: 'L2001', name: 'KY Stock Sale' },
        { code: 'L2002', name: 'KY Stock Repair' },
        { code: 'L2003', name: 'KY Stock Accessory' },
        { code: 'L2004', name: 'KY Stock Lease' },
      ]},
      { name: 'Store KneaYerng', code: 'SK-MAIN', type: 'Master', subs: [
        { code: 'L3001', name: 'KYS Stock Sale' },
        { code: 'L3002', name: 'KYS Stock Repair' },
        { code: 'L3003', name: 'KYS Stock Accessory' },
        { code: 'L3004', name: 'KYS Stock Lease' },
      ]},
      { name: 'Fan Apple', code: 'FA-MAIN', type: 'Master', subs: [
        { code: 'L4001', name: 'FA Stock Sale' },
        { code: 'L4002', name: 'FA Stock Repair' },
        { code: 'L4003', name: 'FA Stock Accessory' },
        { code: 'L4004', name: 'FA Stock Lease' },
      ]},
      { name: 'KneaYerng VIP', code: 'KV-MAIN', type: 'Master', subs: [
        { code: 'L5001', name: 'VIP Stock Sale' },
        { code: 'L5002', name: 'VIP Stock Repair' },
        { code: 'L5003', name: 'VIP Stock Accessory' },
        { code: 'L5004', name: 'VIP Stock Lease' },
      ]},
      { name: 'Others', code: 'OT-MAIN', type: 'Master', subs: [
        { code: 'L6001', name: 'ពិសិដ្ឋប៉ូលា' },
        { code: 'L6002', name: 'LMD លីមេឌា' },
      ]},
    ];

    if (!window.confirm('Delete all existing locations and seed standard hierarchy?')) return;

    try {
      // 1. Delete all
      for (const l of locations) {
        await deleteDoc(doc(db, 'locations', l.id));
      }

      // 2. Add new
      for (const m of standard) {
        const masterRef = await addDoc(collection(db, 'locations'), {
          name: m.name,
          code: m.code,
          type: 'Master',
          createdAt: serverTimestamp()
        });
        
        for (const s of m.subs) {
          await addDoc(collection(db, 'locations'), {
            name: s.name,
            code: s.code,
            parentId: masterRef.id,
            type: 'Sub',
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      alert("Location name and code are required.");
      return;
    }

    // Security Fix: Payload 6 & 7 (Resource Poisoning Prevention)
    const codeRegex = /^[a-zA-Z0-9-]+$/;
    if (!codeRegex.test(form.code)) {
      alert("Location code must be alphanumeric (hyphens allowed).");
      return;
    }
    if (form.code.length > 50 || form.name.length > 100) {
      alert("Input too long. Max 50 chars for code and 100 for name.");
      return;
    }
    
    try {
      const data = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        parentId: form.type === 'Sub' ? form.parentId : '',
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'locations', editingId), data);
      } else {
        await addDoc(collection(db, 'locations'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setForm({ name: '', code: '', parentId: '', type: 'Master' });
      setIsAdding(false);
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const startEdit = (l: Location) => {
    setForm({ 
      name: l.name, 
      code: l.code, 
      parentId: l.parentId || '', 
      type: l.type || 'Master' 
    });
    setEditingId(l.id);
    setIsAdding(true);
  };

  const filtered = locations.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    l.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Location Network</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Manage Warehouses & Retail Stores</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={seedStandardHierarchy}
            className="hidden sm:flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Sync Standard Hierarchy
          </button>
          <button 
            onClick={() => { setIsAdding(true); setEditingId(null); setForm({ name: '', code: '', parentId: '', type: 'Master' }); }}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-8 rounded-xl border border-slate-200 shadow-xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? 'Edit Location' : 'Register New Location'}
              </h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Type</label>
                <select 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                  value={form.type} onChange={e => setForm({...form, type: e.target.value as any})}
                >
                  <option value="Master">Master Location</option>
                  <option value="Sub">Sub Location</option>
                </select>
              </div>

              {form.type === 'Sub' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Parent Location</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                    value={form.parentId} onChange={e => setForm({...form, parentId: e.target.value})}
                  >
                    <option value="">Select Master...</option>
                    {locations.filter(l => l.type === 'Master').map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Location Name</label>
                <input 
                  placeholder="e.g. KY Stock Sale"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                  value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Location Code (UID)</label>
                <input 
                  placeholder="e.g. L2001"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all font-mono"
                  value={form.code} onChange={e => setForm({...form, code: e.target.value})}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button 
                onClick={() => setIsAdding(false)} 
                className="px-6 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 rounded-md"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold text-sm shadow-sm hover:bg-blue-700 transition-all"
              >
                {editingId ? 'Update Location' : 'Save Location'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          placeholder="Filter locations by name or code..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(l => (
          <div key={l.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors">
                  <MapPin className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => startEdit(l)}
                    className="p-2 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={async () => {
                      if (window.confirm('Delete location? This might affect existing stock references.')) {
                        await deleteDoc(doc(db, 'locations', l.id));
                      }
                    }}
                    className="p-2 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">{l.name}</h3>
                  {l.type === 'Master' && (
                    <span className="text-[8px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Master</span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-widest">Code: {l.code}</p>
                {l.parentId && (
                  <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                    Parent: {locations.find(p => p.id === l.parentId)?.name || 'Unknown'}
                  </p>
                )}
              </div>
            </div>
            
            <div className="pt-6 mt-6 border-t border-slate-50 flex items-center justify-between">
               <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Active Node
               </div>
               <div className="text-[10px] font-bold text-slate-400 px-3 py-1.5 rounded transition-all italic">Ref ID: {l.id.slice(0,6)}</div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 py-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl opacity-20">
            <MapPin className="w-16 h-16 stroke-[1.5]" />
            <p className="mt-4 font-bold uppercase tracking-widest text-xs">No Locations Mapped</p>
          </div>
        )}
      </div>
    </div>
  );
}
