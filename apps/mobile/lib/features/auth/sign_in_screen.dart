import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';

/// Centered ChatGPT-style auth layout shared by sign-in and MFA.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.leading,
  });
  final String title;
  final String subtitle;
  final List<Widget> children;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: leading == null ? null : AppBar(leading: leading, leadingWidth: 64),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Semantics(
                      image: true,
                      label: 'Outreach Intern logo',
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.asset(
                          'assets/logo.png',
                          width: 56,
                          height: 56,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) => HugeIcon(
                              icon: HugeIcons.strokeRoundedCall,
                              color: p.text,
                              size: 32),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 28),
                  Semantics(
                    header: true,
                    child: Text(title,
                        textAlign: TextAlign.center, style: text.displaySmall),
                  ),
                  const SizedBox(height: 8),
                  Text(subtitle,
                      textAlign: TextAlign.center,
                      style: text.bodyMedium?.copyWith(color: p.muted)),
                  const SizedBox(height: 32),
                  ...children,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Inline error under the fields, in the danger colour only.
class AuthError extends StatelessWidget {
  const AuthError(this.message, {super.key});
  final String message;
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Padding(
          padding: const EdgeInsets.only(top: 10, left: 4, right: 4),
          child: Text(message,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: context.palette.danger)),
        ),
      );
}

/// Full-width pill primary button with an inline spinner while busy.
class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton(
      {super.key, required this.label, required this.busy, required this.onPressed});
  final String label;
  final bool busy;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 52,
        child: FilledButton(
          onPressed: busy ? null : onPressed,
          child: busy
              ? SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: context.palette.muted))
              : Text(label),
        ),
      );
}

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) return;
    ref.read(authProvider.notifier).loginWithPassword(email, password);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final p = context.palette;
    return AuthScaffold(
      title: 'Outreach Intern',
      subtitle: 'Sign in to your workspace',
      children: [
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Work Email'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(
            labelText: 'Password',
            suffixIcon: IconButton(
              tooltip: _obscurePassword ? 'Show password' : 'Hide password',
              icon: HugeIcon(
                icon: _obscurePassword
                    ? HugeIcons.strokeRoundedViewOffSlash
                    : HugeIcons.strokeRoundedView,
                color: p.muted,
                size: 20,
              ),
              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
          onSubmitted: (_) => _submit(),
        ),
        if (authState.errorMessage != null) AuthError(authState.errorMessage!),
        const SizedBox(height: 20),
        AuthPrimaryButton(
            label: 'Sign In', busy: authState.isLoading, onPressed: _submit),
        const SizedBox(height: 12),
        SizedBox(
          height: 52,
          child: OutlinedButton(
            onPressed: authState.isLoading
                ? null
                : () => ref.read(authProvider.notifier).loginWithGoogle(
                      'mock-google-id-token',
                      _emailController.text.trim(),
                    ),
            child: const Text('Sign in with Google'),
          ),
        ),
        const SizedBox(height: 28),
        Text(
          'Accounts are provisioned by your administrator. Contact them for access.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
