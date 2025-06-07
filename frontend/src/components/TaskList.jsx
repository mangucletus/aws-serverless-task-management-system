import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import { listTasks, searchTasks, listMembers } from '../graphql/queries';
import { updateTask, deleteTask } from '../graphql/mutations';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

const client = generateClient();

const statusColors = {
  'Not Started': 'bg-gray-100 text-gray-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  'Completed': 'bg-green-100 text-green-800'
};

const priorityColors = {
  'Low': 'bg-green-100 text-green-800',
  'Medium': 'bg-yellow-100 text-yellow-800',
  'High': 'bg-red-100 text-red-800'
};

function TaskList({ user }) {
  const { teamId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [userRole, setUserRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [deleting, setDeleting] = useState({});
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const [sortOrder, setSortOrder] = useState('desc');
  const [error, setError] = useState(null);
  const [teamExists, setTeamExists] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // FIXED: Enhanced validation for route parameters and user data
    if (!teamId || !user?.userId) {
      console.error('TaskList - Missing required data:', { 
        teamId, 
        userId: user?.userId,
        hasUser: !!user 
      });
      setTeamExists(false);
      setError('Invalid team or user information. Please refresh the page or go back to dashboard.');
      setLoading(false);
      return;
    }
    
    fetchUserRoleAndTasks();
  }, [teamId, user]);

  async function fetchUserRoleAndTasks() {
    try {
      setLoading(true);
      setError(null);
      setTeamExists(true);

      console.log('TaskList - Fetching data for user:', user?.userId, 'team:', teamId);
      console.log('TaskList - Full user object for debugging:', user);

      // First, try to get team members to verify team exists and get user role
      const membersResponse = await client.graphql({
        query: listMembers,
        variables: { teamId },
        authMode: 'userPool'
      });
      
      console.log('TaskList - Members response:', membersResponse);

      if (!membersResponse.data?.listMembers) {
        setTeamExists(false);
        setError('Team not found or you do not have access to this team.');
        return;
      }

      // FIXED: Enhanced user membership detection with comprehensive ID matching
      const currentUserMembership = membersResponse.data.listMembers.find(
        member => {
          const memberUserId = member.userId;
          
          // Create array of all possible user identifiers to check against
          const possibleUserIds = [
            user?.userId,           // Primary: normalized user ID from App.jsx
            user?.sub,              // Cognito sub (UUID)
            user?.username,         // Cognito username  
            user?.email,            // Email as fallback
            user?.signInDetails?.loginId,  // Login ID from sign-in
            user?.attributes?.email // Email from attributes
          ].filter(Boolean); // Remove undefined/null values
          
          const isMatch = possibleUserIds.some(possibleId => 
            possibleId === memberUserId
          );
          
          if (process.env.NODE_ENV === 'development') {
            console.log('TaskList - Checking member:', memberUserId, 'against user IDs:', possibleUserIds, 'match:', isMatch);
          }
          
          return isMatch;
        }
      );
      
      console.log('TaskList - Current user membership found:', !!currentUserMembership);
      console.log('TaskList - Membership details:', currentUserMembership);

      if (currentUserMembership) {
        setUserRole(currentUserMembership.role);
        console.log('TaskList - User role set to:', currentUserMembership.role);
      } else {
        console.log('TaskList - User not found in members list');
        console.log('TaskList - Available members:', membersResponse.data.listMembers.map(m => m.userId));
        console.log('TaskList - Current user identifiers:', {
          userId: user?.userId,
          sub: user?.sub,
          username: user?.username,
          email: user?.email,
          loginId: user?.signInDetails?.loginId
        });
        
        setTeamExists(false);
        setError('You are not a member of this team or access has been revoked.');
        return;
      }

      // Now fetch tasks
      await fetchTasks();
      
    } catch (err) {
      console.error('TaskList - Fetch user role and tasks error:', err);
      console.error('TaskList - Error details:', {
        message: err.message,
        errors: err.errors,
        stack: err.stack
      });
      
      let errorMessage = 'Failed to load team information. ';
      
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('TaskList - First GraphQL error:', firstError);
        
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

  async function fetchTasks() {
    try {
      console.log('TaskList - Fetching tasks for team:', teamId);
      
      const response = await client.graphql({
        query: listTasks,
        variables: { teamId },
        authMode: 'userPool'
      });
      
      console.log('TaskList - Tasks response:', response);
      
      if (response.data?.listTasks) {
        const tasksData = response.data.listTasks;
        console.log('TaskList - Tasks data received:', tasksData.length, 'tasks');
        setTasks(tasksData);
      } else {
        console.log('TaskList - No tasks data in response');
        setTasks([]);
      }
    } catch (err) {
      console.error('TaskList - Fetch tasks error:', err);
      
      let errorMessage = 'Failed to load tasks. ';
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        errorMessage += firstError.message || 'Please try again.';
      } else {
        errorMessage += err.message || 'Please try again.';
      }
      
      setError(errorMessage);
      setTasks([]);
    }
  }

  async function handleSearch() {
    if (!searchTerm.trim()) {
      fetchTasks();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('TaskList - Searching tasks with query:', searchTerm.trim());
      
      // Fixed: Use 'query' parameter instead of 'searchTerm' to match backend
      const response = await client.graphql({
        query: searchTasks,
        variables: { teamId, query: searchTerm.trim() },
        authMode: 'userPool'
      });
      
      console.log('TaskList - Search response:', response);
      setTasks(response.data.searchTasks || []);
    } catch (err) {
      console.error('TaskList - Search tasks error:', err);
      setError(`Search failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId, status) {
    try {
      setUpdating(prev => ({ ...prev, [taskId]: true }));
      setError(null);
      
      console.log('TaskList - Updating task status:', { teamId, taskId, status });
      
      await client.graphql({
        query: updateTask,
        variables: { teamId, taskId, status },
        authMode: 'userPool'
      });
      
      console.log('TaskList - Task status updated successfully');
      await fetchTasks(); // Refresh task list
    } catch (err) {
      console.error('TaskList - Update task error:', err);
      let errorMessage = 'Failed to update task: ';
      if (err.errors && err.errors.length > 0) {
        errorMessage += err.errors[0].message || 'Unknown error';
      } else {
        errorMessage += err.message || 'Unknown error';
      }
      setError(errorMessage);
    } finally {
      setUpdating(prev => ({ ...prev, [taskId]: false }));
    }
  }

  // FIXED: Updated delete handler to work with SimpleResponse type
  async function handleDeleteTask(taskId, taskTitle) {
    if (!window.confirm(`Are you sure you want to delete the task "${taskTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeleting(prev => ({ ...prev, [taskId]: true }));
      setError(null);
      
      console.log('TaskList - Deleting task:', { teamId, taskId });
      
      const response = await client.graphql({
        query: deleteTask,
        variables: { teamId, taskId },
        authMode: 'userPool'
      });
      
      console.log('TaskList - Delete task response:', response);
      
      // FIXED: Handle SimpleResponse type from backend
      if (response.data?.deleteTask?.success) {
        console.log('TaskList - Task deleted successfully');
        await fetchTasks(); // Refresh task list
        
        // Show success message if provided
        if (response.data.deleteTask.message) {
          setError(`Success: ${response.data.deleteTask.message}`);
          setTimeout(() => setError(null), 3000);
        }
      } else {
        throw new Error(response.data?.deleteTask?.message || 'Delete operation failed');
      }
      
    } catch (err) {
      console.error('TaskList - Delete task error:', err);
      let errorMessage = 'Failed to delete task: ';
      if (err.errors && err.errors.length > 0) {
        errorMessage += err.errors[0].message || 'Unknown error';
      } else {
        errorMessage += err.message || 'Unknown error';
      }
      setError(errorMessage);
    } finally {
      setDeleting(prev => ({ ...prev, [taskId]: false }));
    }
  }

  // FIXED: Enhanced task filtering and sorting with robust user ID matching
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      if (filter === 'my-tasks') {
        // FIXED: Check if task is assigned to current user using multiple possible IDs
        const possibleUserIds = [
          user?.userId,
          user?.sub,
          user?.username,
          user?.email,
          user?.signInDetails?.loginId,
          user?.attributes?.email
        ].filter(Boolean);
        
        const isAssignedToUser = possibleUserIds.some(id => id === task.assignedTo);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('TaskList - Checking if task', task.taskId, 'assigned to user. Task assignedTo:', task.assignedTo, 'User IDs:', possibleUserIds, 'Match:', isAssignedToUser);
        }
        
        return isAssignedToUser;
      }
      if (filter !== 'all') {
        return task.status === filter;
      }
      return true;
    });

    // Sort the filtered tasks
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'priority':
          const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
          comparison = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
          break;
        case 'deadline':
          const aDeadline = a.deadline ? new Date(a.deadline) : new Date('9999-12-31');
          const bDeadline = b.deadline ? new Date(b.deadline) : new Date('9999-12-31');
          comparison = aDeadline - bDeadline;
          break;
        case 'created':
        default:
          comparison = new Date(a.createdAt) - new Date(b.createdAt);
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [tasks, filter, sortBy, sortOrder, user]);

  // FIXED: Enhanced task counting with robust user ID matching
  const taskCounts = useMemo(() => {
    const possibleUserIds = [
      user?.userId,
      user?.sub,
      user?.username,
      user?.email,
      user?.signInDetails?.loginId,
      user?.attributes?.email
    ].filter(Boolean);
    
    const userTasks = tasks.filter(t => 
      possibleUserIds.some(id => id === t.assignedTo)
    );
    
    const overdueTasks = tasks.filter(t => 
      t.deadline && 
      new Date(t.deadline) < new Date() && 
      t.status !== 'Completed'
    );
    
    return {
      total: tasks.length,
      notStarted: tasks.filter(t => t.status === 'Not Started').length,
      inProgress: tasks.filter(t => t.status === 'In Progress').length,
      completed: tasks.filter(t => t.status === 'Completed').length,
      myTasks: userTasks.length,
      overdue: overdueTasks.length
    };
  }, [tasks, user]);

  function handleRetry() {
    setError(null);
    fetchUserRoleAndTasks();
  }

  if (loading && tasks.length === 0) {
    return <LoadingSpinner message="Loading tasks..." />;
  }

  // FIXED: Enhanced team not found component with better error messaging
  if (!teamExists) {
    return (
      <div className="max-w-6xl mx-auto">
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
          {/* Enhanced debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 mb-4 max-w-lg mx-auto p-3 bg-gray-100 rounded">
              <p><strong>Debug Info:</strong></p>
              <p>Team ID: {teamId || 'undefined'}</p>
              <p>User ID: {user?.userId || 'undefined'}</p>
              <p>User Sub: {user?.sub || 'undefined'}</p>
              <p>User Email: {user?.email || 'undefined'}</p>
              <p>Has User Object: {!!user ? 'Yes' : 'No'}</p>
              <p>Error: {error}</p>
            </div>
          )}
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

  return (
    <div className="max-w-6xl mx-auto"> 
      {/* Header */}
      <div className="flex justify-between items-center mb-8"> 
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <Link 
              to="/" 
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              Dashboard
            </Link>
            <span className="text-gray-400">/</span> 
            <span className="text-gray-900 text-sm font-medium">Tasks</span> 
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Team Tasks</h1> 
          <p className="text-gray-600 mt-1">
            {filteredAndSortedTasks.length} of {tasks.length} tasks shown
            {userRole === 'admin' && (
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full"> 
                👑 Admin
              </span>
            )}
          </p>
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 mt-1 p-2 bg-gray-100 rounded">
              <p><strong>Debug:</strong> Team ID = {teamId}, User ID = {user?.userId}, Role = {userRole}</p>
              <p>Total Tasks: {tasks.length}, My Tasks: {taskCounts.myTasks}</p>
            </div>
          )}
        </div>
        {userRole === 'admin' && (
          <Link
            to={`/create-task/${teamId}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Task</span> 
          </Link>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6"> 
          <ErrorMessage 
            message={error}
            onDismiss={() => setError(null)}
            type={error.includes('Success:') ? 'success' : 'error'}
          />
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8"> 
        <StatsCard
          title="Total"
          value={taskCounts.total}
          icon="📋"
          isActive={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <StatsCard
          title="My Tasks"
          value={taskCounts.myTasks}
          icon="👤"
          isActive={filter === 'my-tasks'}
          onClick={() => setFilter('my-tasks')}
        />
        <StatsCard
          title="Not Started"
          value={taskCounts.notStarted}
          icon="⚪"
          isActive={filter === 'Not Started'}
          onClick={() => setFilter('Not Started')}
        />
        <StatsCard
          title="In Progress"
          value={taskCounts.inProgress}
          icon="🔵"
          isActive={filter === 'In Progress'}
          onClick={() => setFilter('In Progress')}
        />
        <StatsCard
          title="Completed"
          value={taskCounts.completed}
          icon="✅"
          isActive={filter === 'Completed'}
          onClick={() => setFilter('Completed')}
        />
        <StatsCard
          title="Overdue"
          value={taskCounts.overdue}
          icon="⚠️"
          isActive={false}
          onClick={() => {}}
          danger={taskCounts.overdue > 0}
        />
      </div>

      {/* Search and Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6"> 
        <div className="p-6"> 
          <div className="flex flex-col md:flex-row gap-4 mb-4"> 
            <div className="flex-1"> 
              <div className="relative"> 
                <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search tasks by title, description, assignee, status, or priority..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex space-x-2"> 
              <button
                onClick={handleSearch}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button
                onClick={() => {
                  setSearchTerm('');
                  fetchTasks();
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4"> 
            <div className="flex items-center space-x-2"> 
              <label className="text-sm font-medium text-gray-700">Sort by:</label> 
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="created">Date Created</option> 
                <option value="title">Title</option> 
                <option value="status">Status</option> 
                <option value="priority">Priority</option> 
                <option value="deadline">Deadline</option> 
              </select>
            </div>
            
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span> 
              <svg className={`w-4 h-4 transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200"> 
        {filteredAndSortedTasks.length > 0 ? (
          <div className="divide-y divide-gray-200"> 
            {filteredAndSortedTasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                user={user}
                userRole={userRole}
                updating={updating[task.taskId]}
                deleting={deleting[task.taskId]}
                onUpdateStatus={updateTaskStatus}
                onDelete={handleDeleteTask}
              />
            ))}
          </div>
        ) : (
          <EmptyTasksState
            filter={filter}
            searchTerm={searchTerm}
            teamId={teamId}
            userRole={userRole}
            onClearFilter={() => setFilter('all')}
            onClearSearch={() => {
              setSearchTerm('');
              fetchTasks();
            }}
            hasError={!!error}
            onRetry={handleRetry}
          />
        )}
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, value, icon, isActive, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        isActive 
          ? 'border-blue-300 bg-blue-50' 
          : danger && value > 0
          ? 'border-red-200 bg-red-50 hover:border-red-300'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between"> 
        <div>
          <p className={`text-xs font-medium ${isActive ? 'text-blue-600' : danger && value > 0 ? 'text-red-600' : 'text-gray-600'}`}> 
            {title}
          </p>
          <p className={`text-lg font-bold ${isActive ? 'text-blue-900' : danger && value > 0 ? 'text-red-900' : 'text-gray-900'}`}> 
            {value}
          </p>
        </div>
        <span className="text-lg">{icon}</span> 
      </div>
    </button>
  );
}

