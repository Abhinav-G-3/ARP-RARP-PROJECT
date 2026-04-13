import React from 'react';
import Scene from './components/Scene';
import UIPanel from './components/UIPanel';
import { SimulationProvider } from './SimulationContext';

function App() {
  return (
    <SimulationProvider>
      <Scene />
      <UIPanel />
    </SimulationProvider>
  );
}

export default App;
