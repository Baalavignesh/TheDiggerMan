---
inclusion: always
---

**TheDiggerMan** is an incremental clicker game for Reddit. The project has three main code areas:

- [/src/client](mdc:src/client): React 19 webview with game UI and logic. Fetch data via `fetch('/api/endpoint')` to access server APIs.
- [/src/server](mdc:src/server): Express.js serverless backend. Access Redis and Reddit API here.
- [/src/shared](mdc:src/shared): Shared TypeScript types between client and server.

## Key Rules

- Assume all tooling (TypeScript, Vite, Tailwind, ESLint, Prettier) is configured correctly. If there's a bug, check your code first.
- **Prefer type aliases over interfaces** when writing TypeScript
  - Good: `type GameState = { ... }`
  - Bad: `interface GameState { ... }`

## Game Architecture

### Client (`src/client/App.tsx`)
- All game state lives in React hooks (useState)
- Game loop uses useEffect with intervals
- API calls to server for save/load/leaderboards
- Auto-saves every 30 seconds via stable interval ref

### Server (`src/server/index.ts`)
- Express routes handle game state persistence
- Uses Reddit API: `await reddit.getCurrentUser()` for username
- Redis for storage: `await redis.set(key, value)`
- All data scoped per-post (`gameState:{postId}:{userId}`)

## Important Patterns

### Client-Server Communication
Client makes relative fetch calls:
```typescript
const response = await fetch('/api/save', {
  method: 'POST',
  body: JSON.stringify({ gameState }),
  headers: { 'Content-Type': 'application/json' }
});
```

Server handles with Express:
```typescript
router.post('/api/save', async (req, res) => {
  const { postId, userId } = context;
  const { gameState } = req.body;
  await redis.set(`gameState:${postId}:${userId}`, JSON.stringify(gameState));
  res.json({ success: true });
});
```

### State Management
- Use `useState` for game state
- Use `useRef` for values in intervals/callbacks to prevent re-renders
- Use `useMemo` for expensive calculations (biomes, tools)
- Use `useCallback` for stable function references

### Performance
- Sound pooling (10 instances per sound)
- Particle limits (30 sparks, 40 falling ores)
- Mobile detection to disable heavy features
- Stable refs for interval callbacks

## Asset Paths
Files in `src/client/public/` are served from root:
- Use `/ores/Gold1.png` not `/public/ores/Gold1.png`
- Use `/sounds/music.mp3` not `/public/sounds/music.mp3`

## Common Pitfalls
- ❌ Don't put `depth` in auto-mining effect dependencies (causes interval churn)
- ❌ Don't use WebSockets (not supported in Devvit)
- ❌ Don't use Node.js fs/http modules in server (serverless environment)
- ✅ Use `fetch` instead of http/https modules
- ✅ Use stable refs for callbacks in intervals
- ✅ Scope all Redis keys to postId
