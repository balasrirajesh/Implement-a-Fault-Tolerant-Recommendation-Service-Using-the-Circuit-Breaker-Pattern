'use strict';

const express = require('express');
const axios = require('axios');
const CircuitBreaker = require('./circuitBreaker');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const USER_PROFILE_URL = process.env.USER_PROFILE_URL || 'http://localhost:8081';
const CONTENT_URL = process.env.CONTENT_URL || 'http://localhost:8082';
const TRENDING_URL = process.env.TRENDING_URL || 'http://localhost:8083';
const REQUEST_TIMEOUT = parseInt(process.env.CB_REQUEST_TIMEOUT_MS) || 2000;

// ─── circuit breakers ───────────────────────────────────────────────────────
const cbOptions = {
    windowSize: parseInt(process.env.CB_WINDOW_SIZE) || 10,
    failureRateThreshold: parseFloat(process.env.CB_FAILURE_RATE_THRESHOLD) || 0.5,
    consecutiveFailureThreshold: parseInt(process.env.CB_CONSECUTIVE_FAILURE_THRESHOLD) || 5,
    openStateDuration: parseInt(process.env.CB_OPEN_STATE_DURATION_MS) || 30000,
    halfOpenMaxTrials: parseInt(process.env.CB_HALF_OPEN_MAX_TRIALS) || 3,
};

const userProfileCB = new CircuitBreaker('user-profile-service', cbOptions);
const contentCB = new CircuitBreaker('content-service', cbOptions);
const trendingCB = new CircuitBreaker('trending-service', cbOptions);

// ─── health ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'recommendation-service' });
});

// ─── metrics ─────────────────────────────────────────────────────────────────
app.get('/metrics', (req, res) => {
    res.json({
        circuitBreakers: [
            userProfileCB.getStatus(),
            contentCB.getStatus(),
            trendingCB.getStatus(),
        ],
    });
});

// ─── simulate ────────────────────────────────────────────────────────────────
// POST /simulate/:service/:mode  (mode: normal | slow | fail)
app.post('/simulate/:service/:mode', async (req, res) => {
    const { service, mode } = req.params;

    const serviceMap = {
        'user-profile': `${USER_PROFILE_URL}/set-behavior`,
        'content': `${CONTENT_URL}/set-behavior`,
        'trending': `${TRENDING_URL}/set-behavior`,
    };

    const url = serviceMap[service];
    if (!url) {
        return res.status(400).json({ error: `Unknown service: ${service}. Use user-profile, content, or trending.` });
    }

    if (!['normal', 'slow', 'fail'].includes(mode)) {
        return res.status(400).json({ error: `Invalid mode: ${mode}. Use normal, slow, or fail.` });
    }

    try {
        const response = await axios.post(url, { mode }, { timeout: REQUEST_TIMEOUT });
        res.json({ message: `Behavior of ${service} set to ${mode}`, result: response.data });
    } catch (err) {
        res.status(500).json({ error: `Failed to set behavior: ${err.message}` });
    }
});

// ─── recommendations ─────────────────────────────────────────────────────────
// GET /recommendations/:userId
app.get('/recommendations/:userId', async (req, res) => {
    const { userId } = req.params;
    let userPreferences = ['Action', 'Sci-Fi']; // default fallback preferences
    let movies = [];
    let source = 'content-service';
    let warnings = [];

    // step1 user-profile
    try {
        const profileData = await userProfileCB.execute(() =>
            axios.get(`${USER_PROFILE_URL}/users/${userId}`, { timeout: REQUEST_TIMEOUT })
                .then((r) => r.data)
        );
        userPreferences = profileData.preferences || userPreferences;
    } catch (err) {
        warnings.push(`user-profile-service unavailable (${err.message}) — using default preferences`);
    }

    // step2 content
    try {
        const contentData = await contentCB.execute(() =>
            axios.get(`${CONTENT_URL}/movies?genres=${userPreferences.join(',')}`, { timeout: REQUEST_TIMEOUT })
                .then((r) => r.data)
        );
        movies = contentData.movies || [];
    } catch (err) {
        warnings.push(`content-service unavailable (${err.message}) — falling back to trending`);

        // step3 trending fallback
        try {
            const trendingData = await trendingCB.execute(() =>
                axios.get(`${TRENDING_URL}/trending`, { timeout: REQUEST_TIMEOUT })
                    .then((r) => r.data)
            );
            movies = trendingData.trending || [];
            source = 'trending-service (fallback)';
        } catch (tErr) {
            warnings.push(`trending-service also unavailable (${tErr.message}) — returning empty`);
            source = 'none (all services down)';
        }
    }

    res.json({
        userId,
        preferences: userPreferences,
        recommendations: movies,
        source,
        warnings,
        circuitBreakers: {
            'user-profile-service': userProfileCB.state,
            'content-service': contentCB.state,
            'trending-service': trendingCB.state,
        },
    });
});

// ─── start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[recommendation-service] Listening on port ${PORT}`);
    console.log(`  → USER_PROFILE_URL : ${USER_PROFILE_URL}`);
    console.log(`  → CONTENT_URL      : ${CONTENT_URL}`);
    console.log(`  → TRENDING_URL     : ${TRENDING_URL}`);
});