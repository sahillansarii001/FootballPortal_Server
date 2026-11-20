const MatchService = require('../services/matchService');
const Match = require('../models/Match');
const TimerService = require('../services/timerService');
const StandingsService = require('../services/standingsService');
const { socketEmitter } = require('../sockets/socketManager');
const { MATCH_STATUS, TIMER_STAGES } = require('../utils/constants');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const scheduleMatch = asyncHandler(async (req, res) => {
  const match = await MatchService.scheduleMatch(req.body);
  return ApiResponse.created(res, 'Match scheduled successfully', match);
});

const updateMatch = asyncHandler(async (req, res) => {
  const match = await MatchService.updateMatch(req.params.id, req.body);

  // Broadcast real-time score updates to all sockets (room + global) immediately
  if (req.body.teamAScore !== undefined || req.body.teamBScore !== undefined) {
    socketEmitter.broadcastScoreUpdate(match._id.toString(), {
      matchId: match._id.toString(),
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore,
      score: {
        teamA: match.teamAScore,
        teamB: match.teamBScore
      }
    });
  }

  // Broadcast full state sync for any changes (score, status, stage, timer, venue)
  try {
    const liveState = await MatchService.getLiveMatchState(match._id.toString());
    socketEmitter.broadcastMatchSync(match._id.toString(), liveState);
  } catch (err) {
    socketEmitter.broadcastMatchSync(match._id.toString(), match);
  }

  return ApiResponse.success(res, 'Match updated successfully', match);
});

const deleteMatch = asyncHandler(async (req, res) => {
  const result = await MatchService.deleteMatch(req.params.id);
  if (!result) {
    return ApiResponse.notFound(res, 'Match not found');
  }
  return ApiResponse.success(res, result.message);
});

const getAllMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getAllMatches(req.query);
  return ApiResponse.success(res, 'Matches fetched successfully', matches);
});

const getUpcomingMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getUpcomingMatches(req.query.tournament);
  return ApiResponse.success(res, 'Upcoming matches fetched successfully', matches);
});

const getLiveMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getLiveMatches(req.query.tournament);
  return ApiResponse.success(res, 'Live matches fetched successfully', matches);
});

const getCompletedMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getCompletedMatches(req.query.tournament);
  return ApiResponse.success(res, 'Completed matches fetched successfully', matches);
});

const getMatchById = asyncHandler(async (req, res) => {
  const match = await MatchService.getMatchById(req.params.id);
  if (!match) {
    return ApiResponse.notFound(res, 'Match not found');
  }
  return ApiResponse.success(res, 'Match fetched successfully', match);
});

const getMatchesByTeam = asyncHandler(async (req, res) => {
  const matches = await MatchService.getMatchesByTeam(req.params.teamId);
  return ApiResponse.success(res, 'Team matches fetched successfully', matches);
});

const getLiveMatchState = asyncHandler(async (req, res) => {
  const state = await MatchService.getLiveMatchState(req.params.id);
  if (!state) {
    return ApiResponse.notFound(res, 'Live match state not found');
  }
  return ApiResponse.success(res, 'Authoritative live match state fetched successfully', state);
});

const getMatchEvents = asyncHandler(async (req, res) => {
  const events = await MatchService.getMatchEvents(req.params.id);
  return ApiResponse.success(res, 'Match events fetched successfully', events);
});

const getMatchTimeline = asyncHandler(async (req, res) => {
  const timeline = await MatchService.getMatchTimeline(req.params.id);
  return ApiResponse.success(res, 'Match chronological timeline fetched successfully', timeline);
});

