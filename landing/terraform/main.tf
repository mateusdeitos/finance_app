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

# Não há um cloudflare_dns_record aqui de propósito: ao anexar o domínio
# customizado acima, a própria Cloudflare cria e mantém o CNAME, porque a zona
# está na mesma conta. Declarar o registro no Terraform duplicava a
# responsabilidade e o apply falhava com 81053 ("record with that host already
# exists"). O caso do api.dividim.app em infra/ é diferente — para o Cloud Run
# não existe automação equivalente, então lá o registro é gerenciado aqui.
