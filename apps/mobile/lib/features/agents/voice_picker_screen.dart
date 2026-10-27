import 'dart:convert';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'agents_models.dart';
import 'agents_widgets.dart';

class _Voice {
  final String id, name, style;
  final List<String> languages;
  _Voice(Map<String, dynamic> j)
    : id = '${j['id']}',
      name = '${j['name']}',
      style = '${j['style']}',
      languages = [for (final l in (j['languages'] as List? ?? const [])) '$l'];
}

class _Catalog {
  final String model;
  final List<Map<String, dynamic>> models;
  final List<_Voice> voices;
  final double paceMin, paceMax, paceDefault, volMin, volMax, volDefault;
  final bool previewAvailable;
  final String? previewBlocker;
  _Catalog(Map<String, dynamic> j)
    : model = '${j['model']}',
      models = [for (final m in (j['models'] as List? ?? const [])) Map<String, dynamic>.from(m)],
      voices = [for (final v in (j['items'] as List? ?? const [])) _Voice(Map<String, dynamic>.from(v))],
      paceMin = _c(j, 'pace', 'min', 0.5),
      paceMax = _c(j, 'pace', 'max', 2),
      paceDefault = _c(j, 'pace', 'default', 1),
      volMin = _c(j, 'volume', 'min', 0.7),
      volMax = _c(j, 'volume', 'max', 2),
      volDefault = _c(j, 'volume', 'default', 1),
      previewAvailable = j['preview']?['available'] == true,
      previewBlocker = j['preview']?['blocker'] as String?;
  static double _c(Map j, String k, String f, double d) =>
      (j['controls']?[k]?[f] as num?)?.toDouble() ?? d;
  List<String> get languages => {for (final v in voices) ...v.languages}.toList();
}

const _languageNames = {
  'en-IN': 'English', 'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'pa-IN': 'Punjabi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
};

/// Voice picker over GET /agents/voices. The selected language chip is both the
/// filter and the saved language, so a saved selection is always compatible.
class VoicePickerScreen extends ConsumerStatefulWidget {
  final Agent agent;
  const VoicePickerScreen({super.key, required this.agent});
  @override
  ConsumerState<VoicePickerScreen> createState() => _VoicePickerScreenState();
}

class _VoicePickerScreenState extends ConsumerState<VoicePickerScreen> {
  late Future<_Catalog> _future = _fetch();
  _Catalog? _cat;
  VoiceSelection? _saved;
  String? _speaker, _language;
  double _pace = 1, _volume = 1;
  String _query = '';
  AudioPlayer? _player; // created on first preview; one per screen
  bool _previewing = false, _playing = false, _saving = false;
  Object? _previewError, _saveError;
  String? _savedNotice;

  @override
  void initState() {
    super.initState();
    _saved = widget.agent.voice;
  }

  @override
  void dispose() {
    _player?.stop();
    _player?.dispose();
    super.dispose();
  }

  Future<_Catalog> _fetch() async {
    final c = _Catalog(Map<String, dynamic>.from(
      await ref.read(apiClientProvider).get('/api/v1/agents/voices'),
    ));
    final v = _saved;
    final langs = c.languages;
    if (!mounted) return c;
    setState(() {
      _cat = c;
      _speaker = v?.speaker;
      _language = v != null && langs.contains(v.language)
          ? v.language
          : (langs.contains('en-IN') ? 'en-IN' : (langs.isEmpty ? null : langs.first));
      _pace = (v?.pace ?? c.paceDefault).clamp(c.paceMin, c.paceMax);
      _volume = (v?.volume ?? c.volDefault).clamp(c.volMin, c.volMax);
    });
    return c;
  }

  Future<void> _refresh() async {
    setState(() => _future = _fetch());
    await _future.then((_) {}, onError: (_) {});
  }

  VoiceSelection? get _current => _cat == null || _speaker == null || _language == null
      ? null
      : VoiceSelection(model: _cat!.model, speaker: _speaker!, language: _language!, pace: _pace, volume: _volume);

  bool get _dirty => _current != null && _current != _saved;

