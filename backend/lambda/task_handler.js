// Task Management System Lambda Handler
// This AWS Lambda function serves as a GraphQL resolver handler for a task management system.
// It processes various GraphQL operations including adding members, creating tasks and teams,
// listing tasks and members, and updating tasks.

// Import required AWS SDK module for interacting with AWS services
const AWS = require('aws-sdk');
// Import uuid v4 for generating unique identifiers
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK
// Initialize DynamoDB DocumentClient for database operations
// Uses environment variable AWS_REGION or defaults to 'eu-west-1'
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});
// Initialize SNS client for sending notifications
// Uses same region configuration as DynamoDB
const sns = new AWS.SNS({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Constants
// Array of valid task statuses for validation purposes
const VALID_TASK_STATUSES = ['Not Started', 'In Progress', 'Completed'];
// Array of valid task priorities
const VALID_PRIORITIES = ['Low', 'Medium', 'High'];
// Array of valid user roles within a team
const VALID_ROLES = ['admin', 'member'];

// Enhanced error classes for better error handling
// Custom ValidationError class for input validation errors
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError'; // Set error name for identification
    this.errorType = 'ValidationError'; // Set error type for GraphQL response
  }
}

// Custom AuthorizationError class for permission-related errors
class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError'; // Set error name
    this.errorType = 'AuthorizationError'; // Set error type
  }
}

// Custom NotFoundError class for resource not found errors
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError'; // Set error name
    this.errorType = 'NotFoundError'; // Set error type
  }
}

// Utility function for consistent error logging
// Logs errors with detailed context including operation, error details, and timestamp
function logError(operation, error, context = {}) {
  console.error(`[${operation}] Error:`, {
    message: error.message, // Error message
    errorType: error.errorType || error.name, // Error type or name
    stack: error.stack, // Stack trace for debugging
    context, // Additional context information
    timestamp: new Date().toISOString() // Current timestamp in ISO format
  });
}

// Utility function for success logging
// Logs successful operations with result and context
function logSuccess(operation, result, context = {}) {
  console.log(`[${operation}] Success:`, {
    result: typeof result === 'object' ? JSON.stringify(result, null, 2) : result, // Stringify object results for readability
    context, // Additional context
    timestamp: new Date().toISOString() // Current timestamp
  });
}

// Input validation helpers
// Validates that a required field is present and not empty
function validateRequired(value, fieldName) {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    throw new ValidationError(`${fieldName} is required and cannot be empty`);
  }
}

// Validates email format using a regular expression
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email format regex
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

// Validates string length within specified min and max bounds
function validateLength(value, fieldName, minLength, maxLength) {
  if (value && typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length < minLength || trimmed.length > maxLength) {
      throw new ValidationError(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
    }
  }
}

// Main handler for GraphQL resolvers
// Entry point for the Lambda function, processes incoming GraphQL requests
exports.handler = async (event) => {
  // Log the start of Lambda invocation with event details
  console.log('Lambda invocation started:', {
    timestamp: new Date().toISOString(),
    event: JSON.stringify(event, null, 2) // Stringified event for debugging
  });
  
  // Destructure event to extract fieldName, arguments, and identity
  const { fieldName, arguments: args, identity } = event;
  
  // Validate that fieldName is provided
  if (!fieldName) {
    throw new ValidationError('Missing fieldName in event');
  }
  
  // Validate that user identity is present
  if (!identity || !identity.sub) {
    throw new AuthorizationError('Authentication required - missing user identity');
  }
  
  // Extract user ID and groups from identity
  const userId = identity.sub;
  const userGroups = identity['cognito:groups'] || [];
  
  // Log request details for debugging
  console.log('Processing request:', {
    fieldName,
    userId,
    userGroups,
    argsCount: args ? Object.keys(args).length : 0
  });

  try {
    let result;
    
    // Route request to appropriate resolver function based on fieldName
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
    
    // Log successful operation
    logSuccess('HANDLER', `${fieldName} completed`, { 
      userId, 
      resultType: typeof result,
      resultCount: Array.isArray(result) ? result.length : 'N/A'
    });
    
    // Return the result to the GraphQL client
    return result;
    
  } catch (err) {
    // Log any errors that occur during execution
    logError('HANDLER', err, { fieldName, userId, userGroups });
    
    // Re-throw known error types for AppSync
    if (err instanceof ValidationError || err instanceof AuthorizationError || err instanceof NotFoundError) {
      throw err;
    }
    
    // Wrap unexpected errors in a generic error for AppSync
    const error = new Error(`${fieldName} failed: ${err.message}`);
    error.errorType = 'InternalError';
    throw error;
  }
};

