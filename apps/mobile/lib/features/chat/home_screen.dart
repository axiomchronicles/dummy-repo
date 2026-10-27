import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import 'chat_provider.dart';
import 'chat_models.dart';
import 'app_drawer.dart';
import '../confirmation/confirmation_drawer.dart';
import '../campaigns/campaigns_screen.dart';
import '../history/history_screen.dart';
import '../settings/security_settings_screen.dart';

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

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _promptController = TextEditingController();
  final _scrollController = ScrollController();
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  AttachedUpload? _attachedUpload;
  bool _isUploadingFile = false;

  @override
  void dispose() {
    _promptController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendPrompt([String? explicitText]) {
    final text = (explicitText ?? _promptController.text).trim();
    if (text.isEmpty && _attachedUpload == null) return;

    final upload = _attachedUpload;
    final promptToSend = text.isNotEmpty
        ? text
        : 'Please inspect the attached roster (${upload?.filename}) and prepare an outreach campaign.';

    ref.read(chatProvider.notifier).sendMessage(
          promptToSend,
          attachmentNames: upload != null ? [upload.filename] : null,
          attachmentIds: upload?.importId != null ? [upload!.importId!] : null,
        );

    if (explicitText == null) {
      _promptController.clear();
      setState(() => _attachedUpload = null);
    }
    _scrollToBottom();
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
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Campaign confirmed and successfully dispatched.'),
              backgroundColor: AppColors.success,
            ),
          );
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CampaignsScreen()),
          );
        },
        onDismissed: () {
          Navigator.of(context).pop();
        },
      ),
    );
  }

  Future<void> _pickRosterFile() async {
    Navigator.of(context).pop();
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

      final apiClient = ref.read(apiClientProvider);
      final base64Content = base64Encode(bytes);

      final uploadRes = await apiClient.post('/api/v1/imports', body: {
        'filename': file.name,
        'contentBase64': base64Content,
        'mapping': {'name': 'name', 'phone': 'phone'},
        'synthetic': false,
      });

      final importId = uploadRes != null ? uploadRes['id'] as String? : null;

      setState(() {
        _isUploadingFile = false;
        _attachedUpload = AttachedUpload(
          filename: file.name,
          sizeBytes: bytes!.length,
          importId: importId,
          isRoster: true,
        );
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✅ Roster "${file.name}" uploaded successfully.'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      setState(() => _isUploadingFile = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to read or upload roster: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  Future<void> _pickDocumentFile() async {
    Navigator.of(context).pop();
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'txt', 'doc', 'docx'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.first;
      Uint8List? bytes = file.bytes;
      if (bytes == null && file.path != null) {
        bytes = await File(file.path!).readAsBytes();
      }
      final size = bytes?.length ?? file.size;

      setState(() {
        _attachedUpload = AttachedUpload(
          filename: file.name,
          sizeBytes: size,
          isRoster: false,
        );
      });
    } catch (_) {}
  }

  Future<void> _pickImage(ImageSource source) async {
    Navigator.of(context).pop();
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(source: source);
      if (picked == null) return;

      final bytes = await picked.readAsBytes();
      setState(() {
        _attachedUpload = AttachedUpload(
          filename: picked.name,
          sizeBytes: bytes.length,
          isRoster: false,
        );
      });
    } catch (_) {}
  }

  void _showAttachmentMenu(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Text(
                    'Attach to Chat',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                    ),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.darkAccent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const HugeIcon(
                      icon: HugeIcons.strokeRoundedTable01,
                      color: AppColors.darkAccent,
                      size: 20,
                    ),
                  ),
                  title: const Text('Contact Roster (CSV / Excel)', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text('Import phone numbers and names for calling campaigns', style: TextStyle(fontSize: 12)),
                  onTap: _pickRosterFile,
                ),
                ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const HugeIcon(
                      icon: HugeIcons.strokeRoundedDocumentCode,
                      color: AppColors.info,
                      size: 20,
                    ),
                  ),
                  title: const Text('Document (PDF / Text)', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text('Attach script drafts, briefs, or notes', style: TextStyle(fontSize: 12)),
                  onTap: _pickDocumentFile,
                ),
                ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const HugeIcon(
                      icon: HugeIcons.strokeRoundedImage01,
                      color: AppColors.success,
                      size: 20,
                    ),
                  ),
                  title: const Text('Photo Library', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text('Pick screenshot or image from photos', style: TextStyle(fontSize: 12)),
                  onTap: () => _pickImage(ImageSource.gallery),
                ),
                ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const HugeIcon(
                      icon: HugeIcons.strokeRoundedCamera01,
                      color: AppColors.warning,
                      size: 20,
                    ),
                  ),
                  title: const Text('Camera', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text('Take a photo directly with camera', style: TextStyle(fontSize: 12)),
                  onTap: () => _pickImage(ImageSource.camera),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showAgentSelector(BuildContext context, ChatState chatState) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final agents = chatState.availableAgents;

    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Row(
                    children: [
                      const HugeIcon(
                        icon: HugeIcons.strokeRoundedMic01,
                        color: AppColors.darkAccent,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Select Active Voice Persona',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(),
                if (agents.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      'No configured agents found.',
                      style: TextStyle(
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                  )
                else
                  ...agents.map((agent) {
                    final name = (agent['name'] as String?) ?? 'Agent';
                    final lang = (agent['language'] as String?) ?? 'English';
                    final desc = (agent['description'] as String?) ?? '';
                    final isSelected = name == chatState.selectedAgent;

                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: isSelected
                            ? AppColors.darkAccent
                            : (isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated),
                        child: HugeIcon(
                          icon: HugeIcons.strokeRoundedCall02,
                          color: isSelected ? Colors.white : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                          size: 16,
                        ),
                      ),
                      title: Row(
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              style: TextStyle(
                                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              lang,
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                      subtitle: desc.isNotEmpty
                          ? Text(
                              desc,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                              ),
                            )
                          : null,
                      trailing: isSelected
                          ? const Icon(Icons.check_circle_rounded, color: AppColors.darkAccent, size: 20)
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
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<ChatState>(chatProvider, (previous, next) {
      if (next.messages.length != previous?.messages.length ||
          next.isStreaming != previous?.isStreaming ||
          (next.messages.isNotEmpty &&
              previous?.messages.isNotEmpty == true &&
              next.messages.last.content != previous!.messages.last.content)) {
        _scrollToBottom();
      }
    });

    final authState = ref.watch(authProvider);
    final chatState = ref.watch(chatProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Evening';
    final userName = authState.user?.name.split(' ').first ?? 'Milo';

    return Scaffold(
      key: _scaffoldKey,
      drawer: AppDrawer(
        onNavigateToCampaigns: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const CampaignsScreen()),
        ),
        onNavigateToHistory: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const HistoryScreen()),
        ),
        onNavigateToSettings: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const SecuritySettingsScreen()),
        ),
      ),
      appBar: AppBar(
        leading: IconButton(
          icon: const HugeIcon(
            icon: HugeIcons.strokeRoundedMenuSquare,
            color: AppColors.darkTextPrimary,
            size: 22,
          ),
          onPressed: () => _scaffoldKey.currentState?.openDrawer(),
        ),
        title: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.asset(
              'assets/logo.png',
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) => Container(
                decoration: BoxDecoration(
                  color: AppColors.darkAccent,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Center(
                  child: HugeIcon(
                    icon: HugeIcons.strokeRoundedCall,
                    color: Colors.white,
                    size: 16,
                  ),
                ),
              ),
            ),
          ),
        ),
        actions: [
          IconButton(
            icon: const HugeIcon(
              icon: HugeIcons.strokeRoundedAdd01,
              color: AppColors.darkTextPrimary,
              size: 20,
            ),
            tooltip: 'New Conversation',
            onPressed: () => ref.read(chatProvider.notifier).createNewThread(),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: CircleAvatar(
              radius: 14,
              backgroundColor: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
              child: Text(
                userName.substring(0, 1).toUpperCase(),
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Error banner if any
            if (chatState.errorMessage != null)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.4)),
                ),
                child: Row(
                  children: [
                    const HugeIcon(icon: HugeIcons.strokeRoundedAlert02, color: AppColors.danger, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        chatState.errorMessage!,
                        style: const TextStyle(fontSize: 12, color: AppColors.danger),
                      ),
                    ),
                  ],
                ),
              ),

            // Chat Message Thread or Empty Greeting
            Expanded(
              child: chatState.messages.isEmpty
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              '$greeting, $userName',
                              style: TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w700,
                                color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Describe your outreach task or attach a contact roster.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 14,
                                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                              ),
                            ),
                            const SizedBox(height: 28),

                            // Quick Action Chips
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              alignment: WrapAlignment.center,
                              children: [
                                _suggestionChip(
                                  context,
                                  icon: HugeIcons.strokeRoundedUserGroup,
                                  label: 'What voice agents are available?',
                                  prompt: 'What voice agents do I have configured in my workspace and what are their instructions?',
                                ),
                                _suggestionChip(
                                  context,
                                  icon: HugeIcons.strokeRoundedCall02,
                                  label: 'Plan candidate interview outreach',
                                  prompt: 'Draft an outreach campaign to schedule candidate interviews tomorrow morning.',
                                ),
                                _suggestionChip(
                                  context,
                                  icon: HugeIcons.strokeRoundedShieldEnergy,
                                  label: 'Check kill-switch status',
                                  prompt: 'What is the current telephony kill-switch status and workspace safety configuration?',
                                ),
                                _suggestionChip(
                                  context,
                                  icon: HugeIcons.strokeRoundedHelpCircle,
                                  label: 'Chat freely or ask anything',
                                  prompt: 'Hi! Introduce yourself and tell me how we can run voice campaigns together.',
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      itemCount: chatState.messages.length,
                      itemBuilder: (context, index) {
                        final msg = chatState.messages[index];
                        final isLatest = index == chatState.messages.length - 1;
                        return _chatBubble(
                          context,
                          msg,
                          isLatestAssistant: isLatest && msg.role == 'assistant',
                          isStreaming: chatState.isStreaming,
                          activeDraft: isLatest ? chatState.activeDraft : null,
                        );
                      },
                    ),
            ),

            // Floating Composer Section
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Container(
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : AppColors.lightCard,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    width: 1,
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(16, 10, 8, 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // File uploading state
                    if (_isUploadingFile) ...[
                      Row(
                        children: [
                          const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.darkAccent),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Uploading and validating contact roster...',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],

                    // Attached File Pill
                    if (_attachedUpload != null && !_isUploadingFile) ...[
                      Row(
                        children: [
                          Flexible(
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: _attachedUpload!.isRoster
                                      ? AppColors.darkAccent.withValues(alpha: 0.4)
                                      : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  HugeIcon(
                                    icon: _attachedUpload!.isRoster
                                        ? HugeIcons.strokeRoundedTable01
                                        : HugeIcons.strokeRoundedFile01,
                                    color: AppColors.darkAccent,
                                    size: 14,
                                  ),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Text(
                                      '${_attachedUpload!.filename} (${_attachedUpload!.formattedSize})',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  GestureDetector(
                                    onTap: () => setState(() => _attachedUpload = null),
                                    child: const HugeIcon(
                                      icon: HugeIcons.strokeRoundedCancel01,
                                      color: AppColors.darkTextSecondary,
                                      size: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],

                    // Text Input Field
                    TextField(
                      controller: _promptController,
                      maxLines: 4,
                      minLines: 1,
                      style: TextStyle(
                        fontSize: 15,
                        color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'How can I help you today?',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                        filled: false,
                      ),
                      onSubmitted: (_) {
                        if (!chatState.isStreaming && !chatState.isLoading) {
                          _sendPrompt();
                        }
                      },
                    ),
                    const SizedBox(height: 8),

                    // Controls Row
                    Row(
                      children: [
                        // Attach Button (+) -> Opens ChatGPT-like sheet
                        IconButton(
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          icon: HugeIcon(
                            icon: HugeIcons.strokeRoundedAdd01,
                            color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                            size: 20,
                          ),
                          onPressed: () => _showAttachmentMenu(context),
                        ),
                        const SizedBox(width: 8),

                        // Voice Agent Selector Pill
                        GestureDetector(
                          onTap: () => _showAgentSelector(context, chatState),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Flexible(
                                  child: Text(
                                    chatState.selectedAgent,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                HugeIcon(
                                  icon: HugeIcons.strokeRoundedArrowDown01,
                                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                                  size: 14,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),

                        const Spacer(),

                        // Send / Stop Action Button
                        GestureDetector(
                          onTap: () {
                            if (chatState.isStreaming) {
                              ref.read(chatProvider.notifier).stopStreaming();
                            } else if (!chatState.isLoading) {
                              _sendPrompt();
                            }
                          },
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: chatState.isStreaming
                                  ? Colors.redAccent
                                  : (isDark ? AppColors.darkAccent : AppColors.lightAccent),
                              shape: BoxShape.circle,
                            ),
                            child: chatState.isStreaming
                                ? const Center(
                                    child: Icon(Icons.stop_rounded, color: Colors.white, size: 20),
                                  )
                                : chatState.isLoading
                                    ? const Center(
                                        child: SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                        ),
                                      )
                                    : const Center(
                                        child: HugeIcon(
                                          icon: HugeIcons.strokeRoundedArrowUp01,
                                          color: Colors.white,
                                          size: 18,
                                        ),
                                      ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _suggestionChip(
    BuildContext context, {
    required dynamic icon,
    required String label,
    required String prompt,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ActionChip(
      avatar: HugeIcon(
        icon: icon,
        color: AppColors.darkAccent,
        size: 14,
      ),
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
        ),
      ),
      backgroundColor: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
      side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      onPressed: () => _sendPrompt(prompt),
    );
  }

  Widget _chatBubble(
    BuildContext context,
    ChatMessage msg, {
    required bool isLatestAssistant,
    required bool isStreaming,
    CampaignDraft? activeDraft,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isUser = msg.role == 'user';

    // Strip raw campaign-draft JSON fence from bubble display
    String displayContent = msg.content
        .replaceAll(RegExp(r'```campaign-draft[\s\S]*?```'), '')
        .trim();

    final isThinking = !isUser && isLatestAssistant && isStreaming && displayContent.isEmpty;

    CampaignDraft? messageDraft;
    if (msg.metadata['draft'] != null && msg.metadata['draft'] is Map<String, dynamic>) {
      messageDraft = CampaignDraft.fromJson(msg.metadata['draft'] as Map<String, dynamic>);
    } else if (activeDraft != null) {
      messageDraft = activeDraft;
    }

    if (isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(bottom: 16),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCardElevated : const Color(0xFFE2E8F0),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Text(
            displayContent,
            style: TextStyle(
              fontSize: 14.5,
              color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
              height: 1.45,
            ),
          ),
        ),
      );
    }

    // Agent response: No box / border / background behind the agent response
    return Padding(
      padding: const EdgeInsets.only(bottom: 20, left: 2, right: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 26,
                height: 26,
                margin: const EdgeInsets.only(top: 2, right: 12),
                decoration: BoxDecoration(
                  color: AppColors.darkAccent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: HugeIcon(
                    icon: HugeIcons.strokeRoundedCall02,
                    color: AppColors.darkAccent,
                    size: 14,
                  ),
                ),
              ),
              Expanded(
                child: isThinking
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.darkAccent,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Thinking...',
                            style: TextStyle(
                              fontSize: 14,
                              fontStyle: FontStyle.italic,
                              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                            ),
                          ),
                        ],
                      )
                    : _buildFormattedMessage(
                        context,
                        displayContent,
                        isUser: false,
                        showCursor: isLatestAssistant && isStreaming,
                      ),
              ),
            ],
          ),

          // Render Campaign Draft Card ONLY if THIS message specifically produced a draft
          if (messageDraft != null) ...[
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.only(left: 38),
              child: _draftCard(context, messageDraft),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFormattedMessage(
    BuildContext context,
    String content, {
    required bool isUser,
    required bool showCursor,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseColor = isUser
        ? (isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary)
        : (isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary);

    if (isUser) {
      return Text(
        content,
        style: TextStyle(fontSize: 14.5, color: baseColor, height: 1.4),
      );
    }

    final lines = content.split('\n');
    final widgets = <Widget>[];

    for (int i = 0; i < lines.length; i++) {
      final line = lines[i];
      final isLastLine = i == lines.length - 1;

      if (line.trim().startsWith('### ') || line.trim().startsWith('## ') || line.trim().startsWith('# ')) {
        final headingText = line.replaceAll(RegExp(r'^#+\s*'), '');
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Text(
            headingText,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: baseColor,
            ),
          ),
        ));
      } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || line.trim().startsWith('• ')) {
        final bulletText = line.trim().substring(2);
        widgets.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '• ',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.darkAccent),
              ),
              Expanded(
                child: _buildRichInlineText(
                  bulletText,
                  baseColor,
                  isDark,
                  appendCursor: isLastLine && showCursor,
                ),
              ),
            ],
          ),
        ));
      } else {
        if (line.trim().isEmpty) {
          widgets.add(const SizedBox(height: 6));
        } else {
          widgets.add(Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: _buildRichInlineText(
              line,
              baseColor,
              isDark,
              appendCursor: isLastLine && showCursor,
            ),
          ));
        }
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: widgets.isEmpty
          ? [
              if (showCursor)
                const Text(
                  '▋',
                  style: TextStyle(color: AppColors.darkAccent, fontSize: 14),
                )
            ]
          : widgets,
    );
  }

  Widget _buildRichInlineText(
    String text,
    Color baseColor,
    bool isDark, {
    bool appendCursor = false,
  }) {
    final spans = <InlineSpan>[];
    final parts = text.split('**');

    for (int i = 0; i < parts.length; i++) {
      final isBold = i % 2 == 1;
      final partText = parts[i];
      if (partText.isEmpty) continue;

      spans.add(TextSpan(
        text: partText,
        style: TextStyle(
          fontSize: 14.5,
          color: baseColor,
          height: 1.45,
          fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
        ),
      ));
    }

    if (appendCursor) {
      spans.add(const TextSpan(
        text: ' ▋',
        style: TextStyle(
          color: AppColors.darkAccent,
          fontSize: 14,
          fontWeight: FontWeight.bold,
        ),
      ));
    }

    return RichText(text: TextSpan(children: spans));
  }

  Widget _draftCard(BuildContext context, CampaignDraft draft) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.darkAccent.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const HugeIcon(
                icon: HugeIcons.strokeRoundedCall02,
                color: AppColors.darkAccent,
                size: 20,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Prepared Campaign Draft',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.darkAccent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'READY FOR REVIEW',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: AppColors.darkAccent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            draft.objective,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                '${draft.eligibleCount} Eligible Recipients',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: draft.eligibleCount > 0 ? AppColors.success : AppColors.warning,
                ),
              ),
              const Spacer(),
              Text(
                '${draft.excludedCount} Excluded',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.danger),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: isDark ? AppColors.darkAccent : AppColors.lightAccent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              padding: const EdgeInsets.symmetric(vertical: 12),
              elevation: 0,
            ),
            icon: const HugeIcon(
              icon: HugeIcons.strokeRoundedView,
              color: Colors.white,
              size: 16,
            ),
            label: const Text(
              'Inspect Confirmation Drawer',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            onPressed: () => _openConfirmationSheet(draft),
          ),
        ],
      ),
    );
  }
}
