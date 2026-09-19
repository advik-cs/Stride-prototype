# STRIDE Automated Verification & Test Suite

This directory contains automated regression suites, end-to-end endpoint verifications, and conversational grounding checks for the STRIDE platform.

---

## 🧪 Test Suite Index

| Test Script | Target Subsystem | Description | Command |
| :--- | :--- | :--- | :--- |
| **`verify_mandatory_regression.ts`** | Core Voice & SOS Engine | 9-point regression suite covering voice emergency state transitions, condition tagging, and metadata persistence. | `npm run test:regression` |
| **`verify_voice_emergency_suite.ts`** | Voice AI & Priority Engine | 14-point test suite for Gemini 2.5 Flash audio transcription, structured extraction, fallback parser, and priority scoring. | `npm test` |
| **`verify_conversational_grounding.ts`** | Gemini Context Grounding | Tests context isolation, anti-hallucination guardrails, and conversational progression. | `npx tsx tests/verify_conversational_grounding.ts` |
| **`test_5message_sequence.ts`** | Multi-Turn Dialogue | Verifies 5-turn citizen voice dialogue progression without repetitive or intrusive queries. | `npx tsx tests/test_5message_sequence.ts` |
| **`test_text_people_update.ts`** | Headcount Entity Extraction | Tests incremental updates to reported stranded headcount during ongoing triage. | `npx tsx tests/test_text_people_update.ts` |
| **`verify_real_browser_voice.ts`** | Browser Audio Ingestion | Validates decoding of browser `MediaRecorder` WebM and WAV multipart buffers. | `npx tsx tests/verify_real_browser_voice.ts` |
| **`verify_voice_http_endpoint.ts`** | Voice HTTP Route | Tests `POST /api/voice/emergency-call` and `POST /api/voice/chat-message`. | `npx tsx tests/verify_voice_http_endpoint.ts` |
| **`verify_deployed_e2e.ts`** | E2E Service Integration | Comprehensive end-to-end integration and smoke verification against live endpoints. | `npx tsx tests/verify_deployed_e2e.ts` |
| **`verify_hospital_and_shelter_suite.ts`** | Facilities & Telemetry | Verifies Bengaluru hospital dataset, ICU/bed metrics, and shelter occupancy tracking. | `npx tsx tests/verify_hospital_and_shelter_suite.ts` |

---

## 🚀 Running Tests

Execute the primary regression and verification suites via npm:

```bash
# Run 14-point Voice AI & Priority Engine test suite
npm test

# Run 9-point Voice Emergency & SOS regression suite
npm run test:regression

# Run specific suite directly with tsx
npx tsx tests/verify_conversational_grounding.ts
```
