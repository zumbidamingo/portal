import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { Skill, SkillService } from '../../../core/services/catalog.service';

/**
 * Cadastro rápido de habilidade, para fluxos que precisam de uma {@link Skill} imediatamente
 * (hoje: seleção de habilidades no cadastro de serviço) sem sair da tela em que estão. Mesmo
 * padrão de {@code CustomerQuickCreateComponent}: Drawer próprio, emite a entidade criada pro
 * chamador selecionar, sem navegar pra outra tela.
 */
@Component({
  selector: 'app-skill-quick-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, DrawerModule, InputTextModule],
  template: `
    <p-drawer [(visible)]="visible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[24rem]! md:w-[26rem]!" (onShow)="focusName()">
      <ng-template #header>
        <span class="font-semibold text-app-text">{{ 'skillQuickCreate.title' | translate }}</span>
      </ng-template>

      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4 pb-4">
        <p class="text-xs text-app-text-tertiary">{{ 'skillQuickCreate.hint' | translate }}</p>

        <div>
          <label class="label">{{ 'common.name' | translate }} *</label>
          <input pInputText formControlName="name" fluid #nameInput
                 [placeholder]="'catalog.skills.namePlaceholder' | translate" />
          @if (form.get('name')?.invalid && form.get('name')?.touched) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
          }
        </div>
      </form>

      <ng-template #footer>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="visible.set(false)"></p-button>
          <p-button [label]="'skillQuickCreate.save' | translate" icon="pi pi-check"
                    [loading]="saving()" [disabled]="form.invalid" (onClick)="save()"></p-button>
        </div>
      </ng-template>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class SkillQuickCreateComponent {
  private fb = inject(FormBuilder);
  private skillService = inject(SkillService);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);

  /** Visibilidade do diálogo — controlado pelo chamador via `[(visible)]`. */
  visible = model(false);

  /** Termo já digitado no filtro que originou o cadastro — pré-preenche o nome. */
  @Input() set prefill(value: string | null) {
    this.form.patchValue({ name: value ?? '' });
  }

  @Output() skillCreated = new EventEmitter<Skill>();

  @ViewChild('nameInput') private nameInputRef?: ElementRef<HTMLInputElement>;

  readonly saving = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
  });

  focusName(): void {
    queueMicrotask(() => this.nameInputRef?.nativeElement.focus());
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    this.skillService.create(v.name!).subscribe({
      next: skill => {
        this.saving.set(false);
        this.visible.set(false);
        this.form.reset({ name: '' });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.skills.saved') });
        this.skillCreated.emit(skill);
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err) });
      },
    });
  }

  private static readonly ERROR_CODE_KEY: Record<string, string> = {
    SKILL_NAME_ALREADY_EXISTS: 'catalog.skills.errors.SKILL_NAME_ALREADY_EXISTS',
  };

  private errorMessage(err: unknown): string {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = code ? SkillQuickCreateComponent.ERROR_CODE_KEY[code] : undefined;
    return this.translate.instant(key ?? 'catalog.skills.saveError');
  }
}
