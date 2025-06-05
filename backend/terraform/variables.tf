variable "region" {
  description = "AWS region"
  default     = "eu-west-1"
}

# variable "region" {
#   description = "AWS region for deployment"
#   type        = string
#   default     = "us-east-1"
  
#   validation {
#     condition = can(regex("^[a-z0-9-]+$", var.region))
#     error_message = "Region must be a valid AWS region name."
#   }
# }

# variable "environment" {
#   description = "Environment name (e.g., dev, staging, prod)"
#   type        = string
#   default     = "dev"
  
#   validation {
#     condition = contains(["dev", "staging", "prod"], var.region)
#     error_message = "Environment must be one of: dev, staging, prod."
#   }
# }

# variable "project_name" {
#   description = "Name of the project"
#   type        = string
#   default     = "task-management"
  
#   validation {
#     condition = can(regex("^[a-z0-9-]+$", var.project_name))
#     error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
#   }
# }