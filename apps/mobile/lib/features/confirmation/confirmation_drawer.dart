import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/api_client.dart';
import '../auth/auth_provider.dart';
import '../chat/chat_models.dart';

/// Short, mode-specific CTA labels. Kept short so they never wrap mid-word.
String launchLabel(CampaignDraft draft) =>
    draft.isLive ? 'Place real call' : 'Run simulation';

const _terminal = {'completed', 'failed', 'cancelled', 'blocked'};

class ConfirmationDrawer extends ConsumerStatefulWidget {
  final CampaignDraft draft;

  /// Called when the operator chooses to follow the accepted operation.
  final VoidCallback onConfirmed;
  final VoidCallback onDismissed;

  /// Interval for reading the persisted operation status after acceptance.
  final Duration pollInterval;
  const ConfirmationDrawer({
    super.key,
    required this.draft,
    required this.onConfirmed,
    required this.onDismissed,
    this.pollInterval = const Duration(seconds: 2),
  });
  @override
  ConsumerState<ConfirmationDrawer> createState() => _ConfirmationDrawerState();
}

class _ConfirmationDrawerState extends ConsumerState<ConfirmationDrawer> {
  /// null = not submitted; 'pending' = request in flight; otherwise backend status.
  String? _status;
  String? _operationId;
  String? _error;

  // Deterministic per plan+mode: a repeated tap or retry replays the same
  // launch on the server instead of creating a second one.
  late final String _key =
      'call-${widget.draft.campaignId}-${widget.draft.mode}';

  bool get _active =>
      _status != null && _status != 'failed' && _status != 'blocked';

