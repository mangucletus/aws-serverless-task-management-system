import { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import { getCurrentUser } from 'aws-amplify/auth';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy load less frequently used components
const TeamManagement = lazy(() => import('./components/TeamManagement'));
const TaskList = lazy(() => import('./components/TaskList'));
const TaskForm = lazy(() => import('./components/TaskForm'));

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Authenticator
        signUpAttributes={['email']}
        components={{
          Header() {
            return (
              <div className="text-center py-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Task Management System
                </h1>
                <p className="text-gray-600">
                  Collaborate and manage your team tasks efficiently
                </p>
              </div>
            );
          }
        }}
      >
        {({ signOut, user }) => (
          <AuthenticatedApp user={user} signOut={signOut} />
        )}
      </Authenticator>
    </div>
  );
}

function AuthenticatedApp({ user, signOut }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadUser();
  }, [user]);

  async function loadUser() {
    try {
      setIsLoading(true);
      
      console.log('App - Raw user from Authenticator:', user);
      
      // Get enhanced user data from getCurrentUser
      const userData = await getCurrentUser();
      
      console.log('App - Enhanced user data from getCurrentUser:', userData);
      
      // Create a comprehensive user object with consistent field mapping
      const enhancedUser = {
        // Primary identifiers (ensure consistency)
        userId: userData.username || userData.sub || user?.username,
        username: userData.username || userData.sub || user?.username,
        sub: userData.sub || user?.sub,
        
        // Email handling with fallbacks
        email: userData.signInDetails?.loginId || 
               userData.attributes?.email || 
               user?.signInDetails?.loginId || 
               user?.username || 
               'unknown@example.com',
        
        // Display name derivation
        displayName: (userData.signInDetails?.loginId || userData.username || user?.username || 'User')
                    .split('@')[0],
        
        // Additional attributes
        attributes: userData.attributes || {},
        signInDetails: userData.signInDetails || user?.signInDetails || {},
        
        // Raw data for debugging
        _raw: {
          userData,
          originalUser: user
        }
      };
      
      console.log('App - Final enhanced user object:', enhancedUser);
      setCurrentUser(enhancedUser);
      
    } catch (error) {
      console.error('App - Error loading user:', error);
      
      // Create fallback user object from available data
      const fallbackUser = {
        userId: user?.username || user?.sub || 'unknown',
        username: user?.username || user?.sub || 'unknown',
        sub: user?.sub || 'unknown',
        email: user?.signInDetails?.loginId || user?.username || 'unknown@example.com',
        displayName: (user?.username || 'User').split('@')[0],
        attributes: {},
        signInDetails: user?.signInDetails || {},
        _isFallback: true,
        _raw: {
          originalUser: user,
          error: error.message
        }
      };
      
      console.log('App - Using fallback user object:', fallbackUser);
      setCurrentUser(fallbackUser);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <LoadingSpinner message="Initializing application..." />;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Error</h3>
          <p className="text-gray-600 mb-4">Unable to load user information. Please try signing out and back in.</p>
          <button
            onClick={signOut}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar user={currentUser} signOut={signOut} />
      <main className="container mx-auto px-4 py-8">
        <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
          <Routes>
            <Route path="/" element={<Dashboard user={currentUser} />} />
            <Route path="/team/:teamId" element={<TeamManagement user={currentUser} />} />
            <Route path="/tasks/:teamId" element={<TaskList user={currentUser} />} />
            <Route path="/create-task/:teamId" element={<TaskForm user={currentUser} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;