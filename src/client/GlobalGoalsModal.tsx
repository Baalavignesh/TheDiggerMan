import React, { useEffect, useState } from 'react';
import Modal from './Modal';

type GlobalGoalsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Goal = {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  reward: string;
  percentage: number;
  completed: boolean;
};

const GlobalGoalsModal: React.FC<GlobalGoalsModalProps> = ({ isOpen, onClose }) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchGoals();
      // Refresh every 15 seconds while open
      const interval = setInterval(fetchGoals, 15000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/global-goals');
      if (response.ok) {
        const data = await response.json();
        setGoals(data.goals || []);
      }
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num < 1000) return Math.floor(num).toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B';
    return (num / 1000000000000).toFixed(1) + 'T';
  };

  const getGoalIcon = (goalId: string): string => {
    switch (goalId) {
      case 'depth':
        return '⬇️';
      case 'ores':
        return '💎';
      case 'money':
        return '💰';
      default:
        return '🎯';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Community Goals"
      icon="fa-bullseye"
      className="global-goals-modal"
    >
      <div className="global-goals-content">
        {loading && goals.length === 0 ? (
          <div className="loading-goals">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Loading goals...</p>
          </div>
        ) : (
          <div className="goals-list">
            {goals.map((goal, index) => (
              <div
                key={goal.id}
                className={`goal-card ${goal.completed ? 'completed' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="goal-header-row">
                  <div className="goal-icon-name">
                    <div className="goal-icon">{getGoalIcon(goal.id)}</div>
                    <div className="goal-text">
                      <div className="goal-name">{goal.name}</div>
                      <div className="goal-target-label">Target {formatNumber(goal.target)} {goal.unit}</div>
                    </div>
                  </div>
                  {goal.completed && <div className="goal-completed-badge">Completed</div>}
                </div>

                <div className="goal-progress-section">
                  <div className="goal-stats">
                    <span className="goal-current">{formatNumber(goal.current)}</span>
                    <span className="goal-stats-label">of {formatNumber(goal.target)} {goal.unit}</span>
                  </div>
                  <div className="goal-progress-bar">
                    <div className="goal-progress-fill" style={{ width: `${goal.percentage}%` }}>
                      {goal.percentage > 8 && <span className="goal-percentage">{goal.percentage}%</span>}
                    </div>
                  </div>
                </div>

                <div className="goal-reward">
                  <span className="goal-reward-label">Reward</span>
                  <span className="goal-reward-text">{goal.reward}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default GlobalGoalsModal;
