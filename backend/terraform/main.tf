# Configuring AWS provider
provider "aws" {
  region = var.region
}

# Ensure the AWS provider version is recent to support all resources
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Random suffix for resources (moved to top for dependency order)
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# Cognito User Pool for authentication
resource "aws_cognito_user_pool" "pool" {
  name = "task-management-pool"
  auto_verified_attributes = ["email"]
  
  # Allow users to sign up with email
  alias_attributes = ["email"]
  
  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }
  
  # Email verification settings
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Task Management - Verify your email"
    email_message        = "Your verification code is {####}"
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "client" {
  name         = "task-management-client"
  user_pool_id = aws_cognito_user_pool.pool.id
  
  # OAuth settings
  callback_urls = [
    "http://localhost:5173",
    "http://localhost:5173/",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com/"
  ]
  logout_urls = [
    "http://localhost:5173",
    "http://localhost:5173/",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com",
    "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com/"
  ]
  
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]
  
  # Enable username/password auth
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  
  # Token validity
  access_token_validity  = 24
  id_token_validity     = 24
  refresh_token_validity = 30
  
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "cognito_domain" {
  domain       = "task-mgmt-${random_string.bucket_suffix.result}"
  user_pool_id = aws_cognito_user_pool.pool.id
}

# Cognito User Groups
resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Admin users with full access"
}

resource "aws_cognito_user_group" "member" {
  name         = "Member"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Regular team members"
}

# DynamoDB Tables
resource "aws_dynamodb_table" "users" {
  name           = "Users"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  
  attribute {
    name = "userId"
    type = "S"
  }
  
  tags = {
    Name = "TaskManagement-Users"
  }
}

resource "aws_dynamodb_table" "teams" {
  name           = "Teams"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "teamId"
  
  attribute {
    name = "teamId"
    type = "S"
  }
  
  tags = {
    Name = "TaskManagement-Teams"
  }
}

resource "aws_dynamodb_table" "memberships" {
  name           = "Memberships"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "teamId"
  range_key      = "userId"
  
  attribute {
    name = "teamId"
    type = "S"
  }
  attribute {
    name = "userId"
    type = "S"
  }
  
  # Global Secondary Index for querying by userId
  global_secondary_index {
    name               = "userId-index"
    hash_key           = "userId"
    projection_type    = "ALL"
  }
  
  tags = {
    Name = "TaskManagement-Memberships"
  }
}

resource "aws_dynamodb_table" "tasks" {
  name           = "Tasks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "teamId"
  range_key      = "taskId"
  
  attribute {
    name = "teamId"
    type = "S"
  }
  attribute {
    name = "taskId"
    type = "S"
  }
  
  tags = {
    Name = "TaskManagement-Tasks"
  }
}

# SNS Topic for notifications
resource "aws_sns_topic" "task_notifications" {
  name = "task-notifications"
  
  tags = {
    Name = "TaskManagement-Notifications"
  }
}

# CloudWatch Log Group for Lambda (created before Lambda function)
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/TaskHandler"
  retention_in_days = 14
  
  tags = {
    Name = "TaskManagement-Lambda-Logs"
  }
}

# Lambda function package (updated to handle existing zip file)
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/../lambda/task_handler_deploy.zip"
  excludes    = ["task_handler.zip", "*.zip"]
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "task-management-lambda-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# IAM Policy for Lambda
resource "aws_iam_role_policy" "lambda_policy" {
  role = aws_iam_role.lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:TransactWrite"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.teams.arn,
          aws_dynamodb_table.memberships.arn,
          aws_dynamodb_table.tasks.arn,
          "${aws_dynamodb_table.memberships.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = "sns:Publish"
        Resource = aws_sns_topic.task_notifications.arn
      },
      {
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

# Lambda Function for handling GraphQL resolvers (updated configuration)
resource "aws_lambda_function" "task_handler" {
  # Use the existing zip file if it exists, otherwise use the generated one
  filename         = fileexists("${path.module}/../lambda/task_handler.zip") ? "${path.module}/../lambda/task_handler.zip" : data.archive_file.lambda_zip.output_path
  function_name    = "TaskHandler"
  role            = aws_iam_role.lambda_role.arn
  handler         = "task_handler.handler"
  runtime         = "nodejs18.x"
  source_code_hash = fileexists("${path.module}/../lambda/task_handler.zip") ? filebase64sha256("${path.module}/../lambda/task_handler.zip") : data.archive_file.lambda_zip.output_base64sha256
  timeout         = 30
  memory_size     = 256
  
  environment {
    variables = {
      DYNAMODB_USERS_TABLE       = aws_dynamodb_table.users.name
      DYNAMODB_TEAMS_TABLE       = aws_dynamodb_table.teams.name
      DYNAMODB_MEMBERSHIPS_TABLE = aws_dynamodb_table.memberships.name
      DYNAMODB_TASKS_TABLE       = aws_dynamodb_table.tasks.name
      SNS_TOPIC_ARN             = aws_sns_topic.task_notifications.arn
    }
  }
  
  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,
    aws_iam_role_policy.lambda_policy
  ]
  
  tags = {
    Name = "TaskManagement-Handler"
  }
}

