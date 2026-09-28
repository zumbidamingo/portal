/**
 * Staging environment — HTTPS via suaoperacao-edge (TLS termination por domínio),
 * ver docker/docker-compose.staging.yml e docker/config/nginx/edge.conf.
 *
 * API/WS are relative: the Portal's own Nginx proxies /api and /ws to the
 * backend (see apps/portal/nginx.conf), so no absolute host is needed — same-origin.
 */
export const environment = {
  production: true,
  apiUrl: '/api/v1',
  wsUrl: '/ws/chat',
  landingBaseUrl: 'https://staging.suaoperacao.com',
  stripePublicKey: 'pk_test_placeholder',
  googleClientId: '495040927434-tfq6vsi87ljd40if00jin03jlo7aoh85.apps.googleusercontent.com',
  facebookAppId: '4540067686319361',
  firebaseConfig: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};
