// Import React hooks for state management, lifecycle, and lazy loading
import { useEffect, useState, Suspense, lazy } from 'react';
// Import React Router components for navigation and routing
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
// Import AWS Amplify Authenticator component for user authentication UI
import { Authenticator } from '@aws-amplify/ui-react';
// Import AWS Amplify function to get current authenticated user
import { getCurrentUser } from 'aws-amplify/auth';
// Import AWS Amplify function to create GraphQL API client
import { generateClient } from 'aws-amplify/api';
// Import GraphQL query to fetch team data
import { getTeam } from './graphql/queries';
// Import regular components that load immediately
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy load components to improve initial page load performance
// These components will only be loaded when they're actually needed
const TeamManagement = lazy(() => import('./components/TeamManagement'));
const TaskList = lazy(() => import('./components/TaskList'));
const TaskForm = lazy(() => import('./components/TaskForm'));

// Create a GraphQL client instance for making API calls
const client = generateClient();

// Main App component - entry point of the application
function App() {
  return (
    // Main container with full screen height and gradient background
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* AWS Amplify Authenticator wrapper that handles sign-in/sign-up */}
      <Authenticator
        // Specify that email is required for sign-up
        signUpAttributes={['email']}
        // Custom components to override default Authenticator UI
        components={{
          // Custom header component for the authentication forms
          Header() {
            return (
              <div className="text-center py-6">
                {/* Application title */}
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Task Management System
                </h1>
                {/* Application description */}
                <p className="text-gray-600">
                  Collaborate and manage your team tasks efficiently
                </p>
              </div>
            );
          }
        }}
      >
        {/* Render function that receives signOut function and user object when authenticated */}
        {({ signOut, user }) => (
          // Pass the authenticated user and signOut function to the main app
          <AuthenticatedApp user={user} signOut={signOut} />
        )}
      </Authenticator>
    </div>
  );
}

