import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/mfa_screen.dart';
import 'features/auth/sign_in_screen.dart';
import 'features/chat/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: OutreachInternApp()));
}

class OutreachInternApp extends ConsumerWidget {
  const OutreachInternApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    return MaterialApp(
      title: 'Outreach Intern',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      home: _resolveHome(authState),
    );
  }

  Widget _resolveHome(AuthState authState) {
    switch (authState.status) {
      case AuthStatus.initial:
        return const Scaffold(
          body: Center(
            child: CircularProgressIndicator(color: AppColors.darkAccent),
          ),
        );
      case AuthStatus.mfaPending:
        return const MfaScreen();
      case AuthStatus.authenticated:
        return const HomeScreen();
      case AuthStatus.unauthenticated:
        return const SignInScreen();
    }
  }
}
