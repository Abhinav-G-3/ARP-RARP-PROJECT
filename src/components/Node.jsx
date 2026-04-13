import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Sphere, Float, Octahedron, Box } from '@react-three/drei';
import { useSimulation } from '../SimulationContext';

export default function Node({ id, ip, mac, position, type, active }) {
  const meshRef = useRef();
  const { mode, scenario, step } = useSimulation();

  const isServer = type === 'server' || type === 'backup_server';
  const isRouter = type === 'router';
  const isMalicious = type === 'malicious';
  const isGuardian = type === 'guardian';
  
  let color = '#3b82f6';
  if (isServer) color = '#a855f7';
  if (isRouter) color = '#10b981';
  if (isMalicious) color = '#ef4444'; // Red
  if (isGuardian) color = '#06b6d4'; // Cyan
  
  if (!active) {
    color = '#4b5563'; // Gray out inactive/offline nodes
  }

  // Activity scale modifier
  useFrame((state) => {
    if (meshRef.current) {
        if (isGuardian) {
           meshRef.current.rotation.y += 0.02; // Guardian spinning
        }
    }
  });

  return (
    <Float
      speed={active ? 2 : 0.5} 
      rotationIntensity={active ? 0.3 : 0.1} 
      floatIntensity={active ? 1.0 : 0.2} 
    >
      <mesh ref={meshRef} position={position}>
        {isGuardian ? (
            <Octahedron args={[0.8, 1]}>
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive() ? 1.5 : 0.5} wireframe={true}/>
              <Html position={[0, -1.2, 0]} center zIndexRange={[100, 0]}>
                 <div className="node-label active" style={{ borderColor: color, boxShadow: `0 0 10px ${color}`}}>
                    <div style={{color}}>{type.toUpperCase()}</div>
                 </div>
              </Html>
            </Octahedron>
        ) : isMalicious ? (
            <Box args={[0.8, 0.8, 0.8]}>
               <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive() ? 1.5 : 0.4} roughness={0.5} />
               <Html position={[0, -1, 0]} center zIndexRange={[100, 0]}>
                 <div className={`node-label ${isActive() ? 'active' : ''}`} style={{ borderColor: color }}>
                    <div style={{color}}>{type.toUpperCase()}</div>
                    <div className="ip">{ip}</div>
                    <div className="mac">{mac}</div>
                 </div>
               </Html>
            </Box>
        ) : (
            <>
                <sphereGeometry args={[isServer || isRouter ? 0.6 : 0.5, 32, 32]} />
                <meshStandardMaterial 
                  color={color} 
                  emissive={color}
                  emissiveIntensity={isActive() ? 0.8 : 0.1}
                  transparent
                  opacity={active ? 0.9 : 0.5}
                />
                <Sphere args={[isServer || isRouter ? 0.8 : 0.7, 16, 16]}>
                  <meshBasicMaterial color={color} transparent opacity={isActive() ? 0.2 : 0.05} depthWrite={false} />
                </Sphere>
                <Html position={[0, -1, 0]} center zIndexRange={[100, 0]}>
                  <div className={`node-label ${isActive() ? 'active' : ''}`} style={{ opacity: active ? 1 : 0.5 }}>
                    <div style={{ fontWeight: 'bold' }}>{type.toUpperCase()} ({id})</div>
                    <div className="ip">{!active ? 'OFFLINE' : ip}</div>
                    <div className="mac">{mac}</div>
                  </div>
                </Html>
            </>
        )}
      </mesh>
    </Float>
  );

  function isActive() {
     // A super basic activity toggle based on step
     if (!active) return false;
     if (step === 0 || step === 4) return false;
     if (isGuardian && scenario === 'arp_spoof' && step === 2) return true;
     if (isMalicious && scenario === 'arp_spoof' && step === 2) return true;
     if (id === 'n1') return true;
     return false;
  }
}