# AppSync GraphQL API
resource "aws_appsync_graphql_api" "api" {
  name                = "task-management-api"
  authentication_type = "AMAZON_COGNITO_USER_POOLS"
  
  user_pool_config {
    user_pool_id   = aws_cognito_user_pool.pool.id
    aws_region     = var.region
    default_action = "ALLOW"
  }
  
  schema = file("${path.module}/schema.graphql")
  
  tags = {
    Name = "TaskManagement-API"
  }
}

# IAM Role for AppSync to invoke Lambda
resource "aws_iam_role" "appsync_lambda_role" {
  name = "appsync-lambda-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "appsync.amazonaws.com"
      }
    }]
  })
}

# IAM Policy for AppSync to invoke Lambda
resource "aws_iam_role_policy" "appsync_lambda_policy" {
  role = aws_iam_role.appsync_lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.task_handler.arn
    }]
  })
}

# AppSync Data Source for Lambda
resource "aws_appsync_datasource" "lambda" {
  api_id           = aws_appsync_graphql_api.api.id
  name             = "LambdaDataSource"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda_role.arn
  
  lambda_config {
    function_arn = aws_lambda_function.task_handler.arn
  }
}

# AppSync Resolvers for Queries
resource "aws_appsync_resolver" "list_teams" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "listTeams"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
}

resource "aws_appsync_resolver" "list_tasks" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "listTasks"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
}

resource "aws_appsync_resolver" "list_members" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "listMembers"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
}

resource "aws_appsync_resolver" "get_user" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "getUser"
  type        = "Query"
  data_source = aws_appsync_datasource.lambda.name
}

# AppSync Resolvers for Mutations
resource "aws_appsync_resolver" "create_team" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "createTeam"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
}

resource "aws_appsync_resolver" "add_member" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "addMember"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
}

resource "aws_appsync_resolver" "create_task" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "createTask"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
}

resource "aws_appsync_resolver" "update_task" {
  api_id      = aws_appsync_graphql_api.api.id
  field       = "updateTask"
  type        = "Mutation"
  data_source = aws_appsync_datasource.lambda.name
}

# S3 Bucket for Frontend Hosting
resource "aws_s3_bucket" "frontend" {
  bucket = "task-management-frontend-${random_string.bucket_suffix.result}"
  
  tags = {
    Name = "TaskManagement-Frontend"
  }
}

# S3 Bucket versioning
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Disable Block Public Access for the S3 bucket
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 Bucket Website Configuration
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  index_document {
    suffix = "index.html"
  }
  
  error_document {
    key = "index.html"
  }
}

# S3 Bucket Policy for public read access
resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.frontend.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
  
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Outputs
output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.pool.id
  description = "Cognito User Pool ID"
}

output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.client.id
  description = "Cognito User Pool Client ID"
}

output "cognito_domain" {
  value       = aws_cognito_user_pool_domain.cognito_domain.domain
  description = "Cognito User Pool Domain"
}

output "appsync_endpoint" {
  value       = aws_appsync_graphql_api.api.uris["GRAPHQL"]
  description = "AppSync GraphQL Endpoint"
}

output "s3_website_url" {
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
  description = "S3 Website URL"
}

output "s3_bucket_name" {
  value       = aws_s3_bucket.frontend.bucket
  description = "S3 Bucket Name for CI/CD"
}

output "lambda_function_name" {
  value       = aws_lambda_function.task_handler.function_name
  description = "Lambda Function Name"
}

output "region" {
  value       = var.region
  description = "AWS Region"
}