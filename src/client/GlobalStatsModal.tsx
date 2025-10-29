import React, { useEffect, useState } from 'react';
import Modal from './Modal';

type GlobalStatsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type GlobalStats = {
  totalPlayers: number;
  globalClicks: number;
};

// Format large numbers for display
function formatNumber(num: number): string {
  if (num < 1000) return Math.floor(num).toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
  if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num < 1000000000000000) return (num / 1000000000000).toFixed(1) + 'T';
  return (num / 1000000000000000).toFixed(1) + 'Q';
}

const GlobalStatsModal: React.FC<GlobalStatsModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !stats) {
      fetchGlobalStats();
    }
  }, [isOpen]);

  const fetchGlobalStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/global-stats');
      if (!response.ok) {
        throw new Error('Failed to fetch global stats');
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching global stats:', err);
      setError('Failed to load global statistics');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="GLOBAL STATISTICS" icon="fa-globe" className="global-stats-modal">
      <div className="global-stats-content">
        {loading && (
          <div className="loading-message">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Loading global statistics...</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
          </div>
        )}

        {stats && !loading && !error && (
          <div className="stats-grid">
            <div className="stat-card-global">
              <div className="stat-icon">
                <i className="fas fa-users"></i>
              </div>
              <div className="stat-details">
                <div className="stat-value-global">{formatNumber(stats.totalPlayers)}</div>
                <div className="stat-label-global">Total Miners</div>
              </div>
            </div>

            <div className="stat-card-global">
              <div className="stat-icon">
                <i className="fas fa-mouse-pointer"></i>
              </div>
              <div className="stat-details">
                <div className="stat-value-global">{formatNumber(stats.globalClicks)}</div>
                <div className="stat-label-global">Global Clicks</div>
              </div>
            </div>
          </div>
        )}

        <div className="global-stats-footer">
          <p className="info-text">
            <i className="fas fa-info-circle"></i>
            These statistics represent the combined efforts of all players in this game.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default GlobalStatsModal;
