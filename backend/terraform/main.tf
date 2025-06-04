# Configuring AWS provider
# Specifies the AWS provider and sets the region using a variable
provider "aws" {
  region = var.region  # Defines the AWS region where resources will be deployed, sourced from a variable
}

# Ensure the AWS provider version is recent to support all resources
# Configures Terraform to use specific provider versions for consistency and compatibility
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"  # Specifies the source of the AWS provider
      version = "~> 5.0"         # Ensures AWS provider version is approximately 5.0 or later
    }
    archive = {
      source  = "hashicorp/archive"  # Specifies the source of the archive provider for creating zip files
      version = "~> 2.0"             # Ensures archive provider version is approximately 2.0 or later
    }
    random = {
      source  = "hashicorp/random"  # Specifies the source of the random provider for generating random strings
      version = "~> 3.0"           # Ensures random provider version is approximately 3.0 or later
    }
  }
}

# Random suffix for resources (moved to top for dependency order)
# Generates a random string to append to resource names to ensure uniqueness
resource "random_string" "bucket_suffix" {
  length  = 8          # Sets the length of the random string to 8 characters
  special = false      # Excludes special characters from the random string
  upper   = false      # Ensures the random string contains only lowercase letters
}

# Cognito User Pool for authentication
# Creates an AWS Cognito User Pool for managing user authentication
resource "aws_cognito_user_pool" "pool" {
  name = "task-management-pool"  # Names the user pool for identification
  auto_verified_attributes = ["email"]  # Automatically verifies user emails upon signup
  
  # Allow users to sign up with email
  alias_attributes = ["email"]  # Allows users to sign in using their email as an alias
  
  # Password policy
  # Defines requirements for user passwords
  password_policy {
    minimum_length    = 8          # Requires passwords to be at least 8 characters long
    require_lowercase = true       # Mandates at least one lowercase letter
    require_numbers   = true       # Mandates at least one number
    require_symbols   = false      # Does not require special characters
    require_uppercase = true       # Mandates at least one uppercase letter
  }
  
  # Email verification settings
  # Configures the email verification process for new users
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"  # Sends a verification code to the user's email
    email_subject        = "Task Management - Verify your email"  # Sets the subject of the verification email
    email_message        = "Your verification code is {####}"     # Defines the email body with a placeholder for the code
  }
}

# Cognito User Pool Client
# Creates a client application for the Cognito User Pool to handle authentication flows
resource "aws_cognito_user_pool_client" "client" {
  name         = "task-management-client"  # Names the client for identification
  user_pool_id = aws_cognito_user_pool.pool.id  # Links the client to the user pool
  
  # OAuth settings
  # Configures OAuth callback and logout URLs for the application
  callback_urls = [
    "http://localhost:5173",                                    # Local development callback URL
    "http://localhost:5173/",                                   # Local development callback URL with trailing slash
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com",  # Production callback URL for S3-hosted frontend
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com/"  # Production callback URL with trailing slash
  ]
  logout_urls = [
    "http://localhost:5173",                                    # Local development logout URL
    "http://localhost:5173/",                                   # Local development logout URL with trailing slash
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com",  # Production logout URL for S3-hosted frontend
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com/"  # Production logout URL with trailing slash
  ]
  
  allowed_oauth_flows                  = ["code"]          # Specifies the OAuth authorization code grant flow
  allowed_oauth_flows_user_pool_client = true             # Enables OAuth flows for the user pool client
  allowed_oauth_scopes                 = ["email", "openid", "profile"]  # Defines allowed OAuth scopes
  supported_identity_providers         = ["COGNITO"]      # Specifies Cognito as the identity provider
  
  # Enable username/password auth
  # Configures supported authentication flows for the client
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",      # Allows username/password authentication
    "ALLOW_USER_SRP_AUTH",          # Allows Secure Remote Password (SRP) authentication
    "ALLOW_REFRESH_TOKEN_AUTH"      # Allows refresh token authentication
  ]
  
  # Token validity
  # Sets the validity periods for authentication tokens
  access_token_validity  = 24       # Access token valid for 24 hours
  id_token_validity     = 24        # ID token valid for 24 hours
  refresh_token_validity = 30       # Refresh token valid for 30 days
  
  # Specifies the units for token validity periods
  token_validity_units {
    access_token  = "hours"         # Access token validity in hours
    id_token      = "hours"         # ID token validity in hours
    refresh_token = "days"          # Refresh token validity in days
  }
}

