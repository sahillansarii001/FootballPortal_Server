const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

async function inspectDb() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB:', mongoose.connection.name);

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));

  const User = mongoose.connection.collection('users');
  const Tournament = mongoose.connection.collection('tournaments');
  const Team = mongoose.connection.collection('teams');
  const Player = mongoose.connection.collection('players');
  const Match = mongoose.connection.collection('matches');
  const Standings = mongoose.connection.collection('tournamentstandings');

  const usersCount = await User.countDocuments();
  const tournCount = await Tournament.countDocuments();
  const teamsCount = await Team.countDocuments();
  const playersCount = await Player.countDocuments();
  const matchesCount = await Match.countDocuments();
  const standingsCount = await Standings.countDocuments();

  console.log(`Counts:\n  Users: ${usersCount}\n  Tournaments: ${tournCount}\n  Teams: ${teamsCount}\n  Players: ${playersCount}\n  Matches: ${matchesCount}\n  Standings: ${standingsCount}`);

  const tourns = await Tournament.find({}).toArray();
  console.log('\nTournaments in DB:');
  tourns.forEach(t => console.log(`  - [${t._id}] ${t.name} (status: ${t.status})`));

  const teams = await Team.find({}).toArray();
  console.log('\nTeams in DB:');
  teams.forEach(t => console.log(`  - [${t._id}] ${t.name} (captain: ${t.captain || 'none'}, players: ${t.players ? t.players.length : 0})`));

  const players = await Player.find({}).toArray();
  console.log('\nPlayers in DB:');
  players.forEach(p => console.log(`  - [${p._id}] #${p.jerseyNumber} ${p.name} (team: ${p.team}, goals: ${p.goals})`));

  const matches = await Match.find({}).toArray();
  console.log('\nMatches in DB:');
  matches.forEach(m => console.log(`  - [${m._id}] ${m.teamA} vs ${m.teamB} (${m.status}, score: ${m.score?.teamA}-${m.score?.teamB})`));

  const users = await User.find({}).toArray();
  console.log('\nUsers in DB:');
  users.forEach(u => console.log(`  - [${u._id}] ${u.email} (role: ${u.role})`));

  await mongoose.disconnect();
}

inspectDb().catch(e => {
  console.error(e);
  process.exit(1);
});
