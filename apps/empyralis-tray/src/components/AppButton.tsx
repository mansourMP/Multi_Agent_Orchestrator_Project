import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type AppButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function AppButton({ children, className = '', ...props }: AppButtonProps) {
  return (
    <button className={`app-button app-button--secondary ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
