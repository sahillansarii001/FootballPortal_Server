# Football Tournament Management Portal - API Documentation

Base URL: `http://localhost:5000/api`
WebSocket Endpoint: `ws://localhost:5000`

---

## 1. Authentication & Authorization

All authenticated endpoints require an `Authorization` header formatted as:
`Authorization: Bearer <JWT_TOKEN>`

### User Roles
- **Super Admin**: Complete administrative access.
- **Match Operator**: Match timer controls, goal recording, penalty shootouts, match events.
- **Public User**: Read-only access to tournaments, teams, players, schedules, scores, and standings.

---

### POST `/api/auth/register`
Register a new user.

#### Request Body
```json
{
  "username": "operator1",
  "email": "operator1@footballportal.com",
  "password": "SecurePassword123!",
  "fullName": "John Doe",
  "role": "Match Operator"
}
```
*Roles: `"Super Admin"` | `"Match Operator"` | `"Public User"` (default)*

#### Response (201 Created)
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "673c21a4f1a23b45c89d0001",
      "username": "operator1",
      "email": "operator1@footballportal.com",
      "role": "Match Operator",
      "fullName": "John Doe",
      "isActive": true,
      "createdAt": "2026-11-19T08:00:00.000Z",
      "updatedAt": "2026-11-19T08:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### POST `/api/auth/login`
Authenticate existing user and obtain a JWT token.

#### Request Body
```json
{
  "email": "admin@footballportal.com",
  "password": "AdminPassword123!"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "673c21a4f1a23b45c89d0000",
      "username": "superadmin",
      "email": "admin@footballportal.com",
      "role": "Super Admin",
      "fullName": "Chief Tournament Director"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### GET `/api/auth/me`
Retrieve currently authenticated user profile.
- **Headers**: `Authorization: Bearer <TOKEN>`

---

## 2. Tournament Management

### GET `/api/tournaments`
Retrieve list of all tournaments. (Public)

### POST `/api/tournaments`
Create a tournament with custom rules. (Super Admin only)

#### Request Body
```json
{
  "name": "Champions Trophy 2026",
  "description": "Elite 8 knockout and round-robin tournament",
  "startDate": "2026-12-01",
  "endDate": "2026-12-15",
  "participatingTeams": [
    "673c21a4f1a23b45c89d0020",
    "673c21a4f1a23b45c89d0021"
  ],
  "rules": {
    "halfDurationSeconds": 240,
    "transitionDurationSeconds": 20,
    "halfTimeDurationSeconds": 120,
    "initialPenaltyKicks": 5,
    "pointsForWin": 3,
    "pointsForLoss": 0
  }
}
```

---

## 3. Team Management

- `GET /api/teams` - Get all teams
- `GET /api/teams/:id` - Get team details
- `GET /api/teams/:id/players` - Get team roster
- `GET /api/teams/:id/stats` - Get comprehensive team statistics
- `POST /api/teams` - Create team (Super Admin)
- `PUT /api/teams/:id` - Update team (Super Admin)
- `DELETE /api/teams/:id` - Delete team (Super Admin)

---

## 4. Player Management

- `GET /api/players` - Get all players
- `GET /api/players/:id` - Get player details
- `GET /api/players/:id/stats` - Get player career & match statistics
- `GET /api/players/team/:teamId` - Get players belonging to a team
- `POST /api/players` - Create player and assign jersey number (Super Admin)
- `PUT /api/players/:id` - Update player (Super Admin)
- `DELETE /api/players/:id` - Delete player (Super Admin)

---

## 5. Match Scheduling

- `GET /api/matches` - Get all matches
- `GET /api/matches/upcoming` - Get scheduled upcoming matches
- `GET /api/matches/live` - Get live & ongoing matches
- `GET /api/matches/completed` - Get completed matches
- `GET /api/matches/team/:teamId` - Get matches for a team
- `GET /api/matches/:id` - Get match by ID
- `POST /api/matches` - Schedule match (Super Admin, includes collision check)
- `PUT /api/matches/:id` - Update match (Super Admin)
- `DELETE /api/matches/:id` - Delete match (Super Admin)

---

## 6. Unified Authoritative Match State & History (NEW)

### GET `/api/matches/:id/live`
Retrieve the entire authoritative match state in a single request for frontend rendering and reconnection synchronization.

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Authoritative live match state fetched successfully",
  "data": {
    "matchId": "673c21a4f1a23b45c89d0050",
    "matchNumber": 1,
    "tournament": "673c21a4f1a23b45c89d0010",
    "status": "Live",
    "venue": "National Arena",
    "matchDate": "2026-11-20T00:00:00.000Z",
    "matchTime": "15:00",
    "teamA": {
      "_id": "673c21a4f1a23b45c89d0020",
      "name": "Red Dragons FC",
      "logo": "https://..."
    },
    "teamB": {
      "_id": "673c21a4f1a23b45c89d0021",
      "name": "Blue Hawks United",
      "logo": "https://..."
    },
    "score": {
      "teamA": 1,
      "teamB": 0
    },
    "timer": {
      "currentStage": "First Half",
      "stageDuration": 240,
      "remainingTime": 182,
      "isRunning": true,
      "isPaused": false,
      "startedTimestamp": "2026-11-20T15:00:00.000Z",
      "pausedTimestamp": null,
      "totalPausedDuration": 0,
      "stageHistory": []
    },
    "currentStage": "First Half",
    "winner": null,
    "matchResult": "Scheduled",
    "isFinalized": false,
    "goals": [
      {
        "_id": "673c21a4f1a23b45c89d0090",
        "team": { "_id": "673c21a4f1a23b45c89d0020", "name": "Red Dragons FC" },
        "player": { "_id": "673c21a4f1a23b45c89d0030", "name": "Marcus Striker", "jerseyNumber": 9 },
        "matchTime": "02:45 (First Half)",
        "detail": { "goalType": "Normal Goal" },
        "timestamp": "2026-11-20T15:01:15.000Z"
      }
    ],
    "penalties": {
      "shootoutState": {
        "isShootout": false,
        "teamAPenaltyScore": 0,
        "teamBPenaltyScore": 0,
        "round": 1
      },
      "kicks": []
    },
    "events": [...]
  }
}
```