# Cognito User Pool Domain
# Creates a custom domain for the Cognito User Pool for hosted UI
resource "aws_cognito_user_pool_domain" "cognito_domain" {
  domain       = "task-mgmt-${random_string.bucket_suffix.result}"  # Sets a unique domain name using the random string
  user_pool_id = aws_cognito_user_pool.pool.id                     # Links the domain to the user pool
}

# Cognito User Groups
# Creates an Admin user group for users with full access
resource "aws_cognito_user_group" "admin" {
  name         = "Admin"                        # Names the group
  user_pool_id = aws_cognito_user_pool.pool.id  # Links the group to the user pool
  description  = "Admin users with full access" # Describes the group's purpose
}

# Creates a Member user group for regular team members
resource "aws_cognito_user_group" "member" {
  name         = "Member"                       # Names the group
  user_pool_id = aws_cognito_user_pool.pool.id  # Links the group to the user pool
  description  = "Regular team members"         # Describes the group's purpose
}

# DynamoDB Tables
# Creates a DynamoDB table to store user data
resource "aws_dynamodb_table" "users" {
  name           = "Users"                     # Names the table
  billing_mode   = "PAY_PER_REQUEST"           # Uses on-demand billing mode
  hash_key       = "userId"                    # Defines the partition key
  
  # Defines the attributes for the table
  attribute {
    name = "userId"                            # Attribute name for the partition key
    type = "S"                                 # Specifies the attribute type as string
  }
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Users"            # Tag for identifying the table
  }
}

# Creates a DynamoDB table to store team data
resource "aws_dynamodb_table" "teams" {
  name           = "Teams"                     # Names the table
  billing_mode   = "PAY_PER_REQUEST"           # Uses on-demand billing mode
  hash_key       = "teamId"                    # Defines the partition key
  
  # Defines the attributes for the table
  attribute {
    name = "teamId"                            # Attribute name for the partition key
    type = "S"                                 # Specifies the attribute type as string
  }
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Teams"            # Tag for identifying the table
  }
}

# Creates a DynamoDB table to store team membership data
resource "aws_dynamodb_table" "memberships" {
  name           = "Memberships"               # Names the table
  billing_mode   = "PAY_PER_REQUEST"           # Uses on-demand billing mode
  hash_key       = "teamId"                    # Defines the partition key
  range_key      = "userId"                    # Defines the sort key
  
  # Defines the attributes for the table
  attribute {
    name = "teamId"                            # Attribute name for the partition key
    type = "S"                                 # Specifies the attribute type as string
  }
  attribute {
    name = "userId"                            # Attribute name for the sort key
    type = "S"                                 # Specifies the attribute type as string
  }
  
  # Global Secondary Index for querying by userId
  # Allows efficient querying of memberships by userId
  global_secondary_index {
    name               = "userId-index"       # Names the index
    hash_key           = "userId"             # Uses userId as the partition key for the index
    projection_type    = "ALL"                # Includes all attributes in the index
  }
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Memberships"      # Tag for identifying the table
  }
}

# Creates a DynamoDB table to store task data
resource "aws_dynamodb_table" "tasks" {
  name           = "Tasks"                     # Names the table
  billing_mode   = "PAY_PER_REQUEST"           # Uses on-demand billing mode
  hash_key       = "teamId"                    # Defines the partition key
  range_key      = "taskId"                    # Defines the sort key
  
  # Defines the attributes for the table
  attribute {
    name = "teamId"                            # Attribute name for the partition key
    type = "S"                                 # Specifies the attribute type as string
  }
  attribute {
    name = "taskId"                            # Attribute name for the sort key
    type = "S"                                 # Specifies the attribute type as string
  }
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Tasks"            # Tag for identifying the table
  }
}

# SNS Topic for notifications
# Creates an SNS topic for sending task-related notifications
resource "aws_sns_topic" "task_notifications" {
  name = "task-notifications"                 # Names the SNS topic
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Notifications"     # Tag for identifying the topic
  }
}

# CloudWatch Log Group for Lambda (created before Lambda function)
# Creates a CloudWatch log group to store Lambda function logs
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/TaskHandler"  # Names the log group, matching the Lambda function name
  retention_in_days = 14                        # Retains logs for 14 days
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Lambda-Logs"        # Tag for identifying the log group
  }
}

