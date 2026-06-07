/**
 * AnimatedGlobe - Three.js animated globe background
 *
 * A dark, sophisticated globe with:
 * - Wireframe grid overlay for tech aesthetic
 * - Pulsing glow effects
 * - Orbital rings with particles
 * - Connection arcs for network visualization
 * - Subtle continent hints without texture dependency
 */

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';

// =============================================================================
// GLOBE CORE - Dark sphere with wireframe overlay
// =============================================================================

function GlobeCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.03;
    }
    if (wireframeRef.current) {
      wireframeRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <group>
      {/* Solid dark core */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[2.5, 64, 64]} />
        <meshStandardMaterial
          color="#0a0a12"
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Wireframe overlay */}
      <mesh ref={wireframeRef}>
        <sphereGeometry args={[2.52, 32, 32]} />
        <meshBasicMaterial
          color="#17d9e3"
          wireframe
          transparent
          opacity={0.08}
        />
      </mesh>
    </group>
  );
}

// =============================================================================
// GLOW LAYERS - Multi-layered atmospheric glow
// =============================================================================

function GlowLayers() {
  return (
    <>
      {/* Inner glow */}
      <Sphere args={[2.55, 32, 32]}>
        <meshBasicMaterial
          color="#17d9e3"
          transparent
          opacity={0.03}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Mid glow */}
      <Sphere args={[2.7, 32, 32]}>
        <meshBasicMaterial
          color="#17d9e3"
          transparent
          opacity={0.015}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Outer glow */}
      <Sphere args={[2.9, 32, 32]}>
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.008}
          side={THREE.BackSide}
        />
      </Sphere>
    </>
  );
}

// =============================================================================
// GRID LINES - Latitude/Longitude grid
// =============================================================================

function GridLines() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  // Generate latitude lines
  const latitudeLines = useMemo(() => {
    const lines = [];
    const latitudes = [-60, -30, 0, 30, 60];

    for (const lat of latitudes) {
      const points = [];
      const radius = 2.53 * Math.cos((lat * Math.PI) / 180);
      const y = 2.53 * Math.sin((lat * Math.PI) / 180);

      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        ));
      }
      lines.push(points);
    }
    return lines;
  }, []);

  // Generate longitude lines
  const longitudeLines = useMemo(() => {
    const lines = [];
    const longitudes = 8;

    for (let i = 0; i < longitudes; i++) {
      const points = [];
      const angle = (i / longitudes) * Math.PI * 2;

      for (let j = 0; j <= 32; j++) {
        const phi = (j / 32) * Math.PI;
        points.push(new THREE.Vector3(
          2.53 * Math.sin(phi) * Math.cos(angle),
          2.53 * Math.cos(phi),
          2.53 * Math.sin(phi) * Math.sin(angle)
        ));
      }
      lines.push(points);
    }
    return lines;
  }, []);

  return (
    <group ref={groupRef}>
      {/* Latitude lines */}
      {latitudeLines.map((points, i) => (
        <Line
          key={`lat-${i}`}
          points={points}
          color="#17d9e3"
          lineWidth={0.5}
          transparent
          opacity={0.15}
        />
      ))}

      {/* Longitude lines */}
      {longitudeLines.map((points, i) => (
        <Line
          key={`lon-${i}`}
          points={points}
          color="#17d9e3"
          lineWidth={0.5}
          transparent
          opacity={0.12}
        />
      ))}
    </group>
  );
}

// =============================================================================
// ORBITAL RINGS - Tilted elliptical orbits
// =============================================================================

function OrbitalRing({
  radius,
  tilt,
  rotationSpeed,
  color,
  opacity = 0.25,
}: {
  radius: number;
  tilt: number;
  rotationSpeed: number;
  color: string;
  opacity?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const points = useMemo(() => {
    const pts = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ));
    }
    return pts;
  }, [radius]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * rotationSpeed;
    }
  });

  return (
    <group ref={groupRef} rotation={[tilt, 0, 0]}>
      <Line
        points={points}
        color={color}
        lineWidth={1}
        transparent
        opacity={opacity}
      />
    </group>
  );
}

