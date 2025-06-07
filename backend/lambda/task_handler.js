/**
 * Task Management System Lambda Handler
 * 
 * This is an AWS Lambda function that serves as a GraphQL resolver for a team-based
 * task management system. It handles CRUD operations for teams, tasks, and team memberships
 * using DynamoDB for data storage, SNS for notifications, and Cognito for user management.
 * 
 * Key Features:
 * - Team creation and management with role-based access control
 * - Task lifecycle management (create, update, delete, list, search)
 * - Team membership management with admin/member roles
 * - Real-time notifications via SNS
 * - Comprehensive validation and error handling
 * - Transaction support for data consistency
 */

// AWS SDK v3 imports for DynamoDB operations
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

// AWS SDK v3 imports for SNS notifications
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// AWS SDK v3 imports for Cognito user management
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');

// UUID library for generating unique identifiers
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB client with region configuration
const dynamoDbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});
// Create document client for easier JSON operations
const dynamodb = DynamoDBDocumentClient.from(dynamoDbClient);

// Initialize SNS client for sending notifications
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Initialize Cognito client for user pool operations
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Business rule constants for validation
const VALID_TASK_STATUSES = ['Not Started', 'In Progress', 'Completed'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High'];
const VALID_ROLES = ['admin', 'member'];

/**
 * Custom error classes for better error handling and categorization
 * These errors provide specific error types that can be caught and handled differently
 */

// Thrown when input validation fails (e.g., missing required fields, invalid format)
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.errorType = 'ValidationError';
  }
}

// Thrown when user doesn't have permission to perform an action
class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.errorType = 'AuthorizationError';
  }
}

// Thrown when requested resource doesn't exist
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.errorType = 'NotFoundError';
  }
}

/**
 * Centralized error logging function with structured output
 * Logs errors with context information for better debugging and monitoring
 * 
 * @param {string} operation - The operation that failed
 * @param {Error} error - The error object
 * @param {Object} context - Additional context information
 */
