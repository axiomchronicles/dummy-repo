import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import '../settings/settings_widgets.dart';

// Shared by the monitor, history and call detail pages.

/// "CODE: message" for API errors, plain text otherwise.
String errorText(Object e) =>
    e is ApiException ? '${e.code}: ${e.message}' : e.toString();

/// Server already masks; this guards any raw number that slips through.
String maskPhone(String? v) {
  if (v == null || v.isEmpty) return 'Number hidden';
  return v.contains('•') ? v : v.replaceAll(RegExp(r'.(?=.{4})'), '•');
}

String humanize(String v) {
  final s = v.replaceAll('_', ' ');
  return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

String formatDuration(num? seconds) {
  if (seconds == null) return '—';
  final s = seconds.toInt();
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

String relativeTime(DateTime t, [DateTime? now]) {
  final d = (now ?? DateTime.now()).difference(t.toLocal());
  if (d.inMinutes < 1) return 'Just now';
  if (d.inHours < 1) return '${d.inMinutes}m ago';
  if (d.inDays < 1) return '${d.inHours}h ago';
  if (d.inDays == 1) return 'Yesterday';
  if (d.inDays < 7) return '${d.inDays}d ago';
  return DateFormat('MMM d').format(t.toLocal());
}

/// Semantic colour for a call outcome / status; null means neutral.
Color outcomeColor(AppPalette p, String v) => switch (v) {
  'connected' || 'completed' || 'running' => p.success,
  'no_answer' || 'busy' || 'paused' || 'unknown' => p.warning,
  'failed' => p.danger,
  _ => p.subtle,
};

class StatusDot extends StatelessWidget {
  const StatusDot(this.color, {super.key});
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: 8,
    height: 8,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

/// Pushed page: round back chip, centred title, no app bar.
class MonitorPage extends StatelessWidget {
  const MonitorPage({
    super.key,
    required this.title,
    required this.body,
    this.action,
  });
  final String title;
  final Widget body;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.palette.bg,
    body: SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(
              children: [
                const SettingsBackChip(),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      title,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ),
                action ?? const SizedBox(width: 48),
              ],
            ),
          ),
          Expanded(child: body),
        ],
      ),
    ),
  );
}

/// Round 48px icon chip with a tooltip.
class RoundChipButton extends StatelessWidget {
  const RoundChipButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });
  final List<List<dynamic>> icon;
  final String tooltip;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        excludeSemantics: true,
        child: Material(
          color: p.chip,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(
              width: 48,
              height: 48,
              child: Center(child: HugeIcon(icon: icon, color: p.text, size: 22)),
            ),
          ),
        ),
      ),
    );
  }
}

final callDetailProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, id) async {
      final result = await ref
          .watch(apiClientProvider)
          .get('/api/v1/calls/$id');
      return result as Map<String, dynamic>;
    });

class CallDetailScreen extends ConsumerStatefulWidget {
  final String callId;
  const CallDetailScreen({super.key, required this.callId});
  @override
  ConsumerState<CallDetailScreen> createState() => _CallDetailScreenState();
}

class _CallDetailScreenState extends ConsumerState<CallDetailScreen> {
  final _player = AudioPlayer();
  Timer? _timer;
  StreamSubscription<PlayerState>? _playback;
  bool _playing = false;
  bool _loadingAudio = false;
  bool _loadedAudio = false;
  String? _audioError;
  @override
  void initState() {
    super.initState();
    _playback = _player.onPlayerStateChanged.listen((state) {
      if (mounted) setState(() => _playing = state == PlayerState.playing);
    });
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      final call = ref.read(callDetailProvider(widget.callId)).valueOrNull;
      final artifacts = call?['artifacts'] as Map<String, dynamic>?;
      final analysis = call?['analysis'] as Map<String, dynamic>?;
      if (call != null &&
          (['pending', 'processing'].contains(analysis?['status']) ||
              artifacts?['recordingStatus'] == 'processing' ||
              artifacts?['transcriptStatus'] == 'processing' ||
              [
                'accepted',
                'dispatching',
                'connected',
              ].contains(call['status']))) {
        ref.invalidate(callDetailProvider(widget.callId));
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _playback?.cancel();
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggleAudio() async {
    if (_loadingAudio) return;
    setState(() {
      _loadingAudio = true;
      _audioError = null;
    });
    try {
      if (_playing) {
        await _player.pause();
      } else if (_loadedAudio) {
        await _player.resume();
      } else {
        final bytes = await ref
            .read(apiClientProvider)
            .recording(widget.callId);
        await _player.play(BytesSource(bytes, mimeType: 'audio/wav'));
        _loadedAudio = true;
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _audioError = e is ApiException
              ? errorText(e)
              : 'Provider audio could not be played. Refresh the call and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _loadingAudio = false);
    }
  }

  void _refresh() => ref.invalidate(callDetailProvider(widget.callId));

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(callDetailProvider(widget.callId));
    return MonitorPage(
      title: 'Call result',
      action: RoundChipButton(
        icon: HugeIcons.strokeRoundedRefresh,
        tooltip: 'Refresh call',
        onTap: _refresh,
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: 'Unable to load call',
          detail: errorText(e),
          onRetry: _refresh,
        ),
        data: (call) => RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: _CallBody(
            call: call,
            player: _RecordingBar(
              playing: _playing,
              loading: _loadingAudio,
              onToggle: _toggleAudio,
            ),
            audioError: _audioError,
          ),
        ),
      ),
    );
  }
}

