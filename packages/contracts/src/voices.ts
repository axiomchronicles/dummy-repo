import { z } from 'zod';
/**
 * Server-side Bulbul voice catalog for Voice Agents.
 * Source: the intersection of the installed `sarvamai@1.1.12` TextToSpeechSpeaker enum
 * and the "Bulbul v4 Flash Voices" table at
 * https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices (read 2026-10-27).
 * IDs present in only one of the two sources are excluded (see VOICE_CATALOG_SOURCE.excluded).
 * Bulbul V3 is not selectable: it reaches end of life on Voice Agents on 2026-11-10
 * (https://docs.sarvam.ai/voice-agents/build/voice-language).
 */
export const VOICE_MODEL = 'bulbul:v4-flash';
export const VOICE_CATALOG_SOURCE = {
  kind: 'sdk_enum_and_docs',
  sdk: 'sarvamai@1.1.12 TextToSpeechSpeaker',
  docs: [
    'https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices',
    'https://docs.sarvam.ai/api-reference/text-to-speech/convert',
    'https://docs.sarvam.ai/voice-agents/build/voice-language',
  ],
  verifiedAt: '2026-10-27',
  excluded: {
    sdkOnly: ['bappa_bn_conversation', 'vetri_ta_ads', 'vetri_ta_suspense'],
    docsOnly: [
      'aravind_ta_ads',
      'aravind_ta_suspense',
      'arnab_bn_conversation',
    ],
  },
  endOfLife: [{ model: 'bulbul:v3', voiceAgentsEndOfLife: '2026-11-10' }],
  voiceAgentsNote:
    'Voice Agents shows Bulbul V4 voices by display name; its internal voice IDs are not published. Apply the saved selection on the provider agent (dashboard or MCP configure_agent) before binding.',
} as const;
// Voice ID middle token -> BCP-47 language codes accepted by /text-to-speech.
const LANGUAGE_TAGS = {
  hi: ['hi-IN'],
  en: ['en-IN'],
  enhi: ['en-IN', 'hi-IN'],
  bn: ['bn-IN'],
  gu: ['gu-IN'],
  kn: ['kn-IN'],
  mr: ['mr-IN'],
  pa: ['pa-IN'],
  ta: ['ta-IN'],
  te: ['te-IN'],
} as const;
export const VoiceLanguageSchema = z.enum([
  'hi-IN',
  'en-IN',
  'bn-IN',
  'gu-IN',
  'kn-IN',
  'mr-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
]);
export type VoiceLanguage = z.infer<typeof VoiceLanguageSchema>;
export const VOICE_SPEAKERS = [
  'aarti_hi_customer',
  'aayan_hi_conversational',
  'aditi_en_stories',
  'aditya_hi_conversational',
  'aditya_hi_sales',
  'advait_hi_character',
  'amelia_en_conversational',
  'amit_hi_conversational',
  'anand_hi_documentary',
  'anand_hi_news',
  'anand_pa_conversation',
  'anand_pa_customer',
  'aparna_en_companion',
  'aparna_en_edtech',
  'aparna_hi_customer',
  'aparna_hi_kyc',
  'aryaman_hi_ads',
  'ashok_hi_character',
  'ashok_hi_news',
  'ashutosh_hi_conversational',
  'ashwin_en_sports',
  'ashwin_en_sports_energetic',
  'bhavik_gu_conversation',
  'bimal_bn_suspense',
  'chaitra_hi_customer',
  'chaitra_kn_conversation',
  'chaitra_kn_narration',
  'chandrika_en_stories',
  'chetan_kn_conversation',
  'chhavi_hi_kids',
  'chirag_hi_social',
  'dev_en_conversational',
  'dev_en_recovery',
  'deven_en_conversation',
  'girish_en_devotional',
  'girish_en_documentary',
  'girish_hi_devotional',
  'gokul_ta_narration',
  'harpreet_pa_narration',
  'ishita_en_customer',
  'ishita_en_medical',
  'ishita_en_numbers',
  'ishita_en_social',
  'ishita_en_stories',
  'ishita_enhi_companion',
  'ishita_enhi_customer',
  'ishita_enhi_customer_expressive',
  'ishita_hi_ads',
  'ishita_hi_ads_informal',
  'ishita_hi_banking',
  'ishita_hi_devotional',
  'ishita_hi_edtech',
  'ishita_hi_numbers',
  'ishita_hi_social',
  'ishita_mr_conversational',
  'jaspal_pa_banking',
  'kabir_hi_conversational',
  'kalpit_en_edtech',
  'kavitha_te_conversation',
  'kavitha_te_narration',
  'kavya_hi_conversational',
  'kunal_hi_kids',
  'mahesh_hi_documentary',
  'manan_hi_conversational',
  'mani_hi_conversational',
  'mani_hi_devotional',
  'mohit_hi_conversational',
  'mrunal_mr_narration',
  'mukul_hi_ads',
  'mukul_hi_suspense',
  'mukul_mr_stories',
  'nachiket_en_ads',
  'nachiket_hi_devotional',
  'neha_en_customer',
  'neha_en_latenight',
  'neha_mr_narration',
  'nilesh_mr_conversation',
  'nupur_en_kids',
  'ojas_en_social',
  'payal_en_edtech',
  'pooja_gu_conversational',
  'pooja_gu_customer',
  'pooja_te_conversation',
  'priya_hi_recovery',
  'rahul_hi_conversational',
  'ratan_hi_customer_expressive',
  'ratan_hi_devotional',
  'ratan_hi_documentary',
  'ratan_hi_latenight',
  'ratan_hi_latenight_warm',
  'ratan_hi_recovery',
  'ratan_hi_social',
  'ratan_hi_sports',
  'rehan_hi_social',
  'ritu_en_edtech',
  'ritu_en_latenight',
  'ritu_en_medical',
  'ritu_en_reels',
  'ritu_hi_ads_formal',
  'ritu_hi_ads_informal',
  'ritu_hi_banking',
  'ritu_hi_conversation',
  'ritu_hi_customer',
  'ritu_hi_customer_utility',
  'ritu_hi_customer_warm',
  'ritu_hi_edtech',
  'ritu_hi_edtech_bot',
  'ritu_hi_insurance',
  'ritu_hi_kids',
  'ritu_hi_medical',
  'ritu_hi_reels',
  'ritu_hi_sales',
  'ritu_hi_social',
  'ritu_hi_social_lively',
  'ritu_mr_insurance',
  'ritu_mr_narration',
  'rohan_en_recovery',
  'roopa_bn_conversational',
  'roopa_en_conversational',
  'roopa_hi_companion',
  'roopa_hi_conversational',
  'roopa_hi_market',
  'roopa_hi_narration',
  'roopa_hi_recovery',
  'rupali_mr_stories',
  'rustom_en_suspense',
  'sanchita_en_companion',
  'sanchita_en_insurance',
  'sanchita_en_market',
  'sanchita_en_recovery',
  'sanchita_en_social',
  'sanchita_enhi_companion',
  'sanchita_hi_ads_formal',
  'sanchita_hi_ads_informal',
  'sanchita_hi_assistant',
  'sanchita_hi_banking',
  'sanchita_hi_edtech',
  'sanchita_hi_feedback',
  'sanchita_hi_interview',
  'sanchita_hi_kyc',
  'sanchita_hi_market',
  'sanchita_hi_romantic',
  'sanchita_hi_social',
  'sarang_en_narration',
  'sarika_hi_conversation',
  'shabana_en_edtech',
  'shalini_en_companion',
  'shalini_en_customer',
  'shalini_enhi_companion',
  'shalini_enhi_customer',
  'shalini_hi_companion',
  'shalini_hi_social',
  'shilpa_hi_narration',
  'shreya_hi_conversational',
  'shreya_hi_news',
  'shruti_hi_edtech',
  'shubh_en_ads',
  'shubh_en_audiobook',
  'shubh_en_narration',
  'shubh_en_narration_gentle',
  'shubh_en_numbers',
  'shubh_en_recovery',
  'shubh_en_sports',
  'shubh_enhi_ads',
  'shubh_enhi_banking',
  'shubh_enhi_companion',
  'shubh_hi_ads',
  'shubh_hi_customer',
  'shubh_hi_devotional',
  'shubh_hi_ecomm',
  'shubh_hi_recovery',
  'shubh_hi_stories_dramatic',
  'shubh_hi_stories_mixed',
  'simran_en_ads',
  'simran_en_automobile',
  'simran_en_conversation',
  'simran_en_customer',
  'simran_en_edtech',
  'simran_en_edtech_bot',
  'simran_en_narration',
  'simran_en_recovery',
  'simran_en_sales',
  'simran_en_therapist',
  'simran_enhi_banking_expressive',
  'simran_enhi_companion',
  'simran_enhi_customer',
  'simran_hi_assistant',
  'simran_hi_automobile',
  'simran_hi_conversation',
  'simran_hi_latenight',
  'simran_hi_narration',
  'simran_hi_news',
  'simran_hi_news_breaking',
  'simran_hi_recovery',
  'simran_hi_sales',
  'simran_hi_social_energetic',
  'simran_hi_social_excited',
  'soham_mr_narration',
  'sophia_en_conversational',
  'suchitra_hi_ecomm',
  'suchitra_kn_narration',
  'suhani_hi_social',
  'suman_hi_companion',
  'sumit_hi_conversational',
  'sunny_en_social',
  'sunny_enhi_customer',
  'sunny_hi_ads',
  'sunny_hi_reels',
  'tanya_hi_narration',
  'tarun_hi_conversational',
  'tarun_hi_sales',
  'tarun_te_narration',
  'vaibhav_hi_social',
  'vandana_hi_ecomm',
  'varun_en_ads',
  'varun_en_suspense',
  'vijay_ta_narration',
  'vipul_hi_social',
  'zarina_en_conversation',
] as const;
export type VoiceSpeaker = (typeof VOICE_SPEAKERS)[number];
export type VoiceCatalogItem = {
  id: VoiceSpeaker;
  name: string;
  style: string;
  languageTag: keyof typeof LANGUAGE_TAGS;
  languages: VoiceLanguage[];
};
export const VOICE_CATALOG: VoiceCatalogItem[] = VOICE_SPEAKERS.map((id) => {
  const [name, tag, ...style] = id.split('_') as [
    string,
    keyof typeof LANGUAGE_TAGS,
    ...string[],
  ];
  return {
    id,
    name: name[0]!.toUpperCase() + name.slice(1),
    style: style.join(' '),
    languageTag: tag,
    languages: [...LANGUAGE_TAGS[tag]],
  };
});
/** Returns null when compatible, otherwise a stable error code. */
export function voiceIncompatibility(input: {
  model: string;
  speaker: string;
  language: string;
}):
  | 'VOICE_MODEL_UNSUPPORTED'
  | 'VOICE_UNKNOWN'
  | 'VOICE_LANGUAGE_MISMATCH'
  | null {
  if (input.model !== VOICE_MODEL) return 'VOICE_MODEL_UNSUPPORTED';
  const voice = VOICE_CATALOG.find((item) => item.id === input.speaker);
  if (!voice) return 'VOICE_UNKNOWN';
  if (!voice.languages.includes(input.language as VoiceLanguage))
    return 'VOICE_LANGUAGE_MISMATCH';
  return null;
}
const compatible = <
  T extends { model: string; speaker: string; language: string },
