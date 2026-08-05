terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      # NOTE: verify against https://registry.terraform.io/providers/cloudflare/cloudflare
      # before the first `terraform init` — this sandbox has no network access to the
      # Terraform Registry, so this pin (and the `cloudflare_pages_project` schema used
      # in main.tf) could not be checked against the provider's current docs. Keep this
      # pin identical to landing/terraform/versions.tf so both roots stay on the same
      # provider version.
      version = "~> 5.0"
    }
  }
}