  List<_Voice> get _visible {
    final q = _query.trim().toLowerCase();
    return [
      for (final v in _cat?.voices ?? const <_Voice>[])
        if (v.languages.contains(_language) &&
            (q.isEmpty || '${v.name} ${v.style} ${v.id}'.toLowerCase().contains(q)))
          v,
    ];
  }

  void _setLanguage(String l) => setState(() {
    _language = l;
    final s = _cat?.voices.where((v) => v.id == _speaker).firstOrNull;
    if (s != null && !s.languages.contains(l)) _speaker = null;
    _previewError = null;
  });

  Future<void> _preview() async {
    final sel = _current;
    if (sel == null) return;
    setState(() {
      _previewing = true;
      _previewError = null;
    });
    try {
      final res = await ref.read(apiClientProvider).post('/api/v1/agents/voices/preview', body: {
        'model': sel.model, 'speaker': sel.speaker, 'language': sel.language, 'pace': sel.pace,
      });
      final bytes = base64Decode('${res['audioBase64']}');
      final player = _player ??= AudioPlayer()
        ..onPlayerComplete.listen((_) {
          if (mounted) setState(() => _playing = false);
        });
      await player.stop();
      await player.play(BytesSource(bytes, mimeType: '${res['contentType'] ?? 'audio/wav'}'));
      if (mounted) setState(() => _playing = true);
    } catch (e) {
      if (mounted) setState(() => _previewError = e);
    } finally {
      if (mounted) setState(() => _previewing = false);
    }
  }

  Future<void> _stop() async {
    await _player?.stop();
    if (mounted) setState(() => _playing = false);
  }

