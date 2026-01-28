'use strict';

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8081;

// Behavior state: 'normal' | 'slow' | 'fail'
let behavior = 'normal';

const USERS = {
  default: { preferences: ['Action', 'Sci-Fi'] },
};

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'user-profile-service', behavior });
});

// Called by recommendation-service to change behavior
app.post('/set-behavior', (req, res) => {
  const { mode } = req.body;
  if (!['normal', 'slow', 'fail'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be normal, slow, or fail.' });
  }
  behavior = mode;
  console.log(`[user-profile-service] Behavior changed to: ${behavior}`);
  res.json({ service: 'user-profile-service', behavior });
});

app.get('/users/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log(`[user-profile-service] GET /users/${userId} | behavior=${behavior}`);

  if (behavior === 'fail') {
    return res.status(500).json({ error: 'Service error (simulated failure)' });
  }

  if (behavior === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const user = USERS[userId] || USERS.default;
  res.json({
    userId: String(userId),
    preferences: user.preferences,
  });
});

app.listen(PORT, () => {
  console.log(`[user-profile-service] Listening on port ${PORT}`);
});