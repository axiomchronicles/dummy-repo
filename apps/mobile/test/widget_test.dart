import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/auth/auth_models.dart';
import 'package:mobile/features/auth/auth_provider.dart';
import 'package:mobile/features/auth/sign_in_screen.dart';
import 'package:mobile/features/chat/chat_composer.dart';
import 'package:mobile/features/chat/home_screen.dart';

void main() {
  testWidgets('Renders SignInScreen with branding and inputs when unauthenticated',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => MockAuthNotifier(AuthState(status: AuthStatus.unauthenticated))),
        ],
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const SignInScreen(),
        ),
      ),
    );

    expect(find.text('Outreach Intern'), findsOneWidget);
    expect(find.text('Work Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
    expect(find.text('Sign in with Google'), findsOneWidget);
  });

  testWidgets('Renders HomeScreen with prompt composer when authenticated',
      (WidgetTester tester) async {
    final user = User(
      id: '00000000-0000-0000-0000-000000000001',
      email: 'milo@outreachintern.local',
      name: 'Milo Operator',
      role: 'operator',
      mfaEnabled: true,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => MockAuthNotifier(
                AuthState(status: AuthStatus.authenticated, user: user),
              )),
        ],
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const HomeScreen(),
        ),
      ),
    );

    // Verify user greeting and composer
    expect(find.textContaining('Milo'), findsOneWidget);
    expect(find.byType(ChatComposer), findsOneWidget);
  });
}

class MockAuthNotifier extends StateNotifier<AuthState> implements AuthNotifier {
  MockAuthNotifier(super.state);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
