locals {
  name_prefix = "victenancy-${var.environment}"

  shared_env = {
    NODE_ENV     = "production"
    SUPABASE_URL = "https://${var.supabase_project_ref}.supabase.co"
  }

  base_runtime_env = {
    RUNTIME_SECRET_ARN = var.runtime_secret_arn
  }

  agent_runtime_env = {
    AGENT_RUNTIME_MODE            = var.agent_runtime_mode
    AGENT_RUNTIME_INVOKE_URL      = var.agent_runtime_invoke_url
    AGENT_RUNTIME_EXECUTE_API_ARN = var.agent_runtime_execute_api_arn
  }

  common_tags = merge(var.tags, {
    SourceGitSha = var.source_git_sha
  })
}

# =============================================================================
# SQS FIFO queues
# =============================================================================

resource "aws_sqs_queue" "main" {
  name                        = "${local.name_prefix}-agent-jobs.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  deduplication_scope         = "queue"
  sqs_managed_sse_enabled     = true
  visibility_timeout_seconds  = var.sqs_visibility_timeout_seconds
  message_retention_seconds   = var.queue_retention_seconds
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
  tags = local.common_tags
}

resource "aws_sqs_queue" "dlq" {
  name                        = "${local.name_prefix}-agent-jobs-dlq.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  deduplication_scope         = "queue"
  sqs_managed_sse_enabled     = true
  visibility_timeout_seconds  = var.dlq_visibility_timeout_seconds
  message_retention_seconds   = var.dlq_retention_seconds
  tags                        = local.common_tags
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================

resource "aws_cloudwatch_log_group" "dispatcher" {
  name              = "/aws/lambda/${local.name_prefix}-dispatcher"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.name_prefix}-worker"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "terminalizer" {
  name              = "/aws/lambda/${local.name_prefix}-terminalizer"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# =============================================================================
# IAM Execution Roles
# =============================================================================

# =============================================================================
# IAM Execution Roles
# =============================================================================

resource "aws_iam_role" "dispatcher" {
  name = "${local.name_prefix}-dispatcher-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role" "worker" {
  name = "${local.name_prefix}-worker-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role" "terminalizer" {
  name = "${local.name_prefix}-terminalizer-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

# =============================================================================
# IAM Role Policies
# =============================================================================

resource "aws_iam_role_policy" "dispatcher" {
  name = "${local.name_prefix}-dispatcher"
  role = aws_iam_role.dispatcher.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.runtime_secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.dispatcher.arn}:log-stream:*"]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [aws_sqs_queue.main.arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "worker" {
  name = "${local.name_prefix}-worker"
  role = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.runtime_secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.worker.arn}:log-stream:*"]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility",
        ]
        Resource = [aws_sqs_queue.main.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["execute-api:Invoke"]
        Resource = [var.agent_runtime_execute_api_arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "terminalizer" {
  name = "${local.name_prefix}-terminalizer"
  role = aws_iam_role.terminalizer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.runtime_secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.terminalizer.arn}:log-stream:*"]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility",
        ]
        Resource = [aws_sqs_queue.dlq.arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "api_sqs_send" {
  name = "${local.name_prefix}-api-sqs-send"
  role = var.api_execution_role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [aws_sqs_queue.main.arn]
      },
    ]
  })
}

# =============================================================================
# Lambda Functions (same image, distinct image_config commands)
# =============================================================================

resource "aws_lambda_function" "dispatcher" {
  function_name                  = "${local.name_prefix}-dispatcher"
  role                           = aws_iam_role.dispatcher.arn
  package_type                   = "Image"
  image_uri                      = var.image_uri
  architectures                  = ["x86_64"]
  memory_size                    = 512
  timeout                        = 60
  reserved_concurrent_executions = -1
  publish                        = true
  image_config {
    command = ["dist/dispatcher.handler"]
  }
  environment {
    variables = merge(
      local.shared_env,
      local.base_runtime_env,
      { SQS_MAIN_QUEUE_URL = aws_sqs_queue.main.url },
    )
  }
  tags       = local.common_tags
  depends_on = [aws_cloudwatch_log_group.dispatcher]
}

