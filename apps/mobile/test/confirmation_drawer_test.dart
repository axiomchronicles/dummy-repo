import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/storage/token_storage.dart';
import 'package:mobile/features/auth/auth_provider.dart';
import 'package:mobile/features/chat/chat_models.dart';
import 'package:mobile/features/confirmation/confirmation_drawer.dart';

class FakeApi extends ApiClient {
  FakeApi() : super(tokenStorage: TokenStorage(), customBaseUrl: 'http://t');
  final posts = <(String, Map<String, String>?)>[];
  final launch = Completer<dynamic>();
  String detailStatus = 'running';

  @override
  Future<dynamic> post(
    String path, {
    dynamic body,
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) {
    posts.add((path, headers));
    return launch.future;
  }

  @override
  Future<dynamic> get(
    String path, {
    Map<String, String>? queryParams,
    bool requiresAuth = true,
  }) async => {'status': detailStatus};
}

CampaignDraft draft(String mode, {List<String> blockers = const []}) =>
    CampaignDraft.fromJson({
      'campaignId': 'c1',
      'objective': 'Confirm interview attendance',
      'mode': mode,
      'eligibleCount': blockers.isEmpty ? 1 : 0,
      'excludedCount': blockers.isEmpty ? 0 : 1,
      'planSnapshotHash': 'hash-0123456789abcdef',
      'agentName': 'Appointment Coordinator',
      'agentLanguage': 'en-IN',
      'target': {
        'name': 'Asha Rao',
        'destinationMasked': '+91 ••••• ••210',
        'callerIdMasked': '+1 ••• ••• 0199',
        'timezone': 'Asia/Kolkata',
        'blockers': blockers,
      },
      'steps': [],
      'questions': [],
      'estimatedCostMinor': 0,
    });

Future<FakeApi> pumpDrawer(WidgetTester tester, CampaignDraft d) async {
  final api = FakeApi();
  tester.view.physicalSize = const Size(320, 900); // narrow phone
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(api)],
      child: MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.bottomCenter,
            child: ConfirmationDrawer(
              draft: d,
              onConfirmed: () {},
              onDismissed: () {},
              pollInterval: const Duration(milliseconds: 10),
            ),
          ),
        ),
      ),
    ),
  );
  return api;
}

FilledButton cta(WidgetTester tester) =>
    tester.widget<FilledButton>(find.byType(FilledButton));

void main() {
  testWidgets('renders one resolved target and the simulation label', (
    tester,
  ) async {
    await pumpDrawer(tester, draft('simulation'));
    expect(find.text('Asha Rao'), findsOneWidget);
    expect(find.text('+91 ••••• ••210'), findsOneWidget);
    expect(find.text('Outbound caller ID'), findsOneWidget);
    expect(find.text('+1 ••• ••• 0199'), findsOneWidget);
    expect(find.text('1 eligible · 0 excluded'), findsOneWidget);
    expect(find.text('Run simulation'), findsOneWidget);
    expect(find.textContaining('Simulation Test'), findsNothing);
    // One line at 320px: FittedBox scales instead of wrapping.
    final label = tester.getSize(find.text('Run simulation'));
    expect(label.height, lessThan(30));
    expect(tester.takeException(), isNull);
  });

  testWidgets('simulate: correct endpoint + key, disabled while pending, '
      'then shows operation and backend status', (tester) async {
    final api = await pumpDrawer(tester, draft('simulation'));
    await tester.tap(find.text('Run simulation'));
    await tester.pump();
    expect(api.posts.single.$1, '/api/v1/campaigns/c1/simulate');
    expect(api.posts.single.$2?['Idempotency-Key'], 'call-c1-simulation');
    expect(find.text('Submitting…'), findsOneWidget);
    expect(cta(tester).onPressed, isNull);
    await tester.tap(find.byType(FilledButton));
    expect(api.posts, hasLength(1));

    api.launch.complete({'operationId': 'op-42', 'status': 'running'});
    await tester.pump();
    expect(find.textContaining('Status: running · Operation op-42'), findsOne);
    api.detailStatus = 'completed';
    await tester.pump(const Duration(milliseconds: 20));
    await tester.pump();
    expect(find.textContaining('Status: completed'), findsOneWidget);
    expect(find.text('Open monitor'), findsOneWidget);
  });

  testWidgets('real call requires a second confirmation naming the recipient', (
    tester,
  ) async {
    final api = await pumpDrawer(tester, draft('live'));
    expect(find.text('Place real call'), findsOneWidget);
    await tester.tap(find.text('Place real call'));
    await tester.pumpAndSettle();
    expect(find.text('Call Asha Rao'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.posts, isEmpty);

    await tester.tap(find.text('Place real call'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Call Asha Rao'));
    await tester.pump();
    expect(api.posts.single.$1, '/api/v1/campaigns/c1/launch');
    expect(api.posts.single.$2?['Idempotency-Key'], 'call-c1-live');
  });

  testWidgets('inline backend refusal and blocked plans', (tester) async {
    final api = await pumpDrawer(tester, draft('simulation'));
    await tester.tap(find.text('Run simulation'));
    await tester.pump();
    api.launch.completeError(
      ApiException(
        code: 'PLAN_STALE',
        message: 'Review again',
        statusCode: 409,
      ),
    );
    await tester.pump();
    expect(find.text('PLAN_STALE: Review again'), findsOneWidget);
    expect(find.textContaining('Status: blocked'), findsOneWidget);
    expect(cta(tester).onPressed, isNotNull);
  });

  testWidgets('blockers disable the CTA and are listed', (tester) async {
    await pumpDrawer(tester, draft('live', blockers: ['NO_CONSENT']));
    expect(find.text('• NO_CONSENT'), findsOneWidget);
    expect(find.text('0 eligible · 1 excluded'), findsOneWidget);
    expect(cta(tester).onPressed, isNull);
  });
}
