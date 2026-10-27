import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'settings_providers.dart';
import 'settings_sheets.dart';
import 'settings_widgets.dart';

/// MFA state from the sign-in response, updated locally after confirm.
// ponytail: /auth/me omits mfaEnabled, so a restored session reports false
// until the server exposes it there.
final mfaEnabledProvider = StateProvider<bool>(
    (ref) => ref.watch(authProvider).user?.mfaEnabled ?? false);

class SecurityPage extends ConsumerStatefulWidget {
  const SecurityPage({super.key});
  @override
  ConsumerState<SecurityPage> createState() => _SecurityPageState();
}

class _SecurityPageState extends ConsumerState<SecurityPage> {
  Map<String, dynamic>? _enrollment;
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
    } catch (e) {
      _error = e is FormatException ? e.message : errorText(e);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _enroll(bool enabled) async {
    if (enabled &&
        !await confirmAction(context,
            title: 'Replace authenticator?',
            message:
                'This creates a new secret and 8 new recovery codes. Your current authenticator and recovery codes stop working immediately.',
            confirmLabel: 'Replace')) {
      return;
    }
    await _run(() async {
      final res =
          asMap(await ref.read(apiClientProvider).post('/api/v1/auth/mfa/enroll'));
      _enrollment = res;
    });
  }

  Future<void> _confirm() => _run(() async {
        final code = _code.text.trim();
        if (!RegExp(r'^\d{6}$').hasMatch(code)) {
          throw const FormatException('Enter the 6-digit code from your app');
        }
        await ref
            .read(apiClientProvider)
            .post('/api/v1/auth/mfa/confirm', body: {'code': code});
        ref.read(mfaEnabledProvider.notifier).state = true;
        _enrollment = null;
        _code.clear();
      });

  void _copy(String label, String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('$label copied')));
  }

  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    final enabled = ref.watch(mfaEnabledProvider);
    final en = _enrollment;
    final codes = (en?['recoveryCodes'] as List? ?? const []).map((c) => '$c');
    return SettingsPage(title: 'Security', children: [
      const SettingsSectionHeader('Two-factor authentication'),
      SettingsGroup(children: [
        SettingsRow(
          icon: HugeIcons.strokeRoundedSecurityLock,
          title: 'Authenticator app',
          value: enabled ? 'On' : 'Not enrolled',
        ),
        if (en == null)
          SettingsRow(
            icon: HugeIcons.strokeRoundedKey01,
            title: enabled ? 'Replace authenticator' : 'Set up authenticator',
            accent: !enabled,
            trailing: _busy ? const _Spinner() : null,
            onTap: _busy ? null : () => _enroll(enabled),
          ),
      ]),
      SettingsFooter(enabled
          ? 'Status reflects this sign-in. Recovery codes are shown once at enrollment; the server does not expose how many remain.'
          : 'Status reflects this sign-in. Set up a TOTP app (Google Authenticator, 1Password, Authy) to protect your account.'),
      if (en != null) ...[
        const SettingsSectionHeader('1. Add to your authenticator'),
        SettingsGroup(children: [
          SettingsRow(
            icon: HugeIcons.strokeRoundedKey01,
            title: 'Setup key',
            subtitle: '${en['secret']}',
            trailing: const _CopyIcon(),
            onTap: () => _copy('Setup key', '${en['secret']}'),
          ),
          SettingsRow(
            icon: HugeIcons.strokeRoundedLink01,
            title: 'Copy otpauth link',
            trailing: const _CopyIcon(),
            onTap: () => _copy('Link', '${en['qrCodeUri']}'),
          ),
        ]),
        const SettingsSectionHeader('2. Save recovery codes'),
        SettingsGroup(children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: SelectableText(codes.join('\n'),
                style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 15,
                    height: 1.6,
                    color: p.text)),
          ),
          SettingsRow(
            icon: HugeIcons.strokeRoundedCopy01,
            title: 'Copy all codes',
            chevron: false,
            onTap: () => _copy('Recovery codes', codes.join('\n')),
          ),
        ]),
        const SettingsFooter('Each code works once. They will not be shown again.'),
        const SettingsSectionHeader('3. Confirm'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextField(
            controller: _code,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(
                hintText: '6-digit code', counterText: ''),
            onSubmitted: (_) => _confirm(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: SaveButton(saving: _busy, onPressed: _confirm, label: 'Verify & enable'),
        ),
      ],
      if (_error != null)
        InlineError(_error!),
    ]);
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) => const SizedBox(
      width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2));
}

class _CopyIcon extends StatelessWidget {
  const _CopyIcon();
  @override
  Widget build(BuildContext context) => HugeIcon(
      icon: HugeIcons.strokeRoundedCopy01,
      color: SettingsPalette.of(context).muted,
      size: 18);
}
