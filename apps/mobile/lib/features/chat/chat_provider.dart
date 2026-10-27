import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../auth/auth_provider.dart';
import '../../core/network/api_client.dart';
import '../../core/network/sse.dart';
import 'chat_models.dart';

const _unchanged = Object();

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
    Object? activeThread = _unchanged,
    List<ChatMessage>? messages,
    Object? activeDraft = _unchanged,
    bool? isLoading,
    bool? isStreaming,
    Object? errorMessage = _unchanged,
    String? selectedAgent,
    List<Map<String, dynamic>>? availableAgents,
  }) {
    return ChatState(
      threads: threads ?? this.threads,
      activeThread: identical(activeThread, _unchanged)
          ? this.activeThread
          : activeThread as ChatThread?,
      messages: messages ?? this.messages,
      activeDraft: identical(activeDraft, _unchanged)
          ? this.activeDraft
          : activeDraft as CampaignDraft?,
      isLoading: isLoading ?? this.isLoading,
      isStreaming: isStreaming ?? this.isStreaming,
      // Sentinel: unrelated updates must not erase a surfaced error.
      errorMessage: identical(errorMessage, _unchanged)
          ? this.errorMessage
          : errorMessage as String?,
      selectedAgent: selectedAgent ?? this.selectedAgent,
      availableAgents: availableAgents ?? this.availableAgents,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final ApiClient apiClient;
  http.Client? _streamClient;
  String? _streamingMessageId;

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
        final list = (res['items'] as List)
            .map((i) => ChatThread.fromJson(i))
            .toList();
        state = state.copyWith(threads: list);
        if (list.isNotEmpty && state.activeThread == null) {
          selectThread(list.first);
        }
      }
    } catch (_) {}
  }

  Future<void> createNewThread() async {
    stopStreaming();
    state = state.copyWith(
      isLoading: true,
      activeDraft: null,
      errorMessage: null,
    );
    try {
      final res = await apiClient.post(
        '/api/v1/chat/threads',
        body: {'title': 'New Outreach Task'},
      );
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
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to create thread.',
      );
    }
  }

  Future<void> selectThread(ChatThread thread) async {
    stopStreaming();
    state = state.copyWith(
      activeThread: thread,
      messages: [],
      activeDraft: null,
      isLoading: true,
      errorMessage: null,
    );
    try {
      final res = await apiClient.get(
        '/api/v1/chat/threads/${thread.id}/messages',
      );
      if (res != null) {
        final list = (res as List).map((i) => ChatMessage.fromJson(i)).toList();
        CampaignDraft? latestDraft;
        if (list.isNotEmpty &&
            list.last.metadata['draft'] != null &&
            list.last.metadata['draft'] is Map<String, dynamic>) {
          latestDraft = CampaignDraft.fromJson(
            list.last.metadata['draft'] as Map<String, dynamic>,
          );
        }
        state = state.copyWith(
          messages: list,
          activeDraft: latestDraft,
          isLoading: false,
        );
      }
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void selectAgent(String agentName) {
    state = state.copyWith(selectedAgent: agentName);
  }

  /// Cancels the in-flight request. Closing the client aborts the HTTP
  /// connection, which the server observes as `close` and aborts generation.
  void stopStreaming() {
    final client = _streamClient;
    _streamClient = null;
    client?.close();
    if (state.isStreaming) {
      final updated = [
        for (final m in state.messages)
          m.id == _streamingMessageId
              ? m.copyWith(metadata: {...m.metadata, 'stopped': true})
              : m,
      ];
      state = state.copyWith(messages: updated, isStreaming: false);
    }
    _streamingMessageId = null;
  }

  void _patchMessage(
    String id,
    ChatMessage Function(ChatMessage message) change,
  ) {
    state = state.copyWith(
      messages: [for (final m in state.messages) m.id == id ? change(m) : m],
    );
  }

  /// Sends one prompt exactly once. Failures are surfaced, never retried:
  /// the server may already have run side-effecting tools for this prompt.
  Future<void> sendMessage(
    String text, {
    List<String>? attachmentNames,
    List<String>? attachmentIds,
  }) async {
    if (state.isStreaming) return;
    if (state.activeThread == null) {
      await createNewThread();
    }
    final threadId = state.activeThread?.id;
    if (threadId == null) return;

    final stamp = DateTime.now().microsecondsSinceEpoch;
    final userTempId = 'local_user_$stamp';
    var asstId = 'local_asst_$stamp';

    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessage(
          id: userTempId,
          threadId: threadId,
          role: 'user',
          content: text,
          attachments: attachmentNames ?? [],
          metadata: {},
          createdAt: DateTime.now(),
        ),
        ChatMessage(
          id: asstId,
          threadId: threadId,
          role: 'assistant',
          content: '',
          attachments: [],
          metadata: {},
          createdAt: DateTime.now(),
        ),
      ],
      activeDraft: null,
      isStreaming: true,
      isLoading: false,
      errorMessage: null,
    );

    final activeClient = http.Client();
    _streamClient = activeClient;
    _streamingMessageId = asstId;
    bool cancelled() => !identical(_streamClient, activeClient);

    final agentId = state.availableAgents
        .where((a) => a['name'] == state.selectedAgent)
        .map((a) => a['id'])
        .firstOrNull;
    var content = '';
    CampaignDraft? draft;
    var completed = false;
    var tools = <Map<String, dynamic>>[];

    try {
      final response = await apiClient.streamPost(
        '/api/v1/chat/threads/$threadId/stream',
        body: {
          'content': text,
          'agentId': ?agentId,
          'attachmentIds': attachmentIds ?? [],
        },
        client: activeClient,
      );

      await for (final event in decodeSse(response.stream)) {
        if (cancelled()) return;
        Object? data;
        try {
          data = jsonDecode(event.data);
        } on FormatException {
          // Unknown or non-JSON events are tolerated; known ones are checked below.
          data = null;
        }
        final map = data is Map<String, dynamic> ? data : null;
        switch (event.event) {
          case 'user_message':
            final realId = map?['id'];
            if (realId is String) {
              _patchMessage(userTempId, (m) => m.copyWith(id: realId));
            }
          case 'delta':
            final chunk = map?['text'];
            if (chunk is String && chunk.isNotEmpty) {
              content += chunk;
              _patchMessage(asstId, (m) => m.copyWith(content: content));
            }
          case 'tool.started' || 'tool.result':
            final executionId = map?['executionId']?.toString();
            final name = map?['name']?.toString() ?? 'tool';
            final status = event.event == 'tool.started'
                ? 'running'
                : (map?['ok'] == true ? 'completed' : 'failed');
            final error = (map?['error'] as Map?)?['message']?.toString();
            final line = {
              'id': executionId,
              'name': name,
              'status': status,
              'error': ?error,
            };
            final index = tools.indexWhere(
              (t) => executionId != null && t['id'] == executionId,
            );
            tools = [...tools];
            if (index < 0) {
              tools.add(line);
            } else {
              tools[index] = line;
            }
            _patchMessage(
              asstId,
              (m) => m.copyWith(metadata: {...m.metadata, 'tools': tools}),
            );
          case 'draft':
            if (map != null) {
              draft = CampaignDraft.fromJson(map);
              state = state.copyWith(activeDraft: draft);
            }
          case 'done':
            completed = true;
            final metaDraft = (map?['metadata'] as Map?)?['draft'];
            if (draft == null && metaDraft is Map<String, dynamic>) {
              draft = CampaignDraft.fromJson(metaDraft);
            }
            final serverMeta = map?['metadata'];
            final finalId = map?['id'] as String?;
            final finalContent = map?['content'] as String?;
            _patchMessage(
              asstId,
              (m) => m.copyWith(
                id: finalId,
                content: finalContent ?? content,
                metadata: {
                  if (serverMeta is Map) ...serverMeta.cast<String, dynamic>(),
                  'tools': tools,
                  if (draft != null) 'draft': draft.toJson(),
                },
              ),
            );
            if (finalId != null) {
              asstId = finalId;
              _streamingMessageId = finalId;
            }
          case 'thread.updated':
            final id = map?['id'];
            final title = map?['title'];
            if (id is String && title is String) _applyTitle(id, title);
          case 'error':
            final message =
                map?['message']?.toString() ??
                'The assistant stopped with an error.';
            state = state.copyWith(errorMessage: message);
            _patchMessage(
              asstId,
              (m) => m.copyWith(
                metadata: {
                  ...m.metadata,
                  'error': map ?? {'message': message},
                },
              ),
            );
          default:
            break; // Unknown event names are ignored for forward compatibility.
        }
      }
      if (cancelled()) return;
      if (!completed && state.errorMessage == null) {
        state = state.copyWith(
          errorMessage:
              'Connection ended before completion. Saved progress is available when you reopen the conversation.',
        );
      }
      state = state.copyWith(isStreaming: false, activeDraft: draft);
    } catch (error) {
      // Stop closes the client and lands here; that is not an error.
      if (cancelled()) return;
      state = state.copyWith(
        isStreaming: false,
        activeDraft: draft,
        errorMessage: error is ApiException
            ? 'Chat request failed: ${error.message}'
            : 'Chat interrupted. It was not resent; reopen the conversation to inspect saved progress.',
      );
    } finally {
      activeClient.close();
      if (identical(_streamClient, activeClient)) {
        _streamClient = null;
        _streamingMessageId = null;
      }
    }
  }

  static String _failure(Object e, String fallback) =>
      e is ApiException ? '${e.code}: ${e.message}' : '$fallback: $e';

  void _applyTitle(String id, String title) {
    final active = state.activeThread;
    state = state.copyWith(
      threads: [
        for (final t in state.threads) t.id == id ? t.copyWith(title: title) : t,
      ],
      activeThread: active?.id == id ? active!.copyWith(title: title) : active,
    );
  }

  /// Failures land in [ChatState.errorMessage]; the title only changes on success.
  Future<void> renameThread(String id, String title) async {
    final trimmed = title.trim();
    if (trimmed.isEmpty) return;
    try {
      final res = await apiClient.patch(
        '/api/v1/chat/threads/$id',
        body: {'title': trimmed},
      );
      final saved = res is Map ? res['title'] : null;
      _applyTitle(id, saved is String ? saved : trimmed);
      state = state.copyWith(errorMessage: null);
    } catch (e) {
      state = state.copyWith(errorMessage: _failure(e, 'Rename failed'));
    }
  }

  Future<void> deleteThread(String id) async {
    try {
      await apiClient.delete('/api/v1/chat/threads/$id');
    } catch (e) {
      state = state.copyWith(errorMessage: _failure(e, 'Delete failed'));
      return;
    }
    final wasActive = state.activeThread?.id == id;
    state = state.copyWith(
      threads: state.threads.where((t) => t.id != id).toList(),
      errorMessage: null,
    );
    if (wasActive) {
      stopStreaming();
      state = state.copyWith(activeThread: null, messages: [], activeDraft: null);
      await createNewThread();
    }
  }

  /// Throws [ApiException] on failure: an empty list would fake "no results".
  Future<List<ChatThread>> searchThreads(String query) async {
    final res = await apiClient.get(
      '/api/v1/chat/threads',
      queryParams: {'q': query, 'limit': '50'},
    );
    final items = res is Map ? res['items'] : res;
    return items is List
        ? items.whereType<Map<String, dynamic>>().map(ChatThread.fromJson).toList()
        : const [];
  }

  /// Persists 'up' | 'down' | null. State reflects only what the server returned.
  Future<void> setFeedback(String messageId, String? rating) async {
    try {
      final res = await apiClient.post(
        '/api/v1/chat/messages/$messageId/feedback',
        body: {'rating': rating},
      );
      final meta = res is Map && res['metadata'] is Map
          ? (res['metadata'] as Map).cast<String, dynamic>()
          : const <String, dynamic>{};
      _patchMessage(
        messageId,
        (m) => m.copyWith(
          metadata: {...m.metadata, ...meta, 'feedback': meta['feedback']},
        ),
      );
      state = state.copyWith(errorMessage: null);
    } catch (e) {
      state = state.copyWith(errorMessage: _failure(e, 'Feedback not saved'));
    }
  }

  /// Re-sends the user prompt preceding [assistantMessageId], unless that turn
  /// produced a draft/campaign/operation (re-running could repeat a real call).
  Future<void> regenerate(String assistantMessageId) async {
    if (state.isStreaming) return;
    final index = state.messages.indexWhere((m) => m.id == assistantMessageId);
    if (index < 0) return;
    final blocked = regenerateBlockReason(state.messages[index]);
    if (blocked != null) {
      state = state.copyWith(errorMessage: blocked);
      return;
    }
    final prompt = state.messages
        .take(index)
        .lastWhere((m) => m.role == 'user', orElse: () => _none)
        .content;
    if (prompt.trim().isEmpty) {
      state = state.copyWith(errorMessage: 'No prompt found to regenerate.');
      return;
    }
    await sendMessage(prompt);
  }

  static final _none = ChatMessage(
    id: '',
    threadId: '',
    role: 'user',
    content: '',
    attachments: const [],
    metadata: const {},
    createdAt: DateTime.fromMillisecondsSinceEpoch(0),
  );

  @override
  void dispose() {
    _streamClient?.close();
    super.dispose();
  }

  void clearError() => state = state.copyWith(errorMessage: null);

  void clearActiveDraft() {
    state = state.copyWith(activeDraft: null);
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ChatNotifier(apiClient: apiClient);
});
