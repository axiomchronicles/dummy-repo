class User {
  final String id;
  final String email;
  final String name;
  final String role;
  final bool mfaEnabled;

  User({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.mfaEnabled,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? '',
      email: json['email'] ?? '',
      name: json['name'] ?? '',
      role: json['role'] ?? 'operator',
      mfaEnabled: json['mfaEnabled'] ?? false,
    );
  }
}

class MfaChallenge {
  final bool mfaRequired;
  final String mfaToken;
  final bool enrolled;

  MfaChallenge({
    required this.mfaRequired,
    required this.mfaToken,
    required this.enrolled,
  });

  factory MfaChallenge.fromJson(Map<String, dynamic> json) {
    return MfaChallenge(
      mfaRequired: json['mfaRequired'] ?? false,
      mfaToken: json['mfaToken'] ?? '',
      enrolled: json['enrolled'] ?? false,
    );
  }
}

class AuthSession {
  final String accessToken;
  final String refreshToken;
  final User user;
  final String workspaceId;
  final String workspaceName;

  AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.workspaceId,
    required this.workspaceName,
  });

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['accessToken'] ?? '',
      refreshToken: json['refreshToken'] ?? '',
      user: User.fromJson(json['user'] ?? {}),
      workspaceId: json['workspace']?['id'] ?? '',
      workspaceName: json['workspace']?['name'] ?? '',
    );
  }
}
