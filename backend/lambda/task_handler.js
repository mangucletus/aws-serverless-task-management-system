// Task Management System Lambda Handler
// Handles GraphQL operations: addMember, createTask, createTeam, listTasks, updateTask, listMembers

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});
const sns = new AWS.SNS({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Constants
const VALID_TASK_STATUSES = ['Not Started', 'In Progress', 'Completed'];
const VALID_ROLES = ['admin', 'member'];

// Utility function for consistent error logging
function logError(operation, error, context = {}) {
  console.error(`[${operation}] Error:`, {
    message: error.message,
    stack: error.stack,
    context
  });
}

// Utility function for success logging
function logSuccess(operation, result, context = {}) {
  console.log(`[${operation}] Success:`, {
    result: typeof result === 'object' ? JSON.stringify(result, null, 2) : result,
    context
  });
}

// Main handler for GraphQL resolvers
exports.handler = async (event) => {
  console.log('Lambda invocation started:', {
    timestamp: new Date().toISOString(),
    event: JSON.stringify(event, null, 2)
  });
  
  const { fieldName, arguments: args, identity } = event;
  
  // Validate required event properties
  if (!fieldName) {
    throw new Error('Missing fieldName in event');
  }
  
  if (!identity || !identity.sub) {
    throw new Error('Missing user identity in event');
  }
  
  const userId = identity.sub;
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
      case 'listTeams':
        result = await listTeams(userId);
        break;
      case 'listTasks':
        result = await listTasks(args, userId, userGroups);
        break;
      case 'listMembers':
        result = await listMembers(args, userId, userGroups);
        break;
      case 'getUser':
        result = await getUser(args, userId);
        break;
      default:
        throw new Error(`Unknown GraphQL field: ${fieldName}`);
    }
    
    logSuccess('HANDLER', `${fieldName} completed`, { 
      userId, 
      resultType: typeof result,
      resultCount: Array.isArray(result) ? result.length : 'N/A'
    });
    
    return result;
    
  } catch (err) {
    logError('HANDLER', err, { fieldName, userId, userGroups });
    
    // Throw a clean error message for GraphQL
    throw new Error(`${fieldName} failed: ${err.message}`);
  }
};

// Create a new team
async function createTeam(args, userId, userGroups) {
  console.log('[CREATE_TEAM] Starting team creation:', { args, userId });
  
  // Validate input
  if (!args || !args.name || typeof args.name !== 'string') {
    throw new Error('Team name is required and must be a string');
  }
  
  if (args.name.trim().length === 0) {
    throw new Error('Team name cannot be empty');
  }
  
  if (args.name.trim().length > 100) {
    throw new Error('Team name cannot exceed 100 characters');
  }
  
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
    // Use transaction to ensure atomicity
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
    
    await dynamodb.transactWrite(transactParams).promise();
    
    logSuccess('CREATE_TEAM', 'Team created successfully', { teamId, teamName: team.name });
    return team;
    
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new Error('Team creation failed due to duplicate data');
    }
    logError('CREATE_TEAM', error, { teamId, userId });
    throw new Error('Failed to create team');
  }
}

// Add a member to a team
async function addMember(args, userId, userGroups) {
  console.log('[ADD_MEMBER] Starting member addition:', { args, userId });
  
  // Validate input
  if (!args || !args.teamId || !args.email) {
    throw new Error('teamId and email are required');
  }
  
  if (typeof args.email !== 'string' || !args.email.includes('@')) {
    throw new Error('Valid email address is required');
  }
  
  try {
    // Check if current user is admin of the team
    const adminCheck = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!adminCheck.Item) {
      throw new Error('You are not a member of this team');
    }
    
    if (adminCheck.Item.role !== 'admin') {
      throw new Error('Only team admins can add members');
    }
    
    // Check if user is trying to add themselves
    if (args.email === userId) {
      throw new Error('You are already a member of this team');
    }
    
    // Check if member already exists
    const existingMember = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId: args.email }
    }).promise();
    
    if (existingMember.Item) {
      throw new Error('User is already a member of this team');
    }
    
    const membership = {
      teamId: args.teamId,
      userId: args.email, // Using email as userId
      role: 'member',
      joinedAt: new Date().toISOString(),
      addedBy: userId
    };
    
    await dynamodb.put({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Item: membership
    }).promise();
    
    // Send notification (non-blocking)
    try {
      if (process.env.SNS_TOPIC_ARN) {
        await sns.publish({
          TopicArn: process.env.SNS_TOPIC_ARN,
          Message: `You have been added to a team. Team ID: ${args.teamId}`,
          Subject: 'Task Management - Team Invitation',
          MessageAttributes: {
            email: { DataType: 'String', StringValue: args.email },
            teamId: { DataType: 'String', StringValue: args.teamId }
          }
        }).promise();
        console.log('[ADD_MEMBER] Notification sent successfully');
      }
    } catch (snsError) {
      console.warn('[ADD_MEMBER] SNS notification failed:', snsError.message);
      // Don't fail the operation if notification fails
    }
    
    logSuccess('ADD_MEMBER', 'Member added successfully', { 
      teamId: args.teamId, 
      newMember: args.email 
    });
    
    return membership;
    
  } catch (error) {
    logError('ADD_MEMBER', error, { teamId: args.teamId, email: args.email });
    throw error;
  }
}

