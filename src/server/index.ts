import express from 'express';
import { redis, reddit, createServer, context, getServerPort } from '@devvit/web/server';
import { createPost } from './core/post';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const router = express.Router();

// Helper function to sanitize player names
function sanitizeName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 16) {
    return null;
  }
  if (/[^a-zA-Z0-9 _-]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

// API: Initialize game
router.get('/api/init', async (_req, res): Promise<void> => {
  try {
    const { postId, userId } = context;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    // Get Reddit username
    let username = 'anonymous';
    try {
      const currentUser = await reddit.getCurrentUser();
      if (currentUser?.username) {
        username = currentUser.username;
      }
    } catch (e) {
      console.error('Failed to get current user:', e);
    }

    // Get saved game state
    const saveKey = `gameState:${postId}:${userId || 'anonymous'}`;
    const savedStateStr = await redis.get(saveKey);

    let gameState = null;
    if (savedStateStr) {
      try {
        gameState = JSON.parse(savedStateStr);
      } catch (e) {
        console.error('Failed to parse saved game state:', e);
      }
    }

    // If no saved game state, initialize with Reddit username
    if (!gameState) {
      gameState = {
        playerName: username,
      };
    } else if (!gameState.playerName) {
      // Update existing game state with username if missing
      gameState.playerName = username;
    }

    // Get leaderboard (top 10 for each category) - use per-post keys like old game
    const moneyKey = `leaderboard:${postId}:money`;
    const depthKey = `leaderboard:${postId}:depth`;
    const moneyLeaderboardData = await redis.zRange(moneyKey, 0, 9, { by: 'rank', reverse: true });
    const depthLeaderboardData = await redis.zRange(depthKey, 0, 9, { by: 'rank', reverse: true });

    // Combine and deduplicate leaderboard entries
    const leaderboardMap = new Map();

    // Process money leaderboard
    for (const entry of moneyLeaderboardData) {
      if (!leaderboardMap.has(entry.member)) {
        leaderboardMap.set(entry.member, {
          playerName: entry.member,
          money: entry.score,
          depth: 0,
          rank: 0,
        });
      } else {
        leaderboardMap.get(entry.member).money = entry.score;
      }
    }

    // Process depth leaderboard
    for (const entry of depthLeaderboardData) {
      if (!leaderboardMap.has(entry.member)) {
        leaderboardMap.set(entry.member, {
          playerName: entry.member,
          money: 0,
          depth: entry.score,
          rank: 0,
        });
      } else {
        leaderboardMap.get(entry.member).depth = entry.score;
      }
    }

    // Convert to array and assign ranks
    const leaderboard = Array.from(leaderboardMap.values()).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Get player's standing if they have a player name
    let playerStanding = null;
    if (gameState && gameState.playerName) {
      const [playerMoneyRankAsc, totalMoneyEntries] = await Promise.all([
        redis.zRank(moneyKey, gameState.playerName),
        redis.zCard(moneyKey),
      ]);

      if (
        playerMoneyRankAsc !== undefined &&
        typeof totalMoneyEntries === 'number' &&
        totalMoneyEntries > 0
      ) {
        playerStanding = totalMoneyEntries - playerMoneyRankAsc;
      }

      // Auto-register username in name index if not already registered
      const nameIndexKey = `leaderboard:${postId}:name`;
      const existingOwner = await redis.hGet(nameIndexKey, gameState.playerName.toLowerCase());
      if (!existingOwner) {
        await redis.hSet(nameIndexKey, { [gameState.playerName.toLowerCase()]: gameState.playerName });
      }
    }

    res.json({
      gameState,
      leaderboard,
      playerStanding,
    });
  } catch (error) {
    console.error('Failed to initialize game:', error);
    // Return a default game state even on error to allow game to still load
    res.json({
      gameState: {
        playerName: 'Anonymous Player',
        money: 0,
        depth: 0,
        currentTool: 'dirt_pickaxe',
        autoDiggers: {},
        oreInventory: {},
        discoveredOres: ['dirt'],
        discoveredBiomes: [1],
        totalClicks: 0,
        unlockedAchievements: [],
      },
      leaderboard: [],
      playerStanding: null,
    });
  }
});

// API: Save game
router.post('/api/save', async (req, res): Promise<void> => {
  try {
    const { postId, userId } = context;
    const { gameState } = req.body;

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId is required' });
      return;
    }

    if (!gameState || !gameState.playerName) {
      res.status(400).json({ success: false, error: 'gameState with playerName is required' });
      return;
    }

    // Save game state
    const saveKey = `gameState:${postId}:${userId || 'anonymous'}`;
    await redis.set(saveKey, JSON.stringify(gameState));

    // Update leaderboards - use per-post keys like old game
    const playerName = gameState.playerName;
    const money = Math.floor(gameState.money);
    const depth = Math.floor(gameState.depth);

    const moneyKey = `leaderboard:${postId}:money`;
    const depthKey = `leaderboard:${postId}:depth`;

    await Promise.all([
      redis.zAdd(moneyKey, { member: playerName, score: money }),
      redis.zAdd(depthKey, { member: playerName, score: depth }),
    ]);

    // Get updated leaderboard
    const moneyLeaderboardData = await redis.zRange(moneyKey, 0, 9, { by: 'rank', reverse: true });
    const depthLeaderboardData = await redis.zRange(depthKey, 0, 9, { by: 'rank', reverse: true });

    const leaderboardMap = new Map();

    for (const entry of moneyLeaderboardData) {
      if (!leaderboardMap.has(entry.member)) {
        leaderboardMap.set(entry.member, {
          playerName: entry.member,
          money: entry.score,
          depth: 0,
          rank: 0,
        });
      } else {
        leaderboardMap.get(entry.member).money = entry.score;
      }
    }

    for (const entry of depthLeaderboardData) {
      if (!leaderboardMap.has(entry.member)) {
        leaderboardMap.set(entry.member, {
          playerName: entry.member,
          money: 0,
          depth: entry.score,
          rank: 0,
        });
      } else {
        leaderboardMap.get(entry.member).depth = entry.score;
      }
    }

    const leaderboard = Array.from(leaderboardMap.values()).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Get player's standing
    const [playerMoneyRankAsc, totalMoneyEntries] = await Promise.all([
      redis.zRank(moneyKey, playerName),
      redis.zCard(moneyKey),
    ]);

    const playerStanding =
      playerMoneyRankAsc !== undefined && typeof totalMoneyEntries === 'number' && totalMoneyEntries > 0
        ? totalMoneyEntries - playerMoneyRankAsc
        : null;

    res.json({
      success: true,
      leaderboard,
      playerStanding,
    });
  } catch (error) {
    console.error('Failed to save game:', error);
    res.status(500).json({ success: false, error: 'Failed to save game' });
  }
});