resource "aws_lambda_function" "worker" {
  function_name                  = "${local.name_prefix}-worker"
  role                           = aws_iam_role.worker.arn
  package_type                   = "Image"
  image_uri                      = var.image_uri
  architectures                  = ["x86_64"]
  memory_size                    = 512
  timeout                        = var.worker_timeout_seconds
  reserved_concurrent_executions = -1
  publish                        = true
  image_config {
    command = ["dist/worker.handler"]
  }
  environment {
    variables = merge(
      local.shared_env,
      local.base_runtime_env,
      local.agent_runtime_env,
    )
  }
  tags       = local.common_tags
  depends_on = [aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_function" "terminalizer" {
  function_name                  = "${local.name_prefix}-terminalizer"
  role                           = aws_iam_role.terminalizer.arn
  package_type                   = "Image"
  image_uri                      = var.image_uri
  architectures                  = ["x86_64"]
  memory_size                    = 512
  timeout                        = var.terminalizer_timeout_seconds
  reserved_concurrent_executions = -1
  publish                        = true
  image_config {
    command = ["dist/terminalizer.handler"]
  }
  environment {
    variables = merge(
      local.shared_env,
      local.base_runtime_env,
    )
  }
  tags       = local.common_tags
  depends_on = [aws_cloudwatch_log_group.terminalizer]
}

# =============================================================================
# EventBridge scheduled rule — dispatcher every 60 seconds
# =============================================================================

resource "aws_cloudwatch_event_rule" "dispatcher_invoke" {
  name                = "${local.name_prefix}-dispatcher-invoke"
  description         = "Triggers the dispatcher Lambda every 60 seconds"
  schedule_expression = "rate(1 minute)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "dispatcher" {
  rule      = aws_cloudwatch_event_rule.dispatcher_invoke.name
  arn       = aws_lambda_function.dispatcher.arn
  target_id = "${local.name_prefix}-dispatcher"
}

resource "aws_lambda_permission" "dispatcher_event" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dispatcher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.dispatcher_invoke.arn
}

# =============================================================================
# Event Source Mappings (SQS → Lambda)
# =============================================================================

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn        = aws_sqs_queue.main.arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config {
    maximum_concurrency = var.worker_max_concurrency
  }
  depends_on = [
    aws_iam_role_policy.worker,
    aws_iam_role_policy.api_sqs_send,
  ]
}

resource "aws_lambda_event_source_mapping" "terminalizer" {
  event_source_arn        = aws_sqs_queue.dlq.arn
  function_name           = aws_lambda_function.terminalizer.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  depends_on = [
    aws_iam_role_policy.terminalizer,
  ]
}

# =============================================================================
# CloudWatch Alarms
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "worker_errors" {
  alarm_name          = "${local.name_prefix}-worker-errors"
  alarm_description   = "Worker Lambda invocation errors > 0"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions = {
    FunctionName = aws_lambda_function.worker.function_name
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "worker_duration" {
  alarm_name          = "${local.name_prefix}-worker-duration"
  alarm_description   = "Worker Lambda p99 duration > 30s"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 60
  extended_statistic  = "p99"
  threshold           = 30000
  treat_missing_data  = "notBreaching"
  dimensions = {
    FunctionName = aws_lambda_function.worker.function_name
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_name          = "${local.name_prefix}-queue-age"
  alarm_description   = "Oldest message in main queue > 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.main.name
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "queue_backlog" {
  alarm_name          = "${local.name_prefix}-queue-backlog"
  alarm_description   = "Main queue backlog > 50 messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.main.name
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_visible" {
  alarm_name          = "${local.name_prefix}-dlq-visible"
  alarm_description   = "DLQ has messages > 0"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = local.common_tags
}
