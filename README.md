# Football Tournament Management Portal - Backend Server

A production-ready, enterprise-grade backend for managing football tournaments, live match timers, real-time scoreboards, goal recording, penalty shootouts, individual player statistics, and automated tournament standings.

Built with **Node.js**, **Express.js**, **MongoDB**, **Mongoose**, and **Socket.IO**.

---

## Features

- **Robust Role-Based Authentication (RBAC)**:
  - **Super Admin**: Full CRUD on tournaments, teams, players, schedules, and live matches.
  - **Match Operator**: Start/pause/resume match timers, record goals, manage penalty shootouts.
  - **Public User**: Read-only real-time views of live matches, scores, timers, and standings.
  - BCrypt password hashing, JWT stateless tokens, and active account verification.
- **Backend-Authoritative Live Match Timer Engine**:
  - Independent of `setInterval` drift; calculates precise remaining time using timestamps.
  - Automatically preserves paused durations and survives server restarts.
  - **Server Restart Recovery (`TimerService.recoverActiveTimers`)**: automatically cascades through any stages that expired during downtime.
  - Strict sequence:
    1. **First Half**: 4 minutes (240 seconds)
    2. **First Half Transition**: 20 seconds (whistle & player exit)
    3. **Half-Time Break**: 2 minutes (120 seconds)
    4. **Second Half**: 4 minutes (240 seconds)
    5. **Match Completed / Penalty Shootout**: (Total timeline: 10m 20s)
  - Automatic stage transitions and background Socket.IO ticks every 1 second.
- **Centralized Match Event History & Audit Trail**:
  - Permanent audit logging: events are never permanently destroyed on corrections (`isUndone: true`, `correctionEventId`).
  - Standardized event types: `MATCH_STARTED`, `TIMER_STARTED`, `TIMER_PAUSED`, `TIMER_RESUMED`, `FIRST_HALF_ENDED`, `TRANSITION_STARTED`, `HALFTIME_STARTED`, `SECOND_HALF_STARTED`, `GOAL_SCORED`, `GOAL_REMOVED`, `PENALTY_TAKEN`, `PENALTY_SAVED`, `PENALTY_MISSED`, `MATCH_COMPLETED`.
  - Chronological timeline API (`GET /api/matches/:id/timeline`) and unified live state API (`GET /api/matches/:id/live`).
- **Intelligent Goal Management**:
  - Normal Goals, Penalty Goals, and Own Goals (automatically credited to the opposing team).
  - Increments player goal statistics and match event logs.
  - Instant Goal Undo and Edit functionality with automatic score and player statistic recalculation.
- **Complete Penalty Shootout System**:
  - Configurable initial kicks (default: 5 kicks per team).
  - Mathematical early elimination detection (cannot be caught).
  - Automatic Sudden Death if scores remain tied after initial rounds.
  - Real-time goalkeeper saves and penalty taker tracking.
- **Automated Tournament Standings & Point Table**:
  - Win = 3 points, Loss = 0 points.
  - Regular-time goals kept strictly separate from shootout scores.
  - Ties decided by penalty shootout (every finalized match has a winner).
  - Automatic Goal Difference (GD = GF - GA) and sorting: Points > GD > GF > Team Name.
  - Idempotent calculation engine preventing duplicate points or statistics.
- **Schedule Collision Prevention**:
  - Prevents any team from being scheduled in two matches at the same date and time.
- **Real-Time WebSockets via Socket.IO with State Synchronization**:
  - Dedicated rooms per match (`match:${id}`) and tournament (`tournament:${id}`).
  - Immediate state synchronization (`match:sync` / `sync:state`) on client join or network reconnection.
  - Live events for scoreboards, timer ticks, stage milestones, goals, penalties, and standings.

---

## Directory Structure

