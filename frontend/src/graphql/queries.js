import gql from 'graphql-tag';

export const listTeams = gql`
  query ListTeams {
    listTeams {
      teamId
      name
      adminId
    }
  }
`;

export const listTasks = gql`
  query ListTasks($teamId: ID!) {
    listTasks(teamId: $teamId) {
      teamId
      taskId
      title
      description
      assignedTo
      status
      deadline
    }
  }
`;

export const listMembers = gql`
  query ListMembers($teamId: ID!) {
    listMembers(teamId: $teamId) {
      teamId
      userId
      role
    }
  }
`;