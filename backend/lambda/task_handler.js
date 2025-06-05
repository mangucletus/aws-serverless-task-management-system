// Task Management System Lambda Handler
// This AWS Lambda function serves as a GraphQL resolver handler for a task management system.
// Updated to use AWS SDK v3 for Node.js 18.x compatibility

// Import required AWS SDK v3 modules
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK v3
const dynamoDbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDbClient);

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Constants
const VALID_TASK_STATUSES = ['Not Started', 'In Progress', 'Completed'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High'];
const VALID_ROLES = ['admin', 'member'];

// Enhanced error classes for better error handling
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.errorType = 'ValidationError';
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.errorType = 'AuthorizationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.errorType = 'NotFoundError';
  }
}

// Utility function for consistent error logging
function logError(operation, error, context = {}) {
  console.error(`[${operation}] Error:`, {
    message: error.message,
    errorType: error.errorType || error.name,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
}

// Utility function for success logging
function logSuccess(operation, result, context = {}) {
  console.log(`[${operation}] Success:`, {
    result: typeof result === 'object' ? JSON.stringify(result, null, 2) : result,
    context,
    timestamp: new Date().toISOString()
  });
}

// Input validation helpers
function validateRequired(value, fieldName) {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    throw new ValidationError(`${fieldName} is required and cannot be empty`);
  }
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

function validateLength(value, fieldName, minLength, maxLength) {
  if (value && typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length < minLength || trimmed.length > maxLength) {
      throw new ValidationError(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
    }
  }
}

// Enhanced user ID normalization
function normalizeUserId(identity) {
  // Extract user identifier from various possible fields
  const possibleIds = [
    identity.sub,
    identity.username,
    identity['cognito:username'],
    identity.email,
    identity['custom:email']
  ];
  
  for (const id of possibleIds) {
    if (id && typeof id === 'string' && id.trim()) {
      return id.trim();
    }
  }
  
  throw new AuthorizationError('Unable to determine user identity');
}

// Main handler for GraphQL resolvers
exports.handler = async (event) => {
  console.log('Lambda invocation started:', {
    timestamp: new Date().toISOString(),
    event: JSON.stringify(event, null, 2)
  });
  
  const { fieldName, arguments: args, identity } = event;
  
  if (!fieldName) {
    throw new ValidationError('Missing fieldName in event');
  }
  
  if (!identity) {
    throw new AuthorizationError('Authentication required - missing user identity');
  }
  
  // Normalize user ID
  let userId;
  try {
    userId = normalizeUserId(identity);
  } catch (error) {
    logError('USER_ID_NORMALIZATION', error, { identity });
    throw error;
  }
  
  const userGroups = identity['cognito:groups'] || [];
  
  console.log('Processing request:', {
    fieldName,
    userId,
    userGroups,
    argsCount: args ? Object.keys(args).length : 0
  });

  try {
    let result;
    
    switch (fieldName) {
      case 'createTeam':
        result = await createTeam(args, userId, userGroups);
        break;
      case 'addMember':
        result = await addMember(args, userId, userGroups);
        break;
      case 'createTask':
        result = await createTask(args, userId, userGroups);
        break;
      case 'updateTask':
        result = await updateTask(args, userId, userGroups);
        break;
      case 'updateTaskDetails':
        result = await updateTaskDetails(args, userId, userGroups);
        break;
      case 'deleteTask':
        result = await deleteTask(args, userId, userGroups);
        break;
      case 'listTeams':
        result = await listTeams(userId);
        break;
      case 'listTasks':
        result = await listTasks(args, userId, userGroups);
        break;
      case 'searchTasks':
        result = await searchTasks(args, userId, userGroups);
        break;
      case 'listMembers':
        result = await listMembers(args, userId, userGroups);
        break;
      case 'getUser':
        result = await getUser(args, userId);
        break;
      default:
        throw new ValidationError(`Unknown GraphQL field: ${fieldName}`);
    }
    
    logSuccess('HANDLER', `${fieldName} completed`, { 
      userId, 
      resultType: typeof result,
      resultCount: Array.isArray(result) ? result.length : 'N/A'
    });
    
    return result;
    
  } catch (err) {
    logError('HANDLER', err, { fieldName, userId, userGroups });
    
    if (err instanceof ValidationError || err instanceof AuthorizationError || err instanceof NotFoundError) {
      throw err;
    }
    
    const error = new Error(`${fieldName} failed: ${err.message}`);
    error.errorType = 'InternalError';
    throw error;
  }
};

// Create a new team with enhanced validation
async function createTeam(args, userId, userGroups) {
  console.log('[CREATE_TEAM] Starting team creation:', { args, userId });
  
  validateRequired(args?.name, 'Team name');
  validateLength(args.name, 'Team name', 1, 100);
  
  const teamId = uuidv4();
  const timestamp = new Date().toISOString();
  
  const team = {
    teamId,
    name: args.name.trim(),
    adminId: userId,
    createdAt: timestamp
  };
  
  const membership = {
    teamId,
    userId,
    role: 'admin',
    joinedAt: timestamp
  };
  
  try {
    const transactParams = {
      TransactItems: [
        {
          Put: {
            TableName: process.env.DYNAMODB_TEAMS_TABLE,
            Item: team,
            ConditionExpression: 'attribute_not_exists(teamId)'
          }
        },
        {
          Put: {
            TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
            Item: membership,
            ConditionExpression: 'attribute_not_exists(teamId) AND attribute_not_exists(userId)'
          }
        }
      ]
    };
    
    await dynamodb.send(new TransactWriteCommand(transactParams));
    
    await sendNotification(
      'Team Created Successfully',
      `Your team "${team.name}" has been created successfully. You can now add members and create tasks.`,
      userId,
      {
        teamId,
        teamName: team.name,
        action: 'team_created'
      }
    );
    
    logSuccess('CREATE_TEAM', 'Team created successfully', { teamId, teamName: team.name });
    
    return {
      teamId: team.teamId,
      name: team.name,
      adminId: team.adminId,
      createdAt: team.createdAt,
      userRole: 'admin'
    };
    
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new ValidationError('Team creation failed - duplicate data detected');
    }
    logError('CREATE_TEAM', error, { teamId, userId });
    throw new Error(`Failed to create team: ${error.message}`);
  }
}

// Add a member to a team with enhanced validation and notifications
async function addMember(args, userId, userGroups) {
  console.log('[ADD_MEMBER] Starting member addition:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.email, 'Email');
  validateEmail(args.email);
  
  try {
    const adminCheck = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!adminCheck.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    if (adminCheck.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can add members');
    }
    
    if (args.email === userId) {
      throw new ValidationError('You are already a member of this team');
    }
    
    const existingMember = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId: args.email }
    }));
    
    if (existingMember.Item) {
      throw new ValidationError('User is already a member of this team');
    }
    
    const teamInfo = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }));
    
    if (!teamInfo.Item) {
      throw new NotFoundError('Team not found');
    }
    
    const membership = {
      teamId: args.teamId,
      userId: args.email,
      role: 'member',
      joinedAt: new Date().toISOString(),
      addedBy: userId
    };
    
    await dynamodb.send(new PutCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Item: membership
    }));
    
    await sendNotification(
      'Team Invitation',
      `You have been added to the team "${teamInfo.Item.name}". Start collaborating on tasks now!`,
      args.email,
      {
        teamId: args.teamId,
        teamName: teamInfo.Item.name,
        invitedBy: userId,
        action: 'team_invitation'
      }
    );
    
    logSuccess('ADD_MEMBER', 'Member added successfully', { 
      teamId: args.teamId, 
      newMember: args.email,
      teamName: teamInfo.Item.name
    });
    
    return membership;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('ADD_MEMBER', error, { teamId: args.teamId, email: args.email });
    throw new Error(`Failed to add member: ${error.message}`);
  }
}