function logError(operation, error, context = {}) {
  console.error(`[${operation}] Error:`, {
    message: error.message,
    errorType: error.errorType || error.name,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
}

/**
 * Centralized success logging function with structured output
 * Logs successful operations with result information for monitoring
 * 
 * @param {string} operation - The operation that succeeded
 * @param {*} result - The operation result
 * @param {Object} context - Additional context information
 */
function logSuccess(operation, result, context = {}) {
  console.log(`[${operation}] Success:`, {
    result: typeof result === 'object' ? JSON.stringify(result, null, 2) : result,
    context,
    timestamp: new Date().toISOString()
  });
}

/**
 * Validates that a required field is present and not empty
 * Throws ValidationError if the field is missing or empty
 * 
 * @param {*} value - The value to validate
 * @param {string} fieldName - The name of the field for error messages
 */
function validateRequired(value, fieldName) {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    throw new ValidationError(`${fieldName} is required and cannot be empty`);
  }
}

/**
 * Validates email format using regex
 * Throws ValidationError if email format is invalid
 * 
 * @param {string} email - The email to validate
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

/**
 * Validates string length is within specified bounds
 * Throws ValidationError if length is outside the specified range
 * 
 * @param {string} value - The string to validate
 * @param {string} fieldName - The name of the field for error messages
 * @param {number} minLength - Minimum allowed length
 * @param {number} maxLength - Maximum allowed length
 */
function validateLength(value, fieldName, minLength, maxLength) {
  if (value && typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue.length < minLength || trimmedValue.length > maxLength) {
      throw new ValidationError(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
    }
  }
}

/**
 * Extracts and normalizes user ID from Cognito identity object
 * Tries multiple possible fields in order of preference to find a valid user ID
 * This handles different Cognito configurations and identity formats
 * 
 * @param {Object} identity - Cognito identity object from the event
 * @returns {string} - Normalized user ID
 * @throws {AuthorizationError} - If no valid user ID can be found
 */
function normalizeUserId(identity) {
  console.log('[NORMALIZE_USER_ID] Processing identity:', JSON.stringify(identity, null, 2));
  
  // Try different possible user ID fields in order of preference
  const possibleIds = [
    identity.sub,              // Primary Cognito user identifier
    identity.username,         // Username field
    identity['cognito:username'], // Cognito-specific username
    identity.email,            // Email as fallback
    identity['custom:email']   // Custom email attribute
  ];
  
  // Find the first valid non-empty ID
  for (let i = 0; i < possibleIds.length; i++) {
    const id = possibleIds[i];
    if (id && typeof id === 'string' && id.trim()) {
      const normalizedId = id.trim();
      console.log(`[NORMALIZE_USER_ID] Selected ID from position ${i}: ${normalizedId}`);
      return normalizedId;
    }
  }
  
  // If no valid ID found, throw authorization error
  console.error('[NORMALIZE_USER_ID] No valid user ID found in identity:', identity);
  throw new AuthorizationError('Unable to determine user identity');
}

/**
 * Enhanced team membership validation function
 * Validates that a user is a member of a team and optionally has a specific role
 * This is a critical security function that prevents unauthorized access to team resources
 * 
 * @param {string} teamId - The team ID to validate membership for
 * @param {string} userId - The user ID to check membership for
 * @param {string|null} requiredRole - Optional role requirement ('admin' or 'member')
 * @returns {Object} - Object containing team info, membership info, and admin status
 * @throws {NotFoundError} - If team doesn't exist
 * @throws {AuthorizationError} - If user is not a member or doesn't have required role
 */
async function validateTeamMembership(teamId, userId, requiredRole = null) {
  console.log(`[VALIDATE_TEAM_MEMBERSHIP] Checking membership for user ${userId} in team ${teamId}, required role: ${requiredRole}`);
  
  try {
    // First, verify the team exists
    const teamResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TEAMS_TABLE,
      Key: { teamId }
    }));
    
    if (!teamResult.Item) {
      console.log(`[VALIDATE_TEAM_MEMBERSHIP] Team ${teamId} not found`);
      throw new NotFoundError('Team not found');
    }
    
    // Then check if user is a member of the team
    const membershipResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId, userId }
    }));
    
    if (!membershipResult.Item) {
      console.log(`[VALIDATE_TEAM_MEMBERSHIP] User ${userId} is not a member of team ${teamId}`);
      throw new AuthorizationError('You are not a member of this team');
    }
    
    const membership = membershipResult.Item;
    console.log(`[VALIDATE_TEAM_MEMBERSHIP] User role: ${membership.role}`);
    
    // Check role requirement if specified
    if (requiredRole && membership.role !== requiredRole) {
      console.log(`[VALIDATE_TEAM_MEMBERSHIP] User role ${membership.role} does not match required role ${requiredRole}`);
      throw new AuthorizationError(`This action requires ${requiredRole} role`);
    }
    
    // Return comprehensive membership information
    return {
      team: teamResult.Item,
      membership: membership,
      isAdmin: membership.role === 'admin'
    };
    
  } catch (error) {
    // Re-throw known errors, wrap unexpected errors
    if (error instanceof NotFoundError || error instanceof AuthorizationError) {
      throw error;
    }
    console.error(`[VALIDATE_TEAM_MEMBERSHIP] Unexpected error:`, error);
    throw new Error(`Failed to validate team membership: ${error.message}`);
  }
}

/**
 * Sends notifications via SNS
 * Used to notify users about important events like task assignments, status changes, etc.
 * Failures are logged but don't stop the main operation
 * 
 * @param {string} subject - The notification subject
 * @param {string} message - The notification message
 * @param {string} recipientId - The user ID to send notification to
 * @param {Object} metadata - Additional metadata for the notification
 */
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
    // Log error but don't fail the main operation
    logError('SEND_NOTIFICATION', error, { subject, recipientId });
    console.warn('Failed to send notification, continuing execution');
  }
}

/**
 * Main Lambda handler function
 * This is the entry point for all GraphQL operations
 * It extracts the operation type and user identity, then routes to the appropriate handler
 * 
 * @param {Object} event - The Lambda event object containing GraphQL context
 * @returns {*} - The result of the GraphQL operation
 */
