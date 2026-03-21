variable "project_id" {
  description = "GCPのプロジェクトID"
  type        = string
}

variable "region" {
  description = "デプロイするリージョン"
  type        = string
  default     = "asia-northeast1" # 東京リージョン
}

variable "service_name" {
  description = "Cloud Runのサービス名"
  type        = string
  default     = "wsh-app"
}

variable "docker_image" {
  description = "Artifact Registry のイメージを image:tag で丸ごと指定するとき（空なら registry_image_base またはデフォルトパス + image_tag を使用）"
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "プッシュしたイメージのタグ（例: git short SHA）。docker_image が空のとき必須"
  type        = string
  default     = ""
}

variable "artifact_location" {
  description = "Artifact Registry のリージョン（ホスト名の asia-northeast1 部分）"
  type        = string
  default     = "asia-northeast1"
}

variable "artifact_repository" {
  description = "Artifact Registry のリポジトリ名"
  type        = string
  default     = "web-speed-hackathon-2026"
}

variable "artifact_image_name" {
  description = "リポジトリ内のイメージ名（Docker イメージ名）"
  type        = string
  default     = "app"
}

variable "registry_image_base" {
  description = "タグを除いたレジストリパス（上書きしたいときのみ指定）"
  type        = string
  default     = ""
}
