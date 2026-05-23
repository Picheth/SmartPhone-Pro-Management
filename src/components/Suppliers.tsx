import { useState, useEffect } from 'react';
import { Truck, Plus, Search, Building2, User, ChevronRight, Hash, X, Package } from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Supplier as SupplierTypeBase } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

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
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    supplierName: '',
    shortName: '',
    supplierCode: '',
    supplierType: 'new' as SupplierType,
    isMainSupplier: false,
    parentSupplierCode: '',
    phone: '',
    address: '',
    note: ''
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), s => 
      setSuppliers(s.docs.map(d => ({ id: d.id, ...d.data() } as SupplierTypeBase))),
      (error) => handleFirestoreError(error, OperationType.GET, 'suppliers')
    );
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!form.supplierName || !form.supplierCode) {
      alert("Name and Code are required");
      return;
    }
    try {
      await addDoc(collection(db, 'suppliers'), {
        ...form,
        createdAt: serverTimestamp()
      });
      setIsAdding(false);
      setForm({
        supplierName: '',
        shortName: '',
        supplierCode: '',
        supplierType: 'new',
        isMainSupplier: false,
        parentSupplierCode: '',
        phone: '',
        address: '',
        note: ''
      });
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = suppliers.filter(s => 
    s.supplierName.toLowerCase().includes(search.toLowerCase()) || 
    s.supplierCode.toLowerCase().includes(search.toLowerCase())
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
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-blue-700 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          placeholder="Search suppliers..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(s => (
          <div key={s.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors">
                <Building2 className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
              </div>
              <span className={cn(
                "text-[8px] px-2 py-1 rounded font-black uppercase tracking-widest",
                s.isMainSupplier ? "bg-slate-900 text-white" : "bg-blue-50 text-blue-600"
              )}>
                {s.isMainSupplier ? 'Main' : 'Sub-Vendor'}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-800">{s.supplierName}</h3>
            <p className="text-[10px] font-mono text-blue-600 font-bold uppercase">Code: {s.supplierCode}</p>
          </div>
        ))}
      </div>
    </div>
  );
}