// FIXED: Enhanced Task Card Component with better user identification
function TaskCard({ task, user, userRole, updating, deleting, onUpdateStatus, onDelete }) {
  // FIXED: Check if task is assigned to current user using multiple possible IDs
  const possibleUserIds = [
    user?.userId,
    user?.sub,
    user?.username,
    user?.email,
    user?.signInDetails?.loginId,
    user?.attributes?.email
  ].filter(Boolean);
  
  const isAssigned = possibleUserIds.some(id => id === task.assignedTo);
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'Completed';
  const canUpdateStatus = isAssigned || userRole === 'admin';
  const canDelete = userRole === 'admin';
  
  return (
    <div className={`p-6 hover:bg-gray-50 transition-colors ${isOverdue ? 'border-l-4 border-red-400' : ''}`}> 
      <div className="flex items-start justify-between"> 
        <div className="flex-1"> 
          <div className="flex items-center space-x-3 mb-2"> 
            <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3> 
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}> 
              {task.status}
            </span>
            {task.priority && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
                {task.priority}
              </span>
            )}
            {isOverdue && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"> 
                ⚠️ Overdue
              </span>
            )}
          </div>
          
          <p className="text-gray-600 mb-3 line-clamp-2">{task.description}</p> 
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500"> 
            <div className="flex items-center space-x-1"> 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>
                {task.assignedTo ? (
                  isAssigned ? (
                    <span className="font-medium text-blue-600">Assigned to you</span>
                  ) : (
                    `Assigned to: ${task.assignedTo}`
                  )
                ) : (
                  'Unassigned'
                )}
              </span>
            </div>
            
            {task.deadline && (
              <div className={`flex items-center space-x-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}> 
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>
                  Due: {new Date(task.deadline).toLocaleDateString()}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
            )}
            
            <div className="flex items-center space-x-1"> 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Created: {new Date(task.createdAt).toLocaleDateString()}</span> 
            </div>
            
            {task.createdBy && (
              <div className="flex items-center space-x-1"> 
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>By: {task.createdBy}</span> 
              </div>
            )}
          </div>
        </div>

        {/* Task Actions */}
        <div className="ml-4 flex flex-col space-y-2"> 
          {canUpdateStatus && (
            <div className="flex items-center space-x-2"> 
              <select
                value={task.status}
                onChange={(e) => onUpdateStatus(task.taskId, e.target.value)}
                disabled={updating || deleting}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
              {updating && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          )}
          
          {canDelete && (
            <div className="flex space-x-2"> 
              <button
                onClick={() => onDelete(task.taskId, task.title)}
                disabled={deleting}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Delete Task"
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Enhanced Empty Tasks State Component
function EmptyTasksState({ filter, searchTerm, teamId, userRole, onClearFilter, onClearSearch, hasError, onRetry }) {
  const getEmptyMessage = () => {
    if (hasError) {
      return {
        icon: '⚠️',
        title: 'Unable to load tasks',
        message: 'There was an issue loading tasks. Please try again.',
        actions: (
          <div className="flex justify-center space-x-3">
            <button
              onClick={onRetry}
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
        )
      };
    }

    if (searchTerm) {
      return {
        icon: '🔍',
        title: 'No tasks found',
        message: `No tasks match your search "${searchTerm}". Try different keywords or clear the search.`,
        actions: (
          <div className="flex justify-center space-x-3">
            <button
              onClick={onClearSearch}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Clear Search
            </button>
            {userRole === 'admin' && (
              <Link
                to={`/create-task/${teamId}`}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Create Task
              </Link>
            )}
          </div>
        )
      };
    }
    
    if (filter === 'my-tasks') {
      return {
        icon: '👤',
        title: 'No tasks assigned to you',
        message: 'You don\'t have any tasks assigned at the moment. Check back later or view all tasks.',
        actions: (
          <div className="flex justify-center space-x-3">
            <button
              onClick={onClearFilter}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              View All Tasks
            </button>
            {userRole === 'admin' && (
              <Link
                to={`/create-task/${teamId}`}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Create Task
              </Link>
            )}
          </div>
        )
      };
    }
    
    if (filter !== 'all') {
      return {
        icon: '📋',
        title: `No ${filter.toLowerCase()} tasks`,
        message: `There are no tasks with the status "${filter}". Try viewing all tasks or creating a new one.`,
        actions: (
          <div className="flex justify-center space-x-3">
            <button
              onClick={onClearFilter}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              View All Tasks
            </button>
            {userRole === 'admin' && (
              <Link
                to={`/create-task/${teamId}`}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Create Task
              </Link>
            )}
          </div>
        )
      };
    }
    
    return {
      icon: '📝',
      title: 'No tasks yet',
      message: userRole === 'admin' 
        ? 'Get started by creating your first task. Tasks help you organize work and track progress.' 
        : 'No tasks have been created for this team yet. Contact your team admin to get started.',
      actions: userRole === 'admin' ? (
        <div className="flex justify-center space-x-3">
          <Link
            to={`/create-task/${teamId}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Create Your First Task
          </Link>
          <Link
            to={`/team/${teamId}`}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Manage Team
          </Link>
        </div>
      ) : (
        <div className="flex justify-center">
          <Link
            to={`/team/${teamId}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View Team Details
          </Link>
        </div>
      )
    };
  };

  const { icon, title, message, actions } = getEmptyMessage();

  return (
    <div className="text-center py-12"> 
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
        <span className="text-3xl">{icon}</span> 
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3> 
      <p className="text-gray-600 mb-6 max-w-md mx-auto">{message}</p> 
      {actions}
      
      {/* Additional helpful tips */}
      {!hasError && !searchTerm && filter === 'all' && (
        <div className="mt-8 bg-blue-50 rounded-lg p-4 max-w-md mx-auto">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-left">
              <h4 className="text-sm font-medium text-blue-900 mb-1">
                {userRole === 'admin' ? 'Getting Started Tips' : 'About Tasks'}
              </h4>
              <ul className="text-sm text-blue-800 space-y-1">
                {userRole === 'admin' ? (
                  <>
                    <li>• Create tasks to organize your team's work</li>
                    <li>• Assign tasks to team members</li>
                    <li>• Set priorities and deadlines</li>
                    <li>• Track progress with status updates</li>
                  </>
                ) : (
                  <>
                    <li>• Tasks will appear here when created by admins</li>
                    <li>• You can update status of assigned tasks</li>
                    <li>• Use filters to find specific tasks</li>
                    <li>• Search to quickly locate tasks</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskList;