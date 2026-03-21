// web/src/hooks/useVisitorTracking.js
// Fires a single tracking call on every page navigation
// Records page path, referrer, device fingerprint, and referral code

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';

// Get or create a persistent fingerprint for this browser
function getFingerprint() {
  try {
    let fp = localStorage.getItem('zc_visitor_fp');
    if (!fp) {
      fp = 'fp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('zc_visitor_fp', fp);
    }
    return fp;
  } catch {
    return 'fp_' + Math.random().toString(36).slice(2, 12);
  }
}

// Get referral code from URL if present
function getRefFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || '';
  } catch { return ''; }
}

export default function useVisitorTracking() {
  const location = useLocation();

  useEffect(() => {
    // Small delay to avoid blocking page render
    const timer = setTimeout(() => {
      try {
        api.post('/api/track/visit', {
          page: location.pathname,
          referrer: document.referrer || '',
          fingerprint: getFingerprint(),
          platform: 'zapcodes',
          referralCode: getRefFromUrl(),
          usedGuestBuilder: false,
        }).catch(() => {}); // Never block on tracking failure
      } catch {
        // Silently fail
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [location.pathname]); // Re-fire on every route change
}
