# Product Overview

**TheDiggerMan** is an incremental clicker game built for Reddit's Devvit platform where players dig deep into the earth, discover valuable ores, and build their mining empire.

## Core Features

- **Incremental Clicker Gameplay**: Click to dig and earn money, upgrade tools for higher earnings
- **Auto-Mining System**: Deploy automated diggers that mine continuously for passive income
- **Biome Progression**: 7+ unique biomes from Surface to The Void, each with different ores
- **Ore Discovery**: 20+ ore types with varying rarity (Basic to Mythic)
- **Tool Upgrades**: Progressive pickaxe upgrades that multiply earnings per click
- **Achievement System**: 30+ achievements across multiple categories
- **Global Leaderboards**: Compete on money and depth leaderboards per Reddit post
- **Cloud Saves**: Auto-saves every 30 seconds to Reddit's Redis backend
- **Reddit Integration**: Uses Reddit usernames automatically, no separate registration

## Game Mechanics

### Manual Mining
- Click ore to dig → earn money (with tool multiplier) + 1 depth + ore to inventory
- Money used to purchase tools and auto-diggers
- Depth unlocks new biomes with rarer ores

### Auto-Mining
- Purchase auto-diggers that mine periodically
- Generate passive money and ore collection
- Each digger has different mining speed and cost

### Progression System
- **Tools**: Increase manual mining earnings (1x to 1000x multiplier)
- **Auto-Diggers**: 10 tiers from Helper Mole to Dimensional Drill
- **Biomes**: Unlock deeper biomes by reaching depth thresholds
- **Achievements**: Milestone-based rewards for clicks, depth, money, ores, diggers

## Platform Integration

- Runs as a Reddit app within the Devvit ecosystem
- Creates posts automatically on app installation
- Provides moderator menu actions for post creation
- Uses Reddit API to fetch current user's username
- Stores game state and leaderboards in Redis (per-post scoped)

## Target Audience

- Reddit users who enjoy incremental/idle games
- Fans of Cookie Clicker, Clicker Heroes, Adventure Capitalist
- Players who like progression systems and leaderboard competition

## Monetization

Currently free-to-play with no monetization. Focus on engagement and gameplay.
