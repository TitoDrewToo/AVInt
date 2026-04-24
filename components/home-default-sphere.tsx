"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import * as THREE from "three"

export function HomeDefaultSphere({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const geometryRef = useRef<THREE.BufferGeometry | null>(null)
  const colorBufferRef = useRef<Float32Array | null>(null)
  const particleCountRef = useRef(0)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const getViewportSize = () => ({
      width: window.innerWidth || 1,
      height: window.innerHeight || 1,
    })

    const { width: initialWidth, height: initialHeight } = getViewportSize()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(initialWidth, initialHeight)
    renderer.setClearAlpha(0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0a1119, 0.02)

    const camera = new THREE.PerspectiveCamera(
      40,
      initialWidth / initialHeight,
      0.1,
      100
    )
    camera.position.set(0, 0, 7.5)

    const ambient = new THREE.AmbientLight(0xffffff, 2.2)
    scene.add(ambient)

    const keyLight = new THREE.PointLight(0xffffff, 8, 40)
    keyLight.position.set(3, 3, 4)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight(0xffffff, 4, 40)
    fillLight.position.set(-3, -2, 3)
    scene.add(fillLight)

    const particleCount = 14000
    particleCountRef.current = particleCount

    function sampleSphere(count: number, radius = 1.65) {
      const positions = new Float32Array(count * 3)

      for (let i = 0; i < count; i += 1) {
        const u = Math.random()
        const v = Math.random()
        const theta = 2 * Math.PI * u
        const phi = Math.acos(2 * v - 1)

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
        positions[i * 3 + 2] = radius * Math.cos(phi)
      }

      return positions
    }

    function sampleDocument(count: number) {
      const positions = new Float32Array(count * 3)
      const width = 2.2
      const height = 2.85
      const depth = 0.18
      const cornerRadius = 0.2
      const foldWidth = 0.46
      const foldHeight = 0.46

      const clampCorner = (x: number, y: number) => {
        const xLimit = width / 2 - cornerRadius
        const yLimit = height / 2 - cornerRadius
        const absX = Math.abs(x)
        const absY = Math.abs(y)

        if (absX <= xLimit || absY <= yLimit) {
          return { x, y }
        }

        const cornerX = Math.sign(x) * xLimit
        const cornerY = Math.sign(y) * yLimit
        const dx = x - cornerX
        const dy = y - cornerY
        const length = Math.hypot(dx, dy) || 1

        return {
          x: cornerX + (dx / length) * cornerRadius,
          y: cornerY + (dy / length) * cornerRadius,
        }
      }

      for (let i = 0; i < count; i += 1) {
        const face = Math.random()
        let x = 0
        let y = 0
        let z = 0

        if (face < 0.72) {
          x = (Math.random() - 0.5) * width
          y = (Math.random() - 0.5) * height
          z = (Math.random() - 0.5) * depth

          if (x > width / 2 - foldWidth && y > height / 2 - foldHeight) {
            const foldMix = (x - (width / 2 - foldWidth)) / foldWidth
            z += foldMix * 0.2
            y -= foldMix * 0.08
          }

          const clamped = clampCorner(x, y)
          x = clamped.x
          y = clamped.y
        } else if (face < 0.86) {
          x = (Math.random() - 0.5) * width
          y = Math.random() < 0.5 ? -height / 2 : height / 2
          z = (Math.random() - 0.5) * depth
          const clamped = clampCorner(x, y)
          x = clamped.x
          y = clamped.y
        } else {
          x = Math.random() < 0.5 ? -width / 2 : width / 2
          y = (Math.random() - 0.5) * height
          z = (Math.random() - 0.5) * depth
          const clamped = clampCorner(x, y)
          x = clamped.x
          y = clamped.y
        }

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
      }

      return positions
    }

    function sampleLocation(count: number) {
      const positions = new Float32Array(count * 3)
      const lobes = [
        { x: -1.08, y: -0.12, z: 0, r: 0.72 },
        { x: -0.54, y: 0.12, z: 0, r: 0.82 },
        { x: 0.02, y: 0.18, z: 0, r: 0.96 },
        { x: 0.62, y: 0.1, z: 0, r: 0.84 },
        { x: 1.14, y: -0.08, z: 0, r: 0.68 },
        { x: -0.18, y: -0.34, z: 0, r: 1.02 },
        { x: 0.46, y: -0.3, z: 0, r: 0.9 },
      ]
      const rackXs = [-0.74, 0, 0.74]
      const rackWidth = 0.38
      const rackHeight = 1.18
      const rackDepth = 0.24
      const baseY = 1.18
      const sideRailX = 1.08

      for (let i = 0; i < count; i += 1) {
        const mode = Math.random()
        let x = 0
        let y = 0
        let z = 0

        if (mode < 0.7) {
          const lobe = lobes[Math.floor(Math.random() * lobes.length)]
          const u = Math.random()
          const v = Math.random()
          const theta = 2 * Math.PI * u
          const phi = Math.acos(2 * v - 1)
          const radius = lobe.r * (0.8 + Math.random() * 0.26)
          x = lobe.x + Math.sin(phi) * Math.cos(theta) * radius
          y = lobe.y + Math.sin(phi) * Math.sin(theta) * radius
          z = lobe.z + Math.cos(phi) * radius * 0.68
        } else if (mode < 0.94) {
          const rackX = rackXs[Math.floor(Math.random() * rackXs.length)]
          x = rackX + (Math.random() - 0.5) * rackWidth
          y = baseY + (Math.random() - 0.5) * rackHeight
          z = (Math.random() - 0.5) * rackDepth

          const slotChance = Math.random()
          if (slotChance < 0.82) {
            const slot = Math.floor(Math.random() * 5)
            y = baseY + rackHeight / 2 - 0.16 - slot * 0.235 + (Math.random() - 0.5) * 0.03
            x += (Math.random() - 0.5) * 0.06
            z = (Math.random() - 0.5) * 0.03
          }
        } else if (mode < 0.97) {
          const side = Math.random() < 0.5 ? -1 : 1
          x = side * sideRailX + (Math.random() - 0.5) * 0.05
          y = 0.88 + (Math.random() - 0.5) * 1.02
          z = (Math.random() - 0.5) * 0.12
        } else {
          const bridgeT = Math.random()
          x = -0.88 + bridgeT * 1.76 + (Math.random() - 0.5) * 0.05
          y = 0.84 + Math.sin(bridgeT * Math.PI) * 0.1 + (Math.random() - 0.5) * 0.04
          z = (Math.random() - 0.5) * 0.08
        }

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
      }

      return positions
    }

    function sampleVisualization(count: number) {
      const positions = new Float32Array(count * 3)

      const inNumberCardVoid = (x: number, y: number) => {
        const localX = x + 1.45
        const localY = y - 0.92

        const valueCut = Math.abs(localY + 0.05) < 0.03 && localX > -0.42 && localX < 0.16
        const subCut1 = Math.abs(localY - 0.1) < 0.018 && localX > -0.28 && localX < 0.04
        const subCut2 = Math.abs(localY - 0.2) < 0.018 && localX > -0.22 && localX < -0.02
        const currencyStem = Math.abs(localX + 0.26) < 0.012 && localY > -0.16 && localY < 0.12
        const currencyTop = Math.abs(localY + 0.1) < 0.012 && localX > -0.28 && localX < -0.16
        const currencyBottom = Math.abs(localY - 0.02) < 0.012 && localX > -0.32 && localX < -0.2
        const percentDot1 = Math.hypot(localX - 0.22, localY + 0.16) < 0.028
        const percentDot2 = Math.hypot(localX - 0.04, localY - 0.02) < 0.028
        const percentSlash = Math.abs((localY + 0.08) - (localX - 0.13) * 1.12) < 0.016 && localX > 0.04 && localX < 0.24

        return valueCut || subCut1 || subCut2 || currencyStem || currencyTop || currencyBottom || percentDot1 || percentDot2 || percentSlash
      }

      const inPieVoid = (x: number, y: number) => {
        const localX = x - 1.18
        const localY = y - 0.36
        const radius = Math.hypot(localX, localY)
        const angle = Math.atan2(localY, localX)

        if (radius > 0.54) return false

        const divider1 = Math.abs(angle - 0.15) < 0.055
        const divider2 = Math.abs(angle + 1.72) < 0.055
        const divider3 = Math.abs(angle - 2.65) < 0.055
        const centerHub = radius < 0.028
        if (divider1 || divider2 || divider3 || centerHub) return true

        return false
      }

      const inAreaVoid = (x: number, y: number) => {
        const localX = x + 0.16
        if (localX < 0.02 || localX > 1.72) return false

        const baseCut = Math.abs(y + 1.08) < 0.014
        const grid1 = Math.abs(y + 0.88) < 0.012
        const grid2 = Math.abs(y + 0.68) < 0.012
        const grid3 = Math.abs(y + 0.48) < 0.012
        const trendY = -1.08 + 0.18 + Math.sin(localX * 1.85) * 0.16 + Math.sin(localX * 3.1) * 0.05
        const trendCut = Math.abs(y - trendY) < 0.018

        return baseCut || grid1 || grid2 || grid3 || trendCut
      }

      for (let i = 0; i < count; i += 1) {
        const mode = Math.random()
        let x = 0
        let y = 0
        let z = 0
        let placed = false
        let guard = 0

        while (!placed && guard < 14) {
          guard += 1

          if (mode < 0.22) {
            // Number card
            x = -1.45 + (Math.random() - 0.5) * 0.78
            y = 0.92 + (Math.random() - 0.5) * 0.56
            z = (Math.random() - 0.5) * 0.08
            placed = !inNumberCardVoid(x, y)
          } else if (mode < 0.42) {
            // Line chart
            const t = Math.random()
            x = -0.28 + t * 1.18 + (Math.random() - 0.5) * 0.08
            let lineY = 0.62
            if (t < 0.34) {
              lineY += (t / 0.34) * 0.34
            } else if (t < 0.64) {
              lineY += 0.34 - ((t - 0.34) / 0.3) * 0.2
            } else {
              lineY += 0.14 + ((t - 0.64) / 0.36) * 0.46
            }
            y = lineY + Math.sin(t * Math.PI * 2.2) * 0.035 + (Math.random() - 0.5) * 0.055
            z = (Math.random() - 0.5) * 0.08
            placed = true
          } else if (mode < 0.62) {
            // Bars
            const bar = Math.floor(Math.random() * 4)
            const barHeights = [0.42, 0.82, 0.58, 1.02]
            const barX = -1.5 + bar * 0.38
            x = barX + (Math.random() - 0.5) * 0.22
            y = -0.74 + Math.random() * barHeights[bar]
            z = (Math.random() - 0.5) * 0.06
            placed = true
          } else if (mode < 0.8) {
            // Pie / radial
            const angle = Math.random() * Math.PI * 2
            const radius = Math.sqrt(Math.random()) * 0.52
            x = 1.18 + Math.cos(angle) * radius
            y = 0.36 + Math.sin(angle) * radius
            z = (Math.random() - 0.5) * 0.08
            placed = !inPieVoid(x, y)
          } else {
            // Area chart
            const t = Math.random()
            const curve = Math.sin(t * Math.PI) * 0.62 + Math.sin(t * Math.PI * 2.0) * 0.08
            x = -0.16 + t * 1.72 + (Math.random() - 0.5) * 0.08
            y = -1.08 + Math.random() * Math.max(0.18, curve + 0.22)
            z = (Math.random() - 0.5) * 0.08
            placed = !inAreaVoid(x, y)
          }
        }

        if (!placed) {
          x = (Math.random() - 0.5) * 0.2
          y = (Math.random() - 0.5) * 0.2
          z = (Math.random() - 0.5) * 0.04
        }

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
      }

      return positions
    }

    function sampleSignalDiamond(count: number) {
      const positions = new Float32Array(count * 3)

      for (let i = 0; i < count; i += 1) {
        const mode = Math.random()
        let x = 0
        let y = 0

        const angle = Math.random() * Math.PI * 2
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const horizontal = 1.2
        const vertical = 1.82
        const power = 2 / 3
        const edge = 1 / Math.pow(
          Math.pow(Math.abs(cosA) / horizontal, power) + Math.pow(Math.abs(sinA) / vertical, power),
          1 / power,
        )

        if (mode < 0.64) {
          const radius = edge * (0.82 + Math.random() * 0.2)
          x = cosA * radius + (Math.random() - 0.5) * 0.04
          y = sinA * radius + (Math.random() - 0.5) * 0.04
        } else if (mode < 0.92) {
          const radius = edge * Math.pow(Math.random(), 0.58)
          x = cosA * radius
          y = sinA * radius
        } else {
          const axis = Math.floor(Math.random() * 4)
          const axisAngle = axis * (Math.PI / 2)
          const length = axis % 2 === 0 ? horizontal : vertical
          const radius = Math.pow(Math.random(), 0.26) * length
          const width = 0.045 * (1 - radius / length)
          x = Math.cos(axisAngle) * radius + Math.cos(axisAngle + Math.PI / 2) * (Math.random() - 0.5) * width
          y = Math.sin(axisAngle) * radius + Math.sin(axisAngle + Math.PI / 2) * (Math.random() - 0.5) * width
        }

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.18
      }

      return positions
    }

    function sampleTerminalCloud(count: number) {
      const positions = new Float32Array(count * 3)
      const lobes = [
        { x: -0.86, y: -0.02, r: 0.74 },
        { x: -0.34, y: 0.22, r: 0.86 },
        { x: 0.28, y: 0.32, r: 0.98 },
        { x: 0.86, y: 0.02, r: 0.74 },
        { x: -0.1, y: -0.18, r: 1.18 },
      ]
      const glyphSegments = [
        [{ x: -0.46, y: 0.28 }, { x: -0.08, y: 0.02 }],
        [{ x: -0.08, y: 0.02 }, { x: -0.46, y: -0.24 }],
        [{ x: 0.08, y: -0.34 }, { x: 0.58, y: -0.34 }],
      ]

      for (let i = 0; i < count; i += 1) {
        const mode = Math.random()
        let x = 0
        let y = 0
        let z = 0

        if (mode < 0.68) {
          const lobe = lobes[Math.floor(Math.random() * lobes.length)]
          const angle = Math.random() * Math.PI * 2
          const radius = Math.sqrt(Math.random()) * lobe.r
          x = lobe.x + Math.cos(angle) * radius
          y = lobe.y + Math.sin(angle) * radius * 0.72
          z = (Math.random() - 0.5) * 0.22

          if (y < -0.82) y = -0.82 + Math.random() * 0.1
        } else if (mode < 0.9) {
          const [a, b] = glyphSegments[Math.floor(Math.random() * glyphSegments.length)]
          const t = Math.random()
          x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.08
          y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 0.08
          z = 0.18 + (Math.random() - 0.5) * 0.08
        } else {
          x = -1.25 + Math.random() * 2.5
          y = -0.72 + (Math.random() - 0.5) * 0.12
          z = (Math.random() - 0.5) * 0.14
        }

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
      }

      return positions
    }

    const geometry = new THREE.BufferGeometry()
    const spherePositions = sampleSphere(particleCount)
    const documentPositions = sampleDocument(particleCount)
    const locationPositions = sampleLocation(particleCount)
    const visualizationPositions = sampleVisualization(particleCount)
    const signalDiamondPositions = sampleSignalDiamond(particleCount)
    const terminalCloudPositions = sampleTerminalCloud(particleCount)
    const positions = new Float32Array(spherePositions)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    const randoms = new Float32Array(particleCount)
    for (let i = 0; i < particleCount; i += 1) {
      sizes[i] = 0.012 + Math.random() * 0.018
      randoms[i] = Math.random()
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1))
    geometryRef.current = geometry
    colorBufferRef.current = colors

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uDocumentSignal: { value: 0 },
        uLocationSignal: { value: 0 },
        uVisualizationSignal: { value: 0 },
        uVisualizationStage: { value: 0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aRandom;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDocInk;
        varying float vDocAccent;
        varying float vLocationPulse;
        varying float vVizGlow;
        varying float vVizDetail;
        varying float vVizAccent;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uDocumentSignal;
        uniform float uLocationSignal;
        uniform float uVisualizationSignal;
        uniform float uVisualizationStage;

        void main() {
          vColor = color;
          vec3 pos = position;

          float breath = sin(uTime * 0.45 + aRandom * 6.28318) * 0.015;
          pos += normalize(pos) * breath;

          float docFace = smoothstep(0.22, 0.02, abs(pos.z));
          float innerX = 1.0 - smoothstep(0.72, 1.02, abs(pos.x));
          float innerY = 1.0 - smoothstep(1.08, 1.38, abs(pos.y));
          float docMask = docFace * innerX * innerY * uDocumentSignal;

          float titleBand = (1.0 - smoothstep(0.06, 0.15, abs(pos.y - 0.94))) * smoothstep(0.34, 0.0, abs(pos.z));
          float bodyBand1 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y - 0.58));
          float bodyBand2 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y - 0.38));
          float bodyBand3 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y - 0.18));
          float bodyBand4 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y + 0.02));
          float bodyBand5 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y + 0.22));
          float bodyBand6 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y + 0.42));
          float bodyBand7 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y + 0.62));
          float bodyBand8 = 1.0 - smoothstep(0.028, 0.09, abs(pos.y + 0.82));
          float lineField = max(
            titleBand,
            max(
              bodyBand1,
              max(
                bodyBand2,
                max(
                  bodyBand3,
                  max(bodyBand4, max(bodyBand5, max(bodyBand6, max(bodyBand7, bodyBand8))))
                )
              )
            )
          );
          float lineMask = lineField * docMask;

          if (lineMask > 0.001) {
            float flow = sin((pos.y * 14.0) + uTime * 2.6 + aRandom * 12.0);
            pos.x += flow * 0.028 * lineMask;
            pos.z += cos(uTime * 1.8 + aRandom * 8.0) * 0.012 * lineMask;
          }

          vDocInk = lineMask;
          float docAccentPattern = step(0.68, sin(pos.x * 28.0 + pos.y * 9.0 + aRandom * 24.0 + uTime * 3.1));
          vDocAccent = lineMask * docAccentPattern;

          float rackDist = min(min(abs(pos.x + 0.74), abs(pos.x)), abs(pos.x - 0.74));
          float rackFace = (1.0 - smoothstep(0.0, 0.22, rackDist)) * smoothstep(0.72, 0.96, pos.y) * (1.0 - smoothstep(1.92, 2.06, pos.y)) * (1.0 - smoothstep(0.02, 0.08, abs(pos.z)));
          float rackBlinkBand1 = 1.0 - smoothstep(0.02, 0.07, abs(mod(pos.y - 0.82, 0.235) - 0.117));
          float rackBlinkBand2 = 1.0 - smoothstep(0.02, 0.07, abs(mod(pos.y - 0.94, 0.235) - 0.117));
          float rackBlinkPattern = max(rackBlinkBand1, rackBlinkBand2);
          float rackBlinkWave = 0.5 + 0.5 * sin(uTime * 5.6 + pos.y * 3.5 + aRandom * 10.0);
          vLocationPulse = rackFace * rackBlinkPattern * rackBlinkWave * uLocationSignal;

          float cardMask = (1.0 - smoothstep(0.48, 0.72, abs(pos.x + 1.45))) * (1.0 - smoothstep(0.28, 0.46, abs(pos.y - 0.92)));
          float lineT = clamp((pos.x + 0.28) / 1.18, 0.0, 1.0);
          float lineTarget = 0.62;
          if (lineT < 0.34) {
            lineTarget += (lineT / 0.34) * 0.34;
          } else if (lineT < 0.64) {
            lineTarget += 0.34 - ((lineT - 0.34) / 0.3) * 0.2;
          } else {
            lineTarget += 0.14 + ((lineT - 0.64) / 0.36) * 0.46;
          }
          lineTarget += sin(lineT * 6.28318) * 0.03;
          float lineMaskViz = (1.0 - smoothstep(0.1, 0.24, abs(pos.y - lineTarget))) * smoothstep(-0.32, -0.12, pos.x) * (1.0 - smoothstep(0.92, 1.08, pos.x));
          float barsMask = (1.0 - smoothstep(0.0, 0.24, abs(mod(pos.x + 1.5, 0.38) - 0.19))) * smoothstep(-1.28, -0.56, pos.y) * (1.0 - smoothstep(-0.02, 0.14, pos.y));
          vec2 pieLocalMask = vec2(pos.x - 1.18, pos.y - 0.36);
          float pieRadiusMask = length(pieLocalMask);
          float pieMask = 1.0 - smoothstep(0.44, 0.58, pieRadiusMask);
          float areaMask = smoothstep(-0.2, 0.0, pos.x) * (1.0 - smoothstep(1.6, 1.78, pos.x)) * smoothstep(-1.22, -1.0, pos.y) * (1.0 - smoothstep(-0.12, 0.1, pos.y));

          float cardReveal = smoothstep(0.0, 0.12, uVisualizationStage);
          float lineReveal = smoothstep(0.18, 0.32, uVisualizationStage);
          float barsReveal = smoothstep(0.38, 0.52, uVisualizationStage);
          float pieReveal = smoothstep(0.58, 0.72, uVisualizationStage);
          float areaReveal = smoothstep(0.78, 0.92, uVisualizationStage);

          float vizMask = (
            cardMask * cardReveal +
            lineMaskViz * lineReveal +
            barsMask * barsReveal +
            pieMask * pieReveal +
            areaMask * areaReveal
          ) * uVisualizationSignal;
          vVizGlow = min(vizMask, 1.0);

          // Number card internal detail: value line, currency mark, and percent badge.
          float cardLocalX = pos.x + 1.45;
          float cardLocalY = pos.y - 0.92;
          float cardValue = (1.0 - smoothstep(0.02, 0.06, abs(cardLocalY + 0.05))) * (1.0 - smoothstep(0.06, 0.38, abs(cardLocalX + 0.06)));
          float cardSub1 = (1.0 - smoothstep(0.016, 0.045, abs(cardLocalY - 0.1))) * (1.0 - smoothstep(0.0, 0.18, abs(cardLocalX + 0.1)));
          float cardSub2 = (1.0 - smoothstep(0.016, 0.045, abs(cardLocalY - 0.2))) * (1.0 - smoothstep(0.0, 0.14, abs(cardLocalX + 0.14)));
          float dollarStem = (1.0 - smoothstep(0.012, 0.035, abs(cardLocalX + 0.26))) * (1.0 - smoothstep(0.0, 0.16, abs(cardLocalY + 0.02)));
          float dollarTop = (1.0 - smoothstep(0.012, 0.04, abs(cardLocalY + 0.1))) * (1.0 - smoothstep(0.0, 0.06, abs(cardLocalX + 0.22)));
          float dollarBottom = (1.0 - smoothstep(0.012, 0.04, abs(cardLocalY - 0.02))) * (1.0 - smoothstep(0.0, 0.06, abs(cardLocalX + 0.3)));
          float percentCircle1 = 1.0 - smoothstep(0.012, 0.032, abs(length(vec2(cardLocalX - 0.22, cardLocalY + 0.16)) - 0.026));
          float percentCircle2 = 1.0 - smoothstep(0.012, 0.032, abs(length(vec2(cardLocalX - 0.04, cardLocalY - 0.02)) - 0.026));
          float percentSlash = (1.0 - smoothstep(0.012, 0.032, abs((cardLocalY + 0.08) - (cardLocalX - 0.13) * 1.12))) * smoothstep(0.02, 0.2, cardLocalX + 0.2) * (1.0 - smoothstep(0.18, 0.34, cardLocalX + 0.2));
          float cardDetail = max(cardValue, max(cardSub1, max(cardSub2, max(dollarStem, max(dollarTop, max(dollarBottom, max(percentCircle1, max(percentCircle2, percentSlash))))))));
          cardDetail *= cardReveal * cardMask * uVisualizationSignal;

          // Pie chart dividers and segmentation.
          vec2 pieLocal = vec2(pos.x - 1.18, pos.y - 0.36);
          float pieAngle = atan(pieLocal.y, pieLocal.x);
          float pieRadius = length(pieLocal);
          float pieInner = smoothstep(0.04, 0.1, pieRadius);
          float pieOuter = 1.0 - smoothstep(0.42, 0.54, pieRadius);
          float pieDivider1 = (1.0 - smoothstep(0.02, 0.06, abs(pieAngle - 0.15))) * pieInner * pieOuter;
          float pieDivider2 = (1.0 - smoothstep(0.02, 0.06, abs(pieAngle + 1.72))) * pieInner * pieOuter;
          float pieDivider3 = (1.0 - smoothstep(0.02, 0.06, abs(pieAngle - 2.65))) * pieInner * pieOuter;
          float pieCenter = 1.0 - smoothstep(0.0, 0.028, pieRadius);
          float pieSlice1 = smoothstep(-0.1, 0.06, pieAngle) * (1.0 - smoothstep(0.98, 1.14, pieAngle));
          float pieSlice2 = smoothstep(-2.0, -1.86, pieAngle) * (1.0 - smoothstep(-1.16, -1.02, pieAngle));
          float pieSliceAccent = max(pieSlice1, pieSlice2) * smoothstep(0.08, 0.18, pieRadius) * (1.0 - smoothstep(0.34, 0.48, pieRadius));
          float pieDetail = max(pieDivider1, max(pieDivider2, max(pieDivider3, pieCenter))) * pieReveal * pieMask * uVisualizationSignal;

          // Area chart detail: baseline, trend edge, and internal grid.
          float areaX = pos.x + 0.16;
          float areaBase = (1.0 - smoothstep(0.012, 0.04, abs(pos.y + 1.08))) * smoothstep(0.02, 0.14, areaX) * (1.0 - smoothstep(1.66, 1.78, areaX));
          float areaTrend = 0.18 + sin(areaX * 1.85) * 0.16 + sin(areaX * 3.1) * 0.05;
          float areaEdge = (1.0 - smoothstep(0.02, 0.055, abs((pos.y + 1.08) - areaTrend))) * smoothstep(0.02, 0.14, areaX) * (1.0 - smoothstep(1.66, 1.78, areaX));
          float areaGrid1 = (1.0 - smoothstep(0.01, 0.03, abs(pos.y + 0.88))) * smoothstep(0.02, 0.14, areaX) * (1.0 - smoothstep(1.66, 1.78, areaX));
          float areaGrid2 = (1.0 - smoothstep(0.01, 0.03, abs(pos.y + 0.68))) * smoothstep(0.02, 0.14, areaX) * (1.0 - smoothstep(1.66, 1.78, areaX));
          float areaGrid3 = (1.0 - smoothstep(0.01, 0.03, abs(pos.y + 0.48))) * smoothstep(0.02, 0.14, areaX) * (1.0 - smoothstep(1.66, 1.78, areaX));
          float areaDetail = max(areaBase, max(areaEdge, max(areaGrid1, max(areaGrid2, areaGrid3)))) * areaReveal * areaMask * uVisualizationSignal;

          vVizDetail = min(cardDetail + pieDetail + areaDetail, 1.0);
          float vizAccentPattern = step(0.74, sin(pos.x * 22.0 - pos.y * 11.0 + aRandom * 20.0 + uTime * 2.7));
          float vizAccentSource = max(lineMaskViz * lineReveal, max(cardDetail, max(max(pieDetail, pieSliceAccent * pieReveal * pieMask * uVisualizationSignal), areaDetail)));
          vVizAccent = min(vizAccentSource * vizAccentPattern * uVisualizationSignal, 1.0);

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = aSize * uPixelRatio * 460.0 / -mvPos.z;
          gl_PointSize += vDocInk * 2.1;
          gl_PointSize += vDocAccent * 1.3;
          gl_PointSize += vLocationPulse * 3.2;
          gl_PointSize += vVizGlow * 2.0;
          gl_PointSize += vVizDetail * 1.6;
          gl_PointSize += vVizAccent * 1.2;
          gl_PointSize = max(gl_PointSize, 1.5);
          gl_Position = projectionMatrix * mvPos;

          vAlpha = 0.9 + vDocInk * 0.16 + vDocAccent * 0.08 + vLocationPulse * 0.18 + vVizGlow * 0.14 + vVizDetail * 0.18 + vVizAccent * 0.08;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDocInk;
        varying float vDocAccent;
        varying float vLocationPulse;
        varying float vVizGlow;
        varying float vVizDetail;
        varying float vVizAccent;

        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;

          float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
          vec3 inkColor = mix(vColor, vec3(1.0), vDocInk * 0.32);
          vec3 docAccentColor = mix(inkColor, vec3(0.95, 0.12, 0.12), vDocAccent * 0.94);
          vec3 pulseAccent = mix(docAccentColor, vec3(0.95, 0.12, 0.12), vLocationPulse * 0.92);
          vec3 vizBase = mix(pulseAccent, vec3(1.0), vVizGlow * 0.36 + vVizDetail * 0.42);
          vec3 vizColor = mix(vizBase, vec3(0.95, 0.12, 0.12), vVizAccent * 0.9);
          gl_FragColor = vec4(vizColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    })

    const particles = new THREE.Points(geometry, material)
    particles.rotation.x = -0.18
    scene.add(particles)

    const clock = new THREE.Clock()
    let frameId = 0
    let currentSpinVelocity = 0.08
    let isMouseDown = false
    let lastMouseX = 0
    const morphDuration = 2.6
    const holdDuration = 6
    const visualizationHoldDuration = 3.8
    const abstractHoldDuration = 2.9

    const onResize = () => {
      const { width, height } = getViewportSize()
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
    }

    const easeInOutCubic = (t: number) =>
      t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2

    const onMouseMove = (event: MouseEvent) => {
      if (!isMouseDown) return
      const deltaX = event.clientX - lastMouseX
      lastMouseX = event.clientX
      particles.rotation.y += deltaX * 0.012
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      isMouseDown = true
      lastMouseX = event.clientX
    }

    const onMouseUp = () => {
      isMouseDown = false
    }

    const onWindowBlur = () => {
      isMouseDown = false
    }

    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      material.uniforms.uTime.value = elapsed
      particles.rotation.y += currentSpinVelocity * 0.016

      const cycleDuration =
        holdDuration +
        morphDuration +
        holdDuration +
        morphDuration +
        holdDuration +
        morphDuration +
        visualizationHoldDuration +
        morphDuration +
        abstractHoldDuration +
        morphDuration +
        abstractHoldDuration +
        morphDuration
      const cycleTime = elapsed % cycleDuration
      let source = spherePositions
      let target = spherePositions
      let progress = 0
      const documentStart = holdDuration
      const documentHoldStart = documentStart + morphDuration
      const locationStart = documentHoldStart + holdDuration
      const locationHoldStart = locationStart + morphDuration
      const visualizationStart = locationHoldStart + holdDuration
      const visualizationHoldStart = visualizationStart + morphDuration
      const signalDiamondStart = visualizationHoldStart + visualizationHoldDuration
      const signalDiamondHoldStart = signalDiamondStart + morphDuration
      const terminalCloudStart = signalDiamondHoldStart + abstractHoldDuration
      const terminalCloudHoldStart = terminalCloudStart + morphDuration
      const sphereReturnStart = terminalCloudHoldStart + abstractHoldDuration

      if (cycleTime < documentStart) {
        source = spherePositions
        target = spherePositions
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < documentHoldStart) {
        source = spherePositions
        target = documentPositions
        progress = easeInOutCubic((cycleTime - documentStart) / morphDuration)
        material.uniforms.uDocumentSignal.value = progress
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < locationStart) {
        source = documentPositions
        target = documentPositions
        material.uniforms.uDocumentSignal.value = 1
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < locationHoldStart) {
        source = documentPositions
        target = locationPositions
        progress = easeInOutCubic((cycleTime - locationStart) / morphDuration)
        material.uniforms.uDocumentSignal.value = 1 - progress
        material.uniforms.uLocationSignal.value = progress
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < visualizationStart) {
        source = locationPositions
        target = locationPositions
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 1
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < visualizationHoldStart) {
        source = locationPositions
        target = visualizationPositions
        progress = easeInOutCubic((cycleTime - visualizationStart) / morphDuration)
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 1 - progress
        material.uniforms.uVisualizationSignal.value = progress
        material.uniforms.uVisualizationStage.value = progress * 0.28
      } else if (cycleTime < signalDiamondStart) {
        source = visualizationPositions
        target = visualizationPositions
        const vizTime = cycleTime - visualizationHoldStart
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 1
        material.uniforms.uVisualizationStage.value = Math.min(vizTime / visualizationHoldDuration, 1)
      } else if (cycleTime < signalDiamondHoldStart) {
        source = visualizationPositions
        target = signalDiamondPositions
        progress = easeInOutCubic((cycleTime - signalDiamondStart) / morphDuration)
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 1 - progress
        material.uniforms.uVisualizationStage.value = 1 - progress
      } else if (cycleTime < terminalCloudStart) {
        source = signalDiamondPositions
        target = signalDiamondPositions
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < terminalCloudHoldStart) {
        source = signalDiamondPositions
        target = terminalCloudPositions
        progress = easeInOutCubic((cycleTime - terminalCloudStart) / morphDuration)
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else if (cycleTime < sphereReturnStart) {
        source = terminalCloudPositions
        target = terminalCloudPositions
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      } else {
        source = terminalCloudPositions
        target = spherePositions
        progress = easeInOutCubic((cycleTime - sphereReturnStart) / morphDuration)
        material.uniforms.uDocumentSignal.value = 0
        material.uniforms.uLocationSignal.value = 0
        material.uniforms.uVisualizationSignal.value = 0
        material.uniforms.uVisualizationStage.value = 0
      }

      const positionAttr = geometry.attributes.position.array as Float32Array
      for (let i = 0; i < positionAttr.length; i += 1) {
        positionAttr[i] = source[i] + (target[i] - source[i]) * progress
      }
      geometry.attributes.position.needsUpdate = true

      renderer.render(scene, camera)
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("mousedown", onMouseDown, true)
    window.addEventListener("mousemove", onMouseMove, true)
    window.addEventListener("mouseup", onMouseUp, true)
    window.addEventListener("blur", onWindowBlur)
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("mousedown", onMouseDown, true)
      window.removeEventListener("mousemove", onMouseMove, true)
      window.removeEventListener("mouseup", onMouseUp, true)
      window.removeEventListener("blur", onWindowBlur)
      geometryRef.current = null
      colorBufferRef.current = null
      particleCountRef.current = 0
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const geometry = geometryRef.current
    const colors = colorBufferRef.current
    const particleCount = particleCountRef.current
    if (!geometry || !colors || particleCount === 0) return

    const isDark = resolvedTheme === "dark"
    const dominantColor = new THREE.Color(isDark ? 0xffffff : 0xd11f1f)
    const supportColor = new THREE.Color(isDark ? 0xd11f1f : 0x111111)
    const mixedColor = new THREE.Color()

    for (let i = 0; i < particleCount; i += 1) {
      const supportMix = isDark
        ? (Math.random() < 0.18 ? 0.22 + Math.random() * 0.18 : Math.random() * 0.045)
        : (Math.random() < 0.2 ? 0.24 + Math.random() * 0.2 : Math.random() * 0.05)
      mixedColor.copy(dominantColor).lerp(supportColor, supportMix)
      colors[i * 3] = mixedColor.r
      colors[i * 3 + 1] = mixedColor.g
      colors[i * 3 + 2] = mixedColor.b
    }

    geometry.attributes.color.needsUpdate = true
  }, [resolvedTheme])

  return <div ref={containerRef} aria-hidden className={className} />
}