// Create a new task with enhanced validation and notifications
async function createTask(args, userId, userGroups) {
  console.log('[CREATE_TASK] Starting task creation:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.title, 'Task title');
  validateRequired(args?.description, 'Task description');
  validateLength(args.title, 'Task title', 1, 200);
  validateLength(args.description, 'Task description', 1, 1000);
  
  if (args.priority && !VALID_PRIORITIES.includes(args.priority)) {
    throw new ValidationError(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  
  if (args.deadline) {
    const deadlineDate = new Date(args.deadline);
    if (isNaN(deadlineDate.getTime())) {
      throw new ValidationError('Invalid deadline format. Use ISO date format (YYYY-MM-DD)');
    }
    if (deadlineDate < new Date()) {
      throw new ValidationError('Deadline cannot be in the past');
    }
  }
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to create tasks');
    }
    
    if (membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can create tasks');
    }
    
    if (args.assignedTo) {
      const assigneeCheck = await dynamodb.send(new GetCommand({
        TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
        Key: { teamId: args.teamId, userId: args.assignedTo }
      }));
      
      if (!assigneeCheck.Item) {
        throw new ValidationError('Cannot assign task to user who is not a team member');
      }
    }
    
    const teamInfo = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }));
    
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const task = {
      teamId: args.teamId,
      taskId,
      title: args.title.trim(),
      description: args.description.trim(),
      assignedTo: args.assignedTo || null,
      status: 'Not Started',
      priority: args.priority || 'Medium',
      deadline: args.deadline || null,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: userId
    };
    
    await dynamodb.send(new PutCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Item: task
    }));
    
    if (args.assignedTo) {
      await sendNotification(
        'New Task Assignment',
        `You have been assigned a new task: "${args.title}" in team "${teamInfo.Item?.name || 'Unknown'}". Priority: ${task.priority}`,
        args.assignedTo,
        {
          taskId,
          taskTitle: args.title,
          teamId: args.teamId,
          teamName: teamInfo.Item?.name,
          priority: task.priority,
          deadline: task.deadline,
          action: 'task_assigned'
        }
      );
    }
    
    logSuccess('CREATE_TASK', 'Task created successfully', { 
      taskId, 
      title: task.title,
      assignedTo: task.assignedTo,
      priority: task.priority
    });
    
    return task;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    logError('CREATE_TASK', error, { teamId: args.teamId, title: args.title });
    throw new Error(`Failed to create task: ${error.message}`);
  }
}

