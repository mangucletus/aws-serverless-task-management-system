import { useState, useEffect } from 'react'; // Imports React hooks: useState for state management, useEffect for side effects
import { useParams, useNavigate, Link } from 'react-router-dom'; // Imports React Router hooks and components: useParams for URL parameters, useNavigate for navigation, Link for navigation links
import { generateClient } from 'aws-amplify/api'; // Imports function to create an AWS Amplify GraphQL client
import { createTask } from '../graphql/mutations'; // Imports GraphQL mutation for creating a new task
import { listMembers } from '../graphql/queries'; // Imports GraphQL query for listing team members
import LoadingSpinner from './LoadingSpinner'; // Imports LoadingSpinner component for loading states
import ErrorMessage from './ErrorMessage'; // Imports ErrorMessage component for displaying errors

// Initializes the AWS Amplify GraphQL client for making API requests
const client = generateClient();

// Defines the TaskForm component, accepting user (user data object) as a prop
function TaskForm({ user }) {
  // Extracts teamId from URL parameters using useParams hook
  const { teamId } = useParams();
  // State to store form input data, initialized with default values
  const [formData, setFormData] = useState({
    title: '', // Task title
    description: '', // Task description
    assignedTo: '', // ID of assigned team member
    deadline: '', // Task deadline date
    priority: 'Medium' // Default priority level
  });
  // State to track whether a task creation operation is in progress
  const [creating, setCreating] = useState(false);
  // State to track loading status while fetching team members
  const [loading, setLoading] = useState(true);
  // State to store the list of team members
  const [members, setMembers] = useState([]);
  // State to store general error messages
  const [error, setError] = useState(null);
  // State to store field-specific validation errors
  const [validationErrors, setValidationErrors] = useState({});
  // Hook to navigate programmatically to different routes
  const navigate = useNavigate();

  // Effect to fetch team members when teamId changes
  useEffect(() => {
    if (teamId) {
      fetchTeamMembers(); // Calls function to fetch team members
    }
  }, [teamId]); // Dependency array ensures effect runs when teamId changes

  // Async function to fetch team members from the GraphQL API
  async function fetchTeamMembers() {
    try {
      setLoading(true); // Sets loading state to true
      const response = await client.graphql({
        query: listMembers, // Uses the listMembers GraphQL query
        variables: { teamId }, // Passes teamId as a variable
        authMode: 'userPool' // Specifies Cognito User Pool authentication
      });
      setMembers(response.data.listMembers || []); // Sets members state, defaulting to empty array if no data
    } catch (err) {
      console.error('Fetch members error:', err); // Logs any errors
      setError(`Failed to load team members: ${err.message || 'Unknown error'}`); // Sets error message
    } finally {
      setLoading(false); // Sets loading state to false
    }
  }

  // Function to handle changes in form input fields
  const handleInputChange = (e) => {
    const { name, value } = e.target; // Extracts name and value from input event
    setFormData(prev => ({
      ...prev,
      [name]: value // Updates the specific form field with the new value
    }));
    
    // Clears validation error for the field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: null // Removes validation error for the field
      }));
    }
  };

  // Function to validate form inputs
  const validateForm = () => {
    const errors = {}; // Object to store validation errors

    // Title validation
    if (!formData.title.trim()) {
      errors.title = 'Task title is required'; // Error if title is empty
    } else if (formData.title.trim().length > 200) {
      errors.title = 'Task title cannot exceed 200 characters'; // Error if title exceeds 200 characters
    }

    // Description validation
    if (!formData.description.trim()) {
      errors.description = 'Task description is required'; // Error if description is empty
    } else if (formData.description.trim().length > 1000) {
      errors.description = 'Task description cannot exceed 1000 characters'; // Error if description exceeds 1000 characters
    }

    // Deadline validation
    if (formData.deadline) {
      const deadlineDate = new Date(formData.deadline); // Converts deadline to Date object
      const today = new Date(); // Gets current date
      today.setHours(0, 0, 0, 0); // Resets time to midnight for comparison
      
      if (deadlineDate < today) {
        errors.deadline = 'Deadline cannot be in the past'; // Error if deadline is before today
      }
    }

    // Assignment validation
    if (formData.assignedTo) {
      const isValidMember = members.some(member => member.userId === formData.assignedTo); // Checks if assigned user is a team member
      if (!isValidMember) {
        errors.assignedTo = 'Selected user is not a team member'; // Error if assigned user is invalid
      }
    }

    return errors; // Returns validation errors object
  };

  // Async function to handle form submission
  async function handleSubmit(e) {
    e.preventDefault(); // Prevents default form submission behavior
    
    // Validates form inputs
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors); // Sets validation errors state
      setError('Please fix the validation errors above'); // Sets general error message
      return; // Stops submission if there are errors
    }

    try {
      setCreating(true); // Sets creating state to true
      setError(null); // Clears any previous errors
      setValidationErrors({}); // Clears any previous validation errors
      
      console.log('Creating task with data:', formData); // Logs form data for debugging
      
      // Prepares variables for the GraphQL mutation
      const variables = {
        teamId, // Team ID from URL parameters
        title: formData.title.trim(), // Trimmed task title
        description: formData.description.trim(), // Trimmed task description
        priority: formData.priority // Task priority
      };

      // Adds optional fields only if they have values
      if (formData.assignedTo) {
        variables.assignedTo = formData.assignedTo; // Adds assignedTo if specified
      }
      if (formData.deadline) {
        variables.deadline = formData.deadline; // Adds deadline if specified
      }

      // Executes the createTask mutation
      const response = await client.graphql({
        query: createTask, // Uses the createTask GraphQL mutation
        variables, // Passes prepared variables
        authMode: 'userPool' // Specifies Cognito User Pool authentication
      });

      console.log('Create task response:', response); // Logs response for debugging
      
      // Navigates back to the tasks list page for the team
      navigate(`/tasks/${teamId}`);
      
    } catch (err) {
      console.error('Create task error:', err); // Logs any errors
      
      // Extracts meaningful error message
      let errorMessage = 'Failed to create task. Please try again.'; // Default error message
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

  // Renders a loading spinner while team members are being fetched
  if (loading) {
    return <LoadingSpinner message="Loading team information..." />; // Displays loading spinner with message
  }

  // Renders the task creation form
  return (
    // Main container, centered with a maximum width
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        {/* Breadcrumb navigation */}
        <div className="flex items-center space-x-2 mb-2">
          {/* Link to dashboard */}
          <Link 
            to="/" 
            className="text-gray-500 hover:text-gray-700 text-sm font-medium" // Styling for breadcrumb link
          >
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>  
          {/* Link to tasks page for the team */}
          <Link 
            to={`/tasks/${teamId}`}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium" // Styling for breadcrumb link
          >
            Tasks
          </Link>
          <span className="text-gray-400">/</span> 
          {/* Current page indicator */}
          <span className="text-gray-900 text-sm font-medium">New Task</span>
        </div>
      {/* Page title and subtitle */}
        <h1 className="text-3xl font-bold text-gray-900">Create New Task</h1>
        <p className="text-gray-600 mt-2">Add a new task to your team's project</p>
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

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Task Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Task Title * 
            </label>
            <input
              type="text" // Text input
              id="title" // Input ID for accessibility
              name="title" // Input name for form data
              value={formData.title} // Binds input value to state
              onChange={handleInputChange} // Handles input changes
              placeholder="Enter a clear and descriptive task title..." // Placeholder text
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                validationErrors.title ? 'border-red-300' : 'border-gray-300' // Conditional border color based on validation
              }`} // Input styling
              disabled={creating} // Disables input during task creation
              maxLength={200} // Limits input to 200 characters
              required // Makes input required
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
              id="description" // Textarea ID for accessibility
              name="description" // Textarea name for form data
              value={formData.description} // Binds textarea value to state
              onChange={handleInputChange} // Handles textarea changes
              placeholder="Provide detailed information about what needs to be done..." // Placeholder text
              rows={4} // Sets textarea height to 4 rows
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-vertical ${
                validationErrors.description ? 'border-red-300' : 'border-gray-300' // Conditional border color based on validation
              }`} // Textarea styling
              disabled={creating} // Disables textarea during task creation
              maxLength={1000} // Limits input to 1000 characters
              required // Makes textarea required
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
                id="priority" // Select ID for accessibility
                name="priority" // Select name for form data
                value={formData.priority} // Binds select value to state
                onChange={handleInputChange} // Handles select changes
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors" // Select styling
                disabled={creating} // Disables select during task creation
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
                id="assignedTo" // Select ID for accessibility
                name="assignedTo" // Select name for form data
                value={formData.assignedTo} // Binds select value to state
                onChange={handleInputChange} // Handles select changes
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  validationErrors.assignedTo ? 'border-red-300' : 'border-gray-300' // Conditional border color based on validation
                }`} // Select styling
                disabled={creating} // Disables select during task creation
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
                type="date" // Date input
                id="deadline" // Input ID for accessibility
                name="deadline" // Input name for form data
                value={formData.deadline} // Binds input value to state
                onChange={handleInputChange} // Handles input changes
                min={new Date().toISOString().split('T')[0]} // Sets minimum date to today
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  validationErrors.deadline ? 'border-red-300' : 'border-gray-300' // Conditional border color based on validation
                }`} // Input styling
                disabled={creating} // Disables input during task creation
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
              type="submit" // Submit button
              disabled={creating || !formData.title.trim() || !formData.description.trim()} // Disables button during creation or if required fields are empty
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" // Button styling
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
              to={`/tasks/${teamId}`} // Navigates to tasks page
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" // Button styling
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

// Exports the TaskForm component as the default export
export default TaskForm;