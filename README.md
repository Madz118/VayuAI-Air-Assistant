# VAYU AI — BREATHE SMARTER. LIVE BETTER.

**Urban Air Quality Intelligence Assistant**

VAYU AI helps individuals, families, and urban communities understand air pollution, anticipate exposure windows, protect sensitive household members, and adopt sustainable everyday habits using live Open-Meteo environmental forecasts and a verified multi-agent Gemini architecture.

---

## Problem Statement

Urban residents regularly encounter fragmented or opaque AQI numbers without actionable context:
- Single daily AQI values hide sharp hour-by-hour swings in PM2.5, NO₂, and ground-level ozone.
- People struggle to decide *when* to jog, open windows, or take children outdoors.
- Modelled atmospheric forecasts are frequently mislabelled as official local ground-station measurements (e.g., Indian CPCB AQI vs US EPA AQI).
- Generic chatbots often fabricate numbers, omit timestamps, or offer unsafe certainty guarantees.

## Chosen Challenge Vertical

**Environmental Intelligence, Public Health Preparedness & Sustainable Urban Mobility**

## Proposed Solution

VAYU AI pairs deterministic environmental parsing and WHO 2021 guideline comparisons with five specialized agents coordinated by a central orchestrator and grounded via server-side Gemini synthesis (`gemini-4-hydrogen`).

## Key Features

1. **Signature 3D Wind Environment**: Custom Three.js GLSL flowing wind ribbons and atmospheric particles with software-WebGL pacing, `prefers-reduced-motion` support, tab-visibility pausing, and graceful fallback.
2. **Air Intelligence Dashboard**: Live Open-Meteo CAMS & Weather integration (defaulting to Chennai, India, with global city search and explicit-consent browser geolocation), US AQI / EU EAQI scale switching, 6 pollutant breakdown cards, and Recharts historical/forecast charts.
3. **Interactive Pollution Map**: Leaflet + OpenStreetMap view showing the selected city node, 4 surrounding Open-Meteo CAMS grid points, and side-by-side city comparison.
4. **Ask VAYU AI**: Conversational assistant producing structured 6-part answers (Direct Answer, Environmental Evidence, Explanation, Recommended Actions, Limitations & Uncertainty, Source & Timestamp) with inspectable agent traces.
5. **Smart Routine Planner**: 3-hour forecast window ranking across 7 daily activities with weather dispersion context and indoor alternatives.
6. **Family Protection Manager**: Local-only browser household profile manager (Adult, Child, Older Adult, respiratory sensitivity) generating non-medical environmental precautions.
7. **Sustainability & Community**: Air-quality-gated low-emission travel guidance, transparent commute CO₂e comparison calculator, habit checklist, and consented community observation reporting with moderation flagging.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Leaflet + OpenStreetMap, Three.js, Lucide React, React Router
- **Backend**: Node.js, Express, `tsx`, `@google/genai` SDK (`gemini-4-hydrogen`)
- **Environmental Data**: Open-Meteo Air Quality API (CAMS), Open-Meteo Weather Forecast API, Open-Meteo Geocoding API
- **Testing**: Node.js built-in test runner (`node:test`, `node:assert/strict`) executed via `tsx --test`

---

## System & Multi-Agent Architecture

```text
Browser UI (React + Three.js + Leaflet + Recharts)
        │
        ▼  (/api/air-quality, /api/ask, /api/routine-plan, /api/community)
Express Server (server.ts — Rate Limited, Input Validated, Secret Isolated)
        ├──► Open-Meteo Client (10m AQ/Weather TTL Cache, 60m Geocode Cache)
        └──► VAYU Multi-Agent Orchestrator
                ├── 1. Pollution Intelligence Agent (Pollutants, WHO ratios, Trends)
                ├── 2. Family Protection Agent (Household exposure precautions)
                ├── 3. Smart Routine Agent (3-hour window suitability & alternatives)
                ├── 4. Sustainability Agent (AQ-gated active travel & DEFRA calc)
                ├── Gemini Service (@google/genai — single grounded JSON call)
                └── 5. Verification Agent (Freshness, Scale check, Safety guard)
```

