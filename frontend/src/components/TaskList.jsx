import { useState, useEffect, useMemo } from 'react'; // Imports React hooks: useState for state management, useEffect for side effects, useMemo for memoized computations
import { useParams, useNavigate, Link } from 'react-router-dom'; // Imports React Router hooks and components: useParams for URL parameters, useNavigate for navigation, Link for routing
import { generateClient } from 'aws-amplify/api'; // Imports function to create an AWS Amplify GraphQL client
import { listTasks, searchTasks, listMembers } from '../graphql/queries'; // Imports GraphQL queries for listing tasks, searching tasks, and listing team members
import { updateTask, deleteTask } from '../graphql/mutations'; // Imports GraphQL mutations for updating and deleting tasks
import LoadingSpinner from './LoadingSpinner'; // Imports LoadingSpinner component for loading states
import ErrorMessage from './ErrorMessage'; // Imports ErrorMessage component for displaying errors

// Initializes the AWS Amplify GraphQL client for API requests
const client = generateClient();

// Defines color classes for task status badges
const statusColors = {
  'Not Started': 'bg-gray-100 text-gray-800', // Gray background and text for "Not Started" status
  'In Progress': 'bg-blue-100 text-blue-800', // Blue background and text for "In Progress" status
  'Completed': 'bg-green-100 text-green-800' // Green background and text for "Completed" status
};

// Defines color classes for task priority badges
const priorityColors = {
  'Low': 'bg-green-100 text-green-800', // Green background and text for "Low" priority
  'Medium': 'bg-yellow-100 text-yellow-800', // Yellow background and text for "Medium" priority
  'High': 'bg-red-100 text-red-800' // Red background and text for "High" priority
};

