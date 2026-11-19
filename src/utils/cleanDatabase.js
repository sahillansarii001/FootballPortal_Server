const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { connectDatabase, disconnectDatabase } = require('../config/database');
const User = require('../models/User');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const PenaltyShootout = require('../models/PenaltyShootout');
const TournamentStanding = require('../models/TournamentStanding');
const AuthService = require('../services/authService');

const cleanAllDemoData = async () => {
  try {
    await connectDatabase();
    console.log('--- PURGING ALL DEMO DATA FROM DATABASE ---');

    const [matchesDel, eventsDel, pensDel, standingsDel, playersDel, teamsDel, tournsDel] = await Promise.all([
      Match.deleteMany({}),
      MatchEvent.deleteMany({}),
      PenaltyShootout.deleteMany({}),
      TournamentStanding.deleteMany({}),
      Player.deleteMany({}),
      Team.deleteMany({}),
      Tournament.deleteMany({})
    ]);

    console.log(`Deleted ${matchesDel.deletedCount} Matches`);
    console.log(`Deleted ${eventsDel.deletedCount} Match Events`);
    console.log(`Deleted ${pensDel.deletedCount} Penalty Shootouts`);
    console.log(`Deleted ${standingsDel.deletedCount} Standings`);
    console.log(`Deleted ${playersDel.deletedCount} Players`);
    console.log(`Deleted ${teamsDel.deletedCount} Teams`);
    console.log(`Deleted ${tournsDel.deletedCount} Tournaments`);

    // Ensure Super Admin exists so admin can log in
    await AuthService.seedInitialSuperAdmin();
    console.log('Super Admin account preserved: admin@footballportal.com');

    console.log('--- DATABASE SUCCESSFULLY CLEARED ---');
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    console.error('Failed to clean database:', err);
    process.exit(1);
  }
};

cleanAllDemoData();
