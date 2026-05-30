import { IconShieldCheck } from '@tabler/icons-react'
import classes from './TrustLine.module.css'

export function TrustLine() {
  return (
    <div className={classes.trust}>
      <IconShieldCheck size={14} stroke={1.75} />
      <span>Login seguro com sua conta Google</span>
    </div>
  )
}
