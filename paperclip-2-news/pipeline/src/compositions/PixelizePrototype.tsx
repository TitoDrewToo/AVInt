import { EffectComposer } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { useEffect, useState } from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { DoubleSide, Texture, TextureLoader } from "three";
import { PixelizeQuantize } from "../effects/PixelizeQuantize";

export type PixelizePrototypeProps = {
  pixelSize: number;
  paletteSize: number;
  ditherEnabled: boolean;
  outlineEnabled: boolean;
  outlineThreshold: number;
  outlineThickness?: number;
  outlineColor?: string;
  referenceImage: string;
};

const PLANE_WIDTH = 16;
const PLANE_HEIGHT = 9;

function GradientBackground() {
  return (
    <mesh position={[0, 0, -0.05]}>
      <planeGeometry args={[PLANE_WIDTH, PLANE_HEIGHT]} />
      <shaderMaterial
        side={DoubleSide}
        fragmentShader={`
          varying vec2 vUv;
          void main() {
            vec3 paperWhite = vec3(0.980, 0.980, 0.961);
            vec3 inkBlack = vec3(0.039, 0.039, 0.039);
            gl_FragColor = vec4(mix(inkBlack, paperWhite, vUv.y), 1.0);
          }
        `}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function Rectangles() {
  return (
    <>
      <mesh position={[-4.6, 1.8, 0]}>
        <planeGeometry args={[3.2, 2.2]} />
        <meshBasicMaterial color="#F5E6C8" />
      </mesh>
      <mesh position={[4.5, 1.3, 0]}>
        <planeGeometry args={[2.4, 3.4]} />
        <meshBasicMaterial color="#242424" />
      </mesh>
      <mesh position={[-1.2, -2.6, 0]}>
        <planeGeometry args={[5.4, 1.2]} />
        <meshBasicMaterial color="#FF8C42" />
      </mesh>
    </>
  );
}

function FaceMockup() {
  return (
    <group position={[0.4, 0.4, 0.05]}>
      <mesh>
        <circleGeometry args={[1.45, 72]} />
        <meshBasicMaterial color="#E8C4A5" />
      </mesh>
      <mesh position={[-0.48, 0.36, 0.04]}>
        <circleGeometry args={[0.13, 24]} />
        <meshBasicMaterial color="#0A0A0A" />
      </mesh>
      <mesh position={[0.48, 0.36, 0.04]}>
        <circleGeometry args={[0.13, 24]} />
        <meshBasicMaterial color="#0A0A0A" />
      </mesh>
      <mesh position={[0, -0.35, 0.06]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.5, 0.04, 12, 32, Math.PI]} />
        <meshBasicMaterial color="#0A0A0A" />
      </mesh>
    </group>
  );
}

function ProceduralFallback() {
  return (
    <>
      <GradientBackground />
      <Rectangles />
      <FaceMockup />
    </>
  );
}

function ReferencePlane({ referenceImage }: { referenceImage: string }) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new TextureLoader();
    const imagePath = staticFile(`placeholder-references/${referenceImage}`);

    setTexture(null);
    loader.load(
      imagePath,
      (loadedTexture) => {
        if (!cancelled) {
          loadedTexture.needsUpdate = true;
          setTexture(loadedTexture);
        }
      },
      undefined,
      () => {
        if (!cancelled) {
          setTexture(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [referenceImage]);

  if (!texture) {
    return <ProceduralFallback />;
  }

  return (
    <mesh>
      <planeGeometry args={[PLANE_WIDTH, PLANE_HEIGHT]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

export function PixelizePrototype({
  pixelSize,
  paletteSize,
  ditherEnabled,
  outlineEnabled,
  outlineThreshold,
  outlineThickness = 1,
  outlineColor = "#0A0A0A",
  referenceImage,
}: PixelizePrototypeProps) {
  return (
    <AbsoluteFill style={{ background: "#0A0A0A" }}>
      <ThreeCanvas
        width={1920}
        height={1080}
        orthographic
        camera={{ position: [0, 0, 10], zoom: 120 }}
      >
        <ReferencePlane referenceImage={referenceImage} />
        <EffectComposer>
          <PixelizeQuantize
            pixelSize={pixelSize}
            paletteSize={paletteSize}
            ditherEnabled={ditherEnabled}
            outlineEnabled={outlineEnabled}
            outlineThreshold={outlineThreshold}
            outlineThickness={outlineThickness}
            outlineColor={outlineColor}
          />
        </EffectComposer>
      </ThreeCanvas>
    </AbsoluteFill>
  );
}
