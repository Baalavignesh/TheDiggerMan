import express from 'express';
import { redis, reddit, createServer, context, getServerPort } from '@devvit/web/server';
import { createPost } from './core/post';
import { getAdminData, generateAdminHTML } from './admin';

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

    // Get previous game state to calculate click delta
    const saveKey = `gameState:${postId}:${userId || 'anonymous'}`;
    const previousStateStr = await redis.get(saveKey);
    let previousClicks = 0;
    if (previousStateStr) {
      try {
        const previousState = JSON.parse(previousStateStr);
        previousClicks = previousState.totalClicks || 0;
      } catch (e) {
        console.error('Failed to parse previous game state:', e);
      }
    }

    // Calculate click delta and update global stats
    const currentClicks = gameState.totalClicks || 0;
    const clickDelta = currentClicks - previousClicks;
    if (clickDelta > 0) {
      const globalClicksKey = `stats:${postId}:globalClicks`;
      await redis.incrBy(globalClicksKey, clickDelta);
    }

    // Save game state
    await redis.set(saveKey, JSON.stringify(gameState));

    // Update leaderboards - use per-post keys like old game
    const playerName = gameState.playerName;
    const money = Math.floor(gameState.money);
    const depth = Math.floor(gameState.depth);

    const moneyKey = `leaderboard:${postId}:money`;
    const depthKey = `leaderboard:${postId}:depth`;
    const clicksKey = `leaderboard:${postId}:clicks`;
    const totalClicksForPlayer = Math.floor(gameState.totalClicks || 0);

    await Promise.all([
      redis.zAdd(moneyKey, { member: playerName, score: money }),
      redis.zAdd(depthKey, { member: playerName, score: depth }),
      redis.zAdd(clicksKey, { member: playerName, score: totalClicksForPlayer }),
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

// API: Get global stats
router.get('/api/global-stats', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    const moneyKey = `leaderboard:${postId}:money`;
    const globalClicksKey = `stats:${postId}:globalClicks`;

    const [totalPlayers, globalClicksStr] = await Promise.all([
      redis.zCard(moneyKey),
      redis.get(globalClicksKey),
    ]);

    const globalClicks = globalClicksStr ? parseInt(globalClicksStr, 10) : 0;

    res.json({
      totalPlayers: totalPlayers || 0,
      globalClicks,
    });
  } catch (error) {
    console.error('Failed to fetch global stats:', error);
    res.status(500).json({ error: 'Failed to fetch global stats' });
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

// Internal: Migrate global clicks (backfill from existing game states)
router.post('/internal/migrate-global-clicks', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    const globalClicksKey = `stats:${postId}:globalClicks`;

    // Check if already migrated
    const existingValue = await redis.get(globalClicksKey);
    if (existingValue && parseInt(existingValue, 10) > 0) {
      res.json({
        status: 'warning',
        message: 'Global clicks counter already has data. Skipping migration to prevent duplication.',
        currentValue: parseInt(existingValue, 10),
      });
      return;
    }

    // Get all players from the money leaderboard
    const moneyKey = `leaderboard:${postId}:money`;
    const allPlayers = await redis.zRange(moneyKey, 0, -1, { by: 'rank' });

    if (!allPlayers || allPlayers.length === 0) {
      res.json({
        status: 'success',
        message: 'No players found to migrate',
        totalClicks: 0,
        playersScanned: 0,
      });
      return;
    }

    // We can't scan by pattern, so we'll need to try to get game states
    // Since we don't have userId mappings, we'll use a different approach:
    // Get all leaderboard players and try to fetch their states

    // Actually, we can't directly map playerName to userId without additional data
    // So this migration will only work if we have the data provided in the request
    // OR we iterate through possible userIds (which isn't feasible)

    res.json({
      status: 'info',
      message: 'Migration requires manual data input. Cannot scan all game states without userId mapping.',
      suggestion: 'Use /internal/update-global-clicks endpoint with explicit data',
    });
  } catch (error) {
    console.error(`Error migrating global clicks: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to migrate global clicks',
    });
  }
});

// Internal: Update global clicks manually (for migration)
router.post('/internal/update-global-clicks', async (req, res): Promise<void> => {
  try {
    const { postId } = context;
    const { totalClicks } = req.body;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    if (typeof totalClicks !== 'number' || totalClicks < 0) {
      res.status(400).json({
        status: 'error',
        message: 'totalClicks must be a non-negative number',
      });
      return;
    }

    const globalClicksKey = `stats:${postId}:globalClicks`;
    await redis.set(globalClicksKey, totalClicks.toString());

    res.json({
      status: 'success',
      message: `Global clicks set to ${totalClicks}`,
      totalClicks,
    });
  } catch (error) {
    console.error(`Error updating global clicks: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update global clicks',
    });
  }
});

