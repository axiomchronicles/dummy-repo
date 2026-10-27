import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

/// Keep in sync with `version:` in pubspec.yaml.
const kAppVersion = '1.0.0+1';

const kThemeModeKey = 'pref_theme_mode';
const kHapticsKey = 'pref_haptics';

final preferencesStorageProvider =
    Provider<FlutterSecureStorage>((ref) => const FlutterSecureStorage());

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier(this._storage) : super(ThemeMode.dark) {
    _storage.read(key: kThemeModeKey).then((v) {
      final mode = ThemeMode.values.where((m) => m.name == v);
      if (mounted && mode.isNotEmpty) state = mode.first;
    }).catchError((_) {});
  }
  final FlutterSecureStorage _storage;

  Future<void> set(ThemeMode mode) async {
    await _storage.write(key: kThemeModeKey, value: mode.name);
    state = mode;
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>(
  (ref) => ThemeModeNotifier(ref.watch(preferencesStorageProvider)),
);

const kAccentKey = 'pref_accent';

class AccentNotifier extends StateNotifier<AppAccent> {
  AccentNotifier(this._storage) : super(AppAccent.blue) {
    _storage.read(key: kAccentKey).then((v) {
      final accent = AppAccent.values.where((a) => a.name == v);
      if (mounted && accent.isNotEmpty) state = accent.first;
    }).catchError((_) {});
  }
  final FlutterSecureStorage _storage;

  Future<void> set(AppAccent accent) async {
    await _storage.write(key: kAccentKey, value: accent.name);
    state = accent;
  }
}

final accentProvider = StateNotifierProvider<AccentNotifier, AppAccent>(
  (ref) => AccentNotifier(ref.watch(preferencesStorageProvider)),
);

class HapticsNotifier extends StateNotifier<bool> {
  HapticsNotifier(this._storage) : super(true) {
    _storage.read(key: kHapticsKey).then((v) {
      if (mounted && v != null) state = v == 'true';
    }).catchError((_) {});
  }
  final FlutterSecureStorage _storage;

  Future<void> set(bool enabled) async {
    await _storage.write(key: kHapticsKey, value: '$enabled');
    state = enabled;
  }

  void tick() {
    if (state) HapticFeedback.selectionClick();
  }
}

final hapticsProvider = StateNotifierProvider<HapticsNotifier, bool>(
  (ref) => HapticsNotifier(ref.watch(preferencesStorageProvider)),
);

Map<String, dynamic> asMap(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Map<String, dynamic>> asList(dynamic v) =>
    v is List ? v.map(asMap).toList() : <Map<String, dynamic>>[];

AutoDisposeFutureProvider<Map<String, dynamic>> _getMap(String path,
        {Map<String, String>? query, bool auth = true}) =>
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async => asMap(
        await ref
            .watch(apiClientProvider)
            .get(path, queryParams: query, requiresAuth: auth)));

final meProvider = _getMap('/api/v1/me');
final workspaceSettingsProvider = _getMap('/api/v1/settings');
final sessionsProvider = _getMap('/api/v1/me/sessions');
final integrationsProvider = _getMap('/api/v1/integrations');
final diagnosticsProvider =
    _getMap('/api/v1/agents/configuration-diagnostics');
final agentsListProvider = _getMap('/api/v1/agents', query: {'limit': '100'});
final healthProvider = _getMap('/health/ready', auth: false);

String errorText(Object e) => e is ApiException
    ? '${e.code}: ${e.message}'
    : 'NETWORK_ERROR: ${e.toString()}';

bool isNotFound(Object e) => e is ApiException && e.statusCode == 404;
