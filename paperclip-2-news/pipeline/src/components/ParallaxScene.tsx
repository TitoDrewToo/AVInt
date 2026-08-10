import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type ParallaxSceneProps = {
  scenePath?: string;
};

export function ParallaxScene({ scenePath }: ParallaxSceneProps) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 90], [-22, 22]);

  return (
    <AbsoluteFill style={{ background: "#100d18", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-8%",
          background:
            "linear-gradient(145deg, #27143a 0%, #102640 50%, #080810 100%)",
          transform: `translateX(${drift * 0.25}px) scale(1.05)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 180 + drift * 0.4,
          top: 170,
          width: 470,
          height: 280,
          transform: "skewX(-12deg)",
          background: "rgba(255, 80, 92, 0.18)",
          border: "2px solid rgba(255,255,255,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 130 - drift * 0.6,
          bottom: 140,
          width: 620,
          height: 240,
          transform: "skewX(16deg)",
          background: "rgba(64, 154, 255, 0.2)",
          border: "2px solid rgba(255,255,255,0.2)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 190,
          background: "linear-gradient(180deg, transparent, #07070b 42%)",
        }}
      />
      {scenePath ? (
        <div
          style={{
            position: "absolute",
            left: 40,
            bottom: 36,
            color: "rgba(255,255,255,0.48)",
            font: "28px system-ui",
          }}
        >
          glTF placeholder: {scenePath}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
