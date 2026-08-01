variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-2"
}

variable "state_bucket_name" {
  description = "S3 bucket name for Terraform state"
  type        = string
}

variable "image_uri" {
  description = "ECR image URI for the Lambda runtime"
  type        = string
}

variable "source_git_sha" {
  description = "Git SHA of the deployed source code"
  type        = string
}

variable "supabase_project_ref" {
  description = "Supabase project reference"
  type        = string
}

variable "supabase_publishable_key" {
  description = "Supabase publishable key"
  type        = string
  sensitive   = true
}

variable "github_org" {
  description = "GitHub organization"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "agent_runtime_mode" {
  description = "AGENT_RUNTIME_MODE: local or aws_iam"
  type        = string
}

variable "agent_runtime_invoke_url" {
  description = "Agent Runtime invoke URL (shared endpoint)"
  type        = string
}

variable "agent_runtime_execute_api_arn" {
  description = "Exact execute-api ARN for POST /api/agent/invoke"
  type        = string
}