// Update task status with notifications
async function updateTask(args, userId, userGroups) {
  console.log('[UPDATE_TASK] Starting task update:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  validateRequired(args?.status, 'Task status');
  
  if (!VALID_TASK_STATUSES.includes(args.status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(', ')}`);
  }
  
  try {
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    const oldStatus = task.status;
    
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to update tasks');
    }
    
    const canUpdate = task.assignedTo === userId || membership.Item.role === 'admin';
    
    if (!canUpdate) {
      throw new AuthorizationError('You can only update tasks assigned to you or if you are a team admin');
    }
    
    if (task.status === args.status) {
      console.log('[UPDATE_TASK] Status unchanged, returning current task');
      return task;
    }
    
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, updatedBy = :updatedBy',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { 
        ':status': args.status,
        ':updatedAt': new Date().toISOString(),
        ':updatedBy': userId
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.send(new UpdateCommand(updateParams));
    
    const teamInfo = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }));
    
    const notificationTargets = new Set([task.createdBy]);
    if (task.assignedTo && task.assignedTo !== userId) {
      notificationTargets.add(task.assignedTo);
    }
    
    for (const target of notificationTargets) {
      if (target !== userId) {
        await sendNotification(
          'Task Status Updated',
          `Task "${task.title}" status changed from "${oldStatus}" to "${args.status}" by ${userId}`,
          target,
          {
            taskId: args.taskId,
            taskTitle: task.title,
            oldStatus,
            newStatus: args.status,
            updatedBy: userId,
            teamId: args.teamId,
            teamName: teamInfo.Item?.name,
            action: 'task_status_updated'
          }
        );
      }
    }
    
    logSuccess('UPDATE_TASK', 'Task updated successfully', { 
      taskId: args.taskId, 
      oldStatus,
      newStatus: args.status,
      updatedBy: userId
    });
    
    return result.Attributes;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('UPDATE_TASK', error, { teamId: args.teamId, taskId: args.taskId });
    throw new Error(`Failed to update task: ${error.message}`);
  }
}

// Update task details (title, description, assignment, etc.)
async function updateTaskDetails(args, userId, userGroups) {
  console.log('[UPDATE_TASK_DETAILS] Starting task details update:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  try {
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item || membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can update task details');
    }
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    if (args.title !== undefined) {
      validateLength(args.title, 'Task title', 1, 200);
      updateExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = args.title.trim();
    }
    
    if (args.description !== undefined) {
      validateLength(args.description, 'Task description', 1, 1000);
      updateExpressions.push('description = :description');
      expressionAttributeValues[':description'] = args.description.trim();
    }
    
    if (args.assignedTo !== undefined) {
      if (args.assignedTo) {
        const assigneeCheck = await dynamodb.send(new GetCommand({
          TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
          Key: { teamId: args.teamId, userId: args.assignedTo }
        }));
        
        if (!assigneeCheck.Item) {
          throw new ValidationError('Cannot assign task to user who is not a team member');
        }
      }
      updateExpressions.push('assignedTo = :assignedTo');
      expressionAttributeValues[':assignedTo'] = args.assignedTo;
    }
    
    if (args.deadline !== undefined) {
      if (args.deadline) {
        const deadlineDate = new Date(args.deadline);
        if (isNaN(deadlineDate.getTime())) {
          throw new ValidationError('Invalid deadline format');
        }
      }
      updateExpressions.push('deadline = :deadline');
      expressionAttributeValues[':deadline'] = args.deadline;
    }
    
    if (args.priority !== undefined) {
      if (args.priority && !VALID_PRIORITIES.includes(args.priority)) {
        throw new ValidationError(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
      }
      updateExpressions.push('priority = :priority');
      expressionAttributeValues[':priority'] = args.priority;
    }
    
    if (updateExpressions.length === 0) {
      return taskResult.Item;
    }
    
    updateExpressions.push('updatedAt = :updatedAt', 'updatedBy = :updatedBy');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeValues[':updatedBy'] = userId;
    
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.send(new UpdateCommand(updateParams));
    
    logSuccess('UPDATE_TASK_DETAILS', 'Task details updated successfully', { 
      taskId: args.taskId,
      updatedFields: Object.keys(args).filter(key => key !== 'teamId' && key !== 'taskId')
    });
    
    return result.Attributes;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('UPDATE_TASK_DETAILS', error, { teamId: args.teamId, taskId: args.taskId });
    throw new Error(`Failed to update task details: ${error.message}`);
  }
}

// Delete a task
async function deleteTask(args, userId, userGroups) {
  console.log('[DELETE_TASK] Starting task deletion:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item || membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can delete tasks');
    }
    
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    
    await dynamodb.send(new DeleteCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (task.assignedTo && task.assignedTo !== userId) {
      await sendNotification(
        'Task Deleted',
        `Task "${task.title}" has been deleted by ${userId}`,
        task.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          deletedBy: userId,
          teamId: args.teamId,
          action: 'task_deleted'
        }
      );
    }
    
    logSuccess('DELETE_TASK', 'Task deleted successfully', { 
      taskId: args.taskId,
      taskTitle: task.title
    });
    
    return true;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('DELETE_TASK', error, { teamId: args.teamId, taskId: args.taskId });
    throw new Error(`Failed to delete task: ${error.message}`);
  }
}

// List teams for a user
async function listTeams(userId) {
  console.log('[LIST_TEAMS] Starting teams list for user:', userId);
  
  try {
    const memberships = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));
    
    if (!memberships.Items || memberships.Items.length === 0) {
      console.log('[LIST_TEAMS] No team memberships found');
      return [];
    }
    
    const teamPromises = memberships.Items.map(async (membership) => {
      try {
        const team = await dynamodb.send(new GetCommand({
          TableName: process.env.DYNAMODB_TEAMS_TABLE,
          Key: { teamId: membership.teamId }
        }));
        
        if (team.Item) {
          return {
            teamId: team.Item.teamId,
            name: team.Item.name,
            adminId: team.Item.adminId,
            createdAt: team.Item.createdAt || new Date().toISOString(),
            userRole: membership.role
          };
        }
        return null;
      } catch (error) {
        console.warn(`[LIST_TEAMS] Failed to get team ${membership.teamId}:`, error.message);
        return null;
      }
    });
    
    const teams = await Promise.all(teamPromises);
    const validTeams = teams.filter(team => team !== null && team !== undefined);
    
    logSuccess('LIST_TEAMS', `Found ${validTeams.length} teams`, { userId });
    return validTeams;
    
  } catch (error) {
    logError('LIST_TEAMS', error, { userId });
    throw new Error('Failed to retrieve teams');
  }
}

// List tasks for a team with enhanced filtering
async function listTasks(args, userId, userGroups) {
  console.log('[LIST_TASKS] Starting tasks list:', { teamId: args.teamId, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    const tasks = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }));
    
    let filteredTasks;
    
    if (membership.Item.role === 'admin') {
      filteredTasks = tasks.Items;
    } else {
      filteredTasks = tasks.Items.filter(task => 
        task.assignedTo === userId || 
        task.assignedTo === null || 
        task.assignedTo === undefined
      );
    }
    
    filteredTasks.sort((a, b) => {
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    logSuccess('LIST_TASKS', `Found ${filteredTasks.length} tasks`, { 
      teamId: args.teamId, 
      userRole: membership.Item.role 
    });
    
    return filteredTasks;
    
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    logError('LIST_TASKS', error, { teamId: args.teamId, userId });
    throw new Error(`Failed to retrieve tasks: ${error.message}`);
  }
}

// Search tasks within a team
async function searchTasks(args, userId, userGroups) {
  console.log('[SEARCH_TASKS] Starting task search:', { teamId: args.teamId, searchTerm: args.searchTerm, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.searchTerm, 'Search term');
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    const tasks = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }));
    
    const searchTerm = args.searchTerm.toLowerCase();
    
    let filteredTasks = tasks.Items.filter(task => {
      if (membership.Item.role !== 'admin') {
        if (task.assignedTo !== userId && task.assignedTo !== null && task.assignedTo !== undefined) {
          return false;
        }
      }
      
      const titleMatch = task.title.toLowerCase().includes(searchTerm);
      const descriptionMatch = task.description.toLowerCase().includes(searchTerm);
      const assigneeMatch = task.assignedTo && task.assignedTo.toLowerCase().includes(searchTerm);
      const statusMatch = task.status.toLowerCase().includes(searchTerm);
      const priorityMatch = task.priority && task.priority.toLowerCase().includes(searchTerm);
      
      return titleMatch || descriptionMatch || assigneeMatch || statusMatch || priorityMatch;
    });
    
    filteredTasks.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(searchTerm);
      const bTitle = b.title.toLowerCase().includes(searchTerm);
      
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    logSuccess('SEARCH_TASKS', `Found ${filteredTasks.length} matching tasks`, { 
      teamId: args.teamId,
      searchTerm: args.searchTerm,
      userRole: membership.Item.role 
    });
    
    return filteredTasks;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    logError('SEARCH_TASKS', error, { teamId: args.teamId, searchTerm: args.searchTerm });
    throw new Error(`Failed to search tasks: ${error.message}`);
  }
}

// List members of a team
async function listMembers(args, userId, userGroups) {
  console.log('[LIST_MEMBERS] Starting members list:', { teamId: args.teamId, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    const userMembership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!userMembership.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    const members = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }));
    
    const sortedMembers = members.Items.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return new Date(a.joinedAt) - new Date(b.joinedAt);
    });
    
    logSuccess('LIST_MEMBERS', `Found ${sortedMembers.length} members`, { 
      teamId: args.teamId 
    });
    
    return sortedMembers;
    
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    logError('LIST_MEMBERS', error, { teamId: args.teamId, userId });
    throw new Error(`Failed to retrieve members: ${error.message}`);
  }
}

// Get user details
async function getUser(args, userId) {
  console.log('[GET_USER] Getting user details:', { requestedUserId: args.userId, requesterId: userId });
  
  validateRequired(args?.userId, 'User ID');
  
  try {
    const user = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Key: { userId: args.userId }
    }));
    
    if (user.Item) {
      logSuccess('GET_USER', 'User found in database', { userId: args.userId });
      return user.Item;
    }
    
    const defaultUser = {
      userId: args.userId,
      email: args.userId,
      name: args.userId.includes('@') ? args.userId.split('@')[0] : args.userId,
      createdAt: new Date().toISOString(),
      isDefault: true
    };
    
    console.log('[GET_USER] User not found in database, returning default user');
    return defaultUser;
    
  } catch (error) {
    logError('GET_USER', error, { requestedUserId: args.userId });
    throw new Error('Failed to retrieve user information');
  }
}

// Enhanced notification system
async function sendNotification(subject, message, recipient, metadata = {}) {
  if (!process.env.SNS_TOPIC_ARN) {
    console.warn('[NOTIFICATION] SNS Topic ARN not configured, skipping notification');
    return;
  }
  
  try {
    const messageAttributes = {
      email: { DataType: 'String', StringValue: recipient },
      action: { DataType: 'String', StringValue: metadata.action || 'notification' }
    };
    
    Object.keys(metadata).forEach(key => {
      if (key !== 'action' && typeof metadata[key] === 'string') {
        messageAttributes[key] = { DataType: 'String', StringValue: metadata[key] };
      }
    });
    
    const snsParams = {
      TopicArn: process.env.SNS_TOPIC_ARN,
      Subject: subject,
      Message: JSON.stringify({
        default: message,
        email: message,
        metadata: metadata
      }, null, 2),
      MessageStructure: 'json',
      MessageAttributes: messageAttributes
    };
    
    await snsClient.send(new PublishCommand(snsParams));
    
    console.log('[NOTIFICATION] Notification sent successfully:', {
      recipient,
      subject,
      action: metadata.action
    });
    
  } catch (error) {
    console.error('[NOTIFICATION] Failed to send notification:', {
      error: error.message,
      recipient,
      subject,
      metadata
    });
  }
}