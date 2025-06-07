#  Task Management System - API Documentation

Complete GraphQL API documentation for the Task Management System, including schema definitions, query examples, authentication, and integration guidelines.

![GraphQL](https://img.shields.io/badge/GraphQL-API-purple)
![AWS AppSync](https://img.shields.io/badge/AWS-AppSync-orange)
![Authentication](https://img.shields.io/badge/Auth-Cognito-green)

##  Table of Contents

- [API Overview](#-api-overview)
- [Authentication](#-authentication)
- [Schema Definition](#-schema-definition)
- [Queries](#-queries)
- [Mutations](#️-mutations)
- [User Management](#-user-management)
- [Team Operations](#-team-operations)
- [Task Management](#-task-management)
- [Error Handling](#-error-handling)
- [Rate Limiting](#-rate-limiting)
- [Code Examples](#-code-examples)

##  API Overview

### Endpoint Information

| Property | Value |
|----------|-------|
| **GraphQL Endpoint** | `https://[api-id].appsync-api.[region].amazonaws.com/graphql` |
| **Authentication** | AWS Cognito User Pool (JWT) |
| **Protocol** | HTTPS |
| **Content Type** | `application/json` |
| **API Type** | GraphQL (Query, Mutation, Subscription) |

### API Architecture

```mermaid
graph LR
    CLIENT[Client Application] --> APPSYNC[AWS AppSync<br/>GraphQL API]
    APPSYNC --> AUTH[Cognito<br/>Authentication]
    APPSYNC --> RESOLVERS[GraphQL Resolvers]
    RESOLVERS --> LAMBDA[Lambda Functions]
    LAMBDA --> DYNAMODB[(DynamoDB<br/>Database)]
    LAMBDA --> SNS[SNS<br/>Notifications]
    
    classDef client fill:#e1f5fe
    classDef api fill:#f3e5f5
    classDef auth fill:#e8f5e8
    classDef compute fill:#fff3e0
    classDef data fill:#fff8e1
    classDef notification fill:#f1f8e9
    
    class CLIENT client
    class APPSYNC,RESOLVERS api
    class AUTH auth
    class LAMBDA compute
    class DYNAMODB data
    class SNS notification
```

##  Authentication

### Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant Cognito
    participant AppSync
    participant Lambda
    
    Client->>Cognito: Login Request
    Cognito-->>Client: JWT Access Token
    Client->>AppSync: GraphQL Request + JWT
    AppSync->>AppSync: Validate JWT
    AppSync->>Lambda: Invoke Resolver
    Lambda-->>AppSync: Response
    AppSync-->>Client: GraphQL Response
```

### JWT Token Structure

```json
{
  "header": {
    "alg": "RS256",
    "kid": "abc123..."
  },
  "payload": {
    "sub": "user-uuid-123",
    "email": "user@example.com",
    "cognito:groups": ["Admin"],
    "iat": 1640995200,
    "exp": 1641081600,
    "aud": "client-id-123",
    "iss": "https://cognito-idp.region.amazonaws.com/user-pool-id"
  }
}
```

### Authentication Headers

```http
POST /graphql HTTP/1.1
Host: your-api-id.appsync-api.region.amazonaws.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "query": "query { listTeams { teamId name } }"
}
```

### Authorization Levels

| Operation | Required Auth | Additional Requirements |
|-----------|---------------|------------------------|
| **listTeams** | JWT Token | User must be authenticated |
| **createTeam** | JWT Token | User must be authenticated |
| **addMember** | JWT Token | User must be team admin |
| **createTask** | JWT Token | User must be team admin |
| **updateTask** | JWT Token | User must be task assignee OR team admin |
| **listTasks** | JWT Token | User must be team member |
| **listMembers** | JWT Token | User must be team member |

## 📊 Schema Definition

### Complete GraphQL Schema

```graphql
# Root Types
type Query {
  listTeams: [Team]
  listTasks(teamId: ID!): [Task]
  listMembers(teamId: ID!): [Member]
  getUser(userId: ID!): User
}

type Mutation {
  createTeam(name: String!): Team
  addMember(teamId: ID!, email: String!): Member
  createTask(
    teamId: ID!
    title: String!
    description: String!
    assignedTo: ID
    deadline: String
  ): Task
  updateTask(teamId: ID!, taskId: ID!, status: String!): Task
}

# Object Types
type Team {
  teamId: ID!
  name: String!
  adminId: String!
  createdAt: String
}

type Task {
  teamId: ID!
  taskId: ID!
  title: String!
  description: String!
  assignedTo: String
  status: String!
  deadline: String
  createdBy: String
  createdAt: String
  updatedAt: String
  updatedBy: String
}

type Member {
  teamId: ID!
  userId: String!
  role: String!
  joinedAt: String
}

type User {
  userId: String!
  email: String
  name: String
}

# Enums
enum TaskStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
}

enum UserRole {
  ADMIN
  MEMBER
}

# Input Types (for future mutations)
input TaskInput {
  title: String!
  description: String!
  assignedTo: ID
  deadline: String
  priority: String
}

input TeamInput {
  name: String!
  description: String
}
```

## 🔍 Queries

### 1. List Teams

Retrieve all teams that the authenticated user is a member of.

**Query:**
```graphql
query ListTeams {
  listTeams {
    teamId
    name
    adminId
    createdAt
  }
}
```

**Response:**
```json
{
  "data": {
    "listTeams": [
      {
        "teamId": "team-uuid-123",
        "name": "Development Team",
        "adminId": "admin@example.com",
        "createdAt": "2024-01-15T10:30:00Z"
      },
      {
        "teamId": "team-uuid-456",
        "name": "Marketing Team",
        "adminId": "marketing@example.com",
        "createdAt": "2024-01-16T14:20:00Z"
      }
    ]
  }
}
```

**Authorization:** Requires JWT token. Returns only teams where the user is a member.

### 2. List Tasks

Retrieve all tasks for a specific team.

**Query:**
```graphql
query ListTasks($teamId: ID!) {
  listTasks(teamId: $teamId) {
    teamId
    taskId
    title
    description
    assignedTo
    status
    deadline
    createdBy
    createdAt
    updatedAt
  }
}
```

**Variables:**
```json
{
  "teamId": "team-uuid-123"
}
```

**Response:**
```json
{
  "data": {
    "listTasks": [
      {
        "teamId": "team-uuid-123",
        "taskId": "task-uuid-789",
        "title": "Implement user authentication",
        "description": "Add login/logout functionality using AWS Cognito",
        "assignedTo": "developer@example.com",
        "status": "In Progress",
        "deadline": "2024-02-01T00:00:00Z",
        "createdBy": "admin@example.com",
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-18T16:45:00Z"
      }
    ]
  }
}
```

**Authorization:** User must be a team member. Admin users see all tasks, regular members see only assigned tasks or unassigned tasks.

### 3. List Members

Retrieve all members of a specific team.

**Query:**
```graphql
query ListMembers($teamId: ID!) {
  listMembers(teamId: $teamId) {
    teamId
    userId
    role
    joinedAt
  }
}
```

**Variables:**
```json
{
  "teamId": "team-uuid-123"
}
```

**Response:**
```json
{
  "data": {
    "listMembers": [
      {
        "teamId": "team-uuid-123",
        "userId": "admin@example.com",
        "role": "admin",
        "joinedAt": "2024-01-15T10:30:00Z"
      },
      {
        "teamId": "team-uuid-123",
        "userId": "developer@example.com",
        "role": "member",
        "joinedAt": "2024-01-16T09:15:00Z"
      }
    ]
  }
}
```

### 4. Get User

Retrieve user information by user ID.

**Query:**
```graphql
query GetUser($userId: ID!) {
  getUser(userId: $userId) {
    userId
    email
    name
  }
}
```

**Variables:**
```json
{
  "userId": "user@example.com"
}
```

**Response:**
```json
{
  "data": {
    "getUser": {
      "userId": "user@example.com",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

## ✏️ Mutations

### 1. Create Team

Create a new team with the authenticated user as admin.

**Mutation:**
```graphql
mutation CreateTeam($name: String!) {
  createTeam(name: $name) {
    teamId
    name
    adminId
    createdAt
  }
}
```

**Variables:**
```json
{
  "name": "New Development Team"
}
```

**Response:**
```json
{
  "data": {
    "createTeam": {
      "teamId": "team-uuid-new",
      "name": "New Development Team",
      "adminId": "current-user@example.com",
      "createdAt": "2024-01-20T10:30:00Z"
    }
  }
}
```

**Side Effects:**
- Creates team record in database
- Automatically adds creator as team admin
- Creates membership record

### 2. Add Member

Add a new member to an existing team.

**Mutation:**
```graphql
mutation AddMember($teamId: ID!, $email: String!) {
  addMember(teamId: $teamId, email: $email) {
    teamId
    userId
    role
    joinedAt
  }
}
```

**Variables:**
```json
{
  "teamId": "team-uuid-123",
  "email": "newmember@example.com"
}
```

**Response:**
```json
{
  "data": {
    "addMember": {
      "teamId": "team-uuid-123",
      "userId": "newmember@example.com",
      "role": "member",
      "joinedAt": "2024-01-20T11:45:00Z"
    }
  }
}
```

**Authorization:** Only team admins can add members.

**Side Effects:**
- Creates membership record
- Sends email notification to new member
- Validates that user exists (by email)

### 3. Create Task

Create a new task within a team.

**Mutation:**
```graphql
mutation CreateTask(
  $teamId: ID!
  $title: String!
  $description: String!
  $assignedTo: ID
  $deadline: String
) {
  createTask(
    teamId: $teamId
    title: $title
    description: $description
    assignedTo: $assignedTo
    deadline: $deadline
  ) {
    taskId
    title
    description
    assignedTo
    status
    deadline
    createdAt
  }
}
```

**Variables:**
```json
{
  "teamId": "team-uuid-123",
  "title": "Design user interface mockups",
  "description": "Create wireframes and high-fidelity mockups for the dashboard",
  "assignedTo": "designer@example.com",
  "deadline": "2024-02-15T00:00:00Z"
}
```

**Response:**
```json
{
  "data": {
    "createTask": {
      "taskId": "task-uuid-new",
      "title": "Design user interface mockups",
      "description": "Create wireframes and high-fidelity mockups for the dashboard",
      "assignedTo": "designer@example.com",
      "status": "Not Started",
      "deadline": "2024-02-15T00:00:00Z",
      "createdAt": "2024-01-20T12:00:00Z"
    }
  }
}
```

**Authorization:** Only team admins can create tasks.

**Side Effects:**
- Creates task record with "Not Started" status
- Sends email notification if task is assigned
- Validates assignee is team member

### 4. Update Task

Update the status of an existing task.

**Mutation:**
```graphql
mutation UpdateTask($teamId: ID!, $taskId: ID!, $status: String!) {
  updateTask(teamId: $teamId, taskId: $taskId, status: $status) {
    taskId
    status
    updatedAt
    updatedBy
  }
}
```

**Variables:**
```json
{
  "teamId": "team-uuid-123",
  "taskId": "task-uuid-789",
  "status": "Completed"
}
```

**Response:**
```json
{
  "data": {
    "updateTask": {
      "taskId": "task-uuid-789",
      "status": "Completed",
      "updatedAt": "2024-01-20T15:30:00Z",
      "updatedBy": "developer@example.com"
    }
  }
}
```

**Authorization:** Task assignee OR team admin can update status.

**Valid Status Values:**
- `"Not Started"`
- `"In Progress"`
- `"Completed"`

## 👥 User Management

### User Data Model

```typescript
interface User {
  userId: string;        // Primary key (usually email)
  email: string;         // User's email address
  name?: string;         // Display name (optional)
  createdAt?: string;    // Account creation timestamp
  lastLogin?: string;    // Last login timestamp
}
```

### User Registration Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Cognito
    participant Lambda
    participant DynamoDB
    
    User->>Frontend: Sign Up
    Frontend->>Cognito: Create Account
    Cognito->>User: Email Verification
    User->>Cognito: Confirm Email
    Cognito->>Frontend: Account Confirmed
    Frontend->>Lambda: getUser Query
    Lambda->>DynamoDB: Check User Record
    DynamoDB-->>Lambda: User Not Found
    Lambda->>DynamoDB: Create User Record
    Lambda-->>Frontend: User Data
```

## 🏢 Team Operations

### Team Data Model

```typescript
interface Team {
  teamId: string;        // UUID primary key
  name: string;          // Team display name
  adminId: string;       // User ID of team administrator
  createdAt: string;     // ISO timestamp
  description?: string;  // Optional team description
}

interface Membership {
  teamId: string;        // Composite key part 1
  userId: string;        // Composite key part 2
  role: 'admin' | 'member';
  joinedAt: string;      // ISO timestamp
  addedBy?: string;      // User ID who added this member
}
```

### Team Permission Matrix

| Operation | Admin | Member | Notes |
|-----------|-------|--------|-------|
| **View Team** | ✅ | ✅ | All team members can view team info |
| **Edit Team** | ✅ | ❌ | Only admins can modify team settings |
| **Add Members** | ✅ | ❌ | Only admins can invite new members |
| **Remove Members** | ✅ | ❌ | Only admins can remove members |
| **Create Tasks** | ✅ | ❌ | Only admins can create new tasks |
| **View All Tasks** | ✅ | ❌ | Members see only assigned/unassigned |
| **Update Task Status** | ✅ | ✅* | *Members can only update assigned tasks |

## 📋 Task Management

### Task Data Model

```typescript
interface Task {
  teamId: string;        // Partition key
  taskId: string;        // Sort key (UUID)
  title: string;         // Task title
  description: string;   // Detailed description
  assignedTo?: string;   // User ID (optional)
  status: TaskStatus;    // Current status
  priority?: string;     // Priority level
  deadline?: string;     // ISO timestamp (optional)
  createdBy: string;     // Creator user ID
  createdAt: string;     // Creation timestamp
  updatedAt?: string;    // Last update timestamp
  updatedBy?: string;    // Last updater user ID
}

enum TaskStatus {
  NOT_STARTED = "Not Started",
  IN_PROGRESS = "In Progress", 
  COMPLETED = "Completed"
}
```

### Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> NotStarted: Task Created
    NotStarted --> InProgress: Start Work
    InProgress --> Completed: Finish Task
    InProgress --> NotStarted: Reset Task
    Completed --> InProgress: Reopen Task
    Completed --> [*]: Archive Task
    
    note right of NotStarted
        Default status when task is created
        Visible to assignee and admins
    end note
    
    note right of InProgress
        Task is actively being worked on
        Can be updated by assignee
    end note
    
    note right of Completed
        Task is finished
        Can be reopened if needed
    end note
```

## 🔔 Error Handling

### Error Response Format

```json
{
  "errors": [
    {
      "message": "Access denied: Only team admins can create tasks",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": ["createTask"],
      "extensions": {
        "code": "FORBIDDEN",
        "exception": {
          "stacktrace": ["Error: Access denied..."]
        }
      }
    }
  ],
  "data": null
}
```

### Common Error Codes

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| **UNAUTHENTICATED** | 401 | Missing or invalid JWT token | Refresh authentication |
| **FORBIDDEN** | 403 | User lacks required permissions | Check user role/membership |
| **NOT_FOUND** | 404 | Resource doesn't exist | Verify resource ID |
| **VALIDATION_ERROR** | 400 | Invalid input parameters | Check input format |
| **INTERNAL_ERROR** | 500 | Server-side error | Retry request or contact support |

### Error Handling Examples

#### Authentication Error
```json
{
  "errors": [
    {
      "message": "User is not authenticated",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

#### Permission Error
```json
{
  "errors": [
    {
      "message": "Only team admins can add members",
      "extensions": {
        "code": "FORBIDDEN",
        "field": "addMember"
      }
    }
  ]
}
```

#### Validation Error
```json
{
  "errors": [
    {
      "message": "Team name cannot be empty",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "field": "name"
      }
    }
  ]
}
```

## 📈 Rate Limiting

### Rate Limit Configuration

| Operation Type | Limit | Window | Burst |
|----------------|-------|--------|-------|
| **Queries** | 100 req/min | 1 minute | 20 |
| **Mutations** | 50 req/min | 1 minute | 10 |
| **Authentication** | 10 req/min | 1 minute | 3 |

### Rate Limit Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1642089600
X-RateLimit-Window: 60
```

### Rate Limit Exceeded Response

```json
{
  "errors": [
    {
      "message": "Rate limit exceeded. Too many requests.",
      "extensions": {
        "code": "RATE_LIMITED",
        "retryAfter": 45
      }
    }
  ]
}
```

## 💻 Code Examples

### JavaScript/React Example

```javascript
// GraphQL Client Setup
import { generateClient } from 'aws-amplify/api';

const client = generateClient();

// Create Team Example
async function createTeam(teamName) {
  try {
    const response = await client.graphql({
      query: `
        mutation CreateTeam($name: String!) {
          createTeam(name: $name) {
            teamId
            name
            adminId
            createdAt
          }
        }
      `,
      variables: { name: teamName },
      authMode: 'userPool'
    });
    
    return response.data.createTeam;
  } catch (error) {
    console.error('Create team error:', error);
    throw error;
  }
}

// List Tasks Example
async function fetchTasks(teamId) {
  try {
    const response = await client.graphql({
      query: `
        query ListTasks($teamId: ID!) {
          listTasks(teamId: $teamId) {
            taskId
            title
            status
            assignedTo
            deadline
          }
        }
      `,
      variables: { teamId },
      authMode: 'userPool'
    });
    
    return response.data.listTasks;
  } catch (error) {
    console.error('Fetch tasks error:', error);
    throw error;
  }
}

// Update Task Status Example
async function updateTaskStatus(teamId, taskId, status) {
  try {
    const response = await client.graphql({
      query: `
        mutation UpdateTask($teamId: ID!, $taskId: ID!, $status: String!) {
          updateTask(teamId: $teamId, taskId: $taskId, status: $status) {
            taskId
            status
            updatedAt
          }
        }
      `,
      variables: { teamId, taskId, status },
      authMode: 'userPool'
    });
    
    return response.data.updateTask;
  } catch (error) {
    console.error('Update task error:', error);
    throw error;
  }
}
```

### cURL Examples

#### List Teams
```bash
curl -X POST \
  https://your-api-id.appsync-api.region.amazonaws.com/graphql \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "query { listTeams { teamId name adminId createdAt } }"
  }'
```

#### Create Task
```bash
curl -X POST \
  https://your-api-id.appsync-api.region.amazonaws.com/graphql \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation CreateTask($teamId: ID!, $title: String!, $description: String!) { createTask(teamId: $teamId, title: $title, description: $description) { taskId title status } }",
    "variables": {
      "teamId": "team-uuid-123",
      "title": "New Task",
      "description": "Task description"
    }
  }'
```

### Python Example

```python
import requests
import json

class TaskManagementAPI:
    def __init__(self, endpoint, jwt_token):
        self.endpoint = endpoint
        self.headers = {
            'Authorization': f'Bearer {jwt_token}',
            'Content-Type': 'application/json'
        }
    
    def execute_query(self, query, variables=None):
        payload = {'query': query}
        if variables:
            payload['variables'] = variables
            
        response = requests.post(
            self.endpoint,
            headers=self.headers,
            json=payload
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f'Query failed: {response.status_code}')
    
    def list_teams(self):
        query = """
        query {
          listTeams {
            teamId
            name
            adminId
            createdAt
          }
        }
        """
        return self.execute_query(query)
    
    def create_task(self, team_id, title, description, assigned_to=None):
        query = """
        mutation CreateTask($teamId: ID!, $title: String!, $description: String!, $assignedTo: ID) {
          createTask(teamId: $teamId, title: $title, description: $description, assignedTo: $assignedTo) {
            taskId
            title
            status
            createdAt
          }
        }
        """
        variables = {
            'teamId': team_id,
            'title': title,
            'description': description
        }
        if assigned_to:
            variables['assignedTo'] = assigned_to
            
        return self.execute_query(query, variables)

# Usage Example
api = TaskManagementAPI('https://your-api.amazonaws.com/graphql', 'your-jwt-token')
teams = api.list_teams()
print(json.dumps(teams, indent=2))
```

---

🔙 [Back to Main Documentation](../../README.md)
