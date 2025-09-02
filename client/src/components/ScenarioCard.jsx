import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// Corrected path to start from the current directory
import { useScenarioContext } from './context/ScenarioContext'; 
import styles from './ScenarioCard.module.css';

const API_BASE_URL = import.meta.env.VITE_APP_BASE_URL || 'http://localhost:5000';
const DEFAULT_GUIDE_URL = "https://www.notion.so/wekaio/CEL-All-Info-Page-12930b0d101c80f8bdc0e188ea994709";

const SCENARIO_SPECIFIC_GUIDE_URLS = {
  "setup-weka": "https://www.notion.so/wekaio/Setup-Weka-a3fce840985a4bb9b24ba521924c671c",
  // ... other URLs
};

function ScenarioCard({ label, repo }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { onStartScenario } = useScenarioContext(); // Get the start function from context

  const handleStartClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const guideUrl = SCENARIO_SPECIFIC_GUIDE_URLS[repo] || DEFAULT_GUIDE_URL;
    window.open(guideUrl, '_blank', 'noopener,noreferrer');

    try {
      const response = await fetch(`${API_BASE_URL}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
        throw new Error(errorData.error);
      }

      const data = await response.json();
      if (data.sessionId && data.websocketPath) {
        onStartScenario(repo, data.sessionId, data.websocketPath);
      } else {
        throw new Error("Server response missing session ID or WebSocket path.");
      }
    } catch (err) {
      console.error("Failed to start scenario:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repo, onStartScenario]);

  return (
    <div className={styles.card}>
      <h3>{label}</h3>
      {loading ? (
        <div className={styles.card_loading}>
          <FontAwesome-icon icon="fa-solid fa-circle-notch" spin size="2x" />
          <p>Preparing scenario...</p>
        </div>
      ) : (
        <button className={styles.card_button} onClick={handleStartClick}>
          Start Scenario & Open Guide
        </button>
      )}
      {error && <p style={{ color: 'red', marginTop: '0.5em' }}>Error: {error}</p>}
    </div>
  );
}

ScenarioCard.propTypes = {
  label: PropTypes.string.isRequired,
  repo: PropTypes.string.isRequired,
};

export default ScenarioCard;