// Create a new team with enhanced validation
// Creates a new team and adds the creator as an admin
async function createTeam(args, userId, userGroups) {
  // Log the start of team creation
  console.log('[CREATE_TEAM] Starting team creation:', { args, userId });
  
  // Validate team name
  validateRequired(args?.name, 'Team name');
  validateLength(args.name, 'Team name', 1, 100);
  
  // Generate unique team ID and timestamp
  const teamId = uuidv4();
  const timestamp = new Date().toISOString();
  
  // Create team object
  const team = {
    teamId, // Unique team identifier
    name: args.name.trim(), // Team name, trimmed of whitespace
    adminId: userId, // Creator's user ID as admin
    createdAt: timestamp // Creation timestamp
  };
  
  // Create membership object for the creator
  const membership = {
    teamId, // Link to team
    userId, // Creator's user ID
    role: 'admin', // Set as admin
    joinedAt: timestamp // Join timestamp
  };
  
  try {
    // Use DynamoDB transaction to ensure atomic team and membership creation
    const transactParams = {
      TransactItems: [
        {
          Put: {
            TableName: process.env.DYNAMODB_TEAMS_TABLE, // Teams table
            Item: team, // Team data
            ConditionExpression: 'attribute_not_exists(teamId)' // Ensure teamId is unique
          }
        },
        {
          Put: {
            TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE, // Memberships table
            Item: membership, // Membership data
            ConditionExpression: 'attribute_not_exists(teamId) AND attribute_not_exists(userId)' // Ensure unique membership
          }
        }
      ]
    };
    
    // Execute transaction
    await dynamodb.transactWrite(transactParams).promise();
    
    // Send welcome notification to team creator
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
    
    // Log successful team creation
    logSuccess('CREATE_TEAM', 'Team created successfully', { teamId, teamName: team.name });
    
    // Return team object with user role for frontend
    return {
      teamId: team.teamId,
      name: team.name,
      adminId: team.adminId,
      createdAt: team.createdAt,
      userRole: 'admin' // Include user's role
    };
    
  } catch (error) {
    // Handle duplicate team error
    if (error.code === 'ConditionalCheckFailedException') {
      throw new ValidationError('Team creation failed - duplicate data detected');
    }
    // Log and throw other errors
    logError('CREATE_TEAM', error, { teamId, userId });
    throw new Error(`Failed to create team: ${error.message}`);
  }
}

// Add a member to a team with enhanced validation and notifications
// Adds a new member to an existing team
async function addMember(args, userId, userGroups) {
  // Log start of member addition
  console.log('[ADD_MEMBER] Starting member addition:', { args, userId });
  
  // Validate input arguments
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.email, 'Email');
  validateEmail(args.email);
  
  try {
    // Check if current user is admin of the team
    const adminCheck = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    // Verify membership exists
    if (!adminCheck.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    // Verify user is admin
    if (adminCheck.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can add members');
    }
    
    // Prevent adding self
    if (args.email === userId) {
      throw new ValidationError('You are already a member of this team');
    }
    
    // Check if user is already a member
    const existingMember = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId: args.email }
    }).promise();
    
    if (existingMember.Item) {
      throw new ValidationError('User is already a member of this team');
    }
    
    // Get team information for notification
    const teamInfo = await dynamodb.get({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }).promise();
    
    if (!teamInfo.Item) {
      throw new NotFoundError('Team not found');
    }
    
    // Create membership object
    const membership = {
      teamId: args.teamId,
      userId: args.email, // Use email as userId
      role: 'member', // Default role
      joinedAt: new Date().toISOString(),
      addedBy: userId // Track who added the member
    };
    
    // Save membership to DynamoDB
    await dynamodb.put({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Item: membership
    }).promise();
    
    // Send invitation notification to new member
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
    
    // Log successful member addition
    logSuccess('ADD_MEMBER', 'Member added successfully', { 
      teamId: args.teamId, 
      newMember: args.email,
      teamName: teamInfo.Item.name
    });
    
    // Return membership object
    return membership;
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    // Log and throw other errors
    logError('ADD_MEMBER', error, { teamId: args.teamId, email: args.email });
    throw new Error(`Failed to add member: ${error.message}`);
  }
}

