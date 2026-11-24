const mongoose = require('mongoose');
const { TOURNAMENT_STATUS, STAGE_DURATIONS, TIMER_STAGES, DEFAULT_INITIAL_PENALTY_KICKS, POINTS } = require('../utils/constants');

const tournamentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tournament name is required'],
      trim: true,
      unique: true,
      maxlength: [100, 'Tournament name cannot exceed 100 characters']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required']
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required']
    },
    participatingTeams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
      }
    ],
    status: {
      type: String,
      enum: Object.values(TOURNAMENT_STATUS),
      default: TOURNAMENT_STATUS.UPCOMING
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null
    },
    rules: {
      halfDurationSeconds: {
        type: Number,
        default: STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF]
      },
      transitionDurationSeconds: {
        type: Number,
        default: STAGE_DURATIONS[TIMER_STAGES.TRANSITION_GAP]
      },
      halfTimeDurationSeconds: {
        type: Number,
        default: STAGE_DURATIONS[TIMER_STAGES.HALF_TIME]
      },
      initialPenaltyKicks: {
        type: Number,
        default: DEFAULT_INITIAL_PENALTY_KICKS
      },
      pointsForWin: {
        type: Number,
        default: POINTS.WIN
      },
      pointsForDraw: {
        type: Number,
        default: POINTS.DRAW !== undefined ? POINTS.DRAW : 0
      },
      pointsForLoss: {
        type: Number,
        default: POINTS.LOSS
      }
    }
  },
  {
    timestamps: true
  }
);

tournamentSchema.index({ status: 1 });
tournamentSchema.index({ startDate: 1 });

const Tournament = mongoose.model('Tournament', tournamentSchema);
module.exports = Tournament;
