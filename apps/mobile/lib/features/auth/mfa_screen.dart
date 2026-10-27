import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';
import 'sign_in_screen.dart' show AuthScaffold, AuthError, AuthPrimaryButton;

class MfaScreen extends ConsumerStatefulWidget {
  const MfaScreen({super.key});

  @override
  ConsumerState<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends ConsumerState<MfaScreen> {
  final _codeController = TextEditingController();
  bool _useRecoveryCode = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  void _verify() {
    final code = _codeController.text.trim();
    if (code.isEmpty) return;
    ref.read(authProvider.notifier).verifyMfa(code, isRecoveryCode: _useRecoveryCode);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final p = context.palette;
    return AuthScaffold(
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Semantics(
            button: true,
            label: 'Back to sign in',
            excludeSemantics: true,
            child: Material(
              color: p.chip,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => ref.read(authProvider.notifier).logout(),
                child: SizedBox.square(
                  dimension: 48,
                  child: Center(
                    child: HugeIcon(
                        icon: HugeIcons.strokeRoundedArrowLeft01,
                        color: p.text,
                        size: 22),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      title: _useRecoveryCode ? 'Recovery code' : 'Two-factor authentication',
      subtitle: _useRecoveryCode
          ? 'Enter one of your 8-character single-use recovery codes.'
          : 'Enter the 6-digit code from your authenticator app.',
      children: [
        TextField(
          controller: _codeController,
          autofocus: true,
          keyboardType:
              _useRecoveryCode ? TextInputType.text : TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          textAlign: TextAlign.center,
          style: const TextStyle(
              fontSize: 24, letterSpacing: 6, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            hintText: _useRecoveryCode ? 'XXXX-XXXX' : '••••••',
            hintStyle: TextStyle(letterSpacing: 4, color: p.subtle),
          ),
          onSubmitted: (_) => _verify(),
        ),
        if (authState.errorMessage != null) AuthError(authState.errorMessage!),
        const SizedBox(height: 20),
        AuthPrimaryButton(
            label: 'Verify & Continue',
            busy: authState.isLoading,
            onPressed: _verify),
        const SizedBox(height: 8),
        TextButton(
          style: TextButton.styleFrom(foregroundColor: p.muted),
          onPressed: () => setState(() {
            _useRecoveryCode = !_useRecoveryCode;
            _codeController.clear();
          }),
          child: Text(_useRecoveryCode
              ? 'Use authenticator code instead'
              : 'Lost access? Use a recovery code'),
        ),
      ],
    );
  }
}
