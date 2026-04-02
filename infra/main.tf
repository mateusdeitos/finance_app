provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# ── Artifact Registry ─────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "backend" {
  repository_id = var.gar_repository
  location      = var.gcp_region
  format        = "DOCKER"
  description   = "Docker images for the backend service"
}

# ── CI/CD Service Account (GitHub Actions) ────────────────────────────────────

resource "google_service_account" "cicd" {
  account_id   = "cicd-sa"
  display_name = "GitHub Actions CI/CD"
  description  = "Used by GitHub Actions to push images to Artifact Registry and deploy to Cloud Run"
}

resource "google_project_iam_member" "cicd_run_admin" {
  project = var.gcp_project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

resource "google_project_iam_member" "cicd_sa_user" {
  project = var.gcp_project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

resource "google_project_iam_member" "cicd_gar_writer" {
  project = var.gcp_project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

resource "google_service_account_key" "cicd" {
  service_account_id = google_service_account.cicd.name
}

# ── Backend Runtime Service Account (Cloud Run) ───────────────────────────────

resource "google_service_account" "backend" {
  account_id   = "backend-sa"
  display_name = "Backend Cloud Run Runtime"
  description  = "Runtime identity for the backend Cloud Run service; reads secrets from Secret Manager"
}

# ── Cloud Run ─────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "backend" {
  name     = var.cloud_run_service_name
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Ensure IAM bindings for secrets are in place before the service starts
  depends_on = [google_secret_manager_secret_iam_member.backend_sa_accessor]

  template {
    service_account = google_service_account.backend.email

    containers {
      # Placeholder image — replaced by GitHub Actions on every release deploy
      image = "gcr.io/cloudrun/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # ── Server ────────────────────────────────────────────────────────────
      env {
        name  = "SERVER_PORT"
        value = "8080"
      }
      env {
        name  = "SERVER_HOST"
        value = "0.0.0.0"
      }

      # ── Database (non-sensitive) ───────────────────────────────────────────
      env {
        name  = "DB_HOST"
        value = var.db_host
      }
      env {
        name  = "DB_PORT"
        value = var.db_port
      }
      env {
        name  = "DB_USER"
        value = var.db_user
      }
      env {
        name  = "DB_NAME"
        value = var.db_name
      }
      env {
        name  = "DB_SSLMODE"
        value = var.db_sslmode
      }

      # ── Database (sensitive → Secret Manager) ─────────────────────────────
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      # ── Auth (sensitive → Secret Manager) ─────────────────────────────────
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "OAUTH_SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.oauth_session_secret.secret_id
            version = "latest"
          }
        }
      }

      # ── OAuth – Google ────────────────────────────────────────────────────
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.google_client_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "GOOGLE_CALLBACK_URL"
        value = var.google_callback_url
      }

      # ── OAuth – Microsoft ─────────────────────────────────────────────────
      env {
        name  = "MICROSOFT_CLIENT_ID"
        value = var.microsoft_client_id
      }
      #   env {
      #     name = "MICROSOFT_CLIENT_SECRET"
      #     value_source {
      #       secret_key_ref {
      #         secret  = google_secret_manager_secret.microsoft_client_secret.secret_id
      #         version = "latest"
      #       }
      #     }
      #   }
      env {
        name  = "MICROSOFT_CALLBACK_URL"
        value = var.microsoft_callback_url
      }

      # ── Application ───────────────────────────────────────────────────────
      env {
        name  = "APP_URL"
        value = var.app_url
      }
      env {
        name  = "FRONTEND_URL"
        value = var.frontend_url
      }
      env {
        name  = "ENV"
        value = "production"
      }
    }
  }

  lifecycle {
    # Prevent Terraform from reverting the image after GitHub Actions deploys a new one
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# ── Cloud Run Custom Domain ───────────────────────────────────────────────────

resource "google_cloud_run_domain_mapping" "backend" {
  name     = "api.finance-app.mateusdeitos.dev"
  location = var.gcp_region

  metadata {
    namespace = var.gcp_project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.backend.name
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = google_cloud_run_v2_service.backend.project
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

