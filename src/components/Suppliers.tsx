import { useState, useEffect } from 'react';
import { Truck, Plus, Search, Building2, User, ChevronRight, Hash, X, Package, Phone, MapPin, Trash2, Edit2, Save, AlertCircle } from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Supplier as SupplierTypeBase } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../auth/ToastContext';

export type SupplierType = 'main' | 'used' | 'new' | 'other';

export const getMainSuppliers = (suppliers: SupplierTypeBase[]) => {
  return suppliers.filter(s => s.isMainSupplier);
};

export const getChildSuppliers = (
  suppliers: SupplierTypeBase[],
  parentCode: string
) => {
  return suppliers.filter(
    s => s.parentSupplierCode === parentCode
  );
};

export const getSupplierTypeLabel = (
  type: SupplierType
): string => {
  switch (type) {
    case 'main':
      return 'Main Supplier';

    case 'used':
      return 'Used Products';

    case 'new':
      return 'New Products';

    case 'other':
      return 'Other Products';

    default:
      return 'Unknown';
  }
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<SupplierTypeBase[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const { addToast } = useToast();

  const initialFormState = {
    supplierName: '',
    shortName: '',
    supplierCode: '',
    supplierType: 'new' as SupplierType,
    isMainSupplier: false,
    parentSupplierCode: '',
    phone: '',
    address: '',
    note: ''
  };

  const [form, setForm] = useState(initialFormState);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), s => 
      setSuppliers(s.docs.map(d => ({ id: d.id, ...d.data() } as SupplierTypeBase))),
      (error) => handleFirestoreError(error, OperationType.GET, 'suppliers')
    );
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!form.supplierName.trim() || !form.supplierCode.trim()) {
      addToast("Supplier Name and Code are required.", "error");
      return;
    }

    const code = form.supplierCode.trim().toUpperCase();
    // Validation for code (Paylaod 7: Alphanumeric check)
    if (!/^[a-zA-Z0-9-]+$/.test(code)) {
      addToast("Supplier code must be alphanumeric (hyphens allowed).", "warning");
      return;
    }

    // Check for duplicates on create
    if (!editingId && suppliers.some(s => s.supplierCode === code)) {
      addToast("A supplier with this code already exists.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        ...form,
        supplierName: form.supplierName.trim(),
        supplierCode: code,
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'suppliers', editingId), data);
        addToast("Supplier updated successfully.", "success");
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...data,
          createdAt: serverTimestamp()
        });
        addToast("New supplier registered.", "success");
      }

      setIsAdding(false);
      setEditingId(null);
      setForm(initialFormState);
    } catch (e) {
      console.error(e);
      addToast("Failed to save supplier data.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (s: SupplierTypeBase) => {
    setForm({
      supplierName: s.supplierName,
      shortName: s.shortName || '',
      supplierCode: s.supplierCode,
      supplierType: s.supplierType as SupplierType,
      isMainSupplier: s.isMainSupplier || false,
      parentSupplierCode: s.parentSupplierCode || '',
      phone: s.phone || '',
      address: s.address || '',
      note: s.note || ''
    });
    setEditingId(s.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this supplier? This will not affect historical transactions.")) return;
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      addToast("Supplier removed.", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'suppliers');
    }
  };

  const filtered = suppliers.filter(s => 
    (s.supplierName || (s as any).name || '').toLowerCase().includes(search.toLowerCase()) || 
    (s.supplierCode || (s as any).code || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center">
            <Truck className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Supplier Network</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Manage B2B Sourcing & Vendors</p>
          </div>
        </div>
        <button 
          onClick={() => { setIsAdding(true); setEditingId(null); setForm(initialFormState); }}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-blue-700 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
          >
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">{editingId ? 'Edit Supplier' : 'Register New Supplier'}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Managing B2B Sourcing partner</p>
                  </div>
                </div>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Supplier Full Name</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-bold"
                      value={form.supplierName}
                      onChange={e => setForm({...form, supplierName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Supplier Code (UID)</label>
                    <input 
                      type="text"
                      placeholder="e.g. S1000"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-mono font-bold text-blue-600"
                      value={form.supplierCode}
                      onChange={e => setForm({...form, supplierCode: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Supplier Type</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                      value={form.supplierType}
                      onChange={e => setForm({...form, supplierType: e.target.value as SupplierType})}
                    >
                      <option value="new">New Products</option>
                      <option value="used">Used / Second-hand</option>
                      <option value="main">Main Manufacturer</option>
                      <option value="other">Other Sourcing</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Contact Phone</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                      value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Address</label>
                  <textarea 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all h-20 resize-none"
                    value={form.address}
                    onChange={e => setForm({...form, address: e.target.value})}
                  />
                </div>

                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <input 
                    type="checkbox"
                    id="isMain"
                    className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    checked={form.isMainSupplier}
                    onChange={e => setForm({...form, isMainSupplier: e.target.checked})}
                  />
                  <label htmlFor="isMain" className="text-xs font-bold text-blue-800 uppercase tracking-tight cursor-pointer">
                    Mark as Main Supplier
                  </label>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setIsAdding(false)} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-white transition-all">Cancel</button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-black text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : <Save className="w-4 h-4" />}
                  {editingId ? 'Update Supplier' : 'Register Supplier'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          placeholder="Search by name or code..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(s => (
          <div key={s.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors">
                  <Building2 className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => startEdit(s)}
                    className="p-2 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(s.id)}
                    className="p-2 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">{s.supplierName || (s as any).name || 'Unnamed'}</h3>
                  {s.isMainSupplier && (
                    <span className="text-[8px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-widest">Main</span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-widest">Code: {s.supplierCode || (s as any).code || 'N/A'}</p>
                
                <div className="mt-4 space-y-2">
                  {s.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-300" />
                      {s.phone}
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-300" />
                      <span className="truncate">{s.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-50 flex items-center justify-between">
               <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                  {getSupplierTypeLabel(s.supplierType as SupplierType)}
               </span>
               <div className="text-[10px] font-bold text-slate-300 italic">Ref: {s.id.slice(0,6)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}