// Main authenticated application component that handles user initialization and routing
function AuthenticatedApp({ user, signOut }) {
  // State to track if the app is still loading user data
  const [isLoading, setIsLoading] = useState(true);
  // State to store the enhanced current user object with normalized data
  const [currentUser, setCurrentUser] = useState(null);

  // Effect hook to load user data when the user object changes
  useEffect(() => {
    loadUser();
  }, [user]);

  // Function to normalize user ID from various possible sources
  // This handles different authentication flows and data structures
  function normalizeUserId(userData, fallbackUser) {
    // Log the input data for debugging purposes
    console.log('App - Normalizing user ID with data:', { userData, fallbackUser });
    
    // Array of possible user ID sources in order of preference
    // Try to find a valid user ID from multiple possible locations
    const possibleIds = [
      userData?.userId,  // Corrected: Use userId from getCurrentUser (Cognito sub)
      fallbackUser?.attributes?.sub,  // sub from Authenticator user
      userData?.username,
      userData?.['cognito:username'],
      userData?.signInDetails?.loginId,
      userData?.attributes?.email,
      fallbackUser?.username,
      fallbackUser?.signInDetails?.loginId,
      fallbackUser?.attributes?.email
    ].filter(Boolean); // Remove any null/undefined values
    
    // Iterate through possible IDs to find the first valid one
    for (let i = 0; i < possibleIds.length; i++) {
      const id = possibleIds[i];
      // Check if the ID is a non-empty string
      if (id && typeof id === 'string' && id.trim()) {
        const normalizedId = id.trim();
        console.log(`App - Selected user ID from position ${i}: ${normalizedId}`);
        return normalizedId;
      }
    }
    
    // If no valid ID is found, log error and return fallback
    console.error('App - No valid user ID found, using fallback');
    return 'unknown-user';
  }

  // Async function to load and enhance user data
  async function loadUser() {
    try {
      // Set loading state to true while fetching user data
      setIsLoading(true);
      
      // Log the raw user object from Authenticator for debugging
      console.log('App - Raw user from Authenticator:', user);
      
      // Get enhanced user data from AWS Cognito
      const userData = await getCurrentUser();
      
      // Log the enhanced user data for debugging
      console.log('App - Enhanced user data from getCurrentUser:', userData);
      
      // Normalize the user ID using the helper function
      const normalizedUserId = normalizeUserId(userData, user);
      
      // Create an enhanced user object with all necessary properties
      const enhancedUser = {
        // Primary user identifier for backend operations
        userId: normalizedUserId,
        // Username for display purposes
        username: userData.username || userData.userId || user?.username || normalizedUserId,
        // Cognito sub identifier
        sub: userData.userId || user?.sub,  // Use userId as sub
        // Email address with fallback chain
        email: userData.signInDetails?.loginId || 
               userData.attributes?.email || 
               user?.signInDetails?.loginId || 
               userData.username ||
               user?.username || 
               'unknown@example.com',
        // Display name derived from email or username
        displayName: (userData.signInDetails?.loginId || 
                     userData.username || 
                     user?.username || 
                     'User').split('@')[0], // Extract part before @ symbol
        // User attributes from Cognito
        attributes: userData.attributes || {},
        // Sign-in details and metadata
        signInDetails: userData.signInDetails || user?.signInDetails || {},
        // Debug information for troubleshooting
        _debug: {
          backendUserIdWouldBe: normalizedUserId,
          selectedFromPosition: 'see console logs',
          // All available ID options for debugging
          availableIds: {
            userId: userData?.userId,
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
      
      // Log the final enhanced user object for debugging
      console.log('App - Final enhanced user object:', enhancedUser);
      console.log('App - User ID that will be sent to backend:', enhancedUser.userId);
      
      // Update the current user state with enhanced data
      setCurrentUser(enhancedUser);
      
    } catch (error) {
      // Handle errors during user data loading
      console.error('App - Error loading user:', error);
      
      // Create a fallback user object if main loading fails
      const normalizedUserId = normalizeUserId({}, user);
      
      const fallbackUser = {
        userId: normalizedUserId,
        username: user?.username || user?.sub || normalizedUserId,
        sub: user?.sub || 'unknown',
        email: user?.signInDetails?.loginId || user?.username || 'unknown@example.com',
        displayName: (user?.username || 'User').split('@')[0],
        attributes: {},
        signInDetails: user?.signInDetails || {},
        _isFallback: true, // Flag to indicate this is fallback data
        _debug: {
          error: error.message,
          fallbackUserId: normalizedUserId,
          timestamp: new Date().toISOString()
        }
      };
      
      // Log the fallback user and set it as current user
      console.log('App - Using fallback user object:', fallbackUser);
      setCurrentUser(fallbackUser);
    } finally {
      // Always set loading to false when done (success or error)
      setIsLoading(false);
    }
  }

  // Show loading spinner while initializing user data
  if (isLoading) {
    return <LoadingSpinner message="Initializing application..." />;
  }

  // Show error state if user data couldn't be loaded
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {/* Error icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {/* Error message */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Error</h3>
          <p className="text-gray-600 mb-4">Unable to load user information. Please try signing out and back in.</p>
          {/* Sign out button to retry authentication */}
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

  // Render the main application layout with navigation and routes
  return (
    <div className="min-h-screen">
      {/* Navigation bar with user info and sign out functionality */}
      <Navbar user={currentUser} signOut={signOut} />
      {/* Main content area */}
      <main className="container mx-auto px-4 py-8">
        {/* Suspense wrapper for lazy-loaded components with fallback */}
        <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
          {/* Define application routes */}
          <Routes>
            {/* Dashboard route - default home page */}
            <Route path="/" element={<Dashboard user={currentUser} />} />
            {/* Team management route with team ID parameter */}
            <Route 
              path="/team/:teamId" 
              element={<TeamManagementWrapper user={currentUser} />} 
            />
            {/* Task list route with team ID parameter */}
            <Route 
              path="/tasks/:teamId" 
              element={<TaskListWrapper user={currentUser} />} 
            />
            {/* Task creation form route with team ID parameter */}
            <Route 
              path="/create-task/:teamId" 
              element={<TaskFormWrapper user={currentUser} />} 
            />
            {/* Catch-all route - redirect unknown paths to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

// Wrapper component for TeamManagement that validates team access before rendering
function TeamManagementWrapper({ user }) {
  // Extract teamId from URL parameters
  const { teamId } = useParams();
  // State to track loading status during access validation
  const [loading, setLoading] = useState(true);
  // State to track if user has access to the team
  const [hasAccess, setHasAccess] = useState(false);
  // State to store any error messages
  const [error, setError] = useState(null);
  
  // Effect to validate team access when teamId or user changes
  useEffect(() => {
    validateTeamAccess();
  }, [teamId, user]);

  // Function to validate if the current user has access to the specified team
  async function validateTeamAccess() {
    // Validate teamId parameter
    if (!teamId || teamId.trim() === '' || teamId === 'undefined' || teamId === 'null') {
      console.error('TeamManagementWrapper - Invalid teamId:', teamId);
      setError('Invalid team ID');
      setLoading(false);
      return;
    }

    // Validate user authentication
    if (!user?.userId) {
      console.error('TeamManagementWrapper - No user ID available');
      setError('User authentication required');
      setLoading(false);
      return;
    }

    try {
      // Log validation attempt for debugging
      console.log('TeamManagementWrapper - Validating access for user:', user.userId, 'to team:', teamId);
      
      // Make GraphQL query to fetch team data and validate access
      const response = await client.graphql({
        query: getTeam, // GraphQL query to get team information
        variables: { teamId }, // Pass teamId as variable
        authMode: 'userPool' // Use Cognito User Pool for authentication
      });

      // Check if team data was returned (indicates access is granted)
      if (response.data?.getTeam) {
        console.log('TeamManagementWrapper - Team access validated:', response.data.getTeam);
        setHasAccess(true);
      } else {
        // No team data returned - access denied or team doesn't exist
        console.log('TeamManagementWrapper - No team data returned');
        setError('Team not found or access denied');
      }
    } catch (err) {
      // Handle GraphQL errors
      console.error('TeamManagementWrapper - Team validation error:', err);
      
      // Parse specific error types for better user feedback
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        if (firstError.errorType === 'NotFoundError') {
          setError('Team not found');
        } else if (firstError.errorType === 'AuthorizationError') {
          setError('You do not have access to this team');
        } else {
          setError(firstError.message || 'Unable to access team');
        }
      } else {
        setError('Unable to validate team access');
      }
    } finally {
      // Always set loading to false when validation is complete
      setLoading(false);
    }
  }
  
  // Show loading spinner during access validation
  if (loading) {
    return <LoadingSpinner message="Validating team access..." />;
  }

  // Show access denied screen if validation failed
  if (error || !hasAccess) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          {/* Error icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {/* Error title */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          {/* Error message */}
          <p className="text-gray-600 mb-4">{error || 'You do not have access to this team.'}</p>
          {/* Button to return to dashboard */}
          <button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // Access granted - render the actual TeamManagement component
  console.log('TeamManagementWrapper - Access granted, rendering TeamManagement component');
  return <TeamManagement user={user} />;
}

// Wrapper component for TaskList that validates team access before rendering
function TaskListWrapper({ user }) {
  // Extract teamId from URL parameters
  const { teamId } = useParams();
  // State to track loading status during access validation
  const [loading, setLoading] = useState(true);
  // State to track if user has access to the team
  const [hasAccess, setHasAccess] = useState(false);
  // State to store any error messages
  const [error, setError] = useState(null);
  
  // Effect to validate team access when teamId or user changes
  useEffect(() => {
    validateTeamAccess();
  }, [teamId, user]);

  // Function to validate if the current user has access to the specified team
  async function validateTeamAccess() {
    // Validate teamId parameter
    if (!teamId || teamId.trim() === '' || teamId === 'undefined' || teamId === 'null') {
      console.error('TaskListWrapper - Invalid teamId:', teamId);
      setError('Invalid team ID');
      setLoading(false);
      return;
    }

    // Validate user authentication
    if (!user?.userId) {
      console.error('TaskListWrapper - No user ID available');
      setError('User authentication required');
      setLoading(false);
      return;
    }

    try {
      // Log validation attempt for debugging
      console.log('TaskListWrapper - Validating access for user:', user.userId, 'to team:', teamId);
      
      // Make GraphQL query to fetch team data and validate access
      const response = await client.graphql({
        query: getTeam, // GraphQL query to get team information
        variables: { teamId }, // Pass teamId as variable
        authMode: 'userPool' // Use Cognito User Pool for authentication
      });

      // Check if team data was returned (indicates access is granted)
      if (response.data?.getTeam) {
        console.log('TaskListWrapper - Team access validated:', response.data.getTeam);
        setHasAccess(true);
      } else {
        // No team data returned - access denied or team doesn't exist
        console.log('TaskListWrapper - No team data returned');
        setError('Team not found or access denied');
      }
    } catch (err) {
      // Handle GraphQL errors
      console.error('TaskListWrapper - Team validation error:', err);
      
      // Parse specific error types for better user feedback
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        if (firstError.errorType === 'NotFoundError') {
          setError('Team not found');
        } else if (firstError.errorType === 'AuthorizationError') {
          setError('You do not have access to this team');
        } else {
          setError(firstError.message || 'Unable to access team');
        }
      } else {
        setError('Unable to validate team access');
      }
    } finally {
      // Always set loading to false when validation is complete
      setLoading(false);
    }
  }
  
  // Show loading spinner during access validation
  if (loading) {
    return <LoadingSpinner message="Validating team access..." />;
  }

  // Show access denied screen if validation failed
  if (error || !hasAccess) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          {/* Error icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {/* Error title */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          {/* Error message */}
          <p className="text-gray-600 mb-4">{error || 'You do not have access to this team.'}</p>
          {/* Button to return to dashboard */}
          <button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // Access granted - render the actual TaskList component
  console.log('TaskListWrapper - Access granted, rendering TaskList component');
  return <TaskList user={user} />;
}

// Wrapper component for TaskForm that validates team access and admin permissions
function TaskFormWrapper({ user }) {
  // Extract teamId from URL parameters
  const { teamId } = useParams();
  // State to track loading status during access validation
  const [loading, setLoading] = useState(true);
  // State to track if user has access to the team
  const [hasAccess, setHasAccess] = useState(false);
  // State to track if user has admin privileges for the team
  const [isAdmin, setIsAdmin] = useState(false);
  // State to store any error messages
  const [error, setError] = useState(null);
  
  // Effect to validate team access when teamId or user changes
  useEffect(() => {
    validateTeamAccess();
  }, [teamId, user]);

  // Function to validate team access and admin permissions for task creation
  async function validateTeamAccess() {
    // Validate teamId parameter
    if (!teamId || teamId.trim() === '' || teamId === 'undefined' || teamId === 'null') {
      console.error('TaskFormWrapper - Invalid teamId:', teamId);
      setError('Invalid team ID');
      setLoading(false);
      return;
    }

    // Validate user authentication
    if (!user?.userId) {
      console.error('TaskFormWrapper - No user ID available');
      setError('User authentication required');
      setLoading(false);
      return;
    }

    try {
      // Log validation attempt for debugging
      console.log('TaskFormWrapper - Validating access for user:', user.userId, 'to team:', teamId);
      
      // Make GraphQL query to fetch team data and validate access
      const response = await client.graphql({
        query: getTeam, // GraphQL query to get team information
        variables: { teamId }, // Pass teamId as variable
        authMode: 'userPool' // Use Cognito User Pool for authentication
      });

      // Check if team data was returned (indicates access is granted)
      if (response.data?.getTeam) {
        const teamData = response.data.getTeam;
        console.log('TaskFormWrapper - Team access validated:', teamData);
        setHasAccess(true);
        // Check if user has admin privileges (required for task creation)
        setIsAdmin(teamData.isAdmin || teamData.userRole === 'admin');
        
        // If user doesn't have admin privileges, set error
        if (!teamData.isAdmin && teamData.userRole !== 'admin') {
          setError('Only team administrators can create tasks');
          return;
        }
      } else {
        // No team data returned - access denied or team doesn't exist
        console.log('TaskFormWrapper - No team data returned');
        setError('Team not found or access denied');
      }
    } catch (err) {
      // Handle GraphQL errors
      console.error('TaskFormWrapper - Team validation error:', err);
      
      // Parse specific error types for better user feedback
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        if (firstError.errorType === 'NotFoundError') {
          setError('Team not found');
        } else if (firstError.errorType === 'AuthorizationError') {
          setError('You do not have access to this team');
        } else {
          setError(firstError.message || 'Unable to access team');
        }
      } else {
        setError('Unable to validate team access');
      }
    } finally {
      // Always set loading to false when validation is complete
      setLoading(false);
    }
  }
  
  // Show loading spinner during access validation
  if (loading) {
    return <LoadingSpinner message="Validating team access..." />;
  }

  // Show access denied screen if validation failed or user lacks admin privileges
  if (error || !hasAccess || !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          {/* Error icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {/* Error title */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          {/* Error message with admin requirement */}
          <p className="text-gray-600 mb-4">
            {error || 'Only team administrators can create tasks.'}
          </p>
          {/* Button to return to dashboard */}
          <button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // Access and admin privileges granted - render the actual TaskForm component
  console.log('TaskFormWrapper - Access granted, rendering TaskForm component');
  return <TaskForm user={user} />;
}

// Export the main App component as the default export
export default App;