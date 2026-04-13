import React, { createContext, useContext, useState, useRef } from 'react';

const SimulationContext = createContext(null);

export const useSimulation = () => useContext(SimulationContext);

const baseNodes = [
  { id: 'n1', ip: '192.168.1.10', mac: 'AA:11', position: [-5, 1, 0], type: 'computer' },
  { id: 'n2', ip: '192.168.1.20', mac: 'BB:22', position: [2, -2, 3], type: 'server' }, // Primary Server
  { id: 'n4', ip: '192.168.1.21', mac: 'BB:33', position: [5, -1, 2], type: 'backup_server' }, // Backup
  { id: 'n3', ip: '192.168.1.30', mac: 'CC:44', position: [4, 2, -2], type: 'computer' },
  { id: 'router', ip: '192.168.1.1', mac: 'DD:55', position: [0, 4, -4], type: 'router' },
  { id: 'm1', ip: '192.168.1.99', mac: 'EE:66', position: [-2, -3, 0], type: 'malicious' }, // Hacker
  { id: 'g1', ip: 'AI.0.0.1', mac: 'AI:AI', position: [0, 6, 0], type: 'guardian' }, // Guardian
];

export const SimulationProvider = ({ children }) => {
  const [mode, setMode] = useState('ARP'); // ARP or RARP
  const [scenario, setScenario] = useState('normal'); // 'normal', 'arp_spoof', 'rarp_offline'
  
  const [step, setStep] = useState(0); 
  const [speed, setSpeed] = useState(1);
  const [packets, setPackets] = useState([]);
  
  const [narration, setNarration] = useState("Select a scenario and click Start.");
  const [logs, setLogs] = useState([]); // AI Guardian logs
  
  const packetIdRef = useRef(0);
  const addLog = (msg, type='info') => setLogs(prev => [...prev.slice(-4), { msg, type }]);

  // Determine active nodes based on scenario
  const initialNodes = baseNodes.map(n => {
    if (n.type === 'malicious') return { ...n, active: scenario === 'arp_spoof' };
    if (n.type === 'server') return { ...n, active: !(scenario === 'rarp_offline' && step >= 1 && step < 4) }; // simulated offline
    return { ...n, active: true };
  });

  const resetSimulation = (newMode = mode, newScenario = scenario) => {
    setMode(newMode);
    setScenario(newScenario);
    setStep(0);
    setPackets([]);
    setLogs([]);
    setNarration("Simulation Reset. Ready to start.");
  };

  const startSimulation = () => {
    if (step !== 0 && step !== 4) {
      resetSimulation(mode, scenario);
      return;
    }
    
    setStep(1);
    setLogs([]);
    
    if (mode === 'ARP') {
      if (scenario === 'arp_spoof') {
        setNarration("Step 1: Node 1 Broadcasts ARP Request.");
        addLog("Guardian AI Online. Monitoring network traffic.", "info");
        setPackets([
          { id: `p${packetIdRef.current++}`, sourceId: 'n1', targetId: 'n3', type: 'arp-req', color: '#3b82f6' },
          { id: `p${packetIdRef.current++}`, sourceId: 'n1', targetId: 'm1', type: 'arp-req', color: '#3b82f6' },
        ]);
      } else {
        setNarration("Step 1: Broadcast ARP Request ('Who has 192.168.1.30?')");
        setPackets([
          { id: `p${packetIdRef.current++}`, sourceId: 'n1', targetId: 'n3', type: 'arp-req', color: '#3b82f6' },
        ]);
      }
    } else { // RARP
       if (scenario === 'rarp_offline') {
         setNarration("Step 1: Node 1 Broadcasts RARP Request. Primary Server is offline.");
         addLog("Primary Server [BB:22] ping timeout.", "warning");
         setPackets([
           { id: `p${packetIdRef.current++}`, sourceId: 'n1', targetId: 'n2', type: 'rarp-req', color: '#a855f7' },
         ]);
       } else {
         setNarration("Step 1: Broadcast RARP Request ('What is my IP?')");
         setPackets([
           { id: `p${packetIdRef.current++}`, sourceId: 'n1', targetId: 'n2', type: 'rarp-req', color: '#a855f7' },
         ]);
       }
    }
  };

  const handlePacketsReached = (completedPackets) => {
    if (step === 1) { // After step 1
       if (mode === 'ARP' && scenario === 'arp_spoof') {
           setStep(2); // Spoof Step
           setPackets([]);
           setNarration("Step 2: Malicious Node sends fake ARP Reply! Guardian activates.");
           addLog("Alert! Unsolicited ARP Reply detected from [EE:66].", "error");
           // Hacker sends reply, Guardian sends beam to intercept
           setPackets([
             { id: `p${packetIdRef.current++}`, sourceId: 'm1', targetId: 'n1', type: 'arp-reply-spoofed', color: '#ef4444' }, // Red
             { id: `p${packetIdRef.current++}`, sourceId: 'g1', targetId: 'm1', type: 'guardian-beam', color: '#06b6d4', delay: 0.5 }, // Cyan intercept
           ]);
       } else if (mode === 'RARP' && scenario === 'rarp_offline') {
           setStep(2); // Offline step
           setPackets([]);
           setNarration("Timeout: Primary Server failed. Switching to Backup...");
           addLog("No response from Primary. Failing over to Backup Server.", "info");
           setTimeout(() => {
             setStep(3); // Retry
             setNarration("Step 2: Guardian redirects RARP to Backup Server.");
             setPackets([
               { id: `p${packetIdRef.current++}`, sourceId: 'n1', targetId: 'n4', type: 'rarp-req', color: '#a855f7' },
             ]);
           }, 1000);
       } else {
           setStep(2);
           setPackets([]);
           if (mode === 'ARP') {
             setNarration("Step 2: Target Node sends legit ARP Reply.");
             setPackets([{ id: `p${packetIdRef.current++}`, sourceId: 'n3', targetId: 'n1', type: 'arp-reply', color: '#10b981' }]);
           } else {
             setNarration("Step 2: Server assigns IP and sends RARP Reply.");
             setPackets([{ id: `p${packetIdRef.current++}`, sourceId: 'n2', targetId: 'n1', type: 'rarp-reply', color: '#f97316' }]);
           }
       }
    } 
    else if (step === 2 && mode === 'ARP' && scenario === 'arp_spoof') {
       setStep(3);
       setPackets([]);
       setNarration("Step 3: Guardian isolated malicious packet. Normal communication shielded.");
       addLog("Threat Neutralized. Legitimate ARP resolving...", "success");
       setPackets([
         { id: `p${packetIdRef.current++}`, sourceId: 'n3', targetId: 'n1', type: 'arp-reply', color: '#10b981' }
       ]);
    }
    else if (step === 3 && mode === 'RARP' && scenario === 'rarp_offline') {
       setStep(4);
       setPackets([]);
       setNarration("Step 3: Backup Server replies with IP mapping.");
       addLog("Backup Server online. Request fulfilled.", "success");
       setPackets([
          { id: `p${packetIdRef.current++}`, sourceId: 'n4', targetId: 'n1', type: 'rarp-reply', color: '#f97316' }
       ]);
    }
    else {
       setStep(4);
       setPackets([]);
       setNarration("Simulation Step Complete.");
    }
  };

  return (
    <SimulationContext.Provider value={{
      mode, scenario, step, speed, packets, narration, logs, initialNodes,
      setScenario,
      setMode: (m) => resetSimulation(m, 'normal'),
      startSimulation,
      setSpeed,
      handlePacketsReached
    }}>
      {children}
    </SimulationContext.Provider>
  );
};
