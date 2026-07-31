terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags { tags = local.tags }
}

locals {
  project     = "victenancy"
  environment = "production"
  tags = {
    Project          = local.project
    Environment      = local.environment
    ManagedBy        = "terraform"
    SourceRepository = "github.com/${var.github_org}/${var.github_repo}"
  }
}
