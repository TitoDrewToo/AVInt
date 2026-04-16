import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const width = 1080;
export const height = 1920;
export const fps = 30;

/* ═══════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════ */
const colors = {
  bg: '#0a0a0a',
  hero: '#fafafa',
  body: '#d4d4d8',
  muted: '#a1a1aa',
  faint: '#52525b',
  blue: '#6d9fff',
  green: '#4ade80',
  red: '#f87171',
};

const fonts = {
  display: '"Inter", -apple-system, "Segoe UI", system-ui, sans-serif',
  mono: '"SF Mono", "JetBrains Mono", "Geist Mono", Menlo, monospace',
};

const base: React.CSSProperties = {
  fontFamily: fonts.display,
  color: colors.hero,
  WebkitFontSmoothing: 'antialiased',
};

const tabularNums: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums lining-nums',
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
};

/* ─── Premium glass card ─── */
const glassCard = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  backgroundColor: 'rgba(10, 10, 10, 0.72)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 18,
  boxShadow:
    '0 24px 64px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 0 0 1px rgba(255, 255, 255, 0.04)',
  ...extra,
});

/* ─── Easing helpers (research-backed cubic-bezier values) ─── */
// "expo out" — the most-used pro easing curve
const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
// material standard
const materialStd = Easing.bezier(0.4, 0.0, 0.2, 1);
// slight overshoot
const overshoot = Easing.bezier(0.34, 1.56, 0.64, 1);

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/* ═══════════════════════════════════════════════════════
   SAFE ZONES — LOCKED BENCHMARK (Campaign 1+)
   ---------------------------------------------------------
   HeyGen "Darlene" avatar is letterboxed inside a 1080×1920
   canvas. The actual visible content lives in the strip
   y=652..1268 (≈616 px tall). Pixels outside this range are
   baked-in black bars where overlays would be invisible.
   Avatar body occupies roughly x=280..720 in that strip.

   These 5 zones are the approved placement grid. DO NOT
   shift them without re-verifying with cropdetect on the
   next HeyGen render — if Darlene's framing changes, the
   strip coordinates change too. Run:
     ffmpeg -ss 8 -i AVATAR.mp4 -vframes 3 \
       -vf cropdetect=50:2:0 -f null - 2>&1 | grep cropdetect
   ═══════════════════════════════════════════════════════ */
const VISIBLE_TOP = 660;
const VISIBLE_BOTTOM = 1260;

const zones = {
  topLeft:    {x: 30,  y: 670,  w: 260, h: 180}, // wall above plant (left of Darlene)
  topRight:   {x: 770, y: 670,  w: 290, h: 200}, // wall right of Darlene's head
  leftMid:    {x: 20,  y: 680,  w: 300, h: 560}, // full left column (plant area)
  bottomLeft: {x: 20,  y: 940,  w: 320, h: 300}, // lower-left plant area
  bottomRight:{x: 750, y: 1020, w: 310, h: 220}, // desk-right lower area
};

/* ═══════════════════════════════════════════════════════
   1. CHAOS MONTAGE — pills land in zones, hold, fade
   5 seconds / 150 frames
   ═══════════════════════════════════════════════════════ */

interface ZonedLabel {
  text: string;
  icon: string;
  startFrame: number;
  x: number;
  y: number;
}

// 6 pills distributed across 3 "text upload" zones
const labels: ZonedLabel[] = [
  {text: 'Receipts',   icon: '📄', startFrame: 0,  x: zones.topLeft.x,       y: zones.topLeft.y},
  {text: 'Invoices',   icon: '🧾', startFrame: 8,  x: zones.topRight.x,      y: zones.topRight.y},
  {text: 'Bills',      icon: '💳', startFrame: 16, x: zones.topLeft.x + 30,  y: zones.topLeft.y + 110},
  {text: 'Contracts',  icon: '📋', startFrame: 24, x: zones.topRight.x + 30, y: zones.topRight.y + 110},
  {text: 'Payslips',   icon: '💼', startFrame: 32, x: zones.bottomRight.x,   y: zones.bottomRight.y},
  {text: 'Statements', icon: '📊', startFrame: 40, x: zones.bottomRight.x + 30, y: zones.bottomRight.y + 110},
];

