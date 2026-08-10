import { forwardRef, useLayoutEffect, useMemo } from "react";
import type { Ref } from "react";
import { Color } from "three";
import {
  PixelizeQuantizeEffect,
  type PixelizeQuantizeEffectOptions,
} from "./PixelizeQuantizeEffect";

export type PixelizeQuantizeProps = PixelizeQuantizeEffectOptions;

export const PixelizeQuantize = forwardRef<
  PixelizeQuantizeEffect,
  PixelizeQuantizeProps
>(function PixelizeQuantize(
  {
    pixelSize = 4,
    paletteSize = 8,
    ditherEnabled = false,
    outlineEnabled = false,
    outlineThreshold = 0.15,
    outlineThickness = 1,
    outlineColor = "#0A0A0A",
  },
  ref: Ref<PixelizeQuantizeEffect>,
) {
  const effect = useMemo(
    () =>
      new PixelizeQuantizeEffect({
        pixelSize,
        paletteSize,
        ditherEnabled,
        outlineEnabled,
        outlineThreshold,
        outlineThickness,
        outlineColor,
      }),
    [],
  );

  useLayoutEffect(() => {
    effect.pixelSize = pixelSize;
    effect.paletteSize = paletteSize;
    effect.ditherEnabled = ditherEnabled;
    effect.outlineEnabled = outlineEnabled;
    effect.outlineThreshold = outlineThreshold;
    effect.outlineThickness = outlineThickness;
    effect.outlineColor =
      outlineColor instanceof Color ? outlineColor : new Color(outlineColor);
  }, [
    ditherEnabled,
    effect,
    outlineColor,
    outlineEnabled,
    outlineThickness,
    outlineThreshold,
    paletteSize,
    pixelSize,
  ]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
