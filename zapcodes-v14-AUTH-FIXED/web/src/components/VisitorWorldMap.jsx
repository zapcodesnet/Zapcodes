import React, { useState, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════
// VisitorWorldMap — Real interactive map using Leaflet.js
// Loads Leaflet from CDN (free, no API key needed)
// Uses CartoDB Dark Matter tiles for proper dark world map
// ═══════════════════════════════════════════════════════════

const COUNTRY_CENTROIDS = {
  US: [39.8, -98.5], CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-14.2, -51.9],
  AR: [-38.4, -63.6], CO: [4.6, -74.3], CL: [-35.7, -71.5], PE: [-9.2, -75.0],
  GB: [55.4, -3.4], DE: [51.2, 10.4], FR: [46.2, 2.2], IT: [41.9, 12.6],
  ES: [40.5, -3.7], PT: [39.4, -8.2], NL: [52.1, 5.3], BE: [50.5, 4.5],
  SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5], FI: [61.9, 25.7],
  PL: [51.9, 19.1], CH: [46.8, 8.2], AT: [47.5, 14.6], RO: [45.9, 24.9],
  UA: [48.4, 31.2], RU: [61.5, 105.3], TR: [39.0, 35.2], GR: [39.1, 21.8],
  IN: [20.6, 79.0], CN: [35.9, 104.2], JP: [36.2, 138.3], KR: [35.9, 128.0],
  PH: [12.9, 121.8], VN: [14.1, 108.3], TH: [15.9, 100.9], MY: [4.2, 101.9],
  SG: [1.4, 103.8], ID: [-0.8, 113.9], AU: [-25.3, 133.8], NZ: [-40.9, 174.9],
  ZA: [-30.6, 22.9], NG: [9.1, 8.7], KE: [-0.0, 37.9], EG: [26.8, 30.8],
  SA: [23.9, 45.1], AE: [23.4, 53.8], IL: [31.0, 34.9], PK: [30.4, 69.3],
  BD: [23.7, 90.4], TW: [23.7, 121.0], HK: [22.4, 114.1], IE: [53.4, -8.2],
  CZ: [49.8, 15.5], HU: [47.2, 19.5], MM: [19.7, 96.1], LK: [7.9, 80.8],
  NP: [28.4, 84.1], QA: [25.4, 51.2], KW: [29.3, 47.5], XX: [0, 0],
};

function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) { resolve(window.L); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => resolve(window.L);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    } else {
      const check = setInterval(() => { if (window.L) { clearInterval(check); resolve(window.L); } }, 100);
      setTimeout(() => { clearInterval(check); resolve(null); }, 10000);
    }
  });
}

