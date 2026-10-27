import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/storage/token_storage.dart';
import 'package:mobile/features/agents/agents_models.dart';
import 'package:mobile/features/agents/agents_screen.dart';
import 'package:mobile/features/agents/voice_picker_screen.dart';
import 'package:mobile/features/auth/auth_provider.dart';

Map<String, dynamic> agentJson({Map<String, dynamic>? voice, int version = 1}) => {
  'id': 'a1',
  'name': 'Appointment Coordinator',
  'description': '',
  'currentVersion': version,
  'prompt': 'Confirm the appointment.',
  'questions': ['Can you attend?'],
  'language': 'English',
  'voice': voice,
  'voiceStatus': voice == null ? 'not_configured' : 'configured',
};

class FakeApi extends ApiClient {
  FakeApi({this.previewAvailable = true})
    : super(tokenStorage: TokenStorage(), customBaseUrl: 'http://t');
  final bool previewAvailable;
  final gets = <String>[];
  final patches = <(String, dynamic)>[];
  Map<String, dynamic>? savedVoice;

  @override
  Future<dynamic> get(String path, {Map<String, String>? queryParams, bool requiresAuth = true}) async {
    gets.add(path);
    return switch (path) {
      '/api/v1/agents/provider-configuration' => {
        'synchronized': false,
        'appId': null,
        'appVersion': null,
        'callerIdMasked': '+1 ••• ••• 0199',
        'liveEnabled': false,
        'blockers': ['LIVE_CALLS_ENABLED', 'SARVAM_APP_ID', 'AGENT_DEPLOYMENT_NOT_SYNCHRONIZED'],
        'bindings': [],
        'documentation': 'https://docs.sarvam.ai/voice-agents/mcp',
        'dashboard': 'https://indus.sarvam.ai/samvaad',
      },
      '/api/v1/agents' => {'items': [agentJson()]},
      '/api/v1/agents/voices' => {
        'model': 'bulbul:v4-flash',
        'models': [
          {'id': 'bulbul:v4-flash', 'label': 'Bulbul V4', 'selectable': true, 'endOfLife': null},
          {'id': 'bulbul:v3', 'label': 'Bulbul V3', 'selectable': false, 'endOfLife': '2026-11-10'},
        ],
        'items': [
          {'id': 'aditi_en_stories', 'name': 'Aditi', 'style': 'stories', 'languageTag': 'en', 'languages': ['en-IN']},
          {'id': 'aarti_hi_customer', 'name': 'Aarti', 'style': 'customer', 'languageTag': 'hi', 'languages': ['hi-IN']},
        ],
        'controls': {
          'pace': {'min': 0.5, 'max': 2, 'default': 1},
          'volume': {'min': 0.7, 'max': 2, 'default': 1},
        },
        'preview': {
          'available': previewAvailable,
          'blocker': previewAvailable ? null : 'SARVAM_MODEL_API_KEY',
          'maxTextChars': 200,
          'limitPerMinute': 10,
        },
      },
      '/api/v1/agents/a1' => agentJson(voice: savedVoice, version: savedVoice == null ? 1 : 2),
      _ => throw ApiException(code: 'NOT_FOUND', message: path, statusCode: 404),
    };
  }

  @override
  Future<dynamic> patch(String path, {dynamic body, bool requiresAuth = true}) async {
    patches.add((path, body));
    savedVoice = Map<String, dynamic>.from(body);
    return agentJson(voice: savedVoice, version: 2);
  }
}

Future<FakeApi> pump(WidgetTester tester, Widget home, FakeApi api) async {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [apiClientProvider.overrideWithValue(api)],
    child: MaterialApp(theme: ThemeData.dark(), home: home),
  ));
  await tester.pumpAndSettle();
  return api;
}

final agent = Agent.fromJson(agentJson());

void main() {
  testWidgets('readiness blockers render as key chips with caller ID', (tester) async {
    await pump(tester, const AgentsVoicesScreen(), FakeApi());
    expect(find.text('Blocked'), findsOneWidget);
    for (final k in ['LIVE_CALLS_ENABLED', 'SARVAM_APP_ID', 'AGENT_DEPLOYMENT_NOT_SYNCHRONIZED']) {
      expect(find.byKey(ValueKey('blocker-$k')), findsOneWidget);
    }
    expect(find.text('+1 ••• ••• 0199'), findsOneWidget);
    expect(find.text('Appointment Coordinator'), findsOneWidget);
  });

  testWidgets('voice list filters by language chip', (tester) async {
    await pump(tester, VoicePickerScreen(agent: agent), FakeApi());
    expect(find.text('Not selectable · end of life 2026-11-10'), findsOneWidget);
    expect(find.byKey(const ValueKey('voice-aditi_en_stories')), findsOneWidget);
    expect(find.byKey(const ValueKey('voice-aarti_hi_customer')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('lang-hi-IN')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('voice-aditi_en_stories')), findsNothing);
    expect(find.byKey(const ValueKey('voice-aarti_hi_customer')), findsOneWidget);
  });

  testWidgets('preview unavailable shows the server blocker', (tester) async {
    await pump(tester, VoicePickerScreen(agent: agent), FakeApi(previewAvailable: false));
    expect(find.text('Preview unavailable · SARVAM_MODEL_API_KEY missing'), findsOneWidget);
  });

  testWidgets('save sends PATCH with selected speaker then re-reads', (tester) async {
    final api = await pump(tester, VoicePickerScreen(agent: agent), FakeApi());
    final save = find.byKey(const ValueKey('save-voice'));
    expect(tester.widget<FilledButton>(save).onPressed, isNull); // unchanged
    await tester.tap(find.byKey(const ValueKey('voice-aditi_en_stories')));
    await tester.pump();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(api.patches.single.$1, '/api/v1/agents/a1/voice');
    expect(api.patches.single.$2, containsPair('speaker', 'aditi_en_stories'));
    expect(api.patches.single.$2, containsPair('language', 'en-IN'));
    expect(api.gets.last, '/api/v1/agents/a1');
    expect(find.text('Saved aditi_en_stories · version 2'), findsOneWidget);
    expect(tester.widget<FilledButton>(save).onPressed, isNull); // saved state == current
  });
}
