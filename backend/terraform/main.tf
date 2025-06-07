# =============================================================================
# TASK MANAGEMENT SYSTEM - TERRAFORM INFRASTRUCTURE
# =============================================================================
# This Terraform configuration deploys a complete serverless task management 
# system on AWS with the following components:
# - Cognito for user authentication and authorization
# - DynamoDB for data storage with optimized access patterns
# - Lambda function for business logic processing
# - AppSync for GraphQL API with real-time capabilities
# - S3 for static website hosting
# - SNS for notification delivery
# - CloudWatch for logging and monitoring
# - IAM roles and policies for secure service integration
# =============================================================================

# AWS Provider Configuration
# Configures the AWS provider with the region specified in variables
# This provider will be used for all AWS resource creation
provider "aws" {
  region = var.region
}

# Terraform Provider Version Constraints
# Ensures compatibility and stability by pinning provider versions
# Prevents breaking changes from automatic provider updates
terraform {
  required_providers {
    # AWS provider for all AWS resources
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # Use latest 5.x version for modern features
    }
    # Archive provider for creating Lambda deployment packages
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    # Random provider for generating unique resource names
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# =============================================================================
# RANDOM RESOURCE NAMING
# =============================================================================

# Random suffix generator for unique resource names
# Prevents naming conflicts when deploying multiple environments
# Uses lowercase alphanumeric characters only for S3 bucket compatibility
resource "random_string" "bucket_suffix" {
  length  = 8       # 8 characters provides good uniqueness
  special = false   # No special characters for broad compatibility
  upper   = false   # Lowercase only for S3 bucket naming requirements
}

# =============================================================================
# COGNITO AUTHENTICATION & AUTHORIZATION
# =============================================================================

# Cognito User Pool - Central user directory and authentication service
# Manages user registration, authentication, and profile management
# Configured with email verification for security
resource "aws_cognito_user_pool" "pool" {
  name = "task-management-pool"
  
  # Email verification ensures valid contact information
  auto_verified_attributes = ["email"]
  
  # Allow users to sign in with email instead of username
  alias_attributes = ["email"]
  
  # Password policy enforces security best practices
  # Balances security with usability for business users
  password_policy {
    minimum_length    = 8      # Reasonable minimum for security
    require_lowercase = true   # Ensures character diversity
    require_numbers   = true   # Adds numeric complexity
    require_symbols   = false  # Disabled for user-friendliness
    require_uppercase = true   # Ensures mixed case
  }
  
  # Customized verification email template
  # Provides branded experience for user onboarding
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Task Management - Verify your email"
    email_message        = "Your verification code is {####}"
  }
}

# Cognito User Pool Client - Application-specific configuration
# Defines how the frontend application authenticates with Cognito
# Configured for OAuth2/OIDC flow with appropriate scopes
resource "aws_cognito_user_pool_client" "client" {
  name         = "task-management-client"
  user_pool_id = aws_cognito_user_pool.pool.id
  
  # Callback URLs for successful authentication redirects
  # Includes both development (localhost) and production (S3) URLs
  callback_urls = [
    "http://localhost:5173",        # Vite dev server default
    "http://localhost:5173/",       # With trailing slash
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com/"
  ]
  
  # Logout redirect URLs for sign-out flow
  # Mirrors callback URLs for consistent user experience
  logout_urls = [
    "http://localhost:5173",
    "http://localhost:5173/",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com/"
  ]
  
  # OAuth2 configuration for secure authentication flow
  allowed_oauth_flows                  = ["code"]       # Authorization code flow (most secure)
  allowed_oauth_flows_user_pool_client = true          # Enable OAuth flows for this client
  allowed_oauth_scopes                 = ["email", "openid", "profile"]  # Standard OIDC scopes
  supported_identity_providers         = ["COGNITO"]   # Use Cognito as identity provider
  
  # Authentication flows supported by the client
  # Provides flexibility for different authentication methods
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",    # Username/password authentication
    "ALLOW_USER_SRP_AUTH",         # Secure Remote Password (more secure)
    "ALLOW_REFRESH_TOKEN_AUTH"     # Token refresh capability
  ]
  
  # Token validity periods for security and user experience balance
  access_token_validity  = 24   # 24 hours for API access
  id_token_validity     = 24    # 24 hours for user identity
  refresh_token_validity = 30   # 30 days for seamless re-authentication
  
  # Token validity time units
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# Cognito User Pool Domain - Hosted UI domain
# Provides a managed authentication UI with custom domain
# Enables OAuth flows and branded login experience
resource "aws_cognito_user_pool_domain" "cognito_domain" {
  domain       = "task-mgmt-${random_string.bucket_suffix.result}"  # Unique domain name
  user_pool_id = aws_cognito_user_pool.pool.id
}

