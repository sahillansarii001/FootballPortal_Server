const mongoose = require('mongoose');
const { MATCH_STATUS, TIMER_STAGES, STAGE_DURATIONS } = require('../utils/constants');

const stageHistorySchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: Object.values(TIMER_STAGES),
      required: true
    },
    startedAt: {
      type: Date,
      required: true
    },
    endedAt: {
      type: Date
    },
    durationSeconds: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const timerSchema = new mongoose.Schema(
  {
    currentStage: {
      type: String,
      enum: Object.values(TIMER_STAGES),
      default: TIMER_STAGES.FIRST_HALF
    },
    stageDuration: {
      type: Number,
      default: STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF] // 240s
    },
    remainingTime: {
      type: Number,
      default: STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF] // 240s
    },
    startedTimestamp: {
      type: Date,
      default: null
    },
    pausedTimestamp: {
      type: Date,
      default: null
    },
    totalPausedDuration: {
      type: Number,
      default: 0 // in milliseconds
    },
    isPaused: {
      type: Boolean,
      default: false
    },
    isRunning: {
      type: Boolean,
      default: false
    },
    phaseEndsAt: {
      type: Date,
      default: null
    },
    lastTransitionAt: {
      type: Date,
      default: null
    },
    timerStatus: {
      type: String,
      enum: ['NOT_STARTED', 'IDLE', 'RUNNING', 'PAUSED', 'COMPLETED'],
      default: 'NOT_STARTED'
    },
    stageHistory: [stageHistorySchema]
  },
  { _id: false }
);

const shootoutStateSchema = new mongoose.Schema(
  {
    isShootout: {
      type: Boolean,
      default: false
    },
    teamAPenaltyScore: {
      type: Number,
      default: 0,
      min: 0
    },
    teamBPenaltyScore: {
      type: Number,
      default: 0,
      min: 0
    },
    teamAPenaltiesTaken: {
      type: Number,
      default: 0,
      min: 0
    },
    teamBPenaltiesTaken: {
      type: Number,
      default: 0,
      min: 0
    },
    round: {
      type: Number,
      default: 1
    },
    isSuddenDeath: {
      type: Boolean,
      default: false
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    shootoutWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    }
  },
  { _id: false }
);

const tossSchema = new mongoose.Schema(
  {
    isTossConducted: {
      type: Boolean,
      default: false
    },
    tossWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    choice: {
      type: String,
      enum: ['ATTACK', 'DEFEND', 'SHOOT', 'SAVE', null],
      default: null
    },
    kickingTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    defendingTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    decisivePenaltyTaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null
    },
    decisiveGoalkeeper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null
    },
    decisiveOutcome: {
      type: String,
      enum: ['GOAL', 'SAVED', 'MISSED', null],
      default: null
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    conductedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      required: [true, 'Tournament ID is required']
    },
    matchNumber: {
      type: Number,
      required: [true, 'Match number is required']
    },
    teamA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team A is required']
    },
    teamB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team B is required']
    },
    matchDate: {
      type: Date,
      required: [true, 'Match date is required']
    },
    matchTime: {
      type: String,
      required: [true, 'Match time is required'],
      trim: true
    },
    venue: {
      type: String,
      required: [true, 'Venue is required'],
      trim: true
    },
    stage: {
      type: String,
      default: 'Group Stage',
      trim: true
    },
    status: {
      type: String,
      enum: Object.values(MATCH_STATUS),
      default: MATCH_STATUS.UPCOMING
    },
    teamAScore: {
      type: Number,
      default: 0,
      min: 0
    },
    teamBScore: {
      type: Number,
      default: 0,
      min: 0
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    matchResult: {
      type: String,
      default: 'Scheduled'
    },
    isFinalized: {
      type: Boolean,
      default: false
    },
    previousRuns: [
      {
        type: mongoose.Schema.Types.Mixed,
        default: []
      }
    ],
    events: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MatchEvent'
      }
    ],
    timer: {
      type: timerSchema,
      default: () => ({})
    },
    shootout: {
      type: shootoutStateSchema,
      default: () => ({})
    },
    toss: {
      type: tossSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

matchSchema.index({ tournament: 1, matchNumber: 1 }, { unique: true });
matchSchema.index({ status: 1 });
matchSchema.index({ matchDate: 1, matchTime: 1 });
matchSchema.index({ teamA: 1, matchDate: 1, matchTime: 1 });
matchSchema.index({ teamB: 1, matchDate: 1, matchTime: 1 });

const Match = mongoose.model('Match', matchSchema);
module.exports = Match;
