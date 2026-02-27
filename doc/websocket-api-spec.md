# Greedy Market — WebSocket API Specification

**Version:** 1.0  
**Date:** 2026-02-24  
**Game:** Greedy Market (`regisation: 3`)  
**Base URL:** `wss://funint.site/ws/game`

---

## Overview

This document defines the WebSocket events required for real-time multiplayer gameplay. The server controls game timing and winner selection; clients display the UI and send bets.

### Connection

```
wss://funint.site/ws/game?player_id=2610&regisation=3
```

On connect, the server should send the current game state (current session, time remaining, mode).

---

## 1. Game Session Events (CRITICAL)

### 1.1 `session:state` — Current Game State (Server → Client)

Sent immediately on connection and at the start of each new round.

```json
{
  "event": "session:state",
  "data": {
    "session_id": "abc-123",
    "phase": "BETTING",
    "mode": 2,
    "remaining_seconds": 15,
    "round_type": "NORMAL",
    "jackpot_amount": 145668,
    "players_count": 24
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique round identifier |
| `phase` | string | `"BETTING"` or `"DRAWING"` or `"RESULT"` |
| `mode` | int | `1` = advance, `2` = general |
| `remaining_seconds` | int | Seconds left in current phase |
| `round_type` | string | `"NORMAL"` or `"JACKPOT"` |
| `jackpot_amount` | int | Current jackpot prize pool |
| `players_count` | int | Players in this round |

---

### 1.2 `session:betting_start` — New Round Begins (Server → Client)

```json
{
  "event": "session:betting_start",
  "data": {
    "session_id": "abc-124",
    "duration_seconds": 20,
    "mode": 2,
    "round_type": "NORMAL"
  }
}
```

**Client action:** Reset bets, show betting UI, start countdown timer.

---

### 1.3 `session:betting_end` — Betting Closed (Server → Client)

```json
{
  "event": "session:betting_end",
  "data": {
    "session_id": "abc-124",
    "total_bets": 156000,
    "players_count": 24
  }
}
```

**Client action:** Lock betting UI, start drawing animation.

---

### 1.4 `session:result` — Winner Announced (Server → Client)

```json
{
  "event": "session:result",
  "data": {
    "session_id": "abc-124",
    "winner_element": 22,
    "winner_name": "tomato",
    "multiplier": 4,
    "drawing_duration_seconds": 8
  }
}
```

For **jackpot rounds:**
```json
{
  "event": "session:result",
  "data": {
    "session_id": "abc-124",
    "round_type": "JACKPOT",
    "winner_elements": [22, 21, 20, 19],
    "winner_names": ["tomato", "lemon", "pumpkin", "zucchini"],
    "jackpot_prize": 145668,
    "drawing_duration_seconds": 8
  }
}
```

**Client action:** Run spinning animation landing on winner, calculate win/loss, show result.

---

## 2. Betting Events (CRITICAL)

### 2.1 `bet:place` — Player Places Bet (Client → Server)

```json
{
  "event": "bet:place",
  "data": {
    "player_id": 2610,
    "session_id": "abc-124",
    "element": 22,
    "amount": 100,
    "mode": 2
  }
}
```

---

### 2.2 `bet:confirmed` — Bet Accepted (Server → Client)

```json
{
  "event": "bet:confirmed",
  "data": {
    "bet_id": "bet-789",
    "element": 22,
    "amount": 100,
    "new_balance": 129354
  }
}
```

---

### 2.3 `bet:rejected` — Bet Rejected (Server → Client)

```json
{
  "event": "bet:rejected",
  "data": {
    "element": 22,
    "amount": 100,
    "reason": "insufficient_balance"
  }
}
```

Possible reasons: `insufficient_balance`, `betting_closed`, `max_bets_reached`, `invalid_element`

---

## 3. Balance & Winnings (CRITICAL)

### 3.1 `balance:update` — Balance Changed (Server → Client)

Sent after each round settles.

```json
{
  "event": "balance:update",
  "data": {
    "player_id": 2610,
    "balance": 130454,
    "win_amount": 1000,
    "total_bet": 300,
    "result": "WIN"
  }
}
```

| `result` | Description |
|----------|-------------|
| `"WIN"` | Player bet on the winning element |
| `"LOSE"` | Player bet but didn't win |
| `"NOBET"` | Player didn't bet this round |

---

## 4. Live Updates (IMPORTANT)

### 4.1 `jackpot:update` — Jackpot Amount Changed (Server → Client)

```json
{
  "event": "jackpot:update",
  "data": {
    "amount": 146000
  }
}
```

---

### 4.2 `rank:update` — Leaderboard Updated (Server → Client)

```json
{
  "event": "rank:update",
  "data": {
    "today": [
      {
        "player_name": "Player_1065465",
        "player_pic": "players/img/avatar.png",
        "balance": 135330
      }
    ]
  }
}
```

---

### 4.3 `players:activity` — Live Player Count (Server → Client)

```json
{
  "event": "players:activity",
  "data": {
    "online": 42,
    "betting": 24
  }
}
```

---

## 5. Timer Sync (NICE TO HAVE)

### 5.1 `timer:sync` — Periodic Sync (Server → Client)

Sent every 5 seconds to prevent client timer drift.

```json
{
  "event": "timer:sync",
  "data": {
    "phase": "BETTING",
    "remaining_seconds": 12
  }
}
```

---

## Game Flow Diagram

```
Server                              Client
  │                                    │
  │──── session:betting_start ────────>│  Start 20s timer
  │                                    │
  │<──── bet:place ────────────────────│  Player taps item
  │──── bet:confirmed ────────────────>│  Update balance
  │<──── bet:place ────────────────────│  Player taps another
  │──── bet:confirmed ────────────────>│
  │                                    │
  │──── session:betting_end ──────────>│  Lock UI
  │──── session:result ───────────────>│  Spin animation → show winner
  │                                    │
  │──── balance:update ───────────────>│  Show win/loss, update balance
  │                                    │
  │──── session:betting_start ────────>│  Next round
  │                                    │
```

---

## Element ID Mapping

| Element ID | Name | Group |
|-----------|------|-------|
| 19 | zucchini | Vegetables |
| 20 | pumpkin | Vegetables |
| 21 | lemon | Vegetables |
| 22 | tomato | Vegetables |
| 23 | water | Drinks |
| 24 | cola | Drinks |
| 25 | milk | Drinks |
| 26 | honey | Drinks |

---

## Existing REST APIs (Keep As-Is)

These REST endpoints should continue working for initial page load (game config, assets, rules). Only the **game flow** (betting, timing, results) moves to WebSocket.

| Endpoint | Purpose |
|----------|---------|
| `/game/game/elements` | Element list + multipliers |
| `/game/sorce/buttons` | Chip denominations |
| `/game/magic/boxs` | Chest boxes config |
| `/game/game/rule` | Game rules text |
| `/game/game/prize/distribution` | Prize table |
| `/game/game/trophy` | Trophy image URL |
| `/game/game/coin` | Coin icon URL |
| `/game/game/icon/` | Game metadata |
| `/game/icon/during/gaming` | Game logo |
| `/game/maximum/fruits/per/turn` | Max bets per round |
| `/game/jackpot/details` | Jackpot breakdown |

---

## Priority Order for Development

1. **Phase 1 (Minimum Viable):** `session:betting_start` + `session:betting_end` + `session:result` + `bet:place` + `bet:confirmed` + `balance:update`
2. **Phase 2 (Multiplayer Feel):** `jackpot:update` + `rank:update` + `players:activity`
3. **Phase 3 (Polish):** `timer:sync` + `session:state` (reconnection)
