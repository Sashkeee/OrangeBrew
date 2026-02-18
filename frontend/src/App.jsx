import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Brewing from './pages/Brewing';
import RecipeList from './pages/RecipeList';
import RecipeConstructor from './pages/RecipeConstructor';
import Mashing from './pages/Mashing';
import Boiling from './pages/Boiling';
import Fermentation from './pages/Fermentation';
import Distillation from './pages/Distillation';
import Rectification from './pages/Rectification';
import SettingsPage from './pages/Settings';
import History from './pages/History';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { MockControls } from './components/MockControls';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/brewing" element={<Brewing />} />
          <Route path="/brewing/recipes" element={<RecipeList />} />
          <Route path="/brewing/recipes/new" element={<RecipeConstructor />} />
          <Route path="/brewing/mash/:sessionId" element={<Mashing />} />
          <Route path="/brewing/boil/:sessionId" element={<Boiling />} />
          <Route path="/brewing/history" element={<History />} />
          <Route path="/fermentation" element={<Fermentation />} />

          <Route path="/distillation" element={<Distillation />} />

          <Route path="/rectification" element={<Rectification />} />

          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <ConnectionIndicator />
        <MockControls />
      </div>
    </Router>
  );
}

const Placeholder = ({ title }) => (
  <div style={{ padding: '4rem', textAlign: 'center' }}>
    <h1 style={{ color: 'var(--primary-color)' }}>{title}</h1>
    <p>Этот раздел находится в разработке.</p>
    <button
      onClick={() => window.history.back()}
      style={{ marginTop: '2rem', padding: '1rem 2rem', background: '#333', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '4px' }}
    >
      Назад
    </button>
  </div>
);

export default App;
