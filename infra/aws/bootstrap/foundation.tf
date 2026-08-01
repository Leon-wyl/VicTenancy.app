locals {
  project     = "victenancy"
  environment = "bootstrap"

  common_tags = {
    Project          = local.project
    Environment      = local.environment
    ManagedBy        = "terraform"
    SourceRepository = "github.com/${var.github_org}/${var.github_repo}"
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_s3_bucket" "terraform_state" {
  bucket        = var.state_bucket_name
  force_destroy = false
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

data "aws_iam_policy_document" "enforce_tls" {
  statement {
    sid     = "DenyNonTLSRequests"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "enforce_tls" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.enforce_tls.json
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_ecr_repository" "api" {
  name                 = "victenancy-api"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  encryption_configuration { encryption_type = "AES256" }
  image_scanning_configuration { scan_on_push = true }
  tags = local.common_tags
}

# Lambda retrieves image layers as an AWS service, independently of the
# GitHub deployment role. Limit access to this account's two managed functions.
resource "aws_ecr_repository_policy" "lambda_image_retrieval" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowVicTenancyLambdaImageRetrieval"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
          ArnLike = {
            "aws:SourceArn" = [
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-api",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-api",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-dispatcher",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-worker",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-staging-terminalizer",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-dispatcher",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-worker",
              "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:victenancy-production-terminalizer",
            ]
          }
        }
      },
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after one day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Retain the ten most recent tagged images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
