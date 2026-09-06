# Terraform de produção

O workflow `Terraform Production` é manual. Ele executa `plan` por padrão e só
aplica mudanças quando a operação `apply` é escolhida explicitamente. As
execuções são serializadas e usam state remoto no GCS.

## Bootstrap do state remoto

Crie uma vez um bucket dedicado, ative versionamento e dê acesso à service
account usada pelo workflow:

```bash
gcloud storage buckets create "gs://$TERRAFORM_STATE_BUCKET" \
  --location=us-central1 \
  --uniform-bucket-level-access

gcloud storage buckets update "gs://$TERRAFORM_STATE_BUCKET" --versioning

gcloud storage buckets add-iam-policy-binding "gs://$TERRAFORM_STATE_BUCKET" \
  --member="serviceAccount:$TERRAFORM_SERVICE_ACCOUNT" \
  --role="roles/storage.objectAdmin"
```

Este projeto já possui recursos. Migre o state autoritativo antes de executar o
workflow. Rode o comando abaixo somente no diretório que contém o
`terraform.tfstate` atual:

```bash
terraform init -migrate-state \
  -backend-config="bucket=$TERRAFORM_STATE_BUCKET" \
  -backend-config="prefix=finance-app/prod"
```

Se não houver um state autoritativo, importe os recursos existentes antes do
primeiro `apply`; não aplique contra um bucket vazio.

## Configuração no GitHub

No environment `prod`, configure:

- Secret `TERRAFORM_GOOGLE_CREDENTIALS`: JSON de uma service account autorizada
  a gerenciar os recursos declarados em `infra/`. Ela é separada da identidade
  limitada usada apenas pelo deploy da aplicação.
- Secret `TERRAFORM_TFVARS`: conteúdo do `terraform.tfvars` de produção. Use
  `terraform.tfvars.example` como referência. O workflow materializa o arquivo
  com permissão restrita e o remove ao final.
- Secret `CLOUDFLARE_API_TOKEN`: necessário quando o Terraform gerencia os
  registros Cloudflare.
- Variable `TERRAFORM_STATE_BUCKET`: nome do bucket, sem o prefixo `gs://`.

O webhook do Discord não entra no tfvars: seu valor continua armazenado como
versão do secret `DISCORD_WEBHOOK_URL` no Secret Manager.

## Execução

Em **Actions → Terraform Production → Run workflow**, execute primeiro `plan`.
Revise a saída e só então rode novamente escolhendo `apply`.
