locals {
  bootstrap_state_key      = "bootstrap/terraform.tfstate"
  api_staging_state_key    = "api/staging/terraform.tfstate"
  api_production_state_key = "api/production/terraform.tfstate"
  staging_oidc_sub         = "repo:${var.github_org}@${var.github_org_id}/${var.github_repo}@${var.github_repo_id}:environment:staging"
  production_oidc_sub      = "repo:${var.github_org}@${var.github_org_id}/${var.github_repo}@${var.github_repo_id}:environment:production"
}

resource "aws_iam_role" "lambda_execution_staging" {
  name = "victenancy-staging-lambda-exec"
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

resource "aws_iam_role" "lambda_execution_production" {
  name = "victenancy-production-lambda-exec"
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

resource "aws_secretsmanager_secret" "runtime_staging" {
  name = "/victenancy/staging/api/runtime"
  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "runtime_production" {
  name = "/victenancy/production/api/runtime"
  tags = local.common_tags
}

resource "aws_iam_role_policy" "lambda_execution_staging" {
  name = "victenancy-staging-lambda-runtime"
  role = aws_iam_role.lambda_execution_staging.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.runtime_staging.arn]
      },
      {
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/victenancy-staging-api:log-stream:*",
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy" "lambda_execution_production" {
  name = "victenancy-production-lambda-runtime"
  role = aws_iam_role.lambda_execution_production.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.runtime_production.arn]
      },
      {
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/victenancy-production-api:log-stream:*",
        ]
      },
    ]
  })
}

data "aws_iam_policy_document" "oidc_staging_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.staging_oidc_sub]
    }
  }
}

