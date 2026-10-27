import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import '../chat/chat_models.dart';

final campaignContactsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, campaignId) async {
  final client = ref.watch(apiClientProvider);
  try {
    final res = await client.get('/api/v1/campaigns/$campaignId/contacts');
    if (res == null || res['items'] == null) return [];
    return (res['items'] as List<dynamic>).map((e) => e as Map<String, dynamic>).toList();
  } catch (_) {
    return [];
  }
});

class ConfirmationDrawer extends ConsumerStatefulWidget {
  final CampaignDraft draft;
  final VoidCallback onConfirmed;
  final VoidCallback onDismissed;

  const ConfirmationDrawer({
    super.key,
    required this.draft,
    required this.onConfirmed,
    required this.onDismissed,
  });

  @override
  ConsumerState<ConfirmationDrawer> createState() => _ConfirmationDrawerState();
}

class _ConfirmationDrawerState extends ConsumerState<ConfirmationDrawer> {
  bool _isConfirming = false;
  String _selectedMode = 'simulation'; // 'simulation' | 'live'

  @override
  void initState() {
    super.initState();
    _selectedMode = widget.draft.mode;
  }

  void _confirm(String mode) async {
    setState(() => _isConfirming = true);
    try {
      final client = ref.read(apiClientProvider);
      final action = mode == 'live' ? 'launch' : 'simulate';
      final randomKey =
          'conf-${DateTime.now().millisecondsSinceEpoch}-${widget.draft.campaignId.replaceAll('-', '').substring(0, 8)}';
      await client.post(
        '/api/v1/campaigns/${widget.draft.campaignId}/$action',
        body: {'confirmed': true},
        headers: {'Idempotency-Key': randomKey},
      );
      if (mounted) {
        setState(() => _isConfirming = false);
        widget.onConfirmed();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isConfirming = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Launch dispatch failed: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final draft = widget.draft;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drawer Drag Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header: Title & Close
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'PREPARED OUTREACH PLAN',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: AppColors.darkAccent,
                            letterSpacing: 1.0,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Review Campaign Before Dispatch',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: HugeIcon(
                      icon: HugeIcons.strokeRoundedCancel01,
                      color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      size: 20,
                    ),
                    onPressed: widget.onDismissed,
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // Content Scroll
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Objective Summary
                    Text(
                      'Campaign Objective',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        draft.objective,
                        style: TextStyle(
                          fontSize: 14,
                          color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                          height: 1.4,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Metrics Strip: Valid vs Excluded
                    Row(
                      children: [
                        _metricCard(
                          context,
                          title: 'Eligible Calls',
                          value: '${draft.eligibleCount}',
                          color: draft.eligibleCount > 0 ? AppColors.success : AppColors.warning,
                          icon: HugeIcons.strokeRoundedCall02,
                        ),
                        const SizedBox(width: 12),
                        _metricCard(
                          context,
                          title: 'Excluded Contacts',
                          value: '${draft.excludedCount}',
                          color: AppColors.danger,
                          icon: HugeIcons.strokeRoundedAlert02,
                        ),
                        const SizedBox(width: 12),
                        _metricCard(
                          context,
                          title: 'Execution Mode',
                          value: _selectedMode == 'live' ? 'Live Telephony' : 'Simulation',
                          color: _selectedMode == 'live' ? AppColors.darkAccent : AppColors.info,
                          icon: HugeIcons.strokeRoundedShieldKey,
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Mode Toggle Selector
                    Text(
                      'Dispatch Mode',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() => _selectedMode = 'simulation'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                decoration: BoxDecoration(
                                  color: _selectedMode == 'simulation'
                                      ? (isDark ? AppColors.darkBorder : Colors.white)
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Center(
                                  child: Text(
                                    'Simulation Test',
                                    style: TextStyle(
                                      fontWeight: _selectedMode == 'simulation' ? FontWeight.bold : FontWeight.w500,
                                      fontSize: 13,
                                      color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() => _selectedMode = 'live'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                decoration: BoxDecoration(
                                  color: _selectedMode == 'live'
                                      ? AppColors.darkAccent
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Center(
                                  child: Text(
                                    'Live Telephony',
                                    style: TextStyle(
                                      fontWeight: _selectedMode == 'live' ? FontWeight.bold : FontWeight.w500,
                                      fontSize: 13,
                                      color: _selectedMode == 'live'
                                          ? Colors.white
                                          : (isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Agent & Voice Setup
                    Text(
                      'Voice Persona Configuration',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const HugeIcon(
                            icon: HugeIcons.strokeRoundedVoice,
                            color: AppColors.darkAccent,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  draft.agentName,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                                  ),
                                ),
                                Text(
                                  'Language: ${draft.agentLanguage} • Telephony Provider: Active Gateway',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Script Steps Preview
                    Text(
                      'Planned Call Stages',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    ...draft.steps.map(
                      (step) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('• ', style: TextStyle(color: AppColors.darkAccent, fontSize: 16)),
                            Expanded(
                              child: Text(
                                step,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Eligible Recipients Section
                    Text(
                      'Recipients in Campaign Queue',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    ref.watch(campaignContactsProvider(draft.campaignId)).when(
                          loading: () => Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Center(
                              child: SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          ),
                          error: (err, stack) => Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              draft.eligibleCount == 0
                                  ? 'No contacts uploaded yet. Upload a roster via the "+" button to queue recipients.'
                                  : '${draft.eligibleCount} contacts queued for outreach.',
                              style: const TextStyle(fontSize: 12, color: AppColors.darkTextSecondary),
                            ),
                          ),
                          data: (contacts) {
                            if (contacts.isEmpty) {
                              return Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Row(
                                  children: [
                                    HugeIcon(
                                      icon: HugeIcons.strokeRoundedAlert02,
                                      color: draft.eligibleCount == 0 ? AppColors.warning : AppColors.darkTextSecondary,
                                      size: 16,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        draft.eligibleCount == 0
                                            ? 'No recipient roster attached. Please attach a .csv/.xlsx roster before dispatch.'
                                            : '${draft.eligibleCount} verified contacts queued for dispatch.',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: draft.eligibleCount == 0 ? AppColors.warning : AppColors.darkTextSecondary,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }
                            return Container(
                              decoration: BoxDecoration(
                                color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Column(
                                children: contacts.take(5).map((c) {
                                  final name = c['name'] as String? ?? 'Contact';
                                  final rawPhone = c['phone'] as String? ?? '';
                                  final maskedPhone = rawPhone.length > 5
                                      ? '${rawPhone.substring(0, 3)} ••••• ${rawPhone.substring(rawPhone.length - 3)}'
                                      : rawPhone;
                                  final status = (c['status'] as String? ?? 'Eligible').toUpperCase();
                                  return _recipientRow(context, name, maskedPhone, status);
                                }).toList(),
                              ),
                            );
                          },
                        ),
                  ],
                ),
              ),
            ),
            const Divider(height: 1),

            // Bottom Actions
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                      ),
                      onPressed: _isConfirming ? null : widget.onDismissed,
                      child: Text(
                        'Edit Plan',
                        style: TextStyle(
                          color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _selectedMode == 'live' ? AppColors.darkAccent : (isDark ? AppColors.darkAccent : AppColors.lightAccent),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        elevation: 0,
                      ),
                      onPressed: _isConfirming || (draft.eligibleCount == 0 && _selectedMode == 'live')
                          ? null
                          : () => _confirm(_selectedMode),
                      child: _isConfirming
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : Text(
                              _selectedMode == 'live'
                                  ? 'Confirm & Dispatch Live Calls (${draft.eligibleCount})'
                                  : 'Run Simulation (${draft.eligibleCount})',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metricCard(
    BuildContext context, {
    required String title,
    required String value,
    required Color color,
    required dynamic icon,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            HugeIcon(icon: icon, color: color, size: 16),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
              ),
            ),
            Text(
              title,
              style: TextStyle(
                fontSize: 10,
                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _recipientRow(BuildContext context, String name, String phone, String status) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: isDark ? AppColors.darkCard : AppColors.lightCard,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                Text(
                  phone,
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              status,
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.success),
            ),
          ),
        ],
      ),
    );
  }
}
