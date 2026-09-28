import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { LoadingComponent } from './shared/components/loading/loading.component';

const AUTH_ENTRY_ROUTES = /^\/auth\/(login|register)(\?|$)/;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingComponent],
  template: `
    <router-outlet></router-outlet>
    @if (authRedirecting()) {
      <app-loading />
    }
  `
})
export class App {
  private readonly router = inject(Router);

  /**
   * True while the router is settling on `/auth/login` or `/auth/register` — covers both the
   * cold-boot gap (bootstrap + authRedirectGuard resolving before the first paint) and any
   * redirect it produces, so the login/register screen never flashes for an already-authenticated
   * visitor. Reset on every settled navigation, whatever route it ends on.
   */
  authRedirecting = signal(true);

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart && AUTH_ENTRY_ROUTES.test(event.url)) {
        this.authRedirecting.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.authRedirecting.set(false);
      }
    });
  }
}
