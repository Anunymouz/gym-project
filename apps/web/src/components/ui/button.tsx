import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'dark';

const styles: Record<Variant, string> = {
  primary: 'bg-flare text-white hover:bg-[#f04e14]',
  secondary: 'border-[1.5px] border-line bg-white text-midnight hover:bg-cloud',
  dark: 'bg-midnight text-white hover:bg-indigo',
};

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        styles[variant],
        className,
      )}
    />
  );
}