exports.handler = async (event) => {
  console.log('Lambda invocation started:', {
    timestamp: new Date().toISOString(),
    event: JSON.stringify(event, null, 2)
  });
  
  try {
    let fieldName, args, identity;
    
    // Extract operation details from various possible event structures
    // Different GraphQL setups may structure the event differently
    if (event.info && event.info.fieldName) {
      // AppSync direct resolver format
      fieldName = event.info.fieldName;
      args = event.arguments || {};
      identity = event.identity;
    } else if (event.fieldName) {
      // Simple field-based format
      fieldName = event.fieldName;
      args = event.arguments || {};
      identity = event.identity;
    } else if (event.payload) {
      // Payload-wrapped format (possibly from API Gateway)
      fieldName = event.payload.fieldName;
      args = event.payload.arguments ? JSON.parse(event.payload.arguments) : {};
      identity = event.payload.identity ? JSON.parse(event.payload.identity) : null;
    } else {
      // Alternative format with operation/field names
      fieldName = event.operation || event.field;
      args = event.variables || event.arguments || {};
      identity = event.requestContext?.identity || event.identity;
    }
    
    console.log('Extracted event data:', {
      fieldName,
      args,
      identity: identity ? 'present' : 'missing',
      identityKeys: identity ? Object.keys(identity) : []
    });
    
    // Validate that we have the required operation information
    if (!fieldName) {
      throw new ValidationError('Missing fieldName in event - unable to determine operation');
    }
    
    // Validate that user is authenticated
    if (!identity) {
      throw new AuthorizationError('Authentication required - missing user identity');
    }
    
    // Extract and normalize user ID from the identity
    let userId;
    try {
      userId = normalizeUserId(identity);
      console.log(`[HANDLER] Normalized user ID: ${userId}`);
    } catch (error) {
      logError('USER_ID_NORMALIZATION', error, { identity });
      throw error;
    }
    
    // Extract user groups from Cognito (for potential future role-based features)
    const userGroups = identity['cognito:groups'] || [];
    
    console.log('Processing request:', {
      fieldName,
      userId,
      userGroups,
      argsCount: args ? Object.keys(args).length : 0
    });

    let result;
    
    // Route to appropriate handler based on GraphQL field name
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
      case 'getTeam':
        result = await getTeam(args, userId, userGroups);
        break;
      case 'getUserTeams':
        result = await getUserTeams(userId);
        break;
      default:
        throw new ValidationError(`Unknown GraphQL field: ${fieldName}`);
    }
    
    // Log successful completion
    logSuccess('HANDLER', `${fieldName} completed`, { 
      userId, 
      resultType: typeof result,
      resultCount: Array.isArray(result) ? result.length : 'N/A'
    });
    
    return result;
    
  } catch (err) {
    // Log error with context
    logError('HANDLER', err, { 
      fieldName: fieldName || 'unknown', 
      userId: userId || 'unknown',
      eventStructure: Object.keys(event || {})
    });
    
    // Re-throw known error types, wrap unknown errors
    if (err instanceof ValidationError || err instanceof AuthorizationError || err instanceof NotFoundError) {
      throw err;
    }
    
    const error = new Error(`Operation failed: ${err.message}`);
    error.errorType = 'InternalError';
    throw error;
  }
};

/**
 * Creates a new team with the requesting user as admin
 * This operation uses a DynamoDB transaction to ensure both team and membership records are created atomically
 * 
 * @param {Object} args - GraphQL arguments containing team details
 * @param {string} userId - ID of the user creating the team
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - The created team with user role information
 */
async function createTeam(args, userId, userGroups) {
  console.log('[CREATE_TEAM] Starting team creation:', { args, userId });
  
  // Validate required fields
  validateRequired(args?.name, 'Team name');
  validateLength(args.name, 'Team name', 1, 100);
  
  // Generate unique identifiers and timestamp
  const teamId = uuidv4();
  const timestamp = new Date().toISOString();
  
  // Create team record
  const team = {
    teamId,
    name: args.name.trim(),
    adminId: userId,  // The creator becomes the admin
    createdAt: timestamp
  };
  
  // Create membership record for the admin
  const membership = {
    teamId,
    userId,
    role: 'admin',
    joinedAt: timestamp
  };
  
  console.log('[CREATE_TEAM] Creating team and membership:', {
    team,
    membership
  });
  
  try {
    // Use transaction to ensure both records are created or neither is created
    const transactParams = {
      TransactItems: [
        {
          Put: {
            TableName: process.env.DYNAMODB_TEAMS_TABLE,
            Item: team,
            // Prevent overwriting existing team with same ID
            ConditionExpression: 'attribute_not_exists(teamId)'
          }
        },
        {
          Put: {
            TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
            Item: membership,
            // Prevent duplicate membership records
            ConditionExpression: 'attribute_not_exists(teamId) AND attribute_not_exists(userId)'
          }
        }
      ]
    };
    
    await dynamodb.send(new TransactWriteCommand(transactParams));
    
    // Send welcome notification to the team creator
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
    
    logSuccess('CREATE_TEAM', 'Team created successfully', { teamId, teamName: team.name, userId });
    
    // Return team data with user role information
    return {
      teamId: team.teamId,
      name: team.name,
      adminId: team.adminId,
      createdAt: team.createdAt,
      userRole: 'admin'
    };
    
  } catch (error) {
    // Handle transaction condition failures
    if (error.name === 'ConditionalCheckFailedException') {
      throw new ValidationError('Team creation failed - duplicate data detected');
    }
    logError('CREATE_TEAM', error, { teamId, userId });
    throw new Error(`Failed to create team: ${error.message}`);
  }
}