// Create a new task with enhanced validation and notifications
// Creates a new task in a team
async function createTask(args, userId, userGroups) {
  // Log start of task creation
  console.log('[CREATE_TASK] Starting task creation:', { args, userId });
  
  // Validate required fields
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.title, 'Task title');
  validateRequired(args?.description, 'Task description');
  validateLength(args.title, 'Task title', 1, 200);
  validateLength(args.description, 'Task description', 1, 1000);
  
  // Validate priority if provided
  if (args.priority && !VALID_PRIORITIES.includes(args.priority)) {
    throw new ValidationError(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  
  // Validate deadline format if provided
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
    // Check if user is admin of the team
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to create tasks');
    }
    
    if (membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can create tasks');
    }
    
    // If assignedTo is provided, verify they are team members
    if (args.assignedTo) {
      const assigneeCheck = await dynamodb.get({
        TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
        Key: { teamId: args.teamId, userId: args.assignedTo }
      }).promise();
      
      if (!assigneeCheck.Item) {
        throw new ValidationError('Cannot assign task to user who is not a team member');
      }
    }
    
    // Get team information for notification
    const teamInfo = await dynamodb.get({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }).promise();
    
    // Generate task ID and timestamp
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Create task object
    const task = {
      teamId: args.teamId,
      taskId,
      title: args.title.trim(),
      description: args.description.trim(),
      assignedTo: args.assignedTo || null,
      status: 'Not Started', // Default status
      priority: args.priority || 'Medium', // Default priority
      deadline: args.deadline || null,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: userId
    };
    
    // Save task to DynamoDB
    await dynamodb.put({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Item: task
    }).promise();
    
    // Send notification if task is assigned
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
    
    // Log successful task creation
    logSuccess('CREATE_TASK', 'Task created successfully', { 
      taskId, 
      title: task.title,
      assignedTo: task.assignedTo,
      priority: task.priority
    });
    
    // Return task object
    return task;
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    // Log and throw other errors
    logError('CREATE_TASK', error, { teamId: args.teamId, title: args.title });
    throw new Error(`Failed to create task: ${error.message}`);
  }
}

