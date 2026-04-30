# Session: Profile Privacy & Friend Invite Codes

## Files Created
- `server/src/db/migrations/009_profile_privacy_and_invite_codes.sql` — adds `is_searchable` boolean and `invite_code varchar(12)` to users; backfills existing users; unique constraint + index
- `server/src/routes/users.ts` — GET /api/users/me, PATCH /api/users/me/privacy

## Files Modified
- `server/src/routes/auth.ts` — generates friend invite code on register; returns `inviteCode` + `isSearchable` in both register and login responses
- `server/src/routes/friends.ts` — updated GET /search to exclude non-searchable users (unless already friends); added POST /request-by-code before /:id routes
- `server/src/index.ts` — imports and mounts usersRouter at /api/users
- `server/src/__tests__/friends.test.ts` — added 3 new describe blocks: POST /request-by-code (7 tests), PATCH /api/users/me/privacy (5 tests), GET /friends/search privacy exclusion (2 tests)
- `shared/src/types.ts` — added `inviteCode?` + `isSearchable?` to User; added GetMeResponse, UpdatePrivacyRequest, UpdatePrivacyResponse, FriendRequestByCodeRequest
- `shared/dist/types.js` + `shared/dist/types.d.ts` — rebuilt after types change
- `client/src/api/client.ts` — added getMe(), updatePrivacy(), sendFriendRequestByCode()
- `client/src/pages/LobbyPage.tsx` — Friends panel: invite code display with Copy button; Discoverable/Hidden privacy toggle; "By name"/"By code" tabs; code input with success message
- `docs/contracts.md` — documented 3 new endpoints; updated users table schema summary; updated GET /friends/search description

## Test results
185 tests passing (10 test files). No regressions.

---

# Session: Friends list and game invite system

## Files created

### Server
- `server/src/db/migrations/008_friends_and_invites.sql` — creates `friendships` (enum, table, indexes) and `game_invites` (enum, table, index)
- `server/src/routes/friends.ts` — GET /friends, GET /friends/requests, GET /friends/search, POST /friends/request, POST /friends/:id/accept, POST /friends/:id/decline, DELETE /friends/:id
- `server/src/routes/invites.ts` — GET /invites, POST /invites/:id/accept, POST /invites/:id/decline
- `server/src/ws/ioInstance.ts` — singleton io holder; `setIo(io)` called from WS handler init; `emitToUser(userId, event, payload)` used by routes to emit to user's personal Socket.io room
- `server/src/__tests__/friends.test.ts` — 34 integration tests covering request/accept/decline/remove, friend list, game invite happy path, non-friend rejection, 401s, 409s, 404s

### Docs
- `docs/redis.md` — documented `user:{userId}:connections` (presence counter) and `channel:user:{userId}` (per-user pub/sub)

## Files modified

### Server
- `server/src/db/redis.ts` — added `incrementUserConnections`, `decrementUserConnections`, `getOnlineStatuses` for online presence
- `server/src/routes/games.ts` — added `POST /:id/invite` endpoint; imports `emitToUser`
- `server/src/ws/handlers.ts` — calls `setIo(io)` on startup; each socket joins `user:{userId}` personal room; increments/decrements connection counter; `subscribeToUserChannel` per user; pub/sub relay split into game vs user channels (`ALLOWED_GAME_EVENTS` / `ALLOWED_USER_EVENTS`)
- `server/src/index.ts` — registers `friendsRouter` at `/api/friends` and `invitesRouter` at `/api/invites`

### Shared
- `shared/src/types.ts` — added `Friendship`, `GameInvite` domain models; `FriendRequestPayload`, `GameInvitePayload` WS types; extended `ServerToClientEvents` with `friend_request` and `game_invite`
- `shared/dist/types.js`, `shared/dist/types.d.ts` — rebuilt after types.ts changes

### Client
- `client/src/api/client.ts` — added `getFriends`, `getFriendRequests`, `searchUsers`, `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `removeFriend`, `inviteToGame`, `getInvites`, `acceptInvite`, `declineInvite` plus `Friend`, `FriendRequest`, `GameInviteItem`, `UserSearchResult` types
- `client/src/pages/LobbyPage.tsx` — added Friends panel (search/add, pending requests with accept/decline, friends list with invite/remove), game invites banner, WS listeners for `friend_request` and `game_invite` real-time events, Friends button in header with badge count

### Docs
- `docs/contracts.md` — added all new REST endpoints and WS events

## Dependencies added
None.

## Test results
171 tests pass (10 test files), including 34 new tests in friends.test.ts.

---

# Session: In-game invite modal + duplicate invite fix

## Files modified

### Client
- `client/src/pages/GamePage.tsx` — added "Invite friends" button (creator-only, waiting status only, non-spectator) in header; invite modal with friends list, online status dots, greyed-out in-game players, "Invited!" state for sent/pending invites; imports `getFriends`, `inviteToGame`, `Friend` from api/client

### Server (duplicate invite bug fix, prior session)
- `server/src/routes/friends.ts` — removed `emitToUser` direct emit; pub/sub is sole delivery path
- `server/src/routes/games.ts` — removed `emitToUser` import and call from invite handler
- `server/src/ws/ioInstance.ts` — removed `emitToUser` export (now only exports `setIo`)

## Dependencies added
None.
