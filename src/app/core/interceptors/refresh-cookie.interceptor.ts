import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const TOKEN_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/oauth2/', '/auth/refresh', '/auth/logout'];

/**
 * Os endpoints que emitem ou consomem o refresh token trocam-no por um cookie HttpOnly: o pedido
 * tem de levar credenciais e avisar o backend de que este cliente é um browser. Fora destes
 * endpoints o cookie nunca é enviado (o próprio cookie tem Path=/api/v1/auth).
 */
export const refreshCookieInterceptor: HttpInterceptorFn = (req, next) => {
  const isTokenEndpoint = req.url.startsWith(environment.apiUrl)
    && TOKEN_ENDPOINTS.some(path => req.url.startsWith(`${environment.apiUrl}${path}`));
  if (!isTokenEndpoint) {
    return next(req);
  }
  return next(req.clone({ withCredentials: true, setHeaders: { 'X-Refresh-Mode': 'cookie' } }));
};
