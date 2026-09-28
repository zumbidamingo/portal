import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { LeadService, Lead, LeadInteraction, LeadPage, LeadStatus, LeadSource, LeadPayload, LeadInteractionType, SalesLossReason } from '../../core/services/lead.service';
import { TenantUserService, TenantDirectoryEntry } from '../../core/services/tenant-user.service';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PhoneComponent } from '../../shared/components/phone/phone.component';

import type { BadgeSeverity } from '../../shared/utils/status.utils';

interface StatusColumn {
  status: LeadStatus;
  labelKey: string;
  severity: BadgeSeverity;
  terminal: boolean;
}

const COLUMNS: StatusColumn[] = [
  { status: 'NEW', labelKey: 'leads.statusNEW', severity: 'info', terminal: false },
  { status: 'CONTACTED', labelKey: 'leads.statusCONTACTED', severity: 'warn', terminal: false },
  { status: 'QUALIFIED', labelKey: 'leads.statusQUALIFIED', severity: 'success', terminal: false },
  { status: 'LOST', labelKey: 'leads.statusLOST', severity: 'danger', terminal: true },
  { status: 'CONVERTED', labelKey: 'leads.statusCONVERTED', severity: 'secondary', terminal: true },
];

/** Tamanho do bloco buscado por vez (issue #219/G13) — o Kanban mostra o conjunto inteiro já
 *  carregado, não pagina por coluna; "carregar mais" busca o próximo bloco e acrescenta ao que
 *  já está na tela, guiado por {@code LeadPage.page.totalElements} (nunca um teto silencioso). */
const PAGE_SIZE = 200;

const MOVABLE_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED'];
const MOVABLE_SOURCES: LeadSource[] = ['WEBSITE', 'REFERRAL', 'PHONE', 'WHATSAPP', 'SOCIAL_MEDIA', 'WALK_IN', 'OTHER'];
const INTERACTION_TYPES: LeadInteractionType[] = ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE', 'OTHER'];
const LOSS_REASONS: SalesLossReason[] = ['PRICE', 'SCHEDULE', 'COMPETITOR', 'QUALITY_CONCERN', 'NO_RESPONSE', 'OTHER'];

const SOURCE_ICONS: Record<LeadSource, string> = {
  WEBSITE: 'pi-globe',
  REFERRAL: 'pi-users',
  PHONE: 'pi-phone',
  WHATSAPP: 'pi-whatsapp',
  SOCIAL_MEDIA: 'pi-share-alt',
  WALK_IN: 'pi-map-marker',
  OTHER: 'pi-ellipsis-h',
};

const INTERACTION_ICONS: Record<LeadInteractionType, string> = {
  CALL: 'pi-phone',
  EMAIL: 'pi-envelope',
  WHATSAPP: 'pi-whatsapp',
  MEETING: 'pi-users',
  NOTE: 'pi-file-edit',
  OTHER: 'pi-ellipsis-h',
};

