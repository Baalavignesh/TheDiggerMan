// Helper functions for community features

export async function postActivity(
  playerName: string,
  activityType: string,
  details: any = {}
): Promise<void> {
  try {
    await fetch('/api/post-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, activityType, details }),
    });
  } catch (error) {
    console.error('Failed to post activity:', error);
  }
}

export async function contributeToGoals(depth: number, ores: number, money: number): Promise<void> {
  try {
    await fetch('/api/contribute-to-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depth, ores, money }),
    });
  } catch (error) {
    console.error('Failed to contribute to goals:', error);
  }
}

// Track milestones to avoid duplicate posts
export class MilestoneTracker {
  private tracked = new Set<string>();

  shouldTrack(key: string): boolean {
    if (this.tracked.has(key)) {
      return false;
    }
    this.tracked.add(key);
    return true;
  }

  hasTracked(key: string): boolean {
    return this.tracked.has(key);
  }
}
