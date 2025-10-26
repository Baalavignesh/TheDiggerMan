<div align="center">
  <img src="assets/appicon.png" alt="TheDiggerMan Icon" width="150" height="150">

  # TheDiggerMan

  **An immersive incremental digging game built for Reddit**

  [![Built with Devvit](https://img.shields.io/badge/Built%20with-Devvit-FF4500?style=flat-square&logo=reddit)](https://developers.reddit.com/)
  [![Built with Kiro IDE](https://img.shields.io/badge/Built%20with-Kiro%20IDE-00D9FF?style=flat-square)](https://kiro.ai/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-19.1-61DAFB?style=flat-square&logo=react)](https://react.dev/)
</div>

---

## 🎮 About the Game

**TheDiggerMan** is an addictive incremental clicker game where you dig deep into the earth, discover valuable ores, and build your mining empire. Descend through multiple biomes, each with unique resources and challenges. Compete on global leaderboards as you upgrade your tools and deploy automated diggers to maximize your earnings!

### Key Features

- **Multiple Biomes**: Explore diverse underground environments from Surface dirt to the Deep Void
- **Rare Ores**: Discover and collect ores of varying rarity - from common Stone to legendary Mythril
- **Tool Upgrades**: Progress through increasingly powerful pickaxes that boost your earnings
- **Auto-Diggers**: Deploy automated mining bots that work even when you're away
- **Achievements**: Unlock 30+ achievements as you master the game
- **Leaderboards**: Compete globally for the deepest dig and highest earnings
- **Cloud Save**: Your progress is automatically saved to Reddit's cloud

### Gameplay

1. **Click** the ore to dig and earn money
2. **Upgrade** your tools to increase earnings per click
3. **Purchase** auto-diggers to generate passive income and depth
4. **Discover** new biomes and rare ores as you dig deeper
5. **Compete** on leaderboards for bragging rights

---

## Built With

This game was developed using **[Kiro IDE](https://kiro.ai/)** - an AI-powered development environment.

### Technologies

- **[Devvit](https://developers.reddit.com/)** - Reddit's developer platform for building immersive experiences
- **[React 19](https://react.dev/)** - Modern UI framework with hooks
- **[Vite](https://vite.dev/)** - Lightning-fast build tool and dev server
- **[Express.js](https://expressjs.com/)** - Serverless backend on Node.js
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first styling
- **[Redis](https://redis.io/)** - High-performance data storage (via Devvit)

### Architecture

```
TheDiggerMan/
├── src/
│   ├── client/          # React webview (game UI)
│   │   ├── App.tsx      # Main game logic
│   │   ├── gameData.ts  # Ores, biomes, tools config
│   │   └── achievements.ts
│   ├── server/          # Express backend (API & Redis)
│   │   └── index.ts     # Game state, leaderboards
│   └── shared/          # Shared types
├── assets/              # App icons and splash screens
└── devvit.json         # Devvit configuration
```

---

## Getting Started

### Prerequisites

- **Node.js 22+** installed on your machine
- A Reddit account connected to [Reddit Developers](https://developers.reddit.com/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/TheDiggerMan.git
   cd TheDiggerMan
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Login to Reddit**
   ```bash
   npm run login
   ```

4. **Start development**
   ```bash
   npm run dev
   ```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with live Reddit preview |
| `npm run dev:vite` | Run Vite dev server on http://localhost:7474 (fast UI iteration) |
| `npm run build` | Build client and server for production |
| `npm run check` | Type check, lint, and format code |
| `npm run deploy` | Upload new version to Reddit |
| `npm run launch` | Build, deploy, and publish to Reddit |

---

## Game Design

### Progression
- **Manual Mining**: Click to dig and earn money with tool multipliers
- **Auto-Mining**: Purchase diggers that mine automatically
- **Tool Upgrades**: Each tier increases your earnings per click
- **Achievement System**: 30+ achievements across 5 categories

---

## Development

### Project Structure

- **Client** (`src/client/`): React webview with game UI and logic
- **Server** (`src/server/`): Express API handling Redis operations
- **Shared** (`src/shared/`): TypeScript types used by both

### Key Files

- `src/client/App.tsx` - Main game component with state management
- `src/client/gameData.ts` - Configuration for ores, tools, biomes, auto-diggers
- `src/client/achievements.ts` - Achievement definitions and unlock logic
- `src/server/index.ts` - API endpoints, Redis operations, leaderboards

### Data Storage

Game data is stored in Redis with the following patterns:
- `gameState:{postId}:{userId}` - Player progress
- `leaderboard:{postId}:money` - Money leaderboard (sorted set)
- `leaderboard:{postId}:depth` - Depth leaderboard (sorted set)
- `leaderboard:{postId}:name` - Reserved player names (hash)

---
