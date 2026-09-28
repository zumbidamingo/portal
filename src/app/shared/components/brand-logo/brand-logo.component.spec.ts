import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../../core/services/theme.service';
import { BrandLogoComponent } from './brand-logo.component';

describe('BrandLogoComponent', () => {
  function render(inputs: Record<string, unknown>): HTMLElement {
    const fixture = TestBed.createComponent(BrandLogoComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is announced as one image named after the brand, with the letters hidden', () => {
    const el = render({ variant: 'wordmark' });

    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Sua Operação');
    expect(el.querySelector('.bl-wordmark')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.bl-wordmark')?.textContent).toBe('suaoperação.');
  });

  it('drops the dot from the symbol below 24 px', () => {
    expect(render({ variant: 'symbol', size: 32 }).querySelector('.bl-symbol')?.textContent).toBe('s.');
    expect(render({ variant: 'symbol', size: 20 }).querySelector('.bl-symbol')?.textContent).toBe('s');
  });

  it('renders symbol and wordmark in the vertical lockup', () => {
    const el = render({ variant: 'lockup-vertical', size: 64 });

    expect(el.querySelector('.bl-symbol')).not.toBeNull();
    expect(el.querySelector('.bl-wordmark')).not.toBeNull();
  });

  it('follows the portal theme when the tone is auto', () => {
    const theme = TestBed.inject(ThemeService);

    theme.setMode('light');
    expect(render({ tone: 'auto' }).classList).toContain('bl-tone-color');

    theme.setMode('dark');
    expect(render({ tone: 'auto' }).classList).toContain('bl-tone-dark');
    expect(render({ tone: 'mono-white' }).classList).toContain('bl-tone-mono-white');

    theme.setMode('system');
  });
});
