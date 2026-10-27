import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

final callDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final res = await client.get('/api/v1/calls/$id');
  return res as Map<String, dynamic>;
});

class CallDetailScreen extends ConsumerStatefulWidget {
  final String callId;

  const CallDetailScreen({super.key, required this.callId});

  @override
  ConsumerState<CallDetailScreen> createState() => _CallDetailScreenState();
}

class _CallDetailScreenState extends ConsumerState<CallDetailScreen> {
  bool _showTranslated = false;
  bool _isPlaying = false;
  double _playbackPosition = 0.0;

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(callDetailProvider(widget.callId));
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Call Details'),
        actions: [
          IconButton(
            icon: const HugeIcon(
              icon: HugeIcons.strokeRoundedRefresh,
              color: AppColors.darkTextPrimary,
              size: 20,
            ),
            onPressed: () => ref.invalidate(callDetailProvider(widget.callId)),
          ),
        ],
      ),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Text(
            'Failed to load call: $err',
            style: const TextStyle(color: AppColors.danger),
          ),
        ),
        data: (call) {
          final outcome = call['outcome'] as String? ?? 'completed';
          final mode = call['mode'] as String? ?? 'simulation';
          final durationSeconds = (call['duration_seconds'] as num?)?.toInt() ?? 0;
          final durationMin = '${durationSeconds ~/ 60}:${(durationSeconds % 60).toString().padLeft(2, '0')}';
          final analysis = call['analysis'] as Map<String, dynamic>?;
          final transcript = (call['transcript'] as List<dynamic>?) ?? [];
          final recordingUrl = call['recording_url'] as String?;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Top Status Banner
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                call['contact_name'] as String? ?? 'Recipient',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                call['contact_phone'] as String? ?? '+91 ••••• ••••',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.darkTextSecondary,
                                ),
                              ),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: (outcome == 'connected' || outcome == 'completed'
                                      ? AppColors.success
                                      : AppColors.danger)
                                  .withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              outcome.toUpperCase(),
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: (outcome == 'connected' || outcome == 'completed')
                                    ? AppColors.success
                                    : AppColors.danger,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _statCol(
                            context,
                            'Duration',
                            durationMin,
                            HugeIcons.strokeRoundedClock01,
                          ),
                          _statCol(
                            context,
                            'Mode',
                            mode.toUpperCase(),
                            HugeIcons.strokeRoundedShieldCheck,
                          ),
                          _statCol(
                            context,
                            'Cost',
                            mode == 'simulation' ? '₹0.00 (Sim)' : '₹4.50',
                            HugeIcons.strokeRoundedCoins01,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Audio Playback Player Bar
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const HugeIcon(
                            icon: HugeIcons.strokeRoundedMic01,
                            color: AppColors.darkAccent,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'Call Recording',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const Spacer(),
                          if (recordingUrl != null)
                            const Text(
                              'VERIFIED PROVIDER AUDIO',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: AppColors.success,
                              ),
                            )
                          else
                            const Text(
                              'SYNTHESIZED PLAYBACK',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: AppColors.warning,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          IconButton(
                            icon: HugeIcon(
                              icon: _isPlaying
                                  ? HugeIcons.strokeRoundedPause
                                  : HugeIcons.strokeRoundedPlay,
                              color: AppColors.darkAccent,
                              size: 28,
                            ),
                            onPressed: () {
                              setState(() {
                                _isPlaying = !_isPlaying;
                                if (_isPlaying) _playbackPosition = 0.45;
                              });
                            },
                          ),
                          Expanded(
                            child: Slider(
                              value: _playbackPosition,
                              onChanged: (v) => setState(() => _playbackPosition = v),
                              activeColor: AppColors.darkAccent,
                              inactiveColor: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                            ),
                          ),
                          Text(
                            _isPlaying ? '0:24' : '0:00',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.darkTextSecondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              if (analysis != null) ...[
                const SizedBox(height: 16),
                // Executive Summary Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            HugeIcon(
                              icon: HugeIcons.strokeRoundedArtificialIntelligence01,
                              color: AppColors.darkAccent,
                              size: 18,
                            ),
                            SizedBox(width: 8),
                            Text(
                              'AI Analysis & Dispositions',
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        if (analysis['summary'] != null) ...[
                          const SizedBox(height: 10),
                          Text(
                            analysis['summary'].toString(),
                            style: TextStyle(
                              fontSize: 13,
                              color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                              height: 1.4,
                            ),
                          ),
                        ],
                        if (analysis['disposition'] != null) ...[
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              const Text(
                                'Disposition: ',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.darkTextSecondary,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.success.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  analysis['disposition'].toString().toUpperCase(),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.success,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 20),

              // Transcript Section with Toggle
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Chronological Transcript',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  Row(
                    children: [
                      const Text(
                        'English',
                        style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary),
                      ),
                      Switch(
                        value: _showTranslated,
                        onChanged: (val) => setState(() => _showTranslated = val),
                        activeThumbColor: AppColors.darkAccent,
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),

              if (transcript.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: Text(
                        'No transcript turns recorded for this call attempt.',
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                        ),
                      ),
                    ),
                  ),
                )
              else
                ...transcript.map((turn) {
                  final t = turn as Map<String, dynamic>;
                  final role = t['speaker'] as String? ?? (t['role'] as String? ?? 'assistant');
                  final isAgent = role == 'assistant' || role == 'agent';
                  final originalText = t['text'] as String? ?? '';
                  final translatedText = t['translated_text'] as String? ?? originalText;
                  final displayText = _showTranslated ? translatedText : originalText;

                  return Align(
                    alignment: isAgent ? Alignment.centerLeft : Alignment.centerRight,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.78,
                      ),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isAgent
                            ? (isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated)
                            : AppColors.darkAccent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isAgent
                              ? (isDark ? AppColors.darkBorder : AppColors.lightBorder)
                              : AppColors.darkAccent.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                isAgent ? 'SARVAM VOICE AGENT' : 'RECIPIENT',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: isAgent ? AppColors.darkTextSecondary : AppColors.darkAccent,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              if (_showTranslated && translatedText != originalText) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: AppColors.info.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'TRANSLATED',
                                    style: TextStyle(
                                      fontSize: 8,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.info,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            displayText,
                            style: TextStyle(
                              fontSize: 14,
                              color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ],
          );
        },
      ),
    );
  }

  Widget _statCol(BuildContext context, String label, String value, List<List<dynamic>> icon) {
    return Column(
      children: [
        HugeIcon(icon: icon, color: AppColors.darkTextSecondary, size: 16),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: AppColors.darkTextSecondary),
        ),
      ],
    );
  }
}
