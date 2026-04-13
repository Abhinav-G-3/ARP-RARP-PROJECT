import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import Node from './Node';
import Signal from './Signal';
import { useSimulation } from '../SimulationContext';

export default function Scene() {
  const { initialNodes } = useSimulation();

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }}>
      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
        <color attach="background" args={['#0a0a0f']} />
        
        {/* Ambient and directional light */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />
        
        {/* Starry anti-gravity background */}
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <Suspense fallback={null}>
          {/* Nodes */}
          {initialNodes.map((node) => (
            <Node key={node.id} {...node} />
          ))}
          
          {/* Traveling Signals */}
          <Signal />
          
          <Environment preset="city" />
        </Suspense>

        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          maxDistance={20}
          minDistance={5}
          autoRotate={true}
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}
