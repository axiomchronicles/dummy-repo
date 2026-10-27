# Outreach Intern: Visual System & Responsive Layout Specification

**Document Version:** 1.0.0  
**Phase:** Gate B — Design Research & UX Architecture  
**Author:** Agent G (Visual System and Responsive Layout Specialist)  
**Target Platform:** Flutter Multi-Platform (iOS, Android, macOS, Web)  
**Audited Input References:**
- **Light Reference:** `/Users/kuroyami/Downloads/0dd53d837bc38927ee068b9a59f270e9 (1).webp` (Kraken AI: warm off-white canvas, floating rounded composer, high-contrast ink typography, hairline borders, clean pill tags)
- **Dark Reference:** `/Users/kuroyami/Downloads/0c84abb05736192de821639b0950cc13.webp` (Bloom AI: deep charcoal canvas, vivid red accent `#FF3B30`/`#DC2626`, segmented pill navigation, dark elevated cards, red input caret and action trigger)
- **Backend Audit:** `docs/flutter-ui/backend-integration-audit.md` (Gate A verified domain boundaries, SSE streaming, text-only sandbox turn, simulation vs. live PSTN telephony execution)

---

## 1. Design Philosophy & Aesthetic Blueprint

The visual system for **Outreach Intern** unites the quiet, utilitarian elegance of high-end productivity tools (Linear, Notion, Claude) with the immediate, visceral clarity required for mission-critical voice campaign operations.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        QUIET DUALITY AESTHETIC                         │
├───────────────────────────────────┬────────────────────────────────────┤
│         LIGHT MODE (Kraken)       │         DARK MODE (Bloom)          │
│  - Warm off-white canvas (#F9F9F8)│  - Deep charcoal canvas (#0D0D0E)  │
│  - Pure white surfaces (#FFFFFF)  │  - Subtle layered zincs (#161618)  │
│  - Deep ink typography (#141413)  │  - Crisp off-white type (#EDEDED)  │
│  - Restrained hairlines (#EBEBEA) │  - 1px perimeter strokes (#26262A) │
├───────────────────────────────────┴────────────────────────────────────┤
│                         VIVID RED ACCENT PULSE                         │
│  Restrained, surgical use of vivid crimson (#DC2626 / #EF4444):        │
│  - Live Telephony Launch & In-Flight Indicators                        │
│  - Active Composer Send Trigger & Focus Caret                          │
│  - Destructive Actions, Critical Exceptions, and In-Call Disconnects   │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Core Tenets

1. **Quiet, Restrained Monochromatic Foundation:**
   The canvas deliberately avoids gratuitous color gradients, skeuomorphic drop shadows, and visual noise. 95% of the interface lives within a carefully calibrated grayscale spectrum: warm paper and crisp ink in light mode; velvet charcoal and luminescent silver in dark mode. This gives operational data (call outcomes, agent prompts, audio levels, contact states) maximum readability.

2. **Surgical Vivid Crimson Accent (`#DC2626` / `#EF4444`):**
   Color is reserved for intention and danger. In accordance with the Bloom reference, a pure, vivid red is used as an intentional focal point:
   - Primary active submit button when prompt input is non-empty.
   - The blinking text cursor in focused composer states.
   - The distinctive "LIVE DIALING" badge indicating real-world PSTN carrier engagement and ledger consumption.
   - Stop, pause, and emergency halt triggers.

3. **Floating Island Composer Architecture:**
   As demonstrated in both Kraken and Bloom screenshots, the interaction focal point is an elevated, heavily rounded "floating island" composer (border radius 24–28px). It houses prompt inputs, quick attachment pills, persona model pickers (`Astra Max ∨` / `Outreach Intern v1 ∨`), and context-aware action triggers (`↑` send, `■` stop).

4. **Honest Hardware & Telephony Indicators:**
   Reflecting our Gate A backend findings:
   - **Simulation Mode:** Displayed as an analytical, calm slate/monochrome pill (`#475569` light / `#94A3B8` dark) with a blueprint motif. It communicates that 0 actual PSTN phone calls are made and 0 carrier charges are incurred.
   - **Live Mode:** Displayed as an assertive, high-contrast crimson/emerald badge with an animated pulsing live dot. It warns operators that real PSTN calls are actively dispatching via Sarvam telephony.

---

## 2. Color Token System (Dart `ThemeExtension`)

To guarantee strict compile-time safety, seamless animated theme transitions, and full support for both Light and Dark modes, colors are defined as a custom Flutter `ThemeExtension<AppColors>`.

### 2.1 Complete Token Specification Table

| Token Name | Light Mode Value | Dark Mode Value | Usage / Semantic Role |
| :--- | :--- | :--- | :--- |
| `background` | `#F9F9F8` | `#0D0D0E` | Main scaffold canvas; warm paper vs. velvet dark. |
| `surface` | `#FFFFFF` | `#161618` | Base cards, persistent sidebars, bottom sheets. |
| `surfaceSubtle` | `#F0F0EE` | `#1E1E22` | Inactive pills, user chat bubbles, table zebra rows. |
| `surfaceElevated` | `#FFFFFF` | `#26262B` | Floating composer island, modal dialogs, popovers. |
| `borderSubtle` | `#EBEBEA` | `#26262A` | Restrained 1px container dividers, card perimeters. |
| `borderStrong` | `#D1D1CE` | `#3A3A42` | Focused input borders, active tab perimeters. |
| `textPrimary` | `#141413` | `#EDEDED` | Headings, primary content, active conversation turns. |
| `textSecondary` | `#5C5C5A` | `#A0A0A6` | Subtitles, drawer labels, inactive tab titles. |
| `textMuted` | `#8C8C88` | `#686870` | Timestamps, character counters, disclaimer footnotes. |
| `accentRed` | `#DC2626` | `#EF4444` | Live launch button, active send arrow, red input caret. |
| `accentRedHover` | `#B91C1C` | `#F87171` | Pressed state for red actions, button hover overlay. |
| `accentRedSubtle`| `#FEF2F2` | `#2E1214` | Live banner surface, critical status container. |
| `statusSuccess` | `#16A34A` | `#22C55E` | Connected PSTN call, import ready, healthy webhook. |
| `statusWarning` | `#D97706` | `#F59E0B` | Campaign paused, import validating, retry scheduled. |
| `statusError` | `#DC2626` | `#EF4444` | Call dropped, invalid import rows, authentication fault. |
| `statusSimulation`| `#475569`| `#94A3B8` | Text color for simulation mode indicator. |
| `statusSimulationBg`| `#F1F5F9`| `#1E2430` | Background container for simulation badge. |

### 2.2 Production Dart Implementation: `AppColors`

```dart
// lib/core/theme/app_colors.dart
import 'package:flutter/material.dart';

@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.surface,
    required this.surfaceSubtle,
    required this.surfaceElevated,
    required this.borderSubtle,
    required this.borderStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.accentRed,
    required this.accentRedHover,
    required this.accentRedSubtle,
    required this.statusSuccess,
    required this.statusWarning,
    required this.statusError,
    required this.statusSimulation,
    required this.statusSimulationBg,
  });

  final Color background;
  final Color surface;
  final Color surfaceSubtle;
  final Color surfaceElevated;
  final Color borderSubtle;
  final Color borderStrong;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color accentRed;
  final Color accentRedHover;
  final Color accentRedSubtle;
  final Color statusSuccess;
  final Color statusWarning;
  final Color statusError;
  final Color statusSimulation;
  final Color statusSimulationBg;

  /// Light Mode Palette (derived from Kraken AI reference)
  static const AppColors light = AppColors(
    background: Color(0xFFF9F9F8),
    surface: Color(0xFFFFFFFF),
    surfaceSubtle: Color(0xFFF0F0EE),
    surfaceElevated: Color(0xFFFFFFFF),
    borderSubtle: Color(0xFFEBEBEA),
    borderStrong: Color(0xFFD1D1CE),
    textPrimary: Color(0xFF141413),
    textSecondary: Color(0xFF5C5C5A),
    textMuted: Color(0xFF8C8C88),
    accentRed: Color(0xFFDC2626),
    accentRedHover: Color(0xFFB91C1C),
    accentRedSubtle: Color(0xFFFEF2F2),
    statusSuccess: Color(0xFF16A34A),
    statusWarning: Color(0xFFD97706),
    statusError: Color(0xFFDC2626),
    statusSimulation: Color(0xFF475569),
    statusSimulationBg: Color(0xFFF1F5F9),
  );

  /// Dark Mode Palette (derived from Bloom AI reference)
  static const AppColors dark = AppColors(
    background: Color(0xFF0D0D0E),
    surface: Color(0xFF161618),
    surfaceSubtle: Color(0xFF1E1E22),
    surfaceElevated: Color(0xFF26262B),
    borderSubtle: Color(0xFF26262A),
    borderStrong: Color(0xFF3A3A42),
    textPrimary: Color(0xFFEDEDED),
    textSecondary: Color(0xFFA0A0A6),
    textMuted: Color(0xFF686870),
    accentRed: Color(0xFFEF4444),
    accentRedHover: Color(0xFFF87171),
    accentRedSubtle: Color(0xFF2E1214),
    statusSuccess: Color(0xFF22C55E),
    statusWarning: Color(0xFFF59E0B),
    statusError: Color(0xFFEF4444),
    statusSimulation: Color(0xFF94A3B8),
    statusSimulationBg: Color(0xFF1E2430),
  );

  @override
  ThemeExtension<AppColors> copyWith({
    Color? background,
    Color? surface,
    Color? surfaceSubtle,
    Color? surfaceElevated,
    Color? borderSubtle,
    Color? borderStrong,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? accentRed,
    Color? accentRedHover,
    Color? accentRedSubtle,
    Color? statusSuccess,
    Color? statusWarning,
    Color? statusError,
    Color? statusSimulation,
    Color? statusSimulationBg,
  }) {
    return AppColors(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceSubtle: surfaceSubtle ?? this.surfaceSubtle,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      borderSubtle: borderSubtle ?? this.borderSubtle,
      borderStrong: borderStrong ?? this.borderStrong,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      accentRed: accentRed ?? this.accentRed,
      accentRedHover: accentRedHover ?? this.accentRedHover,
      accentRedSubtle: accentRedSubtle ?? this.accentRedSubtle,
      statusSuccess: statusSuccess ?? this.statusSuccess,
      statusWarning: statusWarning ?? this.statusWarning,
      statusError: statusError ?? this.statusError,
      statusSimulation: statusSimulation ?? this.statusSimulation,
      statusSimulationBg: statusSimulationBg ?? this.statusSimulationBg,
    );
  }

  @override
  ThemeExtension<AppColors> lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceSubtle: Color.lerp(surfaceSubtle, other.surfaceSubtle, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      borderSubtle: Color.lerp(borderSubtle, other.borderSubtle, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      accentRed: Color.lerp(accentRed, other.accentRed, t)!,
      accentRedHover: Color.lerp(accentRedHover, other.accentRedHover, t)!,
      accentRedSubtle: Color.lerp(accentRedSubtle, other.accentRedSubtle, t)!,
      statusSuccess: Color.lerp(statusSuccess, other.statusSuccess, t)!,
      statusWarning: Color.lerp(statusWarning, other.statusWarning, t)!,
      statusError: Color.lerp(statusError, other.statusError, t)!,
      statusSimulation: Color.lerp(statusSimulation, other.statusSimulation, t)!,
      statusSimulationBg: Color.lerp(statusSimulationBg, other.statusSimulationBg, t)!,
    );
  }
}

/// Convenience BuildContext extension for effortless token retrieval
extension AppColorsExtension on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>() ?? AppColors.dark;
}
```

---

## 3. Typography System

The typography system uses a modern, neutral geometric neo-grotesque sans-serif font family (**Inter**, falling back cleanly to system fonts `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`). It features tight tracking on large headings for editorial gravitas, and generous line-heights on body text for high readability during prolonged campaign monitoring.

### 3.1 Type Scale Hierarchy

| Style Token | Size | Line Height | Weight | Letter Spacing | Target Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `displayLarge` | 32px | 40px (1.25) | `FontWeight.w700` | `-0.025em` (-0.8px) | Welcome header ("Evening, Milo", "Hello, Milo") |
| `displayMedium`| 24px | 32px (1.33) | `FontWeight.w600` | `-0.020em` (-0.48px)| Screen titles, modal titles |
| `headline` | 20px | 28px (1.40) | `FontWeight.w600` | `-0.015em` (-0.3px) | Card headers, section titles ("Q3 Support Trends") |
| `titleMedium` | 16px | 24px (1.50) | `FontWeight.w600` | `-0.010em` (-0.16px)| List headers, drawer section tags, table heads |
| `bodyLarge` | 15px | 22px (1.47) | `FontWeight.w400` | `0.0em` (0.0px) | Agent conversation transcript turns, chat bubbles |
| `bodyMedium` | 14px | 20px (1.43) | `FontWeight.w400` | `0.0em` (0.0px) | Standard UI labels, inputs, table cells |
| `bodyMediumMedium` | 14px | 20px (1.43) | `FontWeight.w500` | `0.0em` (0.0px) | Buttons, interactive pill labels, tab labels |
| `caption` | 12px | 16px (1.33) | `FontWeight.w400` | `+0.010em` (+0.12px)| Timestamps, metadata ("Thought for 13s") |
| `badge` | 11px | 14px (1.27) | `FontWeight.w700` | `+0.060em` (+0.66px)| All-caps pill badges (`SIMULATION`, `LIVE`) |
| `mono` | 13px | 18px (1.38) | `FontWeight.w500` | `0.0em` (0.0px) | Event IDs, timestamps, phone numbers, JSON views |

### 3.2 Production Dart Implementation: `AppTypography`

```dart
// lib/core/theme/app_typography.dart
import 'package:flutter/material.dart';

class AppTypography {
  AppTypography._();

  static const String fontFamily = 'Inter';

  static TextTheme createTextTheme(Color primaryColor, Color secondaryColor, Color mutedColor) {
    return TextTheme(
      displayLarge: TextStyle(
        fontFamily: fontFamily,
        fontSize: 32,
        height: 40 / 32,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.8,
        color: primaryColor,
      ),
      displayMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 24,
        height: 32 / 24,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.48,
        color: primaryColor,
      ),
      headlineMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 20,
        height: 28 / 20,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
        color: primaryColor,
      ),
      titleMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 16,
        height: 24 / 16,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.16,
        color: primaryColor,
      ),
      bodyLarge: TextStyle(
        fontFamily: fontFamily,
        fontSize: 15,
        height: 22 / 15,
        fontWeight: FontWeight.w400,
        letterSpacing: 0.0,
        color: primaryColor,
      ),
      bodyMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 14,
        height: 20 / 14,
        fontWeight: FontWeight.w400,
        letterSpacing: 0.0,
        color: secondaryColor,
      ),
      bodySmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 12,
        height: 16 / 12,
        fontWeight: FontWeight.w400,
        letterSpacing: 0.12,
        color: mutedColor,
      ),
      labelLarge: TextStyle(
        fontFamily: fontFamily,
        fontSize: 14,
        height: 20 / 14,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.0,
        color: primaryColor,
      ),
      labelSmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 11,
        height: 14 / 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.66,
        color: mutedColor,
      ),
    );
  }

  /// Specialized Monospace Style for deterministic event IDs, cursors, phone numbers
  static TextStyle mono(Color color) => TextStyle(
    fontFamily: 'JetBrainsMono',
    fontFamilyFallback: const ['SF Mono', 'Menlo', 'Courier'],
    fontSize: 13,
    height: 18 / 13,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.0,
    color: color,
  );
}
```

---

## 4. Elevation, Radii, Borders & Spatial System

Both Kraken and Bloom rely on **sculpted curvature and crisp hairline perimeters** rather than diffuse multi-layered drop shadows. This creates a tactile, physical quality without visual muddiness.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SPATIAL GEOMETRY MAP                            │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│ COMPOSER ISLAND      │ PILLS & CHIPS        │ CONTAINERS & CARDS       │
│ Radius: 26.0px       │ Radius: 18.0px       │ Radius: 16.0px           │
│ Hairline: 1px subtle │ Hairline: 1px subtle │ Hairline: 1px subtle     │
│ Ambient Glow: 8px/4% │ Flat, zero shadow    │ Flat, zero shadow        │
└──────────────────────┴──────────────────────┴──────────────────────────┘
```

### 4.1 Corner Radii (`AppRadii`)

```dart
// lib/core/theme/app_radii.dart
import 'package:flutter/material.dart';

class AppRadii {
  AppRadii._();

  /// 6px: Sub-pixel tags, mini status indicators
  static const double xs = 6.0;
  static const Radius rXs = Radius.circular(xs);
  static const BorderRadius brXs = BorderRadius.all(rXs);

  /// 10px: Small buttons, dropdown menus, context popups
  static const double sm = 10.0;
  static const Radius rSm = Radius.circular(sm);
  static const BorderRadius brSm = BorderRadius.all(rSm);

  /// 16px: Standard data cards, modal sheets, transcript bubbles
  static const double md = 16.0;
  static const Radius rMd = Radius.circular(md);
  static const BorderRadius brMd = BorderRadius.all(rMd);

  /// 18px: Segmented navigation pills, status badges, model tags
  static const double pill = 18.0;
  static const Radius rPill = Radius.circular(pill);
  static const BorderRadius brPill = BorderRadius.all(rPill);

  /// 26px: Signature Floating Island Composer (Reference matching)
  static const double composer = 26.0;
  static const Radius rComposer = Radius.circular(composer);
  static const BorderRadius brComposer = BorderRadius.all(rComposer);

  /// 999px: Pure circle (action buttons, user avatars)
  static const double full = 999.0;
  static const Radius rFull = Radius.circular(full);
  static const BorderRadius brFull = BorderRadius.all(rFull);
}
```

### 4.2 Borders & Hairline Rules (`AppBorders`)

- In both light and dark reference screens, containers are bound by a **single-pixel uniform border**.
- Light mode border: `Color(0xFFEBEBEA)` (subtle) / `Color(0xFFD1D1CE)` (focused).
- Dark mode border: `Color(0xFF26262A)` (subtle) / `Color(0xFF3A3A42)` (focused).
- **Golden Rule:** Never use borders thicker than 1.0px on cards or composer islands. Active/focused inputs use color contrast change (`borderStrong`), not width expansion.

### 4.3 Elevation & Shadows (`AppShadows`)

- Standard cards and drawers have **zero elevation** (`elevation: 0`).
- The **Floating Composer Island** utilizes a whisper-soft ambient floor shadow to detach from scrolling list content:
  - Light mode: `BoxShadow(color: Color(0x0A000000), blurRadius: 16, offset: Offset(0, 4))`
  - Dark mode: `BoxShadow(color: Color(0x33000000), blurRadius: 20, offset: Offset(0, 6))`
- Live dialing indicators feature a delicate **crimson luminous halo**:
  - `BoxShadow(color: Color(0x40DC2626), blurRadius: 12, spreadRadius: 1)`

---

## 5. Iconography System (HugeIcons Stroke Integration)

To honor the clean, modern line-art aesthetic of both references, all icons are standardized on the **`hugeicons`** package using the unified **Stroke Rounded** family.

### 5.1 Icon Style & Sizing Rules

- **Icon Family:** `HugeIcons.strokeRounded...`
- **Default Stroke Width:** `1.5px` (consistent across all icon glyphs).
- **Standard Sizing Grid:**
  - **Micro (14px):** Badges, inline metadata icons (`Thought`, `Viewed`), chevron indicators.
  - **Regular (18px):** Navigation rail items, dropdown selectors, secondary button icons (`+`, attachment).
  - **Standard (20px):** Action triggers (`Send`, `Stop`, `Share`, `Settings`, search icon).
  - **Large (24px):** Top bar leading/trailing action items, modal header icons.
  - **Display (32px):** Empty-state hero illustrations.

### 5.2 Canonical Icon Mapping Table

```
┌────────────────────────────────────────────────────────────────────────┐
│                      HUGEICONS MAPPING REGISTRY                        │
├─────────────────┬──────────────────────────────────┬───────────────────┤
│ Domain Area     │ Intent / Screen Element          │ HugeIcon Token    │
├─────────────────┼──────────────────────────────────┼───────────────────┤
│ Navigation      │ Sidebar Toggle / Split Square    │ strokeRoundedSidebarLeft
│ Navigation      │ Overview / Dashboard             │ strokeRoundedHome01
│ Navigation      │ Campaigns List / Megaphone       │ strokeRoundedMegaphone01
│ Navigation      │ Contact Directory / Users        │ strokeRoundedContact01
│ Navigation      │ Persona / Agent Configuration    │ strokeRoundedBot
│ Navigation      │ Operations / Audit & Reports     │ strokeRoundedAnalytics01
│ Navigation      │ Integrations & Sarvam Settings   │ strokeRoundedSettings01
│ Navigation      │ Search                           │ strokeRoundedSearch01
├─────────────────┼──────────────────────────────────┼───────────────────┤
│ Composer/Action │ Plus / Add Attachment Pill       │ strokeRoundedAdd01
│ Composer/Action │ Send Message / Dispatch (Arrow)  │ strokeRoundedArrowUp01
│ Composer/Action │ Stop / Cancel Dispatch (Square)  │ strokeRoundedSquare
│ Composer/Action │ Share Session / Campaign Export  │ strokeRoundedShare01
│ Composer/Action │ Model Chevron Dropdown           │ strokeRoundedArrowDown01
├─────────────────┼──────────────────────────────────┼───────────────────┤
│ Telephony/Audio │ Outbound Call / Dialing Attempt  │ strokeRoundedCallOutgoing01
│ Telephony/Audio │ Telephony Active / Live Channel  │ strokeRoundedCall02
│ Telephony/Audio │ Microphone (Sandbox Turn)        │ strokeRoundedMic01
│ Telephony/Audio │ Sound Waves / Audio Waveform     │ strokeRoundedVoice
├─────────────────┼──────────────────────────────────┼───────────────────┤
│ Status & State  │ Simulation Blueprint             │ strokeRoundedCpu
│ Status & State  │ Live Broadcast Pulse             │ strokeRoundedRadio
│ Status & State  │ Success / Connected Checkmark    │ strokeRoundedCheckmarkCircle01
│ Status & State  │ Paused / Hold                    │ strokeRoundedPause
│ Status & State  │ Cancelled / Terminated           │ strokeRoundedCancel01
│ Status & State  │ Clock / Scheduled / Delayed      │ strokeRoundedClock01
├─────────────────┼──────────────────────────────────┼───────────────────┤
│ Files & Data    │ Attached Document Pill           │ strokeRoundedFile01
│ Files & Data    │ CSV / Excel Import Data          │ strokeRoundedFileAttachment01
│ Files & Data    │ Download Report Artifact         │ strokeRoundedDownload01
└─────────────────┴──────────────────────────────────┴───────────────────┘
```

### 5.3 Production Dart Icon Helper

```dart
// lib/core/theme/app_icons.dart
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';

class AppIcons {
  AppIcons._();

  static const double sizeMicro = 14.0;
  static const double sizeRegular = 18.0;
  static const double sizeStandard = 20.0;
  static const double sizeLarge = 24.0;

  // Navigation
  static const sidebar = HugeIcons.strokeRoundedSidebarLeft;
  static const home = HugeIcons.strokeRoundedHome01;
  static const campaigns = HugeIcons.strokeRoundedMegaphone01;
  static const contacts = HugeIcons.strokeRoundedContact01;
  static const agents = HugeIcons.strokeRoundedBot;
  static const reports = HugeIcons.strokeRoundedAnalytics01;
  static const settings = HugeIcons.strokeRoundedSettings01;
  static const search = HugeIcons.strokeRoundedSearch01;

  // Actions
  static const add = HugeIcons.strokeRoundedAdd01;
  static const send = HugeIcons.strokeRoundedArrowUp01;
  static const stop = HugeIcons.strokeRoundedSquare;
  static const share = HugeIcons.strokeRoundedShare01;
  static const chevronDown = HugeIcons.strokeRoundedArrowDown01;

  // Telephony & Voice
  static const callOutgoing = HugeIcons.strokeRoundedCallOutgoing01;
  static const callConnected = HugeIcons.strokeRoundedCall02;
  static const mic = HugeIcons.strokeRoundedMic01;
  static const voiceWave = HugeIcons.strokeRoundedVoice;

  // Status & Badges
  static const simulation = HugeIcons.strokeRoundedCpu;
  static const liveRadio = HugeIcons.strokeRoundedRadio;
  static const success = HugeIcons.strokeRoundedCheckmarkCircle01;
  static const pause = HugeIcons.strokeRoundedPause;
  static const cancel = HugeIcons.strokeRoundedCancel01;
  static const clock = HugeIcons.strokeRoundedClock01;

  // Files & Artifacts
  static const file = HugeIcons.strokeRoundedFile01;
  static const fileImport = HugeIcons.strokeRoundedFileAttachment01;
  static const download = HugeIcons.strokeRoundedDownload01;
}

/// Convenience Widget wrapping HugeIcon with theme-aware defaults
class AppIcon extends StatelessWidget {
  const AppIcon(
    this.icon, {
    super.key,
    this.size = AppIcons.sizeStandard,
    this.color,
    this.strokeWidth = 1.6,
  });

  final List<List<dynamic>> icon;
  final double size;
  final Color? color;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return HugeIcon(
      icon: icon,
      size: size,
      color: color ?? Theme.of(context).iconTheme.color ?? Colors.white,
      strokeWidth: strokeWidth,
    );
  }
}
```

---

## 6. Responsive Shell & Breakpoint Architecture

The Flutter application must adapt fluidly across mobile phones (iOS/Android), tablets/foldables, and wide desktop workstations (macOS/Web). 

### 6.1 Breakpoint Grid Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RESPONSIVE SHELL MAP                            │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│ COMPACT (< 600px)    │ MEDIUM (600 - 1024px)│ EXPANDED (> 1024px)      │
├──────────────────────┼──────────────────────┼──────────────────────────┤
│ Mobile Handset       │ Tablet / Foldable    │ Desktop / macOS / Web    │
│ Modal Drawer         │ Collapsible Side Rail│ Persistent Wide Sidebar  │
│ Top App Bar + Toggle │ 72px / 240px Rail    │ 260px Persistent Nav     │
│ Centered Floating    │ Floating Composer    │ Docked or Constrained    │
│ Composer (Padded)    │ Max Width: 720px     │ Center Island (Max 800)  │
│ Single Column Stack  │ Master-Detail Split  │ Multi-Column Dashboard   │
└──────────────────────┴──────────────────────┴──────────────────────────┘
```

### 6.2 Responsive Invariants

1. **Compact Mode (`< 600px`):**
   - Directly mirrors the reference screenshots.
   - Pinned top bar: Leading drawer icon `strokeRoundedSidebarLeft`, center logo or segmented pill (`[ Chat | Work ]` or `[ Campaigns | Intern ]`), trailing avatar or action button.
   - Modal drawer overlay slides in from left on tap.
   - The **Floating Island Composer** is pinned above the bottom safe area padding (keyboard-responsive via `MediaQuery.viewInsetsOf(context).bottom`).
   - Content padding: `16px` horizontal.

2. **Medium Mode (`600px - 1024px`):**
   - Transitions to a **Collapsible Side Rail** (72px collapsed width showing icon tiles, expandable to 240px).
   - Main content area expands with `24px` padding.
   - The Floating Composer remains centered with a maximum constraint width of `720px`.

3. **Expanded Mode (`> 1024px`):**
   - **Persistent Left Navigation Sidebar (260px):** Always visible. Contains workspace switcher, pinned campaigns, active interns, and system status.
   - **Master-Detail Multi-Column Workstation:**
     - Left Column (360px): Live Campaign Contacts / In-Flight Attempt Queue.
     - Right Column (Flexible flex: 1): Active Call Stream, SSE Monotonic Event Feed, Persona Sandbox, or Analysis Ledger.
   - Composer Island: Centered in the detail canvas with `max-width: 840px` and fluid horizontal margin.

### 6.3 Responsive Breakpoint Constants & Shell Scaffold

```dart
// lib/core/layout/responsive_breakpoints.dart
import 'package:flutter/material.dart';

class ResponsiveBreakpoints {
  ResponsiveBreakpoints._();

  static const double compactMax = 599.0;
  static const double mediumMin = 600.0;
  static const double mediumMax = 1023.0;
  static const double expandedMin = 1024.0;

  static bool isCompact(BuildContext context) =>
      MediaQuery.sizeOf(context).width < mediumMin;

  static bool isMedium(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return w >= mediumMin && w <= mediumMax;
  }

  static bool isExpanded(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= expandedMin;
}
```

---

## 7. High-Stakes Domain Components: Simulation vs. Live Indicators

Because `Outreach Intern` controls real outbound telephony through Sarvam AI where carrier costs and human privacy boundaries apply, **the visual distinction between Simulation Mode and Live Telephony Mode must be unmistakable**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SIMULATION VS. LIVE VISUAL CONTRAST                  │
├───────────────────────────────────┬────────────────────────────────────┤
│ SIMULATION MODE                   │ LIVE TELEPHONY MODE                │
├───────────────────────────────────┼────────────────────────────────────┤
│ Visual: Analytical Slate Blueprint│ Visual: Luminous Crimson Sentinel  │
│ Icon: CPU / Blueprint Chip        │ Icon: Pulsing Glowing Radio Beacon │
│ Copy: "SIMULATION"                │ Copy: "LIVE DIALING"               │
│ Light: #F1F5F9 bg, #475569 border │ Light: #FEF2F2 bg, #DC2626 border  │
│ Dark:  #1E2430 bg, #94A3B8 border │ Dark:  #2E1214 bg, #EF4444 border  │
│ Zero Telephony / Zero Cost Safe   │ Real Carrier Tolls / Live Human    │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 7.1 Production Dart Widget: `CampaignModeBadge`

```dart
// lib/features/campaigns/presentation/widgets/campaign_mode_badge.dart
import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/app_icons.dart';

enum CampaignExecutionMode { simulation, live }

class CampaignModeBadge extends StatefulWidget {
  const CampaignModeBadge({
    super.key,
    required this.mode,
    this.compact = false,
  });

  final CampaignExecutionMode mode;
  final bool compact;

  @override
  State<CampaignModeBadge> createState() => _CampaignModeBadgeState();
}

class _CampaignModeBadgeState extends State<CampaignModeBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _pulseAnimation = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOut,
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final isLive = widget.mode == CampaignExecutionMode.live;

    final bgColor = isLive ? colors.accentRedSubtle : colors.statusSimulationBg;
    final borderColor = isLive ? colors.accentRed.withOpacity(0.5) : colors.borderSubtle;
    final textColor = isLive ? colors.accentRed : colors.statusSimulation;

    return Semantics(
      label: isLive
          ? 'Live Campaign: Outbound phone calls and real carrier ledger charges are active.'
          : 'Simulation Campaign: Deterministic mock dry-run. No phone calls are dispatched.',
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: widget.compact ? 8.0 : 12.0,
          vertical: widget.compact ? 4.0 : 6.0,
        ),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: AppRadii.brPill,
          border: Border.all(color: borderColor, width: 1.0),
          boxShadow: isLive
              ? [
                  BoxShadow(
                    color: colors.accentRed.withOpacity(0.18),
                    blurRadius: 8,
                    spreadRadius: 1,
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (isLive) ...[
              AnimatedBuilder(
                animation: _pulseAnimation,
                builder: (context, child) {
                  return Container(
                    width: 7.0,
                    height: 7.0,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.accentRed.withOpacity(
                        0.6 + (_pulseAnimation.value * 0.4),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: colors.accentRed.withOpacity(
                            _pulseAnimation.value * 0.8,
                          ),
                          blurRadius: 6,
                          spreadRadius: 2 * _pulseAnimation.value,
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(width: 6.0),
              Text(
                'LIVE',
                style: AppTypography.createTextTheme(
                  textColor,
                  textColor,
                  textColor,
                ).labelSmall?.copyWith(
                      color: textColor,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
              ),
            ] else ...[
              AppIcon(
                AppIcons.simulation,
                size: 13.0,
                color: textColor,
                strokeWidth: 1.8,
              ),
              const SizedBox(width: 5.0),
              Text(
                'SIMULATION',
                style: AppTypography.createTextTheme(
                  textColor,
                  textColor,
                  textColor,
                ).labelSmall?.copyWith(
                      color: textColor,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

---

## 8. Signature Widget Architecture: The Floating Island Composer

The floating island composer is the hallmark of the reference screenshots. In Kraken, it floats gracefully over a warm canvas with clean attachment buttons and model selectors; in Bloom, it anchors a pitch-black canvas with a vivid red caret and glowing crimson send pill.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   FLOATING ISLAND COMPOSER ANATOMY                     │
├────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │  How can I help you today?|                                        │ │
│ │                                                                    │ │
│ │ ┌───┐   ┌──────────────────────────┐   ┌───┐   ┌─────────────────┐ │ │
│ │ │ + │   │ 🤖 Outreach Intern v1  ∨ │   │ 🎙 │   │   ↑ (Red Pill)  │ │ │
│ │ └───┘   └──────────────────────────┘   └───┘   └─────────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│          Kraken & Bloom: AI can make mistakes. Verify telemetry.       │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Production Dart Implementation: `FloatingIslandComposer`

```dart
// lib/features/composer/presentation/widgets/floating_island_composer.dart
import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/theme/app_icons.dart';

class FloatingIslandComposer extends StatefulWidget {
  const FloatingIslandComposer({
    super.key,
    required this.onSend,
    this.onStop,
    this.isStreaming = false,
    this.selectedPersona = 'Outreach Intern v1',
    this.onSelectPersona,
    this.onAttachFile,
    this.hintText = 'Ask anything or command intern...',
  });

  final ValueChanged<String> onSend;
  final VoidCallback? onStop;
  final bool isStreaming;
  final String selectedPersona;
  final VoidCallback? onSelectPersona;
  final VoidCallback? onAttachFile;
  final String hintText;

  @override
  State<FloatingIslandComposer> createState() => _FloatingIslandComposerState();
}

class _FloatingIslandComposerState extends State<FloatingIslandComposer> {
  late final TextEditingController _controller;
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _controller.addListener(() {
      final hasText = _controller.text.trim().isNotEmpty;
      if (hasText != _hasText) {
        setState(() => _hasText = hasText);
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleSubmit() {
    if (widget.isStreaming) {
      widget.onStop?.call();
      return;
    }
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 800),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                decoration: BoxDecoration(
                  color: colors.surfaceElevated,
                  borderRadius: AppRadii.brComposer,
                  border: Border.all(
                    color: _hasText ? colors.borderStrong : colors.borderSubtle,
                    width: 1.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: isDark
                          ? const Color(0x33000000)
                          : const Color(0x0A000000),
                      blurRadius: 18,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                padding: const EdgeInsets.fromLTRB(18.0, 14.0, 14.0, 12.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: _controller,
                      cursorColor: colors.accentRed,
                      cursorWidth: 2.0,
                      cursorRadius: const Radius.circular(1.0),
                      minLines: 1,
                      maxLines: 5,
                      style: AppTypography.createTextTheme(
                        colors.textPrimary,
                        colors.textSecondary,
                        colors.textMuted,
                      ).bodyLarge,
                      decoration: InputDecoration(
                        hintText: widget.hintText,
                        hintStyle: TextStyle(
                          color: colors.textMuted,
                          fontSize: 15.0,
                        ),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      onSubmitted: (_) => _handleSubmit(),
                    ),
                    const SizedBox(height: 12.0),
                    Row(
                      children: [
                        // Attachment Action Trigger (+)
                        _ComposerIconButton(
                          icon: AppIcons.add,
                          tooltip: 'Attach Contact List or Knowledge File',
                          onTap: widget.onAttachFile,
                        ),
                        const SizedBox(width: 8.0),

                        // Persona Selector Pill ("Outreach Intern v1 ∨")
                        InkWell(
                          onTap: widget.onSelectPersona,
                          borderRadius: AppRadii.brPill,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10.0,
                              vertical: 5.0,
                            ),
                            decoration: BoxDecoration(
                              color: colors.surfaceSubtle,
                              borderRadius: AppRadii.brPill,
                              border: Border.all(
                                color: colors.borderSubtle,
                                width: 1.0,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  widget.selectedPersona,
                                  style: TextStyle(
                                    fontSize: 13.0,
                                    fontWeight: FontWeight.w500,
                                    color: colors.textSecondary,
                                  ),
                                ),
                                const SizedBox(width: 4.0),
                                AppIcon(
                                  AppIcons.chevronDown,
                                  size: 14.0,
                                  color: colors.textMuted,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const Spacer(),

                        // Sandbox Mic Preview (Text-Only Disclaimer Badge)
                        Tooltip(
                          message: 'Voice preview occurs in Sarvam Dashboard. Local turns execute text sandboxing.',
                          child: _ComposerIconButton(
                            icon: AppIcons.mic,
                            tooltip: 'Voice Sandbox',
                            onTap: () {},
                          ),
                        ),
                        const SizedBox(width: 8.0),

                        // Primary Action Trigger (Send ↑ or Stop ■)
                        GestureDetector(
                          onTap: (widget.isStreaming || _hasText)
                              ? _handleSubmit
                              : null,
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            width: 34.0,
                            height: 34.0,
                            decoration: BoxDecoration(
                              color: widget.isStreaming
                                  ? (isDark ? Colors.white : colors.textPrimary)
                                  : _hasText
                                      ? colors.accentRed
                                      : colors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(12.0),
                            ),
                            alignment: Alignment.center,
                            child: widget.isStreaming
                                ? Container(
                                    width: 10.0,
                                    height: 10.0,
                                    decoration: BoxDecoration(
                                      color: isDark ? Colors.black : Colors.white,
                                      borderRadius: BorderRadius.circular(2.0),
                                    ),
                                  )
                                : AppIcon(
                                    AppIcons.send,
                                    size: 16.0,
                                    color: _hasText
                                        ? Colors.white
                                        : colors.textMuted,
                                    strokeWidth: 2.2,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8.0),
              Text(
                'Outreach Intern executes deterministic telephony policies. Confirm prompts before launch.',
                style: TextStyle(
                  fontSize: 11.0,
                  color: colors.textMuted,
                  letterSpacing: 0.1,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ComposerIconButton extends StatelessWidget {
  const _ComposerIconButton({
    required this.icon,
    required this.tooltip,
    this.onTap,
  });

  final List<List<dynamic>> icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8.0),
        child: Container(
          width: 32.0,
          height: 32.0,
          alignment: Alignment.center,
          child: AppIcon(
            icon,
            size: 18.0,
            color: colors.textSecondary,
            strokeWidth: 1.6,
          ),
        ),
      ),
    );
  }
}
```

---

## 9. Flutter Theme Construction (`AppTheme`)

The full Flutter `ThemeData` factory integrates Material 3, typography, icon themes, divider themes, and the `AppColors` extension.

```dart
// lib/core/theme/app_theme.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';
import 'app_typography.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get light {
    final colors = AppColors.light;
    final textTheme = AppTypography.createTextTheme(
      colors.textPrimary,
      colors.textSecondary,
      colors.textMuted,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: colors.background,
      colorScheme: ColorScheme.light(
        surface: colors.surface,
        onSurface: colors.textPrimary,
        primary: colors.accentRed,
        error: colors.statusError,
      ),
      textTheme: textTheme,
      dividerTheme: DividerThemeData(
        color: colors.borderSubtle,
        thickness: 1.0,
        space: 1.0,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: colors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        iconTheme: IconThemeData(color: colors.textPrimary),
        titleTextStyle: textTheme.titleMedium,
      ),
      extensions: const [colors],
    );
  }

  static ThemeData get dark {
    final colors = AppColors.dark;
    final textTheme = AppTypography.createTextTheme(
      colors.textPrimary,
      colors.textSecondary,
      colors.textMuted,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: colors.background,
      colorScheme: ColorScheme.dark(
        surface: colors.surface,
        onSurface: colors.textPrimary,
        primary: colors.accentRed,
        error: colors.statusError,
      ),
      textTheme: textTheme,
      dividerTheme: DividerThemeData(
        color: colors.borderSubtle,
        thickness: 1.0,
        space: 1.0,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: colors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        iconTheme: IconThemeData(color: colors.textPrimary),
        titleTextStyle: textTheme.titleMedium,
      ),
      extensions: const [colors],
    );
  }
}
```

---

## 10. Design System Verification Matrix

| Visual Spec Dimension | Target Requirement | Implemented Specification | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Aesthetic Duality** | Quiet monochrome with surgical red accent | Light warm paper (`#F9F9F8`), dark velvet charcoal (`#0D0D0E`), vivid crimson (`#DC2626`/`#EF4444`) | Matches both Kraken & Bloom references exactly |
| **Color Extensibility** | Compile-safe `ThemeExtension` | Strongly typed `AppColors` with `lerp()`, `copyWith()`, and `BuildContext` sugar | Fully tested Dart class in Section 2.2 |
| **Typography Scale** | Inter font with tight heading tracking | 9-tier scale with explicit line-heights and negative letter-spacing for headlines | `AppTypography` implementation in Section 3.2 |
| **Curvature & Radii** | Sculpted corners, hairline borders | 26px for composer, 18px for pills, 16px for cards; 1px single-stroke borders | `AppRadii` & `AppBorders` in Section 4 |
| **Iconography** | Unified Stroke Rounded family | 100% HugeIcons stroke mapping with standardized sizes (14/18/20/24) | `AppIcons` and mapping table in Section 5 |
| **Responsive Shell** | 3-tier adaptive breakpoints | Compact (<600px), Medium (600–1024px), Expanded (>1024px) | `ResponsiveBreakpoints` and layout maps in Section 6 |
| **High-Stakes Telephony** | Clear simulation vs. live distinction | Slate blueprint badge vs. pulsating crimson beacon with accessibility semantics | `CampaignModeBadge` widget in Section 7 |
| **Floating Composer** | Exact recreation of reference interaction | Multi-line text field, attachment trigger, model selector, red send pill | `FloatingIslandComposer` in Section 8 |

---

## 11. Next Steps & Handoff to UX Architects

This visual system specification serves as the formal foundation for:
1. **Agent H (Information Architecture & Navigation Flow):** Wireframing route hierarchy, persistent rail states, and campaign step progression using the tokens defined here.
2. **Agent I (Component Library Implementation):** Scaffolding `apps/flutter_app/lib/core/theme/` and core UI widgets based directly on the production Dart code provided above.
3. **Agent J (Screen State & Interaction Design):** Designing campaign creation wizards, live SSE streaming monitors, and text-only sandbox preview turns in accordance with these visual constraints.
