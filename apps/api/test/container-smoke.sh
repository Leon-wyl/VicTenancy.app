#!/bin/bash
# Manual smoke test for the Lambda container image.
# Requires: Docker, valid AWS credentials, and RUNTIME_SECRET_ARN pointing
# to a Secrets Manager secret containing {"DATABASE_URL":"postgresql://..."}.
#
# Usage:
#   docker build -f apps/api/Dockerfile.lambda -t victenancy-api:test .
#   docker run --rm -p 9000:8080 \
#     -e RUNTIME_SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:..." \
#     -e AWS_REGION="ap-southeast-2" \
#     -e AWS_ACCESS_KEY_ID="..." \
#     -e AWS_SECRET_ACCESS_KEY="..." \
#     -e AWS_SESSION_TOKEN="..." \
#     victenancy-api:test &
#
#   curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
#     -H "Content-Type: application/json" \
#     -d '{
#       "version": "2.0",
#       "routeKey": "GET /health",
#       "rawPath": "/health",
#       "headers": {},
#       "requestContext": {
#         "http": { "method": "GET", "path": "/health" }
#       }
#     }'
#
# Expected: {"statusCode":200,"body":"{\"status\":\"ok\"}"}

set -euo pipefail

echo "This is a manual smoke test. It requires:"
echo "  1. A built Lambda container image (victenancy-api:test)"
echo "  2. AWS credentials with access to the RUNTIME_SECRET_ARN secret"
echo "  3. A Secrets Manager secret with a valid DATABASE_URL"
echo ""
echo "See comments in this script for the exact docker run and curl commands."
echo "Run the container with 'npm run docker:smoke' or see the ops runbook."
