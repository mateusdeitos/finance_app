# ── GCP Project ──────────────────────────────────────────────────────────────

variable "gcp_project_id" {
  description = "GCP project ID where all resources will be created."
  type        = string
}

variable "gcp_region" {
  description = "GCP region for Cloud Run and Artifact Registry (e.g. us-central1)."
  type        = string
  default     = "us-central1"
}

# ── Artifact Registry ─────────────────────────────────────────────────────────

variable "gar_repository" {
  description = "Name of the Artifact Registry repository for backend Docker images."
  type        = string
  default     = "backend"
}

# ── Cloud Run ─────────────────────────────────────────────────────────────────

variable "cloud_run_service_name" {
  description = "Name of the Cloud Run service."
  type        = string
  default     = "backend"
}

# ── Database (Cloud Run env vars) ─────────────────────────────────────────────

variable "db_host" {
  description = "PostgreSQL host (e.g. Cloud SQL private IP or proxy address)."
  type        = string
}

variable "db_port" {
  description = "PostgreSQL port."
  type        = string
  default     = "5432"
}

variable "db_user" {
  description = "PostgreSQL user."
  type        = string
}

variable "db_name" {
  description = "PostgreSQL database name."
  type        = string
  default     = "finance_app"
}

variable "db_sslmode" {
  description = "PostgreSQL SSL mode (disable | require | verify-full)."
  type        = string
  default     = "require"
}

# ── Auth ──────────────────────────────────────────────────────────────────────

variable "jwt_expiration_hours" {
  description = "JWT lifetime in hours. The backend falls back to 24 when unset (internal/config/config.go); the default here matches what was already running in production."
  type        = string
  default     = "168"
}

# ── OAuth – Google ────────────────────────────────────────────────────────────

variable "google_client_id" {
  description = "Google OAuth client ID (leave empty to disable Google OAuth)."
  type        = string
  default     = ""
}

variable "google_callback_url" {
  description = "Full URL for Google OAuth callback (e.g. https://api.example.com/auth/google/callback)."
  type        = string
  default     = ""
}

# ── OAuth – Microsoft ─────────────────────────────────────────────────────────

variable "microsoft_client_id" {
  description = "Microsoft OAuth client ID (leave empty to disable Microsoft OAuth)."
  type        = string
  default     = ""
}

variable "microsoft_callback_url" {
  description = "Full URL for Microsoft OAuth callback."
  type        = string
  default     = ""
}

# ── Application ───────────────────────────────────────────────────────────────

variable "app_url" {
  description = "Public URL of the backend API (e.g. https://api.example.com)."
  type        = string
}

variable "api_custom_domain" {
  description = "Additional custom domain mapped to the same Cloud Run service (e.g. api.dividim.app), so the API shares a registrable domain with the frontend and auth cookies stay same-site. Leave empty until the domain is verified in Google Search Console for this project — the apply fails otherwise."
  type        = string
  default     = ""
}

# ── DNS (zona hospedada na Cloudflare) ────────────────────────────────────────
#
# O provider Cloudflare lê CLOUDFLARE_API_TOKEN do ambiente, como nos outros
# roots. Com estas variáveis vazias nenhum recurso Cloudflare é criado, então
# `terraform apply` continua funcionando só com credenciais do GCP.

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID de dividim.app (dashboard → dividim.app → Overview → Zone ID). Vazio = não gerencia DNS por aqui."
  type        = string
  default     = ""
}

variable "dns_zone_name" {
  description = "Nome da zona / domínio raiz (ex.: dividim.app). Usado como nome do registro TXT de verificação do Google."
  type        = string
  default     = ""
}

variable "google_site_verification" {
  description = "Token de verificação do Google Search Console (só o valor, sem o prefixo 'google-site-verification='). Necessário antes de criar o domain mapping do Cloud Run para o domínio novo."
  type        = string
  default     = ""
}

variable "frontend_url" {
  description = "Public URL of the frontend app (e.g. https://app.example.com)."
  type        = string
}

# ── Web Push (VAPID) ──────────────────────────────────────────────────────────
#
# VAPID_PRIVATE_KEY is sensitive → managed via Secret Manager (see secrets.tf),
# NOT declared here. The public key and subject are non-sensitive.

variable "vapid_public_key" {
  description = "VAPID public key (base64url, EC P-256). Served to the frontend; non-secret. Generate the pair with `npx web-push generate-vapid-keys`."
  type        = string
}

variable "vapid_subject" {
  description = "VAPID subject — a contact URI per RFC 8292 (e.g. mailto:you@example.com or https://app.example.com)."
  type        = string
}

# ── Firebase Hosting ──────────────────────────────────────────────────────────

variable "firebase_site_id" {
  description = "Firebase Hosting site ID (must be globally unique; defaults to the GCP project ID)."
  type        = string
  default     = "" # quando vazio usa gcp_project_id
}

# ── Frontend (for documentation purposes) ─────────────────────────────────────

variable "vite_api_url" {
  description = "VITE_API_URL injected at frontend build time — set this as a GitHub Variable, not in Terraform."
  type        = string
  default     = ""
}
