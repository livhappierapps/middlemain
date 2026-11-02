import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  ONE_TIME_FALLBACK_PRICE,
  ONE_TIME_SKUS,
  REMOVE_ADS_SKU,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_SKUS,
  SubscriptionPlanId,
  THEME_EXPANSION_SKU,
} from '@/constants/products';
import { useTheme } from '@/context/ThemeContext';

type IapModule = typeof import('expo-iap');
type IapPurchase = import('expo-iap').Purchase;

// expo-iap is a native module; load it only on iOS/Android so web builds keep working.
const IAP: IapModule | null = (() => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-iap') as IapModule;
  } catch {
    return null;
  }
})();

export type SubscriptionTier = 'free' | SubscriptionPlanId;

interface PurchaseContextValue {
  tier: SubscriptionTier;
  isPro: boolean;
  /** True when ads should be hidden (Pro or Remove Ads). */
  hasRemovedAds: boolean;
  hasThemeExpansion: boolean;
  purchasesAvailable: boolean;
  loading: boolean;
  busySku: string | null;
  /** Localized store price for a SKU, falling back to the configured USD price. */
  priceFor: (sku: string) => string;
  purchaseSubscription: (plan: SubscriptionPlanId) => Promise<void>;
  purchaseAdRemoval: () => Promise<void>;
  purchaseThemeExpansion: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  manageSubscriptions: () => Promise<void>;
}

const CACHE_KEY = '@middlemain_entitlements_v1';

const FALLBACK_PRICE: Record<string, string> = {
  ...ONE_TIME_FALLBACK_PRICE,
  ...Object.fromEntries(SUBSCRIPTION_PLANS.map((p) => [p.sku, p.fallbackPrice])),
};

function tierFromOwned(owned: Set<string>): SubscriptionTier {
  // Highest-value active plan wins if more than one is somehow active.
  for (const id of ['yearly', 'sixmonth', 'monthly', 'weekly'] as SubscriptionPlanId[]) {
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === id)!;
    if (owned.has(plan.sku)) return id;
  }
  return 'free';
}

async function notAvailable(): Promise<void> {
  Alert.alert('Purchases unavailable', 'In-app purchases are only available in the iOS app. No payment was made.');
}

const PurchaseContext = createContext<PurchaseContextValue>({
  tier: 'free',
  isPro: false,
  hasRemovedAds: false,
  hasThemeExpansion: false,
  purchasesAvailable: false,
  loading: false,
  busySku: null,
  priceFor: (sku) => FALLBACK_PRICE[sku] ?? '',
  purchaseSubscription: notAvailable,
  purchaseAdRemoval: notAvailable,
  purchaseThemeExpansion: notAvailable,
  restorePurchases: notAvailable,
  manageSubscriptions: notAvailable,
});

