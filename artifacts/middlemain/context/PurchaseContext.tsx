import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
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

export interface BillingIssue {
  /** 'grace': renewal failed but access continues; 'retry': Apple is still retrying the payment. */
  kind: 'grace' | 'retry';
  sku: string;
  /** Epoch ms when the grace period ends, if StoreKit reports it. */
  graceEndsAt: number | null;
}

export const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

interface PurchaseContextValue {
  tier: SubscriptionTier;
  isPro: boolean;
  /** True when ads should be hidden (Pro or Remove Ads). */
  hasRemovedAds: boolean;
  hasThemeExpansion: boolean;
  purchasesAvailable: boolean;
  loading: boolean;
  busySku: string | null;
  /** SKU waiting for Ask to Buy / payment approval. Access unlocks automatically once approved. */
  pendingApprovalSku: string | null;
  /** Renewal payment problem reported by StoreKit; access is kept during the grace period. */
  billingIssue: BillingIssue | null;
  /** Localized store price for a SKU, falling back to the configured USD price. */
  priceFor: (sku: string) => string;
  purchaseSubscription: (plan: SubscriptionPlanId) => Promise<void>;
  purchaseAdRemoval: () => Promise<void>;
  purchaseThemeExpansion: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  manageSubscriptions: () => Promise<void>;
}

const CACHE_KEY = '@middlemain_entitlements_v1';
const PENDING_KEY = '@middlemain_pending_approval_v1';

export const PENDING_APPROVAL_MESSAGE =
  "Waiting for approval. You'll get access automatically once it's approved. You can close this screen.";

/** Plain, friendly copy for a purchase that did not go through. Never retried automatically. */
function failureMessage(e: any): { title: string; body: string } | null {
  const code = String(e?.code ?? '').toLowerCase();
  const msg = String(e?.message ?? '').toLowerCase();
  if (code === 'user-cancelled' || code === 'e_user_cancelled' || msg.includes('cancel')) {
    return { title: 'Purchase cancelled', body: 'No problem. You were not charged.' };
  }
  if (code === 'already-owned') return null; // handled by refreshing entitlements
  if (code === 'network-error' || code === 'service-timeout' || code === 'service-disconnected') {
    return { title: 'No connection', body: "We couldn't reach the App Store, so nothing was charged. Try again when you're back online." };
  }
  if (code === 'item-unavailable' || code === 'sku-not-found') {
    return { title: 'Not available right now', body: "This item isn't available at the moment. You were not charged." };
  }
  if (msg.includes('declin') || msg.includes('insufficient') || msg.includes('payment') || msg.includes('billing') || code === 'purchase-error' || code === 'billing-unavailable') {
    return {
      title: "Payment didn't go through",
      body: 'Your payment method was declined or needs attention, so you were not charged. You can update it in your Apple Account settings and try again whenever you like.',
    };
  }
  return { title: 'Purchase not completed', body: 'Something went wrong, so you were not charged. Please try again whenever you like.' };
}

function isDeferredError(e: any): boolean {
  const code = String(e?.code ?? '').toLowerCase();
  return code === 'deferred-payment' || code === 'pending' || code === 'e_deferred_payment';
}

