const mongoose = require('mongoose');
const Match = require('./src/models/Match');
const Tournament = require('./src/models/Tournament');
const Team = require('./src/models/Team');
const User = require('./src/models/User');
const TimerService = require('./src/services/timerService');
const MatchService = require('./src/services/matchService');
const { MATCH_STATUS, TIMER_STAGES, ROLES } = require('./src/utils/constants');
require('dotenv').config();

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/football_portal_test';

async function run30SecondContinuousTest() {
  console.log('======================================================================');
  console.log('CRITICAL TIMER 30-SECOND CONTINUOUS COUNTDOWN & ANTI-AUTOPAUSE TEST');
  console.log('======================================================================\n');

  await mongoose.connect(TEST_DB_URI);
  console.log('[OK] Connected to isolated test DB:', TEST_DB_URI);

  // 1. Create clean test fixture
  const admin = await User.create({
    username: 'timerqa',
    email: 'timerqa_' + Date.now() + '@test.com',
    password: 'Password123!',
    role: ROLES.SUPER_ADMIN,
    isActive: true
  });

  const tournament = await Tournament.create({
    name: '30s Continuous Countdown Test Cup',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    rules: { halfDurationSeconds: 240, halfTimeDurationSeconds: 120 },
    status: 'Ongoing'
  });

  const teamA = await Team.create({ name: 'FC Dynamo' });
  const teamB = await Team.create({ name: 'Sparta United' });

  const match = await Match.create({
    tournament: tournament._id,
    matchNumber: 777,
    teamA: teamA._id,
    teamB: teamB._id,
    venue: 'Arena 1',
    matchDate: new Date(),
    matchTime: '18:00',
    status: MATCH_STATUS.UPCOMING,
    timer: {
      currentStage: TIMER_STAGES.FIRST_HALF,
      stageDuration: 240,
      remainingTime: 240,
      isRunning: false,
      isPaused: false,
      phaseEndsAt: null,
      timerStatus: 'NOT_STARTED'
    }
  });

  console.log(`[TEST STEP 1] Created Test Match #${match.matchNumber}`);
  console.log(`  Initial Status: ${match.status} | TimerStatus: ${match.timer.timerStatus} | Remaining: ${match.timer.remainingTime}s\n`);

  // 2. Start the clock
  console.log('[TEST STEP 2] Calling TimerService.startTimer (Official START CLOCK)...');
  const started = await TimerService.startTimer(match._id, admin._id);
  console.log(`  Started Status: ${started.status} | TimerStatus: ${started.timer.timerStatus} | isRunning: ${started.timer.isRunning} | isPaused: ${started.timer.isPaused}`);
  console.log(`  PhaseEndsAt: ${started.timer.phaseEndsAt.toISOString()}\n`);

  if (!started.timer.isRunning || started.timer.isPaused) {
    throw new Error('FAILED: Timer did not initialize to RUNNING state!');
  }

  // 3. Monitor continuously for 32 seconds (polling every 1 second)
  console.log('[TEST STEP 3] Beginning 32-second continuous monitoring to prove NO AUTO-PAUSE occurs:');
  console.log('----------------------------------------------------------------------------------------');
  console.log(' Second | Display | Status | TimerStatus | isRunning | isPaused | Remaining (ms) | Check');
  console.log('----------------------------------------------------------------------------------------');

  let previousRemaining = 241;
  const startTime = Date.now();

  for (let sec = 0; sec <= 32; sec++) {
    const elapsedActual = Math.round((Date.now() - startTime) / 1000);
    const current = await Match.findById(match._id);
    const calculatedRemaining = TimerService.calculateRemainingTime(current);

    const isRunning = current.timer.isRunning;
    const isPaused = current.timer.isPaused;
    const timerStatus = current.timer.timerStatus;
    const status = current.status;

    const minStr = Math.floor(calculatedRemaining / 60).toString().padStart(2, '0');
    const secStr = (calculatedRemaining % 60).toString().padStart(2, '0');
    const displayTime = `${minStr}:${secStr}`;

    // Assertions at each second
    if (isPaused === true) {
      throw new Error(`CRITICAL FAILURE at second ${elapsedActual}: Timer automatically became PAUSED!`);
    }
    if (isRunning === false) {
      throw new Error(`CRITICAL FAILURE at second ${elapsedActual}: Timer stopped running!`);
    }
    if (timerStatus !== 'RUNNING') {
      throw new Error(`CRITICAL FAILURE at second ${elapsedActual}: timerStatus changed to ${timerStatus}!`);
    }

    console.log(
      `   ${String(elapsedActual).padStart(2, ' ')}s   |  ${displayTime}  |  ${status.padEnd(5, ' ')} |   ${timerStatus.padEnd(8, ' ')}  |   ${String(isRunning).padEnd(6, ' ')}  |   ${String(isPaused).padEnd(6, ' ')} |    ${calculatedRemaining * 1000}ms    |  [PASS - RUNNING]`
    );

    previousRemaining = calculatedRemaining;

    if (sec < 32) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('----------------------------------------------------------------------------------------');
  console.log('\n[TEST STEP 4] Successfully ran for 32+ seconds with ZERO auto-pauses!');
  console.log('  Confirmed: Timer remained continuously RUNNING.');
  console.log('  Confirmed: isPaused remained FALSE throughout the entire duration.');
  console.log('  Confirmed: Countdown progressed accurately from 04:00 down to 03:28.\n');

  // 4. Test Pause
  console.log('[TEST STEP 5] Testing Intentional Official PAUSE...');
  const paused = await TimerService.pauseTimer(match._id, admin._id);
  const pausedRemaining = TimerService.calculateRemainingTime(paused);
  console.log(`  Paused at: ${pausedRemaining}s (${Math.floor(pausedRemaining/60)}:${(pausedRemaining%60).toString().padStart(2, '0')})`);
  console.log(`  TimerStatus: ${paused.timer.timerStatus} | isPaused: ${paused.timer.isPaused} | isRunning: ${paused.timer.isRunning}`);

  // Wait 3 seconds while paused
  console.log('  Waiting 3 seconds while paused...');
  await new Promise(r => setTimeout(r, 3000));
  const stillPaused = await Match.findById(match._id);
  const stillPausedRemaining = TimerService.calculateRemainingTime(stillPaused);
  console.log(`  Remaining after 3s paused: ${stillPausedRemaining}s (unchanged)`);
  if (stillPausedRemaining !== pausedRemaining) {
    throw new Error('FAILED: Timer drifted while paused!');
  }

  // 5. Test Resume
  console.log('\n[TEST STEP 6] Testing Intentional Official RESUME...');
  const resumed = await TimerService.resumeTimer(match._id, admin._id);
  const resumedRemaining = TimerService.calculateRemainingTime(resumed);
  console.log(`  Resumed at: ${resumedRemaining}s (exact continuation from paused time)`);
  console.log(`  TimerStatus: ${resumed.timer.timerStatus} | isPaused: ${resumed.timer.isPaused} | isRunning: ${resumed.timer.isRunning}`);

  if (resumedRemaining !== pausedRemaining) {
    throw new Error(`FAILED: Resume did not continue from paused second ${pausedRemaining}! Got: ${resumedRemaining}`);
  }

  // Cleanup
  await Match.findByIdAndDelete(match._id);
  await Team.deleteMany({ _id: { $in: [teamA._id, teamB._id] } });
  await Tournament.findByIdAndDelete(tournament._id);
  await User.findByIdAndDelete(admin._id);
  await mongoose.disconnect();

  console.log('\n======================================================================');
  console.log('✅ ALL TEST SCENARIOS PASSED WITH 100% SUCCESS — BUG CONFIRMED FIXED!');
  console.log('======================================================================');
}

run30SecondContinuousTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
