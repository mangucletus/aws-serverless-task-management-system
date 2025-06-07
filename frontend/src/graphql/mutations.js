// Import the gql template literal tag from graphql-tag library
// This allows us to write GraphQL queries and mutations as template literals
// with syntax highlighting and validation
import { gql } from 'graphql-tag';

// Defines a GraphQL mutation to create a new team
// This mutation accepts a required name parameter as a String
export const createTeam = gql`
  mutation CreateTeam($name: String!) { 
    # Call the createTeam resolver on the server
    # Pass the name variable as an argument
    createTeam(name: $name) {
      # Request these fields to be returned after successful team creation
      teamId        # Unique identifier for the newly created team
      name          # The name of the team that was created
      adminId       # User ID of the team administrator (creator)
      createdAt     # Timestamp when the team was created
      userRole      # Role of the current user in this team context
      isAdmin       # Boolean indicating if current user is admin of this team
    }
  }
`;

// Defines a GraphQL mutation to add a member to a team
// Requires both teamId (ID type) and email (String type) as parameters
export const addMember = gql`
  mutation AddMember($teamId: ID!, $email: String!) {
    # Call the addMember resolver on the server
    # Pass teamId and email as arguments to identify team and new member
    addMember(teamId: $teamId, email: $email) {
      # Request these fields to be returned after successful member addition
      teamId        # ID of the team the member was added to
      userId        # User ID of the newly added member
      role          # Role assigned to the new member (e.g., 'member', 'admin')
      joinedAt      # Timestamp when the member was added to the team
      addedBy       # User ID of who added this member (usually the admin)
    }
  }
`;

// Defines a GraphQL mutation to create a new task
// Takes multiple parameters: teamId and title are required, others are optional
export const createTask = gql`
  mutation CreateTask(
    $teamId: ID!           # Required: ID of the team this task belongs to
    $title: String!        # Required: Title/name of the task
    $description: String!  # Required: Detailed description of the task
    $assignedTo: ID        # Optional: User ID of person assigned to this task
    $deadline: String      # Optional: Deadline for task completion (ISO date string)
    $priority: String      # Optional: Priority level (e.g., 'low', 'medium', 'high')
  ) {
    # Call the createTask resolver on the server
    # Pass all the provided variables as arguments
    createTask(
      teamId: $teamId
      title: $title
      description: $description
      assignedTo: $assignedTo
      deadline: $deadline
      priority: $priority
    ) {
      # Request these fields to be returned after successful task creation
      teamId        # ID of the team this task belongs to
      taskId        # Unique identifier for the newly created task
      title         # Title of the task
      description   # Detailed description of the task
      assignedTo    # User ID of person assigned to this task (may be null)
      status        # Current status of the task (e.g., 'todo', 'in-progress', 'done')
      priority      # Priority level of the task
      deadline      # Deadline for task completion
      createdBy     # User ID of who created this task
      createdAt     # Timestamp when the task was created
      updatedAt     # Timestamp when the task was last updated
      updatedBy     # User ID of who last updated this task
    }
  }
`;

// Defines a GraphQL mutation to update the status of a task
// This is a focused mutation that only changes the task status
export const updateTask = gql`
  mutation UpdateTask($teamId: ID!, $taskId: ID!, $status: String!) {
    # Call the updateTask resolver on the server
    # Requires teamId and taskId to identify the specific task, and new status
    updateTask(teamId: $teamId, taskId: $taskId, status: $status) {
      # Request these fields to be returned after successful status update
      teamId        # ID of the team this task belongs to
      taskId        # ID of the task that was updated
      title         # Current title of the task
      description   # Current description of the task
      assignedTo    # Current assignee of the task
      status        # Updated status of the task
      priority      # Current priority of the task
      deadline      # Current deadline of the task
      updatedAt     # Timestamp when this update occurred
      updatedBy     # User ID of who performed this update
    }
  }
`;

// Defines a GraphQL mutation to update multiple details of a task
// This is a comprehensive mutation that can update various task properties
export const updateTaskDetails = gql`
  mutation UpdateTaskDetails(
    $teamId: ID!           # Required: ID of the team this task belongs to
    $taskId: ID!           # Required: ID of the specific task to update
    $title: String         # Optional: New title for the task
    $description: String   # Optional: New description for the task
    $assignedTo: ID        # Optional: New assignee's user ID
    $deadline: String      # Optional: New deadline (ISO date string)
    $priority: String      # Optional: New priority level
  ) {
    # Call the updateTaskDetails resolver on the server
    # Pass teamId and taskId to identify the task, plus any fields to update
    updateTaskDetails(
      teamId: $teamId
      taskId: $taskId
      title: $title
      description: $description
      assignedTo: $assignedTo
      deadline: $deadline
      priority: $priority
    ) {
      # Request these fields to be returned after successful task update
      teamId        # ID of the team this task belongs to
      taskId        # ID of the task that was updated
      title         # Updated title of the task
      description   # Updated description of the task
      assignedTo    # Updated assignee of the task
      status        # Current status of the task (unchanged by this mutation)
      priority      # Updated priority of the task
      deadline      # Updated deadline of the task
      updatedAt     # Timestamp when this update occurred
      updatedBy     # User ID of who performed this update
    }
  }
`;

// FIXED: Defines a GraphQL mutation to delete a task - now returns SimpleResponse
// This mutation permanently removes a task from the system
export const deleteTask = gql`
  mutation DeleteTask($teamId: ID!, $taskId: ID!) {
    # Call the deleteTask resolver on the server
    # Requires both teamId and taskId to identify the specific task to delete
    deleteTask(teamId: $teamId, taskId: $taskId) {
      # Request these fields from the SimpleResponse type
      # This is different from other mutations that return full task objects
      success       # Boolean indicating if the deletion was successful
      message       # Human-readable message about the deletion result
    }
  }
`;