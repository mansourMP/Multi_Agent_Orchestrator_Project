'use client';

type ShellChromeVisibility = {
  hideShellChrome: boolean;
  isBuilderEditorRoute: boolean;
  isSetupRoute: boolean;
};

export function useShellChromeVisibility(pathname?: string | null): ShellChromeVisibility {
  const safePathname = pathname ?? '/';
  const isBuilderEditorRoute = false;
  const isSetupRoute = safePathname.startsWith('/setup');

  return {
    hideShellChrome: isBuilderEditorRoute || isSetupRoute,
    isBuilderEditorRoute,
    isSetupRoute,
  };
}
