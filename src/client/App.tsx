import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { apiClient } from './apiClient';
import type { GameState, LeaderboardEntry } from './apiClient';
import { TOOLS, AUTO_DIGGERS, ORES, BIOMES, getBiome, getAutoDiggerCost } from './gameData';
import type { Tool, AutoDigger } from './gameData';
import Character from './Character';
import Modal from './Modal';
import AchievementsModal from './AchievementsModal';
import AchievementToast from './AchievementToast';
import { ACHIEVEMENTS, checkAchievement, Achievement } from './achievements';

// Sound pooling for high-performance rapid taps
let backgroundMusic: HTMLAudioElement | null = null;
const SOUND_POOL_SIZE = 10;
let miningSoundPool: HTMLAudioElement[] = [];
let selectSoundPool: HTMLAudioElement[] = [];
let currentMiningIndex = 0;
let currentSelectIndex = 0;
let lastMiningPlayTime = 0;
const MINING_SOUND_THROTTLE = 50;
const MAX_ACTIVE_SPARKS = 30;
const MAX_FALLING_ORES = 40;

const isMobileDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches;

const sanitizePlayerName = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 16) {
    return null;
  }
  if (/[^a-zA-Z0-9 _-]/.test(trimmed)) {
    return null;
  }
  return trimmed;
};

if (typeof window !== 'undefined') {
  try {
    for (let i = 0; i < SOUND_POOL_SIZE; i++) {
      const sound = new Audio('/sounds/mining.mp3');
      sound.volume = 0.01;
      sound.preload = 'auto';
      sound.load();
      miningSoundPool.push(sound);
    }

    for (let i = 0; i < SOUND_POOL_SIZE; i++) {
      const sound = new Audio('/sounds/clicksound.mp3');
      sound.volume = 0.06;
      sound.preload = 'auto';
      sound.load();
      selectSoundPool.push(sound);
    }

    backgroundMusic = new Audio('/sounds/music.mp3');
    backgroundMusic.volume = 0.2;
    backgroundMusic.loop = true;
    backgroundMusic.preload = 'auto';
    backgroundMusic.load();
  } catch (err) {
    console.error('Failed to initialize sounds:', err);
  }
}

const playMiningSound = () => {
  if (isMobileDevice()) {
    return;
  }
  const now = Date.now();
  if (now - lastMiningPlayTime < MINING_SOUND_THROTTLE) {
    return;
  }
  lastMiningPlayTime = now;

  try {
    const sound = miningSoundPool[currentMiningIndex];
    if (sound.paused || sound.ended) {
      sound.currentTime = 0;
      sound.play().catch(() => {}); // Silently catch errors
    }
    currentMiningIndex = (currentMiningIndex + 1) % SOUND_POOL_SIZE;
  } catch (err) {
  }
};

const playSelectSoundFast = () => {
  if (isMobileDevice()) {
    return;
  }
  try {
    const sound = selectSoundPool[currentSelectIndex];
    if (sound.paused || sound.ended) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
    currentSelectIndex = (currentSelectIndex + 1) % SOUND_POOL_SIZE;
  } catch (err) {
  }
};

interface AppState extends GameState {
  money: number;
  depth: number;
  currentTool: string;
  autoDiggers: { [key: string]: number };
  oreInventory: { [key: string]: number };
  discoveredOres: Set<string>;
  discoveredBiomes: Set<number>;
  totalClicks: number;
  unlockedAchievements: Set<string>;
  playerName?: string;
}

// Format large numbers for display
function formatNumber(num: number): string {
  if (num < 1000) return Math.floor(num).toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
  if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num < 1000000000000000) return (num / 1000000000000).toFixed(1) + 'T';
  return (num / 1000000000000000).toFixed(1) + 'Q';
}

// Format money with 3 decimal places
function formatMoney(num: number): string {
  if (num < 1000) return num.toFixed(3);
  if (num < 1000000) return (num / 1000).toFixed(3) + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(3) + 'M';
  if (num < 1000000000000) return (num / 1000000000).toFixed(3) + 'B';
  if (num < 1000000000000000) return (num / 1000000000000).toFixed(3) + 'T';
  return (num / 1000000000000000).toFixed(3) + 'Q';
}

// Format decimal numbers (for auto-digger speeds)
function formatDecimal(num: number): string {
  if (num < 1) return num.toFixed(2);
  if (num < 10) return num.toFixed(1);
  if (num < 1000) return Math.floor(num).toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
  if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num < 1000000000000000) return (num / 1000000000000).toFixed(1) + 'T';
  return (num / 1000000000000000).toFixed(1) + 'Q';
}

// Convert ore name to filename format
function getOreImagePath(oreName: string, variant: number): string {
  // Convert from snake_case to Title Case
  const titleCase = oreName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return `/ores/${titleCase}${variant}.png`;
}

// Randomly select an ore from the current biome
function getRandomOre(biomeOres: string[]): string {
  const availableOres = biomeOres.map(oreId => ORES[oreId]);

  // Weighted random selection based on spawn chance
  const totalWeight = availableOres.reduce((sum, ore) => sum + ore.spawnChance, 0);
  let random = Math.random() * totalWeight;

  for (const ore of availableOres) {
    random -= ore.spawnChance;
    if (random <= 0) {
      return ore.id;
    }
  }

  return biomeOres[0]; // Fallback
}

