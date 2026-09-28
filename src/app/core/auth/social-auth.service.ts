import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FacebookSignInResult {
  idToken: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface SocialPrefill {
  email: string;
  firstName: string;
  lastName: string;
}

/** Google id_tokens are JWTs the client can decode directly for a name/email prefill (Facebook's access_token is opaque — its name/email come from a separate /me Graph API call instead). */
export function decodeGoogleIdToken(token: string): SocialPrefill {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const name = typeof payload.name === 'string' ? payload.name : '';
    return {
      email: payload.email ?? '',
      firstName: payload.given_name ?? (name.split(' ')[0] ?? ''),
      lastName: payload.family_name ?? (name.split(' ').slice(1).join(' ') ?? '')
    };
  } catch {
    return { email: '', firstName: '', lastName: '' };
  }
}

/** Thin wrapper around the Google Identity Services and Facebook Login JS SDKs (both loaded in index.html). */
@Injectable({ providedIn: 'root' })
export class SocialAuthService {
  private zone = inject(NgZone);

  promptGoogle(): Observable<string> {
    return new Observable<string>(subscriber => {
      const gId = window.google?.accounts?.id;
      if (!gId) {
        subscriber.error(new Error('GOOGLE_SDK_UNAVAILABLE'));
        return;
      }
      gId.initialize({
        client_id: environment.googleClientId,
        callback: response => {
          this.zone.run(() => {
            subscriber.next(response.credential);
            subscriber.complete();
          });
        }
      });
      gId.prompt(notification => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          this.zone.run(() => subscriber.error(new Error('GOOGLE_PROMPT_DISMISSED')));
        }
      });
    });
  }

  signInWithFacebook(): Observable<FacebookSignInResult> {
    return new Observable<FacebookSignInResult>(subscriber => {
      const fb = window.FB;
      if (!fb || !environment.facebookAppId) {
        subscriber.error(new Error('FACEBOOK_SDK_UNAVAILABLE'));
        return;
      }
      fb.init({ appId: environment.facebookAppId, cookie: true, xfbml: false, version: 'v19.0' });

      // FB.login() silently no-ops instead of invoking the callback when the SDK rejects the
      // call outright (e.g. non-HTTPS page, popup blocked) — without this, the caller hangs
      // forever with no error and no way to recover the loading state.
      const timeoutId = setTimeout(() => {
        this.zone.run(() => subscriber.error(new Error('FACEBOOK_LOGIN_TIMEOUT')));
      }, 30000);

      fb.login(response => {
        clearTimeout(timeoutId);
        this.zone.run(() => {
          const accessToken = response.authResponse?.accessToken;
          if (response.status !== 'connected' || !accessToken) {
            subscriber.error(new Error('FACEBOOK_LOGIN_CANCELLED'));
            return;
          }
          fb.api('/me', { fields: 'id,name,email,first_name,last_name' }, (profile: FacebookMeResponse) => {
            this.zone.run(() => {
              subscriber.next({
                idToken: accessToken,
                firstName: profile.first_name,
                lastName: profile.last_name,
                email: profile.email
              });
              subscriber.complete();
            });
          });
        });
      }, { scope: 'email,public_profile' });
    });
  }
}
