import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import 'call_detail_screen.dart';

class CallHistoryItem {
  final String id;
  final String campaignId;
  final String campaignName;
  final String? contactName;
  final String? contactPhone;
  final String status;
  final String? outcome;
  final String mode;
  final int durationSeconds;
  final DateTime createdAt;

  CallHistoryItem({
    required this.id,
    required this.campaignId,
    required this.campaignName,
    this.contactName,
    this.contactPhone,
    required this.status,
    this.outcome,
    required this.mode,
    required this.durationSeconds,
    required this.createdAt,
  });

  factory CallHistoryItem.fromJson(Map<String, dynamic> json) {
    return CallHistoryItem(
      id: json['id'] as String,
      campaignId: (json['campaignId'] ?? json['campaign_id']) as String? ?? '',
      campaignName:
          (json['campaignName'] ?? json['campaign_name']) as String? ??
          'Outreach Campaign',
      contactName: (json['contactName'] ?? json['contact_name']) as String?,
      contactPhone: (json['contactPhone'] ?? json['contact_phone']) as String?,
      status: json['status'] as String? ?? 'unknown',
      outcome: json['outcome'] as String?,
      mode: json['mode'] as String? ?? 'simulation',
      durationSeconds:
          ((json['durationSeconds'] ?? json['duration_seconds']) as num?)
              ?.toInt() ??
          0,
      createdAt: (json['createdAt'] ?? json['created_at']) != null
          ? DateTime.tryParse(
                  (json['createdAt'] ?? json['created_at']).toString(),
                ) ??
                DateTime.now()
          : DateTime.now(),
    );
  }
}

final callHistoryProvider = FutureProvider.autoDispose<List<CallHistoryItem>>((
  ref,
) async {
  final client = ref.watch(apiClientProvider);
  final res = await client.get('/api/v1/calls');
  if (res == null || res['items'] == null) return [];
  final items = res['items'] as List<dynamic>;
  return items
      .map((e) => CallHistoryItem.fromJson(e as Map<String, dynamic>))
      .toList();
});


class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  String _query = '';

  bool _matches(CallHistoryItem c) {
    if (_query.isEmpty) return true;
    return [c.contactName, c.contactPhone, c.campaignName, c.outcome]
        .any((v) => v?.toLowerCase().contains(_query) ?? false);
  }

  void _refresh() => ref.invalidate(callHistoryProvider);

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(callHistoryProvider);
    return MonitorPage(
      title: 'Call history',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                hintText: 'Search contact, number or campaign',
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => _refresh(),
              child: history.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ErrorState(
                  message: 'Couldn’t load call history',
                  detail: errorText(e),
                  onRetry: _refresh,
                ),
                data: (calls) {
                  final rows = calls.where(_matches).toList();
                  if (rows.isEmpty) {
                    return ErrorState(
                      danger: false,
                      message: calls.isEmpty ? 'No calls yet' : 'No matching calls',
                      detail: calls.isEmpty
                          ? 'Executed calls and transcripts will appear here.'
                          : null,
                    );
                  }
                  return ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                    itemCount: rows.length,
                    itemBuilder: (_, i) => _CallRow(item: rows[i]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  const _CallRow({required this.item});
  final CallHistoryItem item;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final outcome = item.outcome ?? item.status;
    final phone = maskPhone(item.contactPhone);
    final when = relativeTime(item.createdAt);
    final duration = formatDuration(item.durationSeconds);
    final title = item.contactName ?? phone;
    return Semantics(
      button: true,
      label: '$title, ${humanize(outcome)}, $duration, $when',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CallDetailScreen(callId: item.id)),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodyLarge),
                      const SizedBox(height: 2),
                      Text(
                        [
                          if (item.contactName != null) phone,
                          item.campaignName,
                          if (item.mode == 'simulation') 'Simulation',
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        StatusDot(outcomeColor(p, outcome)),
                        const SizedBox(width: 6),
                        Text(humanize(outcome), style: t.labelMedium?.copyWith(color: p.text)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('$duration · $when', style: t.bodySmall),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
