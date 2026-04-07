import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
};

export function Button({ className, variant = 'primary', fullWidth, ...props }: Props) {
  return (
    <button
      className={cn('btn', `btn-${variant}`, fullWidth && 'btn-block', className)}
      {...props}
    />
  );
}