  Future<bool> _confirmRealCall() async {
    final name = widget.draft.targetText('name') ?? 'this recipient';
    final destination = widget.draft.targetText('destinationMasked') ?? '';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Place a real call?'),
        content: Text(
          'This dials $name${destination.isEmpty ? '' : ' at $destination'} '
          'from a real phone line. It cannot be undone once dispatched.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Call $name'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _launch() async {
    if (_active) return;
    final draft = widget.draft;
    if (draft.isLive && !await _confirmRealCall()) return;
    if (!mounted) return;
    setState(() {
      _status = 'pending';
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    try {
      final result = await api.post(
        '/api/v1/campaigns/${draft.campaignId}/${draft.isLive ? 'launch' : 'simulate'}',
        body: {'confirmed': true, 'planSnapshotHash': draft.planSnapshotHash},
        headers: {'Idempotency-Key': _key},
      );
      final id = result is Map ? result['operationId']?.toString() : null;
      if (id == null) {
        throw StateError('The server did not return an operation ID.');
      }
      if (!mounted) return;
      setState(() {
        _operationId = id;
        _status = result['status']?.toString() ?? 'running';
      });
      await _follow(api, id);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        // 4xx domain refusals (stale plan, live disabled, …) are blocks, not crashes.
        _status = e.statusCode == 403 || e.statusCode == 409
            ? 'blocked'
            : 'failed';
        _error = '${e.code}: ${e.message}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _status = 'failed';
        _error = e.toString();
      });
    }
  }

  /// Reads the persisted campaign status until it reaches a terminal state.
  Future<void> _follow(ApiClient api, String id) async {
    while (mounted && !_terminal.contains(_status)) {
      await Future<void>.delayed(widget.pollInterval);
      if (!mounted) return;
      try {
        final detail = await api.get('/api/v1/campaigns/$id');
        final status = detail is Map ? detail['status']?.toString() : null;
        if (mounted && status != null && status != _status) {
          setState(() => _status = status);
        }
      } on ApiException catch (e) {
        if (mounted) setState(() => _error = '${e.code}: ${e.message}');
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = context.palette;
    final draft = widget.draft;
    final blockers = draft.blockers;
    final canLaunch = draft.launchable && !_active;
    return Material(
      color: p.surface,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      clipBehavior: Clip.antiAlias,
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .9,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 10),
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: p.subtle,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          draft.isLive ? 'Review real call' : 'Review simulation',
                          style: theme.textTheme.titleLarge,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close review',
                      onPressed: _status == 'pending'
                          ? null
                          : widget.onDismissed,
                      icon: HugeIcon(
                        icon: HugeIcons.strokeRoundedCancel01,
                        color: p.muted,
                        size: 22,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: _ModeChip(live: draft.isLive),
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: PlanDetails(draft: draft),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_status != null) _statusLine(theme, p),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            _error!,
                            style: theme.textTheme.bodySmall
                                ?.copyWith(color: p.danger),
                          ),
                        ),
                      ),
                    if (!draft.launchable && _status == null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          blockers.isNotEmpty
                              ? 'Resolve the blockers above before launching.'
                              : 'This plan has no single eligible recipient.',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    if (_operationId != null &&
                        (_status == 'running' ||
                            _status == 'completed' ||
                            _status == 'paused'))
                      OutlinedButton(
                        onPressed: widget.onConfirmed,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(52),
                        ),
                        child: const Text('Open monitor'),
                      )
                    else
                      FilledButton(
                        onPressed: canLaunch ? _launch : null,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(52),
                        ),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            _status == 'pending'
                                ? 'Submitting…'
                                : _status == 'failed' || _status == 'blocked'
                                ? 'Try again'
                                : launchLabel(draft),
                            maxLines: 1,
                            softWrap: false,
                          ),
                        ),
                      ),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: _status == 'pending'
                          ? null
                          : widget.onDismissed,
                      style: TextButton.styleFrom(foregroundColor: p.muted),
                      child: const Text('Back to conversation'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusLine(ThemeData theme, AppPalette p) {
    final busy = _status == 'pending' || _status == 'running';
    final bad = _status == 'failed' || _status == 'blocked';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Semantics(
        liveRegion: true,
        child: Row(
          children: [
            if (busy)
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              HugeIcon(
                icon: bad
                    ? HugeIcons.strokeRoundedAlert02
                    : HugeIcons.strokeRoundedCheckmarkCircle02,
                size: 16,
                color: bad ? p.danger : p.success,
              ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Status: $_status'
                '${_operationId == null ? '' : ' · Operation $_operationId'}',
                style: theme.textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Simulation = neutral chip; real call = warning-tinted chip. No red.
class _ModeChip extends StatelessWidget {
  final bool live;
  const _ModeChip({required this.live});
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final label = live
        ? 'REAL CALL · A PHONE WILL RING'
        : 'SIMULATION · NO TELEPHONE IS DIALED';
    return Semantics(
      label: live ? 'Real call. A phone will ring.' : 'Simulation. No telephone is dialed.',
      excludeSemantics: true,
      child: Container(
        key: ValueKey(live ? 'mode-live' : 'mode-simulation'),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: live ? p.warning.withValues(alpha: 0.16) : p.chip,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          HugeIcon(
            icon: live
                ? HugeIcons.strokeRoundedCallOutgoing01
                : HugeIcons.strokeRoundedTestTube01,
            color: live ? p.warning : p.muted,
            size: 14,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
                color: live ? p.text : p.muted,
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Exactly what will be executed: the single resolved target from the draft.
class PlanDetails extends StatelessWidget {
  final CampaignDraft draft;
  const PlanDetails({super.key, required this.draft});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = context.palette;
    String t(String key, String fallback) => draft.targetText(key) ?? fallback;
    final voice = [
      draft.targetText('voiceId'),
      draft.targetText('voiceModel'),
    ].whereType<String>().join(' · ');
    final blockers = draft.blockers;
    final rows = <Widget>[
      _Row(HugeIcons.strokeRoundedUser, 'Recipient', t('name', 'Unresolved recipient')),
      _Row(HugeIcons.strokeRoundedTelephone, 'Destination',
          t('destinationMasked', 'Unresolved')),
      _Row(HugeIcons.strokeRoundedCallOutgoing01, 'Outbound caller ID',
          t('callerIdMasked', 'Not configured')),
      _Row(HugeIcons.strokeRoundedRobot01, 'Agent', draft.agentName),
      _Row(HugeIcons.strokeRoundedVoice, 'Voice',
          '${voice.isEmpty ? 'Provider voice not synchronized' : voice} · ${t('language', draft.agentLanguage)}',
          stacked: true),
      _Row(HugeIcons.strokeRoundedToggleOn, 'Mode',
          draft.isLive ? 'Real call' : 'Simulation'),
      _Row(HugeIcons.strokeRoundedTarget02, 'Objective', draft.objective,
          stacked: true),
      _Row(HugeIcons.strokeRoundedCalendar03, 'Date / time zone',
          '${t('scheduledAt', 'After confirmation')} · ${t('timezone', 'Time zone unspecified')}',
          stacked: true),
      if (draft.targetText('eventDate') != null)
        _Row(HugeIcons.strokeRoundedCalendar01, 'Event date', t('eventDate', '')),
      _Row(HugeIcons.strokeRoundedUserCheck01, 'Eligibility',
          '${draft.eligibleCount} eligible · ${draft.excludedCount} excluded'),
      if (draft.targetText('recordingNotice') != null)
        _Row(HugeIcons.strokeRoundedMic01, 'Recording', t('recordingNotice', ''),
            stacked: true),
      if (blockers.isNotEmpty)
        _Row(HugeIcons.strokeRoundedAlert02, 'Blockers',
            blockers.map((b) => '• $b').join('\n'),
            stacked: true, tone: p.danger),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: ColoredBox(
            color: p.group,
            child: Column(children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0)
                  Divider(height: 0.5, thickness: 0.5, indent: 52, color: p.hairline),
                rows[i],
              ],
            ]),
          ),
        ),
        if (draft.steps.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
            child: Semantics(
              header: true,
              child: Text('Steps', style: theme.textTheme.labelMedium),
            ),
          ),
          for (final step in draft.steps)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
              child: Text('• $step', style: theme.textTheme.bodySmall),
            ),
        ],
      ],
    );
  }
}

/// ~56px review row: icon, label, muted value (stacked under for long text).
class _Row extends StatelessWidget {
  final List<List<dynamic>> icon;
  final String label, value;
  final bool stacked;
  final Color? tone;
  const _Row(this.icon, this.label, this.value, {this.stacked = false, this.tone});
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final labelText = Text(label, style: text.bodyMedium?.copyWith(color: p.text));
    final valueText = Text(
      value,
      textAlign: stacked ? TextAlign.start : TextAlign.end,
      style: text.bodyMedium?.copyWith(color: tone ?? p.muted, height: 1.35),
    );
    return Semantics(
      label: '$label: $value',
      excludeSemantics: true,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment:
                stacked ? CrossAxisAlignment.start : CrossAxisAlignment.center,
            children: [
              HugeIcon(icon: icon, color: tone ?? p.text, size: 20),
              const SizedBox(width: 16),
              Expanded(
                child: stacked
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [labelText, const SizedBox(height: 2), valueText],
                      )
                    : Row(children: [
                        Flexible(flex: 2, child: labelText),
                        const SizedBox(width: 12),
                        Expanded(flex: 3, child: valueText),
                      ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
