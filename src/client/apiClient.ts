// API client for server communication

export interface GameState {
  depth: number;
  money: number;
  totalClicks: number;
  currentTool: string;
  oreInventory: { [key: string]: number };
  autoDiggers: { [key: string]: number };
  discoveredOres: Set<string>;
  discoveredBiomes: Set<number>;
  unlockedAchievements: Set<string>;
  playerName?: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  depth: number;
  money: number;
}

export interface InitResponse {
  gameState: GameState | null;
  leaderboard: LeaderboardEntry[];
  playerStanding: number | null;
}

export interface SaveResponse {
  success: boolean;
  leaderboard?: LeaderboardEntry[];
  playerStanding?: number | null;
}

export interface RegisterResponse {
  success: boolean;
  playerName?: string;
  error?: string;
}

class APIClient {
  async init(): Promise<InitResponse> {
    try {
      const response = await fetch('/api/init');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // Convert Sets back from arrays
      if (data.gameState) {
        data.gameState.discoveredOres = new Set(data.gameState.discoveredOres || []);
        data.gameState.discoveredBiomes = new Set(data.gameState.discoveredBiomes || []);
        data.gameState.unlockedAchievements = new Set(data.gameState.unlockedAchievements || []);
      }

      return data;
    } catch (error) {
      console.error('Failed to initialize game:', error);
      return {
        gameState: null,
        leaderboard: [],
        playerStanding: null,
      };
    }
  }

  async save(gameState: GameState): Promise<SaveResponse> {
    try {
      // Convert Sets to arrays for JSON serialization
      const serializedState = {
        ...gameState,
        discoveredOres: Array.from(gameState.discoveredOres),
        discoveredBiomes: Array.from(gameState.discoveredBiomes),
        unlockedAchievements: Array.from(gameState.unlockedAchievements),
      };

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameState: serializedState }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to save game:', error);
      return { success: false };
    }
  }

  async reset(): Promise<SaveResponse> {
    try {
      const response = await fetch('/api/reset', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to reset game:', error);
      return { success: false };
    }
  }

  async register(name: string): Promise<RegisterResponse> {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to register player:', error);
      return {
        success: false,
        error: 'Network error occurred',
      };
    }
  }
}

export const apiClient = new APIClient();
