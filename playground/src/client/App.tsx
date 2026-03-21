import * as React from 'react';
import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/auth/Login';
import { Signup } from './components/auth/Signup';

function AppContent(): JSX.Element {
  const [currentView, setCurrentView] = useState<'login' | 'signup' | 'boards' | 'board'>('login');
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const { login, isAuthenticated } = useAuth();

  const navigateTo = (view: 'login' | 'signup' | 'boards' | 'board', boardId?: string) => {
    setCurrentView(view);
    if (boardId) {
      setCurrentBoardId(boardId);
    }
  };

  const handleLogin = (token: string) => {
    login(token);
    navigateTo('boards');
  };

  const handleSignup = (token: string) => {
    login(token);
    navigateTo('boards');
  };

  if (!isAuthenticated && currentView === 'boards') {
    setCurrentView('login');
  }

  return (
    <div>
      {currentView === 'login' && (
        <Login 
          onLogin={handleLogin} 
          navigateToSignup={() => navigateTo('signup')} 
        />
      )}
      {currentView === 'signup' && (
        <Signup 
          onSignup={handleSignup}
          navigateToLogin={() => navigateTo('login')}
        />
      )}
      {currentView === 'boards' && <div>Boards View - placeholder</div>}
      {currentView === 'board' && <div>Board View - placeholder (Board ID: {currentBoardId})</div>}
    </div>
  );
}

function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;