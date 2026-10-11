# Cloud Monitoring keeps the multi-region uptime history. This separate,
# single scheduled probe exists because uptime checks only notify on incident
# transitions, while we intentionally send one Discord message on every run.

resource "google_project_service" "cloud_scheduler" {
  count = var.discord_health_notifications ? 1 : 0

  project            = var.gcp_project_id
  service            = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}

resource "google_service_account" "health_monitor" {
  count = var.discord_health_notifications ? 1 : 0

  account_id   = "health-monitor-sa"
  display_name = "Health Monitor Runtime"
  description  = "Runs the API/database probe and reads the Discord webhook"
}

resource "google_service_account" "health_monitor_scheduler" {
  count = var.discord_health_notifications ? 1 : 0

  account_id   = "health-monitor-scheduler"
  display_name = "Health Monitor Scheduler Invoker"
  description  = "Allows Cloud Scheduler to invoke the private health monitor"
}

resource "google_secret_manager_secret_iam_member" "health_monitor_discord" {
  count = var.discord_health_notifications ? 1 : 0

  secret_id = google_secret_manager_secret.discord_webhook_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.health_monitor[0].email}"
}

resource "google_cloud_run_v2_service" "health_monitor" {
  count = var.discord_health_notifications ? 1 : 0

  name     = "health-monitor"
  location = var.gcp_region
  # The URL must be reachable by Cloud Scheduler, but IAM keeps it private.
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.health_monitor[0].email

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      # The release workflow replaces this tag with the release's immutable tag.
      image   = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${var.gar_repository}/backend:latest"
      command = ["/app/health-monitor"]

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "TARGET_HEALTH_URL"
        value = "${google_cloud_run_v2_service.backend.uri}/health"
      }

      env {
        name = "DISCORD_WEBHOOK_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.discord_webhook_url.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.health_monitor_discord]
}

resource "google_cloud_run_v2_service_iam_member" "health_monitor_scheduler" {
  count = var.discord_health_notifications ? 1 : 0

  project  = google_cloud_run_v2_service.health_monitor[0].project
  location = google_cloud_run_v2_service.health_monitor[0].location
  name     = google_cloud_run_v2_service.health_monitor[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.health_monitor_scheduler[0].email}"
}

resource "google_cloud_scheduler_job" "health_monitor" {
  count = var.discord_health_notifications ? 1 : 0

  name             = "health-monitor-hourly"
  description      = "Checks API and Supabase, then reports every result to Discord"
  schedule         = "0 * * * *"
  time_zone        = "America/Sao_Paulo"
  attempt_deadline = "60s"

  retry_config {
    retry_count          = 3
    max_retry_duration   = "300s"
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
  }

  http_target {
    uri         = "${google_cloud_run_v2_service.health_monitor[0].uri}/run"
    http_method = "POST"
    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode("{}")

    oidc_token {
      service_account_email = google_service_account.health_monitor_scheduler[0].email
      audience              = google_cloud_run_v2_service.health_monitor[0].uri
    }
  }

  depends_on = [
    google_project_service.cloud_scheduler,
    google_cloud_run_v2_service_iam_member.health_monitor_scheduler,
  ]
}
