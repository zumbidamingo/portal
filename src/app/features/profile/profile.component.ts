import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { PanelModule } from 'primeng/panel';
import { FileUploadModule } from 'primeng/fileupload';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { UploadService } from '../../core/services/upload.service';
import { LocaleService, SupportedLocale } from '../../core/services/locale.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DeleteAccountComponent } from '../../shared/components/delete-account/delete-account.component';

/**
 * "Meu Perfil" — acessível só pelo menu do utilizador na topbar. Mostra exclusivamente dados e
 * preferências da conta autenticada (nome, foto, palavra-passe, idioma, exclusão de conta — esta só para perfis que não são OWNER: para o dono apaga a empresa e vive em Administração).
 * Configuração da empresa/tenant não entra aqui — isso vive em Administração
 * (`AdministrationComponent` e as páginas sob `/administration/*`), mesmo para o OWNER.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TranslatePipe,
    ButtonModule, InputTextModule, PasswordModule, SelectModule, PanelModule,
    FileUploadModule, PageHeaderComponent, DeleteAccountComponent],
  template: `
    <div class="max-w-2xl space-y-6">
      <app-page-header [title]="'nav.myProfile' | translate" [description]="'profile.subtitlePersonal' | translate"></app-page-header>

      <p-panel [header]="'profile.photo' | translate">
        <div class="flex items-center gap-6">
          <div class="w-24 h-24 bg-app-accent-soft rounded-2xl flex items-center justify-center text-app-text text-3xl font-medium flex-shrink-0 bg-cover bg-center"
               [style.background-image]="auth.avatarBlobUrl() ? 'url(' + auth.avatarBlobUrl() + ')' : null">
            @if (!auth.avatarBlobUrl()) { {{ auth.currentUser()?.name?.charAt(0) }} }
          </div>
          <div>
            <p-fileUpload mode="basic" name="photo" accept="image/*" [maxFileSize]="5000000"
                         [chooseLabel]="'profile.changePhoto' | translate"
                         (onSelect)="onPhotoUpload($event)"></p-fileUpload>
            <p class="text-xs text-app-text-tertiary mt-1">JPG, PNG até 5MB</p>
          </div>
        </div>
      </p-panel>

      <p-panel [header]="'profile.personalInfo' | translate">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="label">{{ 'common.name' | translate }} *</label>
              <input pInputText formControlName="name" fluid />
              @if (form.get('name')?.invalid && form.get('name')?.touched) {
                <small class="text-app-danger">{{ 'errors.required' | translate }}</small>
              }
            </div>
            <div>
              <label class="label">{{ 'common.email' | translate }}</label>
              <input pInputText formControlName="email" type="email" class="w-full bg-app-surface text-app-text-tertiary cursor-not-allowed"
                     [readonly]="true" />
              <small class="text-app-text-tertiary">{{ 'profile.emailReadonly' | translate }}</small>
            </div>
          </div>
          <div class="flex justify-end">
            <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                      [loading]="saving()" [disabled]="form.invalid"></p-button>
          </div>
        </form>
      </p-panel>

      @if (isLocalAuth()) {
      <p-panel [header]="'settings.changePassword' | translate">
        <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="space-y-4">
          <div>
            <label class="label">{{ 'settings.currentPassword' | translate }}</label>
            <p-password formControlName="currentPassword" [feedback]="false" [toggleMask]="true" fluid inputStyleClass="w-full"></p-password>
          </div>
          <div>
            <label class="label">{{ 'auth.newPassword' | translate }}</label>
            <p-password formControlName="newPassword" [toggleMask]="true" fluid inputStyleClass="w-full"></p-password>
          </div>
          <div>
            <label class="label">{{ 'settings.confirmNewPassword' | translate }}</label>
            <p-password formControlName="confirmPassword" [feedback]="false" [toggleMask]="true" fluid inputStyleClass="w-full"></p-password>
            @if (passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.dirty) {
              <small class="text-app-danger">{{ 'errors.passwordMismatch' | translate }}</small>
            }
          </div>
          <div class="flex justify-end">
            <p-button type="submit" [label]="'settings.changePassword' | translate" icon="pi pi-lock"
                      [loading]="savingPassword()" [disabled]="passwordForm.invalid"></p-button>
          </div>
        </form>
      </p-panel>
      }

      <p-panel [header]="'settings.language' | translate">
        <div class="flex items-center gap-4">
          <p-select [options]="languages" [(ngModel)]="selectedLanguage" [ngModelOptions]="{standalone: true}"
                    optionLabel="label" optionValue="value" styleClass="w-48"></p-select>
          <p-button [label]="'settings.apply' | translate" icon="pi pi-globe" [loading]="savingLang()" (click)="applyLanguage()"></p-button>
        </div>
      </p-panel>

      @if (!isOwner()) {
        <app-delete-account></app-delete-account>
      }
    </div>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `]
})
export class ProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  auth = inject(AuthService);
  private uploadService = inject(UploadService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private http = inject(HttpClient);
  private langService = inject(LocaleService);

  saving = signal(false);

  isOwner = computed(() => this.auth.userRole() === 'OWNER');

  form = this.fb.group({
    name: ['', Validators.required],
    email: [{ value: '', disabled: true }],
  });

  // ---- Change password ----
  savingPassword = signal(false);
  isLocalAuth = computed(() => (this.auth.currentUser()?.authProvider ?? 'LOCAL') === 'LOCAL');
  passwordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: this.passwordMatchValidator });

  // ---- Language ----
  savingLang = signal(false);
  selectedLanguage: SupportedLocale = 'pt-BR';
  languages: { label: string; value: SupportedLocale }[] = [
    { label: 'Português (Brasil)', value: 'pt-BR' },
    { label: 'Português (Portugal)', value: 'pt-PT' },
    { label: 'English', value: 'en' },
  ];

  ngOnInit() {
    const user = this.auth.currentUser();
    if (user) {
      // Só o nome pessoal: sem firstName/lastName o campo fica vazio em vez de herdar o email.
      const personal = [user.firstName, user.lastName].filter(Boolean).join(' ');
      this.form.patchValue({ name: personal, email: user.email });
    }
    this.selectedLanguage = this.langService.normalize(user?.locale) ?? this.langService.getStored();
  }

  save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const { name } = this.form.value;
    const [firstName, ...rest] = (name ?? '').trim().split(' ');

    this.auth.updateProfile({
      firstName,
      lastName: rest.join(' ') || undefined,
      email: this.auth.currentUser()!.email,
      avatarUrl: undefined,
    }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('profile.saved') });
        this.saving.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('profile.saveError') });
        this.saving.set(false);
      }
    });
  }

  onPhotoUpload(event: any) {
    const file: File = event.files?.[0];
    if (!file) return;
    this.uploadService.uploadAvatar(file).subscribe({
      next: () => {
        this.auth.getCurrentUser().subscribe();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('profile.photoUploaded') });
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('profile.photoError') })
    });
  }

  changePassword() {
    if (!this.isLocalAuth() || this.passwordForm.invalid) return;
    this.savingPassword.set(true);
    const { currentPassword, newPassword } = this.passwordForm.value;
    this.http.put(`${environment.apiUrl}/auth/me/password`, { currentPassword, newPassword }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('settings.passwordChanged') });
        this.passwordForm.reset();
        this.savingPassword.set(false);
      },
      error: (err) => {
        const msg = err.status === 400 ? this.translate.instant('settings.wrongPassword') : this.translate.instant('settings.passwordError');
        this.messageService.add({ severity: 'error', summary: msg });
        this.savingPassword.set(false);
      }
    });
  }

  applyLanguage() {
    this.savingLang.set(true);
    const user = this.auth.currentUser();
    if (!user) { this.savingLang.set(false); return; }

    this.auth.updateProfile({
      // Reenvia a identidade tal como está; sem nome pessoal, o email preenche o campo obrigatório.
      firstName: user.firstName || user.email,
      lastName: user.lastName || undefined,
      email: user.email,
      locale: this.selectedLanguage,
    }).subscribe({
      next: () => {
        this.langService.setLocale(this.selectedLanguage);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('settings.langChanged') });
        this.savingLang.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('settings.langError') });
        this.savingLang.set(false);
      }
    });
  }

  private passwordMatchValidator(g: any) {
    return g.get('newPassword').value === g.get('confirmPassword').value
      ? null : { mismatch: true };
  }
}
