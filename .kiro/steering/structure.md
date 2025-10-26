# Project Structure

## Root Configuration

- `devvit.json`: Devvit app configuration with post/server entry points, splash screen config
- `package.json`: Dependencies and build scripts for client/server
- `tsconfig.json`: TypeScript project references (build-only)
- `eslint.config.js`: ESLint configuration with environment-specific rules
- `CLAUDE.md`: Instructions for Claude Code when working with this repo
- `README.md`: Project documentation with game description and tech stack

## Source Organization

### `/src/client/`

React 19 webview application - the game UI and logic

**Main Files:**
- `App.tsx`: Main game component with all state management and game loop logic
- `gameData.ts`: Game configuration (ores, biomes, tools, auto-diggers)
- `achievements.ts`: Achievement definitions and unlock logic
- `apiClient.ts`: API wrapper for server communication
- `Character.tsx`: Animated character sprite component
- `Modal.tsx`: Reusable modal component for shops/info/leaderboards
- `AchievementsModal.tsx`: Achievement display and progress tracking
- `AchievementToast.tsx`: Toast notifications for unlocked achievements
- `main.tsx`: React entry point
- `index.html`: HTML template with game container
- `styles.css`: All game styles (cover screen, game UI, modals, responsive)

**Assets (`public/`):**
- `ores/`: Ore images (Gold1.png, Ruby2.png, etc.) - 6 variants per ore type
- `smash-tools/`: Pickaxe, hammer, axe sprite sheets
- `auto-diggers/`: Auto-digger images (Helper Mole.png, etc.)
- `sounds/`: Audio files (music.mp3, mining.mp3, clicksound.mp3)
- `dirtwall.webp`: Background texture

**Build Config:**
- `vite.config.ts`: Vite config with React and Tailwind plugins
- `tsconfig.json`: Client-specific TypeScript config

### `/src/server/`

Express.js serverless backend - API endpoints and Redis operations

**Main Files:**
- `index.ts`: Express server with all API routes
  - `GET /api/init`: Initialize game, load state, fetch Reddit username, get leaderboards
  - `POST /api/save`: Save game state and update leaderboards
  - `POST /api/reset`: Delete player's game state
  - `POST /api/register`: (Legacy - no longer used, username auto-fetched)
  - `POST /internal/on-app-install`: Auto-create post on app install
  - `POST /internal/menu/post-create`: Manual post creation via mod menu
- `core/post.ts`: Post creation with splash screen configuration

**Build Config:**
- `vite.config.ts`: Server build config (library mode, CommonJS output)
- `tsconfig.json`: Server-specific TypeScript config

### `/src/shared/`

Shared types between client and server

- `types/api.ts`: API response type definitions (legacy, mostly unused)
- `tsconfig.json`: Shared code TypeScript config

### `/assets/`

App-level assets for Devvit (not served to client)

- `appicon.png`: App icon for Reddit
- `splash.png`: Splash screen background
- `loading.gif`: Loading animation

## Build Output

- `dist/client/`: Built client assets (HTML, JS, CSS, images, sounds)
- `dist/server/index.cjs`: Built server bundle (CommonJS for Devvit)

## Architecture Patterns

- **Monorepo**: Multiple TypeScript projects with project references
- **Client-Server Split**: Clear separation with API-based communication
- **State Management**: React hooks (useState, useEffect, useCallback, useMemo)
- **RESTful API**: Express routes for game state and leaderboards
- **Redis Storage**: Per-post scoped game data
  - `gameState:{postId}:{userId}` - Player progress
  - `leaderboard:{postId}:money` - Money leaderboard (sorted set)
  - `leaderboard:{postId}:depth` - Depth leaderboard (sorted set)
  - `leaderboard:{postId}:name` - Name reservations (hash)
- **Devvit Integration**: Server uses Reddit API and Redis via `@devvit/web/server`

## Game State Architecture

### Client State (`App.tsx`)
```typescript
interface AppState {
  money: number;
  depth: number;
  currentTool: string;
  autoDiggers: { [diggerId: string]: number };
  oreInventory: { [oreId: string]: number };
  discoveredOres: Set<string>;
  discoveredBiomes: Set<number>;
  totalClicks: number;
  unlockedAchievements: Set<string>;
  playerName: string; // Reddit username
}
```

### Performance Optimizations
- Sound pooling (10 sounds per type)
- Particle limits (30 active sparks, 40 falling ores)
- Mobile detection (disables particles/sounds on touch devices)
- Memoization for expensive calculations (biomes, tools, background ores)
- Stable interval refs to prevent unnecessary re-renders

## Development Workflow

1. **Local Development**: `npm run dev:vite` - Fast UI iteration on localhost:7474
2. **Full Development**: `npm run dev` - Client + Server + Devvit playtest
3. **Build**: `npm run build` - Production build for deployment
4. **Deploy**: `npm run deploy` - Upload to Reddit
