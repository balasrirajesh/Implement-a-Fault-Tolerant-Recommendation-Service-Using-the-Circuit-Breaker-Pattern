'use strict';

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8082;

// Behavior state: 'normal' | 'slow' | 'fail'
let behavior = 'normal';

// Movie catalog keyed by genre
const MOVIES_BY_GENRE = {
    'Action': [
        { movieId: 102, title: 'The Dark Knight', genre: 'Action' },
        { movieId: 103, title: 'Mad Max: Fury Road', genre: 'Action' },
        { movieId: 104, title: 'John Wick', genre: 'Action' },
    ],
    'Sci-Fi': [
        { movieId: 101, title: 'Inception', genre: 'Sci-Fi' },
        { movieId: 105, title: 'Interstellar', genre: 'Sci-Fi' },
        { movieId: 106, title: 'The Matrix', genre: 'Sci-Fi' },
    ],
    'Comedy': [
        { movieId: 201, title: 'The Grand Budapest Hotel', genre: 'Comedy' },
        { movieId: 202, title: 'Superbad', genre: 'Comedy' },
    ],
    'Family': [
        { movieId: 301, title: 'The Lion King', genre: 'Family' },
        { movieId: 302, title: 'Toy Story', genre: 'Family' },
    ],
};

const DEFAULT_MOVIES = [
    { movieId: 101, title: 'Inception', genre: 'Sci-Fi' },
    { movieId: 102, title: 'The Dark Knight', genre: 'Action' },
];

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'content-service', behavior });
});

// Called by recommendation-service to change behavior
app.post('/set-behavior', (req, res) => {
    const { mode } = req.body;
    if (!['normal', 'slow', 'fail'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode. Must be normal, slow, or fail.' });
    }
    behavior = mode;
    console.log(`[content-service] Behavior changed to: ${behavior}`);
    res.json({ service: 'content-service', behavior });
});

app.get('/movies', async (req, res) => {
    const genres = req.query.genres ? req.query.genres.split(',') : [];
    console.log(`[content-service] GET /movies | genres=${genres.join(',')} | behavior=${behavior}`);

    if (behavior === 'fail') {
        return res.status(500).json({ error: 'Service error (simulated failure)' });
    }

    if (behavior === 'slow') {
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    let movies = [];
    if (genres.length > 0) {
        for (const genre of genres) {
            const genreMovies = MOVIES_BY_GENRE[genre];
            if (genreMovies) movies.push(...genreMovies);
        }
    }

    if (movies.length === 0) {
        movies = DEFAULT_MOVIES;
    }

    // Return unique movies
    const seen = new Set();
    movies = movies.filter((m) => {
        if (seen.has(m.movieId)) return false;
        seen.add(m.movieId);
        return true;
    });

    res.json({ movies });
});

app.listen(PORT, () => {
    console.log(`[content-service] Listening on port ${PORT}`);
});