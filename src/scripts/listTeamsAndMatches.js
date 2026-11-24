require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const Team = require('../models/Team');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');

async function run() {
  await connectDatabase();
  const teams = await Team.find({}).sort({ createdAt: 1 });
  console.log('TEAMS IN PORTAL:');
  teams.forEach((t, i) => {
    console.log(`[${i}] ID: ${t._id} | Name: "${t.name}" | ShortName: "${t.shortName || ''}"`);
  });

  const matches = await Match.find({}).populate('teamA', 'name').populate('teamB', 'name').sort({ matchNumber: 1 });
  console.log('\nEXISTING MATCHES IN PORTAL:');
  matches.forEach(m => {
    console.log(`Match #${m.matchNumber} | Status: ${m.status} | ${m.teamA?.name} vs ${m.teamB?.name} | Date: ${m.matchDate} | Time: ${m.matchTime}`);
  });

  const tourns = await Tournament.find({});
  console.log('\nTOURNAMENTS:');
  tourns.forEach(t => console.log(`ID: ${t._id} | Name: "${t.name}"`));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
