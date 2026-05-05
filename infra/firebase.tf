# ── Firebase ──────────────────────────────────────────────────────────────────
#
# Pré-requisitos (rodar uma vez antes do terraform apply):
#   gcloud services enable firebase.googleapis.com --project=PROJECT_ID
#   gcloud services enable firebasehosting.googleapis.com --project=PROJECT_ID
#
# Se o projeto Firebase já existe (criado pelo Console), importe-o:
#   terraform import google_firebase_project.default PROJECT_ID

locals {
  firebase_site_id = var.firebase_site_id != "" ? var.firebase_site_id : var.gcp_project_id
}

# Habilita Firebase no projeto GCP (idempotente se já existir)
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.gcp_project_id
}

# Site de Hosting (cria ou gerencia o site padrão)
resource "google_firebase_hosting_site" "frontend" {
  provider = google-beta
  project  = var.gcp_project_id
  site_id  = local.firebase_site_id

  depends_on = [google_firebase_project.default]
}

# Allow Firebase Hosting to invoke Cloud Run (required for `run` rewrites)
data "google_project" "current" {
  project_id = var.gcp_project_id
}

resource "google_project_iam_member" "firebase_run_viewer" {
  project = var.gcp_project_id
  role    = "roles/run.viewer"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-firebase.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_service_iam_member" "firebase_run_invoker" {
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-firebase.iam.gserviceaccount.com"
}

# Domínio customizado para o frontend
resource "google_firebase_hosting_custom_domain" "frontend" {
  provider        = google-beta
  project         = var.gcp_project_id
  site_id         = google_firebase_hosting_site.frontend.site_id
  custom_domain   = "finance-app.mateusdeitos.dev"
  wait_dns_verification = false  # não bloqueia o apply aguardando DNS propagar
}
