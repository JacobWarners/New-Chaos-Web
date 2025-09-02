// client/src/components/TimerDisplay.jsx
import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

function formatTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60); // Ensure seconds are integer
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function TimerDisplay({ endTime }) { // endTime is a Unix timestamp in seconds
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (endTime === null || typeof endTime === 'undefined') {
      // Timer is not active or has been cleared
      setRemainingSeconds(0);
      setIsExpired(true); // Or a different state like 'not_active'
      return;
    }

    let intervalId;

    const calculateRemaining = () => {
      const now = Date.now() / 1000; // Current time in seconds
      const secondsLeft = endTime - now;
      
      if (secondsLeft <= 0) {
        setRemainingSeconds(0);
        setIsExpired(true);
        if (intervalId) clearInterval(intervalId); // Stop interval once expired
      } else {
        setRemainingSeconds(secondsLeft);
        setIsExpired(false);
      }
    };

    calculateRemaining(); // Initial calculation
    intervalId = setInterval(calculateRemaining, 1000); // Update every second

    return () => clearInterval(intervalId); // Cleanup interval on unmount or endTime change
  }, [endTime]);

  const timerText = useMemo(() => {
    if (endTime === null || typeof endTime === 'undefined') {
      return "Session Time: Not Active";
    }
    if (isExpired) {
      return "Time Remaining: EXPIRED";
    }
    return `Time Remaining: ${formatTime(remainingSeconds)}`;
  }, [endTime, isExpired, remainingSeconds]);

  const timerColor = useMemo(() => {
    if (endTime === null || typeof endTime === 'undefined' || isExpired) {
      return '#fb4934'; // Gruvbox red for expired/inactive
    }
    if (remainingSeconds < 5 * 60) { // Under 5 minutes
        return '#fabd2f'; // Gruvbox yellow for warning
    }
    return '#b8bb26'; // Gruvbox green for normal
  }, [endTime, isExpired, remainingSeconds]);


  return (
    <span style={{ color: timerColor, fontFamily: 'var(--primary-font)', marginRight: '20px', fontWeight: 'bold' }}>
      {timerText}
    </span>
  );
}

TimerDisplay.propTypes = {
  endTime: PropTypes.number, // Unix timestamp in seconds, can be null or undefined
};

export default React.memo(TimerDisplay); // Memoize for performance
