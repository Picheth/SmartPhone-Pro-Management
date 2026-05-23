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
  Package,
  ShoppingBasket,
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
  ArrowRightLeft,
  Tag
} from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp, setDoc, doc, updateDoc, deleteDoc, writeBatch, runTransaction, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { productSpecs as productModelSpecs } from '../../productSpecs';
import { Product, Variation, Stock, Location, Transaction } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useToast } from '../auth/ToastContext';

const PRODUCT_TYPES = [
  "Mobile Phone",
  "Tablet",
  "Laptop",
  "PC / Desktop",
  "Smartwatch",
  "Accessory",
  "Repair Parts",
  "Material"
];

type ProductModelSpec = {
  brand: string;
  model: string;
  productId?: string;
  name?: string;
  category?: string;
  subCategory?: string;
  shortModel?: string;
  processor?: string[];
  ram?: string[];
  displaySize?: string;
  processorCodes?: { [key: string]: string };
  ramCodes?: { [key: string]: string };
  storageCodes?: { [key: string]: string };
  colorCodes?: { [key: string]: string };
  regionCodes?: { [key: string]: string };
  conditionCodes?: { [key: string]: string };
};

const allProductSpecs: ProductModelSpec[] = productModelSpecs;

const productModelTypes = ['Mobile Phone', 'Tablet', 'Laptop', 'PC', 'PC / Desktop', 'Smart Watch', 'Smartwatch', 'Accessory', 'Repair Parts', 'Material'];

const getModelSpecsForType = (type: string): ProductModelSpec[] | undefined => {
  switch (type) {
    case 'Mobile Phone':
      return allProductSpecs.filter(s => s.category === 'Phone' || !s.category);
    case 'Tablet':
      return allProductSpecs.filter(s => s.category === 'Tablet');
    case 'Laptop':
      return allProductSpecs.filter(s => s.category === 'Laptop');
    case 'Smart Watch':
    case 'Smartwatch':
      return allProductSpecs.filter(s => s.category === 'Smartwatch');
    case 'PC':
    case 'PC / Desktop':
      return [];
    case 'Accessory':
      return allProductSpecs.filter(s => s.category === 'Accessory');
    case 'Repair Parts':
      return [];
    case 'Material':
      return [];
    default:
      return undefined;
  }
};

const getRegionNameFromCode = (spec: ProductModelSpec, countryCode: string) => {
  if (!countryCode) return '';
  const region = Object.entries(spec.regionCodes || {}).find(([, code]) => code === countryCode)?.[0];
  return region || countryCode;
};

const buildProductId = (spec: ProductModelSpec, variation?: Partial<Variation>) => {
  const shortModel = spec.shortModel || spec.productId || '';
  const displaySizeCode = (spec.category === 'Tablet' || spec.category === 'Laptop') && spec.displaySize
    ? spec.displaySize.replace(/-inch/g, '') // e.g., "13-inch" becomes "13"
    : '';
  const procCode = variation?.processor ? spec.processorCodes?.[variation.processor] || variation.processor?.replace(/\s+/g, '') : '';
  const ramCode = variation?.ram ? spec.ramCodes?.[variation.ram] || variation.ram.replace(/GB|TB/g, '') : '';
  const storageCode = variation?.storage ? spec.storageCodes?.[variation.storage] || variation.storage.replace(/GB|TB/g, '') : '';
  const colorCode = variation?.color ? spec.colorCodes?.[variation.color] || variation.color.split(/\s+/).map(word => word[0]).join('').toUpperCase() : '';
  return [shortModel, displaySizeCode, procCode, ramCode, storageCode, colorCode].filter(Boolean).join('-');
};

