import { gql } from 'graphql-tag'; // Imports the gql function from graphql-tag to parse GraphQL queries into a format compatible with Apollo Client

// Defines a GraphQL query to list all teams
export const listTeams = gql`
  query ListTeams {
    listTeams {
      teamId
      name
      adminId
      createdAt
      userRole
    }
  }
`;

// Defines a GraphQL query to list tasks for a specific team
export const listTasks = gql`
  query ListTasks($teamId: ID!) {
    listTasks(teamId: $teamId) {
      teamId
      taskId
      title
      description
      assignedTo
      status
      priority
      deadline
      createdBy
      createdAt
      updatedAt
      updatedBy
    }
  }
`;

// Fixed: Defines a GraphQL query to search tasks within a specific team
// Changed parameter name from searchTerm to query to match backend expectation
export const searchTasks = gql`
  query SearchTasks($teamId: ID!, $query: String!) {
    searchTasks(teamId: $teamId, query: $query) {
      teamId
      taskId
      title
      description
      assignedTo
      status
      priority
      deadline
      createdBy
      createdAt
      updatedAt
      updatedBy
    }
  }
`;

// Defines a GraphQL query to list members of a specific team
export const listMembers = gql`
  query ListMembers($teamId: ID!) {
    listMembers(teamId: $teamId) {
      teamId
      userId
      role
      joinedAt
      addedBy
    }
  }
`;

// Defines a GraphQL query to retrieve details for a specific user
export const getUser = gql`
  query GetUser($userId: ID!) {
    getUser(userId: $userId) {
      userId
      email
      name
      createdAt
      lastLogin
    }
  }
`;