### How the Five Agents Work
1. **Pollution Intelligence Agent** (`src/agents/pollutionIntelligenceAgent.ts`): Parses hourly PM2.5, PM10, NO₂, O₃, SO₂, and CO, identifies the dominant pollutant via WHO 2021 guideline ratios, evaluates 12h/24h trends, and measures completeness.
2. **Family Protection Agent** (`src/agents/familyProtectionAgent.ts`): Evaluates household groups (children, older adults, respiratory sensitivities) and outputs practical precautions while strictly avoiding clinical diagnosis or prescriptions.
3. **Smart Routine Agent** (`src/agents/smartRoutineAgent.ts`): Groups forecast hours into 3-hour blocks (`06:00–21:00`), scores suitability per activity exertion level, and surfaces indoor alternatives without ever promising zero risk.
4. **Sustainability Agent** (`src/agents/sustainabilityAgent.ts`): Gates cycling/walking advice by ambient AQI and provides transparent commute emission trade-offs using documented DEFRA-aligned factors.
5. **Verification Agent** (`src/agents/verificationAgent.ts`): Validates timestamp freshness, checks data completeness, enforces US AQI vs EU EAQI vs Indian CPCB separation, blocks absolute safety guarantees (`"100% safe"`), and flags cross-agent contradictions.

---

## Data Sources & Scale Honesty

- **Air Quality**: `https://air-quality-api.open-meteo.com/v1/air-quality` (Copernicus CAMS modelled atmospheric forecast).
- **Weather**: `https://api.open-meteo.com/v1/forecast`.
- **Geocoding**: `https://geocoding-api.open-meteo.com/v1/search`.

> **Important Distinction**: Open-Meteo CAMS data is a regional/global atmospheric model grid forecast, not a physical CPCB or EPA roadside monitoring station measurement. US EPA AQI and European EAQI are always labelled explicitly and are never equated to India’s official CPCB AQI.

---

## Implementation Status

- **Fully Implemented**:
  - Full-stack Express + Vite server (`server.ts`) with rate limiting and input validation
  - Live Open-Meteo Air Quality, Weather, Local Grid, and Geocoding integrations with TTL caching
  - All 5 deterministic agents + VAYU Orchestrator + server-side Gemini (`gemini-4-hydrogen`) structured synthesis
  - Signature 3D Three.js wind scene with software-WebGL pacing and reduced-motion/fallback support
  - All 8 application pages (`Landing`, `Dashboard`, `Pollution Map`, `Ask VAYU AI`, `Smart Routine Planner`, `Family Protection`, `Sustainability & Community`, `About & Methodology`)
  - Automated unit and orchestrator test suite (`src/tests/vayu.test.ts`)
- **Partially Implemented / Session-Scoped**:
  - Community Observations are stored in server memory (reset on server restart) and seeded with 2 explicitly labelled demonstration reports for immediate evaluation.
- **Planned for Future Releases**:
  - Integration with official physical ground-station feeds (e.g., OpenAQ / CPCB station APIs) alongside modelled grid forecasts for hyper-local calibration.
  - Persistent database storage for community moderation queues.

---

## Setup, Testing & Deployment

### Environment Variables
Defined in `.env.example` (set in AI Studio **Settings > Secrets**; never commit real keys):
- `GEMINI_API_KEY`: Server-side Gemini API key used exclusively in `src/services/geminiService.ts`.
- `APP_URL`: Application hosting URL.

### Local Development
```bash
npm install
npm run dev
```

### Run Automated Tests
```bash
npm test
# or directly:
npx --yes tsx --test src/tests/vayu.test.ts
```

### Type Check & Production Build
```bash
npm run lint
npm run build
npm start
```

---

## Privacy & Security Considerations

- `GEMINI_API_KEY` is accessed strictly on the Node.js server and never bundled into client assets.
- Household profiles and checklist progress are stored exclusively in browser `localStorage`.
- Browser geolocation and community observations require explicit user consent.
- External API errors surface honest retry prompts and never substitute fake environmental readings.