export const ChaosMontage: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps: videoFps} = useVideoConfig();

  return (
    <AbsoluteFill style={{backgroundColor: 'transparent'}}>
      {/* Pills land in zones, hold, fade together near the end */}
      {labels.map((label) => {
        const adj = frame - label.startFrame;
        if (adj < 0) return null;

        // Spring-driven entry scale (lands in zone with slight overshoot)
        const entryScale = spring({
          frame: adj,
          fps: videoFps,
          config: {damping: 14, stiffness: 180, mass: 0.9},
        });

        // Fade in fast on entry
        const fadeIn = interpolate(adj, [0, 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        // All pills fade out together starting frame 115
        const fadeOut = interpolate(frame, [115, 140], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        // Subtle floating wobble
        const wobbleY = Math.sin(adj / 18) * 3;

        return (
          <div
            key={label.text}
            style={{
              ...glassCard({
                position: 'absolute',
                top: label.y + wobbleY,
                left: label.x,
                padding: '12px 20px 12px 16px',
                opacity: fadeIn * fadeOut,
                transform: `scale(${entryScale})`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1px solid rgba(109, 159, 255, 0.25)',
                boxShadow:
                  '0 0 32px rgba(109, 159, 255, 0.12), 0 20px 50px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.08) inset',
              }),
            }}
          >
            <span style={{fontSize: 20}}>{label.icon}</span>
            <span
              style={{
                ...base,
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: colors.hero,
              }}
            >
              {label.text}
            </span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════════════════
   2. UPLOAD DEMO — animated counter
   7 seconds / 210 frames
   ═══════════════════════════════════════════════════════ */
export const UploadDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps: videoFps} = useVideoConfig();

  const finalAmount = 4827.53;

  // Card fade + subtle slide from right (stays on-screen)
  const cardEntry = spring({
    frame,
    fps: videoFps,
    config: {damping: 18, stiffness: 110, mass: 1},
  });
  const cardX = interpolate(cardEntry, [0, 1], [40, 0]);

  // Counter — eased out cubic over 90 frames
  const countProgress = interpolate(frame, [18, 110], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: expoOut,
  });
  const currentAmount = countProgress * finalAmount;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(currentAmount);

  // Chip labels stagger in below the number
  const chips = ['Vendor', 'Amount', 'Date', 'Category'];
  const chipsContainerOpacity = interpolate(frame, [70, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pulse glow on the number once it settles
  const pulseProgress = interpolate(frame, [110, 140], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const glowSize = pulseProgress * 60;

  return (
    <AbsoluteFill style={{backgroundColor: 'transparent'}}>
      <div
        style={{
          ...glassCard({
            position: 'absolute',
            top: zones.topRight.y,
            left: zones.topRight.x,
            width: zones.topRight.w,
            padding: '20px 22px',
            transform: `translateX(${cardX}px)`,
            opacity: cardEntry,
            boxSizing: 'border-box',
          }),
        }}
      >
        {/* Status label */}
        <div
          style={{
            ...base,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.muted,
            marginBottom: 8,
          }}
        >
          Auto-extracted
        </div>

        {/* Big number */}
        <div
          style={{
            ...base,
            ...tabularNums,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: '-0.035em',
            color: colors.green,
            lineHeight: 1,
            textShadow: `0 0 ${glowSize}px rgba(74, 222, 128, ${
              pulseProgress * 0.45
            })`,
          }}
        >
          {formatted}
        </div>

        {/* Field chips */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 22,
            flexWrap: 'wrap',
            opacity: chipsContainerOpacity,
          }}
        >
          {chips.map((chip, i) => {
            const chipEntry = spring({
              frame: frame - 80 - i * 6,
              fps: videoFps,
              config: {damping: 14, stiffness: 180, mass: 0.8},
            });
            return (
              <div
                key={chip}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'rgba(109, 159, 255, 0.12)',
                  border: '1px solid rgba(109, 159, 255, 0.35)',
                  borderRadius: 999,
                  ...base,
                  fontSize: 15,
                  fontWeight: 500,
                  color: colors.blue,
                  transform: `scale(${chipEntry})`,
                  opacity: chipEntry,
                }}
              >
                {chip} ✓
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════════════════
   3. TAX REPORT — Schedule C lines slide in, total appears
   6 seconds / 180 frames
   ═══════════════════════════════════════════════════════ */
export const TaxReport: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps: videoFps} = useVideoConfig();

  const lines: [string, string, number][] = [
    ['Line 8 — Advertising', '$1,240', 1240],
    ['Line 18 — Office Expense', '$3,480', 3480],
    ['Line 22 — Supplies', '$1,920', 1920],
    ['Line 27a — Other', '$1,575', 1575],
  ];

  // Header card
  const headerEntry = spring({
    frame,
    fps: videoFps,
    config: {damping: 16, stiffness: 120, mass: 1},
  });

  // All elements fade out together near the end
  const fadeOut = interpolate(frame, [140, 168], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Total appears after all lines
  const totalEntry = spring({
    frame: frame - 96,
    fps: videoFps,
    config: {damping: 14, stiffness: 140, mass: 0.9},
  });

  // Total number counter
  const totalCount = interpolate(frame, [98, 130], [0, 8215], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: expoOut,
  });
  const totalFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(totalCount);

  return (
    <AbsoluteFill style={{backgroundColor: 'transparent'}}>
      {/* Header pill — top of left-mid zone */}
      <div
        style={{
          ...glassCard({
            position: 'absolute',
            top: zones.leftMid.y,
            left: zones.leftMid.x,
            padding: '8px 16px',
            opacity: headerEntry * fadeOut,
            transform: `translateY(${(1 - headerEntry) * -16}px)`,
          }),
        }}
      >
        <div
          style={{
            ...base,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.blue,
          }}
        >
          Schedule C
        </div>
      </div>

      {/* Line items — slide in one at a time */}
      {lines.map(([name, value], i) => {
        const delay = 12 + i * 18;
        const slideIn = spring({
          frame: frame - delay,
          fps: videoFps,
          config: {damping: 16, stiffness: 110, mass: 0.95},
        });
        const x = interpolate(slideIn, [0, 1], [60, 0]);

        return (
          <div
            key={name}
            style={{
              ...glassCard({
                position: 'absolute',
                top: zones.leftMid.y + 56 + i * 62,
                left: zones.leftMid.x,
                width: zones.leftMid.w,
                padding: '12px 18px',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: slideIn * 0.95 * fadeOut,
                transform: `translateX(${x}px)`,
              }),
            }}
          >
            <span
              style={{
                ...base,
                fontSize: 15,
                fontWeight: 500,
                color: colors.body,
              }}
            >
              {name}
            </span>
            <span
              style={{
                ...base,
                ...tabularNums,
                fontSize: 17,
                fontWeight: 600,
                color: colors.hero,
                letterSpacing: '-0.01em',
              }}
            >
              {value}
            </span>
          </div>
        );
      })}

      {/* Total — appears after all lines, with glow */}
      <div
        style={{
          ...glassCard({
            position: 'absolute',
            top: zones.leftMid.y + 320,
            left: zones.leftMid.x,
            width: zones.leftMid.w,
            padding: '14px 18px',
            boxSizing: 'border-box',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            opacity: totalEntry * fadeOut,
            transform: `translateY(${(1 - totalEntry) * 24}px) scale(${
              0.95 + totalEntry * 0.05
            })`,
            border: '1px solid rgba(74, 222, 128, 0.4)',
            boxShadow:
              '0 0 60px rgba(74, 222, 128, 0.25), 0 24px 64px rgba(0, 0, 0, 0.5)',
          }),
        }}
      >
        <span
          style={{
            ...base,
            fontSize: 14,
            fontWeight: 600,
            color: colors.muted,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Total
        </span>
        <span
          style={{
            ...base,
            ...tabularNums,
            fontSize: 24,
            fontWeight: 700,
            color: colors.green,
            letterSpacing: '-0.02em',
          }}
        >
          {totalFormatted}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════════════════
   4. DASHBOARD TIMELAPSE — animated bar chart + trend line
   12 seconds / 360 frames
   ═══════════════════════════════════════════════════════ */
export const DashboardTimelapse: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps: videoFps} = useVideoConfig();

  // Panel slides up from bottom
  const panelEntry = spring({
    frame,
    fps: videoFps,
    config: {damping: 18, stiffness: 100, mass: 1.1},
  });

  // Phase progress (each phase eased)
  const phase = (start: number, end: number) =>
    interpolate(frame, [start, end], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: expoOut,
    });

  const m3 = phase(20, 80); // 3 months bars grow
  const m12 = phase(90, 160); // 1 year bars grow
  const y3 = phase(170, 250); // 3 year bars grow
  const trendDraw = phase(200, 290); // trend line draws

  // Bar groups — fit in ~276px wide chart area (320 zone - 44 padding)
  const barGroups = [
    {
      label: '3 mo',
      xStart: 4,
      heights: [38, 55, 44],
      progress: m3,
    },
    {
      label: '1 yr',
      xStart: 90,
      heights: [70, 88, 78, 96],
      progress: m12,
    },
    {
      label: '3 yr',
      xStart: 186,
      heights: [108, 122, 115, 130, 128],
      progress: y3,
    },
  ];

  const barWidth = 12;
  const barGap = 18;
  const chartHeight = 150;

  // YoY badge enters after trend line draws
  const badgeEntry = spring({
    frame: frame - 280,
    fps: videoFps,
    config: {damping: 14, stiffness: 130, mass: 0.85},
  });

  const yoyCount = interpolate(frame, [280, 320], [0, 37], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: expoOut,
  });

  return (
    <AbsoluteFill style={{backgroundColor: 'transparent'}}>
      {/* Dashboard panel — bottom-left zone (chart analytics visuals) */}
      <div
        style={{
          ...glassCard({
            position: 'absolute',
            top: zones.bottomLeft.y,
            left: zones.bottomLeft.x,
            width: zones.bottomLeft.w,
            padding: '18px 22px',
            boxSizing: 'border-box',
            opacity: panelEntry,
            transform: `translateY(${(1 - panelEntry) * 50}px)`,
          }),
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: 14,
          }}
        >
          <div
            style={{
              ...base,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: colors.blue,
              marginBottom: 2,
            }}
          >
            Smart Dashboard
          </div>
          <div
            style={{
              ...base,
              fontSize: 15,
              fontWeight: 600,
              color: colors.hero,
              letterSpacing: '-0.02em',
            }}
          >
            Cash flow over time
          </div>
        </div>

        {/* Chart area */}
        <div style={{position: 'relative', height: chartHeight + 28}}>
          {/* Bars */}
          {barGroups.map((group) =>
            group.heights.map((h, i) => {
              const barProgress = easeOutCubic(group.progress);
              const barH = h * barProgress;
              return (
                <div
                  key={`${group.label}-${i}`}
                  style={{
                    position: 'absolute',
                    bottom: 24,
                    left: group.xStart + i * barGap,
                    width: barWidth,
                    height: barH,
                    background: `linear-gradient(180deg, ${colors.blue}, rgba(109, 159, 255, 0.55))`,
                    borderRadius: '3px 3px 1px 1px',
                    opacity: 0.9 * barProgress,
                    boxShadow: `0 0 12px rgba(109, 159, 255, ${
                      0.2 * barProgress
                    })`,
                  }}
                />
              );
            }),
          )}

          {/* Animated trend line — draws on with stroke-dashoffset */}
          <svg
            width="276"
            height={chartHeight + 20}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              opacity: trendDraw,
              pointerEvents: 'none',
            }}
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <polyline
              fill="none"
              stroke={colors.green}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              strokeDasharray="350"
              strokeDashoffset={(1 - trendDraw) * 350}
              points="18,130 38,118 58,124 110,105 130,92 150,98 170,82 210,60 230,50 250,54 270,34"
            />
          </svg>

          {/* Period labels */}
          {barGroups.map((group) => (
            <div
              key={group.label}
              style={{
                position: 'absolute',
                bottom: 0,
                left: group.xStart,
                ...base,
                fontSize: 10,
                fontWeight: 500,
                color: colors.muted,
                opacity: group.progress,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {group.label}
            </div>
          ))}
        </div>
      </div>

      {/* YoY badge — top-right zone (chart analytics visuals #2) */}
      <div
        style={{
          ...glassCard({
            position: 'absolute',
            top: zones.topRight.y + 40,
            left: zones.topRight.x + 60,
            padding: '14px 22px',
            border: '1px solid rgba(74, 222, 128, 0.45)',
            boxShadow:
              '0 0 50px rgba(74, 222, 128, 0.22), 0 20px 50px rgba(0, 0, 0, 0.5)',
            opacity: badgeEntry,
            transform: `scale(${badgeEntry}) translateY(${
              (1 - badgeEntry) * -16
            }px)`,
          }),
        }}
      >
        <div
          style={{
            ...base,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.muted,
            marginBottom: 2,
          }}
        >
          Year over year
        </div>
        <div
          style={{
            ...base,
            ...tabularNums,
            fontSize: 30,
            fontWeight: 700,
            color: colors.green,
            letterSpacing: '-0.02em',
          }}
        >
          +{Math.round(yoyCount)}%
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════════════════
   5. CTA ENDCARD — solid black bg + logo (concatenated, not overlaid)
   5 seconds / 150 frames
   ═══════════════════════════════════════════════════════ */
export const CtaEndcard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps: videoFps} = useVideoConfig();

  // Logo enters with iris-like reveal
  const logoEntry = spring({
    frame: frame - 8,
    fps: videoFps,
    config: {damping: 18, stiffness: 120, mass: 1},
  });

  // URL slides up
  const urlEntry = spring({
    frame: frame - 30,
    fps: videoFps,
    config: {damping: 16, stiffness: 110, mass: 0.95},
  });

  // Tagline
  const taglineOpacity = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Subtle pulse
  const pulse = 1 + Math.sin(frame / 16) * 0.012;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Center stack */}
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          transform: `scale(${pulse})`,
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoEntry,
            transform: `scale(${0.9 + logoEntry * 0.1})`,
          }}
        >
          <Img
            src={staticFile('avintelligence-stacked.svg')}
            style={{
              width: 460,
              height: 'auto',
              filter: `drop-shadow(0 0 60px rgba(109, 159, 255, ${
                logoEntry * 0.4
              }))`,
            }}
          />
        </div>

        {/* URL */}
        <div
          style={{
            ...base,
            ...tabularNums,
            marginTop: 56,
            fontSize: 56,
            fontWeight: 600,
            color: colors.hero,
            letterSpacing: '-0.025em',
            opacity: urlEntry,
            transform: `translateY(${(1 - urlEntry) * 20}px)`,
          }}
        >
          avintph.com
        </div>

        {/* Tagline */}
        <div
          style={{
            ...base,
            marginTop: 20,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: colors.muted,
            opacity: taglineOpacity,
          }}
        >
          Try it free — no credit card
        </div>
      </div>
    </AbsoluteFill>
  );
};
