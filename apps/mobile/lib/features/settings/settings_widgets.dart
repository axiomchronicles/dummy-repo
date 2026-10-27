import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import 'settings_providers.dart';

/// Settings-local alias over the app-wide [AppPalette] (accent follows the
/// user's choice; red only via [danger]).
class SettingsPalette {
  const SettingsPalette(this._p);
  final AppPalette _p;
  static SettingsPalette of(BuildContext c) => SettingsPalette(c.palette);
  Color get bg => _p.bg;
  Color get surface => _p.surface;
  Color get group => _p.group;
  Color get chip => _p.chip;
  Color get hairline => _p.hairline;
  Color get text => _p.text;
  Color get muted => _p.muted;
  Color get subtle => _p.subtle;
  Color get accent => _p.accent;
  Color get onAccent => _p.onAccent;
  Color get warning => _p.warning;
  Color get success => _p.success;
  Color get danger => _p.danger;
}

bool reduceMotion(BuildContext c) => MediaQuery.of(c).disableAnimations;

Future<T?> pushSettingsPage<T>(BuildContext context, Widget page) {
  if (reduceMotion(context)) {
    return Navigator.of(context).push<T>(PageRouteBuilder(
      pageBuilder: (_, _, _) => page,
      transitionDuration: Duration.zero,
      reverseTransitionDuration: Duration.zero,
    ));
  }
  return Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));
}

class SettingsBackChip extends StatelessWidget {
  const SettingsBackChip({super.key});
  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    return Semantics(
      button: true,
      label: 'Back',
      excludeSemantics: true,
      child: Material(
        color: p.chip,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => Navigator.of(context).maybePop(),
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: HugeIcon(
                  icon: HugeIcons.strokeRoundedArrowLeft01,
                  color: p.text,
                  size: 22),
            ),
          ),
        ),
      ),
    );
  }
}

class SettingsSectionHeader extends StatelessWidget {
  const SettingsSectionHeader(this.title, {super.key});
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
        child: Semantics(
          header: true,
          child: Text(title,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: SettingsPalette.of(context).muted)),
        ),
      );
}

class SettingsFooter extends StatelessWidget {
  const SettingsFooter(this.text, {super.key, this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
        child: Text(text,
            style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: color ?? SettingsPalette.of(context).muted)),
      );
}

/// Rounded container of rows separated by hairline dividers.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({super.key, required this.children, this.inset = true});
  final List<Widget> children;

  /// Horizontal page margin; off when already inside padded content.
  final bool inset;
  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    final items = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) {
        items.add(Divider(
            height: 0.5, thickness: 0.5, indent: 56, color: p.hairline));
      }
      items.add(children[i]);
    }
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: inset ? 16 : 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: ColoredBox(
          color: p.group,
          child: Column(mainAxisSize: MainAxisSize.min, children: items),
        ),
      ),
    );
  }
}

/// One ~56px settings row: leading icon, title, trailing value or chevron.
class SettingsRow extends ConsumerWidget {
  const SettingsRow({
    super.key,
    required this.icon,
    required this.title,
    this.value,
    this.subtitle,
    this.onTap,
    this.trailing,
    this.chevron = true,
    this.accent = false,
    this.destructive = false,
  });
  final List<List<dynamic>> icon;
  final String title;
  final String? value;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool chevron;
  final bool accent;
  final bool destructive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = SettingsPalette.of(context);
    final fg = destructive ? p.danger : (accent ? p.accent : p.text);
    final label = [title, ?value, ?subtitle].join(', ');
    return Semantics(
      button: onTap != null,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap == null
            ? null
            : () {
                ref.read(hapticsProvider.notifier).tick();
                onTap!();
              },
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(children: [
              HugeIcon(icon: icon, color: fg, size: 22),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title,
                        style: TextStyle(
                            fontSize: 16,
                            color: fg,
                            fontWeight:
                                accent ? FontWeight.w600 : FontWeight.w400)),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(subtitle!,
                            style: TextStyle(fontSize: 12.5, color: p.muted)),
                      ),
                  ],
                ),
              ),
              if (value != null)
                Flexible(
                  child: Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Text(value!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right,
                        style: TextStyle(fontSize: 15, color: p.muted)),
                  ),
                ),
              ?trailing,
              if (chevron && onTap != null && trailing == null)
                Padding(
                  padding: const EdgeInsets.only(left: 6),
                  child: HugeIcon(
                      icon: HugeIcons.strokeRoundedArrowRight01,
                      color: p.muted,
                      size: 18),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

class InlineError extends StatelessWidget {
  const InlineError(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
        child: Row(children: [
          Expanded(
            child: Text(message,
                style: TextStyle(fontSize: 12.5, color: p.danger, height: 1.4)),
          ),
          if (onRetry != null)
            TextButton(onPressed: onRetry, child: const Text('Retry')),
        ]),
      ),
    );
  }
}

class SettingsLoadingRow extends StatelessWidget {
  const SettingsLoadingRow({super.key});
  @override
  Widget build(BuildContext context) => const SizedBox(
        height: 56,
        child: Center(
          child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      );
}

/// Scaffold for settings detail sub-pages.
class SettingsPage extends StatelessWidget {
  const SettingsPage(
      {super.key, required this.title, required this.children, this.controller});
  final String title;
  final List<Widget> children;
  final ScrollController? controller;
  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    return Scaffold(
      backgroundColor: p.bg,
      body: SafeArea(
        child: ListView(
          controller: controller,
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(children: [
                const SettingsBackChip(),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(title,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium),
                  ),
                ),
                const SizedBox(width: 48),
              ]),
            ),
            ...children,
          ],
        ),
      ),
    );
  }
}
