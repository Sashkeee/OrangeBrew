import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Brewing from './pages/Brewing';
import RecipeList from './pages/RecipeList';
import RecipeConstructor from './pages/RecipeConstructor';
import RecipeConstructor_V2 from './pages/RecipeConstructor_V2';
import RecipeEditor from './pages/RecipeEditor';
import Mashing from './pages/Mashing';
import Boiling from './pages/Boiling';
import Fermentation from './pages/Fermentation';
import Distillation from './pages/Distillation';
import Rectification from './pages/Rectification';
import SettingsPage from './pages/Settings';
import History from './pages/History';
import IngredientsReference from './pages/IngredientsReference';
import Calculators from './pages/Calculators';
import LogoShowcase from './pages/LogoShowcase';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { ActiveProcessIndicator } from './components/ActiveProcessIndicator';
import { MockControls } from './components/MockControls';
import Login from './pages/Login';

const PrivateRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(!!localStorage.getItem('orangebrew_token'));

  if (!isAuthenticated) {
    return <Login />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <PrivateRoute>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/brewing" element={<Brewing />} />
                <Route path="/brewing/recipes" element={<RecipeList />} />
                <Route path="/brewing/recipes/new" element={<RecipeConstructor />} />
                <Route path="/brewing/recipes/new-v2" element={<RecipeConstructor_V2 />} />
                <Route path="/brewing/recipes/:id/edit" element={<RecipeEditor />} />
                <Route path="/brewing/mash/:sessionId" element={<Mashing />} />
                <Route path="/brewing/boil/:sessionId" element={<Boiling />} />
                <Route path="/brewing/history" element={<History />} />
                <Route path="/brewing/ingredients" element={<IngredientsReference />} />
                <Route path="/calculators" element={<Calculators />} />
                <Route path="/fermentation" element={<Fermentation />} />
                <Route path="/distillation" element={<Distillation />} />
                <Route path="/rectification" element={<Rectification />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/branding" element={<LogoShowcase />} />
              </Routes>
              {/* Common overlays that need to be authenticated too */}
              <ConnectionIndicator />
              <ActiveProcessIndicator />
              {/* <MockControls /> */}
            </PrivateRoute>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
