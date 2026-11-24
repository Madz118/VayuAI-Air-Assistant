import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSmartRoutineAgent } from './src/agents/smartRoutineAgent.ts';
import { runVerificationAgent } from './src/agents/verificationAgent.ts';
import { ACTIVITIES_META, DEFAULT_CITY } from './src/config/constants.ts';
import { runVayuOrchestrator } from './src/orchestrator/vayuOrchestrator.ts';
import {
  addCommunityReport,
  deleteCommunityReport,
  flagCommunityReport,
  listCommunityReports,
} from './src/services/communityStore.ts';
import { synthesizeVayuResponse } from './src/services/geminiService.ts';
import {
  fetchEnvironmentalDataset,
  fetchLocalForecastGrid,
  searchCities,
} from './src/services/openMeteoClient.ts';
import type {
  ActivityType,
  AqiScale,
  CityLocation,
  HouseholdProfile,
} from './src/types/airQuality.ts';
import { validateCommunityReportInput, validateCoordinates } from './src/utils/validators.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '100kb' }));

// Simple per-IP rate limiter for API routes (120 requests / minute)
const rateMap = new Map<string, { count: number; resetAt: number }>();
app.use('/api', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (entry.count >= 120) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please pause briefly and try again.' });
  }
  entry.count += 1;
  return next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'VAYU AI Server',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    ),
  });
});

app.get('/api/air-quality', async (req, res) => {
  try {
    const lat = req.query.lat ? Number(req.query.lat) : DEFAULT_CITY.latitude;
    const lon = req.query.lon ? Number(req.query.lon) : DEFAULT_CITY.longitude;
    const coords = validateCoordinates(lat, lon);
    if (!coords.valid) {
      return res.status(400).json({ error: coords.error });
    }

    const name = typeof req.query.name === 'string' && req.query.name.trim() ? req.query.name.trim().slice(0, 80) : DEFAULT_CITY.name;
    const country = typeof req.query.country === 'string' ? req.query.country.trim().slice(0, 60) : '';
    const region = typeof req.query.region === 'string' ? req.query.region.trim().slice(0, 60) : undefined;

    const dataset = await fetchEnvironmentalDataset({
      name,
      country,
      region,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    return res.json(dataset);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch environmental data.';
    return res.status(502).json({ error: message });
  }
});

app.get('/api/air-quality/grid', async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? DEFAULT_CITY.latitude);
    const lon = Number(req.query.lon ?? DEFAULT_CITY.longitude);
    const coords = validateCoordinates(lat, lon);
    if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
      return res.status(400).json({ error: coords.error });
    }
    const grid = await fetchLocalForecastGrid(coords.latitude, coords.longitude);
    return res.json({
      source: 'Open-Meteo Air Quality API (CAMS Modelled Grid)',
      points: grid,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch local forecast grid.';
    return res.status(502).json({ error: message });
  }
});

app.get('/api/geocode', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const results = await searchCities(q);
    return res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'City lookup failed.';
    return res.status(400).json({ error: message });
  }
});

app.post('/api/ask', async (req, res) => {
  try {
    const body = req.body as {
      query?: string;
      location?: Partial<CityLocation>;
      profiles?: HouseholdProfile[];
      preferredScale?: AqiScale;
    };

    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 500) : '';
    if (query.length < 3) {
      return res.status(400).json({ error: 'Please enter a question of at least 3 characters.' });
    }

    const preferredScale: AqiScale =
      body.preferredScale === 'european_aqi' ? 'european_aqi' : 'us_aqi';
    const profiles = Array.isArray(body.profiles) ? body.profiles.slice(0, 12) : [];

    let dataset = null;
    try {
      dataset = await fetchEnvironmentalDataset(body.location ?? DEFAULT_CITY);
    } catch {
      dataset = null;
    }

    const result = await runVayuOrchestrator({
      query,
      dataset,
      profiles,
      preferredScale,
      synthesizer: synthesizeVayuResponse,
    });

    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process VAYU AI request.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/routine-plan', async (req, res) => {
  try {
    const body = req.body as {
      location?: Partial<CityLocation>;
      activity?: ActivityType;
      date?: string;
      preferredScale?: AqiScale;
    };

    const preferredScale: AqiScale =
      body.preferredScale === 'european_aqi' ? 'european_aqi' : 'us_aqi';
    const activity = ACTIVITIES_META.some((a) => a.id === body.activity)
      ? (body.activity as ActivityType)
      : 'outdoor_exercise';
    const dateStr =
      typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : undefined;

    const dataset = await fetchEnvironmentalDataset(body.location ?? DEFAULT_CITY);
    const routine = runSmartRoutineAgent(dataset, activity, dateStr, preferredScale);
    const { agentResult: verificationAgentResult, report: verification } = runVerificationAgent({
      dataset,
      agentResults: [routine.agentResult],
      preferredScale,
    });

    const actMeta = ACTIVITIES_META.find((a) => a.id === activity) ?? ACTIVITIES_META[0];

    return res.json({
      activity,
      activityLabel: actMeta.label,
      date: routine.resolvedDate,
      windows: routine.windows,
      bestWindow: routine.bestWindow,
      summary: routine.agentResult.recommendation,
      disclaimer:
        'Forecast windows indicate relative modelled air-quality patterns and never guarantee zero health risk or complete safety.',
      agentResults: [routine.agentResult, verificationAgentResult],
      verification,
      dataTimestamp: dataset.currentTimestamp,
      dataSource: `${dataset.modelSource} & ${dataset.weatherSource}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build routine plan.';
    return res.status(502).json({ error: message });
  }
});

app.get('/api/community', (req, res) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  return res.json({
    reports: listCommunityReports(city),
    notice: 'Community observations are user-submitted reports and are not scientifically calibrated sensor measurements.',
  });
});

app.post('/api/community', (req, res) => {
  const validated = validateCommunityReportInput(req.body);
  if (!validated.valid || !validated.sanitized) {
    return res.status(400).json({ error: validated.error });
  }
  const created = addCommunityReport(validated.sanitized);
  return res.status(201).json({ report: created });
});

app.post('/api/community/:id/flag', (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Flagged by community';
  const updated = flagCommunityReport(req.params.id, reason);
  if (!updated) {
    return res.status(404).json({ error: 'Observation not found.' });
  }
  return res.json({ report: updated });
});

app.delete('/api/community/:id', (req, res) => {
  const removed = deleteCommunityReport(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Observation not found.' });
  }
  return res.json({ deleted: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VAYU AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
