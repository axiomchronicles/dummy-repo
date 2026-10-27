import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/storage/token_storage.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/auth/auth_models.dart';
import 'package:mobile/features/auth/auth_provider.dart';
import 'package:mobile/features/settings/settings_pages.dart';
import 'package:mobile/features/settings/settings_providers.dart';
import 'package:mobile/features/settings/settings_screen.dart';

class FakeApi extends ApiClient {
  FakeApi({this.role = 'owner'})
      : super(tokenStorage: TokenStorage(), customBaseUrl: 'http://test');
  final String role;
  final calls = <String>[];
  String wsName = 'Acme';

  Map<String, dynamic> get _settings => {
        'id': 'w1',
        'name': wsName,
        'timezone': 'Asia/Kolkata',
        'role': role,
        'settings': {
          'defaultRegion': 'IN',
          'defaultAgentId': null,
          'callWindowStart': '09:00',
          'callWindowEnd': '18:00',
          'budgetMinor': 500000,
          'estimatedCostPerCallMinor': 250,
          'currency': 'INR',
        },
      };

  @override
  Future<dynamic> get(String path,
      {Map<String, String>? queryParams, bool requiresAuth = true}) async {
    calls.add('GET $path');
    return switch (path) {
      '/api/v1/me' => {
          'userId': 'u1',
          'role': role,
          'email': 'milo@example.com',
          'name': 'Milo Operator',
          'workspaceName': wsName,
        },
      '/api/v1/settings' => _settings,
      '/api/v1/me/sessions' => {
          'items': [
            {'id': 's1', 'createdAt': '2026-10-01T00:00:00Z', 'expiresAt': '2026-11-01T00:00:00Z', 'current': true},
            {'id': 's2', 'createdAt': '2026-10-02T00:00:00Z', 'expiresAt': '2026-11-02T00:00:00Z', 'current': false},
          ]
        },
      '/health/ready' => {'status': 'ready', 'database': true, 'redis': true},
      _ => <String, dynamic>{'items': []},
    };
  }

  @override
  Future<dynamic> patch(String path, {dynamic body, bool requiresAuth = true}) async {
    calls.add('PATCH $path $body');
    if (path == '/api/v1/settings' && body['name'] != null) wsName = body['name'];
    return _settings;
  }

  @override
  Future<dynamic> post(String path,
      {dynamic body, Map<String, String>? headers, bool requiresAuth = true}) async {
    calls.add('POST $path');
    return {'revoked': 1};
  }

  @override
  Future<dynamic> delete(String path, {bool requiresAuth = true}) async {
    calls.add('DELETE $path');
    return null;
  }
}

class _Auth extends StateNotifier<AuthState> implements AuthNotifier {
  _Auth()
      : super(AuthState(
            status: AuthStatus.authenticated,
            user: User(id: 'u1', email: 'milo@example.com', name: 'Milo Operator', role: 'owner', mfaEnabled: true)));
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> pump(WidgetTester tester, FakeApi api, Widget home) async {
  tester.view.physicalSize = const Size(1200, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      authProvider.overrideWith((ref) => _Auth()),
    ],
    child: MaterialApp(theme: AppTheme.darkTheme, home: home),
  ));
  await tester.pumpAndSettle();
}

Finder row(String title) => find.byKey(ValueKey('row-$title'));

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('search filters rows live', (tester) async {
    await pump(tester, FakeApi(), const SettingsScreen());
    expect(row('Time zone'), findsOneWidget);
    expect(row('Audit log'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('settings-search')), 'redis');
    await tester.pump();
    expect(row('Server health'), findsOneWidget);
    expect(row('Time zone'), findsNothing);
    expect(row('Audit log'), findsNothing);
  });

  testWidgets('editing workspace name PATCHes and shows re-read value', (tester) async {
    final api = FakeApi();
    await pump(tester, api, const SettingsScreen());
    await tester.tap(row('Workspace name'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('sheet-field')), 'Globex');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('PATCH /api/v1/settings {name: Globex}'));
    expect(api.calls.where((c) => c == 'GET /api/v1/settings').length, greaterThan(1));
    expect(find.text('Globex'), findsOneWidget);
  });

  testWidgets('viewer sees workspace settings read-only', (tester) async {
    final api = FakeApi(role: 'viewer');
    await pump(tester, api, const SettingsScreen());
    expect(find.text('Only owners and operators can change workspace settings.'), findsOneWidget);
    await tester.tap(row('Workspace name'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sheet-field')), findsNothing);
    expect(api.calls.any((c) => c.startsWith('PATCH')), isFalse);
  });

  testWidgets('sign out other devices confirms then calls endpoint', (tester) async {
    final api = FakeApi();
    await pump(tester, api, const SessionsPage());
    expect(find.text('This device'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('revoke-others')));
    await tester.pumpAndSettle();
    expect(api.calls, isNot(contains('POST /api/v1/me/sessions/revoke-others')));
    await tester.tap(find.text('Sign out others'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('POST /api/v1/me/sessions/revoke-others'));
    expect(find.text('Signed out 1 other session'), findsOneWidget);
  });

  testWidgets('theme choice persists to storage', (tester) async {
    await pump(tester, FakeApi(), const SettingsScreen());
    await tester.tap(row('Theme'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Light'));
    await tester.pumpAndSettle();
    expect(await const FlutterSecureStorage().read(key: kThemeModeKey), 'light');
    expect(find.descendant(of: row('Theme'), matching: find.text('Light')), findsOneWidget);
  });

  testWidgets('accent choice persists via accentProvider and recolours theme', (tester) async {
    tester.view.physicalSize = const Size(1200, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    // Mirrors main.dart: the theme is rebuilt from accentProvider.
    await tester.pumpWidget(ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(FakeApi()),
        authProvider.overrideWith((ref) => _Auth()),
      ],
      child: Consumer(
        builder: (context, ref, _) => MaterialApp(
          theme: AppTheme.build(Brightness.dark, ref.watch(accentProvider)),
          home: const SettingsScreen(),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    final ctx = tester.element(find.byType(SettingsScreen));
    expect(Theme.of(ctx).colorScheme.primary, AppAccent.blue.dark);

    await tester.tap(row('Accent colour'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('accent-preview')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('accent-green')));
    await tester.pumpAndSettle();

    expect(await const FlutterSecureStorage().read(key: kAccentKey), 'green');
    final container = ProviderScope.containerOf(ctx);
    expect(container.read(accentProvider), AppAccent.green);
    expect(Theme.of(tester.element(find.byType(SettingsScreen))).colorScheme.primary,
        AppAccent.green.dark);
    expect(Theme.of(tester.element(find.byType(SettingsScreen))).extension<AppPalette>()!.accent,
        AppAccent.green.dark);

    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.descendant(of: row('Accent colour'), matching: find.text('Green')), findsOneWidget);
  });
}