// Update task status with notifications
// Updates the status of an existing task
async function updateTask(args, userId, userGroups) {
  // Log start of task update
  console.log('[UPDATE_TASK] Starting task update:', { args, userId });
  
  // Validate required fields
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  validateRequired(args?.status, 'Task status');
  
  // Validate status value
  if (!VALID_TASK_STATUSES.includes(args.status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(', ')}`);
  }
  
  try {
    // Get current task from DynamoDB
    const taskResult = await dynamodb.get({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }).promise();
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    const oldStatus = task.status;
    
    // Check user permissions
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new AuthorizationError('You must be a team member to update tasks');
    }
    
    // Allow updates if user is assigned to task OR is team admin
    const canUpdate = task.assignedTo === userId || membership.Item.role === 'admin';
    
    if (!canUpdate) {
      throw new AuthorizationError('You can only update tasks assigned to you or if you are a team admin');
    }
    
    // Skip update if status hasn't changed
    if (task.status === args.status) {
      console.log('[UPDATE_TASK] Status unchanged, returning current task');
      return task;
    }
    
    // Prepare update parameters for DynamoDB
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, updatedBy = :updatedBy',
      ExpressionAttributeNames: { '#status': 'status' }, // Avoid reserved keyword
      ExpressionAttributeValues: { 
        ':status': args.status,
        ':updatedAt': new Date().toISOString(),
        ':updatedBy': userId
      },
      ReturnValues: 'ALL_NEW' // Return updated item
    };
    
    // Update task in DynamoDB
    const result = await dynamodb.update(updateParams).promise();
    
    // Get team information for notification
    const teamInfo = await dynamodb.get({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId: args.teamId }
    }).promise();
    
    // Send status update notification to relevant users
    const notificationTargets = new Set([task.createdBy]);
    if (task.assignedTo && task.assignedTo !== userId) {
      notificationTargets.add(task.assignedTo);
    }
    
    for (const target of notificationTargets) {
      if (target !== userId) { // Don't notify the user who made the change
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
    
    // Log successful task update
    logSuccess('UPDATE_TASK', 'Task updated successfully', { 
      taskId: args.taskId, 
      oldStatus,
      newStatus: args.status,
      updatedBy: userId
    });
    
    // Return updated task
    return result.Attributes;
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    // Log and throw other errors
    logError('UPDATE_TASK', error, { teamId: args.teamId, taskId: args.taskId });
    throw new Error(`Failed to update task: ${error.message}`);
  }
}

// Update task details (title, description, assignment, etc.)
// Updates various fields of an existing task
async function updateTaskDetails(args, userId, userGroups) {
  // Log start of task details update
  console.log('[UPDATE_TASK_DETAILS] Starting task details update:', { args, userId });
  
  // Validate required fields
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  try {
    // Get current task
    const taskResult = await dynamodb.get({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }).promise();
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    // Check if user is admin
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item || membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can update task details');
    }
    
    // Build update expression dynamically based on provided fields
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Handle title update
    if (args.title !== undefined) {
      validateLength(args.title, 'Task title', 1, 200);
      updateExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = args.title.trim();
    }
    
    // Handle description update
    if (args.description !== undefined) {
      validateLength(args.description, 'Task description', 1, 1000);
      updateExpressions.push('description = :description');
      expressionAttributeValues[':description'] = args.description.trim();
    }
    
    // Handle assignee update
    if (args.assignedTo !== undefined) {
      if (args.assignedTo) {
        // Verify assignee is team member
        const assigneeCheck = await dynamodb.get({
          TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
          Key: { teamId: args.teamId, userId: args.assignedTo }
        }).promise();
        
        if (!assigneeCheck.Item) {
          throw new ValidationError('Cannot assign task to user who is not a team member');
        }
      }
      updateExpressions.push('assignedTo = :assignedTo');
      expressionAttributeValues[':assignedTo'] = args.assignedTo;
    }
    
    // Handle deadline update
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
    
    // Handle priority update
    if (args.priority !== undefined) {
      if (args.priority && !VALID_PRIORITIES.includes(args.priority)) {
        throw new ValidationError(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
      }
      updateExpressions.push('priority = :priority');
      expressionAttributeValues[':priority'] = args.priority;
    }
    
    // If no fields to update, return current task
    if (updateExpressions.length === 0) {
      return taskResult.Item;
    }
    
    // Add standard update fields
    updateExpressions.push('updatedAt = :updatedAt', 'updatedBy = :updatedBy');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeValues[':updatedBy'] = userId;
    
    // Prepare update parameters
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };
    
    // Update task in DynamoDB
    const result = await dynamodb.update(updateParams).promise();
    
    // Log successful update
    logSuccess('UPDATE_TASK_DETAILS', 'Task details updated successfully', { 
      taskId: args.taskId,
      updatedFields: Object.keys(args).filter(key => key !== 'teamId' && key !== 'taskId')
    });
    
    // Return updated task
    return result.Attributes;
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    // Log and throw other errors
    logError('UPDATE_TASK_DETAILS', error, { teamId: args.teamId, taskId: args.taskId });
    throw new Error(`Failed to update task details: ${error.message}`);
  }
}

// Delete a task
// Removes a task from a team
async function deleteTask(args, userId, userGroups) {
  // Log start of task deletion
  console.log('[DELETE_TASK] Starting task deletion:', { args, userId });
  
  // Validate required fields
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  try {
    // Check if user is admin
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item || membership.Item.role !== 'admin') {
      throw new AuthorizationError('Only team admins can delete tasks');
    }
    
    // Get task info before deletion
    const taskResult = await dynamodb.get({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }).promise();
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    
    // Delete task from DynamoDB
    await dynamodb.delete({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }).promise();
    
    // Notify assigned user if task was assigned
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
    
    // Log successful deletion
    logSuccess('DELETE_TASK', 'Task deleted successfully', { 
      taskId: args.taskId,
      taskTitle: task.title
    });
    
    // Return true to indicate successful deletion
    return true;
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    // Log and throw other errors
    logError('DELETE_TASK', error, { teamId: args.teamId, taskId: args.taskId });
    throw new Error(`Failed to delete task: ${error.message}`);
  }
}

// List teams for a user
// Retrieves all teams a user is a member of
async function listTeams(userId) {
  // Log start of teams listing
  console.log('[LIST_TEAMS] Starting teams list for user:', userId);
  
  try {
    // Query memberships by userId using index
    const memberships = await dynamodb.query({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }).promise();
    
    // Handle case where user has no memberships
    if (!memberships.Items || memberships.Items.length === 0) {
      console.log('[LIST_TEAMS] No team memberships found');
      return [];
    }
    
    // Fetch team details for each membership
    const teamPromises = memberships.Items.map(async (membership) => {
      try {
        const team = await dynamodb.get({
          TableName: process.env.DYNAMODB_TEAMS_TABLE,
          Key: { teamId: membership.teamId }
        }).promise();
        
        if (team.Item) {
          // Return team object with all required fields
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
        // Log warning for individual team fetch failures
        console.warn(`[LIST_TEAMS] Failed to get team ${membership.teamId}:`, error.message);
        return null;
      }
    });
    
    // Wait for all team fetches to complete
    const teams = await Promise.all(teamPromises);
    
    // Filter out null teams
    const validTeams = teams.filter(team => team !== null && team !== undefined);
    
    // Log successful teams retrieval
    logSuccess('LIST_TEAMS', `Found ${validTeams.length} teams`, { userId });
    return validTeams;
    
  } catch (error) {
    // Log and throw error
    logError('LIST_TEAMS', error, { userId });
    throw new Error('Failed to retrieve teams');
  }
}

// List tasks for a team with enhanced filtering
// Retrieves tasks for a team, filtered by user role
async function listTasks(args, userId, userGroups) {
  // Log start of tasks listing
  console.log('[LIST_TASKS] Starting tasks list:', { teamId: args.teamId, userId });
  
  // Validate teamId
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    // Check if user is member of the team
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    // Query all tasks for the team
    const tasks = await dynamodb.query({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }).promise();
    
    let filteredTasks;
    
    // Apply role-based filtering
    if (membership.Item.role === 'admin') {
      // Admins see all tasks
      filteredTasks = tasks.Items;
    } else {
      // Members see only their assigned tasks or unassigned tasks
      filteredTasks = tasks.Items.filter(task => 
        task.assignedTo === userId || 
        task.assignedTo === null || 
        task.assignedTo === undefined
      );
    }
    
    // Sort tasks by priority and creation date
    filteredTasks.sort((a, b) => {
      // Define priority order
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      
      // Sort by priority first
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Then sort by creation date (newest first)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // Log successful tasks retrieval
    logSuccess('LIST_TASKS', `Found ${filteredTasks.length} tasks`, { 
      teamId: args.teamId, 
      userRole: membership.Item.role 
    });
    
    // Return filtered tasks
    return filteredTasks;
    
  } catch (error) {
    // Re-throw authorization errors
    if (error instanceof AuthorizationError) {
      throw error;
    }
    // Log and throw other errors
    logError('LIST_TASKS', error, { teamId: args.teamId, userId });
    throw new Error(`Failed to retrieve tasks: ${error.message}`);
  }
}

// Search tasks within a team
// Searches tasks based on a search term
async function searchTasks(args, userId, userGroups) {
  // Log start of task search
  console.log('[SEARCH_TASKS] Starting task search:', { teamId: args.teamId, searchTerm: args.searchTerm, userId });
  
  // Validate required fields
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.searchTerm, 'Search term');
  
  try {
    // Check if user is member of the team
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    // Get all tasks for the team
    const tasks = await dynamodb.query({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }).promise();
    
    const searchTerm = args.searchTerm.toLowerCase();
    
    // Filter tasks based on search term and user role
    let filteredTasks = tasks.Items.filter(task => {
      // Apply role-based filtering
      if (membership.Item.role !== 'admin') {
        if (task.assignedTo !== userId && task.assignedTo !== null && task.assignedTo !== undefined) {
          return false;
        }
      }
      
      // Search in multiple task fields
      const titleMatch = task.title.toLowerCase().includes(searchTerm);
      const descriptionMatch = task.description.toLowerCase().includes(searchTerm);
      const assigneeMatch = task.assignedTo && task.assignedTo.toLowerCase().includes(searchTerm);
      const statusMatch = task.status.toLowerCase().includes(searchTerm);
      const priorityMatch = task.priority && task.priority.toLowerCase().includes(searchTerm);
      
      return titleMatch || descriptionMatch || assigneeMatch || statusMatch || priorityMatch;
    });
    
    // Sort by relevance (title matches first, then by creation date)
    filteredTasks.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(searchTerm);
      const bTitle = b.title.toLowerCase().includes(searchTerm);
      
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      
      // Sort by creation date if title match is equal
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // Log successful search
    logSuccess('SEARCH_TASKS', `Found ${filteredTasks.length} matching tasks`, { 
      teamId: args.teamId,
      searchTerm: args.searchTerm,
      userRole: membership.Item.role 
    });
    
    // Return filtered tasks
    return filteredTasks;
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ValidationError || error instanceof AuthorizationError) {
      throw error;
    }
    // Log and throw other errors
    logError('SEARCH_TASKS', error, { teamId: args.teamId, searchTerm: args.searchTerm });
    throw new Error(`Failed to search tasks: ${error.message}`);
  }
}

// List members of a team
// Retrieves all members of a specified team
async function listMembers(args, userId, userGroups) {
  // Log start of members listing
  console.log('[LIST_MEMBERS] Starting members list:', { teamId: args.teamId, userId });
  
  // Validate teamId
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    // Check if user is member of the team
    const userMembership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!userMembership.Item) {
      throw new AuthorizationError('You are not a member of this team');
    }
    
    // Query all memberships for the team
    const members = await dynamodb.query({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }).promise();
    
    // Sort members: admins first, then by join date
    const sortedMembers = members.Items.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return new Date(a.joinedAt) - new Date(b.joinedAt);
    });
    
    // Log successful members retrieval
    logSuccess('LIST_MEMBERS', `Found ${sortedMembers.length} members`, { 
      teamId: args.teamId 
    });
    
    // Return sorted members
    return sortedMembers;
    
  } catch (error) {
    // Re-throw authorization errors
    if (error instanceof AuthorizationError) {
      throw error;
    }
    // Log and throw other errors
    logError('LIST_MEMBERS', error, { teamId: args.teamId, userId });
    throw new Error(`Failed to retrieve members: ${error.message}`);
  }
}

// Get user details
// Retrieves information about a specific user
async function getUser(args, userId) {
  // Log start of user retrieval
  console.log('[GET_USER] Getting user details:', { requestedUserId: args.userId, requesterId: userId });
  
  // Validate userId
  validateRequired(args?.userId, 'User ID');
  
  try {
    // Get user from DynamoDB
    const user = await dynamodb.get({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Key: { userId: args.userId }
    }).promise();
    
    // If user exists, return it
    if (user.Item) {
      logSuccess('GET_USER', 'User found in database', { userId: args.userId });
      return user.Item;
    }
    
    // Return default user object if not found
    const defaultUser = {
      userId: args.userId,
      email: args.userId,
      name: args.userId.includes('@') ? args.userId.split('@')[0] : args.userId, // Derive name from email
      createdAt: new Date().toISOString(),
      isDefault: true // Flag to indicate default user
    };
    
    console.log('[GET_USER] User not found in database, returning default user');
    return defaultUser;
    
  } catch (error) {
    // Log and throw error
    logError('GET_USER', error, { requestedUserId: args.userId });
    throw new Error('Failed to retrieve user information');
  }
}

// Enhanced notification system
// Sends notifications via SNS
async function sendNotification(subject, message, recipient, metadata = {}) {
  // Check if SNS topic is configured
  if (!process.env.SNS_TOPIC_ARN) {
    console.warn('[NOTIFICATION] SNS Topic ARN not configured, skipping notification');
    return;
  }
  
  try {
    // Prepare message attributes for SNS
    const messageAttributes = {
      email: { DataType: 'String', StringValue: recipient },
      action: { DataType: 'String', StringValue: metadata.action || 'notification' }
    };
    
    // Add metadata as message attributes
    Object.keys(metadata).forEach(key => {
      if (key !== 'action' && typeof metadata[key] === 'string') {
        messageAttributes[key] = { DataType: 'String', StringValue: metadata[key] };
      }
    });
    
    // Prepare SNS publish parameters
    const snsParams = {
      TopicArn: process.env.SNS_TOPIC_ARN,
      Subject: subject,
      Message: JSON.stringify({
        default: message,
        email: message,
        metadata: metadata
      }, null, 2),
      MessageStructure: 'json', // Use JSON message structure
      MessageAttributes: messageAttributes
    };
    
    // Publish notification
    await sns.publish(snsParams).promise();
    
    // Log successful notification
    console.log('[NOTIFICATION] Notification sent successfully:', {
      recipient,
      subject,
      action: metadata.action
    });
    
  } catch (error) {
    // Log notification failure but don't throw error to avoid breaking main operation
    console.error('[NOTIFICATION] Failed to send notification:', {
      error: error.message,
      recipient,
      subject,
      metadata
    });
  }
}