# Cognito User Groups - Role-based access control
# Provides foundation for future role-based features
# Currently informational but can be used for authorization logic

# Admin group for users with elevated privileges
resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Admin users with full access"
}

# Member group for regular users
resource "aws_cognito_user_group" "member" {
  name         = "Member"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Regular team members"
}

# =============================================================================
# DYNAMODB DATA STORAGE
# =============================================================================
# DynamoDB tables are designed with single-table design principles
# Each table has optimized access patterns using GSIs
# Pay-per-request billing provides cost efficiency for variable workloads

# Users Table - Stores user profile information
# Primary access pattern: Get user by userId
# Secondary access pattern: Find user by email (for member invitations)
resource "aws_dynamodb_table" "users" {
  name           = "Users"
  billing_mode   = "PAY_PER_REQUEST"  # Auto-scaling based on usage
  hash_key       = "userId"           # Primary key for user lookups
  
  # Primary key attribute - unique user identifier from Cognito
  attribute {
    name = "userId"
    type = "S"  # String type
  }
  
  # Email attribute for GSI - enables user lookup by email
  attribute {
    name = "email"
    type = "S"
  }
  
  # Global Secondary Index for email-based lookups
  # Used when adding team members by email address
  global_secondary_index {
    name               = "email-index"
    hash_key           = "email"
    projection_type    = "ALL"  # Include all attributes in index
  }
  
  # Enable point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name = "TaskManagement-Users"
  }
}

# Teams Table - Stores team information and metadata
# Primary access pattern: Get team by teamId
# Secondary access pattern: List teams by admin (for admin dashboard)
resource "aws_dynamodb_table" "teams" {
  name           = "Teams"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "teamId"  # Primary key for team lookups
  
  # Primary key attribute - unique team identifier
  attribute {
    name = "teamId"
    type = "S"
  }
  
  # Admin ID attribute for GSI - enables admin-based team queries
  attribute {
    name = "adminId"
    type = "S"
  }
  
  # Global Secondary Index for admin-based lookups
  # Allows admins to quickly find teams they manage
  global_secondary_index {
    name               = "adminId-index"
    hash_key           = "adminId"
    projection_type    = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name = "TaskManagement-Teams"
  }
}

# Memberships Table - Many-to-many relationship between users and teams
# Primary access pattern: Get membership by teamId + userId
# Secondary access pattern: List user's teams (userId GSI)
# Composite key design enables efficient queries for both patterns
resource "aws_dynamodb_table" "memberships" {
  name           = "Memberships"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "teamId"   # Partition key for team-based queries
  range_key      = "userId"   # Sort key for user-specific queries within team
  
  # Partition key - groups memberships by team
  attribute {
    name = "teamId"
    type = "S"
  }
  
  # Sort key - enables user-specific queries within team context
  attribute {
    name = "userId"
    type = "S"
  }
  
  # Global Secondary Index for user-centric queries
  # Enables "list all teams for a user" queries efficiently
  global_secondary_index {
    name               = "userId-index"
    hash_key           = "userId"
    projection_type    = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name = "TaskManagement-Memberships"
  }
}

# Tasks Table - Stores task information within teams
# Primary access pattern: List tasks by team (teamId partition)
# Secondary access pattern: List tasks assigned to user (assignedTo GSI)
# Hierarchical key design groups tasks by team for efficient queries
resource "aws_dynamodb_table" "tasks" {
  name           = "Tasks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "teamId"   # Partition key - groups tasks by team
  range_key      = "taskId"   # Sort key - unique task identifier within team
  
  # Partition key - enables efficient team-based task queries
  attribute {
    name = "teamId"
    type = "S"
  }
  
  # Sort key - unique task identifier within team context
  attribute {
    name = "taskId"
    type = "S"
  }
  
  # Assignee attribute for GSI - enables user-centric task queries
  attribute {
    name = "assignedTo"
    type = "S"
  }
  
  # Global Secondary Index for assignee-based lookups
  # Allows users to quickly find tasks assigned to them
  global_secondary_index {
    name               = "assignedTo-index"
    hash_key           = "assignedTo"
    projection_type    = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name = "TaskManagement-Tasks"
  }
}

# =============================================================================
# SNS NOTIFICATION SYSTEM
# =============================================================================

