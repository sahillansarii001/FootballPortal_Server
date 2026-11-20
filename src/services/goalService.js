const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const Player = require('../models/Player');
const { socketEmitter } = require('../sockets/socketManager');
const { GOAL_TYPES, EVENT_TYPES } = require('../utils/constants');
const { withTransaction } = require('../utils/transaction');

class GoalService {
  /**
   * Record a goal for a match
   */
  static async recordGoal(matchId, goalData, userId = null) {
    const { team: teamId, player: playerId, goalType = GOAL_TYPES.NORMAL, matchTime, description } = goalData;

    return await withTransaction(async (session) => {
      const match = await Match.findById(matchId).session(session);
      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status === 'Completed') {
        throw new Error('Cannot add goals to a completed match');
      }

      const isTeamA = match.teamA.toString() === teamId;
      const isTeamB = match.teamB.toString() === teamId;
      if (!isTeamA && !isTeamB) {
        throw new Error('The specified team is not participating in this match');
      }

      let player = null;
      if (playerId && /^[0-9a-fA-F]{24}$/.test(playerId)) {
        player = await Player.findById(playerId).session(session);
      }
      if (!player) {
        player = await Player.findOne({ team: teamId }).session(session);
        if (!player) {
          const createdPlayers = await Player.create(
            [
              {
                name: 'Varsity Striker',
                jerseyNumber: 10,
                team: teamId,
                position: 'Forward'
              }
            ],
            { session }
          );
          player = createdPlayers[0];
        }
      }

      // Determine beneficiary team:
      // If Own Goal, the opposing team gets the score!
      let beneficiaryTeamId = teamId;
      if (goalType === GOAL_TYPES.OWN_GOAL) {
        beneficiaryTeamId = isTeamA ? match.teamB.toString() : match.teamA.toString();
      }

      // Update match score
      if (beneficiaryTeamId === match.teamA.toString()) {
        match.teamAScore += 1;
      } else {
        match.teamBScore += 1;
      }

      // Update player statistics (own goals do not increment player's goals)
      if (goalType !== GOAL_TYPES.OWN_GOAL) {
        player.goals += 1;
        if (goalType === GOAL_TYPES.PENALTY) {
          player.penaltiesScored += 1;
        }
        await player.save({ session });
      }

      // Determine display time
      let eventTime = matchTime;
      const stage = match.timer?.currentStage || 'First Half';
      const remaining = match.timer?.remainingTime ?? 0;
      if (!eventTime) {
        const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
        const ss = (remaining % 60).toString().padStart(2, '0');
        eventTime = `${mm}:${ss} (${stage})`;
      }

      // Create MatchEvent with standardized event type GOAL_SCORED
      const matchEvents = await MatchEvent.create(
        [
          {
            match: match._id,
            tournament: match.tournament,
            type: EVENT_TYPES.GOAL_SCORED,
            team: teamId,
            player: playerId,
            matchTime: eventTime,
            stage,
            timestamp: new Date(),
            detail: {
              goalType,
              description: description || '',
              beneficiaryTeam: beneficiaryTeamId,
              teamAScore: match.teamAScore,
              teamBScore: match.teamBScore
            },
            createdBy: userId
          }
        ],
        { session }
      );

      const matchEvent = matchEvents[0];
      match.events.push(matchEvent._id);
      await match.save({ session });

      const query = MatchEvent.findById(matchEvent._id);
      if (session) query.session(session);
      const populatedEvent = await query
        .populate('team', 'name logo')
        .populate('player', 'name jerseyNumber position');

      // Broadcast live updates via Socket.IO
      socketEmitter.broadcastScoreUpdate(matchId, {
        matchId,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore,
        score: {
          teamA: match.teamAScore,
          teamB: match.teamBScore
        }
      });

      socketEmitter.broadcastGoalEvent(matchId, {
        event: populatedEvent,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore,
        score: {
          teamA: match.teamAScore,
          teamB: match.teamBScore
        }
      });

      return {
        match,
        event: populatedEvent
      };
    });
  }

  /**
   * Get all goals for a match
   */
  static async getMatchGoals(matchId) {
    return MatchEvent.find({
      match: matchId,
      type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
      isUndone: false
    })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .sort({ createdAt: 1 });
  }

  /**
   * Get all goals scored by a player
   */
  static async getPlayerGoals(playerId) {
    return MatchEvent.find({
      player: playerId,
      type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
      isUndone: false
    })
      .populate('match', 'matchNumber matchDate')
      .populate('team', 'name logo')
      .sort({ createdAt: -1 });
  }

  /**
   * Undo a recorded goal with full audit trail and player statistic reversal
   */
  static async undoGoal(matchId, eventId, userId = null) {
    return await withTransaction(async (session) => {
      const match = await Match.findById(matchId).session(session);
      if (!match) {
        throw new Error('Match not found');
      }

      let goalEvent = null;
      if (eventId) {
        goalEvent = await MatchEvent.findOne({
          _id: eventId,
          match: matchId,
          type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
          isUndone: false
        }).session(session);
      } else {
        // Find the most recent goal event
        goalEvent = await MatchEvent.findOne({
          match: matchId,
          type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
          isUndone: false
        })
          .sort({ createdAt: -1 })
          .session(session);
      }

      if (!goalEvent) {
        throw new Error('No active goal event found to undo');
      }

      const { detail, team: teamId, player: playerId } = goalEvent;
      const beneficiaryTeamId = detail.beneficiaryTeam ? detail.beneficiaryTeam.toString() : teamId.toString();

      // Revert match score
      if (beneficiaryTeamId === match.teamA.toString()) {
        match.teamAScore = Math.max(0, match.teamAScore - 1);
      } else {
        match.teamBScore = Math.max(0, match.teamBScore - 1);
      }

      // Revert player statistics
      if (playerId && detail.goalType !== GOAL_TYPES.OWN_GOAL) {
        const player = await Player.findById(playerId).session(session);
        if (player) {
          player.goals = Math.max(0, player.goals - 1);
          if (detail.goalType === GOAL_TYPES.PENALTY) {
            player.penaltiesScored = Math.max(0, player.penaltiesScored - 1);
          }
          await player.save({ session });
        }
      }

      goalEvent.isUndone = true;
      await goalEvent.save({ session });

      // Record audit correction event GOAL_REMOVED
      const undoRecords = await MatchEvent.create(
        [
          {
            match: match._id,
            tournament: match.tournament,
            type: EVENT_TYPES.GOAL_REMOVED,
            team: teamId,
            player: playerId,
            matchTime: goalEvent.matchTime,
            stage: goalEvent.stage,
            timestamp: new Date(),
            correctionEventId: goalEvent._id,
            detail: { undoneEventId: goalEvent._id, previousDetail: detail },
            createdBy: userId
          }
        ],
        { session }
      );

      const undoRecord = undoRecords[0];
      match.events.push(undoRecord._id);
      await match.save({ session });

      // Broadcast changes
      socketEmitter.broadcastScoreUpdate(matchId, {
        matchId,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore
      });

      socketEmitter.broadcastGoalUndone(matchId, {
        undoneEventId: goalEvent._id,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore
      });

      return {
        message: 'Goal undone successfully',
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore,
        undoneEvent: goalEvent
      };
    });
  }

  /**
   * Edit goal details (recalculating any stats if player or goalType changed)
   */
  static async editGoal(matchId, eventId, updateData) {
    return await withTransaction(async (session) => {
      const match = await Match.findById(matchId).session(session);
      if (!match) {
        throw new Error('Match not found');
      }

      const goalEvent = await MatchEvent.findOne({
        _id: eventId,
        match: matchId,
        type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
        isUndone: false
      }).session(session);

      if (!goalEvent) {
        throw new Error('Goal event not found');
      }

      const oldGoalType = goalEvent.detail.goalType;
      const oldPlayerId = goalEvent.player?.toString();
      const newPlayerId = updateData.player ? updateData.player.toString() : oldPlayerId;
      const newGoalType = updateData.goalType || oldGoalType;

      // If player changed or goal type changed, adjust statistics
      if (oldPlayerId !== newPlayerId || oldGoalType !== newGoalType) {
        // Revert old player
        if (oldPlayerId && oldGoalType !== GOAL_TYPES.OWN_GOAL) {
          const oldPlayer = await Player.findById(oldPlayerId).session(session);
          if (oldPlayer) {
            oldPlayer.goals = Math.max(0, oldPlayer.goals - 1);
            if (oldGoalType === GOAL_TYPES.PENALTY) {
              oldPlayer.penaltiesScored = Math.max(0, oldPlayer.penaltiesScored - 1);
            }
            await oldPlayer.save({ session });
          }
        }

        // Apply to new player
        if (newPlayerId && newGoalType !== GOAL_TYPES.OWN_GOAL) {
          const newPlayer = await Player.findById(newPlayerId).session(session);
          if (newPlayer) {
            newPlayer.goals += 1;
            if (newGoalType === GOAL_TYPES.PENALTY) {
              newPlayer.penaltiesScored += 1;
            }
            await newPlayer.save({ session });
          }
        }

        // Check if own goal status changed affecting team score
        const isTeamA = match.teamA.toString() === goalEvent.team.toString();
        const oldBeneficiary = goalEvent.detail.beneficiaryTeam ? goalEvent.detail.beneficiaryTeam.toString() : goalEvent.team.toString();
        let newBeneficiary = goalEvent.team.toString();
        if (newGoalType === GOAL_TYPES.OWN_GOAL) {
          newBeneficiary = isTeamA ? match.teamB.toString() : match.teamA.toString();
        }

        if (oldBeneficiary !== newBeneficiary) {
          if (oldBeneficiary === match.teamA.toString()) {
            match.teamAScore = Math.max(0, match.teamAScore - 1);
            match.teamBScore += 1;
          } else {
            match.teamBScore = Math.max(0, match.teamBScore - 1);
            match.teamAScore += 1;
          }
          await match.save({ session });
        }
      }

      // Update match event
      if (updateData.player) goalEvent.player = updateData.player;
      if (updateData.matchTime) goalEvent.matchTime = updateData.matchTime;
      goalEvent.detail = {
        ...goalEvent.detail,
        goalType: newGoalType,
        description: updateData.description !== undefined ? updateData.description : goalEvent.detail.description
      };

      await goalEvent.save({ session });

      socketEmitter.broadcastScoreUpdate(matchId, {
        matchId,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore
      });

      const editQuery = MatchEvent.findById(goalEvent._id);
      if (session) editQuery.session(session);
      return await editQuery
        .populate('team', 'name logo')
        .populate('player', 'name jerseyNumber position');
    });
  }
}

module.exports = GoalService;
