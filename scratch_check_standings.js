require('dotenv').config();
const mongoose = require('mongoose');

async function checkStandings() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Standings = mongoose.connection.collection('tournamentstandings');
  const items = await Standings.find({}).toArray();
  console.log('Standings records (' + items.length + '):');
  for (const s of items) {
    console.log(JSON.stringify({ _id: s._id, tournament: s.tournament, team: s.team, played: s.matchesPlayed, won: s.matchesWon, points: s.totalPoints }));
  }
  await mongoose.disconnect();
}
checkStandings();
