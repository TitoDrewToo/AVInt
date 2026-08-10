import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { Character } from "../components/Character";
import { KineticOverlay } from "../components/KineticOverlay";
import { ParallaxScene } from "../components/ParallaxScene";

function SpinningCube() {
  const frame = useCurrentFrame();
  const rotation = interpolate(frame, [0, 90], [0, Math.PI * 2]);

  return (
    <mesh rotation={[rotation * 0.7, rotation, 0]}>
      <boxGeometry args={[1.8, 1.8, 1.8]} />
      <meshStandardMaterial color="#49a7ff" roughness={0.35} metalness={0.2} />
    </mesh>
  );
}

export function SmokeTest() {
  return (
    <AbsoluteFill style={{ background: "#07070b" }}>
      <ParallaxScene />
      <ThreeCanvas
        width={1920}
        height={1080}
        camera={{ position: [0, 0, 6], fov: 55 }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 3, 4]} intensity={1.6} />
        <SpinningCube />
      </ThreeCanvas>
      <Character />
      <KineticOverlay title="SMOKE TEST" />
    </AbsoluteFill>
  );
}
