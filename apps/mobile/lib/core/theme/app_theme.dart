import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

/// Neutral, ChatGPT-style design tokens. There is no brand red: the only
/// accent is the user-selectable [AppAccent]; red is reserved for
/// destructive actions and errors ([AppColors.danger]).
class AppColors {
  // Dark: pure black canvas, charcoal surfaces (ChatGPT-style).
  static const Color darkBackground = Color(0xFF000000);
  static const Color darkCard = Color(0xFF1C1C1E); // drawer, sheets — near-black
  static const Color darkCardElevated = Color(0xFF2A2A2A); // groups, chips
  static const Color darkBorder = Color(0xFF3A3A3A);
  static const Color darkTextPrimary = Color(0xFFECECEC);
  static const Color darkTextSecondary = Color(0xFFA0A0A0);
  static const Color darkAccent = Color(0xFF3B6CF5); // default Blue accent

  // Light: white canvas, soft grey surfaces.
  static const Color lightBackground = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFF9F9F9);
  static const Color lightCardElevated = Color(0xFFF0F0F0);
  static const Color lightBorder = Color(0xFFE3E3E3);
  static const Color lightTextPrimary = Color(0xFF0D0D0D);
  static const Color lightTextSecondary = Color(0xFF6B6B6B);
  static const Color lightAccent = Color(0xFF2563EB);

  // Semantic status colors (never used as decoration).
  static const Color success = Color(0xFF10A37F);
  static const Color warning = Color(0xFFE5A100);
  static const Color danger = Color(0xFFE5484D);
  static const Color info = Color(0xFF3B6CF5);

  // Grouped settings surfaces (hairline dividers, no outer borders).
  static const Color darkGroup = Color(0xFF2A2A2A);
  static const Color darkHairline = Color(0x1FFFFFFF);
  static const Color lightGroup = Color(0xFFFFFFFF);
  static const Color lightHairline = Color(0x14000000);
  static const Color lightSettingsBackground = Color(0xFFF3F3F3);

  // ChatGPT-style user bubble: deep indigo/navy blue.
  static const Color darkUserBubble = Color(0xFF1B3FA0); // deep navy blue
  static const Color lightUserBubble = Color(0xFF1B3FA0);
}

/// Accent colors the user can pick in Settings → Appearance.
enum AppAccent {
  neutral('Default', Color(0xFFECECEC), Color(0xFF0D0D0D)),
  blue('Blue', Color(0xFF3B6CF5), Color(0xFF2563EB)),
  green('Green', Color(0xFF10A37F), Color(0xFF0E8A6B)),
  purple('Purple', Color(0xFF8B5CF6), Color(0xFF7C3AED)),
  orange('Orange', Color(0xFFF08C2E), Color(0xFFDD6B10)),
  pink('Pink', Color(0xFFEC4899), Color(0xFFDB2777));

  const AppAccent(this.label, this.dark, this.light);
  final String label;
  final Color dark;
  final Color light;

  Color resolve(Brightness b) => b == Brightness.dark ? dark : light;

  /// Readable foreground on top of the accent fill.
  Color on(Brightness b) {
    final c = resolve(b);
    return c.computeLuminance() > 0.5 ? Colors.black : Colors.white;
  }
}

/// Every surface a screen needs; read with `context.palette`.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.bg,
    required this.surface,
    required this.group,
    required this.chip,
    required this.field,
    required this.hairline,
    required this.text,
    required this.muted,
    required this.subtle,
    required this.accent,
    required this.onAccent,
    required this.userBubble,
    required this.onUserBubble,
    required this.success,
    required this.warning,
    required this.danger,
  });

  final Color bg; // page canvas
  final Color surface; // drawer, sheets, dialogs
  final Color group; // grouped rows / cards
  final Color chip; // round icon buttons, pills
  final Color field; // composer and text fields
  final Color hairline; // dividers
  final Color text;
  final Color muted; // secondary text and icons
  final Color subtle; // placeholders, disabled
  final Color accent;
  final Color onAccent;
  final Color userBubble;
  final Color onUserBubble;
  final Color success;
  final Color warning;
  final Color danger;

  factory AppPalette.of(Brightness b, AppAccent accent) {
    final dark = b == Brightness.dark;
    final a = accent.resolve(b);
    // ChatGPT-style: user bubble is always deep navy/indigo blue in dark mode.
    const navyBlue = Color(0xFF1B3FA0);
    const navyBlueLighter = Color(0xFF1A3598);
    return AppPalette(
      bg: dark ? AppColors.darkBackground : AppColors.lightBackground,
      surface: dark ? AppColors.darkCard : AppColors.lightCard,
      group: dark ? AppColors.darkGroup : AppColors.lightCardElevated,
      chip: dark ? const Color(0xFF2A2A2A) : const Color(0xFFF0F0F0),
      field: dark ? const Color(0xFF1C1C1E) : const Color(0xFFF2F2F2),
      hairline: dark ? AppColors.darkHairline : AppColors.lightHairline,
      text: dark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
      muted: dark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
      subtle: dark ? const Color(0xFF6E6E6E) : const Color(0xFFA8A8A8),
      accent: a,
      onAccent: accent.on(b),
      userBubble: dark ? navyBlue : navyBlueLighter,
      onUserBubble: Colors.white,
      success: AppColors.success,
      warning: AppColors.warning,
      danger: AppColors.danger,
    );
  }

  @override
  AppPalette copyWith() => this;

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color l(Color x, Color y) => Color.lerp(x, y, t)!;
    return AppPalette(
      bg: l(bg, other.bg),
      surface: l(surface, other.surface),
      group: l(group, other.group),
      chip: l(chip, other.chip),
      field: l(field, other.field),
      hairline: l(hairline, other.hairline),
      text: l(text, other.text),
      muted: l(muted, other.muted),
      subtle: l(subtle, other.subtle),
      accent: l(accent, other.accent),
      onAccent: l(onAccent, other.onAccent),
      userBubble: l(userBubble, other.userBubble),
      onUserBubble: l(onUserBubble, other.onUserBubble),
      success: l(success, other.success),
      warning: l(warning, other.warning),
      danger: l(danger, other.danger),
    );
  }
}