---

### GET `/api/matches/:id/timeline`
Retrieve the chronological human-readable match timeline with both match-clock times and real timestamps.

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Match chronological timeline fetched successfully",
  "data": [
    {
      "id": "673c21a4f1a23b45c89d0080",
      "clockTime": "04:00",
      "stage": "First Half",
      "type": "MATCH_STARTED",
      "title": "Match Started",
      "timestamp": "2026-11-20T15:00:00.000Z"
    },
    {
      "id": "673c21a4f1a23b45c89d0081",
      "clockTime": "02:45",
      "stage": "First Half",
      "type": "GOAL_SCORED",
      "title": "Goal scored by Marcus Striker",
      "team": { "id": "673c21a4f1a23b45c89d0020", "name": "Red Dragons FC" },
      "player": { "id": "673c21a4f1a23b45c89d0030", "name": "Marcus Striker", "jerseyNumber": 9 },
      "timestamp": "2026-11-20T15:01:15.000Z"
    },
    {
      "id": "673c21a4f1a23b45c89d0082",
      "clockTime": "00:00",
      "stage": "First Half",
      "type": "FIRST_HALF_ENDED",
      "title": "First Half Completed",
      "timestamp": "2026-11-20T15:04:00.000Z"
    },
    {
      "id": "673c21a4f1a23b45c89d0083",
      "clockTime": "00:20",
      "stage": "Transition Gap",
      "type": "TRANSITION_STARTED",
      "title": "20-second Transition Started",
      "timestamp": "2026-11-20T15:04:00.000Z"
    },
    {
      "id": "673c21a4f1a23b45c89d0084",
      "clockTime": "02:00",
      "stage": "Half-Time",
      "type": "HALFTIME_STARTED",
      "title": "Half-Time Started",
      "timestamp": "2026-11-20T15:04:20.000Z"
    },
    {
      "id": "673c21a4f1a23b45c89d0085",
      "clockTime": "04:00",
      "stage": "Second Half",
      "type": "SECOND_HALF_STARTED",
      "title": "Second Half Started",
      "timestamp": "2026-11-20T15:06:20.000Z"
    },
    {
      "id": "673c21a4f1a23b45c89d0086",
      "clockTime": "00:00",
      "stage": "Match Completed",
      "type": "MATCH_COMPLETED",
      "title": "Match Completed",
      "timestamp": "2026-11-20T15:10:20.000Z"
    }
  ]
}
```

---

### GET `/api/matches/:id/events`
Get full match events history, including audit records (`GOAL_REMOVED`, `TIMER_PAUSED`, etc.).

---

## 7. Live Match Timer System

### Match Sequence Timeline:
1. **First Half**: 240 seconds (4 min)
2. **Transition Gap**: 20 seconds (whistle & leaving field)
3. **Half-Time Break**: 2 minutes (120 seconds)
4. **Second Half**: 4 minutes (240 seconds)
5. **Match Completed / Shootout**: (Total timeline: 10m 20s)

### Endpoints:
- `GET /api/matches/:id/timer` (Public) - Get current remaining time and state
- `POST /api/matches/:id/timer/start` (Operator / Admin) - Start match timer
- `POST /api/matches/:id/timer/pause` (Operator / Admin) - Pause timer and preserve remaining time
- `POST /api/matches/:id/timer/resume` (Operator / Admin) - Resume from preserved remaining time
- `POST /api/matches/:id/timer/advance` (Operator / Admin) - Advance stage manually
- `POST /api/matches/:id/timer/reset` (Super Admin only) - Reset timer to First Half

---

## 8. Goal Management

- `POST /api/matches/:id/goals` - Record goal (Normal, Penalty, or Own Goal)
- `POST /api/matches/:id/goals/undo` - Undo goal (reverts scores and player stats, records audit event)
- `PUT /api/matches/:id/goals/:eventId` - Edit goal details
- `GET /api/matches/:id/goals` - Get active match goals
- `GET /api/players/:playerId/goals` - Get player goals

---

## 9. Penalty Shootout System

Supports 5 regulation kicks, mathematical early elimination detection, and sudden death.

- `POST /api/matches/:id/penalties` - Record kick (`Goal`, `Saved`, `Missed`)
- `GET /api/matches/:id/penalties` - Get shootout history and state

---

## 10. Tournament Standings & Leaderboards

- `GET /api/standings/:tournamentId` - Full point table for a tournament
- `GET /api/standings/:tournamentId/teams/:teamId` - Specific team ranking
- `GET /api/leaderboard` - Overall team ranking across all matches
- `GET /api/leaderboard/top-scorers?limit=10` - Top goal scorers
- `GET /api/leaderboard/top-penalty-scorers?limit=10` - Top penalty scorers
- `GET /api/leaderboard/top-goalkeepers?limit=10` - Top goalkeepers by penalties saved

---

## 11. Socket.IO Real-Time Events Reference

Connect client to: `ws://localhost:5000` (or `http://localhost:5000`)

