// Auto-generated from productSpecs.json
export interface ProductSpec {
  productId: string;
  name: string;
  brand: string;
  category: string;
  subCategory?: string;
  shortModel: string;
  model: string;
  processor?: string[];
  processorCodes?: { [key: string]: string };
  ram?: string[];
  ramCodes?: { [key: string]: string };
  storages: string[];
  storageCodes?: { [key: string]: string };
  colors: string[];
  colorCodes?: { [key: string]: string };
  regions: string[];
  regionCodes?: { [key: string]: string };
  conditions: string[];
  conditionCodes?: { [key: string]: string };
  status: string;
  displaySize?: string; // Added for Tablets and Laptops
}

import productData from './productSpecs.json';

const rawProductSpecs: Array<Omit<ProductSpec, 'productId' | 'name'>> = [
  ...(productData.MobilePhoneModels ?? []),
  ...(productData.TabletModels ?? []),
  ...(productData.LaptopModels ?? []),
  ...(productData.WatchModels ?? []),
  ...(productData.AccessoryModels ?? []),
];

export const productSpecs: ProductSpec[] = rawProductSpecs.map((spec) => ({
  productId: spec.shortModel,
  name: `${spec.brand} ${spec.model}`,
  ...spec,
}));

export const getProductSpecByModel = (model: string): ProductSpec | undefined => {
  return productSpecs.find(spec => spec.model === model);
};

export const getAvailableModels = (): string[] => {
  return productSpecs.map(spec => spec.model);
};

export const getColorsByModel = (model: string): string[] => {
  const spec = getProductSpecByModel(model);
  return spec ? spec.colors : [];
};

export const getStoragesByModel = (model: string): string[] => {
  const spec = getProductSpecByModel(model);
  return spec ? spec.storages : [];
};

export const getRegionsByModel = (model: string): string[] => {
  const spec = getProductSpecByModel(model);
  return spec ? spec.regions : [];
};

export const getConditionsByModel = (model: string): string[] => {
  const spec = getProductSpecByModel(model);
  return spec ? spec.conditions : [];
};
