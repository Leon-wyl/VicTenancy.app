variable "region" {
  type        = string
  description = "AWS region"
  default     = "ap-southeast-2"
}

variable "allowed_account_id" {
  type        = string
  description = "AWS account ID"
  validation {
    condition     = can(regex("^[0-9]{12}$", var.allowed_account_id))
    error_message = "allowed_account_id must be a 12-digit AWS account ID."
  }
}

variable "state_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for Terraform state"
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_name must be a valid S3 bucket name."
  }
}

variable "github_org" {
  type        = string
  description = "GitHub organization or user name"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name"
}

variable "github_org_id" {
  type        = string
  description = "Numeric GitHub organization or user ID used in OIDC subject claims"
  validation {
    condition     = can(regex("^[0-9]+$", var.github_org_id))
    error_message = "github_org_id must contain only digits."
  }
}

variable "github_repo_id" {
  type        = string
  description = "Numeric GitHub repository ID used in OIDC subject claims"
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repo_id))
    error_message = "github_repo_id must contain only digits."
  }
}