@Component({
  selector: 'app-leads',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, DatePipe, ButtonModule,
    SelectModule, SelectButtonModule, InputTextModule, DatePickerModule, TextareaModule, DialogModule, DrawerModule,
    ConfirmDialogModule, TagBadgeComponent, PhoneComponent, TooltipModule, PageHeaderComponent, ProgressSpinnerModule],
  template: `
    <div class="space-y-4">
      <app-page-header [title]="'leads.title' | translate" [description]="'leads.subtitle' | translate">
        <p-button icon="pi pi-plus" [label]="'leads.add' | translate" (onClick)="openCreate()" size="small" />
      </app-page-header>

      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="leadSearch">{{ 'common.search' | translate }}</label>
          <input pInputText id="leadSearch" fluid [(ngModel)]="search"
                 [placeholder]="'leads.searchPlaceholder' | translate"
                 autocomplete="off"
                 (ngModelChange)="applyFilters()" />
        </div>
        <div class="w-44">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'leads.source' | translate }}</label>
          <p-select [options]="sourceOptions" [(ngModel)]="source" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'leads.allSources' | translate" (onChange)="applyFilters()"></p-select>
        </div>
        <div class="w-48">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'leads.assignedTo' | translate }}</label>
          <p-select [options]="assigneeOptions()" [(ngModel)]="assignedTo" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'leads.allAssignees' | translate" (onChange)="applyFilters()"></p-select>
        </div>
        <div class="w-64">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'leads.period' | translate }}</label>
          <p-datepicker [(ngModel)]="createdRange" selectionMode="range" [readonlyInput]="true"
                        appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                        [placeholder]="'leads.allPeriods' | translate" (onSelect)="applyFilters()"
                        (onClear)="applyFilters()"></p-datepicker>
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()"></p-button>
        }
      </div>

      <div class="relative grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        @if (loading()) {
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-app-bg/60 rounded-md">
            <p-progressSpinner styleClass="w-10 h-10" strokeWidth="4" />
          </div>
        }
        @for (col of columns; track col.status) {
          <div class="rounded-md border p-2 min-h-[400px] transition-colors duration-150 ease-out"
               [class.bg-app-surface]="!isDragOver(col.status)"
               [class.border-app-border]="!isDragOver(col.status)"
               [class.bg-app-accent-soft]="isDragOver(col.status)"
               [class.border-app-accent]="isDragOver(col.status)"
               (dragover)="onColumnDragOver($event, col.status)"
               (dragleave)="onColumnDragLeave($event)"
               (drop)="onDrop($event, col.status)">
            <div class="flex items-center justify-between mb-2 px-1">
              <span class="text-sm font-medium text-app-text">
                {{ col.labelKey | translate }} ({{ count(col.status) }})
              </span>
              <app-tag-badge [value]="('leads.status' + col.status) | translate" [severity]="col.severity"></app-tag-badge>
            </div>
            <div class="border-2 border-dashed rounded p-3 mb-2 text-center text-xs font-medium transition-colors duration-150 ease-out"
                 [class.border-app-border]="!isDragOver(col.status)"
                 [class.text-app-text-tertiary]="!isDragOver(col.status)"
                 [class.border-app-accent]="isDragOver(col.status)"
                 [class.text-app-text]="isDragOver(col.status)">
              {{ 'leads.dropHere' | translate }}
            </div>
            @for (lead of leadsByStatus(col.status); track lead.id) {
              <div class="bg-app-bg border border-app-border rounded-xl p-3.5 mb-2 cursor-pointer transition-opacity duration-150 ease-out"
                   [class.cursor-move]="!col.terminal"
                   [class.opacity-40]="isDragging(lead)"
                   [draggable]="!col.terminal"
                   (click)="openInteractions(lead, $event)"
                   (dragstart)="beginDrag($event, lead)"
                   (dragend)="dragEnd()">
                <p class="text-sm font-medium text-app-text truncate">{{ lead.name }}</p>
                @if (lead.email) {<p class="text-xs text-app-text-secondary truncate mt-0.5">{{ lead.email }}</p>}
                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-app-text-tertiary">
                  <span class="inline-flex items-center gap-1">
                    <i class="pi pi-calendar text-[10px]" aria-hidden="true"></i>
                    <span>{{ lead.createdAt | date:'short' }}</span>
                  </span>
                  @if (assigneeName(lead.assignedTo)) {
                    <span class="inline-flex items-center gap-1">
                      <i class="pi pi-user text-[10px]" aria-hidden="true"></i>
                      <span class="truncate">{{ assigneeName(lead.assignedTo) }}</span>
                    </span>
                  }
                </div>
                @if (lead.nextActionAt) {
                  <div class="mt-1.5 flex items-center gap-1 text-[11px]"
                       [class.text-app-danger]="isNextActionOverdue(lead)"
                       [class.text-app-text-tertiary]="!isNextActionOverdue(lead)">
                    <i class="pi pi-bell text-[10px]" aria-hidden="true"></i>
                    <span>{{ lead.nextActionAt | date:'short' }}</span>
                    @if (isNextActionOverdue(lead)) {
                      <app-tag-badge [value]="'leads.nextActionOverdue' | translate" severity="danger"></app-tag-badge>
                    }
                  </div>
                }
                <div class="mt-2 pt-1.5 border-t border-app-border flex items-center justify-end">
                  @if (!col.terminal) {
                    <button type="button" [attr.aria-label]="'common.edit' | translate"
                            [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                            (click)="openEdit(lead, $event)"
                            class="flex h-6 w-6 items-center justify-center rounded-md text-app-text-tertiary transition-colors duration-150 ease-out hover:bg-app-surface hover:text-app-text">
                      <i class="pi pi-pencil text-[11px]" aria-hidden="true"></i>
                    </button>
                  }
                  @if (col.status === 'LOST') {
                    <button type="button" [attr.aria-label]="'leads.reopen' | translate"
                            [pTooltip]="'leads.reopen' | translate" tooltipPosition="top"
                            (click)="openReopenDialog(lead, $event)"
                            class="flex h-6 w-6 items-center justify-center rounded-md text-app-text-tertiary transition-colors duration-150 ease-out hover:bg-app-surface hover:text-app-text">
                      <i class="pi pi-refresh text-[11px]" aria-hidden="true"></i>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      @if (!loading() && rows().length) {
        <div class="flex items-center justify-center gap-3">
          <span class="text-xs text-app-text-tertiary">
            {{ 'leads.loadedCount' | translate:{ shown: rows().length, total: totalElements() } }}
          </span>
          @if (hasMore()) {
            <p-button [label]="'leads.loadMore' | translate" [outlined]="true" size="small"
                      [loading]="loadingMore()" (onClick)="loadMore()"></p-button>
          }
        </div>
      } @else if (!loading() && !rows().length) {
        <p class="text-center text-sm text-app-text-tertiary">{{ 'leads.noLeads' | translate }}</p>
      }

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [closeOnEscape]="true"
                [style]="{ width: '42rem' }" [breakpoints]="{ '768px': '95vw' }"
                [header]="(editingLead() ? 'leads.editTitle' : 'leads.addTitle') | translate">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-5">
          <p class="text-xs text-app-text-tertiary">{{ 'leads.addHint' | translate }}</p>

          <section class="space-y-3">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.sectionIdentification' | translate }}</h4>
            <div>
              <label class="label">{{ 'leads.customerType' | translate }} *</label>
              <p-selectbutton [options]="customerTypeOptions" formControlName="customerType" optionLabel="label" optionValue="value"
                               [allowEmpty]="false"></p-selectbutton>
            </div>
            <div>
              <label class="label">{{ 'leads.name' | translate }} *</label>
              <input pInputText formControlName="name" fluid
                     [placeholder]="(form.get('customerType')?.value === 'COMPANY' ? 'leads.namePlaceholderCompany' : 'leads.namePlaceholderIndividual') | translate" />
              @if (form.get('name')?.invalid && form.get('name')?.touched) {
                <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
              }
            </div>
          </section>

          <section class="space-y-3 border-t border-app-border pt-4">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.sectionContact' | translate }}</h4>
            <div class="grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-3">
              <div>
                <label class="label">{{ 'leads.email' | translate }}</label>
                <input pInputText type="email" formControlName="email" fluid placeholder="email@exemplo.com" />
                @if (form.get('email')?.hasError('email') && form.get('email')?.touched) {
                  <small class="text-app-danger text-xs block mt-1">{{ 'errors.invalidEmail' | translate }}</small>
                }
              </div>
              <div>
                <app-phone formControlName="phone" label="leads.phone" defaultCountry="BR"></app-phone>
              </div>
            </div>
          </section>

          <section class="space-y-3 border-t border-app-border pt-4">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.sectionOrigin' | translate }}</h4>
            <div class="flex flex-wrap gap-1.5" role="radiogroup" [attr.aria-label]="'leads.source' | translate">
              @for (opt of sourceOptions; track opt.value) {
                <button type="button" role="radio" [attr.aria-checked]="form.get('source')?.value === opt.value"
                        class="inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-3 text-[13px] leading-none cursor-pointer whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                        [class.border-app-accent]="form.get('source')?.value === opt.value"
                        [class.bg-app-accent-soft]="form.get('source')?.value === opt.value"
                        [class.text-app-accent-hover]="form.get('source')?.value === opt.value"
                        [class.font-medium]="form.get('source')?.value === opt.value"
                        [class.border-app-border]="form.get('source')?.value !== opt.value"
                        [class.text-app-text-secondary]="form.get('source')?.value !== opt.value"
                        [class.hover:border-app-accent]="form.get('source')?.value !== opt.value"
                        [class.hover:text-app-text]="form.get('source')?.value !== opt.value"
                        (click)="selectSource(opt.value)">
                  <i [class]="'pi text-xs ' + (form.get('source')?.value === opt.value ? 'pi-check' : sourceIcon(opt.value))" aria-hidden="true"></i>
                  <span>{{ opt.label }}</span>
                </button>
              }
            </div>
          </section>

          <section class="space-y-3 border-t border-app-border pt-4">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.sectionAssignment' | translate }}</h4>
            <div>
              <label class="label">{{ 'leads.assignedTo' | translate }}</label>
              <p-select [options]="assigneeOptions()" formControlName="assignedTo"
                        optionLabel="label" optionValue="value"
                        appendTo="body" fluid [showClear]="true"
                        [placeholder]="'leads.assigneePlaceholder' | translate"
                        [loading]="assigning()"
                        (onChange)="onAssign($event.value)"></p-select>
              @if (editingLead()) {
                <small class="text-app-text-tertiary text-xs block mt-1">{{ 'leads.assignHint' | translate }}</small>
              }
            </div>
          </section>
        </form>

        <ng-template #footer>
          <div class="flex justify-between items-center gap-2">
            <div class="flex gap-2">
              @if (canMarkLost()) {
                <p-button type="button" [label]="'leads.markLost' | translate" severity="danger" [text]="true" size="small"
                          (onClick)="openLostDialog(editingLead()!)"></p-button>
              }
              @if (editingLead()) {
                <p-button type="button" [label]="'common.delete' | translate" severity="danger" [text]="true" size="small"
                          (onClick)="confirmDeleteLead(editingLead()!)"></p-button>
              }
            </div>
            <div class="flex gap-2">
              <p-button type="button" [label]="'common.close' | translate" [outlined]="true"
                        (onClick)="dialogVisible.set(false)"></p-button>
              <p-button type="button" [label]="'common.save' | translate" icon="pi pi-check"
                        [loading]="saving()" [disabled]="form.invalid" (onClick)="save()"></p-button>
            </div>
          </div>
        </ng-template>
      </p-dialog>

      <p-drawer [(visible)]="interactionsDrawerVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
                styleClass="w-full! sm:w-[28rem]! md:w-[32rem]!">
        <ng-template #header>
          @if (interactionsLead(); as lead) {
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-app-text truncate">{{ lead.name }}</span>
              <app-tag-badge [value]="('leads.status' + lead.status) | translate" [severity]="statusSeverity(lead.status)"></app-tag-badge>
            </div>
          }
        </ng-template>

        @if (interactionsLead(); as lead) {
        <div [formGroup]="form" class="space-y-5 pb-4">
          <section class="space-y-3">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-text-secondary">
              <span class="inline-flex items-center gap-1.5">
                <i class="pi text-[11px] {{ sourceIcon(lead.source) }}" aria-hidden="true"></i>
                {{ ('leads.source' + lead.source) | translate }}
              </span>
              <span class="text-app-text-tertiary">{{ 'leads.createdOn' | translate:{ date: (lead.createdAt | date:'dd/MM/yyyy') } }}</span>
            </div>

            @if (lead.phone) {
              <div class="flex items-center justify-between gap-2 rounded-md border border-app-border bg-app-bg px-3 py-2">
                <span class="inline-flex items-center gap-2 min-w-0 text-sm text-app-text">
                  <i class="pi pi-phone text-app-text-tertiary" aria-hidden="true"></i>
                  <span class="truncate">{{ formatPhone(lead.phone) }}</span>
                </span>
                <span class="flex items-center gap-0.5 shrink-0">
                  <a [href]="'tel:' + lead.phone" [pTooltip]="'leads.call' | translate" tooltipPosition="top"
                     [attr.aria-label]="'leads.call' | translate" class="quick-action"><i class="pi pi-phone text-xs"></i></a>
                  <a [href]="whatsappUrl(lead.phone)" target="_blank" rel="noopener noreferrer"
                     [pTooltip]="'leads.sendWhatsApp' | translate" tooltipPosition="top"
                     [attr.aria-label]="'leads.sendWhatsApp' | translate" class="quick-action"><i class="pi pi-whatsapp text-xs"></i></a>
                  <button type="button" [pTooltip]="'common.copy' | translate" tooltipPosition="top"
                          [attr.aria-label]="'common.copy' | translate" class="quick-action" (click)="copy(lead.phone)"><i class="pi pi-copy text-xs"></i></button>
                </span>
              </div>
            }
            @if (lead.email) {
              <div class="flex items-center justify-between gap-2 rounded-md border border-app-border bg-app-bg px-3 py-2">
                <span class="inline-flex items-center gap-2 min-w-0 text-sm text-app-text">
                  <i class="pi pi-envelope text-app-text-tertiary" aria-hidden="true"></i>
                  <span class="truncate">{{ lead.email }}</span>
                </span>
                <span class="flex items-center gap-0.5 shrink-0">
                  <a [href]="'mailto:' + lead.email" [pTooltip]="'leads.sendEmail' | translate" tooltipPosition="top"
                     [attr.aria-label]="'leads.sendEmail' | translate" class="quick-action"><i class="pi pi-send text-xs"></i></a>
                  <button type="button" [pTooltip]="'common.copy' | translate" tooltipPosition="top"
                          [attr.aria-label]="'common.copy' | translate" class="quick-action" (click)="copy(lead.email)"><i class="pi pi-copy text-xs"></i></button>
                </span>
              </div>
            }

            <div>
              <label class="label">{{ 'leads.assignedTo' | translate }}</label>
              <p-select [options]="assigneeOptions()" [ngModel]="lead.assignedTo" [ngModelOptions]="{ standalone: true }"
                        optionLabel="label" optionValue="value" appendTo="body" fluid [showClear]="true"
                        [disabled]="!interactionsAddable()" [loading]="assigning()"
                        [placeholder]="'leads.assigneePlaceholder' | translate"
                        (onChange)="onAssignFromDrawer($event.value)"></p-select>
            </div>
          </section>

          @if (interactionsAddable()) {
            <section class="space-y-3 border-t border-app-border pt-4">
              <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.sectionNextAction' | translate }}</h4>
              @if (lead.nextActionAt) {
                <div class="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs"
                     [class.bg-app-danger-bg]="isNextActionOverdue(lead)"
                     [class.text-app-danger]="isNextActionOverdue(lead)"
                     [class.bg-app-surface]="!isNextActionOverdue(lead)"
                     [class.text-app-text-secondary]="!isNextActionOverdue(lead)">
                  <span class="inline-flex items-center gap-1.5">
                    <i class="pi pi-bell text-[11px]" aria-hidden="true"></i>
                    <span class="font-medium">{{ (isNextActionOverdue(lead) ? 'leads.nextActionOverdue' : 'leads.nextActionScheduled') | translate }}</span>
                    <span>{{ lead.nextActionAt | date:'dd/MM/yyyy HH:mm' }}</span>
                  </span>
                  <p-button [label]="'leads.completeNextAction' | translate" icon="pi pi-check" size="small" [text]="true"
                            [loading]="settingNextAction()" (onClick)="completeNextAction()"></p-button>
                </div>
              }
              <div class="grid grid-cols-1 gap-3">
                <div>
                  <label class="label">{{ 'leads.nextActionAtLabel' | translate }}</label>
                  <p-datepicker #nextActionPicker formControlName="nextActionAt" [showTime]="true" [showIcon]="true"
                                appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                                [hideOnDateTimeSelect]="false" hourFormat="24" [showButtonBar]="true" (onClose)="onSetNextAction()" (onClear)="onSetNextAction()">
                    <ng-template #buttonbar let-clearCallback="clearCallback">
                      <div class="flex justify-between w-full gap-2">
                        <p-button [label]="'common.clear' | translate" size="small" [text]="true" severity="secondary"
                                  (onClick)="clearCallback($event)" />
                        <p-button [label]="'common.confirm' | translate" size="small" (onClick)="nextActionPicker.toggle()" />
                      </div>
                    </ng-template>
                  </p-datepicker>
                </div>
                <div>
                  <label class="label">{{ 'leads.nextActionNoteLabel' | translate }}</label>
                  <input pInputText formControlName="nextActionNote" fluid (blur)="onNextActionNoteBlur()"
                         [placeholder]="'leads.nextActionNotePlaceholder' | translate" />
                </div>
              </div>
              <small class="text-app-text-tertiary text-xs block">{{ 'leads.nextActionHint' | translate }}</small>
            </section>

            <section class="space-y-3 border-t border-app-border pt-4">
              <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.addInteraction' | translate }}</h4>
              <div class="flex flex-col items-start gap-2">
                <p-selectbutton [options]="interactionTypeOptions" formControlName="interactionType"
                                 optionLabel="label" optionValue="value" [allowEmpty]="false" class="shrink-0" fluid>
                  <ng-template #item let-item>
                    <i class="pi {{ item.icon }}" [pTooltip]="item.label" tooltipPosition="top" aria-hidden="true"></i>
                  </ng-template>
                </p-selectbutton>
                <textarea pTextarea fluid formControlName="interactionNote" rows="3" class="w-full"
                          [placeholder]="'leads.interactionNotePlaceholder' | translate" style="resize: none"></textarea>
              </div>
              <div class="flex justify-end">
                <p-button type="button" icon="pi pi-plus" [label]="'leads.addInteraction' | translate" size="small"
                          [loading]="addingInteraction()" [disabled]="!canAddInteraction()"
                          (onClick)="onAddInteraction()"></p-button>
              </div>
            </section>
          }

          <section class="space-y-3 border-t border-app-border pt-4">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'leads.sectionHistory' | translate }}</h4>
            @if (interactionGroups().length) {
              <div class="space-y-4">
                @for (group of interactionGroups(); track group.key) {
                  <div>
                    <div class="mb-2 text-[11px] font-medium text-app-text-tertiary">
                      @if (group.rel) { {{ ('leads.' + group.rel) | translate }} } @else { {{ group.date | date:'dd/MM/yyyy' }} }
                    </div>
                    <ol class="relative ml-3 space-y-3 border-l border-app-border">
                      @for (interaction of group.items; track interaction.id) {
                        <li class="relative pl-5">
                          <span class="absolute -left-3 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-text-secondary">
                            <i class="pi {{ interactionIcon(interaction.type) }} text-[11px]" aria-hidden="true"></i>
                          </span>
                          <div class="flex items-center justify-between gap-2">
                            <span class="text-xs font-semibold text-app-text">{{ 'leads.interaction' + interaction.type | translate }}</span>
                            <span class="text-[11px] text-app-text-tertiary whitespace-nowrap">{{ interaction.occurredAt | date:'HH:mm' }}</span>
                          </div>
                          @if (interaction.note) {
                            <p class="mt-1 text-xs text-app-text-secondary whitespace-pre-line">{{ interaction.note }}</p>
                          }
                          @if (authorName(interaction.createdBy)) {
                            <div class="mt-1 text-[11px] text-app-text-tertiary">{{ authorName(interaction.createdBy) }}</div>
                          }
                        </li>
                      }
                    </ol>
                  </div>
                }
              </div>
            } @else {
              <p class="text-xs text-app-text-tertiary">{{ 'leads.noInteractions' | translate }}</p>
            }
          </section>
        </div>
        }

        <ng-template #footer>
          @if (interactionsLead(); as lead) {
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1">
                <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small"
                          [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                          [attr.aria-label]="'common.delete' | translate" (onClick)="confirmDeleteLead(lead)"></p-button>
                @if (interactionsAddable()) {
                  <p-button [label]="'leads.markLost' | translate" severity="danger" [text]="true" size="small"
                            (onClick)="openLostDialog(lead)"></p-button>
                }
                @if (lead.status === 'LOST') {
                  <p-button [label]="'leads.reopen' | translate" icon="pi pi-refresh" severity="secondary" [text]="true" size="small"
                            (onClick)="openReopenDialog(lead)"></p-button>
                }
              </div>
              <div class="flex items-center gap-2">
                @if (interactionsAddable()) {
                  <p-button [label]="'common.edit' | translate" icon="pi pi-pencil" [outlined]="true" size="small"
                            (onClick)="openEdit(lead)"></p-button>
                  <p-button [label]="'leads.convertToCustomer' | translate" icon="pi pi-user-plus" size="small"
                            [loading]="converting()" (onClick)="convertLead(lead)"></p-button>
                }
              </div>
            </div>
          }
        </ng-template>
      </p-drawer>

      <p-dialog [(visible)]="lostDialogVisible" [modal]="true" [style]="{ width: '26rem' }"
                [header]="'leads.markLostTitle' | translate">
        <form [formGroup]="lostForm" (ngSubmit)="confirmMarkLost()" class="space-y-3">
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'leads.lostReasonLabel' | translate }}</label>
            <p-select [options]="lossReasonOptions" formControlName="lostReasonCode" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'leads.lostReasonCodePlaceholder' | translate"></p-select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'leads.lostReasonDetailLabel' | translate }}</label>
            <textarea class="w-full rounded border border-app-border p-2 text-sm" rows="3"
                      [placeholder]="'leads.lostReasonDetailPlaceholder' | translate"
                      formControlName="reason"></textarea>
          </div>
          <div class="flex justify-end gap-2">
            <p-button type="button" [label]="'common.close' | translate" [outlined]="true"
                      (onClick)="lostDialogVisible.set(false)"></p-button>
            <p-button type="submit" [label]="'leads.markLost' | translate" severity="danger"
                      [loading]="markingLost()" [disabled]="!lostFormHasReason()"></p-button>
          </div>
        </form>
      </p-dialog>

      <p-dialog [(visible)]="reopenDialogVisible" [modal]="true" [style]="{ width: '26rem' }"
                [header]="'leads.reopenTitle' | translate">
        <form [formGroup]="reopenForm" (ngSubmit)="confirmReopen()" class="space-y-3">
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'leads.reopenReasonLabel' | translate }} *</label>
            <textarea class="w-full rounded border border-app-border p-2 text-sm" rows="3"
                      formControlName="reason"></textarea>
          </div>
          <div class="flex justify-end gap-2">
            <p-button type="button" [label]="'common.close' | translate" [outlined]="true"
                      (onClick)="reopenDialogVisible.set(false)"></p-button>
            <p-button type="submit" [label]="'leads.reopen' | translate"
                      [loading]="reopening()" [disabled]="reopenForm.invalid"></p-button>
          </div>
        </form>
      </p-dialog>

      <p-confirmDialog></p-confirmDialog>
    </div>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
    .quick-action { @apply flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-app-text-tertiary transition-colors duration-150 ease-out hover:bg-app-surface hover:text-app-text; }
  `],
})
export class LeadsComponent {
  private fb = inject(FormBuilder);
  private leadService = inject(LeadService);
  private route = inject(ActivatedRoute);
  private tenantUserService = inject(TenantUserService);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);

  readonly columns = COLUMNS;
  readonly sourceOptions = MOVABLE_SOURCES.map(source => ({
    label: this.translate.instant(`leads.source${source}`),
    value: source,
  }));
  readonly customerTypeOptions = [
    { label: this.translate.instant('leads.typeINDIVIDUAL'), value: 'INDIVIDUAL' },
    { label: this.translate.instant('leads.typeCOMPANY'), value: 'COMPANY' },
  ];
  readonly interactionTypeOptions = INTERACTION_TYPES.map(type => ({
    label: this.translate.instant(`leads.interaction${type}`),
    value: type,
    icon: INTERACTION_ICONS[type],
  }));
  readonly lossReasonOptions = LOSS_REASONS.map(reason => ({
    label: this.translate.instant(`leads.lossReason${reason}`),
    value: reason,
  }));

  readonly tenantUsers = signal<TenantDirectoryEntry[]>([]);
  /** Apenas administrativos ativos — espelha a regra do assignee no backend (CLAUDE.md §6). */
  readonly assigneeOptions = computed(() => this.tenantUsers()
    .filter(u => u.active && u.quotaGroup === 'ADMINISTRATIVE')
    .map(u => ({ label: u.name, value: u.id })));

  search = '';
  source: LeadSource | null = null;
  assignedTo: string | null = null;
  createdRange: Date[] | null = null;
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly rows = signal<Lead[]>([]);
  readonly totalElements = signal(0);
  private currentPage = 0;
  readonly hasMore = computed(() => this.rows().length < this.totalElements());
  readonly saving = signal(false);
  dialogVisible = signal(false);
  editingLead = signal<Lead | null>(null);
  interactionsDrawerVisible = signal(false);
  interactionsLead = signal<Lead | null>(null);
  private draggedLead = signal<Lead | null>(null);
  private dragOverStatus = signal<LeadStatus | null>(null);
  private filterChange$ = new Subject<void>();

  readonly assigning = signal(false);
  readonly settingNextAction = signal(false);
  readonly addingInteraction = signal(false);
  readonly interactions = computed(() => this.interactionsLead()?.interactions ?? []);
  readonly interactionsAddable = computed(() => {
    const lead = this.interactionsLead();
    return !!lead && MOVABLE_STATUSES.includes(lead.status);
  });

  readonly converting = signal(false);
  readonly interactionGroups = computed(() => {
    const items = [...this.interactions()]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const day = 86_400_000;
    const groups: { key: number; date: Date; rel: 'today' | 'yesterday' | null; items: LeadInteraction[] }[] = [];
    for (const it of items) {
      const date = new Date(it.occurredAt);
      const key = startOfDay(date);
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, date, rel: key === today ? 'today' : key === today - day ? 'yesterday' : null, items: [] };
        groups.push(group);
      }
      group.items.push(it);
    }
    return groups;
  });

  lostDialogVisible = signal(false);
  lostLead = signal<Lead | null>(null);
  lostForm = this.fb.group({ reason: [''], lostReasonCode: [null as SalesLossReason | null] });
  readonly markingLost = signal(false);

  reopenDialogVisible = signal(false);
  reopenLead = signal<Lead | null>(null);
  reopenForm = this.fb.group({ reason: ['', Validators.required] });
  readonly reopening = signal(false);

  form = this.fb.group({
    customerType: ['INDIVIDUAL' as 'INDIVIDUAL' | 'COMPANY', Validators.required],
    name: ['', Validators.required],
    email: ['', Validators.email],
    phone: [''],
    source: ['WEBSITE' as LeadSource, Validators.required],
    assignedTo: [null as string | null],
    nextActionAt: [null as Date | null],
    nextActionNote: [''],
    interactionType: ['CALL' as LeadInteractionType],
    interactionNote: [''],
  });

  ngOnInit(): void {
    this.wireFilters();
    this.loadLeads();
    // Vindo de uma notificação: `?open=<id>` abre o lead, em vez de largar o utilizador na lista.
    const openId = this.route.snapshot.queryParamMap.get('open');
    if (openId) {
      this.leadService.get(openId).subscribe({
        next: lead => this.openInteractions(lead, new MouseEvent('click')),
        error: () => undefined,
      });
    }
    this.tenantUserService.directory().subscribe(users => this.tenantUsers.set(users ?? []));
  }

  /** Busca/origem/responsável/período disparam aqui; debounce+distinctUntilChanged evitam
   *  requests supérfluos, switchMap cancela a busca anterior quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => this.loading.set(true)),
      switchMap(() => this.fetchLeads$(0).pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('leads.loadError') });
          return of(null);
        }),
      )),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) {
        this.currentPage = 0;
        this.rows.set(result.content);
        this.totalElements.set(result.page.totalElements);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private filterKey(): string {
    const [from, to] = this.createdRange ?? [null, null];
    return [
      this.search.trim(), this.source ?? '', this.assignedTo ?? '',
      from ? this.toIsoDate(from) : '', to ? this.toIsoDate(to) : '',
    ].join('|');
  }

  private fetchLeads$(page: number): Observable<LeadPage> {
    const [from, to] = this.createdRange ?? [null, null];
    return this.leadService.list({
      search: this.search || undefined,
      source: this.source ?? undefined,
      assignedTo: this.assignedTo ?? undefined,
      createdFrom: from ? this.toIsoDate(from) : undefined,
      createdTo: to ? this.toIsoDate(to) : undefined,
      page, size: PAGE_SIZE, sort: 'createdAt,desc',
    });
  }

  loadLeads(): void {
    this.loading.set(true);
    this.currentPage = 0;
    this.fetchLeads$(0).subscribe({
      next: (res) => {
        this.rows.set(res.content);
        this.totalElements.set(res.page.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('leads.loadError') });
      },
    });
  }

  /** Kanban não pagina por coluna — "carregar mais" acrescenta o próximo bloco ao conjunto
   *  inteiro já carregado (issue #219/G13): sem isto, um tenant com mais leads do que o
   *  tamanho de página nunca via os mais antigos, sem aviso de que faltavam. */
  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.fetchLeads$(this.currentPage + 1).subscribe({
      next: (res) => {
        this.loadingMore.set(false);
        this.currentPage += 1;
        this.rows.set([...this.rows(), ...res.content]);
        this.totalElements.set(res.page.totalElements);
      },
      error: () => {
        this.loadingMore.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('leads.loadError') });
      },
    });
  }

  /** Disparado a cada tecla/seleção — alimenta o pipeline reativo em {@link wireFilters}. */
  applyFilters(): void { this.filterChange$.next(); }

  hasActiveFilters(): boolean {
    return !!this.search.trim() || this.source !== null || this.assignedTo !== null || !!this.createdRange;
  }

  clearFilters(): void {
    this.search = '';
    this.source = null;
    this.assignedTo = null;
    this.createdRange = null;
    this.applyFilters();
  }

  leadsByStatus(status: LeadStatus): Lead[] {
    return this.rows().filter(l => l.status === status);
  }

  count(status: LeadStatus): number {
    return this.leadsByStatus(status).length;
  }

  beginDrag(event: DragEvent, lead: Lead): void {
    this.draggedLead.set(lead);
    event.dataTransfer?.setData('text/plain', lead.id);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  isDragging(lead: Lead): boolean {
    return this.draggedLead()?.id === lead.id;
  }

  isDragOver(status: LeadStatus): boolean {
    return this.dragOverStatus() === status;
  }

  onColumnDragOver(event: DragEvent, status: LeadStatus): void {
    this.allowDrop(event);
    if (this.dragOverStatus() !== status) this.dragOverStatus.set(status);
  }

  onColumnDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    const current = event.currentTarget as Node;
    if (!related || !current.contains(related)) {
      this.dragOverStatus.set(null);
    }
  }

  dragEnd(): void {
    this.draggedLead.set(null);
    this.dragOverStatus.set(null);
  }

  onDrop(event: DragEvent, target: LeadStatus): void {
    event.preventDefault();
    const lead = this.draggedLead();
    this.draggedLead.set(null);
    if (!lead || lead.status === target) return;
    if (target === 'LOST') {
      this.openLostDialog(lead);
      return;
    }
    if (target === 'CONVERTED') {
      this.convertLead(lead);
      return;
    }
    if (!MOVABLE_STATUSES.includes(target)) return;
    this.leadService.changeStatus(lead.id, { status: target }).subscribe({
      next: (updated) => this.rows.set(this.rows().map(l => l.id === lead.id ? updated : l)),
      error: (err: HttpErrorResponse) => this.messageService.add({
        severity: 'error',
        summary: this.businessError(err, 'leads.errors', 'leads.moveError'),
      }),
    });
  }

  convertLead(lead: Lead): void {
    this.converting.set(true);
    this.leadService.convert(lead.id, {}).subscribe({
      next: (result) => {
        this.converting.set(false);
        this.syncLead(result.lead);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(result.reusedExistingCustomer ? 'leads.convertedReused' : 'leads.converted'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.converting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.businessError(err, 'leads.errors', 'leads.convertError'),
        });
      },
    });
  }

  openEdit(lead: Lead, event?: Event): void {
    event?.stopPropagation();
    this.editingLead.set(lead);
    this.form.patchValue({
      customerType: lead.customerType, name: lead.name, email: lead.email ?? '',
      phone: lead.phone ?? '', source: lead.source,
      assignedTo: lead.assignedTo ?? null,
    });
    this.dialogVisible.set(true);
  }

  openInteractions(lead: Lead, event: MouseEvent): void {
    event.stopPropagation();
    this.interactionsLead.set(lead);
    this.patchDetailForm(lead);
    this.interactionsDrawerVisible.set(true);
    this.leadService.get(lead.id).subscribe({
      next: (fresh) => {
        this.interactionsLead.set(fresh);
        this.patchDetailForm(fresh);
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('leads.loadError') }),
    });
  }

  statusSeverity(status: LeadStatus): BadgeSeverity {
    return COLUMNS.find(c => c.status === status)?.severity ?? 'secondary';
  }

  interactionIcon(type: LeadInteractionType): string {
    return INTERACTION_ICONS[type];
  }

  formatPhone(phone: string): string {
    return parsePhoneNumberFromString(phone)?.formatInternational() ?? phone;
  }

  /** Telefones antigos foram guardados sem indicativo; sem `+`, assume Brasil (operação só BR — §7A). */
  whatsappUrl(phone: string): string {
    const parsed = parsePhoneNumberFromString(phone);
    let digits = parsed ? parsed.number.replace('+', '') : phone.replace(/\D/g, '');
    if (!parsed && digits.length <= 11) digits = `55${digits}`;
    return `https://wa.me/${digits}`;
  }

  copy(value: string): void {
    navigator.clipboard?.writeText(value).then(
      () => this.messageService.add({ severity: 'success', summary: this.translate.instant('common.copied'), life: 1500 }),
      () => undefined,
    );
  }

  /** Atualiza o lead no quadro e, se o drawer o estiver a mostrar, também lá. */
  private syncLead(updated: Lead): void {
    this.rows.set(this.rows().map(l => l.id === updated.id ? updated : l));
    if (this.interactionsLead()?.id === updated.id) this.interactionsLead.set(updated);
  }

  completeNextAction(): void {
    this.form.patchValue({ nextActionAt: null, nextActionNote: '' }, { emitEvent: false });
    this.onSetNextAction();
  }

  private patchDetailForm(lead: Lead): void {
    this.form.patchValue({
      interactionType: 'CALL', interactionNote: '',
      nextActionAt: lead.nextActionAt ? new Date(lead.nextActionAt) : null,
      nextActionNote: lead.nextActionNote ?? '',
    }, { emitEvent: false });
  }

  openCreate(): void {
    this.editingLead.set(null);
    this.form.reset({
      customerType: 'INDIVIDUAL', name: '', email: '', phone: '', source: 'WEBSITE',
      assignedTo: null, nextActionAt: null, nextActionNote: '',
      interactionType: 'CALL', interactionNote: '',
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = {
      customerType: this.form.value.customerType ?? 'INDIVIDUAL',
      name: this.form.value.name!,
      email: this.form.value.email ?? undefined,
      phone: this.form.value.phone ?? undefined,
      source: this.form.value.source ?? 'WEBSITE',
      assignedTo: this.form.value.assignedTo ?? undefined,
    };
    const isEdit = !!this.editingLead();
    const obs$ = this.editingLead()
      ? this.leadService.update(this.editingLead()!.id, v)
      : this.leadService.create(v);
    obs$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(isEdit ? 'leads.updated' : 'leads.created'),
        });
        void this.loadLeads();
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('leads.saveError') });
      },
    });
  }

  canMarkLost(): boolean {
    const lead = this.editingLead();
    return !!lead && MOVABLE_STATUSES.includes(lead.status);
  }

  assigneeName(id: string | null): string {
    if (!id) return '';
    return this.tenantUsers().find(u => u.id === id)?.name ?? '';
  }

  authorName(id: string | null): string {
    if (!id) return '';
    return this.tenantUsers().find(u => u.id === id)?.name ?? '';
  }

  /** Na criação apenas regista a seleção (vai no create payload); na edição atribui já. */
  onAssign(value: string | null): void {
    const lead = this.editingLead();
    if (!lead) return;
    this.assigning.set(true);
    this.leadService.assign(lead.id, value).subscribe({
      next: (updated) => {
        this.assigning.set(false);
        this.editingLead.set(updated);
        this.form.patchValue({ assignedTo: updated.assignedTo ?? null });
        this.rows.set(this.rows().map(l => l.id === updated.id ? updated : l));
        if (this.interactionsLead()?.id === updated.id) this.interactionsLead.set(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.assigneeUpdated') });
      },
      error: (err: HttpErrorResponse) => {
        this.assigning.set(false);
        this.form.patchValue({ assignedTo: lead.assignedTo ?? null });
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.assignError') });
      },
    });
  }

  onAssignFromDrawer(value: string | null): void {
    const lead = this.interactionsLead();
    if (!lead) return;
    this.assigning.set(true);
    this.leadService.assign(lead.id, value).subscribe({
      next: (updated) => {
        this.assigning.set(false);
        this.syncLead(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.assigneeUpdated') });
      },
      error: (err: HttpErrorResponse) => {
        this.assigning.set(false);
        this.interactionsLead.set({ ...lead });
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.assignError') });
      },
    });
  }

  isNextActionOverdue(lead: Lead): boolean {
    return !!lead.nextActionAt && new Date(lead.nextActionAt).getTime() < Date.now();
  }

  /** A nota só se grava com data definida e alterada — blur sem mudança não deve chamar a API. */
  onNextActionNoteBlur(): void {
    const lead = this.interactionsLead();
    if (!lead || !this.form.value.nextActionAt) return;
    if ((this.form.value.nextActionNote ?? '').trim() === (lead.nextActionNote ?? '')) return;
    this.onSetNextAction();
  }

  /** Igual a {@link onAssign}: aplica-se de imediato, não faz parte do submit principal do formulário. */
  onSetNextAction(): void {
    const lead = this.interactionsLead();
    if (!lead) return;
    const nextActionAtValue = this.form.value.nextActionAt as Date | null;
    const nextActionNote = (this.form.value.nextActionNote ?? '').trim();
    const sameDate = (nextActionAtValue?.getTime() ?? null) === (lead.nextActionAt ? new Date(lead.nextActionAt).getTime() : null);
    if (sameDate && (!nextActionAtValue || nextActionNote === (lead.nextActionNote ?? ''))) return;
    this.settingNextAction.set(true);
    this.leadService.setNextAction(lead.id, {
      nextActionAt: nextActionAtValue ? nextActionAtValue.toISOString() : null,
      nextActionNote: nextActionAtValue ? (nextActionNote || undefined) : undefined,
    }).subscribe({
      next: (updated) => {
        this.settingNextAction.set(false);
        this.syncLead(updated);
        this.form.patchValue({
          nextActionAt: updated.nextActionAt ? new Date(updated.nextActionAt) : null,
          nextActionNote: updated.nextActionNote ?? '',
        }, { emitEvent: false });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.nextActionUpdated') });
      },
      error: (err: HttpErrorResponse) => {
        this.settingNextAction.set(false);
        this.form.patchValue({
          nextActionAt: lead.nextActionAt ? new Date(lead.nextActionAt) : null,
          nextActionNote: lead.nextActionNote ?? '',
        }, { emitEvent: false });
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.nextActionError') });
      },
    });
  }

  canAddInteraction(): boolean {
    const type = this.form.value.interactionType;
    const note = this.form.value.interactionNote ?? '';
    return type !== 'NOTE' || note.trim().length > 0;
  }

  onAddInteraction(): void {
    const lead = this.interactionsLead();
    const type = this.form.value.interactionType ?? 'CALL';
    const note = (this.form.value.interactionNote ?? '').trim();
    if (!lead || !this.canAddInteraction()) return;
    this.addingInteraction.set(true);
    this.leadService.addInteraction(lead.id, {
      type,
      note: note || undefined,
    }).subscribe({
      next: (updated) => {
        this.addingInteraction.set(false);
        this.interactionsLead.set(updated);
        this.rows.set(this.rows().map(l => l.id === updated.id ? updated : l));
        this.form.patchValue({ interactionType: 'CALL', interactionNote: '' });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.interactionAdded') });
      },
      error: (err: HttpErrorResponse) => {
        this.addingInteraction.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.interactionError') });
      },
    });
  }

  selectSource(source: LeadSource): void {
    this.form.get('source')?.setValue(source);
    this.form.get('source')?.markAsDirty();
  }

  sourceIcon(source: LeadSource): string {
    return SOURCE_ICONS[source];
  }

  openLostDialog(lead: Lead): void {
    this.lostLead.set(lead);
    this.lostForm.reset({ reason: '', lostReasonCode: null });
    this.dialogVisible.set(false);
    this.lostDialogVisible.set(true);
  }

  /** Pelo menos um dos dois — o motivo em texto livre ou o código estável (issue #221) — é
   *  exigido; a validação de facto é do domínio, isto só evita a chamada óbvia de ir dar erro. */
  lostFormHasReason(): boolean {
    return !!(this.lostForm.value.reason ?? '').trim() || !!this.lostForm.value.lostReasonCode;
  }

  confirmMarkLost(): void {
    const lead = this.lostLead();
    const reason = (this.lostForm.value.reason ?? '').trim();
    const lostReasonCode = this.lostForm.value.lostReasonCode ?? null;
    if (!lead || !this.lostFormHasReason()) return;
    this.markingLost.set(true);
    this.leadService.markLost(lead.id, { reason: reason || undefined, lostReasonCode }).subscribe({
      next: (updated) => {
        this.markingLost.set(false);
        this.lostDialogVisible.set(false);
        this.syncLead(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.markedLost') });
      },
      error: (err: HttpErrorResponse) => {
        this.markingLost.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.moveError') });
      },
    });
  }

  openReopenDialog(lead: Lead, event?: Event): void {
    event?.stopPropagation();
    this.reopenLead.set(lead);
    this.reopenForm.reset({ reason: '' });
    this.reopenDialogVisible.set(true);
  }

  confirmReopen(): void {
    const lead = this.reopenLead();
    const reason = (this.reopenForm.value.reason ?? '').trim();
    if (!lead || this.reopenForm.invalid) return;
    this.reopening.set(true);
    this.leadService.reopen(lead.id, { reason }).subscribe({
      next: (updated) => {
        this.reopening.set(false);
        this.reopenDialogVisible.set(false);
        this.syncLead(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.reopened') });
      },
      error: (err: HttpErrorResponse) => {
        this.reopening.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.reopenError') });
      },
    });
  }

  confirmDeleteLead(lead: Lead): void {
    this.confirmationService.confirm({
      message: this.translate.instant('leads.deleteConfirm', { name: lead.name }),
      header: this.translate.instant('leads.deleteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteLead(lead),
    });
  }

  private deleteLead(lead: Lead): void {
    this.leadService.delete(lead.id).subscribe({
      next: () => {
        this.dialogVisible.set(false);
        if (this.interactionsLead()?.id === lead.id) this.interactionsDrawerVisible.set(false);
        this.rows.set(this.rows().filter(l => l.id !== lead.id));
        this.messageService.add({ severity: 'success', summary: this.translate.instant('leads.deleted') });
      },
      error: (err: HttpErrorResponse) => {
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'leads.errors', 'leads.deleteError') });
      },
    });
  }

  private toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private businessError(err: HttpErrorResponse, scope: string, fallbackKey: string): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `${scope}.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant(fallbackKey);
  }
}