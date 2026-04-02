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

variable "frontend_url" {
  description = "Public URL of the frontend app (e.g. https://app.example.com)."
  type        = string
}

# ── Firebase Hosting ──────────────────────────────────────────────────────────

variable "firebase_site_id" {
  description = "Firebase Hosting site ID (must be globally unique; defaults to the GCP project ID)."
  type        = string
  default     = ""  # quando vazio usa gcp_project_id
}

# ── Frontend (for documentation purposes) ─────────────────────────────────────

variable "vite_api_url" {
  description = "VITE_API_URL injected at frontend build time — set this as a GitHub Variable, not in Terraform."
  type        = string
  default     = ""
}
