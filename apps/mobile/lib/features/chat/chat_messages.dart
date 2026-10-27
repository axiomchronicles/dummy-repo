import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import 'chat_device.dart';
import 'chat_markdown.dart';
import 'chat_models.dart';
import 'chat_provider.dart';

/// 48px icon button with a tooltip (which doubles as the semantics label).
class ChatIconButton extends StatelessWidget {
  const ChatIconButton({
    super.key,
    required this.tooltip,
    required this.icon,
    this.onPressed,
  });
  final String tooltip;
  final Widget icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
    icon: icon,
    onPressed: onPressed,
  );
}

void showCopied(BuildContext context, String text) {
  Clipboard.setData(ClipboardData(text: text));
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(const SnackBar(content: Text('Copied')));
}

/// Raw campaign-draft fences are rendered as the draft card, not as text.
String displayText(ChatMessage m) =>
    m.content.replaceAll(RegExp(r'```campaign-draft[\s\S]*?```'), '').trim();

class UserBubble extends StatelessWidget {
  const UserBubble({super.key, required this.message, required this.onEdit});
  final ChatMessage message;
  final ValueChanged<String> onEdit;

  void _menu(BuildContext context) {
    final p = context.palette;
    final text = displayText(message);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: p.surface,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: HugeIcon(icon: HugeIcons.strokeRoundedCopy01, color: p.text),
              title: const Text('Copy'),
              onTap: () {
                Navigator.pop(ctx);
                showCopied(context, text);
              },
            ),
            ListTile(
              leading: HugeIcon(icon: HugeIcons.strokeRoundedPencilEdit02, color: p.text),
              title: const Text('Edit & resend'),
              onTap: () {
                Navigator.pop(ctx);
                onEdit(text);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final names = [
      for (final a in message.attachments)
        a is Map ? (a['filename'] ?? a['name'] ?? 'attachment').toString() : '$a',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, left: 48),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final n in names)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(n, style: TextStyle(fontSize: 12, color: p.muted)),
            ),
          LayoutBuilder(
            builder: (context, c) => ConstrainedBox(
              constraints: BoxConstraints(maxWidth: c.maxWidth * 0.8 + 48),
              child: Semantics(
                hint: 'Long press for options',
                child: GestureDetector(
                  key: ValueKey('user-bubble-${message.id}'),
                  onLongPress: () => _menu(context),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                    decoration: const BoxDecoration(
                      color: Color(0xFF1B3FA0),
                      borderRadius: BorderRadius.only(
                        topLeft: Radius.circular(22),
                        topRight: Radius.circular(4),
                        bottomLeft: Radius.circular(22),
                        bottomRight: Radius.circular(22),
                      ),
                    ),
                    child: Text(
                      displayText(message),
                      style: TextStyle(fontSize: 16, height: 1.4, color: p.onUserBubble),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Small breathing dot shown at the end of a streaming reply.
class PulsingDot extends StatefulWidget {
  const PulsingDot({super.key});
  @override
  State<PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<PulsingDot>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 1;
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Responding',
    child: FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(_c),
      child: Container(
        width: 12,
        height: 12,
        margin: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(color: context.palette.text, shape: BoxShape.circle),
      ),
    ),
  );
}

class AssistantMessage extends ConsumerWidget {
  const AssistantMessage({
    super.key,
    required this.message,
    required this.streaming,
    required this.speaking,
    required this.onToggleSpeak,
    this.footer,
  });
  final ChatMessage message;

  /// True while this is the reply currently being streamed.
  final bool streaming;
  final bool speaking;
  final VoidCallback onToggleSpeak;

  /// Draft card for turns that produced a call plan.
  final Widget? footer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final text = displayText(message);
    final tools = message.metadata['tools'];
    final error = message.metadata['error'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (tools is List && tools.isNotEmpty) ToolLines(tools: tools),
          if (text.isEmpty && streaming)
            const Align(alignment: Alignment.centerLeft, child: PulsingDot())
          else
            SelectionArea(
              child: ChatMarkdown(text, trailing: streaming ? const PulsingDot() : null),
            ),
          if (message.metadata['stopped'] == true)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Stopped', style: TextStyle(fontSize: 13, color: p.muted)),
            ),
          if (error is Map)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                [error['code'], error['message']].whereType<Object>().join(': '),
                style: TextStyle(fontSize: 13, color: p.danger),
              ),
            ),
          ?footer,
          if (!streaming && text.isNotEmpty)
            _ActionRow(
              message: message,
              text: text,
              speaking: speaking,
              onToggleSpeak: onToggleSpeak,
            ),
        ],
      ),
    );
  }
}