# SNS Topic for task-related notifications
# Provides decoupled notification delivery system
# Can be extended to support multiple notification channels (email, SMS, webhooks)
resource "aws_sns_topic" "task_notifications" {
  name = "task-notifications"
  
  tags = {
    Name = "TaskManagement-Notifications"
  }
}

# =============================================================================
# CLOUDWATCH LOGGING
# =============================================================================

# CloudWatch Log Group for Lambda function logs
# Centralized logging with automatic retention management
# Reduces storage costs while maintaining troubleshooting capability
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/TaskHandler"  # Standard Lambda log group naming
  retention_in_days = 14                        # 2 weeks retention for cost optimization
  
  tags = {
    Name = "TaskManagement-Lambda-Logs"
  }
}

# =============================================================================
# LAMBDA FUNCTION - BUSINESS LOGIC LAYER
# =============================================================================

# Lambda function for task management business logic
# Serves as the compute layer for all GraphQL operations
# Configured with appropriate resources and environment variables
resource "aws_lambda_function" "task_handler" {
  filename         = "${path.module}/../lambda/task_handler.zip"  # Pre-packaged deployment artifact
  function_name    = "TaskHandler"
  role            = aws_iam_role.lambda_role.arn                 # IAM role with required permissions
  handler         = "task_handler.handler"                      # Entry point function
  runtime         = "nodejs18.x"                                # Latest LTS Node.js runtime
  source_code_hash = filebase64sha256("${path.module}/../lambda/task_handler.zip")  # Triggers updates on code changes
  timeout         = 30        # 30 seconds timeout for complex operations
  memory_size     = 512       # 512 MB memory for optimal performance
  
  # Environment variables for service configuration
  # Provides runtime configuration without hardcoding values
  environment {
    variables = {
      # DynamoDB table names for data access
      DYNAMODB_USERS_TABLE       = aws_dynamodb_table.users.name
      DYNAMODB_TEAMS_TABLE       = aws_dynamodb_table.teams.name
      DYNAMODB_MEMBERSHIPS_TABLE = aws_dynamodb_table.memberships.name
      DYNAMODB_TASKS_TABLE       = aws_dynamodb_table.tasks.name
      
      # SNS configuration for notifications
      SNS_TOPIC_ARN             = aws_sns_topic.task_notifications.arn
      
      # Performance optimization for AWS SDK
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      
      # Cognito configuration for user management
      COGNITO_USER_POOL_ID      = aws_cognito_user_pool.pool.id
    }
  }
  
  # Ensure dependencies are created before Lambda deployment
  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,  # Log group must exist first
    aws_iam_role_policy.lambda_policy       # Permissions must be attached
  ]
  
  tags = {
    Name = "TaskManagement-Handler"
  }
}

# =============================================================================
# IAM ROLES AND POLICIES - SECURITY LAYER
# =============================================================================

# IAM Role for Lambda function execution
# Provides the Lambda function with an identity to access AWS services
# Follows principle of least privilege with specific service permissions
resource "aws_iam_role" "lambda_role" {
  name = "task-management-lambda-role"
  
  # Trust policy allowing Lambda service to assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"  # Only Lambda can assume this role
      }
    }]
  })
}

# IAM Policy for Lambda function permissions
# Grants specific permissions needed for task management operations
# Includes DynamoDB, SNS, CloudWatch, and Cognito access
resource "aws_iam_role_policy" "lambda_policy" {
  role = aws_iam_role.lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # DynamoDB permissions for data operations
        # Includes all CRUD operations and advanced features like transactions
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",        # Create operations
          "dynamodb:GetItem",        # Read operations
          "dynamodb:UpdateItem",     # Update operations
          "dynamodb:DeleteItem",     # Delete operations
          "dynamodb:Query",          # Efficient queries using keys
          "dynamodb:Scan",           # Full table scans (used sparingly)
          "dynamodb:TransactWrite",  # ACID transactions for data consistency
          "dynamodb:BatchGetItem",   # Bulk read operations
          "dynamodb:BatchWriteItem"  # Bulk write operations
        ]
        Resource = [
          # Main table permissions
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.teams.arn,
          aws_dynamodb_table.memberships.arn,
          aws_dynamodb_table.tasks.arn,
          # Global Secondary Index permissions
          "${aws_dynamodb_table.users.arn}/index/*",
          "${aws_dynamodb_table.teams.arn}/index/*",
          "${aws_dynamodb_table.memberships.arn}/index/*",
          "${aws_dynamodb_table.tasks.arn}/index/*"
        ]
      },
      {
        # SNS permissions for notification delivery
        Effect = "Allow"
        Action = [
          "sns:Publish",           # Send notifications
          "sns:GetTopicAttributes" # Read topic configuration
        ]
        Resource = aws_sns_topic.task_notifications.arn
      },
      {
        # CloudWatch Logs permissions for centralized logging
        # Essential for troubleshooting and monitoring
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",   # Create log groups
          "logs:CreateLogStream",  # Create log streams
          "logs:PutLogEvents"      # Write log events
        ]
        Resource = "arn:aws:logs:*:*:*"  # All CloudWatch Logs resources
      },
      {
        # Cognito permissions for user management operations
        # Used for adding team members by email lookup
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers"  # Find users by email for team invitations
        ]
        Resource = aws_cognito_user_pool.pool.arn
      }
    ]
  })
}

