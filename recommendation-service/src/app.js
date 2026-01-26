'use strict';

const express = require('express');
const axios = require('axios');
const { CircuitBreaker, CircuitOpenError } = require('./circuitBreaker');

const app = express();
app.use(express.json());

const PORT = process.env.API_PORT || 8080;
const USER_PROFILE_URL = process.env.USER_PROFILE_URL || 'http://user-profile-service:8081';
const CONTENT_URL = process.env.CONTENT_URL || 'http://content-service:8082';
const TRENDING_URL = process.env.TRENDING_URL || 'http://trending-service:8083';

// ─── Circuit Breakers ─────────────────────────────────────────────────────────

const userProfileBreaker = new CircuitBreaker('user-profile-service', {
    requestTimeout: 2000,
    windowSize: 10,
    failureRateThreshold: 0.5,
    consecutiveFailureThreshold: 5,
    openStateDuration: 30000,
    halfOpenMaxTrials: 3,
});

const contentBreaker = new CircuitBreaker('content-service', {
    requestTimeout: 2000,
    windowSize: 10,
    failureRateThreshold: 0.5,
    consecutiveFailureThreshold: 5,
    openStateDuration: 30000,
    halfOpenMaxTrials: 3,
});

// ─── Default Fallback Data ────────────────────────────────────────────────────

const DEFAULT_PREFERENCES = ['Comedy', 'Family'];

const DEFAULT_RECOMMENDATIONS = [
    { movieId: 201, title: 'The Grand Budapest Hotel', genre: 'Comedy' },
    { movieId: 301, title: 'The Lion King', genre: 'Family' },
];

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'recommendation-service' });
});

// ─── Simulation Control ───────────────────────────────────────────────────────
// POST /simulate/:service_name/:behavior
// service_name: user-profile | content
// behavior: normal | slow | fail

app.post('/simulate/:service/:behavior', async (req, res) => {
    const { service, behavior } = req.params;

    const serviceMap = {
        'user-profile': USER_PROFILE_URL,
        'content': CONTENT_URL,
    };

    const targetUrl = serviceMap[service];
    if (!targetUrl) {
        return res.status(400).json({
            error: `Unknown service: ${service}. Must be one of: ${Object.keys(serviceMap).join(', ')}`,
        });
    }

    if (!['normal', 'slow', 'fail'].includes(behavior)) {
        return res.status(400).json({
            error: `Unknown behavior: ${behavior}. Must be one of: normal, slow, fail`,
        });
    }

    try {
        await axios.post(`${targetUrl}/set-behavior`, { mode: behavior }, { timeout: 5000 });
        console.log(`[recommendation-service] Simulation set: ${service} → ${behavior}`);
        res.json({ service, behavior, message: `${service} behavior set to ${behavior}` });
    } catch (err) {
        console.error(`[recommendation-service] Failed to set behavior on ${service}:`, err.message);
        res.status(502).json({ error: `Could not reach ${service} to set behavior`, details: err.message });
    }
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

app.get('/metrics/circuit-breakers', (req, res) => {
    res.json({
        userProfileCircuitBreaker: userProfileBreaker.getMetrics(),
        contentCircuitBreaker: contentBreaker.getMetrics(),
    });
});

// ─── Recommendations ──────────────────────────────────────────────────────────

app.get('/recommendations/:userId', async (req, res) => {
    const { userId } = req.params;
    console.log(`\n[recommendation-service] GET /recommendations/${userId}`);

    const fallbacksTriggered = [];
    let userPreferences = null;
    let recommendations = null;

    // Step 1: Fetch user preferences (with circuit breaker)
    try {
        const response = await userProfileBreaker.execute(() =>
            axios.get(`${USER_PROFILE_URL}/users/${userId}`, { timeout: 3000 })
                .then((r) => r.data)
        );
        userPreferences = {
            userId: response.userId,
            preferences: response.preferences,
        };
        console.log(`[recommendation-service] User preferences fetched: ${JSON.stringify(userPreferences)}`);
    } catch (err) {
        if (err.isCircuitOpen) {
            console.warn(`[recommendation-service] user-profile CB is ${err.circuitState} — using default preferences`);
        } else {
            console.warn(`[recommendation-service] user-profile call failed: ${err.message} — using default preferences`);
        }
        userPreferences = {
            userId: String(userId),
            preferences: DEFAULT_PREFERENCES,
        };
        fallbacksTriggered.push('user-profile-service');
    }

    // Step 2: Fetch content recommendations (with circuit breaker)
    try {
        const genres = userPreferences.preferences.join(',');
        const response = await contentBreaker.execute(() =>
            axios.get(`${CONTENT_URL}/movies?genres=${encodeURIComponent(genres)}`, { timeout: 3000 })
                .then((r) => r.data)
        );
        recommendations = response.movies || [];
        console.log(`[recommendation-service] Content fetched: ${recommendations.length} movies`);
    } catch (err) {
        if (err.isCircuitOpen) {
            console.warn(`[recommendation-service] content CB is ${err.circuitState} — using fallback content`);
        } else {
            console.warn(`[recommendation-service] content call failed: ${err.message} — using fallback content`);
        }
        fallbacksTriggered.push('content-service');
        recommendations = null; // trigger final fallback check below
    }

    // Step 3: Final fallback — both circuits open, use trending service
    if (recommendations === null) {
        try {
            const trendingRes = await axios.get(`${TRENDING_URL}/trending`, { timeout: 5000 });
            const trendingData = trendingRes.data;

            console.log('[recommendation-service] Both CBs failed — returning trending fallback');
            return res.json({
                message: 'Our recommendation service is temporarily degraded. Here are some trending movies.',
                trending: trendingData.trending,
                fallback_triggered_for: fallbacksTriggered.join(', '),
            });
        } catch (trendErr) {
            console.error('[recommendation-service] Trending service also failed:', trendErr.message);
            return res.status(503).json({
                error: 'All services are currently unavailable. Please try again shortly.',
                fallback_triggered_for: fallbacksTriggered.join(', '),
            });
        }
    }

    // Step 4: Build combined response
    const responseBody = {
        userPreferences,
        recommendations,
    };

    if (fallbacksTriggered.length > 0) {
        responseBody.fallback_triggered_for = fallbacksTriggered.join(', ');
    }

    return res.json(responseBody);
});

// ─── Admin: Reset circuit breakers ───────────────────────────────────────────

app.post('/admin/reset-circuit-breakers', (req, res) => {
    userProfileBreaker.reset();
    contentBreaker.reset();
    console.log('[recommendation-service] All circuit breakers reset to CLOSED');
    res.json({ message: 'All circuit breakers reset to CLOSED' });
});

// ─── 404 Catch-all ───────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`[recommendation-service] Listening on port ${PORT}`);
    console.log(`  USER_PROFILE_URL = ${USER_PROFILE_URL}`);
    console.log(`  CONTENT_URL      = ${CONTENT_URL}`);
    console.log(`  TRENDING_URL     = ${TRENDING_URL}`);
});