// API: Reset game
router.post('/api/reset', async (_req, res): Promise<void> => {
  try {
    const { postId, userId } = context;

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId is required' });
      return;
    }

    // Delete game state
    const saveKey = `gameState:${postId}:${userId || 'anonymous'}`;
    await redis.del(saveKey);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to reset game:', error);
    res.status(500).json({ success: false, error: 'Failed to reset game' });
  }
});

// API: Register player
router.post('/api/register', async (req, res): Promise<void> => {
  try {
    const { postId } = context;
    const { name } = req.body;

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId is required' });
      return;
    }

    const attemptedName = sanitizeName(name);

    if (!attemptedName) {
      res.json({
        success: false,
        error: 'Pick a name 3-16 chars long using letters, numbers, spaces, - or _.',
      });
      return;
    }

    // Check if name is already taken (per-post, like old game)
    const nameIndexKey = `leaderboard:${postId}:name`;
    const existingOwner = await redis.hGet(nameIndexKey, attemptedName.toLowerCase());

    if (existingOwner) {
      res.json({
        success: false,
        error: 'This name is already taken. Please choose another one.',
      });
      return;
    }

    // Reserve the name (store mapping of lowercase name -> actual name)
    await redis.hSet(nameIndexKey, { [attemptedName.toLowerCase()]: attemptedName });

    res.json({
      success: true,
      playerName: attemptedName,
    });
  } catch (error) {
    console.error('Failed to register player:', error);
    res.status(500).json({ success: false, error: 'Failed to register player' });
  }
});

// Internal: On app install
router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// Internal: Menu post create
router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// Internal: Manual leaderboard update (for migration)
router.post('/internal/update-leaderboard', async (req, res): Promise<void> => {
  try {
    const { postId } = context;
    const { players } = req.body;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    if (!players || !Array.isArray(players)) {
      res.status(400).json({
        status: 'error',
        message: 'players array is required',
      });
      return;
    }

    const moneyKey = `leaderboard:${postId}:money`;
    const depthKey = `leaderboard:${postId}:depth`;
    const nameIndexKey = `leaderboard:${postId}:name`;

    // Update each player's scores
    for (const player of players) {
      const { name, money, depth } = player;

      if (!name) continue;

      // Add to leaderboards
      if (money !== undefined && money !== null) {
        await redis.zAdd(moneyKey, { member: name, score: Math.floor(money) });
      }

      if (depth !== undefined && depth !== null) {
        await redis.zAdd(depthKey, { member: name, score: Math.floor(depth) });
      }

      // Register name in index
      await redis.hSet(nameIndexKey, { [name.toLowerCase()]: name });
    }

    res.json({
      status: 'success',
      message: `Updated ${players.length} players in leaderboard`,
    });
  } catch (error) {
    console.error(`Error updating leaderboard: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update leaderboard',
    });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
