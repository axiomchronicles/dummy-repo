import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'agents_models.dart';
import 'agents_widgets.dart';

/// Persona editor matching AgentInputSchema. [submit] receives the request body
/// and returns the saved agent (server response); errors render inline.
class AgentEditor extends StatefulWidget {
  final Agent? initial;
  final String submitLabel;
  final Future<Agent> Function(Map<String, dynamic> body) submit;
  final void Function(Agent saved) onSaved;
  const AgentEditor({
    super.key,
    this.initial,
    required this.submitLabel,
    required this.submit,
    required this.onSaved,
  });
  @override
  State<AgentEditor> createState() => _AgentEditorState();
}

class _AgentEditorState extends State<AgentEditor> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initial?.name);
  late final _description = TextEditingController(text: widget.initial?.description);
  late final _prompt = TextEditingController(text: widget.initial?.prompt);
  late final _language = TextEditingController(text: widget.initial?.language ?? 'English');
  late final List<TextEditingController> _questions = [
    for (final q in widget.initial?.questions ?? const <String>[]) TextEditingController(text: q),
  ];
  bool _saving = false;
  Object? _error;

  @override
  void dispose() {
    for (final c in [_name, _description, _prompt, _language, ..._questions]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await widget.submit({
        'name': _name.text.trim(),
        'description': _description.text.trim(),
        'prompt': _prompt.text.trim(),
        'questions': [
          for (final q in _questions)
            if (q.text.trim().isNotEmpty) q.text.trim(),
        ],
        'language': _language.text.trim(),
      });
      if (mounted) widget.onSaved(saved);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? Function(String?) _required(String label, int max) => (v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return '$label is required';
    if (t.length > max) return '$label must be at most $max characters';
    return null;
  };

  Widget _field(String label, TextEditingController c, {int lines = 1, String? Function(String?)? validator, int? max}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextFormField(
          controller: c,
          minLines: lines,
          maxLines: lines == 1 ? 1 : lines + 6,
          maxLength: max,
          validator: validator,
          decoration: InputDecoration(labelText: label, counterText: ''),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final p = Pal.of(context);
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _field('Name', _name, validator: _required('Name', 100), max: 100),
          _field('Description', _description, lines: 2, max: 1000),
          _field('Prompt', _prompt, lines: 4, validator: _required('Prompt', 10000), max: 10000),
          _field('Language', _language, validator: _required('Language', 50), max: 50),
          Row(
            children: [
              Expanded(
                child: Text('Questions', style: TextStyle(color: p.sub, fontSize: 13, fontWeight: FontWeight.w500)),
              ),
              TextButton.icon(
                onPressed: _questions.length >= 20
                    ? null
                    : () => setState(() => _questions.add(TextEditingController())),
                icon: HugeIcon(icon: HugeIcons.strokeRoundedAdd01, color: p.text, size: 16),
                label: const Text('Add question'),
              ),
            ],
          ),
          for (var i = 0; i < _questions.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _questions[i],
                      maxLength: 300,
                      decoration: InputDecoration(labelText: 'Question ${i + 1}', counterText: ''),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove question ${i + 1}',
                    icon: HugeIcon(icon: HugeIcons.strokeRoundedDelete02, color: p.sub, size: 18),
                    onPressed: () => setState(() => _questions.removeAt(i).dispose()),
                  ),
                ],
              ),
            ),
          if (_error != null) ...[const SizedBox(height: 8), InlineError(_error!)],
          const SizedBox(height: 16),
          SizedBox(
            height: 52,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(widget.submitLabel),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet: POST /agents, pops with the created [Agent].
class NewAgentSheet extends ConsumerWidget {
  const NewAgentSheet({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('New agent', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          AgentEditor(
            submitLabel: 'Create agent',
            submit: (body) async => Agent.fromJson(
              Map<String, dynamic>.from(await ref.read(apiClientProvider).post('/api/v1/agents', body: body)),
            ),
            onSaved: (a) => Navigator.of(context).pop(a),
          ),
        ],
      ),
    ),
  );
}
