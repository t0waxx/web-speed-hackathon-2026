#!/usr/bin/env bash
# Cloud Build でイメージを push し、続けて Terraform で Cloud Run + LB を更新する
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$REPO_ROOT/terraform"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-asia-northeast1}"
ARTIFACT_REPO="${ARTIFACT_REPOSITORY:-web-speed-hackathon-2026}"
ARTIFACT_IMAGE="${ARTIFACT_IMAGE_NAME:-app}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-wsh-app}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "エラー: GCP プロジェクトが未設定です。gcloud config set project <ID> または GCP_PROJECT_ID を設定してください。" >&2
  exit 1
fi

TAG="${1:-$(git -C "$REPO_ROOT" rev-parse --short HEAD)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${ARTIFACT_IMAGE}:${TAG}"

echo "==> Cloud Build: ${IMAGE}"
gcloud builds submit "${REPO_ROOT}" \
  --config="${REPO_ROOT}/cloudbuild.yaml" \
  --substitutions="_IMAGE=${IMAGE}" \
  --project="${PROJECT_ID}" \
  --quiet

TFVARS_ARGS=()
# -chdir しても -var-file は「実行時のカレント」基準のため絶対パスにする
if [[ -f "${TF_DIR}/terraform.tfvars" ]]; then
  TFVARS_ARGS=(-var-file="${TF_DIR}/terraform.tfvars")
fi

echo "==> Terraform apply（image_tag=${TAG}）"
terraform -chdir="${TF_DIR}" apply -auto-approve \
  "${TFVARS_ARGS[@]}" \
  -var="project_id=${PROJECT_ID}" \
  -var="image_tag=${TAG}"

# Terraform は同一タグのイメージ差し替えを検知しないため、常に新リビジョンを強制作成する
echo "==> Cloud Run 新リビジョン作成（${SERVICE_NAME}）"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --quiet

echo "==> 完了。LB IP は terraform output -chdir=${TF_DIR} load_balancer_ip で確認できます。"