# Lambda function package (updated to handle existing zip file)
# Creates a zip file for the Lambda function code
data "archive_file" "lambda_zip" {
  type        = "zip"                          # Specifies the archive type as zip
  source_dir  = "${path.module}/../lambda"     # Source directory containing Lambda function code
  output_path = "${path.module}/../lambda/task_handler_deploy.zip"  # Output path for the zipped file
  excludes    = ["task_handler.zip", "*.zip"]  # Excludes existing zip files to prevent conflicts
}

# IAM Role for Lambda
# Creates an IAM role for the Lambda function to assume
resource "aws_iam_role" "lambda_role" {
  name = "task-management-lambda-role"         # Names the IAM role
  
  # Defines the trust policy allowing Lambda to assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"              # Allows the assume role action
      Effect = "Allow"                       # Permits the action
      Principal = {
        Service = "lambda.amazonaws.com"     # Specifies Lambda as the trusted service
      }
    }]
  })
}

# IAM Policy for Lambda
# Attaches a policy to the Lambda role to grant necessary permissions
resource "aws_iam_role_policy" "lambda_policy" {
  role = aws_iam_role.lambda_role.id          # Links the policy to the Lambda role
  
  # Defines permissions for DynamoDB, SNS, and CloudWatch Logs
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"                     # Permits the specified actions
        Action = [
          "dynamodb:PutItem",                # Allows adding items to DynamoDB
          "dynamodb:GetItem",                # Allows retrieving items from DynamoDB
          "dynamodb:UpdateItem",             # Allows updating items in DynamoDB
          "dynamodb:DeleteItem",             # Allows deleting items from DynamoDB
          "dynamodb:Query",                  # Allows querying DynamoDB tables
          "dynamodb:Scan",                   # Allows scanning DynamoDB tables
          "dynamodb:TransactWrite"           # Allows transactional writes to DynamoDB
        ]
        Resource = [
          aws_dynamodb_table.users.arn,      # Grants access to the Users table
          aws_dynamodb_table.teams.arn,      # Grants access to the Teams table
          aws_dynamodb_table.memberships.arn,  # Grants access to the Memberships table
          aws_dynamodb_table.tasks.arn,      # Grants access to the Tasks table
          "${aws_dynamodb_table.memberships.arn}/index/*"  # Grants access to Memberships table indexes
        ]
      },
      {
        Effect = "Allow"                     # Permits the specified action
        Action = "sns:Publish"               # Allows publishing to SNS topics
        Resource = aws_sns_topic.task_notifications.arn  # Grants access to the SNS topic
      },
      {
        Effect = "Allow"                     # Permits the specified actions
        Action = [
          "logs:CreateLogGroup",             # Allows creating CloudWatch log groups
          "logs:CreateLogStream",            # Allows creating CloudWatch log streams
          "logs:PutLogEvents"                # Allows writing log events to CloudWatch
        ]
        Resource = "*"                       # Grants access to all log resources
      }
    ]
  })
}

# Lambda Function for handling GraphQL resolvers (updated configuration)
# Creates a Lambda function to handle GraphQL API requests
resource "aws_lambda_function" "task_handler" {
  # Use the existing zip file if it exists, otherwise use the generated one
  filename         = fileexists("${path.module}/../lambda/task_handler.zip") ? "${path.module}/../lambda/task_handler.zip" : data.archive_file.lambda_zip.output_path  # Selects the Lambda deployment package
  function_name    = "TaskHandler"             # Names the Lambda function
  role            = aws_iam_role.lambda_role.arn  # Assigns the IAM role to the function
  handler         = "task_handler.handler"     # Specifies the entry point (file.function)
  runtime         = "nodejs18.x"               # Sets the runtime to Node.js 18
  source_code_hash = fileexists("${path.module}/../lambda/task_handler.zip") ? filebase64sha256("${path.module}/../lambda/task_handler.zip") : data.archive_file.lambda_zip.output_base64sha256  # Ensures code updates trigger redeployment
  timeout         = 30                         # Sets the function timeout to 30 seconds
  memory_size     = 256                        # Allocates 256 MB of memory
  
  # Sets environment variables for the Lambda function
  environment {
    variables = {
      DYNAMODB_USERS_TABLE       = aws_dynamodb_table.users.name        # Passes Users table name
      DYNAMODB_TEAMS_TABLE       = aws_dynamodb_table.teams.name        # Passes Teams table name
      DYNAMODB_MEMBERSHIPS_TABLE = aws_dynamodb_table.memberships.name  # Passes Memberships table name
      DYNAMODB_TASKS_TABLE       = aws_dynamodb_table.tasks.name        # Passes Tasks table name
      SNS_TOPIC_ARN             = aws_sns_topic.task_notifications.arn  # Passes SNS topic ARN
    }
  }
  
  # Ensures dependencies are created before the Lambda function
  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,       # Ensures log group is created
    aws_iam_role_policy.lambda_policy           # Ensures IAM policy is attached
  ]
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Handler"            # Tag for identifying the function
  }
}

