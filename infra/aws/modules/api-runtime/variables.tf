variable "environment" {
  type        = string
  description = "Deployment environment name (e.g. dev, staging, prod)"
}

variable "image_uri" {
  type        = string
  description = "ECR image URI for the Lambda container"
}

variable "source_git_sha" {
  type        = string
  description = "Git commit SHA of the deployed source code"
}

variable "execution_role_arn" {
  type        = string
  description = "ARN of the Lambda execution IAM role"
}

variable "runtime_secret_arn" {
  type        = string
  description = "ARN of the Secrets Manager secret for runtime configuration"
}

variable "supabase_project_ref" {
  type        = string
  description = "Supabase project reference ID"
}

variable "supabase_publishable_key" {
  type        = string
  description = "Supabase publishable (anon) API key"
  sensitive   = true
}

variable "reserved_concurrency" {
  type        = number
  description = "Reserved concurrent Lambda executions"
  default     = 5
}

variable "memory_mb" {
  type        = number
  description = "Lambda memory allocation in MB"
  default     = 512
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

variable "log_level" {
  type        = string
  description = "Application log level"
  default     = "info"
}

variable "requests_per_minute" {
  type        = number
  description = "Rate limit requests per minute"
  default     = 20
}

variable "requests_per_day" {
  type        = number
  description = "Rate limit requests per day"
  default     = 200
}

variable "alarm_action_arns" {
  type        = list(string)
  description = "SNS topic ARNs for CloudWatch alarm actions"
  default     = []
}

variable "additional_env_vars" {
  type        = map(string)
  description = "Additional environment variables to pass to the Lambda"
  default     = {}
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
}
