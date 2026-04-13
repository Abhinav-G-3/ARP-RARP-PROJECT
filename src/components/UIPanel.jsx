import React from 'react';
import { useSimulation } from '../SimulationContext';
import { Play, RotateCcw, ShieldAlert, Cpu } from 'lucide-react';

export default function UIPanel() {
  const { 
    mode, setMode, scenario, setScenario, step, startSimulation, 
    speed, setSpeed, narration, logs 
  } = useSimulation();

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, width: '100vw', height: '100vh',
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '2rem',
      zIndex: 10
    }}>
      {/* Header Panel */}
      <div className="glass-panel" style={{ 
        pointerEvents: 'auto', 
        alignSelf: 'center', 
        display: 'flex', 
        gap: '2rem', 
        alignItems: 'center' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={24} color="#06b6d4" />
          <h1 style={{ fontSize: '1.2rem', margin: 0, color: '#06b6d4' }}>AI Guardian Simulator</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px' }}>
          <button 
            className={`primary-btn ${mode === 'ARP' ? 'active' : ''}`}
            onClick={() => { setMode('ARP'); setScenario('normal'); }}
            disabled={step > 0 && step < 4}
          >
            ARP Mode
          </button>
          <button 
            className={`primary-btn ${mode === 'RARP' ? 'active' : ''}`}
            onClick={() => { setMode('RARP'); setScenario('normal'); }}
            disabled={step > 0 && step < 4}
          >
            RARP Mode
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
           <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Scenario:</span>
           <select 
              value={scenario} 
              onChange={(e) => setScenario(e.target.value)}
              disabled={step > 0 && step < 4}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '6px 12px',
                borderRadius: '6px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="normal" style={{color: 'black'}}>Normal Traffic</option>
              {mode === 'ARP' && <option value="arp_spoof" style={{color: 'black'}}>Edge Case: ARP Spoofing</option>}
              {mode === 'RARP' && <option value="rarp_offline" style={{color: 'black'}}>Edge Case: Server Offline</option>}
           </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Speed:</span>
           <input 
             type="range" 
             min="0.5" max="2" step="0.1" 
             value={speed} 
             onChange={(e) => setSpeed(parseFloat(e.target.value))}
             style={{ cursor: 'pointer' }}
           />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, marginTop: '2rem' }}>
        {/* Legend Panel */}
        <div className="glass-panel" style={{ 
          pointerEvents: 'auto',
          alignSelf: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          fontSize: '0.85rem',
          minWidth: '200px'
        }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Signal Legend</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#3b82f6' }}></span> ARP
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }}></span> ARP Reply
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#a855f7' }}></span> RARP Request
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f97316' }}></span> RARP Reply
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
             <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }}></span> Malicious / Spoofed
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#06b6d4' }}></span> Guardian Beam
          </div>
        </div>

        {/* AI Guardian Log */}
        <div className="glass-panel" style={{ 
          pointerEvents: 'auto',
          alignSelf: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          width: '300px',
          height: '250px',
          overflow: 'hidden'
        }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
               <Cpu size={18} color="#06b6d4" />
               <h3 style={{ fontSize: '1rem', margin: 0 }}>AI System Logs</h3>
           </div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>
              {logs.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Awaiting telemetry...</span>}
              {logs.map((l, i) => (
                <div key={i} style={{ 
                  color: l.type === 'error' ? '#ef4444' : l.type === 'success' ? '#10b981' : l.type === 'warning' ? '#f97316' : '#e2e8f0',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '6px',
                  borderRadius: '4px',
                  borderLeft: `2px solid ${l.type === 'error' ? '#ef4444' : l.type === 'success' ? '#10b981' : l.type === 'warning' ? '#f97316' : '#06b6d4'}`
                }}>
                  &gt; {l.msg}
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* Footer / Controls / Narration Panel */}
      <div className="glass-panel" style={{ 
        pointerEvents: 'auto',
        alignSelf: 'center',
        padding: '1.5rem 3rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        minWidth: '600px'
      }}>
        <div style={{ 
          fontSize: '1.2rem', 
          textAlign: 'center', 
          color: step > 0 ? '#60a5fa' : 'var(--text-primary)',
          transition: 'color 0.3s'
        }}>
           {narration}
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
           <button 
             className="primary-btn" 
             style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '10px 24px', fontSize: '1.1rem' }}
             onClick={startSimulation}
           >
             {step === 0 || step === 4 ? <><Play size={18} /> Start Animation</> : <><RotateCcw size={18} /> Restart</>}
           </button>
        </div>
      </div>
    </div>
  );
}
