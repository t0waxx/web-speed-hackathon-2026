# Cloud Run サービス本体
resource "google_cloud_run_v2_service" "default" {
  name     = var.service_name
  location = var.region

  template {
    scaling {
      min_instance_count = 1
    }

    containers {
      image = local.docker_image

      ports {
        container_port = 8080 # DockerfileのEXPOSEやアプリの起動ポートと合わせる
      }

      resources {
        limits = {
          cpu    = "4000m"
          memory = "4Gi"
        }
        cpu_idle = false
      }
    }
  }
}

# 全員（インターネット）からのアクセスを許可
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
