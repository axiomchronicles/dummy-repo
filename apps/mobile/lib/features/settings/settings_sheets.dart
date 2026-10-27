import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_theme.dart';
import 'settings_providers.dart';
import 'settings_widgets.dart';

/// Runs [save]; returns null on success or an inline error string.
typedef SaveAction = Future<void> Function();

Future<String?> _attempt(SaveAction save) async {
  try {
    await save();
    return null;
  } catch (e) {
    return errorText(e);
  }
}

Future<T?> showSettingsSheet<T>(BuildContext context, Widget child) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    sheetAnimationStyle: reduceMotion(context) ? AnimationStyle.noAnimation : null,
    builder: (_) => Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
      child: child,
    ),
  );
}

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(title,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(color: p.text)),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

/// Text / number edit sheet with disabled-while-saving and inline error.
class TextEditSheet extends StatefulWidget {
  const TextEditSheet({
    super.key,
    required this.title,
    required this.initial,
    required this.onSave,
    this.hint,
    this.helper,
    this.number = false,
    this.validator,
  });
  final String title;
  final String initial;
  final String? hint;
  final String? helper;
  final bool number;
  final String? Function(String)? validator;
  final Future<void> Function(String value) onSave;
  @override
  State<TextEditSheet> createState() => _TextEditSheetState();
}

