# Checks API and database availability together. Cloud Monitoring calls the
# public /health endpoint every 15 minutes, which is the longest supported
# uptime-check interval. The endpoint executes SELECT 1 before returning 200.

resource "google_project_service" "cloud_monitoring" {
  project            = var.gcp_project_id
  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

resource "google_monitoring_uptime_check_config" "backend" {
  display_name = "backend-health"
  timeout      = "10s"
  period       = "900s"
  checker_type = "STATIC_IP_CHECKERS"
  # USA is the smallest region group that still supplies the required three
  # checker locations, avoiding unnecessary probes from every global region.
  selected_regions = ["USA"]

  http_check {
    path           = "/health"
    port           = 443
    request_method = "GET"
    use_ssl        = true
    validate_ssl   = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.gcp_project_id
      host       = trimprefix(google_cloud_run_v2_service.backend.uri, "https://")
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }

  depends_on = [
    google_project_service.cloud_monitoring,
    google_cloud_run_v2_service_iam_member.public_invoker,
  ]
}
