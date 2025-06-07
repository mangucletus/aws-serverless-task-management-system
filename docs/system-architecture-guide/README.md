# System Architecture Guide

This document provides an overview of the Task Management Application's architecture, including components, interactions, and a visual diagram.

## Overview

The application uses a serverless architecture on AWS, with a React frontend and a GraphQL backend. It leverages AWS services for scalability, security, and reliability.
Components

Frontend: React application using AWS Amplify for authentication and GraphQL API interactions.
Backend:
AWS AppSync: Hosts the GraphQL API, handling queries, mutations, and subscriptions.
AWS Lambda: Executes business logic for team/task operations (TaskHandler) and notifications (NotificationHandler).
Amazon DynamoDB: Stores team and task data.
AWS SNS: Publishes notifications for task assignments and team invitations.
AWS SES: Sends email notifications.
AWS Cognito: Manages user authentication and authorization.


Infrastructure: Defined using Terraform for automated deployment.

## Architecture Diagram

Below is a Mermaid diagram illustrating the application architecture:
graph TD
    A[User] -->|HTTPS| B[React Frontend]
    B -->|AWS Amplify| C[AWS Cognito]
    B -->|GraphQL| D[AWS AppSync]
    D -->|Resolver| E[AWS Lambda: TaskHandler]
    D -->|Resolver| F[AWS Lambda: NotificationHandler]
    E -->|CRUD| G[Amazon DynamoDB]
    F -->|Publish| H[AWS SNS]
    H -->|Send Email| I[AWS SES]
    J[Terraform] -->|Deploy| C
    J -->|Deploy| D
    J -->|Deploy| E
    J -->|Deploy| F
    J -->|Deploy| G
    J -->|Deploy| H
    J -->|Deploy| I

## Data Flow

User Authentication: Users sign in via AWS Cognito, receiving a JWT token.
API Requests: The frontend sends GraphQL requests to AWS AppSync with the JWT token.
Business Logic: AppSync routes requests to Lambda functions (TaskHandler for team/task operations, NotificationHandler for notifications).
Data Storage: TaskHandler interacts with DynamoDB for CRUD operations.
Notifications: NotificationHandler publishes messages to SNS, which triggers SES to send emails.
Real-Time Updates: AppSync subscriptions notify clients of task updates.

## Security

Authentication: AWS Cognito secures user access.
Authorization: AppSync enforces role-based access (e.g., admin-only for deleteTask).
Data Encryption: All data is encrypted at rest (DynamoDB, SES) and in transit (HTTPS, SNS).

## Scalability

Serverless: Lambda and AppSync scale automatically with demand.
DynamoDB: Handles high-throughput reads/writes with on-demand capacity.
SNS/SES: Scale to support large volumes of notifications.

## Related Documentation

Main README
Backend README
Frontend README
API Documentation
Deployment Guide


---

🔙 [Back to Main Documentation](../../README.md)

