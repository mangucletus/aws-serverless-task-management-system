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
    const trimmedValue = value.trim();
    if (trimmedValue.length < minLength || trimmedValue.length > maxLength) {
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

// Send SNS notification
async function sendNotification(subject, message, recipientId, metadata = {}) {
  try {
    const params = {
      TopicArn: process.env.SNS_TOPIC_ARN,
      Subject: subject,
      Message: JSON.stringify({
        recipientId: recipientId,
        message: message,
        metadata: metadata,
        timestamp: new Date().toISOString()
      })
    };
    
    await snsClient.send(new PublishCommand(params));
    logSuccess('SEND_NOTIFICATION', 'Notification sent successfully', { subject, recipientId });
  } catch (error) {
    logError('SEND_NOTIFICATION', error, { subject, recipientId });
    console.warn('Failed to send notification, continuing execution');
  }
}

// Main handler for GraphQL resolvers
exports.handler = async (event) => {
  console.log('Lambda invocation started:', {
    timestamp: new Date().toISOString(),
    event: JSON.stringify(event, null, 2)
  });
  
  try {
    // Handle different event structures from AppSync
    let fieldName, args, identity;
    
    if (event.info && event.info.fieldName) {
      // Direct resolver format
      fieldName = event.info.fieldName;
      args = event.arguments || {};
      identity = event.identity;
    } else if (event.fieldName) {
      // Alternative format
      fieldName = event.fieldName;
      args = event.arguments || {};
      identity = event.identity;
    } else if (event.payload) {
      // Wrapped payload format
      fieldName = event.payload.fieldName;
      args = event.payload.arguments ? JSON.parse(event.payload.arguments) : {};
      identity = event.payload.identity ? JSON.parse(event.payload.identity) : null;
    } else {
      // Try to extract from top level
      fieldName = event.operation || event.field;
      args = event.variables || event.arguments || {};
      identity = event.requestContext?.identity || event.identity;
    }
    
    console.log('Extracted event data:', {
      fieldName,
      args,
      identity: identity ? 'present' : 'missing'
    });
    
    if (!fieldName) {
      throw new ValidationError('Missing fieldName in event - unable to determine operation');
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
    logError('HANDLER', err, { 
      fieldName: fieldName || 'unknown', 
      userId: userId || 'unknown',
      eventStructure: Object.keys(event || {})
    });
    
    if (err instanceof ValidationError || err instanceof AuthorizationError || err instanceof NotFoundError) {
      throw err;
    }
    
    const error = new Error(`Operation failed: ${err.message}`);
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
    
    if (!teamInfo.Item) {
      throw new NotFoundError('Team not found');
    }
    
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
        `You have been assigned a new task: "${args.title}" in team "${teamInfo.Item.name}". Priority: ${task.priority}`,
        args.assignedTo,
        {
          taskId,
          taskTitle: args.title,
          teamId: args.teamId,
          teamName: teamInfo.Item.name,
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
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
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
    
    const teamInfo = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }));
    
    if (!teamInfo.Item) {
      throw new NotFoundError('Team not found');
    }
    
    const timestamp = new Date().toISOString();
    
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, updatedBy = :updatedBy',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': args.status,
        ':updatedAt': timestamp,
        ':updatedBy': userId
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.send(new UpdateCommand(updateParams));
    
    if (task.assignedTo && oldStatus !== args.status) {
      await sendNotification(
        'Task Status Updated',
        `The task "${task.title}" in team "${teamInfo.Item.name}" has been updated to "${args.status}" by ${userId}.`,
        task.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          teamId: args.teamId,
          teamName: teamInfo.Item.name,
          oldStatus,
          newStatus: args.status,
          action: 'task_status_updated'
        }
      );
    }
    
    logSuccess('UPDATE_TASK', 'Task status updated successfully', { 
      taskId: args.taskId, 
      status: args.status 
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

// Update task details (title, description, priority, deadline, assignedTo)
async function updateTaskDetails(args, userId, userGroups) {
  console.log('[UPDATE_TASK_DETAILS] Starting task details update:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  if (args.title) validateLength(args.title, 'Task title', 1, 200);
  if (args.description) validateLength(args.description, 'Task description', 1, 1000);
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
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to update task details');
    }
    
    if (membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can update task details');
    }
    
    if (args.assignedTo) {
      const assigneeCheck = await dynamodb.send(new GetCommand({
        TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
        Key: { teamId: args.teamId, userId: args.assignedTo }
      }));
      
      if (!assigneeCheck.Item && args.assignedTo !== null) {
        throw new ValidationError('Cannot assign task to user who is not a team member');
      }
    }
    
    const teamInfo = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }));
    
    if (!teamInfo.Item) {
      throw new NotFoundError('Team not found');
    }
    
    const timestamp = new Date().toISOString();
    let updateExpression = 'SET updatedAt = :updatedAt, updatedBy = :updatedBy';
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':updatedAt': timestamp,
      ':updatedBy': userId
    };
    
    if (args.title) {
      updateExpression += ', title = :title';
      expressionAttributeValues[':title'] = args.title.trim();
    }
    if (args.description) {
      updateExpression += ', description = :description';
      expressionAttributeValues[':description'] = args.description.trim();
    }
    if (args.priority) {
      updateExpression += ', priority = :priority';
      expressionAttributeValues[':priority'] = args.priority;
    }
    if (args.deadline !== undefined) {
      updateExpression += ', deadline = :deadline';
      expressionAttributeValues[':deadline'] = args.deadline || null;
    }
    if (args.assignedTo !== undefined) {
      updateExpression += ', assignedTo = :assignedTo';
      expressionAttributeValues[':assignedTo'] = args.assignedTo || null;
    }
    
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.send(new UpdateCommand(updateParams));
    
    if (args.assignedTo && args.assignedTo !== task.assignedTo) {
      await sendNotification(
        'Task Reassigned',
        `The task "${task.title}" in team "${teamInfo.Item.name}" has been reassigned to you.`,
        args.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          teamId: args.teamId,
          teamName: teamInfo.Item.name,
          action: 'task_reassigned'
        }
      );
    }
    
    logSuccess('UPDATE_TASK_DETAILS', 'Task details updated successfully', { 
      taskId: args.taskId 
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
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to delete tasks');
    }
    
    if (membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can delete tasks');
    }
    
    const teamInfo = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }));
    
    if (!teamInfo.Item) {
      throw new NotFoundError('Team not found');
    }
    
    await dynamodb.send(new DeleteCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (task.assignedTo) {
      await sendNotification(
        'Task Deleted',
        `The task "${task.title}" in team "${teamInfo.Item.name}" has been deleted.`,
        task.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          teamId: args.teamId,
          teamName: teamInfo.Item.name,
          action: 'task_deleted'
        }
      );
    }
    
    logSuccess('DELETE_TASK', 'Task deleted successfully', { 
      taskId: args.taskId 
    });
    
    return { success: true };
    
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
  console.log('[LIST_TEAMS] Starting team list:', { userId });
  
  try {
    const memberships = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));
    
    if (!memberships.Items || memberships.Items.length === 0) {
      console.log('[LIST_TEAMS] No team memberships found');
      return [];
    }
    
    const teamIds = memberships.Items.map(item => item.teamId);
    
    const teams = [];
    for (const teamId of teamIds) {
      const teamResult = await dynamodb.send(new GetCommand({
        TableName: process.env.DYNAMODB_TEAMS_TABLE,
        Key: { teamId }
      }));
      
      if (teamResult.Item) {
        const membership = memberships.Items.find(m => m.teamId === teamId);
        teams.push({
          ...teamResult.Item,
          userRole: membership.role
        });
      }
    }
    
    logSuccess('LIST_TEAMS', 'Teams retrieved successfully', { 
      teamCount: teams.length,
      userId
    });
    
    return teams;
    
  } catch (error) {
    logError('LIST_TEAMS', error, { userId });
    throw new Error(`Failed to list teams: ${error.message}`);
  }
}

