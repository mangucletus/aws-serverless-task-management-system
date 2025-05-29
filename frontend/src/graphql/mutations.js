import { gql } from 'graphql-tag';

export const createTeam = gql`
  mutation CreateTeam($name: String!) {
    createTeam(name: $name) {
      teamId
      name
    }
  }
`;

export const addMember = gql`
  mutation AddMember($teamId: ID!, $email: String!) {
    addMember(teamId: $teamId, email: $email) {
      teamId
      userId
    }
  }
`;

export const createTask = gql`
  mutation CreateTask($teamId: ID!, $title: String!, $description: String!, $assignedTo: ID, $deadline: String!) {
    createTask(teamId: $teamId, title: $title, description: $description, assignedTo: $assignedTo, deadline: $deadline) {
      taskId
      title
      description
      assignedTo
      status
      deadline
    }
  }
`;

export const updateTask = gql`
  mutation UpdateTask($teamId: ID!, $taskId: ID!, $status: String!) {
    updateTask(teamId: $teamId, taskId: $taskId, status: $status) {
      taskId
      status
    }
  }
`;