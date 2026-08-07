# Autenticação do provider Cloudflare não entra aqui de propósito: o provider lê
# CLOUDFLARE_API_TOKEN da variável de ambiente automaticamente, então o token nunca
# passa por terraform.tfvars nem fica gravado no state.

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID (dashboard → canto superior direito de qualquer página da conta)."
  type        = string
}

variable "pages_project_name" {
  description = "Nome do projeto Cloudflare Pages → vira <nome>.pages.dev."
  type        = string
  default     = "financeapp-landing"
}

variable "production_branch" {
  description = "Branch tratada como produção pelos deploys via wrangler (--branch precisa bater com este valor para publicar na URL principal)."
  type        = string
  default     = "main"
}

variable "custom_domain" {
  description = "Domínio customizado da landing (ex.: dividim.app). Vazio = só a URL *.pages.dev."
  type        = string
  default     = ""
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID de dividim.app (dashboard → dividim.app → Overview → Zone ID). Necessário para criar o CNAME do domínio customizado."
  type        = string
  default     = ""
}
