const mongoose = require('mongoose');
const { EVENT_TYPES, TIMER_STAGES } = require('../utils/constants');

const matchEventSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: [true, 'Match ID is required']
    },
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      default: null
    },
    type: {
      type: String,
      enum: Object.values(EVENT_TYPES),
      required: [true, 'Event type is required']
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null
    },
    secondaryPlayer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null
    },
    matchTime: {
      type: String,
      default: ''
    },
    stage: {
      type: String,
      default: TIMER_STAGES.FIRST_HALF
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    detail: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    isUndone: {
      type: Boolean,
      default: false
    },
    correctionEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchEvent',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

matchEventSchema.index({ match: 1, timestamp: 1 });
matchEventSchema.index({ match: 1, createdAt: 1 });
matchEventSchema.index({ tournament: 1 });
matchEventSchema.index({ player: 1 });
matchEventSchema.index({ team: 1 });

const MatchEvent = mongoose.model('MatchEvent', matchEventSchema);
module.exports = MatchEvent;