# AppSync GraphQL API
# Creates an AppSync GraphQL API for the application
resource "aws_appsync_graphql_api" "api" {
  name                = "task-management-api"   # Names the API
  authentication_type = "AMAZON_COGNITO_USER_POOLS"  # Uses Cognito for authentication
  
  # Configures Cognito authentication settings
  user_pool_config {
    user_pool_id   = aws_cognito_user_pool.pool.id  # Links to the Cognito user pool
    aws_region     = var.region                    # Specifies the AWS region
    default_action = "ALLOW"                       # Allows authenticated users by default
  }
  
  schema = file("${path.module}/schema.graphql")  # Loads the GraphQL schema from a file
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-API"                  # Tag for identifying the API
  }
}

# IAM Role for AppSync to invoke Lambda
# Creates an IAM role for AppSync to invoke the Lambda function
resource "aws_iam_role" "appsync_lambda_role" {
  name = "appsync-lambda-role"                 # Names the IAM role
  
  # Defines the trust policy allowing AppSync to assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"              # Allows the assume role action
      Effect = "Allow"                       # Permits the action
      Principal = {
        Service = "appsync.amazonaws.com"    # Specifies AppSync as the trusted service
      }
    }]
  })
}

# IAM Policy for AppSync to invoke Lambda
# Attaches a policy to the AppSync role to allow Lambda invocation
resource "aws_iam_role_policy" "appsync_lambda_policy" {
  role = aws_iam_role.appsync_lambda_role.id   # Links the policy to the AppSync role
  
  # Grants permission to invoke the Lambda function
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"                      # Permits the action
      Action   = "lambda:InvokeFunction"      # Allows invoking Lambda functions
      Resource = aws_lambda_function.task_handler.arn  # Specifies the Lambda function ARN
    }]
  })
}

# AppSync Data Source for Lambda
# Creates a data source for AppSync to connect to the Lambda function
resource "aws_appsync_datasource" "lambda" {
  api_id           = aws_appsync_graphql_api.api.id           # Links to the AppSync API
  name             = "LambdaDataSource"                      # Names the data source
  type             = "AWS_LAMBDA"                            # Specifies Lambda as the data source type
  service_role_arn = aws_iam_role.appsync_lambda_role.arn     # Assigns the AppSync IAM role
  
  # Configures the Lambda function for the data source
  lambda_config {
    function_arn = aws_lambda_function.task_handler.arn       # Specifies the Lambda function ARN
  }
}

# AppSync Resolvers for Queries
# Configures a resolver for the listTeams query
resource "aws_appsync_resolver" "list_teams" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "listTeams"                                 # Specifies the GraphQL field
  type        = "Query"                                     # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the listTasks query
resource "aws_appsync_resolver" "list_tasks" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "listTasks"                                 # Specifies the GraphQL field
  type        = "Query"                                     # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the searchTasks query
resource "aws_appsync_resolver" "search_tasks" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "searchTasks"                               # Specifies the GraphQL field
  type        = "Query"                                     # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the listMembers query
resource "aws_appsync_resolver" "list_members" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "listMembers"                               # Specifies the GraphQL field
  type        = "Query"                                     # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the getUser query
resource "aws_appsync_resolver" "get_user" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "getUser"                                   # Specifies the GraphQL field
  type        = "Query"                                     # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# AppSync Resolvers for Mutations
# Configures a resolver for the createTeam mutation
resource "aws_appsync_resolver" "create_team" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "createTeam"                                # Specifies the GraphQL field
  type        = "Mutation"                                  # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the addMember mutation
resource "aws_appsync_resolver" "add_member" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "addMember"                                 # Specifies the GraphQL field
  type        = "Mutation"                                  # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the createTask mutation
