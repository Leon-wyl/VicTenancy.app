data "aws_kms_key" "lambda" {
  key_id = "alias/aws/lambda"
}

locals {
  name_prefix    = "victenancy-${var.environment}"
  api_stage_name = "$default"
  lambda_env = merge({
    NODE_ENV                 = "production"
    LOG_LEVEL                = var.log_level
    RUNTIME_SECRET_ARN       = var.runtime_secret_arn
    SUPABASE_URL             = "https://${var.supabase_project_ref}.supabase.co"
    SUPABASE_PUBLISHABLE_KEY = var.supabase_publishable_key
    SUPABASE_JWT_ISSUER      = "https://${var.supabase_project_ref}.supabase.co/auth/v1"
    SUPABASE_JWT_AUDIENCE    = "authenticated"
    REQUESTS_PER_MINUTE      = tostring(var.requests_per_minute)
    REQUESTS_PER_DAY         = tostring(var.requests_per_day)
  }, var.additional_env_vars)
}

resource "aws_cloudwatch_log_group" "lambda" {
  name                        = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days           = var.log_retention_days
  deletion_protection_enabled = true
  tags                        = var.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name                        = "/aws/apigateway/${local.name_prefix}-api"
  retention_in_days           = var.log_retention_days
  deletion_protection_enabled = true
  tags                        = var.tags
}

resource "aws_lambda_function" "api" {
  function_name                  = "${local.name_prefix}-api"
  role                           = var.execution_role_arn
  package_type                   = "Image"
  image_uri                      = var.image_uri
  architectures                  = ["x86_64"]
  memory_size                    = var.memory_mb
  timeout                        = 28
  reserved_concurrent_executions = var.reserved_concurrency
  kms_key_arn                    = data.aws_kms_key.lambda.arn
  publish                        = true
  environment { variables = local.lambda_env }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.lambda]

  # Releases update this function in place. A replacement or removal must be
  # an explicit infrastructure decision, never a side effect of a deploy plan.
  lifecycle { prevent_destroy = true }
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.api.function_name
  function_version = aws_lambda_function.api.version
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
  tags          = var.tags

  # Keep the public endpoint stable and prevent a partial deployment from
  # deleting it. Normal route, integration, stage, and tag updates continue.
  lifecycle { prevent_destroy = true }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = local.api_stage_name
  auto_deploy = true
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      integrationStatus  = "$context.integrationStatus"
      integrationLatency = "$context.integrationLatency"
      responseLatency    = "$context.responseLatency"
      responseLength     = "$context.responseLength"
    })
  }
  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_alias.live.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "GET /health"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "ANY /{proxy+}"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "health" {
  statement_id  = "AllowApiGatewayHealth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  qualifier     = aws_lambda_alias.live.name
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/${local.api_stage_name}/GET/health"
}

resource "aws_lambda_permission" "proxy" {
  statement_id  = "AllowApiGatewayProxy"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  qualifier     = aws_lambda_alias.live.name
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/${local.api_stage_name}/*/*"
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.name_prefix}-api-errors"
  alarm_description   = "Lambda invocation errors > 0"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions = {
    Resource = "${aws_lambda_function.api.function_name}:${aws_lambda_alias.live.name}"
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${local.name_prefix}-api-throttles"
  alarm_description   = "Lambda throttles > 0"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions = {
    Resource = "${aws_lambda_function.api.function_name}:${aws_lambda_alias.live.name}"
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "${local.name_prefix}-api-duration"
  alarm_description   = "Lambda p99 duration approaching timeout"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Maximum"
  threshold           = 25000
  treat_missing_data  = "notBreaching"
  dimensions = {
    Resource = "${aws_lambda_function.api.function_name}:${aws_lambda_alias.live.name}"
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name_prefix}-api-5xx"
  alarm_description   = "HTTP API 5xx errors > 0"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions = {
    ApiId = aws_apigatewayv2_api.api.id
    Stage = local.api_stage_name
  }
  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns
  tags          = var.tags
}
