import { gql } from 'graphql-tag';

// Defines a GraphQL mutation to create a new team
export const createTeam = gql`
  mutation CreateTeam($name: String!) { 
    createTeam(name: $name) {
      teamId
      name
      adminId
      createdAt
      userRole
    }
  }
`;

// Defines a GraphQL mutation to add a member to a team
export const addMember = gql`
  mutation AddMember($teamId: ID!, $email: String!) {
    addMember(teamId: $teamId, email: $email) {
      teamId
      userId
      role
      joinedAt
      addedBy
    }
  }
`;

// Defines a GraphQL mutation to create a new task
export const createTask = gql`
  mutation CreateTask(
    $teamId: ID!
    $title: String!
    $description: String!
    $assignedTo: ID
    $deadline: String
    $priority: String
  ) {
    createTask(
      teamId: $teamId
      title: $title
      description: $description
      assignedTo: $assignedTo
      deadline: $deadline
      priority: $priority
    ) {
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
    }
  }
`;

// Defines a GraphQL mutation to update the status of a task
export const updateTask = gql`
  mutation UpdateTask($teamId: ID!, $taskId: ID!, $status: String!) {
    updateTask(teamId: $teamId, taskId: $taskId, status: $status) {
      teamId
      taskId
      title
      description
      assignedTo
      status
      priority
      deadline
      updatedAt
      updatedBy
    }
  }
`;

// Defines a GraphQL mutation to update multiple details of a task
export const updateTaskDetails = gql`
  mutation UpdateTaskDetails(
    $teamId: ID!
    $taskId: ID!
    $title: String
    $description: String
    $assignedTo: ID
    $deadline: String
    $priority: String
  ) {
    updateTaskDetails(
      teamId: $teamId
      taskId: $taskId
      title: $title
      description: $description
      assignedTo: $assignedTo
      deadline: $deadline
      priority: $priority
    ) {
      teamId
      taskId
      title
      description
      assignedTo
      status
      priority
      deadline
      updatedAt
      updatedBy
    }
  }
`;

// Defines a GraphQL mutation to delete a task
export const deleteTask = gql`
  mutation DeleteTask($teamId: ID!, $taskId: ID!) {
    deleteTask(teamId: $teamId, taskId: $taskId)
  }
`;
