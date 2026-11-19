const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const tournamentRoutes = require('./tournamentRoutes');
const teamRoutes = require('./teamRoutes');
const playerRoutes = require('./playerRoutes');
const matchRoutes = require('./matchRoutes');
const leaderboardRoutes = require('./leaderboardRoutes');
const standingsRoutes = require('./standingsRoutes');
const swaggerRoutes = require('../docs/swaggerRoute');

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Football Tournament Management Portal API is healthy and running',
    timestamp: new Date().toISOString()
  });
});

router.use('/docs', swaggerRoutes);
router.use('/auth', authRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/teams', teamRoutes);
router.use('/players', playerRoutes);
router.use('/matches', matchRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/standings', standingsRoutes);

module.exports = router;
