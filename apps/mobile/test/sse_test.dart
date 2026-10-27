import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/sse.dart';

Future<List<SseEvent>> decodeChunks(List<List<int>> chunks) =>
    decodeSse(Stream.fromIterable(chunks)).toList();

void main() {
  test('one byte per chunk: UTF-8 splits, CRLF, comments, multiline', () async {
    final bytes = utf8.encode(
      ': keepalive\r\nevent: delta\r\ndata: héllo\r\ndata: 世界\r\n\r\nevent: done\ndata: final',
    );
    final result = await decodeChunks([
      for (final b in bytes) [b],
    ]);
    expect(result.map((e) => e.event), ['delta', 'done']);
    expect(result.map((e) => e.data), ['héllo\n世界', 'final']);
  });

  test('CR and LF split across chunks is a single line break', () async {
    final result = await decodeChunks([
      utf8.encode('event: delta\r'),
      utf8.encode('\ndata: {"text":"a"}\r'),
      utf8.encode('\n\r'),
      utf8.encode('\n'),
    ]);
    expect(result, hasLength(1));
    expect(result.single.event, 'delta');
    expect(result.single.data, '{"text":"a"}');
  });

  test('a multi-byte character split across two chunks stays intact', () async {
    final emoji = utf8.encode('data: 👋\n\n');
    final result = await decodeChunks([emoji.sublist(0, 8), emoji.sublist(8)]);
    expect(result.single.data, '👋');
  });

  test('several events in one chunk keep order and reset event name', () async {
    final result = await decodeChunks([
      utf8.encode(
        'event: delta\ndata: {"text":"He"}\n\nevent: delta\ndata: {"text":"llo"}\n\ndata: plain\n\n',
      ),
    ]);
    expect(result.map((e) => e.event), ['delta', 'delta', 'message']);
    expect(
      result.take(2).map((e) => jsonDecode(e.data)['text']).join(),
      'Hello',
    );
  });

  test('final unterminated event, ids, and unknown events are kept', () async {
    final result = await decodeChunks([
      utf8.encode('id: 7\nevent: tool.future_kind\ndata: {}\n\n'),
      utf8.encode('event: error\ndata: {"message":"x"}'),
    ]);
    expect(result.map((e) => e.event), ['tool.future_kind', 'error']);
    expect(result.first.id, '7');
    expect(result.last.data, '{"message":"x"}');
  });

  test('data-less blocks are dropped; bare "data" is an empty payload', () async {
    final result = await decodeChunks([utf8.encode('event: ping\n\ndata\n\n')]);
    expect(result.single.data, '');
    expect(result.single.event, 'message');
  });
}
