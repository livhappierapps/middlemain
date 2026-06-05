import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

const LAST_UPDATED = 'June 5, 2026';
const APP_NAME = 'Middlemain';
const CONTACT_EMAIL = 'support@middlemain.app';

const PRIVACY_POLICY = `PRIVACY POLICY
Last Updated: ${LAST_UPDATED}

COMMITMENT TO YOUR PRIVACY
${APP_NAME} ("we," "our," or "the App") is committed to protecting your privacy. This Privacy Policy explains what information is collected, how it is used, and what rights you have.

KEY PROMISE
We do NOT collect, store, or transmit any personal user information. We do not know who you are, where you are, or how to contact you unless you choose to tell us through the in-app report tool.

1. INFORMATION WE COLLECT

a) App Usage Analytics (Anonymous)
We may collect anonymized, non-identifiable data about how the App functions — such as crash reports, feature usage patterns, and error frequencies. This data:
  - Contains NO personally identifiable information
  - Cannot be used to identify any individual user
  - Is used solely to improve App stability and features
  - Is not sold to third parties

b) Bug Reports (User-Submitted, Optional)
When you voluntarily submit a bug report or feedback through the in-app reporting tool:
  - Only the content of your report is transmitted
  - No personal information is collected alongside reports
  - Reports are used solely to address the described issue or improve the feature
  - Reports are retained only as long as necessary to act on them

c) API Keys (Your Device Only)
Your AI provider API keys (e.g., xAI/Grok, OpenAI) are:
  - Stored ONLY on your local device
  - Never transmitted to ${APP_NAME} servers
  - Used solely to communicate directly between your device and your chosen AI provider
  - Your relationship with your AI provider is governed by that provider's terms

2. INFORMATION WE DO NOT COLLECT
  - Names, email addresses, or contact information
  - Device identifiers or advertising IDs
  - Location data
  - Contacts or calendar data
  - Photos, camera, or microphone data
  - Financial information (payments handled by Apple/Google)
  - Any code or content you process through the Bridge Terminal

3. THIRD-PARTY SERVICES

a) Apple App Store / Google Play
Payments are processed through Apple's App Store or Google Play. Their privacy policies govern payment transactions. We do not have access to your payment details.

b) AI Providers
When you use the Bridge Terminal, your messages are sent directly from your device to your chosen AI provider (e.g., xAI, OpenAI, Anthropic). We are not party to those communications. Review each provider's privacy policy.

4. DATA SECURITY
We take data security seriously. Since we do not collect personal information, the primary risk is on your device. We recommend securing your device with a passcode.

5. CHILDREN'S PRIVACY
${APP_NAME} is a developer tool intended for users 17 and older. We do not knowingly collect any information from children.

6. YOUR RIGHTS
Since we do not collect personal information, there is no personal data to request, modify, or delete. If you submitted a bug report you wish to retract, contact us at ${CONTACT_EMAIL}.

7. CHANGES TO THIS POLICY
We will update this policy as the App evolves. Continued use of the App after changes constitutes acceptance. Check the "Last Updated" date above.

8. CONTACT
Questions about this Privacy Policy? Contact us at ${CONTACT_EMAIL}.`;

const TERMS_AND_CONDITIONS = `TERMS AND CONDITIONS
Last Updated: ${LAST_UPDATED}

AGREEMENT
By downloading or using ${APP_NAME}, you agree to these Terms and Conditions. If you do not agree, do not use the App.

1. DESCRIPTION
${APP_NAME} is a developer tool that acts as a bridge between multiple AI providers, enabling code testing, debugging, and AI-assisted development workflows. The App is currently in BETA.

2. BETA DISCLAIMER
The App is provided as an EARLY RELEASE BETA product. As such:
  - Features may be incomplete, change, or be removed without notice
  - Bugs and unexpected behavior are expected
  - Your feedback through the in-app reporting tool is essential to our development
  - We make no guarantee of uninterrupted service
  - Beta users accept that they are helping shape the product

3. LICENSE
We grant you a limited, non-exclusive, non-transferable, revocable license to use ${APP_NAME} for personal or professional development purposes.

You MAY NOT:
  - Reverse engineer or decompile the App
  - Use the App to develop a competing product
  - Redistribute or resell the App
  - Attempt to gain unauthorized access to App systems

4. IN-APP PURCHASES AND SUBSCRIPTIONS

a) Pricing
  - Monthly Subscription: $3.99/month
  - Annual Subscription: $29.99/year (billed as one payment)
  - Ad Removal: $1.99 (one-time purchase)

b) Billing
All purchases are processed through Apple App Store or Google Play. You will be charged to your store account upon purchase confirmation.

c) Subscriptions
  - Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date
  - Manage or cancel subscriptions in your device's App Store settings
  - No refunds for partial subscription periods

d) Ads
A non-intrusive advertisement banner appears at the bottom of the App for free users. This may be permanently removed with a one-time $1.99 purchase.

e) Apple Payment Terms
Payment will be charged to your Apple ID account at confirmation of purchase. Your subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. You can manage subscriptions and turn off auto-renewal in your Account Settings in the App Store.

5. ACCEPTABLE USE
You agree to use ${APP_NAME} only for lawful purposes. You are solely responsible for:
  - Any API keys you enter into the App
  - Your interactions with third-party AI services
  - Any code you develop or test using the App
  - Compliance with your AI provider's terms of service

6. THIRD-PARTY AI PROVIDERS
${APP_NAME} connects to third-party AI APIs. We are not responsible for:
  - The availability, accuracy, or output of any AI provider
  - Costs incurred through third-party API usage
  - Third-party provider policy changes

7. INTELLECTUAL PROPERTY
All App content, design, and technology are owned by ${APP_NAME} and protected by applicable intellectual property laws.

8. DISCLAIMER OF WARRANTIES
THE APP IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

9. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${APP_NAME} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE APP.

10. INDEMNIFICATION
You agree to indemnify and hold harmless ${APP_NAME} from any claims arising from your use of the App or violation of these Terms.

11. CHANGES TO TERMS
We reserve the right to modify these Terms. Continued use after changes constitutes acceptance.

12. GOVERNING LAW
These Terms are governed by applicable law. Any disputes will be resolved in the jurisdiction where ${APP_NAME} is registered.

13. CONTACT
Questions? Contact us at ${CONTACT_EMAIL}.

Thank you for being an early supporter of ${APP_NAME}. Your feedback makes this tool better for developers everywhere.`;

export default function LegalScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(
    params.tab === 'terms' ? 'terms' : 'privacy',
  );

  const content = activeTab === 'privacy' ? PRIVACY_POLICY : TERMS_AND_CONDITIONS;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ paddingTop: topInset + 10, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={theme.primary} />
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>Legal</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['privacy', 'terms'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: theme.radius,
                borderWidth: 1,
                borderColor: activeTab === tab ? theme.primary : theme.border,
                backgroundColor: activeTab === tab ? theme.primary + '22' : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: activeTab === tab ? theme.primary : theme.textMuted,
                fontSize: 12,
                fontFamily: 'Inter_600SemiBold',
                letterSpacing: 1,
                textShadowColor: activeTab === tab ? theme.primary : 'transparent',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 6,
              }}>
                {tab === 'privacy' ? 'PRIVACY POLICY' : 'TERMS & CONDITIONS'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === 'web' ? 54 : 30 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
          {content}
        </Text>
      </ScrollView>
    </View>
  );
}