# =============================================================================
# APPSYNC GRAPHQL API - API GATEWAY LAYER
# =============================================================================

# AppSync GraphQL API - Main API gateway
# Provides GraphQL interface with real-time capabilities
# Integrated with Cognito for authentication and authorization
resource "aws_appsync_graphql_api" "api" {
  name                = "task-management-api"
  authentication_type = "AMAZON_COGNITO_USER_POOLS"  # JWT-based authentication
  
  # Cognito integration configuration
  # Links API to user pool for seamless authentication
  user_pool_config {
    user_pool_id   = aws_cognito_user_pool.pool.id
    aws_region     = var.region
    default_action = "ALLOW"  # Allow authenticated users by default
  }
  
  # GraphQL schema definition
  # Loaded from external file for better maintainability
  schema = file("${path.module}/schema.graphql")
  
  tags = {
    Name = "TaskManagement-API"
  }
}

# IAM Role for AppSync to invoke Lambda functions
# Enables AppSync to call Lambda resolvers on behalf of users
# Separate from Lambda execution role for better security separation
resource "aws_iam_role" "appsync_lambda_role" {
  name = "appsync-lambda-role"
  
  # Trust policy allowing AppSync service to assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "appsync.amazonaws.com"  # Only AppSync can assume this role
      }
    }]
  })
}

# IAM Policy for AppSync Lambda invocation
# Grants AppSync permission to invoke Lambda functions and log operations
resource "aws_iam_role_policy" "appsync_lambda_policy" {
  role = aws_iam_role.appsync_lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Lambda invocation permissions
        Effect   = "Allow"
        Action   = [
          "lambda:InvokeFunction"  # Core permission for Lambda resolvers
        ]
        Resource = aws_lambda_function.task_handler.arn
      },
      {
        # CloudWatch Logs permissions for AppSync operation logging
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# =============================================================================
# APPSYNC DATA SOURCES AND RESOLVERS
# =============================================================================

# AppSync Lambda Data Source
# Connects GraphQL resolvers to Lambda function
# Provides the bridge between GraphQL operations and business logic
resource "aws_appsync_datasource" "lambda" {
  api_id           = aws_appsync_graphql_api.api.id
  name             = "LambdaDataSource"
  type             = "AWS_LAMBDA"                           # Lambda-backed data source
  service_role_arn = aws_iam_role.appsync_lambda_role.arn  # IAM role for invocation
  
  lambda_config {
    function_arn = aws_lambda_function.task_handler.arn
  }
}

# =============================================================================
# GRAPHQL QUERY RESOLVERS
# =============================================================================
# Query resolvers handle read operations
# Each resolver maps a GraphQL query field to the Lambda function
# Uses direct Lambda invocation for optimal performance

# List Teams Query - Returns teams user is a member of
resource "aws_appsync_resolver" "list_teams" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "listTeams"                          # GraphQL field name
  type        = "Query"                              # GraphQL operation type
  data_source = aws_appsync_datasource.lambda.name  # Lambda data source
  
  kind = "UNIT"  # Direct resolver (not a pipeline)
}

