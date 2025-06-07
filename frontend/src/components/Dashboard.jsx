// Import React hooks for state management and lifecycle effects
import { useState, useEffect } from 'react';
// Import React Router hook for programmatic navigation
import { useNavigate } from 'react-router-dom';
// Import AWS Amplify function to create GraphQL API client
import { generateClient } from 'aws-amplify/api';
// Import GraphQL queries and mutations for team operations
import { listTeams } from '../graphql/queries';
import { createTeam } from '../graphql/mutations';
// Import reusable UI components
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

// Create a GraphQL client instance for making API calls
const client = generateClient();

// Main Dashboard component that displays user teams and provides team management functionality
function Dashboard({ user }) {
  // State to store the list of teams the user belongs to
  const [teams, setTeams] = useState([]);
  // State to track if teams are currently being loaded from the API
  const [loading, setLoading] = useState(true);
  // State to track if a new team is currently being created
  const [creating, setCreating] = useState(false);
  // State to control visibility of the team creation form
  const [showCreateForm, setShowCreateForm] = useState(false);
  // State to store the name input for creating a new team
  const [teamName, setTeamName] = useState('');
  // State to store any error messages to display to the user
  const [error, setError] = useState(null);
  // State to store calculated statistics about the user's teams
  const [stats, setStats] = useState({
    totalTeams: 0,    // Total number of teams user belongs to
    adminTeams: 0,    // Number of teams where user is an admin
    memberTeams: 0    // Number of teams where user is a regular member
  });
  // React Router hook for programmatic navigation between pages
  const navigate = useNavigate();

  // Effect hook to fetch teams when the component mounts or user changes
  useEffect(() => {
    // Check if user object exists and has a valid userId
    if (user?.userId) {
      console.log('Dashboard - User available, fetching teams:', user.userId);
      fetchTeams(); // Fetch teams from API
    } else {
      // Handle case where user is not properly authenticated
      console.error('Dashboard - No user ID available:', user);
      setError('User authentication issue. Please refresh the page or sign out and back in.');
      setLoading(false); // Stop loading since we can't fetch without valid user
    }
  }, [user]); // Re-run effect when user object changes

  // Effect hook to calculate team statistics whenever the teams array changes
  useEffect(() => {
    // Only calculate stats if there are teams to analyze
    if (teams.length > 0) {
      // Count teams where user role is 'admin'
      const adminTeams = teams.filter(team => team.userRole === 'admin').length;
      // Count teams where user role is 'member'
      const memberTeams = teams.filter(team => team.userRole === 'member').length;
      
      // Update stats state with calculated values
      setStats({
        totalTeams: teams.length,
        adminTeams,
        memberTeams
      });
    } else {
      // Reset stats to zero if no teams exist
      setStats({
        totalTeams: 0,
        adminTeams: 0,
        memberTeams: 0
      });
    }
  }, [teams]); // Re-run effect when teams array changes

  // Async function to fetch teams from the GraphQL API
  async function fetchTeams() {
    try {
      // Set loading state to show spinner to user
      setLoading(true);
      // Clear any previous errors
      setError(null);
      
      // Log user information for debugging purposes
      console.log('Dashboard - Fetching teams for user:', user?.userId);
      console.log('Dashboard - Full user object for debugging:', user);
      
      // Make GraphQL query to fetch teams for the current user
      const response = await client.graphql({
        query: listTeams,           // GraphQL query to list user's teams
        authMode: 'userPool'        // Use Cognito User Pool for authentication
      });
      
      // Log the full response for debugging
      console.log('Dashboard - Teams response:', response);
      
      // Check if response contains expected data structure
      if (response.data && response.data.listTeams) {
        const teamsData = response.data.listTeams;
        console.log('Dashboard - Teams data received:', teamsData);
        setTeams(teamsData); // Update teams state with fetched data
        
        // Log if no teams were found (normal for new users)
        if (teamsData.length === 0) {
          console.log('Dashboard - No teams found for user. This might be expected for new users.');
        }
      } else {
        // Handle case where response structure is unexpected
        console.log('Dashboard - No teams data in response structure');
        setTeams([]); // Set empty array as fallback
      }
      
    } catch (err) {
      // Handle any errors that occur during the API call
      console.error('Dashboard - Fetch teams error:', err);
      console.error('Dashboard - Error details:', {
        message: err.message,
        errors: err.errors,
        stack: err.stack
      });
      
      // Start building user-friendly error message
      let errorMessage = 'Failed to load teams. ';
      
      // Parse GraphQL-specific errors for better user feedback
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('Dashboard - First GraphQL error:', firstError);
        
        // Handle different types of GraphQL errors
        if (firstError.errorType === 'AuthorizationError') {
          errorMessage += 'Authentication issue detected. Please try signing out and back in.';
        } else if (firstError.errorType === 'ValidationError') {
          errorMessage += firstError.message;
        } else if (firstError.errorType === 'NotFoundError') {
          // NotFoundError might be normal for new users with no teams
          errorMessage = 'No teams found. This is normal for new users.';
          setTeams([]); // Set empty teams array
          return; // Exit early, this isn't really an error
        } else {
          errorMessage += firstError.message || 'Unknown GraphQL error occurred.';
        }
      } else if (err.message) {
        // Handle different types of general errors based on message content
        if (err.message.includes('NetworkError') || err.message.includes('fetch')) {
          errorMessage += 'Network connection issue. Please check your internet connection and try again.';
        } else if (err.message.includes('GraphQL')) {
          errorMessage += 'Service temporarily unavailable. Please try again in a moment.';
        } else if (err.message.includes('Authentication') || err.message.includes('Unauthorized')) {
          errorMessage += 'Authentication expired. Please sign out and back in.';
        } else {
          errorMessage += err.message;
        }
      } else {
        // Fallback for completely unknown errors
        errorMessage += 'Unknown error occurred. Please try refreshing the page.';
      }
      
      // Set the formatted error message and reset teams
      setError(errorMessage);
      setTeams([]);
    } finally {
      // Always stop loading spinner, regardless of success or failure
      setLoading(false);
    }
  }

  // Function to handle team creation form submission
  async function handleCreateTeam(e) {
    // Prevent default form submission behavior
    e.preventDefault();
    
    // Validate that team name is not empty or just whitespace
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    // Validate team name length (business rule: max 100 characters)
    if (teamName.trim().length > 100) {
      setError('Team name cannot exceed 100 characters');
      return;
    }

    try {
      // Set creating state to show loading UI during creation
      setCreating(true);
      // Clear any previous errors
      setError(null);
      
      // Log team creation attempt for debugging
      console.log('Dashboard - Creating team with name:', teamName.trim());
      console.log('Dashboard - Current user for team creation:', user);
      
      // Make GraphQL mutation to create new team
      const response = await client.graphql({
        query: createTeam,                    // GraphQL mutation for team creation
        variables: { name: teamName.trim() }, // Pass trimmed team name as variable
        authMode: 'userPool'                  // Use Cognito User Pool for authentication
      });
      
      // Log the response for debugging
      console.log('Dashboard - Create team response:', response);
      
      // Check if team was successfully created
      if (response.data && response.data.createTeam) {
        const newTeam = response.data.createTeam;
        console.log('Dashboard - Team created successfully:', newTeam);
        
        // Reset form inputs and hide creation form
        setTeamName('');
        setShowCreateForm(false);
        
        // Add new team to existing teams list (optimistic update)
        setTeams(prevTeams => [...prevTeams, newTeam]);
        
        // Show success message to user
        setError('Team created successfully! 🎉 You can now manage it below.');
        // Auto-dismiss success message after 4 seconds
        setTimeout(() => {
          setError(null);
        }, 4000);
        
        // Refresh teams list after 1 second to ensure data consistency
        setTimeout(() => fetchTeams(), 1000);
      } else {
        // Handle case where response doesn't contain expected team data
        throw new Error('Invalid response from server - no team data returned');
      }
      
    } catch (err) {
      // Handle errors during team creation
      console.error('Dashboard - Create team error:', err);
      console.error('Dashboard - Create team error details:', {
        message: err.message,
        errors: err.errors,
        stack: err.stack
      });
      
      // Start building user-friendly error message
      let errorMessage = 'Failed to create team. ';
      
      // Parse GraphQL-specific errors
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('Dashboard - First create team error:', firstError);
        
        // Handle different types of creation errors
        if (firstError.errorType === 'ValidationError') {
          errorMessage = firstError.message; // Use exact validation message
        } else if (firstError.errorType === 'AuthorizationError') {
          errorMessage += 'You do not have permission to create teams. Please check your account status.';
        } else {
          errorMessage += firstError.message || 'Unknown error from server.';
        }
      } else if (err.message) {
        // Handle different types of general errors
        if (err.message.includes('Cannot find module') || err.message.includes('Lambda')) {
          errorMessage += 'Server configuration issue. Please contact support.';
        } else if (err.message.includes('Network')) {
          errorMessage += 'Network issue. Please check your connection and try again.';
        } else {
          errorMessage += err.message;
        }
      } else {
        // Fallback for unknown errors
        errorMessage += 'Please try again later.';
      }
      
      // Set the formatted error message
      setError(errorMessage);
    } finally {
      // Always stop the creating spinner, regardless of success or failure
      setCreating(false);
    }
  }

  // Function to handle canceling team creation
  function handleCancelCreate() {
    setShowCreateForm(false); // Hide the creation form
    setTeamName('');          // Clear the team name input
    setError(null);           // Clear any error messages
  }

  // Function to retry fetching teams (used when there's an error)
  function handleRetryFetch() {
    setError(null);  // Clear error message
    fetchTeams();    // Attempt to fetch teams again
  }

  // FIXED: Enhanced navigation handlers with better team validation
  // Function to handle navigation to different team-related pages
  const handleNavigateToTeam = (teamId, actionType = 'manage') => {
    // Validate that teamId is valid and not undefined/null strings
    if (!teamId || teamId === 'undefined' || teamId === 'null') {
      console.error('Dashboard - Invalid team ID for navigation:', teamId);
      setError('Invalid team selected. Please try again.');
      return;
    }

    // Verify that the team exists in our current teams list
    const team = teams.find(t => t.teamId === teamId);
    if (!team) {
      console.error('Dashboard - Team not found in current teams list:', teamId);
      setError('Team not found. Please refresh the page and try again.');
      return;
    }

    // Log navigation attempt for debugging
    console.log(`Dashboard - Navigating to ${actionType} for team:`, teamId, 'Team data:', team);
    
    // Navigate to appropriate route based on action type
    switch (actionType) {
      case 'manage':
        navigate(`/team/${teamId}`);    // Go to team management page
        break;
      case 'tasks':
        navigate(`/tasks/${teamId}`);   // Go to team tasks page
        break;
      default:
        // Handle unknown action types
        console.error('Dashboard - Unknown action type:', actionType);
        setError('Invalid navigation action.');
    }
  };

  // Show loading spinner while teams are being fetched
  if (loading) {
    return <LoadingSpinner message="Loading your teams..." />;
  }

  // Create user display name from various possible sources with fallbacks
  const userDisplayName = user?.displayName ||                      // Preferred: explicit display name
                         user?.email?.split('@')[0] ||              // Fallback: part before @ in email
                         user?.username?.split('@')[0] ||           // Fallback: part before @ in username
                         user?.signInDetails?.loginId?.split('@')[0] || // Fallback: part before @ in login ID
                         'User';                                     // Final fallback

  // Render the main dashboard UI
  return (
    <div className="max-w-6xl mx-auto">  {/* Main container with max width and centered */}
      {/* Header section with welcome message and user info */}
      <div className="mb-8"> {/* Bottom margin for spacing */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2"> {/* Main heading */}
          Welcome back, {userDisplayName}!
        </h1>
        <p className="text-gray-600"> {/* Subtitle/description */}
          Manage your teams and track project progress
        </p>
        {/* Debug information shown only in development environment */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
            <p><strong>Debug Info:</strong></p>
            <p>User ID: {user?.userId || 'undefined'}</p>
            <p>Display Name Source: {user?.displayName ? 'displayName' : user?.email ? 'email' : user?.username ? 'username' : 'fallback'}</p>
            <p>Teams Count: {teams.length}</p>
          </div>
        )}
      </div>

      {/* Error message section - only shown when there's an error */}
      {error && (
        <div className="mb-6"> {/* Bottom margin for spacing */}
          <ErrorMessage 
            message={error}
            onDismiss={() => setError(null)} // Allow user to dismiss error
            // Show success styling for success messages, error styling for others
            type={error.includes('successfully') || error.includes('🎉') ? 'success' : 'error'}
          />
          {/* Show retry button only for failed load operations (not success messages) */}
          {error.includes('Failed to load teams') && !error.includes('successfully') && (
            <div className="mt-3">
              <button
                onClick={handleRetryFetch}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Statistics cards section showing team counts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"> {/* Responsive grid layout */}
        {/* Total teams stat card */}
        <StatsCard
          title="Total Teams"
          value={stats.totalTeams}
          icon={<TeamsIcon />}
          color="blue"
        />
        {/* Admin teams stat card */}
        <StatsCard
          title="Teams as Admin"
          value={stats.adminTeams}
          icon={<AdminIcon />}
          color="green"
        />
        {/* Member teams stat card */}
        <StatsCard
          title="Teams as Member"
          value={stats.memberTeams}
          icon={<MemberIcon />}
          color="purple"
        />
      </div>

      {/* Main teams section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200"> {/* Card container */}
        {/* Section header with title and create button */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center"> {/* Header with flex layout */}
          <h2 className="text-xl font-semibold text-gray-900">Your Teams</h2> {/* Section title */}
          {/* Create team button */}
          <button
            onClick={() => setShowCreateForm(true)} // Show creation form when clicked
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {/* Plus icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Team</span> {/* Button text */}
          </button>
        </div>

        {/* Team creation form - only shown when showCreateForm is true */}
        {showCreateForm && (
          <CreateTeamForm
            teamName={teamName}
            setTeamName={setTeamName}
            onSubmit={handleCreateTeam}
            onCancel={handleCancelCreate}
            creating={creating}
          />
        )}

        {/* Teams content section */}
        <div className="p-6"> {/* Padding around content */}
          {/* Conditional rendering based on whether teams exist */}
          {teams.length > 0 ? (
            // Show teams grid when teams exist
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> {/* Responsive grid */}
              {/* Render a card for each team */}
              {teams.map((team) => (
                <TeamCard
                  key={team.teamId}           // Unique key for React list rendering
                  team={team}                 // Team data
                  currentUser={user}          // Current user data
                  onNavigate={handleNavigateToTeam} // Navigation handler
                />
              ))}
            </div>
          ) : (
            // Show empty state when no teams exist
            <EmptyTeamsState
              onCreateTeam={() => setShowCreateForm(true)} // Show creation form
              hasError={!!error && !error.includes('successfully')} // Pass error state (excluding success messages)
              onRetry={handleRetryFetch} // Retry handler for errors
            />
          )}
        </div>
      </div>

      {/* FIXED: Enhanced Quick Actions with better team validation */}
      {/* Quick actions section - only shown when user has teams */}
      {teams.length > 0 && (
        <div className="mt-8"> {/* Top margin for spacing */}
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3> {/* Section title */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> {/* Responsive grid */}
            {/* Recent teams quick action */}
            <QuickActionCard
              title="Recent Teams"
              description="Access your recently active teams"
              icon={<RecentIcon />}
              onClick={() => {
                const targetTeam = teams[0]; // Most recent team (first in array)
                // Validate team exists and has valid ID before navigation
                if (targetTeam && targetTeam.teamId) {
                  handleNavigateToTeam(targetTeam.teamId, 'manage');
                } else {
                  setError('No teams available for navigation.');
                }
              }}
              disabled={teams.length === 0} // Disable if no teams
            />
            {/* All tasks quick action */}
            <QuickActionCard
              title="All Tasks"
              description="View tasks across all teams"
              icon={<TasksIcon />}
              onClick={() => {
                const targetTeam = teams[0]; // Use first available team
                // Validate team exists and has valid ID before navigation
                if (targetTeam && targetTeam.teamId) {
                  handleNavigateToTeam(targetTeam.teamId, 'tasks');
                } else {
                  setError('No teams available for task viewing.');
                }
              }}
              disabled={teams.length === 0} // Disable if no teams
            />
            {/* Team management quick action */}
            <QuickActionCard
              title="Team Management"
              description="Manage team settings and members"
              icon={<SettingsIcon />}
              onClick={() => {
                // Prefer admin teams for management (since they have more permissions)
                const adminTeam = teams.find(team => team.userRole === 'admin');
                const targetTeam = adminTeam || teams[0]; // Use admin team if available, otherwise first team
                // Validate team exists and has valid ID before navigation
                if (targetTeam && targetTeam.teamId) {
                  handleNavigateToTeam(targetTeam.teamId, 'manage');
                } else {
                  setError('No teams available for management.');
                }
              }}
              disabled={teams.length === 0} // Disable if no teams
            />
          </div>
        </div>
      )}
    </div>
  );
}

// StatsCard component for displaying team statistics with icons and colors
function StatsCard({ title, value, icon, color }) {
  // Define color classes for different stat types
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',     // Blue theme for total teams
    green: 'bg-green-100 text-green-600',  // Green theme for admin teams
    purple: 'bg-purple-100 text-purple-600' // Purple theme for member teams
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"> {/* Card container */}
      <div className="flex items-center"> {/* Flex layout for icon and text */}
        {/* Icon container with dynamic color styling */}
        <div className={`w-12 h-12 ${colorClasses[color]} rounded-lg flex items-center justify-center`}> 
          {icon} {/* Render the passed icon */}
        </div>
        <div className="ml-4"> {/* Text content with left margin */}
          <p className="text-sm font-medium text-gray-600">{title}</p> {/* Stat title */}
          <p className="text-2xl font-bold text-gray-900">{value}</p> {/* Stat value */}
        </div>
      </div>
    </div>
  );
}

// CreateTeamForm component for the team creation form UI
function CreateTeamForm({ teamName, setTeamName, onSubmit, onCancel, creating }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200"> {/* Form container with background */}
      <form onSubmit={onSubmit} className="space-y-4"> {/* Form with vertical spacing */}
        <div>
          {/* Team name input label */}
          <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2"> 
            Team Name
          </label>
          {/* Team name input field */}
          <input
            type="text"
            id="teamName"
            placeholder="Enter team name (max 100 characters)..." // Helpful placeholder
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)} // Update state on input change
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={creating} // Disable input while creating
            maxLength={100}     // Enforce max length at HTML level
            required            // Make field required
          />
          {/* Character counter */}
          <p className="text-xs text-gray-500 mt-1"> 
            {teamName.length}/100 characters
          </p>
        </div>
        
        {/* Form action buttons */}
        <div className="flex space-x-3"> {/* Horizontal layout with spacing */}
          {/* Submit/Create button */}
          <button
            type="submit"
            disabled={creating || !teamName.trim()} // Disable if creating or no name entered
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            {/* Conditional rendering for button content based on creating state */}
            {creating ? (
              <>
                {/* Loading spinner for creating state */}
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
                <span>Creating...</span> {/* Creating text */}
              </>
            ) : (
              <>
                {/* Checkmark icon for normal state */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Create</span> {/* Create text */}
              </>
            )}
          </button>
          {/* Cancel button */}
          <button
            type="button"
            onClick={onCancel}
            disabled={creating} // Disable during creation to prevent form abandonment
            className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// TeamCard component for displaying individual team information and actions
function TeamCard({ team, currentUser, onNavigate }) {
  // Configuration for different user roles within teams
  const roleConfig = {
    admin: {
      badge: '👑 Admin',                              // Crown emoji for admin
      badgeColor: 'bg-red-100 text-red-800',        // Red styling for admin badge
      description: 'You can manage this team'        // Admin description
    },
    member: {
      badge: '👤 Member',                             // Person emoji for member
      badgeColor: 'bg-blue-100 text-blue-800',      // Blue styling for member badge
      description: 'You are a team member'           // Member description
    }
  };

  // Get configuration for current user's role, default to member if role not found
  const config = roleConfig[team.userRole] || roleConfig.member;

  // FIXED: Enhanced navigation handlers with validation
  // Handler for manage button click
  const handleManageClick = () => {
    // Validate team ID exists before attempting navigation
    if (!team.teamId) {
      console.error('TeamCard - No team ID available for manage action');
      return;
    }
    console.log('TeamCard - Manage clicked for team:', team.teamId);
    onNavigate(team.teamId, 'manage'); // Navigate to team management page
  };

  // Handler for tasks button click
  const handleTasksClick = () => {
    // Validate team ID exists before attempting navigation
    if (!team.teamId) {
      console.error('TeamCard - No team ID available for tasks action');
      return;
    }
    console.log('TeamCard - Tasks clicked for team:', team.teamId);
    onNavigate(team.teamId, 'tasks'); // Navigate to team tasks page
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all hover:border-gray-300"> {/* Card container with hover effects */}
      {/* Team header with icon and name */}
      <div className="flex items-center space-x-3 mb-3"> {/* Flex layout with spacing */}
        {/* Team avatar/icon with first letter of team name */}
        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center"> 
          <span className="text-white font-bold text-sm"> 
            {team.name.charAt(0).toUpperCase()} {/* First letter of team name, uppercase */}
          </span>
        </div>
        <div className="flex-1 min-w-0"> {/* Flex-grow container with min-width for text truncation */}
          <h3 className="font-semibold text-gray-900 truncate">{team.name}</h3> {/* Team name with truncation */}
          <p className="text-xs text-gray-500"> {/* Creation date */}
            Created {team.createdAt ? new Date(team.createdAt).toLocaleDateString() : 'Recently'}
          </p>
        </div>
      </div>
      
      {/* User role badge and description */}
      <div className="mb-3"> {/* Bottom margin for spacing */}
        {/* Role badge with dynamic styling */}
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.badgeColor}`}>
          {config.badge}
        </span>
        {/* Role description */}
        <p className="text-xs text-gray-500 mt-1">{config.description}</p>
      </div>
      
      {/* Debug info in development environment only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-3 text-xs text-gray-400">
          Team ID: {team.teamId || 'undefined'}
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex space-x-2"> {/* Horizontal layout with spacing between buttons */}
        {/* Manage team button */}
        <button
          onClick={handleManageClick}
          disabled={!team.teamId} // Disable if no valid team ID
          className="flex-1 bg-blue-50 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Manage
        </button>
        {/* View tasks button */}
        <button
          onClick={handleTasksClick}
          disabled={!team.teamId} // Disable if no valid team ID
          className="flex-1 bg-green-50 hover:bg-green-100 disabled:bg-gray-100 disabled:text-gray-400 text-green-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Tasks
        </button>
      </div>
    </div>
  );
}

// EmptyTeamsState component for when user has no teams or there's an error loading teams
function EmptyTeamsState({ onCreateTeam, hasError, onRetry }) {
  // Show error state if there was a problem loading teams
  if (hasError) {
    return (
      <div className="text-center py-12"> {/* Centered content with vertical padding */}
        {/* Error icon */}
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        {/* Error title */}
        <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load teams</h3> 
        {/* Error description */}
        <p className="text-gray-600 mb-4">There was an issue loading your teams. Please try again.</p> 
        {/* Action buttons for error state */}
        <div className="flex justify-center space-x-3">
          {/* Retry button to attempt loading teams again */}
          <button
            onClick={onRetry}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try Again
          </button>
          {/* Create team button as alternative action */}
          <button
            onClick={onCreateTeam}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Create Team
          </button>
        </div>
      </div>
    );
  }

  // Show normal empty state when user simply has no teams yet
  return (
    <div className="text-center py-12"> {/* Centered content with vertical padding */}
      {/* Empty state icon (people/teams icon) */}
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      {/* Empty state title */}
      <h3 className="text-lg font-medium text-gray-900 mb-2">No teams yet</h3> 
      {/* Empty state description encouraging user to create first team */}
      <p className="text-gray-600 mb-4">Create your first team to start managing tasks and collaborating with others.</p> 
      {/* Create first team button */}
      <button
        onClick={onCreateTeam}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Create Your First Team
      </button>
    </div>
  );
}

// QuickActionCard component for quick action buttons (Recent Teams, All Tasks, etc.)
function QuickActionCard({ title, description, icon, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      // Dynamic classes based on disabled state
      className={`p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {/* Card content with icon and text */}
      <div className="flex items-center space-x-3"> {/* Flex layout with spacing */}
        {/* Icon container */}
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"> 
          {icon} {/* Render the passed icon */}
        </div>
        <div>
          {/* Card title */}
          <h4 className="font-medium text-gray-900">{title}</h4> 
          {/* Card description */}
          <p className="text-sm text-gray-600">{description}</p> 
        </div>
      </div>
    </button>
  );
}

// Icon component for teams statistics card
function TeamsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      {/* People/teams icon path */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /> 
    </svg>
  );
}

// Icon component for admin statistics card
function AdminIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      {/* Shield with checkmark icon path (represents admin/security) */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> 
    </svg>
  );
}

// Icon component for member statistics card
function MemberIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      {/* Single user icon path (represents team member) */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> 
    </svg>
  );
}

// Icon component for recent teams quick action
function RecentIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      {/* Clock icon path (represents recent/time) */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> 
    </svg>
  );
}

// Icon component for tasks quick action
function TasksIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      {/* Clipboard icon path (represents tasks/to-do items) */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> 
    </svg>
  );
}

// Icon component for settings/management quick action
function SettingsIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {/* Settings gear icon path (represents configuration/management) */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /> 
      {/* Inner circle for gear center */}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Export the Dashboard component as the default export
export default Dashboard;