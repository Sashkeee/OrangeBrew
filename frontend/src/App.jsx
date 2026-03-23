import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import Brewing from './pages/Brewing';
import RecipeList from './pages/RecipeList';
import RecipeConstructor from './pages/RecipeConstructor';
import RecipeConstructor_V2 from './pages/RecipeConstructor_V2';
import RecipeEditor from './pages/RecipeEditor';
import RecipeDetail from './pages/RecipeDetail';
import PublicLibrary from './pages/PublicLibrary';
import Mashing from './pages/Mashing';
import Boiling from './pages/Boiling';
import Fermentation from './pages/Fermentation';
import Distillation from './pages/Distillation';
import Rectification from './pages/Rectification';
import SettingsPage from './pages/Settings';
import History from './pages/History';
import IngredientsReference from './pages/IngredientsReference';
import HopsReference from './pages/HopsReference';
import Calculators from './pages/Calculators';
import LogoShowcase from './pages/LogoShowcase';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { ActiveProcessIndicator } from './components/ActiveProcessIndicator';
import Login from './pages/Login';
import Register from './pages/Register';
import DevicePairing from './pages/DevicePairing';

// Redirect to /login if not authenticated
const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Redirect to / if already authenticated (login/register pages)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

function AppRoutes() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/*" element={
          <PrivateRoute>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/brewing" element={<Brewing />} />
              <Route path="/brewing/recipes" element={<RecipeList />} />
              <Route path="/brewing/recipes/new" element={<RecipeConstructor />} />
              <Route path="/brewing/recipes/new-v2" element={<RecipeConstructor_V2 />} />
              <Route path="/brewing/recipes/:id/edit" element={<RecipeEditor />} />
              <Route path="/brewing/recipes/:id" element={<RecipeDetail />} />
              <Route path="/brewing/library" element={<PublicLibrary />} />
              <Route path="/brewing/mash/:sessionId" element={<Mashing />} />
              <Route path="/brewing/boil/:sessionId" element={<Boiling />} />
              <Route path="/brewing/history" element={<History />} />
              <Route path="/brewing/ingredients" element={<IngredientsReference />} />
              <Route path="/brewing/hops" element={<HopsReference />} />
              <Route path="/calculators" element={<Calculators />} />
              <Route path="/fermentation" element={<Fermentation />} />
              <Route path="/distillation" element={<Distillation />} />
              <Route path="/rectification" element={<Rectification />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/devices/pair" element={<DevicePairing />} />
              <Route path="/branding" element={<LogoShowcase />} />
            </Routes>
            {/* Common overlays — rendered inside auth boundary */}
            <ConnectionIndicator />
            <ActiveProcessIndicator />
          </PrivateRoute>
        } />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