// Internal: Recalculate global clicks from all players
router.post('/internal/recalculate-global-clicks', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    const globalClicksKey = `stats:${postId}:globalClicks`;
    const clicksKey = `leaderboard:${postId}:clicks`;

    // Get all players' click counts from the sorted set
    const allPlayerClicks = await redis.zRange(clicksKey, 0, -1, { by: 'rank' });

    if (!allPlayerClicks || allPlayerClicks.length === 0) {
      res.json({
        status: 'info',
        message: 'No player click data found yet. Players need to save their game at least once after this update.',
        totalClicks: 0,
        playersScanned: 0,
      });
      return;
    }

    // Sum all clicks
    let totalClicks = 0;
    for (const entry of allPlayerClicks) {
      totalClicks += entry.score;
    }

    // Update global counter
    await redis.set(globalClicksKey, totalClicks.toString());

    res.json({
      status: 'success',
      message: 'Global clicks recalculated successfully',
      totalClicks,
      playersScanned: allPlayerClicks.length,
      players: allPlayerClicks.map(p => ({
        playerName: p.member,
        clicks: p.score,
      })),
    });
  } catch (error) {
    console.error(`Error recalculating global clicks: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to recalculate global clicks',
    });
  }
});

// Internal: Diagnostic - Check global clicks data
router.get('/internal/diagnostic-clicks', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    const globalClicksKey = `stats:${postId}:globalClicks`;
    const moneyKey = `leaderboard:${postId}:money`;

    const [globalClicksStr, totalPlayers] = await Promise.all([
      redis.get(globalClicksKey),
      redis.zCard(moneyKey),
    ]);

    const globalClicks = globalClicksStr ? parseInt(globalClicksStr, 10) : 0;

    // Get all players from leaderboard (we have playerNames but not userIds)
    const allPlayers = await redis.zRange(moneyKey, 0, -1, { by: 'rank', reverse: true });

    res.json({
      postId,
      currentGlobalClicks: globalClicks,
      totalPlayersInLeaderboard: totalPlayers,
      note: 'Game states are stored by userId, not playerName. Cannot scan all game states without userId mapping.',
      suggestion: 'To calculate true total: Export player data, manually sum clicks from each player\'s game state if you have access to individual saves.',
      playersInLeaderboard: allPlayers.map(p => ({
        playerName: p.member,
        money: p.score,
      })),
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ error: 'Failed to get diagnostic data' });
  }
});

// API: Post activity to feed
router.post('/api/post-activity', async (req, res): Promise<void> => {
  try {
    const { postId } = context;
    const { playerName, activityType, details } = req.body;

    if (!postId || !playerName || !activityType) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const activityKey = `activity:${postId}`;
    const timestamp = Date.now();

    const activity = {
      playerName,
      activityType,
      details: details || {},
      timestamp,
    };

    // Store in sorted set with timestamp as score (keep last 100)
    await redis.zAdd(activityKey, { member: JSON.stringify(activity), score: timestamp });

    // Trim to keep only last 100 activities
    const count = await redis.zCard(activityKey);
    if (count > 100) {
      await redis.zRemRangeByRank(activityKey, 0, count - 101);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to post activity:', error);
    res.status(500).json({ success: false, error: 'Failed to post activity' });
  }
});

// API: Get recent activities
router.get('/api/recent-activities', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    const activityKey = `activity:${postId}`;

    // Get last 50 activities
    const activities = await redis.zRange(activityKey, 0, 49, { by: 'rank', reverse: true });

    const parsedActivities = activities.map(entry => {
      try {
        return JSON.parse(entry.member);
      } catch {
        return null;
      }
    }).filter(a => a !== null);

    res.json({ activities: parsedActivities });
  } catch (error) {
    console.error('Failed to get activities:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

// API: Get global goals
router.get('/api/global-goals', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const goalsKey = `goals:${postId}:${today}`;

    // Define daily goals
    const dailyGoals = [
      { id: 'depth', name: 'Community Depth', target: 1000000, unit: 'ft', reward: '2x Money for 10 minutes' },
      { id: 'ores', name: 'Ore Collection', target: 50000, unit: 'ores', reward: '1.5x Depth for 10 minutes' },
      { id: 'money', name: 'Wealth Generation', target: 10000000, unit: '$', reward: 'All auto-diggers +20% speed for 10 minutes' },
    ];

    // Get current progress
    const progress = await redis.hGetAll(goalsKey);

    const goalsWithProgress = dailyGoals.map(goal => ({
      ...goal,
      current: parseInt(progress[goal.id] || '0', 10),
      percentage: Math.min(100, Math.floor((parseInt(progress[goal.id] || '0', 10) / goal.target) * 100)),
      completed: parseInt(progress[goal.id] || '0', 10) >= goal.target,
    }));

    res.json({ goals: goalsWithProgress, date: today });
  } catch (error) {
    console.error('Failed to get global goals:', error);
    res.status(500).json({ error: 'Failed to get global goals' });
  }
});

// API: Contribute to global goal (passive tracking from saves)
router.post('/api/contribute-to-goals', async (req, res): Promise<void> => {
  try {
    const { postId } = context;
    const { depth, ores, money } = req.body;

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId is required' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const goalsKey = `goals:${postId}:${today}`;

    // Increment goal progress
    const updates: any = {};
    if (depth) updates.depth = depth;
    if (ores) updates.ores = ores;
    if (money) updates.money = money;

    for (const [key, value] of Object.entries(updates)) {
      await redis.hIncrBy(goalsKey, key, Math.floor(value as number));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to contribute to goals:', error);
    res.status(500).json({ success: false, error: 'Failed to contribute' });
  }
});

// Admin: View database (HTML page)
router.get('/admin', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).send('<h1>Error: postId is required</h1>');
      return;
    }

    const data = await getAdminData(postId);
    const html = generateAdminHTML(data);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).send('<h1>Error loading admin panel</h1><pre>' + error + '</pre>');
  }
});

// Admin: Get database as JSON
router.get('/admin/json', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    const data = await getAdminData(postId);
    res.json(data);
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).json({ error: 'Failed to fetch admin data' });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
