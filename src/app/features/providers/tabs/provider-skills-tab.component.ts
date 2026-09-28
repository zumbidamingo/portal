import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChipModule } from 'primeng/chip';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { Provider, ProviderService } from '../../../core/services/provider.service';
import { Skill } from '../../../core/services/catalog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * Adicionar/remover habilidades do prestador — duas zonas de chip, sem formulário nem Dialog.
 * Nível de skill foi removido do produto: posse é tudo que a compatibilidade de atribuição olha.
 */
@Component({
  selector: 'app-provider-skills-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe, ChipModule, InputTextModule, EmptyStateComponent],
  template: `
    <div class="space-y-5 pt-3">
      @if (provider().skillIds.length === 0) {
        <p class="text-sm text-app-warning flex items-center gap-1.5">
          <i class="pi pi-exclamation-triangle"></i>{{ 'providers.noSkillsWarning' | translate }}
        </p>
      }

      <div>
        <h4 class="text-xs font-semibold text-app-text-secondary uppercase tracking-wide mb-2">
          {{ 'providers.skillsAssigned' | translate }}
        </h4>
        @if (assignedSkills().length === 0) {
          <p class="text-sm text-app-text-tertiary">{{ 'providers.noSkills' | translate }}</p>
        } @else {
          <div class="flex flex-wrap gap-2">
            @for (skill of assignedSkills(); track skill.id) {
              <p-chip [label]="skill.name" [removable]="canWrite() && !isPending(skill.id)"
                      [styleClass]="'bg-app-accent-soft! text-app-accent!' + (isPending(skill.id) ? ' opacity-50' : '')"
                      (onRemove)="remove(skill)"></p-chip>
            }
          </div>
        }
      </div>

      <div>
        <h4 class="text-xs font-semibold text-app-text-secondary uppercase tracking-wide mb-2">
          {{ 'providers.skillsAvailable' | translate }}
        </h4>
        @if (allSkills().length === 0) {
          <app-empty-state icon="pi pi-tags" [message]="'providers.noTenantSkills' | translate"
                            [subtitle]="'providers.noTenantSkillsSubtitle' | translate"></app-empty-state>
        } @else {
          @if (allSkills().length > 8) {
            <input pInputText fluid [ngModel]="search()" (ngModelChange)="search.set($event)"
                  [placeholder]="'providers.searchSkills' | translate" autocomplete="off" class="mb-2" />
          }
          @if (availableSkills().length === 0) {
            <p class="text-sm text-app-text-tertiary">{{ 'providers.noMatchingSkills' | translate }}</p>
          } @else {
            <div class="flex flex-wrap gap-2">
              @for (skill of availableSkills(); track skill.id) {
                <p-chip [label]="skill.name" [icon]="isPending(skill.id) ? 'pi pi-spin pi-spinner' : 'pi pi-plus'"
                        [styleClass]="canWrite() ? 'cursor-pointer' : 'opacity-60'"
                        (click)="add(skill)"></p-chip>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ProviderSkillsTabComponent {
  provider = input.required<Provider>();
  allSkills = input.required<Skill[]>();
  canWrite = input(false);
  providerUpdated = output<Provider>();

  private providerService = inject(ProviderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  search = signal('');
  private pendingIds = signal<ReadonlySet<string>>(new Set());

  assignedSkills = computed(() => {
    const ids = new Set(this.provider().skillIds);
    return this.allSkills().filter(s => ids.has(s.id));
  });

  availableSkills = computed(() => {
    const ids = new Set(this.provider().skillIds);
    const q = this.search().trim().toLowerCase();
    return this.allSkills()
      .filter(s => !ids.has(s.id))
      .filter(s => !q || s.name.toLowerCase().includes(q));
  });

  isPending(skillId: string): boolean {
    return this.pendingIds().has(skillId);
  }

  add(skill: Skill): void {
    if (!this.canWrite() || this.isPending(skill.id)) return;
    this.setPending(skill.id, true);
    this.providerService.assignSkill(this.provider().id, skill.id).subscribe({
      next: updated => {
        this.setPending(skill.id, false);
        this.providerUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.skillAdded', { skill: skill.name }) });
      },
      error: () => {
        this.setPending(skill.id, false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.skillSaveError') });
      },
    });
  }

  remove(skill: Skill): void {
    if (!this.canWrite() || this.isPending(skill.id)) return;
    this.setPending(skill.id, true);
    this.providerService.removeSkill(this.provider().id, skill.id).subscribe({
      next: updated => {
        this.setPending(skill.id, false);
        this.providerUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.skillRemoved', { skill: skill.name }) });
      },
      error: () => {
        this.setPending(skill.id, false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.skillSaveError') });
      },
    });
  }

  private setPending(id: string, value: boolean): void {
    this.pendingIds.update(current => {
      const next = new Set(current);
      value ? next.add(id) : next.delete(id);
      return next;
    });
  }
}
