import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'agents_models.dart';
import 'agents_widgets.dart';

/// Telephony readiness summary from GET /agents/provider-configuration.
class ReadinessSection extends StatelessWidget {
  final ProviderConfiguration config;
  final VoidCallback onOpenConfiguration;
  const ReadinessSection({
    super.key,
    required this.config,
    required this.onOpenConfiguration,
  });

  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    final c = config;
    final ready = c.blockers.isEmpty;
    final tone = ready ? p.success : p.warning;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Group(
          title: 'Telephony readiness',
          children: [
            Semantics(
              liveRegion: true,
              label: ready
                  ? 'Live calls ready'
                  : 'Live calls blocked by ${c.blockers.length} items: ${c.blockers.join(', ')}',
              excludeSemantics: true,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        HugeIcon(
                          icon: ready
                              ? HugeIcons.strokeRoundedCheckmarkCircle02
                              : HugeIcons.strokeRoundedAlert02,
                          color: tone,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Text(
                          ready ? 'Ready for live calls' : 'Blocked',
                          style: TextStyle(
                            color: p.text,
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    if (!ready) ...[
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final b in c.blockers)
                            Chip(
                              key: ValueKey('blocker-$b'),
                              label: Text(
                                b,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontFamily: 'monospace',
                                ),
                              ),
                              visualDensity: VisualDensity.compact,
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Cell(
              icon: HugeIcons.strokeRoundedCall,
              title: 'Outbound caller ID',
              subtitle: c.callerIdMasked ?? 'Not set · SARVAM_AGENT_PHONE_NUMBER',
            ),
            Cell(
              icon: HugeIcons.strokeRoundedRobot01,
              title: 'Sarvam agent app',
              subtitle: c.appId == null
                  ? 'Not set · SARVAM_APP_ID'
                  : '${c.appId} · committed version ${c.appVersion ?? 'not set'}',
            ),
            Cell(
              icon: HugeIcons.strokeRoundedRefresh,
              title: 'Provider sync',
              subtitle: c.synchronized
                  ? 'Synchronized · ${c.bindingCount} binding${c.bindingCount == 1 ? '' : 's'}'
                  : 'Not synchronized',
              trailing: Pill(
                c.synchronized ? 'Synced' : 'Pending',
                c.synchronized ? p.success : p.warning,
              ),
            ),
            Cell(
              icon: HugeIcons.strokeRoundedTelephone,
              title: 'Live calls',
              subtitle: c.liveEnabled ? 'LIVE_CALLS_ENABLED is on' : 'LIVE_CALLS_ENABLED is off',
              trailing: Pill(
                c.liveEnabled ? 'Enabled' : 'Disabled',
                c.liveEnabled ? p.success : p.sub,
              ),
            ),
            Cell(
              icon: HugeIcons.strokeRoundedSettings02,
              title: 'Configuration',
              subtitle: 'Environment keys and what they unlock',
              onTap: onOpenConfiguration,
            ),
          ],
        ),
        if (c.dashboard != null || c.documentation != null)
          Group(
            title: 'Sarvam links',
            children: [
              if (c.dashboard != null) CopyCell(title: 'Dashboard', value: c.dashboard!),
              if (c.documentation != null)
                CopyCell(title: 'Documentation', value: c.documentation!),
            ],
          ),
      ],
    );
  }
}

const _capabilityLabels = {
  'live_calls': 'Live calls',
  'analytics': 'Analytics',
  'mcp_authoring': 'MCP authoring',
  'voice_preview': 'Voice preview',
};
const _readyKeys = {
  'live_calls': 'liveCalls',
  'analytics': 'analytics',
  'mcp_authoring': 'mcpAuthoring',
  'voice_preview': 'voicePreview',
};

/// GET /agents/configuration-diagnostics, grouped by requiredFor. Key names only.
class ConfigurationScreen extends ConsumerStatefulWidget {
  const ConfigurationScreen({super.key});
  @override
  ConsumerState<ConfigurationScreen> createState() => _ConfigurationScreenState();
}

class _ConfigurationScreenState extends ConsumerState<ConfigurationScreen> {
  late Future<Diagnostics> _future = _fetch();

  Future<Diagnostics> _fetch() => ref
      .read(apiClientProvider)
      .get('/api/v1/agents/configuration-diagnostics')
      .then((j) => Diagnostics.fromJson(Map<String, dynamic>.from(j)));

  Future<void> _refresh() async {
    setState(() => _future = _fetch());
    await _future.then((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: chipAppBar('Configuration'),
    body: RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<Diagnostics>(
        future: _future,
        builder: (context, s) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: switch (s) {
            AsyncSnapshot(hasError: true) => [InlineError(s.error!, onRetry: _refresh)],
            AsyncSnapshot(hasData: true) => _body(context, s.data!),
            _ => const [
              Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
            ],
          },
        ),
      ),
    ),
  );

  List<Widget> _body(BuildContext context, Diagnostics d) {
    final p = Pal.of(context);
    final caps = <String>{for (final i in d.items) ...i.requiredFor}.toList()
      ..sort((a, b) => _capabilityLabels.keys.toList().indexOf(a)
          .compareTo(_capabilityLabels.keys.toList().indexOf(b)));
    return [
      Group(
        title: 'Telephony',
        footer: 'The caller ID is the agent\'s own number; destinations are the numbers it may call.',
        children: [
          Cell(
            icon: HugeIcons.strokeRoundedCall,
            title: 'Outbound caller ID',
            subtitle: d.callerIdMasked ?? 'Not set · SARVAM_AGENT_PHONE_NUMBER',
          ),
          Cell(
            icon: HugeIcons.strokeRoundedTelephone,
            title: 'Allowed destinations',
            subtitle: '${d.destinationCount} in LIVE_DESTINATION_ALLOWLIST',
          ),
          Cell(
            icon: HugeIcons.strokeRoundedTelephone,
            title: 'Live calls',
            trailing: Pill(
              d.liveCallsEnabled ? 'Enabled' : 'Disabled',
              d.liveCallsEnabled ? p.success : p.sub,
            ),
          ),
        ],
      ),
      for (final cap in caps)
        Group(
          title: _capabilityLabels[cap] ?? cap,
          children: [
            Cell(
              title: d.ready[_readyKeys[cap]] == true ? 'Ready' : 'Not ready',
              trailing: Pill(
                d.ready[_readyKeys[cap]] == true ? 'Ready' : 'Blocked',
                d.ready[_readyKeys[cap]] == true ? p.success : p.warning,
              ),
            ),
            for (final i in d.items.where((i) => i.requiredFor.contains(cap)))
              _DiagnosticRow(i),
          ],
        ),
    ];
  }
}

class _DiagnosticRow extends StatelessWidget {
  final Diagnostic item;
  const _DiagnosticRow(this.item);
  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    final (color, icon) = switch (item.status) {
      'present' => (p.success, HugeIcons.strokeRoundedCheckmarkCircle02),
      'invalid' => (p.danger, HugeIcons.strokeRoundedAlert02),
      _ => (p.warning, HugeIcons.strokeRoundedMinusSign),
    };
    return Semantics(
      label: '${item.key} ${item.status}${item.issue != null ? ', ${item.issue}' : ''}',
      excludeSemantics: true,
      child: Cell(
        title: item.key,
        subtitle: item.issue,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(item.status, style: TextStyle(color: color, fontSize: 13)),
            const SizedBox(width: 6),
            HugeIcon(icon: icon, color: color, size: 18),
          ],
        ),
      ),
    );
  }
}
