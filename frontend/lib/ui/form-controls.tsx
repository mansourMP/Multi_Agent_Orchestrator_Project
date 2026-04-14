'use client';

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { AppInput, AppSelect, AppTextarea, joinClassNames } from '@/lib/ui/primitives';

function resolveFormGridVariant(columns: string | undefined): string {
  if (columns === '1fr') {
    return 'app-form-grid--one';
  }
  if (columns === 'repeat(2, minmax(0, 1fr))') {
    return 'app-form-grid--two';
  }
  if (columns === 'repeat(auto-fit, minmax(12rem, 1fr))') {
    return 'app-form-grid--auto-12';
  }
  if (columns === 'repeat(auto-fit, minmax(14rem, 1fr))') {
    return 'app-form-grid--auto-14';
  }
  return 'app-form-grid--auto';
}

export function FormSection({
  title,
  description,
  className,
  children,
}: PropsWithChildren<{
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={joinClassNames('app-form-section', className)}>
      <div className="app-form-section__header">
        <strong className="app-form-section__title">{title}</strong>
        {description ? (
          <span className="app-form-section__description">{description}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function FormGrid({
  children,
  columns = 'repeat(auto-fit, minmax(14rem, 1fr))',
}: PropsWithChildren<{
  columns?: string;
}>) {
  return (
    <div className={joinClassNames('app-form-grid', resolveFormGridVariant(columns))}>
      {children}
    </div>
  );
}

export function FormField({
  label,
  hint,
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  hint?: ReactNode;
}>) {
  return (
    <label {...props} className={joinClassNames('app-form-field', className)}>
      <span className="app-form-field__label">{label}</span>
      {children}
      {hint ? (
        <span className="app-form-field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

export const FormInput = AppInput;
export const FormTextarea = AppTextarea;
export const FormSelect = AppSelect;

export function FormReadout({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="app-form-readout">
      <span className="app-form-readout__label">{label}</span>
      <span className="app-form-readout__value">{value}</span>
    </div>
  );
}
