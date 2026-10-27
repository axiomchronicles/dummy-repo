import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/token_storage.dart';
import 'auth_models.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(tokenStorageProvider);
  return ApiClient(tokenStorage: storage);
});

enum AuthStatus { initial, unauthenticated, mfaPending, authenticated }

class AuthState {
  final AuthStatus status;
  final User? user;
  final MfaChallenge? mfaChallenge;
  final String? errorMessage;
  final bool isLoading;

  AuthState({
    required this.status,
    this.user,
    this.mfaChallenge,
    this.errorMessage,
    this.isLoading = false,
  });

  factory AuthState.initial() => AuthState(status: AuthStatus.initial);

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    MfaChallenge? mfaChallenge,
    String? errorMessage,
    bool? isLoading,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      mfaChallenge: mfaChallenge ?? this.mfaChallenge,
      errorMessage: errorMessage,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient apiClient;
  final TokenStorage tokenStorage;

  AuthNotifier({required this.apiClient, required this.tokenStorage}) : super(AuthState.initial()) {
    checkSession();
  }

  Future<void> checkSession() async {
    state = state.copyWith(isLoading: true);
    try {
      final token = await tokenStorage.getAccessToken();
      if (token == null) {
        state = state.copyWith(status: AuthStatus.unauthenticated, isLoading: false);
        return;
      }

      final res = await apiClient.get('/api/v1/auth/me');
      if (res != null && res['user'] != null) {
        final user = User.fromJson(res['user']);
        state = state.copyWith(status: AuthStatus.authenticated, user: user, isLoading: false);
      } else {
        await tokenStorage.clear();
        state = state.copyWith(status: AuthStatus.unauthenticated, isLoading: false);
      }
    } catch (_) {
      await tokenStorage.clear();
      state = state.copyWith(status: AuthStatus.unauthenticated, isLoading: false);
    }
  }

  Future<void> loginWithPassword(String email, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final res = await apiClient.post(
        '/api/v1/auth/login',
        body: {'email': email.trim().toLowerCase(), 'password': password},
        requiresAuth: false,
      );

      final challenge = MfaChallenge.fromJson(res);
      state = state.copyWith(
        status: AuthStatus.mfaPending,
        mfaChallenge: challenge,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e is ApiException ? e.message : 'Login failed. Check your credentials.',
      );
    }
  }

  Future<void> loginWithGoogle(String googleIdToken, String email) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final res = await apiClient.post(
        '/api/v1/auth/login',
        body: {'email': email.trim().toLowerCase(), 'googleIdToken': googleIdToken},
        requiresAuth: false,
      );

      final challenge = MfaChallenge.fromJson(res);
      state = state.copyWith(
        status: AuthStatus.mfaPending,
        mfaChallenge: challenge,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e is ApiException ? e.message : 'Google sign-in failed.',
      );
    }
  }

  Future<void> verifyMfa(String code, {bool isRecoveryCode = false}) async {
    if (state.mfaChallenge == null) return;
    state = state.copyWith(isLoading: true, errorMessage: null);

    try {
      final res = await apiClient.post(
        '/api/v1/auth/mfa/verify',
        body: {
          'mfaToken': state.mfaChallenge!.mfaToken,
          'code': code.trim(),
          'isRecoveryCode': isRecoveryCode,
        },
        requiresAuth: false,
      );

      final session = AuthSession.fromJson(res);
      await tokenStorage.saveTokens(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        email: session.user.email,
      );

      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: session.user,
        mfaChallenge: null,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e is ApiException ? e.message : 'Invalid verification code.',
      );
    }
  }

  Future<void> logout() async {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch (_) {}
    await tokenStorage.clear();
    state = AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final storage = ref.watch(tokenStorageProvider);
  return AuthNotifier(apiClient: apiClient, tokenStorage: storage);
});
