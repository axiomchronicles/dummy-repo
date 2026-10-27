# Sarvam API verification (2026-10-27)

Docs read live on 2026-10-27 (`.md` variants). SDK inspected: `node_modules/sarvamai@1.1.12`.

## Endpoints and SDK paths in use

| Use | Method / path | Auth | Verified by |
| --- | --- | --- | --- |
| Instant outbound call | `POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds` body `app_config{app_id,app_version,connection_config{connection_id,agent_phone_number},agent_variables?}`, `user_config{user_phone_number}`, `webhook_config{url,metadata}` → `200 {attempt_id}` | `X-API-Key` | https://docs.sarvam.ai/voice-agents/api/instant-outbound/create |
| Outbound webhook | `attempt_id`, `status` ∈ connected/no_answer/busy/failed, `channel_info`, `interaction_id`, `final_agent_variables`, `webhook_config` echo, `interaction_transcript[{role: agent/user, en_text}]` | none documented | https://docs.sarvam.ai/voice-agents/api/instant-outbound/webhook-payload |
| List attempts | `GET https://apps.sarvam.ai/api/analytics/v1/{org}/{ws}/{app_id}/attempts?start_datetime&end_datetime&filter_conditions&limit` | `X-API-Key` (Bearer not accepted) | https://docs.sarvam.ai/voice-agents/api/analytics/attempts |
| Transcript | `GET …/{app_id}/transcripts/{interaction_id}`; unknown ID → `200` with empty `messages`; roles `assistant`/`user` | `X-API-Key` | https://docs.sarvam.ai/voice-agents/api/analytics/transcripts |
| Recording | `GET …/{app_id}/recordings/{interaction_id}` → `audio/wav`; no recording → `404` | `X-API-Key` | https://docs.sarvam.ai/voice-agents/api/analytics/recordings |
| Analytics errors | 400 bad ID, 401 key missing/wrong org, 403 not authorized, 429 + `Retry-After` seconds, 500, 503 | | https://docs.sarvam.ai/voice-agents/api/analytics/overview |
| Voice preview (TTS) | SDK `client.textToSpeech.convert()` → `POST https://api.sarvam.ai/text-to-speech` `{text, language_code, speaker, model:"bulbul:v4-flash", pace?, speech_sample_rate, output_audio_codec:"wav"}` → `{request_id, audios:[base64 wav]}` | `api-subscription-key` (`SARVAM_MODEL_API_KEY`) | https://docs.sarvam.ai/api-reference/text-to-speech/convert, https://docs.sarvam.ai/api/getting-started/sdks |
| Voices MCP | `https://mcp.sarvam.ai/voice-agents` (streamable HTTP), tools `agents` / `configure_agent` / `configure_voicemail` | Sarvam SSO OAuth 2.1 | https://docs.sarvam.ai/voice-agents/mcp |

## Voice catalog

- Model: `bulbul:v4-flash` only. Bulbul V3 reaches end of life on Voice Agents on 2026-11-10 (https://docs.sarvam.ai/voice-agents/build/voice-language, https://docs.sarvam.ai/changelog). It stays on the TTS API but can't be selected here.
- Speaker IDs: the intersection of the SDK `TextToSpeechSpeaker` v4 persona IDs (222) and the "Bulbul v4 Flash Voices" table (222) at https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices, which gives 219 IDs. Excluded as conflicting: SDK-only `bappa_bn_conversation`, `vetri_ta_ads`, `vetri_ta_suspense`; docs-only `aravind_ta_ads`, `aravind_ta_suspense`, `arnab_bn_conversation`.
- Language compatibility comes from the ID's language tag (`enhi` → en-IN + hi-IN). v4-flash has no Malayalam or Odia personas.
- Controls: `pace` 0.5–2.0 (TTS ref, models page). `volume` 0.7–2.0 is a Voice Agents setting, stored only and never sent to TTS. `loudness` and `pitch` are v2-only on the TTS API and are omitted.

## Contradictions and unverifiable pieces

- Voice Agents shows V4 voices by display name (e.g. "Ritu - Hindi Support Agent"). Its internal voice ID and the mapping to TTS persona IDs aren't published, so the saved selection can't be pushed automatically. Apply it on the provider agent (dashboard or MCP `configure_agent`, whose schema is account-supplied) before binding.
- The docs have no public Voice Agents voice-catalog REST API. The MCP `agents` tool lists voices, but its operation name is undocumented.
- The voice-language V3→V4 table maps "Advait" to "Ashutosh - Hindi Conversational Voice", which looks like a docs error. It isn't used.
- The SDKs page says an invalid key returns 403. The TTS ref also lists `authentication_error`. Both 401 and 403 map to `VOICE_PREVIEW_AUTH`.
- Webhook signing is not documented. The bearer-path token design is unchanged.
- The call-recordings and create-campaign guide pages give no API details. The API reference pages above were used instead.