export const App = () => {
  const [ready, setReady] = useState(false);
  const [gameState, setGameState] = useState<AppState>({
    money: 0,
    depth: 0,
    currentTool: 'dirt_pickaxe',
    autoDiggers: {},
    oreInventory: {},
    discoveredOres: new Set<string>(['dirt']),
    discoveredBiomes: new Set<number>([1]),
    totalClicks: 0,
    unlockedAchievements: new Set<string>(),
    playerName: '',
  });

  const [showShop, setShowShop] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCover, setShowCover] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerStanding, setPlayerStanding] = useState<number | null>(null);
  const [approxRates, setApproxRates] = useState({ moneyPerSecond: 0, depthPerSecond: 0 });
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [playerNameError, setPlayerNameError] = useState('');
  const [isRegisteringName, setIsRegisteringName] = useState(false);
  const [manualSavePending, setManualSavePending] = useState(false);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState<number | null>(null);

  const musicEnabledRef = useRef(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    musicEnabledRef.current = musicEnabled;
  }, [musicEnabled]);

  const showNamePrompt = !gameState.playerName;

  useEffect(() => {
    if (gameState.playerName) {
      setPlayerNameInput(gameState.playerName);
    }
  }, [gameState.playerName]);

  const [shopTab, setShopTab] = useState<'tools' | 'diggers'>('tools');
  const [infoTab, setInfoTab] = useState<'ores' | 'biomes'>('ores');

  // Achievement toast state
  const [currentToastAchievement, setCurrentToastAchievement] = useState<Achievement | null>(null);
  const [achievementQueue, setAchievementQueue] = useState<Achievement[]>([]);

  // Sound effect helpers
  const playMiningSoundCallback = useCallback(() => {
    if (soundEnabled) {
      playMiningSound();
    }
  }, [soundEnabled]);

  const playSelectSound = useCallback(() => {
    if (soundEnabled) {
      playSelectSoundFast();
    }
  }, [soundEnabled]);

  const noop = useCallback(() => {}, []);

  const startGame = useCallback((withSound: boolean) => {
    if (withSound) {
      playSelectSound();
    }
    setShowCover(false);

    if (backgroundMusic && musicEnabled) {
      backgroundMusic.play().catch(() => {
        /* Autoplay blocked */
      });
    }
  }, [musicEnabled, playSelectSound]);

  const handleEnterGame = useCallback(() => {
    startGame(true);
  }, [startGame]);

  const [isSmashing, setIsSmashing] = useState(false);
  const [currentOreId, setCurrentOreId] = useState<string>('dirt');
  const [currentOreVariant, setCurrentOreVariant] = useState<number>(1);
  const [sparkParticles, setSparkParticles] = useState<Array<{ id: string; variant: number; x: number; y: number; key: number }>>([]);
  const [fallingOres, setFallingOres] = useState<Array<{ id: string; variant: number; x: number; delay: number; duration: number; key: number }>>([]);

  // Auto-digger states
  const [autoDiggerStates, setAutoDiggerStates] = useState<{
    [diggerId: string]: {
      currentOre: { id: string; variant: number };
      upcomingOres: Array<{ id: string; variant: number }>;
      isSmashing: boolean;
    };
  }>({});

  const lastTickRef = useRef<number>(Date.now());
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sparkKeyRef = useRef<number>(0);
  const fallingOreKeyRef = useRef<number>(0);
  const latestValuesRef = useRef({ money: 0, depth: 0 });
  const lastSnapshotRef = useRef({ money: 0, depth: 0, time: Date.now() });

  const currentTool = useMemo(
    () => TOOLS.find((t) => t.id === gameState.currentTool) ?? TOOLS[0],
    [gameState.currentTool]
  );

  const currentBiome = useMemo(() => getBiome(gameState.depth), [gameState.depth]);

  useEffect(() => {
    latestValuesRef.current = { money: gameState.money, depth: gameState.depth };
  }, [gameState.money, gameState.depth]);

  useEffect(() => {
    lastSnapshotRef.current = {
      money: gameState.money,
      depth: gameState.depth,
      time: Date.now(),
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const snapshot = lastSnapshotRef.current;
      const current = latestValuesRef.current;
      const elapsed = (now - snapshot.time) / 1000;
      if (elapsed <= 0.1) {
        return;
      }

      const moneyPerSecond = (current.money - snapshot.money) / elapsed;
      const depthPerSecond = (current.depth - snapshot.depth) / elapsed;

      setApproxRates({ moneyPerSecond, depthPerSecond });

      lastSnapshotRef.current = { money: current.money, depth: current.depth, time: now };
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const renderLeaderboardColumn = (
    entries: LeaderboardEntry[],
    icon: string,
    heading: string,
    formatScore: (score: number) => string
  ) => {
    const items: React.ReactNode[] = [];

    entries.forEach((entry, index) => {
      const isSelf = gameState.playerName === entry.playerName;
      items.push(
        <li
          key={`${heading}-${entry.playerName}`}
          className={`leaderboard-row${isSelf ? ' self' : ''}`}
        >
          <span className="leaderboard-rank">#{entry.rank}</span>
          <span className="leaderboard-name">{isSelf ? `${entry.playerName} (You)` : entry.playerName}</span>
          <span className="leaderboard-score">{formatScore(entry.depth || entry.money)}</span>
        </li>
      );
    });

    if (items.length === 0) {
      items.push(
        <li key={`${heading}-empty`} className="leaderboard-empty">
          No entries yet. Be the first to strike it rich!
        </li>
      );
    }

    return (
      <div className="leaderboard-column">
        <div className="leaderboard-section-title">
          <i className={`fas ${icon}`}></i> {heading}
        </div>
        <ul className="leaderboard-list">{items}</ul>
      </div>
    );
  };

  const sendSaveGame = useCallback(
    async (manual = false) => {
      if (!ready) {
        return;
      }

      if (!gameState.playerName) {
        return;
      }

      if (manual) {
        setManualSavePending(true);
      }

      const response = await apiClient.save(gameState);

      if (response.success) {
        setLastSaveTimestamp(Date.now());
        setManualSavePending(false);

        if (response.leaderboard) {
          setLeaderboard(response.leaderboard);
        }
        if (response.playerStanding !== undefined) {
          setPlayerStanding(response.playerStanding);
        }
      }
    },
    [gameState, ready]
  );

  const handleManualSave = useCallback(() => {
    playSelectSound();
    sendSaveGame(true);
  }, [playSelectSound, sendSaveGame]);

  const handleNameSubmit = useCallback(
    async (event?: React.FormEvent) => {
      if (event) {
        event.preventDefault();
      }

      const sanitized = sanitizePlayerName(playerNameInput);

      if (!sanitized) {
        setPlayerNameError('Pick a name 3-16 chars long using letters, numbers, spaces, - or _.');
        return;
      }

      setIsRegisteringName(true);
      setPlayerNameError('');

      const response = await apiClient.register(sanitized);

      setIsRegisteringName(false);

      if (response.success && response.playerName) {
        setGameState((prev) => ({ ...prev, playerName: response.playerName! }));
        setPlayerNameInput(response.playerName);
        setPlayerNameError('');
        setShowCover(false);
        if (backgroundMusic && musicEnabledRef.current) {
          backgroundMusic.play().catch(() => {
            /* Autoplay blocked */
          });
        }
      } else if (!response.success && response.error) {
        setPlayerNameError(response.error);
      }
    },
    [playerNameInput]
  );

  // Reset game function
  const handleResetGame = useCallback(async () => {
    if (!confirm('Are you sure you want to reset your game? This will delete all progress!')) {
      return;
    }

    await apiClient.reset();
    window.location.reload();
  }, []);

  // Generate static background ores (memoized)
  const backgroundOres = useMemo(() => {
    const oreTypes = ['stone', 'gold', 'emerald', 'ruby', 'diamond', 'deep_stone'];
    return Array.from({ length: 25 }, (_, i) => ({
      id: i,
      ore: oreTypes[Math.floor(Math.random() * oreTypes.length)],
      variant: Math.floor(Math.random() * 3) + 4,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 30 + Math.random() * 20,
    }));
  }, []);

  // Calculate total auto-digger production
  const totalDepthProduction = useMemo(() => {
    return AUTO_DIGGERS.reduce((total, digger) => {
      const count = gameState.autoDiggers[digger.id] || 0;
      return total + digger.depthPerSecond * count;
    }, 0);
  }, [gameState.autoDiggers]);

  // Set initial ore when ready (only once)
  useEffect(() => {
    if (!ready) return;

    const biome = getBiome(gameState.depth);
    const initialOre = getRandomOre(biome.ores);
    setCurrentOreId(initialOre);
    setCurrentOreVariant(Math.floor(Math.random() * 3) + 1);
  }, [ready]); // Only run when ready changes, not on every depth change

  // Handle music toggle
  useEffect(() => {
    if (!backgroundMusic) {
      return;
    }

    if (musicEnabled && !showCover) {
      backgroundMusic.play().catch(() => {
        /* Autoplay blocked */
      });
    } else {
      backgroundMusic.pause();
    }
  }, [musicEnabled, showCover]);

  // Check for newly unlocked achievements
  useEffect(() => {
    if (!ready) return;

    const newlyUnlocked: string[] = [];

    ACHIEVEMENTS.forEach(achievement => {
      if (gameState.unlockedAchievements.has(achievement.id)) return;

      const isUnlocked = checkAchievement(achievement, {
        depth: gameState.depth,
        money: gameState.money,
        totalClicks: gameState.totalClicks,
        currentTool: gameState.currentTool,
        oreInventory: gameState.oreInventory,
        autoDiggers: gameState.autoDiggers,
        discoveredOres: gameState.discoveredOres,
        discoveredBiomes: gameState.discoveredBiomes,
      });

      if (isUnlocked) {
        newlyUnlocked.push(achievement.id);
      }
    });

    if (newlyUnlocked.length > 0) {
      setGameState(prev => ({
        ...prev,
        unlockedAchievements: new Set([...prev.unlockedAchievements, ...newlyUnlocked]),
      }));

      const newAchievements = newlyUnlocked
        .map(id => ACHIEVEMENTS.find(a => a.id === id))
        .filter(Boolean) as Achievement[];

      setAchievementQueue(prev => [...prev, ...newAchievements]);
    }
  }, [gameState.depth, gameState.money, gameState.totalClicks, gameState.currentTool,
      gameState.oreInventory, gameState.autoDiggers, gameState.discoveredOres,
      gameState.discoveredBiomes, ready]);

  // Process achievement toast queue
  useEffect(() => {
    if (!currentToastAchievement && achievementQueue.length > 0) {
      setCurrentToastAchievement(achievementQueue[0]);
      setAchievementQueue(prev => prev.slice(1));
    }
  }, [currentToastAchievement, achievementQueue]);

  // Create falling ore effect
  const createFallingOres = useCallback((oreId: string) => {
    if (isMobileDevice()) {
      return;
    }
    const fallingCount = Math.floor(Math.random() * 2) + 1;
    const newFallingOres: Array<{ id: string; variant: number; x: number; delay: number; duration: number; key: number }> = [];

    for (let i = 0; i < fallingCount; i++) {
      const variant = Math.floor(Math.random() * 6) + 1;
      const x = Math.random() * 100;
      const delay = Math.random() * 1.5;
      const duration = 6 + Math.random() * 3;
      const key = fallingOreKeyRef.current++;

      newFallingOres.push({ id: oreId, variant, x, delay, duration, key });
    }

    const removalKeys = new Set(newFallingOres.map((ore) => ore.key));

    setFallingOres((prev) => {
      const combined = [...prev, ...newFallingOres];
      if (combined.length > MAX_FALLING_ORES) {
        return combined.slice(combined.length - MAX_FALLING_ORES);
      }
      return combined;
    });

    setTimeout(() => {
      setFallingOres((current) => current.filter((ore) => !removalKeys.has(ore.key)));
    }, 11000);
  }, []);

  // Handle ore click
  const handleOreClick = useCallback(() => {
    const ore = ORES[currentOreId];
    const bonusMoney = Math.floor(ore.value * currentTool.bonusMultiplier);

    playMiningSoundCallback();
    setIsSmashing(true);

    const mobile = isMobileDevice();
    const sparkCount = mobile ? 1 : Math.floor(Math.random() * 3) + 3;
    const newSparks: Array<{ id: string; variant: number; x: number; y: number; key: number }> = [];

    for (let i = 0; i < sparkCount; i++) {
      const variant = Math.floor(Math.random() * 3) + 4;
      const angle = (Math.PI * 2 * i) / sparkCount;
      const distance = 60 + Math.random() * 40;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const key = sparkKeyRef.current++;

      newSparks.push({ id: currentOreId, variant, x, y, key });
    }

    const sparkRemovalKeys = new Set(newSparks.map((spark) => spark.key));

    setSparkParticles((prev) => {
      const combined = [...prev, ...newSparks];
      if (combined.length > MAX_ACTIVE_SPARKS) {
        return combined.slice(combined.length - MAX_ACTIVE_SPARKS);
      }
      return combined;
    });

    setTimeout(() => {
      setSparkParticles((prev) => prev.filter((spark) => !sparkRemovalKeys.has(spark.key)));
    }, 600);

    if (!mobile) {
      createFallingOres(currentOreId);
    }

    setGameState((prev) => {
      const newDiscoveredOres = new Set(prev.discoveredOres);
      newDiscoveredOres.add(currentOreId);

      return {
        ...prev,
        depth: prev.depth + 1,
        money: prev.money + bonusMoney,
        oreInventory: {
          ...prev.oreInventory,
          [currentOreId]: (prev.oreInventory[currentOreId] || 0) + 1,
        },
        discoveredOres: newDiscoveredOres,
        totalClicks: prev.totalClicks + 1,
      };
    });

    const biome = currentBiome;
    const nextOreId = getRandomOre(biome.ores);
    const nextOreVariant = Math.floor(Math.random() * 3) + 1;

    setCurrentOreId(nextOreId);
    setCurrentOreVariant(nextOreVariant);
  }, [currentOreId, currentTool, currentBiome, createFallingOres, playMiningSoundCallback]);

  // Handle smash animation complete
  const handleSmashComplete = useCallback(() => {
    setIsSmashing(false);
  }, []);

  // Buy tool upgrade
  const buyTool = useCallback(
    (tool: Tool) => {
      const currentToolIndex = TOOLS.findIndex((t) => t.id === gameState.currentTool);
      const newToolIndex = TOOLS.findIndex((t) => t.id === tool.id);

      if (newToolIndex <= currentToolIndex) {
        return;
      }

      if (gameState.money >= tool.cost) {
        playSelectSound();
        setGameState((prev) => ({
          ...prev,
          money: prev.money - tool.cost,
          currentTool: tool.id,
        }));
      }
    },
    [gameState.money, gameState.currentTool, playSelectSound]
  );

  // Buy auto-digger
  const buyAutoDigger = useCallback(
    (digger: AutoDigger) => {
      const currentCount = gameState.autoDiggers[digger.id] || 0;
      const cost = getAutoDiggerCost(digger, currentCount);

      if (gameState.money >= cost) {
        playSelectSound();
        setGameState((prev) => ({
          ...prev,
          money: prev.money - cost,
          autoDiggers: {
            ...prev.autoDiggers,
            [digger.id]: currentCount + 1,
          },
        }));
      }
    },
    [gameState.money, gameState.autoDiggers, playSelectSound]
  );

  // Auto-production tick (60fps)
  useEffect(() => {
    if (totalDepthProduction <= 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setGameState((prev) => ({
        ...prev,
        depth: prev.depth + totalDepthProduction * deltaTime,
      }));
    }, 1000 / 60);

    return () => clearInterval(interval);
  }, [totalDepthProduction]);

  // Initialize auto-digger states
  useEffect(() => {
    if (!ready) return;

    const biome = getBiome(gameState.depth);

    const ownedDiggers = Object.keys(gameState.autoDiggers).filter(
      (diggerId) => gameState.autoDiggers[diggerId] > 0
    );

    setAutoDiggerStates((prev) => {
      const newStates = { ...prev };

      ownedDiggers.forEach((diggerId) => {
        if (!newStates[diggerId]) {
          newStates[diggerId] = {
            currentOre: {
              id: getRandomOre(biome.ores),
              variant: Math.floor(Math.random() * 3) + 1,
            },
            upcomingOres: Array.from({ length: 5 }, () => ({
              id: getRandomOre(biome.ores),
              variant: Math.floor(Math.random() * 3) + 1,
            })),
            isSmashing: false,
          };
        }
      });

      Object.keys(newStates).forEach((diggerId) => {
        if (!ownedDiggers.includes(diggerId)) {
          delete newStates[diggerId];
        }
      });

      return newStates;
    });
  }, [gameState.autoDiggers, gameState.depth, ready]);

  // Track biome changes
  const prevBiomeRef = useRef<number>(0);
  useEffect(() => {
    const currentBiomeId = getBiome(gameState.depth).id;

    setGameState((prev) => {
      const newDiscoveredBiomes = new Set(prev.discoveredBiomes);
      newDiscoveredBiomes.add(currentBiomeId);
      return { ...prev, discoveredBiomes: newDiscoveredBiomes };
    });

    if (prevBiomeRef.current !== 0 && prevBiomeRef.current !== currentBiomeId) {
      const newBiome = getBiome(gameState.depth);

      setAutoDiggerStates((prev) => {
        const newStates = { ...prev };

        Object.keys(newStates).forEach((diggerId) => {
          newStates[diggerId] = {
            ...newStates[diggerId],
            currentOre: {
              id: getRandomOre(newBiome.ores),
              variant: Math.floor(Math.random() * 3) + 1,
            },
            upcomingOres: Array.from({ length: 5 }, () => ({
              id: getRandomOre(newBiome.ores),
              variant: Math.floor(Math.random() * 3) + 1,
            })),
          };
        });

        return newStates;
      });
    }

    prevBiomeRef.current = currentBiomeId;
  }, [gameState.depth]);

  // Auto-mining logic
  useEffect(() => {
    const intervals: { [diggerId: string]: NodeJS.Timeout } = {};
    const ownedDiggers = Object.keys(gameState.autoDiggers).filter(
      (diggerId) => gameState.autoDiggers[diggerId] > 0
    );

    ownedDiggers.forEach((diggerId) => {
      const digger = AUTO_DIGGERS.find((d) => d.id === diggerId);
      const count = gameState.autoDiggers[diggerId] || 0;

      if (!digger || count === 0) return;

      const baseInterval = 1000;
      const mineInterval = Math.max(100, baseInterval / count);

      const interval = setInterval(() => {
        setAutoDiggerStates((prev) => {
          if (!prev[diggerId] || prev[diggerId].isSmashing) {
            return prev;
          }

          return {
            ...prev,
            [diggerId]: { ...prev[diggerId], isSmashing: true },
          };
        });

        setTimeout(() => {
          setAutoDiggerStates((prev) => {
            if (!prev[diggerId]) return prev;

            const ore = ORES[prev[diggerId].currentOre.id];
            const currentOreId = prev[diggerId].currentOre.id;

            createFallingOres(currentOreId);

            setGameState((prevState) => {
              const newDiscoveredOres = new Set(prevState.discoveredOres);
              newDiscoveredOres.add(currentOreId);

              return {
                ...prevState,
                money: prevState.money + ore.value,
                oreInventory: {
                  ...prevState.oreInventory,
                  [currentOreId]: (prevState.oreInventory[currentOreId] || 0) + 1,
                },
                discoveredOres: newDiscoveredOres,
              };
            });

            const [nextOre, ...remaining] = prev[diggerId].upcomingOres;
            const biome = getBiome(gameState.depth);
            const newOre = {
              id: getRandomOre(biome.ores),
              variant: Math.floor(Math.random() * 3) + 1,
            };

            return {
              ...prev,
              [diggerId]: {
                currentOre: nextOre,
                upcomingOres: [...remaining, newOre],
                isSmashing: false,
              },
            };
          });
        }, 200);
      }, mineInterval);

      intervals[diggerId] = interval;
    });

    return () => {
      Object.values(intervals).forEach((interval) => clearInterval(interval));
    };
  }, [gameState.autoDiggers, createFallingOres]);

  // Auto-save every 5 seconds
  useEffect(() => {
    if (!ready || !gameState.playerName) {
      return;
    }

    saveIntervalRef.current = setInterval(() => {
      sendSaveGame(false);
    }, 5000);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [ready, gameState.playerName, sendSaveGame]);

  // Initial setup
  useEffect(() => {
    const init = async () => {
      try {
        const response = await apiClient.init();

        if (response.gameState) {
          setGameState({
            ...response.gameState,
            discoveredOres: response.gameState.discoveredOres || new Set(['dirt']),
            discoveredBiomes: response.gameState.discoveredBiomes || new Set([1]),
            unlockedAchievements: response.gameState.unlockedAchievements || new Set(),
          });

          if (response.gameState.playerName) {
            setPlayerNameInput(response.gameState.playerName);
          }
        }

        if (response.leaderboard) {
          setLeaderboard(response.leaderboard);
        }

        if (response.playerStanding !== null) {
          setPlayerStanding(response.playerStanding);
        }

        setReady(true);
      } catch (error) {
        console.error('Failed to initialize game:', error);
        setReady(true);
      }
    };

    init();
  }, []);

  if (!ready) {
    return (
      <div className="app loading">
        <h1>TheDigger</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="game-box" style={{ backgroundColor: currentBiome.backgroundColor }}>
        {showNamePrompt && (
          <div className="name-overlay">
            <form className="name-content" onSubmit={(event) => handleNameSubmit(event)}>
              <h2 className="name-title">Claim Your Digger Name</h2>
              <p className="name-subtitle">Reserve a unique name to join the global leaderboard.</p>
              <input
                className="name-input"
                value={playerNameInput}
                onChange={(event) => setPlayerNameInput(event.target.value)}
                maxLength={16}
                placeholder="e.g. CoreCrusher"
                disabled={isRegisteringName}
              />
              {playerNameError && <div className="name-error">{playerNameError}</div>}
              <button className="pixel-btn name-submit" type="submit" disabled={isRegisteringName}>
                {isRegisteringName ? 'Registering…' : 'Enter the Mines'}
              </button>
              <p className="name-hint">Names must be unique. Letters, numbers, spaces, dashes, and underscores only.</p>
            </form>
          </div>
        )}

        {showCover && !showNamePrompt && (
          <div className="cover-screen">
            {/* Background decorative elements */}
            <div className="cover-background-elements">
              {/* Background ores - more scattered */}
              {['stone', 'gold', 'emerald', 'ruby', 'diamond', 'iron', 'coal', 'copper', 'stone', 'gold', 'emerald', 'ruby', 'diamond', 'iron'].map((ore, index) => (
                <img
                  key={`cover-ore-${index}`}
                  src={getOreImagePath(ore, (index % 3) + 1)}
                  alt=""
                  className="cover-bg-ore"
                  style={{
                    left: `${(index * 7 + 3) % 95}%`,
                    top: `${(index * 11 + 5) % 90}%`,
                    animationDelay: `${index * 0.4}s`,
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ))}
              {/* Background auto-diggers - more scattered */}
              {AUTO_DIGGERS.map((digger, index) => (
                <img
                  key={`cover-digger-${index}`}
                  src={`/auto-diggers/${digger.name}.png`}
                  alt=""
                  className="cover-bg-digger"
                  style={{
                    right: `${(index * 13 + 8) % 85}%`,
                    bottom: `${(index * 16 + 10) % 80}%`,
                    animationDelay: `${index * 0.6}s`,
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ))}
            </div>

            <div className="cover-content">
              <span className="cover-tagline">Dig. Upgrade. Conquer.</span>
              <h1 className="cover-title">The DiggerMan</h1>
              <div className="cover-character">
                <Character isSmashing={false} onSmashComplete={noop} />
              </div>
              <button className="pixel-btn cover-play-button" onClick={handleEnterGame}>
                <i className="fas fa-play"></i> Play
              </button>
              <p className="cover-subtitle">Descend into the depths and uncover legendary riches.</p>
            </div>
          </div>
        )}

        <div className="falling-ores-container">
          {fallingOres.map((ore) => (
            <img
              key={ore.key}
              src={getOreImagePath(ore.id, ore.variant)}
              alt="falling ore"
              className="falling-ore"
              style={{
                left: `${ore.x}%`,
                animationDelay: `${ore.delay}s`,
                animationDuration: `${ore.duration}s`,
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ))}
        </div>

      <div className="game-header">
        <h1 className="game-title"><i className="fas fa-hammer"></i> THE DIGGER <i className="fas fa-hammer"></i></h1>
        <div className="header-actions">
          <button
            className="pixel-btn icon-btn save-icon"
            title="Save now"
            onClick={handleManualSave}
            disabled={manualSavePending}
          >
            <i className="fas fa-save"></i>
          </button>
          <button
            className="pixel-btn icon-btn leaderboard-icon"
            title="Leaderboard"
            onClick={() => {
              playSelectSound();
              setShowLeaderboard(true);
            }}
          >
            <i className="fas fa-crown"></i>
          </button>
          <button className="pixel-btn menu-btn" onClick={() => { playSelectSound(); setShowMenu(true); }}>
            <i className="fas fa-bars"></i>
          </button>
        </div>
      </div>

      <div className="depth-display">
        <div className="depth-info-row">
          {(() => {
            const nextBiome = BIOMES.find(b => b.minDepth > gameState.depth);
            if (nextBiome) {
              const feetRemaining = Math.ceil(nextBiome.minDepth - gameState.depth);
              return (
                <div className="next-biome-teaser">
                  <div className="teaser-image">
                    <div className="teaser-question">?</div>
                  </div>
                  <div className="teaser-info">
                    <div className="teaser-distance">{formatNumber(feetRemaining)} ft remaining</div>
                  </div>
                </div>
              );
            }
            return <div className="next-biome-teaser"></div>;
          })()}

          <div className="depth-main">
            <div className="depth-label">MONEY EARNED</div>
            <div className="depth-value">
              <span className="depth-number">${formatMoney(gameState.money)}</span>
            </div>
            <div className="depth-secondary">
              <div className="secondary-stat">
                <span className="secondary-label"><i className="fas fa-arrow-down"></i> Depth</span>
                <span className="secondary-value">{formatNumber(Math.floor(gameState.depth))} ft</span>
              </div>
              <div className="secondary-stat">
                <span className="secondary-label"><i className="fas fa-mountain"></i> Biome</span>
                <span className="secondary-value">{currentBiome.name}</span>
              </div>
              <div className="secondary-stat">
                <span className="secondary-label"><i className="fas fa-tachometer-alt"></i> Depth / s</span>
                <span className="secondary-value">{formatDecimal(Math.max(0, approxRates.depthPerSecond))} ft/s</span>
              </div>
              <div className="secondary-stat">
                <span className="secondary-label"><i className="fas fa-coins"></i> Money / s</span>
                <span className="secondary-value">${formatMoney(Math.max(0, approxRates.moneyPerSecond))}/s</span>
              </div>
            </div>
          </div>

          {(() => {
            const nextDigger = AUTO_DIGGERS.find((digger, index) => {
              const ownedDiggers = Object.keys(gameState.autoDiggers).filter(id => gameState.autoDiggers[id] > 0);
              return !ownedDiggers.includes(digger.id);
            });

            if (nextDigger) {
              return (
                <div className="next-digger-teaser">
                  <div className="teaser-image">
                    <img
                      src={`/auto-diggers/${nextDigger.name}.png`}
                      alt="???"
                      className="teaser-digger-img"
                      style={{ filter: 'brightness(0)' }}
                    />
                    <div className="teaser-question">?</div>
                  </div>
                  <div className="teaser-label">NEXT AUTO-DIGGER</div>
                </div>
              );
            }
            return <div className="next-digger-teaser"></div>;
          })()}
        </div>
      </div>

      {/* Menu Modal */}
      <Modal
        isOpen={showMenu}
        onClose={() => { playSelectSound(); setShowMenu(false); }}
        title="MENU"
        icon="fa-bars"
        className="menu-modal"
      >
        <div className="menu-buttons">
          <button className="pixel-btn shop-btn menu-item" onClick={() => { playSelectSound(); setShowMenu(false); setShowShop(true); }}>
            <i className="fas fa-shopping-cart"></i> SHOP
          </button>
          <button className="pixel-btn info-btn menu-item" onClick={() => { playSelectSound(); setShowMenu(false); setShowInfo(true); }}>
            <i className="fas fa-info-circle"></i> INFO
          </button>
          <button className="pixel-btn achievements-btn menu-item" onClick={() => { playSelectSound(); setShowMenu(false); setShowAchievements(true); }}>
            <i className="fas fa-trophy"></i> ACHIEVEMENTS
          </button>
          <button
            className={`pixel-btn audio-btn menu-item ${musicEnabled ? 'enabled' : 'disabled'}`}
            onClick={() => { playSelectSound(); setMusicEnabled(!musicEnabled); }}
          >
            <i className={`fas fa-${musicEnabled ? 'music' : 'volume-mute'}`}></i> MUSIC: {musicEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            className={`pixel-btn audio-btn menu-item ${soundEnabled ? 'enabled' : 'disabled'}`}
            onClick={() => {
              if (soundEnabled) playSelectSoundFast();
              setSoundEnabled(!soundEnabled);
            }}
          >
            <i className={`fas fa-${soundEnabled ? 'volume-up' : 'volume-off'}`}></i> SOUND: {soundEnabled ? 'ON' : 'OFF'}
          </button>
          <button className="pixel-btn reset-btn menu-item" onClick={handleResetGame}>
            <i className="fas fa-redo"></i> RESET GAME
          </button>
        </div>
        {lastSaveTimestamp && (
          <div className="menu-save-status">Last save: {new Date(lastSaveTimestamp).toLocaleTimeString()}</div>
        )}
      </Modal>

      <Modal
        isOpen={showLeaderboard}
        onClose={() => { playSelectSound(); setShowLeaderboard(false); }}
        title="LEADERBOARD"
        icon="fa-crown"
        className="leaderboard-modal"
      >
        <div className="leaderboard-columns">
          {renderLeaderboardColumn(
            leaderboard.filter(entry => entry.money > 0),
            'fa-coins',
            'Most Money Earned',
            (score) => `$${formatMoney(score)}`
          )}
          {renderLeaderboardColumn(
            leaderboard.filter(entry => entry.depth > 0),
            'fa-arrow-down',
            'Deepest Diggers',
            (score) => `${formatNumber(score)} ft`
          )}
        </div>
        <p className="leaderboard-note">Stats save every 5 seconds or when you press Save Now.</p>
      </Modal>

      {/* Info Modal */}
      <Modal
        isOpen={showInfo}
        onClose={() => { playSelectSound(); setShowInfo(false); }}
        title="INFO"
        icon="fa-info-circle"
        className="info-modal"
      >
        <div className="shop-tabs">
          <button
            className={`shop-tab ${infoTab === 'ores' ? 'active' : ''}`}
            onClick={() => { playSelectSound(); setInfoTab('ores'); }}
          >
            <i className="fas fa-gem"></i>
            <span>ORES</span>
          </button>
          <button
            className={`shop-tab ${infoTab === 'biomes' ? 'active' : ''}`}
            onClick={() => { playSelectSound(); setInfoTab('biomes'); }}
          >
            <i className="fas fa-mountain"></i>
            <span>BIOMES</span>
          </button>
        </div>

        <div className="modal-body">
          {infoTab === 'ores' && (
            <div className="ore-list">
              {Object.values(ORES).map((ore) => {
                const isDiscovered = gameState.discoveredOres.has(ore.id);
                return (
                  <div key={ore.id} className={`ore-item rarity-${ore.rarity} ${!isDiscovered ? 'locked' : ''}`}>
                    <img
                      src={isDiscovered ? getOreImagePath(ore.id, 1) : '/ores/Unknown.png'}
                      alt={isDiscovered ? ore.name : '???'}
                      className="ore-icon"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <span className="ore-name">{isDiscovered ? ore.name : '???'}</span>
                    <span className="ore-value">{isDiscovered ? `$${formatNumber(ore.value)}` : '???'}</span>
                    <span className="ore-count">
                      ({gameState.oreInventory[ore.id] || 0} collected)
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {infoTab === 'biomes' && (
            <div className="biome-list">
              {BIOMES.map((biome) => {
                const isDiscovered = gameState.discoveredBiomes.has(biome.id);
                return (
                  <div key={biome.id} className={`biome-item ${!isDiscovered ? 'locked' : ''}`}>
                    <div
                      className="biome-color"
                      style={{ backgroundColor: isDiscovered ? biome.backgroundColor : '#333' }}
                    />
                    <div className="biome-info">
                      <span className="biome-name">{isDiscovered ? biome.name : '???'}</span>
                      <span className="biome-depth">
                        {isDiscovered ? `${formatNumber(biome.minDepth)}ft - ${biome.maxDepth === Infinity ? '∞' : formatNumber(biome.maxDepth) + 'ft'}` : '???'}
                      </span>
                    </div>
                    <span className="biome-status">
                      {isDiscovered ? (currentBiome.id === biome.id ? '📍 Current' : '✓ Discovered') : '🔒 Locked'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <div className="game-content" onClick={handleOreClick} style={{ cursor: 'pointer' }}>
        <div className="background-ores">
          {backgroundOres.map((bgOre) => (
            <img
              key={bgOre.id}
              src={getOreImagePath(bgOre.ore, bgOre.variant)}
              alt="background ore"
              className="background-ore"
              style={{
                left: `${bgOre.x}%`,
                top: `${bgOre.y}%`,
                width: `${bgOre.size}px`,
                height: `${bgOre.size}px`,
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ))}
        </div>

        <div className="dig-area">
          <div className="manual-mining-column">
            <div className="mining-scene">
              <div className="character-container">
                <Character isSmashing={isSmashing} onSmashComplete={handleSmashComplete} />
              </div>

              <div className="ore-container">
                <div className="ore-wrapper">
                  <img
                    src={getOreImagePath(currentOreId, currentOreVariant)}
                    alt={ORES[currentOreId]?.name || 'Ore'}
                    className="current-ore"
                    onError={(e) => {
                      console.error(`Failed to load ore: ${getOreImagePath(currentOreId, currentOreVariant)}`);
                    }}
                  />
                  {sparkParticles.map((spark) => (
                    <img
                      key={spark.key}
                      src={getOreImagePath(spark.id, spark.variant)}
                      alt="spark"
                      className="ore-spark"
                      style={{
                        '--spark-x': `${spark.x}px`,
                        '--spark-y': `${spark.y}px`,
                      } as React.CSSProperties}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ))}
                </div>
                <div className="ore-label">{ORES[currentOreId]?.name || 'Unknown'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shop Modal */}
      <Modal
        isOpen={showShop}
        onClose={() => { playSelectSound(); setShowShop(false); }}
        title="SHOP"
        icon="fas fa-store"
        className="shop-modal"
      >
        <div className="shop-tabs">
          <button
            className={`shop-tab ${shopTab === 'tools' ? 'active' : ''}`}
            onClick={() => { playSelectSound(); setShopTab('tools'); }}
          >
            <i className="fas fa-hammer"></i>
            <span>TOOLS</span>
          </button>
          <button
            className={`shop-tab ${shopTab === 'diggers' ? 'active' : ''}`}
            onClick={() => { playSelectSound(); setShopTab('diggers'); }}
          >
            <i className="fas fa-robot"></i>
            <span>AUTO-DIGGERS</span>
          </button>
        </div>

        <div className="modal-body">
          {shopTab === 'tools' && (
            <div className="shop-section">
              <div className="shop-items">
                {TOOLS.map((tool, index) => {
                  const currentToolIndex = TOOLS.findIndex((t) => t.id === gameState.currentTool);
                  const isOlderTool = index < currentToolIndex;
                  const isCurrentTool = gameState.currentTool === tool.id;
                  const canAfford = gameState.money >= tool.cost;
                  const shouldShow = index === 0 || index <= currentToolIndex + 1;

                  return (
                    <button
                      key={tool.id}
                      className={`tool-item ${canAfford && !isOlderTool && !isCurrentTool && shouldShow ? 'affordable' : 'expensive'} ${!shouldShow ? 'locked' : ''} ${isCurrentTool ? 'owned' : ''} ${isOlderTool ? 'obsolete' : ''}`}
                      onClick={() => shouldShow && buyTool(tool)}
                      disabled={isCurrentTool || isOlderTool || !canAfford || !shouldShow}
                      title={shouldShow ? `${tool.bonusMultiplier}x Money Bonus` : '???'}
                    >
                      <div className="tool-image-container">
                        <img
                          src={shouldShow ? getOreImagePath(tool.oreId, 1) : '/ores/Unknown.png'}
                          alt={shouldShow ? (ORES[tool.oreId]?.name || 'Ore') : '???'}
                          className={`tool-image ${!shouldShow ? 'locked-image' : ''}`}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        {!shouldShow && <div className="tool-locked-overlay">?</div>}
                      </div>
                      <div className="tool-info">
                        <div className="tool-name">
                          {shouldShow ? tool.name : '???'}
                        </div>
                        <div className="tool-stats">
                          {shouldShow ? `${tool.bonusMultiplier}x Money Bonus` : '???'}
                        </div>
                        <div className="tool-cost">
                          {!shouldShow ? '???' : isCurrentTool ? 'EQUIPPED' : isOlderTool ? 'OBSOLETE' : `$${formatNumber(tool.cost)}`}
                        </div>
                      </div>
                      <div className="tool-status">
                        {isCurrentTool ? '✓' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {shopTab === 'diggers' && (
            <div className="shop-section">
              <div className="shop-items">
                {AUTO_DIGGERS.map((digger, index) => {
                  const count = gameState.autoDiggers[digger.id] || 0;
                  const cost = getAutoDiggerCost(digger, count);
                  const canAfford = gameState.money >= cost;
                  const shouldShow = index === 0 || index <= Object.keys(gameState.autoDiggers).filter(id => gameState.autoDiggers[id] > 0).length;
                  const diggerImagePath = `/auto-diggers/${digger.name}.png`;

                  return (
                    <button
                      key={digger.id}
                      className={`digger-item ${canAfford && shouldShow ? 'affordable' : 'expensive'} ${!shouldShow ? 'locked' : ''} ${count > 0 ? 'owned' : ''}`}
                      onClick={() => shouldShow && buyAutoDigger(digger)}
                      disabled={!canAfford || !shouldShow}
                      title={shouldShow ? `+${formatDecimal(digger.depthPerSecond)}ft/s per digger` : '???'}
                    >
                      <div className="digger-image-container">
                        <img
                          src={diggerImagePath}
                          alt={shouldShow ? digger.name : '???'}
                          className={`digger-image ${!shouldShow ? 'locked-image' : ''}`}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        {!shouldShow && <div className="digger-locked-overlay">?</div>}
                      </div>
                      <div className="digger-info">
                        <div className="digger-name">
                          {shouldShow ? digger.name : '???'}
                        </div>
                        <div className="digger-stats">
                          +{shouldShow ? formatDecimal(digger.depthPerSecond) : '???'}ft/s
                        </div>
                        <div className="digger-cost">
                          {shouldShow ? `$${formatNumber(cost)}` : '???'}
                        </div>
                      </div>
                      <div className="digger-count">
                        {count > 0 && shouldShow ? count : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Achievements Modal */}
      <AchievementsModal
        isOpen={showAchievements}
        onClose={() => { playSelectSound(); setShowAchievements(false); }}
        gameState={{
          depth: gameState.depth,
          money: gameState.money,
          totalClicks: gameState.totalClicks,
          currentTool: gameState.currentTool,
          oreInventory: gameState.oreInventory,
          autoDiggers: gameState.autoDiggers,
          discoveredOres: gameState.discoveredOres,
          discoveredBiomes: gameState.discoveredBiomes,
        }}
        unlockedAchievements={gameState.unlockedAchievements}
      />

      {/* Achievement Toast */}
      <AchievementToast
        achievement={currentToastAchievement}
        onClose={() => setCurrentToastAchievement(null)}
      />
      </div>
    </div>
  );
};