extension PaletteContext on BuildContext {
  AppPalette get palette =>
      Theme.of(this).extension<AppPalette>() ??
      AppPalette.of(Theme.of(this).brightness, AppAccent.blue);
}

class AppTheme {
  static ThemeData get darkTheme => build(Brightness.dark, AppAccent.blue);
  static ThemeData get lightTheme => build(Brightness.light, AppAccent.blue);

  /// One builder for both modes so every component default stays in sync.
  static ThemeData build(Brightness b, AppAccent accent) {
    final p = AppPalette.of(b, accent);
    final dark = b == Brightness.dark;
    final base = ThemeData(brightness: b, useMaterial3: true);
    // Platform UI font (Roboto on Android, SF on iOS), ChatGPT-like sizing.
    final text = base.textTheme
        .copyWith(
          displaySmall: const TextStyle(fontSize: 30, fontWeight: FontWeight.w600, letterSpacing: -0.4),
          headlineSmall: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600, letterSpacing: -0.3),
          titleLarge: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: -0.2),
          titleMedium: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          titleSmall: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          bodyLarge: const TextStyle(fontSize: 17, height: 1.5),
          bodyMedium: const TextStyle(fontSize: 15, height: 1.45),
          bodySmall: TextStyle(fontSize: 13, height: 1.4, color: p.muted),
          labelLarge: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
          labelMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: p.muted),
          labelSmall: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: p.muted),
        )
        .apply(bodyColor: p.text, displayColor: p.text);
    final pill = RoundedRectangleBorder(borderRadius: BorderRadius.circular(999));
    return base.copyWith(
      scaffoldBackgroundColor: p.bg,
      canvasColor: p.bg,
      textTheme: text,
      extensions: [p],
      colorScheme: ColorScheme.fromSeed(
        seedColor: p.accent,
        brightness: b,
        dynamicSchemeVariant: DynamicSchemeVariant.neutral,
      ).copyWith(
        primary: p.accent,
        onPrimary: p.onAccent,
        surface: p.bg,
        onSurface: p.text,
        onSurfaceVariant: p.muted,
        surfaceContainerLowest: p.bg,
        surfaceContainerLow: p.surface,
        surfaceContainer: p.surface,
        surfaceContainerHigh: p.group,
        surfaceContainerHighest: p.chip,
        outline: p.hairline,
        outlineVariant: p.hairline,
        error: p.danger,
      ),
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: p.bg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        foregroundColor: p.text,
        titleTextStyle: text.titleMedium,
        iconTheme: IconThemeData(color: p.text),
      ),
      drawerTheme: DrawerThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(),
        width: 308,
      ),
      cardTheme: CardThemeData(
        color: p.group,
        elevation: 0,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: p.text,
        textColor: p.text,
        minVerticalPadding: 12,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      dividerTheme: DividerThemeData(color: p.hairline, thickness: 0.5, space: 0.5),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.field,
        hintStyle: TextStyle(color: p.subtle, fontSize: 16),
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: p.muted.withValues(alpha: 0.5), width: 1),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: p.danger, width: 1),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.text,
          foregroundColor: p.bg,
          disabledBackgroundColor: p.chip,
          disabledForegroundColor: p.subtle,
          minimumSize: const Size(48, 48),
          shape: pill,
          textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.text,
          side: BorderSide(color: p.hairline),
          minimumSize: const Size(48, 48),
          shape: pill,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: p.text, minimumSize: const Size(48, 44), shape: pill),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: p.text, minimumSize: const Size(48, 48)),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: p.chip,
        selectedColor: p.text,
        labelStyle: TextStyle(color: p.text, fontSize: 14),
        secondaryLabelStyle: TextStyle(color: p.bg, fontSize: 14),
        side: BorderSide.none,
        shape: pill,
        showCheckmark: false,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: p.subtle,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        titleTextStyle: text.titleMedium,
        contentTextStyle: text.bodyMedium?.copyWith(color: p.muted),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: p.group,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: text.bodyMedium,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: dark ? const Color(0xFFECECEC) : const Color(0xFF212121),
        contentTextStyle: TextStyle(color: dark ? Colors.black : Colors.white, fontSize: 14),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.bg : p.muted),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.text : p.chip),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
      radioTheme: RadioThemeData(fillColor: WidgetStatePropertyAll(p.text)),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.text : Colors.transparent),
        checkColor: WidgetStatePropertyAll(p.bg),
        side: BorderSide(color: p.muted, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: p.text,
        inactiveTrackColor: p.chip,
        thumbColor: p.text,
        overlayColor: p.text.withValues(alpha: 0.08),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.text, linearTrackColor: p.chip),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: p.group, borderRadius: BorderRadius.circular(10)),
        textStyle: TextStyle(color: p.text, fontSize: 13),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      }),
    );
  }
}