/**
 * Adds a new member to an existing team
 * Only team admins can add members. The function looks up users by email in Cognito
 * 
 * @param {Object} args - GraphQL arguments containing teamId and email
 * @param {string} userId - ID of the user adding the member (must be admin)
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - The created membership record
 */
async function addMember(args, userId, userGroups) {
  console.log('[ADD_MEMBER] Starting member addition:', { args, userId });
  
  // Validate input parameters
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.email, 'Email');
  validateEmail(args.email);
  
  try {
    // Verify user is admin of the team
    const { team } = await validateTeamMembership(args.teamId, userId, 'admin');
    
    // Look up the user by email in Cognito User Pool
    let memberUserId;
    try {
      const listUsersParams = {
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Filter: `email = "${args.email}"`,  // Cognito filter syntax
        Limit: 1
      };
      
      const listUsersCommand = new ListUsersCommand(listUsersParams);
      const listUsersResponse = await cognitoClient.send(listUsersCommand);
      
      // Extract user ID from Cognito response
      if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
        const userAttributes = listUsersResponse.Users[0].Attributes;
        const subAttr = userAttributes.find(attr => attr.Name === 'sub');
        if (subAttr && subAttr.Value) {
          memberUserId = subAttr.Value;
        } else {
          throw new ValidationError('User sub not found');
        }
      } else {
        throw new ValidationError('User with this email does not exist');
      }
    } catch (cognitoError) {
      logError('ADD_MEMBER_COGNITO', cognitoError, { email: args.email });
      if (cognitoError instanceof ValidationError) {
        throw cognitoError;
      }
      throw new Error('Failed to verify user email');
    }
    
    // Check if user is already a member of the team
    const existingMember = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId: memberUserId }
    }));
    
    if (existingMember.Item) {
      throw new ValidationError('User is already a member of this team');
    }
    
    // Create the new membership record
    const membership = {
      teamId: args.teamId,
      userId: memberUserId,
      role: 'member',  // New members start as regular members
      joinedAt: new Date().toISOString(),
      addedBy: userId  // Track who added this member
    };
    
    await dynamodb.send(new PutCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Item: membership
    }));
    
    // Send invitation notification to the new member
    await sendNotification(
      'Team Invitation',
      `You have been added to the team "${team.name}". Start collaborating on tasks now!`,
      memberUserId,
      {
        teamId: args.teamId,
        teamName: team.name,
        invitedBy: userId,
        action: 'team_invitation'
      }
    );
    
    logSuccess('ADD_MEMBER', 'Member added successfully', { 
      teamId: args.teamId, 
      newMember: memberUserId,
      teamName: team.name
    });
    
    return membership;
    
  } catch (error) {
    // Re-throw known errors, wrap others
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('ADD_MEMBER', error, { teamId: args.teamId, email: args.email });
    throw new Error(`Failed to add member: ${error.message}`);
  }
}

/**
 * Creates a new task within a team
 * Only team admins can create tasks. Tasks can optionally be assigned to team members
 * 
 * @param {Object} args - GraphQL arguments containing task details
 * @param {string} userId - ID of the user creating the task (must be admin)
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - The created task record
 */
