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

/// Compact 32x32 icon button for message action row.
class _ActionIconButton extends StatelessWidget {
  const _ActionIconButton({
    super.key,
    required this.tooltip,
    required this.icon,
    this.onPressed,
    this.selected,
  });
  final String tooltip;
  final Widget icon;
  final VoidCallback? onPressed;
  final bool? selected;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: Semantics(
      button: true,
      label: tooltip,
      selected: selected,
      child: InkResponse(
        onTap: onPressed,
        radius: 16,
        child: SizedBox(
          width: 32,
          height: 32,
          child: Center(child: icon),
        ),
      ),
    ),
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

// ─── File type helpers ────────────────────────────────────────────────────────

/// Returns a colour tint and icon for a given filename extension.
({Color color, IconData icon, String label}) _fileInfo(
  String filename,
  AppPalette p,
) {
  final ext = filename.split('.').last.toLowerCase();
  return switch (ext) {
    'xlsx' || 'xls' => (
      color: const Color(0xFF1D6F42),
      icon: Icons.table_chart_outlined,
      label: 'Excel',
    ),
    'csv' => (
      color: const Color(0xFF0F7B6C),
      icon: Icons.grid_on_outlined,
      label: 'CSV',
    ),
    'pdf' => (
      color: const Color(0xFFE53935),
      icon: Icons.picture_as_pdf_outlined,
      label: 'PDF',
    ),
    'doc' || 'docx' => (
      color: const Color(0xFF1565C0),
      icon: Icons.description_outlined,
      label: 'Word',
    ),
    'jpg' || 'jpeg' || 'png' || 'gif' || 'webp' => (
      color: p.accent,
      icon: Icons.image_outlined,
      label: ext.toUpperCase(),
    ),
    'txt' || 'md' => (
      color: p.muted,
      icon: Icons.text_snippet_outlined,
      label: 'Text',
    ),
    _ => (
      color: p.subtle,
      icon: Icons.insert_drive_file_outlined,
      label: ext.toUpperCase(),
    ),
  };
}

// ─── ChatGPT-style file attachment pill ───────────────────────────────────────

/// Compact file pill shown above the user's text bubble when a file is attached.
class FilePill extends StatelessWidget {
  const FilePill({super.key, required this.filename, this.subtitle});
  final String filename;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final info = _fileInfo(filename, p);
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      constraints: const BoxConstraints(maxWidth: 260),
      decoration: BoxDecoration(
        color: p.field,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: info.color.withValues(alpha: .18),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Icon(info.icon, color: info.color, size: 18),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  filename,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: p.text,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: TextStyle(fontSize: 11, color: p.muted),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Composer attachment preview pill (above input field) ─────────────────────

/// Shown in the chat composer header when a file is ready to send.
class AttachmentPreviewPill extends StatelessWidget {
  const AttachmentPreviewPill({
    super.key,
    required this.filename,
    required this.subtitle,
    required this.onRemove,
  });
  final String filename;
  final String subtitle;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final info = _fileInfo(filename, p);
    return Container(
      margin: const EdgeInsets.only(bottom: 8, left: 4, right: 4),
      padding: const EdgeInsets.only(left: 10, top: 6, bottom: 6, right: 4),
      decoration: BoxDecoration(
        color: p.field,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: p.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: info.color.withValues(alpha: .18),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(info.icon, color: info.color, size: 19),
          ),
          const SizedBox(width: 9),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  filename,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: p.text,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 11, color: p.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: p.subtle.withValues(alpha: .3),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.close, size: 15, color: p.muted),
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }
}

// ─── User bubble ──────────────────────────────────────────────────────────────

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
    // Resolve file names from attachments metadata.
    final attachmentNames = [
      for (final a in message.attachments)
        a is Map
            ? (a['filename'] ?? a['name'] ?? 'attachment').toString()
            : '$a',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, left: 48),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final name in attachmentNames)
            Align(
              alignment: Alignment.centerRight,
              child: FilePill(filename: name, subtitle: 'Attached'),
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 11,
                    ),
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
                      style: TextStyle(
                        fontSize: 16,
                        height: 1.4,
                        color: p.onUserBubble,
                      ),
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

// ─── Pulsing dot (streaming indicator) ────────────────────────────────────────

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
        decoration: BoxDecoration(
          color: context.palette.text,
          shape: BoxShape.circle,
        ),
      ),
    ),
  );
}

// ─── Shimmer effect (pure Flutter, no extra package) ─────────────────────────

class _Shimmer extends StatefulWidget {
  const _Shimmer({required this.child});
  final Widget child;

  @override
  State<_Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<_Shimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void initState() {
    super.initState();
    if (!MediaQuery.disableAnimationsOf(context)) _ctrl.repeat();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _ctrl.stop();
      _ctrl.value = 0;
    } else if (!_ctrl.isAnimating) {
      _ctrl.repeat();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _ctrl,
    child: widget.child,
    builder: (context, child) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      final base = isDark ? const Color(0xFF2A2A2E) : const Color(0xFFE8E8EC);
      final highlight =
          isDark ? const Color(0xFF3E3E44) : const Color(0xFFF5F5F8);
      return ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (bounds) => LinearGradient(
          colors: [base, highlight, base],
          stops: const [0.0, 0.5, 1.0],
          begin: Alignment(
            -1.5 + _ctrl.value * 4,
            0,
          ),
          end: Alignment(
            0.5 + _ctrl.value * 4,
            0,
          ),
          tileMode: TileMode.clamp,
        ).createShader(bounds),
        child: child,
      );
    },
  );
}

// ─── ChatGPT-style tool-call card ────────────────────────────────────────────

/// Maps internal tool names to human-readable labels and icons.
({String label, IconData icon}) _toolMeta(String name) {
  return switch (name) {
    'resolve_contact' => (
      label: 'Looking up contact',
      icon: Icons.person_search_outlined,
    ),
    'get_eligibility' => (
      label: 'Checking eligibility & consent',
      icon: Icons.verified_user_outlined,
    ),
    'get_telephony_configuration' => (
      label: 'Checking telephony readiness',
      icon: Icons.settings_phone_outlined,
    ),
    'prepare_call_plan' => (
      label: 'Preparing call plan',
      icon: Icons.edit_note_outlined,
    ),
    'validate_call_plan' => (
      label: 'Validating plan',
      icon: Icons.fact_check_outlined,
    ),
    'run_simulation' => (
      label: 'Running simulation',
      icon: Icons.play_circle_outline,
    ),
    'request_live_launch' => (
      label: 'Requesting live call',
      icon: Icons.phone_forwarded_outlined,
    ),
    'get_call_artifacts' => (
      label: 'Reading call result',
      icon: Icons.summarize_outlined,
    ),
    'get_attempt_state' => (
      label: 'Checking call state',
      icon: Icons.track_changes_outlined,
    ),
    _ => (
      label: name.replaceAll('_', ' '),
      icon: Icons.hub_outlined,
    ),
  };
}

/// One collapsible card per tool invocation — ChatGPT-style.
class _ToolCard extends StatefulWidget {
  const _ToolCard({required this.tool, required this.isLast});
  final Map tool;
  final bool isLast;

  @override
  State<_ToolCard> createState() => _ToolCardState();
}

class _ToolCardState extends State<_ToolCard>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void initState() {
    super.initState();
    if (widget.tool['status'] == 'running') _spin.repeat();
  }

  @override
  void didUpdateWidget(_ToolCard old) {
    super.didUpdateWidget(old);
    if (widget.tool['status'] == 'running' && !_spin.isAnimating) {
      _spin.repeat();
    } else if (widget.tool['status'] != 'running' && _spin.isAnimating) {
      _spin.stop();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final status = widget.tool['status']?.toString() ?? 'running';
    final name = widget.tool['name']?.toString() ?? 'tool';
    final error = widget.tool['error']?.toString();
    final meta = _toolMeta(name);
    final running = status == 'running';
    final failed = status == 'failed';

    final statusColor = running
        ? p.accent
        : failed
        ? p.danger
        : p.success;

    Widget leading;
    if (running) {
      leading = RotationTransition(
        turns: _spin,
        child: Icon(Icons.refresh_rounded, size: 16, color: statusColor),
      );
    } else {
      leading = Icon(
        failed ? Icons.error_outline : Icons.check_circle_outline,
        size: 16,
        color: statusColor,
      );
    }

    final card = GestureDetector(
      onTap: error != null ? () => setState(() => _expanded = !_expanded) : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: p.field,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: failed ? p.danger.withValues(alpha: .35) : p.hairline,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (running)
                  _Shimmer(
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: p.subtle,
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  )
                else
                  leading,
                const SizedBox(width: 8),
                Icon(meta.icon, size: 15, color: p.muted),
                const SizedBox(width: 6),
                if (running)
                  _Shimmer(
                    child: Container(
                      height: 13,
                      width: 160,
                      decoration: BoxDecoration(
                        color: p.subtle,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                  )
                else
                  Expanded(
                    child: Text(
                      meta.label,
                      style: TextStyle(
                        fontSize: 13,
                        color: p.text.withValues(alpha: .8),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                if (error != null) ...[
                  const SizedBox(width: 4),
                  Icon(
                    _expanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    size: 16,
                    color: p.muted,
                  ),
                ],
              ],
            ),
            if (_expanded && error != null)
              Padding(
                padding: const EdgeInsets.only(top: 6, left: 24),
                child: Text(
                  error,
                  style: TextStyle(fontSize: 12, color: p.danger),
                ),
              ),
          ],
        ),
      ),
    );

    return card;
  }
}

/// ChatGPT-style collapsible tool-calls section with shimmer for running items.
class ToolLines extends StatefulWidget {
  const ToolLines({super.key, required this.tools, this.streaming = false});
  final List tools;
  final bool streaming;

