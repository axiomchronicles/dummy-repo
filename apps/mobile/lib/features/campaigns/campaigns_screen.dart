import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import '../history/call_detail_screen.dart';

class CampaignItem {
  final String id;
  final String name;
  final String status;
  final String mode;
  final String? agentName;
  final int totalContacts;
  final int completedContacts;
  final int? eligibleCount;

  /// 'LEGACY_PLAN_INVALID' when the stored plan must be re-planned.
  final String? planIssue;
  final DateTime createdAt;

  CampaignItem({
    required this.id,
    required this.name,
    required this.status,
    required this.mode,
    this.agentName,
    required this.totalContacts,
    required this.completedContacts,
    this.eligibleCount,
    this.planIssue,
    required this.createdAt,
  });

  bool get needsReplan => planIssue == 'LEGACY_PLAN_INVALID';
  bool get simulated => mode != 'live';
  bool get active => status == 'running' || status == 'paused';

  factory CampaignItem.fromJson(Map<String, dynamic> json) {
    int count(String a, String b) => ((json[a] ?? json[b]) as num?)?.toInt() ?? 0;
    final plan = json['plan'];
    final created = (json['createdAt'] ?? json['created_at'])?.toString();
    return CampaignItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Untitled Campaign',
      status: json['status'] as String? ?? 'draft',
      mode: json['mode'] as String? ?? 'simulation',
      agentName: (json['agentName'] ?? json['agent_name']) as String?,
      totalContacts: count('totalContacts', 'total_contacts'),
      completedContacts: count('completedContacts', 'completed_contacts'),
      eligibleCount: plan is Map ? (plan['eligibleCount'] as num?)?.toInt() : null,
      planIssue: (json['planIssue'] ?? json['plan_issue']) as String?,
      createdAt: DateTime.tryParse(created ?? '') ?? DateTime.now(),
    );
  }
}

