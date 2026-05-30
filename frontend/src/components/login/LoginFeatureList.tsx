import { IconRepeat, IconTarget, IconUsers, type Icon } from '@tabler/icons-react'
import classes from './LoginFeatureList.module.css'

type Feature = {
  icon: Icon
  title: string
  desc: string
}

const FEATURES: Feature[] = [
  {
    icon: IconUsers,
    title: 'Visão compartilhada das despesas',
    desc: 'Vocês dois veem tudo no mesmo lugar, em tempo real.',
  },
  {
    icon: IconRepeat,
    title: 'Transações recorrentes automáticas',
    desc: 'Aluguel, assinaturas e contas que se repetem sozinhas.',
  },
  {
    icon: IconTarget,
    title: 'Controle de metas juntos',
    desc: 'Planejem e acompanhem objetivos a dois.',
  },
]

export function LoginFeatureList() {
  return (
    <div className={classes.list}>
      {FEATURES.map(({ icon: Icon, title, desc }) => (
        <div key={title} className={classes.row}>
          <div className={classes.chip}>
            <Icon size={20} stroke={1.75} />
          </div>
          <div>
            <div className={classes.title}>{title}</div>
            <div className={classes.desc}>{desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
