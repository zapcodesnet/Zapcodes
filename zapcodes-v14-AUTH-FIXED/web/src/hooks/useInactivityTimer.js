/**
 * useInactivityTimer.js
 * Auto-logs out user after inactivity.
 * Mobile / Tablet / iPad  →  12 hours
 * PC / Laptop / Mac       →  1 hour
 *
 * Also keeps mobile users logged in across app restarts
 * as long as last activity was within 12 hours.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const LAST_ACTIVITY_KEY = 'zc_last_activity';

function detectDeviceType() {
  try {
    const ua = navigator.userAgent || '';
    const isMobileUA = /iPad|iPhone|iPod|Android|Tablet|Mobile/i.test(ua);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
    return (isMobileUA || isSmallScreen) ? 'mobile' : 'desktop';
  } catch {
    return 'desktop';
  }
}

function getTimeoutMs(deviceType) {
  return deviceType === 'mobile'
    ? 12 * 60 * 60 * 1000  // 12 hours for mobile/tablet
    :  1 * 60 * 60 * 1000; //  1 hour  for desktop
}

export function useInactivityTimer(isAuthenticated) {
  const navigate   = useNavigate();
  const timerRef   = useRef(null);
  const deviceType = useRef(detectDeviceType());

  const doLogout = useCallback(() => {
    try { localStorage.removeItem('token'); } catch {}
    try { localStorage.removeItem('zc_last_activity'); } catch {}
    navigate('/login?reason=inactivity');
  }, [navigate]);

  const recordActivity = useCallback(() => {
    try { localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString()); } catch {}
  }, []);

  const resetTimer = useCallback(() => {
    recordActivity();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doLogout, getTimeoutMs(deviceType.current));
  }, [doLogout, recordActivity]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const dt = detectDeviceType();
    deviceType.current = dt;

    // On app load — check if mobile user was inactive too long before opening the app
    const lastActivity = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    if (lastActivity > 0) {
      const elapsed = Date.now() - lastActivity;
      if (elapsed > getTimeoutMs(dt)) {
        doLogout();
        return;
      }
    }

    // Start the inactivity timer
    resetTimer();

    // Listen for user activity
    const events = [
      'mousemove', 'mousedown', 'click', 'scroll',
      'keypress', 'keydown', 'touchstart', 'touchmove', 'wheel',
    ];
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    // Pause/resume timer on tab visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible — check if too long has passed
        const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
        if (last > 0 && (Date.now() - last) > getTimeoutMs(deviceType.current)) {
          doLogout();
        } else {
          resetTimer();
        }
      } else {
        // Tab hidden — pause timer to save resources
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, doLogout, resetTimer]);
}

/** Call this immediately after every successful login */
export function recordLoginActivity() {
  try { localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString()); } catch {}
}

/** Returns true if mobile session is still valid (< 12 hrs inactive) */
export function isMobileSessionValid() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    const dt = detectDeviceType();
    if (dt !== 'mobile') return true; // Desktop always validates via JWT
    const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    if (!last) return true; // No record yet — allow, timer will start
    return (Date.now() - last) < getTimeoutMs('mobile');
  } catch {
    return true;
  }
}
