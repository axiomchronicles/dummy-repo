import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';

/// Minimal markdown for assistant turns: headings, bullet/numbered lists,
/// fenced code (with copy), **bold**, *italic* / _italic_ and `inline code`.
/// ponytail: hand-rolled subset; swap for a markdown package if tables/links matter.
class ChatMarkdown extends StatelessWidget {
  const ChatMarkdown(this.source, {super.key, this.trailing});

  final String source;

  /// Appended after the last block (the streaming dot).
  final Widget? trailing;

  static final _heading = RegExp(r'^(#{1,6})\s+(.*)$');
  static final _bullet = RegExp(r'^(\s*)[-*•]\s+(.*)$');
  static final _numbered = RegExp(r'^(\s*)(\d+)[.)]\s+(.*)$');
  static final _inline = RegExp(
    r'(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)',
  );

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final body = TextStyle(fontSize: 16, height: 1.5, color: p.text);
    final blocks = <Widget>[];
    final lines = source.split('\n');
    final para = <String>[];

    void flushPara() {
      if (para.isEmpty) return;
      blocks.add(_rich(context, para.join('\n'), body));
      para.clear();
    }

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (line.trimLeft().startsWith('```')) {
        flushPara();
        final lang = line.trimLeft().substring(3).trim();
        final code = <String>[];
        i++;
        while (i < lines.length && !lines[i].trimLeft().startsWith('```')) {
          code.add(lines[i]);
          i++;
        }
        blocks.add(_CodeBlock(code: code.join('\n'), language: lang));
        continue;
      }
      final h = _heading.firstMatch(line);
      final b = _bullet.firstMatch(line);
      final n = _numbered.firstMatch(line);
      if (h != null) {
        flushPara();
        final size = switch (h.group(1)!.length) { 1 => 22.0, 2 => 19.0, _ => 17.0 };
        blocks.add(_rich(
          context,
          h.group(2)!,
          body.copyWith(fontSize: size, fontWeight: FontWeight.w700),
        ));
      } else if (b != null || n != null) {
        flushPara();
        final indent = (b?.group(1) ?? n!.group(1)!).length ~/ 2;
        final marker = b != null ? '•' : '${n!.group(2)}.';
        blocks.add(Padding(
          padding: EdgeInsets.only(left: 4.0 + indent * 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: b != null ? 18 : 26,
                child: Text(marker, style: body.copyWith(color: p.muted)),
              ),
              Expanded(child: _rich(context, b?.group(2) ?? n!.group(3)!, body)),
            ],
          ),
        ));
      } else if (line.trim().isEmpty) {
        flushPara();
      } else {
        para.add(line);
      }
    }
    flushPara();
    if (trailing != null) {
      blocks.add(Align(alignment: Alignment.centerLeft, child: trailing));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, w) in blocks.indexed)
          Padding(padding: EdgeInsets.only(top: i == 0 ? 0 : 8), child: w),
      ],
    );
  }

  Widget _rich(BuildContext context, String text, TextStyle base) {
    final p = context.palette;
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _inline.allMatches(text)) {
      if (m.start > last) spans.add(TextSpan(text: text.substring(last, m.start)));
      final t = m.group(0)!;
      if (t.startsWith('**') || t.startsWith('__')) {
        spans.add(TextSpan(
          text: t.substring(2, t.length - 2),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ));
      } else if (t.startsWith('`')) {
        spans.add(TextSpan(
          text: t.substring(1, t.length - 1),
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: base.fontSize! * 0.88,
            backgroundColor: p.chip,
          ),
        ));
      } else {
        spans.add(TextSpan(
          text: t.substring(1, t.length - 1),
          style: const TextStyle(fontStyle: FontStyle.italic),
        ));
      }
      last = m.end;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return Text.rich(TextSpan(style: base, children: spans));
  }
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock({required this.code, required this.language});
  final String code;
  final String language;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: p.group,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  language.isEmpty ? 'code' : language,
                  style: TextStyle(fontSize: 12, color: p.muted),
                ),
              ),
              IconButton(
                tooltip: 'Copy code',
                icon: HugeIcon(icon: HugeIcons.strokeRoundedCopy01, color: p.muted, size: 16),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: code));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context)
                        .showSnackBar(const SnackBar(content: Text('Copied')));
                  }
                },
              ),
            ],
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Text(
              code,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 13.5,
                height: 1.45,
                color: p.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
