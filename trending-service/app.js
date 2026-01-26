'use strict';

const express = require('express');
const app = express();

const PORT = process.env.PORT || 8083;

const TRENDING_MOVIES = [
    { movieId: 99, title: 'Trending Movie 1', genre: 'Action' },
    { movieId: 98, title: 'Trending Movie 2', genre: 'Drama' },
    { movieId: 97, title: 'Trending Movie 3', genre: 'Comedy' },
    { movieId: 96, title: 'Trending Movie 4', genre: 'Thriller' },
    { movieId: 95, title: 'Trending Movie 5', genre: 'Sci-Fi' },
];

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'trending-service' });
});

app.get('/trending', (req, res) => {
    console.log('[trending-service] GET /trending');
    res.json({ trending: TRENDING_MOVIES });
});

app.listen(PORT, () => {
    console.log(`[trending-service] Listening on port ${PORT}`);
});
