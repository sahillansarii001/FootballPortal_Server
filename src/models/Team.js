const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      unique: true,
      maxlength: [80, 'Team name cannot exceed 80 characters']
    },
    logo: {
      type: String,
      trim: true,
      default: ''
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null
    },
    coach: {
      type: String,
      trim: true,
      default: ''
    },
    players: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
      }
    ],
    matchesPlayed: {
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
    goalDifference: {
      type: Number,
      default: 0
    },
    totalPoints: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

teamSchema.index({ totalPoints: -1, goalDifference: -1, goalsScored: -1 });

const Team = mongoose.model('Team', teamSchema);
module.exports = Team;
