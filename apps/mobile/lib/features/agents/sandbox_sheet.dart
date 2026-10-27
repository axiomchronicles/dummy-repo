import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_provider.dart';
import 'agents_models.dart';
import 'agents_widgets.dart';

/// POST /agents/:id/sandbox. Result is synthetic; the sheet says so up front.
Future<void> showSandbox(BuildContext context, WidgetRef ref, Agent agent) {
  final future = ref.read(apiClientProvider).post('/api/v1/agents/${agent.id}/sandbox');
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      builder: (ctx, controller) => FutureBuilder<dynamic>(
        future: future,
        builder: (ctx, s) {
          final p = Pal.of(ctx);
          final event = s.data is Map ? Map<String, dynamic>.from(s.data['event'] ?? {}) : const <String, dynamic>{};
          final transcript = (event['transcript'] as List?) ?? const [];
          final fields = event['extractedFields'] is Map ? Map<String, dynamic>.from(event['extractedFields']) : const <String, dynamic>{};
          return ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            children: [
              Row(
                children: [
                  Expanded(child: Text('Sandbox · ${agent.name}', style: Theme.of(ctx).textTheme.titleLarge)),
                  Pill('SIMULATION', p.text),
                ],
              ),
              const SizedBox(height: 6),
              Text('Synthetic conversation. No call was placed.', style: TextStyle(color: p.sub)),
              const SizedBox(height: 20),
              if (s.hasError)
                InlineError(s.error!)
              else if (!s.hasData)
                const Center(child: CircularProgressIndicator(strokeWidth: 2))
              else ...[
                Text(
                  'Outcome ${event['outcome'] ?? 'unknown'} · ${event['durationSeconds'] ?? 0}s',
                  style: TextStyle(color: p.sub, fontSize: 13),
                ),
                const SizedBox(height: 12),
                for (final t in transcript)
                  if (t is Map) _Bubble(isAgent: t['role'] == 'agent', text: '${t['text'] ?? ''}'),
                if (fields.isNotEmpty)
                  Group(
                    title: 'Extracted fields',
                    children: [
                      for (final e in fields.entries) Cell(title: e.key, subtitle: '${e.value}'),
                    ],
                  ),
              ],
            ],
          );
        },
      ),
    ),
  );
}

class _Bubble extends StatelessWidget {
  final bool isAgent;
  final String text;
  const _Bubble({required this.isAgent, required this.text});
  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    return Align(
      alignment: isAgent ? Alignment.centerLeft : Alignment.centerRight,
      child: Semantics(
        label: '${isAgent ? 'Agent' : 'Contact'}: $text',
        excludeSemantics: true,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
          decoration: BoxDecoration(
            color: isAgent ? p.elevated : p.p.userBubble,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(isAgent ? 'Agent' : 'Contact', style: TextStyle(color: p.sub, fontSize: 11)),
              const SizedBox(height: 2),
              Text(text, style: TextStyle(color: p.text, height: 1.35)),
            ],
          ),
        ),
      ),
    );
  }
}
