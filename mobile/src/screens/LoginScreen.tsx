import { useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import {
  getDefaultPlatformUrl,
  getDefaultRuntimeUrl,
  mobileApi,
  type MobileAuthLoginResponse,
  type MobileAuthProvidersResponse,
} from "@/src/lib/api";
import { ensureMobileDeviceId } from "@/src/lib/mobile-engine";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

WebBrowser.maybeCompleteAuthSession();

type SignInProvider = "apple" | "google" | "password";

function formatLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : "We could not sign you in.";
  if (message.toLowerCase().includes("cloud api url is not configured")) {
    return "Empyralis cloud is not configured in this build yet.";
  }
  if (message.toLowerCase().includes("network request failed")) {
    return "We couldn't reach Empyralis. Try again in a moment.";
  }
  return message;
}

export default function LoginScreen() {
  const theme = useTheme();
  const { saveSession, session } = useSessionState();
  const runtimeUrl = getDefaultRuntimeUrl();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [providers, setProviders] = useState<MobileAuthProvidersResponse | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [savingProvider, setSavingProvider] = useState<SignInProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const hasRuntimeUrl = Boolean(runtimeUrl);

  const googleConfig = useMemo(
    () => ({
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
      selectAccount: true,
      scopes: ["openid", "email", "profile"],
    }),
    [],
  );

  const hasGoogleIds = Boolean(
    googleConfig.androidClientId ||
    googleConfig.iosClientId ||
    googleConfig.webClientId,
  );

  const [request, response, promptAsync] = Google.useAuthRequest({
    ...googleConfig,
    clientId:
      googleConfig.iosClientId ||
      googleConfig.androidClientId ||
      googleConfig.webClientId ||
      "mobile-google-sign-in-disabled",
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { authentication } = response;
      const idToken = authentication?.idToken || response.params?.id_token;
      if (idToken) {
        void handleGoogle(idToken);
      }
    }
    // OAuth responses should be handled once per provider callback, not retriggered by local saving state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  useEffect(() => {
    if (session?.runtimeKey) {
      router.replace("/chats");
    }
  }, [session?.runtimeKey]);

  useEffect(() => {
    let active = true;
    setLoadingProviders(true);
    setError(null);
    if (!hasRuntimeUrl) {
      setAppleAvailable(false);
      setProviders(null);
      setError("Empyralis cloud is not configured in this build yet.");
      setLoadingProviders(false);
      return () => {
        active = false;
      };
    }
    Promise.all([
      AppleAuthentication.isAvailableAsync().catch(() => false),
      mobileApi.getAuthProviders(runtimeUrl).then(
        (authProviders) => ({ providers: authProviders, error: null }),
        (nextError) => ({ providers: null, error: nextError }),
      ),
    ])
      .then(([appleSupported, authResult]) => {
        if (!active) return;
        setAppleAvailable(Boolean(appleSupported));
        setProviders(authResult.providers);
        if (authResult.error) {
          setError(formatLoginError(authResult.error));
        }
      })
      .finally(() => {
        if (!active) return;
        setLoadingProviders(false);
      });
    return () => {
      active = false;
    };
  }, [hasRuntimeUrl, runtimeUrl]);

  const appleEnabled = useMemo(
    () => Boolean(appleAvailable && providers?.apple?.enabled && hasRuntimeUrl),
    [appleAvailable, providers?.apple?.enabled, hasRuntimeUrl],
  );

  const googleEnabled = useMemo(
    () => Boolean(providers?.google?.enabled && hasRuntimeUrl && hasGoogleIds),
    [providers?.google?.enabled, hasRuntimeUrl, hasGoogleIds],
  );

  const finishLogin = async (login: MobileAuthLoginResponse) => {
    const deviceId = await ensureMobileDeviceId(session?.deviceId);
    const provisionalSession = {
      runtimeUrl,
      runtimeKey: login.token,
      authScheme: "bearer" as const,
      tenantId:
        String(login.current_tenant_id || login.default_tenant_id || "").trim()
        || undefined,
      workspaceId:
        String(login.current_workspace_id || login.default_workspace_id || "").trim()
        || undefined,
      platformUrl: getDefaultPlatformUrl() || session?.platformUrl,
      platformKey: session?.platformKey,
      refreshToken: String(login.session_recovery?.refresh_token || "").trim() || undefined,
      refreshExpiresAt: Number(login.session_recovery?.refresh_expires_at || 0) || undefined,
      authSessionId: String(login.auth_session?.session_id || "").trim() || undefined,
      userEmail: String(login.user?.email || "").trim() || undefined,
      userDisplayName: String(login.user?.display_name || login.user?.name || "").trim() || undefined,
      deviceId,
      sessionLinkedAt: new Date().toISOString(),
    };
    const accountShell = await mobileApi.getAccountShell(provisionalSession).catch(() => null);
    const firstWorkspaceId = String(accountShell?.workspaceMemberships?.[0]?.workspace?.id || "").trim();
    const resolvedWorkspaceId =
      (provisionalSession.workspaceId
        ? provisionalSession.workspaceId
        : firstWorkspaceId)
      || provisionalSession.workspaceId
      || undefined;

    await saveSession({
      ...provisionalSession,
      tenantId:
        provisionalSession.tenantId
        || String(accountShell?.workspaceMemberships?.[0]?.workspace?.tenantId || "").trim()
        || undefined,
      workspaceId: resolvedWorkspaceId,
      userEmail:
        provisionalSession.userEmail
        || String(accountShell?.account?.email || "").trim()
        || undefined,
      userDisplayName:
        provisionalSession.userDisplayName
        || String(accountShell?.account?.displayName || "").trim()
        || undefined,
    });
    router.replace("/");
  };

  const handleApple = async () => {
    if (savingProvider) return;
    if (!appleEnabled) {
      setError(hasRuntimeUrl ? "Apple sign-in is not available right now." : "Empyralis cloud is not configured in this build yet.");
      return;
    }
    setSavingProvider("apple");
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const identityToken = String(credential.identityToken || "").trim();
      if (!identityToken) {
        throw new Error("Apple sign-in did not return an identity token.");
      }
      const deviceId = await ensureMobileDeviceId(session?.deviceId);
      const name = [
        credential.fullName?.givenName || "",
        credential.fullName?.familyName || "",
      ].join(" ").trim();
      const login = await mobileApi.loginWithProvider({
        runtimeUrl,
        provider: "apple",
        identityToken,
        email: credential.email || undefined,
        name: name || undefined,
        deviceId,
        deviceName: "iPhone",
        devicePlatform: "ios",
      });
      await finishLogin(login);
    } catch (nextError: any) {
      if (String(nextError?.code || "").trim() === "ERR_REQUEST_CANCELED") {
        setSavingProvider(null);
        return;
      }
      setError(formatLoginError(nextError));
    } finally {
      setSavingProvider(null);
    }
  };

  const handleGoogle = async (idToken: string) => {
    if (savingProvider) return;
    setSavingProvider("google");
    setError(null);
    try {
      const deviceId = await ensureMobileDeviceId(session?.deviceId);
      const login = await mobileApi.loginWithProvider({
        runtimeUrl,
        provider: "google",
        identityToken: idToken,
        deviceId,
        deviceName: "iPhone",
        devicePlatform: "ios",
      });
      await finishLogin(login);
    } catch (nextError) {
      setError(formatLoginError(nextError));
    } finally {
      setSavingProvider(null);
    }
  };

  const handlePasswordLogin = async () => {
    if (savingProvider) return;
    const trimmedEmail = email.trim();
    if (!hasRuntimeUrl) {
      setError("Empyralis cloud is not configured in this build yet.");
      return;
    }
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    setSavingProvider("password");
    setError(null);
    try {
      const deviceId = await ensureMobileDeviceId(session?.deviceId);
      const login = await mobileApi.loginWithPassword({
        runtimeUrl,
        email: trimmedEmail,
        password,
        deviceId,
        deviceName: "iPhone",
        devicePlatform: "ios",
      });
      await finishLogin(login);
    } catch (nextError) {
      setError(formatLoginError(nextError));
    } finally {
      setSavingProvider(null);
    }
  };

  return (
    <MobileScreen>
      <ScreenHeader
        title="Set up your personal agent"
        subtitle="Sign in to continue on this phone."
      />

      <SectionCard title="Continue" subtitle="Use Apple or your Empyralis account.">
        <View style={{ gap: 14 }}>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            placeholder="Email"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={{
              height: 50,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: 16,
              color: theme.colors.text,
              fontSize: 15,
            }}
          />
          <TextInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (error) setError(null);
            }}
            placeholder="Password"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              height: 50,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: 16,
              color: theme.colors.text,
              fontSize: 15,
            }}
          />
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => {
              void handlePasswordLogin();
            }}
            disabled={savingProvider !== null}
            style={{
              height: 50,
              borderRadius: 18,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: savingProvider !== null ? 0.72 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "DMSans_700Bold" }}>
              {savingProvider === "password" ? "Signing in..." : "Sign in"}
            </Text>
          </TouchableOpacity>
          {googleEnabled ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                Or continue with Google
              </Text>
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => {
                  void promptAsync();
                }}
                disabled={savingProvider !== null || !request}
                style={{
                  height: 50,
                  borderRadius: 18,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: (savingProvider !== null || !request) ? 0.72 : 1,
                }}
              >
                <Text style={{ color: "#000000", fontSize: 15, fontFamily: "DMSans_700Bold" }}>
                  {savingProvider === "google" ? "Signing in..." : "Sign in with Google"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {appleEnabled ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                Or continue with Apple
              </Text>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={18}
                style={{ width: "100%", height: 50 }}
                onPress={handleApple}
              />
            </View>
          ) : null}
          {loadingProviders ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
              Checking sign-in options...
            </Text>
          ) : null}
          {savingProvider ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              Securing your session...
            </Text>
          ) : null}
          {error ? (
            <Text style={{ color: theme.colors.error, fontSize: 13, lineHeight: 19 }}>
              {error}
            </Text>
          ) : null}
        </View>
      </SectionCard>
    </MobileScreen>
  );
}
