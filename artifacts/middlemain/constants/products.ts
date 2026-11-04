// App Store Connect product IDs for Middlemain (bundle app.middlemain.bridge).
// Subscription group: "Middlemain Pro". Prices are set in App Store Connect;
// the fallback prices below are only shown if the store can't be reached.

export type SubscriptionPlanId = 'weekly' | 'monthly' | 'sixmonth' | 'yearly';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  sku: string;
  label: string;
  period: string;
  fallbackPrice: string;
  note?: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'weekly', sku: 'app.middlemain.bridge.pro.weekly', label: 'WEEKLY', period: 'per week', fallbackPrice: '$1.99' },
  { id: 'monthly', sku: 'app.middlemain.bridge.pro.monthly', label: 'MONTHLY', period: 'per month', fallbackPrice: '$3.99' },
  { id: 'sixmonth', sku: 'app.middlemain.bridge.pro.sixmonth', label: '6 MONTHS', period: 'every 6 months', fallbackPrice: '$15.99', note: 'Save 33%' },
  { id: 'yearly', sku: 'app.middlemain.bridge.pro.yearly', label: 'YEARLY', period: 'per year', fallbackPrice: '$29.99', note: 'Best value' },
];

export const SUBSCRIPTION_SKUS = SUBSCRIPTION_PLANS.map((p) => p.sku);

export const REMOVE_ADS_SKU = 'app.middlemain.bridge.removeads';
export const THEME_EXPANSION_SKU = 'app.middlemain.bridge.themes.expansion1';
export const THEME_EXPANSION2_SKU = 'app.middlemain.bridge.themes.expansion2';
export const ONE_TIME_SKUS = [REMOVE_ADS_SKU, THEME_EXPANSION_SKU, THEME_EXPANSION2_SKU];

export const ONE_TIME_FALLBACK_PRICE: Record<string, string> = {
  [REMOVE_ADS_SKU]: '$1.99',
  [THEME_EXPANSION_SKU]: '$1.99',
  [THEME_EXPANSION2_SKU]: '$1.99',
};

export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_POLICY_URL = 'https://livhappierapps.com/apps/middlemain/privacypolicy';

export const AUTO_RENEW_DISCLOSURE =
  'Payment is charged to your Apple ID account at confirmation of purchase. ' +
  'Subscriptions renew automatically at the same price and duration unless auto-renew is turned off ' +
  'at least 24 hours before the end of the current period. Your account is charged for renewal within ' +
  '24 hours before the end of the current period. You can manage or cancel subscriptions in your ' +
  'App Store account settings after purchase.';

export const PRICE_CHANGE_DISCLAIMER =
  'Prices may change as new features are released. The developer reserves the right to change prices ' +
  'at any time, and subscribers will be notified with as much advance notice as possible. Apple will ' +
  'notify you of any subscription price increase and, where required, ask for your consent before it applies.';
