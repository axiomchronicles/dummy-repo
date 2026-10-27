import { describe, it, expect } from 'vitest';
import { SarvamAI } from 'sarvamai';
import {
  VOICE_CATALOG,
  VOICE_CATALOG_SOURCE,
  VOICE_SPEAKERS,
  VoicePreviewRequestSchema,
  VoiceSelectionSchema,
  voiceIncompatibility,
} from './voices';
describe('Bulbul V4 voice catalog', () => {
  it('only contains SDK-enum IDs in v4 persona form, with no V3/V2 short names', () => {
    const sdk = new Set<string>(Object.values(SarvamAI.TextToSpeechSpeaker));
    expect(VOICE_SPEAKERS.length).toBe(219);
    expect(new Set(VOICE_SPEAKERS).size).toBe(VOICE_SPEAKERS.length);
    for (const id of VOICE_SPEAKERS) {
      expect(sdk.has(id)).toBe(true);
      expect(id).toMatch(/^[a-z]+_(hi|en|enhi|bn|gu|kn|mr|pa|ta|te)_[a-z_]+$/);
    }
    for (const id of [
      ...VOICE_CATALOG_SOURCE.excluded.sdkOnly,
      ...VOICE_CATALOG_SOURCE.excluded.docsOnly,
      'shubh',
      'anushka',
    ])
      expect(VOICE_SPEAKERS).not.toContain(id);
  });
  it('derives name, style and languages from the persona ID', () => {
    expect(VOICE_CATALOG.find((v) => v.id === 'shubh_enhi_ads')).toEqual({
      id: 'shubh_enhi_ads',
      name: 'Shubh',
      style: 'ads',
      languageTag: 'enhi',
      languages: ['en-IN', 'hi-IN'],
    });
  });
  it('rejects V3, unknown voices and language mismatches', () => {
    const ok = {
      model: 'bulbul:v4-flash',
      speaker: 'ritu_hi_customer',
      language: 'hi-IN',
    };
    expect(voiceIncompatibility(ok)).toBeNull();
    expect(voiceIncompatibility({ ...ok, model: 'bulbul:v3' })).toBe(
      'VOICE_MODEL_UNSUPPORTED',
    );
    expect(voiceIncompatibility({ ...ok, speaker: 'ritu' })).toBe(
      'VOICE_UNKNOWN',
    );
    expect(voiceIncompatibility({ ...ok, language: 'ta-IN' })).toBe(
      'VOICE_LANGUAGE_MISMATCH',
    );
    expect(VoiceSelectionSchema.parse(ok)).toEqual({
      ...ok,
      pace: 1,
      volume: 1,
    });
    expect(VoiceSelectionSchema.safeParse({ ...ok, volume: 0.5 }).success).toBe(
      false,
    );
    expect(VoiceSelectionSchema.safeParse({ ...ok, pitch: 0.2 }).success).toBe(
      false,
    );
    expect(
      VoicePreviewRequestSchema.safeParse({ ...ok, text: 'x'.repeat(201) })
        .success,
    ).toBe(false);
    expect(
      VoicePreviewRequestSchema.safeParse({ ...ok, language: 'ml-IN' }).success,
    ).toBe(false);
  });
});
