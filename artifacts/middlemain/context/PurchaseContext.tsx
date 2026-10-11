import React, { createContext, useContext } from 'react';
import { Alert } from 'react-native';

export type SubscriptionTier = 'free' | 'monthly' | 'annual';

interface PurchaseContextValue {
  tier: SubscriptionTier;
  hasRemovedAds: boolean;
  purchasesAvailable: boolean;
  purchaseMonthly: () => Promise<void>;
  purchaseAnnual: () => Promise<void>;
  purchaseAdRemoval: () => Promise<void>;
  restorePurchases: () => Promise<void>;
}

async function unavailable(): Promise<void> {
  Alert.alert('Purchases unavailable', 'Store purchases and restore are not configured. No payment was made and no verified entitlement was granted.');
}

const PurchaseContext = createContext<PurchaseContextValue>({
  tier: 'free',
  hasRemovedAds: false,
  purchasesAvailable: false,
  purchaseMonthly: unavailable,
  purchaseAnnual: unavailable,
  purchaseAdRemoval: unavailable,
  restorePurchases: unavailable,
});

export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <PurchaseContext.Provider
      value={{
        tier: 'free', hasRemovedAds: false, purchasesAvailable: false,
        purchaseMonthly: unavailable, purchaseAnnual: unavailable,
        purchaseAdRemoval: unavailable, restorePurchases: unavailable,
      }}
    >
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchase(): PurchaseContextValue {
  return useContext(PurchaseContext);
}