// Create a new task
async function createTask(args, userId, userGroups) {
  console.log('[CREATE_TASK] Starting task creation:', { args, userId });
  
  // Validate input
  if (!args || !args.teamId || !args.title || !args.description) {
    throw new Error('teamId, title, and description are required');
  }
  
  if (args.title.trim().length === 0 || args.description.trim().length === 0) {
    throw new Error('Title and description cannot be empty');
  }
  
  if (args.title.trim().length > 200) {
    throw new Error('Task title cannot exceed 200 characters');
  }
  
  if (args.description.trim().length > 1000) {
    throw new Error('Task description cannot exceed 1000 characters');
  }
  
  // Validate deadline format if provided
  if (args.deadline) {
    const deadlineDate = new Date(args.deadline);
    if (isNaN(deadlineDate.getTime())) {
      throw new Error('Invalid deadline format. Use ISO date format');
    }
  }
  
  try {
    // Check if user is admin of the team
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new Error('You must be a team member to create tasks');
    }
    
    if (membership.Item.role !== 'admin') {
      throw new Error('Only team admins can create tasks');
    }
    
    // If assignedTo is provided, verify they are team members
    if (args.assignedTo) {
      const assigneeCheck = await dynamodb.get({
        TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
        Key: { teamId: args.teamId, userId: args.assignedTo }
      }).promise();
      
      if (!assigneeCheck.Item) {
        throw new Error('Cannot assign task to user who is not a team member');
      }
    }
    
    const taskId = uuidv4();
    const task = {
      teamId: args.teamId,
      taskId,
      title: args.title.trim(),
      description: args.description.trim(),
      assignedTo: args.assignedTo || null,
      status: 'Not Started',
      deadline: args.deadline || null,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };
    
    await dynamodb.put({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Item: task
    }).promise();
    
    // Send notification if task is assigned (non-blocking)
    if (args.assignedTo && process.env.SNS_TOPIC_ARN) {
      try {
        await sns.publish({
          TopicArn: process.env.SNS_TOPIC_ARN,
          Message: `New task assigned to you: "${args.title}"`,
          Subject: 'Task Management - New Task Assignment',
          MessageAttributes: {
            email: { DataType: 'String', StringValue: args.assignedTo },
            taskId: { DataType: 'String', StringValue: taskId },
            teamId: { DataType: 'String', StringValue: args.teamId }
          }
        }).promise();
        console.log('[CREATE_TASK] Assignment notification sent');
      } catch (snsError) {
        console.warn('[CREATE_TASK] SNS notification failed:', snsError.message);
      }
    }
    
    logSuccess('CREATE_TASK', 'Task created successfully', { 
      taskId, 
      title: task.title,
      assignedTo: task.assignedTo 
    });
    
    return task;
    
  } catch (error) {
    logError('CREATE_TASK', error, { teamId: args.teamId, title: args.title });
    throw error;
  }
}

// Update task status
async function updateTask(args, userId, userGroups) {
  console.log('[UPDATE_TASK] Starting task update:', { args, userId });
  
  // Validate input
  if (!args || !args.teamId || !args.taskId || !args.status) {
    throw new Error('teamId, taskId, and status are required');
  }
  
  if (!VALID_TASK_STATUSES.includes(args.status)) {
    throw new Error(`Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(', ')}`);
  }
  
  try {
    // Get current task
    const taskResult = await dynamodb.get({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      Key: { teamId: args.teamId, taskId: args.taskId }
    }).promise();
    
    if (!taskResult.Item) {
      throw new Error('Task not found');
    }
    
    const task = taskResult.Item;
    
    // Check user permissions
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new Error('You must be a team member to update tasks');
    }
    
    // Allow updates if user is assigned to task OR is team admin
    const canUpdate = task.assignedTo === userId || membership.Item.role === 'admin';
    
    if (!canUpdate) {
      throw new Error('You can only update tasks assigned to you or if you are a team admin');
    }
    
    // Don't update if status is the same
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
    
    const result = await dynamodb.update(updateParams).promise();
    
    logSuccess('UPDATE_TASK', 'Task updated successfully', { 
      taskId: args.taskId, 
      oldStatus: task.status,
      newStatus: args.status
    });
    
    return result.Attributes;
    
  } catch (error) {
    logError('UPDATE_TASK', error, { teamId: args.teamId, taskId: args.taskId });
    throw error;
  }
}

