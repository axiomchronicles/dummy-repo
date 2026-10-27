import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'agent_form.dart';
import 'agents_models.dart';
import 'agents_widgets.dart';
import 'sandbox_sheet.dart';
import 'voice_picker_screen.dart';

class AgentDetailScreen extends ConsumerStatefulWidget {
  final String agentId;
  const AgentDetailScreen({super.key, required this.agentId});
  @override
  ConsumerState<AgentDetailScreen> createState() => _AgentDetailScreenState();
}

class _AgentDetailScreenState extends ConsumerState<AgentDetailScreen> {
  late Future<Agent> _agent;
  late Future<List<AgentVersion>> _versions;
  String? _notice;

  String get _base => '/api/v1/agents/${widget.agentId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final api = ref.read(apiClientProvider);
    _agent = api.get(_base).then((j) => Agent.fromJson(Map<String, dynamic>.from(j)));
    _versions = api.get('$_base/versions').then((j) => ((j['items'] as List?) ?? const [])
        .map((e) => AgentVersion.fromJson(Map<String, dynamic>.from(e)))
        .toList());
  }

  Future<void> _refresh() async {
    setState(_load);
    await Future.wait([
      _agent.then((_) {}, onError: (_) {}),
      _versions.then((_) {}, onError: (_) {}),
    ]);
  }

  /// After any write, re-read from the server and report the version it holds.
  Future<void> _afterSave() async {
    setState(_load);
    try {
      final fresh = await _agent;
      if (mounted) setState(() => _notice = 'Saved · new version ${fresh.currentVersion}');
    } catch (_) {/* error renders via FutureBuilder */}
  }

  Future<void> _edit(Agent agent) async {
    final saved = await Navigator.of(context).push<Agent>(MaterialPageRoute(
      builder: (ctx) => Scaffold(
        appBar: chipAppBar('Edit persona'),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          child: AgentEditor(
            initial: agent,
            submitLabel: 'Save new version',
            submit: (body) async => Agent.fromJson(Map<String, dynamic>.from(
                await ref.read(apiClientProvider).patch(_base, body: body))),
            onSaved: (a) => Navigator.of(ctx).pop(a),
          ),
        ),
      ),
    ));
    if (saved != null && mounted) await _afterSave();
  }

  Future<void> _pickVoice(Agent agent) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => VoicePickerScreen(agent: agent)),
    );
    if (changed == true && mounted) await _afterSave();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: chipAppBar('Agent'),
    body: RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<Agent>(
        future: _agent,
        builder: (context, s) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: switch (s) {
            AsyncSnapshot(hasError: true) => [InlineError(s.error!, onRetry: _refresh)],
            AsyncSnapshot(hasData: true, connectionState: ConnectionState.done) => _body(s.data!),
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

  List<Widget> _body(Agent a) {
    final p = Pal.of(context);
    final v = a.voice;
    return [
      if (_notice != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Semantics(
            liveRegion: true,
            child: Row(
              children: [
                HugeIcon(icon: HugeIcons.strokeRoundedCheckmarkCircle02, color: p.success, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_notice!, style: TextStyle(color: p.text, fontWeight: FontWeight.w600))),
              ],
            ),
          ),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a.name, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text('${a.language} · version ${a.currentVersion}', style: TextStyle(color: p.sub)),
            if (a.description.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(a.description, style: TextStyle(color: p.text, height: 1.4)),
            ],
          ],
        ),
      ),
      Group(
        title: 'Persona',
        children: [
          Cell(title: 'Prompt', subtitle: a.prompt, semanticsLabel: 'Prompt: ${a.prompt}'),
          Cell(
            title: 'Questions',
            subtitle: a.questions.isEmpty
                ? 'None'
                : [for (var i = 0; i < a.questions.length; i++) '${i + 1}. ${a.questions[i]}'].join('\n'),
          ),
          Cell(
            icon: HugeIcons.strokeRoundedPencilEdit02,
            title: 'Edit persona',
            onTap: () => _edit(a),
          ),
        ],
      ),
      Group(
        title: 'Voice',
        children: [
          Cell(
            icon: HugeIcons.strokeRoundedVoice,
            title: v == null ? voiceStatusLabel(a.voiceStatus) : v.speaker,
            subtitle: v == null
                ? (a.voiceStatus == 'invalid'
                    ? 'Stored voice failed validation. Choose a new one.'
                    : 'Choose a Sarvam Bulbul voice')
                : '${v.model} · ${v.language} · pace ${v.pace.toStringAsFixed(2)} · volume ${v.volume.toStringAsFixed(2)}',
            trailing: Pill(voiceStatusLabel(a.voiceStatus), voiceStatusColor(context, a.voiceStatus)),
            onTap: () => _pickVoice(a),
          ),
        ],
      ),
      Group(
        title: 'Test',
        footer: 'Runs a synthetic simulation. No call is placed.',
        children: [
          Cell(
            icon: HugeIcons.strokeRoundedTestTube01,
            title: 'Run sandbox simulation',
            onTap: () => showSandbox(context, ref, a),
          ),
        ],
      ),
      FutureBuilder<List<AgentVersion>>(
        future: _versions,
        builder: (context, s) => switch (s) {
          AsyncSnapshot(hasError: true) => InlineError(s.error!, onRetry: _refresh),
          AsyncSnapshot(hasData: true) => Group(
            title: 'Version history',
            children: [
              for (final ver in s.data!)
                Cell(
                  icon: HugeIcons.strokeRoundedClock01,
                  title: 'Version ${ver.version}${ver.version == a.currentVersion ? ' · current' : ''}',
                  subtitle: [
                    ver.language,
                    '${ver.questionCount} question${ver.questionCount == 1 ? '' : 's'}',
                    ver.voice?.speaker ?? 'no voice',
                    if (ver.createdAt.length >= 10) ver.createdAt.substring(0, 10),
                  ].join(' · '),
                ),
            ],
          ),
          _ => const SizedBox.shrink(),
        },
      ),
    ];
  }
}