>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  const code = voiceIncompatibility(value);
  if (code)
    ctx.addIssue({
      code: 'custom',
      path: [
        code === 'VOICE_MODEL_UNSUPPORTED'
          ? 'model'
          : code === 'VOICE_UNKNOWN'
            ? 'speaker'
            : 'language',
      ],
      message: code,
    });
};
const VoiceBase = {
  model: z.string().min(1).max(50),
  speaker: z.string().min(1).max(100),
  language: VoiceLanguageSchema,
};
/**
 * pace: 0.5–2.0 (TTS API, bulbul:v4-flash; Voice Agents "0.5x to 2.0x").
 * volume: 0.7–2.0, Voice Agents only (voice-language page); not sent to /text-to-speech,
 * where loudness is bulbul:v2-only. pitch is omitted: unsupported on v3/v4-flash TTS and
 * its Voice Agents range is undocumented.
 */
export const VoiceSelectionSchema = z
  .strictObject({
    ...VoiceBase,
    pace: z.number().min(0.5).max(2).default(1),
    volume: z.number().min(0.7).max(2).default(1),
  })
  .superRefine(compatible);
export type VoiceSelection = z.infer<typeof VoiceSelectionSchema>;
export const VOICE_PREVIEW_DEFAULT_TEXT: Record<VoiceLanguage, string> = {
  'hi-IN': 'नमस्ते, मैं आपकी कॉल पर बात करने वाली सहायक आवाज़ हूँ।',
  'en-IN': 'Hello, this is a short preview of the selected calling voice.',
  'bn-IN': 'নমস্কার, এটি নির্বাচিত কণ্ঠের একটি ছোট নমুনা।',
  'gu-IN': 'નમસ્તે, આ પસંદ કરેલા અવાજનું ટૂંકું ઉદાહરણ છે.',
  'kn-IN': 'ನಮಸ್ಕಾರ, ಇದು ಆಯ್ಕೆ ಮಾಡಿದ ಧ್ವನಿಯ ಚಿಕ್ಕ ಮಾದರಿ.',
  'mr-IN': 'नमस्कार, हा निवडलेल्या आवाजाचा छोटा नमुना आहे.',
  'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਇਹ ਚੁਣੀ ਹੋਈ ਆਵਾਜ਼ ਦਾ ਛੋਟਾ ਨਮੂਨਾ ਹੈ।',
  'ta-IN': 'வணக்கம், இது தேர்ந்தெடுக்கப்பட்ட குரலின் சிறிய மாதிரி.',
  'te-IN': 'నమస్కారం, ఇది ఎంచుకున్న గొంతు యొక్క చిన్న నమూనా.',
};
export const VOICE_PREVIEW_MAX_CHARS = 200;
export const VoicePreviewRequestSchema = z
  .strictObject({
    ...VoiceBase,
    text: z.string().trim().min(1).max(VOICE_PREVIEW_MAX_CHARS).optional(),
    pace: z.number().min(0.5).max(2).optional(),
  })
  .superRefine(compatible);
export type VoicePreviewRequest = z.infer<typeof VoicePreviewRequestSchema>;
