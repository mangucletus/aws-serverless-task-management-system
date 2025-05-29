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
      const userData = await getCurrentUser();
      setCurrentUser({
        ...userData,
        email: userData.signInDetails?.loginId || user?.signInDetails?.loginId || 'Unknown'
      });
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <LoadingSpinner />;
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