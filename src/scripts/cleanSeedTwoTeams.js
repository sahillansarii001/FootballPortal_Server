const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Team = require('../models/Team');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const PenaltyShootout = require('../models/PenaltyShootout');
const TournamentStanding = require('../models/TournamentStanding');
const User = require('../models/User');
const { PLAYER_POSITIONS, TOURNAMENT_STATUS, MATCH_STATUS, TIMER_STAGES, ROLES } = require('../utils/constants');

async function cleanSeed() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully.');

    // Ensure superadmin exists
    let superAdmin = await User.findOne({ email: 'admin@footballportal.com' });
    if (!superAdmin) {
      superAdmin = await User.create({
        username: 'superadmin',
        email: 'admin@footballportal.com',
        password: 'AdminPassword123!',
        fullName: 'Chief Tournament Director',
        role: ROLES.SUPER_ADMIN
      });
    }

    console.log('Removing old demo data (matches, events, penalties, standings, teams, players, tournaments)...');
    await Promise.all([
      Team.deleteMany({}),
      Player.deleteMany({}),
      Tournament.deleteMany({}),
      Match.deleteMany({}),
      MatchEvent.deleteMany({}),
      PenaltyShootout.deleteMany({}),
      TournamentStanding.deleteMany({})
    ]);

    console.log('Creating 2 Clean Teams with Club-Affiliated Athletes...');
    
    // 1. Stanford Cardinal
    const stanford = await Team.create({
      name: 'Stanford Cardinal',
      logo: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=128&q=80',
      description: 'Dynamic high-press offense with clinical finishing',
      coach: 'Marcus Henderson',
      seed: '#1 Seed',
      conference: 'Pac-12 Varsity',
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      goalsScored: 0,
      goalsConceded: 0,
      goalDifference: 0,
      totalPoints: 0
    });

    const stanfordPlayersData = [
      { name: 'Mateo Vance', jerseyNumber: 10, club: 'Stanford Cardinal', position: PLAYER_POSITIONS.FORWARD, isCaptain: true, goals: 0, matchesPlayed: 0 },
      { name: 'Aaron Chen', jerseyNumber: 8, club: 'Stanford Cardinal', position: PLAYER_POSITIONS.MIDFIELDER, goals: 0, matchesPlayed: 0 },
      { name: 'Lucas Wright', jerseyNumber: 4, club: 'Stanford Cardinal', position: PLAYER_POSITIONS.DEFENDER, goals: 0, matchesPlayed: 0 },
      { name: 'Marcus Cole', jerseyNumber: 7, club: 'Stanford Cardinal', position: PLAYER_POSITIONS.FORWARD, goals: 0, matchesPlayed: 0 },
      { name: 'Kasper Jensen', jerseyNumber: 1, club: 'Stanford Cardinal', position: PLAYER_POSITIONS.GOALKEEPER, penaltiesSaved: 0, matchesPlayed: 0 }
    ];

    const stanfordPlayers = [];
    for (const p of stanfordPlayersData) {
      const created = await Player.create({ ...p, team: stanford._id });
      stanfordPlayers.push(created);
    }
    stanford.players = stanfordPlayers.map(p => p._id);
    stanford.captain = stanfordPlayers[0]._id;
    await stanford.save();

    // 2. UCLA Bruins
    const ucla = await Team.create({
      name: 'UCLA Bruins',
      logo: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=128&q=80',
      description: 'Rock-solid backline and explosive counter-attacks',
      coach: 'David Alvarez',
      seed: '#2 Seed',
      conference: 'Big Ten Varsity',
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      goalsScored: 0,
      goalsConceded: 0,
      goalDifference: 0,
      totalPoints: 0
    });

    const uclaPlayersData = [
      { name: 'Julian Morales', jerseyNumber: 9, club: 'UCLA Bruins', position: PLAYER_POSITIONS.FORWARD, isCaptain: true, goals: 0, matchesPlayed: 0 },
      { name: 'Liam Evans', jerseyNumber: 11, club: 'UCLA Bruins', position: PLAYER_POSITIONS.MIDFIELDER, goals: 0, matchesPlayed: 0 },
      { name: 'Noah Miller', jerseyNumber: 5, club: 'UCLA Bruins', position: PLAYER_POSITIONS.DEFENDER, goals: 0, matchesPlayed: 0 },
      { name: 'Derrick Vance', jerseyNumber: 17, club: 'UCLA Bruins', position: PLAYER_POSITIONS.FORWARD, goals: 0, matchesPlayed: 0 },
      { name: 'Gabriel Santos', jerseyNumber: 1, club: 'UCLA Bruins', position: PLAYER_POSITIONS.GOALKEEPER, penaltiesSaved: 0, matchesPlayed: 0 }
    ];

    const uclaPlayers = [];
    for (const p of uclaPlayersData) {
      const created = await Player.create({ ...p, team: ucla._id });
      uclaPlayers.push(created);
    }
    ucla.players = uclaPlayers.map(p => p._id);
    ucla.captain = uclaPlayers[0]._id;
    await ucla.save();

    console.log('Creating Official 10-Minute Tournament...');
    const now = new Date();
    const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const tournament = await Tournament.create({
      name: '2026 Inter-College Championship',
      description: 'Official 10-Minute Tournament: 4m 1st Half, 2m Break, 4m 2nd Half, 2m Extra Time, 3 Penalties + Sudden Death Coin Toss',
      startDate: now,
      endDate: nextMonth,
      createdBy: superAdmin._id,
      status: TOURNAMENT_STATUS.ONGOING,
      participatingTeams: [stanford._id, ucla._id],
      rules: {
        halfDurationSeconds: 240,       // 4 minutes
        halfTimeDurationSeconds: 120,   // 2 minutes break
        initialPenaltyKicks: 3,         // 3 penalties per team
        pointsForWin: 3,
        pointsForLoss: 0
      }
    });

    console.log('Creating Standings for both teams...');
    await TournamentStanding.create({
      tournament: tournament._id,
      team: stanford._id,
      position: 1,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      goalsScored: 0,
      goalsConceded: 0,
      goalDifference: 0,
      totalPoints: 0
    });

    await TournamentStanding.create({
      tournament: tournament._id,
      team: ucla._id,
      position: 2,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      goalsScored: 0,
      goalsConceded: 0,
      goalDifference: 0,
      totalPoints: 0
    });

    console.log('Creating Fresh Test Match (Stanford vs UCLA)...');
    const match = await Match.create({
      tournament: tournament._id,
      matchNumber: 1,
      teamA: stanford._id,
      teamB: ucla._id,
      matchDate: new Date(),
      matchTime: '14:00 EST',
      venue: 'Cardinal Athletic Complex Field 1',
      status: MATCH_STATUS.UPCOMING,
      teamAScore: 0,
      teamBScore: 0,
      winner: null,
      matchResult: 'Scheduled Kickoff',
      isFinalized: false,
      timer: {
        currentStage: TIMER_STAGES.FIRST_HALF,
        stageDuration: 240,
        remainingTime: 240,
        isRunning: false,
        isPaused: false,
        startedTimestamp: null,
        pausedTimestamp: null,
        totalPausedDuration: 0,
        stageHistory: []
      },
      shootout: {
        isShootout: false,
        teamAPenaltyScore: 0,
        teamBPenaltyScore: 0,
        teamAPenaltiesTaken: 0,
        teamBPenaltiesTaken: 0,
        round: 1,
        isSuddenDeath: false,
        isCompleted: false,
        shootoutWinner: null
      }
    });

    console.log(`\n==============================================`);
    console.log(`CLEAN 2-TEAM DATABASE SEEDING COMPLETED!`);
    console.log(`Teams created: 2 (${stanford.name}, ${ucla.name})`);
    console.log(`Players created: 10 (5 per team with certified clubs)`);
    console.log(`Match created: Match #1 (${stanford.name} vs ${ucla.name})`);
    console.log(`Rules: 4m 1H, 2m Break, 4m 2H, 2m Extra Time, 3 Penalties`);
    console.log(`==============================================\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

cleanSeed();
