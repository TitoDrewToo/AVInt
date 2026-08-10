import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type KineticOverlayProps = {
  title: string;
  kicker?: string;
};

export function KineticOverlay({ title, kicker = "AI AFTER DARK" }: KineticOverlayProps) {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [0, 12], [-560, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 72,
          transform: `translateX(${slide}px) rotate(-2deg)`,
          transformOrigin: "left center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#e91f44",
            color: "#fff",
            padding: "10px 22px",
            font: "700 34px system-ui",
            letterSpacing: 0,
            boxShadow: "12px 12px 0 #07070b",
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            marginTop: 14,
            background: "#fff",
            color: "#07070b",
            padding: "18px 28px",
            font: "900 74px system-ui",
            letterSpacing: 0,
            boxShadow: "16px 16px 0 #07070b",
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
}
