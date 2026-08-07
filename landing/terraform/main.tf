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

# CNAME apontando para o projeto Pages.
#
# A Cloudflare NÃO cria este registro sozinha: ao anexar o domínio customizado
# ela fica em "Verifying" com um "Complete DNS setup" pendente, esperando o
# registro existir. Por isso ele é gerenciado aqui.
#
# Um apply anterior falhou com 81053 ("record with that host already exists"),
# mas o conflito não era com automação da Cloudflare — eram os registros A de
# parking do Squarespace, herdados na importação da zona. Se o erro voltar,
# confira o que ocupa o host antes de assumir que é duplicidade legítima.
# No apex isso é válido graças ao CNAME flattening da Cloudflare.
#
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
