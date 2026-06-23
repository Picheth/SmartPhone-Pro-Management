import { useState, useCallback } from 'react';

export interface BusinessInfo {
  name: string;
  tagline: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
}

const SETTINGS_KEY = 'app_settings';

export interface UIPreferences {
  darkMode: 'light' | 'dark' | 'system';
  compactMode: boolean;
}

export interface PrintDefaults {
  defaultQuantity: number;
  showPrice: boolean;
  labelSize: '40x25' | '50x30' | '40x11' | '30x20' | '60x35' | '70x40' | '80x50' | '90x60' | '100x70' | '110x80' | '120x90' | '130x100' | '140x110' | '150x120' | '160x130' | '170x140' | '180x150' | '190x160' | '200x170' | '210x180' | '220x190' | '230x200' | '240x210' | '250x220' | '300x250' | '350x300' | '400x350' | '450x400' | '500x450' | '550x500' | '600x550' | '650x600' | '700x650' | '750x700' | '800x750' | '850x800' | '900x850' | '950x900' | '1000x950' | '1050x1000' | '1100x1050' | '1150x1100' | '1200x1150' | '1250x1200' | '1300x1250' | '1350x1300' | '1400x1350' | '1450x1400' | '1500x1450' | '1550x1500' | '1600x1550' | '1650x1600' | '1700x1650' | '1750x1700' | '1800x1750' | '1850x1800' | '1900x1850' | '1950x1900' | '2000x1950';
  orientation: 'portrait' | 'landscape';
}

export interface AppSettings {
  branding: BusinessInfo;
  ui: UIPreferences;
  print: PrintDefaults;
}

const DEFAULT_SETTINGS: AppSettings = {
  branding: {
    name: 'គ្នាយើង Phone Shop Management',
    tagline: 'Professional Repair Service',
    logoUrl: '',
    phone: '',
    address: ''
  },
  ui: {
    darkMode: 'system',
    compactMode: false
  },
  print: {
    defaultQuantity: 1,
    showPrice: true,
    labelSize: '40x25',
    orientation: 'landscape'
  }
};

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
      
      // Migration from old single-category key
      const oldSaved = localStorage.getItem('business_branding');
      if (oldSaved) {
        const branding = JSON.parse(oldSaved);
        return { ...DEFAULT_SETTINGS, branding };
      }
      
      return DEFAULT_SETTINGS;
    } catch (e) {
      console.error('Failed to load settings from localStorage:', e);
      return DEFAULT_SETTINGS;
    }
  });

  const updateBusinessInfo = useCallback((info: BusinessInfo) => {
    setSettings(prev => {
      const next = { ...prev, branding: info };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateUIPreferences = useCallback((ui: Partial<UIPreferences>) => {
    setSettings(prev => {
      const next = { ...prev, ui: { ...prev.ui, ...ui } };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updatePrintDefaults = useCallback((print: Partial<PrintDefaults>) => {
    setSettings(prev => {
      const next = { ...prev, print: { ...prev.print, ...print } };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const restoreDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }, []);

  return {
    settings,
    businessInfo: settings.branding,
    uiPreferences: settings.ui,
    printDefaults: settings.print,
    updateBusinessInfo,
    updateUIPreferences,
    updatePrintDefaults,
    restoreDefaults,
  };
};