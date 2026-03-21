# Serverless Network Endpoint Group（Cloud Run をバックエンドにする）
resource "google_compute_region_network_endpoint_group" "serverless_neg" {
  name                  = "${var.service_name}-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.default.name
  }
}

# Backend Service（ここで Cloud CDN を有効化）
resource "google_compute_backend_service" "default" {
  name                  = "${var.service_name}-backend"
  protocol              = "HTTP"
  port_name             = "http"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group           = google_compute_region_network_endpoint_group.serverless_neg.id
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }

  enable_cdn = true

  cdn_policy {
    cache_mode  = "USE_ORIGIN_HEADERS" # オリジンの Cache-Control ヘッダーを尊重
    default_ttl = 0
    client_ttl  = 0
    max_ttl     = 86400
    signed_url_cache_max_age_sec = 0
  }
}

# URL Map（デフォルトは上記バックエンドへ）
resource "google_compute_url_map" "default" {
  name            = "${var.service_name}-url-map"
  default_service = google_compute_backend_service.default.id
}

# Target HTTP Proxy
resource "google_compute_target_http_proxy" "default" {
  name    = "${var.service_name}-http-proxy"
  url_map = google_compute_url_map.default.id
}

# Global Forwarding Rule（グローバル IP の割り当て）
resource "google_compute_global_forwarding_rule" "default" {
  name                  = "${var.service_name}-forwarding-rule"
  target                = google_compute_target_http_proxy.default.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# デプロイ後にブラウザで叩く IP（伝播に数分かかることがある）
output "load_balancer_ip" {
  value = google_compute_global_forwarding_rule.default.ip_address
}