// Defines the TaskList component, accepting user (user data) as a prop
function TaskList({ user }) {
  // Extracts teamId from URL parameters
  const { teamId } = useParams();
  // State to store the list of tasks
  const [tasks, setTasks] = useState([]);
  // State to track the user's role in the team, defaults to 'member'
  const [userRole, setUserRole] = useState('member');
  // State to track loading status
  const [loading, setLoading] = useState(true);
  // State to track which tasks are being updated (object mapping taskId to boolean)
  const [updating, setUpdating] = useState({});
  // State to track which tasks are being deleted (object mapping taskId to boolean)
  const [deleting, setDeleting] = useState({});
  // State to manage task filter (e.g., 'all', 'my-tasks', or specific status)
  const [filter, setFilter] = useState('all');
  // State to store search term for task searching
  const [searchTerm, setSearchTerm] = useState('');
  // State to manage sorting criterion (e.g., 'created', 'title')
  const [sortBy, setSortBy] = useState('created');
  // State to manage sort order ('asc' or 'desc')
  const [sortOrder, setSortOrder] = useState('desc');
  // State to store error messages
  const [error, setError] = useState(null);
  // Hook for programmatic navigation
  const navigate = useNavigate();

  // Effect to fetch user role and tasks when teamId changes
  useEffect(() => {
    fetchUserRoleAndTasks(); // Calls function to fetch data
  }, [teamId]); // Dependency array ensures effect runs when teamId changes

  // Async function to fetch user's role and tasks
  async function fetchUserRoleAndTasks() {
    try {
      setLoading(true); // Sets loading state to true
      setError(null); // Clears any previous errors

      // Fetches team members to determine user's role
      const membersResponse = await client.graphql({
        query: listMembers, // Uses listMembers GraphQL query
        variables: { teamId }, // Passes teamId as variable
        authMode: 'userPool' // Uses Cognito User Pool authentication
      });
      
      // Finds the current user's membership record
      const currentUserMembership = membersResponse.data.listMembers.find(
        member => member.userId === user?.username || member.userId === user?.email // Matches by username or email
      );
      
      if (currentUserMembership) {
        setUserRole(currentUserMembership.role); // Sets user role (e.g., 'admin' or 'member')
      }

      // Fetches tasks for the team
      await fetchTasks();
      
    } catch (err) {
      console.error('Fetch user role and tasks error:', err); // Logs errors
      setError(`Failed to load tasks: ${err.message || 'Unknown error'}`); // Sets error message
    } finally {
      setLoading(false); // Sets loading state to false
    }
  }

  // Async function to fetch tasks for the team
  async function fetchTasks() {
    try {
      const response = await client.graphql({
        query: listTasks, // Uses listTasks GraphQL query
        variables: { teamId }, // Passes teamId as variable
        authMode: 'userPool' // Uses Cognito User Pool authentication
      });
      
      setTasks(response.data.listTasks || []); // Sets tasks state, defaulting to empty array if no data
    } catch (err) {
      console.error('Fetch tasks error:', err); // Logs errors
      throw err; // Rethrows error to be caught by caller
    }
  }

  // Async function to handle task search
  async function handleSearch() {
    if (!searchTerm.trim()) {
      fetchTasks(); // Fetches all tasks if search term is empty
      return;
    }

    try {
      setLoading(true); // Sets loading state to true
      setError(null); // Clears any previous errors
      
      const response = await client.graphql({
        query: searchTasks, // Uses searchTasks GraphQL query
        variables: { teamId, searchTerm: searchTerm.trim() }, // Passes teamId and trimmed search term
        authMode: 'userPool' // Uses Cognito User Pool authentication
      });
      
      setTasks(response.data.searchTasks || []); // Sets tasks state with search results
    } catch (err) {
      console.error('Search tasks error:', err); // Logs errors
      setError(`Search failed: ${err.message || 'Unknown error'}`); // Sets error message
    } finally {
      setLoading(false); // Sets loading state to false
    }
  }

  // Async function to update a task's status
  async function updateTaskStatus(taskId, status) {
    try {
      setUpdating(prev => ({ ...prev, [taskId]: true })); // Marks task as being updated
      setError(null); // Clears any previous errors
      
      await client.graphql({
        query: updateTask, // Uses updateTask GraphQL mutation
        variables: { teamId, taskId, status }, // Passes teamId, taskId, and new status
        authMode: 'userPool' // Uses Cognito User Pool authentication
      });
      
      await fetchTasks(); // Refreshes task list
    } catch (err) {
      console.error('Update task error:', err); // Logs errors
      setError(`Failed to update task: ${err.message || 'Unknown error'}`); // Sets error message
    } finally {
      setUpdating(prev => ({ ...prev, [taskId]: false })); // Clears updating state for task
    }
  }

  // Async function to handle task deletion
  async function handleDeleteTask(taskId, taskTitle) {
    // Confirms deletion with user
    if (!window.confirm(`Are you sure you want to delete the task "${taskTitle}"? This action cannot be undone.`)) {
      return; // Exits if user cancels
    }

    try {
      setDeleting(prev => ({ ...prev, [taskId]: true })); // Marks task as being deleted
      setError(null); // Clears any previous errors
      
      await client.graphql({
        query: deleteTask, // Uses deleteTask GraphQL mutation
        variables: { teamId, taskId }, // Passes teamId and taskId
        authMode: 'userPool' // Uses Cognito User Pool authentication
      });
      
      await fetchTasks(); // Refreshes task list
    } catch (err) {
      console.error('Delete task error:', err); // Logs errors
      setError(`Failed to delete task: ${err.message || 'Unknown error'}`); // Sets error message
    } finally {
      setDeleting(prev => ({ ...prev, [taskId]: false })); // Clears deleting state for task
    }
  }

  // Memoized computation for filtered and sorted tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      // Filters tasks based on selected filter
      if (filter === 'my-tasks') {
        return task.assignedTo === user?.username || task.assignedTo === user?.email; // Shows only tasks assigned to user
      }
      if (filter !== 'all') {
        return task.status === filter; // Shows tasks with matching status
      }
      return true; // Shows all tasks if filter is 'all'
    });

    // Sorts filtered tasks
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title); // Sorts alphabetically by title
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status); // Sorts alphabetically by status
          break;
        case 'priority':
          const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 }; // Defines priority order
          comparison = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2); // Sorts by priority
          break;
        case 'deadline':
          const aDeadline = a.deadline ? new Date(a.deadline) : new Date('9999-12-31'); // Uses far future date if no deadline
          const bDeadline = b.deadline ? new Date(b.deadline) : new Date('9999-12-31');
          comparison = aDeadline - bDeadline; // Sorts by deadline
          break;
        case 'created':
        default:
          comparison = new Date(a.createdAt) - new Date(b.createdAt); // Sorts by creation date
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison; // Reverses order if descending
    });

    return filtered; // Returns filtered and sorted tasks
  }, [tasks, filter, sortBy, sortOrder, user]); // Dependencies for memoization

  // Memoized computation for task statistics
  const taskCounts = useMemo(() => {
    return {
      total: tasks.length, // Total number of tasks
      notStarted: tasks.filter(t => t.status === 'Not Started').length, // Count of "Not Started" tasks
      inProgress: tasks.filter(t => t.status === 'In Progress').length, // Count of "In Progress" tasks
      completed: tasks.filter(t => t.status === 'Completed').length, // Count of "Completed" tasks
      myTasks: tasks.filter(t => t.assignedTo === user?.username || t.assignedTo === user?.email).length, // Count of tasks assigned to user
      overdue: tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'Completed').length // Count of overdue tasks
    };
  }, [tasks, user]); // Dependencies for memoization

  // Shows loading spinner if initial load and no tasks
  if (loading && tasks.length === 0) {
    return <LoadingSpinner message="Loading tasks..." />; // Displays loading spinner
  }

  // Renders the main task list UI
  return (
    <div className="max-w-6xl mx-auto"> 
      {/* Header */}
      <div className="flex justify-between items-center mb-8"> 
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <Link 
              to="/" // Links to Dashboard
              className="text-gray-500 hover:text-gray-700 text-sm font-medium" // Styling for link
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
        </div>
        {userRole === 'admin' && (
          <Link
            to={`/create-task/${teamId}`} // Links to task creation page
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" // Button styling
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
            message={error} // Passes error message
            onDismiss={() => setError(null)} // Clears error on dismiss
          />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8"> 
        <StatsCard
          title="Total" // Card title
          value={taskCounts.total} // Total task count
          icon="📋" // Clipboard emoji
          isActive={filter === 'all'} // Highlights if filter is 'all'
          onClick={() => setFilter('all')} // Sets filter to 'all'
        />
        <StatsCard
          title="My Tasks" // Card title
          value={taskCounts.myTasks} // User's task count
          icon="👤" // Person emoji
          isActive={filter === 'my-tasks'} // Highlights if filter is 'my-tasks'
          onClick={() => setFilter('my-tasks')} // Sets filter to 'my-tasks'
        />
        <StatsCard
          title="Not Started" // Card title
          value={taskCounts.notStarted} // Not Started task count
          icon="⚪" // White circle emoji
          isActive={filter === 'Not Started'} // Highlights if filter is 'Not Started'
          onClick={() => setFilter('Not Started')} // Sets filter to 'Not Started'
        />
        <StatsCard
          title="In Progress" // Card title
          value={taskCounts.inProgress} // In Progress task count
          icon="🔵" // Blue circle emoji
          isActive={filter === 'In Progress'} // Highlights if filter is 'In Progress'
          onClick={() => setFilter('In Progress')} // Sets filter to 'In Progress'
        />
        <StatsCard
          title="Completed" // Card title
          value={taskCounts.completed} // Completed task count
          icon="✅" // Checkmark emoji
          isActive={filter === 'Completed'} // Highlights if filter is 'Completed'
          onClick={() => setFilter('Completed')} // Sets filter to 'Completed'
        />
        <StatsCard
          title="Overdue" // Card title
          value={taskCounts.overdue} // Overdue task count
          icon="⚠️" // Warning emoji
          isActive={false} // Never highlighted as a filter
          onClick={() => {}} // No action
          danger={taskCounts.overdue > 0} // Highlights in red if overdue tasks exist
        />
      </div>

      {/* Search and Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6"> 
        <div className="p-6"> 
          {/* Search Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-4"> 
            <div className="flex-1"> 
              <div className="relative"> 
                <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text" // Text input for search
                  placeholder="Search tasks by title, description, assignee, status, or priority..." // Placeholder text
                  value={searchTerm} // Binds to searchTerm state
                  onChange={(e) => setSearchTerm(e.target.value)} // Updates search term
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()} // Triggers search on Enter key
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" // Input styling
                />
              </div>
            </div>
            <div className="flex space-x-2"> 
              <button
                onClick={handleSearch} // Triggers search
                disabled={loading} // Disables during loading
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors" // Search button styling
              >
                {loading ? 'Searching...' : 'Search'} 
              </button>
              <button
                onClick={() => {
                  setSearchTerm(''); // Clears search term
                  fetchTasks(); // Fetches all tasks
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors" // Clear button styling
              >
                Clear
              </button>
            </div>
          </div>

          {/* Sort Controls */}
          <div className="flex flex-wrap items-center gap-4"> 
            <div className="flex items-center space-x-2"> 
              <label className="text-sm font-medium text-gray-700">Sort by:</label> 
              <select
                value={sortBy} // Binds to sortBy state
                onChange={(e) => setSortBy(e.target.value)} // Updates sort criterion
                className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" // Select styling
              >
                <option value="created">Date Created</option> 
                <option value="title">Title</option> 
                <option value="status">Status</option> 
                <option value="priority">Priority</option> 
                <option value="deadline">Deadline</option> 
              </select>
            </div>
            
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} // Toggles sort order
              className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900" // Button styling
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
                key={task.taskId} // Unique key for each task
                task={task} // Task data
                user={user} // User data
                userRole={userRole} // User's role
                updating={updating[task.taskId]} // Updating state for task
                deleting={deleting[task.taskId]} // Deleting state for task
                onUpdateStatus={updateTaskStatus} // Status update handler
                onDelete={handleDeleteTask} // Delete handler
              />
            ))}
          </div>
        ) : (
          <EmptyTasksState
            filter={filter} // Current filter
            searchTerm={searchTerm} // Current search term
            teamId={teamId} // Team ID
            userRole={userRole} // User's role
            onClearFilter={() => setFilter('all')} // Clears filter
            onClearSearch={() => {
              setSearchTerm(''); // Clears search term
              fetchTasks(); // Fetches all tasks
            }} // Clears search
          />
        )}
      </div>
    </div>
  );
}

