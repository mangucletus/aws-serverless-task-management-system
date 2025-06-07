// Import the gql template literal tag from graphql-tag library
// This function parses GraphQL query strings into a format that can be used by GraphQL clients like Apollo
import { gql } from 'graphql-tag'; // Imports the gql function from graphql-tag to parse GraphQL queries into a format compatible with Apollo Client

// GraphQL query to retrieve a list of all teams that the current user has access to
// This query doesn't require any input parameters and returns team metadata including user permissions
export const listTeams = gql`
  query ListTeams {
    listTeams {
      teamId      # Unique identifier for the team
      name        # Display name of the team
      adminId     # User ID of the team administrator
      createdAt   # Timestamp when the team was created
      userRole    # Current user's role within this team (e.g., 'admin', 'member')
      isAdmin     # Boolean flag indicating if current user is an admin of this team
    }
  }
`;

// GraphQL query to retrieve all tasks that belong to a specific team
// Requires a teamId parameter to specify which team's tasks to fetch
// Returns detailed task information including metadata and assignment details
export const listTasks = gql`
  query ListTasks($teamId: ID!) {                    # Query definition with required teamId parameter of type ID
    listTasks(teamId: $teamId) {                     # Function call passing the teamId variable
      teamId        # ID of the team this task belongs to
      taskId        # Unique identifier for the task
      title         # Main title/name of the task
      description   # Detailed description of what the task involves
      assignedTo    # User ID of the person assigned to complete this task
      status        # Current status of the task (e.g., 'pending', 'in-progress', 'completed')
      priority      # Priority level of the task (e.g., 'low', 'medium', 'high', 'urgent')
      deadline      # Date/time when the task should be completed
      createdBy     # User ID of the person who created this task
      createdAt     # Timestamp when the task was originally created
      updatedAt     # Timestamp when the task was last modified
      updatedBy     # User ID of the person who last updated this task
    }
  }
`;

// GraphQL query to search for tasks within a specific team based on a search query
// This query performs a text search across task titles and descriptions
// Fixed: Parameter name changed from searchTerm to query to match backend expectation
export const searchTasks = gql`
  query SearchTasks($teamId: ID!, $query: String!) { # Query definition with required teamId and query parameters
    searchTasks(teamId: $teamId, query: $query) {     # Function call with both required parameters
      teamId        # ID of the team this task belongs to
      taskId        # Unique identifier for the task
      title         # Main title/name of the task (searchable field)
      description   # Detailed description of the task (searchable field)
      assignedTo    # User ID of the person assigned to complete this task
      status        # Current status of the task
      priority      # Priority level of the task
      deadline      # Date/time when the task should be completed
      createdBy     # User ID of the person who created this task
      createdAt     # Timestamp when the task was originally created
      updatedAt     # Timestamp when the task was last modified
      updatedBy     # User ID of the person who last updated this task
    }
  }
`;

// GraphQL query to retrieve all members of a specific team
// Returns membership information including roles and join dates
// Used for team management and displaying team roster
export const listMembers = gql`
  query ListMembers($teamId: ID!) {                  # Query definition with required teamId parameter
    listMembers(teamId: $teamId) {                   # Function call to get team members
      teamId      # ID of the team these members belong to
      userId      # Unique identifier of the team member
      role        # Role of the member within the team (e.g., 'admin', 'member', 'viewer')
      joinedAt    # Timestamp when this user joined the team
      addedBy     # User ID of the person who added this member to the team
    }
  }
`;

// GraphQL query to retrieve detailed information about a specific user
// Used for displaying user profiles, contact information, and user activity
// The userId parameter is optional - if not provided, returns current user's info
export const getUser = gql`
  query GetUser($userId: ID) {                       # Query definition with optional userId parameter
    getUser(userId: $userId) {                       # Function call to get user details
      userId      # Unique identifier for the user
      email       # Email address of the user (used for contact and authentication)
      name        # Display name or full name of the user
      createdAt   # Timestamp when the user account was created
      lastLogin   # Timestamp of the user's most recent login session
    }
  }
`;

// FIXED: GraphQL query to retrieve detailed information about a specific team
// This query validates team access and returns team metadata along with current user's permissions
// Used by wrapper components to verify user access before rendering team-specific pages
export const getTeam = gql`
  query GetTeam($teamId: ID!) {                      # Query definition with required teamId parameter
    getTeam(teamId: $teamId) {                       # Function call to get team details and validate access
      teamId      # Unique identifier for the team
      name        # Display name of the team
      adminId     # User ID of the team administrator/owner
      createdAt   # Timestamp when the team was created
      userRole    # Current user's role within this team (used for permission checks)
      isAdmin     # Boolean flag indicating if current user has admin privileges for this team
    }
  }
`;

// GraphQL query to retrieve all teams that the current user is a member of
// This query automatically filters teams based on the authenticated user's access
// Returns the same team information as getTeam but for all accessible teams
export const getUserTeams = gql`
  query GetUserTeams {                               # Query definition with no parameters (uses current user context)
    getUserTeams {                                   # Function call to get all teams for current user
      teamId      # Unique identifier for each team the user belongs to
      name        # Display name of each team
      adminId     # User ID of each team's administrator
      createdAt   # Timestamp when each team was created
      userRole    # Current user's role within each team
      isAdmin     # Boolean flag indicating if current user is admin of each team
    }
  }
`;