  Future<void> _save() async {
    final sel = _current;
    if (sel == null) return;
    setState(() {
      _saving = true;
      _saveError = null;
      _savedNotice = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final base = '/api/v1/agents/${widget.agent.id}';
      await api.patch('$base/voice', body: sel.toJson());
      final fresh = Agent.fromJson(Map<String, dynamic>.from(await api.get(base)));
      if (!mounted) return;
      setState(() {
        _saved = fresh.voice;
        if (fresh.voice != null) {
          _speaker = fresh.voice!.speaker;
          _language = fresh.voice!.language;
          _pace = fresh.voice!.pace;
          _volume = fresh.voice!.volume;
        }
        _savedNotice = 'Saved ${fresh.voice?.speaker ?? ''} · version ${fresh.currentVersion}';
      });
    } catch (e) {
      if (mounted) setState(() => _saveError = e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: chipAppBar('Voice'),
    body: RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<_Catalog>(
        future: _future,
        builder: (context, s) => switch (s) {
          AsyncSnapshot(hasError: true) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [InlineError(s.error!, onRetry: _refresh)],
          ),
          AsyncSnapshot(hasData: true) when _cat != null => _body(_cat!),
          _ => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        },
      ),
    ),
    bottomNavigationBar: _cat == null ? null : _saveBar(),
  );

  Widget _body(_Catalog c) {
    final p = Pal.of(context);
    final visible = _visible;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Group(
          title: 'Model',
          children: [
            for (final m in c.models)
              Cell(
                icon: HugeIcons.strokeRoundedAiChat02,
                title: '${m['label'] ?? m['id']}',
                subtitle: m['selectable'] == true
                    ? '${m['id']}${m['id'] == c.model ? ' · in use' : ''}'
                    : 'Not selectable · end of life ${m['endOfLife'] ?? 'announced'}',
                trailing: m['id'] == c.model
                    ? Pill('Active', p.success)
                    : Pill('Unavailable', p.sub),
              ),
          ],
        ),
        _previewPanel(c),
        Group(
          title: 'Delivery',
          footer: 'Volume applies on Sarvam Voice Agents; previews use pace only.',
          children: [
            _slider('Pace', _pace, c.paceMin, c.paceMax, (v) => setState(() => _pace = v)),
            _slider('Volume', _volume, c.volMin, c.volMax, (v) => setState(() => _volume = v)),
          ],
        ),
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final l in c.languages)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    key: ValueKey('lang-$l'),
                    label: Text(_languageNames[l] ?? l,
                        style: TextStyle(color: _language == l ? p.p.bg : p.text)),
                    selected: _language == l,
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                    onSelected: (_) => _setLanguage(l),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          decoration: InputDecoration(
            hintText: 'Search voices',
            prefixIcon: Padding(
              padding: const EdgeInsets.all(12),
              child: HugeIcon(icon: HugeIcons.strokeRoundedSearch01, color: p.sub, size: 18),
            ),
          ),
          onChanged: (v) => setState(() => _query = v),
        ),
        const SizedBox(height: 16),
        if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text('No voices match.', textAlign: TextAlign.center, style: TextStyle(color: p.sub)),
          )
        else
          Group(
            title: '${visible.length} voice${visible.length == 1 ? '' : 's'}',
            children: [
              for (final v in visible)
                Cell(
                  key: ValueKey('voice-${v.id}'),
                  title: v.name,
                  subtitle: v.style,
                  semanticsLabel: '${v.name}, ${v.style}${_speaker == v.id ? ', selected' : ''}',
                  trailing: HugeIcon(
                    icon: _speaker == v.id ? HugeIcons.strokeRoundedCheckmarkCircle02 : HugeIcons.strokeRoundedCircle,
                    color: _speaker == v.id ? p.text : p.sub,
                    size: 22,
                  ),
                  onTap: () => setState(() {
                    _speaker = v.id;
                    _previewError = null;
                  }),
                ),
            ],
          ),
      ],
    );
  }

  Widget _slider(String label, double value, double min, double max, ValueChanged<double> onChanged) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
    child: Row(
      children: [
        SizedBox(width: 64, child: Text(label)),
        Expanded(
          child: Slider(
            value: value.clamp(min, max),
            min: min,
            max: max,
            divisions: ((max - min) / 0.05).round(),
            label: value.toStringAsFixed(2),
            semanticFormatterCallback: (v) => '$label ${v.toStringAsFixed(2)}',
            onChanged: onChanged,
          ),
        ),
        SizedBox(width: 40, child: Text(value.toStringAsFixed(2))),
      ],
    ),
  );

  Widget _previewPanel(_Catalog c) {
    if (!c.previewAvailable) {
      return Group(
        title: 'Preview',
        children: [
          Cell(
            icon: HugeIcons.strokeRoundedAlert02,
            title: 'Preview unavailable · ${c.previewBlocker ?? 'unknown blocker'} missing',
            subtitle: 'Set this key on the server to hear voices before saving.',
          ),
        ],
      );
    }
    final canPreview = _current != null && !_previewing;
    return Group(
      title: 'Preview',
      children: [
        Cell(
          icon: _playing ? HugeIcons.strokeRoundedStopCircle : HugeIcons.strokeRoundedPlayCircle,
          title: _playing ? 'Stop preview' : (_previewing ? 'Generating preview…' : 'Play preview'),
          subtitle: _speaker == null ? 'Select a voice first' : '$_speaker · $_language',
          semanticsLabel: _playing ? 'Stop preview' : 'Play preview',
          trailing: _previewing
              ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const SizedBox.shrink(),
          onTap: _playing ? _stop : (canPreview ? _preview : null),
        ),
        if (_previewError != null)
          Padding(padding: const EdgeInsets.all(12), child: InlineError(_previewError!)),
      ],
    );
  }

  Widget _saveBar() => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_saveError != null) ...[InlineError(_saveError!), const SizedBox(height: 8)],
          if (_savedNotice != null && !_dirty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Semantics(
                liveRegion: true,
                child: Text(_savedNotice!, textAlign: TextAlign.center,
                    style: TextStyle(color: Pal.of(context).sub, fontWeight: FontWeight.w600)),
              ),
            ),
          SizedBox(
            height: 52,
            child: FilledButton(
              key: const ValueKey('save-voice'),
              onPressed: _dirty && !_saving ? _save : null,
              child: _saving
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_dirty ? 'Save voice' : (_saved == null ? 'Select a voice' : 'Saved')),
            ),
          ),
        ],
      ),
    ),
  );
}
