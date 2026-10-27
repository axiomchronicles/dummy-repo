class ChatThread {
  final String id;
  final String title;
  final String? campaignId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int messageCount;

  ChatThread({
    required this.id,
    required this.title,
    this.campaignId,
    required this.createdAt,
    required this.updatedAt,
    this.messageCount = 0,
  });

  factory ChatThread.fromJson(Map<String, dynamic> json) {
    return ChatThread(
      id: json['id'] ?? '',
      title: json['title'] ?? 'New Outreach Task',
      campaignId: json['campaign_id'],
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] ?? '') ?? DateTime.now(),
      messageCount: json['message_count'] ?? 0,
    );
  }
}

class ChatMessage {
  final String id;
  final String threadId;
  final String role; // 'user' | 'assistant' | 'system'
  final String content;
  final List<dynamic> attachments;
  final Map<String, dynamic> metadata;
  final DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.threadId,
    required this.role,
    required this.content,
    required this.attachments,
    required this.metadata,
    required this.createdAt,
  });

  ChatMessage copyWith({
    String? id,
    String? threadId,
    String? role,
    String? content,
    List<dynamic>? attachments,
    Map<String, dynamic>? metadata,
    DateTime? createdAt,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      threadId: threadId ?? this.threadId,
      role: role ?? this.role,
      content: content ?? this.content,
      attachments: attachments ?? this.attachments,
      metadata: metadata ?? this.metadata,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] ?? '',
      threadId: json['thread_id'] ?? json['threadId'] ?? '',
      role: json['role'] ?? 'user',
      content: json['content'] ?? '',
      attachments: json['attachments'] ?? [],
      metadata: json['metadata'] ?? {},
      createdAt: DateTime.tryParse(json['created_at'] ?? json['createdAt'] ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'threadId': threadId,
        'role': role,
        'content': content,
        'attachments': attachments,
        'metadata': metadata,
        'createdAt': createdAt.toIso8601String(),
      };
}

class CampaignDraft {
  final String campaignId;
  final String objective;
  final String mode; // 'simulation' | 'live'
  final int eligibleCount;
  final int excludedCount;
  final String planSnapshotHash;
  final String agentName;
  final String agentLanguage;
  final List<String> steps;
  final List<String> questions;
  final int estimatedCostMinor;

  CampaignDraft({
    required this.campaignId,
    required this.objective,
    required this.mode,
    required this.eligibleCount,
    required this.excludedCount,
    required this.planSnapshotHash,
    required this.agentName,
    required this.agentLanguage,
    required this.steps,
    required this.questions,
    required this.estimatedCostMinor,
  });

  factory CampaignDraft.fromJson(Map<String, dynamic> json) {
    return CampaignDraft(
      campaignId: json['campaignId'] as String? ??
          json['campaign_id'] as String? ??
          '',
      objective: json['objective'] as String? ?? '',
      mode: json['mode'] as String? ?? 'simulation',
      eligibleCount: (json['eligibleCount'] as num?)?.toInt() ??
          (json['eligible_count'] as num?)?.toInt() ??
          0,
      excludedCount: (json['excludedCount'] as num?)?.toInt() ??
          (json['excluded_count'] as num?)?.toInt() ??
          0,
      planSnapshotHash: json['planSnapshotHash'] as String? ??
          json['plan_snapshot_hash'] as String? ??
          '',
      agentName: json['agentName'] as String? ??
          json['agent_name'] as String? ??
          'Outreach Agent',
      agentLanguage: json['agentLanguage'] as String? ??
          json['agent_language'] as String? ??
          'English',
      steps: (json['steps'] as List<dynamic>?)
              ?.map((s) => s is Map
                  ? (s['description'] ?? s['name'] ?? '').toString()
                  : s.toString())
              .toList() ??
          [],
      questions: (json['questions'] as List<dynamic>?)
              ?.map((q) => q.toString())
              .toList() ??
          [],
      estimatedCostMinor: (json['estimatedCostMinor'] as num?)?.toInt() ??
          (json['estimated_cost_minor'] as num?)?.toInt() ??
          0,
    );
  }

  Map<String, dynamic> toJson() => {
        'campaignId': campaignId,
        'objective': objective,
        'mode': mode,
        'eligibleCount': eligibleCount,
        'excludedCount': excludedCount,
        'planSnapshotHash': planSnapshotHash,
        'agentName': agentName,
        'agentLanguage': agentLanguage,
        'steps': steps,
        'questions': questions,
        'estimatedCostMinor': estimatedCostMinor,
      };
}
