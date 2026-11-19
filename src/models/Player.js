const mongoose = require('mongoose');
const { PLAYER_POSITIONS } = require('../utils/constants');

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Player name is required'],
      trim: true
    },
    jerseyNumber: {
      type: Number,
      required: [true, 'Jersey number is required'],
      min: [1, 'Jersey number must be at least 1'],
      max: [99, 'Jersey number cannot exceed 99']
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team ID is required']
    },
    position: {
      type: String,
      enum: Object.values(PLAYER_POSITIONS),
      default: PLAYER_POSITIONS.FORWARD
    },
    matchesPlayed: {
      type: Number,
      default: 0,
      min: 0
    },
    goals: {
      type: Number,
      default: 0,
      min: 0
    },
    penaltiesScored: {
      type: Number,
      default: 0,
      min: 0
    },
    penaltiesSaved: {
      type: Number,
      default: 0,
      min: 0
    },
    wins: {
      type: Number,
      default: 0,
      min: 0
    },
    losses: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

playerSchema.index({ team: 1, jerseyNumber: 1 }, { unique: true });
playerSchema.index({ goals: -1 });
playerSchema.index({ penaltiesScored: -1 });
playerSchema.index({ penaltiesSaved: -1 });

const Player = mongoose.model('Player', playerSchema);
module.exports = Player;