export default function VisitorWorldMap({ visitorData, style }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const [leafletReady, setLeafletReady] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const points = (visitorData || []).map(v => {
    const code = v._id?.countryCode || v.countryCode || 'XX';
    const country = v._id?.country || v.country || 'Unknown';
    const count = v.count || 0;
    const lat = v.lat || v._id?.latitude || (COUNTRY_CENTROIDS[code] ? COUNTRY_CENTROIDS[code][0] : null);
    const lng = v.lng || v._id?.longitude || (COUNTRY_CENTROIDS[code] ? COUNTRY_CENTROIDS[code][1] : null);
    if (lat == null || lng == null) return null;
    return { lat, lng, code, country, count };
  }).filter(Boolean);

  const totalVisitors = points.reduce((s, p) => s + p.count, 0);
  const maxCount = Math.max(...points.map(p => p.count), 1);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !L || !mapRef.current) { if (!L) setError('Failed to load map'); return; }
      setLeafletReady(true);
      if (mapInstance.current) return;
      const map = L.map(mapRef.current, { center: [20, 0], zoom: 2, minZoom: 2, maxZoom: 18, zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution('<a href="https://www.openstreetmap.org/" style="color:#555;font-size:9px">OSM</a> · <a href="https://carto.com/" style="color:#555;font-size:9px">CARTO</a>').addTo(map);
      mapInstance.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !window.L) return;
    const L = window.L; const map = mapInstance.current;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    if (points.length === 0) return;

    points.forEach(p => {
      const size = Math.max(8, Math.min(45, (p.count / maxCount) * 45));
      const opacity = 0.45 + (p.count / maxCount) * 0.55;

      const glow = L.circleMarker([p.lat, p.lng], { radius: size + 8, fillColor: '#6366f1', fillOpacity: opacity * 0.12, stroke: false });
      glow.addTo(map); markersRef.current.push(glow);

      const marker = L.circleMarker([p.lat, p.lng], { radius: size, fillColor: '#6366f1', fillOpacity: opacity, color: '#a5b4fc', weight: 1.5 }).addTo(map);
      marker.bindTooltip(
        '<div style="font-family:system-ui;min-width:130px">' +
        '<div style="font-weight:800;font-size:14px;margin-bottom:3px">' + p.country + '</div>' +
        '<div style="font-size:22px;font-weight:900;color:#6366f1;margin-bottom:2px">' + p.count.toLocaleString() + '</div>' +
        '<div style="color:#888;font-size:11px">visitors · ' + (totalVisitors > 0 ? ((p.count / totalVisitors) * 100).toFixed(1) : 0) + '% share</div></div>',
        { direction: 'top', offset: [0, -size - 4], className: 'zc-map-tooltip' }
      );
      marker.on('click', () => { setSelectedCountry(p); map.flyTo([p.lat, p.lng], 5, { duration: 0.8 }); });

      if (size > 12) {
        const label = L.divIcon({ className: 'zc-map-label', html: '<span style="color:#fff;font-size:' + Math.max(9, size * 0.45) + 'px;font-weight:800;text-shadow:0 1px 4px rgba(0,0,0,0.9)">' + (p.count > 9999 ? (p.count / 1000).toFixed(0) + 'K' : p.count > 999 ? (p.count / 1000).toFixed(1) + 'K' : p.count) + '</span>', iconSize: [size * 2, size * 2], iconAnchor: [size, size] });
        const lm = L.marker([p.lat, p.lng], { icon: label, interactive: false }).addTo(map);
        markersRef.current.push(lm);
      }
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 5 });
    }
  }, [points.length, leafletReady]);

  useEffect(() => {
    if (document.getElementById('zc-map-styles')) return;
    const el = document.createElement('style'); el.id = 'zc-map-styles';
    el.textContent = '.zc-map-tooltip{background:#11111b !important;border:1px solid #2a2f4a !important;border-radius:12px !important;box-shadow:0 8px 32px rgba(0,0,0,0.6) !important;padding:10px 14px !important;color:#e8e8f0 !important}.zc-map-tooltip::before{border-top-color:#11111b !important}.zc-map-label{background:none !important;border:none !important;display:flex;align-items:center;justify-content:center;pointer-events:none}.leaflet-control-zoom a{background:#11111b !important;color:#e8e8f0 !important;border-color:#2a2a3a !important;font-weight:700 !important}.leaflet-control-zoom a:hover{background:#1a1a2a !important;color:#6366f1 !important}';
    document.head.appendChild(el);
  }, []);

  const zBtn = { padding: '6px 14px', borderRadius: 8, border: '1px solid #6366f133', background: 'rgba(99,102,241,0.08)', color: '#6366f1', cursor: 'pointer', fontWeight: 600, fontSize: 12 };

  return (
    <div style={{ position: 'relative', ...style }}>
      <div style={{ display: 'flex', gap: 20, padding: '8px 0', fontSize: 13, color: '#888', marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>Total Visitors: <strong style={{ color: '#00e5a0', fontSize: 16 }}>{totalVisitors.toLocaleString()}</strong></span>
        <span>Countries: <strong style={{ color: '#6366f1', fontSize: 16 }}>{points.length}</strong></span>
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>Scroll to zoom · Drag to pan · Click markers</span>
      </div>

      <div ref={mapRef} style={{ width: '100%', height: 450, borderRadius: 14, overflow: 'hidden', border: '1px solid #1a1a2a', background: '#0d1117' }} />

      {error && <div style={{ padding: 16, textAlign: 'center', color: '#888', fontSize: 13 }}>⚠️ {error}</div>}

      {selectedCountry && (
        <div style={{ marginTop: 10, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e8e8f0' }}>{selectedCountry.country}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{selectedCountry.count.toLocaleString()} visitors · {totalVisitors > 0 ? ((selectedCountry.count / totalVisitors) * 100).toFixed(1) : 0}% share</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { if (mapInstance.current) mapInstance.current.flyTo([selectedCountry.lat, selectedCountry.lng], 8, { duration: 1 }); }} style={zBtn}>🔍 Zoom In</button>
            <button onClick={() => { if (mapInstance.current) mapInstance.current.setView([20, 0], 2); setSelectedCountry(null); }} style={{ ...zBtn, borderColor: '#2a2a3a', color: '#888' }}>🌍 Reset</button>
          </div>
        </div>
      )}

      {points.length > 0 && (
        <div style={{ marginTop: 14, maxHeight: 260, overflowY: 'auto', borderRadius: 12, border: '1px solid #1a1a2a', background: '#0a0a14' }}>
          <div style={{ display: 'flex', padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, background: '#0a0a14', position: 'sticky', top: 0, zIndex: 2, borderBottom: '1px solid #1a1a2a' }}>
            <span style={{ width: 32 }}>#</span><span style={{ flex: 2 }}>Country</span><span style={{ flex: 1, textAlign: 'right' }}>Visitors</span><span style={{ flex: 1, textAlign: 'right' }}>Share</span><span style={{ flex: 1.2, textAlign: 'right', paddingRight: 8 }}>Distribution</span>
          </div>
          {[...points].sort((a, b) => b.count - a.count).map((p, i) => (
            <div key={p.code + i} onClick={() => { setSelectedCountry(p); if (mapInstance.current) mapInstance.current.flyTo([p.lat, p.lng], 5, { duration: 0.8 }); }}
              style={{ display: 'flex', padding: '7px 14px', fontSize: 12, borderBottom: '1px solid #0f0f1a', alignItems: 'center', cursor: 'pointer', background: selectedCountry?.code === p.code ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
              <span style={{ width: 32, fontWeight: 800, color: i === 0 ? '#f59e0b' : i < 3 ? '#f59e0b99' : '#444', fontSize: 11 }}>{i + 1}</span>
              <span style={{ flex: 2, color: '#e8e8f0', fontWeight: 500 }}>{p.country} <span style={{ color: '#444', fontSize: 10, marginLeft: 4 }}>{p.code}</span></span>
              <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>{p.count.toLocaleString()}</span>
              <span style={{ flex: 1, textAlign: 'right', color: '#888' }}>{totalVisitors > 0 ? ((p.count / totalVisitors) * 100).toFixed(1) : 0}%</span>
              <span style={{ flex: 1.2, display: 'flex', justifyContent: 'flex-end', paddingRight: 8 }}>
                <div style={{ width: 70, height: 6, borderRadius: 3, background: '#1a1a2a', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: (p.count / maxCount) * 100 + '%', background: 'linear-gradient(90deg, #6366f1, #a855f7)' }} />
                </div>
              </span>
            </div>
          ))}
        </div>
      )}

      {points.length === 0 && !error && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>🌍</span>
          <p style={{ color: '#555', fontSize: 14 }}>No visitor data yet. The map will populate once visitor tracking is active.</p>
        </div>
      )}
    </div>
  );
}
