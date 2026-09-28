import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw = control.get('newPassword')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
}

/** Ecrã forçado — sem "voltar", sem link pra login — pra quem tem troca de senha obrigatória
 *  pendente (técnico recém-criado com senha padrão da empresa, ou conta resetada por um
 *  administrador). Reaproveita o padrão visual de reset-password, mas sem token de URL: a
 *  identidade já vem do JWT da sessão atual. */
@Component({
  selector: 'app-change-initial-password',
  standalone: true,
  providers: [MessageService],
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, PasswordModule, ToastModule],
  template: `
    <p-toast position="top-right"></p-toast>

    <div class="min-h-screen flex items-center justify-center p-4 bg-app-surface">
      <div class="bg-app-bg border border-app-border rounded-xl w-full max-w-md p-8 lg:p-10">
        <div class="text-center mb-8">
          <div class="w-12 h-12 bg-app-accent-soft rounded-xl flex items-center justify-center mx-auto mb-4">
            <i class="pi pi-key text-app-accent-hover text-xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-app-text">{{ 'auth.changeInitialPasswordTitle' | translate }}</h2>
          <p class="text-app-text-secondary text-sm mt-1.5">{{ 'auth.changeInitialPasswordSubtitle' | translate }}</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.newPassword' | translate }}</label>
            <p-password formControlName="newPassword" [feedback]="true" [toggleMask]="true"
                        fluid inputStyleClass="w-full"
                        [placeholder]="'auth.newPassword' | translate"
                        [class.p-invalid]="form.get('newPassword')?.invalid && form.get('newPassword')?.touched">
            </p-password>
            @if (form.get('newPassword')?.errors?.['minlength'] && form.get('newPassword')?.touched) {
              <small class="text-app-danger text-xs mt-1 block">{{ 'errors.minLength' | translate: { min: 8 } }}</small>
            }
          </div>

          <div>
            <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.confirmPassword' | translate }}</label>
            <p-password formControlName="confirmPassword" [feedback]="false" [toggleMask]="true"
                        fluid inputStyleClass="w-full"
                        [placeholder]="'auth.confirmPassword' | translate"
                        [class.p-invalid]="form.errors?.['passwordMismatch'] && form.get('confirmPassword')?.touched">
            </p-password>
            @if (form.errors?.['passwordMismatch'] && form.get('confirmPassword')?.touched) {
              <small class="text-app-danger text-xs mt-1 block">{{ 'errors.passwordMismatch' | translate }}</small>
            }
          </div>

          <p-button type="submit" [label]="'auth.changeInitialPasswordSubmit' | translate" fluid
                    [loading]="loading()" [disabled]="form.invalid"></p-button>
        </form>
      </div>
    </div>
  `
})
export class ChangeInitialPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  loading = signal(false);

  form = this.fb.group({
    newPassword:     ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  }, { validators: passwordsMatch });

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.auth.changeInitialPassword(this.form.value.newPassword!).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.changeInitialPasswordError') });
      }
    });
  }
}
