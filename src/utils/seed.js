const mongoose = require('mongoose');
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
const { ROLES, PLAYER_POSITIONS, TOURNAMENT_STATUS, MATCH_STATUS, TIMER_STAGES, STAGE_DURATIONS } = require('./constants');
const logger = require('./logger');

const seedData = async () => {
  try {
    await connectDatabase();
    logger.info('Clearing old data for clean seed...');

    await Promise.all([
      User.deleteMany({}),
      Team.deleteMany({}),
      Player.deleteMany({}),
      Tournament.deleteMany({}),
      Match.deleteMany({}),
      MatchEvent.deleteMany({}),
      PenaltyShootout.deleteMany({}),
      TournamentStanding.deleteMany({})
    ]);

    logger.info('Creating Users...');
    const superAdmin = await User.create({
      username: 'superadmin',
      email: 'admin@footballportal.com',
      password: 'AdminPassword123!',
      fullName: 'Chief Tournament Director',
      role: ROLES.SUPER_ADMIN
    });

    const operator = await User.create({
      username: 'operator',
      email: 'operator@footballportal.com',
      password: 'OperatorPassword123!',
      fullName: 'Lead Match Official',
      role: ROLES.MATCH_OPERATOR
    });

    const publicFan = await User.create({
      username: 'footballfan',
      email: 'fan@footballportal.com',
      password: 'UserPassword123!',
      fullName: 'Alex Football Fan',
      role: ROLES.PUBLIC_USER
    });

    logger.info('Creating Teams & Players...');
    const teamsData = [
      {
        name: 'Red Dragons FC',
        logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=128&q=80',
        description: 'Fierce attacking football with explosive wing play',
        coach: 'Marcus Rashford Sr.'
      },
      {
        name: 'Blue Hawks United',
        logo: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=128&q=80',
        description: 'Tactical discipline and rock-solid defensive organization',
        coach: 'David Sterling'
      },
      {
        name: 'Golden Lions',
        logo: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=128&q=80',
        description: 'Dynamic midfield playmakers and high-press energy',
        coach: 'Jurgen Vance'
      },
      {
        name: 'Silver Wolves',
        logo: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=128&q=80',
        description: 'Relentless counter-attacking squad with lethal finishes',
        coach: 'Carlo Martinez'
      }
    ];

    const createdTeams = [];
    const positionsList = [
      PLAYER_POSITIONS.GOALKEEPER,
      PLAYER_POSITIONS.DEFENDER,
      PLAYER_POSITIONS.DEFENDER,
      PLAYER_POSITIONS.DEFENDER,
      PLAYER_POSITIONS.MIDFIELDER,
      PLAYER_POSITIONS.MIDFIELDER,
      PLAYER_POSITIONS.MIDFIELDER,
      PLAYER_POSITIONS.FORWARD,
      PLAYER_POSITIONS.FORWARD,
      PLAYER_POSITIONS.FORWARD,
      PLAYER_POSITIONS.FORWARD
    ];

    for (const teamInfo of teamsData) {
      const team = await Team.create(teamInfo);

      const playerIds = [];
      for (let i = 0; i < positionsList.length; i++) {
        const jerseyNumber = i + 1;
        const player = await Player.create({
          name: `${team.name.split(' ')[0]} Player ${jerseyNumber}`,
          jerseyNumber,
          team: team._id,
          position: positionsList[i]
        });
        playerIds.push(player._id);
      }

      team.players = playerIds;
      team.captain = playerIds[0]; // Goalkeeper or Captain
      await team.save();

      createdTeams.push(team);
    }

    logger.info('Creating Tournament...');
    const tournament = await Tournament.create({
      name: 'Premier Football Championship 2026',
      description: 'The premier national knockout and league championship featuring top-tier clubs.',
      startDate: new Date('2026-11-20'),
      endDate: new Date('2026-11-30'),
      participatingTeams: createdTeams.map((t) => t._id),
      status: TOURNAMENT_STATUS.ONGOING,
      createdBy: superAdmin._id,
      rules: {
        halfDurationSeconds: 240,
        transitionDurationSeconds: 20,
        halfTimeDurationSeconds: 120,
        initialPenaltyKicks: 5,
        pointsForWin: 3,
        pointsForLoss: 0
      }
    });

    logger.info('Initializing Standings...');
    for (let i = 0; i < createdTeams.length; i++) {
      await TournamentStanding.create({
        tournament: tournament._id,
        team: createdTeams[i]._id,
        position: i + 1,
        matchesPlayed: 0,
        won: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      });
    }

    logger.info('Scheduling Matches...');
    // Match 1: Dragons vs Hawks (Scheduled)
    await Match.create({
      tournament: tournament._id,
      matchNumber: 1,
      teamA: createdTeams[0]._id,
      teamB: createdTeams[1]._id,
      matchDate: new Date('2026-11-20'),
      matchTime: '15:00',
      venue: 'National Arena, Pitch 1',
      status: MATCH_STATUS.UPCOMING,
      timer: {
        currentStage: TIMER_STAGES.FIRST_HALF,
        stageDuration: 240,
        remainingTime: 240
      }
    });

    // Match 2: Lions vs Wolves (Scheduled)
    await Match.create({
      tournament: tournament._id,
      matchNumber: 2,
      teamA: createdTeams[2]._id,
      teamB: createdTeams[3]._id,
      matchDate: new Date('2026-11-20'),
      matchTime: '17:30',
      venue: 'National Arena, Pitch 2',
      status: MATCH_STATUS.UPCOMING,
      timer: {
        currentStage: TIMER_STAGES.FIRST_HALF,
        stageDuration: 240,
        remainingTime: 240
      }
    });

    logger.success('✅ Database seeded successfully!');
    logger.info('Credentials:');
    logger.info('Super Admin:    admin@footballportal.com / AdminPassword123!');
    logger.info('Match Operator: operator@footballportal.com / OperatorPassword123!');
    logger.info('Public User:    fan@footballportal.com / UserPassword123!');

    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
};

if (require.main === module) {
  seedData();
}

module.exports = seedData;
