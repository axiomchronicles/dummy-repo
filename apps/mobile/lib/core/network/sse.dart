import 'dart:convert';

class SseEvent {
  final String event;
  final String data;
  final String? id;
  const SseEvent(this.event, this.data, [this.id]);
}

/// Incremental SSE decoder. Network chunks are not event boundaries:
/// [Utf8Decoder] carries split multi-byte sequences across chunks and
/// [LineSplitter] carries partial lines and a CR/LF pair split across chunks.
/// Multiline `data:` fields are joined with '\n'; a final event without a
/// trailing blank line is still dispatched when the stream closes.
Stream<SseEvent> decodeSse(Stream<List<int>> bytes) async* {
  var event = 'message';
  var data = <String>[];
  String? id;
  await for (final line
      in bytes
          .transform(const Utf8Decoder(allowMalformed: true))
          .transform(const LineSplitter())) {
    if (line.isEmpty) {
      if (data.isNotEmpty) yield SseEvent(event, data.join('\n'), id);
      event = 'message';
      data = [];
      continue;
    }
    if (line.startsWith(':')) continue;
    final index = line.indexOf(':');
    final field = index < 0 ? line : line.substring(0, index);
    var value = index < 0 ? '' : line.substring(index + 1);
    if (value.startsWith(' ')) value = value.substring(1);
    if (field == 'event') event = value;
    if (field == 'data') data.add(value);
    if (field == 'id' && !value.contains('\u0000')) id = value;
  }
  if (data.isNotEmpty) yield SseEvent(event, data.join('\n'), id);
}
