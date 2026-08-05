# ── Values to set as GitHub Variables (non-sensitive) ────────────────────────

output "gar_location" {
  description = "Artifact Registry location → set as GitHub variable GAR_LOCATION"
  value       = var.gcp_region
}

output "gar_repository" {
  description = "Artifact Registry repository name → set as GitHub variable GAR_REPOSITORY"
  value       = google_artifact_registry_repository.backend.repository_id
}

output "gcp_region" {
  description = "GCP region → set as GitHub variable GCP_REGION"
  value       = var.gcp_region
}

output "cloud_run_service_name" {
  description = "Cloud Run service name → set as GitHub variable CLOUD_RUN_SERVICE_NAME"
  value       = google_cloud_run_v2_service.backend.name
}

output "cloud_run_url" {
  description = "Public URL of the deployed Cloud Run service (internal *.run.app URL)"
  value       = google_cloud_run_v2_service.backend.uri
}

output "api_custom_domain" {
  description = "Custom domain mapped to Cloud Run"
  value       = "https://${google_cloud_run_domain_mapping.backend.name}"
}

output "api_new_custom_domain" {
  description = "Additional API domain (dividim.app) → once live, set as GitHub variable VITE_API_URL and as app_url/google_callback_url in terraform.tfvars"
  value       = length(google_cloud_run_domain_mapping.backend_new_domain) > 0 ? "https://${google_cloud_run_domain_mapping.backend_new_domain[0].name}" : ""
}

# Lista autoritativa devolvida pelo Cloud Run. O CNAME é criado estaticamente em
# main.tf (resource_records não é conhecido no plan), então confira aqui depois
# do apply que o que o Google pediu bate com o que foi criado.
output "api_new_domain_required_dns_records" {
  description = "DNS records Cloud Run requires for the new API domain — verify these match the cloudflare_dns_record.api created in main.tf"
  value       = length(google_cloud_run_domain_mapping.backend_new_domain) > 0 ? google_cloud_run_domain_mapping.backend_new_domain[0].status[0].resource_records : []
}

output "cicd_sa_email" {
  description = "CI/CD service account email (for reference)"
  value       = google_service_account.cicd.email
}

output "backend_sa_email" {
  description = "Cloud Run runtime service account email (for reference)"
  value       = google_service_account.backend.email
}

# ── Firebase ──────────────────────────────────────────────────────────────────

output "firebase_site_id" {
  description = "Firebase Hosting site ID → set as GitHub variable FIREBASE_PROJECT_ID"
  value       = google_firebase_hosting_site.frontend.site_id
}

output "firebase_hosting_url" {
  description = "Default Firebase Hosting URL (*.web.app)"
  value       = "https://${google_firebase_hosting_site.frontend.site_id}.web.app"
}

# ── Values to set as GitHub Secrets (sensitive) ───────────────────────────────

output "gcp_project_id" {
  description = "GCP project ID → set as GitHub secret GCP_PROJECT_ID"
  value       = var.gcp_project_id
  sensitive   = true
}

output "cicd_sa_key" {
  description = "Base64-encoded service account JSON key → set as GitHub secret GOOGLE_CREDENTIALS"
  value       = google_service_account_key.cicd.private_key
  sensitive   = true
}