resource "aws_iam_role" "deploy_staging" {
  name               = "victenancy-staging-deploy"
  assume_role_policy = data.aws_iam_policy_document.oidc_staging_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "deploy_staging" {
  name = "victenancy-staging-deploy"
  role = aws_iam_role.deploy_staging.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.terraform_state.arn]
        Condition = {
          StringLike = {
            "s3:prefix" = ["bootstrap/terraform.tfstate", "api/staging/*"]
          }
        }
      },
      {
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "${aws_s3_bucket.terraform_state.arn}/bootstrap/terraform.tfstate",
          "${aws_s3_bucket.terraform_state.arn}/api/staging/*",
        ]
      },
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.terraform_state.arn}/api/staging/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:PutImage",
          "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:DescribeImages", "ecr:DescribeRepositories",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction", "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration", "lambda:CreateAlias",
          "lambda:UpdateAlias", "lambda:DeleteFunction", "lambda:DeleteAlias",
          "lambda:GetFunction", "lambda:GetFunctionConfiguration",
          "lambda:GetAlias", "lambda:ListVersionsByFunction", "lambda:PublishVersion",
          "lambda:ListAliases", "lambda:GetFunctionCodeSigningConfig",
          "lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency",
          "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy",
          "lambda:TagResource", "lambda:UntagResource", "lambda:ListTags",
        ]
        Resource = [
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-api",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-api:*",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-dispatcher",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-dispatcher:*",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-worker",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-worker:*",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-terminalizer",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-terminalizer:*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "apigateway:POST", "apigateway:PUT", "apigateway:PATCH",
          "apigateway:DELETE", "apigateway:GET",
          "apigateway:TagResource", "apigateway:UntagResource",
        ]
        Resource = [
          "arn:aws:apigateway:${var.region}::/apis",
          "arn:aws:apigateway:${var.region}::/apis/*",
          "arn:aws:apigateway:${var.region}::/tags/*",
          "arn:aws:apigateway:${var.region}::/apis/*/stages/*",
          "arn:aws:apigateway:${var.region}::/apis/*/routes/*",
          "arn:aws:apigateway:${var.region}::/apis/*/integrations/*",
        ]
      },
      {
        # Event source mapping APIs authorize against the mapping ARN, not the
        # Lambda function ARN used by the function lifecycle statement above.
        Effect   = "Allow"
        Action   = ["lambda:CreateEventSourceMapping"]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateEventSourceMapping", "lambda:DeleteEventSourceMapping",
          "lambda:GetEventSourceMapping",
        ]
        Resource = [
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:event-source-mapping:*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy",
          "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
        ]
        Resource = [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/victenancy-staging*",
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/victenancy-staging*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups", "logs:DescribeResourcePolicies",
          "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery", "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms", "cloudwatch:TagResource",
          "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource",
        ]
        Resource = [
          "arn:aws:cloudwatch:${var.region}:${data.aws_caller_identity.current.account_id}:alarm:victenancy-staging*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:CreateQueue", "sqs:DeleteQueue", "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl", "sqs:ListQueues", "sqs:SetQueueAttributes",
          "sqs:ListQueueTags", "sqs:ListDeadLetterSourceQueues",
          "sqs:TagQueue", "sqs:UntagQueue",
        ]
        Resource = [
          "arn:aws:sqs:${var.region}:${data.aws_caller_identity.current.account_id}:victenancy-staging-*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "events:PutRule", "events:PutTargets", "events:DeleteRule",
          "events:RemoveTargets", "events:DescribeRule", "events:ListTargetsByRule",
          "events:ListTagsForResource",
          "events:TagResource", "events:UntagResource",
        ]
        Resource = [
          "arn:aws:events:${var.region}:${data.aws_caller_identity.current.account_id}:rule/victenancy-staging-*",
        ]
      },
      {
        Effect = "Allow"
        Action = ["events:PutTargets", "events:RemoveTargets"]
        Resource = [
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-dispatcher",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:CreateRole", "iam:DeleteRole", "iam:PutRolePolicy",
          "iam:DeleteRolePolicy", "iam:GetRole", "iam:UpdateAssumeRolePolicy",
          "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole", "iam:ListRoleTags",
          "iam:TagRole", "iam:UntagRole", "iam:PassRole",
        ]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/victenancy-staging-dispatcher-exec",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/victenancy-staging-worker-exec",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/victenancy-staging-terminalizer-exec",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:GetRole", "iam:PassRole", "iam:PutRolePolicy",
          "iam:DeleteRolePolicy", "iam:GetRolePolicy", "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
        ]
        Resource = [aws_iam_role.lambda_execution_staging.arn]
      },
      {
        # These read operations do not support a resource ARN in IAM and are
        # required by Terraform during provider refresh.
        Effect = "Allow"
        Action = [
          "lambda:GetAccountSettings", "lambda:ListFunctions",
          "lambda:ListEventSourceMappings", "sqs:ListQueues",
          "events:ListRules", "events:ListRuleNamesByTarget",
          "events:ListTargetsByRule",
        ]
        Resource = ["*"]
      },
    ]
  })
}

data "aws_iam_policy_document" "oidc_production_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.production_oidc_sub]
    }
  }
}

