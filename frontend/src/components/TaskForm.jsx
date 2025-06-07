// Import React hooks for state management and lifecycle effects
import { useState, useEffect } from 'react';
// Import React Router hooks for URL parameters, navigation, and links
import { useParams, useNavigate, Link } from 'react-router-dom';
// Import AWS Amplify function to create GraphQL API client
import { generateClient } from 'aws-amplify/api';
// Import GraphQL mutations and queries for task and member operations
import { createTask } from '../graphql/mutations';
import { listMembers } from '../graphql/queries';
// Import reusable UI components
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

// Create a GraphQL client instance for making API calls
const client = generateClient();

// TaskForm component for creating new tasks within a team
// Only accessible to team administrators
function TaskForm({ user }) {
  // Extract teamId from URL parameters (e.g., /create-task/team123)
  const { teamId } = useParams();
  
  // State to store all form input data for the new task
  const [formData, setFormData] = useState({
    title: '',           // Task title (required)
    description: '',     // Task description (required)
    assignedTo: '',      // User ID of assigned team member (optional)
    deadline: '',        // Deadline date in YYYY-MM-DD format (optional)
    priority: 'Medium'   // Priority level: Low, Medium, or High (default: Medium)
  });
  
  // State to track if task creation is in progress
  const [creating, setCreating] = useState(false);
  // State to track if team members are being loaded
  const [loading, setLoading] = useState(true);
  // State to store list of team members for assignment dropdown
  const [members, setMembers] = useState([]);
  // State to store general error messages
  const [error, setError] = useState(null);
  // State to store field-specific validation errors
  const [validationErrors, setValidationErrors] = useState({});
  // State to track current user's role in the team (admin/member)
  const [userRole, setUserRole] = useState('member');
  // State to track if the team exists and user has access
  const [teamExists, setTeamExists] = useState(true);
  
  // React Router hook for programmatic navigation
  const navigate = useNavigate();

  // Effect hook to fetch team members when component mounts or dependencies change
  useEffect(() => {
    // Only proceed if we have valid teamId and user information
    if (teamId && user?.userId) {
      fetchTeamMembers();
    } else {
      // Handle missing required data
      console.error('TaskForm - Missing teamId or user.userId:', { teamId, userId: user?.userId });
      setError('Invalid team or user information. Please refresh the page.');
      setLoading(false);
    }
  }, [teamId, user]); // Re-run when teamId or user changes

  // Async function to fetch team members and validate user permissions
  async function fetchTeamMembers() {
    try {
      // Set loading state and clear any previous errors
      setLoading(true);
      setError(null);
      setTeamExists(true);

      // Log debugging information
      console.log('TaskForm - Fetching members for team:', teamId, 'user:', user?.userId);
      console.log('TaskForm - Full user object:', user);

      // Make GraphQL query to get team members list
      const response = await client.graphql({
        query: listMembers,     // GraphQL query to list team members
        variables: { teamId },  // Pass teamId as variable
        authMode: 'userPool'    // Use Cognito User Pool for authentication
      });

      // Log response for debugging
      console.log('TaskForm - Members response:', response);

      // Check if response contains expected data structure
      if (!response.data?.listMembers) {
        setTeamExists(false);
        setError('Team not found or you do not have access to this team.');
        return;
      }

      // Extract members list from response
      const membersList = response.data.listMembers;
      setMembers(membersList);

      // Log members data for debugging
      console.log('TaskForm - Members list:', membersList);
      console.log('TaskForm - Looking for user ID:', user?.userId);

      // FIXED: Find current user's role with robust user ID matching
      // Search for current user in the members list to determine their role
      const currentUserMembership = membersList.find(
        member => {
          const memberUserId = member.userId;
          
          // Try multiple possible user identifiers to ensure match
          // This handles different authentication flows and data structures
          const possibleUserIds = [
            user?.userId,                   // Primary: normalized user ID from App.jsx
            user?.sub,                      // Cognito sub
            user?.username,                 // Cognito username  
            user?.email,                    // Email as fallback
            user?.signInDetails?.loginId    // Login ID
          ].filter(Boolean); // Remove undefined/null values
          
          // Check if any of the possible user IDs match the member's userId
          const isMatch = possibleUserIds.some(possibleId => 
            possibleId === memberUserId
          );
          
          // Log matching attempt for debugging
          console.log('TaskForm - Checking member:', memberUserId, 'against user IDs:', possibleUserIds, 'match:', isMatch);
          
          return isMatch;
        }
      );

      console.log('TaskForm - Current user membership:', currentUserMembership);

      // Process user membership and role
      if (currentUserMembership) {
        // Set user's role in the team
        setUserRole(currentUserMembership.role);
        console.log('TaskForm - User role set to:', currentUserMembership.role);
        
        // Check if user is admin (only admins can create tasks)
        if (currentUserMembership.role !== 'admin') {
          setError('Only team administrators can create tasks.');
          setTeamExists(false);
          return;
        }
      } else {
        // User not found in team members
        console.log('TaskForm - User not found in members list');
        setTeamExists(false);
        setError('You are not a member of this team.');
        return;
      }

    } catch (err) {
      // Handle errors during API call
      console.error('TaskForm - Fetch members error:', err);
      
      // Start building user-friendly error message
      let errorMessage = 'Failed to load team information. ';
      
      // Parse GraphQL-specific errors
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('TaskForm - GraphQL error details:', firstError);
        
        // Handle different types of GraphQL errors
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
        // Handle general errors
        errorMessage += err.message;
      } else {
        // Fallback for unknown errors
        errorMessage += 'Please try refreshing the page.';
      }
      
      setError(errorMessage);
    } finally {
      // Always stop loading spinner when done
      setLoading(false);
    }
  }

  // Handler for form input changes
  const handleInputChange = (e) => {
    // Extract name and value from the input element
    const { name, value } = e.target;
    
    // Update form data with new value using functional state update
    setFormData(prev => ({
      ...prev,        // Spread existing form data
      [name]: value   // Update specific field
    }));
    
    // Clear validation error for the field when user starts typing
    // This provides immediate feedback when user corrects an error
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: null  // Clear error for this specific field
      }));
    }
  };

  // Function to validate all form fields before submission
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

    // Deadline validation (only if provided)
    if (formData.deadline) {
      const deadlineDate = new Date(formData.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
      
      // Check if deadline is in the past
      if (deadlineDate < today) {
        errors.deadline = 'Deadline cannot be in the past';
      }
    }

    // Assignment validation (only if someone is assigned)
    if (formData.assignedTo) {
      // Verify that assigned user is actually a team member
      const isValidMember = members.some(member => member.userId === formData.assignedTo);
      if (!isValidMember) {
        errors.assignedTo = 'Selected user is not a team member';
      }
    }

    return errors; // Return object with any validation errors
  };

  // Handler for form submission
  async function handleSubmit(e) {
    // Prevent default form submission behavior
    e.preventDefault();
    
    // Validate form inputs before proceeding
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      // Set validation errors and stop submission
      setValidationErrors(errors);
      setError('Please fix the validation errors above');
      return;
    }

    try {
      // Set creating state to show loading UI
      setCreating(true);
      // Clear any previous errors
      setError(null);
      setValidationErrors({});
      
      // Log task creation attempt for debugging
      console.log('TaskForm - Creating task with data:', formData);
      console.log('TaskForm - Current user:', user?.userId);
      
      // Prepare variables for the GraphQL mutation
      // Only include required fields initially
      const variables = {
        teamId,                           // Team where task will be created
        title: formData.title.trim(),     // Trimmed task title
        description: formData.description.trim(), // Trimmed description
        priority: formData.priority       // Priority level
      };

      // Add optional fields only if they have values
      // This prevents sending empty strings to the API
      if (formData.assignedTo) {
        variables.assignedTo = formData.assignedTo;
      }
      if (formData.deadline) {
        variables.deadline = formData.deadline;
      }

      console.log('TaskForm - Mutation variables:', variables);

      // Make GraphQL mutation to create the task
      const response = await client.graphql({
        query: createTask,        // GraphQL mutation for task creation
        variables,               // Task data variables
        authMode: 'userPool'     // Use Cognito User Pool for authentication
      });

      console.log('TaskForm - Create task response:', response);
      
      // Check if task was successfully created
      if (response.data?.createTask) {
        console.log('TaskForm - Task created successfully:', response.data.createTask);
        // Navigate back to the tasks list page for the team
        navigate(`/tasks/${teamId}`);
      } else {
        // Handle unexpected response structure
        throw new Error('Invalid response from server');
      }
      
    } catch (err) {
      // Handle errors during task creation
      console.error('TaskForm - Create task error:', err);
      
      // Start building user-friendly error message
      let errorMessage = 'Failed to create task. ';
      
      // Parse GraphQL-specific errors
      if (err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        console.error('TaskForm - GraphQL error details:', firstError);
        
        // Handle different types of creation errors
        if (firstError.errorType === 'ValidationError') {
          errorMessage = firstError.message; // Use exact validation message
        } else if (firstError.errorType === 'AuthorizationError') {
          errorMessage = 'You do not have permission to create tasks.';
        } else {
          errorMessage += firstError.message || 'Please try again.';
        }
      } else if (err.message) {
        // Handle general errors
        errorMessage += err.message;
      } else {
        // Fallback for unknown errors
        errorMessage += 'Please try again later.';
      }
      
      setError(errorMessage);
    } finally {
      // Always stop creating spinner when done
      setCreating(false);
    }
  }

  // Function to retry loading team members (used when there's an error)
  function handleRetry() {
    setError(null);    // Clear error message
    fetchTeamMembers(); // Attempt to fetch members again
  }

  // Show loading spinner while team information is being loaded
  if (loading) {
    return <LoadingSpinner message="Loading team information..." />;
  }

  // Show access denied screen if team doesn't exist or user lacks permissions
  if (!teamExists) {
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
          <p className="text-gray-600 mb-4">
            {error || 'You do not have permission to create tasks in this team.'}
          </p>
          {/* Debug info in development environment only */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 mb-4 max-w-md mx-auto">
              <p>Debug Info:</p>
              <p>Team ID: {teamId}</p>
              <p>User ID: {user?.userId}</p>
              <p>User Role: {userRole}</p>
            </div>
          )}
          {/* Action buttons */}
          <div className="flex justify-center space-x-3">
            {/* Retry button */}
            <button
              onClick={handleRetry}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Try Again
            </button>
            {/* Back to dashboard button */}
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

  // Render the main task creation form
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header section with breadcrumb navigation and title */}
      <div className="mb-8">
        {/* Breadcrumb navigation */}
        <div className="flex items-center space-x-2 mb-2">
          <Link 
            to="/" 
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>  {/* Breadcrumb separator */}
          <Link 
            to={`/tasks/${teamId}`}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Tasks
          </Link>
          <span className="text-gray-400">/</span> {/* Breadcrumb separator */}
          <span className="text-gray-900 text-sm font-medium">New Task</span> {/* Current page */}
        </div>
        {/* Page title */}
        <h1 className="text-3xl font-bold text-gray-900">Create New Task</h1>
        {/* Page description with admin badge */}
        <p className="text-gray-600 mt-2">
          Add a new task to your team's project
          {/* Show admin badge if user is admin */}
          {userRole === 'admin' && (
            <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
              👑 Admin
            </span>
          )}
        </p>
        {/* Debug info in development environment only */}
        {process.env.NODE_ENV === 'development' && (
          <p className="text-xs text-gray-400 mt-2">
            Debug: Team ID = {teamId}, User ID = {user?.userId}, Role = {userRole}
          </p>
        )}
      </div>

      {/* Error Message Section */}
      {error && (
        <div className="mb-6"> {/* Bottom margin for spacing */}
          <ErrorMessage 
            message={error}
            onDismiss={() => setError(null)} // Allow user to dismiss error
          />
          {/* Show retry button for loading errors */}
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

      {/* Main Form Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-6"> {/* Form with vertical spacing */}
          
          {/* Task Title Field */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Task Title * {/* Asterisk indicates required field */}
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter a clear and descriptive task title..."
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                validationErrors.title ? 'border-red-300' : 'border-gray-300' // Red border if validation error
              }`}
              disabled={creating} // Disable input while creating task
              maxLength={200}     // Enforce max length at HTML level
              required            // Make field required
            />
            {/* Validation error and character counter */}
            <div className="flex justify-between items-center mt-1">
              {/* Show validation error if present */}
              {validationErrors.title && (
                <p className="text-red-600 text-xs">{validationErrors.title}</p>
              )}
              {/* Character counter */}
              <p className="text-xs text-gray-500 ml-auto">
                {formData.title.length}/200
              </p>
            </div>
          </div>

          {/* Task Description Field */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description * {/* Asterisk indicates required field */}
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Provide detailed information about what needs to be done..."
              rows={4} // Set textarea height
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-vertical ${
                validationErrors.description ? 'border-red-300' : 'border-gray-300' // Red border if validation error
              }`}
              disabled={creating} // Disable input while creating task
              maxLength={1000}    // Enforce max length at HTML level
              required            // Make field required
            />
            {/* Validation error and character counter */}
            <div className="flex justify-between items-center mt-1">
              {/* Show validation error if present */}
              {validationErrors.description && (
                <p className="text-red-600 text-xs">{validationErrors.description}</p>
              )}
              {/* Character counter */}
              <p className="text-xs text-gray-500 ml-auto">
                {formData.description.length}/1000 
              </p>
            </div>
          </div>

          {/* Priority and Assignment Row - Responsive grid layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Priority Selection Field */}
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
                disabled={creating} // Disable select while creating task
              >
                {/* Priority options with emoji indicators */}
                <option value="Low">🟢 Low Priority</option> 
                <option value="Medium">🟡 Medium Priority</option> 
                <option value="High">🔴 High Priority</option> 
              </select>
              {/* Help text */}
              <p className="text-xs text-gray-500 mt-1">
                Choose the urgency level for this task
              </p>
            </div>

            {/* Assignment Selection Field */}
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
                  validationErrors.assignedTo ? 'border-red-300' : 'border-gray-300' // Red border if validation error
                }`}
                disabled={creating} // Disable select while creating task
              >
                {/* Default option */}
                <option value="">Select team member (optional)</option>
                {/* Map through team members to create options */}
                {members.map(member => (
                  <option key={member.userId} value={member.userId}> 
                    {member.userId} {member.role === 'admin' ? '(Admin)' : '(Member)'} 
                  </option>
                ))}
              </select>
            
              {/* Show validation error if present */}
              {validationErrors.assignedTo && (
                <p className="text-red-600 text-xs mt-1">{validationErrors.assignedTo}</p>
              )}
              {/* Help text */}
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to assign later
              </p>
            </div>
          </div>

          {/* Deadline Field */}
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium text-gray-700 mb-2">
              Deadline (Optional)
            </label>
            <div className="relative"> {/* Relative positioning for icon */}
              {/* Calendar icon */}
              <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {/* Date input field */}
              <input
                type="date"
                id="deadline"
                name="deadline"
                value={formData.deadline}
                onChange={handleInputChange}
                min={new Date().toISOString().split('T')[0]} // Prevent selecting past dates
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  validationErrors.deadline ? 'border-red-300' : 'border-gray-300' // Red border if validation error
                }`}
                disabled={creating} // Disable input while creating task
              />
            </div>
            {/* Show validation error if present */}
            {validationErrors.deadline && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.deadline}</p>
            )}
            {/* Help text */}
            <p className="text-xs text-gray-500 mt-1">
              Set a target completion date for this task
            </p>
          </div>

          {/* Form Actions Section */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200"> {/* Top border for visual separation */}
            {/* Submit button */}
            <button
              type="submit"
              disabled={creating || !formData.title.trim() || !formData.description.trim()} // Disable if creating or missing required fields
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {/* Conditional rendering based on creating state */}
              {creating ? (
                <>
                  {/* Loading spinner */}
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating Task...</span>
                </>
              ) : (
                <>
                  {/* Plus icon */}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create Task</span>
                </>
              )}
            </button>
            
            {/* Cancel button - navigate back to tasks list */}
            <Link
              to={`/tasks/${teamId}`}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              {/* X icon */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Cancel</span> 
            </Link>
          </div>
        </form>
      </div>

      {/* Help Section - Tips for creating effective tasks */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          {/* Info icon */}
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            {/* Help section title */}
            <h3 className="text-sm font-medium text-blue-900 mb-1">Tips for creating effective tasks</h3>
            {/* Help tips list */}
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

      {/* Team Members Summary Section - Only shown if there are members */}
      {members.length > 0 && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4"> 
          {/* Section title with member count */}
          <h4 className="text-sm font-medium text-gray-900 mb-3">Team Members ({members.length})</h4>
          {/* Responsive grid of team members */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {/* Map through members to display each one */}
            {members.map(member => (
              <div key={member.userId} className="flex items-center space-x-2 text-sm"> 
                {/* Member avatar with first letter */}
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-medium text-xs">
                    {member.userId.charAt(0).toUpperCase()} {/* First letter of user ID, uppercase */}
                  </span>
                </div>
                {/* Member name and role */}
                <span className="text-gray-700">
                  {member.userId} {/* Display user ID */}
                  {/* Show admin indicator if member is admin */}
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

// Export the TaskForm component as the default export
export default TaskForm;