  @override
  State<ToolLines> createState() => _ToolLinesState();
}

class _ToolLinesState extends State<ToolLines> {
  bool _sectionExpanded = true;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final validTools = widget.tools.whereType<Map>().toList();
    if (validTools.isEmpty) return const SizedBox.shrink();

    final anyRunning = validTools.any((t) => t['status'] == 'running');
    final anyFailed = validTools.any((t) => t['status'] == 'failed');
    final done = !anyRunning;

    final headerText = anyRunning
        ? 'Working…'
        : anyFailed
        ? '${validTools.length} step${validTools.length > 1 ? 's' : ''} (${validTools.where((t) => t['status'] == 'failed').length} failed)'
        : '${validTools.length} step${validTools.length > 1 ? 's' : ''} completed';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row — tap to collapse/expand
          GestureDetector(
            onTap: () => setState(() => _sectionExpanded = !_sectionExpanded),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Icon(
                    done
                        ? (anyFailed
                              ? Icons.warning_amber_rounded
                              : Icons.check_rounded)
                        : Icons.more_horiz_rounded,
                    size: 16,
                    color: anyFailed
                        ? p.danger
                        : done
                        ? p.success
                        : p.accent,
                  ),
                  const SizedBox(width: 6),
                  if (!done && anyRunning)
                    _Shimmer(
                      child: Container(
                        height: 12,
                        width: 90,
                        decoration: BoxDecoration(
                          color: p.subtle,
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                    )
                  else
                    Text(
                      headerText,
                      style: TextStyle(
                        fontSize: 12,
                        color: anyFailed ? p.danger : p.muted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  const SizedBox(width: 4),
                  Icon(
                    _sectionExpanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    size: 16,
                    color: p.muted,
                  ),
                ],
              ),
            ),
          ),
          // Tool cards — shown when expanded
          if (_sectionExpanded)
            ...validTools.asMap().entries.map(
              (entry) => _ToolCard(
                tool: entry.value,
                isLast: entry.key == validTools.length - 1,
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Assistant message ────────────────────────────────────────────────────────

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
  final bool streaming;
  final bool speaking;
  final VoidCallback onToggleSpeak;
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
          if (tools is List && tools.isNotEmpty)
            ToolLines(tools: tools, streaming: streaming),
          if (text.isEmpty && streaming)
            const Align(alignment: Alignment.centerLeft, child: PulsingDot())
          else
            SelectionArea(
              child: ChatMarkdown(
                text,
                trailing: streaming ? const PulsingDot() : null,
              ),
            ),
          if (message.metadata['stopped'] == true)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Stopped',
                style: TextStyle(fontSize: 13, color: p.muted),
              ),
            ),
          if (error is Map)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                [error['code'], error['message']]
                    .whereType<Object>()
                    .join(': '),
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

// ─── Action row (copy, thumbs, speak, share, more) ────────────────────────────

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
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ActionIconButton(
            tooltip: 'Copy',
            icon: icon(HugeIcons.strokeRoundedCopy01),
            onPressed: () => showCopied(context, text),
          ),
          _ActionIconButton(
            key: ValueKey(
              'thumbs-up-${message.id}${rating == 'up' ? '-on' : ''}',
            ),
            tooltip: rating == 'up' ? 'Remove good response' : 'Good response',
            selected: rating == 'up',
            icon: rating == 'up'
                ? Icon(Icons.thumb_up_alt, size: 18, color: p.text)
                : icon(HugeIcons.strokeRoundedThumbsUp),
            onPressed: persisted ? () => rate('up') : null,
          ),
          _ActionIconButton(
            key: ValueKey(
              'thumbs-down-${message.id}${rating == 'down' ? '-on' : ''}',
            ),
            tooltip:
                rating == 'down' ? 'Remove bad response' : 'Bad response',
            selected: rating == 'down',
            icon: rating == 'down'
                ? Icon(Icons.thumb_down_alt, size: 18, color: p.text)
                : icon(HugeIcons.strokeRoundedThumbsDown),
            onPressed: persisted ? () => rate('down') : null,
          ),
          _ActionIconButton(
            tooltip: speaking ? 'Stop reading' : 'Read aloud',
            icon: speaking
                ? Icon(Icons.stop_circle_outlined, size: 18, color: p.text)
                : icon(HugeIcons.strokeRoundedVolumeHigh),
            onPressed: onToggleSpeak,
          ),
          _ActionIconButton(
            tooltip: 'Share',
            icon: icon(HugeIcons.strokeRoundedShare08),
            onPressed: () => ref.read(chatDeviceProvider).share(text),
          ),
          Theme(
            data: Theme.of(context).copyWith(
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: SizedBox(
              width: 32,
              height: 32,
              child: PopupMenuButton<String>(
                key: ValueKey('more-${message.id}'),
                tooltip: 'More actions',
                padding: EdgeInsets.zero,
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
                      subtitle:
                          blocked == null ? null : Text(blocked),
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
            ),
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
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(ctx).height * 0.7,
            ),
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


