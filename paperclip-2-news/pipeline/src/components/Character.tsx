import { CharacterRig, type CharacterConfig, type EyeState, type MouthState, type PoseState } from "./CharacterRig";
import chloeConfig from "../characters/chloe/config.json";

const chloeAsset = (fileName: string) => new URL(`../characters/chloe/${fileName}`, import.meta.url).href;

const characterRegistry: Record<string, CharacterConfig> = {
  chloe: {
    ...chloeConfig,
    head: chloeAsset(chloeConfig.head),
    body: chloeAsset(chloeConfig.body),
    mouths: Object.fromEntries(Object.entries(chloeConfig.mouths).map(([key, fileName]) => [key, chloeAsset(fileName)])) as CharacterConfig["mouths"],
    eyes: Object.fromEntries(Object.entries(chloeConfig.eyes).map(([key, fileName]) => [key, chloeAsset(fileName)])) as CharacterConfig["eyes"],
    poses: Object.fromEntries(Object.entries(chloeConfig.poses).map(([key, fileName]) => [key, chloeAsset(fileName)])) as CharacterConfig["poses"],
  },
};

export type CharacterProps = {
  name?: string;
  mouthState?: MouthState;
  mouthCue?: MouthState;
  eyeState?: EyeState;
  pose?: PoseState;
  position?: [number, number, number];
  scale?: number;
};

export function Character({
  name = "chloe",
  mouthState,
  mouthCue,
  eyeState = "open",
  pose = "neutral",
  position = [0, 0, 0],
  scale = 1,
}: CharacterProps) {
  const config = characterRegistry[name];
  if (!config) throw new Error(`Unknown character: ${name}`);

  return (
    <CharacterRig
      config={config}
      mouthState={mouthState ?? mouthCue ?? "A"}
      eyeState={eyeState}
      pose={pose}
      position={position}
      scale={scale}
    />
  );
}
