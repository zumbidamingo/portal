import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, of, switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import {
  CatalogService, PriceType, ServiceCategory, ServiceCategoryService, ServiceService, Skill, SkillService,
} from '../../../core/services/catalog.service';
import { Tenant } from '../../../core/services/tenant.service';
import { OnboardingFooterComponent } from '../onboarding-footer.component';

const PRICE_TYPES: PriceType[] = ['FIXED', 'PER_SQUARE_METER', 'PER_PIECE', 'PER_HOUR'];
const CATEGORY_SUGGESTIONS = ['upholstery', 'rugs', 'waterproofing', 'leather'];

/**
 * Passo 2 — primeiro serviço. Sem um serviço ativo não há orçamento: o catálogo exige preço e uma
 * habilidade para ativar (CLAUDE.md §10). O dono só vê "o que vendo e por quanto"; categoria e
 * habilidade são a estrutura que o sistema pede e aqui saem de dois campos curtos — a habilidade
 * acompanha a categoria até o dono mexer nela. Nomes que já existem são reaproveitados.
 */
@Component({
  selector: 'app-onboarding-catalog-step',
  standalone: true,
  imports: [CurrencyPipe, ReactiveFormsModule, TranslatePipe, ButtonModule, InputNumberModule, InputTextModule, SelectModule,
    OnboardingFooterComponent],
  template: `
    <div class="flex flex-col flex-1">
      @if (activeCount() > 0) {
        <div class="rounded-lg bg-app-accent-soft border border-app-accent-border p-3 mb-4 flex items-center gap-2">
          <i class="pi pi-check-circle text-app-accent" aria-hidden="true"></i>
          <p class="text-sm text-app-text">{{ 'onboarding.catalog.alreadyActive' | translate: { count: activeCount() } }}</p>
        </div>
      }

      @if (created().length) {
        <ul class="space-y-1.5 mb-4" [attr.aria-label]="'onboarding.catalog.createdLabel' | translate">
          @for (s of created(); track s.id) {
            <li class="flex items-center justify-between gap-3 text-sm rounded-md bg-app-surface px-3 py-2">
              <span class="flex items-center gap-2 min-w-0">
                <i class="pi pi-check text-app-success text-xs" aria-hidden="true"></i>
                <span class="truncate text-app-text">{{ s.name }}</span>
              </span>
              <span class="text-xs text-app-text-tertiary shrink-0 font-mono">
                {{ s.price | currency: (s.currency ?? currency()) : 'symbol' : '1.2-2' : locale() }}
                · {{ 'catalog.services.priceType' + s.priceType | translate }}
              </span>
            </li>
          }
        </ul>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label" for="ob-service-name">{{ 'onboarding.catalog.serviceName' | translate }} *</label>
          <input id="ob-service-name" pInputText formControlName="name" fluid
                 [placeholder]="'onboarding.catalog.serviceNamePlaceholder' | translate" />
        </div>
        <div>
          <label class="label" for="ob-price-type">{{ 'onboarding.catalog.chargedBy' | translate }} *</label>
          <p-select inputId="ob-price-type" [options]="priceTypeOptions()" formControlName="priceType"
                    optionLabel="label" optionValue="value" fluid appendTo="body"></p-select>
        </div>
        <div>
          <label class="label" for="ob-price">{{ 'onboarding.catalog.price' | translate }} *</label>
          <p-inputnumber inputId="ob-price" formControlName="price" mode="currency" [currency]="currency()"
                         [locale]="locale()" [min]="0" fluid></p-inputnumber>
        </div>
        <div>
          <label class="label" for="ob-category">{{ 'onboarding.catalog.category' | translate }} *</label>
          <input id="ob-category" pInputText formControlName="category" fluid
                 [placeholder]="'onboarding.catalog.categoryPlaceholder' | translate" />
          <div class="flex flex-wrap gap-1.5 mt-2">
            @for (s of categorySuggestions(); track s) {
              <button type="button" (click)="pickCategory(s)"
                      class="text-xs rounded-full border border-app-border px-2.5 py-0.5 text-app-text-secondary hover:bg-app-surface-hover">
                {{ s }}
              </button>
            }
          </div>
        </div>
        <div>
          <label class="label" for="ob-skill">{{ 'onboarding.catalog.skill' | translate }} *</label>
          <input id="ob-skill" pInputText formControlName="skill" fluid />
          <small class="text-app-text-tertiary">{{ 'onboarding.catalog.skillHint' | translate }}</small>
        </div>
        <div class="md:col-span-2">
          <label class="label" for="ob-duration">{{ 'onboarding.catalog.duration' | translate }} *</label>
          <p-inputnumber inputId="ob-duration" formControlName="duration" [min]="1" [useGrouping]="false" fluid></p-inputnumber>
          <small class="text-app-text-tertiary">{{ 'onboarding.catalog.durationHint' | translate }}</small>
        </div>
      </form>

      @if (created().length) {
        <p class="text-xs text-app-text-tertiary mt-3">{{ 'onboarding.catalog.addMoreHint' | translate }}</p>
      }
      @if (!hasService()) {
        <p class="text-xs text-app-warning mt-3">
          <i class="pi pi-info-circle mr-1" aria-hidden="true"></i>{{ 'onboarding.catalog.needsOne' | translate }}
        </p>
      }

      <div class="flex-1"></div>
      <app-onboarding-footer [label]="primaryLabel()" [loading]="saving()" [disabled]="filling() && form.invalid"
                             (back)="back.emit()" (primary)="primary()"></app-onboarding-footer>
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class OnboardingCatalogStepComponent implements OnInit {
  private fb = inject(FormBuilder);
  private categoryService = inject(ServiceCategoryService);
  private serviceService = inject(ServiceService);
  private skillService = inject(SkillService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  tenant = input.required<Tenant>();
  next = output<void>();
  back = output<void>();

  form = this.fb.group({
    name: ['', Validators.required],
    priceType: ['FIXED' as PriceType, Validators.required],
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    category: ['', Validators.required],
    skill: ['', Validators.required],
    duration: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  saving = signal(false);
  created = signal<CatalogService[]>([]);
  activeCount = signal(0);
  /** Serviço criado numa tentativa que falhou a meio (preço/habilidade/ativação) — a nova tentativa
   *  retoma dele em vez de criar um duplicado. */
  private partial: CatalogService | null = null;

  currency = computed(() => this.tenant().currency ?? 'BRL');
  locale = computed(() => this.tenant().locale ?? 'pt-BR');
  hasService = computed(() => this.activeCount() + this.created().length > 0);
  /** O dono começou a escrever um serviço novo — só então o formulário passa a ser exigido. */
  filling = computed(() => !!this.value().name?.trim());
  primaryLabel = computed(() =>
    this.filling() ? 'onboarding.saveAndContinue' : this.hasService() ? 'onboarding.continue' : 'onboarding.skipStep');
  priceTypeOptions = computed(() => PRICE_TYPES.map(value => ({
    value, label: this.translate.instant('catalog.services.priceType' + value),
  })));
  categorySuggestions = computed(() =>
    CATEGORY_SUGGESTIONS.map(key => this.translate.instant('onboarding.catalog.suggestion.' + key)));

  ngOnInit(): void {
    this.serviceService.list({ active: true, size: 1 }).subscribe({
      next: page => this.activeCount.set(page.page.totalElements),
      error: () => {},
    });
    // A habilidade acompanha a categoria enquanto o dono não a tocar.
    this.form.controls.category.valueChanges.subscribe(category => {
      if (this.form.controls.skill.pristine) this.form.controls.skill.setValue(category ?? '', { emitEvent: false });
    });
  }

  pickCategory(name: string): void {
    this.form.controls.category.setValue(name);
    this.form.controls.category.markAsDirty();
  }

  primary(): void {
    if (!this.filling()) {
      this.next.emit();
      return;
    }
    this.submit(() => this.next.emit());
  }

  submit(onDone?: () => void): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const name = v.name!.trim();
    const currency = this.currency();
    this.saving.set(true);

    forkJoin({
      categories: this.categoryService.list({ size: 200 }),
      skills: this.skillService.list(),
    }).pipe(
      switchMap(({ categories, skills }) => forkJoin({
        category: this.resolveCategory(categories.content, v.category!.trim()),
        skill: this.resolveSkill(skills, v.skill!.trim()),
      })),
      switchMap(({ category, skill }) => {
        const service$ = this.partial?.name === name
          ? of(this.partial)
          : this.serviceService.create({ categoryId: category.id, name, priceType: v.priceType! });
        return service$.pipe(
          switchMap(service => { this.partial = service; return this.serviceService.changePrice(service.id, v.price!, currency); }),
          switchMap(service => this.serviceService.changeTiming(service.id, null, v.duration!)),
          switchMap(service => this.serviceService.assignSkill(service.id, skill.id)),
          switchMap(service => this.serviceService.activate(service.id)),
        );
      }),
    ).subscribe({
      next: service => {
        this.partial = null;
        this.saving.set(false);
        this.created.update(list => [...list, service]);
        this.form.reset({ name: '', priceType: v.priceType, price: null, category: v.category, skill: v.skill, duration: v.duration });
        onDone?.();
      },
      error: err => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('onboarding.catalog.saveError'),
          detail: err?.error?.detail,
        });
      },
    });
  }

  private resolveCategory(existing: ServiceCategory[], name: string) {
    const found = existing.find(c => c.name.trim().toLowerCase() === name.toLowerCase());
    if (found) return found.active ? of(found) : this.categoryService.activate(found.id);
    const displayOrder = existing.reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;
    return this.categoryService.create({ name, displayOrder });
  }

  private resolveSkill(existing: Skill[], name: string) {
    const found = existing.find(s => s.name.trim().toLowerCase() === name.toLowerCase());
    if (found) return found.active ? of(found) : this.skillService.activate(found.id);
    return this.skillService.create(name);
  }
}
