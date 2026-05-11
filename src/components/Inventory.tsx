import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  ChevronRight, 
  Smartphone,
  Box,
  MapPin,
  Save,
  X,
  PlusCircle,
  Trash2,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  History,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft
} from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp, setDoc, doc, updateDoc, deleteDoc, writeBatch, runTransaction, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, Variation, Stock, Location, Transaction } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    sku: '',
    storage: '',
    color: '',
    countryCode: '',
    condition: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ productId: string, variationId: string }[]>([]);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryTarget, setSelectedHistoryTarget] = useState({
    productName: '',
    variationLabel: '',
    variationId: ''
  });
  const [addStockForm, setAddStockForm] = useState({
    productId: '',
    variationId: '',
    productName: '',
    variationLabel: '',
    locationId: '',
    quantity: '0',
    error: ''
  });

  // Form State
  const [productForm, setProductForm] = useState({
    name: '',
    variations: [] as (Variation & { initialQty?: string, error?: string })[]
  });

  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    const unsubStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
      setStocks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'stock'));

    const unsubLocs = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));

    return () => { unsubProducts(); unsubStock(); unsubLocs(); };
  }, []);

  const addVariation = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setProductForm(prev => ({
      ...prev,
      variations: [...prev.variations, { id, sku: '', storage: '', color: '', countryCode: '', condition: '', initialQty: '0' }]
    }));
  };

  const removeVariation = (id: string) => {
    setProductForm(prev => ({
      ...prev,
      variations: prev.variations.filter(v => v.id !== id)
    }));
  };

  const updateVariation = (id: string, field: string, value: string) => {
    setProductForm(prev => ({
      ...prev,
      variations: prev.variations.map(v => {
        if (v.id === id) {
          const updated = { ...v, [field]: value };
          
          // Validation for quantity
          if (field === 'initialQty') {
            if (value !== "" && !/^\d+$/.test(value)) {
              updated.error = 'Quantity must be a non-negative integer';
            } else {
              delete updated.error;
            }
          }
          
          return updated;
        }
        return v;
      })
    }));
  };

  const openAddMode = () => {
    setProductForm({ name: '', variations: [] });
    setEditingProduct(null);
    setIsAddingMode(true);
  };

  const openEditMode = (product: Product) => {
    setProductForm({ name: product.name, variations: [...product.variations] });
    setEditingProduct(product);
    setIsAddingMode(true);
  };

  const saveProduct = async () => {
    const trimmedName = productForm.name.trim();
    if (!trimmedName) return;

    if (trimmedName.length > 200) {
      alert("Product name is too long (Max 200 characters).");
      return;
    }

    if (productForm.variations.some(v => v.error)) {
      alert("Please fix validation errors before saving.");
      return;
    }

    try {
      let productId = editingProduct?.id;
      
      const cleanVariations = productForm.variations.map(({ initialQty, error, ...rest }) => rest);

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), {
          name: trimmedName,
          variations: cleanVariations,
          updatedAt: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          name: trimmedName,
          variations: cleanVariations,
          createdAt: serverTimestamp()
        });
        productId = docRef.id;
      }

      // Handle Initial Stock if provided and at least one location exists
      if (locations.length > 0 && productId) {
        const batch = writeBatch(db);
        let hasStockUpdates = false;

        productForm.variations.forEach(v => {
          const qty = parseInt(v.initialQty || '0');
          if (qty > 0) {
            // Initialize in the first location by default for simplicity, 
            // or we could add a location selector but let's stick to the common location
            const stockDocId = `${locations[0].id}_${v.id}`;
            const stockRef = doc(db, 'stock', stockDocId);
            batch.set(stockRef, {
              locationId: locations[0].id,
              variationId: v.id,
              productId: productId,
              quantity: qty,
              lastUpdated: serverTimestamp()
            });
            hasStockUpdates = true;
          }
        });

        if (hasStockUpdates) await batch.commit();
      }

      setProductForm({ name: '', variations: [] });
      setEditingProduct(null);
      setIsAddingMode(false);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Error saving product. Check your connection.");
    }
  };

  const filteredProducts = products.filter(p => {
    const s = search.toLowerCase();
    const nameMatch = p.name.toLowerCase().includes(s);
    
    // Check if any variation matches the specific filters AND the search query
    const hasMatchingVariation = p.variations.some(v => {
      const matchesSearch = !s || 
        v.sku?.toLowerCase().includes(s) ||
        v.storage.toLowerCase().includes(s) ||
        v.color.toLowerCase().includes(s) ||
        v.countryCode.toLowerCase().includes(s) ||
        v.condition.toLowerCase().includes(s) ||
        p.name.toLowerCase().includes(s);

      const matchesFilters = 
        (!filters.sku || v.sku === filters.sku) &&
        (!filters.storage || v.storage === filters.storage) &&
        (!filters.color || v.color === filters.color) &&
        (!filters.countryCode || v.countryCode === filters.countryCode) &&
        (!filters.condition || v.condition === filters.condition);

      return matchesSearch && matchesFilters;
    });

    return hasMatchingVariation;
  });

  // Get unique values for filters
  const uniqueValues = {
    skus: Array.from(new Set(products.flatMap(p => p.variations.map(v => v.sku)))).filter(Boolean).sort(),
    storages: Array.from(new Set(products.flatMap(p => p.variations.map(v => v.storage)))).filter(Boolean).sort(),
    colors: Array.from(new Set(products.flatMap(p => p.variations.map(v => v.color)))).filter(Boolean).sort(),
    countries: Array.from(new Set(products.flatMap(p => p.variations.map(v => v.countryCode)))).filter(Boolean).sort(),
    conditions: Array.from(new Set(products.flatMap(p => p.variations.map(v => v.condition)))).filter(Boolean).sort()
  };

  const toggleSelection = (productId: string, variationId: string) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.productId === productId && item.variationId === variationId);
      if (exists) {
        return prev.filter(item => !(item.productId === productId && item.variationId === variationId));
      }
      return [...prev, { productId, variationId }];
    });
  };

  const selectAllInProduct = (product: Product) => {
    const productVarIds = product.variations.map(v => v.id);
    setSelectedItems(prev => {
      const otherItems = prev.filter(item => item.productId !== product.id);
      const allSelected = productVarIds.every(id => prev.some(item => item.productId === product.id && item.variationId === id));
      
      if (allSelected) {
        return otherItems;
      } else {
        const newItems = productVarIds.map(id => ({ productId: product.id, variationId: id }));
        return [...otherItems, ...newItems];
      }
    });
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedItems.length} selected variations?`)) return;

    try {
      const batch = writeBatch(db);
      
      // Group selections by product
      const grouped = selectedItems.reduce((acc, item) => {
        if (!acc[item.productId]) acc[item.productId] = [];
        acc[item.productId].push(item.variationId);
        return acc;
      }, {} as Record<string, string[]>);

      for (const [productId, ids] of Object.entries(grouped)) {
        const varIds = ids as string[];
        const product = products.find(p => p.id === productId);
        if (product) {
          const updatedVariations = product.variations.filter(v => !varIds.includes(v.id));
          batch.update(doc(db, 'products', productId), {
            variations: updatedVariations,
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      setSelectedItems([]);
    } catch (error) {
      console.error("Bulk delete failed:", error);
    }
  };

  const handleQuickAddStock = async () => {
    const qty = parseInt(addStockForm.quantity);
    if (!addStockForm.locationId) {
      alert("Please select a location.");
      return;
    }
    if (isNaN(qty) || qty <= 0 || addStockForm.error) {
      alert(addStockForm.error || "Please enter a valid positive quantity.");
      return;
    }

    setIsUpdatingStock(true);
    try {
      const stockDocId = `${addStockForm.locationId}_${addStockForm.variationId}`;
      const stockRef = doc(db, 'stock', stockDocId);
      
      await runTransaction(db, async (transaction) => {
        const stockSnap = await transaction.get(stockRef);
        if (stockSnap.exists()) {
          transaction.update(stockRef, {
            quantity: stockSnap.data().quantity + qty,
            lastUpdated: serverTimestamp()
          });
        } else {
          transaction.set(stockRef, {
            locationId: addStockForm.locationId,
            variationId: addStockForm.variationId,
            productId: addStockForm.productId,
            quantity: qty,
            lastUpdated: serverTimestamp()
          });
        }
      });

      setShowAddStockModal(false);
      setAddStockForm(prev => ({ ...prev, quantity: '0' }));
    } catch (error) {
      console.error("Failed to add stock:", error);
      alert("Error updating stock. Check your connection.");
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const fetchHistory = async (variationId: string, productName: string, variationLabel: string) => {
    setSelectedHistoryTarget({ variationId, productName, variationLabel });
    setIsLoadingHistory(true);
    setShowHistoryModal(true);
    setHistoryItems([]);

    try {
      // Query recent transactions and filter client-side for the target variation
      const q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(200));
      const snapshot = await getDocs(q);
      
      const movements = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Transaction))
        .filter(t => t.items.some(i => i.variationId === variationId))
        .flatMap(t => {
          const item = t.items.find(i => i.variationId === variationId);
          if (!item) return [];
          
          return [{
            id: t.id,
            type: t.type,
            date: t.timestamp?.seconds ? new Date(t.timestamp.seconds * 1000).toLocaleString() : 'N/A',
            quantity: item.quantity,
            location: locations.find(l => l.id === t.locationId)?.name || 'N/A',
            partner: t.partnerName || 'Internal',
            staff: t.staffName,
            reference: t.referenceNo || t.id.slice(0, 8)
          }];
        });

      setHistoryItems(movements);
    } catch (error) {
      console.error("Failed to load history:", error);
      alert("Could not load history. Check your connection.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2 max-w-2xl">
          <div className="relative flex-1 flex items-center bg-white border border-slate-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all overflow-hidden group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search model, color, storage..." 
              className="w-full pl-11 pr-4 py-2.5 bg-transparent border-none text-sm outline-none text-slate-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="w-px h-6 bg-slate-100 hidden sm:block" />
            <select 
              className="hidden sm:block w-36 px-3 py-2 bg-transparent border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 focus:text-blue-600 outline-none cursor-pointer hover:bg-slate-50 transition-colors"
              value={filters.sku}
              onChange={(e) => setFilters({ ...filters, sku: e.target.value })}
            >
              <option value="">SKU: All</option>
              {uniqueValues.skus.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2.5 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium",
              showFilters || Object.values(filters).some(f => f)
                ? "bg-blue-50 border-blue-200 text-blue-600" 
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            )}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden md:inline">Filters</span>
            {Object.values(filters).some(f => f) && (
              <span className="w-2 h-2 rounded-full bg-blue-500" />
            )}
          </button>
        </div>
        <button 
          onClick={() => setIsBulkImportOpen(true)}
          className="flex items-center justify-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-slate-900 transition-all shadow-sm active:scale-[0.98]"
        >
          <Box className="w-4 h-4" />
          Bulk Import
        </button>
        <button 
          onClick={openAddMode}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      <AnimatePresence>
        {isBulkImportOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Bulk Product Import</h3>
                    <p className="text-xs text-slate-400 font-medium">Paste tab-separated or comma-separated values (SKU, Product, Variation/Color)</p>
                  </div>
                </div>
                <button onClick={() => setIsBulkImportOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-8 flex-1 overflow-y-auto space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Product List</label>
                    <button 
                      onClick={() => {
                        setBulkInput(`000001-1\tiPhone 7 Plus LA 32GB SC\tBlack\n000001-2\tiPhone 7 Plus LA 32GB SC\tSilver\n000001-3\tiPhone 7 Plus LA 32GB SC\tGold\n000001-4\tiPhone 7 Plus LA 32GB SC\tRose Gold\n000001-5\tiPhone 7 Plus LA 32GB SC\tRed\n000002-1\tiPhone 7 Plus LA 128GB SC\tBlack`);
                      }}
                      className="text-[10px] text-blue-600 font-bold uppercase hover:underline"
                    >
                      Load Initial Batch
                    </button>
                  </div>
                  <textarea 
                    className="w-full h-80 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:border-blue-500 transition-all resize-none"
                    placeholder="Example format:&#10;SKU-001	Product Name	Color&#10;SKU-002	Product Name	Color"
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                  />
                </div>

                <div className="bg-blue-50/50 rounded-2xl p-4 flex gap-4">
                  <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-tight">How it works</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      Each line will be processed. If a product name doesn't exist, it will be created. 
                      If it exists, the variation will be added to it. 
                      Variation details like "32GB" and "SC" will be extracted from the product name if possible.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button 
                  onClick={() => setIsBulkImportOpen(false)}
                  className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-white rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  disabled={!bulkInput.trim()}
                  onClick={async () => {
                    const lines = bulkInput.trim().split('\n');
                    const productsToAdd: Record<string, { name: string, variations: any[] }> = {};

                    lines.forEach(line => {
                      const [sku, prodName, variationRaw] = line.split(/\t|,/);
                      if (!prodName || !sku) return;

                      const cleanName = prodName.trim();
                      const colorMatch = variationRaw?.match(/Color-(.+)/) || [null, variationRaw?.trim()];
                      const color = colorMatch[1] || 'Default';
                      
                      const storageMatch = cleanName.match(/(\d+GB)/i);
                      const storage = storageMatch ? storageMatch[1] : 'N/A';
                      
                      const countryMatch = cleanName.match(/(LA|TH|VN|US)/i);
                      const country = countryMatch ? countryMatch[1] : 'LA';

                      const conditionMatch = cleanName.match(/(SC|BNIB|USED)/i);
                      const condition = conditionMatch ? conditionMatch[1] : 'N/A';

                      if (!productsToAdd[cleanName]) {
                        productsToAdd[cleanName] = { name: cleanName, variations: [] };
                      }
                      
                      // Check if variation already exists in this product
                      if (!productsToAdd[cleanName].variations.some(v => v.sku === sku)) {
                        productsToAdd[cleanName].variations.push({
                          id: Math.random().toString(36).substr(2, 9),
                          sku: sku.trim(),
                          color,
                          storage,
                          countryCode: country,
                          condition
                        });
                      }
                    });

                    try {
                      setIsUpdatingStock(true);
                      const batch = writeBatch(db);
                      
                      for (const [name, data] of Object.entries(productsToAdd)) {
                        // Check if product exists
                        const existingProd = products.find(p => p.name === name);
                        if (existingProd) {
                          // Merge variations
                          const existingSkus = existingProd.variations.map(v => v.sku);
                          const newVars = data.variations.filter(v => !existingSkus.includes(v.sku));
                          if (newVars.length > 0) {
                            batch.update(doc(db, 'products', existingProd.id), {
                              variations: [...existingProd.variations, ...newVars],
                              updatedAt: serverTimestamp()
                            });
                          }
                        } else {
                          // Create new product
                          const newProdRef = doc(collection(db, 'products'));
                          batch.set(newProdRef, {
                            name,
                            variations: data.variations,
                            createdAt: serverTimestamp()
                          });
                        }
                      }
                      
                      await batch.commit();
                      alert("Import successful!");
                      setIsBulkImportOpen(false);
                      setBulkInput('');
                    } catch (e) {
                      console.error(e);
                      alert("Import failed. Check console.");
                    } finally {
                      setIsUpdatingStock(false);
                    }
                  }}
                  className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
                >
                  {isUpdatingStock ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : <Save className="w-4 h-4" />}
                  Process Import
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Storage</label>
              <select 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                value={filters.storage}
                onChange={(e) => setFilters({ ...filters, storage: e.target.value })}
              >
                <option value="">All Storage</option>
                {uniqueValues.storages.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Color</label>
              <select 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                value={filters.color}
                onChange={(e) => setFilters({ ...filters, color: e.target.value })}
              >
                <option value="">All Colors</option>
                {uniqueValues.colors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Country</label>
              <select 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                value={filters.countryCode}
                onChange={(e) => setFilters({ ...filters, countryCode: e.target.value })}
              >
                <option value="">All Countries</option>
                {uniqueValues.countries.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Condition</label>
              <select 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                value={filters.condition}
                onChange={(e) => setFilters({ ...filters, condition: e.target.value })}
              >
                <option value="">All Conditions</option>
                {uniqueValues.conditions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            {Object.values(filters).some(f => f) && (
              <div className="col-span-2 md:col-span-4 flex justify-end">
                <button 
                  onClick={() => setFilters({ sku: '', storage: '', color: '', countryCode: '', condition: '' })}
                  className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear All Filters
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingMode && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  {editingProduct ? `Manage ${editingProduct.name}` : 'Register New Product'}
                </h3>
                <button 
                  onClick={() => { setIsAddingMode(false); setEditingProduct(null); }}
                  className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Product Model Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. iPhone 15 Pro Max"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Variations & Specs</label>
                    <button 
                      onClick={addVariation}
                      className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition-all border border-blue-100"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Add Variant
                    </button>
                  </div>

                  <div className="space-y-3">
                    {productForm.variations.map((v) => (
                      <div key={v.id} className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">SKU</label>
                          <input 
                            placeholder="e.g. I15PM-256-TI" 
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                            value={v.sku} onChange={(e) => updateVariation(v.id, 'sku', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Storage</label>
                          <input 
                            placeholder="e.g. 256GB" 
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                            value={v.storage} onChange={(e) => updateVariation(v.id, 'storage', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Color</label>
                          <input 
                            placeholder="e.g. Titanium" 
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                            value={v.color} onChange={(e) => updateVariation(v.id, 'color', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Country</label>
                          <input 
                            placeholder="e.g. LL/A" 
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                            value={v.countryCode} onChange={(e) => updateVariation(v.id, 'countryCode', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Condition</label>
                          <input 
                            placeholder="e.g. New" 
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                            value={v.condition} onChange={(e) => updateVariation(v.id, 'condition', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Initial Qty</label>
                          <div className="relative">
                            <input 
                              type="text"
                              placeholder="0" 
                              className={cn(
                                "w-full px-3 py-2 text-xs bg-white border rounded-md outline-none focus:border-blue-500 font-mono font-bold",
                                v.error ? "border-red-500 ring-1 ring-red-100" : "border-slate-200"
                              )}
                              value={v.initialQty || ''} 
                              onChange={(e) => updateVariation(v.id, 'initialQty', e.target.value)}
                            />
                            {v.error && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500">
                                <AlertCircle className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          {v.error && <p className="text-[8px] text-red-500 font-bold uppercase leading-tight mt-0.5">{v.error}</p>}
                        </div>
                        <button 
                          onClick={() => removeVariation(v.id)}
                          className="md:justify-self-end self-end p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {productForm.variations.length === 0 && (
                      <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                        <p className="text-xs font-medium">Define models and variations to manage stock levels effectively.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button 
                  onClick={async () => {
                    if (editingProduct && window.confirm(`Delete ${editingProduct.name} and all its variants?`)) {
                      try {
                        await deleteDoc(doc(db, 'products', editingProduct.id));
                        setIsAddingMode(false);
                        setEditingProduct(null);
                      } catch (error) {
                        console.error("Delete failed:", error);
                      }
                    }
                  }}
                  className="px-4 py-2 rounded-md font-semibold text-red-500 hover:bg-red-50 text-sm flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Product
                </button>
                <div className="flex gap-3">
                  <button onClick={() => { setIsAddingMode(false); setEditingProduct(null); }} className="px-6 py-2 rounded-md font-semibold text-slate-500 hover:bg-slate-100 text-sm">Cancel</button>
                  <button 
                    onClick={saveProduct}
                    className="bg-blue-600 text-white px-8 py-2 rounded-md font-semibold hover:bg-blue-700 transition-all flex items-center gap-2 text-sm shadow-sm"
                  >
                    {editingProduct ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingProduct ? 'Update Product' : 'Save Product'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6 pb-20">
        {filteredProducts.map((product) => (
          <div key={product.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
                  <Smartphone className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">{product.name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono">UID: {product.id.slice(0, 12)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => selectAllInProduct(product)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-600 bg-white px-2 py-1 rounded border border-slate-200 transition-colors uppercase tracking-tight"
                >
                  <CheckSquare className="w-3 h-3" />
                  Select All
                </button>
                <button 
                  onClick={() => openEditMode(product)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-600 bg-white px-2 py-1 rounded border border-slate-200 transition-colors uppercase tracking-tight"
                >
                  <PlusCircle className="w-3 h-3" />
                  Manage
                </button>
                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-tight">
                  <Box className="w-3.5 h-3.5" />
                  {product.variations.length} Variants
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {product.variations
                .filter(v => {
                  const s = search.toLowerCase();
                  const matchesSearch = !s || 
                    product.name.toLowerCase().includes(s) || 
                    v.storage.toLowerCase().includes(s) || 
                    v.color.toLowerCase().includes(s) || 
                    v.countryCode.toLowerCase().includes(s) || 
                    v.condition.toLowerCase().includes(s);

                  const matchesFilters = 
                    (!filters.sku || v.sku === filters.sku) &&
                    (!filters.storage || v.storage === filters.storage) &&
                    (!filters.color || v.color === filters.color) &&
                    (!filters.countryCode || v.countryCode === filters.countryCode) &&
                    (!filters.condition || v.condition === filters.condition);

                  return matchesSearch && matchesFilters;
                })
                .map((v) => {
                const totalStock = stocks
                  .filter(s => s.variationId === v.id && s.productId === product.id)
                  .reduce((acc, curr) => acc + curr.quantity, 0);

                const isSelected = selectedItems.some(item => item.productId === product.id && item.variationId === v.id);

                return (
                  <div 
                    key={v.id} 
                    onClick={() => toggleSelection(product.id, v.id)}
                    className={cn(
                      "bg-white rounded-xl p-4 border transition-all cursor-pointer relative group",
                      isSelected ? "border-blue-500 bg-blue-50/30 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-300 hover:shadow-md"
                    )}
                  >
                    <div className="absolute top-3 right-3">
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-200 group-hover:text-slate-300" />
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap gap-1">
                          {v.sku && <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[8px] font-black uppercase tracking-tighter shadow-sm">{v.sku}</span>}
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] border border-slate-200 font-bold text-slate-500">{v.storage}</span>
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] border border-slate-200 font-bold text-slate-500">{v.countryCode}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-1">{v.color} <span className="text-slate-400 font-medium">({v.condition})</span></p>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-lg text-sm font-black border tabular-nums flex items-center gap-2 group/stock",
                        totalStock > 5 ? "bg-white text-blue-600 border-blue-200 shadow-sm" : 
                        totalStock > 0 ? "bg-amber-50 text-amber-600 border-amber-200" :
                        "bg-slate-50 text-slate-300 border-slate-200"
                      )}>
                        {totalStock}
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchHistory(v.id, product.name, `${v.storage} ${v.color}`);
                            }}
                            className="opacity-0 group-hover/stock:opacity-100 p-0.5 hover:bg-slate-100 rounded transition-all text-slate-400 hover:text-slate-600"
                            title="View History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddStockForm({
                                productId: product.id,
                                variationId: v.id,
                                productName: product.name,
                                variationLabel: `${v.storage} ${v.color}`,
                                locationId: locations[0]?.id || '',
                                quantity: '1',
                                error: ''
                              });
                              setShowAddStockModal(true);
                            }}
                            className="opacity-0 group-hover/stock:opacity-100 p-0.5 hover:bg-blue-100 rounded transition-all text-blue-500"
                            title="Quick Add"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 min-h-[40px]">
                       {locations.length > 0 ? locations.map(loc => {
                         const locStock = stocks.find(s => s.locationId === loc.id && s.variationId === v.id)?.quantity || 0;
                         return (
                           <div key={loc.id} className="flex items-center justify-between text-[10px] font-medium transition-colors">
                             <div className="flex items-center gap-1.5 min-w-0 text-slate-500">
                               <MapPin className={cn("w-3 h-3 flex-shrink-0", locStock > 0 ? "text-blue-400" : "text-slate-300")} />
                               <span className="truncate">{loc.name}</span>
                             </div>
                             <span className={cn(
                               "font-bold tabular-nums",
                               locStock > 0 ? "text-slate-900" : "text-slate-200"
                             )}>{locStock}</span>
                           </div>
                         );
                       }) : (
                         <p className="text-[9px] text-slate-300 italic text-center">No locations mapped</p>
                       )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 && !isAddingMode && (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-neutral-200">
             <Box className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
             <p className="text-neutral-500 font-medium">No products found. Start by adding one!</p>
          </div>
        )}
      </div>

      {/* Bulk Actions Toolbar */}
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4"
          >
            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center gap-4 pl-2">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs ring-2 ring-slate-900">
                    {selectedItems.length}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight">Variations Selected</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Across multiple products</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedItems([])}
                  className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
                <button 
                  onClick={handleBulkDelete}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Selected
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddStockModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">Add Stock</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Adjusting inventory levels</p>
                  </div>
                </div>
                <button onClick={() => setShowAddStockModal(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Target Variation</p>
                  <p className="text-sm font-bold text-slate-800">{addStockForm.productName}</p>
                  <p className="text-xs text-blue-600 font-medium">{addStockForm.variationLabel}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Target Location</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 font-medium"
                      value={addStockForm.locationId}
                      onChange={(e) => setAddStockForm({ ...addStockForm, locationId: e.target.value })}
                    >
                      {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Quantity to Add</label>
                    <div className="relative">
                      <input 
                        type="text"
                        className={cn(
                          "w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-lg font-black outline-none transition-all tabular-nums",
                          addStockForm.error ? "border-red-500 text-red-600 focus:border-red-500" : "border-slate-200 text-blue-600 focus:border-blue-500"
                        )}
                        value={addStockForm.quantity}
                        onChange={(e) => {
                          const val = e.target.value;
                          let error = '';
                          if (val !== "" && !/^\d+$/.test(val)) {
                            error = 'Quantity must be a non-negative integer';
                          }
                          setAddStockForm({ ...addStockForm, quantity: val, error });
                        }}
                        autoFocus
                      />
                      {addStockForm.error && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    {addStockForm.error && (
                      <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight mt-1 pl-1">
                        {addStockForm.error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowAddStockModal(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleQuickAddStock}
                    disabled={isUpdatingStock}
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400"
                  >
                    {isUpdatingStock ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Confirm Add
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
                    <History className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">Stock Movement History</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedHistoryTarget.productName}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">{selectedHistoryTarget.variationLabel}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-0 max-h-[60vh] overflow-y-auto">
                {isLoadingHistory ? (
                  <div className="p-20 flex flex-col items-center justify-center gap-4">
                    <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tracing Movements...</p>
                  </div>
                ) : historyItems.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Reference</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Movement</th>
                        <th className="px-6 py-3">Location</th>
                        <th className="px-6 py-3">Personnel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-medium text-slate-500 whitespace-nowrap">{item.date}</td>
                          <td className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter">#{item.reference}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border",
                              item.type === 'SALE' ? "bg-red-50 text-red-600 border-red-100" :
                              item.type === 'PURCHASE' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              "bg-blue-50 text-blue-600 border-blue-100"
                            )}>
                              {item.type === 'SALE' ? <TrendingDown className="w-3 h-3" /> : 
                               item.type === 'PURCHASE' ? <TrendingUp className="w-3 h-3" /> : 
                               <ArrowRightLeft className="w-3 h-3" />}
                              {item.type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "text-sm font-black tabular-nums",
                              item.type === 'SALE' ? "text-red-500" : "text-emerald-500"
                            )}>
                              {item.type === 'SALE' ? '-' : '+'}{item.quantity}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                              <MapPin className="w-3 h-3 text-slate-300" />
                              {item.location}
                            </div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{item.partner}</p>
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-700">{item.staff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-20 text-center space-y-4">
                    <History className="w-12 h-12 text-slate-200 mx-auto" />
                    <div>
                      <p className="text-slate-800 font-bold">No history found</p>
                      <p className="text-xs text-slate-400 mt-1">This variation has no recorded transactions yet.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/30 flex justify-end">
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="px-8 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all shadow-sm"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
