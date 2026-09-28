interface GoogleGsiCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleGsiPromptNotification {
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
  getMomentType: () => string;
}

interface GoogleGsiIdConfig {
  client_id: string;
  callback: (response: GoogleGsiCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  ux_mode?: 'popup' | 'redirect';
}

interface FacebookInitParams {
  appId: string;
  cookie?: boolean;
  xfbml?: boolean;
  autoLogAppEvents?: boolean;
  version: string;
}

interface FacebookAuthResponse {
  accessToken: string;
  userID: string;
  expiresIn: number;
  /** Only present with {@code response_type: 'code'} (Embedded Signup) — the 30s exchange code. */
  code?: string;
}

interface FacebookLoginResponse {
  authResponse: FacebookAuthResponse | null;
  status: 'connected' | 'not_authorized' | 'unknown';
}

/** Options for the WhatsApp Embedded Signup variant of {@code FB.login} (not the social-login one). */
interface FacebookEmbeddedSignupLoginOptions {
  config_id: string;
  response_type: 'code';
  override_default_response_type: true;
  extras: { setup: Record<string, unknown> };
}

/** Session-logging message event the Embedded Signup flow posts to the window that spawned it. */
interface WhatsAppEmbeddedSignupEventData {
  type: 'WA_EMBEDDED_SIGNUP';
  event: string;
  data: {
    phone_number_id?: string;
    waba_id?: string;
    business_id?: string;
    waba_ids?: string[];
    current_step?: string;
    error_message?: string;
    error_code?: string;
  };
}

interface FacebookMeResponse {
  id: string;
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleGsiIdConfig) => void;
        prompt: (momentListener?: (notification: GoogleGsiPromptNotification) => void) => void;
        renderButton: (parent: HTMLElement, options: object) => void;
        cancel: () => void;
        disableAutoSelect: () => void;
        revoke: (hint: string, callback: () => void) => void;
      };
    };
  };
  fbAsyncInit?: () => void;
  FB?: {
    init: (params: FacebookInitParams) => void;
    login: (
      callback: (response: FacebookLoginResponse) => void,
      options?: { scope?: string } | FacebookEmbeddedSignupLoginOptions
    ) => void;
    api: (path: string, params: object, callback: (response: FacebookMeResponse) => void) => void;
  };
}
