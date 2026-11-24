import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
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
  getCommunityStorageInfo,
  listCommunityReports,
} from './src/services/communityStore.ts';
import { synthesizeVayuResponse } from './src/services/geminiService.ts';
import {
  fetchEnvironmentalDataset,
  fetchLocalForecastGrid,
  searchCities,
} from './src/services/openMeteoClient.ts';
import { SlidingWindowRateLimiter } from './src/utils/rateLimiter.ts';
import {
  sanitizeCityQuery,
  sanitizePlainText,
  validateActivityType,
  validateAqiScale,
  validateCalendarDate,
  validateCommunityReportInput,
  validateCoordinates,
  validateFlagReason,
  validateHouseholdProfiles,
  validateLocationInput,
  validateReportId,
} from './src/utils/validators.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

app.use(express.json({ limit: '100kb' }));

// Return clean JSON 400 on malformed JSON payloads instead of HTML stack traces
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request body.' });
  }
  return next(err);
});

// Bounded per-IP sliding-window rate limiter (120 requests / minute) with periodic cleanup
const apiRateLimiter = new SlidingWindowRateLimiter({
  maxRequests: 120,
  windowMs: 60_000,
  maxEntries: 5000,
});
setInterval(() => {
  apiRateLimiter.cleanup();
}, 60_000).unref();

app.use('/api', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const decision = apiRateLimiter.check(ip);
  res.setHeader('X-RateLimit-Limit', String(decision.limit));
  res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
  if (!decision.allowed) {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    return res.status(429).json({
      error: 'Rate limit exceeded. Please pause briefly and try again.',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }
  return next();
});

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'VAYU AI Server',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    ),
    communityStorage: getCommunityStorageInfo().storageMode,
  });
});