// List teams for a user
async function listTeams(userId) {
  console.log('[LIST_TEAMS] Starting teams list for user:', userId);
  
  try {
    const memberships = await dynamodb.query({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }).promise();
    
    if (!memberships.Items || memberships.Items.length === 0) {
      console.log('[LIST_TEAMS] No team memberships found');
      return [];
    }
    
    // Get team details for each membership
    const teamPromises = memberships.Items.map(async (membership) => {
      try {
        const team = await dynamodb.get({
          TableName: process.env.DYNAMODB_TEAMS_TABLE,
          Key: { teamId: membership.teamId }
        }).promise();
        return team.Item;
      } catch (error) {
        console.warn(`[LIST_TEAMS] Failed to get team ${membership.teamId}:`, error.message);
        return null;
      }
    });
    
    const teams = await Promise.all(teamPromises);
    
    // Filter out null teams and add user role info
    const validTeams = teams
      .filter(team => team !== null && team !== undefined)
      .map(team => {
        const membership = memberships.Items.find(m => m.teamId === team.teamId);
        return {
          ...team,
          userRole: membership ? membership.role : 'unknown'
        };
      });
    
    logSuccess('LIST_TEAMS', `Found ${validTeams.length} teams`, { userId });
    return validTeams;
    
  } catch (error) {
    logError('LIST_TEAMS', error, { userId });
    throw new Error('Failed to retrieve teams');
  }
}

// List tasks for a team
async function listTasks(args, userId, userGroups) {
  console.log('[LIST_TASKS] Starting tasks list:', { teamId: args.teamId, userId });
  
  if (!args || !args.teamId) {
    throw new Error('teamId is required');
  }
  
  try {
    // Check if user is member of the team
    const membership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!membership.Item) {
      throw new Error('You are not a member of this team');
    }
    
    const tasks = await dynamodb.query({
      TableName: process.env.DYNAMODB_TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': args.teamId }
    }).promise();
    
    let filteredTasks;
    
    if (membership.Item.role === 'admin') {
      // Admins see all tasks
      filteredTasks = tasks.Items;
    } else {
      // Members see tasks assigned to them or unassigned tasks
      filteredTasks = tasks.Items.filter(task => 
        task.assignedTo === userId || 
        task.assignedTo === null || 
        task.assignedTo === undefined
      );
    }
    
    // Sort tasks by creation date (newest first)
    filteredTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    logSuccess('LIST_TASKS', `Found ${filteredTasks.length} tasks`, { 
      teamId: args.teamId, 
      userRole: membership.Item.role 
    });
    
    return filteredTasks;
    
  } catch (error) {
    logError('LIST_TASKS', error, { teamId: args.teamId, userId });
    throw error;
  }
}

// List members of a team
async function listMembers(args, userId, userGroups) {
  console.log('[LIST_MEMBERS] Starting members list:', { teamId: args.teamId, userId });
  
  if (!args || !args.teamId) {
    throw new Error('teamId is required');
  }
  
  try {
    // Check if user is member of the team
    const userMembership = await dynamodb.get({
      TableName: process.env.DYNAMODB_MEMBERSHIPS_TABLE,
      Key: { teamId: args.teamId, userId }
    }).promise();
    
    if (!userMembership.Item) {
      throw new Error('You are not a member of this team');
    }
    
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
    
    logSuccess('LIST_MEMBERS', `Found ${sortedMembers.length} members`, { 
      teamId: args.teamId 
    });
    
    return sortedMembers;
    
  } catch (error) {
    logError('LIST_MEMBERS', error, { teamId: args.teamId, userId });
    throw error;
  }
}

// Get user details
async function getUser(args, userId) {
  console.log('[GET_USER] Getting user details:', { requestedUserId: args.userId, requesterId: userId });
  
  if (!args || !args.userId) {
    throw new Error('userId is required');
  }
  
  try {
    const user = await dynamodb.get({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Key: { userId: args.userId }
    }).promise();
    
    if (user.Item) {
      logSuccess('GET_USER', 'User found in database', { userId: args.userId });
      return user.Item;
    }
    
    // Return a default user object if not found in Users table
    const defaultUser = {
      userId: args.userId,
      email: args.userId,
      name: args.userId.includes('@') ? args.userId.split('@')[0] : args.userId,
      isDefault: true
    };
    
    console.log('[GET_USER] User not found in database, returning default user');
    return defaultUser;
    
  } catch (error) {
    logError('GET_USER', error, { requestedUserId: args.userId });
    throw new Error('Failed to retrieve user information');
  }
}