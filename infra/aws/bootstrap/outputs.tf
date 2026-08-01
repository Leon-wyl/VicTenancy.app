output "state_bucket_name" {
  description = "S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_region" {
  description = "Region of the state bucket"
  value       = var.region
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name"
  value       = aws_ecr_repository.api.name
}

output "deploy_role_arn_staging" {
  description = "GitHub OIDC deploy role ARN for staging"
  value       = aws_iam_role.deploy_staging.arn
}

output "deploy_role_arn_production" {
  description = "GitHub OIDC deploy role ARN for production"
  value       = aws_iam_role.deploy_production.arn
}

output "lambda_execution_role_arn_staging" {
  description = "Lambda execution role ARN for staging"
  value       = aws_iam_role.lambda_execution_staging.arn
}

output "lambda_execution_role_arn_production" {
  description = "Lambda execution role ARN for production"
  value       = aws_iam_role.lambda_execution_production.arn
}

output "lambda_execution_role_name_staging" {
  description = "Lambda execution role name for staging"
  value       = aws_iam_role.lambda_execution_staging.name
}

output "lambda_execution_role_name_production" {
  description = "Lambda execution role name for production"
  value       = aws_iam_role.lambda_execution_production.name
}

output "runtime_secret_arn_staging" {
  description = "Secrets Manager secret ARN for staging"
  value       = aws_secretsmanager_secret.runtime_staging.arn
}

output "runtime_secret_arn_production" {
  description = "Secrets Manager secret ARN for production"
  value       = aws_secretsmanager_secret.runtime_production.arn
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.github.arn
}
