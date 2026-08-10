import { Composition } from "remotion";
import { z } from "zod";
import { PixelizePrototype } from "./compositions/PixelizePrototype";
import { SmokeTest } from "./compositions/SmokeTest";

const pixelizePrototypeSchema = z.object({
  pixelSize: z.number().int().min(1).max(12),
  paletteSize: z.number().int().min(2).max(32),
  ditherEnabled: z.boolean(),
  outlineEnabled: z.boolean(),
  outlineThreshold: z.number().min(0.05).max(0.5),
  outlineThickness: z.number().int().min(1).max(4),
  outlineColor: z.string(),
  referenceImage: z.string(),
});

export function Root() {
  return (
    <>
      <Composition
        id="smoke-test"
        component={SmokeTest}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="pixelize-prototype"
        component={PixelizePrototype}
        schema={pixelizePrototypeSchema}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          pixelSize: 4,
          paletteSize: 8,
          ditherEnabled: false,
          outlineEnabled: false,
          outlineThreshold: 0.15,
          outlineThickness: 1,
          outlineColor: "#0A0A0A",
          referenceImage: "character-test.png",
        }}
      />
    </>
  );
}
