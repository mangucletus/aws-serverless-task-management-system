import { useState, useEffect } from 'react'; // Imports React hooks: useState for state management, useEffect for handling side effects
import { useNavigate } from 'react-router-dom'; // Imports useNavigate hook for programmatic navigation in React Router
import { generateClient } from 'aws-amplify/api'; // Imports function to create an AWS Amplify GraphQL client
import { getCurrentUser } from 'aws-amplify/auth'; // Imports function to retrieve the current authenticated user's data
import { listTeams } from '../graphql/queries'; // Imports GraphQL query for listing teams
import { createTeam } from '../graphql/mutations'; // Imports GraphQL mutation for creating a new team
import LoadingSpinner from './LoadingSpinner'; // Imports LoadingSpinner component to display during loading states
import ErrorMessage from './ErrorMessage'; // Imports ErrorMessage component to display error messages

// Initializes the AWS Amplify GraphQL client for making API requests
const client = generateClient();

// Defines the Dashboard component, which serves as the main view for authenticated users
function Dashboard({ user }) {
  // State to store the list of teams retrieved from the API
  const [teams, setTeams] = useState([]);
  // State to track loading status while fetching data
  const [loading, setLoading] = useState(true);
  // State to track whether a team creation operation is in progress
  const [creating, setCreating] = useState(false);
  // State to control visibility of the team creation form
  const [showCreateForm, setShowCreateForm] = useState(false);
  // State to store the team name input value
  const [teamName, setTeamName] = useState('');
  // State to store any error messages
  const [error, setError] = useState(null);
  // State to store the current user's enhanced data
  const [currentUser, setCurrentUser] = useState(null);
  // State to store team statistics (total, admin, and member counts)
  const [stats, setStats] = useState({
    totalTeams: 0, // Total number of teams
    adminTeams: 0, // Number of teams where user is admin
    memberTeams: 0 // Number of teams where user is a member
  });
  // Hook to navigate programmatically to different routes
  const navigate = useNavigate();

  // Effect to load the current user's data when the user prop changes
  useEffect(() => {
    loadCurrentUser(); // Calls function to fetch and set user data
  }, [user]); // Dependency array ensures effect runs when user prop changes

  // Effect to fetch teams when currentUser is available
  useEffect(() => {
    if (currentUser) {
      fetchTeams(); // Calls function to fetch teams
    }
  }, [currentUser]); // Dependency array ensures effect runs when currentUser changes

  // Effect to update team statistics when teams list changes
  useEffect(() => {
    // Update stats when teams change
    if (teams.length > 0) {
      const adminTeams = teams.filter(team => team.userRole === 'admin').length; // Counts teams where user is admin
      const memberTeams = teams.filter(team => team.userRole === 'member').length; // Counts teams where user is a member
      
      setStats({
        totalTeams: teams.length, // Sets total team count
        adminTeams, // Sets admin team count
        memberTeams // Sets member team count
      });
    }
  }, [teams]); // Dependency array ensures effect runs when teams array changes

  // Async function to load and enhance current user data
  async function loadCurrentUser() {
    try {
      const userData = await getCurrentUser(); // Fetches current user data from AWS Amplify
      setCurrentUser({
        ...userData, // Spreads fetched user data
        email: userData.signInDetails?.loginId || userData.username, // Sets email, falling back to username
        userId: userData.username // Sets userId to username
      });
    } catch (error) {
      console.error('Error loading current user:', error); // Logs any errors
      setError('Failed to load user information'); // Sets error message
    }
  }

  // Async function to fetch teams from the GraphQL API
  async function fetchTeams() {
    try {
      setLoading(true); // Sets loading state to true
      setError(null); // Clears any previous errors
      
      const response = await client.graphql({
        query: listTeams, // Uses the listTeams GraphQL query
        authMode: 'userPool' // Specifies Cognito User Pool authentication
      });
      
      console.log('Teams response:', response); // Logs response for debugging
      setTeams(response.data.listTeams || []); // Sets teams state, defaulting to empty array if no data
    } catch (err) {
      console.error('Fetch teams error:', err); // Logs any errors
      setError(`Failed to load teams: ${err.message || 'Unknown error'}`); // Sets error message
    } finally {
      setLoading(false); // Sets loading state to false
    }
  }

  // Async function to handle team creation form submission
  async function handleCreateTeam(e) {
    e.preventDefault(); // Prevents default form submission behavior
    
    if (!teamName.trim()) {
      setError('Team name is required'); // Sets error if team name is empty
      return;
    }

    if (teamName.trim().length > 100) {
      setError('Team name cannot exceed 100 characters'); // Sets error if team name is too long
      return;
    }

    try {
      setCreating(true); // Sets creating state to true
      setError(null); // Clears any previous errors
      
      console.log('Creating team with name:', teamName.trim()); // Logs team name for debugging
      
      const response = await client.graphql({
        query: createTeam, // Uses the createTeam GraphQL mutation
        variables: { name: teamName.trim() }, // Passes trimmed team name as variable
        authMode: 'userPool' // Specifies Cognito User Pool authentication
      });
      
      console.log('Create team response:', response); // Logs response for debugging
      
      setTeamName(''); // Clears team name input
      setShowCreateForm(false); // Hides the create team form
      await fetchTeams(); // Refreshes the teams list
      
      // Show success message
      setError(null); // Ensures no error is displayed
      
    } catch (err) {
      console.error('Create team error:', err); // Logs any errors
      
      // Extracts meaningful error message
      let errorMessage = 'Failed to create team. Please try again.'; // Default error message
      if (err.errors && err.errors.length > 0) {
        errorMessage = err.errors[0].message; // Uses first GraphQL error message if available
      } else if (err.message) {
        errorMessage = err.message; // Uses general error message if available
      }
      
      setError(errorMessage); // Sets error message
    } finally {
      setCreating(false); // Sets creating state to false
    }
  }

  // Function to handle canceling the team creation form
  function handleCancelCreate() {
    setShowCreateForm(false); // Hides the create team form
    setTeamName(''); // Clears team name input
    setError(null); // Clears any errors
  }

  // Renders a loading spinner while data is being fetched
  if (loading) {
    return <LoadingSpinner message="Loading your teams..." />; // Displays loading spinner with message
  }

  // Derives display name from user's email or username
  const userDisplayName = currentUser?.email?.split('@')[0] || currentUser?.username || 'User';

  // Renders the main dashboard content
  return (
    <div className="max-w-6xl mx-auto">  
      {/* Header */}
      <div className="mb-8"> 
        <h1 className="text-3xl font-bold text-gray-900 mb-2"> 
          Welcome back, {userDisplayName}!
        </h1>
        <p className="text-gray-600"> 
          Manage your teams and track project progress
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6"> 
          <ErrorMessage 
            message={error} // Passes error message to component
            onDismiss={() => setError(null)} // Clears error when dismissed
          />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"> 
        <StatsCard
          title="Total Teams" // Card title
          value={stats.totalTeams} // Displays total team count
          icon={<TeamsIcon />} // Renders team icon
          color="blue" // Sets card color scheme
        />
        
        <StatsCard
          title="Teams as Admin" // Card title
          value={stats.adminTeams} // Displays admin team count
          icon={<AdminIcon />} // Renders admin icon
          color="green" // Sets card color scheme
        />
        
        <StatsCard
          title="Teams as Member" // Card title
          value={stats.memberTeams} // Displays member team count
          icon={<MemberIcon />} // Renders member icon
          color="purple" // Sets card color scheme
        />
      </div>

      {/* Teams Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200"> 
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center"> 
          <h2 className="text-xl font-semibold text-gray-900">Your Teams</h2> 
          <button
            onClick={() => setShowCreateForm(true)} // Shows create team form on click
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" // Styles for create team button
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Team</span> 
          </button>
        </div>

        {/* Create Team Form */}
        {showCreateForm && (
          <CreateTeamForm
            teamName={teamName} // Passes team name input value
            setTeamName={setTeamName} // Passes function to update team name
            onSubmit={handleCreateTeam} // Passes form submission handler
            onCancel={handleCancelCreate} // Passes cancel handler
            creating={creating} // Passes creating state
            error={error} // Passes error message
          />
        )}

        {/* Teams List */}
        <div className="p-6"> 
          {teams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> 
              {teams.map((team) => (
                <TeamCard
                  key={team.teamId} // Unique key for each team card
                  team={team} // Passes team data
                  currentUser={currentUser} // Passes current user data
                  onNavigate={navigate} // Passes navigation function
                />
              ))}
            </div>
          ) : (
            <EmptyTeamsState
              onCreateTeam={() => setShowCreateForm(true)} // Shows create team form on click
            />
          )}
        </div>
      </div>

      {/* Quick Actions */}
      {teams.length > 0 && (
        <div className="mt-8"> 
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3> 
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> 
            <QuickActionCard
              title="Recent Teams" // Card title
              description="Access your recently active teams" // Card description
              icon={<RecentIcon />} // Renders recent teams icon
              onClick={() => {
                if (teams.length > 0) {
                  navigate(`/team/${teams[0].teamId}`); // Navigates to the first team's page
                }
              }}
            />
            
            <QuickActionCard
              title="All Tasks" // Card title
              description="View tasks across all teams" // Card description
              icon={<TasksIcon />} // Renders tasks icon
              onClick={() => {
                // Navigate to the first team's tasks
                if (teams.length > 0) {
                  navigate(`/tasks/${teams[0].teamId}`); // Navigates to the first team's tasks page
                }
              }}
            />
            
            <QuickActionCard
              title="Team Management" // Card title
              description="Manage team settings and members" // Card description
              icon={<SettingsIcon />} // Renders settings icon
              onClick={() => {
                if (teams.length > 0) {
                  const adminTeam = teams.find(team => team.userRole === 'admin'); // Finds first admin team
                  if (adminTeam) {
                    navigate(`/team/${adminTeam.teamId}`); // Navigates to admin team page
                  } else {
                    navigate(`/team/${teams[0].teamId}`); // Falls back to first team
                  }
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Stats Card Component
// Displays a card with a title, value, icon, and color scheme
function StatsCard({ title, value, icon, color }) {
  // Defines color classes for different card types
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600', // Blue color scheme
    green: 'bg-green-100 text-green-600', // Green color scheme
    purple: 'bg-purple-100 text-purple-600' // Purple color scheme
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center"> 
        <div className={`w-12 h-12 ${colorClasses[color]} rounded-lg flex items-center justify-center`}> 
          {icon} 
        </div>
        <div className="ml-4"> 
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p> 
        </div>
      </div>
    </div>
  );
}

// Create Team Form Component
// Renders a form for creating a new team
function CreateTeamForm({ teamName, setTeamName, onSubmit, onCancel, creating, error }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200"> 
      <form onSubmit={onSubmit} className="space-y-4"> 
        <div>
          <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2"> 
            Team Name
          </label>
          <input
            type="text" // Text input field
            id="teamName" // Input ID for accessibility
            placeholder="Enter team name (max 100 characters)..." // Placeholder text
            value={teamName} // Binds input value to state
            onChange={(e) => setTeamName(e.target.value)} // Updates state on input change
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" // Input styling
            disabled={creating} // Disables input during team creation
            maxLength={100} // Limits input to 100 characters
            required // Makes input required
          />
          <p className="text-xs text-gray-500 mt-1"> 
            {teamName.length}/100 
          </p>
        </div>
        
        <div className="flex space-x-3"> 
          <button
            type="submit" // Submit button
            disabled={creating || !teamName.trim()} // Disables button during creation or if no team name
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2" // Button styling
          >
            {creating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
                <span>Creating...</span> 
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Create</span> 
              </>
            )}
          </button>
          
          <button
            type="button" // Cancel button
            onClick={onCancel} // Triggers cancel handler
            disabled={creating} // Disables button during creation
            className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" // Button styling
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Team Card Component
// Displays a card for each team with details and actions
function TeamCard({ team, currentUser, onNavigate }) {
  // Configuration for different user roles
  const roleConfig = {
    admin: {
      badge: '👑 Admin', // Badge text for admin role
      badgeColor: 'bg-red-100 text-red-800', // Badge styling for admin
      description: 'You can manage this team' // Description for admin role
    },
    member: {
      badge: '👤 Member', // Badge text for member role
      badgeColor: 'bg-blue-100 text-blue-800', // Badge styling for member
      description: 'You are a team member' // Description for member role
    }
  };

  // Selects config based on user role, defaults to member
  const config = roleConfig[team.userRole] || roleConfig.member;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all hover:border-gray-300"> 
      <div className="flex items-center space-x-3 mb-3"> 
        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center"> 
          <span className="text-white font-bold text-sm"> 
            {team.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0"> 
          <h3 className="font-semibold text-gray-900 truncate">{team.name}</h3> 
          <p className="text-xs text-gray-500"> 
            Created {team.createdAt ? new Date(team.createdAt).toLocaleDateString() : 'Recently'}
          </p>
        </div>
      </div>
      
      <div className="mb-3"> 
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.badgeColor}`}>
          {config.badge}
        </span>
        <p className="text-xs text-gray-500 mt-1">{config.description}</p>
      </div>
      
      <div className="flex space-x-2"> 
        <button
          onClick={() => onNavigate(`/team/${team.teamId}`)} // Navigates to team management page
          className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" // Manage button styling
        >
          Manage
        </button>
        <button
          onClick={() => onNavigate(`/tasks/${team.teamId}`)} // Navigates to team tasks page
          className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2" // Tasks button styling
        >
          Tasks
        </button>
      </div>
    </div>
  );
}

// Empty Teams State Component
// Displays a message and action when no teams are available
function EmptyTeamsState({ onCreateTeam }) {
  return (
    <div className="text-center py-12"> 
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No teams yet</h3> 
      <p className="text-gray-600 mb-4">Create your first team to start managing tasks and collaborating.</p> 
      <button
        onClick={onCreateTeam} // Shows create team form
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" // Button styling
      >
        Create Your First Team
      </button>
    </div>
  );
}

// Quick Action Card Component
// Displays a clickable card for quick navigation actions
function QuickActionCard({ title, description, icon, onClick }) {
  return (
    <button
      onClick={onClick} // Triggers provided click handler
      className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" // Card styling
    >
      <div className="flex items-center space-x-3"> 
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"> 
          {icon} 
        </div>
        <div>
          <h4 className="font-medium text-gray-900">{title}</h4> 
          <p className="text-sm text-gray-600">{description}</p> 
        </div>
      </div>
    </button>
  );
}

// Icon Components
// Defines SVG icon for teams
function TeamsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /> 
    </svg>
  );
}

// Defines SVG icon for admin role
function AdminIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> 
    </svg>
  );
}

// Defines SVG icon for member role
function MemberIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> 
    </svg>
  );
}

// Defines SVG icon for recent teams
function RecentIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> 
    </svg>
  );
}

// Defines SVG icon for tasks
function TasksIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> 
    </svg>
  );
}

// Defines SVG icon for settings
function SettingsIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Exports the Dashboard component as the default export
export default Dashboard;