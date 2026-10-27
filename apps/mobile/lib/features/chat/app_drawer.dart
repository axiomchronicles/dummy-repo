import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import '../history/call_detail_screen.dart' show RoundChipButton;
import 'chat_models.dart';
import 'chat_provider.dart';

const _recentLimit = 8;

String initials(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty);
  final letters = parts.take(2).map((s) => s[0].toUpperCase()).join();
  return letters.isEmpty ? 'U' : letters;
}

Route<void> _route(BuildContext context, Widget page) =>
    MediaQuery.of(context).disableAnimations
    ? PageRouteBuilder(
        pageBuilder: (_, _, _) => page,
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
      )
    : MaterialPageRoute(builder: (_) => page);

class AppDrawer extends ConsumerWidget {
  final VoidCallback onNavigateToCampaigns;
  final VoidCallback onNavigateToHistory;
  final VoidCallback onNavigateToSettings;
  final VoidCallback onNavigateToAgents;

  const AppDrawer({
    super.key,
    required this.onNavigateToCampaigns,
    required this.onNavigateToHistory,
    required this.onNavigateToSettings,
    required this.onNavigateToAgents,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final user = ref.watch(authProvider).user;
    final chat = ref.watch(chatProvider);
    final threads = chat.threads;
    final recent = threads.take(_recentLimit).toList();

    // Closes the drawer, then runs [then] (navigation) from the home context.
    void close(VoidCallback then) {
      Navigator.of(context).pop();
      then();
    }

    void openSearch() {
      final nav = Navigator.of(context);
      final route = _route(context, const ThreadSearchPage());
      nav.pop();
      nav.push(route);
    }

    return Drawer(
      backgroundColor: p.surface,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: App title + search button
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        'Outreach',
                        style: t.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          fontSize: 22,
                        ),
                      ),
                    ),
                  ),
                  RoundChipButton(
                    icon: HugeIcons.strokeRoundedSearch01,
                    tooltip: 'Search chats',
                    onTap: openSearch,
                  ),
                ],
              ),
            ),
            // Nav items — ChatGPT drawer style
            _NavRow(
              icon: HugeIcons.strokeRoundedMegaphone01,
              title: 'Campaigns',
              onTap: () => close(onNavigateToCampaigns),
            ),
            _NavRow(
              icon: HugeIcons.strokeRoundedBookOpen01,
              title: 'History',
              onTap: () => close(onNavigateToHistory),
            ),
            _NavRow(
              icon: HugeIcons.strokeRoundedFolderLibrary,
              title: 'Agents',
              onTap: () => close(onNavigateToAgents),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Divider(color: p.hairline),
            ),
            // Recent chats section
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
              child: Semantics(header: true, child: Text('Recent', style: t.labelMedium)),
            ),
            Expanded(
              child: recent.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text('No chats yet', style: t.bodySmall),
                    )
                  : ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      children: [
                        for (final thread in recent)
                          ThreadRow(
                            thread: thread,
                            active: chat.activeThread?.id == thread.id,
                            onTap: () {
                              ref.read(chatProvider.notifier).selectThread(thread);
                              Navigator.of(context).pop();
                            },
                          ),
                        if (threads.length > _recentLimit)
                          _NavRow(
                            icon: HugeIcons.strokeRoundedArrowRight01,
                            title: 'See all…',
                            muted: true,
                            onTap: openSearch,
                          ),
                      ],
                    ),
            ),
            // Bottom bar — ChatGPT style: [Chat pill] [Avatar] [Waveform FAB]
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 12, 12),
              child: Row(
                children: [
                  // Blue "Chat" pill button
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: p.accent,
                      foregroundColor: p.onAccent,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      minimumSize: const Size(0, 44),
                    ),
                    icon: HugeIcon(icon: HugeIcons.strokeRoundedPencilEdit02, color: p.onAccent, size: 18),
                    label: const Text('Chat', style: TextStyle(fontWeight: FontWeight.w600)),
                    onPressed: () {
                      ref.read(chatProvider.notifier).createNewThread();
                      Navigator.of(context).pop();
                    },
                  ),
                  const Spacer(),
                  // Avatar → Settings
                  _Avatar(
                    initials: initials(user?.name),
                    name: user?.name,
                    onTap: () => close(onNavigateToSettings),
                  ),
                  const SizedBox(width: 4),
                  // Waveform / voice FAB
                  _WaveformFab(palette: p),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavRow extends StatelessWidget {
  const _NavRow({required this.icon, required this.title, required this.onTap, this.muted = false});
  final List<List<dynamic>> icon;
  final String title;
  final VoidCallback onTap;
  final bool muted;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final color = muted ? p.muted : p.text;
    return Semantics(
      button: true,
      label: title,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          height: 48,
          child: Row(children: [
            const SizedBox(width: 20),
            HugeIcon(icon: icon, color: color, size: 22),
            const SizedBox(width: 16),
            Expanded(
              child: Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: color)),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Plain chat-thread row; long-press opens rename/delete.
class ThreadRow extends ConsumerWidget {
  const ThreadRow({super.key, required this.thread, required this.active, required this.onTap});
  final ChatThread thread;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    return Semantics(
      button: true,
      selected: active,
      label: thread.title,
      hint: 'Long press for rename or delete',
      excludeSemantics: true,
      child: Material(
        color: active ? p.group : Colors.transparent,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          onLongPress: () => showThreadActions(context, ref, thread),
          child: SizedBox(
            height: 48,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(thread.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                        )),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials, required this.name, required this.onTap});
  final String initials;
  final String? name;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: 'Settings',
      child: Semantics(
        button: true,
        label: 'Settings${name == null || name!.isEmpty ? '' : ', $name'}',
        excludeSemantics: true,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: CircleAvatar(
                radius: 18,
                backgroundColor: p.chip,
                child: Text(initials,
                    style: TextStyle(color: p.text, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Animated waveform FAB (blue circle with 4 vertical bars that pulse).
class _WaveformFab extends StatefulWidget {
  const _WaveformFab({required this.palette});
  final AppPalette palette;

  @override
  State<_WaveformFab> createState() => _WaveformFabState();
}

class _WaveformFabState extends State<_WaveformFab> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    return Tooltip(
      message: 'Voice mode',
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: p.accent, shape: BoxShape.circle),
        child: Center(
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (context, child) {
              final bars = [0.5, 1.0, 0.7, 0.85, 0.55];
              return Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  for (int i = 0; i < bars.length; i++) ...[
                    if (i > 0) const SizedBox(width: 2),
                    Container(
                      width: 3,
                      height: 4 + 12 * ((math.sin((_ctrl.value * 2 * math.pi) + i * 1.2) + 1) / 2 * bars[i]),
                      decoration: BoxDecoration(
                        color: p.onAccent,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Rename / Delete sheet. Returns true when the thread list changed.
Future<String?> _renameSheet(BuildContext context, String current) async {
  final p = context.palette;
  final ctrl = TextEditingController(text: current);
  final result = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: p.surface,
    builder: (c) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Rename chat',
                  style: Theme.of(c).textTheme.titleMedium),
              const SizedBox(height: 12),
              TextField(
                controller: ctrl,
                autofocus: true,
                maxLength: 120,
                decoration: const InputDecoration(hintText: 'Chat title'),
                onSubmitted: (v) => Navigator.pop(c, v),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(c),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: () => Navigator.pop(c, ctrl.text),
                    child: const Text('Rename'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
  ctrl.dispose();
  return result;
}

/// Full-screen thread search page.
class ThreadSearchPage extends ConsumerStatefulWidget {
  const ThreadSearchPage({super.key});
  @override
  ConsumerState<ThreadSearchPage> createState() => _ThreadSearchPageState();
}

class _ThreadSearchPageState extends ConsumerState<ThreadSearchPage> {
  final _ctrl = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final threads = ref.watch(chatProvider).threads;
    final filtered = _q.isEmpty
        ? threads
        : threads.where((t) => t.title.toLowerCase().contains(_q.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: p.bg,
      appBar: AppBar(
        backgroundColor: p.bg,
        title: TextField(
          controller: _ctrl,
          autofocus: true,
          style: TextStyle(color: p.text, fontSize: 16),
          decoration: InputDecoration(
            hintText: 'Search chats',
            hintStyle: TextStyle(color: p.subtle),
            border: InputBorder.none,
            filled: false,
          ),
          onChanged: (v) => setState(() => _q = v.trim()),
        ),
      ),
      body: ListView.builder(
        itemCount: filtered.length,
        itemBuilder: (_, i) {
          final thread = filtered[i];
          return ListTile(
            title: Text(thread.title, style: TextStyle(color: p.text)),
            onTap: () {
              ref.read(chatProvider.notifier).selectThread(thread);
              Navigator.of(context).pop();
            },
          );
        },
      ),
    );
  }
}

/// Rename / Delete sheet. Returns true when the thread list changed.
Future<bool> showThreadActions(BuildContext context, WidgetRef ref, ChatThread thread) async {
  final p = context.palette;
  final choice = await showModalBottomSheet<String>(
    context: context,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: HugeIcon(icon: HugeIcons.strokeRoundedEdit02, color: p.text, size: 22),
          title: const Text('Rename'),
          onTap: () => Navigator.pop(c, 'rename'),
        ),
        ListTile(
          leading: HugeIcon(icon: HugeIcons.strokeRoundedDelete02, color: p.danger, size: 22),
          title: Text('Delete', style: TextStyle(color: p.danger)),
          onTap: () => Navigator.pop(c, 'delete'),
        ),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (!context.mounted || choice == null) return false;
  final notifier = ref.read(chatProvider.notifier);
  if (choice == 'rename') {
    final title = await _renameSheet(context, thread.title);
    if (title == null || title.trim().isEmpty) return false;
    await notifier.renameThread(thread.id, title);
    return true;
  }
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Delete chat?'),
      content: Text('“${thread.title}” will be deleted. This cannot be undone.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.pop(c, true),
          style: TextButton.styleFrom(foregroundColor: p.danger),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
  if (ok != true) return false;
  await notifier.deleteThread(thread.id);
  return true;
}
