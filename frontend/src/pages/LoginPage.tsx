import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { BrandLogo } from '@/components/login/BrandLogo'
import { GoogleButton } from '@/components/login/GoogleButton'
import { LoginFeatureList } from '@/components/login/LoginFeatureList'
import { ProductPeek } from '@/components/login/ProductPeek'
import { TrustLine } from '@/components/login/TrustLine'
import { LoginTestIds } from '@/testIds'
import classes from './LoginPage.module.css'

const HEADLINE = 'As finanças do casal, num lugar só.'

const HIGHLIGHTS = [
  'Visão compartilhada das despesas',
  'Transações recorrentes automáticas',
  'Controle de metas juntos',
]

export function LoginPage() {
  const { redirect: redirectTo } = useSearch({ from: '/login' })
  const [loading, setLoading] = useState(false)

  function handleGoogleLogin() {
    if (loading) return
    setLoading(true)
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
    const url = new URL(`${apiUrl}/auth/google`, window.location.origin)
    if (redirectTo) url.searchParams.set('redirect', redirectTo)
    url.searchParams.set('origin', window.location.origin)
    window.location.href = url.toString()
  }

  const brand = (size: number) => (
    <div className={classes.brandRow}>
      <BrandLogo size={size} />
      <span className={classes.wordmark}>FinanceApp</span>
    </div>
  )

  const actions = (
    <div className={classes.actions}>
      <GoogleButton loading={loading} onClick={handleGoogleLogin} />
      <TrustLine />
    </div>
  )

  return (
    <div className={classes.root} data-testid={LoginTestIds.Page}>
      {/* Desktop — split marketing showcase + login card */}
      <div className={classes.desktop}>
        <section className={classes.marketing}>
          <div className={classes.glow} aria-hidden="true" />
          {brand(30)}
          <div className={classes.marketingBody}>
            <h1 className={classes.headline}>{HEADLINE}</h1>
            <p className={classes.lede}>
              Despesas, transferências e acertos compartilhados — simples e
              transparente, a dois.
            </p>
            <div className={classes.peekWrap}>
              <ProductPeek />
            </div>
          </div>
          <div className={classes.highlights}>
            {HIGHLIGHTS.map((text) => (
              <span key={text} className={classes.highlight}>
                <span className={classes.highlightDot} aria-hidden="true" />
                {text}
              </span>
            ))}
          </div>
        </section>

        <section className={classes.card}>
          <div className={classes.cardInner}>
            <div>
              <h2 className={classes.cardTitle}>Bem-vindo de volta</h2>
              <p className={classes.cardSub}>
                Entre para continuar de onde vocês pararam.
              </p>
            </div>
            <LoginFeatureList />
            {actions}
            <p className={classes.terms}>
              Ao continuar, você concorda com os Termos de uso e a Política de
              privacidade.
            </p>
          </div>
        </section>
      </div>

      {/* Mobile — gradient hero band with the card pulled up over it */}
      <div className={classes.mobile}>
        <div className={classes.hero}>
          <div className={classes.glowSmall} aria-hidden="true" />
          {brand(28)}
          <h1 className={classes.heroHeadline}>{HEADLINE}</h1>
          <p className={classes.heroLede}>Simples e transparente, a dois.</p>
        </div>
        <div className={classes.mobileCard}>
          <LoginFeatureList />
          <div className={classes.spacer} />
          {actions}
        </div>
      </div>
    </div>
  )
}
