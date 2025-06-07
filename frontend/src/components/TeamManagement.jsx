import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import { listMembers } from '../graphql/queries';
import { addMember } from '../graphql/mutations';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

// Initialize AWS Amplify GraphQL client for API operations
const client = generateClient();

/**
 * TeamManagement Component - Main component for managing team members and roles
 * 
 * Features:
 * - Displays team member list with roles and status
 * - Allows admins to add new members via email invitation
 * - Shows team statistics (total members, admins, regular members)
 * - Provides role-based access control for different operations
 * - Includes quick navigation to team tasks and task creation
 * - Handles user permission validation and team access verification
 * 
 * Permissions:
 * - Admin: Can view all members, add new members, manage roles
 * - Member: Can view team members (read-only access)
 * 
 * @param {Object} user - Current authenticated user object from AWS Cognito
 */
function TeamManagement({ user }) {
  // Extract team ID from URL parameters using React Router
  const { teamId } = useParams();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Core data state
  const [members, setMembers] = useState([]); // Array of team member objects from GraphQL API
  const [userRole, setUserRole] = useState('member'); // Current user's role in the team
  const [teamExists, setTeamExists] = useState(true); // Flag to track if team is accessible
  
  // UI control state
  const [loading, setLoading] = useState(true); // Global loading state for initial data fetch
  const [error, setError] = useState(null); // Error messages for user feedback
  const [showAddForm, setShowAddForm] = useState(false); // Toggle for add member form visibility
  
  // Add member form state
  const [memberEmail, setMemberEmail] = useState(''); // Email input for new member invitation
  const [adding, setAdding] = useState(false); // Loading state for add member operation

  // ============================================================================
  // INITIALIZATION AND DATA FETCHING
  // ============================================================================
  
  /**
   * Main effect hook - Validates parameters and initializes component data
   * Runs on component mount and when teamId or user changes
   */
  useEffect(() => {
    // VALIDATION: Ensure we have required data before proceeding
    // This prevents errors from missing route parameters or authentication issues
    if (!teamId || !user?.userId) {
      console.error('TeamManagement - Missing required data:', { 
        teamId, 
        userId: user?.userId,
        hasUser: !!user 
      });
      setTeamExists(false);
      setError('Invalid team or user information. Please refresh the page or go back to dashboard.');
      setLoading(false);
      return;
    }
    
    // Start the initialization process
    fetchMembers();
  }, [teamId, user]);

  /**
   * Fetches team members and validates user access
   * This function:
   * 1. Retrieves all team members from the API
   * 2. Verifies the current user is a member of the team
   * 3. Determines the user's role for permission-based UI rendering
   * 4. Handles various error scenarios with appropriate user feedback
   */
  async function fetchMembers() {
    try {
      setLoading(true);
      setError(null);
      setTeamExists(true);

      console.log('TeamManagement - Fetching members for team:', teamId, 'user:', user?.userId);
      console.log('TeamManagement - Full user object:', user);

      // STEP 1: Fetch team members list
      const response = await client.graphql({
        query: listMembers,
        variables: { teamId },
        authMode: 'userPool' // Use Cognito User Pool authentication
      });

      console.log('TeamManagement - Members response:', response);

      // Check if team exists and is accessible
      if (!response.data?.listMembers) {
        setTeamExists(false);
        setError('Team not found or you do not have access to this team.');
        return;
      }

      const membersList = response.data.listMembers;
      setMembers(membersList);

      console.log('TeamManagement - Members list:', membersList);
      console.log('TeamManagement - Looking for user ID:', user?.userId);

      // STEP 2: ENHANCED USER MEMBERSHIP DETECTION
      // AWS Cognito can provide user identity in multiple formats
      // We need to check against all possible identifiers to ensure reliable matching
      const currentUserMembership = membersList.find(
        member => {
          const memberUserId = member.userId;
          
          // Create comprehensive list of possible user identifiers
          // This handles variations in how Cognito provides user identity across different auth flows
          const possibleUserIds = [
            user?.userId,           // Primary: normalized user ID from App.jsx
            user?.sub,              // Cognito sub (UUID format)
            user?.username,         // Cognito username  
            user?.email,            // Email address as identifier
            user?.signInDetails?.loginId,  // Login ID from sign-in process
            user?.attributes?.email // Email from user attributes
          ].filter(Boolean); // Remove undefined/null values
          
          // Check if any of our possible IDs match the member's user ID
          const isMatch = possibleUserIds.some(possibleId => 
            possibleId === memberUserId
          );
          
          // Debug logging for troubleshooting user matching issues
          console.log('TeamManagement - Checking member:', memberUserId, 'against user IDs:', possibleUserIds, 'match:', isMatch);
          
          return isMatch;
        }
      );

      console.log('TeamManagement - Current user membership:', currentUserMembership);

      // STEP 3: Handle membership validation results
      if (currentUserMembership) {
        // User is a valid team member - set their role for permission checks
        setUserRole(currentUserMembership.role);
        console.log('TeamManagement - User role set to:', currentUserMembership.role);
      } else {
        // User is not a member of this team - provide detailed debugging info
        console.log('TeamManagement - User not found in members list');
        console.log('TeamManagement - Available member IDs:', membersList.map(m => m.userId));
        console.log('TeamManagement - User identifiers:', {
          userId: user?.userId,
          sub: user?.sub,
          username: user?.username,
          email: user?.email,
          loginId: user?.signInDetails?.loginId
        });
        
        setTeamExists(false);
        setError('You are not a member of this team or access has been revoked.');
      }

    } catch (err) {
      console.error('TeamManagement - Fetch members error:', err);
      
      // ENHANCED ERROR HANDLING: Provide specific error messages based on error type
      let errorMessage = 'Failed to load team members. ';
      
      // Check for GraphQL-specific errors
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('TeamManagement - GraphQL error details:', firstError);
        
        // Handle different types of GraphQL errors
        if (firstError.errorType === 'AuthorizationError') {
          errorMessage = 'You do not have permission to view this team.';
          setTeamExists(false);
        } else if (firstError.errorType === 'NotFoundError') {
          errorMessage = 'Team not found.';
          setTeamExists(false);
        } else {
          errorMessage += firstError.message || 'Please try again.';
        }
      } else if (err.message) {
        // Handle network and authentication errors
        if (err.message.includes('NetworkError')) {
          errorMessage += 'Network connection issue. Please check your internet connection.';
        } else if (err.message.includes('Authentication') || err.message.includes('Unauthorized')) {
          errorMessage += 'Authentication issue. Please sign out and back in.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Please try refreshing the page.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // MEMBER MANAGEMENT OPERATIONS
  // ============================================================================
  
  /**
   * Handles adding a new team member via email invitation
   * This function:
   * 1. Validates the email format
   * 2. Sends invitation via GraphQL mutation
   * 3. Refreshes the members list on success
   * 4. Provides user feedback for success/failure
   * 
   * Only available to admin users
   * 
   * @param {Event} e - Form submission event
   */
  async function handleAddMember(e) {
    e.preventDefault();
    
    // CLIENT-SIDE VALIDATION: Check if email is provided
    if (!memberEmail.trim()) {
      setError('Email address is required');
      return;
    }

    // CLIENT-SIDE VALIDATION: Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setAdding(true);
      setError(null);

      console.log('TeamManagement - Adding member:', memberEmail.trim(), 'to team:', teamId);

      // Call GraphQL mutation to add member
      const response = await client.graphql({
        query: addMember,
        variables: { teamId, email: memberEmail.trim() },
        authMode: 'userPool'
      });

      console.log('TeamManagement - Add member response:', response);

      // Handle successful member addition
      if (response.data?.addMember) {
        // Reset form state
        setMemberEmail('');
        setShowAddForm(false);
        
        // Show success message with auto-dismiss
        setError('Member added successfully! 🎉 They will receive a notification.');
        setTimeout(() => {
          setError(null);
        }, 3000);
        
        // Refresh members list to show new member
        await fetchMembers();
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (err) {
      console.error('TeamManagement - Add member error:', err);
      
      // DETAILED ERROR HANDLING: Provide specific error messages
      let errorMessage = 'Failed to add member. ';
      
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        if (firstError.errorType === 'ValidationError') {
          // Server-side validation errors (e.g., user already exists, invalid email)
          errorMessage = firstError.message;
        } else if (firstError.errorType === 'AuthorizationError') {
          // Permission-related errors
          errorMessage = 'Only team admins can add members.';
        } else {
          errorMessage += firstError.message || 'Please try again.';
        }
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Please check the email and try again.';
      }
      
      setError(errorMessage);
    } finally {
      setAdding(false);
    }
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  /**
   * Handles retry action when errors occur
   * Resets error state and re-fetches team members
   */
  function handleRetry() {
    setError(null);
    fetchMembers();
  }

  // ============================================================================
  // RENDER CONDITIONS
  // ============================================================================
  
  // Show loading spinner during initial data fetch
  if (loading) {
    return <LoadingSpinner message="Loading team members..." />;
  }

  // Show team not found page when user lacks access
  if (!teamExists) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Team Not Found</h3>
          <p className="text-gray-600 mb-4">
            The team you're looking for doesn't exist or you don't have access to it.
          </p>
          
          {/* Enhanced debug info in development environment */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 mb-4 max-w-lg mx-auto p-3 bg-gray-100 rounded">
              <p><strong>Debug Info:</strong></p>
              <p>Team ID: {teamId || 'undefined'}</p>
              <p>User ID: {user?.userId || 'undefined'}</p>
              <p>User Sub: {user?.sub || 'undefined'}</p>
              <p>User Email: {user?.email || 'undefined'}</p>
              <p>Has User Object: {!!user ? 'Yes' : 'No'}</p>
              <p>Members Count: {members.length}</p>
              <p>Error: {error}</p>
            </div>
          )}
          
          {/* Action buttons for recovery */}
          <div className="flex justify-center space-x-3">
            <button
              onClick={handleRetry}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Try Again
            </button>
            <Link
              to="/"
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN COMPONENT RENDER
  // ============================================================================
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* ========================================================================
          HEADER SECTION
          - Breadcrumb navigation
          - Page title with admin badge
          - Development debug information
      ======================================================================== */}
      <div className="mb-8">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center space-x-2 mb-2">
          <Link 
            to="/" 
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-900 text-sm font-medium">Team Management</span>
        </div>
        
        {/* Page Title and Info */}
        <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
        <p className="text-gray-600 mt-2">
          Manage your team members and their roles
          {/* Show admin badge for administrators */}
          {userRole === 'admin' && (
            <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
              👑 Admin
            </span>
          )}
        </p>
        
        {/* Development Debug Information */}
        {process.env.NODE_ENV === 'development' && (
          <p className="text-xs text-gray-400 mt-2">
            Debug: Team ID = {teamId}, User ID = {user?.userId}, Role = {userRole}
          </p>
        )}
      </div>

      {/* ========================================================================
          ERROR MESSAGE SECTION
          - Displays error and success messages
          - Shows retry button for certain types of errors
          - Auto-dismissing success messages
      ======================================================================== */}
      {error && (
        <div className="mb-6">
          <ErrorMessage 
            message={error}
            onDismiss={() => setError(null)}
            type={error.includes('successfully') || error.includes('🎉') ? 'success' : 'error'}
          />
          {/* Show retry button for load failures */}
          {error.includes('Failed to load') && (
            <div className="mt-3">
              <button
                onClick={handleRetry}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================
          TEAM STATISTICS SECTION
          - Shows total members, admin count, and regular member count
          - Visual cards with icons for better UX
          - Responsive grid layout
      ======================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Members Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Members</p>
              <p className="text-2xl font-bold text-gray-900">{members.length}</p>
            </div>
          </div>
        </div>

        {/* Admins Count Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Admins</p>
              <p className="text-2xl font-bold text-gray-900">
                {members.filter(m => m.role === 'admin').length}
              </p>
            </div>
          </div>
        </div>

        {/* Regular Members Count Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Members</p>
              <p className="text-2xl font-bold text-gray-900">
                {members.filter(m => m.role === 'member').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          TEAM MEMBERS SECTION
          - Main content area for team member management
          - Header with add member button (admin only)
          - Add member form (conditional rendering)
          - Members list or empty state
      ======================================================================== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Section Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Team Members</h2>
          {/* Add Member Button - Only visible to admins */}
          {userRole === 'admin' && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Add Member</span>
            </button>
          )}
        </div>

        {/* ====================================================================
            ADD MEMBER FORM
            - Conditional rendering based on showAddForm state
            - Only visible to admin users
            - Email validation and submission handling
            - Loading states and form controls
        ==================================================================== */}
        {showAddForm && userRole === 'admin' && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label htmlFor="memberEmail" className="block text-sm font-medium text-gray-700 mb-2">
                  Member Email Address
                </label>
                <div className="flex space-x-3">
                  {/* Email Input Field */}
                  <div className="flex-1 relative">
                    {/* Email Icon */}
                    <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                    <input
                      type="email"
                      id="memberEmail"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder="Enter member's email address..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={adding}
                      required
                    />
                  </div>
                  
                  {/* Add Button */}
                  <button
                    type="submit"
                    disabled={adding || !memberEmail.trim()}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    {adding ? (
                      /* Loading State */
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Adding...</span>
                      </>
                    ) : (
                      /* Normal State */
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span>Add</span>
                      </>
                    )}
                  </button>
                  
                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setMemberEmail('');
                      setError(null);
                    }}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ====================================================================
            MEMBERS LIST
            - Displays team members or empty state
            - Uses MemberCard component for individual member display
            - Role-based empty state messaging
        ==================================================================== */}
        <div className="p-6">
          {members.length > 0 ? (
            /* Members List - Displays when members are available */
            <div className="space-y-4">
              {members.map((member) => (
                <MemberCard
                  key={`${member.teamId}-${member.userId}`} // Unique key for React rendering
                  member={member}
                  currentUser={user}
                  userRole={userRole}
                />
              ))}
            </div>
          ) : (
            /* Empty State - Displays when no members are found */
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No team members yet</h3>
              <p className="text-gray-600 mb-4">
                {userRole === 'admin' 
                  ? 'Start building your team by adding members.' 
                  : 'Team members will appear here once added by administrators.'
                }
              </p>
              {/* Action button for admins */}
              {userRole === 'admin' && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Add First Member
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================
          QUICK ACTIONS SECTION
          - Navigation cards for common team operations
          - Link to team tasks view
          - Link to create new task (admin only)
          - Responsive grid layout with hover effects
      ======================================================================== */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* View Team Tasks Card */}
        <Link
          to={`/tasks/${teamId}`}
          className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105 card-hover"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-lg">View Team Tasks</h3>
              <p className="text-blue-100">Manage and track task progress</p>
            </div>
          </div>
        </Link>

        {/* Create New Task Card - Only visible to admins */}
        {userRole === 'admin' && (
          <Link
            to={`/create-task/${teamId}`}
            className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 card-hover"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Create New Task</h3>
                <p className="text-green-100">Add tasks for your team</p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CHILD COMPONENTS
// ============================================================================

/**
 * MemberCard Component - Displays individual team member information and controls
 * 
 * Features:
 * - Shows member details (ID, join date, role)
 * - Visual indicators for current user and role status
 * - Action buttons for member management (admin only)
 * - Enhanced user identification across multiple Cognito ID formats
 * - Responsive design for different screen sizes
 * 
 * Future enhancements could include:
 * - Role change functionality
 * - Member removal capability
 * - Member profile editing
 * 
 * @param {Object} member - Member object from GraphQL API
 * @param {Object} currentUser - Current authenticated user object
 * @param {string} userRole - Current user's role in the team
 */
function MemberCard({ member, currentUser, userRole }) {
  // ENHANCED CURRENT USER DETECTION
  // Check if this member card represents the currently authenticated user
  // Uses multiple possible user identifiers to handle different Cognito auth scenarios
  const isCurrentUser = [
    currentUser?.userId,           // Primary normalized ID
    currentUser?.sub,              // Cognito UUID
    currentUser?.username,         // Username
    currentUser?.email,            // Email address
    currentUser?.signInDetails?.loginId, // Login ID
    currentUser?.attributes?.email // Attributes email
  ].filter(Boolean).some(id => id === member.userId);

  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      {/* ====================================================================
          MEMBER INFORMATION SECTION
          - Avatar with member initial
          - Member ID/name display
          - Current user indicator
          - Join date information
      ==================================================================== */}
      <div className="flex items-center space-x-4">
        {/* Member Avatar */}
        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-lg">
            {member.userId.charAt(0).toUpperCase()}
          </span>
        </div>
        
        {/* Member Details */}
        <div>
          <div className="flex items-center space-x-2">
            {/* Member Name/ID */}
            <h3 className="font-semibold text-gray-900">{member.userId}</h3>
            
            {/* Current User Badge */}
            {isCurrentUser && (
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                You
              </span>
            )}
          </div>
          
          {/* Join Date */}
          <p className="text-sm text-gray-500">
            Joined {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'Recently'}
          </p>
        </div>
      </div>
      
      {/* ====================================================================
          MEMBER ACTIONS SECTION
          - Role badge with visual distinction
          - Action buttons for member management (admin only)
          - Permission-based visibility controls
      ==================================================================== */}
      <div className="flex items-center space-x-3">
        {/* Role Badge */}
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          member.role === 'admin' 
            ? 'bg-red-100 text-red-800'  // Admin styling with crown icon
            : 'bg-blue-100 text-blue-800' // Member styling with user icon
        }`}>
          {member.role === 'admin' ? '👑 Admin' : '👤 Member'}
        </span>
        
        {/* Member Management Actions - Only visible to admins for non-admin members */}
        {userRole === 'admin' && member.role !== 'admin' && !isCurrentUser && (
          <div className="flex space-x-2">
            {/* Edit Member Button */}
            <button 
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit Member"
              onClick={() => {
                // TODO: Implement member editing functionality
                // This could open a modal for changing roles or updating member details
                console.log('Edit member:', member.userId);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            
            {/* Remove Member Button */}
            <button 
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove Member"
              onClick={() => {
                // TODO: Implement member removal functionality
                // This should show a confirmation dialog before removing the member
                console.log('Remove member:', member.userId);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export the main TeamManagement component
export default TeamManagement;