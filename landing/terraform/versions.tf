terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      # NOTE: verify against https://registry.terraform.io/providers/cloudflare/cloudflare
      # before the first `terraform init` — this sandbox has no network access to the
      # Terraform Registry, so this pin (and the `cloudflare_pages_project` schema used
      # in main.tf) could not be checked against the provider's current docs. The v4→v5
      # upgrade renamed/restructured several resources; confirm `cloudflare_pages_project`
      # still takes account_id/name/production_branch as top-level arguments.
      version = "~> 5.0"
    }
  }
}
