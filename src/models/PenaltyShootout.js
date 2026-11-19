const mongoose = require('mongoose');
const { PENALTY_OUTCOMES } = require('../utils/constants');

const penaltyShootoutSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: [true, 'Match ID is required']
    },
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
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: [true, 'Penalty taker is required']
    },
    goalkeeper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: [true, 'Goalkeeper is required']
    },
    penaltyNumber: {
      type: Number,
      required: [true, 'Penalty number is required']
    },
    round: {
      type: Number,
      required: [true, 'Round number is required']
    },
    outcome: {
      type: String,
      enum: Object.values(PENALTY_OUTCOMES),
      required: [true, 'Outcome is required']
    },
    isSuddenDeath: {
      type: Boolean,
      default: false
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

penaltyShootoutSchema.index({ match: 1, penaltyNumber: 1 });
penaltyShootoutSchema.index({ match: 1, round: 1 });

const PenaltyShootout = mongoose.model('PenaltyShootout', penaltyShootoutSchema);
module.exports = PenaltyShootout;
