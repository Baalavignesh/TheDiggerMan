import { redis } from '@devvit/web/server';

type LeaderboardEntry = {
  playerName: string;
  money: number;
  depth: number;
  rank: number;
};

export async function getAdminData(postId: string) {
  try {
    // Get all leaderboard data
    const moneyKey = `leaderboard:${postId}:money`;
    const depthKey = `leaderboard:${postId}:depth`;
    const nameIndexKey = `leaderboard:${postId}:name`;

    const [moneyLeaderboard, depthLeaderboard, nameIndex, totalPlayers] = await Promise.all([
      redis.zRange(moneyKey, 0, -1, { by: 'rank', reverse: true }), // Get all entries
      redis.zRange(depthKey, 0, -1, { by: 'rank', reverse: true }),
      redis.hGetAll(nameIndexKey),
      redis.zCard(moneyKey),
    ]);

    // Combine leaderboards
    const playersMap = new Map<string, LeaderboardEntry>();

    moneyLeaderboard.forEach((entry, index) => {
      playersMap.set(entry.member, {
        playerName: entry.member,
        money: entry.score,
        depth: 0,
        rank: index + 1,
      });
    });

    depthLeaderboard.forEach((entry) => {
      const existing = playersMap.get(entry.member);
      if (existing) {
        existing.depth = entry.score;
      } else {
        playersMap.set(entry.member, {
          playerName: entry.member,
          money: 0,
          depth: entry.score,
          rank: 0,
        });
      }
    });

    const players = Array.from(playersMap.values());

    // Get game states for top players
    const gameStates: Record<string, any> = {};
    const samplePlayers = players.slice(0, 10); // Get top 10

    for (const player of samplePlayers) {
      // We need userId to get game state, which we don't have here
      // So we'll skip game state details for now
      gameStates[player.playerName] = 'N/A (userId required)';
    }

    return {
      postId,
      totalPlayers,
      registeredNames: Object.keys(nameIndex || {}).length,
      moneyLeaderboard: players.sort((a, b) => b.money - a.money).slice(0, 20),
      depthLeaderboard: players.sort((a, b) => b.depth - a.depth).slice(0, 20),
      allPlayers: players.sort((a, b) => b.money - a.money),
      nameIndex: nameIndex || {},
    };
  } catch (error) {
    console.error('Error fetching admin data:', error);
    throw error;
  }
}

export function generateAdminHTML(data: any): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TheDigger Admin Panel</title>
  <style>
    body {
      font-family: 'Courier New', monospace;
      background: #1a1a1a;
      color: #00ff00;
      padding: 20px;
      margin: 0;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      color: #ffd700;
      text-align: center;
      text-shadow: 0 0 10px #ffd700;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255, 215, 0, 0.1);
      border: 2px solid #ffd700;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #ffd700;
    }
    .stat-label {
      font-size: 14px;
      color: #aaa;
      margin-top: 5px;
    }
    .section {
      margin-bottom: 40px;
    }
    h2 {
      color: #00ff00;
      border-bottom: 2px solid #00ff00;
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      background: rgba(0, 255, 0, 0.05);
    }
    th {
      background: rgba(0, 255, 0, 0.2);
      color: #ffd700;
      padding: 12px;
      text-align: left;
      border: 1px solid #00ff00;
    }
    td {
      padding: 10px 12px;
      border: 1px solid rgba(0, 255, 0, 0.3);
    }
    tr:hover {
      background: rgba(255, 215, 0, 0.1);
    }
    .rank {
      color: #ffd700;
      font-weight: bold;
    }
    .timestamp {
      color: #888;
      font-size: 12px;
      text-align: center;
      margin-top: 30px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .export-btn {
      background: #ffd700;
      color: #000;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      margin: 10px 5px;
    }
    .export-btn:hover {
      background: #ffed4e;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⛏️ THE DIGGER - Admin Panel ⛏️</h1>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${data.totalPlayers}</div>
        <div class="stat-label">Total Players</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.registeredNames}</div>
        <div class="stat-label">Registered Names</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${formatMoney(data.moneyLeaderboard[0]?.money || 0)}</div>
        <div class="stat-label">Highest Money</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(data.depthLeaderboard[0]?.depth || 0)} ft</div>
        <div class="stat-label">Deepest Dig</div>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 30px;">
      <button class="export-btn" onclick="exportJSON()">📥 Export as JSON</button>
      <button class="export-btn" onclick="exportCSV()">📊 Export as CSV</button>
    </div>

    <div class="grid">
      <div class="section">
        <h2>💰 Top 20 - Most Money</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player Name</th>
              <th>Money</th>
              <th>Depth</th>
            </tr>
          </thead>
          <tbody>
            ${data.moneyLeaderboard.map((player: any, index: number) => `
              <tr>
                <td class="rank">#${index + 1}</td>
                <td>${escapeHtml(player.playerName)}</td>
                <td>$${formatMoney(player.money)}</td>
                <td>${formatNumber(player.depth)} ft</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>⬇️ Top 20 - Deepest Diggers</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player Name</th>
              <th>Depth</th>
              <th>Money</th>
            </tr>
          </thead>
          <tbody>
            ${data.depthLeaderboard.map((player: any, index: number) => `
              <tr>
                <td class="rank">#${index + 1}</td>
                <td>${escapeHtml(player.playerName)}</td>
                <td>${formatNumber(player.depth)} ft</td>
                <td>$${formatMoney(player.money)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2>👥 All Players (${data.allPlayers.length})</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Player Name</th>
            <th>Money</th>
            <th>Depth</th>
          </tr>
        </thead>
        <tbody>
          ${data.allPlayers.slice(0, 100).map((player: any, index: number) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(player.playerName)}</td>
              <td>$${formatMoney(player.money)}</td>
              <td>${formatNumber(player.depth)} ft</td>
            </tr>
          `).join('')}
          ${data.allPlayers.length > 100 ? `
            <tr>
              <td colspan="4" style="text-align: center; color: #888;">
                ... and ${data.allPlayers.length - 100} more players
              </td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    <div class="timestamp">
      Last Updated: ${new Date().toLocaleString()}<br>
      Post ID: ${data.postId}
    </div>
  </div>

  <script>
    const data = ${JSON.stringify(data)};

    function exportJSON() {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'thedigger-data-' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
    }

    function exportCSV() {
      let csv = 'Rank,Player Name,Money,Depth\\n';
      data.allPlayers.forEach((player, index) => {
        csv += \`\${index + 1},"\${player.playerName}",\${player.money},\${player.depth}\\n\`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'thedigger-leaderboard-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
    }
  </script>
</body>
</html>
`;

  function formatMoney(num: number): string {
    if (num < 1000) return Math.floor(num).toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num < 1000000000000000) return (num / 1000000000000).toFixed(1) + 'T';
    return (num / 1000000000000000).toFixed(1) + 'Q';
  }

  function formatNumber(num: number): string {
    return Math.floor(num).toLocaleString();
  }

  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m] || m);
  }
}
