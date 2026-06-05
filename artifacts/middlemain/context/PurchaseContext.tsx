import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type SubscriptionTier = 'free' | 'monthly' | 'annual';

interface PurchaseContextValue {
  tier: SubscriptionTier;
  hasRemovedAds: boolean;
  purchaseMonthly: () => Promise<void>;
  purchaseAnnual: () => Promise<void>;
  purchaseAdRemoval: () => Promise<void>;
  restorePurchases: () => Promise<void>;
}

const STORAGE_KEY = '@middlemain_purchases';

const PurchaseContext = createContext<PurchaseContextValue>({
  tier: 'free',
  hasRemovedAds: false,
  purchaseMonthly: async () => {},
  purchaseAnnual: async () => {},
  purchaseAdRemoval: async () => {},
  restorePurchases: async () => {},
});

export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [hasRemovedAds, setHasRemovedAds] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          setTier(parsed.tier ?? 'free');
          setHasRemovedAds(parsed.hasRemovedAds ?? false);
        } catch {}
      }
    });
  }, []);

  const persist = useCallback((t: SubscriptionTier, ads: boolean) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ tier: t, hasRemovedAds: ads }));
  }, []);

  const purchaseMonthly = useCallback(async () => {
    setTier('monthly');
    persist('monthly', hasRemovedAds);
  }, [hasRemovedAds, persist]);

  const purchaseAnnual = useCallback(async () => {
    setTier('annual');
    persist('annual', hasRemovedAds);
  }, [hasRemovedAds, persist]);

  const purchaseAdRemoval = useCallback(async () => {
    setHasRemovedAds(true);
    persist(tier, true);
  }, [tier, persist]);

  const restorePurchases = useCallback(async () => {
    // In production: restore via RevenueCat or StoreKit
  }, []);

  return (
    <PurchaseContext.Provider
      value={{ tier, hasRemovedAds, purchaseMonthly, purchaseAnnual, purchaseAdRemoval, restorePurchases }}
    >
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchase(): PurchaseContextValue {
  return useContext(PurchaseContext);
}
