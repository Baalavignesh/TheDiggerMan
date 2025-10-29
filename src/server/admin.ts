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
    const globalClicksKey = `stats:${postId}:globalClicks`;

    const [moneyLeaderboard, depthLeaderboard, nameIndex, totalPlayers, globalClicksStr] = await Promise.all([
      redis.zRange(moneyKey, 0, -1, { by: 'rank', reverse: true }), // Get all entries
      redis.zRange(depthKey, 0, -1, { by: 'rank', reverse: true }),
      redis.hGetAll(nameIndexKey),
      redis.zCard(moneyKey),
      redis.get(globalClicksKey),
    ]);

    const globalClicks = globalClicksStr ? parseInt(globalClicksStr, 10) : 0;

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
      globalClicks,
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
        <div class="stat-label">Total Miners</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(data.globalClicks)}</div>
        <div class="stat-label">Global Clicks</div>
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
      <button class="export-btn" onclick="recalculateClicks()">🔢 Recalculate Global Clicks</button>
      <button class="export-btn" onclick="showMigrateDialog()">✏️ Manually Set Clicks</button>
    </div>

    <div id="migrateDialog" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2a2a2a; padding: 30px; border: 3px solid #ffd700; border-radius: 10px; z-index: 1000; box-shadow: 0 10px 50px rgba(0,0,0,0.8);">
      <h3 style="color: #ffd700; margin-top: 0;">Set Global Clicks Counter</h3>
      <p style="color: #aaa; margin-bottom: 20px;">Current value: <strong style="color: #00ff00;">${formatNumber(data.globalClicks)}</strong></p>
      <p style="color: #aaa; margin-bottom: 20px; font-size: 13px;">⚠️ This will overwrite the current global clicks counter. Use this for manual migration or correction.</p>
      <input type="number" id="migrateClicksInput" placeholder="Enter total clicks" style="width: 100%; padding: 10px; margin-bottom: 15px; background: #1a1a1a; border: 2px solid #ffd700; color: #00ff00; font-size: 16px; border-radius: 5px;" />
      <div style="display: flex; gap: 10px;">
        <button class="export-btn" onclick="executeMigration()" style="flex: 1;">✅ Set Value</button>
        <button class="export-btn" onclick="closeMigrateDialog()" style="flex: 1; background: #666;">❌ Cancel</button>
      </div>
      <div id="migrateStatus" style="margin-top: 15px; padding: 10px; border-radius: 5px; display: none;"></div>
    </div>
    <div id="migrateOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 999;" onclick="closeMigrateDialog()"></div>

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

    async function recalculateClicks() {
      if (!confirm('This will recalculate global clicks from all players who have saved their game. Continue?')) {
        return;
      }

      try {
        const response = await fetch('/internal/recalculate-global-clicks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.status === 'success') {
          alert(\`✅ Success!\\n\\nGlobal clicks recalculated: \${result.totalClicks.toLocaleString()}\\nPlayers scanned: \${result.playersScanned}\\n\\nPage will reload.\`);
          location.reload();
        } else if (result.status === 'info') {
          alert(\`ℹ️ Info\\n\\n\${result.message}\\n\\nPlayers need to save their game at least once after this update.\`);
        } else {
          alert('❌ Error: ' + result.message);
        }
      } catch (error) {
        alert('❌ Error recalculating clicks: ' + error.message);
      }
    }

    function showMigrateDialog() {
      document.getElementById('migrateDialog').style.display = 'block';
      document.getElementById('migrateOverlay').style.display = 'block';
      document.getElementById('migrateClicksInput').value = '';
      document.getElementById('migrateStatus').style.display = 'none';
    }

    function closeMigrateDialog() {
      document.getElementById('migrateDialog').style.display = 'none';
      document.getElementById('migrateOverlay').style.display = 'none';
    }

    async function executeMigration() {
      const input = document.getElementById('migrateClicksInput');
      const statusDiv = document.getElementById('migrateStatus');
      const value = parseInt(input.value, 10);

      if (isNaN(value) || value < 0) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 0, 0, 0.2)';
        statusDiv.style.border = '1px solid #ff0000';
        statusDiv.style.color = '#ff0000';
        statusDiv.textContent = '❌ Please enter a valid non-negative number';
        return;
      }

      try {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 215, 0, 0.2)';
        statusDiv.style.border = '1px solid #ffd700';
        statusDiv.style.color = '#ffd700';
        statusDiv.textContent = '⏳ Updating global clicks counter...';

        const response = await fetch('/internal/update-global-clicks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ totalClicks: value })
        });

        const result = await response.json();

        if (result.status === 'success') {
          statusDiv.style.background = 'rgba(0, 255, 0, 0.2)';
          statusDiv.style.border = '1px solid #00ff00';
          statusDiv.style.color = '#00ff00';
          statusDiv.textContent = \`✅ Success! Global clicks set to \${value.toLocaleString()}\`;

          setTimeout(() => {
            location.reload();
          }, 2000);
        } else {
          throw new Error(result.message || 'Unknown error');
        }
      } catch (error) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 0, 0, 0.2)';
        statusDiv.style.border = '1px solid #ff0000';
        statusDiv.style.color = '#ff0000';
        statusDiv.textContent = '❌ Error: ' + error.message;
      }
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
