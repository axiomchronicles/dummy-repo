# Dependency Decisions & Official Documentation Register

**Flutter SDK:** Flutter 3.44.9 (channel stable)  
**Dart SDK:** Dart 3.12.2 (stable) on `macos_arm64`  
**Target Platforms:** macOS Desktop, Android, iOS  
**File:** `apps/flutter_app/pubspec.yaml` & `apps/flutter_app/pubspec.lock`  
**Date Checked:** 2026-10-26  

---

## 1. Selected Packages & Version Matrix

| Package Name | Pinned / Selected Version | Purpose / Scope | Official Documentation / Source Checked |
| :--- | :--- | :--- | :--- |
| **`flutter_riverpod`** | `3.4.3` (with `riverpod: 3.4.3`) | Application state management, dependency injection, and AsyncNotifier lifecycles. | [riverpod.dev](https://riverpod.dev/) — Checked current AsyncNotifier & ProviderContainer patterns. |
| **`go_router`** | `17.5.0` | Declarative routing, deep-link handling, URL path parameter binding, and StatefulShellRoute. | [pub.dev/packages/go_router](https://pub.dev/packages/go_router) — Verified compatibility with Flutter 3.44. |
| **`hugeicons`** | `1.2.0` | Production iconography system (`HugeIcon` widget with `HugeIcons.strokeRounded*`). | [pub.dev/packages/hugeicons](https://pub.dev/packages/hugeicons) — Verified icon naming conventions and widget rendering. |
| **`dio`** | `5.11.1` | Network client supporting timeouts, cancel tokens, request interceptors, and chunked byte streams. | [pub.dev/packages/dio](https://pub.dev/packages/dio) — Verified Dio interceptors, error normalization, and response streaming. |
| **`intl`** | `0.20.3` | Date, time, currency (INR minor/major format), and number formatting. | [pub.dev/packages/intl](https://pub.dev/packages/intl) — Standard Dart internationalization tool. |
| **`file_picker`** | `13.3.0` | Platform-native file picker for contact CSV and XLSX files. | [pub.dev/packages/file_picker](https://pub.dev/packages/file_picker) — Verified macOS, Android, and iOS desktop/mobile file dialogs. |
| **`flutter_secure_storage`**| `11.2.0` | Encrypted token storage for session identifiers (`outreach_session`). | [pub.dev/packages/flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage) — KeyChain on macOS/iOS, Keystore on Android. |
| **`mocktail`** | `1.0.5` (dev) | Type-safe, null-safe mock framework without code generation for unit/provider tests. | [pub.dev/packages/mocktail](https://pub.dev/packages/mocktail) — Used in test suites. |

---

## 2. Packages Intentionally Excluded & Architectural Rationale

1. **`sarvamconv_ai_sdk` / Sarvam Flutter SDK:**  
   *Reason for Exclusion:* Outreach Intern orchestrates outbound PSTN telephony through the backend server. The app is not an in-browser or in-app live microphone voice bot. Embedding client-side Sarvam SDKs would expose provider keys or misrepresent the calling architecture.
2. **`just_audio` / Audio Player Packages:**  
   *Reason for Exclusion:* The backend integration audit (Agent C & Gate A) confirmed that Sarvam Voice Agents has no public voice audio preview API. No audio streaming endpoint exists in the backend. Instead of rendering dead audio controls or fake MP3 players, the UI provides a text-based sandbox turn (`POST /agents/:id/sandbox`).
3. **Heavy Charting / Animation Packages (`fl_chart`, `lottie`):**  
   *Reason for Exclusion:* Built-in Flutter canvas and custom lightweight painters provide cleaner, accessible, zero-dependency representations of campaign metrics and progress indicators without inflating the app binary or causing raster jank.
4. **Third-Party Sliver Packages ("silver"):**  
   *Reason for Exclusion:* Flutter's built-in sliver primitives (`CustomScrollView`, `SliverAppBar`, `SliverList`, `SliverPersistentHeader`, `SliverFillRemaining`) natively provide virtualized scrolling without third-party wrapper risks.
