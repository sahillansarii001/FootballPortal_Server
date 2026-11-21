const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const User = require('./src/models/User');
const Team = require('./src/models/Team');
const Player = require('./src/models/Player');
const Tournament = require('./src/models/Tournament');
const Match = require('./src/models/Match');
const MatchEvent = require('./src/models/MatchEvent');
const TournamentStanding = require('./src/models/TournamentStanding');
const StandingsService = require('./src/services/standingsService');

async function seedTournamentData() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB:', mongoose.connection.name);

  // 1. Get or create active tournament
  let tournament = await Tournament.findOne({ status: 'Ongoing' });
  if (!tournament) {
    tournament = await Tournament.findOne().sort({ createdAt: -1 });
  }
  if (!tournament) {
    tournament = await Tournament.create({
      name: 'Alliance Premier League - Season 9',
      status: 'Ongoing',
      startDate: new Date('2026-11-20'),
      endDate: new Date('2026-11-30'),
      rules: {
        halfDurationSeconds: 240,
        transitionDurationSeconds: 20,
        halfTimeDurationSeconds: 120,
        extraTimeDurationSeconds: 120,
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0
      }
    });
  }
  console.log(`Tournament: ${tournament.name} (${tournament._id})`);

  // 2. Fetch existing 5 teams or create if missing
  const teamsMap = {};
  const teamNames = ['United', 'Atlatico FC', 'inavitable', 'ramzan', 'Sahil'];
  for (const name of teamNames) {
    let t = await Team.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (!t) {
      t = await Team.create({
        name,
        logo: '',
        description: `${name} Varsity Soccer Team`
      });
      console.log(`Created team: ${name} (${t._id})`);
    } else {
      console.log(`Found existing team: ${name} (${t._id})`);
    }
    teamsMap[name] = t;
  }

  // 3. Define rosters for each team
  const rosters = {
    'United': [
      { name: 'irfan', jerseyNumber: 11, position: 'Forward', club: 'Independent Athletic Club', isCaptain: true, matchesPlayed: 4, goals: 3 },
      { name: 'Marcus Striker', jerseyNumber: 10, position: 'Forward', club: 'United Youth Academy', isCaptain: false, matchesPlayed: 8, goals: 1 },
      { name: 'Nathan Drake', jerseyNumber: 4, position: 'Defender', club: 'United Youth Academy', isCaptain: false, matchesPlayed: 5, goals: 0 },
      { name: 'David Miller', jerseyNumber: 1, position: 'Goalkeeper', club: 'United Youth Academy', isCaptain: false, matchesPlayed: 6, goals: 0 }
    ],
    'Atlatico FC': [
      { name: 'affan', jerseyNumber: 7, position: 'Midfielder', club: 'Independent Athletic Club', isCaptain: true, matchesPlayed: 5, goals: 1 },
      { name: 'sufiyan', jerseyNumber: 10, position: 'Goalkeeper', club: 'Independent Athletic Club', isCaptain: false, matchesPlayed: 6, goals: 0 },
      { name: 'test', jerseyNumber: 12, position: 'Forward', club: 'Independent Athletic Club', isCaptain: false, matchesPlayed: 10, goals: 3 },
      { name: 'Carlos Ruiz', jerseyNumber: 3, position: 'Defender', club: 'Atlatico Youth Club', isCaptain: false, matchesPlayed: 7, goals: 0 }
    ],
    'inavitable': [
      { name: 'ali', jerseyNumber: 10, position: 'Forward', club: 'Independent Athletic Club', isCaptain: true, matchesPlayed: 6, goals: 2 },
      { name: 'taha', jerseyNumber: 8, position: 'Forward', club: 'Independent Athletic Club', isCaptain: false, matchesPlayed: 5, goals: 1 },
      { name: 'ubaidullah', jerseyNumber: 9, position: 'Midfielder', club: 'Independent Athletic Club', isCaptain: false, matchesPlayed: 2, goals: 1 },
      { name: 'test123', jerseyNumber: 22, position: 'Forward', club: 'Independent Athletic Club', isCaptain: false, matchesPlayed: 4, goals: 0 },
      { name: 'Samir Khan', jerseyNumber: 1, position: 'Goalkeeper', club: 'Independent Athletic Club', isCaptain: false, matchesPlayed: 5, goals: 0 }
    ],
    'ramzan': [
      { name: 'ramzan', jerseyNumber: 10, position: 'Forward', club: 'Ramzan Sporting', isCaptain: true, matchesPlayed: 4, goals: 1 },
      { name: 'Farhan Akhtar', jerseyNumber: 8, position: 'Midfielder', club: 'Ramzan Sporting', isCaptain: false, matchesPlayed: 3, goals: 0 },
      { name: 'Zayn Malik', jerseyNumber: 5, position: 'Defender', club: 'Ramzan Sporting', isCaptain: false, matchesPlayed: 4, goals: 0 },
      { name: 'Bilal Ahmed', jerseyNumber: 1, position: 'Goalkeeper', club: 'Ramzan Sporting', isCaptain: false, matchesPlayed: 4, goals: 0 }
    ],
    'Sahil': [
      { name: 'sahil', jerseyNumber: 10, position: 'Forward', club: 'Sahil FC Academy', isCaptain: true, matchesPlayed: 4, goals: 1 },
      { name: 'Aman Verma', jerseyNumber: 7, position: 'Midfielder', club: 'Sahil FC Academy', isCaptain: false, matchesPlayed: 3, goals: 0 },
      { name: 'Rohit Sharma', jerseyNumber: 4, position: 'Defender', club: 'Sahil FC Academy', isCaptain: false, matchesPlayed: 4, goals: 0 },
      { name: 'Karan Patel', jerseyNumber: 1, position: 'Goalkeeper', club: 'Sahil FC Academy', isCaptain: false, matchesPlayed: 4, goals: 0 }
    ]
  };

  const createdPlayersMap = {};

  for (const [teamName, playerList] of Object.entries(rosters)) {
    const teamDoc = teamsMap[teamName];
    const playerIds = [];
    let captainId = null;

    for (const pData of playerList) {
      // Check if jersey number is already taken in this team by a test/dummy player
      const conflict = await Player.findOne({ team: teamDoc._id, jerseyNumber: pData.jerseyNumber });
      if (conflict && conflict.name !== pData.name) {
        if (conflict.name.toLowerCase().includes('test')) {
          console.log(`Removing placeholder player: ${conflict.name} #${conflict.jerseyNumber}`);
          await Player.deleteOne({ _id: conflict._id });
        } else {
          pData.jerseyNumber = pData.jerseyNumber + 50;
        }
      }

      let pDoc = await Player.findOne({ name: pData.name, team: teamDoc._id });
      if (!pDoc) {
        // Check if player exists by name without team or with different team (e.g. taha)
        pDoc = await Player.findOne({ name: pData.name });
      }

      if (!pDoc) {
        pDoc = await Player.create({
          name: pData.name,
          jerseyNumber: pData.jerseyNumber,
          position: pData.position,
          club: pData.club,
          team: teamDoc._id,
          matchesPlayed: pData.matchesPlayed,
          goals: pData.goals,
          assists: 1,
          shots: pData.goals * 3 + 2,
          penaltiesScored: 0,
          penaltiesSaved: pData.position === 'Goalkeeper' ? 2 : 0,
          isActive: true
        });
        console.log(`Created player: ${pData.name} #${pData.jerseyNumber} for ${teamName}`);
      } else {
        pDoc.team = teamDoc._id;
        pDoc.jerseyNumber = pData.jerseyNumber;
        pDoc.position = pData.position;
        pDoc.club = pData.club;
        pDoc.matchesPlayed = Math.max(pDoc.matchesPlayed || 0, pData.matchesPlayed);
        pDoc.goals = Math.max(pDoc.goals || 0, pData.goals);
        await pDoc.save();
        console.log(`Updated player: ${pData.name} #${pData.jerseyNumber} for ${teamName}`);
      }

      createdPlayersMap[pData.name] = pDoc;
      playerIds.push(pDoc._id);
      if (pData.isCaptain) {
        captainId = pDoc._id;
      }
    }

    teamDoc.players = playerIds;
    if (captainId) {
      teamDoc.captain = captainId;
      teamDoc.captainName = playerList.find(p => p.isCaptain).name;
    }
    await teamDoc.save();
    console.log(`Team ${teamName} updated with ${playerIds.length} players and captain.`);
  }

  // 4. Update Tournament participatingTeams
  tournament.participatingTeams = Object.values(teamsMap).map(t => t._id);
  await tournament.save();
  console.log(`Tournament participating teams synchronized (${tournament.participatingTeams.length} teams).`);

  // 5. Clean out orphaned standings
  const validTeamIds = Object.values(teamsMap).map(t => t._id.toString());
  const deletedStandings = await TournamentStanding.deleteMany({
    $or: [
      { team: { $nin: Object.values(teamsMap).map(t => t._id) } },
      { tournament: { $ne: tournament._id } }
    ]
  });
  console.log(`Cleaned out ${deletedStandings.deletedCount} orphaned standings.`);

  // 6. Clear and seed authentic championship matches
  await Match.deleteMany({});
  await MatchEvent.deleteMany({});
  console.log('Cleared existing matches and events for clean championship fixtures.');

  // Match A: Live Match (Atlatico FC vs United)
  const liveMatch = await Match.create({
    tournament: tournament._id,
    matchNumber: 1,
    teamA: teamsMap['Atlatico FC']._id,
    teamB: teamsMap['United']._id,
    matchDate: new Date(),
    matchTime: '10:00',
    venue: 'Alliance National Field #1',
    stage: 'Group Stage',
    status: 'Upcoming',
    teamAScore: 0,
    teamBScore: 0,
    winner: null,
    matchResult: 'Scheduled',
    isFinalized: false,
    timer: {
      currentStage: 'First Half',
      stageDuration: 240,
      remainingTime: 240,
      startedTimestamp: null,
      pausedTimestamp: null,
      totalPausedDuration: 0,
      isPaused: false,
      isRunning: false,
      phaseEndsAt: null,
      timerStatus: 'NOT_STARTED',
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
    },
    toss: {
      isTossConducted: false,
      tossWinner: null,
      choice: null
    }
  });
  console.log(`Created Live Match 1: Atlatico FC vs United (${liveMatch._id})`);

  // Match B: Completed Match (Atlatico FC vs inavitable - 3:3, Pens 2:2)
  const completedMatch1 = await Match.create({
    tournament: tournament._id,
    matchNumber: 2,
    teamA: teamsMap['Atlatico FC']._id,
    teamB: teamsMap['inavitable']._id,
    matchDate: new Date(Date.now() - 86400000),
    matchTime: '16:00',
    venue: 'Varsity National Field #1',
    stage: 'Quarter Final',
    status: 'Completed',
    teamAScore: 3,
    teamBScore: 3,
    winner: null,
    matchResult: 'Draw',
    isFinalized: true,
    timer: {
      currentStage: 'Match Completed',
      stageDuration: 0,
      remainingTime: 0,
      isPaused: false,
      isRunning: false,
      phaseEndsAt: null,
      timerStatus: 'PAUSED'
    },
    shootout: {
      isShootout: true,
      teamAPenaltyScore: 2,
      teamBPenaltyScore: 2,
      teamAPenaltiesTaken: 3,
      teamBPenaltiesTaken: 3,
      round: 3,
      isSuddenDeath: false,
      isCompleted: true,
      shootoutWinner: null
    }
  });

  // Create Goal Events for Completed Match 1
  const goalEvents1 = [
    { team: teamsMap['Atlatico FC']._id, player: createdPlayersMap['test']?._id, minute: '01:20 (1H)' },
    { team: teamsMap['Atlatico FC']._id, player: createdPlayersMap['test']?._id, minute: '03:15 (1H)' },
    { team: teamsMap['inavitable']._id, player: createdPlayersMap['taha']?._id, minute: '02:00 (1H)' },
    { team: teamsMap['inavitable']._id, player: createdPlayersMap['ubaidullah']?._id, minute: '01:45 (2H)' },
    { team: teamsMap['Atlatico FC']._id, player: createdPlayersMap['affan']?._id, minute: '03:10 (2H)' },
    { team: teamsMap['inavitable']._id, player: createdPlayersMap['ali']?._id, minute: '03:55 (2H)' }
  ];

  for (const g of goalEvents1) {
    if (g.player) {
      const ev = await MatchEvent.create({
        match: completedMatch1._id,
        tournament: tournament._id,
        type: 'GOAL_SCORED',
        stage: 'Second Half',
        matchTime: g.minute,
        timestamp: new Date(),
        player: g.player,
        team: g.team,
        detail: { goalMethod: 'Normal Goal' }
      });
      completedMatch1.events.push(ev._id);
    }
  }
  await completedMatch1.save();
  console.log(`Created Completed Match 2: Atlatico FC 3 - 3 inavitable (${completedMatch1._id})`);

  // Match C: Completed Match (United 2 - 1 ramzan)
  const completedMatch2 = await Match.create({
    tournament: tournament._id,
    matchNumber: 3,
    teamA: teamsMap['United']._id,
    teamB: teamsMap['ramzan']._id,
    matchDate: new Date(Date.now() - 172800000),
    matchTime: '14:00',
    venue: 'Alliance National Field #2',
    stage: 'Group Stage',
    status: 'Completed',
    teamAScore: 2,
    teamBScore: 1,
    winner: teamsMap['United']._id,
    matchResult: 'Team A Won',
    isFinalized: true,
    timer: {
      currentStage: 'Match Completed',
      stageDuration: 0,
      remainingTime: 0,
      isPaused: false,
      isRunning: false,
      phaseEndsAt: null,
      timerStatus: 'PAUSED'
    }
  });

  // Goal events for match 3
  const goalEvents2 = [
    { team: teamsMap['United']._id, player: createdPlayersMap['Marcus Striker']?._id, minute: '01:05 (1H)' },
    { team: teamsMap['ramzan']._id, player: createdPlayersMap['ramzan']?._id, minute: '03:20 (1H)' },
    { team: teamsMap['United']._id, player: createdPlayersMap['irfan']?._id, minute: '02:40 (2H)' }
  ];

  for (const g of goalEvents2) {
    if (g.player) {
      const ev = await MatchEvent.create({
        match: completedMatch2._id,
        tournament: tournament._id,
        type: 'GOAL_SCORED',
        stage: 'Second Half',
        matchTime: g.minute,
        timestamp: new Date(),
        player: g.player,
        team: g.team,
        detail: { goalMethod: 'Normal Goal' }
      });
      completedMatch2.events.push(ev._id);
    }
  }
  await completedMatch2.save();
  console.log(`Created Completed Match 3: United 2 - 1 ramzan (${completedMatch2._id})`);

  // Match D: Upcoming Match (Sahil vs inavitable)
  const upcomingMatch1 = await Match.create({
    tournament: tournament._id,
    matchNumber: 4,
    teamA: teamsMap['Sahil']._id,
    teamB: teamsMap['inavitable']._id,
    matchDate: new Date(Date.now() + 86400000),
    matchTime: '15:00',
    venue: 'Varsity National Field #2',
    stage: 'Group Stage',
    status: 'Upcoming',
    teamAScore: 0,
    teamBScore: 0,
    winner: null,
    matchResult: 'Scheduled',
    isFinalized: false,
    timer: {
      currentStage: 'First Half',
      stageDuration: 240,
      remainingTime: 240,
      isPaused: false,
      isRunning: false,
      phaseEndsAt: null,
      timerStatus: 'NOT_STARTED'
    }
  });
  console.log(`Created Upcoming Match 4: Sahil vs inavitable (${upcomingMatch1._id})`);

  // Match E: Upcoming Match (United vs Sahil)
  const upcomingMatch2 = await Match.create({
    tournament: tournament._id,
    matchNumber: 5,
    teamA: teamsMap['United']._id,
    teamB: teamsMap['Sahil']._id,
    matchDate: new Date(Date.now() + 172800000),
    matchTime: '17:30',
    venue: 'Alliance National Field #1',
    stage: 'Quarter Final',
    status: 'Upcoming',
    teamAScore: 0,
    teamBScore: 0,
    winner: null,
    matchResult: 'Scheduled',
    isFinalized: false,
    timer: {
      currentStage: 'First Half',
      stageDuration: 240,
      remainingTime: 240,
      isPaused: false,
      isRunning: false,
      phaseEndsAt: null,
      timerStatus: 'NOT_STARTED'
    }
  });
  console.log(`Created Upcoming Match 5: United vs Sahil (${upcomingMatch2._id})`);

  // 7. Recalculate Standings Dynamically
  console.log('\nRecalculating Tournament Standings...');
  const updatedStandings = await StandingsService.recalculateTournamentStandings(tournament._id);
  console.log(`Standings recalculated successfully (${updatedStandings.length} teams in table):`);
  updatedStandings.forEach(s => {
    const tName = s.team?.name || s.team;
    console.log(`  Pos ${s.position}: ${tName} | P: ${s.matchesPlayed} W: ${s.matchesWon} L: ${s.matchesLost} GF: ${s.goalsScored} GA: ${s.goalsConceded} GD: ${s.goalDifference} PTS: ${s.totalPoints}`);
  });

  // Verify final player and team counts
  const totalPlayers = await Player.countDocuments();
  const totalTeams = await Team.countDocuments();
  const totalMatches = await Match.countDocuments();
  console.log(`\nFinal Database Summary:`);
  console.log(`  Teams: ${totalTeams}`);
  console.log(`  Players: ${totalPlayers}`);
  console.log(`  Matches: ${totalMatches}`);

  await mongoose.disconnect();
  console.log('Database synchronization complete.');
}

seedTournamentData().catch(e => {
  console.error('Seed error:', e);
  process.exit(1);
});
