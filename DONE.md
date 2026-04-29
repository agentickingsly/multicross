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
