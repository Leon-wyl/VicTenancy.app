output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = module.api.api_endpoint
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = module.api.lambda_function_name
}

output "deployed_image_uri" {
  description = "Deployed ECR image URI"
  value       = var.image_uri
}

output "source_git_sha" {
  description = "Git SHA of the deployed source"
  value       = var.source_git_sha
}
