import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { refreshCookieInterceptor } from './refresh-cookie.interceptor';

describe('refreshCookieInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([refreshCookieInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  it.each(['/auth/login', '/auth/register', '/auth/oauth2/google', '/auth/refresh', '/auth/logout'])(
    'sends credentials and the cookie-mode header to %s',
    path => {
      http.post(`${environment.apiUrl}${path}`, {}).subscribe();
      const req = backend.expectOne(`${environment.apiUrl}${path}`);
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.get('X-Refresh-Mode')).toBe('cookie');
      req.flush({});
    }
  );

  it('leaves every other endpoint alone, so the cookie is never sent there', () => {
    http.get(`${environment.apiUrl}/auth/me`).subscribe();
    const req = backend.expectOne(`${environment.apiUrl}/auth/me`);
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-Refresh-Mode')).toBe(false);
    req.flush({});
  });
});
