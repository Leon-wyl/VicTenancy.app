output "api_endpoint" {
  description = "HTTP API endpoint URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

output "lambda_alias_arn" {
  description = "Lambda alias ARN"
  value       = aws_lambda_alias.live.arn
}

output "deployed_image_uri" {
  description = "Image URI deployed to Lambda"
  value       = var.image_uri
}

output "source_git_sha" {
  description = "Git SHA of the deployed source"
  value       = var.source_git_sha
}
