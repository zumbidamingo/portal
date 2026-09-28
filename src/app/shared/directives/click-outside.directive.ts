import { Directive, ElementRef, EventEmitter, HostListener, Output, inject } from '@angular/core';

@Directive({ selector: '[appClickOutside]', standalone: true })
export class ClickOutsideDirective {
  private el = inject(ElementRef);
  @Output() appClickOutside = new EventEmitter<void>();

  @HostListener('document:click', ['$event.target'])
  onClick(target: EventTarget | null): void {
    if (target && !this.el.nativeElement.contains(target)) {
      this.appClickOutside.emit();
    }
  }
}
