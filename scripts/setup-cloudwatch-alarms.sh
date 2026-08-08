#!/usr/bin/env bash
# Creates a minimal set of CloudWatch alarms for the EC2 instance and the
# app's own logs. Run once from a machine with AWS CLI + credentials that
# can create CloudWatch resources (your laptop, or the EC2 host itself).
#
# This is intentionally a *starting point*, not a complete monitoring setup
# — see docs/PRODUCTION_READINESS.md for what's still missing (dashboards,
# more granular alarms, etc.).
#
# Usage:
#   INSTANCE_ID=i-0123456789 \
#   LOG_GROUP=/ai-mail-assistant \
#   SNS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:ops-alerts \
#   ./scripts/setup-cloudwatch-alarms.sh
set -euo pipefail

: "${INSTANCE_ID:?Set INSTANCE_ID (the EC2 instance running the app)}"
: "${LOG_GROUP:?Set LOG_GROUP (matches CLOUDWATCH_LOG_GROUP in docker-compose.prod.yml)}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
ALARM_ACTIONS=()
if [[ -n "$SNS_TOPIC_ARN" ]]; then
  ALARM_ACTIONS=(--alarm-actions "$SNS_TOPIC_ARN")
else
  echo "==> WARNING: SNS_TOPIC_ARN not set — alarms will be created with no notification target."
  echo "    You'll need to attach an action manually in the CloudWatch console."
fi

echo "==> Alarm: EC2 status check failed (system or instance)"
aws cloudwatch put-metric-alarm \
  --alarm-name "ai-mail-assistant-instance-status-check-failed" \
  --namespace "AWS/EC2" \
  --metric-name "StatusCheckFailed" \
  --dimensions "Name=InstanceId,Value=$INSTANCE_ID" \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data breaching \
  "${ALARM_ACTIONS[@]}"

echo "==> Alarm: high CPU utilization"
aws cloudwatch put-metric-alarm \
  --alarm-name "ai-mail-assistant-high-cpu" \
  --namespace "AWS/EC2" \
  --metric-name "CPUUtilization" \
  --dimensions "Name=InstanceId,Value=$INSTANCE_ID" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  "${ALARM_ACTIONS[@]}"

echo "==> Metric filter: count error-level log lines"
# Winston logs structured JSON in production (server/src/config/logger.ts) —
# this matches lines where the "level" field is "error", regardless of which
# service (api/worker) or log stream they came from within the group.
aws logs put-metric-filter \
  --log-group-name "$LOG_GROUP" \
  --filter-name "ai-mail-assistant-error-logs" \
  --filter-pattern '{ $.level = "error" }' \
  --metric-transformations \
    metricName=ErrorLogCount,metricNamespace=AiMailAssistant,metricValue=1,defaultValue=0

echo "==> Alarm: elevated error log rate"
aws cloudwatch put-metric-alarm \
  --alarm-name "ai-mail-assistant-error-log-rate" \
  --namespace "AiMailAssistant" \
  --metric-name "ErrorLogCount" \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 20 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  "${ALARM_ACTIONS[@]}"

echo "==> Done. View alarms: https://console.aws.amazon.com/cloudwatch/home#alarmsV2:"