resource "aws_iam_role" "deploy_production" {
  name               = "victenancy-production-deploy"
  assume_role_policy = data.aws_iam_policy_document.oidc_production_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "deploy_production" {
  name = "victenancy-production-deploy"
  role = aws_iam_role.deploy_production.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.terraform_state.arn]
        Condition = {
          StringLike = {
            "s3:prefix" = ["bootstrap/terraform.tfstate", "api/production/*"]
          }
        }
      },
      {
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "${aws_s3_bucket.terraform_state.arn}/bootstrap/terraform.tfstate",
          "${aws_s3_bucket.terraform_state.arn}/api/production/*",
        ]
      },
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.terraform_state.arn}/api/production/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
          "ecr:DescribeImages", "ecr:DescribeRepositories",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction", "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration", "lambda:CreateAlias",
          "lambda:UpdateAlias", "lambda:DeleteFunction", "lambda:DeleteAlias",
          "lambda:GetFunction", "lambda:GetFunctionConfiguration",
          "lambda:GetAlias", "lambda:ListVersionsByFunction", "lambda:PublishVersion",
          "lambda:ListAliases", "lambda:GetFunctionCodeSigningConfig",
          "lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency",
          "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy",
          "lambda:TagResource", "lambda:UntagResource", "lambda:ListTags",
        ]
        Resource = [
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-api",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-api:*",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-dispatcher",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-dispatcher:*",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-worker",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-worker:*",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-terminalizer",
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-terminalizer:*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "apigateway:POST", "apigateway:PUT", "apigateway:PATCH",
          "apigateway:DELETE", "apigateway:GET",
          "apigateway:TagResource", "apigateway:UntagResource",
        ]
        Resource = [
          "arn:aws:apigateway:${var.region}::/apis",
          "arn:aws:apigateway:${var.region}::/apis/*",
          "arn:aws:apigateway:${var.region}::/tags/*",
          "arn:aws:apigateway:${var.region}::/apis/*/stages/*",
          "arn:aws:apigateway:${var.region}::/apis/*/routes/*",
          "arn:aws:apigateway:${var.region}::/apis/*/integrations/*",
        ]
      },
      {
        # Event source mapping APIs authorize against the mapping ARN, not the
        # Lambda function ARN used by the function lifecycle statement above.
        Effect   = "Allow"
        Action   = ["lambda:CreateEventSourceMapping"]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateEventSourceMapping", "lambda:DeleteEventSourceMapping",
          "lambda:GetEventSourceMapping",
        ]
        Resource = [
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:event-source-mapping:*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy",
          "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
        ]
        Resource = [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/victenancy-production*",
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/victenancy-production*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups", "logs:DescribeResourcePolicies",
          "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery", "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms", "cloudwatch:TagResource",
          "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource",
        ]
        Resource = [
          "arn:aws:cloudwatch:${var.region}:${data.aws_caller_identity.current.account_id}:alarm:victenancy-production*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:CreateQueue", "sqs:DeleteQueue", "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl", "sqs:ListQueues", "sqs:SetQueueAttributes",
          "sqs:ListQueueTags", "sqs:ListDeadLetterSourceQueues",
          "sqs:TagQueue", "sqs:UntagQueue",
        ]
        Resource = [
          "arn:aws:sqs:${var.region}:${data.aws_caller_identity.current.account_id}:victenancy-production-*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "events:PutRule", "events:PutTargets", "events:DeleteRule",
          "events:RemoveTargets", "events:DescribeRule", "events:ListTargetsByRule",
          "events:ListTagsForResource",
          "events:TagResource", "events:UntagResource",
        ]
        Resource = [
          "arn:aws:events:${var.region}:${data.aws_caller_identity.current.account_id}:rule/victenancy-production-*",
        ]
      },
      {
        Effect = "Allow"
        Action = ["events:PutTargets", "events:RemoveTargets"]
        Resource = [
          "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-dispatcher",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:CreateRole", "iam:DeleteRole", "iam:PutRolePolicy",
          "iam:DeleteRolePolicy", "iam:GetRole", "iam:UpdateAssumeRolePolicy",
          "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole", "iam:ListRoleTags",
          "iam:TagRole", "iam:UntagRole", "iam:PassRole",
        ]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/victenancy-production-dispatcher-exec",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/victenancy-production-worker-exec",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/victenancy-production-terminalizer-exec",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:GetRole", "iam:PassRole", "iam:PutRolePolicy",
          "iam:DeleteRolePolicy", "iam:GetRolePolicy", "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
        ]
        Resource = [aws_iam_role.lambda_execution_production.arn]
      },
      {
        # These read operations do not support a resource ARN in IAM and are
        # required by Terraform during provider refresh.
        Effect = "Allow"
        Action = [
          "lambda:GetAccountSettings", "lambda:ListFunctions",
          "lambda:ListEventSourceMappings", "sqs:ListQueues",
          "events:ListRules", "events:ListRuleNamesByTarget",
          "events:ListTargetsByRule",
        ]
        Resource = ["*"]
      },
    ]
  })
}
