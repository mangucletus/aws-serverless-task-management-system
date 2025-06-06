import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import { createTask } from '../graphql/mutations';
import { listMembers } from '../graphql/queries';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

const client = generateClient();

function TaskForm({ user }) {
  const { teamId } = useParams();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    deadline: '',
    priority: 'Medium'
  });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [userRole, setUserRole] = useState('member');
  const [teamExists, setTeamExists] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (teamId && user?.userId) {
      fetchTeamMembers();
    } else {
      console.error('TaskForm - Missing teamId or user.userId:', { teamId, userId: user?.userId });
      setError('Invalid team or user information. Please refresh the page.');
      setLoading(false);
    }
  }, [teamId, user]);

  async function fetchTeamMembers() {
    try {
      setLoading(true);
      setError(null);
      setTeamExists(true);

      console.log('TaskForm - Fetching members for team:', teamId, 'user:', user?.userId);
      console.log('TaskForm - Full user object:', user);

      const response = await client.graphql({
        query: listMembers,
        variables: { teamId },
        authMode: 'userPool'
      });

      console.log('TaskForm - Members response:', response);

      if (!response.data?.listMembers) {
        setTeamExists(false);
        setError('Team not found or you do not have access to this team.');
        return;
      }

      const membersList = response.data.listMembers;
      setMembers(membersList);

      console.log('TaskForm - Members list:', membersList);
      console.log('TaskForm - Looking for user ID:', user?.userId);

      // FIXED: Find current user's role with robust user ID matching
      const currentUserMembership = membersList.find(
        member => {
          const memberUserId = member.userId;
          
          // Try multiple possible user identifiers to ensure match
          const possibleUserIds = [
            user?.userId,           // Primary: normalized user ID from App.jsx
            user?.sub,              // Cognito sub
            user?.username,         // Cognito username  
            user?.email,            // Email as fallback
            user?.signInDetails?.loginId  // Login ID
          ].filter(Boolean); // Remove undefined/null values
          
          const isMatch = possibleUserIds.some(possibleId => 
            possibleId === memberUserId
          );
          
          console.log('TaskForm - Checking member:', memberUserId, 'against user IDs:', possibleUserIds, 'match:', isMatch);
          
          return isMatch;
        }
      );

      console.log('TaskForm - Current user membership:', currentUserMembership);

      if (currentUserMembership) {
        setUserRole(currentUserMembership.role);
        console.log('TaskForm - User role set to:', currentUserMembership.role);
        
        // Check if user is admin
        if (currentUserMembership.role !== 'admin') {
          setError('Only team administrators can create tasks.');
          setTeamExists(false);
          return;
        }
      } else {
        console.log('TaskForm - User not found in members list');
        setTeamExists(false);
        setError('You are not a member of this team.');
        return;
      }

    } catch (err) {
      console.error('TaskForm - Fetch members error:', err);
      
      let errorMessage = 'Failed to load team information. ';
      
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('TaskForm - GraphQL error details:', firstError);
        
        if (firstError.errorType === 'AuthorizationError') {
          errorMessage = 'You do not have permission to access this team.';
          setTeamExists(false);
        } else if (firstError.errorType === 'NotFoundError') {
          errorMessage = 'Team not found.';
          setTeamExists(false);
        } else {
          errorMessage += firstError.message || 'Please try again.';
        }
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Please try refreshing the page.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for the field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    // Title validation
    if (!formData.title.trim()) {
      errors.title = 'Task title is required';
    } else if (formData.title.trim().length > 200) {
      errors.title = 'Task title cannot exceed 200 characters';
    }

    // Description validation
    if (!formData.description.trim()) {
      errors.description = 'Task description is required';
    } else if (formData.description.trim().length > 1000) {
      errors.description = 'Task description cannot exceed 1000 characters';
    }

    // Deadline validation
    if (formData.deadline) {
      const deadlineDate = new Date(formData.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (deadlineDate < today) {
        errors.deadline = 'Deadline cannot be in the past';
      }
    }

    // Assignment validation
    if (formData.assignedTo) {
      const isValidMember = members.some(member => member.userId === formData.assignedTo);
      if (!isValidMember) {
        errors.assignedTo = 'Selected user is not a team member';
      }
    }

    return errors;
  };

  async function handleSubmit(e) {
    e.preventDefault();
    
    // Validate form inputs
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors above');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      setValidationErrors({});
      
      console.log('TaskForm - Creating task with data:', formData);
      console.log('TaskForm - Current user:', user?.userId);
      
      // Prepare variables for the GraphQL mutation
      const variables = {
        teamId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority
      };

      // Add optional fields only if they have values
      if (formData.assignedTo) {
        variables.assignedTo = formData.assignedTo;
      }
      if (formData.deadline) {
        variables.deadline = formData.deadline;
      }

      console.log('TaskForm - Mutation variables:', variables);

      const response = await client.graphql({
        query: createTask,
        variables,
        authMode: 'userPool'
      });

      console.log('TaskForm - Create task response:', response);
      
      if (response.data?.createTask) {
        console.log('TaskForm - Task created successfully:', response.data.createTask);
        // Navigate back to the tasks list page for the team
        navigate(`/tasks/${teamId}`);
      } else {
        throw new Error('Invalid response from server');
      }
      
    } catch (err) {
      console.error('TaskForm - Create task error:', err);
      
      let errorMessage = 'Failed to create task. ';
      
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('TaskForm - GraphQL error details:', firstError);
        
        if (firstError.errorType === 'ValidationError') {
          errorMessage = firstError.message;
        } else if (firstError.errorType === 'AuthorizationError') {
          errorMessage = 'You do not have permission to create tasks.';
        } else {
          errorMessage += firstError.message || 'Please try again.';
        }
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Please try again later.';
      }
      
      setError(errorMessage);
    } finally {
      setCreating(false);
    }
  }

  function handleRetry() {
    setError(null);
    fetchTeamMembers();
  }

  if (loading) {
    return <LoadingSpinner message="Loading team information..." />;
  }

  if (!teamExists) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600 mb-4">
            {error || 'You do not have permission to create tasks in this team.'}
          </p>
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 mb-4 max-w-md mx-auto">
              <p>Debug Info:</p>
              <p>Team ID: {teamId}</p>
              <p>User ID: {user?.userId}</p>
              <p>User Role: {userRole}</p>
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
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 mb-2">
          <Link 
            to="/" 
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>  
          <Link 
            to={`/tasks/${teamId}`}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Tasks
          </Link>
          <span className="text-gray-400">/</span> 
          <span className="text-gray-900 text-sm font-medium">New Task</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Create New Task</h1>
        <p className="text-gray-600 mt-2">
          Add a new task to your team's project
          {userRole === 'admin' && (
            <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
              👑 Admin
            </span>
          )}
        </p>
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <p className="text-xs text-gray-400 mt-2">
            Debug: Team ID = {teamId}, User ID = {user?.userId}, Role = {userRole}
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6"> 
          <ErrorMessage 
            message={error}
            onDismiss={() => setError(null)}
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

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Task Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Task Title * 
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter a clear and descriptive task title..."
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                validationErrors.title ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={creating}
              maxLength={200}
              required
            />
            <div className="flex justify-between items-center mt-1">
              {validationErrors.title && (
                <p className="text-red-600 text-xs">{validationErrors.title}</p>
              )}
              <p className="text-xs text-gray-500 ml-auto">
                {formData.title.length}/200
              </p>
            </div>
          </div>

          {/* Task Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description * 
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Provide detailed information about what needs to be done..."
              rows={4}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-vertical ${
                validationErrors.description ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={creating}
              maxLength={1000}
              required
            />
            <div className="flex justify-between items-center mt-1">
              {validationErrors.description && (
                <p className="text-red-600 text-xs">{validationErrors.description}</p>
              )}
              <p className="text-xs text-gray-500 ml-auto">
                {formData.description.length}/1000 
              </p>
            </div>
          </div>

          {/* Priority and Assignment Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                Priority Level
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                disabled={creating}
              >
                <option value="Low">🟢 Low Priority</option> 
                <option value="Medium">🟡 Medium Priority</option> 
                <option value="High">🔴 High Priority</option> 
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Choose the urgency level for this task
              </p>
            </div>

            {/* Assigned To */}
            <div>
              <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700 mb-2">
                Assign To
              </label>
              <select
                id="assignedTo"
                name="assignedTo"
                value={formData.assignedTo}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  validationErrors.assignedTo ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={creating}
              >
                <option value="">Select team member (optional)</option>
                {members.map(member => (
                  <option key={member.userId} value={member.userId}> 
                    {member.userId} {member.role === 'admin' ? '(Admin)' : '(Member)'} 
                  </option>
                ))}
              </select>
            
              {validationErrors.assignedTo && (
                <p className="text-red-600 text-xs mt-1">{validationErrors.assignedTo}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to assign later
              </p>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium text-gray-700 mb-2">
              Deadline (Optional)
            </label>
            <div className="relative">
              <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                id="deadline"
                name="deadline"
                value={formData.deadline}
                onChange={handleInputChange}
                min={new Date().toISOString().split('T')[0]}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  validationErrors.deadline ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={creating}
              />
            </div>
            {validationErrors.deadline && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.deadline}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Set a target completion date for this task
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={creating || !formData.title.trim() || !formData.description.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating Task...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create Task</span>
                </>
              )}
            </button>
            
            <Link
              to={`/tasks/${teamId}`}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Cancel</span> 
            </Link>
          </div>
        </form>
      </div>

      {/* Help Section */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-blue-900 mb-1">Tips for creating effective tasks</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Use clear, action-oriented titles (e.g., "Design login page mockup")</li>
              <li>• Include specific requirements and acceptance criteria in the description</li>
              <li>• Set realistic deadlines to maintain team productivity</li>
              <li>• Assign appropriate priority levels to help team members focus</li>
              <li>• Consider team member workloads when assigning tasks</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Team Members Summary */}
      {members.length > 0 && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4"> 
          <h4 className="text-sm font-medium text-gray-900 mb-3">Team Members ({members.length})</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {members.map(member => (
              <div key={member.userId} className="flex items-center space-x-2 text-sm"> 
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-medium text-xs">
                    {member.userId.charAt(0).toUpperCase()} 
                  </span>
                </div>
                <span className="text-gray-700">
                  {member.userId} 
                  {member.role === 'admin' && (
                    <span className="text-red-600 text-xs ml-1">(Admin)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskForm;