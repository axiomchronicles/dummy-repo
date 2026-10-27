import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:share_plus/share_plus.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Device speech, dictation and share behind one seam so widget tests can
/// override [chatDeviceProvider] instead of hitting platform channels.
abstract class ChatDevice {
  /// Speaks [text]; [onDone] fires on completion, cancel or error.
  Future<void> speak(String text, {required VoidCallback onDone});
  Future<void> stopSpeaking();

  /// Starts live dictation. Returns an error message when unavailable or
  /// permission was denied, otherwise null.
  Future<String?> startDictation({
    required void Function(String words) onWords,
    required VoidCallback onStopped,
  });
  Future<void> stopDictation();

  Future<void> share(String text, {String? subject});
}

class PluginChatDevice implements ChatDevice {
  FlutterTts? _tts;
  final _speech = SpeechToText();
  bool _speechReady = false;
  VoidCallback? _speechStopped;

  @override
  Future<void> speak(String text, {required VoidCallback onDone}) async {
    final tts = _tts ??= FlutterTts();
    tts.setCompletionHandler(onDone);
    tts.setCancelHandler(onDone);
    tts.setErrorHandler((_) => onDone());
    await tts.stop();
    await tts.speak(text);
  }

  @override
  Future<void> stopSpeaking() async => _tts?.stop();

  @override
  Future<String?> startDictation({
    required void Function(String words) onWords,
    required VoidCallback onStopped,
  }) async {
    _speechStopped = onStopped;
    if (!_speechReady) {
      String? failure;
      _speechReady = await _speech.initialize(
        onError: (e) {
          failure = e.errorMsg;
          _speechStopped?.call();
        },
        onStatus: (s) {
          if (s == 'done' || s == 'notListening') _speechStopped?.call();
        },
      );
      if (!_speechReady) {
        return failure ??
            'Microphone or speech recognition permission was denied.';
      }
    }
    await _speech.listen(
      onResult: (r) => onWords(r.recognizedWords),
      listenOptions: SpeechListenOptions(partialResults: true),
    );
    return null;
  }

  @override
  Future<void> stopDictation() => _speech.stop();

  @override
  Future<void> share(String text, {String? subject}) =>
      SharePlus.instance.share(ShareParams(text: text, subject: subject));
}

final chatDeviceProvider = Provider<ChatDevice>((ref) {
  final device = PluginChatDevice();
  ref.onDispose(() {
    device.stopSpeaking();
    device.stopDictation();
  });
  return device;
});