async function createTask(args, userId, userGroups) {
  console.log('[CREATE_TASK] Starting task creation:', { args, userId });
  
  // Validate required fields
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.title, 'Task title');
  validateRequired(args?.description, 'Task description');
  validateLength(args.title, 'Task title', 1, 200);
  validateLength(args.description, 'Task description', 1, 1000);
  
  // Validate optional priority field
  if (args.priority && !VALID_PRIORITIES.includes(args.priority)) {
    throw new ValidationError(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  
  // Validate optional deadline field
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
    // Verify user is admin of the team
    const { team } = await validateTeamMembership(args.teamId, userId, 'admin');
    
    // If task is being assigned, verify assignee is a team member
    if (args.assignedTo) {
      const assigneeCheck = await dynamodb.send(new GetCommand({
        TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
        Key: { teamId: args.teamId, userId: args.assignedTo }
      }));
      
      if (!assigneeCheck.Item) {
        throw new ValidationError('Cannot assign task to user who is not a team member');
      }
    }
    
    // Generate task ID and create task record
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const task = {
      teamId: args.teamId,
      taskId,
      title: args.title.trim(),
      description: args.description.trim(),
      assignedTo: args.assignedTo || null,
      status: 'Not Started',  // Default status for new tasks
      priority: args.priority || 'Medium',  // Default priority
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
    
    // Send assignment notification if task is assigned to someone
    if (args.assignedTo) {
      await sendNotification(
        'New Task Assignment',
        `You have been assigned a new task: "${args.title}" in team "${team.name}". Priority: ${task.priority}`,
        args.assignedTo,
        {
          taskId,
          taskTitle: args.title,
          teamId: args.teamId,
          teamName: team.name,
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

/**
 * Updates the status of an existing task
 * Users can update tasks assigned to them, admins can update any team task
 * 
 * @param {Object} args - GraphQL arguments containing teamId, taskId, and new status
 * @param {string} userId - ID of the user updating the task
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - The updated task record
 */
async function updateTask(args, userId, userGroups) {
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
    // Verify user is member of the team
    const { team, membership } = await validateTeamMembership(args.teamId, userId);
    
    // Get the existing task
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    const oldStatus = task.status;
    
    // Check if user has permission to update this task
    // Users can update tasks assigned to them, admins can update any task
    const canUpdate = task.assignedTo === userId || membership.role === 'admin';
    
    if (!canUpdate) {
      throw new AuthorizationError('You can only update tasks assigned to you or if you are a team admin');
    }
    
    const timestamp = new Date().toISOString();
    
    // Update the task status
    const updateParams = {
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, updatedBy = :updatedBy',
      ExpressionAttributeNames: {
        '#status': 'status'  // 'status' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: {
        ':status': args.status,
        ':updatedAt': timestamp,
        ':updatedBy': userId
      },
      ReturnValues: 'ALL_NEW'  // Return the updated item
    };
    
    const result = await dynamodb.send(new UpdateCommand(updateParams));
    
    // Send notification if status changed and task is assigned
    if (task.assignedTo && oldStatus !== args.status) {
      await sendNotification(
        'Task Status Updated',
        `The task "${task.title}" in team "${team.name}" has been updated to "${args.status}" by ${userId}.`,
        task.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          teamId: args.teamId,
          teamName: team.name,
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

/**
 * Updates detailed task information (title, description, priority, deadline, assignment)
 * Only team admins can update task details. This is separate from status updates for security
 * 
 * @param {Object} args - GraphQL arguments containing task details to update
 * @param {string} userId - ID of the user updating the task (must be admin)
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - The updated task record
 */
async function updateTaskDetails(args, userId, userGroups) {
  console.log('[UPDATE_TASK_DETAILS] Starting task details update:', { args, userId });
  
  // Validate required identifiers
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  // Validate optional fields if provided
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
    // Verify user is admin of the team (only admins can update task details)
    const { team } = await validateTeamMembership(args.teamId, userId, 'admin');
    
    // Get the existing task to verify it exists
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    
    // If reassigning task, verify new assignee is a team member
    if (args.assignedTo) {
      const assigneeCheck = await dynamodb.send(new GetCommand({
        TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
        Key: { teamId: args.teamId, userId: args.assignedTo }
      }));
      
      if (!assigneeCheck.Item && args.assignedTo !== null) {
        throw new ValidationError('Cannot assign task to user who is not a team member');
      }
    }
    
    // Build dynamic update expression based on provided fields
    const timestamp = new Date().toISOString();
    let updateExpression = 'SET updatedAt = :updatedAt, updatedBy = :updatedBy';
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':updatedAt': timestamp,
      ':updatedBy': userId
    };
    
    // Add each provided field to the update expression
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
    
    // Send notification if task was reassigned
    if (args.assignedTo && args.assignedTo !== task.assignedTo) {
      await sendNotification(
        'Task Reassigned',
        `The task "${task.title}" in team "${team.name}" has been reassigned to you.`,
        args.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          teamId: args.teamId,
          teamName: team.name,
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

/**
 * Deletes a task from a team
 * Only team admins can delete tasks. Sends notification to assignee if task was assigned
 * 
 * @param {Object} args - GraphQL arguments containing teamId and taskId
 * @param {string} userId - ID of the user deleting the task (must be admin)
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - Success confirmation
 */
async function deleteTask(args, userId, userGroups) {
  console.log('[DELETE_TASK] Starting task deletion:', { args, userId });
  
  // Validate required parameters
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.taskId, 'Task ID');
  
  try {
    // Verify user is admin of the team (only admins can delete tasks)
    const { team } = await validateTeamMembership(args.teamId, userId, 'admin');
    
    // Get the task before deletion to check if it exists and for notification purposes
    const taskResult = await dynamodb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    if (!taskResult.Item) {
      throw new NotFoundError('Task not found');
    }
    
    const task = taskResult.Item;
    
    // Delete the task
    await dynamodb.send(new DeleteCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }));
    
    // Send notification to assignee if task was assigned
    if (task.assignedTo) {
      await sendNotification(
        'Task Deleted',
        `The task "${task.title}" in team "${team.name}" has been deleted.`,
        task.assignedTo,
        {
          taskId: args.taskId,
          taskTitle: task.title,
          teamId: args.teamId,
          teamName: team.name,
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

/**
 * Lists all teams that a user is a member of
 * Returns teams with the user's role in each team
 * 
 * @param {string} userId - ID of the user whose teams to list
 * @returns {Array} - Array of team objects with user role information
 */
async function listTeams(userId) {
  console.log('[LIST_TEAMS] Starting team list for user:', userId);
  
  try {
    // Query memberships table using GSI to find all teams user belongs to
    const memberships = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      IndexName: 'userId-index',  // GSI on userId
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));
    
    console.log('[LIST_TEAMS] Found memberships:', memberships.Items?.length || 0);
    
    if (!memberships.Items || memberships.Items.length === 0) {
      console.log('[LIST_TEAMS] No team memberships found for user:', userId);
      return [];
    }
    
    // Extract team IDs from memberships
    const teamIds = memberships.Items.map(item => item.teamId);
    console.log('[LIST_TEAMS] Team IDs to fetch:', teamIds);
    
    // Fetch team details for each team (batch operations could be optimized here)
    const teams = [];
    for (const teamId of teamIds) {
      const teamResult = await dynamodb.send(new GetCommand({
        TableName: process.env.DYNAMODB_TEAMS_TABLE,
        Key: { teamId }
      }));
      
      if (teamResult.Item) {
        // Find corresponding membership to get user role
        const membership = memberships.Items.find(m => m.teamId === teamId);
        teams.push({
          ...teamResult.Item,
          userRole: membership.role  // Add user's role in this team
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

/**
 * Lists all tasks in a specific team
 * Only team members can view team tasks
 * 
 * @param {Object} args - GraphQL arguments containing teamId
 * @param {string} userId - ID of the user requesting the task list
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Array} - Array of task objects
 */
async function listTasks(args, userId, userGroups) {
  console.log('[LIST_TASKS] Starting task list:', { args, userId });
  
  // Validate required parameters
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    // Verify user is member of the team
    await validateTeamMembership(args.teamId, userId);
    
    // Query all tasks for the team
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
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('LIST_TASKS', error, { teamId: args.teamId });
    throw new Error(`Failed to list tasks: ${error.message}`);
  }
}

/**
 * Searches for tasks within a team based on title and description
 * Performs case-insensitive text matching on task title and description
 * Only team members can search team tasks
 * 
 * @param {Object} args - GraphQL arguments containing teamId and search query
 * @param {string} userId - ID of the user performing the search
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Array} - Array of matching task objects
 */
async function searchTasks(args, userId, userGroups) {
  console.log('[SEARCH_TASKS] Starting task search:', { args, userId });
  
  // Validate required parameters
  validateRequired(args?.teamId, 'Team ID');
  validateRequired(args?.query, 'Search query');
  validateLength(args.query, 'Search query', 1, 200);
  
  try {
    // Verify user is member of the team
    await validateTeamMembership(args.teamId, userId);
    
    // Get all tasks for the team (in production, consider using DynamoDB search capabilities)
    const tasks = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: {
        ':teamId': args.teamId
      }
    }));
    
    // Perform client-side filtering (could be optimized with DynamoDB full-text search)
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
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('SEARCH_TASKS', error, { teamId: args.teamId, query: args.query });
    throw new Error(`Failed to search tasks: ${error.message}`);
  }
}

/**
 * Lists all members of a specific team
 * Only team members can view the member list
 * 
 * @param {Object} args - GraphQL arguments containing teamId
 * @param {string} userId - ID of the user requesting the member list
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Array} - Array of membership objects
 */
async function listMembers(args, userId, userGroups) {
  console.log('[LIST_MEMBERS] Starting member list:', { args, userId });
  
  // Validate required parameters
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    // Verify user is member of the team
    await validateTeamMembership(args.teamId, userId);
    
    // Query all memberships for the team
    const members = await dynamodb.send(new QueryCommand({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: {
        ':teamId': args.teamId
      }
    }));
    
    console.log('[LIST_MEMBERS] Found members:', members.Items?.length || 0);
    
    logSuccess('LIST_MEMBERS', 'Members retrieved successfully', { 
      teamId: args.teamId, 
      memberCount: members.Items?.length || 0 
    });
    
    return members.Items || [];
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('LIST_MEMBERS', error, { teamId: args.teamId });
    throw new Error(`Failed to list members: ${error.message}`);
  }
}

/**
 * Retrieves user information from the users table
 * Users can get their own info, or info for any user ID (for member lookups)
 * 
 * @param {Object} args - GraphQL arguments containing optional userId
 * @param {string} userId - ID of the requesting user
 * @returns {Object} - User information object
 */
async function getUser(args, userId) {
  console.log('[GET_USER] Starting user retrieval:', { args, userId });
  
  // Use provided userId or default to requesting user's ID
  const targetUserId = args?.userId || userId;
  
  try {
    // Fetch user record from users table
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

/**
 * Retrieves detailed information about a specific team
 * Only team members can view team details
 * Returns team info along with user's role and admin status
 * 
 * @param {Object} args - GraphQL arguments containing teamId
 * @param {string} userId - ID of the user requesting team details
 * @param {Array} userGroups - Cognito groups the user belongs to
 * @returns {Object} - Team object with user role information
 */
async function getTeam(args, userId, userGroups) {
  console.log('[GET_TEAM] Starting team retrieval:', { args, userId });
  
  // Validate required parameters
  validateRequired(args?.teamId, 'Team ID');
  
  try {
    // Verify user is member of the team and get membership details
    const { team, membership } = await validateTeamMembership(args.teamId, userId);
    
    // Combine team data with user's role information
    const result = {
      ...team,
      userRole: membership.role,
      isAdmin: membership.role === 'admin'
    };
    
    logSuccess('GET_TEAM', 'Team retrieved successfully', { 
      teamId: args.teamId,
      userRole: membership.role
    });
    
    return result;
    
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthorizationError || error instanceof NotFoundError) {
      throw error;
    }
    logError('GET_TEAM', error, { teamId: args.teamId });
    throw new Error(`Failed to get team: ${error.message}`);
  }
}

/**
 * Retrieves all teams that a user belongs to
 * This is an alias for listTeams with a more descriptive name
 * 
 * @param {string} userId - ID of the user whose teams to retrieve
 * @returns {Array} - Array of team objects with user role information
 */
async function getUserTeams(userId) {
  console.log('[GET_USER_TEAMS] Starting user teams retrieval:', { userId });
  
  try {
    // Reuse the listTeams function implementation
    return await listTeams(userId);
    
  } catch (error) {
    logError('GET_USER_TEAMS', error, { userId });
    throw new Error(`Failed to get user teams: ${error.message}`);
  }
}