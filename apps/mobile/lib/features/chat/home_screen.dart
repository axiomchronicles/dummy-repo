import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../agents/agents_screen.dart';
import '../auth/auth_provider.dart';
import '../campaigns/campaigns_screen.dart';
import '../confirmation/confirmation_drawer.dart';
import '../history/history_screen.dart';
import '../settings/settings_providers.dart';
import '../settings/settings_screen.dart';
import 'app_drawer.dart';
import 'chat_composer.dart';
import 'chat_device.dart';
import 'chat_messages.dart';
import 'chat_models.dart';
import 'chat_provider.dart';

class AttachedUpload {
  final String filename;
  final int sizeBytes;
  final String? importId;
  final bool isRoster;

  AttachedUpload({
    required this.filename,
    required this.sizeBytes,
    this.importId,
    this.isRoster = false,
  });

  String get formattedSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

/// Suggestion chips and "+" quick actions: (label, icon, prompt inserted).
const _quickPrompts = [
  ('Plan a call', HugeIcons.strokeRoundedCall02, 'Plan a call to '),
  ('Simulate a call', HugeIcons.strokeRoundedAudioWave01, 'Simulate a call with '),
  (
    'Check telephony readiness',
    HugeIcons.strokeRoundedTelephone,
    'Check telephony readiness for this workspace.',
  ),
  (
    'Show recent campaigns',
    HugeIcons.strokeRoundedMegaphone01,
    'Show my recent campaigns and their status.',
  ),
];

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _promptController = TextEditingController();
  final _scrollController = ScrollController();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  AttachedUpload? _attachedUpload;
  bool _isUploadingFile = false;
  String? _uploadError;
  bool _showJump = false;
  String? _speakingId;
  late final ChatDevice _device = ref.read(chatDeviceProvider);

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      final show = !_nearBottom;
      if (show != _showJump) setState(() => _showJump = show);
    });
  }

  @override
  void dispose() {
    if (_speakingId != null) _device.stopSpeaking();
    _promptController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  bool get _nearBottom {
    if (!_scrollController.hasClients) return true;
    final pos = _scrollController.position;
    return pos.maxScrollExtent - pos.pixels < 120;
  }

  void _scrollToBottom({bool force = false}) {
    if (!force && !_nearBottom) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      final end = _scrollController.position.maxScrollExtent;
      if (MediaQuery.disableAnimationsOf(context)) {
        _scrollController.jumpTo(end);
      } else {
        _scrollController.animateTo(
          end,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _tick() => ref.read(hapticsProvider.notifier).tick();

  void _fillComposer(String text) {
    _promptController.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }

  void _stopSpeaking() {
    if (_speakingId == null) return;
    _device.stopSpeaking();
    setState(() => _speakingId = null);
  }

  Future<void> _toggleSpeak(ChatMessage m) async {
    _tick();
    if (_speakingId == m.id) return _stopSpeaking();
    setState(() => _speakingId = m.id);
    await _device.speak(
      displayText(m),
      onDone: () {
        if (mounted && _speakingId == m.id) setState(() => _speakingId = null);
      },
    );
  }

  void _send() {
    final text = _promptController.text.trim();
    final upload = _attachedUpload;
    if (text.isEmpty && upload == null) return;
    _tick();
    _stopSpeaking();
    ref.read(chatProvider.notifier).sendMessage(
      text.isNotEmpty
          ? text
          : 'Please inspect the attached roster (${upload!.filename}) and prepare an outreach campaign.',
      attachmentNames: upload != null ? [upload.filename] : null,
      attachmentIds: upload?.importId != null ? [upload!.importId!] : null,
    );
    _promptController.clear();
    setState(() => _attachedUpload = null);
    _scrollToBottom(force: true);
  }

  void _openConfirmationSheet(CampaignDraft draft) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ConfirmationDrawer(
        draft: draft,
        onConfirmed: () {
          Navigator.of(context).pop();
          ref.read(chatProvider.notifier).clearActiveDraft();
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CampaignsScreen()),
          );
        },
        onDismissed: () => Navigator.of(context).pop(),
      ),
    );
  }

  Future<void> _pickRosterFile() async {
    setState(() => _uploadError = null);
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv', 'xlsx', 'xls'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final file = result.files.first;
      Uint8List? bytes = file.bytes;
      if (bytes == null && file.path != null) {
        bytes = await File(file.path!).readAsBytes();
      }
      if (bytes == null || bytes.isEmpty) return;
      setState(() => _isUploadingFile = true);
      final uploadRes = await ref.read(apiClientProvider).post(
        '/api/v1/imports',
        body: {
          'filename': file.name,
          'contentBase64': base64Encode(bytes),
          'mapping': {'name': 'name', 'phone': 'phone'},
          'synthetic': false,
        },
      );
      if (!mounted) return;
      setState(() {
        _isUploadingFile = false;
        _attachedUpload = AttachedUpload(
          filename: file.name,
          sizeBytes: bytes!.length,
          importId: uploadRes is Map ? uploadRes['id'] as String? : null,
          isRoster: true,
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isUploadingFile = false;
        _uploadError = e is ApiException
            ? 'Roster upload failed (${e.code}): ${e.message}'
            : 'Roster upload failed: $e';
      });
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    setState(() => _uploadError = null);
    try {
      final picked = await ImagePicker().pickImage(source: source);
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      setState(() {
        _attachedUpload = AttachedUpload(
          filename: picked.name,
          sizeBytes: bytes.length,
        );
      });
    } catch (e) {
      if (mounted) setState(() => _uploadError = 'Could not attach image: $e');
    }
  }

  void _showPlusSheet() {
    _tick();
    final p = context.palette;
    Widget tile(List<List<dynamic>> icon, String title, VoidCallback onTap, {String? subtitle}) =>
        ListTile(
          minVerticalPadding: 12,
          leading: HugeIcon(icon: icon, color: p.text, size: 22),
          title: Text(title, style: TextStyle(color: p.text)),
          subtitle: subtitle == null
              ? null
              : Text(subtitle, style: TextStyle(color: p.muted, fontSize: 12.5)),
          onTap: () {
            Navigator.of(context).pop();
            onTap();
          },
        );
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: p.surface,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              tile(HugeIcons.strokeRoundedTable01, 'Upload roster', _pickRosterFile,
                  subtitle: 'CSV or Excel contact list'),
              tile(HugeIcons.strokeRoundedImage01, 'Photos', () => _pickImage(ImageSource.gallery)),
              tile(HugeIcons.strokeRoundedCamera01, 'Camera', () => _pickImage(ImageSource.camera)),
              Divider(color: p.hairline, height: 16),
              for (final (label, icon, prompt) in _quickPrompts)
                tile(icon, label, () => _fillComposer(prompt)),
            ],
          ),
        ),
      ),
    );
  }

  void _showAgentPicker(ChatState chat) {
    _tick();
    final p = context.palette;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: p.surface,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text('Agent',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: p.text)),
              ),
              if (chat.availableAgents.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text('No configured agents found.', style: TextStyle(color: p.muted)),
                ),
              for (final agent in chat.availableAgents)
                Builder(builder: (_) {
                  final name = agent['name'] as String? ?? 'Agent';
                  final lang = agent['language'] as String?;
                  final selected = name == chat.selectedAgent;
                  return ListTile(
                    selected: selected,
                    title: Text(name, style: TextStyle(color: p.text)),
                    subtitle: lang == null
                        ? null
                        : Text(lang, style: TextStyle(color: p.muted, fontSize: 12.5)),
                    trailing: selected
                        ? HugeIcon(icon: HugeIcons.strokeRoundedTick02, color: p.text, size: 20)
                        : null,
                    onTap: () {
                      ref.read(chatProvider.notifier).selectAgent(name);
                      Navigator.of(ctx).pop();
                    },
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }

  String _transcript(ChatState chat) => [
    chat.activeThread?.title ?? 'Chat',
    for (final m in chat.messages)
      if (displayText(m).isNotEmpty)
        '${m.role == 'user' ? 'You' : chat.selectedAgent}: ${displayText(m)}',
  ].join('\n\n');

  Future<void> _renameChat(ChatThread thread) async {
    final p = context.palette;
    final controller = TextEditingController(text: thread.title);
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: p.surface,
        title: const Text('Rename chat'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 120,
          decoration: const InputDecoration(hintText: 'Chat title'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Rename'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (title != null && title.trim().isNotEmpty) {
      await ref.read(chatProvider.notifier).renameThread(thread.id, title);
    }
  }

  Future<void> _deleteChat(ChatThread thread) async {
    final p = context.palette;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: p.surface,
        title: const Text('Delete chat?'),
        content: Text('This deletes "${thread.title}" and its messages.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: p.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) {
      _stopSpeaking();
      await ref.read(chatProvider.notifier).deleteThread(thread.id);
    }
  }

  Widget _threadMenu(ChatState chat) {
    final p = context.palette;
    final thread = chat.activeThread;
    PopupMenuItem<String> item(String value, String label, List<List<dynamic>> icon, {Color? color}) =>
        PopupMenuItem(
          value: value,
          child: Row(
            children: [
              HugeIcon(icon: icon, color: color ?? p.text, size: 20),
              const SizedBox(width: 12),
              Text(label, style: TextStyle(color: color ?? p.text)),
            ],
          ),
        );
    return PopupMenuButton<String>(
      key: const ValueKey('thread-menu'),
      tooltip: 'Chat options',
      enabled: thread != null,
      color: p.surface,
      icon: HugeIcon(icon: HugeIcons.strokeRoundedMoreVertical, color: p.text, size: 20),
      onSelected: (v) {
        if (thread == null) return;
        switch (v) {
          case 'rename':
            _renameChat(thread);
          case 'share':
            _device.share(_transcript(chat), subject: thread.title);
          case 'campaign':
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const CampaignsScreen()),
            );
          case 'delete':
            _deleteChat(thread);
        }
      },
      itemBuilder: (_) => [
        item('rename', 'Rename chat', HugeIcons.strokeRoundedPencilEdit02),
        item('share', 'Share chat', HugeIcons.strokeRoundedShare08),
        if (thread?.campaignId != null)
          item('campaign', 'View campaign', HugeIcons.strokeRoundedMegaphone01),
        item('delete', 'Delete chat', HugeIcons.strokeRoundedDelete02, color: p.danger),
      ],
    );
  }

  Widget _topBar(ChatState chat) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Row(
        children: [
          Material(
            color: p.chip,
            shape: const CircleBorder(),
            child: ChatIconButton(
              tooltip: 'Open menu',
              icon: HugeIcon(icon: HugeIcons.strokeRoundedMenu09, color: p.text, size: 22),
              onPressed: () {
                _tick();
                _scaffoldKey.currentState?.openDrawer();
              },
            ),
          ),
          Expanded(
            child: Center(
              child: Semantics(
                button: true,
                label: 'Agent ${chat.selectedAgent}. Change agent',
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: BorderRadius.circular(24),
                  onTap: () => _showAgentPicker(chat),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              chat.selectedAgent,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: p.text),
                            ),
                          ),
                          const SizedBox(width: 4),
                          HugeIcon(icon: HugeIcons.strokeRoundedArrowDown01, color: p.muted, size: 16),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(color: p.chip, borderRadius: BorderRadius.circular(28)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ChatIconButton(
                  tooltip: 'New chat',
                  icon: HugeIcon(icon: HugeIcons.strokeRoundedPencilEdit02, color: p.text, size: 20),
                  onPressed: () {
                    _tick();
                    _stopSpeaking();
                    _promptController.clear();
                    ref.read(chatProvider.notifier).createNewThread();
                  },
                ),
                _threadMenu(chat),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Compact, unboxed summary of the single resolved target. Never a global count.
  Widget _draftCard(CampaignDraft draft) {
    final p = context.palette;
    final name = draft.targetText('name') ?? 'Unresolved recipient';
    final destination = draft.targetText('destinationMasked') ?? 'No destination';
    final blockers = draft.blockers;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            draft.isLive ? 'REAL CALL PLAN' : 'SIMULATION PLAN',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: draft.isLive ? p.warning : p.accent,
            ),
          ),
          const SizedBox(height: 6),
          Text('$name · $destination',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.text)),
          const SizedBox(height: 2),
          Text(
            'Caller ID ${draft.targetText('callerIdMasked') ?? 'not configured'} · ${draft.agentName}',
            style: TextStyle(fontSize: 12.5, color: p.muted),
          ),
          Text(
            '${draft.eligibleCount} eligible · ${draft.excludedCount} excluded',
            style: TextStyle(fontSize: 12.5, color: p.muted),
          ),
          if (blockers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Blocked: ${blockers.join(', ')}',
                  style: TextStyle(fontSize: 12.5, color: p.danger)),
            ),
          const SizedBox(height: 4),
          TextButton.icon(
            style: TextButton.styleFrom(
              foregroundColor: p.text,
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            icon: const Icon(Icons.fact_check_outlined, size: 18),
            label: const Text('Review plan'),
            onPressed: () => _openConfirmationSheet(draft),
          ),
        ],
      ),
    );
  }

  Widget _emptyState(String name) {
    final p = context.palette;
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              name.isEmpty ? 'What can I help with?' : '$greeting, $name',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600, color: p.text),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final (label, icon, prompt) in _quickPrompts)
                  ActionChip(
                    avatar: HugeIcon(icon: icon, color: p.muted, size: 16),
                    label: Text(label, style: TextStyle(fontSize: 14, color: p.text)),
                    backgroundColor: p.bg,
                    side: BorderSide(color: p.hairline),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                    onPressed: () {
                      _tick();
                      _fillComposer(prompt);
                    },
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget? _composerHeader() {
    final p = context.palette;
    if (_isUploadingFile) {
      return Row(children: [
        SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: p.muted)),
        const SizedBox(width: 8),
        Text('Uploading roster…', style: TextStyle(fontSize: 13, color: p.muted)),
      ]);
    }
    if (_uploadError != null) {
      return Text(_uploadError!, style: TextStyle(fontSize: 13, color: p.danger));
    }
    final upload = _attachedUpload;
    if (upload == null) return null;
    return Align(
      alignment: Alignment.centerLeft,
      child: InputChip(
        avatar: HugeIcon(
          icon: upload.isRoster ? HugeIcons.strokeRoundedTable01 : HugeIcons.strokeRoundedImage01,
          color: p.muted,
          size: 16,
        ),
        label: Text('${upload.filename} (${upload.formattedSize})',
            overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: p.text)),
        backgroundColor: p.chip,
        side: BorderSide.none,
        deleteButtonTooltipMessage: 'Remove attachment',
        onDeleted: () => setState(() => _attachedUpload = null),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<ChatState>(chatProvider, (prev, next) {
      if (prev?.activeThread?.id != next.activeThread?.id) _stopSpeaking();
      final grew = next.messages.length != prev?.messages.length;
      final changed = next.messages.isNotEmpty &&
          prev?.messages.isNotEmpty == true &&
          next.messages.last.content != prev!.messages.last.content;
      if (grew || changed || next.isStreaming != prev?.isStreaming) _scrollToBottom();
    });

    final p = context.palette;
    final chat = ref.watch(chatProvider);
    final userName = ref.watch(authProvider.select((a) => a.user?.name)) ?? '';
    final lastIndex = chat.messages.length - 1;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: p.bg,
      drawer: AppDrawer(
        onNavigateToCampaigns: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const CampaignsScreen()),
        ),
        onNavigateToHistory: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const HistoryScreen()),
        ),
        onNavigateToSettings: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (settingsContext) => SettingsScreen(
              onOpenAgents: () => Navigator.of(settingsContext).push(
                MaterialPageRoute(builder: (_) => const AgentsVoicesScreen()),
              ),
            ),
          ),
        ),
        onNavigateToAgents: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AgentsVoicesScreen()),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            _topBar(chat),
            if (chat.errorMessage != null)
              Semantics(
                liveRegion: true,
                child: Container(
                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                  padding: const EdgeInsets.only(left: 12),
                  decoration: BoxDecoration(
                    color: p.danger.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(children: [
                    Expanded(
                      child: Text(chat.errorMessage!, style: TextStyle(fontSize: 13, color: p.danger)),
                    ),
                    ChatIconButton(
                      tooltip: 'Dismiss error',
                      icon: Icon(Icons.close, size: 18, color: p.danger),
                      onPressed: ref.read(chatProvider.notifier).clearError,
                    ),
                  ]),
                ),
              ),
            Expanded(
              child: chat.messages.isEmpty
                  ? (chat.isLoading
                      ? Center(child: CircularProgressIndicator(color: p.muted))
                      : _emptyState(userName.split(' ').first))
                  : Stack(
                      children: [
                        ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                          itemCount: chat.messages.length,
                          itemBuilder: (context, i) {
                            final m = chat.messages[i];
                            if (m.role == 'user') {
                              return UserBubble(message: m, onEdit: _fillComposer);
                            }
                            final metaDraft = m.metadata['draft'];
                            final draft = metaDraft is Map<String, dynamic>
                                ? CampaignDraft.fromJson(metaDraft)
                                : (i == lastIndex ? chat.activeDraft : null);
                            return AssistantMessage(
                              key: ValueKey('assistant-${m.id}'),
                              message: m,
                              streaming: chat.isStreaming && i == lastIndex,
                              speaking: _speakingId == m.id,
                              onToggleSpeak: () => _toggleSpeak(m),
                              footer: draft == null ? null : _draftCard(draft),
                            );
                          },
                        ),
                        if (_showJump)
                          Positioned(
                            bottom: 12,
                            left: 0,
                            right: 0,
                            child: Center(
                              child: Material(
                                color: p.chip,
                                shape: CircleBorder(side: BorderSide(color: p.hairline)),
                                child: ChatIconButton(
                                  tooltip: 'Scroll to bottom',
                                  icon: HugeIcon(icon: HugeIcons.strokeRoundedArrowDown02, color: p.text, size: 20),
                                  onPressed: () => _scrollToBottom(force: true),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
              child: ChatComposer(
                controller: _promptController,
                streaming: chat.isStreaming,
                busy: chat.isLoading || _isUploadingFile,
                canSendEmpty: _attachedUpload != null,
                header: _composerHeader(),
                onPlus: _showPlusSheet,
                onSend: _send,
                onStop: () {
                  _tick();
                  ref.read(chatProvider.notifier).stopStreaming();
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