resource "aws_appsync_resolver" "create_task" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "createTask"                                # Specifies the GraphQL field
  type        = "Mutation"                                  # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the updateTask mutation
resource "aws_appsync_resolver" "update_task" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "updateTask"                                # Specifies the GraphQL field
  type        = "Mutation"                                  # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the updateTaskDetails mutation
resource "aws_appsync_resolver" "update_task_details" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "updateTaskDetails"                         # Specifies the GraphQL field
  type        = "Mutation"                                  # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# Configures a resolver for the deleteTask mutation
resource "aws_appsync_resolver" "delete_task" {
  api_id      = aws_appsync_graphql_api.api.id               # Links to the AppSync API
  field       = "deleteTask"                                # Specifies the GraphQL field
  type        = "Mutation"                                  # Specifies the GraphQL type
  data_source = aws_appsync_datasource.lambda.name           # Links to the Lambda data source
}

# S3 Bucket for Frontend Hosting
# Creates an S3 bucket to host the frontend application
resource "aws_s3_bucket" "frontend" {
  bucket = "task-management-frontend-${random_string.bucket_suffix.result}"  # Names the bucket with a unique suffix
  
  # Tags for resource identification
  tags = {
    Name = "TaskManagement-Frontend"                                # Tag for identifying the bucket
  }
}

# S3 Bucket versioning
# Enables versioning for the S3 bucket to track changes
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id                                # Links to the S3 bucket
  versioning_configuration {
    status = "Enabled"                                             # Enables versioning
  }
}

# Disable Block Public Access for the S3 bucket
# Configures public access settings to allow public read access
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id                                # Links to the S3 bucket

  block_public_acls       = false                                  # Allows public ACLs
  block_public_policy     = false                                  # Allows public bucket policies
  ignore_public_acls      = false                                  # Does not ignore public ACLs
  restrict_public_buckets = false                                  # Does not restrict public buckets
}

# S3 Bucket Website Configuration
# Configures the S3 bucket for website hosting
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id                                # Links to the S3 bucket
  
  # Specifies the index document for the website
  index_document {
    suffix = "index.html"                                          # Sets index.html as the default page
  }
  
  # Specifies the error document for the website
  error_document {
    key = "index.html"                                             # Redirects errors to index.html (for SPA routing)
  }
}

# S3 Bucket Policy for public read access
# Attaches a policy to the S3 bucket to allow public read access
resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.frontend.id                                # Links to the S3 bucket
  
  # Defines the policy for public read access
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"                                          # Permits the action
      Principal = "*"                                              # Allows access to all principals
      Action    = "s3:GetObject"                                   # Allows retrieving objects
      Resource  = "${aws_s3_bucket.frontend.arn}/*"                # Applies to all objects in the bucket
    }]
  })
  
  # Ensures public access block is configured first
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Outputs
# Outputs the Cognito User Pool ID for reference
output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.pool.id                     # Provides the user pool ID
  description = "Cognito User Pool ID"                           # Describes the output
}

# Outputs the Cognito User Pool Client ID for reference
output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.client.id            # Provides the client ID
  description = "Cognito User Pool Client ID"                    # Describes the output
}

# Outputs the Cognito User Pool Domain for reference
output "cognito_domain" {
  value       = aws_cognito_user_pool_domain.cognito_domain.domain  # Provides the domain name
  description = "Cognito User Pool Domain"                       # Describes the output
}

# Outputs the AppSync GraphQL API endpoint for reference
output "appsync_endpoint" {
  value       = aws_appsync_graphql_api.api.uris["GRAPHQL"]      # Provides the GraphQL endpoint URL
  description = "AppSync GraphQL Endpoint"                       # Describes the output
}

# Outputs the S3 website URL for reference
output "s3_website_url" {
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint  # Provides the website endpoint
  description = "S3 Website URL"                                 # Describes the output
}

# Outputs the S3 bucket name for reference
output "s3_bucket_name" {
  value       = aws_s3_bucket.frontend.bucket                    # Provides the bucket name
  description = "S3 Bucket Name for CI/CD"                      # Describes the output
}

# Outputs the Lambda function name for reference
output "lambda_function_name" {
  value       = aws_lambda_function.task_handler.function_name   # Provides the Lambda function name
  description = "Lambda Function Name"                          # Describes the output
}

# Outputs the AWS region for reference
output "region" {
  value       = var.region                                      # Provides the region
  description = "AWS Region"                                    # Describes the output
}