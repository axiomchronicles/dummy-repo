import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import 'chat_device.dart';
import 'chat_messages.dart';

/// ChatGPT-style pill: "+", growing field, mic (live dictation), send/stop.
class ChatComposer extends ConsumerStatefulWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.streaming,
    required this.busy,
    required this.canSendEmpty,
    required this.onPlus,
    required this.onSend,
    required this.onStop,
    this.header,
  });
  final TextEditingController controller;
  final bool streaming;

  /// Thread creation / upload in flight: send disabled.
  final bool busy;

  /// An attachment alone is sendable.
  final bool canSendEmpty;
  final VoidCallback onPlus;
  final VoidCallback onSend;
  final VoidCallback onStop;

  /// Attachment / upload status shown above the field.
  final Widget? header;

  @override
  ConsumerState<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends ConsumerState<ChatComposer>
    with SingleTickerProviderStateMixin {
  bool _listening = false;
  String? _micError;
  String _prefix = '';
  late final _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    if (_listening) ref.read(chatDeviceProvider).stopDictation();
    _pulse.dispose();
    super.dispose();
  }

  void _setListening(bool on) {
    if (!mounted) return;
    setState(() => _listening = on);
    if (on && !MediaQuery.disableAnimationsOf(context)) {
      _pulse.repeat(reverse: true);
    } else {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  Future<void> _toggleMic() async {
    final device = ref.read(chatDeviceProvider);
    if (_listening) {
      await device.stopDictation();
      _setListening(false);
      return;
    }
    final current = widget.controller.text;
    _prefix = current.isEmpty || current.endsWith(' ') ? current : '$current ';
    setState(() => _micError = null);
    final error = await device.startDictation(
      onWords: (words) {
        final text = '$_prefix$words';
        widget.controller.value = TextEditingValue(
          text: text,
          selection: TextSelection.collapsed(offset: text.length),
        );
      },
      onStopped: () => _setListening(false),
    );
    if (!mounted) return;
    if (error != null) {
      setState(() => _micError = error);
    } else {
      _setListening(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final hasText = widget.controller.text.trim().isNotEmpty;
    final Widget action;
    if (widget.streaming) {
      // ChatGPT-style animated waveform bars while streaming
      action = _WaveformButton(
        key: const ValueKey('composer-waveform'),
        tooltip: 'Stop generating',
        onPressed: widget.onStop,
        palette: p,
        animating: true,
      );
    } else if (hasText || widget.canSendEmpty) {
      action = _CircleButton(
        key: const ValueKey('composer-send'),
        tooltip: 'Send message',
        onPressed: widget.busy ? null : widget.onSend,
        child: HugeIcon(
          icon: HugeIcons.strokeRoundedArrowUp02,
          color: p.onAccent,
          size: 20,
          strokeWidth: 2.2,
        ),
      );
    } else {
      // Idle waveform mic button (static, no animation)
      action = _WaveformButton(
        key: const ValueKey('composer-mic-idle'),
        tooltip: 'Voice input',
        onPressed: widget.streaming ? null : _toggleMic,
        palette: p,
        animating: _listening,
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_micError != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
            child: Semantics(
              liveRegion: true,
              child: Text(_micError!, style: TextStyle(fontSize: 13, color: p.danger)),
            ),
          ),
        Container(
          decoration: BoxDecoration(
            color: p.field,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: p.hairline),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.header != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                  child: widget.header,
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  ChatIconButton(
                    tooltip: 'Add attachments and actions',
                    icon: HugeIcon(icon: HugeIcons.strokeRoundedAdd01, color: p.text, size: 22),
                    onPressed: widget.onPlus,
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: TextField(
                        controller: widget.controller,
                        minLines: 1,
                        maxLines: 6,
                        keyboardType: TextInputType.multiline,
                        textInputAction: TextInputAction.newline,
                        textCapitalization: TextCapitalization.sentences,
                        style: TextStyle(fontSize: 16, color: p.text),
                        decoration: InputDecoration(
                          hintText: 'Reply to Outreach',
                          hintStyle: TextStyle(color: p.subtle),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          filled: false,
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                  ),
                  // Mic button only shown when user has typed text (waveform handles idle)
                  if (hasText)
                    ChatIconButton(
                      tooltip: _listening ? 'Stop dictation' : 'Dictate',
                      onPressed: widget.streaming ? null : _toggleMic,
                      icon: ScaleTransition(
                        scale: Tween(begin: 1.0, end: 1.25).animate(_pulse),
                        child: HugeIcon(
                          icon: HugeIcons.strokeRoundedMic01,
                          color: _listening ? p.accent : p.text,
                          size: 22,
                        ),
                      ),
                    ),
                  action,
                  const SizedBox(width: 2),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    super.key,
    required this.tooltip,
    required this.onPressed,
    required this.child,
  });
  final String tooltip;
  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: InkResponse(
          onTap: onPressed,
          radius: 24,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: onPressed == null ? p.subtle : p.accent,
                  shape: BoxShape.circle,
                ),
                child: Center(child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Animated waveform button — used for voice/streaming states.
/// Shows 5 animated vertical bars inside a blue circle.
class _WaveformButton extends StatefulWidget {
  const _WaveformButton({
    super.key,
    required this.tooltip,
    required this.onPressed,
    required this.palette,
    required this.animating,
  });
  final String tooltip;
  final VoidCallback? onPressed;
  final AppPalette palette;
  final bool animating;

  @override
  State<_WaveformButton> createState() => _WaveformButtonState();
}

class _WaveformButtonState extends State<_WaveformButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    if (widget.animating) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(_WaveformButton old) {
    super.didUpdateWidget(old);
    if (widget.animating && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    } else if (!widget.animating && _ctrl.isAnimating) {
      _ctrl.stop();
      _ctrl.value = 0.3;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    return Tooltip(
      message: widget.tooltip,
      child: Semantics(
        button: true,
        label: widget.tooltip,
        child: InkResponse(
          onTap: widget.onPressed,
          radius: 24,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: widget.onPressed == null ? p.subtle : p.accent,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: AnimatedBuilder(
                    animation: _ctrl,
                    builder: (context, child) {
                      const barHeights = [0.45, 0.85, 0.65, 1.0, 0.55];
                      const offsets = [0.0, 1.3, 0.7, 2.0, 0.4];
                      return Row(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          for (int i = 0; i < barHeights.length; i++) ...[
                            if (i > 0) const SizedBox(width: 2),
                            Container(
                              width: 2.5,
                              height: widget.animating
                                  ? 3 + 11 * ((math.sin((_ctrl.value * 2 * math.pi) + offsets[i]) + 1) / 2 * barHeights[i])
                                  : 3 + 8 * barHeights[i],
                              decoration: BoxDecoration(
                                color: p.onAccent,
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ],
                        ],
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