// List tasks for a team
async function listTasks(args, userId, userGroups) {
  console.log('[LIST_TASKS] Starting task list:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to list tasks');
    }
    
    const tasks = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: {
        ':teamId': args.teamId
      }
    }));
    
    logSuccess('LIST_TASKS', 'Tasks retrieved successfully', { 
      teamId: args.teamId, 
      taskCount: tasks.Items?.length || 0 
    });
    
    return tasks.Items || [];
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    logError('LIST_TASKS', error, { teamId: args.teamId });
    throw new Error(`Failed to list tasks: ${error.message}`);
  }
}

// Search tasks within a team
async function searchTasks(args, userId, userGroups) {
  console.log('[SEARCH_TASKS] Starting task search:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.query, 'Search query');
  validateLength(args.query, 'Search query', 1, 200);
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to search tasks');
    }
    
    const tasks = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: {
        ':teamId': args.teamId
      }
    }));
    
    const queryLower = args.query.toLowerCase();
    const filteredTasks = (tasks.Items || []).filter(task => 
      task.title.toLowerCase().includes(queryLower) || 
      task.description.toLowerCase().includes(queryLower)
    );
    
    logSuccess('SEARCH_TASKS', 'Tasks searched successfully', { 
      teamId: args.teamId, 
      query: args.query, 
      taskCount: filteredTasks.length 
    });
    
    return filteredTasks;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    logError('SEARCH_TASKS', error, { teamId: args.teamId, query: args.query });
    throw new Error(`Failed to search tasks: ${error.message}`);
  }
}

// List members of a team
async function listMembers(args, userId, userGroups) {
  console.log('[LIST_MEMBERS] Starting member list:', { args, userId });
  
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    const membership = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }));
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to list members');
    }
    
    const members = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: {
        ':teamId': args.teamId
      }
    }));
    
    logSuccess('LIST_MEMBERS', 'Members retrieved successfully', { 
      teamId: args.teamId, 
      memberCount: members.Items?.length || 0 
    });
    
    return members.Items || [];
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    logError('LIST_MEMBERS', error, { teamId: args.teamId });
    throw new Error(`Failed to list members: ${error.message}`);
  }
}

// Get user details
async function getUser(args, userId) {
  console.log('[GET_USER] Starting user retrieval:', { args, userId });
  
  const targetUserId = args?.userId || userId;
  
  try {
    const userResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Key: { userId: targetUserId }
    }));
    
    if (!userResult.Item) {
      throw new NotFoundError('User not found');
    }
    
    logSuccess('GET_USER', 'User retrieved successfully', { 
      targetUserId 
    });
    
    return userResult.Item;
    
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logError('GET_USER', error, { targetUserId });
    throw new Error(`Failed to get user: ${error.message}`);
  }
}