```
Server/
├── src/
│   ├── config/
│   │   ├── database.js          # MongoDB connection with automatic Atlas/Local fallback
│   │   └── env.js               # Environment variables configuration
│   ├── models/
│   │   ├── User.js               # User accounts & RBAC
│   │   ├── Tournament.js         # Tournament configurations & rules
│   │   ├── Team.js               # Teams & performance metrics
│   │   ├── Player.js             # Player stats (goals, saves, penalties)
│   │   ├── Match.js              # Match schedule, scores & timer state
│   │   ├── MatchEvent.js         # Complete event history timeline
│   │   ├── PenaltyShootout.js    # Round-by-round penalty records
│   │   └── TournamentStanding.js # Automated leaderboard point table
│   ├── controllers/             # Express controllers
│   ├── routes/                  # Express REST routes
│   ├── services/                # Core business logic & engines
│   │   ├── authService.js
│   │   ├── tournamentService.js
│   │   ├── teamService.js
│   │   ├── playerService.js
│   │   ├── matchService.js       # Live state & timeline builders
│   │   ├── timerService.js       # Live match timer calculation & recovery engine
│   │   ├── goalService.js        # Goal recording & undo logic
│   │   ├── penaltyService.js     # Shootout & sudden death engine
│   │   ├── standingsService.js   # Automated point table recalculation
│   │   └── summaryService.js     # Post-match summary generator
│   ├── middleware/              # Auth, role authorization, validation, error handling
│   ├── sockets/                 # Socket.IO connection & room broadcasters
│   ├── utils/                   # Constants, API responses, seed script, transaction helper, logger
│   ├── validators/              # Zod input validation schemas
│   └── app.js                   # Express application setup
├── tests/                       # Jest & Supertest test suites
├── server.js                    # HTTP & Socket.IO server entry point
├── .env                         # Environment configuration
├── .env.example                 # Template for environment variables
├── package.json
└── API_DOCUMENTATION.md         # Comprehensive REST & Socket API reference
```

---

## Getting Started

### Prerequisites
- Node.js (v18+ recommended, v22 tested)
- MongoDB (Local instance or MongoDB Atlas cluster)

### Installation
1. Open terminal in the `Server` folder:
   ```bash
   cd Server
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb+srv://<USER>:<PASS>@<CLUSTER>.mongodb.net/football_portal?retryWrites=true&w=majority
   JWT_SECRET=super_secret_football_jwt_key_2026_production_grade_token
   JWT_EXPIRES_IN=7d
   CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:4173
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX=1000
   TIMER_TICK_INTERVAL_MS=1000
   ```

3. Seed Initial Database Data:
   ```bash
   npm run seed
   ```
   This creates:
   - **Super Admin**: `admin@footballportal.com` / `AdminPassword123!`
   - **Match Operator**: `operator@footballportal.com` / `OperatorPassword123!`
   - **Public User**: `fan@footballportal.com` / `UserPassword123!`
   - 4 Teams with full 11-player rosters
   - "Premier Football Championship 2026" with scheduled matches

4. Start Server:
   ```bash
   npm start
   ```
   Server will listen on `http://localhost:5000`.

---

## Running Automated Tests

Run the full Jest test suite with Supertest:
```bash
npm test
```

### Test Coverage (43 Tests across 7 Suites):
- **Advanced Real-Time & Recovery**: Unified live match state (`/api/matches/:id/live`), chronological timeline (`/api/matches/:id/timeline`), non-destructive audit event history, server restart recovery, automatic stage cascading, socket state sync (`match:sync`), idempotency.
- **Authentication**: Registration, login, password hashing, JWT verification, RBAC permissions.
- **Tournaments, Teams & Players**: Creation, duplicate constraints, jersey uniqueness per team, roster linking.
- **Match Scheduling**: Conflict detection (preventing simultaneous matches for same team), team validation.
- **Timer Engine**: Start, pause, resume, reset, stage progression (First Half -> Gap -> Half Time -> Second Half).
- **Goal Management**: Normal goals, own goals credited to opposing team, undo goal with stat reversal.
- **Penalty Shootout**: Regulation kicks, mathematical early elimination, sudden death, goalkeeper save tracking.
- **Standings Calculation**: Win/loss points, goal difference calculation, double-counting prevention.
- **Socket.IO**: Real-time room joining and broadcast verification.

---

## Frontend Integration (React)

### Single-Endpoint Match Initialization:
```javascript
// Fetch complete match state in one call
const res = await fetch(`http://localhost:5000/api/matches/${matchId}/live`);
const { data: matchState } = await res.json();
console.log("Current Score:", matchState.score);
console.log("Remaining Time:", matchState.timer.remainingTime);
```

### Connecting to Socket.IO with State Sync:
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: {
    token: localStorage.getItem("token") // Optional for guests
  }
});

// Join match room (backend automatically returns authoritative latest state)
socket.emit("join:match", matchId);

socket.on("match:sync", (state) => {
  // Sync full score, timer, stage, and events after initial load or reconnection
  setMatchState(state);
});

// Real-time timer ticks
socket.on("timer:update", (timerData) => {
  setRemainingTime(timerData.remainingTime);
  setCurrentStage(timerData.currentStage);
});

// Real-time score updates
socket.on("score:update", (scoreData) => {
  setScore({ teamA: scoreData.teamAScore, teamB: scoreData.teamBScore });
});
```

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for full REST endpoints and payload specifications.
