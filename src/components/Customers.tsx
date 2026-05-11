import { useState, useEffect } from 'react';
import { Users, User, ArrowRightLeft, PlusCircle } from 'lucide-react';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Customer } from '../types';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [newP, setNewP] = useState({ code: '', name: '' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), s => 
      setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() } as Customer))),
      (error) => handleFirestoreError(error, OperationType.GET, 'customers')
    );
    return () => unsub();
  }, []);

  const addPartner = async () => {
    if (!newP.code || !newP.name) return;
    await addDoc(collection(db, 'customers'), newP);
    setNewP({ code: '', name: '' });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center">
          <Users className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Customer Database</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Manage End-User Internal IDs</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-2 mb-2">
           <PlusCircle className="w-4 h-4 text-blue-600" />
           <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Register New Customer</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest pl-1">Customer Name</label>
            <input 
              placeholder="e.g. John Doe"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
              value={newP.name} onChange={(e) => setNewP({...newP, name: e.target.value})}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest pl-1">Customer Code</label>
            <input 
              placeholder="e.g. C000001"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all font-mono"
              value={newP.code} onChange={(e) => setNewP({...newP, code: e.target.value})}
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={addPartner}
              className="w-full bg-blue-600 text-white h-[42px] px-6 rounded-lg font-bold hover:bg-blue-700 transition-all shadow-sm text-sm"
            >
              Add Customer
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.map((p) => (
          <div key={p.id} className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50/50 rounded-bl-[100px] flex items-start justify-end p-4">
               <User className="w-8 h-8 text-slate-100 group-hover:text-blue-50 group-hover:scale-125 transition-all" />
            </div>
            
            <div className="relative space-y-4">
              <div>
                <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-widest">{p.code}</p>
                <h3 className="text-xl font-bold text-slate-800 tracking-tight mt-1">{p.name}</h3>
                <span className="inline-block mt-2 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-50 text-slate-400 border border-slate-100">
                  Customer Account
                </span>
              </div>
              
              <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Activity History
                </div>
                <button className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-all">Report</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
