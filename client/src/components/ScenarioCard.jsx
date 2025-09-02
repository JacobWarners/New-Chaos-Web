import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './ScenarioCard.module.css'; // Or your relevant CSS import

const API_BASE_URL = import.meta.env.VITE_APP_BASE_URL || 'http://localhost:5000';

const DEFAULT_GUIDE_URL = "https://www.notion.so/wekaio/CEL-All-Info-Page-12930b0d101c80f8bdc0e188ea994709";

// Define your Notion page URLs (or other external URLs) here
// Only include entries for scenarios that have a SPECIFIC guide.
// If a scenario is not listed here, it will use DEFAULT_GUIDE_URL.
const SCENARIO_SPECIFIC_GUIDE_URLS = {
  "setup-weka": "https://www.notion.so/wekaio/Setup-Weka-a3fce840985a4bb9b24ba521924c671c",
  "weka-fully-installed": "https://www.notion.so/wekaio/Weka-Fully-Installed-588a732407e1490999d7a293967f734f", // Replace
  "TA-Tool": "https://www.notion.so/wekaio/TA-Tool-Testing-1fa30b0d101c80d88063e6518b63d173"// Replace
  // Add other scenarios with specific guides here.
  // Do NOT add a "default-guide" key here if you want the global DEFAULT_GUIDE_URL to be the true fallback.
};

function ScenarioCard({ label, repo, onStartScenario }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleStartClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    console.log(`Starting scenario: ${repo}`);

    // --- OPEN GUIDE PAGE (Notion or other external URL) ---
    // Use the specific guide if available, otherwise use the DEFAULT_GUIDE_URL
    const guideUrl = SCENARIO_SPECIFIC_GUIDE_URLS[repo] || DEFAULT_GUIDE_URL;
    
    window.open(guideUrl, '_blank', 'noopener,noreferrer');
    console.log(`Opened guide: ${guideUrl}`);
    // --- END OPEN GUIDE PAGE ---

    try {
      const response = await fetch(`${API_BASE_URL}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      });

      console.log(`Response status from /api/scenarios: ${response.status}`);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        }
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Scenario initialized by backend:', data);

      if (data.sessionId && data.websocketPath) {
        onStartScenario(repo, data.sessionId, data.websocketPath);
      } else {
        console.error("Server response missing session ID or WebSocket path.", data);
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
    <div className="weka-scenario-card">
      <h3>{label}</h3>
      {loading ? (
        <div className="weka-scenario-card-loading">
          <FontAwesomeIcon icon="fa-solid fa-circle-notch" spin size="2x" />
          <p>Preparing scenario...May take 2-5 minutes</p>
        </div>
      ) : (
        <button className="weka-scenario-card-button" onClick={handleStartClick}>
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
  onStartScenario: PropTypes.func.isRequired,
};

export default ScenarioCard;
