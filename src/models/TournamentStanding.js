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
    matchesWon: {
      type: Number,
      default: 0,
      min: 0
    },
    matchesLost: {
      type: Number,
      default: 0,
      min: 0
    },
    goalsScored: {
      type: Number,
      default: 0,
      min: 0
    },
    goalsConceded: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPoints: {
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
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.matchesWon = ret.matchesWon !== undefined ? ret.matchesWon : ret.won;
        ret.matchesLost = ret.matchesLost !== undefined ? ret.matchesLost : ret.lost;
        ret.goalsScored = ret.goalsScored !== undefined ? ret.goalsScored : ret.goalsFor;
        ret.goalsConceded = ret.goalsConceded !== undefined ? ret.goalsConceded : ret.goalsAgainst;
        ret.totalPoints = ret.totalPoints !== undefined ? ret.totalPoints : ret.points;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.matchesWon = ret.matchesWon !== undefined ? ret.matchesWon : ret.won;
        ret.matchesLost = ret.matchesLost !== undefined ? ret.matchesLost : ret.lost;
        ret.goalsScored = ret.goalsScored !== undefined ? ret.goalsScored : ret.goalsFor;
        ret.goalsConceded = ret.goalsConceded !== undefined ? ret.goalsConceded : ret.goalsAgainst;
        ret.totalPoints = ret.totalPoints !== undefined ? ret.totalPoints : ret.points;
        return ret;
      }
    }
  }
);

tournamentStandingSchema.index({ tournament: 1, team: 1 }, { unique: true });
tournamentStandingSchema.index({ tournament: 1, points: -1, goalDifference: -1, goalsFor: -1 });

const TournamentStanding = mongoose.model('TournamentStanding', tournamentStandingSchema);
module.exports = TournamentStanding;
