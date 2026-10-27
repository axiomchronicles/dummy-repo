import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../auth/auth_provider.dart';
import '../../core/network/api_client.dart';
import 'chat_models.dart';

class ChatState {
  final List<ChatThread> threads;
  final ChatThread? activeThread;
  final List<ChatMessage> messages;
  final CampaignDraft? activeDraft;
  final bool isLoading;
  final bool isStreaming;
  final String? errorMessage;
  final String selectedAgent;
  final List<Map<String, dynamic>> availableAgents;

  ChatState({
    required this.threads,
    this.activeThread,
    required this.messages,
    this.activeDraft,
    this.isLoading = false,
    this.isStreaming = false,
    this.errorMessage,
    this.selectedAgent = 'Appointment Coordinator',
    this.availableAgents = const [],
  });

  factory ChatState.initial() => ChatState(threads: [], messages: []);

  ChatState copyWith({
    List<ChatThread>? threads,
    ChatThread? activeThread,
    List<ChatMessage>? messages,
    CampaignDraft? activeDraft,
    bool? isLoading,
    bool? isStreaming,
    String? errorMessage,
    String? selectedAgent,
    List<Map<String, dynamic>>? availableAgents,
  }) {
    return ChatState(
      threads: threads ?? this.threads,
      activeThread: activeThread ?? this.activeThread,
      messages: messages ?? this.messages,
      activeDraft: activeDraft,
      isLoading: isLoading ?? this.isLoading,
      isStreaming: isStreaming ?? this.isStreaming,
      errorMessage: errorMessage,
      selectedAgent: selectedAgent ?? this.selectedAgent,
      availableAgents: availableAgents ?? this.availableAgents,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final ApiClient apiClient;
  http.Client? _streamClient;

  ChatNotifier({required this.apiClient}) : super(ChatState.initial()) {
    loadThreads();
    loadAgents();
  }

  Future<void> loadAgents() async {
    try {
      final res = await apiClient.get('/api/v1/agents');
      if (res != null && res['items'] != null) {
        final list = (res['items'] as List).cast<Map<String, dynamic>>();
        state = state.copyWith(
          availableAgents: list,
          selectedAgent: list.isNotEmpty
              ? (list.first['name'] as String? ?? state.selectedAgent)
              : state.selectedAgent,
        );
      }
    } catch (_) {}
  }

  Future<void> loadThreads() async {
    try {
      final res = await apiClient.get('/api/v1/chat/threads');
      if (res != null && res['items'] != null) {
        final list = (res['items'] as List).map((i) => ChatThread.fromJson(i)).toList();
        state = state.copyWith(threads: list);
        if (list.isNotEmpty && state.activeThread == null) {
          selectThread(list.first);
        }
      }
    } catch (_) {}
  }

  Future<void> createNewThread() async {
    stopStreaming();
    state = state.copyWith(isLoading: true, activeDraft: null);
    try {
      final res = await apiClient.post('/api/v1/chat/threads', body: {'title': 'New Outreach Task'});
      if (res != null) {
        final thread = ChatThread.fromJson(res);
        state = state.copyWith(
          threads: [thread, ...state.threads],
          activeThread: thread,
          messages: [],
          activeDraft: null,
          isLoading: false,
        );
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: 'Failed to create thread.');
    }
  }

  Future<void> selectThread(ChatThread thread) async {
    stopStreaming();
    state = state.copyWith(activeThread: thread, messages: [], activeDraft: null, isLoading: true);
    try {
      final res = await apiClient.get('/api/v1/chat/threads/${thread.id}/messages');
      if (res != null) {
        final list = (res as List).map((i) => ChatMessage.fromJson(i)).toList();
        CampaignDraft? latestDraft;
        if (list.isNotEmpty &&
            list.last.metadata['draft'] != null &&
            list.last.metadata['draft'] is Map<String, dynamic>) {
          latestDraft = CampaignDraft.fromJson(list.last.metadata['draft'] as Map<String, dynamic>);
        }
        state = state.copyWith(messages: list, activeDraft: latestDraft, isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void selectAgent(String agentName) {
    state = state.copyWith(selectedAgent: agentName);
  }

  void stopStreaming() {
    if (_streamClient != null) {
      _streamClient?.close();
      _streamClient = null;
    }
    if (state.isStreaming) {
      state = state.copyWith(isStreaming: false);
    }
  }

  Future<void> sendMessage(
    String text, {
    List<String>? attachmentNames,
    List<String>? attachmentIds,
  }) async {
    if (state.activeThread == null) {
      await createNewThread();
    }
    final threadId = state.activeThread?.id;
    if (threadId == null) return;

    stopStreaming();

    final userTempId = 'local_user_${DateTime.now().millisecondsSinceEpoch}';
    final asstTempId = 'local_asst_${DateTime.now().millisecondsSinceEpoch}';

    final tempUserMessage = ChatMessage(
      id: userTempId,
      threadId: threadId,
      role: 'user',
      content: text,
      attachments: attachmentNames ?? [],
      metadata: {},
      createdAt: DateTime.now(),
    );

    final tempAssistantMessage = ChatMessage(
      id: asstTempId,
      threadId: threadId,
      role: 'assistant',
      content: '',
      attachments: [],
      metadata: {},
      createdAt: DateTime.now(),
    );

    // Explicitly reset activeDraft to null on every new prompt
    state = state.copyWith(
      messages: [...state.messages, tempUserMessage, tempAssistantMessage],
      activeDraft: null,
      isStreaming: true,
      isLoading: false,
      errorMessage: null,
    );

    _streamClient = http.Client();

    try {
      final streamedResponse = await apiClient.streamPost(
        '/api/v1/chat/threads/$threadId/stream',
        body: {
          'content': text,
          'attachmentIds': attachmentIds ?? [],
        },
        client: _streamClient,
      );

      String accumulatedContent = '';
      String currentEvent = 'message';
      CampaignDraft? capturedDraft;

      await for (final line in streamedResponse.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())) {
        final trimmed = line.trim();
        if (trimmed.isEmpty) {
          currentEvent = 'message';
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.substring(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          final dataStr = trimmed.substring(5).trim();
          if (dataStr.isEmpty || dataStr == '[DONE]') continue;

          try {
            final dataJson = jsonDecode(dataStr);

            if (currentEvent == 'user_message') {
              if (dataJson is Map<String, dynamic> && dataJson['id'] != null) {
                final realId = dataJson['id'] as String;
                final updated = List<ChatMessage>.from(state.messages);
                final idx = updated.indexWhere((m) => m.id == userTempId);
                if (idx != -1) {
                  updated[idx] = updated[idx].copyWith(id: realId);
                  state = state.copyWith(messages: updated);
                }
              }
            } else if (currentEvent == 'delta' ||
                (currentEvent == 'message' &&
                    dataJson is Map &&
                    dataJson.containsKey('text'))) {
              final chunkText =
                  (dataJson is Map ? dataJson['text'] : null) ?? '';
              accumulatedContent += chunkText;

              final updated = List<ChatMessage>.from(state.messages);
              if (updated.isNotEmpty && updated.last.role == 'assistant') {
                updated[updated.length - 1] =
                    updated.last.copyWith(content: accumulatedContent);
                state = state.copyWith(messages: updated);
              }
            } else if (currentEvent == 'draft') {
              if (dataJson is Map<String, dynamic>) {
                capturedDraft = CampaignDraft.fromJson(dataJson);
                state = state.copyWith(activeDraft: capturedDraft);
              }
            } else if (currentEvent == 'done') {
              if (dataJson is Map<String, dynamic>) {
                if (capturedDraft == null &&
                    dataJson['metadata'] != null &&
                    dataJson['metadata'] is Map &&
                    dataJson['metadata']['draft'] != null) {
                  capturedDraft = CampaignDraft.fromJson(
                      dataJson['metadata']['draft'] as Map<String, dynamic>);
                }
                final finalId = dataJson['id'] as String?;
                final updated = List<ChatMessage>.from(state.messages);
                if (updated.isNotEmpty && updated.last.role == 'assistant') {
                  updated[updated.length - 1] = updated.last.copyWith(
                    id: finalId ?? updated.last.id,
                    content: (dataJson['content'] as String?) ?? accumulatedContent,
                    metadata: capturedDraft != null ? {'draft': capturedDraft.toJson()} : {},
                  );
                  state = state.copyWith(messages: updated);
                }
              }
            } else if (currentEvent == 'error') {
              final errMsg = (dataJson is Map ? dataJson['message'] : null) ??
                  'Streaming error occurred.';
              state = state.copyWith(errorMessage: errMsg.toString());
            }
          } catch (_) {
            // Partial JSON chunk
          }
        }
      }

      state = state.copyWith(
        isStreaming: false,
        activeDraft: capturedDraft,
      );
    } catch (streamError) {
      // Fall back gracefully to non-streaming post
      try {
        final postRes = await apiClient.post(
          '/api/v1/chat/threads/$threadId/messages',
          body: {
            'content': text,
            'attachmentIds': attachmentIds ?? [],
          },
        );

        final res =
            await apiClient.get('/api/v1/chat/threads/$threadId/messages');
        final list = (res as List).map((i) => ChatMessage.fromJson(i)).toList();

        CampaignDraft? draft;
        final rawDraft =
            postRes != null ? (postRes['draft'] ?? postRes['campaignDraft']) : null;
        if (rawDraft != null && rawDraft is Map<String, dynamic>) {
          draft = CampaignDraft.fromJson(rawDraft);
        } else if (list.isNotEmpty &&
            list.last.metadata['draft'] != null &&
            list.last.metadata['draft'] is Map<String, dynamic>) {
          draft = CampaignDraft.fromJson(list.last.metadata['draft'] as Map<String, dynamic>);
        }

        state = state.copyWith(
          messages: list,
          activeDraft: draft,
          isStreaming: false,
          isLoading: false,
        );
      } catch (e) {
        state = state.copyWith(
          isStreaming: false,
          isLoading: false,
          errorMessage: 'Failed to process prompt: $e',
        );
      }
    } finally {
      _streamClient = null;
    }
  }

  void clearActiveDraft() {
    state = state.copyWith(activeDraft: null);
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ChatNotifier(apiClient: apiClient);
});
