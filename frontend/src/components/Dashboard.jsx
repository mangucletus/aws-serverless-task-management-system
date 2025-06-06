import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import { listTeams } from '../graphql/queries';
import { createTeam } from '../graphql/mutations';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

const client = generateClient();

function Dashboard({ user }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalTeams: 0,
    adminTeams: 0,
    memberTeams: 0
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.userId) {
      console.log('Dashboard - User available, fetching teams:', user.userId);
      fetchTeams();
    } else {
      console.error('Dashboard - No user ID available:', user);
      setError('User authentication issue. Please refresh the page or sign out and back in.');
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (teams.length > 0) {
      const adminTeams = teams.filter(team => team.userRole === 'admin').length;
      const memberTeams = teams.filter(team => team.userRole === 'member').length;
      
      setStats({
        totalTeams: teams.length,
        adminTeams,
        memberTeams
      });
    } else {
      setStats({
        totalTeams: 0,
        adminTeams: 0,
        memberTeams: 0
      });
    }
  }, [teams]);

  async function fetchTeams() {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Dashboard - Fetching teams for user:', user?.userId);
      console.log('Dashboard - Full user object for debugging:', user);
      
      const response = await client.graphql({
        query: listTeams,
        authMode: 'userPool'
      });
      
      console.log('Dashboard - Teams response:', response);
      
      if (response.data && response.data.listTeams) {
        const teamsData = response.data.listTeams;
        console.log('Dashboard - Teams data received:', teamsData);
        setTeams(teamsData);
        
        if (teamsData.length === 0) {
          console.log('Dashboard - No teams found for user. This might be expected for new users.');
        }
      } else {
        console.log('Dashboard - No teams data in response structure');
        setTeams([]);
      }
      
    } catch (err) {
      console.error('Dashboard - Fetch teams error:', err);
      console.error('Dashboard - Error details:', {
        message: err.message,
        errors: err.errors,
        stack: err.stack
      });
      
      // Enhanced error handling with specific cases
      let errorMessage = 'Failed to load teams. ';
      
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('Dashboard - First GraphQL error:', firstError);
        
        if (firstError.errorType === 'AuthorizationError') {
          errorMessage += 'Authentication issue detected. Please try signing out and back in.';
        } else if (firstError.errorType === 'ValidationError') {
          errorMessage += firstError.message;
        } else if (firstError.errorType === 'NotFoundError') {
          errorMessage += 'No teams found. This is normal for new users.';
          setTeams([]); // Ensure teams is empty but don't show error for new users
          return; // Don't set error for this case
        } else {
          errorMessage += firstError.message || 'Unknown GraphQL error occurred.';
        }
      } else if (err.message) {
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
        errorMessage += 'Unknown error occurred. Please try refreshing the page.';
      }
      
      setError(errorMessage);
      setTeams([]); // Ensure teams is empty on error
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTeam(e) {
    e.preventDefault();
    
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    if (teamName.trim().length > 100) {
      setError('Team name cannot exceed 100 characters');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      
      console.log('Dashboard - Creating team with name:', teamName.trim());
      console.log('Dashboard - Current user for team creation:', user);
      
      const response = await client.graphql({
        query: createTeam,
        variables: { name: teamName.trim() },
        authMode: 'userPool'
      });
      
      console.log('Dashboard - Create team response:', response);
      
      if (response.data && response.data.createTeam) {
        const newTeam = response.data.createTeam;
        console.log('Dashboard - Team created successfully:', newTeam);
        
        setTeamName('');
        setShowCreateForm(false);
        
        // Add the new team to the local state immediately for better UX
        setTeams(prevTeams => [...prevTeams, newTeam]);
        
        // Show success message
        setError('Team created successfully! 🎉 You can now manage it below.');
        setTimeout(() => {
          setError(null);
        }, 4000);
        
        // Also refresh teams list to ensure consistency
        setTimeout(() => fetchTeams(), 1000);
      } else {
        throw new Error('Invalid response from server - no team data returned');
      }
      
    } catch (err) {
      console.error('Dashboard - Create team error:', err);
      console.error('Dashboard - Create team error details:', {
        message: err.message,
        errors: err.errors,
        stack: err.stack
      });
      
      let errorMessage = 'Failed to create team. ';
      
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('Dashboard - First create team error:', firstError);
        
        if (firstError.errorType === 'ValidationError') {
          errorMessage = firstError.message;
        } else if (firstError.errorType === 'AuthorizationError') {
          errorMessage += 'You do not have permission to create teams. Please check your account status.';
        } else {
          errorMessage += firstError.message || 'Unknown error from server.';
        }
      } else if (err.message) {
        if (err.message.includes('Cannot find module') || err.message.includes('Lambda')) {
          errorMessage += 'Server configuration issue. Please contact support.';
        } else if (err.message.includes('Network')) {
          errorMessage += 'Network issue. Please check your connection and try again.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Please try again later.';
      }
      
      setError(errorMessage);
    } finally {
      setCreating(false);
    }
  }

  function handleCancelCreate() {
    setShowCreateForm(false);
    setTeamName('');
    setError(null);
  }

  function handleRetryFetch() {
    setError(null);
    fetchTeams();
  }

  // FIXED: Smart team selection for quick actions
  function getTargetTeam(preferredRole = null) {
    if (teams.length === 0) return null;
    
    // If a preferred role is specified, try to find a team with that role
    if (preferredRole) {
      const roleTeam = teams.find(team => team.userRole === preferredRole);
      if (roleTeam) return roleTeam;
    }
    
    // Fallback to any team (prefer admin teams, then first available)
    const adminTeam = teams.find(team => team.userRole === 'admin');
    return adminTeam || teams[0];
  }

  // FIXED: Enhanced navigation handlers with proper team selection
  function handleRecentTeamsClick() {
    const targetTeam = getTargetTeam();
    if (targetTeam) {
      console.log('Dashboard - Navigating to recent/first team:', targetTeam.teamId);
      navigate(`/team/${targetTeam.teamId}`);
    } else {
      setError('No teams available. Please create a team first.');
    }
  }

  function handleAllTasksClick() {
    const targetTeam = getTargetTeam();
    if (targetTeam) {
      console.log('Dashboard - Navigating to tasks for team:', targetTeam.teamId);
      navigate(`/tasks/${targetTeam.teamId}`);
    } else {
      setError('No teams available. Please create a team first to view tasks.');
    }
  }

  function handleTeamManagementClick() {
    // Prefer admin teams for management, but allow any team
    const targetTeam = getTargetTeam('admin');
    if (targetTeam) {
      console.log('Dashboard - Navigating to team management:', targetTeam.teamId);
      navigate(`/team/${targetTeam.teamId}`);
    } else {
      setError('No teams available for management. Please create a team first.');
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading your teams..." />;
  }

  // FIXED: Better user display name handling with fallbacks
  const userDisplayName = user?.displayName || 
                         user?.email?.split('@')[0] || 
                         user?.username?.split('@')[0] ||
                         user?.signInDetails?.loginId?.split('@')[0] ||
                         'User';

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
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
            <p><strong>Debug Info:</strong></p>
            <p>User ID: {user?.userId || 'undefined'}</p>
            <p>Display Name Source: {user?.displayName ? 'displayName' : user?.email ? 'email' : user?.username ? 'username' : 'fallback'}</p>
            <p>Teams Count: {teams.length}</p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6"> 
          <ErrorMessage 
            message={error}
            onDismiss={() => setError(null)}
            type={error.includes('successfully') || error.includes('🎉') ? 'success' : 'error'}
          />
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"> 
        <StatsCard
          title="Total Teams"
          value={stats.totalTeams}
          icon={<TeamsIcon />}
          color="blue"
        />
        
        <StatsCard
          title="Teams as Admin"
          value={stats.adminTeams}
          icon={<AdminIcon />}
          color="green"
        />
        
        <StatsCard
          title="Teams as Member"
          value={stats.memberTeams}
          icon={<MemberIcon />}
          color="purple"
        />
      </div>

      {/* Teams Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200"> 
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center"> 
          <h2 className="text-xl font-semibold text-gray-900">Your Teams</h2> 
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
            teamName={teamName}
            setTeamName={setTeamName}
            onSubmit={handleCreateTeam}
            onCancel={handleCancelCreate}
            creating={creating}
          />
        )}

        {/* Teams List */}
        <div className="p-6"> 
          {teams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> 
              {teams.map((team) => (
                <TeamCard
                  key={team.teamId}
                  team={team}
                  currentUser={user}
                  onNavigate={navigate}
                />
              ))}
            </div>
          ) : (
            <EmptyTeamsState
              onCreateTeam={() => setShowCreateForm(true)}
              hasError={!!error && !error.includes('successfully')}
              onRetry={handleRetryFetch}
            />
          )}
        </div>
      </div>

      {/* FIXED: Quick Actions with proper team handling */}
      {teams.length > 0 && (
        <div className="mt-8"> 
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3> 
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> 
            <QuickActionCard
              title="Recent Teams"
              description="Access your recently active teams"
              icon={<RecentIcon />}
              onClick={handleRecentTeamsClick}
              disabled={teams.length === 0}
            />
            
            <QuickActionCard
              title="All Tasks"
              description="View tasks across all teams"
              icon={<TasksIcon />}
              onClick={handleAllTasksClick}
              disabled={teams.length === 0}
            />
            
            <QuickActionCard
              title="Team Management"
              description="Manage team settings and members"
              icon={<SettingsIcon />}
              onClick={handleTeamManagementClick}
              disabled={teams.length === 0}
            />
          </div>
          
          {/* Help text for quick actions */}
          <div className="mt-4 text-sm text-gray-500 text-center">
            {teams.length === 1 ? (
              `Quick actions will use your team: "${teams[0].name}"`
            ) : (
              `Quick actions will use ${teams.filter(t => t.userRole === 'admin').length > 0 ? 'your admin teams first, then ' : ''}the most appropriate team.`
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600'
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
function CreateTeamForm({ teamName, setTeamName, onSubmit, onCancel, creating }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200"> 
      <form onSubmit={onSubmit} className="space-y-4"> 
        <div>
          <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2"> 
            Team Name
          </label>
          <input
            type="text"
            id="teamName"
            placeholder="Enter team name (max 100 characters)..."
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={creating}
            maxLength={100}
            required
          />
          <p className="text-xs text-gray-500 mt-1"> 
            {teamName.length}/100 characters
          </p>
        </div>
        
        <div className="flex space-x-3"> 
          <button
            type="submit"
            disabled={creating || !teamName.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
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
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// FIXED: Team Card Component with better navigation and user handling
function TeamCard({ team, currentUser, onNavigate }) {
  const roleConfig = {
    admin: {
      badge: '👑 Admin',
      badgeColor: 'bg-red-100 text-red-800',
      description: 'You can manage this team'
    },
    member: {
      badge: '👤 Member',
      badgeColor: 'bg-blue-100 text-blue-800',
      description: 'You are a team member'
    }
  };

  const config = roleConfig[team.userRole] || roleConfig.member;

  const handleNavigate = (path) => {
    console.log('TeamCard - Navigating to:', path, 'for team:', team.teamId);
    onNavigate(path);
  };

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
          onClick={() => handleNavigate(`/team/${team.teamId}`)}
          className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Manage
        </button>
        <button
          onClick={() => handleNavigate(`/tasks/${team.teamId}`)}
          className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Tasks
        </button>
      </div>
    </div>
  );
}

// Enhanced Empty Teams State Component
function EmptyTeamsState({ onCreateTeam, hasError, onRetry }) {
  if (hasError) {
    return (
      <div className="text-center py-12"> 
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load teams</h3> 
        <p className="text-gray-600 mb-4">There was an issue loading your teams. Please try again.</p> 
        <div className="flex justify-center space-x-3">
          <button
            onClick={onRetry}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try Again
          </button>
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

  return (
    <div className="text-center py-12"> 
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No teams yet</h3> 
      <p className="text-gray-600 mb-4">Create your first team to start managing tasks and collaborating with others.</p> 
      <button
        onClick={onCreateTeam}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Create Your First Team
      </button>
    </div>
  );
}

// FIXED: Quick Action Card Component with disabled state
function QuickActionCard({ title, description, icon, onClick, disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`p-4 border border-gray-200 rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        disabled 
          ? 'opacity-50 cursor-not-allowed bg-gray-50' 
          : 'hover:border-gray-300 hover:shadow-sm bg-white'
      }`}
    >
      <div className="flex items-center space-x-3"> 
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          disabled ? 'bg-gray-200' : 'bg-gray-100'
        }`}> 
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
function TeamsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /> 
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> 
    </svg>
  );
}

function MemberIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> 
    </svg>
  );
}

function RecentIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> 
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> 
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /> 
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export default Dashboard;