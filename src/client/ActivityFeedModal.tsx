import React, { useEffect, useState } from 'react';
import Modal from './Modal';

type ActivityFeedModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Activity = {
  playerName: string;
  activityType: string;
  details: any;
  timestamp: number;
};

const ActivityFeedModal: React.FC<ActivityFeedModalProps> = ({ isOpen, onClose }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchActivities();
      // Refresh every 10 seconds while open
      const interval = setInterval(fetchActivities, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/recent-activities');
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityMessage = (activity: Activity): string => {
    const { activityType, details } = activity;

    switch (activityType) {
      case 'first_ore':
        return `discovered ${details.oreName} for the first time! 💎`;
      case 'depth_milestone':
        return `reached ${details.depth.toLocaleString()}ft depth! ⬇️`;
      case 'money_milestone':
        return `earned $${formatNumber(details.money)}! 💰`;
      case 'tool_purchase':
        return `purchased ${details.toolName}! ⛏️`;
      case 'auto_digger_purchase':
        return `bought ${details.diggerName}! 🤖`;
      case 'achievement_unlock':
        return `unlocked "${details.achievementName}" achievement! 🏆`;
      case 'biome_discover':
        return `discovered ${details.biomeName} biome! 🌍`;
      default:
        return `did something cool! ✨`;
    }
  };

  const getActivityIcon = (activityType: string): string => {
    switch (activityType) {
      case 'first_ore':
        return '💎';
      case 'depth_milestone':
        return '⬇️';
      case 'money_milestone':
        return '💰';
      case 'tool_purchase':
        return '⛏️';
      case 'auto_digger_purchase':
        return '🤖';
      case 'achievement_unlock':
        return '🏆';
      case 'biome_discover':
        return '🌍';
      default:
        return '✨';
    }
  };

  const formatNumber = (num: number): string => {
    if (num < 1000) return Math.floor(num).toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B';
    return (num / 1000000000000).toFixed(1) + 'T';
  };

  const getTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="LIVE ACTIVITY FEED"
      icon="fa-comments"
      className="activity-feed-modal"
    >
      <div className="activity-feed-content">
        {loading && activities.length === 0 ? (
          <div className="loading-activities">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Loading activities...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="no-activities">
            <i className="fas fa-info-circle"></i>
            <p>No recent activities yet!</p>
            <p className="hint">Be the first to make some progress!</p>
          </div>
        ) : (
          <div className="activities-list">
            {activities.map((activity, index) => (
              <div key={`${activity.timestamp}-${index}`} className="activity-item" style={{ animationDelay: `${index * 0.05}s` }}>
                <div className="activity-icon">{getActivityIcon(activity.activityType)}</div>
                <div className="activity-details">
                  <div className="activity-message">
                    <span className="player-name">{activity.playerName}</span>{' '}
                    {getActivityMessage(activity)}
                  </div>
                  <div className="activity-time">{getTimeAgo(activity.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ActivityFeedModal;