const KNOWN_SKUS = new Set<string>([...SUBSCRIPTION_SKUS, ...ONE_TIME_SKUS]);

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
  pendingApprovalSku: null,
  billingIssue: null,
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
  const [pendingApprovalSku, setPendingApprovalSkuState] = useState<string | null>(null);
  const handledTx = useRef(new Set<string>());
  /** SKUs granted this session from a verified transaction; kept while StoreKit's entitlement list catches up. */
  const recentGrants = useRef(new Map<string, number>());
  const lastDeferredAlert = useRef(0);
  const lastFailureAlert = useRef(0);
  const [billingIssue, setBillingIssue] = useState<BillingIssue | null>(null);
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
        if (KNOWN_SKUS.has(p.productId)) next.add(p.productId);
      }
      // Billing Grace Period / Billing Retry (iOS). During grace the subscriber keeps full access.
      let issue: BillingIssue | null = null;
      if (Platform.OS === 'ios' && IAP.subscriptionStatusIOS) {
        try {
          const statuses = await IAP.subscriptionStatusIOS(SUBSCRIPTION_SKUS[0]);
          for (const st of statuses ?? []) {
            const info: any = st.renewalInfo ?? {};
            const sku = String(info.autoRenewPreference ?? SUBSCRIPTION_SKUS[0]);
            if (st.state === 'inGracePeriod') {
              next.add(KNOWN_SKUS.has(sku) ? sku : SUBSCRIPTION_SKUS[0]); // no lockout during grace
              issue = { kind: 'grace', sku, graceEndsAt: typeof info.gracePeriodExpirationDate === 'number' ? info.gracePeriodExpirationDate : null };
              break;
            }
            if (st.state === 'inBillingRetryPeriod' || info.isInBillingRetry) {
              issue = issue ?? { kind: 'retry', sku, graceEndsAt: null };
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('[IAP] subscriptionStatusIOS failed', e);
        }
      }
      if (mounted.current) setBillingIssue(issue);
      const now = Date.now();
      for (const [sku, at] of recentGrants.current) {
        if (now - at < 120_000) next.add(sku);
        else recentGrants.current.delete(sku);
      }
      if (!mounted.current) return;
      storeChecked.current = true;
      setOwned(next);
      persist(next);
      setPendingApprovalSkuState((cur) => {
        if (cur && next.has(cur)) { AsyncStorage.removeItem(PENDING_KEY).catch(() => {}); return null; }
        return cur;
      });
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

  const setPendingApproval = useCallback((sku: string | null) => {
    setPendingApprovalSkuState(sku);
    if (sku) AsyncStorage.setItem(PENDING_KEY, sku).catch(() => {});
    else AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  }, []);

  const showDeferred = useCallback(() => {
    // requestPurchase and the error listener can both report the same deferral; alert once.
    if (Date.now() - lastDeferredAlert.current < 3000) return;
    lastDeferredAlert.current = Date.now();
    Alert.alert('Waiting for approval', PENDING_APPROVAL_MESSAGE);
  }, []);

  /**
   * expo-iap/OpenIAP only delivers a purchase after StoreKit 2 has verified its signature
   * (unverified transactions are rejected natively). Grant access instantly, then finish the
   * transaction right away so nothing stays pending in the queue.
   */
  const handlePurchase = useCallback(async (purchase: IapPurchase) => {
    const sku = purchase.productId;
    if (!KNOWN_SKUS.has(sku)) return;
    const state = (purchase as { purchaseState?: string }).purchaseState;
    if (state === 'pending') {
      // Android pending payment / not yet approved: show the waiting message, never a spinner.
      setBusySku(null);
      setPendingApproval(sku);
      showDeferred();
      return;
    }
    const txKey = String((purchase as { transactionId?: string | null }).transactionId ?? purchase.id ?? sku);
    const firstTime = !handledTx.current.has(txKey);
    handledTx.current.add(txKey);
    recentGrants.current.set(sku, Date.now());

    setOwned((cur) => {
      if (cur.has(sku)) return cur;
      const next = new Set(cur);
      next.add(sku);
      persist(next);
      return next;
    });
    setBusySku((cur) => (cur === sku ? null : cur));
    setPendingApprovalSkuState((cur) => {
      if (cur === sku) {
        AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
        if (firstTime) Alert.alert('Approved', 'Your purchase was approved and is now unlocked.');
        return null;
      }
      return cur;
    });

    try {
      await IAP?.finishTransaction({ purchase, isConsumable: false });
    } catch (e) {
      // Already finished (e.g. replayed at launch) is harmless; access is already granted.
      if (__DEV__) console.warn('[IAP] finishTransaction failed', e);
    }
    // Pick up plan changes within the subscription group.
    refreshEntitlements();
  }, [persist, refreshEntitlements, setPendingApproval, showDeferred]);

  const showFailure = useCallback((e: any, sku?: string | null) => {
    setBusySku(null);
    // A cancelled or failed payment leaves nothing pending for that item.
    if (sku) setPendingApprovalSkuState((cur) => { if (cur === sku) { AsyncStorage.removeItem(PENDING_KEY).catch(() => {}); return null; } return cur; });
    if (String(e?.code ?? '').toLowerCase() === 'already-owned') { refreshEntitlements(); return; }
    const m = failureMessage(e);
    if (!m) return;
    if (Date.now() - lastFailureAlert.current < 3000) return; // listener + promise report the same failure
    lastFailureAlert.current = Date.now();
    Alert.alert(m.title, m.body);
  }, [refreshEntitlements]);

  const handlePurchaseError = useCallback((error: any) => {
    setBusySku(null);
    if (isDeferredError(error)) {
      if (error?.productId) setPendingApproval(String(error.productId));
      showDeferred();
      return;
    }
    showFailure(error, error?.productId ? String(error.productId) : null);
  }, [setPendingApproval, showDeferred, showFailure]);

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
    AsyncStorage.getItem(PENDING_KEY).then((v) => { if (v) setPendingApprovalSkuState(v); }).catch(() => {});

    // Registered before initConnection so StoreKit's Transaction.updates / Transaction.unfinished
    // replays at launch (Ask to Buy approvals, interrupted purchases, renewals) are never missed.
    const updateSub = iap.purchaseUpdatedListener((purchase: IapPurchase) => { void handlePurchase(purchase); });
    const errorSub = iap.purchaseErrorListener((error) => { handlePurchaseError(error); });
    // StoreKit billing-issue message (iOS 16.4+): re-read status so the gentle banner appears.
    const billingSub = iap.subscriptionBillingIssueListener?.(() => { refreshEntitlements(); });

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
      billingSub?.remove();
      iap.endConnection().catch(() => {});
    };
  }, [loadProducts, refreshEntitlements, handlePurchase, handlePurchaseError]);

  // Re-check entitlements whenever the app returns to the foreground (approvals, renewals, refunds).
  useEffect(() => {
    if (!IAP) return;
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && connected) refreshEntitlements(); });
    return () => sub.remove();
  }, [connected, refreshEntitlements]);

  const buy = useCallback(async (sku: string, type: 'subs' | 'in-app') => {
    if (!IAP) return notAvailable();
    if (!connected) {
      Alert.alert('App Store unavailable', 'Could not connect to the App Store. Check your connection and try again.');
      return;
    }
    setBusySku(sku);
    try {
      const result = type === 'subs'
        ? await IAP.requestPurchase({ type: 'subs', request: { apple: { sku }, google: { skus: [sku] } } })
        : await IAP.requestPurchase({ type: 'in-app', request: { apple: { sku }, google: { skus: [sku] } } });
      // The verified purchase is also delivered to purchaseUpdatedListener; handling it here too
      // means access unlocks the instant StoreKit returns, whichever arrives first.
      const list = (Array.isArray(result) ? result : result ? [result] : []) as IapPurchase[];
      for (const p of list) if (p?.productId) await handlePurchase(p);
      setBusySku((cur) => (cur === sku ? null : cur));
    } catch (e: any) {
      if (isDeferredError(e)) {
        setBusySku(null);
        setPendingApproval(sku);
        showDeferred();
        return;
      }
      // StoreKit 2 creates no transaction for a cancelled/declined purchase, so there is nothing
      // left to finish; we never re-request a charge automatically.
      showFailure(e, sku);
    }
  }, [connected, handlePurchase, setPendingApproval, showDeferred, showFailure]);

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
      // Replays any unfinished transactions so they are granted and finished.
      try {
        const unfinished = await IAP.getPendingTransactionsIOS?.();
        for (const p of (unfinished ?? []) as IapPurchase[]) await handlePurchase(p);
      } catch {}
      Alert.alert('Restore complete', 'Any purchases tied to your Apple ID have been restored.');
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Please try again.');
    } finally {
      setBusySku(null);
    }
  }, [refreshEntitlements, handlePurchase]);

  /** Opens Apple's subscription management (in-app sheet on iOS, falling back to the App Store page). */
  const manageSubscriptions = useCallback(async () => {
    try {
      if (IAP && Platform.OS === 'ios' && IAP.showManageSubscriptionsIOS) {
        await IAP.showManageSubscriptionsIOS();
        refreshEntitlements();
        return;
      }
      if (IAP) {
        await IAP.deepLinkToSubscriptions({ packageNameAndroid: 'app.middlemain.bridge' } as any);
        return;
      }
    } catch {
      // fall through to the web URL
    }
    try {
      await Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
    } catch {
      Alert.alert('Manage or cancel subscription', 'Open Settings > your name > Subscriptions to manage or cancel Middlemain Pro.');
    }
  }, [refreshEntitlements]);

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
      pendingApprovalSku,
      billingIssue,
      priceFor: (sku: string) => prices[sku] ?? FALLBACK_PRICE[sku] ?? '',
      purchaseSubscription,
      purchaseAdRemoval,
      purchaseThemeExpansion,
      restorePurchases,
      manageSubscriptions,
    };
  }, [owned, connected, loading, busySku, pendingApprovalSku, billingIssue, prices, purchaseSubscription, purchaseAdRemoval, purchaseThemeExpansion, restorePurchases, manageSubscriptions]);

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase(): PurchaseContextValue {
  return useContext(PurchaseContext);
}
