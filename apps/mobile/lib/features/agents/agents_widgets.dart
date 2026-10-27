import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../settings/settings_widgets.dart' show SettingsBackChip;

/// Agents-feature view over the app [AppPalette].
class Pal {
  const Pal(this.p);
  final AppPalette p;
  static Pal of(BuildContext context) => Pal(context.palette);
  Color get card => p.group; // grouped rows
  Color get elevated => p.chip; // chips, round buttons
  Color get border => p.hairline;
  Color get text => p.text;
  Color get sub => p.muted;
  Color get accent => p.accent;
  Color get success => p.success;
  Color get warning => p.warning;
  Color get danger => p.danger;
}

/// Normalised error for inline display: server code + message.
(String, String) errorParts(Object e) => e is ApiException
    ? (e.code, e.message)
    : ('NETWORK_ERROR', e.toString());

class InlineError extends StatelessWidget {
  final Object error;
  final VoidCallback? onRetry;
  const InlineError(this.error, {super.key, this.onRetry});
  @override
  Widget build(BuildContext context) {
    final (code, message) = errorParts(error);
    final p = Pal.of(context);
    return Semantics(
      liveRegion: true,
      label: 'Error $code. $message',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: p.danger.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            HugeIcon(
              icon: HugeIcons.strokeRoundedAlert02,
              color: p.danger,
              size: 18,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    code,
                    style: TextStyle(
                      color: p.danger,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(message, style: TextStyle(color: p.text, fontSize: 13)),
                ],
              ),
            ),
            if (onRetry != null)
              TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

/// ChatGPT-style grouped list: small caps header, one rounded surface, hairline dividers.
class Group extends StatelessWidget {
  final String? title;
  final List<Widget> children;
  final String? footer;
  const Group({super.key, this.title, required this.children, this.footer});
  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Semantics(
                header: true,
                child: Text(
                  title!,
                  style: TextStyle(
                    color: p.sub,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: ColoredBox(
              color: p.card,
              child: Column(
                children: [
                  for (var i = 0; i < children.length; i++) ...[
                    if (i > 0)
                      Divider(height: 0.5, thickness: 0.5, indent: 52, color: p.border),
                    children[i],
                  ],
                ],
              ),
            ),
          ),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(footer!, style: TextStyle(color: p.sub, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

/// One row in a [Group]; min height 56 keeps tap targets >= 48px.
class Cell extends StatelessWidget {
  final List<List<dynamic>>? icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final String? semanticsLabel;
  const Cell({
    super.key,
    this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.semanticsLabel,
  });
  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    return Semantics(
      button: onTap != null,
      label: semanticsLabel,
      excludeSemantics: semanticsLabel != null,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                if (icon != null) ...[
                  HugeIcon(icon: icon!, color: p.text, size: 22),
                  const SizedBox(width: 14),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: TextStyle(color: p.text, fontSize: 16)),
                      if (subtitle != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitle!,
                          style: TextStyle(color: p.sub, fontSize: 13),
                        ),
                      ],
                    ],
                  ),
                ),
                if (trailing != null) ...[const SizedBox(width: 8), trailing!],
                if (onTap != null && trailing == null)
                  HugeIcon(
                    icon: HugeIcons.strokeRoundedArrowRight01,
                    color: p.sub,
                    size: 18,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Row showing a URL/value with a copy-to-clipboard action.
class CopyCell extends StatelessWidget {
  final String title, value;
  const CopyCell({super.key, required this.title, required this.value});
  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    return Cell(
      title: title,
      subtitle: value,
      trailing: IconButton(
        tooltip: 'Copy $title',
        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        icon: HugeIcon(icon: HugeIcons.strokeRoundedCopy01, color: p.sub, size: 18),
        onPressed: () async {
          await Clipboard.setData(ClipboardData(text: value));
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('$title copied')),
            );
          }
        },
      ),
    );
  }
}

/// Small status label: dot + text, tinted by tone.
class Pill extends StatelessWidget {
  final String label;
  final Color color;
  const Pill(this.label, this.color, {super.key});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label,
      style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
    ),
  );
}

Color voiceStatusColor(BuildContext context, String s) {
  final p = context.palette;
  return switch (s) {
    'configured' => p.success,
    'invalid' => p.danger,
    _ => p.muted,
  };
}

String voiceStatusLabel(String s) => switch (s) {
  'configured' => 'Voice set',
  'invalid' => 'Voice invalid',
  _ => 'No voice',
};

/// App bar with the round back chip used across settings and agents.
PreferredSizeWidget chipAppBar(String title, {List<Widget>? actions}) => AppBar(
  title: Text(title),
  automaticallyImplyLeading: false,
  leadingWidth: 64,
  leading: const Padding(
    padding: EdgeInsets.only(left: 12),
    child: Center(child: SettingsBackChip()),
  ),
  actions: actions,
);
