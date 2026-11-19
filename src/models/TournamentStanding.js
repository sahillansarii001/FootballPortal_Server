const mongoose = require('mongoose');

const tournamentStandingSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      required: [true, 'Tournament ID is required']
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team ID is required']
    },
    position: {
      type: Number,
      default: 0
    },
    matchesPlayed: {
      type: Number,
      default: 0,
      min: 0
    },
    won: {
      type: Number,
      default: 0,
      min: 0
    },
    lost: {
      type: Number,
      default: 0,
      min: 0
    },
    goalsFor: {
      type: Number,
      default: 0,
      min: 0
    },
    goalsAgainst: {
      type: Number,
      default: 0,
      min: 0
    },
    goalDifference: {
      type: Number,
      default: 0
    },
    points: {
      type: Number,
      default: 0,
      min: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

tournamentStandingSchema.index({ tournament: 1, team: 1 }, { unique: true });
tournamentStandingSchema.index({ tournament: 1, points: -1, goalDifference: -1, goalsFor: -1 });

const TournamentStanding = mongoose.model('TournamentStanding', tournamentStandingSchema);
module.exports = TournamentStanding;