const endMatch = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id)
    .populate('teamA', 'name logo')
    .populate('teamB', 'name logo');
  if (!match) {
    return ApiResponse.notFound(res, 'Match not found');
  }

  match.status = MATCH_STATUS.COMPLETED;
  match.isFinalized = true;
  match.timer.isRunning = false;
  match.timer.isPaused = false;
  match.timer.remainingTime = 0;
  match.timer.currentStage = TIMER_STAGES.COMPLETED;

  // Accept optional body overrides from operator / finalize call
  if (req.body) {
    if (req.body.shootout) {
      match.shootout = {
        ...(match.shootout ? (typeof match.shootout.toObject === 'function' ? match.shootout.toObject() : match.shootout) : {}),
        ...req.body.shootout,
        isShootout: true,
        isCompleted: true
      };
    }
    if (typeof req.body.penaltyScoreA === 'number') {
      match.shootout = match.shootout || {};
      match.shootout.teamAPenaltyScore = req.body.penaltyScoreA;
      match.shootout.isShootout = true;
    }
    if (typeof req.body.penaltyScoreB === 'number') {
      match.shootout = match.shootout || {};
      match.shootout.teamBPenaltyScore = req.body.penaltyScoreB;
      match.shootout.isShootout = true;
    }
    if (req.body.shootoutWinner) {
      match.shootout = match.shootout || {};
      match.shootout.shootoutWinner = req.body.shootoutWinner;
      match.shootout.isCompleted = true;
      if (!req.body.winner) match.winner = req.body.shootoutWinner;
    }
    if (req.body.winner) {
      match.winner = req.body.winner;
    }
    if (req.body.matchResult) {
      match.matchResult = req.body.matchResult;
    }
  }

  const teamAIdStr = (match.teamA?._id || match.teamA).toString();
  const teamBIdStr = (match.teamB?._id || match.teamB).toString();
  const teamAName = match.teamA?.name || 'Team A';
  const teamBName = match.teamB?.name || 'Team B';

  if (match.teamAScore > match.teamBScore) {
    match.winner = match.teamA?._id || match.teamA;
    match.matchResult = `${teamAName} Victory`;
  } else if (match.teamBScore > match.teamAScore) {
    match.winner = match.teamB?._id || match.teamB;
    match.matchResult = `${teamBName} Victory`;
  } else {
    // Scores are tied! Check shootout or sudden-death toss results
    const penA = match.shootout?.teamAPenaltyScore ?? 0;
    const penB = match.shootout?.teamBPenaltyScore ?? 0;
    const hasPenalties = penA > 0 || penB > 0 || match.shootout?.isShootout;

    if (match.winner) {
      const isTeamAWinner = match.winner.toString() === teamAIdStr;
      const winnerName = isTeamAWinner ? teamAName : teamBName;
      if (hasPenalties) {
        match.shootout = match.shootout || {};
        match.shootout.isShootout = true;
        match.shootout.isCompleted = true;
        match.shootout.shootoutWinner = match.winner;
        match.matchResult = `${winnerName} won (${penA} - ${penB}) on penalties`;
      } else if (!match.matchResult || match.matchResult === 'Full Time Draw') {
        match.matchResult = `${winnerName} Victory`;
      }
    } else if (match.shootout?.shootoutWinner) {
      match.winner = match.shootout.shootoutWinner;
      const isTeamAWinner = match.winner.toString() === teamAIdStr;
      const winnerName = isTeamAWinner ? teamAName : teamBName;
      match.matchResult = `${winnerName} won (${penA} - ${penB}) on penalties`;
    } else if (penA > penB) {
      match.winner = match.teamA?._id || match.teamA;
      match.shootout = match.shootout || {};
      match.shootout.shootoutWinner = match.winner;
      match.shootout.isShootout = true;
      match.shootout.isCompleted = true;
      match.matchResult = `${teamAName} won (${penA} - ${penB}) on penalties`;
    } else if (penB > penA) {
      match.winner = match.teamB?._id || match.teamB;
      match.shootout = match.shootout || {};
      match.shootout.shootoutWinner = match.winner;
      match.shootout.isShootout = true;
      match.shootout.isCompleted = true;
      match.matchResult = `${teamBName} won (${penA} - ${penB}) on penalties`;
    } else if (match.toss?.winner) {
      match.winner = match.toss.winner;
      const isTeamAWinner = match.winner.toString() === teamAIdStr;
      const winnerName = isTeamAWinner ? teamAName : teamBName;
      match.matchResult = `${winnerName} Sudden Death Victory`;
    } else {
      match.matchResult = req.body?.matchResult || 'Full Time Draw';
    }
  }

  await match.save();
  await TimerService.finalizeMatch(match._id);

  if (match.tournament) {
    await StandingsService.recalculateTournamentStandings(match.tournament);
  }

  socketEmitter.broadcastMatchCompleted(match._id, match.tournament, {
    matchId: match._id,
    status: MATCH_STATUS.COMPLETED,
    winner: match.winner,
    matchResult: match.matchResult,
    teamAScore: match.teamAScore,
    teamBScore: match.teamBScore,
    shootout: match.shootout
  });

  const updated = await Match.findById(match._id)
    .populate('teamA', 'name logo')
    .populate('teamB', 'name logo')
    .populate('winner', 'name logo')
    .populate('shootout.shootoutWinner', 'name logo');

  return ApiResponse.success(res, 'Match ended and finalized successfully', updated);
});

module.exports = {
  scheduleMatch,
  updateMatch,
  deleteMatch,
  getAllMatches,
  getUpcomingMatches,
  getLiveMatches,
  getCompletedMatches,
  getMatchById,
  getMatchesByTeam,
  getLiveMatchState,
  getMatchEvents,
  getMatchTimeline,
  endMatch
};