export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(!!IAP);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const mounted = useRef(true);
  const storeChecked = useRef(false);
  const { setExpansionUnlocked } = useTheme();
  const themePackOwned = owned.has(THEME_EXPANSION_SKU);

  useEffect(() => {
    setExpansionUnlocked(themePackOwned);
  }, [themePackOwned, setExpansionUnlocked]);

  const persist = useCallback((next: Set<string>) => {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify([...next])).catch(() => {});
  }, []);

  /** Re-read the user's current entitlements from StoreKit. */
  const refreshEntitlements = useCallback(async () => {
    if (!IAP) return;
    try {
      const purchases = await IAP.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      const next = new Set<string>();
      for (const p of purchases ?? []) {
        if (SUBSCRIPTION_SKUS.includes(p.productId) || ONE_TIME_SKUS.includes(p.productId)) next.add(p.productId);
      }
      if (!mounted.current) return;
      storeChecked.current = true;
      setOwned(next);
      persist(next);
    } catch (e) {
      if (__DEV__) console.warn('[IAP] getAvailablePurchases failed', e);
    }
  }, [persist]);

  const loadProducts = useCallback(async () => {
    if (!IAP) return;
    const map: Record<string, string> = {};
    try {
      const subs = await IAP.fetchProducts({ skus: SUBSCRIPTION_SKUS, type: 'subs' });
      for (const p of (subs ?? []) as { id: string; displayPrice: string }[]) map[p.id] = p.displayPrice;
    } catch (e) {
      if (__DEV__) console.warn('[IAP] fetch subs failed', e);
    }
    try {
      const items = await IAP.fetchProducts({ skus: ONE_TIME_SKUS, type: 'in-app' });
      for (const p of (items ?? []) as { id: string; displayPrice: string }[]) map[p.id] = p.displayPrice;
    } catch (e) {
      if (__DEV__) console.warn('[IAP] fetch in-app failed', e);
    }
    if (mounted.current) setPrices(map);
  }, []);

  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && !storeChecked.current) setOwned((cur) => (cur.size ? cur : new Set(cached.filter((s) => typeof s === 'string'))));
      } catch {}
    });
    if (!IAP) return () => { mounted.current = false; };

    const iap = IAP;
    const updateSub = iap.purchaseUpdatedListener(async (purchase: IapPurchase) => {
      const sku = purchase.productId;
      if (!SUBSCRIPTION_SKUS.includes(sku) && !ONE_TIME_SKUS.includes(sku)) return;
      try {
        // StoreKit 2 verifies the transaction signature on-device before it is delivered here.
        await iap.finishTransaction({ purchase, isConsumable: false });
      } catch (e) {
        if (__DEV__) console.warn('[IAP] finishTransaction failed', e);
      }
      setOwned((cur) => {
        const next = new Set(cur);
        next.add(sku);
        persist(next);
        return next;
      });
      setBusySku(null);
      // Pick up upgrades/downgrades within the subscription group.
      refreshEntitlements();
    });
    const errorSub = iap.purchaseErrorListener((error) => {
      setBusySku(null);
      if (iap.isUserCancelledError?.(error)) return;
      Alert.alert('Purchase not completed', iap.getUserFriendlyErrorMessage?.(error) ?? error.message ?? 'Please try again.');
    });

    (async () => {
      try {
        await iap.initConnection();
        if (!mounted.current) return;
        setConnected(true);
        await Promise.all([loadProducts(), refreshEntitlements()]);
      } catch (e) {
        if (__DEV__) console.warn('[IAP] initConnection failed', e);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => {
      mounted.current = false;
      updateSub.remove();
      errorSub.remove();
      iap.endConnection().catch(() => {});
    };
  }, [loadProducts, refreshEntitlements, persist]);

  const buy = useCallback(async (sku: string, type: 'subs' | 'in-app') => {
    if (!IAP) return notAvailable();
    if (!connected) {
      Alert.alert('App Store unavailable', 'Could not connect to the App Store. Check your connection and try again.');
      return;
    }
    setBusySku(sku);
    try {
      if (type === 'subs') {
        await IAP.requestPurchase({ type: 'subs', request: { apple: { sku }, google: { skus: [sku] } } });
      } else {
        await IAP.requestPurchase({ type: 'in-app', request: { apple: { sku }, google: { skus: [sku] } } });
      }
      // Result arrives through purchaseUpdatedListener / purchaseErrorListener.
    } catch (e: any) {
      setBusySku(null);
      if (IAP.isUserCancelledError?.(e)) return;
      Alert.alert('Purchase not completed', e?.message ?? 'Please try again.');
    }
  }, [connected]);

  const purchaseSubscription = useCallback(async (plan: SubscriptionPlanId) => {
    const p = SUBSCRIPTION_PLANS.find((x) => x.id === plan);
    if (p) await buy(p.sku, 'subs');
  }, [buy]);
  const purchaseAdRemoval = useCallback(() => buy(REMOVE_ADS_SKU, 'in-app'), [buy]);
  const purchaseThemeExpansion = useCallback(() => buy(THEME_EXPANSION_SKU, 'in-app'), [buy]);

  const restorePurchases = useCallback(async () => {
    if (!IAP) return notAvailable();
    setBusySku('restore');
    try {
      await IAP.restorePurchases();
      await refreshEntitlements();
      Alert.alert('Restore complete', 'Any purchases tied to your Apple ID have been restored.');
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Please try again.');
    } finally {
      setBusySku(null);
    }
  }, [refreshEntitlements]);

  const manageSubscriptions = useCallback(async () => {
    if (!IAP) return notAvailable();
    try {
      await IAP.deepLinkToSubscriptions({ skuAndroid: undefined, packageNameAndroid: 'app.middlemain.bridge' } as any);
    } catch {
      Alert.alert('Manage subscriptions', 'Open Settings > your name > Subscriptions to manage Middlemain Pro.');
    }
  }, []);

  const value = useMemo<PurchaseContextValue>(() => {
    const tier = tierFromOwned(owned);
    const isPro = tier !== 'free';
    return {
      tier,
      isPro,
      hasRemovedAds: isPro || owned.has(REMOVE_ADS_SKU),
      hasThemeExpansion: owned.has(THEME_EXPANSION_SKU),
      purchasesAvailable: !!IAP && connected,
      loading,
      busySku,
      priceFor: (sku: string) => prices[sku] ?? FALLBACK_PRICE[sku] ?? '',
      purchaseSubscription,
      purchaseAdRemoval,
      purchaseThemeExpansion,
      restorePurchases,
      manageSubscriptions,
    };
  }, [owned, connected, loading, busySku, prices, purchaseSubscription, purchaseAdRemoval, purchaseThemeExpansion, restorePurchases, manageSubscriptions]);

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase(): PurchaseContextValue {
  return useContext(PurchaseContext);
}
