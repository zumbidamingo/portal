import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';

/**
 * Shared "required intro message" dialog — used by both the apply-to-job
 * and send-invitation flows so the platform has one implementation instead
 * of duplicating the prompt per flow.
 */
@Component({
  selector: 'app-message-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogModule, ButtonModule, TextareaModule],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="onVisibleChange($event)"
              [modal]="true" [closable]="true" [dismissableMask]="true"
              [header]="header | translate" [style]="{width: '440px'}">
      <div class="space-y-3 py-2">
        @if (description) {
          <p class="text-sm text-app-text-secondary">{{ description | translate }}</p>
        }
        <textarea pTextarea [(ngModel)]="message" rows="4" maxlength="1000"
                  [placeholder]="placeholder | translate" fluid></textarea>
        <div class="flex justify-end gap-2 pt-1">
          <p-button [label]="'common.cancel' | translate" [text]="true" (click)="onCancel()"></p-button>
          <p-button [label]="submitLabel | translate" icon="pi pi-send"
                    [loading]="loading" [disabled]="!message.trim()"
                    (click)="onSubmit()"></p-button>
        </div>
      </div>
    </p-dialog>
  `
})
export class MessageDialogComponent {
  @Input() visible = false;
  @Input() header = '';
  @Input() description = '';
  @Input() placeholder = '';
  @Input() submitLabel = 'common.send';
  @Input() loading = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() messageSubmit = new EventEmitter<string>();
  @Output() dialogCancel = new EventEmitter<void>();

  message = '';

  onVisibleChange(value: boolean) {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  onCancel() {
    this.onVisibleChange(false);
    this.dialogCancel.emit();
  }

  onSubmit() {
    const trimmed = this.message.trim();
    if (!trimmed) return;
    this.messageSubmit.emit(trimmed);
  }

  reset() {
    this.message = '';
  }
}
