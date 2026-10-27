import type { Environment } from '@outreach/config';
import {
  SarvamAIClient,
  SarvamAIError,
  SarvamAITimeoutError,
  type SarvamAI,
} from 'sarvamai';
import {
  VOICE_PREVIEW_DEFAULT_TEXT,
  VOICE_SPEAKERS,
  VoicePreviewRequestSchema,
  VoiceLanguageSchema,
  type VoiceLanguage,
} from '@outreach/contracts';
// Compile-time proof that the catalog only contains IDs the installed SDK accepts.
const sdkSpeakers: readonly SarvamAI.TextToSpeechSpeaker[] = VOICE_SPEAKERS;
const sdkLanguages: readonly SarvamAI.TextToSpeechLanguage[] =
  VoiceLanguageSchema.options;
void sdkSpeakers;
void sdkLanguages;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export class VoicePreviewError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterMs = 0,
  ) {
    super(code);
    this.name = 'VoicePreviewError';
  }
}
export type VoicePreviewResult = {
  contentType: 'audio/wav';
  audioBase64: string;
  bytes: number;
  model: string;
  speaker: string;
  language: VoiceLanguage;
  text: string;
  requestId: string | null;
};
/** Sarvam REST /text-to-speech via the official SDK using SARVAM_MODEL_API_KEY. */
export class SarvamVoicePreview {
  constructor(
    private readonly config: Pick<Environment, 'MODEL_TIMEOUT_MS'> & {
      SARVAM_API_KEY?: string;
      SARVAM_MODEL_API_KEY?: string;
    },
    private readonly transport: typeof fetch = fetch,
  ) {}
  async synthesize(input: unknown): Promise<VoicePreviewResult> {
    const parsed = VoicePreviewRequestSchema.safeParse(input);
    if (!parsed.success) throw new VoicePreviewError('VOICE_INCOMPATIBLE');
    const apiKey = (this.config.SARVAM_MODEL_API_KEY ?? this.config.SARVAM_API_KEY)?.trim();
    if (!apiKey) throw new VoicePreviewError('MODEL_CONFIGURATION');
    const request = parsed.data;
    const text = request.text ?? VOICE_PREVIEW_DEFAULT_TEXT[request.language];
    const timeoutInSeconds = this.config.MODEL_TIMEOUT_MS / 1000;
    const client = new SarvamAIClient({
      apiSubscriptionKey: apiKey,
      fetch: this.transport,
      maxRetries: 0,
      timeoutInSeconds,
      logging: { silent: true },
    });
    let response: SarvamAI.TextToSpeechResponse;
    try {
      response = await client.textToSpeech.convert(
        {
          text,
          language_code: request.language,
          speaker: request.speaker as SarvamAI.TextToSpeechSpeaker,
          model: request.model as SarvamAI.TextToSpeechModel,
          ...(request.pace === undefined ? {} : { pace: request.pace }),
          speech_sample_rate: 22050,
          output_audio_codec: 'wav',
        },
        { maxRetries: 0, timeoutInSeconds },
      );
    } catch (error) {
      throw mapError(error);
    }
    const audio = response?.audios;
    if (
      !Array.isArray(audio) ||
      audio.length !== 1 ||
      typeof audio[0] !== 'string'
    )
      throw new VoicePreviewError('VOICE_PREVIEW_RESPONSE_INVALID');
    const bytes = Buffer.from(audio[0], 'base64');
    if (
      bytes.byteLength < 44 ||
      bytes.byteLength > MAX_AUDIO_BYTES ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE'
    )
      throw new VoicePreviewError('VOICE_PREVIEW_RESPONSE_INVALID');
    return {
      contentType: 'audio/wav',
      audioBase64: bytes.toString('base64'),
      bytes: bytes.byteLength,
      model: request.model,
      speaker: request.speaker,
      language: request.language,
      text,
      requestId: response.request_id ?? null,
    };
  }
}
function mapError(error: unknown): VoicePreviewError {
  if (error instanceof SarvamAITimeoutError)
    return new VoicePreviewError('VOICE_PREVIEW_TIMEOUT');
  if (error instanceof SarvamAIError) {
    const status = error.statusCode;
    if (status === 401 || status === 403)
      return new VoicePreviewError('VOICE_PREVIEW_AUTH');
    if (status === 429) {
      const seconds = Number(error.rawResponse?.headers?.get?.('retry-after'));
      return new VoicePreviewError(
        'VOICE_PREVIEW_RATE_LIMITED',
        Math.min(3600, Math.max(1, seconds || 60)) * 1000,
      );
    }
    if (status === 402) return new VoicePreviewError('VOICE_PREVIEW_QUOTA');
    if (status === 400 || status === 422)
      return new VoicePreviewError('VOICE_PREVIEW_REJECTED');
  }
  return new VoicePreviewError('VOICE_PREVIEW_PROVIDER_UNAVAILABLE');
}
