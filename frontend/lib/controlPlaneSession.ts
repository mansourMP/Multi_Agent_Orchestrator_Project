let controlPlaneSessionPromise: Promise<void> | null = null;
let controlPlaneAdminLoginPromise: Promise<void> | null = null;

type ControlPlaneCredentialPromptResult = {
  email: string;
  password: string;
} | null;

function promptAdminBrowserLogin(): Promise<ControlPlaneCredentialPromptResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.background = 'rgba(11, 15, 23, 0.58)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '24px';

    const dialog = document.createElement('div');
    dialog.style.width = '100%';
    dialog.style.maxWidth = '420px';
    dialog.style.background = '#ffffff';
    dialog.style.border = '1px solid rgba(15, 23, 42, 0.12)';
    dialog.style.borderRadius = '18px';
    dialog.style.boxShadow = '0 24px 80px rgba(15, 23, 42, 0.24)';
    dialog.style.padding = '24px';
    dialog.style.display = 'grid';
    dialog.style.gap = '14px';

    const title = document.createElement('div');
    title.textContent = 'Admin login required';
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    title.style.color = '#0f172a';

    const copy = document.createElement('div');
    copy.textContent = 'Sign in with an admin account to unlock the control plane in this browser.';
    copy.style.fontSize = '14px';
    copy.style.lineHeight = '1.5';
    copy.style.color = '#475569';

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Admin email';
    emailInput.autocomplete = 'username';
    emailInput.style.width = '100%';
    emailInput.style.height = '42px';
    emailInput.style.border = '1px solid rgba(148, 163, 184, 0.45)';
    emailInput.style.borderRadius = '12px';
    emailInput.style.padding = '0 12px';
    emailInput.style.fontSize = '14px';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.style.width = '100%';
    passwordInput.style.height = '42px';
    passwordInput.style.border = '1px solid rgba(148, 163, 184, 0.45)';
    passwordInput.style.borderRadius = '12px';
    passwordInput.style.padding = '0 12px';
    passwordInput.style.fontSize = '14px';

    const errorText = document.createElement('div');
    errorText.style.display = 'none';
    errorText.style.fontSize = '13px';
    errorText.style.color = '#b91c1c';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '10px';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.style.height = '40px';
    cancelButton.style.padding = '0 14px';
    cancelButton.style.borderRadius = '12px';
    cancelButton.style.border = '1px solid rgba(148, 163, 184, 0.35)';
    cancelButton.style.background = '#ffffff';
    cancelButton.style.color = '#334155';
    cancelButton.style.fontWeight = '600';

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.textContent = 'Sign in';
    submitButton.style.height = '40px';
    submitButton.style.padding = '0 14px';
    submitButton.style.borderRadius = '12px';
    submitButton.style.border = 'none';
    submitButton.style.background = '#0f172a';
    submitButton.style.color = '#ffffff';
    submitButton.style.fontWeight = '600';

    function cleanup(result: ControlPlaneCredentialPromptResult) {
      overlay.remove();
      window.removeEventListener('keydown', handleKeyDown);
      resolve(result);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup(null);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    }

    function submit() {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        errorText.textContent = 'Email and password are required.';
        errorText.style.display = 'block';
        return;
      }
      cleanup({ email, password });
    }

    cancelButton.addEventListener('click', () => cleanup(null));
    submitButton.addEventListener('click', submit);
    window.addEventListener('keydown', handleKeyDown);

    actions.append(cancelButton, submitButton);
    dialog.append(title, copy, emailInput, passwordInput, errorText, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    window.setTimeout(() => emailInput.focus(), 0);
  });
}

async function loginAdminBrowserIdentity(): Promise<void> {
  if (!controlPlaneAdminLoginPromise) {
    controlPlaneAdminLoginPromise = (async () => {
      const credentials = await promptAdminBrowserLogin();
      if (!credentials) {
        throw new Error('Admin browser login was cancelled.');
      }
      const response = await fetch('/api/control-plane/auth/login', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const detail =
          payload && typeof payload.detail === 'string' && payload.detail.trim()
            ? payload.detail.trim()
            : 'Admin browser login failed.';
        throw new Error(detail);
      }
    })().catch((error) => {
      controlPlaneAdminLoginPromise = null;
      throw error;
    });
  }
  return controlPlaneAdminLoginPromise;
}

export async function ensureControlPlaneSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!controlPlaneSessionPromise) {
    controlPlaneSessionPromise = (async () => {
      async function bootstrap(): Promise<void> {
        const res = await fetch('/api/control-plane/session', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (res.ok) return;
        const payload = await res.json().catch(() => null);
        const requiresLogin = Boolean(payload && typeof payload === 'object' && (payload as { requires_login?: unknown }).requires_login);
        if (res.status === 401 && requiresLogin) {
          await loginAdminBrowserIdentity();
          const retry = await fetch('/api/control-plane/session', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
          });
          if (retry.ok) return;
          const retryPayload = await retry.json().catch(() => null);
          const retryDetail =
            retryPayload && typeof retryPayload.detail === 'string' && retryPayload.detail.trim()
              ? retryPayload.detail.trim()
              : 'Control-plane session bootstrap failed.';
          throw new Error(retryDetail);
        }
        const detail =
          payload && typeof payload.detail === 'string' && payload.detail.trim()
            ? payload.detail.trim()
            : 'Control-plane session bootstrap failed.';
        throw new Error(detail);
      }

      await bootstrap();
    })().catch((error) => {
      controlPlaneSessionPromise = null;
      throw error;
    });
  }
  return controlPlaneSessionPromise;
}
