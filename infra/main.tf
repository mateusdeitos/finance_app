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

  # Keep the registry small: retain the 5 most-recent images and delete anything
  # older. Dozens of released tags (backend:v0.1.72 and counting) otherwise pile
  # up and creep past the 0.5 GB free storage tier.
  cleanup_policies {
    id     = "keep-recent-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }
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

    # Scale to zero when idle. With only a couple of users, a warm instance is
    # not worth paying for 24/7. min=0 is the single biggest cost lever here —
    # a previous manual `gcloud run services update` had pinned minScale=1,
    # which (combined with cpu_idle=false) billed one full vCPU + memory around
    # the clock. Keep this explicit so the drift can't silently return.
    scaling {
      min_instance_count = 0
      max_instance_count = 4
    }

    containers {
      # Placeholder image — replaced by GitHub Actions on every release deploy
      image = "gcr.io/cloudrun/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        # Request-based CPU billing: CPU is only allocated while a request is
        # being handled, not for the whole lifetime of a warm instance. Drops
        # the service comfortably inside the Cloud Run free tier at this scale.
        # Trade-off: post-response push-notification goroutines (context.Background)
        # run throttled between requests — acceptable for a 2-user app.
        cpu_idle          = true
        startup_cpu_boost = false
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

      env {
        name = "ALLOWED_ORIGINS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.allowed_origins.secret_id
            version = "latest"
          }
        }
      }

      # ── Web Push / VAPID ──────────────────────────────────────────────────
      # Backend fails fast at startup if any of the three are missing.
      # Public key + subject are non-sensitive; private key → Secret Manager.
      env {
        name  = "VAPID_PUBLIC_KEY"
        value = var.vapid_public_key
      }
      env {
        name  = "VAPID_SUBJECT"
        value = var.vapid_subject
      }
      env {
        name = "VAPID_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.vapid_private_key.secret_id
            version = "latest"
          }
        }
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

# Segundo domínio da API, servindo o mesmo serviço. Existe para que o app
# (app.dividim.app) e a API compartilhem o mesmo domínio registrável: assim os
# dois são same-site e o cookie auth_token continua funcionando com
# SameSite=Lax, sem precisar afrouxar para None (que reabriria vetor de CSRF).
#
# Adicionado ao lado do mapping antigo, não no lugar dele — os dois hostnames
# servem o mesmo serviço durante a transição, e o antigo só sai depois que o
# corte estiver validado (PR de follow-up).
#
# Pré-requisito manual: o domínio precisa estar verificado no Google (Search
# Console) para o projeto, senão o apply falha. Deixe a variável vazia até lá.
resource "google_cloud_run_domain_mapping" "backend_new_domain" {
  count = var.api_custom_domain != "" ? 1 : 0

  name     = var.api_custom_domain
  location = var.gcp_region

  metadata {
    namespace = var.gcp_project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.backend.name
  }
}

# ── DNS do domínio novo (zona na Cloudflare) ──────────────────────────────────
#
# A zona dividim.app vive na Cloudflare, então os registros que o Cloud Run
# exige são criados aqui e não no Cloud DNS.
#
# O ideal seria derivar o registro de
# google_cloud_run_domain_mapping.backend_new_domain[0].status[0].resource_records,
# mas esse atributo só é conhecido depois da criação, e count/for_each não
# aceitam valor desconhecido no plan. Para subdomínio o Cloud Run sempre pede um
# CNAME para ghs.googlehosted.com, então ele é declarado estaticamente aqui — e
# o output `api_new_domain_required_dns_records` expõe a lista autoritativa que
# o Google devolveu, para conferência após o apply.
#
# proxied = false (nuvem cinza) é obrigatório: com o proxy da Cloudflare na
# frente, o Google não consegue emitir/validar o certificado do domain mapping.
#
# Na v4 do provider este recurso se chamava cloudflare_record e o valor ficava em
# `value`; na v5 é cloudflare_dns_record com `content`.
resource "cloudflare_dns_record" "api" {
  count = var.api_custom_domain != "" && var.cloudflare_zone_id != "" ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.api_custom_domain
  type    = "CNAME"
  content = "ghs.googlehosted.com"
  proxied = false
  ttl     = 300

  depends_on = [google_cloud_run_domain_mapping.backend_new_domain]
}

# TXT de verificação de propriedade do domínio no Google (Search Console).
# Precisa existir e propagar ANTES de criar o domain mapping acima — na prática:
# primeiro apply com api_custom_domain vazio e só esta variável preenchida,
# depois o segundo apply com o domínio.
resource "cloudflare_dns_record" "google_site_verification" {
  count = var.google_site_verification != "" && var.cloudflare_zone_id != "" ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.dns_zone_name
  type    = "TXT"
  content = "google-site-verification=${var.google_site_verification}"
  ttl     = 300
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = google_cloud_run_v2_service.backend.project
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

