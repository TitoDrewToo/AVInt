import { AbsoluteFill } from "remotion";
import type React from "react";

export type MouthState = "A" | "B" | "C" | "D" | "E" | "F" | "X";
export type EyeState = "open" | "half" | "closed" | "aside";
export type PoseState = "neutral" | "gesturing" | "leaning";

export type CharacterConfig = {
  name: string;
  displayName: string;
  lowerThird: string;
  primaryColor: string;
  accentColor: string;
  lighting: { key: string; rim: string };
  head: string;
  body: string;
  mouths: Record<MouthState, string>;
  eyes: Record<EyeState, string>;
  poses: Record<PoseState, string>;
  particles: null | unknown;
};

type CharacterRigProps = {
  config: CharacterConfig;
  mouthState: MouthState;
  eyeState: EyeState;
  pose: PoseState;
  position: [number, number, number];
  scale: number;
};

function AssetLayer({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  return <img src={src} alt={alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }} />;
}

export function CharacterRig({ config, mouthState, eyeState, pose, position, scale }: CharacterRigProps) {
  const [x, y] = position;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          position: "relative",
          width: 360,
          height: 520,
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          transformOrigin: "center bottom",
          filter: "drop-shadow(0 28px 28px rgba(0,0,0,0.35))",
        }}
        aria-label={config.displayName}
      >
        <AssetLayer src={config.poses[pose]} alt={`${config.displayName} ${pose} pose`} />
        <AssetLayer src={config.body} alt={`${config.displayName} body`} />
        <AssetLayer src={config.head} alt={`${config.displayName} head`} />
        <AssetLayer src={config.eyes[eyeState]} alt={`${config.displayName} ${eyeState} eyes`} />
        <AssetLayer src={config.mouths[mouthState]} alt={`${config.displayName} mouth ${mouthState}`} />
      </div>
    </AbsoluteFill>
  );
}