/// Centered message with optional code/detail line and retry.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.message,
    this.detail,
    this.onRetry,
    this.danger = true,
  });
  final String message;
  final String? detail;
  final VoidCallback? onRetry;
  final bool danger;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    return ListView(
      // Scrollable so pull-to-refresh works on empty/error states too.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(32, 120, 32, 32),
      children: [
        Semantics(
          liveRegion: true,
          child: Column(
            children: [
              Text(message, textAlign: TextAlign.center, style: t.titleMedium),
              if (detail != null) ...[
                const SizedBox(height: 8),
                Text(
                  detail!,
                  textAlign: TextAlign.center,
                  style: t.bodySmall?.copyWith(
                    color: danger ? p.danger : p.muted,
                  ),
                ),
              ],
              if (onRetry != null) ...[
                const SizedBox(height: 20),
                FilledButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, this.children);
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 28),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: Theme.of(context).textTheme.labelMedium),
        ),
        const SizedBox(height: 10),
        ...children,
      ],
    ),
  );
}

class _RecordingBar extends StatelessWidget {
  const _RecordingBar({
    required this.playing,
    required this.loading,
    required this.onToggle,
  });
  final bool playing;
  final bool loading;
  final VoidCallback onToggle;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final label = loading
        ? 'Loading authorized audio…'
        : playing
        ? 'Pause recording'
        : 'Play provider recording';
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: p.chip,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: loading ? null : onToggle,
          child: SizedBox(
            height: 52,
            child: Row(
              children: [
                const SizedBox(width: 6),
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: p.text, shape: BoxShape.circle),
                  child: Center(
                    child: loading
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: p.bg,
                            ),
                          )
                        : HugeIcon(
                            icon: playing
                                ? HugeIcons.strokeRoundedPause
                                : HugeIcons.strokeRoundedPlay,
                            color: p.bg,
                            size: 18,
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CallBody extends StatelessWidget {
  const _CallBody({required this.call, required this.player, this.audioError});
  final Map<String, dynamic> call;
  final Widget player;
  final String? audioError;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final analysis = call['analysis'] as Map<String, dynamic>?;
    final artifacts = call['artifacts'] as Map<String, dynamic>?;
    final transcript = (analysis?['transcript'] as List?) ?? const [];
    final fields = (analysis?['extractedFields'] as Map?) ?? const {};
    final simulated = call['mode'] == 'simulation';
    final outcome = (call['outcome'] ?? call['status'] ?? 'unknown').toString();
    final analysisStatus = analysis?['status']?.toString();
    final processing = ['pending', 'processing'].contains(analysisStatus);
    final recording = artifacts?['recordingStatus']?.toString();
    final transcriptStatus = artifacts?['transcriptStatus']?.toString();

    Widget line(String label, String value) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 120, child: Text(label, style: t.bodySmall)),
          Expanded(child: Text(value, style: t.bodyMedium)),
        ],
      ),
    );

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        ModeTag(simulated: simulated, fixture: true),
        const SizedBox(height: 14),
        Row(
          children: [
            StatusDot(outcomeColor(p, outcome)),
            const SizedBox(width: 10),
            Text(humanize(outcome), style: t.headlineSmall),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          '${formatDuration(call['durationSeconds'] as num?)} · Attempt ${call['id']}',
          style: t.bodySmall,
        ),
        _Section('Summary', [
          Text(
            analysis?['summary']?.toString() ??
                (processing
                    ? 'Analysis is processing. This page refreshes automatically.'
                    : 'Analysis is not available. No answer is inferred from connection alone.'),
            style: t.bodyMedium?.copyWith(
              color: analysis?['summary'] == null ? p.muted : null,
            ),
          ),
        ]),
        _Section('Disposition', [
          line('Outcome', humanize(outcome)),
          line('Call status', humanize(call['status']?.toString() ?? 'unknown')),
          if (analysisStatus != null) line('Analysis', humanize(analysisStatus)),
          if (call['failureCode'] != null)
            line('Failure', call['failureCode'].toString()),
          for (final e in fields.entries)
            line(humanize(e.key.toString()), e.value?.toString() ?? 'Unknown'),
          line('Operation', '${call['campaignId'] ?? '—'}'),
        ]),
        _Section('Recording', [
          if (!simulated && recording == 'available')
            player
          else
            Text(
              simulated
                  ? 'No telephone recording exists for a simulation.'
                  : recording == 'processing'
                  ? 'The provider recording is still processing.'
                  : 'Recording ${recording ?? 'unavailable'}.',
              style: t.bodyMedium?.copyWith(color: p.muted),
            ),
          if (audioError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Semantics(
                liveRegion: true,
                child: Text(audioError!, style: t.bodySmall?.copyWith(color: p.danger)),
              ),
            ),
        ]),
        _Section('Transcript', [
          if (transcript.isEmpty)
            Text(
              transcriptStatus == 'processing' || processing
                  ? 'No transcript yet. Provider analysis is processing.'
                  : 'No transcript is available. No recipient answer has been established.',
              style: t.bodyMedium?.copyWith(color: p.muted),
            ),
          for (final raw in transcript)
            Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (raw as Map)['role'] == 'user'
                        ? 'Recipient'
                        : (simulated ? 'AI agent · simulated' : 'AI agent'),
                    style: t.labelMedium?.copyWith(
                      color: raw['role'] == 'user' ? p.text : p.muted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(raw['text']?.toString() ?? '', style: t.bodyLarge),
                ],
              ),
            ),
        ]),
      ],
    );
  }
}

/// SIMULATION is neutral; REAL CALL uses the warning tint.
class ModeTag extends StatelessWidget {
  const ModeTag({super.key, required this.simulated, this.fixture = false});
  final bool simulated;
  final bool fixture;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final fg = simulated ? p.muted : p.warning;
    final label = simulated
        ? (fixture ? 'SIMULATION · TEST FIXTURE' : 'SIMULATION')
        : 'REAL CALL';
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: simulated ? p.chip : p.warning.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.4,
            color: fg,
          ),
        ),
      ),
    );
  }
}