// Stats Card Component
// Displays a clickable card with task statistics
function StatsCard({ title, value, icon, isActive, onClick, danger = false }) {
  return (
    <button
      onClick={onClick} // Triggers click handler
      className={`p-4 rounded-lg border transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        isActive 
          ? 'border-blue-300 bg-blue-50' // Active styling
          : danger && value > 0
          ? 'border-red-200 bg-red-50 hover:border-red-300' // Danger styling for overdue tasks
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm' // Default styling
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

// Task Card Component
// Displays a single task with details and actions
function TaskCard({ task, user, userRole, updating, deleting, onUpdateStatus, onDelete }) {
  // Checks if task is assigned to the current user
  const isAssigned = task.assignedTo === user?.username || task.assignedTo === user?.email;
  // Checks if task is overdue
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'Completed';
  // Determines if user can update status (assigned or admin)
  const canUpdateStatus = isAssigned || userRole === 'admin';
  // Determines if user can delete task (admin only)
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
                    <span className="font-medium text-blue-600">Assigned to you</span> // Highlights if assigned to user
                  ) : (
                    `Assigned to: ${task.assignedTo}` // Shows assignee
                  )
                ) : (
                  'Unassigned' // Shows if no assignee
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
          {/* Status Update - Only for assigned users or admins */}
          {canUpdateStatus && (
            <div className="flex items-center space-x-2"> 
              <select
                value={task.status} // Binds to task status
                onChange={(e) => onUpdateStatus(task.taskId, e.target.value)} // Updates status
                disabled={updating || deleting} // Disables during actions
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100" // Dropdown styling
              >
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
              {updating && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div> // Spinner during update
              )}
            </div>
          )}
          
          {/* Admin Actions */}
          {canDelete && (
            <div className="flex space-x-2"> 
              <button
                onClick={() => onDelete(task.taskId, task.title)} // Triggers deletion
                disabled={deleting} // Disables during deletion
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" // Button styling
                title="Delete Task" // Tooltip
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div> // Spinner during deletion
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

// Empty Tasks State Component
// Displays a message when no tasks are available
function EmptyTasksState({ filter, searchTerm, teamId, userRole, onClearFilter, onClearSearch }) {
  // Function to generate empty state message based on context
  const getEmptyMessage = () => {
    if (searchTerm) {
      return {
        icon: '🔍', // Search emoji
        title: 'No tasks found', // Title
        message: `No tasks match your search "${searchTerm}". Try different keywords or clear the search.`, // Message
        action: (
          <button
            onClick={onClearSearch} // Clears search
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" // Button styling
          >
            Clear Search
          </button>
        )
      };
    }
    
    if (filter === 'my-tasks') {
      return {
        icon: '👤', // Person emoji
        title: 'No tasks assigned to you', // Title
        message: 'You don\'t have any tasks assigned at the moment.', // Message
        action: (
          <button
            onClick={onClearFilter} // Clears filter
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" // Button styling
          >
            View All Tasks
          </button>
        )
      };
    }
    
    if (filter !== 'all') {
      return {
        icon: '📋', // Clipboard emoji
        title: `No ${filter.toLowerCase()} tasks`, // Title
        message: `There are no tasks with the status "${filter}".`, // Message
        action: (
          <button
            onClick={onClearFilter} // Clears filter
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" // Button styling
          >
            View All Tasks
          </button>
        )
      };
    }
    
    return {
      icon: '📝', // Note emoji
      title: 'No tasks yet', // Title
      message: userRole === 'admin' 
        ? 'Create your first task to get started with project management.' // Admin message
        : 'No tasks have been created for this team yet.', // Member message
      action: userRole === 'admin' ? (
        <Link
          to={`/create-task/${teamId}`} // Links to task creation
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-block" // Button styling
        >
          Create Your First Task
        </Link>
      ) : null // No action for non-admins
    };
  };

  // Destructures empty state properties
  const { icon, title, message, action } = getEmptyMessage();

  return (
    <div className="text-center py-12"> 
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"> 
        <span className="text-3xl">{icon}</span> 
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3> 
      <p className="text-gray-600 mb-4 max-w-md mx-auto">{message}</p> 
      {action} 
    </div>
  );
}

// Exports the TaskList component as the default export
export default TaskList;