final campaignsProvider = FutureProvider.autoDispose<List<CampaignItem>>((
  ref,
) async {
  final apiClient = ref.watch(apiClientProvider);
  final res = await apiClient.get('/api/v1/campaigns');
  if (res == null || res['items'] == null) return [];
  final items = res['items'] as List<dynamic>;
  return items
      .map((e) => CampaignItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// Campaign detail (progress + outcomes) and its attempts, fetched together.
final campaignDetailProvider = FutureProvider.autoDispose.family<
  ({Map<String, dynamic> detail, List<Map<String, dynamic>> attempts}),
  String
>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final results = await Future.wait([
    api.get('/api/v1/campaigns/$id'),
    api.get('/api/v1/campaigns/$id/attempts'),
  ]);
  final attempts = (results[1]?['items'] as List?) ?? const [];
  return (
    detail: (results[0] as Map).cast<String, dynamic>(),
    attempts: attempts.cast<Map<String, dynamic>>(),
  );
});

Color campaignStatusColor(AppPalette p, String status) => switch (status) {
  'running' || 'completed' => p.success,
  'paused' => p.warning,
  'failed' => p.danger,
  _ => p.subtle,
};

class CampaignsScreen extends ConsumerStatefulWidget {
  const CampaignsScreen({super.key});

  @override
  ConsumerState<CampaignsScreen> createState() => _CampaignsScreenState();
}

class _CampaignsScreenState extends ConsumerState<CampaignsScreen> {
  Timer? _refresh;
  @override
  void initState() {
    super.initState();
    _refresh = Timer.periodic(const Duration(seconds: 4), (_) {
      final rows = ref.read(campaignsProvider).valueOrNull;
      if (rows?.any((row) => row.active) ?? false) {
        ref.invalidate(campaignsProvider);
      }
    });
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  void _reload() => ref.invalidate(campaignsProvider);

  @override
  Widget build(BuildContext context) {
    final campaigns = ref.watch(campaignsProvider);
    return MonitorPage(
      title: 'Campaigns',
      action: RoundChipButton(
        icon: HugeIcons.strokeRoundedRefresh,
        tooltip: 'Refresh campaigns',
        onTap: _reload,
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: campaigns.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(
            message: 'Couldn’t load campaigns',
            detail: errorText(e),
            onRetry: _reload,
          ),
          data: (rows) {
            if (rows.isEmpty) {
              return const ErrorState(
                danger: false,
                message: 'No campaigns yet',
                detail: 'Describe an outreach task in chat to prepare one.',
              );
            }
            final live = rows.where((c) => c.active).toList();
            final rest = rows.where((c) => !c.active).toList();
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
              children: [
                StatStrip({
                  'Campaigns': '${rows.length}',
                  'Running': '${rows.where((c) => c.status == 'running').length}',
                  'Contacts': '${rows.fold<int>(0, (s, c) => s + c.totalContacts)}',
                  'Completed': '${rows.fold<int>(0, (s, c) => s + c.completedContacts)}',
                }),
                if (live.isNotEmpty) ...[
                  const GroupHeader('Live monitor'),
                  Group([for (final c in live) _CampaignRow(c)]),
                ],
                if (rest.isNotEmpty) ...[
                  GroupHeader(live.isEmpty ? 'All campaigns' : 'Other campaigns'),
                  Group([for (final c in rest) _CampaignRow(c)]),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Plain numbers over muted labels, evenly spaced.
class StatStrip extends StatelessWidget {
  const StatStrip(this.stats, {super.key});
  final Map<String, String> stats;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Wrap(
        spacing: 24,
        runSpacing: 12,
        children: [
          for (final e in stats.entries)
            Semantics(
              label: '${e.key}: ${e.value}',
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(e.value, style: t.titleLarge),
                  Text(e.key, style: t.labelSmall),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class GroupHeader extends StatelessWidget {
  const GroupHeader(this.title, {super.key});
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
    child: Semantics(
      header: true,
      child: Text(title, style: Theme.of(context).textTheme.labelMedium),
    ),
  );
}

/// Rounded p.group container with hairline separators.
class Group extends StatelessWidget {
  const Group(this.children, {super.key});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Material(
        color: p.group,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 0.5, indent: 16, color: p.hairline),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

class _CampaignRow extends StatelessWidget {
  const _CampaignRow(this.c);
  final CampaignItem c;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final progress = c.totalContacts > 0 ? c.completedContacts / c.totalContacts : 0.0;
    final status = c.needsReplan ? 'Re-plan needed' : humanize(c.status);
    return Semantics(
      button: true,
      label: '${c.name}, ${c.simulated ? 'simulation' : 'real call'}, $status, '
          '${c.completedContacts} of ${c.totalContacts} done',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CampaignDetailScreen(campaign: c)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodyLarge),
                        ),
                        const SizedBox(width: 8),
                        ModeTag(simulated: c.simulated),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        StatusDot(c.needsReplan ? p.warning : campaignStatusColor(p, c.status)),
                        const SizedBox(width: 6),
                        Text(
                          status,
                          style: t.bodySmall?.copyWith(color: c.needsReplan ? p.warning : null),
                        ),
                        Text(' · ${c.completedContacts}/${c.totalContacts}', style: t.bodySmall),
                        if (c.agentName != null)
                          Flexible(
                            child: Text(' · ${c.agentName}',
                                maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodySmall),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: LinearProgressIndicator(value: progress, minHeight: 3),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              HugeIcon(icon: HugeIcons.strokeRoundedArrowRight01, color: p.subtle, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class CampaignDetailScreen extends ConsumerStatefulWidget {
  const CampaignDetailScreen({super.key, required this.campaign});
  final CampaignItem campaign;
  @override
  ConsumerState<CampaignDetailScreen> createState() => _CampaignDetailScreenState();
}

class _CampaignDetailScreenState extends ConsumerState<CampaignDetailScreen> {
  Timer? _poll;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(const Duration(seconds: 4), (_) {
      final status = ref.read(campaignDetailProvider(widget.campaign.id)).valueOrNull?.detail['status'];
      if (status == 'running' || status == 'paused') _reload();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _reload() => ref.invalidate(campaignDetailProvider(widget.campaign.id));

  Future<void> _action(String name) async {
    final messenger = ScaffoldMessenger.of(context);
    if (name == 'cancel' && !await _confirmCancel()) return;
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post('/api/v1/campaigns/${widget.campaign.id}/$name');
      ref.invalidate(campaignsProvider);
      _reload();
      messenger.showSnackBar(SnackBar(content: Text('Campaign ${name == 'cancel' ? 'cancelled' : '${name}d'}.')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Action failed. ${errorText(e)}')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _confirmCancel() async {
    final p = context.palette;
    return await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Cancel campaign?'),
            content: const Text('Queued calls are cancelled. Calls already in progress may finish. This cannot be undone.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')),
              TextButton(
                onPressed: () => Navigator.pop(c, true),
                style: TextButton.styleFrom(foregroundColor: p.danger),
                child: const Text('Cancel campaign'),
              ),
            ],
          ),
        ) ??
        false;
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(campaignDetailProvider(widget.campaign.id));
    return MonitorPage(
      title: widget.campaign.name,
      action: RoundChipButton(icon: HugeIcons.strokeRoundedRefresh, tooltip: 'Refresh campaign', onTap: _reload),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Couldn’t load campaign', detail: errorText(e), onRetry: _reload),
          data: (d) => _detailBody(context, d.detail, d.attempts),
        ),
      ),
    );
  }

  Widget _detailBody(BuildContext context, Map<String, dynamic> detail, List<Map<String, dynamic>> attempts) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final c = CampaignItem.fromJson({...detail, 'id': widget.campaign.id});
    final progress = (detail['progress'] as Map?) ?? const {};
    final outcomes = (detail['outcomes'] as Map?) ?? const {};
    int n(Map m, String k) => (m[k] as num?)?.toInt() ?? 0;
    final status = c.needsReplan ? 'Re-plan needed' : humanize(c.status);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
      children: [
        Row(children: [
          ModeTag(simulated: c.simulated),
          const SizedBox(width: 10),
          StatusDot(c.needsReplan ? p.warning : campaignStatusColor(p, c.status)),
          const SizedBox(width: 6),
          Text(status, style: t.bodyMedium?.copyWith(color: c.needsReplan ? p.warning : null)),
        ]),
        if (c.needsReplan)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              'This campaign was prepared with an older plan format. Ask the assistant to re-plan it before any calls are placed.',
              style: t.bodySmall,
            ),
          ),
        StatStrip({
          'Eligible': c.eligibleCount?.toString() ?? '—',
          'Queued': '${n(progress, 'queued') + n(progress, 'pending')}',
          'Attempted': '${attempts.length}',
          'Connected': '${n(outcomes, 'connected')}',
          'Completed': '${n(progress, 'completed')}',
          'Failed': '${n(outcomes, 'failed')}',
        }),
        if (detail['activeCallsMayContinue'] == true)
          Text('Calls already in progress may still finish.', style: t.bodySmall?.copyWith(color: p.warning)),
        _controls(c),
        const GroupHeader('Attempts'),
        if (attempts.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
            child: Text('No attempt has been dispatched for this campaign.', style: t.bodyMedium?.copyWith(color: p.muted)),
          )
        else
          Group([for (final a in attempts) _AttemptRow(a)]),
      ],
    );
  }

  Widget _controls(CampaignItem c) {
    final p = context.palette;
    final buttons = <Widget>[
      if (!c.needsReplan && c.status == 'running')
        OutlinedButton(onPressed: _busy ? null : () => _action('pause'), child: const Text('Pause')),
      if (!c.needsReplan && c.status == 'paused')
        FilledButton(onPressed: _busy ? null : () => _action('resume'), child: const Text('Resume')),
      if (['draft', 'planned', 'running', 'paused'].contains(c.status))
        OutlinedButton(
          onPressed: _busy ? null : () => _action('cancel'),
          style: OutlinedButton.styleFrom(foregroundColor: p.danger),
          child: const Text('Cancel'),
        ),
    ];
    if (buttons.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Wrap(spacing: 10, runSpacing: 10, children: buttons),
    );
  }
}

/// One attempts-timeline row; opens the call result.
class _AttemptRow extends StatelessWidget {
  const _AttemptRow(this.a);
  final Map<String, dynamic> a;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final outcome = (a['outcome'] ?? a['status'] ?? 'unknown').toString();
    final started = DateTime.tryParse('${a['startedAt'] ?? a['createdAt']}');
    final meta = [
      formatDuration(a['durationSeconds'] as num?),
      if (started != null) relativeTime(started),
      if (a['failureCode'] != null) a['failureCode'].toString(),
    ].join(' · ');
    return Semantics(
      button: true,
      label: '${humanize(outcome)}, $meta',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CallDetailScreen(callId: a['id'] as String)),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
            child: Row(children: [
              StatusDot(outcomeColor(p, outcome)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(humanize(outcome), style: t.bodyMedium),
                    Text(meta, style: t.bodySmall),
                  ],
                ),
              ),
              HugeIcon(icon: HugeIcons.strokeRoundedArrowRight01, color: p.subtle, size: 18),
            ]),
          ),
        ),
      ),
    );
  }
}
