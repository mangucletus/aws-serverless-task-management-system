# Deployment Guide

This document provides step-by-step instructions for deploying the Task Management Application to AWS.

## Overview

The application is deployed using Terraform for infrastructure and AWS CLI for Lambda functions. The frontend is hosted on AWS S3 or Amplify Hosting.

## Prerequisites

AWS CLI configured with appropriate credentials
Terraform (v1.5 or later)
Node.js (v18 or later)
AWS account with permissions for S3, CloudFront, Lambda, DynamoDB, AppSync, SNS, SES, and Cognito

## Deployment Steps

### 1. Clone the Repository

git clone <repository-url>
cd task-management-app

### 2. Deploy Infrastructure

Navigate to the terraform directory:cd terraform


Initialize Terraform:terraform init


Apply the configuration:terraform apply


Note the outputs (e.g., appsync_endpoint, cognito_user_pool_id, sns_topic_arn) for configuration.

### 3. Configure Backend

Navigate to the backend directory:cd ../backend


Create a .env file with Terraform outputs:AWS_REGION=us-east-1
SNS_TOPIC_ARN=<your-sns-topic-arn>
DYNAMODB_TABLE_NAME=<your-dynamodb-table-name>


Install dependencies:npm install


Deploy Lambda functions:cd functions/TaskHandler
zip -r function.zip .
aws lambda update-function-code --function-name TaskHandler --zip-file fileb://function.zip
cd ../NotificationHandler
zip -r function.zip .
aws lambda update-function-code --function-name NotificationHandler --zip-file fileb://function.zip



### 4. Configure Frontend

Navigate to the frontend directory:cd ../../frontend


Create a .env file with Terraform outputs:VITE_COGNITO_USER_POOL_ID=<your-user-pool-id>
VITE_COGNITO_CLIENT_ID=<your-client-id>
VITE_APPSYNC_ENDPOINT=<your-appsync-endpoint>
VITE_REGION=us-east-1


Install dependencies:npm install


Build the frontend:npm run build



### 5. Deploy Frontend

Option 1: AWS S3 and CloudFront
Create an S3 bucket:aws s3 mb s3://<your-bucket-name>


Upload the build:aws s3 sync dist/ s3://<your-bucket-name>


Configure the bucket for static website hosting and set up CloudFront (see AWS documentation for details).


Option 2: AWS Amplify Hosting
Connect the repository to AWS Amplify via the AWS Console.
Configure build settings to use npm run build.
Deploy the app.



### 6. Configure Notifications

Verify email addresses in AWS SES:
Go to the SES console and verify sender/recipient email addresses.


Ensure the SNS topic (sns_topic_arn) is correctly configured in backend/.env.

### 7. Test the Application

Access the frontend URL (S3/CloudFront or Amplify Hosting).
Sign up or log in via AWS Cognito.
Test team creation, task management, and notifications.
Check CloudWatch logs for TaskHandler and NotificationHandler for errors.

## Troubleshooting

Deployment Errors: Verify Terraform outputs and AWS CLI credentials.
Lambda Errors: Check CloudWatch logs for specific error messages.
Frontend Errors: Ensure .env variables match Terraform outputs.
Notifications: Confirm SES email verification and SNS topic setup.

## Related Documentation

Main README
Backend README
Frontend README
API Documentation


---

🔙 [Back to Main Documentation](../../README.md)