# List Tasks Query - Returns tasks within a specific team
resource "aws_appsync_resolver" "list_tasks" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "listTasks"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Search Tasks Query - Full-text search within team tasks
resource "aws_appsync_resolver" "search_tasks" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "searchTasks"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# List Members Query - Returns team membership information
resource "aws_appsync_resolver" "list_members" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "listMembers"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Get User Query - Returns user profile information
resource "aws_appsync_resolver" "get_user" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "getUser"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Get Team Query - Returns detailed team information with user role
# Added for enhanced team validation and role-based UI features
resource "aws_appsync_resolver" "get_team" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "getTeam"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Get User Teams Query - Alternative endpoint for user's team list
# Provides semantic clarity for different use cases
resource "aws_appsync_resolver" "get_user_teams" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "getUserTeams"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# =============================================================================
# GRAPHQL MUTATION RESOLVERS
# =============================================================================
# Mutation resolvers handle write operations
# Each resolver maps a GraphQL mutation field to the Lambda function
# Includes operations for creating, updating, and deleting resources

# Create Team Mutation - Creates new team with requesting user as admin
resource "aws_appsync_resolver" "create_team" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "createTeam"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Add Member Mutation - Adds user to team by email (admin only)
resource "aws_appsync_resolver" "add_member" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "addMember"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Create Task Mutation - Creates new task within team (admin only)
resource "aws_appsync_resolver" "create_task" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "createTask"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Update Task Mutation - Updates task status (assignee or admin)
resource "aws_appsync_resolver" "update_task" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "updateTask"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Update Task Details Mutation - Updates task metadata (admin only)
resource "aws_appsync_resolver" "update_task_details" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "updateTaskDetails"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# Delete Task Mutation - Removes task from team (admin only)
resource "aws_appsync_resolver" "delete_task" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "deleteTask"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
  
  kind = "UNIT"
}

# =============================================================================
# S3 STATIC WEBSITE HOSTING
# =============================================================================
# S3 bucket configuration for hosting React frontend
# Provides cost-effective static website hosting with global distribution capabilities

# S3 Bucket for frontend application hosting
# Uses random suffix to ensure globally unique bucket name
resource "aws_s3_bucket" "frontend" {
  bucket = "task-management-frontend-${random_string.bucket_suffix.result}"
  
  tags = {
    Name = "TaskManagement-Frontend"
  }
}

# S3 Bucket Versioning - Enables file version tracking
# Provides rollback capability and change history
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Public Access Configuration
# Enables public read access for website hosting
# Required for S3 static website functionality
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  # Allow public access for static website hosting
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 Website Configuration
# Configures bucket for static website hosting with SPA support
# Routes all requests to index.html for client-side routing
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  # Default document for website root
  index_document {
    suffix = "index.html"
  }
  
  # Error document for 404s and SPA routing
  # Routes all 404s to index.html for client-side routing
  error_document {
    key = "index.html"
  }
}

# S3 Bucket Policy for public read access
# Allows anonymous users to read website files
# Essential for public website functionality
resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.frontend.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"                                    # Anonymous access
      Action    = "s3:GetObject"                        # Read-only access
      Resource  = "${aws_s3_bucket.frontend.arn}/*"    # All objects in bucket
    }]
  })
  
  # Ensure public access block is configured before applying policy
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# =============================================================================
# TERRAFORM OUTPUTS
# =============================================================================
# Output values for integration with frontend applications and CI/CD pipelines
# Provides essential configuration values for external systems

# Cognito User Pool ID - Required for frontend authentication setup
output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.pool.id
  description = "Cognito User Pool ID"
}

# Cognito Client ID - Required for frontend OAuth configuration
output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.client.id
  description = "Cognito User Pool Client ID"
}

# Cognito Domain - Used for hosted UI authentication flows
output "cognito_domain" {
  value       = aws_cognito_user_pool_domain.cognito_domain.domain
  description = "Cognito User Pool Domain"
}

# AppSync GraphQL Endpoint - Primary API endpoint for frontend
output "appsync_endpoint" {
  value       = aws_appsync_graphql_api.api.uris["GRAPHQL"]
  description = "AppSync GraphQL Endpoint"
}

# S3 Website URL - Public URL for accessing the hosted frontend
# Used for production deployment and testing
output "s3_website_url" {
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
  description = "S3 Website URL"
}

# S3 Bucket Name - Used by CI/CD pipelines for deployment
# Enables automated deployment of frontend builds
output "s3_bucket_name" {
  value       = aws_s3_bucket.frontend.bucket
  description = "S3 Bucket Name for CI/CD"
}

# Lambda Function Name - Used for monitoring and debugging
# Enables direct Lambda function management and testing
output "lambda_function_name" {
  value       = aws_lambda_function.task_handler.function_name
  description = "Lambda Function Name"
}

# AWS Region - Confirms deployment region for configuration consistency
# Used by frontend for region-specific AWS SDK configuration
output "region" {
  value       = var.region
  description = "AWS Region"
}