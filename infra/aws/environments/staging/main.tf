data "terraform_remote_state" "bootstrap" {
  backend = "s3"
  config = {
    bucket = var.state_bucket_name
    key    = "bootstrap/terraform.tfstate"
    region = var.region
  }
}

module "api" {
  source = "../../modules/api-runtime"

  environment              = "staging"
  image_uri                = var.image_uri
  source_git_sha           = var.source_git_sha
  execution_role_arn       = data.terraform_remote_state.bootstrap.outputs.lambda_execution_role_arn_staging
  runtime_secret_arn       = data.terraform_remote_state.bootstrap.outputs.runtime_secret_arn_staging
  supabase_project_ref     = var.supabase_project_ref
  supabase_publishable_key = var.supabase_publishable_key
  # The account concurrency quota is 10, and AWS requires at least 10
  # unreserved executions. Keep this function in the shared pool.
  reserved_concurrency = -1
  memory_mb            = 512
  log_level            = "info"
  requests_per_minute  = 20
  requests_per_day     = 200
  tags                 = local.tags

  additional_env_vars = {
    AGENT_RUNTIME_MODE            = var.agent_runtime_mode
    SQS_MAIN_QUEUE_URL            = module.agent_orchestration.main_queue_url
    AGENT_RUNTIME_INVOKE_URL      = var.agent_runtime_invoke_url
    AGENT_RUNTIME_EXECUTE_API_ARN = var.agent_runtime_execute_api_arn
  }
}

module "agent_orchestration" {
  source = "../../modules/agent-orchestration"

  environment                   = "staging"
  image_uri                     = var.image_uri
  source_git_sha                = var.source_git_sha
  runtime_secret_arn            = data.terraform_remote_state.bootstrap.outputs.runtime_secret_arn_staging
  api_execution_role_name       = data.terraform_remote_state.bootstrap.outputs.lambda_execution_role_name_staging
  supabase_project_ref          = var.supabase_project_ref
  agent_runtime_mode            = var.agent_runtime_mode
  agent_runtime_invoke_url      = var.agent_runtime_invoke_url
  agent_runtime_execute_api_arn = var.agent_runtime_execute_api_arn
  tags                          = local.tags
}
