import { APP_INITIALIZER, ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { NavigationStart, Router, provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import localePtPt from '@angular/common/locales/pt-PT';
import localeEnGb from '@angular/common/locales/en-GB';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';
import { firstValueFrom, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { routes } from './app.routes';
import { refreshCookieInterceptor } from './core/interceptors/refresh-cookie.interceptor';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { TokenService } from './core/auth/token.service';
import { LocaleService } from './core/services/locale.service';
import { ThemeService } from './core/services/theme.service';

// Dados de formatação de cada locale servido. O Angular só os traz se forem registados
// explicitamente — sem isto o LOCALE_ID aponta para dados que não existem e a formatação
// cai silenciosamente para en-US. O 'pt' do Angular é o do Brasil; registamo-lo sob a
// etiqueta completa para não haver ambiguidade com pt-PT.
registerLocaleData(localePt, 'pt-BR');
registerLocaleData(localePtPt, 'pt-PT');
registerLocaleData(localeEnGb, 'en');

// Identidade "The Quiet Ledger" (DESIGN.md): canvas cinzento, cartões brancos/quase pretos,
// botão primário em tinta, um verde de acento — nunca roxo. Light e dark são temas de primeira
// classe.
//
// Aura deriva quase todo componente (button, input, select, table, dialog, tabs...) de um
// punhado de aliases semânticos (primary, surface, text, content, formField, overlay). Aqui esses
// aliases apontam para as variáveis CSS de styles.css (`--app-*`), não para hex: o tema muda no
// atributo `data-theme` do <html> e o PrimeNG segue sem um segundo conjunto de valores. Por isso
// o mesmo objeto serve os dois esquemas (`bothSchemes`); só a escala `surface` — que o Aura usa
// por posição, com sentido oposto nos dois temas — tem valores literais por esquema.
const themeAliases = {
  primary: {
    color: 'var(--app-action)',
    contrastColor: 'var(--app-action-text)',
    hoverColor: 'var(--app-action-hover)',
    activeColor: 'var(--app-action-hover)',
  },
  highlight: {
    background: 'var(--app-accent-soft)',
    focusBackground: 'var(--app-accent-soft)',
    color: 'var(--app-accent)',
    focusColor: 'var(--app-accent)',
  },
  focusRing: { color: 'var(--app-accent)' },
  mask: { background: 'var(--app-scrim)', color: 'var(--app-text)' },
  formField: {
    background: 'var(--app-bg)',
    disabledBackground: 'var(--app-surface-hover)',
    filledBackground: 'var(--app-surface-sunken)',
    filledHoverBackground: 'var(--app-surface-hover)',
    filledFocusBackground: 'var(--app-bg)',
    borderColor: 'var(--app-border)',
    hoverBorderColor: 'var(--app-text-disabled)',
    focusBorderColor: 'var(--app-accent)',
    color: 'var(--app-text)',
    disabledColor: 'var(--app-text-disabled)',
    placeholderColor: 'var(--app-text-tertiary)',
    floatLabelColor: 'var(--app-text-tertiary)',
    iconColor: 'var(--app-text-tertiary)',
  },
  text: {
    color: 'var(--app-text)',
    hoverColor: 'var(--app-text)',
    mutedColor: 'var(--app-text-tertiary)',
    hoverMutedColor: 'var(--app-text-secondary)',
  },
  content: {
    background: 'var(--app-bg)',
    hoverBackground: 'var(--app-surface-hover)',
    borderColor: 'var(--app-border)',
    color: 'var(--app-text)',
    hoverColor: 'var(--app-text)',
  },
  overlay: {
    modal: { background: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' },
    popover: { background: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' },
    select: { background: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' },
  },
};

// Botão sólido de uma severidade: a variável `--app-<estado>-text` é o tom legível do estado em cada
// tema, e `--app-action-text` (branco no light, tinta no dark) é o rótulo com contraste sobre ele.
const solidSeverity = (state: 'success' | 'warning' | 'danger' | 'accent') => {
  const tone = state === 'accent' ? 'var(--app-accent)' : `var(--app-${state}-text)`;
  const hover = `color-mix(in srgb, ${tone} 88%, var(--app-text))`;
  return {
    background: tone, hoverBackground: hover, activeBackground: hover,
    borderColor: tone, hoverBorderColor: hover, activeBorderColor: hover,
    color: 'var(--app-action-text)', hoverColor: 'var(--app-action-text)', activeColor: 'var(--app-action-text)',
    focusRing: { color: tone, shadow: 'none' },
  };
};

// Botão "em tinta" do verde de acento, como o "Ask vero" do mockup: fundo `accent-soft`, contorno
// `accent-border`, texto `accent`. Serve success/info/help — um só verde no sistema, e o `help`
// deixa de cair no roxo padrão do Aura.
const tintSeverity = () => {
  const hover = 'color-mix(in srgb, var(--app-accent-soft) 80%, var(--app-accent))';
  return {
    background: 'var(--app-accent-soft)', hoverBackground: hover, activeBackground: hover,
    borderColor: 'var(--app-accent-border)', hoverBorderColor: 'var(--app-accent-border)', activeBorderColor: 'var(--app-accent-border)',
    color: 'var(--app-accent)', hoverColor: 'var(--app-accent)', activeColor: 'var(--app-accent)',
    focusRing: { color: 'var(--app-accent)', shadow: 'none' },
  };
};

// Variantes outlined e text de uma severidade: o tom legível do estado (`--app-<estado>-text`) no
// rótulo e no contorno, e a tinta do estado (`-bg`) só no hover. Sem isto o Aura usa o verde/âmbar/
// vermelho 500 da paleta, que fica a ~2:1 sobre branco.
const stateTone = (state: 'success' | 'warning' | 'danger' | 'accent') =>
  state === 'accent'
    ? { text: 'var(--app-accent)', tint: 'var(--app-accent-soft)' }
    : { text: `var(--app-${state}-text)`, tint: `var(--app-${state}-bg)` };

const outlinedSeverity = (state: 'success' | 'warning' | 'danger' | 'accent') => {
  const { text, tint } = stateTone(state);
  return {
    hoverBackground: tint, activeBackground: tint,
    borderColor: `color-mix(in srgb, ${text} 45%, transparent)`, color: text,
  };
};

const textSeverity = (state: 'success' | 'warning' | 'danger' | 'accent') => {
  const { text, tint } = stateTone(state);
  return { hoverBackground: tint, activeBackground: tint, color: text };
};

const segmented = (checkedBackground: string) => ({
  root: {
    background: 'transparent', hoverBackground: 'var(--app-surface-hover)',
    borderColor: 'transparent', color: 'var(--app-text-secondary)', hoverColor: 'var(--app-text)',
    checkedBackground, checkedColor: 'var(--app-text)', checkedBorderColor: 'transparent',
  },
  content: { checkedBackground, checkedShadow: 'none' },
  icon: { color: 'var(--app-text-secondary)', hoverColor: 'var(--app-text)', checkedColor: 'var(--app-text)' },
});

const bothSchemes = <T>(scheme: T) => ({ light: scheme, dark: scheme });

const SuaOperacaoPreset = definePreset(Aura, {
  primitive: {
    // DESIGN.md: 4px badges/chips, 6px controlos pequenos, 8px botões/inputs/nav, 12px
    // cartões/dialogs/drawers.
    borderRadius: { none: '0', xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '12px' },
  },
  semantic: {
    // Escala numérica do acento verde: usada por Highlight/Tag/Badge quando não há token
    // próprio. A cor do botão primário NÃO vem daqui — vem de `primary.color` (tinta).
    primary: {
      50:  '#EEF8F5',
      100: '#E6F4F2',
      200: '#D0E0DA',
      300: '#A9D4C7',
      400: '#6FCFB0',
      500: '#3FA283',
      600: '#237A5F',
      700: '#146B4E',
      800: '#0C4C38',
      900: '#0A3B2C',
      950: '#062419',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#FFFFFF',
          50: '#F6F6F6',
          100: '#F2F2F2',
          200: '#EAEAEA',
          300: '#DEDEDE',
          400: '#C5C5C5',
          500: '#9E9E9E',
          600: '#666666',
          700: '#3A3A3A',
          800: '#242424',
          900: '#171717',
          950: '#0A0A0A',
        },
        ...themeAliases,
      },
      dark: {
        surface: {
          0: '#FFFFFF',
          50: '#EDEDED',
          100: '#D4D4D4',
          200: '#A0A0A0',
          300: '#707070',
          400: '#4A4A4A',
          500: '#3A3A3A',
          600: '#2E2E2E',
          700: '#262626',
          800: '#1E1E1E',
          900: '#1A1A1A',
          950: '#111111',
        },
        ...themeAliases,
      },
    },
  },
  components: {
    button: {
      colorScheme: bothSchemes({
        root: {
          secondary: {
            background: 'var(--app-bg)', hoverBackground: 'var(--app-surface-hover)', activeBackground: 'var(--app-surface-hover)',
            borderColor: 'var(--app-border)', hoverBorderColor: 'var(--app-border)', activeBorderColor: 'var(--app-border)',
            color: 'var(--app-text)', hoverColor: 'var(--app-text)', activeColor: 'var(--app-text)',
          },
          // Severidades sólidas: fundo no tom de texto do estado (contraste AA nos dois temas) e
          // rótulo na cor de ação invertida. O verde/âmbar/vermelho padrão do Aura reprova em light.
          success: tintSeverity(),
          info: tintSeverity(),
          help: tintSeverity(),
          warn: solidSeverity('warning'),
          danger: solidSeverity('danger'),
        },
        // `[outlined]="true"` sem severity é o padrão usado nas páginas pra ações secundárias
        // (Cancelar, Importar, Atualizar) — visual neutro, nunca contorno verde.
        outlined: {
          primary: {
            hoverBackground: 'var(--app-surface-hover)', activeBackground: 'var(--app-surface-hover)',
            borderColor: 'var(--app-border)', color: 'var(--app-text)',
          },
          secondary: {
            hoverBackground: 'var(--app-surface-hover)', activeBackground: 'var(--app-surface-hover)',
            borderColor: 'var(--app-border)', color: 'var(--app-text-secondary)',
          },
          success: outlinedSeverity('accent'),
          info: outlinedSeverity('accent'),
          help: outlinedSeverity('accent'),
          warn: outlinedSeverity('warning'),
          danger: outlinedSeverity('danger'),
        },
        text: {
          primary: { hoverBackground: 'var(--app-surface-hover)', activeBackground: 'var(--app-surface-hover)', color: 'var(--app-text)' },
          secondary: { hoverBackground: 'var(--app-surface-hover)', activeBackground: 'var(--app-surface-hover)', color: 'var(--app-text-secondary)' },
          success: textSeverity('accent'),
          info: textSeverity('accent'),
          help: textSeverity('accent'),
          warn: textSeverity('warning'),
          danger: textSeverity('danger'),
        },
      }),
    },
    tag: {
      root: { borderRadius: '{border.radius.xs}' },
      colorScheme: bothSchemes({
        primary: { background: 'var(--app-accent-soft)', color: 'var(--app-accent)' },
        secondary: { background: 'var(--app-neutral-bg)', color: 'var(--app-neutral-text)' },
        success: { background: 'var(--app-success-bg)', color: 'var(--app-success-text)' },
        info: { background: 'var(--app-neutral-bg)', color: 'var(--app-neutral-text)' },
        warn: { background: 'var(--app-warning-bg)', color: 'var(--app-warning-text)' },
        danger: { background: 'var(--app-danger-bg)', color: 'var(--app-danger-text)' },
      }),
    },
    badge: {
      colorScheme: bothSchemes({
        primary: { background: 'var(--app-action)', color: 'var(--app-action-text)' },
        secondary: { background: 'var(--app-neutral-bg)', color: 'var(--app-neutral-text)' },
        success: { background: 'var(--app-success-bg)', color: 'var(--app-success-text)' },
        warn: { background: 'var(--app-warning-bg)', color: 'var(--app-warning-text)' },
        danger: { background: 'var(--app-danger-bg)', color: 'var(--app-danger-text)' },
      }),
    },
    card: {
      root: { shadow: 'none' },
    },
    // Sem sombra em nenhuma superfície (DESIGN.md → Elevation): overlays separam-se pela borda
    // de 1px e pelo scrim, como os cartões.
    dialog: { root: { shadow: 'none' } },
    drawer: { root: { shadow: 'none' } },
    popover: { root: { shadow: 'none' } },
    confirmpopup: { root: { shadow: 'none' } },
    menu: { root: { shadow: 'none' } },
    tieredmenu: { root: { shadow: 'none' } },
    contextmenu: { root: { shadow: 'none' } },
    select: { overlay: { shadow: 'none' } },
    multiselect: { overlay: { shadow: 'none' } },
    autocomplete: { overlay: { shadow: 'none' } },
    datepicker: { panel: { shadow: 'none' } },
    // ToggleButton/SelectButton (Cliente: Empresa/Pessoa, Quadro/Agenda/Lista): o Aura usa a escala
    // `surface` por posição, que no dark deixava o rótulo inativo em contraste 2:1.
    togglebutton: {
      // Controlo segmentado como no mockup: bandeja no contentor do grupo (styles.css), itens sem contorno nem divisórias, e o
      // item ativo é uma peça elevada só por tom (sem borda e sem a sombra do Aura).
      colorScheme: {
        light: segmented('var(--app-bg)'),
        dark: segmented('var(--app-surface-hover)'),
      },
    },

    datatable: {
      // headerCell/bodyCell não herdam de `text.mutedColor`/`text.color` por padrão (usam
      // `content.color` para os dois) — sem isto o header ficaria tão escuro quanto o conteúdo.
      // A coluna ordenada não leva fundo de realce (o Aura usa `highlight`): fica com o fundo dos
      // outros cabeçalhos e só o texto sobe para `text`, como no mockup.
      headerCell: {
        color: 'var(--app-text-tertiary)', hoverColor: 'var(--app-text)',
        selectedBackground: 'var(--app-bg)', selectedColor: 'var(--app-text)',
      },
    },
  },
});

function setupNavTransitions(router: Router) {
  return () => {
    router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        const from = router.url || '/';
        const to = event.url;
        const crossContext = from.startsWith('/auth') || to.startsWith('/auth');
        // Navegação entre orçamentos (lista/detalhe/revisões) ganha fade suave — troca de
        // conteúdo relacionado, não de contexto — diferente do resto da app, que é instantâneo.
        const isQuotations = (url: string) => url.startsWith('/quotations') && !url.startsWith('/quotations/public');
        const quotationsNav = !crossContext && isQuotations(from) && isQuotations(to);
        document.documentElement.setAttribute('data-nav', crossContext ? 'cross' : quotationsNav ? 'quotations' : 'app');
      }
    });
  };
}

function initTheme(theme: ThemeService) {
  return () => theme.init();
}

function initTranslations(translate: TranslateService, langService: LocaleService) {
  return () => firstValueFrom(translate.use(langService.getStored()));
}

function initAuth(auth: AuthService, tokenService: TokenService, langService: LocaleService) {
  return () => {
    if (!tokenService.hasSessionHint()) return Promise.resolve(null);

    return firstValueFrom(
      auth.refreshToken().pipe(
        switchMap(() => auth.getCurrentUser()),
        catchError(() => {
          tokenService.clearTokens();
          return of(null);
        })
      )
    ).then(user => {
      if (user?.locale) langService.setLocale(user.locale);
      return user;
    });
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions({
      skipInitialTransition: true,
      onViewTransitionCreated: ({ transition }) => {
        transition.finished.then(() => {
          document.documentElement.removeAttribute('data-nav');
        });
      }
    })),
    provideHttpClient(withInterceptors([refreshCookieInterceptor, jwtInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: SuaOperacaoPreset,
        options: { prefix: 'p', darkModeSelector: '[data-theme="dark"]', cssLayer: false }
      },
      // Default do PrimeNG é modal:1100 > overlay:1000 — um p-select/p-multiSelect aberto
      // dentro de um p-dialog/p-drawer (modal) renderiza ATRÁS do footer/chrome do próprio
      // dialog/drawer, escondendo o painel e qualquer botão logo abaixo do campo. overlay/menu
      // têm de ficar acima de modal para que dropdowns aninhados em dialogs/drawers sejam sempre visíveis.
      zIndex: { modal: 1100, overlay: 1200, menu: 1200, tooltip: 1300 },
    }),
    provideTranslateService({ fallbackLang: 'en' }),
    provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json', useHttpBackend: true }),
    {
      // Sem isto, o Angular formata tudo em en-US: `1234.5 | currency:'BRL'` sairia
      // "R$1,234.50" em vez de "R$ 1.234,50". O locale ativo é resolvido antes do arranque,
      // por isso pode ser uma factory — uma troca de locale em runtime recarrega a aplicação.
      provide: LOCALE_ID,
      useFactory: (localeService: LocaleService) => localeService.getStored(),
      deps: [LocaleService],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: setupNavTransitions,
      deps: [Router],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initTheme,
      deps: [ThemeService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initTranslations,
      deps: [TranslateService, LocaleService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      deps: [AuthService, TokenService, LocaleService],
      multi: true,
    },
    MessageService,
    ConfirmationService,
  ]
};
