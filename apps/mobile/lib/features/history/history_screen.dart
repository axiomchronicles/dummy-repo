import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:intl/intl.dart';
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
      campaignId: json['campaign_id'] as String? ?? '',
      campaignName: json['campaign_name'] as String? ?? 'Outreach Campaign',
      contactName: json['contact_name'] as String?,
      contactPhone: json['contact_phone'] as String?,
      status: json['status'] as String? ?? 'unknown',
      outcome: json['outcome'] as String?,
      mode: json['mode'] as String? ?? 'simulation',
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

final callHistoryProvider =
    FutureProvider.autoDispose<List<CallHistoryItem>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final res = await client.get('/api/v1/calls');
  if (res == null || res['items'] == null) return [];
  final items = res['items'] as List<dynamic>;
  return items.map((e) => CallHistoryItem.fromJson(e as Map<String, dynamic>)).toList();
});

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(callHistoryProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Call History'),
        actions: [
          IconButton(
            icon: const HugeIcon(
              icon: HugeIcons.strokeRoundedRefresh,
              color: AppColors.darkTextPrimary,
              size: 20,
            ),
            onPressed: () => ref.invalidate(callHistoryProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search & Filter Box
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Search by contact or phone...',
                prefixIcon: const HugeIcon(
                  icon: HugeIcons.strokeRoundedSearch01,
                  color: AppColors.darkTextSecondary,
                  size: 20,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
              ),
            ),
          ),

          Expanded(
            child: historyAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(
                child: Text(
                  'Failed to load call history: $err',
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
              data: (calls) {
                final filtered = calls.where((c) {
                  if (_searchQuery.isEmpty) return true;
                  final nameMatch = c.contactName?.toLowerCase().contains(_searchQuery) ?? false;
                  final phoneMatch = c.contactPhone?.toLowerCase().contains(_searchQuery) ?? false;
                  final campaignMatch = c.campaignName.toLowerCase().contains(_searchQuery);
                  return nameMatch || phoneMatch || campaignMatch;
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        HugeIcon(
                          icon: HugeIcons.strokeRoundedCall02,
                          color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                          size: 48,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          calls.isEmpty ? 'No call records yet' : 'No matching calls found',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Executed outreach calls and transcripts will appear here.',
                          style: TextStyle(fontSize: 13, color: AppColors.darkTextSecondary),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(callHistoryProvider),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final item = filtered[index];
                      final outcome = item.outcome ?? item.status;
                      final isSuccess = outcome == 'connected' || outcome == 'completed';
                      final outcomeColor = isSuccess ? AppColors.success : AppColors.danger;
                      final dateStr = DateFormat('MMM d, h:mm a').format(item.createdAt);

                      return Card(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => CallDetailScreen(callId: item.id),
                              ),
                            );
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: outcomeColor.withValues(alpha: 0.12),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Center(
                                    child: HugeIcon(
                                      icon: isSuccess
                                          ? HugeIcons.strokeRoundedCall02
                                          : HugeIcons.strokeRoundedCallBlocked,
                                      color: outcomeColor,
                                      size: 22,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.contactName ?? 'Student Contact',
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${item.contactPhone ?? '+91 ••••• ••••'} • ${item.campaignName}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.darkTextSecondary,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        dateStr,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.darkTextSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: outcomeColor.withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        outcome.toUpperCase(),
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          color: outcomeColor,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      '${item.durationSeconds}s',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
