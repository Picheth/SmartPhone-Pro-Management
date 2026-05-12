export interface Variation {
  id: string;
  sku: string;
  storage: string;
  color: string;
  countryCode: string;
  condition: string;
}

export interface Product {
  sku?: string;
  type?: string;
  brand?: string;
  id: string;
  name: string;
  variations: Variation[];
  createdAt: any;
}

export interface Stock {
  id: string; // locationId_variationId
  locationId: string;
  variationId: string;
  productId: string;
  quantity: number;
  lastUpdated: any;
}

export interface Partner {
  id: string;
  code: string;
  name: string;
  type?: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  type: 'Main' | 'Sub';
  parentCode?: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
}

export interface Dealer {
  id: string;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  type?: 'Master' | 'Sub';
}

export type TransactionType = 'SALE' | 'PURCHASE' | 'TRANSFER';

export interface Transaction {
  id: string;
  type: TransactionType;
  items: Array<{
    productId: string;
    productName: string;
    variationId: string;
    sku?: string;
    quantity: number;
    price?: number;
    unitPrice?: number;
    tax?: number;
    warranty?: string;
  }>;
  locationId: string;
  fromLocationId?: string;
  partnerId?: string;
  partnerName?: string;
  partnerType?: 'Supplier' | 'Customer' | 'Dealer';
  staffName: string;
  timestamp: any;
  date?: string;
  note?: string;
  referenceNo?: string;
  purchaseStatus?: 'Ordered' | 'Pending' | 'Received';
  paymentStatus?: 'Paid' | 'Partial' | 'Due';
  paymentMethod?: 'Cash' | 'Bank' | 'Credit';
  taxAmount?: number;
  total?: number;
}

export interface StockTransfer {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  items: Array<{
    productId: string;
    variationId: string;
    productName: string;
    quantity: number;
  }>;
  staffName: string;
  timestamp: any;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  note?: string;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  referenceNo: string;
  partnerId: string;
  partnerName: string;
  locationId: string;
  items: Array<{
    productId: string;
    productName: string;
    variationId: string;
    quantity: number;
    price: number;
    tax: number;
  }>;
  staffName: string;
  status: 'Draft' | 'Sent' | 'Cancelled';
  total: number;
  taxAmount: number;
  timestamp: any;
}

// Locations are now dynamic, fetched from Firestore
