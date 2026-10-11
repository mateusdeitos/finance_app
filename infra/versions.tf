terraform {
  required_version = ">= 1.5"

  # The bucket is supplied by local init and by .github/workflows/terraform.yml.
  # Keeping state remote is required because GitHub runners are ephemeral.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    # Usado só para os registros DNS de api.dividim.app (a zona vive na
    # Cloudflare). Todos os recursos Cloudflare aqui são gated por variável
    # vazia, então quem aplicar sem CLOUDFLARE_API_TOKEN não é afetado.
    # Mesma pin de landing/terraform e frontend/terraform.
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}
