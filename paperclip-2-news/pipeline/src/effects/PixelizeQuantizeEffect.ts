import { BlendFunction, Effect } from "postprocessing";
import { Color, Uniform, Vector2 } from "three";

const fragmentShader = `
uniform float pixelSize;
uniform float paletteSize;
uniform bool ditherEnabled;
uniform bool outlineEnabled;
uniform float outlineThreshold;
uniform float outlineThickness;
uniform vec3 outlineColor;
uniform vec2 sourceResolution;

float pixelizeLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float bayer4(vec2 uv) {
  vec2 p = mod(floor(uv * sourceResolution), 4.0);

  if (p.y < 0.5) {
    if (p.x < 0.5) return 0.0 / 16.0;
    if (p.x < 1.5) return 8.0 / 16.0;
    if (p.x < 2.5) return 2.0 / 16.0;
    return 10.0 / 16.0;
  }

  if (p.y < 1.5) {
    if (p.x < 0.5) return 12.0 / 16.0;
    if (p.x < 1.5) return 4.0 / 16.0;
    if (p.x < 2.5) return 14.0 / 16.0;
    return 6.0 / 16.0;
  }

  if (p.y < 2.5) {
    if (p.x < 0.5) return 3.0 / 16.0;
    if (p.x < 1.5) return 11.0 / 16.0;
    if (p.x < 2.5) return 1.0 / 16.0;
    return 9.0 / 16.0;
  }

  if (p.x < 0.5) return 15.0 / 16.0;
  if (p.x < 1.5) return 7.0 / 16.0;
  if (p.x < 2.5) return 13.0 / 16.0;
  return 5.0 / 16.0;
}

vec3 quantizeColor(vec3 color, vec2 uv) {
  float levels = max(paletteSize, 2.0);
  float maxIndex = max(levels - 1.0, 1.0);

  if (ditherEnabled) {
    float threshold = bayer4(uv);
    return clamp(floor(color * maxIndex + threshold) / maxIndex, 0.0, 1.0);
  }

  return clamp(floor(color * levels) / maxIndex, 0.0, 1.0);
}

float edgeStrength(vec2 uv) {
  vec2 stepUv = max(outlineThickness, 1.0) / sourceResolution;
  float center = pixelizeLuminance(texture2D(inputBuffer, uv).rgb);
  float left = pixelizeLuminance(texture2D(inputBuffer, uv - vec2(stepUv.x, 0.0)).rgb);
  float right = pixelizeLuminance(texture2D(inputBuffer, uv + vec2(stepUv.x, 0.0)).rgb);
  float up = pixelizeLuminance(texture2D(inputBuffer, uv + vec2(0.0, stepUv.y)).rgb);
  float down = pixelizeLuminance(texture2D(inputBuffer, uv - vec2(0.0, stepUv.y)).rgb);

  return max(
    max(abs(center - left), abs(center - right)),
    max(abs(center - up), abs(center - down))
  );
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 dxy = pixelSize / sourceResolution;
  vec2 snappedUV = dxy * floor(uv / dxy) + dxy * 0.5;
  vec4 sampled = texture2D(inputBuffer, snappedUV);
  vec3 quantized = quantizeColor(sampled.rgb, uv);

  if (outlineEnabled && edgeStrength(uv) > outlineThreshold) {
    outputColor = vec4(outlineColor, sampled.a);
    return;
  }

  outputColor = vec4(quantized, sampled.a);
}
`;

export type PixelizeQuantizeEffectOptions = {
  pixelSize?: number;
  paletteSize?: number;
  ditherEnabled?: boolean;
  outlineEnabled?: boolean;
  outlineThreshold?: number;
  outlineThickness?: number;
  outlineColor?: Color | string;
};

function createUniforms({
  pixelSize,
  paletteSize,
  ditherEnabled,
  outlineEnabled,
  outlineThreshold,
  outlineThickness,
  outlineColor,
}: Required<PixelizeQuantizeEffectOptions>) {
  const uniforms = new Map<string, Uniform>();
  uniforms.set("pixelSize", new Uniform(pixelSize));
  uniforms.set("paletteSize", new Uniform(paletteSize));
  uniforms.set("ditherEnabled", new Uniform(ditherEnabled));
  uniforms.set("outlineEnabled", new Uniform(outlineEnabled));
  uniforms.set("outlineThreshold", new Uniform(outlineThreshold));
  uniforms.set("outlineThickness", new Uniform(outlineThickness));
  uniforms.set("outlineColor", new Uniform(new Color(outlineColor)));
  uniforms.set("sourceResolution", new Uniform(new Vector2(1920, 1080)));
  return uniforms;
}

export class PixelizeQuantizeEffect extends Effect {
  constructor({
    pixelSize = 4,
    paletteSize = 8,
    ditherEnabled = false,
    outlineEnabled = false,
    outlineThreshold = 0.15,
    outlineThickness = 1,
    outlineColor = "#0A0A0A",
  }: PixelizeQuantizeEffectOptions = {}) {
    super("PixelizeQuantizeEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: createUniforms({
        pixelSize,
        paletteSize,
        ditherEnabled,
        outlineEnabled,
        outlineThreshold,
        outlineThickness,
        outlineColor,
      }),
    });
  }

  set pixelSize(value: number) {
    this.uniforms.get("pixelSize")!.value = value;
  }

  set paletteSize(value: number) {
    this.uniforms.get("paletteSize")!.value = value;
  }

  set ditherEnabled(value: boolean) {
    this.uniforms.get("ditherEnabled")!.value = value;
  }

  set outlineEnabled(value: boolean) {
    this.uniforms.get("outlineEnabled")!.value = value;
  }

  set outlineThreshold(value: number) {
    this.uniforms.get("outlineThreshold")!.value = value;
  }

  set outlineThickness(value: number) {
    this.uniforms.get("outlineThickness")!.value = value;
  }

  set outlineColor(value: Color | string) {
    this.uniforms.get("outlineColor")!.value = new Color(value);
  }

  setSize(width: number, height: number) {
    this.uniforms.get("sourceResolution")!.value.set(width, height);
  }
}
