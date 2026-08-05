# ── Values to set as GitHub Variables (non-sensitive) ────────────────────────

output "cloudflare_account_id" {
  description = "Cloudflare account ID → set as GitHub variable CLOUDFLARE_ACCOUNT_ID"
  value       = var.cloudflare_account_id
}

output "cloudflare_pages_project_name" {
  description = "Cloudflare Pages project name → set as GitHub variable CLOUDFLARE_PAGES_PROJECT_NAME"
  value       = cloudflare_pages_project.landing.name
}

output "cloudflare_pages_default_url" {
  description = "Default *.pages.dev URL (informational — production alias for the direct-upload project)"
  value       = "https://${cloudflare_pages_project.landing.name}.pages.dev"
}

output "landing_url" {
  description = "URL pública da landing (domínio customizado quando configurado)"
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${cloudflare_pages_project.landing.name}.pages.dev"
}
