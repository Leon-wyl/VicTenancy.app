variable "environment" {
  type        = string
  description = "Deployment environment name (staging or production)"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "image_uri" {
  type        = string
  description = "ECR image URI for the Lambda container (same image, distinct image_config commands)"
}

variable "source_git_sha" {
  type        = string
  description = "Git commit SHA of the deployed source code"
}

variable "runtime_secret_arn" {
  type        = string
  description = "ARN of the Secrets Manager secret for runtime DATABASE_URL"
}

variable "api_execution_role_name" {
  type        = string
  description = "Name of the existing API Lambda execution role (for attaching SQS SendMessage)"
}

variable "supabase_project_ref" {
  type        = string
  description = "Supabase project reference ID"
}

variable "agent_runtime_mode" {
  type        = string
  description = "AGENT_RUNTIME_MODE: local or aws_iam"
  validation {
    condition     = contains(["local", "aws_iam"], var.agent_runtime_mode)
    error_message = "agent_runtime_mode must be local or aws_iam"
  }
}

variable "agent_runtime_invoke_url" {
  type        = string
  description = "Agent Runtime invoke URL (shared endpoint)"
}

variable "agent_runtime_execute_api_arn" {
  type        = string
  description = "Exact execute-api ARN for POST /api/agent/invoke"
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

variable "alarm_action_arns" {
  type        = list(string)
  description = "SNS topic ARNs for CloudWatch alarm actions"
  default     = []
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
}

variable "worker_timeout_seconds" {
  type        = number
  description = "Worker Lambda execution timeout"
  default     = 60
}

variable "worker_lease_seconds" {
  type        = number
  description = "Job processing lease duration (must be < visibility_timeout)"
  default     = 120
}

variable "sqs_visibility_timeout_seconds" {
  type        = number
  description = "SQS main-queue visibility timeout (must be >= lease + buffer)"
  default     = 150
}

variable "worker_max_concurrency" {
  type        = number
  description = "Maximum concurrent worker invocations via event-source scaling (AWS minimum: 2)"
  default     = 2
  validation {
    condition     = var.worker_max_concurrency >= 2
    error_message = "worker_max_concurrency must be at least 2 because AWS Lambda SQS event source scaling requires a minimum of 2."
  }
}

variable "queue_retention_seconds" {
  type        = number
  description = "Message retention in the main FIFO queue"
  default     = 345600 # 4 days
}

variable "dlq_retention_seconds" {
  type        = number
  description = "Message retention in the DLQ"
  default     = 1209600 # 14 days
}
