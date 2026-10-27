import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

class CampaignItem {
  final String id;
  final String name;
  final String status;
  final String mode;
  final String? agentName;
  final int totalContacts;
  final int completedContacts;
  final DateTime createdAt;

  CampaignItem({
    required this.id,
    required this.name,
    required this.status,
    required this.mode,
    this.agentName,
    required this.totalContacts,
    required this.completedContacts,
    required this.createdAt,
  });

  factory CampaignItem.fromJson(Map<String, dynamic> json) {
    return CampaignItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Untitled Campaign',
      status: json['status'] as String? ?? 'draft',
      mode: json['mode'] as String? ?? 'simulation',
      agentName: json['agent_name'] as String?,
      totalContacts: (json['total_contacts'] as num?)?.toInt() ?? 0,
      completedContacts: (json['completed_contacts'] as num?)?.toInt() ?? 0,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

final campaignsProvider =
    FutureProvider.autoDispose<List<CampaignItem>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  final res = await apiClient.get('/api/v1/campaigns');
  if (res == null || res['items'] == null) return [];
  final items = res['items'] as List<dynamic>;
  return items.map((e) => CampaignItem.fromJson(e as Map<String, dynamic>)).toList();
});

class CampaignsScreen extends ConsumerStatefulWidget {
  const CampaignsScreen({super.key});

  @override
  ConsumerState<CampaignsScreen> createState() => _CampaignsScreenState();
}

class _CampaignsScreenState extends ConsumerState<CampaignsScreen> {
  Future<void> _action(String campaignId, String actionName) async {
    final client = ref.read(apiClientProvider);
    try {
      await client.post('/api/v1/campaigns/$campaignId/$actionName');
      ref.invalidate(campaignsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Campaign $actionName successful.'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Action failed: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'running':
        return AppColors.info;
      case 'completed':
        return AppColors.success;
      case 'paused':
        return AppColors.warning;
      case 'failed':
      case 'cancelled':
        return AppColors.danger;
      default:
        return AppColors.darkTextSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final campaignsAsync = ref.watch(campaignsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Campaigns'),
        actions: [
          IconButton(
            icon: const HugeIcon(
              icon: HugeIcons.strokeRoundedRefresh,
              color: AppColors.darkTextPrimary,
              size: 20,
            ),
            onPressed: () => ref.invalidate(campaignsProvider),
          ),
        ],
      ),
      body: campaignsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const HugeIcon(
                icon: HugeIcons.strokeRoundedAlertCircle,
                color: AppColors.danger,
                size: 40,
              ),
              const SizedBox(height: 12),
              Text(
                'Failed to load campaigns: $err',
                style: const TextStyle(color: AppColors.darkTextSecondary),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.invalidate(campaignsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (campaigns) {
          if (campaigns.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  HugeIcon(
                    icon: HugeIcons.strokeRoundedMegaphone01,
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                    size: 48,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No campaigns yet',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Describe an outreach task in the composer to launch one.',
                    style: TextStyle(fontSize: 13, color: AppColors.darkTextSecondary),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(campaignsProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: campaigns.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final c = campaigns[index];
                final progress = c.totalContacts > 0
                    ? c.completedContacts / c.totalContacts
                    : 0.0;
                final statusCol = _statusColor(c.status);

                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                c.name,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: statusCol.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                c.status.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: statusCol,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: (c.mode == 'live' ? AppColors.danger : AppColors.success)
                                    .withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                c.mode.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: c.mode == 'live' ? AppColors.danger : AppColors.success,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (c.agentName != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Agent: ${c.agentName}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.darkTextSecondary,
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Progress: ${c.completedContacts} / ${c.totalContacts} calls',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Text(
                              '${(progress * 100).toInt()}%',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: progress,
                            backgroundColor: isDark
                                ? AppColors.darkBorder
                                : AppColors.lightBorder,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              c.status == 'completed'
                                  ? AppColors.success
                                  : AppColors.darkAccent,
                            ),
                            minHeight: 6,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            if (c.status == 'running')
                              TextButton.icon(
                                onPressed: () => _action(c.id, 'pause'),
                                icon: const HugeIcon(
                                  icon: HugeIcons.strokeRoundedPause,
                                  color: AppColors.warning,
                                  size: 16,
                                ),
                                label: const Text(
                                  'Pause',
                                  style: TextStyle(color: AppColors.warning),
                                ),
                              ),
                            if (c.status == 'paused')
                              TextButton.icon(
                                onPressed: () => _action(c.id, 'resume'),
                                icon: const HugeIcon(
                                  icon: HugeIcons.strokeRoundedPlay,
                                  color: AppColors.success,
                                  size: 16,
                                ),
                                label: const Text(
                                  'Resume',
                                  style: TextStyle(color: AppColors.success),
                                ),
                              ),
                            if (c.status == 'running' || c.status == 'paused' || c.status == 'scheduled')
                              TextButton.icon(
                                onPressed: () => _action(c.id, 'cancel'),
                                icon: const HugeIcon(
                                  icon: HugeIcons.strokeRoundedCancel01,
                                  color: AppColors.danger,
                                  size: 16,
                                ),
                                label: const Text(
                                  'Cancel',
                                  style: TextStyle(color: AppColors.danger),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
