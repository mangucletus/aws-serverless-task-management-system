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

  // FIXED: Enhanced user ID normalization that matches backend priority exactly
  function normalizeUserId(userData, fallbackUser) {
    console.log('App - Normalizing user ID with data:', { userData, fallbackUser });
    
    // CRITICAL: Priority order MUST match backend normalizeUserId function exactly:
    // 1. sub (most stable Cognito identifier) 
    // 2. username
    // 3. cognito:username  
    // 4. email (from various sources)
    // 5. custom:email
    
    const possibleIds = [
      userData?.sub,                              // Primary: Cognito sub (UUID) - most stable
      userData?.username,                         // Secondary: Cognito username
      userData?.['cognito:username'],             // Tertiary: Alternative username field
      userData?.signInDetails?.loginId,           // Quaternary: Email from sign-in details
      userData?.attributes?.email,                // Quaternary: Email from attributes  
      fallbackUser?.sub,                          // Fallback options from original user object
      fallbackUser?.username,
      fallbackUser?.['cognito:username'],
      fallbackUser?.signInDetails?.loginId,
      fallbackUser?.attributes?.email
    ];
    
    for (let i = 0; i < possibleIds.length; i++) {
      const id = possibleIds[i];
      if (id && typeof id === 'string' && id.trim()) {
        const normalizedId = id.trim();
        console.log(`App - Selected user ID from position ${i}: ${normalizedId}`);
        return normalizedId;
      }
    }
    
    console.error('App - No valid user ID found, using fallback');
    return 'unknown-user';
  }

  async function loadUser() {
    try {
      setIsLoading(true);
      
      console.log('App - Raw user from Authenticator:', user);
      
      // Get enhanced user data from getCurrentUser
      const userData = await getCurrentUser();
      
      console.log('App - Enhanced user data from getCurrentUser:', userData);
      
      // FIXED: Create a comprehensive user object with consistent field mapping
      // The userId MUST match what the backend normalizeUserId function would return
      const normalizedUserId = normalizeUserId(userData, user);
      
      const enhancedUser = {
        // CRITICAL: Primary identifier - must match backend normalization exactly
        userId: normalizedUserId,
        
        // Additional identifiers for compatibility and debugging
        username: userData.username || userData.sub || user?.username || normalizedUserId,
        sub: userData.sub || user?.sub,
        
        // Email handling with robust fallbacks
        email: userData.signInDetails?.loginId || 
               userData.attributes?.email || 
               user?.signInDetails?.loginId || 
               userData.username ||
               user?.username || 
               'unknown@example.com',
        
        // Display name derivation
        displayName: (userData.signInDetails?.loginId || 
                     userData.username || 
                     user?.username || 
                     'User').split('@')[0],
        
        // Additional attributes
        attributes: userData.attributes || {},
        signInDetails: userData.signInDetails || user?.signInDetails || {},
        
        // Debug information for troubleshooting
        _debug: {
          backendUserIdWouldBe: normalizedUserId,
          selectedFromPosition: 'see console logs',
          availableIds: {
            sub: userData?.sub,
            username: userData?.username,
            'cognito:username': userData?.['cognito:username'], 
            loginId: userData?.signInDetails?.loginId,
            email: userData?.attributes?.email,
            fallbackSub: user?.sub,
            fallbackUsername: user?.username
          },
          timestamp: new Date().toISOString()
        }
      };
      
      console.log('App - Final enhanced user object:', enhancedUser);
      console.log('App - User ID that will be sent to backend:', enhancedUser.userId);
      console.log('App - This should match backend normalizeUserId output');
      
      setCurrentUser(enhancedUser);
      
    } catch (error) {
      console.error('App - Error loading user:', error);
      
      // Create fallback user object from available data
      const normalizedUserId = normalizeUserId({}, user);
      
      const fallbackUser = {
        userId: normalizedUserId,
        username: user?.username || user?.sub || normalizedUserId,
        sub: user?.sub || 'unknown',
        email: user?.signInDetails?.loginId || user?.username || 'unknown@example.com',
        displayName: (user?.username || 'User').split('@')[0],
        attributes: {},
        signInDetails: user?.signInDetails || {},
        _isFallback: true,
        _debug: {
          error: error.message,
          fallbackUserId: normalizedUserId,
          timestamp: new Date().toISOString()
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