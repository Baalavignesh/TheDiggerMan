# Technology Stack

## Core Technologies

- **Devvit**: Reddit's developer platform for building immersive apps
- **React 19**: Modern frontend framework with hooks and concurrent features
- **TypeScript 5.8**: Primary language with strict type checking
- **Vite**: Lightning-fast build tool for both client and server bundles
- **Express.js**: Serverless HTTP framework for API routes
- **Redis**: Data persistence layer (via Devvit's @devvit/web/server)
- **Tailwind CSS**: Utility-first styling via `@tailwindcss/vite` plugin

## Frontend Stack

- **React 19**: JSX components with hooks (useState, useEffect, useCallback, useMemo, useRef)
- **Vite**: Dev server with HMR and production optimization
- **Tailwind CSS**: Responsive utility classes for styling
- **CSS**: Custom styles in `styles.css` for game-specific UI
- **Audio API**: HTML5 Audio for music and sound effects (with pooling)
- **Canvas API**: For potential future sprite rendering (currently using CSS animations)

## Backend Stack

- **Express.js**: RESTful API routes
- **Devvit Context**: Access to `postId`, `userId`, `subredditName`
- **Redis**: Key-value store for game state and leaderboards
  - Sorted sets for leaderboards
  - JSON storage for game state
  - Hash maps for name reservations
- **Reddit API**: User authentication and post creation via `reddit.getCurrentUser()`

## Build System

- **Vite** handles compilation for both client and server
- **TypeScript** project references for modular compilation
- **ESLint** with TypeScript rules for code quality
- **Prettier** for consistent code formatting
- **Devvit CLI**: Deployment and playtest tools

## Common Commands

```bash
# Development (runs client, server, and devvit in parallel)
npm run dev

# Fast UI development (localhost:7474)
npm run dev:vite

# Build for production
npm run build

# Deploy to Reddit
npm run deploy

# Publish for review
npm run launch

# Code quality checks (type-check + lint + prettier)
npm run check

# Individual builds
npm run build:client
npm run build:server

# Individual development
npm run dev:client    # Watch client only
npm run dev:server    # Watch server only
npm run dev:devvit    # Devvit playtest only
```

## Development Workflow

- Use `npm run dev:vite` for rapid UI development on localhost:7474
- Use `npm run dev` for full-stack development with Reddit integration
- Client builds to `dist/client` with HTML entry point
- Server builds to `dist/server/index.cjs` as CommonJS module
- Devvit playtest provides live Reddit integration testing

## Dependencies

### Runtime
- `@devvit/web`: Devvit platform integration (server and client)
- `react` / `react-dom`: UI framework
- `express`: HTTP server
- `@tailwindcss/vite`: Tailwind CSS integration

### Development
- `typescript`: Type checking
- `vite`: Build tool
- `eslint`: Code linting
- `prettier`: Code formatting
- `@devvit/cli`: Devvit CLI tools

## Performance Optimizations

### Client-Side
- **Sound Pooling**: Pre-create 10 audio instances per sound type to avoid lag
- **Particle Limits**: Max 30 sparks, 40 falling ores to prevent slowdown
- **Mobile Detection**: Disable particles/sounds on touch devices
- **Memoization**: `useMemo` for expensive calculations (biomes, tools, background ores)
- **Stable Refs**: `useRef` for callbacks in intervals to prevent re-renders
- **Debouncing**: Prevent excessive state updates during rapid clicking

### Server-Side
- **Redis Optimization**: Batch leaderboard updates in single transaction
- **Efficient Queries**: Use Redis sorted sets for O(log N) leaderboard queries
- **JSON Caching**: Store entire game state as single JSON blob

## Asset Handling

- **Images**: Served from `src/client/public/` → `/` root path
  - Ores: Pixelated rendering (`image-rendering: pixelated`)
  - Auto-diggers: Smooth rendering (`image-rendering: auto`)
- **Audio**: MP3 files with Audio API and pooling
- **Fonts**: Custom TTF fonts (`MerchantCopy.ttf`)
- **Sprites**: CSS background-position animations for character

## Browser Compatibility

- Modern browsers with ES2020+ support
- Chrome, Firefox, Safari, Edge (latest versions)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Optimized for Reddit's webview environment
