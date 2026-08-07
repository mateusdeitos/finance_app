# ── Values to set as GitHub Variables (non-sensitive) ────────────────────────

output "cloudflare_pages_project_name" {
  description = "Cloudflare Pages project name → set as GitHub variable CLOUDFLARE_PAGES_PROJECT_NAME_FRONTEND"
  value       = cloudflare_pages_project.frontend.name
}

output "cloudflare_pages_default_url" {
  description = "Default *.pages.dev URL (informational — útil para smoke test antes do corte de DNS)"
  value       = "https://${cloudflare_pages_project.frontend.name}.pages.dev"
}

output "app_url" {
  description = "URL pública do app → usar como valor de frontend_url em infra/terraform.tfvars e da GitHub variable PUBLIC_APP_URL (CTAs da landing)"
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${cloudflare_pages_project.frontend.name}.pages.dev"
}
