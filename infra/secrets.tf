# ── Secret Manager ────────────────────────────────────────────────────────────
#
# Terraform cria os "containers" dos secrets (sem valor).
# Para adicionar o valor de cada secret use:
#
#   echo -n "VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
#
# Secrets obrigatórios (adicionar valor antes do primeiro deploy):
#   backend-db-password
#   backend-jwt-secret
#   backend-oauth-session-secret
#
# Secrets opcionais (adicionar valor vazio "" se o provider não for usado):
#   backend-google-client-secret
#   backend-microsoft-client-secret

resource "google_secret_manager_secret" "db_password" {
  secret_id = "DB_PASSWORD"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "JWT_SECRET"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "oauth_session_secret" {
  secret_id = "OAUTH_SESSION_SECRET"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "google_client_secret" {
  secret_id = "GOOGLE_CLIENT_SECRET"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "allowed_origins" {
  secret_id = "ALLOWED_ORIGINS"
  replication {
    auto {}
  }
}

# ── IAM: Cloud Run SA pode ler todos os secrets ───────────────────────────────

locals {
  backend_secrets = toset([
    "DB_PASSWORD",
    "JWT_SECRET",
    "OAUTH_SESSION_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "ALLOWED_ORIGINS",
  ])
}

resource "google_secret_manager_secret_iam_member" "backend_sa_accessor" {
  for_each  = local.backend_secrets
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}
