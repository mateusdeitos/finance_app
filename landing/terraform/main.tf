provider "cloudflare" {
  # api_token é lido da env var CLOUDFLARE_API_TOKEN — não declarado aqui de propósito.
}

resource "cloudflare_pages_project" "landing" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.production_branch

  # Sem bloco `source` → projeto de "direct upload" (sem integração Git no Cloudflare).
  # Todo deploy é feito via `wrangler pages deploy` a partir do GitHub Actions
  # (ver .github/workflows/deploy-landing.yml e preview-landing.yml).
}

# A landing fica no apex (dividim.app) porque é a página que se compartilha; o
# app fica em app.dividim.app (ver frontend/terraform). Origens separadas de
# propósito — o service worker do PWA tem escopo "/" e interceptaria a landing
# se as duas dividissem a mesma origem.
#
# O domínio vai em `name` (na v4 do provider este argumento se chamava `domain`).
resource "cloudflare_pages_domain" "landing" {
  count = var.custom_domain != "" ? 1 : 0

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.landing.name
  name         = var.custom_domain
}

# CNAME do apex para o projeto Pages. A Cloudflare faz CNAME flattening no apex,
# então isso é válido mesmo sendo o domínio raiz.
#
# A Cloudflare costuma criar esse registro sozinha ao anexar o domínio
# customizado quando a zona está na mesma conta. Se isso acontecer, o apply
# reclama de registro já existente — nesse caso rode `terraform import` nele em
# vez de apagar pelo dashboard, para o Terraform virar a fonte da verdade.
#
# Na v4 do provider este recurso se chamava cloudflare_record e o valor ficava em
# `value`; na v5 é cloudflare_dns_record com `content`.
resource "cloudflare_dns_record" "landing" {
  count = var.custom_domain != "" && var.cloudflare_zone_id != "" ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.custom_domain
  type    = "CNAME"
  content = "${cloudflare_pages_project.landing.name}.pages.dev"
  proxied = true
  ttl     = 1 # 1 = automático; obrigatório quando proxied

  depends_on = [cloudflare_pages_domain.landing]
}
