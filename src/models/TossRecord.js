const mongoose = require('mongoose');

const tossRecordSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true
    },
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament'
    },
    tossWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true
    },
    choice: {
      type: String,
      enum: ['ATTACK', 'DEFEND', 'SHOOT', 'SAVE'],
      required: true
    },
    kickingTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    defendingTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    decisivePenaltyTaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player'
    },
    decisiveGoalkeeper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player'
    },
    decisiveOutcome: {
      type: String,
      enum: ['GOAL', 'SAVED', 'MISSED', null],
      default: null
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    conductedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TossRecord', tossRecordSchema);
