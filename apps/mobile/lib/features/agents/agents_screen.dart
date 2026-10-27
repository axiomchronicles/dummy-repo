import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'agent_detail_screen.dart';
import 'agent_form.dart';
import 'agents_models.dart';
import 'agents_widgets.dart';
import 'configuration_screen.dart';

/// Sarvam telephony readiness + agent list. Each section loads independently
/// so one failing endpoint does not hide the others.
class AgentsVoicesScreen extends ConsumerStatefulWidget {
  const AgentsVoicesScreen({super.key});
  @override
  ConsumerState<AgentsVoicesScreen> createState() => _AgentsVoicesScreenState();
}

class _AgentsVoicesScreenState extends ConsumerState<AgentsVoicesScreen> {
  late Future<ProviderConfiguration> _provider;
  late Future<List<Agent>> _agents;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final api = ref.read(apiClientProvider);
    _provider = api
        .get('/api/v1/agents/provider-configuration')
        .then((j) => ProviderConfiguration.fromJson(Map<String, dynamic>.from(j)));
    _agents = api
        .get('/api/v1/agents', queryParams: {'limit': '100'})
        .then((j) => ((j['items'] as List?) ?? const [])
            .map((e) => Agent.fromJson(Map<String, dynamic>.from(e)))
            .toList());
  }

  Future<void> _refresh() async {
    setState(_load);
    await Future.wait([
      _provider.then((_) {}, onError: (_) {}),
      _agents.then((_) {}, onError: (_) {}),
    ]);
  }

  Future<void> _open(Widget page) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    if (mounted) setState(_load);
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<Agent>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const NewAgentSheet(),
    );
    if (created != null && mounted) {
      await _open(AgentDetailScreen(agentId: created.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    return Scaffold(
      appBar: chipAppBar(
        'Agents & Voices',
        actions: [
          IconButton(
            tooltip: 'New agent',
            icon: HugeIcon(icon: HugeIcons.strokeRoundedAdd01, color: p.text, size: 22),
            onPressed: _create,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            FutureBuilder<ProviderConfiguration>(
              future: _provider,
              builder: (context, s) => switch (s) {
                AsyncSnapshot(hasError: true) => Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: InlineError(s.error!, onRetry: _refresh),
                ),
                AsyncSnapshot(hasData: true) => ReadinessSection(
                  config: s.data!,
                  onOpenConfiguration: () => _open(const ConfigurationScreen()),
                ),
                _ => const _Loading(),
              },
            ),
            FutureBuilder<List<Agent>>(
              future: _agents,
              builder: (context, s) => switch (s) {
                AsyncSnapshot(hasError: true) => InlineError(s.error!, onRetry: _refresh),
                AsyncSnapshot(hasData: true) => _agentGroup(s.data!),
                _ => const _Loading(),
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _agentGroup(List<Agent> agents) {
    if (agents.isEmpty) {
      return Group(
        title: 'Agents',
        children: [
          Cell(
            icon: HugeIcons.strokeRoundedAdd01,
            title: 'Create your first agent',
            subtitle: 'Define a persona, questions and a Sarvam voice.',
            onTap: _create,
          ),
        ],
      );
    }
    return Group(
      title: 'Agents',
      children: [
        for (final a in agents)
          Cell(
            icon: HugeIcons.strokeRoundedRobot01,
            title: a.name,
            subtitle: '${a.language} · v${a.currentVersion}',
            semanticsLabel:
                '${a.name}, ${a.language}, version ${a.currentVersion}, ${voiceStatusLabel(a.voiceStatus)}',
            trailing: Pill(voiceStatusLabel(a.voiceStatus), voiceStatusColor(context, a.voiceStatus)),
            onTap: () => _open(AgentDetailScreen(agentId: a.id)),
          ),
      ],
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 32),
    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
  );
}