const buildProductName = (spec: ProductModelSpec, variation?: Partial<Variation>) => {
  const procCode = variation?.processor ? spec.processorCodes?.[variation.processor] || variation.processor.replace(/\s+/g, '') : '';
  const ramCode = variation?.ram ? spec.ramCodes?.[variation.ram] || variation.ram.replace(/GB|TB/g, '') : '';

  return [
    spec.model,
    procCode,
    ramCode,
    variation?.storage,
    variation?.color,
    variation?.countryCode ? getRegionNameFromCode(spec, variation.countryCode) : '',
    variation?.condition,
  ].filter(Boolean).join(' ');
};

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    sku: '',
    productId: '',
    storage: '',
    color: '',
    countryCode: '',
    condition: '',
    type: ''
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
  const [bulkStockLocationId, setBulkStockLocationId] = useState('');
  const [showBulkStockModal, setShowBulkStockModal] = useState(false);
  const [bulkStockQuantity, setBulkStockQuantity] = useState('');
  const [isUpdatingBulkStock, setIsUpdatingBulkStock] = useState(false);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkPriceValue, setBulkPriceValue] = useState('');
  const [isUpdatingBulkPrice, setIsUpdatingBulkPrice] = useState(false);
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
    type: 'Mobile Phone',
    brand: '',
    productId: '',
    category: '',
    subCategory: '',
    destinationLocation: '',
    model: '',
    shortModel: '',
    displaySize: '', // Initialize displaySize
    sku: '',
    variations: [] as (Variation & { initialQty?: string, price?: string, error?: string })[]
  });

  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const getProductOptions = () => getModelSpecsForType(productForm.type);
  const productOptions = getProductOptions() ?? [];

  const handleProductNameChange = (model: string) => {
    const spec = productOptions.find(option => option.model === model);
    setProductForm({
      ...productForm,
      name: spec ? buildProductName(spec) : model,
      brand: spec?.brand || productForm.brand,
      productId: spec ? buildProductId(spec) : '',
      category: spec?.category || '',
      subCategory: spec?.subCategory || '',
      destinationLocation: productForm.destinationLocation,
      model,
      shortModel: spec?.shortModel || '',
      displaySize: spec?.displaySize || '', // Update displaySize when model changes
      sku: '',
    });
  };

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
      variations: [...prev.variations, { id, sku: '', storage: '', color: '', countryCode: '', condition: '', initialQty: '0', price: '0' }]
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
      ...(() => {
        const variations = prev.variations.map(v => {
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
          
          if (field === 'price') {
            if (value !== "" && !/^\d+(\.\d+)?$/.test(value)) {
              updated.error = 'Price must be a valid number';
            } else {
              delete updated.error;
            }
          }
          
          return updated;
        }
        return v;
        });
        const spec = productModelSpecs.find(s => s.model === prev.model || s.model === prev.name);
        const activeVariation = variations.find(v => v.id === id) || variations[0];
        const autoFields = spec ? {
          productId: buildProductId(spec, activeVariation),
          brand: spec.brand,
          category: spec.category,
          subCategory: spec.subCategory,
          model: spec.model,
          shortModel: spec.shortModel,
        } : {};
        const newName = spec ? buildProductName(spec, activeVariation) : prev.name;

        return {
          ...prev,
          ...autoFields,
          name: newName,
          variations,
        };
      })()
    }));
  };

  const openAddMode = () => {
    setProductForm({ name: '', type: 'Mobile Phone', brand: '', productId: '', category: '', subCategory: '', destinationLocation: '', model: '', shortModel: '', sku: '', displaySize: '', variations: [] });
    setEditingProduct(null);
    setIsAddingMode(true);
  };

  const openEditMode = (product: Product) => {
    setProductForm({
      brand: product.brand || '',
      name: product.name,
      type: product.type || 'Mobile Phone',
      productId: product.productId || '',
      category: product.category || '',
      subCategory: product.subCategory || '',
      destinationLocation: product.destinationLocation || '',
      model: product.model || product.name,
      shortModel: product.shortModel || '',
      displaySize: product.displaySize || '', // Populate displaySize from existing product
      sku: product.sku || '',
      variations: [...product.variations],
    });
    setEditingProduct(product);
    setIsAddingMode(true);
  };

  const saveProduct = async () => {
    const trimmedName = productForm.name.trim();
    if (!trimmedName) {
      addToast("Product name is required.", "error");
      return;
    }

    if (!productForm.type) {
      addToast("Please select a product category type.", "error");
      return;
    }

    if (trimmedName.length > 200) {
      addToast("Product name is too long (Max 200 characters).", "error");
      return;
    }
    
    if (!productForm.brand.trim()) {
      addToast("Product brand is required.", "error");
      return;
    }

    if (productForm.variations.some(v => v.error)) {
      addToast("Please fix validation errors before saving.", "error");
      return;
    }

    // Add validation for mandatory fields
    if (!productForm.model.trim()) {
      addToast("Product model is required.", "error");
      return;
    }

    // Validate that a location is selected if initial stock is being added
    const hasInitialStock = productForm.variations.some(v => parseInt(v.initialQty || '0') > 0);
    if (hasInitialStock && !productForm.destinationLocation) {
      addToast("Please select a Destination Location to record your initial stock levels.", "warning");
      return;
    }

    const spec = productOptions.find(option => option.model === productForm.model);
    const displaySizeToSave = (spec && (spec.category === 'Tablet' || spec.category === 'Laptop')) ? spec.displaySize : undefined;

    try {
      let productId = editingProduct?.id;
      const cleanVariations = productForm.variations.map(({ initialQty, error, ...rest }) => rest);

      // Build product data object, only include displaySize if defined
      const productData: any = {
        productId: productForm.productId,
        name: trimmedName,
        brand: productForm.brand.trim(),
        category: productForm.category,
        subCategory: productForm.subCategory,
        destinationLocation: productForm.destinationLocation.trim(),
        model: productForm.model || trimmedName,
        shortModel: productForm.shortModel,
        sku: productForm.sku,
        type: productForm.type,
        variations: cleanVariations,
        ...(editingProduct ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() })
      };
      if (displaySizeToSave !== undefined) {
        productData.displaySize = displaySizeToSave;
      }
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        const docRef = await addDoc(collection(db, 'products'), productData);
        productId = docRef.id;
      }

      // Handle Initial Stock if provided and at least one location exists
      if (locations.length > 0 && productId) {
        const batch = writeBatch(db);
        let hasStockUpdates = false;
        // Use selected destination or fallback to the first available location
        const targetLocationId = productForm.destinationLocation || locations[0].id;

        productForm.variations.forEach(v => {
          const qty = parseInt(v.initialQty || '0');
          if (qty > 0) {
            // FIX: Use the target location instead of hardcoded locations[0]
            const stockDocId = `${targetLocationId}_${v.id}`;
            const stockRef = doc(db, 'stock', stockDocId);
            batch.set(stockRef, {
              locationId: targetLocationId,
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

      setProductForm({ name: '', type: 'Mobile Phone', brand: '', productId: '', category: '', subCategory: '', destinationLocation: '', model: '', shortModel: '', displaySize: '', sku: '', variations: [] });
      setEditingProduct(null);
      setIsAddingMode(false);
    } catch (error) {
      console.error("Save failed:", error);
      addToast("Error saving product. Check your connection.", "error");
    }
  };

  const filteredProducts = products.filter(p => {
    const s = search.toLowerCase();
    const nameMatch = p.name.toLowerCase().includes(s);
    const typeMatch = !filters.type || p.type === filters.type;

    // If no search query and no specific variation filters, show the product
    if (!s && !filters.sku && !filters.storage && !filters.color && !filters.countryCode && !filters.condition) {
      return typeMatch;
    }

    // Check if any variation matches the specific filters AND the search query
    const hasMatchingVariation = p.variations.length === 0 ? nameMatch : p.variations.some(v => {
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

    return hasMatchingVariation && typeMatch;
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

  const handleBulkPriceUpdate = async () => {
    if (!bulkPriceValue || isNaN(parseFloat(bulkPriceValue))) {
      addToast("Please enter a valid price.", "error");
      return;
    }

    setIsUpdatingBulkPrice(true);
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
          const updatedVariations = product.variations.map(v => 
            varIds.includes(v.id) ? { ...v, price: bulkPriceValue } : v
          );
          batch.update(doc(db, 'products', productId), {
            variations: updatedVariations,
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      setSelectedItems([]);
      setShowBulkPriceModal(false);
      setBulkPriceValue('');
      setBulkStockLocationId(''); // Clear location on close
    } catch (error) {
      console.error("Bulk price update failed:", error);
      addToast("Failed to update prices.", "error");
    } finally {
      setIsUpdatingBulkPrice(false);
    }
  };

  const handleBulkStockUpdate = async () => {
    const qtyChange = parseInt(bulkStockQuantity);
    if (isNaN(qtyChange) || bulkStockQuantity === '') {
      addToast("Please enter a valid quantity to adjust stock.", "error");
      return;
    }
    if (!bulkStockLocationId) {
      addToast("Please select a location for the bulk stock adjustment.", "error");
      return;
    }


    if (!window.confirm(`Are you sure you want to adjust stock by ${qtyChange} for ${selectedItems.length} selected variations?`)) {
      return;
    }

    setIsUpdatingBulkStock(true);
    try {
      await runTransaction(db, async (transaction) => {
        const stockUpdates: Map<string, { productId: string, variationId: string, locationId: string, currentQty: number }> = new Map();

        // First, get all relevant stock documents
        for (const item of selectedItems) {
          const stockDocId = `${bulkStockLocationId}_${item.variationId}`;
          const stockRef = doc(db, 'stock', stockDocId);

          const stockSnap = await transaction.get(stockRef);

          stockUpdates.set(stockDocId, {
            productId: item.productId,
            variationId: item.variationId,
          locationId: bulkStockLocationId,
            currentQty: stockSnap.exists() ? stockSnap.data().quantity : 0
          }); 
        }

        // Then, apply updates
        for (const [stockDocId, data] of stockUpdates.entries()) {
          const stockRef = doc(db, 'stock', stockDocId);
          transaction.set(stockRef, {
            locationId: data.locationId,
            variationId: data.variationId, // Ensure variationId is passed
            productId: data.productId,
            quantity: data.currentQty + qtyChange,
            lastUpdated: serverTimestamp()
          }, { merge: true });
        }
      });
      setSelectedItems([]);
      setShowBulkStockModal(false);
      setBulkStockQuantity('');
      setBulkStockLocationId(''); // Clear location on close
    } catch (error) {
      console.error("Bulk stock update failed:", error);
      addToast(error instanceof Error ? error.message : "Failed to update stock.", "error");
    } finally {
      setIsUpdatingBulkStock(false);
    }
  };

  const handleQuickAddStock = async () => {
    const qty = parseInt(addStockForm.quantity);
    if (!addStockForm.locationId) {
      addToast("Please select a location.", "error");
      return;
    }
    if (isNaN(qty) || qty <= 0 || addStockForm.error) {
      addToast(addStockForm.error || "Please enter a valid positive quantity.", "error");
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
      addToast("Error updating stock. Check your connection.", "error");
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
      addToast("Could not load history. Check your connection.", "error");
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
                      addToast("Import successful!", "success");
                      setIsBulkImportOpen(false);
                      setBulkInput('');
                    } catch (e) {
                      console.error(e);
                      addToast("Import failed. Check console.", "error");
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Product Type</label>
              <select 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              >
                <option value="">All Categories</option>
                {PRODUCT_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
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
                  onClick={() => setFilters({ productId: '', sku: '', storage: '', color: '', countryCode: '', condition: '', type: '' })}
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Brand</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Apple"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                      value={productForm.brand || ''}
                      onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                    />
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                      {productModelTypes.includes(productForm.type) ? `Select ${productForm.type} Model` : 'Product Model Name'}
                    </label>
                    {productOptions.length > 0 ? (
                      <select 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                        value={productForm.model || productForm.name}
                        onChange={(e) => handleProductNameChange(e.target.value)}
                      >
                        <option value="">Choose a model...</option>
                        {productOptions.map(spec => (
                          <option key={spec.model} value={spec.model}>{spec.brand} {spec.model}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        placeholder="e.g. AirPods Pro 2"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                        value={productForm.name}
                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value, model: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Category Type</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                      value={productForm.type}
                      onChange={(e) => setProductForm({ ...productForm, type: e.target.value, name: '', brand: '', productId: '', category: '', subCategory: '', destinationLocation: '', model: '', shortModel: '', sku: '' })}
                    >
                      {PRODUCT_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Destination Location</label>
                    <select 
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 font-medium"
                       value={productForm.destinationLocation}
                       onChange={e => setProductForm({ ...productForm, destinationLocation: e.target.value })}
                    >
                       <option value="">Select Location...</option>
                       {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">ProductID (AutoSync)</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="IP15PM-256-BT"
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 outline-none font-mono"
                      value={productForm.productId}
                    />
                  </div>
                  {productForm.displaySize && (productForm.category === 'Tablet' || productForm.category === 'Laptop') && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Display Size</label>
                      <input type="text" readOnly className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 outline-none" value={productForm.displaySize} />
                    </div>
                  )}
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
                      <div key={v.id} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-10 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                        {(() => {
                          const spec = productModelSpecs.find(s => s.model === productForm.model || s.model === productForm.name);
                          return (
                            <>
                              <div className="space-y-1">
                                <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">SKU</label>
                                <input 
                                  placeholder="e.g. 2700043-5" 
                                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                                  value={v.sku} onChange={(e) => updateVariation(v.id, 'sku', e.target.value)}
                                />
                              </div>
                              {spec?.ram && (
                                <div className="space-y-1">
                                  <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">RAM</label>
                                  <select 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.ram || ''} onChange={(e) => updateVariation(v.id, 'ram', e.target.value)}
                                  >
                                    <option value="">Select...</option>
                                    {spec.ram.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                              )}
                              {spec?.processor && (
                                <div className="space-y-1">
                                  <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Processor</label>
                                  <select 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.processor || ''} onChange={(e) => updateVariation(v.id, 'processor', e.target.value)}
                                  >
                                    <option value="">Select...</option>
                                    {spec.processor.map(p => <option key={p} value={p}>{p}</option>)}
                                  </select>
                                </div>
                              )}
                              <div className="space-y-1">
                                <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Storage</label>
                                {spec ? (
                                  <select 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.storage} onChange={(e) => updateVariation(v.id, 'storage', e.target.value)}
                                  >
                                    <option value="">Select...</option>
                                    {spec.storages.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                ) : (
                                  <input 
                                    placeholder="e.g. 256GB" 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.storage} onChange={(e) => updateVariation(v.id, 'storage', e.target.value)}
                                  />
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Color</label>
                                {spec ? (
                                  <select 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.color} onChange={(e) => updateVariation(v.id, 'color', e.target.value)}
                                  >
                                    <option value="">Select...</option>
                                    {spec.colors.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                ) : (
                                  <input 
                                    placeholder="e.g. Titanium" 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.color} onChange={(e) => updateVariation(v.id, 'color', e.target.value)}
                                  />
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Region / Country</label>
                                {spec ? (
                                  <select 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.countryCode} 
                                    onChange={(e) => updateVariation(v.id, 'countryCode', e.target.value)}
                                  >
                                    <option value="">Select...</option>
                                    {spec.regions.map(r => {
                                      const code = spec.regionCodes?.[r] || r;
                                      return <option key={r} value={code}>{r} ({code})</option>;
                                    })}
                                  </select>
                                ) : (
                                  <input 
                                    placeholder="e.g. LL/A" 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.countryCode} onChange={(e) => updateVariation(v.id, 'countryCode', e.target.value)}
                                  />
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Condition</label>
                                {spec ? (
                                  <select 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.condition} onChange={(e) => updateVariation(v.id, 'condition', e.target.value)}
                                  >
                                    <option value="">Select...</option>
                                    {spec.conditions.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                ) : (
                                  <input 
                                    placeholder="e.g. New" 
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500"
                                    value={v.condition} onChange={(e) => updateVariation(v.id, 'condition', e.target.value)}
                                  />
                                )}
                              </div>
                            </>
                          );
                        })()}
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase pl-0.5">Price</label>
                          <input 
                            placeholder="0" 
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono font-bold text-emerald-600"
                            value={v.price || ''} onChange={(e) => updateVariation(v.id, 'price', e.target.value)}
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
                  {product.displaySize && (product.category === 'Tablet' || product.category === 'Laptop') && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-semibold">
                      {product.displaySize}
                    </span>
                  )}
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
                          {v.processor && <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] border border-slate-200 font-bold text-blue-600">{v.processor}</span>}
                          {v.ram && <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] border border-slate-200 font-bold text-blue-600">{v.ram}</span>}
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] border border-slate-200 font-bold text-slate-500">{v.storage}</span>
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] border border-slate-200 font-bold text-slate-500">{v.countryCode}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-1">{v.color} <span className="text-slate-400 font-medium">({v.condition})</span></p>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-lg text-sm font-black border tabular-nums flex items-center gap-2 group/stock",
                        totalStock < 0 ? "bg-red-50 text-red-600 border-red-500 animate-pulse" :
                        totalStock > 5 ? "bg-white text-blue-600 border-blue-200 shadow-sm" : 
                        totalStock > 0 ? "bg-amber-50 text-amber-600 border-amber-200" :
                        "bg-slate-50 text-slate-300 border-slate-200"
                      )}>
                        {totalStock < 0 && <AlertCircle className="w-3.5 h-3.5" />}
                        {totalStock}
                        <div className="flex items-center gap-1">
                          {totalStock < 0 && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent('switch-tab', { 
                                  detail: { 
                                    tab: 'transactions', 
                                    type: 'PURCHASE',
                                    productId: product.id,
                                    variationId: v.id,
                                    suggestedQty: Math.abs(totalStock)
                                  } 
                                }));
                              }}
                              className="p-0.5 hover:bg-red-100 rounded transition-all text-red-600"
                              title="Quick Restock (Purchase Order)"
                            >
                              <ShoppingBasket className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                               locStock < 0 ? "text-red-500" :
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
                  onClick={() => setShowBulkStockModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
                >
                  <Package className="w-4 h-4" />
                  Adjust Stock
                </button>
                <button 
                  onClick={() => setShowBulkPriceModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
                >
                  <Tag className="w-4 h-4" />
                  Set Price
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
        {showBulkPriceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                    <Tag className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">Bulk Price Update</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update price for {selectedItems.length} items</p>
                  </div>
                </div>
                <button onClick={() => setShowBulkPriceModal(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">New Unit Price ($)</label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black outline-none transition-all tabular-nums text-emerald-600 focus:border-emerald-500"
                      value={bulkPriceValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^\d+(\.\d+)?$/.test(val)) {
                          setBulkPriceValue(val);
                        }
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowBulkPriceModal(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleBulkPriceUpdate}
                    disabled={isUpdatingBulkPrice}
                    className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400"
                  >
                    {isUpdatingBulkPrice ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Update Prices
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
        {showBulkStockModal && (
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
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">Bulk Stock Adjustment</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Adjust stock for {selectedItems.length} items</p>
                  </div>
                </div>
                <button onClick={() => setShowBulkStockModal(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Target Location</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black outline-none transition-all text-blue-600 focus:border-blue-500"
                    value={bulkStockLocationId}
                    onChange={(e) => setBulkStockLocationId(e.target.value)}
                  >
                    <option value="">Select Location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Quantity to Add/Subtract</label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="e.g., 5 (add 5) or -3 (subtract 3)"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black outline-none transition-all tabular-nums text-blue-600 focus:border-blue-500"
                      value={bulkStockQuantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^-?\d+$/.test(val)) { // Allow negative numbers
                          setBulkStockQuantity(val);
                        }
                      }}
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium mt-1 pl-1">
                    Enter a positive number to add stock, or a negative number to subtract. This will apply to the selected location.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowBulkStockModal(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleBulkStockUpdate} // Ensure this is called
                    disabled={isUpdatingBulkStock || bulkStockQuantity === '' || !bulkStockLocationId}
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400"
                  >
                    {isUpdatingBulkStock ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Adjust Stock
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
