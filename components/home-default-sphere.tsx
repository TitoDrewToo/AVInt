"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export function HomeDefaultSphere({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
    renderer.setClearAlpha(0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0a1119, 0.02)

    const camera = new THREE.PerspectiveCamera(
      40,
      (container.clientWidth || 1) / (container.clientHeight || 1),
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

    const geometry = new THREE.BufferGeometry()
    const positions = sampleSphere(particleCount)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    const randoms = new Float32Array(particleCount)
    const baseColor = new THREE.Color(0xffffff)

    for (let i = 0; i < particleCount; i += 1) {
      colors[i * 3] = baseColor.r
      colors[i * 3 + 1] = baseColor.g
      colors[i * 3 + 2] = baseColor.b
      sizes[i] = 0.012 + Math.random() * 0.018
      randoms[i] = Math.random()
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aRandom;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uPixelRatio;

        void main() {
          vColor = color;
          vec3 pos = position;

          float breath = sin(uTime * 0.45 + aRandom * 6.28318) * 0.015;
          pos += normalize(pos) * breath;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = aSize * uPixelRatio * 460.0 / -mvPos.z;
          gl_PointSize = max(gl_PointSize, 1.5);
          gl_Position = projectionMatrix * mvPos;

          vAlpha = 0.9;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;

          float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vColor, alpha);
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

    const onResize = () => {
      const width = container.clientWidth || 1
      const height = container.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
    }

    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      material.uniforms.uTime.value = elapsed
      particles.rotation.y = elapsed * 0.08
      renderer.render(scene, camera)
    }

    window.addEventListener("resize", onResize)
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("resize", onResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={containerRef} aria-hidden className={className} />
}
