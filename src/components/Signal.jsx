import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulation } from '../SimulationContext';

export default function Signal() {
  const { packets, initialNodes, speed, handlePacketsReached } = useSimulation();
  
  return (
    <>
      {packets.map(packet => (
        <PacketParticle 
          key={packet.id} 
          packet={packet} 
          nodes={initialNodes}
          speed={speed}
          onReach={() => handlePacketsReached([packet])}
        />
      ))}
    </>
  );
}

function PacketParticle({ packet, nodes, speed, onReach }) {
  const meshRef = useRef();
  const [progress, setProgress] = useState(0);
  const [hasReached, setHasReached] = useState(false);
  
  const sourceNode = nodes.find(n => n.id === packet.sourceId);
  const targetNode = nodes.find(n => n.id === packet.targetId);
  
  if (!sourceNode || !targetNode) return null;

  const startVec = new THREE.Vector3(...sourceNode.position);
  const endVec = new THREE.Vector3(...targetNode.position);
  
  const isBeam = packet.type === 'guardian-beam';
  
  const midX = (startVec.x + endVec.x) / 2;
  const midY = (startVec.y + endVec.y) / 2 + (isBeam ? 0 : 1); 
  const midZ = (startVec.z + endVec.z) / 2;
  const controlVec = new THREE.Vector3(midX, midY, midZ);
  
  const curve = new THREE.QuadraticBezierCurve3(startVec, controlVec, endVec);

  const localSpeed = isBeam ? 1.5 : 0.4;

  useFrame((state, delta) => {
    if (hasReached) return;
    
    let actualDelta = delta;
    if (packet.delay) {
       actualDelta = 0; // simplistic delay logic: we just rely on parent spawning it slightly later, but we didn't implement real setTimeout
    }

    const newProgress = Math.min(progress + actualDelta * localSpeed * speed, 1);
    setProgress(newProgress);
    
    if (meshRef.current) {
        const position = curve.getPoint(newProgress);
        meshRef.current.position.copy(position);
        
        if (isBeam) {
           // Stretch the beam
           const nextPos = curve.getPoint(Math.min(newProgress + 0.1, 1));
           meshRef.current.lookAt(nextPos);
        }
    }
    
    if (newProgress >= 0.95 && meshRef.current) {
        const scale = (1 - newProgress) * 20; 
        meshRef.current.scale.set(scale, scale, scale);
    }
    
    if (newProgress >= 1 && !hasReached) {
      setHasReached(true);
      onReach();
    }
  });

  return (
    <mesh ref={meshRef} position={startVec}>
      {isBeam ? (
         <cylinderGeometry args={[0.05, 0.05, 0.5, 8]} />
      ) : (
         <sphereGeometry args={[0.15, 16, 16]} />
      )}
      
      <meshStandardMaterial 
        color={packet.color} 
        emissive={packet.color}
        emissiveIntensity={isBeam ? 4 : 2}
        transparent
        opacity={0.8}
      />
      <pointLight color={packet.color} intensity={0.5} distance={3} />
    </mesh>
  );
}
