import { cn } from '../../lib/utils';

type Props = {
  children: React.ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
};

export function Badge({ children, tone = 'neutral' }: Props) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>;
}
