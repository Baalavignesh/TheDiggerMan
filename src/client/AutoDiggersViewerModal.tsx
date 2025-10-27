import React, { useMemo } from 'react';
import Modal from './Modal';
import { AUTO_DIGGERS, getAutoDiggerCost } from './gameData';
import type { AutoDigger } from './gameData';

type AutoDiggersViewerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  autoDiggers: { [key: string]: number };
  currentMoney: number;
  onBuyAutoDigger: (digger: AutoDigger, count: number) => void;
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

const AutoDiggersViewerModal: React.FC<AutoDiggersViewerModalProps> = ({
  isOpen,
  onClose,
  autoDiggers,
  currentMoney,
  onBuyAutoDigger,
}) => {
  // Get owned auto-diggers
  const ownedDiggers = useMemo(() => {
    return AUTO_DIGGERS.filter((digger) => (autoDiggers[digger.id] || 0) > 0).map((digger) => ({
      ...digger,
      count: autoDiggers[digger.id] || 0,
    }));
  }, [autoDiggers]);

  const MAX_DISPLAY_COUNT = 20; // Cap at 20 visible images per row

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="MY AUTO-DIGGERS"
      icon="fa-robot"
      className="auto-diggers-viewer-modal"
    >
      <div className="auto-diggers-viewer-content">
        {ownedDiggers.length === 0 ? (
          <div className="no-diggers-message">
            <i className="fas fa-info-circle"></i>
            <p>You don't own any auto-diggers yet!</p>
            <p className="hint">Visit the shop to purchase your first auto-digger.</p>
          </div>
        ) : (
          <div className="diggers-rows">
            {ownedDiggers.map((digger, rowIndex) => {
              const displayCount = Math.min(digger.count, MAX_DISPLAY_COUNT);
              const totalProduction = digger.depthPerSecond * digger.count;

              const cost = getAutoDiggerCost(digger, digger.count);
              const canAfford = currentMoney >= cost;

              return (
                <div key={digger.id} className="digger-row" style={{ animationDelay: `${rowIndex * 0.1}s` }}>
                  <div className="digger-row-visuals">
                    <div className="digger-images-container">
                      {Array.from({ length: displayCount }, (_, i) => (
                        <img
                          key={i}
                          src={`/auto-diggers/${digger.name}.png`}
                          alt={digger.name}
                          className="digger-stack-image"
                          style={{
                            left: `${i * 3}%`,
                            top: `${(i % 2) * 10}px`, // Zigzag effect
                            zIndex: i,
                            animationDelay: `${i * 0.05}s`,
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ))}
                      {digger.count > MAX_DISPLAY_COUNT && (
                        <div className="digger-overflow-indicator">
                          +{formatNumber(digger.count - MAX_DISPLAY_COUNT)} more
                        </div>
                      )}
                                          <div className="digger-info-section">
                      <button
                        className={`digger-single-buy-btn ${canAfford ? 'affordable' : 'expensive'}`}
                        onClick={() => canAfford && onBuyAutoDigger(digger, 1)}
                        disabled={!canAfford}
                        title={`Buy 1 for $${formatNumber(cost)}`}
                      >
                        <span className="buy-cost">${formatNumber(cost)}</span>
                      </button>
                      <div className="digger-row-stats">
                        <span className="digger-count-stat">×{formatNumber(digger.count)}</span>
                        <span className="digger-production">
                          <i className="fas fa-arrow-down"></i> {formatDecimal(totalProduction)} ft/s
                        </span>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AutoDiggersViewerModal;