### Client-to-Server Events:
- `socket.emit('join:match', matchId)`: Subscribes to match room (`match:${matchId}`). **Automatically responds with `match:sync` and `sync:state` with the latest database state.**
- `socket.emit('sync:match', matchId, (ack) => ...)`: Explicit request to resynchronize state after connectivity loss.
- `socket.emit('leave:match', matchId)`: Unsubscribe from match room.
- `socket.emit('join:tournament', tournamentId)`: Subscribe to tournament standings room.

### Server-to-Client Broadcast Events:
| Event Name | Room | Payload Description |
|------------|------|---------------------|
| `match:sync` / `sync:state` | Dedicated Client | Complete authoritative match state upon joining/reconnecting |
| `match:started` | `match:${id}` | Emitted when match first kicks off |
| `timer:started` | `match:${id}` | Timer started event |
| `timer:paused` | `match:${id}` | Timer paused event with preserved remaining time |
| `timer:resumed` | `match:${id}` | Timer resumed event |
| `timer:reset` | `match:${id}` | Timer reset to First Half |
| `timer:update` / `timer:updated` | `match:${id}` | Remaining time tick broadcast every second |
| `stage:first_half_completed` | `match:${id}` | First half ended milestone |
| `stage:transition_started` | `match:${id}` | 20-second transition gap milestone |
| `stage:half_time_started` | `match:${id}` | 2-minute half-time break milestone |
| `stage:second_half_started` | `match:${id}` | Second half kickoff milestone |
| `stage:change` | `match:${id}` | General stage change event |
| `score:update` / `score:updated` | `match:${id}` | Live score update (`teamAScore`, `teamBScore`) |
| `goal:scored` / `goal:recorded` | `match:${id}` | Full goal scored event with player, team, type |
| `goal:removed` / `goal:undone` | `match:${id}` | Goal removed / VAR correction event |
| `penalty:taken` | `match:${id}` | Penalty kick scored |
| `penalty:saved` | `match:${id}` | Penalty kick saved by goalkeeper |
| `penalty:missed` | `match:${id}` | Penalty kick missed off-target |
| `penalty:update` | `match:${id}` | Penalty round, outcome, and shootout scores |
| `penalty:completed` | `match:${id}` | Shootout concluded and winner declared |
| `match:completed` | `match:${id}` | Match conclusion and final score |
| `match:result_declared` | `match:${id}` | Match result announced |
| `standings:update` / `leaderboard:update` | `tournament:${id}` | Real-time standings update after finalized match |
