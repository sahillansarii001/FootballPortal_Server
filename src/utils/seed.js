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
const { ROLES, PLAYER_POSITIONS, TOURNAMENT_STATUS, MATCH_STATUS, TIMER_STAGES, EVENT_TYPES } = require('./constants');
const logger = require('./logger');

const seedData = async () => {
  try {
    await connectDatabase();
    logger.info('Clearing old data for clean minimal seed...');

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

    logger.info('Creating 4 Varsity Teams & Rosters (3 players each = 12 total)...');
    const teamsConfig = [
      {
        name: 'Stanford Cardinal',
        logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=128&q=80',
        description: 'Dynamic high-press offense with clinical finishing',
        coach: 'Marcus Henderson',
        players: [
          { name: 'Mateo Vance', jerseyNumber: 9, club: 'Bay Area Elite SC', position: PLAYER_POSITIONS.FORWARD, isCaptain: true, goals: 2, matchesPlayed: 1 },
          { name: 'Aaron Chen', jerseyNumber: 8, club: 'Silicon Valley FC', position: PLAYER_POSITIONS.MIDFIELDER, goals: 1, matchesPlayed: 1 },
          { name: 'Kasper Jensen', jerseyNumber: 1, club: 'Nordic Stars Athletic', position: PLAYER_POSITIONS.GOALKEEPER, penaltiesSaved: 2, matchesPlayed: 1 }
        ],
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        goalsScored: 0,
        goalsConceded: 0,
        goalDifference: 0,
        totalPoints: 0
      },
      {
        name: 'UCLA Bruins',
        logo: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=128&q=80',
        description: 'Rock-solid backline and explosive counter-attacks',
        coach: 'David Alvarez',
        players: [
          { name: 'Julian Morales', jerseyNumber: 9, club: 'SoCal Gunners FC', position: PLAYER_POSITIONS.FORWARD, isCaptain: true, goals: 1, matchesPlayed: 1 },
          { name: 'Marcus Cole', jerseyNumber: 10, club: 'Westwood City SC', position: PLAYER_POSITIONS.MIDFIELDER, goals: 0, matchesPlayed: 1 },
          { name: 'Gabriel Santos', jerseyNumber: 1, club: 'Pacific Waves FC', position: PLAYER_POSITIONS.GOALKEEPER, penaltiesSaved: 1, matchesPlayed: 1 }
        ],
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        goalsScored: 0,
        goalsConceded: 0,
        goalDifference: 0,
        totalPoints: 0
      },
      {
        name: 'Harvard Crimson',
        logo: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=128&q=80',
        description: 'Calculated positional play and set-piece mastery',
        coach: 'Arthur Pendelton',
        players: [
          { name: 'Lucas Wright', jerseyNumber: 8, club: 'Boston Athletic SC', position: PLAYER_POSITIONS.MIDFIELDER, isCaptain: true, goals: 1, matchesPlayed: 1, wins: 1 },
          { name: 'Liam Evans', jerseyNumber: 11, club: 'Cambridge Rovers FC', position: PLAYER_POSITIONS.FORWARD, goals: 1, matchesPlayed: 1, wins: 1 },
          { name: 'Arthur Pendelton', jerseyNumber: 1, club: 'Crimson Academy SC', position: PLAYER_POSITIONS.GOALKEEPER, penaltiesSaved: 3, matchesPlayed: 1, wins: 1 }
        ],
        matchesPlayed: 1,
        matchesWon: 1,
        matchesLost: 0,
        goalsScored: 2,
        goalsConceded: 1,
        goalDifference: 1,
        totalPoints: 3
      },
      {
        name: 'Columbia Lions',
        logo: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=128&q=80',
        description: 'High-tempo vertical passing and tenacious midfield duels',
        coach: 'Jean-Paul Giraud',
        players: [
          { name: 'Derrick Vance', jerseyNumber: 9, club: 'Manhattan United FC', position: PLAYER_POSITIONS.FORWARD, isCaptain: true, goals: 1, matchesPlayed: 1, losses: 1 },
          { name: 'Noah Miller', jerseyNumber: 10, club: 'Empire State SC', position: PLAYER_POSITIONS.MIDFIELDER, goals: 0, matchesPlayed: 1, losses: 1 },
          { name: 'Jean-Paul Giraud', jerseyNumber: 1, club: 'Gotham City FC', position: PLAYER_POSITIONS.GOALKEEPER, penaltiesSaved: 2, matchesPlayed: 1, losses: 1 }
        ],
        matchesPlayed: 1,
        matchesWon: 0,
        matchesLost: 1,
        goalsScored: 1,
        goalsConceded: 2,
        goalDifference: -1,
        totalPoints: 0
      }
    ];

    const createdTeams = [];
    const teamPlayerMap = {};

    for (const conf of teamsConfig) {
      const team = await Team.create({
        name: conf.name,
        logo: conf.logo,
        description: conf.description,
        coach: conf.coach,
        matchesPlayed: conf.matchesPlayed,
        matchesWon: conf.matchesWon,
        matchesLost: conf.matchesLost,
        goalsScored: conf.goalsScored,
        goalsConceded: conf.goalsConceded,
        goalDifference: conf.goalDifference,
        totalPoints: conf.totalPoints
      });

      const playerIds = [];
      teamPlayerMap[team._id.toString()] = [];

      for (const p of conf.players) {
        const player = await Player.create({
          name: p.name,
          jerseyNumber: p.jerseyNumber,
          team: team._id,
          position: p.position,
          goals: p.goals || 0,
          matchesPlayed: p.matchesPlayed || 0,
          penaltiesSaved: p.penaltiesSaved || 0,
          wins: p.wins || 0,
          losses: p.losses || 0
        });
        playerIds.push(player._id);
        teamPlayerMap[team._id.toString()].push(player);
        if (p.isCaptain) {
          team.captain = player._id;
        }
      }

      team.players = playerIds;
      await team.save();
      createdTeams.push(team);
    }

    logger.info('Creating Tournament...');
    const tournament = await Tournament.create({
      name: 'Varsity Football League Championship 2025',
      description: 'Elite Collegiate Dynasties. High-Octane Clashes. One Crown. Real-time tactical tracking, verified varsity matchday data.',
      startDate: new Date('2026-11-15'),
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

    logger.info('Initializing Standings (4 teams)...');
    const standingsConfig = [
      { teamIndex: 2, position: 1, mp: 1, w: 1, l: 0, gf: 2, ga: 1, gd: 1, pts: 3 }, // Harvard
      { teamIndex: 0, position: 2, mp: 0, w: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }, // Stanford
      { teamIndex: 1, position: 3, mp: 0, w: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }, // UCLA
      { teamIndex: 3, position: 4, mp: 1, w: 0, l: 1, gf: 1, ga: 2, gd: -1, pts: 0 }  // Columbia
    ];

    for (const s of standingsConfig) {
      await TournamentStanding.create({
        tournament: tournament._id,
        team: createdTeams[s.teamIndex]._id,
        position: s.position,
        matchesPlayed: s.mp,
        won: s.w,
        lost: s.l,
        goalsFor: s.gf,
        goalsAgainst: s.ga,
        goalDifference: s.gd,
        points: s.pts
      });
    }

    logger.info('Scheduling Matches (1 Live, 1 Completed, 1 Upcoming)...');

    // Match 1: Stanford vs UCLA (Live: 2 - 1)
    const stanford = createdTeams[0];
    const ucla = createdTeams[1];
    const stanfordPlayers = teamPlayerMap[stanford._id.toString()];
    const uclaPlayers = teamPlayerMap[ucla._id.toString()];

    const liveMatch = await Match.create({
      tournament: tournament._id,
      matchNumber: 1,
      teamA: stanford._id,
      teamB: ucla._id,
      matchDate: new Date(),
      matchTime: '14:00',
      venue: 'Cardinal Athletic Complex • Field 1, Stanford',
      status: MATCH_STATUS.LIVE,
      teamAScore: 2,
      teamBScore: 1,
      timer: {
        currentStage: TIMER_STAGES.SECOND_HALF,
        stageDuration: 240,
        remainingTime: 55,
        isRunning: true,
        isPaused: false,
        startedTimestamp: new Date()
      }
    });

    // Seed events for Live Match
    const ev1 = await MatchEvent.create({
      match: liveMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.MATCH_STARTED,
      stage: TIMER_STAGES.FIRST_HALF,
      clockTime: '04:00',
      title: 'Match Kickoff',
      timestamp: new Date(Date.now() - 360000)
    });

    const ev2 = await MatchEvent.create({
      match: liveMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.GOAL_SCORED,
      stage: TIMER_STAGES.FIRST_HALF,
      clockTime: '02:48',
      title: 'GOAL! Stanford Cardinal (1 - 0)',
      team: stanford._id,
      player: stanfordPlayers[0]._id,
      detail: { goalType: 'Normal Goal', notes: 'Controlled chest take-down followed by clinical strike' },
      timestamp: new Date(Date.now() - 280000)
    });

    const ev3 = await MatchEvent.create({
      match: liveMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.GOAL_SCORED,
      stage: TIMER_STAGES.SECOND_HALF,
      clockTime: '02:15',
      title: 'GOAL! UCLA Bruins Equalizer (1 - 1)',
      team: ucla._id,
      player: uclaPlayers[0]._id,
      detail: { goalType: 'Normal Goal', notes: 'Curling finish inside the far post' },
      timestamp: new Date(Date.now() - 120000)
    });

    const ev4 = await MatchEvent.create({
      match: liveMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.GOAL_SCORED,
      stage: TIMER_STAGES.SECOND_HALF,
      clockTime: '01:05',
      title: 'GOAL! Stanford Cardinal Lead (2 - 1)',
      team: stanford._id,
      player: stanfordPlayers[1]._id,
      detail: { goalType: 'Normal Goal', notes: 'Header from outswinging cross' },
      timestamp: new Date(Date.now() - 60000)
    });

    liveMatch.events = [ev1._id, ev2._id, ev3._id, ev4._id];
    await liveMatch.save();

    // Match 2: Harvard vs Columbia (Completed: 2 - 1)
    const harvard = createdTeams[2];
    const columbia = createdTeams[3];
    const harvardPlayers = teamPlayerMap[harvard._id.toString()];
    const columbiaPlayers = teamPlayerMap[columbia._id.toString()];

    const compMatch = await Match.create({
      tournament: tournament._id,
      matchNumber: 2,
      teamA: harvard._id,
      teamB: columbia._id,
      matchDate: new Date(Date.now() - 86400000),
      matchTime: '15:00',
      venue: 'Harvard Stadium, Cambridge',
      status: MATCH_STATUS.COMPLETED,
      teamAScore: 2,
      teamBScore: 1,
      winner: harvard._id,
      matchResult: 'Completed in Regular Time',
      isFinalized: true,
      timer: {
        currentStage: TIMER_STAGES.COMPLETED,
        stageDuration: 240,
        remainingTime: 0,
        isRunning: false,
        isPaused: false
      }
    });

    const compEv1 = await MatchEvent.create({
      match: compMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.GOAL_SCORED,
      stage: TIMER_STAGES.FIRST_HALF,
      clockTime: '03:10',
      title: 'GOAL! Harvard Crimson (1 - 0)',
      team: harvard._id,
      player: harvardPlayers[0]._id,
      detail: { goalType: 'Normal Goal' },
      timestamp: new Date(Date.now() - 86400000 + 60000)
    });

    const compEv2 = await MatchEvent.create({
      match: compMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.GOAL_SCORED,
      stage: TIMER_STAGES.FIRST_HALF,
      clockTime: '02:00',
      title: 'GOAL! Columbia Lions Equalizer (1 - 1)',
      team: columbia._id,
      player: columbiaPlayers[0]._id,
      detail: { goalType: 'Normal Goal' },
      timestamp: new Date(Date.now() - 86400000 + 120000)
    });

    const compEv3 = await MatchEvent.create({
      match: compMatch._id,
      tournament: tournament._id,
      type: EVENT_TYPES.GOAL_SCORED,
      stage: TIMER_STAGES.SECOND_HALF,
      clockTime: '01:20',
      title: 'GOAL! Harvard Crimson Match Winner (2 - 1)',
      team: harvard._id,
      player: harvardPlayers[1]._id,
      detail: { goalType: 'Normal Goal' },
      timestamp: new Date(Date.now() - 86400000 + 200000)
    });

    compMatch.events = [compEv1._id, compEv2._id, compEv3._id];
    await compMatch.save();

    // Match 3: Stanford vs Harvard (Upcoming)
    await Match.create({
      tournament: tournament._id,
      matchNumber: 3,
      teamA: stanford._id,
      teamB: harvard._id,
      matchDate: new Date(Date.now() + 86400000 * 3),
      matchTime: '16:00',
      venue: 'Cardinal Athletic Complex • Field 2, Stanford',
      status: MATCH_STATUS.UPCOMING,
      teamAScore: 0,
      teamBScore: 0,
      timer: {
        currentStage: TIMER_STAGES.FIRST_HALF,
        stageDuration: 240,
        remainingTime: 240,
        isRunning: false,
        isPaused: false
      }
    });

    logger.success('✅ Database seeded successfully with compact testing dataset!');
    logger.info('Dataset Summary:');
    logger.info('• 4 Teams: Stanford Cardinal, UCLA Bruins, Harvard Crimson, Columbia Lions');
    logger.info('• 12 Players: 3 per team (1 Forward, 1 Midfielder, 1 Goalkeeper)');
    logger.info('• 3 Matches: 1 Live (Stanford 2-1 UCLA), 1 Completed (Harvard 2-1 Columbia), 1 Upcoming (Stanford vs Harvard)');
    logger.info('• 4 Standings: 1st Harvard (3 pts), 2nd Stanford (0 pts), 3rd UCLA (0 pts), 4th Columbia (0 pts)');
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
