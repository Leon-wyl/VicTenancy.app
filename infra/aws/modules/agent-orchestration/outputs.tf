output "main_queue_url" {
  description = "Main SQS FIFO queue URL"
  value       = aws_sqs_queue.main.url
}

output "main_queue_arn" {
  description = "Main SQS FIFO queue ARN"
  value       = aws_sqs_queue.main.arn
}

output "dlq_url" {
  description = "Dead-letter SQS FIFO queue URL"
  value       = aws_sqs_queue.dlq.url
}

output "dlq_arn" {
  description = "Dead-letter SQS FIFO queue ARN"
  value       = aws_sqs_queue.dlq.arn
}

output "dispatcher_function_arn" {
  description = "Dispatcher Lambda function ARN"
  value       = aws_lambda_function.dispatcher.arn
}

output "worker_function_arn" {
  description = "Worker Lambda function ARN"
  value       = aws_lambda_function.worker.arn
}

output "terminalizer_function_arn" {
  description = "Terminalizer Lambda function ARN"
  value       = aws_lambda_function.terminalizer.arn
}

output "deployed_image_uri" {
  description = "Image URI deployed to Lambda"
  value       = var.image_uri
}

output "source_git_sha" {
  description = "Git SHA of the deployed source"
  value       = var.source_git_sha
}