class _ActionRow extends ConsumerWidget {
  const _ActionRow({
    required this.message,
    required this.text,
    required this.speaking,
    required this.onToggleSpeak,
  });
  final ChatMessage message;
  final String text;
  final bool speaking;
  final VoidCallback onToggleSpeak;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final chat = ref.read(chatProvider.notifier);
    final busy = ref.watch(chatProvider.select((s) => s.isStreaming));
    final rating = feedbackRating(message);
    final persisted = !message.id.startsWith('local_');
    final blocked = regenerateBlockReason(message);
    Widget icon(List<List<dynamic>> i, {bool on = false}) => HugeIcon(
      icon: i,
      color: on ? p.text : p.muted,
      size: 18,
      strokeWidth: on ? 2.4 : 1.5,
    );
    void rate(String value) {
      chat.setFeedback(message.id, rating == value ? null : value);
    }

    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Wrap(
        children: [
          ChatIconButton(
            tooltip: 'Copy',
            icon: icon(HugeIcons.strokeRoundedCopy01),
            onPressed: () => showCopied(context, text),
          ),
          Semantics(
            selected: rating == 'up',
            child: ChatIconButton(
              key: ValueKey('thumbs-up-${message.id}${rating == 'up' ? '-on' : ''}'),
              tooltip: rating == 'up' ? 'Remove good response' : 'Good response',
              icon: rating == 'up'
                  ? Icon(Icons.thumb_up_alt, size: 18, color: p.text)
                  : icon(HugeIcons.strokeRoundedThumbsUp),
              onPressed: persisted ? () => rate('up') : null,
            ),
          ),
          Semantics(
            selected: rating == 'down',
            child: ChatIconButton(
              key: ValueKey('thumbs-down-${message.id}${rating == 'down' ? '-on' : ''}'),
              tooltip: rating == 'down' ? 'Remove bad response' : 'Bad response',
              icon: rating == 'down'
                  ? Icon(Icons.thumb_down_alt, size: 18, color: p.text)
                  : icon(HugeIcons.strokeRoundedThumbsDown),
              onPressed: persisted ? () => rate('down') : null,
            ),
          ),
          ChatIconButton(
            tooltip: speaking ? 'Stop reading' : 'Read aloud',
            icon: speaking
                ? Icon(Icons.stop_circle_outlined, size: 20, color: p.text)
                : icon(HugeIcons.strokeRoundedVolumeHigh),
            onPressed: onToggleSpeak,
          ),
          ChatIconButton(
            tooltip: 'Share',
            icon: icon(HugeIcons.strokeRoundedShare08),
            onPressed: () => ref.read(chatDeviceProvider).share(text),
          ),
          PopupMenuButton<String>(
            key: ValueKey('more-${message.id}'),
            tooltip: 'More actions',
            icon: icon(HugeIcons.strokeRoundedMoreVertical),
            color: p.surface,
            onSelected: (v) {
              if (v == 'regenerate') chat.regenerate(message.id);
              if (v == 'select') _selectText(context, text);
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'regenerate',
                enabled: blocked == null && !busy && persisted,
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  enabled: blocked == null && !busy && persisted,
                  leading: icon(HugeIcons.strokeRoundedRefresh),
                  title: const Text('Regenerate'),
                  subtitle: blocked == null ? null : Text(blocked),
                ),
              ),
              PopupMenuItem(
                value: 'select',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: icon(HugeIcons.strokeRoundedTextSelection),
                  title: const Text('Select text'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _selectText(BuildContext context, String text) {
    final p = context.palette;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: p.surface,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.7),
            child: SingleChildScrollView(
              child: SelectableText(
                text,
                style: TextStyle(fontSize: 16, height: 1.5, color: p.text),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One quiet line per tool execution from tool.started / tool.result events.
class ToolLines extends StatelessWidget {
  const ToolLines({super.key, required this.tools});
  final List tools;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final tool in tools.whereType<Map>())
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 1),
              child: Row(
                children: [
                  if (tool['status'] == 'running')
                    SizedBox(
                      width: 10,
                      height: 10,
                      child: CircularProgressIndicator(strokeWidth: 1.5, color: p.subtle),
                    )
                  else
                    Icon(
                      tool['status'] == 'failed' ? Icons.close : Icons.check,
                      size: 12,
                      color: tool['status'] == 'failed' ? p.danger : p.subtle,
                    ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${tool['name'].toString().replaceAll('_', ' ')}'
                      '${tool['error'] != null ? ' · ${tool['error']}' : ''}',
                      style: TextStyle(fontSize: 12, color: p.muted),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