app.get('/api/air-quality', async (req, res) => {
  try {
    const lat =
      req.query.lat !== undefined && String(req.query.lat).trim() !== ''
        ? req.query.lat
        : DEFAULT_CITY.latitude;
    const lon =
      req.query.lon !== undefined && String(req.query.lon).trim() !== ''
        ? req.query.lon
        : DEFAULT_CITY.longitude;
    const coords = validateCoordinates(lat, lon);
    if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
      return res.status(400).json({ error: coords.error ?? 'Invalid coordinates.' });
    }

    const cleanName = typeof req.query.name === 'string' ? sanitizePlainText(req.query.name, 80) : '';
    const name = cleanName.length > 0 ? cleanName : DEFAULT_CITY.name;
    const country = typeof req.query.country === 'string' ? sanitizePlainText(req.query.country, 60) : '';
    const cleanRegion = typeof req.query.region === 'string' ? sanitizePlainText(req.query.region, 60) : '';
    const region = cleanRegion.length > 0 ? cleanRegion : undefined;

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
    const lat =
      req.query.lat !== undefined && String(req.query.lat).trim() !== ''
        ? req.query.lat
        : DEFAULT_CITY.latitude;
    const lon =
      req.query.lon !== undefined && String(req.query.lon).trim() !== ''
        ? req.query.lon
        : DEFAULT_CITY.longitude;
    const coords = validateCoordinates(lat, lon);
    if (!coords.valid || coords.latitude === undefined || coords.longitude === undefined) {
      return res.status(400).json({ error: coords.error ?? 'Invalid coordinates.' });
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
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const sanitized = sanitizeCityQuery(q);
  if (!sanitized.valid) {
    return res.status(400).json({ error: sanitized.error ?? 'Invalid city query.' });
  }
  try {
    const results = await searchCities(sanitized.cleaned);
    return res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'City lookup failed.';
    return res.status(502).json({ error: message });
  }
});

app.post('/api/ask', async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }

    const query = typeof req.body.query === 'string' ? req.body.query.trim().slice(0, 500) : '';
    if (query.length < 3) {
      return res.status(400).json({ error: 'Please enter a question of at least 3 characters.' });
    }

    const scaleCheck = validateAqiScale(req.body.preferredScale);
    if (!scaleCheck.valid || !scaleCheck.scale) {
      return res.status(400).json({ error: scaleCheck.error });
    }

    const locCheck = validateLocationInput(req.body.location, DEFAULT_CITY);
    if (!locCheck.valid || !locCheck.location) {
      return res.status(400).json({ error: locCheck.error });
    }

    const profileCheck = validateHouseholdProfiles(req.body.profiles);
    if (!profileCheck.valid) {
      return res.status(400).json({ error: profileCheck.error });
    }

    let dataset = null;
    try {
      dataset = await fetchEnvironmentalDataset(locCheck.location);
    } catch {
      dataset = null;
    }

    const result = await runVayuOrchestrator({
      query,
      dataset,
      profiles: profileCheck.profiles,
      preferredScale: scaleCheck.scale,
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
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }

    const scaleCheck = validateAqiScale(req.body.preferredScale);
    if (!scaleCheck.valid || !scaleCheck.scale) {
      return res.status(400).json({ error: scaleCheck.error });
    }

    const activityCheck = validateActivityType(req.body.activity);
    if (!activityCheck.valid || !activityCheck.activity) {
      return res.status(400).json({ error: activityCheck.error });
    }

    const dateCheck = validateCalendarDate(req.body.date);
    if (!dateCheck.valid) {
      return res.status(400).json({ error: dateCheck.error });
    }

    const locCheck = validateLocationInput(req.body.location, DEFAULT_CITY);
    if (!locCheck.valid || !locCheck.location) {
      return res.status(400).json({ error: locCheck.error });
    }

    const dataset = await fetchEnvironmentalDataset(locCheck.location);
    const routine = runSmartRoutineAgent(
      dataset,
      activityCheck.activity,
      dateCheck.date,
      scaleCheck.scale,
    );
    const { agentResult: verificationAgentResult, report: verification } = runVerificationAgent({
      dataset,
      agentResults: [routine.agentResult],
      preferredScale: scaleCheck.scale,
      draftAnswer: routine.agentResult.recommendation,
      routineWindows: routine.windows,
    });

    const actMeta = ACTIVITIES_META.find((a) => a.id === activityCheck.activity) ?? ACTIVITIES_META[0];
    const summary =
      verification.rejectedClaims.length > 0
        ? `${routine.agentResult.recommendation} Verification note: ${verification.rejectedClaims.join(' ')}`
        : routine.agentResult.recommendation;

    return res.json({
      activity: activityCheck.activity,
      activityLabel: actMeta.label,
      date: routine.resolvedDate,
      windows: routine.windows,
      bestWindow: routine.bestWindow,
      summary,
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
  const city = typeof req.query.city === 'string' ? req.query.city.trim().slice(0, 60) : undefined;
  const storageInfo = getCommunityStorageInfo();
  return res.json({
    reports: listCommunityReports(city),
    storageMode: storageInfo.storageMode,
    persistenceNote: storageInfo.persistenceNote,
    maxReports: storageInfo.maxReports,
    notice:
      'Community observations are user-submitted reports and are not scientifically calibrated sensor measurements.',
  });
});

app.post('/api/community', (req, res) => {
  const validated = validateCommunityReportInput(req.body);
  if (!validated.valid || !validated.sanitized) {
    return res.status(400).json({ error: validated.error });
  }
  const { report, authorToken } = addCommunityReport(validated.sanitized);
  return res.status(201).json({
    report,
    authorToken,
    storageMode: getCommunityStorageInfo().storageMode,
  });
});

app.post('/api/community/:id/flag', (req, res) => {
  const idCheck = validateReportId(req.params.id);
  if (!idCheck.valid || !idCheck.id) {
    return res.status(400).json({ error: idCheck.error });
  }

  if (req.body !== undefined && !isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }

  const reasonCheck = validateFlagReason((req.body as Record<string, unknown> | undefined)?.reason);
  if (!reasonCheck.valid || !reasonCheck.reason) {
    return res.status(400).json({ error: reasonCheck.error });
  }

  const adminToken = typeof req.headers['x-moderation-token'] === 'string' ? req.headers['x-moderation-token'] : undefined;
  const configuredAdminToken = process.env.COMMUNITY_ADMIN_TOKEN;
  const isModerator = Boolean(
    configuredAdminToken && configuredAdminToken.length >= 12 && adminToken === configuredAdminToken,
  );

  const actorKey = req.ip || 'unknown';
  const result = flagCommunityReport(idCheck.id, reasonCheck.reason, actorKey, isModerator);
  if (result.status === 'not_found') {
    return res.status(404).json({ error: 'Observation not found.' });
  }
  if (result.status === 'already_flagged') {
    return res.status(409).json({ error: 'This observation has already been flagged from your connection.' });
  }
  return res.json({ report: result.report });
});

app.delete('/api/community/:id', (req, res) => {
  const idCheck = validateReportId(req.params.id);
  if (!idCheck.valid || !idCheck.id) {
    return res.status(400).json({ error: idCheck.error });
  }

  const authorToken =
    typeof req.headers['x-report-token'] === 'string' ? req.headers['x-report-token'].trim() : undefined;
  const adminToken =
    typeof req.headers['x-moderation-token'] === 'string'
      ? req.headers['x-moderation-token'].trim()
      : undefined;

  const outcome = deleteCommunityReport(idCheck.id, {
    authorToken,
    adminToken,
    configuredAdminToken: process.env.COMMUNITY_ADMIN_TOKEN,
  });

  if (outcome === 'not_found') {
    return res.status(404).json({ error: 'Observation not found.' });
  }
  if (outcome === 'unauthorized') {
    return res.status(401).json({
      error: 'Authorization required. Provide a valid report author token or moderation token to remove an observation.',
    });
  }
  if (outcome === 'forbidden') {
    return res.status(403).json({
      error: 'You are not authorized to delete this observation.',
    });
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
