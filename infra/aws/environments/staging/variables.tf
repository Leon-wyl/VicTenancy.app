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
