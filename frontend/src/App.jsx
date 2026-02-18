import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Brewing from './pages/Brewing';
import RecipeList from './pages/RecipeList';
import RecipeConstructor from './pages/RecipeConstructor';
import Mashing from './pages/Mashing';
import Boiling from './pages/Boiling';
import History from './pages/History';

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

          {/* Fallbacks for unfinished sections */}
          <Route path="/fermentation" element={<Placeholder title="Брожение" />} />
          <Route path="/distillation" element={<Placeholder title="Дистилляция" />} />
          <Route path="/rectification" element={<Placeholder title="Ректификация" />} />
          <Route path="/settings" element={<Placeholder title="Настройки" />} />
        </Routes>
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
