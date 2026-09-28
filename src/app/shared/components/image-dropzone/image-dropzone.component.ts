import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FileUploadModule, FileUpload, FileSelectEvent } from 'primeng/fileupload';
import { ImageModule } from 'primeng/image';

export interface ImageDropzoneItem {
  id: string;
  url: string;
}

/**
 * Dropzone de imagens reutilizável — miniaturas das já existentes + arrastar/soltar ou
 * seleção convencional para novas, mesmo padrão visual do `p-fileUpload` avançado usado na
 * importação de clientes por CSV ({@code CustomersComponent}): header/lista padrão escondidos
 * via `pt`, dropzone própria no template `#empty`.
 *
 * Componente burro de propósito — não sabe fazer upload nem excluir. Emite `filesSelected` com
 * os ficheiros escolhidos e `imageRemove` com o id de uma miniatura; quem usa decide como (e se)
 * confirma a remoção e chama o serviço.
 */
@Component({
  selector: 'app-image-dropzone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, FileUploadModule, ImageModule],
  template: `
    <div class="space-y-3">
      @if (images().length) {
        <div class="flex flex-wrap gap-2">
          @for (img of images(); track img.id) {
            <div class="relative group w-20 h-20">
              <p-image [src]="img.url" [preview]="true" appendTo="body"
                       [imageClass]="'w-20 h-20 object-cover rounded border border-app-border'"
                       class="block"></p-image>
              @if (removable() && !disabled()) {
                <button type="button"
                        class="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded-full
                               bg-app-danger text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        [attr.aria-label]="'imageDropzone.remove' | translate"
                        (click)="$event.stopPropagation(); imageRemove.emit(img.id)">
                  <i class="pi pi-times text-[10px]" aria-hidden="true"></i>
                </button>
              }
            </div>
          }
        </div>
      }

      <p-fileUpload #fu mode="advanced" [name]="fieldName()" [multiple]="multiple()" [accept]="accept()"
                    [maxFileSize]="maxFileSizeBytes() ?? undefined" [disabled]="disabled() || uploading()"
                    (onSelect)="onSelect($event, fu)"
                    [pt]="{ root: { class: 'border-0! bg-transparent! p-0!' },
                            header: { class: 'hidden!' },
                            content: { class: dropzoneContentClass() } }">
        <ng-template #empty>
          <div class="flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center"
               [class.cursor-pointer]="!disabled() && !uploading()"
               (click)="!disabled() && !uploading() && fu.choose()">
            <i class="text-2xl text-app-text-tertiary pi" [class.pi-spin]="uploading()"
               [class.pi-spinner]="uploading()" [class.pi-cloud-upload]="!uploading()" aria-hidden="true"></i>
            <p class="text-sm text-app-text">
              {{ (uploading() ? 'imageDropzone.uploading' : 'imageDropzone.dragHint') | translate }}
            </p>
            @if (!uploading()) {
              <p class="text-xs text-app-text-tertiary">
                {{ 'common.or' | translate }} <span class="text-app-accent-hover underline">{{ 'imageDropzone.choose' | translate }}</span>
              </p>
            }
          </div>
        </ng-template>
        <ng-template #content let-messages="messages">
          @if (messages?.length) {
            <div class="flex flex-col gap-1 px-4 py-2">
              @for (msg of messages; track $index) {
                <small class="text-app-danger text-xs">{{ msg.text }}</small>
              }
            </div>
          }
        </ng-template>
      </p-fileUpload>
    </div>
  `,
})
export class ImageDropzoneComponent implements AfterViewInit {
  /** Miniaturas já persistidas (id + url assinada). */
  images = input<ImageDropzoneItem[]>([]);
  /** Mostra o botão de remover sobre cada miniatura existente. */
  removable = input(true);
  multiple = input(true);
  accept = input('image/*');
  maxFileSizeBytes = input<number | null>(null);
  fieldName = input('file');
  disabled = input(false);
  /** Upload em curso, controlado por quem usa — troca o hint por spinner e bloqueia nova seleção. */
  uploading = input(false);

  /** Ficheiros escolhidos (drag&drop ou seleção). Componente não faz upload — quem usa chama o serviço. */
  filesSelected = output<File[]>();
  /** Id da miniatura cujo "remover" foi clicado — quem usa decide confirmar e excluir. */
  imageRemove = output<string>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dragging = signal(false);

  /** PrimeNG chama {@code stopPropagation()} no próprio `dragenter` do dropzone interno
   *  (`FileUpload#onDragEnter`), então um listener normal (fase de bolha) neste componente nunca
   *  recebe o evento. Fase de captura corre antes disso — o listener aqui dispara sempre, não
   *  importa o que o filho faça depois. Contador em vez de um simples boolean porque mover o
   *  cursor entre o ícone e o texto dentro da zona dispara `dragleave`+`dragenter` do par — sem
   *  contar quantos "dentro" ainda estão abertos, o destaque piscaria a cada elemento cruzado. */
  private dragCounter = 0;

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    const onEnter = (e: DragEvent) => { e.preventDefault(); this.dragCounter++; this.dragging.set(true); };
    const onLeave = () => { this.dragCounter = Math.max(0, this.dragCounter - 1); this.dragging.set(this.dragCounter > 0); };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = () => { this.dragCounter = 0; this.dragging.set(false); };

    host.addEventListener('dragenter', onEnter, true);
    host.addEventListener('dragleave', onLeave, true);
    host.addEventListener('dragover', onOver, true);
    host.addEventListener('drop', onDrop, true);

    this.destroyRef.onDestroy(() => {
      host.removeEventListener('dragenter', onEnter, true);
      host.removeEventListener('dragleave', onLeave, true);
      host.removeEventListener('dragover', onOver, true);
      host.removeEventListener('drop', onDrop, true);
    });
  }

  protected readonly dropzoneContentClass = computed(() =>
    `border-2! rounded-md! p-0! transition-colors! ${
      this.dragging() ? 'border-app-accent! bg-app-accent-soft!' : 'border-dashed! border-app-border!'
    }`);

  protected onSelect(event: FileSelectEvent, fu: FileUpload): void {
    this.dragging.set(false);
    // event.files é tipado como File[] mas em runtime é o FileList nativo do dataTransfer/input
    // (sem .map/.forEach) — Array.from normaliza pro tipo real que este output promete emitir.
    const files = Array.from(event.files);
    if (files.length) {
      this.filesSelected.emit(files);
    }
    fu.clear();
  }
}
