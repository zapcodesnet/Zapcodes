import React, { useState, useRef, useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════
// Simplified world map — Mercator projection country centroids
// Used to plot visitor dots without needing a GeoJSON or external lib
// ═══════════════════════════════════════════════════════════
const COUNTRY_COORDS = {
  US: { lat: 39.8, lng: -98.5, name: 'United States' }, CA: { lat: 56.1, lng: -106.3, name: 'Canada' },
  MX: { lat: 23.6, lng: -102.5, name: 'Mexico' }, BR: { lat: -14.2, lng: -51.9, name: 'Brazil' },
  AR: { lat: -38.4, lng: -63.6, name: 'Argentina' }, CO: { lat: 4.6, lng: -74.3, name: 'Colombia' },
  CL: { lat: -35.7, lng: -71.5, name: 'Chile' }, PE: { lat: -9.2, lng: -75.0, name: 'Peru' },
  GB: { lat: 55.4, lng: -3.4, name: 'United Kingdom' }, DE: { lat: 51.2, lng: 10.4, name: 'Germany' },
  FR: { lat: 46.2, lng: 2.2, name: 'France' }, IT: { lat: 41.9, lng: 12.6, name: 'Italy' },
  ES: { lat: 40.5, lng: -3.7, name: 'Spain' }, PT: { lat: 39.4, lng: -8.2, name: 'Portugal' },
  NL: { lat: 52.1, lng: 5.3, name: 'Netherlands' }, BE: { lat: 50.5, lng: 4.5, name: 'Belgium' },
  SE: { lat: 60.1, lng: 18.6, name: 'Sweden' }, NO: { lat: 60.5, lng: 8.5, name: 'Norway' },
  DK: { lat: 56.3, lng: 9.5, name: 'Denmark' }, FI: { lat: 61.9, lng: 25.7, name: 'Finland' },
  PL: { lat: 51.9, lng: 19.1, name: 'Poland' }, CH: { lat: 46.8, lng: 8.2, name: 'Switzerland' },
  AT: { lat: 47.5, lng: 14.6, name: 'Austria' }, RO: { lat: 45.9, lng: 24.9, name: 'Romania' },
  UA: { lat: 48.4, lng: 31.2, name: 'Ukraine' }, RU: { lat: 61.5, lng: 105.3, name: 'Russia' },
  TR: { lat: 39.0, lng: 35.2, name: 'Turkey' }, GR: { lat: 39.1, lng: 21.8, name: 'Greece' },
  IN: { lat: 20.6, lng: 79.0, name: 'India' }, CN: { lat: 35.9, lng: 104.2, name: 'China' },
  JP: { lat: 36.2, lng: 138.3, name: 'Japan' }, KR: { lat: 35.9, lng: 128.0, name: 'South Korea' },
  PH: { lat: 12.9, lng: 121.8, name: 'Philippines' }, VN: { lat: 14.1, lng: 108.3, name: 'Vietnam' },
  TH: { lat: 15.9, lng: 100.9, name: 'Thailand' }, MY: { lat: 4.2, lng: 101.9, name: 'Malaysia' },
  SG: { lat: 1.4, lng: 103.8, name: 'Singapore' }, ID: { lat: -0.8, lng: 113.9, name: 'Indonesia' },
  AU: { lat: -25.3, lng: 133.8, name: 'Australia' }, NZ: { lat: -40.9, lng: 174.9, name: 'New Zealand' },
  ZA: { lat: -30.6, lng: 22.9, name: 'South Africa' }, NG: { lat: 9.1, lng: 8.7, name: 'Nigeria' },
  KE: { lat: -0.0, lng: 37.9, name: 'Kenya' }, EG: { lat: 26.8, lng: 30.8, name: 'Egypt' },
  SA: { lat: 23.9, lng: 45.1, name: 'Saudi Arabia' }, AE: { lat: 23.4, lng: 53.8, name: 'UAE' },
  IL: { lat: 31.0, lng: 34.9, name: 'Israel' }, PK: { lat: 30.4, lng: 69.3, name: 'Pakistan' },
  BD: { lat: 23.7, lng: 90.4, name: 'Bangladesh' }, TW: { lat: 23.7, lng: 121.0, name: 'Taiwan' },
  HK: { lat: 22.4, lng: 114.1, name: 'Hong Kong' }, IE: { lat: 53.4, lng: -8.2, name: 'Ireland' },
  CZ: { lat: 49.8, lng: 15.5, name: 'Czech Republic' }, HU: { lat: 47.2, lng: 19.5, name: 'Hungary' },
  XX: { lat: 0, lng: 0, name: 'Unknown' },
};

// Simple Mercator projection
function project(lat, lng, width, height) {
  const x = ((lng + 180) / 360) * width;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = height / 2 - (mercN * width) / (2 * Math.PI);
  return { x, y };
}

// Simplified continent outlines as SVG paths (rough shapes for background)
const CONTINENT_PATHS = [
  // North America (simplified)
  'M80,60 L130,50 L160,80 L170,120 L155,145 L130,160 L110,170 L90,155 L70,120 L65,90 Z',
  // South America
  'M130,170 L155,165 L165,190 L170,220 L160,260 L145,290 L130,300 L120,280 L115,240 L120,200 Z',
  // Europe
  'M280,55 L310,45 L340,55 L350,70 L340,90 L320,95 L300,90 L285,80 Z',
  // Africa
  'M290,110 L330,100 L350,115 L355,150 L340,190 L320,220 L300,230 L280,210 L275,170 L280,130 Z',
  // Asia
  'M340,40 L420,30 L470,50 L490,80 L480,110 L450,120 L420,115 L390,100 L360,90 L340,70 Z',
  // Southeast Asia / Indonesia
  'M420,130 L460,120 L480,130 L490,145 L475,160 L450,155 L430,145 Z',
  // Australia
  'M450,200 L490,195 L510,210 L505,235 L485,245 L460,235 L450,215 Z',
];

export default function VisitorWorldMap({ visitorData, style }) {
  const svgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const W = 540, H = 320;

  // Process visitor data into plottable points
  const points = (visitorData || []).map(v => {
    const code = v._id?.countryCode || v.countryCode || 'XX';
    const country = v._id?.country || v.country || 'Unknown';
    const count = v.count || 0;
    const coords = COUNTRY_COORDS[code];
    if (!coords) return null;
    const pos = project(coords.lat, coords.lng, W, H);
    return { ...pos, code, country, count, lat: coords.lat, lng: coords.lng };
  }).filter(Boolean);

  const maxCount = Math.max(...points.map(p => p.count), 1);
  const totalVisitors = points.reduce((s, p) => s + p.count, 0);

  // Mouse handlers for pan
  const onMouseDown = (e) => {
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => setDragging(false);

  // Zoom with buttons
  const zoomIn = () => setZoom(z => Math.min(z + 0.5, 5));
  const zoomOut = () => { setZoom(z => Math.max(z - 0.5, 0.5)); if (zoom <= 1) setPan({ x: 0, y: 0 }); };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Wheel zoom
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.min(Math.max(z + (e.deltaY > 0 ? -0.2 : 0.2), 0.5), 5));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (el) el.addEventListener('wheel', onWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', onWheel); };
  }, [onWheel]);

  return (
    <div style={{ position: 'relative', ...style }}>
      {/* Controls */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4 }}>
        <button onClick={zoomIn} style={btnStyle}>+</button>
        <button onClick={zoomOut} style={btnStyle}>−</button>
        <button onClick={resetView} style={{ ...btnStyle, fontSize: 10 }}>Reset</button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 12px', fontSize: 12, color: '#888', marginBottom: 4 }}>
        <span>Total Visitors: <strong style={{ color: '#00e5a0' }}>{totalVisitors.toLocaleString()}</strong></span>
        <span>Countries: <strong style={{ color: '#6366f1' }}>{points.length}</strong></span>
        <span style={{ fontSize: 10, color: '#555' }}>Scroll to zoom · Drag to pan</span>
      </div>

      {/* Map SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', background: '#0a0e1a', borderRadius: 12, cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <g transform={`translate(${pan.x / 2}, ${pan.y / 2}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
          {/* Grid lines */}
          {[...Array(7)].map((_, i) => (
            <line key={`h${i}`} x1={0} y1={(i * H) / 6} x2={W} y2={(i * H) / 6} stroke="#1a1f30" strokeWidth={0.3} />
          ))}
          {[...Array(13)].map((_, i) => (
            <line key={`v${i}`} x1={(i * W) / 12} y1={0} x2={(i * W) / 12} y2={H} stroke="#1a1f30" strokeWidth={0.3} />
          ))}

          {/* Continent outlines */}
          {CONTINENT_PATHS.map((d, i) => (
            <path key={i} d={d} fill="#131830" stroke="#1f2845" strokeWidth={0.5} />
          ))}

          {/* Visitor dots */}
          {points.map((p, i) => {
            const r = Math.max(3, Math.min(18, (p.count / maxCount) * 18));
            const opacity = 0.4 + (p.count / maxCount) * 0.6;
            return (
              <g key={i}
                onMouseEnter={() => setTooltip(p)}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => setSelectedCountry(p)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow */}
                <circle cx={p.x} cy={p.y} r={r + 4} fill={`rgba(99,102,241,${opacity * 0.15})`} />
                {/* Pulse ring */}
                <circle cx={p.x} cy={p.y} r={r + 2} fill="none" stroke={`rgba(99,102,241,${opacity * 0.3})`} strokeWidth={0.5}>
                  <animate attributeName="r" from={r} to={r + 6} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from={0.4} to={0} dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Main dot */}
                <circle cx={p.x} cy={p.y} r={r} fill={`rgba(99,102,241,${opacity})`} stroke="#6366f1" strokeWidth={0.5} />
                {/* Count label for large dots */}
                {r > 6 && (
                  <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.max(5, r * 0.6)} fontWeight="700">
                    {p.count > 999 ? `${(p.count / 1000).toFixed(0)}K` : p.count}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect x={Math.min(tooltip.x * zoom + pan.x / 2 + 10, W - 120)} y={Math.max(tooltip.y * zoom + pan.y / 2 - 30, 5)} width={110} height={36} rx={6} fill="#1a1f35" stroke="#2a2f4a" strokeWidth={0.5} />
            <text x={Math.min(tooltip.x * zoom + pan.x / 2 + 16, W - 114)} y={Math.max(tooltip.y * zoom + pan.y / 2 - 14, 19)} fill="#e8e8f0" fontSize={9} fontWeight={700}>{tooltip.country}</text>
            <text x={Math.min(tooltip.x * zoom + pan.x / 2 + 16, W - 114)} y={Math.max(tooltip.y * zoom + pan.y / 2 + 0, 33)} fill="#6366f1" fontSize={8}>{tooltip.count.toLocaleString()} visitors</text>
          </g>
        )}
      </svg>

      {/* Country details sidebar */}
      {selectedCountry && (
        <div style={{ marginTop: 8, padding: '10px 14px', background: '#11111b', border: '1px solid #2a2a3a', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{selectedCountry.country}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{selectedCountry.count.toLocaleString()} visitors · Code: {selectedCountry.code}</div>
          </div>
          <button onClick={() => setSelectedCountry(null)} style={{ ...btnStyle, fontSize: 10 }}>✕</button>
        </div>
      )}

      {/* Country list table */}
      {points.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ display: 'flex', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1a1a2a' }}>
            <span style={{ flex: 2 }}>Country</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Visitors</span>
            <span style={{ flex: 1, textAlign: 'right' }}>% Share</span>
          </div>
          {[...points].sort((a, b) => b.count - a.count).map((p, i) => (
            <div key={i} style={{ display: 'flex', padding: '5px 12px', fontSize: 12, borderBottom: '1px solid #0f0f1a', alignItems: 'center', cursor: 'pointer', background: selectedCountry?.code === p.code ? 'rgba(99,102,241,0.08)' : 'transparent' }}
              onClick={() => setSelectedCountry(p)}
            >
              <span style={{ flex: 2, color: '#e8e8f0' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#6366f1', marginRight: 8, opacity: 0.4 + (p.count / maxCount) * 0.6 }} />
                {p.country}
              </span>
              <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>{p.count.toLocaleString()}</span>
              <span style={{ flex: 1, textAlign: 'right', color: '#888' }}>{totalVisitors > 0 ? ((p.count / totalVisitors) * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid #2a2a3a',
  background: '#11111b', color: '#e8e8f0', cursor: 'pointer', fontWeight: 700,
  fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