class _TextEditSheetState extends State<TextEditSheet> {
  late final _c = TextEditingController(text: widget.initial);
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final v = _c.text.trim();
    final invalid = widget.validator?.call(v);
    if (invalid != null) return setState(() => _error = invalid);
    setState(() {
      _saving = true;
      _error = null;
    });
    final err = await _attempt(() => widget.onSave(v));
    if (!mounted) return;
    if (err == null) return Navigator.of(context).pop(true);
    setState(() {
      _saving = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    return _SheetFrame(title: widget.title, children: [
      TextField(
        key: const Key('sheet-field'),
        controller: _c,
        autofocus: true,
        enabled: !_saving,
        keyboardType: widget.number
            ? const TextInputType.numberWithOptions(decimal: true)
            : TextInputType.text,
        decoration: InputDecoration(hintText: widget.hint),
        onSubmitted: (_) => _submit(),
      ),
      if (widget.helper != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(widget.helper!,
              style: TextStyle(fontSize: 12.5, color: p.muted)),
        ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(_error!,
              style: TextStyle(fontSize: 12.5, color: p.danger)),
        ),
      const SizedBox(height: 16),
      SaveButton(saving: _saving, onPressed: _submit),
    ]);
  }
}

class SaveButton extends StatelessWidget {
  const SaveButton(
      {super.key, required this.saving, required this.onPressed, this.label = 'Save'});
  final bool saving;
  final VoidCallback onPressed;
  final String label;
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: FilledButton(
        onPressed: saving ? null : onPressed,
        child: saving
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2))
            : Text(label,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

class PickerOption {
  const PickerOption(this.value, this.label, {this.subtitle});
  final String? value;
  final String label;
  final String? subtitle;
}

/// Searchable single-choice sheet. Saves on tap; stays open on error.
class PickerSheet extends StatefulWidget {
  const PickerSheet({
    super.key,
    required this.title,
    required this.options,
    required this.selected,
    required this.onSave,
    this.searchable = true,
  });
  final String title;
  final List<PickerOption> options;
  final String? selected;
  final bool searchable;
  final Future<void> Function(String? value) onSave;
  @override
  State<PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<PickerSheet> {
  String _q = '';
  String? _saving;
  bool _busy = false;
  String? _error;

  Future<void> _pick(String? value) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _saving = value;
      _error = null;
    });
    final err = await _attempt(() => widget.onSave(value));
    if (!mounted) return;
    if (err == null) return Navigator.of(context).pop(true);
    setState(() {
      _busy = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    final q = _q.toLowerCase();
    final shown = widget.options
        .where((o) =>
            q.isEmpty ||
            o.label.toLowerCase().contains(q) ||
            (o.subtitle ?? '').toLowerCase().contains(q) ||
            (o.value ?? '').toLowerCase().contains(q))
        .toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: _SheetFrame(title: widget.title, children: [
        if (widget.searchable)
          TextField(
            key: const Key('picker-search'),
            decoration: const InputDecoration(
                hintText: 'Search', prefixIcon: Icon(Icons.search, size: 20)),
            onChanged: (v) => setState(() => _q = v.trim()),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!,
                style: TextStyle(fontSize: 12.5, color: p.danger)),
          ),
        const SizedBox(height: 8),
        Expanded(
          child: shown.isEmpty
              ? Center(
                  child: Text('No matches',
                      style: TextStyle(color: p.muted)))
              : ListView.builder(
                  itemCount: shown.length,
                  itemBuilder: (_, i) {
                    final o = shown[i];
                    final sel = o.value == widget.selected;
                    return ListTile(
                      minTileHeight: 52,
                      enabled: !_busy,
                      title: Text(o.label, style: TextStyle(color: p.text)),
                      subtitle: o.subtitle == null
                          ? null
                          : Text(o.subtitle!,
                              style: TextStyle(color: p.muted, fontSize: 12.5)),
                      trailing: _busy && _saving == o.value
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : sel
                              ? Icon(Icons.check, color: p.text)
                              : null,
                      selected: sel,
                      onTap: () => _pick(o.value),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = true,
}) async {
  final p = SettingsPalette.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(c).pop(false),
            child: Text('Cancel', style: TextStyle(color: p.text))),
        TextButton(
            onPressed: () => Navigator.of(c).pop(true),
            child: Text(confirmLabel,
                style: TextStyle(
                    color: destructive ? p.danger : p.text,
                    fontWeight: FontWeight.w600))),
      ],
    ),
  );
  return ok ?? false;
}


/// Accent picker. Each tap persists via [accentProvider]; the app theme
/// rebuilds immediately, so the preview and the rest of the UI update live.
class AccentSheet extends ConsumerWidget {
  const AccentSheet({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = SettingsPalette.of(context);
    final b = Theme.of(context).brightness;
    final current = ref.watch(accentProvider);
    return _SheetFrame(title: 'Accent colour', children: [
      // Live preview: a user bubble and a primary chip in the accent.
      ExcludeSemantics(
        child: Container(
          key: const Key('accent-preview'),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
              color: p.group, borderRadius: BorderRadius.circular(24)),
          child: Row(children: [
            Icon(Icons.circle, color: current.resolve(b), size: 14),
            const SizedBox(width: 10),
            Expanded(
                child: Text('Preview', style: TextStyle(color: p.muted))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                  color: current.resolve(b),
                  borderRadius: BorderRadius.circular(999)),
              child: Text('Call 3 clinics',
                  style: TextStyle(
                      color: current.on(b), fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 16),
      SettingsGroup(inset: false, children: [
        for (final a in AppAccent.values)
          Semantics(
            button: true,
            selected: a == current,
            label: '${a.label} accent',
            excludeSemantics: true,
            child: InkWell(
              key: ValueKey('accent-${a.name}'),
              onTap: () {
                ref.read(hapticsProvider.notifier).tick();
                ref.read(accentProvider.notifier).set(a);
              },
              child: SizedBox(
                height: 56,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(children: [
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: a.resolve(b),
                        shape: BoxShape.circle,
                        border: Border.all(color: p.hairline),
                      ),
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                        child: Text(a.label,
                            style: TextStyle(fontSize: 16, color: p.text))),
                    if (a == current) Icon(Icons.check, color: p.text, size: 20),
                  ]),
                ),
              ),
            ),
          ),
      ]),
      const SizedBox(height: 16),
      SaveButton(
          saving: false,
          label: 'Done',
          onPressed: () => Navigator.of(context).maybePop()),
    ]);
  }
}
