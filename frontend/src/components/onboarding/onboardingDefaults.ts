export interface SuggestedAccount {
  slug: string
  name: string
  initial_balance: number
  avatar_background_color: string
}

export interface SuggestedCategory {
  slug: string
  name: string
  emoji: string
  children?: SuggestedCategory[]
}

export const SUGGESTED_ACCOUNTS: SuggestedAccount[] = [
  { slug: 'conta_corrente', name: 'Conta corrente', initial_balance: 0, avatar_background_color: '#457b9d' },
  { slug: 'cartao_credito', name: 'Cartão de crédito', initial_balance: 0, avatar_background_color: '#e63946' },
  { slug: 'reserva', name: 'Reserva', initial_balance: 0, avatar_background_color: '#2a9d8f' },
]

export const SUGGESTED_CATEGORIES: SuggestedCategory[] = [
  {
    slug: 'variaveis',
    name: 'Variáveis',
    emoji: '🎁',
    children: [
      { slug: 'alimentacao', name: 'Alimentação', emoji: '🍔' },
      { slug: 'assinaturas', name: 'Assinaturas', emoji: '💻' },
      { slug: 'compras', name: 'Compras', emoji: '👕' },
      { slug: 'consertos', name: 'Consertos', emoji: '🛠️' },
      { slug: 'cuidados_pessoais', name: 'Cuidados Pessoais', emoji: '💪' },
      { slug: 'exames', name: 'Exames', emoji: '🩺' },
      { slug: 'farmacia', name: 'Farmácia', emoji: '💊' },
      { slug: 'impostos', name: 'Impostos', emoji: '🧾' },
      { slug: 'lazer', name: 'Lazer', emoji: '🎬' },
      { slug: 'luca', name: 'Luca', emoji: '❤️' },
      { slug: 'presentes', name: 'Presentes', emoji: '🎁' },
      { slug: 'suplementos', name: 'Suplementos', emoji: '🏋️' },
      { slug: 'transporte', name: 'Transporte', emoji: '🚗' },
      { slug: 'pet', name: 'Pet', emoji: '🐾' },
    ],
  },
  {
    slug: 'receita',
    name: 'Receita',
    emoji: '💰',
    children: [
      { slug: 'bonus', name: 'Bônus', emoji: '🎉' },
      { slug: 'reembolso', name: 'Reembolso', emoji: '💸' },
      { slug: 'salario', name: 'Salário', emoji: '💵' },
    ],
  },
  {
    slug: 'fixos',
    name: 'Fixos',
    emoji: '🏠',
    children: [
      { slug: 'casa', name: 'Casa', emoji: '🏠' },
      { slug: 'celular', name: 'Celular', emoji: '📱' },
      { slug: 'condominio', name: 'Condomínio', emoji: '🏢' },
      { slug: 'mercado', name: 'Mercado', emoji: '🛒' },
      { slug: 'saude', name: 'Saúde', emoji: '🩺' },
    ],
  },
]