// =============================================================================
// PARTICLES - Floating around the globe
// =============================================================================

function Particles({ count = 120 }) {
  const meshRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 3.5 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);
    }
    return pos;
  }, [count]);

  const sizes = useMemo(() => {
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      s[i] = 0.02 + Math.random() * 0.03;
    }
    return s;
  }, [count]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.015;
      meshRef.current.rotation.x += delta * 0.008;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#17d9e3"
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

// =============================================================================
// CONNECTION ARCS - Curved lines between points on globe
// =============================================================================

function ConnectionArcs() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  // Pre-defined connection points (simulated city locations)
  const connections = useMemo(() => {
    const pairs = [
      { from: { lat: 40, lon: -74 }, to: { lat: 51, lon: 0 } }, // NYC to London
      { from: { lat: 35, lon: 139 }, to: { lat: 37, lon: -122 } }, // Tokyo to SF
      { from: { lat: -33, lon: 151 }, to: { lat: 1, lon: 103 } }, // Sydney to Singapore
      { from: { lat: 22, lon: 114 }, to: { lat: 48, lon: 2 } }, // Hong Kong to Paris
    ];

    return pairs.map(({ from, to }) => {
      const points = [];
      const fromPos = latLonToVector3(from.lat, from.lon, 2.55);
      const toPos = latLonToVector3(to.lat, to.lon, 2.55);
      const midPoint = new THREE.Vector3()
        .addVectors(fromPos, toPos)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(3.2);

      // Create curved arc using quadratic bezier
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const point = new THREE.Vector3()
          .copy(fromPos)
          .multiplyScalar((1 - t) * (1 - t))
          .add(midPoint.clone().multiplyScalar(2 * (1 - t) * t))
          .add(toPos.clone().multiplyScalar(t * t));
        points.push(point);
      }
      return points;
    });
  }, []);

  return (
    <group ref={groupRef}>
      {connections.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#a855f7"
          lineWidth={1}
          transparent
          opacity={0.4}
        />
      ))}
    </group>
  );
}

// Helper to convert lat/lon to 3D coordinates
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// =============================================================================
// HOT SPOTS - Glowing points on globe surface
// =============================================================================

function HotSpots() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  const spots = useMemo(() => [
    { lat: 40, lon: -74 },   // NYC
    { lat: 51, lon: 0 },     // London
    { lat: 35, lon: 139 },   // Tokyo
    { lat: 37, lon: -122 },  // SF
    { lat: -33, lon: 151 },  // Sydney
    { lat: 1, lon: 103 },    // Singapore
    { lat: 22, lon: 114 },   // Hong Kong
    { lat: 48, lon: 2 },     // Paris
  ], []);

  return (
    <group ref={groupRef}>
      {spots.map((spot, i) => {
        const pos = latLonToVector3(spot.lat, spot.lon, 2.56);
        return (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color="#17d9e3" transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

// =============================================================================
// SCENE COMPOSITION
// =============================================================================

function Scene() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} color="#17d9e3" />
      <pointLight position={[0, 0, 5]} intensity={0.5} color="#a855f7" />

      {/* Globe layers */}
      <GlobeCore />
      <GlowLayers />
      <GridLines />
      <HotSpots />
      <ConnectionArcs />

      {/* Orbital decorations */}
      <OrbitalRing radius={3.8} tilt={0.4} rotationSpeed={0.08} color="#17d9e3" opacity={0.2} />
      <OrbitalRing radius={4.3} tilt={-0.6} rotationSpeed={-0.06} color="#a855f7" opacity={0.15} />
      <OrbitalRing radius={4.8} tilt={0.9} rotationSpeed={0.04} color="#17d9e3" opacity={0.1} />

      {/* Particles */}
      <Particles count={100} />
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AnimatedGlobe() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-70"
      style={{
        willChange: 'auto',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 9], fov: 40 }}
        style={{ background: 'transparent' }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        dpr={[1, 1.5]}
        frameloop="always"
        flat
      >
        <Scene />
      </Canvas>
    </div>
  );
}

export default AnimatedGlobe;
