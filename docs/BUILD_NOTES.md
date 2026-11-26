
## iOS SDK requirement (added Nov 26, 2026)

- 1.3.0 build 4 (commit f727ec5) was built with the iOS 26.0 SDK and uploaded to TestFlight on Nov 26, 2026.
- Apple warning: starting **April 27, 2027**, iOS/iPadOS apps must be built with the **iOS 27 SDK or later (Xcode 27+)** to upload or submit.
- Next build: set `"image"` in the iOS section of the eas.json build profile to an Xcode 27 EAS image (or `latest` once it maps to Xcode 27), and bump the build number past 4.
