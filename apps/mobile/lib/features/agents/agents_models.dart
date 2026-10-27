// Typed views over /api/v1/agents responses (shapes from apps/api/src/agents.ts).

List<String> _strings(dynamic v) =>
    v is List ? v.map((e) => '$e').toList() : const [];
double _num(dynamic v, double fallback) => v is num ? v.toDouble() : fallback;
Map<String, dynamic> _map(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : const {};

class VoiceSelection {
  final String model, speaker, language;
  final double pace, volume;
  const VoiceSelection({
    required this.model,
    required this.speaker,
    required this.language,
    required this.pace,
    required this.volume,
  });
  factory VoiceSelection.fromJson(Map<String, dynamic> j) => VoiceSelection(
    model: '${j['model']}',
    speaker: '${j['speaker']}',
    language: '${j['language']}',
    pace: _num(j['pace'], 1),
    volume: _num(j['volume'], 1),
  );
  Map<String, dynamic> toJson() => {
    'model': model,
    'speaker': speaker,
    'language': language,
    'pace': pace,
    'volume': volume,
  };
  @override
  bool operator ==(Object other) =>
      other is VoiceSelection &&
      other.model == model &&
      other.speaker == speaker &&
      other.language == language &&
      other.pace == pace &&
      other.volume == volume;
  @override
  int get hashCode => Object.hash(model, speaker, language, pace, volume);
}

class Agent {
  final String id, name, description, prompt, language, voiceStatus;
  final int currentVersion;
  final List<String> questions;
  final VoiceSelection? voice;
  const Agent({
    required this.id,
    required this.name,
    required this.description,
    required this.prompt,
    required this.language,
    required this.voiceStatus,
    required this.currentVersion,
    required this.questions,
    required this.voice,
  });
  factory Agent.fromJson(Map<String, dynamic> j) => Agent(
    id: '${j['id']}',
    name: '${j['name'] ?? ''}',
    description: '${j['description'] ?? ''}',
    prompt: '${j['prompt'] ?? ''}',
    language: '${j['language'] ?? ''}',
    voiceStatus: '${j['voiceStatus'] ?? 'not_configured'}',
    currentVersion: (j['currentVersion'] as num?)?.toInt() ?? 1,
    questions: _strings(j['questions']),
    voice: j['voice'] is Map ? VoiceSelection.fromJson(_map(j['voice'])) : null,
  );
}

class AgentVersion {
  final int version;
  final String language, createdAt;
  final int questionCount;
  final VoiceSelection? voice;
  const AgentVersion(
    this.version,
    this.language,
    this.createdAt,
    this.questionCount,
    this.voice,
  );
  factory AgentVersion.fromJson(Map<String, dynamic> j) => AgentVersion(
    (j['version'] as num?)?.toInt() ?? 0,
    '${j['language'] ?? ''}',
    '${j['createdAt'] ?? ''}',
    _strings(j['questions']).length,
    j['voice'] is Map ? VoiceSelection.fromJson(_map(j['voice'])) : null,
  );
}

class ProviderConfiguration {
  final bool synchronized, liveEnabled;
  final String? appId, appVersion, callerIdMasked;
  final List<String> blockers;
  final int bindingCount;
  final String? documentation, dashboard, recommendedModel, catalogStatus;
  const ProviderConfiguration({
    required this.synchronized,
    required this.liveEnabled,
    required this.appId,
    required this.appVersion,
    required this.callerIdMasked,
    required this.blockers,
    required this.bindingCount,
    required this.documentation,
    required this.dashboard,
    required this.recommendedModel,
    required this.catalogStatus,
  });
  factory ProviderConfiguration.fromJson(Map<String, dynamic> j) =>
      ProviderConfiguration(
        synchronized: j['synchronized'] == true,
        liveEnabled: j['liveEnabled'] == true,
        appId: j['appId'] as String?,
        appVersion: j['appVersion'] as String?,
        callerIdMasked: j['callerIdMasked'] as String?,
        blockers: _strings(j['blockers']),
        bindingCount: (j['bindings'] as List?)?.length ?? 0,
        documentation: j['documentation'] as String?,
        dashboard: j['dashboard'] as String?,
        recommendedModel: j['recommendedModel'] as String?,
        catalogStatus: _map(j['voiceCatalog'])['status'] as String?,
      );
}

class Diagnostic {
  final String key, status;
  final List<String> requiredFor;
  final String? issue;
  const Diagnostic(this.key, this.status, this.requiredFor, this.issue);
  factory Diagnostic.fromJson(Map<String, dynamic> j) => Diagnostic(
    '${j['key']}',
    '${j['status']}',
    _strings(j['requiredFor']),
    j['issue'] as String?,
  );
}

class Diagnostics {
  final List<Diagnostic> items;
  final Map<String, bool> ready;
  final bool liveCallsEnabled;
  final String? callerIdMasked;
  final int destinationCount;
  const Diagnostics(
    this.items,
    this.ready,
    this.liveCallsEnabled,
    this.callerIdMasked,
    this.destinationCount,
  );
  factory Diagnostics.fromJson(Map<String, dynamic> j) => Diagnostics(
    ((j['items'] as List?) ?? const [])
        .map((e) => Diagnostic.fromJson(_map(e)))
        .toList(),
    _map(j['ready']).map((k, v) => MapEntry(k, v == true)),
    j['liveCallsEnabled'] == true,
    _map(j['callerId'])['masked'] as String?,
    (_map(j['destinations'])['count'] as num?)?.toInt() ?? 0,
  );
}
