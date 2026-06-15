import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

const LAST_UPDATED = 'June 14, 2026';
const APP_NAME = 'Middlemain';
const COMPANY_NAME = 'LivHappier Apps';
const CONTACT_EMAIL = 'oblivionhappier@icloud.com';
const WEBSITE = 'livhappierapps.com';

const PRIVACY_POLICY = `PRIVACY POLICY
Last Updated: ${LAST_UPDATED}
Published by: ${COMPANY_NAME} · ${WEBSITE}

OUR KEY PROMISE
${APP_NAME} does not require an account. It does not track you. It does not build a profile of you. Your API keys and conversation data are stored only on your own device and are never collected by ${COMPANY_NAME} servers — except where explicitly described below.

1. INFORMATION WE DO NOT COLLECT
${APP_NAME} does NOT collect, store, or process:
  - Your name, email address, or contact information
  - Your location data
  - Device identifiers or advertising IDs
  - Your browsing or usage history
  - Your AI conversation content (messages, code, images)
  - Your API keys or authentication credentials

2. INFORMATION STORED ON YOUR DEVICE ONLY
The following is stored locally on your device and never leaves it except as described in Sections 3–4:
  - AI provider API keys you enter
  - AI connection configurations
  - Custom skill definitions you create
  - App theme and settings preferences
  - Subscription/purchase status

You can delete all of this by uninstalling the App.

3. DIRECT AI CONNECTIONS — YOUR DATA GOES TO YOUR CHOSEN AI
When you configure a direct AI connection (xAI/Grok, OpenAI, Anthropic, or custom), your messages travel directly from your device to the AI provider you selected. ${COMPANY_NAME} does not see, intercept, receive, or store this data.

EXPLICIT CONSENT: By configuring an AI connection and sending your first message, you explicitly consent to your message content (including any images you attach) being transmitted to the third-party AI provider you have selected. You control which AI provider receives your data and can change or remove connections at any time.

Third-party AI provider privacy policies:
  - xAI (Grok): x.ai/legal/privacy-policy
  - OpenAI: openai.com/policies/privacy-policy
  - Anthropic: anthropic.com/privacy

4. SERVER PROXY MODE ("DEV'S GROK")
${APP_NAME} offers an optional server connection that routes your messages through a ${COMPANY_NAME} server before forwarding them to xAI's Grok API. When using this mode:
  - Your message content passes through our server
  - Message content is NOT logged, stored, or retained
  - Our server acts as a pass-through relay only
  - All connections use HTTPS/TLS encryption
  - You can disable this at any time in the Connect tab

5. CAMERA AND PHOTO LIBRARY
Vision features may request camera and photo library access. Images you attach are transmitted only to the AI provider you selected. Images are never stored or retained by ${COMPANY_NAME}.

Camera and photo access is optional — the App works fully without it for non-Vision features.

6. BUG REPORTS (OPTIONAL)
If you submit a bug report through the in-app tool, only the text you write and the app version number are transmitted. No conversation data, API keys, or personal information are included.

7. PURCHASES AND SUBSCRIPTIONS
All payments are processed by Apple App Store or Google Play. ${COMPANY_NAME} does not receive or store your payment information.

8. CHILDREN'S PRIVACY
${APP_NAME} is intended for users 17 and older. We do not knowingly collect information from children under 13.

9. DATA SECURITY
All connections use HTTPS/TLS. Since we do not collect your data, there is no ${COMPANY_NAME} database that could expose your information.

10. YOUR RIGHTS (GDPR / CCPA)
Since ${APP_NAME} does not collect personal data, there is no personal data held by ${COMPANY_NAME} for you to access, correct, or delete. California residents: we do not sell personal information.

11. CHANGES TO THIS POLICY
Updates will be posted at ${WEBSITE} and within the App. Continued use after changes constitutes acceptance.

12. CONTACT
Questions? Email us: ${CONTACT_EMAIL}
Website: ${WEBSITE}`;

const TERMS_AND_CONDITIONS = `TERMS AND CONDITIONS
Last Updated: ${LAST_UPDATED}
Published by: ${COMPANY_NAME} · ${WEBSITE}

1. ACCEPTANCE OF TERMS
By downloading, installing, or using ${APP_NAME}, you agree to these Terms. If you do not agree, do not use the App. These Terms form a legal agreement between you and ${COMPANY_NAME}.

2. DESCRIPTION OF SERVICE
${APP_NAME} is a professional developer tool that acts as an interface bridge between you and third-party AI providers (including xAI/Grok, OpenAI, and Anthropic). It provides a streaming terminal interface, skill-based prompting, vision/image analysis, and multi-provider AI connection management.

${APP_NAME} is a tool, not an AI provider. We do not operate or control the AI models you connect to.

3. ELIGIBILITY
You must be at least 17 years of age to use ${APP_NAME}.

4. API KEYS AND THIRD-PARTY SERVICES
When you connect an AI provider using your own API key, you are solely responsible for:
  - The security and confidentiality of your API keys
  - All usage charges incurred on your API account
  - Compliance with the third-party provider's terms of service
  - Any content you send to or receive from the AI provider

Your API keys are stored locally on your device only. ${COMPANY_NAME} does not have access to your API keys.

5. AI OUTPUT DISCLAIMER
AI-generated output (code, analysis, suggestions, explanations) produced through ${APP_NAME}:
  - May be inaccurate, incomplete, or incorrect
  - Should be reviewed before use in production environments
  - Does not constitute professional legal, medical, financial, or security advice
  - Is the output of the third-party AI provider, not ${COMPANY_NAME}

You are solely responsible for reviewing and testing any code or content generated by AI through the App.

6. SUBSCRIPTIONS AND BILLING

a) Pricing
  - Monthly Subscription: $3.99/month
  - Annual Subscription: $29.99/year
  - Ad Removal: $1.99 (one-time)

b) Billing
All purchases are processed through Apple App Store or Google Play. ${COMPANY_NAME} does not receive or store your payment information.

c) Auto-Renewal
Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date. Manage subscriptions in your App Store or Google Play account settings.

d) Apple Subscription Terms
Payment charged to Apple ID at purchase confirmation. Manage and cancel in App Store Account Settings.

e) Refunds
Refund requests are handled by Apple or Google under their refund policies.

7. ACCEPTABLE USE
You agree not to use ${APP_NAME} to:
  - Violate any applicable laws or regulations
  - Circumvent AI provider rate limits or terms of service
  - Reverse engineer, decompile, or modify the App
  - Transmit malware or any harmful code
  - Harass or harm any individual

8. INTELLECTUAL PROPERTY
The ${APP_NAME} app, design, branding, name, and logo are the intellectual property of ${COMPANY_NAME}. You are granted a limited, non-exclusive, non-transferable license to use the App on your personal device. You retain ownership of any content you input.

9. DISCLAIMER OF WARRANTIES
THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.

10. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY_NAME} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE APP, INCLUDING DAMAGES FROM AI-GENERATED CODE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID IN THE TWELVE MONTHS PRECEDING ANY CLAIM.

11. TERMINATION
We reserve the right to terminate access for violations of these Terms. You may stop using the App at any time by uninstalling it.

12. GOVERNING LAW
These Terms are governed by the laws of the United States. Nothing herein limits your statutory rights under the laws of your country of residence.

13. CHANGES TO THESE TERMS
Updated Terms will be posted at ${WEBSITE} and within the App. Continued use after changes constitutes acceptance.

14. CONTACT
Questions? Email: ${CONTACT_EMAIL}
Website: ${WEBSITE}

Thank you for using ${APP_NAME}. Your feedback shapes this tool for developers everywhere.`;

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
